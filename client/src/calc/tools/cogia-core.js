// Shared maths and parsing for the "cogia" tools (IA graph analysis, IAT D-score, mouse-tracking curvature,
// correspondence analysis, tolerance intervals). Pure functions, no React, so the pages and
// server/scripts/check-cogia.js run exactly the same code.

// ── Normal distribution ──
// The cdf is West (2005), an implementation of Hart's (1968) algorithm 5666, accurate to double precision.
export const SQRT2PI = Math.sqrt(2 * Math.PI);
export const normPdf = (z) => Math.exp(-0.5 * z * z) / SQRT2PI;
export function normCdf(x) {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp(-0.5 * z * z);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165; n = n * z + 33.912866078383; n = n * z + 112.079291497871; n = n * z + 221.213596169931; n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207; d = d * z + 86.7807322029461; d = d * z + 296.564248779674; d = d * z + 637.333633378831; d = d * z + 793.826512519948; d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = z + 0.65; b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}
// Acklam's rational approximation, polished with one Halley step against the double-precision cdf.
export function normInv(p) {
  if (!(p > 0)) return -Infinity; if (!(p < 1)) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const e = normCdf(x) - p, u = e * SQRT2PI * Math.exp(0.5 * x * x);
  return x - u / (1 + 0.5 * x * u);
}

// ── Gamma, beta, chi-square, t and binomial ──
// Lanczos approximation (g = 7, 9 terms), about 15 significant digits for x > 0.
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1; let a = LG[0]; const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
// Regularised lower incomplete gamma P(a, x) (series below a + 1, Lentz continued fraction above).
export function gammaP(a, x) {
  if (!(x > 0)) return 0;
  if (!Number.isFinite(x)) return 1;
  const lpre = -x + a * Math.log(x) - lgamma(a);
  if (x < a + 1) {
    let ap = a, del = 1 / a, s = del;
    for (let n = 0; n < 10000; n++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-16) break; }
    return Math.min(1, s * Math.exp(lpre));
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - Math.exp(lpre) * h);
}
export const chi2Cdf = (x, df) => gammaP(df / 2, x / 2);
export const chi2Pdf = (x, df) => (x <= 0 ? 0 : Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.LN2 - lgamma(df / 2)));
// Chi-square quantile: Wilson-Hilferty start, then safeguarded Newton steps on the cdf.
export function chi2Inv(p, df) {
  if (!(p > 0)) return 0; if (!(p < 1)) return Infinity;
  const z = normInv(p), h = 2 / (9 * df);
  let x = Math.max(1e-8, df * (1 - h + z * Math.sqrt(h)) ** 3);
  let lo = 0, hi = Infinity;
  for (let i = 0; i < 200; i++) {
    const f = chi2Cdf(x, df) - p;
    if (f > 0) hi = Math.min(hi, x); else lo = Math.max(lo, x);
    if (Math.abs(f) < 1e-15) break;
    let nx = x - f / chi2Pdf(x, df);
    if (!(nx > lo && nx < hi) || !Number.isFinite(nx)) nx = Number.isFinite(hi) ? (lo + hi) / 2 : x * 2;
    if (Math.abs(nx - x) < 1e-14 * x) { x = nx; break; }
    x = nx;
  }
  return x;
}
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
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
export function tCdf(t, df) {
  const x = df / (df + t * t), tail = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
export function tInv(p, df) {
  if (!(p > 0)) return -Infinity; if (!(p < 1)) return Infinity;
  let lo = -1e3, hi = 1e3;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, df) < p) lo = m; else hi = m; if (hi - lo < 1e-13 * Math.max(1, Math.abs(m))) break; }
  return (lo + hi) / 2;
}
// Binomial cdf P(X ≤ k) for X ~ Bin(n, p), through the incomplete beta identity.
export function binomCdf(k, n, p) {
  if (k < 0) return 0; if (k >= n) return 1;
  if (p <= 0) return 1; if (p >= 1) return 0;
  return ibeta(1 - p, n - k, k + 1);
}
// Beta quantile by bisection on ibeta (used for Clopper-Pearson limits).
export function betaInv(q, a, b) {
  if (!(q > 0)) return 0; if (!(q < 1)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < q) lo = m; else hi = m; if (hi - lo < 1e-16) break; }
  return (lo + hi) / 2;
}

