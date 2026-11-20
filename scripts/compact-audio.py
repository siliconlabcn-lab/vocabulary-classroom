"""Keep only the pronunciations used by the classroom, with exact sample ranges.

Run with: uv run --with imageio-ffmpeg python scripts/compact-audio.py
Human recordings are preserved. Generated voices stay at their original 48 kbps.
"""
import hashlib
import json
import subprocess
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CACHE = ROOT / ".sites" / "compact-audio"
RATE = 24000
GAP_SAMPLES = 2400
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
PREFIX = "export const RECORDINGS = "
manifest_path = DIST / "recordings.js"
manifest_source = manifest_path.read_text()
manifest = json.loads(manifest_source.removeprefix(PREFIX).strip().removesuffix(";"))
files = defaultdict(list)
for language, entries in manifest.items():
    for text, entry in entries.items():
        if len(entry) > 5 and not entry[5].get("compacted"):
            files[entry[0]].append((language, text, entry))

CACHE.mkdir(parents=True, exist_ok=True)
if not (CACHE / "manifest-before.json").exists():
    (CACHE / "manifest-before.json").write_text(json.dumps(manifest, ensure_ascii=False))


def command(args, data=None):
    result = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", *args],
                            input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace"))
    return result.stdout


def compact(path, entries):
    old_path = DIST / path
    ranges = sorted({(entry[5]["start"], entry[5]["end"]) for _, _, entry in entries})
    digest = hashlib.sha256((path + json.dumps(ranges)).encode()).hexdigest()[:16]
    language = entries[0][0]
    destination = f"audio/neural/compact-{language}-{digest}.mp3"
    output = DIST / destination
    pcm = command(["-i", str(old_path), "-f", "s16le", "-ar", str(RATE), "-ac", "1", "pipe:1"])
    sample_count = len(pcm) // 2
    pieces, mapped = [], {}
    cursor = 0
    for start, end in ranges:
        first = max(0, round(start * RATE))
        last = min(sample_count, round(end * RATE))
        if last <= first:
            raise ValueError(f"Empty pronunciation after trimming: {path}, {start}, {end}")
        pieces.append(pcm[first * 2:last * 2])
        mapped[(start, end)] = {"start": cursor / RATE, "end": (cursor + last - first) / RATE}
        cursor += last - first
        pieces.append(b"\0" * GAP_SAMPLES * 2)
        cursor += GAP_SAMPLES
    if not output.exists():
        temporary = output.with_suffix(".tmp.mp3")
        command(["-y", "-f", "s16le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
                 "-c:a", "libmp3lame", "-b:a", "48k", "-ar", str(RATE), str(temporary)], b"".join(pieces))
        temporary.replace(output)
    # MP3 may round the final silent padding by one 576-sample frame. Every
    # pronunciation has a 2,400-sample guard after it, outside its play range.
    decoded = command(["-i", str(output), "-f", "s16le", "-ar", str(RATE), "-ac", "1", "pipe:1"])
    if abs(len(decoded) // 2 - cursor) > 576:
        raise ValueError(f"Decoded sample count changed: {destination}")
    updates = []
    for language, text, entry in entries:
        segment = mapped[(entry[5]["start"], entry[5]["end"])]
        updates.append((language, text, [destination, *entry[1:5], {**entry[5], **segment, "compacted": True}]))
    return path, old_path.stat().st_size, output.stat().st_size, updates


results = []
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(compact, path, entries) for path, entries in files.items()]
    for i, future in enumerate(as_completed(futures), 1):
        results.append(future.result())
        if i % 25 == 0 or i == len(futures):
            print(f"Compacted and verified {i}/{len(futures)} audio files", flush=True)

for _, _, _, updates in results:
    for language, text, entry in updates:
        manifest[language][text] = entry
temporary_manifest = manifest_path.with_suffix(".tmp.js")
temporary_manifest.write_text(PREFIX + json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + ";\n")
temporary_manifest.replace(manifest_path)
for path, _, _, _ in results:
    original = DIST / path
    backup = CACHE / "originals" / path
    backup.parent.mkdir(parents=True, exist_ok=True)
    original.replace(backup)
print(json.dumps({"files": len(results), "before_bytes": sum(result[1] for result in results),
                  "after_bytes": sum(result[2] for result in results)}, ensure_ascii=False))
