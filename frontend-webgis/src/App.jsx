// ==============================================================================
// COMPONENT: APP - TRUNG TÂM ĐIỀU HÀNH WEB GIS VNPT NETGUARD AIOPS
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer) & Minh Trường (UI Dashboard)
// ==============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar";
import MapContainer from "./components/Map/MapContainer";
import { mockStations } from "./data/mockStations";
import {
  extractStationCoordinates,
  getSpatialMapData,
  getVnptCellsGeoJSON,
} from "./services/api";
import "./App.css";

// Danh sách tọa độ tâm của các tỉnh miền Nam để di chuyển nhanh bản đồ
const REGION_PRESETS = [
  { code: "ALL", label: "Toàn miền Nam", center: [10.42, 106.08], zoom: 9 },
  { code: "CTO", label: "Cần Thơ (CTO)", center: [10.0341, 105.7875], zoom: 14 },
  { code: "BTE", label: "Bến Tre (BTE)", center: [10.2433, 106.3755], zoom: 14 },
  { code: "AGG", label: "An Giang (AGG)", center: [10.3864, 105.4352], zoom: 14 },
  { code: "HCM", label: "TP.HCM (HCM)", center: [10.8231, 106.645], zoom: 12 },
];

function App() {
  // 1. Khai báo các State quản lý danh sách Trạm / Cell và chế độ nguồn dữ liệu
  const [allStations, setAllStations] = useState(mockStations);
  const [dataSource, setDataSource] = useState("MOCK");
  const [preferMode, setPreferMode] = useState("AUTO"); // "AUTO" | "MOCK"
  const [loading, setLoading] = useState(true);

  // 2. Khai báo các State quản lý bộ lọc đồng bộ giữa Sidebar và Bản đồ
  const [selectedRisk, setSelectedRisk] = useState("ALL");
  const [selectedProvince, setSelectedProvince] = useState("ALL");
  const [selectedRuleGroup, setSelectedRuleGroup] = useState("ALL"); // Bộ lọc nhóm lỗi VNPT: ALL | A1_rule_vh | A1_rule_kt | NORMAL
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStation, setSelectedStation] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);

  // 3. Hàm tải dữ liệu Trạm & Cell 4G LTE từ Backend API (tự động dự phòng sang mockStations nếu tắt Backend)
  const loadStations = useCallback(async () => {
    if (preferMode === "MOCK") {
      setAllStations(mockStations);
      setDataSource("MOCK");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Gọi API lấy danh sách Cell 4G (1 Trạm - 3 Cell) từ bảng network_cells
      const cellsGeoJSON = await getVnptCellsGeoJSON().catch(() => null);
      const cellItems = cellsGeoJSON ? extractStationCoordinates(cellsGeoJSON) : [];

      // Gọi thêm API bảng stations nếu cần dữ liệu trạm BTS
      const spatialData = await getSpatialMapData().catch(() => null);
      const stationItems = Array.isArray(spatialData?.stations) ? spatialData.stations : [];

      // Ưu tiên hiển thị danh sách Cell 4G chuẩn mô hình 1 Trạm - 3 Cell
      const combined = cellItems.length > 0 ? cellItems : stationItems;

      if (combined.length > 0) {
        setAllStations(combined);
        setDataSource("API");
      } else {
        setAllStations(mockStations);
        setDataSource("MOCK");
      }
    } catch {
      // Nếu máy chủ Backend chưa bật thì dùng dữ liệu mẫu VNPT để giao diện luôn hoạt động ổn định
      setAllStations(mockStations);
      setDataSource("MOCK");
    } finally {
      setLoading(false);
    }
  }, [preferMode]);

  useEffect(() => {
    loadStations();
  }, [loadStations]);

  // 4. Lọc danh sách Trạm / Cell theo 4 điều kiện: Mức rủi ro + Tỉnh + Nhóm lỗi VNPT + Từ khóa tìm kiếm
  const filteredStations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return allStations.filter((station) => {
      // Lọc theo mức độ rủi ro (HIGH, MEDIUM, LOW)
      const riskKey = String(station.risk_level || "LOW").toUpperCase();
      const matchesRisk = selectedRisk === "ALL" || riskKey === selectedRisk;

      // Lọc theo mã tỉnh (CTO, BTE, AGG, HCM)
      const provCode = String(station.province_code || "").toUpperCase();
      const matchesProvince =
        selectedProvince === "ALL" || provCode === selectedProvince;

      // Lọc theo nhóm lỗi VNPT Tầng 1 (A1_rule_vh - Vận hành, A1_rule_kt - Kỹ thuật, NORMAL - Ổn định)
      const ruleGroup = String(station.a1_rule_group || "NORMAL");
      const matchesRuleGroup =
        selectedRuleGroup === "ALL" || ruleGroup === selectedRuleGroup;

      // Tìm kiếm theo tên trạm, mã trạm, tên cell (CELL_NAME), mã trạm cha (NODE_NAME) hoặc mã tỉnh
      const matchesSearch =
        !keyword ||
        String(station.station_name || "").toLowerCase().includes(keyword) ||
        String(station.station_code || "").toLowerCase().includes(keyword) ||
        String(station.cell_name || "").toLowerCase().includes(keyword) ||
        String(station.node_name || "").toLowerCase().includes(keyword) ||
        provCode.toLowerCase().includes(keyword);

      return matchesRisk && matchesProvince && matchesRuleGroup && matchesSearch;
    });
  }, [allStations, selectedRisk, selectedProvince, selectedRuleGroup, searchTerm]);

  // 5. Tính toán số liệu trên thanh thống kê nhanh Header NOC:
  // Khớp chính xác Số lượng Trạm eNodeB, Số Cell suy giảm (Vận hành + Kỹ thuật) và Số Khu vực cảnh báo
  const kpiSummary = useMemo(() => {
    const totalCells = allStations.length;

    // Đếm tổng số Trạm eNodeB duy nhất dựa theo trường node_name (mô hình 1 Trạm - 3 Cell)
    const uniqueNodes = new Set(
      allStations.map((s) => s.node_name || s.station_code)
    );
    const totalStations = uniqueNodes.size;

    // Đếm số Cell lỗi Nhóm Vận hành (A1_rule_vh) và Nhóm Kỹ thuật (A1_rule_kt)
    const vhCount = allStations.filter(
      (s) => s.a1_rule_group === "A1_rule_vh"
    ).length;
    const ktCount = allStations.filter(
      (s) => s.a1_rule_group === "A1_rule_kt"
    ).length;

    // Tổng số Cell đang bị suy giảm chất lượng
    const degradedCells = allStations.filter(
      (s) =>
        Boolean(s.is_anomaly) ||
        s.a1_rule_group === "A1_rule_vh" ||
        s.a1_rule_group === "A1_rule_kt" ||
        String(s.risk_level || "").toUpperCase() !== "LOW"
    ).length;

    // Đếm số Khu vực cảnh báo (số cụm Trạm eNodeB hoặc khu vực có ít nhất 1 Cell bị suy giảm)
    const warningAreaSet = new Set(
      allStations
        .filter(
          (s) =>
            Boolean(s.is_anomaly) ||
            s.a1_rule_group === "A1_rule_vh" ||
            s.a1_rule_group === "A1_rule_kt" ||
            String(s.risk_level || "").toUpperCase() !== "LOW"
        )
        .map((s) => s.node_name || s.province_code || s.station_code)
    );
    const warningAreas = warningAreaSet.size;

    // Số Cell đang vận hành ổn định
    const stableCells = Math.max(0, totalCells - degradedCells);

    return {
      totalStations,
      totalCells,
      degradedCells,
      vhCount,
      ktCount,
      warningAreas,
      stableCells,
    };
  }, [allStations]);

  // Hàm xử lý khi bấm chọn tỉnh: vừa lọc danh sách vừa đưa tâm bản đồ bay tới tỉnh đó
  const handleProvinceJump = (code) => {
    setSelectedProvince(code);
    const preset = REGION_PRESETS.find((r) => r.code === code);
    if (preset) {
      setMapFocus({ center: preset.center, zoom: preset.zoom, ts: Date.now() });
    }
  };

  return (
    <div className="app app-layout">
      {/* Cột trái: Thanh Sidebar hiển thị danh sách 1 Trạm - 3 Cell và các bộ lọc VNPT */}
      <Sidebar
        stations={filteredStations}
        allStations={allStations}
        totalCount={allStations.length}
        totalStationNodes={kpiSummary.totalStations}
        selectedRisk={selectedRisk}
        onRiskChange={setSelectedRisk}
        selectedProvince={selectedProvince}
        onProvinceChange={handleProvinceJump}
        selectedRuleGroup={selectedRuleGroup}
        onRuleGroupChange={setSelectedRuleGroup}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedStation={selectedStation}
        onSelectStation={(station) => setSelectedStation(station)}
        loading={loading}
        dataSource={dataSource}
      />

      {/* Cột phải: NOC Header + Thanh thống kê nhanh + Bản đồ Web GIS */}
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

          {/* Thanh thống kê nhanh khớp số lượng Trạm, Cell suy giảm và Khu vực cảnh báo */}
          <div className="kpi-strip">
            <div className="kpi-card kpi-total">
              <span className="kpi-card-label">
                Tổng số Trạm / Cell ({kpiSummary.totalStations} Trạm)
              </span>
              <strong className="kpi-card-value">
                {kpiSummary.totalStations} / {kpiSummary.totalCells}
              </strong>
            </div>
            <div className="kpi-card kpi-high">
              <span className="kpi-card-label">
                Cell suy giảm (VH: {kpiSummary.vhCount} | KT: {kpiSummary.ktCount})
              </span>
              <strong className="kpi-card-value">{kpiSummary.degradedCells}</strong>
            </div>
            <div className="kpi-card kpi-medium">
              <span className="kpi-card-label">Khu vực cảnh báo suy giảm</span>
              <strong className="kpi-card-value">{kpiSummary.warningAreas}</strong>
            </div>
            <div className="kpi-card kpi-low">
              <span className="kpi-card-label">Cell vận hành ổn định</span>
              <strong className="kpi-card-value">{kpiSummary.stableCells}</strong>
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