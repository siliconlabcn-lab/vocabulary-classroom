"""Generate and verify missing neural pronunciation recordings in bounded batches.

Run with uv run --with edge-tts --with mutagen python scripts/generate-audio.py.
The generated index is resumable and does not contain learner information.
"""
import argparse
import asyncio
import hashlib
import html
import json
import re
import subprocess
import time
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
WORK = ROOT / ".sites" / "audio-generation"
VOICES = {"en": "en-US-JennyNeural", "zh": "zh-CN-XiaoxiaoNeural"}


def spoken_text(text, lang):
    text = html.unescape(text)
    if lang == "zh":
        text = re.sub(r"\b(?:n|v|adj|adv|vt|vi|prep|pron|conj|det|num|art|aux|abbr|interj)\.\s*", "", text)
    text = re.sub(r"[.!?。！？\r\n]+", "，" if lang == "zh" else " ", text)
    text = re.sub(r"[;；|/]+", "，" if lang == "zh" else ", ", text)
    text = re.sub(r"[\[\]{}<>]", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ,，")
    return text or ("word" if lang == "en" else "词语")


def comparable(text):
    return re.sub(r"[^\w\u3400-\u9fff]", "", html.unescape(text)).casefold()


def batches(items, lang, max_count=60, max_chars=1400):
    batch = []
    chars = 0
    for item in items:
        size = len(spoken_text(item, lang)) + 2
        if batch and (len(batch) >= max_count or chars + size > max_chars):
            yield batch
            batch = []
            chars = 0
        batch.append(item)
        chars += size
    if batch:
        yield batch


async def synthesize(lang, words, semaphore):
    signature = hashlib.sha256(json.dumps([VOICES[lang], words], ensure_ascii=False).encode()).hexdigest()[:18]
    target = DIST / "audio" / "neural" / lang / (signature + ".mp3")
    index_path = WORK / lang / (signature + ".json")
    target.parent.mkdir(parents=True, exist_ok=True)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and index_path.exists():
        return json.loads(index_path.read_text())

    prompts = [spoken_text(word, lang) + ("." if lang == "en" else "。") for word in words]
    text = "\n".join(prompts)
    async with semaphore:
        for attempt in range(4):
            temporary = target.with_suffix(".mp3.part")
            try:
                boundaries = []
                with temporary.open("wb") as file:
                    stream = edge_tts.Communicate(text, VOICES[lang], boundary="SentenceBoundary", rate="-5%")
                    async with asyncio.timeout(110):
                        async for chunk in stream.stream():
                            if chunk["type"] == "audio":
                                file.write(chunk["data"])
                            elif chunk["type"] == "SentenceBoundary":
                                boundaries.append(chunk)
                aligned = []
                boundary_index = 0
                for prompt in prompts:
                    expected = comparable(prompt)
                    combined = ""
                    chunks = []
                    while boundary_index < len(boundaries):
                        boundary = boundaries[boundary_index]
                        combined += comparable(boundary["text"])
                        chunks.append(boundary)
                        boundary_index += 1
                        if combined == expected:
                            first, last = chunks[0], chunks[-1]
                            aligned.append({
                                "offset": first["offset"],
                                "duration": last["offset"] + last["duration"] - first["offset"],
                            })
                            break
                        if not expected.startswith(combined):
                            raise ValueError(f"Boundary text mismatch for {prompt!r}")
                    else:
                        raise ValueError(f"Missing pronunciation boundary for {prompt!r}")
                if boundary_index != len(boundaries):
                    raise ValueError("Unexpected trailing pronunciation boundaries")
                boundaries = aligned
                for current, following in zip(boundaries, boundaries[1:]):
                    current["duration"] = min(
                        current["duration"], following["offset"] - current["offset"],
                    )
                length = MP3(temporary).info.length
                result = {}
                for word, boundary in zip(words, boundaries):
                    start = boundary["offset"] / 10_000_000
                    end = start + boundary["duration"] / 10_000_000
                    if not 0 <= start < end <= length + 0.12:
                        raise ValueError(f"Invalid audio range {word}: {start}, {end}, {length}")
                    result[word] = [
                        "./audio/neural/" + lang + "/" + target.name,
                        "Microsoft " + VOICES[lang] + " · 合成语音",
                        "合成语音", "", "https://www.microsoft.com/edge/features/read-aloud",
                        {"start": round(start, 5), "end": round(min(end, length), 5), "voice": VOICES[lang]},
                    ]
                temporary.replace(target)
                saved = index_path.with_suffix(".json.part")
                saved.write_text(json.dumps(result, ensure_ascii=False))
                saved.replace(index_path)
                return result
            except Exception:
                temporary.unlink(missing_ok=True)
                if attempt == 3:
                    raise
                await asyncio.sleep(min(8, 2 ** attempt))


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--language", choices=["en", "zh"], default="en")
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--batch-size", type=int, default=60)
    args = parser.parse_args()
    lang = args.language
    source = '''
import { BANKS } from './dist/words.js';
import { firstMeaning } from './dist/audio-library.js';
import { RECORDINGS } from './dist/recordings.js';
console.log(JSON.stringify(Object.fromEntries(['en', 'zh'].map(language => [
  language,
  [...new Set(BANKS.flatMap(bank => bank.words.map(word => language === 'zh' ? firstMeaning(word.zh) : word.en)))]
    .filter(word => !RECORDINGS[language][word]).sort()
]))));
'''
    missing = json.loads(subprocess.check_output(
        ["node", "--input-type=module", "-e", source], cwd=ROOT, text=True,
    ))
    words = missing[lang]
    groups = list(batches(words, lang, max_count=args.batch_size))
    semaphore = asyncio.Semaphore(args.concurrency)
    start = time.monotonic()
    result = {}
    failures = []
    print(f"{lang}: {len(words)} missing entries, {len(groups)} batches, {args.concurrency} workers", flush=True)

    async def job(index, group):
        try:
            data = await synthesize(lang, group, semaphore)
            return index, data, None
        except Exception as error:
            return index, None, str(error)

    tasks = [asyncio.create_task(job(i, group)) for i, group in enumerate(groups)]
    for completed, task in enumerate(asyncio.as_completed(tasks), 1):
        index, data, error = await task
        if error:
            failures.append({"batch": index, "words": groups[index], "error": error})
            print(f"FAILED {lang} batch {index}: {error[:160]}", flush=True)
        else:
            result.update(data)
        if completed % 5 == 0 or completed == len(groups):
            elapsed = time.monotonic() - start
            print(f"{lang}: {completed}/{len(groups)} batches, {len(result)}/{len(words)} entries, {elapsed:.0f}s", flush=True)

    output = WORK / (lang + "-manifest.json")
    output.write_text(json.dumps(result, ensure_ascii=False))
    (WORK / (lang + "-failures.json")).write_text(json.dumps(failures, ensure_ascii=False))
    print(f"Saved {output}; failures={len(failures)}", flush=True)
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
