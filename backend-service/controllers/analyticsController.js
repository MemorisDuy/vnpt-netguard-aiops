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
        // Bat loi ket noi database hoac loi truy van SQL
        console.error('[ANALYTICS ERROR getNetworkHealth]:', error.message);
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
        console.error('[ANALYTICS ERROR getStationsNearby]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn không gian PostGIS khi tìm kiếm trạm lân cận',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 3: DỰ BÁO NGUY CƠ SUY GIẢM MẠNG QUA AI GATEWAY (FASTAPI INTEGRATION)
 * ==============================================================================
 * Tuyến đường (Route): POST /api/analytics/predict-risk
 * Tham số đầu vào (JSON Body):
 * - latency_ms: Độ trễ mạng (mili giây)
 * - packet_loss_rate: Tỷ lệ mất gói tin (%)
 * - jitter_ms: Độ dao động độ trễ (mili giây)
 * - throughput_mbps: Tốc độ truyền tải dữ liệu (Mbps)
 * Nghiệp vụ (Business Logic):
 * - Xác thực các tham số kỹ thuật đầu vào.
 * - Đóng vai trò API Gateway kết nối sang microservice ai-service (FastAPI cổng 8000).
 * - Nhận kết quả dự báo từ mô hình XGBoost: is_anomaly, risk_level, confidence.
 * - Bổ sung thông tin phân loại tiếng Việt và khuyến nghị kỹ thuật vận hành mạng (NOC).
 * - Tích hợp cơ chế dự phòng (Fallback Rule-based) khi dịch vụ AI tạm ngắt kết nối.
 */
const predictRisk = async (req, res) => {
    try {
        const { latency_ms, packet_loss_rate, jitter_ms, throughput_mbps } = req.body;

        // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào (Validation)
        if (
            latency_ms === undefined ||
            packet_loss_rate === undefined ||
            jitter_ms === undefined ||
            throughput_mbps === undefined
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Vui lòng cung cấp đầy đủ 4 chỉ số KPI: latency_ms, packet_loss_rate, jitter_ms, throughput_mbps'
            });
        }

        const latVal = parseFloat(latency_ms);
        const lossVal = parseFloat(packet_loss_rate);
        const jitterVal = parseFloat(jitter_ms);
        const tpVal = parseFloat(throughput_mbps);

        if (isNaN(latVal) || isNaN(lossVal) || isNaN(jitterVal) || isNaN(tpVal)) {
            return res.status(400).json({
                status: 'error',
                message: 'Tất cả các chỉ số KPI phải là định dạng số hợp lệ'
            });
        }

        if (latVal <= 0 || lossVal < 0 || lossVal > 100 || jitterVal < 0 || tpVal < 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Chỉ số KPI nằm ngoài giới hạn cho phép (latency > 0, 0 <= packet_loss <= 100, jitter >= 0, throughput >= 0)'
            });
        }

        const payload = {
            latency_ms: latVal,
            packet_loss_rate: lossVal,
            jitter_ms: jitterVal,
            throughput_mbps: tpVal
        };

        const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
        let aiResult = null;
        let dataSource = 'XGBoost_Model_FastAPI';

        try {
            // Thiết lập gọi API sang AI Service với thời gian chờ tối đa 3000ms
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const aiResponse = await fetch(`${aiServiceUrl}/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (aiResponse.ok) {
                aiResult = await aiResponse.json();
            } else {
                throw new Error(`AI Service trả về mã trạng thái ${aiResponse.status}`);
            }
        } catch (callError) {
            // Khi AI Service tạm thời ngoại tuyến, áp dụng luật suy luận dự phòng (Fallback Rule-based)
            dataSource = 'Fallback_Heuristic_Rule';
            const isHighRisk = lossVal >= 3.0 || latVal >= 60.0;
            const isMediumRisk = lossVal >= 1.0 || latVal >= 40.0;

            const fallbackLevel = isHighRisk ? 'HIGH' : (isMediumRisk ? 'MEDIUM' : 'LOW');
            const fallbackConfidence = isHighRisk ? 0.85 : (isMediumRisk ? 0.55 : 0.15);

            aiResult = {
                status: 'success',
                is_anomaly: isHighRisk,
                risk_level: fallbackLevel,
                confidence: fallbackConfidence
            };
        }

        // 2. Chuyển đổi nhãn tiếng Việt và khuyến nghị kỹ thuật NOC
        let riskLevelVn = 'An toàn';
        let recommendation = 'Chất lượng mạng ổn định, duy trì cấu hình hiện tại.';

        if (aiResult.risk_level === 'HIGH') {
            riskLevelVn = 'Nguy cơ suy giảm cao';
            recommendation = 'Ưu tiên kiểm tra phân bổ băng thông, giảm tải vô tuyến và kiểm tra đường truyền truyền dẫn.';
        } else if (aiResult.risk_level === 'MEDIUM') {
            riskLevelVn = 'Cần theo dõi';
            recommendation = 'Theo dõi các biến động KPI trong chu kỳ tiếp theo, chuẩn bị phương án điều chỉnh công suất phát.';
        }

        return res.status(200).json({
            status: 'success',
            message: 'Dự báo nguy cơ suy giảm chất lượng mạng thành công',
            data_source: dataSource,
            input_kpi: payload,
            prediction: {
                is_anomaly: aiResult.is_anomaly,
                risk_level: aiResult.risk_level,
                risk_level_vn: riskLevelVn,
                confidence: aiResult.confidence,
                confidence_percent: `${(aiResult.confidence * 100).toFixed(1)}%`,
                recommendation: recommendation
            },
            evaluated_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('[ANALYTICS ERROR predictRisk]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Đã xảy ra lỗi trong quá trình dự báo nguy cơ mạng',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 4: DANH SÁCH TOP TRẠM NGUY CƠ CAO NHẤT CẦN XỬ LÝ KHẨN CẤP
 * ==============================================================================
 * Tuyến đường (Route): GET /api/analytics/top-risk?limit=5
 * Nghiệp vụ (Business Logic):
 * - Sắp xếp trạm phát sóng theo thứ tự ưu tiên xử lý sự cố mạng:
 *   1. Mức rủi ro: HIGH (ưu tiên 1), MEDIUM (ưu tiên 2), LOW (ưu tiên 3).
 *   2. Tỷ lệ mất gói tin (packet_loss_rate) giảm dần.
 *   3. Độ trễ (latency_ms) giảm dần.
 * - Phục vụ hiển thị trên bảng cảnh báo khẩn cấp (Emergency Alert Panel) của trung tâm điều hành NOC.
 */
const getTopRiskStations = async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const safeLimit = (isNaN(parsedLimit) || parsedLimit <= 0) ? 5 : Math.min(parsedLimit, 50);

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
                jitter_ms,
                throughput_mbps,
                risk_level,
                is_anomaly,
                updated_at
            FROM stations
            ORDER BY 
                CASE 
                    WHEN risk_level = 'HIGH' THEN 1
                    WHEN risk_level = 'MEDIUM' THEN 2
                    ELSE 3
                END ASC,
                packet_loss_rate DESC,
                latency_ms DESC
            LIMIT $1;
        `;

        const result = await db.query(query, [safeLimit]);

        return res.status(200).json({
            status: 'success',
            message: `Lấy danh sách top ${result.rowCount} trạm viễn thông có nguy cơ cao nhất thành công`,
            total_returned: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('[ANALYTICS ERROR getTopRiskStations]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi lấy danh sách trạm nguy cơ cao',
            details: error.message
        });
    }
};

// Xuất các hàm điều khiển để router sử dụng
module.exports = {
    getNetworkHealth,
    getStationsNearby,
    predictRisk,
    getTopRiskStations
};
