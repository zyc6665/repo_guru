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
    if not repos:
        return {**state, "error": f"No repositories found for '{query}'", "current_step": "search"}
    return {**state, "repo_info": repos[0], "current_step": "search"}


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

_ANALYZE_PROMPT = """You are a senior software architect and technical educator. Analyze the following GitHub repository in depth.

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

Provide a comprehensive analysis covering:

1. **summary**: Project overview in 3-5 sentences.
2. **tech_stack**: List of key technologies.
3. **architecture_mermaid**: Mermaid `graph TD` diagram (5-12 nodes, A[Label] format, --> arrows, no quotes or special chars in IDs).
4. **design_patterns**: List design patterns / architectural patterns used. Each item = pattern name + where it's applied in one sentence.
5. **core_modules**: Break down core modules in Markdown list. For each: responsibility, inputs/outputs, key implementation idea.
6. **code_highlights**: Pick 3-5 code snippets worth studying. For each: file path, the code (in markdown code block), and WHY it's worth learning.
7. **design_philosophy**: Analyze the author's architectural decisions, trade-offs, extensibility design, error handling strategy. Focus on WHY, not just WHAT."""


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

_QUIZ_PROMPT = """Based on the following project analysis, generate 5 multiple-choice quiz questions to test understanding of this repository.

## Repository: {full_name}
**Summary:** {summary}
**Tech Stack:** {tech_stack}

## README (excerpt)
{readme}

---

Rules:
- Exactly 5 questions, 4 options each, only one correct
- "answer" is the 0-based index of the correct option
- Mix difficulty: 2 easy, 2 medium, 1 hard
- Cover: project purpose, tech stack, architecture, key features, use cases"""


async def quiz_node(state: AgentState) -> AgentState:
    """使用 with_structured_output 生成问答题，保证格式正确。"""
    info = state.get("repo_info", {})
    analysis = state.get("analysis", {})
    llm = _llm().with_structured_output(QuizOutput)

    prompt = _QUIZ_PROMPT.format(
        full_name=info.get("full_name", ""),
        summary=analysis.get("summary", ""),
        tech_stack=", ".join(analysis.get("tech_stack", [])),
        readme=state.get("readme", "")[:4000],
    ) + _lang_instruction(state.get("lang", "en"))

    try:
        result: QuizOutput = await llm.ainvoke(prompt)
        quiz = [q.model_dump() for q in result.questions]
    except Exception:
        quiz = []

    return {**state, "quiz": quiz, "current_step": "generate_quiz"}
