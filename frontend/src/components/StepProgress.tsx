import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/types";

const STEPS = [
  { key: "search", label: "搜索" },
  { key: "retrieve", label: "概览" },
  { key: "select_files", label: "选文件" },
  { key: "fetch_files", label: "深读" },
  { key: "analyze_overview", label: "概述" },
  { key: "analyze_architecture", label: "架构" },
  { key: "analyze_code", label: "代码" },
  { key: "analyze_philosophy", label: "哲学" },
];

interface StepProgressProps {
  steps: Record<string, StepStatus["status"]>;
}

export default function StepProgress({ steps }: StepProgressProps) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      {STEPS.map((s, i) => {
        const status = steps[s.key] || "pending";
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <motion.div
                className={cn(
                  "w-2.5 h-2.5 rounded-full border-2 transition-colors",
                  status === "done" && "bg-emerald-400 border-emerald-400",
                  status === "running" && "bg-violet-500 border-violet-500",
                  status === "pending" && "bg-transparent border-muted-foreground/30"
                )}
                animate={status === "running" ? { scale: [1, 1.4, 1] } : {}}
                transition={{ repeat: Infinity, duration: 1 }}
              />
              <span
                className={cn(
                  "text-[11px] font-medium tracking-tight",
                  status === "done" && "text-emerald-400",
                  status === "running" && "text-violet-400",
                  status === "pending" && "text-muted-foreground/40"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-5 h-px",
                  status === "done" ? "bg-emerald-400/50" : "bg-muted-foreground/15"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
