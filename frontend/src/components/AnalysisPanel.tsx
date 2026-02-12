import { useState, useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import MermaidDiagram from "./MermaidDiagram";
import type { AnalysisResult, RepoInfo } from "@/types";

/* ------------------------------------------------------------------ */
/*  TOC sections                                                       */
/* ------------------------------------------------------------------ */
const SECTIONS = [
  { id: "summary", label: "项目概述", icon: "📋" },
  { id: "architecture", label: "架构总览", icon: "🏗️" },
  { id: "modules", label: "核心模块解析", icon: "🔬" },
  { id: "code", label: "值得一读的代码", icon: "💡" },
  { id: "philosophy", label: "设计哲学", icon: "🧭" },
  { id: "files", label: "文件结构", icon: "📁" },
];

/* ------------------------------------------------------------------ */
/*  Block-level parser: groups consecutive lines into blocks            */
/* ------------------------------------------------------------------ */
interface Block {
  type: "code" | "blockquote" | "heading" | "hr" | "ulist" | "olist" | "paragraph" | "empty";
  lines: string[];
  lang?: string;       // code block language
  level?: number;      // heading level
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const rawLines = content.split("\n");
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      blocks.push({ type: "empty", lines: [] });
      i++;
      continue;
    }

    // Code block (fenced)
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length && !rawLines[i].trim().startsWith("```")) {
        codeLines.push(rawLines[i]);
        i++;
      }
      blocks.push({ type: "code", lines: codeLines, lang });
      i++; // skip closing ```
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "hr", lines: [] });
      i++;
      continue;
    }

    // Blockquote — merge consecutive > lines
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith(">")) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      blocks.push({ type: "heading", lines: [headingMatch[2]], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Unordered list — merge consecutive list items
    if (/^[-*•]\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < rawLines.length && /^[-*•]\s+/.test(rawLines[i].trim())) {
        listLines.push(rawLines[i].trim().replace(/^[-*•]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ulist", lines: listLines });
      continue;
    }

    // Ordered list — merge consecutive numbered items
    if (/^\d+\.\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < rawLines.length && /^\d+\.\s+/.test(rawLines[i].trim())) {
        listLines.push(rawLines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "olist", lines: listLines });
      continue;
    }

    // Paragraph — merge consecutive plain text lines
    const paraLines: string[] = [];
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !rawLines[i].trim().startsWith("```") &&
      !rawLines[i].trim().startsWith(">") &&
      !rawLines[i].trim().startsWith("#") &&
      !/^---+$/.test(rawLines[i].trim()) &&
      !/^[-*•]\s+/.test(rawLines[i].trim()) &&
      !/^\d+\.\s+/.test(rawLines[i].trim())
    ) {
      paraLines.push(rawLines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paraLines });
    }
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Inline formatting: bold, inline code, italic, links                */
/* ------------------------------------------------------------------ */
function formatInline(text: string): React.ReactNode[] {
  // Match: `code`, **bold**, *italic*, [text](url)
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
    .map((seg, k) => {
      if (seg.startsWith("`") && seg.endsWith("`")) {
        return (
          <code key={k} className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-violet-300 text-[13px] font-mono">
            {seg.slice(1, -1)}
          </code>
        );
      }
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return <span key={k} className="font-semibold text-foreground">{seg.slice(2, -2)}</span>;
      }
      if (seg.startsWith("*") && seg.endsWith("*") && !seg.startsWith("**")) {
        return <em key={k} className="italic text-foreground/70">{seg.slice(1, -1)}</em>;
      }
      // Link: [text](url)
      const linkMatch = seg.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a key={k} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
            className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
            {linkMatch[1]}
          </a>
        );
      }
      return <span key={k}>{seg}</span>;
    });
}

