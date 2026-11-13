import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emptySpec, houseRulesFromMarkdown, specFromMarkdown, specToMarkdown, validateSpec } from '../../src/lib/specification.js'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('validateSpec', () => {
  it('flags every required field on an empty form', () => {
    const errors = validateSpec(emptySpec())
    for (const key of [
      'moduleName', 'studyLevel', 'outcomes.0.text', 'outcomes.0.level', 'cases.0',
      'misconceptions.0.text', 'misconceptions.1.text', 'questionCount', 'timeAvailable', 'gradeShare',
    ]) {
      expect(errors).toHaveProperty(key)
    }
  })

  it('accepts the sample specification', () => {
    const { spec } = specFromMarkdown(read('samples/sample-specification.md'))
    expect(validateSpec(spec)).toEqual({})
  })

  it('asks for a reason when the distribution is changed, and a correct total', () => {
    const { spec } = specFromMarkdown(read('samples/sample-specification.md'))
    spec.distribution = { ...spec.distribution, Remember: 4 }
    expect(validateSpec(spec)).toHaveProperty('distribution')
    expect(validateSpec(spec)).toHaveProperty('distributionReason')
  })
})

describe('specification files', () => {
  it('still imports an older file with a "Where you see it" column, keeping only the misconception', () => {
    const old = read('samples/sample-specification.md').replace(
      '| Misconception |\n| --- |\n| 100 °C is a fixed property of water |',
      '| Misconception | Where you see it |\n| --- | --- |\n| 100 °C is a fixed property of water | Exam answers |',
    )
    expect(old).toContain('Where you see it')
    const { spec } = specFromMarkdown(old)
    expect(spec.misconceptions[0]).toEqual({ text: '100 °C is a fixed property of water' })
    expect(validateSpec(spec)).toEqual({})
  })

  it('reads the sample specification', () => {
    const { spec } = specFromMarkdown(read('samples/sample-specification.md'))
    expect(spec.moduleName).toBe('Physical Science Foundations (PHY101)')
    expect(spec.studyLevel).toBe('UG Y1')
    expect(spec.outcomes).toHaveLength(3)
    expect(spec.outcomes[2]).toEqual({ text: 'Interpret a phase diagram to identify the state of a substance', level: 'Analyse' })
    expect(spec.cases).toHaveLength(3)
    expect(spec.misconceptions[0]).toEqual({ text: '100 °C is a fixed property of water' })
    expect(spec.distribution).toEqual({ Remember: 3, Understand: 5, Apply: 7, Analyse: 4, Evaluate: 1 })
    expect(spec.questionCount).toBe(20)
    expect(spec.timeAvailable).toBe('40')
    expect(spec.gradeShare).toBe('20')
    expect(spec.exportFormats).toEqual(['Blackboard', 'Moodle GIFT'])
  })

  it('round-trips through download and import, including a changed distribution and awkward characters', () => {
    const { spec } = specFromMarkdown(read('samples/sample-specification.md'))
    spec.moduleName = 'Pipes | and *stars* (X:1)'
    spec.distribution = { Remember: 2, Understand: 5, Apply: 8, Analyse: 4, Evaluate: 1 }
    spec.distributionReason = 'More practice applying the gas laws'
    const md = specToMarkdown(spec, { houseRules: read('docs/house-rules.md') })
    expect(md).toContain('### A5. Checks to run on every question')
    expect(specFromMarkdown(md).spec).toEqual(spec)
  })

  it('treats the blank template placeholders as empty', () => {
    const { spec } = specFromMarkdown(read('docs/part-b-template.md'))
    expect(spec.moduleName).toBe('')
    expect(spec.outcomes).toEqual([{ text: '', level: '' }])
    expect(spec.misconceptions.every((m) => !m.text)).toBe(true)
  })

  it('rejects a file that is not a specification', () => {
    expect(() => specFromMarkdown('# Shopping list\n\n- eggs')).toThrow(/doesn't look like a specification/)
  })
})

describe('houseRulesFromMarkdown', () => {
  const rules = read('docs/house-rules.md')
  const spec = specFromMarkdown(read('samples/sample-specification.md')).spec

  it('reads Part A back from a downloaded specification', () => {
    const file = specToMarkdown(spec, { houseRules: rules })
    expect(houseRulesFromMarkdown(file)).toBe(rules.trim())
  })

  it('returns nothing for a file with only Part B', () => {
    expect(houseRulesFromMarkdown(specToMarkdown(spec))).toBe('')
  })

  it('ignores text before Part B that is not house rules', () => {
    expect(houseRulesFromMarkdown(`Some notes\n\n${specToMarkdown(spec)}`)).toBe('')
  })
})
