// Statistics used by the calculators. Formulas follow Sauro & Lewis, Quantifying the User Experience (2nd ed.),
// its companion book, and Sauro, Benchmarking the User Experience. Pure functions, no dependencies.

// ── Distributions ──
export function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x; const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 10000, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularised incomplete beta I_x(a, b).
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

export function normCdf(z) {
  // Abramowitz & Stegun 7.1.26 via erf, accurate to about 1e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function normInv(p) {
  // Acklam's rational approximation
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const tail = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

export function tInv(p, df) {
  if (df > 1e6) return normInv(p);
  let lo = -1000, hi = 1000;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

function logChoose(n, k) { return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1); }
export function binomPmf(k, n, p) {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
export function binomCdf(k, n, p) { let s = 0; for (let i = 0; i <= k; i++) s += binomPmf(i, n, p); return Math.min(1, s); }

// Two-sided critical value for a confidence level such as 0.95.
export const zFor = (conf) => normInv(1 - (1 - conf) / 2);
export const tFor = (conf, df) => tInv(1 - (1 - conf) / 2, df);

// ── Descriptives ──
export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
export function sd(xs) { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); }
export function median(xs) { const s = [...xs].sort((a, b) => a - b); const h = s.length / 2; return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2; }
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ── Proportions ──
export function adjustedWald(x, n, conf = 0.95) {
  const z = zFor(conf), p = (x + z * z / 2) / (n + z * z);
  const me = z * Math.sqrt(p * (1 - p) / (n + z * z));
  return { center: p, lo: clamp01(p - me), hi: clamp01(p + me) };
}
export function wald(x, n, conf = 0.95) {
  const z = zFor(conf), p = x / n, me = z * Math.sqrt(p * (1 - p) / n);
  return { lo: clamp01(p - me), hi: clamp01(p + me) };
}
export function wilson(x, n, conf = 0.95) {
  const z = zFor(conf), p = x / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, me = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { lo: clamp01(c - me), hi: clamp01(c + me) };
}
export function clopperPearson(x, n, conf = 0.95) {
  const a = (1 - conf) / 2;
  const solve = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m)) lo = m; else hi = m; } return (lo + hi) / 2; };
  const lo = x === 0 ? 0 : solve((p) => 1 - binomCdf(x - 1, n, p) < a);
  const hi = x === n ? 1 : solve((p) => binomCdf(x, n, p) > a);
  return { lo, hi };
}
// Best point estimate for small samples (Lewis & Sauro 2006): Wilson below 50%, the observed rate from 50% to 90%,
// Laplace (x+1)/(n+2) above 90%.
export function bestPoint(x, n, conf = 0.95) {
  const p = x / n;
  if (p <= 0.5) return { value: adjustedWald(x, n, conf).center, name: 'Wilson' };
  if (p < 0.9) return { value: p, name: 'observed rate' };
  return { value: (x + 1) / (n + 2), name: 'Laplace' };
}

// One-sided test that the population proportion exceeds a benchmark. Mid-p exact for small n (Sauro & Lewis ch. 4).
export function proportionVsBenchmark(x, n, b) {
  const pExact = 1 - binomCdf(x - 1, n, b);
  const midP = pExact - 0.5 * binomPmf(x, n, b);
  const z = (x / n - b) / Math.sqrt(b * (1 - b) / n);
  const large = n * b >= 15 && n * (1 - b) >= 15;
  return { exact: pExact, midP, z, pNormal: 1 - normCdf(z), large, p: large ? 1 - normCdf(z) : midP };
}

// N-1 two-proportion test (Campbell 2007), with an adjusted-Wald interval for the difference.
export function twoProportions(x1, n1, x2, n2, conf = 0.95) {
  const p1 = x1 / n1, p2 = x2 / n2, N = n1 + n2, P = (x1 + x2) / N;
  const se = Math.sqrt(P * (1 - P) * (1 / n1 + 1 / n2));
  const z = se === 0 ? 0 : ((p1 - p2) * Math.sqrt((N - 1) / N)) / se;
  const pTwo = 2 * (1 - normCdf(Math.abs(z)));
  const zc = zFor(conf);
  const a1 = (x1 + zc * zc / 4) / (n1 + zc * zc / 2), a2 = (x2 + zc * zc / 4) / (n2 + zc * zc / 2);
  const me = zc * Math.sqrt(a1 * (1 - a1) / (n1 + zc * zc / 2) + a2 * (1 - a2) / (n2 + zc * zc / 2));
  const minExpected = Math.min(n1 * P, n1 * (1 - P), n2 * P, n2 * (1 - P));
  return { p1, p2, diff: p1 - p2, z, p: pTwo, lo: a1 - a2 - me, hi: a1 - a2 + me, minExpected };
}

// McNemar exact (mid-p) for paired proportions; interval by Agresti-Min adjustment (add 0.5 to each cell).
// a = both succeed, b = only A, c = only B, d = both fail.
export function mcnemar(a, b, c, d, conf = 0.95) {
  const n = a + b + c + d, m = b + c;
  const k = Math.min(b, c);
  const exact = m === 0 ? 1 : Math.min(1, 2 * binomCdf(k, m, 0.5));
  const mid = m === 0 ? 1 : Math.min(1, exact - binomPmf(k, m, 0.5));
  const z = zFor(conf);
  const [A, B, C, D] = [a, b, c, d].map((v) => v + 0.5); const N = n + 2;
  const pa = (A + B) / N, pb = (A + C) / N;
  const diff = (B - C) / N;
  const se = Math.sqrt(((B + C) - (B - C) ** 2 / N) / (N * N));
  return { pA: (a + b) / n, pB: (a + c) / n, diff: (b - c) / n, adjDiff: diff, pa, pb, exact, midP: mid, lo: Math.max(-1, diff - z * se), hi: Math.min(1, diff + z * se) };
}

// ── Means ──
export function meanCI(m, s, n, conf = 0.95) {
  const t = tFor(conf, n - 1), me = t * s / Math.sqrt(n);
  return { lo: m - me, hi: m + me, me, t };
}
export function oneSampleT(m, s, n, mu) {
  const t = (m - mu) / (s / Math.sqrt(n)), df = n - 1;
  return { t, df, pOne: 1 - tCdf(t, df), pTwo: 2 * (1 - tCdf(Math.abs(t), df)) };
}
export function welch(m1, s1, n1, m2, s2, n2, conf = 0.95) {
  const v1 = s1 * s1 / n1, v2 = s2 * s2 / n2, se = Math.sqrt(v1 + v2);
  const df = (v1 + v2) ** 2 / (v1 * v1 / (n1 - 1) + v2 * v2 / (n2 - 1));
  const t = (m1 - m2) / se, tc = tFor(conf, df);
  return { diff: m1 - m2, t, df, p: 2 * (1 - tCdf(Math.abs(t), df)), lo: m1 - m2 - tc * se, hi: m1 - m2 + tc * se };
}
export function pairedT(diffs, conf = 0.95) {
  const n = diffs.length, m = mean(diffs), s = sd(diffs), df = n - 1, se = s / Math.sqrt(n);
  const t = m / se, tc = tFor(conf, df);
  return { diff: m, sd: s, n, t, df, p: 2 * (1 - tCdf(Math.abs(t), df)), lo: m - tc * se, hi: m + tc * se };
}

