import { describe, expect, it } from 'vitest'
import { createSessionUser, getContext, useTestApp } from './helpers.ts'

describe('folders and tags', () => {
  useTestApp()

  it('rejects a folder cycle, reparents children on delete, and stores a tag on a link', async () => {
    const ctx = await getContext()
    const user = await createSessionUser(ctx, { username: 'ada', email: 'ada@example.com' })
    const headers = { cookie: user.cookie }

    const parent = await ctx.app.inject({
      method: 'POST',
      url: '/api/folders',
      headers,
      payload: { kind: 'link', name: 'News' },
    })
    expect(parent.statusCode).toBe(200)
    const parentId = parent.json().id as string

    const child = await ctx.app.inject({
      method: 'POST',
      url: '/api/folders',
      headers,
      payload: { kind: 'link', name: 'Spring', parentId },
    })
    expect(child.statusCode).toBe(200)
    const childId = child.json().id as string

    const cycle = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/folders/${parentId}`,
      headers,
      payload: { parentId: childId },
    })
    expect(cycle.statusCode).toBe(400)

    const removed = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/folders/${parentId}`,
      headers,
    })
    expect(removed.statusCode).toBe(204)

    const tree = await ctx.app.inject({
      method: 'GET',
      url: '/api/folders?kind=link&tree=1',
      headers,
    })
    const folders = tree.json().folders as { id: string; parentId: string | null }[]
    expect(folders.find((folder) => folder.id === childId)?.parentId).toBeNull()

    const tagName = `Launch ${Date.now()}`
    const tag = await ctx.app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: tagName, kind: 'link', color: '#7c6af7' },
    })
    expect(tag.statusCode).toBe(200)
    expect(tag.json().color).toBe('#7c6af7')

    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: tagName.toLowerCase(), kind: 'link' },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error).toBe('This tag is already in use.')

    const campaignTag = await ctx.app.inject({
      method: 'POST',
      url: '/api/tags',
      headers,
      payload: { name: tagName, kind: 'campaign' },
    })
    expect(campaignTag.statusCode).toBe(200)

    const recolored = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tags/${tag.json().id}`,
      headers,
      payload: { color: '#e85d4c' },
    })
    expect(recolored.statusCode).toBe(200)
    expect(recolored.json().color).toBe('#e85d4c')

    const link = await ctx.app.inject({
      method: 'POST',
      url: '/api/links',
      headers,
      payload: {
        destinationUrl: 'https://example.com/launch',
        slug: `launch-${Date.now()}`,
        tags: [{ name: 'Poster', color: '#2a9d8f' }],
        folderId: childId,
      },
    })
    expect(link.statusCode).toBe(200)
    expect(link.json().tags).toEqual([expect.objectContaining({ name: 'Poster', color: '#2a9d8f' })])
    expect(link.json().folderId).toBe(childId)

    const listed = await ctx.app.inject({
      method: 'GET',
      url: `/api/links?folder=${childId}&tag=Poster`,
      headers,
    })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().links).toHaveLength(1)
  })
})
