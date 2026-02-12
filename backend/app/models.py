from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    query: str
    is_url: bool = False


class RepoInfo(BaseModel):
    name: str
    full_name: str
    description: str = ""
    stars: int = 0
    language: str = ""
    url: str = ""


class AnalysisResult(BaseModel):
    summary: str = ""
    tech_stack: list[str] = []
    architecture_mermaid: str = ""
    file_tree: str = ""


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer: int
    explanation: str = ""


class SSEEvent(BaseModel):
    event: str
    data: dict


# ---------------------------------------------------------------------------
# Structured Output schemas — 供 LangChain .with_structured_output() 使用
# ---------------------------------------------------------------------------

class FileSelection(BaseModel):
    """LLM 从 file tree 中选出的关键文件列表。Plan-and-Execute 的 Plan 阶段。"""
    reasoning: str = Field(description="为什么选这些文件（一句话）")
    paths: list[str] = Field(
        description="要深入阅读的文件路径列表，最多 8 个",
        max_length=8,
    )


class AnalysisOutput(BaseModel):
    """LLM 对仓库的结构化分析结果。"""
    summary: str = Field(description="3-5 句话概括项目用途、核心功能和亮点")
    tech_stack: list[str] = Field(description="关键技术栈列表")
    architecture_mermaid: str = Field(
        description=(
            "Mermaid graph TD 架构图。5-12 个节点，用 A[Label] 格式，"
            "箭头用 -->，不要引号和特殊字符"
        )
    )
    # --- 技术解构 ---
    design_patterns: list[str] = Field(
        description="项目中使用的设计模式和架构模式，如 MVC、观察者模式、中间件模式等，每项一句话说明在哪里用了"
    )
    core_modules: str = Field(
        description="核心模块拆解：用 Markdown 列表逐个说明每个核心模块的职责、输入输出和关键实现思路"
    )
    # --- 代码学习 ---
    code_highlights: str = Field(
        description=(
            "值得学习的代码片段和技巧：挑出 3-5 个亮点，每个包含文件路径、"
            "代码片段（用 markdown code block）、以及为什么值得学习的解释"
        )
    )
    # --- 设计思想 ---
    design_philosophy: str = Field(
        description=(
            "项目的设计哲学和工程思想：分析作者的架构决策、权衡取舍、"
            "可扩展性设计、错误处理策略等，帮助读者理解 WHY 而不只是 WHAT"
        )
    )


class QuizItem(BaseModel):
    """单道选择题。"""
    question: str
    options: list[str] = Field(min_length=4, max_length=4)
    answer: int = Field(ge=0, le=3, description="正确选项的 0-based 索引")
    explanation: str


class QuizChapter(BaseModel):
    """一个章节的题目集合。"""
    title: str = Field(description="章节标题，如「项目概述与定位」")
    questions: list[QuizItem] = Field(min_length=2, max_length=5)


class QuizOutput(BaseModel):
    """LLM 生成的分章节问答题集合。"""
    chapters: list[QuizChapter] = Field(min_length=4, max_length=6)
