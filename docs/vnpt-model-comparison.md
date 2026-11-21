# VNPT A1/A4: Đối sánh XGBoost và LSTM — Tuần 4

**Đề tài:** N3.2 – Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
**Phụ trách phát triển:** Lương Tâm Như (AI / ML Engineer)
**Phạm vi:** Huấn luyện và đối sánh XGBoost (Baseline) với LSTM (Deep Learning) theo bộ quy tắc VNPT A1/A4.
**Mốc thực hiện:** Tuần 4

> Báo cáo được sinh tự động bởi `train_vnpt_models.py`.
> Dữ liệu sử dụng là dữ liệu counter Ericsson mô phỏng, không phải dữ liệu production VNPT.

## 1. Nguồn dữ liệu và phương pháp tạo nhãn

- Dữ liệu đầu vào: `D:\HKDN\vnpt-netguard-aiops\ai-service\data\vnpt_cell_simulated.csv`.
- Bộ quy tắc: `vnpt_kpi_rules.py`, sử dụng trực tiếp `evaluate()`.
- A1: nhãn `is_anomaly` từ bộ quy tắc A1.
- A4: nhãn dương nếu có ít nhất một cờ trong `A4_FLAGS`.
- Hai bài toán A1 và A4 được huấn luyện, đánh giá độc lập.
- Không sử dụng nhãn NIST RAN cũ.
- Không đưa cờ cảnh báo A1/A4 hoặc trọng số xếp hạng A4 vào feature.
- Feature gồm KPI suy ra và counter gốc liên quan.

## 2. Chia dữ liệu

Dữ liệu được chia theo thời gian, không shuffle:
- Train: 31/03/2025 – 06/04/2025.
- Validation: 07/04/2025 – 13/04/2025.
- Test: 14/04/2025 – 20/04/2025.
- A1 chỉ sử dụng các mẫu đã đủ điều kiện `a1_ready`.
- A4 sử dụng toàn bộ mẫu trong khoảng thời gian, không phụ thuộc `a1_ready`.
- Chuỗi LSTM sử dụng 12 giờ lịch sử liên tục tại mỗi thời điểm dự đoán.
- Các thời điểm lịch sử trước ranh giới tập được phép dùng làm đầu vào, không dùng nhãn tương lai.

### 2.1. Phân bố dữ liệu

| Bài toán | Tập | Dòng gốc | Chuỗi sử dụng | Bình thường | Bất thường |
|---|---|---:|---:|---:|---:|
| A1 | train | 2016 | 2016 | 1976 | 40 |
| A1 | validation | 2016 | 2016 | 1976 | 40 |
| A1 | test | 2004 | 2004 | 1964 | 40 |
| A4 | train | 2016 | 2016 | 2010 | 6 |
| A4 | validation | 2016 | 2016 | 2010 | 6 |
| A4 | test | 2004 | 2004 | 1998 | 6 |

## 3. Kết quả đối sánh trên Test

Threshold được lựa chọn trên Validation bằng F1-score. Tập Test chỉ được sử dụng để đánh giá cuối cùng.

### 3.1. Kết quả A1

| Mô hình | Threshold | Precision | Recall | F1-Score | Accuracy |
|---|---:|---:|---:|---:|---:|
| XGBoost (Baseline) | 0.9969 | 1.0000 | 0.9500 | 0.9744 | 0.9990 |
| LSTM (Deep Learning) | 0.9653 | 1.0000 | 0.8000 | 0.8889 | 0.9960 |

#### Confusion Matrix – A1

| Mô hình | TN | FP | FN | TP | Support lớp 0 | Support lớp 1 |
|---|---:|---:|---:|---:|---:|---:|
| XGBoost (Baseline) | 1964 | 0 | 2 | 38 | 1964 | 40 |
| LSTM (Deep Learning) | 1964 | 0 | 8 | 32 | 1964 | 40 |

### 3.2. Kết quả A4

| Mô hình | Threshold | Precision | Recall | F1-Score | Accuracy |
|---|---:|---:|---:|---:|---:|
| XGBoost (Baseline) | 0.1729 | 0.3750 | 1.0000 | 0.5455 | 0.9950 |
| LSTM (Deep Learning) | 0.9960 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

#### Confusion Matrix – A4

| Mô hình | TN | FP | FN | TP | Support lớp 0 | Support lớp 1 |
|---|---:|---:|---:|---:|---:|---:|
| XGBoost (Baseline) | 1988 | 10 | 0 | 6 | 1998 | 6 |
| LSTM (Deep Learning) | 1998 | 0 | 0 | 6 | 1998 | 6 |

## 4. Cấu hình mô hình

- XGBoost: binary logistic, 350 estimators, max depth 4.
- LSTM: cửa sổ 12 giờ, 1 tầng, hidden size 48, dropout 0.25.
- LSTM: tối đa 40 epoch, early stopping theo validation loss.
- XGBoost và LSTM sử dụng cùng feature và cùng các mốc đánh giá.
- Imputer và scaler chỉ được fit trên Train.
- Thiết bị: `cpu`; random seed: `42`.

### 4.1. Số epoch thực tế

| Bài toán | Số epoch |
|---|---:|
| A1 | 40 |
| A4 | 40 |

## 5. Nhận xét kết quả

- **A1:** XGBoost có F1-score cao hơn trên tập Test trong lần thử nghiệm này.
- **A4:** LSTM có F1-score cao hơn trên tập Test trong lần thử nghiệm này.

Lưu ý: Kết quả A4 cần được diễn giải thận trọng do tập Test chỉ có 6 mẫu bất thường. Một vài dự đoán sai có thể làm thay đổi đáng kể Precision, Recall và F1-score.

## 6. Hạn chế và lưu ý

1. Dữ liệu đầu vào là dữ liệu mô phỏng, không đại diện cho mạng VNPT production.
2. Nhãn được tạo từ rule engine, chưa phải nhãn sự cố độc lập được chuyên gia xác nhận.
3. Dữ liệu mất cân bằng lớp, đặc biệt A4 có rất ít mẫu bất thường.
4. Kết quả cần được kiểm chứng thêm trên dữ liệu mạng thực tế.
5. Không sử dụng Test để lựa chọn threshold hoặc điều chỉnh mô hình.
