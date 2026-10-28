import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  blockDefinition,
  findBlock,
  insertBlock,
  insertProblem,
  locateBlock,
  removeBlock,
  richTextToPlain,
  type PageBlock,
} from "@sharry/shared";
import { cn } from "cn";
import { useI18n } from "../../i18n/index.tsx";
import { IconAction } from "../icon-action.tsx";
import { Button } from "../ui/button.tsx";
import { toastCaught } from "../ui/toast.tsx";
import { BlockIcon } from "./block-icons.tsx";

/** Where the Add block dialog puts the new block: the end of the page, or the end of a slot. */
export type AddTarget = { parentId: string | null; slot: string | null };

const dragType = "application/x-sharry-block";

export function BlockTree({
  blocks,
  selectedId,
  onSelect,
  onChange,
  onAdd,
  onShift,
  onDuplicate,
  onRemove,
  disabled = false,
}: {
  blocks: PageBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (blocks: PageBlock[]) => void;
  onAdd: (target: AddTarget) => void;
  onShift: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function place(dragId: string, compute: (without: PageBlock[]) => { parentId: string | null; slot: string | null; index: number } | null) {
    const block = findBlock(blocks, dragId);
    if (!block) return;
    const without = removeBlock(blocks, dragId);
    const target = compute(without);
    const problem = target ? insertProblem(without, target, block) : "A block cannot go inside itself";
    if (problem || !target) {
      toastCaught(new Error(t(problem ?? "That place no longer exists")), t("Could not move the block"));
      return;
    }
    onChange(insertBlock(without, target, block));
  }

  function dropBefore(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    place(dragId, (without) => locateBlock(without, targetId));
  }

  function dropInto(dragId: string, parentId: string | null, slot: string | null) {
    place(dragId, (without) => {
      if (parentId === null) return { parentId, slot: null, index: without.length };
      const parent = findBlock(without, parentId);
      if (!parent || !slot) return null;
      return { parentId, slot, index: parent.slots?.[slot]?.length ?? 0 };
    });
  }

  function dropProps(key: string, onDropped: (dragId: string) => void) {
    if (disabled) return {};
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!event.dataTransfer.types.includes(dragType)) return;
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
      onDrop: (event: DragEvent<HTMLElement>) => {
        const dragId = event.dataTransfer.getData(dragType);
        if (!dragId) return;
        event.preventDefault();
        event.stopPropagation();
        setDropTarget(null);
        onDropped(dragId);
      },
    };
  }

  function renderList(list: PageBlock[], depth: number): ReactNode {
    return list.map((block, index) => {
      const definition = blockDefinition(block.type);
      const selected = block.id === selectedId;
      return (
        <li key={block.id} className="grid min-w-0 gap-1">
          <div
            role="treeitem"
            aria-selected={selected}
            aria-level={depth}
            tabIndex={0}
            draggable={!disabled}
            data-testid={`block-${block.id}`}
            className={cn(
              "group flex min-h-10 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 text-sm hover:bg-muted",
              selected && "border-border bg-muted",
              dropTarget === `before:${block.id}` && "border-t-primary",
            )}
            onClick={() => onSelect(block.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(block.id);
              }
            }}
            onDragStart={(event) => {
              event.stopPropagation();
              event.dataTransfer.setData(dragType, block.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setDropTarget(null)}
            {...dropProps(`before:${block.id}`, (dragId) => dropBefore(dragId, block.id))}
          >
            {!disabled ? <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden /> : null}
            {definition ? <BlockIcon name={definition.icon} className="size-4 shrink-0 text-muted-foreground" /> : null}
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{definition ? t(definition.label) : block.type}</span>
              {blockSummary(block) ? <span className="text-muted-foreground"> · {blockSummary(block)}</span> : null}
            </span>
            {!disabled ? (
              <span
                data-row-action
                className={cn("invisible inline-flex shrink-0 gap-1 group-focus-within:visible group-hover:visible", selected && "visible")}
                onClick={(event) => event.stopPropagation()}
              >
                <IconAction label={t("Move up")} disabled={index === 0} onClick={() => onShift(block.id, -1)}>
                  <ArrowUp />
                </IconAction>
                <IconAction label={t("Move down")} disabled={index === list.length - 1} onClick={() => onShift(block.id, 1)}>
                  <ArrowDown />
                </IconAction>
                <IconAction label={t("Duplicate")} onClick={() => onDuplicate(block.id)}>
                  <Copy />
                </IconAction>
                <IconAction label={t("Delete")} onClick={() => onRemove(block.id)}>
                  <Trash2 />
                </IconAction>
              </span>
            ) : null}
          </div>
          {definition?.slots?.length ? (
            <div className="ml-4 grid min-w-0 gap-2 border-l border-border pl-3">
              {definition.slots.map((slot) => {
                const children = block.slots?.[slot.name] ?? [];
                const key = `into:${block.id}:${slot.name}`;
                return (
                  <div key={slot.name} className="grid min-w-0 gap-1">
                    {definition.slots && definition.slots.length > 1 ? (
                      <span className="px-2 text-xs font-medium text-muted-foreground uppercase">{t(slot.label)}</span>
                    ) : null}
                    {children.length > 0 ? (
                      <ul role="group" className="grid min-w-0 gap-1">
                        {renderList(children, depth + 1)}
                      </ul>
                    ) : null}
                    <SlotButton
                      active={dropTarget === key}
                      disabled={disabled}
                      label={children.length === 0 ? t("Add a block here") : t("Add block")}
                      onClick={() => onAdd({ parentId: block.id, slot: slot.name })}
                      dropProps={dropProps(key, (dragId) => dropInto(dragId, block.id, slot.name))}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </li>
      );
    });
  }

  return (
    <div className="grid min-w-0 gap-2">
      {blocks.length > 0 ? (
        <ul role="tree" aria-label={t("Blocks")} className="grid min-w-0 gap-1">
          {renderList(blocks, 1)}
        </ul>
      ) : (
        <p className="px-2 text-sm text-muted-foreground">{t("This page is empty. Add a first block.")}</p>
      )}
      <SlotButton
        active={dropTarget === "into:page"}
        disabled={disabled}
        label={t("Add block")}
        onClick={() => onAdd({ parentId: null, slot: null })}
        dropProps={dropProps("into:page", (dragId) => dropInto(dragId, null, null))}
      />
    </div>
  );
}

function SlotButton({
  label,
  active,
  disabled,
  onClick,
  dropProps,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  dropProps: Record<string, unknown>;
}) {
  return (
    <div {...dropProps}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        className={cn("w-full justify-start border border-dashed border-border text-muted-foreground", active && "border-primary bg-primary/5")}
        onClick={onClick}
      >
        <Plus /> {label}
      </Button>
    </div>
  );
}

/** A short hint from the first filled text field, so similar blocks can be told apart. */
export function blockSummary(block: PageBlock): string {
  const definition = blockDefinition(block.type);
  if (!definition) return "";
  for (const [name, spec] of Object.entries(definition.fields)) {
    const value = block.props[name];
    if (typeof value !== "string" || !value.trim()) continue;
    if (spec.kind === "text") return clip(value);
    if (spec.kind === "richtext") return clip(richTextToPlain(value));
  }
  return "";
}

function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
}
