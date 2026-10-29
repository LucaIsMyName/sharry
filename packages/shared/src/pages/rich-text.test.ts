import { describe, expect, it } from 'vitest'
import { isSafeHref } from './html.ts'
import { cleanRichText, richTextToPlain } from './rich-text.ts'

describe('cleanRichText', () => {
  it('keeps what the text editor produces', () => {
    const html =
      '<h2>Title</h2><p style="text-align: center">Hello <strong>bold</strong>, <em>soft</em>, <u>under</u>, <s>gone</s> and <code>x</code>.</p><ul><li>One</li></ul><ol><li>Two</li></ol><blockquote><p>Said</p></blockquote><p>a<br>b</p>'
    expect(cleanRichText(html)).toBe(html)
  })

  it('keeps safe links and makes new tabs safe', () => {
    expect(cleanRichText('<a href="https://example.com/?a=1&amp;b=2" target="_blank" class="x">go</a>')).toBe(
      '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">go</a>',
    )
    expect(cleanRichText('<a href="/s/sale">go</a>')).toBe('<a href="/s/sale">go</a>')
  })

  it('removes scripts, handlers, styles, and unsafe links', () => {
    expect(cleanRichText('<p onclick="x()">Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>')
    expect(cleanRichText('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(cleanRichText('<a href="/&#9;/evil.example">x</a>')).toBe('<a>x</a>')
    expect(cleanRichText('<a href="java&#115;cript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(cleanRichText('<a href=" javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(cleanRichText('<img src=x onerror=alert(1)>text')).toBe('text')
    expect(cleanRichText('<p style="color:red;text-align:right">x</p>')).toBe('<p style="text-align: right">x</p>')
    expect(cleanRichText('<style>p{}</style><iframe src="x">y</iframe><svg><script>1</script></svg>ok')).toBe('ok')
    expect(cleanRichText('<!-- note --><p>x</p>')).toBe('<p>x</p>')
  })

  it('escapes stray markup and closes open tags', () => {
    expect(cleanRichText('1 < 2 & 3 > 2')).toBe('1 &lt; 2 &amp; 3 &gt; 2')
    expect(cleanRichText('<scr<script>ipt>alert(1)</script>')).toBe('ipt&gt;alert(1)')
    expect(cleanRichText('<p><strong>open')).toBe('<p><strong>open</strong></p>')
    expect(cleanRichText('</p>text</em>')).toBe('text')
    expect(cleanRichText('<p>a</strong>b</p>')).toBe('<p>ab</p>')
  })

  it('turns rich text into plain text', () => {
    expect(richTextToPlain('<h2>Hi</h2><p>One &amp; <strong>two</strong></p><ul><li>x</li></ul>')).toBe('Hi One & two x')
  })
})

describe('isSafeHref', () => {
  it('allows web, mail, phone, paths, and anchors', () => {
    for (const value of ['', 'https://a.example', 'http://a.example/x', 'mailto:a@b.c', 'tel:+4912', '/s/x', '#top']) {
      expect(isSafeHref(value)).toBe(true)
    }
  })

  it('refuses scripts, data, and protocol-relative addresses', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\t\\evil.example', 'vbscript:x', 'nonsense']) {
      expect(isSafeHref(value)).toBe(false)
    }
  })
})
