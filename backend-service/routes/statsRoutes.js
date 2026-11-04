// ============================================================
// 1. IMPORT THƯ VIỆN & CONTROLLER
// ============================================================

// Express: dùng để khởi tạo bộ định tuyến (Router) quản lý các đường dẫn API.
const express = require('express');
const router = express.Router();

// Import hàm xử lý nghiệp vụ `getHighRiskAreas` từ `controllers/statsController.js`.
const { getHighRiskAreas } = require('../controllers/statsController');


// ============================================================
// 2. ĐỊNH NGHĨA ROUTE (ĐƯỜNG DẪN API)
// ============================================================

// API thống kê trạm rủi ro cao: GET /api/stats/high-risk
// Lưu ý: tiền tố `/api/stats` đã được khai báo tại `server.js` thông qua:
//   app.use('/api/stats', require('./routes/statsRoutes'));
// Do đó tại đây chỉ cần khai báo đường dẫn con là `/high-risk`.
router.get('/high-risk', getHighRiskAreas);


// ============================================================
// 3. EXPORT ROUTER
// ============================================================

// Xuất đối tượng router để kết nối vào ứng dụng chính tại `server.js`.
module.exports = router;