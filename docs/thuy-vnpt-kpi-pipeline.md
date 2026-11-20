# Bàn giao ETL KPI Ericsson

- **Phụ trách** Thanh Thúy
- **Nhánh** `feature/thuy-vnpt-kpi-pipeline`
- **Hạn bàn giao** 20h00 ngày 22/11

ETL đọc sheet `PMS_4G_MN_Raw_Counter_ERICSSON` hoặc CSV cùng schema 62 cột. Đầu ra cho Tâm Như giữ từng cell–giờ, các giá trị KPI, hai cờ nhóm A1, năm cờ chi tiết và bảy cờ A4. Đầu ra cho Anh Thao và Ngọc Lân giữ bản ghi mới nhất của mỗi cell và ghép tọa độ từ danh mục riêng để kiểm thử API và truy vấn không gian.

## Cách chạy từ thư mục gốc checkout

```powershell
python -m pip install -r ai-service/requirements.txt
python ai-service/generate_vnpt_simulated.py ai-service/data/vnpt_cell_simulated.csv --coordinates vnpt_coordinates_simulated.csv
python ai-service/vnpt_kpi_etl.py ai-service/data/vnpt_cell_simulated.csv --history vnpt_cell_history.csv --coordinates vnpt_coordinates_simulated.csv --snapshot vnpt_network_cells.csv
python -m pytest ai-service/tests/test_vnpt_kpi.py -q
```

Để chạy với Excel gốc, truyền đường dẫn tới file `.xlsx` thay cho đường dẫn CSV raw. Nếu chỉ cần chuỗi thời gian, bỏ `--coordinates` và `--snapshot`. File danh mục tọa độ cần các cột `cell_name`, `latitude`, `longitude`. Giữ Excel gốc và các đầu ra trích từ nó ngoài Git.

Để nạp dữ liệu giả lập vào DB thử nghiệm, áp dụng `database/init.sql` lên PostgreSQL có PostGIS, cấu hình kết nối `psql` bằng `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` và nguồn xác thực của môi trường, rồi chạy lại lệnh ETL với `--load`. Loader ghi trong một transaction, cập nhật theo khóa `cell_name` và bỏ qua bản ghi cũ hơn bản ghi đã có. Sau khi chạy hai lần, truy vấn dưới đây cần trả về 12 cell giả lập, 5 cell có cờ A1 và 2 cell có cờ A4, nếu DB chưa chứa dữ liệu khác với cùng mã cell.

```sql
SELECT count(*) AS cells,
       count(*) FILTER (WHERE is_anomaly) AS a1_cells,
       count(*) FILTER (WHERE cardinality(a4_flags) > 0) AS a4_cells
FROM network_cells
WHERE cell_name LIKE 'SIM-%';
```

## Kết quả kiểm chứng

- CSV raw giả lập có **30.228 dòng, 62 cột, 12 cell, 4 trạm và 2 tỉnh giả lập**.
- ETL đọc được Excel nguồn và xuất **16 dòng**. Cả 16 dòng thiếu lịch sử để đánh giá đầy đủ A1.
- Unit test KPI **16 passed**. Test kiểm tra công thức raw, ngưỡng A1, sáu trọng số, chuỗi A4 theo tỉnh, khung giờ, thiếu lịch sử, gián đoạn giờ và snapshot.
- Snapshot CSV có **12 cell** tại 22h00 ngày 20/04/2025, gồm 3 cell `A1_rule_vh`, 2 cell `A1_rule_kt`, 7 cell `NORMAL`. Hai cell có đủ bảy cờ A4.
- Máy chạy kiểm thử thiếu `psql` và Docker. Bước nạp PostgreSQL/PostGIS và gọi API còn chờ kiểm chứng. Bộ test AI hiện có bị dừng khi thu thập `test_predict.py` do thiếu `uvicorn`.

### Chia tập theo thời gian

Mốc bắt đầu tính theo giờ địa phương. 12 tuần đầu, từ 06/01 đến hết 30/03/2025, dùng để khởi tạo lịch sử. Mỗi tập có cả năm loại bất thường A1. Dòng bất thường được đếm một lần kể cả khi có nhiều cờ.

| Tập | Mốc bắt đầu (bao gồm) | Mốc kết thúc (loại trừ) | Dòng | Dòng có A1 | Tỷ lệ |
|---|---|---|---:|---:|---:|
| Train | 2025-03-31 | 2025-04-07 | 2.016 | 40 | 1,98% |
| Validation | 2025-04-07 | 2025-04-14 | 2.016 | 40 | 1,98% |
| Test | 2025-04-14 | 2025-04-21 | 2.004 | 40 | 2,00% |

Trong mỗi tập, số cờ theo thứ tự CSSR, drop, Traffic down, Traffic up, throughput là **16 / 16 / 8 / 8 / 8**. Các mẫu được tạo để kiểm chứng chức năng ETL và cờ lỗi. Tâm Như có thể dùng chúng để chạy thử quy trình train và chấm điểm, với `is_anomaly` làm nhãn A1 và các cờ được loại khỏi tập đặc trưng đầu vào nếu dùng nhãn đó.

## Quy ước triển khai cần xác nhận

- CSSR bằng tích ba tỷ lệ thành công RRC, S1 và ERAB, nhân 100. RRC loại số lượt thử lại khỏi mẫu số. `service_drop_all` lấy tổng release bất thường active của eNodeB và MME, chia tổng `pmErabRelNormalEnb + pmErabRelMme`, nhân 100. Giả định volume PDCP tính bằng kbit, traffic gồm UL và DL theo GB thập phân, và throughput DL lấy volume DL trừ Last TTI rồi chia thời gian tính bằng ms để ra Mbps.
- Rule A1 dùng các khoảng tỷ lệ ghi trong sheet và lưu lượng tại giờ đánh giá để chọn dải. Ô `B12` được đọc là khoảng 10–20%. Vị trí biên dùng phép so sánh trong `a1_flags`. Một số khoảng nguồn vì vậy có thể bỏ qua giá trị nghiêm trọng hơn khi tỷ lệ nằm ngoài khoảng.
- Đường cơ sở lấy đúng 12 tuần trước đó với Traffic/throughput, và 8 tuần với RRC increase. Thiếu một mốc hoặc mẫu số bằng 0 thì tỷ lệ để trống. Snapshot ghi `INSUFFICIENT_DATA` nếu chưa có cờ A1 và thiếu đầu vào đánh giá. Hai cờ nhóm đồng thời được giữ trong lịch sử. Snapshot ưu tiên nhóm vận hành.
- Top 10% làm tròn lên theo số trọng số hợp lệ ở mỗi tỉnh–giờ, dùng tên cell để phân định đồng hạng và chỉ phát cờ cho trọng số dương. Khung giờ gồm 06h đến 22h. Cờ A4 bắt đầu ở giờ thứ 6 hoặc 8 và tiếp tục trong thời gian điều kiện còn đúng.
- Tọa độ bàn giao là giả lập. Đánh giá khu vực cần thống nhất thêm bán kính, số cell/trạm tối thiểu và cửa sổ đồng thời.
