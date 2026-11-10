import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { SAMPLE_QUESTIONS } from '../fixtures/sampleQuestions.js'
import { approvedOnly, buildExport, escapeGift, toBlackboard, toGift, toReviewSheet } from '../../src/lib/exporters.js'

const approve = (qs) => qs.map((q) => ({ ...structuredClone(q), status: 'approved' }))

// A tricky stem with every GIFT special character, plus quotes, °C, a backslash and a tab.
const TRICKY = {
  ...structuredClone(SAMPLE_QUESTIONS[2]),
  id: 'q07',
  status: 'approved',
  stem: 'Ratio 2:1 at 120 °C; what is {x} = "boiling" ~ #1 in C:\\temp\twhen the lid is **NOT** on?',
  options: [
    { label: 'A', text: 'It is {higher} = 5 °C', isKey: true },
    { label: 'B', text: 'Stays ~100 °C: "fixed"', isKey: false, misconception: '100 °C is a fixed property of water' },
    { label: 'C', text: "Falls, it's #lower", isKey: false, misconception: 'Higher means colder, so lower boiling point' },
  ],
}

// A small GIFT reader, enough to prove what Moodle will read back: splits on unescaped
// braces, = and ~, then removes the escapes.
function readGift(text) {
  const unescape = (s) => s.replace(/\\(.)/g, '$1').trim()
  return text
    .split(/\n\s*\n/)
    .filter((b) => b.trim())
    .map((block) => {
      const body = block.split('\n').filter((l) => !l.startsWith('//')).join('\n').trim()
      const m = body.match(/^::((?:\\.|[^:])*)::\[markdown\]((?:\\.|[^{])*)\{([\s\S]*)\}$/)
      const answers = [...m[3].matchAll(/([=~])((?:\\.|[^=~])*)/g)].map(([, mark, t]) => ({ isKey: mark === '=', text: unescape(t) }))
      return { title: m[1], stem: unescape(m[2]), answers }
    })
}

describe('only approved questions are exported', () => {
  it('leaves out drafts, rejected and flagged questions', () => {
    const qs = [
      { ...SAMPLE_QUESTIONS[0], status: 'approved' },
      { ...SAMPLE_QUESTIONS[1], status: 'draft' },
      { ...SAMPLE_QUESTIONS[2], status: 'rejected' },
      { id: 'q04', status: 'approved', flagged: { reason: 'x' } },
    ]
    expect(approvedOnly(qs).map((q) => q.id)).toEqual(['q01'])
  })

  it('refuses to build an export with nothing approved', async () => {
    await expect(buildExport({ questions: SAMPLE_QUESTIONS, formats: ['Moodle GIFT'], questionSet: {}, output: 'uint8array' })).rejects.toThrow(
      'Approve at least one question',
    )
  })
})

describe('Moodle GIFT', () => {
  it('writes one block per question with the key marked =', () => {
    const gift = toGift(approve(SAMPLE_QUESTIONS))
    expect(gift.split(/\n\n/)).toHaveLength(3)
    expect(gift).toContain('::Q01::[markdown]At sea-level atmospheric pressure, what is the boiling point of pure water? {\n\t~90 °C\n\t=100 °C\n\t~110 °C\n}')
  })

  it('escapes every special character', () => {
    expect(escapeGift('a:b {c} =d ~e #f \\g')).toBe('a\\:b \\{c\\} \\=d \\~e \\#f \\\\g')
  })

  it('special characters survive the round trip: colons, braces, quotes, °C', () => {
    const [back] = readGift(toGift([TRICKY]))
    expect(back.stem).toBe(TRICKY.stem.replace('\t', ' '))
    expect(back.answers).toEqual(TRICKY.options.map((o) => ({ isKey: o.isKey, text: o.text })))
  })
})

describe('Blackboard', () => {
  it('writes one MC line per question, each answer followed by correct or incorrect', () => {
    const lines = toBlackboard(approve(SAMPLE_QUESTIONS)).trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0].split('\t')).toEqual([
      'MC', 'At sea-level atmospheric pressure, what is the boiling point of pure water?',
      '90 °C', 'incorrect', '100 °C', 'correct', '110 °C', 'incorrect',
    ])
  })

  it('special characters survive, and a tab in the text cannot break the line apart', () => {
    const cells = toBlackboard([TRICKY]).trim().split('\t')
    expect(cells).toHaveLength(2 + 2 * TRICKY.options.length)
    expect(cells[1]).toBe(TRICKY.stem.replace('\t', ' '))
    expect(cells[2]).toBe('It is {higher} = 5 °C')
    expect(cells[4]).toBe('Stays ~100 °C: "fixed"')
  })
})

describe('review sheet', () => {
  it('is a Word file that opens, with every approved question, key, level, misconception and source', async () => {
    const bytes = await toReviewSheet(approve([SAMPLE_QUESTIONS[0], TRICKY]), {
      moduleName: 'Physical Science Foundations (PHY101)', moduleCode: 'PHY101',
      generatedAt: '2026-10-20T10:00:00Z', exportedAt: '2026-10-20T15:00:00Z',
    })
    const { value: text, messages } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    expect(messages.filter((m) => m.type === 'error')).toEqual([])
    expect(text).toContain('Review sheet: Physical Science Foundations (PHY101)')
    expect(text).toContain('2 approved questions')
    expect(text).toContain('Level: Apply · Knowledge type: Procedural · Outcome: LO2')
    expect(text).toContain(TRICKY.stem)
    expect(text).toMatch(/It is \{higher\} = 5 °C\s+✓ KEY/)
    expect(text).toContain('Misconception: 100 °C is a fixed property of water')
    expect(text).toContain(`Source: ${TRICKY.sourcePassage}`)
  })
})

describe('the zip', () => {
  it('holds the chosen LMS files, the review sheet and the exact specification, named by module code and date', async () => {
    const specification = readFileSync(new URL('../../samples/sample-specification.md', import.meta.url), 'utf8')
    const out = await buildExport({
      questions: [...approve([SAMPLE_QUESTIONS[0]]), SAMPLE_QUESTIONS[1]],
      formats: ['Moodle GIFT', 'Blackboard'],
      questionSet: { moduleCode: 'PHY101', generatedAt: '2026-10-20T10:00:00Z', specification },
      moduleName: 'Physical Science Foundations (PHY101)',
      exportedAt: new Date(2026, 9, 20, 15),
      output: 'uint8array',
    })
    expect(out.fileName).toBe('PHY101_2026-10-20.zip')
    expect(out.count).toBe(1)
    const zip = await JSZip.loadAsync(out.zipped)
    expect(Object.keys(zip.files).sort()).toEqual([
      'PHY101_2026-10-20_blackboard.txt', 'PHY101_2026-10-20_moodle-gift.txt',
      'PHY101_2026-10-20_review-sheet.docx', 'PHY101_2026-10-20_specification.md',
    ])
    expect(await zip.file('PHY101_2026-10-20_specification.md').async('string')).toBe(specification)
    expect((await zip.file('PHY101_2026-10-20_blackboard.txt').async('string')).trim().split('\n')).toHaveLength(1)
  })

  it('leaves out an LMS format that is not chosen', async () => {
    const out = await buildExport({
      questions: approve([SAMPLE_QUESTIONS[0]]), formats: ['Blackboard'],
      questionSet: { moduleCode: 'PHY101', generatedAt: '2026-10-20T10:00:00Z', specification: 'x' },
      moduleName: 'M', exportedAt: new Date(2026, 9, 20), output: 'uint8array',
    })
    expect(out.files.some((f) => f.includes('moodle'))).toBe(false)
  })
})
