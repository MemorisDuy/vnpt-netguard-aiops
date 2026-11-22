// ==============================================================================
// TẦNG DỊCH VỤ API KHÔNG GIAN, GOM CỤM VNPT NET, THỐNG KÊ & DỰ BÁO AI (AXIOS)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Ngọc Lân (Full-stack API Không gian - PostGIS)
// Phục vụ kết nối dữ liệu cho:
// - Võ Ngọc Quý (MapContainer.jsx, HeatmapLayer.jsx)
// - Minh Trường (Sidebar.jsx, UI Dashboard)
// ==============================================================================

import axios from 'axios';

// Cấu hình Base URL kết nối tới Backend Express (mặc định Port 5000)
// Hỗ trợ biến môi trường Vite (VITE_API_BASE_URL / VITE_API_URL)
const API_BASE_URL =
    (typeof import.meta !== 'undefined' &&
        import.meta.env &&
        (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) ||
    'http://localhost:5000/api';

// Trọng số cường độ nhiệt (intensity) tương ứng với dải màu rủi ro (Xanh - Vàng - Đỏ)
export const RISK_INTENSITY_MAP = {
    LOW: 0.3,    // Mức an toàn (Xanh)
    MEDIUM: 0.6, // Mức cảnh báo (Vàng)
    HIGH: 1.0    // Nguy cơ suy giảm cao (Đỏ)
};

// Bảng mã màu chuẩn NOC đồng bộ với HeatmapLayer.jsx và Sidebar.jsx
export const RISK_COLOR_MAP = {
    LOW: '#22c55e',
    MEDIUM: '#eab308',
    HIGH: '#ef4444'
};

// Bảng nhãn tiếng Việt chuẩn cho mức độ rủi ro
export const RISK_LABEL_VN_MAP = {
    LOW: 'An toàn',
    MEDIUM: 'Cảnh báo',
    HIGH: 'Nguy cơ cao'
};

// Định nghĩa метаdata cho 2 nhóm lỗi Tầng 1 (A1) theo quy chuẩn Excel VNPT NET
export const VNPT_A1_GROUPS = {
    A1_rule_vh: {
        code: 'A1_rule_vh',
        label_vn: 'Nhóm Vận hành',
        severity: 'Cell_Critical',
        color: '#ef4444',
        description: 'Suy giảm CSSR, tỷ lệ rớt dịch vụ Service Drop cao hoặc lưu lượng Traffic sụt giảm'
    },
    A1_rule_kt: {
        code: 'A1_rule_kt',
        label_vn: 'Nhóm Kỹ thuật',
        severity: 'Cell_Critical',
        color: '#f97316',
        description: 'Lưu lượng Traffic tăng đột biến hoặc suy giảm thông lượng tải xuống User DL Throughput'
    },
    NORMAL: {
        code: 'NORMAL',
        label_vn: 'Bình thường',
        severity: 'Normal',
        color: '#22c55e',
        description: 'Cell vận hành ổn định trong ngưỡng KPI quy chuẩn VNPT NET'
    }
};

// Từ điển giải thích 7 cờ nguyên nhân gốc Tầng 2 (A4) theo tài liệu KPI Ericsson VNPT NET
export const VNPT_A4_DICTIONARY = {
    A4_rrcincrease: 'Chỉ số báo hiệu RRC tăng bất thường (8 giờ liên tục 6h-22h); lưu lượng tăng làm giảm CSSR',
    A4_rrcfailure: 'Báo hiệu RRC không thành công chiếm tỷ lệ lớn (Top 10% theo tỉnh 6 giờ liên tục) làm giảm CSSR',
    A4_s1signallingfailure: 'Báo hiệu S1 không thành công chiếm tỷ lệ lớn (Top 10% theo tỉnh 6 giờ liên tục) làm giảm CSSR',
    A4_erabfailure: 'Thiết lập E-RAB không thành công chiếm tỷ lệ lớn (Top 10% theo tỉnh 6 giờ liên tục) làm giảm CSSR',
    A4_hoprepfailure: 'Handover Preparation fail cao (Top 10% theo tỉnh 6 giờ liên tục) -> Cảnh báo Cell lân cận có vấn đề',
    A4_hoexefailure: 'Handover Execution fail cao (Top 10% theo tỉnh 6 giờ liên tục) -> Cảnh báo Cell lân cận có vấn đề',
    A4_erabrelabnormal: 'Rớt E-RAB bất thường cao (Top 10% theo tỉnh 6 giờ liên tục) làm tăng tỷ lệ service_drop_all'
};

// Khởi tạo Axios Instance dùng chung cho toàn bộ Frontend WebGIS
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    }
});

