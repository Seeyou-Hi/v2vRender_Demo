"""Pack replicated INT8 ConvRot linears using their existing SM80 backend.

No SM120-only fused quantizer is invoked. The original supported linear applies
once to concatenated output rows, and results split back into Q/K/V or K/V.
"""
import copy,torch
from lightx2v.common.ops.mm.mm_weight import MMWeightWint8ConvRot
class A800PackedConvRot:
 def __init__(self,modules):
  self.modules=tuple(modules);first=self.modules[0]
  assert torch.cuda.get_device_capability(first.weight.device)==(8,0)
  assert all(type(m)is MMWeightWint8ConvRot and m._convrot_groupsize==256 and not(m.has_lora_branch or m.has_diff or m.lazy_load or m.create_cuda_buffer or m.create_cpu_buffer)for m in self.modules)
  assert all(m.weight.device==first.weight.device and m.weight.dtype==torch.int8 and m.weight.shape[1]==first.weight.shape[1] and m.infer_dtype==first.infer_dtype for m in self.modules)
  self.output_dims=tuple(m.weight.shape[0]for m in self.modules)
  self.packed=copy.copy(first)
  self.packed.weight=torch.cat([m.weight for m in self.modules],dim=0)
  self.packed.weight_scale=torch.cat([m.weight_scale.reshape(-1)for m in self.modules],dim=0)
  assert self.packed.weight_scale.numel()==sum(self.output_dims)
  if first.bias is not None:
   assert all(m.bias is not None for m in self.modules)
   self.packed.bias=torch.cat([m.bias for m in self.modules],dim=0)
  else:assert all(m.bias is None for m in self.modules)
  for i,m in enumerate(self.modules):
   m.weight=self.packed.weight.split(self.output_dims,dim=0)[i]
   m.weight_scale=self.packed.weight_scale.split(self.output_dims,dim=0)[i]
   if self.packed.bias is not None:m.bias=self.packed.bias.split(self.output_dims,dim=0)[i]
 def apply(self,x):
  outputs=self.packed.apply(x).split(self.output_dims,dim=-1)
  # NCCL requires contiguous V; Q/K normalization already materializes them.
  return (*outputs[:-1],outputs[-1].contiguous())
