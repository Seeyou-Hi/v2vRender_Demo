import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import os
import unittest
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from stream_input import StreamInbox, InboxError, FRAME_BYTES, read_stream, decode_frame_body
from config import MODEL_FILES


class StreamTests(unittest.TestCase):
    def test_gray8_expands_exactly_and_keeps_receipts_tail_and_backpressure(self):
        with tempfile.TemporaryDirectory() as temp:
            gray = bytes(range(256)) * (384 * 640 // 256)
            inbox = StreamInbox(temp, capacity=1, input_format='gray8')
            self.assertEqual(inbox.accept(0, gray * 9)['received_frames'], 9)
            path = Path(temp) / '000000.rgb'
            expanded = path.read_bytes()
            self.assertEqual(len(expanded), 9 * FRAME_BYTES)
            for channel in range(3): self.assertEqual(expanded[channel::3], gray * 9)
            self.assertEqual(inbox.accept(0, gray * 9)['next_sequence'], 1)
            with self.assertRaises(InboxError) as error: inbox.accept(1, gray)
            self.assertEqual(error.exception.status, 429)
            with self.assertRaises(InboxError): inbox.accept(0, bytes(len(gray) * 9))
            path.unlink(); inbox.accept(1, gray * 2); inbox.finish()
            with self.assertRaises(InboxError): inbox.accept(2, gray)
            self.assertEqual(inbox.state()['received_frames'], 11)

    def test_gray8_http(self):
        self._http_stream_case(4, 'frames', False, 5, 'gray8')

    def test_order_capacity_idempotency_tail_and_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            inbox = StreamInbox(temp, capacity=1, max_frames=24)
            first = bytes(9 * FRAME_BYTES)
            self.assertEqual(inbox.accept(0, first)['next_sequence'], 1)
            self.assertEqual(inbox.accept(0, first)['next_sequence'], 1)
            for sequence, body, status in [(0, b'1' + first[1:], 409), (2, bytes(FRAME_BYTES), 409), (1, bytes(12 * FRAME_BYTES), 429), (1, b'bad', 400)]:
                with self.assertRaises(InboxError) as error:
                    inbox.accept(sequence, body)
                self.assertEqual(error.exception.status, status)
            (Path(temp) / '000000.rgb').unlink()
            inbox.accept(1, bytes(2 * FRAME_BYTES))
            with self.assertRaises(InboxError):
                inbox.accept(2, bytes(FRAME_BYTES))
            self.assertEqual(inbox.finish()['received_frames'], 11)
            with self.assertRaises(InboxError):
                inbox.accept(2, bytes(FRAME_BYTES))

    def test_frame_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            inbox = StreamInbox(temp, max_frames=10)
            inbox.accept(0, bytes(9 * FRAME_BYTES))
            with self.assertRaises(InboxError) as error:
                inbox.accept(1, bytes(2 * FRAME_BYTES))
            self.assertEqual(error.exception.status, 413)
            self.assertEqual(inbox.state()['received_frames'], 9)

    def test_reader_preserves_tail_and_deletes_consumed_input(self):
        with tempfile.TemporaryDirectory() as temp:
            inbox = StreamInbox(temp)
            inbox.accept(0, bytes([17]) * (3 * FRAME_BYTES))
            inbox.finish()
            barriers = []
            frames = list(read_stream(temp, barrier=lambda: barriers.append(True)))
            self.assertEqual(frames[0].shape, (3, 384, 640, 3))
            self.assertTrue((frames[0] == 17).all())
            self.assertEqual(len(barriers), 3)
            self.assertFalse(list(Path(temp).glob('*.rgb')))
        with tempfile.TemporaryDirectory() as temp:
            inbox = StreamInbox(temp); inbox.cancel()
            with self.assertRaises(RuntimeError):
                next(read_stream(temp))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(TimeoutError):
                next(read_stream(temp, idle_timeout=0))

    def test_http_delivers_first_chunk_before_input_finishes(self):
        for gpus in (1, 2, 4):
            with self.subTest(gpus=gpus):
                self._http_stream_case(gpus)

    def test_reference_reaches_stream_worker(self):
        self._http_stream_case(4, 'frames', False, 5, 'gray8', reference=True)

    def test_gzip_validation(self):
        import gzip
        raw = bytes(range(256)) * 100
        self.assertEqual(decode_frame_body(gzip.compress(raw), 'gzip', len(raw)), raw)
        for encoded, encoding, limit, status in [
            (gzip.compress(raw), 'gzip', 100, 413),
            (gzip.compress(raw)[:-3], 'gzip', len(raw), 400),
            (b'bad', 'gzip', 100, 400),
            (gzip.compress(raw)+b'trailing', 'gzip', len(raw), 400),
            (b'bad', 'br', 100, 415),
        ]:
            with self.assertRaises(InboxError) as error: decode_frame_body(encoded, encoding, limit)
            self.assertEqual(error.exception.status, status)

    def test_gzip_http_and_busy_admission(self):
        self._http_stream_case(4, 'frames', False, 5, 'gray8', compressed=True)

    def test_http_frame_output_modes(self):
        for save in (False, True):
            with self.subTest(save_mp4=save):
                self._http_stream_case(1, 'frames', save)

    def test_five_fps_stream(self):
        self._http_stream_case(4, 'frames', True, 5)

    def _http_stream_case(self, gpus, mode='video', save_mp4=True, fps=16, input_format='rgb24', compressed=False, reference=False):
        # Real HTTP adapter and inbox; fake model process consumes incremental input.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); models = root / 'models'
            for name in MODEL_FILES.values():
                p = models / name; p.parent.mkdir(parents=True, exist_ok=True)
                p.mkdir() if name.endswith('umt5-xxl') else p.touch()
            p = models / 'Wan2.1-T2V-14B/config.json'; p.parent.mkdir(); p.write_text('{}')
            config = root / 'config.json'; config.write_text(json.dumps({'model_dir': str(models)}))
            fake = root / 'fake/torch/distributed'; fake.mkdir(parents=True)
            (fake.parent / '__init__.py').touch(); (fake / '__init__.py').touch()
            (fake / 'run.py').write_text(
                'import sys,json\nfrom pathlib import Path\n'
                f'sys.path.insert(0,{str(ROOT / "scripts")!r})\n'
                'from stream_input import read_stream\nfrom media import write_frames\n'
                f'mode={mode!r};save_mp4={save_mp4!r}\n'
                f'assert sys.argv[sys.argv.index("--input-fps")+1]=="{fps}"\n'
                'assert sys.argv[sys.argv.index("--output-mode")+1]==mode\n'
                'assert ("--save-mp4" in sys.argv)==save_mp4\n'
                f'assert "--nproc_per_node={gpus}" in sys.argv\n' +
                ('assert Path(sys.argv[sys.argv.index("--reference")+1]).read_bytes()==b"reference-fixture"\n' if reference else 'assert "--reference" not in sys.argv\n') +
                'src=Path(sys.argv[sys.argv.index("--stream-dir")+1])\n'
                'out=Path(sys.argv[sys.argv.index("--output")+1]);out.mkdir();(out/"chunks").mkdir()\n'
                '(out/"chunks"/"000001.encoding.mp4").write_bytes(b"unfinished")\n'
                'offset=0\n'
                'for i,a in enumerate(read_stream(src,idle_timeout=10)):\n'
                ' if mode=="frames":write_frames(out/"frames",a,offset)\n'
                ' offset+=len(a)\n'
                ' if save_mp4:(out/"chunks"/f"{i:06d}.mp4").write_bytes(b"chunk"+str(len(a)).encode())\n'
                ' p=out/"status.tmp";p.write_text(json.dumps({"status":"waiting_input","completed_chunks":i+1}));p.replace(out/"status.json")\n'
                'if save_mp4:(out/"output.mp4").write_bytes(b"completed")\n'
            )
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
            env = dict(os.environ, PYTHONPATH=str(root / 'fake'))
            process = subprocess.Popen([sys.executable, str(ROOT / 'scripts/server.py'), '--config', str(config), '--gpus', str(gpus), '--port', str(port), '--storage', str(root / 'jobs')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            def request(path, body=None, headers=None):
                with opener.open(urllib.request.Request(f'http://127.0.0.1:{port}' + path, data=body, headers=headers or {}), timeout=3) as response:
                    return response.read()
            try:
                for _ in range(100):
                    try:
                        health = json.loads(request('/health')); break
                    except urllib.error.URLError:
                        time.sleep(.05)
                else:
                    self.fail('Server did not start')
                self.assertTrue(health['stream_input'])
                self.assertIn(5,health['supported_input_fps'])
                self.assertIn('gray8', health['supported_input_formats'])
                for bad in ({'input_format':'bad'}, {'input_format':'gray8','control_kind':'canny'}):
                    with self.assertRaises(urllib.error.HTTPError) as error: request('/streams',json.dumps(bad).encode())
                    self.assertEqual(error.exception.code, 400)
                for bad in (0,12,True,'5'):
                    with self.assertRaises(urllib.error.HTTPError) as error:request('/streams',json.dumps({'input_fps':bad}).encode())
                    self.assertEqual(error.exception.code,400)
                self.assertEqual(health['gpus'], gpus)
                self.assertTrue(health['stream_reference'])
                for invalid in ('../bad.png', '0'*32+'.png', 123, '0'*32+'.mp4'):
                    with self.assertRaises(urllib.error.HTTPError) as error: request('/streams',json.dumps({'reference':invalid}).encode())
                    self.assertEqual(error.exception.code,400)
                ref=json.loads(request('/uploads/png',b'reference-fixture'))['upload'] if reference else None
                session = json.loads(request('/streams', json.dumps(dict(control_kind='depth',output_mode=mode,save_mp4=save_mp4,input_fps=fps,input_format=input_format,**({'reference':ref} if ref else {}))).encode()))
                self.assertEqual(session['input_format'], input_format)
                self.assertEqual(session['fps'],fps)
                self.assertEqual((session['first_frames'], session['chunk_frames']), (9, 12))
                base = '/streams/' + session['id']
                frame_bytes = 384 * 640 if input_format == 'gray8' else FRAME_BYTES
                body = bytes([17]) * (9 * frame_bytes)
                with self.assertRaises(urllib.error.HTTPError) as busy_error:
                    request('/streams', b'{}')
                self.assertEqual(busy_error.exception.code, 409)
                import gzip
                payload = gzip.compress(body) if compressed else body
                headers = {'Content-Encoding': 'gzip'} if compressed else {}
                request(base + '/frames/000000', payload, headers)
                request(base + '/frames/000000', payload, headers)  # Retry must not duplicate output.
                for _ in range(100):
                    state = json.loads(request(base))
                    if (state['chunks'] if save_mp4 else (mode=='frames' and json.loads(request(base+'/frames'))['available_frames']>=9)): break
                    time.sleep(.05)
                if save_mp4:
                    self.assertEqual(request(base + '/chunks/000000.mp4'), b'chunk9')
                    self.assertEqual(state['chunks'], ['000000.mp4'])
                if mode=='frames':
                    listing=json.loads(request(base+'/frames?after=0&limit=2'))
                    self.assertEqual([x['index'] for x in listing['frames']],[1,2])
                    self.assertEqual(listing['frames'][0]['timestamp_seconds'],1/fps)
                    self.assertEqual(listing['fps'],fps)
                    self.assertTrue(request(listing['frames'][0]['url']).startswith(b'\x89PNG'))
                    import cv2, numpy as np
                    decoded = cv2.imdecode(np.frombuffer(request(listing['frames'][0]['url']),dtype=np.uint8),cv2.IMREAD_COLOR)
                    self.assertTrue((decoded == 17).all())
                self.assertNotEqual(state['status'], 'completed')
                with self.assertRaises(urllib.error.HTTPError):
                    request(base + '/output.mp4')
                request(base + '/frames/000001', bytes(2 * frame_bytes))
                request(base + '/finish', b'{}')
                for _ in range(100):
                    state = json.loads(request(base))
                    if state['status'] in ('completed', 'failed'): break
                    time.sleep(.05)
                self.assertEqual(state['status'], 'completed', state)
                self.assertEqual(state['received_frames'], 11)
                if save_mp4:
                    self.assertEqual(request(base + '/chunks/000001.mp4'), b'chunk2')
                    self.assertEqual(request(base + '/output.mp4'), b'completed')
                else:
                    self.assertEqual(state['chunks'],[])
                    with self.assertRaises(urllib.error.HTTPError):request(base+'/output.mp4')
                if mode=='frames':
                    self.assertEqual(json.loads(request(base+'/frames'))['available_frames'],11)
                    with self.assertRaises(urllib.error.HTTPError):request(base+'/frames?limit=9999')
            finally:
                process.terminate(); process.wait(timeout=5)


if __name__ == '__main__':
    unittest.main()
