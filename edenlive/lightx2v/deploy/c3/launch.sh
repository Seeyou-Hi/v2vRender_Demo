#!/usr/bin/env bash
set -euo pipefail
B=/home/test01/siyuheng/edenlive/deployments/robotarm_lightx2v_20261020
if tmux has-session -t =eden-light-realtime 2>/dev/null; then
 echo 'EdenLive supervisor tmux already exists'
 exit 0
fi
tmux new-session -d -s eden-light-realtime "bash $B/scripts/start.sh >> $B/logs/supervisor.log 2>&1"
echo 'Submitted EdenLive dual-GPU service; inspect logs/supervisor.json for queue/allocation status'
