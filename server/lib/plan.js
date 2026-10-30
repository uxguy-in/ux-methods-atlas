// Study planner. Turns the "Plan my study" answers into a phased roadmap: one recommended
// method per step with a reason, similar methods to swap in, calculator links and advice that
// changes with the answers. Pure functions over the method list, shared by the Node server and
// the static GitHub Pages build (like recommend.js), so both give the same plan.
import { rank, scoreMethod } from './recommend.js';
import { CALC_NAMES } from '../../client/src/calc/catalog.js';

export const PHASES = [
  { key: 'frame', title: 'Frame', blurb: 'Agree the decision the research informs and the question it answers.' },
  { key: 'design', title: 'Design', blurb: 'Choose the study design and settle ethics and approvals.' },
  { key: 'instruments', title: 'Instruments', blurb: 'Write and test the guides, questionnaires and tasks.' },
  { key: 'sampling', title: 'Sampling', blurb: 'Decide who takes part, how many, and how you will find them.' },
  { key: 'collect', title: 'Collect', blurb: 'Gather the data.' },
  { key: 'analyse', title: 'Analyse', blurb: 'Code, count and test.' },
  { key: 'synthesise', title: 'Synthesise', blurb: 'Pull the strands together into findings people can act on.' },
  { key: 'report', title: 'Report', blurb: 'Present the findings, their strength and their limits.' },
];

export const COLLECT = {
  interviews: 'Interviews',
  'qual-survey': 'Qualitative survey (open-ended)',
  'quant-survey': 'Quantitative survey',
  usability: 'Usability testing',
  observation: 'Observation or field visits',
  diary: 'Diary study or experience sampling',
  analytics: 'Analytics and logs',
  experiment: 'Experiment or A/B test',
  desk: 'Secondary data and desk research',
};
const QUAL_MODES = ['interviews', 'qual-survey', 'observation', 'diary'];
const QUANT_MODES = ['quant-survey', 'analytics', 'experiment'];

