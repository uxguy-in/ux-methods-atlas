// Checks the human factors tools (fault tree, ergonomics, steering law and MHP, SEEV, alarm floods) against an
// independent Python reference (server/scripts/humanfactors-reference.py → humanfactors-reference.json: brute-force
// enumeration for fault trees, re-typed NIOSH/RULA/REBA tables, scipy and numpy for the statistics, plain Python for
// the alarm log) and against published worked values: closed-form k-of-n and OR gates, the NIOSH Applications Manual
// example 2, and the Model Human Processor reaction-time examples of Card, Moran and Newell (1983).
// Also checks every "Reading your results" summary. Run with `npm run check:humanfactors`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../client/src/calc/tools/humanfactors-core.js';
import * as F from '../../client/src/calc/tools/humanfactors-fault.js';
import * as E from '../../client/src/calc/tools/humanfactors-ergo.js';
import * as St from '../../client/src/calc/tools/humanfactors-steering.js';
import * as SE from '../../client/src/calc/tools/humanfactors-seev.js';
import * as AL from '../../client/src/calc/tools/humanfactors-alarm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'humanfactors-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'humanfactors-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
const nearRel = (label, got, want, rel = 1e-9) => near(label, got, want, Math.abs(want) * rel + 1e-15);
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  const cut = (v) => { const t = JSON.stringify(v); return t && t.length > 240 ? `${t.slice(0, 240)}… (${t.length} chars)` : t; };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${cut(want)}, got ${cut(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
const LINKS = /^\/calculators\/(fitts|hick|klm|human-error|use-fmea|nasa-tlx|ergonomics|steering-law)$/;
function summary(label, s, key, level, rkey) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 7 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|—|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  for (const k of [].concat(rkey || [])) truthy(`${label}: report contains "${k}"`, s.report.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is a calculator page`, LINKS.test(m[1]));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}
// The examples the pages load are the data the Python reference used (humanfactors-dump.js writes them).
same('Fault tree example = reference input', F.parseFaultTree(F.EXAMPLE).events.map((e) => e.p), INP.trees.example.p);
same('NIOSH example = reference input', E.NIOSH_EXAMPLE, INP.niosh.example);
same('RULA and REBA examples = reference input', [E.RULA_EXAMPLE, E.REBA_EXAMPLE], [INP.rula, INP.reba]);
same('Anthropometry example = reference input', E.ANTHRO_EXAMPLE, INP.anthro);
same('Steering, SEEV and alarm examples = reference input', [St.EXAMPLE_DATA, St.EXAMPLE_DESIGNS, SE.EXAMPLE, AL.exampleLog()], [INP.steering, INP.designs, INP.seev, INP.alarmLog]);

// ════════ Fault trees ════════
const TREES = { example: F.EXAMPLE };
{ const src = readFileSync(path.join(here, 'humanfactors-dump.js'), 'utf8'); for (const k of ['TREE2', 'TREE3']) { const i = src.indexOf(`export const ${k} = \``) + `export const ${k} = \``.length; TREES[k.toLowerCase()] = src.slice(i, src.indexOf('`;', i)); } }
const cmpSets = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
const results = {};
for (const [name, text] of Object.entries(TREES)) {
  const t = F.parseFaultTree(text);
  same(`Tree ${name}: parses without errors`, t.errors, []);
  const r = F.analyseFaultTree(t);
  results[name] = { t, r };
  const ref = REF.trees[name];
  nearRel(`Tree ${name}: exact top-event probability, BDD vs brute-force enumeration of 2^${t.events.length} states`, r.Q, ref.Q, 1e-10);
  if (r.cuts.length <= 16) nearRel(`Tree ${name}: inclusion-exclusion over ${r.cuts.length} minimal cut sets = exact`, r.ie, ref.Q, 1e-9);
  else same(`Tree ${name}: ${r.cuts.length} cut sets is too many for inclusion-exclusion (2^m terms), so it is not shown`, r.ie, NaN);
  same(`Tree ${name}: minimal cut sets, MOCUS vs brute force over all subsets`, r.cuts.map((c) => c.set).sort(cmpSets), ref.cuts);
  nearRel(`Tree ${name}: rare-event approximation (sum of cut-set probabilities)`, r.rareEvent, ref.rare, 1e-12);
  nearRel(`Tree ${name}: min-cut upper bound`, r.mcub, ref.mcub, 1e-12);
  truthy(`Tree ${name}: exact ≤ min-cut upper bound ≤ rare-event sum`, r.Q <= r.mcub + 1e-15 && r.mcub <= r.rareEvent + 1e-15);
  r.importance.forEach((im, i) => {
    const w = ref.importance[i];
    nearRel(`Tree ${name}, "${im.name}": Birnbaum`, im.birnbaum, w.birnbaum, 1e-9);
    nearRel(`Tree ${name}, "${im.name}": criticality`, im.criticality, w.criticality, 1e-9);
    nearRel(`Tree ${name}, "${im.name}": Fussell-Vesely`, im.fv, w.fv, 1e-9);
    nearRel(`Tree ${name}, "${im.name}": RAW`, im.raw, w.raw, 1e-9);
    if (w.rrw === null) same(`Tree ${name}, "${im.name}": RRW infinite (event in every cut set)`, im.rrw, Infinity);
    else nearRel(`Tree ${name}, "${im.name}": RRW`, im.rrw, w.rrw, 1e-9);
  });
}
// Closed forms: 2-of-3 with p = 0.1 is 3p² − 2p³ = 0.028; OR of 0.1 and 0.2 is 0.28; AND is 0.02.
const cf = (txt) => F.analyseFaultTree(F.parseFaultTree(txt)).Q;
near('2-of-3 voting, p = 0.1: 3p² − 2p³ = 0.028', cf('Top [2/3]\n  A: 0.1\n  B: 0.1\n  C: 0.1'), 0.028, 1e-15);
near('OR of 0.1 and 0.2: 1 − 0.9 × 0.8 = 0.28', cf('Top [OR]\n  A: 0.1\n  B: 0.2'), 0.28, 1e-15);
near('AND of 0.1 and 0.2 = 0.02', cf('Top [AND]\n  A: 0.1\n  B: 0.2'), 0.02, 1e-15);
near('Repeated event: (A or B) and (A or C), p = 0.1, 0.2, 0.3: exact 0.1 + 0.9 × 0.06 = 0.154', cf('Top [AND]\n  G1 [OR]\n    A: 0.1\n    B: 0.2\n  G2 [OR]\n    A\n    C: 0.3'), 0.154, 1e-15);
near('3-of-5 with p = 0.2: Σ C(5,k) 0.2^k 0.8^(5−k), k ≥ 3 = 0.05792', cf('Top [3 of 5]\n  A: 0.2\n  B: 0.2\n  C: 0.2\n  D: 0.2\n  E: 0.2'), 0.05792, 1e-15);
same('MOCUS on the repeated-event tree: {A}, {B, C}', F.mocus(F.parseFaultTree('Top [AND]\n  G1 [OR]\n    A: 0.1\n    B: 0.2\n  G2 [OR]\n    A\n    C: 0.3')), [[0], [1, 2]]);
same('Parser errors: missing probability, event with children, bad k', [
  F.parseFaultTree('Top [OR]\n  A\n  B: 0.1').errors.length > 0,
  F.parseFaultTree('Top [OR]\n  A: 0.1\n    B: 0.2').errors.length > 0,
  F.parseFaultTree('Top [4/3]\n  A: 0.1\n  B: 0.1\n  C: 0.1').errors.length > 0,
  F.parseFaultTree('Top [OR]\n  A: 1.5\n  B: 0.1').errors.length > 0,
], [true, true, true, true]);
// Larger tree: 30 events in a 3-level structure (BDD must stay small, cut sets exact).
{
  let txt = 'Top [OR]\n';
  for (let g = 0; g < 6; g++) { txt += `  G${g} [AND]\n`; for (let e = 0; e < 5; e++) txt += `    E${g}${e}: ${(0.01 * (e + 1)).toFixed(2)}\n`; }
  const r = F.analyseFaultTree(F.parseFaultTree(txt));
  const pg = 0.01 * 0.02 * 0.03 * 0.04 * 0.05;
  nearRel('30-event OR of six 5-event ANDs: 1 − (1 − p)^6', r.Q, 1 - (1 - pg) ** 6, 1e-9);
  same('30-event tree: 6 cut sets of order 5', [r.cuts.length, r.orders], [6, { 5: 6 }]);
}
const ex = results.example;
summary('Fault tree example', F.faultSummary(ex.r, ex.t.root.label), ['Overdose reaches patient', 'minimal cut set'], 'medium', 'exact top-event probability');
summary('Fault tree with a single point of failure', F.faultSummary(results.tree2.r, results.tree2.t.root.label), 'System fails', results.tree2.r.cuts.some((c) => c.set.length === 1) ? 'low' : 'medium');
{ const t = F.parseFaultTree('Top [OR]\n  A: 0.01\n  G [AND]\n    B: 0.1\n    C: 0.1'); const s = summary('Fault tree: order-1 cut set → low', F.faultSummary(F.analyseFaultTree(t), 'Top'), 'Top', 'low'); truthy('Order-1 cut set is called a single point of failure', s.meaning.some((m) => m.includes('single point of failure'))); }
{ const t = F.parseFaultTree('Top [OR]\n  G1 [AND]\n    A: 0.6\n    B: 0.7\n  G2 [AND]\n    C: 0.5\n    D: 0.8'); const r = F.analyseFaultTree(t); const s = F.faultSummary(r, 'Top'); truthy('Fault tree: high probabilities → summary says the rare-event shortcut overstates', s.meaning.some((m) => m.includes('overstates'))); }

