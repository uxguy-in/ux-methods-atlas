// Checks the calculator statistics against published worked examples and values from scipy, statsmodels and
// pingouin. Run with `npm run check:calc`. Reference values were produced with scipy 1.18, statsmodels 0.15 and
// pingouin 0.7 on the same data; published examples are cited next to each check.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
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
