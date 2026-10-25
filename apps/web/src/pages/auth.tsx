import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  KeyRound,
  Save,
  Shield,
  ShieldOff,
  Shuffle,
  Trash2,
} from "lucide-react";
import {
  Link,
  useLoaderData,
  useNavigate,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { defaultQrStyle, generatePassword, locales } from "@sharry/shared";
import { useAppName } from "../brand.ts";
import { api, type Me } from "../api.ts";
import { localeLabels, useAccountLocale, useI18n } from "../i18n/index.tsx";
import { QrPreview } from "../components/qr-preview.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { copyText } from "../components/ui/copy.ts";
import { Select } from "../components/ui/choice-select.tsx";
import { Field } from "../components/ui/field.tsx";
import { ImageUpload } from "../components/ui/image-upload.tsx";
import { Input } from "../components/ui/input.tsx";
import { toast, toastCaught } from "../components/ui/toast.tsx";

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api<{ scope: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ usernameOrEmail, password }),
      });
      if (result.scope === "password_change")
        await navigate("/account/password");
      else if (result.scope === "mfa_enroll") await navigate("/account/mfa");
      else if (result.scope === "mfa_challenge") await navigate("/login/mfa");
      else await navigate("/");
    } catch (caught) {
      toastCaught(caught, t("Could not sign in"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      lede="Use your username or email. A code is required only when this account has turned on two-factor authentication."
    >
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Username or email">
          <Input
            value={usernameOrEmail}
            onChange={(event) => setUsernameOrEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t("Signing in…") : t("Continue")}
        </Button>
        <p className="mt-3 text-sm">
          <Link
            className="text-primary underline-offset-3 hover:underline"
            to="/login/reset"
          >
            {t("Forgot password")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function MfaPage() {
  const me = useLoaderData() as Me;
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/auth/mfa", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      await navigate("/");
    } catch (caught) {
      toastCaught(caught, t("That code is not valid"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Two-factor code"
      lede="Enter the code from your authenticator app, or a recovery code."
    >
      <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
        <Field label="Code">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </Field>
        <Button type="submit" disabled={pending}>
          <BadgeCheck /> {pending ? t("Checking…") : t("Verify")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function PasswordPage() {
  const me = useLoaderData() as Me;
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await api<{ scope: string }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (result.scope === "mfa_enroll") await navigate("/account/mfa");
      else if (result.scope === "mfa_challenge") await navigate("/login/mfa");
      else await navigate("/");
    } catch (caught) {
      toastCaught(caught, t("Could not change the password"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      lede="The first password is temporary. Use at least 12 characters."
    >
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <Field label="Current password">
          <Input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </Field>
        <Field label="New password">
          <Input
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={12}
            autoComplete="new-password"
            required
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setNewPassword(generatePassword());
            setShowNewPassword(true);
          }}
        >
          <Shuffle /> {t("Generate password")}
        </Button>
        <Button type="submit" disabled={pending}>
          <KeyRound /> {pending ? t("Updating…") : t("Update password")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function AccountPage() {
  const { t, locale, setLocale } = useI18n();
  const revalidator = useRevalidator();
  const [me, setMe] = useState<Me | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarKey, setAvatarKey] = useState(0);
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [turningOff, setTurningOff] = useState(false);

  useEffect(() => {
    void api<Me>("/api/auth/me").then(setMe);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      toast.success(t("Password updated."));
    } catch (caught) {
      toastCaught(caught, t("Could not change the password"));
    } finally {
      setPending(false);
    }
  }

  async function refreshAccount() {
    setMe(await api<Me>("/api/auth/me"));
    await revalidator.revalidate();
  }

  async function uploadAvatar(file: File) {
    const body = new FormData();
    body.set("file", file);
    try {
      await api("/api/auth/avatar", { method: "POST", body });
      setAvatarKey((key) => key + 1);
      await refreshAccount();
    } catch (caught) {
      toastCaught(caught, t("Could not save the photo"));
    }
  }

  async function removeAvatar() {
    try {
      await api("/api/auth/avatar", { method: "DELETE" });
      await refreshAccount();
    } catch (caught) {
      toastCaught(caught, t("Could not remove the photo"));
    }
  }

  useAccountLocale(me?.user.locale);

  async function changeLocale(next: string) {
    try {
      await api("/api/auth/locale", {
        method: "PATCH",
        body: JSON.stringify({ locale: next }),
      });
      setLocale(next);
      toast.success(t("Language updated."));
      await refreshAccount();
    } catch (caught) {
      toastCaught(caught, t("Could not save the language"));
    }
  }

  const initial = me?.user.username.trim().charAt(0).toUpperCase() || "?";

  return (
    <section className="grid gap-4">
      <div className="mb-1">
        <h1 className="font-heading text-4xl font-medium tracking-tight">
          {t("Account")}
        </h1>
        <p className="text-sm text-muted-foreground">{me?.user.email}</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          {me?.user.hasAvatar ? (
            <img
              src={`/api/auth/avatar?v=${encodeURIComponent(me.user.updatedAt)}`}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-xl font-medium">
              {initial}
            </span>
          )}
          <div className="grid gap-2">
            <Field label="Photo">
              <ImageUpload
                key={avatarKey}
                previewUrl={
                  me?.user.hasAvatar
                    ? `/api/auth/avatar?v=${encodeURIComponent(me.user.updatedAt)}`
                    : null
                }
                onFile={(file) => void uploadAvatar(file)}
              />
            </Field>
            {me?.user.hasAvatar ? (
              <Button
                variant="outline"
                type="button"
                onClick={() => void removeAvatar()}
              >
                <Trash2 /> {t("Remove photo")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Field label="Language">
            <Select
              value={me?.user.locale ?? locale}
              options={locales.map((code) => ({
                value: code,
                label: localeLabels[code],
              }))}
              onValueChange={(next) => void changeLocale(next)}
            />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <h2 className="text-lg font-medium">{t("Password")}</h2>
            <Field label="Current password">
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
              />
            </Field>
            <Button type="submit" disabled={pending}>
              <KeyRound /> {pending ? t("Updating…") : t("Update password")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3">
          <h2 className="text-lg font-medium">{t("Two-factor authentication")}</h2>
          {me?.mfaRequired ? (
            <p className="text-sm text-muted-foreground">
              {t("An administrator requires a code at sign-in.")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                "Optional. Turn it on for this account when you want a code at sign-in.",
              )}
            </p>
          )}
          {me && !me.mailConfigured && !me.user.totpEnabled ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "An administrator needs to save a mail server in Settings before two-factor authentication can be turned on.",
              )}
            </p>
          ) : null}
          {me?.user.totpEnabled ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setTurningOff(true);
                void api("/api/auth/mfa/disable", {
                  method: "POST",
                  body: JSON.stringify({ currentPassword: disablePassword }),
                })
                  .then(async () => {
                    setDisablePassword("");
                    toast.success(t("Two-factor authentication is off."));
                    setMe(await api<Me>("/api/auth/me"));
                  })
                  .catch((caught: unknown) =>
                    toastCaught(
                      caught,
                      t("Could not turn off two-factor authentication"),
                    ),
                  )
                  .finally(() => setTurningOff(false));
              }}
            >
              <p>{t("A code is required for this account.")}</p>
              <Field label="Current password">
                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(event) => setDisablePassword(event.target.value)}
                  required
                />
              </Field>
              <Button type="submit" disabled={turningOff}>
                <ShieldOff /> {turningOff ? t("Turning off…") : t("Turn off")}
              </Button>
            </form>
          ) : recovery ? (
            <RecoveryCodes codes={recovery} />
          ) : (
            <>
              {!setup && me?.mailConfigured ? (
                <Button
                  type="button"
                  onClick={() =>
                    void api<{ secret: string; otpauthUrl: string }>(
                      "/api/auth/mfa/setup",
                      { method: "POST" },
                    )
                      .then(setSetup)
                      .catch((caught: unknown) =>
                        toastCaught(caught, t("Could not start setup")),
                      )
                  }
                >
                  <Shield /> {t("Turn on")}
                </Button>
              ) : null}
              {setup ? (
                <AuthenticatorSetup
                  secret={setup.secret}
                  otpauthUrl={setup.otpauthUrl}
                  code={code}
                  pending={confirming}
                  onCode={setCode}
                  onConfirm={(event) => {
                    event.preventDefault();
                    setConfirming(true);
                    void api<{ recoveryCodes: string[] }>(
                      "/api/auth/mfa/confirm",
                      { method: "POST", body: JSON.stringify({ code }) },
                    )
                      .then(async (result) => {
                        setRecovery(result.recoveryCodes);
                        setMe(await api<Me>("/api/auth/me"));
                      })
                      .catch((caught: unknown) =>
                        toastCaught(caught, t("That code is not valid")),
                      )
                      .finally(() => setConfirming(false));
                  }}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function EnrollPage() {
  const me = useLoaderData() as Me;
  useAccountLocale(me.user.locale);
  const { t } = useI18n();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void api<Me>("/api/auth/me")
      .then((me) => setMailConfigured(me.mailConfigured))
      .catch(() => setMailConfigured(false));
  }, []);

  async function begin() {
    try {
      setSetup(await api("/api/auth/mfa/setup", { method: "POST" }));
    } catch (caught) {
      toastCaught(caught, t("Could not start setup"));
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setConfirming(true);
    try {
      const result = await api<{ recoveryCodes: string[] }>(
        "/api/auth/mfa/confirm",
        {
          method: "POST",
          body: JSON.stringify({ code }),
        },
      );
      setRecovery(result.recoveryCodes);
    } catch (caught) {
      toastCaught(caught, t("That code is not valid"));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <AuthShell
      title="Turn on two-factor"
      lede="This is optional. The dashboard stays available until you confirm a code."
    >
      {recovery ? (
        <>
          <RecoveryCodes codes={recovery} />
          <Button type="button" onClick={() => void navigate("/")}>
            {t("Continue")}
          </Button>
        </>
      ) : (
        <>
          {!setup && mailConfigured ? (
            <Button type="button" onClick={() => void begin()}>
              {t("Generate secret")}
            </Button>
          ) : null}
          {!setup && mailConfigured === false ? (
            <p className="text-sm text-muted-foreground">
              {t(
                "An administrator needs to save a mail server in Settings before two-factor authentication can be turned on.",
              )}
            </p>
          ) : null}
          {setup ? (
            <AuthenticatorSetup
              secret={setup.secret}
              otpauthUrl={setup.otpauthUrl}
              code={code}
              pending={confirming}
              onCode={setCode}
              onConfirm={(event) => void confirm(event)}
            />
          ) : null}
        </>
      )}
    </AuthShell>
  );
}

export function ResetPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast.success(
        t("If that account can receive mail, a reset link is on its way."),
      );
    } catch (caught) {
      toastCaught(caught, t("Could not send the reset link"));
    } finally {
      setPending(false);
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      toast.success(t("Password updated. Sign in with the new password."));
    } catch (caught) {
      toastCaught(caught, t("Could not reset the password"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      title="Reset password"
      lede="Email reset works when SMTP is configured. Otherwise an administrator can set a temporary password."
    >
      {token ? (
        <form className="space-y-3" onSubmit={(event) => void reset(event)}>
          <Field label="New password">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            <Save /> {pending ? t("Saving…") : t("Save password")}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => void requestReset(event)}
        >
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t("Sending…") : t("Send reset link")}
          </Button>
        </form>
      )}
      <p>
        <Link to="/login">{t("Back to sign in")}</Link>
      </p>
    </AuthShell>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-3">
      <p>
        {t("Save these recovery codes somewhere private. Each code works once.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {codes.map((item) => (
          <code
            key={item}
            className="rounded-md bg-muted px-2 py-2 text-center font-mono text-sm"
          >
            {item}
          </code>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          void copyText(codes.join("\n"))
            .then(() => setCopied(true))
            .catch(() => toast.error(t("Could not copy the recovery codes")))
        }
      >
        {copied ? (
          <>
            <Check /> {t("Copied")}
          </>
        ) : (
          <>
            <Copy /> {t("Copy codes")}
          </>
        )}
      </Button>
    </div>
  );
}

function AuthenticatorSetup({
  secret,
  otpauthUrl,
  code,
  onCode,
  onConfirm,
  pending,
}: {
  secret: string;
  otpauthUrl: string;
  code: string;
  onCode: (value: string) => void;
  onConfirm: (event: FormEvent) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <form className="grid gap-3" onSubmit={onConfirm}>
      <p>{t("Add this secret to your authenticator app.")}</p>
      <QrPreview url={otpauthUrl} style={defaultQrStyle} showNotes={false} />
      <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
        {secret}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          void copyText(secret)
            .then(() => setCopied(true))
            .catch(() => toast.error(t("Could not copy the secret")))
        }
      >
        {copied ? (
          <>
            <Check /> {t("Copied")}
          </>
        ) : (
          <>
            <Copy /> {t("Copy secret")}
          </>
        )}
      </Button>
      <Field label="Confirmation code">
        <Input
          value={code}
          onChange={(event) => onCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t("Checking…") : t("Confirm")}
      </Button>
    </form>
  );
}

function AuthShell({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const appName = useAppName();
  return (
    <div className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top_left,rgba(19,17,155,0.14),transparent_32%),var(--background)] p-6">
      <Card className="w-full max-w-md">
        <CardContent className="grid gap-3">
          <p className="font-heading text-4xl font-medium tracking-tight">
            {appName}
          </p>
          <h1 className="text-2xl font-medium">{t(title)}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(lede)}
          </p>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