// ════════ NIOSH lifting equation ════════
for (const c of REF.niosh) {
  const r = E.niosh(c.input, !!c.input.round2);
  for (const [end, w] of [['origin', c.origin], ['destination', c.destination]]) {
    if (!w) continue;
    const g = r[end];
    same(`NIOSH ${c.input.name}, ${end}: multipliers HM, VM, DM, AM, FM, CM`, [g.HM, g.VM, g.DM, g.AM, g.FM, g.CM].map((v) => +v.toFixed(10)), w.mult.map((v) => +v.toFixed(10)));
    nearRel(`NIOSH ${c.input.name}, ${end}: RWL`, g.RWL, w.RWL, 1e-10);
    if (w.LI === null) same(`NIOSH ${c.input.name}, ${end}: LI infinite (RWL = 0)`, g.LI, Infinity);
    else nearRel(`NIOSH ${c.input.name}, ${end}: LI`, g.LI, w.LI, 1e-10);
  }
}
{
  const r = E.niosh(REF.niosh[1].input, true);
  near('NIOSH Applications Manual example 2: RWL at origin (published 28.0 lb)', +r.origin.RWL.toFixed(1), 28.0, 1e-9);
  near('NIOSH Applications Manual example 2: RWL at destination (published 18.1 lb)', +r.destination.RWL.toFixed(1), 18.1, 1e-9);
  near('NIOSH Applications Manual example 2: LI at destination (published 1.9)', +r.LI.toFixed(1), 1.9, 1e-9);
  same('NIOSH example 2: destination governs', r.governing, 'destination');
}
same('FM: 0.1 lifts/min counts as 0.2; 16/min is 0; ≤ 1 h, V ≥ 75 at 15/min = 0.28', [E.frequencyMultiplier(0.1, '1', false).fm, E.frequencyMultiplier(16, '1', true).fm, E.frequencyMultiplier(15, '1', true).fm], [1, 0, 0.28]);
same('CM: fair is 0.95 below 75 cm and 1.00 at or above; poor 0.90', [E.couplingMultiplier('fair', false), E.couplingMultiplier('fair', true), E.couplingMultiplier('poor', true)], [0.95, 1, 0.9]);
const nEx = E.niosh(E.NIOSH_EXAMPLE);
summary('NIOSH example', E.nioshSummary(nEx), ['recommended weight limit', 'lifting index'], 'medium', 'Waters et al. 1993');
summary('NIOSH interpolated frequency → low', E.nioshSummary(E.niosh(REF.niosh[2].input)), 'lifting index', 'low');
summary('NIOSH out of range → low', E.nioshSummary(E.niosh(REF.niosh[3].input)), 'infinite', 'low');

