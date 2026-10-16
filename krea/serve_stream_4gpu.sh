#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
KREA_PYTHON=${KREA_PYTHON:-$PWD/.venv/bin/python}
exec "$KREA_PYTHON" scripts/server.py --gpus 4 "$@"
