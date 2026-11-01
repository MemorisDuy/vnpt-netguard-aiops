HỆ THỐNG WEB GIS DỰ BÁO SỚM RỦI RO SUY GIẢM CHẤT LƯỢNG MẠNG VIỄN THÔNG
Ứng dụng Machine Learning (XGBoost) kết hợp kiến trúc Microservices và phân tích dữ liệu không gian PostGIS.
1. Cấu trúc thư mục
Thư mục	Công nghệ	Mô tả
ai-service/	Python / FastAPI	Tiền xử lý dữ liệu viễn thông, huấn luyện mô hình XGBoost và cung cấp API dự báo thời gian thực
backend-service/	Node.js / Express	Điều phối API nội bộ, nghiệp vụ phân tích chỉ số mạng và xử lý dữ liệu không gian địa lý
frontend-webgis/	React / Vite, Leaflet	Dashboard điều hành mạng NOC, hiển thị bản đồ số và lớp nhiệt Heatmap cảnh báo rủi ro
database/	PostgreSQL 15 + PostGIS 3.3	Cấu hình Docker Compose và dữ liệu trạm phát sóng khởi tạo (init.sql)
docs/	Markdown	Tài liệu kiến trúc hệ thống, đặc tả API, mô tả cơ sở dữ liệu và báo cáo định kỳ
2. Quy tắc sống còn
Tuyệt đối KHÔNG code và push thẳng lên nhánh main. Toàn bộ thành viên tuân thủ nghiêm ngặt 4 bước sau:
Bước 1: Đồng bộ code mới nhất mỗi ngày
git checkout main
git pull origin main
Bước 2: Tạo nhánh làm việc riêng của mình
git checkout -b feature/[tên-bạn]-[tên-chức-năng]
Ví dụ:
git checkout -b feature/thuy-data-pipeline
git checkout -b feature/nhu-ai-fastapi
Bước 3: Lưu và đẩy code lên nhánh cá nhân
git add .
git commit -m "feat: Mô tả chi tiết chức năng vừa hoàn thành"
git push origin feature/[tên-bạn]-[tên-chức-năng]
Bước 4: Tạo Pull Request (PR)
Lên GitHub của dự án, bấm Compare & pull request → bấm Create pull request để Tech Lead (@MemorisDuy) kiểm tra và merge vào nhánh main.
3. Phân công nhiệm vụ
1. Nguyễn Ngọc Duy (@MemorisDuy) — Tech Lead & Core Developer
•	Thiết lập hạ tầng Docker PostGIS, cấu hình Base Backend Express (Port 5000) và kết nối CSDL Pool.
•	Trực tiếp phát triển API Lõi phân tích sức khỏe mạng (/api/analytics/network-health) và API truy vấn bán kính trạm PostGIS (/api/spatial/nearby).
•	Quản trị kho mã nguồn, review code và duyệt Pull Request của cả nhóm.
2. Nguyễn Thị Thanh Thúy (@thanhthuy15-git) — Data Engineer & Data QA
•	Thư mục ai-service/: Khai thác tập dữ liệu viễn thông mở NIST RAN, viết kịch bản clean_data.py làm sạch dữ liệu, xử lý nhiễu/null và chuẩn hóa các trường KPI mạng.
•	Trích xuất đặc trưng ra file dữ liệu sạch data/clean_data.csv bàn giao cho Tâm Như.
•	Viết kịch bản kiểm thử chất lượng dữ liệu bằng Pytest (vai trò QA).
3. Lương Tâm Như (@ltnhu25) — Machine Learning & MLOps Engineer
•	Thư mục ai-service/: Tiếp nhận dữ liệu sạch từ Thanh Thúy, viết file train_model.py huấn luyện thuật toán XGBoost phân loại nhị phân cảnh báo suy giảm mạng, tối ưu chỉ số Recall và xuất file model.pkl.
•	Viết file app.py dùng FastAPI đóng gói endpoint POST /predict (Port 8000) phục vụ dự báo thời gian thực và viết test case kiểm thử tự động API (vai trò QA).
4. Võ Ngọc Quý (@iamvngocquy) — Web GIS Engineer & QA Map
•	Thư mục frontend-webgis/: Khởi tạo dự án React bằng Vite, cài đặt cấu hình Leaflet (react-leaflet).
•	Xây dựng component MapContainer.jsx hiển thị khung bản đồ số Việt Nam và HeatmapLayer.jsx vẽ lớp nhiệt trực quan theo dải màu rủi ro (Xanh - Vàng - Đỏ).
•	Kiểm thử trải nghiệm tương tác bản đồ, đảm bảo tốc độ render mượt mà (vai trò QA).
5. Võ Anh Thạo (@Thaova1770) — BA & Backend (API Nội bộ)
•	Thư mục backend-service/: Xây dựng statsController.js và statsRoutes.js viết API GET /api/stats/high-risk thống kê, lọc các trạm có nguy cơ suy giảm cao từ Database.
•	Hỗ trợ Tech Lead rà soát logic nghiệp vụ viễn thông, tối ưu câu lệnh SQL và kiểm thử kết nối CSDL.
6. Minh Trường (@minhtruong15) — Full-stack & UI Dashboard
•	Backend (backend-service/): Xây dựng stationController.js và stationRoutes.js viết API GET /api/stations lấy danh sách toàn bộ trạm phát sóng.
•	Frontend (frontend-webgis/): Xây dựng component Sidebar.jsx và Sidebar.css thiết kế thanh bảng điều khiển bên trái hiển thị danh sách trạm và bộ lọc rủi ro.
7. Ngọc Lân (@laanz2) — Full-stack API Không gian (PostGIS)
•	Backend (backend-service/): Xây dựng spatialController.js viết câu truy vấn đặc thù PostGIS (ST_AsGeoJSON) convert tọa độ trạm thành định dạng chuẩn GeoJSON.
•	Frontend (frontend-webgis/): Xây dựng tầng dịch vụ src/services/api.js dùng Axios fetch API không gian từ Backend và truyền dữ liệu tọa độ cho Quý hiển thị lên bản đồ.