export const APPROACH = { qualitative: 'Qualitative', quantitative: 'Quantitative', mixed: 'Mixed methods' };
export const TIME = { hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months' };
export const BUDGET = { none: 'No budget', low: 'Small budget', moderate: 'Moderate budget', high: 'Generous budget' };
export const ACCESS = { none: 'No participants', few: 'A few people (up to 12)', moderate: 'A decent sample (13 to 100)', large: 'Hundreds or more', logs: 'Logs and analytics only' };
export const EXPERTISE = { newcomer: 'New to research', mid: 'Mid-level researcher', expert: 'Senior or specialist' };
export const LIMITS = {
  ethics: 'Needs ethics or research approval',
  'no-recording': 'No audio or video recording',
  'no-pii': 'No personal data kept',
  remote: 'Remote only',
  vulnerable: 'Vulnerable or young participants',
  'no-incentives': 'No participant incentives',
};

// The calculators that live at /calculators/<id>; check-plan.js confirms each id exists.
// Calculator ids and names come from the shared catalog, so the planner, the calculators page and the method pages agree.
export const CALCULATORS = CALC_NAMES;

// Research question frameworks: labelled fields and a sentence assembled from them.
export const FRAMEWORKS = {
  pico: {
    name: 'PICO',
    suits: 'Comparative or intervention questions: does this change work better than that, and for whom?',
    fields: [['p', 'Population', 'Who is it about?'], ['i', 'Intervention', 'The change, feature or exposure'], ['c', 'Comparison', 'Compared with what?'], ['o', 'Outcome', 'The result you will look at']],
    draft: (f) => `For ${f.p}, does ${f.i}, compared with ${f.c}, change ${f.o}?`,
  },
  spice: {
    name: 'SPICE',
    suits: 'Service or evaluation questions: how well does something work, in a setting, for a group?',
    fields: [['s', 'Setting', 'Where or in what context?'], ['p', 'Perspective', 'For whom, from whose view?'], ['i', 'Intervention or phenomenon of interest', 'What is being looked at?'], ['c', 'Comparison', 'Compared with what, if anything?'], ['e', 'Evaluation', 'How will you judge it?']],
    draft: (f) => `In ${f.s}, from the perspective of ${f.p}, how does ${f.i} compare with ${f.c}, judged by ${f.e}?`,
  },
  spider: {
    name: 'SPIDER',
    suits: 'Qualitative and mixed-methods questions about experiences, views and meanings.',
    fields: [['s', 'Sample', 'Who will you hear from?'], ['pi', 'Phenomenon of interest', 'The experience or behaviour'], ['d', 'Design', 'Interviews, diary study, survey...'], ['e', 'Evaluation', 'Views, experiences, attitudes...'], ['r', 'Research type', 'Qualitative, quantitative or mixed']],
    draft: (f) => `What are the ${f.e} of ${f.s} regarding ${f.pi}, explored through ${f.d} (${f.r})?`,
  },
  eclipse: {
    name: 'ECLIPSE',
    suits: 'Policy and service management questions: how could a service be organised or improved?',
    fields: [['e', 'Expectation', 'What do you want the information for?'], ['c', 'Client group', 'Who is the service for?'], ['l', 'Location', 'Where is it delivered?'], ['i', 'Impact', 'What would change, and how would you know?'], ['p', 'Professionals', 'Who delivers it?'], ['se', 'SErvice', 'Which service?']],
    draft: (f) => `How could ${f.se} for ${f.c} in ${f.l}, delivered by ${f.p}, be improved so that ${f.i}, in order to ${f.e}?`,
  },
};

// The framework that usually suits the answers so far.
export function suggestFramework(s = {}) {
  const goals = s.goals || [];
  if (goals.includes('prove-causation') || goals.includes('compare-designs')) return 'pico';
  if (goals.includes('decision-support') || goals.includes('prioritize')) return 'eclipse';
  if (s.approach === 'quantitative') return goals.includes('evaluate-usability') || goals.includes('measure-attitudes') ? 'spice' : 'pico';
  return 'spider';
}

// The draft question, with any field left blank shown as its label in brackets.
export function draftQuestion(s = {}) {
  if (s.hasRQ === 'no') {
    const d = (s.decision || '').trim();
    const w = (s.who || '').trim();
    const k = (s.needToKnow || '').trim();
    if (!d && !w && !k) return '';
    return `To decide ${d || '[the decision]'}, what do we need to know about ${k || '[the gap in knowledge]'} for ${w || '[the people involved]'}?`;
  }
  const fw = FRAMEWORKS[s.framework];
  const vals = (s.fw || {})[s.framework] || {};
  if (!fw || !fw.fields.some(([k]) => (vals[k] || '').trim())) return (s.rq || '').trim();
  return fw.draft(Object.fromEntries(fw.fields.map(([k, label]) => [k, (vals[k] || '').trim() || `[${label.toLowerCase()}]`])));
}

// Margin of error, in percentage points, for a proportion near 50% at 95% confidence.
export const marginOfError = (n) => (n > 0 ? 196 * Math.sqrt(0.25 / n) : null);

const slim = (m) => ({ id: m.id, name: m.name, family: m.family, status: m.status, summary: m.summary });
const LEVEL = { beginner: 'newcomer', intermediate: 'mid', advanced: 'expert' };

// Which strands the study has, from the approach and the chosen ways of collecting data.
export function strands(s = {}) {
  let modes = (s.collect || []).filter((m) => COLLECT[m]);
  if (!modes.length) {
    modes = s.participants === 'logs' ? ['analytics']
      : s.approach === 'quantitative' ? ['quant-survey']
      : s.approach === 'mixed' ? ['interviews', 'quant-survey']
      : (s.goals || []).includes('evaluate-usability') ? ['usability'] : ['interviews'];
  }
  // A mixed-methods study needs a mode for each strand; suggest one when the answers lack it.
  if (s.approach === 'mixed') {
    if (!modes.some((m) => QUAL_MODES.includes(m) || m === 'usability')) modes = [...modes, 'interviews'];
    if (!modes.some((m) => QUANT_MODES.includes(m))) modes = [...modes.slice(0, 2), 'quant-survey'];
  }
  // Usability tests and desk research serve either strand; the approach decides which.
  const qual = s.approach !== 'quantitative' && (modes.some((m) => QUAL_MODES.includes(m)) || (s.approach !== 'mixed' && modes.some((m) => m === 'usability' || m === 'desk')));
  const quant = s.approach !== 'qualitative' && (modes.some((m) => QUANT_MODES.includes(m)) || (s.approach === 'quantitative' && modes.includes('usability')));
  return { modes, qual: qual || (!quant && s.approach !== 'quantitative'), quant: quant || (s.approach === 'quantitative' && !qual), mixed: s.approach === 'mixed' || (qual && quant) };
}

// Which qualitative analysis suits the answers: the key of an entry in QUAL_ANALYSIS below.
export function qualAnalysisFit(s = {}) {
  const goals = s.goals || [];
  const { modes } = strands(s);
  if (s.time === 'hours' || s.time === 'days') return 'rapid';
  if (modes.length === 1 && modes[0] === 'qual-survey') return 'thematic';
  if (goals.includes('compare-designs') || goals.includes('segment-users')) return 'miles';
  if (goals.includes('decision-support') || goals.includes('prioritize') || s.expertise === 'newcomer') return 'framework';
  if ((goals.includes('explore-unknowns') || goals.includes('model-cognition')) && s.time === 'months' && s.expertise !== 'newcomer') return 'gt';
  if (goals.includes('understand-why') && s.expertise === 'expert') return 'gioia';
  return 'thematic';
}

// Which mixed-methods design suits the answers.
export function mixedDesignFit(s = {}) {
  const goals = s.goals || [];
  const { modes } = strands(s);
  if (goals.includes('prove-causation') || modes.includes('experiment')) return 'embedded';
  if (s.time === 'months' && (goals.includes('monitor-over-time') || modes.length > 3)) return 'multiphase';
  if (goals.includes('validate-instrument') || (goals.includes('explore-unknowns') && modes.includes('quant-survey'))) return 'exploratory';
  if (goals.includes('measure-attitudes') || goals.includes('measure-behavior') || modes.includes('analytics')) return 'explanatory';
  return 'convergent';
}

// ── Candidate methods for each step ──
// Each candidate is [id, weight, reason]. The weight is the curator's preference for these answers;
// the recommender's score against the answers is added to it, so the answers can reorder close calls.

function frameItems(s) {
  const desk = (s.collect || []).includes('desk');
  if (s.hasRQ === 'yes') {
    return [{ key: 'frame', why: 'You have a question; check it maps to the decision and to the methods before designing anything.', goals: ['decision-support', 'prioritize'], cands: [
      ['objective-question-method-chain', 7, 'You have a question; link it back to the decision and forward to the methods that can answer it.'],
      ['research-plan-and-proposal-with-sign-off', s.expertise === 'newcomer' ? 7 : 5, 'Write the question, scope and plan down and get it signed off before fieldwork.'],
      ['research-question-prioritisation-matrix', 4, 'If the question splits into several, rank them by value and uncertainty.'],
      ['desk-research-secondary-and-internal-sources', desk ? 6.5 : 3, 'Check what is already known before collecting anything new.'],
    ] }];
  }
  return [{ key: 'frame', why: 'You do not have a research question yet, so start from the decision and work back to the questions.', goals: ['decision-support', 'prioritize'], cands: [
    ['research-question-prioritisation-matrix', 7, 'No question yet: list what you could ask and rank it by how much the answer would change the decision.'],
    ['objective-question-method-chain', 6, 'No question yet: chain the business objective to research questions, then to methods.'],
    ['assumption-surfacing-through-pre-study-interview', 3, 'Surface what the team already assumes, so the research tests it.'],
    ['stakeholder-interview-protocol-organisational-research', 3, 'Ask the people who will use the findings what they need to decide.'],
    ['desk-research-secondary-and-internal-sources', desk ? 6.5 : 3, 'Check what is already known before collecting anything new.'],
  ] }];
}

function designItems(s, st) {
  const lv = s.expertise;
  const goals = s.goals || [];
  let cands;
  if (st.mixed) {
    const fit = mixedDesignFit(s);
    const w = (k) => (fit === k ? 8 : 4);
    cands = [
      ['convergent-mixed-methods-design', w('convergent'), 'You want both strands at once; collect them in parallel and compare.'],
      ['sequential-explanatory-design', w('explanatory'), 'Measure first, then explain the numbers with qualitative follow-up.'],
      ['qual-to-quant-bridge-theme-to-construct-operationalisation', w('exploratory'), 'Explore first, then turn the themes into measures you can survey (exploratory sequential).'],
      ['multiphase-mixed-methods-design', w('multiphase'), 'A longer programme: several linked studies, each building on the last.'],
      ['mixed-methods-experimental-embedded-design', w('embedded'), 'An experiment with a qualitative strand embedded to explain the effect.'],
    ];
  } else if (st.quant) {
    const { modes } = st;
    cands = [
      ['report-first-survey-design-with-dummy-tables', modes.includes('quant-survey') ? (lv === 'expert' ? 5 : 7) : 2, 'Draft the tables you will report before writing a question, so every item earns its place.'],
      ['total-survey-error-framework', modes.includes('quant-survey') ? (lv === 'expert' ? 7 : 4) : 1, 'Plan against every source of survey error, not just sample size.'],
      ['a-b-test-design-beyond-conversion-rates', modes.includes('experiment') ? 8 : 1, 'Design the experiment around the outcome that matters, with guardrail metrics.'],
      ['pre-registration', modes.includes('experiment') || goals.includes('prove-causation') ? 5 : 1, 'Write down hypotheses and analysis before you see the data.'],
      ['threats-to-validity-audit-shadish-cook-and-campbell', goals.includes('prove-causation') ? 5 : 1.5, 'Check what else could explain the result before you claim cause.'],
      ['causal-effect-estimation-from-observational-data', modes.includes('analytics') && goals.includes('prove-causation') ? 6 : 0, 'Estimate an effect from logs when you cannot run an experiment.'],
      ['research-plan-and-proposal-with-sign-off', 3, 'Write the plan down and get it signed off before fieldwork.'],
    ];
  } else {
    const gt = qualAnalysisFit(s) === 'gt';
    cands = [
      ['qualitative-research-protocol-as-mental-framework', lv === 'newcomer' ? 4 : 6, 'A written protocol keeps a qualitative study focused without making it rigid.'],
      ['research-plan-and-proposal-with-sign-off', lv === 'newcomer' ? 7 : 4, 'Write the plan down and get it signed off before fieldwork.'],
      ['grounded-theory', gt ? 7.5 : 2, 'An open question, months of time and theory to build: grounded theory fits.'],
      ['contextual-inquiry', goals.includes('map-context') ? 4 : 1, 'Study the work where it happens.'],
    ];
  }
  const items = [{ key: 'design', why: st.mixed ? 'Mixed methods: choose how the two strands relate before collecting either.' : st.quant ? 'A quantitative study lives or dies on decisions made before data collection.' : 'Set the scope and the stance of the qualitative study.', goals: goals.length ? goals : ['decision-support'], cands }];
  const lim = s.limits || [];
  if (lim.includes('ethics') || lim.includes('vulnerable') || lim.includes('no-pii')) {
    items.push({ key: 'ethics', label: 'Ethics and approval', why: 'You have ethics or data constraints; settle them before recruiting.', goals: ['assess-risk'], cands: [
      ['research-ethics-protocol', lim.includes('ethics') ? 8 : 5, 'You need approval: write the ethics protocol early, it sets the timetable.'],
      ['informed-consent-procedure', lim.includes('vulnerable') ? 7 : 5, 'Plan how people agree to take part and can withdraw.'],
      ['consent-capacity-assessment-and-supported-consent', lim.includes('vulnerable') ? 6 : 0, 'Some participants may need support to give informed consent.'],
      ['research-data-management-plan-and-record-keeping', lim.includes('no-pii') ? 7.5 : 3, 'No personal data may be kept: plan what you store, where, and for how long.'],
    ] });
  }
  return items;
}

const INSTRUMENTS = {
  interviews: (s) => [
    ['qualitative-research-protocol-as-mental-framework', 5, 'Write the interview guide as a protocol: topics, probes and what you will not ask.'],
    ['structured-session-notetaking', (s.limits || []).includes('no-recording') ? 8 : 3, 'No recording allowed, so plan a note-taking template and a second note-taker.'],
    ['counterfactual-probing', 2.5, 'Prepare "what if" probes that get past rehearsed answers.'],
    ['assumption-surfacing-through-pre-study-interview', 2, 'Turn the team\'s assumptions into questions.'],
  ],
  'quant-survey': (s) => [
    ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 6, 'Write each question against known wording faults before anyone answers it.'],
    ['scale-construction-and-validation', (s.goals || []).includes('validate-instrument') ? 8 : 3, 'Define the construct and build or adapt a validated scale.'],
    ['survey-item-type-selection-decision-tree-and-rating-format-catalogue', 5, 'Pick the right item type and rating format for each question.'],
    ['cognitive-interviewing-for-questionnaire-design', 5, 'Check people understand the questions the way you meant them.'],
    ['questionnaire-pilot-testing', 4.5, 'Pilot the whole questionnaire before launch.'],
    ['likert-scale-design', 3, 'Rating scales built and labelled consistently.'],
  ],
  'qual-survey': () => [
    ['survey-question-writing-diagnostic-checks-structures-and-wording-principles', 6, 'Open questions need the same wording care as closed ones.'],
    ['web-probing-and-respondent-debriefing', 5, 'Add follow-up probes that ask people to explain their answers.'],
    ['questionnaire-pilot-testing', 4.5, 'Pilot it to see whether answers come back deep enough to analyse.'],
    ['cognitive-interviewing-for-questionnaire-design', 4, 'Check people understand the questions the way you meant them.'],
  ],
  usability: () => [
    ['usability-test-task-design', 7, 'Write realistic tasks with clear success criteria.'],
    ['single-ease-question-seq-benchmarking', 3, 'Add a one-question rating after each task.'],
    ['representative-task-design-brunswik', 2.5, 'Sample tasks that represent real use, not the easy path.'],
    ['post-task-confidence-and-disaster-rate', 2, 'Catch people who fail but think they succeeded.'],
  ],
  observation: () => [
    ['observation-frameworks-aeiou-and-checklists', 7, 'Use an observation framework so every visit records the same things.'],
    ['thick-description-and-dual-pass-field-notes', 5, 'Plan field notes written twice: quickly on site and fully the same day.'],
    ['structured-observation', 3, 'Count defined behaviours if you need numbers.'],
  ],
  diary: () => [
    ['momentary-item-writing-and-esm-questionnaire-construction', 6, 'Write short in-the-moment prompts that people can answer many times.'],
    ['structured-diary-study', 4, 'A fixed entry format makes the diaries comparable.'],
  ],
  analytics: () => [
    ['analytics-data-quality-assessment', 7, 'Check the tracking is complete and correct before trusting it.'],
    ['behavioral-feature-matrix-construction-from-session-logs', 3, 'Turn sessions into features you can analyse.'],
  ],
  experiment: () => [
    ['experiment-test-cell-design-strategy', 6, 'Design the variants so each difference tests one idea.'],
    ['experiment-review-meeting-and-design-checklist', 5, 'Review the experiment design with a checklist before launch.'],
    ['randomisation-unit-selection', 4, 'Randomise by the right unit: user, session or account.'],
  ],
  desk: () => [
    ['comprehensive-literature-search-for-a-research-synthesis', 6, 'Search systematically so the review is not just what you already knew.'],
    ['coding-protocol-for-research-synthesis', 4, 'Extract findings from sources into a consistent coding sheet.'],
  ],
};

