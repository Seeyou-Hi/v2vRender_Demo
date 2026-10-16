"""Single-GPU port of the tested TP compilation policy; no collectives or weight changes."""
import torch

def apply_single_compile(model,variant):
 report={'variant':variant,'communication':'none; single GPU','weight_dtype':'unchanged BF16','counts':{}}
 if variant=='eager':return report
 blocks=[(name,m) for name,m in model.named_modules() if hasattr(m,'self_attn') and hasattr(m,'cross_attn') and hasattr(m,'ffn')]
 assert len(blocks)==48,len(blocks)
 targets=[]
 for name,block in blocks:
  targets.append((name+'.ffn',block.ffn,'ffn'))
  for an in ['self_attn','cross_attn']:
   attn=getattr(block,an)
   for key in ['norm_q','norm_k','o']:
    targets.append((name+'.'+an+'.'+key,getattr(attn,key),'output_linear' if key=='o' else 'rmsnorm'))
 assert len(targets)==336
 seen=set();checks=[]
 for name,m,kind in targets:
  report['counts'][kind]=report['counts'].get(kind,0)+1
  if kind not in seen:
   p=next(m.parameters());width=m[0].in_features if kind=='ffn' else (m.in_features if kind=='output_linear' else m.weight.numel())
   g=torch.Generator(device=p.device).manual_seed(541)
   x=torch.randn((1,32,width),device=p.device,dtype=p.dtype,generator=g)
   with torch.inference_mode():before=m(x).float()
  m.compile(fullgraph=True,dynamic=False,mode='default')
  if kind not in seen:
   with torch.inference_mode():after=m(x).float()
   rel=((after-before).square().mean().sqrt()/before.square().mean().sqrt().clamp_min(1e-8)).item()
   assert torch.isfinite(after).all() and rel<0.03,(name,rel)
   checks.append(dict(module=name,relative_rmse=rel,max_abs_error=(after-before).abs().max().item()));seen.add(kind)
 report['numerical_checks']=checks
 if variant=='blocks':
  for name,m in blocks:m.compile(fullgraph=False,dynamic=False,mode='default')
  report['compiled_transformer_blocks']=len(blocks)
  report['block_fullgraph']=False
 return report


def inspect_cache(pipe):
 kv=pipe.state.get('kv_cache');cross=pipe.state.get('crossattn_cache');model=pipe.components.generator.model
 expected_heads=model.num_heads;head_dim=model.dim//model.num_heads
 assert kv and cross
 for c in kv+cross:
  assert c['k'].shape[-2:]==(expected_heads,head_dim),c['k'].shape
  assert c['v'].shape[-2:]==(expected_heads,head_dim),c['v'].shape
 return dict(kv_layers=len(kv),kv_shape=list(kv[0]['k'].shape),cross_shape=list(cross[0]['k'].shape),kv_bytes=sum(c[k].numel()*c[k].element_size() for c in kv for k in ['k','v']),global_end=int(kv[0]['global_end_index']),local_end=int(kv[0]['local_end_index']))
