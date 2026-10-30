// Checks the cogia tools (IA graph analysis, IAT D-score, mouse-tracking curvature, correspondence analysis, tolerance
// intervals) against networkx, pandas, numpy/scipy, prince, the toleranceinterval package and statsmodels
// (server/scripts/cogia-reference.py → cogia-reference.json, fed by cogia-dump.js from the pages' own examples), and
// against published values: Wilks' (1941) minimum sample sizes, the rule of three, the NIST/Howe worked example, and
// the bimodality coefficient of a two-point sample. Also unit-tests every "Reading your results" summary.
// Run with `npm run check:cogia`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../client/src/calc/tools/cogia-core.js';
import * as GR from '../../client/src/calc/tools/cogia-graph.js';
import * as IAT from '../../client/src/calc/tools/cogia-iat.js';
import * as MT from '../../client/src/calc/tools/cogia-mouse.js';
import * as CA from '../../client/src/calc/tools/cogia-ca.js';
import * as TI from '../../client/src/calc/tools/cogia-tolerance.js';
import { CATALOG } from '../../client/src/calc/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'cogia-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'cogia-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
const quiet = !process.env.VERBOSE;
function record(ok, msg) {
  if (ok) passes++; else fails++;
  if (!ok || !quiet) console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
}
function near(label, got, want, tol = 1e-9) {
  const ok = want === null ? !Number.isFinite(got) : Number.isFinite(got) && Math.abs(got - want) <= tol;
  record(ok, `${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
const nearRel = (label, got, want, rel = 1e-7) => near(label, got, want, want === null ? 0 : Math.abs(want) * rel + 1e-12);
function same(label, got, want) { record(JSON.stringify(got) === JSON.stringify(want), `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
const truthy = (label, v) => same(label, !!v, true);
// A few headline comparisons are always printed, so the run shows expected vs got for the report.
const show = (label, got, want) => console.log(`     ${label}: expected ${want}, got ${got}`);

const CALC_IDS = new Set(CATALOG.map((c) => c.id));
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, { key, level } = {}) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or n/a`, /NaN|undefined|Infinity|\bnull\b|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is an existing calculator`, /^\/calculators\//.test(m[1]) && CALC_IDS.has(m[1].split('/')[2]));
  if (process.env.SHOW) console.log(`  [${s.confidence}] ${s.headline}\n  ${s.report}`);
  return s;
}

// ── The reference input is the pages' current examples ──
{
  const g = GR.parseGraph(GR.EXAMPLE);
  same('IA example = reference input', { names: g.names, edges: g.edges.map((e) => [e.from, e.to]) }, INP.graph);
  same('IAT example = reference input (trial count)', IAT.parseTrials(IAT.exampleCsv()).trials.length, INP.iat.length);
  same('IAT example = reference input (first trials)', IAT.parseTrials(IAT.exampleCsv()).trials.slice(0, 50).map((x) => [x.p, x.block, x.lat, x.err, x.order]), INP.iat.slice(0, 50));
  same('Mouse example = reference input (trial count)', MT.parseSamples(MT.exampleCsv()).trials.length, INP.mouse.length);
  same('Mouse example = reference input (trial 7 x)', MT.parseSamples(MT.exampleCsv()).trials[7].x, INP.mouse[7].x);
  same('CA example = reference input', CA.parseTable(CA.EXAMPLE).N, INP.ca.N);
  same('Tolerance example = reference input', TI.parseValues(TI.EXAMPLE).values, INP.tolerance);
}

