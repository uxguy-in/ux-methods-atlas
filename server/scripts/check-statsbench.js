// Checks the statistics workbench tools (regression, moderation and mediation, resampling, distribution check,
// survival, test selector) against statsmodels, pingouin, scipy and lifelines (server/scripts/statsbench-reference.py
// → statsbench-reference.json), replays of the browser's own bootstrap resamples in numpy, and hand calculations.
// Also checks every "Reading your results" summary and every link the test selector can recommend.
// Run with `npm run check:statsbench`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../client/src/calc/tools/statsbench-core.js';
import * as G from '../../client/src/calc/tools/statsbench-regression.js';
import * as M from '../../client/src/calc/tools/statsbench-mediation.js';
import * as RS from '../../client/src/calc/tools/statsbench-resampling.js';
import * as D from '../../client/src/calc/tools/statsbench-distribution.js';
import * as SV from '../../client/src/calc/tools/statsbench-survival.js';
import * as TS from '../../client/src/calc/tools/statsbench-selector.js';
import * as E from '../../client/src/calc/tools/statsbench-examples.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'statsbench-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'statsbench-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-6) {
  const ok = Number.isFinite(got) && Number.isFinite(want) ? Math.abs(got - want) <= tol : got === want;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toFixed(9) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
// Largest absolute difference across arrays, reported as one check.
function nearAll(label, got, want, tol) {
  const gap = want.reduce((m, w, i) => Math.max(m, Math.abs(got[i] - w)), 0);
  const ok = got.length === want.length && Number.isFinite(gap) && gap <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${want.length} values, largest difference ${gap.toExponential(2)} (tolerance ${tol}); first expected ${want[0]}, got ${got[0]}`);
}
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, key) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity, n/a or empty values`, /NaN|undefined|Infinity|\bnull\b(?! hypothesis)|n\/a|—/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const m of text.matchAll(/\]\(\/calculators\/([a-z0-9-]+)\)/g)) truthy(`${label}: link to /calculators/${m[1]} is a real or batch-2 calculator`, calcIds.has(m[1]) || TS.BATCH2[m[1]]);
  if (key) for (const k of [].concat(key)) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}
const calcIds = new Set(CATALOG.map((c) => c.id));

// ── mulberry32 port ──
same('Python port of mulberry32 replays the browser generator (seed 1, six draws)', REF.mulberry_ok, true);

// ── Multiple linear regression: statsmodels OLS, OLSInfluence, VIF, Breusch-Pagan, Durbin-Watson ──
const tab = C.parseTable(E.REGRESSION_EXAMPLE);
same('Table parsing: column types and levels', tab.cols.map((c) => [c.name, c.numeric, c.numeric ? null : c.levels.length, c.missing]).slice(1), [['plan', false, 3, 0], ['tenure_months', true, null, 0], ['ease', true, null, 2], ['tasks_per_week', true, null, 0], ['satisfaction', true, null, 0], ['renewed', false, 2, 0], ['recommend', false, 3, 0], ['support_tickets', true, null, 0]]);
const preds = [{ name: 'plan', type: 'cat' }, { name: 'tenure_months' }, { name: 'ease' }, { name: 'tasks_per_week' }];
const dm = C.designMatrix(tab, 'satisfaction', preds);
same('Design matrix: treatment dummies with Free as reference, 2 rows dropped for missing ease', [dm.names, dm.dropped], [['Intercept', 'plan: Pro', 'plan: Team', 'tenure_months', 'ease', 'tasks_per_week'], 2]);
const lin = G.fitLinear(dm.X, dm.y, dm.names);
const O = REF.ols;
nearAll('OLS coefficients (statsmodels)', lin.coefs.map((c) => c.b), O.b, 1e-10);
nearAll('OLS standard errors (statsmodels)', lin.coefs.map((c) => c.se), O.se, 1e-10);
nearAll('OLS t values (statsmodels)', lin.coefs.map((c) => c.t), O.t, 1e-8);
nearAll('OLS p-values (statsmodels)', lin.coefs.map((c) => c.p), O.p, 1e-9);
nearAll('OLS 95% CI lower (statsmodels)', lin.coefs.map((c) => c.lo), O.lo, 1e-8);
nearAll('OLS 95% CI upper (statsmodels)', lin.coefs.map((c) => c.hi), O.hi, 1e-8);
nearAll('Standardised betas (OLS on z-scored columns)', lin.coefs.slice(1).map((c) => c.beta), O.beta, 1e-10);
near('R² (statsmodels)', lin.r2, O.r2, 1e-12);
near('Adjusted R² (statsmodels)', lin.adjR2, O.adj, 1e-12);
near('F statistic (statsmodels)', lin.F, O.F, 1e-8);
near('F test p (statsmodels)', lin.pF, O.pF, 1e-12);
near('Log-likelihood (statsmodels)', lin.ll, O.llf, 1e-8);
near('AIC (statsmodels convention)', lin.aic, O.aic, 1e-8);
near('BIC (statsmodels convention)', lin.bic, O.bic, 1e-8);
nearAll('Leverage, first 5 people (OLSInfluence)', lin.leverage.slice(0, 5), O.lev, 1e-12);
nearAll('Internally studentised residuals, first 5 (OLSInfluence)', lin.stdResid.slice(0, 5), O.stud, 1e-10);
nearAll("Cook's distance, first 5 (OLSInfluence)", lin.cooks.slice(0, 5), O.cooks, 1e-12);
near("Largest Cook's distance (OLSInfluence)", Math.max(...lin.cooks), O.cooksMax, 1e-12);
nearAll('VIF (statsmodels variance_inflation_factor)', lin.vif.map((v) => v.vif), O.vif, 1e-9);
near('Breusch-Pagan LM, Koenker studentised (statsmodels het_breuschpagan)', lin.bp.stat, O.bp, 1e-8);
near('Breusch-Pagan p (statsmodels)', lin.bp.p, O.bpP, 1e-9);
near('Durbin-Watson (statsmodels)', lin.dw, O.dw, 1e-12);
const qq = G.qqPoints(lin.stdResid);
near('QQ points: Filliben median for the smallest residual (scipy probplot convention)', qq[0][0], C.normInv(1 - 0.5 ** (1 / lin.n)), 1e-12);

