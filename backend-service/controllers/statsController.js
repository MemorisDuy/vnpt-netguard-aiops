// ==============================================================================
// CONTROLLER: THỐNG KÊ DANH SÁCH TRẠM NGUY CƠ SUY GIẢM MẠNG CAO & TỔNG QUAN MẠNG
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Anh Thao (MSSV: 054205001770) - Backend Developer
// ==============================================================================

// Import kết nối cơ sở dữ liệu PostgreSQL / PostGIS chung của nhóm từ dbConfig.js
const db = require('../config/dbConfig');

/**
 * ==============================================================================
 * HÀM XỬ LÝ 1: LỌC VÀ ĐẾM SỐ LƯỢNG TRẠM CÓ RỦI RO CAO (GET HIGH RISK AREAS)
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
        const errMsg = error.message || error.code || 'Không thể kết nối PostgreSQL (Kiểm tra Docker DB)';
        console.error('[STATS ERROR getHighRiskAreas]:', errMsg);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi thống kê trạm rủi ro cao',
            details: errMsg
        });
    }
};

/**
 * ==============================================================================
 * HÀM XỬ LÝ 2: THỐNG KÊ TỔNG QUAN TOÀN MẠNG THEO 3 MỨC RỦI RO & TRUNG BÌNH KPI
 * ==============================================================================
 * Tuyến đường (Route): GET /api/stats/summary
 * Phương thức (Method): GET
 * Nghiệp vụ (Business Logic):
 * - Truy vấn toàn bộ danh sách trạm phát sóng từ bảng `stations` (giống cơ chế
 *   an toàn của getHighRiskAreas để đảm bảo tương thích 100% với mọi schema init.sql).
 * - Phân loại và đếm chính xác số lượng trạm theo 3 mức rủi ro: HIGH, MEDIUM, LOW.
 * - Tự động nhận diện và tính trung bình cộng (AVG) làm tròn 2 chữ số thập phân 
 *   cho tất cả các cột chỉ số KPI kiểu số của trạm trên toàn mạng.
 * - Bàn giao cấu trúc JSON chuẩn cho Minh Trường hiển thị lên thanh trạng thái Dashboard.
 */
const getNetworkSummary = async (req, res) => {
    try {
        // Truy vấn toàn bộ bản ghi từ bảng stations
        const query = `SELECT * FROM stations;`;
        const result = await db.query(query);
        const rows = result.rows || [];
        const totalStations = rows.length;

        // 1. Khởi tạo bộ đếm số lượng trạm theo 3 mức rủi ro chuẩn
        const riskCounts = {
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0
        };

        // 2. Khởi tạo đối tượng tích lũy để tính trung bình các chỉ số KPI toàn mạng
        const kpiSums = {};
        const kpiValidCounts = {};
        // Danh sách các cột định danh/tọa độ không phải là chỉ số KPI
        const excludedCols = ['id', 'station_id', 'name', 'station_name', 'lat', 'lng', 'latitude', 'longitude', 'geom', 'location', 'risk_level', 'status', 'created_at', 'updated_at'];

        // Duyệt qua từng trạm để phân loại rủi ro và cộng dồn chỉ số KPI
        rows.forEach((station) => {
            // Đếm số lượng trạm theo mức rủi ro (HIGH, MEDIUM, LOW)
            const level = String(station.risk_level || 'LOW').toUpperCase().trim();
            if (riskCounts[level] !== undefined) {
                riskCounts[level] += 1;
            }

            // Tự động quét và cộng dồn tất cả các cột KPI có giá trị số trong bảng stations
            Object.keys(station).forEach((key) => {
                const lowerKey = key.toLowerCase();
                if (!excludedCols.includes(lowerKey)) {
                    const numVal = Number(station[key]);
                    if (station[key] !== null && station[key] !== '' && !Number.isNaN(numVal)) {
                        kpiSums[lowerKey] = (kpiSums[lowerKey] || 0) + numVal;
                        kpiValidCounts[lowerKey] = (kpiValidCounts[lowerKey] || 0) + 1;
                    }
                }
            });
        });

        // 3. Tính trung bình cộng (AVG) cho từng chỉ số KPI toàn mạng (làm tròn 2 chữ số thập phân)
        const kpiAverages = {};
        Object.keys(kpiSums).forEach((key) => {
            const avg = kpiValidCounts[key] > 0 ? (kpiSums[key] / kpiValidCounts[key]) : 0;
            kpiAverages[`avg_${key}`] = Number(avg.toFixed(2));
        });

        // Phản hồi kết quả HTTP 200 OK về cho client (Frontend Dashboard của Minh Trường)
        return res.status(200).json({
            status: 'success',
            message: 'Thống kê tổng quan toàn mạng theo 3 mức rủi ro và trung bình KPI thành công',
            total_stations: totalStations,
            risk_counts: riskCounts,
            kpi_averages: kpiAverages,
            data: {
                total_stations: totalStations,
                risk_counts: riskCounts,
                kpi_averages: kpiAverages
            }
        });

    } catch (error) {
        // Bắt lỗi hệ thống hoặc lỗi chưa bật Docker PostgreSQL và ghi log chuẩn
        const errMsg = error.message || error.code || 'Không thể kết nối PostgreSQL (Kiểm tra Docker DB)';
        console.error('[STATS ERROR getNetworkSummary]:', errMsg);
        return res.status(500).json({
            status: 'error',
            message: 'Lỗi truy vấn cơ sở dữ liệu khi thống kê tổng quan toàn mạng',
            details: errMsg
        });
    }
};

// ==============================================================================
// XUẤT MODULE CONTROLLER ĐỂ ROUTER SỬ DỤNG
// ==============================================================================
module.exports = {
    getHighRiskAreas,
    getNetworkSummary
};