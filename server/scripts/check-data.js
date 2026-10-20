// Sanity checks for the data files: run with `npm run check:data`.
import { methods, books, byId } from '../lib/data.js';

const problems = [];
const ids = new Set();
for (const m of methods) {
  if (ids.has(m.id)) problems.push(`duplicate id ${m.id}`);
  ids.add(m.id);
  for (const k of ['name', 'family', 'status', 'summary', 'description']) if (!m[k]) problems.push(`${m.id}: missing ${k}`);
  for (const r of m.relatedIds || []) if (!byId.has(r)) problems.push(`${m.id}: related ${r} not found`);
}
console.log(`${methods.length} methods, ${books.length} books, ${problems.length} problems`);
problems.slice(0, 50).forEach((p) => console.log(' -', p));
process.exit(problems.length ? 1 : 0);
