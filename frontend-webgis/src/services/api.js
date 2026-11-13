// ==============================================================================
// TẦNG DỊCH VỤ API KHÔNG GIAN, THỐNG KÊ & DỰ BÁO AI (AXIOS API SERVICE)
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
 * - Cho phép truyền trực tiếp chuỗi mức rủi ro (VD: 'HIGH', 'ALL') hoặc object { risk_level, area, province, search, ... }
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
            ['risk_level', 'risk', 'province', 'area', 'region', 'district'].includes(key) &&
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
                name: props.station_name || props.name || props.station_code,
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
 * Chỉ gọi 1 request duy nhất tới Backend và trả về đồng thời:
 * - geojson: Dữ liệu gốc FeatureCollection cho <GeoJSON />
 * - stations: Danh sách tọa độ [lat, lng] + KPI cho <Marker />, <HeatmapLayer /> & <Sidebar />
 * - heatmapPoints: Mảng [lat, lng, intensity] cho lớp nhiệt
 * - summary: Thống kê nhanh số trạm theo mức rủi ro
 * - filters: Bộ lọc đang áp dụng
 *
 * @param {Object|string} params - Bộ lọc tùy chọn: { risk_level, area, province, search, is_anomaly }
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
 * 5. API DANH SÁCH & BỘ LỌC TRẠM PHÁT SÓNG CHO SIDEBAR (MINH TRƯỜNG)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/stations?risk_level=...&search=...
 * @param {Object|string} params - Bộ lọc: { risk_level: 'ALL'|'HIGH'|'MEDIUM'|'LOW', search: '...' }
 * @returns {Promise<Object>} Phản hồi từ Backend ({ status, total_stations, filters, data: [...] })
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
 * @param {Object|string} params - Bộ lọc: { risk_level, search }
 * @returns {Promise<Array<Object>>} Mảng các trạm phát sóng
 */
export const getStationsList = async (params = {}) => {
    const result = await getAllStations(params);
    return Array.isArray(result?.data) ? result.data : [];
};

/**
 * ------------------------------------------------------------------------------
 * 6. API THỐNG KÊ TRẠM NGUY CƠ SUY GIẢM CAO & TOP KHẨN CẤP (THẠO & DUY)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/stats/high-risk
 * @returns {Promise<Object>} { status, message, high_risk_count, data: [...] }
 */
export const getHighRiskStats = async () => {
    const response = await apiClient.get('/stats/high-risk');
    return response.data;
};

export const getHighRiskStations = getHighRiskStats;
export const fetchHighRiskStats = getHighRiskStats;

/**
 * Lấy danh sách Top trạm có nguy cơ suy giảm cao nhất cần ưu tiên xử lý khẩn cấp
 * Gọi API: GET /api/analytics/top-risk?limit=...
 * @param {number} limit - Số lượng trạm muốn lấy (mặc định 5)
 * @returns {Promise<Object>} { status, message, total_returned, data: [...] }
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
 * 7. API TRUY VẤN BÁN KÍNH KHÔNG GIAN POSTGIS & SỨC KHỎE MẠNG (DUY)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/analytics/nearby?lat=...&lng=...&radius=...
 * @param {number} lat - Vĩ độ tâm tìm kiếm
 * @param {number} lng - Kinh độ tâm tìm kiếm
 * @param {number} radius - Bán kính quét tính bằng mét (mặc định 3000m)
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
 * 8. API DỰ BÁO NGUY CƠ SUY GIẢM MẠNG QUA AI GATEWAY (XGBOOST FASTAPI)
 * ------------------------------------------------------------------------------
 * Gọi API: POST /api/analytics/predict-risk
 * Cho phép truyền trực tiếp object trạm (station) hoặc 4 chỉ số KPI:
 * { latency_ms, packet_loss_rate, jitter_ms, throughput_mbps }
 *
 * @param {Object} kpiOrStation - Đối tượng chứa 4 thông số KPI mạng viễn thông
 * @returns {Promise<Object>} Kết quả dự báo AI ({ status, data_source, input_kpi, prediction, evaluated_at })
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
 * 9. TỔNG HỢP DỮ LIỆU TOÀN DIỆN CHO DASHBOARD WEBGIS (PARALLEL FETCH)
 * ------------------------------------------------------------------------------
 * Gọi song song các API Không gian GeoJSON, Sức khỏe mạng, Thống kê rủi ro cao
 * và Top trạm khẩn cấp để đồng bộ toàn bộ Dashboard chỉ trong 1 lần gọi.
 *
 * @param {Object|string} filters - Bộ lọc không gian tùy chọn ({ risk_level, area, search })
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
 * Kiểm tra trạng thái hoạt động của máy chủ Backend
 * Gọi API: GET /api/health
 */
export const checkBackendHealth = async () => {
    const response = await apiClient.get('/health');
    return response.data;
};

export default apiClient;
