import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api.ts";
import { copyText } from "../components/ui/copy.ts";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
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
import { Notice } from "../components/ui/notice.tsx";
import { Input } from "../components/ui/input.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table.tsx";

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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

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
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : "Could not load API keys",
      ),
    );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const key = await api<CreatedKey>("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, userId }),
      });
      setName("");
      setCopied(false);
      setCreated(key);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the API key",
      );
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!revokeId) return;
    setError("");
    try {
      await api(`/api/admin/api-keys/${revokeId}/revoke`, { method: "POST" });
      setRevokeId(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not revoke the API key",
      );
    }
  }

  async function copySecret() {
    if (!created) return;
    try {
      await copyText(created.secret);
      setCopied(true);
    } catch {
      setError("Could not copy the key");
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          API keys
        </h1>
        <p className="text-sm text-muted-foreground">
          A key can do what its user can. Send it as Authorization: Bearer.
          Account sign-in stays on the session cookie.
        </p>
      </div>
      <Card className="form-column">
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void create(event)}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Field label="User">
              <Select
                value={userId}
                options={accounts.map((account) => ({
                  value: account.id,
                  label: `${account.username} (${account.role})`,
                }))}
                onValueChange={setUserId}
                placeholder="Choose a user"
              />
            </Field>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" disabled={!userId || pending}>
              {pending ? "Creating…" : "Create key"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="whitespace-normal">
                    {key.name}
                  </TableCell>
                  <TableCell>{key.username}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {key.tokenPrefix}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {key.revokedAt
                      ? "Revoked"
                      : key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleString()
                        : "Never"}
                  </TableCell>
                  <TableCell>
                    {key.revokedAt ? null : (
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setRevokeId(key.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(created)}
        onOpenChange={(open) => {
          if (!open) setCreated(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              Copy the API key
            </DialogTitle>
            <DialogDescription>
              This is the only time the secret is shown. Store it somewhere safe
              before closing.
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
            {created?.secret}
          </p>
          <DialogFooter className="border-0 bg-transparent sm:justify-start">
            <Button type="button" onClick={() => void copySecret()}>
              {copied ? "Copied" : "Copy key"}
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
