from pathlib import Path
import os,sys,json,time,traceback,subprocess
R=Path(__file__).resolve().parents[1]
import argparse,hashlib
parser=argparse.ArgumentParser(description='PAI H3 Ref2VA eight-NFE batch worker; launch with torchrun --nproc_per_node=2')
parser.add_argument('--config', required=True)
args=parser.parse_args()
config_path=Path(args.config).resolve()
C=json.loads(config_path.read_text())
def resolved(key):
 p=Path(C[key]).expanduser()
 return p.resolve() if p.is_absolute() else (config_path.parent/p).resolve()
for key in ['model_dir','lora_path','runtime_deps','input_video','output_dir']:
 C[key]=str(resolved(key))
if 'prompt_file' in C:C['prompt']=resolved('prompt_file').read_text()
C['prompt_sha256']=hashlib.sha256(C['prompt'].encode()).hexdigest()
sys.path.insert(0,C['runtime_deps'])
if os.environ.get('SLURMD_NODENAME') == 'c3' or os.environ.get('FLOW_SLURM_MULTI_ISOLATED'):
 # C3 must retain the existing isolated launch and worker validation.
 from gpu_slurm_multi_isolated import validate_worker
 validate_worker()
import torch,numpy as np
import torch.distributed as dist
from torch.distributed.fsdp import fully_shard,CPUOffloadPolicy
from inference_minimax_h3 import distributed_context_from_env,initialize_fsdp2,apply_fsdp2_to_transformer,move_unsharded_components_to_device
from diffusers import ComponentsManager,ModularPipeline
from diffusers.modular_pipelines.minimax_h3 import MiniMaxH3VideoReference
from minimax_h3_pdd import apply_pdd_lora
from video_io import H264Writer,validate,FFMPEG
LABEL='pai8';spec={'nfe':8}
RANK=int(os.environ['RANK'])
if int(os.environ.get('WORLD_SIZE','0'))!=2:raise RuntimeError('This tested configuration requires two ranks/GPUs')
D=Path(C['output_dir']);D.mkdir(parents=True,exist_ok=True)
started=time.monotonic()
status=dict(status='loading',model=LABEL,job_id=os.environ.get('SLURM_JOB_ID'),nfe=8,seed=C['seed'],prompt_sha256=C['prompt_sha256'])
def to_numpy(value):
 if torch.is_tensor(value):return value.detach().float().cpu().numpy()
 return np.asarray(value)
def save():
 p=D/('status.json' if RANK==0 else 'status_rank1.json');t=p.with_suffix('.tmp');t.write_text(json.dumps(status,indent=2));t.replace(p)
