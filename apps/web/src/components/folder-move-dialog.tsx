import { defaultFolderIcon } from "@sharry/shared";
import { AppIcon } from "./app-icon.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { useI18n } from "../i18n/index.tsx";

export type MoveFolder = {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
};

export function FolderMoveDialog({
  open,
  folders,
  rootLabel,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  folders: MoveFolder[];
  rootLabel: string;
  onOpenChange: (open: boolean) => void;
  onPick: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Move to…")}</DialogTitle>
          <DialogDescription className="sr-only">{t("Choose a folder.")}</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          <FolderMoveList folders={folders} rootLabel={rootLabel} onPick={onPick} />
        </div>
        <DialogFooter className="border-0 bg-transparent sm:justify-start">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FolderMoveList({
  folders,
  rootLabel,
  onPick,
}: {
  folders: MoveFolder[];
  rootLabel: string;
  onPick: (id: string | null) => void;
}) {
  const byParent = new Map<string | null, MoveFolder[]>();
  for (const folder of folders) {
    const key = folder.parentId ?? null;
    byParent.set(key, [...(byParent.get(key) ?? []), folder]);
  }
  const rows: { item: MoveFolder; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const item of byParent.get(parentId) ?? []) {
      rows.push({ item, depth });
      walk(item.id, depth + 1);
    }
  }
  walk(null, 1);
  return (
    <>
      <button type="button" className="flex items-center gap-2 text-left text-sm hover:underline" onClick={() => onPick(null)}>
        <AppIcon name={defaultFolderIcon} />
        {rootLabel}
      </button>
      {rows.map(({ item, depth }) => (
        <button
          key={item.id}
          type="button"
          className="flex items-center gap-2 text-left text-sm hover:underline"
          style={{ paddingInlineStart: depth * 14 }}
          onClick={() => onPick(item.id)}
        >
          <AppIcon name={item.icon ?? defaultFolderIcon} />
          {item.name}
        </button>
      ))}
    </>
  );
}
