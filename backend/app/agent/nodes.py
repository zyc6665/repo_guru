from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import settings
from app.services import github_client as gh
from app.agent.state import AgentState
from app.models import (
    FileSelection,
    OverviewOutput,
    ArchitectureOutput,
    CodeOutput,
    PhilosophyOutput,
    SingleChapterQuizOutput,
)


def _llm(max_tokens: int = 4096) -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        temperature=0.3,
        max_tokens=max_tokens,
    )


def _lang_instruction(lang: str) -> str:
    """根据语言偏好返回 prompt 尾部指令。"""
    if lang == "zh":
        return "\n\nIMPORTANT: You MUST respond in Chinese (简体中文). All text fields (summary, explanations, questions, options) must be in Chinese. Only keep technical terms, proper nouns, and Mermaid syntax in English."
    return ""


# ---------------------------------------------------------------------------
# 公共上下文构建
# ---------------------------------------------------------------------------

def build_repo_context(state: AgentState) -> dict:
    """所有分析函数共享的仓库上下文。截断上限提高，因为每个调用只生成 1-2 个字段。"""
    info = state.get("repo_info", {})
    return {
        "full_name": info.get("full_name", ""),
        "description": info.get("description", ""),
        "language": info.get("language", ""),
        "stars": info.get("stars", 0),
        "readme": state.get("readme", "N/A")[:5000],
        "file_tree": state.get("file_tree", "N/A")[:3000],
        "dependencies": state.get("dependencies", "N/A")[:2000],
        "key_files_content": state.get("key_files_content", "N/A")[:8000],
    }


def _format_context(ctx: dict) -> str:
    """将上下文 dict 格式化为 prompt 片段。"""
    return (
        f"## Repository: {ctx['full_name']}\n"
        f"**Description:** {ctx['description']}\n"
        f"**Language:** {ctx['language']} | **Stars:** {ctx['stars']}\n\n"
        f"## README (truncated)\n{ctx['readme']}\n\n"
        f"## File Structure\n{ctx['file_tree']}\n\n"
        f"## Dependency Files\n{ctx['dependencies']}\n\n"
        f"## Key Source Files\n{ctx['key_files_content']}"
    )


# ---------------------------------------------------------------------------
# Node 1: search — 解析 URL 或关键词搜索
# ---------------------------------------------------------------------------

async def search_node(state: AgentState) -> AgentState:
    query = state["query"]
    is_url = state.get("is_url", False)

    parsed = gh.parse_github_url(query)
    if parsed or is_url:
        if parsed:
            owner, repo = parsed
        else:
            raise ValueError(f"Invalid GitHub URL: {query}")
        info = await gh.get_repo_info(owner, repo)
        if not info:
            return {**state, "error": f"Repository {owner}/{repo} not found", "current_step": "search"}
        return {**state, "repo_info": info, "current_step": "search"}

    repos = await gh.search_repos(query, limit=5)
    items = repos["items"]
    if not items:
        return {**state, "error": f"No repositories found for '{query}'", "current_step": "search"}
    return {**state, "repo_info": items[0], "current_step": "search"}


# ---------------------------------------------------------------------------
# Node 2: retrieve — 获取 README / file tree / 依赖文件
# ---------------------------------------------------------------------------

async def retrieve_node(state: AgentState) -> AgentState:
    info = state.get("repo_info")
    if not info:
        return {**state, "error": "No repo info available", "current_step": "retrieve"}

    owner, repo = info["full_name"].split("/")
    readme = await gh.get_readme(owner, repo)
    tree_data = await gh.get_file_tree(owner, repo, depth=2)
    file_tree = gh.format_tree(tree_data)
    deps = await gh.get_dependency_files(owner, repo)

    return {
        **state,
        "readme": readme,
        "file_tree": file_tree,
        "dependencies": deps,
        "current_step": "retrieve",
    }


# ---------------------------------------------------------------------------
# Node 3: select_files — Plan 阶段
# ---------------------------------------------------------------------------

_SELECT_PROMPT = """You are a senior software architect. Given the file tree of a GitHub repository, select the most important files to read for understanding the project architecture.

## Repository: {full_name}
**Description:** {description}
**Language:** {language}

## File Tree
{file_tree}

## Dependency Files (already fetched)
{dependencies}

---

Pick up to 8 files that are most critical for understanding this project.
Prioritize: entry points (main.py, index.ts, App.tsx), config files, core modules, route definitions.
Skip: tests, docs, lock files, assets, CI configs, LICENSE, .gitignore.
Return ONLY file paths that appear in the tree above."""


