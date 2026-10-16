"""Krea/VACE head tensor parallelism, without modifying upstream source.
Q/K RMS statistics reduce over all ranks (normalization spans ALL channels).
Each rank owns contiguous attention heads and their causal/cross KV caches.
"""
import copy
from types import SimpleNamespace
import torch
from torch import nn
import torch.distributed as dist

class GlobalRMSNorm(nn.Module):
 def __init__(self, original, lo, hi):
  super().__init__();self.eps=original.eps;self.global_dim=original.weight.numel()
  self.weight=nn.Parameter(original.weight.detach()[lo:hi].clone(),requires_grad=False)
 def forward(self,x):
  xf=x.float();ss=xf.square().sum(-1,keepdim=True)
  dist.all_reduce(ss)
  return (xf*torch.rsqrt(ss/self.global_dim+self.eps)).to(x.dtype)*self.weight

class RowParallelLinear(nn.Module):
 def __init__(self, original, lo, hi):
  super().__init__()
  self.weight=nn.Parameter(original.weight.detach()[:,lo:hi].contiguous().clone(),requires_grad=False)
  self.bias=nn.Parameter(original.bias.detach().clone(),requires_grad=False) if original.bias is not None else None
  self.in_features=hi-lo;self.out_features=original.out_features
 def forward(self,x):
  y=torch.nn.functional.linear(x,self.weight).float()
  dist.all_reduce(y)
  if self.bias is not None:y=y+self.bias.float()
  return y.to(x.dtype)

def column_slice(old,lo,hi):
 m=nn.Linear(old.in_features,hi-lo,bias=old.bias is not None,device=old.weight.device,dtype=old.weight.dtype)
 m.weight.data.copy_(old.weight[lo:hi])
 if old.bias is not None:m.bias.data.copy_(old.bias[lo:hi])
 m.requires_grad_(False);return m

def shard_attention(m):
 world=dist.get_world_size();rank=dist.get_rank();assert not getattr(m,'_head_tp',False)
 assert m.num_heads%world==0
 global_heads=m.num_heads;local_heads=global_heads//world;width=local_heads*m.head_dim;lo=rank*width;hi=lo+width
 for key in ['q','k','v']:setattr(m,key,column_slice(getattr(m,key),lo,hi))
 for key in ['norm_q','norm_k']:
  old=getattr(m,key)
  if not isinstance(old,nn.Identity):setattr(m,key,GlobalRMSNorm(old,lo,hi))
 m.o=RowParallelLinear(m.o,lo,hi);m.num_heads=local_heads;m._head_tp=True
 if hasattr(m,'fused_projections'):
  m.fused_projections=False
  if hasattr(m,'to_qkv'):del m.to_qkv
 return dict(global_heads=global_heads,local_heads=local_heads,head_dim=m.head_dim)

