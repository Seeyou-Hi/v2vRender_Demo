"""Aligned 8-bit control input and browser-compatible output."""
from pathlib import Path
import json
import shutil
import subprocess
import os
import numpy as np


def read_control(path, width=640, height=384, fps=16, kind='depth', source_fps=None):
    import cv2
    path = Path(path)
    if path.suffix == '.npy':
        a = np.load(path, mmap_mode='r', allow_pickle=False)
        if a.dtype != np.uint8 or a.ndim != 4 or a.shape[1:] != (height,width,3) or len(a)==0:
            raise ValueError('NPY must be nonempty uint8 [T,384,640,3], RGB, already sampled at 16 FPS')
        # NPY is already a prepared condition, including when kind=canny.
        return a
    if path.is_dir():
        files = sorted(path.glob('*.png'))
        if not files or not source_fps or source_fps <= 0:
            raise ValueError('PNG directory needs frames and positive --source-fps')
        frames = [cv2.imread(str(p),cv2.IMREAD_UNCHANGED) for p in files]
        input_fps = source_fps
    else:
        cap = cv2.VideoCapture(str(path))
        input_fps = source_fps or cap.get(cv2.CAP_PROP_FPS)
        frames = []
        while True:
            ok, frame = cap.read()
            if not ok: break
            frames.append(frame)
        cap.release()
    if not frames or not input_fps or input_fps <= 0:
        raise ValueError('Empty/unreadable control or invalid FPS')
    prepared = []
    for frame in frames:
        if frame is None or frame.dtype != np.uint8:
            raise ValueError('Supply normalized 8-bit depth; raw metric/16-bit depth requires frontend normalization')
        if kind == 'canny':
            frame = cv2.Canny(frame,100,200)
        if frame.ndim == 2: frame = cv2.cvtColor(frame,cv2.COLOR_GRAY2BGR)
        elif frame.shape[2] == 4: frame = cv2.cvtColor(frame,cv2.COLOR_BGRA2BGR)
        h,w = frame.shape[:2]; scale = min(width/w,height/h)
        nw,nh = round(w*scale),round(h*scale)
        frame = cv2.resize(frame,(nw,nh),interpolation=cv2.INTER_AREA)
        out = np.zeros((height,width,3),dtype=np.uint8)
        y,x = (height-nh)//2,(width-nw)//2
        out[y:y+nh,x:x+nw] = frame[:,:,::-1]
        prepared.append(out)
    count = int(len(prepared)/input_fps*fps + 1e-8)
    if count < 1: raise ValueError('Input duration less than one output frame')
    return np.stack([prepared[min(int(i*input_fps/fps+1e-7),len(prepared)-1)] for i in range(count)])


def encode_video(path, frames, fps=16):
    import imageio_ffmpeg
    path = Path(path); temp = path.with_name(path.stem+'.encoding.mp4')
    ffmpeg = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
    h,w = frames.shape[1:3]
    proc = subprocess.Popen([ffmpeg,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24',
        '-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0','-an','-c:v','libx264','-threads','2',
        '-preset','fast','-crf','18','-profile:v','main','-pix_fmt','yuv420p','-movflags','+faststart',str(temp)],stdin=subprocess.PIPE)
    try:
        for frame in frames: proc.stdin.write(np.ascontiguousarray(frame).tobytes())
    finally:
        proc.stdin.close()
        code = proc.wait()
    if code: raise RuntimeError('ffmpeg encoding failed')
    subprocess.run([ffmpeg,'-v','error','-xerror','-i',str(temp),'-f','null','-'],check=True)
    probe = os.environ.get('FFPROBE') or shutil.which('ffprobe')
    if not probe: raise RuntimeError('Install ffprobe (system ffmpeg package)')
    info = json.loads(subprocess.check_output([probe,'-v','error','-count_frames','-show_streams','-of','json',str(temp)]))
    video = next(s for s in info['streams'] if s['codec_type']=='video')
    assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p'
    assert int(video['nb_read_frames'])==len(frames)
    temp.replace(path)
    return info
