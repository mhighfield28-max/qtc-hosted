# Questions That Count — hosted

The hosted, multi-user version of the Questions That Count MCQ generator: educators sign in, use credits and generate Bloom's-aligned question sets for Moodle and Blackboard.

See `docs/hosted-brief.md` for the product decisions, architecture and build phases.

## Run it on a laptop

1. `npm install`
2. Copy `.env.example` to `.env.local` and add your Claude API key.
3. `npm run dev`

On a laptop there is no sign-in and no credit check: the server function runs inside the dev server. Sign-in and credits are switched on when the app runs with an Amplify backend (`npx ampx sandbox`, or a deploy).

## Tests

- `npm test`: unit tests
- `npm run test:e2e`: browser tests (Playwright)
