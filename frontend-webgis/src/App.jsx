// ==============================================================================
// COMPONENT: APP (KHUNG GIAO DIỆN CHÍNH CỦA ỨNG DỤNG WEB GIS)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

// Import component bản đồ số chứa lớp nhiệt cảnh báo rủi ro
import MapContainer from "./components/Map/MapContainer";

// Import tệp CSS định hình bố cục toàn trang (header, main container)
import "./App.css";

function App() {
  return (
    <div className="app">
      {/* Thanh tiêu đề Header trên cùng hiển thị nhận diện đề tài VNPT */}
      <header className="app-header">
        <h1>VNPT NetGuard AIOps</h1>
        <p>
          Hệ thống dự báo nguy cơ suy giảm chất lượng mạng viễn thông
        </p>
      </header>

      {/* Khu vực nội dung chính chứa khung bản đồ số Web GIS */}
      <main className="app-main">
        <h2>Bản đồ giám sát mạng thời gian thực</h2>
        <MapContainer />
      </main>
    </div>
  );
}

// Xuất App để main.jsx kết xuất ra cây DOM của trình duyệt
export default App;
