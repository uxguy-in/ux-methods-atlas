// Checks the experimentation and analytics tools (A/B health, multi-group comparisons, AHP and decision matrix,
// retention and funnels, meta-analysis) against scipy, statsmodels, pingouin, scikit-posthocs, numpy and PythonMeta
// (server/scripts/expanalytics-reference.py → expanalytics-reference.json) and against published worked examples:
// metafor's dat.bcg and dat.egger2001 output, Fader and Hardie (2007) and Saaty (1990). Also checks every
// "Reading your results" summary. Run with `npm run check:expanalytics`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../client/src/calc/tools/expanalytics-core.js';
import * as A from '../../client/src/calc/tools/expanalytics-abhealth.js';
import * as M from '../../client/src/calc/tools/expanalytics-multi.js';
import * as D from '../../client/src/calc/tools/expanalytics-decision.js';
import * as R from '../../client/src/calc/tools/expanalytics-retention.js';
import * as X from '../../client/src/calc/tools/expanalytics-meta.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'expanalytics-reference.json'), 'utf8'));
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
const nearAll = (label, got, want, tol) => got.forEach((g, i) => near(`${label} [${i}]`, g, want[i], tol));
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, key) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|—/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  if (key) for (const k of [].concat(key)) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}

// ── Core distributions (scipy) ──
for (const [q, k, df, want] of REF.studentized) near(`Studentized range sf(${q}, k=${k}, df=${df}) (scipy)`, C.ptukeySf(q, k, df), want, 1e-9);
near('qtukey(0.95, 4, 20) round-trips through ptukey', C.ptukey(C.qtukey(0.95, 4, 20), 4, 20), 0.95, 1e-9);
near('Chi-square sf(12.5, 3) (scipy 0.005852662593326735)', C.chi2Sf(12.5, 3), 0.005852662593326735, 1e-13);
near('Normal cdf(−6) (scipy 9.865876450376946e-10)', C.normCdf(-6), 9.865876450376946e-10, 1e-18);
near('F sf(3.2, 3, 40) (scipy 0.03342118072289293)', C.fSf(3.2, 3, 40), 0.03342118072289293, 1e-11);
const adj = REF.multi.adjust;
nearAll('Bonferroni (statsmodels multipletests)', C.adjustP(adj.p, 'bonferroni'), adj.bonferroni, 1e-12);
nearAll('Holm (statsmodels multipletests)', C.adjustP(adj.p, 'holm'), adj.holm, 1e-12);
nearAll('Hochberg (statsmodels simes-hochberg)', C.adjustP(adj.p, 'hochberg'), adj['simes-hochberg'], 1e-12);
nearAll('Benjamini-Hochberg (statsmodels fdr_bh)', C.adjustP(adj.p, 'bh'), adj.fdr_bh, 1e-12);