// Interceptor xử lý phản hồi và ghi nhận lỗi tập trung
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const message =
            error.response?.data?.message ||
            error.message ||
            'Không thể kết nối tới máy chủ Backend API';
        console.error('[WebGIS API Error]:', message);
        return Promise.reject(error);
    }
);

/**
 * Hàm chuẩn hóa bộ tham số lọc (Query Params) trước khi gửi lên Backend:
 * - Cho phép truyền trực tiếp chuỗi mức rủi ro (VD: 'HIGH', 'ALL') hoặc object { risk_level, area, province, province_code, a1_rule_group, ... }
 * - Tự động loại bỏ các giá trị rỗng hoặc 'ALL' để URL truy vấn gọn sạch.
 */
export const normalizeFilterParams = (params = {}) => {
    if (typeof params === 'string') {
        const trimmed = params.trim().toUpperCase();
        return trimmed && trimmed !== 'ALL' ? { risk_level: trimmed } : {};
    }

    if (!params || typeof params !== 'object') {
        return {};
    }

    const cleaned = {};
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        const strVal = String(value).trim();
        if (strVal === '') return;

        // Bỏ qua giá trị mặc định 'ALL' trên các trường lọc phân loại
        if (
            [
                'risk_level',
                'risk',
                'province',
                'province_code',
                'area',
                'region',
                'district',
                'a1_rule_group',
                'group',
                'a4_flag'
            ].includes(key) &&
            strVal.toUpperCase() === 'ALL'
        ) {
            return;
        }

        cleaned[key] = typeof value === 'boolean' ? value : strVal;
    });

    return cleaned;
};

/**
 * ------------------------------------------------------------------------------
 * 1. FETCH & LỌC DỮ LIỆU KHÔNG GIAN TRẠM PHÁT SÓNG ĐỊNH DẠNG CHUẨN GEOJSON
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/spatial/stations-geojson
 * @param {Object|string} params - Bộ lọc: { risk_level, area, province, search, is_anomaly, bbox } hoặc chuỗi 'HIGH'/'MEDIUM'/'LOW'/'ALL'
 * @returns {Promise<Object>} Đối tượng chuẩn GeoJSON FeatureCollection
 *          ({ type: 'FeatureCollection', features: [...] }) dùng trực tiếp cho <GeoJSON />
 */
export const getStationsGeoJSON = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/stations-geojson', { params: queryParams });
    return response.data?.data || response.data;
};

// Alias hỗ trợ linh hoạt tên hàm khi import bên phía component bản đồ của Quý & Trường
export const fetchStationsGeoJSON = getStationsGeoJSON;

/**
 * Lấy dữ liệu GeoJSON kèm đầy đủ thông tin thống kê (summary) và bộ lọc đang áp dụng (filters)
 * @param {Object|string} params - Bộ lọc: { risk_level, area, province, search, is_anomaly, bbox }
 */
export const getStationsGeoJSONWithMeta = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/stations-geojson', { params: queryParams });
    return response.data;
};

/**
 * Hàm lọc chuyên biệt dữ liệu không gian GeoJSON theo mức độ rủi ro và khu vực
 * @param {string} riskLevel - 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
 * @param {string} area - Tên khu vực / quận / tỉnh thành (VD: 'Binh Thanh', 'Thu Duc', 'ALL')
 * @param {string} search - Từ khóa tìm kiếm mã trạm hoặc tên trạm
 */
export const getFilteredStationsGeoJSON = async (riskLevel = 'ALL', area = 'ALL', search = '') => {
    return getStationsGeoJSON({
        risk_level: riskLevel,
        area,
        search
    });
};

