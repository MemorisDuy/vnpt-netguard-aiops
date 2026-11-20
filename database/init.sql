-- ==============================================================================
-- KHỞI TẠO EXTENSION VÀ CƠ SỞ DỮ LIỆU KHÔNG GIAN POSTGIS (TRẠM & CELL 4G LTE)
-- Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
-- Phụ trách: Nguyễn Ngọc Duy (Tech Lead & Database Architect)
-- ==============================================================================

-- 1. Kích hoạt extension không gian PostGIS cho phép lưu trữ và truy vấn tọa độ GPS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tạo bảng danh sách trạm phát sóng tổng quan (stations)
-- Giữ nguyên cấu trúc bảng trạm để tương thích ngược với các API hiện hữu
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    station_code VARCHAR(50) UNIQUE NOT NULL,       -- Mã định danh trạm (ví dụ: HCM_BTS_001)
    station_name VARCHAR(150) NOT NULL,             -- Tên vị trí đặt trạm
    province VARCHAR(100) DEFAULT 'TP. Ho Chi Minh', -- Tỉnh / Thành phố
    latitude DOUBLE PRECISION NOT NULL,             -- Vĩ độ (Lat)
    longitude DOUBLE PRECISION NOT NULL,            -- Kinh độ (Lng)
    geom GEOMETRY(Point, 4326),                     -- Tọa độ không gian hệ WGS 84 (EPSG 4326)
    latency_ms DOUBLE PRECISION DEFAULT 25.5,       -- Độ trễ mạng trung bình (ms)
    packet_loss_rate DOUBLE PRECISION DEFAULT 0.5,  -- Tỷ lệ mất gói tin (%)
    jitter_ms DOUBLE PRECISION DEFAULT 3.2,         -- Dao động độ trễ (ms)
    throughput_mbps DOUBLE PRECISION DEFAULT 85.0,  -- Thông lượng băng thông (Mbps)
    risk_level VARCHAR(20) DEFAULT 'LOW',           -- Mức độ rủi ro: 'LOW', 'MEDIUM', 'HIGH'
    is_anomaly BOOLEAN DEFAULT FALSE,               -- Đánh dấu bất thường (true / false)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP  -- Thời điểm cập nhật thông số gần nhất
);

-- 3. Trigger tự động tính cột geom cho bảng stations khi thêm hoặc sửa tọa độ
CREATE OR REPLACE FUNCTION update_station_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_station_geom ON stations;
CREATE TRIGGER trg_update_station_geom
BEFORE INSERT OR UPDATE ON stations
FOR EACH ROW
EXECUTE FUNCTION update_station_geom();

-- Chỉ mục không gian (Spatial Index) tăng tốc truy vấn bán kính trên bảng stations
CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST(geom);

-- Nạp 7 trạm phát sóng mẫu tại khu vực TP. Hồ Chí Minh để kiểm thử API nền
INSERT INTO stations (station_code, station_name, province, latitude, longitude, latency_ms, packet_loss_rate, jitter_ms, throughput_mbps, risk_level, is_anomaly)
VALUES
('HCM_BTS_001', 'Tram VNPT Net 2 - Quan 1', 'TP. Ho Chi Minh', 10.7769, 106.7009, 15.2, 0.1, 1.5, 120.5, 'LOW', FALSE),
('HCM_BTS_002', 'Tram DH GTVT TP.HCM (UTH) - Binh Thanh', 'TP. Ho Chi Minh', 10.8018, 106.7114, 22.4, 0.4, 2.8, 95.0, 'LOW', FALSE),
('HCM_BTS_003', 'Tram Nga tu Hang Xanh - Binh Thanh', 'TP. Ho Chi Minh', 10.8015, 106.7142, 68.5, 4.2, 12.1, 35.0, 'HIGH', TRUE),
('HCM_BTS_004', 'Tram Ben xe Mien Dong cu - Binh Thanh', 'TP. Ho Chi Minh', 10.8143, 106.7107, 75.0, 5.8, 15.4, 22.0, 'HIGH', TRUE),
('HCM_BTS_005', 'Tram Khu Cong Nghe Cao - TP. Thu Duc', 'TP. Ho Chi Minh', 10.8544, 106.7845, 18.0, 0.2, 1.8, 110.0, 'LOW', FALSE),
('HCM_BTS_006', 'Tram Cau Sai Gon - Thao Dien', 'TP. Ho Chi Minh', 10.7997, 106.7262, 45.0, 2.1, 6.5, 60.0, 'MEDIUM', FALSE),
('HCM_BTS_007', 'Tram San bay Tan Son Nhat - Tan Binh', 'TP. Ho Chi Minh', 10.8185, 106.6588, 82.0, 6.5, 18.0, 15.5, 'HIGH', TRUE)
ON CONFLICT (station_code) DO NOTHING;

