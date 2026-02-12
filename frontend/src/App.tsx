import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import StepProgress from "@/components/StepProgress";
import AnalysisPanel from "@/components/AnalysisPanel";
import QuizPanel from "@/components/QuizPanel";
import { useSSE } from "@/hooks/use-sse";
import type { RepoInfo, AnalysisResult, QuizQuestion, StepStatus } from "@/types";

export default function App() {
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const { events, isDone, error } = useSSE(sseUrl);

  const isLoading = sseUrl !== null && !isDone && !error;

  const handleSearch = useCallback((query: string) => {
    const encoded = encodeURIComponent(query);
    setSseUrl(`/api/analyze?query=${encoded}&lang=${lang}`);
  }, [lang]);

  // Derive state from SSE events
  const { steps, repoInfo, analysis, quiz } = useMemo(() => {
    const steps: Record<string, StepStatus["status"]> = {};
    let repoInfo: RepoInfo | null = null;
    let analysis: AnalysisResult | null = null;
    let quiz: QuizQuestion[] = [];

    for (const ev of events) {
      if (ev.event === "step") {
        const { step, status } = ev.data as { step: string; status: StepStatus["status"] };
        steps[step] = status;
      } else if (ev.event === "result") {
        const { type, data } = ev.data as { type: string; data: unknown };
        if (type === "repo_info") repoInfo = data as RepoInfo;
        if (type === "analysis") analysis = data as AnalysisResult;
        if (type === "quiz") quiz = data as QuizQuestion[];
      }
    }
    return { steps, repoInfo, analysis, quiz };
  }, [events]);

  const hasSteps = Object.keys(steps).length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <span className="font-bold text-lg tracking-tight">RepoGuru</span>
        </div>
        <button
          onClick={() => setLang((l) => (l === "zh" ? "en" : "zh"))}
          className="px-3 py-1 text-xs rounded-full border border-border hover:bg-accent transition-colors"
        >
          {lang === "zh" ? "中文" : "EN"}
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2 mb-4">
          <h1 className="text-2xl font-bold">GitHub 项目智能分析</h1>
          <p className="text-sm text-muted-foreground">
            输入项目关键词或链接，AI 为你解读代码库
          </p>
        </div>

        <SearchBar onSearch={handleSearch} isLoading={isLoading} />

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Progress */}
        {hasSteps && <StepProgress steps={steps} />}

        {/* Analysis Results */}
        <AnimatePresence>
          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <AnalysisPanel repoInfo={repoInfo} analysis={analysis} />

              {quiz.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <span>🎯</span> 知识问答
                  </h3>
                  <QuizPanel questions={quiz} />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading skeleton */}
        {isLoading && !analysis && hasSteps && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-32 bg-muted rounded" />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground">
        RepoGuru — Powered by LangGraph + OpenAI
      </footer>
    </div>
  );
}
