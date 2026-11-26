
// ============================================================
// COMPONENT: SOVEREIGNTY LAYER - LỚP GHI CHÚ CHỦ QUYỀN
// Đề tài N3.2: Hệ thống dự báo suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer)
// ============================================================

import { CircleMarker, Tooltip } from "react-leaflet";

// Danh sách địa danh cần bổ sung trên bản đồ
// Tọa độ mang tính đại diện để đặt nhãn hiển thị
const SOVEREIGNTY_LOCATIONS = [
  {
    id: "hoang-sa",
    name: "Quần đảo Hoàng Sa (Đà Nẵng - Việt Nam)",
    position: [16.5, 112.0],
  },
  {
    id: "truong-sa",
    name: "Quần đảo Trường Sa (Khánh Hòa - Việt Nam)",
    position: [9.9, 114.0],
  },
  {
    id: "bien-dong",
    name: "BIỂN ĐÔNG",
    position: [13.0, 112.5],
  },
  {
    id: "phu-quoc",
    name: "Đảo Phú Quốc (Việt Nam)",
    position: [10.25, 103.96],
  },
  {
    id: "con-dao",
    name: "Côn Đảo (Việt Nam)",
    position: [8.68, 106.61],
  },
];

// Component hiển thị lớp ghi chú trên bản đồ Leaflet
function SovereigntyLayer() {
  return (
    <>
      {SOVEREIGNTY_LOCATIONS.map((location) => (
        <CircleMarker
          key={location.id}
          center={location.position}
          radius={location.id === "bien-dong" ? 0 : 5}
          pathOptions={{
            color: "#ffffff",
            fillColor: "#ea580c",
            fillOpacity: 1,
            weight: 2,
          }}
        >
          {/* Hiển thị nhãn địa danh cố định */}
          <Tooltip
            permanent
            direction="top"
            offset={[0, -8]}
            opacity={1}
            className="sovereignty-label"
          >
            {location.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export default SovereigntyLayer;