function instrumentItems(s, st) {
  return st.modes.slice(0, 3).map((mode) => ({
    key: `instruments:${mode}`, label: COLLECT[mode], why: `Instruments for ${COLLECT[mode].toLowerCase()}.`,
    goals: ['validate-instrument', ...(s.goals || [])], cands: INSTRUMENTS[mode](s),
  }));
}

function samplingItems(s, st) {
  const tight = s.budget === 'none' || s.budget === 'low';
  const n = Number(s.sampleSize) || 0;
  const usab = st.modes.includes('usability');
  const cands = [];
  const calcs = [];
  if (st.mixed) cands.push(['tree-mixed-methods-sampling-framework', 7, 'Mixed methods: decide how the two samples relate (same people, a subset, or different).']);
  if (st.qual) {
    const gt = qualAnalysisFit(s) === 'gt';
    cands.push(
      ['purposive-sampling-maximum-variation-and-criterion', 6, 'Choose people for the variety they bring, not for statistical representativeness.'],
      ['participant-recruiting-and-screener-design', s.expertise === 'newcomer' ? 6.5 : 4.5, 'Write a screener so you recruit the people the question is about.'],
      ['theoretical-sampling-and-saturation', gt ? 7.5 : 2.5, 'Grounded theory samples as the analysis develops, until new data adds nothing.'],
      ['saturation-monitoring', 3, 'Track when new sessions stop adding new codes.'],
    );
    calcs.push('saturation');
  }
  if (usab && !st.quant) {
    cands.push(['problem-discovery-sample-size-model-1-1-p-n', 6.5, 'Usability testing: size the study by the share of problems you need to find.']);
    calcs.push('sample-size', 'discovery');
  }
  if (st.quant) {
    const survey = st.modes.includes('quant-survey');
    cands.push(
      ['probability-sampling', survey && s.participants === 'large' && !tight ? 6.5 : 3, 'To generalise to a population, every member needs a known chance of selection.'],
      ['quota-sampling', survey && tight ? 5.5 : 2.5, 'With a tight budget, quotas keep key groups represented.'],
      ['statistical-power-analysis', st.modes.includes('experiment') ? 7 : 3.5, 'Work out the sample needed to detect the smallest effect that matters.'],
      ['sample-size-planning-for-summative-ux-studies', usab || survey ? 5 : 2, 'Size the study for the precision your decision needs.'],
      ['pragmatic-budget-and-feasibility-sample-sizing', tight ? 5.5 : 2, 'Budget and access set the sample; say what precision that buys.'],
    );
    if (st.modes.includes('analytics') && !survey) cands.push(['analytics-data-quality-assessment', 4, 'With logs, the sample is whoever was tracked; check who is missing.']);
    calcs.push('sample-size');
    if (survey) calcs.push('margin-of-error');
  }
  if (!cands.length) cands.push(['participant-recruiting-and-screener-design', 5, 'Recruit the people the question is about.']);
  const why = n ? `You expect about ${n} participants${s.participants ? ` and have ${(ACCESS[s.participants] || '').toLowerCase()}` : ''}.` : 'Decide who takes part and how many before recruiting.';
  return [{ key: 'sampling', why, goals: ['decision-support', 'segment-users'], cands, calcs }];
}

