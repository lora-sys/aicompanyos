#!/bin/bash
# aicos — AI Company OS CLI 入口
# Usage:
#   aicos                  启动交互模式（TTY 终端）
#   aicos --help           显示帮助
#   aicos "任务描述"       直接执行任务
#   echo "/type 2\ntopic\nq" | aicos   管道模式

set -e

# ★ 解析出项目根目录（bin/ 的上级）
AICOS_BIN_DIR="$(cd "$(dirname "$0")" && pwd)"
AICOS_ROOT="$(cd "$AICOS_BIN_DIR/.." && pwd)"

exec node "$AICOS_ROOT/packages/cli/dist/index.js" "$@"
