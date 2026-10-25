import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  defaultQrStyle,
  generatePassword,
  validatePrefix,
  type QrStyle,
} from "@sharry/shared";
import { api } from "../api.ts";
import { Button, buttonVariants } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Select } from "../components/ui/choice-select.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { copyText } from "../components/ui/copy.ts";
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
import { choiceNote, redirectOptions } from "../choices.ts";
import { Toggle } from "../components/ui/toggle.tsx";

type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  isActive: boolean;
  mustChangePassword: boolean;
};

type Settings = {
  shortUrlPrefix: string;
  legacyPrefixEnabled: boolean;
  legacyPrefixes: string[];
  defaultRedirectType: "301" | "302" | "307" | "308";
  slugLength: number;
  analyticsRetentionDays: number;
  registrationPolicy: "closed";
  sessionTtlHours: number;
  defaultQrStyle: QrStyle;
  mfaRequired: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  emailFrom: string;
  smtpPasswordSet: boolean;
  smtpSource: "app" | "environment" | "none";
};

type AuditEntry = {
  id: string;
  actorUsername: string | null;
  action: string;
  entityType: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [nextPassword, setNextPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);

  async function load() {
    setUsers((await api<{ users: AdminUser[] }>("/api/admin/users")).users);
  }
  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : "Could not load users",
      ),
    );
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ username: "", email: "", password: "", role: "user" });
      setShowCreatePassword(false);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create the user",
      );
    } finally {
      setPending(false);
    }
  }

  async function update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    setError("");
    try {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the user",
      );
      return false;
    }
  }

  async function savePassword() {
    if (!passwordFor) return;
    const saved = await update(passwordFor.id, { password: nextPassword });
    if (!saved) return;
    setPasswordFor(null);
    setNextPassword("");
  }

  async function remove() {
    if (!deleteFor) return;
    setError("");
    try {
      await api(`/api/admin/users/${deleteFor.id}`, { method: "DELETE" });
      setDeleteFor(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the account",
      );
    }
  }

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-4xl font-medium tracking-tight">
        Users
      </h1>
      <Card className="form-column">
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void create(event)}>
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                required
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                required
              />
            </Field>
            <Field label="Temporary password">
              <Input
                type={showCreatePassword ? "text" : "password"}
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                minLength={12}
                required
                autoComplete="new-password"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm({ ...form, password: generatePassword() });
                  setShowCreatePassword(true);
                }}
              >
                Generate password
              </Button>
              {showCreatePassword && form.password ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void copyText(form.password).catch(() =>
                      setError("Could not copy the password"),
                    )
                  }
                >
                  Copy password
                </Button>
              ) : null}
            </div>
            <Field label="Role">
              <Select
                value={form.role}
                options={[
                  { value: "user", label: "user" },
                  { value: "admin", label: "admin" },
                ]}
                onValueChange={(role) => setForm({ ...form, role })}
              />
            </Field>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="whitespace-normal">
                    {user.username}
                    <div className="text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      options={[
                        { value: "user", label: "user" },
                        { value: "admin", label: "admin" },
                      ]}
                      onValueChange={(role) => void update(user.id, { role })}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {user.isActive ? "Active" : "Disabled"}
                    {user.mustChangePassword ? " · password change" : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => {
                          setPasswordFor(user);
                          setNextPassword("");
                          setCopied(false);
                        }}
                      >
                        Set password
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                          void update(user.id, { isActive: !user.isActive })
                        }
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={() => setDeleteFor(user)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(passwordFor)}
        onOpenChange={(open) => {
          if (!open) setPasswordFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              Set a temporary password
            </DialogTitle>
            <DialogDescription>
              {passwordFor
                ? `${passwordFor.username} must choose a new password at the next sign-in. Current sessions end now.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Field label="Temporary password">
            <Input
              type="text"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              minLength={12}
              autoComplete="off"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNextPassword(generatePassword());
                setCopied(false);
              }}
            >
              Generate password
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!nextPassword}
              onClick={() =>
                void copyText(nextPassword)
                  .then(() => setCopied(true))
                  .catch(() => setError("Could not copy the password"))
              }
            >
              {copied ? "Copied" : "Copy password"}
            </Button>
          </div>
          <DialogFooter className="border-0 bg-transparent sm:justify-start">
            <Button
              type="button"
              disabled={nextPassword.length < 12}
              onClick={() => void savePassword()}
            >
              Save password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteFor)}
        title={
          deleteFor ? `Delete ${deleteFor.username}?` : "Delete this account?"
        }
        description="Their links, campaigns, QR codes, and API keys are removed. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        onOpenChange={(open) => {
          if (!open) setDeleteFor(null);
        }}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void api<Settings>("/api/admin/settings")
      .then(setSettings)
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load settings",
        ),
      );
  }, []);

  async function save(extra: { confirmPrefixChange?: boolean } = {}) {
    if (!settings) return;
    setError("");
    setSaved("");
    const prefixError = validatePrefix(settings.shortUrlPrefix);
    if (prefixError) {
      setError(prefixError);
      return;
    }
    setPending(true);
    try {
      const next = await api<Settings>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          shortUrlPrefix: settings.shortUrlPrefix,
          legacyPrefixEnabled: settings.legacyPrefixEnabled,
          defaultRedirectType: settings.defaultRedirectType,
          slugLength: settings.slugLength,
          analyticsRetentionDays: settings.analyticsRetentionDays,
          registrationPolicy: settings.registrationPolicy,
          sessionTtlHours: settings.sessionTtlHours,
          defaultQrStyle: settings.defaultQrStyle ?? defaultQrStyle,
          mfaRequired: settings.mfaRequired,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpUser: settings.smtpUser,
          emailFrom: settings.emailFrom,
          ...extra,
          ...(smtpPassword ? { smtpPassword } : {}),
        }),
      });
      setSettings(next);
      setSmtpPassword("");
      setConfirm(false);
      setSaved("Settings saved.");
    } catch (caught) {
      const apiError = caught as { code?: string; message?: string };
      if (apiError.code === "confirm_prefix") setConfirm(true);
      else
        setError(
          caught instanceof Error ? caught.message : "Could not save settings",
        );
    } finally {
      setPending(false);
    }
  }

  if (!settings)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="text-sm text-muted-foreground">Loading settings…</p>
    );
  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Mail and two-factor rules are saved here. The public site address,
          short-link origin, session secret, and encryption key stay in the
          server environment.
        </p>
      </div>
      <form
        className="form-column grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">Links</h2>
            <Field label="Public prefix">
              <Input
                value={settings.shortUrlPrefix}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    shortUrlPrefix: event.target.value,
                  })
                }
              />
            </Field>
            <Toggle
              checked={settings.legacyPrefixEnabled}
              onChange={(legacyPrefixEnabled) =>
                setSettings({ ...settings, legacyPrefixEnabled })
              }
              label="Keep previous prefixes working"
            />
            {settings.legacyPrefixes.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Legacy prefixes: {settings.legacyPrefixes.join(", ")}
              </p>
            ) : null}
            <Field label="Default redirect">
              <Select
                value={settings.defaultRedirectType}
                options={[...redirectOptions]}
                onValueChange={(defaultRedirectType) =>
                  setSettings({ ...settings, defaultRedirectType })
                }
              />
              <p className="text-[13px] leading-snug font-normal text-muted-foreground">
                {choiceNote(redirectOptions, settings.defaultRedirectType)}
              </p>
            </Field>
            <Field label="Random slug length">
              <Input
                type="number"
                min={4}
                max={16}
                value={settings.slugLength}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    slugLength: Number(event.target.value),
                  })
                }
              />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">Sessions</h2>
            <Field label="Analytics retention, days">
              <Input
                type="number"
                min={0}
                value={settings.analyticsRetentionDays}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    analyticsRetentionDays: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Session length, hours">
              <Input
                type="number"
                min={1}
                value={settings.sessionTtlHours}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sessionTtlHours: Number(event.target.value),
                  })
                }
              />
            </Field>
            <div className="grid gap-1">
              <h3 className="text-sm font-medium">Registration</h3>
              <p className="text-sm text-muted-foreground">
                Registration is closed. Administrators create every account.
              </p>
            </div>
            <Toggle
              checked={settings.mfaRequired}
              disabled={settings.smtpSource !== "app"}
              onChange={(mfaRequired) =>
                setSettings({ ...settings, mfaRequired })
              }
              label="Require a two-factor code for every account"
            />
            <p className="text-sm text-muted-foreground">
              {settings.smtpSource === "app"
                ? "When this is off, each person can turn a code on from Account. When it is on, sign-in asks for an authenticator until they enroll."
                : "Save a mail server below before requiring a code. Until then, people cannot turn two-factor authentication on."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">Email</h2>
            <Field label="SMTP host">
              <Input
                value={settings.smtpHost}
                onChange={(event) =>
                  setSettings({ ...settings, smtpHost: event.target.value })
                }
                placeholder="smtp.example.com"
              />
            </Field>
            <Field label="SMTP port">
              <Input
                type="number"
                min={1}
                max={65535}
                value={settings.smtpPort}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    smtpPort: Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="SMTP username">
              <Input
                value={settings.smtpUser}
                onChange={(event) =>
                  setSettings({ ...settings, smtpUser: event.target.value })
                }
                autoComplete="off"
              />
            </Field>
            <Field label="SMTP password">
              <Input
                type="password"
                value={smtpPassword}
                onChange={(event) => setSmtpPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={
                  settings.smtpPasswordSet
                    ? "Saved. Leave blank to keep it."
                    : "Optional"
                }
              />
            </Field>
            <Field label="From address">
              <Input
                type="email"
                value={settings.emailFrom}
                onChange={(event) =>
                  setSettings({ ...settings, emailFrom: event.target.value })
                }
                placeholder="sharry@example.com"
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              {smtpStatus(settings)}
            </p>
          </CardContent>
        </Card>
        {saved ? <Notice tone="success">{saved}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          className={buttonVariants({ variant: "outline" })}
          href="/api/admin/export/links.csv"
        >
          Export links
        </a>
        <a
          className={buttonVariants({ variant: "outline" })}
          href="/api/admin/export/clicks.csv"
        >
          Export clicks
        </a>
      </div>
      <ConfirmDialog
        open={confirm}
        title="Change the public prefix?"
        description="Printed QR codes and saved short URLs keep the old path. Turn on legacy compatibility to redirect the previous prefix, or regenerate those codes."
        confirmLabel="Change prefix"
        onOpenChange={setConfirm}
        onConfirm={() => void save({ confirmPrefixChange: true })}
      >
        <Toggle
          checked={settings.legacyPrefixEnabled}
          onChange={(legacyPrefixEnabled) =>
            setSettings({ ...settings, legacyPrefixEnabled })
          }
          label="Redirect the previous prefix"
        />
      </ConfirmDialog>
    </section>
  );
}

function smtpStatus(settings: Settings): string {
  if (settings.smtpSource === "app")
    return "Password reset email uses the mail server saved here.";
  if (settings.smtpSource === "environment")
    return "No mail server is saved here yet. The server environment is still used until you save a host and from address.";
  return "Password reset email stays off until a host and from address are saved.";
}

export function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void api<{ entries: AuditEntry[] }>("/api/admin/audit")
      .then((result) => setEntries(result.entries))
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load the audit log",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-4xl font-medium tracking-tight">
        Audit
      </h1>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card className="min-w-0">
        <CardContent className="min-w-0">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading audit log…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit events yet.
            </p>
          ) : (
            <Table className="min-w-full w-max">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{entry.actorUsername ?? "—"}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.entityType}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
