// Checks the calculator statistics against published worked examples and values from scipy, statsmodels and
// pingouin. Run with `npm run check:calc`. Reference values were produced with scipy 1.18, statsmodels 0.15 and
// pingouin 0.7 on the same data; published examples are cited next to each check.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
import { kinds } from '../lib/data.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-4) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toFixed(6) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}

// ── Krippendorff's alpha: Krippendorff (2011), "Computing Krippendorff's alpha-reliability", reliability data
// with 4 observers, 12 units and missing values. Published: nominal 0.743, ordinal 0.815, interval 0.849.
// Rows here are units, columns observers A–D.
const kd = S.parseCodeRows('1 1 . 1\n2 2 3 2\n3 3 3 3\n3 3 3 3\n2 2 2 2\n1 2 3 4\n4 4 4 4\n1 1 2 1\n2 2 2 2\n. 5 5 5\n. . 1 1\n. 3 . .').rows;
near('Krippendorff alpha, nominal (published 0.743)', S.krippendorffAlpha(kd, 'nominal').alpha, 0.743421052631579, 1e-9);
near('Krippendorff alpha, ordinal (published 0.815)', S.krippendorffAlpha(kd, 'ordinal').alpha, 0.8153875037548814, 1e-9);
near('Krippendorff alpha, interval (published 0.849)', S.krippendorffAlpha(kd, 'interval').alpha, 0.8491071428571428, 1e-9);
same('Krippendorff pairable values', S.krippendorffAlpha(kd).n, 40);

// ── Cohen's kappa: the textbook 2×2 example (20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no): po = 0.7, pe = 0.5, kappa = 0.4.
// Standard errors from statsmodels.stats.inter_rater.cohens_kappa (Fleiss, Cohen and Everitt 1969).
const rep = (n, p) => Array.from({ length: n }, () => p);
const k2 = S.cohenKappa([...rep(20, ['y', 'y']), ...rep(5, ['y', 'n']), ...rep(10, ['n', 'y']), ...rep(15, ['n', 'n'])]);
near('Cohen kappa (textbook 0.4)', k2.kappa, 0.4, 1e-12);
near('Cohen kappa SE (statsmodels)', k2.se, 0.12699606293110033, 1e-9);
near('Cohen kappa 95% lower (statsmodels)', k2.lo, 0.151092290476661, 1e-6);
near('Cohen kappa 95% upper (statsmodels)', k2.hi, 0.6489077095233389, 1e-6);
near('Cohen kappa SE under H0 (statsmodels)', (k2.kappa / k2.z), 0.13856406460551018, 1e-9);
const t3 = [[22, 3, 2], [4, 18, 5], [1, 2, 13]], p3 = [];
t3.forEach((r, i) => r.forEach((c, j) => { for (let x = 0; x < c; x++) p3.push([i, j]); }));
const k3 = S.cohenKappa(p3);
near('Cohen kappa, 3 categories (statsmodels)', k3.kappa, 0.631578947368421, 1e-9);
near('Cohen kappa SE, 3 categories (statsmodels)', k3.se, 0.07716347332036497, 1e-9);
near('Percent agreement, 2×2 example', S.percentAgreement([...rep(35, ['a', 'a']), ...rep(15, ['a', 'b'])]).value, 0.7, 1e-12);

// ── Cronbach's alpha: pingouin's bundled `cronbach_alpha` dataset (15 respondents, 10 items), documented result
// alpha = 0.592, 95% CI [0.195, 0.840]. Item statistics from pingouin and numpy; Feldt bounds from scipy.stats.f.
const cr = [[3,2,4,1,4,5,1,4,3,2],[5,4,6,3,5,1,2,5,5,5],[7,3,5,5,6,4,3,3,6,5],[2,4,3,3,2,2,2,6,6,3],[6,5,6,5,4,4,4,6,7,5],[1,2,3,4,2,5,2,3,5,2],[4,3,5,3,5,2,1,2,4,3],[2,4,4,3,7,2,2,4,6,5],[6,5,5,5,1,6,5,2,3,2],[5,4,6,4,3,5,3,1,7,2],[4,3,5,2,5,3,2,3,4,1],[4,2,3,2,5,3,4,2,3,4],[5,5,6,2,3,3,2,4,4,5],[6,5,5,4,2,2,1,4,6,5],[4,3,5,5,3,1,3,2,3,4]];
const ca = S.cronbach(cr);
near('Cronbach alpha (pingouin 0.592)', ca.alpha, 0.5917188485995825, 1e-9);
near('Feldt 95% lower (pingouin 0.195)', ca.lo, 0.19492139066312153, 1e-6);
near('Feldt 95% upper (pingouin 0.840)', ca.hi, 0.8398208146275432, 1e-6);
near('Corrected item-total r, item 1', ca.items[0].rCorrected, 0.5747667919844912, 1e-9);
near('Corrected item-total r, item 6', ca.items[5].rCorrected, -0.15723651965665178, 1e-9);
near('Alpha if item 1 deleted', ca.items[0].alphaIfDeleted, 0.468690324633991, 1e-9);
near('Alpha if item 6 deleted', ca.items[5].alphaIfDeleted, 0.6711414790996786, 1e-9);
same('Omega withheld when items load negatively', Number.isNaN(ca.omega.omega), true);

