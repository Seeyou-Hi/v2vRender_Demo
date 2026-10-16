#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
KREA_PYTHON=${KREA_PYTHON:-$PWD/.venv/bin/python}
KREA_GPUS=${KREA_GPUS:-1}
exec "$KREA_PYTHON" -m torch.distributed.run --standalone --nproc_per_node="$KREA_GPUS" scripts/render.py "$@"
