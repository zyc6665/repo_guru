#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}正在关闭服务...${NC}"
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo -e "${GREEN}已停止${NC}"
}
trap cleanup EXIT INT TERM

# 检查 .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo -e "${YELLOW}未检测到 .env，从模板创建...${NC}"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo -e "${RED}请先编辑 $BACKEND_DIR/.env 填入 OPENAI_API_KEY${NC}"
  exit 1
fi

# 检查虚拟环境
if [ ! -d "$BACKEND_DIR/venv" ]; then
  echo -e "${YELLOW}创建 Python 虚拟环境...${NC}"
  python3 -m venv "$BACKEND_DIR/venv"
  source "$BACKEND_DIR/venv/bin/activate"
  pip install -r "$BACKEND_DIR/requirements.txt"
else
  source "$BACKEND_DIR/venv/bin/activate"
fi

# 检查前端依赖
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo -e "${YELLOW}安装前端依赖...${NC}"
  (cd "$FRONTEND_DIR" && npm install)
fi

# 启动后端
echo -e "${GREEN}启动后端 (http://localhost:8000)...${NC}"
(cd "$BACKEND_DIR" && python run.py) &
BACKEND_PID=$!

# 等后端就绪
sleep 2

# 启动前端
echo -e "${GREEN}启动前端 (http://localhost:5173)...${NC}"
(cd "$FRONTEND_DIR" && npx vite --host) &
FRONTEND_PID=$!

echo -e "\n${GREEN}✅ RepoGuru 已启动${NC}"
echo -e "   前端: http://localhost:5173"
echo -e "   后端: http://localhost:8000"
echo -e "   按 Ctrl+C 停止\n"

wait
