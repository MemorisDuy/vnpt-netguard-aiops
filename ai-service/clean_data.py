# ==============================================================================
# PIPELINE: TIỀN XỬ LÝ & LÀM SẠCH DỮ LIỆU VIỄN THÔNG (NIST RAN & STATION KPIS)
# Đề tài N3.2: Hệ thống dự báo khu vực có nguy cơ suy giảm chất lượng mạng
# Phụ trách phát triển: Nguyễn Thị Thanh Thúy (Data Engineer & Data QA)
# ==============================================================================

from pathlib import Path
import argparse
import hashlib
import json
import re
import sys
import zipfile

import numpy as np
import pandas as pd

# Đường dẫn thư mục gốc dịch vụ AI và thư mục dữ liệu
SERVICE = Path(__file__).resolve().parent
DATA = SERVICE / "data"
DEMO = SERVICE / "tests" / "fixtures" / "station_demo.csv"

# Danh mục các cột KPI đo đạc mạng viễn thông cốt lõi
KPI_COLUMNS = ["latency_ms", "packet_loss_rate", "jitter_ms", "throughput_mbps"]
TARGET = "is_anomaly"

# Bản đồ ánh xạ tên cột gốc từ file đo NIST RAN sang tên cột chuẩn hóa
RENAME = {
    "UE ID": "ue_id",
    "Aggregate Mean SDU Latency(mS)": "latency",
    "Aggregate SDU Throughput(Kbps)": "throughput"
}


