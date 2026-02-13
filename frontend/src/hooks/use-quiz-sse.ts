import { useState, useCallback, useRef } from "react";
import type { QuizChapter } from "@/types";

interface QuizSSEState {
  chapters: QuizChapter[];
  isGenerating: boolean;
  error: string | null;
  progress: { current: number; total: number };
}

export function useQuizSSE(initialChapters: QuizChapter[] = []) {
  const [chapters, setChapters] = useState<QuizChapter[]>(initialChapters);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 5 });
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (analysis: Record<string, unknown>, repoContext: Record<string, unknown>, lang: string) => {
      // 取消之前的请求
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setChapters([]);
      setIsGenerating(true);
      setError(null);
      setProgress({ current: 0, total: 5 });

      try {
        const resp = await fetch("/api/quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysis, repo_context: repoContext, lang }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Quiz generation failed (${resp.status})`);
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // 解析 SSE 事件：按双换行分割
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;

            let eventType = "";
            let eventData = "";

            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const parsed = JSON.parse(eventData);

              if (eventType === "result" && parsed.type === "quiz_chapter") {
                const chapterData = parsed.data as QuizChapter;
                setChapters((prev) => [...prev, chapterData]);
                setProgress((prev) => ({ ...prev, current: prev.current + 1 }));
              }

              if (eventType === "error") {
                setError(parsed.message || "Quiz generation error");
              }

              if (eventType === "done") {
                setIsGenerating(false);
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setIsGenerating(false);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Quiz generation failed");
        setIsGenerating(false);
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  return { chapters, isGenerating, error, progress, generate, cancel };
}
