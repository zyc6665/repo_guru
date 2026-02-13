from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent.graph import build_graph
from app.agent.state import AgentState
from app.agent.nodes import (
    build_repo_context,
    analyze_overview,
    analyze_architecture,
    analyze_code,
    analyze_philosophy,
    generate_single_chapter,
    _CHAPTER_PROMPTS,
)
from app.services import github_client as gh

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---- 轻量搜索：返回候选仓库列表，不走 Agent ----

@router.get("/search")
async def search_repos(
    q: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=30),
):
    data = await gh.search_repos(q, limit=limit, page=page)
    return {
        "results": data["items"],
        "total_count": data["total_count"],
        "page": page,
        "has_more": page * limit < data["total_count"],
    }


# ---- 分析流（SSE）：graph 获取数据 → 4 个分析维度并发调用 ----

# section 名 → 分析函数
_ANALYSIS_FUNCS = {
    "overview": analyze_overview,
    "architecture": analyze_architecture,
    "code": analyze_code,
    "philosophy": analyze_philosophy,
}


async def _run_section(section: str, func, ctx: dict, lang: str) -> tuple[str, dict]:
    """包装分析函数，返回 (section_name, data)，供 as_completed 识别。"""
    data = await func(ctx, lang)
    return section, data


@router.get("/analyze")
async def analyze_repo(query: str = Query(..., min_length=1), lang: str = Query("zh")):
    async def event_generator():
        graph = build_graph()

        initial_state: AgentState = {
            "query": query,
            "is_url": False,
            "lang": lang,
            "repo_info": None,
            "readme": None,
            "file_tree": None,
            "dependencies": None,
            "key_files": None,
            "key_files_content": None,
            "analysis_overview": None,
            "analysis_architecture": None,
            "analysis_code": None,
            "analysis_philosophy": None,
            "error": None,
            "current_step": "",
        }

        if "/" in query or "github.com" in query:
            initial_state["is_url"] = True

        prev_step = ""
        final_state = initial_state

        try:
            # Phase 1: graph 执行 search → retrieve → select_files → fetch_files
            async for state_update in graph.astream(initial_state):
                for node_name, node_state in state_update.items():
                    final_state = {**final_state, **node_state}
                    step = node_name

                    if step != prev_step:
                        if prev_step:
                            yield _sse("step", {"step": prev_step, "status": "done"})
                        yield _sse("step", {"step": step, "status": "running"})
                        prev_step = step

                    if step == "search" and final_state.get("repo_info"):
                        yield _sse("result", {"type": "repo_info", "data": final_state["repo_info"]})
                    elif step == "search" and final_state.get("error"):
                        yield _sse("error", {"message": final_state["error"]})
                        return

                    if step == "select_files" and final_state.get("key_files"):
                        yield _sse("result", {
                            "type": "key_files",
                            "data": final_state["key_files"],
                        })

            if prev_step:
                yield _sse("step", {"step": prev_step, "status": "done"})

            # Phase 2: 4 个分析维度并发调用，谁先完成谁先推送
            ctx = build_repo_context(final_state)

            # 标记所有分析步骤为 running
            for section in _ANALYSIS_FUNCS:
                yield _sse("step", {"step": f"analyze_{section}", "status": "running"})

            tasks = [
                asyncio.create_task(_run_section(section, func, ctx, lang))
                for section, func in _ANALYSIS_FUNCS.items()
            ]

            merged_analysis = {}
            for coro in asyncio.as_completed(tasks):
                section, data = await coro
                merged_analysis.update(data)

                # 推送该维度完成
                yield _sse("step", {"step": f"analyze_{section}", "status": "done"})
                yield _sse("result", {
                    "type": "analysis_partial",
                    "section": section,
                    "data": data,
                })

            # 推送合并后的完整 analysis（兼容 + 供 quiz 端点使用）
            if merged_analysis:
                yield _sse("result", {
                    "type": "analysis",
                    "data": {
                        **merged_analysis,
                        "file_tree": final_state.get("file_tree", ""),
                    },
                })

            yield _sse("done", {"message": "Analysis complete"})

        except Exception as e:
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---- Quiz 流（SSE POST）：逐章节生成测验 ----

class QuizRequest(BaseModel):
    analysis: dict
    repo_context: dict
    lang: str = "zh"


@router.post("/quiz")
async def generate_quiz(req: QuizRequest):
    async def event_generator():
        chapters_order = ["overview", "tech_stack", "architecture", "implementation", "philosophy"]
        lang = req.lang
        total = len(chapters_order)

        yield _sse("step", {"step": "quiz", "status": "running", "total": total})

        for i, chapter_key in enumerate(chapters_order):
            chapter_info = _CHAPTER_PROMPTS[chapter_key]
            title = chapter_info["title_zh"] if lang == "zh" else chapter_info["title_en"]

            yield _sse("step", {
                "step": "quiz_chapter",
                "status": "running",
                "chapter": chapter_key,
                "index": i,
                "total": total,
            })

            chapter_data = await generate_single_chapter(
                chapter_key=chapter_key,
                chapter_title=title,
                analysis=req.analysis,
                repo_context=req.repo_context,
                lang=lang,
            )

            yield _sse("result", {
                "type": "quiz_chapter",
                "index": i,
                "data": chapter_data,
            })

            yield _sse("step", {
                "step": "quiz_chapter",
                "status": "done",
                "chapter": chapter_key,
                "index": i,
                "total": total,
            })

        yield _sse("done", {"message": "Quiz generation complete"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")
