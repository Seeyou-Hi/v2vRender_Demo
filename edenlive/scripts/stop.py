"""Stop only the launcher whose command and root match this checkout."""
import json
import os
from pathlib import Path
import signal
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'runtime/launcher.json'
if not p.exists():
    print('No launcher state for this checkout')
    raise SystemExit(0)
s=json.loads(p.read_text());pid=int(s['pid']);proc=Path('/proc')/str(pid)
if not proc.exists():
    print('Launcher already exited; stale state retained for inspection')
    raise SystemExit(0)
args=proc.joinpath('cmdline').read_bytes().split(b'\0')
if str(ROOT/'scripts/start.py').encode() not in args or s['root']!=str(ROOT):
    raise SystemExit('Refusing to signal a PID that is not this checkout\'s launcher')
os.kill(pid,signal.SIGTERM)
print(f'Stop requested for EdenLive launcher {pid}')
