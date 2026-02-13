import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import SearchBar from "@/components/SearchBar";
import RepoList from "@/components/RepoList";
import StepProgress from "@/components/StepProgress";
import AnalysisPanel from "@/components/AnalysisPanel";
import QuizPanel from "@/components/QuizPanel";
import { useSSE } from "@/hooks/use-sse";
import { useQuizSSE } from "@/hooks/use-quiz-sse";
import type { RepoInfo, AnalysisResult, StepStatus, QuizChapter } from "@/types";

// ---------------------------------------------------------------------------
// sessionStorage 缓存
// ---------------------------------------------------------------------------
const CACHE_KEY = "repoguru_cache";

interface AppCache {
  searchResults: RepoInfo[];
  searchQuery: string;
  searchPage: number;
  hasMore: boolean;
  totalCount: number;
  repoInfo: RepoInfo | null;
  analysis: AnalysisResult | null;
  quizChapters: QuizChapter[];
  activeTab: "search" | "analysis" | "quiz";
  lang: "zh" | "en";
}

function loadCache(): AppCache | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppCache) : null;
  } catch {
    return null;
  }
}

function saveCache(cache: AppCache) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota exceeded — ignore */ }
}

/** 判断输入是否为 URL 或 owner/repo 格式 */
function isDirectRepo(query: string): boolean {
  const q = query.trim();
  return /github\.com\//.test(q) || /^[^/\s]+\/[^/\s]+$/.test(q);
}

