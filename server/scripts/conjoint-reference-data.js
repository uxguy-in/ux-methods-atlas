// Writes the inputs for server/scripts/conjoint-reference.py: the built-in example designs and data of the Conjoint
// studio, as plain level indices, so the Python reference codes and fits them with its own independent code.
// Run: node server/scripts/conjoint-reference-data.js && python3 server/scripts/conjoint-reference.py
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../client/src/calc/tools/conjoint-core.js';
import * as M from '../../client/src/calc/tools/conjoint-models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cbc = M.exampleCbc(); const rate = M.exampleTrad('rate'); const rank = M.exampleTrad('rank');
const cbcDs = M.datasetFromResults(cbc.study, cbc.results);
const tradDs = (ex) => M.datasetFromResults(ex.study, ex.results);
const L = (s) => s.a.map(([, l]) => l.length);
const priceValues = (s) => s.a[s.p][1].map(C.numberIn);

// A small D-optimal design with a prohibition, and a random CBC design, for the efficiency checks.
const dopt = C.dOptimal([3, 3, 2, 2], 10, { prohib: [[0, 0, 1, 2]], seed: 4 });
const rndCbc = C.cbcDesign([3, 3, 2, 2], { T: 8, J: 3, V: 2, method: 'random', seed: 9 });
// A simulated HB dataset from the HB model itself (normal heterogeneity): 300 respondents, 14 tasks of 3, K = 6.
const hbSim = (() => {
  const r = C.rng(31); const attrs = [{ name: 'A', levels: ['a1', 'a2', 'a3'] }, { name: 'B', levels: ['b1', 'b2', 'b3'] }, { name: 'C', levels: ['c1', 'c2'] }, { name: 'Price', levels: ['1', '2', '3', '4'] }];
  const coder = C.makeCoder(attrs, { price: 3 }); const design = C.cbcDesign(attrs.map((a) => a.levels.length), { T: 14, J: 3, V: 10, method: 'enumeration', seed: 5 });
  const mu = [0.8, -0.3, -0.5, 0.6, 0.4, -0.9], sd = [0.8, 0.6, 0.7, 0.6, 0.5, 0.5];
  const resp = []; const truth = [];
  for (let i = 0; i < 300; i++) {
    const b = mu.map((m, k) => m + sd[k] * r.normal()); const ver = i % design.versions.length;
    truth.push(b);
    resp.push({ id: `S${i}`, tasks: design.versions[ver].map((alts) => { const U = alts.map((lv) => C.dot(coder.encode(lv), b) + r.gumbel()); return { alts, y: U.indexOf(Math.max(...U)) }; }) });
  }
  return { attrs: attrs.map((a) => a.levels.length), price: 3, priceValues: [1, 2, 3, 4], mu, sd, truth, resp: resp.map((p) => p.tasks.map((t) => ({ alts: t.alts, y: t.y }))) };
})();
// A fixed AR(1) series (φ = 0.6) for the ESS, split-R̂ and Geweke checks.
const ar = (() => { const r = C.rng(12); const x = [0]; for (let i = 1; i < 2000; i++) x.push(0.6 * x[i - 1] + r.normal()); return x; })();

const out = {
  cbc: { L: L(cbc.study), price: cbc.study.p, priceValues: priceValues(cbc.study), none: true, resp: cbcDs.resp.map((p) => p.tasks.map((t) => ({ alts: t.alts, y: t.y }))), versions: C.studyDesign(cbc.study).versions, truth: cbc.truth.map((t) => t.beta) },
  rate: { L: L(rate.study), price: rate.study.p, priceValues: priceValues(rate.study), cards: C.studyDesign(rate.study).cards, resp: tradDs(rate).resp.map((p) => p.cards.map((c) => ({ lv: c.lv, y: c.y, hold: c.hold ? 1 : 0 }))) },
  rank: { L: L(rank.study), price: rank.study.p, priceValues: priceValues(rank.study), resp: tradDs(rank).resp.map((p) => p.cards.map((c) => ({ lv: c.lv, y: c.y, hold: c.hold ? 1 : 0 }))) },
  dopt: { L: [3, 3, 2, 2], rows: dopt },
  rndCbc: { L: [3, 3, 2, 2], tasks: rndCbc.versions.flat() },
  hbSim: { L: hbSim.attrs, price: hbSim.price, priceValues: hbSim.priceValues, mu: hbSim.mu, sd: hbSim.sd, resp: hbSim.resp },
  ar,
};
writeFileSync(path.join(here, 'conjoint-reference-input.json'), JSON.stringify(out));
console.log('wrote conjoint-reference-input.json');