const COLLECTING = {
  interviews: (s) => [
    ['interviews', 6, 'Semi-structured conversations about experience and reasons.'],
    ['online-and-remote-qualitative-research-adaptations', (s.limits || []).includes('remote') ? 7 : 2, 'Remote only: adapt rapport, consent and recording for video calls.'],
    ['contextual-inquiry', (s.goals || []).includes('map-context') && !(s.limits || []).includes('remote') ? 6.5 : 3, 'Interview people where they do the work, to see context as well as hear about it.'],
    ['jobs-to-be-done-switch-interviews', (s.goals || []).includes('decision-support') ? 4 : 2, 'Reconstruct a real recent decision in detail.'],
  ],
  'qual-survey': () => [
    ['surveys', 5, 'An open-ended survey reaches more people than interviews, with shallower answers.'],
    ['conversational-survey-chatbot-administered-questionnaire', 3.5, 'A conversational format can draw out longer open answers.'],
    ['web-probing-and-respondent-debriefing', 3, 'Follow closed answers with an open "why".'],
  ],
  'quant-survey': (s) => [
    ['surveys', 6, 'A structured questionnaire measures across many people.'],
    ['intercept-survey', s.material === 'live' ? 5 : 2, 'Ask people in the product, at the moment of use.'],
    ['ux-cross-sectional-survey', 3, 'A one-off snapshot across a population.'],
    ['retrospective-survey-based-ux-benchmark', (s.goals || []).includes('monitor-over-time') ? 5 : 2, 'A repeatable benchmark to track over time.'],
  ],
  usability: (s) => {
    const remote = (s.limits || []).includes('remote');
    return [
      ['moderated-usability-testing', remote ? 4 : 6, 'Watch people attempt real tasks and ask why as it happens.'],
      ['unmoderated-remote-testing', remote || s.participants === 'moderate' || s.participants === 'large' ? 6.5 : 3, 'Remote, unmoderated sessions reach more people for less.'],
      ['think-aloud-usability-testing-contemporary-practice', 4, 'Ask people to think aloud while they work.'],
      ['field-usability-testing', remote ? 0 : 2.5, 'Test in the real setting, with its interruptions.'],
    ];
  },
  observation: (s) => [
    ['field-studies', (s.limits || []).includes('remote') ? 1 : 6, 'Go where the activity happens and watch.'],
    ['rapid-ethnography', s.time === 'days' || s.time === 'weeks' ? 5 : 3, 'Focused fieldwork on a short timetable.'],
    ['structured-observation', s.approach === 'quantitative' ? 6 : 2.5, 'Count defined behaviours with a coding scheme.'],
    ['ethnographic-research', s.time === 'months' ? 5 : 1, 'Long immersion for deep context.'],
  ],
  diary: (s) => [
    ['diary-studies', 6, 'People record experiences as they happen over days or weeks.'],
    ['experience-sampling-method', s.approach === 'quantitative' ? 6.5 : 3, 'Prompt people several times a day for short ratings.'],
    ['structured-diary-study', 4, 'Diaries with a fixed format, easier to compare.'],
  ],
  analytics: (s) => [
    ['web-analytics-interpretation-for-ux', 6, 'Read the analytics for behaviour, not just traffic.'],
    ['funnel-analysis', (s.goals || []).includes('diagnose-errors') ? 6.5 : 4, 'Find where people drop out of a flow.'],
    ['cohort-analysis', (s.goals || []).includes('monitor-over-time') ? 6 : 3, 'Follow groups who started at the same time.'],
    ['log-file-analysis', 3, 'Work from raw event logs.'],
  ],
  experiment: (s) => [
    ['a-b-testing', 6, 'Randomly assign people to versions and compare outcomes.'],
    ['ux-randomised-controlled-trials-clinical-grade-a-b-testing', s.expertise === 'expert' ? 5.5 : 2, 'A trial run to clinical standards when the stakes are high.'],
    ['randomised-complete-block-design-rcbd', s.participants === 'moderate' ? 4 : 1.5, 'Block on a known difference to get more from a smaller sample.'],
  ],
  desk: () => [
    ['desk-research-secondary-and-internal-sources', 6, 'Start from reports, tickets, past research and published studies.'],
    ['secondary-analysis-of-qualitative-data', 4, 'Re-analyse transcripts or notes you already have.'],
    ['ux-systematic-review-and-meta-analysis', 2.5, 'Pool published studies systematically.'],
  ],
};

function collectItems(s, st) {
  return st.modes.slice(0, 3).map((mode) => ({
    key: `collect:${mode}`, label: COLLECT[mode],
    why: (s.collect || []).includes(mode) ? `You chose ${COLLECT[mode].toLowerCase()}${s.time ? ` with ${TIME[s.time].toLowerCase()} available` : ''}.` : `Suggested so the ${s.approach === 'mixed' ? 'study has both strands' : 'plan has a way to collect data'}.`,
    goals: s.goals, material: true, participants: true, prefix: true, cands: COLLECTING[mode](s),
  }));
}

function analyseItems(s, st) {
  const items = [];
  if (st.qual) {
    const fit = qualAnalysisFit(s);
    const w = (k) => (fit === k ? 8 : 3);
    const usab = st.modes.includes('usability') && st.modes.length === 1;
    items.push({ key: 'analyse:qual', label: st.mixed ? 'Qualitative strand' : '', why: 'Code the qualitative data.', goals: ['synthesize-data', ...(s.goals || [])], cands: [
      ['thematic-analysis', w('thematic') + 0.5, 'Patterns of meaning across the whole dataset: reflexive thematic analysis fits.'],
      ['affinity-diagramming', fit === 'rapid' ? 8 : 2, 'Short on time: cluster observations together as a team.'],
      ['usability-test-debrief-meeting', usab ? 8.5 : 0, 'Usability sessions: agree the problems and their severity as a team straight after.'],
      ['framework-analysis', w('framework'), 'A decision to support: chart the data against the questions in a matrix the team can share.'],
      ['matrix-analysis-miles-and-huberman', w('miles'), 'You need to compare groups or designs: matrix displays make the comparison explicit.'],
      ['focused-coding-charmaz', w('gt'), 'Build a theory from the data: constructivist grounded theory coding.'],
      ['gioia-methodology', w('gioia'), 'Build concepts from participants\' own terms, with a data structure that shows the steps.'],
      ['content-analysis', st.modes.includes('qual-survey') ? 5 : 1, 'Many short open answers: code and count them.'],
    ] });
  }
  if (st.quant) {
    const m = st.modes;
    const goals = s.goals || [];
    const cands = [];
    const calcs = [];
    if (m.includes('experiment')) { cands.push(['effect-size-calculation', 7, 'Report how big the difference is, not just whether it is significant.'], ['a-b-result-decision-rules-and-triage', 5, 'Agree in advance what result leads to which decision.']); calcs.push('compare-rates', 'compare-means', 'effect-size', 'bayes-ab', 'sprt'); }
    if (m.includes('quant-survey')) {
      cands.push(
        ['reliability-analysis-cronbachs-alpha-split-half-omega', goals.includes('measure-attitudes') || goals.includes('validate-instrument') ? 7 : 3, 'Check your scales measure consistently before comparing scores.'],
        ['survey-data-cleaning', 5.5, 'Clean the data first: speeders, straight-liners, duplicates.'],
        ['survey-weighting', s.participants === 'large' ? 4 : 1.5, 'Weight the sample back to the population.'],
        ['correlation-analysis-with-confidence-intervals', 3, 'How strongly measures move together, with intervals.'],
      );
      calcs.push('reliability', 'rating', 'top-box', 'nps', 'correlation');
    }
    if (m.includes('usability')) {
      cands.push(['adjusted-wald-confidence-interval-for-completion-rates', 6, 'Small samples: give completion rates with honest intervals.'], ['confidence-intervals-for-task-time-log-transformed-and-median', 4, 'Task times are skewed; use the right interval.']);
      calcs.push('completion-rate', 'task-time', 'sus');
    }
    if (m.includes('analytics')) {
      cands.push(['exploratory-data-analysis-for-behavioural-ux-data', 6, 'Look at distributions and outliers before modelling.'], ['funnel-analysis', 4, 'Find where people drop out.']);
      calcs.push('compare-rates');
    }
    if (!cands.length) { cands.push(['effect-size-calculation', 5, 'Report how big differences are, with intervals.']); calcs.push('compare-means', 'effect-size'); }
    items.push({ key: 'analyse:quant', label: st.mixed ? 'Quantitative strand' : '', why: 'Analyse the numbers.', goals: ['synthesize-data', ...goals], cands, calcs });
  }
  return items;
}