/**
 * ------------------------------------------------------------------------------
 * 2. CHUYỂN ĐỔI GEOJSON SANG MẢNG TỌA ĐỘ LỚP NHIỆT (HEATMAP LAYER)
 * ------------------------------------------------------------------------------
 * Lưu ý quan trọng trong WebGIS:
 * - Chuẩn PostGIS GeoJSON lưu tọa độ theo thứ tự: [longitude, latitude] ([kinh độ, vĩ độ]).
 * - Thư viện Leaflet / HeatmapLayer yêu cầu thứ tự: [latitude, longitude, intensity].
 * Hàm này tự động đảo trục tọa độ chuẩn xác để truyền cho HeatmapLayer.jsx.
 *
 * @param {Object} geojsonData - Dữ liệu GeoJSON FeatureCollection
 * @returns {Array<[number, number, number]>} Mảng tọa độ [[lat, lng, intensity], ...]
 */
export const extractHeatmapCoordinates = (geojsonData) => {
    if (!geojsonData || !Array.isArray(geojsonData.features)) {
        return [];
    }

    return geojsonData.features
        .map((feature) => {
            const coords = feature?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) {
                return null;
            }
            const [lng, lat] = coords;
            const riskLevel = String(feature?.properties?.risk_level || 'LOW').toUpperCase();
            const intensity = RISK_INTENSITY_MAP[riskLevel] ?? RISK_INTENSITY_MAP.LOW;
            return [lat, lng, intensity];
        })
        .filter(Boolean);
};

/**
 * ------------------------------------------------------------------------------
 * 3. TRÍCH XUẤT DANH SÁCH TỌA ĐỘ MARKER, VÙNG NHIỆT & THUỘC TÍNH KPI TRẠM CHO LEAFLET
 * ------------------------------------------------------------------------------
 * Chuẩn hóa từng Feature thành đối tượng trạm có sẵn:
 * - `position: [lat, lng]` (dùng cho cả <Marker /> trong MapContainer.jsx và <Circle /> trong HeatmapLayer.jsx)
 * - `name`, `risk`, `score`, `color` (tương thích 100% với cấu trúc vùng rủi ro trong HeatmapLayer.jsx của Quý)
 * - Đầy đủ 4 chỉ số KPI (`latency_ms`, `packet_loss_rate`, `jitter_ms`, `throughput_mbps`) cho Popup và Sidebar.jsx
 *
 * @param {Object} geojsonData - Dữ liệu GeoJSON FeatureCollection
 * @returns {Array<Object>} Danh sách trạm kèm tọa độ [lat, lng] và thông số KPI
 */
export const extractStationCoordinates = (geojsonData) => {
    if (!geojsonData || !Array.isArray(geojsonData.features)) {
        return [];
    }

    return geojsonData.features
        .map((feature) => {
            const coords = feature?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) {
                return null;
            }
            const [lng, lat] = coords;
            const props = feature.properties || {};
            const riskKey = String(props.risk_level || 'LOW').toUpperCase();
            const defaultScore = riskKey === 'HIGH' ? 85 : riskKey === 'MEDIUM' ? 55 : 20;

            return {
                ...props,
                id: feature.id ?? props.id,
                name: props.station_name || props.cell_name || props.name || props.station_code,
                risk: riskKey,
                risk_level: riskKey,
                risk_label_vn: props.risk_label_vn || RISK_LABEL_VN_MAP[riskKey] || riskKey,
                color: props.risk_color || RISK_COLOR_MAP[riskKey] || RISK_COLOR_MAP.LOW,
                risk_color: props.risk_color || RISK_COLOR_MAP[riskKey] || RISK_COLOR_MAP.LOW,
                score: props.risk_score ?? defaultScore,
                risk_score: props.risk_score ?? defaultScore,
                intensity: RISK_INTENSITY_MAP[riskKey] ?? RISK_INTENSITY_MAP.LOW,
                latitude: lat,
                longitude: lng,
                position: [lat, lng]
            };
        })
        .filter(Boolean);
};

/**
 * ------------------------------------------------------------------------------
 * 4. LẤY TRỰC TIẾP DỮ LIỆU TỔNG HỢP KHÔNG GIAN CHO BẢN ĐỒ SỐ (ALL-IN-ONE)
 * ------------------------------------------------------------------------------
 */
