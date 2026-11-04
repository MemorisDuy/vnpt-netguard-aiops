// ==============================================================================
// CONTROLLER: XỬ LÝ DỮ LIỆU KHÔNG GIAN ĐỊA LÝ POSTGIS (GEOJSON)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Ngọc Lân (Full-stack API Không gian - PostGIS)
// ==============================================================================

// Nạp module kết nối CSDL PostgreSQL + PostGIS qua Connection Pool
const db = require('../config/dbConfig');

// Danh sách các mức độ rủi ro hợp lệ theo thiết kế CSDL (init.sql)
const VALID_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * ==============================================================================
 * CHỨC NĂNG: CHUYỂN ĐỔI TỌA ĐỘ TRẠM PHÁT SÓNG SANG ĐỊNH DẠNG CHUẨN GEOJSON
 * ==============================================================================
 * Tuyến đường (Route): GET /api/spatial/stations-geojson
 * Tham số truy vấn tùy chọn (Optional Query Parameters):
 * - risk_level: Lọc theo mức độ rủi ro ('LOW', 'MEDIUM', 'HIGH')
 * - province: Lọc theo tỉnh / thành phố (tìm kiếm gần đúng không phân biệt hoa thường)
 * - is_anomaly: Lọc theo cờ cảnh báo bất thường AI ('true' hoặc 'false')
 *
 * Nghiệp vụ (Business Logic):
 * - Sử dụng hàm không gian đặc thù PostGIS `ST_AsGeoJSON` để chuyển đổi cột hình học
 *   `geom` (GEOMETRY Point, hệ quy chiếu WGS 84 - EPSG:4326) sang đối tượng GeoJSON Geometry.
 * - Trường hợp bản ghi chưa có `geom`, tự động dự phòng (fallback) tạo điểm không gian
 *   từ `longitude` và `latitude` qua `ST_SetSRID(ST_MakePoint(...), 4326)`.
 * - Đóng gói toàn bộ danh sách trạm và các chỉ số KPI mạng viễn thông (latency, packet loss,
 *   jitter, throughput, risk_level, is_anomaly) thành cấu trúc `FeatureCollection` chuẩn RFC 7946
 *   để Frontend WebGIS (Leaflet / HeatmapLayer) render trực tiếp lên bản đồ số.
 */
const getStationsGeoJSON = async (req, res) => {
    try {
        const { risk_level, province, is_anomaly } = req.query;

        const conditions = [];
        const values = [];

        // 1. Kiểm tra và áp dụng bộ lọc mức độ rủi ro (nếu có)
        if (risk_level !== undefined && risk_level !== '') {
            const normalizedRisk = String(risk_level).trim().toUpperCase();
            if (!VALID_RISK_LEVELS.includes(normalizedRisk)) {
                return res.status(400).json({
                    status: 'error',
                    message: `Tham số risk_level không hợp lệ. Chỉ chấp nhận: ${VALID_RISK_LEVELS.join(', ')}`
                });
            }
            values.push(normalizedRisk);
            conditions.push(`UPPER(risk_level) = $${values.length}`);
        }

        // 2. Kiểm tra và áp dụng bộ lọc tỉnh/thành phố (nếu có)
        if (province !== undefined && String(province).trim() !== '') {
            values.push(`%${String(province).trim()}%`);
            conditions.push(`province ILIKE $${values.length}`);
        }

        // 3. Kiểm tra và áp dụng bộ lọc trạng thái bất thường AI (nếu có)
        if (is_anomaly !== undefined && is_anomaly !== '') {
            const normalizedAnomaly = String(is_anomaly).trim().toLowerCase();
            if (normalizedAnomaly !== 'true' && normalizedAnomaly !== 'false') {
                return res.status(400).json({
                    status: 'error',
                    message: 'Tham số is_anomaly chỉ chấp nhận giá trị boolean: true hoặc false'
                });
            }
            values.push(normalizedAnomaly === 'true');
            conditions.push(`is_anomaly = $${values.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Câu truy vấn không gian PostGIS chuyển đổi tọa độ trạm sang chuẩn GeoJSON Geometry
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
                updated_at,
                ST_AsGeoJSON(
                    COALESCE(geom, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))
                )::json AS geometry
            FROM stations
            ${whereClause}
            ORDER BY id ASC;
        `;

        const result = await db.query(query, values);

        // Chuẩn hóa kết quả theo cấu trúc GeoJSON FeatureCollection (RFC 7946)
        const features = result.rows.map((row) => ({
            type: 'Feature',
            id: row.id,
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                id: row.id,
                station_code: row.station_code,
                station_name: row.station_name,
                province: row.province,
                latitude: row.latitude,
                longitude: row.longitude,
                latency_ms: row.latency_ms,
                packet_loss_rate: row.packet_loss_rate,
                jitter_ms: row.jitter_ms,
                throughput_mbps: row.throughput_mbps,
                risk_level: row.risk_level,
                is_anomaly: row.is_anomaly,
                updated_at: row.updated_at
            }
        }));

        const geojsonFeatureCollection = {
            type: 'FeatureCollection',
            features
        };

        return res.status(200).json({
            status: 'success',
            message: `Chuyển đổi tọa độ ${features.length} trạm phát sóng sang chuẩn GeoJSON thành công`,
            total_features: features.length,
            data: geojsonFeatureCollection
        });

    } catch (error) {
        console.error('[SPATIAL ERROR getStationsGeoJSON]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn không gian PostGIS khi chuyển đổi dữ liệu trạm sang GeoJSON',
            details: error.message
        });
    }
};

module.exports = {
    getStationsGeoJSON
};