function synthesiseItems(s, st) {
  const lv = s.expertise;
  const goals = s.goals || [];
  if (st.mixed) {
    return [{ key: 'synthesise', why: 'Mixed methods: integrate the strands, do not just report them side by side.', goals: ['synthesize-data', 'communicate-findings'], cands: [
      ['joint-display', 8, 'Put qualitative and quantitative results side by side in one display and say what each adds.'],
      ['triangulation', 5.5, 'Check where the strands agree, add to each other, or conflict.'],
      ['mixed-methods-integration-typology', 4, 'Name the type of integration you are doing.'],
    ] }];
  }
  if (st.quant) {
    return [{ key: 'synthesise', why: 'Turn the results into findings tied to the decision.', goals: ['synthesize-data', 'communicate-findings'], cands: [
      ['insight-sentence-pattern', 6, 'Write each finding as a sentence: what, how strong, so what.'],
      ['causal-thinking-audit-for-research-reports', goals.includes('prove-causation') ? 6.5 : 2, 'Check every causal claim before it goes in the report.'],
      ['triangulation', 4, 'Check the numbers against other sources.'],
    ] }];
  }
  return [{ key: 'synthesise', why: 'Turn codes and themes into findings.', goals: ['synthesize-data', 'communicate-findings'], cands: [
    ['affinity-diagramming', lv === 'newcomer' ? 7 : 5, 'Group the findings together as a team.'],
    ['abductive-reasoning-in-research-synthesis', lv === 'expert' ? 6.5 : 3.5, 'Work from surprising findings to the best explanation.'],
    ['typology-construction', goals.includes('segment-users') ? 7 : 2.5, 'Build a typology of the different kinds of users.'],
    ['insight-sentence-pattern', 4, 'Write each insight as a sentence people can act on.'],
    ['member-checking', 2.5, 'Check the interpretation with participants.'],
  ] }];
}

function reportItems(s, st) {
  const usab = st.modes.includes('usability');
  const fast = s.time === 'hours' || s.time === 'days';
  return [{ key: 'report', why: 'Report the findings with their strength and limits.', goals: ['communicate-findings', 'decision-support'], cands: [
    ['research-reporting-and-readouts', 6, 'Plan the readout around the decision, not the method.'],
    ['usability-findings-report-and-recommendations', usab ? 7.5 : 0, 'Usability: problems, severity, evidence and recommendations.'],
    ['writing-qualitative-findings-evidence-standards', st.qual && !st.quant ? 6.5 : st.qual ? 4 : 0, 'Show the evidence behind each finding: quotes, counts and context.'],
    ['apa-style-reporting-of-statistical-results', st.quant && s.expertise === 'expert' ? 6.5 : st.quant ? 3.5 : 0, 'Report statistics in full: effect, interval and test.'],
    ['decision-memo-template-one-page', fast ? 6.5 : 3, 'One page: the decision, the evidence and the recommendation.'],
    ['findings-presentation-design', 4, 'Design the presentation so the findings land.'],
  ] }];
}

// ── Building the plan ──

function fitScore(m, item, s, used) {
  const rec = {
    goals: item.goals?.length ? item.goals : undefined,
    time: s.time,
    data: s.approach && s.approach !== 'any' ? s.approach : undefined,
    material: item.material ? s.material : undefined,
    participants: item.participants ? s.participants : undefined,
  };
  const r = scoreMethod(m, rec);
  let x = 0.15 * r.score + r.fine;
  const lv = LEVEL[m.facets?.expertise];
  if (s.expertise === 'newcomer' && lv === 'expert') x -= 2;
  if (s.expertise === 'expert' && lv === 'newcomer') x -= 0.5;
  if ((s.budget === 'none' || s.budget === 'low') && m.facets?.participants === 'large') x -= 2;
  if (used.has(m.id)) x -= 6; // already recommended in an earlier step
  return { x, why: r.why, rec };
}

// Similar methods to swap in: related ids first, then the same family with overlapping goals,
// then the other candidates for this step, each group ranked by the recommender against the answers.
function alternatives(chosen, item, cands, s, methods, byId, used) {
  const rec = fitScore(chosen, item, s, new Set()).rec;
  const goals = chosen.facets?.goals || [];
  const related = (chosen.relatedIds || []).map((id) => byId.get(id)).filter(Boolean);
  const family = methods.filter((m) => m.family === chosen.family && m.id !== chosen.id && (m.facets?.goals || []).some((g) => goals.includes(g)));
  const others = cands.map((c) => c.m).filter((m) => m.id !== chosen.id);
  const out = [];
  const seen = new Set([chosen.id]);
  for (const group of [related, others, family]) {
    for (const r of rank(group, rec)) {
      if (out.length >= (group === family ? 4 : 3) || seen.has(r.m.id)) continue;
      seen.add(r.m.id);
      if (group === family && r.coarse < 0) continue; // a family member that does not fit the answers is not a swap
      out.push({ ...slim(r.m), why: r.why.filter((w) => !w.startsWith('needs') && !w.startsWith('takes')).slice(0, 1)[0] || (used.has(r.m.id) ? 'also used elsewhere in this plan' : '') });
    }
  }
  return out.slice(0, 4);
}

// Only the structured answers reach the planner; free text stays in the browser.
export function cleanInput(raw = {}) {
  const one = (v, vocab) => (typeof v === 'string' && vocab[v] ? v : undefined);
  const many = (v, ok, max = 12) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && ok(x)))].slice(0, max) : []);
  const picks = {};
  for (const [k, v] of Object.entries(raw.picks && typeof raw.picks === 'object' ? raw.picks : {}).slice(0, 20)) {
    if (/^[a-z:-]{1,40}$/.test(k) && typeof v === 'string' && v.length < 200) picks[k] = v;
  }
  const n = Math.round(Number(raw.sampleSize));
  return {
    hasRQ: raw.hasRQ === 'yes' || raw.hasRQ === 'no' ? raw.hasRQ : undefined,
    approach: one(raw.approach, APPROACH),
    collect: many(raw.collect, (x) => COLLECT[x]),
    time: one(raw.time, TIME),
    budget: one(raw.budget, BUDGET),
    participants: one(raw.participants, ACCESS),
    sampleSize: n > 0 && n < 1e7 ? n : undefined,
    limits: many(raw.limits, (x) => LIMITS[x]),
    expertise: one(raw.expertise, EXPERTISE),
    material: typeof raw.material === 'string' && /^[a-z]{2,12}$/.test(raw.material) ? raw.material : undefined,
    goals: many(raw.goals, (x) => /^[a-z-]{2,40}$/.test(x), 6),
    picks,
  };
}

