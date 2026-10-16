#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/krea"
exec bash render.sh "$@"
