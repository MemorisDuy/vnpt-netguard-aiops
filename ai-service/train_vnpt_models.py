"""
HUẤN LUYỆN VÀ ĐỐI SÁNH XGBOOST VỚI LSTM
Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
Phụ trách phát triển: Lương Tâm Như (AI / ML Engineer)
Phạm vi: VNPT A1/A4 - XGBoost (Baseline) và LSTM (Deep Learning)
"""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.preprocessing import StandardScaler
from torch import nn
from torch.utils.data import DataLoader, TensorDataset
from xgboost import XGBClassifier

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from generate_vnpt_simulated import TRAIN_START, VALIDATION_START, TEST_START
from vnpt_kpi_rules import A4_FLAGS, evaluate

SEED = 42
WINDOW = 12
EPOCHS = 40
BATCH_SIZE = 128
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Chỉ dùng KPI và counter gốc làm đầu vào.
# Không đưa cờ A1/A4 hay trọng số xếp hạng A4 vào feature,
# vì như vậy mô hình có thể chỉ học cách chép lại quy tắc tạo nhãn.
KPI_FEATURES = [
    "cssr",
    "service_drop_all",
    "traffic_gb",
    "traffic_percent_hour",
    "user_dl_avg_thput",
    "user_dl_avg_thput_percent_hour",
]
COUNTER_FEATURES = [
    "pmRrcConnEstabSucc", "pmRrcConnEstabAttReatt", "pmRrcConnEstabAtt",
    "pmS1SigConnEstabSucc", "pmS1SigConnEstabAtt",
    "pmErabEstabSuccInit", "pmErabEstabAttInit",
    "pmErabRelAbnormalEnbAct", "pmErabRelAbnormalMmeAct",
    "pmErabRelNormalEnb", "pmErabRelMme",
    "pmHoPrepSuccLteIntraF", "pmHoPrepAttLteIntraF",
    "pmHoExeSuccLteIntraF", "pmHoExeAttLteIntraF",
    "pmPdcpVolDlDrb", "pmPdcpVolUlDrb", "pmPdcpVolDlDrbLastTTI",
    "pmUeThpTimeDl", "pmUeThpTimeUl",
]
FEATURES = KPI_FEATURES + COUNTER_FEATURES


class LSTMClassifier(nn.Module):
    def __init__(self, n_features: int, hidden_size: int = 48):
        super().__init__()
        self.lstm = nn.LSTM(n_features, hidden_size, batch_first=True)
        self.dropout = nn.Dropout(0.25)
        self.output = nn.Linear(hidden_size, 1)

    def forward(self, x):
        sequence, _ = self.lstm(x)
        return self.output(self.dropout(sequence[:, -1, :])).squeeze(1)


