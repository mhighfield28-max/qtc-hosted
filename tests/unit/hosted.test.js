// The hosted server: sign-in, beta access and codes, question credits, the per-set cap,
// the word limit, usage logging and the admin page.
// Runs the real server code against an in-memory store, a fake sign-in checker and a fake Claude.
import { describe, expect, it, vi } from 'vitest'
import { handleHostedRequest } from '../../server/hosted.js'
import { CAP_REACHED, NO_ACCESS, NO_QUESTIONS, callCap, estimateCost, memoryStore, newAccountFields, normaliseCode } from '../../server/metering.js'
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

const users = {
  'token-amy': { sub: 'user-amy', email: 'amy@uni.ac.uk', email_verified: true },
  'token-bob': { sub: 'user-bob', email: 'bob@uni.ac.uk', email_verified: true },
  'token-owner': { sub: 'user-owner', email: 'owner@example.com', email_verified: true },
  'token-fake-owner': { sub: 'user-fake', email: 'owner@example.com', email_verified: false },
}
const verifyToken = async (t) => {
  if (!users[t]) throw new Error('bad token')
  return users[t]
}

const payload = (setId, n = 1, total = 20, text = 'water boils at 100 °C at sea level') =>
  JSON.stringify({
    setId,
    specification: 'The specification',
    sources: [{ name: 'notes.pdf', text }],
    slot: { id: `q${String(n).padStart(2, '0')}`, number: n, level: 'Remember', outcome: { code: 'LO1', text: 'Recall' }, keyPosition: 'A' },
    total,
  })

function setup(claude = fakeClaude(good)) {
  const store = memoryStore()
  const call = (req, token = 'token-amy') =>
    handleHostedRequest(
      { method: 'POST', path: '/', headers: token ? { authorization: `Bearer ${token}` } : {}, ...req },
      { apiKey: 'test-key', store, verifyToken, client: claude, adminEmails: ['Owner@example.com'] },
    )
  const generate = (setId, n, token, total, text) => call({ rawBody: payload(setId, n, total, text) }, token)
  const account = (token = 'token-amy') => call({ method: 'GET', path: '/account' }, token)
  const redeem = (code, token = 'token-amy') => call({ path: '/redeem', rawBody: JSON.stringify({ code }) }, token)
  const makeCodes = async (count = 1, token = 'token-owner') => (await call({ path: '/admin/codes', rawBody: JSON.stringify({ count }) }, token)).body.codes
  // Gives a user access with a beta code, as testers will get it.
  const letIn = async (token = 'token-amy') => redeem((await makeCodes(1))[0].code, token)
  return { store, call, generate, account, redeem, makeCodes, letIn, claude }
}

describe('Sign-in', () => {
  it('turns away a request with no sign-in, or a forged one, before calling Claude', async () => {
    const { generate, claude } = setup()
    expect((await generate('set-00000001', 1, null)).status).toBe(401)
    expect((await generate('set-00000001', 1, 'token-forged')).status).toBe(401)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })
})

describe('Beta access', () => {
  it(`runs in "${hosted.mode}" mode: a new account has no access and no free questions`, async () => {
    expect(hosted.mode).toBe('beta')
    const { account } = setup()
    expect((await account()).body).toMatchObject({ email: 'amy@uni.ac.uk', questions: 0, access: false, waitlisted: false, isAdmin: false })
  })

  it('without access, generating is refused before Claude is called', async () => {
    const { generate, claude } = setup()
    const res = await generate('set-aaaaaaaa', 1)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe(NO_ACCESS)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })

  it('anyone can join the waiting list, and it shows on the admin page', async () => {
    const { call, account } = setup()
    expect((await call({ path: '/waitlist' })).body.waitlisted).toBe(true)
    await account('token-bob')
    const usage = await call({ method: 'GET', path: '/admin/usage' }, 'token-owner')
    expect(usage.body.waitlist.map((w) => w.email)).toEqual(['amy@uni.ac.uk'])
    expect(usage.body.totals.waitlisted).toBe(1)
  })

  it('in open mode a new account gets the free trial questions', () => {
    expect(newAccountFields('open')).toEqual({ questions: hosted.trialQuestions, access: true })
    expect(hosted.trialQuestions).toBe(20)
  })
})

