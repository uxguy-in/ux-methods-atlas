// Checks the research bias map (client/src/biases.js): unique ids, every required field present and the right shape,
// known groups and study stages, every group used, and every method and calculator id pointing at something real.
// Run with `npm run check:biases`.
import { BIASES, CHECK_METHODS, GROUPS } from '../../client/src/biases.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { STAGES } from '../../client/src/calc/guides.js';
import { kinds } from '../lib/data.js';

const problems = [];
const calcIds = new Set(CATALOG.map((c) => c.id));
const groupIds = new Set(GROUPS.map((g) => g.id));
const stageKeys = Object.keys(STAGES);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(isStr);
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);

for (const g of GROUPS) {
  if (!isStr(g.id) || !isStr(g.name) || !isStr(g.short) || !isStr(g.blurb)) problems.push(`group ${g.id}: needs id, name, short and blurb`);
}
for (const d of dupes(GROUPS.map((g) => g.id))) problems.push(`duplicate group id ${d}`);

for (const d of dupes(BIASES.map((b) => b.id))) problems.push(`duplicate bias id ${d}`);
for (const d of dupes(BIASES.map((b) => b.name.toLowerCase()))) problems.push(`duplicate bias name ${d}`);

for (const b of BIASES) {
  const id = b.id || '(no id)';
  if (!/^[a-z0-9-]+$/.test(b.id || '')) problems.push(`${id}: id must be lower-case letters, digits and hyphens`);
  for (const f of ['name', 'what', 'looksLike']) if (!isStr(b[f])) problems.push(`${id}: missing ${f}`);
  if (!Array.isArray(b.aka) || !b.aka.every(isStr)) problems.push(`${id}: aka must be a list of strings`);
  if (!groupIds.has(b.group)) problems.push(`${id}: unknown group ${b.group}`);
  if (!isStrList(b.stages, 1, 4) || !b.stages.every((s) => stageKeys.includes(s))) problems.push(`${id}: stages must be 1-4 of ${stageKeys.join(', ')}`);
  if (!isStrList(b.spot, 1, 3)) problems.push(`${id}: spot must have 1-3 items`);
  if (!isStrList(b.counter, 2, 4)) problems.push(`${id}: counter must have 2-4 items`);
  if (!isStrList(b.methods, 2, 6)) problems.push(`${id}: methods must have 2-6 ids`);
  if (!Array.isArray(b.threatens) || !b.threatens.every(isStr)) problems.push(`${id}: threatens must be a list of method ids`);
  if (!Array.isArray(b.calcs) || b.calcs.length > 3 || !b.calcs.every(isStr)) problems.push(`${id}: calcs must have 0-3 ids`);
  for (const m of [...(b.methods || []), ...(b.threatens || [])]) if (!kinds.byId.has(m)) problems.push(`${id}: unknown method ${m}`);
  for (const c of b.calcs || []) if (!calcIds.has(c)) problems.push(`${id}: unknown calculator ${c}`);
  for (const f of ['methods', 'threatens', 'calcs', 'stages', 'aka']) for (const d of dupes(b[f] || [])) problems.push(`${id}: ${f} lists ${d} twice`);
  if (b.source !== undefined) {
    const s = b.source;
    if (!isStr(s?.author) || !isStr(s?.title) || !Number.isInteger(s?.year)) problems.push(`${id}: source needs author, year and title`);
  }
}

for (const g of GROUPS) if (!BIASES.some((b) => b.group === g.id)) problems.push(`group ${g.id} has no biases`);
for (const m of CHECK_METHODS) {
  if (!kinds.byId.has(m)) problems.push(`CHECK_METHODS: unknown method ${m}`);
  else if (!BIASES.some((b) => (b.threatens || []).includes(m))) problems.push(`CHECK_METHODS: ${m} is not in any bias's threatens`);
}

const counts = GROUPS.map((g) => `${g.short} ${BIASES.filter((b) => b.group === g.id).length}`).join(', ');
if (problems.length) {
  console.error(`check:biases found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check:biases OK: ${BIASES.length} biases in ${GROUPS.length} groups (${counts}), every method and calculator id found.`);
