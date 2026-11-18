
# ==============================================================================
# SERVICE: API DỰ BÁO NGUY CƠ SUY GIẢM CHẤT LƯỢNG MẠNG
# FASTAPI + XGBOOST + LSTM
# Đề tài N3.2
# Phụ trách phát triển: Lương Tâm Như (AI / ML Engineer)
# ==============================================================================

"""API dự báo nguy cơ suy giảm chất lượng mạng. Chạy: python app.py."""

from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import uvicorn

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


# ==============================================================================
# 1. CẤU HÌNH
# ==============================================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_FILE = BASE_DIR / "model.pkl"
DL_MODEL_FILE = BASE_DIR / "dl_model.pt"

PORT = 8000
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

artifacts = {}


# ==============================================================================
# 2. KIẾN TRÚC LSTM
# Phải đồng nhất với kiến trúc trong train_dl_model.py
# ==============================================================================

class LSTMClassifier(nn.Module):

    def __init__(self):
        super().__init__()

        self.lstm = nn.LSTM(
            input_size=3,
            hidden_size=64,
            num_layers=1,
            batch_first=True
        )

        self.dropout = nn.Dropout(0.2)
        self.fc = nn.Linear(64, 1)

    def forward(self, x):
        output, _ = self.lstm(x)

        last_output = output[:, -1, :]
        last_output = self.dropout(last_output)

        return self.fc(last_output).squeeze(1)


# ==============================================================================
# 3. LOAD MODEL
# ==============================================================================

@asynccontextmanager
async def lifespan(_: FastAPI):

    # Kiểm tra XGBoost
    if not MODEL_FILE.is_file():
        raise RuntimeError(
            f"Không tìm thấy {MODEL_FILE}. "
            "Hãy chạy train_model.py trước."
        )

    # Kiểm tra LSTM
    if not DL_MODEL_FILE.is_file():
        raise RuntimeError(
            f"Không tìm thấy {DL_MODEL_FILE}. "
            "Hãy chạy train_dl_model.py trước."
        )

    # Load XGBoost
    artifacts.update(joblib.load(MODEL_FILE))

    # Load LSTM
    checkpoint = torch.load(
        DL_MODEL_FILE,
        map_location=DEVICE,
        weights_only=True
    )

    # Kiểm tra cấu hình model
    if (
        checkpoint.get("input_size") != 3
        or checkpoint.get("hidden_size") != 64
        or checkpoint.get("window_size") != 12
    ):
        raise RuntimeError("Cấu hình LSTM không tương thích.")

    dl_model = LSTMClassifier().to(DEVICE)

    dl_model.load_state_dict(
        checkpoint["model_state_dict"]
    )

    dl_model.eval()

    artifacts["dl_model"] = dl_model

    print("Đã tải XGBoost thành công.")
    print("Đã tải LSTM thành công.")
    print("Thiết bị:", DEVICE)

    yield

    artifacts.clear()


# ==============================================================================
# 4. KHỞI TẠO FASTAPI
# ==============================================================================

app = FastAPI(
    title="VNPT NetGuard AI Service",
    description="API dự báo nguy cơ suy giảm chất lượng mạng bằng XGBoost và LSTM.",
    version="1.0.0",
    lifespan=lifespan
)


# ==============================================================================
# 5. XỬ LÝ LỖI VALIDATION
# ==============================================================================

@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _: Request,
    exc: RequestValidationError
) -> JSONResponse:

    errors = [
        {
            key: value
            for key, value in error.items()
            if key != "input"
        }
        for error in exc.errors()
    ]

    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(errors)}
    )


# ==============================================================================
# 6. INPUT / OUTPUT XGBOOST
# ==============================================================================

class KpiInput(BaseModel):

    latency_ms: float = Field(
        gt=0,
        allow_inf_nan=False
    )

    packet_loss_rate: float = Field(
        ge=0,
        le=100,
        allow_inf_nan=False
    )

    jitter_ms: float = Field(
        ge=0,
        allow_inf_nan=False
    )

    throughput_mbps: float = Field(
        ge=0,
        allow_inf_nan=False
    )


class PredictionOutput(BaseModel):
    status: str
    is_anomaly: bool
    risk_level: str
    confidence: float


# ==============================================================================
# 7. INPUT LSTM
# ==============================================================================

class SequenceInput(BaseModel):

    sequence: list[list[float]]


# ==============================================================================
# 8. HÀM PHÂN LOẠI MỨC ĐỘ RỦI RO
# ==============================================================================

def risk_level_for(
    probability: float,
    threshold: float
) -> str:

    if probability >= threshold:
        return "HIGH"

    if probability >= threshold / 2:
        return "MEDIUM"

    return "LOW"


# ==============================================================================
# 9. API XGBOOST
# POST /predict
# Đầu vào: 4 KPI tại một thời điểm
# ==============================================================================

@app.post(
    "/predict",
    response_model=PredictionOutput
)
def predict(kpi: KpiInput) -> PredictionOutput:

    row = pd.DataFrame(
        [kpi.model_dump()]
    )[artifacts["features"]]

    probability = float(
        artifacts["model"].predict_proba(row)[0, 1]
    )

    threshold = artifacts["threshold"]

    return PredictionOutput(
        status="success",
        is_anomaly=probability >= threshold,
        risk_level=risk_level_for(
            probability,
            threshold
        ),
        confidence=round(probability, 4)
    )


# ==============================================================================
# 10. API LSTM
# POST /predict/dl
# Đầu vào: chuỗi 12 thời điểm x 3 đặc trưng
# Dữ liệu phải được chuẩn hóa giống lúc huấn luyện.
# ==============================================================================

@app.post("/predict/dl")
def predict_dl(data: SequenceInput):

    sequence = np.asarray(
        data.sequence,
        dtype=np.float32
    )

    # Kiểm tra kích thước chuỗi
    if sequence.shape != (12, 3):
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Sequence phải có kích thước 12x3."
            }
        )

    # Kiểm tra dữ liệu hợp lệ
    if not np.isfinite(sequence).all():
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Sequence chứa NaN hoặc Inf."
            }
        )

    # Chuyển thành Tensor
    tensor = torch.tensor(
        sequence,
        dtype=torch.float32
    ).unsqueeze(0).to(DEVICE)

    model = artifacts["dl_model"]

    model.eval()

    with torch.no_grad():

        logits = model(tensor)

        probability = float(
            torch.sigmoid(logits).item()
        )

    threshold = 0.5

    return {
        "status": "success",
        "model": "LSTM",
        "is_anomaly": probability >= threshold,
        "risk_level": risk_level_for(
            probability,
            threshold
        ),
        "confidence": round(probability, 4)
    }


# ==============================================================================
# 11. CHẠY SERVER
# ==============================================================================

if __name__ == "__main__":

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT
    )