// ════════ RULA and REBA ════════
same('RULA tables A, B, C = tables re-typed in the Python reference', [E.RULA_A, E.RULA_B, E.RULA_C], [REF.rulaTables.A, REF.rulaTables.B, REF.rulaTables.C]);
same('REBA tables A, B, C = tables re-typed in the printed worksheet layout (transposed) in Python', [E.REBA_A, E.REBA_B, E.REBA_C], [REF.rebaTables.A, REF.rebaTables.B, REF.rebaTables.C]);
const b2n = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? v : v]));
let rulaOk = 0, rebaOk = 0;
for (const c of REF.rula) { const r = E.rula(b2n(c.input)); if (r.scoreC === c.out.scoreC && r.scoreD === c.out.scoreD && r.grand === c.out.grand) rulaOk++; else console.log('  RULA mismatch', JSON.stringify(c.input), r.grand, c.out.grand); }
for (const c of REF.reba) { const r = E.reba(b2n(c.input)); if (r.scoreA === c.out.scoreA && r.scoreB === c.out.scoreB && r.score === c.out.score) rebaOk++; else console.log('  REBA mismatch', JSON.stringify(c.input), r.score, c.out.score); }
same(`RULA: scores C, D and grand score agree with Python for all ${REF.rula.length} postures (example + 60 random)`, rulaOk, REF.rula.length);
same(`REBA: scores A, B and final score agree with Python for all ${REF.reba.length} postures (example + 60 random)`, rebaOk, REF.reba.length);
const ru = E.rula(E.RULA_EXAMPLE), rb = E.reba(E.REBA_EXAMPLE);
same('RULA example: score C, score D, grand score, action level', [ru.scoreC, ru.scoreD, ru.grand, ru.level], [REF.rula[0].out.scoreC, REF.rula[0].out.scoreD, REF.rula[0].out.grand, E.rula(E.RULA_EXAMPLE).level]);
same('REBA example: score A, score B, final', [rb.scoreA, rb.scoreB, rb.score], [REF.reba[0].out.scoreA, REF.reba[0].out.scoreB, REF.reba[0].out.score]);
same('RULA action levels: 1–2 → 1, 3–4 → 2, 5–6 → 3, 7 → 4', [1, 2, 3, 4, 5, 6, 7].map((g) => (g <= 2 ? 1 : g <= 4 ? 2 : g <= 6 ? 3 : 4)), [1, 1, 2, 2, 3, 3, 4]);
same('REBA risk bands: 1 negligible, 2–3 low, 4–7 medium, 8–10 high, 11+ very high', [1, 3, 4, 7, 8, 10, 11, 15].map((s) => E.REBA_LEVELS.find(([m]) => s <= m)[1]), ['negligible', 'low', 'medium', 'medium', 'high', 'high', 'very high', 'very high']);
summary('RULA example', E.postureSummary('rula', ru), 'RULA grand score', [2, 3, 4, 5, 6, 7].includes(ru.grand) ? 'low' : 'medium', 'McAtamney and Corlett 1993');
summary('REBA example', E.postureSummary('reba', rb), 'REBA score', [3, 4, 7, 8, 10, 11].includes(rb.score) ? 'low' : 'medium', 'Hignett and McAtamney 2000');
summary('REBA mid-band → medium', E.postureSummary('reba', { ...rb, score: 6, risk: 'medium', action: 'Necessary' }), 'REBA score 6', 'medium');