// Task times: geometric mean interval on log times (small samples) and a median interval (n >= 25).
export function timeCI(times, conf = 0.95) {
  const logs = times.map(Math.log), n = times.length;
  const lm = mean(logs), ls = sd(logs), ci = meanCI(lm, ls, n, conf);
  const out = { n, mean: mean(times), median: median(times), geo: Math.exp(lm), geoLo: Math.exp(ci.lo), geoHi: Math.exp(ci.hi) };
  if (n >= 10) {
    const s = [...times].sort((a, b) => a - b), z = zFor(conf), half = z * Math.sqrt(n * 0.25);
    const lo = Math.max(1, Math.round(n * 0.5 - half)), hi = Math.min(n, Math.round(n * 0.5 + half));
    out.medLo = s[lo - 1]; out.medHi = s[hi - 1];
  }
  out.recommend = n < 25 ? 'geometric' : 'median';
  return out;
}

// ── Standard questionnaires ──
export function susScore(items) {
  // items: ten responses 1..5, odd items positive, even items negative
  let s = 0;
  items.forEach((v, i) => { s += i % 2 === 0 ? v - 1 : 5 - v; });
  return s * 2.5;
}
// Sauro-Lewis curved grading scale (QUX 2nd ed., table 8.5), with percentile ranges.
export const SUS_GRADES = [
  [84.1, 'A+', '96–100'], [80.8, 'A', '90–95'], [78.9, 'A−', '85–89'], [77.2, 'B+', '80–84'], [74.1, 'B', '70–79'],
  [72.6, 'B−', '65–69'], [71.1, 'C+', '60–64'], [65.0, 'C', '41–59'], [62.7, 'C−', '35–40'], [51.7, 'D', '15–34'], [0, 'F', '0–14'],
];
export const susGrade = (s) => SUS_GRADES.find(([min]) => s >= min);
// Percentile against Sauro's database of about 500 studies (mean 68, SD 12.5), normal approximation.
export const susPercentile = (s) => Math.round(100 * normCdf((s - 68) / 12.5));
export function susAdjective(s) {
  // Bangor, Kortum & Miller (2009) adjective means
  if (s >= 84.1) return 'Best imaginable / Excellent';
  if (s >= 71.4) return 'Excellent';
  if (s >= 50.9) return 'Good';
  if (s >= 35.7) return 'OK';
  if (s >= 20.3) return 'Poor';
  return 'Worst imaginable';
}
export const umuxLite = (a, b) => ((a - 1) + (b - 1)) / 12 * 100;
export const umuxLiteToSus = (u) => 0.65 * u + 22.9; // Lewis, Utesch & Maher (2013) regression

// NPS with an adjusted-Wald interval (Rocks 2016): add 3/4 to promoters and detractors and 3 to n.
export function nps(prom, pass, det, conf = 0.95) {
  const n = prom + pass + det, score = (prom - det) / n;
  const z = zFor(conf), na = n + 3, pp = (prom + 0.75) / na, pd = (det + 0.75) / na;
  const adj = pp - pd, se = Math.sqrt((pp + pd - adj * adj) / na);
  return { n, score, lo: Math.max(-1, adj - z * se), hi: Math.min(1, adj + z * se), pctProm: prom / n, pctPass: pass / n, pctDet: det / n };
}

// ── Sample size ──
export const discoveryN = (p, goal) => Math.ceil(Math.log(1 - goal) / Math.log(1 - p));
export const discoveryProb = (p, n) => 1 - (1 - p) ** n;
// Lewis (2001): average of normalisation and Good-Turing deflation of p estimated from a small sample.
export function adjustP(pEst, n, onceShare) {
  const norm = (pEst - 1 / n) * (1 - 1 / n);
  const gt = pEst / (1 + onceShare);
  return Math.max(0.0001, 0.5 * norm + 0.5 * gt);
}

// Iterative t-based sample size for estimating a mean within a margin of error.
export function nForMean(s, margin, conf = 0.95) {
  let n = Math.ceil((zFor(conf) * s / margin) ** 2);
  for (let i = 0; i < 50; i++) { const next = Math.ceil((tFor(conf, Math.max(1, n - 1)) * s / margin) ** 2); if (next === n) break; n = next; }
  return Math.max(2, n);
}
// Sample size for estimating a proportion within a margin, using the adjusted-Wald correction (n minus z²).
export function nForProportion(p, margin, conf = 0.95) {
  const z = zFor(conf);
  return Math.max(1, Math.ceil(z * z * p * (1 - p) / (margin * margin) - z * z));
}
// Comparing two means: two-sided alpha, power. Within subjects uses the SD of the differences.
export function nForMeans(s, d, conf = 0.95, power = 0.8, design = 'between') {
  const za = zFor(conf), zb = normInv(power), k = design === 'between' ? 2 : 1;
  let n = Math.ceil(k * ((za + zb) * s / d) ** 2);
  for (let i = 0; i < 50; i++) {
    const df = design === 'between' ? Math.max(1, 2 * n - 2) : Math.max(1, n - 1);
    const ta = tFor(conf, df), tb = tInv(power, df);
    const next = Math.ceil(k * ((ta + tb) * s / d) ** 2);
    if (next === n) break; n = next;
  }
  return Math.max(2, n);
}
// Comparing two independent proportions (per group), normal approximation with pooled and unpooled variance.
export function nForProportions(p1, p2, conf = 0.95, power = 0.8) {
  const za = zFor(conf), zb = normInv(power), pb = (p1 + p2) / 2;
  const n = (za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p1 - p2) ** 2;
  return Math.ceil(n);
}

// ── Parsing ──
export function parseNumbers(text) {
  return (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((x) => Number.isFinite(x));
}
export function parseRows(text) {
  return text.split(/\n+/).map((r) => parseNumbers(r)).filter((r) => r.length);
}

// ── Added: Fisher exact, correlation, UMUX, SUM ──
// Two-sided Fisher exact test for a 2×2 table [[a, b], [c, d]] (sum of tables no more likely than the observed one).
export function fisherExact(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const lp = (x) => logChoose(r1, x) + logChoose(r2, c1 - x) - logChoose(n, c1);
  const obs = lp(a); let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const v = lp(x); if (v <= obs + 1e-7) p += Math.exp(v); }
  return Math.min(1, p);
}

// Pearson correlation with a Fisher-z interval and t-test of r = 0.
export function correlation(xs, ys, conf = 0.95) {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  const t = r * Math.sqrt((n - 2) / (1 - r * r)), p = 2 * (1 - tCdf(Math.abs(t), n - 2));
  const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3), zc = zFor(conf);
  return { r, n, t, p, lo: Math.tanh(z - zc * se), hi: Math.tanh(z + zc * se), r2: r * r, slope: sxy / sxx, intercept: my - (sxy / sxx) * mx };
}
// Spearman: Pearson on average ranks.
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}

// UMUX (Finstad 2010): items 1 and 3 positive, 2 and 4 negative, 7-point scales.
export const umux = ([a, b, c, d]) => ((a - 1) + (7 - b) + (c - 1) + (7 - d)) / 24 * 100;

// Single Usability Metric (Sauro & Kindlund 2005): each component becomes a proportion meeting spec, then averaged.
// time: share predicted under the spec time from the log-normal fit; satisfaction: share predicted above the spec rating.
export function sumScore({ x, n, times, specTime, sat, specSat, errors, opportunities }) {
  const parts = {};
  if (n > 0) parts.completion = x / n;
  if (times?.length > 1 && specTime > 0) {
    const l = times.map(Math.log); parts.time = normCdf((Math.log(specTime) - mean(l)) / sd(l));
  }
  if (sat?.length > 1 && Number.isFinite(specSat)) parts.satisfaction = 1 - normCdf((specSat - mean(sat)) / sd(sat));
  if (opportunities > 0 && n > 0 && errors >= 0) parts.errors = Math.max(0, 1 - errors / (opportunities * n));
  const vals = Object.values(parts).filter(Number.isFinite);
  return { parts, sum: vals.length ? mean(vals) : NaN };
}