// Noncentral t cdf P(T ≤ t) for T = (Z + δ)/√(V/ν), V ~ χ²_ν: integrates Φ(t·√(v/ν) − δ) against the χ²_ν density
// with composite Gauss-Legendre over a range that covers the density to well below 1e-15.
// Gauss-Legendre nodes and weights (20 points), computed by Newton's method on the Legendre polynomial.
const GL_N = 20, GL_X = [], GL_W = [];
for (let i = 1; i <= GL_N; i++) {
  let x = Math.cos(Math.PI * (i - 0.25) / (GL_N + 0.5)), dp = 0;
  for (let it = 0; it < 100; it++) {
    let p0 = 1, p1 = x;
    for (let k = 2; k <= GL_N; k++) { const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
    dp = GL_N * (x * p1 - p0) / (x * x - 1);
    const dx = p1 / dp; x -= dx;
    if (Math.abs(dx) < 1e-16) break;
  }
  GL_X.push(x); GL_W.push(2 / ((1 - x * x) * dp * dp));
}
export function integrate(f, a, b, panels = 64) {
  const h = (b - a) / panels; let s = 0;
  for (let i = 0; i < panels; i++) {
    const m = a + (i + 0.5) * h;
    for (let j = 0; j < GL_N; j++) s += GL_W[j] * f(m + 0.5 * h * GL_X[j]);
  }
  return 0.5 * h * s;
}
export function nctCdf(t, df, delta) {
  // s = √V has the chi density s^(ν−1) e^(−s²/2) / (2^(ν/2−1) Γ(ν/2)), centred near √(ν − ½) with SD about 1/√2.
  const centre = Math.sqrt(Math.max(df - 0.5, 0.5));
  const lo = Math.max(0, centre - 10), hi = centre + 10;
  const lc = (df / 2 - 1) * Math.LN2 + lgamma(df / 2);
  return integrate((s) => (s <= 0 ? 0 : Math.exp((df - 1) * Math.log(s) - s * s / 2 - lc) * normCdf((t * s) / Math.sqrt(df) - delta)), lo, hi, 40);
}
// Noncentral t quantile by bracketing and bisection.
export function nctInv(p, df, delta) {
  let lo = delta - 10, hi = delta + 10;
  while (nctCdf(lo, df, delta) > p) lo -= Math.max(10, Math.abs(lo));
  while (nctCdf(hi, df, delta) < p) hi += Math.max(10, Math.abs(hi));
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (nctCdf(m, df, delta) < p) lo = m; else hi = m; if (hi - lo < 1e-12 * Math.max(1, Math.abs(m))) break; }
  return (lo + hi) / 2;
}

// ── Descriptives ──
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function variance(xs) { if (xs.length < 2) return NaN; const m = mean(xs); return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1); }
export const sd = (xs) => Math.sqrt(variance(xs));
export function quantile(sorted, q) { // linear interpolation (numpy default, type 7)
  if (!sorted.length) return NaN; const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export const median = (xs) => quantile([...xs].sort((a, b) => a - b), 0.5);
export function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}
// Mean with a t interval.
export function meanCI(xs, conf = 0.95) {
  const n = xs.length, m = mean(xs), s = sd(xs), se = s / Math.sqrt(n), t = tInv(1 - (1 - conf) / 2, n - 1);
  return { n, mean: m, sd: s, se, lo: m - t * se, hi: m + t * se };
}
// Welch two-sample t test.
export function welch(a, b) {
  const va = variance(a) / a.length, vb = variance(b) / b.length, se = Math.sqrt(va + vb);
  const diff = mean(a) - mean(b), df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const t = diff / se, p = 2 * (1 - tCdf(Math.abs(t), df)), tc = tInv(0.975, df);
  return { diff, se, t, df, p, lo: diff - tc * se, hi: diff + tc * se };
}

// ── Seeded random numbers (mulberry32) and normal draws (Box-Muller), so the example data are repeatable ──
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(r) { let u = r(); while (u <= 1e-300) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

// ── Formatting and parsing ──
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const sig = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toLocaleString('en-GB', { maximumFractionDigits: 10 }) : 'n/a');
export const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
export const pText = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const nonEmptyLines = (text) => String(text ?? '').split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*#/.test(l));
// Splits a delimited line on tab, comma or semicolon (whichever the header uses), trimming quotes.
export function splitRow(line, sep) { return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')); }
export function detectSep(line) { return line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ','; }
export const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
