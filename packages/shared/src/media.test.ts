import { describe, expect, it } from 'vitest'
import {
  detectMediaType,
  fitMediaImage,
  formatFileSize,
  mediaDisplayName,
  mediaFilePath,
  svgIsUnsafe,
  uniqueMediaName,
} from './media.ts'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('detectMediaType', () => {
  it('reads the type from the file contents', () => {
    expect(detectMediaType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg')
    expect(detectMediaType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png')
    expect(detectMediaType(text('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp')
    expect(detectMediaType(text('GIF89a....'))?.mime).toBe('image/gif')
    expect(detectMediaType(text('%PDF-1.7\n'))?.kind).toBe('document')
    expect(detectMediaType(text('\0\0\0\x20ftypisom\0\0'))?.mime).toBe('video/mp4')
    expect(detectMediaType(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01))?.mime).toBe('video/webm')
  })

  it('recognizes SVG after an XML declaration, comment, or doctype', () => {
    expect(detectMediaType(text('<svg xmlns="http://www.w3.org/2000/svg"/>'))?.mime).toBe('image/svg+xml')
    expect(
      detectMediaType(text('\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg viewBox="0 0 1 1"></svg>'))?.mime,
    ).toBe('image/svg+xml')
  })

  it('rejects unknown files, QuickTime movies, and HTML', () => {
    expect(detectMediaType(text('hello world'))).toBeNull()
    expect(detectMediaType(text('<html><svg></svg></html>'))).toBeNull()
    expect(detectMediaType(text('\0\0\0\x14ftypqt  \0\0'))).toBeNull()
    expect(detectMediaType(new Uint8Array())).toBeNull()
  })
})

describe('svgIsUnsafe', () => {
  it('accepts plain drawings with internal references and embedded images', () => {
    expect(svgIsUnsafe('<svg><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>')).toBe(false)
    expect(svgIsUnsafe('<svg><image href="data:image/png;base64,AAAA"/></svg>')).toBe(false)
  })

  it('refuses scripts, handlers, foreign content, and external references', () => {
    expect(svgIsUnsafe('<svg><script>alert(1)</script></svg>')).toBe(true)
    expect(svgIsUnsafe('<svg onload="alert(1)"></svg>')).toBe(true)
    expect(svgIsUnsafe('<svg><foreignObject><div/></foreignObject></svg>')).toBe(true)
    expect(svgIsUnsafe('<svg><a href="javascript:alert(1)"/></svg>')).toBe(true)
    expect(svgIsUnsafe('<svg><image href="https://tracker.example/x.png"/></svg>')).toBe(true)
    expect(svgIsUnsafe('<svg><rect style="fill:url(https://x.example/a)"/></svg>')).toBe(true)
    expect(svgIsUnsafe('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')).toBe(true)
  })
})

describe('media names', () => {
  it('keeps a readable name with the detected extension', () => {
    expect(mediaDisplayName('C:\\Users\\ada\\Summer Poster.PNG', 'png')).toBe('Summer Poster.png')
    expect(mediaDisplayName('../../etc/passwd', 'pdf')).toBe('passwd.pdf')
    expect(mediaDisplayName('...', 'jpg')).toBe('file.jpg')
    expect(mediaDisplayName('photo.jpeg', 'jpg')).toBe('photo.jpg')
    expect(mediaDisplayName(`${'a'.repeat(300)}.webp`, 'webp')).toHaveLength(120)
  })

  it('numbers a name that is already used, ignoring case', () => {
    expect(uniqueMediaName('photo.jpg', [])).toBe('photo.jpg')
    expect(uniqueMediaName('photo.jpg', ['Photo.JPG'])).toBe('photo (2).jpg')
    expect(uniqueMediaName('photo.jpg', ['photo.jpg', 'photo (2).jpg'])).toBe('photo (3).jpg')
  })

  it('builds an encoded public path', () => {
    expect(mediaFilePath('abc', 'Summer Poster (2).png')).toBe('/files/abc/Summer%20Poster%20(2).png')
  })

  it('formats file sizes', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB')
  })
})

describe('fitMediaImage', () => {
  it('keeps an image that already fits', () => {
    expect(fitMediaImage(1920, 1080)).toEqual({ width: 1920, height: 1080, resized: false })
    expect(fitMediaImage(800, 600)).toEqual({ width: 800, height: 600, resized: false })
    expect(fitMediaImage(1080, 1920)).toEqual({ width: 1080, height: 1920, resized: false })
  })

  it('scales a large landscape photo into 1920 by 1080', () => {
    expect(fitMediaImage(4000, 3000)).toEqual({ width: 1440, height: 1080, resized: true })
    expect(fitMediaImage(6000, 2000)).toEqual({ width: 1920, height: 640, resized: true })
  })

  it('turns the box upright for a portrait photo', () => {
    expect(fitMediaImage(4000, 5000)).toEqual({ width: 1080, height: 1350, resized: true })
    expect(fitMediaImage(3000, 9000)).toEqual({ width: 640, height: 1920, resized: true })
  })

  it('treats a square as landscape and never returns zero', () => {
    expect(fitMediaImage(3000, 3000)).toEqual({ width: 1080, height: 1080, resized: true })
    expect(fitMediaImage(20000, 1)).toEqual({ width: 1920, height: 1, resized: true })
  })
})
