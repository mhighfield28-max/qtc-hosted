// The hosted server function. Wraps the course build's generateQuestion with three extra jobs:
//   1. Check the user is signed in (a Cognito ID token in the Authorization header).
//   2. Check and take credits, and cap calls per set (server/metering.js).
//   3. Log the tokens every call uses.
//
// Routes:
//   GET  /account  -> { email, credits }
//   POST /         -> one question, as in the course build, plus { credits } left
//
// Everything AWS-specific (the token checker, the database, the Claude client) is passed in,
// so this file can be tested without AWS.

import settings from '../config/settings.json' with { type: 'json' }
import { MAX_REQUEST_BYTES, RequestError, generateQuestion } from './generate.js'
import { afterCall, beforeCall, ensureAccount } from './metering.js'

const SET_ID = /^[A-Za-z0-9-]{8,64}$/

export async function handleHostedRequest({ method, path, headers = {}, rawBody }, { apiKey, store, verifyToken, client = undefined }) {
  try {
    const user = await signedInUser(headers, verifyToken)

    if (method === 'GET' && path === '/account') {
      const account = await ensureAccount(store, user)
      return ok({ email: account.email ?? user.email, credits: account.credits })
    }
    if (method !== 'POST') throw new RequestError(405, 'Not allowed.')

    if (Buffer.byteLength(rawBody ?? '') > MAX_REQUEST_BYTES) {
      throw new RequestError(413, 'The teaching content is too large to send. Remove some files and try again.')
    }
    let payload
    try {
      payload = JSON.parse(rawBody)
    } catch {
      throw new RequestError(400, 'The request was not valid JSON.')
    }
    if (typeof payload?.setId !== 'string' || !SET_ID.test(payload.setId)) {
      throw new RequestError(400, 'The request did not say which question set it belongs to. Reload the page and try again.')
    }
    const total = Number.isInteger(payload.total) && payload.total > 0 && payload.total <= 40 ? payload.total : 40
    const ids = { userId: user.userId, email: user.email, setId: payload.setId }

    await beforeCall(store, { ...ids, total })

    let result
    try {
      result = await generateQuestion(payload, { apiKey, client })
    } catch (error) {
      await afterCall(store, { ...ids, outcome: 'error', usage: error.usage, model: settings.model })
      throw error
    }
    const outcome = result.question ? 'question' : 'flagged'
    const credits = await afterCall(store, { ...ids, outcome, usage: result.usage, model: settings.model })
    const { usage, ...forBrowser } = result
    return ok({ ...forBrowser, credits })
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500
    if (!(error instanceof RequestError)) console.error(error)
    return { status, body: { error: error instanceof RequestError ? error.message : 'Something went wrong on the server.' } }
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
  return { userId: claims.sub, email: claims.email }
}

const ok = (body) => ({ status: 200, body })
