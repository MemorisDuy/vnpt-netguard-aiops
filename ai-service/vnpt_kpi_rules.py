"""Hourly Ericsson KPI and anomaly rules. Input timestamps are VNPT local time."""

import numpy as np
import pandas as pd


HEADERS = (
    "VENDOR PROVINCE VNP NODE_NAME CELL_NAME ENODEB_ID CELL_ID STA_DATETIME pmUeThpVolUl".split()
    + [f"pmRadioHomUeRepCqiDistr_{i}" for i in range(16)]
    + """pmRrcConnEstabSucc pmRrcConnEstabAttReatt pmErabRelAbnormalEnbAct
    pmRrcConnEstabAtt pmErabRelAbnormalMmeAct pmS1SigConnEstabSucc pmS1SigConnEstabAtt
    pmErabEstabSuccInit pmErabRelAbnormalEnb pmErabEstabAttInit pmPdcpVolUlDrb
    pmErabRelNormalEnb pmErabRelMme pmHoPrepSuccLteIntraF pmHoPrepAttLteIntraF
    pmHoExeSuccLteIntraF pmHoExeAttLteIntraF pmPdcpVolDlDrb pmUeThpTimeUl
    pmPdcpVolDlDrbLastTTI pmUeThpTimeDl""".split()
    + [f"pmRadioUeRepCqiDistr_{i}" for i in range(16)]
)

CELL, HOUR = "CELL_NAME", "STA_DATETIME"
WEIGHTED = (
    "rrcfailure", "s1signallingfailure", "erabfailure", "hoprepfailure",
    "hoexefailure", "erabrelabnormal",
)
A4_FLAGS = ["A4_rrcincrease", *(f"A4_{name}" for name in WEIGHTED)]


def ratio(numerator, denominator):
    """Treat undefined and negative counter ratios as missing."""
    return numerator.where(numerator.ge(0)).div(denominator.where(denominator.gt(0)))


def weekly_mean(frame, column, samples):
    # Join by exact weekly offsets to avoid skipping a missing historical hour.
    index = pd.MultiIndex.from_frame(frame[[CELL, HOUR]])
    lookup = pd.Series(frame[column].to_numpy(), index=index)
    history = pd.concat(
        [
            pd.Series(lookup.reindex(pd.MultiIndex.from_arrays(
                [frame[CELL], frame[HOUR] - pd.Timedelta(weeks=week)]
            )).to_numpy(), index=frame.index)
            for week in range(1, samples + 1)
        ],
        axis=1,
    )
    return history.mean(axis=1, skipna=False)


def consecutive(frame, matches, hours):
    same_cell = frame[CELL].eq(frame[CELL].shift())
    next_hour = frame[HOUR].diff().eq(pd.Timedelta(hours=1))
    streak = (~(matches & same_cell & next_hour)).cumsum()
    return matches.astype(int).groupby(streak).cumsum().ge(hours)


def a1_flags(traffic, cssr, drop, traffic_pct, thput_pct):
    """Use the workbook's explicit intervals. Shared endpoints are assigned once."""
    low = traffic.lt(0.1)
    small = traffic.ge(0.1) & traffic.lt(1)
    medium = traffic.between(1, 5)
    large = traffic.gt(5)
    return pd.DataFrame({
        "anomaly_cssr": (
            (large & cssr.lt(95)) | (medium & cssr.between(90, 95))
            | (small & cssr.between(75, 90)) | (low & cssr.lt(75))
        ),
        "anomaly_service_drop_all": (
            (large & drop.gt(5)) | (medium & drop.between(5, 10))
            | (small & drop.between(10, 20)) | (low & drop.gt(20))
        ),
        "anomaly_traffic_down": (
            (traffic.gt(7) & traffic_pct.lt(10))
            | (traffic.between(3, 7) & traffic_pct.between(5, 10))
            | (traffic.ge(1) & traffic.lt(3) & traffic_pct.between(2, 5))
        ),
        "anomaly_traffic_up": (
            (traffic.gt(3) & traffic_pct.gt(450))
            | (traffic.between(0.5, 3) & traffic_pct.between(450, 1000))
            | (traffic.lt(0.5) & traffic_pct.gt(1000))
        ),
        "anomaly_user_dl_avg_thput": (
            (traffic.gt(10) & thput_pct.lt(30))
            | (traffic.gt(5) & traffic.le(10) & thput_pct.between(20, 30))
            | (traffic.gt(2) & traffic.le(5) & thput_pct.between(10, 20))
            | (traffic.between(1, 2) & thput_pct.between(5, 10))
            | (traffic.lt(1) & thput_pct.lt(5))
        ),
    })


