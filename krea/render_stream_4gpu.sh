#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export KREA_GPUS=4
exec bash render.sh --variant bf16_blocks "$@"
