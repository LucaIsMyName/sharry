import type { ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";

export function ImageUpload({
  id,
  previewUrl,
  fileName,
  accept = "image/png,image/jpeg,image/webp",
  onFile,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  previewUrl?: string | null;
  fileName?: string | null;
  accept?: string;
  onFile: (file: File) => void;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { t } = useI18n();

  function change(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={cn(
        "relative flex w-full items-center gap-3 rounded-md border border-dashed border-input bg-white px-3 py-2.5 text-left has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30",
        className,
      )}
      aria-invalid={ariaInvalid || undefined}
    >
      {previewUrl ? (
        <img
          src={previewUrl}
          alt=""
          className="size-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ImagePlus className="size-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {fileName || t("Choose an image")}
        </span>
        <span className="block text-sm font-normal text-muted-foreground md:text-[13px]">
          {t("PNG, JPEG, or WebP")}
        </span>
      </span>
      <input
        id={id}
        type="file"
        accept={accept}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={change}
      />
    </div>
  );
}
