// ==============================================================================
// COMPONENT: APP (KHUNG GIAO DIỆN CHÍNH ĐỒNG BỘ SIDEBAR & BẢN ĐỒ WEB GIS)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer) & Minh Trường (UI Dashboard)
// ==============================================================================

import { useState } from "react";

// Import component thanh điều khiển bên trái hiển thị danh sách trạm và bộ lọc rủi ro
import Sidebar from "./components/Sidebar";

// Import component bản đồ số chứa lớp nhiệt cảnh báo rủi ro
import MapContainer from "./components/Map/MapContainer";

// Import tệp CSS định hình bố cục toàn trang (header, main container)
import "./App.css";

function App() {
  // Lưu trạng thái trạm phát sóng đang được người vận hành chọn từ Sidebar
  const [selectedStation, setSelectedStation] = useState(null);

  return (
    <div className="app app-layout">
      {/* Thanh điều khiển Sidebar bên trái (Minh Trường) */}
      <Sidebar onSelectStation={(station) => setSelectedStation(station)} />

      {/* Khu vực khung nội dung bên phải: Header + Bản đồ số Web GIS (Võ Ngọc Quý) */}
      <div className="app-content">
        {/* Thanh tiêu đề Header trên cùng hiển thị nhận diện đề tài VNPT */}
        <header className="app-header">
          <h1>VNPT NetGuard AIOps</h1>
          <p>
            Hệ thống dự báo nguy cơ suy giảm chất lượng mạng viễn thông
          </p>
        </header>

        {/* Khu vực nội dung chính chứa khung bản đồ số Web GIS */}
        <main className="app-main">
          <h2>
            Bản đồ giám sát mạng thời gian thực
            {selectedStation && (
              <span style={{ fontSize: "14px", fontWeight: "normal", marginLeft: "12px", color: "#0284c7" }}>
                | Đang chọn: {selectedStation.station_name} ({selectedStation.latitude}, {selectedStation.longitude})
              </span>
            )}
          </h2>
          {/* Truyền trạm được chọn xuống MapContainer để đồng bộ vị trí tâm bản đồ (flyTo) */}
          <MapContainer selectedStation={selectedStation} />
        </main>
      </div>
    </div>
  );
}

// Xuất App để main.jsx kết xuất ra cây DOM của trình duyệt
export default App;