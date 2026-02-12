import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import SearchBar from "@/components/SearchBar";
import RepoList from "@/components/RepoList";
import StepProgress from "@/components/StepProgress";
import AnalysisPanel from "@/components/AnalysisPanel";
import QuizPanel from "@/components/QuizPanel";
import { useSSE } from "@/hooks/use-sse";
import type { RepoInfo, AnalysisResult, QuizChapter, StepStatus } from "@/types";

/** 判断输入是否为 URL 或 owner/repo 格式 */
function isDirectRepo(query: string): boolean {
  const q = query.trim();
  return /github\.com\//.test(q) || /^[^/\s]+\/[^/\s]+$/.test(q);
}

export default function App() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [activeTab, setActiveTab] = useState<"search" | "analysis">("search");

  // 搜索阶段
  const [searchResults, setSearchResults] = useState<RepoInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 分析阶段
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const { events, isDone, error: sseError } = useSSE(sseUrl);

  const isAnalyzing = sseUrl !== null && !isDone && !sseError;

  // 搜索关键词 → 展示候选列表
  const handleSearch = useCallback(async (query: string) => {
    setSearchError("");

    // URL 或 owner/repo → 直接分析，切到分析 tab
    if (isDirectRepo(query)) {
      const encoded = encodeURIComponent(query.trim());
      setSseUrl(`/api/analyze?query=${encoded}&lang=${lang}`);
      setActiveTab("analysis");
      return;
    }

    // 关键词 → 搜索候选，留在搜索 tab
    setSearchResults([]);
    setSearchPage(1);
    setHasMore(false);
    setTotalCount(0);
    setSearching(true);
    setSearchQuery(query);
    setActiveTab("search");
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=1&limit=12`);
      if (!resp.ok) throw new Error(`搜索失败 (${resp.status})`);
      const data = await resp.json();
      const repos = data.results as RepoInfo[];
      if (!repos.length) {
        setSearchError(`未找到与「${query}」相关的项目`);
      } else {
        setSearchResults(repos);
        setHasMore(data.has_more);
        setTotalCount(data.total_count);
      }
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "搜索出错");
    } finally {
      setSearching(false);
    }
  }, [lang]);

  // 加载更多搜索结果
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = searchPage + 1;
    setLoadingMore(true);
    try {
      const resp = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&page=${nextPage}&limit=12`);
      if (!resp.ok) throw new Error(`加载失败 (${resp.status})`);
      const data = await resp.json();
      const repos = data.results as RepoInfo[];
      setSearchResults((prev) => [...prev, ...repos]);
      setSearchPage(nextPage);
      setHasMore(data.has_more);
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "加载出错");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, searchPage, searchQuery]);

  // 选择某个仓库 → 开始深度分析，切到分析 tab
  const handleSelectRepo = useCallback((repo: RepoInfo) => {
    const encoded = encodeURIComponent(repo.full_name);
    setSseUrl(`/api/analyze?query=${encoded}&lang=${lang}`);
    setActiveTab("analysis");
  }, [lang]);

  // 从 SSE 事件中派生状态
  const { steps, repoInfo, analysis, quiz } = useMemo(() => {
    const steps: Record<string, StepStatus["status"]> = {};
    let repoInfo: RepoInfo | null = null;
    let analysis: AnalysisResult | null = null;
    let quiz: QuizChapter[] = [];

    for (const ev of events) {
      if (ev.event === "step") {
        const { step, status } = ev.data as { step: string; status: StepStatus["status"] };
        steps[step] = status;
      } else if (ev.event === "result") {
        const { type, data } = ev.data as { type: string; data: unknown };
        if (type === "repo_info") repoInfo = data as RepoInfo;
        if (type === "analysis") analysis = data as AnalysisResult;
        if (type === "quiz") quiz = data as QuizChapter[];
      }
    }
    return { steps, repoInfo, analysis, quiz };
  }, [events]);

  const hasSteps = Object.keys(steps).length > 0;
  const displayError = searchError || sseError;
  const hasAnalysis = sseUrl !== null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <span className="text-xl">🧠</span>
          <span className="font-bold text-lg tracking-tight">RepoGuru</span>
        </Link>
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

        {/* Tabs */}
        <div className="flex rounded-lg bg-muted/50 p-1 border border-border">
          <button
            onClick={() => setActiveTab("search")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-all relative ${
              activeTab === "search"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary/70"
            }`}
          >
            🔍 搜索
            {searchResults.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
                {totalCount.toLocaleString()}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-all relative ${
              activeTab === "analysis"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary/70"
            }`}
          >
            📊 分析
            {isAnalyzing && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            )}
          </button>
        </div>

        {/* Tab: 搜索 */}
        {activeTab === "search" && (
          <AnimatePresence mode="wait">
            <motion.div
              key="search-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              {searchResults.length > 0 ? (
                <RepoList
                  repos={searchResults}
                  onSelect={handleSelectRepo}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onLoadMore={handleLoadMore}
                  totalCount={totalCount}
                />
              ) : !searching && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  输入关键词开始搜索项目
                </div>
              )}
              {searching && (
                <div className="space-y-3 animate-pulse py-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg" />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Tab: 分析 */}
        {activeTab === "analysis" && (
          <AnimatePresence mode="wait">
            <motion.div
              key="analysis-tab"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {!hasAnalysis && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  从搜索结果中选择项目，或直接粘贴链接开始分析
                </div>
              )}

              {hasSteps && <StepProgress steps={steps} />}

              {analysis && (
                <>
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
                      <QuizPanel chapters={quiz} />
                    </motion.div>
                  )}
                </>
              )}

              {isAnalyzing && !analysis && hasSteps && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground">
        RepoGuru — Powered by LangGraph + DeepSeek
      </footer>
    </div>
  );
}
