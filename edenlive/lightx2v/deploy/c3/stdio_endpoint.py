"""Restricted SSH transport, carried only inside this managed job's stdio."""
import os,sys,subprocess,pathlib,json,signal,time
R=pathlib.Path('/home/test01/siyuheng/edenlive'); B=R/'deployments/robotarm_lightx2v_20261020'
job=os.environ['SLURM_JOB_ID'];d=B/'runtime'/('job_'+job);d.mkdir(parents=True,exist_ok=True)
assert os.environ['CUDA_VISIBLE_DEVICES']==os.environ['EDEN_CVD']
assert os.readlink('/proc/self/ns/net')!=os.environ['EDEN_PARENT_NET']
assert not pathlib.Path('/proc/net/route').read_text().splitlines()[1:]
key=B/'configs/bridge/host.compute'
if not key.exists():key.write_bytes((B/'configs/bridge/host').read_bytes())
os.chmod(key,0o600)
conf=d/'sshd.conf';conf.write_text(f'''HostKey {key}
AuthorizedKeysFile {B}/configs/bridge/client.pub
StrictModes no
UsePAM no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers yc
AllowTcpForwarding yes
PermitOpen 127.0.0.1:18510
AllowAgentForwarding no
AllowStreamLocalForwarding no
PermitListen 127.0.0.1:24509
X11Forwarding no
PermitTTY no
PermitTunnel no
PermitUserRC no
ForceCommand /bin/false
PidFile {d}/sshd.pid
LogLevel VERBOSE
''')
(d/'bridge.json').write_text(json.dumps({'job':job,'created':time.time(),'gpu_uuid':os.environ['EDEN_GPU_UUID'],'net':os.readlink('/proc/self/ns/net'),'ports':[18510,24508]},indent=2))
f=(d/'stack.log').open('a');child=subprocess.Popen(['bash',str(B/'scripts/inner.sh'),str(d)],stdin=subprocess.DEVNULL,stdout=f,stderr=f,start_new_session=True)
try:
 transport=subprocess.Popen(['/usr/sbin/sshd','-i','-e','-f',str(conf)])
 while transport.poll() is None and child.poll() is None:time.sleep(.5)
 if transport.poll() is None:transport.terminate()
 rc=transport.wait()
 if child.poll() is not None and child.returncode:rc=child.returncode
finally:
 if child.poll() is None:
  os.killpg(child.pid,signal.SIGTERM)
  try:child.wait(timeout=15)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL)
sys.exit(rc)
