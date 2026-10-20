import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import type { UtmParams } from '@sharry/shared'
import { api, type ShortLink } from '../api.ts'
import { UtmFields, utmSummary } from '../components/utm-fields.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Select } from '../components/ui/choice-select.tsx'
import { ConfirmDialog } from '../components/ui/confirm-dialog.tsx'
import { copyText } from '../components/ui/copy.ts'
import { Field } from '../components/ui/field.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'

type Campaign = { id: string; name: string; description: string | null }
type Variant = { id: string; name: string; linkId: string; utm: UtmParams }

const emptyUtm: UtmParams = {}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const result = await api<{ campaigns: Campaign[] }>('/api/campaigns')
    setCampaigns(result.campaigns)
  }

  useEffect(() => { void load() }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name, description }) })
      setName('')
      setDescription('')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the campaign')
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-heading text-4xl font-medium tracking-tight">Campaigns</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          A campaign groups tracked copies of your short links. Each variant keeps the same slug and adds its own UTM values. Share it with <span className="font-mono">?v=</span> or attach it to a QR code.
        </p>
      </div>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <Field label="Description"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit">Create campaign</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No campaigns yet.</p> : (
            <ul className="grid gap-2">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <Link to={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
                  {campaign.description ? <p className="text-sm text-muted-foreground">{campaign.description}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function CampaignDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<(Campaign & { variants: Variant[] }) | null>(null)
  const [links, setLinks] = useState<ShortLink[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [campaignDescription, setCampaignDescription] = useState('')
  const [name, setName] = useState('')
  const [linkId, setLinkId] = useState('')
  const [utm, setUtm] = useState<UtmParams>(emptyUtm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [variantToDelete, setVariantToDelete] = useState<Variant | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const [next, linkData] = await Promise.all([
      api<Campaign & { variants: Variant[] }>(`/api/campaigns/${id}`),
      api<{ links: ShortLink[] }>('/api/links?limit=100'),
    ])
    setCampaign(next)
    setCampaignName(next.name)
    setCampaignDescription(next.description ?? '')
    setLinks(linkData.links)
    setLinkId((current) => current || linkData.links[0]?.id || '')
  }

  useEffect(() => {
    void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load'))
  }, [id])

  function resetVariantForm() {
    setEditingId(null)
    setName('')
    setUtm(emptyUtm)
  }

  async function saveCampaign(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await api(`/api/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: campaignName, description: campaignDescription }),
      })
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the campaign')
    }
  }

  async function removeCampaign() {
    await api(`/api/campaigns/${id}`, { method: 'DELETE' })
    await navigate('/campaigns')
  }

  async function submitVariant(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      if (editingId) {
        await api(`/api/variants/${editingId}`, { method: 'PATCH', body: JSON.stringify({ name, utm }) })
      } else {
        await api(`/api/campaigns/${id}/variants`, { method: 'POST', body: JSON.stringify({ name, linkId, utm }) })
      }
      resetVariantForm()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the variant')
    }
  }

  function editVariant(variant: Variant) {
    setEditingId(variant.id)
    setName(variant.name)
    setLinkId(variant.linkId)
    setUtm(variant.utm)
    setError('')
  }

  async function removeVariant() {
    if (!variantToDelete) return
    setError('')
    try {
      await api(`/api/variants/${variantToDelete.id}`, { method: 'DELETE' })
      if (editingId === variantToDelete.id) resetVariantForm()
      setVariantToDelete(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the variant')
    }
  }

  async function copyVariant(variant: Variant) {
    const link = links.find((item) => item.id === variant.linkId)
    if (!link) return
    setError('')
    try {
      await copyText(variantUrl(link.shortUrl, variant.id))
      setCopiedId(variant.id)
      window.setTimeout(() => setCopiedId((current) => (current === variant.id ? '' : current)), 2000)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not copy the variant URL')
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-medium tracking-tight">{campaign?.name ?? 'Campaign'}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            A variant is the same short link with extra UTM values. Blank fields keep the UTM values saved on the link.
          </p>
        </div>
        <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</Button>
      </div>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void saveCampaign(event)}>
            <Field label="Name"><Input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} required /></Field>
            <Field label="Description"><Textarea value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} /></Field>
            <Button type="submit">Save campaign</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submitVariant(event)}>
            <h2 className="text-lg font-medium">{editingId ? 'Edit variant' : 'Add variant'}</h2>
            <Field label="Variant name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <Field label="Link">
              {editingId ? (
                <p className="font-mono text-sm break-all">{links.find((link) => link.id === linkId)?.shortUrl}</p>
              ) : (
                <Select
                  value={linkId}
                  placeholder="Choose a link"
                  options={links.map((link) => ({ value: link.id, label: link.shortUrl }))}
                  onValueChange={setLinkId}
                />
              )}
            </Field>
            {editingId ? <p className="text-sm text-muted-foreground">The link stays with this variant. Create another variant to track a different link.</p> : null}
            <UtmFields utm={utm} onChange={setUtm} />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button type="submit">{editingId ? 'Save variant' : 'Add variant'}</Button>
              {editingId ? <Button variant="outline" type="button" onClick={resetVariantForm}>Cancel</Button> : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {(campaign?.variants.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No variants yet.</p> : (
            <ul className="grid gap-4">
              {campaign?.variants.map((variant) => {
                const link = links.find((item) => item.id === variant.linkId)
                const url = link ? variantUrl(link.shortUrl, variant.id) : ''
                return (
                  <li key={variant.id} className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-medium">{variant.name}</span>
                      <Button variant="outline" type="button" onClick={() => editVariant(variant)}>Edit</Button>
                      <Button variant="outline" type="button" disabled={!url} onClick={() => void copyVariant(variant)}>
                        {copiedId === variant.id ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
                      </Button>
                      <Button variant="outline" type="button" onClick={() => setVariantToDelete(variant)}>Delete</Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{utmSummary(variant.utm)}</p>
                    {url ? <p className="font-mono text-sm break-all text-muted-foreground">{url}</p> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this campaign?"
        description="Variants in this campaign are removed. Short links and their click history stay."
        confirmLabel="Delete campaign"
        destructive
        onOpenChange={setConfirmDelete}
        onConfirm={() => void removeCampaign()}
      />
      <ConfirmDialog
        open={variantToDelete !== null}
        title="Delete this variant?"
        description="Printed QR codes that use this variant keep the old address, and new clicks will no longer count toward it."
        confirmLabel="Delete variant"
        destructive
        onOpenChange={(open) => {
          if (!open) setVariantToDelete(null)
        }}
        onConfirm={() => void removeVariant()}
      />
    </section>
  )
}

function variantUrl(shortUrl: string, variantId: string): string {
  const url = new URL(shortUrl)
  url.searchParams.set('v', variantId)
  return url.toString()
}
