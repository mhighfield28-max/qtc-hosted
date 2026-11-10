# Questions That Count — Build Brief

Hand this brief to Claude Code once, to build the app. It pairs with the Specification Template: the specification says what a good question is and is read by the AI every time it writes questions; this brief says what the app does, what it looks like and when each build phase is finished.

How to use it: put this file in your project's docs folder, next to house-rules.md and your Part B. Claude Code reads all three. Build one phase at a time, in order.

## 1. What we're building

A web app that turns a completed specification and a module's teaching content into a reviewed, ready-to-import set of multiple choice questions.

- **User:** one lecturer or learning designer, working alone, on a laptop browser.
- **One job:** specification + content in, reviewed questions out, imported into the LMS.
- **In scope:** single best answer questions, 20/30/40-question sets, Moodle GIFT and Blackboard export, a review sheet.
- **Out of scope for now:** student accounts, delivering tests, other question types, QTI export, multiple users, saving work in the cloud.

## 2. Rules the build must follow

These are non-negotiable. If a phase can't meet one, stop and say so.

1. **The specification is loaded, never hard-coded.** The app sends the specification's text to the AI as its instructions on every generation. Changing the specification changes the questions without touching code.
2. **The API key never reaches the browser.** All AI calls go through a server function that holds the key. A visitor viewing the page source must not find it.
3. **No student data.** The app accepts teaching materials only. Show a one-line reminder on the upload screen.
4. **Nothing is exported without review.** Only questions the user has approved go into an export file.
5. **Generation and export stay separate.** Questions are stored in one internal format (section 7); each export format is a separate converter from that format.
6. **Stack:** React with Tailwind, the Claude API, deployed on AWS Amplify, with the AI call in a Lambda function. Keep the model name in one settings file so it can be changed later.

## 3. Screens and fields

Five screens in a fixed order, shown as numbered steps across the top. The user can go back to any earlier step; going forward requires the current step to be complete.

1. **Set up.** A form that mirrors Part B of the specification. Part A is loaded from a file and shown read-only, with an "Edit house rules" link that warns *"Only change a rule if you can say why."*
2. **Content.** Upload teaching materials: PDF, Word, PowerPoint or pasted text, up to 20 files. Show each file's name, size and a "read OK" tick once its text has been extracted.
3. **Generate.** A summary of what will be asked for (count per level, total time against time available), then one Generate button. Show progress question by question. Warn before generating if the time doesn't fit or the weight is above 30%.
4. **Review.** One card per question (section 4).
5. **Export.** Choose formats, download files (section 5).

**Set-up form fields**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| Module name and code | Text | Yes |  |
| Level of study | Dropdown | Yes | UG Y1, UG Y2, UG Y3, Master's, Professional. Fills the default distribution |
| Learning outcomes | Repeating rows: outcome text + target level | Yes, at least 1 | Level is a dropdown, Remember to Evaluate |
| Cases and examples used in teaching | Repeating text rows | Yes, at least 1 | Help text: *"Higher-order questions won't reuse these"* |
| Misconceptions | Repeating text rows: one misconception per row | Yes, at least 2 | Distractors are built from these |
| Distribution | Five number fields, Remember to Evaluate | Yes | Pre-filled from level of study; must total the question count; a reason box appears if changed |
| Number of questions | Dropdown | Yes | 20, 30, 40 |
| Time available | Number, minutes | Yes | Live estimate shown beside it |
| Share of module grade | Number, % | Yes | Warning above 30% |
| Export formats | Checkboxes | Yes | Moodle GIFT, Blackboard |

The form also offers **Import specification** (upload a completed template) and **Download specification**, so a set-up is never typed twice.

## 4. Review and editing

The review screen is where the user's judgement happens, so it gets the most care. Each question is one card; approved questions are the only ones exported.

**When this is built:** everything in this section is part of **Phase 2**. A review screen that only displays questions is not finished. Without Edit, Approve and Reject the user can't approve anything, and so nothing can ever be exported (rule 4).

**Each card shows**

- Question number, level tag and knowledge-type tag
- The stem and the options, with the key marked
- Under each distractor: the misconception it represents
- The source passage the question was based on, collapsed by default
- The A5 checks as a row of pass/fail chips; a failed chip says why on hover
- Status: Draft, Approved or Rejected

**Actions on each card**

- **Edit** any text in place: stem, options, key, tags, misconception links. An Edit button turns the card into a form; Save keeps the changes and Cancel discards them. Checks re-run on save. Editing an approved question returns it to Draft, so it must be approved again.
- **Regenerate** this question only, with an optional note ("make it harder", "use a different case"). A flagged question (one the AI failed to write) shows this button too.
- **Approve** or **Reject**, as two buttons on every card. The status chip changes straight away. Rejecting asks for an optional reason, kept for the record in `rejectReason`. A rejected or approved question can be set back to Draft.
- Approving a question that has failed checks is allowed, but the card asks the user to confirm first.

**Across the set**

- A summary bar: approved / total, count per level against the distribution, estimated time against time available
- Filters: by level, by status, failed checks only
- Key-position balance shown as A/B/C/D counts
- "Approve all passing" is not offered: each question is approved on its own

## 5. Output

Export is blocked until at least one question is approved, and warns if the approved set no longer matches the distribution.

