// Checks the calculator learning guides (client/src/calc/guides.js) against the spec: every catalog calculator has a
// guide, every field has the right type, stages and data keys are known, `next` ids are calculators, and every
// [label](/calculators/id) and [label](/methods/id) link points somewhere real.
// Run with `npm run check:guides`. Pass `--allow-missing` to report calculators without a guide without failing.
import { CATALOG } from '../../client/src/calc/catalog.js';
import { DATA, GUIDES, STAGES } from '../../client/src/calc/guides.js';
import { kinds } from '../lib/data.js';

const allowMissing = process.argv.includes('--allow-missing');
const problems = [];
const notes = [];
const calcIds = new Set(CATALOG.map((c) => c.id));
const stageKeys = Object.keys(STAGES);
const dataKeys = Object.keys(DATA);

// The STAGES and DATA vocabularies themselves.
for (const k of ['plan', 'collect', 'analyse', 'decide']) if (!STAGES[k]) problems.push(`STAGES is missing ${k}`);
for (const [k, v] of Object.entries(STAGES)) {
  if (typeof v?.label !== 'string' || !v.label) problems.push(`STAGES.${k} has no label`);
  if (typeof v?.desc !== 'string' || !v.desc) problems.push(`STAGES.${k} has no desc`);
}
for (const k of ['task-success', 'task-time', 'ratings', 'survey', 'choices', 'ab-test', 'analytics', 'qual', 'navigation', 'physiology', 'estimates', 'design-specs']) {
  if (!DATA[k]) problems.push(`DATA is missing ${k}`);
}
for (const [k, v] of Object.entries(DATA)) if (typeof v?.label !== 'string' || !v.label) problems.push(`DATA.${k} has no label`);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(isStr);

// [label](/calculators/id) and [label](/methods/id) links; any other markdown-style link is reported too.
function checkLinks(id, field, text) {
  for (const m of String(text).matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
    const [, label, href] = m;
    if (!label.trim()) problems.push(`${id}.${field}: link with an empty label (${href})`);
    const c = href.match(/^\/calculators\/([a-z0-9-]+)$/);
    const me = href.match(/^\/methods\/([a-z0-9-]+)$/);
    if (c) { if (!calcIds.has(c[1])) problems.push(`${id}.${field}: link to unknown calculator ${c[1]}`); }
    else if (me) { if (!kinds.byId.has(me[1])) problems.push(`${id}.${field}: link to unknown method ${me[1]}`); }
    else problems.push(`${id}.${field}: link must be /calculators/<id> or /methods/<id>, got ${href}`);
  }
}

const FIELDS = {
  question: (v) => isStr(v) || 'a non-empty string',
  stages: (v) => (isStrList(v, 1, 4) && v.every((s) => stageKeys.includes(s))) || `1-4 of ${stageKeys.join(', ')}`,
  data: (v) => (isStrList(v, 1, dataKeys.length) && v.every((s) => dataKeys.includes(s))) || 'one or more DATA keys',
  studies: (v) => isStrList(v, 1, 4) || '1-4 strings',
  needs: (v) => isStr(v) || 'a non-empty string',
  when: (v) => isStrList(v, 2, 4) || '2-4 strings',
  notFor: (v) => isStr(v) || 'a non-empty string',
  steps: (v) => isStrList(v, 3, 6) || '3-6 strings',
  example: (v) => isStr(v) || 'a non-empty string',
  learn: (v) => isStr(v) || 'a non-empty string',
  deeper: (v) => isStr(v) || 'a non-empty string',
  mistakes: (v) => isStrList(v, 2, 4) || '2-4 strings',
  next: (v) => (isStrList(v, 1, 3) && v.every((n) => calcIds.has(n))) || '1-3 calculator ids',
};

if (!GUIDES || typeof GUIDES !== 'object') problems.push('GUIDES is not an object');
const guides = GUIDES || {};
for (const id of Object.keys(guides)) if (!calcIds.has(id)) problems.push(`guide for unknown calculator ${id}`);
const missing = CATALOG.map((c) => c.id).filter((id) => !guides[id]);
if (missing.length) (allowMissing ? notes : problems).push(`${missing.length} calculators have no guide: ${missing.join(', ')}`);

for (const [id, g] of Object.entries(guides)) {
  if (!g || typeof g !== 'object') { problems.push(`${id}: guide is not an object`); continue; }
  for (const [field, test] of Object.entries(FIELDS)) {
    if (!(field in g)) { problems.push(`${id}: missing ${field}`); continue; }
    const ok = test(g[field]);
    if (ok !== true) problems.push(`${id}.${field}: expected ${ok}`);
  }
  for (const field of Object.keys(g)) if (!FIELDS[field]) problems.push(`${id}: unknown field ${field}`);
  if (isStr(g.question) && g.question.length > 110) problems.push(`${id}.question is ${g.question.length} characters (aim for about 90)`);
  if (Array.isArray(g.next) && g.next.includes(id)) problems.push(`${id}.next points to itself`);
  for (const field of Object.keys(FIELDS)) {
    const v = g[field];
    (Array.isArray(v) ? v : [v]).forEach((t) => typeof t === 'string' && checkLinks(id, field, t));
  }
  // The spec's wording rule for confidence intervals.
  const all = JSON.stringify(g);
  if (/\d+% (chance|probability) (that )?the (true|real)/i.test(all)) problems.push(`${id}: describes a confidence interval as a probability that the true value is inside`);
}

const n = Object.keys(guides).length;
console.log(`${n} guides for ${CATALOG.length} calculators, ${problems.length} problems${allowMissing ? ' (missing guides allowed)' : ''}`);
notes.forEach((x) => console.log(' note:', x));
problems.slice(0, 80).forEach((x) => console.log(' -', x));
if (problems.length > 80) console.log(` … and ${problems.length - 80} more`);
process.exit(problems.length ? 1 : 0);
