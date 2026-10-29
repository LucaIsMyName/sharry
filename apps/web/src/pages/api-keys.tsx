import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Ban, Check, Copy, Plus } from "lucide-react";
import { api } from "../api.ts";
import { RelativeTime } from "../components/relative-time.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Badge } from "../components/ui/badge.tsx";
import { Button } from "../components/ui/button.tsx";
import { PageHeader } from "../components/page-header.tsx";
import { DataTable } from "../components/ui/data-table.tsx";
import { RowSkeleton } from "../components/ui/skeleton.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.tsx";
import { Field } from "../components/ui/field.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";
import { useI18n } from "../i18n/index.tsx";
import { useSearchParams } from "react-router";
import { focusRowId, rowFocusClass, useFocusRow } from "../components/focus-row.ts";
import { Input } from "../components/ui/input.tsx";

type Account = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
};

type ApiKeyRow = {
  id: string;
  name: string;
  userId: string;
  username: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type CreatedKey = ApiKeyRow & { secret: string };

export function ApiKeysPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const focus = params.get("focus");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useFocusRow(focus, !loading);

  async function load() {
    const [userResult, keyResult] = await Promise.all([
      api<{ users: Account[] }>("/api/admin/users"),
      api<{ keys: ApiKeyRow[] }>("/api/admin/api-keys"),
    ]);
    setAccounts(userResult.users);
    setKeys(keyResult.keys);
    setUserId((current) => {
      if (current && userResult.users.some((account) => account.id === current))
        return current;
      return (
        userResult.users.find((account) => account.role === "admin")?.id ||
        userResult.users[0]?.id ||
        ""
      );
    });
  }

  useEffect(() => {
    void load()
      .catch((caught: unknown) => toastCaught(caught, t("Could not load API keys")))
      .finally(() => setLoading(false));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const key = await api<CreatedKey>("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, userId }),
      });
      setName("");
      setCreating(false);
      setCopied(false);
      setCreated(key);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not create the API key"));
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!revokeId) return;
    try {
      await api(`/api/admin/api-keys/${revokeId}/revoke`, { method: "POST" });
      setRevokeId(null);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not revoke the API key"));
    }
  }

  function closeCreate() {
    setCreating(false);
    setName("");
  }

  async function copySecret() {
    if (!created) return;
    try {
      await copyText(created.secret);
      setCopied(true);
    } catch {
      toast.error(t("Could not copy the key"));
    }
  }

  return (
    <section className="grid gap-4">
      <PageHeader
        title={t("API keys")}
        detail={t(
          "A key can do what its user can. Send it as Authorization: Bearer. Account sign-in stays on the session cookie.",
        )}
        action={
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t("Create API key")}
          </Button>
        }
      />
      {loading ? (
        <RowSkeleton label="Loading API keys…" />
      ) : (
      <DataTable
        storageKey="admin-api-keys"
        columns={[
          {
            id: "name",
            header: "Name",
            sortable: true,
            filter: "text",
            sortValue: (key) => key.name,
            filterValue: (key) => key.name,
            cell: (key) => key.name,
          },
          {
            id: "user",
            header: "User",
            sortable: true,
            filter: "text",
            sortValue: (key) => key.username,
            filterValue: (key) => key.username,
            cell: (key) => key.username,
          },
          {
            id: "prefix",
            header: "Prefix",
            sortable: true,
            filter: "text",
            sortValue: (key) => key.tokenPrefix,
            filterValue: (key) => key.tokenPrefix,
            cell: (key) => <span className="font-mono text-sm md:text-xs">{key.tokenPrefix}</span>,
          },
          {
            id: "lastUsed",
            header: "Last used",
            sortable: true,
            sortValue: (key) => key.revokedAt ?? key.lastUsedAt ?? "",
            cell: (key) =>
              key.revokedAt ? (
                <Badge variant="outline">{t("Revoked")}</Badge>
              ) : key.lastUsedAt ? (
                <RelativeTime value={key.lastUsedAt} />
              ) : (
                t("Never")
              ),
          },
          {
            id: "actions",
            header: "",
            sortable: false,
            cell: (key) =>
              key.revokedAt ? null : (
                <Button variant="outline" size="sm" type="button" onClick={() => setRevokeId(key.id)}>
                  <Ban /> {t("Revoke")}
                </Button>
              ),
          },
        ]}
        rows={keys}
        getRow={(key) => ({
          id: key.id,
          domId: focusRowId(key.id),
          className: rowFocusClass(key.id, focus),
          label: key.name,
        })}
      />
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!open) closeCreate();
        }}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
          <form className="grid gap-4" onSubmit={(event) => void create(event)}>
            <DialogHeader>
              <DialogTitle className="font-heading text-2xl">{t("Create API key")}</DialogTitle>
              <DialogDescription>
                {t("A key can do what its user can. The secret is shown once.")}
              </DialogDescription>
            </DialogHeader>
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
                autoFocus
              />
            </Field>
            <Field label="User">
              <Select
                value={userId}
                options={accounts.map((account) => ({
                  value: account.id,
                  label: t("{username} ({role})", {
                    username: account.username,
                    role: t(account.role === "admin" ? "admin" : "user"),
                  }),
                }))}
                onValueChange={setUserId}
                placeholder="Choose a user"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreate}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={!userId || pending}>
                <Plus /> {pending ? t("Creating…") : t("Create key")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(created)}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {t("Copy the API key")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "This is the only time the secret is shown. Store it somewhere safe before closing.",
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {created?.secret}
          </p>
          <DialogFooter className="border-0 bg-transparent sm:justify-start">
            <Button type="button" onClick={() => void copySecret()}>
              {copied ? (
                <>
                  <Check /> {t("Copied")}
                </>
              ) : (
                <>
                  <Copy /> {t("Copy key")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(revokeId)}
        title="Revoke this API key?"
        description="Programs using this key stop working immediately. This cannot be undone."
        confirmLabel="Revoke key"
        destructive
        onOpenChange={(open) => {
          if (!open) setRevokeId(null);
        }}
        onConfirm={() => void revoke()}
      />
    </section>
  );
}
