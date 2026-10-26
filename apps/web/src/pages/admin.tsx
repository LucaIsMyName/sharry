import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Plus,
  Save,
  Shuffle,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  defaultQrStyle,
  generatePassword,
  validatePrefix,
  type AiProvider,
  type QrStyle,
} from "@sharry/shared";
import { AiSettingsCard } from "./ai-settings-card.tsx";
import { api } from "../api.ts";
import { auditActionSentence } from "../audit-actions.ts";
import { EmptyState } from "../components/empty-state.tsx";
import { DetailSkeleton, RowSkeleton } from "../components/ui/skeleton.tsx";
import { IconAction } from "../components/icon-action.tsx";
import { RelativeTime } from "../components/relative-time.tsx";
import { Badge } from "../components/ui/badge.tsx";
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
import { toast, toastCaught } from "../components/ui/toast.tsx";
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
import { t, useI18n } from "../i18n/index.tsx";
import { Toggle } from "../components/ui/toggle.tsx";
import { useSearchParams } from "react-router";
import { focusRowId, rowFocusClass, useFocusRow } from "../components/focus-row.ts";

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
  linkSharing: boolean;
  linkSharingAccess: "view" | "edit";
  linkSharingShowAdmin: boolean;
  linkSharingEditAdmin: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  emailFrom: string;
  smtpPasswordSet: boolean;
  smtpSource: "app" | "environment" | "none";
  aiProvider: "" | AiProvider;
  aiModel: string;
  aiBaseUrl: string;
  aiApiKeySet: boolean;
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
  const { t } = useI18n();
  const [params] = useSearchParams();
  const focus = params.get("focus");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
  });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);
  const [nextPassword, setNextPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  useFocusRow(focus, !loading);

  async function load() {
    setUsers((await api<{ users: AdminUser[] }>("/api/admin/users")).users);
  }
  useEffect(() => {
    void load()
      .catch((caught: unknown) => toastCaught(caught, t("Could not load users")))
      .finally(() => setLoading(false));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
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
      toastCaught(caught, t("Could not create the user"));
    } finally {
      setPending(false);
    }
  }

  async function update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await api(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
      return true;
    } catch (caught) {
      toastCaught(caught, t("Could not update the user"));
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
    try {
      await api(`/api/admin/users/${deleteFor.id}`, { method: "DELETE" });
      setDeleteFor(null);
      await load();
    } catch (caught) {
      toastCaught(caught, t("Could not delete the account"));
    }
  }

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-medium tracking-tight">
        {t("Users")}
      </h1>
      <Card>
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
                <Shuffle /> {t("Generate password")}
              </Button>
              {showCreatePassword && form.password ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void copyText(form.password).catch(() =>
                      toast.error(t("Could not copy the password")),
                    )
                  }
                >
                  <Copy /> {t("Copy password")}
                </Button>
              ) : null}
            </div>
            <Field label="Role">
              <Select
                value={form.role}
                options={[
                  { value: "user", label: t("user") },
                  { value: "admin", label: t("admin") },
                ]}
                onValueChange={(role) => setForm({ ...form, role })}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              <Plus /> {pending ? t("Creating…") : t("Create account")}
            </Button>
          </form>
        </CardContent>
      </Card>
      {loading ? (
        <RowSkeleton label="Loading users…" />
      ) : (
      <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("User")}</TableHead>
                <TableHead>{t("Role")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  id={focusRowId(user.id)}
                  className={rowFocusClass(user.id, focus)}
                >
                  <TableCell>
                    {user.username}
                    <div className="text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      options={[
                        { value: "user", label: t("user") },
                        { value: "admin", label: t("admin") },
                      ]}
                      onValueChange={(role) => void update(user.id, { role })}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <Badge variant={user.isActive ? "secondary" : "outline"}>
                        {user.isActive ? t("Active") : t("Disabled")}
                      </Badge>
                      {user.mustChangePassword ? (
                        <span className="text-sm text-muted-foreground">
                          {t(" · password change")}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-nowrap items-center justify-end gap-1">
                      <IconAction
                        label={t("Set password")}
                        onClick={() => {
                          setPasswordFor(user);
                          setNextPassword("");
                          setCopied(false);
                        }}
                      >
                        <KeyRound />
                      </IconAction>
                      <IconAction
                        label={user.isActive ? t("Deactivate") : t("Activate")}
                        onClick={() =>
                          void update(user.id, { isActive: !user.isActive })
                        }
                      >
                        {user.isActive ? <UserX /> : <UserCheck />}
                      </IconAction>
                      <IconAction
                        label={t("Delete")}
                        onClick={() => setDeleteFor(user)}
                      >
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
        open={Boolean(passwordFor)}
        onOpenChange={(open) => {
          if (!open) setPasswordFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {t("Set a temporary password")}
            </DialogTitle>
            <DialogDescription>
              {passwordFor
                ? t(
                    "{username} must choose a new password at the next sign-in. Current sessions end now.",
                    { username: passwordFor.username },
                  )
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
              <Shuffle /> {t("Generate password")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!nextPassword}
              onClick={() =>
                void copyText(nextPassword)
                  .then(() => setCopied(true))
                  .catch(() => toast.error(t("Could not copy the password")))
              }
            >
              {copied ? (
                <>
                  <Check /> {t("Copied")}
                </>
              ) : (
                <>
                  <Copy /> {t("Copy password")}
                </>
              )}
            </Button>
          </div>
          <DialogFooter className="border-0 bg-transparent sm:justify-start">
            <Button
              type="button"
              disabled={nextPassword.length < 12}
              onClick={() => void savePassword()}
            >
              <Save /> {t("Save password")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteFor)}
        title={
          deleteFor
            ? t("Delete {username}?", { username: deleteFor.username })
            : t("Delete this account?")
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
  const { t } = useI18n();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [clearAiKey, setClearAiKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [prefixError, setPrefixError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void api<Settings>("/api/admin/settings")
      .then(setSettings)
      .catch((caught: unknown) =>
        toastCaught(caught, t("Could not load settings")),
      )
      .finally(() => setLoaded(true));
  }, []);

  async function testAi() {
    if (!settings) return;
    setTestingAi(true);
    try {
      await api("/api/admin/ai/test", {
        method: "POST",
        body: JSON.stringify({
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          aiBaseUrl: settings.aiBaseUrl,
          ...(aiApiKey.trim() ? { aiApiKey: aiApiKey.trim() } : {}),
        }),
      });
      toast.success(t("The connection works."));
    } catch (caught) {
      toastCaught(caught, t("Could not reach the AI provider"));
    } finally {
      setTestingAi(false);
    }
  }

  async function save(extra: { confirmPrefixChange?: boolean } = {}) {
    if (!settings) return;
    setPrefixError("");
    const invalidPrefix = validatePrefix(settings.shortUrlPrefix);
    if (invalidPrefix) {
      setPrefixError(invalidPrefix);
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
          linkSharing: settings.linkSharing,
          linkSharingAccess: settings.linkSharingAccess,
          linkSharingShowAdmin: settings.linkSharingShowAdmin,
          linkSharingEditAdmin: settings.linkSharingEditAdmin,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpUser: settings.smtpUser,
          emailFrom: settings.emailFrom,
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          aiBaseUrl: settings.aiBaseUrl,
          ...extra,
          ...(smtpPassword ? { smtpPassword } : {}),
          ...(aiApiKey ? { aiApiKey } : {}),
          ...(clearAiKey ? { aiApiKeyClear: true } : {}),
        }),
      });
      setSettings(next);
      setSmtpPassword("");
      setAiApiKey("");
      setClearAiKey(false);
      setConfirm(false);
      toast.success(t("Settings saved."));
    } catch (caught) {
      const apiError = caught as { code?: string; message?: string };
      if (apiError.code === "confirm_prefix") setConfirm(true);
      else toastCaught(caught, t("Could not save settings"));
    } finally {
      setPending(false);
    }
  }

  if (!settings)
    return (
      <section className="grid gap-4">
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          {t("Settings")}
        </h1>
          {loaded ? null : <DetailSkeleton label="Loading settings…" />}
      </section>
    );
  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-2xl font-medium tracking-tight">
          {t("Settings")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Mail and two-factor rules are saved here. The public site address, short-link origin, session secret, and encryption key stay in the server environment.",
          )}
        </p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">{t("Links")}</h2>
            <Field label="Public prefix" error={prefixError}>
              <Input
                value={settings.shortUrlPrefix}
                onChange={(event) => {
                  setPrefixError("");
                  setSettings({
                    ...settings,
                    shortUrlPrefix: event.target.value,
                  });
                }}
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
                {t("Legacy prefixes: {prefixes}", {
                  prefixes: settings.legacyPrefixes.join(", "),
                })}
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
                {t(choiceNote(redirectOptions, settings.defaultRedirectType))}
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
            <Toggle
              checked={settings.linkSharing}
              onChange={(linkSharing) =>
                setSettings({ ...settings, linkSharing })
              }
              label="Users see each other's links"
            />
            <Toggle
              checked={settings.linkSharingAccess === "edit"}
              disabled={!settings.linkSharing}
              onChange={(canEdit) =>
                setSettings({
                  ...settings,
                  linkSharingAccess: canEdit ? "edit" : "view",
                })
              }
              label="Users can edit each other's links"
            />
            <Toggle
              checked={settings.linkSharingShowAdmin}
              disabled={!settings.linkSharing}
              onChange={(linkSharingShowAdmin) =>
                setSettings({
                  ...settings,
                  linkSharingShowAdmin,
                  linkSharingEditAdmin: linkSharingShowAdmin
                    ? settings.linkSharingEditAdmin
                    : false,
                })
              }
              label="Users see admin links"
            />
            <Toggle
              checked={settings.linkSharingEditAdmin}
              disabled={!settings.linkSharing || !settings.linkSharingShowAdmin}
              onChange={(linkSharingEditAdmin) =>
                setSettings({
                  ...settings,
                  linkSharingEditAdmin,
                  linkSharingShowAdmin: linkSharingEditAdmin
                    ? true
                    : settings.linkSharingShowAdmin,
                })
              }
              label="Users can change admin links"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">{t("Sessions")}</h2>
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
              <h3 className="text-sm font-medium">{t("Registration")}</h3>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Registration is closed. Administrators create every account.",
                )}
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
                ? t(
                    "When this is off, each person can turn a code on from Account. When it is on, sign-in asks for an authenticator until they enroll.",
                  )
                : t(
                    "Save a mail server below before requiring a code. Until then, people cannot turn two-factor authentication on.",
                  )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-medium">{t("Email")}</h2>
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
                    ? t("Saved. Leave blank to keep it.")
                    : t("Optional")
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
        <AiSettingsCard
          settings={settings}
          apiKey={aiApiKey}
          clearKey={clearAiKey}
          testing={testingAi}
          onChange={setSettings}
          onApiKey={setAiApiKey}
          onClearKey={setClearAiKey}
          onTest={() => void testAi()}
        />
        <Button type="submit" disabled={pending}>
          <Save /> {pending ? t("Saving…") : t("Save settings")}
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          className={buttonVariants({ variant: "outline" })}
          href="/api/admin/export/links.csv"
        >
          <Download /> {t("Export links")}
        </a>
        <a
          className={buttonVariants({ variant: "outline" })}
          href="/api/admin/export/clicks.csv"
        >
          <Download /> {t("Export clicks")}
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
    return t("Password reset email uses the mail server saved here.");
  if (settings.smtpSource === "environment")
    return t(
      "No mail server is saved here yet. The server environment is still used until you save a host and from address.",
    );
  return t(
    "Password reset email stays off until a host and from address are saved.",
  );
}

