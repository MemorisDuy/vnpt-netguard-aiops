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

 /**
  * ==============================================================================
  * HÀM XỬ LÝ 3: THỐNG KÊ CELL LỖI THEO NHÓM VẬN HÀNH & KỸ THUẬT (A1)
  * ==============================================================================
  * Tuyến đường (Route): GET /api/stats/cell-errors
  * Phương thức (Method): GET
  * Nghiệp vụ (Business Logic):
  * - Truy vấn bảng `network_cells` được định nghĩa trong database/init.sql.
  * - Thống kê số lượng Cell lỗi theo hai nhóm A1:
  *   + A1_rule_vh: Nhóm Vận hành (CSSR, Service Drop, Traffic Down).
  *   + A1_rule_kt: Nhóm Kỹ thuật (Traffic Up, User DL Avg Throughput).
  * - Đếm tổng số Cell, Cell lỗi, Cell bình thường và Cell chưa đủ dữ liệu.
  * - Hỗ trợ lọc theo mã tỉnh (province_code) và tên trạm (node_name).
  * - Sử dụng SQL có tham số để tránh SQL Injection.
  * - Trả HTTP 200 nếu thành công, 400 nếu tham số sai, 500 nếu lỗi CSDL.
  *
  * Liên kết với các thành viên:
  * - Dữ liệu Cell và nhóm A1 lấy từ database/init.sql và KPI ETL của nhóm.
  * - Kết quả có thể bàn giao cho Minh Trường hiển thị trên Dashboard.
  * - Không thay đổi hai hàm thống kê trạm đã triển khai trước đó.
  *
  * Lưu ý:
  * - Cột a1_rule_group chỉ lưu một nhóm A1 trên mỗi Cell snapshot.
  * - Vì vậy mỗi Cell chỉ được tính một lần, không đếm trùng hai nhóm.
  */
 const getCellErrorStats = async (req, res) => {
     try {
         // 1. Nhận các tham số lọc tùy chọn từ URL
         const { province_code, node_name } = req.query;

         // Khởi tạo danh sách điều kiện WHERE và giá trị truy vấn
         const conditions = [];
         const values = [];

         // 2. Kiểm tra và lọc theo mã tỉnh nếu được truyền vào
         if (province_code !== undefined) {
             if (
                 typeof province_code !== 'string' ||
                 !province_code.trim() ||
                 province_code.length > 10
             ) {
                 return res.status(400).json({
                     status: 'error',
                     message: 'Tham số province_code không hợp lệ'
                 });
             }

             // Chuẩn hóa mã tỉnh thành chữ in hoa
             values.push(province_code.trim().toUpperCase());
             conditions.push(`UPPER(province_code) = $${values.length}`);
         }

         // 3. Kiểm tra và lọc theo tên trạm eNodeB
         if (node_name !== undefined) {
             if (
                 typeof node_name !== 'string' ||
                 !node_name.trim() ||
                 node_name.length > 60
             ) {
                 return res.status(400).json({
                     status: 'error',
                     message: 'Tham số node_name không hợp lệ'
                 });
             }

             values.push(node_name.trim());
             conditions.push(`node_name = $${values.length}`);
         }

         // 4. Xây dựng mệnh đề WHERE từ các điều kiện hợp lệ
         const whereClause = conditions.length > 0
             ? `WHERE ${conditions.join(' AND ')}`
             : '';

         // 5. Truy vấn thống kê Cell theo nhóm lỗi A1
         // FILTER giúp tổng hợp từng nhóm ngay trong một câu SQL
         const query = `
             SELECT
                 COUNT(*)::INTEGER AS total_cells,

                 COUNT(*) FILTER (
                     WHERE a1_rule_group = 'A1_rule_vh'
                 )::INTEGER AS vh_count,

                 COUNT(*) FILTER (
                     WHERE a1_rule_group = 'A1_rule_kt'
                 )::INTEGER AS kt_count,

                 COUNT(*) FILTER (
                     WHERE a1_rule_group = 'NORMAL'
                 )::INTEGER AS normal_count,

                 COUNT(*) FILTER (
                     WHERE a1_rule_group = 'INSUFFICIENT_DATA'
                 )::INTEGER AS insufficient_count,

                 COUNT(*) FILTER (
                     WHERE a1_rule_group IS NULL
                     OR a1_rule_group NOT IN (
                         'A1_rule_vh',
                         'A1_rule_kt',
                         'NORMAL',
                         'INSUFFICIENT_DATA'
                     )
                 )::INTEGER AS other_count

             FROM network_cells
             ${whereClause};
         `;

         // 6. Thực thi truy vấn qua kết nối PostgreSQL chung của nhóm
         const result = await db.query(query, values);
         const row = result.rows[0] || {};

         // 7. Chuyển các số đếm về kiểu Number
         const totalCells = Number(row.total_cells || 0);
         const vhCount = Number(row.vh_count || 0);
         const ktCount = Number(row.kt_count || 0);
         const normalCount = Number(row.normal_count || 0);
         const insufficientCount = Number(row.insufficient_count || 0);
         const otherCount = Number(row.other_count || 0);

         // Tổng Cell lỗi bằng tổng hai nhóm Vận hành và Kỹ thuật
         const errorCells = vhCount + ktCount;

         // 8. Tổng hợp số Cell theo từng nhóm để Frontend dễ sử dụng
         const groupCounts = {
             A1_rule_vh: vhCount,
             A1_rule_kt: ktCount,
             NORMAL: normalCount,
             INSUFFICIENT_DATA: insufficientCount,
             OTHER: otherCount
         };

         // 9. Chuẩn hóa dữ liệu phản hồi cho Dashboard
         const data = {
             total_cells: totalCells,
             error_cells: errorCells,
             a1_rule_vh_count: vhCount,
             a1_rule_kt_count: ktCount,
             normal_cells: normalCount,
             insufficient_data_cells: insufficientCount,
             other_cells: otherCount,
             group_counts: groupCounts
         };

         // 10. Trả về HTTP 200 OK cùng kết quả thống kê
         return res.status(200).json({
             status: 'success',
             message: 'Thống kê số lượng Cell theo nhóm lỗi A1 thành công',
             ...data,
             data: data
         });

     } catch (error) {
         // Bắt lỗi truy vấn hoặc kết nối PostgreSQL
         const errMsg = error.message || error.code ||
             'Không thể kết nối PostgreSQL (Kiểm tra Docker DB)';

         console.error('[STATS ERROR getCellErrorStats]:', errMsg);

         return res.status(500).json({
             status: 'error',
             message: 'Lỗi truy vấn cơ sở dữ liệu khi thống kê Cell theo nhóm A1',
             details: errMsg
         });
     }
 };

 // ==============================================================================
 // XUẤT MODULE CONTROLLER ĐỂ ROUTER SỬ DỤNG
 // Giữ nguyên 2 hàm cũ và bổ sung hàm getCellErrorStats cho Mốc Tuần 4
 // ==============================================================================
 module.exports = {
     getHighRiskAreas,
     getNetworkSummary,
     getCellErrorStats
 };