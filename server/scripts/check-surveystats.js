// Checks the survey statistics tools (factor analysis, scale validity, key drivers, crosstab explorer) in
// client/src/calc/tools/surveystats*.js against factor_analyzer, semopy, pingouin, relativeImp, statsmodels, scipy and
// numpy, and against published values (Harman 1976; R's factanal). Run with `npm run check:surveystats`.
// Reference values: server/scripts/surveystats-reference.json, from surveystats-reference.py run on the example data
// in surveystats-input.json (written by surveystats-dump.js). Also checks the "Reading your results" summaries.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../client/src/calc/tools/surveystatsMath.js';
import * as F from '../../client/src/calc/tools/surveystatsFactor.js';
import * as V from '../../client/src/calc/tools/surveystatsValidity.js';
import * as K from '../../client/src/calc/tools/surveystatsDrivers.js';
import * as X from '../../client/src/calc/tools/surveystatsCrosstab.js';
import * as D from '../../client/src/calc/tools/surveystatsData.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'surveystats-reference.json'), 'utf8'));
const IN = JSON.parse(readFileSync(path.join(here, 'surveystats-input.json'), 'utf8'));
let fails = 0, passes = 0;
const fmt = (v) => (Array.isArray(v) ? `[${v.map(fmt).join(', ')}]` : Number.isFinite(v) ? String(+v.toFixed(6)) : String(v));
function near(label, got, want, tol = 1e-6) {
  const g = [got].flat(3), w = [want].flat(3);
  const ok = g.length === w.length && g.every((x, i) => Number.isFinite(x) && Math.abs(x - w[i]) <= tol);
  if (ok) passes++; else fails++;
  const worst = g.length === w.length ? Math.max(...g.map((x, i) => Math.abs(x - w[i]))) : NaN;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${fmt(want)}, got ${fmt(got)}${g.length > 1 ? ` (max diff ${worst.toExponential(1)})` : ''}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const calcIds = new Set(CATALOG.map((c) => c.id));
// The same rules check-summaries.js applies to the page's own summaries.
function summary(label, s, key) {
  const all = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && ['high', 'medium', 'low'].includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20
    && !/undefined|NaN|\bnull\b|—|not available/.test(all) && !/\]\(\//.test(s.report)
    && [...all.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)].every((m) => { const [, kind, target] = m[1].split('/'); return kind === 'calculators' ? calcIds.has(target) : kind === 'methods' ? kinds.byId.has(target) : false; })
    && !/(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?true/i.test(all);
  same(`${label}: summary complete, plain, valid links, no NaN, no "% chance the true value" wording`, ok, true);
  if (!ok) console.log(JSON.stringify(s, null, 1));
  for (const k of [].concat(key || [])) truthy(`${label}: headline and report mention "${k}"`, s.headline.includes(k) && s.report.includes(k));
  return s;
}
const colsOf = (X) => X[0].map((_, j) => X.map((r) => r[j]));
const absCols = (A) => A.map((r) => r.map(Math.abs));

// ── Distributions ──
console.log('\n── Distributions ──');
near('Normal CDF Φ(1.959964) (scipy 0.975)', M.phi(1.959963984540054), 0.975, 1e-14);
near('Normal CDF Φ(−6) relative to scipy 9.865876450377e-10 (ratio 1 ± 1e-9)', M.phi(-6) / 9.865876450376946e-10, 1, 1e-9);
near('Normal quantile at .995 (scipy 2.5758293035489)', M.phiInv(0.995), 2.5758293035489004, 1e-12);
near('χ² survival, x = 30, df = 20 (scipy 0.06985366)', M.chi2Sf(30, 20), 0.06985366069940843, 1e-12);
near('Noncentral χ² CDFs (scipy ncx2.cdf)', [M.ncx2Cdf(60, 40, 12.5), M.ncx2Cdf(5, 3, 0.7), M.ncx2Cdf(300, 250, 80)], REF.ncx2, 1e-9);
near('Bivariate normal CDF at five points (scipy multivariate_normal.cdf)', [[0.3, -0.5, 0.4], [-1.2, 0.8, -0.7], [1.5, 1.1, 0.95], [0.2, 0.1, -0.96], [-0.4, -0.9, 0.2]].map(([h, k, r]) => M.bvnCdf(h, k, r)), REF.bvn, 2e-6);
near('Two-sided t p, t = 2.5, df = 12 (scipy 2·t.sf = 0.0279154)', M.tP(2.5, 12), 0.02791539957132524, 1e-12);
near('Holm adjustment (statsmodels multipletests)', M.holm([0.01, 0.04, 0.03, 0.005]), [0.03, 0.06, 0.06, 0.02], 1e-15);

// ── Factor analysis ──
console.log('\n── Factor analysis: Harman (1976) eight physical variables, n = 305 ──');
const H = IN.harman.R, nH = IN.harman.n;
const hc = F.checks(H, nH);
near('KMO (numpy formula)', hc.kmo, REF.h_kmo, 1e-10);
near('Per-item MSA (numpy formula)', hc.msa, REF.h_msa, 1e-10);
near("Bartlett's χ² and p (numpy formula)", [hc.bartlett.chi2, hc.bartlett.p], [REF.h_bartlett[0], REF.h_bartlett[2]], 1e-8);
near('Eigenvalues of R (numpy eigvalsh)', F.eigenvalues(H), REF.h_eig, 1e-10);
const hmin = F.efa(H, nH, 2, { method: 'minres', rotation: 'none' });
near('Minres loadings, 2 factors (tight scipy L-BFGS-B fit of the ULS objective)', hmin.pattern, REF.h_minres, 2e-6);
near('Minres loadings (factor_analyzer 0.5.1, its default tolerance)', hmin.pattern, REF.h_fa_minres, 1e-5);
near('Minres loadings, Harman (1976) published minres solution to 3 decimals', hmin.pattern.map((r) => r.map((v) => +v.toFixed(3))), [[0.856, -0.324], [0.848, -0.411], [0.808, -0.409], [0.831, -0.342], [0.750, 0.571], [0.631, 0.492], [0.569, 0.510], [0.607, 0.351]], 1e-9);
const hml = F.efa(H, nH, 2, { method: 'ml', rotation: 'none' });
near('ML loadings, 2 factors (tight scipy fit of the factanal objective)', hml.pattern, REF.h_ml, 2e-6);
near('ML loadings (factor_analyzer)', hml.pattern, REF.h_fa_ml, 1e-4);
near("ML test: χ² = 75.74 on 13 df, p = 6.94e-11 as in R's factanal(covmat = Harman, factors = 2)", [hml.mlTest.chi2, hml.mlTest.df, hml.mlTest.p], REF.h_ml_test, 1e-6);
const hpaf = F.efa(H, nH, 2, { method: 'paf', rotation: 'none' });
near('Principal axis, SPSS rules (25 iterations, .001), numpy', hpaf.pattern, REF.h_paf, 1e-9);
same('Principal axis iterations to converge (numpy)', hpaf.iter, REF.h_paf_iter);
const hpaf2 = F.efa(H, nH, 2, { method: 'paf', rotation: 'none', pafIter: 1000 });
near('Principal axis iterated to convergence equals minres (ULS)', hpaf2.pattern, REF.h_minres, 1e-3);
const hmap = F.mapTest(H);
near("Velicer's MAP average squared partials (numpy)", hmap.avgSq, REF.h_map[0], 1e-10);
near("Velicer's MAP fourth-power partials (numpy)", hmap.avg4, REF.h_map[1], 1e-10);
same('MAP suggestion (squared, fourth power)', [hmap.k, hmap.k4], [REF.h_map[2], REF.h_map[3]]);
const unrotH = F.minresOrMl(H, 2, 'minres').L;
for (const rot of ['varimax', 'promax', 'oblimin']) {
  const r = F.efa(H, nH, 2, { method: 'minres', rotation: rot });
  near(`${rot}: pattern loadings (factor_analyzer Rotator on the same unrotated loadings)`, r.pattern, REF[`h_${rot}`], 2e-5);
  if (REF[`h_${rot}_phi`]) { near(`${rot}: factor correlation (factor_analyzer)`, r.Phi, REF[`h_${rot}_phi`], 2e-5); near(`${rot}: structure matrix = pattern × Φ`, r.structure, REF[`h_${rot}_structure`], 2e-5); }
}
truthy('Varimax keeps communalities (rotation does not change h²)', F.varimax(unrotH).L.every((r, i) => Math.abs(r[0] ** 2 + r[1] ** 2 - hmin.h2[i]) < 1e-10));
near('Oblimin end to end vs factor_analyzer (minres + oblimin, default tolerances)', F.efa(H, nH, 2, { method: 'minres', rotation: 'oblimin' }).pattern, REF.h_fa_oblimin_end_to_end, 2e-3);

console.log('\n── Factor analysis: the 12-item example survey (n after listwise deletion) ──');
const Xfa = IN.fa.X, Rfa = M.corrMatrix(colsOf(Xfa)), nfa = Xfa.length;
const fc = F.checks(Rfa, nfa);
near('KMO (factor_analyzer calculate_kmo)', fc.kmo, REF.fa_kmo, 1e-10);
near('Per-item MSA (factor_analyzer)', fc.msa, REF.fa_msa, 1e-10);
near("Bartlett's χ² (factor_analyzer calculate_bartlett_sphericity)", fc.bartlett.chi2, REF.fa_bartlett[0], 1e-7);
near('Determinant of R (numpy)', fc.det, REF.fa_det, 1e-12);
near('Initial communalities, squared multiple correlations (numpy)', fc.smc, REF.fa_smc, 1e-10);
const fmap = F.mapTest(Rfa);
near("MAP test (numpy)", fmap.avgSq, REF.fa_map[0], 1e-10);
same('MAP suggestion', fmap.k, REF.fa_map[2]);
const sim = F.parallelSim(nfa, 12, { iters: 500, seed: 2024 });
near('Parallel analysis: mean simulated component eigenvalues within ±0.01 of 3,000 numpy draws', sim.pcaMean, REF.fa_parallel.pcaMean, 0.01);
near('Parallel analysis: 95th percentile within ±0.03 of numpy', sim.pca95, REF.fa_parallel.pca95, 0.03);
near('Parallel analysis: mean factor (SMC-reduced) eigenvalues within ±0.01', sim.faMean, REF.fa_parallel.faMean, 0.01);
const obsE = F.eigenvalues(Rfa);
same('Parallel analysis suggests 3 factors, the same as with numpy\'s draws', [F.parallelK(obsE, sim.pca95), F.parallelK(obsE, REF.fa_parallel.pca95)], [3, 3]);
for (const [m, ref, tol] of [['minres', REF.fa_minres, 2e-6], ['ml', REF.fa_ml, 2e-6], ['paf', REF.fa_paf, 1e-9]]) near(`${m} loadings, 3 factors (reference fit)`, F.efa(Rfa, nfa, 3, { method: m, rotation: 'none' }).pattern, ref, tol);
near('minres loadings (factor_analyzer)', F.efa(Rfa, nfa, 3, { method: 'minres', rotation: 'none' }).pattern, REF.fa_fa_minres, 1e-4);
same('Principal axis iterations, SPSS rules (numpy)', F.efa(Rfa, nfa, 3, { method: 'paf', rotation: 'none' }).iter, REF.fa_paf_iter);
near('ML χ² test of 3 factors (factanal formula, numpy)', (() => { const t = F.efa(Rfa, nfa, 3, { method: 'ml', rotation: 'none' }).mlTest; return [t.chi2, t.df, t.p]; })(), REF.fa_ml_test, 1e-5);
const fobl = F.efa(Rfa, nfa, 3, { method: 'minres', rotation: 'oblimin' });
for (const rot of ['varimax', 'promax', 'oblimin']) {
  const r = F.efa(Rfa, nfa, 3, { method: 'minres', rotation: rot });
  near(`${rot}, 3 factors: |pattern| (factor_analyzer Rotator)`, absCols(r.pattern), absCols(REF[`fa_${rot}`]), 5e-5);
  if (REF[`fa_${rot}_phi`]) near(`${rot}: |factor correlations|`, absCols(r.Phi), absCols(REF[`fa_${rot}_phi`]), 5e-5);
}
const flags = F.itemFlags(fobl.pattern);
same('Item assignment by largest pattern loading: Ease, Trust, Appeal, Habit → factor 1', flags.map((f) => f.factor), [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 0]);
same('The .40/.30/.20 rule flags the weak "Habit" item and the cross-loading "Appeal 3"', flags.map((f, i) => (f.clean ? null : `${i}:${f.flags.join('+')}`)).filter(Boolean), ['10:cross+close', '11:weak']);
const alphas = F.alphaPerFactor({ X: Xfa, R: Rfa }, flags, 3);
near("Cronbach's alpha per factor (pingouin cronbach_alpha on the assigned items)", alphas.map((a) => a.alpha), REF.fa_alpha, 1e-10);
same('Items in each alpha (loading ≥ .40; Appeal 3 kept on Appeal)', alphas.map((a) => a.items), [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10]]);
const catCols = IN.fa.cats; // one array of category positions per item
near('Polychoric correlations for three item pairs (two-step ML with scipy)', [[0, 1], [0, 4], [8, 11]].map(([a, b]) => F.polychoric(catCols[a], catCols[b]).rho), REF.polychoric, 2e-5);
truthy('Polychoric exceeds Pearson for the 5-point items (attenuation)', F.polychoric(catCols[0], catCols[1]).rho > Rfa[0][1]);
const pm = F.polychoricMatrix(catCols.slice(0, 5));
truthy('Polychoric matrix is a proper correlation matrix (unit diagonal, positive definite)', pm.R.every((r, i) => r[i] === 1) && M.eigen(pm.R).values.at(-1) > 0);
const harmTxt = F.parseCorrMatrix(D.readTable(D.harmanText()).table);
near('A pasted correlation matrix reads back exactly', harmTxt.R, H, 1e-12);

