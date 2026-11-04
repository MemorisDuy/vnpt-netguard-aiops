// ==============================================================================
// COMPONENT: MAP CONTAINER (BAN DO DIEU HANH WEB GIS)
// De tai N3.2: He thong du bao khu vuc co nguy co suy giam chat luong mang
// Phu trach: Vo Ngoc Quy (Web GIS Engineer)
// ==============================================================================

// Import cac thanh phan can thiet tu thu vien react-leaflet:
// - MapContainer (doi ten thanh LeafletMap): Khung chua ban do goc cua Leaflet.
// - TileLayer: Lop ban do nen dia ly (dung ban do ma nguon mo OpenStreetMap).
// - Marker: Diem ghim toa do cu the tren ban do.
// - Popup: Hop thoai thong tin hien ra khi nguoi dung nhap chuot vao diem ghim.
// - ZoomControl: Nut bam phong to / thu nho ban do (+ / -).
import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Popup,
  ZoomControl
} from "react-leaflet";

// Import file dinh dang CSS mac dinh cua Leaflet (bat buoc de ban do khong bi vo giao dien)
import "leaflet/dist/leaflet.css";

// Import file tuy bien giao dien rieng cho khung ban do (chieu rong, chieu cao)
import "./MapContainer.css";

// Import lop hien thi vung nhiet canh bao nguy co suy giam mang
import HeatmapLayer from "./HeatmapLayer";

function MapContainer() {
  // Toa do dia ly trung tam mac dinh: TP. Ho Chi Minh [Vi do (Lat), Kinh do (Lng)]
  const hcmPosition = [10.8231, 106.6297];

  return (
    <div className="map-wrapper">
      {/* 
        Khoi tao khung LeafletMap:
        - center: Dat goc nhin trung tam vao toa do TP.HCM.
        - zoom: Muc do phong to mac dinh (cap 12 giup quan sat ro khu vuc do thi).
        - zoomControl={false}: Tat nut zoom mac dinh o goc tren trai de tuy chinh vi tri khac.
        - scrollWheelZoom={true}: Cho phep dung cuon chuot de phong to / thu nho.
        - className: Gan class network-map de dinh nghia chieu cao toi thieu 500px.
      */}
      <LeafletMap
        center={hcmPosition}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={true}
        className="network-map"
      >
        {/* 
          Lop ban do nen dia ly (Base Map Tile):
          Su dung nguon anh ban do mien phi tu OpenStreetMap contributors.
        */}
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Dat nut phong to / thu nho o goc duoi ben phai man hinh */}
        <ZoomControl position="bottomright" />

        {/* Nhap lop ban do nhiet hien thi cac vung canh bao nguy co suy giam mang */}
        <HeatmapLayer />

        {/* Diem ghim vi tri trung tam TP.HCM kem hop thoai thong tin (Popup) */}
        <Marker position={hcmPosition}>
          <Popup>
            <strong>TP. Ho Chi Minh</strong>
            <p>VNPT NetGuard AIOps - Ban do giam sat thu nghiem</p>
          </Popup>
        </Marker>
      </LeafletMap>
    </div>
  );
}

export default MapContainer;
