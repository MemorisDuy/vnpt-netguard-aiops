// ==============================================================================
// CONTROLLER: XỬ LÝ & LỌC DỮ LIỆU KHÔNG GIAN ĐỊA LÝ POSTGIS (GEOJSON)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Ngọc Lân (Full-stack API Không gian - PostGIS)
// ==============================================================================

// Nạp module kết nối CSDL PostgreSQL + PostGIS qua Connection Pool
const db = require('../config/dbConfig');

// Danh sách các mức độ rủi ro hợp lệ theo thiết kế CSDL (init.sql)
const VALID_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

// Bảng ánh xạ nhãn tiếng Việt và mã màu chuẩn NOC cho từng mức độ rủi ro
const RISK_METADATA = {
    HIGH: { label_vn: 'Nguy cơ cao', color: '#ef4444', default_score: 85 },
    MEDIUM: { label_vn: 'Cảnh báo', color: '#eab308', default_score: 55 },
    LOW: { label_vn: 'An toàn', color: '#22c55e', default_score: 20 }
};

/**
 * Hàm tính điểm rủi ro ước lượng (thang 0 - 100) từ các chỉ số KPI của trạm
 * phục vụ hiển thị trực quan trên Popup bản đồ và HeatmapLayer của WebGIS.
 */
const calculateStationRiskScore = (row) => {
    const riskKey = String(row.risk_level || 'LOW').toUpperCase();
    const baseScore = RISK_METADATA[riskKey]?.default_score ?? 20;
    const latency = parseFloat(row.latency_ms) || 0;
    const packetLoss = parseFloat(row.packet_loss_rate) || 0;

    // Điều chỉnh biên độ nhỏ theo độ trễ và mất gói thực tế nhưng giữ đúng ngưỡng phân tầng
    const bonus = Math.min(12, Math.round(packetLoss * 1.2 + latency / 25));
    return Math.min(99, baseScore + bonus);
};

/**
 * ==============================================================================
 * CHỨC NĂNG: TRUY VẤN & LỌC DỮ LIỆU KHÔNG GIAN TRẠM PHÁT SÓNG CHUẨN GEOJSON
 * ==============================================================================
 * Tuyến đường (Route): GET /api/spatial/stations-geojson
 * Tham số truy vấn hỗ trợ lọc (Optional Query Parameters):
 * - risk_level (hoặc risk): Lọc theo mức độ rủi ro ('ALL', 'LOW', 'MEDIUM', 'HIGH' hoặc 'HIGH,MEDIUM')
 * - province / area / region / district: Lọc theo khu vực địa lý (tỉnh/thành phố, quận/huyện, khu vực đặt trạm)
 * - search: Tìm kiếm theo tên trạm, mã trạm hoặc khu vực (đồng bộ với thanh tìm kiếm Sidebar)
 * - is_anomaly: Lọc theo cờ cảnh báo bất thường AI ('true' hoặc 'false')
 * - bbox: Lọc theo khung nhìn bản đồ (Bounding Box: 'minLng,minLat,maxLng,maxLat') bằng ST_MakeEnvelope
 *
 * Nghiệp vụ (Business Logic):
 * - Sử dụng hàm không gian đặc thù PostGIS `ST_AsGeoJSON` để chuyển đổi cột hình học
 *   `geom` (GEOMETRY Point, hệ quy chiếu WGS 84 - EPSG:4326) sang đối tượng GeoJSON Geometry.
 * - Trường hợp bản ghi chưa có `geom`, tự động dự phòng (fallback) tạo điểm không gian
 *   từ `longitude` và `latitude` qua `ST_SetSRID(ST_MakePoint(...), 4326)`.
 * - Kết hợp bộ lọc động theo mức độ rủi ro và khu vực để trả về cấu trúc `FeatureCollection`
 *   chuẩn RFC 7946 cho bản đồ WebGIS (MapContainer, HeatmapLayer) và Sidebar.
 */
