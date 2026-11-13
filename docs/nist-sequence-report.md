# Khảo sát và bàn giao chuỗi NIST RAN

Nguồn là 54.488 dòng trong ai-service/data/clean_data.csv, thuộc 2.033 lượt đo
và 28 phiên của ba gói A/B/C. Sau khi sắp xếp trong từng lượt, không có khoảng
lệch khỏi nhịp 10 giây giữa hai dòng liền kề. Script vẫn cắt chuỗi nếu gặp khoảng
khuyết. Mỗi mẫu gồm 12 bước liên tiếp (12 cửa sổ tổng hợp 10 giây), trượt một bước.

| Tập | Phiên | Dạng tensor (mẫu, bước, đặc trưng) | Bật mã hóa | Tắt mã hóa |
|---|---:|---|---:|---:|
| Train | 20 | 24147 × 12 × 3 | 12087 | 12060 |
| Validation | 4 | 4465 × 12 × 3 | 2225 | 2240 |
| Test | 4 | 3513 × 12 × 3 | 1749 | 1764 |

Thứ tự cột là latency (ms), throughput (Mbps), latency_change_ms (ms).
Cột cuối đo biến động của latency RLC. Packet loss và jitter đầu cuối còn thiếu
phép đo trong CSV này. Nhãn 0 là bật mã hóa, nhãn 1 là tắt mã hóa. Dữ liệu phù hợp
cho thử nghiệm nhận diện trạng thái mã hóa. Dự báo suy giảm cần nhãn sự cố riêng.

Chia ngẫu nhiên theo khóa tranche và phiên với seed 42 để các chuỗi chồng lấn
không nằm ở hai tập khác nhau. Mean và độ lệch chuẩn được tính trên các dòng
gốc của tập train trước khi tạo cửa sổ. Dùng cùng tham số cho validation và test.
Mean theo thứ tự cột là 0,875188 / 0,653959 / 1,040293. Scale là
0,734942 / 0,046071 / 0,729514. Metadata lưu giá trị đầy đủ và danh sách phiên.
Đây là đánh giá theo phiên giữ lại, chưa đánh giá khả năng dự báo theo thời gian.

## Chạy lại và nạp tensor

Từ thư mục gốc, cài ai-service/requirements.txt và chuẩn bị CSV NIST đã làm sạch.

```bash
python ai-service/prepare_sequence.py
python -m pytest ai-service/tests/test_sequence_data.py -q
```

```python
import numpy as np

with np.load("ai-service/data/sequences/nist_sequences.npz", allow_pickle=False) as data:
    X_train, y_train = data["X_train"], data["y_train"]
    X_val, y_val = data["X_val"], data["y_val"]
    X_test, y_test = data["X_test"], data["y_test"]
```

X là float32, y là int64. Các khóa keys_* chứa tranche, session_id, run_id.
Các mảng time_ns_* lưu thời điểm từng bước dưới dạng nanosecond. Timestamp
nguồn được quy ước UTC khi xuất số nguyên để giữ khoảng cách giữa các bước.
Dùng validation để chọn mô hình và test để đánh giá cuối. Các mảng khóa và
timestamp phục vụ truy vết. Chạy pytest trên dữ liệu nhỏ tự tạo không cần ZIP.

Kết quả xác minh trên dữ liệu thật ngày 13/11/2026 là 32.125 chuỗi.
Bộ kiểm thử chuỗi đạt 8/8.
