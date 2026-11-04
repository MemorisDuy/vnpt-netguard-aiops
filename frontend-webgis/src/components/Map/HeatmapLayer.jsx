// ==============================================================================
// COMPONENT: HEATMAP LAYER (LOP BAN DO NHIET CANH BAO RUI RO)
// De tai N3.2: He thong du bao khu vuc co nguy co suy giam chat luong mang
// Phu trach: Vo Ngoc Quy (Web GIS Engineer)
// ==============================================================================

// Import cac thanh phan ve hinh hoc tu thu vien react-leaflet:
// - Circle: Ve vong tron bieu dien vung phu song / ban kinh anh huong cua tram.
// - Popup: Hop thoai chi tiet thong so KPI khi nhap chuot vao vung nhiet.
import { Circle, Popup } from "react-leaflet";

// ==============================================================================
// 1. DU LIEU GIA LAP (MOCK DATA) PHUC VU KIEM THU GIAO DIEN TRUOC KHI NOI API
// ==============================================================================
// Trong giai doan Sprint 1, dung du lieu gia lap voi 3 cap do rui ro de kiem thu
// kha nang render mau sac va phan bo khong gian tren ban do TP.HCM:
const mockRiskAreas = [
  {
    id: 1,
    name: "Khu vuc A (San bay Tan Son Nhat - Tan Binh)",
    position: [10.8231, 106.6297],
    risk: "HIGH",     // Muc nguy co cao (Mau Do)
    score: 85         // Diem chi so rui ro: 85/100
  },
  {
    id: 2,
    name: "Khu vuc B (Quan Phu Nhuan)",
    position: [10.8015, 106.6520],
    risk: "MEDIUM",   // Muc luu y / canh bao trung binh (Mau Vang)
    score: 55         // Diem chi so rui ro: 55/100
  },
  {
    id: 3,
    name: "Khu vuc C (Quan Go Vap)",
    position: [10.8500, 106.6800],
    risk: "LOW",      // Muc an toan / hoat dong on dinh (Mau Xanh la)
    score: 20         // Diem chi so rui ro: 20/100
  }
];

// ==============================================================================
// 2. HAM QUY DINH MA MAU TRUC QUAN THEO MUC DO RUI RO AI (COLOR PALETTE)
// ==============================================================================
// Chuan hoa ma mau phu hop voi tieu chuan giam sat vien thong AIOps:
// - HIGH: Do (#ef4444) -> Canh bao khan cap, nguy co suy giam tram cao.
// - MEDIUM: Vang (#eab308) -> Canh bao theo doi, chat luong co dau hieu suy giam nhe.
// - LOW: Xanh la (#22c55e) -> Hoat dong on dinh, chi so KPI dat nguong an toan.
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
// 3. COMPONENT RENDER CAC VUNG NHIET LEN BAN DO
// ==============================================================================
function HeatmapLayer() {
  return (
    <>
      {/* Duyet qua tung khu vuc de ve vong tron ban kinh tren ban do */}
      {mockRiskAreas.map((area) => (
        <Circle
          key={area.id}
          center={area.position}
          radius={1500} // Ban kinh vung anh huong: 1500 met (1.5 km)
          pathOptions={{
            color: getRiskColor(area.risk),       // Mau duong vien vong tron
            fillColor: getRiskColor(area.risk),   // Mau to ben trong vong tron
            fillOpacity: 0.35,                    // Do trong suot 35% de khong che khuat duong pho
            weight: 2                             // Do day vien: 2px
          }}
        >
          {/* Hop thoai Popup hien thi chi tiet thong tin khi ky su nhap vao vung rui ro */}
          <Popup>
            <strong>{area.name}</strong>
            <p>Muc do nguy co: {area.risk}</p>
            <p>Diem danh gia rui ro: {area.score}/100</p>
            <p>Trang thai: Du lieu thu nghiem he thong</p>
          </Popup>
        </Circle>
      ))}
    </>
  );
}

export default HeatmapLayer;