export function buildPlan(methods, byId, input = {}) {
  const s = cleanInput(input);
  const st = strands(s);
  const picks = s.picks || {};
  const used = new Set();
  const builders = { frame: frameItems, design: designItems, instruments: instrumentItems, sampling: samplingItems, collect: collectItems, analyse: analyseItems, synthesise: synthesiseItems, report: reportItems };
  const phases = PHASES.map((ph) => {
    const items = builders[ph.key](s, st).map((item) => {
      // Guard: drop any candidate whose id is not in the data.
      const cands = item.cands.map(([id, w, why]) => ({ m: byId.get(id), w, why })).filter((c) => c.m && c.w > 0);
      if (!cands.length) return null;
      const scored = cands.map((c) => ({ ...c, ...fitScore(c.m, item, s, used) })).sort((a, b) => b.w + b.x - (a.w + a.x));
      const best = scored[0];
      const pickedM = picks[item.key] && byId.get(picks[item.key]);
      const chosen = pickedM || best.m;
      used.add(chosen.id);
      const own = cands.find((c) => c.m.id === chosen.id);
      let alts = alternatives(chosen, item, cands, s, methods, byId, used);
      // After a swap, the original recommendation stays one click away.
      if (pickedM && pickedM.id !== best.m.id) alts = [{ ...slim(best.m), why: 'the original recommendation', original: true }, ...alts.filter((a) => a.id !== best.m.id)].slice(0, 4);
      return {
        key: item.key,
        label: item.label || '',
        method: slim(chosen),
        reason: own?.why ? (item.prefix ? `${item.why} ${own.why}` : own.why) : pickedM ? `Your pick. ${item.why}` : item.why,
        picked: Boolean(pickedM && pickedM.id !== best.m.id),
        alternatives: alts,
        calcs: [...new Set(item.calcs || [])].filter((id) => CALCULATORS[id]).map((id) => ({ id, name: CALCULATORS[id] })),
      };
    }).filter(Boolean);
    return { ...ph, items };
  }).filter((ph) => ph.items.length);
  return { strands: { qual: st.qual, quant: st.quant, mixed: st.mixed, modes: st.modes }, phases, guidance: guidance(s, st, byId), warnings: warnings(s, st) };
}

// ── Guidance that changes with the answers ──

const QUAL_ANALYSIS = {
  gt: {
    head: 'Grounded theory',
    text: 'Use it when the aim is to build an explanation of a process from the data, there is little existing theory, and you can sample and analyse in cycles. It needs time and theoretical sampling. Pick a variant: Glaser\'s classic version lets theory emerge with little prior reading and uses coding families; Strauss and Corbin give a more procedural open, axial and selective coding path; Charmaz\'s constructivist version treats the theory as co-constructed, codes with gerunds and asks for reflexivity.',
    ids: ['grounded-theory', 'theoretical-coding-glaser-coding-families', 'strauss-corbin-analytic-tools', 'open-axial-and-selective-coding-pipeline', 'focused-coding-charmaz', 'theoretical-sampling', 'theoretical-sampling-and-saturation'],
  },
  gioia: {
    head: 'Gioia methodology',
    text: 'Use it to build new concepts from what participants say while showing your working. Code first in informants\' own terms, group those into researcher-level themes, then into aggregate dimensions, and present the data structure as a figure. Strong for organisational and process questions where reviewers want to see the path from quote to concept.',
    ids: ['gioia-methodology', 'gioia-data-structure-coding-first-order-to-aggregate-dimensions'],
  },
  miles: {
    head: 'Miles and Huberman matrix and display analysis',
    text: 'Use it when you have defined questions and several cases, groups or designs to compare. Code with a start list, reduce the data into matrices and network displays, then draw and verify conclusions from the displays. Works well with a team and a deadline.',
    ids: ['matrix-analysis-miles-and-huberman', 'miles-and-huberman-analytic-displays', 'start-list-coding-with-a-structured-codebook-and-check-coding', 'effects-matrix-and-explanatory-effects-matrix'],
  },
  thematic: {
    head: 'Reflexive thematic analysis',
    text: 'The flexible default for finding patterns of meaning across a dataset. Themes are built by the analyst, not found, so record your decisions and stance. Suits interviews and open survey answers alike and can be done well by one person.',
    ids: ['thematic-analysis', 'analytic-memo-writing'],
  },
  framework: {
    head: 'Framework analysis',
    text: 'Use it for applied, policy or product questions set in advance, especially with a team. Build a framework from the questions and early data, index every transcript against it, and chart a case-by-theme matrix that others can check and reuse.',
    ids: ['framework-analysis'],
  },
  rapid: {
    head: 'Rapid analysis',
    text: 'With hours or days, code against the research questions directly: structured notes per session, a shared summary matrix, then a team affinity session. Say in the report that the analysis was rapid.',
    ids: ['structured-session-notetaking', 'affinity-diagramming', 'usability-test-debrief-meeting'],
  },
};
const QUAL_ORDER = ['thematic', 'framework', 'gt', 'gioia', 'miles', 'rapid'];

const calcLinks = (...ids) => ids.map((id) => ({ id, name: CALCULATORS[id] }));

function refs(ids, byId) {
  return ids.map((id) => byId.get(id)).filter(Boolean).map(slim);
}

