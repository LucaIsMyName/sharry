import { pageBlocks, type BlockGroup } from "@sharry/shared";
import { useI18n } from "../../i18n/index.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog.tsx";
import { BlockIcon } from "./block-icons.tsx";

const groups: BlockGroup[] = ["Layout", "Content", "Media"];

/** Lists every registered block by group. A new block shows up here once it is in the registry. */
export function AddBlockDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">{t("Add block")}</DialogTitle>
          <DialogDescription>{t("Choose what to add. You can change its content and style afterwards.")}</DialogDescription>
        </DialogHeader>
        {groups.map((group) => {
          const blocks = pageBlocks.filter((definition) => definition.group === group);
          if (blocks.length === 0) return null;
          return (
            <section key={group} className="grid gap-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase">{t(group)}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {blocks.map((definition) => (
                  <button
                    key={definition.type}
                    type="button"
                    className="flex items-start gap-3 rounded-md border border-border p-3 text-left hover:bg-muted"
                    onClick={() => onPick(definition.type)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <BlockIcon name={definition.icon} />
                    </span>
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{t(definition.label)}</span>
                      <span className="text-xs text-muted-foreground">{t(definition.description)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}
