// ==============================================================================
// COMPONENT: MAP CONTAINER - BẢN ĐỒ GIÁM SÁT MẠNG WEB GIS CHUYÊN NGHIỆP
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

import { useEffect, useState } from "react";
import {
  MapContainer as LeafletMap,
  TileLayer,
  Popup,
  ZoomControl,
  CircleMarker,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import "./MapContainer.css";

import HeatmapLayer from "./HeatmapLayer";
import { RISK_COLOR_MAP, RISK_LABEL_VN_MAP } from "../../services/api";

// Tâm mặc định khu vực miền Nam (bao quát TP.HCM, Bến Tre, Cần Thơ, An Giang)
const DEFAULT_CENTER = [10.42, 106.08];
const DEFAULT_ZOOM = 9;

// 1. Component điều khiển di chuyển tâm bản đồ khi chọn trạm hoặc chuyển nhanh khu vực
function MapViewportController({ selectedStation, mapFocus }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedStation) return;

    const lat = Number(selectedStation.latitude);
    const lng = Number(selectedStation.longitude);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return;
    }

    map.flyTo([lat, lng], 15, {
      animate: true,
      duration: 1.2,
    });
  }, [map, selectedStation]);

  useEffect(() => {
    if (!mapFocus || !Array.isArray(mapFocus.center)) return;
    map.flyTo(mapFocus.center, mapFocus.zoom || 11, {
      animate: true,
      duration: 1.1,
    });
  }, [map, mapFocus]);

  return null;
}

// 2. Hàm định dạng hiển thị chỉ số KPI an toàn
function formatKPI(value, unit = "") {
  if (value === undefined || value === null || value === "") {
    return "Chưa có";
  }
  return `${value}${unit}`;
}

function getRuleGroupLabel(group) {
  if (group === "A1_rule_vh") return "Vận hành (A1_rule_vh)";
  if (group === "A1_rule_kt") return "Kỹ thuật (A1_rule_kt)";
  if (group === "INSUFFICIENT_DATA") return "Thiếu lịch sử";
  return "Ổn định (NORMAL)";
}

