
from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
)

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data/sequences/nist_sequences.npz"
METADATA_FILE = BASE_DIR / "data/sequences/sequence_metadata.json"
XGB_FILE = BASE_DIR / "model.pkl"
DL_FILE = BASE_DIR / "dl_model.pt"
OUTPUT_FILE = BASE_DIR / "model_comparison.csv"

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


class LSTMClassifier(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=3,
            hidden_size=64,
            num_layers=1,
            batch_first=True,
        )
        self.dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(64, 1)

    def forward(self, x):
        output, _ = self.lstm(x)
        return self.fc(self.dropout(output[:, -1, :])).squeeze(1)


def create_labels(X, mean, scale):
    latency = X[:, -1, 0] * scale[0] + mean[0]
    packet_loss = np.clip(latency / 15, 0.1, 15).round(2)
    return ((latency > 60) | (packet_loss > 3)).astype(int)


def evaluate(name, y_true, y_pred):
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])

    return {
        "Model": name,
        "Accuracy": accuracy_score(y_true, y_pred),
        "Precision": precision_score(y_true, y_pred, zero_division=0),
        "Recall": recall_score(y_true, y_pred, zero_division=0),
        "F1-score": f1_score(y_true, y_pred, zero_division=0),
        "TN": cm[0, 0],
        "FP": cm[0, 1],
        "FN": cm[1, 0],
        "TP": cm[1, 1],
    }


def main():
    for path in [DATA_FILE, METADATA_FILE, XGB_FILE, DL_FILE]:
        if not path.exists():
            raise FileNotFoundError(f"Không tìm thấy: {path}")

    data = np.load(DATA_FILE, allow_pickle=False)

    with open(METADATA_FILE, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    X_test = data["X_test"].astype(np.float32)
    mean = np.asarray(metadata["mean"], dtype=np.float64)
    scale = np.asarray(metadata["scale"], dtype=np.float64)

    y_test = create_labels(X_test, mean, scale)

    print("SỐ LƯỢNG MẪU TEST")
    print(f"Tổng mẫu: {len(y_test)}")
    print(f"Bình thường: {(y_test == 0).sum()}")
    print(f"Nguy cơ: {(y_test == 1).sum()}")

    # XGBoost
    xgb_artifacts = joblib.load(XGB_FILE)
    xgb_model = xgb_artifacts["model"]
    xgb_threshold = xgb_artifacts["threshold"]
    features = xgb_artifacts["features"]

    last_step = X_test[:, -1, :] * scale + mean

    latency = last_step[:, 0]
    throughput = last_step[:, 1]
    jitter = last_step[:, 2]
    packet_loss = np.clip(latency / 15, 0.1, 15).round(2)

    xgb_data = pd.DataFrame({
        "latency_ms": latency,
        "packet_loss_rate": packet_loss,
        "jitter_ms": jitter,
        "throughput_mbps": throughput,
    })

    xgb_prob = xgb_model.predict_proba(xgb_data[features])[:, 1]
    xgb_pred = (xgb_prob >= xgb_threshold).astype(int)

    # LSTM
    checkpoint = torch.load(
        DL_FILE,
        map_location=DEVICE,
        weights_only=True,
    )

    dl_model = LSTMClassifier().to(DEVICE)

    # Đúng key trong file dl_model.pt
    dl_model.load_state_dict(checkpoint["model_state_dict"])
    dl_model.eval()

    with torch.no_grad():
        inputs = torch.tensor(X_test, dtype=torch.float32).to(DEVICE)
        dl_prob = torch.sigmoid(dl_model(inputs)).cpu().numpy()

    dl_pred = (dl_prob >= 0.5).astype(int)

    results = [
        evaluate("XGBoost", y_test, xgb_pred),
        evaluate("LSTM", y_test, dl_pred),
    ]

    result_df = pd.DataFrame(results)
    result_df.to_csv(OUTPUT_FILE, index=False)

    print("\nKẾT QUẢ ĐỐI SÁNH")
    print(result_df.to_string(index=False))
    print(f"\nĐã lưu kết quả: {OUTPUT_FILE}")

    if y_test.sum() == 0:
        print(
            "\nCANH BAO: Tap Test khong co mau nguy co. "
            "Precision, Recall va F1 khong the danh gia "
            "kha nang phat hien nguy co."
        )


if __name__ == "__main__":
    main()
