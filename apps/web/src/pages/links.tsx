import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, ExternalLink, Save, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { applyUtm, defaultQrStyle, qrWarnings, utmConflicts, type QrStyle, type UtmParams } from '@sharry/shared'
import { api, type Analytics, type PublicSettings, type QrCode, type ShortLink } from '../api.ts'
import { choiceNote, correctionOptions, redirectOptions } from '../choices.ts'
import { downloadQr, QrPreview } from '../components/qr-preview.tsx'
import { UtmFields } from '../components/utm-fields.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Checkbox } from '../components/ui/checkbox.tsx'
import { ConfirmDialog } from '../components/ui/confirm-dialog.tsx'
import { Select } from '../components/ui/choice-select.tsx'
import { copyText } from '../components/ui/copy.ts'
import { Field } from '../components/ui/field.tsx'
import { Input } from '../components/ui/input.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.tsx'
import { Breakdown, ClickChart, UtmBreakdowns } from './analytics.tsx'

const emptyUtm: UtmParams = {}
const noVariant = 'none'

type LinkVariant = { id: string; name: string; utm: UtmParams }

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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">Links</h1>
          <p className="text-sm text-muted-foreground">The slug stays put when you edit where it goes.</p>
        </div>
        <Link className={buttonVariants()} to="/links/new">New link</Link>
      </div>
      <Field label="Search">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Slug, title, or destination" />
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card className="mt-4 min-w-0">
        <CardContent className="min-w-0">
        {links.length === 0 ? <p className="text-sm text-muted-foreground">No links match.</p> : (
          <Table className="min-w-full w-max">
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead><span className="sr-only">Test</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell><Link className="font-medium hover:text-primary" to={`/links/${link.id}`}>{link.title?.trim() || link.slug}</Link></TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{link.shortUrl}</TableCell>
                  <TableCell className="text-muted-foreground">{link.destinationUrl}</TableCell>
                  <TableCell><Badge variant={link.status === 'active' ? 'secondary' : 'destructive'}>{link.status}</Badge></TableCell>
                  <TableCell>
                    <a className={buttonVariants({ variant: 'outline', size: 'icon' })} href={link.shortUrl} target="_blank" rel="noreferrer" aria-label={`Test ${link.title?.trim() || link.slug}`}>
                      <ExternalLink />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </CardContent>
      </Card>
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
      <h1 className="mb-5 font-heading text-4xl font-medium tracking-tight">New link</h1>
      <Card><CardContent>
      <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
        <Field label="Destination">
          <Input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Custom slug">
          <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Leave blank for a random slug" />
        </Field>
        <Field label="Redirect">
          <Select value={redirectType} options={[...redirectOptions]} onValueChange={setRedirectType} />
          <p className="text-[13px] leading-snug font-normal text-muted-foreground">{choiceNote(redirectOptions, redirectType)}</p>
        </Field>
        <UtmFields utm={utm} onChange={setUtm} />
        {conflicts.length > 0 ? <p className="text-sm text-destructive">Saving will replace {conflicts.join(', ')} already present on the destination.</p> : null}
        {settings ? <p className="text-sm text-muted-foreground">Preview: {previewDestination(destinationUrl, utm)}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Create link</Button>
      </form>
      </CardContent></Card>
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
  const [variants, setVariants] = useState<LinkVariant[]>([])
  const [trackingVariantId, setTrackingVariantId] = useState(noVariant)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [next, codes, stats, variantData] = await Promise.all([
          api<ShortLink>(`/api/links/${id}`),
          api<{ qrCodes: QrCode[] }>(`/api/links/${id}/qr`),
          api<Analytics>(`/api/links/${id}/analytics`),
          api<{ variants: LinkVariant[] }>(`/api/links/${id}/variants`),
        ])
        if (cancelled) return
        setError('')
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
        setVariants(variantData.variants)
        let nextLogo: string | null = null
        const saved = codes.qrCodes[0]
        if (saved) {
          setActiveQr(saved)
          setStyle(saved.style)
          setQrName(saved.name)
          setTrackingVariantId(saved.trackingVariantId ?? noVariant)
          if (saved.hasLogo) {
            const response = await fetch(`/api/qr/${saved.id}/logo`, { credentials: 'include' })
            if (cancelled) return
            if (response.ok) nextLogo = URL.createObjectURL(await response.blob())
          }
        } else {
          setActiveQr(null)
          setTrackingVariantId(noVariant)
        }
        if (cancelled) {
          if (nextLogo) URL.revokeObjectURL(nextLogo)
          return
        }
        setLogoUrl(nextLogo)
        setLogoFile(null)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load this link')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!logoUrl?.startsWith('blob:')) return
    const current = logoUrl
    return () => URL.revokeObjectURL(current)
  }, [logoUrl])

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

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
      const variantId = trackingVariantId === noVariant ? null : trackingVariantId
      const created = activeQr
        ? await api<QrCode>(`/api/qr/${activeQr.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name: qrName, style, trackingVariantId: variantId }),
          })
        : await api<QrCode>('/api/qr', {
            method: 'POST',
            body: JSON.stringify({ linkId: id, name: qrName, style, trackingVariantId: variantId }),
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
    setLogoFile(null)
    setLogoUrl(null)
    setLogoInputKey((key) => key + 1)
    setMessage('Center image removed.')
  }

  const conflicts = utmConflicts(destinationUrl, utm)
  const warnings = qrWarnings(style, Boolean(logoUrl))
  const previewUrl = activeQr?.url ?? link?.shortUrl ?? ''

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">{link?.title?.trim() || link?.slug || 'Link'}</h1>
          {link ? <a className="mt-1.5 block font-mono text-sm break-all text-muted-foreground underline-offset-3 hover:text-primary" href={link.shortUrl} target="_blank" rel="noreferrer">{link.shortUrl}</a> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button form="link-editor" type="submit"><Save size={16} /> Save</Button>
          <Button variant="outline" type="button" disabled={!link?.shortUrl} onClick={() => void copyShortUrl()}>
            {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
          </Button>
          <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</Button>
        </div>
      </div>
      <Card><CardContent>
      <form id="link-editor" className="grid gap-3" onSubmit={(event) => void save(event)}>
        <Field label="Destination">
          <Input value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required />
        </Field>
        <Field label="Slug">
          <Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="Leave blank for a random slug" />
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Field label="Redirect">
            <Select value={redirectType} options={redirectOptions.map(({ value, label }) => ({ value, label }))} onValueChange={setRedirectType} />
            <p className="sr-only text-[13px] leading-snug font-normal text-muted-foreground">{choiceNote(redirectOptions, redirectType)}</p>
          </Field>
          <Field label="Status">
            <Select value={status} options={[...statusOptions]} onValueChange={setStatus} />
          </Field>
        </div>
        <Field label="Expires">
          <Input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
        </Field>
        <Field label={link?.hasPassword ? 'Replace password' : 'Password'}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={link?.hasPassword ? 'Leave blank to keep it.' : 'Optional'}
            autoComplete="new-password"
          />
          <p className="sr-only text-[13px] leading-snug font-normal text-muted-foreground">
            Visitors must enter this password before the short link redirects.
            {link?.hasPassword ? ' A password is already saved.' : ''}
          </p>
        </Field>
        {link?.hasPassword ? <Button variant="outline" type="button" onClick={() => void clearPassword()}>Remove password</Button> : null}
        <UtmFields utm={utm} onChange={setUtm} />
        {conflicts.length > 0 ? <p className="text-sm text-destructive">This will replace {conflicts.join(', ')} on the destination.</p> : null}
        <p className="text-sm text-muted-foreground">Tracked URL: {previewDestination(destinationUrl, utm)}</p>
        {message ? <p>{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Save link</Button>
      </form>
      </CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card><CardContent>
        <form className="grid gap-3" onSubmit={(event) => void createQr(event)}>
          <h2>QR code</h2>
          <Field label="Name"><Input value={qrName} onChange={(event) => setQrName(event.target.value)} required /></Field>
          <Field label="Campaign variant">
            <Select
              value={trackingVariantId}
              placeholder="No variant"
              options={[
                { value: noVariant, label: 'No variant' },
                ...variants.map((variant) => ({ value: variant.id, label: variant.name })),
              ]}
              onValueChange={setTrackingVariantId}
            />
            <p className="text-[13px] leading-snug font-normal text-muted-foreground">The QR code uses this variant’s UTM values when someone scans it.</p>
          </Field>
          <Field label="Modules">
            <Select value={style.dotsType} options={[...moduleOptions]} onValueChange={(dotsType) => setStyle({ ...style, dotsType })} />
          </Field>
          <Field label="Finder">
            <Select value={style.cornersSquareType} options={[...finderOptions]} onValueChange={(cornersSquareType) => setStyle({ ...style, cornersSquareType })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Foreground"><Input type="color" value={style.dotsColor} onChange={(event) => setStyle({ ...style, dotsColor: event.target.value, cornersSquareColor: event.target.value, cornersDotColor: event.target.value })} /></Field>
            <Field label="Background"><Input type="color" value={style.backgroundColor} onChange={(event) => setStyle({ ...style, backgroundColor: event.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={style.backgroundTransparent} onCheckedChange={(checked) => setStyle({ ...style, backgroundTransparent: checked === true })} /> Transparent background</label>
          <Field label="Center image scale">
            <Input type="number" min="0" max="0.45" step="0.01" value={style.imageSize} onChange={(event) => setStyle({ ...style, imageSize: Number(event.target.value) })} />
          </Field>
          <Field label="Error correction">
            <Select value={style.errorCorrectionLevel} options={[...correctionOptions]} onValueChange={(errorCorrectionLevel) => setStyle({ ...style, errorCorrectionLevel })} />
            <p className="text-[13px] leading-snug font-normal text-muted-foreground">{choiceNote(correctionOptions, style.errorCorrectionLevel)}</p>
          </Field>
          <Field label="Quiet zone">
            <Input type="number" min="0" max="16" value={style.margin} onChange={(event) => setStyle({ ...style, margin: Number(event.target.value) })} />
          </Field>
          <Field label="Center image">
            <Input key={logoInputKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              setLogoFile(file)
              if (file) setLogoUrl(URL.createObjectURL(file))
            }} />
            {logoUrl ? <Button variant="outline" type="button" onClick={() => void removeCenterImage()}>Remove center image</Button> : null}
          </Field>
          {warnings.map((warning) => <p key={warning} className="text-sm text-destructive">{warning}</p>)}
          <Button type="submit">Save QR style</Button>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" type="button" onClick={() => void downloadQr(previewUrl, style, logoUrl, 'svg', slug || 'sharry')}>SVG</Button>
            <Button variant="outline" type="button" onClick={() => void downloadQr(previewUrl, style, logoUrl, 'png', slug || 'sharry')}>PNG</Button>
            <Button variant="outline" type="button" onClick={() => void downloadQr(previewUrl, { ...style, backgroundTransparent: false }, logoUrl, 'jpeg', slug || 'sharry')}>JPEG</Button>
          </div>
        </form>
        </CardContent></Card>
        <QrPreview url={previewUrl || 'https://example.com'} style={style} logoUrl={logoUrl} />
      </div>
      {qrCodes.length > 0 ? (
        <Card><CardContent>
          <h2 className="mb-2 text-lg font-medium">Saved codes</h2>
          <ul className="grid gap-2">
            {qrCodes.map((code) => (
              <li key={code.id}>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setActiveQr(code)
                    setStyle(code.style)
                    setQrName(code.name)
                    setTrackingVariantId(code.trackingVariantId ?? noVariant)
                  }}
                >
                  {code.name}
                </Button>
                {' · '}
                <span className="font-mono text-sm break-all text-muted-foreground">{code.url}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      ) : null}
      {analytics ? (
        <div className="grid gap-4">
          <Card><CardContent><ClickChart series={analytics.series} /></CardContent></Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdown title="QR codes" rows={analytics.qrCodes.map((row) => ({ name: row.name, clicks: row.clicks }))} />
            <UtmBreakdowns analytics={analytics} />
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this short link?"
        description="Type delete to remove the short link. Printed codes and saved URLs will stop working."
        confirmLabel="Delete link"
        destructive
        confirmDisabled={deleteText !== 'delete'}
        onOpenChange={(open) => {
          setConfirmDelete(open)
          if (!open) setDeleteText('')
        }}
        onConfirm={() => void remove()}
      >
        <Field label="Type delete">
          <Input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" />
        </Field>
      </ConfirmDialog>
    </section>
  )
}

