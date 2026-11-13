// ==============================================================================
// CONTROLLER: QUẢN LÝ & LỌC DANH SÁCH TRẠM PHÁT SÓNG (stationController.js)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Minh Trường (Full-stack & UI Dashboard)
// ==============================================================================

// 1. Kết nối tới cơ sở dữ liệu PostgreSQL + PostGIS dùng chung của nhóm
const db = require('../config/dbConfig');

// 2. Hàm xử lý API: GET /api/stations
// Hỗ trợ lọc theo mức độ rủi ro (?risk_level=HIGH) và tìm kiếm (?search=...)
const getAllStations = async (req, res) => {
    try {
        // Bước 1: Lấy các tham số lọc từ đường dẫn URL (Query Parameters)
        // Hỗ trợ cả tên biến 'risk_level' hoặc 'risk' để thuận tiện khi kiểm thử
        const riskFilter = req.query.risk_level || req.query.risk;
        const searchKeyword = req.query.search;

        // Bước 2: Khởi tạo câu lệnh SQL gốc
        // Dùng "WHERE 1=1" để dễ dàng nối thêm các điều kiện "AND" ở bên dưới
        let query = `
            SELECT 
                id,
                station_code,
                station_name,
                province,
                latitude,
                longitude,
                latency_ms,
                packet_loss_rate,
                jitter_ms,
                throughput_mbps,
                risk_level,
                is_anomaly,
                updated_at
            FROM stations
            WHERE 1=1
        `;

        // Mảng values chứa các giá trị truyền vào vị trí $1, $2... trong câu SQL
        const values = [];

        // Bước 3: Nếu người dùng có chọn lọc theo mức độ rủi ro (LOW, MEDIUM, HIGH)
        if (riskFilter && riskFilter.toUpperCase() !== 'ALL') {
            values.push(riskFilter.toUpperCase());
            query += ` AND risk_level = $${values.length}`;
        }

        // Bước 4: Nếu người dùng có nhập từ khóa tìm kiếm (tìm theo tên trạm hoặc mã trạm)
        if (searchKeyword && searchKeyword.trim() !== '') {
            values.push(`%${searchKeyword.trim()}%`);
            // Toán tử ILIKE giúp tìm kiếm không phân biệt chữ hoa hay chữ thường
            query += ` AND (station_name ILIKE $${values.length} OR station_code ILIKE $${values.length})`;
        }

        // Bước 5: Sắp xếp danh sách trạm theo ID tăng dần để thứ tự hiển thị cố định
        query += ` ORDER BY id ASC;`;

        // Bước 6: Thực thi câu truy vấn thông qua Connection Pool của dbConfig
        const result = await db.query(query, values);

        // Bước 7: Trả về phản hồi HTTP 200 OK cùng danh sách trạm chuẩn định dạng JSON
        return res.status(200).json({
            status: 'success',
            message: 'Lấy danh sách trạm phát sóng thành công',
            filters: {
                risk_level: riskFilter || 'ALL',
                search: searchKeyword || ''
            },
            total_stations: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        // Bắt lỗi và trả về mã lỗi 500 khi cơ sở dữ liệu gặp sự cố
        console.error('[STATION ERROR getAllStations]:', error.message);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi lấy danh sách trạm phát sóng',
            details: error.message
        });
    }
};

// Xuất module để sử dụng tại stationRoutes.js
module.exports = {
    getAllStations
};