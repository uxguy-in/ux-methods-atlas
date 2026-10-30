// Checks the causal and experiment-design tools (difference-in-differences, E-value, factorial designs, bandit
// simulator, brand lift, market sizing) against statsmodels, scipy, numpy and pyDOE3 (server/scripts/
// causal-reference.py → causal-reference.json, inputs from causal-dump.js → causal-reference-input.json) and against
// published worked examples: VanderWeele and Ding (2017), Montgomery (2017) Example 6.2 and table 8.14, Plackett and
// Burman (1946). Also checks every "Reading your results" summary. Run with `npm run check:causal`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../client/src/calc/tools/causal-core.js';
import * as D from '../../client/src/calc/tools/causal-did.js';
import * as E from '../../client/src/calc/tools/causal-evalue.js';
import * as F from '../../client/src/calc/tools/causal-factorial.js';
import * as BD from '../../client/src/calc/tools/causal-bandit.js';
import * as BL from '../../client/src/calc/tools/causal-brandlift.js';
import * as MK from '../../client/src/calc/tools/causal-market.js';
import { L18, L32, L36 } from '../../client/src/calc/tools/causal-oa.js';
import { CATALOG } from '../../client/src/calc/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'causal-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'causal-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${+Number(want).toPrecision(12)}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
const nearRel = (label, got, want, rel = 1e-7) => near(label, got, want, Math.abs(want) * rel + 1e-12);
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  const s = (x) => { const t = JSON.stringify(x); return t && t.length > 160 ? `${t.slice(0, 160)}…` : t; };
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${s(want)}, got ${s(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const calcIds = new Set(CATALOG.map((c) => c.id));
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, key, level) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 7 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && /Rule/.test(s.confidenceNote) && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part and states its rule`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\(\/calculators\/([a-z0-9-]+)\)/g)) truthy(`${label}: link /calculators/${m[1]} exists`, calcIds.has(m[1]));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}

// ── Inputs are the pages' examples ──
same('Panel example on the page = reference input', D.readPanel(D.examplePanel(), D.EXAMPLE_COLS).rows, INP.panel);
same('Brand-lift example on the page = reference input', BL.parseQuestions(BL.EXAMPLE).rows, INP.brand);
same('Market example on the page = reference input', JSON.parse(JSON.stringify(MK.toModel(MK.EXAMPLE.chains))), INP.market);

// ── Core numerics ──
near('t two-sided p (t = 2.1, df = 35; scipy 0.04300555056551)', C.tP2(2.1, 35), 0.04300555056551, 1e-11);
nearRel('t critical 0.975, df = 35 (scipy 2.030107928250343)', C.tCrit(0.95, 35), 2.030107928250343, 1e-10);
nearRel('F upper tail F(3, 35) = 0.22696608 (statsmodels p 0.87699236)', C.fSf(REF.did_prejoint.F, 3, 35), REF.did_prejoint.p, 1e-9);
same('Holm adjustment of [0.01, 0.04, 0.03, 0.005] (statsmodels [0.03, 0.06, 0.06, 0.02])', C.holm([0.01, 0.04, 0.03, 0.005]).map((x) => +x.toFixed(12)), [0.03, 0.06, 0.06, 0.02]);

// ── Difference-in-differences: panel (statsmodels OLS, cov_type='cluster', use_t=True) ──
const pr = D.panelDiD(INP.panel, INP.start);
['Intercept', 'treat', 'post', 'treat × post (DiD)'].forEach((t, i) => {
  nearRel(`DiD panel ${t}: coefficient`, pr.main.rows[i].b, REF.did_panel.b[i], 1e-9);
  nearRel(`DiD panel ${t}: cluster SE`, pr.main.rows[i].se, REF.did_panel.se[i], 1e-8);
  nearRel(`DiD panel ${t}: p`, pr.main.rows[i].p, REF.did_panel.p[i], 1e-6);
  nearRel(`DiD panel ${t}: CI lower`, pr.main.rows[i].lo, REF.did_panel.lo[i], 1e-8);
});
same('DiD panel: t on G − 1 = 35 df', pr.main.df, REF.did_panel.df);
REF.did_event.periods.forEach((p, j) => {
  const e = pr.event.find((x) => x.period === p);
  nearRel(`Event study period ${p}: coefficient`, e.b, REF.did_event.b[j], 1e-8);
  nearRel(`Event study period ${p}: cluster SE`, e.se, REF.did_event.se[j], 1e-8);
  nearRel(`Event study period ${p}: CI upper`, e.hi, REF.did_event.hi[j], 1e-8);
});
nearRel('Pre-period joint Wald F (statsmodels wald_test use_f)', pr.preJoint.F, REF.did_prejoint.F, 1e-8);
nearRel('Pre-period joint Wald p', pr.preJoint.p, REF.did_prejoint.p, 1e-8);
same('Pre-period joint Wald df', [pr.preJoint.q, pr.preJoint.df2], [REF.did_prejoint.df_num, REF.did_prejoint.df_denom]);
nearRel('Linear pre-trend: slope difference', pr.trend.b, REF.did_trend.b, 1e-8);
nearRel('Linear pre-trend: cluster SE', pr.trend.se, REF.did_trend.se, 1e-8);
nearRel('Linear pre-trend: p', pr.trend.p, REF.did_trend.p, 1e-7);
// 2×2 summary statistics vs OLS with HC2 errors on the individual data
const r2 = D.did2x2(REF.did_2x2.cells);
nearRel('DiD 2×2: estimate = OLS treat×post', r2.est, REF.did_2x2.est, 1e-10);
nearRel('DiD 2×2: SE = HC2 robust SE of treat×post', r2.se, REF.did_2x2.se_hc2, 1e-9);
nearRel('DiD 2×2: Welch-Satterthwaite df', r2.df, REF.did_2x2.welch_df, 1e-10);
nearRel('DiD 2×2: p (t on Welch df)', r2.p, REF.did_2x2.p, 1e-7);
nearRel('DiD 2×2: CI lower', r2.lo, REF.did_2x2.lo, 1e-9);
// Hand check of the page example: (11.0 − 14.2) − (13.1 − 13.8) = −2.5
near('DiD 2×2 page example: (11.0 − 14.2) − (13.1 − 13.8) = −2.5', D.did2x2(D.EXAMPLE_2X2).est, -2.5, 1e-12);

summary('DiD panel example', D.didSummary(pr, { mode: 'panel', unit: 'workspaces', metric: 'weekly active users per 100 seats' }), ['raised', 'weekly active'], 'high');
summary('DiD 2×2 example', D.didSummary(D.did2x2(D.EXAMPLE_2X2), { mode: '2x2', metric: 'minutes' }), 'lowered', 'medium');
summary('DiD 2×2 null', D.didSummary(D.did2x2({ t0: { m: 10, s: 5, n: 50 }, t1: { m: 10.5, s: 5, n: 50 }, c0: { m: 10, s: 5, n: 50 }, c1: { m: 10.2, s: 5, n: 50 } }), { mode: '2x2' }), 'includes zero', 'low');
// Few clusters: same panel with only 6 workspaces → "some"
const few = INP.panel.filter((r) => ['W01', 'W02', 'W03', 'W19', 'W20', 'W21'].includes(r.unit));
const fr = D.panelDiD(few, 5);
if (fr.main.lo > 0) summary('DiD panel with 6 clusters', D.didSummary(fr, { mode: 'panel' }), null, 'medium');
// Diverging pre-trends: add a growing gap before the start → weak
const div = INP.panel.map((r) => ({ ...r, y: r.y + (r.treat ? 3 * r.period : 0) }));
summary('DiD panel with diverging pre-trends', D.didSummary(D.panelDiD(div, 5), { mode: 'panel' }), null, 'low');
same('DiD panel: errors for one group with a single unit', !!D.panelDiD(INP.panel.filter((r) => r.unit === 'W01' || !r.treat), 5).error, true);

// ── E-value ──
for (const c of REF.evalue) {
  const lab = `E-value ${c.type} ${c.est}${c.common ? ' (common)' : ''}${c.trueRR ? ` → ${c.trueRR}` : ''}`;
  const r = E.evalue({ type: c.type, est: c.est, lo: c.lo ?? NaN, hi: c.hi ?? NaN, se: c.se ?? NaN, common: c.common, trueRR: c.trueRR || 1 });
  nearRel(`${lab}: RR scale`, r.rr, c.rr, 1e-12);
  nearRel(`${lab}: E-value, estimate`, r.point, c.point, 1e-12);
  nearRel(`${lab}: E-value, CI limit`, r.ciE, c.ci, 1e-12);
}
const vd = E.evalue({ type: 'RR', est: 3.9, lo: 1.8, hi: 8.7, trueRR: 1 });
near('VanderWeele and Ding (2017) worked example: E-value 7.26 for RR 3.9', +vd.point.toFixed(2), 7.26, 1e-12);
near('VanderWeele and Ding (2017) worked example: 3.00 for the lower limit 1.8', +vd.ciE.toFixed(2), 3.0, 1e-12);
nearRel('Bias factor at (E, E) equals the RR it explains away', E.biasFactor(REF.evalue_bias.E, REF.evalue_bias.E), 3.9, 1e-12);
truthy('Bias curve: every point has bias factor = RR', E.biasCurve(2.5).every(([a, b]) => Math.abs(E.biasFactor(a, b) - 2.5) < 1e-9));
near('SE of d from a 95% CI (0.2 to 0.7) = 0.5/3.92', E.seFromCI(0.2, 0.7), 0.5 / (2 * 1.959963984540054), 1e-12);
summary('E-value example (HR 0.68, common)', E.evalueSummary(E.evalue({ ...E.EXAMPLE, est: 0.68, lo: 0.55, hi: 0.84, trueRR: 1 }), { exposure: 'the guide', outcome: 'churn' }), 'risk ratio of at least', 'medium');
summary('E-value paper example', E.evalueSummary(vd), null, 'high');
summary('E-value, CI includes 1', E.evalueSummary(E.evalue({ type: 'OR', est: 1.6, lo: 0.9, hi: 2.8, common: false, trueRR: 1 })), null, 'low');

// ── Fractional factorials (pyDOE3 fracfact and fracfact_aliasing; Montgomery table 8.14) ──
REF.designs.forEach((ref, i) => {
  const inp = INP.designs[i];
  const lab = `2^(${ref.k}−${ref.p})`;
  const rows = inp.runs.map((r) => r.join(',')).sort();
  same(`${lab}: runs equal pyDOE3 fracfact('${inp.gen}')`, rows, ref.rows.map((r) => r.join(',')).sort());
  same(`${lab}: resolution ${F.romanRes(inp.resolution)} = brute force on pyDOE3's design = Montgomery's table`, [inp.resolution, inp.res], [ref.resolution, ref.resolution]);
  if (ref.classes) {
    // pyDOE3 also lists the defining relation itself (the words aliased with I) as a class; our page lists it separately.
    const g = F.parseGenerators(F.DESIGNS[i][3].join('\n'), ref.k, ref.p).gens;
    const lower = 'abcdefghijklmnopqrstuvwxyz', py = (m) => [...Array(ref.k).keys()].filter((j) => m >> j & 1).map((j) => lower[j]).join('');
    const defining = F.fracDesign(ref.k, g).words.map((w) => py(w.mask)).sort().join('=');
    same(`${lab}: alias classes equal pyDOE3 fracfact_aliasing (defining relation I = ${defining.toUpperCase()})`, inp.classes.filter((c) => c.length > 1).map((c) => c.join('=')).sort(), ref.classes.map((c) => c.join('=')).filter((c) => c !== defining).sort());
  }
});
const d42 = F.fracDesign(6, F.parseGenerators('E=ABC\nF=BCD', 6, 2).gens);
same('2^(6−2) IV: defining relation I = ABCE = BCDF = ADEF (Montgomery Example 8.4)', d42.words.map((w) => F.wordStr(w.mask, 6)), ['ABCE', 'BCDF', 'ADEF']);
same('2^(6−2) IV: word-length pattern (A3, A4, A5, A6) = (0, 3, 0, 0)', d42.wlp, [0, 3, 0, 0]);
same('2^(5−1) V: all 5 main effects and 10 two-factor interactions clear', [F.fracDesign(5, F.parseGenerators('E=ABCD', 5, 1).gens).mainClear, F.fracDesign(5, F.parseGenerators('E=ABCD', 5, 1).gens).twoClear], [5, 10]);
same('Negative generator D = −ABC gives I = −ABCD', F.fracDesign(4, F.parseGenerators('D=-ABC', 4, 1).gens).words.map((w) => [F.wordStr(w.mask, 4), w.sign]), [['ABCD', -1]]);
truthy('Generator errors: wrong count, unknown letter, main-effect alias', F.parseGenerators('E=ABC', 6, 2).error && F.parseGenerators('E=ABX', 5, 1).error && F.parseGenerators('E=A', 5, 1).error);

// ── Plackett-Burman and orthogonal arrays ──
for (const N of F.PB_SIZES) {
  const X = F.plackettBurman(N);
  const orth = X[0].every((_, a) => X[0].every((__, b) => X.reduce((s, r) => s + r[a] * r[b], 0) === (a === b ? N : 0)));
  same(`Plackett-Burman N = ${N}: X'X = N·I (pyDOE3 pbdesign also orthogonal: ${REF.pb[N]})`, [orth, X.length, X[0].length], [true, N, N - 1]);
}
same('Plackett-Burman N = 12 first row is Plackett and Burman (1946): ++-+++---+-', F.plackettBurman(12)[0].map((v) => (v > 0 ? '+' : '-')).join(''), '++-+++---+-');
same('L18 equals pyDOE3 L18(6^1 3^6)', L18.split(' '), REF.oa.L18);
same('L32 equals pyDOE3 L32(2^1 4^9)', L32.split(' '), REF.oa.L32);
same('L36 equals pyDOE3 L36 (2^11 3^12)', L36.split(' '), REF.oa.L36);
for (const a of F.ARRAYS) {
  const rows = a.build();
  const L = F.levelsOf(rows);
  const m = /^L(\d+)\((.*)\)$/.exec(a.name);
  const want = m[2].split(' ').flatMap((t) => { const [s, c] = t.split('^').map(Number); return Array(c).fill(s); }).sort((x, y) => x - y).join(',');
  same(`${a.name}: ${m[1]} runs, levels ${m[2]}, strength 2 (every pair of columns balanced)`, [rows.length, [...L].sort((x, y) => x - y).join(','), F.isStrength2(rows)], [Number(m[1]), want, true]);
}
same('Array picker: one two-level and three three-level factors → L18(2^1 3^7)', F.pickArray([2, 3, 3, 3]).name, 'L18(2^1 3^7)');
same('Array picker: four three-level factors → L9(3^4)', F.pickArray([3, 3, 3, 3]).name, 'L9(3^4)');
const ro = F.randomOrder(16, 20261030);
same('Randomised run order is a permutation and repeatable with the seed', [new Set(ro).size, ro.join() === F.randomOrder(16, 20261030).join(), ro.join() !== [...Array(16).keys()].join()], [16, true, true]);
const sheet = F.runSheet(F.fracDesign(3, []).runs, [{ name: 'A', levels: ['lo', 'hi'] }, { name: 'B', levels: ['x', 'y'] }, { name: 'C', levels: ['1', '2'] }], [0, 1, 2, 3, 4, 5, 6, 7]);
same('Run sheet CSV header and first row', sheet.csv.split('\n').slice(0, 2), ['Run,Standard order,A,B,C', '1,1,lo,x,1']);

