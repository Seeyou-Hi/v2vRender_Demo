"""Resolve the relocatable model profile without importing torch or touching GPUs."""
import json
import os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EDEN=ROOT.parent
UPSTREAM=EDEN/'third_party/LightX2V'
def model_roots():
    return (Path(os.environ.get('EDEN_LIGHT_MODEL_ROOT',str(EDEN/'models/EdenLive-LightX2V'))).resolve(),
            Path(os.environ.get('EDEN_LIGHT_QUANT_ROOT',str(EDEN/'models/EdenLive-LightX2V-int8'))).resolve())
def resolved_profile():
    model,quant=model_roots()
    cfg=json.loads((ROOT/'configs/a800-int8-dual-projection-graph.json').read_text())
    cfg['tae_path']=str(model/cfg['tae_path'])
    for key in ('dit_quantized_ckpt','proxy_quantized_ckpt'):cfg[key]=str(quant/cfg[key])
    return cfg
