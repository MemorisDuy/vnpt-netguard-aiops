// ==============================================================================
// CONTROLLER: QUẢN LÝ DANH SÁCH TRẠM PHÁT SÓNG VIỄN THÔNG (STATION CONTROLLER)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Minh Trường (Full-stack & UI Dashboard)
// ==============================================================================

// 1. Import kết nối cơ sở dữ liệu PostgreSQL + PostGIS chung của nhóm (dbConfig)
const db = require('../config/dbConfig');

/**
 * ==============================================================================
 * CHỨC NĂNG: LẤY TOÀN BỘ DANH SÁCH TRẠM PHÁT SÓNG (GET ALL STATIONS)
 * ==============================================================================
 * Tuyến đường (Route): GET /api/stations
 * Nghiệp vụ (Business Logic):
 * - Truy vấn toàn bộ danh sách các trạm phát sóng BTS từ bảng `stations` trong CSDL.
 * - Sắp xếp theo `id` tăng dần để thứ tự hiển thị trên Sidebar và Bản đồ luôn đồng nhất.
 * - Trả về đầy đủ thông tin vị trí tọa độ (latitude, longitude), các chỉ số KPI mạng
 *   (latency_ms, packet_loss_rate, jitter_ms, throughput_mbps) và mức độ rủi ro (risk_level).
 */
const getAllStations = async (req, res) => {
    try {
        // Câu lệnh SQL lấy toàn bộ danh sách trạm phát sóng sắp xếp theo ID tăng dần
        const query = `
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
            ORDER BY id ASC;
        `;

        // Thực thi câu truy vấn thông qua Connection Pool của dbConfig
        const result = await db.query(query);

        // Trả về phản hồi HTTP 200 OK cùng danh sách trạm chuẩn định dạng JSON
        return res.status(200).json({
            status: 'success',
            message: 'Lấy danh sách toàn bộ trạm phát sóng thành công',
            total_stations: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        // Bắt lỗi và trả về mã lỗi 500 khi CSDL gặp sự cố
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