// ── Effects and Lenth's method ──
const mt = F.parseTable(F.montgomeryText());
const ma = F.analyseTwoLevel(mt, mt.names.slice(0, 4), mt.names[4]);
REF.montgomery.names.forEach((nm, i) => nearRel(`Montgomery 6.2 effect ${nm} (2 × OLS coefficient)`, ma.effects.find((e) => e.name === nm).effect, REF.montgomery.effects[i], 1e-10));
same('Montgomery 6.2 published effects A, C, D, AC, AD = 21.625, 9.875, 14.625, −18.125, 16.625', ['A', 'C', 'D', 'AC', 'AD'].map((n) => ma.effects.find((e) => e.name === n).effect), [21.625, 9.875, 14.625, -18.125, 16.625]);
nearRel('Montgomery 6.2 Lenth PSE (= 2.625)', ma.lenth.PSE, REF.montgomery.lenth.PSE, 1e-12);
nearRel('Montgomery 6.2 Lenth ME (scipy t(0.975, 5))', ma.lenth.ME, REF.montgomery.lenth.ME, 1e-9);
nearRel('Montgomery 6.2 Lenth SME', ma.lenth.SME, REF.montgomery.lenth.SME, 1e-8);
same('Montgomery 6.2 active effects beyond ME: A, C, D, AC, AD', ma.effects.filter((e) => e.active).map((e) => e.name).sort(), ['A', 'AC', 'AD', 'C', 'D']);
const ut = F.parseTable(F.uxExampleText());
const ua = F.analyseTwoLevel(ut, ut.names.slice(0, 5), ut.names[5]);
REF.ux_effects.names.forEach((nm, i) => nearRel(`Sign-up example effect ${nm} (statsmodels OLS × 2)`, ua.effects.find((e) => e.name === nm).effect, REF.ux_effects.effects[i], 1e-9));
nearRel('Sign-up example Lenth ME', ua.lenth.ME, REF.ux_effects.lenth.ME, 1e-8);
same('Sign-up example: 15 effects, defining relation I = ABCDE found from the data', [ua.effects.length, ua.words.map((w) => F.wordStr(w.mask, 5))], [15, ['ABCDE']]);
truthy('Half-normal positions are increasing', ma.halfNormal.every((h, i, a) => !i || h.q > a[i - 1].q));

