"""Bounded, ordered RGB24 frame inbox shared by HTTP and a persistent worker."""
import hashlib
import json
from pathlib import Path
import threading
import time

WIDTH, HEIGHT, FPS = 640, 384, 16
FRAME_BYTES = WIDTH * HEIGHT * 3


class InboxError(ValueError):
    def __init__(self, message, status=409):
        super().__init__(message)
        self.status = status


class StreamInbox:
    def __init__(self, directory, capacity=4, max_frames=4800, input_format='rgb24'):
        if input_format not in ('rgb24', 'gray8'):
            raise ValueError('Invalid input_format')
        self.input_format = input_format
        self.frame_bytes = WIDTH * HEIGHT if input_format == 'gray8' else FRAME_BYTES
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.capacity = capacity
        self.max_frames = max_frames
        self.next_index = 0
        self.frames = 0
        self.receipts = {}
        self.closed = False
        self.tail = False
        self.lock = threading.Lock()

    def accept(self, index, body):
        count, remainder = divmod(len(body), self.frame_bytes)
        native = 9 if index == 0 else 12
        if remainder or not 1 <= count <= native:
            raise InboxError(f'Expected {self.input_format} [1..{native},384,640] frames', 400)
        digest = hashlib.sha256(body).hexdigest()
        with self.lock:
            if index in self.receipts:
                if self.receipts[index] != digest:
                    raise InboxError('Duplicate sequence with different data')
                return self.state()
            if self.closed or self.tail:
                raise InboxError('Input closed or short final chunk already received')
            if index != self.next_index:
                raise InboxError(f'Expected sequence {self.next_index}')
            if self.frames + count > self.max_frames:
                raise InboxError('Session frame limit reached; finish this session', 413)
            if len(list(self.directory.glob('*.rgb'))) >= self.capacity:
                raise InboxError('Input queue full; retry the same sequence', 429)
            destination = self.directory / f'{index:06d}.rgb'
            temporary = destination.with_suffix('.tmp')
            if self.input_format == 'gray8':
                # Keep the existing resident worker/disk format unchanged.
                rgb = bytearray(len(body) * 3)
                rgb[0::3] = body
                rgb[1::3] = body
                rgb[2::3] = body
                temporary.write_bytes(rgb)
            else:
                temporary.write_bytes(body)
            temporary.replace(destination)
            self.receipts[index] = digest
            self.frames += count
            self.next_index += 1
            self.tail = count < native
            return self.state()

    def state(self):
        return dict(next_sequence=self.next_index, received_frames=self.frames, input_closed=self.closed)

    def finish(self):
        with self.lock:
            if not self.frames:
                raise InboxError('No frames received', 400)
            temporary = self.directory / 'finish.tmp'
            temporary.write_text(json.dumps(dict(chunks=self.next_index, frames=self.frames)))
            temporary.replace(self.directory / 'finish.json')
            self.closed = True
            return self.state()

    def cancel(self):
        with self.lock:
            (self.directory / 'cancel').touch()
            self.closed = True


def read_stream(directory, rank=0, barrier=lambda: None, idle_timeout=300):
    """Each rank reads the same atomic chunk; only unlink after all ranks finish it."""
    import numpy as np
    directory = Path(directory)
    index = 0
    while True:
        path = directory / f'{index:06d}.rgb'
        deadline = time.monotonic() + idle_timeout
        while True:
            if (directory / 'cancel').exists():
                raise RuntimeError('Stream cancelled')
            if path.exists():
                break
            marker = directory / 'finish.json'
            if marker.exists() and index >= json.loads(marker.read_text())['chunks']:
                return
            if time.monotonic() > deadline:
                raise TimeoutError(f'No stream input for {idle_timeout} seconds')
            time.sleep(.05)
        data = np.fromfile(path, dtype=np.uint8).reshape(-1, HEIGHT, WIDTH, 3)
        assert 1 <= len(data) <= (9 if index == 0 else 12)
        barrier()
        yield data
        barrier()
        if rank == 0:
            path.unlink()
        barrier()
        index += 1
