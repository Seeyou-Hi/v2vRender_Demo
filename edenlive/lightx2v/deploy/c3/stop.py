import json,signal,os
from pathlib import Path
b=Path('/home/test01/siyuheng/edenlive/deployments/robotarm_lightx2v_20261020')
s=json.loads((b/'logs/supervisor.json').read_text())
for key, marker in [('supervisor_pid',str(b/'scripts/supervisor.py')),('turn_pid',str(b/'tools/coturn/usr/bin/turnserver'))]:
 pid=s.get(key);p=Path('/proc')/str(pid)/'cmdline'
 if p.exists() and marker.encode() in p.read_bytes():
  try:os.kill(pid,signal.SIGTERM);print('Stopped own '+key)
  except ProcessLookupError:pass

# Only cancel the allocation recorded by this deployment's authenticated bridge.
import subprocess
job=s.get('job_id');directory=s.get('job_directory')
if job and directory:
 d=Path(directory)
 if d.parent.resolve()==(b/'runtime').resolve() and d.name=='job_'+job:
  marker=d/'bridge.json'
  if marker.is_file() and json.loads(marker.read_text()).get('job')==job:
   subprocess.run(['gpu-cancel',job],stdin=subprocess.DEVNULL,check=False)