summary('Design summary 2^(5−1) V', F.designSummary({ kind: 'frac', runs: 16, k: 5, p: 1, res: 5, gens: ['E=ABCD'], mainClear: 5, twoClear: 10 }), '16-run', 'high');
summary('Design summary 2^(6−2) IV', F.designSummary({ kind: 'frac', runs: 16, k: 6, p: 2, res: 4, gens: ['E=ABC', 'F=BCD'], mainClear: 6, twoClear: 3 }), null, 'medium');
summary('Design summary Plackett-Burman', F.designSummary({ kind: 'pb', runs: 12, k: 9 }), 'Plackett-Burman', 'low');
summary('Design summary orthogonal array', F.designSummary({ kind: 'oa', runs: 18, k: 4, name: 'L18(2^1 3^7)', full: 54 }), 'L18', 'low');
summary('Analysis summary Montgomery', F.analysisSummary(ma, { response: 'filtration rate' }), 'Temperature', 'high');
summary('Analysis summary sign-up example', F.analysisSummary(ua, { response: 'sign-up rate' }), 'stand', null);
const flat = F.parseTable('A,B,C,y\n-1,-1,-1,5\n1,-1,-1,5.1\n-1,1,-1,4.9\n1,1,-1,5\n-1,-1,1,5.2\n1,-1,1,4.8\n-1,1,1,5.1\n1,1,1,4.9');
summary('Analysis summary, 7 effects of noise', F.analysisSummary(F.analyseTwoLevel(flat, ['A', 'B', 'C'], 'y')), null, 'low');

