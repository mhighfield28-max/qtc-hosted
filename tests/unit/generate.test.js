import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildRequest, generateQuestion, handleGenerateHttp, readReply } from '../../server/generate.js'
import settings from '../../config/settings.json'
import { specFromMarkdown, specToMarkdown } from '../../src/lib/specification.js'
import { planSlots } from '../../src/lib/plan.js'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const { spec } = specFromMarkdown(read('samples/sample-specification.md'))
const specification = specToMarkdown(spec, { houseRules: read('docs/house-rules.md') })
const slots = planSlots(spec)
const sources = [
  { name: 'week3-notes.pdf', text: 'A liquid boils when its vapour pressure equals the pressure above it.' },
  { name: 'week3-slides.pptx', text: 'A pressure cooker raises the boiling point to about 120 °C.' },
]
const payload = { specification, sources, slot: slots[9], total: 20, previousStems: ['What is the boiling point of water at sea level?'] }

const goodReply = {
  level: 'Apply',
  knowledgeType: 'Procedural',
  outcome: 'LO2',
  stem: 'A sealed flask of water is taken from sea level to 2,000 m. What happens to its boiling point?',
  options: [
    { label: 'A', text: 'It stays the same', isKey: true, misconception: '' },
    { label: 'B', text: 'It falls by ten degrees', isKey: false, misconception: 'Boiling point always falls with altitude' },
    { label: 'C', text: 'It rises a little', isKey: false, misconception: 'Higher means hotter' },
  ],
  sourcePassage: 'week3-notes.pdf: A liquid boils when its vapour pressure equals the pressure above it.',
}
const message = (text, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  usage: { input_tokens: 10, output_tokens: 10 },
})
const fakeClient = (...replies) => {
  const create = vi.fn()
  replies.forEach((r) => create.mockResolvedValueOnce(r))
  return { client: { beta: { messages: { create } } }, create }
}

describe('Item 1: the specification is the instructions, the content is the source material', () => {
  const request = buildRequest(payload)

  it('sends the specification text, unchanged, as the system prompt', () => {
    expect(request.system).toBe(specification)
    expect(request.system).toContain('### A5. Checks to run on every question')
    expect(request.system).toContain('| 100 °C is a fixed property of water |')
  })

  it('sends each teaching file as a source document, named', () => {
    const docs = request.messages[0].content.filter((b) => b.type === 'document')
    expect(docs.map((d) => d.title)).toEqual(['week3-notes.pdf', 'week3-slides.pptx'])
    expect(docs[0].source).toEqual({ type: 'text', media_type: 'text/plain', data: sources[0].text })
    expect(docs.at(-1).cache_control).toEqual({ type: 'ephemeral' })
  })

  it("asks for this question's level, outcome and key position, and lists earlier stems", () => {
    const task = request.messages[0].content.at(-1).text
    expect(task).toContain('Write question 10 of 20')
    expect(task).toContain(`- Level: ${slots[9].level}`)
    expect(task).toContain(`- Learning outcome: ${slots[9].outcome.code}`)
    expect(task).toContain(`position ${slots[9].keyPosition}`)
    expect(task).toContain('- What is the boiling point of water at sea level?')
  })

  it('takes the model and effort from the settings file, and asks for the section 7 shape', () => {
    expect(request.model).toBe(settings.model)
    expect(request.output_config.effort).toBe(settings.effort)
    expect(request.output_config.format.type).toBe('json_schema')
    expect(request.output_config.format.schema.required).toEqual(
      ['level', 'knowledgeType', 'outcome', 'stem', 'options', 'sourcePassage'],
    )
  })

  it('changing the specification changes what is sent, with no code change', () => {
    const edited = specification.replace('Use three or four options.', 'Always use four options.')
    expect(buildRequest({ ...payload, specification: edited }).system).toContain('Always use four options.')
  })
})