// ════════ Anthropometry ════════
{
  const a = E.ANTHRO_EXAMPLE;
  const rMin = E.accommodation({ groups: a.groups, type: 'min', x: a.x });
  rMin.per.forEach((g, i) => nearRel(`Anthropometry, ${g.name}: share with reach ≥ ${a.x} (scipy norm.sf)`, g.acc, REF.anthro.min.per[i], 1e-9));
  rMin.per.forEach((g, i) => nearRel(`Anthropometry, ${g.name}: percentile of ${a.x} (scipy norm.cdf)`, g.pctile[0], REF.anthro.min.pct[i], 1e-9));
  nearRel('Anthropometry: mixture share accommodated, min design', rMin.total, REF.anthro.min.total, 1e-9);
  nearRel('Anthropometry: mixture share, max design', E.accommodation({ groups: a.groups, type: 'max', x: a.x }).total, REF.anthro.max.total, 1e-9);
  nearRel('Anthropometry: mixture share, range design', E.accommodation({ groups: a.groups, type: 'range', lo: a.lo, hi: a.hi }).total, REF.anthro.range.total, 1e-9);
  near('Anthropometry: design value for 95%, min (scipy brentq on the mixture cdf)', E.designFor({ groups: a.groups, type: 'min', target: a.target }).x, REF.anthro.designMin, 1e-8);
  near('Anthropometry: design value for 95%, max', E.designFor({ groups: a.groups, type: 'max', target: a.target }).x, REF.anthro.designMax, 1e-8);
  const dr = E.designFor({ groups: a.groups, type: 'range', target: a.target });
  near('Anthropometry: 95% range, low end', dr.lo, REF.anthro.designRange[0], 1e-8);
  near('Anthropometry: 95% range, high end', dr.hi, REF.anthro.designRange[1], 1e-8);
  a.groups.forEach((g, i) => { near(`${g.name}: 5th percentile μ − 1.645σ (scipy)`, E.groupQuantile(g, 0.05), REF.anthro.p5[i], 1e-9); near(`${g.name}: 95th percentile (scipy)`, E.groupQuantile(g, 0.95), REF.anthro.p95[i], 1e-9); });
  near('Textbook: 95th percentile of N(175.5, 6.8) = 175.5 + 1.645 × 6.8 = 186.69', E.groupQuantile({ mean: 175.5, sd: 6.8 }, 0.95), 186.6852, 1e-3);
  summary('Anthropometry example', E.anthroSummary({ r: rMin, design: E.designFor({ groups: a.groups, type: 'min', target: a.target }), type: 'min', x: a.x, unit: a.unit, dimension: a.dimension, target: a.target, groups: a.groups }), 'accommodates', 'low', 'normally distributed');
  summary('Anthropometry with survey n ≥ 100 → medium', E.anthroSummary({ r: rMin, design: { x: 180 }, type: 'min', x: a.x, unit: a.unit, dimension: a.dimension, target: a.target, groups: a.groups.map((g) => ({ ...g, n: 500 })) }), 'accommodates', 'medium');
}

