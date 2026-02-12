from langgraph.graph import StateGraph, END

from app.agent.state import AgentState
from app.agent.nodes import (
    search_node,
    retrieve_node,
    select_files_node,
    fetch_files_node,
    analyze_node,
    quiz_node,
)


def build_graph() -> StateGraph:
    """
    工作流: search → retrieve → select_files → fetch_files → analyze → quiz

    Plan-and-Execute 模式体现在 select_files (Plan) + fetch_files (Execute):
    LLM 先审视 file tree 决定要读哪些文件，再去拉取，避免把整个仓库塞进上下文。
    """
    graph = StateGraph(AgentState)

    graph.add_node("search", search_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("select_files", select_files_node)
    graph.add_node("fetch_files", fetch_files_node)
    graph.add_node("analyze", analyze_node)
    graph.add_node("generate_quiz", quiz_node)

    graph.set_entry_point("search")

    def route_after_search(state: AgentState) -> str:
        return END if state.get("error") else "retrieve"

    graph.add_conditional_edges("search", route_after_search, {END: END, "retrieve": "retrieve"})
    graph.add_edge("retrieve", "select_files")
    graph.add_edge("select_files", "fetch_files")
    graph.add_edge("fetch_files", "analyze")
    graph.add_edge("analyze", "generate_quiz")
    graph.add_edge("generate_quiz", END)

    return graph.compile()
