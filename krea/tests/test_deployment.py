import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
import urllib.error

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from config import load_config,MODEL_FILES

class DeploymentTests(unittest.TestCase):
    def test_config_paths_and_variant(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'settings.json';path.write_text('{"model_dir":"models"}')
            cfg=load_config(path,False)
            self.assertEqual(cfg['model_dir'],str(Path(temp)/'models'))
            with self.assertRaises(FileNotFoundError):load_config(path)
            path.write_text('{"variant":"typo"}')
            with self.assertRaises(ValueError):load_config(path,False)

    def test_depth_alignment_and_video_roundtrip(self):
        import cv2
        import numpy as np
        from media import read_control,encode_video
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp)/'depth';directory.mkdir()
            for i in range(5):cv2.imwrite(str(directory/f'{i:04d}.png'),np.full((720,1280),i*50,np.uint8))
            data=read_control(directory,source_fps=5)
            self.assertEqual(data.shape,(16,384,640,3))
            self.assertEqual(data[:,100,100,0].tolist(),[int(i*5/16)*50 for i in range(16)])
            self.assertTrue(np.all(data[:,:12]==0))
            encoded=encode_video(Path(temp)/'output.mp4',data)
            self.assertEqual(int(encoded['streams'][0]['nb_read_frames']),16)
            np.save(Path(temp)/'prepared.npy',data)
            self.assertTrue(np.array_equal(data,read_control(Path(temp)/'prepared.npy',kind='canny')))
            np.save(Path(temp)/'bad.npy',data.astype('float32'))
            with self.assertRaises(ValueError):read_control(Path(temp)/'bad.npy')

    def test_http_upload_queue_and_download(self):
        # Fake torchrun worker verifies adapter orchestration only, not GPU inference.
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);models=root/'models'
            for name in MODEL_FILES.values():
                target=models/name;target.parent.mkdir(parents=True,exist_ok=True)
                if name.endswith('umt5-xxl'):target.mkdir()
                else:target.touch()
            (models/'Wan2.1-T2V-14B').mkdir();(models/'Wan2.1-T2V-14B/config.json').write_text('{}')
            cfg=root/'config.json';cfg.write_text(json.dumps({'model_dir':str(models)}))
            fake=root/'fake/torch/distributed';fake.mkdir(parents=True)
            (fake.parent/'__init__.py').touch();(fake/'__init__.py').touch()
            (fake/'run.py').write_text("import sys,time,json\nfrom pathlib import Path\np=Path(sys.argv[sys.argv.index('--output')+1]);p.mkdir()\n(p/'chunks').mkdir()\n(p/'chunks/000000.mp4').write_bytes(b'chunk-fixture')\ntime.sleep(0.1)\n(p/'output.mp4').write_bytes(b'video-fixture')\n(p/'status.json').write_text(json.dumps({'status':'completed'}))\n")
            with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            env=dict(os.environ,PYTHONPATH=str(root/'fake'))
            proc=subprocess.Popen([sys.executable,str(ROOT/'scripts/server.py'),'--config',str(cfg),'--port',str(port),'--storage',str(root/'jobs')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            base=f'http://127.0.0.1:{port}'
            def request(path,data=None):
                with urllib.request.urlopen(urllib.request.Request(base+path,data=data),timeout=3) as response:return response.read()
            try:
                for _ in range(100):
                    try:health=json.loads(request('/health'));break
                    except (urllib.error.URLError,ConnectionError):time.sleep(.05)
                else:self.fail('Server did not start')
                self.assertEqual(health['backend'],'krea')
                upload=json.loads(request('/uploads/mp4',b'fixture'))['upload']
                with self.assertRaises(urllib.error.HTTPError) as error:request('/jobs',json.dumps({'control':'../../etc/passwd'}).encode())
                self.assertEqual(error.exception.code,400)
                job=json.loads(request('/jobs',json.dumps({'control':upload,'variant':'bf16_blocks'}).encode()))['id']
                for _ in range(100):
                    state=json.loads(request('/jobs/'+job))
                    if state['status'] in ('completed','failed'):break
                    time.sleep(.05)
                self.assertEqual(state['status'],'completed',state)
                self.assertEqual(request(f'/jobs/{job}/output.mp4'),b'video-fixture')
                self.assertEqual(request(f'/jobs/{job}/chunks/000000.mp4'),b'chunk-fixture')
            finally:
                proc.terminate();proc.wait(timeout=5)

if __name__=='__main__':unittest.main()
