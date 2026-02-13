from langgraph.graph import StateGraph, END

from app.agent.state import AgentState
from app.agent.nodes import (
    search_node,
    retrieve_node,
    select_files_node,
    fetch_files_node,
)


def build_graph() -> StateGraph:
    """
    工作流: search → retrieve → select_files → fetch_files → END

    4 个分析维度在路由层并发调用（asyncio.as_completed），不再走 graph。
    Quiz 由独立的 POST /api/quiz 端点按需触发。
    """
    graph = StateGraph(AgentState)

    graph.add_node("search", search_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("select_files", select_files_node)
    graph.add_node("fetch_files", fetch_files_node)

    graph.set_entry_point("search")

    def route_after_search(state: AgentState) -> str:
        return END if state.get("error") else "retrieve"

    graph.add_conditional_edges("search", route_after_search, {END: END, "retrieve": "retrieve"})
    graph.add_edge("retrieve", "select_files")
    graph.add_edge("select_files", "fetch_files")
    graph.add_edge("fetch_files", END)

    return graph.compile()