def seed_everything(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def to_bool(series):
    if pd.api.types.is_bool_dtype(series):
        return series.fillna(False)

    if pd.api.types.is_numeric_dtype(series):
        return series.fillna(0).ne(0)

    return series.astype(str).str.strip().str.lower().isin(
        {"true", "1", "yes", "y"}
    )

def build_labeled_frame(raw: pd.DataFrame) -> pd.DataFrame:
    """Tạo nhãn A1/A4 trực tiếp bằng bộ quy tắc VNPT của Thúy."""
    evaluated = evaluate(raw)

    # Ghép thêm counter gốc để mô hình có dữ liệu đầu vào chi tiết hơn.
    source = raw.copy()

    if not pd.api.types.is_datetime64_any_dtype(source["STA_DATETIME"]):
        source["STA_DATETIME"] = pd.to_datetime(
            source["STA_DATETIME"], format="%d/%m/%Y %H:%M:%S",
            dayfirst=True
        )

    counters = [name for name in COUNTER_FEATURES if name in source.columns]
    source = source.rename(
        columns={"CELL_NAME": "cell_name", "STA_DATETIME": "sta_datetime"}
    )

    evaluated = evaluated.merge(
        source[["cell_name", "sta_datetime", *counters]],
        on=["cell_name", "sta_datetime"],
        how="left",
        validate="one_to_one",
    )

    # Tách riêng nhãn A1 và A4.
    evaluated["a1_label"] = to_bool(evaluated["is_anomaly"]).astype("int8")
    evaluated["a4_label"] = (
        evaluated[A4_FLAGS].apply(to_bool).any(axis=1).astype("int8")
    )

    # Kiểm tra phân bố nhãn.
    print("\nPhân bố nhãn:")
    print("A1:")
    print(evaluated["a1_label"].value_counts())

    print("\nA4:")
    print(evaluated["a4_label"].value_counts())

    print("\nSố mẫu đồng thời có A1 và A4:")
    print(
        ((evaluated["a1_label"] == 1) &
         (evaluated["a4_label"] == 1)).sum()
    )

    return evaluated


def chronological_split(frame: pd.DataFrame) -> dict:
    """Chia dữ liệu theo thời gian riêng cho từng loại nhãn."""

    boundaries = {
        "train": (TRAIN_START, VALIDATION_START),
        "validation": (VALIDATION_START, TEST_START),
        "test": (TEST_START, TEST_START + pd.Timedelta(days=7)),
    }

    result = {"a1": {}, "a4": {}}

    for target in ("a1", "a4"):
        label_col = f"{target}_label"

        for name, (start, end) in boundaries.items():
            part = frame.loc[
                frame.sta_datetime.ge(start) &
                frame.sta_datetime.lt(end)
            ].copy()

            if target == "a1":
                part = part.loc[part.a1_ready].copy()

            if part.empty:
                raise ValueError(
                    f"Không có dữ liệu {target.upper()} cho split {name}"
                )

            if part[label_col].nunique() < 2:
                raise ValueError(
                    f"{target.upper()} split {name} chỉ có một lớp nhãn"
                )

            result[target][name] = (
                part.sort_values(["cell_name", "sta_datetime"])
                .reset_index(drop=True)
            )

    return result


def make_sequences(
    full_frame: pd.DataFrame,
    full_values: np.ndarray,
    target_frame: pd.DataFrame,
    label_col: str,
    window: int = WINDOW,
):
    """
    Tạo chuỗi liên tục từ toàn bộ lịch sử.
    Chỉ lấy nhãn tại các thời điểm thuộc target_frame.
    """

    # Ánh xạ thời điểm cần dự đoán sang vị trí và nhãn tương ứng.
    endpoints = {
        (row.cell_name, row.sta_datetime): (idx, int(getattr(row, label_col)))
        for idx, row in enumerate(target_frame.itertuples(index=False))
    }

    xs, ys, row_indices = [], [], []
    offset = 0

    for cell_name, group in full_frame.groupby("cell_name", sort=False):
        n = len(group)
        group_values = full_values[offset:offset + n]
        times = group["sta_datetime"].to_numpy()

        for end in range(window - 1, n):
            key = (cell_name, pd.Timestamp(times[end]))

            # Chỉ lấy thời điểm cuối thuộc tập đang xét.
            if key not in endpoints:
                continue

            start = end - window + 1
            intervals = np.diff(times[start:end + 1])

            # Bỏ chuỗi nếu thiếu giờ hoặc không liên tục.
            if not np.all(intervals == np.timedelta64(1, "h")):
                continue

            row_idx, label = endpoints[key]

            xs.append(group_values[start:end + 1])
            ys.append(label)
            row_indices.append(row_idx)

        offset += n

    if not xs:
        raise ValueError(
            f"Không tạo được chuỗi cho {label_col}, window={window}"
        )

    return (
        np.asarray(xs, dtype=np.float32),
        np.asarray(ys, dtype=np.int64),
        np.asarray(row_indices, dtype=np.int64),
    )


def tune_threshold(
    y_true: np.ndarray,
    probabilities: np.ndarray,
) -> float:
    """Chọn threshold tối ưu F1 trên Validation."""

    y_true = np.asarray(y_true).ravel()
    probabilities = np.asarray(probabilities).ravel()

    if len(y_true) != len(probabilities) or len(y_true) == 0:
        raise ValueError("Nhãn và xác suất Validation không hợp lệ.")

    if not np.isfinite(probabilities).all():
        raise ValueError("Xác suất dự đoán chứa NaN hoặc vô cực.")

    if len(np.unique(y_true)) < 2:
        raise ValueError("Validation cần có đủ hai lớp nhãn.")

    candidates = np.unique(
        np.concatenate((
            np.array([0.05, 0.1, 0.2, 0.3, 0.4, 0.5]),
            probabilities,
        ))
    )

    best_threshold = 0.5
    best_f1 = -1.0

    for threshold in candidates:
        predicted = (probabilities >= threshold).astype(int)
        score = f1_score(
            y_true, predicted, zero_division=0
        )

        if score > best_f1 or (
            score == best_f1 and threshold > best_threshold
        ):
            best_threshold = float(threshold)
            best_f1 = float(score)

    return best_threshold


def metric_row(name: str, y_true: np.ndarray, probabilities: np.ndarray, threshold: float):
    predicted = (probabilities >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predicted, labels=[0, 1]).ravel()
    return {
        "model": name,
        "threshold": threshold,
        "precision": precision_score(y_true, predicted, zero_division=0),
        "recall": recall_score(y_true, predicted, zero_division=0),
        "f1": f1_score(y_true, predicted, zero_division=0),
        "accuracy": accuracy_score(y_true, predicted),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
        "support_normal": int((y_true == 0).sum()),
        "support_risk": int((y_true == 1).sum()),
    }


def train_lstm(x_train, y_train, x_val, y_val):
    """Huấn luyện LSTM với class weighting và early stopping."""

    if len(np.unique(y_train)) < 2:
        raise ValueError("Train LSTM phải có đủ hai lớp nhãn.")

    if len(np.unique(y_val)) < 2:
        raise ValueError("Validation LSTM phải có đủ hai lớp nhãn.")

    model = LSTMClassifier(x_train.shape[-1]).to(DEVICE)

    positives = int(y_train.sum())
    negatives = len(y_train) - positives

    loss_fn = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor(
            [negatives / positives],
            dtype=torch.float32,
            device=DEVICE,
        )
    )

    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

    train_loader = DataLoader(
        TensorDataset(
            torch.from_numpy(x_train),
            torch.from_numpy(y_train.astype(np.float32)),
        ),
        batch_size=BATCH_SIZE,
        shuffle=True,
    )

    x_val_tensor = torch.from_numpy(x_val).to(DEVICE)
    y_val_tensor = torch.from_numpy(
        y_val.astype(np.float32)
    ).to(DEVICE)

    best_loss = float("inf")
    best_state = None
    patience = 8
    epochs_run = 0

    for epoch in range(EPOCHS):
        epochs_run = epoch + 1
        model.train()

        for batch_x, batch_y in train_loader:
            batch_x = batch_x.to(DEVICE)
            batch_y = batch_y.to(DEVICE)

            optimizer.zero_grad()
            loss = loss_fn(model(batch_x), batch_y)
            loss.backward()

            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(
                model(x_val_tensor), y_val_tensor
            ).item()

        if val_loss < best_loss - 1e-5:
            best_loss = val_loss
            best_state = {
                key: value.detach().cpu().clone()
                for key, value in model.state_dict().items()
            }
            patience = 8
        else:
            patience -= 1
            if patience == 0:
                break

    if best_state is None:
        raise RuntimeError("LSTM không tạo được checkpoint tốt nhất.")

    model.load_state_dict(best_state)
    model.eval()

    return model, epochs_run



