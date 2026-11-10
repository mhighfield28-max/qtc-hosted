import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runChecks, runSetChecks, reusedCase } from '../../src/lib/checks.js'
import { planSlots } from '../../src/lib/plan.js'
import { specFromMarkdown } from '../../src/lib/specification.js'
import { SAMPLE_QUESTIONS } from '../fixtures/sampleQuestions.js'

const { spec } = specFromMarkdown(readFileSync(new URL('../../samples/sample-specification.md', import.meta.url), 'utf8'))
// The brief's section 7 example, with options evened up so it passes the 1.5x length rule.
const GOOD = {
  ...structuredClone(SAMPLE_QUESTIONS[2]),
  options: [
    { label: 'A', text: "It falls below the open pan's", isKey: false, misconception: 'Higher means colder, so lower boiling point' },
    { label: 'B', text: "It matches the open pan's", isKey: false, misconception: '100 °C is a fixed property of water' },
    { label: 'C', text: "It rises above the open pan's", isKey: true },
  ],
}
const q = (patch) => ({ ...structuredClone(GOOD), ...patch })

describe('Item 3: A5 checks on each question', () => {
  it("flags the brief's own section 7 example: 29 characters against 18 breaks the 1.5x rule", () => {
    expect(runChecks(SAMPLE_QUESTIONS[2], spec).reasons.optionLength).toContain('longest (29 characters)')
  })

  it('passes a good question on every check', () => {
    expect(runChecks(GOOD, spec)).toEqual({
      checks: { tags: true, newCase: true, oneKey: true, optionLength: true, noBannedForms: true, distractorsLinked: true },
      reasons: {},
    })
  })

  it('tags: level and knowledge type', () => {
    expect(runChecks(q({ knowledgeType: '' }), spec).reasons.tags).toBe('Missing a valid knowledge type.')
  })

  it('new case: a higher-order question must not reuse a B2 case', () => {
    const stem = 'A student cooks pasta at the top of Ben Nevis. Why does it take longer?'
    expect(runChecks(q({ stem }), spec).reasons.newCase).toContain('Cooking pasta at the top of Ben Nevis')
    expect(runChecks(q({ stem, level: 'Understand' }), spec).checks.newCase).toBe(true) // lower order may reuse
    expect(reusedCase('A climber boils water at the top of Kilimanjaro.', spec.cases)).toBeNull()
  })

  it('one key: exactly one', () => {
    const options = GOOD.options.map((o) => ({ ...o, isKey: true }))
    expect(runChecks(q({ options }), spec).reasons.oneKey).toBe('3 options are marked as the key.')
  })

  it('options: 3–4, none more than 1.5× the shortest', () => {
    expect(runChecks(SAMPLE_QUESTIONS[1], spec).reasons.optionLength).toMatch(/longest \(43 characters\).*shortest \(20\)/)
    expect(runChecks(q({ options: GOOD.options.slice(0, 2) }), spec).reasons.optionLength).toBe('Has 2 options; needs 3 or 4.')
  })

  it('wording: no all/none of the above, no unmarked negatives', () => {
    const options = GOOD.options.map((o, i) => (i === 0 ? { ...o, text: 'None of the above' } : o))
    expect(runChecks(q({ options }), spec).reasons.noBannedForms).toBe('Uses "None of the above".')
    expect(runChecks(q({ stem: 'Which of these does not raise the boiling point?' }), spec).reasons.noBannedForms).toContain('"not"')
    expect(runChecks(q({ stem: 'Which of these does **NOT** raise the boiling point?' }), spec).checks.noBannedForms).toBe(true)
  })

  it('distractors: each linked to a misconception', () => {
    expect(runChecks(SAMPLE_QUESTIONS[1], spec).reasons.distractorsLinked).toBe('Distractor D has no misconception recorded.')
  })
})

describe('Item 3: set-level checks and the plan', () => {
  it('plans a set that matches the distribution, with outcomes and keys spread', () => {
    const slots = planSlots(spec)
    expect(slots).toHaveLength(20)
    expect(slots.filter((s) => s.level === 'Apply')).toHaveLength(7)
    expect(slots.find((s) => s.level === 'Analyse').outcome.code).toBe('LO3') // LO3 targets Analyse
    const keys = slots.map((s) => s.keyPosition)
    for (const k of 'ABCD') expect(keys.filter((x) => x === k)).toHaveLength(5)
  })

  it('compares the written set with B4 and B5', () => {
    const questions = planSlots(spec).map((s) => ({ id: s.id, level: s.level }))
    expect(runSetChecks(questions, spec).distribution.ok).toBe(true)
    expect(runSetChecks(questions, spec).time.ok).toBe(true)
    const short = runSetChecks(questions.slice(1), spec)
    expect(short.distribution.ok).toBe(false)
    expect(short.distribution.detail).toBe('Remember: 2 written, 3 planned')
  })
})
