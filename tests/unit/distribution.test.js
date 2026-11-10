import { describe, expect, it } from 'vitest'
import { DEFAULTS_PER_20, LEVELS, defaultDistribution, distributionTotal, estimateMinutes, timeFit } from '../../src/lib/distribution.js'

describe('defaultDistribution', () => {
  it('matches the B4 table for 20 questions', () => {
    for (const [level, counts] of Object.entries(DEFAULTS_PER_20)) {
      expect(LEVELS.map((l) => defaultDistribution(level, 20)[l])).toEqual(counts)
    }
  })

  it('doubles for 40 questions', () => {
    expect(LEVELS.map((l) => defaultDistribution('UG Y1', 40)[l])).toEqual([6, 10, 14, 8, 2])
  })

  it('always totals the question count', () => {
    for (const level of Object.keys(DEFAULTS_PER_20)) {
      for (const n of [20, 30, 40]) expect(distributionTotal(defaultDistribution(level, n))).toBe(n)
    }
  })
})

describe('timing', () => {
  it('estimates from the B5 allowances', () => {
    // UG Y1 x20: 3x45+5x60+7x90+4x120+1x120 = 1665 s min; 3x60+5x75+7x120+4x150+1x180 = 2175 s max
    expect(estimateMinutes(defaultDistribution('UG Y1', 20))).toEqual({ min: 28, max: 37 })
  })

  it('says whether the paper fits', () => {
    const d = defaultDistribution('UG Y1', 20)
    expect(timeFit(d, 40)).toBe('fits')
    expect(timeFit(d, 30)).toBe('tight')
    expect(timeFit(d, 20)).toBe('over')
  })
})
