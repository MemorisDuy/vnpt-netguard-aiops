// ==============================================================================
// COMPONENT: THANH ĐIỀU KHIỂN SIDEBAR DANH SÁCH TRẠM / CELL & BỘ LỌC RỦI RO
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Minh Trường (UI Dashboard) & Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

import "./Sidebar.css";

const PROVINCE_OPTIONS = [
  { code: "ALL", label: "Tất cả tỉnh" },
  { code: "CTO", label: "Cần Thơ" },
  { code: "BTE", label: "Bến Tre" },
  { code: "AGG", label: "An Giang" },
  { code: "HCM", label: "TP.HCM" },
];

const Sidebar = ({
  stations = [],
  totalCount = 0,
  selectedRisk = "ALL",
  onRiskChange,
  selectedProvince = "ALL",
  onProvinceChange,
  searchTerm = "",
  onSearchChange,
  selectedStation = null,
  onSelectStation,
  loading = false,
  dataSource = "MOCK",
}) => {
  const getRiskLabel = (riskLevel) => {
    const key = String(riskLevel || "LOW").toUpperCase();
    if (key === "HIGH") return "Nguy cơ cao";
    if (key === "MEDIUM") return "Cảnh báo";
    return "An toàn";
  };

  const getRuleTag = (group) => {
    if (group === "A1_rule_vh") return "Vận hành";
    if (group === "A1_rule_kt") return "Kỹ thuật";
    if (group === "INSUFFICIENT_DATA") return "Thiếu dữ liệu";
    return "Ổn định";
  };

  return (
    <aside className="sidebar-container">
      {/* 1. Tiêu đề thương hiệu NOC */}
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
            Hiển thị <strong>{stations.length}</strong> / {totalCount} điểm đo
          </span>
          <span className={`mini-source ${dataSource === "API" ? "live" : "mock"}`}>
            {dataSource === "API" ? "API Live" : "Mẫu VNPT"}
          </span>
        </div>
      </div>

      {/* 2. Ô tìm kiếm theo tên trạm, mã cell hoặc mã tỉnh */}
      <div className="sidebar-search-wrap">
        <input
          type="text"
          className="sidebar-search-input"
          placeholder="Tìm mã Cell, tên Trạm (VD: CRA032M, BTE)..."
          value={searchTerm}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
        />
      </div>

      {/* 3. Bộ lọc nhanh theo tỉnh */}
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

      {/* 4. Thanh lọc theo mức độ rủi ro */}
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

      {/* 5. Danh sách thẻ trạm / cell */}
      <div className="station-list">
        {loading && <p className="sidebar-status">Đang đồng bộ danh sách trạm...</p>}

        {!loading && stations.length === 0 && (
          <p className="sidebar-status">Không tìm thấy trạm/cell khớp bộ lọc hiện tại.</p>
        )}

        {!loading &&
          stations.map((station) => {
            const riskKey = String(station.risk_level || "LOW").toLowerCase();
            const isSelected =
              selectedStation &&
              (selectedStation.id === station.id ||
                selectedStation.station_code === station.station_code);

            return (
              <div
                key={station.id ?? station.station_code}
                className={`station-card ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectStation && onSelectStation(station)}
              >
                <div className="station-card-top">
                  <span className="station-code">
                    {station.cell_name || station.station_code}
                  </span>
                  <span className={`risk-badge risk-${riskKey}`}>
                    {getRiskLabel(station.risk_level)}
                  </span>
                </div>

                <h3 className="station-name">{station.station_name}</h3>

                {(station.province_code || station.a1_rule_group) && (
                  <div className="station-meta-row">
                    {station.province_code && (
                      <span className="meta-pill">{station.province_code}</span>
                    )}
                    {station.a1_rule_group && (
                      <span className={`meta-pill rule-${station.a1_rule_group}`}>
                        {getRuleTag(station.a1_rule_group)}
                      </span>
                    )}
                  </div>
                )}

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
