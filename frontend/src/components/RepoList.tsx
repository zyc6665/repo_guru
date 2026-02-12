import { motion } from "framer-motion";
import type { RepoInfo } from "@/types";

interface RepoListProps {
  repos: RepoInfo[];
  onSelect: (repo: RepoInfo) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  totalCount: number;
}

export default function RepoList({ repos, onSelect, hasMore, loadingMore, onLoadMore, totalCount }: RepoListProps) {
  if (!repos.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground px-1">
        共 {totalCount.toLocaleString()} 个相关项目，点击开始深度分析：
      </h3>
      <div className="grid gap-2">
        {repos.map((repo, i) => (
          <motion.button
            key={repo.full_name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (i % 12) * 0.03 }}
            onClick={() => onSelect(repo)}
            className="w-full text-left p-4 rounded-lg border border-border bg-card hover:border-violet-500/40 hover:bg-violet-500/5 transition-all group"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-primary group-hover:underline truncate">
                    {repo.full_name}
                  </span>
                  {repo.language && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">
                      {repo.language}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  {repo.description || "暂无描述"}
                </p>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">
                ⭐ {repo.stars.toLocaleString()}
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-5 py-2 text-sm rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loadingMore ? "加载中..." : "加载更多"}
          </button>
        </div>
      )}
    </div>
  );
}