// ── Binary logistic: statsmodels Logit ──
const dl = C.designMatrix(tab, 'renewed', preds);
const lg = G.fitLogistic(dl.X, dl.y.map((v) => (v === 'Yes' ? 1 : 0)), dl.names);
const LG = REF.logit;
nearAll('Logit coefficients (statsmodels)', lg.coefs.map((c) => c.b), LG.b, 1e-8);
nearAll('Logit standard errors (statsmodels)', lg.coefs.map((c) => c.se), LG.se, 1e-8);
nearAll('Logit p-values (statsmodels)', lg.coefs.map((c) => c.p), LG.p, 1e-8);
nearAll('Logit 95% CI lower (statsmodels)', lg.coefs.map((c) => c.lo), LG.lo, 1e-7);
nearAll('Odds ratio upper bound = exp(CI upper) (statsmodels)', lg.coefs.map((c) => c.orHi), LG.hi.map(Math.exp), 1e-6);
near('Logit log-likelihood (statsmodels)', lg.ll, LG.llf, 1e-9);
near('Null log-likelihood (statsmodels)', lg.ll0, LG.llnull, 1e-9);
near('LR χ² (statsmodels)', lg.lr, LG.llr, 1e-8);
near('LR p (statsmodels)', lg.pLR, LG.llrP, 1e-12);
near('McFadden pseudo-R² (statsmodels prsquared)', lg.mcfadden, LG.prsq, 1e-10);
near('Cox-Snell R²', lg.coxSnell, LG.coxSnell, 1e-10);
near('Nagelkerke R²', lg.nagelkerke, LG.nagelkerke, 1e-10);
near('AIC (statsmodels)', lg.aic, LG.aic, 1e-8);
same('Classification table at 0.5 (statsmodels pred_table: tn, fp, fn, tp)', [lg.table.tn, lg.table.fp, lg.table.fn, lg.table.tp], LG.table);
same('No separation flagged on the example', lg.separation, false);
const sep = G.fitLogistic([[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5]], [0, 0, 0, 1, 1, 1], ['Intercept', 'x']);
same('Perfect separation is flagged', !!sep?.separation, true);

// ── Ordinal (proportional odds): statsmodels OrderedModel ──
const dO = C.designMatrix(tab, 'recommend', preds, { intercept: false });
const LV = ['Detractor', 'Passive', 'Promoter'];
const od = G.fitOrdinal(dO.X, dO.y.map((v) => LV.indexOf(v)), dO.names, 3);
const OR = REF.ordinal;
nearAll('Ordinal coefficients (statsmodels OrderedModel)', od.coefs.map((c) => c.b), OR.b, 1e-5);
nearAll('Ordinal standard errors (statsmodels)', od.coefs.map((c) => c.se), OR.se, 1e-5);
nearAll('Ordinal p-values (statsmodels)', od.coefs.map((c) => c.p), OR.p, 1e-5);
nearAll('Cut points (statsmodels transform_threshold_params)', od.cuts.map((c) => c.t), OR.cuts, 1e-5);
nearAll('Cut point SEs (numerical Hessian of statsmodels log-likelihood)', od.cuts.map((c) => c.se), OR.cutSe, 1e-4);
near('Ordinal log-likelihood (statsmodels)', od.ll, OR.llf, 1e-7);
near('Ordinal null log-likelihood (thresholds only)', od.ll0, OR.ll0, 1e-9);
near('Ordinal AIC (statsmodels)', od.aic, OR.aic, 1e-6);

