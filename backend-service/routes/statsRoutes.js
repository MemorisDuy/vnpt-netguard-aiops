// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE THỐNG KÊ TRẠM RỦI RO CAO NỘI BỘ
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Anh Thao (MSSV: 054205001770) - Backend Developer
// ==============================================================================

// Import framework Express để khởi tạo đối tượng định tuyến Router
const express = require('express');
const router = express.Router();

// Import hàm xử lý nghiệp vụ getHighRiskAreas từ controller tương ứng
const { getHighRiskAreas } = require('../controllers/statsController');

/**
 * ------------------------------------------------------------------------------
 * ĐỊNH NGHĨA ROUTE: THỐNG KÊ DANH SÁCH TRẠM NGUY CƠ CAO (HIGH RISK)
 * ------------------------------------------------------------------------------
 * Endpoint hoàn chỉnh: GET /api/stats/high-risk
 * Tiền tố `/api/stats` đã được khai báo tập trung tại file `server.js`.
 * Tại đây chỉ cần định nghĩa tuyến đường con `/high-risk`.
 */
router.get('/high-risk', getHighRiskAreas);

// Xuất đối tượng router để đăng ký vào ứng dụng Express tại server.js
module.exports = router;
