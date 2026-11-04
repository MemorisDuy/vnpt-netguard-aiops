
import MapContainer from "./components/Map/MapContainer";
import "./App.css";

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>VNPT NetGuard AIOps</h1>
        <p>
          Hệ thống dự báo nguy cơ suy giảm chất lượng mạng
        </p>
      </header>

      <main className="app-main">
        <h2>Bản đồ giám sát mạng</h2>
        <MapContainer />
      </main>
    </div>
  );
}

export default App;