const sFA = summary('Factor analysis', F.faSummary({ chk: fc, k: 3, kPA: 3, kMAP: fmap.k, r: fobl, flags, alphas, names: IN.fa.names }), '3 factors');
same('FA summary: example rated "medium" (Appeal has only 2 clean items once Appeal 3 cross-loads)', sFA.confidence, 'medium');
truthy('FA summary: warns factors are not real constructs until validated', sFA.caveats.some((c) => /not proven constructs/.test(c)));
truthy('FA summary: names the flagged items', sFA.meaning.some((m) => m.includes('Habit') && m.includes('Appeal 3')));
const sFAh = summary('Factor analysis (Harman matrix)', F.faSummary({ chk: hc, k: 2, kPA: 2, kMAP: 2, r: F.efa(H, nH, 2, {}), flags: F.itemFlags(F.efa(H, nH, 2, {}).pattern), alphas: F.alphaPerFactor({ R: H }, F.itemFlags(F.efa(H, nH, 2, {}).pattern), 2), names: IN.harman.names, source: 'matrix' }), '2 factors');
truthy('FA summary with only a matrix mentions it cannot check the raw data', sFAh.caveats.some((c) => /correlation matrix/.test(c)));
const small = F.checks(Rfa, 80);
same('FA summary: n = 80 is rated "low"', F.faSummary({ chk: small, k: 3, kPA: 3, kMAP: 3, r: fobl, flags, alphas, names: IN.fa.names }).confidence, 'low');

