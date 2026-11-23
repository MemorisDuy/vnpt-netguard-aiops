// ==============================================================================
// COMPONENT: THANH ĐIỀU KHIỂN SIDEBAR DANH SÁCH 1 TRẠM - 3 CELL & BỘ LỌC VNPT
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Minh Trường (UI Dashboard) & Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

import { useMemo } from "react";
import "./Sidebar.css";

// Danh sách các nút lọc theo Tỉnh (CTO - Cần Thơ, BTE - Bến Tre, AGG - An Giang, HCM - TP.HCM)
const PROVINCE_OPTIONS = [
  { code: "ALL", label: "Tất cả tỉnh" },
  { code: "CTO", label: "Cần Thơ (CTO)" },
  { code: "BTE", label: "Bến Tre (BTE)" },
  { code: "AGG", label: "An Giang (AGG)" },
  { code: "HCM", label: "TP.HCM (HCM)" },
];

// Danh sách các nút lọc theo Nhóm lỗi quy chuẩn VNPT NET Tầng 1 (A1)
const RULE_GROUP_OPTIONS = [
  { code: "ALL", label: "Tất cả nhóm lỗi" },
  { code: "A1_rule_vh", label: "Vận hành (A1_vh)" },
  { code: "A1_rule_kt", label: "Kỹ thuật (A1_kt)" },
  { code: "NORMAL", label: "Ổn định" },
];

