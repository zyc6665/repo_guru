from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import settings
from app.services import github_client as gh
from app.agent.state import AgentState
from app.models import FileSelection, AnalysisOutput, QuizOutput


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        temperature=0.3,
    )


def _lang_instruction(lang: str) -> str:
    """根据语言偏好返回 prompt 尾部指令。"""
    if lang == "zh":
        return "\n\nIMPORTANT: You MUST respond in Chinese (简体中文). All text fields (summary, explanations, questions, options) must be in Chinese. Only keep technical terms, proper nouns, and Mermaid syntax in English."
    return ""


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
# Node 2: retrieve — 获取 README / file tree / 依赖文件（轻量概览）
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
#   LLM 审视 file tree，挑选最值得深入阅读的核心文件（最多 8 个）。
#   这避免了把整个仓库塞进上下文窗口。
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
        # Fallback: 不选文件，后续节点用 README + deps 兜底
        paths = []

    return {**state, "key_files": paths, "current_step": "select_files"}


# ---------------------------------------------------------------------------
# Node 4: fetch_files — Execute 阶段
#   并行拉取 LLM 选出的核心文件内容。
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
# Node 5: analyze — 结构化分析（with_structured_output）
# ---------------------------------------------------------------------------

_ANALYZE_PROMPT = """You are a senior software architect and technical educator writing a textbook-level deep analysis of a GitHub repository. Your analysis should be thorough, specific, and educational — like a chapter from "Architecture of Open Source Applications".

## Repository: {full_name}
**Description:** {description}
**Language:** {language} | **Stars:** {stars}

## README (truncated)
{readme}

## File Structure
{file_tree}

## Dependency Files
{dependencies}

## Key Source Files
{key_files_content}

---

Provide a comprehensive, textbook-quality analysis:

1. **summary**: Write a detailed 5-8 sentence overview. Cover: what problem it solves, target users, core value proposition, how it differs from alternatives, and its position in the ecosystem.

2. **tech_stack**: List ALL key technologies with version info if available. Group by category mentally (runtime, framework, database, tooling, testing, deployment).

3. **architecture_mermaid**: Mermaid `graph TD` diagram (8-15 nodes, A[Label] format, --> arrows, no quotes or special chars in IDs). Show data flow, component relationships, and external dependencies.

4. **design_patterns**: List EVERY design pattern and architectural pattern you can identify. For each: pattern name + specific file/module where it's applied + WHY the author chose this pattern over alternatives. Be precise — cite actual class/function names.

5. **core_modules**: Write a textbook-style breakdown in Markdown. For EACH core module:
   - **Responsibility**: What it does and why it exists as a separate module
   - **Public API**: Key functions/classes/interfaces exposed
   - **Internal mechanics**: How it works internally (algorithms, data structures, state management)
   - **Dependencies**: What it depends on and what depends on it
   - **Error handling**: How failures are managed
   Use concrete file paths and function names.

6. **code_highlights**: Pick 5-8 code snippets that demonstrate excellent engineering. For each:
   - File path and line context
   - The code snippet (in markdown code block with language tag)
   - **Technique explained**: What pattern/technique is used
   - **Why it's elegant**: What makes this implementation noteworthy
   - **Learning takeaway**: What a developer can apply to their own projects

7. **design_philosophy**: Write a thorough essay (at least 4 paragraphs) analyzing:
   - **Architectural vision**: The overarching design philosophy and guiding principles
   - **Key trade-offs**: What was sacrificed for what gain (e.g., simplicity vs flexibility, performance vs readability)
   - **Extensibility strategy**: How the codebase is designed to accommodate future changes
   - **Error handling philosophy**: Defensive vs optimistic, fail-fast vs graceful degradation
   - **Developer experience**: How the codebase treats its contributors (naming conventions, documentation, testing strategy)
   - **What could be improved**: Honest assessment of potential weaknesses or areas for enhancement"""


