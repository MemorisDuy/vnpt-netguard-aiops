// ============================================================
// 1. IMPORT CÁC THƯ VIỆN
// ============================================================

// Express: framework web phổ biến nhất của Node.js,
// dùng để tạo server, định nghĩa các route (đường dẫn API) và middleware.
const express = require('express');

// CORS (Cross-Origin Resource Sharing): cho phép frontend chạy ở
// domain/port khác (ví dụ React ở localhost:3000) gọi được API của backend
// (localhost:5000). Nếu không bật, trình duyệt sẽ chặn request.
const cors = require('cors');

// dotenv: đọc file `.env` ở thư mục gốc và nạp các biến trong đó
// vào `process.env`. Dùng để lưu cấu hình nhạy cảm (mật khẩu DB, API key, PORT...)
// mà không cần ghi cứng vào code.
// Lưu ý: phải gọi config() trước khi dùng bất kỳ process.env nào.
require('dotenv').config();


// ============================================================
// 2. KHỞI TẠO ỨNG DỤNG EXPRESS
// ============================================================

// Tạo một instance của Express, `app` chính là server của chúng ta.
const app = express();


// ============================================================
// 3. MIDDLEWARE
// Middleware là các hàm chạy "ở giữa" request và route handler.
// Mọi request đều đi qua chúng theo đúng thứ tự khai báo.
// ============================================================

// Bật CORS cho toàn bộ route, cho phép mọi origin truy cập.
// (Khi triển khai thật nên giới hạn: cors({ origin: 'https://ten-mien-cua-ban.com' }))
app.use(cors());

// Tự động parse body dạng JSON của request thành object JavaScript,
// gán vào `req.body`. Cần thiết cho các API POST/PUT gửi dữ liệu JSON.
app.use(express.json());


// ============================================================
// 4. ĐỊNH NGHĨA ROUTE
// ============================================================

// API kiểm tra "sức khỏe" (health check): GET /api/health
// Dùng để xác nhận server đang chạy; thường được các công cụ giám sát
// hoặc hệ thống deploy (Docker, AWS, Render...) gọi định kỳ.
//   - req (request): chứa thông tin client gửi lên (params, query, body, headers...)
//   - res (response): dùng để gửi dữ liệu phản hồi về client
app.get('/api/health', (req, res) => {
    // status(200): mã HTTP 200 = OK, yêu cầu thành công.
    // json({...}): trả về dữ liệu dạng JSON và tự đặt header Content-Type phù hợp.
    res.status(200).json({
        status: 'success',
        message: 'VNPT NetGuard API is running'
    });
});


// ============================================================
// 5. KHỞI ĐỘNG SERVER
// ============================================================

// Lấy cổng từ biến môi trường PORT (trong file .env hoặc do nền tảng hosting cấp).
// Nếu không có thì dùng giá trị mặc định là 5000.
const PORT = process.env.PORT || 5000;

// Bắt đầu lắng nghe request tại cổng PORT.
// Callback chạy một lần khi server đã khởi động thành công.
app.listen(PORT, () => {
    console.log(`Backend Server đang chạy tại port ${PORT}`);
});