// ── Scale validity ──
console.log('\n── Scale validity: the technology acceptance example (n = 280) ──');
const Xsv = IN.sv.X, Rsv = M.corrMatrix(colsOf(Xsv)), nsv = Xsv.length, groups = IN.sv.groups.map((g) => g.items);
const cf = V.cfa(Rsv, nsv, groups);
truthy('CFA converged', cf.converged);
near('Standardised loadings (semopy, ML; semopy stops slightly earlier)', cf.std, REF.sv_semopy.std, 5e-4);
near('Construct correlations (semopy)', cf.Phi, REF.sv_semopy.phi, 5e-4);
near('ML discrepancy F (semopy MLW objective)', cf.F, REF.sv_semopy.fun, 1e-5);
truthy("This fit reaches a discrepancy at least as low as semopy's (the small differences are semopy's stopping rule)", cf.F <= REF.sv_semopy.fun + 1e-12);
same('Degrees of freedom (semopy)', [cf.df, cf.dfb], [REF.sv_semopy.dof, REF.sv_semopy.dof_base]);
near('Baseline χ² over n (semopy uses n·F, this tool (n − 1)·F)', cf.chi2b / (nsv - 1), REF.sv_semopy.chi2_base / nsv, 1e-6);
const fsem = V.fitIndices({ chi2: REF.sv_semopy.chi2, df: REF.sv_semopy.dof, n: nsv, chi2b: REF.sv_semopy.chi2_base, dfb: REF.sv_semopy.dof_base });
near("CFI, TLI and RMSEA from semopy's χ² match semopy's own indices", [fsem.cfi, fsem.tli, fsem.rmsea], [REF.sv_semopy.cfi, REF.sv_semopy.tli, REF.sv_semopy.rmsea], 1e-9);
const stats = groups.map((g) => V.constructStats(g.map((i) => cf.std[i])));
near('Composite reliability (numpy on semopy loadings)', stats.map((s) => s.cr), REF.sv_cr, 5e-4);
near('AVE (numpy on semopy loadings)', stats.map((s) => s.ave), REF.sv_ave, 5e-4);
near('Coefficient H (numpy on semopy loadings)', stats.map((s) => s.h), REF.sv_h, 5e-4);
const statsSem = groups.map((g) => V.constructStats(g.map((i) => REF.sv_semopy.std[i])));
near("CR, AVE and H formulas on semopy's own loadings (numpy, exact)", statsSem.map((s) => [s.cr, s.ave, s.h]), REF.sv_cr.map((c, i) => [c, REF.sv_ave[i], REF.sv_h[i]]), 1e-12);
const ht = V.htmt(Rsv, groups).htmt;
near('HTMT matrix (numpy)', ht, REF.sv_htmt, 1e-12);
const typed = V.parseLoadings(D.SV_LOADINGS_TEXT).constructs.map((c) => V.constructStats(c.loadings));
near('Typed loadings: CR, AVE, H (numpy)', typed.map((s) => [s.cr, s.ave, s.h]), REF.sv_typed, 1e-12);
near('CR by hand for .7, .7, .7: 2.1² / (2.1² + 1.53) = .7424', V.compositeReliability([0.7, 0.7, 0.7]), 4.41 / (4.41 + 1.53), 1e-12);
for (const [i, c] of REF.fit_cases.entries()) {
  const f = V.fitIndices({ chi2: c.args[0], df: c.args[1], n: c.args[2], chi2b: c.args[3], dfb: c.args[4] });
  near(`Fit case ${i + 1}: RMSEA, 90% CI (scipy ncx2 + brentq), p-close, CFI, TLI, p`, [f.rmsea, f.rmseaLo, f.rmseaHi, f.pclose, f.cfi, f.tli, f.p], [c.rmsea, c.lo, c.hi, c.pclose, c.cfi, c.tli, c.p], 1e-7);
}
const fl = V.fornellLarcker(stats, cf.Phi);
same('Fornell-Larcker: no pair fails in the example', fl.fails.length, 0);
const svS = summary('Scale validity (raw data)', V.validitySummary({ names: IN.sv.groups.map((g) => g.name), stats, Phi: cf.Phi, fl, ht, fit: cf.fit, n: nsv, mode: 'raw', cfaOk: cf.converged }), 'below .85');
truthy('Validity summary headline: 4 of 4 constructs show convergent validity', svS.headline.startsWith('4 of 4 constructs'));
same('Validity summary: example rated "high" (n ≥ 200, 3+ items, CFI ≥ .95, SRMR ≤ .08)', svS.confidence, 'high');
truthy('Validity summary: HTMT caveat about reflective constructs', svS.caveats.some((c) => /reflective/.test(c)));
truthy('Validity summary: cites Henseler, Ringle & Sarstedt 2015 and Hu & Bentler 1999', /Henseler, Ringle & Sarstedt 2015/.test(svS.meaning.join(' ')) && /Hu & Bentler/.test(svS.meaning.join(' ')));
const badPhi = [[1, 0.9], [0.9, 1]], badStats = [V.constructStats([0.7, 0.72, 0.68]), V.constructStats([0.6, 0.55])];
const s2 = summary('Scale validity (typed, overlapping)', V.validitySummary({ names: ['A', 'B'], stats: badStats, Phi: badPhi, fl: V.fornellLarcker(badStats, badPhi), mode: 'typed' }), 'Fornell-Larcker');
truthy('Overlapping constructs: headline says some pairs fail', s2.headline.includes('some pairs fail'));
same('Typed loadings with a 2-item construct are rated "low"', s2.confidence, 'low');
summary('Fit index calculator', V.fitSummary(V.fitIndices({ chi2: 85.3, df: 48, n: 250, chi2b: 1450.2, dfb: 66 })), 'RMSEA = 0.056');

