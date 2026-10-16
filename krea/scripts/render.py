"""Krea/VACE backend, launched with torchrun (1, 2 or 4 GPUs)."""
import argparse
import json
import os
from pathlib import Path
import sys
import time
import traceback
import warnings
from config import ROOT, load_config

os.environ.setdefault('HF_HUB_OFFLINE','1')
os.environ.setdefault('TRANSFORMERS_OFFLINE','1')
os.environ['DISABLE_SAGEATTENTION']='1'
sys.path.insert(0,str(ROOT/'third_party/Scope/src'))


def main(resident=None):
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config',required=True)
    inputs=ap.add_mutually_exclusive_group(required=True)
    inputs.add_argument('--stream-dir',help='Ordered live RGB24 inbox; preserves model and caches for this session')
    inputs.add_argument('--control',help='8-bit depth video/PNG directory, RGB video for Canny, or prepared NPY')
    ap.add_argument('--control-kind',choices=['depth','canny'],default='depth')
    ap.add_argument('--source-fps',type=float)
    ap.add_argument('--input-fps',type=int,choices=[5,16],default=None,help='Stream timeline FPS; defaults to 16 for compatibility, no resampling')
    ap.add_argument('--reference',help='Aligned reference image, injected on first chunk only')
    ap.add_argument('--prompt-file',default=str(ROOT/'configs/robot_realism.txt'))
    ap.add_argument('--variant',choices=['bf16','bf16_blocks'])
    ap.add_argument('--output',required=True)
    ap.add_argument('--write-chunks',action='store_true',help='Encode each generated chunk on rank 0 as it becomes available')
    ap.add_argument('--save-array',action='store_true')
    ap.add_argument('--output-mode',choices=['video','frames'],default='video')
    ap.add_argument('--frame-format',choices=['png','jpeg'],default='png')
    ap.add_argument('--save-mp4',action=argparse.BooleanOptionalAction,default=None)
    args=ap.parse_args()
    save_mp4=args.save_mp4 if args.save_mp4 is not None else args.output_mode=='video'
    if not args.stream_dir and (args.output_mode!='video' or not save_mp4):
        ap.error('Frame-only output is supported for --stream-dir only')
    if args.output_mode=='video' and not save_mp4:
        ap.error('video output requires MP4; select --output-mode frames')
    cfg=load_config(args.config)
    if args.variant: cfg['variant']=args.variant
    if args.input_fps is not None and not args.stream_dir:ap.error('--input-fps requires --stream-dir')
    if args.stream_dir:cfg['fps']=args.input_fps or 16
    import numpy as np
    import torch
    import torch.distributed as dist
    import torch._dynamo
    from omegaconf import OmegaConf
    from media import read_control,encode_video,concat_chunks,write_frames
    world=int(os.environ.get('WORLD_SIZE','1'))
    if os.environ.get('SLURM_JOB_ID'):
        # C3 isolation verifier is optional elsewhere, mandatory under C3 launcher.
        if os.environ.get('KREA_C3_ISOLATION')=='1':
            from c3_validation import validate_worker
            validate_worker()
    if world not in (1,2,4): raise ValueError('Launch using torchrun --nproc_per_node=1, 2 or 4')
    torch.cuda.set_device(int(os.environ.get('LOCAL_RANK','0')))
    if world > 1 and not dist.is_initialized(): dist.init_process_group('nccl')
    rank=dist.get_rank() if world > 1 else 0
    barrier=dist.barrier if world > 1 else lambda: None
    outdir=Path(args.output).resolve()
    # The barrier propagates directory readiness. Rank 0 refuses any existing run.
    if rank==0: outdir.mkdir(parents=True,exist_ok=False)
    barrier()
    def save(name,data):
        if rank==0:
            p=outdir/name;t=p.with_suffix(p.suffix+'.tmp')
            t.write_text(json.dumps(data,indent=2,default=str));t.replace(p)
    try:
        torch.set_num_threads(8);torch.set_grad_enabled(False);torch.manual_seed(cfg['seed'])
        torch._dynamo.config.recompile_limit=32
        warnings.filterwarnings('error',message='flex_attention called without torch.compile.*')
        data=None if args.stream_dir else read_control(args.control,cfg['width'],cfg['height'],cfg['fps'],args.control_kind,args.source_fps)
        prompt=Path(args.prompt_file).read_text()
        reference=str(Path(args.reference).resolve()) if args.reference else None
        if reference and not Path(reference).is_file(): raise FileNotFoundError(reference)
        save('config.json',dict(config=cfg,input=str(Path(args.stream_dir or args.control).resolve()),control_kind=args.control_kind,reference=reference,prompt=prompt,world_size=world,output_mode=args.output_mode,frame_format=args.frame_format,save_mp4=save_mp4))
        save('environment.json',dict(torch=torch.__version__,cuda_runtime=torch.version.cuda,python=sys.version,devices=[torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]))
        save('status.json',dict(status='loading'))
        if resident is not None and 'pipe' in resident:
            pipe=resident['pipe'];report=resident['report'];load_seconds=0.0
            cfg['warmup_frames']=0
            from attention_tp import inspect_cache
            save('audits.json',dict(report,resident_reused=True))
        else:
            start=time.perf_counter()
            modelcfg=OmegaConf.load(ROOT/'third_party/Scope/src/scope/core/pipelines/krea_realtime_video/model.yaml')
            modelargs={k:cfg[k] for k in ['model_dir','generator_path','vace_path','text_encoder_path','tokenizer_path','vae_path','height','width']}
            modelargs.update(model_config=modelcfg,vae_type='tae',base_seed=cfg['seed'])
            from scope.core.pipelines.krea_realtime_video.pipeline import KreaRealtimeVideoPipeline
            original_load=torch.nn.Module.load_state_dict;audits=[]
            def audited_load(module,*a,**kw):
                result=original_load(module,*a,**kw)
                if type(module).__name__=='CausalWanModel':
                    audits.append(dict(missing=result.missing_keys,unexpected=result.unexpected_keys))
                    if result.missing_keys or result.unexpected_keys: raise RuntimeError(f'Incomplete base model: {audits[-1]}')
                return result
            torch.nn.Module.load_state_dict=audited_load
            try:
                pipe=KreaRealtimeVideoPipeline(OmegaConf.create(modelargs),device=torch.device('cuda'),dtype=torch.bfloat16,compile=False)
            finally: torch.nn.Module.load_state_dict=original_load
            assert audits and pipe.vace_enabled
            model=pipe.components.generator.model
            report={'base_loading':audits}
            if world == 1:
                from single_compile import apply_single_compile,inspect_cache
                variant='blocks' if cfg['variant']=='bf16_blocks' else 'fused'
                report['single_compile']=apply_single_compile(model,variant)
            else:
                from attention_tp import apply_attention_parallel,inspect_cache
                from krea_ffn_parallel import apply_ffn_parallel
                from opt_variants import apply_modes,compile_blocks
                from fuse_parallel import apply_fused_parallel
                report['attention']=apply_attention_parallel(pipe)
                report['ffn']=apply_ffn_parallel(model)
                report['variant']=apply_modes(model,cfg['variant'])
                report['submodule_compile']=apply_fused_parallel(model)
                if cfg['variant']=='bf16_blocks': report['block_compile']=compile_blocks(model)
            save('audits.json',report)
            torch._dynamo.reset()
            torch.cuda.synchronize();load_seconds=time.perf_counter()-start
            if resident is not None:resident.update(pipe=pipe,report=report)
        def reset():
            # BOTH resets are required; VACE encoder cache leakage causes first-chunk jumps.
            pipe.blocks.sub_blocks['vace_encoding'].clear_encoder_caches()
            pipe.first_call=True;pipe.last_mode=None
        def infer(a,i,lo,measured,total=None):
            native=9 if i==0 else 12
            count=len(a)
            a=np.concatenate([a,np.repeat(a[-1:],native-count,axis=0)])
            t0=time.perf_counter()
            x=torch.from_numpy(a).to('cuda',dtype=torch.bfloat16).permute(3,0,1,2).unsqueeze(0)/127.5-1
            with torch.inference_mode():
                video=pipe(prompts=[dict(text=prompt,weight=1.0)],base_seed=cfg['seed'],vace_input_frames=x,vace_context_scale=1.0,denoising_step_list=[1000,750,500,250],temporal_interpolation_steps=0,**({'vace_ref_images':[reference]} if i==0 and reference else {}))['video']
            torch.cuda.synchronize();dt=time.perf_counter()-t0
            assert video.shape==(native,cfg['height'],cfg['width'],3) and torch.isfinite(video).all()
            # Only the publishing rank needs RGB bytes on the host. Other ranks keep
            # participating in attention/FFN collectives and synchronized input consumption.
            pixels=video[:count].clamp(0,1).mul(255).round().byte().cpu().numpy() if rank==0 and measured else None
            row=dict(chunk=i,input_start=lo,input_end=lo+count,compute_seconds=dt,native_generated_frames=native,output_frames=count,cache=inspect_cache(pipe))
            if rank==0 and measured:
                if args.stream_dir and args.output_mode=='frames':
                    write_frames(outdir/'frames',pixels,lo,args.frame_format)
                if (args.stream_dir and save_mp4) or (not args.stream_dir and args.write_chunks):
                    chunks=outdir/'chunks';chunks.mkdir(exist_ok=True)
                    encode_video(chunks/f'{i:06d}.mp4',pixels,cfg['fps'])
                save('status.json',dict(status='rendering',completed_chunks=i+1,delivered_frames=lo+count,**({'total_frames':total} if total is not None else {})))
                print(json.dumps(row),flush=True)
            return pixels,row
        def replay(control,measured):
            reset();frames=[];rows=[]
            for i,lo in enumerate([0]+list(range(9,len(control),12))):
                pixels,row=infer(np.array(control[lo:lo+(9 if i==0 else 12)]),i,lo,measured,len(control))
                rows.append(row)
                if rank==0 and measured:frames.append(pixels)
            return frames,rows
        if args.stream_dir:
            from stream_input import read_stream
            import itertools
            source=iter(read_stream(args.stream_dir,rank,barrier))
            save('status.json',dict(status='waiting_input',completed_chunks=0,delivered_frames=0))
            first=next(source,None)
            if first is None:raise ValueError('Empty stream')
            if cfg['warmup_frames']:
                save('status.json',dict(status='warming_up'))
                replay(np.repeat(first[:1],cfg['warmup_frames'],axis=0),False)
            reset();rows=[];delivered=0
            torch.cuda.reset_peak_memory_stats();wall=time.perf_counter()
            for i,control in enumerate(itertools.chain([first],source)):
                if args.control_kind=='canny':
                    import cv2
                    control=np.stack([np.repeat(cv2.Canny(cv2.cvtColor(f,cv2.COLOR_RGB2GRAY),100,200)[:,:,None],3,axis=2) for f in control])
                _,row=infer(control,i,delivered,True)
                rows.append(row);delivered+=len(control)
                if rank==0:save('status.json',dict(status='waiting_input',completed_chunks=i+1,delivered_frames=delivered))
            if rank==0:
                if save_mp4:
                    save('status.json',dict(status='encoding_output',completed_chunks=len(rows),delivered_frames=delivered))
                    validation=concat_chunks(outdir/'output.mp4',delivered,cfg['fps'])
                    save('validation.json',validation)
                compute=sum(r['compute_seconds'] for r in rows)
                steady=sum(r['compute_seconds'] for r in rows[1:])
                save('profile.json',dict(compute_seconds=compute,delivered_fps=delivered/compute,steady_generated_fps=sum(r['native_generated_frames'] for r in rows[1:])/steady if steady else None,mode='stream',input_fps=cfg['fps'],output_fps=cfg['fps'],output_mode=args.output_mode,frame_format=args.frame_format,save_mp4=save_mp4,world_size=world,variant=cfg['variant'],load_seconds=load_seconds,delivered_frames=delivered,render_and_encode_seconds=time.perf_counter()-wall,chunks=rows))
                save('status.json',dict(status='completed',completed_chunks=len(rows),delivered_frames=delivered,output='output.mp4' if save_mp4 else None,frames_dir='frames' if args.output_mode=='frames' else None))
            barrier()
            return
        if cfg['warmup_frames']:
            save('status.json',dict(status='warming_up'))
            replay(data[:cfg['warmup_frames']],False)
        torch.cuda.reset_peak_memory_stats();wall=time.perf_counter()
        frames,rows=replay(data,True)
        if rank==0:
            pixels=np.concatenate(frames)
            if args.save_array: np.save(outdir/'output_uint8.npy',pixels)
            validation=encode_video(outdir/'output.mp4',pixels,cfg['fps'])
            compute=sum(r['compute_seconds'] for r in rows)
            steady=sum(r['compute_seconds'] for r in rows[1:])
            save('profile.json',dict(variant=cfg['variant'],world_size=world,load_seconds=load_seconds,compute_seconds=compute,render_and_encode_seconds=time.perf_counter()-wall,delivered_frames=len(pixels),delivered_fps=len(pixels)/compute,steady_generated_fps=sum(r['native_generated_frames'] for r in rows[1:])/steady if steady else None,peak_allocated_gib=torch.cuda.max_memory_allocated()/2**30,chunks=rows))
            save('validation.json',validation);save('status.json',dict(status='completed',output='output.mp4'))
        barrier()
    except Exception:
        save('status.json',dict(status='failed',error=traceback.format_exc()));raise
    finally:
        if resident is None and dist.is_initialized(): dist.destroy_process_group()

if __name__=='__main__': main()