// ── A/B health ──
for (const [name, v] of Object.entries(REF.srm)) {
  const r = A.srm(v.obs, v.w);
  near(`SRM ${name}: χ² (scipy.stats.chisquare)`, r.chi2, v.chi2, 1e-9);
  near(`SRM ${name}: p (scipy.stats.chisquare)`, r.p, v.p, 1e-12);
}
same('SRM flags at p < 0.001 only: 50/50 split with 50,812 vs 49,388 flagged; 20/80 split with p = 0.0012 not flagged', [A.srm(REF.srm.two.obs, REF.srm.two.w).flag, A.srm(REF.srm.skew.obs, REF.srm.skew.w).flag], [true, false]);
const mo = { type: 'mean', sd: 55, alpha: 0.05, power: 0.8, sided: 2 };
near('MDE, mean, two-sided, n = 20,000 (statsmodels NormalIndPower)', A.mdeFor(mo, 20000), REF.mde.mean_two.delta, 1e-8);
near('MDE with CUPED ρ = 0.5 shrinks by √(1 − ρ²) (statsmodels)', A.mdeFor({ ...mo, rho: 0.5 }, 20000), REF.mde.mean_cuped.delta, 1e-8);
near('MDE, mean, one-sided (statsmodels alternative="larger")', A.mdeFor({ ...mo, sided: 1 }, 20000), REF.mde.mean_one.delta, 1e-8);
near('MDE, rate 4.2%, n = 84,000, unpooled SE (statsmodels power + brentq)', A.mdeFor({ type: 'prop', base: 0.042, alpha: 0.05, power: 0.8, sided: 2 }, 84000), REF.mde.prop_two.delta, 1e-10);
same('Users per arm for a 5% relative lift on 4.2% (statsmodels solve_power, ceil)', A.nFor({ type: 'prop', base: 0.042, alpha: 0.05, power: 0.8, sided: 2 }, REF.mde.prop_n.delta), REF.mde.prop_n.n);
const p3 = A.plan({ type: 'prop', base: 0.042, daily: 30000, arms: 3, alpha: 0.05, power: 0.8, sided: 2, mde: 0.05 });
same('Three arms: α split to 0.025, users per arm (statsmodels alpha = 0.025)', [p3.alphaUsed, p3.n], [0.025, REF.mde.prop_n.n3arms]);
same('Duration = users per arm ÷ (daily traffic ÷ arms), rounded up', p3.days, Math.ceil(REF.mde.prop_n.n3arms / 10000));
const dc = A.ratioStats(REF.delta.xc, REF.delta.yc), dt = A.ratioStats(REF.delta.xt, REF.delta.yt), dm = A.deltaMethod(dc, dt);
near('Delta method: control ratio Σclicks/Σsessions (numpy)', dm.rc, REF.delta.rc, 1e-12);
near('Delta method: SE of control ratio (numpy analytic formula)', dm.seC, REF.delta.seC, 1e-12);
near('Delta method: SE of treatment ratio (numpy)', dm.seT, REF.delta.seT, 1e-12);
near('Delta method: SE of the difference (numpy)', dm.seDiff, REF.delta.seDiff, 1e-12);
near('Delta method: relative lift (numpy)', dm.lift, REF.delta.lift, 1e-12);
near('Delta method: SE of the lift (numpy)', dm.seLift, REF.delta.seLift, 1e-12);
near('Delta-method SE matches the SD of 4,000 simulated experiments (numpy, within 3%)', REF.delta.simMeanSe / REF.delta.simSd, 1, 0.03);
near('Our analytic SE on one sample is close to the simulated SD (within 10%)', dm.seC / REF.delta.simSd, 1, 0.1);
const pr = REF.ni.prop, nip = A.nonInferiority({ kind: 'prop', c: { x: pr.c[0], n: pr.c[1] }, t: { x: pr.t[0], n: pr.t[1] }, margin: pr.m });
near('Non-inferiority, proportions (statsmodels test_proportions_2indep, wald)', nip.pNI, pr.pNI, 1e-12);
near('Equivalence TOST, proportions (statsmodels tost_proportions_2indep, wald)', nip.pEq, pr.pEq, 1e-12);
truthy('NI holds exactly when the 90% interval lies above −margin', nip.ni === nip.lo > -pr.m);
const mn = REF.ni.mean, nim = A.nonInferiority({ kind: 'mean', c: { m: mn.c[0], sd: mn.c[1], n: mn.c[2] }, t: { m: mn.t[0], sd: mn.t[1], n: mn.t[2] }, margin: mn.m });
near('Non-inferiority, means, Welch (scipy ttest_ind_from_stats)', nim.pNI, mn.pNI, 1e-10);
near('Equivalence TOST, means, Welch (scipy)', nim.pEq, mn.pEq, 1e-10);
const niLower = A.nonInferiority({ kind: 'mean', c: { m: 30, sd: 10, n: 200 }, t: { m: 29, sd: 10, n: 200 }, margin: 3, higherBetter: false });
truthy('"Lower is better": a lower new mean counts as an improvement, not a loss', niLower.ni && niLower.diff === -1);
near('"Lower is better": one-sided p = P(t₃₉₈ > (1 + 3)/1) by hand', niLower.pNI, C.tSf(4, 398), 1e-12);
const aa = A.aaCheck(REF.aa.ps);
near('A/A: KS D on the example p-values (scipy kstest)', aa.ks.D, REF.aa.D, 1e-12);
near('A/A: KS exact p (scipy kstest method="exact")', aa.ks.p, REF.aa.p, 1e-9);
same('A/A: false positives below 0.05', aa.fp, REF.aa.fp);
near('A/A: one-sided binomial p (scipy binomtest)', aa.pBinom, REF.aa.pBinom, 1e-10);
const aas = A.aaCheck(REF.aa.small.ps);
near('A/A: KS D, piled-up small p-values (scipy)', aas.ks.D, REF.aa.small.D, 1e-12);
near('A/A: KS exact p, piled-up small p-values (scipy)', aas.ks.p, REF.aa.small.p, 1e-10);

const srmS = summary('SRM', A.srmSummary(A.srm(REF.srm.two.obs, REF.srm.two.w, ['Control', 'New checkout'])), ['χ²(1) = 20.24', 'p < 0.001']);
truthy('SRM summary: says not to trust the results and cites Kohavi', srmS.headline.includes('Do not trust') && srmS.meaning.some((m) => m.includes('Kohavi')));
summary('SRM pass', A.srmSummary(A.srm([50100, 49900], [1, 1])), 'No sample ratio mismatch');
const plan14 = A.plan({ type: 'prop', base: 0.042, daily: 12000, arms: 2, alpha: 0.05, power: 0.8, sided: 2, rho: 0.5, days: 14 });
const mdeS = summary('MDE', A.mdeSummary(plan14, { type: 'prop', base: 0.042, alpha: 0.05, power: 0.8, arms: 2, rho: 0.5, days: 14 }), '14 days');
truthy('MDE summary: says the MDE is not the expected effect', mdeS.caveats.some((c) => c.startsWith('An MDE is not the expected effect')));
const dS = summary('Delta method', A.deltaSummary(dm, dc, dt), 'lift');
truthy('Delta summary: CI wording is frequentist', dS.caveats[0].includes('not a 95% probability'));
summary('Non-inferiority', A.niSummary(nip, { kind: 'prop' }), '1.00 pp');
const aaS = summary('A/A healthy', A.aaSummary(aa), 'look healthy');
same('A/A with 120 p-values: strong evidence', aaS.confidence, 'high');
summary('A/A unhealthy', A.aaSummary(aas), 'look unhealthy');

