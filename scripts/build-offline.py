"""Bundle the classroom and all pronunciation recordings into an offline HTML file."""
from base64 import b64encode
from pathlib import Path
import json
import re

project = Path(__file__).resolve().parents[1]
dist = project / "dist"
template = (dist / "index.html").read_text()
style = (dist / "styles.css").read_text()
template = template.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{style}\n</style>")
template = template.replace('<script type="module" src="app.js"></script>', "")

recordings = (dist / "recordings.js").read_text()
manifest = json.loads(recordings.removeprefix("export const RECORDINGS = ").strip().removesuffix(";"))
paths = sorted({entry[0] for clips in manifest.values() for entry in clips.values()})
scripts = [
    "const RECORDINGS = " + json.dumps(manifest, ensure_ascii=False) + ";",
    "for (const clips of Object.values(RECORDINGS)) { for (const entry of Object.values(clips)) entry[0] = BUNDLED_AUDIO[entry[0]]; }",
]
for filename in (
    "reference-banks.js", "words.js", "profiles.js", "accounts.js",
    "audio-library.js", "audio-player.js", "lesson.js", "app.js",
):
    source = (dist / filename).read_text()
    source = re.sub(r"^import\s+\{[^}]+\}\s+from\s+['\"][^'\"]+['\"];\n", "", source, flags=re.M)
    scripts.append(re.sub(r"^export ", "", source, flags=re.M))

head, tail = template.split("</body>", 1)
target = project / "单词练习室-离线版.html"
temporary = target.with_suffix(".html.tmp")
with temporary.open("w") as output:
    output.write(head)
    output.write('<script>const BUNDLED_AUDIO = {};</script>\n')
    # Each file is embedded once in a separate script, keeping each JavaScript
    # source below browser string limits even when the complete audio library grows.
    for path in paths:
        encoded = b64encode((dist / path).read_bytes()).decode()
        output.write('<script>BUNDLED_AUDIO[' + json.dumps(path) + '] = "data:audio/mpeg;base64,')
        output.write(encoded)
        output.write('";document.currentScript.remove();</script>\n')
    output.write("<script>\n(() => {\n")
    output.write("\n".join(scripts))
    output.write("\n})();\n</script>\n</body>")
    output.write(tail)
temporary.replace(target)
print(f"{target} ({target.stat().st_size:,} bytes)")
