// Accounts, question credits, codes and usage for the hosted version.
//
// The rules:
//   - Credits are counted in questions, because sets come in different sizes (20, 30 or 40).
//   - A question is charged when it is first written successfully. Regenerating it is included.
//     A question the AI fails to write (flagged or an error) costs nothing.
//   - Each set is capped at callsPerQuestion x its size in Claude calls (first writes plus
//     regenerations), so one set can't be regenerated forever.
//   - In "beta" mode new accounts have no access until they redeem a code; they can join the
//     waiting list instead. In "open" mode new accounts get trialQuestions free.
//   - Tokens are logged per set for every call, charged or not, so real costs can be measured.
//
// The rules live here; the storage is passed in (DynamoDB on AWS, memory in tests).

import { randomInt } from 'node:crypto'
import hosted from '../config/hosted.json' with { type: 'json' }
import prices from '../config/prices.json' with { type: 'json' }
import { RequestError } from './generate.js'
import { markPayhipKeyUsed, purchaseId, verifyPayhipKey } from './payhip.js'

export const callCap = (total) => Math.ceil(Math.max(1, total) * hosted.callsPerQuestion)

export const NO_ACCESS = "This account doesn't have access yet. Enter a code, or join the waiting list."
export const NO_QUESTIONS = "You've no questions left on your account. Redeem a code to add more."
export const CAP_REACHED =
  'This set has used all its question writes and regenerations. Start a new set to keep going.'

// ---------- Accounts ----------

// Fields a brand-new account starts with.
export const newAccountFields = (mode = hosted.mode) =>
  mode === 'open' ? { questions: hosted.trialQuestions, access: true } : { questions: 0, access: false }

// Accounts made before credits were counted in questions had "credits" (1 per set of up to 20).
// They are converted the first time they're read, and keep their access.
export function migrationFor(account) {
  if (!account || account.questions !== undefined) return null
  return { questions: (account.credits ?? 0) * 20, access: true }
}

export async function ensureAccount(store, { userId, email }) {
  const account = await store.getOrCreateAccount(userId, { email, ...newAccountFields() })
  const change = migrationFor(account)
  if (!change) return account
  await store.updateAccount(userId, change)
  return { ...account, ...change }
}

export function accountView(account, { isAdmin = false } = {}) {
  return {
    email: account.email,
    questions: account.questions ?? 0,
    access: Boolean(account.access) || isAdmin,
    waitlisted: Boolean(account.waitlisted),
    profileDone: Boolean(account.profile),
    isAdmin,
    mode: hosted.mode,
  }
}

// ---------- Generating ----------

// Before calling Claude: the user has access, can pay for this question (unless it's already paid
// for) and the set is under its cap. Counts the call.
export async function beforeCall(store, { userId, email, setId, slotId, total, isAdmin = false }) {
  const account = await ensureAccount(store, { userId, email })
  if (!account.access && !isAdmin) throw new RequestError(403, NO_ACCESS)
  const existing = await store.getSet(userId, setId)
  const paid = existing?.chargedSlots?.includes(slotId)
  if (!paid && (account.questions ?? 0) < 1) throw new RequestError(402, NO_QUESTIONS)
  const set = await store.startCall(userId, setId, { total, cap: callCap(total) })
  if (!set) throw new RequestError(429, CAP_REACHED)
  return { account, set }
}

// After calling Claude: log the tokens and, the first time this question is written, charge it.
// outcome is 'question', 'flagged' or 'error'. Returns the questions left.
export async function afterCall(store, { userId, setId, slotId, outcome, usage, model }) {
  await store.recordUsage(userId, setId, { outcome, usage, model })
  if (outcome === 'question') {
    const result = await store.chargeQuestion(userId, setId, slotId)
    if (result === 'no-credits') throw new RequestError(402, NO_QUESTIONS)
  }
  return (await store.getAccount(userId))?.questions ?? 0
}

// ---------- Codes and the waiting list ----------

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I/L, which get misread
export const normaliseCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function makeCode() {
  const pick = () => Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('')
  return `QTC-${pick()}-${pick()}`
}

export async function createCodes(store, { count, questions = hosted.betaCodeQuestions, createdBy }) {
  const n = Math.min(50, Math.max(1, Number.parseInt(count, 10) || 1))
  const now = new Date().toISOString()
  const codes = Array.from({ length: n }, () => ({ code: normaliseCode(makeCode()), display: null, questions, kind: 'beta', createdBy, createdAt: now }))
  for (const c of codes) c.display = `QTC-${c.code.slice(3, 7)}-${c.code.slice(7)}`
  await store.putCodes(codes)
  return codes
}