// ── Multi-group comparisons ──
const MC = REF.multi, G = Object.entries(MC.groups).map(([name, xs]) => ({ name, xs }));
const an = M.anova(G), wa = M.welchAnova(G);
near('One-way ANOVA F (pingouin)', an.F, MC.F, 1e-9); near('One-way ANOVA p (pingouin)', an.p, MC.p, 1e-12);
near('η² (pingouin np2)', an.eta2, MC.eta2, 1e-12); near('ω², by hand from pingouin SS', an.omega2, MC.omega2, 1e-12);
near("Welch's F (pingouin welch_anova)", wa.F, MC.welchF, 1e-9); near("Welch's df2 (pingouin)", wa.df2, MC.welchDf2, 1e-9); near("Welch's p (pingouin)", wa.p, MC.welchP, 1e-12);
near('Levene, center = mean (scipy)', M.levene(G, 'mean').W, MC.leveneMean[0], 1e-9); near('Levene p (scipy)', M.levene(G, 'mean').p, MC.leveneMean[1], 1e-12);
near('Brown-Forsythe, center = median (scipy)', M.levene(G, 'median').W, MC.leveneMedian[0], 1e-9); near('Brown-Forsythe p (scipy)', M.levene(G, 'median').p, MC.leveneMedian[1], 1e-12);
const kw = M.kruskal(G);
near('Kruskal-Wallis H, tie-corrected (scipy)', kw.H, MC.kruskal[0], 1e-9); near('Kruskal-Wallis p (scipy)', kw.p, MC.kruskal[1], 1e-12);
const tk = M.tukey(G);
nearAll('Tukey HSD mean differences (statsmodels pairwise_tukeyhsd)', tk.map((p) => p.diff), MC.tukeyDiff, 1e-9);
nearAll('Tukey HSD p-values (statsmodels)', tk.map((p) => p.p), MC.tukeyP, 1e-8);
nearAll('Tukey HSD lower bounds (statsmodels)', tk.map((p) => p.lo), MC.tukeyLo, 1e-6);
nearAll('Tukey HSD upper bounds (statsmodels)', tk.map((p) => p.hi), MC.tukeyHi, 1e-6);
const gh = M.gamesHowell(G);
nearAll('Games-Howell t (pingouin pairwise_gameshowell)', gh.map((p) => p.t), MC.gh.map((g) => g[1]), 1e-9);
nearAll('Games-Howell df (pingouin)', gh.map((p) => p.df), MC.gh.map((g) => g[2]), 1e-9);
nearAll('Games-Howell p (pingouin)', gh.map((p) => p.p), MC.gh.map((g) => g[3]), 1e-8);
const dn = M.dunn(G);
nearAll("Dunn's test raw p (scikit-posthocs)", dn.map((p) => p.pRaw), MC.dunnRaw, 1e-12);
nearAll("Dunn's test Holm p (scikit-posthocs)", dn.map((p) => p.p), MC.dunnHolm, 1e-12);
const RM = MC.rm, rm = M.rmAnova(RM.rows);
near('RM ANOVA F (pingouin rm_anova)', rm.F, RM.F, 1e-9); near('RM ANOVA p (pingouin)', rm.p, RM.p, 1e-12);
near('Greenhouse-Geisser ε (pingouin)', rm.eps, RM.eps, 1e-9); near('Greenhouse-Geisser p (pingouin)', rm.pGG, RM.pGG, 1e-12);
near('Generalised η² (pingouin ng2)', rm.ng2, RM.ng2, 1e-12);
near("Mauchly's W (pingouin sphericity)", rm.mauchlyW, RM.W, 1e-9); near("Mauchly's χ² (pingouin)", rm.mauchlyChi2, RM.chi2, 1e-9); near("Mauchly's p (pingouin)", rm.mauchlyP, RM.pSpher, 1e-9);
const fr = M.friedman(RM.rows);
near('Friedman χ² (scipy)', fr.chi2, RM.friedman[0], 1e-9); near('Friedman p (scipy)', fr.p, RM.friedman[1], 1e-12);
const names4 = ['P1', 'P2', 'P3', 'P4'];
nearAll('Nemenyi p (scikit-posthocs posthoc_nemenyi_friedman)', M.nemenyi(RM.rows, names4).map((p) => p.p), RM.nemenyi, 1e-9);
nearAll('Conover p, Holm (scikit-posthocs posthoc_conover_friedman)', M.conoverFriedman(RM.rows, names4).map((p) => p.p), RM.conoverHolm, 1e-9);
const cq = M.cochranQ(MC.cochran.rows, ['A', 'B', 'C']);
near("Cochran's Q (statsmodels cochrans_q)", cq.Q, MC.cochran.Q, 1e-9); near("Cochran's Q p (statsmodels)", cq.p, MC.cochran.p, 1e-12);
nearAll('Pairwise McNemar exact p (statsmodels mcnemar exact)', cq.pairs.map((p) => p.pRaw), MC.cochran.mcnemar, 1e-12);
nearAll('Pairwise McNemar, Holm (statsmodels multipletests)', cq.pairs.map((p) => p.p), MC.cochran.mcnemarHolm, 1e-12);
same('Compact letters: B differs from everyone, others share "b"', M.cld(4, [[0, 1], [1, 2], [1, 3]], [1, 3, 0, 2]), ['b', 'a', 'b', 'b']);
same('Compact letters: A > C, B in between shares both', M.cld(3, [[0, 2]], [0, 1, 2]), ['a', 'ab', 'b']);
same('Compact letters: no differences, one letter', M.cld(3, [], [0, 1, 2]), ['a', 'a', 'a']);
const wide = M.parseData('A\tB\tC\n1\t2\t3\n4\t\t6\nx\t5\t7', 'wide', 'independent');
same('Wide data: blank cells skipped, text reported', [wide.groups.map((g) => g.xs), wide.bad], [[[1, 4], [2, 5], [3, 6, 7]], [4]]);
const long = M.parseData('p,cond,v\nP1,A,1\nP1,B,2\nP2,A,3\nP2,B,4\nP3,A,5', 'long', 'repeated');
same('Long repeated data: incomplete participants dropped', [long.rows, long.dropped], [[[1, 2], [3, 4]], ['P3']]);
const ind = M.independentSummary({ d: M.describe(G), a: an, w: wa, lev: M.levene(G, 'median'), kw, post: gh, postName: 'Games-Howell', letters: M.cld(4, gh.filter((p) => p.p < 0.05).map((p) => [p.i, p.j]), [1, 3, 0, 2]), unequal: true });
summary('Independent groups', ind, "Welch's F(3, 18.3) = 14.28");
truthy('ANOVA summary: says ANOVA only shows that some difference exists', ind.meaning[0].includes('only says whether some difference exists'));
summary('Repeated measures', M.repeatedSummary({ rm, fr, names: names4, post: M.pairedPosthoc(RM.rows, names4), postName: 'Paired t-tests (Holm)', letters: ['c', 'b', 'a', 'a'] }), 'Greenhouse-Geisser F(2.78, 30.5) = 17.06');
summary("Cochran's Q", M.cochranSummary(cq, ['A', 'B', 'C']), "Cochran's Q(2)");
const corrS = summary('Corrections', M.correctionSummary(adj.p, { bonferroni: adj.bonferroni, holm: adj.holm, hochberg: adj['simes-hochberg'], bh: adj.fdr_bh }), 'Of 10 p-values');
truthy('Corrections summary counts survivors by hand (Holm keeps 2, BH keeps 5, as counted from statsmodels)', corrS.headline.includes('2 survive Holm') && corrS.headline.includes('5 survive the Benjamini-Hochberg'));

