
 // ==============================================================================
 // COMPONENT: MAP CONTAINER - BẢN ĐỒ GIÁM SÁT MẠNG WEB GIS
 // Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
 // Phụ trách: Võ Ngọc Quý (Web GIS Engineer)
 //
 // CHỨC NĂNG:
 // - Hiển thị bản đồ OpenStreetMap bằng React Leaflet.
 // - Hiển thị các vùng cảnh báo từ HeatmapLayer.
 // - Hiển thị trạm viễn thông và thông số KPI.
 // - Tự động di chuyển bản đồ khi chọn trạm từ Sidebar.
 // - Hỗ trợ MOCK để phát triển Frontend, API để tích hợp Backend sau này.
 // ==============================================================================

import { useEffect, useState } from "react";

import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Popup,
  ZoomControl,
  CircleMarker,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./MapContainer.css";

// Import lớp hiển thị vùng cảnh báo nguy cơ suy giảm mạng
import HeatmapLayer from "./HeatmapLayer";

// Import dữ liệu giả lập dùng chung với Sidebar
import { mockStations } from "../../data/mockStations";

// Import API do Ngọc Lân phát triển để phục vụ tích hợp Backend
import {
  getSpatialMapData,
  RISK_COLOR_MAP,
  RISK_LABEL_VN_MAP,
} from "../../services/api";

// Chọn nguồn dữ liệu cho bản đồ: MOCK hoặc API
// Khi Backend sẵn sàng, chuyển thành "API"
const DATA_MODE = "MOCK";

// Trung tâm bản đồ mặc định tại TP. Hồ Chí Minh
const HCM_POSITION = [10.8231, 106.6297];

// ==============================================================================
// 1. COMPONENT ĐIỀU KHIỂN VỊ TRÍ BẢN ĐỒ
// Bổ sung: Võ Ngọc Quý - Web GIS Engineer
// ==============================================================================

function MapFlyToStation({ selectedStation }) {
  // Lấy đối tượng bản đồ Leaflet đang hoạt động
  const map = useMap();

  useEffect(() => {
    // Không di chuyển nếu chưa chọn trạm từ Sidebar
    if (!selectedStation) return;

    // Lấy tọa độ trạm được chọn
    const latitude = Number(selectedStation.latitude);
    const longitude = Number(selectedStation.longitude);

    // Kiểm tra tọa độ hợp lệ trước khi điều khiển bản đồ
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      console.warn("Tọa độ trạm không hợp lệ:", selectedStation);
      return;
    }

    // Di chuyển và phóng to bản đồ đến vị trí trạm
    map.flyTo([latitude, longitude], 15, {
      animate: true,
      duration: 1.5,
    });
  }, [map, selectedStation]);

  // Component chỉ xử lý điều khiển bản đồ
  return null;
}

// ==============================================================================
// 2. HÀM HIỂN THỊ THÔNG SỐ KPI
// ==============================================================================

function showKPI(value, unit = "") {
  // Hiển thị thông báo khi trạm chưa có dữ liệu KPI
  if (value === undefined || value === null || value === "") {
    return "Chưa có dữ liệu";
  }

  return `${value}${unit}`;
}

// ==============================================================================
// 3. COMPONENT CHÍNH HIỂN THỊ BẢN ĐỒ WEB GIS
// ==============================================================================

