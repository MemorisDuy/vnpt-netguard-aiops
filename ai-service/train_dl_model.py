
# ==============================================================================
# HUẤN LUYỆN LSTM CẢNH BÁO NGUY CƠ SUY GIẢM CHẤT LƯỢNG MẠNG
# Đề tài N3.2
# Phụ trách phát triển: Lương Tâm Như (AI / ML Engineer)
# Nhãn: 0 = Bình thường, 1 = Có nguy cơ
# ==============================================================================

import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix
)

# ==============================================================================
# 1. CẤU HÌNH
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_FILE = BASE_DIR / "data" / "sequences" / "nist_sequences.npz"
METADATA_FILE = BASE_DIR / "data" / "sequences" / "sequence_metadata.json"
MODEL_FILE = BASE_DIR / "dl_model.pt"

RANDOM_SEED = 42
BATCH_SIZE = 128
EPOCHS = 30
LEARNING_RATE = 0.001

INPUT_SIZE = 3
HIDDEN_SIZE = 64
WINDOW_SIZE = 12

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ==============================================================================
# 2. CỐ ĐỊNH RANDOM SEED
# ==============================================================================

def set_seed(seed=RANDOM_SEED):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# ==============================================================================
# 3. ĐỌC METADATA
# ==============================================================================

def load_metadata():
    if not METADATA_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy: {METADATA_FILE}")

    with open(METADATA_FILE, "r", encoding="utf-8") as file:
        metadata = json.load(file)

    expected_features = [
        "latency",
        "throughput",
        "latency_change_ms"
    ]

    if metadata.get("features") != expected_features:
        raise ValueError("Thứ tự đặc trưng trong metadata không đúng")

    mean = np.asarray(metadata["mean"], dtype=np.float64)
    scale = np.asarray(metadata["scale"], dtype=np.float64)

    if mean.shape != (INPUT_SIZE,) or scale.shape != (INPUT_SIZE,):
        raise ValueError("Mean hoặc scale không đúng kích thước")

    if not np.isfinite(mean).all() or not np.isfinite(scale).all():
        raise ValueError("Mean hoặc scale không hợp lệ")

    if (scale <= 0).any():
        raise ValueError("Scale phải lớn hơn 0")

    if metadata.get("window") != WINDOW_SIZE:
        raise ValueError("Window phải bằng 12")

    return metadata, mean, scale


# ==============================================================================
# 4. ĐỌC DỮ LIỆU VÀ TẠO NHÃN
# ==============================================================================

def load_sequence_data():
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy: {DATA_FILE}")

    metadata, mean, scale = load_metadata()
    datasets = {}

    with np.load(DATA_FILE) as data:
        for split in ["train", "val", "test"]:

            X = data[f"X_{split}"].copy()
            keys = data[f"keys_{split}"].copy()

            if X.ndim != 3 or X.shape[1:] != (WINDOW_SIZE, INPUT_SIZE):
                raise ValueError(f"{split}: dữ liệu sai kích thước {X.shape}")

            if not np.isfinite(X).all():
                raise ValueError(f"{split}: dữ liệu chứa NaN hoặc Inf")

            if len(keys) != len(X):
                raise ValueError(f"{split}: số key không khớp số chuỗi")

            # Khôi phục latency tại thời điểm cuối chuỗi
            last_latency = X[:, -1, 0] * scale[0] + mean[0]

            # Công thức tạo nhãn theo phương pháp hiện tại của nhóm
            packet_loss_rate = np.clip(
                last_latency / 15, 0.1, 15
            ).round(2)

            y = (
                (last_latency > 60) |
                (packet_loss_rate > 3)
            ).astype(np.int64)

            datasets[split] = (X, y)

            risk_indices = np.where(y == 1)[0]
            risk_sessions = set(map(tuple, keys[risk_indices]))

            print(f"\n========== {split.upper()} ==========")
            print(f"Tổng số chuỗi: {len(X)}")
            print(f"Nhãn 0: {(y == 0).sum()}")
            print(f"Nhãn 1: {(y == 1).sum()}")
            print(f"Latency lớn nhất: {last_latency.max():.2f} ms")
            print(f"Session có nguy cơ: {len(risk_sessions)}")

    return datasets


# ==============================================================================
# 5. KIỂM TRA DỮ LIỆU
# ==============================================================================

def check_dataset(datasets):
    train_y = datasets["train"][1]
    counts = np.bincount(train_y, minlength=2)

    if len(train_y) == 0 or counts[1] == 0:
        print("Không có mẫu nguy cơ trong train. Không thể huấn luyện.")
        return False

    if len(np.unique(train_y)) < 2:
        print("Train chỉ có một lớp nhãn.")
        return False

    print("\nPhân bố nhãn:")
    for split, (_, y) in datasets.items():
        counts = np.bincount(y, minlength=2)
        print(
            f"{split}: bình thường={counts[0]}, "
            f"nguy cơ={counts[1]}"
        )

    if len(np.unique(datasets["val"][1])) < 2:
        print("CẢNH BÁO: Validation không đủ hai lớp để đánh giá đầy đủ.")

    if len(np.unique(datasets["test"][1])) < 2:
        print("CẢNH BÁO: Test không đủ hai lớp để đánh giá đầy đủ.")

    return True


# ==============================================================================
# 6. MÔ HÌNH LSTM
# ==============================================================================

class LSTMClassifier(nn.Module):

    def __init__(self):
        super().__init__()

        self.lstm = nn.LSTM(
            input_size=INPUT_SIZE,
            hidden_size=HIDDEN_SIZE,
            num_layers=1,
            batch_first=True
        )

        self.dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(HIDDEN_SIZE, 1)

    def forward(self, x):
        output, _ = self.lstm(x)

        # Lấy trạng thái tại thời điểm cuối chuỗi
        last_output = output[:, -1, :]

        last_output = self.dropout(last_output)

        return self.fc(last_output).squeeze(1)


