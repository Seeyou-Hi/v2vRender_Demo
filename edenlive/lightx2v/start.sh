#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec "${EDEN_LIGHT_PYTHON:-$ROOT/.venv/bin/python}" -u "$ROOT/scripts/start.py" "$@"
