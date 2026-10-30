// Writes the inputs for the causal reference script (server/scripts/causal-reference.py) from the tools' own
// examples and design tables, so Python checks exactly the data and designs the pages use.
// Run: node server/scripts/causal-dump.js  (writes causal-reference-input.json)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../../client/src/calc/tools/causal-did.js';
import * as F from '../../client/src/calc/tools/causal-factorial.js';
import * as BD from '../../client/src/calc/tools/causal-bandit.js';
import * as BL from '../../client/src/calc/tools/causal-brandlift.js';
import * as MK from '../../client/src/calc/tools/causal-market.js';
import { L18, L32, L36 } from '../../client/src/calc/tools/causal-oa.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const lower = 'abcdefghijklmnopqrstuvwxyz';
// Our letters skip I; pyDOE3 names factors a, b, c, … in order, so map factor index j to the j-th lowercase letter.
const toPy = (mask, k) => { let s = ''; for (let j = 0; j < k; j++) if (mask >> j & 1) s += lower[j]; return s; };

const panel = D.readPanel(D.examplePanel(), D.EXAMPLE_COLS).rows;
const designs = F.DESIGNS.map(([k, p, res, gens]) => {
  const g = F.parseGenerators(gens.join('\n'), k, p).gens;
  const d = F.fracDesign(k, g);
  const words = []; for (let j = 0; j < k - p; j++) words.push(lower[j]);
  for (const x of g) words.push(toPy(x.mask, k));
  return { k, p, res, gen: words.join(' '), runs: d.runs, resolution: d.resolution, classes: k <= 8 ? d.classes.map((c) => c.map((m) => toPy(m.mask, k)).sort()) : null };
});
const ux = F.parseTable(F.uxExampleText());

const out = {
  panel, start: D.EXAMPLE_START,
  designs,
  montgomery: F.MONTGOMERY_Y,
  ux: { names: ux.names, rows: [...Array(ux.n).keys()].map((i) => ux.cols.map((c) => c.values[i])) },
  oa: { L18, L32, L36 },
  bandit: { p: BD.EXAMPLE.arms.map(([, r]) => Number(r) / 100), T: Number(BD.EXAMPLE.T), batch: Number(BD.EXAMPLE.batch), eps: Number(BD.EXAMPLE.eps) },
  brand: BL.parseQuestions(BL.EXAMPLE).rows,
  market: MK.toModel(MK.EXAMPLE.chains),
};
writeFileSync(path.join(here, 'causal-reference-input.json'), JSON.stringify(out));
console.log('wrote causal-reference-input.json');
