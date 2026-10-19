import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api, type ShortLink } from '../api.ts'
import { Button } from '../components/ui/button.tsx'
import { Card, CardContent } from '../components/ui/card.tsx'
import { Select } from '../components/ui/choice-select.tsx'
import { Field } from '../components/ui/field.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'

type Campaign = { id: string; name: string; description: string | null }
type Variant = { id: string; name: string; linkId: string; utm: Record<string, string | null> }

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
      <h1 className="font-heading text-4xl font-medium tracking-tight">Campaigns</h1>
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
            <ul className="grid gap-2">{campaigns.map((campaign) => <li key={campaign.id}><Link to={`/campaigns/${campaign.id}`}>{campaign.name}</Link></li>)}</ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function CampaignDetailPage() {
  const { id = '' } = useParams()
  const [campaign, setCampaign] = useState<(Campaign & { variants: Variant[] }) | null>(null)
  const [links, setLinks] = useState<ShortLink[]>([])
  const [name, setName] = useState('')
  const [linkId, setLinkId] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const [next, linkData] = await Promise.all([
      api<Campaign & { variants: Variant[] }>(`/api/campaigns/${id}`),
      api<{ links: ShortLink[] }>('/api/links?limit=100'),
    ])
    setCampaign(next)
    setLinks(linkData.links)
    setLinkId((current) => current || linkData.links[0]?.id || '')
  }

  useEffect(() => { void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load')) }, [id])

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await api(`/api/campaigns/${id}/variants`, { method: 'POST', body: JSON.stringify({ name, linkId }) })
      setName('')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add the variant')
    }
  }

  return (
    <section className="grid gap-4">
      <h1 className="font-heading text-4xl font-medium tracking-tight">{campaign?.name ?? 'Campaign'}</h1>
      <p className="text-sm text-muted-foreground">{campaign?.description}</p>
      <Card>
        <CardContent>
          <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
            <Field label="Variant name"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
            <Field label="Link">
              <Select
                value={linkId}
                placeholder="Choose a link"
                options={links.map((link) => ({ value: link.id, label: link.shortUrl }))}
                onValueChange={setLinkId}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit">Add variant</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {(campaign?.variants.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No variants yet.</p> : (
            <ul className="grid gap-2">{campaign?.variants.map((variant) => <li key={variant.id}>{variant.name}</li>)}</ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
