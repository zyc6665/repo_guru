import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import MermaidDiagram from "./MermaidDiagram";
import type { AnalysisResult, RepoInfo } from "@/types";

type Tab = "summary" | "architecture" | "modules" | "code" | "philosophy" | "files";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "summary", label: "总结", icon: "📋" },
  { key: "architecture", label: "架构", icon: "🏗️" },
  { key: "modules", label: "技术解构", icon: "🔬" },
  { key: "code", label: "代码学习", icon: "💡" },
  { key: "philosophy", label: "设计思想", icon: "🧭" },
  { key: "files", label: "文件树", icon: "📁" },
];

interface AnalysisPanelProps {
  repoInfo: RepoInfo | null;
  analysis: AnalysisResult | null;
}

/** 简易 Markdown 渲染：支持 code block、行内 code、加粗、列表 */
function Markdown({ content }: { content: string }) {
  if (!content) return <p className="text-muted-foreground text-sm">暂无内容</p>;

  const blocks: { type: "code"; lang: string; code: string }[] | string[] = [];
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          return (
            <pre
              key={i}
              className="p-3 rounded-lg bg-zinc-900 border border-border text-xs font-mono overflow-x-auto"
            >
              <code>{codeMatch[2].trim()}</code>
            </pre>
          );
        }
        // 普通文本：处理加粗、行内code、列表
        return (
          <div key={i} className="whitespace-pre-wrap">
            {part.split("\n").map((line, j) => {
              const trimmed = line.trim();
              if (!trimmed) return <br key={j} />;

              // 列表项
              const listMatch = trimmed.match(/^[-*•]\s+(.*)/);
              const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);

              let inner = listMatch ? listMatch[1] : numMatch ? numMatch[2] : trimmed;

              // 行内格式化
              const formatted = inner.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, k) => {
                if (seg.startsWith("`") && seg.endsWith("`")) {
                  return (
                    <code key={k} className="px-1 py-0.5 rounded bg-zinc-800 text-violet-300 text-xs font-mono">
                      {seg.slice(1, -1)}
                    </code>
                  );
                }
                if (seg.startsWith("**") && seg.endsWith("**")) {
                  return <span key={k} className="font-semibold text-foreground">{seg.slice(2, -2)}</span>;
                }
                return <span key={k}>{seg}</span>;
              });

              if (listMatch || numMatch) {
                return (
                  <div key={j} className="flex gap-2 pl-1">
                    <span className="text-muted-foreground shrink-0">
                      {numMatch ? `${numMatch[1]}.` : "•"}
                    </span>
                    <span>{formatted}</span>
                  </div>
                );
              }

              // 标题行
              if (trimmed.startsWith("###")) {
                return <h4 key={j} className="font-semibold text-foreground mt-2">{trimmed.replace(/^#+\s*/, "")}</h4>;
              }
              if (trimmed.startsWith("##")) {
                return <h3 key={j} className="font-semibold text-foreground text-base mt-3">{trimmed.replace(/^#+\s*/, "")}</h3>;
              }

              return <p key={j}>{formatted}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function AnalysisPanel({ repoInfo, analysis }: AnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>("summary");

  if (!analysis) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      {/* Repo header */}
      {repoInfo && (
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <a
            href={repoInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            {repoInfo.full_name}
          </a>
          {repoInfo.language && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
              {repoInfo.language}
            </span>
          )}
          <span className="text-xs text-muted-foreground">⭐ {repoInfo.stars.toLocaleString()}</span>
        </div>
      )}

      {/* Tabs — 横向滚动适配小屏 */}
      <div className="flex border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-medium transition-colors relative whitespace-nowrap",
              tab === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="mr-1">{t.icon}</span>
            {t.label}
            {tab === t.key && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5 min-h-[300px] max-h-[600px] overflow-y-auto">
        {/* 总结 */}
        {tab === "summary" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground">{analysis.summary}</p>
            {analysis.tech_stack.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  技术栈
                </h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.tech_stack.map((tech) => (
                    <span
                      key={tech}
                      className="px-2.5 py-1 text-xs rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* 设计模式标签 */}
            {analysis.design_patterns?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  设计模式
                </h4>
                <div className="space-y-1.5">
                  {analysis.design_patterns.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-400 shrink-0">▸</span>
                      <span className="text-foreground/80">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 架构图 */}
        {tab === "architecture" && (
          <div>
            {analysis.architecture_mermaid ? (
              <MermaidDiagram chart={analysis.architecture_mermaid} />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">暂无架构图</p>
            )}
          </div>
        )}

        {/* 技术解构 */}
        {tab === "modules" && (
          <Markdown content={analysis.core_modules || ""} />
        )}

        {/* 代码学习 */}
        {tab === "code" && (
          <Markdown content={analysis.code_highlights || ""} />
        )}

        {/* 设计思想 */}
        {tab === "philosophy" && (
          <Markdown content={analysis.design_philosophy || ""} />
        )}

        {/* 文件树 */}
        {tab === "files" && (
          <pre className="text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono overflow-auto">
            {analysis.file_tree || "暂无文件结构"}
          </pre>
        )}
      </div>
    </motion.div>
  );
}