// ── Bandit simulator (numpy reference simulation, 4,000 runs per policy) ──
const sim = BD.simulate({ ...INP.bandit, sims: 2000, seed: 3 });
near('Fixed split regret = T·(best − mean rate) exactly', sim.res.fixed.regret, REF.bandit.fixed_exact_regret, 1e-6);
near('Fixed split: best arm gets exactly 1/K of traffic', sim.res.fixed.bestShare, 0.25, 1e-12);
for (const pol of ['thompson', 'egreedy', 'ucb', 'fixed']) {
  const a = sim.res[pol], b = REF.bandit[pol];
  const tolR = 4 * Math.hypot(a.regretSe, b.regretSe) + 1e-9, tolC = 4 * Math.hypot(a.pCorrectSe, b.pCorrectSe);
  near(`${BD.POLICY_NAME[pol]}: regret matches numpy within 4 Monte Carlo SE`, a.regret, b.regret, tolR);
  near(`${BD.POLICY_NAME[pol]}: chance of picking the winner within 4 SE`, a.pCorrect, b.pCorrect, tolC);
  near(`${BD.POLICY_NAME[pol]}: share of traffic to best arm within 0.02`, a.bestShare, b.bestShare, 0.02);
}
// Exact binomial sampler: mean and variance of 200,000 draws of Bin(1000, 0.03) and Bin(50, 0.7).
for (const [n, p] of [[1000, 0.03], [50, 0.7], [5000, 0.2]]) {
  const u = C.rng(5); let s = 0, s2 = 0; const R = 200000;
  for (let i = 0; i < R; i++) { const x = C.randBinom(n, p, u); s += x; s2 += x * x; }
  const m = s / R, v = s2 / R - m * m;
  near(`Binomial draws Bin(${n}, ${p}): mean np = ${n * p}`, m, n * p, 5 * Math.sqrt(n * p * (1 - p) / R));
  near(`Binomial draws Bin(${n}, ${p}): variance np(1−p) = ${+(n * p * (1 - p)).toFixed(3)}`, v, n * p * (1 - p), 0.03 * n * p * (1 - p));
}
{ const u = C.rng(9); let s = 0; const R = 100000; for (let i = 0; i < R; i++) s += C.randBeta(2, 5, u); near('Beta(2, 5) draws: mean 2/7', s / R, 2 / 7, 0.003); }
same('Allocation sums to the batch and is exact for equal weights', [BD.allocate(200, [0.25, 0.25, 0.25, 0.25], C.rng(1)), BD.allocate(7, [0.5, 0.3, 0.2], C.rng(2)).reduce((a, b) => a + b, 0)], [[50, 50, 50, 50], 7]);
const exSim = BD.simulate({ p: INP.bandit.p, T: INP.bandit.T, batch: INP.bandit.batch, sims: 500, eps: INP.bandit.eps, seed: 1 });
summary('Bandit example summary', BD.banditSummary(exSim), 'loses the fewest conversions', 'high');
summary('Bandit, too few simulations', BD.banditSummary(BD.simulate({ p: [0.05, 0.051], T: 2000, batch: 100, sims: 100, seed: 2 })), null, 'low');

