// Weak vs strong: small before/after examples of research artefacts (questions, scripts, charts, readouts),
// each with a weak and a strong version and the changes that make the strong one better.
// Plain data with no React, so the /demos page, the strips on method and calculator pages, the bias map
// and `npm run check:demos` all read the same list. Written for this site; British English; every example is made up.
//
// Each demo:
//   id, title, kind (a key of KINDS), problem (one sentence on what goes wrong in the weak version),
//   weak and strong: { blocks: [...] } where a block is one of
//     { t: 'p', text, label? }                       a paragraph (label: a small heading above it)
//     { t: 'q', text, options, multi?, note? }       a survey or screener item with its answer options
//     { t: 'list', items, ordered?, label? }         a list of lines
//     { t: 'quote', text, who, codes }               a coded quote
//     { t: 'table', head, rows, caption? }           a small table (cells are strings)
//     { t: 'bars', title, bars: [{ label, sub?, value, lo?, hi? }], min, max, ticks, unit?, note? }
//     { t: 'line', title, values, labels, min, max, ticks, threshold?: { value, label }, mark?: index, note? }
//   annotations: 2-4 of { mark, note }; mark is text that appears word for word in the strong version and is
//     highlighted there; note says what changed and why it helps.
//   biases: ids from biases.js; methods: atlas method ids; calcs: calculator ids (calc/catalog.js);
//   tryIt: a short prompt to apply the idea to your own work.

export const KINDS = [
  { id: 'interview', name: 'Interview question', short: 'Interview' },
  { id: 'survey', name: 'Survey question', short: 'Survey' },
  { id: 'task', name: 'Task scenario', short: 'Task' },
  { id: 'screener', name: 'Screener', short: 'Screener' },
  { id: 'consent', name: 'Consent and intro script', short: 'Consent' },
  { id: 'reporting', name: 'Result reporting', short: 'Reporting' },
  { id: 'chart', name: 'Chart', short: 'Chart' },
  { id: 'sampling', name: 'Sampling', short: 'Sampling' },
  { id: 'coding', name: 'Coding', short: 'Coding' },
  { id: 'insight', name: 'Recommendation and insight writing', short: 'Insight' },
  { id: 'ab', name: 'A/B readout', short: 'A/B' },
];

const FIVE_SAT = ['Very dissatisfied', 'Dissatisfied', 'Neither satisfied nor dissatisfied', 'Satisfied', 'Very satisfied'];

