import { useState } from "react";
import { Link } from "react-router";
import type { ChatBlock, ChatFormLink } from "@sharry/shared";
import { ClickChart } from "./analytics.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Checkbox } from "../components/ui/checkbox.tsx";
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.tsx";
import { useI18n } from "../i18n/index.tsx";

export function ChatBlocks({
  blocks,
  submitting,
  onSubmit,
}: {
  blocks: ChatBlock[];
  submitting: string | null;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const path = blocks.find((block) => block.type === "chart" || block.type === "table")?.path;
  return (
    <div className="grid w-full max-w-[40rem] gap-3">
      {blocks.map((block, index) => {
        if (block.type === "form") {
          return (
            <FormCard key={block.id} block={block} submitting={submitting === block.id} onSubmit={onSubmit} />
          );
        }
        if (block.type === "chart") {
          return (
            <Card key={`chart-${index}`}>
              <CardContent className="grid gap-2">
                <h2 className="font-medium">{t(block.title)}</h2>
                <ClickChart series={block.series} />
              </CardContent>
            </Card>
          );
        }
        return (
          <Card key={`table-${index}`}>
            <CardContent className="grid gap-2">
              <h2 className="font-medium">{t(block.title)}</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    {block.columns.map((column) => (
                      <TableHead key={column}>{t(column)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {block.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
      {path ? (
        <Link className="text-sm underline" to={path}>
          {t("Open analytics")}
        </Link>
      ) : null}
    </div>
  );
}

function FormCard({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  if (block.form === "link") return <LinkForm block={block} submitting={submitting} onSubmit={onSubmit} />;
  if (block.form === "analytics") return <AnalyticsForm block={block} submitting={submitting} onSubmit={onSubmit} />;
  return <CampaignForm block={block} submitting={submitting} onSubmit={onSubmit} />;
}

function LinkForm({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const prefill = block.prefill ?? {};
  const [destinationUrl, setDestinationUrl] = useState(typeof prefill.destinationUrl === "string" ? prefill.destinationUrl : "");
  const [slug, setSlug] = useState(typeof prefill.slug === "string" ? prefill.slug : "");
  const [createQr, setCreateQr] = useState(false);
  const done = block.status === "submitted";
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="font-medium">{t("Short link")}</h2>
        {done ? (
          <FormResult block={block} />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, { destinationUrl, slug, createQr });
            }}
          >
            <Field label="Destination">
              <Input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
            </Field>
            <Field label="Custom slug">
              <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
            </Field>
            <p className="text-sm text-muted-foreground">{t("The slug can be skipped.")}</p>
            <Label className="w-fit font-normal">
              <Checkbox
                checked={createQr}
                onCheckedChange={(checked) => setCreateQr(checked === true)}
              />
              <span>{t("Create a QR code")}</span>
            </Label>
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            <Button type="submit" disabled={submitting || !destinationUrl.trim()}>
              {submitting ? t("Creating…") : t("Create link")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsForm({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [scope, setScope] = useState<"all" | "link">(block.result?.scope === "link" ? "link" : "all");
  const [linkId, setLinkId] = useState(block.result?.linkId ?? "");
  const done = block.status === "submitted";
  const chosen = block.links?.find((link) => link.id === block.result?.linkId);
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="font-medium">{t("Analytics report")}</h2>
        {done ? (
          <p className="text-sm">{scope === "all" ? t("All links") : linkLabel(chosen)}</p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, { scope, linkId: scope === "link" ? linkId : undefined });
            }}
          >
            <div className="grid gap-2">
              <Label className="w-fit font-normal">
                <input
                  type="radio"
                  name={`scope-${block.id}`}
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                <span>{t("All links")}</span>
              </Label>
              <Label className="w-fit font-normal">
                <input
                  type="radio"
                  name={`scope-${block.id}`}
                  checked={scope === "link"}
                  onChange={() => setScope("link")}
                />
                <span>{t("One link")}</span>
              </Label>
            </div>
            {scope === "link" ? (
              <Field label="Link">
                <select
                  className="h-10 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                  value={linkId}
                  onChange={(event) => setLinkId(event.target.value)}
                  required
                >
                  <option value="">{t("Choose a link")}</option>
                  {(block.links ?? []).map((link) => (
                    <option key={link.id} value={link.id}>
                      {linkLabel(link)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            <Button type="submit" disabled={submitting || (scope === "link" && !linkId)}>
              {submitting ? t("Loading…") : t("Show report")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignForm({
  block,
  submitting,
  onSubmit,
}: {
  block: Extract<ChatBlock, { type: "form" }>;
  submitting: boolean;
  onSubmit: (formId: string, body: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const prefill = block.prefill ?? {};
  const [name, setName] = useState(typeof prefill.name === "string" ? prefill.name : "");
  const [linkId, setLinkId] = useState("");
  const [variantName, setVariantName] = useState("");
  const done = block.status === "submitted";
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="font-medium">{t("Campaign")}</h2>
        {done ? (
          <FormResult block={block} />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(block.id, {
                name,
                linkId: linkId || undefined,
                variantName: variantName.trim() || undefined,
              });
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label="Link">
              <select
                className="h-10 w-full rounded-md border border-input bg-transparent px-2.5 text-sm"
                value={linkId}
                onChange={(event) => setLinkId(event.target.value)}
              >
                <option value="">{t("No link")}</option>
                {(block.links ?? []).map((link) => (
                  <option key={link.id} value={link.id}>
                    {linkLabel(link)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Variant name">
              <Input value={variantName} onChange={(event) => setVariantName(event.target.value)} />
            </Field>
            <p className="text-sm text-muted-foreground">{t("The variant can be skipped.")}</p>
            {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
            {block.result?.variants?.map((variant) => (
              <p key={variant.name} className="text-sm text-muted-foreground">
                {variant.error ? `${variant.name}: ${t(variant.error)}` : variant.name}
              </p>
            ))}
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? t("Creating…") : t("Create campaign")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function FormResult({ block }: { block: Extract<ChatBlock, { type: "form" }> }) {
  const { t } = useI18n();
  const openLabel = block.form === "campaign" ? "Open campaign" : "Open link";
  return (
    <div className="grid gap-2">
      {block.result?.name ? <p className="text-sm">{block.result.name}</p> : null}
      {block.result?.shortUrl ? <p className="text-sm break-all">{block.result.shortUrl}</p> : null}
      {block.result?.qrCreated ? <p className="text-sm text-muted-foreground">{t("QR code saved")}</p> : null}
      {block.result?.error ? <p className="text-sm text-destructive">{t(block.result.error)}</p> : null}
      {block.result?.path ? (
        <Link className="text-sm underline" to={block.result.path}>
          {t(openLabel)}
        </Link>
      ) : null}
      {block.result?.variants?.map((variant) => (
        <p key={variant.name} className="text-sm text-muted-foreground">
          {variant.error ? `${variant.name}: ${t(variant.error)}` : variant.name}
        </p>
      ))}
    </div>
  );
}

function linkLabel(link: ChatFormLink | undefined): string {
  if (!link) return "";
  return link.title ? `${link.title} (${link.slug})` : link.slug;
}
