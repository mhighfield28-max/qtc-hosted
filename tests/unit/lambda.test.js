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

const event = (body, method = 'POST', base64 = false) => ({
  requestContext: { http: { method } },
  isBase64Encoded: base64,
  body: base64 ? Buffer.from(body).toString('base64') : body,
})

describe('the Amplify Lambda', () => {
  it('bundles into one file with the Claude SDK, the shared server code and the settings', () => {
    expect(bundle).toContain('server-side-fallback-2026-07-01')
    expect(bundle).toContain('claude-opus-5-5')
    expect(bundle).toContain('Write question')
  })

  it('only accepts POST', async () => {
    expect((await handler(event('', 'GET'))).statusCode).toBe(405)
  })

  it('reads the key from the MCQ_CLAUDE_KEY secret, and says so when it is missing', async () => {
    delete process.env.MCQ_CLAUDE_KEY
    const payload = JSON.stringify({
      specification: 'spec',
      sources: [{ name: 'a.txt', text: 'x' }],
      slot: { id: 'q01', number: 1, level: 'Remember', outcome: { code: 'LO1', text: 't' }, keyPosition: 'A' },
      total: 20,
    })
    const res = await handler(event(payload, 'POST', true))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toContain('MCQ_CLAUDE_KEY')
  })

  it('returns plain-English errors for bad requests', async () => {
    const res = await handler(event('{"specification": ""}'))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toEqual({ error: 'The request had no specification.' })
  })
})
