from __future__ import annotations

import json

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.agent.graph import build_graph
from app.agent.state import AgentState

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


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
            "analysis": None,
            "quiz": None,
            "error": None,
            "current_step": "",
        }

        if "/" in query or "github.com" in query:
            initial_state["is_url"] = True

        prev_step = ""
        final_state = initial_state

        try:
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

                    # 当 select_files 完成时，推送 LLM 选出的文件列表
                    if step == "select_files" and final_state.get("key_files"):
                        yield _sse("result", {
                            "type": "key_files",
                            "data": final_state["key_files"],
                        })

            if prev_step:
                yield _sse("step", {"step": prev_step, "status": "done"})

            if final_state.get("analysis"):
                yield _sse("result", {
                    "type": "analysis",
                    "data": {
                        **final_state["analysis"],
                        "file_tree": final_state.get("file_tree", ""),
                    },
                })

            if final_state.get("quiz"):
                yield _sse("result", {"type": "quiz", "data": final_state["quiz"]})

            yield _sse("done", {"message": "Analysis complete"})

        except Exception as e:
            yield _sse("error", {"message": str(e)})

    return StreamingResponse(event_generator(), media_type="text/event-stream")