// 3. Component Bản đồ Web GIS chính
function MapContainer({
  stations = [],
  selectedStation = null,
  onSelectStation,
  dataSource = "MOCK",
  loading = false,
  onRetryApi,
  mapFocus = null,
}) {
  const [showHeatmap, setShowHeatmap] = useState(true);

  return (
    <div className="map-wrapper">
      {/* Thanh trạng thái nổi góc trên bên trái bản đồ */}
      <div className="map-overlay-top">
        <div className={`source-pill ${dataSource === "API" ? "pill-live" : "pill-fallback"}`}>
          <span className="status-dot" />
          {loading
            ? "Đang đồng bộ Backend API..."
            : dataSource === "API"
            ? "Trực tuyến: Backend API (Port 5000)"
            : "Chế độ Dự phòng: Dữ liệu mẫu VNPT NET"}
        </div>

        <div className="map-overlay-actions">
          <button
            type="button"
            className={`map-ctrl-btn ${showHeatmap ? "active" : ""}`}
            onClick={() => setShowHeatmap((prev) => !prev)}
          >
            {showHeatmap ? "Ẩn vùng nhiệt" : "Hiện vùng nhiệt"}
          </button>

          {dataSource !== "API" && onRetryApi && (
            <button type="button" className="map-ctrl-btn retry-btn" onClick={onRetryApi}>
              Thử kết nối API
            </button>
          )}
        </div>
      </div>

      {/* Thẻ tóm tắt trạm đang chọn nổi góc trên bên phải */}
      {selectedStation && (
        <div className="map-selected-banner">
          <div className="selected-banner-label">ĐANG GIÁM SÁT</div>
          <div className="selected-banner-title">
            {selectedStation.station_name || selectedStation.cell_name}
          </div>
          <div className="selected-banner-coords">
            Mã: {selectedStation.cell_name || selectedStation.station_code} | Tọa độ:{" "}
            {Number(selectedStation.latitude).toFixed(4)},{" "}
            {Number(selectedStation.longitude).toFixed(4)}
          </div>
        </div>
      )}

      {/* Khung bản đồ Leaflet */}
      <LeafletMap
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        scrollWheelZoom={true}
        className="network-map"
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomControl position="bottomright" />

        <MapViewportController selectedStation={selectedStation} mapFocus={mapFocus} />

        <HeatmapLayer stations={stations} visible={showHeatmap} />

        {/* Render từng điểm trạm / cell lên bản đồ */}
        {stations.map((station, index) => {
          const riskKey = String(station.risk_level || "LOW").toUpperCase();
          const riskColor =
            RISK_COLOR_MAP[riskKey] ||
            (riskKey === "HIGH"
              ? "#ef4444"
              : riskKey === "MEDIUM"
              ? "#f59e0b"
              : "#22c55e");

          const riskLabel =
            RISK_LABEL_VN_MAP[riskKey] ||
            (riskKey === "HIGH"
              ? "Nguy cơ cao"
              : riskKey === "MEDIUM"
              ? "Cảnh báo"
              : "An toàn");

          const lat = Number(station.latitude);
          const lng = Number(station.longitude);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return null;
          }

          const isSelected =
            selectedStation &&
            (selectedStation.id === station.id ||
              selectedStation.station_code === station.station_code);

          return (
            <CircleMarker
              key={station.id ?? station.station_code ?? index}
              center={[lat, lng]}
              radius={isSelected ? 12 : 8}
              pathOptions={{
                color: isSelected ? "#0f172a" : "#ffffff",
                weight: isSelected ? 3 : 2,
                fillColor: riskColor,
                fillOpacity: 0.95,
              }}
              eventHandlers={{
                click: () => {
                  if (onSelectStation) {
                    onSelectStation(station);
                  }
                },
              }}
            >
              <Popup>
                <div className="gis-popup">
                  <div className="gis-popup-header">
                    <span className="gis-popup-code">
                      {station.cell_name || station.station_code || "CELL"}
                    </span>
                    <span
                      className="gis-popup-badge"
                      style={{ backgroundColor: riskColor }}
                    >
                      {riskLabel}
                    </span>
                  </div>

                  <h3 className="gis-popup-title">
                    {station.station_name || station.name || "Trạm viễn thông"}
                  </h3>

                  {station.node_name && (
                    <div className="gis-popup-sub">
                      Trạm eNodeB: <strong>{station.node_name}</strong>
                      {station.province_code ? ` (${station.province_code})` : ""}
                    </div>
                  )}

                  <div className="gis-popup-grid">
                    <div className="gis-kpi-cell">
                      <span>CSSR</span>
                      <strong>{formatKPI(station.cssr, "%")}</strong>
                    </div>
                    <div className="gis-kpi-cell">
                      <span>Rớt cuộc gọi</span>
                      <strong>{formatKPI(station.service_drop_all ?? station.packet_loss_rate, "%")}</strong>
                    </div>
                    <div className="gis-kpi-cell">
                      <span>Lưu lượng</span>
                      <strong>{formatKPI(station.traffic_gb, " GB")}</strong>
                    </div>
                    <div className="gis-kpi-cell">
                      <span>Thông lượng</span>
                      <strong>{formatKPI(station.user_dl_avg_thput ?? station.throughput_mbps, " Mbps")}</strong>
                    </div>
                    <div className="gis-kpi-cell">
                      <span>Độ trễ</span>
                      <strong>{formatKPI(station.latency_ms, " ms")}</strong>
                    </div>
                    <div className="gis-kpi-cell">
                      <span>Điểm AI</span>
                      <strong>{formatKPI(station.risk_score, "/100")}</strong>
                    </div>
                  </div>

                  {station.a1_rule_group && (
                    <div className="gis-popup-rule">
                      Nhóm cảnh báo: <strong>{getRuleGroupLabel(station.a1_rule_group)}</strong>
                    </div>
                  )}

                  {Array.isArray(station.a4_flags) && station.a4_flags.length > 0 && (
                    <div className="gis-popup-flags">
                      <div className="flags-label">Nguyên nhân gốc Tầng 2 (A4):</div>
                      <div className="flags-list">
                        {station.a4_flags.map((flag) => (
                          <span key={flag} className="flag-tag">
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </LeafletMap>

      {/* Bảng chú giải màu sắc chuẩn NOC góc dưới bên trái */}
      <div className="map-legend">
        <div className="legend-title">CHÚ GIẢI RỦI RO VNPT NET</div>
        <div className="legend-item">
          <span className="legend-dot dot-high" />
          <span>Nguy cơ cao / Vận hành (A1_rule_vh)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-medium" />
          <span>Cảnh báo / Kỹ thuật (A1_rule_kt)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-low" />
          <span>Hoạt động ổn định (NORMAL)</span>
        </div>
      </div>
    </div>
  );
}

export default MapContainer;
