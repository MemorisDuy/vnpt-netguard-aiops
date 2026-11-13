# ==============================================================================
# SERVICE: API DỰ BÁO NGUY CƠ SUY GIẢM CHẤT LƯỢNG MẠNG (FASTAPI + XGBOOST)
# Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
# Phụ trách phát triển: Lương Tâm Như (AI / ML Engineer)
# ==============================================================================
"""API dự báo nguy cơ suy giảm chất lượng mạng. Chạy: python app.py (cổng 8000)."""

from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import pandas as pd
import uvicorn
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MODEL_FILE = Path(__file__).resolve().parent / "model.pkl"
PORT = 8000

artifacts = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not MODEL_FILE.is_file():
        raise RuntimeError(f"Khong tim thay {MODEL_FILE}. Hay chay train_model.py truoc.")
    artifacts.update(joblib.load(MODEL_FILE))
    yield
    artifacts.clear()


app = FastAPI(title="VNPT NetGuard AI Service", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Bỏ giá trị đầu vào khỏi thông báo lỗi: NaN/Inf không chuyển được sang JSON và gây lỗi 500.
    errors = [{key: value for key, value in error.items() if key != "input"} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


class KpiInput(BaseModel):
    # Cùng miền giá trị hợp lệ với clean_station_data trong clean_data.py.
    latency_ms: float = Field(gt=0, allow_inf_nan=False)
    packet_loss_rate: float = Field(ge=0, le=100, allow_inf_nan=False)
    jitter_ms: float = Field(ge=0, allow_inf_nan=False)
    throughput_mbps: float = Field(ge=0, allow_inf_nan=False)


class PredictionOutput(BaseModel):
    status: str
    is_anomaly: bool
    risk_level: str
    confidence: float  # Xác suất suy giảm (0-1); nhân 100 để ra phần trăm.


def risk_level_for(probability: float, threshold: float) -> str:
    if probability >= threshold:
        return "HIGH"
    if probability >= threshold / 2:
        return "MEDIUM"
    return "LOW"


@app.post("/predict", response_model=PredictionOutput)
def predict(kpi: KpiInput) -> PredictionOutput:
    row = pd.DataFrame([kpi.model_dump()])[artifacts["features"]]
    probability = float(artifacts["model"].predict_proba(row)[0, 1])
    threshold = artifacts["threshold"]
    return PredictionOutput(
        status="success",
        is_anomaly=probability >= threshold,
        risk_level=risk_level_for(probability, threshold),
        confidence=round(probability, 4),
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