// ── McDonald's omega: one-factor unweighted least squares (minres) loadings fitted independently with
// scipy.optimize.minimize on the off-diagonal residuals; omega = (Σλ)² / ((Σλ)² + Σ(1 − λ²)).
const om = S.cronbach([[4,5,3,5,5],[6,5,5,5,5],[5,4,4,5,4],[2,3,3,2,3],[5,5,4,6,5],[3,3,2,3,4],[4,4,4,4,3],[6,6,5,6,6],[2,2,3,2,2],[5,4,5,4,5],[3,4,3,3,3],[4,3,4,5,4]]).omega;
near('Omega total, 12 × 5 example (scipy ULS)', om.omega, 0.9445064335134596, 1e-5);
near('Loading, item 1 (scipy ULS)', om.loadings[0], 0.99362248, 1e-4);
near('Loading, item 3 (scipy ULS)', om.loadings[2], 0.72824814, 1e-4);

// ── Mann-Whitney U: scipy.stats.mannwhitneyu(method='asymptotic', use_continuity=True), two-sided.
const mw = S.mannWhitney([12, 15, 9, 20, 17, 14, 11, 13, 16, 10, 18], [22, 19, 17, 25, 14, 21, 23, 18, 20, 24]);
near('Mann-Whitney U1 (scipy 11)', mw.U1, 11, 1e-12);
near('Mann-Whitney p (scipy)', mw.p, 0.002161005061568909, 1e-5);
const mwt = S.mannWhitney([1, 2, 2, 3, 3, 3, 4, 5], [3, 3, 4, 4, 5, 5, 5, 6, 6]);
near('Mann-Whitney U1 with heavy ties (scipy 11.5)', mwt.U1, 11.5, 1e-12);
near('Mann-Whitney p with heavy ties (scipy)', mwt.p, 0.01817204303730795, 1e-5);

// ── Wilcoxon signed-rank: scipy.stats.wilcoxon(method='approx', correction=True, zero_method='wilcox').
const wx = S.wilcoxonSigned([6, 5, 6, 6, 7, 7, 8, 5, 7, 8, 7, 6, 6].map((v, i) => v - [5, 3, 6, 4, 7, 5, 6, 4, 5, 8, 6, 5, 3][i]));
near('Wilcoxon W (scipy 0)', wx.W, 0, 1e-12);
near('Wilcoxon p, 3 zero differences (scipy)', wx.p, 0.0049954609006305, 1e-5);
const x2 = [1.5, 2.0, 3.1, 2.2, 4.0, 2.8, 3.3, 1.9, 2.5, 3.0], y2 = [2.1, 2.0, 3.9, 2.0, 4.6, 3.5, 3.0, 2.7, 3.6, 3.2];
const wx2 = S.wilcoxonSigned(y2.map((v, i) => +(v - x2[i]).toFixed(6)));
near('Wilcoxon W with tied |d| (scipy 4.5)', wx2.W, 4.5, 1e-12);
near('Wilcoxon p with tied |d| (scipy)', wx2.p, 0.03764506651294004, 1e-5);

// ── Effect size: pingouin.compute_effsize (cohen, hedges) and compute_esci; interval bounds from the same SE formula.
const g1 = [70, 65, 80, 72, 68, 75, 60, 77, 71, 66], g2 = [78, 82, 74, 85, 80, 79, 88, 76, 81];
const es = S.effectSize(S.mean(g1), S.sd(g1), g1.length, S.mean(g2), S.sd(g2), g2.length);
near("Cohen's d (pingouin)", es.d, 1.8843628152491838, 1e-9);
near("Hedges' g (pingouin)", es.g, 1.7999883608350413, 1e-9);
near("Cohen's d 95% lower (pingouin 0.80)", es.dLo, 0.8027293344923916, 1e-6);
near("Cohen's d 95% upper (pingouin 2.97)", es.dHi, 2.965996296005976, 1e-6);

// ── Bayesian A/B: 40/1000 vs 55/1000 with Beta(1, 1) priors. P(B > A) from scipy.integrate.quad;
// expected losses from scipy.integrate.dblquad; credible interval from scipy.stats.beta.ppf.
const ba = S.bayesAB(40, 1000, 55, 1000);
near('P(B beats A), closed form (scipy quad)', ba.pBbeatsA, 0.9418873441791108, 1e-8);
near('P(B beats A), numerical integration (scipy quad)', ba.pNumeric, 0.9418873441791108, 1e-7);
near('Expected loss choosing B (scipy dblquad)', ba.lossB, 0.00023893673198635811, 1e-8);
near('Expected loss choosing A (scipy dblquad)', ba.lossA, 0.015208996652370547, 1e-8);
near('95% credible interval for A, lower (scipy)', ba.ciA[0], 0.02955046, 1e-6);
near('95% credible interval for A, upper (scipy)', ba.ciA[1], 0.05401908, 1e-6);

