// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE THỐNG KÊ TRẠM RỦI RO CAO & TỔNG QUAN MẠNG NỘI BỘ
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Anh Thao (MSSV: 054205001770) - Backend Developer
// ==============================================================================

// Import framework Express để khởi tạo đối tượng định tuyến Router
const express = require('express');
const router = express.Router();

// Import các hàm xử lý nghiệp vụ getHighRiskAreas và getNetworkSummary từ controller
const { getHighRiskAreas, getNetworkSummary, getCellErrorStats } = require('../controllers/statsController');

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

/**
  * ------------------------------------------------------------------------------
  * ĐỊNH NGHĨA ROUTE 3: THỐNG KÊ CELL LỖI THEO NHÓM A1 (CELL ERROR STATS)
  * ------------------------------------------------------------------------------
  * Endpoint hoàn chỉnh: GET /api/stats/cell-errors
  *
  * Nghiệp vụ bổ sung Mốc Tuần 4:
  * - Đếm số Cell lỗi Vận hành (A1_rule_vh).
  * - Đếm số Cell lỗi Kỹ thuật (A1_rule_kt).
  * - Thống kê tổng Cell, Cell bình thường và Cell chưa đủ dữ liệu.
  * - Hỗ trợ lọc theo mã tỉnh (province_code) hoặc tên trạm (node_name).
  *
  * Dữ liệu lấy từ bảng network_cells do nhóm xây dựng.
  * Kết quả có thể dùng cho Frontend Dashboard của Minh Trường.
  * Không ảnh hưởng các route thống kê trạm hiện có.
  */
 router.get('/cell-errors', getCellErrorStats);

 // Xuất đối tượng router để đăng ký vào ứng dụng Express tại server.js
 module.exports = router;