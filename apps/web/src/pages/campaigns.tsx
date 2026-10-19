import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api, type ShortLink } from '../api.ts'
import { Button, Field } from '../components/ui.tsx'

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
    <section>
      <div className="page-head"><h1>Campaigns</h1></div>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <Field label="Name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Description"><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
        {error ? <p className="error">{error}</p> : null}
        <Button type="submit">Create campaign</Button>
      </form>
      <div className="card" style={{ marginTop: 16 }}>
        {campaigns.length === 0 ? <p className="muted">No campaigns yet.</p> : (
          <ul>{campaigns.map((campaign) => <li key={campaign.id}><Link to={`/campaigns/${campaign.id}`}>{campaign.name}</Link></li>)}</ul>
        )}
      </div>
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
    <section className="stack">
      <div className="page-head"><h1>{campaign?.name ?? 'Campaign'}</h1></div>
      <p className="muted">{campaign?.description}</p>
      <form className="card stack" onSubmit={(event) => void submit(event)}>
        <Field label="Variant name"><input className="input" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Link">
          <select className="select" value={linkId} onChange={(event) => setLinkId(event.target.value)}>
            {links.map((link) => <option key={link.id} value={link.id}>{link.slug}</option>)}
          </select>
        </Field>
        {error ? <p className="error">{error}</p> : null}
        <Button type="submit">Add variant</Button>
      </form>
      <div className="card">
        {(campaign?.variants.length ?? 0) === 0 ? <p className="muted">No variants yet.</p> : (
          <ul>{campaign?.variants.map((variant) => <li key={variant.id}>{variant.name}</li>)}</ul>
        )}
      </div>
    </section>
  )
}