// ── Key drivers ──
console.log('\n── Key driver analysis: the likelihood-to-recommend example (n = 400) ──');
const Xkd = IN.kd.X, y = Xkd.map((r) => r[0]), Xd = Xkd.map((r) => r.slice(2));
const o = K.ols(y, Xd);
near('OLS coefficients (statsmodels)', o.b, REF.kd_ols.b, 1e-10);
near('OLS standard errors (statsmodels)', o.se, REF.kd_ols.se, 1e-10);
near('OLS p-values (statsmodels)', o.pv, REF.kd_ols.p, 1e-10);
near('OLS 95% intervals (statsmodels conf_int)', [o.lo, o.hi], [REF.kd_ols.lo, REF.kd_ols.hi], 1e-8);
near('R², adjusted R², F and its p (statsmodels)', [o.r2, o.adjR2, o.F, o.Fp], [REF.kd_ols.r2, REF.kd_ols.adj, REF.kd_ols.F, REF.kd_ols.Fp], 1e-9);
near('VIF (statsmodels variance_inflation_factor)', o.vif, REF.kd_vif, 1e-9);
near('Standardised betas (numpy)', o.beta, REF.kd_beta, 1e-10);
const Rk = M.corrMatrix([y, ...colsOf(Xd)]), Rxx = Rk.slice(1).map((r) => r.slice(1)), rxy = Rk.slice(1).map((r) => r[0]);
const rw = K.relativeWeights(Rxx, rxy);
near("Johnson's relative weights (relativeImp package)", rw.raw, REF.kd_rw, 1e-10);
near('Relative weights add up to R²', rw.r2, o.r2, 1e-10);
const dom = K.olsDominance(Rxx, rxy);
near('General dominance (Shapley over all 128 subsets, numpy itertools)', dom.general, REF.kd_dom, 1e-12);
near('General dominance adds up to R²', dom.general.reduce((a, b) => a + b, 0), o.r2, 1e-12);
const sampled = K.dominanceSampled(7, (m) => K.r2Subset(Rxx, rxy, [0, 1, 2, 3, 4, 5, 6].filter((j) => m & (1 << j))), { perms: 4000 });
near('Sampled Shapley (used above 12 drivers) within ±0.004 of the exact values', sampled.general, REF.kd_dom, 0.004);
// Budescu (1993)-style worked example: with uncorrelated drivers, general dominance equals each squared correlation.
near('Uncorrelated drivers: dominance = r² and relative weights = r² (Budescu 1993; Johnson 2000)', [K.olsDominance([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.5, 0.3, 0.1]).general, K.relativeWeights([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.5, 0.3, 0.1]).raw], [[0.25, 0.09, 0.01], [0.25, 0.09, 0.01]], 1e-12);
// Two drivers: dominance splits the shared part equally, by hand.
const r2ab = K.r2Subset([[1, 0.5], [0.5, 1]], [0.6, 0.4], [0, 1]);
near('Two drivers by hand: GD_A = ½[r_A² + (R² − r_B²)]', K.olsDominance([[1, 0.5], [0.5, 1]], [0.6, 0.4]).general[0], 0.5 * (0.36 + r2ab - 0.16), 1e-12);
const yb = y.map((v) => (v >= 9 ? 1 : 0));
const lg = K.logistic(yb, Xd);
near('Logistic coefficients (statsmodels Logit)', lg.b, REF.kd_logit.b, 1e-7);
near('Logistic standard errors (statsmodels)', lg.se, REF.kd_logit.se, 1e-7);
near("McFadden's pseudo-R² and log-likelihoods (statsmodels prsquared, llf, llnull)", [lg.mcFadden, lg.ll, lg.ll0], [REF.kd_logit.mcf, REF.kd_logit.llf, REF.kd_logit.llnull], 1e-8);
near('Dominance on McFadden R², first four drivers (statsmodels fits of all 16 subsets)', K.logisticDominance(yb, Xd.map((r) => r.slice(0, 4))).general, REF.kd_logit_dom4, 1e-8);
const means = colsOf(Xd).map(M.mean), ip = K.ipa(IN.kd.names.slice(2), means, dom.share);
same('IPA quadrants (example)', ip.points.map((q) => q.quad), ip.points.map((q) => (q.y >= ip.my ? (q.x < ip.mx ? 'fix' : 'keep') : (q.x < ip.mx ? 'low' : 'overkill'))));
truthy('IPA: Reliability (high importance, low rating) lands in "Fix first"', ip.points.find((q) => q.name === 'Reliability').quad === 'fix');
const kdS = summary('Key drivers', K.driverSummary({ outcome: 'Likelihood to recommend (0-10)', names: IN.kd.names.slice(2), imp: dom.share, method: 'dominance analysis', fit: o.r2, vif: o.vif, n: y.length, quads: ip.points }), 'Ease of use');
same('Drivers summary: example rated "high" (n = 400, 57 per driver, VIF < 5)', kdS.confidence, 'high');
truthy('Drivers summary: says importance is not causation', kdS.caveats.some((c) => /not causation/.test(c)));
summary('Key drivers (logistic)', K.driverSummary({ outcome: 'Promoter (9-10)', names: IN.kd.names.slice(2, 6), imp: K.logisticDominance(yb, Xd.map((r) => r.slice(0, 4))).share, method: 'dominance analysis', fit: lg.mcFadden, vif: [1.2, 1.3, 1.1, 1.2], n: 40, quads: [], logisticFit: true }), 'McFadden R²');

