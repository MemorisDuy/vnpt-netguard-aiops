
# PHÂN TÍCH YÊU CẦU HỆ THỐNG VNPT NETGUARD AIOPS

**Đề tài N3.2:** Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng  
**Phụ trách:** Võ Anh Thao – Backend Developer  
**Mốc thực hiện:** Tuần 4

## 1. Mục tiêu hệ thống

VNPT NetGuard AIOps hỗ trợ giám sát chất lượng mạng 4G LTE, phát hiện Cell bất thường qua các KPI Ericsson và xác định khu vực có nguy cơ suy giảm chất lượng mạng trên bản đồ WebGIS.

Hệ thống gồm ba tầng xử lý:
- **Tầng 1 (A1):** Phát hiện bất thường dựa trên 5 KPI, phân loại nhóm Vận hành và Kỹ thuật.
- **Tầng 2 (A4):** Phân tích 7 cờ bất thường từ các Counter Ericsson.
- **Tầng 3 (GIS):** Gom các Cell suy giảm gần nhau thành khu vực cảnh báo bằng PostGIS.

## 2. Mô hình dữ liệu 1 Trạm – 3 Cell

Trong dữ liệu mẫu, mỗi trạm eNodeB quản lý 3 Cell tương ứng các hướng phát sóng.

Ví dụ:

```text
Trạm: 4G-CRA032M-CTO (ENODEB_ID: 620251)
   |
   |-- 4G-CRA032M11-CTO (CELL_ID: 11)
   |-- 4G-CRA032M12-CTO (CELL_ID: 12)
   |-- 4G-CRA032M13-CTO (CELL_ID: 13)
```

Bảng `network_cells` trong `database/init.sql` lưu:
- `node_name`, `cell_name`, `enodeb_id`, `cell_id`: Định danh trạm và Cell.
- `province`, `province_code`: Khu vực quản lý.
- `latitude`, `longitude`, `geom`: Tọa độ phục vụ WebGIS.
- Các KPI: `cssr`, `service_drop_all`, `traffic_gb`, `traffic_percent_hour`, `user_dl_avg_thput`, `user_dl_avg_thput_percent_hour`.
- `a1_rule_group`: Nhóm lỗi Tầng 1.
- `a4_flags`: Các cờ bất thường Tầng 2.
- `is_anomaly`: Trạng thái bất thường.

Dữ liệu khởi tạo gồm 9 Cell thuộc 3 trạm mẫu tại Cần Thơ, Bến Tre và An Giang.

## 3. Tầng 1 – Phát hiện bất thường A1

Hệ thống sử dụng 5 điều kiện KPI theo hàm `a1_flags()` trong `ai-service/vnpt_kpi_rules.py`.

### 3.1. Bảng ngưỡng 5 KPI

| KPI | Điều kiện theo Traffic (GB) | Ngưỡng bất thường |
|---|---|---|
| CSSR | >5 / 1–5 / 0.1–<1 / <0.1 | <95% / 90–95% / 75–90% / <75% |
| Service Drop All | >5 / 1–5 / 0.1–<1 / <0.1 | >5% / 5–10% / 10–20% / >20% |
| Traffic Down | >7 / 3–7 / 1–<3 | <10% / 5–10% / 2–5% lịch sử |
| Traffic Up | >3 / 0.5–3 / <0.5 | >450% / 450–1000% / >1000% lịch sử |
| User DL Avg Throughput | >10 / >5–10 / >2–5 / 1–2 / <1 | <30% / 20–30% / 10–20% / 5–10% / <5% lịch sử |

Các khoảng từ–đến sử dụng điều kiện bao gồm hai đầu mút theo Pandas `between()` trong mã nguồn. Giá trị so sánh lịch sử của Traffic và Throughput được tính theo trung bình 12 tuần trước, cùng thứ và giờ.

### 3.2. Phân loại nhóm A1

**Nhóm Vận hành (`A1_rule_vh`):**
- `anomaly_cssr`
- `anomaly_service_drop_all`
- `anomaly_traffic_down`

**Nhóm Kỹ thuật (`A1_rule_kt`):**
- `anomaly_traffic_up`
- `anomaly_user_dl_avg_thput`

Quy tắc tổng hợp:

```text
A1_rule_vh = CSSR OR Service Drop OR Traffic Down
A1_rule_kt = Traffic Up OR Throughput Down
is_anomaly = A1_rule_vh OR A1_rule_kt
```

Một Cell có thể thỏa cả hai nhóm trong dữ liệu lịch sử. Riêng trường `a1_rule_group` của bảng snapshot chỉ lưu một nhãn, ưu tiên `A1_rule_vh` trước `A1_rule_kt`.

## 4. Tầng 2 – Phân tích 7 Counter/cờ A4

Các cờ A4 hỗ trợ nhận diện nguyên nhân bất thường từ Counter Ericsson.

| STT | Cờ A4 | Nội dung kiểm tra |
|---|---|---|
| 1 | `A4_rrcincrease` | Lượt yêu cầu thiết lập RRC tăng bất thường |
| 2 | `A4_rrcfailure` | Thiết lập RRC thất bại |
| 3 | `A4_s1signallingfailure` | Thiết lập báo hiệu S1 thất bại |
| 4 | `A4_erabfailure` | Thiết lập E-RAB thất bại |
| 5 | `A4_hoprepfailure` | Chuẩn bị Handover thất bại |
| 6 | `A4_hoexefailure` | Thực hiện Handover thất bại |
| 7 | `A4_erabrelabnormal` | Giải phóng E-RAB bất thường |

