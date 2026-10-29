// Checks the Conjoint studio (client/src/calc/tools/conjoint-*.js) against independent references. Run with
// `npm run check:conjoint`. Reference values come from server/scripts/conjoint-reference.py (statsmodels 0.15
// ConditionalLogit and OLS, numpy EM for latent class, a numpy implementation of bayesm's rhierMnlRwMixture, numpy
// design efficiencies and MCMC diagnostics) on the inputs written by conjoint-reference-data.js.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from '../../client/src/calc/tools/conjoint-core.js';
import * as M from '../../client/src/calc/tools/conjoint-models.js';
import * as H from '../../client/src/calc/tools/conjoint-hb.js';
import * as R from '../../client/src/calc/tools/conjoint-report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'conjoint-reference.json'), 'utf8'));
const IN = JSON.parse(readFileSync(path.join(here, 'conjoint-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-6) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${+Number(want).toFixed(9)}, got ${Number.isFinite(got) ? +got.toFixed(9) : got}`);
}
const nearAll = (label, got, want, tol) => { const d = Math.max(...want.map((w, i) => Math.abs(got[i] - w))); near(`${label} (largest difference over ${want.length})`, d, 0, tol); };
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
function summaryShape(label, s, { bayes = false } = {}) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20
    && !/NaN|undefined|Infinity|\bnull\b/.test(text);
  same(`${label}: summary has every part, in words, with no NaN or undefined`, ok, true);
  if (!bayes) same(`${label}: no "chance the true value is in the interval" wording`, /(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?(true|population)/i.test(text), false);
}
const attrsOf = (L, price, pv) => L.map((l, q) => ({ name: `A${q}`, levels: q === price ? pv.map(String) : Array.from({ length: l }, (_, i) => `L${i}`) }));

// ── Designs ──
for (const oa of C.oaLibrary()) same(`Orthogonal array ${oa.name} is strength 2 and 100% D-efficient`, [C.isOrthogonal(oa.rows), +C.linearEfficiency(oa.rows, oa.levels).dEff.toFixed(9)], [true, 100]);
const rateEx = M.exampleTrad('rate');
same('Ratings example uses the L18 array (18 cards, 2 holdouts)', [rateEx.design.method, rateEx.design.cards.length, rateEx.design.holdouts.length], ['Orthogonal array L18 (2^1 3^7)', 18, 2]);
near('Kuhfeld D-efficiency of the ratings cards (numpy)', C.linearEfficiency(IN.rate.cards, IN.rate.L).dEff, REF.eff.rate_cards, 1e-9);
near('Kuhfeld D-efficiency of a D-optimal design with a prohibition (numpy)', C.linearEfficiency(IN.dopt.rows, IN.dopt.L).dEff, REF.eff.dopt, 1e-9);
same('D-optimal design never uses the prohibited pair', IN.dopt.rows.some((r) => r[0] === 0 && r[1] === 2), false);
near('Street-Burgess D-efficiency, example CBC design (numpy)', C.choiceEfficiency(IN.cbc.versions.flat(), IN.cbc.L).dEff, REF.eff.cbc_sb, 1e-9);
near('Street-Burgess D-efficiency, random CBC design (numpy)', C.choiceEfficiency(IN.rndCbc.tasks, IN.rndCbc.L).dEff, REF.eff.rnd_sb, 1e-9);
near('Street-Burgess: a binary foldover pair design is 100% efficient (Street and Burgess 2007)', C.choiceEfficiency([[[0, 0, 0], [1, 1, 1]], [[0, 1, 1], [1, 0, 0]], [[1, 0, 1], [0, 1, 0]], [[1, 1, 0], [0, 0, 1]]], [2, 2, 2]).dEff, 100, 1e-9);
const cbcAttrs = attrsOf(IN.cbc.L, IN.cbc.price, IN.cbc.priceValues);
const cbcCoder = C.makeCoder(cbcAttrs, { price: IN.cbc.price, priceValues: IN.cbc.priceValues, none: true });
nearAll('Expected standard errors at n = 200, β = 0 (numpy)', C.expectedSE(IN.cbc.versions, cbcCoder, 200).se, REF.expected_se_200, 1e-12);
const L5 = [4, 3, 2, 3, 3];
const effOf = (m) => C.cbcDiagnostics(C.cbcDesign(L5, { method: m, seed: 1 }), L5);
const [eR, eB, eE] = ['random', 'balanced', 'enumeration'].map(effOf);
truthy(`Complete enumeration is more efficient than balanced overlap, which beats random (${eE.eff.dEff.toFixed(1)} > ${eB.eff.dEff.toFixed(1)} > ${eR.eff.dEff.toFixed(1)})`, eE.eff.dEff > eB.eff.dEff && eB.eff.dEff > eR.eff.dEff);
truthy('Complete enumeration has no overlap on attributes with at least as many levels as alternatives', eE.overlap.filter((_, q) => L5[q] >= 3).every((o) => o === 0));
truthy('Balanced overlap has roughly half the overlap of random (3-level attributes, 0.25 to 0.75 of random)', [1, 3, 4].every((q) => eB.overlap[q] / eR.overlap[q] > 0.25 && eB.overlap[q] / eR.overlap[q] < 0.75));
same('Prohibited pairs are never shown in a CBC design', C.cbcDesign([3, 3, 2], { prohib: [[0, 0, 1, 1]], seed: 2, V: 4 }).versions.flat(2).some((p) => p[0] === 0 && p[1] === 1), false);
same("Orme's minimum sample: 500 × 4 / (12 × 3) = 55.6 → 56", C.ormeN([4, 3, 2], 12, 3), 56);
same('Street-Burgess S_q: ℓ = 3, m = 3 gives 3 pairs; ℓ = 2, m = 3 gives 2', [C.streetBurgessSq(3, 3), C.streetBurgessSq(2, 3), C.streetBurgessSq(2, 4), C.streetBurgessSq(3, 5)], [3, 2, 4, 8]);

// ── Codes, parsing and exports ──
const cbcEx = M.exampleCbc();
const st2 = C.decodeStudy(C.encodeStudy(cbcEx.study));
same('Study code round trip keeps the design', [C.studyDesign(st2).versions[3][5], st2.dh], [C.studyDesign(cbcEx.study).versions[3][5], cbcEx.study.dh]);
same('Result code round trip', C.decodeResult(C.encodeResult(cbcEx.results[7])), cbcEx.results[7]);
truthy(`Study link stays short (${C.encodeStudy(cbcEx.study).length} characters for 20 versions × 12 tasks)`, C.encodeStudy(cbcEx.study).length < 2500);
const stale = { ...cbcEx.results[0], dh: 'zzz' };
same('Codes from an earlier design version are left out', M.datasetFromResults(cbcEx.study, [stale, cbcEx.results[1]]).resp.length, 1);
const cbcDs = M.datasetFromResults(cbcEx.study, cbcEx.results);
const cbcAttrsReal = C.studyAttrs(cbcEx.study);
const reparsed = M.parseCbcLong(M.longCsv(cbcDs, cbcAttrsReal), cbcAttrsReal);
same('Long CSV export parses back to the same choices (with "none")', [reparsed.ds.none, reparsed.ds.resp.length, reparsed.ds.resp[4].tasks.map((t) => t.y), reparsed.problems], [true, 200, cbcDs.resp[4].tasks.map((t) => t.y), []]);
const rateDs = M.datasetFromResults(rateEx.study, rateEx.results);
const wide = rateDs.resp.map((p) => [p.id, ...p.cards.map((c) => c.y)].join(',')).join('\n');
same('Wide ratings without a header parse to the same data', M.parseTrad(wide, rateEx.study, 'rate').ds.resp.map((p) => p.cards.map((c) => c.y)), rateDs.resp.map((p) => p.cards.map((c) => c.y)));
const tradLong = M.parseTrad(M.longCsv(rateDs, C.studyAttrs(rateEx.study)), rateEx.study, 'rate');
same('Long ratings with attribute columns parse to the same data and holdouts', tradLong.ds.resp[3].cards.map((c) => [c.y, c.hold]), rateDs.resp[3].cards.map((c) => [c.y, c.hold]));
truthy('Design CSV has one row per alternative plus "none" rows', C.designCsv(cbcEx.study).split('\n').length === 1 + 20 * 12 * 4);

// ── Ratings: OLS per respondent vs statsmodels ──
const rateCoder = C.makeCoder(C.studyAttrs(rateEx.study), { price: rateEx.study.p });
const tf = M.fitTraditional(rateDs, rateCoder);
nearAll('OLS part-worths, first respondent (statsmodels OLS)', tf.people[0].beta, REF.ols.beta_first, 1e-9);
nearAll('OLS part-worths, last respondent (statsmodels OLS)', tf.people[tf.people.length - 1].beta, REF.ols.beta_last, 1e-9);
nearAll('Mean OLS part-worths over 40 respondents (statsmodels)', tf.mean, REF.ols.mean_beta, 1e-9);
near('R², first respondent (statsmodels rsquared)', tf.people[0].r2, REF.ols.r2_first, 1e-9);
near('Mean R² (statsmodels)', tf.meanR2, REF.ols.mean_r2, 1e-9);
near('Holdout hit rate (numpy)', tf.hitRate, REF.ols.hit_rate, 1e-12);
nearAll('Mean importance (numpy)', M.meanImportance(tf.ok.map((p) => rateCoder.partWorths(p.beta))), REF.ols.importance, 1e-9);
// Rankings: reversed-rank OLS and the exploded logit.
const rankEx = M.exampleTrad('rank'); const rankDs = M.datasetFromResults(rankEx.study, rankEx.results);
const rankCoder = C.makeCoder(C.studyAttrs(rankEx.study), { price: rankEx.study.p });
nearAll('Reversed-rank OLS mean part-worths (statsmodels)', M.fitTraditional(rankDs, rankCoder).mean, REF.rol.rankols_mean, 1e-9);
const rol = M.fitMNL(M.rolSets(rankDs, rankCoder));
nearAll('Rank-ordered logit β (statsmodels ConditionalLogit on exploded sets)', rol.beta, REF.rol.beta, 1e-6);
nearAll('Rank-ordered logit SE (statsmodels)', rol.se, REF.rol.se, 1e-6);
near('Rank-ordered logit log-likelihood (statsmodels)', rol.ll, REF.rol.ll, 1e-6);

// ── CBC: aggregate MNL vs statsmodels ConditionalLogit ──
const S = M.buildSets(cbcDs, cbcCoder);
const mnl = M.fitMNL(S);
nearAll('MNL β (statsmodels ConditionalLogit)', mnl.beta, REF.mnl.beta, 1e-6);
nearAll('MNL standard errors (statsmodels)', mnl.se, REF.mnl.se, 1e-6);
near('MNL log-likelihood (statsmodels)', mnl.ll, REF.mnl.ll, 1e-6);
const ms = M.mnlStats(S, mnl.beta, cbcCoder.noneCol);
near('Null log-likelihood, 4 options per task', ms.ll0, REF.mnl.ll0, 1e-9);
near('McFadden ρ²', ms.rho2, REF.mnl.rho2, 1e-8);
near('Hit rate', ms.hit, REF.mnl.hit, 1e-12);
near('RLH = exp(ℓ / choices)', ms.rlh, REF.mnl.rlh, 1e-8);
near('"None" share observed', ms.noneObs, REF.mnl.none_obs, 1e-12);
near('"None" share predicted (equals observed at the MLE: ASC score equation)', ms.nonePred, REF.mnl.none_pred, 1e-6);
nearAll('MNL importance (numpy)', M.importance(cbcCoder.partWorths(mnl.beta)), REF.mnl_importance, 1e-6);
const w = M.wtpDelta(cbcCoder, mnl.beta, mnl.cov);
for (const [key, q, l] of [['storage_unlimited', 1, 2], ['ai_advanced', 3, 2], ['offline_yes', 2, 1]]) {
  near(`WTP ${key} (numpy)`, w[q][l].w, REF.wtp[key][0], 1e-6);
  near(`WTP ${key} delta-method SE (numpy numerical gradient)`, w[q][l].se, REF.wtp[key][1], 1e-5);
}

// ── Latent-class MNL vs numpy EM ──
const lcFits = [2, 3].map((k) => M.fitLatentClass(S, k, { seed: 1 }));
lcFits.forEach((f) => {
  const ref = REF.lc[String(f.k)];
  near(`Latent class k = ${f.k}: log-likelihood (numpy EM, 12 random starts)`, f.ll, ref.ll, 0.01);
  nearAll(`Latent class k = ${f.k}: segment sizes (numpy EM)`, f.pi, ref.pi, 0.005);
  nearAll(`Latent class k = ${f.k}: segment part-worths (numpy EM)`, f.betas.flat(), ref.betas.flat(), 0.02);
  near(`Latent class k = ${f.k}: BIC = −2ℓ + P ln n (numpy)`, f.bic, ref.bic, 0.02);
});
const sweep = M.latentClassSweep(S, { kMax: 3, aggregate: mnl });
same('BIC choice among k = 1..3 matches numpy', sweep.best, [1, 2, 3].reduce((a, k) => (REF.lc[String(k)].bic < REF.lc[String(a)].bic ? k : a), 1));

// ── MCMC diagnostics vs numpy ──
near('ESS, Geyer initial monotone sequence (numpy)', H.essGeyer(IN.ar), REF.diag.ess, 1e-8);
truthy(`ESS of AR(1), φ = 0.6, near the theoretical n(1 − φ)/(1 + φ) = 500 (got ${H.essGeyer(IN.ar).toFixed(0)})`, Math.abs(H.essGeyer(IN.ar) / REF.diag.ess_theory - 1) < 0.25);
near('Split R̂ (numpy)', H.splitRhat(IN.ar), REF.diag.rhat, 1e-12);
near('Geweke z (numpy)', H.geweke(IN.ar), REF.diag.geweke, 1e-8);
truthy('Split R̂ flags a chain with a shift (R̂ > 1.1)', H.splitRhat([...IN.ar.slice(0, 1000), ...IN.ar.slice(1000).map((x) => x + 3)]) > 1.1);

// ── Hierarchical Bayes: known simulated truth and the numpy implementation ──
const hs = IN.hbSim; const hsAttrs = attrsOf(hs.L, hs.price, hs.priceValues);
const hsCoder = C.makeCoder(hsAttrs, { price: hs.price, priceValues: hs.priceValues });
const hsS = M.buildSets({ kind: 'cbc', none: false, resp: hs.resp.map((tasks, i) => ({ id: `S${i}`, tasks })) }, hsCoder);
const t0 = Date.now();
const hb = H.runHB(hsS, { R: 12000, burn: 6000, thin: 6, seed: 11 });
console.log(`     (HB on 300 simulated respondents, 12,000 iterations: ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
hs.mu.forEach((mu, k) => truthy(`HB recovers the true population mean of parameter ${k + 1} (${mu}) inside its 95% credible interval [${hb.bbarCI[k].map((x) => x.toFixed(3)).join(', ')}]`, hb.bbarCI[k][0] <= mu && mu <= hb.bbarCI[k][1]));
const postSd = REF.hb_sim.bbar_sd;
nearAll('HB posterior means agree with the numpy sampler (in posterior SDs)', hb.bbarMean.map((m, k) => (m - REF.hb_sim.bbar_mean[k]) / postSd[k]), hs.mu.map(() => 0), 0.6);
const sdTrue = hs.sd; const sdEst = sdTrue.map((_, k) => Math.sqrt(hb.Vmean[k * hsCoder.K + k]));
truthy(`HB recovers the heterogeneity SDs within 35% (true ${sdTrue.join(', ')}; got ${sdEst.map((x) => x.toFixed(2)).join(', ')})`, sdEst.every((s, k) => Math.abs(s / sdTrue[k] - 1) < 0.35));
truthy(`HB acceptance rate in the usual 15–50% band (${(hb.acceptance * 100).toFixed(1)}%; numpy ${(REF.hb_sim.acceptance * 100).toFixed(1)}%)`, hb.acceptance > 0.15 && hb.acceptance < 0.5 && Math.abs(hb.acceptance - REF.hb_sim.acceptance) < 0.03);
truthy(`HB converged: split R̂ < 1.1 for every population mean (largest ${Math.max(...hb.diag.map((d) => d.rhat)).toFixed(3)})`, hb.diag.every((d) => d.rhat < 1.1));
const hbCbc = H.runHB(S, { R: 12000, burn: 6000, thin: 6, seed: 5 });
nearAll('HB on the CBC example agrees with the numpy sampler (in posterior SDs)', hbCbc.bbarMean.map((m, k) => (m - REF.hb_cbc.bbar_mean[k]) / REF.hb_cbc.bbar_sd[k]), hbCbc.bbarMean.map(() => 0), 0.6);
const rl = M.respondentRLH(S, hbCbc.betaMean); const rlMean = rl.reduce((s, x) => s + x, 0) / rl.length;
truthy(`HB individual RLH beats the aggregate model's RLH (${rlMean.toFixed(3)} > ${ms.rlh.toFixed(3)})`, rlMean > ms.rlh);
const wd = M.wtpDraws(cbcCoder, hbCbc.draws);
truthy('HB WTP interval from posterior draws contains its median', wd[1][2].lo < wd[1][2].w && wd[1][2].w < wd[1][2].hi);
// Inverse-Wishart draws average to S/(ν − K − 1).
{ const r = C.rng(3); const K = 3; const Sm = Float64Array.from([4, 1, 0, 1, 3, 0.5, 0, 0.5, 2]); const nu = 10; const acc = new Float64Array(9); const N = 20000;
  for (let i = 0; i < N; i++) { const V = H.rInvWishart(nu, Sm, K, r); for (let j = 0; j < 9; j++) acc[j] += V[j] / N; }
  nearAll('Inverse-Wishart draws: mean = S/(ν − K − 1) (Monte Carlo, 20,000 draws)', Array.from(acc), Array.from(Sm, (x) => x / (nu - K - 1)), 0.03); }

// ── Simulator and optimiser ──
const units = [{ beta: mnl.beta, w: 1 }];
const prods = [{ lv: [0, 0, 0, 0, 0] }, { lv: [1, 1, 1, 1, 1] }, { lv: [3, 2, 1, 2, 2] }];
const shL = M.simulateShares(cbcCoder, units, prods, { method: 'logit' });
near('Logit shares sum to 1 (with none)', shL.reduce((s, x) => s + x, 0), 1, 1e-12);
const U = prods.map((p) => C.dot(cbcCoder.encode(p.lv), mnl.beta)).concat(mnl.beta[cbcCoder.noneCol]); const eU = U.map(Math.exp);
near('Logit share of product 1 by hand, exp(U₁)/Σexp(U)', shL[0], eU[0] / eU.reduce((s, x) => s + x, 0), 1e-12);
const indiv = hbCbc.betaMean.map((b) => ({ beta: b, w: 1 }));
const shF = M.simulateShares(cbcCoder, indiv, prods, { method: 'first' });
const byHand = Array(4).fill(0); indiv.forEach((u) => { const v = prods.map((p) => C.dot(cbcCoder.encode(p.lv), u.beta)).concat(u.beta[cbcCoder.noneCol]); byHand[v.indexOf(Math.max(...v))] += 1 / indiv.length; });
nearAll('First-choice shares by hand', shF, byHand, 1e-12);
const shR0 = M.simulateShares(cbcCoder, units, prods, { method: 'rfc', attrSd: 0, draws: 40000, seed: 3 });
nearAll('Randomised first choice with no attribute error = logit shares (Gumbel product error, 40,000 draws)', shR0, shL, 0.01);
const twins = [{ lv: [1, 1, 1, 1, 1] }, { lv: [1, 1, 1, 1, 1] }, { lv: [0, 2, 0, 0, 0] }];
const twinRfc = M.simulateShares(cbcCoder, indiv, twins, { method: 'rfc', attrSd: 0.6, seed: 2 });
const twinLogit = M.simulateShares(cbcCoder, indiv, twins, { method: 'logit' });
truthy(`Randomised first choice gives identical twins less combined share than logit (IIA correction: ${(twinRfc[0] + twinRfc[1]).toFixed(3)} < ${(twinLogit[0] + twinLogit[1]).toFixed(3)})`, twinRfc[0] + twinRfc[1] < twinLogit[0] + twinLogit[1]);
const pc = M.priceCurve(cbcCoder, units, prods, 0, { steps: 6 });
truthy('Share falls as price rises (price curve is monotone)', pc.every((p, i) => i === 0 || p.shares[0] < pc[i - 1].shares[0]));
const smallCoder = C.makeCoder(cbcAttrs, { price: 0, priceValues: IN.cbc.priceValues, none: true });
const ex = M.optimise(smallCoder, indiv.slice(0, 60), prods, [0], { objective: 'revenue', maxExhaustive: 1e9 });
const ga = M.optimise(smallCoder, indiv.slice(0, 60), prods, [0], { objective: 'revenue', maxExhaustive: 10 });
same(`Optimiser: exhaustive search covers all ${ex.space} single products`, [ex.method, ex.evals], ['exhaustive', 216]);
near(`Genetic algorithm finds the exhaustive optimum (revenue index ${ex.value.toFixed(4)})`, ga.value, ex.value, 1e-9);
const exLine = M.optimise(smallCoder, indiv.slice(0, 40), prods, [0, 1], { maxExhaustive: 1e9 });
const gaLine = M.optimise(smallCoder, indiv.slice(0, 40), prods, [0, 1], { maxExhaustive: 10, gens: 120 });
truthy(`Product-line GA reaches within 0.5 points of the exhaustive optimum over ${exLine.space.toLocaleString('en-GB')} lines (${(gaLine.value * 100).toFixed(2)}% vs ${(exLine.value * 100).toFixed(2)}%)`, exLine.value - gaLine.value < 0.005);

// ── "Reading your results" summaries ──
const dS = R.designSummary({ kind: 'cbc', method: 'balanced overlap', dEff: 83.6, maxSE: 0.047, nPlan: 200, orme: 56, overlap: 0.4, nVersions: 20, tasks: 12, alts: 3 });
summaryShape('Design (CBC)', dS); same('Design: SE 0.047 and 84% efficiency is strong', dS.confidence, 'high');
same('Design: SE 0.047 but 70% efficiency drops one step', R.designSummary({ kind: 'cbc', method: 'random', dEff: 70, maxSE: 0.047, nPlan: 200, orme: 56, overlap: 0.7, nVersions: 20, tasks: 12, alts: 3 }).confidence, 'medium');
const dS2 = R.designSummary({ kind: 'cbc', method: 'random', dEff: 85, maxSE: 0.12, nPlan: 50, orme: 56, overlap: 0.7, nVersions: 2, tasks: 8, alts: 3 });
same('Design: SE 0.12 is weak', dS2.confidence, 'low'); truthy('Design: suggests a sample that brings SE to 0.05', dS2.next[0].includes(String(Math.ceil(50 * (0.12 / 0.05) ** 2))));
const dT = R.designSummary({ kind: 'trad', method: 'Orthogonal array L18', dEff: 100, nParams: 8, nCards: 18, df: 10 });
summaryShape('Design (ratings)', dT); same('Ratings design with 10 df and 100% is strong', dT.confidence, 'high');
const mS = R.mnlSummary({ attrs: cbcAttrsReal, n: 200, stats: ms, imp: M.importance(cbcCoder.partWorths(mnl.beta)), se: mnl.se.slice(0, -1), wtp: w, unit: '£', noneShare: ms.noneObs });
summaryShape('MNL', mS); same('MNL: 200 respondents and SE ≤ 0.1 is strong', mS.confidence, 'high');
truthy('MNL: headline names the most important attribute (Price)', mS.headline.startsWith('Price'));
truthy('MNL: caveats include the three misreadings', [R.MISREADINGS.importance, R.MISREADINGS.stated, R.MISREADINGS.relative].every((m) => mS.caveats.includes(m)));
truthy('MNL: WTP line uses confidence-interval wording', mS.meaning.some((m) => m.includes('95% confidence interval')));
const tS = R.tradSummary({ attrs: C.studyAttrs(rateEx.study), n: tf.ok.length, meanR2: tf.meanR2, hitRate: tf.hitRate, chance: tf.chance, imp: M.meanImportance(tf.ok.map((p) => rateCoder.partWorths(p.beta))), wtp: M.wtpDelta(rateCoder, tf.mean, tf.cov), unit: '£', mode: 'rate' });
summaryShape('Ratings', tS);
same(`Ratings: 40 respondents, R² ${tf.meanR2.toFixed(2)}, hit rate ${tf.hitRate.toFixed(2)} vs chance 0.5 → rule`, tS.confidence, tf.meanR2 >= 0.7 && tf.hitRate - 0.5 >= 0.2 ? 'high' : tf.meanR2 >= 0.5 ? 'medium' : 'low');
same('Ratings: 10 respondents is weak', R.tradSummary({ attrs: C.studyAttrs(rateEx.study), n: 10, meanR2: 0.9, hitRate: 1, chance: 0.5, imp: [0.4, 0.3, 0.2, 0.1], wtp: null, unit: '£', mode: 'rate' }).confidence, 'low');
const lS = R.lcSummary({ attrs: cbcAttrsReal, n: 200, fits: sweep.fits, best: sweep.best, imps: sweep.fits[sweep.best - 1].betas.map((b) => M.importance(cbcCoder.partWorths(b))) });
summaryShape('Latent class', lS); truthy('Latent class: headline names the number of segments', lS.headline.includes(`${sweep.best} segments`));
const hS = R.hbSummary({ attrs: cbcAttrsReal, n: 200, hb: hbCbc, imp: M.meanImportance(hbCbc.betaMean.map((b) => cbcCoder.partWorths(b))), wtp: wd, unit: '£', rlhMean: rlMean, chance: 0.25 });
summaryShape('HB', hS, { bayes: true });
same('HB: confidence follows the R̂/ESS rule', hS.confidence, (() => { const r = Math.max(...hbCbc.diag.map((d) => d.rhat)), e = Math.min(...hbCbc.diag.map((d) => d.ess)); return r < 1.05 && e >= 400 && hbCbc.acceptance >= 0.15 && hbCbc.acceptance <= 0.5 ? 'high' : r < 1.1 && e >= 100 ? 'medium' : 'low'; })());
truthy('HB: credible-interval wording is Bayesian and names the priors', hS.caveats.some((c) => /posterior probability/.test(c) && /ν = K \+ 3/.test(c)));
const sS = R.simSummary({ products: ['A', 'B', 'C'], shares: shL.slice(0, 3), noneShare: shL[3], method: 'logit', source: 'mnl', modelConfidence: 'high', nUnits: 1, unit: '£', curve: null, optim: null });
summaryShape('Simulator', sS); same('Simulator: inherits the model confidence', sS.confidence, 'high');
same('Simulator: first choice with 40 units drops one step', R.simSummary({ products: ['A', 'B'], shares: [0.6, 0.4], noneShare: NaN, method: 'first', source: 'hb', modelConfidence: 'high', nUnits: 40, unit: '' }).confidence, 'medium');
const md = R.markdownReport({ study: cbcEx.study, attrs: cbcAttrsReal, designInfo: 'x', sections: [{ title: 'MNL', summary: mS }], sim: { method: 'logit', source: 'MNL', rows: [['A', '50%']] } });
truthy('Markdown report has the sections and no link markup', md.includes('## MNL') && md.includes('## Market simulation') && !/\]\(\//.test(md));
const pwc = R.partWorthsCsv(cbcAttrsReal, cbcCoder, [{ id: 'R1', beta: mnl.beta, extra: { model: 'MNL' } }]).split('\n');
same('Part-worths CSV: one column per level, None, importances and model', pwc[0].split(',').length, 1 + 15 + 1 + 5 + 1);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