describe('Codes', () => {
  it('the owner makes single-use codes; redeeming one gives access and the beta questions', async () => {
    const { makeCodes, redeem, account } = setup()
    const codes = await makeCodes(3)
    expect(codes).toHaveLength(3)
    expect(codes[0].code).toMatch(/^QTC-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    const res = await redeem(codes[0].code.toLowerCase().replace(/-/g, ' ')) // forgiving about case and spacing
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ access: true, questions: hosted.betaCodeQuestions })
    expect((await account()).body.questions).toBe(200)
  })

  it('a code works once only, and an unknown code is refused', async () => {
    const { makeCodes, redeem } = setup()
    const [{ code }] = await makeCodes(1)
    await redeem(code)
    expect((await redeem(code, 'token-bob')).status).toBe(409)
    expect((await redeem('QTC-ZZZZ-ZZZZ')).status).toBe(404)
  })

  it('only verified owner emails can make codes or see usage', async () => {
    const { call } = setup()
    expect((await call({ path: '/admin/codes', rawBody: '{"count":1}' }, 'token-amy')).status).toBe(403)
    expect((await call({ path: '/admin/codes', rawBody: '{"count":1}' }, 'token-fake-owner')).status).toBe(403)
    expect((await call({ method: 'GET', path: '/admin/usage' }, 'token-amy')).status).toBe(403)
    expect((await call({ method: 'GET', path: '/account' }, 'token-owner')).body).toMatchObject({ isAdmin: true, access: true })
  })

  it('the code list shows which codes have been used', async () => {
    const { makeCodes, redeem, call } = setup()
    const codes = await makeCodes(2)
    await redeem(codes[1].code)
    const list = (await call({ method: 'GET', path: '/admin/codes' }, 'token-owner')).body.codes
    expect(list.filter((c) => c.used).map((c) => c.code)).toEqual([codes[1].code])
    expect(normaliseCode(codes[1].code)).toBe(codes[1].code.replace(/-/g, ''))
  })
})

describe('Question credits', () => {
  it('charges one question for each question written', async () => {
    const { letIn, generate, account } = setup()
    await letIn()
    for (let n = 1; n <= 5; n++) expect((await generate('set-aaaaaaaa', n)).status).toBe(200)
    expect((await account()).body.questions).toBe(195)
  })

  it('regenerating a question is included', async () => {
    const { letIn, generate, account } = setup()
    await letIn()
    await generate('set-aaaaaaaa', 1)
    const again = await generate('set-aaaaaaaa', 1)
    expect(again.body.questions).toBe(199)
    expect((await account()).body.questions).toBe(199)
  })

  it('a question the AI fails to write, or an error, costs nothing', async () => {
    const apiDown = Object.assign(new Error('down'), { status: 500 })
    const { letIn, generate, account } = setup(fakeClaude(bad, bad, apiDown))
    await letIn()
    expect((await generate('set-aaaaaaaa', 1)).body.flagged).toBeTruthy()
    expect((await generate('set-aaaaaaaa', 2)).status).toBe(500)
    expect((await account()).body.questions).toBe(200)
  })

  it('parallel requests for the same question charge it once', async () => {
    const { letIn, generate, account } = setup()
    await letIn()
    await Promise.all([generate('set-aaaaaaaa', 1), generate('set-aaaaaaaa', 1), generate('set-aaaaaaaa', 2)])
    expect((await account()).body.questions).toBe(198)
  })

  it('with no questions left, a new question is refused before Claude, but a paid one can be regenerated', async () => {
    const { letIn, store, generate, claude } = setup()
    await letIn()
    await generate('set-aaaaaaaa', 1)
    store.accounts.get('user-amy').questions = 0
    claude.beta.messages.create.mockClear()
    const refused = await generate('set-aaaaaaaa', 2)
    expect(refused.status).toBe(402)
    expect(refused.body.error).toBe(NO_QUESTIONS)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
    expect((await generate('set-aaaaaaaa', 1)).status).toBe(200)
  })

  it("keeps each user's questions separate", async () => {
    const { letIn, generate, account } = setup()
    await letIn('token-amy')
    await letIn('token-bob')
    await generate('set-aaaaaaaa', 1, 'token-amy')
    expect((await account('token-bob')).body.questions).toBe(200)
  })

  it('accounts from before question credits are converted: 1 set credit = 20 questions, access kept', async () => {
    const { store, account } = setup()
    store.accounts.set('user-amy', { userId: 'user-amy', email: 'amy@uni.ac.uk', credits: 2, createdAt: '2026-11-11' })
    expect((await account()).body).toMatchObject({ questions: 40, access: true })
    expect(store.accounts.get('user-amy').questions).toBe(40)
  })
})

describe('Limits', () => {
  it(`allows ${hosted.callsPerQuestion} calls per question in a set (30 for 20 questions), then stops`, async () => {
    expect(callCap(20)).toBe(30)
    const { letIn, generate, claude } = setup()
    await letIn()
    const total = 2
    for (let i = 0; i < callCap(total); i++) expect((await generate('set-aaaaaaaa', 1, 'token-amy', total)).status).toBe(200)
    claude.beta.messages.create.mockClear()
    const res = await generate('set-aaaaaaaa', 1, 'token-amy', total)
    expect(res.status).toBe(429)
    expect(res.body.error).toBe(CAP_REACHED)
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
  })

  it(`refuses teaching material over ${hosted.maxWordsPerSet.toLocaleString('en-GB')} words, before Claude`, async () => {
    const { letIn, generate, claude } = setup()
    await letIn()
    const tooLong = 'word '.repeat(hosted.maxWordsPerSet + 1000)
    const res = await generate('set-aaaaaaaa', 1, 'token-amy', 20, tooLong)
    expect(res.status).toBe(413)
    expect(res.body.error).toContain('25,000')
    expect(claude.beta.messages.create).not.toHaveBeenCalled()
    expect((await generate('set-bbbbbbbb', 1, 'token-amy', 20, 'word '.repeat(hosted.maxWordsPerSet))).status).toBe(200)
  })

  it('needs a set and a question with every request', async () => {
    const { letIn, call } = setup()
    await letIn()
    expect((await call({ rawBody: JSON.stringify({ ...JSON.parse(payload('x', 1)), setId: undefined }) })).status).toBe(400)
    expect((await call({ rawBody: JSON.stringify({ ...JSON.parse(payload('set-aaaaaaaa', 1)), slot: { id: 'nope' } }) })).status).toBe(400)
  })
})

