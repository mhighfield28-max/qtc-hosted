import { defineFunction, secret } from '@aws-amplify/backend'
import hosted from '../../../config/hosted.json'
import packs from '../../../config/packs.json'

// The Lambda that calls Claude. The key comes from an Amplify secret named MCQ_CLAUDE_KEY,
// set with:  npx ampx sandbox secret set MCQ_CLAUDE_KEY  (or in the Amplify console).
//
// With payments on (config/hosted.json), each Payhip pack's product secret key is also an
// Amplify secret, named in config/packs.json (PAYHIP_ONE_PAPER and so on). All of them must be
// set in Amplify before deploying, or the deploy stops with a missing-secret error.
const payhipSecrets =
  hosted.payments === 'payhip' ? Object.fromEntries(packs.packs.map((p) => [p.secret, secret(p.secret)])) : {}

export const generate = defineFunction({
  name: 'generate',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 600, // writing one question, plus one retry, can take a few minutes
  memoryMB: 512,
  environment: {
    MCQ_CLAUDE_KEY: secret('MCQ_CLAUDE_KEY'),
    ...payhipSecrets,
  },
})