export const DEMOS = [
  // ---------------------------------------------------------------- interview questions
  {
    id: 'leading-interview-question',
    title: 'A leading interview question',
    kind: 'interview',
    problem: 'The question tells the participant the answer you hope for, and most people are polite enough to give it.',
    weak: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'Don’t you find the new dashboard much easier to use?' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'Tell me about the last time you opened the dashboard. What were you trying to do?' },
      { t: 'p', label: 'Follow-up', text: 'What happened next?' },
    ] },
    annotations: [
      { mark: 'the last time you opened the dashboard', note: 'Anchors the answer in one real, recent visit instead of a general opinion.' },
      { mark: 'What were you trying to do?', note: 'Open and neutral: it does not mention ease, newness or any answer you would like to hear.' },
      { mark: 'What happened next?', note: 'A neutral follow-up keeps the story going without steering it.' },
    ],
    biases: ['leading-questions', 'demand-characteristics', 'social-desirability-bias'],
    methods: ['interviews', 'customer-problem-interviews', 'critical-incident-technique'],
    calcs: [],
    tryIt: 'Take the last discussion guide you wrote and underline every adjective in a question. Each one is a candidate for a leading word.',
  },
  {
    id: 'hypothetical-interview-question',
    title: 'Asking about the future instead of the past',
    kind: 'interview',
    problem: 'People are poor at predicting what they would do, and saying yes to a feature costs them nothing.',
    weak: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'Would you use a feature that exported your reports to PDF?' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'When did you last need to share a report with someone outside your team?' },
      { t: 'p', label: 'Follow-up', text: 'Walk me through how you did it. What was annoying about it?' },
    ] },
    annotations: [
      { mark: 'When did you last need', note: 'Asks about past behaviour, which people can report, not a prediction they will not be held to.' },
      { mark: 'Walk me through how you did it', note: 'The workaround they use today shows how big the need really is.' },
      { mark: 'What was annoying about it?', note: 'Lets the pain come from them rather than from your feature idea.' },
    ],
    biases: ['hypothetical-bias', 'social-desirability-bias'],
    methods: ['customer-problem-interviews', 'jobs-to-be-done-switch-interviews', 'interviews'],
    calcs: [],
    tryIt: 'Find a “Would you…” question in your guide and rewrite it as “When did you last…”.',
  },
  {
    id: 'why-question',
    title: 'Asking people to explain their own choices',
    kind: 'interview',
    problem: 'A direct “why” invites a tidy, made-up reason; people often do not know what drove a decision.',
    weak: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'Why did you choose the cheaper plan?' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Interviewer', text: 'Take me back to the day you picked a plan. Where were you, and what else did you look at?' },
      { t: 'p', label: 'Follow-up', text: 'What did you do just before you decided?' },
    ] },
    annotations: [
      { mark: 'Take me back to the day', note: 'Rebuilding the setting cues real memories rather than a reason invented on the spot.' },
      { mark: 'what else did you look at', note: 'Asks for things they did and saw, which are easier to report accurately than motives.' },
      { mark: 'just before you decided', note: 'The moment before a choice often holds the trigger that a “why” question misses.' },
    ],
    biases: ['introspection-illusion', 'recall-bias'],
    methods: ['jobs-to-be-done-switch-interviews', 'critical-incident-technique', 'laddering-means-end-chain-analysis'],
    calcs: [],
    tryIt: 'Count the “why” questions in your next guide. Replace half of them with “what happened” or “what did you do”.',
  },

  // ---------------------------------------------------------------- survey questions
  {
    id: 'double-barrelled-question',
    title: 'A double-barrelled survey question',
    kind: 'survey',
    problem: 'Two topics share one answer, so someone happy with speed but not reliability has no honest option.',
    weak: { blocks: [
      { t: 'q', text: 'How satisfied are you with the speed and reliability of the app?', options: FIVE_SAT },
    ] },
    strong: { blocks: [
      { t: 'q', text: 'How satisfied are you with how quickly the app loads?', options: FIVE_SAT },
      { t: 'q', text: 'In the last month, how often has the app stopped working while you were using it?', options: ['Never', 'Once', '2 or 3 times', '4 or more times', 'I have not used it in the last month'] },
    ] },
    annotations: [
      { mark: 'how quickly the app loads', note: 'One topic per item, and a concrete one: loading, not a vague “speed”.' },
      { mark: 'In the last month', note: 'A time window makes the answer comparable between people.' },
      { mark: '4 or more times', note: 'Reliability is asked as a count of events, which people can report better than a feeling.' },
      { mark: 'I have not used it in the last month', note: 'An exit for people who cannot answer, so they do not guess.' },
    ],
    biases: ['satisficing'],
    methods: ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 'cognitive-interviewing-for-questionnaire-design', 'questionnaire-pilot-testing'],
    calcs: ['item-analysis'],
    tryIt: 'Search your survey for “and” and “or” inside a question. Each hit is worth a second look.',
  },
  {
    id: 'unbalanced-scale',
    title: 'An unbalanced rating scale',
    kind: 'survey',
    problem: 'Three of the four options are positive, so the results lean positive whatever people think.',
    weak: { blocks: [
      { t: 'q', text: 'How would you rate the checkout?', options: ['Excellent', 'Very good', 'Good', 'Fair'] },
    ] },
    strong: { blocks: [
      { t: 'q', text: 'How would you rate the checkout?', options: ['Very poor', 'Poor', 'Neither good nor poor', 'Good', 'Very good'] },
    ] },
    annotations: [
      { mark: 'Very poor', note: 'As many negative options as positive ones, so the scale does not push answers one way.' },
      { mark: 'Neither good nor poor', note: 'A labelled midpoint for people with no strong view, instead of forcing them to “Good”.' },
      { mark: 'Very good', note: 'The ends mirror each other in strength, so the distances between options feel even.' },
    ],
    biases: ['framing-effect', 'anchoring', 'leading-questions'],
    methods: ['likert-scale-design', 'anchoring-check-for-survey-questions', 'survey-question-writing-diagnostic-checks-structures-and-wording-principles'],
    calcs: ['rating', 'top-box'],
    tryIt: 'Read the answer options of one of your scales aloud without the question. Can you tell where the middle is?',
  },
  {
    id: 'agree-disagree-items',
    title: 'Agree/disagree items that invite yes-saying',
    kind: 'survey',
    problem: 'Statements to agree with draw agreement from tired or polite respondents, whatever the statement says.',
    weak: { blocks: [
      { t: 'list', label: 'Strongly disagree … Strongly agree', items: [
        'I found the app easy to use.',
        'The app helps me get my work done quickly.',
        'I would be happy to use the app every day.',
      ] },
    ] },
    strong: { blocks: [
      { t: 'q', text: 'How easy or difficult was it to set up your first project?', options: ['Very difficult', 'Difficult', 'Neither easy nor difficult', 'Easy', 'Very easy'] },
      { t: 'q', text: 'About how long did setting up your first project take?', options: ['Under 5 minutes', '5 to 15 minutes', '15 to 30 minutes', 'More than 30 minutes', 'I did not finish'] },
    ] },
    annotations: [
      { mark: 'How easy or difficult', note: 'Names both directions, so neither answer is the default.' },
      { mark: 'set up your first project', note: 'A concrete task people remember, instead of the whole app in general.' },
      { mark: 'Very difficult', note: 'Item-specific answer labels match the question, so there is nothing to simply agree with.' },
      { mark: 'I did not finish', note: 'A behavioural follow-up that does not depend on agreeing at all.' },
    ],
    biases: ['acquiescence-bias', 'satisficing'],
    methods: ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 'likert-scale-design', 'single-ease-question-seq-benchmarking'],
    calcs: ['seq', 'item-analysis'],
    tryIt: 'Take one agree/disagree statement from your survey and rewrite it as a question with its own answer labels.',
  },
  {
    id: 'question-order',
    title: 'Question order that colours the overall rating',
    kind: 'survey',
    problem: 'Asking about problems first puts them front of mind, so the overall rating that follows comes out lower.',
    weak: { blocks: [
      { t: 'list', ordered: true, label: 'Question order', items: [
        'Which of these problems have you had with deliveries? (late, damaged, wrong item, missing)',
        'How annoying was the worst problem?',
        'Overall, how satisfied are you with our delivery service?',
      ] },
    ] },
    strong: { blocks: [
      { t: 'list', ordered: true, label: 'Question order', items: [
        'Overall, how satisfied are you with our delivery service?',
        'Which of these, if any, have happened with your deliveries? (shown in random order)',
        'Tell us about the most recent one.',
      ] },
    ] },
    annotations: [
      { mark: 'Overall, how satisfied are you with our delivery service?', note: 'The general question goes first, before any specific item can prime it.' },
      { mark: 'if any', note: 'Allows for no problems at all, rather than assuming there were some.' },
      { mark: 'shown in random order', note: 'Randomising the list spreads any order effect across the options.' },
      { mark: 'the most recent one', note: 'Asks about a specific occasion, not the most vivid one.' },
    ],
    biases: ['question-order-effects', 'anchoring', 'availability-heuristic'],
    methods: ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 'questionnaire-pilot-testing'],
    calcs: ['counterbalancing'],
    tryIt: 'Find your survey’s overall rating question. Is anything asked before it that could change how people feel?',
  },
  {
    id: 'sensitive-behaviour-question',
    title: 'A question with an obvious “good” answer',
    kind: 'survey',
    problem: 'When one answer sounds responsible, people give it, so you measure what people think they should do.',
    weak: { blocks: [
      { t: 'q', text: 'Do you always read the terms and conditions before you agree to them?', options: ['Yes', 'No'] },
    ] },
    strong: { blocks: [
      { t: 'q', text: 'The last time you signed up for an app, what did you do with the terms and conditions?', options: ['Read them all', 'Read some parts', 'Scrolled past without reading', 'Can’t remember'] },
    ] },
    annotations: [
      { mark: 'The last time you signed up', note: 'One specific occasion is harder to answer with an ideal than “always”.' },
      { mark: 'Scrolled past without reading', note: 'Wording the common behaviour plainly and without judgement makes it easier to admit.' },
      { mark: 'Can’t remember', note: 'An honest way out, so people do not pick the respectable answer by default.' },
    ],
    biases: ['social-desirability-bias', 'recall-bias'],
    methods: ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 'list-experiment-item-count-technique'],
    calcs: ['sensitive-questions'],
    tryIt: 'Is there a question in your survey where you would be slightly embarrassed to give one of the answers? Reword it.',
  },

  // ---------------------------------------------------------------- task scenarios
  {
    id: 'task-names-the-label',
    title: 'A task that names the button to press',
    kind: 'task',
    problem: 'The task contains the label on the screen, so people match words instead of finding their way.',
    weak: { blocks: [
      { t: 'p', label: 'Task', text: 'Use the “Saved searches” feature to create an alert for flats.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Task', text: 'You’re looking for a two-bedroom flat in Leeds for under £900 a month. You don’t have time to check the site every day. Set things up so you hear about new flats as soon as they’re listed.' },
    ] },
    annotations: [
      { mark: 'a two-bedroom flat in Leeds for under £900 a month', note: 'Concrete details give people something real to enter and decide with.' },
      { mark: 'You don’t have time to check the site every day', note: 'A reason for the task, the way a real user would have one.' },
      { mark: 'hear about new flats', note: 'Describes the goal in everyday words, with none of the interface’s own labels.' },
    ],
    biases: ['demand-characteristics', 'curse-of-knowledge'],
    methods: ['usability-testing', 'representative-task-design-brunswik', 'session-protocol-and-pilot-session'],
    calcs: ['completion-rate', 'first-click'],
    tryIt: 'Put your task list next to the screens. Highlight every word that appears in both.',
  },
  {
    id: 'task-without-end',
    title: 'A task with no clear end',
    kind: 'task',
    problem: 'Without a defined end, nobody can say whether the task was completed, so success and time cannot be measured.',
    weak: { blocks: [
      { t: 'p', label: 'Task', text: 'Have a look around the help centre and see what you think.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Task', text: 'Your printer shows “Error 47” and will not print. Use the help centre to find out what to do. Stop when you think you have the answer, and tell me what it is.' },
      { t: 'p', label: 'Success', text: 'Counted as a success if the answer given is “replace the ink cartridge”.' },
    ] },
    annotations: [
      { mark: 'Error 47', note: 'A specific problem with one right answer, instead of open browsing.' },
      { mark: 'Stop when you think you have the answer', note: 'Lets the participant decide they are done, which is how real use ends.' },
      { mark: 'Counted as a success if', note: 'The success rule is written before the sessions, so scoring is not decided after watching.' },
    ],
    biases: ['experimenter-expectancy', 'demand-characteristics'],
    methods: ['usability-testing', 'session-protocol-and-pilot-session', 'tree-testing'],
    calcs: ['completion-rate', 'task-time', 'lostness'],
    tryIt: 'For each task in your next test, write the one sentence that decides whether it was a success.',
  },

  // ---------------------------------------------------------------- screeners
  {
    id: 'screener-gives-away-answer',
    title: 'A screener that gives away the answer',
    kind: 'screener',
    problem: 'Naming the study topic and asking a yes/no question tells people exactly what to say to get in.',
    weak: { blocks: [
      { t: 'p', text: 'This study is about meal-kit delivery apps.' },
      { t: 'q', text: 'Do you order meal kits at least once a month?', options: ['Yes', 'No'] },
    ] },
    strong: { blocks: [
      { t: 'q', multi: true, text: 'Which of these have you done in the past 3 months? Choose all that apply.', options: ['Bought groceries online', 'Ordered a takeaway through an app', 'Ordered a meal kit', 'Booked a restaurant table online', 'None of these'] },
      { t: 'q', text: 'How many times have you ordered a meal kit in the past 3 months?', options: ['Once', '2 or 3 times', '4 to 6 times', 'More than 6 times'], note: 'Shown only to people who chose “Ordered a meal kit”.' },
    ] },
    annotations: [
      { mark: 'in the past 3 months', note: 'Recent behaviour, with a time window, instead of a habit people might round up.' },
      { mark: 'Ordered a meal kit', note: 'The behaviour you need is hidden among similar ones, so the study topic is not obvious.' },
      { mark: 'None of these', note: 'A real option to say no, which also catches people ticking everything to qualify.' },
      { mark: 'More than 6 times', note: 'A frequency scale lets you set the cut-off yourself rather than handing over the threshold.' },
    ],
    biases: ['selection-bias', 'demand-characteristics'],
    methods: ['participant-recruiting-and-screener-design', 'quota-filling-screening-plan-and-stopping-test', 'eligibility-criteria-definition'],
    calcs: [],
    tryIt: 'Read your screener as someone who wants the voucher. Could you work out the “right” answers?',
  },
  {
    id: 'screener-self-rating',
    title: 'A screener that asks people to rate themselves',
    kind: 'screener',
    problem: 'Almost everyone says yes to being comfortable, confident or articulate, so the question filters nobody.',
    weak: { blocks: [
      { t: 'q', text: 'Are you comfortable expressing your opinions?', options: ['Yes', 'No'] },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Open question', text: 'Tell us about the last app you deleted from your phone and why, in a sentence or two.' },
      { t: 'p', label: 'Recruiter note', text: 'Look for a specific app and a specific reason. Skip answers that are blank, one word or copied from elsewhere.' },
    ] },
    annotations: [
      { mark: 'the last app you deleted', note: 'A small real story shows whether someone can describe their own experience.' },
      { mark: 'in a sentence or two', note: 'Short enough not to put people off, long enough to judge.' },
      { mark: 'Look for a specific app and a specific reason', note: 'A written rule, so different recruiters judge answers the same way.' },
    ],
    biases: ['social-desirability-bias', 'selection-bias'],
    methods: ['participant-recruiting-and-screener-design', 'eligibility-criteria-definition'],
    calcs: [],
    tryIt: 'Replace one yes/no self-rating in your screener with a question that asks for an example.',
  },

  // ---------------------------------------------------------------- consent and intro scripts
  {
    id: 'session-intro-script',
    title: 'A session introduction',
    kind: 'consent',
    problem: 'Telling people you made the design and love it makes criticism awkward, and recording without asking is not consent.',
    weak: { blocks: [
      { t: 'p', label: 'Moderator', text: 'Thanks for coming! We built this new design and we’re really excited about it. Just use it and tell us what you think. We record everything, hope that’s OK.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Moderator', text: 'Thanks for joining. I’m not the person who designed what you’ll see, so nothing you say will hurt my feelings. We’re testing the website, not you.' },
      { t: 'p', text: 'With your permission, we’ll record the screen and your voice. Only the research team will see the recording, and we delete it after six months.' },
      { t: 'p', text: 'You can skip anything or stop at any time, and you’ll still receive your voucher.' },
    ] },
    annotations: [
      { mark: 'I’m not the person who designed what you’ll see', note: 'Distance from the design makes honest criticism easier to give.' },
      { mark: 'We’re testing the website, not you', note: 'Takes the pressure off when people struggle, so they keep going naturally.' },
      { mark: 'With your permission', note: 'Recording is asked for, with who sees it and how long it is kept.' },
      { mark: 'you’ll still receive your voucher', note: 'Stopping has no cost, so consent is freely given.' },
    ],
    biases: ['social-desirability-bias', 'demand-characteristics', 'hawthorne-effect'],
    methods: ['informed-consent-procedure', 'session-protocol-and-pilot-session', 'think-aloud-protocol'],
    calcs: [],
    tryIt: 'Read your intro script aloud and time it. Then check it says who will see the recording and for how long.',
  },
  {
    id: 'survey-invitation',
    title: 'A survey invitation',
    kind: 'consent',
    problem: 'An upbeat pitch attracts fans, undersells the time it takes and says nothing about how answers are used.',
    weak: { blocks: [
      { t: 'p', label: 'Email', text: 'Help us make our amazing new reports feature even better! Take our quick 2-minute survey.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Email', text: 'We’re asking a random sample of customers how they use reports, including people who rarely use them. It takes about 6 minutes (12 questions).' },
      { t: 'p', text: 'Your answers are anonymous and we only report results in groups of 10 or more. You can skip any question.' },
    ] },
    annotations: [
      { mark: 'a random sample of customers', note: 'Explains why this person was asked, and invites more than just the keen ones.' },
      { mark: 'including people who rarely use them', note: 'Light users often think a survey is not meant for them; this says it is.' },
      { mark: 'about 6 minutes (12 questions)', note: 'An honest length; under-promising leads to people dropping out partway through.' },
      { mark: 'in groups of 10 or more', note: 'Says how answers will be used, in plain words.' },
    ],
    biases: ['non-response-bias', 'self-selection-bias', 'framing-effect'],
    methods: ['informed-consent-procedure', 'probability-sampling', 'intercept-survey'],
    calcs: ['nonresponse'],
    tryIt: 'Ask someone who does not like your product to read your invitation. Would they feel it was meant for them?',
  },

  // ---------------------------------------------------------------- result reporting
  {
    id: 'completion-rate-without-interval',
    title: 'A completion rate from 10 people',
    kind: 'reporting',
    problem: 'A bare percentage from a small test sounds more precise than it is.',
    weak: { blocks: [
      { t: 'p', text: '80% of users completed the task.' },
    ] },
    strong: { blocks: [
      { t: 'p', text: '8 of 10 participants completed the task (80%; 95% interval 48% to 95%, adjusted Wald).' },
      { t: 'p', text: 'In plain terms: among all users, we would expect somewhere between about half and nearly all to complete it. A bigger test would narrow that down.' },
    ] },
    annotations: [
      { mark: '8 of 10 participants', note: 'Raw counts show the reader how small the test was.' },
      { mark: '95% interval 48% to 95%', note: 'The interval shows the range of rates that fit these results.' },
      { mark: 'In plain terms', note: 'Translates the interval for readers who do not read statistics.' },
    ],
    biases: ['law-of-small-numbers', 'overconfidence'],
    methods: ['adjusted-wald-confidence-interval-for-completion-rates', 'usability-testing'],
    calcs: ['completion-rate'],
    tryIt: 'Find a percentage in your last report. Add the counts it came from, and an interval if you can.',
  },
  {
    id: 'nps-without-interval',
    title: 'An NPS change with no interval',
    kind: 'reporting',
    problem: 'A five-point change in NPS from about 100 responses is well within the noise, but reads as progress.',
    weak: { blocks: [
      { t: 'p', text: 'NPS is 32 this quarter, up from 27. Great progress!' },
    ] },
    strong: { blocks: [
      { t: 'table', head: ['Quarter', 'Responses', 'NPS', '95% interval'], rows: [['Q2', '118', '27', '13 to 41'], ['Q3', '96', '32', '17 to 47']] },
      { t: 'p', text: 'The intervals overlap almost entirely, so this change is within what we would expect from sampling noise alone. We will keep tracking it rather than call it a trend.' },
    ] },
    annotations: [
      { mark: 'Responses', note: 'The number of answers behind each score.' },
      { mark: '95% interval', note: 'NPS swings a lot with small samples; the interval shows by how much.' },
      { mark: 'within what we would expect from sampling noise', note: 'Says plainly what the numbers can and cannot support.' },
    ],
    biases: ['law-of-small-numbers', 'overconfidence', 'confirmation-bias'],
    methods: ['net-promoter-score'],
    calcs: ['nps'],
    tryIt: 'Before your next NPS update, work out the interval. Would you still write the same headline?',
  },
  {
    id: 'averaging-ordinal-ratings',
    title: 'Averaging ratings that split opinion',
    kind: 'reporting',
    problem: 'A mean of 1-to-5 ratings treats the steps as equal and hides that the new design delights some and annoys others.',
    weak: { blocks: [
      { t: 'p', text: 'Average satisfaction rose from 3.3 to 3.5 out of 5 with the new design.' },
    ] },
    strong: { blocks: [
      { t: 'table', head: ['Rating', 'Old design', 'New design'], rows: [['5 (very satisfied)', '16%', '28%'], ['4', '32%', '30%'], ['3', '30%', '21%'], ['2', '14%', '6%'], ['1 (very dissatisfied)', '8%', '15%']], caption: '100 respondents per design.' },
      { t: 'p', text: 'More people chose 4 or 5 (58% vs 48%), but almost twice as many chose 1 (15% vs 8%). The new design splits opinion; the next step is to find out who the unhappy 15% are.' },
    ] },
    annotations: [
      { mark: '100 respondents per design', note: 'The base for every percentage.' },
      { mark: '58% vs 48%', note: 'Top-two-box shares are easy to read and do not assume the steps are equal.' },
      { mark: 'almost twice as many chose 1', note: 'The full distribution shows what the average hid.' },
      { mark: 'splits opinion', note: 'Turns the pattern into a question the team can act on.' },
    ],
    biases: ['mcnamara-fallacy', 'cherry-picking'],
    methods: ['ordinal-vs-interval-distinction', 'top-box-analysis-of-rating-scales', 'stevens-scales-nominal-ordinal-interval-ratio'],
    calcs: ['top-box', 'nonparametric', 'rating'],
    tryIt: 'Next time you report an average rating, look at the full distribution first. Is there more than one story in it?',
  },
  {
    id: 'one-significant-of-twenty',
    title: 'p = 0.049 among 20 tests',
    kind: 'reporting',
    problem: 'Test enough metrics and one will pass p < 0.05 by chance; reporting only that one makes noise look like a finding.',
    weak: { blocks: [
      { t: 'p', text: 'Users of the new design spent significantly more time on the pricing page (p = 0.049).' },
    ] },
    strong: { blocks: [
      { t: 'p', text: 'We compared 20 metrics between the designs. One reached p < 0.05: time on the pricing page (p = 0.049).' },
      { t: 'p', text: 'With 20 tests we would expect about one such result by chance alone, and after a Holm correction it is not significant. Treat it as a lead to test on its own, not a finding.' },
    ] },
    annotations: [
      { mark: 'We compared 20 metrics', note: 'Says how many tests were run, so readers can judge the odds of a fluke.' },
      { mark: 'about one such result by chance alone', note: 'Spells out what 20 tests at the 5% level produce on average.' },
      { mark: 'Holm correction', note: 'Adjusts for running many tests at once.' },
      { mark: 'a lead to test on its own', note: 'Keeps the idea alive without claiming more than the data shows.' },
    ],
    biases: ['multiple-comparisons', 'p-hacking', 'cherry-picking'],
    methods: ['multiple-comparisons-correction', 'pre-registration'],
    calcs: ['multi-compare'],
    tryIt: 'Count every comparison you ran in your last analysis, including the ones that did not make the report.',
  },
  {
    id: 'significant-but-tiny',
    title: '“Statistically significant” with no size',
    kind: 'reporting',
    problem: 'With a huge sample almost any difference is significant; without its size, nobody can tell if it matters.',
    weak: { blocks: [
      { t: 'p', text: 'The new checkout is significantly faster (p < 0.001, n = 40,000).' },
    ] },
    strong: { blocks: [
      { t: 'p', text: 'Checkout took 1.2 seconds less with the new design (95% interval 0.8 to 1.6 seconds), on a typical checkout of 94 seconds: about 1% faster.' },
      { t: 'p', text: 'The difference is real but probably too small for customers to notice. Decide on other grounds, such as errors or maintenance.' },
    ] },
    annotations: [
      { mark: '1.2 seconds less', note: 'The size of the difference, in units people understand.' },
      { mark: '95% interval 0.8 to 1.6 seconds', note: 'How precisely the difference is known.' },
      { mark: 'about 1% faster', note: 'Puts the change next to the baseline, so its scale is clear.' },
      { mark: 'too small for customers to notice', note: 'Separates “detectable” from “worth caring about”.' },
    ],
    biases: ['overconfidence', 'mcnamara-fallacy'],
    methods: ['effect-size-calculation', 'apa-style-reporting-of-statistical-results'],
    calcs: ['effect-size', 'compare-means'],
    tryIt: 'Find a p-value in your last report. Write the size of the difference next to it, in the units your team uses.',
  },

  // ---------------------------------------------------------------- charts
  {
    id: 'truncated-axis',
    title: 'A bar chart with a truncated axis',
    kind: 'chart',
    problem: 'Starting the axis at 70% makes a 3-point difference look like a doubling.',
    weak: { blocks: [
      { t: 'bars', title: 'Task success by design', min: 70, max: 76, ticks: [70, 72, 74, 76], unit: '%', bars: [{ label: 'Design A', value: 72 }, { label: 'Design B', value: 75 }] },
    ] },
    strong: { blocks: [
      { t: 'bars', title: 'Task success by design, % of participants (axis starts at 0)', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], unit: '%', bars: [{ label: 'Design A', value: 72, lo: 60, hi: 82 }, { label: 'Design B', value: 75, lo: 63, hi: 84 }], note: 'Lines show 95% intervals; 60 participants per design. The 3-point gap is smaller than the uncertainty.' },
    ] },
    annotations: [
      { mark: 'axis starts at 0', note: 'Bar length now matches the value, so the bars can be compared by eye.' },
      { mark: '95% intervals', note: 'Shows how much each bar could move with a different sample.' },
      { mark: 'smaller than the uncertainty', note: 'Says in words what the picture shows.' },
    ],
    biases: ['framing-effect', 'overconfidence'],
    methods: ['perceptual-effectiveness-review-of-charts', 'attention-management-in-data-visualisation-knaflic-method'],
    calcs: ['compare-rates', 'completion-rate'],
    tryIt: 'Check the first number on the axis of every bar chart in your last deck.',
  },
  {
    id: 'cumulative-chart',
    title: 'A cumulative chart that hides a decline',
    kind: 'chart',
    problem: 'A running total can only go up, so it looks healthy even while weekly sign-ups fall.',
    weak: { blocks: [
      { t: 'line', title: 'Total sign-ups since launch', values: [120, 255, 405, 553, 693, 821, 936, 1040, 1136, 1224], labels: ['W1', '', '', '', 'W5', '', '', '', '', 'W10'], min: 0, max: 1400, ticks: [0, 700, 1400] },
    ] },
    strong: { blocks: [
      { t: 'line', title: 'New sign-ups each week', values: [120, 135, 150, 148, 140, 128, 115, 104, 96, 88], labels: ['W1', '', '', '', 'W5', '', '', '', '', 'W10'], min: 0, max: 160, ticks: [0, 80, 160], mark: 2, note: 'Weekly sign-ups peaked in week 3 and have fallen by 41% since.' },
    ] },
    annotations: [
      { mark: 'New sign-ups each week', note: 'Plots the rate, which can go down, instead of the total, which cannot.' },
      { mark: 'peaked in week 3', note: 'Points the reader at the turning point.' },
      { mark: 'fallen by 41%', note: 'Puts a number on the trend that the cumulative chart hid.' },
    ],
    biases: ['framing-effect', 'confirmation-bias'],
    methods: ['data-visualisation-design-latch', 'perceptual-effectiveness-review-of-charts', 'statistical-process-control-control-charts'],
    calcs: ['control-charts'],
    tryIt: 'If a chart in your dashboard shows a running total, sketch the weekly version next to it.',
  },
  {
    id: 'small-groups-chart',
    title: 'A chart that ranks tiny groups',
    kind: 'chart',
    problem: 'The top bar comes from four people, so its height is mostly luck, but the chart presents it as a winner.',
    weak: { blocks: [
      { t: 'bars', title: 'Satisfied customers by plan', min: 0, max: 100, ticks: [0, 50, 100], unit: '%', bars: [{ label: 'Free', value: 61 }, { label: 'Team', value: 68 }, { label: 'Pro', value: 66 }, { label: 'Ent.', value: 100 }] },
    ] },
    strong: { blocks: [
      { t: 'bars', title: 'Satisfied customers by plan, with 95% intervals', min: 0, max: 100, ticks: [0, 50, 100], unit: '%', bars: [{ label: 'Free', sub: 'n=212', value: 61, lo: 54, hi: 67 }, { label: 'Team', sub: 'n=88', value: 68, lo: 58, hi: 77 }, { label: 'Pro', sub: 'n=57', value: 66, lo: 53, hi: 77 }, { label: 'Ent.', sub: 'n=4', value: 100, lo: 45, hi: 100 }], note: 'Enterprise is based on 4 people; its interval covers almost every other plan’s. Do not rank it yet.' },
    ] },
    annotations: [
      { mark: 'n=4', note: 'The size of each group, right under its bar.' },
      { mark: 'with 95% intervals', note: 'The lines show that the small group could sit almost anywhere.' },
      { mark: 'Do not rank it yet', note: 'Tells the reader what not to conclude.' },
    ],
    biases: ['law-of-small-numbers', 'clustering-illusion'],
    methods: ['adjusted-wald-confidence-interval-for-completion-rates', 'perceptual-effectiveness-review-of-charts'],
    calcs: ['margin-of-error', 'compare-rates'],
    tryIt: 'Add the group size under every bar in your next segment chart. Which bars would you now leave out?',
  },

  // ---------------------------------------------------------------- sampling
  {
    id: 'sample-of-colleagues',
    title: 'Testing with colleagues',
    kind: 'sampling',
    problem: 'People who work on or near the product know its words and logic, so they breeze through what real users find hard.',
    weak: { blocks: [
      { t: 'p', label: 'Plan', text: 'We will test the new onboarding with 8 people from the office: designers, engineers and the sales team.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Plan', text: 'We will recruit 8 people who signed up in the last 30 days and have not finished onboarding, through an in-app invitation. The screener excludes anyone who works in tech, design or market research.' },
    ] },
    annotations: [
      { mark: 'signed up in the last 30 days', note: 'People at the stage the design is meant for.' },
      { mark: 'have not finished onboarding', note: 'Includes the people who struggle, not only the ones who got through.' },
      { mark: 'excludes anyone who works in tech, design or market research', note: 'Keeps out expert habits that real users do not have.' },
    ],
    biases: ['selection-bias', 'curse-of-knowledge', 'false-consensus'],
    methods: ['participant-recruiting-and-screener-design', 'eligibility-criteria-definition', 'hallway-usability-testing-krug-method'],
    calcs: ['discovery'],
    tryIt: 'Write down who your last test’s participants were. How many could have guessed the design team’s intentions?',
  },
  {
    id: 'survey-of-survivors',
    title: 'Surveying only the customers who stayed',
    kind: 'sampling',
    problem: 'People who cancelled are not in the list, so the survey can only hear from the ones who were happy enough to stay.',
    weak: { blocks: [
      { t: 'p', label: 'Plan', text: 'Survey all active subscribers to find out what they love about onboarding.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Plan', text: 'Survey a random sample of everyone who started a trial in Q3, including the 62% who cancelled, and compare answers between those who stayed and those who left.' },
    ] },
    annotations: [
      { mark: 'everyone who started a trial in Q3', note: 'Defines the group at the start, before anyone dropped out.' },
      { mark: 'including the 62% who cancelled', note: 'Brings back the people the original plan could never hear from.' },
      { mark: 'compare answers between those who stayed and those who left', note: 'The difference between the groups is the useful finding.' },
    ],
    biases: ['survivorship-bias', 'selection-bias', 'leading-questions'],
    methods: ['cohort-analysis', 'probability-sampling', 'jobs-to-be-done-switch-interviews'],
    calcs: ['retention-funnel', 'survey-weighting'],
    tryIt: 'Look at where your last sample came from. Who could never have been on that list?',
  },
  {
    id: 'feedback-button-sample',
    title: 'Treating the feedback button as a survey',
    kind: 'sampling',
    problem: 'Only people who feel strongly press a feedback button, so its comments say little about users as a whole.',
    weak: { blocks: [
      { t: 'p', label: 'Plan', text: 'Analyse the 420 comments from the feedback button to see how users feel about the new navigation.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Plan', text: 'Invite a random sample of 1,000 active users to a 5-question survey. Report the response rate, and compare responders with non-responders on plan and how long they have been customers.' },
      { t: 'p', text: 'Use the 420 feedback comments to find problems to look into, not to measure how common they are.' },
    ] },
    annotations: [
      { mark: 'random sample of 1,000 active users', note: 'Everyone has a known chance of being asked, not only the motivated.' },
      { mark: 'Report the response rate', note: 'Shows how much of the sample you actually heard from.' },
      { mark: 'compare responders with non-responders', note: 'Checks whether the people who answered differ from the ones who did not.' },
      { mark: 'not to measure how common they are', note: 'Keeps the comments for what they are good at.' },
    ],
    biases: ['self-selection-bias', 'non-response-bias'],
    methods: ['probability-sampling', 'r-indicators-for-nonresponse-representativeness', 'customer-feedback-and-support-log-analysis'],
    calcs: ['nonresponse', 'margin-of-error'],
    tryIt: 'Next time someone quotes the feedback widget, ask how many active users it came from.',
  },
  {
    id: 'too-small-for-a-share',
    title: 'Too few people to measure a share',
    kind: 'sampling',
    problem: 'Thirty answers give a margin of error of about 18 points, too wide to tell a preference from a coin toss.',
    weak: { blocks: [
      { t: 'p', label: 'Plan', text: 'We will survey 30 people to find out what share prefer the new layout.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Plan', text: 'To estimate the share within ±5 points (95% confidence) we need about 385 completed responses. With 30 the margin would be about ±18 points.' },
      { t: 'p', text: 'If 385 is out of reach, we will run a preference test with 30 people and report it as direction, not a share.' },
    ] },
    annotations: [
      { mark: 'within ±5 points', note: 'Starts from the precision the decision needs.' },
      { mark: 'about 385 completed responses', note: 'The sample size follows from that precision, not from habit.' },
      { mark: 'about ±18 points', note: 'Shows what the original plan would have delivered.' },
      { mark: 'report it as direction, not a share', note: 'A fallback that is honest about what a small sample can do.' },
    ],
    biases: ['law-of-small-numbers', 'overconfidence'],
    methods: ['sample-size-planning-for-summative-ux-studies', 'statistical-power-analysis'],
    calcs: ['sample-size', 'margin-of-error', 'preference-test'],
    tryIt: 'Before your next survey, write down the margin of error you can live with, then check the sample size it needs.',
  },

  // ---------------------------------------------------------------- coding
  {
    id: 'theme-from-one-quote',
    title: 'A theme built on one vivid quote',
    kind: 'coding',
    problem: 'One memorable quote stands in for a pattern; the reader cannot tell if one person said it or everyone did.',
    weak: { blocks: [
      { t: 'p', label: 'Theme', text: 'Users don’t trust the AI suggestions.' },
      { t: 'quote', text: 'I never trust what it suggests, it’s always wrong.', who: 'P4', codes: [] },
    ] },
    strong: { blocks: [
      { t: 'table', head: ['Theme', 'Interviews', 'Who'], rows: [['Checks AI suggestions before using them', '7 of 12', 'P1, P2, P4, P6, P7, P9, P11'], ['Rejects AI suggestions outright', '3 of 12', 'P4, P7, P11'], ['Uses suggestions without checking', '5 of 12', 'P3, P5, P8, P10, P12']] },
      { t: 'p', text: 'Counter-evidence: P1, P2, P6 and P9 checked suggestions but went on to use most of them. Outright distrust is real but limited to 3 of 12, all in the finance team.' },
    ] },
    annotations: [
      { mark: '7 of 12', note: 'How many interviews each theme appears in, so the reader can judge how widespread it is.' },
      { mark: 'P4, P7, P11', note: 'Shows which participants are behind a theme, so one voice cannot pass as many.' },
      { mark: 'Counter-evidence', note: 'Reports the cases that cut against the theme.' },
      { mark: 'all in the finance team', note: 'Notes who the theme applies to, which a single quote cannot.' },
    ],
    biases: ['cherry-picking', 'confirmation-bias', 'availability-heuristic'],
    methods: ['thematic-analysis', 'writing-qualitative-findings-evidence-standards', 'tactics-for-testing-or-confirming-findings'],
    calcs: ['qual-coding', 'saturation'],
    tryIt: 'For each theme in your last synthesis, count the interviews it appears in, and look for one that contradicts it.',
  },
  {
    id: 'codes-that-judge',
    title: 'Codes that judge instead of describe',
    kind: 'coding',
    problem: 'Codes like “lazy user” put a conclusion on the data before analysis has begun.',
    weak: { blocks: [
      { t: 'quote', text: 'I just leave those boxes blank, honestly. At month end I’ve got thirty of these to get through.', who: 'P6', codes: ['Lazy user', 'Hates the form'] },
    ] },
    strong: { blocks: [
      { t: 'quote', text: 'I just leave those boxes blank, honestly. At month end I’ve got thirty of these to get through.', who: 'P6', codes: ['Skips optional fields', 'Volume at month end', 'Repeats the same form'] },
      { t: 'p', label: 'Codebook rule', text: 'Codes describe what was said or done. Save interpretation for the theme stage, where it can be checked across interviews.' },
    ] },
    annotations: [
      { mark: 'Skips optional fields', note: 'Describes the behaviour without blaming the person.' },
      { mark: 'Volume at month end', note: 'Captures the context that explains the behaviour.' },
      { mark: 'Save interpretation for the theme stage', note: 'Separates describing from explaining, so explanations can be tested.' },
    ],
    biases: ['confirmation-bias', 'false-consensus'],
    methods: ['start-list-coding-with-a-structured-codebook-and-check-coding', 'thematic-analysis', 'focused-coding-charmaz'],
    calcs: ['qual-coding', 'intercoder'],
    tryIt: 'Scan your code list for words that judge people (lazy, confused, stupid, fails). Rename each to say what happened.',
  },
  {
    id: 'single-coder',
    title: 'One researcher codes everything alone',
    kind: 'coding',
    problem: 'With one coder there is no check on whether the codes mean the same thing each time, or to anyone else.',
    weak: { blocks: [
      { t: 'p', label: 'Method', text: 'I coded all 20 transcripts and grouped the codes into themes.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Method', text: 'Two researchers independently coded the same 5 transcripts with a shared codebook. Agreement was κ = 0.72.' },
      { t: 'p', text: 'We discussed every disagreement, refined 3 code definitions, then split the remaining 15 transcripts and checked 2 of each other’s.' },
    ] },
    annotations: [
      { mark: 'independently coded', note: 'Each coder works alone first, so agreement is not just one person persuading the other.' },
      { mark: 'κ = 0.72', note: 'An agreement figure that allows for chance, reported so readers can judge it.' },
      { mark: 'refined 3 code definitions', note: 'Disagreements improve the codebook instead of being quietly settled.' },
      { mark: 'checked 2 of each other’s', note: 'A spot check keeps the coders aligned for the rest of the work.' },
    ],
    biases: ['confirmation-bias', 'overconfidence'],
    methods: ['cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability', 'multi-country-collaborative-codebook-calibration', 'start-list-coding-with-a-structured-codebook-and-check-coding'],
    calcs: ['intercoder'],
    tryIt: 'Ask a colleague to code one of your transcripts with your codebook, without seeing your codes. Compare.',
  },

  // ---------------------------------------------------------------- recommendation and insight writing
  {
    id: 'users-loved-it',
    title: '“Users loved it” versus an evidence-graded insight',
    kind: 'insight',
    problem: 'An enthusiastic summary gives no counts, no comparison and no sense of how strong the evidence is.',
    weak: { blocks: [
      { t: 'p', label: 'Finding', text: 'Users loved the new onboarding!' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Finding', text: 'In 6 of 8 sessions, participants finished the new onboarding without help (vs 3 of 8 with the old flow). Two said the progress bar told them how much was left.' },
      { t: 'p', text: 'Evidence: moderate (one round of moderated testing, small sample).' },
      { t: 'p', text: 'Next: check onboarding completion in analytics for the first month after launch.' },
    ] },
    annotations: [
      { mark: '6 of 8 sessions', note: 'Says what people did and how many did it, not how the team felt.' },
      { mark: 'vs 3 of 8 with the old flow', note: 'A comparison gives the number meaning.' },
      { mark: 'Evidence: moderate', note: 'States how much weight the finding can bear, and why.' },
      { mark: 'Next:', note: 'Says how the finding will be confirmed at scale.' },
    ],
    biases: ['confirmation-bias', 'ikea-effect', 'overconfidence'],
    methods: ['writing-qualitative-findings-evidence-standards', 'grade-evidence-grading', 'research-reporting-and-readouts'],
    calcs: ['compare-rates'],
    tryIt: 'Take one finding from your last readout and add a line starting “Evidence:” that says how strong it is.',
  },
  {
    id: 'vague-recommendation',
    title: 'A recommendation nobody can act on',
    kind: 'insight',
    problem: '“Improve search” names an area, not a change; nobody knows what to build or how to tell if it worked.',
    weak: { blocks: [
      { t: 'p', label: 'Recommendation', text: 'Improve the search experience.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Recommendation', text: 'Make search tolerant of misspellings. 14 of the top 50 failed searches last month were misspelt product names (for example “blendr”).' },
      { t: 'p', text: 'Owner: search team. Measure: share of searches with no results, now 11%.' },
    ] },
    annotations: [
      { mark: 'tolerant of misspellings', note: 'A specific change someone can design and build.' },
      { mark: '14 of the top 50 failed searches', note: 'The evidence behind it, with a count.' },
      { mark: 'Owner: search team', note: 'Someone is responsible for it.' },
      { mark: 'Measure: share of searches with no results', note: 'A baseline and a measure, so the team will know if it worked.' },
    ],
    biases: ['availability-heuristic', 'planning-fallacy'],
    methods: ['usability-findings-report-and-recommendations', 'recommendation-tracking-and-research-impact-scorecard'],
    calcs: ['search-analytics'],
    tryIt: 'Rewrite one recommendation from your last report so it names a change, an owner and a measure.',
  },
  {
    id: 'correlation-as-cause',
    title: 'Reading a correlation as a cause',
    kind: 'insight',
    problem: 'Heavy buyers are more likely to install the app, so the app’s users spend more whether or not the app makes any difference.',
    weak: { blocks: [
      { t: 'p', label: 'Insight', text: 'App users spend 40% more, so we should push everyone to install the app.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Insight', text: 'App users spend 40% more, but they were already our heaviest buyers before they installed it.' },
      { t: 'p', text: 'To learn whether the app causes extra spending, promote it to a random half of new customers for 8 weeks and compare spending between the halves.' },
    ] },
    annotations: [
      { mark: 'already our heaviest buyers before they installed it', note: 'Names the other explanation: who chooses to install.' },
      { mark: 'causes extra spending', note: 'Separates the question of cause from the pattern seen.' },
      { mark: 'a random half of new customers', note: 'Random assignment is what lets a difference be read as an effect.' },
    ],
    biases: ['correlation-causation', 'selection-bias'],
    methods: ['a-b-testing', 'causal-thinking-audit-for-research-reports'],
    calcs: ['diff-in-diff'],
    tryIt: 'Find a “users who do X do more Y” claim in your dashboards. List two reasons it might be true without X causing Y.',
  },
  {
    id: 'anecdote-from-the-top',
    title: 'One senior anecdote becomes a priority',
    kind: 'insight',
    problem: 'A single story from someone senior jumps the queue without anyone checking how common the problem is.',
    weak: { blocks: [
      { t: 'p', label: 'Ticket', text: 'The CEO’s friend couldn’t find how to log out. Move log out into the top bar this sprint.' },
    ] },
    strong: { blocks: [
      { t: 'p', label: 'Ticket', text: 'One report (via the CEO) of trouble finding log out. Checked: 0.3% of sessions open the account menu without choosing anything, and no support tickets mention log out in the last 90 days.' },
      { t: 'p', text: 'Proposal: add log out to the next round of tree testing and decide then.' },
    ] },
    annotations: [
      { mark: 'One report', note: 'Says plainly how much evidence there is.' },
      { mark: 'Checked:', note: 'The anecdote is tested against data before it changes the plan.' },
      { mark: 'no support tickets mention log out', note: 'A second source to triangulate with.' },
      { mark: 'add log out to the next round of tree testing', note: 'A cheap way to settle it, not a reason to ignore it.' },
    ],
    biases: ['hippo', 'availability-heuristic'],
    methods: ['triangulation', 'research-reporting-and-readouts', 'tree-testing'],
    calcs: ['tree-test'],
    tryIt: 'Next time a request arrives with a story attached, find one other source before it goes on the board.',
  },

  // ---------------------------------------------------------------- A/B readouts
  {
    id: 'peeking-ab-test',
    title: 'Stopping an A/B test the moment it looks good',
    kind: 'ab',
    problem: 'Checking every day and stopping at the first p < 0.05 makes false winners far more likely than 5%.',
    weak: { blocks: [
      { t: 'line', title: 'p-value by day', values: [0.41, 0.22, 0.09, 0.04], labels: ['D1', 'D2', 'D3', 'D4'], min: 0, max: 0.5, ticks: [0, 0.25, 0.5], threshold: { value: 0.05, label: '0.05' }, mark: 3 },
      { t: 'p', text: 'We stopped on day 4 when p dropped below 0.05. Winner: B (+6%).' },
    ] },
    strong: { blocks: [
      { t: 'line', title: 'p-value by day (read once, on day 14)', values: [0.41, 0.22, 0.09, 0.04, 0.07, 0.15, 0.11, 0.24, 0.19, 0.31, 0.27, 0.22, 0.29, 0.26], labels: ['D1', '', '', 'D4', '', '', 'D7', '', '', '', '', '', '', 'D14'], min: 0, max: 0.5, ticks: [0, 0.25, 0.5], threshold: { value: 0.05, label: '0.05' }, mark: 13 },
      { t: 'p', text: 'Planned: 14 days and 18,000 users per variant, decided before launch. The dip on day 4 was ignored.' },
      { t: 'p', text: 'Result on day 14: B +1.1% (95% interval −0.9% to +3.1%). No clear winner; keep A, which is cheaper to maintain.' },
    ] },
    annotations: [
      { mark: 'Planned: 14 days and 18,000 users per variant', note: 'Duration and sample size fixed in advance, from the effect worth detecting.' },
      { mark: 'decided before launch', note: 'The stopping rule cannot bend to the results.' },
      { mark: 'read once, on day 14', note: 'Early dips below 0.05 are expected by chance when you look every day.' },
      { mark: '95% interval −0.9% to +3.1%', note: 'Reports the size and uncertainty, not just win or lose.' },
    ],
    biases: ['peeking', 'p-hacking'],
    methods: ['sequential-testing-sprt-and-group-sequential-designs', 'a-b-test-design-beyond-conversion-rates', 'pre-registration'],
    calcs: ['ab-health', 'sprt'],
    tryIt: 'Before your next experiment, write the stopping rule in the ticket. If you want to look early, use a sequential design.',
  },
  {
    id: 'sample-ratio-mismatch',
    title: 'Reading a test with unequal groups',
    kind: 'ab',
    problem: 'A 50/50 split that comes out uneven means something removed users from one variant, so the comparison is broken.',
    weak: { blocks: [
      { t: 'p', text: 'B wins: conversion 5.4% vs 5.0%. Shipping B.' },
    ] },
    strong: { blocks: [
      { t: 'table', head: ['Variant', 'Planned share', 'Users'], rows: [['A', '50%', '50,912'], ['B', '50%', '48,103']] },
      { t: 'p', text: 'Sample ratio mismatch: B has 2,809 fewer users than A (p < 0.001 for a 50/50 split). Something is dropping users from B, possibly a slow page or a tracking bug, so the conversion figures cannot be trusted. Fix the cause and rerun before comparing conversion.' },
    ] },
    annotations: [
      { mark: 'Planned share', note: 'Shows the split the test was set up with, next to what happened.' },
      { mark: 'Sample ratio mismatch', note: 'A health check run before any result is read.' },
      { mark: 'possibly a slow page or a tracking bug', note: 'Suggests likely causes to investigate.' },
      { mark: 'Fix the cause and rerun', note: 'Does not try to rescue a broken test.' },
    ],
    biases: ['sample-ratio-mismatch'],
    methods: ['a-b-testing', 'a-b-result-decision-rules-and-triage', 'guardrail-metric-monitoring'],
    calcs: ['ab-health'],
    tryIt: 'Add the user counts per variant to the top of your A/B readout template.',
  },
  {
    id: 'novelty-lift',
    title: 'Shipping on a first-week lift',
    kind: 'ab',
    problem: 'Returning users click on anything new for a while; a first-week lift can fade once the novelty wears off.',
    weak: { blocks: [
      { t: 'p', text: 'Click-through is up 12% in the first week. Ship it.' },
    ] },
    strong: { blocks: [
      { t: 'table', head: ['Week', 'Returning users', 'New users'], rows: [['1', '+12%', '+3%'], ['2', '+5%', '+3%'], ['3', '+2%', '+3%'], ['4', '+2%', '+2%']] },
      { t: 'p', text: 'Most of the early lift among returning users faded by week 3; new users, who have nothing to compare with, stayed at about +3%. Decide on weeks 3 and 4 and on new users: a small, steady gain.' },
    ] },
    annotations: [
      { mark: 'Returning users', note: 'Splits out the people who notice change, where novelty shows up.' },
      { mark: 'faded by week 3', note: 'Following the effect over time shows whether it lasts.' },
      { mark: 'nothing to compare with', note: 'New users give a cleaner read of the design itself.' },
    ],
    biases: ['novelty-effect', 'regression-to-the-mean'],
    methods: ['a-b-test-design-beyond-conversion-rates', 'cohort-analysis', 'a-b-result-decision-rules-and-triage'],
    calcs: ['ab-health', 'bayes-ab'],
    tryIt: 'In your next A/B readout, split the result by new and returning users and by week.',
  },
  {
    id: 'segment-fishing',
    title: 'Finding a winner in a slice after the test',
    kind: 'ab',
    problem: 'Slice a flat result enough ways and some slice will win by chance; it is a hypothesis, not a result.',
    weak: { blocks: [
      { t: 'p', text: 'B lost overall, but it won for Android users in Germany at weekends! Ship B to that segment.' },
    ] },
    strong: { blocks: [
      { t: 'p', text: 'Before launch we named two segments to check: new and returning users. B made no clear difference for either.' },
      { t: 'p', text: 'The Android, Germany, weekend result was one of 48 slices we looked at afterwards. We will test it as a new hypothesis, with its own sample size.' },
    ] },
    annotations: [
      { mark: 'Before launch we named two segments', note: 'Segments chosen in advance are evidence; ones found afterwards are ideas.' },
      { mark: 'one of 48 slices', note: 'Says how many places the team looked, so the odds of a fluke are visible.' },
      { mark: 'test it as a new hypothesis', note: 'Turns the slice into the next experiment instead of a decision.' },
    ],
    biases: ['multiple-comparisons', 'p-hacking', 'cherry-picking'],
    methods: ['multiple-comparisons-correction', 'pre-registration', 'a-b-result-decision-rules-and-triage'],
    calcs: ['multi-compare', 'ab-health'],
    tryIt: 'In your experiment brief, list the segments you will check before the test starts.',
  },
];