// ════════ Borg, Cooper-Harper, SWAT ════════
{
  const v = E.parseRatings(E.BORG_EXAMPLE.text), r = E.borg('rpe', v);
  near('Borg example: mean', r.mean, REF.borg.mean, 1e-12); near('Borg example: SD', r.sd, REF.borg.sd, 1e-12); near('Borg example: median', r.median, REF.borg.median, 1e-12);
  near('Borg example: 95% CI low (scipy t)', r.lo, REF.borg.lo, 1e-9); near('Borg example: 95% CI high (scipy t)', r.hi, REF.borg.hi, 1e-9);
  same('Borg example: ratings ≥ 15', r.high, REF.borg.high);
  same('Borg anchors: RPE 13 somewhat hard, 14 still somewhat hard, CR10 5 strong', [E.borgAnchor('rpe', 13), E.borgAnchor('rpe', 14), E.borgAnchor('cr10', 5)], ['Somewhat hard', 'Somewhat hard', 'Strong (heavy)']);
  summary('Borg example', E.borgSummary('rpe', r), 'Borg RPE', 'medium', 'Borg 1998');
  summary('Borg CR10, 3 ratings → low', E.borgSummary('cr10', E.borg('cr10', [3, 5, 4])), 'CR10', 'low');
}
same('Cooper-Harper decision tree: uncontrollable → 10; not adequate → 7–9; not satisfactory → 4–6; satisfactory → 1–3',
  [E.chOptions({ controllable: false }), E.chOptions({ controllable: true, adequate: false }), E.chOptions({ controllable: true, adequate: true, satisfactory: false }), E.chOptions({ controllable: true, adequate: true, satisfactory: true })],
  [[10], [7, 8, 9], [4, 5, 6], [1, 2, 3]]);
{
  const r = E.cooperHarper(E.parseRatings(E.CH_EXAMPLE));
  same('Cooper-Harper example: n, median, level counts', [r.n, r.median, r.levels], [7, 4, [2, 5, 0, 0]]);
  summary('Cooper-Harper example', E.chSummary(r), 'Median Cooper-Harper rating 4', 'medium', 'Cooper and Harper 1969');
  summary('Cooper-Harper, 6 raters all 2–3 → high', E.chSummary(E.cooperHarper([2, 3, 2, 3, 2, 2])), 'satisfactory', 'high');
}
for (const [k, order] of [['example', E.prototypeOrder(E.SWAT_EXAMPLE.proto)], ['custom', INP.swat.custom]]) {
  const sc = E.swatScale(order), ref = REF.swat[k];
  near(`SWAT ${k}: R² of the additive model (numpy lstsq)`, sc.r2, ref.r2, 1e-10);
  sc.importance.forEach((v, i) => near(`SWAT ${k}: importance of ${['time', 'effort', 'stress'][i]}`, v, ref.importance[i], 1e-10));
  const worst = Math.max(...Object.entries(ref.scores).map(([c, v]) => Math.abs(sc.score(c.split('').map(Number)) - v)));
  near(`SWAT ${k}: all 27 rescaled scores (max |difference|)`, worst, 0, 1e-9);
}
{
  const sc = E.swatScale(E.prototypeOrder('TES'));
  same('SWAT: a pure TES prototype sort gives importance 9:3:1 → 69%, 23%, 8%', sc.importance.map((v) => Math.round(v * 100)), [69, 23, 8]);
  same('SWAT: scale runs from 0 (1-1-1) to 100 (3-3-3)', [sc.score([1, 1, 1]), sc.score([3, 3, 3])], [0, 100]);
  summary('SWAT example', E.swatSummary(sc, E.parseSwatEvents(E.SWAT_EXAMPLE.events)), 'Alarm response', 'medium', 'Reid and Nygren 1988');
  same('SWAT parser rejects a 26-card order', E.parseSwatOrder(E.prototypeOrder('TES').slice(1).map((c) => c.join('')).join(' ')).errors.length > 0, true);
}