// ── Count models: statsmodels GLM Poisson and NegativeBinomial (NB2) ──
const dc = C.designMatrix(tab, 'support_tickets', preds);
const po = G.fitCount(dc.X, dc.y, dc.names, { family: 'poisson' });
const PO = REF.poisson;
nearAll('Poisson coefficients (statsmodels GLM)', po.coefs.map((c) => c.b), PO.b, 1e-9);
nearAll('Poisson standard errors (statsmodels GLM)', po.coefs.map((c) => c.se), PO.se, 1e-8);
nearAll('Poisson p-values (statsmodels GLM)', po.coefs.map((c) => c.p), PO.p, 1e-8);
nearAll('IRR lower bound = exp(CI lower)', po.coefs.map((c) => c.irrLo), PO.lo.map(Math.exp), 1e-8);
near('Poisson log-likelihood (statsmodels)', po.ll, PO.llf, 1e-8);
near('Poisson null log-likelihood (statsmodels)', po.ll0, PO.llnull, 1e-8);
near('Poisson deviance (statsmodels)', po.deviance, PO.deviance, 1e-8);
near('Pearson χ² (statsmodels)', po.pearson, PO.pearson, 1e-8);
near('Poisson AIC (statsmodels)', po.aic, PO.aic, 1e-7);
const nb = G.fitCount(dc.X, dc.y, dc.names, { family: 'nb' });
const NB = REF.negbin;
nearAll('Negative binomial coefficients (statsmodels NB2)', nb.coefs.map((c) => c.b), NB.b, 1e-6);
nearAll('Negative binomial SEs (statsmodels NB2)', nb.coefs.map((c) => c.se), NB.se, 1e-5);
nearAll('Negative binomial p-values (statsmodels NB2)', nb.coefs.map((c) => c.p), NB.p, 1e-6);
near('NB2 α (statsmodels)', nb.alpha.est, NB.alpha, 1e-6);
near('NB2 α SE (statsmodels)', nb.alpha.se, NB.alphaSe, 1e-5);
near('NB2 log-likelihood (statsmodels)', nb.ll, NB.llf, 1e-8);
near('NB2 null log-likelihood, intercept and α (statsmodels llnull)', nb.ll0, NB.llnull, 1e-6);
near('NB2 McFadden pseudo-R² (statsmodels)', nb.mcfadden, NB.prsq, 1e-8);
near('NB2 AIC (statsmodels)', nb.aic, NB.aic, 1e-6);
near('LR test of α = 0 equals 2(LL_NB − LL_Poisson)', nb.lrAlpha, 2 * (NB.llf - PO.llf), 1e-6);
const off = G.fitCount([[1], [1], [1], [1]], [2, 4, 6, 8], ['Intercept'], { offset: [1, 2, 3, 4].map(Math.log) });
near('Poisson with exposure offset: rate = Σy/Σexposure by hand (20/10)', Math.exp(off.coefs[0].b), 2, 1e-10);

// Summaries for each model type.
summary('Linear regression', G.regressionSummary(lin, { outcome: 'satisfaction' }), 'satisfaction');
summary('Logistic regression', G.regressionSummary(lg, { outcome: 'renewed', eventLabel: 'Yes' }), 'renewed = Yes');
summary('Ordinal regression', G.regressionSummary(od, { outcome: 'recommend', levels: LV }), 'recommend');
const nbS = summary('Negative binomial regression', G.regressionSummary(nb, { outcome: 'support_tickets' }), 'negative binomial');
truthy('NB summary reports α and its test', nbS.meaning.some((m) => m.includes('negative binomial α')));
const poS = summary('Poisson regression', G.regressionSummary(po, { outcome: 'support_tickets' }));
same('Poisson with overdispersion (Pearson χ²/df > 1.5) is rated weak', [po.dispersion > 1.5, poS.confidence], [true, 'low']);
truthy('Poisson summary warns about overdispersion', poS.caveats.some((c) => c.includes('negative binomial')));
const small = C.designMatrix(C.parseTable('y,x\n1,2\n3,3\n2,5\n5,4\n4,6\n6,8\n5,7\n7,9'), 'y', [{ name: 'x' }]);
same('Linear regression with 8 people: rated weak', G.regressionSummary(G.fitLinear(small.X, small.y, small.names), { outcome: 'y' }).confidence, 'low');

