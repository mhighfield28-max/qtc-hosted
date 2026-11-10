// Used by amplify.yml during the Amplify build. Prints the server function's web address,
// which the backend step writes to amplify_outputs.json. Fails the build if it's missing,
// so a site that can't reach its server function is never published.
import { readFileSync } from 'node:fs'

let url
try {
  url = JSON.parse(readFileSync('amplify_outputs.json', 'utf8')).custom?.generateUrl
} catch {}

if (!url) {
  console.error('No server function address in amplify_outputs.json. Did the backend step finish?')
  process.exit(1)
}
console.log(url)
