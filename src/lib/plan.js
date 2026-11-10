// Plans the set before generation: which level, learning outcome and key position
// each question gets, so the set matches the distribution (B4) and the key is spread
// evenly across positions (A3.7).

import { LEVELS } from './distribution.js'

const KEY_ROTATION = ['A', 'B', 'C', 'D']

export function planSlots(spec) {
  const outcomes = spec.outcomes.map((o, i) => ({ code: `LO${i + 1}`, text: o.text, level: o.level }))
  const slots = []
  const used = Object.fromEntries(outcomes.map((o) => [o.code, 0]))

  for (const level of LEVELS) {
    for (let n = 0; n < Number(spec.distribution[level] || 0); n++) {
      // Prefer outcomes that target this level; otherwise the nearest level. Spread use evenly.
      const distance = (o) => Math.abs(LEVELS.indexOf(o.level) - LEVELS.indexOf(level))
      const best = Math.min(...outcomes.map(distance))
      const candidates = outcomes.filter((o) => distance(o) === best)
      const outcome = candidates.reduce((a, b) => (used[b.code] < used[a.code] ? b : a))
      used[outcome.code] += 1
      slots.push({ level, outcome })
    }
  }

  return slots.map((slot, i) => ({
    ...slot,
    number: i + 1,
    id: `q${String(i + 1).padStart(2, '0')}`,
    keyPosition: KEY_ROTATION[(i * 3) % 4], // A, D, C, B, A, ... so neighbours differ
  }))
}