function MapContainer({ selectedStation }) {
  // Lưu danh sách trạm đang hiển thị trên bản đồ
  const [stations, setStations] = useState(
    DATA_MODE === "MOCK" ? mockStations : []
  );

  // Lưu trạng thái tải dữ liệu và lỗi kết nối
  const [loading, setLoading] = useState(DATA_MODE === "API");
  const [error, setError] = useState("");

  // Tải dữ liệu trạm theo chế độ MOCK hoặc API
  useEffect(() => {
    // Chế độ MOCK sử dụng dữ liệu giả lập từ file dùng chung
    if (DATA_MODE === "MOCK") {
      setStations(mockStations);
      return;
    }

    // Chế độ API gọi Backend do Ngọc Lân phát triển
    let cancelled = false;

    async function loadMapData() {
      try {
        setLoading(true);
        setError("");

        // Gọi API lấy dữ liệu không gian của các trạm
        const data = await getSpatialMapData();

        if (!cancelled) {
          // Cập nhật danh sách trạm từ Backend
          setStations(data.stations || []);
        }
      } catch (err) {
        console.error("Lỗi tải dữ liệu Web GIS:", err);

        if (!cancelled) {
          // Thông báo lỗi khi Backend chưa sẵn sàng
          setError("Chưa kết nối được Backend tại cổng 5000.");
        }
      } finally {
        if (!cancelled) {
          // Kết thúc trạng thái tải dữ liệu
          setLoading(false);
        }
      }
    }

    loadMapData();

    // Ngăn cập nhật state khi component đã bị hủy
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="map-wrapper">
      {/* Hiển thị trạng thái tải dữ liệu từ Backend */}
      {loading && (
        <p style={{ color: "#2563eb" }}>
          Đang tải dữ liệu trạm viễn thông...
        </p>
      )}

      {/* Hiển thị lỗi kết nối khi đang ở chế độ API */}
      {error && (
        <p style={{ color: "#dc2626" }}>
           {error} Bản đồ nền vẫn hoạt động bình thường.
        </p>
      )}

      {/* Khung bản đồ Leaflet */}
      <LeafletMap
        center={HCM_POSITION}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={true}
        className="network-map"
      >
        {/* Hiển thị bản đồ nền OpenStreetMap */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Nút điều khiển phóng to và thu nhỏ bản đồ */}
        <ZoomControl position="bottomright" />

        {/* Di chuyển bản đồ khi người dùng chọn trạm từ Sidebar */}
        <MapFlyToStation selectedStation={selectedStation} />

        {/* Giữ lớp cảnh báo nguy cơ suy giảm mạng hiện tại */}
        <HeatmapLayer />

        {/* Hiển thị các trạm viễn thông trên bản đồ */}
        {stations.map((station, index) => {
          // Chuẩn hóa mức độ rủi ro của trạm
          const riskKey = String(
            station.risk_level || "LOW"
          ).toUpperCase();

          // Lấy màu hiển thị tương ứng với mức độ rủi ro
          const riskColor =
            RISK_COLOR_MAP[riskKey] ||
            (riskKey === "HIGH"
              ? "#ef4444"
              : riskKey === "MEDIUM"
              ? "#eab308"
              : "#22c55e");

          // Chuyển mức độ rủi ro sang nhãn tiếng Việt
          const riskLabel =
            RISK_LABEL_VN_MAP[riskKey] ||
            (riskKey === "HIGH"
              ? "Nguy cơ cao"
              : riskKey === "MEDIUM"
              ? "Cảnh báo"
              : "An toàn");

          // Lấy tọa độ từ dữ liệu MOCK hoặc API
          const position = Array.isArray(station.position)
            ? station.position
            : [
                Number(station.latitude),
                Number(station.longitude),
              ];

          // Bỏ qua các trạm có tọa độ không hợp lệ
          if (
            position.length !== 2 ||
            !Number.isFinite(Number(position[0])) ||
            !Number.isFinite(Number(position[1]))
          ) {
            return null;
          }

          return (
            <CircleMarker
              key={station.id ?? index}
              center={position}
              radius={8}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: riskColor,
                fillOpacity: 1,
              }}
            >
              {/* Popup hiển thị thông tin chi tiết của trạm */}
              <Popup>
                <div style={{ minWidth: "230px" }}>
                  <h3 style={{ margin: "0 0 10px" }}>
                    {station.station_name ||
                      station.name ||
                      "Trạm viễn thông"}
                  </h3>

                  <p>
                    <strong>Mã trạm:</strong>{" "}
                    {station.station_code || "Chưa có dữ liệu"}
                  </p>

                  <p>
                    <strong>Độ trễ:</strong>{" "}
                    {showKPI(station.latency_ms, " ms")}
                  </p>

                  <p>
                    <strong>Tỷ lệ mất gói:</strong>{" "}
                    {showKPI(station.packet_loss_rate, "%")}
                  </p>

                  <p>
                    <strong>Jitter:</strong>{" "}
                    {showKPI(station.jitter_ms, " ms")}
                  </p>

                  <p>
                    <strong>Băng thông:</strong>{" "}
                    {showKPI(station.throughput_mbps, " Mbps")}
                  </p>

                  <p>
                    <strong>Mức độ rủi ro:</strong>{" "}
                    <span
                      style={{
                        color: riskColor,
                        fontWeight: "bold",
                      }}
                    >
                      {riskLabel}
                    </span>
                  </p>

                  <p>
                    <strong>Điểm rủi ro:</strong>{" "}
                    {showKPI(station.risk_score, "/100")}
                  </p>

                  <p>
                    <strong>Nguồn dữ liệu:</strong>{" "}
                    {DATA_MODE === "MOCK"
                      ? "Mô phỏng Frontend"
                      : "Backend API"}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </LeafletMap>
    </div>
  );
}

// Xuất component để App.jsx sử dụng
export default MapContainer;