// A QTC code (made on the admin page) looks like QTC-ABCD-2345.
const isQtcCode = (normalised) => /^QTC[A-Z0-9]{8}$/.test(normalised)

// Redeems either kind of code: a QTC code from the admin page, or a Payhip licence key from a
// pack purchase (when payhip is passed in). Returns the account plus { added: { questions, pack } }.
export async function redeemCode(store, { userId, email, code }, { payhip } = {}) {
  const before = await ensureAccount(store, { userId, email })
  const key = normaliseCode(code)
  if (key.length < 6) throw new RequestError(400, 'Enter the code exactly as you received it.')
  if (isQtcCode(key) || !payhip) {
    const result = await store.redeemCode(key, userId)
    if (result === 'unknown') throw new RequestError(404, "That code wasn't recognised. Check it and try again.")
    if (result === 'used') throw new RequestError(409, 'That code has already been used.')
    const account = await store.getAccount(userId)
    return { ...account, added: { questions: (account.questions ?? 0) - (before.questions ?? 0), pack: null } }
  }
  return redeemPurchase(store, { userId, licence: String(code).trim() }, payhip)
}

async function redeemPurchase(store, { userId, licence }, { products, fetchImpl }) {
  const found = await verifyPayhipKey(licence, { products, fetchImpl })
  if (!found) {
    throw new RequestError(404, "That code wasn't recognised. Check it against your Payhip receipt and try again.")
  }
  if (!found.enabled) {
    throw new RequestError(409, 'That key has been switched off, usually because the purchase was refunded.')
  }
  const { product } = found
  const now = new Date().toISOString()
  const result = await store.claimPurchase(
    {
      code: purchaseId(licence),
      display: `Payhip ${product.name} ····${licence.slice(-4).toUpperCase()}`,
      kind: 'payhip',
      pack: product.id,
      questions: product.questions,
      createdAt: now,
    },
    userId,
  )
  if (result === 'used') throw new RequestError(409, 'That key has already been used.')
  await markPayhipKeyUsed(licence, product, { fetchImpl })
  const account = await store.getAccount(userId)
  return { ...account, added: { questions: product.questions, pack: product.name } }
}

// ---------- About the user (optional sign-up questions) ----------

export const PAPERS_PER_YEAR = ['1-2', '3-5', '6-10', '10+']
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)

// Saves the answers to "How many papers do you write a year?", country and subject.
// skip: true records that they chose not to answer, so they aren't asked again.
export async function saveProfile(store, { userId, email }, answers = {}) {
  await ensureAccount(store, { userId, email })
  const profile = answers.skip
    ? { skipped: true }
    : {
        papersPerYear: PAPERS_PER_YEAR.includes(answers.papersPerYear) ? answers.papersPerYear : '',
        country: cleanText(answers.country, 60),
        subject: cleanText(answers.subject, 80),
      }
  await store.updateAccount(userId, { profile: { ...profile, answeredAt: new Date().toISOString() } })
  return store.getAccount(userId)
}

export async function joinWaitlist(store, { userId, email }) {
  await ensureAccount(store, { userId, email })
  await store.updateAccount(userId, { waitlisted: true, waitlistedAt: new Date().toISOString() })
  return store.getAccount(userId)
}

// ---------- Cost and the admin page ----------

// Cost of a set in dollars, from its token counts and the prices for its model.
export function estimateCost(set, table = prices) {
  const p = table[set.model]
  if (!p) return null
  return (
    ((set.inputTokens ?? 0) * p.input +
      (set.outputTokens ?? 0) * p.output +
      (set.cacheWriteTokens ?? 0) * p.cacheWrite +
      (set.cacheReadTokens ?? 0) * p.cacheRead) /
    1e6
  )
}