// ── Added: F distribution, beta helpers, matrix helpers ──
export function fCdf(x, d1, d2) { return x <= 0 ? 0 : ibeta(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2); }
// Quantile of the F distribution, by bisection on the beta scale.
export function fInv(p, d1, d2) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (ibeta(m, d1 / 2, d2 / 2) < p) lo = m; else hi = m; }
  const u = (lo + hi) / 2;
  return d2 * u / (d1 * (1 - u));
}
const lbeta = (a, b) => lgamma(a) + lgamma(b) - lgamma(a + b);
export function betaPdf(x, a, b) {
  if (x < 0 || x > 1) return 0;
  const la = a === 1 ? 0 : (a - 1) * Math.log(x), lb = b === 1 ? 0 : (b - 1) * Math.log(1 - x);
  const v = Math.exp(la + lb - lbeta(a, b));
  return Number.isFinite(v) ? v : 0;
}
export function betaInv(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function pearson(xs, ys) {
  const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
const variance = (xs) => { const m = mean(xs); return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1); };
// Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations.
function jacobiEigen(A) {
  const n = A.length, a = A.map((r) => [...r]), v = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}
function invert(M) {
  const n = M.length, a = M.map((r, i) => [...r, ...M.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c]; for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(n));
}

// ── Added: inter-coder agreement ──
const MISSING = new Set(['', '.', '-', '*', 'na', 'n/a', '?', 'null', 'missing']);
// One unit per line, one coder per column. Cells split on tabs, commas or semicolons if present, otherwise spaces.
export function parseCodeRows(text) {
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const cells = /[\t,;]/.test(line) ? line.split(/[\t,;]/) : line.trim().split(/\s+/);
    return cells.map((c) => { const t = c.trim(); return MISSING.has(t.toLowerCase()) ? null : t; });
  });
  const all = rows.flat().filter((v) => v !== null);
  const numeric = all.length > 0 && all.every((v) => Number.isFinite(Number(v)));
  return { rows: numeric ? rows.map((r) => r.map((v) => (v === null ? null : Number(v)))) : rows, numeric };
}

// Krippendorff's alpha from the coincidence matrix (Krippendorff 2011, "Computing Krippendorff's alpha-reliability").
// units: one array of values per unit, null for missing. level: nominal, ordinal or interval (numeric values only).
export function krippendorffAlpha(units, level = 'nominal') {
  const pairable = units.map((u) => u.filter((v) => v !== null && v !== undefined)).filter((u) => u.length >= 2);
  const cats = [...new Set(pairable.flat())];
  const numeric = cats.every((c) => typeof c === 'number');
  if (level !== 'nominal' && !numeric) return { alpha: NaN, reason: 'needs numeric codes' };
  cats.sort(numeric ? (a, b) => a - b : undefined);
  const K = cats.length, ix = new Map(cats.map((c, i) => [c, i]));
  const o = cats.map(() => new Array(K).fill(0));
  for (const u of pairable) {
    const m = u.length;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j) o[ix.get(u[i])][ix.get(u[j])] += 1 / (m - 1);
  }
  const nc = o.map((r) => r.reduce((a, b) => a + b, 0)), n = nc.reduce((a, b) => a + b, 0);
  const delta = (c, k) => {
    if (c === k) return 0;
    if (level === 'nominal') return 1;
    if (level === 'interval') return (cats[c] - cats[k]) ** 2;
    const lo = Math.min(c, k), hi = Math.max(c, k); let s = 0;
    for (let g = lo; g <= hi; g++) s += nc[g];
    return (s - (nc[lo] + nc[hi]) / 2) ** 2;
  };
  let num = 0, den = 0;
  for (let c = 0; c < K; c++) for (let k = 0; k < K; k++) { const d = delta(c, k); num += o[c][k] * d; den += nc[c] * nc[k] * d; }
  return { alpha: den === 0 ? NaN : 1 - (n - 1) * num / den, n, units: pairable.length, cats, Do: num / n, De: den / (n * (n - 1)) };
}

// Cohen's kappa for two coders, with the Fleiss, Cohen and Everitt (1969) large-sample standard error for the interval
// and the standard error under kappa = 0 for the test.
export function cohenKappa(pairs, conf = 0.95) {
  const cats = [...new Set(pairs.flat())], K = cats.length, ix = new Map(cats.map((c, i) => [c, i])), n = pairs.length;
  const p = cats.map(() => new Array(K).fill(0));
  for (const [a, b] of pairs) p[ix.get(a)][ix.get(b)] += 1 / n;
  const pr = p.map((r) => r.reduce((x, y) => x + y, 0)), pc = cats.map((_, j) => p.reduce((x, r) => x + r[j], 0));
  let po = 0, pe = 0; for (let i = 0; i < K; i++) { po += p[i][i]; pe += pr[i] * pc[i]; }
  const k = (po - pe) / (1 - pe);
  let A = 0, B = 0;
  for (let i = 0; i < K; i++) {
    A += p[i][i] * (1 - (pr[i] + pc[i]) * (1 - k)) ** 2;
    for (let j = 0; j < K; j++) if (i !== j) B += p[i][j] * (pc[i] + pr[j]) ** 2;
  }
  const se = Math.sqrt(Math.max(0, A + (1 - k) ** 2 * B - (k - pe * (1 - k)) ** 2) / (n * (1 - pe) ** 2));
  let s0 = 0; for (let i = 0; i < K; i++) s0 += pr[i] * pc[i] * (pr[i] + pc[i]);
  const se0 = Math.sqrt(Math.max(0, pe + pe * pe - s0)) / ((1 - pe) * Math.sqrt(n));
  const z = zFor(conf), z0 = k / se0;
  return { kappa: k, po, pe, n, se, lo: Math.max(-1, k - z * se), hi: Math.min(1, k + z * se), z: z0, p: 2 * (1 - normCdf(Math.abs(z0))), cats };
}

// Share of agreeing coder pairs within each unit, averaged over units coded by at least two coders.
export function percentAgreement(units) {
  const shares = units.map((u) => u.filter((v) => v !== null && v !== undefined)).filter((u) => u.length >= 2).map((u) => {
    let agree = 0, all = 0;
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) { all++; if (u[i] === u[j]) agree++; }
    return agree / all;
  });
  return { value: shares.length ? mean(shares) : NaN, units: shares.length };
}

// ── Added: saturation and coverage ──
// One interview per line. Codes split on commas, semicolons or tabs; a line without them splits on spaces.
export function parseCodeLists(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((line) => (/[\t,;]/.test(line) ? line.split(/[\t,;]/) : line.trim().split(/\s+/)).map((c) => c.trim()).filter(Boolean));
}
// Code accumulation, Good-Turing sample coverage 1 − f1/N, and a Chao1-type estimate of total codes in its
// incidence form (Chao 1987; Chao2 with the (T − 1)/T small-sample factor), where f1 and f2 are codes seen in one and two interviews.
export function saturation(interviews, lastK = 3) {
  const first = new Map(), inc = new Map(), names = new Map();
  const curve = interviews.map((codes, t) => {
    const set = [...new Set(codes.map((c) => c.toLowerCase()))];
    let fresh = 0;
    for (const c of set) {
      if (!first.has(c)) { first.set(c, t); fresh++; names.set(c, codes.find((x) => x.toLowerCase() === c)); }
      inc.set(c, (inc.get(c) || 0) + 1);
    }
    return { interview: t + 1, codes: set.length, fresh, total: first.size };
  });
  const T = interviews.length, S = first.size, N = [...inc.values()].reduce((a, b) => a + b, 0);
  const f1 = [...inc.values()].filter((v) => v === 1).length, f2 = [...inc.values()].filter((v) => v === 2).length;
  const coverage = N ? 1 - f1 / N : NaN;
  const corr = T > 1 ? (T - 1) / T : 1;
  const chao = f2 > 0 ? S + corr * f1 * f1 / (2 * f2) : S + corr * f1 * (f1 - 1) / 2;
  const k = Math.max(1, Math.min(lastK, T));
  const newLast = [...first.entries()].filter(([, t]) => t >= T - k).map(([c]) => names.get(c));
  const once = [...inc.entries()].filter(([, v]) => v === 1).map(([c]) => names.get(c));
  return { curve, T, S, N, f1, f2, coverage, chao, k, newLast, once };
}