function guidance(s, st, byId) {
  const out = [];
  const lim = s.limits || [];
  const n = Number(s.sampleSize) || 0;
  const block = (key, title, intro, options) => {
    const opts = options.map((o) => ({ ...o, ids: refs(o.ids || [], byId) }));
    out.push({ key, title, intro, options: opts });
  };

  if (st.qual) {
    const fit = qualAnalysisFit(s);
    block('qual-analysis', 'Choosing a qualitative analysis', `For your answers we suggest ${QUAL_ANALYSIS[fit].head.toLowerCase()}. The others are here so you can see why, and swap if your situation differs.`, [
      ...[fit, ...QUAL_ORDER.filter((k) => k !== fit)].map((k) => ({ ...QUAL_ANALYSIS[k], recommended: k === fit })),
      { head: 'Combining approaches', text: 'Approaches can be combined when each does a different job: Charmaz-style coding to build categories, then Miles and Huberman matrices to compare them across segments; a Gioia data structure to present theory built from coding; thematic analysis with a framework matrix so a team can share and check the work.', ids: ['focused-coding-charmaz', 'miles-and-huberman-analytic-displays', 'gioia-data-structure-coding-first-order-to-aggregate-dimensions', 'framework-analysis'] },
      { head: 'Quality', text: 'Whatever you choose, state your quality criteria up front: credibility checks, an audit trail of decisions, negative cases, and member checks where they make sense. If several people apply a fixed codebook, check their coding agreement; track saturation to decide when to stop recruiting.', ids: ['quality-criteria-sets-for-qualitative-and-grounded-theory-research', 'lincoln-and-guba-trustworthiness-criteria', 'dependability-audit-trail', 'member-checking', 'negative-case-analysis-and-rival-explanations', 'cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability', 'species-accumulation-and-good-turing-coverage-for-saturation'], calcs: calcLinks('intercoder', 'saturation') },
    ]);
  }

  if (st.modes.includes('quant-survey')) {
    const moe = marginOfError(n);
    block('survey-quant', 'Survey quality: quantitative', 'A survey is only as good as its questions and its sample. Work through these before launch.', [
      { head: 'Define the construct', text: 'Write down what each measure is meant to capture, and what it is not, before writing items.', ids: ['scale-construction-and-validation'] },
      { head: 'Use validated scales where they exist', text: 'Prefer a published, validated scale over home-made items; adapt with care and re-check reliability.', ids: ['validated-scale-construction', 'survey-item-type-selection-decision-tree-and-rating-format-catalogue'] },
      { head: 'Test the questions', text: 'Run cognitive interviews with five to ten people from the audience, code the problems you see, then pilot the full survey and check timings and drop-out.', ids: ['cognitive-interviewing-for-questionnaire-design', 'behaviour-coding-for-questionnaire-pretesting', 'questionnaire-pilot-testing'] },
      { head: 'Check reliability and validity', text: 'Report internal consistency for multi-item scales and check the items hang together as intended before comparing groups.', ids: ['reliability-analysis-cronbachs-alpha-split-half-omega', 'exploratory-factor-analysis-efa', 'convergent-and-discriminant-validity-cr-ave-fornell-larcker-htmt'], calcs: calcLinks('reliability') },
      { head: 'Sample and weight', text: 'Say who could have answered and who did. Use probability sampling to generalise; otherwise use quotas and weight to known population figures, and say so.', ids: ['probability-sampling', 'quota-sampling', 'survey-weighting', 'total-survey-error-framework'] },
      { head: 'Sample size and margin of error', text: moe ? `With about ${n} complete answers, a proportion near 50% has a margin of error of about ±${moe.toFixed(1)} points at 95% confidence. Subgroups have wider margins.` : 'Decide the precision the decision needs, then work back to the sample size. About 400 answers gives roughly ±5 points on a proportion.', ids: ['sample-size-planning-for-summative-ux-studies', 'design-effects-and-design-based-analysis-of-complex-samples'], calcs: calcLinks('margin-of-error', 'sample-size') },
    ]);
  }
  if (st.modes.includes('qual-survey')) {
    block('survey-qual', 'Survey quality: qualitative', 'Open-ended surveys trade depth for reach. Design for answers you can analyse.', [
      { head: 'Design the open questions', text: 'Ask about a specific recent occasion, one topic per question, with neutral wording. Keep to a few open questions so people do not tire.', ids: ['survey-question-writing-diagnostic-checks-structures-and-wording-principles'] },
      { head: 'Pilot for depth', text: 'Pilot with a handful of people and read the answers: if they come back as one-liners, rephrase or add a probe asking for an example.', ids: ['questionnaire-pilot-testing', 'web-probing-and-respondent-debriefing', 'cognitive-interviewing-for-questionnaire-design'] },
      { head: 'Plan the coding', text: 'Decide early whether you will build themes (reflexive thematic analysis), code against a fixed codebook, or count categories (content analysis). If AI helps with coding, check its work and say so. With a fixed codebook, have a second person code a sample and check agreement.', ids: ['thematic-analysis', 'content-analysis', 'start-list-coding-with-a-structured-codebook-and-check-coding', 'ethics-of-ai-assisted-qualitative-analysis', 'cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability'], calcs: calcLinks('intercoder') },
    ]);
  }

  if (st.mixed) {
    const fit = mixedDesignFit(s);
    const designs = [
      ['convergent', 'Convergent', 'Collect both strands at the same time and compare. Good when time is short and both answer the same question.', ['convergent-mixed-methods-design']],
      ['explanatory', 'Explanatory sequential', 'Quantitative first, then qualitative to explain surprising or important results. Good when you need numbers and the story behind them.', ['sequential-explanatory-design']],
      ['exploratory', 'Exploratory sequential', 'Qualitative first, then build a survey or measure from what you learned. Good when you do not yet know what to measure.', ['qual-to-quant-bridge-theme-to-construct-operationalisation', 'instrument-specification-frameworks-for-mixed-methods']],
      ['multiphase', 'Multiphase', 'Several linked studies over a programme, each informing the next.', ['multiphase-mixed-methods-design']],
      ['embedded', 'Embedded experimental', 'An experiment with a qualitative strand inside it to explain how and why the effect happens.', ['mixed-methods-experimental-embedded-design']],
    ];
    block('mixed', 'Mixed methods design and integration', 'Pick a design that says when each strand runs and why, then plan how the strands meet.', [
      ...designs.map(([k, head, text, ids]) => ({ head, text, ids, recommended: k === fit })),
      { head: 'Integration', text: 'Integrate on purpose: connect the samples, build one from the other, or merge results in a joint display that says where the strands agree, add to each other or conflict. Draw the design as a diagram in the plan.', ids: ['joint-display', 'mixed-methods-integration-typology', 'triangulation', 'procedural-diagrams-and-notation-for-mixed-methods-designs'] },
    ]);
  }

  const rep = [];
  if (st.quant) rep.push({ head: 'Quantitative results', text: 'Lead with effect sizes and confidence intervals, not p-values alone. Show the raw numbers behind percentages and say which differences are too small to matter.', ids: ['effect-size-calculation', 'bootstrap-methods-for-confidence-intervals', 'apa-style-reporting-of-statistical-results'] });
  if (st.qual) rep.push({ head: 'Qualitative results', text: 'Give enough thick description that readers can judge where the findings transfer. Support each theme with quotes from several participants, say how widespread it was, and include the cases that did not fit.', ids: ['writing-qualitative-findings-evidence-standards', 'transferability-through-thick-description', 'srqr-qualitative-reporting-checklist'] });
  if (st.mixed) rep.push({ head: 'Mixed results', text: 'Present integrated findings in a joint display and state what the combination shows that neither strand could alone.', ids: ['joint-display'] });
  const ethicsIds = ['informed-consent-procedure', 'ethical-reporting'];
  if (lim.includes('ethics')) ethicsIds.unshift('research-ethics-protocol');
  if (lim.includes('no-pii')) ethicsIds.push('research-data-management-plan-and-record-keeping');
  rep.push({ head: 'Ethics and reporting', text: [
    'Report who took part, how they were recruited, what they were told and what was left out.',
    lim.includes('no-pii') ? 'Remove names and identifying details from quotes and files, and keep the data plan you agreed.' : 'De-identify quotes and keep data only as long as you need it.',
    lim.includes('no-recording') ? 'Without recordings, quotes come from notes: mark them as paraphrased unless written verbatim.' : '',
    lim.includes('vulnerable') ? 'With vulnerable participants, report safeguards and any distress protocol.' : '',
  ].filter(Boolean).join(' '), ids: ethicsIds });
  block('reporting', 'Results and reporting', 'How to present what you found so readers can judge its strength.', rep);
  return out;
}

