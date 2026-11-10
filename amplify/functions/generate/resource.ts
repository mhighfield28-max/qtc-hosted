import { defineFunction, secret } from '@aws-amplify/backend'

// The Lambda that calls Claude. The key comes from an Amplify secret named MCQ_CLAUDE_KEY,
// set with:  npx ampx sandbox secret set MCQ_CLAUDE_KEY  (or in the Amplify console).
export const generate = defineFunction({
  name: 'generate',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 600, // writing one question, plus one retry, can take a few minutes
  memoryMB: 512,
  environment: {
    MCQ_CLAUDE_KEY: secret('MCQ_CLAUDE_KEY'),
  },
})