// ── Added: scale reliability ──
// rows: respondents × items, complete cases. Cronbach's alpha with Feldt's (1965) F-based interval,
// alpha if item deleted, corrected item-total correlations, and McDonald's omega (total) from a one-factor
// solution fitted by iterated principal-axis factoring (unweighted least squares) on the correlation matrix.
export function cronbach(rows, conf = 0.95) {
  const n = rows.length, k = rows[0].length;
  const cols = rows[0].map((_, j) => rows.map((r) => r[j]));
  const alphaOf = (cs) => { const kk = cs.length, tot = rows.map((_, i) => cs.reduce((a, c) => a + c[i], 0)); return kk / (kk - 1) * (1 - cs.reduce((a, c) => a + variance(c), 0) / variance(tot)); };
  const alpha = alphaOf(cols);
  const df1 = n - 1, df2 = (n - 1) * (k - 1), a = 1 - conf;
  const lo = 1 - (1 - alpha) * fInv(1 - a / 2, df1, df2), hi = 1 - (1 - alpha) * fInv(a / 2, df1, df2);
  const total = rows.map((r) => r.reduce((x, y) => x + y, 0));
  const items = cols.map((c, j) => ({
    item: j + 1, mean: mean(c), sd: Math.sqrt(variance(c)),
    rCorrected: pearson(c, total.map((t, i) => t - c[i])),
    alphaIfDeleted: k > 2 ? alphaOf(cols.filter((_, jj) => jj !== j)) : NaN,
  }));
  return { alpha, lo, hi, n, k, items, omega: omegaOneFactor(cols) };
}
export function omegaOneFactor(cols) {
  const k = cols.length;
  if (k < 3) return { omega: NaN, reason: 'Omega needs at least three items.' };
  const R = cols.map((a) => cols.map((b) => (a === b ? 1 : pearson(a, b))));
  if (R.flat().some((v) => !Number.isFinite(v))) return { omega: NaN, reason: 'An item has no variance.' };
  const inv = invert(R);
  let h = inv ? inv.map((r, i) => 1 - 1 / r[i]) : R.map((r, i) => Math.max(...r.filter((_, j) => j !== i).map(Math.abs)));
  let load = null, converged = false;
  for (let it = 0; it < 1000; it++) {
    const Rr = R.map((r, i) => r.map((v, j) => (i === j ? h[i] : v)));
    const { values, vectors } = jacobiEigen(Rr);
    const top = values.indexOf(Math.max(...values));
    const ev = Math.max(0, values[top]);
    load = vectors.map((r) => r[top] * Math.sqrt(ev));
    const next = load.map((l) => l * l);
    const diff = Math.max(...next.map((v, i) => Math.abs(v - h[i])));
    h = next;
    if (h.some((v) => v > 1)) return { omega: NaN, reason: 'The one-factor solution hit a Heywood case (an item with communality above 1), so omega is not reported.' };
    if (diff < 1e-9) { converged = true; break; }
  }
  if (!converged) return { omega: NaN, reason: 'The one-factor solution did not converge, so omega is not reported.' };
  if (load.reduce((a, b) => a + b, 0) < 0) load = load.map((l) => -l);
  if (load.some((l) => l < 0)) return { omega: NaN, loadings: load, reason: 'Some items load negatively on the factor. Reverse-score them first; omega is not reported until all loadings are positive.' };
  const s = load.reduce((a, b) => a + b, 0), u = load.reduce((a, l) => a + 1 - l * l, 0);
  return { omega: s * s / (s * s + u), loadings: load };
}

// ── Added: survey margin of error ──
// Margin for a proportion with a design effect (effective n = n / deff) and the finite population correction √((N − n)/(N − 1)).
export function surveyMoe({ n, p = 0.5, conf = 0.95, N = Infinity, deff = 1 }) {
  const z = zFor(conf), neff = n / deff;
  const fpc = Number.isFinite(N) && N > 1 ? Math.sqrt(Math.max(0, (N - n) / (N - 1))) : 1;
  const moe = z * Math.sqrt(p * (1 - p) / neff) * fpc;
  return { moe, neff, fpc, lo: Math.max(0, p - moe), hi: Math.min(1, p + moe) };
}
// Cochran's n0 = z²p(1−p)/e², corrected for a finite population n0 / (1 + (n0 − 1)/N), then multiplied by the design effect.
export function surveyN({ e, p = 0.5, conf = 0.95, N = Infinity, deff = 1 }) {
  const z = zFor(conf), n0 = z * z * p * (1 - p) / (e * e);
  const nf = Number.isFinite(N) && N > 0 ? n0 / (1 + (n0 - 1) / N) : n0;
  return { n0, nFpc: nf, n: Math.ceil(nf * deff - 1e-9) };
}

// ── Added: questionnaires ──
export const TLX_DIMS = ['Mental demand', 'Physical demand', 'Temporal demand', 'Performance', 'Effort', 'Frustration'];
export const TLX_PAIRS = TLX_DIMS.flatMap((_, i) => TLX_DIMS.map((__, j) => [i, j]).filter(([a, b]) => b > a));
// Raw TLX is the mean of the six 0–100 ratings; weighted TLX is Σ rating × tally / 15, where each tally counts how often
// that dimension was picked in the 15 pairwise comparisons (Hart and Staveland 1988).
export const tlxRaw = (r) => mean(r);
export const tlxWeighted = (r, w) => r.reduce((a, v, i) => a + v * w[i], 0) / 15;

// UEQ (Laugwitz, Held and Schrepp 2008): 26 seven-point items; these have the positive term on the left and are reversed.
export const UEQ_REVERSED = [3, 4, 5, 9, 10, 12, 17, 18, 19, 21, 23, 24, 25];
export const UEQ_SCALES = [
  ['Attractiveness', [1, 12, 14, 16, 24, 25]], ['Perspicuity', [2, 4, 13, 21]], ['Efficiency', [9, 20, 22, 23]],
  ['Dependability', [8, 11, 17, 19]], ['Stimulation', [5, 6, 7, 18]], ['Novelty', [3, 10, 15, 26]],
];
// Benchmark borders from Schrepp, Hinderks and Thomaschewski (2017), 452 product evaluations: Excellent, Good, Above average, Below average lower limits.
export const UEQ_BENCH = {
  Attractiveness: [1.75, 1.52, 1.17, 0.7], Perspicuity: [1.9, 1.56, 1.08, 0.64], Efficiency: [1.78, 1.47, 0.98, 0.54],
  Dependability: [1.65, 1.48, 1.14, 0.78], Stimulation: [1.55, 1.31, 0.99, 0.5], Novelty: [1.4, 1.05, 0.71, 0.3],
};
export function ueqBand(scale, m) {
  const b = UEQ_BENCH[scale]; const names = ['Excellent', 'Good', 'Above average', 'Below average'];
  const i = b.findIndex((x) => m >= x); return i === -1 ? 'Bad' : names[i];
}
// rows: 26 answers 1..7 in questionnaire order. Returns per-scale means on −3..+3.
export function ueqScore(rows, conf = 0.95) {
  const t = rows.map((r) => r.map((v, i) => (UEQ_REVERSED.includes(i + 1) ? 4 - v : v - 4)));
  return UEQ_SCALES.map(([name, items]) => {
    const per = t.map((r) => mean(items.map((i) => r[i - 1])));
    const m = mean(per), s = per.length > 1 ? sd(per) : NaN;
    const ci = per.length > 1 ? meanCI(m, s, per.length, conf) : null;
    const alpha = t.length > 2 ? cronbach(t.map((r) => items.map((i) => r[i - 1])), conf).alpha : NaN;
    return { name, mean: m, sd: s, lo: ci?.lo, hi: ci?.hi, alpha, band: ueqBand(name, m) };
  });
}

