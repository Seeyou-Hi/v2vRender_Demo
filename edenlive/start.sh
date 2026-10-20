#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
P=${EDEN_PYTHON:-$ROOT/.venv/bin/python}
exec "$P" -u "$ROOT/scripts/start.py" "$@"
