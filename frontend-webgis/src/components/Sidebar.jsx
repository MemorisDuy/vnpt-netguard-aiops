// ==============================================================================
// COMPONENT: THANH ĐIỀU KHIỂN BÊN TRÁI (SIDEBAR DANH SÁCH TRẠM & BỘ LỌC RỦI RO)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Minh Trường (Full-stack & UI Dashboard)
// ------------------------------------------------------------------------------
// TIẾN ĐỘ THỰC HIỆN (PROGRESS LOG):
// - [x] Bước 1: Khởi tạo State quản lý danh sách trạm và bộ lọc rủi ro
// - [x] Bước 2: Dùng useEffect gọi API GET /api/stations từ Backend
// - [x] Bước 3: Viết logic lọc trạm theo mức độ rủi ro (ALL / HIGH / MEDIUM / LOW)
// - [x] Bước 4: Thiết kế giao diện thẻ trạm (Station Card) kèm Badge màu rủi ro
// ==============================================================================

import { useState, useEffect } from 'react';
import './Sidebar.css';

/**
 * Component Sidebar hiển thị danh sách trạm phát sóng bên trái màn hình WebGIS
 * @param {Object} props
 * @param {Function} props.onSelectStation - Hàm callback (tùy chọn) truyền trạm được click sang Map của Quý
 */
const Sidebar = ({ onSelectStation }) => {
    // [Bước 1]: Khai báo các State lưu trữ dữ liệu
    const [stations, setStations] = useState([]);           // Danh sách gốc lấy từ API
    const [selectedRisk, setSelectedRisk] = useState('ALL'); // Bộ lọc: 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
    const [activeStationId, setActiveStationId] = useState(null); // ID trạm đang được chọn
    const [loading, setLoading] = useState(true);           // Trạng thái chờ tải API
    const [error, setError] = useState(null);               // Lưu thông báo lỗi nếu mất kết nối

    // [Bước 2]: Gọi API GET /api/stations ngay khi Component được render lần đầu
    useEffect(() => {
        const fetchStations = async () => {
            try {
                setLoading(true);
                const response = await fetch('http://localhost:5000/api/stations');
                const result = await response.json();

                if (result.status === 'success') {
                    setStations(result.data);
                    setError(null);
                } else {
                    setError('Không thể lấy dữ liệu trạm phát sóng');
                }
            } catch (err) {
                console.error('[SIDEBAR ERROR]:', err);
                setError('Mất kết nối tới máy chủ Backend (Port 5000)');
            } finally {
                setLoading(false);
            }
        };

        fetchStations();
    }, []);

    // [Bước 3]: Lọc danh sách trạm dựa trên nút bộ lọc người dùng đang chọn
    const filteredStations = stations.filter((station) => {
        if (selectedRisk === 'ALL') return true;
        return station.risk_level === selectedRisk;
    });

    // Hàm đổi nhãn tiếng Anh trong DB sang tiếng Việt hiển thị trên Badge
    const getRiskLabel = (riskLevel) => {
        switch (riskLevel) {
            case 'HIGH':
                return 'Nguy cơ cao';
            case 'MEDIUM':
                return 'Cảnh báo';
            case 'LOW':
                return 'An toàn';
            default:
                return riskLevel;
        }
    };

    // Xử lý khi người dùng click vào 1 trạm trong danh sách
    const handleStationClick = (station) => {
        setActiveStationId(station.id);
        // Nếu component Map bên ngoài có truyền hàm onSelectStation vào thì gọi để bản đồ zoom tới trạm đó
        if (onSelectStation) {
            onSelectStation(station);
        }
    };

    return (
        <aside className="sidebar-container">
            {/* 1. Phần Header của Sidebar */}
            <div className="sidebar-header">
                <h2 className="sidebar-title">📡 VNPT NetGuard</h2>
                <p className="sidebar-subtitle">Giám sát trạm phát sóng BTS</p>
            </div>

            {/* 2. Thanh nút bấm lọc theo mức độ rủi ro */}
            <div className="sidebar-filter">
                <button
                    className={`filter-btn ${selectedRisk === 'ALL' ? 'active' : ''}`}
                    onClick={() => setSelectedRisk('ALL')}
                >
                    Tất cả ({stations.length})
                </button>
                <button
                    className={`filter-btn filter-high ${selectedRisk === 'HIGH' ? 'active' : ''}`}
                    onClick={() => setSelectedRisk('HIGH')}
                >
                    Cao
                </button>
                <button
                    className={`filter-btn filter-medium ${selectedRisk === 'MEDIUM' ? 'active' : ''}`}
                    onClick={() => setSelectedRisk('MEDIUM')}
                >
                    Cảnh báo
                </button>
                <button
                    className={`filter-btn filter-low ${selectedRisk === 'LOW' ? 'active' : ''}`}
                    onClick={() => setSelectedRisk('LOW')}
                >
                    An toàn
                </button>
            </div>

            {/* 3. Danh sách các thẻ trạm phát sóng (Station Cards) */}
            <div className="station-list">
                {loading && <p className="sidebar-status">⏳ Đang tải danh sách trạm...</p>}
                {error && <p className="sidebar-status error">⚠️ {error}</p>}

                {!loading && !error && filteredStations.map((station) => (
                    <div
                        key={station.id}
                        className={`station-card ${activeStationId === station.id ? 'selected' : ''}`}
                        onClick={() => handleStationClick(station)}
                    >
                        {/* Dòng trên: Mã trạm + Badge màu theo mức độ rủi ro */}
                        <div className="station-card-top">
                            <span className="station-code">{station.station_code}</span>
                            <span className={`risk-badge risk-${station.risk_level.toLowerCase()}`}>
                                {getRiskLabel(station.risk_level)}
                            </span>
                        </div>

                        {/* Tên vị trí đặt trạm */}
                        <h3 className="station-name">{station.station_name}</h3>

                        {/* Dòng dưới: Hiển thị 3 chỉ số KPI mạng quan trọng */}
                        <div className="station-metrics">
                            <div className="metric-item">
                                <span className="metric-label">Độ trễ</span>
                                <span className="metric-value">{station.latency_ms} ms</span>
                            </div>
                            <div className="metric-item">
                                <span className="metric-label">Mất gói</span>
                                <span className="metric-value">{station.packet_loss_rate}%</span>
                            </div>
                            <div className="metric-item">
                                <span className="metric-label">Băng thông</span>
                                <span className="metric-value">{station.throughput_mbps} Mbps</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
};

export default Sidebar;