// ==============================================================================
// ROUTES: ĐỊNH TUYẾN MODULE PHÂN TÍCH CHỈ SỐ MẠNG & TRUY VẤN KHÔNG GIAN
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Nguyễn Ngọc Duy (Tech Lead & Core Developer)
// ==============================================================================

const express = require('express');
const router = express.Router();

// Nạp controller chứa logic nghiệp vụ xử lý dữ liệu và truy vấn PostGIS
const analyticsController = require('../controllers/analyticsController');

/**
 * ------------------------------------------------------------------------------
 * 1. TUYẾN ĐƯỜNG: THỐNG KÊ SỨC KHỎE TỔNG THỂ TOÀN MẠNG VIỄN THÔNG
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/analytics/network-health
 * Mô tả: Trả về số lượng trạm an toàn, cảnh báo, nguy cơ cao và các chỉ số KPI trung bình.
 */
router.get('/network-health', analyticsController.getNetworkHealth);

/**
 * ------------------------------------------------------------------------------
 * 2. TUYẾN ĐƯỜNG: TÌM KIẾM TRẠM TRONG BÁN KÍNH KHÔNG GIAN POSTGIS
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/analytics/nearby
 * Tham số query: ?lat=...&lng=...&radius=...
 * Mô tả: Quét và trả về danh sách các trạm viễn thông trong phạm vi bán kính (mét) chỉ định.
 */
router.get('/nearby', analyticsController.getStationsNearby);

/**
 * ------------------------------------------------------------------------------
 * 3. TUYẾN ĐƯỜNG: DỰ BÁO NGUY CƠ SUY GIẢM MẠNG QUA AI GATEWAY (FASTAPI)
 * ------------------------------------------------------------------------------
 * Endpoint: POST /api/analytics/predict-risk
 * Body JSON: { latency_ms, packet_loss_rate, jitter_ms, throughput_mbps }
 * Mô tả: Cổng kết nối tích hợp chuyển tiếp dữ liệu đến mô hình XGBoost của AI Service.
 */
router.post('/predict-risk', analyticsController.predictRisk);

/**
 * ------------------------------------------------------------------------------
 * 4. TUYẾN ĐƯỜNG: DANH SÁCH TOP TRẠM NGUY CƠ CAO NHẤT CẦN XỬ LÝ KHẨN CẤP
 * ------------------------------------------------------------------------------
 * Endpoint: GET /api/analytics/top-risk
 * Tham số query: ?limit=5
 * Mô tả: Lọc và xếp hạng danh sách trạm viễn thông có nguy cơ cao nhất cho trung tâm NOC.
 */
router.get('/top-risk', analyticsController.getTopRiskStations);

module.exports = router;