export const getSpatialMapData = async (params = {}) => {
    const responseData = await getStationsGeoJSONWithMeta(params);
    const geojson = responseData?.data || responseData;
    return {
        geojson,
        stations: extractStationCoordinates(geojson),
        heatmapPoints: extractHeatmapCoordinates(geojson),
        summary: responseData?.summary || null,
        filters: responseData?.filters || null
    };
};

/**
 * ------------------------------------------------------------------------------
 * 5. API GOM CỤM KHU VỰC SUY GIẢM CHẤT LƯỢNG MẠNG VNPT NET (POSTGIS CLUSTERING)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/spatial/clusters-geojson
 * Sử dụng PostGIS (ST_ClusterDBSCAN & ST_DWithin) gom cụm các Cell 4G LTE suy giảm
 * nằm gần nhau theo tọa độ và trả về GeoJSON Khu vực suy giảm kèm danh sách Cell lỗi bên trong.
 *
 * @param {Object} params - Tham số lọc & gom cụm:
 *   { radius: 3000, min_cells: 1, province_code: 'CTO'|'BTE'|'AGG', a1_rule_group: 'A1_rule_vh'|'A1_rule_kt', a4_flag: '...' }
 * @returns {Promise<Object>} GeoJSON FeatureCollection của các cụm khu vực suy giảm
 */
export const getDegradedClustersGeoJSON = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/clusters-geojson', { params: queryParams });
    return response.data?.data || response.data;
};

export const getVnptClustersGeoJSON = getDegradedClustersGeoJSON;
export const fetchDegradedClustersGeoJSON = getDegradedClustersGeoJSON;
export const fetchVnptClusters = getDegradedClustersGeoJSON;

/**
 * Lấy GeoJSON cụm khu vực suy giảm kèm đầy đủ metadata thống kê (summary, clustering_params, filters)
 * @param {Object} params - Tham số lọc & gom cụm
 */
export const getDegradedClustersWithMeta = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/clusters-geojson', { params: queryParams });
    return response.data;
};

/**
 * Chuyển đổi GeoJSON Cụm Khu vực suy giảm thành danh sách vùng cảnh báo chuẩn Leaflet
 * phục vụ trực tiếp cho MapContainer.jsx và HeatmapLayer.jsx của Võ Ngọc Quý:
 * - Mỗi cụm có `position: [centerLat, centerLng]`, `radius_meters`, `color`, `score`, `avg_kpi`, `a4_root_causes`
 * - Và mảng `cells` (danh sách các Cell lỗi bên trong cụm kèm `position: [lat, lng]` riêng của từng Cell)
 *
 * @param {Object} clusterGeoJSON - GeoJSON FeatureCollection từ API /spatial/clusters-geojson
 * @returns {Array<Object>} Danh sách các Khu vực suy giảm chất lượng mạng
 */
export const extractClusterZonesForMap = (clusterGeoJSON) => {
    if (!clusterGeoJSON || !Array.isArray(clusterGeoJSON.features)) {
        return [];
    }

    return clusterGeoJSON.features
        .map((feature) => {
            const coords = feature?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) {
                return null;
            }
            const [centerLng, centerLat] = coords;
            const props = feature.properties || {};
            const riskKey = String(props.risk_level || 'HIGH').toUpperCase();
            const innerCells = Array.isArray(props.cells)
                ? props.cells.map((cell) => ({
                      ...cell,
                      position: [Number(cell.latitude), Number(cell.longitude)]
                  }))
                : [];

            return {
                ...props,
                id: feature.id ?? props.cluster_id,
                name: props.cluster_name || props.name || props.cluster_code,
                risk: riskKey,
                risk_level: riskKey,
                color: props.risk_color || RISK_COLOR_MAP[riskKey] || '#ef4444',
                score: props.risk_score ?? 85,
                latitude: centerLat,
                longitude: centerLng,
                position: [centerLat, centerLng],
                radius_meters: props.radius_meters || 1500,
                cells: innerCells
            };
        })
        .filter(Boolean);
};

