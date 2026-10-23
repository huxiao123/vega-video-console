#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装：https://nodejs.org （18 或以上）"
  read -n 1 -s -r -p "按任意键退出"; exit 1
fi
PORT=${PORT:-8088}
( sleep 1.5; open "http://localhost:$PORT" ) &
PORT=$PORT node server/index.mjs
