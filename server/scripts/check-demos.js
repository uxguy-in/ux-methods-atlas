// Checks the weak vs strong demos (client/src/demos.js): unique ids and titles, known kinds, both versions present
// with well-formed blocks, 2-4 annotations whose marks appear word for word in the strong version, and every bias,
// method and calculator id pointing at something real. Run with `npm run check:demos`.
import { DEMOS, KINDS, versionText } from '../../client/src/demos.js';
import { BIAS_BY_ID } from '../../client/src/biases.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const problems = [];
const calcIds = new Set(CATALOG.map((c) => c.id));
const kindIds = new Set(KINDS.map((k) => k.id));
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(isStr);
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
const num = (v) => typeof v === 'number' && Number.isFinite(v);

for (const k of KINDS) if (!isStr(k.id) || !isStr(k.name) || !isStr(k.short)) problems.push(`kind ${k.id}: needs id, name and short`);
for (const d of dupes(KINDS.map((k) => k.id))) problems.push(`duplicate kind ${d}`);
for (const d of dupes(DEMOS.map((x) => x.id))) problems.push(`duplicate demo id ${d}`);
for (const d of dupes(DEMOS.map((x) => (x.title || '').toLowerCase()))) problems.push(`duplicate demo title ${d}`);
if (DEMOS.length < 30 || DEMOS.length > 40) problems.push(`expected 30-40 demos, found ${DEMOS.length}`);

function checkBlock(id, where, b, i) {
  const at = `${id} ${where} block ${i + 1}`;
  switch (b?.t) {
    case 'p': if (!isStr(b.text)) problems.push(`${at}: p needs text`); break;
    case 'q': if (!isStr(b.text) || !isStrList(b.options, 2)) problems.push(`${at}: q needs text and 2+ options`); break;
    case 'list': if (!isStrList(b.items, 1)) problems.push(`${at}: list needs items`); break;
    case 'quote': if (!isStr(b.text) || !isStr(b.who) || !Array.isArray(b.codes) || !b.codes.every(isStr)) problems.push(`${at}: quote needs text, who and codes`); break;
    case 'table':
      if (!isStrList(b.head, 2) || !Array.isArray(b.rows) || !b.rows.length) problems.push(`${at}: table needs head and rows`);
      else for (const r of b.rows) if (!isStrList(r, b.head.length) || r.length !== b.head.length) problems.push(`${at}: table row ${JSON.stringify(r)} does not match the head`);
      break;
    case 'bars':
      if (!isStr(b.title) || !num(b.min) || !num(b.max) || b.min >= b.max || !Array.isArray(b.ticks) || !Array.isArray(b.bars) || !b.bars.length) { problems.push(`${at}: bars needs title, min < max, ticks and bars`); break; }
      for (const bar of b.bars) {
        if (!isStr(bar.label) || !num(bar.value) || bar.value < b.min || bar.value > b.max) problems.push(`${at}: bar ${bar.label} out of range`);
        if ((bar.lo !== undefined || bar.hi !== undefined) && !(bar.lo <= bar.value && bar.value <= bar.hi)) problems.push(`${at}: bar ${bar.label} interval must contain its value`);
      }
      break;
    case 'line':
      if (!isStr(b.title) || !num(b.min) || !num(b.max) || !Array.isArray(b.values) || b.values.length < 2 || !Array.isArray(b.labels) || b.labels.length !== b.values.length) { problems.push(`${at}: line needs title, min, max, values and one label per value`); break; }
      if (b.values.some((v) => !num(v) || v < b.min || v > b.max)) problems.push(`${at}: line values out of range`);
      if (b.mark !== undefined && !(Number.isInteger(b.mark) && b.mark >= 0 && b.mark < b.values.length)) problems.push(`${at}: line mark must index a value`);
      break;
    default: problems.push(`${at}: unknown block type ${b?.t}`);
  }
}

for (const d of DEMOS) {
  const id = d.id || '(no id)';
  if (!/^[a-z0-9-]+$/.test(d.id || '')) problems.push(`${id}: id must be lower-case letters, digits and hyphens`);
  for (const f of ['title', 'problem', 'tryIt']) if (!isStr(d[f])) problems.push(`${id}: missing ${f}`);
  if (!kindIds.has(d.kind)) problems.push(`${id}: unknown kind ${d.kind}`);
  for (const where of ['weak', 'strong']) {
    const blocks = d[where]?.blocks;
    if (!Array.isArray(blocks) || !blocks.length) { problems.push(`${id}: missing the ${where} version`); continue; }
    blocks.forEach((b, i) => checkBlock(id, where, b, i));
  }
  const strongText = versionText(d.strong);
  if (!Array.isArray(d.annotations) || d.annotations.length < 2 || d.annotations.length > 4) problems.push(`${id}: needs 2-4 annotations`);
  for (const a of d.annotations || []) {
    if (!isStr(a.mark) || !isStr(a.note)) { problems.push(`${id}: each annotation needs mark and note`); continue; }
    if (!strongText.some((s) => s.includes(a.mark))) problems.push(`${id}: annotation mark “${a.mark}” is not in the strong version`);
  }
  for (const dm of dupes((d.annotations || []).map((a) => a.mark))) problems.push(`${id}: annotation ${dm} twice`);
  if (JSON.stringify(d.weak) === JSON.stringify(d.strong)) problems.push(`${id}: weak and strong versions are identical`);
  if (!isStrList(d.biases, 1)) problems.push(`${id}: needs at least one bias`);
  if (!isStrList(d.methods, 1)) problems.push(`${id}: needs at least one method`);
  if (!Array.isArray(d.calcs) || !d.calcs.every(isStr)) problems.push(`${id}: calcs must be a list of ids`);
  for (const b of d.biases || []) if (!BIAS_BY_ID.has(b)) problems.push(`${id}: unknown bias ${b}`);
  for (const m of d.methods || []) if (!kinds.byId.has(m)) problems.push(`${id}: unknown method ${m}`);
  for (const c of d.calcs || []) if (!calcIds.has(c)) problems.push(`${id}: unknown calculator ${c}`);
  for (const f of ['biases', 'methods', 'calcs']) for (const x of dupes(d[f] || [])) problems.push(`${id}: ${f} lists ${x} twice`);
}
for (const k of KINDS) if (!DEMOS.some((d) => d.kind === k.id)) problems.push(`kind ${k.id} has no demos`);

if (problems.length) {
  console.error(`check:demos found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const counts = KINDS.map((k) => `${k.short} ${DEMOS.filter((d) => d.kind === k.id).length}`).join(', ');
const biasCount = new Set(DEMOS.flatMap((d) => d.biases)).size;
console.log(`check:demos OK: ${DEMOS.length} demos (${counts}), ${biasCount} biases covered, every bias, method and calculator id found.`);
