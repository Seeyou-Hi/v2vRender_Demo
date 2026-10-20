#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PYTHON=${PYTHON:-python3.10}
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3,10), "Use Python 3.10"'
mkdir -p "$ROOT/logs" "$ROOT/runtime" "$ROOT/runs"
exec > >(tee -a "$ROOT/logs/install.log") 2>&1
"$PYTHON" -m venv "$ROOT/.venv"
P="$ROOT/.venv/bin/python"
INDEX=${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}
"$P" -m pip install --index-url "$INDEX" 'pip>=24' 'setuptools>=69' wheel
"$P" -m pip install --index-url "${TORCH_INDEX_URL:-https://download.pytorch.org/whl/cu128}" 'torch==2.11.0+cu128' 'torchvision==0.26.0+cu128'
"$P" -m pip install --index-url "$INDEX" -r "$ROOT/requirements.txt"
"$P" -m pip check
"$P" -m pip freeze > "$ROOT/runs/installed-freeze.txt"
printf '%s\n' 'LightX2V environment ready; install coturn and hardware-capable Chromium, then prepare models. See README.md.'
