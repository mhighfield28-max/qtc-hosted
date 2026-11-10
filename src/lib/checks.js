// The A5 checks from the house rules.
// Per-question checks are stored in each question's "checks" object (build brief, section 7).
// Set-level checks (distribution, total time) are calculated across the set, not stored.

import { LEVELS, KNOWLEDGE_TYPES, distributionTotal, estimateMinutes, timeFit } from './distribution.js'

export const QUESTION_CHECKS = [
  { key: 'tags', label: 'Tags', pass: 'Level tag and knowledge type present.' },
  {
    key: 'newCase',
    label: 'New case',
    pass: 'Lower-order question, or a higher-order one that uses a case not listed in B2.',
  },
  { key: 'oneKey', label: 'One key', pass: 'Exactly one correct answer.' },
  { key: 'optionLength', label: 'Options', pass: '3–4 options, none more than 1.5× the length of the shortest.' },
  { key: 'noBannedForms', label: 'Wording', pass: 'No "all/none of the above" and no unmarked negatives.' },
  { key: 'distractorsLinked', label: 'Distractors', pass: 'Every distractor is linked to a misconception.' },
]

export const HIGHER_ORDER = ['Apply', 'Analyse', 'Evaluate']

const STOPWORDS = new Set(
  'about above after again against also among because been before being below between both could does doing down during each from further have having here into itself just more most only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your'.split(' '),
)

const keywords = (text) =>
  new Set(
    String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  )

// The B2 case a stem seems to reuse, or null. A case counts as reused when most of its
// distinctive words (at least two, and at least 60%) appear in the stem.
export function reusedCase(stem, cases) {
  const stemWords = keywords(stem)
  for (const c of cases ?? []) {
    const caseWords = [...keywords(c)]
    if (caseWords.length === 0) continue
    const shared = caseWords.filter((w) => stemWords.has(w)).length
    if (shared >= Math.min(2, caseWords.length) && shared / caseWords.length >= 0.6) return c
  }
  return null
}

// Negative words that A3.3 says must be avoided, or written in bold capitals.
const NEGATIVES = /\b(not|never|except|least|cannot|can't|isn't|aren't|doesn't|don't|won't|incorrect|untrue)\b/gi
const BANNED = /\b(all|none) of the (above|options|answers)\b/i

function unmarkedNegatives(stem) {
  const found = []
  for (const m of String(stem).matchAll(NEGATIVES)) {
    const before = stem.slice(Math.max(0, m.index - 2), m.index)
    const after = stem.slice(m.index + m[0].length, m.index + m[0].length + 2)
    const marked = before === '**' && after === '**' && m[0] === m[0].toUpperCase()
    if (!marked) found.push(m[0])
  }
  return found
}

// Runs every per-question check. Returns { checks, reasons }:
// checks is the section 7 object of booleans; reasons says why each one failed.
export function runChecks(q, spec) {
  const reasons = {}
  const options = Array.isArray(q.options) ? q.options : []

  const missingTags = []
  if (!LEVELS.includes(q.level)) missingTags.push('level')
  if (!KNOWLEDGE_TYPES.includes(q.knowledgeType)) missingTags.push('knowledge type')
  if (missingTags.length) reasons.tags = `Missing a valid ${missingTags.join(' and ')}.`

  if (HIGHER_ORDER.includes(q.level)) {
    const reused = reusedCase(q.stem, spec?.cases)
    if (reused) reasons.newCase = `Higher-order question seems to reuse a case from teaching (B2): "${reused}".`
  }

  const keys = options.filter((o) => o.isKey).length
  if (keys !== 1) reasons.oneKey = keys === 0 ? 'No option is marked as the key.' : `${keys} options are marked as the key.`

  if (options.length < 3 || options.length > 4) {
    reasons.optionLength = `Has ${options.length} options; needs 3 or 4.`
  } else {
    const lengths = options.map((o) => String(o.text ?? '').trim().length)
    const shortest = Math.min(...lengths)
    const longest = Math.max(...lengths)
    if (longest > shortest * 1.5) {
      reasons.optionLength = `Options vary too much in length: the longest (${longest} characters) is more than 1.5× the shortest (${shortest}).`
    }
  }

  const banned = [q.stem, ...options.map((o) => o.text)].find((t) => BANNED.test(String(t ?? '')))
  const negatives = unmarkedNegatives(q.stem ?? '')
  if (banned) {
    reasons.noBannedForms = `Uses "${String(banned).match(BANNED)[0]}".`
  } else if (negatives.length) {
    reasons.noBannedForms = `The stem uses "${negatives[0]}". Avoid negatives, or write it in bold capitals (**${negatives[0].toUpperCase()}**).`
  }

  const unlinked = options.filter((o) => !o.isKey && !String(o.misconception ?? '').trim()).map((o) => o.label)
  if (unlinked.length) {
    reasons.distractorsLinked = `${unlinked.length === 1 ? 'Distractor' : 'Distractors'} ${unlinked.join(', ')} ${unlinked.length === 1 ? 'has' : 'have'} no misconception recorded.`
  }

  const checks = Object.fromEntries(QUESTION_CHECKS.map((c) => [c.key, !reasons[c.key]]))
  return { checks, reasons }
}

// The two set-level A5 checks, worked out across the questions written.
export function runSetChecks(questions, spec) {
  const written = questions.filter((q) => !q.flagged)
  const counts = Object.fromEntries(LEVELS.map((l) => [l, written.filter((q) => q.level === l).length]))
  const distributionOk = LEVELS.every((l) => counts[l] === Number(spec.distribution[l]))
  const fit = timeFit(counts, spec.timeAvailable)
  return {
    counts,
    distribution: {
      ok: distributionOk,
      detail: distributionOk
        ? `Matches B4 (${distributionTotal(counts)} questions).`
        : LEVELS.filter((l) => counts[l] !== Number(spec.distribution[l]))
            .map((l) => `${l}: ${counts[l]} written, ${spec.distribution[l]} planned`)
            .join('; '),
    },
    time: {
      ok: fit !== 'over',
      detail: `Estimated ${estimateMinutes(counts).min}–${estimateMinutes(counts).max} min against ${spec.timeAvailable} min available${
        fit === 'tight' ? ': fits only if students work fast' : ''
      }.`,
    },
  }
}
