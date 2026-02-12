import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SearchBar from "@/components/SearchBar";
import RepoList from "@/components/RepoList";
import StepProgress from "@/components/StepProgress";
import AnalysisPanel from "@/components/AnalysisPanel";
import QuizPanel from "@/components/QuizPanel";
import { useSSE } from "@/hooks/use-sse";
import type { RepoInfo, AnalysisResult, QuizQuestion, StepStatus } from "@/types";

/** 判断输入是否为 URL 或 owner/repo 格式 */
function isDirectRepo(query: string): boolean {
  const q = query.trim();
  return /github\.com\//.test(q) || /^[^/\s]+\/[^/\s]+$/.test(q);
}

export default function App() {
  const [lang, setLang] = useState<"zh" | "en">("zh");

  // 搜索阶段
  const [searchResults, setSearchResults] = useState<RepoInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // 分析阶段
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const { events, isDone, error: sseError } = useSSE(sseUrl);

  const isAnalyzing = sseUrl !== null && !isDone && !sseError;

  // 搜索关键词 → 展示候选列表
  const handleSearch = useCallback(async (query: string) => {
    // 重置状态
    setSearchResults([]);
    setSearchError("");
    setSseUrl(null);

    // URL 或 owner/repo → 直接分析
    if (isDirectRepo(query)) {
      const encoded = encodeURIComponent(query.trim());
      setSseUrl(`/api/analyze?query=${encoded}&lang=${lang}`);
      return;
    }

    // 关键词 → 搜索候选
    setSearching(true);
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) throw new Error(`搜索失败 (${resp.status})`);
      const data = await resp.json();
      const repos = data.results as RepoInfo[];
      if (!repos.length) {
        setSearchError(`未找到与「${query}」相关的项目`);
      } else {
        setSearchResults(repos);
      }
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "搜索出错");
    } finally {
      setSearching(false);
    }
  }, [lang]);

  // 选择某个仓库 → 开始深度分析
  const handleSelectRepo = useCallback((repo: RepoInfo) => {
    setSearchResults([]);
    setSearchError("");
    const encoded = encodeURIComponent(repo.full_name);
    setSseUrl(`/api/analyze?query=${encoded}&lang=${lang}`);
  }, [lang]);

  // 从 SSE 事件中派生状态
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
  const displayError = searchError || sseError;

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
            输入关键词搜索项目，或直接粘贴 GitHub 链接进行深度分析
          </p>
        </div>

        <SearchBar onSearch={handleSearch} isLoading={searching || isAnalyzing} />

        {/* Error */}
        <AnimatePresence>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center"
            >
              {displayError}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 搜索结果列表 */}
        <AnimatePresence>
          {searchResults.length > 0 && !sseUrl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <RepoList repos={searchResults} onSelect={handleSelectRepo} />
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
        {isAnalyzing && !analysis && hasSteps && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-32 bg-muted rounded" />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground">
        RepoGuru — Powered by LangGraph + DeepSeek
      </footer>
    </div>
  );
}
