import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api.ts";
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
import { Field } from "../components/ui/field.tsx";
import { Input } from "../components/ui/input.tsx";
import { Notice } from "../components/ui/notice.tsx";
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
  const [domains, setDomains] = useState<RedirectDomain[]>([]);
  const [serverAddresses, setServerAddresses] = useState<string[]>([]);
  const [hostname, setHostname] = useState("");
  const [setup, setSetup] = useState<RedirectDomain | null>(null);
  const [deleteFor, setDeleteFor] = useState<RedirectDomain | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [verifyingId, setVerifyingId] = useState("");

  async function load() {
    const result = await api<DomainList>("/api/admin/redirect-domains");
    setDomains(result.domains);
    setServerAddresses(result.serverAddresses);
    return result;
  }

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : "Could not load domains",
      ),
    );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
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
      setError(
        caught instanceof Error ? caught.message : "Could not add the domain",
      );
    } finally {
      setPending(false);
    }
  }

  async function verify(domain: RedirectDomain) {
    setError("");
    setVerifyingId(domain.id);
    try {
      await api(`/api/admin/redirect-domains/${domain.id}/verify`, {
        method: "POST",
      });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not verify the domain",
      );
      await load().catch(() => undefined);
    } finally {
      setVerifyingId("");
    }
  }

  async function remove() {
    if (!deleteFor) return;
    setError("");
    try {
      await api(`/api/admin/redirect-domains/${deleteFor.id}`, {
        method: "DELETE",
      });
      setDeleteFor(null);
      if (setup?.id === deleteFor.id) setSetup(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the domain",
      );
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          Domains
        </h1>
        <p className="text-sm text-muted-foreground">
          Add a hostname, publish the DNS records, then verify it. People can
          choose a verified domain when they create a link. The deployment
          domain stays the default.
        </p>
      </div>
      <Card className="form-column">
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
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add domain"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No redirect domains yet.
                  </TableCell>
                </TableRow>
              ) : (
                domains.map((domain) => (
                  <TableRow key={domain.id}>
                    <TableCell className="whitespace-normal">
                      <span className="font-mono text-sm">
                        {domain.hostname}
                      </span>
                      {domain.lastError ? (
                        <p className="text-sm text-destructive">
                          {domain.lastError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {domain.status === "verified" ? "Verified" : "Pending"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {domain.status === "pending" ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSetup(domain)}
                          >
                            Setup
                          </Button>
                        ) : null}
                        {domain.status === "pending" ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={verifyingId === domain.id}
                            onClick={() => void verify(domain)}
                          >
                            {verifyingId === domain.id ? "Checking…" : "Verify"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDeleteFor(domain)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(setup)}
        onOpenChange={(open) => {
          if (!open) setSetup(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {setup ? `Set up ${setup.hostname}` : "Set up domain"}
            </DialogTitle>
            <DialogDescription>
              {setup
                ? `Verify checks the TXT record. Publish both records, then click Verify. After that, open https://${setup.hostname} once so the certificate can be issued.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {setup ? (
            <div className="grid gap-3">
              <CopyRow label="TXT name" value={setup.txtName} />
              <CopyRow label="TXT value" value={setup.txtValue} />
              <div className="grid gap-2">
                <p className="text-sm font-medium">A record</p>
                {serverAddresses.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Add an A record for {setup.hostname} pointing at this
                      server.
                    </p>
                    {serverAddresses.map((address) => (
                      <CopyRow
                        key={address}
                        label="IPv4 address"
                        value={address}
                      />
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The server address could not be looked up.
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
          deleteFor ? `Delete ${deleteFor.hostname}?` : "Delete this domain?"
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
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
