"""Download only the pinned 23-file release subset, with resumable TLS + hashes."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def verify_file(path, item):
    if not path.is_file() or path.stat().st_size != item['size']:
        return False
    lfs = item.get('lfs')
    h = hashlib.sha256() if lfs else hashlib.sha1()
    if not lfs:
        h.update(f"blob {item['size']}\0".encode())
    with path.open('rb') as f:
        while chunk := f.read(8 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest() == (lfs['sha256'] if lfs else item['blobId'])

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('action', choices=['download', 'verify'])
    ap.add_argument('--model-dir', type=Path, default=Path(os.environ.get('EDEN_MODEL_ROOT', ROOT/'models/EdenLive')))
    ap.add_argument('--endpoint', default=os.environ.get('HF_ENDPOINT', 'https://hf-mirror.com'))
    a = ap.parse_args()
    manifest = json.loads((ROOT/'models/download-manifest.json').read_text())
    if not a.endpoint.startswith('https://'):
        ap.error('The download endpoint must use HTTPS')
    failures = []
    root = a.model_dir.resolve()
    for item in manifest['files']:
        rel = Path(item['rfilename'])
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Unsafe manifest path')
        path = root / rel
        if verify_file(path, item):
            print(f'OK {rel}', flush=True)
            continue
        if a.action == 'verify':
            failures.append(str(rel))
            print(f'FAIL {rel}', flush=True)
            continue
        if path.exists():
            raise RuntimeError(f'Existing file failed verification: {path}; preserve or move it before retrying')
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_name(path.name + '.part')
        url = f"{a.endpoint.rstrip('/')}/{manifest['repo_id']}/resolve/{manifest['revision']}/{rel.as_posix()}"
        # curl validates TLS by default. Do not emit signed redirect URLs.
        subprocess.run(['curl','--fail','--location','--retry','8','--retry-delay','5',
                        '--connect-timeout','30','--speed-limit','1024','--speed-time','120',
                        '--continue-at','-','--output',str(part),url],check=True)
        if not verify_file(part, item):
            raise RuntimeError(f'Hash/size mismatch: {rel}; partial preserved at {part}')
        part.replace(path)
        print(f'VERIFIED {rel}', flush=True)
    if failures:
        print(f'{len(failures)} of {len(manifest["files"])} files failed verification',file=sys.stderr)
        return 1
    print(f'All {len(manifest["files"])} files verified at revision {manifest["revision"]}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
