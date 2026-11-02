// ==============================================================================
// CONTROLLER: PHÂN TÍCH CHỈ SỐ AIOPS TOÀN MẠNG & TRUY VẤN BÁN KÍNH KHÔNG GIAN
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Nguyễn Ngọc Duy (Tech Lead & Core Full-stack Developer)
// ==============================================================================

// Nạp module kết nối CSDL PostgreSQL + PostGIS qua Connection Pool
const db = require('../config/dbConfig');

/**
 * ==============================================================================
 * CHỨC NĂNG 1: TÍNH TOÁN CHỈ SỐ SỨC KHỎE TỔNG THỂ MẠNG VIỄN THÔNG (NETWORK HEALTH)
 * ==============================================================================
 * Tuyến đường (Route): GET /api/analytics/network-health
 * Nghiệp vụ (Business Logic):
 * - Đếm tổng số trạm phát sóng đang vận hành trong cơ sở dữ liệu.
 * - Phân loại số lượng trạm theo 3 cấp độ rủi ro: An toàn (LOW), Cảnh báo (MEDIUM), Nguy cơ cao (HIGH).
 * - Tính toán giá trị trung bình toàn mạng của các KPI viễn thông trọng yếu:
 *   + Độ trễ trung bình (Average Latency - ms)
 *   + Tỷ lệ mất gói trung bình (Average Packet Loss Rate - %)
 *   + Thông lượng mạng trung bình (Average Throughput - Mbps)
 * - Tự động đưa ra kết luận trạng thái vận hành của hệ thống:
 *   + 'WARNING': Khi xuất hiện bất kỳ trạm nào ở mức rủi ro cao (HIGH) cần kỹ sư NOC can thiệp.
 *   + 'STABLE': Khi toàn bộ trạm ở mức an toàn hoặc cảnh báo nhẹ.
 */
const getNetworkHealth = async (req, res) => {
    try {
        // Câu lệnh SQL tổng hợp (Aggregation Query) tối ưu hóa chỉ với 1 lần quét bảng:
        const query = `
            SELECT 
                COUNT(*) AS total_stations,
                COUNT(*) FILTER (WHERE risk_level = 'LOW') AS safe_stations,
                COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS warning_stations,
                COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high_risk_stations,
                COALESCE(ROUND(AVG(latency_ms)::numeric, 2), 0) AS avg_latency_ms,
                COALESCE(ROUND(AVG(packet_loss_rate)::numeric, 2), 0) AS avg_packet_loss_rate,
                COALESCE(ROUND(AVG(throughput_mbps)::numeric, 2), 0) AS avg_throughput_mbps,
                CASE 
                    WHEN COUNT(*) FILTER (WHERE risk_level = 'HIGH') > 0 THEN 'WARNING'
                    ELSE 'STABLE'
                END AS system_status,
                NOW() AS evaluated_at
            FROM stations;
        `;

        const result = await db.query(query);

        // Trả về cấu trúc JSON chuẩn mực cho Frontend Dashboard hiển thị
        return res.status(200).json({
            status: 'success',
            message: 'Phân tích chỉ số sức khỏe mạng viễn thông thành công',
            data: result.rows[0]
        });

    } catch (error) {
        // Bắt lỗi kết nối database hoặc lỗi truy vấn SQL
        console.error('❌ [Lỗi getNetworkHealth]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi phân tích sức khỏe mạng',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 2: TRUY VẤN CÁC TRẠM TRONG BÁN KÍNH KHÔNG GIAN POSTGIS (SPATIAL RADIUS)
 * ==============================================================================
 * Tuyến đường (Route): GET /api/analytics/nearby?lat=10.8018&lng=106.7114&radius=3000
 * Tham số truyền vào (Query Parameters):
 * - lat (Vĩ độ - Latitude): Tọa độ điểm trung tâm cần quét.
 * - lng (Kinh độ - Longitude): Tọa độ điểm trung tâm cần quét.
 * - radius (Bán kính tìm kiếm - mét): Mặc định là 3000m (3km) nếu không truyền.
 * Nghiệp vụ (Business Logic):
 * - Khi kỹ sư NOC phát hiện một điểm sự cố hoặc khu vực tổ chức sự kiện đông người,
 *   API này sẽ quét toàn bộ các trạm phát sóng xung quanh trong phạm vi bán kính chỉ định.
 * - Sử dụng hàm PostGIS ST_DWithin với kiểu dữ liệu Geography để tính khoảng cách hình cầu chính xác trên Trái Đất (WGS 84).
 * - Sắp xếp kết quả theo khoảng cách từ gần đến xa (distance_meters ASC).
 */
const getStationsNearby = async (req, res) => {
    try {
        const { lat, lng, radius = 3000 } = req.query;

        // Kiểm tra hợp lệ dữ liệu đầu vào (Input Validation)
        if (!lat || !lng) {
            return res.status(400).json({
                status: 'error',
                message: 'Vui lòng cung cấp đầy đủ tham số tọa độ: lat (vĩ độ) và lng (kinh độ)'
            });
        }

        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);
        const searchRadiusMeters = parseFloat(radius);

        if (isNaN(centerLat) || isNaN(centerLng) || isNaN(searchRadiusMeters)) {
            return res.status(400).json({
                status: 'error',
                message: 'Tham số lat, lng và radius phải là định dạng số hợp lệ'
            });
        }

        // Câu truy vấn không gian đặc thù PostGIS:
        // - ST_MakePoint(kinh độ, vĩ độ): Tạo điểm không gian theo chuẩn WGS 84 (EPSG 4326).
        // - ST_SetSRID(..., 4326): Gán hệ quy chiếu tọa độ địa lý thế giới.
        // - ST_DWithin(geom::geography, ..., bán kính): Kiểm tra trạm có nằm trong phạm vi mét chỉ định hay không.
        // - ST_Distance(..., ...): Tính chính xác khoảng cách từ tâm đến trạm tính bằng mét.
        const query = `
            SELECT 
                id,
                station_code,
                station_name,
                province,
                latitude,
                longitude,
                latency_ms,
                packet_loss_rate,
                throughput_mbps,
                risk_level,
                is_anomaly,
                ROUND(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)::numeric, 1) AS distance_meters
            FROM stations
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
            ORDER BY distance_meters ASC;
        `;

        const values = [centerLng, centerLat, searchRadiusMeters];
        const result = await db.query(query, values);

        return res.status(200).json({
            status: 'success',
            message: `Tìm thấy ${result.rowCount} trạm phát sóng trong bán kính ${searchRadiusMeters} mét`,
            center_point: {
                latitude: centerLat,
                longitude: centerLng
            },
            radius_meters: searchRadiusMeters,
            total_found: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ [Lỗi getStationsNearby]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn không gian PostGIS khi tìm kiếm trạm lân cận',
            details: error.message
        });
    }
};

// Xuất các hàm điều khiển để router sử dụng
module.exports = {
    getNetworkHealth,
    getStationsNearby
};
