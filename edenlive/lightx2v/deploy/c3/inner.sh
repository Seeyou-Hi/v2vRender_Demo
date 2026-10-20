#!/usr/bin/env bash
set -euo pipefail
R=/home/test01/siyuheng/edenlive
B=$R/deployments/robotarm_lightx2v_20261020
D=${1:?job directory}
export PATH="$R/env-lightx2v/bin:$PATH"
export PYTHONPATH="$R/repo/LightX2V:$R/deployments/lightx2v_20261020/scripts:$B/scripts"
export PYTHONUNBUFFERED=1 OMP_NUM_THREADS=4 OPENBLAS_NUM_THREADS=1
export DTYPE=BF16 SENSITIVE_LAYER_DTYPE=BF16 NCCL_GRAPH_MIXING_SUPPORT=0
export EDEN_DUAL_PROJECTION=1 EDEN_DUAL_GRAPH=1
exec python -m torch.distributed.run --standalone --nproc_per_node=2 "$B/scripts/server.py" > "$D/app.log" 2>&1
