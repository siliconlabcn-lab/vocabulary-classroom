"""Give non-ASCII audio filenames stable ASCII aliases in the deploy artifact.

The source recordings and legacy static-site paths are preserved unchanged.
"""
from pathlib import Path
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'.edgeone/assets'
if not (BUILD/'index.html').exists():
    raise SystemExit('Run edgeone makers build first.')
source=ROOT/'dist/recordings.js'
prefix,raw=source.read_text().split('=',1)
manifest=json.loads(raw.strip().rstrip(';'))
aliases={}
for path in (ROOT/'dist/audio').rglob('*.mp3'):
    relative=path.relative_to(ROOT/'dist').as_posix()
    if relative.isascii():continue
    digest=hashlib.sha256(path.read_bytes()).hexdigest()[:24]
    alias=(Path(relative).parent/f'voice-{digest}.mp3').as_posix()
    target=BUILD/alias;target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(path,target)
    aliases[relative]=alias
    aliases['./'+relative]='./'+alias

def rewrite(value):
    if isinstance(value,str):return aliases.get(value,value)
    if isinstance(value,list):return [rewrite(item) for item in value]
    if isinstance(value,dict):return {key:rewrite(item) for key,item in value.items()}
    return value

(BUILD/'recordings.js').write_text(prefix+'= '+json.dumps(rewrite(manifest),ensure_ascii=False,separators=(',',':'))+';\n')
print(f'Prepared {len(aliases)//2} stable audio paths; source recordings preserved.')
