// The specification: Part B as an object, validation, and conversion to and from the
// Part B Markdown format (docs/part-b-template.md), so a set-up is never typed twice.

import {
  LEVELS,
  STUDY_LEVELS,
  QUESTION_COUNTS,
  WEIGHT_LIMIT,
  defaultDistribution,
  distributionTotal,
  sameDistribution,
  emptyDistribution,
} from './distribution.js'

export const EXPORT_FORMATS = ['Moodle GIFT', 'Blackboard']

export function emptySpec() {
  return {
    moduleName: '',
    studyLevel: '',
    outcomes: [{ text: '', level: '' }],
    cases: [''],
    misconceptions: [
      { text: '' },
      { text: '' },
    ],
    distribution: emptyDistribution(),
    distributionReason: '',
    questionCount: '',
    timeAvailable: '',
    gradeShare: '',
    exportFormats: [],
  }
}

export function isDistributionChanged(spec) {
  if (!spec.studyLevel || !spec.questionCount) return false
  return !sameDistribution(spec.distribution, defaultDistribution(spec.studyLevel, Number(spec.questionCount)))
}

// Returns { fieldKey: message } for every problem. Empty object means the form is complete.
// Row errors use keys like "outcomes.0.text".
export function validateSpec(spec) {
  const errors = {}
  const blank = (v) => !String(v ?? '').trim()

  if (blank(spec.moduleName)) errors.moduleName = 'Enter the module name and code.'
  if (blank(spec.studyLevel)) errors.studyLevel = 'Choose a level of study.'

  if (spec.outcomes.length < 1) errors.outcomes = 'Add at least one learning outcome.'
  spec.outcomes.forEach((o, i) => {
    if (blank(o.text)) errors[`outcomes.${i}.text`] = `Enter the text of outcome ${i + 1}.`
    if (blank(o.level)) errors[`outcomes.${i}.level`] = `Choose a target level for outcome ${i + 1}.`
  })

  if (spec.cases.length < 1) errors.cases = 'Add at least one case or example used in teaching.'
  spec.cases.forEach((c, i) => {
    if (blank(c)) errors[`cases.${i}`] = `Enter case or example ${i + 1}, or remove the row.`
  })

  if (spec.misconceptions.length < 2) errors.misconceptions = 'Add at least two misconceptions.'
  spec.misconceptions.forEach((m, i) => {
    if (blank(m.text)) errors[`misconceptions.${i}.text`] = `Enter misconception ${i + 1}.`
  })

  if (!QUESTION_COUNTS.includes(Number(spec.questionCount))) {
    errors.questionCount = 'Choose 20, 30 or 40 questions.'
  }

  const badCount = LEVELS.find((l) => {
    const v = spec.distribution[l]
    return v === '' || !Number.isInteger(Number(v)) || Number(v) < 0
  })
  if (badCount) {
    errors.distribution = `Enter a whole number of ${badCount} questions (0 or more).`
  } else if (spec.questionCount && distributionTotal(spec.distribution) !== Number(spec.questionCount)) {
    errors.distribution = `The distribution totals ${distributionTotal(spec.distribution)}; it must total ${spec.questionCount}.`
  }
  if (isDistributionChanged(spec) && blank(spec.distributionReason)) {
    errors.distributionReason = 'You changed the default distribution. Give the reason.'
  }

  const time = Number(spec.timeAvailable)
  if (blank(spec.timeAvailable) || !Number.isFinite(time) || time <= 0) {
    errors.timeAvailable = 'Enter the time available in minutes.'
  }

  const share = Number(spec.gradeShare)
  if (blank(spec.gradeShare) || !Number.isFinite(share) || share < 0 || share > 100) {
    errors.gradeShare = 'Enter the share of the module grade, from 0 to 100%.'
  }

  if (spec.exportFormats.length < 1) errors.exportFormats = 'Choose at least one export format.'

  return errors
}

export function weightWarning(spec) {
  return Number(spec.gradeShare) > WEIGHT_LIMIT
}

// ---------- Writing Markdown ----------

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
const longStudyLevel = (v) => STUDY_LEVELS.find((s) => s.value === v)?.long ?? v

export function specToMarkdown(spec, { houseRules, contentSource } = {}) {
  const dist = LEVELS.map((l) => `${l} ${spec.distribution[l]}`).join(', ')
  const changed = isDistributionChanged(spec)

  const partB = `# Questions That Count — Part B: Your module

### B1. Module and outcomes

- Module: ${spec.moduleName}
- Level of study: ${longStudyLevel(spec.studyLevel)}
- Learning outcomes, each with the level it targets:

| Outcome | Target level |
| --- | --- |
${spec.outcomes.map((o) => `| ${cell(o.text)} | ${cell(o.level)} |`).join('\n')}

### B2. What was taught

- Content source: ${contentSource || 'Teaching materials uploaded in the Content step'}
- Cases, examples and data used in teaching:
${spec.cases.map((c) => `  - ${String(c).trim()}`).join('\n')}

### B3. What students get wrong

| Misconception |
| --- |
${spec.misconceptions.map((m) => `| ${cell(m.text)} |`).join('\n')}

### B4. Distribution

- My distribution: ${dist}${changed ? `. Reason: ${spec.distributionReason.trim()}` : ' (default)'}

### B5. Length, timing and weight

- Number of questions: ${spec.questionCount}
- Time available: ${spec.timeAvailable} minutes
- Share of the module grade: ${spec.gradeShare}%

### B6. Output

- Export formats: ${spec.exportFormats.join(', ')}
- Review: every question is reviewed by me against A5 before import
`

  if (!houseRules) return partB
  return `${houseRules.trim()}\n\n---\n\n${partB}`
}

