from __future__ import annotations

from typing import Optional
from typing_extensions import TypedDict


class AgentState(TypedDict, total=False):
    query: str
    is_url: bool
    lang: str  # "zh" | "en"，控制 LLM 输出语言
    repo_info: Optional[dict]
    readme: Optional[str]
    file_tree: Optional[str]
    dependencies: Optional[str]
    # --- Plan-and-Execute: LLM 先看 file tree，决定要读哪些核心文件 ---
    key_files: Optional[list[str]]       # LLM 选出的关键文件路径列表
    key_files_content: Optional[str]     # 拼接后的核心文件内容
    # --- 拆分后的 4 个分析子结果 ---
    analysis_overview: Optional[dict]      # summary + tech_stack + design_patterns
    analysis_architecture: Optional[dict]  # architecture_mermaid + core_modules
    analysis_code: Optional[dict]          # code_highlights
    analysis_philosophy: Optional[dict]    # design_philosophy
    error: Optional[str]
    current_step: str
