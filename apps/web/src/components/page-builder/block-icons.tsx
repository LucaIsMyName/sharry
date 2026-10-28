import {
  Columns2,
  Heading,
  Image,
  ListCollapse,
  Minus,
  MousePointerClick,
  MoveVertical,
  Quote,
  Square,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { BlockIconName } from "@sharry/shared";

/** A block that names an icon missing here fails the type check. */
export const blockIcons: Record<BlockIconName, LucideIcon> = {
  Square,
  Columns2,
  Heading,
  Type,
  MousePointerClick,
  Image,
  Video,
  ListCollapse,
  Quote,
  MoveVertical,
  Minus,
};

export function BlockIcon({ name, className }: { name: BlockIconName; className?: string }) {
  const Icon = blockIcons[name] ?? Square;
  return <Icon className={className ?? "size-4"} aria-hidden />;
}
