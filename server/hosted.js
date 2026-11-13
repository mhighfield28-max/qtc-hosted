// The hosted server function. Wraps the course build's generateQuestion with the hosted jobs:
// sign-in, access, question credits, codes, the waiting list, usage logging and the admin page.
//
// Routes (all need a signed-in user):
//   GET  /account       -> { email, questions, access, waitlisted, isAdmin, mode }
//   POST /redeem        { code } -> the account, with the code's questions added
//   POST /waitlist      -> the account, marked as waiting
//   POST /              one question, as in the course build, plus { questions } left
//   GET  /admin/usage   (admins only) -> totals, each user's usage and the waiting list
//   GET  /admin/codes   (admins only) -> every code and whether it's been used
//   POST /admin/codes   (admins only) { count } -> new single-use beta codes
//
// Admins are the verified email addresses in ADMIN_EMAILS (an Amplify environment variable).
// Everything AWS-specific (the token checker, the database, the Claude client) is passed in,
// so this file can be tested without AWS.

import settings from '../config/settings.json' with { type: 'json' }
import hosted from '../config/hosted.json' with { type: 'json' }
import { MAX_REQUEST_BYTES, RequestError, generateQuestion } from './generate.js'
import {
  accountView,
  adminUsage,
  afterCall,
  beforeCall,
  createCodes,
  ensureAccount,
  joinWaitlist,
  redeemCode,
} from './metering.js'
import { formatWords, totalWords } from '../src/lib/words.js'

const SET_ID = /^[A-Za-z0-9-]{8,64}$/

export async function handleHostedRequest(
  { method, path, headers = {}, rawBody },
  { apiKey, store, verifyToken, client = undefined, adminEmails = /** @type {string[]} */ ([]) },
) {
  try {
    const user = await signedInUser(headers, verifyToken)
    const isAdmin = user.emailVerified && adminEmails.map((e) => e.trim().toLowerCase()).includes(user.email?.toLowerCase())
    const route = `${method} ${path.replace(/\/+$/, '') || '/'}`

    if (route === 'GET /account') return ok(accountView(await ensureAccount(store, user), { isAdmin }))
    if (route === 'POST /redeem') {
      const { code } = parseBody(rawBody)
      return ok(accountView(await redeemCode(store, { ...user, code }), { isAdmin }))
    }
    if (route === 'POST /waitlist') return ok(accountView(await joinWaitlist(store, user), { isAdmin }))

    if (path.startsWith('/admin')) {
      if (!isAdmin) throw new RequestError(403, 'Only the site owner can open this page.')
      if (route === 'GET /admin/usage') return ok(await adminUsage(store))
      if (route === 'GET /admin/codes') {
        const codes = await store.listCodes()
        codes.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        return ok({ codes: codes.map(({ display, code, questions, createdAt, redeemedAt }) => ({ code: display ?? code, questions, createdAt, used: Boolean(redeemedAt), redeemedAt: redeemedAt ?? null })) })
      }
      if (route === 'POST /admin/codes') {
        const { count } = parseBody(rawBody)
        const codes = await createCodes(store, { count, createdBy: user.email })
        return ok({ codes: codes.map((c) => ({ code: c.display, questions: c.questions })) })
      }
      throw new RequestError(404, 'Not found.')
    }

    if (route !== 'POST /') throw new RequestError(405, 'Not allowed.')
    return ok(await generate(rawBody, user, { apiKey, store, client, isAdmin }))
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500
    if (!(error instanceof RequestError)) console.error(error)
    return { status, body: { error: error instanceof RequestError ? error.message : 'Something went wrong on the server.' } }
  }
}

async function generate(rawBody, user, { apiKey, store, client, isAdmin }) {
  if (Buffer.byteLength(rawBody ?? '') > MAX_REQUEST_BYTES) {
    throw new RequestError(413, 'The teaching content is too large to send. Remove some files and try again.')
  }
  const payload = parseBody(rawBody)
  if (typeof payload?.setId !== 'string' || !SET_ID.test(payload.setId)) {
    throw new RequestError(400, 'The request did not say which question set it belongs to. Reload the page and try again.')
  }
  const slotId = payload.slot?.id
  if (typeof slotId !== 'string' || !/^q\d{2}$/.test(slotId)) {
    throw new RequestError(400, 'The request did not say which question to write.')
  }
  if (Array.isArray(payload.sources)) {
    const words = totalWords(payload.sources.map((s) => ({ text: s?.text })))
    // A little leeway, so rounding in the browser's count never blocks a set it showed as within the limit.
    if (words > hosted.maxWordsPerSet * 1.02) {
      throw new RequestError(413, `The teaching material is ${formatWords(words)} words; one set can use up to ${formatWords(hosted.maxWordsPerSet)}. Remove some files and try again.`)
    }
  }
  const total = Number.isInteger(payload.total) && payload.total > 0 && payload.total <= 40 ? payload.total : 40
  const ids = { userId: user.userId, email: user.email, setId: payload.setId, slotId }

  await beforeCall(store, { ...ids, total, isAdmin })

  let result
  try {
    result = await generateQuestion(payload, { apiKey, client })
  } catch (error) {
    await afterCall(store, { ...ids, outcome: 'error', usage: error.usage, model: settings.model })
    throw error
  }
  const outcome = result.question ? 'question' : 'flagged'
  const questions = await afterCall(store, { ...ids, outcome, usage: result.usage, model: settings.model })
  const { usage, ...forBrowser } = result
  return { ...forBrowser, questions }
}

function parseBody(rawBody) {
  try {
    return JSON.parse(rawBody || '{}')
  } catch {
    throw new RequestError(400, 'The request was not valid JSON.')
  }
}

async function signedInUser(headers, verifyToken) {
  const header = headers.authorization ?? headers.Authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new RequestError(401, 'Please sign in.')
  let claims
  try {
    claims = await verifyToken(token)
  } catch {
    throw new RequestError(401, 'Your sign-in has expired. Please sign in again.')
  }
  return { userId: claims.sub, email: claims.email, emailVerified: claims.email_verified === true || claims.email_verified === 'true' }
}

const ok = (body) => ({ status: 200, body })
