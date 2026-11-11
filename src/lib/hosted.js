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

// { email, credits } for the signed-in user.
export async function fetchAccount() {
  const response = await fetch(`${SERVER_URL}/account`, { headers: await authHeaders() })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Couldn't load your account (${response.status}).`)
  return body
}

// A new ID for each question set. Credits are counted per set.
export const newSetId = () => crypto.randomUUID()