describe('Item 2: replies are checked against the section 7 shape; retried once, then flagged', () => {
  it('accepts a good reply and fills in the section 7 fields', async () => {
    const { client, create } = fakeClient(message(JSON.stringify(goodReply)))
    const result = await generateQuestion(payload, { client })
    expect(create).toHaveBeenCalledTimes(1)
    expect(result.question).toMatchObject({ id: slots[9].id, status: 'draft', level: 'Apply', rejectReason: null })
    expect(result.question.options[0]).toEqual({ label: 'A', text: 'It stays the same', isKey: true })
    expect(result.question.options[1].misconception).toBe('Boiling point always falls with altitude')
  })

  it('retries once when the reply is malformed, telling the AI what was wrong', async () => {
    const { client, create } = fakeClient(
      message(JSON.stringify({ ...goodReply, level: 'Create', stem: '' })),
      message(JSON.stringify(goodReply)),
    )
    const result = await generateQuestion(payload, { client })
    expect(create).toHaveBeenCalledTimes(2)
    expect(result.question.stem).toBe(goodReply.stem)
    expect(result.attempts).toBe(2)
    const retryText = create.mock.calls[1][0].messages[0].content.at(-1).text
    expect(retryText).toContain('Your previous reply could not be used because:')
    expect(retryText).toContain('"level" must be one of')
    expect(retryText).toContain('"stem" is missing or empty.')
  })

  it('flags the question after a second malformed reply', async () => {
    const { client, create } = fakeClient(message('Sorry, here is a question: ...'), message('{"stem": "Half a reply'))
    const result = await generateQuestion(payload, { client })
    expect(create).toHaveBeenCalledTimes(2)
    expect(result.question).toBeUndefined()
    expect(result.flagged).toMatchObject({ id: slots[9].id, reason: 'The reply was not valid JSON.' })
    expect(result.flagged.attempts).toHaveLength(2)
  })

  it('treats a cut-off reply or a refusal as malformed', () => {
    expect(readReply(message('{}', 'max_tokens')).problems).toEqual(['The reply was cut off before it was finished.'])
    expect(readReply(message('', 'refusal')).problems).toEqual(['The AI declined to write this question.'])
  })

  it('catches each kind of shape problem', () => {
    const bad = { ...goodReply, options: [{ label: 'A', text: '', isKey: 'yes' }] }
    expect(readReply(message(JSON.stringify(bad))).problems).toEqual([
      '"options" must have between 2 and 4 entries.',
      'Option 1 has no text.',
      'Option 1 needs "isKey" true or false.',
    ])
  })
})

describe('the HTTP wrapper', () => {
  it('refuses to run without a key, and says where the key goes', async () => {
    const { status, body } = await handleGenerateHttp(JSON.stringify(payload), undefined)
    expect(status).toBe(500)
    expect(body.error).toContain('MCQ_CLAUDE_KEY')
  })

  it('rejects requests that are not a question request', async () => {
    expect((await handleGenerateHttp('not json', 'k')).status).toBe(400)
    expect((await handleGenerateHttp(JSON.stringify({ specification: 'x' }), 'k')).body.error).toBe('The request had no teaching content.')
  })
})

describe('Regenerating one question from the review screen', () => {
  it("passes the reviewer's note and the stem being replaced to the AI", () => {
    const request = buildRequest({ ...payload, replacing: 'Old stem about kettles?', note: 'make it harder' })
    const text = request.messages[0].content.at(-1).text
    expect(text).toContain('do not reuse this stem:\n- Old stem about kettles?')
    expect(text).toContain("The reviewer's note for this question: make it harder")
    expect(request.system).toBe(specification)
  })

  it('adds nothing when there is no note', () => {
    const text = buildRequest(payload).messages[0].content.at(-1).text
    expect(text).not.toContain("reviewer's note")
    expect(text).not.toContain('This replaces a question')
  })

  it('rejects a note that is not text', async () => {
    const { status, body } = await handleGenerateHttp(JSON.stringify({ ...payload, note: { evil: true } }), 'sk-test')
    expect(status).toBe(400)
    expect(body.error).toMatch(/regenerate note/)
  })
})
