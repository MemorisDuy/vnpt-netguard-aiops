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
/**
 * ==============================================================================
 * CHỨC NĂNG 5: ĐÁNH GIÁ SỨC KHỎE MẠNG THEO MÔ HÌNH CELL 4G LTE CỦA VNPT NET
 * ==============================================================================
 * Tuyến đường (Route): GET /api/analytics/vnpt-cell-health
 * Nghiệp vụ (Business Logic):
 * - Tổng hợp toàn bộ các Cell từ bảng network_cells (mô hình 1 Trạm - 3 Cell).
 * - Phân tách rõ số lượng Cell bất thường theo 2 bộ phận nghiệp vụ VNPT NET:
 *   + A1_rule_vh (Nhóm Vận hành): Lỗi cssr, service_drop_all, Traffic down.
 *   + A1_rule_kt (Nhóm Kỹ thuật): Lỗi Traffic up hoặc suy giảm user_dl_avg_thput.
 * - Tính trung bình 4 chỉ số KPI trọng tâm: cssr, service_drop_all, traffic_gb, user_dl_avg_thput.
 * - Thống kê chi tiết số lượng Cell lỗi theo từng mã tỉnh (CTO, BTE, AGG).
 */
const getVnptCellHealth = async (req, res) => {
    try {
        const summaryQuery = `
            SELECT
                COUNT(*)::int AS total_cells,
                COUNT(DISTINCT node_name)::int AS total_nodes,
                COUNT(*) FILTER (WHERE a1_rule_group = 'NORMAL')::int AS normal_cells,
                COUNT(*) FILTER (WHERE a1_rule_group = 'A1_rule_vh')::int AS vh_alert_cells,
                COUNT(*) FILTER (WHERE a1_rule_group = 'A1_rule_kt')::int AS kt_alert_cells,
                COUNT(*) FILTER (WHERE is_anomaly = TRUE)::int AS total_anomaly_cells,
                COALESCE(ROUND(AVG(cssr)::numeric, 2), 0) AS avg_cssr,
                COALESCE(ROUND(AVG(service_drop_all)::numeric, 2), 0) AS avg_service_drop_all,
                COALESCE(ROUND(AVG(traffic_gb)::numeric, 2), 0) AS avg_traffic_gb,
                COALESCE(ROUND(AVG(user_dl_avg_thput)::numeric, 2), 0) AS avg_user_dl_thput
            FROM network_cells;
        `;

        const provinceQuery = `
            SELECT
                province_code,
                province,
                COUNT(*)::int AS total_cells,
                COUNT(*) FILTER (WHERE is_anomaly = TRUE)::int AS anomaly_cells,
                COUNT(*) FILTER (WHERE a1_rule_group = 'A1_rule_vh')::int AS vh_alert_cells,
                COUNT(*) FILTER (WHERE a1_rule_group = 'A1_rule_kt')::int AS kt_alert_cells
            FROM network_cells
            GROUP BY province_code, province
            ORDER BY anomaly_cells DESC, province_code ASC;
        `;

        const [summaryRes, provinceRes] = await Promise.all([
            db.query(summaryQuery),
            db.query(provinceQuery)
        ]);

        const summary = summaryRes.rows[0];
        const systemStatus = summary.total_anomaly_cells > 0 ? 'WARNING' : 'STABLE';

        return res.status(200).json({
            status: 'success',
            message: 'Phân tích sức khỏe Cell 4G LTE theo chuẩn VNPT NET thành công',
            data: {
                ...summary,
                system_status: systemStatus,
                by_province: provinceRes.rows,
                evaluated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[ANALYTICS ERROR getVnptCellHealth]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi phân tích sức khỏe Cell VNPT NET',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 6: ĐÁNH GIÁ RULE-BASE TẦNG 1 CHO 1 CELL THEO QUY CHUẨN VNPT NET
 * ==============================================================================
 * Tuyến đường (Route): POST /api/analytics/evaluate-vnpt-cell
 * Body JSON: { traffic_gb, cssr, service_drop_all, traffic_percent_hour, user_dl_avg_thput_percent_hour }
 * Nghiệp vụ (Business Logic - Khớp 100% file KPI Main của VNPT NET):
 * - Anomaly 1 (cssr - Vận hành): Lưu lượng >5GB (<95%), 1-5GB (<95%), 0.1-1GB (<90%), <0.1GB (<75%).
 * - Anomaly 2 (service_drop_all - Vận hành): >5GB (>5%), 1-5GB (>5%), 0.1-1GB (>10%), <0.1GB (>20%).
 * - Anomaly 3 (Traffic down - Vận hành): >7GB (<10%), 3-7GB (<10%), 1-3GB (<5%).
 * - Anomaly 4 (Traffic up - Kỹ thuật): >3GB (>450%), 0.5-3GB (>450%), <0.5GB (>1000%).
 * - Anomaly 5 (Throughput down - Kỹ thuật): >10GB (<30%), 5-10GB (<30%), 2-5GB (<20%), 1-2GB (<10%), <1GB (<5%).
 */
const evaluateVnptCellRule = async (req, res) => {
    try {
        const {
            traffic_gb,
            cssr,
            service_drop_all,
            traffic_percent_hour = 100,
            user_dl_avg_thput_percent_hour = 100
        } = req.body;

        if (traffic_gb === undefined || cssr === undefined || service_drop_all === undefined) {
            return res.status(400).json({
                status: 'error',
                message: 'Vui lòng cung cấp đầy đủ các chỉ số bắt buộc: traffic_gb, cssr, service_drop_all'
            });
        }

        const trafficVal = parseFloat(traffic_gb);
        const cssrVal = parseFloat(cssr);
        const dropVal = parseFloat(service_drop_all);
        const trafficPctVal = parseFloat(traffic_percent_hour);
        const thputPctVal = parseFloat(user_dl_avg_thput_percent_hour);

        if (
            isNaN(trafficVal) || isNaN(cssrVal) || isNaN(dropVal) ||
            isNaN(trafficPctVal) || isNaN(thputPctVal) ||
            trafficVal < 0 || cssrVal < 0 || cssrVal > 100 || dropVal < 0 || dropVal > 100
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Giá trị KPI Cell không hợp lệ (traffic_gb >= 0, 0 <= cssr <= 100, 0 <= service_drop_all <= 100)'
            });
        }

        const triggeredAnomalies = [];

        // Kiểm tra Anomaly 1: Chỉ số thiết lập cuộc gọi cssr (%) - Nhóm Vận hành
        const isAnomaly1 =
            (trafficVal > 5 && cssrVal < 95) ||
            (trafficVal >= 1 && trafficVal <= 5 && cssrVal < 95) ||
            (trafficVal >= 0.1 && trafficVal < 1 && cssrVal < 90) ||
            (trafficVal < 0.1 && cssrVal < 75);
        if (isAnomaly1) {
            triggeredAnomalies.push({ code: 'Anomaly1', kpi: 'cssr', group: 'A1_rule_vh' });
        }

        // Kiểm tra Anomaly 2: Chỉ số rớt cuộc gọi service_drop_all (%) - Nhóm Vận hành
        const isAnomaly2 =
            (trafficVal > 5 && dropVal > 5) ||
            (trafficVal >= 1 && trafficVal <= 5 && dropVal > 5) ||
            (trafficVal >= 0.1 && trafficVal < 1 && dropVal > 10) ||
            (trafficVal < 0.1 && dropVal > 20);
        if (isAnomaly2) {
            triggeredAnomalies.push({ code: 'Anomaly2', kpi: 'service_drop_all', group: 'A1_rule_vh' });
        }

        // Kiểm tra Anomaly 3: Lưu lượng suy giảm bất thường (Traffic down) - Nhóm Vận hành
        const isAnomaly3 =
            (trafficVal > 7 && trafficPctVal < 10) ||
            (trafficVal >= 3 && trafficVal <= 7 && trafficPctVal < 10) ||
            (trafficVal >= 1 && trafficVal < 3 && trafficPctVal < 5);
        if (isAnomaly3) {
            triggeredAnomalies.push({ code: 'Anomaly3', kpi: 'traffic_down', group: 'A1_rule_vh' });
        }

        // Kiểm tra Anomaly 4: Lưu lượng tăng cao bất thường (Traffic up) - Nhóm Kỹ thuật
        const isAnomaly4 =
            (trafficVal > 3 && trafficPctVal > 450) ||
            (trafficVal >= 0.5 && trafficVal <= 3 && trafficPctVal > 450) ||
            (trafficVal < 0.5 && trafficPctVal > 1000);
        if (isAnomaly4) {
            triggeredAnomalies.push({ code: 'Anomaly4', kpi: 'traffic_up', group: 'A1_rule_kt' });
        }

        // Kiểm tra Anomaly 5: Thông lượng tải xuống người dùng suy giảm - Nhóm Kỹ thuật
        const isAnomaly5 =
            (trafficVal > 10 && thputPctVal < 30) ||
            (trafficVal >= 5 && trafficVal <= 10 && thputPctVal < 30) ||
            (trafficVal >= 2 && trafficVal < 5 && thputPctVal < 20) ||
            (trafficVal >= 1 && trafficVal < 2 && thputPctVal < 10) ||
            (trafficVal < 1 && thputPctVal < 5);
        if (isAnomaly5) {
            triggeredAnomalies.push({ code: 'Anomaly5', kpi: 'user_dl_avg_thput', group: 'A1_rule_kt' });
        }

        const isAnomaly = triggeredAnomalies.length > 0;
        const hasVh = triggeredAnomalies.some((a) => a.group === 'A1_rule_vh');
        const hasKt = triggeredAnomalies.some((a) => a.group === 'A1_rule_kt');
        const a1RuleGroup = hasVh ? 'A1_rule_vh' : (hasKt ? 'A1_rule_kt' : 'NORMAL');

        return res.status(200).json({
            status: 'success',
            message: 'Đánh giá quy chuẩn KPI Cell VNPT NET thành công',
            data: {
                is_anomaly: isAnomaly,
                a1_rule_group: a1RuleGroup,
                severity: isAnomaly ? 'Cell_Critical' : 'Normal',
                triggered_anomalies: triggeredAnomalies,
                evaluated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[ANALYTICS ERROR evaluateVnptCellRule]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi xử lý đánh giá quy chuẩn KPI Cell VNPT NET',
            details: error.message
        });
    }
};

// Xuất các hàm điều khiển để router sử dụng
module.exports = {
    getNetworkHealth,
    getStationsNearby,
    predictRisk,
    getTopRiskStations,
    getVnptCellHealth,
    evaluateVnptCellRule
};
