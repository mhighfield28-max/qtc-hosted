// The server function that writes one question with Claude.
// It runs on the server only: locally inside the Vite dev server (vite.config.js),
// and on AWS as a Lambda function (amplify/functions/generate/handler.ts).
// The API key is read from the server's environment and never sent to the browser.

import Anthropic from '@anthropic-ai/sdk'
import settings from '../config/settings.json' with { type: 'json' }
import { QUESTION_JSON_SCHEMA, shapeProblems, toQuestion } from '../src/lib/questionShape.js'

export const KEY_NAME = 'MCQ_CLAUDE_KEY'
export const MAX_REQUEST_BYTES = 5 * 1024 * 1024
export const MAX_NOTE_LENGTH = 2000

export class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// ---------- Building the request ----------

// The specification is the AI's instructions: it goes in as the system prompt, unchanged.
// The teaching content goes in as source documents. Only this question's details are added.
export function buildRequest({ specification, sources, slot, total, previousStems = [], replacing, note, retryProblems }) {
  const documents = sources.map((s, i) => ({
    type: 'document',
    source: { type: 'text', media_type: 'text/plain', data: s.text },
    title: s.name,
    // Cache everything up to the last document, so questions 2 to 20 reuse it cheaply.
    ...(i === sources.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
  }))

  const lines = [
    `Write question ${slot.number} of ${total} for this set, following the specification in your instructions.`,
    '',
    `- Level: ${slot.level}`,
    `- Learning outcome: ${slot.outcome.code}: ${slot.outcome.text}`,
    `- Put the key at position ${slot.keyPosition} (or C if you use three options), unless the options have a natural order such as numbers, in which case keep that order.`,
    '',
    'Use only the source documents above as the teaching. In "sourcePassage", name the source document and quote or closely paraphrase the passage the question is based on.',
    'For each distractor, give the misconception it represents in "misconception", using the wording from B3 where one fits. For the key, use an empty string.',
  ]
  if (previousStems.length) {
    lines.push('', 'Questions already written for this set. Do not repeat them, and do not cue or answer any of them:')
    previousStems.forEach((stem) => lines.push(`- ${stem}`))
  }
  // Regenerating one question from the review screen: replace it, following the reviewer's note.
  if (replacing) {
    lines.push('', 'This replaces a question the reviewer did not want. Write a different question; do not reuse this stem:', `- ${replacing}`)
  }
  if (note) {
    lines.push('', `The reviewer's note for this question: ${note}`)
  }
  if (retryProblems?.length) {
    lines.push('', 'Your previous reply could not be used because:')
    retryProblems.forEach((p) => lines.push(`- ${p}`))
    lines.push('Write the question again.')
  }

  return {
    model: settings.model,
    max_tokens: settings.maxTokens,
    output_config: {
      effort: settings.effort,
      format: { type: 'json_schema', schema: QUESTION_JSON_SCHEMA },
    },
    // If a safety classifier declines, the API retries on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: specification,
    messages: [{ role: 'user', content: [...documents, { type: 'text', text: lines.join('\n') }] }],
  }
}

// ---------- Reading the reply ----------

// Returns { reply } for a usable reply, or { problems } saying why it can't be used.
export function readReply(message) {
  if (message.stop_reason === 'refusal') {
    return { problems: ['The AI declined to write this question.'] }
  }
  if (message.stop_reason === 'max_tokens') {
    return { problems: ['The reply was cut off before it was finished.'] }
  }
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  let reply
  try {
    reply = JSON.parse(text)
  } catch {
    return { problems: ['The reply was not valid JSON.'] }
  }
  const problems = shapeProblems(reply)
  return problems.length ? { problems } : { reply }
}

// ---------- Validating what the browser sent ----------

function validatePayload(p) {
  if (!p || typeof p !== 'object') throw new RequestError(400, 'The request was empty.')
  if (typeof p.specification !== 'string' || !p.specification.trim()) {
    throw new RequestError(400, 'The request had no specification.')
  }
  if (!Array.isArray(p.sources) || !p.sources.length || !p.sources.every((s) => typeof s?.text === 'string')) {
    throw new RequestError(400, 'The request had no teaching content.')
  }
  const s = p.slot
  if (!s || !Number.isInteger(s.number) || typeof s.level !== 'string' || !s.outcome?.code || !s.id) {
    throw new RequestError(400, 'The request did not say which question to write.')
  }
  for (const field of ['note', 'replacing']) {
    if (p[field] != null && (typeof p[field] !== 'string' || p[field].length > MAX_NOTE_LENGTH)) {
      throw new RequestError(400, `The ${field === 'note' ? 'regenerate note' : 'question being replaced'} must be text of at most ${MAX_NOTE_LENGTH} characters.`)
    }
  }
}

// ---------- The whole job: one question, one retry ----------

// Returns { question } on success, or { flagged } after two unusable replies.
// `client` can be swapped for a fake in tests.
export async function generateQuestion(payload, { apiKey, client } = {}) {
  validatePayload(payload)
  if (!client) {
    if (!apiKey) {
      throw new RequestError(500, `The server has no API key. Add ${KEY_NAME} to .env.local (or the Amplify secret) and restart.`)
    }
    client = new Anthropic({ apiKey })
  }

  const attempts = []
  const usage = emptyUsage()
  for (let attempt = 1; attempt <= 2; attempt++) {
    const request = buildRequest({ ...payload, retryProblems: attempts.at(-1)?.problems })
    let message
    try {
      message = await client.beta.messages.create(request)
    } catch (error) {
      throw Object.assign(toRequestError(error), { usage })
    }
    addUsage(usage, message.usage)
    const { reply, problems } = readReply(message)
    if (reply) {
      return { question: toQuestion(reply, payload.slot.id), attempts: attempt, usage }
    }
    attempts.push({ attempt, problems })
  }

  return {
    flagged: {
      id: payload.slot.id,
      level: payload.slot.level,
      outcome: payload.slot.outcome.code,
      reason: attempts.at(-1).problems.join(' '),
      attempts,
    },
    usage,
  }
}

// ---------- Token counting ----------

// Totals across every attempt for one question, so the hosted version can log what a set really costs.
export const emptyUsage = () => ({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })

export function addUsage(total, u = {}) {
  total.inputTokens += u.input_tokens ?? 0
  total.outputTokens += u.output_tokens ?? 0
  total.cacheWriteTokens += u.cache_creation_input_tokens ?? 0
  total.cacheReadTokens += u.cache_read_input_tokens ?? 0
  return total
}

function toRequestError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return new RequestError(502, `The Claude API rejected the key. Check ${KEY_NAME}.`)
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new RequestError(502, 'The API key is not allowed to use this model.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new RequestError(429, 'The Claude API is busy (rate limit). Wait a minute and try again.')
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new RequestError(502, `The Claude API refused the request: ${error.message}`)
  }
  if (error instanceof Anthropic.APIError) {
    return new RequestError(502, `The Claude API returned an error (${error.status ?? 'no status'}). Try again.`)
  }
  return new RequestError(500, 'Something went wrong on the server.')
}

// ---------- HTTP wrapper shared by the dev server and Lambda ----------

// Takes the raw request body and the key; returns { status, body } for any HTTP host.
export async function handleGenerateHttp(rawBody, apiKey, options = {}) {
  try {
    if (Buffer.byteLength(rawBody ?? '') > MAX_REQUEST_BYTES) {
      throw new RequestError(413, 'The teaching content is too large to send. Remove some files and try again.')
    }
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new RequestError(400, 'The request was not valid JSON.')
    }
    const result = await generateQuestion(payload, { apiKey, ...options })
    return { status: 200, body: result }
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500
    if (!(error instanceof RequestError)) console.error(error)
    return { status, body: { error: error instanceof RequestError ? error.message : 'Something went wrong on the server.' } }
  }
}
