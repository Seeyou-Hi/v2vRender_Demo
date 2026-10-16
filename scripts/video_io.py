"""Project video contract: MP4 / H.264 Main / yuv420p / faststart."""
import json,os,subprocess
from pathlib import Path
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parents[1]
FFMPEG=imageio_ffmpeg.get_ffmpeg_exe()
FFPROBE=os.environ.get('FFPROBE','ffprobe')
def probe(path):
 return json.loads(subprocess.check_output([FFPROBE,'-v','error','-count_frames','-show_streams','-show_format','-of','json',str(path)]))
def validate(path,frames=None,size=None):
 j=probe(path);vs=[s for s in j['streams'] if s['codec_type']=='video'];assert len(vs)==1,j
 v=vs[0];assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p',v
 assert all(s['codec_name']=='aac' for s in j['streams'] if s['codec_type']=='audio'),j
 if frames is not None:assert int(v['nb_read_frames'])==frames,(v,frames)
 if size is not None:assert (v['width'],v['height'])==size,(v,size)
 subprocess.run([FFMPEG,'-v','error','-xerror','-i',str(path),'-f','null','-'],check=True)
 return j
class H264Writer:
 def __init__(self,path,fps,size):
  self.path=Path(path);self.tmp=self.path.with_name(self.path.stem+'.encoding.mp4');self.size=size;self.frames=0
  w,h=size;assert w%2==0 and h%2==0;assert fps>0
  self.proc=subprocess.Popen([FFMPEG,'-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-r',str(fps),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-profile:v','main','-pix_fmt','yuv420p','-movflags','+faststart',str(self.tmp)],stdin=subprocess.PIPE)
 def write(self,frame):
  assert frame.shape==(self.size[1],self.size[0],3) and str(frame.dtype)=='uint8'
  self.proc.stdin.write(frame.tobytes());self.frames+=1
 def release(self):
  self.proc.stdin.close()
  if self.proc.wait()!=0:raise RuntimeError('H264 encoding failed')
  validate(self.tmp,self.frames,self.size);os.replace(self.tmp,self.path)
