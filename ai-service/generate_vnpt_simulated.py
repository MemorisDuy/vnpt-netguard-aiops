"""Generate anonymous, reproducible Ericsson counters and optional coordinates."""

import argparse
import csv
from datetime import datetime, timedelta
from pathlib import Path
from random import Random

from vnpt_kpi_rules import HEADERS


START = datetime(2025, 1, 6)
WEEK = timedelta(weeks=1)
TRAIN_START = START + 12 * WEEK
VALIDATION_START = START + 13 * WEEK
TEST_START = START + 14 * WEEK


def generate(raw_path, coordinates_path=None):
    rng = Random(462)
    cells = []
    for site in range(4):
        province = "SIM_A" if site < 2 else "SIM_B"
        code = "SMA" if site < 2 else "SMB"
        for sector in range(11, 14):
            node = f"SIM-{site + 1:02}-{code}"
            name = f"SIM-{site + 1:02}-{sector}-{code}"
            cells.append((province, node, name, 910000 + site, sector, site))

    with raw_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(HEADERS)
        for offset in range(15 * 7 * 24 - 1):
            hour = START + timedelta(hours=offset)
            week, hour_of_week = divmod(offset, 168)
            # Sunday 15:00–22:00 in each scored week. Earlier weeks are warm-up.
            incident = week >= 12 and 159 <= hour_of_week <= 166
            for index, (province, node, name, enodeb, sector, site) in enumerate(cells):
                attempts = 1200 + hour.hour * 10 + rng.randrange(26)
                volume = 320_000_000 if index == 1 else 54_000_000
                if index == 2:
                    volume = 7_000_000
                volume += rng.randrange(100_000)
                speed = 40
                failures = 0
                drop = 0
                if incident and index in (0, 6):
                    attempts = 30_000
                    failures = 2_000
                    drop = 180
                if incident and index == 1:
                    volume = 26_000_000
                if incident and index == 2:
                    volume = 110_000_000
                if incident and index == 3:
                    speed = 4
                    volume = 90_000_000
                dl = volume * 9 // 10
                last_tti = dl // 10
                counters = {
                    "pmUeThpVolUl": volume - dl,
                    "pmRrcConnEstabSucc": attempts - 5 - failures,
                    "pmRrcConnEstabAttReatt": 5,
                    "pmErabRelAbnormalEnbAct": drop,
                    "pmRrcConnEstabAtt": attempts,
                    "pmErabRelAbnormalMmeAct": drop // 2,
                    "pmS1SigConnEstabSucc": attempts - 2 * failures,
                    "pmS1SigConnEstabAtt": attempts - failures,
                    "pmErabEstabSuccInit": attempts - 3 * failures,
                    "pmErabRelAbnormalEnb": drop,
                    "pmErabEstabAttInit": attempts - 2 * failures,
                    "pmPdcpVolUlDrb": volume - dl,
                    "pmErabRelNormalEnb": 1150,
                    "pmErabRelMme": 50,
                    "pmHoPrepSuccLteIntraF": 250 - drop,
                    "pmHoPrepAttLteIntraF": 250,
                    "pmHoExeSuccLteIntraF": 250 - 2 * drop // 3,
                    "pmHoExeAttLteIntraF": 250,
                    "pmPdcpVolDlDrb": dl,
                    "pmUeThpTimeUl": (volume - dl) // 10,
                    "pmPdcpVolDlDrbLastTTI": last_tti,
                    "pmUeThpTimeDl": (dl - last_tti) // speed,
                }
                writer.writerow([
                    "ERICSSON", province, "SIM", node, name, enodeb, sector,
                    hour.strftime("%d/%m/%Y %H:%M:%S"),
                    *(counters[column] if column in counters else rng.randrange(30, 250)
                      for column in HEADERS[8:]),
                ])
    if coordinates_path:
        with coordinates_path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file, lineterminator="\n")
            writer.writerow(["cell_name", "latitude", "longitude"])
            for _, _, name, _, _, site in cells:
                writer.writerow([name, f"{10 + site * .003:.3f}", f"{106 + site * .003:.3f}"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("--coordinates", type=Path)
    args = parser.parse_args()
    generate(args.raw, args.coordinates)
