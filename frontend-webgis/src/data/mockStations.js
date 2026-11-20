// ==============================================================================
// PROJECT: VNPT NETGUARD AIOPS N3.2
// FILE: mockStations.js
// CHỨC NĂNG: Dữ liệu mô phỏng trạm viễn thông cho Frontend Web GIS
//
// NGƯỜI PHÁT TRIỂN: Võ Ngọc Quý
// VAI TRÒ: Web GIS Engineer
//
// PHỐI HỢP:
// - Minh Trường: Sidebar & UI Dashboard
// - Ngọc Lân: Backend API
//
// GHI CHÚ: Dữ liệu chỉ phục vụ kiểm thử Frontend, không phải dữ liệu thực tế.

// ==============================================================================
// MOCK DATA: DANH SÁCH TRẠM VIỄN THÔNG
// Dùng chung cho Sidebar và MapContainer trong giai đoạn phát triển Frontend.
// ==============================================================================

export const mockStations = [
  {
    id: 1,
    station_code: "BTS_001",
    station_name: "VNPT Tân Bình",
    name: "VNPT Tân Bình",
    position: [10.8231, 106.6297],
    latitude: 10.8231,
    longitude: 106.6297,
    risk_level: "HIGH",
    risk_score: 85,
    latency_ms: 95,
    packet_loss_rate: 8.5,
    jitter_ms: 25,
    throughput_mbps: 35,
  },
  {
    id: 2,
    station_code: "BTS_002",
    station_name: "VNPT Phú Nhuận",
    name: "VNPT Phú Nhuận",
    position: [10.8015, 106.652],
    latitude: 10.8015,
    longitude: 106.652,
    risk_level: "MEDIUM",
    risk_score: 55,
    latency_ms: 45,
    packet_loss_rate: 3.2,
    jitter_ms: 12,
    throughput_mbps: 75,
  },
  {
    id: 3,
    station_code: "BTS_003",
    station_name: "VNPT Gò Vấp",
    name: "VNPT Gò Vấp",
    position: [10.85, 106.68],
    latitude: 10.85,
    longitude: 106.68,
    risk_level: "LOW",
    risk_score: 20,
    latency_ms: 15,
    packet_loss_rate: 0.5,
    jitter_ms: 4,
    throughput_mbps: 150,
  },
];
