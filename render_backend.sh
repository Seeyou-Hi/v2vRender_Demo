#!/usr/bin/env bash
# Select an independent backend and its own Python environment.
set -euo pipefail
cd "$(dirname "$0")"
backend=${1:-}
if [[ $# -gt 0 ]]; then shift; fi
case "$backend" in
  pai-h3)
    : "${PAI_PYTHON:?Set PAI_PYTHON to the PAI environment python executable}"
    exec "$PAI_PYTHON" -m torch.distributed.run --standalone --nproc_per_node=2 scripts/render.py "$@"
    ;;
  krea)
    KREA_PYTHON=${KREA_PYTHON:-$PWD/krea/.venv/bin/python}
    exec "$KREA_PYTHON" -m torch.distributed.run --standalone --nproc_per_node="${KREA_GPUS:-1}" krea/scripts/render.py "$@"
    ;;
  *)
    echo 'Usage: render_backend.sh {pai-h3|krea} [backend arguments]' >&2
    exit 2
    ;;
esac
