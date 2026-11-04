// ==============================================================================
// ENTRY POINT: MAIN (ĐIỂM KHỞI CHẠY CỦA ỨNG DỤNG REACT VITE)
// Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
// Phụ trách: Võ Ngọc Quý (Web GIS Engineer)
// ==============================================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Nạp các thiết lập CSS toàn cục (reset margin, padding, cấu hình font chữ hệ thống)
import './index.css'

// Nạp component giao diện gốc App
import App from './App.jsx'

// Tìm phần tử HTML có id="root" trong index.html và kết xuất ứng dụng React vào đó
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
