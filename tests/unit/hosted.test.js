// Phase 1 (hosted): sign-in, credits, the per-set cap and usage logging.
// Runs the real server code against an in-memory store, a fake sign-in checker and a fake Claude.
import { describe, expect, it, vi } from 'vitest'
import { handleHostedRequest } from '../../server/hosted.js'
import { CAP_REACHED, NO_CREDITS, callCap, estimateCost, memoryStore } from '../../server/metering.js'
import { dynamoStore } from '../../server/dynamoStore.js'
import hosted from '../../config/hosted.json'

const goodReply = {
  level: 'Remember',
  knowledgeType: 'Factual',
  outcome: 'LO1',
  stem: 'At what temperature does water boil at sea level?',
  options: [
    { label: 'A', text: '100 °C', isKey: true, misconception: '' },
    { label: 'B', text: '90 °C', isKey: false, misconception: 'Boiling point is lower everywhere' },
    { label: 'C', text: '110 °C', isKey: false, misconception: 'Boiling point is higher everywhere' },
  ],
  sourcePassage: 'notes.pdf: water boils at 100 °C at sea level.',
}
const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000 }
const message = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage })
const good = () => message(JSON.stringify(goodReply))
const bad = () => message('not json')

// A fake Claude that replies with the given messages in turn (repeating the last one).
const fakeClaude = (...replies) => {
  let i = 0
  const create = vi.fn(async () => {
    const r = replies[Math.min(i++, replies.length - 1)]
    if (r instanceof Error) throw r
    return r()
  })
  return { beta: { messages: { create } } }
}

const users = { 'token-amy': { sub: 'user-amy', email: 'amy@uni.ac.uk' }, 'token-bob': { sub: 'user-bob', email: 'bob@uni.ac.uk' } }
const verifyToken = async (t) => {
  if (!users[t]) throw new Error('bad token')
  return users[t]
}

const payload = (setId, n = 1, total = 20) =>
  JSON.stringify({
    setId,
    specification: 'The specification',
    sources: [{ name: 'notes.pdf', text: 'water boils at 100 °C at sea level' }],
    slot: { id: `q${String(n).padStart(2, '0')}`, number: n, level: 'Remember', outcome: { code: 'LO1', text: 'Recall' }, keyPosition: 'A' },
    total,
  })

function setup(claude = fakeClaude(good)) {
  const store = memoryStore()
  const call = (req, token = 'token-amy') =>
    handleHostedRequest(
      { method: 'POST', path: '/', headers: token ? { authorization: `Bearer ${token}` } : {}, ...req },
      { apiKey: 'test-key', store, verifyToken, client: claude },
    )
  const generate = (setId, n, token, total) => call({ rawBody: payload(setId, n, total) }, token)
  const account = (token = 'token-amy') => call({ method: 'GET', path: '/account' }, token)
  return { store, call, generate, account, claude }
}

describe('Sign-in', () => {
  it('turns away a request with no sign-in, before calling Claude', async () => {
    const { generate, claude } = setup()
    const res = await generate('set-00000001', 1, null)
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Please sign in.')
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })

  it('turns away an expired or forged sign-in', async () => {
    const { generate, claude } = setup()
    const res = await generate('set-00000001', 1, 'token-forged')
    expect(res.status).toBe(401)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })

  it('gives a new account the free-trial credits', async () => {
    const { account } = setup()
    const res = await account()
    expect(res).toEqual({ status: 200, body: { email: 'amy@uni.ac.uk', credits: hosted.trialCredits } })
  })
})

describe('Credits', () => {
  it('takes one credit per set, however many questions it has', async () => {
    const { generate, account } = setup()
    for (let n = 1; n <= 5; n++) {
      const res = await generate('set-aaaaaaaa', n)
      expect(res.status).toBe(200)
      expect(res.body.question.stem).toBe(goodReply.stem)
      expect(res.body.credits).toBe(hosted.trialCredits - 1)
    }
    expect((await account()).body.credits).toBe(hosted.trialCredits - 1)
  })

  it('a second set takes a second credit', async () => {
    const { generate } = setup()
    await generate('set-aaaaaaaa', 1)
    const res = await generate('set-bbbbbbbb', 1)
    expect(res.body.credits).toBe(hosted.trialCredits - 2)
  })

  it('never charges a set where every question failed or was flagged', async () => {
    const { generate, account, store } = setup(fakeClaude(bad))
    const res = await generate('set-aaaaaaaa', 1)
    expect(res.status).toBe(200)
    expect(res.body.flagged).toBeTruthy()
    expect((await account()).body.credits).toBe(hosted.trialCredits)
    expect((await store.getSet('user-amy', 'set-aaaaaaaa')).charged).toBe(false)
  })

  it('charges a set only when its first good question arrives', async () => {
    const { generate, account } = setup(fakeClaude(bad, bad, good))
    await generate('set-aaaaaaaa', 1) // flagged after two bad replies
    expect((await account()).body.credits).toBe(hosted.trialCredits)
    await generate('set-aaaaaaaa', 2) // good
    expect((await account()).body.credits).toBe(hosted.trialCredits - 1)
  })

  it('with no credits left, refuses a new set before calling Claude', async () => {
    const { generate, store, claude } = setup()
    for (let i = 0; i < hosted.trialCredits; i++) await generate(`set-0000000${i}`, 1)
    claude.beta.messages.create.mockClear()
    const res = await generate('set-99999999', 1)
    expect(res.status).toBe(402)
    expect(res.body.error).toBe(NO_CREDITS)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
    expect((await store.getAccount('user-amy')).credits).toBe(0)
  })

  it('with no credits left, still finishes and regenerates a set already paid for', async () => {
    const { generate } = setup()
    for (let i = 0; i < hosted.trialCredits; i++) await generate(`set-0000000${i}`, 1)
    const res = await generate('set-00000000', 2)
    expect(res.status).toBe(200)
    expect(res.body.question).toBeTruthy()
  })

  it('parallel requests for the same new set take only one credit', async () => {
    const { generate, account } = setup()
    await Promise.all([1, 2, 3].map((n) => generate('set-aaaaaaaa', n)))
    expect((await account()).body.credits).toBe(hosted.trialCredits - 1)
  })

  it("keeps each user's credits separate", async () => {
    const { generate, account } = setup()
    await generate('set-aaaaaaaa', 1, 'token-amy')
    expect((await account('token-bob')).body.credits).toBe(hosted.trialCredits)
  })

  it('needs a set ID with every question', async () => {
    const { call } = setup()
    const res = await call({ rawBody: JSON.stringify({ ...JSON.parse(payload('x', 1)), setId: undefined }) })
    expect(res.status).toBe(400)
  })
})

