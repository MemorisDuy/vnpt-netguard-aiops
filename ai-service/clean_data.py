"""Clean official NIST RAN RLCTX time series without inventing missing KPIs."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent / "data"
RENAME = {"UE ID": "ue_id", "Aggregate Mean SDU Latency(mS)": "latency",
          "Aggregate SDU Throughput(Kbps)": "throughput"}


def clean_measurements(raw):
    """Keep valid observations; no cross-run imputation or future-data leakage."""
    frame = raw.rename(columns=RENAME).copy()
    required = ["#State", "Time", "ue_id", "latency", "throughput"]
    if not set(required) <= set(frame):
        raise ValueError(f"Missing source columns: {set(required) - set(frame)}")
    frame = frame[required].drop_duplicates()
    for col in ["#State", "ue_id", "latency", "throughput"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna()
    frame = frame[(frame["#State"] == 0) & (frame.ue_id >= 0)
                  & (frame.ue_id % 1 == 0) & (frame.latency >= 0)
                  & (frame.latency <= 10000) & (frame.throughput >= 0)].copy()
    times = pd.to_datetime(frame.Time, format="%H:%M:%S:%f", errors="coerce")
    frame["seconds"] = (times.dt.hour * 3600 + times.dt.minute * 60
                        + times.dt.second + times.dt.microsecond / 1e6)
    frame = frame.dropna(subset=["seconds"])
    # Logging files can cross midnight; retain acquisition order before sorting.
    frame["seconds"] += (frame.seconds.diff().lt(-43200).cumsum() * 86400)
    frame = frame.sort_values(["ue_id", "seconds"], kind="stable")
    frame["latency_change_ms"] = frame.groupby("ue_id").latency.diff().abs()
    # First sample has no previous observation: exclude from change aggregation.
    frame["bucket"] = (frame.seconds // 10).astype(int) * 10
    grouped = frame.groupby("bucket").agg(
        latency=("latency", "mean"), throughput=("throughput", "mean"),
        latency_change_ms=("latency_change_ms", "mean"),
        sample_count=("ue_id", "size"))
    grouped = grouped.replace([np.inf, -np.inf], np.nan).dropna()
    grouped = grouped[grouped.latency > 0].reset_index()
    grouped["throughput"] /= 1000  # Kbps -> Mbps; mean per UE observation.
    grouped["latency_log1p"] = np.log1p(grouped.latency)
    grouped["throughput_log1p"] = np.log1p(grouped.throughput)
    return grouped


def verify_archive(path, metadata):
    item = next(c for c in metadata["components"] if c.get("filepath", "").endswith(path.name))
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != item["checksum"]["hash"] or path.stat().st_size != item["size"]:
        raise ValueError(f"NIST checksum/size mismatch: {path}")
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA)
    parser.add_argument("--tranches", nargs="+", choices=list("ABC"), default=list("ABC"))
    args = parser.parse_args()
    data = args.data_dir
    metadata = json.loads((data / "nist_metadata.json").read_text())
    archives = [data / f"Tranche_{t}.zip" for t in dict.fromkeys(args.tranches)]
    missing = [p.name for p in archives if not p.is_file()]
    if missing:
        raise FileNotFoundError(f"Run download_data.py first; missing {missing}")
    results, sources = [], []
    raw_rows = 0
    for archive in archives:
        digest = verify_archive(archive, metadata)
        files = 0
        with zipfile.ZipFile(archive) as zipped:
            for name in sorted(zipped.namelist()):
                match = re.search(r"Tranche_([ABC])/Session_(\d+)/(cipher(?:off|on)_\d+)/traffic_generator/(\d{6})_\d+_UECOMBINED_RLCTXSTATS_ALL.csv$", name)
                if not match:
                    continue
                with zipped.open(name) as stream:
                    raw = pd.read_csv(stream, low_memory=False)
                raw_rows += len(raw)
                cleaned = clean_measurements(raw)
                if cleaned.empty:
                    continue
                tranche, session, run, day = match.groups()
                cleaned["timestamp"] = (pd.to_datetime(day, format="%y%m%d")
                    + pd.to_timedelta(cleaned.pop("bucket"), unit="s")).dt.strftime("%Y-%m-%dT%H:%M:%S")
                cleaned["tranche"] = tranche
                cleaned["session_id"] = int(session)
                cleaned["run_id"] = run
                cleaned["label"] = int(run.startswith("cipheroff"))
                results.append(cleaned)
                files += 1
        sources.append({"archive": archive.name, "sha256": digest, "files": files})
        print(f"Processed {archive.name}: {files} measurement files", flush=True)
    if not results:
        raise ValueError("No usable NIST measurements found")
    output = pd.concat(results, ignore_index=True).sort_values(
        ["tranche", "session_id", "run_id", "timestamp"]).drop_duplicates()
    if output.isna().any().any():
        raise ValueError("Unexpected missing output values")
    output.to_csv(data / "clean_data.csv", index=False, float_format="%.9g")
    report = {"sources": sources, "raw_rows": raw_rows, "output_rows": len(output),
              "missing_kpis": ["packet_loss_rate", "jitter"],
              "complete_requested_kpi_contract": False,
              "label_meaning": "1=cipheroff, 0=cipheron; NOT network degradation",
              "aggregation": "10-second mean per valid UE observation; zero-latency samples retained before aggregation"}
    (data / "quality_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Saved {len(output)} rows to {data / 'clean_data.csv'}; nulls=0")
    print("LIMITATION: no measured packet_loss_rate or jitter; see data/README.md")


if __name__ == "__main__":
    main()
