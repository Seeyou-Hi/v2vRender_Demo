#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PYTHON=${PYTHON:-python3.10}
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3,10), "This release is pinned to Python 3.10"'
"$PYTHON" -m venv "$ROOT/.venv"
P="$ROOT/.venv/bin/python"
INDEX=${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}
"$P" -m pip install --index-url "$INDEX" 'pip>=24' 'setuptools>=69' wheel
"$P" -m pip install --index-url "${TORCH_INDEX_URL:-https://download.pytorch.org/whl/cu128}" 'torch==2.11.0+cu128' 'torchvision==0.26.0+cu128'
"$P" -m pip install --index-url "$INDEX" -r "$ROOT/requirements.txt" -c "$ROOT/constraints.txt"
for package in flashdreams apps/cam2v integrations_v2/eden; do
 "$P" -m pip install --no-deps --no-build-isolation -e "$ROOT/third_party/EdenLive/realtime/$package"
done
"$P" -m pip check
mkdir -p "$ROOT/runs" "$ROOT/runtime"
if [ -z "${EDEN_CHROME:-}" ] && ! command -v google-chrome >/dev/null && ! command -v chromium >/dev/null; then
 if [ "${EDEN_SKIP_BROWSER_INSTALL:-0}" != 1 ]; then
  "$P" -m playwright install chromium
  "$P" -c 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()' > "$ROOT/runtime/chrome-path"
 fi
fi
"$P" -m pip freeze > "$ROOT/runs/installed-freeze.txt"
printf '%s\n' 'Python environment ready. Install system dependencies/coturn (see README), then download/verify models.'
