// Checks the question library (client/src/questions.js): unique ids, every field present and the right shape, known
// themes and study stages, every theme used, every method, calculator and bias id pointing at something real, and every
// calculator reachable from at least one question. Run with `npm run check:questions`.
import { QUESTIONS, THEMES, SYNONYMS } from '../../client/src/questions.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { STAGES } from '../../client/src/calc/guides.js';
import { BIAS_BY_ID } from '../../client/src/biases.js';
import { kinds } from '../lib/data.js';
import { readFileSync } from 'node:fs';
import { LIBRARY } from '../../client/src/questions-library.js';

const problems = [];
const calcIds = new Set(CATALOG.map((c) => c.id));
const themeIds = new Set(THEMES.map((t) => t.id));
const stageKeys = Object.keys(STAGES);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const dupes = (list) => list.filter((x, i) => list.indexOf(x) !== i);
const sentences = (s) => (s.match(/[.!?](\s|$)/g) || []).length;

for (const t of THEMES) if (!isStr(t.id) || !isStr(t.name) || !isStr(t.blurb)) problems.push(`theme ${t.id}: needs id, name and blurb`);
for (const d of dupes(THEMES.map((t) => t.id))) problems.push(`duplicate theme id ${d}`);
for (const d of dupes(QUESTIONS.map((q) => q.id))) problems.push(`duplicate question id ${d}`);
for (const d of dupes(QUESTIONS.map((q) => q.question.toLowerCase()))) problems.push(`duplicate question text ${d}`);
if (QUESTIONS.length < 60 || QUESTIONS.length > 130) problems.push(`expected 60-130 questions, found ${QUESTIONS.length}`);

for (const q of QUESTIONS) {
  const id = q.id || '(no id)';
  if (!/^[a-z0-9-]+$/.test(q.id || '')) problems.push(`${id}: id must be lower-case letters, digits and hyphens`);
  if (!isStr(q.question) || !q.question.trim().endsWith('?')) problems.push(`${id}: question must be a string ending in ?`);
  if (!isStr(q.answer)) problems.push(`${id}: missing answer`);
  else if (sentences(q.answer) < 2 || sentences(q.answer) > 3) problems.push(`${id}: answer should be 2-3 sentences (found ${sentences(q.answer)})`);
  if (!themeIds.has(q.theme)) problems.push(`${id}: unknown theme ${q.theme}`);
  if (!Array.isArray(q.stages) || q.stages.length < 1 || !q.stages.every((s) => stageKeys.includes(s))) problems.push(`${id}: stages must be 1-4 of ${stageKeys.join(', ')}`);
  if (!Array.isArray(q.methods) || q.methods.length < 2 || q.methods.length > 6) problems.push(`${id}: methods must have 2-6 entries`);
  for (const mm of q.methods || []) {
    if (!kinds.byId.has(mm.id)) problems.push(`${id}: unknown method ${mm.id}`);
    if (!isStr(mm.why)) problems.push(`${id}: method ${mm.id} needs a why`);
  }
  if (!Array.isArray(q.calcs) || q.calcs.length > 4) problems.push(`${id}: calcs must have 0-4 ids`);
  for (const c of q.calcs || []) if (!calcIds.has(c)) problems.push(`${id}: unknown calculator ${c}`);
  if (!Array.isArray(q.biases) || q.biases.length > 3) problems.push(`${id}: biases must have 0-3 ids`);
  for (const b of q.biases || []) if (!BIAS_BY_ID.has(b)) problems.push(`${id}: unknown bias ${b}`);
  if (q.askInstead !== undefined && (!isStr(q.askInstead.question) || !isStr(q.askInstead.why))) problems.push(`${id}: askInstead needs question and why`);
  for (const f of ['stages', 'calcs', 'biases']) for (const d of dupes(q[f] || [])) problems.push(`${id}: ${f} lists ${d} twice`);
  for (const d of dupes((q.methods || []).map((x) => x.id))) problems.push(`${id}: methods lists ${d} twice`);
}

for (const t of THEMES) if (!QUESTIONS.some((q) => q.theme === t.id)) problems.push(`theme ${t.id} has no questions`);
const covered = new Set(QUESTIONS.flatMap((q) => q.calcs));
for (const c of CATALOG) if (!covered.has(c.id)) problems.push(`calculator ${c.id} is not reachable from any question`);
for (const g of SYNONYMS) if (!Array.isArray(g) || g.length < 2 || !g.every(isStr)) problems.push('each synonym group needs 2 or more words');

if (problems.length) {
  console.error(`check:questions found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
const counts = THEMES.map((t) => `${t.name} ${QUESTIONS.filter((q) => q.theme === t.id).length}`).join(', ');
// Library notes: every key is a question, every source has a title, and every linked book is in the library.
const booksRaw = JSON.parse(readFileSync(new URL('../data/books.json', import.meta.url), 'utf8'));
const bookIds = new Set((Array.isArray(booksRaw) ? booksRaw : booksRaw.books || []).map((b) => b.id));
const qIds = new Set(QUESTIONS.map((q) => q.id));
let libItems = 0;
for (const [qid, lib] of Object.entries(LIBRARY)) {
  if (!qIds.has(qid)) problems.push(`library notes for unknown question ${qid}`);
  for (const f of ['insights', 'rules', 'pitfalls']) for (const it of lib[f] || []) {
    libItems++;
    if (!it.text || !it.source?.title) problems.push(`${qid}: ${f} item without text or source`);
    if (it.source?.book && !bookIds.has(it.source.book)) problems.push(`${qid}: unknown book ${it.source.book}`);
  }
  for (const r of lib.reading || []) if (r.book && !bookIds.has(r.book)) problems.push(`${qid}: unknown book ${r.book} in further reading`);
}

const reframes = QUESTIONS.filter((q) => q.askInstead).length;
console.log(`check:questions OK: ${QUESTIONS.length} questions in ${THEMES.length} themes (${counts}); ${reframes} reframes; all ${CATALOG.length} calculators reachable; every method, calculator and bias id found.`);
