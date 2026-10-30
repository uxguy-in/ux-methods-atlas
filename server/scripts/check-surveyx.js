// Checks the surveyx tools (non-response checks, sensitive questions, scaling from comparisons, importance-performance,
// anchoring vignettes, norms and standard scores) against scipy, numpy and statsmodels
// (server/scripts/surveyx-reference.py → surveyx-reference.json, run on the page examples dumped by surveyx-dump.js)
// and against hand-worked cases: AAPOR Standard Definitions formulas, Warner (1965), King and Wand (2007) C coding,
// stanine and sten band edges. Also checks every "Reading your results" summary.
// Run with `npm run check:surveyx`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../client/src/calc/tools/surveyx-core.js';
import * as E from '../../client/src/calc/tools/surveyx-examples.js';
import * as NR from '../../client/src/calc/tools/surveyx-nonresponse.js';
import * as SE from '../../client/src/calc/tools/surveyx-sensitive.js';
import * as PA from '../../client/src/calc/tools/surveyx-paired.js';
import * as IP from '../../client/src/calc/tools/surveyx-ipa.js';
import * as VG from '../../client/src/calc/tools/surveyx-vignettes.js';
import * as NO from '../../client/src/calc/tools/surveyx-norms.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'surveyx-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'surveyx-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
const LINKS = /^\/calculators\/(survey-weighting|maxdiff-runner|item-analysis|key-drivers|questionnaires)$/;
function summary(label, s, key, level, rkey) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  for (const k of [].concat(rkey || [])) truthy(`${label}: report contains "${k}"`, s.report.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is a calculator page`, LINKS.test(m[1]));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}

// ── The page examples are the datasets the Python reference used ──
same('Example datasets on the pages = reference input', [E.EX_DISP, E.exWaves(), E.exFrame(), E.EX_LIST, E.exPairs(), E.exGuttman(), E.EX_STATED, E.exDerived(), E.EX_KAP, E.EX_AWARE, E.exVignettes(), E.exNormSample()],
  [INP.disp, INP.waves, INP.frame, INP.list, INP.pairs, INP.guttman, INP.stated, INP.derived, INP.kap, INP.aware, INP.vignettes, INP.normSample]);

// ── Core helpers ──
near('Wilson 95% interval 7/20, lower (statsmodels 0.18117)', K.wilson(7, 20).lo, 0.18117, 5e-5);
near('Chi-square upper tail χ² = 15.36, 10 df (scipy 0.1194142)', K.chi2Sf(15.36189722177408, 10), 0.1194142023554441, 1e-10);

// ── 1. Non-response: AAPOR rates ──
const a = NR.aapor(E.EX_DISP);
for (const k of Object.keys(REF.aapor)) near(`AAPOR ${k}`, a[k], REF.aapor[k], 1e-12);
same('AAPOR denominators: total sampled = all dispositions', a.total, Object.values(E.EX_DISP).reduce((x, y) => x + y, 0));
near('AAPOR RR3 with e given as 0.5', NR.aapor(E.EX_DISP, 0.5).RR3, 412 / (412 + 38 + 96 + 231 + 12 + 0.5 * 1221), 1e-12);
near('AAPOR RR5 = RR3 with e = 0', NR.aapor(E.EX_DISP, 0).RR3, a.RR5, 1e-12);
const sumA = summary('Response rates example', NR.ratesSummary(a), ['AAPOR response rate 3', '412 completes'], 'low', 'RR3');
summary('Response rates: few unknowns', NR.ratesSummary(NR.aapor({ I: 600, P: 20, R: 150, NC: 100, O: 5, UH: 40, UO: 0, NE: 30 })), 'AAPOR', 'high');
summary('Response rates: some unknowns', NR.ratesSummary(NR.aapor({ I: 600, P: 20, R: 150, NC: 100, O: 5, UH: 160, UO: 0, NE: 30 })), 'AAPOR', 'medium');
truthy('Response-rate summary cites Groves and Peytcheva (2008) for the rate-bias link', sumA.meaning.join(' ').includes('Groves and Peytcheva'));

// Early vs late
const tdat = NR.timingData(E.exWaves(), 0);
const el = NR.earlyLate(tdat, 'wave', [2, 3, 4], 1500);
for (const res of el.results) {
  const R = REF.earlyLate[res.name];
  near(`${res.name}: late − early difference (scipy Welch)`, res.w.d, R.welch.d, 1e-12);
  near(`${res.name}: Welch t`, res.w.t, R.welch.t, 1e-9);
  near(`${res.name}: Welch df`, res.w.df, R.welch.df, 1e-8);
  near(`${res.name}: Welch p`, res.w.p, R.welch.p, 1e-8);
  near(`${res.name}: 95% CI lower`, res.w.lo, R.welch.lo, 1e-8);
  near(`${res.name}: 95% CI upper`, res.w.hi, R.welch.hi, 1e-8);
  near(`${res.name}: slope per wave (scipy linregress)`, res.trend.b, R.slope, 1e-12);
  near(`${res.name}: slope p`, res.trend.p, R.slopeP, 1e-8);
  same(`${res.name}: wave means`, res.waves.map((w) => +w.mean.toFixed(10)), R.waveMeans.map((v) => +v.toFixed(10)));
  near(`${res.name}: continuum-of-resistance extrapolation (wave 4, clamped)`, res.extrap, R.extrap, 1e-10);
  near(`${res.name}: mean with 1,500 non-respondents at the extrapolated value`, res.adjusted, R.adjusted1500, 1e-10);
}
const elDays = NR.earlyLate(NR.timingData(E.exWaves(), 1), 'median', [2]);
near('Median split on days: satisfaction difference (scipy Welch)', elDays.results[0].w.d, REF.earlyLate.medianSplitSatisfaction.d, 1e-12);
near('Median split on days: p', elDays.results[0].w.p, REF.earlyLate.medianSplitSatisfaction.p, 1e-8);
summary('Early vs late example', NR.earlyLateSummary(el), 'differ between early and late', 'high', 'Welch');
const elSmall = NR.earlyLate(NR.timingData(E.exWaves().split('\n').filter((l, i) => i === 0 || i % 12 === 1).join('\n'), 0), 'wave', [2, 3, 4], 0);
summary('Early vs late: small subsample', NR.earlyLateSummary(elSmall), 'early and late', 'low');

// R-indicator
const auxCols = [2, 3, 4, 5];
const ri = NR.rIndicator(E.exFrame(), 1, auxCols, { boot: 200 });
near('R-indicator R = 1 − 2 S(ρ) (statsmodels Logit)', ri.R, REF.rindicator.R, 1e-8);
near('R-indicator: SD of propensities', ri.S, REF.rindicator.S, 1e-8);
near('R-indicator: mean propensity = response rate', ri.mean, REF.rindicator.mean, 1e-8);
near('R-indicator: CV of propensities (maximal standardised bias)', ri.maxBias, REF.rindicator.cv, 1e-8);
REF.rindicator.beta.forEach((b, i) => near(`Response model coefficient ${i} (statsmodels)`, ri.beta[i], b, 1e-6));
for (const p of ri.partials) near(`Unconditional partial R-indicator for ${p.name}`, p.pu, REF.rindicator.partial[p.name], 1e-8);
truthy(`Bootstrap CI for R contains R (${ri.ci.map((v) => v.toFixed(3))})`, ri.ci[0] < ri.R && ri.R < ri.ci[1] && ri.nBoot >= 190);
same('R-indicator: worker job produces the same R', (await import('../../client/src/calc/tools/surveyx-nonresponse.js')).rIndicator(E.exFrame(), 1, auxCols, { boot: 200 }).R, ri.R);
summary('R-indicator example', NR.rIndicatorSummary(ri), 'R-indicator 0.77', 'high', 'R-indicator of 0.773');
const riSmall = NR.rIndicator(E.exFrame().split('\n').slice(0, 151).join('\n'), 1, auxCols, { boot: 100 });
summary('R-indicator: 150 cases', NR.rIndicatorSummary(riSmall), 'R-indicator', 'low');
truthy('R-indicator rejects a missing response column', NR.rIndicator(E.exFrame(), -1, auxCols).error);
truthy('R-indicator rejects when everyone responded', NR.rIndicator(E.exFrame().replace(/,0,/g, ',1,'), 1, auxCols).error);

// ── 2. Sensitive questions ──
const le = SE.listExperiment(E.EX_LIST.control, E.EX_LIST.treat, { direct: E.EX_LIST.direct });
near('List experiment: difference in means (scipy)', le.est, REF.list.est, 1e-12);
near('List experiment: SE', le.se, REF.list.se, 1e-12);
near('List experiment: Welch df', le.df, REF.list.df, 1e-8);
near('List experiment: 95% CI lower', le.lo, REF.list.lo, 1e-8);
near('List experiment: 95% CI upper', le.hi, REF.list.hi, 1e-8);
near('List experiment: p', le.p, REF.list.p, 1e-8);
same('Blair-Imai joint proportions π(y, z)', le.pis.map((x) => +x.est.toFixed(12)), REF.list.pis.map((x) => +x.toFixed(12)));
near('Blair-Imai design-effect test, Bonferroni p', le.deP, REF.list.deP, 1e-10);
near('List vs direct question gap', le.direct.gap, REF.list.directGap, 1e-12);
summary('List experiment example', SE.listSummary(le, E.EX_LIST.label), ['About 25%', 'shared their password'], 'medium', 'Blair-Imai');
const leBad = SE.listExperiment([10, 60, 120, 110], [30, 40, 110, 100, 20]);
truthy('A design effect is flagged when adding the item moves control answers', leBad.deP < 0.05);
summary('List experiment: design effect and ceiling (SE 7.8 points)', SE.listSummary(leBad), 'About', 'medium');
summary('List experiment: negative estimate is shown cut to 0%', SE.listSummary(SE.listExperiment([20, 50, 40, 10], [25, 50, 35, 10, 0])), ['About 0%', 'cut to 0–100%'], 'low');
summary('List experiment: large clean sample', SE.listSummary(SE.listExperiment([150, 900, 800, 150], [120, 800, 820, 230, 30])), 'About', 'high');
const rf = SE.randomisedResponse(E.EX_RR);
near('Forced response estimate (λ − p_yes) ÷ p_truth', rf.est, REF.rrForced.est, 1e-12);
near('Forced response SE', rf.se, REF.rrForced.se, 1e-12);
const rw = SE.randomisedResponse({ design: 'warner', yes: 380, n: 1000, p: 0.7 });
near('Warner (1965) estimate, p = 0.7, 380/1000 yes: (0.38 − 0.3) ÷ 0.4 = 0.2', rw.est, REF.rrWarner.est, 1e-12);
near('Warner SE √(λ(1 − λ) ÷ (n(2p − 1)²))', rw.se, REF.rrWarner.se, 1e-12);
near('Warner P(trait | yes) at π = 0.2: 0.7·0.2 ÷ 0.38', rw.givenYes, (0.7 * 0.2) / 0.38, 1e-12);
summary('Randomised response example', SE.rrSummary(rf, E.EX_RR.label), ['About 25%', 'work account'], 'high', 'forced-response');
summary('Randomised response: Warner, n = 1000', SE.rrSummary(rw), 'About 20%', 'medium');
summary('Randomised response: outside 0–1', SE.rrSummary(SE.randomisedResponse({ design: 'forced', yes: 50, n: 600, pYes: 1 / 6, pNo: 1 / 6 })), ['About 0%', '95% CI 0% to 0%'], 'low');
summary('Randomised response: big sample', SE.rrSummary(SE.randomisedResponse({ design: 'forced', yes: 1500, n: 5000, pYes: 0.1, pNo: 0.1 })), 'About', 'high');
truthy('Warner rejects p = 0.5', SE.randomisedResponse({ design: 'warner', yes: 10, n: 20, p: 0.5 }).error);

// ── 3. Scaling from comparisons ──
const pc = PA.parseComparisons(E.exPairs());
same('Win matrix parsed', [pc.names, pc.W[0]], [E.EX_PAIR_NAMES, [0, 15, 22, 34, 33, 38]]);
const th = PA.thurstone(pc.W);
th.s.forEach((v, i) => near(`Thurstone Case V scale value ${pc.names[i]} (numpy lstsq)`, v, REF.thurstone.s[i], 1e-10));
const bt = PA.bradleyTerry(pc.W);
bt.items.forEach((it, i) => {
  near(`Bradley-Terry log-worth vs item 1, ${pc.names[i]} (statsmodels GLM)`, it.betaRef, REF.bt.betaRef[i], 1e-7);
  near(`Bradley-Terry SE vs item 1, ${pc.names[i]}`, it.seRef, REF.bt.seRef[i], 1e-7);
  near(`Bradley-Terry centred SE, ${pc.names[i]}`, it.se, REF.bt.se[i], 1e-7);
  near(`Bradley-Terry worth, ${pc.names[i]}`, it.worth, REF.bt.worth[i], 1e-8);
});
near('Bradley-Terry deviance (statsmodels)', bt.dev, REF.bt.dev, 1e-7);
same('Bradley-Terry residual df', bt.df, REF.bt.df);
near('Bradley-Terry P(screenshot beats quote)', bt.prob[0][1], REF.bt.p12, 1e-8);
const pairText = 'winner,loser\nA,B\nA,B\nB,A\nB,C\nC,A\nA,C\nC,B';
same('Pairs list parsed into a matrix', PA.parseComparisons(pairText).W, [[0, 2, 1], [1, 0, 1], [1, 1, 0]]);
truthy('Bradley-Terry refuses an item that never lost', PA.bradleyTerry([[0, 3, 2], [0, 0, 1], [0, 1, 0]]).error);
summary('Paired comparisons example', PA.pairedSummary(bt, th, pc.names), 'Product screenshot is preferred most', 'high', 'Bradley-Terry');
const few = PA.parseComparisons(E.exPairs().replace(/\d+/g, (m) => String(Math.max(1, Math.round(Number(m) / 8)))));
const btF = PA.bradleyTerry(few.W.map((r, i) => r.map((v, j) => (i === j ? 0 : v))));
summary('Paired comparisons: 5 per pair', PA.pairedSummary(btF, PA.thurstone(few.W.map((r, i) => r.map((v, j) => (i === j ? 0 : v)))), few.names), 'preferred most', 'low');
const gb = PA.parseBinary(E.exGuttman());
const gg = PA.guttman(gb.X, gb.items);
same('Guttman: Goodenough-Edwards error count', gg.errors, REF.guttman.errors);
near('Guttman coefficient of reproducibility', gg.CR, REF.guttman.CR, 1e-12);
near('Guttman minimum marginal reproducibility', gg.MMR, REF.guttman.MMR, 1e-12);
near('Guttman coefficient of scalability', gg.CS, REF.guttman.CS, 1e-12);
near('Loevinger H (covariance route, numpy)', gg.H, REF.guttman.H, 1e-10);
for (const it of gg.items) near(`Item H for ${it.name}`, it.Hj, REF.guttman.Hj[it.j], 1e-10);
// Perfect scale: CR = 1 and H = 1.
const perfect = PA.guttman([[1, 1, 1], [1, 1, 0], [1, 0, 0], [0, 0, 0], [1, 1, 0]], ['a', 'b', 'c']);
same('A perfect cumulative pattern has CR = 1 and H = 1', [perfect.CR, +perfect.H.toFixed(12)], [1, 1]);
summary('Guttman example', PA.guttmanSummary(gg), 'form a Guttman scale', 'high', 'reproducibility 0.973');
const rnd = K.rng(5), noisy = Array.from({ length: 40 }, () => [0, 1, 2, 3].map(() => (rnd() < 0.5 ? 1 : 0)));
summary('Guttman: random answers', PA.guttmanSummary(PA.guttman(noisy, ['w', 'x', 'y', 'z'])), 'do not form', 'low');

// ── 4. Importance-performance ──
const st = IP.parseStated(E.EX_STATED);
const ipM = IP.ipa(st.attrs, { cross: 'mean' }), ipMed = IP.ipa(st.attrs, { cross: 'median' });
near('IPA crosshair: mean importance', ipM.ci, REF.ipaStated.meanI, 1e-12);
near('IPA crosshair: mean performance', ipM.cp, REF.ipaStated.meanP, 1e-12);
near('IPA crosshair: median importance', ipMed.ci, REF.ipaStated.medI, 1e-12);
same('IPA quadrants at means', ipM.attrs.map((x) => x.q), REF.ipaStated.quadsMean);
same('IPA quadrants at medians', ipMed.attrs.map((x) => x.q), REF.ipaStated.quadsMedian);
summary('IPA stated example', IP.ipaSummary(ipM, { n: E.EX_STATED_N }), 'Concentrate here', 'high', 'stated importance');
summary('IPA stated: n unknown', IP.ipaSummary(ipM, {}), 'Concentrate here', 'low');
const dv = IP.deriveImportance(E.exDerived(), -1, 'pearson');
dv.attrs.forEach((x, i) => {
  near(`Derived importance r, ${x.name} (scipy pearsonr)`, x.imp, REF.ipaDerived[i].r, 1e-12);
  near(`Derived importance p, ${x.name}`, x.p, REF.ipaDerived[i].p, 1e-8);
  near(`Derived importance Fisher-z CI lower, ${x.name}`, x.lo, REF.ipaDerived[i].lo, 1e-10);
  near(`Performance mean, ${x.name}`, x.perf, REF.ipaDerived[i].mean, 1e-12);
});
IP.deriveImportance(E.exDerived(), -1, 'spearman').attrs.forEach((x, i) => near(`Derived importance Spearman ρ, ${x.name} (scipy)`, x.imp, REF.ipaDerived[i].rho, 1e-12));
summary('IPA derived example', IP.ipaSummary(IP.ipa(dv.attrs), { n: dv.n, derived: true, outcome: dv.outcome }), 'attribute', 'high', 'Overall_satisfaction');
const kp = IP.kap(IP.parseKap(E.EX_KAP).rows);
kp.forEach((r, i) => {
  near(`KAP ${r.name}: know Wilson lower (statsmodels)`, r.K.lo, REF.kap[i].know[0], 1e-12);
  near(`KAP ${r.name}: practise Wilson upper`, r.P.hi, REF.kap[i].practise[1], 1e-12);
  near(`KAP ${r.name}: know-but-not-favour drop, Wilson lower`, r.drops[1].lo, REF.kap[i].dropAttitude[0], 1e-12);
});
same('KAP: biggest drop for two-factor authentication is favour → practise', kp[0].worst.stage, 'practice');
summary('KAP example', IP.kapSummary(kp), 'Two-factor', 'high', 'Two-factor');
const aw = IP.awareness(IP.parseAware(E.EX_AWARE).rows);
for (const r of aw) {
  const R = REF.aware.find((x) => x.name === r.name);
  near(`Awareness-usefulness gap ${r.name}`, r.gap, R.gap, 1e-12);
  near(`Newcombe CI lower ${r.name} (statsmodels newcomb)`, r.lo, R.lo, 1e-10);
  near(`Newcombe CI upper ${r.name}`, r.hi, R.hi, 1e-10);
}
same('Awareness-usefulness: largest gap first', aw[0].name, 'Scheduled send');
summary('Awareness-usefulness example', IP.awarenessSummary(aw), 'Scheduled send', 'high', 'Scheduled send');

// ── 5. Anchoring vignettes ──
for (const [key, want] of Object.entries(REF.vignetteCases)) {
  const [y, z1, z2] = key.split('|').map(Number), c = VG.cValue(y, [z1, z2]);
  same(`C for y = ${y}, vignettes (${z1}, ${z2})`, [c.lo, c.hi], want);
}
same('C = 1 below the first vignette, 2J + 1 above the last (J = 3)', [VG.cValue(1, [2, 3, 4]).lo, VG.cValue(5, [2, 3, 4]).lo, VG.cValue(3, [2, 3, 4]).lo], [1, 7, 4]);
const va = VG.analyseVignettes(E.exVignettes());
for (const g of va.groups) {
  const R = REF.vignettes[g.group];
  same(`Vignettes ${g.group}: n and single-value C count`, [g.n, g.nScalar], [R.n, R.nScalar]);
  near(`Vignettes ${g.group}: mean C (single-value cases)`, g.meanC, R.meanC, 1e-12);
  near(`Vignettes ${g.group}: mean C (interval midpoints)`, g.meanCmid, R.meanCmid, 1e-12);
  near(`Vignettes ${g.group}: mean raw self-rating`, g.meanY, R.meanY, 1e-12);
  same(`Vignettes ${g.group}: C distribution (intervals spread evenly)`, g.dist.map((v) => +v.toFixed(12)), R.dist.map((v) => +v.toFixed(12)));
}
summary('Vignettes example', VG.vignetteSummary(va), 'Anchoring changes the comparison', 'medium', 'nonparametric');
const vSmall = VG.analyseVignettes(E.exVignettes().split('\n').filter((l, i) => i === 0 || i % 6 === 1).join('\n'));
summary('Vignettes: 20 per group', VG.vignetteSummary(vSmall), 'scale use', 'low');
summary('Vignettes: one group', VG.vignetteSummary(VG.analyseVignettes(E.exVignettes().split('\n').slice(0, 121).join('\n'))), 'mean C', 'medium');

// ── 6. Norms ──
for (const [z, s, t] of [[-0.25, 5, 5], [-0.2501, 4, 5], [0.25, 6, 6], [0, 5, 6], [-0.0001, 5, 5], [1.75, 9, 9], [2.0, 9, 10], [-3, 1, 1]]) same(`Stanine and sten at z = ${z}`, [NO.stanine(z), NO.sten(z)], [s, t]);
REF.nct.forEach((v, i) => near(`Non-central t cdf case ${i + 1} (scipy nct)`, NO.nctCdf(...[[1.5, 9, 0.8], [-3, 4, -1.2], [40, 599, 38]][i]), v, 2e-6));
const ref = NO.reference({ mode: 'sample', sample: E.exNormSample() });
near('Norm group mean', ref.M, REF.normSample.M, 1e-10);
near('Norm group SD (n − 1)', ref.SD, REF.normSample.SD, 1e-10);
near('Norm group skewness G1 (scipy, bias=False)', ref.skew, REF.normSample.skew, 1e-10);
const conv = K.parseNumbers(E.EX_NORM_SCORES).map((x) => NO.convert(ref, x));
conv.forEach((c, i) => {
  const R = REF.normSample.scores[i];
  near(`Score ${c.x}: z`, c.z, R.z, 1e-10);
  near(`Score ${c.x}: T`, c.T, R.T, 1e-9);
  near(`Score ${c.x}: normal percentile`, c.prNormal, R.prNormal, 1e-10);
  near(`Score ${c.x}: empirical mid-rank percentile = scipy percentileofscore(kind="mean")`, c.prEmp, R.scipyMean, 1e-12);
  near(`Score ${c.x}: Wilson CI lower (statsmodels)`, c.prEmpLo, R.empLo, 1e-12);
  near(`Score ${c.x}: Wilson CI upper`, c.prEmpHi, R.empHi, 1e-12);
  near(`Score ${c.x}: normalised z`, c.zNorm, R.zNorm, 1e-9);
});
truthy('Sample mode gives a Crawford-Garthwaite interval around the normal percentile', conv.every((c) => c.prNormalLo < c.prNormal && c.prNormal < c.prNormalHi));
const refP = NO.reference({ mode: 'params', ...E.EX_NORM_PARAMS });
REF.normParams.forEach((R) => {
  const c = NO.convert(refP, R.x);
  near(`Crawford-Garthwaite 95% CI lower for ${R.x} (n = 380, scipy nct)`, c.prNormalLo, R.ci[0], 2e-5);
  near(`Crawford-Garthwaite 95% CI upper for ${R.x}`, c.prNormalHi, R.ci[1], 2e-5);
});
const cgS = NO.percentileCI(-2, 20);
near('Crawford-Garthwaite lower, z = −2, n = 20', cgS.lo, REF.cgSmall[0], 2e-5);
near('Crawford-Garthwaite upper, z = −2, n = 20', cgS.hi, REF.cgSmall[1], 2e-5);
const tbl = NO.normTable(ref);
same('Norm table: cumulative frequency reaches n', tbl[tbl.length - 1].cum, ref.n);
same('Ordinal suffixes', [1, 2, 3, 4, 11, 12, 13, 21, 22, 99.6].map(NO.ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', 'above 99th']);
summary('Norms example (pasted sample)', NO.normsSummary(ref, conv, { label: 'score' }), 'percentile', Math.abs(ref.skew) < 0.5 ? 'high' : 'medium', 'norm group of n = 600');
summary('Norms: mean and SD with n', NO.normsSummary(refP, K.parseNumbers(E.EX_NORM_SCORES).map((x) => NO.convert(refP, x))), 'percentile', 'high', 'n = 380');
const refU = NO.reference({ mode: 'params', M: 50, SD: 10 });
summary('Norms: size unknown', NO.normsSummary(refU, [NO.convert(refU, 65)]), '93rd percentile', 'low', 'unknown size');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