export function AdminAuditPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const focus = params.get("entry");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useFocusRow(focus, !loading);
  useEffect(() => {
    const path = focus
      ? `/api/admin/audit?entry=${encodeURIComponent(focus)}`
      : "/api/admin/audit";
    setLoading(true);
    void api<{ entries: AuditEntry[] }>(path)
      .then((result) => setEntries(result.entries))
      .catch((caught: unknown) =>
        toastCaught(caught, t("Could not load the audit log")),
      )
      .finally(() => setLoading(false));
  }, [focus]);
  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-2xl font-medium tracking-tight">
        {t("Audit")}
      </h1>
      {loading ? (
        <RowSkeleton label="Loading audit log…" />
      ) : entries.length === 0 ? (
        <EmptyState>{t("No audit events yet.")}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("When")}</TableHead>
              <TableHead>{t("User")}</TableHead>
              <TableHead>{t("Action")}</TableHead>
              <TableHead>{t("Entity")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const sentence = auditActionSentence(entry.action);
              return (
                <TableRow
                  key={entry.id}
                  id={focusRowId(entry.id)}
                  className={rowFocusClass(entry.id, focus)}
                >
                  <TableCell>
                    <RelativeTime value={entry.createdAt} />
                  </TableCell>
                  <TableCell>{entry.actorUsername ?? "—"}</TableCell>
                  <TableCell title={entry.action}>
                    {sentence ? (
                      <div>
                        <div>{t(sentence)}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.action}
                        </div>
                      </div>
                    ) : (
                      entry.action
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.entityType}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
