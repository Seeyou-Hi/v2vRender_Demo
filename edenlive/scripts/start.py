"""Own and supervise the native model process plus a local TCP TURN relay."""
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

ROOT = Path(__file__).resolve().parents[1]

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', type=int, default=18500)
    p.add_argument('--turn-port', type=int, default=24488)
    p.add_argument('--host', default='127.0.0.1')
    p.add_argument('--game', choices=['robotarm','robotarm-photoreal','robotarm-photoreal-rgb'], default='robotarm-photoreal')
    p.add_argument('--no-compile', action='store_true')
    p.add_argument('--no-turn', action='store_true', help='Use externally configured TURN or direct ICE; SSH forwarding of HTTP alone is insufficient')
    p.add_argument('--dry-run', action='store_true', help='Show launch settings without loading torch or touching the GPU')
    return p

def main():
    a = parser().parse_args()
    native = ROOT/'third_party/EdenLive/realtime'
    command = [sys.executable,'-m','torch.distributed.run','--standalone','--nproc_per_node=1',
               str(ROOT/'scripts/serve.py'),'game2v-eden-world-v2-5b-taehv',
               '--mode','webrtc','--host',a.host,'--port',str(a.port),'--',
               '--no-ui','--wait-for-start','--dynamic-prompt','--prompt-event-chunks','1',
               '--total-blocks','10000','--game',a.game]
    if not a.no_compile:
        command += ['--compile']
    model_root = Path(os.environ.get('EDEN_MODEL_ROOT',ROOT/'models/EdenLive')).resolve()
    if a.dry_run:
        print(json.dumps(dict(command=command,cwd=str(native),model_root=str(model_root),
                             frontend=f'http://127.0.0.1:{a.port}/ext/arm/',turn=not a.no_turn),indent=2))
        return
    if not (ROOT/'.venv/bin/python').exists() and 'EDEN_ALLOW_EXTERNAL_ENV' not in os.environ:
        raise RuntimeError('Run install.sh first, or set EDEN_ALLOW_EXTERNAL_ENV=1 for your explicitly prepared environment')
    if not a.no_turn and a.host != '127.0.0.1':
        raise RuntimeError('Built-in loopback TURN requires --host 127.0.0.1; use SSH forwarding or external TURN with --no-turn')
    for path in ['runtime/crash','runtime/chrome-config','logs','runs','cache']:
        (ROOT/path).mkdir(parents=True,exist_ok=True)
    lock = (ROOT/'runtime/launcher.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError('This EdenLive launcher is already running')
    with socket.socket() as sock:
        sock.bind((a.host,a.port))
    env = os.environ.copy()
    env.update(EDEN_MODEL_ROOT=str(model_root),EDEN_GAMES_ROOT=str(ROOT/'games'),
               HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',PYTHONUNBUFFERED='1',
               HF_HOME=str(ROOT/'cache/hf'),TORCH_HOME=str(ROOT/'cache/torch'),
               FLASHDREAMS_CACHE_DIR=str(ROOT/'cache/flashdreams'),
               TRITON_CACHE_DIR=str(ROOT/'cache/triton'),TORCHINDUCTOR_CACHE_DIR=str(ROOT/'cache/inductor'))
    browser_path=ROOT/'runtime/chrome-path'
    if not env.get('EDEN_CHROME') and browser_path.is_file():
        env['EDEN_CHROME']=browser_path.read_text().strip()
    env.setdefault('OMP_NUM_THREADS','8')
    env.setdefault('OPENBLAS_NUM_THREADS','1')
    children=[]; logs=[]; state_path=ROOT/'runtime/launcher.json'
    def stop(*_):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM,stop)
    signal.signal(signal.SIGINT,stop)
    try:
        if not a.no_turn:
            binary=shutil.which('turnserver')
            if not binary:
                raise RuntimeError('coturn is missing: install turnserver, or configure external TURN and use --no-turn')
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',a.turn_port))
            credential=secrets.token_urlsafe(32)
            cfg=ROOT/'runtime/turn.conf'
            fd=os.open(cfg,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
            os.fchmod(fd,0o600)
            with os.fdopen(fd,'w') as f:
                f.write(f'''listening-ip=127.0.0.1
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
min-port=49620
max-port=49660
log-file=stdout
simple-log
''')
            log=(ROOT/'logs/turn.log').open('ab');logs.append(log)
            children.append(subprocess.Popen([binary,'-c',str(cfg)],stdout=log,stderr=log,start_new_session=True))
            env.update(FLASHDREAMS_TURN_HOST='127.0.0.1',FLASHDREAMS_TURN_PORT=str(a.turn_port),
                       FLASHDREAMS_TURN_USERNAME='edenlive',FLASHDREAMS_TURN_CREDENTIAL=credential,
                       EDEN_SERVER_TURN_URL=f'turn:127.0.0.1:{a.turn_port}?transport=tcp')
            time.sleep(1)
            if children[0].poll() is not None:
                raise RuntimeError('Local TURN exited; see logs/turn.log')
        log=(ROOT/'logs/backend.log').open('ab');logs.append(log)
        children.append(subprocess.Popen(command,cwd=native,env=env,stdout=log,stderr=log,start_new_session=True))
        state_path.write_text(json.dumps({'pid':os.getpid(),'root':str(ROOT),'started':time.time(),
                                         'children':[p.pid for p in children],'port':a.port}))
        print(f'Frontend: http://127.0.0.1:{a.port}/ext/arm/\nBackend log: {ROOT}/logs/backend.log',flush=True)
        print('Waiting for backend startup; model loading/compilation is not a readiness assertion.',flush=True)
        while all(p.poll() is None for p in children):
            time.sleep(1)
        failed=[p.returncode for p in children if p.poll() is not None]
        raise RuntimeError(f'Service exited: {failed}; inspect logs')
    except KeyboardInterrupt:
        pass
    finally:
        for p in reversed(children):
            if p.poll() is None:
                os.killpg(p.pid,signal.SIGTERM)
        for p in reversed(children):
            try:
                p.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid,signal.SIGKILL);p.wait()
        if state_path.exists():state_path.unlink()
        (ROOT/'runtime/turn.conf').unlink(missing_ok=True)
        for f in logs:f.close()

if __name__ == '__main__':
    main()