// ── Crosstabs ──
console.log('\n── Crosstab explorer ──');
const lay = IN.ct.onboardingByDevice, pooled = X.collapse(lay);
const xp = X.chiSquare(pooled);
near('2 × 2 χ², p, Yates χ² and p (scipy chi2_contingency)', [xp.chi2, xp.p, xp.yates, xp.yatesP], [REF.ct_pooled.chi2, REF.ct_pooled.p, REF.ct_pooled.yates, REF.ct_pooled.yatesP], 1e-9);
near("Fisher's exact p (scipy fisher_exact)", X.exactTest(pooled).p, REF.ct_pooled.fisher, 1e-9);
near('Adjusted residuals (statsmodels Table.standardized_resids)', xp.adj, REF.ct_pooled.resid, 1e-10);
for (const nm of ['tenure', 'plan']) {
  const T = nm === 'tenure' ? IN.ct.tenureSat.N : IN.ct.planSat.N, r = REF[`ct_${nm}`], x = X.chiSquare(T);
  near(`${nm} × satisfaction: χ², p, df (scipy)`, [x.chi2, x.p, x.df], [r.chi2, r.p, r.df], 1e-9);
  near(`${nm}: expected counts (scipy)`, x.E, r.E, 1e-10);
  near(`${nm}: G² and p (scipy, log-likelihood)`, [x.g2, x.gp], [r.g2, r.gp], 1e-9);
  near(`${nm}: adjusted residuals (statsmodels)`, x.adj, r.resid, 1e-10);
  near(`${nm}: Holm-adjusted cell p (statsmodels multipletests)`, x.holmP.flat(), r.holm, 1e-10);
  const cv = X.cramerV(x.chi2, x.n, T.length, T[0].length);
  near(`${nm}: Cramér's V (scipy contingency.association)`, cv.v, r.cramer, 1e-12);
  near(`${nm}: Cramér's V 95% CI (noncentral χ², scipy ncx2 + brentq)`, [cv.lo, cv.hi], r.v_ci, 1e-7);
  near(`${nm}: linear-by-linear z = √M² (statsmodels test_ordinal_association) and p`, [X.linearByLinear(T).z, X.linearByLinear(T).p], [r.lbl_z, r.lbl_p], 1e-8);
}
const cm = X.cmh(lay);
near('CMH: Mantel-Haenszel odds ratio, SE(log), CI (statsmodels StratifiedTable, RGB)', [cm.or, cm.seLog, cm.lo, cm.hi], [REF.ct_cmh.or_, REF.ct_cmh.se, ...REF.ct_cmh.ci], 1e-9);
near('CMH χ² and p, uncorrected; corrected χ² (statsmodels test_null_odds)', [cm.chi2, cm.p, cm.chi2c], [REF.ct_cmh.chi2, REF.ct_cmh.p, REF.ct_cmh.chi2c], 1e-9);
near('Breslow-Day and Tarone χ² and p (statsmodels test_equal_odds)', [cm.bd, cm.bdP, cm.tarone, cm.taroneP], [REF.ct_cmh.bd, REF.ct_cmh.bdp, REF.ct_cmh.tarone, REF.ct_cmh.taronep], 1e-8);
const cm3 = X.cmh([[[12, 5], [6, 14]], [[4, 9], [10, 8]], [[20, 6], [7, 9]]]);
near('Three strata: MH OR, CI, CMH χ², Breslow-Day, Tarone (statsmodels)', [cm3.or, cm3.lo, cm3.hi, cm3.chi2, cm3.bd, cm3.tarone], [REF.ct_cmh3.or_, ...REF.ct_cmh3.ci, REF.ct_cmh3.chi2, REF.ct_cmh3.bd, REF.ct_cmh3.tarone], 1e-8);
const sp = X.simpsonCheck(lay);
truthy("Simpson's paradox detected: pooled OR < 1 but MH OR > 1", sp.reversal && sp.pooled < 1 && sp.adjusted > 1);
near('Pooled odds ratio by hand: (202·140)/(160·325)', sp.pooled, (202 * 140) / (160 * 325), 1e-12);
near('Freeman-Halton exact p, sparse 2 × 4 table (full enumeration in Python)', X.freemanHalton([[3, 1, 0, 4], [1, 5, 6, 1]]).p, REF.ct_fh24, 1e-10);
near('Freeman-Halton also handles the transposed 4 × 2 table', X.freemanHalton([[3, 1], [1, 5], [0, 6], [4, 1]]).p, REF.ct_fh24, 1e-10);
near("Fisher's exact on a small 2 × 2 (scipy)", X.exactTest([[3, 9], [7, 2]]).p, REF.ct_fisher22, 1e-10);
const mc = X.monteCarloExact([[3, 1, 0, 4], [1, 5, 6, 1]], { B: 20000, seed: 7 });
near('Monte Carlo exact p within ±0.003 of the exact Freeman-Halton p', mc.p, REF.ct_fh24, 0.003);
const ctab = X.crossTable(['a', 'b', 'a', 'c'], ['x', 'y', 'y', 'x'], ['c', 'b', 'a']);
same('crossTable uses a given level order', [ctab.rows, ctab.cols, ctab.N], [['c', 'b', 'a'], ['x', 'y'], [[1, 0], [0, 1], [1, 1]]]);
const tabP = { rows: ['New', 'Old'], cols: ['Yes', 'No'], N: pooled };
const cvP = X.cramerV(xp.chi2, xp.n, 2, 2);
const ctS = summary('Crosstab (Simpson)', X.crosstabSummary({ rowName: 'Onboarding', colName: 'Completed set-up', layerName: 'Device', tab: tabP, x: xp, cv: cvP, exact: X.exactTest(pooled), cm, simpson: sp, layers: X.layerStats(lay) }), "Simpson's paradox");
same('Crosstab summary with a reversal is capped at "medium"', ctS.confidence, 'medium');
const tT = IN.ct.tenureSat, xT = X.chiSquare(tT.N);
const ctS2 = summary('Crosstab (ordinal)', X.crosstabSummary({ rowName: 'Tenure', colName: 'Satisfaction', tab: tT, x: xT, cv: X.cramerV(xT.chi2, xT.n, 4, 5), trend: X.linearByLinear(tT.N) }), `χ²(12) = ${xT.chi2.toFixed(2)}`);
truthy('Ordinal crosstab headline: "are associated"', ctS2.headline.includes('are associated'));
truthy('Crosstab summary: mentions the trend and the large-n caveat or effect size', ctS2.meaning.some((m) => /linear-by-linear/.test(m)) && ctS2.caveats.some((c) => /not how strongly|trivial/.test(c)));
const big = [[520, 480], [480, 520]], xb = X.chiSquare(big.map((r) => r.map((v) => v * 2)));
truthy('Large-n caveat: 4,000 respondents with a 52/48 split warns the χ² can be trivial', X.crosstabSummary({ rowName: 'A', colName: 'B', tab: { rows: ['a', 'b'], cols: ['x', 'y'], N: big }, x: xb, cv: X.cramerV(xb.chi2, xb.n, 2, 2) }).caveats[0].includes('trivial'));

