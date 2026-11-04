// ==============================================================================
// COMPONENT: HEATMAP LAYER (LỚP BẢN ĐỒ NHIỆT CẢNH BÁO NGUY CƠ SUY GIẢM MẠNG)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

// Import các thành phần vẽ hình học không gian từ react-leaflet:
// - Circle: Vẽ vòng tròn bán kính bọc quanh tọa độ trạm thể hiện vùng ảnh hưởng rủi ro.
// - Popup: Hộp thoại hiển thị thông số chi tiết khi người vận hành nhấp chuột vào vùng tròn.
import { Circle, Popup } from "react-leaflet";

// ==============================================================================
// 1. DỮ LIỆU MÔ PHỎNG GIẢ LẬP (MOCK DATA) PHỤC VỤ KIỂM THỬ GIAO DIỆN SPRINT 1
// ==============================================================================
// Trong giai đoạn đầu, nhóm khởi tạo 3 vùng nguy cơ giả lập đại diện cho 3 cấp độ:
// An toàn (LOW), Cảnh báo nhẹ (MEDIUM) và Nguy cơ suy giảm cao (HIGH).
const mockRiskAreas = [
  {
    id: 1,
    name: "Khu vực A (Sân bay Tân Sơn Nhất - Tân Bình)",
    position: [10.8231, 106.6297],
    risk: "HIGH",     // Mức rủi ro cao: Màu Đỏ
    score: 85         // Điểm đánh giá rủi ro từ mô hình AI: 85/100
  },
  {
    id: 2,
    name: "Khu vực B (Quận Phú Nhuận)",
    position: [10.8015, 106.6520],
    risk: "MEDIUM",   // Mức lưu ý theo dõi: Màu Vàng
    score: 55         // Điểm đánh giá rủi ro từ mô hình AI: 55/100
  },
  {
    id: 3,
    name: "Khu vực C (Quận Gò Vấp)",
    position: [10.8500, 106.6800],
    risk: "LOW",      // Mức an toàn ổn định: Màu Xanh lá
    score: 20         // Điểm đánh giá rủi ro từ mô hình AI: 20/100
  }
];

// ==============================================================================
// 2. HÀM QUY ĐỊNH BẢNG MÃ MÀU TRỰC QUAN THEO MỨC ĐỘ NGUY CƠ AI (COLOR PALETTE)
// ==============================================================================
// Chuẩn hóa màu sắc trực quan theo tiêu chuẩn trung tâm điều hành mạng viễn thông:
// - HIGH: Đỏ (#ef4444) -> Vùng nguy cơ suy giảm cao, cần kỹ sư NOC ưu tiên xử lý.
// - MEDIUM: Vàng (#eab308) -> Vùng cần theo dõi, các chỉ số KPI có dấu hiệu bất thường nhẹ.
// - LOW: Xanh lá (#22c55e) -> Vùng mạng vận hành ổn định, thông lượng và độ trễ đạt chuẩn.
function getRiskColor(risk) {
  switch (risk) {
    case "HIGH":
      return "#ef4444";
    case "MEDIUM":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

// ==============================================================================
// 3. COMPONENT RENDER CÁC VÙNG NHIỆT LÊN BẢN ĐỒ
// ==============================================================================
function HeatmapLayer() {
  return (
    <>
      {/* Duyệt qua từng vùng rủi ro để vẽ vòng tròn bán kính trên nền bản đồ */}
      {mockRiskAreas.map((area) => (
        <Circle
          key={area.id}
          center={area.position}
          radius={1500} // Bán kính bao phủ vùng ảnh hưởng: 1500 mét (1.5 km)
          pathOptions={{
            color: getRiskColor(area.risk),       // Màu viền ngoài của vòng tròn
            fillColor: getRiskColor(area.risk),   // Màu tô diện tích bên trong vòng tròn
            fillOpacity: 0.35,                    // Độ trong suốt 35% giúp nhìn rõ đường phố bên dưới
            weight: 2                             // Độ dày đường viền tròn: 2px
          }}
        >
          {/* Hộp thoại Popup xuất hiện khi người dùng nhấp chuột vào vòng tròn */}
          <Popup>
            <strong>{area.name}</strong>
            <p>Mức độ nguy cơ: {area.risk}</p>
            <p>Điểm đánh giá rủi ro AI: {area.score}/100</p>
            <p>Trạng thái: Dữ liệu mô phỏng thử nghiệm</p>
          </Popup>
        </Circle>
      ))}
    </>
  );
}

// Xuất component để nhúng trực tiếp vào khung MapContainer
export default HeatmapLayer;
