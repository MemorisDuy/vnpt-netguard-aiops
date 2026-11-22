// ==============================================================================
// CONTROLLER: XỬ LÝ, LỌC & GOM CỤM DỮ LIỆU KHÔNG GIAN POSTGIS CHUẨN VNPT NET
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Ngọc Lân (Full-stack API Không gian - PostGIS)
// ==============================================================================

// Nạp module kết nối CSDL PostgreSQL + PostGIS qua Connection Pool
const db = require('../config/dbConfig');

// Danh sách các mức độ rủi ro hợp lệ theo thiết kế CSDL (init.sql)
const VALID_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

// Danh sách các nhóm quy tắc Tầng 1 (A1 Rule Group) chuẩn VNPT NET
const VALID_A1_GROUPS = ['A1_RULE_VH', 'A1_RULE_KT', 'NORMAL', 'INSUFFICIENT_DATA'];

// Bảng ánh xạ nhãn tiếng Việt và mã màu chuẩn NOC cho từng mức độ rủi ro
const RISK_METADATA = {
    HIGH: { label_vn: 'Nguy cơ cao', color: '#ef4444', default_score: 85 },
    MEDIUM: { label_vn: 'Cảnh báo', color: '#eab308', default_score: 55 },
    LOW: { label_vn: 'An toàn', color: '#22c55e', default_score: 20 }
};

// Bảng ánh xạ thông tin nhóm lỗi Tầng 1 (A1) theo tài liệu KPI VNPT NET
const A1_GROUP_METADATA = {
    A1_rule_vh: {
        group_code: 'A1_rule_vh',
        group_name_vn: 'Nhóm Vận hành',
        severity: 'Cell_Critical',
        risk_level: 'HIGH',
        color: '#ef4444',
        description: 'Suy giảm KPI Vận hành (CSSR thấp, Service Drop cao hoặc Traffic sụt giảm bất thường)'
    },
    A1_rule_kt: {
        group_code: 'A1_rule_kt',
        group_name_vn: 'Nhóm Kỹ thuật',
        severity: 'Cell_Critical',
        risk_level: 'HIGH',
        color: '#f97316',
        description: 'Bất thường KPI Kỹ thuật (Traffic tăng đột biến hoặc suy giảm thông lượng User DL Throughput)'
    },
    NORMAL: {
        group_code: 'NORMAL',
        group_name_vn: 'Bình thường',
        severity: 'Normal',
        risk_level: 'LOW',
        color: '#22c55e',
        description: 'Các chỉ số KPI Cell vận hành ổn định trong ngưỡng quy chuẩn VNPT NET'
    }
};

// Từ điển giải thích 7 cờ nguyên nhân gốc Tầng 2 (A4 Anomaly Detection) từ file quy chuẩn Excel VNPT NET
const A4_FLAG_DICTIONARY = {
    A4_rrcincrease: {
        code: 'A4_rrcincrease',
        attribute: 'rrcincrease',
        related_kpi: 'CSSR, Traffic',
        explain_vn: 'Chỉ số báo hiệu RRC tăng bất thường (vi phạm 8 giờ liên tục khung 6h-22h); lưu lượng tăng cao gây suy giảm CSSR'
    },
    A4_rrcfailure: {
        code: 'A4_rrcfailure',
        attribute: 'rrcfailure',
        related_kpi: 'CSSR',
        explain_vn: 'Báo hiệu RRC không thành công chiếm tỷ lệ lớn (Top 10% rrcfailureweight theo tỉnh trong 6 giờ liên tục khung 6h-22h) làm giảm CSSR'
    },
    A4_s1signallingfailure: {
        code: 'A4_s1signallingfailure',
        attribute: 's1signallingfailure',
        related_kpi: 'CSSR',
        explain_vn: 'Báo hiệu S1 không thành công chiếm tỷ lệ lớn (Top 10% s1signallingfailureweight theo tỉnh trong 6 giờ liên tục khung 6h-22h) làm giảm CSSR'
    },
    A4_erabfailure: {
        code: 'A4_erabfailure',
        attribute: 'erabfailure',
        related_kpi: 'CSSR',
        explain_vn: 'Thiết lập E-RAB không thành công chiếm tỷ lệ lớn (Top 10% erabfailureweight theo tỉnh trong 6 giờ liên tục khung 6h-22h) làm giảm CSSR'
    },
    A4_hoprepfailure: {
        code: 'A4_hoprepfailure',
        attribute: 'hoprepfailure',
        related_kpi: 'Handover (HO)',
        explain_vn: 'Handover giai đoạn Preparation fail chiếm tỷ lệ lớn (Top 10% theo tỉnh 6 giờ liên tục) -> Cell chuyển giao sang Cell lân cận kém, cảnh báo Cell lân cận có vấn đề'
    },
    A4_hoexefailure: {
        code: 'A4_hoexefailure',
        attribute: 'hoexefailure',
        related_kpi: 'Handover (HO)',
        explain_vn: 'Handover giai đoạn Execution fail chiếm tỷ lệ lớn (Top 10% theo tỉnh 6 giờ liên tục) -> Cell chuyển giao sang Cell lân cận kém, cảnh báo Cell lân cận có vấn đề'
    },
    A4_erabrelabnormal: {
        code: 'A4_erabrelabnormal',
        attribute: 'erabrelabnormal',
        related_kpi: 'Service Drop All',
        explain_vn: 'Tỷ lệ rớt E-RAB bất thường chiếm tỷ lệ lớn (Top 10% erabrelabnormalweight theo tỉnh trong 6 giờ liên tục) làm tăng cao tỷ lệ rớt dịch vụ service_drop_all'
    }
};

