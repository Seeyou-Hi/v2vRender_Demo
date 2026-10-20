"""Explicit two-rank graph extension, opt-in and validated against compiled execution.

The sequence shards are equal-sized, text KV is replicated, history stores global
KV on both ranks, and captured all-gathers use the existing sequence group.
No hardware or allocation guards are changed. Cache-commit shortcut stays off.
"""
import math
import torch.distributed as dist
from lightx2v.models.networks.wan.infer.edenlive.transformer_infer import EdenLiveARTransformerInfer
original_init=EdenLiveARTransformerInfer.__init__
def initialize(self,config):
    original_init(self,config)
    if config.get('c3_dual_graph',False):
        assert self.seq_parallel and dist.get_world_size(self.seq_p_group)==2
        assert config['cross_attn_1_type']=='c3_sdpa_prepared_bf16'
        assert self.reuse_cross_kv and self.reuse_history
        self.reuse_quantized_cross_kv=True
EdenLiveARTransformerInfer.__init__=initialize
original_can=EdenLiveARTransformerInfer._can_graph_stack
def eligible(self,pre):
    if not self.config.get('c3_dual_graph',False):return original_can(self,pre)
    ar=self.config['ar_config'];frames,height,width=pre.grid_sizes.tuple
    return (self.cuda_graph_stack is not None and self.use_compile
        and self.compile_backend=='default' and self.config.get('dit_quant_scheme')=='int8-convrot'
        and self.seq_parallel and dist.get_world_size(self.seq_p_group)==2
        and math.prod(pre.grid_sizes.tuple)%2==0 and pre.x.shape[0]*2==math.prod(pre.grid_sizes.tuple)
        and self.reuse_history and self.reuse_quantized_cross_kv
        and not self.config.get('tensor_parallel',False) and not self.config.get('lazy_load',False)
        and not self.has_image_context and not self.config.get('lora_configs')
        and not self.config.get('lora_dynamic_apply',False)
        and pre.adapter_args.get('text_segments') is None and pre.x.is_cuda
        and frames==ar['num_frame_per_chunk'] and self._visible_frames(frames)==ar['local_attn_size']
        and (height,width)==tuple(s//v//p for s,v,p in zip(self.config['size'],self.config['vae_stride'][1:],self.config['patch_size'][1:])))
EdenLiveARTransformerInfer._can_graph_stack=eligible

# F.pad with zero padding still allocates: a new RoPE pointer invalidates the
# captured graph each diffusion step. Keep local RoPE views stable on equal shards.
from lightx2v.models.networks.wan.infer.edenlive.transformer_infer import EdenLiveTransformerInfer
from lightx2v.models.networks.wan.infer.offload.transformer_infer import WanOffloadTransformerInfer
import torch.nn.functional as F
original_infer=EdenLiveTransformerInfer.infer
def infer_with_stable_local_rope(self,weights,pre):
 if not self.seq_parallel:return original_infer(self,weights,pre)
 self.current_pre=pre
 frames,height,width=pre.grid_sizes.tuple
 key=(self._visible_frames(frames),height,width,pre.x.device)
 if key not in self.freqs_cache:self.freqs_cache[key]=self._freqs(*key)
 self.key_freqs=self.freqs_cache[key]
 tokens=frames*height*width;start=pre.adapter_args['seq_start'];padding=(-tokens)%dist.get_world_size(self.seq_p_group)
 query=self.key_freqs[-tokens:]
 if padding:
  cache=getattr(self,'_dual_padded_freqs',{})
  padded_key=(key,frames,padding)
  if padded_key not in cache:cache[padded_key]=F.pad(query,(0,0,0,0,0,padding))
  self._dual_padded_freqs=cache;query=cache[padded_key]
 self.query_freqs=query[start:start+pre.x.shape[0]]
 return WanOffloadTransformerInfer.infer(self,weights,pre)
EdenLiveTransformerInfer.infer=infer_with_stable_local_rope