def clean_measurements(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Hàm làm sạch dữ liệu đo đạc thô theo chu kỳ 10 giây:
    - Loại bỏ các dòng trạng thái lỗi (#State != 0).
    - Lọc bỏ giá trị khuyết thiếu (NaN, Inf) và ngoại lai vô lý.
    - Xử lý thời gian đo đạc vượt qua mốc nửa đêm (midnight crossing).
    - Tính toán độ lệch trễ (latency_change_ms) giữa các chu kỳ đo.
    - Tổng hợp mẫu (aggregation) trung bình theo khoảng thời gian 10 giây.
    - Chuyển đổi đơn vị băng thông từ Kbps sang Mbps.
    """
    frame = raw.rename(columns=RENAME).copy()
    required = ["#State", "Time", "ue_id", "latency", "throughput"]
    if not set(required) <= set(frame):
        raise ValueError(f"Missing source columns: {set(required) - set(frame)}")

    frame = frame[required].drop_duplicates()
    for col in ["#State", "ue_id", "latency", "throughput"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")

    frame = frame.replace([np.inf, -np.inf], np.nan).dropna()
    frame = frame[
        (frame["#State"] == 0)
        & (frame.ue_id >= 0)
        & (frame.ue_id % 1 == 0)
        & (frame.latency >= 0)
        & (frame.latency <= 10000)
        & (frame.throughput >= 0)
    ].copy()

    times = pd.to_datetime(frame.Time, format="%H:%M:%S:%f", errors="coerce")
    frame["seconds"] = (
        times.dt.hour * 3600
        + times.dt.minute * 60
        + times.dt.second
        + times.dt.microsecond / 1e6
    )
    frame = frame.dropna(subset=["seconds"])

    # Xử lý các lượt đo vượt mốc nửa đêm (00:00:00)
    frame["seconds"] += frame.seconds.diff().lt(-43200).cumsum() * 86400
    frame = frame.sort_values(["ue_id", "seconds"], kind="stable")
    frame["latency_change_ms"] = frame.groupby("ue_id").latency.diff().abs()

    # Nhóm theo bucket 10 giây
    frame["bucket"] = (frame.seconds // 10).astype(int) * 10
    grouped = frame.groupby("bucket").agg(
        latency=("latency", "mean"),
        throughput=("throughput", "mean"),
        latency_change_ms=("latency_change_ms", "mean"),
        sample_count=("ue_id", "size")
    )
    grouped = grouped.replace([np.inf, -np.inf], np.nan).dropna()
    grouped = grouped[grouped.latency > 0].reset_index()

    # Đổi đơn vị Kbps sang Mbps
    grouped["throughput"] /= 1000
    grouped["latency_log1p"] = np.log1p(grouped.latency)
    grouped["throughput_log1p"] = np.log1p(grouped.throughput)
    return grouped


def clean_station_data(raw: pd.DataFrame) -> pd.DataFrame:
    """
    Tiền xử lý và kiểm định chất lượng dữ liệu đo đạc trạm viễn thông (Station KPIs):
    - Kiểm tra bắt buộc có đủ các cột KPI và cột nhãn mục tiêu is_anomaly.
    - Lọc bỏ các dòng chứa NaN hoặc giá trị vô hạn (Inf).
    - Kiểm định ranh giới viễn thông hợp lệ:
      + latency_ms > 0
      + 0 <= packet_loss_rate <= 100
      + jitter_ms >= 0
      + throughput_mbps >= 0
      + is_anomaly thuộc {0, 1}
    """
    for col in KPI_COLUMNS + [TARGET]:
        if col not in raw.columns:
            raise ValueError(f"Missing required column: {col}")

    df = raw.copy()
    for col in KPI_COLUMNS + [TARGET]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Loại bỏ NaN và vô hạn
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=KPI_COLUMNS + [TARGET])

    # Kiểm tra ranh giới miền giá trị hợp lệ
    valid = (
        (df["latency_ms"] > 0)
        & (df["packet_loss_rate"] >= 0)
        & (df["packet_loss_rate"] <= 100)
        & (df["jitter_ms"] >= 0)
        & (df["throughput_mbps"] >= 0)
        & (df[TARGET].isin([0, 1]))
    )
    clean = df[valid].copy()
    clean[TARGET] = clean[TARGET].astype(int)
    return clean


def verify_archive(path, metadata):
    item = next(c for c in metadata["components"] if c.get("filepath", "").endswith(path.name))
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != item["checksum"]["hash"] or path.stat().st_size != item["size"]:
        raise ValueError(f"NIST checksum/size mismatch: {path}")
    return digest


def main():
    parser = argparse.ArgumentParser(description="Pipeline tiền xử lý dữ liệu viễn thông NIST RAN & Trạm phát sóng")
    parser.add_argument("--data-dir", type=Path, default=DATA)
    parser.add_argument("--demo", action="store_true", help="Chạy chế độ DEMO từ file mẫu fixtures")
    parser.add_argument("--input", type=Path, default=None, help="Đường dẫn file đo đạc trạm đầu vào cần làm sạch")
    parser.add_argument("--tranches", nargs="+", choices=list("ABC"), default=list("ABC"))
    args = parser.parse_args()

    data_dir = args.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)

    # 1. Chế độ DEMO
    if args.demo:
        if not DEMO.is_file():
            sys.stderr.write(f"Khong tim thay file demo tai {DEMO}\n")
            sys.exit(1)
        raw_demo = pd.read_csv(DEMO)
        cleaned_demo = clean_station_data(raw_demo)
        output_demo = data_dir / "demo_clean_data.csv"
        cleaned_demo.to_csv(output_demo, index=False)
        print(f"[DEMO] Da xuat thanh cong {len(cleaned_demo)} dong du lieu demo ra {output_demo}", flush=True)
        return

    # 2. Chế độ làm sạch file trạm đầu vào tuỳ chọn
    if args.input:
        if not args.input.is_file():
            sys.stderr.write(f"Khong tim thay file dau vao {args.input}\n")
            sys.exit(1)
        raw_input = pd.read_csv(args.input)
        cleaned_input = clean_station_data(raw_input)
        output_station = data_dir / "station_clean_data.csv"
        cleaned_input.to_csv(output_station, index=False)
        print(f"[STATION] Da lam sach thanh cong {len(cleaned_input)} dong ra {output_station}", flush=True)
        return

    # 3. Chế độ xử lý toàn bộ tập dữ liệu NIST RAN
    meta_file = data_dir / "nist_metadata.json"
    archives = [data_dir / f"Tranche_{t}.zip" for t in dict.fromkeys(args.tranches)]
    missing = [p.name for p in archives if not p.is_file()]

    if not meta_file.is_file() or missing:
        sys.stderr.write(
            f"Thieu file nist_metadata.json hoac cac tep nen {missing}. "
            "Vui long chay download_data.py de tai metadata va du lieu NIST RAN truoc.\n"
        )
        sys.exit(2)

    metadata = json.loads(meta_file.read_text(encoding="utf-8"))
    results, sources = [], []
    raw_rows = 0

    for archive in archives:
        digest = verify_archive(archive, metadata)
        files = 0
        with zipfile.ZipFile(archive) as zipped:
            for name in sorted(zipped.namelist()):
                match = re.search(
                    r"Tranche_([ABC])/Session_(\d+)/(cipher(?:off|on)_\d+)/traffic_generator/(\d{6})_\d+_UECOMBINED_RLCTXSTATS_ALL.csv$",
                    name
                )
                if not match:
                    continue
                with zipped.open(name) as stream:
                    raw = pd.read_csv(stream, low_memory=False)
                raw_rows += len(raw)
                cleaned = clean_measurements(raw)
                if cleaned.empty:
                    continue
                tranche, session, run, day = match.groups()
                cleaned["timestamp"] = (
                    pd.to_datetime(day, format="%y%m%d")
                    + pd.to_timedelta(cleaned.pop("bucket"), unit="s")
                ).dt.strftime("%Y-%m-%dT%H:%M:%S")
                cleaned["tranche"] = tranche
                cleaned["session_id"] = int(session)
                cleaned["run_id"] = run
                cleaned["label"] = int(run.startswith("cipheroff"))
                results.append(cleaned)
                files += 1
        sources.append({"archive": archive.name, "sha256": digest, "files": files})
        print(f"Processed {archive.name}: {files} measurement files", flush=True)

    if not results:
        sys.stderr.write("Khong tim thay du lieu hop le trong file nen NIST\n")
        sys.exit(1)

    output = pd.concat(results, ignore_index=True).sort_values(
        ["tranche", "session_id", "run_id", "timestamp"]
    ).drop_duplicates()
    output.to_csv(data_dir / "clean_data.csv", index=False, float_format="%.9g")
    print(f"Saved {len(output)} rows to {data_dir / 'clean_data.csv'}; nulls=0")


if __name__ == "__main__":
    main()
