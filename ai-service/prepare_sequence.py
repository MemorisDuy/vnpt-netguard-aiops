"""Chuẩn bị chuỗi NIST RAN cho học sâu. Tác giả: Nguyễn Thị Thanh Thủy."""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent / "data"
FEATURES = ["latency", "throughput", "latency_change_ms"]
SESSION = ["tranche", "session_id"]
RUN = SESSION + ["run_id"]


def prepare(frame, window=12, stride=1, step_seconds=10, seed=42):
    """Chia theo phiên, cắt tại khoảng khuyết và chuẩn hóa từ train."""
    if min(window, stride, step_seconds) < 1:
        raise ValueError("window, stride và step_seconds phải dương")
    columns = RUN + ["timestamp", "label"] + FEATURES
    missing = set(columns) - set(frame)
    if missing:
        raise ValueError(f"Thiếu cột: {sorted(missing)}")
    frame = frame[columns].copy()
    frame["timestamp"] = pd.to_datetime(frame.timestamp, format="ISO8601", utc=True)
    if frame.isna().any().any() or not np.isfinite(frame[FEATURES]).all().all():
        raise ValueError("Có dữ liệu thiếu hoặc vô hạn")
    if not frame.label.isin([0, 1]).all():
        raise ValueError("Nhãn NIST phải là 0 hoặc 1")
    if frame.duplicated(RUN + ["timestamp"]).any():
        raise ValueError("Trùng thời điểm trong lượt đo")

    sessions = sorted(set(frame[SESSION].itertuples(index=False, name=None)))
    if len(sessions) < 3:
        raise ValueError("Cần ít nhất ba phiên để chia train/val/test")
    order = np.random.default_rng(seed).permutation(len(sessions))
    held_out_count = max(1, round(len(sessions) * 0.15))
    session_split = {}
    for name, indices in zip(("test", "val", "train"), np.split(order, [held_out_count, 2 * held_out_count])):
        session_split.update({sessions[i]: name for i in indices})

    # Tính mean và scale trên từng dòng train trước khi các cửa sổ chồng lấn.
    train_mask = [session_split[key] == "train"
                  for key in frame[SESSION].itertuples(index=False, name=None)]
    train = frame.loc[train_mask, FEATURES].to_numpy(dtype=np.float64)
    mean = train.mean(axis=0)
    scale = train.std(axis=0)
    scale[scale == 0] = 1

    windows = {name: [] for name in ("train", "val", "test")}
    gaps = 0
    step = pd.Timedelta(seconds=step_seconds)
    for run_key, run in frame.groupby(RUN):
        run = run.sort_values("timestamp")
        if run.label.nunique() != 1:
            raise ValueError(f"Nhãn thay đổi trong lượt đo {run_key}")
        # Bắt đầu đoạn mới khi hai mẫu liền kề lệch nhịp đo.
        gap_mask = run.timestamp.diff().iloc[1:].ne(step).to_numpy()
        cuts = np.flatnonzero(gap_mask) + 1
        gaps += len(cuts)
        split = session_split[run_key[:2]]
        values = run[FEATURES].to_numpy(dtype=np.float64)
        times = run.timestamp.astype("int64").to_numpy()
        label = int(run.label.iloc[0])
        segment_edges = [0, *cuts, len(run)]
        for start, stop in zip(segment_edges, segment_edges[1:]):
            for offset in range(start, stop - window + 1, stride):
                sample = slice(offset, offset + window)
                windows[split].append((values[sample], label, run_key, times[sample]))

    arrays, stats = {}, {}
    for split, items in windows.items():
        if not items:
            raise ValueError(f"Tập {split} không có cửa sổ hợp lệ")
        features, labels, keys, times = zip(*items)
        arrays[f"X_{split}"] = ((np.stack(features) - mean) / scale).astype(np.float32)
        if not np.isfinite(arrays[f"X_{split}"]).all():
            raise ValueError(f"Chuẩn hóa tạo giá trị vô hạn ở tập {split}")
        arrays[f"y_{split}"] = np.asarray(labels, dtype=np.int64)
        arrays[f"keys_{split}"] = np.asarray(keys, dtype=str)
        arrays[f"time_ns_{split}"] = np.stack(times)
        stats[split] = {
            "shape": list(arrays[f"X_{split}"].shape),
            "labels": np.bincount(labels, minlength=2).tolist(),
            "sessions": [list(key) for key in sessions if session_split[key] == split],
        }
    metadata = {
        "features": FEATURES, "mean": mean.tolist(), "scale": scale.tolist(),
        "window": window, "stride": stride, "step_seconds": step_seconds, "seed": seed,
        "input_rows": len(frame), "runs": frame.groupby(RUN).ngroups,
        "discontinuities": gaps, "splits": stats, "label": "0=cipheron, 1=cipheroff",
    }
    return arrays, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DATA / "clean_data.csv")
    parser.add_argument("--output-dir", type=Path, default=DATA / "sequences")
    parser.add_argument("--window", type=int, default=12)
    parser.add_argument("--stride", type=int, default=1)
    parser.add_argument("--step-seconds", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    try:
        arrays, metadata = prepare(pd.read_csv(args.input), args.window, args.stride,
                                   args.step_seconds, args.seed)
        args.output_dir.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(args.output_dir / "nist_sequences.npz", **arrays)
        (args.output_dir / "sequence_metadata.json").write_text(
            json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(2, f"Lỗi dữ liệu chuỗi: {exc}\n")
    for split, details in metadata["splits"].items():
        print(split, details["shape"], details["labels"])


if __name__ == "__main__":
    main()
