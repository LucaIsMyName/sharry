import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "../api.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { Field, FieldMessage } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { toastCaught } from "../components/ui/toast.tsx";
import { useI18n } from "../i18n/index.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.tsx";

type RedirectDomain = {
  id: string;
  hostname: string;
  status: "pending" | "verified";
  txtName: string;
  txtValue: string;
  lastError: string | null;
  verifiedAt: string | null;
};

type DomainList = {
  domains: RedirectDomain[];
  serverAddresses: string[];
};

export function AdminDomainsPage() {
  const { t } = useI18n();
  const [domains, setDomains] = useState<RedirectDomain[]>([]);
  const [serverAddresses, setServerAddresses] = useState<string[]>([]);
  const [hostname, setHostname] = useState("");
  const [setup, setSetup] = useState<RedirectDomain | null>(null);
  const [deleteFor, setDeleteFor] = useState<RedirectDomain | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState("");

  async function load() {
    const result = await api<DomainList>("/api/admin/redirect-domains");
    setDomains(result.domains);
    setServerAddresses(result.serverAddresses);
    return result;
  }

  useEffect(() => {
    void load()
      .catch((caught: unknown) => toastCaught(caught, t("Could not load domains")))
      .finally(() => setLoading(false));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const created = await api<{
        domain: RedirectDomain;
        serverAddresses: string[];
      }>("/api/admin/redirect-domains", {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      setHostname("");
      setServerAddresses(created.serverAddresses);
      setSetup(created.domain);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not add the domain"));
    } finally {
      setPending(false);
    }
  }

  async function verify(domain: RedirectDomain) {
    setVerifyingId(domain.id);
    try {
      await api(`/api/admin/redirect-domains/${domain.id}/verify`, {
        method: "POST",
      });
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not verify the domain"));
      await load().catch(() => undefined);
    } finally {
      setVerifyingId("");
    }
  }

  async function remove() {
    if (!deleteFor) return;
    try {
      await api(`/api/admin/redirect-domains/${deleteFor.id}`, {
        method: "DELETE",
      });
      setDeleteFor(null);
      if (setup?.id === deleteFor.id) setSetup(null);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the domain"));
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          {t("Domains")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Add a hostname, publish the DNS records, then verify it. People can choose a verified domain when they create a link. The deployment domain stays the default.",
          )}
        </p>
      </div>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void create(event)}>
            <Field label="Domain">
              <Input
                value={hostname}
                onChange={(event) => setHostname(event.target.value)}
                placeholder="go.brand.com"
                required
              />
            </Field>
            <Button type="submit" disabled={pending}>
              <Plus /> {pending ? t("Adding…") : t("Add domain")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {loading ? (
        <RowSkeleton label="Loading domains…" />
      ) : domains.length === 0 ? (
        <EmptyState>
          {t("No redirect domains yet. Add one in the form above.")}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Domain")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain.id}>
                <TableCell className="whitespace-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-sm">
                      {domain.hostname}
                    </span>
                    {domain.lastError ? (
                      <FieldMessage
                        tone="error"
                        message={domain.lastError}
                        initialOpen={false}
                      />
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={domain.status === "verified" ? "secondary" : "outline"}
                  >
                    {domain.status === "verified" ? t("Verified") : t("Pending")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-nowrap items-center justify-end gap-1">
                    {domain.status === "pending" ? (
                      <IconAction label={t("Setup")} onClick={() => setSetup(domain)}>
                        <ListChecks />
                      </IconAction>
                    ) : null}
                    {domain.status === "pending" ? (
                      <IconAction
                        label={verifyingId === domain.id ? t("Checking…") : t("Verify")}
                        disabled={verifyingId === domain.id}
                        onClick={() => void verify(domain)}
                      >
                        <BadgeCheck />
                      </IconAction>
                    ) : null}
                    <IconAction label={t("Delete")} onClick={() => setDeleteFor(domain)}>
                      <Trash2 />
                    </IconAction>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog
        open={Boolean(setup)}
        onOpenChange={(open) => {
          if (!open) setSetup(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {setup
                ? t("Set up {hostname}", { hostname: setup.hostname })
                : t("Set up domain")}
            </DialogTitle>
            <DialogDescription>
              {setup
                ? t(
                    "Verify checks the TXT record. Publish both records, then click Verify. After that, open https://{hostname} once so the certificate can be issued.",
                    { hostname: setup.hostname },
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          {setup ? (
            <div className="grid gap-3">
              <CopyRow label={t("TXT name")} value={setup.txtName} />
              <CopyRow label={t("TXT value")} value={setup.txtValue} />
              <div className="grid gap-2">
                <p className="text-sm font-medium">{t("A record")}</p>
                {serverAddresses.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        "Add an A record for {hostname} pointing at this server.",
                        { hostname: setup.hostname },
                      )}
                    </p>
                    {serverAddresses.map((address) => (
                      <CopyRow
                        key={address}
                        label={t("IPv4 address")}
                        value={address}
                      />
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("The server address could not be looked up.")}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteFor)}
        title={
          deleteFor
            ? t("Delete {hostname}?", { hostname: deleteFor.hostname })
            : t("Delete this domain?")
        }
        description="Links that used this domain switch back to the deployment domain. A certificate that was already issued keeps working until it expires."
        confirmLabel="Delete domain"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteFor(null);
        }}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void copyText(value).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? (
            <>
              <Check /> {t("Copied")}
            </>
          ) : (
            <>
              <Copy /> {t("Copy")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
