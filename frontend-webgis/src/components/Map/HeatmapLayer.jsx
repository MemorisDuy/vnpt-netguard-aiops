
import { Circle, Popup } from "react-leaflet";

// Dữ liệu khu vực giả lập để thử nghiệm
const mockRiskAreas = [
  {
    id: 1,
    name: "Khu vực A",
    position: [10.8231, 106.6297],
    risk: "HIGH",
    score: 85
  },
  {
    id: 2,
    name: "Khu vực B",
    position: [10.8015, 106.6520],
    risk: "MEDIUM",
    score: 55
  },
  {
    id: 3,
    name: "Khu vực C",
    position: [10.8500, 106.6800],
    risk: "LOW",
    score: 20
  }
];

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

function HeatmapLayer() {
  return (
    <>
      {mockRiskAreas.map((area) => (
        <Circle
          key={area.id}
          center={area.position}
          radius={1500}
          pathOptions={{
            color: getRiskColor(area.risk),
            fillColor: getRiskColor(area.risk),
            fillOpacity: 0.35,
            weight: 2
          }}
        >
          <Popup>
            <strong>{area.name}</strong>
            <p>Mức nguy cơ: {area.risk}</p>
            <p>Điểm nguy cơ: {area.score}/100</p>
            <p>Dữ liệu giả lập</p>
          </Popup>
        </Circle>
      ))}
    </>
  );
}

export default HeatmapLayer;