// ── Moderation (PROCESS model 1): statsmodels OLS with centred X and W, t_test for simple slopes ──
const mtab = C.parseTable(E.MEDIATION_EXAMPLE);
const mrows = M.pickRows(mtab, ['ease', 'experience_years', 'intent']);
const mo = M.moderation(mrows, { center: true, probe: 'sd' });
const MO = REF.moderation;
nearAll('Moderation coefficients b0, X, W, X×W (statsmodels)', mo.coefs.map((c) => c.b), MO.b, 1e-10);
nearAll('Moderation SEs (statsmodels)', mo.coefs.map((c) => c.se), MO.se, 1e-10);
nearAll('Moderation p-values (statsmodels)', mo.coefs.map((c) => c.p), MO.p, 1e-9);
near('Moderation R² (statsmodels)', mo.r2, MO.r2, 1e-12);
near('ΔR² for the interaction = R²(full) − R²(main effects) (statsmodels)', mo.dR2, MO.dR2, 1e-12);
nearAll('Simple slopes at W = mean − SD, mean, mean + SD (statsmodels t_test)', mo.slopes.map((s) => s.est), MO.slopes.map((s) => s.est), 1e-10);
nearAll('Simple slope SEs (statsmodels t_test)', mo.slopes.map((s) => s.se), MO.slopes.map((s) => s.se), 1e-10);
nearAll('Simple slope p-values (statsmodels t_test)', mo.slopes.map((s) => s.p), MO.slopes.map((s) => s.p), 1e-9);
nearAll('Johnson-Neyman points (numpy roots)', mo.jn, MO.jn, 1e-8);
nearAll('t at each Johnson-Neyman point equals ±t_crit (statsmodels t_test)', MO.jnT.map(Math.abs), MO.jnT.map(() => MO.tcrit), 1e-8);
nearAll('Our conditional t at the J-N points equals ±t_crit', mo.jn.map((w) => Math.abs(mo.effectAt(w).t)), mo.jn.map(() => MO.tcrit), 1e-8);
const moPct = M.moderation(mrows, { center: true, probe: 'pct' });
nearAll('Percentile probe values 16th, 50th, 84th (numpy percentile)', moPct.slopes.map((s) => s.w), MO.pct, 1e-12);
const moRaw = M.moderation(mrows, { center: false });
near('Interaction coefficient is the same with or without centring', moRaw.coefs[3].b, mo.coefs[3].b, 1e-10);
near('Uncentred X coefficient = conditional effect at W = 0', moRaw.coefs[1].b, mo.effectAt(0).est, 1e-10);
summary('Moderation', M.moderationSummary(mo, { x: 'ease', w: 'experience_years', y: 'intent' }), 'experience_years');