async def select_files_node(state: AgentState) -> AgentState:
    """Plan 阶段：让 LLM 从 file tree 中挑选关键文件。"""
    info = state.get("repo_info", {})
    llm = _llm().with_structured_output(FileSelection)

    prompt = _SELECT_PROMPT.format(
        full_name=info.get("full_name", ""),
        description=info.get("description", ""),
        language=info.get("language", ""),
        file_tree=state.get("file_tree", "")[:4000],
        dependencies=state.get("dependencies", "")[:2000],
    )

    try:
        result: FileSelection = await llm.ainvoke(prompt)
        paths = result.paths[:8]
    except Exception:
        paths = []

    return {**state, "key_files": paths, "current_step": "select_files"}


# ---------------------------------------------------------------------------
# Node 4: fetch_files — Execute 阶段
# ---------------------------------------------------------------------------

async def fetch_files_node(state: AgentState) -> AgentState:
    """Execute 阶段：并行获取 LLM 选出的关键文件。"""
    info = state.get("repo_info", {})
    paths = state.get("key_files") or []

    if not paths:
        return {**state, "key_files_content": "", "current_step": "fetch_files"}

    owner, repo = info["full_name"].split("/")
    content = await gh.get_multiple_files(owner, repo, paths)

    return {**state, "key_files_content": content, "current_step": "fetch_files"}


# ---------------------------------------------------------------------------
# Node 5: analyze_overview — 概述 + 技术栈 + 设计模式
# ---------------------------------------------------------------------------

_OVERVIEW_PROMPT = """You are a senior software architect writing for a technical blog with 100k+ developer readers. Analyze this GitHub repository and provide a deep, insightful overview.

{context}

---

Your task: Generate a comprehensive overview covering summary, tech_stack, and design_patterns.

Requirements for **summary**:
- 6-10 sentences, NOT generic fluff
- MUST mention: what problem it solves, who the target users are, core features (list them), what makes it different from alternatives, maturity assessment
- Reference specific evidence from README or code

Requirements for **tech_stack**:
- Include version numbers when visible in dependency files
- Format: "Technology Version+" (e.g., "Python 3.10+", "React 18")

Requirements for **design_patterns**:
- 4-6 patterns, each MUST reference a specific file or module
- Format: "Pattern Name — used in `file.py` / `module/` because [reason]"
- DO NOT list patterns you can't prove from the code
- DO NOT be vague — "uses MVC" without file references is unacceptable"""


async def analyze_overview(ctx: dict, lang: str) -> dict:
    """纯函数：概述分析，不依赖 graph state。"""
    llm = _llm(max_tokens=4096).with_structured_output(OverviewOutput)
    prompt = _OVERVIEW_PROMPT.format(context=_format_context(ctx)) + _lang_instruction(lang)

    try:
        result: OverviewOutput = await llm.ainvoke(prompt)
        return result.model_dump()
    except Exception as e:
        return {"summary": f"概述生成失败: {e}", "tech_stack": [], "design_patterns": []}


# ---------------------------------------------------------------------------
# Node 6: analyze_architecture — 架构图 + 核心模块
# ---------------------------------------------------------------------------

_ARCHITECTURE_PROMPT = """You are a senior software architect writing for a technical blog with 100k+ developer readers. Analyze this GitHub repository's architecture in depth.

{context}

---

Your task: Generate an architecture diagram (Mermaid) and deep core module analysis.

Requirements for **architecture_mermaid**:
- Mermaid `graph TD` format, 8-15 nodes
- Use A[Label] format for nodes, --> for arrows
- NO quotes, NO special characters in node IDs
- MUST show data flow direction and module dependencies
- Include external services/databases if applicable
- Group related nodes with subgraph if the project has clear layers

Requirements for **core_modules**:
- Use ### heading for each module (3-6 modules)
- Each module MUST cover:
  - What it does (1-2 sentences)
  - Key functions/classes with their signatures: `functionName(params) -> ReturnType`
  - Input/output data structures
  - How it interacts with other modules
  - Key design decision and WHY
- Reference actual file names: `src/module/file.py`
- DO NOT just list files — explain the engineering decisions behind each module"""


