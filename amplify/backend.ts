import { defineBackend } from '@aws-amplify/backend'
import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda'
import { auth } from './auth/resource'
import { generate } from './functions/generate/resource'

const backend = defineBackend({ auth, generate })
const lambda = backend.generate.resources.lambda

// ---------- Tables for accounts, credits and usage ----------
// Made in the function's own stack so the Lambda can be given access without a circular link.
// RETAIN: deleting the app (or a branch) never deletes customers' credits.
const stack = Stack.of(lambda)
const accounts = new Table(stack, 'Accounts', {
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
})
const sets = new Table(stack, 'Sets', {
  partitionKey: { name: 'userId', type: AttributeType.STRING },
  sortKey: { name: 'setId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
})
// Single-use codes (beta codes now; Payhip purchases are checked with Payhip directly).
const codes = new Table(stack, 'Codes', {
  partitionKey: { name: 'code', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
  removalPolicy: RemovalPolicy.RETAIN,
})
accounts.grantReadWriteData(lambda)
sets.grantReadWriteData(lambda)
codes.grantReadWriteData(lambda)

// ---------- What the Lambda needs to know ----------
const { userPool, userPoolClient } = backend.auth.resources
backend.generate.addEnvironment('ACCOUNTS_TABLE', accounts.tableName)
backend.generate.addEnvironment('SETS_TABLE', sets.tableName)
backend.generate.addEnvironment('CODES_TABLE', codes.tableName)
// Who can open the admin page: comma-separated verified emails, set in the Amplify console.
backend.generate.addEnvironment('ADMIN_EMAILS', process.env.ADMIN_EMAILS ?? '')
backend.generate.addEnvironment('USER_POOL_ID', userPool.userPoolId)
backend.generate.addEnvironment('USER_POOL_CLIENT_ID', userPoolClient.userPoolClientId)

// ---------- The Lambda's web address ----------
// When Amplify builds from GitHub it sets AWS_APP_ID and AWS_BRANCH, which give the site's
// own address. Only that site (and any custom domain listed in SITE_ORIGINS, comma-separated,
// set in the Amplify console) may call the server function from a browser. In a personal
// sandbox there is no site address, so any origin is allowed; sign-in is still required.
const { AWS_APP_ID, AWS_BRANCH, SITE_ORIGINS } = process.env
const origins = AWS_APP_ID && AWS_BRANCH
  ? [
      `https://${AWS_BRANCH.replace(/[^a-zA-Z0-9-]/g, '-')}.${AWS_APP_ID}.amplifyapp.com`,
      ...(SITE_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    ]
  : ['*']

// A Function URL (unlike API Gateway) allows the long-running requests generation needs.
// It is open to the internet, but the Lambda turns away any request without a valid sign-in.
const url = lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: origins,
    allowedMethods: [HttpMethod.GET, HttpMethod.POST],
    allowedHeaders: ['content-type', 'authorization'],
  },
})

// Published in amplify_outputs.json so the front end can find it.
backend.addOutput({ custom: { generateUrl: url.url } })