-- ==============================================================================
-- 4. MỞ RỘNG MÔ HÌNH NGHIỆP VỤ VNPT NET: 1 TRẠM (NODE_NAME) - 3 CELL (CELL_NAME)
-- ==============================================================================
-- Nghiệp vụ thực tế:
-- - Mỗi trạm eNodeB (node_name) thường quản lý 3 cell phủ sóng các hướng khác nhau.
-- - Mỗi cell được đánh giá qua 5 KPI Tầng 1 (cssr, service_drop_all, Traffic down/up,
--   user_dl_avg_thput) và phân thành 2 nhóm lỗi:
--     + 'A1_rule_vh' (Nhóm Vận hành): Lỗi cssr, service_drop_all, hoặc Traffic down.
--     + 'A1_rule_kt' (Nhóm Kỹ thuật): Lỗi Traffic up hoặc suy giảm user_dl_avg_thput.
--     + 'NORMAL': Cell vận hành bình thường.
-- - Tầng 2 (a4_flags): Lưu danh sách cờ nguyên nhân gốc A4 (RRC, S1, E-RAB, Handover).
-- - Tầng 3 (Spatial Clustering): Gom cụm các cell suy giảm gần nhau theo cột geom.
CREATE TABLE IF NOT EXISTS network_cells (
    id SERIAL PRIMARY KEY,
    station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL, -- Liên kết tùy chọn về bảng stations
    node_name VARCHAR(60) NOT NULL,                               -- Tên trạm eNodeB (VD: 4G-DEMO01M-CTO)
    cell_name VARCHAR(60) UNIQUE NOT NULL,                        -- Tên định danh Cell (VD: 4G-DEMO01M11-CTO)
    enodeb_id INTEGER NOT NULL,                                   -- Mã eNodeB
    cell_id INTEGER NOT NULL,                                     -- Mã số Cell (thường là 11, 12, 13)
    province VARCHAR(80) NOT NULL,                                -- Tên tỉnh/thành (CAN THO, BEN TRE, AN GIANG)
    province_code VARCHAR(10) NOT NULL,                           -- Mã 3 ký tự cuối của CELL_NAME (CTO, BTE, AGG)
    latitude DOUBLE PRECISION NOT NULL,                           -- Vĩ độ phục vụ gom cụm tọa độ
    longitude DOUBLE PRECISION NOT NULL,                          -- Kinh độ phục vụ gom cụm tọa độ
    geom GEOMETRY(Point, 4326),                                   -- Điểm không gian PostGIS (WGS 84)
    cssr DOUBLE PRECISION DEFAULT 99.5,                           -- Tỷ lệ thiết lập cuộc gọi thành công (%)
    service_drop_all DOUBLE PRECISION DEFAULT 0.5,                -- Tỷ lệ rớt cuộc gọi (%)
    traffic_gb DOUBLE PRECISION DEFAULT 4.0,                      -- Lưu lượng dữ liệu trong giờ (GB)
    traffic_percent_hour DOUBLE PRECISION DEFAULT 100.0,          -- Tỷ lệ lưu lượng so với TB 12 mẫu cùng giờ/thứ (%)
    user_dl_avg_thput DOUBLE PRECISION DEFAULT 42.0,              -- Thông lượng tải xuống trung bình người dùng (Mbps)
    user_dl_avg_thput_percent_hour DOUBLE PRECISION DEFAULT 100.0,-- Tỷ lệ thông lượng so với TB 12 mẫu (%)
    a1_rule_group VARCHAR(30) DEFAULT 'NORMAL',                   -- Nhóm lỗi Tầng 1: 'A1_rule_vh', 'A1_rule_kt', 'NORMAL'
    a4_flags TEXT[] DEFAULT '{}',                                 -- Mảng cờ nguyên nhân gốc A4 (Tầng 2)
    is_anomaly BOOLEAN DEFAULT FALSE,                             -- Cờ xác nhận Cell đang suy giảm (TRUE/FALSE)
    sta_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP              -- Mốc thời gian đo lường theo giờ
);

-- Trigger tự động tính cột geom cho bảng network_cells
CREATE OR REPLACE FUNCTION update_network_cell_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_network_cell_geom ON network_cells;
CREATE TRIGGER trg_update_network_cell_geom
BEFORE INSERT OR UPDATE ON network_cells
FOR EACH ROW
EXECUTE FUNCTION update_network_cell_geom();