def markdown_report(results, split_info, epochs, device, raw_path):
    lines = [
        "# VNPT A1/A4: Đối sánh XGBoost và LSTM — Tuần 4",
        "",
        "> Báo cáo được sinh tự động bởi `train_vnpt_models.py`.",
        "> Dữ liệu sử dụng là dữ liệu counter Ericsson mô phỏng, không phải dữ liệu production VNPT.",
        "",
        "## 1. Nguồn dữ liệu và phương pháp tạo nhãn",
        "",
        f"- Dữ liệu đầu vào: `{raw_path}`.",
        "- Bộ quy tắc: `vnpt_kpi_rules.py`, sử dụng trực tiếp `evaluate()`.",
        "- A1: nhãn `is_anomaly` từ bộ quy tắc A1.",
        "- A4: nhãn dương nếu có ít nhất một cờ trong `A4_FLAGS`.",
        "- Hai bài toán A1 và A4 được huấn luyện, đánh giá độc lập.",
        "- Không sử dụng nhãn NIST RAN cũ.",
        "- Không đưa cờ cảnh báo A1/A4 hoặc trọng số xếp hạng A4 vào feature.",
        "- Feature gồm KPI suy ra và counter gốc liên quan.",
        "",
        "## 2. Chia dữ liệu",
        "",
        "Dữ liệu được chia theo thời gian, không shuffle:",
        "- Train: 31/03/2025 – 06/04/2025.",
        "- Validation: 07/04/2025 – 13/04/2025.",
        "- Test: 14/04/2025 – 20/04/2025.",
        "- A1 chỉ sử dụng các mẫu đã đủ điều kiện `a1_ready`.",
        "- A4 sử dụng toàn bộ mẫu trong khoảng thời gian, không phụ thuộc `a1_ready`.",
        "- Chuỗi LSTM sử dụng 12 giờ lịch sử liên tục tại mỗi thời điểm dự đoán.",
        "- Các thời điểm lịch sử trước ranh giới tập được phép dùng làm đầu vào, không dùng nhãn tương lai.",
        "",
        "### 2.1. Phân bố dữ liệu",
        "",
        "| Bài toán | Tập | Dòng gốc | Chuỗi sử dụng | Bình thường | Bất thường |",
        "|---|---|---:|---:|---:|---:|",
    ]

    for target, groups in split_info.items():
        for name, info in groups.items():
            lines.append(
                f"| {target.upper()} | {name} | "
                f"{info['raw_rows']} | {info['rows']} | "
                f"{info['normal']} | {info['risk']} |"
            )

    lines += [
        "",
        "## 3. Kết quả đối sánh trên Test",
        "",
        "Threshold được lựa chọn trên Validation bằng F1-score. "
        "Tập Test chỉ được sử dụng để đánh giá cuối cùng.",
        "",
    ]

    for index, (target, rows) in enumerate(results.items(), start=1):
        lines += [
            f"### 3.{index}. Kết quả {target.upper()}",
            "",
            "| Mô hình | Threshold | Precision | Recall | F1-Score | Accuracy |",
            "|---|---:|---:|---:|---:|---:|",
        ]

        for row in rows:
            lines.append(
                f"| {row['model']} | {row['threshold']:.4f} | "
                f"{row['precision']:.4f} | {row['recall']:.4f} | "
                f"{row['f1']:.4f} | {row['accuracy']:.4f} |"
            )

        lines += [
            "",
            f"#### Confusion Matrix – {target.upper()}",
            "",
            "| Mô hình | TN | FP | FN | TP | Support lớp 0 | Support lớp 1 |",
            "|---|---:|---:|---:|---:|---:|---:|",
        ]

        for row in rows:
            lines.append(
                f"| {row['model']} | {row['tn']} | {row['fp']} | "
                f"{row['fn']} | {row['tp']} | "
                f"{row['support_normal']} | {row['support_risk']} |"
            )

        lines.append("")

    lines += [
        "## 4. Cấu hình mô hình",
        "",
        "- XGBoost: binary logistic, 350 estimators, max depth 4.",
        f"- LSTM: cửa sổ {WINDOW} giờ, 1 tầng, hidden size 48, dropout 0.25.",
        f"- LSTM: tối đa {EPOCHS} epoch, early stopping theo validation loss.",
        "- XGBoost và LSTM sử dụng cùng feature và cùng các mốc đánh giá.",
        "- Imputer và scaler chỉ được fit trên Train.",
        f"- Thiết bị: `{device}`; random seed: `{SEED}`.",
        "",
        "### 4.1. Số epoch thực tế",
        "",
        "| Bài toán | Số epoch |",
        "|---|---:|",
    ]

    for target, count in epochs.items():
        lines.append(f"| {target.upper()} | {count} |")

    lines += [
        "",
        "## 5. Nhận xét kết quả",
        "",
    ]

    for target, rows in results.items():
        xgb_row = next(
            row for row in rows if row["model"] == "XGBoost (Baseline)"
        )
        lstm_row = next(
            row for row in rows if row["model"] == "LSTM (Deep Learning)"
        )

        if xgb_row["f1"] > lstm_row["f1"]:
            better = "XGBoost"
        elif lstm_row["f1"] > xgb_row["f1"]:
            better = "LSTM"
        else:
            better = "hai mô hình có F1-score bằng nhau"

        lines.append(
            f"- **{target.upper()}:** {better} có F1-score cao hơn "
            "trên tập Test trong lần thử nghiệm này."
        )

    lines += [
        "",
        "Lưu ý: Kết quả A4 cần được diễn giải thận trọng do tập Test "
        "chỉ có 6 mẫu bất thường. Một vài dự đoán sai có thể làm thay đổi "
        "đáng kể Precision, Recall và F1-score.",
        "",
        "## 6. Hạn chế và lưu ý",
        "",
        "1. Dữ liệu đầu vào là dữ liệu mô phỏng, không đại diện cho mạng VNPT production.",
        "2. Nhãn được tạo từ rule engine, chưa phải nhãn sự cố độc lập được chuyên gia xác nhận.",
        "3. Dữ liệu mất cân bằng lớp, đặc biệt A4 có rất ít mẫu bất thường.",
        "4. Kết quả cần được kiểm chứng thêm trên dữ liệu mạng thực tế.",
        "5. Không sử dụng Test để lựa chọn threshold hoặc điều chỉnh mô hình.",
        "",
    ]

    return "\n".join(lines)



