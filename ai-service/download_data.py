"""Download and verify all three official NIST RAN archives; reruns reuse verified files."""
from pathlib import Path
import hashlib
import json
import urllib.request

DATA = Path(__file__).resolve().parent / "data"
URL = "https://data.nist.gov/od/id/mds2-3430"


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL, timeout=120) as response:
        metadata = json.load(response)
    (DATA / "nist_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    for item in metadata["components"]:
        name = Path(item.get("filepath", "")).name
        if not (name.endswith(".zip") or name.endswith(".xlsx") or name == "variable_name_key.csv"):
            continue
        target = DATA / name
        if target.exists():
            with target.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            if digest == item["checksum"]["hash"]:
                print(f"Verified {name}", flush=True)
                continue
        partial = target.with_suffix(target.suffix + ".part")
        print(f"Downloading {name}: {item['size']} bytes", flush=True)
        urllib.request.urlretrieve(item["downloadURL"], partial)
        with partial.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != item["checksum"]["hash"] or partial.stat().st_size != item["size"]:
            raise ValueError(f"Checksum/size mismatch: {name}")
        partial.replace(target)


if __name__ == "__main__":
    main()
