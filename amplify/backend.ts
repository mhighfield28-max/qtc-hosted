import { defineBackend } from '@aws-amplify/backend'
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda'
import { generate } from './functions/generate/resource'

const backend = defineBackend({ generate })

// When Amplify builds from GitHub it sets AWS_APP_ID and AWS_BRANCH, which give the site's
// own address. Only that site may call the server function from a browser. (In a personal
// sandbox there is no site address, so any origin is allowed.)
const { AWS_APP_ID, AWS_BRANCH } = process.env
const siteOrigin = AWS_APP_ID && AWS_BRANCH
  ? `https://${AWS_BRANCH.replace(/[^a-zA-Z0-9-]/g, '-')}.${AWS_APP_ID}.amplifyapp.com`
  : '*'

// Give the Lambda its own web address so the browser can call it.
// A Function URL (unlike API Gateway) allows the long-running requests generation needs.
const url = backend.generate.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: [siteOrigin],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ['content-type'],
  },
})

// Published in amplify_outputs.json so the front end can find it at build time.
backend.addOutput({ custom: { generateUrl: url.url } })
