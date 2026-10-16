#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch==2.9.1 torchvision==0.24.1 --index-url https://download.pytorch.org/whl/cu128
.venv/bin/python -m pip install -r requirements.txt -c constraints.txt
# Scope's upstream cuDNN override fixes BF16 Conv3D performance in torch 2.9.1.
.venv/bin/python -m pip install --no-deps nvidia-cudnn-cu12==9.15.1.9
.venv/bin/python -m pip install --no-deps 'https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.9cxx11abiTRUE-cp312-cp312-linux_x86_64.whl'
.venv/bin/python scripts/check_install.py --config configs/example.json --skip-models