**Nguyên tắc xử lý:**

- `A4_rrcincrease`: So sánh RRC Attempts với trung bình 8 tuần trước, cùng thứ và giờ. Hệ số ngưỡng tương ứng số Attempts >50.000, >25.000, >10.000, >5.000, >1.000, >=500 là 1.5, 2, 2.5, 4, 8, 15. Điều kiện kéo dài 8 giờ liên tục.
- 6 cờ còn lại: Tính trọng số `100 × failures × (failures / attempts)`, lựa chọn Top 10% trong nhóm tỉnh–giờ và yêu cầu 6 giờ liên tục.
- Phạm vi giờ kiểm tra: 06:00–22:00.
- Một Cell có thể chứa nhiều cờ trong mảng `a4_flags`.

Các cờ A4 phục vụ phân tích nguyên nhân, không thay thế việc xác minh sự cố thực tế.

## 5. Tầng 3 – Gom cụm Cell thành khu vực suy giảm

### 5.1. Mục đích

Xác định các Cell bất thường có vị trí gần nhau và gom thành khu vực cảnh báo trên WebGIS.

Dữ liệu tọa độ được lưu tại `network_cells.geom`, kiểu `GEOMETRY(Point, 4326)`.

### 5.2. Quy trình

```text
network_cells
      |
Lọc Cell bất thường
      |
Lấy tọa độ PostGIS
      |
ST_ClusterDBSCAN
      |
Gom Cell theo cluster_id
      |
Thống kê A1, A4 và KPI
      |
GeoJSON
      |
Frontend WebGIS
```

Backend sử dụng:
- `ST_ClusterDBSCAN`: Gom nhóm Cell theo khoảng cách.
- `ST_DWithin`: Kiểm tra Cell lân cận.
- `ST_AsGeoJSON`: Trả dữ liệu không gian cho bản đồ.

API đã triển khai:

```http
GET /api/spatial/clusters-geojson
```

Tham số chính:
- `radius`: Bán kính gom cụm, mặc định 3000 m.
- `min_cells`: Số Cell tối thiểu, mặc định 1.
- `province_code`: Lọc theo tỉnh.
- `a1_rule_group`: Lọc theo nhóm A1.
- `a4_flag`: Lọc theo cờ A4.

Code hiện tại quy đổi bán kính mét sang độ trong `ST_ClusterDBSCAN` bằng phép xấp xỉ `radius / 111320.0`; `ST_DWithin` sử dụng kiểu `geography` để đo khoảng cách theo mét.

## 6. Yêu cầu thống kê Backend

Bổ sung chức năng đếm Cell theo nhóm lỗi A1 từ bảng `network_cells`.

**API mới:**

```http
GET /api/stats/cell-errors
```

Hỗ trợ lọc theo `province_code` và `node_name`.

Kết quả gồm:
- `total_cells`: Tổng Cell.
- `a1_rule_vh_count`: Cell lỗi Vận hành.
- `a1_rule_kt_count`: Cell lỗi Kỹ thuật.
- `error_cells`: Tổng Cell thuộc hai nhóm lỗi.
- `normal_cells`: Cell bình thường.
- `insufficient_data_cells`: Cell chưa đủ dữ liệu.

Theo dữ liệu mẫu trong `init.sql`:

| Trạng thái | Số Cell |
|---|---:|
| A1_rule_vh | 3 |
| A1_rule_kt | 2 |
| NORMAL | 4 |
| Tổng | 9 |

Hai API cũ `/api/stats/high-risk` và `/api/stats/summary` được giữ nguyên.

## 7. Liên kết với công việc của nhóm

| Thành phần | Tệp liên quan | Vai trò |
|---|---|---|
| Database | `database/init.sql` | Lưu trạm, Cell, KPI và tọa độ |
| KPI ETL | `ai-service/vnpt_kpi_rules.py` | Tính các điều kiện A1 và A4 |
| Spatial GIS | `backend-service/controllers/spatialController.js` | Gom cụm Cell và xuất GeoJSON |
| Backend Stats | `backend-service/controllers/statsController.js` | Thống kê trạm và Cell lỗi |
| Frontend | `frontend-webgis/src/App.jsx` | Hiển thị Dashboard và bản đồ |

## 8. Kết luận

Phân tích yêu cầu xác định mô hình dữ liệu 1 Trạm – 3 Cell, bộ quy tắc 5 KPI A1, 7 cờ A4 và phương pháp gom cụm Cell bằng PostGIS.

Phần Backend của Thao bổ sung API thống kê Cell lỗi theo nhóm Vận hành/Kỹ thuật, sử dụng dữ liệu do nhóm xây dựng và giữ nguyên chức năng thống kê trạm hiện có.

**Tài liệu tham chiếu:** `database/init.sql`, `ai-service/vnpt_kpi_rules.py`, `backend-service/controllers/spatialController.js`, `backend-service/controllers/statsController.js`.
