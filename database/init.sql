-- ============================================================
-- KHỞI TẠO EXTENSION VÀ BẢNG TRẠM PHÁT SÓNG (PostGIS)
-- Dự án N3.2: VNPT NetGuard AIOps
-- ============================================================

-- 1. Kích hoạt PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tạo bảng danh sách trạm phát sóng (stations)
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    station_code VARCHAR(50) UNIQUE NOT NULL,
    station_name VARCHAR(150) NOT NULL,
    province VARCHAR(100) DEFAULT 'TP. Hồ Chí Minh',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    latency_ms DOUBLE PRECISION DEFAULT 25.5,
    packet_loss_rate DOUBLE PRECISION DEFAULT 0.5,
    jitter_ms DOUBLE PRECISION DEFAULT 3.2,
    throughput_mbps DOUBLE PRECISION DEFAULT 85.0,
    risk_level VARCHAR(20) DEFAULT 'LOW', -- 'LOW', 'MEDIUM', 'HIGH'
    is_anomaly BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tự động tính toán trường geometry từ kinh độ & vĩ độ (WGS 84 - EPSG 4326)
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

-- 3. Tạo chỉ mục không gian (Spatial Index) tăng tốc truy vấn cho PostGIS
CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST(geom);

-- 4. Dữ liệu mẫu ban đầu tại khu vực TP. Hồ Chí Minh để các bạn test API
INSERT INTO stations (station_code, station_name, province, latitude, longitude, latency_ms, packet_loss_rate, jitter_ms, throughput_mbps, risk_level, is_anomaly)
VALUES
('HCM_BTS_001', 'Trạm VNPT Net 2 - Quận 1', 'TP. Hồ Chí Minh', 10.7769, 106.7009, 15.2, 0.1, 1.5, 120.5, 'LOW', FALSE),
('HCM_BTS_002', 'Trạm ĐH GTVT TP.HCM (UTH) - Bình Thạnh', 'TP. Hồ Chí Minh', 10.8018, 106.7114, 22.4, 0.4, 2.8, 95.0, 'LOW', FALSE),
('HCM_BTS_003', 'Trạm Ngã tư Hàng Xanh - Bình Thạnh', 'TP. Hồ Chí Minh', 10.8015, 106.7142, 68.5, 4.2, 12.1, 35.0, 'HIGH', TRUE),
('HCM_BTS_004', 'Trạm Bến xe Miền Đông cũ', 'TP. Hồ Chí Minh', 10.8143, 106.7107, 75.0, 5.8, 15.4, 22.0, 'HIGH', TRUE),
('HCM_BTS_005', 'Trạm Khu Công Nghệ Cao - TP. Thủ Đức', 'TP. Hồ Chí Minh', 10.8544, 106.7845, 18.0, 0.2, 1.8, 110.0, 'LOW', FALSE),
('HCM_BTS_006', 'Trạm Cầu Sài Gòn - Thảo Điền', 'TP. Hồ Chí Minh', 10.7997, 106.7262, 45.0, 2.1, 6.5, 60.0, 'MEDIUM', FALSE),
('HCM_BTS_007', 'Trạm Sân bay Tân Sơn Nhất - Tân Bình', 'TP. Hồ Chí Minh', 10.8185, 106.6588, 82.0, 6.5, 18.0, 15.5, 'HIGH', TRUE)
ON CONFLICT (station_code) DO NOTHING;