| File | Format | Contents |
| --- | --- | --- |
| Moodle import | `.txt`, GIFT | Approved questions, one per block, with special characters escaped |
| Blackboard import | `.txt`, tab-delimited | Approved questions, one per line, MC type |
| Review sheet | `.docx` or `.pdf` | Every approved question with its key, level, knowledge type, the misconception behind each distractor and the source passage, for moderation and external examiners |
| Specification used | `.md` | The exact specification the set was generated from, so the set can be reproduced |

All four download together as one `.zip` named after the module code and date.

## 6. Look and feel

Calm, plain and readable: a working tool for an academic, not a marketing page. Put every colour and font in one theme file so a participant can restyle it as their own.

| Element | Default |
| --- | --- |
| Header and dark panels | Field Ink `#243428` |
| Secondary green, tags, links | Deep Field `#2D6A5F` |
| Accent, primary buttons only | Spark `#E09830`, never as text on light backgrounds |
| Page background | Cream `#F5F2EC`; cards white with a `#E3DFD4` border |
| Body text | Near Black `#1A1C19`; secondary text `#6B6F68` |
| Pass / fail | Green and red, always with an icon and a word, never colour alone |
| Headings | Syne, 500 weight |
| Body | Inter, 16 px minimum |

**Layout:** a single centred column up to 960 px wide; the step bar fixed at the top; cards with generous padding; one primary button per screen, bottom right.

**Accessibility:** meets WCAG 2.1 AA. Every field has a visible label, everything works by keyboard, focus is always visible, and text contrast is at least 4.5:1.

## 7. Data model

Every question is stored in this one shape. The AI is asked to return exactly this JSON; the review screen edits it; each exporter converts it.

```json
{
  "id": "q07",
  "status": "draft",
  "level": "Apply",
  "knowledgeType": "Procedural",
  "outcome": "LO2",
  "stem": "A walker heats water in a pressure cooker at 3,000 m. What happens to its boiling point compared with an open pan beside it?",
  "options": [
    { "label": "A", "text": "It rises above the open pan's", "isKey": true },
    { "label": "B", "text": "It stays at 100 °C", "isKey": false, "misconception": "100 °C is a fixed property of water" },
    { "label": "C", "text": "It falls below the open pan's", "isKey": false, "misconception": "Higher means colder, so lower boiling point" }
  ],
  "sourcePassage": "Week 3 slides, p. 12: boiling point depends on pressure...",
  "checks": { "tags": true, "newCase": true, "oneKey": true, "optionLength": true, "noBannedForms": true, "distractorsLinked": true },
  "rejectReason": null
}
```

The set as a whole stores the specification used, the module code and the generation date. Distribution and time checks are calculated across the set, not stored per question.

## 8. Build phases and definition of done

Build one phase at a time. A phase is finished only when Claude Code has shown every item below working, not just written the code.

**Note on renumbering (20 Oct 2026):** an earlier version of this brief had five phases, with review and editing as a separate Phase 3. When the phases were merged into four, review and editing moved into Phase 2 and Phase 3 became Export. Code written to the old plan says "coming in Phase 3" on the review screen. That work now belongs to Phase 2. Before Phase 2 is signed off, check that it is built, and don't wait for Phase 3.

### Phase 1: Build the interface (Module 6)

The screens, text, graphics and input fields. No AI yet.

- [ ] All five steps visible in the step bar; back and forward work
- [ ] Set-up form validates every required field and pre-fills the distribution from level of study
- [ ] Import and download a specification file
- [ ] Upload shows extracted text for PDF, Word and PowerPoint
- [ ] Review screen renders three hard-coded sample questions in the section 7 shape
- [ ] Theme file controls every colour and font

### Phase 2: Generate and review (Module 6)

Connect to Claude through the Claude API with your API key, generate questions, check them, and review them.

- [ ] Generate sends the specification as the AI's instructions and the content as source material
- [ ] All AI calls go through a server function; it works on the laptop and on Amplify; the key never reaches the browser
- [ ] The AI's reply is checked against the section 7 shape; a malformed question is retried once, then flagged
- [ ] A5 checks run on every question and show on its card
- [ ] Review: every card has working Edit, Save and Cancel; edited text is kept, and checks re-run on save
- [ ] Review: every card has working Approve and Reject buttons; the status chip updates, and a reject reason is stored
- [ ] Review: Regenerate replaces one question only (including a flagged one), using the optional note
- [ ] Review: approved questions reach the Export screen, and draft or rejected ones don't
- [ ] Summary bar, filters and key-position balance update live
- [ ] No screen still shows a "coming in Phase …" notice for anything this phase covers
- [ ] The model name lives in one settings file
- [ ] Tested with a real module: higher-order questions use cases not listed in B2, and distractors come from B3

### Phase 3: Export to the LMS (Modules 7 and 8)

- [ ] All four files download in one zip, approved questions only
- [ ] A GIFT file imports cleanly into a Moodle sandbox
- [ ] A Blackboard file imports cleanly into a Blackboard test course, or passes the validator if no Blackboard is available
- [ ] Special characters in a stem (colons, braces, quotes, °C) survive the round trip

### Phase 4: Go live and next steps (Module 9 onwards)

- [ ] Live on Amplify at its own address
- [ ] The API key is not visible anywhere in the browser or the page source
- [ ] A first real set of 20 questions generated, reviewed and imported for one of your own modules
- [ ] A short list of what this prototype doesn't do yet, and what you'd change next