export async function adminUsage(store) {
  const [accounts, sets] = await Promise.all([store.scanAccounts(), store.scanSets()])
  const byUser = new Map(accounts.map((a) => [a.userId, { ...a, sets: [] }]))
  for (const s of sets) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, { userId: s.userId, sets: [] })
    byUser.get(s.userId).sets.push(s)
  }
  const users = [...byUser.values()].map((a) => {
    const written = a.sets.reduce((n, s) => n + (s.questions ?? 0), 0)
    const charged = a.sets.reduce((n, s) => n + (s.chargedSlots?.length ?? 0), 0)
    const calls = a.sets.reduce((n, s) => n + (s.calls ?? 0), 0)
    const cost = a.sets.reduce((n, s) => n + (estimateCost(s) ?? 0), 0)
    const lastActive = [a.createdAt, ...a.sets.map((s) => s.updatedAt ?? s.createdAt)].filter(Boolean).sort().at(-1) ?? null
    return {
      email: a.email ?? '(unknown)',
      access: Boolean(a.access) || a.questions === undefined,
      waitlisted: Boolean(a.waitlisted),
      questionsLeft: a.questions ?? (a.credits ?? 0) * 20,
      sets: a.sets.length,
      questionsCharged: charged,
      questionsWritten: written,
      regenerations: Math.max(0, written - charged),
      calls,
      cost,
      costPerQuestion: charged ? cost / charged : null,
      createdAt: a.createdAt ?? null,
      lastActive,
      papersPerYear: a.profile?.papersPerYear ?? '',
      country: a.profile?.country ?? '',
      subject: a.profile?.subject ?? '',
    }
  })
  users.sort((x, y) => String(y.lastActive).localeCompare(String(x.lastActive)))
  const totals = {
    users: users.filter((u) => u.access).length,
    waitlisted: users.filter((u) => u.waitlisted && !u.access).length,
    sets: users.reduce((n, u) => n + u.sets, 0),
    questionsCharged: users.reduce((n, u) => n + u.questionsCharged, 0),
    cost: users.reduce((n, u) => n + u.cost, 0),
  }
  totals.costPerQuestion = totals.questionsCharged ? totals.cost / totals.questionsCharged : null
  const waitlist = users
    .filter((u) => u.waitlisted && !u.access)
    .map((u) => ({ email: u.email, since: u.createdAt, papersPerYear: u.papersPerYear, country: u.country, subject: u.subject }))
  return { totals, users, waitlist }
}

// ---------- In-memory store, for tests and laptop experiments ----------
// Behaves like the DynamoDB store, including the "only once" conditions.
export function memoryStore() {
  const accounts = new Map()
  const sets = new Map()
  const codes = new Map()
  const key = (u, s) => `${u}#${s}`
  const tokenFields = ['inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens']
  const copy = (x) => (x ? structuredClone(x) : null)
  return {
    accounts,
    sets,
    codes,
    async getAccount(userId) {
      return copy(accounts.get(userId))
    },
    async getOrCreateAccount(userId, fields) {
      if (!accounts.has(userId)) accounts.set(userId, { userId, ...fields, createdAt: new Date().toISOString() })
      return copy(accounts.get(userId))
    },
    async updateAccount(userId, fields) {
      Object.assign(accounts.get(userId), fields)
    },
    async getSet(userId, setId) {
      return copy(sets.get(key(userId, setId)))
    },
    async startCall(userId, setId, { total, cap }) {
      const k = key(userId, setId)
      const s = sets.get(k) ?? {
        userId, setId, total, calls: 0, questions: 0, flagged: 0, errors: 0, chargedSlots: [],
        ...Object.fromEntries(tokenFields.map((f) => [f, 0])), createdAt: new Date().toISOString(),
      }
      if (s.calls >= cap) return null
      s.calls += 1
      sets.set(k, s)
      return copy(s)
    },
    async recordUsage(userId, setId, { outcome, usage = {}, model }) {
      const s = sets.get(key(userId, setId))
      if (!s) return
      for (const f of tokenFields) s[f] += usage[f] ?? 0
      if (outcome === 'question') s.questions += 1
      if (outcome === 'flagged') s.flagged += 1
      if (outcome === 'error') s.errors += 1
      if (model) s.model = model
      s.updatedAt = new Date().toISOString()
    },
    async chargeQuestion(userId, setId, slotId) {
      const s = sets.get(key(userId, setId))
      if (s.chargedSlots.includes(slotId)) return 'already'
      const a = accounts.get(userId)
      if ((a.questions ?? 0) < 1) return 'no-credits'
      a.questions -= 1
      s.chargedSlots.push(slotId)
      return 'charged'
    },
    async putCodes(list) {
      for (const c of list) codes.set(c.code, { ...c })
    },
    async listCodes() {
      return [...codes.values()].map(copy)
    },
    async redeemCode(code, userId) {
      const c = codes.get(code)
      if (!c) return 'unknown'
      if (c.redeemedBy) return 'used'
      c.redeemedBy = userId
      c.redeemedAt = new Date().toISOString()
      const a = accounts.get(userId)
      a.questions = (a.questions ?? 0) + c.questions
      a.access = true
      return 'redeemed'
    },
    async claimPurchase(item, userId) {
      if (codes.has(item.code)) return 'used'
      codes.set(item.code, { ...item, redeemedBy: userId, redeemedAt: new Date().toISOString() })
      const a = accounts.get(userId)
      a.questions = (a.questions ?? 0) + item.questions
      a.access = true
      return 'redeemed'
    },
    async scanAccounts() {
      return [...accounts.values()].map(copy)
    },
    async scanSets() {
      return [...sets.values()].map(copy)
    },
  }
}
