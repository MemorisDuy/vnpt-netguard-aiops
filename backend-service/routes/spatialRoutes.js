// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE DỮ LIỆU KHÔNG GIAN ĐỊA LÝ POSTGIS (GEOJSON)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Ngọc Lân (Full-stack API Không gian - PostGIS)
// ==============================================================================

const express = require('express');
const router = express.Router();

// Nạp controller xử lý truy vấn không gian PostGIS (ST_AsGeoJSON)
const spatialController = require('../controllers/spatialController');

/**
 * ------------------------------------------------------------------------------
 * TUYẾN ĐƯỜNG: LẤY DỮ LIỆU TỌA ĐỘ TRẠM PHÁT SÓNG ĐỊNH DẠNG CHUẨN GEOJSON
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/spatial/stations-geojson
 * Tham số query (tùy chọn): ?risk_level=HIGH&province=...&is_anomaly=true
 * Mô tả: Truy vấn PostGIS ST_AsGeoJSON chuyển đổi tọa độ các trạm phát sóng
 *        thành cấu trúc GeoJSON FeatureCollection phục vụ bản đồ số WebGIS.
 */
router.get('/stations-geojson', spatialController.getStationsGeoJSON);

module.exports = router;

