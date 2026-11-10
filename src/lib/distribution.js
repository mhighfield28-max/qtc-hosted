// Levels and default distributions, from Part A (A2) and Part B (B4, B5).

export const LEVELS = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate']
export const KNOWLEDGE_TYPES = ['Factual', 'Conceptual', 'Procedural']
export const QUESTION_COUNTS = [20, 30, 40]

export const STUDY_LEVELS = [
  { value: 'UG Y1', label: 'UG Y1', long: 'Undergraduate Y1' },
  { value: 'UG Y2', label: 'UG Y2', long: 'Undergraduate Y2' },
  { value: 'UG Y3', label: 'UG Y3', long: 'Undergraduate Y3' },
  { value: "Master's", label: "Master's", long: "Master's" },
  { value: 'Professional', label: 'Professional', long: 'Professional' },
]

// Counts per 20 questions, in LEVELS order (B4).
export const DEFAULTS_PER_20 = {
  'UG Y1': [3, 5, 7, 4, 1],
  'UG Y2': [2, 4, 7, 5, 2],
  'UG Y3': [1, 3, 6, 6, 4],
  "Master's": [1, 2, 5, 7, 5],
  Professional: [2, 4, 8, 4, 2],
}

// Default distribution for a level of study and question count, as an object keyed by level.
// Scales the per-20 table and rounds with the largest-remainder method so it always totals `count`.
export function defaultDistribution(studyLevel, count) {
  const base = DEFAULTS_PER_20[studyLevel]
  if (!base || !count) return emptyDistribution()
  const exact = base.map((n) => (n * count) / 20)
  const counts = exact.map(Math.floor)
  let remaining = count - counts.reduce((a, b) => a + b, 0)
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || b.i - a.i) // ties go to the higher level
  for (const { i } of order) {
    if (remaining <= 0) break
    counts[i] += 1
    remaining -= 1
  }
  return Object.fromEntries(LEVELS.map((level, i) => [level, counts[i]]))
}

export function emptyDistribution() {
  return Object.fromEntries(LEVELS.map((level) => [level, 0]))
}

export function distributionTotal(dist) {
  return LEVELS.reduce((sum, level) => sum + (Number(dist[level]) || 0), 0)
}

export function sameDistribution(a, b) {
  return LEVELS.every((level) => Number(a[level]) === Number(b[level]))
}

// Seconds per question, min and max (B5).
export const SECONDS_PER_QUESTION = {
  Remember: [45, 60],
  Understand: [60, 75],
  Apply: [90, 120],
  Analyse: [120, 150],
  Evaluate: [120, 180],
}

// Estimated paper length in minutes, as { min, max }, rounded up to the whole minute.
export function estimateMinutes(dist) {
  let min = 0
  let max = 0
  for (const level of LEVELS) {
    const n = Number(dist[level]) || 0
    min += n * SECONDS_PER_QUESTION[level][0]
    max += n * SECONDS_PER_QUESTION[level][1]
  }
  return { min: Math.ceil(min / 60), max: Math.ceil(max / 60) }
}

// 'fits' | 'tight' (only fits at the fast end) | 'over' (doesn't fit even at the fast end)
export function timeFit(dist, minutesAvailable) {
  const available = Number(minutesAvailable)
  if (!available) return null
  const { min, max } = estimateMinutes(dist)
  if (min > available) return 'over'
  if (max > available) return 'tight'
  return 'fits'
}

export const WEIGHT_LIMIT = 30