/* ------------------------------------------------------------------ */
/*  Block renderer                                                     */
/* ------------------------------------------------------------------ */
function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.type) {
    case "empty":
      return <div key={idx} className="h-2" />;

    case "hr":
      return <hr key={idx} className="my-6 border-border/50" />;

    case "code": {
      const code = block.lines.join("\n").trimEnd();
      return (
        <div key={idx} className="my-5">
          {block.lang && (
            <div className="px-4 py-1.5 text-[11px] font-mono text-muted-foreground bg-zinc-900 border border-border border-b-0 rounded-t-lg">
              {block.lang}
            </div>
          )}
          <pre className={cn(
            "p-4 bg-zinc-950 border border-border text-[13px] font-mono overflow-x-auto leading-relaxed",
            block.lang ? "rounded-b-lg" : "rounded-lg"
          )}>
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    case "blockquote": {
      const text = block.lines.join(" ");
      const isTakeaway = text.startsWith("**Takeaway") || text.startsWith("**要点") || text.startsWith("**关键");
      return (
        <blockquote key={idx} className={cn(
          "my-3 pl-4 py-2 pr-3 border-l-[3px] rounded-r-lg text-sm leading-relaxed",
          isTakeaway
            ? "border-l-emerald-500 bg-emerald-500/5 text-emerald-300/90"
            : "border-l-violet-500 bg-violet-500/5 text-foreground/80"
        )}>
          {formatInline(text)}
        </blockquote>
      );
    }

    case "heading": {
      const text = block.lines[0];
      if (block.level === 2) {
        return (
          <h3 key={idx} className="font-bold text-foreground text-lg mt-8 mb-3 pb-2 border-b border-border/40">
            {formatInline(text)}
          </h3>
        );
      }
      if (block.level === 3) {
        return (
          <h4 key={idx} className="font-semibold text-foreground text-base mt-6 mb-2">
            {formatInline(text)}
          </h4>
        );
      }
      // h4 or deeper
      return (
        <h5 key={idx} className="font-semibold text-foreground text-sm mt-5 mb-2 flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-violet-500" />
          {formatInline(text)}
        </h5>
      );
    }

    case "ulist":
      return (
        <div key={idx} className="space-y-1 my-2">
          {block.lines.map((item, j) => (
            <div key={j} className="flex gap-3 pl-2 py-0.5">
              <span className="text-violet-400 shrink-0 mt-[2px]">•</span>
              <span className="text-foreground/80">{formatInline(item)}</span>
            </div>
          ))}
        </div>
      );

    case "olist":
      return (
        <div key={idx} className="space-y-1 my-2">
          {block.lines.map((item, j) => (
            <div key={j} className="flex gap-3 pl-2 py-0.5">
              <span className="text-violet-400 shrink-0 font-mono text-sm mt-[1px]">{j + 1}.</span>
              <span className="text-foreground/80">{formatInline(item)}</span>
            </div>
          ))}
        </div>
      );

    case "paragraph":
      return (
        <p key={idx} className="text-foreground/80 my-2">
          {formatInline(block.lines.join(" "))}
        </p>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Markdown component                                                 */
/* ------------------------------------------------------------------ */
function Markdown({ content }: { content: string }) {
  if (!content) return <p className="text-muted-foreground text-sm">暂无内容</p>;

  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="prose-blog space-y-1 text-[15px] leading-[1.8] text-foreground/85">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
interface AnalysisPanelProps {
  repoInfo: RepoInfo | null;
  analysis: AnalysisResult | null;
}

export default function AnalysisPanel({ repoInfo, analysis }: AnalysisPanelProps) {
  const [activeSection, setActiveSection] = useState("summary");
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scroll spy
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop + 100;
      let current = "summary";
      for (const s of SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (el && el.offsetTop <= scrollTop) {
          current = s.id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
    }
  };

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
        <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-violet-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <a
              href={repoInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-lg text-primary hover:underline"
            >
              {repoInfo.full_name}
            </a>
            {repoInfo.language && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {repoInfo.language}
              </span>
            )}
            <span className="text-sm text-muted-foreground">⭐ {repoInfo.stars.toLocaleString()}</span>
          </div>
          {repoInfo.description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{repoInfo.description}</p>
          )}
        </div>
      )}

      {/* Body: TOC sidebar + article content */}
      <div className="flex">
        {/* TOC sidebar */}
        <nav className="hidden md:block w-52 shrink-0 border-r border-border/50 p-4 sticky top-0 self-start">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">目录</p>
          <div className="space-y-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[13px] rounded-md transition-all",
                  activeSection === s.id
                    ? "bg-violet-500/10 text-violet-400 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <span className="mr-1.5">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Article content */}
        <div
          ref={contentRef}
          className="flex-1 px-6 md:px-8 py-6 max-h-[80vh] overflow-y-auto scroll-smooth"
        >
          {/* Section: 项目概述 */}
          <section ref={(el) => { sectionRefs.current["summary"] = el; }} className="mb-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>📋</span> 项目概述
            </h2>
            <Markdown content={analysis.summary || ""} />

            {/* Tech stack badges */}
            {analysis.tech_stack && analysis.tech_stack.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">技术栈</h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.tech_stack.map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1.5 text-xs rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Design patterns */}
            {analysis.design_patterns && analysis.design_patterns.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">设计模式</h3>
                <div className="space-y-1">
                  {analysis.design_patterns.map((p, i) => (
                    <div key={i} className="flex gap-3 pl-2 py-0.5">
                      <span className="text-violet-400 shrink-0 mt-[2px]">•</span>
                      <span className="text-foreground/80 text-[15px]">{formatInline(p)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <hr className="border-border/40 my-8" />

          {/* Section: 架构总览 */}
          <section ref={(el) => { sectionRefs.current["architecture"] = el; }} className="mb-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🏗️</span> 架构总览
            </h2>
            {analysis.architecture_mermaid ? (
              <div className="rounded-lg border border-border/60 bg-zinc-950/50 p-4">
                <MermaidDiagram chart={analysis.architecture_mermaid} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">暂无架构图</p>
            )}
          </section>

          <hr className="border-border/40 my-8" />

          {/* Section: 核心模块解析 */}
          <section ref={(el) => { sectionRefs.current["modules"] = el; }} className="mb-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🔬</span> 核心模块解析
            </h2>
            <Markdown content={analysis.core_modules || ""} />
          </section>

          <hr className="border-border/40 my-8" />

          {/* Section: 值得一读的代码 */}
          <section ref={(el) => { sectionRefs.current["code"] = el; }} className="mb-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>💡</span> 值得一读的代码
            </h2>
            <Markdown content={analysis.code_highlights || ""} />
          </section>

          <hr className="border-border/40 my-8" />

          {/* Section: 设计哲学 */}
          <section ref={(el) => { sectionRefs.current["philosophy"] = el; }} className="mb-10">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🧭</span> 设计哲学
            </h2>
            <Markdown content={analysis.design_philosophy || ""} />
          </section>

          <hr className="border-border/40 my-8" />

          {/* Section: 文件结构 */}
          <section ref={(el) => { sectionRefs.current["files"] = el; }} className="mb-6">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>📁</span> 文件结构
            </h2>
            <pre className="p-4 rounded-lg bg-zinc-950 border border-border text-[13px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-mono overflow-auto">
              {analysis.file_tree || "暂无文件结构"}
            </pre>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
