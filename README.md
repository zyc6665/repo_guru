### cc产物哈哈哈哈哈，项目设计并不完善，提示词以及agent部分设计不够好。各位大佬轻喷，0.0

# 🧠 RepoGuru
GitHub 项目智能分析平台 — 输入关键词或链接，AI 为你深度解读代码库。

## 功能

- **项目总结** — 一句话了解项目做什么、用了什么技术
- **架构图** — Mermaid 自动生成项目架构可视化
- **技术解构** — 核心模块拆解，设计模式识别
- **代码学习** — 挑出值得学习的代码片段并解释为什么
- **设计思想** — 分析架构决策背后的 WHY
- **互动问答** — AI 出题检验你对项目的理解
- **中英文切换** — 一键切换分析语言

## 技术栈

| 层 | 技术 |
|---|---|
| Agent | LangGraph (6 节点 Plan-and-Execute) |
| LLM | DeepSeek / OpenAI 兼容接口 |
| 后端 | FastAPI + SSE 流式输出 |
| 前端 | React + TypeScript + Tailwind CSS |
| 可视化 | Mermaid + Framer Motion |

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/zyc6665/repo_guru.git
cd repo_guru
```

### 2. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```
GITHUB_TOKEN=ghp_你的token        # https://github.com/settings/tokens
OPENAI_API_KEY=sk-你的key          # DeepSeek: https://platform.deepseek.com/api_keys
OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_MODEL=deepseek-chat
```

### 3. 一键启动

```bash
./start.sh
```

脚本会自动创建虚拟环境、安装依赖、启动前后端。

- 前端: http://localhost:5173
- 后端: http://localhost:8000

### 手动启动

```bash
# 后端
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && python run.py

# 前端
cd frontend && npm install && npm run dev
```

## 架构

```
用户输入 → SearchBar
              ↓
        FastAPI SSE /api/analyze
              ↓
    ┌─── LangGraph Agent ───┐
    │  search (搜索仓库)      │
    │  retrieve (获取概览)    │
    │  select_files (LLM选文件) │  ← Plan-and-Execute
    │  fetch_files (深度阅读)  │
    │  analyze (结构化分析)    │  ← with_structured_output()
    │  generate_quiz (出题)   │
    └────────────────────────┘
              ↓
        SSE 流式推送 → React 前端渲染
```

## License

MIT
