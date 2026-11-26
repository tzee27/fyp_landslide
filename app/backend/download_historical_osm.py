"""Resume the official dated Geofabrik download and validate it before sampling."""

import hashlib
import json
import re
import subprocess
import time
from pathlib import Path
from zipfile import ZipFile, is_zipfile

from pilot_environment import ARCHIVE_NAME, ARCHIVE_SNAPSHOT

PILOT = Path(__file__).resolve().with_name("pilot_data")
URL = "https://download.geofabrik.de/asia/" + ARCHIVE_NAME
SIZE = 360854570  # Published archive Content-Length, checked on each range response.
CHUNK = 4 * 1024 * 1024


def download():
    target = PILOT / ARCHIVE_NAME
    metadata = target.with_suffix(".provenance.json")
    chunk = target.with_suffix(".range")
    headers = target.with_suffix(".headers")
    PILOT.mkdir(exist_ok=True)
    while not target.exists() or target.stat().st_size < SIZE:
        start = target.stat().st_size if target.exists() else 0
        end = min(start + CHUNK, SIZE) - 1
        for attempt in range(4):
            result = subprocess.run([
                "curl.exe", "--fail", "--silent", "--show-error", "--location",
                "--connect-timeout", "15", "--max-time", "150",
                "--range", f"{start}-{end}", "--dump-header", str(headers),
                "--output", str(chunk), URL,
            ], check=False)
            receipt = headers.read_text(errors="replace") if headers.exists() else ""
            content_range = re.findall(r"(?im)^content-range:\s*bytes (\d+)-(\d+)/(\d+)", receipt)
            if (result.returncode == 0 and content_range
                    and tuple(map(int, content_range[-1])) == (start, end, SIZE)
                    and chunk.stat().st_size == end - start + 1):
                with target.open("ab") as stream:
                    stream.write(chunk.read_bytes())
                chunk.unlink()
                headers.unlink()
                print(f"Archive: {end+1:,}/{SIZE:,} bytes", flush=True)
                break
            if attempt == 3:
                raise RuntimeError(f"Could not fetch bytes {start}–{end}; confirmed bytes retained.")
            time.sleep(2 ** attempt)
    if target.stat().st_size != SIZE or not is_zipfile(target):
        raise ValueError("Unexpected archive size or ZIP format.")
    with ZipFile(target) as archive:
        required = {f"gis_osm_{layer}_free_1.{extension}"
                    for layer in ("roads", "waterways") for extension in ("shp", "shx", "prj")}
        if not required.issubset({Path(name).name for name in archive.namelist()}):
            raise ValueError("Required OSM layers are missing.")
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError(f"Archive CRC check failed for {corrupt}.")
    with target.open("rb") as stream:
        checksum = hashlib.file_digest(stream, "sha256").hexdigest()
    temporary = metadata.with_suffix(".tmp")
    temporary.write_text(json.dumps({"source": URL, "snapshot_date": ARCHIVE_SNAPSHOT,
                                    "bytes": SIZE, "sha256": checksum}, indent=2), encoding="utf-8")
    temporary.replace(metadata)
    print(f"Validated January 2022 archive, SHA-256 {checksum}")


if __name__ == "__main__":
    download()
