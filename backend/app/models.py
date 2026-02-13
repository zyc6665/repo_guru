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


# ---------------------------------------------------------------------------
# 4 个细粒度分析输出模型（替代单一 AnalysisOutput）
# ---------------------------------------------------------------------------

class OverviewOutput(BaseModel):
    """概述维度：项目定位 + 技术栈 + 设计模式。"""
    summary: str = Field(
        description=(
            "6-10 句话的深度概述。必须覆盖：项目解决什么问题、目标用户是谁、"
            "核心功能列表、与同类项目的差异化优势、项目成熟度评估。"
            "引用 README 或代码中的具体证据。"
        )
    )
    tech_stack: list[str] = Field(
        description="关键技术栈列表，每项格式如 'Python 3.10+', 'FastAPI 0.100+', 'React 18'"
    )
    design_patterns: list[str] = Field(
        description=(
            "项目中使用的 4-6 个设计模式/架构模式。每项必须包含：模式名称、"
            "在哪个文件/模块中使用、为什么选择这个模式（一句话）。"
            "禁止泛泛而谈，必须引用具体代码位置。"
        )
    )


class ArchitectureOutput(BaseModel):
    """架构维度：架构图 + 核心模块拆解。"""
    architecture_mermaid: str = Field(
        description=(
            "Mermaid graph TD 架构图。8-15 个节点，用 A[Label] 格式，"
            "箭头用 -->，不要引号和特殊字符。"
            "必须体现数据流向和模块间依赖关系。"
        )
    )
    core_modules: str = Field(
        description=(
            "核心模块深度拆解（Markdown 格式）。每个模块用 ### 标题，"
            "包含：职责描述、关键 API/函数签名、输入输出数据结构、"
            "与其他模块的交互方式、关键设计决策。引用具体文件名和函数名。"
        )
    )


class CodeHighlight(BaseModel):
    """单个代码亮点的结构化表示。"""
    title: str = Field(description="技巧/模式名称，如 'Async Pipeline Pattern'")
    file_path: str = Field(description="文件路径和行号范围，如 'src/core/engine.py:L10-L30'")
    language: str = Field(description="代码语言，如 'python', 'typescript', 'go'")
    code: str = Field(description="关键代码片段（15-25行）。如果函数较长，展示最重要的部分，省略处加注释说明。")
    problem: str = Field(description="这段代码解决了什么问题（1-2 句话）")
    technique: str = Field(description="用了什么技巧/模式，为什么值得学习（2-3 句话）")
    takeaway: str = Field(description="一句话总结收获")


class CodeOutput(BaseModel):
    """代码维度：值得学习的代码片段和技巧。"""
    highlights: list[CodeHighlight] = Field(
        min_length=3,
        max_length=6,
        description=(
            "挑出 4-6 个值得学习的代码亮点。"
            "DO NOT 选择 trivial 的代码（简单 getter、基础 CRUD、样板代码），要选有深度的实现。"
            "DO pick: 巧妙算法、优雅抽象、错误处理模式、性能优化、创造性 API 设计。"
        )
    )


class PhilosophyOutput(BaseModel):
    """设计哲学维度：架构决策、权衡取舍、工程思想。"""
    design_philosophy: str = Field(
        description=(
            "3-5 段深度分析（Markdown 格式）。必须覆盖：\n"
            "1. 架构愿景：作者想构建什么样的系统？整体设计理念是什么？\n"
            "2. 关键权衡：在哪些地方做了取舍？选择了什么、放弃了什么、为什么？\n"
            "3. 可扩展性设计：哪些地方为未来扩展留了口子？怎么做到的？\n"
            "4. 诚实批评：哪些设计可以改进？给出具体建议。\n\n"
            "DO NOT 写空洞的赞美，必须有具体的代码/架构证据支撑每个观点。"
        )
    )


class AnalysisOutput(BaseModel):
    """LLM 对仓库的结构化分析结果（保留兼容，不再直接使用）。"""
    summary: str = Field(description="3-5 句话概括项目用途、核心功能和亮点")
    tech_stack: list[str] = Field(description="关键技术栈列表")
    architecture_mermaid: str = Field(
        description=(
            "Mermaid graph TD 架构图。5-12 个节点，用 A[Label] 格式，"
            "箭头用 -->，不要引号和特殊字符"
        )
    )
    design_patterns: list[str] = Field(
        description="项目中使用的设计模式和架构模式"
    )
    core_modules: str = Field(
        description="核心模块拆解"
    )
    code_highlights: str = Field(
        description="值得学习的代码片段和技巧"
    )
    design_philosophy: str = Field(
        description="项目的设计哲学和工程思想"
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
    questions: list[QuizItem] = Field(min_length=3, max_length=8)


class SingleChapterQuizOutput(BaseModel):
    """单章节 Quiz 输出，供逐章调用 LLM 使用。"""
    title: str = Field(description="章节标题")
    questions: list[QuizItem] = Field(min_length=3, max_length=8)


class QuizOutput(BaseModel):
    """LLM 生成的分章节问答题集合（保留兼容）。"""
    chapters: list[QuizChapter] = Field(min_length=4, max_length=6)


class QuizRequest(BaseModel):
    """POST /api/quiz 请求体。"""
    analysis: dict
    repo_context: dict
    lang: str = "zh"
