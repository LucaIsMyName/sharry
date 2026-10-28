import type { PageStatus } from "../../api.ts";
import { useI18n } from "../../i18n/index.tsx";
import { Badge } from "../ui/badge.tsx";

export const pageStatusLabels: Record<PageStatus, string> = {
  draft: "Draft",
  published: "Published",
  changed: "Unpublished changes",
  hidden: "Hidden",
};

export const pageStatusOptions = (Object.keys(pageStatusLabels) as PageStatus[]).map((value) => ({ value, label: pageStatusLabels[value] }));

export function PageStatusBadge({ status }: { status: PageStatus }) {
  const { t } = useI18n();
  const variant = status === "published" ? "default" : status === "changed" ? "secondary" : "outline";
  return <Badge variant={variant}>{t(pageStatusLabels[status])}</Badge>;
}