// ── Mediation (PROCESS model 4): pingouin.mediation_analysis and statsmodels ──
const drows = M.pickRows(mtab, ['tutorial', 'confidence', 'intent']);
const md = M.mediationPaths(drows);
const MD = REF.mediation;
near('a path (pingouin)', md.a.b, MD.a, 1e-10);
near('a path SE (pingouin)', md.a.se, MD.aSe, 1e-10);
near('b path, Y ~ X + M (statsmodels)', md.b.b, MD.b, 1e-10);
near('b path SE (statsmodels)', md.b.se, MD.bSe, 1e-10);
near("Direct effect c′ (pingouin)", md.cp.b, MD.direct, 1e-10);
near("Direct effect SE (pingouin)", md.cp.se, MD.directSe, 1e-10);
near("Direct effect p (pingouin)", md.cp.p, MD.directP, 1e-9);
near('Total effect c (pingouin)', md.c.b, MD.total, 1e-10);
near('Total effect p (pingouin)', md.c.p, MD.totalP, 1e-9);
near('Indirect effect a·b (pingouin)', md.ab, MD.indirect, 1e-10);
near('a·b = c − c′ in OLS', md.ab, md.c.b - md.cp.b, 1e-10);
near('Sobel SE (statsmodels SEs)', md.sobel.se, MD.sobelSe, 1e-10);
near('Sobel z', md.sobel.z, MD.sobelZ, 1e-8);
const pgci = M.bootCI(Float64Array.from(MD.pgDist), md.ab);
nearAll("Bias-corrected CI from pingouin's own 2,000 bootstrap draws (pingouin CI)", pgci.bc, MD.pgCI, 1e-12);
near("Bootstrap SE from pingouin's draws (pingouin se)", pgci.se, MD.pgSe, 1e-12);
near("Bootstrap p from pingouin's draws (pingouin pval)", pgci.pBoot, MD.pgP, 1e-12);
const myBoot = M.bootIndirect(drows, MD.replayB, 1);
nearAll('Our bootstrap draws, replayed in numpy (first 3 of 2,000)', Array.from(myBoot.slice(0, 3)), MD.replayFirst, 1e-10);
const myCI = M.bootCI(myBoot, md.ab);
nearAll('Percentile CI of our bootstrap, replayed in numpy', myCI.pct, MD.replayPct, 1e-10);
near('Bootstrap SE of our bootstrap, replayed in numpy', myCI.se, MD.replaySe, 1e-10);
near("Our percentile CI vs pingouin's (different draws): lower within 0.04", myCI.pct[0], MD.pgCI[0], 0.04);
near("Our percentile CI vs pingouin's (different draws): upper within 0.06", myCI.pct[1], MD.pgCI[1], 0.06);
const cov = M.mediationPaths(M.pickRows(mtab, ['tutorial', 'confidence', 'intent', 'experience_years']));
near('With a covariate, a·b still equals c − c′', cov.ab, cov.c.b - cov.cp.b, 1e-10);
const covRows = M.pickRows(mtab, ['tutorial', 'confidence', 'intent', 'experience_years']), rr = C.rng(3);
const resample = covRows.map(() => covRows[Math.floor(rr() * covRows.length)]);
near('Bootstrap with a covariate: first replicate equals a·b refitted on the same resample', M.bootIndirect(covRows, 1, 3)[0], M.mediationPaths(resample).ab, 1e-10);
const r0 = C.rng(3), resample0 = drows.map(() => drows[Math.floor(r0() * drows.length)]);
near('Bootstrap fast path: first replicate equals a·b refitted by OLS on the same resample', M.bootIndirect(drows, 1, 3)[0], M.mediationPaths(resample0).ab, 1e-10);
const mS = summary('Mediation', M.mediationSummary(md, myCI, { x: 'tutorial', m: 'confidence', y: 'intent' }), 'confidence');
same('Mediation with B = 2,000: not rated strong (rule needs B ≥ 5,000)', mS.confidence !== 'high', true);

// ── Bootstrap: our resamples replayed in numpy, BCa by scipy's own _bca_interval on those resamples ──
const DATA = { mean: [INP.timesA], median: [INP.timesA], prop: [INP.successes], diffmean: [INP.timesA, INP.timesB], diffmedian: [INP.timesA, INP.timesB], corr: [INP.pairs.map((p) => p[0]), INP.pairs.map((p) => p[1])] };
for (const key of Object.keys(DATA)) {
  const R = REF.bootstrap[key], reps = RS.bootstrap(key, DATA[key], 3000, 7), ci = RS.bootIntervals(key, DATA[key], reps);
  near(`${key}: estimate`, ci.est, R.est, 1e-10);
  nearAll(`${key}: percentile 95% CI (numpy replay)`, ci.pct, R.pct, 1e-9);
  nearAll(`${key}: BCa 95% CI (scipy _bca_interval on the same resamples)`, ci.bca, R.bca, 1e-9);
  near(`${key}: acceleration a (scipy jackknife)`, ci.a, R.a, 1e-12);
  near(`${key}: bootstrap SE (numpy replay)`, ci.se, R.se, 1e-9);
  // Against scipy.stats.bootstrap itself (its own 30,000 resamples): Monte Carlo agreement within 4% of the width.
  const big = RS.bootIntervals(key, DATA[key], RS.bootstrap(key, DATA[key], 30000, 11)), w = R.scipyBca[1] - R.scipyBca[0];
  nearAll(`${key}: BCa CI vs scipy.stats.bootstrap, both B = 30,000 (within 4% of width ${w.toFixed(3)})`, big.bca, R.scipyBca, 0.04 * w);
}
// Permutation tests: exact enumeration matches scipy.stats.permutation_test exactly.
const PM = REF.permutation;
const pTwo = RS.permutationTest('diffmean', [PM.two.a, PM.two.b], { B: 9999 });
same('Two-sample permutation (6 + 6): exact with C(12, 6) = 924 arrangements', [pTwo.exact, pTwo.n], [true, 924]);
near('Two-sample permutation p, difference in means (scipy exact)', pTwo.p, PM.two.p, 1e-12);
near('Two-sample permutation p, difference in medians (scipy exact)', RS.permutationTest('diffmedian', [PM.two.a, PM.two.b], { B: 9999 }).p, PM.twoMedian.p, 1e-12);
const pOne = RS.permutationTest('mean', [PM.one.x], { B: 9999, mu0: 0 });
same('Sign-flip test (n = 10): exact with 2^10 = 1,024 arrangements', [pOne.exact, pOne.n], [true, 1024]);
near('Sign-flip permutation p, mean (scipy exact)', pOne.p, PM.one.p, 1e-12);
const pCor = RS.permutationTest('corr', [PM.corr.x, PM.corr.y], { B: 9999 });
same('Correlation permutation (n = 7): exact with 7! = 5,040 pairings', [pCor.exact, pCor.n], [true, 5040]);
near('Correlation permutation p (scipy exact)', pCor.p, PM.corr.p, 1e-12);
const pBig = RS.permutationTest('diffmean', [INP.timesA, INP.timesB], { B: 50000, seed: 5 });
same('Task-time example: too many arrangements, so Monte Carlo with (k + 1)/(B + 1)', pBig.exact, false);
near('Monte Carlo permutation p vs scipy with 200,000 resamples (within 0.01)', pBig.p, PM.bigTwo.p, 0.01);
const rsCI = RS.bootIntervals('diffmean', DATA.diffmean, RS.bootstrap('diffmean', DATA.diffmean, 9999, 1));
summary('Bootstrap summary', RS.resamplingSummary({ key: 'diffmean', data: DATA.diffmean, ci: rsCI }), 'difference in means');
const permS = summary('Permutation summary', RS.resamplingSummary({ key: 'diffmean', data: DATA.diffmean, perm: pBig }));
same('Permutation summary: smallest group of 14 (< 15) is weak', permS.confidence, 'low');