async def analyze_architecture(ctx: dict, lang: str) -> dict:
    """纯函数：架构分析。"""
    llm = _llm(max_tokens=4096).with_structured_output(ArchitectureOutput)
    prompt = _ARCHITECTURE_PROMPT.format(context=_format_context(ctx)) + _lang_instruction(lang)

    try:
        result: ArchitectureOutput = await llm.ainvoke(prompt)
        return result.model_dump()
    except Exception as e:
        return {"architecture_mermaid": "", "core_modules": f"架构分析失败: {e}"}


# ---------------------------------------------------------------------------
# Node 7: analyze_code — 代码亮点
# ---------------------------------------------------------------------------

_CODE_PROMPT = """You are a senior software architect writing for a technical blog with 100k+ developer readers. Your job is to find the most educational and interesting code in this repository.

{context}

---

Your task: Find 4-6 code highlights that are genuinely worth studying.

For EACH highlight, provide structured fields:
- title: the technique/pattern name (e.g. "Async Pipeline Pattern")
- file_path: file path and approximate line range (e.g. "src/core/engine.py:L10-L30")
- language: programming language of the code snippet (e.g. "python")
- code: the key code snippet (15-25 lines). If the function is longer, show the most important part and add a comment like "// ... rest omitted".
- problem: what problem this code solves (1-2 sentences)
- technique: what technique/pattern it uses and WHY it's worth learning (2-3 sentences)
- takeaway: one-sentence summary of the key learning

Rules:
- DO NOT pick trivial code (simple getters, basic CRUD, boilerplate)
- DO pick: clever algorithms, elegant abstractions, error handling patterns, performance optimizations, creative API designs
- MUST use actual code from the Key Source Files section above
- If the code is too long, show the most important 20-30 lines and note what was omitted"""


def _highlights_to_markdown(highlights: list) -> str:
    """将结构化的 CodeHighlight 列表转为 Markdown 字符串，保持前端兼容。"""
    parts = []
    for h in highlights:
        parts.append(
            f"### {h['title']}\n\n"
            f"`{h['file_path']}`\n\n"
            f"```{h['language']}\n{h['code']}\n```\n\n"
            f"{h['problem']}\n\n"
            f"{h['technique']}\n\n"
            f"> **Takeaway:** {h['takeaway']}"
        )
    return "\n\n---\n\n".join(parts)


async def analyze_code(ctx: dict, lang: str) -> dict:
    """纯函数：代码亮点分析。"""
    llm = _llm(max_tokens=8192).with_structured_output(CodeOutput)
    prompt = _CODE_PROMPT.format(context=_format_context(ctx)) + _lang_instruction(lang)

    try:
        result: CodeOutput = await llm.ainvoke(prompt)
        md = _highlights_to_markdown([h.model_dump() for h in result.highlights])
        return {"code_highlights": md}
    except Exception as e:
        return {"code_highlights": f"代码分析失败: {e}"}


# ---------------------------------------------------------------------------
# Node 8: analyze_philosophy — 设计哲学
# ---------------------------------------------------------------------------

_PHILOSOPHY_PROMPT = """You are a senior software architect writing for a technical blog with 100k+ developer readers. Analyze the design philosophy and engineering thinking behind this repository.

{context}

---

Your task: Write a deep analysis of the project's design philosophy.

Requirements for **design_philosophy** (Markdown format, 3-5 paragraphs):

1. **Architectural Vision** (1 paragraph): What kind of system is the author trying to build? What's the overarching design principle? Reference specific architectural choices as evidence.

2. **Key Trade-offs** (1-2 paragraphs): Where did the author make deliberate trade-offs? What was chosen, what was sacrificed, and why? Examples: simplicity vs flexibility, performance vs readability, monolith vs microservices. Reference specific code/config as evidence.

3. **Extensibility Design** (1 paragraph): Where are the extension points? How does the architecture accommodate future growth? Plugin systems, middleware chains, event hooks, etc.

4. **Honest Critique** (1 paragraph): What could be improved? Be specific — name files, patterns, or decisions that could be better. Suggest concrete alternatives. This is NOT optional — every project has room for improvement.

- DO NOT write empty praise like "excellent architecture" without evidence
- DO NOT be generic — every claim must reference specific code, files, or patterns
- Write as if reviewing a colleague's architecture — respectful but honest"""