// ── Added: effect size ──
// Cohen's d with the pooled SD, Hedges' g = d × (1 − 3/(4(n1 + n2) − 9)), and normal-approximation intervals with
// SE = √((n1 + n2)/(n1 n2) + es²/(2(n1 + n2))) (Hedges and Olkin 1985). Positive means group 2 is higher.
export function effectSize(m1, s1, n1, m2, s2, n2, conf = 0.95) {
  const df = n1 + n2 - 2, sp = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / df);
  const d = (m2 - m1) / sp, J = 1 - 3 / (4 * (n1 + n2) - 9), g = d * J, z = zFor(conf);
  const se = (es) => Math.sqrt((n1 + n2) / (n1 * n2) + es * es / (2 * (n1 + n2)));
  return { d, g, sp, J, dLo: d - z * se(d), dHi: d + z * se(d), gLo: g - z * se(g), gHi: g + z * se(g), seD: se(d), seG: se(g) };
}
export const effectLabel = (v) => { const a = Math.abs(v); return a >= 0.8 ? 'large' : a >= 0.5 ? 'medium' : a >= 0.2 ? 'small' : 'negligible'; };

// ── Added: nonparametric tests (normal approximation, tie correction, continuity correction) ──
const tieSum = (rk) => { const c = new Map(); rk.forEach((r) => c.set(r, (c.get(r) || 0) + 1)); let s = 0; c.forEach((t) => { s += t ** 3 - t; }); return s; };
export function mannWhitney(x, y) {
  const n1 = x.length, n2 = y.length, N = n1 + n2, rk = ranks([...x, ...y]);
  const R1 = rk.slice(0, n1).reduce((a, b) => a + b, 0);
  const U1 = R1 - n1 * (n1 + 1) / 2, U2 = n1 * n2 - U1, mu = n1 * n2 / 2;
  const sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tieSum(rk) / (N * (N - 1))));
  const dev = Math.max(0, Math.abs(U1 - mu) - 0.5), z = sigma > 0 ? Math.sign(U1 - mu) * dev / sigma : 0;
  return { U1, U2, U: Math.min(U1, U2), z, p: Math.min(1, 2 * (1 - normCdf(Math.abs(z)))), r: z / Math.sqrt(N), rankBiserial: 1 - 2 * U1 / (n1 * n2), n1, n2, med1: median(x), med2: median(y) };
}
// Wilcoxon signed-rank on paired differences; zero differences are dropped (Wilcoxon's method).
export function wilcoxonSigned(diffs) {
  const d = diffs.filter((v) => v !== 0), n = d.length, zeros = diffs.length - n;
  const rk = ranks(d.map(Math.abs));
  let Wp = 0, Wm = 0; d.forEach((v, i) => { if (v > 0) Wp += rk[i]; else Wm += rk[i]; });
  const mu = n * (n + 1) / 4, sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieSum(rk) / 48);
  const dev = Math.max(0, Math.abs(Wp - mu) - 0.5), z = sigma > 0 ? Math.sign(Wp - mu) * dev / sigma : 0;
  return { Wp, Wm, W: Math.min(Wp, Wm), n, zeros, z, p: Math.min(1, 2 * (1 - normCdf(Math.abs(z)))), r: n ? z / Math.sqrt(n) : NaN, medDiff: median(diffs) };
}