// ── Distribution check: scipy and statsmodels ──
for (const [k, v] of Object.entries(REF.shapiro)) {
  const sw = D.shapiroWilk(v.x);
  near(`Shapiro-Wilk W, ${k} (n = ${v.x.length}; scipy)`, sw.W, v.W, 1e-6);
  near(`Shapiro-Wilk p, ${k} (scipy)`, sw.p, v.p, 1e-6);
}
const X = INP.distribution, DR = REF.distribution, ds = D.describe(X);
near('Mean (numpy)', ds.mean, DR.mean, 1e-10);
near('SD, ddof = 1 (numpy)', ds.sd, DR.sd, 1e-10);
nearAll('Quartiles (numpy percentile, linear)', [ds.q1, ds.median, ds.q3], DR.q, 1e-10);
near('Skewness g1 (scipy bias=True)', ds.g1, DR.g1, 1e-10);
near('Skewness G1 (scipy bias=False)', ds.G1, DR.G1, 1e-10);
near('Excess kurtosis g2 (scipy bias=True)', ds.g2, DR.g2, 1e-10);
near('Excess kurtosis G2 (scipy bias=False)', ds.G2, DR.G2, 1e-10);
near('Lilliefors KS D (statsmodels)', D.ksNormal(X), DR.ksD, 1e-10);
truthy('Lilliefors p, example: both below 0.01 (statsmodels table floor is 0.001)', D.lilliefors(X).p < 0.01 && DR.ksP < 0.01);
for (const [k, [Dv, p]] of Object.entries(REF.lillie)) {
  const lf = D.lilliefors(REF.shapiro[k].x, 4000, 3);
  near(`Lilliefors D, ${k} (statsmodels)`, lf.D, Dv, 1e-10);
  near(`Lilliefors p, ${k}: simulated vs statsmodels table (within 0.03)`, lf.p, p, 0.03);
}
const ad = D.andersonDarling(X);
near('Anderson-Darling A² (scipy anderson)', ad.A2, DR.adA2, 1e-9);
near('Anderson-Darling A² (statsmodels normal_ad)', ad.A2, DR.adA2sm, 1e-9);
near('Anderson-Darling p (statsmodels normal_ad)', ad.p, DR.adP, 1e-10);
const adSk = D.andersonDarling(REF.shapiro.n25.x), adU = D.andersonDarling(REF.shapiro.n100u.x);
nearAll('Anderson-Darling A² and p, skewed n = 25 (statsmodels)', [adSk.A2, adSk.p], DR.ad_skewed, 1e-9);
nearAll('Anderson-Darling A² and p, uniform n = 100 (statsmodels)', [adU.A2, adU.p], DR.ad_uniform, 1e-9);
const ln = D.logNormal(X);
near('Log-normal σ (scipy lognorm.fit, floc = 0)', ln.sigma, DR.lnS, 1e-6);
near('Log-normal scale = geometric mean (scipy lognorm.fit)', ln.gm, DR.lnScale, 1e-6);
near('Geometric mean (scipy gmean)', ln.gm, DR.gm, 1e-10);
nearAll('Geometric mean 95% CI, exp of t interval on logs (scipy)', [ln.lo, ln.hi], DR.gmCI, 1e-9);
near('Normal log-likelihood at the MLE (scipy)', ln.llNorm, DR.llNorm, 1e-8);
near('Log-normal log-likelihood at the MLE (scipy)', ln.llLog, DR.llLog, 1e-6);
near('Box-Cox λ by maximum likelihood (scipy boxcox_normmax)', D.boxcoxLambda(X), DR.boxcox, 1e-5);
nearAll("Gaussian KDE, Scott's rule (scipy gaussian_kde)", D.kde(X, DR.grid).y, DR.kdeScott, 1e-12);
nearAll("Gaussian KDE, Silverman's rule (scipy gaussian_kde)", D.kde(X, DR.grid, 'silverman').y, DR.kdeSilverman, 1e-12);
const pp = D.probplot(X);
near('Probability plot slope (scipy probplot)', pp.slope, DR.ppSlope, 1e-9);
near('Probability plot intercept (scipy probplot)', pp.intercept, DR.ppIntercept, 1e-9);
near('Probability plot r (scipy probplot)', pp.r, DR.ppR, 1e-12);
nearAll('Probability plot theoretical quantiles, first 3 (scipy probplot)', pp.osm.slice(0, 3), DR.ppOsm, 1e-9);
same("Histogram bins, numpy 'auto' rule", D.bins(X).counts.length, DR.histEdges);
const lad = D.ladder(X);
near('Ladder: √x skewness (scipy)', lad.find((l) => l.p === 0.5).skew, DR.sqrtSkew, 1e-10);
near('Ladder: √x Shapiro-Wilk W (scipy)', lad.find((l) => l.p === 0.5).W, DR.sqrtW, 1e-6);
near('Ladder: −1/x Shapiro-Wilk W (scipy)', lad.find((l) => l.p === -1).W, DR.invW, 1e-6);
same('Ladder skips powers ≤ 0 when a value is zero', D.ladder([0, 1, 2, 3, 5]).map((l) => l.p), [0.5, 1, 2, 3]);
const dS = summary('Distribution check', D.distributionSummary({ d: ds, sw: D.shapiroWilk(X), ad, ks: D.lilliefors(X), ln, lad, lam: D.boxcoxLambda(X), unit: 's', name: 'task times' }), 'not normal');
same('Distribution with n = 40: medium', dS.confidence, 'medium');
truthy('Distribution summary recommends the geometric mean when a log-normal fits better', dS.meaning.some((m) => m.includes('report the geometric mean')));

