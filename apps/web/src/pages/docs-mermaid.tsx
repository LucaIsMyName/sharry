import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { systemPrefersDark, useTheme } from "../theme.ts";

export const docsCodeBlockClass =
  "mt-3 max-w-full min-w-0 overflow-x-auto rounded-md border bg-[#171717] p-3 text-base text-[#f1f1f1] md:text-sm";

function subscribeSystemTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useDarkPage(): boolean {
  const choice = useTheme();
  const systemDark = useSyncExternalStore(subscribeSystemTheme, systemPrefersDark, () => false);
  return choice === "dark" || (choice === "system" && systemDark);
}

export function MermaidBlock({ source }: { source: string }) {
  const dark = useDarkPage();
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        } as Parameters<typeof mermaid.initialize>[0]);
        const rendered = await mermaid.render(`mermaid-${reactId}`, source.trim());
        if (!cancelled) setSvg(rendered.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, dark, reactId]);

  if (failed) {
    return (
      <pre className={docsCodeBlockClass}>
        <code>{source}</code>
      </pre>
    );
  }
  if (!svg) {
    return <div className="mt-3 h-24 rounded-md border bg-muted" aria-busy="true" />;
  }
  return (
    <div
      className="mt-3 overflow-x-auto rounded-md border bg-card p-3 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