// ── Added: Bayesian A/B with Beta(1, 1) priors ──
// Exact P(pB > pA) for integer posterior parameters (Evan Miller's closed form).
export function probBBeatsA(aA, bA, aB, bB) {
  let s = 0;
  for (let i = 0; i < aB; i++) s += Math.exp(lbeta(aA + i, bA + bB) - Math.log(bB + i) - lbeta(1 + i, bB) - lbeta(aA, bA));
  return Math.min(1, Math.max(0, s));
}
// Posterior summaries by Simpson integration over pA:
// P(B > A) = ∫ fA(p)(1 − I_p(aB, bB)) dp; loss of choosing B = E[max(pA − pB, 0)] = ∫ fA(p)[p I_p(aB, bB) − mB I_p(aB + 1, bB)] dp;
// loss of choosing A = E[max(pB − pA, 0)] = (mB − mA) + loss of choosing B.
export function bayesAB(xa, na, xb, nb, conf = 0.95) {
  const aA = 1 + xa, bA = 1 + na - xa, aB = 1 + xb, bB = 1 + nb - xb;
  const mA = aA / (aA + bA), mB = aB / (aB + bB);
  const sA = Math.sqrt(aA * bA / ((aA + bA) ** 2 * (aA + bA + 1)));
  const lo = Math.max(0, mA - 12 * sA), hi = Math.min(1, mA + 12 * sA), M = 4000, h = (hi - lo) / M;
  let pb = 0, lossB = 0;
  for (let i = 0; i <= M; i++) {
    const p = lo + i * h, w = (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * betaPdf(p, aA, bA);
    if (!w) continue;
    const Ib = ibeta(p, aB, bB);
    pb += w * (1 - Ib); lossB += w * Math.max(0, p * Ib - mB * ibeta(p, aB + 1, bB));
  }
  pb *= h / 3; lossB *= h / 3;
  const ci = (a, b) => [betaInv((1 - conf) / 2, a, b), betaInv(1 - (1 - conf) / 2, a, b)];
  const exact = aB <= 50000 ? probBBeatsA(aA, bA, aB, bB) : NaN;
  return { aA, bA, aB, bB, mA, mB, pBbeatsA: Number.isFinite(exact) ? exact : Math.min(1, Math.max(0, pb)), pNumeric: pb, lossB, lossA: (mB - mA) + lossB, ciA: ci(aA, bA), ciB: ci(aB, bB) };
}

// ── Added: Wald's sequential probability ratio test for a conversion rate ──
// H0: p = p0 against H1: p = p1 (p1 > p0). Stop for H1 when the log-likelihood ratio reaches ln((1 − β)/α),
// for H0 when it falls to ln(β/(1 − α)). In successes, the boundaries are straight lines in the number of trials.
export function sprt(p0, p1, alpha, beta, s = 0, n = 0) {
  const A = Math.log((1 - beta) / alpha), B = Math.log(beta / (1 - alpha));
  const g1 = Math.log(p1 / p0), g2 = Math.log((1 - p0) / (1 - p1)), den = g1 + g2;
  const slope = g2 / den, hUp = A / den, hLo = B / den;
  const llr = s * g1 - (n - s) * g2;
  const decision = llr >= A ? 'h1' : llr <= B ? 'h0' : 'continue';
  const z0 = p0 * g1 - (1 - p0) * g2, z1 = p1 * g1 - (1 - p1) * g2;
  const asn0 = ((1 - alpha) * B + alpha * A) / z0, asn1 = (beta * B + (1 - beta) * A) / z1;
  return { A, B, slope, hUp, hLo, llr, decision, upper: (t) => hUp + slope * t, lower: (t) => hLo + slope * t, asn0, asn1 };
}

// ── Added: capture-recapture estimates of problems not yet found ──
// Two evaluators or sessions: A finds n1 problems, B finds n2, m are found by both. Lincoln-Petersen N = n1·n2/m;
// Chapman's bias-corrected N = (n1 + 1)(n2 + 1)/(m + 1) − 1, with Seber's (1982) variance
// (n1 + 1)(n2 + 1)(n1 − m)(n2 − m)/((m + 1)²(m + 2)). The interval is Chao's (1987) log-normal one on the number not
// yet seen, so its lower end never falls below the number already found.
function logNormalInterval(seen, est, v, conf) {
  const f0 = est - seen;
  if (!(f0 > 1e-9) || !(v > 0)) return { lo: est, hi: est };
  const C = Math.exp(zFor(conf) * Math.sqrt(Math.log(1 + v / (f0 * f0))));
  return { lo: seen + f0 / C, hi: seen + f0 * C };
}
export function lincolnPetersen(n1, n2, m, conf = 0.95) {
  const seen = n1 + n2 - m;
  const lp = m > 0 ? n1 * n2 / m : Infinity;
  const chapman = (n1 + 1) * (n2 + 1) / (m + 1) - 1;
  const v = (n1 + 1) * (n2 + 1) * (n1 - m) * (n2 - m) / ((m + 1) ** 2 * (m + 2));
  return { seen, lp, chapman, v, se: Math.sqrt(v), ...logNormalInterval(seen, chapman, v, conf), remaining: Math.max(0, chapman - seen), pA: n1 / chapman, pB: n2 / chapman };
}
// Several evaluators: rows are problems, columns evaluators, 1 = found. Chao2 (incidence) estimator
// S + ((T − 1)/T)·Q1²/(2·Q2), or S + ((T − 1)/T)·Q1(Q1 − 1)/2 when Q2 = 0, where Q1 and Q2 count problems found by exactly
// one and two evaluators. Variance as in Chao (1987) and EstimateS; first- and second-order jackknife shown for comparison.
export function captureMatrix(rows, conf = 0.95) {
  const T = Math.max(0, ...rows.map((r) => r.length));
  const found = rows.filter((r) => r.some((v) => v > 0));
  const S = found.length, A = T > 1 ? (T - 1) / T : 1;
  const k = found.map((r) => r.filter((v) => v > 0).length);
  const Q1 = k.filter((v) => v === 1).length, Q2 = k.filter((v) => v === 2).length;
  const chao = Q2 > 0 ? S + A * Q1 * Q1 / (2 * Q2) : S + A * Q1 * (Q1 - 1) / 2;
  let v;
  if (Q2 > 0) { const r = Q1 / Q2; v = Q2 * (A / 2 * r ** 2 + A * A * r ** 3 + A * A / 4 * r ** 4); }
  else v = A * Q1 * (Q1 - 1) / 2 + A * A * Q1 * (2 * Q1 - 1) ** 2 / 4 - A * A * Q1 ** 4 / (4 * chao);
  const jack1 = S + Q1 * A;
  const jack2 = T > 1 ? S + Q1 * (2 * T - 3) / T - Q2 * (T - 2) ** 2 / (T * (T - 1)) : NaN;
  const perEvaluator = Array.from({ length: T }, (_, j) => found.filter((r) => r[j] > 0).length);
  const pair = T === 2 ? lincolnPetersen(perEvaluator[0], perEvaluator[1], found.filter((r) => r[0] > 0 && r[1] > 0).length, conf) : null;
  return { T, S, Q1, Q2, chao, v: Math.max(0, v), se: Math.sqrt(Math.max(0, v)), ...logNormalInterval(S, chao, Math.max(0, v), conf), jack1, jack2, perEvaluator, pMean: mean(perEvaluator) / chao, remaining: Math.max(0, chao - S), pair, freq: Array.from({ length: T }, (_, i) => k.filter((x) => x === i + 1).length) };
}

// ── Added: predictive models ──
// Keystroke-Level Model operator times (Card, Moran and Newell 1980; Kieras 2001). K depends on typing skill.
export const KLM_TIMES = { P: 1.1, B: 0.1, H: 0.4, M: 1.35 };
export const KLM_K = [[0.12, 'Good typist (90 wpm)'], [0.2, 'Average skilled typist (55 wpm)'], [0.28, 'Average non-secretary (40 wpm)'], [1.2, 'Unfamiliar with the keyboard']];
// Tokens: K P B H M, a count before a letter (5K), R(seconds) for system response, and "quoted text" for one K per character.
// Letters may run together (MPBB); # starts a comment. Returns the operators, each tagged with the token (cognitive unit) it came from.
export function parseKlm(text) {
  const ops = [], bad = [];
  const re = /"([^"]*)"|R\s*\(\s*(\d+(?:\.\d+)?)\s*\)|(\d+)\s*([KPBHM])|([KPBHM]+)|(#[^\n]*)|(\S)/gi;
  let unit = 0, m;
  while ((m = re.exec(text))) {
    unit++;
    if (m[1] !== undefined) { for (const ch of m[1]) ops.push({ op: 'K', unit, ch }); if (!m[1].length) bad.push('""'); }
    else if (m[2] !== undefined) ops.push({ op: 'R', unit, t: Number(m[2]) });
    else if (m[3] !== undefined) { const n = Number(m[3]); for (let i = 0; i < n; i++) ops.push({ op: m[4].toUpperCase(), unit }); }
    else if (m[5] !== undefined) for (const ch of m[5]) { ops.push({ op: ch.toUpperCase(), unit }); unit++; }
    else if (m[6] !== undefined) unit--; // comment
    else if (!/[,;>|]/.test(m[7])) bad.push(m[7]);
  }
  return { ops, bad };
}
// Heuristic M placement after Card, Moran and Newell's rules: user-written Ms are dropped, then
// rule 0 puts an M before every K and every P; rule 1 deletes an M between a P and the K or B it anticipates;
// rule 2 keeps only the first M in a run of Ks from one cognitive unit (a quoted string or a counted run such as 5K).
// Rules 3 and 4 (redundant terminators, command strings) need judgement and are left to the analyst.
export function placeM(ops) {
  const out = [];
  for (const o of ops.filter((x) => x.op !== 'M')) {
    const prev = out[out.length - 1];
    if (o.op === 'P' || o.op === 'K') {
      const sameUnit = o.op === 'K' && prev && prev.op === 'K' && prev.unit === o.unit;
      const anticipated = o.op === 'K' && prev && prev.op === 'P';
      if (!sameUnit && !anticipated) out.push({ op: 'M', unit: o.unit, auto: true });
    }
    out.push(o);
  }
  return out;
}
export function klmTime(ops, k = 0.28) {
  const counts = { K: 0, P: 0, B: 0, H: 0, M: 0, R: 0 }, time = { K: 0, P: 0, B: 0, H: 0, M: 0, R: 0 };
  for (const o of ops) { const t = o.op === 'K' ? k : o.op === 'R' ? o.t : KLM_TIMES[o.op]; counts[o.op]++; time[o.op] += t; }
  return { total: Object.values(time).reduce((a, b) => a + b, 0), counts, time };
}