// ── 1. IA graph vs networkx ──
function checkGraph(tag, inp, ref) {
  const g = { names: inp.names, edges: inp.edges.map(([from, to]) => ({ from, to })) };
  const r = GR.analyseGraph(g, 0);
  same(`${tag}: links`, r.nEdges, ref.nEdges);
  same(`${tag}: click depth of every page`, r.pages.map((p) => (Number.isFinite(p.depth) ? p.depth : null)), ref.depth);
  same(`${tag}: pages per level`, r.levels, ref.levels);
  near(`${tag}: mean click depth`, r.meanDepth, ref.meanDepth, 1e-12);
  same(`${tag}: unreachable`, r.unreachable, ref.unreachable);
  same(`${tag}: orphans`, r.orphans, ref.orphans);
  same(`${tag}: dead ends`, r.deadEnds, ref.deadEnds);
  r.pages.forEach((p, i) => {
    near(`${tag}: betweenness ${p.name}`, p.betweenness, ref.betweenness[i], 1e-12);
    near(`${tag}: closeness ${p.name}`, p.closeness, ref.closeness[i], 1e-12);
    near(`${tag}: PageRank ${p.name}`, p.pagerank, ref.pagerank[i], 1e-10);
    near(`${tag}: mean depth ${p.name}`, p.md, ref.md[i], 1e-12);
    near(`${tag}: RRA ${p.name}`, p.rra, ref.rra[i], 1e-12);
    near(`${tag}: integration ${p.name}`, p.integration, ref.integration[i], 1e-10);
    // Every shortest path shown is a real path of the stated length.
    if (p.path.length) truthy(`${tag}: path to ${p.name} is valid`, p.path.length === p.depth + 1 && p.path[0] === 0 && p.path.every((v, k) => k === 0 || r.out[p.path[k - 1]].includes(v)));
  });
  const hub = [...r.pages].sort((a, b) => b.betweenness - a.betweenness)[0];
  show(`${tag} mean click depth`, r.meanDepth.toFixed(6), ref.meanDepth.toFixed(6));
  show(`${tag} highest betweenness (${hub.name})`, hub.betweenness.toFixed(6), ref.betweenness[hub.i].toFixed(6));
  show(`${tag} PageRank of ${r.pages[0].name}`, r.pages[0].pagerank.toFixed(8), ref.pagerank[0].toFixed(8));
  show(`${tag} integration of ${r.pages[0].name}`, r.pages[0].integration.toFixed(6), ref.integration[0] === null ? 'infinite (RA = 0)' : ref.integration[0].toFixed(6));
  return r;
}
const rg = checkGraph('IA', INP.graph, REF.graph);
const rgNav = checkGraph('IA + breadcrumbs + home links', INP.graphNav, REF.graphNav);
for (const [k, v] of Object.entries(REF.diamond)) near(`diamond value D_${k}`, GR.diamond(Number(k)), v, 1e-14);
{
  // Hand checks: a star of 5 (home + 4) and a chain of 4.
  const star = GR.analyseGraph(GR.parseGraph('Home\n  A\n  B\n  C\n  D'), 0);
  near('star: home betweenness (directed, normalised)', star.pages[0].betweenness, 0, 1e-15);
  near('star: leaf PageRank', star.pages[1].pagerank, star.pages[4].pagerank, 1e-15);
  const und = GR.analyseGraph(GR.parseGraph('Home\n  A\n  B\n  C\n  D', { upLinks: true }), 0);
  near('star with back-links: home betweenness = 1', und.pages[0].betweenness, 1, 1e-15);
  near('star: home RA = 0 (fully integrated)', GR.spaceSyntax(5, GR.parseGraph('Home\n  A\n  B\n  C\n  D').edges)[0].md, 1, 1e-15);
  const parsed = GR.parseGraph('Home -> A\nA → B\nB => C\nC\tHome\n# comment\nD -> ');
  same('link syntaxes parsed', parsed.edges.map((e) => `${parsed.names[e.from]}>${parsed.names[e.to]}`), ['Home>A', 'A>B', 'B>C', 'C>Home']);
  same('empty link end reported', parsed.problems.length, 1);
  same('too few pages', GR.analyseGraph(GR.parseGraph('Home'), 0).error !== undefined, true);
  truthy('tree layout positions every page', GR.treeLayout(rg).pos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  truthy('force layout stays on canvas', GR.forceLayout(rg).pos.every((p) => p.x >= 20 && p.x <= 740 && p.y >= 20 && p.y <= 540));
  same('pages CSV rows', GR.pagesCsv(rg).split('\n').length, rg.n + 1);
}
summary('IA summary (example: 2 unreachable of 30)', GR.graphSummary(rg), { key: '30 pages', level: 'medium' });
summary('IA summary (with breadcrumbs and home links)', GR.graphSummary(rgNav), { level: 'medium' });
summary('IA summary (all reachable, 16 pages)', GR.graphSummary(GR.analyseGraph(GR.parseGraph(GR.EXAMPLE.split('# Cross')[0].split('\n').slice(0, 16).join('\n')), 0)), { level: 'high' });
summary('IA summary (broken map)', GR.graphSummary(GR.analyseGraph(GR.parseGraph('Home -> A\nB -> C\nD -> E'), 0)), { level: 'low' });

// ── 2. IAT D-score vs pandas ──
const iatTrials = IAT.parseTrials(IAT.exampleCsv()).trials;
let iatMain;
for (const [key, ref] of Object.entries(REF.iat)) {
  const variant = key.replace('_400', ''), drop400 = key.endsWith('_400');
  const r = IAT.analyseIat(iatTrials, { variant, drop400 });
  if (key === 'builtin') iatMain = r;
  same(`IAT ${key}: excluded`, r.excluded, ref.excluded);
  same(`IAT ${key}: participants scored`, r.nOk, ref.nOk);
  for (const p of r.people) {
    const q = ref.people[p.id];
    if (q.excluded) continue;
    near(`IAT ${key}: D ${p.id}`, p.D, q.D, 1e-12);
    near(`IAT ${key}: D practice ${p.id}`, p.d36, q.d36, 1e-12);
    near(`IAT ${key}: D test ${p.id}`, p.d47, q.d47, 1e-12);
    near(`IAT ${key}: D odd ${p.id}`, p.odd, q.odd, 1e-12);
    near(`IAT ${key}: D even ${p.id}`, p.even, q.even, 1e-12);
  }
  for (const k of ['mean', 'sd', 'lo', 'hi', 't', 'rHalf', 'sbHalf', 'rParts']) near(`IAT ${key}: ${k}`, r[k], ref[k], 1e-9);
  nearRel(`IAT ${key}: p`, r.p, ref.p, 1e-6);
  if (key === 'builtin' || key === 'p600_400') { show(`IAT ${key} mean D`, r.mean.toFixed(6), ref.mean.toFixed(6)); show(`IAT ${key} split-half (S-B)`, r.sbHalf.toFixed(6), ref.sbHalf.toFixed(6)); }
}
{
  // Hand check: a participant whose second pairing is exactly 100 ms slower on every trial.
  const tr = [];
  for (const b of IAT.BLOCKS) for (let i = 0; i < 20; i++) tr.push({ p: 'X', block: b, lat: 600 + 10 * i + (b >= 6 ? 100 : 0), err: 0, order: i });
  const d = IAT.dScore(tr);
  const sdPooled = K.sd([...tr.filter((x) => x.block === 3), ...tr.filter((x) => x.block === 6)].map((x) => x.lat));
  near('IAT hand check: D = 100 / inclusive SD', d.D, 100 / sdPooled, 1e-12);
  same('IAT parse: missing columns reported', !!IAT.parseTrials('a,b\n1,2').error, true);
  same('IAT parse: correct column accepted', IAT.parseTrials('subject,block,rt,correct\nA,3,700,1\nA,4,650,0').trials.map((x) => x.err), [0, 1]);
  same('IAT bands', [0.1, 0.2, -0.5, 0.9].map(IAT.bandOf), ['little or none', 'slight', 'moderate', 'strong']);
}
summary('IAT summary (example)', IAT.iatSummary(iatMain, { first: 'Our app + Trustworthy', second: 'Competitor + Trustworthy' }), { key: 'Mean D', level: 'high' });
{
  const fake = { ...iatMain, nOk: 18, sbHalf: 0.6, p: 0.02 };
  same('IAT confidence medium rule', IAT.iatSummary(fake).confidence, 'medium');
  same('IAT confidence low rule', IAT.iatSummary({ ...iatMain, nOk: 12 }).confidence, 'low');
  summary('IAT summary (negative mean)', IAT.iatSummary({ ...iatMain, mean: -0.3, lo: -0.4, hi: -0.2, excluded: [] }));
}

// ── 3. Mouse-tracking vs numpy/scipy ──
const mParsed = MT.parseSamples(MT.exampleCsv());
const mr = MT.analyseMouse(mParsed);
mr.trials.forEach((t, i) => {
  const q = REF.mouse.trials[i];
  near(`mouse trial ${i + 1}: MAD`, t.mad, q.mad, 1e-9);
  near(`mouse trial ${i + 1}: AUC`, t.auc, q.auc, 1e-7);
  same(`mouse trial ${i + 1}: x-flips`, t.flips, q.flips);
  near(`mouse trial ${i + 1}: RT`, t.rt, q.rt, 1e-9);
  near(`mouse trial ${i + 1}: normalised x at step 50`, t.tn.x[50], q.x50, 1e-9);
  near(`mouse trial ${i + 1}: normalised y at step 50`, t.tn.y[50], q.y50, 1e-9);
  near(`mouse trial ${i + 1}: normalised x at step 25`, t.tn.x[25], q.x25, 1e-9);
});
same('mouse conditions', mr.conds, REF.mouse.conds);
for (const pc of mr.per) {
  const q = REF.mouse.per[pc.condition];
  same(`mouse ${pc.condition}: trials`, pc.n, q.n);
  near(`mouse ${pc.condition}: mean AUC`, pc.auc.mean, q.auc, 1e-7);
  near(`mouse ${pc.condition}: mean MAD`, pc.mad.mean, q.mad, 1e-9);
  near(`mouse ${pc.condition}: mean flips`, pc.flips.mean, q.flips, 1e-12);
  near(`mouse ${pc.condition}: BC (z within participant)`, pc.bc.bc, q.bc, 1e-10);
  near(`mouse ${pc.condition}: BC (raw AUC)`, pc.bcRaw.bc, q.bcRaw, 1e-10);
  near(`mouse ${pc.condition}: mean trajectory x at step 50`, pc.avg[50][0], q.avgX50, 1e-9);
  near(`mouse ${pc.condition}: mean trajectory y at step 75`, pc.avg[75][1], q.avgY75, 1e-9);
  show(`mouse ${pc.condition} mean AUC`, pc.auc.mean.toFixed(4), q.auc.toFixed(4));
  show(`mouse ${pc.condition} BC`, pc.bc.bc.toFixed(6), q.bc.toFixed(6));
}
near('mouse BC all trials', mr.all.bc, REF.mouse.all, 1e-10);
for (const key of ['auc', 'mad', 'rt']) {
  const a = mr.compare[0][key], q = REF.mouse[`cmp_${key}`];
  near(`mouse paired ${key}: difference`, a.diff, q.diff, 1e-7);
  near(`mouse paired ${key}: t`, a.t, q.t, 1e-9);
  same(`mouse paired ${key}: df`, a.df, q.df);
  nearRel(`mouse paired ${key}: p`, a.p, q.p, 1e-6);
  near(`mouse paired ${key}: CI low`, a.lo, q.lo, 1e-6 * Math.abs(q.lo) + 1e-9);
  near(`mouse paired ${key}: CI high`, a.hi, q.hi, 1e-6 * Math.abs(q.hi) + 1e-9);
}
show('mouse paired AUC t', mr.compare[0].auc.t.toFixed(6), REF.mouse.cmp_auc.t.toFixed(6));
near('BC of a balanced two-point sample (scipy)', MT.bimodality([...Array(50).fill(0), ...Array(50).fill(1)]).bc, REF.bcTwoPoint, 1e-12);
truthy('BC of a balanced two-point sample is above 0.555 (Pfister et al. 2013)', MT.bimodality([...Array(50).fill(0), ...Array(50).fill(1)]).bc > 0.555);
near('BC of a uniform sample (scipy; 5/9 in the limit)', MT.bimodality(Array.from({ length: 1001 }, (_, i) => i / 1000)).bc, REF.bcUniform, 1e-12);
{
  // Hand checks: a straight line has MAD 0, AUC 0, no flips; a triangle detour has AUC = base × height / 2.
  const straight = MT.measures(MT.remap({ t: [0, 1, 2, 3], x: [0, 1, 2, 3], y: [0, -1, -2, -3] }));
  near('straight path: MAD', straight.mad, 0, 1e-12); near('straight path: AUC', straight.auc, 0, 1e-12); same('straight path: flips', straight.flips, 0);
  const tri = MT.measures(MT.remap({ t: [0, 1, 2], x: [0, -50, 0], y: [0, -50, -100] }));
  near('triangle detour: AUC = 100 × 50 / 2', tri.auc, 2500, 1e-9); near('triangle detour: MAD = 50', tri.mad, 50, 1e-9); same('triangle detour: 1 x-flip', tri.flips, 1);
  same('mouse parse: missing columns reported', !!MT.parseSamples('a,b\n1,2\n3,4').error, true);
  const tn = MT.timeNormalise({ t: [0, 10, 30], x: [0, 10, 30], y: [0, 0, 0] }, 4);
  same('time normalisation (linear)', tn.x.map((v) => +v.toFixed(9)), [0, 10, 20, 30]);
}
summary('mouse summary (example)', MT.mouseSummary(mr), { key: 'Ambiguous label', level: 'medium' });
{
  const one = MT.analyseMouse({ ...mParsed, trials: mParsed.trials.filter((t) => t.condition === 'Clear label') });
  summary('mouse summary (one condition)', MT.mouseSummary(one), { level: 'medium' });
  const noP = MT.analyseMouse({ ...mParsed, hasParticipant: false });
  summary('mouse summary (no participant ids)', MT.mouseSummary(noP));
  same('mouse without participants: Welch comparison', noP.compare[0].auc.kind, 'welch');
}

// ── 4. Correspondence analysis vs numpy SVD and prince ──
const tab = CA.parseTable(CA.EXAMPLE), car = CA.ca(tab.N);
near('CA total inertia', car.total, REF.ca.total, 1e-13);
nearRel('CA chi-square (scipy)', car.chi2, REF.ca.chi2, 1e-12);
same('CA df', car.df, REF.ca.df);
near('CA p', car.p, REF.ca.p, 1e-12);
REF.ca.lam.forEach((l, k) => { near(`CA principal inertia ${k + 1} (numpy SVD)`, car.lam[k], l, 1e-12); near(`CA principal inertia ${k + 1} (prince)`, car.lam[k], REF.ca.princeEig[k], 1e-12); });
show('CA principal inertias', car.lam.map((v) => v.toFixed(6)).join(', '), REF.ca.lam.map((v) => v.toFixed(6)).join(', '));
for (let k = 0; k < car.K; k++) {
  tab.rows.forEach((l, i) => {
    near(`CA row ${l} F${k + 1} (numpy)`, Math.abs(car.rowPr[i][k]), REF.ca.rowPr[i][k], 1e-10);
    near(`CA row ${l} F${k + 1} (prince)`, Math.abs(car.rowPr[i][k]), REF.ca.princeRow[i][k], 1e-8);
    near(`CA row ${l} standard ${k + 1}`, Math.abs(car.rowStd[i][k]), REF.ca.rowStd[i][k], 1e-9);
    near(`CA row ${l} ctr ${k + 1} (prince)`, car.rowCtr[i][k], REF.ca.rowCtr[i][k], 1e-9);
    near(`CA row ${l} cos² ${k + 1} (prince)`, car.rowCos2[i][k], REF.ca.rowCos2[i][k], 1e-9);
  });
  tab.cols.forEach((l, j) => {
    near(`CA column ${l} G${k + 1} (numpy)`, Math.abs(car.colPr[j][k]), REF.ca.colPr[j][k], 1e-10);
    near(`CA column ${l} G${k + 1} (prince)`, Math.abs(car.colPr[j][k]), REF.ca.princeCol[j][k], 1e-8);
    near(`CA column ${l} standard ${k + 1}`, Math.abs(car.colStd[j][k]), REF.ca.colStd[j][k], 1e-9);
    near(`CA column ${l} ctr ${k + 1} (prince)`, car.colCtr[j][k], REF.ca.colCtr[j][k], 1e-9);
    near(`CA column ${l} cos² ${k + 1} (prince)`, car.colCos2[j][k], REF.ca.colCos2[j][k], 1e-9);
  });
}
show(`CA row ${tab.rows[0]} F1 |coord|`, Math.abs(car.rowPr[0][0]).toFixed(8), REF.ca.rowPr[0][0].toFixed(8));
show(`CA row ${tab.rows[0]} contribution to dim 1`, car.rowCtr[0][0].toFixed(8), REF.ca.rowCtr[0][0].toFixed(8));
{
  near('CA: row contributions sum to 1', car.rowCtr.reduce((a, r) => a + r[0], 0), 1, 1e-12);
  near('CA: row inertias sum to total', car.rowInertia.reduce((a, b) => a + b, 0), car.total, 1e-12);
  // Greenacre's identity: principal row coordinates are the weighted average of standard column coordinates.
  const i = 2, k = 0, rowSum = tab.N[i].reduce((a, b) => a + b, 0);
  near('CA transition formula (row = profile × column standard)', car.rowPr[i][k], tab.N[i].reduce((a, v, j) => a + (v / rowSum) * car.colStd[j][k], 0), 1e-12);
  same('CA: empty row rejected', !!CA.ca([[1, 2], [0, 0], [3, 4]]).error, true);
  same('CA: bad row reported', !!CA.parseTable('a\tb\tc\nx\t1\t2\ny\t1\tfoo').error, true);
  same('CA CSV rows', CA.caCsv(tab, car).split('\n').length, tab.rows.length + tab.cols.length + 1);
}
summary('CA summary (example)', CA.caSummary(tab, car), { key: 'first two dimensions', level: 'high' });
{
  const weak = CA.parseTable('x\tA\tB\tC\nR1\t10\t11\t9\nR2\t9\t10\t12\nR3\t11\t9\t10');
  summary('CA summary (no association)', CA.caSummary(weak, CA.ca(weak.N)), { level: 'low' });
}

// ── 5. Tolerance intervals vs toleranceinterval, scipy and statsmodels ──
for (const c of REF.kCases) {
  near(`k Howe n=${c.n} p=${c.p} γ=${c.g}`, TI.kHowe(c.n, c.p, c.g), c.howe, 1e-9);
  near(`k Guenther n=${c.n} p=${c.p} γ=${c.g}`, TI.kGuenther(c.n, c.p, c.g), c.guenther, 1e-9);
  near(`k exact n=${c.n} p=${c.p} γ=${c.g}`, TI.kExact(c.n, c.p, c.g), c.exact, 2e-6);
  near(`k one-sided n=${c.n} p=${c.p} γ=${c.g} (scipy nct)`, TI.kOneSided(c.n, c.p, c.g), c.one, 1e-7);
}
for (const c of REF.kCases.slice(0, 3)) show(`k (n=${c.n}, p=${c.p}, γ=${c.g}) Howe / Guenther / exact / one-sided`, [TI.kHowe(c.n, c.p, c.g), TI.kGuenther(c.n, c.p, c.g), TI.kExact(c.n, c.p, c.g), TI.kOneSided(c.n, c.p, c.g)].map((v) => v.toFixed(6)).join(' / '), [c.howe, c.guenther, c.exact, c.one].map((v) => v.toFixed(6)).join(' / '));
// NIST/SEMATECH e-Handbook 7.2.6.3 worked example: n = 43, p = 0.90, γ = 0.99 gives the two-sided (Howe) k2 = 2.2173.
near('NIST/Howe published factor n=43 p=0.90 γ=0.99', TI.kHowe(43, 0.9, 0.99), 2.2173, 1e-4);
// Odeh and Owen (1980) Table: exact two-sided k for n = 10, p = 0.90, γ = 0.95 is 2.856; one-sided k = 2.355.
near('Odeh-Owen exact two-sided n=10 p=0.90 γ=0.95', TI.kExact(10, 0.9, 0.95), 2.856, 1e-3);
near('Odeh-Owen one-sided n=10 p=0.90 γ=0.95', TI.kOneSided(10, 0.9, 0.95), 2.355, 1e-3);
const vals = TI.parseValues(TI.EXAMPLE).values;
{
  const up = TI.analyse(vals, { p: 0.9, g: 0.95, side: 'upper', log: true });
  near('tolerance: upper 90/95 on log scale (toleranceinterval)', up.hi, REF.tol.upperLog90_95, 1e-6);
  show('upper 90/95 limit, log scale', up.hi.toFixed(6), REF.tol.upperLog90_95.toFixed(6));
  const lo = TI.analyse(vals, { p: 0.9, g: 0.95, side: 'lower', log: true });
  near('tolerance: lower 90/95 on log scale (toleranceinterval)', lo.lo, REF.tol.lowerLog90_95, 1e-6);
  const two = TI.analyse(vals, { p: 0.9, g: 0.95, side: 'two', method: 'howe' });
  near('tolerance: two-sided Howe lower', two.lo, REF.tol.twoHowe90_95[0], 1e-9);
  near('tolerance: two-sided Howe upper', two.hi, REF.tol.twoHowe90_95[1], 1e-9);
  const ex = TI.analyse(vals, { p: 0.9, g: 0.95, side: 'two', method: 'exact' });
  near('tolerance: two-sided exact lower', ex.lo, REF.tol.twoExact90_95[0], 1e-4);
  near('tolerance: two-sided exact upper', ex.hi, REF.tol.twoExact90_95[1], 1e-4);
  show('two-sided exact 90/95 interval', `${ex.lo.toFixed(5)} to ${ex.hi.toFixed(5)}`, `${REF.tol.twoExact90_95[0].toFixed(5)} to ${REF.tol.twoExact90_95[1].toFixed(5)}`);
  near('tolerance: mean', two.mean, REF.tol.mean, 1e-12); near('tolerance: SD', two.sd, REF.tol.sd, 1e-12);
  near('tolerance: skewness (scipy, bias-corrected)', two.skew, REF.tol.skew, 1e-12);
  near('tolerance: skewness of logs', up.skew, REF.tol.skewLog, 1e-12);
  const s = [...vals].sort((a, b) => a - b);
  same('distribution-free upper 80/90 (toleranceinterval)', TI.npTolerance(s, 0.8, 0.9, 'upper').hi, REF.tol.npUpper80_90);
  same('distribution-free lower 80/90 (toleranceinterval, 20th percentile bound)', TI.npTolerance(s, 0.8, 0.9, 'lower').lo, REF.tol.npLower20_90);
  same('distribution-free upper 90/95 (toleranceinterval)', TI.npTolerance(s, 0.9, 0.95, 'upper').hi, REF.tol.npUpper90_95);
  for (const c of REF.npTwo) near(`order-statistic confidence n=${c.n} r=${c.r} p=${c.p} (scipy beta)`, TI.npTwoConf(c.n, c.r, c.p), c.conf, 1e-12);
  const W = REF.wilks;
  same("Wilks n two-sided 95/95", TI.npMinN(0.95, 0.95, 'two'), W.two_95_95); same("Wilks n one-sided 95/95", TI.npMinN(0.95, 0.95, 'one'), W.one_95_95);
  same("Wilks n two-sided 90/90", TI.npMinN(0.9, 0.9, 'two'), W.two_90_90); same("Wilks n one-sided 90/90", TI.npMinN(0.9, 0.9, 'one'), W.one_90_90);
  same("Wilks n two-sided 99/95", TI.npMinN(0.99, 0.95, 'two'), W.two_99_95); same("Wilks n one-sided 99/95", TI.npMinN(0.99, 0.95, 'one'), W.one_99_95);
  for (const c of REF.pcs) {
    const pc = TI.percentileCI(s, c.q, c.conf);
    if (c.l && c.u) {
      same(`percentile CI q=${c.q} ${c.conf}: ranks`, [pc.l, pc.u], [c.l, c.u]);
      same(`percentile CI q=${c.q} ${c.conf}: limits`, [pc.lo, pc.hi], [c.lo, c.hi]);
      near(`percentile CI q=${c.q} ${c.conf}: exact coverage`, pc.cover, c.cover, 1e-12);
    } else {
      // No pair of ranks reaches the confidence with n values: the tool says so and gives the n needed.
      same(`percentile CI q=${c.q} ${c.conf}: not available at n = ${s.length}`, pc.ok, false);
      const m = TI.percentileCI(Array.from({ length: pc.nNeeded }, (_, i) => i), c.q, c.conf), m1 = TI.percentileCI(Array.from({ length: pc.nNeeded - 1 }, (_, i) => i), c.q, c.conf);
      truthy(`percentile CI q=${c.q} ${c.conf}: ${pc.nNeeded} values is the smallest n that works`, m.ok && !m1.ok);
    }
    near(`percentile q=${c.q}: estimate (numpy)`, pc.est, c.est, 1e-12);
  }
  for (const z of REF.zero) {
    const r = TI.zeroEvents(z.x, z.n, 0.95);
    near(`events ${z.x}/${z.n}: one-sided upper (statsmodels)`, r.upper1, z.upper1, 1e-10);
    near(`events ${z.x}/${z.n}: two-sided lower (statsmodels)`, r.lo2, z.lo2, 1e-10);
    near(`events ${z.x}/${z.n}: two-sided upper (statsmodels)`, r.hi2, z.hi2, 1e-10);
    if (z.x === 0) near(`0/${z.n}: 1 − α^(1/n)`, r.upper1, z.exact0, 1e-10);
  }
  show('0/40 one-sided 95% upper limit', TI.zeroEvents(0, 40).upper1.toFixed(6), REF.zero[0].upper1.toFixed(6));
  near('rule of three 0/40 = 3/40', TI.zeroEvents(0, 40).rule3, 0.075, 1e-15);
  same('trials for < 1% with zero events', TI.nForZero(0.01), REF.nForZero['0.01']);
  same('trials for < 5% with zero events', TI.nForZero(0.05), REF.nForZero['0.05']);
  for (const c of REF.poisson) { const r = TI.countRule(c.c); near(`Poisson exact c=${c.c} lower`, r.exLo, c.lo, 1e-8); near(`Poisson exact c=${c.c} upper`, r.exHi, c.hi, 1e-8); }
  // Medium, not high: the distribution-free 90/95 limit (the maximum, 96.4 s) is more than 15% above the normal one.
  summary('tolerance summary (example, log, upper)', TI.toleranceSummary(up, 'seconds'), { key: 'seconds', level: 'medium' });
  summary('tolerance summary (80/90, log, upper)', TI.toleranceSummary(TI.analyse(vals, { p: 0.8, g: 0.9, side: 'upper', log: true }), 'seconds'), { level: 'high' });
  summary('tolerance summary (raw, two-sided, skewed)', TI.toleranceSummary(two, 'seconds'), { level: 'low' });
  summary('tolerance summary (n = 10, distribution-free impossible)', TI.toleranceSummary(TI.analyse(vals.slice(0, 10), { p: 0.95, g: 0.95, side: 'two', log: true })), { level: 'low' });
  summary('zero-events summary (0/40)', TI.zeroSummary(TI.zeroEvents(0, 40)), { key: '0 of 40', level: 'low' });
  summary('zero-events summary (2/300)', TI.zeroSummary(TI.zeroEvents(2, 300)), { level: 'high' });
  same('tolerance: too few values', !!TI.analyse([1, 2]).error, true);
  same('tolerance: log needs positive values', !!TI.analyse([1, 0, 2], { log: true }).error, true);
}

// ── Catalog entries ──
{
  const methods = JSON.parse(readFileSync(path.join(here, '..', 'data', 'methods.json'), 'utf8'));
  const ids = new Set((Array.isArray(methods) ? methods : methods.methods || Object.values(methods)).map((m) => m.id));
  for (const id of ['ia-graph', 'iat-dscore', 'mouse-tracking', 'correspondence-analysis', 'tolerance-intervals']) {
    const c = CATALOG.find((x) => x.id === id);
    truthy(`catalog has ${id}`, c);
    for (const m of c?.methods || []) truthy(`${id}: method ${m} exists`, ids.has(m));
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
