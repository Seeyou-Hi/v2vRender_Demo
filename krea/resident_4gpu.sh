#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
KREA_PYTHON=${KREA_PYTHON:-$PWD/.venv/bin/python}
exec "$KREA_PYTHON" -m torch.distributed.run --standalone --nproc_per_node=4 scripts/resident_worker.py "$@"