def evaluate(raw):
    """Return one result per cell-hour, sorted by cell and time."""
    if raw.columns.tolist() != HEADERS:
        raise ValueError("Expected the 62 Ericsson columns in workbook order")
    frame = raw.copy()
    if frame[HEADERS[:8]].isna().any().any():
        raise ValueError("Missing cell identity or timestamp")
    timestamps = frame[HOUR]
    if not pd.api.types.is_datetime64_any_dtype(timestamps):
        timestamps = timestamps.astype(str)
        iso = timestamps.str.match(r"^\d{4}-\d{2}-\d{2}")
        frame[HOUR] = pd.to_datetime(timestamps.where(~iso), format="mixed", dayfirst=True)
        frame.loc[iso, HOUR] = pd.to_datetime(timestamps[iso], format="ISO8601")
    if not frame[HOUR].eq(frame[HOUR].dt.floor("h")).all():
        raise ValueError("Expected timestamps aligned to the hour")
    if frame.duplicated([CELL, HOUR]).any():
        raise ValueError("Duplicate cell-hour")
    frame = frame.sort_values([CELL, HOUR]).reset_index(drop=True)
    frame[HEADERS[8:]] = frame[HEADERS[8:]].apply(pd.to_numeric)
    c = frame
    rrc = c.pmRrcConnEstabAtt - c.pmRrcConnEstabAttReatt
    release = c.pmErabRelNormalEnb + c.pmErabRelMme
    out = frame[HEADERS[1:2] + HEADERS[3:8]].copy()
    out["province_code"] = c[CELL].str[-3:]
    out["cssr"] = 100 * (
        ratio(c.pmRrcConnEstabSucc, rrc)
        * ratio(c.pmS1SigConnEstabSucc, c.pmS1SigConnEstabAtt)
        * ratio(c.pmErabEstabSuccInit, c.pmErabEstabAttInit)
    )
    out["service_drop_all"] = 100 * ratio(
        c.pmErabRelAbnormalEnbAct + c.pmErabRelAbnormalMmeAct, release
    )
    # Working unit assumptions: PDCP volume in kbit and throughput time in ms.
    out["traffic_gb"] = (c.pmPdcpVolDlDrb + c.pmPdcpVolUlDrb) / 8_000_000
    out["user_dl_avg_thput"] = ratio(
        c.pmPdcpVolDlDrb - c.pmPdcpVolDlDrbLastTTI, c.pmUeThpTimeDl
    )
    for kpi, percent in (
        ("traffic_gb", "traffic_percent_hour"),
        ("user_dl_avg_thput", "user_dl_avg_thput_percent_hour"),
    ):
        out[percent] = 100 * ratio(out[kpi], weekly_mean(out, kpi, 12))

    flags = a1_flags(
        out.traffic_gb, out.cssr, out.service_drop_all,
        out.traffic_percent_hour, out.user_dl_avg_thput_percent_hour,
    )
    out = out.join(flags)
    out["a1_rule_vh"] = flags.iloc[:, :3].any(axis=1)
    out["a1_rule_kt"] = flags.iloc[:, 3:].any(axis=1)
    out["a1_ready"] = out[[
        "cssr", "service_drop_all", "traffic_gb", "traffic_percent_hour",
        "user_dl_avg_thput_percent_hour",
    ]].notna().all(axis=1)
    out["is_anomaly"] = out.a1_rule_vh | out.a1_rule_kt

    peak = c[HOUR].dt.hour.between(6, 22)
    attempts = c.pmRrcConnEstabAtt
    rrc_ratio = ratio(attempts, weekly_mean(c, "pmRrcConnEstabAtt", 8))
    threshold = np.select(
        [attempts.gt(n) for n in (50_000, 25_000, 10_000, 5_000, 1_000)]
        + [attempts.ge(500)],
        [1.5, 2, 2.5, 4, 8, 15], default=np.nan,
    )
    out["A4_rrcincrease"] = consecutive(c, peak & rrc_ratio.gt(threshold), 8)
    inputs = {
        "rrcfailure": (rrc - c.pmRrcConnEstabSucc, rrc),
        "s1signallingfailure": (
            c.pmS1SigConnEstabAtt - c.pmS1SigConnEstabSucc, c.pmS1SigConnEstabAtt
        ),
        "erabfailure": (c.pmErabEstabAttInit - c.pmErabEstabSuccInit, c.pmErabEstabAttInit),
        "hoprepfailure": (c.pmHoPrepAttLteIntraF - c.pmHoPrepSuccLteIntraF, c.pmHoPrepAttLteIntraF),
        "hoexefailure": (c.pmHoExeAttLteIntraF - c.pmHoExeSuccLteIntraF, c.pmHoExeAttLteIntraF),
        "erabrelabnormal": (c.pmErabRelAbnormalEnbAct, release),
    }
    for name, (failures, denominator) in inputs.items():
        weight = (100 * failures * ratio(failures, denominator)).where(peak)
        ranked = weight.groupby([out.province_code, c[HOUR]])
        rank = ranked.rank(method="first", ascending=False)
        cutoff = np.ceil(ranked.transform("count") / 10)
        out[f"{name}weight"] = weight
        out[f"A4_{name}"] = consecutive(c, weight.gt(0) & rank.le(cutoff), 6)
    return out.rename(columns=str.lower).rename(columns={flag.lower(): flag for flag in A4_FLAGS})
