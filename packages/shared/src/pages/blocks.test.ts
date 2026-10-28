import { describe, expect, it } from 'vitest'
import { blockIconNames, type RenderContext } from './block.ts'
import { defaultProps, propsSchema } from './fields.ts'
import { pageBlocks } from './registry.ts'
import { renderBlocks } from './render.ts'
import { pageBlockSchema } from './schema.ts'
import { createBlock } from './tree.ts'

const media: RenderContext['media'] = (id) =>
  id ? { id, path: `/files/${id}/file`, mime: 'image/png', alt: 'Library alt', width: 800, height: 600 } : null

/**
 * The contract every block in the registry must meet. A new block that passes these tests
 * can be added, saved, validated, and rendered.
 */
describe.each(pageBlocks.map((definition) => [definition.type, definition] as const))('block %s', (type, definition) => {
  it('describes itself for the editor', () => {
    expect(definition.label.trim()).not.toBe('')
    expect(definition.description.trim()).not.toBe('')
    expect(blockIconNames).toContain(definition.icon)
    expect(['Layout', 'Content', 'Media']).toContain(definition.group)
    for (const [name, spec] of Object.entries(definition.fields)) {
      expect(spec.label.trim(), `${type}.${name} label`).not.toBe('')
      if (spec.kind === 'choice') expect(spec.options.map((option) => option.value)).toContain(spec.default)
    }
  })

  it('has defaults that pass its own validation', () => {
    const defaults = defaultProps(definition.fields)
    expect(propsSchema(definition.fields).parse(defaults)).toEqual(defaults)
    expect(propsSchema(definition.fields).parse({})).toEqual(defaults)
  })

  it('creates, validates, and renders a new block', () => {
    const block = createBlock(type, () => 'b1')
    expect(pageBlockSchema.parse(block)).toEqual(block)
    expect(() => renderBlocks([block], { media })).not.toThrow()
  })

  it('renders the blocks placed in each of its slots', () => {
    if (!definition.slots?.length) return
    const block = createBlock(type, () => 'outer')
    block.slots = Object.fromEntries(
      definition.slots.map((slot) => {
        const heading = createBlock('heading', () => `in-${slot.name}`)
        heading.props = { ...heading.props, text: `Inside ${slot.name}` }
        return [slot.name, [heading]]
      }),
    )
    const html = renderBlocks([block], { media })
    for (const slot of definition.slots) expect(html).toContain(`Inside ${slot.name}`)
  })

  it('escapes text in every text field', () => {
    const block = createBlock(type, () => 'b1')
    const hostile = '<img src=x onerror=alert(1)>"\''
    for (const [name, spec] of Object.entries(definition.fields)) {
      if (spec.kind === 'text') block.props[name] = hostile
      if (spec.kind === 'list') block.props[name] = [{ ...defaultProps(spec.item), headline: hostile }]
      if (spec.kind === 'media') block.props[name] = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff'
    }
    const html = renderBlocks([block], { media })
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain(hostile)
    expect(html).not.toContain('"\'')
  })

  it('prefixes its CSS classes with b-', () => {
    for (const selector of (definition.css ?? '').match(/\.[a-z][\w-]*/gi) ?? []) {
      if (['.plus', '.bordered', '.large', '.plain'].includes(selector)) continue
      expect(selector, `${type} CSS ${selector}`).toMatch(/^\.b-/)
    }
  })
})

describe('registry', () => {
  it('uses each block type once', () => {
    const types = pageBlocks.map((definition) => definition.type)
    expect(new Set(types).size).toBe(types.length)
    for (const type of types) expect(type).toMatch(/^[a-z][a-z0-9-]*$/)
  })
})
