
import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Popup,
  ZoomControl
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./MapContainer.css";
import HeatmapLayer from "./HeatmapLayer";

function MapContainer() {
  // Tọa độ trung tâm TP.HCM
  const hcmPosition = [10.8231, 106.6297];

  return (
    <div className="map-wrapper">
      <LeafletMap
        center={hcmPosition}
        zoom={12}
        zoomControl={false}
        scrollWheelZoom={true}
        className="network-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomControl position="bottomright" />
        <HeatmapLayer />

        <Marker position={hcmPosition}>
          <Popup>
            <strong>TP. Hồ Chí Minh</strong>
            <p>VNPT NetGuard AIOps - Bản đồ thử nghiệm</p>
          </Popup>
        </Marker>
      </LeafletMap>
    </div>
  );
}

export default MapContainer;
