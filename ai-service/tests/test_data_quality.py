"""Kiểm thử pipeline KPI mạng.

Tác giả: Nguyễn Thị Thanh Thúy
Vai trò: Data QA
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest

SERVICE = Path(__file__).resolve().parents[1]
SCRIPT = SERVICE / "clean_data.py"
spec = importlib.util.spec_from_file_location("clean_data", SCRIPT)
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def run_cli(tmp_path, *args):
    # Tạo đầu ra riêng cho mỗi ca, không phụ thuộc dữ liệu trên máy tác giả.
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--data-dir", str(tmp_path), *map(str, args)],
        capture_output=True, text=True, encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )


def test_demo_runs_without_nist_archives(tmp_path):
    result = run_cli(tmp_path, "--demo")
    assert result.returncode == 0, result.stderr
    assert "DEMO" in result.stdout
    output = pd.read_csv(tmp_path / "demo_clean_data.csv")
    assert len(output) == 7
    assert set(pipeline.KPI_COLUMNS + [pipeline.TARGET]) <= set(output)
    assert not (tmp_path / "clean_data.csv").exists()


def test_station_csv_end_to_end(tmp_path):
    source = tmp_path / "measured.csv"
    pd.DataFrame({
        "station_code": ["A", "A"], "timestamp": ["2026-01-01", "2026-01-02"],
        "latency_ms": [15, 90], "packet_loss_rate": [0, 100], "jitter_ms": [0, 17],
        "throughput_mbps": [100, 0], "is_anomaly": [False, True],
    }).to_csv(source, index=False)
    result = run_cli(tmp_path, "--input", source)
    assert result.returncode == 0, result.stderr
    output = pd.read_csv(tmp_path / "station_clean_data.csv")
    assert not output.isna().any().any()
    assert output.is_anomaly.tolist() == [0, 1]
    assert output.packet_loss_rate.tolist() == [0, 100]
    assert output.jitter_ms.tolist() == [0, 17]
    assert output.station_code.tolist() == ["A", "A"]
    assert output.timestamp.tolist() == ["2026-01-01", "2026-01-02"]


def test_invalid_kpis_and_labels_are_filtered():
    raw = pd.DataFrame([
        [20, 0, 0, 10, 0], [30, 100, 1, 0, 1], [0, 0, 0, 1, 1],
        [25, 101, 0, 1, 0], [25, -1, 0, 1, 0], [25, 0, -1, 1, 0],
        [25, 0, 0, -1, 0], [np.inf, 0, 0, 1, 0], [25, 0, np.nan, 1, 0],
        [25, 0, 0, 1, 2],
    ], columns=pipeline.KPI_COLUMNS + [pipeline.TARGET])
    clean = pipeline.clean_station_data(raw)
    assert clean.index.tolist() == [0, 1]


@pytest.mark.parametrize("column", ["packet_loss_rate", "jitter_ms", "is_anomaly"])
def test_required_station_columns(column):
    raw = pd.read_csv(pipeline.DEMO).drop(columns=column)
    with pytest.raises(ValueError, match=column):
        pipeline.clean_station_data(raw)


def test_nist_missing_files_explains_setup(tmp_path):
    result = run_cli(tmp_path)
    assert result.returncode == 2
    assert "download_data.py" in result.stderr
    assert "nist_metadata.json" in result.stderr
    assert "Traceback" not in result.stderr


def test_nist_midnight_and_invalid_rows():
    # Một lượt đo qua nửa đêm, có mẫu vô hạn và throughput âm.
    raw = pd.DataFrame({
        "#State": [0] * 5, "Time": ["23:59:59:000", "00:00:00:000", "00:00:01:000",
                                   "00:00:02:000", "00:00:03:000"],
        "UE ID": [1] * 5, "Aggregate Mean SDU Latency(mS)": [2, 4, 6, np.inf, 8],
        "Aggregate SDU Throughput(Kbps)": [1000, 1000, 1000, 1000, -1],
    })
    output = pipeline.clean_measurements(raw)
    assert output.bucket.tolist() == [86400]
    assert output.latency.tolist() == [5]
    assert output.throughput.tolist() == [1]
    assert output.latency_change_ms.tolist() == [2]
    assert output.sample_count.tolist() == [2]
