// Packages the Amplify Lambda the way Amplify does (esbuild, Node, one file), then calls it
// with Function URL events, to show the same server function runs as a Lambda.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { beforeAll, describe, expect, it } from 'vitest'

let handler
let bundle
beforeAll(async () => {
  const outfile = join(mkdtempSync(join(tmpdir(), 'mcq-lambda-')), 'index.mjs')
  await build({
    entryPoints: ['amplify/functions/generate/handler.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    outfile,
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
    logLevel: 'silent',
  })
  bundle = readFileSync(outfile, 'utf8')
  ;({ handler } = await import(pathToFileURL(outfile).href))
}, 60000)

const event = (body, method = 'POST', { base64 = false, token, path = '/' } = {}) => ({
  requestContext: { http: { method } },
  rawPath: path,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  isBase64Encoded: base64,
  body: base64 ? Buffer.from(body).toString('base64') : body,
})

const payload = JSON.stringify({
  setId: 'set-00000001',
  specification: 'spec',
  sources: [{ name: 'a.txt', text: 'x' }],
  slot: { id: 'q01', number: 1, level: 'Remember', outcome: { code: 'LO1', text: 't' }, keyPosition: 'A' },
  total: 20,
})

describe('the Amplify Lambda (hosted)', () => {
  it('bundles into one file with the Claude SDK, the sign-in checker, the database client and the shared server code', () => {
    expect(bundle).toContain('server-side-fallback-2026-07-01')
    expect(bundle).toContain('claude-opus-5-5')
    expect(bundle).toContain('Write question')
    expect(bundle).toContain('CognitoJwtVerifier')
    expect(bundle).toContain('TransactWriteItems')
  })

  it('says so plainly if the deploy did not give it its sign-in and database settings', async () => {
    for (const k of ['USER_POOL_ID', 'USER_POOL_CLIENT_ID', 'ACCOUNTS_TABLE', 'SETS_TABLE']) delete process.env[k]
    const res = await handler(event(payload))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toContain('not set up correctly')
  })

  describe('once set up', () => {
    beforeAll(() => {
      Object.assign(process.env, {
        USER_POOL_ID: 'eu-west-2_TestPool1',
        USER_POOL_CLIENT_ID: 'testclientid123',
        ACCOUNTS_TABLE: 'Accounts',
        SETS_TABLE: 'Sets',
      })
    })

    it('turns away a request with no sign-in', async () => {
      const res = await handler(event(payload, 'POST', { base64: true }))
      expect(res.statusCode).toBe(401)
      expect(JSON.parse(res.body)).toEqual({ error: 'Please sign in.' })
    })

    it('turns away a forged sign-in token', async () => {
      const res = await handler(event(payload, 'POST', { token: 'not-a-real-token' }))
      expect(res.statusCode).toBe(401)
    })

    it('turns away the account page without sign-in', async () => {
      const res = await handler(event('', 'GET', { path: '/account' }))
      expect(res.statusCode).toBe(401)
    })
  })
})
