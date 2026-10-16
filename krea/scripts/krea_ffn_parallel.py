"""Inference-only FFN tensor parallelism. Attention and KV caches are handled separately by attention_tp.py.
Each rank computes a disjoint FFN intermediate slice; sums output contributions.
No training, quantization, or changes to the checkpoint.
"""
import torch
from torch import nn
import torch.distributed as dist

class ParallelFFN(nn.Module):
 def __init__(self, original, rank, world):
  super().__init__()
  up,act,down=original
  assert isinstance(up,nn.Linear) and isinstance(down,nn.Linear)
  assert up.out_features==down.in_features and up.out_features%world==0
  width=up.out_features//world;lo=rank*width;hi=lo+width
  self.up=nn.Linear(up.in_features,width,bias=up.bias is not None,device=up.weight.device,dtype=up.weight.dtype)
  self.down=nn.Linear(width,down.out_features,bias=False,device=down.weight.device,dtype=down.weight.dtype)
  self.up.weight.data.copy_(up.weight[lo:hi]);self.down.weight.data.copy_(down.weight[:,lo:hi])
  if up.bias is not None:self.up.bias.data.copy_(up.bias[lo:hi])
  self.bias=nn.Parameter(down.bias.detach().clone(),requires_grad=False) if down.bias is not None else None
  self.act=act
  self.requires_grad_(False)
 def forward(self,x):
  y=self.down(self.act(self.up(x)))
  # Accumulate rank contributions in FP32, keep backbone/output dtype unchanged.
  z=y.float();dist.all_reduce(z)
  if self.bias is not None:z=z+self.bias.float()
  return z.to(y.dtype)

def apply_ffn_parallel(model):
 rank=dist.get_rank();world=dist.get_world_size();changes=[];audit=None
 targets=[(n,m) for n,m in model.named_modules() if isinstance(getattr(m,'ffn',None),nn.Sequential) and len(m.ffn)==3]
 for name,mod in targets:
  old=mod.ffn;new=ParallelFFN(old,rank,world)
  if audit is None:
   gen=torch.Generator(device=old[0].weight.device).manual_seed(20261016)
   x=torch.randn((1,32,old[0].in_features),generator=gen,device=old[0].weight.device,dtype=old[0].weight.dtype)
   with torch.inference_mode():
    expected=old(x).float();actual=new(x).float();err=(actual-expected)
   rel=(err.square().mean().sqrt()/expected.square().mean().sqrt().clamp_min(1e-8)).item()
   audit=dict(relative_rmse=rel,max_abs_error=err.abs().max().item(),finite=bool(torch.isfinite(actual).all()))
   assert audit['finite'] and rel<0.02,audit
  mod.ffn=new;changes.append(name)
 assert changes
 torch.cuda.empty_cache()
 return dict(world_size=world,rank=rank,parallelism='FFN intermediate tensor parallel; attention/KV handled by attention_tp.py',modules=changes,layer_numerical_audit=audit)
