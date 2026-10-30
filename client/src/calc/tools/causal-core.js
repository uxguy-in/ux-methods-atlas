// Shared maths for the causal and experiment-design tools (difference-in-differences, E-value, factorial designs,
// bandit simulator, brand lift, market sizing). Pure functions with no React, so the pages, the Web Worker and
// server/scripts/check-causal.js all run the same code. Distribution functions come from the shared modules.
import { tInv, ibeta } from '../stats.js';
import { normCdf, normInv, normPdf, rng, fmt, pctS, sig, toCsv, clamp } from './decisions-core.js';
import { inv, parseTable, toNum } from './statsbench-core.js';

export { normCdf, normInv, normPdf, rng, fmt, pctS, sig, toCsv, clamp, inv, parseTable, toNum };

export const sum = (xs) => { let s = 0; for (const x of xs) s += x; return s; };
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function variance(xs) { const n = xs.length; if (n < 2) return NaN; const m = mean(xs); let s = 0; for (const x of xs) s += (x - m) ** 2; return s / (n - 1); }

// Student t: two-sided p-value and the critical value for a two-sided interval (normal when df is huge or infinite).
export function tCdf(t, df) {
  if (!Number.isFinite(df) || df > 1e7) return normCdf(t);
  const x = df / (df + t * t), tail = 0.5 * ibeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
export const tP2 = (t, df) => (Number.isFinite(t) ? 2 * (1 - tCdf(Math.abs(t), df)) : NaN);
export const tCrit = (conf, df) => (!Number.isFinite(df) || df > 1e7 ? normInv(1 - (1 - conf) / 2) : tInv(1 - (1 - conf) / 2, df));
export const tQuant = (p, df) => (!Number.isFinite(df) || df > 1e7 ? normInv(p) : tInv(p, df));
export const zCrit = (conf) => normInv(1 - (1 - conf) / 2);
// Upper tail of F(d1, d2).
export const fSf = (F, d1, d2) => (F <= 0 ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));

// numpy.quantile with the default 'linear' method on a sorted array; q in [0, 1].
export function quantileSorted(s, q) {
  const n = s.length; if (!n) return NaN;
  const h = (n - 1) * q, lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}

// Holm's step-down adjustment (statsmodels multipletests method='holm'): adjusted p-values in the input order.
export function holm(ps) {
  const m = ps.length, idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(m); let run = 0;
  idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (m - k) * p)); out[i] = run; });
  return out;
}

// ── Random numbers ──
// Standard normal (Box-Muller, one value per call), gamma (Marsaglia and Tsang 2000) and beta draws from a uniform
// generator u() such as rng(seed).
export function randNorm(u) { let a = u(); while (a <= 1e-300) a = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); }
export function randGamma(shape, u) {
  if (shape < 1) { const g = randGamma(shape + 1, u); let a = u(); while (a <= 1e-300) a = u(); return g * a ** (1 / shape); }
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = randNorm(u); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const a = u();
    if (a < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(a) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function randBeta(a, b, u) { const x = randGamma(a, u), y = randGamma(b, u); return x / (x + y); }
// Exact binomial draw: Knuth's beta-splitting recursion (TAOCP vol. 2, 3.4.1) until n·p ≤ 100, then inversion.
export function randBinom(n, p, u) {
  if (p > 0.5) return n - randBinom(n, 1 - p, u);
  let count = 0;
  while (n * p > 100) {
    const a = 1 + Math.floor(n / 2), b = n + 1 - a, X = randBeta(a, b, u);
    if (X >= p) { n = a - 1; p /= X; } else { count += a; n = b - 1; p = (p - X) / (1 - X); }
  }
  if (p <= 0) return count; if (p >= 1) return count + n;
  const q = 1 - p, r = p / q; let f = q ** n, k = 0, c = f, a = u();
  while (a > c && k < n) { f *= r * (n - k) / (k + 1); k++; c += f; }
  return count + k;
}

// ── Linear models ──
// OLS with cluster-robust (CR1) standard errors, as statsmodels OLS.fit(cov_type='cluster'): the sandwich
// (X'X)⁻¹ (Σ_g X_g'e_g e_g'X_g) (X'X)⁻¹ times G/(G−1)·(N−1)/(N−K), with t tests on G − 1 degrees of freedom.
// X: rows of predictors (include the intercept column), y: outcomes, g: cluster labels.
export function olsCluster(X, y, g, conf = 0.95) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0)), Xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
  const A = inv(XtX); if (!A) return null;
  const b = A.map((r) => r.reduce((s, v, j) => s + v * Xty[j], 0));
  const e = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * b[j], 0));
  const groups = new Map();
  for (let i = 0; i < n; i++) { const key = String(g[i]); if (!groups.has(key)) groups.set(key, new Array(k).fill(0)); const s = groups.get(key); for (let a = 0; a < k; a++) s[a] += X[i][a] * e[i]; }
  const G = groups.size;
  const M = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const s of groups.values()) for (let a = 0; a < k; a++) for (let c = 0; c < k; c++) M[a][c] += s[a] * s[c];
  const adj = (G / (G - 1)) * ((n - 1) / (n - k));
  const AM = A.map((r) => M[0].map((_, c) => r.reduce((s, v, j) => s + v * M[j][c], 0)));
  const V = AM.map((r) => A[0].map((_, c) => adj * r.reduce((s, v, j) => s + v * A[j][c], 0)));
  const df = G - 1, crit = tCrit(conf, df);
  const se = V.map((r, i) => Math.sqrt(r[i]));
  const rows = b.map((v, i) => ({ b: v, se: se[i], t: v / se[i], p: tP2(v / se[i], df), lo: v - crit * se[i], hi: v + crit * se[i] }));
  const sse = sum(e.map((v) => v * v));
  return { b, V, se, rows, df, G, n, k, resid: e, sse };
}
// Wald test that the coefficients at `idx` are all zero, as an F test on (q, G − 1) degrees of freedom (statsmodels
// wald_test with use_f=True on a cluster-robust fit).
export function waldF(fit, idx) {
  const q = idx.length; if (!q) return null;
  const bb = idx.map((i) => fit.b[i]), Vs = idx.map((i) => idx.map((j) => fit.V[i][j]));
  const Vi = inv(Vs); if (!Vi) return null;
  const W = bb.reduce((s, v, i) => s + v * Vi[i].reduce((t, w, j) => t + w * bb[j], 0), 0);
  const F = W / q;
  return { F, q, df2: fit.df, p: fSf(F, q, fit.df) };
}

// ── Text and numbers ──
export const f2 = (x, d = 2) => fmt(x, d);
// Compact numbers for charts and sentences: 1.2M, 340k, 12.5.
export function short(x, d = 3) {
  if (!Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x), s = x < 0 ? '−' : '';
  if (a >= 1e12) return `${s}${sig(a / 1e12, d)}tn`;
  if (a >= 1e9) return `${s}${sig(a / 1e9, d)}bn`;
  if (a >= 1e6) return `${s}${sig(a / 1e6, d)}M`;
  if (a >= 1e4) return `${s}${sig(a / 1e3, d)}k`;
  return `${s}${sig(a, d)}`;
}
export const pText = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const signed = (x, d = 2) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmt(Math.abs(x), d)}` : 'n/a');
export const pp = (x, d = 1) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${(Math.abs(x) * 100).toFixed(d)} pts` : 'n/a');