// ---------- Reading Markdown ----------

// A value still showing the template's italic placeholder counts as empty.
function clean(value) {
  const v = String(value ?? '').trim()
  if (/^\*[^*].*\*$/.test(v) || /^_.*_$/.test(v)) return ''
  return v
}

function splitSections(text) {
  const sections = {}
  const re = /^###\s*B(\d)\b.*$/gm
  const marks = [...text.matchAll(re)]
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    sections[m[1]] = text.slice(m.index + m[0].length, end)
  })
  return sections
}

function tableRows(section) {
  if (!section) return []
  return section
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .slice(2) // header and separator
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => clean(c.replace(/\\\|/g, '|'))),
    )
    .filter((cells) => cells.some(Boolean))
}

function lineValue(section, label) {
  if (!section) return ''
  const re = new RegExp(`^\\s*-\\s*${label}[^:]*:(.*)$`, 'mi')
  const m = section.match(re)
  return m ? clean(m[1]) : ''
}

function matchStudyLevel(value) {
  const v = value.toLowerCase()
  if (/y(ear)?\s*1/.test(v)) return 'UG Y1'
  if (/y(ear)?\s*2/.test(v)) return 'UG Y2'
  if (/y(ear)?\s*3/.test(v)) return 'UG Y3'
  if (v.includes('master')) return "Master's"
  if (v.includes('professional')) return 'Professional'
  return ''
}

function matchLevel(value) {
  const v = value.toLowerCase().replace('analyze', 'analyse')
  return LEVELS.find((l) => v.startsWith(l.toLowerCase().slice(0, 4))) ?? ''
}

// Reads Part A (the house rules) from a downloaded specification, if the file has one.
// Part A is everything before the Part B heading, without the "---" divider. Returns '' if absent.
export function houseRulesFromMarkdown(text) {
  const partBStart = text.search(/^#.*Part B/m)
  if (partBStart <= 0) return ''
  const before = text.slice(0, partBStart).replace(/\s*---\s*$/, '').trim()
  if (!/Part A|House rules/i.test(before) || !/^###\s*A\d/m.test(before)) return ''
  return before
}

// Reads a Part B (or a full specification containing Part B) into a spec object.
// Returns { spec, warnings }. Anything missing is left blank for the form to flag.
export function specFromMarkdown(text) {
  const warnings = []
  const partBStart = text.search(/^#.*Part B/m)
  const body = partBStart >= 0 ? text.slice(partBStart) : text
  const s = splitSections(body)
  if (!s['1'] && !s['3']) {
    throw new Error('This file doesn\'t look like a specification: no "B1" or "B3" sections were found.')
  }

  const spec = emptySpec()
  spec.moduleName = lineValue(s['1'], 'Module')
  spec.studyLevel = matchStudyLevel(lineValue(s['1'], 'Level of study'))

  const outcomes = tableRows(s['1']).map(([text = '', level = '']) => ({ text, level: matchLevel(level) }))
  if (outcomes.length) spec.outcomes = outcomes

  // Cases: indented bullets under the "Cases" line, or a ;-separated list on the line itself.
  const casesSection = s['2'] ?? ''
  const casesMatch = casesSection.match(/^\s*-\s*Cases[^:]*:(.*)$/im)
  if (casesMatch) {
    const inline = clean(casesMatch[1])
    const after = casesSection.slice(casesMatch.index + casesMatch[0].length).split(/\r?\n/)
    const nested = []
    for (const line of after) {
      const m = line.match(/^\s{2,}[-*]\s+(.*)$/)
      if (m) nested.push(clean(m[1]))
      else if (line.trim()) break
    }
    const cases = [...(inline ? inline.split(';').map((x) => x.trim()) : []), ...nested].filter(Boolean)
    if (cases.length) spec.cases = cases
  }

  // Older files had a second "Where you see it" column; only the first column is read.
  const misconceptions = tableRows(s['3']).map(([text = '']) => ({ text }))
  if (misconceptions.length) {
    spec.misconceptions = misconceptions
    while (spec.misconceptions.length < 2) spec.misconceptions.push({ text: '' })
  }

  const count = Number((lineValue(s['5'], 'Number of questions').match(/\d+/) ?? [])[0])
  spec.questionCount = QUESTION_COUNTS.includes(count) ? count : ''
  spec.timeAvailable = (lineValue(s['5'], 'Time available').match(/\d+(\.\d+)?/) ?? [''])[0]
  spec.gradeShare = (lineValue(s['5'], 'Share of the module grade').match(/\d+(\.\d+)?/) ?? [''])[0]

  const distLine = lineValue(s['4'], 'My distribution')
  const found = [...distLine.matchAll(/(Remember|Understand|Apply|Analy[sz]e|Evaluate)\D*?(\d+)/gi)]
  if (found.length === LEVELS.length) {
    spec.distribution = Object.fromEntries(found.map(([, l, n]) => [matchLevel(l), Number(n)]))
    spec.distributionReason = (distLine.match(/Reason:\s*(.+)$/i) ?? ['', ''])[1].trim()
  } else if (spec.studyLevel && spec.questionCount) {
    spec.distribution = defaultDistribution(spec.studyLevel, spec.questionCount)
    if (distLine && !/default/i.test(distLine)) {
      warnings.push(`Couldn't read the distribution ("${distLine}"), so the default was used. Check it.`)
    }
  }

  const formats = lineValue(s['6'], 'Export formats').toLowerCase()
  spec.exportFormats = EXPORT_FORMATS.filter((f) =>
    f === 'Moodle GIFT' ? /moodle|gift/.test(formats) : formats.includes('blackboard'),
  )

  return { spec, warnings }
}
