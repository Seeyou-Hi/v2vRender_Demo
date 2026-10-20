import os,sys,pathlib,subprocess,json,time,socket,signal,shlex,threading
R=pathlib.Path('/home/test01/siyuheng/edenlive');B=R/'deployments/robotarm_lightx2v_20261020'
assert socket.gethostname()=='heart';os.chdir(R)
for port in (18510,24508):
 with socket.socket() as s:s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port))
key=B/'configs/bridge/client'
proxy=['/usr/bin/python3',str(B/'scripts/stdio_codec.py'),'client','--','gpu-shell','-g','2','-c','16','-m','160G','-t','01:00:00','--','/usr/bin/python3',str(B/'scripts/stdio_codec.py'),'server','--',str(R/'env-lightx2v/bin/python'),str(R/'deployments/lightx2v_20261020/scripts/gpu_isolated_dual.py'),'--','/usr/bin/python3',str(B/'scripts/stdio_endpoint.py')]
cmd=['ssh','-N','-T','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-o','ConnectTimeout=900','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o',f'UserKnownHostsFile={B}/configs/bridge/known_hosts','-i',str(key),'-o','ProxyCommand='+shlex.join(proxy)]
for port in (18510,):cmd+=['-L',f'127.0.0.1:{port}:127.0.0.1:{port}']
cmd+=['-R','127.0.0.1:24509:127.0.0.1:24508','yc@edenlive-c3-stdio']
turn_env=os.environ.copy();turn_env['LD_LIBRARY_PATH']=str(B/'tools/coturn/usr/lib/x86_64-linux-gnu')
turn_args=[str(B/'tools/coturn/usr/bin/turnserver'),'-n','--listening-ip=127.0.0.1','--relay-ip=127.0.0.1','--allow-loopback-peers','--listening-port=24508','--realm=edenlive','--lt-cred-mech','--user=edenlive:'+(B/'configs/turn-credential').read_text().strip(),'--no-tls','--no-dtls','--no-cli','--relay-threads=1','--min-port=49720','--max-port=49760','--log-file=stdout','--simple-log']
turn_log=(B/'logs/heart-turn.log').open('a');turn_proc=subprocess.Popen(turn_args,env=turn_env,stdout=turn_log,stderr=turn_log)
time.sleep(1)
assert turn_proc.poll() is None,'Heart TURN failed; inspect heart-turn.log'
p=subprocess.Popen(cmd,start_new_session=True)
state={'supervisor_pid':os.getpid(),'ssh_pid':p.pid,'turn_pid':turn_proc.pid,'status':'starting_or_queued','ports':[18510,24508],'started':time.time()};f=B/'logs/supervisor.json';f.write_text(json.dumps(state,indent=2))
def stop(*_):
 if p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
def track():
 while p.poll() is None:
  for b in (B/'runtime').glob('job_*/bridge.json'):
   try:
    data=json.loads(b.read_text())
    if data['created']>=state['started']-5:
     state.update(job_id=data['job'],job_directory=str(b.parent),status='allocated');f.write_text(json.dumps(state,indent=2));return
   except (OSError,ValueError):pass
  time.sleep(1)
threading.Thread(target=track,daemon=True).start();rc=p.wait();turn_proc.terminate();turn_proc.wait(timeout=10);state.update(status='stopped',returncode=rc,ended=time.time());f.write_text(json.dumps(state,indent=2));sys.exit(rc)
