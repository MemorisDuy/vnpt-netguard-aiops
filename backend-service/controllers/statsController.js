// ==============================================================================
// CONTROLLER: THỐNG KÊ DANH SÁCH TRẠM NGUY CƠ SUY GIẢM MẠNG CAO (HIGH RISK)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Anh Thao (MSSV: 054205001770) - Backend Developer
// ==============================================================================

// Import kết nối cơ sở dữ liệu PostgreSQL / PostGIS chung của nhóm từ dbConfig.js
const db = require('../config/dbConfig');

/**
 * ==============================================================================
 * HÀM XỬ LÝ: LỌC VÀ ĐẾM SỐ LƯỢNG TRẠM CÓ RỦI RO CAO (GET HIGH RISK AREAS)
 * ==============================================================================
 * Tuyến đường (Route): GET /api/stats/high-risk
 * Phương thức (Method): GET
 * Nghiệp vụ (Business Logic):
 * - Truy vấn vào bảng `stations` để lọc toàn bộ các trạm phát sóng đang ở trạng thái
 *   nguy cơ suy giảm chất lượng mạng cao (risk_level = 'HIGH').
 * - Sắp xếp kết quả trả về theo thứ tự tăng dần của id (ORDER BY id ASC) để đồng nhất dữ liệu.
 * - Đếm tổng số lượng bản ghi tìm được (result.rowCount) gán vào biến high_risk_count.
 * - Trả về mã phản hồi HTTP 200 OK kèm thông điệp và danh sách chi tiết các trạm.
 * - Bắt lỗi ngoại lệ (Exception Handling) và trả về mã lỗi HTTP 500 khi CSDL gặp sự cố.
 */
const getHighRiskAreas = async (req, res) => {
    try {
        // Câu lệnh truy vấn SQL lọc các trạm có mức cảnh báo rủi ro cao (HIGH)
        const query = `
            SELECT * 
            FROM stations 
            WHERE risk_level = 'HIGH'
            ORDER BY id ASC;
        `;

        // Thực thi câu lệnh SQL bất đồng bộ qua Connection Pool
        const result = await db.query(query);

        // Phản hồi kết quả thành công về cho client (Frontend / Postman)
        return res.status(200).json({
            status: 'success',
            message: 'Thống kê các trạm có nguy cơ suy giảm chất lượng cao (HIGH)',
            high_risk_count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        // Bắt lỗi hệ thống hoặc lỗi kết nối CSDL và ghi log có tiền tố chuẩn
        console.error('[STATS ERROR getHighRiskAreas]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi thống kê trạm rủi ro cao',
            details: error.message
        });
    }
};

// ==============================================================================
// XUẤT MODULE CONTROLLER ĐỂ ROUTER SỬ DỤNG
// ==============================================================================
module.exports = {
    getHighRiskAreas
};