describe('The cap on calls per set', () => {
  it(`allows ${hosted.callsPerQuestion} calls per question (first writes plus regenerations), then stops`, async () => {
    const { generate, claude } = setup()
    const total = 2
    for (let i = 0; i < callCap(total); i++) {
      expect((await generate('set-aaaaaaaa', 1, 'token-amy', total)).status).toBe(200)
    }
    claude.beta.messages.create.mockClear()
    const res = await generate('set-aaaaaaaa', 1, 'token-amy', total)
    expect(res.status).toBe(429)
    expect(res.body.error).toBe(CAP_REACHED)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })
})

describe('Usage logging', () => {
  it('logs the tokens of every attempt against the set, and never sends them to the browser', async () => {
    const { generate, store } = setup(fakeClaude(bad, good))
    const res = await generate('set-aaaaaaaa', 1) // one bad reply, one retry
    expect(res.body.usage).toBeUndefined()
    const set = await store.getSet('user-amy', 'set-aaaaaaaa')
    expect(set).toMatchObject({
      calls: 1,
      questions: 1,
      inputTokens: 2000,
      outputTokens: 1000,
      cacheWriteTokens: 400,
      cacheReadTokens: 6000,
      model: expect.any(String),
    })
  })

  it('logs failed calls too', async () => {
    const apiDown = Object.assign(new Error('down'), { status: 500 })
    const { generate, store } = setup(fakeClaude(apiDown))
    const res = await generate('set-aaaaaaaa', 1)
    expect(res.status).toBe(500)
    expect((await store.getSet('user-amy', 'set-aaaaaaaa')).errors).toBe(1)
  })

  it('works out the cost once prices are filled in, and not before', () => {
    const set = { inputTokens: 1e6, outputTokens: 1e6, cacheWriteTokens: 0, cacheReadTokens: 0 }
    expect(estimateCost(set, { input: null })).toBeNull()
    expect(estimateCost(set, { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 })).toBe(12)
  })
})

describe('DynamoDB store', () => {
  const fakeDb = (fail) => {
    const sent = []
    return {
      sent,
      client: {
        send: vi.fn(async (cmd) => {
          sent.push(cmd)
          if (fail) throw fail
          return { Attributes: { calls: 1 }, Item: undefined }
        }),
      },
    }
  }
  const tables = { accountsTable: 'Accounts', setsTable: 'Sets' }

  it('only charges a set that is not already charged, and only if credits are at least 1', async () => {
    const db = fakeDb()
    await dynamoStore({ ...tables, client: db.client }).chargeSet('u', 's')
    const [setUpdate, accountUpdate] = db.sent[0].input.TransactItems.map((t) => t.Update)
    expect(setUpdate.ConditionExpression).toBe('charged = :false')
    expect(accountUpdate.ConditionExpression).toBe('credits >= :one')
    expect(accountUpdate.ExpressionAttributeValues[':minus']).toBe(-1)
  })

  it('reports "already" or "no-credits" from a cancelled transaction', async () => {
    const cancelled = (codes) =>
      Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException', CancellationReasons: codes.map((Code) => ({ Code })) })
    const store1 = dynamoStore({ ...tables, client: fakeDb(cancelled(['ConditionalCheckFailed', 'None'])).client })
    expect(await store1.chargeSet('u', 's')).toBe('already')
    const store2 = dynamoStore({ ...tables, client: fakeDb(cancelled(['None', 'ConditionalCheckFailed'])).client })
    expect(await store2.chargeSet('u', 's')).toBe('no-credits')
  })

  it('returns null when a set is at its cap', async () => {
    const capped = Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' })
    const store = dynamoStore({ ...tables, client: fakeDb(capped).client })
    expect(await store.startCall('u', 's', { total: 20, cap: 60 })).toBeNull()
  })
})
