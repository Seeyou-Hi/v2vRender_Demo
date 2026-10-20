"""Preflight dependencies, assets and model sizes without starting inference."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--gpu',action='store_true',help='Check only inside an allocated GPU job')
a=p.parse_args();errors=[]
for module in ['torch','torchvision','aiohttp','aiortc','av','numpy','PIL','transformers','tyro','flashdreams','cam2v','eden','imageio_ffmpeg']:
 if importlib.util.find_spec(module) is None:errors.append('Missing Python module: '+module)
saved=ROOT/'runtime/chrome-path'
chrome=os.environ.get('EDEN_CHROME') or (saved.read_text().strip() if saved.is_file() else None) or shutil.which('google-chrome') or shutil.which('chromium')
if not chrome or not Path(chrome).is_file():errors.append('Chrome missing: set EDEN_CHROME or install Chrome/Chromium')
if not shutil.which('turnserver'):errors.append('coturn missing: install turnserver (or configure external TURN with --no-turn)')
root=Path(os.environ.get('EDEN_MODEL_ROOT',ROOT/'models/EdenLive'))
m=json.loads((ROOT/'models/download-manifest.json').read_text())
for item in m['files']:
 path=root/item['rfilename']
 if not path.is_file() or path.stat().st_size!=item['size']:errors.append('Missing/wrong model file size: '+item['rfilename'])
for path in ['simulator/index.html','simulator/native-capture.js','web/index.html','games/registry.json','third_party/EdenLive/realtime/flashdreams/flashdreams/runtime_v2/serving/web/app.js']:
 if not (ROOT/path).is_file():errors.append('Missing source asset: '+path)
if a.gpu and importlib.util.find_spec('torch'):
 import torch
 if not torch.cuda.is_available():errors.append('CUDA unavailable in this job')
 elif torch.cuda.device_count()!=1:errors.append('This launcher requires exactly one assigned visible GPU; request a single GPU job')
 else:print(json.dumps({'gpu':torch.cuda.get_device_name(0),'capability':torch.cuda.get_device_capability(0),'torch':torch.__version__,'runtime':torch.version.cuda}))
for message in errors:print('FAIL:',message,file=sys.stderr)
if errors:raise SystemExit(1)
print('Dependency/asset/size preflight passed. Run models.py verify for full SHA256/Git hashes; start the service to verify hardware WebGL and media.')
