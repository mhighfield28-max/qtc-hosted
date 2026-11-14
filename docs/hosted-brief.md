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
- [x] Create an account, verify the email, sign in and see 3 sets left (11 Nov, app.mikehighfield.ai)
- [x] Generate a set and watch it drop to 2; regenerate a question and see it stay at 2 (20 of 20 written, none flagged, about 4 minutes)
- [x] In DynamoDB, the Sets table shows the set with its token counts
- [ ] Calling the Function URL with no sign-in returns "Please sign in." (covered by unit tests; not yet tried live)

## First measured cost (11 Nov 2026)

One 20-question set plus one regeneration on claude-opus-5-5 at high effort (22 calls):
- Input 16,005; cache write 7,066; cache read 67,127; output 43,655 tokens
- At Opus 5.5 list prices from a third-party summary ($4 in, $20 out, $5 cache write, $0.20 cache read per million; confirm on Anthropic's pricing page) that is about $1.00 a set
- Output is nearly 90% of the cost: most of it is the model thinking at high effort
- This is about 7 times the $0.15 the business model doc assumed. At $19 for 50 sets the credit pack would lose money. Before setting prices, test effort "medium" and a Sonnet-class model against Bloom's accuracy.

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
- 10 Nov 2026: Phase 1 (sign-in and metering) built and tested in the sandbox, on the branch phase-1-signin-metering.
- 11 Nov 2026: Phase 1 deployed from the branch and live at https://app.mikehighfield.ai (DNS in Cloudflare: two CNAMEs, both DNS only; root domain still points to Payhip). Claude key replaced after it was exposed in a plain environment variable; now held only as the MCQ_CLAUDE_KEY secret. SITE_ORIGINS set. After-deploy checks passed. First real cost measured (see above).
- 11 Nov 2026: PR #1 merged. main connected, set as production branch and app.mikehighfield.ai pointed at it; new account on main shows 3 sets. phase-1 branch disconnected in Amplify. Its two DynamoDB tables were kept (RETAIN) and hold only test data; delete them in DynamoDB when convenient.

## Cost test (built 11 Nov 2026)

- A GitHub Action ("Cost test") writes the same set with Opus high, Opus medium, Sonnet high, Sonnet medium and Haiku, using the app's own code, and records cost, time, flagged questions and the automatic A5 checks. The key is a GitHub repository secret (MCQ_CLAUDE_KEY), never in chat or code. See cost-test/README.md.
- Bloom's accuracy is judged by Mike from a blind review sheet that Claude builds from the results.
- Projected cost per set from the first live token counts: Opus high about $1.00, Sonnet high about $0.49, Haiku about $0.03 (prices in config/prices.json; confirm on Anthropic's pricing page).

## Launch decisions (13 Nov 2026)

- Model: Opus 5.5 at medium effort. Quality is the selling point; tiers differ by volume, not model.
- Credits are counted in questions, not sets, because sets are 20, 30 or 40 questions. A question is charged when first written; regenerating is included; a question the AI fails to write costs nothing. Cap: 1.5 Claude calls per question (30 for a 20-question set).
- Packs (no expiry, US dollars, about 60% margin): Starter 100 questions $15.99, Standard 300 $44.99, Pro 800 $114.99. Annual and team plans later.
- Free trial 20 questions once the site opens to the public. During the beta the site is invite-only: new accounts redeem a code or join the waiting list. Beta codes give 200 questions each and are made on the admin page.
- Payments: Payhip software licence keys, one Payhip product per pack, redeemed in the app.
- Teaching material: up to 25,000 words per set, shown as a live word count with everyday examples.
- Exports: add Canvas (QTI .zip) and Brightspace; the format is chosen on the Export screen. Docebo and Absorb later.
- Guidance: a "?" help button on every field (written by Claude, checked by Mike); Import and Download cover Part A and Part B; Content screen explains what to upload, the word limit, copyright (one calm line) and privacy ("not stored by default", "never used to train AI models"). Video guidance later.
- Bloom's levels shown as colour-coded blocks, as in the promo video: greens for Remember and Understand, ochre for Apply and Analyse, brick for Evaluate.

## Launch prep 1: accounts and access (built 13 Nov 2026)

- Invite-only beta mode with a waiting list; Redeem a code in the header; question-based credits; Opus 5.5 medium; cap 1.5 calls per question; 25,000-word limit enforced on the server.
- Admin page at app.mikehighfield.ai/#admin, visible only to the verified emails in the ADMIN_EMAILS environment variable: testers, questions written, regenerations, real cost per question, the waiting list and invite codes.
- New DynamoDB table: Codes. Accounts from before (set credits) are converted at 20 questions per set credit.

To check after deploy:
- [x] Set ADMIN_EMAILS in Amplify (Hosting, Environment variables) to your email, then redeploy (done 13 Nov: three addresses; Mike signs in with the altcampusonline one)
- [x] Open app.mikehighfield.ai/#admin, make one code and redeem it: 200 questions (done 13 Nov on Mike's own account: 60 → 260. Old set credits converted at 20 questions each, as planned)
- [ ] Generate a set: the counter falls by one per question written; regenerating doesn't change it
- [ ] A new account with no code sees the waiting list screen, and appears on the admin page after joining

## Launch prep 2: guidance and look (built 13 Nov 2026)

Written for lecturers who won't take the training course.

- "?" help buttons on every Set up field, the Content, Generate, Review and Export screens and the code box. All the words live in one file, `src/content/helpText.js`, for Mike to check and edit.
- Import and Download now say "(Part A and B)", with the tooltip "Part A: house rules, the same for every module. Part B: your module." Import also reads Part A: if the file's house rules differ from the ones in use, it asks before replacing them.
- Content screen: what to upload (taught materials; a syllabus alone isn't enough), a live word meter against 25,000 with a rough guide (100 slides, a 10-page document, an article, a chapter), one calm copyright line, and a privacy panel. The browser now blocks a set over 25,000 words (the old 4 MB limit is gone).
- Privacy wording checked against Anthropic's privacy centre: by default it deletes API inputs and outputs within 30 days (longer only for content flagged by its safety checks). So the panel says "Not stored by Questions That Count. The AI provider deletes them within 30 days" rather than "not stored at all".
- Bloom's level blocks, like the promo video: a cream card with a coloured stripe. Remember and Understand are greens, Apply and Analyse are ochres and Evaluate is brick. They're used on the Generate table and progress list, the Set up distribution and the Review summary and question cards. The colours live in theme.css.

To check after deploy:
- [ ] Open a few "?" buttons and read the help text; edit `src/content/helpText.js` where it doesn't sound right
- [ ] Download a specification, then import it again: no question about house rules

## Launch prep 3: Canvas and Brightspace exports (built 13 Nov 2026)

- The platform is now chosen on the Export screen, not in Set up (B6 is gone from the form). Choices are Canvas, Blackboard, Brightspace (D2L) and Moodle, and each gets its own import file. A specification that names platforms pre-ticks them, and the last choice is remembered in that browser.
- **Canvas:** a QTI 1.2 .zip, laid out like text2qti (an open-source converter widely used with Canvas). It's imported through Settings → Import Course Content → QTI .zip file and arrives as an unpublished quiz with a question bank. Checked with Canvas's own open-source QTI migration tool (instructure/QTIMigrationTool), which Canvas runs on QTI imports: every question converted as multiple choice, with the right key and the stem's bold intact.
- **Brightspace:** a Question Library .csv in the layout of D2L's own sample file (NewQuestion, ID, Title, QuestionText, Points and Option rows; the key scores 100). Every field is quoted and the file is UTF-8 with a byte-order mark. It reads back cleanly with a standard CSV reader.
- Neither has been imported into a live Canvas or Brightspace yet: no test instance. Beta testers on those platforms should try an import first and report back.

To check after deploy:
- [ ] Ask one Canvas tester and one Brightspace tester to import a small set and send a screenshot of the result

## Next

- **Before inviting testers: sign-up emails through SES** (started 14 Nov).
  - Done: SES set up in London on the Essentials plan (no monthly fee, about $0.16 per 1,000 emails; engagement tracking and auto validation off). The mikehighfield.ai domain identity is created with Easy DKIM and MAIL FROM mail.mikehighfield.ai. The 6 DNS records are in Cloudflare (3 DKIM CNAMEs, MX and SPF TXT for mail., DMARC p=none). altcampusonline@gmail.com is verified for sandbox testing.
  - Waiting for: SES to show the domain as Verified, then a request for production access (out of the sandbox).
  - Code ready in PR #7: codes come from "Questions That Count <no-reply@mikehighfield.ai>", reply-to admin@mikehighfield.ai, with a plainer code email. Set in config/hosted.json. Merge only after the domain is verified **and** production access is granted.
- Then test the waiting list with a brand-new account.
- Mike: delete the phase-1-signin-metering branch on GitHub (Delete branch button on PR #1); Claude can't delete branches from here.
- Mike: add MCQ_CLAUDE_KEY as a GitHub repository secret, run the Cost test, and add a real module (e.g. Holderness) to cost-test/modules.
- Claude: build the blind review sheet from the results; Mike rates it; then choose the model and set prices.
- Claude: PR D, Payhip licence keys in the Redeem box (packs of 100, 300 and 800 questions).
- Claude: draft the privacy notice and terms of use for a lawyer to check.
- Then Phase 2 (account page and saved work) when Mike says go.