def run(raw_path: Path, output_dir: Path):
    seed_everything()

    raw = pd.read_csv(raw_path)
    labeled = build_labeled_frame(raw)

    missing_features = [
        name for name in FEATURES if name not in labeled.columns
    ]
    if missing_features:
        raise ValueError(
            "Dữ liệu thiếu cột đầu vào: " + ", ".join(missing_features)
        )

    splits = chronological_split(labeled)

    output_dir.mkdir(parents=True, exist_ok=True)
    model_dir = output_dir / "vnpt"
    model_dir.mkdir(parents=True, exist_ok=True)

    # Toàn bộ dữ liệu lịch sử, sắp xếp cố định để tạo chuỗi.
    full_frame = (
        labeled.sort_values(["cell_name", "sta_datetime"])
        .reset_index(drop=True)
    )

    all_results = {}
    all_split_info = {}
    all_epochs = {}

    import joblib

    for target in ("a1", "a4"):
        label_col = f"{target}_label"
        target_splits = splits[target]

        print(f"\n{'=' * 15} HUẤN LUYỆN {target.upper()} {'=' * 15}")

        # --------------------------------------------------
        # 1. Tiền xử lý: chỉ fit trên Train.
        # --------------------------------------------------
        imputer = SimpleImputer(strategy="median")
        scaler = StandardScaler()

        train_raw = target_splits["train"][FEATURES].replace(
            [np.inf, -np.inf], np.nan
        )
        imputer.fit(train_raw)

        # Transform toàn bộ lịch sử bằng imputer đã fit trên Train.
        full_raw = full_frame[FEATURES].replace(
            [np.inf, -np.inf], np.nan
        )
        full_transformed = np.asarray(
            imputer.transform(full_raw),
            dtype=np.float32,
        )

        # Xác định vị trí Train trong toàn bộ dữ liệu.
        train_keys = set(
            zip(
                target_splits["train"]["cell_name"],
                target_splits["train"]["sta_datetime"],
            )
        )
        train_mask = np.array([
            (cell, time) in train_keys
            for cell, time in zip(
                full_frame["cell_name"],
                full_frame["sta_datetime"],
            )
        ])

        scaler.fit(full_transformed[train_mask])

        full_scaled = np.asarray(
            scaler.transform(full_transformed),
            dtype=np.float32,
        )

        # --------------------------------------------------
        # 2. Tạo chuỗi từ toàn bộ lịch sử.
        # --------------------------------------------------
        seq = {}
        x = {}
        y = {}
        split_info = {}

        for name, part in target_splits.items():
            x_seq, y_seq, row_idx = make_sequences(
                full_frame=full_frame,
                full_values=full_scaled,
                target_frame=part,
                label_col=label_col,
            )

            seq[name] = (x_seq, y_seq, row_idx)

            # XGBoost dùng feature tại thời điểm cuối chuỗi.
            part_raw = part[FEATURES].replace(
                [np.inf, -np.inf], np.nan
            )
            part_values = np.asarray(
                imputer.transform(part_raw),
                dtype=np.float32,
            )

            x[name] = part_values[row_idx]
            y[name] = y_seq

            if not np.array_equal(
                y[name],
                part[label_col].to_numpy()[row_idx],
            ):
                raise ValueError(
                    f"Nhãn không khớp giữa chuỗi và {name}"
                )

            split_info[name] = {
                "start": str(part.sta_datetime.min()),
                "end": str(part.sta_datetime.max()),
                "raw_rows": len(part),
                "rows": len(y_seq),
                "normal": int((y_seq == 0).sum()),
                "risk": int((y_seq == 1).sum()),
            }

            print(
                f"{name}: raw={len(part)}, "
                f"sequences={len(y_seq)}, "
                f"normal={split_info[name]['normal']}, "
                f"risk={split_info[name]['risk']}"
            )

        all_split_info[target] = split_info

        x_train, x_val, x_test = (
            x["train"], x["validation"], x["test"]
        )
        y_train, y_val, y_test = (
            y["train"], y["validation"], y["test"]
        )

        # --------------------------------------------------
        # 3. XGBoost.
        # --------------------------------------------------
        xgb = XGBClassifier(
            n_estimators=350,
            max_depth=4,
            learning_rate=0.04,
            subsample=0.9,
            colsample_bytree=0.9,
            min_child_weight=2,
            reg_lambda=2.0,
            objective="binary:logistic",
            eval_metric="logloss",
            scale_pos_weight=(
                (y_train == 0).sum() /
                max((y_train == 1).sum(), 1)
            ),
            random_state=SEED,
            n_jobs=4,
        )
        xgb.fit(x_train, y_train)

        xgb_val_prob = xgb.predict_proba(x_val)[:, 1]
        xgb_test_prob = xgb.predict_proba(x_test)[:, 1]
        xgb_threshold = tune_threshold(y_val, xgb_val_prob)

        # --------------------------------------------------
        # 4. LSTM.
        # --------------------------------------------------
        lstm, epochs_run = train_lstm(
            seq["train"][0],
            seq["train"][1],
            seq["validation"][0],
            seq["validation"][1],
        )

        all_epochs[target] = epochs_run

        lstm.eval()
        with torch.no_grad():
            val_logits = lstm(
                torch.from_numpy(seq["validation"][0]).to(DEVICE)
            )
            test_logits = lstm(
                torch.from_numpy(seq["test"][0]).to(DEVICE)
            )

            lstm_val_prob = torch.sigmoid(val_logits).cpu().numpy()
            lstm_test_prob = torch.sigmoid(test_logits).cpu().numpy()

        lstm_threshold = tune_threshold(
            y_val, lstm_val_prob
        )

        # --------------------------------------------------
        # 5. Đánh giá trên cùng tập Test.
        # --------------------------------------------------
        results = [
            metric_row(
                "XGBoost (Baseline)",
                y_test,
                xgb_test_prob,
                xgb_threshold,
            ),
            metric_row(
                "LSTM (Deep Learning)",
                y_test,
                lstm_test_prob,
                lstm_threshold,
            ),
        ]

        all_results[target] = results

        # --------------------------------------------------
        # 6. Lưu model và bộ tiền xử lý.
        # --------------------------------------------------
        joblib.dump(
            {
                "model": xgb,
                "imputer": imputer,
                "features": FEATURES,
                "threshold": xgb_threshold,
            },
            model_dir / f"xgboost_vnpt_{target}.joblib",
        )

        torch.save(
            {
                "state_dict": lstm.state_dict(),
                "features": FEATURES,
                "window": WINDOW,
                "imputer": imputer,
                "scaler": scaler,
                "threshold": lstm_threshold,
            },
            model_dir / f"lstm_vnpt_{target}.pt",
        )

        print(f"\nKết quả {target.upper()}:")
        print(f"LSTM epochs: {epochs_run}")

        for row in results:
            print(
                f"{row['model']}: "
                f"Precision={row['precision']:.4f}, "
                f"Recall={row['recall']:.4f}, "
                f"F1={row['f1']:.4f}, "
                f"TP={row['tp']}, FN={row['fn']}"
            )

    # --------------------------------------------------
    # 7. Tạo và lưu báo cáo Markdown.
    # --------------------------------------------------
    report = markdown_report(
        all_results,
        all_split_info,
        all_epochs,
        DEVICE,
        raw_path,
    )

    docs_dir = ROOT_DIR / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)

    report_path = docs_dir / "vnpt-model-comparison.md"
    report_path.write_text(report, encoding="utf-8")

    print("\nĐã hoàn thành huấn luyện A1 và A4.")
    print(f"Đã lưu báo cáo: {report_path}")
    print(f"Đã lưu các model tại: {model_dir}")

    return all_results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=BASE_DIR / "data" / "vnpt_cell_simulated.csv")
    parser.add_argument("--output-dir", type=Path, default=BASE_DIR / "models")
    args = parser.parse_args()
    run(args.raw.resolve(), args.output_dir.resolve())


if __name__ == "__main__":
    main()
