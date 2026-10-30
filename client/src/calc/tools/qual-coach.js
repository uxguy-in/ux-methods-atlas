// Coaching shown beside each step of the interview coding workbench: how to do the step well, good and weak examples,
// common mistakes and memo prompts. Plain data, British English, written for researchers new to qualitative coding.
// Sources: Strauss and Corbin (1998) for open, axial and selective coding and the paradigm model; Charmaz (2014) for
// initial and focused coding and memo writing; Saldaña (2021) for in-vivo coding and code naming; Braun and Clarke
// (2006, 2021) for thematic analysis; Gioia, Corley and Hamilton (2013) for first-order to aggregate dimensions.

export const COACH = {
  prepare: {
    title: 'Preparing transcripts',
    how: [
      'Anonymise before you code: replace names, places, employers and anything else that could identify someone. Codes and quotes travel further than you expect.',
      'Keep one heading per interview (# P3) and a label at the start of each turn (P3:, I:). Turns become the segments you code.',
      'Leave the interviewer’s turns in the text so you can read the question, but exclude them from the analysis so your own words are not counted.',
      'Split very long answers into paragraphs if they change subject; a segment should hold roughly one idea.',
    ],
    good: [['P3: I sit there refreshing my inbox waiting for the code.', 'One speaker, one idea, anonymised.']],
    weak: [['Ten minutes of transcript pasted as one block with no labels.', 'Nothing to code against: every code lands on the same segment.']],
    mistakes: ['Coding before anonymising, then sharing the export.', 'Counting interviewer turns as data.', 'Splitting mid-sentence so quotes lose their meaning.'],
    memos: ['What surprised you in this interview before you started coding?', 'Was anything said off the record or after recording stopped that you must leave out?'],
  },
  open: {
    title: 'Open coding',
    how: [
      'Read the whole interview once before coding. Then go segment by segment and ask: what is happening here? What is this person doing, feeling or worrying about?',
      'Name codes with verbs where you can (“Checking whether it worked”, “Working around the app”). Gerunds keep you close to action rather than topics (Charmaz 2014).',
      'Use the participant’s own striking words as in-vivo codes when they capture something your words would flatten (“felt like a lottery”).',
      'Write a one-line definition the moment you create a code, with what it includes and excludes. Future you, and a second coder, will need it.',
      'Compare constantly: before applying a code, look at the other segments that carry it. Do they really belong together?',
    ],
    good: [
      ['Unsure if it went through', 'Names what the person experiences; could apply across prescriptions and results.'],
      ['Phones to check status', 'An action, with a clear boundary from other phone calls.'],
      ['“felt like a lottery”', 'In vivo: the participant’s metaphor carries meaning a summary would lose.'],
    ],
    weak: [
      ['Prescriptions', 'A topic, not an insight: it says what was discussed, not what is going on.'],
      ['Negative', 'Too broad: sentiment is not a code, and almost everything will fit.'],
      ['P1 phone queue 23rd at 8am', 'Too specific: a description of one segment that will never apply again.'],
    ],
    mistakes: [
      'Coding topics (“login”, “pricing”) instead of meanings (“locked out of own record”).',
      'Creating a code per segment, so nothing ever compares.',
      'Never writing definitions, so the same code drifts in meaning over the project.',
      'Letting “words worth a look” or topic models do the coding for you. They point at text; you decide what it means.',
    ],
    memos: [
      'What is this person trying to achieve, and what gets in the way?',
      'How is this segment like, and unlike, the last one with this code?',
      'What would I need to see to drop or split this code?',
      'What assumption am I bringing to this segment?',
    ],
  },
  axial: {
    title: 'Axial coding and themes',
    how: [
      'Group codes that answer the same question into categories. A category is a higher-level idea; for thematic analysis treat it as a theme and give it a sentence saying what it claims.',
      'Use the paradigm model as a prompt, not a form: under what conditions does this happen, in what context, what do people do, and what follows?',
      'Read the co-occurrence table for codes that keep landing on the same segments: they may be one idea (merge) or a cause and effect (relate them).',
      'Read the interview matrix for codes that only one or two people mention: are they rare but important, or noise?',
      'Merge codes that mean the same thing, split codes that have grown two meanings, and rename codes whose names no longer fit.',
    ],
    good: [
      ['Left guessing after acting', 'Says something: a theme with a claim that connects several codes.'],
      ['Getting seen is a lottery', 'Links conditions (no slots) to actions (8am race) and consequences (stress).'],
    ],
    weak: [
      ['Appointments', 'A bucket of everything said about appointments; a topic summary, not a theme (Braun and Clarke 2021).'],
      ['Other', 'A category for leftovers hides codes you have not yet thought about.'],
    ],
    mistakes: [
      'Grouping by interview question (“Q3 answers”) rather than by meaning.',
      'Forcing every code into a category; some are real outliers worth reporting.',
      'Reading co-occurrence counts as causes. Two codes on one segment means they were said together, not that one led to the other.',
    ],
    memos: [
      'What story does this category tell, in one sentence?',
      'Which codes sit uneasily in it, and why?',
      'Where does this category connect to another one?',
    ],
  },
  selective: {
    title: 'Selective coding and the storyline',
    how: [
      'Choose a core category: the idea that the most other categories relate to, that appears often, and that explains variation between people (Strauss and Corbin 1998).',
      'Write the storyline memo: a few sentences that tell what is going on in the whole data set, using your categories as the vocabulary.',
      'Go back to the data and check the storyline against cases that do not fit. Negative cases sharpen the account.',
      'Pick example quotes that show the theme clearly, from different participants, and that you can share safely.',
    ],
    good: [['“The app confirms the action and then goes quiet, so people fill the silence with calls and worry.”', 'A storyline: explains, connects categories, and can be checked against the data.']],
    weak: [['“Users had many issues with the app.”', 'A summary with no explanation; it could be said of any study.']],
    mistakes: ['Picking the most frequent category as core without asking whether it explains the others.', 'Choosing quotes that are vivid but from one talkative participant.', 'Ignoring the cases that contradict the storyline.'],
    memos: ['Which participant fits the storyline least well, and what does that tell you?', 'If you had to brief a designer in two sentences, what would you say?'],
  },
  sentiment: {
    title: 'Sentiment as a rough guide',
    how: [
      'Use sentiment to find segments worth re-reading, such as strongly negative moments inside an otherwise positive theme.',
      'Check the words the score is built on (shown on each segment) and override labels you disagree with.',
      'Report sentiment alongside quotes, never alone: “mostly negative, for example …”.',
    ],
    good: [['“Prescriptions read as positive, appointments as negative”, with quotes', 'A contrast you can show and explain.']],
    weak: [['“Overall sentiment was −0.12”', 'A number with no meaning to a reader, from a word list that cannot hear tone.']],
    mistakes: ['Trusting scores on sarcasm (“Oh great, another code”).', 'Comparing sentiment between studies or tools with different word lists.', 'Averaging away mixed feelings that are the actual finding.'],
    memos: ['Where does the score disagree with your reading, and why?'],
  },
  patterns: {
    title: 'Topic models and latent classes',
    how: [
      'Treat topics as prompts: read the top words and the most representative segments, then ask whether your codebook already covers that idea.',
      'Change the number of topics and the seed. Topics that keep reappearing are more worth a look than ones that come and go.',
      'Use latent classes to ask “do some interviews share a pattern of codes?”, then re-read those interviews together. With a handful of interviews, treat any classes as a hunch.',
    ],
    good: [['“Topic 2 (pharmacy, ready, collect) matches our code Unsure if it went through; topic 4 (account, mum) suggests we under-coded proxy access.”', 'Uses the model to check the coding.']],
    weak: [['“LDA found four themes in our interviews.”', 'Topics are word co-occurrence patterns, not themes; with six interviews they are unstable.']],
    mistakes: ['Reporting topics as findings.', 'Running LDA on a few thousand words and trusting the result.', 'Reading latent classes as personas without checking them in the transcripts.'],
    memos: ['Which topic surprised you, and is it in the data or an artefact of the stopwords?'],
  },
  export: {
    title: 'Exporting and saving',
    how: [
      'Save the project file whenever you stop: nothing is stored in your browser, and closing the tab loses unsaved work.',
      'Share the codebook with definitions and an example quote for each code, so others can audit your coding.',
      'For check-coding, give a colleague the blind sheet (text without your codes), then paste their codes back to get the inter-coder input.',
    ],
    good: [], weak: [],
    mistakes: ['Emailing the project file with un-anonymised transcripts.', 'Sharing counts without definitions.'],
    memos: [],
  },
};