// ── AHP and decision matrix ──
const school = D.ahpPriorities(REF.ahp.school.A);
nearAll('AHP priorities, Saaty school example (numpy eigenvector)', school.w, REF.ahp.school.w, 1e-9);
nearAll('AHP priorities match Saaty (1990) published .32 .14 .03 .13 .24 .14 to 2 dp', school.w.map((v) => Math.round(v * 100) / 100), [0.32, 0.14, 0.03, 0.13, 0.24, 0.14], 0.0101);
near('AHP λmax, school example (numpy)', school.lambda, REF.ahp.school.lambda, 1e-9);
near('AHP CR, school example (numpy, Saaty RI 1.24)', school.cr, REF.ahp.school.cr, 1e-9);
truthy('School example is flagged as inconsistent (CR 0.23 > 0.10)', school.cr > D.CR_LIMIT);
const j1 = D.matrixFromSteps(4, [2, 4, 3, 2, 2, 0]), j2 = D.matrixFromSteps(4, [1, 3, 4, 2, 3, 1]);
nearAll('Example judge 1 priorities (numpy)', D.ahpPriorities(j1).w, REF.ahp.judge1.w, 1e-9);
near('Example judge 1 CR (numpy)', D.ahpPriorities(j1).cr, REF.ahp.judge1.cr, 1e-9);
const gm = D.geoMeanMatrix([j1, j2]);
nearAll('Geometric-mean aggregation of two judges (numpy)', gm.flat(), REF.ahp.geo.A.flat(), 1e-12);
nearAll('Aggregated priorities (numpy)', D.ahpPriorities(gm).w, REF.ahp.geo.w, 1e-9);
same('Saaty scale: slider steps map to 1/9 … 9', [D.stepToRatio(8), D.stepToRatio(0), D.stepToRatio(-8)].map((v) => +v.toFixed(6)), [9, 1, +(1 / 9).toFixed(6)]);
const perfect = D.ahpPriorities(D.matrixFromRatios(3, [2, 4, 2]));
near('A perfectly consistent matrix has CR 0', perfect.cr, 0, 1e-12);
const sm = D.smart([40, 30, 20, 10], [[6, 7, 5, 4], [9, 8, 8, 6], [5, 6, 3, 3]], ['higher', 'higher', 'lower', 'lower']);
nearAll('SMART totals by hand (min-max, cost criteria reversed)', sm.total, [0.4 * 0.25 + 0.3 * 0.5 + 0.2 * 0.6 + 0.1 * (2 / 3), 0.4 + 0.3, 0.3 * 0 + 0.2 + 0.1], 1e-12);
const sens = D.sensitivity(sm.w, sm.V, ['a', 'b', 'c', 'd']);
// Brute force: scan each weight on a fine grid and find where the leader first changes.
const leaderOf = (w, V) => V.map((r, o) => [r.reduce((s, v, j) => s + v * w[j], 0), o]).sort((x, y) => y[0] - x[0] || x[1] - y[1])[0][1];
const top = leaderOf(sm.w, sm.V);
sens.forEach((s) => {
  let down = null, up = null;
  for (let t = s.w; t >= 0; t -= 1e-5) { const w = sm.w.map((v, j) => (j === s.c ? t : (v * (1 - t)) / (1 - s.w))); if (leaderOf(w, sm.V) !== top) { down = t; break; } }
  for (let t = s.w; t <= 1; t += 1e-5) { const w = sm.w.map((v, j) => (j === s.c ? t : (v * (1 - t)) / (1 - s.w))); if (leaderOf(w, sm.V) !== top) { up = t; break; } }
  same(`Sensitivity, criterion ${s.c + 1}: break-even weights match a brute-force scan`, [s.down ? +s.down.t.toFixed(3) : null, s.up ? +s.up.t.toFixed(3) : null], [down === null ? null : +down.toFixed(3), up === null ? null : +up.toFixed(3)]);
});
same('Effort × impact quadrants', [D.quadrant(0.9, 2), D.quadrant(0.9, 8), D.quadrant(0.2, 2), D.quadrant(0.2, 8)], ['Quick win', 'Big bet', 'Fill-in', 'Money pit']);
const ahpR = D.ahp(gm, [j1, j1, j2, j2].map((m) => D.matrixFromSteps(3, [1, 2, 0])));
const dsA = summary('AHP', D.decisionSummary({ method: 'ahp', names: ['X', 'Y', 'Z'], critNames: ['a', 'b', 'c', 'd'], scores: ahpR.scores, crs: [{ name: 'Criteria', cr: 0.25 }], sens: D.sensitivity(ahpR.crit.w, ahpR.V, ['a', 'b', 'c', 'd']), judges: 2 }), 'comes out on top');
truthy('AHP summary: CR above 0.1 is explained as inconsistent judgements', dsA.meaning.some((m) => m.includes('inconsistent')) && dsA.caveats[0].startsWith('A CR above 0.1 means the judgements are inconsistent'));
summary('SMART', D.decisionSummary({ method: 'smart', names: ['Mega menu', 'Search-first', 'Guided wizard'], critNames: ['a', 'b', 'c', 'd'], scores: sm.total, sens }), 'Search-first');

