import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { renderPage, type PageContent, type PageSettings } from "@sharry/shared";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import type { MediaRefs } from "./field-editor.tsx";

const inertLinks = "<style>a{pointer-events:none}</style>";

/** The page as visitors will see it, drawn by the same renderer as the server. Scripts never run inside. */
export function PagePreview({
  title,
  settings,
  content,
  media,
}: {
  title: string;
  settings: PageSettings;
  content: PageContent;
  media: MediaRefs;
}) {
  const { t } = useI18n();
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const html = useMemo(() => {
    const page = renderPage(
      { title, settings, content, origin: window.location.origin },
      { media: (id) => (id ? (media[id] ?? null) : null) },
    );
    return page.replace("</head>", `${inertLinks}</head>`);
  }, [title, settings, content, media]);
  const [shown, setShown] = useState(html);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      scroll.current = frame.current?.contentWindow?.scrollY ?? scroll.current;
      setShown(html);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [html]);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("Preview")}</span>
        <div role="radiogroup" aria-label={t("Preview size")} className="inline-flex rounded-md border border-border p-0.5">
          <ViewportButton label={t("Desktop")} active={viewport === "desktop"} onClick={() => setViewport("desktop")}>
            <Monitor className="size-4" />
          </ViewportButton>
          <ViewportButton label={t("Mobile")} active={viewport === "mobile"} onClick={() => setViewport("mobile")}>
            <Smartphone className="size-4" />
          </ViewportButton>
        </div>
      </div>
      <div className="flex min-h-[32rem] justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
        <iframe
          ref={frame}
          title={t("Page preview")}
          sandbox="allow-same-origin"
          srcDoc={shown}
          className={cn("h-full min-h-[32rem] bg-white transition-[width]", viewport === "mobile" ? "w-[390px] border-x border-border" : "w-full")}
          onLoad={() => frame.current?.contentWindow?.scrollTo(0, scroll.current)}
        />
      </div>
    </div>
  );
}

function ViewportButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:text-foreground", active && "bg-muted text-foreground")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
