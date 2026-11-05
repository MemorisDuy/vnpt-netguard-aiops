"""Quality contract for real NIST features; missing requested KPIs stay explicit."""
from pathlib import Path
import importlib.util
import json

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "ai-service" / "data"
spec = importlib.util.spec_from_file_location("clean_data", ROOT / "ai-service" / "clean_data.py")
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


@pytest.fixture(scope="module")
def clean():
    assert (DATA / "clean_data.csv").is_file(), "Run python ai-service/clean_data.py"
    return pd.read_csv(DATA / "clean_data.csv")


def test_nonempty_complete_and_unique(clean):
    assert len(clean) > 0
    assert not clean.isna().any().any()
    assert not clean.duplicated(["tranche", "session_id", "run_id", "timestamp"]).any()
    assert np.isfinite(clean.select_dtypes(include="number")).all().all()


def test_kpi_ranges(clean):
    assert clean.latency.between(0, 10000, inclusive="right").all()
    assert clean.throughput.ge(0).all()
    assert clean.latency_change_ms.between(0, 10000).all()
    assert clean.sample_count.ge(1).all()
    for column in ("packet_loss_rate", "packet_loss"):
        if column in clean:
            assert clean[column].between(0, 100).all()
    if "jitter" in clean:
        assert clean.jitter.ge(0).all()


def test_features_and_labels(clean):
    np.testing.assert_allclose(clean.latency_log1p, np.log1p(clean.latency), rtol=1e-7)
    np.testing.assert_allclose(clean.throughput_log1p, np.log1p(clean.throughput), rtol=1e-7)
    assert set(clean.label) == {0, 1}
    assert (clean.label == clean.run_id.str.startswith("cipheroff").astype(int)).all()
    pd.to_datetime(clean.timestamp, errors="raise")


def test_missing_measurements_are_disclosed(clean):
    report = json.loads((DATA / "quality_report.json").read_text())
    assert report["output_rows"] == len(clean)
    assert report["missing_kpis"] == ["packet_loss_rate", "jitter"]
    assert report["complete_requested_kpi_contract"] is False
    assert "packet_loss_rate" not in clean and "jitter" not in clean


def test_source_provenance(clean):
    report = json.loads((DATA / "quality_report.json").read_text())
    metadata = json.loads((DATA / "nist_metadata.json").read_text())
    for source in report["sources"]:
        item = next(c for c in metadata["components"]
                    if c.get("filepath", "").endswith(source["archive"]))
        assert source["sha256"] == item["checksum"]["hash"]
        assert (DATA / source["archive"]).stat().st_size == item["size"]
        assert source["files"] > 0
    assert set(clean.tranche) == {s["archive"][8] for s in report["sources"]}


def test_dirty_rows_and_unit_conversion():
    raw = pd.DataFrame({"#State": [0, 0, 1, 0, 0, 0],
        "Time": ["12:00:00:000", "12:00:01:000", "12:00:02:000", "bad", "12:00:03:000", "12:00:04:000"],
        "UE ID": [1]*6, "Aggregate Mean SDU Latency(mS)": [2, 4, 5, 6, -1, np.nan],
        "Aggregate SDU Throughput(Kbps)": [1000]*6})
    result = pipeline.clean_measurements(raw)
    assert len(result) == 1
    assert result.iloc[0].latency == 3
    assert result.iloc[0].throughput == 1
    assert result.iloc[0].latency_change_ms == 2


def test_missing_schema_fails():
    with pytest.raises(ValueError, match="Missing source columns"):
        pipeline.clean_measurements(pd.DataFrame({"latency": [1]}))


def test_midnight_and_nonfinite_values():
    raw = pd.DataFrame({"#State": [0]*5,
        "Time": ["23:59:59:000", "00:00:00:000", "00:00:01:000", "00:00:02:000", "00:00:03:000"],
        "UE ID": [1]*5, "Aggregate Mean SDU Latency(mS)": [2, 4, 6, np.inf, 8],
        "Aggregate SDU Throughput(Kbps)": [1000, 1000, 1000, 1000, -1]})
    result = pipeline.clean_measurements(raw)
    assert result.bucket.tolist() == [86400]
    assert result.iloc[0].latency == 5
    assert result.iloc[0].latency_change_ms == 2
    assert result.iloc[0].sample_count == 2
