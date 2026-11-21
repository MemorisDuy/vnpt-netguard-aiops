from pathlib import Path
import sys

import pandas as pd
import pytest

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from generate_vnpt_simulated import TRAIN_START, VALIDATION_START, TEST_START, generate
from vnpt_kpi_etl import DB_COLUMNS, snapshot
from vnpt_kpi_rules import A4_FLAGS, HEADERS, a1_flags, consecutive, evaluate, weekly_mean


@pytest.fixture(scope="module")
def raw():
    return pd.read_csv(SERVICE / "data/vnpt_cell_simulated.csv")


@pytest.fixture(scope="module")
def history(raw):
    return evaluate(raw)


@pytest.mark.parametrize(
    "metric,traffic,cssr,drop,traffic_pct,thput_pct,expected",
    [
        ("cssr", 6, 94.99, 0, 100, 100, True),
        ("cssr", 6, 95, 0, 100, 100, False),
        ("service_drop_all", 6, 99, 5, 100, 100, False),
        ("service_drop_all", .5, 99, 15, 100, 100, True),
        ("traffic_down", 8, 99, 0, 9.99, 100, True),
        ("traffic_down", 8, 99, 0, 10, 100, False),
        ("traffic_up", 4, 99, 0, 450, 100, False),
        ("traffic_up", 4, 99, 0, 450.01, 100, True),
        ("user_dl_avg_thput", 11, 99, 0, 100, 30, False),
        ("user_dl_avg_thput", 11, 99, 0, 100, 29.99, True),
    ],
)
def test_a1_thresholds(metric, traffic, cssr, drop, traffic_pct, thput_pct, expected):
    inputs = (pd.Series([x]) for x in (traffic, cssr, drop, traffic_pct, thput_pct))
    assert bool(a1_flags(*inputs).loc[0, f"anomaly_{metric}"]) == expected


def test_weekly_baseline_ignores_current_and_requires_every_sample():
    hours = pd.date_range("2025-01-01 10:00", periods=13, freq="7D")
    frame = pd.DataFrame({"CELL_NAME": "A", "STA_DATETIME": hours, "value": range(1, 14)})
    assert weekly_mean(frame, "value", 12).iloc[-1] == 6.5
    assert pd.isna(weekly_mean(frame.drop(index=4), "value", 12).iloc[-1])


def test_streak_resets_at_gap_or_ineligible_hour():
    hours = pd.date_range("2025-01-01 06:00", periods=17, freq="h").delete(7)
    frame = pd.DataFrame({"CELL_NAME": "A", "STA_DATETIME": hours})
    eligible = pd.Series(True, index=frame.index)
    eligible.iloc[2] = False
    assert list(frame.loc[consecutive(frame, eligible, 6), "STA_DATETIME"].dt.hour) == [19, 20, 21, 22]


def test_raw_formulas(raw, history):
    assert raw.columns.tolist() == HEADERS
    assert len(HEADERS) == 62
    timestamp = TRAIN_START + pd.Timedelta(hours=159)
    cell = "SIM-01-11-SMA"
    result = history.loc[history.cell_name.eq(cell) & history.sta_datetime.eq(timestamp)].iloc[0]
    sample = raw.loc[
        raw.CELL_NAME.eq(cell) & raw.STA_DATETIME.eq(timestamp.strftime("%d/%m/%Y %H:%M:%S"))
    ].iloc[0]
    assert result.cssr == pytest.approx(100 * (27995 / 29995) * (26000 / 28000) * (24000 / 26000))
    assert result.service_drop_all == pytest.approx(100 * 270 / 1200)
    assert result.traffic_gb == pytest.approx((sample.pmPdcpVolDlDrb + sample.pmPdcpVolUlDrb) / 8e6)
    assert result.user_dl_avg_thput == pytest.approx(40, abs=.001)
    expected_weights = {
        "rrcfailure": 100 * 2000**2 / 29995,
        "s1signallingfailure": 100 * 2000**2 / 28000,
        "erabfailure": 100 * 2000**2 / 26000,
        "hoprepfailure": 100 * 180**2 / 250,
        "hoexefailure": 100 * 120**2 / 250,
        "erabrelabnormal": 100 * 180**2 / 1200,
    }
    for name, expected in expected_weights.items():
        assert result[f"{name}weight"] == pytest.approx(expected)


def test_a4_peak_and_per_province_streaks(history):
    hours = pd.date_range(TRAIN_START + pd.Timedelta(hours=159), periods=8, freq="h")
    end = history[history.sta_datetime.eq(hours[-1])]
    for flag in A4_FLAGS:
        assert set(end.loc[end[flag], "cell_name"]) == {"SIM-01-11-SMA", "SIM-03-11-SMB"}
        hits = history.loc[history[flag] & history.sta_datetime.isin(hours), "sta_datetime"]
        assert hits.min() == hours[7 if flag == "A4_rrcincrease" else 5]
    assert not history.loc[~history.sta_datetime.dt.hour.between(6, 22), A4_FLAGS].any().any()


def test_all_splits_have_all_five_anomalies(history):
    flags = [name for name in history if name.startswith("anomaly_")]
    assert not history.loc[history.sta_datetime.lt(TRAIN_START), "a1_ready"].any()
    for start in (TRAIN_START, VALIDATION_START, TEST_START):
        rows = history.loc[history.sta_datetime.ge(start) & history.sta_datetime.lt(start + pd.Timedelta(days=7))]
        assert rows.a1_ready.all()
        assert rows[flags].any().all()


def test_database_snapshot(tmp_path, history):
    coordinates = tmp_path / "coordinates.csv"
    generate(tmp_path / "raw.csv", coordinates)
    latest = snapshot(history, pd.read_csv(coordinates))
    assert latest.columns.tolist() == DB_COLUMNS
    assert latest.cell_name.is_unique
    assert set(latest.sta_datetime) == {history.sta_datetime.max()}
    assert latest.a4_flags.str.contains("A4_rrcincrease", regex=False).sum() == 2
    with pytest.raises(ValueError, match="coordinates"):
        snapshot(history, pd.read_csv(coordinates).iloc[1:])