# ==============================================================================
# 7. TẠO DATALOADER
# ==============================================================================

def create_dataloaders(datasets):
    loaders = {}

    for split, (X, y) in datasets.items():

        X_tensor = torch.tensor(X, dtype=torch.float32)
        y_tensor = torch.tensor(y, dtype=torch.float32)

        dataset = TensorDataset(X_tensor, y_tensor)

        loaders[split] = DataLoader(
            dataset,
            batch_size=BATCH_SIZE,
            shuffle=(split == "train"),
            num_workers=0
        )

    return loaders


# ==============================================================================
# 8. HUẤN LUYỆN
# ==============================================================================

def train_model(model, loaders):
    train_y = loaders["train"].dataset.tensors[1].numpy()

    counts = np.bincount(train_y.astype(int), minlength=2)

    # Giảm ảnh hưởng mất cân bằng nhãn
    pos_weight = torch.tensor(
        [counts[0] / max(counts[1], 1)],
        dtype=torch.float32,
        device=DEVICE
    )

    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=LEARNING_RATE
    )

    best_loss = float("inf")
    best_state = None

    for epoch in range(EPOCHS):

        model.train()
        total_loss = 0

        for X_batch, y_batch in loaders["train"]:
            X_batch = X_batch.to(DEVICE)
            y_batch = y_batch.to(DEVICE)

            optimizer.zero_grad()

            outputs = model(X_batch)
            loss = criterion(outputs, y_batch)

            loss.backward()
            optimizer.step()

            total_loss += loss.item() * len(X_batch)

        train_loss = total_loss / len(loaders["train"].dataset)

        # Theo dõi validation loss, không dùng làm chỉ số kiểm chứng
        # nếu validation thiếu lớp nguy cơ.
        model.eval()
        val_loss_total = 0

        with torch.no_grad():
            for X_batch, y_batch in loaders["val"]:
                X_batch = X_batch.to(DEVICE)
                y_batch = y_batch.to(DEVICE)

                outputs = model(X_batch)
                loss = criterion(outputs, y_batch)

                val_loss_total += loss.item() * len(X_batch)

        val_loss = val_loss_total / max(
            len(loaders["val"].dataset), 1
        )

        print(
            f"Epoch [{epoch + 1}/{EPOCHS}] "
            f"Train Loss: {train_loss:.6f} "
            f"Val Loss: {val_loss:.6f}"
        )

        if np.isfinite(val_loss) and val_loss < best_loss:
            best_loss = val_loss
            best_state = {
                key: value.detach().cpu().clone()
                for key, value in model.state_dict().items()
            }

    if best_state is not None:
        model.load_state_dict(best_state)

    return model


# ==============================================================================
# 9. ĐÁNH GIÁ
# ==============================================================================

def evaluate_model(model, loader, split_name):
    model.eval()

    all_predictions = []
    all_labels = []

    with torch.no_grad():
        for X_batch, y_batch in loader:
            X_batch = X_batch.to(DEVICE)

            logits = model(X_batch)
            probabilities = torch.sigmoid(logits)

            predictions = (probabilities >= 0.5).int()

            all_predictions.extend(predictions.cpu().numpy())
            all_labels.extend(y_batch.numpy().astype(int))

    y_true = np.asarray(all_labels)
    y_pred = np.asarray(all_predictions)

    print(f"\n========== KẾT QUẢ {split_name.upper()} ==========")

    if len(y_true) == 0:
        print("Không có dữ liệu để đánh giá.")
        return

    print(f"Accuracy : {accuracy_score(y_true, y_pred):.4f}")
    print(
        f"Precision: "
        f"{precision_score(y_true, y_pred, zero_division=0):.4f}"
    )
    print(
        f"Recall   : "
        f"{recall_score(y_true, y_pred, zero_division=0):.4f}"
    )
    print(
        f"F1-score : "
        f"{f1_score(y_true, y_pred, zero_division=0):.4f}"
    )

    print("Confusion Matrix:")
    print(confusion_matrix(y_true, y_pred, labels=[0, 1]))

    if len(np.unique(y_true)) < 2:
        print("LƯU Ý: Tập dữ liệu chỉ có một lớp nhãn.")
        print("Các chỉ số không phản ánh đầy đủ khả năng phát hiện nguy cơ.")


# ==============================================================================
# 10. CHƯƠNG TRÌNH CHÍNH
# ==============================================================================

if __name__ == "__main__":

    set_seed()

    print("Thiết bị:", DEVICE)

    datasets = load_sequence_data()

    if not check_dataset(datasets):
        raise SystemExit("Dừng vì dữ liệu train không đủ điều kiện.")

    loaders = create_dataloaders(datasets)

    model = LSTMClassifier().to(DEVICE)

    print("\nBắt đầu huấn luyện LSTM...")

    model = train_model(model, loaders)

    # Lưu mô hình
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "input_size": INPUT_SIZE,
            "hidden_size": HIDDEN_SIZE,
            "window_size": WINDOW_SIZE,
            "features": [
                "latency",
                "throughput",
                "latency_change_ms"
            ],
            "label_definition": (
                "latency > 60 OR "
                "round(clip(latency / 15, 0.1, 15), 2) > 3"
            )
        },
        MODEL_FILE
    )

    print(f"\nĐã lưu mô hình tại: {MODEL_FILE}")

    evaluate_model(model, loaders["val"], "Validation")
    evaluate_model(model, loaders["test"], "Test")

    print("\nHOÀN TẤT HUẤN LUYỆN LSTM.")
