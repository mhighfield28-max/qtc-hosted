// DynamoDB storage for server/metering.js. Two tables, both made in amplify/backend.ts:
//   Accounts  key userId          -> email, credits, createdAt
//   Sets      key userId + setId  -> total, calls, questions, flagged, errors, token counts, charged
//
// The "only once" rules are enforced by DynamoDB conditions, so parallel requests can't
// double-charge a set, overspend credits or go past a set's cap.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const conditionFailed = (e) => e?.name === 'ConditionalCheckFailedException'

export function dynamoStore({ accountsTable, setsTable, client } = {}) {
  const db = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}))

  const getAccount = async (userId) =>
    (await db.send(new GetCommand({ TableName: accountsTable, Key: { userId }, ConsistentRead: true }))).Item ?? null

  return {
    getAccount,

    async getOrCreateAccount(userId, { email, trialCredits }) {
      const existing = await getAccount(userId)
      if (existing) return existing
      const item = { userId, email, credits: trialCredits, createdAt: new Date().toISOString() }
      try {
        await db.send(new PutCommand({ TableName: accountsTable, Item: item, ConditionExpression: 'attribute_not_exists(userId)' }))
        return item
      } catch (e) {
        if (conditionFailed(e)) return getAccount(userId) // made by a parallel request
        throw e
      }
    },

    async getSet(userId, setId) {
      return (await db.send(new GetCommand({ TableName: setsTable, Key: { userId, setId }, ConsistentRead: true }))).Item ?? null
    },

    // Adds one to the set's call count, creating the set if needed, unless it's at its cap.
    // Returns the updated set, or null if the cap is reached.
    async startCall(userId, setId, { total, cap }) {
      try {
        const res = await db.send(
          new UpdateCommand({
            TableName: setsTable,
            Key: { userId, setId },
            UpdateExpression:
              'ADD calls :one SET #total = if_not_exists(#total, :total), createdAt = if_not_exists(createdAt, :now), charged = if_not_exists(charged, :false)',
            ConditionExpression: 'attribute_not_exists(calls) OR calls < :cap',
            ExpressionAttributeNames: { '#total': 'total' },
            ExpressionAttributeValues: { ':one': 1, ':total': total, ':now': new Date().toISOString(), ':false': false, ':cap': cap },
            ReturnValues: 'ALL_NEW',
          }),
        )
        return res.Attributes
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

    // Marks the set as paid for and takes one credit, both or neither.
    // Returns 'charged', 'already' (another request charged it first) or 'no-credits'.
    async chargeSet(userId, setId) {
      try {
        await db.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: setsTable,
                  Key: { userId, setId },
                  UpdateExpression: 'SET charged = :true, chargedAt = :now',
                  ConditionExpression: 'charged = :false',
                  ExpressionAttributeValues: { ':true': true, ':false': false, ':now': new Date().toISOString() },
                },
              },
              {
                Update: {
                  TableName: accountsTable,
                  Key: { userId },
                  UpdateExpression: 'ADD credits :minus',
                  ConditionExpression: 'credits >= :one',
                  ExpressionAttributeValues: { ':minus': -1, ':one': 1 },
                },
              },
            ],
          }),
        )
        return 'charged'
      } catch (e) {
        if (e?.name !== 'TransactionCanceledException') throw e
        const [setReason, accountReason] = (e.CancellationReasons ?? []).map((r) => r?.Code)
        if (setReason === 'ConditionalCheckFailed') return 'already'
        if (accountReason === 'ConditionalCheckFailed') return 'no-credits'
        throw e
      }
    },
  }
}
