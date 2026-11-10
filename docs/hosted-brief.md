# Hosted Question Generator: build brief

Read this first in every chat about the hosted build. Update the Status and Next sections at the end of each session.

Last updated: 10 Nov 2026 (Phase 1 built)

## What we are building

A hosted version of the Questions That Count MCQ generator. Educators sign in, buy credits and generate Bloom's-aligned question sets without building their own tool. Built from day one so the same code can be deployed into an institution's own AWS account.

## Decisions made (10 Nov 2026)

- Scope: the full product now, payments included. No beta-only first version.
- Two ways to sell it, same codebase:
  - Hosted by me at app.mikehighfield.ai for individuals and small teams (credit packs and an annual plan).
  - "Built into your cloud" for institutions: deployed into their AWS account under their own Anthropic agreement, for a setup fee plus annual support. Payments switched off; their caps set by them.
- Domain: app.mikehighfield.ai
- AWS: Mike's current personal account, pinned to one region (proposed eu-west-2, London) so billing and data location are simple.

## Starting point

The latest code is the course build in the GitHub repo mcq-generator-new (Phases 1 to 4 complete, 27 Oct 2026, 54 unit tests passing). It is already split the right way: a Vite and React front end, plus an Amplify Gen 2 backend with one Lambda that holds the key. The other repos (Summative-MCQ-Assessement-Designer, mcq-generator-windows) are older. mcq-generator is empty.

The course build brief says one user and no saving in the cloud. The hosted version breaks both on purpose, so it gets its own repo and this brief. The course repo stays as learners see it.

## Architecture

- Frontend: the existing five screens (Set up, Content, Generate, Review, Export), unchanged in how they work, plus sign-in, an account page and a buy-credits page.
- Backend: Amplify Gen 2, so all infrastructure is defined in code in the repo. Deploying into a customer's cloud means connecting the repo to their Amplify account.
- Sign-in: Cognito, email and password with email verification.
- Data: DynamoDB. Tables for users and allowances, a credit ledger and payments.
- Generation: kept as it is. The browser asks for one question at a time from a Lambda Function URL, so the 30-second API limit doesn't apply. The Lambda gains three jobs: check the sign-in token, check and deduct credits plus log the tokens used.
- The key stays an Amplify secret (MCQ_CLAUDE_KEY) and never reaches the browser.
- Uploaded content is never stored. The browser extracts the text and sends it with each request. Only the user's own saved sets are kept.

## Cost warning

The business model doc costed a 20-question set at about $0.15, assuming a Sonnet-class model making one call for the whole set. The current build makes one call per question on claude-opus-5-5 at high effort. That will cost several times more. Phase 1 logs real token use per set so price and caps are set from measured numbers, then we test cheaper models against Bloom's accuracy.

## Caps and safeguards (from the business model doc)

- A credit is one question set. The first question of a set reserves the credit; failed sets are refunded automatically.
- Input limit of about 30,000 tokens of source material per run, with a clear message when exceeded.
- Maximum questions per run and a fixed maximum output length on every call.
- Rate limit of about 10 runs an hour per user.
- Free trial of three sets on a verified email. No unlimited free use.
- Backstops: monthly spend limit on the Anthropic workspace and an AWS budget alarm.
- Prompt caching on the fixed specification and instructions.

## Pricing to build in (provisional, from the business model doc)

- Credit pack: about $19 for 50 sets, no expiry.
- Annual plan: about $120 a year.
- Team and institution seats: priced per seat per year with a minimum, alongside the $1,395 team licence.

## Build phases

1. Sign-in and metering: Cognito sign-in, the Lambda rejects calls without a valid sign-in, credits checked and deducted per set, tokens logged per set.
2. Accounts and saved work: account page with credits left, sets saved to the user's account so a refresh loses nothing.
3. Caps and safeguards: everything in the list above, plus the free trial.
4. Payments: credit packs and annual plan through a merchant of record, using webhooks to add credits.
5. Legal and operations: privacy policy, terms of service, subprocessor list (AWS and Anthropic), DPA template for universities, budget alarms, custom domain.
6. Institution kit: a config switch that turns payments off, plus a runbook for deploying into a customer's AWS account.

