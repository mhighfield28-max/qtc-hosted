import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { SAMPLE_QUESTIONS } from '../fixtures/sampleQuestions.js'
import {
  approvedOnly, buildExport, escapeGift, toBlackboard, toBrightspace, toCanvas, toGift, toReviewSheet,
} from '../../src/lib/exporters.js'

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

// A small CSV reader (RFC 4180: quoted fields, "" for a quote), to prove what Brightspace reads back.
function readCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  return rows
}

describe('Brightspace', () => {
  it("follows D2L's sample layout: one block of rows per question, key at 100", () => {
    const text = toBrightspace(approve([SAMPLE_QUESTIONS[0]]), { moduleCode: 'PHY101' })
    expect(text.startsWith('\uFEFF')).toBe(true)
    expect(text).toContain('\r\n')
    const rows = readCsv(text.slice(1))
    const q = SAMPLE_QUESTIONS[0]
    expect(rows.slice(0, 5)).toEqual([
      ['NewQuestion', 'MC', '', '', ''],
      ['ID', 'PHY101-Q01', '', '', ''],
      ['Title', `Q01 ${q.level} ${q.outcome}`, '', '', ''],
      ['QuestionText', q.stem, '', '', ''],
      ['Points', '1', '', '', ''],
    ])
    const options = rows.filter((r) => r[0] === 'Option')
    expect(options.map((r) => r[2])).toEqual(q.options.map((o) => o.text))
    expect(options.map((r) => r[1])).toEqual(q.options.map((o) => (o.isKey ? '100' : '0')))
    expect(rows.every((r) => r.length === 5)).toBe(true)
  })

  it('keeps commas, quotes and accents intact, and turns **bold** into plain capitals', () => {
    const rows = readCsv(toBrightspace([TRICKY]).slice(1))
    expect(rows.find((r) => r[0] === 'QuestionText')[1]).toBe(
      'Ratio 2:1 at 120 °C; what is {x} = "boiling" ~ #1 in C:\\temp when the lid is NOT on?',
    )
    expect(rows.filter((r) => r[0] === 'Option').map((r) => r[2])).toEqual(TRICKY.options.map((o) => o.text))
    expect(rows.find((r) => r[0] === 'ID')[1]).toBe('QTC-Q07')
  })
})

describe('Canvas', () => {
  const info = { id: 'qtc_PHY101_20261020', title: 'Physics: questions', description: '2 questions', date: '2026-10-20' }

  it('builds the QTI 1.2 package Canvas imports: manifest, questions and quiz settings', async () => {
    const zip = await JSZip.loadAsync(await toCanvas(approve(SAMPLE_QUESTIONS.slice(0, 2)), info))
    expect(Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort()).toEqual([
      'imsmanifest.xml', 'qtc_PHY101_20261020/assessment_meta.xml', 'qtc_PHY101_20261020/qtc_PHY101_20261020.xml',
    ])
    const manifest = await zip.file('imsmanifest.xml').async('string')
    expect(manifest).toContain('type="imsqti_xmlv1p2"')
    expect(manifest).toContain('<file href="qtc_PHY101_20261020/qtc_PHY101_20261020.xml"/>')
    const meta = await zip.file('qtc_PHY101_20261020/assessment_meta.xml').async('string')
    expect(meta).toContain('<workflow_state>unpublished</workflow_state>')
    expect(meta).toContain('<points_possible>2.0</points_possible>')
  })

  it('marks one key per question and escapes the text, with **bold** as <strong>', async () => {
    const zip = await JSZip.loadAsync(await toCanvas([TRICKY], info))
    const doc = await zip.file('qtc_PHY101_20261020/qtc_PHY101_20261020.xml').async('string')
    expect(doc.match(/<item /g)).toHaveLength(1)
    expect(doc).toContain('<fieldentry>multiple_choice_question</fieldentry>')
    expect(doc.match(/<response_label /g)).toHaveLength(3)
    expect(doc).toContain('<varequal respident="response1">qtc_PHY101_20261020_q07_a</varequal>')
    // The stem is HTML inside XML, so it is escaped twice: once for HTML and once for XML.
    expect(doc).toContain('&lt;strong&gt;NOT&lt;/strong&gt;')
    expect(doc).toContain('&amp;quot;boiling&amp;quot;')
    expect(doc).not.toMatch(/<mattext[^>]*>[^<]*"boiling"/)
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

  it('adds the Canvas .zip and the Brightspace .csv when chosen, and offers each on its own', async () => {
    const out = await buildExport({
      questions: approve(SAMPLE_QUESTIONS.slice(0, 3)), formats: ['Canvas', 'Brightspace'],
      questionSet: { moduleCode: 'PHY101', generatedAt: '2026-10-20T10:00:00Z', specification: 'x' },
      moduleName: 'Physical Science Foundations', exportedAt: new Date(2026, 9, 20), output: 'uint8array',
    })
    expect(out.lmsFiles.map((f) => [f.lms, f.name, f.type])).toEqual([
      ['Canvas', 'PHY101_2026-10-20_canvas-qti.zip', 'application/zip'],
      ['Brightspace', 'PHY101_2026-10-20_brightspace.csv', 'text/csv'],
    ])
    const canvas = await JSZip.loadAsync(out.lmsFiles[0].content)
    expect(await canvas.file('qtc_PHY101_20261020/assessment_meta.xml').async('string')).toContain(
      '<title>Physical Science Foundations: questions (20 October 2026)</title>',
    )
  })
})
