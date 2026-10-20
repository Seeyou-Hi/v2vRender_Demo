"""Apply resident token-local projection fusion to replicated SP weights.

SP partitions tokens only; QKV/FFN parameters remain complete on each rank.
Tensor/weight parallel, offload, lazy weights and dynamic adapters stay excluded.
"""
import os,json,torch
import torch.nn.functional as F
import torch.distributed as dist
from lightx2v.models.networks.wan.edenlive_model import EdenLiveModel
from lightx2v.common.ops.mm.optimized_linear import make_projection_group,make_gelu_linear
from a800_projection import A800PackedConvRot
original=EdenLiveModel._apply_weights
def apply(self,weight_dict=None):
 original(self,weight_dict)
 if not self.config.get('c3_dual_projection',False):return
 assert self.config.get('seq_parallel') and dist.get_world_size(self.seq_p_group)==2
 assert not any(self.config.get(k,False) for k in ('cpu_offload','lazy_load','tensor_parallel','lora_dynamic_apply'))
 assert not self.config.get('lora_configs')
 for index,block in enumerate(self.transformer_weights.blocks):
  attn,cross,ffn=block.compute_phases
  attn.self_attn_projection_group=make_projection_group((attn.self_attn_q,attn.self_attn_k,attn.self_attn_v),packed=True)
  cross.cross_kv_projection_group=make_projection_group((cross.cross_attn_k,cross.cross_attn_v))
  ffn.ffn_gelu=make_gelu_linear(ffn.ffn_2,enabled=self.config.get('use_compile',False))
  if attn.self_attn_projection_group is None:attn.self_attn_projection_group=A800PackedConvRot((attn.self_attn_q,attn.self_attn_k,attn.self_attn_v))
  if cross.cross_kv_projection_group is None:cross.cross_kv_projection_group=A800PackedConvRot((cross.cross_attn_k,cross.cross_attn_v))
  if os.environ.get('EDEN_PROJECTION_CHECK')=='1' and index in (0,15,len(self.transformer_weights.blocks)-1):
   phase=attn;group=phase.self_attn_projection_group
   gen=torch.Generator(device=phase.self_attn_q.weight.device).manual_seed(12345)
   x=torch.randn((512,self.config['dim']),dtype=torch.bfloat16,device=phase.self_attn_q.weight.device,generator=gen)
   actual=group.apply(x);expected=tuple(m.apply(x) for m in (phase.self_attn_q,phase.self_attn_k,phase.self_attn_v))
   errors=[(a.float()-e.float()).square().mean().sqrt().div(e.float().square().mean().sqrt().clamp_min(1e-12)).item()for a,e in zip(actual,expected)]
   print('PROJECTION_CHECK',json.dumps({'rank':dist.get_rank(),'block':index,'relative_rmse':errors}),flush=True)
   assert max(errors)<0.001
   if index==0:
    hidden=torch.randn((512,ffn.ffn_2.weight.shape[1]),dtype=torch.bfloat16,device=x.device,generator=gen)
    reference=torch.compile(lambda h:ffn.ffn_2.apply(F.gelu(h,approximate='tanh')),options={'emulate_precision_casts':True})(hidden)
    fused=ffn.ffn_gelu.apply(hidden)
    gelu_error=(fused.float()-reference.float()).square().mean().sqrt().div(reference.float().square().mean().sqrt().clamp_min(1e-12)).item()
    print('GELU_CHECK',json.dumps({'rank':dist.get_rank(),'relative_rmse':gelu_error}),flush=True)
    assert gelu_error<0.005
 print('DUAL_PROJECTION_ENABLED',dist.get_rank(),len(self.transformer_weights.blocks),flush=True)
EdenLiveModel._apply_weights=apply