## Phase 1: sign-in and metering

What it does:
- Nothing shows until the user signs in. New accounts verify their email and get the free-trial credits from config/hosted.json.
- Every request to the server function must carry a valid sign-in. Without one it is turned away before Claude is called.
- One credit is one question set. The credit is taken when the set's first good question comes back, so a set that fails costs nothing. Finishing, resuming and regenerating within a set are included.
- Each set is capped at 3 calls per question (first writes plus regenerations), set in config/hosted.json.
- Every call's tokens are logged against its set, charged or not. Cost in dollars is worked out once prices are filled in in config/hosted.json.
- The header shows the user's email, sets left and Sign out. The Generate screen says what a new set will use.
- On a laptop with no Amplify backend the app runs exactly as the course build does, with no sign-in.

Definition of done, shown in this sandbox:
- [x] Requests without a sign-in, or with a forged one, are turned away before Claude is called (unit tests, including on the packaged Lambda)
- [x] New accounts get the trial credits; one credit per set; failed or flagged sets are never charged; parallel requests for one set take one credit (unit tests)
- [x] With no credits left a new set is refused before Claude is called, but a paid-for set can still be finished (unit tests)
- [x] The per-set cap stops further calls (unit tests)
- [x] Tokens from every attempt are logged per set and never sent to the browser (unit tests)
- [x] The database rules that stop double-charging are in the DynamoDB requests (unit tests)
- [x] The backend type-checks; the app builds; all 74 unit tests and all 30 browser tests pass
- [x] The sign-in and create-account screens render in the brand colours

To check after the first deploy (needs AWS):
- [ ] Create an account, verify the email, sign in and see 3 sets left
- [ ] Generate a set and watch it drop to 2; regenerate a question and see it stay at 2
- [ ] In DynamoDB, the Sets table shows the set with its token counts
- [ ] Calling the Function URL with no sign-in returns "Please sign in."

## How to deploy (Mike)

1. In the Anthropic Console, create a workspace for the hosted product, set a monthly spend limit and create an API key in it.
2. In the AWS console, switch the region (top right) to Europe (London) eu-west-2.
3. Open Amplify, choose Create new app, connect GitHub and pick qtc-hosted, branch main.
4. Add the secret under Hosting, Secrets: name MCQ_CLAUDE_KEY, value the key. The first build may fail until the secret is there; that's expected. Redeploy once it's added.
5. When it's live, open the amplifyapp.com address and run the "To check after the first deploy" list above.

Notes:
- Cognito sends verification emails from its own default sender, which is limited to a small number a day. Fine for testing; switch to Amazon SES in Phase 5.
- The Accounts and Sets tables are kept even if the Amplify app is deleted, so no one loses credits by accident.
- A custom domain later (app.mikehighfield.ai) must also be added to SITE_ORIGINS in the Amplify environment variables, or generation will be blocked there.

## Still to decide

- Payment provider (merchant of record): Paddle, Lemon Squeezy or Stripe managed payments. Needed by Phase 4.
- Where DNS for mikehighfield.ai is managed (needed to point app.mikehighfield.ai at Amplify).
- Which Claude model in production. Test whether a cheaper model gets Bloom's levels right before switching.

## Things Mike does himself (never shared in chat)

- Create a separate Anthropic workspace for the hosted product, set its spend limit, create the API key and paste it into the Amplify secret.
- Connect the repo to Amplify in the AWS console and set the region.
- Set the AWS budget alarm.

## Status

- 10 Nov 2026: decisions made and brief written.
- 10 Nov 2026: GitHub access confirmed. Course build copied into qtc-hosted.
- 10 Nov 2026: Phase 1 (sign-in and metering) built and tested in the sandbox, on the branch phase-1-signin-metering. Waiting for Mike to merge and deploy.

## Next

- Mike: merge the Phase 1 pull request, deploy (see How to deploy) and run the after-deploy checks.
- Mike: generate two or three real sets so the Sets table shows what a set really costs. Then fill in prices in config/hosted.json from Anthropic's pricing page.
- Claude: Phase 2 (account page and saved work) when Mike says go.
