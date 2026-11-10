// Credits and usage for the hosted version.
//
// One credit buys one question set. A set is identified by a setId the browser makes when the
// user presses Generate. The rules:
//   - New accounts start with the free-trial credits in config/hosted.json.
//   - A credit is taken when the first question of a set comes back successfully. A set where
//     every call failed or was flagged is never charged, so failed runs cost the user nothing.
//   - Every call to Claude (first writes, retries and regenerations) counts against a cap per set:
//     callsPerQuestion x the number of questions. This stops one paid set being reused forever.
//   - Tokens are logged per set, for every call, charged or not, so real costs can be measured.
//
// The rules live here; the storage is passed in (DynamoDB on AWS, memory in tests).

import hosted from '../config/hosted.json' with { type: 'json' }
import { RequestError } from './generate.js'

export const callCap = (total) => Math.max(1, total) * hosted.callsPerQuestion

export const NO_CREDITS = "You've no question sets left on your account."
export const CAP_REACHED =
  'This set has used all its question writes and regenerations. Start a new set to keep going.'

// A user's account, made with the free-trial credits the first time they're seen.
export const ensureAccount = (store, { userId, email }) =>
  store.getOrCreateAccount(userId, { email, trialCredits: hosted.trialCredits })

// Before calling Claude: make sure the account exists, the user can pay for this set and the
// set is under its cap. Counts the call. Returns { account, set }.
export async function beforeCall(store, { userId, email, setId, total }) {
  const account = await ensureAccount(store, { userId, email })
  const existing = await store.getSet(userId, setId)
  if (!existing?.charged && account.credits < 1) throw new RequestError(402, NO_CREDITS)
  const set = await store.startCall(userId, setId, { total, cap: callCap(total) })
  if (!set) throw new RequestError(429, CAP_REACHED)
  return { account, set }
}

// After calling Claude: log the tokens and, the first time a set produces a question, take the credit.
// outcome is 'question', 'flagged' or 'error'. Returns the credits left.
export async function afterCall(store, { userId, setId, outcome, usage, model }) {
  await store.recordUsage(userId, setId, { outcome, usage, model })
  if (outcome === 'question') {
    const result = await store.chargeSet(userId, setId)
    if (result === 'no-credits') throw new RequestError(402, NO_CREDITS)
  }
  return (await store.getAccount(userId))?.credits ?? 0
}

// Cost of a set in dollars, from the token counts and the prices in config/hosted.json.
// Returns null until the prices are filled in.
export function estimateCost(set, prices = hosted.pricesPerMillionTokens) {
  const keys = ['input', 'output', 'cacheWrite', 'cacheRead']
  if (keys.some((k) => typeof prices?.[k] !== 'number')) return null
  const perToken = (k) => prices[k] / 1e6
  return (
    (set.inputTokens ?? 0) * perToken('input') +
    (set.outputTokens ?? 0) * perToken('output') +
    (set.cacheWriteTokens ?? 0) * perToken('cacheWrite') +
    (set.cacheReadTokens ?? 0) * perToken('cacheRead')
  )
}

// ---------- In-memory store, for tests and laptop experiments ----------
// Behaves like the DynamoDB store, including the "only once" conditions.
export function memoryStore() {
  const accounts = new Map()
  const sets = new Map()
  const key = (u, s) => `${u}#${s}`
  const tokenFields = ['inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']
  return {
    accounts,
    sets,
    async getAccount(userId) {
      return accounts.get(userId) ? { ...accounts.get(userId) } : null
    },
    async getOrCreateAccount(userId, { email, trialCredits }) {
      if (!accounts.has(userId)) {
        accounts.set(userId, { userId, email, credits: trialCredits, createdAt: new Date().toISOString() })
      }
      return { ...accounts.get(userId) }
    },
    async getSet(userId, setId) {
      const s = sets.get(key(userId, setId))
      return s ? { ...s } : null
    },
    async startCall(userId, setId, { total, cap }) {
      const k = key(userId, setId)
      const s = sets.get(k) ?? {
        userId, setId, total, calls: 0, questions: 0, flagged: 0, errors: 0, charged: false,
        ...Object.fromEntries(tokenFields.map((f) => [f, 0])), createdAt: new Date().toISOString(),
      }
      if (s.calls >= cap) return null
      s.calls += 1
      sets.set(k, s)
      return { ...s }
    },
    async recordUsage(userId, setId, { outcome, usage = {}, model }) {
      const s = sets.get(key(userId, setId))
      if (!s) return
      for (const f of tokenFields) s[f] += usage[f] ?? 0
      if (outcome === 'question') s.questions += 1
      if (outcome === 'flagged') s.flagged += 1
      if (outcome === 'error') s.errors += 1
      if (model) s.model = model
    },
    async chargeSet(userId, setId) {
      const s = sets.get(key(userId, setId))
      if (s.charged) return 'already'
      const a = accounts.get(userId)
      if (a.credits < 1) return 'no-credits'
      a.credits -= 1
      s.charged = true
      s.chargedAt = new Date().toISOString()
      return 'charged'
    },
  }
}
