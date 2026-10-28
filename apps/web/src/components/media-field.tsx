import { useState, type DragEvent } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { cn } from "cn";
import type { MediaItem } from "../api.ts";
import { useI18n } from "../i18n/index.tsx";
import { MediaPicker } from "./media-picker.tsx";
import { draggedFiles, uploadMediaFile } from "./media-uploads.ts";
import { Button } from "./ui/button.tsx";
import { toastCaught } from "./ui/toast.tsx";

export type MediaFieldValue = { id: string; url: string; name: string };

/** A library-backed file field: pick an existing file, or drop a new one to upload and use it. */
export function MediaField({
  value,
  onChange,
  accept,
  acceptLabel,
  disabled = false,
  removeLabel,
}: {
  value: MediaFieldValue | null;
  onChange: (media: MediaItem | null) => void;
  accept: readonly string[];
  acceptLabel: string;
  disabled?: boolean;
  removeLabel: string;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function drop(event: DragEvent<HTMLElement>) {
    if (disabled || !draggedFiles(event)) return;
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!accept.includes(file.type)) {
      toastCaught(new Error(t("Use one of these file types: {types}", { types: acceptLabel })), t("Could not upload the file"));
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadMediaFile(file, null, () => undefined).promise);
    } catch (caught) {
      toastCaught(caught, t("Could not upload the file"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div
        className={cn(
          "flex w-full items-center gap-3 rounded-md border border-dashed border-input bg-white px-3 py-2.5 dark:bg-input/30",
          dropActive && "border-primary bg-primary/5",
        )}
        data-testid="media-field"
        onDragOver={(event) => {
          if (disabled || !draggedFiles(event)) return;
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => void drop(event)}
      >
        {value ? (
          <img src={value.url} alt="" className="size-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {uploading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{value?.name ?? t("No image chosen")}</span>
          <span className="block text-sm font-normal text-muted-foreground md:text-[13px]">
            {t("Drop a file here or choose one from the media library. {types}", { types: acceptLabel })}
          </span>
        </span>
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => setPickerOpen(true)}>
          {t("Choose from library")}
        </Button>
      </div>
      {value && !disabled ? (
        <Button variant="outline" type="button" className="justify-self-start" onClick={() => onChange(null)}>
          <Trash2 /> {removeLabel}
        </Button>
      ) : null}
      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} accept={accept} acceptLabel={acceptLabel} onPick={onChange} />
    </div>
  );
}
