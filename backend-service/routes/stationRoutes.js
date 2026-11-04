// ==============================================================================
// ROUTES: ĐỊNH TUYẾN API DANH SÁCH TRẠM PHÁT SÓNG (STATION ROUTES)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Minh Trường (Full-stack & UI Dashboard)
// ==============================================================================

// 1. Import thư viện Express và khởi tạo bộ định tuyến Router
const express = require('express');
const router = express.Router();

// 2. Import hàm xử lý nghiệp vụ `getAllStations` từ `controllers/stationController.js`
const { getAllStations } = require('../controllers/stationController');

/**
 * ------------------------------------------------------------------------------
 * TUYẾN ĐƯỜNG: LẤY DANH SÁCH TOÀN BỘ TRẠM PHÁT SÓNG
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/stations
 * Lưu ý: Tiền tố `/api/stations` được đăng ký tại `server.js` thông qua:
 *   app.use('/api/stations', stationRoutes);
 * Do đó tại đây chỉ cần khai báo đường dẫn gốc là `/`.
 */
router.get('/', getAllStations);

// 3. Xuất đối tượng router để kết nối vào ứng dụng chính tại `server.js`
module.exports = router;
