// ============================================================
// IMPORT KẾT NỐI CƠ SỞ DỮ LIỆU CHUNG (dbConfig)
// ============================================================
const db = require('../config/dbConfig');

// ============================================================
// XỬ LÝ LOGIC CONTROLLER (THỐNG KÊ TRẠM RỦI RO CAO)
// ============================================================
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

        // Thực thi câu truy vấn thông qua kết nối dbConfig chung của nhóm
        const result = await db.query(query);

        // Trả về dữ liệu thành công (200 OK) kèm tổng số lượng trạm rủi ro cao
        return res.status(200).json({
            status: 'success',
            message: 'Thống kê các trạm có nguy cơ suy giảm chất lượng cao (HIGH)',
            high_risk_count: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        // Trả về mã lỗi 500 chuẩn kỹ thuật khi CSDL gặp sự cố
        console.error('[STATS ERROR]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi thống kê trạm rủi ro cao',
            details: error.message
        });
    }
};

// ============================================================
// EXPORT MODULE
// ============================================================
module.exports = {
    getHighRiskAreas
};