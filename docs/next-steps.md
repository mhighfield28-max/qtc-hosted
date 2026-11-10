# What this prototype doesn't do yet, and what to change next

Draft written at the start of Phase 4. Update it after the first real set of 20 has been generated, reviewed and imported.

## What it doesn't do yet

1. **No login.** Anyone who finds the server function's address could use it, and every use is paid for by the API key. Only the app's own site can call it from a browser, but a determined person could still call it directly. Until there's a login, set a monthly spend limit on the key in the Claude Console.
2. **Work isn't saved.** Refreshing or closing the tab loses the set-up, uploads and questions. Download the specification and export before leaving.
3. **One question type.** Single best answer only. No multiple response, matching or numerical questions.
4. **Moodle GIFT and Blackboard only.** No QTI, so no direct import into Canvas or other platforms.
5. **One person at a time.** There's no sharing of a set with a colleague or moderator inside the app; the review sheet is the hand-over.
6. **Amplify address only.** If the app moves to a custom domain, `amplify/backend.ts` must allow that domain too, or generation will stop working there.

## What I'd change next

1. Add a login (Amplify Auth) and require it on the server function.
2. Save work in progress in the browser, so a refresh doesn't lose a set.
3. _(add after the first real set: what went wrong, what took longest in review)_