/**
 * Hàm đánh giá chi tiết 5 điều kiện Anomaly Tầng 1 (Anomaly1..Anomaly5) theo đúng quy chuẩn Excel VNPT NET
 */
const evaluateCellA1Anomalies = (cell) => {
    const traffic = parseFloat(cell.traffic_gb) || 0;
    const cssr = parseFloat(cell.cssr) ?? 100;
    const drop = parseFloat(cell.service_drop_all) || 0;
    const trafficPct = parseFloat(cell.traffic_percent_hour) ?? 100;
    const thputPct = parseFloat(cell.user_dl_avg_thput_percent_hour) ?? 100;

    const anomalies = [];

    // Anomaly 1: Traffic vs CSSR (%) - Nhóm Vận hành
    if (
        (traffic > 5 && cssr < 95) ||
        (traffic >= 1 && traffic <= 5 && cssr < 95) ||
        (traffic >= 0.1 && traffic < 1 && cssr < 90) ||
        (traffic < 0.1 && cssr < 75)
    ) {
        anomalies.push({
            code: 'Anomaly1',
            kpi: 'cssr',
            group: 'A1_rule_vh',
            group_name_vn: 'Nhóm Vận hành',
            detail: `CSSR suy giảm (${cssr}%) tại mức lưu lượng ${traffic} GB`
        });
    }

    // Anomaly 2: Traffic vs Service Drop All (%) - Nhóm Vận hành
    if (
        (traffic > 5 && drop > 5) ||
        (traffic >= 1 && traffic <= 5 && drop > 5) ||
        (traffic >= 0.1 && traffic < 1 && drop > 10) ||
        (traffic < 0.1 && drop > 20)
    ) {
        anomalies.push({
            code: 'Anomaly2',
            kpi: 'service_drop_all',
            group: 'A1_rule_vh',
            group_name_vn: 'Nhóm Vận hành',
            detail: `Tỷ lệ rớt dịch vụ cao (${drop}%) tại mức lưu lượng ${traffic} GB`
        });
    }

    // Anomaly 3: Traffic vs Traffic Percent Hour (Traffic Down) - Nhóm Vận hành
    if (
        (traffic > 7 && trafficPct < 10) ||
        (traffic >= 3 && traffic <= 7 && trafficPct < 10) ||
        (traffic >= 1 && traffic < 3 && trafficPct < 5)
    ) {
        anomalies.push({
            code: 'Anomaly3',
            kpi: 'traffic_down',
            group: 'A1_rule_vh',
            group_name_vn: 'Nhóm Vận hành',
            detail: `Lưu lượng sụt giảm bất thường còn ${trafficPct}% so với trung bình 12 tuần`
        });
    }

    // Anomaly 4: Traffic vs Traffic Percent Hour (Traffic Up) - Nhóm Kỹ thuật
    if (
        (traffic > 3 && trafficPct > 450) ||
        (traffic >= 0.5 && traffic <= 3 && trafficPct > 450) ||
        (traffic < 0.5 && trafficPct > 1000)
    ) {
        anomalies.push({
            code: 'Anomaly4',
            kpi: 'traffic_up',
            group: 'A1_rule_kt',
            group_name_vn: 'Nhóm Kỹ thuật',
            detail: `Lưu lượng tăng đột biến (${trafficPct}%) so với trung bình 12 tuần`
        });
    }

    // Anomaly 5: Traffic vs User DL Avg Throughput Percent Hour - Nhóm Kỹ thuật
    if (
        (traffic > 10 && thputPct < 30) ||
        (traffic >= 5 && traffic <= 10 && thputPct < 30) ||
        (traffic >= 2 && traffic < 5 && thputPct < 20) ||
        (traffic >= 1 && traffic < 2 && thputPct < 10) ||
        (traffic < 1 && thputPct < 5)
    ) {
        anomalies.push({
            code: 'Anomaly5',
            kpi: 'user_dl_avg_thput',
            group: 'A1_rule_kt',
            group_name_vn: 'Nhóm Kỹ thuật',
            detail: `Thông lượng tải xuống người dùng suy giảm còn ${thputPct}% so với trung bình 12 tuần`
        });
    }

    return anomalies;
};

/**
 * Hàm giải mã danh sách cờ A4 (a4_flags) thành danh sách chẩn đoán nguyên nhân gốc tiếng Việt
 */
const decodeA4Flags = (a4Flags = []) => {
    if (!Array.isArray(a4Flags)) return [];
    return a4Flags
        .map((flag) => {
            const cleanFlag = String(flag).trim();
            return (
                A4_FLAG_DICTIONARY[cleanFlag] || {
                    code: cleanFlag,
                    attribute: cleanFlag.replace(/^A4_/, ''),
                    related_kpi: 'KPI RAN',
                    explain_vn: `Cảnh báo nguyên nhân gốc ${cleanFlag}`
                }
            );
        });
};

