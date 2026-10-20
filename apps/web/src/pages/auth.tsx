import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useRevalidator, useSearchParams } from 'react-router'
import { api, type Me } from '../api.ts'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Field } from '../components/ui/field.tsx'
import { Input } from '../components/ui/input.tsx'

export function LoginPage() {
  const navigate = useNavigate()
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const result = await api<{ scope: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ usernameOrEmail, password }),
      })
      if (result.scope === 'password_change') await navigate('/account/password')
      else if (result.scope === 'mfa_enroll') await navigate('/account/mfa')
      else if (result.scope === 'mfa_challenge') await navigate('/login/mfa')
      else await navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in')
    }
  }

  return (
    <AuthShell title="Sign in" lede="Use your username or email. A code is required only when this account has turned on two-factor authentication.">
      <form className='space-y-3' onSubmit={(event) => void submit(event)}>
        <Field label="Username or email">
          <Input value={usernameOrEmail} onChange={(event) => setUsernameOrEmail(event.target.value)} autoComplete="username" required />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Continue</Button>
        <p className="mt-3 text-sm text-muted-foreground"><Link to="/login/reset">Forgot password</Link></p>
      </form>
    </AuthShell>
  )
}

export function MfaPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await api('/api/auth/mfa', { method: 'POST', body: JSON.stringify({ code }) })
      await navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That code is not valid')
    }
  }

  return (
    <AuthShell title="Two-factor code" lede="Enter the code from your authenticator app, or a recovery code.">
      <form onSubmit={(event) => void submit(event)}>
        <Field label="Code">
          <Input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Verify</Button>
      </form>
    </AuthShell>
  )
}

export function PasswordPage() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await api<{ scope: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (result.scope === 'mfa_enroll') await navigate('/account/mfa')
      else if (result.scope === 'mfa_challenge') await navigate('/login/mfa')
      else await navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password')
    }
  }

  return (
    <AuthShell title="Choose a new password" lede="The first password is temporary. Use at least 12 characters.">
      <form className='space-y-3' onSubmit={(event) => void submit(event)}>
        <Field label="Current password">
          <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        </Field>
        <Field label="New password">
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} required />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Update password</Button>
      </form>
    </AuthShell>
  )
}