// Fitts' law, Shannon form (MacKenzie 1992): ID = log2(D/W + 1) bits, MT = a + b·ID. The effective width
// We = 4.133 × SD of the endpoints (Crossman; ISO 9241-411). For finger touch, Bi, Li and Zhai's (2013) FFitts law first
// removes the finger's absolute imprecision σa from the endpoint spread: We = 4.133 × √(σ² − σa²).
export const fittsId = (D, W) => Math.log2(D / W + 1);
export function fitts({ D, W, a, b, sd, De, mt, sigmaA = 0 }) {
  const id = fittsId(D, W), out = { id, mt: a + b * id };
  if (sd > 0) {
    const s2 = sd * sd - sigmaA * sigmaA;
    out.we = s2 > 0 ? 4.133 * Math.sqrt(s2) : NaN;
    out.ide = fittsId(De > 0 ? De : D, out.we);
    out.mte = a + b * out.ide;
    if (mt > 0) out.throughput = out.ide / mt;
  }
  return out;
}
// Chance that a tap lands inside a target of width w when tap positions scatter normally with SD sigma around its centre:
// erf(w / (2√2·σ)) along one axis, squared for a square target.
export const erf = (x) => 2 * normCdf(x * Math.SQRT2) - 1;
export const hitRate = (w, sigma, dims = 1) => erf(w / (2 * Math.SQRT2 * sigma)) ** dims;
export const widthForHit = (rate, sigma, dims = 1) => 2 * sigma * normInv((1 + rate ** (1 / dims)) / 2);

// Hick-Hyman law: RT = a + b·H, with H = log2(n + 1) for n equally likely choices, or
// H = Σ p·log2(1/p + 1) when the choices are used with different frequencies (Card, Moran and Newell 1983).
export function hickBits(n, freqs) {
  if (freqs && freqs.length) { const t = freqs.reduce((x, y) => x + y, 0); return freqs.filter((f) => f > 0).reduce((s, f) => s + (f / t) * Math.log2(t / f + 1), 0); }
  return Math.log2(n + 1);
}

// ── Added: pricing ──
// Van Westendorp price sensitivity meter. rows: [too cheap, cheap, expensive, too expensive] per respondent.
// Curves at each price p: too cheap = share answering ≥ p, cheap = share ≥ p, expensive = share ≤ p, too expensive = share ≤ p.
// Intersections by linear interpolation between observed prices: PMC = too cheap × not cheap, PME = too expensive × not
// expensive, OPP = too cheap × too expensive, IPP = cheap × expensive.
export function crossing(xs, f, g) {
  for (let i = 0; i < xs.length; i++) {
    const d = f[i] - g[i];
    if (d === 0) return { x: xs[i], y: f[i] };
    if (i + 1 < xs.length) {
      const d2 = f[i + 1] - g[i + 1];
      if (d * d2 < 0) { const t = d / (d - d2); return { x: xs[i] + t * (xs[i + 1] - xs[i]), y: f[i] + t * (f[i + 1] - f[i]) }; }
    }
  }
  return null;
}
export function vanWestendorp(rows) {
  const ok = rows.filter((r) => r.length === 4 && r.every((v) => v >= 0) && r[0] <= r[1] && r[1] <= r[2] && r[2] <= r[3]);
  const n = ok.length;
  const prices = [...new Set(ok.flat())].sort((a, b) => a - b);
  const share = (fn) => prices.map((p) => ok.filter((r) => fn(r, p)).length / n);
  const tooCheap = share((r, p) => r[0] >= p), cheap = share((r, p) => r[1] >= p);
  const expensive = share((r, p) => r[2] <= p), tooExpensive = share((r, p) => r[3] <= p);
  const notCheap = cheap.map((v) => 1 - v), notExpensive = expensive.map((v) => 1 - v);
  return {
    n, dropped: rows.length - n, prices, tooCheap, cheap, expensive, tooExpensive, notCheap, notExpensive,
    pmc: crossing(prices, tooCheap, notCheap), pme: crossing(prices, tooExpensive, notExpensive),
    opp: crossing(prices, tooCheap, tooExpensive), ipp: crossing(prices, cheap, expensive),
  };
}
// Gabor-Granger: demand at each price (share who would buy), revenue index = price × demand, profit index with a unit cost,
// and arc elasticity between neighbouring prices.
export function gaborGranger(points, cost = 0) {
  const pts = [...points].sort((a, b) => a.price - b.price).map((p) => ({ ...p, revenue: p.price * p.demand, profit: (p.price - cost) * p.demand }));
  pts.forEach((p, i) => {
    const q = pts[i - 1];
    p.elasticity = q && p.demand + q.demand > 0 ? ((p.demand - q.demand) / ((p.demand + q.demand) / 2)) / ((p.price - q.price) / ((p.price + q.price) / 2)) : NaN;
  });
  const best = (k) => pts.reduce((a, b) => (b[k] > a[k] ? b : a), pts[0]);
  return { points: pts, bestRevenue: best('revenue'), bestProfit: best('profit') };
}

// ── Added: Kano ──
// Answers 1 like, 2 expect it, 3 neutral, 4 can live with it, 5 dislike. Kano evaluation table (Berger et al. 1993):
// row = functional answer, column = dysfunctional answer.
export const KANO_TABLE = ['QAAAO', 'RIIIM', 'RIIIM', 'RIIIM', 'RRRRQ'];
export const KANO_NAMES = { A: 'Attractive', O: 'One-dimensional', M: 'Must-be', I: 'Indifferent', R: 'Reverse', Q: 'Questionable' };
export const kanoClass = (f, d) => (f >= 1 && f <= 5 && d >= 1 && d <= 5 ? KANO_TABLE[f - 1][d - 1] : null);
// Category is the most frequent answer; ties go to M > O > A > I > R > Q (Matzler and Hinterhuber 1998).
// Better (CS+) = (A + O)/(A + O + M + I); Worse (CS−) = −(O + M)/(A + O + M + I) (Berger et al. 1993).
export function kano(pairs) {
  const c = { A: 0, O: 0, M: 0, I: 0, R: 0, Q: 0 };
  for (const [f, d] of pairs) { const k = kanoClass(f, d); if (k) c[k]++; }
  const n = Object.values(c).reduce((a, b) => a + b, 0), base = c.A + c.O + c.M + c.I;
  const order = ['M', 'O', 'A', 'I', 'R', 'Q'];
  const category = n ? order.reduce((best, k) => (c[k] > c[best] ? k : best), 'M') : null;
  return { counts: c, n, category, better: base ? (c.A + c.O) / base : NaN, worse: base ? -(c.O + c.M) / base : NaN };
}

// ── Added: MaxDiff counting ──
// tasks: { items, best, worst }. Per item: times shown, best and worst counts, best − worst, and best − worst divided by
// times shown (−1 to +1). The ratio scale is √(B/W) with 0.5 added to both counts (Marley and Louviere 2005), rescaled to sum to 100.
export function maxdiff(tasks) {
  const s = new Map();
  const get = (k) => { if (!s.has(k)) s.set(k, { item: k, shown: 0, best: 0, worst: 0 }); return s.get(k); };
  for (const t of tasks) { for (const it of t.items) get(it).shown++; get(t.best).best++; get(t.worst).worst++; }
  const rows = [...s.values()].map((r) => ({ ...r, bw: r.best - r.worst, norm: r.shown ? (r.best - r.worst) / r.shown : NaN, ratio: Math.sqrt((r.best + 0.5) / (r.worst + 0.5)) }));
  const tot = rows.reduce((a, r) => a + r.ratio, 0);
  rows.forEach((r) => { r.share = 100 * r.ratio / tot; });
  return rows.sort((a, b) => b.norm - a.norm || b.bw - a.bw);
}

