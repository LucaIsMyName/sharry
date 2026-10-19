import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { defaultQrStyle, validatePrefix, type QrStyle } from '@sharry/shared'
import { api } from '../api.ts'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Select } from '../components/ui/choice-select.tsx'
import { ConfirmDialog } from '../components/ui/confirm-dialog.tsx'
import { Field } from '../components/ui/field.tsx'
import { Input } from '../components/ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.tsx'
import { choiceNote, redirectOptions } from '../choices.ts'
import { Toggle } from '../components/ui/toggle.tsx'

type AdminUser = {
  id: string
  username: string
  email: string
  role: 'admin' | 'user'
  isActive: boolean
  mustChangePassword: boolean
}

type Settings = {
  appUrl: string
  shortUrlBase: string
  shortUrlPrefix: string
  legacyPrefixEnabled: boolean
  legacyPrefixes: string[]
  defaultRedirectType: '301' | '302' | '307' | '308'
  slugLength: number
  analyticsRetentionDays: number
  registrationPolicy: 'closed'
  sessionTtlHours: number
  defaultQrStyle: QrStyle
  mfaRequired: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  emailFrom: string
  smtpPasswordSet: boolean
  smtpSource: 'app' | 'environment' | 'none'
}

type AuditEntry = { id: string; action: string; entityType: string; createdAt: string; metadata: Record<string, unknown> }

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' as 'admin' | 'user' })
  const [error, setError] = useState('')

  async function load() {
    setUsers((await api<{ users: AdminUser[] }>('/api/admin/users')).users)
  }
  useEffect(() => { void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load users')) }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      setForm({ username: '', email: '', password: '', role: 'user' })
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the user')
    }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    await load()
  }

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-4xl font-medium tracking-tight">Users</h1>
      <Card><CardContent>
      <form className="grid gap-3" onSubmit={(event) => void create(event)}>
        <Field label="Username"><Input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
        <Field label="Temporary password"><Input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={12} required /></Field>
        <Field label="Role">
          <Select
            value={form.role}
            options={[{ value: 'user', label: 'user' }, { value: 'admin', label: 'admin' }]}
            onValueChange={(role) => setForm({ ...form, role })}
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Create account</Button>
      </form>
      </CardContent></Card>
      <Card><CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="whitespace-normal">{user.username}<div className="text-sm text-muted-foreground">{user.email}</div></TableCell>
                <TableCell>
                  <Select
                    value={user.role}
                    options={[{ value: 'user', label: 'user' }, { value: 'admin', label: 'admin' }]}
                    onValueChange={(role) => void update(user.id, { role })}
                  />
                </TableCell>
                <TableCell className="whitespace-normal">{user.isActive ? 'Active' : 'Disabled'}{user.mustChangePassword ? ' · password change' : ''}</TableCell>
                <TableCell><Button variant="outline" type="button" onClick={() => void update(user.id, { isActive: !user.isActive })}>{user.isActive ? 'Deactivate' : 'Activate'}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </section>
  )
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [smtpPassword, setSmtpPassword] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    void api<Settings>('/api/admin/settings').then(setSettings).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load settings'))
  }, [])

  async function save(extra: { confirmPrefixChange?: boolean } = {}) {
    if (!settings) return
    setError('')
    setSaved('')
    const prefixError = validatePrefix(settings.shortUrlPrefix)
    if (prefixError) {
      setError(prefixError)
      return
    }
    try {
      const next = await api<Settings>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ...settings,
          defaultQrStyle: settings.defaultQrStyle ?? defaultQrStyle,
          ...extra,
          ...(smtpPassword ? { smtpPassword } : {}),
        }),
      })
      setSettings(next)
      setSmtpPassword('')
      setConfirm(false)
      setSaved('Settings saved.')
    } catch (caught) {
      const apiError = caught as { code?: string; message?: string }
      if (apiError.code === 'confirm_prefix') setConfirm(true)
      else setError(caught instanceof Error ? caught.message : 'Could not save settings')
    }
  }

  if (!settings) return <p className="text-sm text-muted-foreground">Loading settings…</p>
  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Mail and two-factor rules are saved here. The session secret and encryption key stay in the server environment.</p>
      </div>
      <Card><CardContent>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <Field label="Public application URL"><Input value={settings.appUrl} onChange={(event) => setSettings({ ...settings, appUrl: event.target.value })} /></Field>
        <Field label="Short URL base"><Input value={settings.shortUrlBase} onChange={(event) => setSettings({ ...settings, shortUrlBase: event.target.value })} /></Field>
        <Field label="Public prefix"><Input value={settings.shortUrlPrefix} onChange={(event) => setSettings({ ...settings, shortUrlPrefix: event.target.value })} /></Field>
        <Toggle checked={settings.legacyPrefixEnabled} onChange={(legacyPrefixEnabled) => setSettings({ ...settings, legacyPrefixEnabled })} label="Keep previous prefixes working" />
        {settings.legacyPrefixes.length > 0 ? <p className="text-sm text-muted-foreground">Legacy prefixes: {settings.legacyPrefixes.join(', ')}</p> : null}
        <Field label="Default redirect">
          <Select
            value={settings.defaultRedirectType}
            options={[...redirectOptions]}
            onValueChange={(defaultRedirectType) => setSettings({ ...settings, defaultRedirectType })}
          />
          <p className="text-[13px] leading-snug font-normal text-muted-foreground">{choiceNote(redirectOptions, settings.defaultRedirectType)}</p>
        </Field>
        <Field label="Random slug length"><Input type="number" min={4} max={16} value={settings.slugLength} onChange={(event) => setSettings({ ...settings, slugLength: Number(event.target.value) })} /></Field>
        <Field label="Analytics retention, days"><Input type="number" min={0} value={settings.analyticsRetentionDays} onChange={(event) => setSettings({ ...settings, analyticsRetentionDays: Number(event.target.value) })} /></Field>
        <Field label="Session length, hours"><Input type="number" min={1} value={settings.sessionTtlHours} onChange={(event) => setSettings({ ...settings, sessionTtlHours: Number(event.target.value) })} /></Field>
        <p>Registration is closed. Administrators create every account.</p>
        <Toggle checked={settings.mfaRequired} onChange={(mfaRequired) => setSettings({ ...settings, mfaRequired })} label="Require a two-factor code for every account" />
        <p className="text-sm text-muted-foreground">When this is off, each person can turn a code on from Account. When it is on, sign-in asks for an authenticator until they enroll.</p>
        <h2>Email</h2>
        <Field label="SMTP host"><Input value={settings.smtpHost} onChange={(event) => setSettings({ ...settings, smtpHost: event.target.value })} placeholder="smtp.example.com" /></Field>
        <Field label="SMTP port"><Input type="number" min={1} max={65535} value={settings.smtpPort} onChange={(event) => setSettings({ ...settings, smtpPort: Number(event.target.value) })} /></Field>
        <Field label="SMTP username"><Input value={settings.smtpUser} onChange={(event) => setSettings({ ...settings, smtpUser: event.target.value })} autoComplete="off" /></Field>
        <Field label="SMTP password">
          <Input type="password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} autoComplete="new-password" placeholder={settings.smtpPasswordSet ? 'Saved. Leave blank to keep it.' : 'Optional'} />
        </Field>
        <Field label="From address"><Input type="email" value={settings.emailFrom} onChange={(event) => setSettings({ ...settings, emailFrom: event.target.value })} placeholder="sharry@example.com" /></Field>
        <p className="text-sm text-muted-foreground">{smtpStatus(settings)}</p>
        {saved ? <p>{saved}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="submit">Save settings</Button>
          <a className={buttonVariants({ variant: 'outline' })} href="/api/admin/export/links.csv">Export links</a>
          <a className={buttonVariants({ variant: 'outline' })} href="/api/admin/export/clicks.csv">Export clicks</a>
        </div>
      </form>
      </CardContent></Card>
      <ConfirmDialog
        open={confirm}
        title="Change the public prefix?"
        description="Printed QR codes and saved short URLs keep the old path. Turn on legacy compatibility to redirect the previous prefix, or regenerate those codes."
        confirmLabel="Change prefix"
        onOpenChange={setConfirm}
        onConfirm={() => void save({ confirmPrefixChange: true })}
      >
        <Toggle checked={settings.legacyPrefixEnabled} onChange={(legacyPrefixEnabled) => setSettings({ ...settings, legacyPrefixEnabled })} label="Redirect the previous prefix" />
      </ConfirmDialog>
    </section>
  )
}

function smtpStatus(settings: Settings): string {
  if (settings.smtpSource === 'app') return 'Password reset email uses the mail server saved here.'
  if (settings.smtpSource === 'environment') return 'No mail server is saved here yet. The server environment is still used until you save a host and from address.'
  return 'Password reset email stays off until a host and from address are saved.'
}

export function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  useEffect(() => {
    void api<{ entries: AuditEntry[] }>('/api/admin/audit').then((result) => setEntries(result.entries))
  }, [])
  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-4xl font-medium tracking-tight">Audit</h1>
      <Card><CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Entity</TableHead></TableRow></TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-normal">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell className="text-muted-foreground">{entry.entityType}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </section>
  )
}