/**
 * Lấy trọn bộ dữ liệu Cụm Khu vực suy giảm VNPT NET cho Bản đồ WebGIS & Sidebar chỉ với 1 lần gọi:
 * - geojson: FeatureCollection gốc của các khu vực suy giảm
 * - clusters: Danh sách vùng cụm đã chuẩn hóa [lat, lng] cho <Circle /> của HeatmapLayer.jsx
 * - degradedCells: Danh sách phẳng (flat list) toàn bộ các Cell lỗi bên trong các cụm cho <Marker /> & Sidebar
 * - heatmapPoints: Mảng [[lat, lng, intensity], ...] của toàn bộ Cell lỗi
 * - summary: Thống kê tổng số cụm, số Cell lỗi Vận hành (A1_rule_vh) & Kỹ thuật (A1_rule_kt)
 *
 * @param {Object} params - { radius, min_cells, province_code, a1_rule_group, a4_flag }
 */
export const getVnptClusterMapData = async (params = {}) => {
    const responseData = await getDegradedClustersWithMeta(params);
    const geojson = responseData?.data || responseData;
    const clusters = extractClusterZonesForMap(geojson);
    const degradedCells = clusters.flatMap((cluster) =>
        (cluster.cells || []).map((cell) => ({
            ...cell,
            cluster_id: cluster.cluster_id,
            cluster_code: cluster.cluster_code,
            cluster_name: cluster.cluster_name
        }))
    );
    const heatmapPoints = degradedCells.map((cell) => [
        cell.latitude,
        cell.longitude,
        RISK_INTENSITY_MAP[cell.risk_level] ?? 1.0
    ]);

    return {
        geojson,
        clusters,
        degradedCells,
        heatmapPoints,
        summary: responseData?.summary || null,
        filters: responseData?.filters || null,
        clusteringParams: responseData?.clustering_params || null
    };
};

/**
 * ------------------------------------------------------------------------------
 * 6. API GEOJSON CHI TIẾT TỪNG CELL 4G LTE VNPT NET (MÔ HÌNH 1 TRẠM - 3 CELL)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/spatial/cells-geojson
 * @param {Object} params - { province_code: 'CTO'|'BTE'|'AGG', a1_rule_group: 'A1_rule_vh'|'A1_rule_kt', is_anomaly, node_name, search }
 */
export const getVnptCellsGeoJSON = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/cells-geojson', { params: queryParams });
    return response.data?.data || response.data;
};

export const fetchVnptCellsGeoJSON = getVnptCellsGeoJSON;
export const getNetworkCellsGeoJSON = getVnptCellsGeoJSON;

/**
 * Lấy dữ liệu GeoJSON của các Cell 4G LTE kèm thống kê summary & filters
 */
export const getVnptCellsWithMeta = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/spatial/cells-geojson', { params: queryParams });
    return response.data;
};

/**
 * ------------------------------------------------------------------------------
 * 7. API THỐNG KÊ SỨC KHỎE CELL & ĐÁNH GIÁ QUY CHUẨN KPI VNPT NET (3 TẦNG)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/analytics/vnpt-cell-health
 * Thống kê tổng số Cell, số eNodeB, số Cell lỗi Nhóm Vận hành (A1_rule_vh),
 * Nhóm Kỹ thuật (A1_rule_kt), trung bình 4 chỉ số (CSSR, Service Drop, Traffic GB, Throughput)
 * và phân bố theo từng tỉnh (CTO, BTE, AGG).
 */
export const getVnptCellHealth = async () => {
    const response = await apiClient.get('/analytics/vnpt-cell-health');
    return response.data;
};

export const fetchVnptCellHealth = getVnptCellHealth;

/**
 * Đánh giá Rule-base Tầng 1 (5 Anomaly quy chuẩn VNPT NET) cho 1 Cell 4G LTE
 * Gọi API: POST /api/analytics/evaluate-vnpt-cell
 * @param {Object} cellOrKpi - { traffic_gb, cssr, service_drop_all, traffic_percent_hour, user_dl_avg_thput_percent_hour }
 */
