"""Kiểm tra tính toàn vẹn chuỗi NIST. Tác giả: Nguyễn Thị Thanh Thủy."""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_sequence import FEATURES, prepare


@pytest.fixture
def source():
    rows = []
    for tranche in ("A", "B"):
        for session in range(3):
            for run in range(2):
                for step in (0, 1, 2, 4, 5, 6, 7):
                    rows.append([tranche, session, str(run),
                                 pd.Timestamp("2023-01-01") + pd.Timedelta(seconds=step * 10),
                                 run, session * 100 + step, run + step, 1])
    return pd.DataFrame(rows, columns=[
        "tranche", "session_id", "run_id", "timestamp", "label", *FEATURES
    ])


def test_windows_are_contiguous_and_stay_inside_runs(source):
    arrays, info = prepare(source.sample(frac=1, random_state=3), window=3, stride=2)
    assert info["discontinuities"] == 12
    for split in ("train", "val", "test"):
        x = arrays[f"X_{split}"]
        keys = arrays[f"keys_{split}"]
        times = arrays[f"time_ns_{split}"]
        assert x.shape == (len(keys), 3, 3)
        assert x.dtype == np.float32
        assert np.isfinite(x).all()
        assert (np.diff(times, axis=1) == 10_000_000_000).all()
        assert set(times[:, 0] % 60_000_000_000) == {0, 40_000_000_000}
        np.testing.assert_array_equal(arrays[f"y_{split}"], keys[:, 2].astype(int))
        for key, window in zip(keys, x):
            rows = source[(source.tranche == key[0]) & (source.session_id == int(key[1]))
                          & (source.run_id == key[2])]
            restored = window * info["scale"] + info["mean"]
            assert all(np.isclose(rows.latency, point, atol=1e-5).any() for point in restored[:, 0])


def test_split_and_scaler_use_train_only(source):
    arrays, info = prepare(source, window=3)
    groups = {name: {tuple(k) for k in stats["sessions"]}
              for name, stats in info["splits"].items()}
    assert not (groups["train"] & groups["val"] or groups["train"] & groups["test"]
                or groups["val"] & groups["test"])
    train = source[[key in groups["train"] for key in zip(source.tranche, source.session_id)]]
    np.testing.assert_allclose(info["mean"], train[FEATURES].mean())
    np.testing.assert_allclose(info["scale"], [*train[FEATURES[:2]].std(ddof=0), 1])
    for split in groups:
        assert {(k[0], int(k[1])) for k in arrays[f"keys_{split}"]} == groups[split]


@pytest.mark.parametrize("issue", ["duplicate", "null", "infinite", "label", "schema"])
def test_rejects_invalid_input(source, issue):
    if issue == "duplicate":
        source = pd.concat([source, source.iloc[:1]])
    elif issue == "null":
        source.loc[0, "timestamp"] = None
    elif issue == "infinite":
        source["latency"] = source["latency"].astype(float)
        source.loc[0, "latency"] = np.inf
    elif issue == "label":
        source.loc[0, "label"] = 1
    else:
        source = source.drop(columns="throughput")
    with pytest.raises(ValueError):
        prepare(source, window=3)


def test_no_windows_fails_clearly(source):
    with pytest.raises(ValueError, match="không có cửa sổ"):
        prepare(source, window=30)
