"""Download pinned weights, then extract VACE tensors without changing dtype."""
import argparse
import hashlib
import json
from pathlib import Path
from config import ROOT


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--model-dir',type=Path,default=ROOT/'models')
    a=p.parse_args();root=a.model_dir.resolve();root.mkdir(parents=True,exist_ok=True)
    from huggingface_hub import hf_hub_download,snapshot_download
    from safetensors import safe_open
    from safetensors.torch import save_file
    specs=json.loads((ROOT/'configs/models.json').read_text())
    receipt=[]
    for spec in specs:
        repo=spec['repo'];revision=spec['revision']
        if 'file' in spec:
            target=root/repo.split('/')[-1]
            file=hf_hub_download(repo,spec['file'],revision=revision,local_dir=target)
            digest=sha256(file)
            if digest!=spec['local_sha256']:raise RuntimeError(f'Checksum mismatch: {file}')
            receipt.append(dict(repo=repo,revision=revision,file=spec['file'],sha256=digest))
        elif spec['purpose']=='text_encoder':
            snapshot_download(repo,revision=revision,local_dir=root/'text_encoder',allow_patterns=['models_t5_umt5-xxl-enc-bf16.pth','google/umt5-xxl/*'])
            receipt.append(spec)
        elif spec['purpose']=='vace_source':
            source=root/'vace_source';index=hf_hub_download(repo,'diffusion_pytorch_model.safetensors.index.json',revision=revision,local_dir=source)
            mapping=json.loads(Path(index).read_text())['weight_map']
            keys={k for k in mapping if k.startswith(('vace_blocks.','vace_patch_embedding.'))}
            shards=sorted({mapping[k] for k in keys})
            if not keys:raise RuntimeError('No VACE tensors in index')
            tensors={}
            for shard in shards:
                file=hf_hub_download(repo,shard,revision=revision,local_dir=source)
                with safe_open(file,framework='pt',device='cpu') as f:
                    for key in f.keys():
                        if key in keys:tensors[key]=f.get_tensor(key)
            if set(tensors)!=keys or len(keys)!=236:raise RuntimeError('Incomplete VACE checkpoint')
            output=root/'vace_krea.safetensors';temp=root/'vace_krea.tmp.safetensors'
            save_file(tensors,str(temp),metadata={'source':'Wan2.1-VACE-14B','operation':'exact tensor extraction, no dtype conversion'})
            temp.replace(output)
            receipt.append(dict(**spec,keys=len(keys),sha256=sha256(output)))
    (root/'download_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print('Models ready:',root)

if __name__=='__main__':main()