export function AccountPage() {
  const revalidator = useRevalidator()
  const [me, setMe] = useState<Me | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [avatarKey, setAvatarKey] = useState(0)
  const [setup, setSetup] = useState<{ secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [disablePassword, setDisablePassword] = useState('')

  useEffect(() => {
    void api<Me>('/api/auth/me').then(setMe)
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setMessage('Password updated.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password')
    }
  }

  async function refreshAccount() {
    setMe(await api<Me>('/api/auth/me'))
    await revalidator.revalidate()
  }

  async function uploadAvatar(file: File) {
    setAvatarError('')
    const body = new FormData()
    body.set('file', file)
    try {
      await api('/api/auth/avatar', { method: 'POST', body })
      setAvatarKey((key) => key + 1)
      await refreshAccount()
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : 'Could not save the thumbnail')
    }
  }

  async function removeAvatar() {
    setAvatarError('')
    try {
      await api('/api/auth/avatar', { method: 'DELETE' })
      await refreshAccount()
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : 'Could not remove the thumbnail')
    }
  }

  const initial = me?.user.username.trim().charAt(0).toUpperCase() || '?'

  return (
    <section className="grid gap-4">
      <div className="mb-1">
        <h1 className="font-heading text-4xl font-medium tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">{me?.user.email}</p>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          {me?.user.hasAvatar ? (
            <img src={`/api/auth/avatar?v=${encodeURIComponent(me.user.updatedAt)}`} alt="" className="size-16 rounded-full object-cover" />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-xl font-medium">{initial}</span>
          )}
          <div className="grid gap-2">
            <Field label="Thumbnail">
              <Input key={avatarKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadAvatar(file)
              }} />
            </Field>
            {me?.user.hasAvatar ? <Button variant="outline" type="button" onClick={() => void removeAvatar()}>Remove thumbnail</Button> : null}
            {avatarError ? <p className="text-sm text-destructive">{avatarError}</p> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
      <CardContent>
      <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
        <h2>Password</h2>
        <Field label="Current password">
          <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
        </Field>
        <Field label="New password">
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} required />
        </Field>
        {message ? <p>{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Update password</Button>
      </form>
      </CardContent>
      </Card>
      <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-lg font-medium">Two-factor authentication</h2>
        {me?.mfaRequired ? <p className="text-sm text-muted-foreground">An administrator requires a code at sign-in.</p> : <p className="text-sm text-muted-foreground">Optional. Turn it on for this account when you want a code at sign-in.</p>}
        {me && !me.mailConfigured && !me.user.totpEnabled ? <p className="text-sm text-muted-foreground">An administrator needs to save a mail server in Settings before two-factor authentication can be turned on.</p> : null}
        {me?.user.totpEnabled ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setError('')
              setMessage('')
              void api('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ currentPassword: disablePassword }) })
                .then(async () => {
                  setDisablePassword('')
                  setMessage('Two-factor authentication is off.')
                  setMe(await api<Me>('/api/auth/me'))
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not turn off two-factor authentication'))
            }}
          >
            <p>A code is required for this account.</p>
            <Field label="Current password">
              <Input type="password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} required />
            </Field>
            <Button type="submit">Turn off</Button>
          </form>
        ) : recovery ? (
          <>
            <p>Save these recovery codes somewhere private. Each code works once.</p>
            <div className="grid grid-cols-2 gap-2">{recovery.map((item) => <code key={item} className="rounded-md bg-muted px-2 py-2 text-center font-mono text-sm">{item}</code>)}</div>
          </>
        ) : (
          <>
            {!setup && me?.mailConfigured ? <Button type="button" onClick={() => void api<{ secret: string }>('/api/auth/mfa/setup', { method: 'POST' }).then(setSetup).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not start setup'))}>Turn on</Button> : null}
            {setup ? (
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void api<{ recoveryCodes: string[] }>('/api/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ code }) })
                    .then(async (result) => {
                      setRecovery(result.recoveryCodes)
                      setMe(await api<Me>('/api/auth/me'))
                    })
                    .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That code is not valid'))
                }}
              >
                <p>Add this secret to your authenticator app:</p>
                <p><code>{setup.secret}</code></p>
                <Field label="Confirmation code">
                  <Input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required />
                </Field>
                <Button type="submit">Confirm</Button>
              </form>
            ) : null}
          </>
        )}
      </CardContent>
      </Card>
    </section>
  )
}

export function EnrollPage() {
  const navigate = useNavigate()
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState<string[] | null>(null)
  const [error, setError] = useState('')
  const [mailConfigured, setMailConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    void api<Me>('/api/auth/me').then((me) => setMailConfigured(me.mailConfigured)).catch(() => setMailConfigured(false))
  }, [])

  async function begin() {
    setError('')
    try {
      setSetup(await api('/api/auth/mfa/setup', { method: 'POST' }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start setup')
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    try {
      const result = await api<{ recoveryCodes: string[] }>('/api/auth/mfa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setRecovery(result.recoveryCodes)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That code is not valid')
    }
  }

  return (
    <AuthShell title="Turn on two-factor" lede="This is optional. The dashboard stays available until you confirm a code.">
      {recovery ? (
        <>
          <p>Save these recovery codes somewhere private. Each code works once.</p>
          <div className="my-4 grid grid-cols-2 gap-2">{recovery.map((item) => <code key={item} className="rounded-md bg-muted px-2 py-2 text-center font-mono text-sm">{item}</code>)}</div>
          <Button type="button" onClick={() => void navigate('/')}>Continue</Button>
        </>
      ) : (
        <>
          {!setup && mailConfigured ? <Button type="button" onClick={() => void begin()}>Generate secret</Button> : null}
          {!setup && mailConfigured === false ? <p className="text-sm text-muted-foreground">An administrator needs to save a mail server in Settings before two-factor authentication can be turned on.</p> : null}
          {setup ? (
            <form onSubmit={(event) => void confirm(event)}>
              <p>Add this secret to your authenticator app:</p>
              <p><code>{setup.secret}</code></p>
              <Field label="Confirmation code">
                <Input value={code} onChange={(event) => setCode(event.target.value)} required />
              </Field>
              <Button type="submit">Confirm</Button>
            </form>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </>
      )}
    </AuthShell>
  )
}

export function ResetPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function requestReset(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
      setMessage('If that account can receive mail, a reset link is on its way.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link')
    }
  }

  async function reset(event: FormEvent) {
    event.preventDefault()
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword: password }) })
      setMessage('Password updated. Sign in with the new password.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset the password')
    }
  }

  return (
    <AuthShell title="Reset password" lede="Email reset works when SMTP is configured. Otherwise an administrator can set a temporary password.">
      {token ? (
        <form className='space-y-3' onSubmit={(event) => void reset(event)}>
          <Field label="New password">
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />
          </Field>
          <Button type="submit">Save password</Button>
        </form>
      ) : (
        <form className='space-y-3' onSubmit={(event) => void requestReset(event)}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Button type="submit">Send reset link</Button>
        </form>
      )}
      {message ? <p>{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <p><Link to="/login">Back to sign in</Link></p>
    </AuthShell>
  )
}

function AuthShell({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top_left,rgba(227,106,46,0.18),transparent_32%),var(--background)] p-6">
      <Card className="w-full max-w-md">
        <CardContent className="grid gap-3">
          <p className="font-heading text-4xl font-medium tracking-tight">sharry</p>
          <h1 className="text-2xl font-medium">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{lede}</p>
          {children}
        </CardContent>
      </Card>
    </div>
  )
}
