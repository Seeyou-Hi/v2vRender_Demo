import torch
import torch.distributed as dist
from attention_tp import RowParallelLinear,relative_error
from krea_ffn_parallel import ParallelFFN

def bf16_row(self,x):
 y=torch.nn.functional.linear(x,self.weight)
 assert y.dtype==torch.bfloat16
 dist.all_reduce(y)
 z=y.float()
 if self.bias is not None:z=z+self.bias.float()
 return z.to(x.dtype)

def bf16_ffn(self,x):
 y=self.down(self.act(self.up(x)))
 assert y.dtype==torch.bfloat16
 dist.all_reduce(y)
 z=y.float()
 if self.bias is not None:z=z+self.bias.float()
 return z.to(y.dtype)

def apply_modes(model,mode):
 report={}
 if 'bf16' in mode:
  checks=[]
  for cls,forward in [(RowParallelLinear,bf16_row),(ParallelFFN,bf16_ffn)]:
   m=next(m for m in model.modules() if isinstance(m,cls));width=m.in_features if cls is RowParallelLinear else m.up.in_features
   p=next(m.parameters());g=torch.Generator(device=p.device).manual_seed(332)
   x=torch.randn((1,128,width),device=p.device,dtype=p.dtype,generator=g)
   with torch.inference_mode():expected=m(x)
   cls.forward=forward
   with torch.inference_mode():actual=m(x)
   error=relative_error(actual,expected);assert error['finite'] and error['relative_rmse']<0.03,error
   checks.append(dict(kind=cls.__name__,error=error))
  report['bf16_output_collectives']=checks
 return report

def compile_blocks(model):
 targets=[(n,m) for n,m in model.named_modules() if hasattr(m,'self_attn') and hasattr(m,'cross_attn') and hasattr(m,'ffn')]
 for n,m in targets:m.compile(fullgraph=False,dynamic=False,mode='default')
 assert len(targets)==48,len(targets)
 return dict(count=len(targets),names=[n for n,m in targets],fullgraph=False,note='Graph breaks permitted for KV cache Python bookkeeping; no claim of one whole graph.')
