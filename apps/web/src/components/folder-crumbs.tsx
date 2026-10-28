import { cn } from "cn";
import { useI18n } from "../i18n/index.tsx";

export type CrumbFolder = { id: string; name: string };

export function FolderCrumbs({
  rootLabel,
  folder,
  breadcrumb,
  onOpen,
  onDrop,
  onFilesDrop,
  className,
}: {
  rootLabel: string;
  folder: string;
  breadcrumb: CrumbFolder[];
  onOpen: (id: string | null) => void;
  onDrop: (payload: string, parentId: string | null) => void;
  onFilesDrop?: (files: File[], parentId: string | null) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <nav className={cn("flex flex-wrap items-center gap-1 text-sm", className)} aria-label={t("Folder")}>
      <Crumb
        label={rootLabel}
        active={folder === "root"}
        onOpen={() => onOpen(null)}
        onDrop={(payload) => onDrop(payload, null)}
        onFilesDrop={onFilesDrop ? (files) => onFilesDrop(files, null) : undefined}
      />
      {breadcrumb.map((item, index) => (
        <span key={item.id} className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">/</span>
          <Crumb
            label={item.name}
            active={index === breadcrumb.length - 1}
            onOpen={() => onOpen(item.id)}
            onDrop={(payload) => onDrop(payload, item.id)}
            onFilesDrop={onFilesDrop ? (files) => onFilesDrop(files, item.id) : undefined}
          />
        </span>
      ))}
    </nav>
  );
}

function Crumb({
  label,
  active,
  onOpen,
  onDrop,
  onFilesDrop,
}: {
  label: string;
  active: boolean;
  onOpen: () => void;
  onDrop: (payload: string) => void;
  onFilesDrop?: (files: File[]) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded px-1.5 py-0.5 data-[drop=true]:bg-accent",
        active ? "font-medium" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onOpen}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes("Files") && !onFilesDrop) return;
        event.preventDefault();
        event.currentTarget.dataset.drop = "true";
      }}
      onDragLeave={(event) => {
        event.currentTarget.dataset.drop = "false";
      }}
      onDrop={(event) => {
        event.currentTarget.dataset.drop = "false";
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length > 0) {
          if (!onFilesDrop) return;
          event.preventDefault();
          event.stopPropagation();
          onFilesDrop(files);
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const payload = event.dataTransfer.getData("text/plain");
        if (payload) onDrop(payload);
      }}
    >
      {label}
    </button>
  );
}