export default function App() {
  const cached = useRef(loadCache()).current;

  const [lang, setLang] = useState<"zh" | "en">(cached?.lang ?? "zh");
  const [activeTab, setActiveTab] = useState<"search" | "analysis" | "quiz">(cached?.activeTab ?? "search");

  // 搜索阶段
  const [searchResults, setSearchResults] = useState<RepoInfo[]>(cached?.searchResults ?? []);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchQuery, setSearchQuery] = useState(cached?.searchQuery ?? "");
  const [searchPage, setSearchPage] = useState(cached?.searchPage ?? 1);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [totalCount, setTotalCount] = useState(cached?.totalCount ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);

  // 缓存的分析/测验结果（从 sessionStorage 恢复）
  const [savedRepoInfo, setSavedRepoInfo] = useState<RepoInfo | null>(cached?.repoInfo ?? null);
  const [savedAnalysis, setSavedAnalysis] = useState<AnalysisResult | null>(cached?.analysis ?? null);
  const [savedQuizChapters, setSavedQuizChapters] = useState<QuizChapter[]>(cached?.quizChapters ?? []);

  // 分析阶段
  const [sseUrl, setSseUrl] = useState<string | null>(null);
  const { events, isDone, error: sseError } = useSSE(sseUrl);

  // Quiz 阶段
  const quiz = useQuizSSE(savedQuizChapters);

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

  // 从 SSE 事件中派生状态，支持 analysis_partial 增量合并
  const { steps, repoInfo, analysis } = useMemo(() => {
    const steps: Record<string, StepStatus["status"]> = {};
    let repoInfo: RepoInfo | null = null;
    let analysis: AnalysisResult | null = null;

    for (const ev of events) {
      if (ev.event === "step") {
        const { step, status } = ev.data as { step: string; status: StepStatus["status"] };
        steps[step] = status;
      } else if (ev.event === "result") {
        const { type, data, section } = ev.data as { type: string; data: unknown; section?: string };
        if (type === "repo_info") repoInfo = data as RepoInfo;
        if (type === "analysis_partial" && section) {
          // 增量合并到 analysis 对象
          if (!analysis) {
            analysis = {
              summary: "",
              tech_stack: [],
              architecture_mermaid: "",
              file_tree: "",
              design_patterns: [],
              core_modules: "",
              code_highlights: "",
              design_philosophy: "",
            };
          }
          analysis = { ...analysis, ...(data as Record<string, unknown>) } as AnalysisResult;
        }
        if (type === "analysis") {
          // 最终完整 analysis（兼容）
          analysis = data as AnalysisResult;
        }
      }
    }
    return { steps, repoInfo, analysis };
  }, [events]);

  // 合并 SSE 实时数据与缓存数据（SSE 优先）
  const displayRepoInfo = repoInfo || savedRepoInfo;
  const displayAnalysis = analysis || savedAnalysis;
  const hasSteps = Object.keys(steps).length > 0;
  const displayError = searchError || sseError;
  const hasAnalysis = sseUrl !== null || savedAnalysis !== null;

  // 分析完成 → 写入缓存 state
  useEffect(() => {
    if (isDone && analysis) {
      setSavedAnalysis(analysis);
      setSavedRepoInfo(repoInfo);
    }
  }, [isDone, analysis, repoInfo]);

  // quiz 完成 → 写入缓存 state
  useEffect(() => {
    if (quiz.chapters.length > 0 && !quiz.isGenerating) {
      setSavedQuizChapters(quiz.chapters);
    }
  }, [quiz.chapters, quiz.isGenerating]);

  // 持久化到 sessionStorage
  useEffect(() => {
    saveCache({
      searchResults,
      searchQuery,
      searchPage,
      hasMore,
      totalCount,
      repoInfo: displayRepoInfo,
      analysis: displayAnalysis,
      quizChapters: quiz.chapters.length > 0 ? quiz.chapters : savedQuizChapters,
      activeTab,
      lang,
    });
  }, [searchResults, searchQuery, searchPage, hasMore, totalCount,
      displayRepoInfo, displayAnalysis, quiz.chapters, savedQuizChapters,
      activeTab, lang]);

  // Quiz 生成触发
  const handleGenerateQuiz = useCallback(() => {
    if (!displayAnalysis || !displayRepoInfo) return;
    quiz.generate(
      displayAnalysis as unknown as Record<string, unknown>,
      { full_name: displayRepoInfo.full_name } as Record<string, unknown>,
      lang,
    );
  }, [displayAnalysis, displayRepoInfo, lang, quiz.generate]);

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

        {/* Tabs — 3 个 */}
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
          <button
            onClick={() => setActiveTab("quiz")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-all relative ${
              activeTab === "quiz"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-primary/70"
            }`}
          >
            🎯 测验
            {quiz.isGenerating && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            )}
            {quiz.chapters.length > 0 && !quiz.isGenerating && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                {quiz.chapters.length}
              </span>
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

              {(displayAnalysis || (isAnalyzing && displayRepoInfo)) && (
                <AnalysisPanel repoInfo={displayRepoInfo} analysis={displayAnalysis} isAnalyzing={isAnalyzing} />
              )}

              {isAnalyzing && !displayAnalysis && !displayRepoInfo && hasSteps && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-32 bg-muted rounded" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Tab: 测验 */}
        {activeTab === "quiz" && (
          <AnimatePresence mode="wait">
            <motion.div
              key="quiz-tab"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* 未分析 → 提示先分析 */}
              {!displayAnalysis && !isAnalyzing && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  请先完成项目分析，再生成测验题
                </div>
              )}

              {/* 分析中 → 提示等待 */}
              {isAnalyzing && !displayAnalysis && (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  分析进行中，完成后即可生成测验...
                </div>
              )}

              {/* 已分析，未出题 → "生成测验"按钮 */}
              {displayAnalysis && quiz.chapters.length === 0 && !quiz.isGenerating && (
                <div className="text-center py-12 space-y-4">
                  <p className="text-muted-foreground text-sm">
                    分析已完成，点击下方按钮生成测验题
                  </p>
                  <button
                    onClick={handleGenerateQuiz}
                    className="px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
                  >
                    🎯 生成测验
                  </button>
                </div>
              )}

              {/* 出题中 → 进度条 */}
              {quiz.isGenerating && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${(quiz.progress.current / quiz.progress.total) * 100}%` }}
                      />
                    </div>
                    <span>{quiz.progress.current}/{quiz.progress.total} 章节</span>
                  </div>
                </div>
              )}

              {/* Quiz 错误 */}
              {quiz.error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                  {quiz.error}
                </div>
              )}

              {/* 已出题（含逐章加载中） → QuizPanel */}
              {quiz.chapters.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <span>🎯</span> 知识问答
                    {quiz.isGenerating && (
                      <span className="text-xs text-muted-foreground font-normal">
                        (生成中 {quiz.progress.current}/{quiz.progress.total})
                      </span>
                    )}
                  </h3>
                  <QuizPanel chapters={quiz.chapters} isGenerating={quiz.isGenerating} />
                </motion.div>
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
