// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE THỐNG KÊ TRẠM RỦI RO CAO & TỔNG QUAN MẠNG NỘI BỘ
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Anh Thao (MSSV: 054205001770) - Backend Developer
// ==============================================================================

// Import framework Express để khởi tạo đối tượng định tuyến Router
const express = require('express');
const router = express.Router();

// Import các hàm xử lý nghiệp vụ getHighRiskAreas và getNetworkSummary từ controller
const { getHighRiskAreas, getNetworkSummary } = require('../controllers/statsController');

/**
 * ------------------------------------------------------------------------------
 * ĐỊNH NGHĨA ROUTE 1: THỐNG KÊ DANH SÁCH TRẠM NGUY CƠ CAO (HIGH RISK)
 * ------------------------------------------------------------------------------
 * Endpoint hoàn chỉnh: GET /api/stats/high-risk
 * Tiền tố `/api/stats` đã được khai báo tập trung tại file `server.js`.
 * Tại đây chỉ cần định nghĩa tuyến đường con `/high-risk`.
 */
router.get('/high-risk', getHighRiskAreas);

/**
 * ------------------------------------------------------------------------------
 * ĐỊNH NGHĨA ROUTE 2: THỐNG KÊ TỔNG QUAN TOÀN MẠNG (NETWORK SUMMARY)
 * ------------------------------------------------------------------------------
 * Endpoint hoàn chỉnh: GET /api/stats/summary
 * Tiền tố `/api/stats` đã được khai báo tập trung tại file `server.js`.
 * Nghiệp vụ: Thống kê số lượng trạm theo 3 mức rủi ro (HIGH, MEDIUM, LOW)
 * và trung bình KPI toàn mạng bàn giao cho Minh Trường hiển thị lên Dashboard.
 */
router.get('/summary', getNetworkSummary);

// Xuất đối tượng router để đăng ký vào ứng dụng Express tại server.js
module.exports = router;