/**
 * Hàm tính điểm rủi ro (0 - 100) cho một Cell 4G LTE dựa trên KPI Tầng 1 và số cờ A4 Tầng 2
 */
const calculateCellRiskScore = (cell) => {
    const isAnomaly = Boolean(cell.is_anomaly) || ['A1_rule_vh', 'A1_rule_kt'].includes(cell.a1_rule_group);
    if (!isAnomaly) {
        return 20;
    }

    const cssrPenalty = Math.max(0, 96 - (parseFloat(cell.cssr) || 96)) * 1.5;
    const dropPenalty = Math.max(0, (parseFloat(cell.service_drop_all) || 0)) * 1.8;
    const a4Count = Array.isArray(cell.a4_flags) ? cell.a4_flags.length : 0;
    const score = Math.round(75 + Math.min(24, cssrPenalty + dropPenalty + a4Count * 4));
    return Math.min(99, Math.max(70, score));
};

/**
 * Hàm tính điểm rủi ro ước lượng (thang 0 - 100) cho bảng stations truyền thống
 */
const calculateStationRiskScore = (row) => {
    const riskKey = String(row.risk_level || 'LOW').toUpperCase();
    const baseScore = RISK_METADATA[riskKey]?.default_score ?? 20;
    const latency = parseFloat(row.latency_ms) || 0;
    const packetLoss = parseFloat(row.packet_loss_rate) || 0;

    const bonus = Math.min(12, Math.round(packetLoss * 1.2 + latency / 25));
    return Math.min(99, baseScore + bonus);
};

/**
 * ==============================================================================
 * CHỨC NĂNG 1: GOM CỤM KHU VỰC SUY GIẢM CHẤT LƯỢNG MẠNG VNPT NET (POSTGIS CLUSTERING)
 * ==============================================================================
 * Tuyến đường (Routes):
 * - GET /api/spatial/clusters-geojson
 * - GET /api/spatial/vnpt-clusters
 * - GET /api/spatial/degraded-clusters
 * - GET /api/spatial/clusters
 *
 * Tham số truy vấn tùy chọn (Query Parameters):
 * - radius (mét): Bán kính gom cụm không gian PostGIS (mặc định 3000m = 3km)
 * - min_cells: Số lượng Cell suy giảm tối thiểu để tạo thành cụm (mặc định 1; truyền 2 để chỉ lấy cụm đa Cell)
 * - province / province_code / area: Lọc theo tỉnh hoặc mã tỉnh 3 ký tự cuối của CELL_NAME (VD: CTO, BTE, AGG)
 * - a1_rule_group / group: Lọc theo nhóm lỗi Tầng 1 ('A1_rule_vh', 'A1_rule_kt', 'ALL')
 * - a4_flag: Lọc các cụm có chứa cờ nguyên nhân gốc Tầng 2 cụ thể (VD: 'A4_rrcfailure', 'A4_hoprepfailure')
 * - include_normal: Mặc định false (chỉ gom cụm các Cell đang suy giảm); nếu 'true' sẽ xét toàn bộ Cell
 *
 * Nghiệp vụ (Business Logic):
 * - Áp dụng thuật toán gom cụm mật độ không gian PostGIS `ST_ClusterDBSCAN` kết hợp
 *   hàm kiểm tra khoảng cách địa cầu `ST_DWithin` và `ST_AsGeoJSON` trên bảng `network_cells`.
 * - Các Cell suy giảm nằm gần nhau trong phạm vi `radius` mét được gom vào cùng 1 cụm (`cluster_id`).
 * - Mỗi cụm trả về 1 GeoJSON `Feature` đại diện cho **Khu vực suy giảm chất lượng mạng**:
 *   + `geometry`: Tọa độ tâm cụm (`Point [center_longitude, center_latitude]`).
 *   + `properties`: Thông tin tổng hợp của khu vực suy giảm, thống kê KPI trung bình,
 *     phân loại nhóm Vận hành (`A1_rule_vh`) / Kỹ thuật (`A1_rule_kt`), chẩn đoán nguyên nhân gốc A4,
 *     cảnh báo liên đới Handover (`neighbor_handover_issue`), và **danh sách chi tiết các Cell lỗi bên trong (`cells`)**.
 */
