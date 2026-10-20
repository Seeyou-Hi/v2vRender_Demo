"""Bounded live adapter around pinned official LightX2V AR steps and caches."""
import os,json,time,types
from pathlib import Path
import torch
import torch.distributed as dist
from lightx2v import LightX2VPipeline
from lightx2v.utils.input_info import EdenLiveInputInfo
from lightx2v.common.kvcache.manager import build_self_attn_kv_cache
from lightx2v.utils.envs import GET_DTYPE
import a800_attention,dual_projection,dual_graph
B=Path(__file__).resolve().parents[1]
MODEL_ROOT=Path(os.environ.get('EDEN_LIGHT_MODEL_ROOT',str(B.parent/'models/EdenLive-LightX2V'))).resolve()
class Engine:
 def __init__(self):
  self.pipeline=LightX2VPipeline(task='i2v',model_path=str(MODEL_ROOT),model_cls='wan22_edenlive_ar')
  self.pipeline.enable_parallel(seq_p_size=2)
  self.pipeline.create_generator(config_json=os.environ.get('EDEN_LIGHT_CONFIG',str(B/'runtime/model.json')))
  self.r=self.pipeline.runner;self.text={};self.index=0
  s=self.r.scheduler
  original_pre=s.step_pre;original_post=s.step_post
  # Store only this chunk's latent pixels. Keep the absolute cursor for cache/RoPE.
  def pre(this,step_index,chunk_start=0,cache_update=False):
   original_pre(step_index,chunk_start=0,cache_update=cache_update) if chunk_start==0 else this._prepare_step(step_index,0,3,cache_update)
   this.chunk_start=chunk_start
  def post(this):
   absolute=this.chunk_start;this.chunk_start=0
   try:
    # Original step_post pins only the initial chunk when cursor is zero.
    # For successor chunks its pin must be disabled while updating local storage.
    if absolute:
     sigma=this.sigmas[this.step_index].to(this.latents_input.dtype)
     x0=this.noise_pred.to(this.latents_input.dtype).mul(sigma).neg_().add_(this.latents_input)
     if this.step_index+1<this.infer_steps:
      noise=torch.randn(x0.shape,generator=this.generator,device=x0.device,dtype=x0.dtype)
      nxt=this.sigmas[this.step_index+1].to(x0.dtype);x0.mul_(1-nxt).add_(noise.mul_(nxt))
     this.latents[:,:x0.shape[1]]=x0
    else:original_post()
   finally:this.chunk_start=absolute
  s.step_pre=types.MethodType(pre,s);s.step_post=types.MethodType(post,s)
 @torch.inference_mode()
 def reset(self,cover,prompt):
  r=self.r;r.clear_warmup_state();self.index=0
  r.input_info=EdenLiveInputInfo(prompt=prompt,negative_prompt='',seed=2026092901,num_frames=9)
  r.input_info.latent_shape=[48,3,44,80]
  r.inputs=r._encode_inputs(cover,9)
  r.scheduler.prepare(2026092901,r.input_info.latent_shape,r.inputs['image_encoder_output'])
  ar=r.config['ar_config'];pool=build_self_attn_kv_cache(r.config,ar,ar['local_attn_size']*22*40,GET_DTYPE(),torch.device('cuda'))
  pool._init_kv_buffer();r.model.transformer_infer.cache_pools={True:pool}
  self.text={prompt:r.inputs['text_encoder_output']}
 @torch.inference_mode()
 def chunk(self,proxy,prompt):
  r=self.r;s=r.scheduler;start=self.index*3;t=time.perf_counter()
  if start:s.latents=torch.randn(s.latents.shape,generator=s.generator,device=s.latents.device,dtype=s.latents.dtype)
  if prompt not in self.text:
   r.input_info.prompt=prompt;self.text[prompt]=r.run_text_encoder(r.input_info)
   if len(self.text)>32:del self.text[next(iter(self.text))]
  r.inputs['text_encoder_output']=self.text[prompt]
  r.inputs['proxy_features']=r.proxy_encoder.infer(proxy.permute(1,0,2,3).to('cuda')).to(GET_DTYPE())
  torch.cuda.synchronize();encoded=time.perf_counter()
  r._run_steps(start,3,start+3)
  s.step_pre(s.infer_steps-1,chunk_start=start,cache_update=True);r.model.infer(r.inputs)
  torch.cuda.synchronize();denoised=time.perf_counter()
  pixels=r.vae_decoder.cached_decode_withflag(s.latents,self.index==0,False)
  torch.cuda.synchronize();done=time.perf_counter();self.index+=1
  return pixels,{'encode_s':encoded-t,'dit_commit_s':denoised-encoded,'decode_s':done-denoised,'model_s':done-t,'index':self.index-1,'graph_captures':getattr(r.model.transformer_infer.cuda_graph_stack,'capture_count',0),'peak_gb':torch.cuda.max_memory_allocated()/1e9}
