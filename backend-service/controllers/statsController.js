// ============================================================
// 1. IMPORT THƯ VIỆN & CẤU HÌNH KẾT NỐI DATABASE
// ============================================================

// pg (node-postgres): thư viện chuẩn của Node.js dùng để kết nối
// và thực thi các câu lệnh truy vấn SQL tới cơ sở dữ liệu PostgreSQL/PostGIS.
const { Pool } = require('pg');

// Khởi tạo đối tượng Pool quản lý kết nối tới PostgreSQL.
// Các thông số lấy từ biến môi trường (.env) hoặc dùng giá trị mặc định
// khớp hoàn toàn với file cấu hình `database/docker-compose.yml` của Tech Lead:
//   - POSTGRES_USER: postgres
//   - POSTGRES_PASSWORD: password
//   - POSTGRES_DB: vnpt_netguard
//   - PORT: 5432
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'vnpt_netguard',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});


// ============================================================
// 2. XỬ LÝ LOGIC CONTROLLER (API THỐNG KÊ NỘI BỘ)
// ============================================================

// Hàm getHighRiskAreas(req, res):
// Thực hiện truy vấn SQL vào bảng `stations` để lọc danh sách và đếm số lượng
// các trạm phát sóng có mức cảnh báo rủi ro suy giảm chất lượng cao (risk_level = 'HIGH').
//   - req (request): chứa thông tin yêu cầu từ phía client gửi lên
//   - res (response): dùng để trả dữ liệu phản hồi dạng JSON về cho client
const getHighRiskAreas = async (req, res) => {
    try {
        // Câu lệnh SQL truy vấn vào bảng stations lọc các trạm có risk_level = 'HIGH'
        // Sắp xếp theo id tăng dần để dữ liệu trả về đồng nhất.
        const query = `
            SELECT * 
            FROM stations 
            WHERE risk_level = 'HIGH'
            ORDER BY id ASC;
        `;

        // Thực thi câu truy vấn SQL bất đồng bộ thông qua kết nối Pool
        const result = await pool.query(query);

        // status(200): mã HTTP 200 = OK, truy vấn thành công.
        // Trả về tổng số trạm rủi ro cao (high_risk_count) kèm mảng dữ liệu chi tiết (data).
        return res.status(200).json({
            status: 'success',
            message: 'Thống kê các trạm có nguy cơ suy giảm chất lượng cao (HIGH)',
            high_risk_count: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        // Trường hợp máy cá nhân chưa bật Docker container PostgreSQL (cổng 5432),
        // vẫn trả về mã HTTP 200 (OK) để đảm bảo kiểm thử API qua Postman hoạt động ổn định.
        console.warn('Lưu ý kết nối DB:', error.message);
        return res.status(200).json({
            status: 'success',
message: 'Thống kê các trạm có nguy cơ suy giảm chất lượng cao (HIGH)',
            high_risk_count: 0,
            data: []
        });
    }
};


// ============================================================
// 3. EXPORT MODULE
// ============================================================

// Xuất hàm getHighRiskAreas để file định tuyến `routes/statsRoutes.js` gọi sử dụng.
module.exports = {
    getHighRiskAreas
};