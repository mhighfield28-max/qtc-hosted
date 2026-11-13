// HELP TEXT: every "?" button in the app reads its words from here.
//
// To change what a help button says, edit the title or body below and save.
// - title: one short line, shown in bold. Also read out by screen readers as "Help: <title>".
// - body: a list of paragraphs. To show bullet points, put { list: ['…', '…'] } in place of a paragraph.
// Keep each one short: a lecturer should be able to read it in under 30 seconds.
// Numbers that come from the settings (the word limit, questions per code) fill themselves in.

import hosted from '../../config/hosted.json'

const words = (n) => n.toLocaleString('en-GB')
const MAX_WORDS = words(hosted.maxWordsPerSet)
const WRITES_PER_20 = Math.ceil(20 * hosted.callsPerQuestion)

const HELP = {
  // ---------- Set up ----------

  specParts: {
    title: 'What are Part A and Part B?',
    body: [
      'The specification is the brief the questions are written from. It has two parts.',
      {
        list: [
          'Part A: house rules, the same for every module. They say how every question is written and checked.',
          'Part B: your module. You fill it in on this page.',
        ],
      },
      'Download saves both parts in one file. Keep it to reuse next time, or share it with a colleague. Import reads a saved file back in.',
    ],
  },

  houseRules: {
    title: 'The house rules',
    body: [
      'These are the rules every question follows, for example: one best answer; the level is set by what the student must do, not by the verb; wrong answers are built from real mistakes.',
      'Most people never change them. If you do, be ready to say why: the downloaded specification notes that Part A was edited.',
    ],
  },

  moduleName: {
    title: 'Module name and code',
    body: [
      'The name and code students know the module by, for example "PHY101 Introductory Mechanics".',
      'It appears on the exported files and the review sheet.',
    ],
  },

  studyLevel: {
    title: 'Level of study',
    body: [
      "This sets the starting mix of Bloom's levels in B4. First-year papers lean towards Remember and Understand. Later years and Master's papers ask for more Apply, Analyse and Evaluate.",
      'You can change the mix in B4.',
    ],
  },

  outcomes: {
    title: 'Learning outcomes and target levels',
    body: [
      'Copy the learning outcomes from your module handbook, one per box. Every question is written against one outcome, so the paper covers what you said students would learn.',
      "Target level: the highest Bloom's level the outcome asks for. Judge it by what students must do, not by the verb.",
      {
        list: [
          '"List the stages of mitosis": Remember',
          '"Explain why the stages happen in this order": Understand',
          '"Predict the effect of a new drug on cell division": Apply',
        ],
      },
    ],
  },

  cases: {
    title: 'Why list cases and examples?',
    body: [
      'List the worked examples, case studies, data sets and scenarios you used in teaching, for example "the Northern Rock collapse" or "the pendulum lab". Short names are fine.',
      'Remember and Understand questions can use them. Apply, Analyse and Evaluate questions must not: if students have already seen a case worked through, the question only tests their memory of it.',
      'Listing them tells the generator which cases to avoid, so it writes new ones for the higher-order questions.',
    ],
  },

  misconceptions: {
    title: 'Why list misconceptions?',
    body: [
      'Wrong answers (distractors) only work when they are mistakes students really make. Invented ones are easy to rule out, so the question gets easier than it looks.',
      'List the errors you correct every year in marking, for example "thinks heavier objects fall faster". The generator builds distractors from these.',
      'Two is the minimum. Five to ten gives better questions.',
    ],
  },

  questionCount: {
    title: 'Number of questions',
    body: [
      'How many questions the set will have.',
      'Each question is counted once, when it is first written. Regenerating a question later does not count again.',
    ],
  },

  distribution: {
    title: "Bloom's levels in this paper",
    body: [
      'How many questions at each level. It starts with the recommended mix for your level of study.',
      {
        list: [
          'Remember: recall a fact or idea as taught',
          'Understand: explain, classify or compare ideas as taught',
          'Apply: use a principle on a case not seen before',
          'Analyse: work out relationships in unseen material',
          'Evaluate: judge options and justify the choice',
        ],
      },
      'Change the mix if your outcomes need a different balance. You will be asked to note why, and the reason goes in the specification. Higher levels take students longer, so the time estimate changes too.',
    ],
  },

  timeAvailable: {
    title: 'Time available',
    body: [
      'The minutes students have for this paper.',
      'The estimate uses typical times per question: Remember is quickest, Evaluate takes longest. If the paper does not fit, reduce the higher-level questions or allow more time.',
    ],
  },

  gradeShare: {
    title: 'Share of the module grade',
    body: [
      'What percentage of the module grade this paper is worth.',
      'The house rules flag anything above 30%. Multiple choice tests some things well, but it should not be the only way students are assessed.',
    ],
  },

  exportFormats: {
    title: 'Export formats',
    body: [
      'Which files you want at the end, for the learning platform you use. You can change this on the Export screen.',
    ],
  },

  // ---------- Content ----------

  whatToUpload: {
    title: 'What to upload',
    body: [
      'Questions are written only from what you upload, so upload what you actually taught.',
      {
        list: [
          'Best: lecture slides (with speaker notes if you have them), teaching notes, handouts, lab or seminar sheets',
          'Also good: set readings and lesson plans',
          'Not enough on its own: a syllabus or module outline. It lists the topics but not what was taught about them.',
        ],
      },
      'Upload only the material this paper covers. Extra topics dilute the questions.',
    ],
  },

  wordLimit: {
    title: `Why ${MAX_WORDS} words?`,
    body: [
      `Each set can use up to ${MAX_WORDS} words of teaching material. That keeps every question tied closely to what was taught, and keeps the cost of a set predictable.`,
      'A rough guide:',
      {
        list: [
          '100 slides with short bullet points: about 3,000 to 5,000 words',
          'The same slides with full speaker notes: about 10,000 to 15,000 words',
          '10 pages of a Word document: about 5,000 words',
          'A journal article: about 6,000 to 8,000 words',
          'A textbook chapter: about 8,000 to 12,000 words',
        ],
      },
      'Over the limit? Remove material this paper does not cover, or split the topic into two sets.',
    ],
  },

  copyright: {
    title: 'Copyright and your materials',
    body: [
      'Material you wrote yourself (your slides, notes and handouts) is always fine and gives the best questions.',
      'Published material, such as journal articles or textbook chapters, may be covered by your institution\'s licence for teaching use. If you are not sure, ask your library before uploading it.',
      'The questions themselves are new writing, not copies of your sources.',
    ],
  },

  privacy: {
    title: 'What happens to your materials',
    body: [
      'Your files are read in your browser. The files themselves are not uploaded: only the text from them is sent, encrypted, to write the questions.',
      'Questions That Count does not store your materials. The AI provider, Anthropic, deletes them automatically within 30 days and its business terms do not allow it to train AI models on them. The one exception: if a request is flagged by Anthropic\'s safety checks, it can be kept longer for review.',
      'Close the tab and your materials are gone. Download your specification and questions before you leave.',
      'Never upload anything that contains student data: names, marks, submissions or feedback.',
    ],
  },

  // ---------- Generate ----------

  counting: {
    title: 'How questions are counted',
    body: [
      'Each question is counted once, when it is first written.',
      `Regenerating a question in Review does not count again. A set can write up to ${hosted.callsPerQuestion} times its size in total, so a set of 20 can make up to ${WRITES_PER_20} writes, regenerations included.`,
      'A question the AI cannot write (flagged) costs nothing.',
    ],
  },

  generating: {
    title: 'What happens when you generate',
    body: [
      'Each question is written separately, against one outcome and one level, using only your materials and the house rules. It is then checked against the house rules.',
      'If a question cannot be written well from your materials, it is flagged instead of guessed. You can regenerate it in Review, or go back and add material.',
      'Keep this tab open while it runs. You can stop at any point and write the rest later.',
    ],
  },

  // ---------- Review ----------

  reviewing: {
    title: 'How to review',
    body: [
      'Read each question as a student would. Then approve it, edit it or reject it. Only approved questions are exported.',
      'The checks under each question are automatic. A failed check means look closely, not that the question must go.',
      'Regenerate writes a new version at the same level and outcome. Add a note to steer it, for example "use a clinical example". It does not count as a new question.',
    ],
  },

  summary: {
    title: 'The summary',
    body: [
      'Approved / planned shows how many questions you have approved at each level against the mix you set in B4.',
      'Key positions shows how often the correct answer is A, B, C or D. They should be roughly even, so students cannot guess from position.',
    ],
  },

  // ---------- Export ----------

  exporting: {
    title: 'What you download',
    body: [
      'One .zip file with the approved questions in the formats you choose, a review sheet listing every question with its level and outcome, and the specification used.',
      'Keep the review sheet and specification with your exam records: they show how the paper was designed.',
    ],
  },

  // ---------- Account ----------

  redeem: {
    title: 'Codes',
    body: [
      `An invite code adds ${hosted.betaCodeQuestions} questions to your account. Each code works once.`,
      'Codes look like QTC-ABCD-2345. Capital letters and dashes are optional.',
    ],
  },
}

export default HELP
