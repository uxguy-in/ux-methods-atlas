// Checks the calculator statistics against published worked examples and values from scipy, statsmodels and
// pingouin. Run with `npm run check:calc`. Reference values were produced with scipy 1.18, statsmodels 0.15 and
// pingouin 0.7 on the same data; published examples are cited next to each check.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
import * as CL from '../../client/src/calc/cluster.js';
import { CATALOG, CALCS_BY_METHOD } from '../../client/src/calc/catalog.js';
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


// ── Capture-recapture: the Lincoln index example in Wikipedia's "Mark and recapture" article (10 marked, 15 caught
// in the second sample, 5 of them marked): Lincoln-Petersen 30, Chapman 28.3. Seber's (1982) variance and the
// Chao log-normal interval by hand: var = 11·16·5·10/(6²·7) = 34.921.
const lp = S.lincolnPetersen(10, 15, 5);
near('Lincoln-Petersen (published 30)', lp.lp, 30, 1e-12);
near('Chapman (published 28.3)', lp.chapman, 28 + 1 / 3, 1e-12);
near('Chapman variance (Seber, by hand)', lp.v, 8800 / 252, 1e-9);
near('Chapman 95% interval, lower (log-normal, scipy norm.ppf)', lp.lo, 22.38526171603979, 1e-6);
near('Chapman 95% interval, upper (log-normal, scipy norm.ppf)', lp.hi, 49.11397268377824, 1e-6);
// Chao2 for a 10-problem × 4-evaluator matrix, by hand: S = 10, Q1 = 5, Q2 = 2, A = 3/4,
// Chao = 10 + 0.75·25/4 = 14.6875; variance with r = Q1/Q2 = 2.5: 2·(0.375·6.25 + 0.5625·15.625 + 0.140625·39.0625) = 33.2520.
const cm = S.captureMatrix([[1,1,1,0],[1,0,1,1],[1,0,0,0],[0,1,0,0],[1,1,0,0],[0,0,1,0],[1,1,1,1],[0,0,0,1],[1,0,1,0],[0,1,0,0]]);
same('Chao2 counts S, Q1, Q2', [cm.S, cm.Q1, cm.Q2], [10, 5, 2]);
near('Chao2 estimate (by hand 14.6875)', cm.chao, 14.6875, 1e-12);
near('Chao2 variance (by hand)', cm.v, 33.251953125, 1e-9);
near('First-order jackknife (by hand 13.75)', cm.jack1, 13.75, 1e-12);
near('Chao2 matches the saturation calculator on the same incidence data', S.saturation(S.parseCodeLists('a, b\nc\nd, a\ne')).chao, S.captureMatrix([[1,0,1,0],[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]).chao, 1e-12);

// ── KLM: operator times from Card, Moran and Newell (1980) and Kieras (2001). The physical operators of Kieras's
// drag-a-file-to-the-trash example (point, press, drag, release, point back) are 3P + 2B = 3.5 s.
near("KLM drag to trash, 3P + 2B (Kieras 3.5 s)", S.klmTime(S.parseKlm('P B P B P').ops).total, 3.5, 1e-9);
// Heuristic M placement by hand: H P BB H "cat" K → H M P B B H M K K K M K (rule 0 before P and the first K of each unit,
// rule 2 for the rest of "cat"). With K = 0.2: 2H + 3M + P + 2B + 4K = 0.8 + 4.05 + 1.1 + 0.2 + 0.8 = 6.95 s.
const km = S.placeM(S.parseKlm('H P BB H "cat" K').ops);
same('KLM M placement, rules 0 and 2', km.map((o) => o.op).join(''), 'HMPBBHMKKKMK');
near('KLM time with placed Ms, K = 0.2 (by hand 6.95 s)', S.klmTime(km, 0.2).total, 6.95, 1e-9);
same('KLM rule 1: no M between a point and its keystroke', S.placeM(S.parseKlm('P K').ops).map((o) => o.op).join(''), 'MPK');
same('KLM comments are ignored', S.parseKlm('H # hand to mouse, then Point\nP BB').ops.map((o) => o.op).join(''), 'HPBB');
near('KLM counts and response time, 5K R(2) at K = 0.28', S.klmTime(S.parseKlm('5K R(2)').ops, 0.28).total, 3.4, 1e-9);

// ── Fitts' law by hand: D = 256, W = 16 → ID = log2(17) = 4.0875 bits; a = 0.1, b = 0.2 → MT = 0.9175 s.
// Effective width with SD 4: We = 16.532, IDe = log2(256/16.532 + 1) = 4.0431; throughput at 0.9 s = 4.4923 bits/s.
const ft = S.fitts({ D: 256, W: 16, a: 0.1, b: 0.2, sd: 4, mt: 0.9 });
near("Fitts index of difficulty log2(17)", ft.id, 4.087462841250339, 1e-12);
near("Fitts movement time", ft.mt, 0.9174925682500679, 1e-12);
near("Fitts effective width 4.133 × 4", ft.we, 16.532, 1e-12);
near("Fitts effective ID", ft.ide, 4.043092463404468, 1e-9);
near("Fitts throughput", ft.throughput, 4.492324959338298, 1e-9);
near("FFitts effective width, SD 2 mm, σa 1.5 mm: 4.133·√1.75", S.fitts({ D: 30, W: 7, a: 0.1, b: 0.15, sd: 2, sigmaA: 1.5 }).we, 5.467445084314977, 1e-9);
near('Tap hit rate, 7 mm square, σ 1.5 mm (scipy erf², 0.9611)', S.hitRate(7, 1.5, 2), 0.9611240481897717, 1e-6);
near('Square for 95% of taps, σ 1.5 mm (scipy norm.ppf)', S.widthForHit(0.95, 1.5, 2), 6.709429933673368, 1e-6);
// Hick-Hyman by hand: 8 equal choices → log2(9) = 3.1699 bits; frequencies 4:2:1:1 → Σ p·log2(1/p + 1) = 2.1654 bits.
near('Hick-Hyman bits, 8 equal choices', S.hickBits(8), Math.log2(9), 1e-12);
near('Hick-Hyman bits, unequal frequencies', S.hickBits(0, [4, 2, 1, 1]), 2.1654445244429965, 1e-12);

// ── Van Westendorp, ten respondents, intersections by hand. PMC: at 11, too cheap 3/10 = not cheap 3/10. OPP: too cheap
// falls 0.1 → 0 and too expensive rises 0 → 0.1 between 15 and 16, so 15.5. IPP: cheap 0.3 → 0.2 and expensive
// 0.2 → 0.3 between 16 and 18, so 17. PME: too expensive 0.2 → 0.3 and not expensive 0.3 → 0.2 between 24 and 25, so 24.5.
const vw = S.vanWestendorp([[10,15,25,35],[5,10,20,30],[8,12,18,25],[12,18,30,45],[6,10,15,20],[15,20,28,40],[4,8,12,16],[9,14,22,32],[7,12,20,28],[11,16,24,30]]);
near('Van Westendorp PMC (by hand 11)', vw.pmc.x, 11, 1e-9);
near('Van Westendorp OPP (by hand 15.5)', vw.opp.x, 15.5, 1e-9);
near('Van Westendorp IPP (by hand 17)', vw.ipp.x, 17, 1e-9);
near('Van Westendorp PME (by hand 24.5)', vw.pme.x, 24.5, 1e-9);
same('Van Westendorp drops answers out of order', S.vanWestendorp([[5, 10, 20, 30], [10, 5, 20, 30]]).dropped, 1);
// Gabor-Granger by hand: revenue 4.5, 5.625, 5.75, 4.6875, 3.375 → peak at 10; with unit cost 8, profit per person asked is
// −2.7, −0.375, 1.15, 1.6875, 1.575 → peak at 12.5.
const gg = S.gaborGranger([[5, 72], [7.5, 60], [10, 46], [12.5, 30], [15, 18]].map(([price, y]) => ({ price, demand: y / 80 })), 8);
same('Gabor-Granger revenue-maximising price', gg.bestRevenue.price, 10);
near('Gabor-Granger peak revenue per person asked', gg.bestRevenue.revenue, 5.75, 1e-12);
same('Gabor-Granger profit-maximising price, unit cost 8', gg.bestProfit.price, 12.5);

// ── Kano evaluation table (Berger et al. 1993): row = functional answer, column = dysfunctional answer.
same('Kano table lookups', [[1, 5], [1, 2], [1, 4], [2, 5], [4, 5], [3, 3], [5, 1], [1, 1], [5, 5]].map(([f, d]) => S.kanoClass(f, d)), ['O', 'A', 'A', 'M', 'M', 'I', 'R', 'Q', 'Q']);
const kn = S.kano([[1, 5], [1, 5], [1, 3], [2, 5], [3, 3]]);
same('Kano category (2 O, 1 A, 1 M, 1 I)', kn.category, 'O');
near('Kano Better (A + O)/(A + O + M + I) = 3/5', kn.better, 0.6, 1e-12);
near('Kano Worse −(O + M)/(A + O + M + I) = −3/5', kn.worse, -0.6, 1e-12);
same('Kano tie goes to must-be', S.kano([[1, 3], [2, 5]]).category, 'M');

// ── MaxDiff counts by hand: A best twice in 2 showings (+1), B best once in 3 (+1/3), C worst once in 3, D worst twice in 2.
// Share of A = √(2.5/0.5) / (√5 + √3 + 1 + √(1/3) + √(1/5)) = 37.31%.
const md = S.maxdiff([{ items: ['A', 'B', 'C', 'D'], best: 'A', worst: 'D' }, { items: ['A', 'B', 'C', 'E'], best: 'A', worst: 'C' }, { items: ['B', 'C', 'D', 'E'], best: 'B', worst: 'D' }]);
same('MaxDiff order', md.map((r) => r.item), ['A', 'B', 'E', 'C', 'D']);
same('MaxDiff best − worst', md.map((r) => r.bw), [2, 1, 0, -1, -2]);
near('MaxDiff normalised score for B', md[1].norm, 1 / 3, 1e-12);
near('MaxDiff share for A', md[0].share, 100 * Math.sqrt(5) / (Math.sqrt(5) + Math.sqrt(3) + 1 + Math.sqrt(1 / 3) + Math.sqrt(1 / 5)), 1e-9);

// ── TURF against a brute-force search with itertools.combinations: best pair {0, 1} reaches 6 of 10 (7 hits);
// best three {0, 1, 2} reach 8 of 10 (10 hits). The greedy search finds the same sets here.
const tf = S.turf([[0, 1], [1], [2], [0, 3], [3], [1, 2], [4], [0], [1, 3], [2, 4]], 5, 3);
same('TURF exhaustive best sets', tf.map((r) => [...r.exhaustive.items].sort()), [[1], [0, 1], [0, 1, 2]]);
same('TURF reach', tf.map((r) => r.exhaustive.reach), [0.4, 0.6, 0.8]);
near('TURF frequency for the best three', tf[2].exhaustive.freq, 1.25, 1e-12);
same('TURF greedy best three', [...tf[2].greedy.items].sort(), [0, 1, 2]);

// ── UX ROI by hand: 100 users × 600 tasks × 30 s = 500 hours × 60 = 30,000 a year; one-off 50,000, running 5,000;
// 3 years at 10%: NPV = −50,000 + 25,000 × (1/1.1 + 1/1.1² + 1/1.1³) = 12,171.30; ROI = (90,000 − 65,000)/65,000; payback 2 years.
const roi = S.uxRoi({ users: 100, tasks: 600, seconds: 30, hourly: 60, oneOff: 50000, running: 5000, years: 3, rate: 0.1 });
near('ROI annual benefit', roi.annual, 30000, 1e-9);
near('NPV (by hand 12,171.30)', roi.npv, 12171.299774605548, 1e-6);
near('ROI (by hand 38.46%)', roi.roi, 25000 / 65000, 1e-12);
near('Payback in years (by hand 2)', roi.paybackYears, 2, 1e-12);
near('Conversion benefit: 500,000 × 2% × 5% × 60', S.uxRoi({ visitors: 500000, baseConv: 0.02, uplift: 0.05, convValue: 60 }).parts.conversion, 30000, 1e-6);

// ── Lostness (Smith 1996): the optimal path N = S = R scores 0; N = 6, S = 12, R = 3 gives √(0.5² + 0.5²) = 0.7071.
near('Lostness, optimal path', S.lostness(4, 4, 4), 0, 1e-12);
near('Lostness, N 6, S 12, R 3', S.lostness(6, 12, 3), Math.SQRT1_2, 1e-12);
near('Lostness, N 5, S 7, R 4', S.lostness(5, 7, 4), Math.sqrt((5 / 7 - 1) ** 2 + (4 / 5 - 1) ** 2), 1e-12);

// ── Readability: Wikipedia's Flesch examples. "The cat sat on the mat." scores 116; the platypus sentence (13 words,
// 26 syllables) 24.4; "This sentence, taken as a reading passage unto itself, is being used to prove a point." 69. The syllable
// counter is a heuristic, so the last only has to land within 6 points (it counts "being" as one syllable).
const cat = S.readability('The cat sat on the mat.');
near('Flesch Reading Ease, "The cat sat on the mat." (published 116)', cat.fre, 116.145, 1e-9);
const plat = S.readability('The Australian platypus is seemingly a hybrid of a mammal and reptilian creature.');
same('Platypus sentence words and syllables', [plat.words, plat.syllables], [13, 26]);
near('Flesch Reading Ease, platypus (published 24.4)', plat.fre, 24.4, 0.1);
near('Flesch-Kincaid grade, platypus (by hand 13.08)', plat.fkgl, 0.39 * 13 + 11.8 * 2 - 15.59, 1e-9);
near('Flesch Reading Ease, "This sentence…" (published 69, heuristic within 6)', S.readability('This sentence, taken as a reading passage unto itself, is being used to prove a point.').fre, 69, 6);
const sylWords = { usability: 5, research: 2, participant: 4, questionnaire: 3, interface: 3, the: 1, experience: 4, simple: 2, make: 1, evaluation: 5, reptilian: 4, people: 2, table: 2, wanted: 2, jumped: 1, boxes: 2, likely: 2, statement: 2, science: 2, different: 3 };
const sylOk = Object.entries(sylWords).filter(([w, n]) => S.syllables(w) === n).length;
near('Syllable heuristic: share of 20 common UX words counted exactly (at least 90%)', sylOk / 20, 1, 0.1);
same('Sentence splitting with paragraphs and list items', S.readability('One two. Three four!\n\nFive six?\n- seven eight\n- nine').sentences, 5);

// ── Clustering (calc/cluster.js), against scikit-learn 1.9, scipy 1.18 and numpy 2.5 on the same data. The reference
// script computed: KMeans(init=fixed centres, n_init=1, algorithm='lloyd'), silhouette_score (Euclidean and precomputed),
// DBSCAN, a numpy Gower matrix, a brute-force k-medoids optimum over all 120 sets of 3 medoids, scipy linkage (ward and
// average), numpy SVD for PCA, numpy eigh for classical MDS and adjusted_rand_score.
const samePartition = (a, b) => { const f = new Map(), g = new Map(); for (let i = 0; i < a.length; i++) { if (f.has(a[i]) && f.get(a[i]) !== b[i]) return false; if (g.has(b[i]) && g.get(b[i]) !== a[i]) return false; f.set(a[i], b[i]); g.set(b[i], a[i]); } return true; };
const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const KX = [[1.0,2.0,0.5],[1.5,1.8,0.7],[5.0,8.0,3.1],[8.0,8.0,2.9],[1.0,0.6,0.4],[9.0,11.0,3.5],[8.0,2.0,6.0],[10.0,2.0,6.2],[9.0,3.0,5.5],[2.0,1.0,0.9],[7.5,9.0,3.0],[9.5,2.5,5.9]].map((r) => Float64Array.from(r));
const kmL = CL.kmeansLloyd(KX, [KX[0], KX[2], KX[6]]);
same('k-means labels from fixed centres (sklearn [0, 0, 1, 1, 0, 1, 2, 2, 2, 0, 1, 2])', samePartition(kmL.labels, [0, 0, 1, 1, 0, 1, 2, 2, 2, 0, 1, 2]), true);
near('k-means inertia (sklearn)', kmL.inertia, 20.174999999999997, 1e-9);
near('k-means++ with 10 restarts finds the same inertia', CL.kmeans(KX, 3, { seed: 3 }).inertia, 20.174999999999997, 1e-9);
near('k-prototypes with no nominal columns reduces to k-means (same inertia)', CL.kprototypes(KX, KX.map(() => []), 3, 1, { seed: 3 }).cost, 20.174999999999997, 1e-9);
near('Silhouette, Euclidean (sklearn silhouette_score)', CL.silhouette(CL.euclidMatrix(KX), 12, [0,0,1,1,0,1,2,2,2,0,1,1]).mean, 0.5581382251094512, 1e-12);
const DP = [[1,1],[1.2,1.1],[0.9,1.3],[1.1,0.8],[5,5],[5.2,5.1],[4.9,5.3],[5.1,4.8],[5.3,5.2],[9,1],[3,3],[1.05,1.0],[8.8,1.2],[9.1,0.9],[2.0,2.0]].map((r) => Float64Array.from(r));
const dbl = CL.dbscan(CL.euclidMatrix(DP), DP.length, 0.5, 3).labels;
same('DBSCAN eps 0.5, minPts 3: same clusters as sklearn', samePartition(dbl, [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, -1, 0, 2, 2, -1]), true);
same('DBSCAN noise points (sklearn: rows 10 and 14)', dbl.map((l, i) => (l < 0 ? i : -1)).filter((i) => i >= 0), [10, 14]);
// Gower on a mixed table: two continuous columns, an ordinal answer scale (detected from its labels) and a nominal one.
const gt = CL.parseTable('age,freq,team,score\n23,Never,a,1.5\n35,Sometimes,b,1.5\n47,Always,a,3.0\n52,Often,c,0\n29,Rarely,b,2.0\n61,Always,a,2.5\n38,Sometimes,c,1.0');
const gc = CL.guessColumns(gt);
same('Column types guessed', gc.map((c) => c.type), ['continuous', 'ordinal', 'nominal', 'continuous']);
same('Ordinal order from the answer scale', gc[1].levels, ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']);
const gp = CL.prepare(gt, gc.map((c) => ({ name: c.name, index: c.index, type: c.type, levels: c.levels })));
const GM = CL.gowerMatrix(gp.feats), GREF = [[0.0, 0.45394736842105265, 0.5328947368421053, 0.7532894736842105, 0.393640350877193, 0.5833333333333334, 0.5153508771929824], [0.45394736842105265, 0.0, 0.5789473684210527, 0.549342105263158, 0.14364035087719298, 0.6293859649122807, 0.31140350877192985], [0.5328947368421053, 0.5789473684210527, 0.0, 0.5953947368421053, 0.6392543859649124, 0.1337719298245614, 0.6008771929824561], [0.7532894736842105, 0.549342105263158, 0.5953947368421053, 0.0, 0.6929824561403508, 0.5800438596491229, 0.23793859649122806], [0.393640350877193, 0.14364035087719298, 0.6392543859649124, 0.6929824561403508, 0.0, 0.6896929824561403, 0.4550438596491228], [0.5833333333333334, 0.6293859649122807, 0.1337719298245614, 0.5800438596491229, 0.6896929824561403, 0.0, 0.6513157894736842], [0.5153508771929824, 0.31140350877192985, 0.6008771929824561, 0.23793859649122806, 0.4550438596491228, 0.6513157894736842, 0.0]];
near('Gower distance matrix, largest difference from numpy', maxDiff(Array.from(GM), GREF.flat()), 0, 1e-12);
near('Gower distance rows 1 and 4 (numpy 0.753289)', CL.gowerPair(gp.feats, 0, 3), 0.7532894736842105, 1e-12);
near('Silhouette on precomputed Gower distances (sklearn)', CL.silhouette(GM, 7, [0,1,0,1,0,2,1]).mean, -0.005240518380507565, 1e-12);
const PQ = [[0,0],[0.5,0.2],[0.1,0.9],[4,4],[4.3,3.8],[3.9,4.4],[8,0],[8.2,0.5],[7.7,0.3],[2,2.2]].map((r) => Float64Array.from(r));
const pm = CL.pam(CL.euclidMatrix(PQ), 10, 3);
same('PAM medoids (brute-force optimum [1, 3, 6])', [...pm.medoids].sort((a, b) => a - b), [1, 3, 6]);
near('PAM total distance (brute-force optimum)', pm.cost, 5.58038849507685, 1e-12);
const wz = CL.hclust(CL.euclidMatrix(PQ), 10, 'ward');
near('Ward merge heights, largest difference from scipy linkage', maxDiff(wz.map((z) => z[2]), [0.3605551275463989, 0.4242640687119284, 0.5385164807134505, 0.5715476066494076, 0.6454972243679032, 0.939858145324779, 3.1466913840837116, 8.720815274251546, 12.640531935763132]), 0, 1e-12);
same('Ward merge order and sizes (scipy)', wz.map((z) => [z[0], z[1], z[3]]), [[3, 4, 2], [6, 8, 2], [0, 1, 2], [7, 11, 3], [5, 10, 3], [2, 12, 3], [9, 15, 4], [14, 16, 7], [13, 17, 10]]);
near('Average-linkage heights on Gower, largest difference from scipy', maxDiff(CL.hclust(GM, 7, 'average').map((z) => z[2]), [0.1337719298245614, 0.14364035087719298, 0.23793859649122806, 0.42379385964912286, 0.5462353801169592, 0.6081140350877192]), 0, 1e-12);
same('Cutting the Ward tree at 3 clusters', samePartition(CL.cutTree(wz, 10, 3), [0,0,0,1,1,1,2,2,2,0]), true);
const pc = CL.pca(KX);
near('PCA explained variance, largest difference from numpy SVD', maxDiff(pc.variance, [21.088704376665678, 10.133886475225863, 0.23150005719935765]), 0, 1e-9);
near('PCA share of variance, first component (numpy)', pc.ratio[0], 0.670459827868387, 1e-12);
const mdsR = CL.classicalMDS(GM, 7);
near('Classical MDS eigenvalues, largest difference from numpy eigh', maxDiff(mdsR.eigenvalues, [0.44265934516671557, 0.3588497389671265]), 0, 1e-10);
near('Classical MDS coordinates up to sign, largest difference from numpy', maxDiff(mdsR.coords.flat(), [-0.12029530293672608, -0.2831320473034757, -0.23330601552955121, 0.00046265341261231285, 0.32180468681090724, -0.13052026885694162, 0.09982635466800166, 0.4146214650482723, -0.3050345047312535, -0.13905435711631486, 0.38222710384678127, -0.10573552264491672, -0.14522232212815944, 0.24335807746076418]), 0, 1e-8);
near('Adjusted Rand index (sklearn)', CL.ari([0,0,0,1,1,1,2,2,2,2,0,1], [1,1,0,0,2,2,2,2,0,0,1,2]), 0.21160409556313994, 1e-12);
near('Adjusted Rand index, same partition with other labels (sklearn 1)', CL.ari([0,0,1,1,-1,2,2], [5,5,3,3,7,1,1]), 1, 1e-12);
// The example survey: the four built-in respondent types come back as four clusters on Gower distance.
const ex = CL.parseTable(CL.exampleSurvey());
const exc = CL.guessColumns(ex);
same('Example survey column types', exc.map((c) => c.type), ['ignore', 'ordinal', 'nominal', 'continuous', 'ordinal', 'ordinal', 'ordinal', 'ordinal', 'ordinal', 'nominal', 'continuous']);
const exp = CL.prepare(ex, exc.filter((c) => c.type !== 'ignore').map((c) => ({ name: c.name, index: c.index, type: c.type, levels: c.levels })), 'impute');
const exr = CL.run(exp, { algo: 'pam', distance: 'gower', scaling: 'z', k: 'auto', seed: 1 });
same('Example survey: best k by silhouette (k-medoids on Gower)', exr.bestK, 4);
same('Example survey: CSV export adds cluster and persona columns', CL.toCSV(ex, exp.used, exr.labels, []).split('\n')[0].endsWith(',cluster,persona'), true);

// ── Model-based clustering (calc/cluster.js: fitMixture and friends). Reference values come from
// server/scripts/mixture-reference.py (scikit-learn 1.9 GaussianMixture and StepMix 3.0), stored in mixture-reference.json.
// Each fit starts from the same fixed parameters as the reference, so EM takes identical steps: after a fixed number of
// iterations (tol = 0) and at convergence (tol 1e-12) the parameters agree to rounding error.
const MX = JSON.parse(readFileSync(path.join(root, 'server', 'scripts', 'mixture-reference.json'), 'utf8'));
const flat = (a) => (Array.isArray(a) || ArrayBuffer.isView(a) ? Array.from(a).flatMap(flat) : [a]);
const gap = (a, b) => { const x = flat(a), y = flat(b); return x.length === y.length ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : Infinity; };
const G = MX.gmm, gmd = CL.rawMixtureData(G.X);
for (const ct of ['diag', 'full']) for (const tag of ['fixed3', 'conv']) {
  const ref = G[`${ct}_${tag}`];
  const init = { w: G.weights, mu: G.means.map((m) => Float64Array.from(m)), cov: ct === 'diag' ? G.cov_diag.map((v) => Float64Array.from(v)) : G.cov_full.map((M) => M.map((r) => Float64Array.from(r))) };
  const f = CL.fitMixture(gmd, 3, { model: 'gmm', cov: ct, init, maxIter: tag === 'conv' ? 2000 : 3, tol: tag === 'conv' ? 1e-12 : 0, reg: 1e-6, keepOrder: true });
  const what = `GMM ${ct}, ${tag === 'conv' ? 'converged' : '3 EM steps'}`;
  near(`${what}: weights, largest difference from sklearn`, gap(f.P.w, ref.weights), 0, 1e-9);
  near(`${what}: means, largest difference from sklearn`, gap(f.P.mu, ref.means), 0, 1e-9);
  near(`${what}: covariances, largest difference from sklearn`, gap(f.P.cov, ref.cov), 0, 1e-9);
  near(`${what}: log-likelihood (sklearn score × n = ${ref.ll.toFixed(4)})`, f.ll, ref.ll, 1e-8);
  near(`${what}: BIC (sklearn bic() = ${ref.bic.toFixed(4)})`, f.bic, ref.bic, 1e-8);
  near(`${what}: AIC (sklearn aic())`, f.aic, ref.aic, 1e-8);
  same(`${what}: parameter count (sklearn _n_parameters ${ref.nparams})`, f.nParams, ref.nparams);
  if (tag === 'conv') same(`${what}: iterations and convergence (sklearn ${ref.n_iter})`, [f.iter, f.converged], [ref.n_iter, ref.converged]);
}
same('GMM parameter counts by hand: diag (k−1) + 2kp, full (k−1) + kp + kp(p+1)/2, p = 3, k = 3', [CL.mixtureParams(gmd, 3, 'diag'), CL.mixtureParams(gmd, 3, 'full')], [2 + 18, 2 + 9 + 18]);
const gRun = CL.fitMixture(gmd, 3, { model: 'gmm', cov: 'full', nStarts: 10, seed: 2, tol: 1e-12, maxIter: 2000 });
// The fixed start above stops at a local maximum; the best of 100 sklearn k-means++ starts (random_state 0–99) is −216.717949.
near('GMM full from 10 seeded k-means++ restarts finds the best sklearn maximum over 100 starts', gRun.ll, -216.71794905551548, 1e-6);

const LC = MX.lca;
for (const which of ['complete', 'missing']) for (const tag of ['fixed5', 'conv']) {
  const ref = LC[`${which}_${tag}`];
  const md = CL.rawMixtureData(null, which === 'complete' ? LC.X : LC.Xm, LC.L);
  const init = { w: [1 / 3, 1 / 3, 1 / 3], theta: (which === 'complete' ? LC.theta0 : LC.theta0m).map((t) => t.map((x) => Float64Array.from(x))) };
  const f = CL.fitMixture(md, 3, { model: 'lca', init, maxIter: tag === 'conv' ? 5000 : 5, tol: tag === 'conv' ? 1e-12 : 0, alpha: 0, keepOrder: true });
  const what = `LCA ${which === 'complete' ? '300 × 5 items' : 'with 6% missing answers (MAR, skipped)'}, ${tag === 'conv' ? 'converged' : '5 EM steps'}`;
  const sizes = [0, 0, 0]; f.labels.forEach((l) => sizes[l]++);
  near(`${what}: item-response probabilities, largest difference from StepMix`, gap(f.P.theta, ref.theta), 0, 1e-8);
  near(`${what}: class weights, largest difference from StepMix`, gap(f.P.w, ref.w), 0, 1e-8);
  near(`${what}: log-likelihood (StepMix ${ref.ll.toFixed(4)})`, f.ll, ref.ll, 1e-8);
  near(`${what}: BIC (StepMix)`, f.bic, ref.bic, 1e-8);
  near(`${what}: entropy R² (StepMix relative_entropy)`, f.entropyR2, ref.entropyR2, 1e-8);
  same(`${what}: modal class sizes (StepMix ${JSON.stringify(ref.sizes)})`, sizes, ref.sizes);
  same(`${what}: parameter count (StepMix ${ref.nparams})`, f.nParams, ref.nparams);
  if (tag === 'conv') same(`${what}: iterations (StepMix ${ref.n_iter})`, f.iter, ref.n_iter);
}
// Stouffer and Toby (1951) role-conflict data (poLCA's `values`, n = 216, 4 yes/no items). Published 2-class fit
// (Linzer and Lewis 2011, poLCA): log-likelihood −504.4677, AIC 1026.935, BIC 1057.313; Goodman (1974): classes of
// about 28% and 72%.
const V = LC.values, vRows = [];
V.patterns.forEach((p, i) => { for (let t = 0; t < V.counts[i]; t++) vRows.push([...p].map((ch) => +ch - 1)); });
const vf = CL.fitMixture(CL.rawMixtureData(null, vRows, [2, 2, 2, 2]), 2, { model: 'lca', nStarts: 20, nFinal: 20, seed: 1, alpha: 0, tol: 1e-12, maxIter: 5000 });
near('Stouffer-Toby 2-class LCA: log-likelihood (poLCA −504.4677)', vf.ll, -504.4677, 1e-4);
near('Stouffer-Toby 2-class LCA: AIC (poLCA 1026.935)', vf.aic, 1026.935, 1e-3);
near('Stouffer-Toby 2-class LCA: BIC (poLCA 1057.313)', vf.bic, 1057.313, 1e-3);
near('Stouffer-Toby 2-class LCA: smaller class (Goodman 0.28; StepMix)', vf.P.w[1], V.w[1], 1e-6);
near('Stouffer-Toby 2-class LCA: P(yes) by item and class, largest difference from StepMix', gap(vf.P.theta.map((t) => t.map((x) => x[0])), V.p_first), 0, 1e-6);
same('Stouffer-Toby: all 20 random starts reach the same maximum', vf.hits, 20);
const vs = CL.fitMixture(CL.rawMixtureData(null, vRows, [2, 2, 2, 2]), 2, { model: 'lca', nStarts: 20, seed: 1, tol: 1e-10 });
same('LCA smoothing (α = 1) keeps every item probability strictly between 0 and 1', flat(vs.P.theta).every((v) => v > 0 && v < 1), true);

const MXD = MX.mixed, mmd = CL.rawMixtureData(MXD.Xn, MXD.Xc, MXD.L), R0 = Float64Array.from(MXD.R0.flat());
for (const tag of ['fixed5', 'conv']) {
  const ref = MXD[tag];
  const init = { ...CL.mixtureMStep(mmd, R0, 3, { alpha: 0 }), w: [1 / 3, 1 / 3, 1 / 3] };
  const f = CL.fitMixture(mmd, 3, { model: 'mixed', init, maxIter: tag === 'conv' ? 5000 : 5, tol: tag === 'conv' ? 1e-12 : 0, alpha: 0, keepOrder: true });
  const what = `Mixed model (2 continuous + 3 categorical), ${tag === 'conv' ? 'converged' : '5 EM steps'}`;
  near(`${what}: means and variances, largest difference from StepMix`, Math.max(gap(f.P.mu, ref.means), gap(f.P.cov, ref.cov)), 0, 1e-8);
  near(`${what}: item-response probabilities, largest difference from StepMix`, gap(f.P.theta, ref.theta), 0, 1e-8);
  near(`${what}: log-likelihood (StepMix ${ref.ll.toFixed(4)})`, f.ll, ref.ll, 1e-8);
  near(`${what}: BIC (StepMix)`, f.bic, ref.bic, 1e-8);
  same(`${what}: parameter count (StepMix ${ref.nparams})`, f.nParams, ref.nparams);
}
// The mixed model reduces to the diagonal Gaussian mixture with no categorical columns, and to LCA with no continuous ones.
const mxSpec = (types) => exc.filter((c) => c.type !== 'ignore').map((c) => ({ name: c.name, index: c.index, type: types[c.type] ?? c.type, levels: c.levels })).filter((s) => s.type !== 'ignore');
const contOnly = CL.prepare(ex, mxSpec({ ordinal: 'ignore', nominal: 'ignore' }), 'skip');
const sw = (algo, prep, cov) => CL.runMixture(prep, { algo, cov, k: 'auto', seed: 3, nStarts: 4 }).mix.sweep;
const swM = sw('mixed', contOnly), swG = sw('gmm', contOnly, 'diag');
near('Mixed model with only continuous columns = GMM diag: log-likelihood for k = 1..8, largest difference', gap(swM.map((s) => s.ll), swG.map((s) => s.ll)), 0, 1e-9);
same('Mixed model with only continuous columns = GMM diag: parameter counts and BIC choice', [swM.map((s) => s.nParams), swM.reduce((a, b) => (b.bic < a.bic ? b : a)).k], [swG.map((s) => s.nParams), swG.reduce((a, b) => (b.bic < a.bic ? b : a)).k]);
const catOnly = CL.prepare(ex, mxSpec({ continuous: 'ignore' }), 'skip');
const swM2 = sw('mixed', catOnly), swL = sw('lca', catOnly);
near('Mixed model with no continuous columns = LCA: log-likelihood for k = 1..8, largest difference', gap(swM2.map((s) => s.ll), swL.map((s) => s.ll)), 0, 1e-9);
same('Mixed model with no continuous columns = LCA: parameter counts', swM2.map((s) => s.nParams), swL.map((s) => s.nParams));
// Entropy R², AIC, BIC, ICL and the average-posterior table by hand: n = 2, k = 2, one numeric column, LL = −10,
// posteriors (0.9, 0.1) and (0.2, 0.8). P = 1 + 2 + 2 = 5; E = −Σ p ln p = 0.825299…; R² = 1 − E/(2 ln 2).
const hs = CL.mixtureStats(CL.rawMixtureData([[0], [1]]), 2, { R: Float64Array.from([0.9, 0.1, 0.2, 0.8]), ll: -10 });
const Eh = -(0.9 * Math.log(0.9) + 0.1 * Math.log(0.1) + 0.2 * Math.log(0.2) + 0.8 * Math.log(0.8));
near('Entropy R² by hand, 1 − E/(n ln k)', hs.entropyR2, 1 - Eh / (2 * Math.log(2)), 1e-12);
near('AIC by hand, −2 LL + 2P = 20 + 10', hs.aic, 30, 1e-12);
near('BIC by hand, −2 LL + P ln n = 20 + 5 ln 2', hs.bic, 20 + 5 * Math.log(2), 1e-12);
near('ICL-BIC by hand, BIC + 2E', hs.icl, 20 + 5 * Math.log(2) + 2 * Eh, 1e-12);
same('Average posterior table by hand, diagonal [0.9, 0.8]', hs.avepp.map((r, i) => r[i]), [0.9, 0.8]);
near('Entropy R² of a converged fit matches 1 − Σ −p ln p/(n ln k) recomputed from its posteriors', gRun.entropyR2, 1 - flat(gRun.R).reduce((s, p) => s - (p > 0 ? p * Math.log(p) : 0), 0) / (gmd.n * Math.log(3)), 1e-12);
// The example survey: BIC picks the four built-in respondent types with LCA and with the mixed model.
const exs = CL.prepare(ex, exc.filter((c) => c.type !== 'ignore').map((c) => ({ name: c.name, index: c.index, type: c.type, levels: c.levels })), 'skip');
const exLca = CL.runMixture(exs, { algo: 'lca', k: 'auto', seed: 1 }), exMix = CL.runMixture(exs, { algo: 'mixed', k: 'auto', seed: 1 });
same('Example survey: k by BIC, LCA and mixed model', [exLca.bestK, exMix.bestK], [4, 4]);
same('Example survey, mixed model: average posterior probability above 0.8 in every class', exMix.mix.avepp.every((r, i) => r[i] > 0.8), true);
const csvHead = CL.toCSV(ex, exs.used, exMix.labels, [], { k: exMix.k, R: exMix.mix.R }).split('\n');
same('Mixture CSV export adds p_cluster_1..4 and certainty', csvHead[0].split(',').slice(-5), ['p_cluster_1', 'p_cluster_2', 'p_cluster_3', 'p_cluster_4', 'certainty']);
near('Mixture CSV: posterior probabilities in a row sum to 1', csvHead[1].split(',').slice(-5, -1).reduce((s, v) => s + Number(v), 0), 1, 1e-5);
const exProf = CL.mixtureProfiles(exs, exMix.labels, exMix.mix);
same('LCA-style persona text uses class-conditional probabilities', /^\d+% likely to answer .+ vs \d+% overall$/.test(exProf[0].apart.find((a) => a.model === 'cat').text), true);

// ── The shared catalog matches the calculators page: every calculator has a component, and the methods each one
// lists in calc/catalog.js are exactly the methods its "How this is calculated" section links to.
// ── Every atlas method a calculator links to exists.
const src = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8');
const linked = new Set([...src.matchAll(/method="([a-z0-9-]+)"/g)].map((m) => m[1]));
// Conditional links: the strings after ? and : in method={cond ? 'a' : 'b'}; extra links: the first string of each pair in links={[...]}.
for (const m of src.matchAll(/method=\{[^}]*\}/g)) for (const x of m[0].matchAll(/[?:] '([a-z0-9-]+)'/g)) linked.add(x[1]);
for (const m of src.matchAll(/links=\{\[(.*?)\]\}>/g)) for (const x of m[1].matchAll(/\['([a-z0-9-]+)', /g)) linked.add(x[1]);
const missing = [...linked].filter((id) => !kinds.byId.has(id));
same(`All ${linked.size} linked method ids exist`, missing, []);

const compBlock = src.slice(src.indexOf('const COMPONENTS = {'), src.indexOf('};', src.indexOf('const COMPONENTS = {')));
const compOf = Object.fromEntries([...compBlock.matchAll(/'?([a-z0-9-]+)'?: ([A-Za-z]+)/g)].map((m) => [m[1], m[2]]));
const bodyOf = (name) => { const i = src.indexOf(`\nfunction ${name}(`); const j = src.indexOf('\n// ── ', i + 1); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j); };
const idsIn = (body) => {
  const ids = new Set([...body.matchAll(/method="([a-z0-9-]+)"/g)].map((m) => m[1]));
  for (const m of body.matchAll(/method=\{[^}]*\}/g)) for (const x of m[0].matchAll(/[?:] '([a-z0-9-]+)'/g)) ids.add(x[1]);
  for (const m of body.matchAll(/links=\{\[(.*?)\]\}>/g)) for (const x of m[1].matchAll(/\['([a-z0-9-]+)', /g)) ids.add(x[1]);
  return [...ids].sort();
};
const drift = CATALOG.filter((c) => !compOf[c.id] || JSON.stringify(idsIn(bodyOf(compOf[c.id]))) !== JSON.stringify([...c.methods].sort())).map((c) => c.id);
same(`Catalog matches the page for all ${CATALOG.length} calculators`, drift, []);
same('Catalog ids are unique', new Set(CATALOG.map((c) => c.id)).size, CATALOG.length);
same('Every catalog method id exists', Object.keys(CALCS_BY_METHOD).filter((id) => !kinds.byId.has(id)), []);
same('Reverse map: calculators for lostness-metric', (CALCS_BY_METHOD['lostness-metric'] || []).map((c) => c.id), ['lostness']);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
