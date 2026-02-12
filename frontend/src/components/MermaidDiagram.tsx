import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    primaryColor: "#7c3aed",
    primaryTextColor: "#f4f4f5",
    primaryBorderColor: "#7c3aed",
    lineColor: "#a78bfa",
    secondaryColor: "#27272a",
    tertiaryColor: "#18181b",
  },
});

/** 剥离 LLM 常见的 markdown 围栏包裹 */
function cleanChart(raw: string): string {
  let s = raw.trim();
  // ```mermaid\n...\n``` 或 ```\n...\n```
  s = s.replace(/^```(?:mermaid)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  return s.trim();
}

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    const cleaned = cleanChart(chart);
    if (!cleaned || !containerRef.current) return;

    const id = `mermaid-${Date.now()}-${renderKey}`;

    const render = async () => {
      try {
        containerRef.current!.innerHTML = "";
        const { svg } = await mermaid.render(id, cleaned);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch {
        // 渲染失败时展示原始代码
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-xs text-muted-foreground whitespace-pre-wrap">${cleaned}</pre>`;
        }
      }
    };

    render();
    setRenderKey((k) => k + 1);
  }, [chart]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center min-h-[200px] overflow-auto [&_svg]:max-w-full"
    />
  );
}
