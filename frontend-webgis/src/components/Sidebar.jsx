// ==============================================================================
// COMPONENT: THANH ĐIỀU KHIỂN BÊN TRÁI (SIDEBAR DANH SÁCH TRẠM & BỘ LỌC RỦI RO)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Minh Trường (Full-stack & UI Dashboard)
// ==============================================================================

import { useState, useEffect } from 'react';
import './Sidebar.css';

// Component Sidebar nhận prop onSelectStation từ App.jsx để truyền trạm được chọn sang bản đồ
const Sidebar = ({ onSelectStation }) => {
    // 1. Khai báo các State lưu trữ dữ liệu và bộ lọc trên giao diện
    const [stations, setStations] = useState([]);                 // Danh sách trạm lấy từ API
    const [selectedRisk, setSelectedRisk] = useState('ALL');      // Bộ lọc: 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
    const [searchTerm, setSearchTerm] = useState('');             // Từ khóa tìm kiếm tên hoặc mã trạm
    const [activeStationId, setActiveStationId] = useState(null); // ID trạm đang được người dùng click chọn
    const [loading, setLoading] = useState(true);                 // Trạng thái chờ tải dữ liệu API
    const [error, setError] = useState(null);                     // Thông báo lỗi nếu mất kết nối Backend

    // 2. Gọi API GET /api/stations mỗi khi đổi nút lọc (selectedRisk) hoặc gõ tìm kiếm (searchTerm)
    useEffect(() => {
        const fetchStations = async () => {
            try {
                setLoading(true);

                // Tạo bộ tham số truy vấn (Query Parameters) gửi lên Backend
                const params = new URLSearchParams();
                if (selectedRisk !== 'ALL') {
                    params.append('risk_level', selectedRisk);
                }
                if (searchTerm.trim() !== '') {
                    params.append('search', searchTerm.trim());
                }

                // Gọi API lấy danh sách trạm theo điều kiện lọc
                const response = await fetch(`http://localhost:5000/api/stations?${params.toString()}`);
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
    }, [selectedRisk, searchTerm]);

    // 3. Hàm đổi nhãn mức độ rủi ro tiếng Anh sang tiếng Việt hiển thị trên Badge
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

    // 4. Xử lý khi người dùng click vào 1 thẻ trạm trong danh sách
    const handleStationClick = (station) => {
        // Đánh dấu trạm đang được chọn để tô sáng viền thẻ
        setActiveStationId(station.id);

        // Truyền dữ liệu trạm (kèm tọa độ latitude, longitude) sang App.jsx để bản đồ flyTo tới
        if (onSelectStation) {
            onSelectStation(station);
        }
    };

    return (
        <aside className="sidebar-container">
            {/* 1. Phần tiêu đề của Sidebar */}
            <div className="sidebar-header">
                <h2 className="sidebar-title">VNPT NetGuard</h2>
                <p className="sidebar-subtitle">Giám sát trạm phát sóng BTS</p>
            </div>

            {/* 2. Ô nhập từ khóa tìm kiếm theo tên trạm hoặc mã trạm */}
            <div style={{ padding: '12px 16px 0 16px' }}>
                <input
                    type="text"
                    placeholder="Tìm tên hoặc mã trạm (VD: BTS_003)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        backgroundColor: '#1e293b',
                        color: '#f8fafc',
                        fontSize: '0.85rem',
                        outline: 'none'
                    }}
                />
            </div>

            {/* 3. Thanh nút bấm lọc theo mức độ rủi ro */}
            <div className="sidebar-filter">
                <button
                    className={`filter-btn ${selectedRisk === 'ALL' ? 'active' : ''}`}
                    onClick={() => setSelectedRisk('ALL')}
                >
                    Tất cả
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

            {/* 4. Danh sách các thẻ trạm phát sóng (Station Cards) */}
            <div className="station-list">
                {loading && <p className="sidebar-status">Đang tải danh sách trạm...</p>}
                {error && <p className="sidebar-status error">{error}</p>}

                {!loading && !error && stations.length === 0 && (
                    <p className="sidebar-status">Không tìm thấy trạm phát sóng phù hợp.</p>
                )}

                {!loading && !error && stations.map((station) => (
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