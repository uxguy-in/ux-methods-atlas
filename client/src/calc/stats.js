// Statistics used by the calculators. Formulas follow Sauro & Lewis, Quantifying the User Experience (2nd ed.),
// its companion book, and Sauro, Benchmarking the User Experience. Pure functions, no dependencies.

// ── Distributions ──
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x; const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
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