async def analyze_philosophy(ctx: dict, lang: str) -> dict:
    """纯函数：设计哲学分析。"""
    llm = _llm(max_tokens=3000).with_structured_output(PhilosophyOutput)
    prompt = _PHILOSOPHY_PROMPT.format(context=_format_context(ctx)) + _lang_instruction(lang)

    try:
        result: PhilosophyOutput = await llm.ainvoke(prompt)
        return result.model_dump()
    except Exception as e:
        return {"design_philosophy": f"设计哲学分析失败: {e}"}


# ---------------------------------------------------------------------------
# 独立 Quiz 生成函数（不再是 LangGraph 节点）
# ---------------------------------------------------------------------------

_CHAPTER_PROMPTS = {
    "overview": {
        "title_zh": "项目概述与定位",
        "title_en": "Project Overview",
        "focus": (
            "Project purpose, target users, ecosystem positioning, core value proposition, "
            "competitive advantages, and project maturity. Questions should test whether the reader "
            "truly understands WHAT this project does and WHY it exists."
        ),
    },
    "tech_stack": {
        "title_zh": "技术栈与依赖",
        "title_en": "Tech Stack & Dependencies",
        "focus": (
            "Specific technologies used, version requirements, why they were chosen over alternatives, "
            "dependency relationships, compatibility considerations. Questions should test knowledge of "
            "the actual technology choices, not generic tech trivia."
        ),
    },
    "architecture": {
        "title_zh": "架构设计与模式",
        "title_en": "Architecture & Patterns",
        "focus": (
            "Architecture patterns, design patterns, component relationships, data flow, module boundaries, "
            "layer separation. Questions should reference specific modules and their interactions."
        ),
    },
    "implementation": {
        "title_zh": "核心实现与代码",
        "title_en": "Core Implementation",
        "focus": (
            "Key algorithms, implementation details, specific code patterns, API design, error handling, "
            "performance optimizations. Questions should reference actual code snippets and file paths."
        ),
    },
    "philosophy": {
        "title_zh": "设计思想与权衡",
        "title_en": "Design Philosophy",
        "focus": (
            "Trade-off decisions, extensibility strategy, philosophy behind choices, potential improvements, "
            "architectural vision. Questions should test deep understanding of WHY decisions were made."
        ),
    },
}

_SINGLE_CHAPTER_PROMPT = """You are a technical educator creating exam questions for a software engineering course. Based on the following project analysis, generate quiz questions for ONE specific chapter.

## Repository: {full_name}

## Analysis Summary
{summary}

## Tech Stack
{tech_stack}

## Design Patterns
{design_patterns}

## Core Modules
{core_modules}

## Code Highlights
{code_highlights}

## Design Philosophy
{design_philosophy}

---

Generate questions for chapter: **{chapter_title}**
Focus area: {focus}

Rules:
- Generate 5-8 questions for this chapter
- Each question has exactly 4 options, only one correct
- "answer" is the 0-based index of the correct option
- Difficulty progression: 2 easy → 2-3 medium → 2-3 hard
- Questions MUST be SPECIFIC to this project — no generic software engineering questions
- Hard questions should require understanding multiple aspects of the project
- Explanations should be educational, referencing specific files/modules/patterns
- Wrong options should be plausible but clearly distinguishable with proper understanding"""


async def generate_single_chapter(
    chapter_key: str,
    chapter_title: str,
    analysis: dict,
    repo_context: dict,
    lang: str,
) -> dict:
    """生成单个章节的 quiz，供 /api/quiz 路由逐章调用。"""
    chapter_info = _CHAPTER_PROMPTS[chapter_key]
    llm = _llm(max_tokens=4096).with_structured_output(SingleChapterQuizOutput)

    prompt = _SINGLE_CHAPTER_PROMPT.format(
        full_name=repo_context.get("full_name", ""),
        summary=analysis.get("summary", ""),
        tech_stack=", ".join(analysis.get("tech_stack", [])),
        design_patterns="\n".join(f"- {p}" for p in analysis.get("design_patterns", [])),
        core_modules=analysis.get("core_modules", "")[:3000],
        code_highlights=analysis.get("code_highlights", "")[:3000],
        design_philosophy=analysis.get("design_philosophy", "")[:2000],
        chapter_title=chapter_title,
        focus=chapter_info["focus"],
    ) + _lang_instruction(lang)

    try:
        result: SingleChapterQuizOutput = await llm.ainvoke(prompt)
        return result.model_dump()
    except Exception:
        return {"title": chapter_title, "questions": []}
