"""A800 adapter: reuse BF16 text K/V and expose official graph protocol.

No FP8 kernels and no cached quantization are used. SageAttention's SM80
implementation still quantizes Q/K internally on each apply, as in the native
sage_attn2 backend. Upstream's graph stack accepts nested tensor containers.
"""
from lightx2v.common.ops.attn.sage_attn import SageAttn2Weight
from lightx2v.utils.registry_factory import ATTN_WEIGHT_REGISTER
@ATTN_WEIGHT_REGISTER('c3_sage_prepared_bf16')
class A800PreparedSage(SageAttn2Weight):
    def prepare_kv(self,k,v):
        return k.contiguous(),v.contiguous()
    def apply_prepared(self,q,prepared):
        return self.apply(q,*prepared)
from lightx2v.common.ops.attn.torch_sdpa import TorchSDPAWeight
@ATTN_WEIGHT_REGISTER('c3_sdpa_prepared_bf16')
class A800PreparedSDPA(TorchSDPAWeight):
    def prepare_kv(self,k,v):
        return k.contiguous(),v.contiguous()
    def apply_prepared(self,q,prepared):
        return self.apply(q,*prepared)
