import sys,tempfile,unittest
from pathlib import Path
import numpy as np
import cv2
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from media import write_frames
class FrameTests(unittest.TestCase):
 def test_rgb_and_formats(self):
  with tempfile.TemporaryDirectory() as temp:
   frames=np.zeros((2,16,16,3),np.uint8);frames[0,:,:,0]=255;frames[1,:,:,2]=255
   write_frames(temp,frames,9)
   self.assertTrue(np.array_equal(cv2.imread(str(Path(temp)/'000009.png'))[:,:,::-1],frames[0]))
   self.assertEqual(sorted(p.name for p in Path(temp).iterdir()),['000009.png','000010.png'])
   write_frames(temp,frames[:1],11,'jpeg')
   self.assertEqual(cv2.imread(str(Path(temp)/'000011.jpg')).shape,(16,16,3))

 def test_five_fps_chunk_concat(self):
  self._chunk_concat(5)
 def test_sixteen_fps_chunk_concat(self):
  self._chunk_concat(16)
 def _chunk_concat(self,fps):
  from media import encode_video,concat_chunks
  from fractions import Fraction
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);(root/'chunks').mkdir()
   a=np.zeros((11,32,32,3),np.uint8);a[:9,:,:,0]=255;a[9:,:,:,2]=255
   encode_video(root/'chunks/000000.mp4',a[:9],fps)
   encode_video(root/'chunks/000001.mp4',a[9:],fps)
   result=concat_chunks(root/'output.mp4',11,fps)
   video=result['streams'][0]
   self.assertEqual(Fraction(video['avg_frame_rate']),fps)
   self.assertAlmostEqual(float(video['duration']),11/fps,places=3)
