// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE DỮ LIỆU KHÔNG GIAN ĐỊA LÝ & GOM CỤM POSTGIS (GEOJSON)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Ngọc Lân (Full-stack API Không gian - PostGIS)
// ==============================================================================

const express = require('express');
const router = express.Router();

// Nạp controller xử lý truy vấn không gian PostGIS (ST_AsGeoJSON, ST_ClusterDBSCAN, ST_DWithin)
const spatialController = require('../controllers/spatialController');

/**
 * ------------------------------------------------------------------------------
 * 1. TUYẾN ĐƯỜNG: LẤY DỮ LIỆU TỌA ĐỘ TRẠM PHÁT SÓNG ĐỊNH DẠNG CHUẨN GEOJSON
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/spatial/stations-geojson
 * Tham số query (tùy chọn): ?risk_level=HIGH&area=...&search=...&is_anomaly=true&bbox=...
 * (Hỗ trợ thêm ?mode=clusters hoặc ?source=cells)
 */
router.get('/stations-geojson', spatialController.getStationsGeoJSON);

/**
 * ------------------------------------------------------------------------------
 * 2. TUYẾN ĐƯỜNG: GOM CỤM KHU VỰC SUY GIẢM CHẤT LƯỢNG MẠNG VNPT NET (POSTGIS)
 * ------------------------------------------------------------------------------
 * Endpoints:
 * - GET /api/spatial/clusters-geojson
 * - GET /api/spatial/vnpt-clusters
 * - GET /api/spatial/degraded-clusters
 * - GET /api/spatial/clusters
 * Tham số query (tùy chọn): ?radius=3000&min_cells=1&province_code=CTO&a1_rule_group=A1_rule_vh&a4_flag=...
 * Mô tả: Dùng PostGIS ST_ClusterDBSCAN và ST_DWithin gom cụm các Cell suy giảm tập trung
 *        gần nhau theo tọa độ và trả về GeoJSON Khu vực suy giảm (kèm danh sách Cell lỗi bên trong).
 */
router.get('/clusters-geojson', spatialController.getDegradedClustersGeoJSON);
router.get('/vnpt-clusters', spatialController.getDegradedClustersGeoJSON);
router.get('/degraded-clusters', spatialController.getDegradedClustersGeoJSON);
router.get('/clusters', spatialController.getDegradedClustersGeoJSON);

/**
 * ------------------------------------------------------------------------------
 * 3. TUYẾN ĐƯỜNG: LẤY DỮ LIỆU GEOJSON CHI TIẾT TỪNG CELL 4G LTE VNPT NET
 * ------------------------------------------------------------------------------
 * Endpoints:
 * - GET /api/spatial/cells-geojson
 * - GET /api/spatial/vnpt-cells
 * Tham số query (tùy chọn): ?province_code=CTO&a1_rule_group=A1_rule_vh&is_anomaly=true&node_name=...
 */
router.get('/cells-geojson', spatialController.getVnptCellsGeoJSON);
router.get('/vnpt-cells', spatialController.getVnptCellsGeoJSON);

module.exports = router;
