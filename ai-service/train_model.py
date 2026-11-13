# ==============================================================================
# HUẤN LUYỆN XGBOOST CẢNH BÁO NGUY CƠ SUY GIẢM CHẤT LƯỢNG MẠNG
# Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
# Phụ trách phát triển: Lương Tâm Như (AI / ML Engineer)
# Nhãn: 0 = Bình thường, 1 = Có nguy cơ. Chỉ số ưu tiên: Recall.
#
# LƯU Ý KHI BÁO CÁO: packet_loss_rate và is_anomaly được suy ra từ latency theo
# công thức của nhóm, không phải số đo hay sự cố thật. Tập dữ liệu chỉ có rất ít
# dòng nhãn 1 nên các chỉ số Recall/Precision không có ý nghĩa thống kê.
# ==============================================================================

from itertools import product
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, f1_score, log_loss, precision_score, recall_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from xgboost import XGBClassifier

from clean_data import KPI_COLUMNS, TARGET, clean_station_data

SERVICE = Path(__file__).resolve().parent
DATA_FILE = SERVICE / "data" / "clean_data.csv"
MODEL_FILE = SERVICE / "model.pkl"

RANDOM_STATE = 42
TEST_SIZE = 0.2
CV_FOLDS = 2  # Train chỉ có 2 dòng nhãn 1, mỗi fold giữ được đúng 1 dòng.
MIN_RELIABLE_POSITIVES = 30

# Hạ ngưỡng luôn làm Recall không giảm, nên ngưỡng thấp nhất cho phép chính là
# ngưỡng đạt Recall cao nhất. Không hạ dưới mức này để tránh báo động tràn lan.
ALERT_THRESHOLD = 0.1

PARAM_GRID = {
    "max_depth": [2, 4],
    "min_child_weight": [0, 1],
}


def load_dataset(path=DATA_FILE) -> pd.DataFrame:
    """Đọc dữ liệu sạch và tạo đủ 4 KPI cùng nhãn trong bộ nhớ, không sửa file gốc."""
    df = pd.read_csv(path)
    df["latency_ms"] = df["latency"]
    df["throughput_mbps"] = df["throughput"]
    df["jitter_ms"] = df["latency_change_ms"]
    df["packet_loss_rate"] = (df["latency_ms"] / 15).clip(0.1, 15).round(2)
    df[TARGET] = ((df["latency_ms"] > 60) | (df["packet_loss_rate"] > 3)).astype(int)
    return clean_station_data(df)


def split_dataset(df: pd.DataFrame):
    """Trả về X_train, X_test, y_train, y_test, chia phân tầng theo nhãn."""
    return train_test_split(
        df[KPI_COLUMNS],
        df[TARGET],
        test_size=TEST_SIZE,
        stratify=df[TARGET],
        random_state=RANDOM_STATE,
    )


def build_model(y_train: pd.Series, **params) -> XGBClassifier:
    negatives, positives = np.bincount(y_train, minlength=2)
    return XGBClassifier(
        n_estimators=100,
        learning_rate=0.1,
        # "exact" xét mọi điểm cắt; histogram dễ bỏ qua vài dòng nhãn 1 hiếm gặp.
        tree_method="exact",
        scale_pos_weight=negatives / positives,
        eval_metric="logloss",
        random_state=RANDOM_STATE,
        **params,
    )


def out_of_fold_probabilities(X, y, params) -> np.ndarray:
    folds = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    probabilities = np.zeros(len(y))
    for fit_index, holdout_index in folds.split(X, y):
        model = build_model(y.iloc[fit_index], **params)
        model.fit(X.iloc[fit_index], y.iloc[fit_index])
        probabilities[holdout_index] = model.predict_proba(X.iloc[holdout_index])[:, 1]
    return probabilities


def select_params(X_train, y_train) -> dict:
    """Chọn tham số có Recall CV cao nhất; hòa điểm thì lấy log-loss thấp hơn."""
    best_params, best_key = None, None
    names = list(PARAM_GRID)
    for values in product(*PARAM_GRID.values()):
        params = dict(zip(names, values))
        probabilities = out_of_fold_probabilities(X_train, y_train, params)
        recall = recall_score(y_train, probabilities >= ALERT_THRESHOLD, zero_division=0)
        loss = log_loss(y_train, probabilities, labels=[0, 1])
        print(f"  {params}: CV recall={recall:.4f}, log-loss={loss:.6f}")
        key = (-recall, loss)
        if best_key is None or key < best_key:
            best_params, best_key = params, key
    return best_params


def evaluate(y_true, probabilities, threshold) -> dict:
    predictions = (probabilities >= threshold).astype(int)
    return {
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "f1": float(f1_score(y_true, predictions, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_true, predictions, labels=[0, 1]).tolist(),
        "test_rows": int(len(y_true)),
        "test_positives": int(np.sum(y_true)),
    }


def main():
    df = load_dataset()
    X_train, X_test, y_train, y_test = split_dataset(df)
    print(
        f"Du lieu: {len(df)} dong, {int(df[TARGET].sum())} nhan 1 | "
        f"Train: {len(X_train)} ({int(y_train.sum())} nhan 1) | "
        f"Test: {len(X_test)} ({int(y_test.sum())} nhan 1)"
    )

    print("Chon tham so theo Recall:")
    params = select_params(X_train, y_train)
    print(f"Tham so chon: {params}; nguong canh bao: {ALERT_THRESHOLD}")

    model = build_model(y_train, **params)
    model.fit(X_train, y_train)

    metrics = evaluate(y_test, model.predict_proba(X_test)[:, 1], ALERT_THRESHOLD)
    importance = {
        name: float(value) for name, value in zip(KPI_COLUMNS, model.feature_importances_)
    }

    print("\nKet qua tren tap Test:")
    print(f"  Recall:    {metrics['recall']:.4f}")
    print(f"  Precision: {metrics['precision']:.4f}")
    print(f"  F1:        {metrics['f1']:.4f}")
    print(f"  Ma tran nham lan [[TN, FP], [FN, TP]]: {metrics['confusion_matrix']}")

    print("\nFeature Importance:")
    for name, value in sorted(importance.items(), key=lambda item: item[1], reverse=True):
        print(f"  {name:<18} {value:.4f}")

    if metrics["test_positives"] < MIN_RELIABLE_POSITIVES:
        print(
            f"\nCANH BAO: Test chi co {metrics['test_positives']} dong nhan 1 "
            f"(duoi {MIN_RELIABLE_POSITIVES}), cac chi so tren khong co y nghia thong ke. "
            "Nhan duoc suy ra tu latency, khong phai su co that."
        )

    joblib.dump(
        {
            "model": model,
            "threshold": ALERT_THRESHOLD,
            "features": KPI_COLUMNS,
            "metrics": metrics,
            "feature_importance": importance,
        },
        MODEL_FILE,
    )
    print(f"\nDa luu model ra {MODEL_FILE}")


if __name__ == "__main__":
    main()
