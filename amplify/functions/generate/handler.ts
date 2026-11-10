// Lambda entry point. All the work is done by the same code the laptop uses (server/generate.js).
import { handleGenerateHttp } from '../../../server/generate.js'

type FunctionUrlEvent = {
  body?: string
  isBase64Encoded?: boolean
  requestContext?: { http?: { method?: string } }
}

export const handler = async (event: FunctionUrlEvent) => {
  if (event.requestContext?.http?.method !== 'POST') {
    return { statusCode: 405, body: '' }
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '')
  const { status, body } = await handleGenerateHttp(raw, process.env.MCQ_CLAUDE_KEY)
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}