// ── Survival: lifelines ──
const stab = C.parseTable(E.SURVIVAL_EXAMPLE);
const sCol = (nm) => stab.cols.find((c) => c.name === nm).values;
const days = sCol('days'), adopted = sCol('adopted'), flow = sCol('onboarding');
const fits = {};
for (const g of ['Old flow', 'New flow', 'all']) {
  const keep = days.map((_, i) => i).filter((i) => g === 'all' || flow[i] === g);
  const km = SV.kaplanMeier(keep.map((i) => days[i]), keep.map((i) => adopted[i]));
  if (g !== 'all') fits[g] = km;
  const L = REF.survival[g];
  same(`KM ${g}: event times (lifelines)`, km.events.map((r) => r.t), L.times);
  nearAll(`KM ${g}: survival S(t) (lifelines)`, km.events.map((r) => r.S), L.S, 1e-12);
  nearAll(`KM ${g}: lower 95% CI, exponential Greenwood (lifelines)`, km.events.map((r) => r.lo), L.lo, 1e-10);
  nearAll(`KM ${g}: upper 95% CI (lifelines)`, km.events.map((r) => r.hi), L.hi, 1e-10);
  near(`KM ${g}: median (lifelines)`, km.median, L.median, 0);
  same(`KM ${g}: median 95% CI (lifelines median_survival_times)`, km.medianCI, L.medianCI);
  near(`KM ${g}: restricted mean to 60 (lifelines)`, SV.rmst(km.rows, 60), L.rmst60, 1e-9);
  near(`KM ${g}: restricted mean to 30 (lifelines)`, SV.rmst(km.rows, 30), L.rmst30, 1e-9);
  if (g === 'all') nearAll('Nelson-Aalen cumulative hazard, first 8 event times (lifelines, no smoothing)', REF.survival.naTimes.map((t) => km.events.find((r) => r.t === t).H), REF.survival.naH, 1e-12);
}
const lr = SV.logRank(days, adopted, flow);
near('Log-rank χ², two groups (lifelines)', lr.chi2, REF.survival.logrank.chi2, 1e-9);
near('Log-rank p (lifelines)', lr.p, REF.survival.logrank.p, 1e-10);
const S3 = REF.survival3, lr3 = SV.logRank(S3.t, S3.e, S3.g);
near('Log-rank χ², three groups (lifelines multivariate_logrank_test)', lr3.chi2, S3.chi2, 1e-9);
near('Log-rank p, three groups (lifelines)', lr3.p, S3.p, 1e-10);
const pw = SV.pairwiseLogRank(S3.t, S3.e, S3.g);
nearAll('Pairwise log-rank χ² A-B, A-C, B-C (lifelines pairwise_logrank_test)', pw.map((x) => x.chi2), S3.pairs.map((x) => x[2]), 1e-9);
nearAll('Pairwise log-rank p (lifelines)', pw.map((x) => x.p), S3.pairs.map((x) => x[3]), 1e-10);
near('Greenwood SE by hand: S·√Σ d/(n(n − d)) at the first event, 1 of n', fits['New flow'].events[0].se, (() => { const r = fits['New flow'].events[0]; return r.S * Math.sqrt(r.d / (r.atRisk * (r.atRisk - r.d))); })(), 1e-15);
const svS = summary('Survival', SV.survivalSummary({ fits, lr, eventWord: 'adoption', unit: 'days', tau: 60, rm: { 'Old flow': SV.rmst(fits['Old flow'].rows, 60), 'New flow': SV.rmst(fits['New flow'].rows, 60) } }), 'differs');
truthy('Survival summary gives both medians', svS.meaning[0].includes('34.0') && svS.meaning[1].includes('18.0'));
const never = SV.kaplanMeier([5, 8, 10, 12], [1, 0, 0, 0]);
same('Median not reached when the curve stays above 0.5', never.median, Infinity);
summary('Survival, median not reached', SV.survivalSummary({ fits: { All: never }, lr: null, eventWord: 'adoption' }), 'not reached');

