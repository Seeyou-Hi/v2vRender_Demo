import argparse
import importlib
import json
import os
import shutil
import sys
from config import ROOT,load_config

p=argparse.ArgumentParser()
p.add_argument('--config',required=True)
p.add_argument('--skip-models',action='store_true')
a=p.parse_args()
c=load_config(a.config,not a.skip_models)
os.environ['DISABLE_SAGEATTENTION']='1'
os.environ['HF_HUB_OFFLINE']='1'
sys.path.insert(0,str(ROOT/'third_party/Scope/src'))
import torch
assert sys.version_info[:2]==(3,12),sys.version
assert torch.__version__.split('+')[0]=='2.9.1',torch.__version__
assert torch.version.cuda=='12.8',torch.version.cuda
for module in ['flash_attn','cv2','numpy','imageio_ffmpeg','scope.core.pipelines.krea_realtime_video.pipeline','attention_tp','opt_variants','fuse_parallel']:
    importlib.import_module(module)
assert os.environ.get('FFPROBE') or shutil.which('ffprobe'),'Install ffprobe'
print(json.dumps(dict(status='ok',torch=torch.__version__,cuda_runtime=torch.version.cuda,model_dir=c['model_dir'],models_checked=not a.skip_models),indent=2))
