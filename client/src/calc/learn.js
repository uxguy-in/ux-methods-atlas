// Joins the calculator catalog with the learning guides, so every page (calculators index and pages, method pages,
// the planner and the finder) reads one shape. Plain data with no React.
// When a calculator has no guide yet, its question falls back to the catalog blurb and its stages and data to a
// rough guess from its group; `hasGuide` is false so pages can leave out the parts only a guide can fill.
import { CATALOG } from './catalog.js';
import { DATA, GUIDES, STAGES } from './guides.js';

export { DATA, STAGES };
export const STAGE_KEYS = Object.keys(STAGES);
export const DATA_KEYS = Object.keys(DATA);

const GROUP_STAGES = {
  Plan: ['plan'],
  'Predictive models': ['plan', 'analyse'],
  'Navigation and task analysis': ['collect', 'analyse'],
  'Pricing and prioritisation': ['decide'],
  'Business case and content': ['decide'],
  'Decisions and risk': ['decide'],
  'Risk and service': ['decide'],
};
const GROUP_DATA = {
  Plan: ['estimates'],
  Measure: ['task-success', 'task-time', 'ratings'],
  Questionnaires: ['ratings'],
  Compare: ['task-success', 'task-time', 'ratings'],
  Experiments: ['ab-test'],
  'Survey quality': ['survey', 'ratings'],
  'Survey analysis': ['survey'],
  Segmentation: ['survey'],
  'Qualitative rigour': ['qual'],
  Discover: ['qual'],
  'Predictive models': ['design-specs'],
  'Pricing and prioritisation': ['choices', 'survey'],
  'Business case and content': ['estimates'],
  'Behaviour & information': ['physiology', 'choices'],
  'Navigation and task analysis': ['navigation'],
  'Human factors': ['design-specs', 'estimates'],
  'Sensors and behaviour': ['physiology'],
  'Product analytics': ['analytics'],
  'Decisions and risk': ['estimates'],
  'Risk and service': ['estimates'],
  'Statistics workbench': ['survey', 'ratings', 'task-time'],
  Accessibility: ['design-specs'],
};

// The tools most researchers reach for, in order; listed first in every section of the index.
const POPULAR = [
  'sample-size', 'completion-rate', 'sus', 'task-time', 'compare-rates', 'compare-means', 'test-selector', 'rating', 'margin-of-error',
  'nps', 'seq', 'effect-size', 'rate-benchmark', 'top-box', 'preference-test', 'tree-test', 'card-sort', 'first-click', 'counterbalancing',
  'severity-ratings', 'intercoder', 'saturation', 'ux-roi', 'cluster-personas', 'ab-health', 'bayes-ab', 'multi-compare', 'reliability',
  'umux-lite', 'discovery', 'kano', 'maxdiff', 'decision-matrix', 'top-tasks', 'colour-contrast', 'readability', 'retention-funnel',
];
const rank = (id) => { const i = POPULAR.indexOf(id); return i < 0 ? POPULAR.length : i; };

const valid = (list, keys) => (Array.isArray(list) ? list.filter((k) => keys.includes(k)) : []);

function build(c, i) {
  const g = GUIDES[c.id];
  const stages = valid(g?.stages, STAGE_KEYS);
  const data = valid(g?.data, DATA_KEYS);
  return {
    ...c,
    order: i,
    rank: rank(c.id),
    guide: g || null,
    hasGuide: Boolean(g),
    question: (g && g.question) || c.blurb,
    stages: stages.length ? stages : GROUP_STAGES[c.group] || ['analyse'],
    data: data.length ? data : GROUP_DATA[c.group] || [],
  };
}

export const CALC_INFO = CATALOG.map(build);
const BY_ID = new Map(CALC_INFO.map((c) => [c.id, c]));
export const calcInfo = (id) => BY_ID.get(id) || null;
export const byPopularity = (a, b) => a.rank - b.rank || a.order - b.order;
export const stageLabel = (key) => STAGES[key]?.label || key;
export const firstWhen = (c) => (Array.isArray(c?.guide?.when) && c.guide.when[0]) || '';

// Calculators for an atlas method, with their question and stages, most common first.
export function calcsForMethod(methodId) {
  return CALC_INFO.filter((c) => c.methods.includes(methodId)).sort(byPopularity);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// A method id spelt as words, for search when the method list has not loaded.
export const idWords = (id) => id.replace(/-/g, ' ');

// Does a calculator match the search text? Every word must appear in its name, blurb, question, group or method names.
export function matches(c, q, methodName = idWords) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([c.name, c.blurb, c.question, c.group, c.id, ...c.methods.map((m) => methodName(m) || idWords(m))].join(' '));
  return words.every((w) => hay.includes(w));
}

// Splits text with [label](/calculators/id) or [label](/methods/id) links into text and link parts.
export function linkParts(text) {
  const out = [];
  const re = /\[([^\]]+)\]\((\/(?:calculators|methods)\/[a-z0-9-]+)\)/g;
  let last = 0; let m;
  const s = String(text || '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[1], to: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
// The same text with the links reduced to their labels (for Markdown-free contexts such as titles).
export const plainText = (text) => linkParts(text).map((p) => p.text).join('');
