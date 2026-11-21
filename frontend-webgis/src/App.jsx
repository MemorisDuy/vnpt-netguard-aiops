// ==============================================================================
// COMPONENT: APP - TRUNG TÂM ĐIỀU HÀNH WEB GIS VNPT NETGUARD AIOPS
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer) & Minh Trường (UI Dashboard)
// ==============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import MapContainer from "./components/Map/MapContainer";
import { mockStations } from "./data/mockStations";
import { getSpatialMapData } from "./services/api";
import "./App.css";

const REGION_PRESETS = [
  { code: "ALL", label: "Toàn miền Nam", center: [10.42, 106.08], zoom: 9 },
  { code: "CTO", label: "Cần Thơ (CTO)", center: [10.0341, 105.7875], zoom: 14 },
  { code: "BTE", label: "Bến Tre (BTE)", center: [10.2433, 106.3755], zoom: 14 },
  { code: "AGG", label: "An Giang (AGG)", center: [10.3864, 105.4352], zoom: 14 },
  { code: "HCM", label: "TP.HCM (HCM)", center: [10.8231, 106.645], zoom: 12 },
];

function App() {
  const [allStations, setAllStations] = useState(mockStations);
  const [dataSource, setDataSource] = useState("MOCK");
  const [preferMode, setPreferMode] = useState("AUTO"); // "AUTO" | "MOCK"
  const [loading, setLoading] = useState(true);

  const [selectedRisk, setSelectedRisk] = useState("ALL");
  const [selectedProvince, setSelectedProvince] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStation, setSelectedStation] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);

  // Tải dữ liệu thông minh: ưu tiên Backend API (Port 5000), tự động chuyển dữ liệu mẫu VNPT nếu Backend ngoại tuyến
  const loadStations = useCallback(async () => {
    if (preferMode === "MOCK") {
      setAllStations(mockStations);
      setDataSource("MOCK");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getSpatialMapData();
      if (data && Array.isArray(data.stations) && data.stations.length > 0) {
        setAllStations(data.stations);
        setDataSource("API");
      } else {
        setAllStations(mockStations);
        setDataSource("MOCK");
      }
    } catch {
      // Backend cổng 5000 chưa bật -> kích hoạt dữ liệu mẫu VNPT NET để giao diện luôn hoạt động mượt mà
      setAllStations(mockStations);
      setDataSource("MOCK");
    } finally {
      setLoading(false);
    }
  }, [preferMode]);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  // Lọc danh sách trạm đồng bộ cho cả Sidebar và Bản đồ
  const filteredStations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return allStations.filter((station) => {
      const riskKey = String(station.risk_level || "LOW").toUpperCase();
      const matchesRisk = selectedRisk === "ALL" || riskKey === selectedRisk;

      const provCode = String(station.province_code || "").toUpperCase();
      const matchesProvince =
        selectedProvince === "ALL" || provCode === selectedProvince;

      const matchesSearch =
        !keyword ||
        String(station.station_name || "").toLowerCase().includes(keyword) ||
        String(station.station_code || "").toLowerCase().includes(keyword) ||
        String(station.cell_name || "").toLowerCase().includes(keyword) ||
        String(station.node_name || "").toLowerCase().includes(keyword) ||
        provCode.toLowerCase().includes(keyword);

      return matchesRisk && matchesProvince && matchesSearch;
    });
  }, [allStations, selectedRisk, selectedProvince, searchTerm]);

  // Thống kê tổng quan KPI hiển thị trên thanh NOC Header
  const kpiSummary = useMemo(() => {
    const total = allStations.length;
    const high = allStations.filter(
      (s) => String(s.risk_level || "").toUpperCase() === "HIGH"
    ).length;
    const medium = allStations.filter(
      (s) => String(s.risk_level || "").toUpperCase() === "MEDIUM"
    ).length;
    const low = total - high - medium;
    return { total, high, medium, low };
  }, [allStations]);

  const handleProvinceJump = (code) => {
    setSelectedProvince(code);
    const preset = REGION_PRESETS.find((r) => r.code === code);
    if (preset) {
      setMapFocus({ center: preset.center, zoom: preset.zoom, ts: Date.now() });
    }
  };

  return (
    <div className="app app-layout">
      {/* Cột trái: Sidebar tìm kiếm, lọc tỉnh, lọc rủi ro và danh sách Trạm/Cell */}
      <Sidebar
        stations={filteredStations}
        totalCount={allStations.length}
        selectedRisk={selectedRisk}
        onRiskChange={setSelectedRisk}
        selectedProvince={selectedProvince}
        onProvinceChange={handleProvinceJump}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedStation={selectedStation}
        onSelectStation={(station) => setSelectedStation(station)}
        loading={loading}
        dataSource={dataSource}
      />

      {/* Cột phải: NOC Header + Thanh KPI tổng quan + Bản đồ Web GIS */}
      <div className="app-content">
        <header className="app-header">
          <div className="header-top-row">
            <div>
              <h1>VNPT NetGuard AIOps — Trung tâm Giám sát Web GIS</h1>
              <p>
                Hệ thống dự báo sớm nguy cơ suy giảm chất lượng mạng viễn thông 4G LTE (Mô hình 1 Trạm - 3 Cell)
              </p>
            </div>

            <div className="header-mode-switch">
              <button
                type="button"
                className={`mode-btn ${preferMode === "AUTO" ? "active" : ""}`}
                onClick={() => setPreferMode("AUTO")}
              >
                Tự động (API)
              </button>
              <button
                type="button"
                className={`mode-btn ${preferMode === "MOCK" ? "active" : ""}`}
                onClick={() => setPreferMode("MOCK")}
              >
                Mẫu VNPT
              </button>
            </div>
          </div>

          {/* 4 thẻ chỉ số KPI tóm tắt */}
          <div className="kpi-strip">
            <div className="kpi-card kpi-total">
              <span className="kpi-card-label">Tổng điểm giám sát</span>
              <strong className="kpi-card-value">{kpiSummary.total}</strong>
            </div>
            <div className="kpi-card kpi-high">
              <span className="kpi-card-label">Nguy cơ cao (Vận hành)</span>
              <strong className="kpi-card-value">{kpiSummary.high}</strong>
            </div>
            <div className="kpi-card kpi-medium">
              <span className="kpi-card-label">Cảnh báo (Kỹ thuật)</span>
              <strong className="kpi-card-value">{kpiSummary.medium}</strong>
            </div>
            <div className="kpi-card kpi-low">
              <span className="kpi-card-label">Vận hành ổn định</span>
              <strong className="kpi-card-value">{kpiSummary.low}</strong>
            </div>
          </div>
        </header>

        <main className="app-main">
          <div className="map-toolbar">
            <h2>Bản đồ giám sát mạng thời gian thực</h2>
            <div className="region-jumps">
              {REGION_PRESETS.map((region) => (
                <button
                  key={region.code}
                  type="button"
                  className={`region-btn ${selectedProvince === region.code ? "active" : ""}`}
                  onClick={() => handleProvinceJump(region.code)}
                >
                  {region.label}
                </button>
              ))}
            </div>
          </div>

          <MapContainer
            stations={filteredStations}
            selectedStation={selectedStation}
            onSelectStation={(station) => setSelectedStation(station)}
            dataSource={dataSource}
            loading={loading}
            onRetryApi={() => {
              setPreferMode("AUTO");
              loadStations();
            }}
            mapFocus={mapFocus}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