// ── Test selector: every path leads to a real (or batch-2) calculator and real atlas methods ──
const paths = TS.allPaths();
truthy(`Test selector: ${paths.length} complete answer paths`, paths.length > 40);
const badCalc = [], badMeth = [], badAlt = [];
for (const a of paths) {
  const r = TS.recommend(a);
  if (!r || !(calcIds.has(r.calc) || TS.BATCH2[r.calc])) badCalc.push(JSON.stringify(a));
  for (const [, id] of r.alts) if (id && !(calcIds.has(id) || TS.BATCH2[id])) badAlt.push(id);
  for (const m of r.methods) if (!kinds.byId.has(m)) badMeth.push(m);
  for (const c of r.checks) for (const m of c.matchAll(/\/calculators\/([a-z0-9-]+)/g)) if (!calcIds.has(m[1]) && !TS.BATCH2[m[1]]) badAlt.push(m[1]);
}
same('Every recommended calculator id is in the catalog or batch 2', badCalc, []);
same('Every alternative calculator id is in the catalog or batch 2', [...new Set(badAlt)], []);
same('Every recommended atlas method id exists', [...new Set(badMeth)], []);
const used = new Set(paths.map((a) => TS.recommend(a).calc));
same('The selector reaches all six statsbench tools it should', ['regression', 'mediation', 'resampling', 'distribution-check', 'survival'].filter((id) => !used.has(id)), []);
same('Equivalence goes to the existing TOST in ab-health (not duplicated)', TS.recommend({ goal: 'equivalent', outcome: 'continuous' }).calc, 'ab-health');
same('Two designs, ratings, same people → Wilcoxon signed-rank', TS.recommend({ goal: 'compare', outcome: 'ordinal', groups: '2', paired: 'yes', size: 'small' }).test, 'Wilcoxon signed-rank test');
same('Two designs, task times, small and skewed, between → permutation / resampling', TS.recommend({ goal: 'compare', outcome: 'continuous', groups: '2', paired: 'no', size: 'small', shape: 'skewed' }).calc, 'resampling');
same('Batch-2 names cover every id in calculator-batch2.md (29)', Object.keys(TS.BATCH2).length, 29);
for (const a of [paths[0], paths[Math.floor(paths.length / 2)], { goal: 'agree', raters: 'scores' }, { goal: 'compare', outcome: 'continuous', groups: '2', paired: 'no', size: 'small', shape: 'unsure' }]) {
  const r = TS.recommend(a);
  summary(`Selector summary (${Object.values(a).join(', ')})`, TS.selectorSummary(a, r, CATALOG.find((c) => c.id === r.calc)?.name || TS.BATCH2[r.calc]));
}

// ── Catalog entries ──
const mine = ['regression', 'mediation', 'resampling', 'distribution-check', 'survival', 'test-selector'];
same('All six statsbench calculators are in the catalog', mine.filter((id) => !calcIds.has(id)), []);
same('Their method ids exist in the atlas', CATALOG.filter((c) => mine.includes(c.id)).flatMap((c) => c.methods).filter((m) => !kinds.byId.has(m)), []);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
