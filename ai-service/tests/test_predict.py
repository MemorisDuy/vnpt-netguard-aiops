"""Kiểm thử tự động độ chính xác của API dự báo POST /predict (vai trò QA).

Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
Tác giả: Lương Tâm Như (AI / ML Engineer & Model QA)
Cần chạy train_model.py trước để có model.pkl.
"""
import json
from pathlib import Path
import socket
import sys
import threading
import time
import urllib.error
import urllib.request

import pandas as pd
import pytest
import uvicorn

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from app import app  # noqa: E402
from clean_data import DEMO, KPI_COLUMNS, TARGET  # noqa: E402
from train_model import load_dataset, split_dataset  # noqa: E402

SAMPLE = {"latency_ms": 75.0, "packet_loss_rate": 5.2, "jitter_ms": 14.0, "throughput_mbps": 20.0}
NEGATIVE_SAMPLE_SIZE = 200
MIN_RECALL = 0.95
MIN_ACCURACY = 0.95


@pytest.fixture(scope="module")
def predict_url():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 30
    while not server.started:
        if not thread.is_alive() or time.monotonic() > deadline:
            pytest.fail("API khong khoi dong duoc; kiem tra model.pkl")
        time.sleep(0.05)

    yield f"http://127.0.0.1:{port}/predict"

    server.should_exit = True
    thread.join(timeout=10)


def post(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def row_payload(row):
    return {name: float(row[name]) for name in KPI_COLUMNS}


def test_sample_input_matches_contract(predict_url):
    status, body = post(predict_url, SAMPLE)
    assert status == 200
    assert set(body) == {"status", "is_anomaly", "risk_level", "confidence"}
    assert body["status"] == "success"
    assert body["is_anomaly"] is True
    assert body["risk_level"] == "HIGH"
    assert 0 <= body["confidence"] <= 1


def test_accuracy_on_holdout_set(predict_url):
    _, X_test, _, y_test = split_dataset(load_dataset())
    positives = X_test[y_test == 1]
    negatives = X_test[y_test == 0].sample(NEGATIVE_SAMPLE_SIZE, random_state=42)
    assert len(positives) > 0

    def flagged(rows):
        return sum(
            post(predict_url, row_payload(row))[1]["is_anomaly"]
            for _, row in rows.iterrows()
        )

    true_positives = flagged(positives)
    false_positives = flagged(negatives)
    recall = true_positives / len(positives)
    accuracy = (true_positives + len(negatives) - false_positives) / (len(positives) + len(negatives))
    assert recall >= MIN_RECALL
    assert accuracy >= MIN_ACCURACY


STATIONS = pd.read_csv(DEMO).to_dict("records")


@pytest.mark.parametrize("station", STATIONS, ids=[s["station_code"] for s in STATIONS])
def test_demo_station_prediction(predict_url, station):
    status, body = post(predict_url, row_payload(station))
    assert status == 200
    assert body["is_anomaly"] is bool(station[TARGET])


@pytest.mark.parametrize("field, value", [
    ("latency_ms", 0),
    ("latency_ms", -1),
    ("latency_ms", "abc"),
    ("latency_ms", float("nan")),
    ("packet_loss_rate", -0.1),
    ("packet_loss_rate", 100.1),
    ("jitter_ms", -1),
    ("throughput_mbps", -1),
    ("throughput_mbps", float("inf")),
])
def test_invalid_kpi_rejected(predict_url, field, value):
    status, _ = post(predict_url, {**SAMPLE, field: value})
    assert status == 422


@pytest.mark.parametrize("field", KPI_COLUMNS)
def test_missing_kpi_rejected(predict_url, field):
    payload = {name: value for name, value in SAMPLE.items() if name != field}
    status, _ = post(predict_url, payload)
    assert status == 422


@pytest.mark.parametrize("payload", [
    {"latency_ms": 0.001, "packet_loss_rate": 0, "jitter_ms": 0, "throughput_mbps": 0},
    {"latency_ms": 10000, "packet_loss_rate": 100, "jitter_ms": 1000, "throughput_mbps": 10000},
])
def test_boundary_values_accepted_and_consistent(predict_url, payload):
    status, body = post(predict_url, payload)
    assert status == 200
    assert 0 <= body["confidence"] <= 1
    assert body["risk_level"] in {"LOW", "MEDIUM", "HIGH"}
    assert (body["risk_level"] == "HIGH") == body["is_anomaly"]
