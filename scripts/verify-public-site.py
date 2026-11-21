"""Check any deployed copy without confusing a local HTTP check with a China test."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url", help="Actual HTTPS website URL returned by the hosting provider")
parser.add_argument("--direct", action="store_true", help="Ignore program proxy settings; system VPN status remains unverified")
args = parser.parse_args()
if args.direct and os.environ.get("CODEX_NETWORK_PROXY_ACTIVE") == "1":
    parser.error("A managed execution proxy is active; perform the direct-network test on the user's own device")
url = urlsplit(args.url)
if url.scheme != "https" or not url.netloc or url.username or url.password or url.query or url.fragment:
    parser.error("Use the actual HTTPS website URL without credentials, query or fragment")
base = args.url.rstrip("/") + "/"
manifest = json.loads((ROOT / "dist/recordings.js").read_text().split("=", 1)[1].strip().rstrip(";"))
paths = ["index.html", "app.js", "styles.css", "words.js", "reference-banks.js",
         "recordings.js", "accounts.js", "audio-player.js", "audio-library.js",
         "audio/en/apple.mp3", "audio/zh/苹果.mp3",
         manifest["en"]["was"][0].removeprefix("./"),
         next(entry[0].removeprefix("./") for entry in manifest["zh"].values() if len(entry) > 5)]


def check(path):
    opener = build_opener(ProxyHandler({})) if args.direct else build_opener()
    try:
        request = Request(base + ("" if path == "index.html" else quote(path, safe="/")),
                          headers={"User-Agent": "vocabulary-classroom-access-check/1.0"})
        with opener.open(request, timeout=35) as response:
            content = response.read()
            expected = hashlib.sha256((ROOT / "dist" / path).read_bytes()).hexdigest()
            return {"path": path, "status": response.status,
                    "content_type": response.headers.get("Content-Type"),
                    "bytes": len(content), "matches_release": hashlib.sha256(content).hexdigest() == expected}
    except Exception as error:
        return {"path": path, "error": str(error), "matches_release": False}


with ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(check, paths))
report = {"website": base, "checked_at_utc": datetime.now(timezone.utc).isoformat(),
          "program_proxy_disabled": args.direct,
          "system_vpn_status": "not_verified", "china_network_verified": False,
          "android_device_verified": False,
          "files_passed": all(item["matches_release"] for item in results), "results": results}
directory = ROOT / ".sites" / "access-checks"
directory.mkdir(parents=True, exist_ok=True)
target = directory / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
print(f"Report: {target}")
raise SystemExit(0 if report["files_passed"] else 1)