export const evaluateVnptCell = async (cellOrKpi = {}) => {
    const source = cellOrKpi?.properties || cellOrKpi;
    const payload = {
        traffic_gb: Number(source.traffic_gb),
        cssr: Number(source.cssr),
        service_drop_all: Number(source.service_drop_all),
        traffic_percent_hour:
            source.traffic_percent_hour !== undefined ? Number(source.traffic_percent_hour) : 100,
        user_dl_avg_thput_percent_hour:
            source.user_dl_avg_thput_percent_hour !== undefined
                ? Number(source.user_dl_avg_thput_percent_hour)
                : 100
    };

    const response = await apiClient.post('/analytics/evaluate-vnpt-cell', payload);
    return response.data;
};

export const evaluateVnptCellRule = evaluateVnptCell;

/**
 * Hàm tiện ích tính toán trực tiếp các chỉ số KPI & Trọng số lỗi (Weight) từ bản ghi
 * Raw Counter Ericsson (62 cột từ file PMS_4G_MN_Raw_Counter_ERICSSON)
 */
export const calculateEricssonCounterMetrics = (rawRow = {}) => {
    const num = (val) => Number(val) || 0;
    const cellName = String(rawRow.CELL_NAME || rawRow.cell_name || '');
    const provinceCode = cellName.slice(-3).toUpperCase();

    const rrcAtt = num(rawRow.pmRrcConnEstabAtt);
    const rrcReatt = num(rawRow.pmRrcConnEstabAttReatt);
    const rrcSucc = num(rawRow.pmRrcConnEstabSucc);
    const rrcDenom = rrcAtt - rrcReatt;
    const rrcFailure = Math.max(0, rrcDenom - rrcSucc);
    const rrcFailureRate = rrcDenom > 0 ? (100 * rrcFailure) / rrcDenom : 0;
    const rrcFailureWeight = rrcFailure * rrcFailureRate;

    const s1Att = num(rawRow.pmS1SigConnEstabAtt);
    const s1Succ = num(rawRow.pmS1SigConnEstabSucc);
    const s1Failure = Math.max(0, s1Att - s1Succ);
    const s1FailureRate = s1Att > 0 ? (100 * s1Failure) / s1Att : 0;
    const s1FailureWeight = s1Failure * s1FailureRate;

    const erabAtt = num(rawRow.pmErabEstabAttInit);
    const erabSucc = num(rawRow.pmErabEstabSuccInit);
    const erabFailure = Math.max(0, erabAtt - erabSucc);
    const erabFailureRate = erabAtt > 0 ? (100 * erabFailure) / erabAtt : 0;
    const erabFailureWeight = erabFailure * erabFailureRate;

    const hoPrepAtt = num(rawRow.pmHoPrepAttLteIntraF);
    const hoPrepSucc = num(rawRow.pmHoPrepSuccLteIntraF);
    const hoPrepFailure = Math.max(0, hoPrepAtt - hoPrepSucc);
    const hoPrepFailureRate = hoPrepAtt > 0 ? (100 * hoPrepFailure) / hoPrepAtt : 0;
    const hoPrepFailureWeight = hoPrepFailure * hoPrepFailureRate;

    const hoExeAtt = num(rawRow.pmHoExeAttLteIntraF);
    const hoExeSucc = num(rawRow.pmHoExeSuccLteIntraF);
    const hoExeFailure = Math.max(0, hoExeAtt - hoExeSucc);
    const hoExeFailureRate = hoExeAtt > 0 ? (100 * hoExeFailure) / hoExeAtt : 0;
    const hoExeFailureWeight = hoExeFailure * hoExeFailureRate;

    const erabAbnEnbAct = num(rawRow.pmErabRelAbnormalEnbAct);
    const erabAbnMmeAct = num(rawRow.pmErabRelAbnormalMmeAct);
    const erabNormalRel = num(rawRow.pmErabRelNormalEnb) + num(rawRow.pmErabRelMme);
    const erabRelAbnormalRate = erabNormalRel > 0 ? (100 * erabAbnEnbAct) / erabNormalRel : 0;
    const erabRelAbnormalWeight = erabAbnEnbAct * erabRelAbnormalRate;

    const cssr =
        rrcDenom > 0 && s1Att > 0 && erabAtt > 0
            ? 100 * (rrcSucc / rrcDenom) * (s1Succ / s1Att) * (erabSucc / erabAtt)
            : 0;
    const serviceDropAll =
        erabNormalRel > 0 ? (100 * (erabAbnEnbAct + erabAbnMmeAct)) / erabNormalRel : 0;

    const pdcpDl = num(rawRow.pmPdcpVolDlDrb);
    const pdcpUl = num(rawRow.pmPdcpVolUlDrb);
    const pdcpDlLastTti = num(rawRow.pmPdcpVolDlDrbLastTTI);
    const thpTimeDl = num(rawRow.pmUeThpTimeDl);

    const trafficGb = (pdcpDl + pdcpUl) / 8_000_000;
    const userDlAvgThput = thpTimeDl > 0 ? (pdcpDl - pdcpDlLastTti) / thpTimeDl : 0;

    return {
        cell_name: cellName,
        node_name: rawRow.NODE_NAME || rawRow.node_name || '',
        province: rawRow.PROVINCE || rawRow.province || '',
        province_code: provinceCode,
        cssr: Number(cssr.toFixed(2)),
        service_drop_all: Number(serviceDropAll.toFixed(2)),
        traffic_gb: Number(trafficGb.toFixed(4)),
        user_dl_avg_thput: Number(userDlAvgThput.toFixed(2)),
        rrcfailure: rrcFailure,
        rrcfailurerate: Number(rrcFailureRate.toFixed(4)),
        rrcfailureweight: Number(rrcFailureWeight.toFixed(4)),
        s1signallingfailure: s1Failure,
        s1signallingfailurerate: Number(s1FailureRate.toFixed(4)),
        s1signallingfailureweight: Number(s1FailureWeight.toFixed(4)),
        erabfailure: erabFailure,
        erabfailurerate: Number(erabFailureRate.toFixed(4)),
        erabfailureweight: Number(erabFailureWeight.toFixed(4)),
        hoprepfailure: hoPrepFailure,
        hoprepfailurerate: Number(hoPrepFailureRate.toFixed(4)),
        hoprepfailureweight: Number(hoPrepFailureWeight.toFixed(4)),
        hoexefailure: hoExeFailure,
        hoexefailurerate: Number(hoExeFailureRate.toFixed(4)),
        hoexefailureweight: Number(hoExeFailureWeight.toFixed(4)),
        erabrelabnormalrate: Number(erabRelAbnormalRate.toFixed(4)),
        erabrelabnormalweight: Number(erabRelAbnormalWeight.toFixed(4))
    };
};