// ── Brand lift (statsmodels) ──
const br = BL.brandLift(INP.brand, 0.95);
REF.brand.forEach((q, i) => {
  const r = br.rows[i];
  nearRel(`${q.name}: absolute lift`, r.d, q.d, 1e-12);
  nearRel(`${q.name}: Newcombe lower`, r.lo, q.lo, 1e-9);
  nearRel(`${q.name}: Newcombe upper`, r.hi, q.hi, 1e-9);
  nearRel(`${q.name}: relative lift lower (log RR)`, r.rlo, q.rlo, 1e-9);
  nearRel(`${q.name}: relative lift upper (log RR)`, r.rhi, q.rhi, 1e-9);
  nearRel(`${q.name}: z`, r.z, q.z, 1e-10);
  nearRel(`${q.name}: p`, r.p, q.p, 1e-7);
  nearRel(`${q.name}: Holm-adjusted p`, r.pHolm, q.pHolm, 1e-7);
});
for (const s of REF.brand_n) {
  const r = BL.sampleSize({ p0: s.p0, delta: s.delta, alpha: s.alpha, power: s.power, k: s.k, m: s.m });
  nearRel(`Sample size p0 ${s.p0}, Δ ${s.delta}, power ${s.power}, k ${s.k}, ${s.m} question(s): raw n₁`, r.raw, s.raw, 1e-9);
  same(`  … rounded n₁ = ${s.n1}`, r.n1, s.n1);
  truthy(`  … statsmodels power_proportions_2indep at n₁ is ${s.achieved.toFixed(4)} ≥ ${s.power}`, s.achieved >= s.power - 1e-6);
}
const md = BL.mdl({ p0: 0.25, n1: 5054, alpha: 0.05, power: 0.8, k: 1, m: 5 });
near('Detectable lift at the planned n₁ is the planned Δ (0.03)', md, 0.03, 2e-5);
summary('Brand-lift example summary', BL.liftSummary(BL.brandLift(INP.brand, 0.95, 2400000)), 'Ad recall', 'high');
summary('Brand lift, nothing significant', BL.liftSummary(BL.brandLift([{ name: 'Recall', x1: 52, n1: 200, x0: 45, n0: 200 }], 0.95)), 'No question', 'low');
summary('Brand lift, small groups', BL.liftSummary(BL.brandLift([{ name: 'Recall', x1: 90, n1: 150, x0: 50, n0: 150 }], 0.95)), null, 'medium');
same('Pasted questions: header skipped, bad lines reported', [BL.parseQuestions('q,a,b,c,d\nX,5,10,3,10\nY,11,10,3,10').rows.length, BL.parseQuestions('q,a,b,c,d\nX,5,10,3,10\nY,11,10,3,10').errors.length], [1, 1]);

