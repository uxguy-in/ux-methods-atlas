// Labels for the controlled vocabularies used in the data and the finder.
export const STATUS = {
  active: { label: 'Active', short: 'In everyday use' },
  vestigial: { label: 'Vestigial', short: 'Name survives, rigour gone' },
  siloed: { label: 'Siloed', short: 'Alive in another field' },
  renamed: { label: 'Renamed', short: 'Survives under a new name' },
  latent: { label: 'Latent', short: 'Known, rarely operationalised' },
  extinct: { label: 'Extinct', short: 'Gone from practice' },
  unmigrated: { label: 'Unmigrated', short: 'Never crossed into UX' },
  original: { label: 'Original', short: "Vivek Gopinath's frameworks" },
};
export const STATUS_ORDER = ['active', 'vestigial', 'siloed', 'renamed', 'latent', 'extinct', 'unmigrated', 'original'];

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
export const EXPERTISE = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