const getStationsGeoJSON = async (req, res) => {
    try {
        const {
            risk_level,
            risk,
            province,
            area,
            region,
            district,
            search,
            is_anomaly,
            bbox
        } = req.query;

        const conditions = [];
        const values = [];

        // 1. Bộ lọc theo mức độ rủi ro (hỗ trợ cả ?risk_level=... và ?risk=..., bỏ qua nếu là 'ALL')
        const rawRiskFilter = risk_level !== undefined ? risk_level : risk;
        let appliedRiskFilter = 'ALL';

        if (rawRiskFilter !== undefined && String(rawRiskFilter).trim() !== '') {
            const normalizedRiskInput = String(rawRiskFilter).trim().toUpperCase();

            if (normalizedRiskInput !== 'ALL') {
                const riskLevels = normalizedRiskInput
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);

                const invalidLevels = riskLevels.filter((lvl) => !VALID_RISK_LEVELS.includes(lvl));
                if (invalidLevels.length > 0) {
                    return res.status(400).json({
                        status: 'error',
                        message: `Tham số risk_level không hợp lệ. Chỉ chấp nhận: ALL, ${VALID_RISK_LEVELS.join(', ')}`
                    });
                }

                if (riskLevels.length === 1) {
                    values.push(riskLevels[0]);
                    conditions.push(`UPPER(risk_level) = $${values.length}`);
                    appliedRiskFilter = riskLevels[0];
                } else if (riskLevels.length > 1) {
                    values.push(riskLevels);
                    conditions.push(`UPPER(risk_level) = ANY($${values.length}::text[])`);
                    appliedRiskFilter = riskLevels.join(',');
                }
            }
        }

        // 2. Bộ lọc theo khu vực địa lý (hỗ trợ province, area, region, district)
        // Tìm kiếm linh hoạt trên cả cột province (Tỉnh/TP) và station_name (Quận/Huyện/Khu vực đặt trạm)
        const rawAreaFilter = province ?? area ?? region ?? district;
        let appliedAreaFilter = 'ALL';

        if (rawAreaFilter !== undefined && String(rawAreaFilter).trim() !== '') {
            const trimmedArea = String(rawAreaFilter).trim();
            if (trimmedArea.toUpperCase() !== 'ALL') {
                values.push(`%${trimmedArea}%`);
                conditions.push(
                    `(province ILIKE $${values.length} OR station_name ILIKE $${values.length})`
                );
                appliedAreaFilter = trimmedArea;
            }
        }

        // 3. Bộ lọc từ khóa tìm kiếm theo tên trạm hoặc mã trạm (đồng bộ với Sidebar.jsx)
        let appliedSearchFilter = '';
        if (search !== undefined && String(search).trim() !== '') {
            const trimmedSearch = String(search).trim();
            values.push(`%${trimmedSearch}%`);
            conditions.push(
                `(station_name ILIKE $${values.length} OR station_code ILIKE $${values.length} OR province ILIKE $${values.length})`
            );
            appliedSearchFilter = trimmedSearch;
        }

        // 4. Bộ lọc theo cờ cảnh báo bất thường AI (is_anomaly: true / false)
        let appliedAnomalyFilter = 'ALL';
        if (is_anomaly !== undefined && String(is_anomaly).trim() !== '') {
            const normalizedAnomaly = String(is_anomaly).trim().toLowerCase();
            if (normalizedAnomaly !== 'all') {
                if (normalizedAnomaly !== 'true' && normalizedAnomaly !== 'false') {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Tham số is_anomaly chỉ chấp nhận giá trị boolean: true hoặc false'
                    });
                }
                values.push(normalizedAnomaly === 'true');
                conditions.push(`is_anomaly = $${values.length}`);
                appliedAnomalyFilter = normalizedAnomaly === 'true';
            }
        }

        // 5. Bộ lọc khung nhìn không gian PostGIS Bounding Box (?bbox=minLng,minLat,maxLng,maxLat)
        if (bbox !== undefined && String(bbox).trim() !== '') {
            const bboxParts = String(bbox)
                .split(',')
                .map((coord) => parseFloat(coord.trim()));

            if (bboxParts.length !== 4 || bboxParts.some((coord) => isNaN(coord))) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Tham số bbox không hợp lệ. Định dạng chuẩn: minLng,minLat,maxLng,maxLat'
                });
            }

            const [minLng, minLat, maxLng, maxLat] = bboxParts;
            values.push(minLng, minLat, maxLng, maxLat);
            const p1 = values.length - 3;
            const p2 = values.length - 2;
            const p3 = values.length - 1;
            const p4 = values.length;

            conditions.push(
                `ST_Intersects(COALESCE(geom, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)), ST_MakeEnvelope($${p1}, $${p2}, $${p3}, $${p4}, 4326))`
            );
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
        const features = result.rows.map((row) => {
            const riskKey = String(row.risk_level || 'LOW').toUpperCase();
            const riskMeta = RISK_METADATA[riskKey] || RISK_METADATA.LOW;
            const riskScore = calculateStationRiskScore(row);

            return {
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
                    risk_label_vn: riskMeta.label_vn,
                    risk_color: riskMeta.color,
                    risk_score: riskScore,
                    is_anomaly: row.is_anomaly,
                    updated_at: row.updated_at
                }
            };
        });

        // Thống kê nhanh số lượng trạm theo mức độ rủi ro trong tập kết quả GeoJSON
        const summary = {
            total: features.length,
            high_risk: features.filter((f) => f.properties.risk_level === 'HIGH').length,
            medium_risk: features.filter((f) => f.properties.risk_level === 'MEDIUM').length,
            low_risk: features.filter((f) => f.properties.risk_level === 'LOW').length
        };

        const geojsonFeatureCollection = {
            type: 'FeatureCollection',
            features
        };

        return res.status(200).json({
            status: 'success',
            message: `Chuyển đổi tọa độ ${features.length} trạm phát sóng sang chuẩn GeoJSON thành công`,
            filters: {
                risk_level: appliedRiskFilter,
                area: appliedAreaFilter,
                search: appliedSearchFilter,
                is_anomaly: appliedAnomalyFilter
            },
            summary,
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
