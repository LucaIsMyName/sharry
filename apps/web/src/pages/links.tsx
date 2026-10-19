import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, Save, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { applyUtm, defaultQrStyle, qrWarnings, utmConflicts, type QrStyle, type UtmParams } from '@sharry/shared'
import { api, type Analytics, type PublicSettings, type QrCode, type ShortLink } from '../api.ts'
import { choiceNote, correctionOptions, redirectOptions } from '../choices.ts'
import { downloadQr, QrPreview } from '../components/qr-preview.tsx'
import { Button } from '../components/ui/button.tsx'
import { copyText } from '../components/ui/copy.ts'
import { Field } from '../components/ui/field.tsx'
import { Select } from '../components/ui/select.tsx'
import { Breakdown, ClickChart } from './analytics.tsx'

const emptyUtm: UtmParams = {}

const statusOptions = [
  { value: 'active', label: 'active' },
  { value: 'disabled', label: 'disabled' },
] as const

const moduleOptions = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dots', label: 'Dots' },
  { value: 'extra-rounded', label: 'Rounded dots' },
] as const

const finderOptions = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'extra-rounded', label: 'Extra rounded' },
  { value: 'dot', label: 'Dot' },
] as const

function previewDestination(destination: string, utm: UtmParams): string {
  try {
    return applyUtm(destination, utm)
  } catch {
    return ''
  }
}

