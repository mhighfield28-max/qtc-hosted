// The cost test script: reads a module, sends each variant's model and effort, totals tokens and cost.
// Uses a fake Claude, so no key and no cost.
import { describe, expect, it, vi } from 'vitest'
import { buildRequest } from '../../server/generate.js'
import settings from '../../config/settings.json'
import { costOf, loadModule, runVariant, summaryMarkdown } from '../../scripts/cost-test.mjs'

const reply = {
  level: 'Remember',
  knowledgeType: 'Factual',
  outcome: 'LO1',
  stem: 'At what temperature does water boil at sea level?',
  options: [
    { label: 'A', text: '100 °C', isKey: true, misconception: '' },
    { label: 'B', text: '90 °C', isKey: false, misconception: 'Lower everywhere' },
    { label: 'C', text: '110 °C', isKey: false, misconception: 'Higher everywhere' },
  ],
  sourcePassage: 'notes: water boils at 100 °C at sea level.',
}
const fakeClaude = () => {
  const create = vi.fn(async () => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(reply) }],
    usage: { input_tokens: 100, output_tokens: 1000, cache_read_input_tokens: 50 },
  }))
  return { beta: { messages: { create } } }
}

describe('cost test', () => {
  it('reads the PHY101 module: its specification and all three teaching files', async () => {
    const mod = await loadModule('phy101')
    expect(mod.sources.map((s) => s.name)).toEqual(['week3-handout.docx', 'week3-notes.pdf', 'week3-slides.pptx'])
    expect(mod.sources.every((s) => s.text.length > 50)).toBe(true)
    expect(mod.slots).toHaveLength(20)
    expect(mod.specification).toContain('### A5. Checks to run on every question')
  }, 30000)

  it('sends the variant\'s model and effort, and leaves effort out when it is null', () => {
    const payload = { specification: 's', sources: [{ name: 'a', text: 'b' }], slot: { number: 1, level: 'Remember', outcome: { code: 'LO1', text: 't' }, keyPosition: 'A' }, total: 20 }
    const sonnet = buildRequest(payload, { model: 'claude-sonnet-5-5', effort: 'medium' })
    expect(sonnet.model).toBe('claude-sonnet-5-5')
    expect(sonnet.output_config.effort).toBe('medium')
    const haiku = buildRequest(payload, { model: 'claude-haiku-5-5', effort: null })
    expect(haiku.output_config).not.toHaveProperty('effort')
    const app = buildRequest(payload)
    expect(app.model).toBe('claude-opus-5-5')
    expect(app.output_config.effort).toBe(settings.effort)
  })

  it('works out cost from tokens and prices', () => {
    const usage = { inputTokens: 16005, outputTokens: 43655, cacheWriteTokens: 7066, cacheReadTokens: 67127 }
    expect(costOf(usage, 'claude-opus-5-5')).toBeCloseTo(0.9857, 3) // the first live set, 11 Nov
    expect(costOf(usage, 'claude-sonnet-5-5')).toBeCloseTo(0.4930, 3)
    expect(costOf(usage, 'unknown-model')).toBeNull()
  })

  it('runs a whole set for one variant and totals it', async () => {
    const mod = await loadModule('phy101')
    const client = fakeClaude()
    const run = await runVariant(mod, 'sonnet-medium', { model: 'claude-sonnet-5-5', effort: 'medium', label: 'Sonnet' }, { client, log: () => {} })
    expect(client.beta.messages.create).toHaveBeenCalledTimes(20)
    expect(client.beta.messages.create.mock.calls[0][0].model).toBe('claude-sonnet-5-5')
    expect(run.written).toBe(20)
    expect(run.usage.outputTokens).toBe(20000)
    expect(run.cost).toBeCloseTo((20 * 100 * 2 + 20000 * 10 + 20 * 50 * 0.1) / 1e6, 6)
    expect(summaryMarkdown([run], 'today')).toContain('| Sonnet | $0.20 | 20/20 |')
  }, 30000)
})
