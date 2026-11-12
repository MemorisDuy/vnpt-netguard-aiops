// ==============================================================================
// COMPONENT: MAP CONTAINER (BẢN ĐỒ ĐIỀU HÀNH WEB GIS)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

// Import các thành phần giao diện từ thư viện react-leaflet:
// - MapContainer (đổi tên thành LeafletMap): Khung chứa bản đồ gốc của thư viện Leaflet.
// - TileLayer: Lớp bản đồ nền địa lý (sử dụng nguồn bản đồ mở OpenStreetMap).
// - Marker: Điểm ghim định vị tọa độ trạm cụ thể trên bản đồ.
// - Popup: Hộp thoại thông tin chi tiết hiện ra khi người dùng nhấp chuột vào điểm ghim.
// - ZoomControl: Nút bấm điều khiển phóng to / thu nhỏ bản đồ (+ / -).
import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Popup,
  ZoomControl
} from "react-leaflet";

// Import tệp định dạng CSS chuẩn của Leaflet (bắt buộc để các mảnh bản đồ không bị vỡ bố cục)
import "leaflet/dist/leaflet.css";

// Import tệp CSS tùy biến riêng cho khung bản đồ (đặt chiều cao tối thiểu và bo góc)
import "./MapContainer.css";

// Import lớp bản đồ nhiệt hiển thị trực quan các vùng cảnh báo nguy cơ suy giảm mạng
import HeatmapLayer from "./HeatmapLayer";

// =====================================================
// DỮ LIỆU KPI MÔ PHỎNG CỦA TRẠM VIỄN THÔNG
// Mục đích: Thiết kế và kiểm thử giao diện Popup
// Sau này sẽ thay thế bằng dữ liệu API GeoJSON
// =====================================================

const stationKPI = {
  station_name: "Trạm VNPT TP. Hồ Chí Minh",

  // Độ trễ mạng, đơn vị mili giây (ms)
  latency_ms: 25,

  // Tỷ lệ mất gói tin, đơn vị phần trăm (%)
  packet_loss_rate: 0.5,

  // Độ dao động độ trễ, đơn vị mili giây (ms)
  jitter_ms: 8,

  // Tốc độ truyền dữ liệu, đơn vị Mbps
  throughput_mbps: 85,

  // Mức độ rủi ro của trạm (dữ liệu thử nghiệm)
  risk_level: "Trung bình",
};

function MapContainer() {
  // Tọa độ địa lý trung tâm mặc định: TP. Hồ Chí Minh [Vĩ độ (Lat), Kinh độ (Lng)]
  const hcmPosition = [10.8231, 106.6297];

  return (
    <div className="map-wrapper">
      {/* 
        Khởi tạo khung bản đồ LeafletMap:
        - center: Đặt góc nhìn trung tâm tại tọa độ TP. Hồ Chí Minh.
        - zoom: Mức độ phóng to mặc định (cấp 12 phù hợp bao quát mạng lưới đô thị).
        - zoomControl={false}: Tắt nút zoom mặc định ở góc trên bên trái để tùy chỉnh vị trí.
        - scrollWheelZoom={true}: Cho phép người vận hành lăn chuột để phóng to / thu nhỏ linh hoạt.
        - className: Gán class CSS network-map đảm bảo chiều cao tối thiểu 500px.
      */}
      <LeafletMap
        center={hcmPosition}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={true}
        className="network-map"
      >
        {/* 
          Lớp bản đồ nền địa lý (Base Map Tile):
          Tải các mảnh bản đồ số (map tiles) trực tiếp từ máy chủ OpenStreetMap.
        */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Bố trí nút điều khiển zoom ở góc dưới bên phải màn hình để không che khuất góc nhìn */}
        <ZoomControl position="bottomright" />

        {/* Kết xuất lớp bản đồ nhiệt trực quan hóa các vùng cảnh báo rủi ro */}
        <HeatmapLayer />

        {/* Điểm ghim tọa độ trung tâm TP.HCM kèm popup thông tin thử nghiệm */}
        
{/* =====================================================
    MARKER VÀ POPUP THÔNG TIN TRẠM VIỄN THÔNG
    Khi nhấn vào Marker, hiển thị 4 chỉ số KPI
    Hiện tại sử dụng dữ liệu mô phỏng stationKPI
===================================================== */}
<Marker position={hcmPosition}>
  <Popup>
    <div style={{ minWidth: "230px" }}>

      {/* Tên trạm viễn thông */}
      <h3 style={{ margin: "0 0 10px" }}>
        {stationKPI.station_name}
      </h3>

      {/* Chỉ số 1: Độ trễ mạng */}
      <p>
        <strong>Latency:</strong> {stationKPI.latency_ms} ms
      </p>

      {/* Chỉ số 2: Tỷ lệ mất gói tin */}
      <p>
        <strong>Packet Loss:</strong> {stationKPI.packet_loss_rate}%
      </p>

      {/* Chỉ số 3: Độ dao động độ trễ */}
      <p>
        <strong>Jitter:</strong> {stationKPI.jitter_ms} ms
      </p>

      {/* Chỉ số 4: Tốc độ truyền dữ liệu */}
      <p>
        <strong>Throughput:</strong> {stationKPI.throughput_mbps} Mbps
      </p>

      {/* Mức độ rủi ro của trạm */}
      <p>
        <strong>Mức rủi ro:</strong>
        <span style={{ color: "#d97706", fontWeight: "bold" }}>
          {" "}{stationKPI.risk_level}
        </span>
      </p>

    </div>
  </Popup>
</Marker>

      </LeafletMap>
    </div>
  );
}

// Xuất component để App.jsx import vào giao diện chính
export default MapContainer;