def patch_cache_allocators():
 from scope.core.pipelines.wan2_1 import utils
 from scope.core.pipelines.wan2_1.blocks import setup_caches
 from scope.core.pipelines.krea_realtime_video.blocks import recompute_kv_cache
 world=dist.get_world_size()
 def wrap(original):
  def allocate(generator,*args,**kwargs):
   model=generator.model
   assert model.num_heads%world==0 and model.dim%world==0
   # Cache allocation metadata only: no change to the real model's dimensions.
   proxy=SimpleNamespace(model=SimpleNamespace(num_heads=model.num_heads//world,dim=model.dim//world,blocks=model.blocks))
   return original(proxy,*args,**kwargs)
  return allocate
 for key in ['initialize_kv_cache','initialize_crossattn_cache']:
  original=getattr(utils,key);replacement=wrap(original)
  setattr(utils,key,replacement);setattr(setup_caches,key,replacement)
  if key=="initialize_kv_cache":recompute_kv_cache.initialize_kv_cache=replacement

def relative_error(a,b):
 a=a.float();b=b.float();diff=a-b
 return dict(relative_rmse=(diff.square().mean().sqrt()/b.square().mean().sqrt().clamp_min(1e-8)).item(),max_abs_error=diff.abs().max().item(),finite=bool(torch.isfinite(a).all()))

def audit_attention(model):
 """Real-checkpoint self attention: cache update, re-use, eviction; cross-attention cache."""
 world=dist.get_world_size();rank=dist.get_rank();device=next(model.parameters()).device
 sa=copy.deepcopy(model.blocks[0].self_attn);sa.frame_seq_length=128;sa.max_attention_size=384;sa.local_attn_size=3;sa.sink_size=0;sa.num_frame_per_block=1
 tp=copy.deepcopy(sa);shard_attention(tp)
 heads=sa.num_heads;dim=sa.head_dim;local=heads//world
 gen=torch.Generator(device=device).manual_seed(20261016)
 def cache(n):return dict(k=torch.zeros(1,384,n,dim,device=device,dtype=torch.bfloat16),v=torch.zeros(1,384,n,dim,device=device,dtype=torch.bfloat16),global_end_index=0,local_end_index=0)
 full_cache=cache(heads);local_cache=cache(local);rows=[]
 freqs=model.causal_wan_model.freqs.to(device)
 with torch.inference_mode():
  for chunk in [0,1,2,3,3,4]:
   x=torch.randn((1,128,model.dim),generator=gen,device=device,dtype=torch.bfloat16)
   args=dict(seq_lens=torch.tensor([128],device=device),grid_sizes=torch.tensor([[1,8,16]],device=device),freqs=freqs,block_mask=None,current_start=chunk*128,kv_cache_attention_bias=0.3)
   expected=sa(x,kv_cache=full_cache,**args);actual=tp(x,kv_cache=local_cache,**args)
   e=relative_error(actual,expected);assert e['finite'] and e['relative_rmse']<0.03,e
   assert int(full_cache['global_end_index'])==int(local_cache['global_end_index'])
   assert int(full_cache['local_end_index'])==int(local_cache['local_end_index'])
   ke=relative_error(local_cache['k'],full_cache['k'][:,:,rank*local:(rank+1)*local]);ve=relative_error(local_cache['v'],full_cache['v'][:,:,rank*local:(rank+1)*local])
   assert ke['relative_rmse']<0.02 and ve['relative_rmse']<0.02,(ke,ve)
   rows.append(dict(chunk=chunk,output=e,key=ke,value=ve,global_end=int(local_cache['global_end_index']),local_end=int(local_cache['local_end_index'])))
  ca=copy.deepcopy(model.blocks[0].cross_attn);ctp=copy.deepcopy(ca);shard_attention(ctp);fc={'is_init':False};lc={'is_init':False};cross=[]
  context=torch.randn((1,64,model.dim),generator=gen,device=device,dtype=torch.bfloat16)
  for step in range(2):
   x=torch.randn((1,128,model.dim),generator=gen,device=device,dtype=torch.bfloat16)
   expected=ca(x,context,None,crossattn_cache=fc);actual=ctp(x,context,None,crossattn_cache=lc)
   e=relative_error(actual,expected);assert e['finite'] and e['relative_rmse']<0.03,e;cross.append(e)
 del sa,tp,ca,ctp,full_cache,local_cache,fc,lc
 torch.cuda.empty_cache()
 return dict(self_attention_and_cache=rows,cross_attention_and_cache=cross)

def apply_attention_parallel(pipe):
 model=pipe.components.generator.model
 from scope.core.pipelines.krea_realtime_video.modules.causal_model import CausalWanSelfAttention
 from scope.core.pipelines.krea_realtime_video.modules.model import WanT2VCrossAttention
 audit=audit_attention(model);modules={}
 for name,m in list(model.named_modules()):
  if isinstance(m,(CausalWanSelfAttention,WanT2VCrossAttention)):modules[name]=shard_attention(m)
 assert len(modules)==96,len(modules) # 40 backbone + 8 VACE blocks, self + cross each
 patch_cache_allocators()
 pipe.state.set('kv_cache',None);pipe.state.set('crossattn_cache',None)
 torch.cuda.empty_cache()
 return dict(world_size=dist.get_world_size(),rank=dist.get_rank(),modules=modules,numerical_audit=audit)

def inspect_cache(pipe):
 kv=pipe.state.get('kv_cache');cross=pipe.state.get('crossattn_cache');model=pipe.components.generator.model
 expected_heads=model.num_heads//dist.get_world_size();head_dim=model.dim//model.num_heads
 assert kv and cross
 for c in kv+cross:
  assert c['k'].shape[-2:]==(expected_heads,head_dim),c['k'].shape
  assert c['v'].shape[-2:]==(expected_heads,head_dim),c['v'].shape
 return dict(kv_layers=len(kv),kv_shape=list(kv[0]['k'].shape),cross_shape=list(cross[0]['k'].shape),kv_bytes=sum(c[k].numel()*c[k].element_size() for c in kv for k in ['k','v']),global_end=int(kv[0]['global_end_index']),local_end=int(kv[0]['local_end_index']))