// ════════ Steering law and MHP ════════
{
  const { rows, errors } = St.parseSteeringData(St.EXAMPLE_DATA);
  same('Steering example: 24 rows, no errors', [rows.length, errors], [24, []]);
  const f = St.fitSteering(rows), w = REF.steering;
  for (const k of ['a', 'b', 'r2', 'seA', 'seB', 'bLo', 'bHi', 'aLo', 'aHi']) nearRel(`Steering fit ${k} (scipy linregress)`, f[k], w[k], 1e-9);
  near('Steering fit p for slope (scipy)', f.p, w.p, 1e-12);
  St.parseDesigns(St.EXAMPLE_DESIGNS).forEach((d, i) => nearRel(`Steering prediction, ${d.label}`, f.a + f.b * d.ID, w.designs[i], 1e-9));
  nearRel('Narrowing tunnel 40 → 10 px over 300 px: ID = ∫ds/W(s) (scipy quad)', St.steeringId({ shape: 'narrowing', A: 300, W: 40, W2: 10 }), REF.steeringId.narrowing, 1e-10);
  nearRel('Widening tunnel 12 → 36 px over 250 px (scipy quad)', St.steeringId({ shape: 'narrowing', A: 250, W: 12, W2: 36 }), REF.steeringId.widening, 1e-10);
  nearRel('Circular tunnel R = 100, W = 20: 2πR/W (scipy quad)', St.steeringId({ shape: 'circle', R: 100, W: 20 }), REF.steeringId.circle, 1e-12);
  near('Narrowing tunnel with equal widths reduces to A/W', St.steeringId({ shape: 'narrowing', A: 200, W: 20, W2: 20 }), 10, 1e-12);
  summary('Steering example', St.steeringSummary(f, rows, 'px'), 'Steering time', 'high', 'Accot and Zhai 1997');
  summary('Steering, 3 conditions → low', St.steeringSummary(St.fitSteering(rows.slice(0, 9)), rows.slice(0, 9)), 'Steering time', 'low');
}
{
  const t = (s) => St.mhpTotal(St.parseMhp(s).steps);
  same('MHP simple reaction P C M: 240 [105–470] ms (Card, Moran and Newell 1983)', [t('P C M').t, t('P C M').lo, t('P C M').hi], [240, 105, 470]);
  same('MHP physical match P 2C M: 310 [130–640] ms', [t('P 2C M').t, t('P 2C M').lo, t('P 2C M').hi], [310, 130, 640]);
  same('MHP name match P 3C M: 380 [155–810] ms', [t('P 3C M').t, t('P 3C M').lo, t('P 3C M').hi], [380, 155, 810]);
  same('MHP class match P 4C M: 450 [180–980] ms', [t('P 4C M').t, t('P 4C M').lo, t('P 4C M').hi], [450, 180, 980]);
  same('MHP Fitts move F3: 3 bits × I_M 100 [70–120] ms/bit', [t('F3').t, t('F3').lo, t('F3').hi], [300, 210, 360]);
  same('MHP parser flags unknown operators', St.parseMhp('P X M').errors.length, 1);
  const seq = St.parseMhp('E P C C M F2.5').steps;
  summary('MHP sequence', St.mhpSummary(seq, St.mhpTotal(seq)), 'Model Human Processor', 'medium', 'Card, Moran and Newell 1983');
  const long = St.parseMhp('E P 4C M E P 3C M').steps;
  summary('MHP long chain → low', St.mhpSummary(long, St.mhpTotal(long)), 'Fastman', 'low');
}