function warnings(s, st) {
  const w = [];
  const n = Number(s.sampleSize) || 0;
  const lim = s.limits || [];
  if (s.participants === 'none' && st.modes.some((m) => m !== 'desk' && m !== 'analytics')) w.push('You have no participants but chose methods that need them. Start with desk research or analytics, or plan recruitment first.');
  if (s.participants === 'logs' && st.modes.some((m) => ['interviews', 'qual-survey', 'quant-survey', 'usability', 'observation', 'diary'].includes(m))) w.push('You have logs only, but chose methods that need people. Budget time for recruitment.');
  if (n && s.participants === 'few' && n > 12) w.push(`You expect ${n} participants but said you can reach only a few. Check the access before committing.`);
  if (st.modes.includes('quant-survey') && n && n < 30) w.push(`A quantitative survey of ${n} gives very wide margins; treat results as indicative or add qualitative depth.`);
  if (st.modes.includes('experiment') && n && n < 100) w.push(`An experiment with ${n} people can only detect large effects. Run the power calculation before launch.`);
  if (s.time === 'hours' && (st.mixed || st.modes.length > 1)) w.push('Hours are not enough for several strands. Pick the one that answers the most important question.');
  if (lim.includes('ethics') && (s.time === 'hours' || s.time === 'days')) w.push('Ethics approval usually takes longer than days. Check the timetable with whoever approves it.');
  if (lim.includes('no-recording') && st.modes.includes('interviews')) w.push('No recording: use two people per session, one to ask and one to take notes.');
  if (lim.includes('no-incentives') && (s.participants === 'moderate' || s.participants === 'large')) w.push('Without incentives, expect lower response; plan more reminders and a shorter instrument.');
  if (s.budget === 'none' && s.participants === 'large' && !st.modes.every((m) => m === 'analytics' || m === 'desk')) w.push('Hundreds of participants with no budget usually means an in-product survey or analytics. Recruited panels cost money.');
  return w;
}

// ── Markdown export ──

// `calcInfo(id)` is optional: when the caller passes it ({ question, stage }), calculator links carry the question
// each one answers and the plan ends with a "Calculators for this plan" list grouped by stage (in `stageOrder`).
export function planMarkdown(s, plan, { methodUrl = (id) => `/methods/${id}`, calcUrl = (id) => `/calculators/${id}`, goalText = '', materialText = '', calcInfo = null, stageOrder = [] } = {}) {
  const info = (c) => (calcInfo && calcInfo(c.id)) || null;
  const calcLine = (calcs) => `  - Calculators: ${calcs.map((c) => `[${c.name}](${calcUrl(c.id)})${info(c)?.question ? ` (${info(c).question})` : ''}`).join(', ')}`;
  const L = [];
  const q = draftQuestion(s);
  L.push('# Research study plan', '');
  if (q) L.push(`**Research question:** ${q}`, '');
  if (s.hasRQ === 'yes' && FRAMEWORKS[s.framework]) L.push(`Framed with ${FRAMEWORKS[s.framework].name}.`, '');
  const facts = [
    ['Approach', APPROACH[s.approach]],
    ['Data collection', (plan.strands?.modes || []).map((m) => COLLECT[m]).join(', ')],
    ['Goals', goalText],
    ['Material', materialText],
    ['Time', TIME[s.time]],
    ['Budget', BUDGET[s.budget]],
    ['Access', ACCESS[s.participants]],
    ['Expected sample', s.sampleSize ? String(s.sampleSize) : ''],
    ['Constraints', (s.limits || []).map((x) => LIMITS[x]).filter(Boolean).join(', ')],
    ['Team', EXPERTISE[s.expertise]],
  ].filter(([, v]) => v);
  if (facts.length) { L.push('## Your situation', ''); facts.forEach(([k, v]) => L.push(`- **${k}:** ${v}`)); L.push(''); }
  if (plan.warnings?.length) { L.push('## Watch out', ''); plan.warnings.forEach((x) => L.push(`- ${x}`)); L.push(''); }
  L.push('## Roadmap', '');
  plan.phases.forEach((ph, i) => {
    L.push(`### ${i + 1}. ${ph.title}`, '', ph.blurb, '');
    ph.items.forEach((it) => {
      L.push(`- **${it.label ? `${it.label}: ` : ''}[${it.method.name}](${methodUrl(it.method.id)})**. ${it.reason}`);
      if (it.alternatives.length) L.push(`  - Similar: ${it.alternatives.map((a) => `[${a.name}](${methodUrl(a.id)})`).join(', ')}`);
      if (it.calcs.length) L.push(calcLine(it.calcs));
    });
    L.push('');
  });
  plan.guidance.forEach((g) => {
    L.push(`## ${g.title}`, '', g.intro, '');
    g.options.forEach((o) => {
      L.push(`- **${o.head}${o.recommended ? ' (suggested)' : ''}:** ${o.text}`);
      if (o.ids.length) L.push(`  - See: ${o.ids.map((m) => `[${m.name}](${methodUrl(m.id)})`).join(', ')}`);
      if (o.calcs?.length) L.push(calcLine(o.calcs));
    });
    L.push('');
  });
  if (calcInfo) {
    const all = new Map();
    plan.phases.forEach((ph) => ph.items.forEach((it) => it.calcs.forEach((c) => all.set(c.id, c))));
    plan.guidance.forEach((g) => g.options.forEach((o) => (o.calcs || []).forEach((c) => all.set(c.id, c))));
    const byStage = new Map();
    for (const c of all.values()) {
      const stage = info(c)?.stage || 'Other';
      if (!byStage.has(stage)) byStage.set(stage, []);
      byStage.get(stage).push(c);
    }
    const order = [...stageOrder, ...[...byStage.keys()].filter((k) => !stageOrder.includes(k))];
    if (byStage.size) {
      L.push('## Calculators for this plan', '');
      order.filter((k) => byStage.has(k)).forEach((k) => {
        L.push(`### ${k}`, '');
        byStage.get(k).forEach((c) => L.push(`- [${c.name}](${calcUrl(c.id)})${info(c)?.question ? `: ${info(c).question}` : ''}`));
        L.push('');
      });
    }
  }
  L.push('---', '', 'Made with the UX Methods Atlas study planner.');
  return L.join('\n');
}

// Every method id written into this file, for check-plan.js.
export function hardCodedIds() {
  const s = { goals: [], collect: Object.keys(COLLECT), limits: Object.keys(LIMITS) };
  const ids = new Set();
  const take = (items) => items.forEach((it) => it.cands.forEach(([id]) => ids.add(id)));
  const variants = [
    { ...s, hasRQ: 'yes', approach: 'mixed' }, { ...s, hasRQ: 'no', approach: 'quantitative' }, { ...s, approach: 'qualitative', collect: ['interviews', 'usability'] },
    { ...s, approach: 'quantitative', collect: ['usability', 'analytics'] },
  ];
  for (const v of variants) {
    const st = strands(v);
    st.modes = Object.keys(COLLECT);
    [frameItems, designItems, samplingItems, analyseItems, synthesiseItems, reportItems].forEach((f) => take(f(v, st)));
    take(designItems(v, { ...st, mixed: false, quant: true }));
    take(designItems(v, { ...st, mixed: false, quant: false }));
    take(synthesiseItems(v, { ...st, mixed: false, quant: true }));
    take(synthesiseItems(v, { ...st, mixed: false, quant: false }));
  }
  Object.values(INSTRUMENTS).forEach((f) => f(s).forEach(([id]) => ids.add(id)));
  Object.values(COLLECTING).forEach((f) => f(s).forEach(([id]) => ids.add(id)));
  Object.values(QUAL_ANALYSIS).forEach((o) => o.ids.forEach((id) => ids.add(id)));
  // Guidance blocks: build them with every strand switched on and collect their ids.
  const all = { qual: true, quant: true, mixed: true, modes: Object.keys(COLLECT) };
  const fake = { get: (id) => { ids.add(id); return null; } };
  guidance({ ...s, limits: Object.keys(LIMITS), sampleSize: 100 }, all, fake);
  return [...ids];
}
