// Checks the study planner: every method id written into plan.js exists in the data, every
// calculator it links to exists, and plans build for a spread of answers. Run with `npm run check:plan`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kinds } from '../lib/data.js';
import { CALCULATORS, COLLECT, buildPlan, hardCodedIds } from '../lib/plan.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];

const ids = hardCodedIds();
for (const id of ids) {
  if (!kinds.byId.has(id)) problems.push(`method id not found: ${id}`);
  else if (!kinds.researchById.has(id)) problems.push(`method id is a design practice, not a research method: ${id}`);
}

const calcSource = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8');
for (const id of Object.keys(CALCULATORS)) if (!calcSource.includes(`id: '${id}'`)) problems.push(`calculator not found: ${id}`);

// Build plans across the main answer combinations and check each is complete.
let plans = 0;
for (const approach of ['qualitative', 'quantitative', 'mixed', undefined]) {
  for (const collect of [[], ...Object.keys(COLLECT).map((m) => [m]), ['interviews', 'quant-survey'], ['usability', 'analytics', 'experiment']]) {
    for (const time of ['hours', 'weeks', 'months']) {
      for (const expertise of ['newcomer', 'expert']) {
        const s = { hasRQ: plans % 2 ? 'yes' : 'no', approach, collect, time, expertise, goals: plans % 3 ? ['understand-why'] : ['measure-attitudes', 'compare-designs'], participants: 'moderate', sampleSize: 40, limits: ['ethics', 'no-pii'] };
        const p = buildPlan(kinds.research, kinds.researchById, s);
        plans++;
        const keys = p.phases.map((ph) => ph.key).join(',');
        if (p.phases.length !== 8) problems.push(`plan with ${JSON.stringify(s)} has phases ${keys}`);
        for (const ph of p.phases) for (const it of ph.items) {
          if (!kinds.researchById.has(it.method.id)) problems.push(`plan recommends unknown ${it.method.id}`);
          if (it.alternatives.length < 2) problems.push(`${it.key} (${it.method.id}) has ${it.alternatives.length} alternatives for ${JSON.stringify(s)}`);
        }
        // A swap must stick and keep the original one click away.
        const first = p.phases[4].items[0];
        const swapped = buildPlan(kinds.research, kinds.researchById, { ...s, picks: { [first.key]: first.alternatives[0].id } });
        const now = swapped.phases[4].items[0];
        if (now.method.id !== first.alternatives[0].id || !now.alternatives.some((a) => a.id === first.method.id)) problems.push(`swap failed for ${first.key}`);
      }
    }
  }
}

console.log(`${ids.length} method ids and ${Object.keys(CALCULATORS).length} calculators referenced, ${plans} plans built, ${problems.length} problems`);
[...new Set(problems)].slice(0, 50).forEach((p) => console.log(' -', p));
process.exit(problems.length ? 1 : 0);
