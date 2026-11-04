// ============================================================
// 1. IMPORT CÁC THƯ VIỆN CẦN THIẾT
// ============================================================

// Express: framework web mạnh mẽ và phổ biến nhất của hệ sinh thái Node.js.
// Dùng để tạo máy chủ HTTP, quản lý định tuyến (routing) và middleware.
const express = require('express');

// CORS (Cross-Origin Resource Sharing): cơ chế an toàn cho phép tài nguyên từ
// domain/port này được truy cập bởi domain/port khác (Ví dụ: Frontend React chạy
// tại http://localhost:5173 gọi API của Backend tại http://localhost:5000).
const cors = require('cors');

// dotenv: đọc file cấu hình môi trường `.env` và nạp vào đối tượng `process.env`.
// Giúp bảo mật thông tin nhạy cảm (cổng kết nối, tài khoản database, mật khẩu).
require('dotenv').config();

// ============================================================
// 2. KHỞI TẠO ỨNG DỤNG EXPRESS
// ============================================================
const app = express();

// ============================================================
// 3. CẤU HÌNH MIDDLEWARE
// Middleware là các hàm trung gian xử lý request trước khi đến route handler.
// ============================================================

// Cho phép chia sẻ tài nguyên chéo cổng (CORS) cho toàn bộ API
app.use(cors());

// Tự động phân tích (parse) nội dung request body có định dạng JSON thành Object JS
app.use(express.json());

// Phân tích dữ liệu dạng urlencoded (hữu ích khi nhận form data từ client)
app.use(express.urlencoded({ extended: true }));

// ============================================================
// 4. ĐỊNH NGHĨA CÁC ĐƯỜNG DẪN API (ROUTES)
// ============================================================

/**
 * [Route 1] - Health Check: Kiểm tra trạng thái máy chủ
 * Phương thức: GET /api/health
 * Mục đích: Cho phép hệ thống giám sát hoặc phía Frontend kiểm tra server có đang sống không.
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'VNPT NetGuard AIOps Backend API đang hoạt động ổn định',
        timestamp: new Date().toISOString()
    });
});

/**
 * [Route 2] - Module Phân tích Sức khỏe Mạng & Không gian PostGIS (Core Tech Lead)
 * Phụ trách: Nguyễn Ngọc Duy (Tech Lead & Core Developer)
 * - GET /api/analytics/network-health: Thống kê chỉ số AIOps toàn mạng viễn thông.
 * - GET /api/analytics/nearby: Truy vấn bán kính trạm viễn thông theo hàm ST_DWithin của PostGIS.
 */
const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

// ============================================================
// 5. XỬ LÝ LỖI TOÀN CỤC (GLOBAL ERROR HANDLING)
// ============================================================

// Middleware bắt các route không tồn tại (Lỗi 404 Not Found)
app.use((req, res, next) => {
    res.status(404).json({
        status: 'error',
        message: `Đường dẫn ${req.originalUrl} không tồn tại trên hệ thống API!`
    });
});

// Middleware xu ly loi noi bo may chu (Loi 500 Internal Server Error)
app.use((err, req, res, next) => {
    console.error('[SERVER ERROR]:', err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Đã xảy ra lỗi bên trong máy chủ backend!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// ============================================================
// 6. KHỞI ĐỘNG MÁY CHỦ HTTP
// ============================================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`[INFO] VNPT NetGuard Backend Server dang chay tai port ${PORT}`);
    console.log(`[ROUTE] Health Check API: http://localhost:${PORT}/api/health`);
    console.log(`[ROUTE] Analytics API:    http://localhost:${PORT}/api/analytics/network-health`);
    console.log(`[ROUTE] Spatial Nearby:   http://localhost:${PORT}/api/analytics/nearby?lat=10.8018&lng=106.7114&radius=3000`);
    console.log(`[ROUTE] High Risk Stats:  http://localhost:${PORT}/api/stats/high-risk`);
    console.log('====================================================');
});
