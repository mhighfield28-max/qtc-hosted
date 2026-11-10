# Questions That Count — hosted version

This repo is the hosted, multi-user version of the Questions That Count MCQ generator. It started as a copy of the course build (`mcq-generator-new`, 27 Oct 2026). The course repo stays as learners see it; all hosted work happens here.

## Start of every session

Before doing anything else, read these files in full:

1. `docs/hosted-brief.md`: what the hosted product is, the decisions made, its build phases and current status. **This brief wins** wherever it differs from the course build brief.
2. `docs/house-rules.md`: Part A, the rules every generated question must follow
3. `docs/build-brief.md`: the course build brief. It still describes the five screens, the question data model and the export formats. Its "one user, nothing saved in the cloud" scope is replaced by the hosted brief.
4. `docs/part-b-template.md`: Part B, the module-specific specification

If a request conflicts with these files, point out the conflict and ask before going ahead.

## How to build

- Build **one phase at a time**, in the order given under "Build phases" in the hosted brief. Do not start the next phase until the user says so.
- A phase is finished only when every item in its definition of done has been **shown working**, not just written. Things that can only be shown on AWS are listed separately as "to check after deploy".
- At the end of each phase, report each item as done or not done with evidence. Then update the Status and Next sections of `docs/hosted-brief.md`.
- Keep the rules from section 2 of the course build brief: the specification is loaded, never hard-coded; the key never reaches the browser; no student data; nothing exported without review; generation and export stay separate.
- The same code must deploy into a customer's own AWS account. Nothing account-specific (domains, prices, emails) is hard-coded outside `config/`.
- Explain progress and decisions in plain English: the user is a learning designer, not necessarily a developer. In anything written for him, never put a comma before "and".