const Sidebar = ({
  stations = [],
  allStations = [],
  totalCount = 0,
  totalStationNodes = 0,
  selectedRisk = "ALL",
  onRiskChange,
  selectedProvince = "ALL",
  onProvinceChange,
  selectedRuleGroup = "ALL",
  onRuleGroupChange,
  searchTerm = "",
  onSearchChange,
  selectedStation = null,
  onSelectStation,
  loading = false,
  dataSource = "MOCK",
}) => {
  // Hàm chuyển mã mức độ rủi ro sang tiếng Việt hiển thị trên Badge
  const getRiskLabel = (riskLevel) => {
    const key = String(riskLevel || "LOW").toUpperCase();
    if (key === "HIGH") return "Nguy cơ cao";
    if (key === "MEDIUM") return "Cảnh báo";
    return "An toàn";
  };

  // Hàm chuyển mã nhóm lỗi Tầng 1 (A1) sang nhãn tiếng Việt
  const getRuleTag = (group) => {
    if (group === "A1_rule_vh") return "Lỗi Vận hành (A1_vh)";
    if (group === "A1_rule_kt") return "Lỗi Kỹ thuật (A1_kt)";
    if (group === "INSUFFICIENT_DATA") return "Thiếu dữ liệu";
    return "Ổn định";
  };

  // Gom nhóm các Cell con theo mã Trạm cha (node_name) để hiển thị cấu trúc 1 Trạm - 3 Cell con
  const cellsByNodeName = useMemo(() => {
    const sourceList = allStations.length > 0 ? allStations : stations;
    const map = {};
    sourceList.forEach((item) => {
      const nodeKey = item.node_name || item.station_code;
      if (!nodeKey) return;
      if (!map[nodeKey]) {
        map[nodeKey] = [];
      }
      map[nodeKey].push(item);
    });
    return map;
  }, [allStations, stations]);

  return (
    <aside className="sidebar-container">
      {/* 1. Tiêu đề thương hiệu NOC và bộ đếm số lượng Trạm / Cell */}
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <span className="sidebar-brand-badge">VNPT</span>
          <div>
            <h2 className="sidebar-title">VNPT NetGuard</h2>
            <p className="sidebar-subtitle">Giám sát 1 Trạm - 3 Cell &amp; BTS</p>
          </div>
        </div>
        <div className="sidebar-counter-row">
          <span>
            Hiển thị <strong>{stations.length}</strong> / {totalCount} Cell (
            {totalStationNodes || Object.keys(cellsByNodeName).length} Trạm)
          </span>
          <span className={`mini-source ${dataSource === "API" ? "live" : "mock"}`}>
            {dataSource === "API" ? "API Live" : "Mẫu VNPT"}
          </span>
        </div>
      </div>

      {/* 2. Ô tìm kiếm theo mã Cell (CELL_NAME), tên Trạm (NODE_NAME) hoặc mã Tỉnh */}
      <div className="sidebar-search-wrap">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Tìm CELL_NAME, Trạm (VD: CRA032M, CTO, BTE)..."
          value={searchTerm}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
      </div>

      {/* 3. Bộ lọc nhanh theo Tỉnh (CTO, BTE, AGG, HCM) */}
      <div className="sidebar-province-bar">
        {PROVINCE_OPTIONS.map((prov) => (
          <button
            key={prov.code}
            type="button"
            className={`prov-btn ${selectedProvince === prov.code ? "active" : ""}`}
            onClick={() => onProvinceChange && onProvinceChange(prov.code)}
          >
            {prov.label}
          </button>
        ))}
      </div>

      {/* 4. Bộ lọc theo Nhóm lỗi VNPT (A1_rule_vh - Vận hành, A1_rule_kt - Kỹ thuật) */}
      <div className="sidebar-province-bar">
        {RULE_GROUP_OPTIONS.map((rule) => (
          <button
            key={rule.code}
            type="button"
            className={`prov-btn ${selectedRuleGroup === rule.code ? "active" : ""}`}
            onClick={() => onRuleGroupChange && onRuleGroupChange(rule.code)}
          >
            {rule.label}
          </button>
        ))}
      </div>

      {/* 5. Thanh lọc theo mức độ rủi ro (ALL / HIGH / MEDIUM / LOW) */}
      <div className="sidebar-filter">
        <button
          type="button"
          className={`filter-btn ${selectedRisk === "ALL" ? "active" : ""}`}
          onClick={() => onRiskChange && onRiskChange("ALL")}
        >
          Tất cả
        </button>
        <button
          type="button"
          className={`filter-btn filter-high ${selectedRisk === "HIGH" ? "active" : ""}`}
          onClick={() => onRiskChange && onRiskChange("HIGH")}
        >
          Cao
        </button>
        <button
          type="button"
          className={`filter-btn filter-medium ${selectedRisk === "MEDIUM" ? "active" : ""}`}
          onClick={() => onRiskChange && onRiskChange("MEDIUM")}
        >
          Cảnh báo
        </button>
        <button
          type="button"
          className={`filter-btn filter-low ${selectedRisk === "LOW" ? "active" : ""}`}
          onClick={() => onRiskChange && onRiskChange("LOW")}
        >
          An toàn
        </button>
      </div>

      {/* 6. Danh sách thẻ Trạm và 3 Cell con (CELL_NAME) */}
      <div className="station-list">
        {loading && <p className="sidebar-status">Đang đồng bộ danh sách trạm và cell...</p>}

        {!loading && stations.length === 0 && (
          <p className="sidebar-status">Không tìm thấy trạm/cell khớp bộ lọc hiện tại.</p>
        )}

        {!loading &&
          stations.map((station) => {
            const riskKey = String(station.risk_level || "LOW").toLowerCase();
            const isSelected =
              selectedStation &&
              (selectedStation.id === station.id ||
                selectedStation.station_code === station.station_code ||
                (selectedStation.cell_name &&
                  selectedStation.cell_name === station.cell_name));

            const nodeKey = station.node_name || station.station_code;
            const siblingCells = cellsByNodeName[nodeKey] || [];

            return (
              <div
                key={station.id ?? station.cell_name ?? station.station_code}
                className={`station-card ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectStation && onSelectStation(station)}
              >
                {/* Dòng trên cùng: Mã CELL_NAME + Nhãn màu mức độ rủi ro */}
                <div className="station-card-top">
                  <span className="station-code">
                    {station.cell_name || station.station_code}
                  </span>
                  <span className={`risk-badge risk-${riskKey}`}>
                    {getRiskLabel(station.risk_level)}
                  </span>
                </div>

                {/* Tên vị trí đặt Trạm và Cell */}
                <h3 className="station-name">{station.station_name}</h3>

                {/* Hiển thị mã Trạm cha eNodeB (node_name) và các nhãn Tỉnh, Nhóm lỗi VNPT */}
                <div className="station-meta-row">
                  {station.node_name && (
                    <span className="meta-pill">Trạm: {station.node_name}</span>
                  )}
                  {station.province_code && (
                    <span className="meta-pill">{station.province_code}</span>
                  )}
                  {station.a1_rule_group && (
                    <span className={`meta-pill rule-${station.a1_rule_group}`}>
                      {getRuleTag(station.a1_rule_group)}
                    </span>
                  )}
                </div>

                {/* Hiển thị danh sách 3 Cell con (CELL_NAME) thuộc cùng Trạm eNodeB */}
                {siblingCells.length > 1 && (
                  <div
                    className="station-meta-row"
                    style={{ marginTop: "4px", marginBottom: "10px" }}
                  >
                    {siblingCells.map((cellItem) => {
                      const cellCode = cellItem.cell_name || cellItem.station_code;
                      const isCurrentCell =
                        cellCode === (station.cell_name || station.station_code);
                      return (
                        <span
                          key={cellCode}
                          className={`meta-pill ${
                            cellItem.a1_rule_group
                              ? `rule-${cellItem.a1_rule_group}`
                              : ""
                          }`}
                          style={{
                            border: isCurrentCell
                              ? "1px solid #38bdf8"
                              : "1px solid transparent",
                            cursor: "pointer",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectStation) {
                              onSelectStation(cellItem);
                            }
                          }}
                        >
                          {cellCode}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Dòng dưới: 3 chỉ số đo chất lượng mạng (CSSR/Trễ, Drop/Mất gói, Thông lượng) */}
                <div className="station-metrics">
                  <div className="metric-item">
                    <span className="metric-label">CSSR / Trễ</span>
                    <span className="metric-value">
                      {station.cssr !== undefined
                        ? `${station.cssr}%`
                        : `${station.latency_ms} ms`}
                    </span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Drop / Mất gói</span>
                    <span className="metric-value">
                      {station.service_drop_all ?? station.packet_loss_rate}%
                    </span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Thông lượng</span>
                    <span className="metric-value">
                      {station.user_dl_avg_thput ?? station.throughput_mbps} Mbps
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </aside>
  );
};

export default Sidebar;