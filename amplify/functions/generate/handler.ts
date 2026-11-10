// Lambda entry point for the hosted version. The work is done by server/hosted.js; this file
// only connects it to AWS: the sign-in checker, the database and the Function URL event.
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { handleHostedRequest } from '../../../server/hosted.js'
import { dynamoStore } from '../../../server/dynamoStore.js'

type FunctionUrlEvent = {
  body?: string
  isBase64Encoded?: boolean
  rawPath?: string
  headers?: Record<string, string>
  requestContext?: { http?: { method?: string } }
}

// Made once per Lambda container and reused across requests.
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined
let store: ReturnType<typeof dynamoStore> | undefined

function setup() {
  const { USER_POOL_ID, USER_POOL_CLIENT_ID, ACCOUNTS_TABLE, SETS_TABLE } = process.env
  if (!USER_POOL_ID || !USER_POOL_CLIENT_ID || !ACCOUNTS_TABLE || !SETS_TABLE) {
    throw new Error('The server function is missing its sign-in or database settings.')
  }
  verifier ??= CognitoJwtVerifier.create({ userPoolId: USER_POOL_ID, clientId: USER_POOL_CLIENT_ID, tokenUse: 'id' })
  store ??= dynamoStore({ accountsTable: ACCOUNTS_TABLE, setsTable: SETS_TABLE })
  return { verifier, store }
}

export const handler = async (event: FunctionUrlEvent) => {
  let deps
  try {
    deps = setup()
  } catch (error) {
    console.error(error)
    return json(500, { error: 'The server is not set up correctly. Check the Amplify deploy finished.' })
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : (event.body ?? '')
  const { status, body } = await handleHostedRequest(
    {
      method: event.requestContext?.http?.method ?? '',
      path: event.rawPath ?? '/',
      headers: event.headers ?? {},
      rawBody: raw,
    },
    {
      apiKey: process.env.MCQ_CLAUDE_KEY,
      store: deps.store,
      verifyToken: (token: string) => deps.verifier.verify(token),
    },
  )
  return json(status, body)
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
