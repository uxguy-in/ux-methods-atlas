// Labels for the controlled vocabularies used in the data and the finder.
export const STATUS = {
  active: { label: 'Active', short: 'In everyday use' },
  vestigial: { label: 'Vestigial', short: 'Name survives, rigour gone' },
  siloed: { label: 'Siloed', short: 'Alive in another field' },
  renamed: { label: 'Renamed', short: 'Survives under a new name' },
  latent: { label: 'Latent', short: 'Known, rarely operationalised' },
  extinct: { label: 'Extinct', short: 'Gone from practice' },
  unmigrated: { label: 'Unmigrated', short: 'Never crossed into UX' },
  community: { label: 'Community-proposed', short: 'Frameworks proposed by practitioners' },
};
export const STATUS_ORDER = ['active', 'vestigial', 'siloed', 'renamed', 'latent', 'extinct', 'unmigrated', 'community'];

export const VALIDATION = {
  tested: { label: 'Tested', short: 'Published evidence of use beyond the proposer' },
  untested: { label: 'Not yet tested', short: 'Proposed, waiting for independent evidence' },
};

export const GOALS = {
  'explore-unknowns': 'Explore unknowns',
  'understand-why': 'Understand why',
  'map-context': 'Map context and workflows',
  'evaluate-usability': 'Evaluate usability',
  'measure-attitudes': 'Measure attitudes',
  'measure-behavior': 'Measure behaviour',
  'compare-designs': 'Compare designs',
  'prove-causation': 'Prove causation',
  'predict-performance': 'Predict performance',
  prioritize: 'Prioritise',
  'segment-users': 'Segment users',
  'diagnose-errors': 'Diagnose errors',
  'assess-risk': 'Assess risk and harm',
  'model-cognition': 'Model cognition',
  'validate-instrument': 'Validate an instrument',
  'synthesize-data': 'Synthesise data',
  'generate-ideas': 'Generate ideas',
  'monitor-over-time': 'Monitor over time',
  'decision-support': 'Support a decision',
  'information-architecture': 'Information architecture',
  'communicate-findings': 'Communicate findings',
};
export const STAGES = { strategy: 'Strategy', discovery: 'Discovery', definition: 'Definition', design: 'Design', evaluation: 'Evaluation', 'post-launch': 'Post-launch' };
export const DATA = { qualitative: 'Qualitative', quantitative: 'Quantitative', mixed: 'Mixed', analytical: 'Analytical / expert' };
export const PARTICIPANTS = { none: 'No participants', few: '1–12 people', moderate: '13–100 people', large: '100+ people', logs: 'Existing logs/analytics' };
export const EFFORT = { hours: 'Hours', days: 'Days', weeks: 'Weeks', months: 'Months' };
// The same three levels the finder and the study planner use (newcomer, mid, expert).
export const EXPERTISE = { beginner: 'New to research', intermediate: 'Mid-level researcher', advanced: 'Senior or specialist' };

// The one name for practices that sit beside the research atlas (kind: 'design').
export const DESIGN_KIND = 'Design & product';

// Reading lists from the library spreadsheet, in sentence case. Values that only name the folder a book was filed
// in ("New in Books folder", "Books for now folder", "Old Backup UX folder") say nothing about the book, so they are
// not shown as labels or offered as filters.
const READING_LISTS = {
  'Must Read': 'Must read',
  'Class Reading': 'Class reading',
  'Self Reading': 'Self reading',
  'Going Deep into UXR': 'Going deep into UX research',
  'Knowledge Add On': 'Knowledge add-on',
  'Deep cuts': 'Deep cuts',
};
export const readingList = (v) => READING_LISTS[v] || '';

export const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Community submissions go through a GitHub issue form, so the static site needs no backend.
export const REPO_URL = import.meta.env.VITE_REPO_URL || 'https://github.com/uxguy-in/ux-methods-atlas';
export const SUBMIT_URL = `${REPO_URL}/issues/new?template=submit-method.yml`;
