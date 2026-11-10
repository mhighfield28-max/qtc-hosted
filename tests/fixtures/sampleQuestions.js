// Three hand-written questions in the section 7 shape, used as test fixtures.
// Question 2 deliberately fails the option-length and distractor checks.

export const SAMPLE_QUESTIONS = [
  {
    id: 'q01',
    status: 'draft',
    level: 'Remember',
    knowledgeType: 'Factual',
    outcome: 'LO1',
    stem: 'At sea-level atmospheric pressure, what is the boiling point of pure water?',
    options: [
      { label: 'A', text: '90 °C', isKey: false, misconception: 'Boiling point is the temperature at which bubbles first appear' },
      { label: 'B', text: '100 °C', isKey: true },
      { label: 'C', text: '110 °C', isKey: false, misconception: 'Water has to be heated above boiling point before it boils' },
    ],
    sourcePassage: 'Week 1 notes, p. 2: at standard atmospheric pressure (101.3 kPa) pure water boils at 100 °C.',
    checks: { tags: true, newCase: true, oneKey: true, optionLength: true, noBannedForms: true, distractorsLinked: true },
    rejectReason: null,
  },
  {
    id: 'q02',
    status: 'draft',
    level: 'Understand',
    knowledgeType: 'Conceptual',
    outcome: 'LO1',
    stem: 'Why does water boil at a lower temperature at the top of a mountain than at sea level?',
    options: [
      { label: 'A', text: 'The air pressure on the water is lower', isKey: true },
      { label: 'B', text: 'The air is colder, so it cools the pan', isKey: false, misconception: 'Higher means colder, so lower boiling point' },
      { label: 'C', text: 'There is less oxygen dissolved in the water', isKey: false, misconception: 'Boiling depends on the oxygen content of the air' },
      { label: 'D', text: 'Water is purer there', isKey: false },
    ],
    sourcePassage: 'Week 3 slides, p. 10: a liquid boils when its vapour pressure equals the pressure above it. Air pressure falls with altitude.',
    checks: { tags: true, newCase: true, oneKey: true, optionLength: false, noBannedForms: true, distractorsLinked: false },
    rejectReason: null,
  },
  {
    id: 'q03',
    status: 'draft',
    level: 'Apply',
    knowledgeType: 'Procedural',
    outcome: 'LO2',
    stem: 'A walker heats water in a pressure cooker at 3,000 m. What happens to its boiling point compared with an open pan beside it?',
    options: [
      { label: 'A', text: "It falls below the open pan's", isKey: false, misconception: 'Higher means colder, so lower boiling point' },
      { label: 'B', text: 'It stays at 100 °C', isKey: false, misconception: '100 °C is a fixed property of water' },
      { label: 'C', text: "It rises above the open pan's", isKey: true },
    ],
    sourcePassage: 'Week 3 slides, p. 12: boiling point depends on pressure. Raising the pressure above a liquid raises its boiling point.',
    checks: { tags: true, newCase: true, oneKey: true, optionLength: true, noBannedForms: true, distractorsLinked: true },
    rejectReason: null,
  },
]
