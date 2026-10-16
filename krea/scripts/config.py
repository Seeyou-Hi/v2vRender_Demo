"""Portable configuration; relative paths resolve against the config file."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_FILES = {
    'generator_path': 'krea-realtime-video/krea-realtime-video-14b.safetensors',
    'vace_path': 'vace_krea.safetensors',
    'text_encoder_path': 'text_encoder/models_t5_umt5-xxl-enc-bf16.pth',
    'tokenizer_path': 'text_encoder/google/umt5-xxl',
    'vae_path': 'Autoencoders/taew2_1.pth',
}

def load_config(path, check_models=True):
    path = Path(path).resolve()
    cfg = json.loads(path.read_text())
    def absolute(value):
        p = Path(value).expanduser()
        return str(p.resolve() if p.is_absolute() else (path.parent / p).resolve())
    cfg['model_dir'] = absolute(cfg.get('model_dir', '../models'))
    for key, relative in MODEL_FILES.items():
        cfg[key] = absolute(cfg[key]) if key in cfg else str(Path(cfg['model_dir']) / relative)
    cfg.setdefault('variant', 'bf16')
    if cfg['variant'] not in ('bf16', 'bf16_blocks'):
        raise ValueError('variant must be bf16 or bf16_blocks')
    for key, default in [('width',640),('height',384),('seed',43),('fps',16),('warmup_frames',33)]:
        cfg.setdefault(key, default)
    if (cfg['width'], cfg['height']) != (640,384) or cfg['fps'] != 16:
        raise ValueError('This tested deployment supports 640x384 at 16 FPS')
    if cfg['warmup_frames'] < 0:
        raise ValueError('warmup_frames must be >= 0')
    if check_models:
        required = [Path(cfg[k]) for k in MODEL_FILES]
        required.append(Path(cfg['model_dir'])/'Wan2.1-T2V-14B/config.json')
        missing = [str(p) for p in required if not p.exists()]
        if missing:
            raise FileNotFoundError('Missing model files:\n' + '\n'.join(missing))
    return cfg
