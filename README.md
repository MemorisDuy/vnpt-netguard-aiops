# VNPT NetGuard AIOps (Dự án N3.2)

Hệ thống Web GIS dự báo sớm rủi ro suy giảm chất lượng mạng viễn thông. Ứng dụng Machine Learning (XGBoost) kết hợp kiến trúc Microservices và phân tích dữ liệu không gian PostGIS.

## 🏗 Kiến trúc thư mục (Microservices)
* `ai-service/`: Xử lý dữ liệu, train mô hình XGBoost và API dự báo (Python/FastAPI).
* `backend-service/`: API nội bộ, logic nghiệp vụ và xử lý tọa độ không gian (Node.js/Express).
* `frontend-webgis/`: Giao diện người dùng và bản đồ nhiệt Heatmap (React, Mapbox/Leaflet).
* `database/`: Cấu hình Docker cho PostgreSQL & PostGIS.
* `docs/`: Tài liệu kiến trúc, API và database.

## ⚙️ Quy trình làm việc Git (Dành cho thành viên)
Tuyệt đối **KHÔNG** code và push thẳng lên nhánh `main`. Toàn bộ thành viên tuân thủ luồng làm việc sau:

1. **Đồng bộ code mới nhất:** 
   `git checkout main`
   `git pull origin main`
2. **Tạo nhánh làm việc riêng:** 
   `git checkout -b feature/ten-tinh-nang` (Ví dụ: `feature/heatmap-react`)
3. **Lưu và đẩy code lên nhánh cá nhân:**
   `git add .`
   `git commit -m "Mô tả chi tiết công việc vừa làm"`
   `git push origin feature/ten-tinh-nang`
4. **Tạo Pull Request (PR):** Lên GitHub tạo PR để Tech Lead (Duy) review code và gộp vào `main`.

## 👥 Phân công nhiệm vụ
* **Nguyễn Ngọc Duy (Tech Lead):** Setup DB (PostGIS), setup Docker, code core API Không gian và Review Code.
* **Lương Tâm Như (AI & Data Engineer):** Thư mục `ai-service`. Viết script Pandas làm sạch data NIST RAN, train XGBoost, bọc API FastAPI/Flask.
* **Minh Trường (Full-stack):** Thư mục `backend-service`. Viết API trích xuất số liệu nội bộ. Hỗ trợ team cắt HTML/CSS các form/bảng biểu.
* **Ngọc Lân (Full-stack):** Code API xử lý dữ liệu Không gian (tọa độ PostGIS) bên `backend-service` và hỗ trợ fetch API đó đẩy lên bản đồ bên `frontend-webgis`.
* **Anh Thạo (BA & Backend):** Thư mục `backend-service`. Code API thống kê, lọc khu vực rủi ro cao. Hỗ trợ DevOps và cắt HTML/CSS.
* **Ngọc Quý (Web GIS Engineer):** Thư mục `frontend-webgis`. Khởi tạo project React, cài Leaflet/Mapbox, vẽ Heatmap bản đồ nhiệt cảnh báo rủi ro.
