#!/usr/bin/env bash
set -euo pipefail
B=/home/test01/siyuheng/edenlive/deployments/robotarm_lightx2v_20261020
python3 - "$B" <<'CHECK'
import json,sys
from pathlib import Path
b=Path(sys.argv[1]);p=b/'logs/supervisor.json'
if p.exists():
 s=json.loads(p.read_text());cmd=Path('/proc')/str(s.get('supervisor_pid',0))/'cmdline'
 if cmd.exists() and str(b/'scripts/supervisor.py').encode() in cmd.read_bytes():raise SystemExit('Arm supervisor already running')
CHECK
exec python3 -u "$B/scripts/supervisor.py"