// ── SPRT: Wald (1947) boundaries for p0 = 0.10, p1 = 0.15, alpha = 0.05, beta = 0.20.
const sp = S.sprt(0.1, 0.15, 0.05, 0.2, 20, 100);
near('SPRT upper log boundary ln((1−β)/α) = ln 16', sp.A, Math.log(16), 1e-12);
near('SPRT lower log boundary ln(β/(1−α))', sp.B, -1.5581446180465497, 1e-12);
near('SPRT slope (successes per trial)', sp.slope, 0.12355276186401828, 1e-12);
near('SPRT upper intercept', sp.hUp, 5.9931857994690345, 1e-9);
same('SPRT decision at 20 of 100', sp.decision, 'h1');

// ── Survey margin of error: Cochran n0 = 384.16 → 385 for ±5% at 95%; with N = 1000 the corrected n is 278
// (as in Krejcie and Morgan's 1970 table). ±4.9 points for n = 400.
near('Cochran n0 for ±5%', S.surveyN({ e: 0.05 }).n0, 384.1458826888163, 1e-6);
same('n for ±5%, infinite population', S.surveyN({ e: 0.05 }).n, 385);
same('n for ±5%, N = 1000 (Krejcie-Morgan 278)', S.surveyN({ e: 0.05, N: 1000 }).n, 278);
near('Margin for n = 400 at 95%', S.surveyMoe({ n: 400 }).moe, 0.04899909965300488, 1e-6);
near('Margin for n = 400, N = 2000, deff 1.5', S.surveyMoe({ n: 400, N: 2000, deff: 1.5 }).moe, 1.959963984540054 * Math.sqrt(0.25 / (400 / 1.5)) * Math.sqrt(1600 / 1999), 1e-6);

// ── F quantiles used by Feldt's interval (scipy.stats.f.ppf).
near('F 0.975 quantile, df 14 and 126', S.fInv(0.975, 14, 126), 1.9718730746580704, 1e-6);
near('F 0.025 quantile, df 14 and 126', S.fInv(0.025, 14, 126), 0.39232569229080744, 1e-6);

// ── Saturation: worked example by hand. Interviews {a,b,c}, {a,d}, {b,e,a}, {a,c}, {f}: 6 codes, 11 code mentions,
// 3 seen once, 2 seen twice. Coverage 1 − 3/11 = 0.7273; Chao estimate 6 + (4/5)·3²/(2·2) = 7.8.
const sat = S.saturation(S.parseCodeLists('a, b, c\na, d\nb, e, A\na; c\nf'), 2);
same('Saturation accumulation', sat.curve.map((c) => c.total), [3, 4, 5, 5, 6]);
near('Good-Turing coverage', sat.coverage, 1 - 3 / 11, 1e-12);
near('Chao estimate of total codes', sat.chao, 7.8, 1e-12);
same('New codes in the last 2 interviews', sat.newLast, ['f']);

// ── Questionnaire scoring.
near('Raw TLX', S.tlxRaw([70, 20, 60, 40, 65, 50]), 305 / 6, 1e-12);
near('Weighted TLX (Hart and Staveland)', S.tlxWeighted([70, 20, 60, 40, 65, 50], [5, 0, 3, 2, 4, 1]), (350 + 0 + 180 + 80 + 260 + 50) / 15, 1e-12);
same('TLX pairs', S.TLX_PAIRS.length, 15);
const best = Array.from({ length: 26 }, (_, i) => (S.UEQ_REVERSED.includes(i + 1) ? 1 : 7));
same('UEQ: most positive answers give +3 on every scale', S.ueqScore([best, best]).map((s) => s.mean), [3, 3, 3, 3, 3, 3]);
same('UEQ: 26 items in six scales', S.UEQ_SCALES.flatMap(([, it]) => it).sort((a, b) => a - b), Array.from({ length: 26 }, (_, i) => i + 1));
same('UEQ benchmark band', [S.ueqBand('Attractiveness', 1.8), S.ueqBand('Novelty', 0.2), S.ueqBand('Efficiency', 1.0)], ['Excellent', 'Bad', 'Above average']);

// ── Every atlas method a calculator links to exists.
const src = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8');
const linked = new Set([...src.matchAll(/method="([a-z0-9-]+)"/g)].map((m) => m[1]));
// Conditional links: the strings after ? and : in method={cond ? 'a' : 'b'}; extra links: the first string of each pair in links={[...]}.
for (const m of src.matchAll(/method=\{[^}]*\}/g)) for (const x of m[0].matchAll(/[?:] '([a-z0-9-]+)'/g)) linked.add(x[1]);
for (const m of src.matchAll(/links=\{\[(.*?)\]\}>/g)) for (const x of m[1].matchAll(/\['([a-z0-9-]+)', /g)) linked.add(x[1]);
const missing = [...linked].filter((id) => !kinds.byId.has(id));
same(`All ${linked.size} linked method ids exist`, missing, []);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
