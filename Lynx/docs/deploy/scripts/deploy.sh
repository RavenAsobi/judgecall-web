#!/usr/bin/env bash
set -euo pipefail

echo "deploy.sh 已停用旧的强制覆盖流程，现转交给 deploy-release.sh。"
exec "$(dirname "$0")/deploy-release.sh" "$@"