// ── Example data and column typing ──
console.log('\n── Example data ──');
const exFA = D.readTable(D.exampleFactorSurvey());
same('Factor example: Respondent ignored, Plan nominal, 12 items ordinal (cluster.js guessColumns)', exFA.cols.map((c) => c.type), ['ignore', 'nominal', ...new Array(12).fill('ordinal')]);
const exCT = D.readTable(D.exampleCrosstab());
same('Crosstab example: Tenure and Satisfaction recognised as ordered, in the right order', [exCT.cols[5].type, exCT.cols[5].levels, exCT.cols[6].type, exCT.cols[6].levels[0]], ['ordinal', ['Under 1 month', '1-6 months', '6-12 months', '12+ months'], 'ordinal', 'Very dissatisfied']);
const exKD = D.readTable(D.exampleDrivers());
same('Drivers example: NPS 0–10 and the 1–5 ratings are ordinal numbers', exKD.cols.slice(1).map((c) => c.type), new Array(9).fill('ordinal'));
const map = V.parseMapping('Usefulness: PU1, pu2 ,PU9\nEase: EOU1', ['PU1', 'PU2', 'EOU1']);
same('Mapping parser: case-insensitive, reports unknown items', [map.groups.map((g) => g.items), map.unknown], [[[0, 1], [2]], ['PU9']]);
same('Loadings parser rejects a loading of 1.2', V.parseLoadings('A: .7, 1.2, .6').bad, [1]);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