// ── Retention and funnels ──
for (const [name, key] of [['Regular', 'regular'], ['High End', 'highEnd']]) {
  const ref = REF.sbg[key], fit = R.sbgFit([{ size: 1000, counts: ref.s }]);
  near(`sBG α, Fader and Hardie (2007) ${name} (scipy MLE)`, fit.alpha, ref.fit[0], 1e-4);
  near(`sBG β, ${name} (scipy MLE)`, fit.beta, ref.fit[1], 1e-4);
  near(`sBG log-likelihood, ${name} (scipy)`, fit.ll, ref.fit[2], 1e-6);
  near(`sBG α matches the published ${ref.published[0]}`, fit.alpha, ref.published[0], 6e-4);
  near(`sBG β matches the published ${ref.published[1]}`, fit.beta, ref.published[1], 6e-4);
}
for (const [a, b, d, want] of REF.sbg.del) near(`Discounted expected lifetime α=${a}, β=${b}, d=${d} (scipy hyp2f1)`, R.sbgDEL(a, b, d), want, 1e-8);
near('Undiscounted mean lifetime (α + β − 1)/(α − 1) equals the series as d → 0', R.sbgDEL(2.5, 4, 1e-12), R.sbgDEL(2.5, 4, 0), 1e-4);
const pc = R.parseCohortTable('cohort, users, m1, m2\nJan, 100, 60, 40\nFeb, 200, 110');
same('Cohort table: header skipped, counts read', pc.cohorts.map((c) => c.counts), [[100, 60, 40], [200, 110]]);
near('Weighted average retention at period 1 by hand (170/300)', R.retention(pc.cohorts).avgCurve[1].rate, 170 / 300, 1e-12);
const evs = R.cohortsFromEvents('u1, 2026-08-03, 2026-08-03\nu1, 2026-08-03, 2026-08-11\nu2, 2026-08-04, 2026-08-04\nu3, 2026-08-12, 2026-08-12\nu3, 2026-08-12, 2026-08-19', 'week');
same('Event list: weekly cohorts and counts', evs.cohorts.map((c) => [c.label, c.counts]), [['2026-08-03', [2, 1, 0]], ['2026-08-10', [1, 1]]]);
const plf = R.powerLawFit([{ k: 0, rate: 1 }, { k: 1, rate: 0.5 }, { k: 2, rate: 0.5 * 2 ** -0.7 }, { k: 4, rate: 0.5 * 4 ** -0.7 }]);
same('Power law recovers a = 0.5, b = 0.7 exactly', [+plf.a.toFixed(9), +plf.b.toFixed(9)], [0.5, 0.7]);
const ue = R.unitEconomics({ arpu: 50, margin: 0.8, churn: 0.05, cac: 400, annualRate: 0 });
same('Unit economics by hand: CLV 40/0.05 = 800, payback 10 months, with churn 14 months (40·(1 − 0.95ᵀ)/0.05 ≥ 400 → T ≥ 13.5)', [Math.round(ue.simple), +ue.payback.toFixed(9), ue.churnPayback], [800, 10, 14]);
near('Discounted CLV with d = 0 equals the simple CLV', ue.discounted, 800, 1e-9);
const fA = R.funnel(REF.funnel.a.map((count, i) => ({ name: `s${i}`, count })));
fA.rows.slice(1).forEach((r, i) => { near(`Funnel step ${i + 1} Wilson lower (statsmodels)`, r.stepCI.lo, REF.funnel.wilson[i][0], 1e-12); near(`Funnel step ${i + 1} Wilson upper (statsmodels)`, r.stepCI.hi, REF.funnel.wilson[i][1], 1e-12); });
const cf = R.compareFunnels(REF.funnel.a.map((count, i) => ({ name: `s${i}`, count })), REF.funnel.b.map((count, i) => ({ name: `s${i}`, count })));
nearAll('Segment z per step (statsmodels proportions_ztest)', cf.steps.map((s) => s.z), REF.funnel.z.map((z) => z[0]), 1e-9);
nearAll('Segment p per step (statsmodels)', cf.steps.map((s) => s.p), REF.funnel.z.map((z) => z[1]), 1e-12);
nearAll('Segment p, Holm (statsmodels multipletests)', cf.steps.map((s) => s.pHolm), REF.funnel.holm, 1e-12);
const paths = R.parsePaths(REF.markov.paths.map(([p, n]) => `${p}, ${n}`).join('\n'), 'Buy').paths;
const re = R.removalEffects(paths);
near('Markov: P(conversion) from the start (numpy solve)', re.base.pConv, REF.markov.pConv, 1e-12);
for (const e of re.effects) near(`Markov removal effect of ${e.step} (numpy)`, e.effect, REF.markov.removal[e.step], 1e-12);
near('Removal-effect shares sum to 1', re.effects.reduce((s, e) => s + e.share, 0), 1, 1e-12);
const vg = R.viral({ invites: 3, conv: 0.12, cycle: 7, start: 5000, horizon: 42 });
near('Viral total by hand: 5000(1 − 0.36⁷)/(1 − 0.36)', vg.total, (5000 * (1 - 0.36 ** 7)) / 0.64, 1e-9);
const cs = summary('Cohorts', R.cohortSummary({ ret: R.retention(R.parseCohortTable('2026-01, 1840, 1404, 1167, 988, 854, 773, 695\n2026-02, 1625, 1243, 1031, 873, 761, 674\n2026-03, 1990, 1549, 1282, 1074, 926\n2026-04, 2210, 1663, 1355, 1143\n2026-05, 1765, 1367, 1128\n2026-06, 2050, 1549\n2026-07, 1930').cohorts), fit: R.sbgFit(R.parseCohortTable('2026-01, 1840, 1404, 1167, 988, 854, 773, 695\n2026-02, 1625, 1243, 1031, 873, 761, 674').cohorts), pl: plf, unit: 'month', horizon: 12 }), 'shifted-beta-geometric');
truthy('Cohort summary: projections assume the future behaves like the past; cites Fader and Hardie', cs.caveats[0].startsWith('Retention projections assume the future behaves like the past') && cs.report.includes('Fader and Hardie 2007'));
same('Cohort example (7 cohorts, 6 periods, ~1,900 users): strong evidence', cs.confidence, 'high');
summary('Stickiness', R.stickinessSummary(R.stickiness({ dau: 4200, wau: 11800, mau: 24500 }), { dau: 4200, wau: 11800, mau: 24500 }), 'DAU/MAU is 17.1%');
const us = summary('Unit economics', R.unitSummary(R.unitEconomics({ arpu: 49, margin: 0.8, churn: 0.045, cac: 420, annualRate: 0.1, alpha: 0.9, beta: 9 }), { churn: 0.045, cac: 420 }), '1.8 times');
truthy('Unit summary: cites the source of the 3:1 benchmark', us.meaning.some((m) => m.includes('Skok')));
summary('Funnel', R.funnelSummary(fA, cf, ['Mobile', 'Desktop']), 'biggest drop-off');
summary('Markov', R.markovSummary(re), 'removal effect');
summary('Viral', R.viralSummary(vg, { invites: 3, conv: 0.12, cycle: 7, start: 5000, horizon: 42 }), 'K = 0.36');

