#!/usr/bin/env bash
# Same-host four-GPU resident model, HTTP adapter and frontend.
set -euo pipefail
cd "$(dirname "$0")"
project_dir=$PWD
config_file=${KREA_CONFIG:-$project_dir/krea/configs/example.json}
python_bin=${KREA_PYTHON:-$project_dir/krea/.venv/bin/python}
node_bin=${NODE:-node}
web_port=${PORT:-5175}
api_port=${KREA_API_PORT:-8001}
if [[ $# -gt 1 || (${1:-} != '' && ${1:-} != --help) ]]; then config_file=$1; shift; fi
if [[ ${1:-} == --help ]]; then
  echo 'Usage: bash start.sh [config.json]'
  echo 'Environment: KREA_PYTHON, NODE, PORT=5175, KREA_API_PORT=8001, HOST=127.0.0.1, KREA_RUN_DIR'
  echo 'Requires four allocated CUDA GPUs. Ctrl+C stops this launch only.'
  exit 0
fi
[[ $# -eq 0 ]] || { echo 'Unexpected arguments' >&2; exit 2; }
[[ -x "$python_bin" ]] || { echo "Configure KREA_PYTHON or run bash krea/install.sh: $python_bin" >&2; exit 1; }
python_bin=$(realpath -s "$python_bin")
command -v "$node_bin" >/dev/null
"$node_bin" -e 'if (+process.versions.node.split(".")[0] < 20) process.exit(1)'
config_file=$(realpath "$config_file")
"$python_bin" - "$config_file" "$api_port" "$web_port" <<'PY'
import sys,socket
from pathlib import Path
sys.path.insert(0,str(Path('krea/scripts').resolve()))
from config import load_config
load_config(sys.argv[1])
for port in map(int,sys.argv[2:]):
 with socket.socket() as s:s.bind(('127.0.0.1',port))
PY
run_dir=${KREA_RUN_DIR:-$project_dir/runs/krea_$(date +%Y%m%d_%H%M%S)_$$}
[[ ! -e "$run_dir" ]] || { echo 'KREA_RUN_DIR must be a new directory' >&2; exit 1; }
mkdir -p "$run_dir/resident"
run_dir=$(realpath "$run_dir")
children=()
cleanup() {
  trap - EXIT INT TERM
  if ((${#children[@]})); then
    kill "${children[@]}" 2>/dev/null || true
    wait "${children[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
KREA_PYTHON="$python_bin" bash krea/resident_4gpu.sh --config "$config_file" --queue "$run_dir/resident" >"$run_dir/worker.log" 2>&1 &
children+=("$!"); echo "$!" >"$run_dir/worker.pid"
"$python_bin" krea/scripts/server.py --config "$config_file" --gpus 4 --port "$api_port" --resident-dir "$run_dir/resident" --storage "$run_dir/api" >"$run_dir/api.log" 2>&1 &
children+=("$!"); echo "$!" >"$run_dir/api.pid"
KREA_BACKEND_URL="http://127.0.0.1:$api_port" "$node_bin" frontend/server.mjs "$web_port" >"$run_dir/frontend.log" 2>&1 &
children+=("$!"); echo "$!" >"$run_dir/frontend.pid"
echo "Frontend: http://127.0.0.1:$web_port"
echo "Health:   http://127.0.0.1:$web_port/api/render/health"
echo "Logs:     $run_dir"
echo 'Wait for resident.status=ready before starting a stream. Model load/compile takes time.'
set +e
wait -n "${children[@]}"
status=$?
set -e
((status != 0)) || status=1
echo "A service exited; stopping this launch. Inspect $run_dir/*.log" >&2
exit "$status"
