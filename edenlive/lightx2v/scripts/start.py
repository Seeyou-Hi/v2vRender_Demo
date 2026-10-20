"""Launch only this checkout's dual-A800 model and local WebRTC TURN service."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from paths import ROOT,EDEN,UPSTREAM,model_roots,resolved_profile

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port',type=int,default=18510)
    p.add_argument('--turn-port',type=int,default=24508)
    p.add_argument('--relay-min-port',type=int,default=49720)
    p.add_argument('--relay-max-port',type=int,default=49760)
    p.add_argument('--dry-run',action='store_true')
    a=p.parse_args();model,quant=model_roots();cfg=resolved_profile()
    command=[sys.executable,'-m','torch.distributed.run','--standalone','--nproc_per_node=2',str(ROOT/'scripts/server.py')]
    if a.dry_run:
        print(json.dumps({'command':command,'model_root':str(model),'quant_root':str(quant),'config':cfg,
                         'http_port':a.port,'turn_port':a.turn_port},indent=2));return
    for port in (a.port,a.turn_port,a.relay_min_port,a.relay_max_port):
        if not 1024<=port<=65535:raise ValueError('Ports must be between 1024 and 65535')
    if a.port==a.turn_port or a.relay_min_port>a.relay_max_port:raise ValueError('Conflicting ports/range')
    for d in ('runtime','runtime/crash','logs','runs','cache'):(ROOT/d).mkdir(parents=True,exist_ok=True)
    lock=(ROOT/'runtime/launcher.lock').open('w')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    for port in (a.port,a.turn_port):
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    required=[model/'umt5/text_encoder/model.safetensors',model/'vae-5b/Wan2.2_VAE.pth',
              model/'vision-encoder/projection.safetensors',Path(cfg['tae_path']),
              Path(cfg['dit_quantized_ckpt']),Path(cfg['proxy_quantized_ckpt'])]
    for path in required:
        if not path.is_file():raise FileNotFoundError(f'Missing prepared weights: {path}; see README.md')
    import torch
    if torch.cuda.device_count()!=2:raise RuntimeError('Request exactly two allocated visible GPUs; launcher does not change CUDA_VISIBLE_DEVICES')
    for i in range(2):
        if torch.cuda.get_device_capability(i)!=(8,0):raise RuntimeError('Selected packed INT8 profile is validated for SM80 A800; other architectures need a separate validated profile')
    chrome=os.environ.get('EDEN_CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    saved=EDEN/'runtime/chrome-path'
    if not chrome and saved.is_file():chrome=saved.read_text().strip()
    if not chrome or not Path(chrome).is_file():raise RuntimeError('Install Chrome/Chromium or set EDEN_CHROME')
    binary=shutil.which('turnserver')
    if not binary:raise RuntimeError('Install coturn (turnserver)')
    env=os.environ.copy();env.update(PYTHONPATH=os.pathsep.join([str(UPSTREAM),str(ROOT/'scripts')]),
        EDEN_CHROME=str(chrome),EDEN_LIGHT_MODEL_ROOT=str(model),EDEN_LIGHT_CONFIG=str(ROOT/'runtime/model.json'),
        EDEN_LIGHT_PORT=str(a.port),EDEN_SERVER_TURN_URL=f'turn:127.0.0.1:{a.turn_port}?transport=tcp',
        EDEN_BROWSER_TURN_URL=f'turn:127.0.0.1:{a.turn_port}?transport=tcp',
        HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONUNBUFFERED='1',
        DTYPE='BF16',SENSITIVE_LAYER_DTYPE='BF16',EDEN_DUAL_PROJECTION='1',EDEN_DUAL_GRAPH='1',
        NCCL_GRAPH_MIXING_SUPPORT='0',OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='1',
        HF_HOME=str(ROOT/'cache/hf'),TORCH_HOME=str(ROOT/'cache/torch'),
        TRITON_CACHE_DIR=str(ROOT/'cache/triton'),TORCHINDUCTOR_CACHE_DIR=str(ROOT/'cache/inductor'))
    (ROOT/'runtime/model.json').write_text(json.dumps(cfg,indent=2))
    credential=secrets.token_urlsafe(32)
    for name,content in [('turn-credential',credential),('turn.conf',f"""listening-ip=127.0.0.1
relay-ip=127.0.0.1
listening-port={a.turn_port}
realm=edenlive
lt-cred-mech
user=edenlive:{credential}
allow-loopback-peers
no-tls
no-dtls
no-cli
relay-threads=1
min-port={a.relay_min_port}
max-port={a.relay_max_port}
log-file=stdout
simple-log
""")]:
        fd=os.open(ROOT/'runtime'/name,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
        os.fchmod(fd,0o600)
        with os.fdopen(fd,'w') as f:f.write(content)
    children=[];logs=[];state=ROOT/'runtime/launcher.json'
    def stop(*_):raise KeyboardInterrupt
    signal.signal(signal.SIGINT,stop);signal.signal(signal.SIGTERM,stop)
    try:
        for name,cmd in [('turn',[binary,'-c',str(ROOT/'runtime/turn.conf')]),('backend',command)]:
            log=(ROOT/'logs'/f'{name}.log').open('ab');logs.append(log)
            children.append(subprocess.Popen(cmd,cwd=UPSTREAM,env=env,stdout=log,stderr=log,start_new_session=True))
            if name=='turn':
                time.sleep(1)
                if children[-1].poll() is not None:raise RuntimeError('TURN failed; see logs/turn.log')
        state.write_text(json.dumps({'pid':os.getpid(),'root':str(ROOT),'children':[c.pid for c in children],'started':time.time()}))
        print(f'Frontend: http://127.0.0.1:{a.port}/ ; forward HTTP and TURN/TCP {a.turn_port}',flush=True)
        print('Wait for /metrics to respond, then click Start. Backend log: '+str(ROOT/'logs/backend.log'),flush=True)
        while all(c.poll() is None for c in children):time.sleep(1)
        raise RuntimeError('A service exited; inspect logs/backend.log and logs/turn.log')
    except KeyboardInterrupt:pass
    finally:
        for c in reversed(children):
            if c.poll() is None:os.killpg(c.pid,signal.SIGTERM)
        for c in reversed(children):
            try:c.wait(timeout=15)
            except subprocess.TimeoutExpired:os.killpg(c.pid,signal.SIGKILL);c.wait()
        state.unlink(missing_ok=True)
        for name in ('turn.conf','turn-credential'):(ROOT/'runtime'/name).unlink(missing_ok=True)
        for f in logs:f.close()
if __name__=='__main__':main()