// ── Meta-analysis ──
const bcgRows = REF.meta.bcg.map(([a, b, c, d], i) => ({ study: `T${i + 1}`, type: 'props', v: [a, a + b, c, c + d], mod: ['random', 'random', 'random', 'random', 'alternate', 'alternate', 'random', 'random', 'random', 'systematic', 'systematic', 'systematic', 'systematic'][i] }));
const bcg = X.prepare(bcgRows, 'logrr').studies;
const reml = X.pool(bcg, { method: 'reml' });
// Published metafor output for dat.bcg, measure = "RR" (metadat dat.bcg and metafor confint.rma help pages).
near('dat.bcg REML estimate (metafor −0.7145)', reml.random.est, -0.7145, 5e-5);
near('dat.bcg REML SE (metafor 0.1798)', reml.random.se, 0.1798, 5e-5);
near('dat.bcg REML CI lower (metafor −1.0669)', reml.random.lo, -1.0669, 5e-5);
near('dat.bcg REML CI upper (metafor −0.3622)', reml.random.hi, -0.3622, 5e-5);
near('dat.bcg τ² REML (metafor 0.3132)', reml.tau2, 0.3132, 5e-5);
near('dat.bcg I² (metafor 92.22%)', reml.i2 * 100, 92.22, 5e-3);
near('dat.bcg H² (metafor 12.86)', reml.h2, 12.86, 5e-3);
near('dat.bcg Q (metafor 152.2330)', reml.Q, 152.233, 5e-4);
near('dat.bcg τ² Q-profile CI lower (metafor confint 0.1197)', reml.tau2CI[0], 0.1197, 5e-5);
near('dat.bcg τ² Q-profile CI upper (metafor 1.1115)', reml.tau2CI[1], 1.1115, 5e-5);
near('dat.bcg I² CI lower (metafor 81.9177%; metafor stops at uniroot tolerance, so within 0.005)', reml.i2CI[0] * 100, 81.9177, 5e-3);
nearAll('dat.bcg τ² Q-profile CI, exact root (scipy brentq)', reml.tau2CI, REF.meta.qprofile.tau2, 1e-9);
nearAll('dat.bcg I² CI, exact root (scipy brentq)', reml.i2CI, REF.meta.qprofile.i2, 1e-9);
near('dat.bcg I² CI upper (metafor 97.6781%)', reml.i2CI[1] * 100, 97.6781, 5e-4);
near('dat.bcg prediction interval, z (metafor predict RR 0.1546)', Math.exp(reml.piZ.lo), 0.1546, 5e-5);
near('dat.bcg prediction interval, z (metafor predict RR 1.5490)', Math.exp(reml.piZ.hi), 1.549, 5e-4);
const dl = X.pool(bcg, { method: 'dl' }), DL = REF.meta.dl;
near('dat.bcg DL estimate (statsmodels combine_effects)', dl.random.est, DL.est, 1e-10);
near('dat.bcg DL SE (statsmodels)', dl.random.se, DL.se, 1e-10);
near('dat.bcg DL τ² (statsmodels)', dl.tau2, DL.tau2, 1e-10);
near('dat.bcg DL I² (statsmodels)', dl.i2, DL.i2, 1e-10);
near('dat.bcg fixed effect (statsmodels)', dl.fixed.est, DL.fe, 1e-10);
near('dat.bcg fixed-effect SE (statsmodels)', dl.fixed.se, DL.feSe, 1e-10);
near('dat.bcg prediction interval lower, t on k − 2 df (by hand in scipy)', dl.pi.lo, DL.pi[0], 1e-9);
near('dat.bcg prediction interval upper (scipy)', dl.pi.hi, DL.pi[1], 1e-9);
const pmr = X.pool(bcg, { method: 'pm' });
near('dat.bcg Paule-Mandel τ² (statsmodels method_re="iterated")', pmr.tau2, REF.meta.pm.tau2, 1e-6);
near('dat.bcg Paule-Mandel estimate (statsmodels)', pmr.random.est, REF.meta.pm.est, 1e-7);
const hk = X.pool(bcg, { method: 'dl', hk: true });
near('Hartung-Knapp SE (statsmodels "random effect wls", use_t)', hk.random.se, REF.meta.hk.se, 1e-10);
near('Hartung-Knapp CI lower (statsmodels)', hk.random.lo, REF.meta.hk.lo, 1e-9);
near('Hartung-Knapp CI upper (statsmodels)', hk.random.hi, REF.meta.hk.hi, 1e-9);
// metafor trimfill help page, dat.bcg.
const tfEE = X.trimFill(bcg, { model: 'fixed', method: 'reml' });
same('Trim-and-fill, equal effects, L0: 4 missing on the right (metafor)', [tfEE.k0, tfEE.side], [4, 'right']);
near('Trim-and-fill EE: SE of k0 (metafor 2.3853)', tfEE.se, 2.3853, 5e-5);
near('Trim-and-fill EE: filled estimate (metafor −0.2910)', tfEE.est.est, -0.291, 5e-5);
near('Trim-and-fill EE: filled SE (metafor 0.0383)', tfEE.est.se, 0.0383, 5e-5);
const tfR0 = X.trimFill(bcg, { model: 'fixed', method: 'reml', estimator: 'R0' });
same('Trim-and-fill R0: 4 missing (metafor)', tfR0.k0, 4);
near('Trim-and-fill R0: SE (metafor 3.1623)', tfR0.se, 3.1623, 5e-5);
near('Trim-and-fill R0: test of no missing studies (metafor prints p = 0.0312; exact 1/32)', tfR0.pR0, 1 / 32, 1e-12);
const tfRE = X.trimFill(bcg, { model: 'random', method: 'reml' });
same('Trim-and-fill, random effects: 1 missing on the right (metafor)', [tfRE.k0, tfRE.side], [1, 'right']);
near('Trim-and-fill RE: SE of k0 (metafor 2.4528)', tfRE.se, 2.4528, 5e-5);
near('Trim-and-fill RE: filled estimate (metafor −0.6571)', tfRE.est.est, -0.6571, 5e-5);
near('Trim-and-fill RE: filled CI lower (metafor −1.0070)', tfRE.est.lo, -1.007, 5e-5);
near('Trim-and-fill RE: τ² after filling (metafor 0.3313)', tfRE.pooled.tau2, 0.3313, 5e-5);
near('Trim-and-fill RE: I² after filling (metafor 92.14%)', tfRE.pooled.i2 * 100, 92.14, 5e-3);
// metafor regtest help page: dat.egger2001 without ISIS-4, log odds ratios.
const egRows = [[1, 40, 2, 36], [9, 135, 23, 135], [2, 200, 7, 200], [1, 48, 1, 46], [10, 150, 8, 148], [1, 59, 9, 56], [1, 25, 3, 23], [0, 22, 1, 21], [6, 76, 11, 75], [1, 27, 7, 27], [2, 89, 12, 80], [5, 23, 13, 33], [4, 130, 8, 122], [90, 1159, 118, 1157], [4, 107, 17, 108]];
const mag = X.prepare(egRows.map((v, i) => ({ study: `M${i}`, type: 'props', v, mod: '' })), 'logor').studies;
const eg = X.egger(mag);
near("Egger's test t, dat.egger2001 (metafor regtest model='lm': −3.1783)", eg.t, -3.1783, 5e-5);
near("Egger's test p (metafor 0.0073)", eg.p, 0.0073, 5e-5);
same("Egger's test df (metafor 13)", eg.df, 13);
near('Egger limit estimate (metafor −0.1512)', eg.limit, -0.1512, 5e-5);
near('Egger limit CI lower (metafor −0.5130)', eg.limitLo, -0.513, 5e-5);
near('Egger limit CI upper (metafor 0.2106)', eg.limitHi, 0.2106, 5e-5);
near('dat.egger2001 REML estimate (metafor −0.8745)', X.pool(mag, { method: 'reml' }).random.est, -0.8745, 5e-5);
near('dat.egger2001 REML SE (metafor 0.2080)', X.pool(mag, { method: 'reml' }).random.se, 0.208, 5e-5);
// SMD from means: statsmodels effectsize_smd and PythonMeta.
const smdRows = X.parseStudies(REF.meta.smd.rows.map((r) => { const [s, ...v] = r.split(','); return `${s}, means, ${v.join(',')}`; }).join('\n')).rows;
const smd = X.prepare(smdRows, 'smd').studies;
nearAll("Hedges' g from means (statsmodels effectsize_smd)", smd.map((s) => s.yi), REF.meta.smd.g, 1e-12);
nearAll("Variance of g (statsmodels / PythonMeta, N − 3.94 formula)", smd.map((s) => s.vi), REF.meta.smd.v, 1e-12);
const smdP = X.pool(smd, { method: 'dl' });
near('Pooled SMD, random effects DL (PythonMeta)', smdP.random.est, REF.meta.smd.pooled, 1e-9);
near('Pooled SMD SE (PythonMeta)', smdP.random.se, REF.meta.smd.se, 1e-9);
// PythonMeta rounds z to 1.96, so rebuild its interval with 1.96 to compare.
near('Pooled SMD CI lower with z = 1.96 (PythonMeta)', smdP.random.est - 1.96 * smdP.random.se, REF.meta.smd.lo, 1e-9);
near('Pooled SMD CI upper with z = 1.96 (PythonMeta)', smdP.random.est + 1.96 * smdP.random.se, REF.meta.smd.hi, 1e-9);
near('Q for the SMD studies (PythonMeta)', smdP.Q, REF.meta.smd.Q, 1e-9);
near("Egger intercept for the SMD studies (PythonMeta Eggers_test)", X.egger(smd).intercept, REF.meta.smd.eggerIntercept, 1e-9);
// Conversions (Borenstein et al. 2009): ln OR → d multiplies by √3/π; r → z is atanh with V = 1/(n − 3).
const conv = X.effectOf({ type: 'props', v: [20, 100, 10, 100] }, 'logor');
near('Log OR by hand: ln((20·90)/(80·10))', conv.yi, Math.log((20 * 90) / (80 * 10)), 1e-12);
const zr = X.effectOf({ type: 'r', v: [0.3, 53] }, 'z');
same("Fisher's z by hand: atanh(0.3), 1/50", [+zr.yi.toFixed(12), zr.vi], [+Math.atanh(0.3).toFixed(12), 0.02]);
const sub = X.subgroups(bcg, { method: 'reml' });
const w = sub.groups.map((g) => 1 / g.se ** 2), mu = w.reduce((s, x, i) => s + x * sub.groups[i].est, 0) / w.reduce((a, b) => a + b, 0);
near('Subgroup Q_between by hand from the subgroup estimates', sub.Qb, w.reduce((s, x, i) => s + x * (sub.groups[i].est - mu) ** 2, 0), 1e-12);
same('Subgroup levels for allocation', sub.groups.map((g) => [g.level, g.k]), [['random', 7], ['alternate', 2], ['systematic', 4]]);
const loo = X.leaveOneOut(bcg, { method: 'reml' });
near('Leave-one-out, first study, equals a fresh fit without it', loo[0].est, X.pool(bcg.slice(1), { method: 'reml' }).random.est, 1e-12);
const parsed = X.parseStudies('# comment\nA, means, 1, 1, 10, 0, 1, 10, Lab\nB, es, 0.2, 0.1\nC, wrong, 1, 2\nD, d, 0.5, 20');
same('Study parsing: types, moderators and bad lines', [parsed.rows.map((r) => [r.type, r.mod]), parsed.bad], [[['means', 'Lab'], ['es', '']], [4, 5]]);
const ms = summary('Meta-analysis', X.metaSummary({ r: reml, metric: 'logrr', eg: X.egger(bcg), tf: tfRE, loo, sub, studies: bcg }), 'risk ratio: 0.49');
truthy('Meta summary: I² is not the size of the heterogeneity in absolute terms', ms.caveats[0].startsWith('I² is not the size of the heterogeneity in absolute terms'));
const fewS = X.pool(bcg.slice(0, 3), { method: 'reml' });
const fewSum = summary('Meta-analysis with 3 studies', X.metaSummary({ r: fewS, metric: 'logrr', eg: X.egger(bcg.slice(0, 3)), tf: X.trimFill(bcg.slice(0, 3), { method: 'reml' }), loo: X.leaveOneOut(bcg.slice(0, 3), { method: 'reml' }), sub: null, studies: bcg.slice(0, 3) }));
same('3 studies: weak evidence', fewSum.confidence, 'low');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
