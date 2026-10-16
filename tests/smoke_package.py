"""Exercise the root launcher, real API and Node proxy without GPU/weights.

The resident fixture echoes input pixels; it is not an inference quality test.
Run with the Krea environment: python tests/smoke_package.py --node /path/to/node
"""
import argparse
import gzip
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'krea/scripts'))
from config import MODEL_FILES


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--node', default='node')
    args = p.parse_args()
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        models = root / 'models'
        for name in MODEL_FILES.values():
            f = models / name
            f.parent.mkdir(parents=True, exist_ok=True)
            f.mkdir() if name.endswith('umt5-xxl') else f.touch()
        f = models / 'Wan2.1-T2V-14B/config.json'
        f.parent.mkdir();f.write_text('{}')
        config = root / 'config.json'
        config.write_text(json.dumps({'model_dir': str(models)}))
        fake = root / 'fake/torch/distributed'
        fake.mkdir(parents=True)
        (fake.parent / '__init__.py').touch();(fake / '__init__.py').touch()
        (fake / 'run.py').write_text('''
import sys,json,time
from pathlib import Path
sys.path.insert(0, ROOT_SCRIPTS)
from stream_input import read_stream
from media import write_frames
q=Path(sys.argv[sys.argv.index('--queue')+1]);q.mkdir(exist_ok=True)
for name in ['tasks','results']:(q/name).mkdir(exist_ok=True)
def publish(path,data):
 t=path.with_suffix('.tmp');t.write_text(json.dumps(data));t.replace(path)
publish(q/'status.json',dict(status='ready',gpus=4))
while True:
 tasks=list((q/'tasks').glob('*.json'))
 if not tasks:time.sleep(.05);continue
 task=tasks[0];a=json.loads(task.read_text())['argv']
 src=a[a.index('--stream-dir')+1];out=Path(a[a.index('--output')+1]);out.mkdir()
 offset=0
 for pixels in read_stream(src,idle_timeout=15):
  write_frames(out/'frames',pixels,offset,'jpeg');offset+=len(pixels)
 publish(out/'status.json',dict(status='completed',delivered_frames=offset))
 publish(q/'results'/task.name,dict(status='completed',returncode=0,resident_reused=True))
 task.unlink()
'''.replace('ROOT_SCRIPTS', repr(str(ROOT / 'krea/scripts'))))
        with socket.socket() as a, socket.socket() as b:
            a.bind(('127.0.0.1', 0));b.bind(('127.0.0.1', 0))
            web, api = a.getsockname()[1], b.getsockname()[1]
        env = dict(os.environ, KREA_PYTHON=sys.executable, NODE=args.node, PORT=str(web),
                   KREA_API_PORT=str(api), KREA_RUN_DIR=str(root/'run'), PYTHONPATH=str(root/'fake'))
        with (root/'launcher.log').open('w') as log:
            process = subprocess.Popen(['bash',str(ROOT/'start.sh'),str(config)],env=env,
                                       stdout=log,stderr=log,start_new_session=True)
        def call(path, body=None, headers=None):
            return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{web}'+path,
                                          data=body,headers=headers or {}),timeout=5)
        try:
            for _ in range(100):
                try:
                    health=json.load(call('/api/render/health'))
                    if health.get('resident',{}).get('status')=='ready':break
                except OSError:pass
                if process.poll() is not None:raise RuntimeError('\n'.join(f'{p.name}: {p.read_text()}' for p in root.rglob('*.log')))
                time.sleep(.1)
            else:raise RuntimeError('Launcher did not reach ready')
            assert b'id="backend-canvas"' in call('/').read()
            policy=json.load(call('/api/render/prompt-policy'));assert policy['version']==1
            session=json.load(call('/api/render/streams',json.dumps(dict(variant='bf16_blocks',
                control_kind='depth',input_fps=5,input_format='gray8',output_mode='frames',
                frame_format='jpeg',save_mp4=False)).encode()))
            base='/api/render/streams/'+session['id']
            body=gzip.compress(bytes([100])*(640*384))
            reply=json.load(call(base+'/frames/000000',body,{'Content-Encoding':'gzip'}))
            assert reply['last_upload']['decoded_bytes']==640*384
            call(base+'/finish',b'{}').close()
            for _ in range(100):
                state=json.load(call(base))
                if state['status'] in ('failed','completed'):break
                time.sleep(.1)
            assert state['status']=='completed',state
            frames=json.load(call(base+'/frames'))['frames'];assert len(frames)==1
            assert call('/api/render'+frames[0]['url']).read().startswith(b'\xff\xd8')
            print('PACKAGE_SMOKE_PASSED: launcher -> gzip proxy -> real HTTP inbox -> fixture resident -> JPEG')
        finally:
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL);process.wait()
        for port in [web,api]:
            with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',port))!=0
        print('Launcher cleanup verified: API and frontend ports closed')


if __name__=='__main__':main()
