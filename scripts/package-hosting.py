"""Build a provider-independent archive containing only publishable site files."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
destination = ROOT / ".sites" / "domestic-publish.zip"
destination.parent.mkdir(exist_ok=True)
files = sorted(path for path in DIST.rglob("*") if path.is_file())
if not (DIST / "index.html").is_file():
    raise SystemExit("The website entry file is missing")
temporary = destination.with_suffix(".tmp.zip")
with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in files:
        archive.write(path, path.relative_to(DIST).as_posix())
with ZipFile(temporary) as archive:
    if archive.testzip() is not None or len(archive.infolist()) != len(files):
        raise SystemExit("The publishing archive failed validation")
temporary.replace(destination)
print(json.dumps({"archive": str(destination), "files": len(files),
                  "bytes": destination.stat().st_size, "integrity": "passed"}, ensure_ascii=False))