// ════════ SEEV ════════
for (const form of ['add', 'mult']) {
  const m = SE.seev(SE.parseAois(SE.EXAMPLE).rows, { form }), w = REF.seev[form];
  m.rows.forEach((r, i) => near(`SEEV ${form}: predicted % dwell, ${r.name} (numpy)`, r.pred, w.pred[i], 1e-10));
  near(`SEEV ${form}: Pearson r (scipy pearsonr)`, m.fit.r, w.r, 1e-12);
  near(`SEEV ${form}: p (scipy)`, m.fit.p, w.p, 1e-9);
  near(`SEEV ${form}: Fisher-z 95% CI low`, m.fit.lo, w.lo, 1e-9);
  near(`SEEV ${form}: Fisher-z 95% CI high`, m.fit.hi, w.hi, 1e-9);
  near(`SEEV ${form}: Spearman ρ (scipy spearmanr)`, m.fit.rho, w.rho, 1e-12);
  near(`SEEV ${form}: mean absolute gap`, m.fit.mad, w.mad, 1e-10);
}
{
  const m = SE.seev(SE.parseAois(SE.EXAMPLE).rows);
  near('SEEV: predicted shares sum to 100%', m.rows.reduce((a, r) => a + r.pred, 0), 100, 1e-9);
  same('SEEV: an area whose effort outweighs the rest gets 0%', SE.seev([{ name: 'A', S: 0, EF: 3, EX: 0, V: 1, obs: null }, { name: 'B', S: 1, EF: 0, EX: 1, V: 1, obs: null }]).rows.map((r) => r.pred), [0, 100]);
  summary('SEEV example', SE.seevSummary(m), ['Road ahead', 'correlate'], m.fit.n >= 6 && m.fit.r >= 0.8 && m.fit.lo > 0.5 ? 'high' : 'medium', 'Wickens et al. 2003');
  summary('SEEV without observed dwell → low', SE.seevSummary(SE.seev(SE.parseAois(SE.EXAMPLE).rows.map((r) => ({ ...r, obs: null })))), 'Road ahead', 'low');
}

