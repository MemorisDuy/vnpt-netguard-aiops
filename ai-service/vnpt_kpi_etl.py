"""Read an Ericsson workbook or CSV, export history and a database snapshot."""

import argparse
import os
from pathlib import Path
import subprocess

import pandas as pd

from vnpt_kpi_rules import A4_FLAGS, evaluate


SHEET = "PMS_4G_MN_Raw_Counter_ERICSSON"
DB_COLUMNS = """
node_name cell_name enodeb_id cell_id province province_code latitude longitude
cssr service_drop_all traffic_gb traffic_percent_hour user_dl_avg_thput
user_dl_avg_thput_percent_hour a1_rule_group a4_flags is_anomaly sta_datetime
""".split()


def snapshot(history, coordinates):
    latest = history.sort_values("sta_datetime").drop_duplicates("cell_name", keep="last").copy()
    latest = latest.merge(
        coordinates[["cell_name", "latitude", "longitude"]],
        on="cell_name", how="left", validate="one_to_one",
    )
    valid = latest.latitude.between(-90, 90) & latest.longitude.between(-180, 180)
    if not valid.all():
        raise ValueError("Missing or invalid coordinates for " + ", ".join(latest.loc[~valid, "cell_name"]))
    # The DB column holds one group. Operational alerts take precedence.
    latest["a1_rule_group"] = "NORMAL"
    latest.loc[~latest.a1_ready, "a1_rule_group"] = "INSUFFICIENT_DATA"
    latest.loc[latest.a1_rule_kt, "a1_rule_group"] = "A1_rule_kt"
    latest.loc[latest.a1_rule_vh, "a1_rule_group"] = "A1_rule_vh"
    latest["a4_flags"] = [
        "{" + ",".join(name for name, active in zip(A4_FLAGS, row) if active) + "}"
        for row in latest[A4_FLAGS].itertuples(index=False, name=None)
    ]
    return latest[DB_COLUMNS]


def load_snapshot(rows):
    """Use psql connection settings from the environment."""
    columns = ", ".join(DB_COLUMNS)
    updates = ", ".join(f"{name} = EXCLUDED.{name}" for name in DB_COLUMNS if name != "cell_name")
    sql = (
        "BEGIN;\n"
        "CREATE TEMP TABLE vnpt_import AS SELECT * FROM network_cells WITH NO DATA;\n"
        f"COPY vnpt_import ({columns}) FROM STDIN WITH (FORMAT csv, HEADER true);\n"
        + rows.to_csv(index=False, lineterminator="\n")
        + "\\.\n"
        + f"INSERT INTO network_cells ({columns}) SELECT {columns} FROM vnpt_import\n"
        + f"ON CONFLICT (cell_name) DO UPDATE SET {updates}\n"
        + "WHERE EXCLUDED.sta_datetime >= network_cells.sta_datetime "
        + "OR network_cells.sta_datetime IS NULL;\nCOMMIT;\n"
    )
    subprocess.run(
        ["psql", "-X", "-w", "-v", "ON_ERROR_STOP=1"],
        input=sql.encode("utf-8"), env={**os.environ, "PGCLIENTENCODING": "UTF8"},
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("--history", type=Path, required=True)
    parser.add_argument("--coordinates", type=Path)
    parser.add_argument("--snapshot", type=Path)
    parser.add_argument("--load", action="store_true", help="Upsert the snapshot with psql")
    args = parser.parse_args()
    if bool(args.coordinates) != bool(args.snapshot) or (args.load and not args.snapshot):
        parser.error("--coordinates and --snapshot are required together and for --load")

    raw = (
        pd.read_excel(args.raw, sheet_name=SHEET)
        if args.raw.suffix.lower() == ".xlsx"
        else pd.read_csv(args.raw)
    )
    history = evaluate(raw)
    rows = snapshot(history, pd.read_csv(args.coordinates)) if args.snapshot else None
    history.to_csv(args.history, index=False)
    if rows is not None:
        rows.to_csv(args.snapshot, index=False)
        if args.load:
            load_snapshot(rows)


if __name__ == "__main__":
    main()
