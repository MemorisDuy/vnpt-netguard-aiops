-- ============================================================
-- KHOI TAO EXTENSION VA BANG TRAM PHAT SONG (POSTGIS)
-- Du an N3.2: VNPT NetGuard AIOps
-- Phu trach: Nguyen Ngoc Duy (Tech Lead & Database Architect)
-- ============================================================

-- 1. Kich hoat extension khong gian PostGIS cho phep xu ly toa do GPS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tao bang danh sach tram phat song (stations)
-- Bang nay chua thong tin vi tri dia ly va cac chi so KPI mang vien thong
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    station_code VARCHAR(50) UNIQUE NOT NULL,      -- Ma dinh danh tram (vi du: HCM_BTS_001)
    station_name VARCHAR(150) NOT NULL,            -- Ten vi tri dat tram
    province VARCHAR(100) DEFAULT 'TP. Ho Chi Minh',-- Tinh / Thanh pho
    latitude DOUBLE PRECISION NOT NULL,            -- Vi do (Lat)
    longitude DOUBLE PRECISION NOT NULL,           -- Kinh do (Lng)
    geom GEOMETRY(Point, 4326),                    -- Toa do khong gian he WGS 84 (EPSG 4326)
    latency_ms DOUBLE PRECISION DEFAULT 25.5,      -- Do tre mang trung binh (ms)
    packet_loss_rate DOUBLE PRECISION DEFAULT 0.5, -- Ti le mat goi tin (%)
    jitter_ms DOUBLE PRECISION DEFAULT 3.2,        -- Dao dong do tre (ms)
    throughput_mbps DOUBLE PRECISION DEFAULT 85.0, -- Thong luong bang thong (Mbps)
    risk_level VARCHAR(20) DEFAULT 'LOW',          -- Muc do rui ro: 'LOW', 'MEDIUM', 'HIGH'
    is_anomaly BOOLEAN DEFAULT FALSE,              -- AI danh dau bat thuong (true / false)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Thoi diem cap nhat thong so gan nhat
);

-- 3. Trigger tu dong tinh toan cot geom khi them hoac sua vi do, kinh do
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

-- 4. Tao chi muc khong gian (Spatial Index) tang toc truy van ban kinh PostGIS
CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST(geom);

-- 5. Nap 7 tram phat song mau tai khu vuc TP. Ho Chi Minh de ca team test API va ban do
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
