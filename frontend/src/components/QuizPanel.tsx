import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/types";

interface QuizPanelProps {
  questions: QuizQuestion[];
}

export default function QuizPanel({ questions }: QuizPanelProps) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  if (!questions.length) {
    return <p className="text-muted-foreground text-sm text-center py-8">暂无问答题</p>;
  }

  const q = questions[current];

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
  };

  const handleNext = () => {
    setSelected(null);
    setRevealed(false);
    setCurrent((prev) => Math.min(prev + 1, questions.length - 1));
  };

  const handlePrev = () => {
    setSelected(null);
    setRevealed(false);
    setCurrent((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          第 {current + 1} / {questions.length} 题
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-3"
        >
          <p className="font-medium text-foreground">{q.question}</p>

          <div className="space-y-2">
            {q.options.map((opt, idx) => {
              const isCorrect = idx === q.answer;
              const isSelected = idx === selected;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className={cn(
                    "w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors",
                    !revealed && "border-border hover:border-primary/50 hover:bg-accent cursor-pointer",
                    revealed && isCorrect && "border-emerald-500 bg-emerald-500/10 text-emerald-400",
                    revealed && isSelected && !isCorrect && "border-red-500 bg-red-500/10 text-red-400",
                    revealed && !isSelected && !isCorrect && "border-border opacity-50"
                  )}
                  disabled={revealed}
                >
                  <span className="font-medium mr-2">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {revealed && q.explanation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-lg bg-accent/50 text-sm text-muted-foreground"
            >
              💡 {q.explanation}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between pt-2">
        <button
          onClick={handlePrev}
          disabled={current === 0}
          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          上一题
        </button>
        <button
          onClick={handleNext}
          disabled={current === questions.length - 1}
          className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          下一题
        </button>
      </div>
    </div>
  );
}
