"""Check the checked-in code/assets against the publication manifest (no GPU)."""
import hashlib
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=json.loads((ROOT/'source-manifest.json').read_text());failed=[]
for item in m['files']:
 p=ROOT/item['path']
 if not p.is_file() or p.stat().st_size!=item['size'] or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
  failed.append(item['path'])
if failed:raise SystemExit('Source/asset verification failed: '+', '.join(failed))
print(f'Source/asset manifest verified: {len(m["files"])} files')