/**
 * ------------------------------------------------------------------------------
 * 8. API DANH SÁCH & BỘ LỌC TRẠM PHÁT SÓNG CHO SIDEBAR (MINH TRƯỜNG)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/stations?risk_level=...&search=...
 */
export const getAllStations = async (params = {}) => {
    const queryParams = normalizeFilterParams(params);
    const response = await apiClient.get('/stations', { params: queryParams });
    return response.data;
};

export const getStations = getAllStations;
export const fetchStations = getAllStations;

/**
 * Trả về trực tiếp mảng danh sách trạm `data` từ API GET /api/stations
 */
export const getStationsList = async (params = {}) => {
    const result = await getAllStations(params);
    return Array.isArray(result?.data) ? result.data : [];
};

/**
 * ------------------------------------------------------------------------------
 * 9. API THỐNG KÊ TRẠM RỦI RO CAO, TỔNG QUAN MẠNG & TOP KHẨN CẤP (THẠO & DUY)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/stats/high-risk
 */
export const getHighRiskStats = async () => {
    const response = await apiClient.get('/stats/high-risk');
    return response.data;
};

export const getHighRiskStations = getHighRiskStats;
export const fetchHighRiskStats = getHighRiskStats;

/**
 * Lấy thống kê tổng quan toàn mạng theo 3 mức rủi ro (HIGH, MEDIUM, LOW) & trung bình KPI
 * Gọi API: GET /api/stats/summary
 */
export const getNetworkSummary = async () => {
    const response = await apiClient.get('/stats/summary');
    return response.data;
};

export const fetchNetworkSummary = getNetworkSummary;

