"""Check pronunciation coverage, local assets and word boundaries before deployment."""
import json
import subprocess
from pathlib import Path

from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
source = '''
import { BANKS } from './dist/words.js';
import { firstMeaning } from './dist/audio-library.js';
console.log(JSON.stringify(Object.fromEntries(['en', 'zh'].map(language => [
  language,
  [...new Set(BANKS.flatMap(bank => bank.words.map(word => language === 'zh' ? firstMeaning(word.zh) : word.en)))]
]))));
'''
catalog = json.loads(subprocess.check_output(
    ["node", "--input-type=module", "-e", source], cwd=ROOT, text=True,
))
manifest = json.loads((DIST / "recordings.js").read_text().removeprefix("export const RECORDINGS = ").strip().removesuffix(";"))
durations = {}
segments = {}

for language in ["en", "zh"]:
    missing = set(catalog[language]) - manifest[language].keys()
    if missing:
        raise ValueError(f"{language}: {len(missing)} missing pronunciations: {sorted(missing)[:8]}")
    for text in catalog[language]:
        recording = manifest[language][text]
        path = DIST / recording[0]
        if path not in durations:
            if not path.is_file():
                raise ValueError(f"Missing audio file: {path}")
            durations[path] = MP3(path).info.length
            if durations[path] <= 0:
                raise ValueError(f"Empty audio: {path}")
        if len(recording) > 5:
            start = recording[5]["start"]
            end = recording[5]["end"]
            if not 0 <= start < end <= durations[path] + 0.02:
                raise ValueError(f"Invalid audio boundary: {language} {text}")
            segments.setdefault(path, set()).add((start, end))
    print(f"{language}: {len(catalog[language])} / {len(catalog[language])} pronunciations available")

for path, ranges in segments.items():
    ordered = sorted(ranges)
    for previous, following in zip(ordered, ordered[1:]):
        if previous[1] > following[0] + 0.03:
            raise ValueError(f"Adjacent pronunciations overlap: {path}, {previous}, {following}")

print(f"Verified {len(durations)} playable MP3 files and all per-word start/end boundaries.")