describe('Usage logging and the admin page', () => {
  it('logs the tokens of every attempt against the set, and never sends them to the browser', async () => {
    const { letIn, generate, store } = setup(fakeClaude(bad, good))
    await letIn()
    const res = await generate('set-aaaaaaaa', 1)
    expect(res.body.usage).toBeUndefined()
    expect(await store.getSet('user-amy', 'set-aaaaaaaa')).toMatchObject({
      calls: 1, questions: 1, inputTokens: 2000, outputTokens: 1000, cacheWriteTokens: 400, cacheReadTokens: 6000, chargedSlots: ['q01'],
    })
  })

  it('works out cost from the model of each set', () => {
    const set = { model: 'claude-opus-5-5', inputTokens: 1e6, outputTokens: 1e6, cacheWriteTokens: 0, cacheReadTokens: 0 }
    expect(estimateCost(set)).toBe(24)
    expect(estimateCost({ ...set, model: 'unknown' })).toBeNull()
  })

  it('shows each user\'s sets, questions, regenerations and cost, with totals', async () => {
    const { letIn, generate, call } = setup()
    await letIn()
    await generate('set-aaaaaaaa', 1)
    await generate('set-aaaaaaaa', 1) // a regeneration
    await generate('set-aaaaaaaa', 2)
    const { body } = await call({ method: 'GET', path: '/admin/usage' }, 'token-owner')
    const amy = body.users.find((u) => u.email === 'amy@uni.ac.uk')
    expect(amy).toMatchObject({ access: true, questionsLeft: 198, sets: 1, questionsCharged: 2, questionsWritten: 3, regenerations: 1, calls: 3 })
    expect(amy.cost).toBeGreaterThan(0)
    expect(body.totals).toMatchObject({ sets: 1, questionsCharged: 2 })
    expect(body.totals.costPerQuestion).toBeCloseTo(amy.cost / 2, 6)
  })
})

describe('DynamoDB store', () => {
  const tables = { accountsTable: 'Accounts', setsTable: 'Sets', codesTable: 'Codes' }
  const fakeDb = (fail, item) => {
    const sent = []
    return {
      sent,
      client: {
        send: vi.fn(async (cmd) => {
          sent.push(cmd)
          if (fail && cmd.constructor.name === 'TransactWriteCommand') throw fail
          return { Attributes: { calls: 1 }, Item: item }
        }),
      },
    }
  }
  const cancelledWith = (codes) =>
    Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException', CancellationReasons: codes.map((Code) => ({ Code })) })

  it('only charges a question not already paid for, and only if the account has a question left', async () => {
    const db = fakeDb()
    expect(await dynamoStore({ ...tables, client: db.client }).chargeQuestion('u', 's', 'q01')).toBe('charged')
    const [setUpdate, accountUpdate] = db.sent[0].input.TransactItems.map((t) => t.Update)
    expect(setUpdate.ConditionExpression).toBe('attribute_not_exists(chargedSlots) OR NOT contains(chargedSlots, :slot)')
    expect(accountUpdate.ConditionExpression).toBe('questions >= :one')
  })

  it('reports "already" or "no-credits" from a cancelled charge', async () => {
    expect(await dynamoStore({ ...tables, client: fakeDb(cancelledWith(['ConditionalCheckFailed', 'None'])).client }).chargeQuestion('u', 's', 'q01')).toBe('already')
    expect(await dynamoStore({ ...tables, client: fakeDb(cancelledWith(['None', 'ConditionalCheckFailed'])).client }).chargeQuestion('u', 's', 'q01')).toBe('no-credits')
  })

  it('redeems a code once: unknown, used and parallel redemptions are all caught', async () => {
    expect(await dynamoStore({ ...tables, client: fakeDb(null, undefined).client }).redeemCode('QTCX', 'u')).toBe('unknown')
    expect(await dynamoStore({ ...tables, client: fakeDb(null, { code: 'QTCX', questions: 200, redeemedBy: 'v' }).client }).redeemCode('QTCX', 'u')).toBe('used')
    const race = fakeDb(cancelledWith(['ConditionalCheckFailed', 'None']), { code: 'QTCX', questions: 200 })
    expect(await dynamoStore({ ...tables, client: race.client }).redeemCode('QTCX', 'u')).toBe('used')
    const ok = fakeDb(null, { code: 'QTCX', questions: 200 })
    expect(await dynamoStore({ ...tables, client: ok.client }).redeemCode('QTCX', 'u')).toBe('redeemed')
    expect(ok.sent[1].input.TransactItems[1].Update.ExpressionAttributeValues[':q']).toBe(200)
  })
})