async def analyze_node(state: AgentState) -> AgentState:
    """使用 with_structured_output 生成结构化分析，杜绝手动 JSON 解析。"""
    info = state.get("repo_info", {})
    llm = _llm().with_structured_output(AnalysisOutput)

    prompt = _ANALYZE_PROMPT.format(
        full_name=info.get("full_name", ""),
        description=info.get("description", ""),
        language=info.get("language", ""),
        stars=info.get("stars", 0),
        readme=state.get("readme", "N/A")[:6000],
        file_tree=state.get("file_tree", "N/A")[:3000],
        dependencies=state.get("dependencies", "N/A")[:2000],
        key_files_content=state.get("key_files_content", "N/A")[:8000],
    ) + _lang_instruction(state.get("lang", "en"))

    try:
        result: AnalysisOutput = await llm.ainvoke(prompt)
        analysis = result.model_dump()
    except Exception as e:
        analysis = {"summary": f"Analysis failed: {e}", "tech_stack": [], "architecture_mermaid": ""}

    return {**state, "analysis": analysis, "current_step": "analyze"}


# ---------------------------------------------------------------------------
# Node 6: quiz — 结构化出题（with_structured_output）
# ---------------------------------------------------------------------------

_QUIZ_PROMPT = """You are a technical educator creating a comprehensive exam for a software engineering course. Based on the following project analysis, generate a chapter-based quiz to deeply test understanding of this repository.

## Repository: {full_name}
**Summary:** {summary}
**Tech Stack:** {tech_stack}

## Design Patterns
{design_patterns}

## Core Modules
{core_modules}

## Code Highlights
{code_highlights}

## Design Philosophy
{design_philosophy}

## README (excerpt)
{readme}

---

Generate 5 chapters of quiz questions. Each chapter focuses on a different aspect:

1. **项目概述与定位** (3 questions): Project purpose, target users, ecosystem positioning, core value proposition
2. **技术栈与依赖** (3 questions): Specific technologies used, why they were chosen, version compatibility, dependency relationships
3. **架构设计与模式** (3 questions): Architecture patterns, design patterns, component relationships, data flow, module boundaries
4. **核心实现与代码** (3 questions): Key algorithms, implementation details, specific code patterns, API design, error handling
5. **设计思想与权衡** (3 questions): Trade-off decisions, extensibility strategy, philosophy behind choices, potential improvements

Rules:
- Each question has exactly 4 options, only one correct
- "answer" is the 0-based index of the correct option
- Difficulty progression within each chapter: easy → medium → hard
- Questions must be SPECIFIC to this project — no generic software engineering questions
- Explanations should be educational, referencing specific files/modules/patterns from the project
- Wrong options should be plausible but clearly distinguishable with proper understanding"""


async def quiz_node(state: AgentState) -> AgentState:
    """使用 with_structured_output 生成分章节问答题。"""
    info = state.get("repo_info", {})
    analysis = state.get("analysis", {})
    llm = _llm().with_structured_output(QuizOutput)

    prompt = _QUIZ_PROMPT.format(
        full_name=info.get("full_name", ""),
        summary=analysis.get("summary", ""),
        tech_stack=", ".join(analysis.get("tech_stack", [])),
        design_patterns="\n".join(f"- {p}" for p in analysis.get("design_patterns", [])),
        core_modules=analysis.get("core_modules", "")[:3000],
        code_highlights=analysis.get("code_highlights", "")[:3000],
        design_philosophy=analysis.get("design_philosophy", "")[:2000],
        readme=state.get("readme", "")[:3000],
    ) + _lang_instruction(state.get("lang", "en"))

    try:
        result: QuizOutput = await llm.ainvoke(prompt)
        quiz = [ch.model_dump() for ch in result.chapters]
    except Exception:
        quiz = []

    return {**state, "quiz": quiz, "current_step": "generate_quiz"}
