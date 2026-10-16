"""CPU-only deployment preflight; does not import the model or start inference."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('--config', required=True)
p.add_argument('--schema-only', action='store_true')
a = p.parse_args()
path = Path(a.config).resolve()
c = json.loads(path.read_text())
for key in ('model_dir', 'lora_path', 'runtime_deps', 'input_video', 'output_dir', 'prompt_file'):
    assert isinstance(c[key], str) and c[key], key
    q = Path(c[key]).expanduser()
    c[key] = q if q.is_absolute() else (path.parent / q).resolve()
assert c['width'] > 0 and c['width'] % 32 == 0
assert c['height'] > 0 and c['height'] % 32 == 0
assert c['num_frames'] >= 124 and (c['num_frames'] - 5) % 17 == 0
assert c['fps'] == 24
assert isinstance(c['seed'], int)
assert c['prompt_file'].read_text().strip()
if not a.schema_only:
    for key in ('model_dir', 'lora_path', 'runtime_deps', 'input_video'):
        assert c[key].exists(), str(c[key])
    for name in ('ready.json', 'modular_model_index.json', 'transformer_ref', 'text_encoder', 'tokenizer', 'processor', 'vae', 'audio_vae', 'scheduler', 'audio_scheduler'):
        assert (c['model_dir'] / name).exists(), name
    manifest = json.loads((Path(__file__).resolve().parents[1] / 'configs/artifacts.json').read_text())
    for name, expected in manifest['runtime_files'].items():
        assert hashlib.sha256((c['runtime_deps'] / name).read_bytes()).hexdigest() == expected, name
    assert c['lora_path'].stat().st_size == manifest['size']
    assert shutil.which('ffprobe'), 'ffprobe is required on PATH'
    assert not c['output_dir'].exists() or not any(c['output_dir'].iterdir()), 'Use a fresh output directory'
print('Configuration schema OK' if a.schema_only else 'Deployment paths and runtime hashes OK; GPU not tested')