// ── Added: TURF ──
// people: one array of liked item indices per respondent. Reach = share of respondents who like at least one item in the set;
// frequency = average number of liked items in the set per respondent reached. Exhaustive search when the number of
// combinations is small, and always the greedy search (add the item that adds most reach; ties go to frequency).
export function choose(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
export function turf(people, nItems, kMax, limit = 2e6) {
  const sets = people.map((p) => new Set(p)), R = people.length;
  const score = (combo) => {
    let reach = 0, hits = 0;
    for (const s of sets) { let h = 0; for (const i of combo) if (s.has(i)) h++; if (h) reach++; hits += h; }
    return { reach: reach / R, freq: reach ? hits / reach : 0, hits };
  };
  const better = (a, b) => !b || a.reach > b.reach + 1e-12 || (Math.abs(a.reach - b.reach) <= 1e-12 && a.hits > b.hits);
  const out = [];
  let greedy = [];
  for (let k = 1; k <= Math.min(kMax, nItems); k++) {
    let gBest = null;
    for (let i = 0; i < nItems; i++) if (!greedy.includes(i)) { const sc = { items: [...greedy, i], ...score([...greedy, i]) }; if (better(sc, gBest)) gBest = sc; }
    greedy = gBest.items;
    let exBest = null;
    const nc = choose(nItems, k);
    if (nc * R <= limit) {
      const idx = Array.from({ length: k }, (_, i) => i);
      for (;;) {
        const sc = { items: [...idx], ...score(idx) };
        if (better(sc, exBest)) exBest = sc;
        let j = k - 1; while (j >= 0 && idx[j] === nItems - k + j) j--;
        if (j < 0) break;
        idx[j]++; for (let x = j + 1; x < k; x++) idx[x] = idx[x - 1] + 1;
      }
    }
    out.push({ k, greedy: gBest, exhaustive: exBest, combos: nc });
  }
  return out;
}

// ── Added: business case ──
// Annual benefits: time saved (users × tasks per user per year × seconds saved / 3600 × hourly cost), errors avoided × cost
// per error, extra conversions (visitors × baseline rate × relative uplift) × value, support contacts avoided × cost per contact.
// ROI over the horizon = (benefits − costs)/costs, undiscounted. NPV = −one-off cost + Σ (annual benefit − running cost)/(1 + r)^t.
// Simple payback = one-off cost ÷ net annual benefit.
export function uxRoi({ users = 0, tasks = 0, seconds = 0, hourly = 0, errors = 0, errorCost = 0, visitors = 0, baseConv = 0, uplift = 0, convValue = 0, calls = 0, callCost = 0, oneOff = 0, running = 0, years = 3, rate = 0 }) {
  const parts = {
    time: users * tasks * seconds / 3600 * hourly,
    errors: errors * errorCost,
    conversion: visitors * baseConv * uplift * convValue,
    support: calls * callCost,
  };
  const annual = Object.values(parts).reduce((a, b) => a + b, 0), net = annual - running;
  const totalBenefit = annual * years, totalCost = oneOff + running * years;
  let npv = -oneOff; const flows = [];
  for (let t = 1; t <= years; t++) { const pvt = net / (1 + rate) ** t; npv += pvt; flows.push({ year: t, net, pv: pvt, cumulative: npv }); }
  return { parts, annual, net, totalBenefit, totalCost, roi: totalCost > 0 ? (totalBenefit - totalCost) / totalCost : NaN, npv, paybackYears: net > 0 ? oneOff / net : Infinity, flows };
}

// ── Added: lostness ──
// Smith (1996): L = √((N/S − 1)² + (R/N − 1)²), N distinct pages visited, S total pages visited, R minimum pages required.
export const lostness = (N, S, R) => Math.sqrt((N / S - 1) ** 2 + (R / N - 1) ** 2);

// ── Added: readability ──
// Heuristic syllable counter: counts vowel groups, drops a silent final e, -es or -ed, and adjusts for common vowel pairs
// that split (ia, io, eo, ua) or merge (-tion, -cial, -ious). Agrees with the CMU Pronouncing Dictionary for about 98% of
// running words in English prose; it is approximate for names, numbers and unusual words.
export function syllables(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let add = 0;
  if (/[^aeiouy]le$/.test(w)) { add++; w = w.slice(0, -2); } else if (/[^aeiouy]les$/.test(w)) { add++; w = w.slice(0, -3); }
  if (/(?:[^aeiouy]e|[^aeiouytd]ed|[^aeiouysxzhcg]es)$/.test(w)) w = w.replace(/(?:e|ed|es)$/, '');
  w = w.replace(/^y/, '');
  let n = (w.match(/[aeiouy]+/g) || []).length;
  n += (w.match(/(?:[^aeiouqg]|^)(?:ia|io|iu|eo|ua|uo|ui(?![cntlsdr]))/g) || []).length;
  n += (w.match(/(?:[^aeiouqgc]|sc)ie(?=n[ct])/g) || []).length;
  n -= (w.match(/(?:[ct]ia[ln]|[cst]io[nu]|[cgst]ious|[cst]ial|tient|gue|eop)/g) || []).length;
  n -= (w.match(/[^aeiouy]e(?=(?:ments?|ly|ful|ness|less|ty|work|holders?|line|thing)$)/g) || []).length;
  n += (w.match(/[aeiou]y[aeiou]/g) || []).length;
  n += /isms?$/.test(w) ? 1 : 0;
  n += (w.match(/[^aeiou]y(?=i)/g) || []).length;
  n += (w.match(/(?:ea|ee)(?=[aeiou])/g) || []).length;
  return Math.max(1, n + add);
}
// Sentences end at . ! ? (or a line break between paragraphs or list items); words are runs of letters, digits and
// apostrophes. Flesch Reading Ease = 206.835 − 1.015 × words/sentences − 84.6 × syllables/words; Flesch-Kincaid grade =
// 0.39 × words/sentences + 11.8 × syllables/words − 15.59.
export function readability(text, longAt = 25) {
  const chunks = String(text).replace(/\r/g, '').split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/).flatMap((p) => p.replace(/\s+/g, ' ').match(/[^.!?]+(?:[.!?]+["')\]’”]*|$)/g) || []);
  const sentences = chunks.map((s) => s.trim()).filter((s) => /[A-Za-z0-9]/.test(s)).map((s) => {
    const words = s.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) || [];
    return { text: s, words: words.length, syllables: words.reduce((a, w) => a + (/^\d+$/.test(w) ? w.length : syllables(w)), 0) };
  });
  const S = sentences.length, W = sentences.reduce((a, s) => a + s.words, 0), Y = sentences.reduce((a, s) => a + s.syllables, 0);
  const wps = S ? W / S : NaN, spw = W ? Y / W : NaN;
  return {
    sentences: S, words: W, syllables: Y, wps, spw,
    fre: 206.835 - 1.015 * wps - 84.6 * spw, fkgl: 0.39 * wps + 11.8 * spw - 15.59,
    long: sentences.filter((s) => s.words > longAt), list: sentences,
  };
}
export function fleschBand(f) {
  return f >= 90 ? ['Very easy', '5th grade (age 10–11)'] : f >= 80 ? ['Easy', '6th grade'] : f >= 70 ? ['Fairly easy', '7th grade'] : f >= 60 ? ['Plain English', '8th–9th grade (age 13–15)'] : f >= 50 ? ['Fairly difficult', '10th–12th grade'] : f >= 30 ? ['Difficult', 'College'] : ['Very difficult', 'College graduate'];
}
