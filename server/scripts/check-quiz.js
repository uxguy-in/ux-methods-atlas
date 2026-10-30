// Checks the Practice questions (client/src/quiz.js): unique ids, known levels, topics and types, 3-4 distinct
// options with exactly one answer among them, a reason for every other option, every method, calculator and bias id
// pointing at something real, the answer among the links, at least 8 questions per level and every topic in use.
// Run with `npm run check:quiz`.
import { BADGES, LEVELS, QUESTIONS, ROUND, TOPICS, TYPES, linkId, linkKind, optionKind } from '../../client/src/quiz.js';
import { BIAS_BY_ID } from '../../client/src/biases.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const problems = [];
const calcIds = new Set(CATALOG.map((c) => c.id));
const exists = { method: (id) => kinds.byId.has(id), calc: (id) => calcIds.has(id), bias: (id) => BIAS_BY_ID.has(id) };
const levelIds = LEVELS.map((l) => l.id);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

for (const d of dupes(QUESTIONS.map((q) => q.id))) problems.push(`duplicate question id ${d}`);
for (const d of dupes(QUESTIONS.map((q) => q.scenario))) problems.push(`duplicate scenario: ${d.slice(0, 60)}`);

for (const q of QUESTIONS) {
  const id = q.id || '(no id)';
  if (!/^[a-z0-9-]+$/.test(q.id || '')) problems.push(`${id}: id must be lower-case letters, digits and hyphens`);
  if (!levelIds.includes(q.level)) problems.push(`${id}: unknown level ${q.level}`);
  if (!TOPICS.includes(q.topic)) problems.push(`${id}: unknown topic ${q.topic}`);
  if (!TYPES[q.type]) problems.push(`${id}: unknown type ${q.type}`);
  for (const f of ['scenario', 'explanation']) if (!isStr(q[f])) problems.push(`${id}: missing ${f}`);
  const kind = optionKind(q);
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length < 3 || opts.length > 4) problems.push(`${id}: needs 3-4 options, has ${opts.length}`);
  const optIds = opts.map((o) => (kind ? o : o?.id));
  if (kind) {
    for (const o of opts) {
      if (!isStr(o)) problems.push(`${id}: ${kind} options must be id strings`);
      else if (!exists[kind](o)) problems.push(`${id}: unknown ${kind} option ${o}`);
    }
  } else {
    for (const o of opts) if (!o || !isStr(o.id) || !isStr(o.text)) problems.push(`${id}: result options need an id and text`);
    for (const d of dupes(opts.map((o) => o?.text))) problems.push(`${id}: option text repeated: ${d}`);
  }
  for (const d of dupes(optIds)) problems.push(`${id}: option ${d} listed twice`);
  const hits = optIds.filter((o) => o === q.answer).length;
  if (hits !== 1) problems.push(`${id}: answer ${q.answer} must appear exactly once among the options (found ${hits})`);
  const why = q.why || {};
  for (const o of optIds) {
    if (o === q.answer) { if (why[o]) problems.push(`${id}: the answer should not have a "why weaker" note`); continue; }
    if (!isStr(why[o])) problems.push(`${id}: no reason given for option ${o}`);
  }
  for (const k of Object.keys(why)) if (!optIds.includes(k)) problems.push(`${id}: reason for ${k}, which is not an option`);
  if (!Array.isArray(q.links) || !q.links.length || q.links.length > 4) problems.push(`${id}: needs 1-4 links`);
  for (const l of q.links || []) {
    const k = linkKind(l); const lid = linkId(l);
    if (!exists[k]) problems.push(`${id}: link ${l} must start with method:, calc: or bias:`);
    else if (!exists[k](lid)) problems.push(`${id}: unknown ${k} in links: ${lid}`);
  }
  for (const d of dupes(q.links || [])) problems.push(`${id}: link ${d} listed twice`);
  if (kind && !(q.links || []).includes(`${kind}:${q.answer}`)) problems.push(`${id}: the answer ${kind}:${q.answer} must be among the links`);
}

for (const l of levelIds) {
  const n = QUESTIONS.filter((q) => q.level === l).length;
  if (n < ROUND) problems.push(`level ${l} has ${n} questions; needs at least ${ROUND}`);
}
for (const t of TOPICS) if (!QUESTIONS.some((q) => q.topic === t)) problems.push(`topic ${t} has no questions`);
for (const t of Object.keys(TYPES)) if (!QUESTIONS.some((q) => q.type === t)) problems.push(`type ${t} has no questions`);
for (const b of BADGES) if (b.at && !levelIds.includes(b.at)) problems.push(`badge ${b.id}: unknown level ${b.at}`);
const total = (lvl) => QUESTIONS.filter((q) => q.level === lvl).length;
for (const b of BADGES) {
  if (b.total > QUESTIONS.length) problems.push(`badge ${b.id} needs more questions than exist`);
  if (b.at && b.atLevel > total(b.at)) problems.push(`badge ${b.id} needs more ${b.at} questions than exist`);
}

const count = (key) => Object.entries(QUESTIONS.reduce((m, q) => ({ ...m, [q[key]]: (m[q[key]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ');
if (problems.length) {
  console.error(`check:quiz found ${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`check:quiz OK: ${QUESTIONS.length} questions.\n  Levels: ${count('level')}\n  Types: ${count('type')}\n  Topics: ${count('topic')}`);
