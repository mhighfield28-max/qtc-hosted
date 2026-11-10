// The section 7 question shape: the JSON schema the AI must reply in, and a checker
// that confirms a reply really has that shape before it reaches the review screen.
// Used by the server function; kept free of browser or Node-only code.

import { LEVELS, KNOWLEDGE_TYPES } from './distribution.js'

export const LABELS = ['A', 'B', 'C', 'D']

// What the AI writes. The app adds id, status, checks and rejectReason itself.
export const QUESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['level', 'knowledgeType', 'outcome', 'stem', 'options', 'sourcePassage'],
  properties: {
    level: { type: 'string', enum: LEVELS },
    knowledgeType: { type: 'string', enum: KNOWLEDGE_TYPES },
    outcome: { type: 'string', description: 'The learning outcome code, e.g. LO2' },
    stem: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'text', 'isKey', 'misconception'],
        properties: {
          label: { type: 'string', enum: LABELS },
          text: { type: 'string' },
          isKey: { type: 'boolean' },
          misconception: {
            type: 'string',
            description: 'For a distractor, the misconception it represents. Empty string for the key.',
          },
        },
      },
    },
    sourcePassage: { type: 'string' },
  },
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0

// Returns a list of plain-English problems. An empty list means the shape is right.
// Shape only: whether the question is any good is the job of the A5 checks.
export function shapeProblems(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['The reply is not a JSON object.']
  const problems = []
  if (!LEVELS.includes(q.level)) problems.push(`"level" must be one of ${LEVELS.join(', ')}.`)
  if (!KNOWLEDGE_TYPES.includes(q.knowledgeType)) {
    problems.push(`"knowledgeType" must be one of ${KNOWLEDGE_TYPES.join(', ')}.`)
  }
  if (!isText(q.outcome)) problems.push('"outcome" is missing.')
  if (!isText(q.stem)) problems.push('"stem" is missing or empty.')
  if (!isText(q.sourcePassage)) problems.push('"sourcePassage" is missing or empty.')
  if (!Array.isArray(q.options)) {
    problems.push('"options" must be a list.')
  } else {
    if (q.options.length < 2 || q.options.length > 4) problems.push('"options" must have between 2 and 4 entries.')
    q.options.forEach((o, i) => {
      if (!o || typeof o !== 'object') return problems.push(`Option ${i + 1} is not an object.`)
      if (!isText(o.text)) problems.push(`Option ${i + 1} has no text.`)
      if (typeof o.isKey !== 'boolean') problems.push(`Option ${i + 1} needs "isKey" true or false.`)
      if (o.misconception != null && typeof o.misconception !== 'string') {
        problems.push(`Option ${i + 1} has a "misconception" that isn't text.`)
      }
    })
  }
  return problems
}

// Turns a shape-valid AI reply into a full section 7 question.
export function toQuestion(reply, id) {
  return {
    id,
    status: 'draft',
    level: reply.level,
    knowledgeType: reply.knowledgeType,
    outcome: reply.outcome.trim(),
    stem: reply.stem.trim(),
    options: reply.options.map((o, i) => {
      const option = { label: LABELS[i], text: o.text.trim(), isKey: o.isKey }
      if (!o.isKey) option.misconception = (o.misconception ?? '').trim()
      return option
    }),
    sourcePassage: reply.sourcePassage.trim(),
    checks: {},
    rejectReason: null,
  }
}