const getDegradedClustersGeoJSON = async (req, res) => {
    try {
        const {
            radius = 3000,
            min_cells = 1,
            minPoints,
            province,
            province_code,
            area,
            a1_rule_group,
            group,
            a4_flag,
            include_normal = 'false'
        } = req.query;

        const clusterRadiusMeters = parseFloat(radius);
        const minCellsPerCluster = parseInt(minPoints ?? min_cells, 10);

        if (isNaN(clusterRadiusMeters) || clusterRadiusMeters <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Tham số radius (bán kính gom cụm) phải là số dương hợp lệ (đơn vị: mét)'
            });
        }

        if (isNaN(minCellsPerCluster) || minCellsPerCluster < 1) {
            return res.status(400).json({
                status: 'error',
                message: 'Tham số min_cells phải là số nguyên lớn hơn hoặc bằng 1'
            });
        }

        const conditions = [];
        // $1 dùng cho bán kính gom cụm (mét) trong ST_ClusterDBSCAN & ST_DWithin
        const values = [clusterRadiusMeters];

        // 1. Mặc định chỉ lấy các Cell bị suy giảm (is_anomaly = TRUE hoặc thuộc nhóm A1_rule_vh / A1_rule_kt)
        const shouldIncludeNormal = String(include_normal).trim().toLowerCase() === 'true';
        if (!shouldIncludeNormal) {
            conditions.push(`(c.is_anomaly = TRUE OR c.a1_rule_group IN ('A1_rule_vh', 'A1_rule_kt'))`);
        }

        // 2. Bộ lọc theo nhóm quy tắc Tầng 1 (A1_rule_vh / A1_rule_kt)
        const rawGroupFilter = a1_rule_group ?? group;
        let appliedGroupFilter = 'ALL';

        if (rawGroupFilter !== undefined && String(rawGroupFilter).trim() !== '') {
            const normGroup = String(rawGroupFilter).trim().toUpperCase();
            if (normGroup !== 'ALL') {
                let mappedGroup = normGroup;
                if (normGroup === 'VH' || normGroup === 'A1_RULE_VH') mappedGroup = 'A1_rule_vh';
                else if (normGroup === 'KT' || normGroup === 'A1_RULE_KT') mappedGroup = 'A1_rule_kt';
                else if (!VALID_A1_GROUPS.includes(normGroup)) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Tham số a1_rule_group không hợp lệ. Chỉ chấp nhận: ALL, A1_rule_vh, A1_rule_kt, NORMAL'
                    });
                }

                values.push(mappedGroup);
                conditions.push(`UPPER(c.a1_rule_group) = UPPER($${values.length})`);
                appliedGroupFilter = mappedGroup;
            }
        }

        // 3. Bộ lọc theo tỉnh hoặc mã tỉnh 3 ký tự cuối (CTO, BTE, AGG)
        const rawArea = province_code ?? province ?? area;
        let appliedAreaFilter = 'ALL';

        if (rawArea !== undefined && String(rawArea).trim() !== '') {
            const trimmedArea = String(rawArea).trim();
            if (trimmedArea.toUpperCase() !== 'ALL') {
                values.push(trimmedArea.toUpperCase());
                const codeIdx = values.length;
                values.push(`%${trimmedArea}%`);
                const textIdx = values.length;

                conditions.push(
                    `(UPPER(c.province_code) = $${codeIdx} OR UPPER(Right(c.cell_name, 3)) = $${codeIdx} OR c.province ILIKE $${textIdx} OR c.node_name ILIKE $${textIdx})`
                );
                appliedAreaFilter = trimmedArea;
            }
        }

        // 4. Bộ lọc theo cờ nguyên nhân gốc A4 (VD: A4_rrcfailure, A4_hoprepfailure)
        let appliedA4Filter = 'ALL';
        if (a4_flag !== undefined && String(a4_flag).trim() !== '') {
            const trimmedFlag = String(a4_flag).trim();
            if (trimmedFlag.toUpperCase() !== 'ALL') {
                values.push(trimmedFlag);
                conditions.push(`$${values.length} = ANY(c.a4_flags)`);
                appliedA4Filter = trimmedFlag;
            }
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Câu truy vấn không gian PostGIS kết hợp ST_ClusterDBSCAN, ST_DWithin và ST_AsGeoJSON:
        // - ST_ClusterDBSCAN(cell_geom, eps_degrees, 1) OVER () gom các Cell suy giảm trong bán kính $1 mét
        //   (quy đổi $1 / 111320.0 độ trên hệ tọa độ WGS 84 - EPSG:4326).
        // - ST_DWithin(cell_geom::geography, nb.cell_geom::geography, $1) đếm chính xác số Cell suy giảm lân cận theo mét.
        // - ST_AsGeoJSON(cell_geom)::json chuyển đổi tọa độ từng Cell sang chuẩn GeoJSON Geometry.
        const query = `
            WITH filtered_cells AS (
                SELECT
                    c.id,
                    c.station_id,
                    c.node_name,
                    c.cell_name,
                    c.enodeb_id,
                    c.cell_id,
                    c.province,
                    COALESCE(NULLIF(c.province_code, ''), RIGHT(c.cell_name, 3)) AS province_code,
                    c.latitude,
                    c.longitude,
                    COALESCE(c.geom, ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)) AS cell_geom,
                    c.cssr,
                    c.service_drop_all,
                    c.traffic_gb,
                    c.traffic_percent_hour,
                    c.user_dl_avg_thput,
                    c.user_dl_avg_thput_percent_hour,
                    c.a1_rule_group,
                    COALESCE(c.a4_flags, '{}'::text[]) AS a4_flags,
                    c.is_anomaly,
                    c.sta_datetime
                FROM network_cells c
                ${whereClause}
            ),
            clustered_cells AS (
                SELECT
                    fc.*,
                    ST_ClusterDBSCAN(fc.cell_geom, $1 / 111320.0, 1) OVER () AS cluster_id,
                    (
                        SELECT COUNT(*)::int
                        FROM filtered_cells nb
                        WHERE ST_DWithin(fc.cell_geom::geography, nb.cell_geom::geography, $1)
                    ) AS nearby_degraded_count,
                    ST_AsGeoJSON(fc.cell_geom)::json AS geometry
                FROM filtered_cells fc
            )
            SELECT *
            FROM clustered_cells
            ORDER BY cluster_id ASC, id ASC;
        `;

        const result = await db.query(query, values);

        // Gom nhóm các bản ghi Cell theo cluster_id để tạo GeoJSON Feature cho từng Khu vực suy giảm
        const clusterMap = new Map();

        result.rows.forEach((row) => {
            const cid = row.cluster_id ?? 0;
            if (!clusterMap.has(cid)) {
                clusterMap.set(cid, []);
            }
            clusterMap.get(cid).push(row);
        });

        const clusterFeatures = [];
        let sequentialClusterNumber = 1;

        for (const [, rawCells] of clusterMap.entries()) {
            // Áp dụng điều kiện số lượng Cell suy giảm tối thiểu trong 1 cụm (min_cells)
            if (rawCells.length < minCellsPerCluster) {
                continue;
            }

            const clusterIndex = sequentialClusterNumber++;
            const firstCell = rawCells[0];
            const provinceName = firstCell.province;
            const provinceCode = firstCell.province_code || String(firstCell.cell_name || '').slice(-3);

            // Tính tọa độ tâm cụm (Centroid) của khu vực suy giảm
            const centerLat = Number(
                (rawCells.reduce((sum, c) => sum + Number(c.latitude), 0) / rawCells.length).toFixed(6)
            );
            const centerLng = Number(
                (rawCells.reduce((sum, c) => sum + Number(c.longitude), 0) / rawCells.length).toFixed(6)
            );

            // Chuẩn hóa danh sách các Cell lỗi bên trong cụm kèm chẩn đoán A1 & A4
            const degradedCells = rawCells.map((cell) => {
                const a1Meta = A1_GROUP_METADATA[cell.a1_rule_group] || A1_GROUP_METADATA.NORMAL;
                const triggeredA1 = evaluateCellA1Anomalies(cell);
                const a4Diagnoses = decodeA4Flags(cell.a4_flags);
                const cellScore = calculateCellRiskScore(cell);

                return {
                    id: cell.id,
                    station_id: cell.station_id,
                    node_name: cell.node_name,
                    cell_name: cell.cell_name,
                    enodeb_id: cell.enodeb_id,
                    cell_id: cell.cell_id,
                    province: cell.province,
                    province_code: cell.province_code,
                    latitude: Number(cell.latitude),
                    longitude: Number(cell.longitude),
                    position: [Number(cell.latitude), Number(cell.longitude)],
                    geometry: typeof cell.geometry === 'string' ? JSON.parse(cell.geometry) : cell.geometry,
                    cssr: Number(cell.cssr),
                    service_drop_all: Number(cell.service_drop_all),
                    traffic_gb: Number(cell.traffic_gb),
                    traffic_percent_hour: Number(cell.traffic_percent_hour),
                    user_dl_avg_thput: Number(cell.user_dl_avg_thput),
                    user_dl_avg_thput_percent_hour: Number(cell.user_dl_avg_thput_percent_hour),
                    a1_rule_group: cell.a1_rule_group,
                    a1_group_name_vn: a1Meta.group_name_vn,
                    severity: a1Meta.severity,
                    risk_level: a1Meta.risk_level,
                    risk_color: a1Meta.color,
                    risk_score: cellScore,
                    triggered_a1_rules: triggeredA1,
                    a4_flags: cell.a4_flags || [],
                    a4_diagnoses: a4Diagnoses,
                    nearby_degraded_count: Number(cell.nearby_degraded_count) || rawCells.length,
                    is_anomaly: Boolean(cell.is_anomaly),
                    sta_datetime: cell.sta_datetime
                };
            });

            // Thống kê tổng hợp cấp cụm (Khu vực suy giảm chất lượng mạng)
            const vhCount = degradedCells.filter((c) => c.a1_rule_group === 'A1_rule_vh').length;
            const ktCount = degradedCells.filter((c) => c.a1_rule_group === 'A1_rule_kt').length;
            const affectedNodes = [...new Set(degradedCells.map((c) => c.node_name))];
            const allA4Flags = [...new Set(degradedCells.flatMap((c) => c.a4_flags))];
            const clusterA4Diagnoses = decodeA4Flags(allA4Flags);

            // Kiểm tra cảnh báo liên đới Handover sang Cell lân cận theo quy chuẩn File 2
            const neighborHandoverIssue = allA4Flags.some(
                (flag) => flag === 'A4_hoprepfailure' || flag === 'A4_hoexefailure'
            );

            let dominantRuleGroup = 'NORMAL';
            let dominantGroupLabelVn = 'Bình thường';
            let clusterColor = '#22c55e';

            if (vhCount > 0 && ktCount > 0) {
                dominantRuleGroup = 'A1_rule_vh';
                dominantGroupLabelVn = 'Kết hợp Vận hành & Kỹ thuật';
                clusterColor = '#ef4444';
            } else if (vhCount > 0) {
                dominantRuleGroup = 'A1_rule_vh';
                dominantGroupLabelVn = 'Nhóm Vận hành (A1_rule_vh)';
                clusterColor = '#ef4444';
            } else if (ktCount > 0) {
                dominantRuleGroup = 'A1_rule_kt';
                dominantGroupLabelVn = 'Nhóm Kỹ thuật (A1_rule_kt)';
                clusterColor = '#f97316';
            }

            const avgCssr = Number(
                (degradedCells.reduce((s, c) => s + c.cssr, 0) / degradedCells.length).toFixed(2)
            );
            const avgDrop = Number(
                (degradedCells.reduce((s, c) => s + c.service_drop_all, 0) / degradedCells.length).toFixed(2)
            );
            const totalTrafficGb = Number(
                degradedCells.reduce((s, c) => s + c.traffic_gb, 0).toFixed(2)
            );
            const avgThput = Number(
                (degradedCells.reduce((s, c) => s + c.user_dl_avg_thput, 0) / degradedCells.length).toFixed(2)
            );
            const maxCellScore = Math.max(...degradedCells.map((c) => c.risk_score));
            const clusterScore = Math.min(99, maxCellScore + (degradedCells.length > 1 ? 4 : 0));

            let recommendation = 'Theo dõi định kỳ các chỉ số KPI của cụm Cell.';
            if (neighborHandoverIssue) {
                recommendation =
                    'Cảnh báo lỗi Handover (A4_hoprepfailure / A4_hoexefailure) cao: Cần kiểm tra ngay thông số chuyển giao và tình trạng quá tải/lỗi của các Cell lân cận trong cụm.';
            } else if (vhCount > 0) {
                recommendation =
                    'Nhóm Vận hành (A1_rule_vh): Ưu tiên kiểm tra suy giảm CSSR và rớt dịch vụ E-RAB (A4_rrcfailure / A4_s1signallingfailure / A4_erabrelabnormal) tại các trạm trong khu vực.';
            } else if (ktCount > 0) {
                recommendation =
                    'Nhóm Kỹ thuật (A1_rule_kt): Kiểm tra nghẽn tài nguyên vô tuyến do lưu lượng tăng đột biến (A4_rrcincrease) và tối ưu thông lượng tải xuống User DL Throughput.';
            }

            const clusterCode = `CLUSTER_${provinceCode}_${String(clusterIndex).padStart(2, '0')}`;
            const clusterName = `Khu vực suy giảm mạng ${provinceName} (${affectedNodes.join(', ')})`;

            clusterFeatures.push({
                type: 'Feature',
                id: clusterIndex,
                geometry: {
                    type: 'Point',
                    coordinates: [centerLng, centerLat]
                },
                properties: {
                    cluster_id: clusterIndex,
                    cluster_code: clusterCode,
                    cluster_name: clusterName,
                    name: clusterName,
                    province: provinceName,
                    province_code: provinceCode,
                    center_latitude: centerLat,
                    center_longitude: centerLng,
                    radius_meters: Math.min(Math.max(1200, degradedCells.length * 800), clusterRadiusMeters),
                    cluster_type: degradedCells.length >= 2 ? 'MULTI_CELL_HOTSPOT' : 'SINGLE_CELL_ZONE',
                    cell_count: degradedCells.length,
                    node_count: affectedNodes.length,
                    affected_nodes: affectedNodes,
                    affected_cell_names: degradedCells.map((c) => c.cell_name),
                    risk_level: vhCount > 0 || ktCount > 0 ? 'HIGH' : 'LOW',
                    risk_label_vn: vhCount > 0 || ktCount > 0 ? 'Nguy cơ cao' : 'An toàn',
                    severity: vhCount > 0 || ktCount > 0 ? 'Cell_Critical' : 'Normal',
                    dominant_rule_group: dominantRuleGroup,
                    dominant_group_label_vn: dominantGroupLabelVn,
                    vh_cell_count: vhCount,
                    kt_cell_count: ktCount,
                    risk_color: clusterColor,
                    risk_score: clusterScore,
                    avg_kpi: {
                        avg_cssr: avgCssr,
                        avg_service_drop_all: avgDrop,
                        total_traffic_gb: totalTrafficGb,
                        avg_user_dl_thput: avgThput
                    },
                    a4_root_causes: allA4Flags,
                    a4_diagnoses: clusterA4Diagnoses,
                    neighbor_handover_issue: neighborHandoverIssue,
                    recommendation,
                    cells: degradedCells
                }
            });
        }

        const totalDegradedCells = clusterFeatures.reduce(
            (sum, feature) => sum + feature.properties.cell_count,
            0
        );

        const summary = {
            total_clusters: clusterFeatures.length,
            multi_cell_clusters: clusterFeatures.filter((f) => f.properties.cell_count >= 2).length,
            single_cell_clusters: clusterFeatures.filter((f) => f.properties.cell_count === 1).length,
            total_degraded_cells: totalDegradedCells,
            vh_alert_cells: clusterFeatures.reduce((s, f) => s + f.properties.vh_cell_count, 0),
            kt_alert_cells: clusterFeatures.reduce((s, f) => s + f.properties.kt_cell_count, 0),
            handover_warning_clusters: clusterFeatures.filter(
                (f) => f.properties.neighbor_handover_issue
            ).length
        };

        return res.status(200).json({
            status: 'success',
            message: `Gom cụm không gian PostGIS thành công: Phát hiện ${clusterFeatures.length} khu vực suy giảm chất lượng mạng (${totalDegradedCells} Cell lỗi)`,
            clustering_params: {
                algorithm: 'PostGIS ST_ClusterDBSCAN + ST_DWithin',
                radius_meters: clusterRadiusMeters,
                min_cells: minCellsPerCluster
            },
            filters: {
                area: appliedAreaFilter,
                a1_rule_group: appliedGroupFilter,
                a4_flag: appliedA4Filter,
                include_normal: shouldIncludeNormal
            },
            summary,
            total_clusters: clusterFeatures.length,
            total_degraded_cells: totalDegradedCells,
            data: {
                type: 'FeatureCollection',
                features: clusterFeatures
            }
        });

    } catch (error) {
        console.error('[SPATIAL ERROR getDegradedClustersGeoJSON]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn gom cụm không gian PostGIS trên bảng network_cells',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 2: XUẤT GEOJSON CHI TIẾT TỪNG CELL 4G LTE VNPT NET (1 TRẠM - 3 CELL)
 * ==============================================================================
 * Tuyến đường (Routes):
 * - GET /api/spatial/cells-geojson
 * - GET /api/spatial/vnpt-cells
 *
 * Tham số truy vấn hỗ trợ lọc:
 * - province / province_code / area: Lọc theo tỉnh hoặc mã tỉnh (CTO, BTE, AGG)
 * - a1_rule_group / group: Lọc theo nhóm lỗi ('A1_rule_vh', 'A1_rule_kt', 'NORMAL', 'ALL')
 * - is_anomaly: Lọc theo trạng thái bất thường ('true' / 'false')
 * - node_name: Lọc theo mã trạm eNodeB (VD: 4G-CRA032M-CTO)
 * - search: Tìm kiếm theo cell_name, node_name hoặc province
 */
const getVnptCellsGeoJSON = async (req, res) => {
    try {
        const {
            province,
            province_code,
            area,
            a1_rule_group,
            group,
            is_anomaly,
            node_name,
            search
        } = req.query;

        const conditions = [];
        const values = [];

        // 1. Lọc theo nhóm quy tắc A1
        const rawGroup = a1_rule_group ?? group;
        let appliedGroup = 'ALL';
        if (rawGroup !== undefined && String(rawGroup).trim() !== '') {
            const normGroup = String(rawGroup).trim().toUpperCase();
            if (normGroup !== 'ALL') {
                let mappedGroup = normGroup;
                if (normGroup === 'VH' || normGroup === 'A1_RULE_VH') mappedGroup = 'A1_rule_vh';
                else if (normGroup === 'KT' || normGroup === 'A1_RULE_KT') mappedGroup = 'A1_rule_kt';
                else if (normGroup === 'NORMAL') mappedGroup = 'NORMAL';
                else if (!VALID_A1_GROUPS.includes(normGroup)) {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Tham số a1_rule_group không hợp lệ. Chỉ chấp nhận: ALL, A1_rule_vh, A1_rule_kt, NORMAL'
                    });
                }
                values.push(mappedGroup);
                conditions.push(`UPPER(a1_rule_group) = UPPER($${values.length})`);
                appliedGroup = mappedGroup;
            }
        }

        // 2. Lọc theo khu vực / mã tỉnh (CTO, BTE, AGG)
        const rawArea = province_code ?? province ?? area;
        let appliedArea = 'ALL';
        if (rawArea !== undefined && String(rawArea).trim() !== '') {
            const trimmedArea = String(rawArea).trim();
            if (trimmedArea.toUpperCase() !== 'ALL') {
                values.push(trimmedArea.toUpperCase());
                const codeIdx = values.length;
                values.push(`%${trimmedArea}%`);
                const textIdx = values.length;
                conditions.push(
                    `(UPPER(province_code) = $${codeIdx} OR UPPER(RIGHT(cell_name, 3)) = $${codeIdx} OR province ILIKE $${textIdx})`
                );
                appliedArea = trimmedArea;
            }
        }

        // 3. Lọc theo trạng thái bất thường (is_anomaly)
        let appliedAnomaly = 'ALL';
        if (is_anomaly !== undefined && String(is_anomaly).trim() !== '') {
            const normAnomaly = String(is_anomaly).trim().toLowerCase();
            if (normAnomaly !== 'all') {
                if (normAnomaly !== 'true' && normAnomaly !== 'false') {
                    return res.status(400).json({
                        status: 'error',
                        message: 'Tham số is_anomaly chỉ chấp nhận giá trị boolean: true hoặc false'
                    });
                }
                values.push(normAnomaly === 'true');
                conditions.push(`is_anomaly = $${values.length}`);
                appliedAnomaly = normAnomaly === 'true';
            }
        }

        // 4. Lọc theo mã trạm eNodeB (node_name)
        if (node_name !== undefined && String(node_name).trim() !== '') {
            values.push(String(node_name).trim());
            conditions.push(`UPPER(node_name) = UPPER($${values.length})`);
        }

        // 5. Tìm kiếm theo từ khóa (cell_name, node_name, province)
        let appliedSearch = '';
        if (search !== undefined && String(search).trim() !== '') {
            const trimmedSearch = String(search).trim();
            values.push(`%${trimmedSearch}%`);
            conditions.push(
                `(cell_name ILIKE $${values.length} OR node_name ILIKE $${values.length} OR province ILIKE $${values.length})`
            );
            appliedSearch = trimmedSearch;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const query = `
            SELECT
                id,
                station_id,
                node_name,
                cell_name,
                enodeb_id,
                cell_id,
                province,
                COALESCE(NULLIF(province_code, ''), RIGHT(cell_name, 3)) AS province_code,
                latitude,
                longitude,
                cssr,
                service_drop_all,
                traffic_gb,
                traffic_percent_hour,
                user_dl_avg_thput,
                user_dl_avg_thput_percent_hour,
                a1_rule_group,
                COALESCE(a4_flags, '{}'::text[]) AS a4_flags,
                is_anomaly,
                sta_datetime,
                ST_AsGeoJSON(
                    COALESCE(geom, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))
                )::json AS geometry
            FROM network_cells
            ${whereClause}
            ORDER BY id ASC;
        `;

        const result = await db.query(query, values);

        const features = result.rows.map((row) => {
            const a1Meta = A1_GROUP_METADATA[row.a1_rule_group] || A1_GROUP_METADATA.NORMAL;
            const triggeredA1 = evaluateCellA1Anomalies(row);
            const a4Diagnoses = decodeA4Flags(row.a4_flags);
            const riskScore = calculateCellRiskScore(row);

            return {
                type: 'Feature',
                id: row.id,
                geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
                properties: {
                    id: row.id,
                    station_id: row.station_id,
                    node_name: row.node_name,
                    cell_name: row.cell_name,
                    station_code: row.cell_name,
                    station_name: `${row.cell_name} (${row.node_name})`,
                    enodeb_id: row.enodeb_id,
                    cell_id: row.cell_id,
                    province: row.province,
                    province_code: row.province_code,
                    latitude: Number(row.latitude),
                    longitude: Number(row.longitude),
                    cssr: Number(row.cssr),
                    service_drop_all: Number(row.service_drop_all),
                    traffic_gb: Number(row.traffic_gb),
                    traffic_percent_hour: Number(row.traffic_percent_hour),
                    user_dl_avg_thput: Number(row.user_dl_avg_thput),
                    user_dl_avg_thput_percent_hour: Number(row.user_dl_avg_thput_percent_hour),
                    a1_rule_group: row.a1_rule_group,
                    a1_group_name_vn: a1Meta.group_name_vn,
                    severity: a1Meta.severity,
                    risk_level: a1Meta.risk_level,
                    risk_label_vn: RISK_METADATA[a1Meta.risk_level]?.label_vn || 'An toàn',
                    risk_color: a1Meta.color,
                    risk_score: riskScore,
                    triggered_a1_rules: triggeredA1,
                    a4_flags: row.a4_flags || [],
                    a4_diagnoses: a4Diagnoses,
                    is_anomaly: Boolean(row.is_anomaly),
                    sta_datetime: row.sta_datetime
                }
            };
        });

        const summary = {
            total_cells: features.length,
            normal_cells: features.filter((f) => f.properties.a1_rule_group === 'NORMAL').length,
            vh_alert_cells: features.filter((f) => f.properties.a1_rule_group === 'A1_rule_vh').length,
            kt_alert_cells: features.filter((f) => f.properties.a1_rule_group === 'A1_rule_kt').length,
            anomaly_cells: features.filter((f) => f.properties.is_anomaly).length
        };

        return res.status(200).json({
            status: 'success',
            message: `Chuyển đổi tọa độ ${features.length} Cell 4G LTE chuẩn VNPT NET sang GeoJSON thành công`,
            filters: {
                area: appliedArea,
                a1_rule_group: appliedGroup,
                is_anomaly: appliedAnomaly,
                search: appliedSearch
            },
            summary,
            total_features: features.length,
            data: {
                type: 'FeatureCollection',
                features
            }
        });

    } catch (error) {
        console.error('[SPATIAL ERROR getVnptCellsGeoJSON]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn không gian PostGIS khi lấy dữ liệu GeoJSON của bảng network_cells',
            details: error.message
        });
    }
};

