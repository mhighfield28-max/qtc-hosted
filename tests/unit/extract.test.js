import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractPptx, fileKind } from '../../src/lib/extract.js'

describe('extraction', () => {
  it('reads slide text and speaker notes from a .pptx', async () => {
    const buf = readFileSync(new URL('../../samples/week3-slides.pptx', import.meta.url))
    const text = await extractPptx(buf)
    expect(text).toContain('[Slide 1]')
    expect(text).toContain('Week 3: Boiling point and pressure')
    expect(text).toContain('Notes: Ask: why does pasta take longer on Ben Nevis?')
    expect(text).toContain('A pressure cooker raises the pressure')
  })

  it('recognises file types', () => {
    expect(fileKind('a.PDF')).toBe('pdf')
    expect(fileKind('a.doc')).toBe('legacy')
    expect(fileKind('a.xlsx')).toBe('unsupported')
  })
})
