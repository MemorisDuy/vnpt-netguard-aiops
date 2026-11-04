// ==============================================================================
// TẦNG DỊCH VỤ API KHÔNG GIAN WEBGIS (AXIOS SPATIAL API SERVICE)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Ngọc Lân (Full-stack API Không gian - PostGIS)
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
 * ------------------------------------------------------------------------------
 * 1. FETCH DỮ LIỆU KHÔNG GIAN TRẠM PHÁT SÓNG ĐỊNH DẠNG CHUẨN GEOJSON
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/spatial/stations-geojson
 * @param {Object} params - Bộ lọc tùy chọn: { risk_level, province, is_anomaly }
 * @returns {Promise<Object>} Đối tượng chuẩn GeoJSON FeatureCollection
 *          ({ type: 'FeatureCollection', features: [...] }) dùng trực tiếp cho <GeoJSON />
 */
export const getStationsGeoJSON = async (params = {}) => {
    const response = await apiClient.get('/spatial/stations-geojson', { params });
    return response.data?.data || response.data;
};

// Alias hỗ trợ linh hoạt tên hàm khi import bên phía component bản đồ
export const fetchStationsGeoJSON = getStationsGeoJSON;

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
 * 3. TRÍCH XUẤT DANH SÁCH TỌA ĐỘ MARKER & THUỘC TÍNH KPI TRẠM CHO LEAFLET
 * ------------------------------------------------------------------------------
 * Chuẩn hóa từng Feature thành đối tượng trạm có sẵn `position: [lat, lng]`
 * để MapContainer.jsx dễ dàng render <Marker position={station.position} /> và Popup.
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
            return {
                ...feature.properties,
                id: feature.id ?? feature.properties?.id,
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
 * - stations: Danh sách tọa độ [lat, lng] + KPI cho <Marker /> & Sidebar
 * - heatmapPoints: Mảng [lat, lng, intensity] cho <HeatmapLayer />
 *
 * @param {Object} params - Bộ lọc tùy chọn: { risk_level, province, is_anomaly }
 */
export const getSpatialMapData = async (params = {}) => {
    const geojson = await getStationsGeoJSON(params);
    return {
        geojson,
        stations: extractStationCoordinates(geojson),
        heatmapPoints: extractHeatmapCoordinates(geojson)
    };
};

/**
 * ------------------------------------------------------------------------------
 * 5. TRUY VẤN CÁC TRẠM TRONG BÁN KÍNH KHÔNG GIAN POSTGIS (ST_DWithin)
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

/**
 * ------------------------------------------------------------------------------
 * 6. LẤY CHỈ SỐ SỨC KHỎE TỔNG THỂ TOÀN MẠNG VIỄN THÔNG (NETWORK HEALTH)
 * ------------------------------------------------------------------------------
 * Gọi API: GET /api/analytics/network-health
 */
export const getNetworkHealth = async () => {
    const response = await apiClient.get('/analytics/network-health');
    return response.data;
};

export default apiClient;

