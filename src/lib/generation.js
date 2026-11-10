// Browser side of generation. Sends one request per question to the server function,
// a few at a time, and reports each result as it arrives. No API key here: the server holds it.

import settings from '../../config/settings.json'

// On a laptop the server function is at /api/generate (see vite.config.js).
// On Amplify the build sets VITE_GENERATE_URL to the Lambda's address.
export const GENERATE_URL = import.meta.env.VITE_GENERATE_URL || '/api/generate'
export const MAX_CONTENT_BYTES = 4 * 1024 * 1024

export class GenerationError extends Error {}

export async function requestQuestion(payload, { signal } = {}) {
  let response
  try {
    response = await fetch(GENERATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new GenerationError("Couldn't reach the server. Check the app is running and you're online.")
  }
  let body
  try {
    body = await response.json()
  } catch {
    throw new GenerationError(`The server replied with an error (${response.status}).`)
  }
  if (!response.ok) throw new GenerationError(body.error || `The server replied with an error (${response.status}).`)
  return body
}

export function contentSize(sources) {
  return new Blob([JSON.stringify(sources)]).size
}

// Writes every slot not yet done. Calls onResult(slot, result) as each question arrives
// ({ question } or { flagged }). Stops at the first server error and throws it.
export async function runGeneration({ specification, sources, slots, total, existingStems, onResult, signal }) {
  const queue = [...slots]
  const stems = [...existingStems]
  let failure = null

  async function worker() {
    while (queue.length && !failure && !signal?.aborted) {
      const slot = queue.shift()
      try {
        const result = await requestQuestion(
          { specification, sources, slot, total, previousStems: [...stems] },
          { signal },
        )
        if (result.question) stems.push(result.question.stem)
        onResult(slot, result)
      } catch (error) {
        if (error.name !== 'AbortError') failure = failure ?? error
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, settings.parallelQuestions || 1) }, worker)
  await Promise.all(workers)
  if (failure) throw failure
}