-- Tạo các chỉ mục tăng tốc truy vấn không gian và lọc theo tỉnh / nhóm lỗi VNPT
CREATE INDEX IF NOT EXISTS idx_network_cells_geom ON network_cells USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_network_cells_province_code ON network_cells (province_code);
CREATE INDEX IF NOT EXISTS idx_network_cells_a1_group ON network_cells (a1_rule_group);

-- 5. Nạp 9 Cell mẫu ẩn danh (3 Trạm x 3 Cell/Trạm) tại 3 tỉnh (CTO, BTE, AGG)
-- Lưu ý: Mã trạm/cell dưới đây là dữ liệu mô phỏng ẩn danh phục vụ kiểm thử đồ án
INSERT INTO network_cells (
    node_name, cell_name, enodeb_id, cell_id, province, province_code,
    latitude, longitude, cssr, service_drop_all, traffic_gb, traffic_percent_hour,
    user_dl_avg_thput, user_dl_avg_thput_percent_hour, a1_rule_group, a4_flags, is_anomaly
)
VALUES
-- Trạm 1 tại Cần Thơ (CTO): 2 Cell lỗi Vận hành (A1_rule_vh), 1 Cell bình thường
('4G-DEMO01M-CTO', '4G-DEMO01M11-CTO', 620001, 11, 'CAN THO', 'CTO', 10.0341, 105.7875, 91.2, 6.4, 6.2, 85.0, 28.5, 72.0, 'A1_rule_vh', ARRAY['A4_rrcfailure', 'A4_erabrelabnormal'], TRUE),
('4G-DEMO01M-CTO', '4G-DEMO01M12-CTO', 620001, 12, 'CAN THO', 'CTO', 10.0365, 105.7892, 92.8, 5.8, 5.5, 8.5, 24.0, 65.0, 'A1_rule_vh', ARRAY['A4_s1signallingfailure', 'A4_erabfailure'], TRUE),
('4G-DEMO01M-CTO', '4G-DEMO01M13-CTO', 620001, 13, 'CAN THO', 'CTO', 10.0318, 105.7848, 99.4, 0.4, 4.8, 104.0, 48.0, 102.0, 'NORMAL', ARRAY[]::TEXT[], FALSE),

-- Trạm 2 tại Bến Tre (BTE): 2 Cell lỗi Kỹ thuật (A1_rule_kt), 1 Cell bình thường
('4G-DEMO02M-BTE', '4G-DEMO02M11-BTE', 650002, 11, 'BEN TRE', 'BTE', 10.2433, 106.3755, 98.1, 1.2, 4.2, 510.0, 18.0, 42.0, 'A1_rule_kt', ARRAY['A4_rrcincrease'], TRUE),
('4G-DEMO02M-BTE', '4G-DEMO02M12-BTE', 650002, 12, 'BEN TRE', 'BTE', 10.2450, 106.3780, 97.6, 1.8, 11.4, 135.0, 9.5, 24.0, 'A1_rule_kt', ARRAY['A4_hoprepfailure', 'A4_hoexefailure'], TRUE),
('4G-DEMO02M-BTE', '4G-DEMO02M13-BTE', 650002, 13, 'BEN TRE', 'BTE', 10.2410, 106.3720, 99.6, 0.3, 3.9, 98.5, 52.0, 105.0, 'NORMAL', ARRAY[]::TEXT[], FALSE),

-- Trạm 3 tại An Giang (AGG): 1 Cell lỗi Vận hành gần cụm nguy cơ, 2 Cell bình thường
('4G-DEMO03M-AGG', '4G-DEMO03M11-AGG', 630003, 11, 'AN GIANG', 'AGG', 10.3864, 105.4352, 88.5, 8.2, 2.4, 92.0, 21.0, 60.0, 'A1_rule_vh', ARRAY['A4_erabrelabnormal'], TRUE),
('4G-DEMO03M-AGG', '4G-DEMO03M12-AGG', 630003, 12, 'AN GIANG', 'AGG', 10.3880, 105.4375, 99.2, 0.6, 3.1, 101.0, 46.5, 99.0, 'NORMAL', ARRAY[]::TEXT[], FALSE),
('4G-DEMO03M-AGG', '4G-DEMO03M13-AGG', 630003, 13, 'AN GIANG', 'AGG', 10.3845, 105.4328, 99.5, 0.5, 2.8, 97.0, 44.0, 96.0, 'NORMAL', ARRAY[]::TEXT[], FALSE)
ON CONFLICT (cell_name) DO NOTHING;