export const DEMO_BY_ID = new Map(DEMOS.map((d) => [d.id, d]));
export const kindOf = (id) => KINDS.find((k) => k.id === id);
// Most specific first: demos that list the id earlier, then demos that list fewer ids.
const bySpecificity = (key, id) => (a, b) => a[key].indexOf(id) - b[key].indexOf(id) || a[key].length - b[key].length;
export const demosForMethod = (methodId) => DEMOS.filter((d) => d.methods.includes(methodId)).sort(bySpecificity('methods', methodId));
export const demosForCalc = (calcId) => DEMOS.filter((d) => d.calcs.includes(calcId)).sort(bySpecificity('calcs', calcId));
export const demosForBias = (biasId) => DEMOS.filter((d) => d.biases.includes(biasId));

// Every piece of text in a version, for search and for checking that each annotation's mark is really there.
export function versionText(v) {
  const out = [];
  for (const b of v?.blocks || []) {
    for (const key of ['label', 'text', 'title', 'note', 'caption', 'who']) if (typeof b[key] === 'string') out.push(b[key]);
    for (const key of ['options', 'items', 'codes', 'head', 'labels']) if (Array.isArray(b[key])) out.push(...b[key]);
    if (Array.isArray(b.rows)) for (const r of b.rows) out.push(...r);
    if (Array.isArray(b.bars)) for (const bar of b.bars) { out.push(bar.label); if (bar.sub) out.push(bar.sub); }
    if (b.threshold?.label) out.push(b.threshold.label);
  }
  return out.filter((s) => typeof s === 'string' && s);
}
