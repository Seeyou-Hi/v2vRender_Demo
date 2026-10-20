"""Convert only the verified 5B subset, then optionally quantize on an allocated GPU."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from paths import ROOT,EDEN,UPSTREAM,model_roots

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('action',choices=['convert','quantize'])
    p.add_argument('--source',type=Path,default=Path(os.environ.get('EDEN_MODEL_ROOT',str(EDEN/'models/EdenLive'))))
    p.add_argument('--device',default='cuda:0')
    a=p.parse_args();source=a.source.resolve();model,quant=model_roots()
    if a.action=='convert':
        subprocess.run([sys.executable,str(EDEN/'scripts/models.py'),'verify','--model-dir',str(source)],check=True)
        sys.path.insert(0,str(UPSTREAM))
        from tools.convert.convert_edenlive import convert_dit,convert_encoder,copy_tree
        model.mkdir(parents=True,exist_ok=True)
        convert_dit(source/'dit-5b',model/'dit-5b',False)
        convert_encoder(source/'umt5/text_encoder',model/'umt5/text_encoder','t5',False)
        for rel in ('umt5/tokenizer','vae-5b','decoder-5b','vision-encoder','scheduler-5b'):
            copy_tree(source/rel,model/rel,False)
        root=model
    else:
        import torch
        if a.device.startswith('cuda') and not torch.cuda.is_available():
            raise RuntimeError('Quantization requires an allocated CUDA GPU; never run this on a login node')
        quant.mkdir(parents=True,exist_ok=True)
        env=os.environ.copy();env.update(DTYPE='BF16',SENSITIVE_LAYER_DTYPE='BF16')
        subprocess.run([sys.executable,str(UPSTREAM/'tools/convert/convert_edenlive.py'),
            '--source',str(model/'dit-5b/diffusion_pytorch_model.safetensors'),'--output',str(quant),
            '--output_name','dit-5b-int8-convrot','--quantize','int8-convrot','--device',a.device],env=env,check=True)
        output=quant/'proxy-dino-int8-convrot.safetensors'
        if not output.exists():
            subprocess.run([sys.executable,str(UPSTREAM/'tools/convert/convert_edenlive_proxy.py'),
                '--source',str(model/'vision-encoder/projection.safetensors'),'--output',str(output),
                '--device',a.device,'--group-size','256'],env=env,check=True)
        root=quant
    rows=[]
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.name=='prepared-manifest.json':continue
        digest=hashlib.sha256()
        with path.open('rb') as f:
            for block in iter(lambda:f.read(8*1024*1024),b''):digest.update(block)
        rows.append({'path':str(path.relative_to(root)),'size':path.stat().st_size,'sha256':digest.hexdigest()})
    (root/'prepared-manifest.json').write_text(json.dumps({'action':a.action,'files':rows},indent=2)+'\n')
    print(f'{a.action} complete: {len(rows)} files at {root}')
if __name__=='__main__':main()
