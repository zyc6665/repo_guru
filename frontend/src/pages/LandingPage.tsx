import { useRef } from "react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { useNavigate } from "react-router-dom";

/* ------------------------------------------------------------------ */
/*  Animated background orbs                                           */
/* ------------------------------------------------------------------ */
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Large purple orb */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
        style={{ background: "radial-gradient(circle, hsl(263 70% 58%), transparent)" }}
        animate={{
          x: [0, 80, -40, 0],
          y: [0, -60, 40, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        initial={{ top: "-10%", left: "10%" }}
      />
      {/* Teal orb */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
        style={{ background: "radial-gradient(circle, hsl(170 70% 50%), transparent)" }}
        animate={{
          x: [0, -60, 50, 0],
          y: [0, 50, -30, 0],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        initial={{ top: "20%", right: "5%" }}
      />
      {/* Pink orb */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full opacity-10 blur-[80px]"
        style={{ background: "radial-gradient(circle, hsl(330 70% 55%), transparent)" }}
        animate={{
          x: [0, 40, -60, 0],
          y: [0, -40, 60, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        initial={{ bottom: "10%", left: "30%" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid background pattern                                            */
/* ------------------------------------------------------------------ */
function GridPattern() {
  return (
    <div
      className="absolute inset-0 opacity-[0.03] pointer-events-none"
      style={{
        backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                          linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter                                                   */
/* ------------------------------------------------------------------ */
function AnimatedNumber({ value, suffix = "" }: { value: string; suffix?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
      className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent"
    >
      {value}{suffix}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper with scroll animation                              */
/* ------------------------------------------------------------------ */
function FadeInSection({ children, className = "", delay = 0 }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature card                                                       */
/* ------------------------------------------------------------------ */
const features = [
  {
    icon: "🔍",
    title: "智能搜索",
    desc: "输入关键词即可模糊搜索 GitHub 海量项目，支持分页浏览，快速定位感兴趣的开源仓库",
  },
  {
    icon: "🧠",
    title: "深度分析",
    desc: "LangGraph 多步 Agent 自动解析代码结构、依赖关系、设计模式，生成教科书级技术报告",
  },
  {
    icon: "📊",
    title: "架构可视化",
    desc: "自动生成 Mermaid 架构图，直观展示模块关系和数据流向，一图胜千言",
  },
  {
    icon: "💡",
    title: "代码精读",
    desc: "AI 精选核心代码片段，逐段讲解实现技巧和设计思想，像有位资深工程师在旁指导",
  },
  {
    icon: "🎯",
    title: "知识问答",
    desc: "分章节生成 15+ 道深度选择题，覆盖架构、实现、设计哲学，检验你的理解程度",
  },
  {
    icon: "🌐",
    title: "中英双语",
    desc: "一键切换中英文分析，无论母语是什么，都能无障碍学习全球优秀开源项目",
  },
];

/* ------------------------------------------------------------------ */
/*  How it works steps                                                 */
/* ------------------------------------------------------------------ */
const steps = [
  { num: "01", title: "搜索或粘贴", desc: "输入关键词搜索项目，或直接粘贴 GitHub 链接" },
  { num: "02", title: "AI 深度分析", desc: "6 步 Agent 流水线：搜索 → 概览 → 选文件 → 深读 → 分析 → 出题" },
  { num: "03", title: "学习与测验", desc: "阅读教科书级分析报告，完成分章节知识问答" },
];

/* ================================================================== */
/*  Landing Page                                                       */
/* ================================================================== */
export default function LandingPage() {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <FloatingOrbs />
      <GridPattern />

      {/* ---- Navbar ---- */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <span className="font-bold text-lg tracking-tight">RepoGuru</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/zyc6665/repo_guru"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <button
              onClick={() => navigate("/app")}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              开始使用
            </button>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative pt-32 pb-20 px-6 flex flex-col items-center text-center"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 px-4 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 text-xs font-medium"
        >
          Powered by LangGraph + DeepSeek
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold leading-tight max-w-4xl"
        >
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            AI 驱动的
          </span>
          <br />
          GitHub 项目分析平台
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed"
        >
          输入任意 GitHub 项目，获得教科书级的架构分析、代码精读和知识测验。
          <br className="hidden sm:block" />
          让每一个开源项目都成为你的学习教材。
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-10 flex gap-4"
        >
          <button
            onClick={() => navigate("/app")}
            className="group relative px-8 py-3 rounded-xl font-medium text-white overflow-hidden transition-all hover:shadow-lg hover:shadow-violet-500/25"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all group-hover:scale-105" />
            <span className="relative flex items-center gap-2">
              立即体验
              <motion.span
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
            </span>
          </button>
          <a
            href="https://github.com/zyc6665/repo_guru"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3 rounded-xl font-medium border border-border hover:bg-accent transition-colors"
          >
            查看源码
          </a>
        </motion.div>

        {/* Hero visual — mock terminal */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          className="mt-16 w-full max-w-3xl"
        >
          <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-2xl shadow-violet-500/5 overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">RepoGuru — Analysis Pipeline</span>
            </div>
            {/* Content */}
            <div className="p-6 font-mono text-sm space-y-2 text-left">
              <TypewriterLine delay={1.0} color="text-violet-400">$ repoguru analyze facebook/react</TypewriterLine>
              <TypewriterLine delay={1.8} color="text-muted-foreground">🔍 Searching repository...</TypewriterLine>
              <TypewriterLine delay={2.4} color="text-muted-foreground">📂 Fetching file tree (depth=2)...</TypewriterLine>
              <TypewriterLine delay={3.0} color="text-muted-foreground">🧠 Selecting 8 key files for deep read...</TypewriterLine>
              <TypewriterLine delay={3.6} color="text-muted-foreground">📊 Generating textbook-level analysis...</TypewriterLine>
              <TypewriterLine delay={4.2} color="text-emerald-400">✅ Analysis complete — 6 modules, 8 patterns, 15 quiz questions</TypewriterLine>
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* ---- Stats ---- */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "6", suffix: " 步", label: "Agent 分析流水线" },
            { value: "15", suffix: "+", label: "深度测验题目" },
            { value: "8", suffix: " 个", label: "核心文件精读" },
            { value: "∞", suffix: "", label: "GitHub 项目支持" },
          ].map((stat, i) => (
            <FadeInSection key={i} delay={i * 0.1}>
              <AnimatedNumber value={stat.value} suffix={stat.suffix} />
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </FadeInSection>
          ))}
        </div>
      </section>

      {/* ---- Features ---- */}
      <section className="relative py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold">
              为什么选择{" "}
              <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                RepoGuru
              </span>
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              不只是看 README，而是真正理解一个项目的架构、实现和设计思想
            </p>
          </FadeInSection>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <FadeInSection key={i} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="group p-6 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5 transition-all"
                >
                  <span className="text-3xl">{f.icon}</span>
                  <h3 className="mt-3 font-semibold text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </motion.div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section className="relative py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <FadeInSection className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold">三步开始学习</h2>
            <p className="mt-3 text-muted-foreground">从搜索到精通，只需要几分钟</p>
          </FadeInSection>

          <div className="space-y-0">
            {steps.map((s, i) => (
              <FadeInSection key={i} delay={i * 0.15}>
                <div className="flex gap-6 items-start py-8 border-b border-border/40 last:border-0">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
                    <span className="text-lg font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                      {s.num}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{s.title}</h3>
                    <p className="mt-1 text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="relative py-24 px-6">
        <FadeInSection className="max-w-3xl mx-auto text-center">
          <div className="p-12 rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-500/5 to-transparent backdrop-blur-sm">
            <h2 className="text-3xl sm:text-4xl font-bold">
              准备好深入理解开源项目了吗？
            </h2>
            <p className="mt-4 text-muted-foreground">
              无需注册，无需付费，输入项目名即可开始
            </p>
            <button
              onClick={() => navigate("/app")}
              className="mt-8 group relative px-10 py-3.5 rounded-xl font-medium text-white overflow-hidden transition-all hover:shadow-lg hover:shadow-violet-500/25"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all group-hover:scale-105" />
              <span className="relative flex items-center gap-2">
                开始分析
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  →
                </motion.span>
              </span>
            </button>
          </div>
        </FadeInSection>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t border-border/50 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>🧠</span>
            <span className="font-medium text-foreground">RepoGuru</span>
            <span>— Powered by LangGraph + DeepSeek</span>
          </div>
          <a
            href="https://github.com/zyc6665/repo_guru"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub →
          </a>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typewriter line component for hero terminal                        */
/* ------------------------------------------------------------------ */
function TypewriterLine({ children, delay, color }: {
  children: React.ReactNode;
  delay: number;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={color}
    >
      {children}
    </motion.div>
  );
}
