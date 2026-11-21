// ==============================================================================
// COMPONENT: HEATMAP LAYER (LỚP VÙNG PHỦ NHIỆT CẢNH BÁO NGUY CƠ SUY GIẢM MẠNG)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách phát triển: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

import { Circle, Tooltip } from "react-leaflet";

// Quy định màu sắc chuẩn trung tâm điều hành mạng (NOC)
function getRiskColor(risk) {
  const key = String(risk || "LOW").toUpperCase();
  if (key === "HIGH") return "#ef4444";
  if (key === "MEDIUM") return "#f59e0b";
  return "#22c55e";
}

function getRiskRadius(risk) {
  const key = String(risk || "LOW").toUpperCase();
  if (key === "HIGH") return 1400;
  if (key === "MEDIUM") return 1000;
  return 650;
}

// Vẽ vùng phủ rủi ro động theo danh sách trạm/cell đang hiển thị trên bản đồ
function HeatmapLayer({ stations = [], visible = true }) {
  if (!visible || !Array.isArray(stations) || stations.length === 0) {
    return null;
  }

  return (
    <>
      {stations.map((station, index) => {
        const lat = Number(station.latitude);
        const lng = Number(station.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const color = getRiskColor(station.risk_level);

        return (
          <Circle
            key={`heat-${station.id ?? station.station_code ?? index}`}
            center={[lat, lng]}
            radius={getRiskRadius(station.risk_level)}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: station.risk_level === "HIGH" ? 0.28 : 0.18,
              weight: 1.5,
              opacity: 0.7,
            }}
          >
            <Tooltip direction="top" sticky>
              <span>
                {station.station_name || station.cell_name} ({station.risk_level || "LOW"})
              </span>
            </Tooltip>
          </Circle>
        );
      })}
    </>
  );
}

export default HeatmapLayer;