/**
 * Lấy danh sách Top trạm có nguy cơ suy giảm cao nhất cần ưu tiên xử lý khẩn cấp
 * Gọi API: GET /api/analytics/top-risk?limit=...
 */
export const getTopRiskStations = async (limit = 5) => {
    const response = await apiClient.get('/analytics/top-risk', {
        params: { limit }
    });
    return response.data;
};

export const fetchTopRiskStations = getTopRiskStations;

/**
 * ------------------------------------------------------------------------------
 * 10. API TRUY VẤN BÁN KÍNH KHÔNG GIAN POSTGIS & SỨC KHỎE MẠNG (DUY)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/analytics/nearby?lat=...&lng=...&radius=...
 */
export const getStationsNearby = async (lat, lng, radius = 3000) => {
    const response = await apiClient.get('/analytics/nearby', {
        params: { lat, lng, radius }
    });
    return response.data;
};

export const fetchStationsNearby = getStationsNearby;

/**
 * Lấy chỉ số sức khỏe tổng thể toàn mạng viễn thông (Network Health Summary)
 * Gọi API: GET /api/analytics/network-health
 */
export const getNetworkHealth = async () => {
    const response = await apiClient.get('/analytics/network-health');
    return response.data;
};

export const fetchNetworkHealth = getNetworkHealth;

/**
 * ------------------------------------------------------------------------------
 * 11. API DỰ BÁO NGUY CƠ SUY GIẢM MẠNG QUA AI GATEWAY (XGBOOST / LSTM FASTAPI)
 * ------------------------------------------------------------------------------
 * Gọi API: POST /api/analytics/predict-risk
 */
export const predictStationRisk = async (kpiOrStation = {}) => {
    const source = kpiOrStation?.properties || kpiOrStation;
    const payload = {
        latency_ms: Number(source.latency_ms),
        packet_loss_rate: Number(source.packet_loss_rate),
        jitter_ms: Number(source.jitter_ms),
        throughput_mbps: Number(source.throughput_mbps)
    };

    const response = await apiClient.post('/analytics/predict-risk', payload);
    return response.data;
};

export const predictRisk = predictStationRisk;
export const predictNetworkRisk = predictStationRisk;

/**
 * ------------------------------------------------------------------------------
 * 12. TỔNG HỢP DỮ LIỆU TOÀN DIỆN CHO DASHBOARD WEBGIS & VNPT NET NOC
 * ------------------------------------------------------------------------------
 * Gọi song song các API Không gian GeoJSON, Sức khỏe mạng, Thống kê rủi ro cao
 * và Top trạm khẩn cấp để đồng bộ toàn bộ Dashboard chỉ trong 1 lần gọi.
 */
export const getDashboardOverview = async (filters = {}) => {
    const [spatialData, networkHealth, highRiskStats, topRiskStations] = await Promise.all([
        getSpatialMapData(filters),
        getNetworkHealth(),
        getHighRiskStats(),
        getTopRiskStations(5)
    ]);

    return {
        ...spatialData,
        networkHealth: networkHealth?.data || networkHealth,
        highRiskStats: highRiskStats?.data || [],
        highRiskCount: highRiskStats?.high_risk_count ?? 0,
        topRiskStations: topRiskStations?.data || []
    };
};

/**
 * Tổng hợp dữ liệu chuyên biệt theo mô hình VNPT NET 3 Tầng (Gom cụm Khu vực suy giảm +
 * Thống kê Sức khỏe Cell 4G LTE + Thống kê Tổng quan Mạng) cho Quý và Trường.
 */
export const getVnptDashboardOverview = async (params = {}) => {
    const [clusterMapData, cellHealthRes, networkSummaryRes] = await Promise.all([
        getVnptClusterMapData(params),
        getVnptCellHealth(),
        getNetworkSummary()
    ]);

    return {
        ...clusterMapData,
        cellHealth: cellHealthRes?.data || cellHealthRes,
        networkSummary: networkSummaryRes?.data || networkSummaryRes
    };
};

/**
 * Kiểm tra trạng thái hoạt động của máy chủ Backend
 * Gọi API: GET /api/health
 */
export const checkBackendHealth = async () => {
    const response = await apiClient.get('/health');
    return response.data;
};

export default apiClient;
