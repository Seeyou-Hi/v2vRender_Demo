"""Rewrite component paths in an already transferred model index, no weight changes."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('model_dir')
a = p.parse_args()
root = Path(a.model_dir).resolve()
index = root / 'modular_model_index.json'
data = json.loads(index.read_text())
for name in ('text_encoder', 'tokenizer', 'processor', 'transformer_ref', 'vae', 'audio_vae', 'scheduler', 'audio_scheduler'):
    assert (root / name).exists(), f'Missing component or broken symlink: {name}'
for entry in data.values():
    if isinstance(entry, list):
        for value in entry:
            if isinstance(value, dict) and 'pretrained_model_name_or_path' in value:
                value['pretrained_model_name_or_path'] = str(root)
backup = index.with_suffix('.json.before_relocation')
if not backup.exists():
    backup.write_bytes(index.read_bytes())
tmp = index.with_suffix('.json.tmp')
tmp.write_text(json.dumps(data, indent=2) + '\n')
tmp.replace(index)
print('Model index relocated:', index)
