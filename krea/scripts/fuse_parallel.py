"""Compile TP submodules; preserve the selected communication precision."""
import torch
from attention_tp import GlobalRMSNorm,RowParallelLinear,relative_error
from krea_ffn_parallel import ParallelFFN

def apply_fused_parallel(model):
 audited=set();reports=[];counts={}
 for name,m in model.named_modules():
  if not isinstance(m,(GlobalRMSNorm,RowParallelLinear,ParallelFFN)):continue
  kind=type(m).__name__;counts[kind]=counts.get(kind,0)+1
  if kind not in audited:
   width=m.weight.numel() if isinstance(m,GlobalRMSNorm) else (m.in_features if isinstance(m,RowParallelLinear) else m.up.in_features)
   param=next(m.parameters());g=torch.Generator(device=param.device).manual_seed(541)
   x=torch.randn((1,32,width),device=param.device,dtype=param.dtype,generator=g)
   with torch.inference_mode():expected=m(x)
  m.compile(fullgraph=True,dynamic=False,mode='default')
  if kind not in audited:
   with torch.inference_mode():actual=m(x)
   err=relative_error(actual,expected);assert err['finite'] and err['relative_rmse']<0.03,(kind,err)
   reports.append(dict(module=name,kind=kind,error=err));audited.add(kind)
 return dict(counts=counts,numerical_checks=reports,policy='fullgraph, dynamic=False, default; selected output collective dtype retained')
