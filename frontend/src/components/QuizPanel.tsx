import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { QuizChapter } from "@/types";

interface QuizPanelProps {
  chapters: QuizChapter[];
}

export default function QuizPanel({ chapters }: QuizPanelProps) {
  const [chapterIdx, setChapterIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 记录每题作答情况: key = "chapterIdx-questionIdx", value = 是否答对
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  if (!chapters.length) {
    return <p className="text-muted-foreground text-sm text-center py-8">暂无问答题</p>;
  }

  const chapter = chapters[chapterIdx];
  const q = chapter.questions[questionIdx];
  const totalQuestions = chapters.reduce((sum, ch) => sum + ch.questions.length, 0);
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter(Boolean).length;

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    setAnswers((prev) => ({
      ...prev,
      [`${chapterIdx}-${questionIdx}`]: idx === q.answer,
    }));
  };

  const goTo = (ci: number, qi: number) => {
    setChapterIdx(ci);
    setQuestionIdx(qi);
    const key = `${ci}-${qi}`;
    if (answers[key] !== undefined) {
      setRevealed(true);
      setSelected(null); // 已答过，只显示正确答案
    } else {
      setSelected(null);
      setRevealed(false);
    }
  };

  const handleNext = () => {
    if (questionIdx < chapter.questions.length - 1) {
      goTo(chapterIdx, questionIdx + 1);
    } else if (chapterIdx < chapters.length - 1) {
      goTo(chapterIdx + 1, 0);
    }
  };

  const handlePrev = () => {
    if (questionIdx > 0) {
      goTo(chapterIdx, questionIdx - 1);
    } else if (chapterIdx > 0) {
      const prevChapter = chapters[chapterIdx - 1];
      goTo(chapterIdx - 1, prevChapter.questions.length - 1);
    }
  };

  const isFirst = chapterIdx === 0 && questionIdx === 0;
  const isLast = chapterIdx === chapters.length - 1 && questionIdx === chapter.questions.length - 1;

  return (
    <div className="space-y-4">
      {/* 章节导航 */}
      <div className="flex flex-wrap gap-1.5">
        {chapters.map((ch, ci) => {
          const chapterAnswered = ch.questions.filter((_, qi) => answers[`${ci}-${qi}`] !== undefined).length;
          const chapterCorrect = ch.questions.filter((_, qi) => answers[`${ci}-${qi}`] === true).length;
          const isActive = ci === chapterIdx;
          return (
            <button
              key={ci}
              onClick={() => goTo(ci, 0)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-lg border transition-all",
                isActive
                  ? "border-violet-500 bg-violet-500/10 text-violet-400"
                  : "border-border text-muted-foreground hover:border-violet-500/40"
              )}
            >
              {ch.title}
              {chapterAnswered > 0 && (
                <span className="ml-1 opacity-70">
                  {chapterCorrect}/{chapterAnswered}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
          />
        </div>
        <span>{answeredCount}/{totalQuestions} 已答</span>
        {answeredCount > 0 && (
          <span className="text-emerald-400">{correctCount} 正确</span>
        )}
      </div>

      {/* 题目区域 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${chapterIdx}-${questionIdx}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.15 }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded bg-accent">{chapter.title}</span>
            <span>第 {questionIdx + 1}/{chapter.questions.length} 题</span>
          </div>

          <p className="font-medium text-foreground leading-relaxed">{q.question}</p>

          <div className="space-y-2">
            {q.options.map((opt, idx) => {
              const isCorrect = idx === q.answer;
              const isSelected = idx === selected;
              const wasAnswered = answers[`${chapterIdx}-${questionIdx}`] !== undefined;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors",
                    !revealed && !wasAnswered && "border-border hover:border-primary/50 hover:bg-accent cursor-pointer",
                    (revealed || wasAnswered) && isCorrect && "border-emerald-500 bg-emerald-500/10 text-emerald-400",
                    revealed && isSelected && !isCorrect && "border-red-500 bg-red-500/10 text-red-400",
                    (revealed || wasAnswered) && !isSelected && !isCorrect && "border-border opacity-50"
                  )}
                  disabled={revealed || wasAnswered}
                >
                  <span className="font-medium mr-2">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {(revealed || answers[`${chapterIdx}-${questionIdx}`] !== undefined) && q.explanation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-accent/50 text-sm text-muted-foreground leading-relaxed"
            >
              💡 {q.explanation}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* 导航按钮 */}
      <div className="flex justify-between pt-2">
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          上一题
        </button>
        <button
          onClick={handleNext}
          disabled={isLast}
          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          下一题
        </button>
      </div>
    </div>
  );
}
