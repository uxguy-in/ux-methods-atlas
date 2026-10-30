// Checks the "signals" tools (top tasks, site search, control charts, concentration, classifier metrics, reaction
// times, risk and harm, queueing) against statsmodels, scipy, scikit-learn, ruptures, powerlaw and pyworkforce
// (server/scripts/signals-reference.py → signals-reference.json, on inputs from signals-dump.js) and against published
// worked examples: Wagenmakers et al. (2007) for EZ-diffusion and the Call Centre Helper Erlang C example. Also checks
// every "Reading your results" summary. Run with `npm run check:signals`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../../client/src/calc/tools/signals-toptasks.js';
import * as Q from '../../client/src/calc/tools/signals-search.js';
import * as C from '../../client/src/calc/tools/signals-spc.js';
import * as K from '../../client/src/calc/tools/signals-concentration.js';
import * as M from '../../client/src/calc/tools/signals-classifier.js';
import * as R from '../../client/src/calc/tools/signals-rt.js';
import * as H from '../../client/src/calc/tools/signals-risk.js';
import * as W from '../../client/src/calc/tools/signals-queue.js';
import * as S from '../../client/src/calc/tools/signals-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'signals-reference.json'), 'utf8'));
const IN = JSON.parse(readFileSync(path.join(here, 'signals-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-6) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toFixed(9) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, key) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && /Rule/.test(s.confidenceNote) && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part, with its confidence rule`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|—|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is a calculator`, /^\/calculators\/(completion-rate|task-time)$/.test(m[1]));
  if (key) for (const k of [].concat(key)) { truthy(`${label}: headline contains "${k}"`, s.headline.includes(k)); truthy(`${label}: report contains "${k}"`, s.report.includes(k)); }
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}

// ── Top tasks (statsmodels Wilson; pairwise z with exact co-selection reimplemented in numpy) ──
{
  const b = T.parseBallots(T.exampleBallotsText()), groups = T.exampleGroups();
  const a = T.analyse(b.tasks.map((t) => ({ ...t, group: groups[t.name] })), b.ballots.length, { ballots: b.ballots });
  const r = REF.toptasks;
  same('Top tasks: respondents and votes', [a.N, a.V], [r.N, r.V]);
  same('Top tasks: order and votes of the top 5', [a.rows.slice(0, 5).map((x) => x.name), a.rows.slice(0, 5).map((x) => x.votes)], [r.order, r.votes]);
  r.wilson.forEach(([lo, hi], i) => { near(`Top tasks: Wilson lower, task ${i + 1} (statsmodels)`, a.rows[i].pickLo, lo, 1e-9); near(`Top tasks: Wilson upper, task ${i + 1} (statsmodels)`, a.rows[i].pickHi, hi, 1e-9); });
  near('Top tasks: z, task 1 vs 2 with exact overlap (numpy)', a.rows[0].nextZ, r.z01, 1e-9);
  near('Top tasks: z, task 2 vs 3 (numpy)', a.rows[1].nextZ, r.z12, 1e-9);
  near('Top tasks: z, task 3 vs 4 (numpy)', a.rows[2].nextZ, r.z23, 1e-9);
  same('Top tasks: tiers (numpy reimplementation)', a.rows.map((x) => x.tier), r.tiers);
  same('Top tasks: long neck size', a.neck, r.neck);
  near('Top tasks: bottom-half share', a.bottomHalf, r.bottomHalf, 1e-12);
  near('Top tasks: vote-share CI = pick CI × N/V', a.rows[0].shareLo, a.rows[0].pickLo * a.N / a.V, 1e-12);
  const tot = T.analyse(T.parseTotals(T.exampleTotalsText()).tasks, 412);
  same('Top tasks: totals give the same ranking as ballots', tot.rows.map((x) => x.votes), a.rows.map((x) => x.votes));
  near('Top tasks: independence z by hand', tot.rows[0].nextZ, (tot.rows[0].pick - tot.rows[1].pick) / Math.sqrt((tot.rows[0].pick * (1 - tot.rows[0].pick) + tot.rows[1].pick * (1 - tot.rows[1].pick)) / 412), 1e-12);
  same('Top tasks: groups use pick-any rates with ballots', a.groups[0].any !== null && a.groups[0].any.x <= a.N, true);
  const s = summary('Top tasks', T.summary(a), ['Course entry requirements', '412']);
  same('Top tasks: confidence (412 respondents, separated tiers)', s.confidence, 'high');
  same('Top tasks: McGovern cited', s.meaning.some((m) => /McGovern \(2018/.test(m)), true);
  const small = T.analyse([{ name: 'A', votes: 9, group: '' }, { name: 'B', votes: 7, group: '' }, { name: 'C', votes: 2, group: '' }], 20);
  same('Top tasks: 20 respondents rated weak', summary('Top tasks, 20 respondents', T.summary(small)).confidence, 'low');
  same('Top tasks: fewer than 2 tasks rejected', T.analyse([{ name: 'A', votes: 3 }], 10), null);
}

// ── Site search (statsmodels OLS with cluster-robust SEs) ──
{
  const a = Q.analyse(Q.parseLog(Q.exampleLog()).rows), r = REF.search;
  for (const [k, rk] of [['zero', 'zero'], ['refine', 'refine'], ['exit', 'exit'], ['click', 'click'], ['repeat', 'repeat']]) {
    near(`Search: ${k} rate`, a.rate[k].rate, r[rk].rate, 1e-12);
    near(`Search: ${k} cluster-robust SE (statsmodels)`, a.rate[k].se, r[rk].se, 1e-10);
  }
  near('Search: Gini of query frequencies (numpy)', a.gini, r.gini, 1e-12);
  same('Search: distinct queries, head size, sessions', [a.distinct, a.head.queries, a.sessions], [r.distinct, r.head, r.sessions]);
  same('Search: sessions with a zero result', a.sessZero.x, r.sessZero[0]);
  near('Search: session zero-result Wilson lower (statsmodels)', a.sessZero.lo, r.sessZero[1][0], 1e-9);
  same('Search: normalisation', Q.normalise('  "Opening   Hours?" '), 'opening hours');
  same('Search: related queries', [Q.related('refund', 'refund policy'), Q.related('login', 'account login'), Q.related('parking', 'gift card'), Q.related('a', 'a')], [true, true, false, false]);
  const noRes = Q.analyse(Q.parseLog('s1, a\ns1, b\ns2, a\ns3, c\ns3, a\ns4, d').rows);
  same('Search: log without results or clicks still gives refinement', [noRes.hasResults, noRes.hasClicks, noRes.rate.refine.x], [false, false, 2]);
  summary('Search, no result counts', Q.summary(noRes), '33.3%');
  const s = summary('Search', Q.summary(a), ['10.8%', '563']);
  same('Search: confidence with 400 sessions', s.confidence, 'high');
}

// ── Control charts (numpy limits and CUSUM, ruptures Binseg, statsmodels OLS and HAC) ──
{
  const pts = C.parseSeries(C.exampleX(), 'x').pts;
  const a = C.analyse(pts, 'x', { base: 26, T0: 27 }), r = REF.spc_x;
  near('XmR: centre from 26 baseline points', a.lim.center, r.center, 1e-10);
  near('XmR: average moving range', a.lim.mrbar, r.mrbar, 1e-10);
  near('XmR: upper limit x̄ + 2.66 MR̄ (3σ̂ with d2 = 1.128)', a.lim.rows[0].ucl, r.ucl, 2e-3);
  near('XmR: lower limit', a.lim.rows[0].lcl, r.lcl, 2e-3);
  near('XmR: moving-range upper limit 3.267 MR̄', a.lim.mrUcl, r.mrUcl, 1e-10);
  same('CUSUM (k = 0.5, h = 5): first signal (numpy)', a.cusum.first, r.cusumFirst);
  near('CUSUM: final C⁻ (numpy)', a.cusum.dn[a.cusum.dn.length - 1], r.cusumEnd[1], 1e-9);
  const full = C.analyse(pts, 'x', { base: 0 });
  near('Binary segmentation penalty 2σ² ln n', full.binseg.pen, r.binsegPen, 1e-9);
  same('Binary segmentation change points (ruptures Binseg l2)', full.binseg.cuts, r.binseg);
  const p = C.analyse(C.parseSeries(C.exampleP(), 'p').pts, 'p', { base: 0 });
  near('p-chart: centre p̄', p.lim.center, REF.spc_p.center, 1e-12);
  near('p-chart: first point upper limit', p.lim.rows[0].ucl, REF.spc_p.ucl0, 1e-12);
  near('p-chart: first point lower limit', p.lim.rows[0].lcl, REF.spc_p.lcl0, 1e-12);
  same('p-chart: change points (ruptures Binseg l2)', p.binseg.cuts, REF.spc_p.binseg);
  const u = C.analyse(C.parseSeries(C.exampleU(), 'u').pts, 'u', { base: 0 });
  near('u-chart: centre ū', u.lim.center, REF.spc_u.center, 1e-12);
  near('u-chart: first point upper limit', u.lim.rows[0].ucl, REF.spc_u.ucl0, 1e-12);
  const its = C.its(pts.map((x) => x.x), 27), ri = REF.its_x;
  its.coefs.forEach((c, j) => {
    near(`ITS ${c.name}: estimate (statsmodels OLS)`, c.b, ri.b[j], 1e-8);
    near(`ITS ${c.name}: OLS SE (statsmodels)`, c.se, ri.se[j], 1e-8);
    near(`ITS ${c.name}: OLS p (statsmodels)`, c.p, ri.p[j], 1e-8);
    near(`ITS ${c.name}: Newey-West SE (statsmodels HAC, ${ri.L} lags)`, c.nwSe, ri.nwSe[j], 1e-8);
  });
  same('ITS: Newey-West lags ⌊4(n/100)^(2/9)⌋', its.L, ri.L);
  near('ITS: Durbin-Watson (statsmodels)', its.dw, ri.dw, 1e-9);
  const itsP = C.its(C.parseSeries(C.exampleP(), 'p').pts.map((x) => x.x), 24);
  itsP.coefs.forEach((c, j) => near(`ITS on the p-chart rates, ${c.name}: Newey-West SE (statsmodels)`, c.nwSe, REF.its_p.nwSe[j], 1e-10));
  // Run rules on constructed sequences (hand-checked).
  const we = (z) => C.runRules(z, 'we').hits, ne = (z) => C.runRules(z, 'nelson').hits;
  same('WE rule 1: one point beyond 3σ', we([0, 0.5, 3.2, 0, -3.1])[1], [2, 4]);
  same('WE rule 2: 2 of 3 beyond 2σ, same side', we([0, 2.1, 0.3, 2.4, 0, -2.2, 1, -2.5])[2], [3, 7]);
  same('WE rule 3: 4 of 5 beyond 1σ, same side', we([0, 1.2, 1.5, 0.2, 1.1, 1.3, 0])[3], [5]);
  same('WE rule 4: 8 in a row on one side', we([0.1, 0.2, 0.3, 0.1, 0.5, 0.2, 0.1, 0.4, 0.3, -0.1])[4], [7, 8]);
  same('Nelson rule 2: 9 in a row on one side', ne([0.1, 0.2, 0.3, 0.1, 0.5, 0.2, 0.1, 0.4, 0.3, -0.1])[2], [8]);
  same('Nelson rule 3: 6 in a row increasing', ne([0, -1, -0.8, -0.5, 0, 0.3, 0.6, 0.5])[3], [6]);
  same('Nelson rule 4: 14 alternating', ne([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0.5, 0.5])[4], [13, 14]);
  same('Nelson rule 7: 15 within 1σ', ne(Array.from({ length: 16 }, (_, i) => (i % 2 ? 0.3 : -0.4)))[7], [14, 15]);
  same('Nelson rule 8: 8 beyond 1σ either side', ne([1.5, -1.2, 1.1, -1.4, 1.3, -1.6, 1.2, -1.1, 0])[8], [7]);
  same('A stable series triggers no Western Electric rule', C.runRules([0.3, -0.5, 0.8, -0.2, 0.1, -0.9, 0.4, -0.3, 0.6, -0.1], 'we').any, false);
  same('Binary segmentation finds one clear shift', C.binseg([0, 0.1, -0.1, 0, 0.2, 5, 5.1, 4.9, 5, 5.2], 2 * 0.01 * Math.log(10) * 100).cuts, [5]);
  same('CUSUM by hand: C⁺ = 0, 0.5, 1.5', C.cusum([0.5, 1, 1.5]).up, [0, 0.5, 1.5]);
  const s = summary('Control chart (XmR)', C.summary(a), a.lim.rows[a.rules.byPoint.findIndex((b) => b.length)].label);
  same('Control chart summary: confidence with 26 baseline points', s.confidence, 'high');
  const pa = C.analyse(C.parseSeries(C.exampleP(), 'p').pts, 'p', { base: 23, T0: 24 });
  const ps = summary('Control chart (p)', C.summary(pa), pa.lim.rows[pa.rules.byPoint.findIndex((b) => b.length)].label);
  same('p-chart: interrupted time series reported in percentage points', /percentage points/.test(ps.report), true);
  summary('Control chart (u)', C.summary(C.analyse(C.parseSeries(C.exampleU(), 'u').pts, 'u', { base: 17, T0: 18 })));
  const flat = C.analyse([5, 5.2, 4.9, 5.1, 5, 4.8, 5.1, 5.05, 4.95, 5].map((x, i) => ({ label: String(i + 1), x })), 'x');
  const fs = summary('Control chart, stable short series', C.summary(flat), '5.01');
  same('Stable series: headline says no special cause', fs.headline.startsWith('No special-cause signal'), true);
  same('Stable 10-point series: rated weak (limits from fewer than 12 points)', fs.confidence, 'low');
  same('Control chart: fewer than 8 points rejected', C.analyse(pts.slice(0, 7), 'x'), null);
}

// ── Concentration (numpy Gini; powerlaw package; an independent scipy implementation of CSN) ──
{
  const v = IN.conc, c = K.concentration(v), r = REF.conc;
  near('Gini (numpy)', c.gini, r.gini, 1e-12);
  near('Top 20% share', c.top20, r.top20, 1e-12);
  near('Top 1% share', c.top1, r.top1, 1e-12);
  near('Share of units holding 80%', c.for80, r.for80, 1e-12);
  same('Gini of equal values is 0', K.concentration(Array(10).fill(3)).gini, 0);
  near('Gini when one of n holds everything = (n − 1)/n', K.concentration([...Array(9).fill(0), 10]).gini, 0.9, 1e-12);
  near('Hurwitz zeta ζ(2, 1) = π²/6', K.hurwitz(2, 1), Math.PI ** 2 / 6, 1e-13);
  near('Hurwitz zeta ζ(2.5, 3.7) (scipy 0.11475814214741724)', K.hurwitz(2.5, 3.7), 0.11475814214741724, 1e-13);
  near('Hurwitz zeta ζ(1.3, 50) (scipy 1.0339375441172522)', K.hurwitz(1.3, 50), 1.0339375441172522, 1e-12);
  const bt = K.giniBoot(v, 2000, 7);
  near('Gini bootstrap SE within 10% of a numpy bootstrap (4,000 resamples)', bt.se / r.bootSe, 1, 0.1);
  for (const [key, data, disc] of [['pl_disc', v, true], ['pl_cont', IN.cont, false]]) {
    const f = K.fitPowerLaw(data, disc), rr = REF[key], lbl = disc ? 'discrete' : 'continuous';
    same(`Power law (${lbl}): xmin (independent scipy CSN scan)`, f.xmin, rr.own.xmin);
    same(`Power law (${lbl}): xmin (powerlaw.Fit default)`, f.xmin, rr.powerlaw_default.xmin);
    same(`Power law (${lbl}): tail size`, f.ntail, rr.own.ntail);
    near(`Power law (${lbl}): α (powerlaw, fixed xmin)`, f.alpha, rr.powerlaw_at_xmin.alpha, disc ? 1e-4 : 1e-10);
    near(`Power law (${lbl}): α (scipy CSN)`, f.alpha, rr.own.alpha, 1e-6);
    near(`Power law (${lbl}): KS D (powerlaw)`, f.D, rr.powerlaw_at_xmin.D, disc ? 1e-5 : 1e-10);
    near(`Power law (${lbl}): SE of α (powerlaw sigma)`, f.se, rr.powerlaw_at_xmin.sigma, disc ? 2e-3 : 1e-10);
    const cmp = K.compareExponential(data, f);
    near(`Power law (${lbl}) vs exponential: normalised LR (powerlaw pointwise log-likelihoods, closed-form exponential MLE)`, cmp.Rn, rr.powerlaw_at_xmin.RnExact, disc ? 1e-4 : 1e-8);
    near(`Power law (${lbl}) vs exponential: p (same)`, cmp.p, rr.powerlaw_at_xmin.pExact, disc ? 1e-6 : 1e-12);
    near(`Power law (${lbl}) vs exponential: normalised LR within 0.01 of powerlaw distribution_compare (its λ is fitted numerically)`, cmp.Rn, rr.powerlaw_at_xmin.R, 0.01);
    for (const [xm, ref] of rr.fixed) {
      const s = data.filter((x) => x >= xm).sort((a, b) => a - b), g = K.fitAt(s, xm, disc);
      near(`Power law (${lbl}) at xmin = ${xm}: α (powerlaw)`, g.alpha, ref.alpha, disc ? 1e-4 : 1e-10);
      near(`Power law (${lbl}) at xmin = ${xm}: D (powerlaw)`, g.D, ref.D, disc ? 1e-4 : 1e-10);
    }
  }
  // Bootstrap goodness of fit: a true power law should pass, an exponential tail should fail (seeded, 200 data sets).
  const r0 = S.rng(31), plData = Array.from({ length: 600 }, () => 5 * (1 - r0()) ** (-1 / 1.5)), expData = Array.from({ length: 600 }, () => 5 - 20 * Math.log(1 - r0()));
  const gPl = K.gofBootstrap(plData, K.fitPowerLaw(plData, false), { B: 200, seed: 3 });
  const gEx = K.gofBootstrap(expData, K.fitPowerLaw(expData, false), { B: 200, seed: 3 });
  truthy(`Bootstrap GOF: a pure power law passes (p = ${gPl.p.toFixed(3)} > 0.1)`, gPl.p > 0.1);
  truthy(`Bootstrap GOF: an exponential sample fails (p = ${gEx.p.toFixed(3)} ≤ 0.1)`, gEx.p <= 0.1);
  const f = K.fitPowerLaw(v, true), cmp = K.compareExponential(v, f);
  const s = summary('Concentration', K.summary(c, f, cmp, { p: 0.42, B: 1000 }, bt), ['0.65', '68%']);
  same('Concentration: CSN cited', s.caveats.some((x) => /Clauset, Shalizi and Newman 2009/.test(x)), true);
  summary('Concentration without a power-law fit', K.summary(K.concentration([1, 2, 3, 4, 5, 6, 7, 8, 9, 30]), null, null, null, null), 'Gini');
  same('Concentration: 10 units rated weak', K.summary(K.concentration([1, 2, 3, 4, 5, 6, 7, 8, 9, 30]), null, null, null, null).confidence, 'low');
}

// ── Classifier metrics (scikit-learn, statsmodels cohens_kappa, a naive O(mn) DeLong in numpy) ──
{
  const rows = IN.scores, r = REF.classifier;
  const cells = M.atThreshold(rows, 0.5);
  same('Confusion matrix at 0.5 (sklearn)', cells, r.cells);
  const cm = M.confusion(...cells);
  for (const k of ['precision', 'recall', 'f1', 'accuracy', 'mcc', 'kappa', 'balanced']) near(`${k} (sklearn)`, cm.m[k].est, r[k], 1e-12);
  near("Cohen's kappa SE (statsmodels cohens_kappa std_kappa)", cm.m.kappa.se, r.kappaSe, 1e-6);
  near('F1 delta-method SE (scipy approx_fprime)', cm.m.f1.se, r.f1DeltaSe, 1e-6);
  near('MCC delta-method SE (scipy approx_fprime)', cm.m.mcc.se, r.mccDeltaSe, 1e-6);
  near('F1 SE within 3% of a 20,000-draw multinomial bootstrap', cm.m.f1.se / r.f1BootSe, 1, 0.03);
  near('MCC SE within 3% of the bootstrap', cm.m.mcc.se / r.mccBootSe, 1, 0.03);
  near('Precision Wilson lower (statsmodels)', cm.m.precision.lo, r.precisionWilson[0], 1e-9);
  near('Recall Wilson upper (statsmodels)', cm.m.recall.hi, r.recallWilson[1], 1e-9);
  const rp = M.rocPr(rows), dl = M.delong(rows);
  near('AUC (sklearn roc_auc_score)', rp.auc, r.auc, 1e-12);
  near('AUC from DeLong components', dl.auc, r.delongAuc, 1e-12);
  near('DeLong SE (naive numpy)', dl.se, r.delongSe, 1e-12);
  near('Average precision (sklearn)', rp.ap, r.ap, 1e-12);
  same('ROC points (sklearn roc_curve, drop_intermediate=False)', rp.roc.length, r.rocPoints);
  const tied = [{ s: 1, y: 1 }, { s: 1, y: 0 }, { s: 2, y: 1 }, { s: 0, y: 0 }, { s: 1, y: 1 }, { s: 0.5, y: 0 }];
  near('AUC with ties counts ½ (by hand 13/18... = 0.8333)', M.rocPr(tied).auc, (3 + 2 + 2 + 0.5 + 0.5 + 2 * 0) / 9 + 0 * 0, 1e-12);
  near('Lift = precision / prevalence', cm.m.lift.est, cm.m.precision.est / ((cells[0] + cells[2]) / rows.length), 1e-12);
  const s = summary('Classifier (scores)', M.summary(cm, dl), ['0.885', '0.54']);
  same('Classifier: 60 positives and 180 negatives rated strong', s.confidence, 'high');
  same('Classifier: Hosmer-Lemeshow benchmark cited', s.meaning.some((m) => /Hosmer and Lemeshow \(2000\)/.test(m)), true);
  const weak = M.confusion(5, 5, 5, 5);
  same('Classifier: chance-level matrix rated weak', summary('Classifier, chance level', M.summary(weak)).confidence, 'low');
  same('Classifier: empty class rejected', M.rocPr([{ s: 1, y: 1 }, { s: 2, y: 1 }]), null);
}

// ── Reaction times (scipy exponnorm, numpy, scipy linregress, Wagenmakers et al. 2007) ──
{
  const ez = R.ez(0.802, 0.112, 0.723);
  near('EZ drift v (Wagenmakers et al. 2007 example: 0.0999)', ez.v, 0.0999, 5e-5);
  near('EZ boundary a (paper: 0.1400)', ez.a, 0.14, 5e-5);
  near('EZ non-decision Ter (paper: 0.300)', ez.Ter, 0.3, 5e-4);
  same('EZ: undefined at Pc = 0.5', R.ez(0.5, 0.1, 0.6), null);
  same('EZ: edge correction at Pc = 1 with N = 100 uses 0.995', R.ez(1, 0.05, 0.5, { N: 100 }).Pc, 0.995);
  near('EZ: Pc below 0.5 gives negative drift', Math.sign(R.ez(0.3, 0.1, 0.6).v), -1, 0);
  const fit = R.exGaussian(IN.rtKept), r = REF.rt;
  near('Ex-Gaussian log-likelihood (scipy exponnorm maximum)', fit.logLik, r.logLik, 1e-4);
  near('Ex-Gaussian μ (scipy exponnorm loc)', fit.mu, r.mu, 0.05);
  near('Ex-Gaussian σ (scipy exponnorm scale)', fit.sigma, r.sigma, 0.05);
  near('Ex-Gaussian τ (scipy exponnorm K × scale)', fit.tau, r.tau, 0.05);
  near('Ex-Gaussian density integrates to 1', Array.from({ length: 4000 }, (_, i) => R.exgPdf(i + 0.5, 400, 40, 150)).reduce((a, b) => a + b, 0), 1, 1e-4);
  const raw = IN.rtDist, t = REF.trim;
  same('Trimming: absolute 200 to 2,500 ms removes (numpy)', R.trim(raw, { method: 'absolute', lo: 200, hi: 2500 }).removed, t.absolute);
  same('Trimming: mean ± 2.5 SD removes (numpy)', R.trim(raw, { method: 'sd', k: 2.5 }).removed, t.sd25);
  same('Trimming: median ± 2.5 MAD removes (numpy)', R.trim(raw, { method: 'mad', k: 2.5 }).removed, t.mad25);
  const sl = R.searchSlopes(IN.search);
  for (const f of sl) {
    const ref = REF.search_slopes[f.cond];
    near(`Search slope, ${f.cond} (scipy linregress)`, f.fit.slope, ref.slope, 1e-9);
    near(`Search slope SE, ${f.cond} (scipy linregress)`, f.fit.se, ref.se, 1e-9);
    near(`Search intercept, ${f.cond} (scipy linregress)`, f.fit.intercept, ref.intercept, 1e-8);
  }
  same('Search slopes classified (Wolfe 1998)', sl.map((f) => f.kind), ['efficient', 'inefficient']);
  const d = R.describe(IN.rtKept);
  const ds = summary('Reaction times (distribution)', R.distSummary(d, fit, { method: 'absolute', lo: 200, hi: 2500, removed: 8 }), S.fmt(fit.mu, 0));
  same('RT distribution: 190 trials with a stable fit rated strong', ds.confidence, 'high');
  const ec = R.ezConditions(R.parseTrials(R.exampleEz(), 'ez').rows, { B: 300 });
  near('EZ per condition equals EZ on its summary statistics', ec[0].est.v, R.ez(ec[0].Pc, ec[0].VRT, ec[0].MRT).v, 1e-12);
  truthy('EZ bootstrap interval contains the estimate', ec[0].ci.v[0] < ec[0].est.v && ec[0].est.v < ec[0].ci.v[1]);
  summary('Reaction times (EZ)', R.ezSummary(ec), S.fmt(ec[1].est.v, 3));
  summary('Reaction times (EZ, one condition)', R.ezSummary([{ cond: 'Your data', N: 100, Pc: 0.802, MRT: 0.723, VRT: 0.112, est: ez, ci: null }]), '0.100');
  const ss = summary('Reaction times (search)', R.searchSummary(sl), 'ms/item');
  same('Search summary: Wolfe (1998) cited', ss.meaning.some((m) => /Wolfe \(1998/.test(m)), true);
  same('Ex-Gaussian: fewer than 10 trials rejected', R.exGaussian([300, 320, 340]), null);
}

// ── Risk and harm (statsmodels Table2x2 and confint_proportions_2indep, scipy chi2 and gamma) ──
{
  const t = H.twoByTwo(46, 354, 21, 379), r = REF.risk;
  near('Risk ratio (statsmodels Table2x2)', t.rr.est, r.rr, 1e-12);
  near('Risk ratio 95% lower (statsmodels)', t.rr.lo, r.rrCI[0], 1e-9);
  near('Risk ratio 95% upper (statsmodels)', t.rr.hi, r.rrCI[1], 1e-9);
  near('Odds ratio (statsmodels)', t.or.est, r.or, 1e-12);
  near('Odds ratio 95% lower (statsmodels)', t.or.lo, r.orCI[0], 1e-9);
  near('Odds ratio 95% upper (statsmodels)', t.or.hi, r.orCI[1], 1e-9);
  near('Risk difference Wald lower (statsmodels)', t.rd.lo, r.rdWald[0], 1e-9);
  near('Risk difference Wald upper (statsmodels)', t.rd.hi, r.rdWald[1], 1e-9);
  near('Risk difference Newcombe lower (statsmodels newcomb)', t.rd.nLo, r.rdNewcombe[0], 1e-9);
  near('Risk difference Newcombe upper (statsmodels newcomb)', t.rd.nHi, r.rdNewcombe[1], 1e-9);
  near('Pearson χ² (scipy, no correction)', t.chi2, r.chi2, 1e-9);
  near('χ² p (scipy)', t.p, r.p, 1e-9);
  near('NNH = 1 / RD = 16', t.nn.value, 16, 1e-9);
  near('NNH interval lower = 1 / Newcombe upper', t.nn.lo, 1 / r.rdNewcombe[1], 1e-6);
  near('Attributable fraction among the exposed (RR − 1)/RR', t.afe, (r.rr - 1) / r.rr, 1e-12);
  near('Levin PAF with 50% exposed', t.paf, (0.5 * (r.rr - 1)) / (1 + 0.5 * (r.rr - 1)), 1e-12);
  const small = H.twoByTwo(8, 92, 6, 94);
  near('Small table: Newcombe lower (statsmodels)', small.rd.nLo, r.smallNewcombe[0], 1e-9);
  same('Small table: NNT interval crosses infinity', small.nn.crosses, true);
  const cc = H.twoByTwo(40, 60, 20, 80, { design: 'casecontrol' });
  near("Case-control: Miettinen PAF pc(OR − 1)/OR", cc.paf, (40 / 60) * (cc.or.est - 1) / cc.or.est, 1e-12);
  const z = H.twoByTwo(0, 50, 5, 45);
  near('Zero cell: 0.5 added before the odds ratio (Haldane)', z.or.est, (0.5 * 45.5) / (50.5 * 5.5), 1e-12);
  const ip = H.incidencePrevalence({ newCases: 48, personTime: 1200, atRisk: 1500, existing: 90, population: 1600 });
  near('Incidence rate exact Poisson lower (scipy chi2)', ip.rate.lo * 1200, REF.poisson48[0], 1e-6);
  near('Incidence rate exact Poisson upper (scipy chi2)', ip.rate.hi * 1200, REF.poisson48[1], 1e-6);
  near('Prevalence Wilson lower (statsmodels)', ip.prevalence.lo, REF.prev90[0], 1e-9);
  near('Duration D = P / (I (1 − P))', ip.duration, (90 / 1600) / (0.04 * (1 - 90 / 1600)), 1e-12);
  const st = H.standardise(H.parseStrata(H.EXAMPLE_STRATA).rows), rs = REF.std;
  near('Directly standardised rate A', st.A.est, rs.A[0], 1e-12);
  near('DSR A Fay-Feuer lower (scipy gamma, as epitools)', st.A.lo, rs.A[1], 1e-7);
  near('DSR A Fay-Feuer upper (scipy gamma)', st.A.hi, rs.A[2], 1e-7);
  near('DSR B Fay-Feuer lower', st.B.lo, rs.B[1], 1e-7);
  near('DSR B Fay-Feuer upper', st.B.hi, rs.B[2], 1e-7);
  near('SMR', st.smr.est, rs.smr[0], 1e-12);
  near('SMR exact lower (scipy chi2)', st.smr.lo, rs.smr[1], 1e-7);
  near('SMR exact upper (scipy chi2)', st.smr.hi, rs.smr[2], 1e-7);
  const s = summary('Risk 2×2', H.summary2x2(t, { exp: 'users shown the pre-ticked add-on', unexp: 'users not shown it', out: 'an unwanted-purchase complaint' }), ['2.19', 'NNH 16.0']);
  same('Risk 2×2: confidence (cells ≥ 10, interval excludes 1)', s.confidence, 'high');
  const sm = summary('Risk 2×2, crossing NNT', H.summary2x2(small), '1.33');
  same('Crossing NNT: says the direction is uncertain', sm.meaning.some((m) => /through infinity/.test(m)), true);
  summary('Risk case-control', H.summary2x2(cc), '2.67');
  summary('Incidence and prevalence', H.summaryIP(ip, { newCases: 48, existing: 90 }), '5.6%');
  const ss = summary('Standardisation', H.summaryStd(st, ['App', 'Web']), '0.77');
  same("Standardisation: reversal flagged as Simpson's paradox", ss.meaning.some((m) => /Simpson/.test(m)), true);
}

// ── Queueing (pyworkforce ErlangC; Call Centre Helper worked example; M/M/1 formulas) ──
{
  const r = W.agentsNeeded({ calls: 100, interval: 1800, aht: 180, t: 20, target: 0.8, shrinkage: 0.3 }), ref = REF.erlang;
  near('Erlang C traffic A = 100 × 180 / 1800 = 10 Erlangs', r.A, 10, 1e-12);
  same('Agents needed for 80% in 20 s (pyworkforce; Call Centre Helper: 14)', r.agents, ref.required.raw_positions);
  same('Staff with 30% shrinkage (pyworkforce)', r.staff, ref.required.positions);
  near('Chance of waiting with 11 agents (Call Centre Helper: 68.21%)', r.table[0].C, 0.6821, 5e-5);
  for (const [c, pw, sl, asa] of ref.table) {
    const m = r.table.find((x) => x.c === c);
    near(`Erlang C, ${c} agents: chance of waiting (pyworkforce)`, m.C, pw, 1e-12);
    near(`Erlang C, ${c} agents: service level (pyworkforce)`, m.sl, sl, 1e-12);
    near(`Erlang C, ${c} agents: ASA = C·AHT/(c − A)`, m.ASA, asa, 1e-9);
  }
  const r2 = W.agentsNeeded({ calls: 350, interval: 3600, aht: 270, t: 30, target: 0.9, shrinkage: 0.25, maxOcc: 0.85 });
  same('Agents with an 85% occupancy cap (pyworkforce)', [r2.agents, r2.staff], [REF.erlang2.raw_positions, REF.erlang2.positions]);
  near('Service level with the cap (pyworkforce)', r2.sl, REF.erlang2.service_level, 1e-12);
  near('Erlang B(10, 11) by recursion vs the direct formula', W.erlangB(10, 11), (10 ** 11 / 39916800) / Array.from({ length: 12 }, (_, k) => 10 ** k / [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800][k]).reduce((a, b) => a + b, 0), 1e-12);
  const m = W.mm1(8, 10), rm = REF.mm1;
  near('M/M/1 L', m.L, rm.L, 1e-12); near('M/M/1 Lq', m.Lq, rm.Lq, 1e-12); near('M/M/1 W', m.W, rm.W, 1e-12); near('M/M/1 Wq', m.Wq, rm.Wq, 1e-12);
  near('M/M/1 P(wait > 0.5)', m.pWaitOver(0.5), rm.pOver05, 1e-12);
  same('M/M/1 unstable at ρ ≥ 1', W.mm1(10, 10).stable, false);
  near("Little's law: W = L / λ", W.little({ L: 200, lambda: 40 }).W, 5, 1e-12);
  const s = summary('Erlang C', W.summaryErlang(r, { calls: 100, interval: 1800, aht: 180, t: 20, target: 0.8 }), '14 agents');
  same('Erlang C: rated "some evidence" at 71% occupancy', s.confidence, 'medium');
  summary('M/M/1', W.summaryMM1({ ...m, W: m.W * 60, Wq: m.Wq * 60 }, 'minutes'), '80% utilisation');
  summary("Little's law", W.summaryLittle(W.little({ lambda: 40, W: 5 })), '200 items');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