export function LinksPage() {
  const [links, setLinks] = useState<ShortLink[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handle = setTimeout(() => {
      void api<{ links: ShortLink[] }>(`/api/links?q=${encodeURIComponent(query)}`)
        .then((result) => setLinks(result.links))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load links'))
    }, 200)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Links</h1>
          <p className="muted">The slug stays put when you edit where it goes.</p>
        </div>
        <Link className="btn btn-accent" to="/links/new">New link</Link>
      </div>
      <Field label="Search">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Slug, title, or destination" />
      </Field>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        {links.length === 0 ? <p className="muted">No links match.</p> : (
          <table className="table">
            <thead><tr><th>Short URL</th><th>Destination</th><th>Status</th></tr></thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td><Link className="short-url" to={`/links/${link.id}`}>{link.shortUrl}</Link></td>
                  <td className="muted">{link.destinationUrl}</td>
                  <td><span className={link.status === 'active' ? 'badge' : 'badge badge-off'}>{link.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export function LinkFormPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [destinationUrl, setDestinationUrl] = useState('https://')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [redirectType, setRedirectType] = useState<'301' | '302' | '307' | '308'>('302')
  const [utm, setUtm] = useState<UtmParams>(emptyUtm)
  const [error, setError] = useState('')

  useEffect(() => {
    void api<PublicSettings>('/api/settings/public').then((value) => {
      setSettings(value)
      setRedirectType(value.defaultRedirectType)
    })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = await api<ShortLink>('/api/links', {
        method: 'POST',
        body: JSON.stringify({ destinationUrl, title, slug, redirectType, utm }),
      })
      await navigate(`/links/${created.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the link')
    }
  }

  const conflicts = utmConflicts(destinationUrl, utm)
  return (
    <section>
      <div className="page-head"><h1>New link</h1></div>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <Field label="Destination">
          <input className="input" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
        </Field>
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Custom slug">
          <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Leave blank for a random slug" />
        </Field>
        <Field label="Redirect">
          <Select value={redirectType} options={[...redirectOptions]} onValueChange={setRedirectType} />
          <p className="hint">{choiceNote(redirectOptions, redirectType)}</p>
        </Field>
        <UtmFields utm={utm} onChange={setUtm} />
        {conflicts.length > 0 ? <p className="error">Saving will replace {conflicts.join(', ')} already present on the destination.</p> : null}
        {settings ? <p className="muted">Preview: {previewDestination(destinationUrl, utm)}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <Button variant="accent" type="submit">Create link</Button>
      </form>
    </section>
  )
}

export function LinkDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [link, setLink] = useState<ShortLink | null>(null)
  const [destinationUrl, setDestinationUrl] = useState('')
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [redirectType, setRedirectType] = useState<ShortLink['redirectType']>('302')
  const [status, setStatus] = useState<ShortLink['status']>('active')
  const [expiresAt, setExpiresAt] = useState('')
  const [password, setPassword] = useState('')
  const [utm, setUtm] = useState<UtmParams>(emptyUtm)
  const [qrCodes, setQrCodes] = useState<QrCode[]>([])
  const [style, setStyle] = useState<QrStyle>(defaultQrStyle)
  const [qrName, setQrName] = useState('Default')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoInputKey, setLogoInputKey] = useState(0)
  const [activeQr, setActiveQr] = useState<QrCode | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  async function load() {
    const [next, codes, stats] = await Promise.all([
      api<ShortLink>(`/api/links/${id}`),
      api<{ qrCodes: QrCode[] }>(`/api/links/${id}/qr`),
      api<Analytics>(`/api/links/${id}/analytics`),
    ])
    setLink(next)
    setDestinationUrl(next.destinationUrl)
    setSlug(next.slug)
    setTitle(next.title ?? '')
    setRedirectType(next.redirectType)
    setStatus(next.status)
    setExpiresAt(next.expiresAt ? next.expiresAt.slice(0, 16) : '')
    setUtm(next.utm)
    setQrCodes(codes.qrCodes)
    setAnalytics(stats)
    const saved = codes.qrCodes[0]
    if (saved) {
      setActiveQr(saved)
      setStyle(saved.style)
      setQrName(saved.name)
      if (saved.hasLogo) {
        const response = await fetch(`/api/qr/${saved.id}/logo`, { credentials: 'include' })
        if (response.ok) setLogoUrl(URL.createObjectURL(await response.blob()))
      }
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const updated = await api<ShortLink>(`/api/links/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          destinationUrl,
          slug,
          title,
          redirectType,
          status,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          password: password ? password : undefined,
          utm,
        }),
      })
      setLink(updated)
      setSlug(updated.slug)
      setPassword('')
      setMessage(slug.trim() ? 'Saved. The short URL keeps this slug.' : 'Saved. A random slug replaced the empty one.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save')
    }
  }

  async function clearPassword() {
    setError('')
    setMessage('')
    try {
      const updated = await api<ShortLink>(`/api/links/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: null }),
      })
      setLink(updated)
      setPassword('')
      setMessage('Password removed. The short link redirects directly.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove the password')
    }
  }

  async function copyShortUrl() {
    if (!link?.shortUrl) return
    setError('')
    try {
      await copyText(link.shortUrl)
      setCopied(true)
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch (caught) {
      setCopied(false)
      setError(caught instanceof Error ? caught.message : 'Could not copy the short URL')
    }
  }

  async function remove() {
    await api(`/api/links/${id}`, { method: 'DELETE' })
    await navigate('/links')
  }

  async function createQr(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = activeQr
        ? await api<QrCode>(`/api/qr/${activeQr.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: qrName, style }),
          })
        : await api<QrCode>('/api/qr', {
            method: 'POST',
            body: JSON.stringify({ linkId: id, name: qrName, style }),
          })
      if (logoFile) {
        const body = new FormData()
        body.set('file', logoFile)
        await api(`/api/qr/${created.id}/logo`, { method: 'POST', body })
        created.hasLogo = true
        setStyle((current) => ({ ...current, errorCorrectionLevel: 'H' }))
      }
      setActiveQr(created)
      setLogoFile(null)
      setQrCodes((current) => [created, ...current.filter((code) => code.id !== created.id)])
      setMessage('QR code saved. Downloads use this code’s short URL.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the QR code')
    }
  }

  async function removeCenterImage() {
    setError('')
    setMessage('')
    if (activeQr?.hasLogo) {
      try {
        await api(`/api/qr/${activeQr.id}/logo`, { method: 'DELETE' })
        const next = { ...activeQr, hasLogo: false }
        setActiveQr(next)
        setQrCodes((current) => current.map((code) => (code.id === next.id ? next : code)))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not remove the center image')
        return
      }
    }
    if (logoUrl?.startsWith('blob:')) URL.revokeObjectURL(logoUrl)
    setLogoFile(null)
    setLogoUrl(null)
    setLogoInputKey((key) => key + 1)
    setMessage('Center image removed.')
  }

  const conflicts = utmConflicts(destinationUrl, utm)
  const warnings = qrWarnings(style, Boolean(logoUrl))
  const previewUrl = activeQr?.url ?? link?.shortUrl ?? ''

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <h1>{link?.title?.trim() || link?.slug || 'Link'}</h1>
          {link ? <a className="short-url" href={link.shortUrl} target="_blank" rel="noreferrer">{link.shortUrl}</a> : null}
        </div>
        <div className="btn-row">
          <Button form="link-editor" variant="accent" type="submit"><Save size={16} /> Save</Button>
          <Button variant="ghost" type="button" disabled={!link?.shortUrl} onClick={() => void copyShortUrl()}>
            {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
          </Button>
          <Button variant="danger" type="button" onClick={() => void remove()}><Trash2 size={16} /> Delete</Button>
        </div>
      </div>
      <form id="link-editor" className="card stack" onSubmit={(event) => void save(event)}>
        <Field label="Destination">
          <input className="input" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
        </Field>
        <Field label="Slug">
          <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Leave blank for a random slug" />
        </Field>
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div className="split">
          <Field label="Redirect">
            <Select value={redirectType} options={[...redirectOptions]} onValueChange={setRedirectType} />
            <p className="hint">{choiceNote(redirectOptions, redirectType)}</p>
          </Field>
          <Field label="Status">
            <Select value={status} options={[...statusOptions]} onValueChange={setStatus} />
          </Field>
        </div>
        <Field label="Expires">
          <input className="input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </Field>
        <Field label={link?.hasPassword ? 'Replace password' : 'Password'}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={link?.hasPassword ? 'Leave blank to keep it.' : 'Optional'}
            autoComplete="new-password"
          />
          <p className="hint">
            Visitors must enter this password before the short link redirects.
            {link?.hasPassword ? ' A password is already saved.' : ''}
          </p>
        </Field>
        {link?.hasPassword ? <Button variant="ghost" type="button" onClick={() => void clearPassword()}>Remove password</Button> : null}
        <UtmFields utm={utm} onChange={setUtm} />
        {conflicts.length > 0 ? <p className="error">This will replace {conflicts.join(', ')} on the destination.</p> : null}
        <p className="muted">Tracked URL: {previewDestination(destinationUrl, utm)}</p>
        {message ? <p>{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <Button variant="accent" type="submit">Save link</Button>
      </form>
      <div className="split">
        <form className="card stack" onSubmit={(event) => void createQr(event)}>
          <h2>QR code</h2>
          <Field label="Name"><input className="input" value={qrName} onChange={(event) => setQrName(event.target.value)} required /></Field>
          <Field label="Modules">
            <Select value={style.dotsType} options={[...moduleOptions]} onValueChange={(dotsType) => setStyle({ ...style, dotsType })} />
          </Field>
          <Field label="Finder">
            <Select value={style.cornersSquareType} options={[...finderOptions]} onValueChange={(cornersSquareType) => setStyle({ ...style, cornersSquareType })} />
          </Field>
          <div className="split">
            <Field label="Foreground"><input className="input" type="color" value={style.dotsColor} onChange={(event) => setStyle({ ...style, dotsColor: event.target.value, cornersSquareColor: event.target.value, cornersDotColor: event.target.value })} /></Field>
            <Field label="Background"><input className="input" type="color" value={style.backgroundColor} onChange={(event) => setStyle({ ...style, backgroundColor: event.target.value })} /></Field>
          </div>
          <label className="row"><input type="checkbox" checked={style.backgroundTransparent} onChange={(event) => setStyle({ ...style, backgroundTransparent: event.target.checked })} /> Transparent background</label>
          <Field label="Center image scale">
            <input className="input" type="number" min="0" max="0.45" step="0.01" value={style.imageSize} onChange={(event) => setStyle({ ...style, imageSize: Number(event.target.value) })} />
          </Field>
          <Field label="Error correction">
            <Select value={style.errorCorrectionLevel} options={[...correctionOptions]} onValueChange={(errorCorrectionLevel) => setStyle({ ...style, errorCorrectionLevel })} />
            <p className="hint">{choiceNote(correctionOptions, style.errorCorrectionLevel)}</p>
          </Field>
          <Field label="Quiet zone">
            <input className="input" type="number" min="0" max="16" value={style.margin} onChange={(event) => setStyle({ ...style, margin: Number(event.target.value) })} />
          </Field>
          <Field label="Center image">
            <input key={logoInputKey} className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              setLogoFile(file)
              if (file) setLogoUrl(URL.createObjectURL(file))
            }} />
            {logoUrl ? <Button variant="ghost" type="button" onClick={() => void removeCenterImage()}>Remove center image</Button> : null}
          </Field>
          {warnings.map((warning) => <p key={warning} className="error">{warning}</p>)}
          <Button type="submit">Save QR style</Button>
          <div className="btn-row">
            <Button variant="ghost" type="button" onClick={() => void downloadQr(previewUrl, style, logoUrl, 'svg', slug || 'sharry')}>SVG</Button>
            <Button variant="ghost" type="button" onClick={() => void downloadQr(previewUrl, style, logoUrl, 'png', slug || 'sharry')}>PNG</Button>
            <Button variant="ghost" type="button" onClick={() => void downloadQr(previewUrl, { ...style, backgroundTransparent: false }, logoUrl, 'jpeg', slug || 'sharry')}>JPEG</Button>
          </div>
        </form>
        <QrPreview url={previewUrl || 'https://example.com'} style={style} logoUrl={logoUrl} />
      </div>
      {qrCodes.length > 0 ? (
        <div className="card">
          <h2>Saved codes</h2>
          <ul>
            {qrCodes.map((code) => (
              <li key={code.id}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setActiveQr(code)
                    setStyle(code.style)
                    setQrName(code.name)
                  }}
                >
                  {code.name}
                </button>
                {' · '}
                {code.url}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {analytics ? (
        <div className="stack">
          <div className="card"><ClickChart series={analytics.series} /></div>
          <Breakdown title="QR codes" rows={analytics.qrCodes.map((row) => ({ name: row.name, clicks: row.clicks }))} />
        </div>
      ) : null}
    </section>
  )
}

function UtmFields({ utm, onChange }: { utm: UtmParams; onChange: (utm: UtmParams) => void }) {
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content'] as const
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      {fields.map((key) => (
        <Field key={key} label={key}>
          <input className="input" value={utm[key] ?? ''} onChange={(event) => onChange({ ...utm, [key]: event.target.value })} />
        </Field>
      ))}
    </div>
  )
}