// ── Market sizing (numpy Monte Carlo with scipy distributions, 2,000,000 draws; exact log-normal product) ──
for (const t of REF.triangular) {
  const r = MK.triFromRange(t.lo, t.mode, t.hi);
  nearRel(`Triangular from 90% range (${t.lo}, ${t.mode}, ${t.hi}): minimum (scipy triang fsolve)`, r.a, t.a, 1e-7);
  nearRel(`  … maximum`, r.b, t.b, 1e-7);
  near('  … 5th and 95th percentiles reproduce the range', MK.triInv(0.05, r.a, r.c, r.b) + MK.triInv(0.95, r.a, r.c, r.b), t.lo + t.hi, 1e-9);
}
const lnc = REF.lognormal_chain;
const lnRes = MK.simulateMarket([{ name: 'LN', items: lnc.inputs.map(([lo, hi], i) => ({ name: `x${i}`, lo, hi, mode: NaN, dist: 'lognormal', kind: 'number', stage: 'TAM' })) }], { draws: 400000, seed: 3 })[0];
nearRel('All log-normal chain: median = exp(Σμ) exactly', lnRes.stages.TAM.base, lnc.p50, 1e-12);
for (const k of ['p05', 'p50', 'p95', 'mean']) nearRel(`All log-normal chain: Monte Carlo ${k} within 1.5% of the exact log-normal`, lnRes.stages.TAM[k], lnc[k], 0.015);
const mres = MK.simulateMarket(INP.market, { draws: 400000, seed: 11 });
REF.market.forEach((ref, i) => {
  for (const s of MK.STAGES) for (const k of ['p05', 'p50', 'p95', 'mean']) nearRel(`${ref.name} ${s} ${k} (numpy/scipy)`, mres[i].stages[s][k], ref[s][k], k === 'p05' || k === 'p95' ? 0.02 : 0.012);
});
truthy('Tornado shares sum to 1 for each chain and stage', mres.every((r) => MK.STAGES.every((s) => Math.abs(r.stages[s].tornado.reduce((a, t) => a + t.share, 0) - 1) < 1e-9)));
truthy('Tornado: the SOM bars bracket the all-medians base', mres.every((r) => r.stages.SOM.tornado.every((t) => t.lo <= r.stages.SOM.base * (1 + 1e-12) && t.hi >= r.stages.SOM.base * (1 - 1e-12))));
const ex = MK.simulateMarket(MK.toModel(MK.EXAMPLE.chains));
summary('Market example summary', MK.marketSummary(ex, { currency: '£', stage: 'SOM' }), ['£', 'top-down'], 'medium');
summary('Market, one chain', MK.marketSummary([ex[0]], { currency: '£', stage: 'TAM' }), 'TAM', null);
const off = MK.simulateMarket([MK.toModel(MK.EXAMPLE.chains)[0], { name: 'Bottom-up', items: [{ name: 'Users', lo: 1000, hi: 3000, mode: NaN, dist: 'lognormal', kind: 'count', stage: 'TAM' }, { name: 'Price', lo: 50, hi: 100, mode: NaN, dist: 'lognormal', kind: 'money', stage: 'TAM' }, { name: 'Win', lo: 0.1, hi: 0.2, mode: NaN, dist: 'lognormal', kind: 'share', stage: 'SOM' }] }], { draws: 20000 });
summary('Market, chains disagree', MK.marketSummary(off, { stage: 'SOM' }), null, 'low');
same('Market input errors: low above high, share above 100%', [!!MK.prepInput({ name: 'x', lo: 5, hi: 2, dist: 'lognormal', kind: 'count' }).error, !!MK.prepInput({ name: 'x', lo: 0.5, hi: 1.2, dist: 'lognormal', kind: 'share' }).error], [true, true]);

// ── Worker and page wiring ──
const worker = readFileSync(path.join(here, '..', '..', 'client', 'src', 'calc', 'tools', 'causal.worker.js'), 'utf8');
truthy('Bandit and market Monte Carlo run in the Web Worker', worker.includes("'bandit'") && worker.includes("'market'"));
for (const id of ['diff-in-diff', 'e-value', 'factorial-designs', 'bandit-simulator', 'brand-lift', 'market-sizing']) truthy(`Catalog has ${id} with atlas methods`, CATALOG.find((c) => c.id === id)?.methods.length >= 3);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
