import { FileText, Film, ImageIcon } from "lucide-react";
import { cn } from "cn";
import type { MediaItem } from "../api.ts";

export function MediaThumb({ media, className }: { media: Pick<MediaItem, "kind" | "thumbnailUrl">; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {media.thumbnailUrl ? (
        <img src={media.thumbnailUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : media.kind === "video" ? (
        <Film className="size-4" />
      ) : media.kind === "document" ? (
        <FileText className="size-4" />
      ) : (
        <ImageIcon className="size-4" />
      )}
    </span>
  );
}

export function mediaTypeLabel(media: Pick<MediaItem, "mime">): string {
  const subtype = media.mime.split("/")[1] ?? media.mime;
  return subtype.replace("svg+xml", "svg").replace("jpeg", "jpg").toUpperCase();
}
