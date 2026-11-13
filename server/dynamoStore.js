// DynamoDB storage for server/metering.js. Three tables, all made in amplify/backend.ts:
//   Accounts  key userId          -> email, questions (credit left), access, waitlisted, createdAt
//   Sets      key userId + setId  -> total, calls, questions, flagged, errors, token counts,
//                                    chargedSlots (the questions already paid for)
//   Codes     key code            -> questions, kind, createdAt, redeemedBy, redeemedAt
//
// The "only once" rules are enforced by DynamoDB conditions, so parallel requests can't charge a
// question twice, overspend credit, go past a set's cap or redeem a code twice.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const conditionFailed = (e) => e?.name === 'ConditionalCheckFailedException'
const cancelled = (e) => (e?.name === 'TransactionCanceledException' ? (e.CancellationReasons ?? []).map((r) => r?.Code) : null)

// DynamoDB string sets come back as JS Sets; the rules work with plain arrays.
const withArrays = (item) => (item && item.chargedSlots instanceof Set ? { ...item, chargedSlots: [...item.chargedSlots] } : item)

export function dynamoStore({ accountsTable, setsTable, codesTable, client } = {}) {
  const db = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}))

  const getAccount = async (userId) =>
    (await db.send(new GetCommand({ TableName: accountsTable, Key: { userId }, ConsistentRead: true }))).Item ?? null

  async function scanAll(TableName) {
    const items = []
    let ExclusiveStartKey
    do {
      const page = await db.send(new ScanCommand({ TableName, ExclusiveStartKey }))
      items.push(...(page.Items ?? []))
      ExclusiveStartKey = page.LastEvaluatedKey
    } while (ExclusiveStartKey)
    return items.map(withArrays)
  }

  return {
    getAccount,

    async getOrCreateAccount(userId, fields) {
      const existing = await getAccount(userId)
      if (existing) return existing
      const item = { userId, ...fields, createdAt: new Date().toISOString() }
      try {
        await db.send(new PutCommand({ TableName: accountsTable, Item: item, ConditionExpression: 'attribute_not_exists(userId)' }))
        return item
      } catch (e) {
        if (conditionFailed(e)) return getAccount(userId) // made by a parallel request
        throw e
      }
    },

    async updateAccount(userId, fields) {
      const names = Object.keys(fields)
      await db.send(
        new UpdateCommand({
          TableName: accountsTable,
          Key: { userId },
          UpdateExpression: `SET ${names.map((n, i) => `#f${i} = :v${i}`).join(', ')}`,
          ExpressionAttributeNames: Object.fromEntries(names.map((n, i) => [`#f${i}`, n])),
          ExpressionAttributeValues: Object.fromEntries(names.map((n, i) => [`:v${i}`, fields[n]])),
        }),
      )
    },

    async getSet(userId, setId) {
      const res = await db.send(new GetCommand({ TableName: setsTable, Key: { userId, setId }, ConsistentRead: true }))
      return withArrays(res.Item) ?? null
    },

    // Adds one to the set's call count, creating the set if needed, unless it's at its cap.
    // Returns the updated set, or null if the cap is reached.
    async startCall(userId, setId, { total, cap }) {
      try {
        const res = await db.send(
          new UpdateCommand({
            TableName: setsTable,
            Key: { userId, setId },
            UpdateExpression: 'ADD calls :one SET #total = if_not_exists(#total, :total), createdAt = if_not_exists(createdAt, :now)',
            ConditionExpression: 'attribute_not_exists(calls) OR calls < :cap',
            ExpressionAttributeNames: { '#total': 'total' },
            ExpressionAttributeValues: { ':one': 1, ':total': total, ':now': new Date().toISOString(), ':cap': cap },
            ReturnValues: 'ALL_NEW',
          }),
        )
        return withArrays(res.Attributes)
      } catch (e) {
        if (conditionFailed(e)) return null
        throw e
      }
    },

    async recordUsage(userId, setId, { outcome, usage = {}, model }) {
      const counter = { question: 'questions', flagged: 'flagged', error: 'errors' }[outcome]
      await db.send(
        new UpdateCommand({
          TableName: setsTable,
          Key: { userId, setId },
          UpdateExpression: `ADD inputTokens :in, outputTokens :out, cacheWriteTokens :cw, cacheReadTokens :cr, ${counter} :one SET model = :model, updatedAt = :now`,
          ExpressionAttributeValues: {
            ':in': usage.inputTokens ?? 0,
            ':out': usage.outputTokens ?? 0,
            ':cw': usage.cacheWriteTokens ?? 0,
            ':cr': usage.cacheReadTokens ?? 0,
            ':one': 1,
            ':model': model ?? 'unknown',
            ':now': new Date().toISOString(),
          },
        }),
      )
    },

    // Marks one question of a set as paid for and takes one question of credit, both or neither.
    // Returns 'charged', 'already' (paid for before, e.g. a regeneration) or 'no-credits'.
    async chargeQuestion(userId, setId, slotId) {
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: setsTable,
                  Key: { userId, setId },
                  UpdateExpression: 'ADD chargedSlots :slots',
                  ConditionExpression: 'attribute_not_exists(chargedSlots) OR NOT contains(chargedSlots, :slot)',
                  ExpressionAttributeValues: { ':slots': new Set([slotId]), ':slot': slotId },
                },
              },
              {
                Update: {
                  TableName: accountsTable,
                  Key: { userId },
                  UpdateExpression: 'ADD questions :minus',
                  ConditionExpression: 'questions >= :one',
                  ExpressionAttributeValues: { ':minus': -1, ':one': 1 },
                },
              },
            ],
          }),
        )
        return 'charged'
      } catch (e) {
        const reasons = cancelled(e)
        if (!reasons) throw e
        if (reasons[0] === 'ConditionalCheckFailed') return 'already'
        if (reasons[1] === 'ConditionalCheckFailed') return 'no-credits'
        throw e
      }
    },

    async putCodes(list) {
      for (const item of list) {
        await db.send(new PutCommand({ TableName: codesTable, Item: item, ConditionExpression: 'attribute_not_exists(code)' }))
      }
    },

    listCodes: () => scanAll(codesTable),

    // Gives the code's questions to the user and marks the code used, both or neither.
    // Returns 'redeemed', 'used' or 'unknown'.
    async redeemCode(code, userId) {
      const found = (await db.send(new GetCommand({ TableName: codesTable, Key: { code }, ConsistentRead: true }))).Item
      if (!found) return 'unknown'
      if (found.redeemedBy) return 'used'
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: codesTable,
                  Key: { code },
                  UpdateExpression: 'SET redeemedBy = :user, redeemedAt = :now',
                  ConditionExpression: 'attribute_exists(code) AND attribute_not_exists(redeemedBy)',
                  ExpressionAttributeValues: { ':user': userId, ':now': new Date().toISOString() },
                },
              },
              {
                Update: {
                  TableName: accountsTable,
                  Key: { userId },
                  UpdateExpression: 'ADD questions :q SET #access = :true',
                  ExpressionAttributeNames: { '#access': 'access' },
                  ExpressionAttributeValues: { ':q': found.questions, ':true': true },
                },
              },
            ],
          }),
        )
        return 'redeemed'
      } catch (e) {
        const reasons = cancelled(e)
        if (reasons?.[0] === 'ConditionalCheckFailed') return 'used' // redeemed by a parallel request
        throw e
      }
    },

    scanAccounts: () => scanAll(accountsTable),
    scanSets: () => scanAll(setsTable),
  }
}