// ════════ Alarm floods ════════
{
  const log = AL.parseAlarmLog(AL.exampleLog());
  same('Alarm example parses without errors', log.errors, []);
  const r = AL.analyseAlarms(log.events), w = REF.alarm;
  same('Alarms: total activations, 10-minute periods, tags', [r.total, r.nb, r.nTags], [w.total, w.nb, w.nTags]);
  nearRel('Alarms per hour', r.perHour, w.perHour, 1e-12); nearRel('Alarms per 10 minutes', r.per10, w.per10, 1e-12); nearRel('Alarms per day', r.perDay, w.perDay, 1e-12);
  same('Periods with more than 10 alarms; periods in flood; maximum in a fixed 10-minute period; sliding-window peak', [r.over, r.floodBins, r.max10, r.peakRolling], [w.over, w.floodBins, w.max10, w.peakRolling]);
  same('Flood episodes (from, to, alarms), EEMUA 191 start > 10 and end < 5', r.floods.map((f) => [f.from, f.to, f.count]), w.floods);
  same('Top 10 tags and their count', [r.top10.map((g) => g.tag), r.top10Count], [w.topTags, w.top10Count]);
  same('Chattering tags (3 or more activations within 60 s)', r.chatter.map((g) => g.tag).sort(), w.chatter);
  same('Stale tags (active more than 24 h)', r.stale.map((g) => g.tag).sort(), w.stale);
  same('Priority counts', [r.prio.high, r.prio.medium, r.prio.low], [w.prio.high, w.prio.medium, w.prio.low]);
  nearRel('Share of hours with more than 30 alarms', r.over30h, w.over30h, 1e-12);
  truthy('Example log shows two floods, LSH-207 chattering and PDI-330HI stale', r.floods.length === 2 && r.chatter.some((g) => g.tag === 'LSH-207') && r.stale.some((g) => g.tag === 'PDI-330HI'));
  summary('Alarm example', AL.alarmSummary(r), ['alarms in', 'per 10 minutes'], 'medium', 'ISA-18.2');
  // Hand-made log: 12 alarms in one 10-minute period then quiet → one flood of one period; flood ends at < 5.
  const t0 = AL.parseTime('2026-01-01 00:00:00');
  const hand = [...Array.from({ length: 12 }, (_, i) => ({ t: t0 + i * 30, tag: `T${i % 4}`, kind: 'alm', priority: 'low' })), ...Array.from({ length: 6 }, (_, i) => ({ t: t0 + 600 + i * 60, tag: 'U', kind: 'alm', priority: 'low' })), { t: t0 + 1300, tag: 'V', kind: 'alm', priority: 'low' }];
  const h = AL.analyseAlarms(hand);
  same('Hand log: 12, 6, 1 alarms per period → one flood of 2 periods (6 is not < 5, so it continues), 18 alarms', [h.bins, h.floods.map((f) => [f.from, f.to, f.count])], [[12, 6, 1], [[0, 1, 18]]]);
  same('Hand log with the simple definition (end when ≤ 10): one flood of 1 period', AL.analyseAlarms(hand, { floodEnd: 11 }).floods.map((f) => [f.from, f.to, f.count]), [[0, 0, 12]]);
  same('Hand log: T0..T3 each 3 activations within 60 s? (T0 at 0, 120, 240 s → no)', h.chatter.length, 0);
  same('Time parser: ISO with T and fractional seconds; plain seconds', [AL.parseTime('2026-01-01T00:00:01.5') - t0, AL.parseTime('42')], [1.5, 42]);
  summary('Alarm hand log (short) → low', AL.alarmSummary(h), 'alarms in', 'low');
  const p = AL.parseAlarmLog('State;Tag;Timestamp\nALM;A1;2026-01-01 00:00:00\nACK;A1;2026-01-01 00:00:05\nRTN;A1;2026-01-01 00:01:00');
  same('Alarm parser: header in any order, ACK ignored', [p.events.map((e) => e.kind), p.ignored], [['alm', 'rtn'], 1]);
}
same('Core: fmtP formats small probabilities', [K.fmtP(0.000123), K.fmtP(0.0456), K.fmtP(0)], ['1.23e-4', '0.0456', '0']);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