/**
 * ==============================================================================
 * CHỨC NĂNG 3: TRUY VẤN & LỌC DỮ LIỆU KHÔNG GIAN TRẠM PHÁT SÓNG CHUẨN GEOJSON
 * ==============================================================================
 * Tuyến đường (Route): GET /api/spatial/stations-geojson
 * Tương thích ngược 100% với bảng `stations` và hỗ trợ thêm tham số:
 * - ?mode=clusters (hoặc ?cluster=true): Tự động chuyển sang gom cụm Khu vực suy giảm VNPT NET
 * - ?source=cells (hoặc ?source=network_cells): Tự động lấy danh sách Cell 4G LTE VNPT NET
 */
const getStationsGeoJSON = async (req, res) => {
    try {
        const {
            mode,
            cluster,
            source,
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

        // Cho phép gọi trực tiếp chế độ gom cụm hoặc danh sách Cell qua tham số query
        if (
            String(mode || '').toLowerCase() === 'clusters' ||
            String(cluster || '').toLowerCase() === 'true'
        ) {
            return getDegradedClustersGeoJSON(req, res);
        }

        if (['cells', 'network_cells', 'vnpt_cells'].includes(String(source || '').toLowerCase())) {
            return getVnptCellsGeoJSON(req, res);
        }

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
    getStationsGeoJSON,
    getDegradedClustersGeoJSON,
    getVnptCellsGeoJSON,
    evaluateCellA1Anomalies,
    decodeA4Flags
};
