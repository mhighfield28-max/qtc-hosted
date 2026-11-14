// Hosted mode: sign-in and credits. Switched on when the app is built with an Amplify backend
// (amplify_outputs.json exists and includes sign-in). On a laptop with no backend the app runs
// as the course build does: no sign-in, and the local server function at /api/generate.

import { Amplify } from 'aws-amplify'
import { fetchAuthSession } from 'aws-amplify/auth'

// import.meta.glob returns nothing if the file is missing, instead of breaking the build.
const found = import.meta.glob('/amplify_outputs.json', { eager: true, import: 'default' })
export const outputs = Object.values(found)[0] ?? null

export const HOSTED = Boolean(outputs?.auth)
if (HOSTED) Amplify.configure(outputs)

// The server function's address: from the backend in hosted mode, else the laptop dev server.
export const SERVER_URL = (outputs?.custom?.generateUrl ?? import.meta.env.VITE_GENERATE_URL ?? '/api/generate').replace(/\/$/, '')

// Headers that prove who the user is. Empty on a laptop.
export async function authHeaders() {
  if (!HOSTED) return {}
  const token = (await fetchAuthSession()).tokens?.idToken?.toString()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Calls the server function. Returns the reply, or throws an Error with the server's plain-English message.
async function api(method, path, body) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const reply = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(reply.error || `Something went wrong (${response.status}). Try again.`)
  return reply
}

// The signed-in user's account: { email, questions, access, waitlisted, isAdmin, mode }.
export const fetchAccount = () => api('GET', '/account')
export const redeemCode = (code) => api('POST', '/redeem', { code })
export const joinWaitlist = () => api('POST', '/waitlist', {})
// Optional sign-up questions: papers a year, country and subject. { skip: true } to decline.
export const saveProfile = (answers) => api('POST', '/profile', answers)

// The owner's admin page.
export const fetchUsage = () => api('GET', '/admin/usage')
export const fetchCodes = () => api('GET', '/admin/codes')
export const makeCodes = (count) => api('POST', '/admin/codes', { count })

// A new ID for each question set.
export const newSetId = () => crypto.randomUUID()
