export interface RepoInfo {
  name: string;
  full_name: string;
  description: string;
  stars: number;
  language: string;
  url: string;
}

export interface AnalysisResult {
  summary: string;
  tech_stack: string[];
  architecture_mermaid: string;
  file_tree: string;
  design_patterns: string[];
  core_modules: string;
  code_highlights: string;
  design_philosophy: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface QuizChapter {
  title: string;
  questions: QuizQuestion[];
}

export interface StepStatus {
  step: string;
  status: "pending" | "running" | "done";
}

export interface AnalysisPartial {
  section: "overview" | "architecture" | "code" | "philosophy";
  data: Record<string, unknown>;
}

export type SSEEventType = "step" | "result" | "error" | "done";

export interface SSEMessage {
  event: SSEEventType;
  data: Record<string, unknown>;
}