def main():
 save()
 model=Path(C['model_dir']);assert (model/'ready.json').exists()
 context=distributed_context_from_env(True);mesh=initialize_fsdp2(context)
 pipe=ModularPipeline.from_pretrained(str(model),workflow='ref2va',local_files_only=True)
 # FSDP CPU-offloaded parameters do not identify the actual execution device.
 type(pipe)._execution_device=property(lambda self: torch.device('cuda',int(os.environ['LOCAL_RANK'])))
 pipe.load_components(dtype=torch.bfloat16,pretrained_model_name_or_path=str(model),local_files_only=True)
 for name in ['text_encoder','tokenizer','processor','vae','audio_vae','transformer_ref','scheduler','audio_scheduler']:assert getattr(pipe,name,None) is not None,name
 pipe.scheduler.set_shift(12.0);pipe.audio_scheduler.set_shift(3.0)
 lora=Path(C['lora_path'])
 assert apply_pdd_lora(pipe.transformer_ref,str(lora),pipe.scheduler.shift,pipe.audio_scheduler.shift)==8
 missing=[n for n,p in pipe.transformer_ref.named_parameters() if ('lora_down' in n or 'lora_up' in n or n.startswith(('proj_out.','audio_proj_out.'))) and p.is_meta]
 assert not missing,missing
 pipe.transformer_ref.requires_grad_(False);pipe.transformer_ref.eval()
 # BF16 adapter checkpoints are evaluated in the BF16 backbone dtype; retain FP32 output heads.
 for name,p in pipe.transformer_ref.named_parameters():
  if any(k in name for k in ['lora_A','lora_B','lora_down','lora_up']):p.data=p.data.to(torch.bfloat16)
 pipe.text_encoder.requires_grad_(False);pipe.text_encoder.eval()
 policy=CPUOffloadPolicy(pin_memory=False)
 for layer in pipe.text_encoder.model.language_model.layers:fully_shard(layer,mesh=mesh,reshard_after_forward=True,offload_policy=policy)
 fully_shard(pipe.text_encoder.model,mesh=mesh,reshard_after_forward=True,offload_policy=policy)
 pipe.text_encoder.model.register_forward_hook(lambda module,args,out: module.reshard())
 if LABEL=='pai8':
  # Feed-forward operations are independent per token; chunk only that axis.
  from diffusers.models.attention import FeedForward
  for module in pipe.transformer_ref.modules():
   if isinstance(module,FeedForward):
    original=module.forward
    def chunked(hidden_states,*args,_original=original,**kwargs):
     if hidden_states.shape[-2]<=2048:return _original(hidden_states,*args,**kwargs)
     out=torch.empty_like(hidden_states)
     for start in range(0,hidden_states.shape[-2],2048):
      out[...,start:start+2048,:]=_original(hidden_states[...,start:start+2048,:],*args,**kwargs)
     return out
    module.forward=chunked
  status['ff_token_chunk_size']=2048
 apply_fsdp2_to_transformer(pipe.transformer_ref,mesh)
 move_unsharded_components_to_device(pipe,pipe.transformer_ref,context.device)
 status.update(parallelism='FSDP2',world_size=2,rank=RANK,text_encoder_cpu_offload=True)
 print('FSDP2_READY',RANK,flush=True)
 status.update(status='encoding_reference',load_seconds=time.monotonic()-started,lora_path=str(lora),video_shift=12,audio_shift=3);save()
 refs=[MiniMaxH3VideoReference.from_file(C['input_video'])]
 steps=[];step_started=[]
 def before(mod,args):
  torch.cuda.synchronize();step_started.append(time.monotonic())
  status.update(status='denoising',step_started=len(steps)+1);save();print('DENOISE_START',len(steps)+1,flush=True)
 def after(mod,args,out):
  torch.cuda.synchronize();steps.append(time.monotonic());status.update(completed_nfe=len(steps),step_seconds=[b-a for a,b in zip(step_started,steps)]);save();print('DENOISE_COMPLETE',len(steps),flush=True)
 pipe.transformer_ref.register_forward_pre_hook(before);pipe.transformer_ref.register_forward_hook(after)
 t=time.monotonic()
 with torch.inference_mode():
  result=pipe(prompt=C['prompt'],references=refs,height=C['height'],width=C['width'],num_frames=C['num_frames'],num_inference_steps=spec['nfe']+1,generator=torch.Generator().manual_seed(C['seed']),output_type='np',output=['videos','audio','sampling_rate'])
 torch.cuda.synchronize();elapsed=time.monotonic()-t
 assert len(steps)==spec['nfe'],(len(steps),spec['nfe'])
 status.update(status='encoding_output',generate_seconds=elapsed,generated_frames_per_second=C['num_frames']/elapsed,peak_allocated_gib=torch.cuda.max_memory_allocated()/1024**3);save()
 if RANK!=0:
  status.update(status='complete_non_writer',generate_seconds=elapsed);save();dist.barrier();dist.destroy_process_group();return
 frames=to_numpy(result['videos'][0]);assert len(frames)==C['num_frames'] and np.isfinite(frames).all(),frames.shape
 if frames.dtype!=np.uint8:frames=np.rint(np.clip(frames,0,1)*255).astype(np.uint8)
 writer=H264Writer(D/'output.mp4',C['fps'],(C['width'],C['height']))
 for frame in frames:writer.write(np.ascontiguousarray(frame[:,:,::-1]))
 writer.release()
 audio=result.get('audio')
 if audio is not None:
  from scipy.io.wavfile import write
  a=to_numpy(audio[0]);assert np.isfinite(a).all()
  if a.ndim==2 and a.shape[0]<=8:a=a.T
  write(str(D/'audio.wav'),int(result['sampling_rate']),a.astype(np.float32))
  subprocess.run([FFMPEG,'-v','error','-y','-i',str(D/'output.mp4'),'-i',str(D/'audio.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-movflags','+faststart',str(D/'output_mux.mp4')],check=True)
  validate(D/'output_mux.mp4',C['num_frames'],(C['width'],C['height']));(D/'output_mux.mp4').replace(D/'output.mp4');(D/'audio.wav').unlink()
 info=validate(D/'output.mp4',C['num_frames'],(C['width'],C['height']));(D/'video_validation.json').write_text(json.dumps(info,indent=2))
 status.update(status='complete',output=str(D/'output.mp4'),total_seconds=time.monotonic()-started,visual_review='pending',output_duration_seconds=C['num_frames']/C['fps']);save();print(json.dumps(status),flush=True);dist.barrier();dist.destroy_process_group()
try:main()
except BaseException as e:
 status.update(status='failed',error=repr(e),total_seconds=time.monotonic()-started);save();traceback.print_exc();raise
