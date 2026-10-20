"""Deployment-owned native-pipeline A/B recording and exact input replay."""
import functools
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path
import numpy as np
from PIL import Image

BASE=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('EDEN_RECORD_DIR', str(BASE/'runs/recordings'))).resolve()
SETTINGS={'dynamic':True,'test_case':'off'}
STATUS={}


def append(path, row):
    with path.open('a') as f:
        f.write(json.dumps(row,ensure_ascii=False)+'\n')


class ReplayGame:
    def __init__(self):
        self.rows=[json.loads(line) for line in (OUT/'input/states.jsonl').read_text().splitlines()]
        self.index=0
        self.hello=json.loads((OUT/'input/renderer.json').read_text())
    def next(self,cancel):
        if cancel.is_set():return None
        i=min(self.index,len(self.rows)-1);state=dict(self.rows[i]);state['frame']=self.index
        self.index+=1
        rgb=np.asarray(Image.open(OUT/f'input/frames/{i:06d}.png').convert('RGB'))
        return rgb[None], [state]
    def send(self,value):pass
    def close(self):pass


class Recorder:
    def __init__(self, case, dynamic):
        self.case=case;self.dynamic=dynamic;self.count=0;self.done_at=None;self.done=False;self.proc=None
        self.directory=OUT/('input' if case=='capture' else case)
        self.directory.mkdir(parents=True,exist_ok=True)
        for name in ('states.jsonl','chunks.jsonl','prompts.jsonl','timing.jsonl'):
            p=self.directory/name
            if p.exists():p.unlink()
        if case=='capture':(self.directory/'frames').mkdir(exist_ok=True)
        self.max_frames=None if case=='capture' else len((OUT/'input/states.jsonl').read_text().splitlines())
        STATUS.clear();STATUS.update(case=case,dynamic=dynamic,frames=0,complete=False)
    def input_chunk(self,images,states,events):
        if self.case=='capture' and not self.done:
            for rgb,state in zip(images,states):
                i=self.count
                path=self.directory/f'frames/{i:06d}.png'
                Image.fromarray(rgb).save(path,compress_level=1)
                append(self.directory/'states.jsonl',dict(state,pixel_sha256=hashlib.sha256(rgb.tobytes()).hexdigest()))
                self.count+=1
                if state.get('demo',{}).get('state')=='done' and self.done_at is None:self.done_at=self.count
            if self.done_at and self.count>=self.done_at+24:
                self.done=True
                (self.directory/'DONE.json').write_text(json.dumps({'frames':self.count,'demo_done_frame':self.done_at,'resolution':[1280,704],'fps':24},indent=2))
            STATUS.update(frames=self.count,complete=self.done)
        append(self.directory/'chunks.jsonl',{'first':states[0]['frame'],'last':states[-1]['frame'],'events':events,'dynamic':self.dynamic})
    def output_chunk(self,video,ar_index,generate_s):
        if self.case=='capture' or self.done:return
        import torch
        # Native Game5B decoded tensor: T,C,H,W, range [-1,1].
        assert video.ndim==4 and video.shape[1]==3,tuple(video.shape)
        n=min(int(video.shape[0]), self.max_frames-self.count)
        pixels=((video[:n].detach().float().clamp(-1,1)+1)*127.5).round().byte().permute(0,2,3,1).cpu().numpy()
        if self.proc is None:
            import imageio_ffmpeg
            self.log=(self.directory/'encode.log').open('w')
            self.proc=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-f','rawvideo','-pixel_format','rgb24','-video_size','1280x704','-framerate','24','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(self.directory/'output.mp4')],stdin=subprocess.PIPE,stdout=self.log,stderr=self.log)
        t=time.perf_counter();self.proc.stdin.write(pixels.tobytes());self.count+=n
        append(self.directory/'timing.jsonl',{'ar_index':ar_index,'frames':n,'generate_s':generate_s,'record_write_s':time.perf_counter()-t,'peak_allocated_bytes':torch.cuda.max_memory_allocated(),'peak_reserved_bytes':torch.cuda.max_memory_reserved()})
        if self.count>=self.max_frames:
            self.close();self.done=True
            (self.directory/'DONE.json').write_text(json.dumps({'frames':self.count,'dynamic':self.dynamic,'seed':2026092901,'text_encoder_resident_in_both_arms':True},indent=2))
        STATUS.update(frames=self.count,complete=self.done)
    def close(self):
        if self.proc:
            self.proc.stdin.close();rc=self.proc.wait(timeout=60);self.log.close();self.proc=None
            if rc:raise RuntimeError(f'Output encode failed: {rc}')


def install_hooks():
    from flashdreams.infra.encoder.text.umt5 import UMT5TextEncoder, prompt_clean
    original_text_forward=UMT5TextEncoder.forward
    @functools.wraps(original_text_forward)
    def text_forward(self, input):
        counts=[len(self.tokenizer(prompt_clean(t),add_special_tokens=True,truncation=False)['input_ids']) for t in input]
        STATUS['text_token_counts']=counts
        if max(counts)>512:
            raise ValueError(f'Arm prompt would truncate at 512 tokens: {counts}')
        return original_text_forward(self,input)
    UMT5TextEncoder.forward=text_forward
    from eden.apps.game2v import session
    from eden.impl.game5b.pipeline import Game5BInferencePipeline
    original_compose=session._compose_chunk_prompt
    def compose(state):
        result=original_compose(state)
        row={'ar_index':state.ar_index,'first_frame':None,'last_frame':None,'static_prompt':result[0],'event_lines':list(result[1]),'active_prompt':state.active_prompt,'text_encode_s':state.prompt_encode_s}
        if state.last_game_chunk:
            frames=state.last_game_chunk.frames
            if frames:
                row.update(first_frame=frames[0].ui_state.get('source_frame'),last_frame=frames[-1].ui_state.get('source_frame'))
        STATUS['prompt']=row
        import arm_adapter
        renderer=arm_adapter.ACTIVE_RENDERER
        if renderer and renderer.recorder:append(renderer.recorder.directory/'prompts.jsonl',row)
        return result
    session._compose_chunk_prompt=compose
    original_initialize=Game5BInferencePipeline.initialize_cache
    @functools.wraps(original_initialize)
    def initialize(self,*args,**kwargs):
        # Match stochastic draws across the controlled replays only.
        if SETTINGS['test_case'] in ('static','dynamic','static-repeat'):
            self.diffusion_model._rng=None;self.diffusion_model._initial_video_noise=None
        return original_initialize(self,*args,**kwargs)
    Game5BInferencePipeline.initialize_cache=initialize
    original_generate=Game5BInferencePipeline.generate
    @functools.wraps(original_generate)
    def generate(self,*args,**kwargs):
        import torch,arm_adapter
        renderer=arm_adapter.ACTIVE_RENDERER
        recording=renderer and renderer.recorder and renderer.recorder.case!='capture' and not renderer.recorder.done
        if recording:torch.cuda.synchronize()
        started=time.perf_counter();video=original_generate(self,*args,**kwargs)
        if recording:
            torch.cuda.synchronize();elapsed=time.perf_counter()-started
            renderer.recorder.output_chunk(video,kwargs['autoregressive_index'],elapsed)
        return video
    Game5BInferencePipeline.generate=generate
