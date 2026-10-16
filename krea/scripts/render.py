"""Krea/VACE backend, launched with torchrun (2 or 4 GPUs)."""
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


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config',required=True)
    ap.add_argument('--control',required=True,help='8-bit depth video/PNG directory, RGB video for Canny, or prepared NPY')
    ap.add_argument('--control-kind',choices=['depth','canny'],default='depth')
    ap.add_argument('--source-fps',type=float)
    ap.add_argument('--reference',help='Aligned reference image, injected on first chunk only')
    ap.add_argument('--prompt-file',default=str(ROOT/'configs/robot_realism.txt'))
    ap.add_argument('--variant',choices=['bf16','bf16_blocks'])
    ap.add_argument('--output',required=True)
    ap.add_argument('--write-chunks',action='store_true',help='Encode each generated chunk on rank 0 as it becomes available')
    ap.add_argument('--save-array',action='store_true')
    args=ap.parse_args()
    cfg=load_config(args.config)
    if args.variant: cfg['variant']=args.variant
    import numpy as np
    import torch
    import torch.distributed as dist
    import torch._dynamo
    from omegaconf import OmegaConf
    from media import read_control,encode_video
    if os.environ.get('SLURM_JOB_ID'):
        # C3 isolation verifier is optional elsewhere, mandatory under C3 launcher.
        if os.environ.get('KREA_C3_ISOLATION')=='1':
            from gpu_slurm_krea_isolated import validate_worker
            validate_worker()
    world=int(os.environ.get('WORLD_SIZE','1'))
    if world not in (2,4): raise ValueError('Launch using torchrun --nproc_per_node=2 or 4')
    torch.cuda.set_device(int(os.environ['LOCAL_RANK']))
    dist.init_process_group('nccl')
    rank=dist.get_rank()
    outdir=Path(args.output).resolve()
    # The barrier propagates directory readiness. Rank 0 refuses any existing run.
    if rank==0: outdir.mkdir(parents=True,exist_ok=False)
    dist.barrier()
    def save(name,data):
        if rank==0:
            p=outdir/name;t=p.with_suffix(p.suffix+'.tmp')
            t.write_text(json.dumps(data,indent=2,default=str));t.replace(p)
    try:
        torch.set_num_threads(8);torch.set_grad_enabled(False);torch.manual_seed(cfg['seed'])
        torch._dynamo.config.recompile_limit=32
        warnings.filterwarnings('error',message='flex_attention called without torch.compile.*')
        data=read_control(args.control,cfg['width'],cfg['height'],cfg['fps'],args.control_kind,args.source_fps)
        prompt=Path(args.prompt_file).read_text()
        reference=str(Path(args.reference).resolve()) if args.reference else None
        if reference and not Path(reference).is_file(): raise FileNotFoundError(reference)
        save('config.json',dict(config=cfg,input=str(Path(args.control).resolve()),control_kind=args.control_kind,reference=reference,prompt=prompt,world_size=world))
        save('environment.json',dict(torch=torch.__version__,cuda_runtime=torch.version.cuda,python=sys.version,devices=[torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]))
        save('status.json',dict(status='loading'))
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
        from attention_tp import apply_attention_parallel,inspect_cache
        from krea_ffn_parallel import apply_ffn_parallel
        from opt_variants import apply_modes,compile_blocks
        from fuse_parallel import apply_fused_parallel
        report={'base_loading':audits,'attention':apply_attention_parallel(pipe)}
        model=pipe.components.generator.model
        report['ffn']=apply_ffn_parallel(model)
        report['variant']=apply_modes(model,cfg['variant'])
        report['submodule_compile']=apply_fused_parallel(model)
        if cfg['variant']=='bf16_blocks': report['block_compile']=compile_blocks(model)
        save('audits.json',report)
        torch._dynamo.reset()
        torch.cuda.synchronize();load_seconds=time.perf_counter()-start
        def reset():
            # BOTH resets are required; VACE encoder cache leakage causes first-chunk jumps.
            pipe.blocks.sub_blocks['vace_encoding'].clear_encoder_caches()
            pipe.first_call=True;pipe.last_mode=None
        def replay(control,measured):
            reset();frames=[];rows=[]
            for i,lo in enumerate([0]+list(range(9,len(control),12))):
                native=9 if i==0 else 12;hi=min(lo+native,len(control))
                a=np.array(control[lo:hi]);a=np.concatenate([a,np.repeat(a[-1:],native-len(a),axis=0)])
                t0=time.perf_counter()
                x=torch.from_numpy(a).to('cuda',dtype=torch.bfloat16).permute(3,0,1,2).unsqueeze(0)/127.5-1
                with torch.inference_mode():
                    video=pipe(prompts=[dict(text=prompt,weight=1.0)],base_seed=cfg['seed'],vace_input_frames=x,vace_context_scale=1.0,denoising_step_list=[1000,750,500,250],temporal_interpolation_steps=0,**({'vace_ref_images':[reference]} if i==0 and reference else {}))['video']
                torch.cuda.synchronize();dt=time.perf_counter()-t0
                assert video.shape==(native,cfg['height'],cfg['width'],3) and torch.isfinite(video).all()
                pixels=video[:hi-lo].clamp(0,1).mul(255).round().byte().cpu().numpy()
                row=dict(chunk=i,input_start=lo,input_end=hi,compute_seconds=dt,native_generated_frames=native,output_frames=len(pixels),cache=inspect_cache(pipe))
                rows.append(row)
                if rank==0 and measured:
                    frames.append(pixels)
                    if args.write_chunks:
                        chunks=outdir/'chunks';chunks.mkdir(exist_ok=True)
                        encode_video(chunks/f'{i:06d}.mp4',pixels,cfg['fps'])
                    save('status.json',dict(status='rendering',completed_chunks=i+1,delivered_frames=hi,total_frames=len(control)))
                    print(json.dumps(row),flush=True)
            return frames,rows
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
        dist.barrier()
    except Exception:
        save('status.json',dict(status='failed',error=traceback.format_exc()));raise
    finally:
        dist.destroy_process_group()

if __name__=='__main__': main()
