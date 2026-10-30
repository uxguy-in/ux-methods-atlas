// Shared numerics for the "signals" tools (top tasks, site search, control charts, concentration, classifier metrics,
// reaction times, risk and harm, queueing). Pure functions with no React, so the check script
// (server/scripts/check-signals.js) can test them in Node. Distributions come from stats.js and expanalytics-core.js.
import { lgamma, ibeta, tInv } from '../stats.js';
import { normCdf, normInv, normSf, chi2Inv, chi2Sf, gammaP, gammaQ, nelderMead, solve, wilsonCI, sum, avg, variance, tSf2, fSf } from './expanalytics-core.js';

export { lgamma, ibeta, tInv, normCdf, normInv, normSf, chi2Inv, chi2Sf, gammaP, gammaQ, nelderMead, solve, wilsonCI, sum, avg, variance, tSf2, fSf };

export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const pctText = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
export const pText = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const sig = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toLocaleString('en-GB', { maximumFractionDigits: 10 }) : 'n/a');
export const intText = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-GB') : 'n/a');
export const zConf = (conf = 0.95) => normInv(1 - (1 - conf) / 2);

// Number parsing that accepts 1,234 and 12% and rejects words.
export const toNum = (v) => {
  const s = String(v ?? '').trim().replace(/,(?=\d{3}\b)/g, '').replace(/%$/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
};
// Lines of cells: tabs, commas or semicolons separate cells; blank lines and lines starting with # are skipped.
export function parseLines(text, sep = /\t|,|;/) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(sep).map((c) => c.trim()));
}
// Plain list of numbers: any whitespace, comma or semicolon separates them.
export const parseNumberList = (text) => String(text ?? '').split(/[\s,;]+/).map(toNum).filter(Number.isFinite);

// Seeded generator (mulberry32) so examples and bootstraps repeat exactly.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

// Quantile, type 7 (numpy's default linear interpolation), of an ascending array.
export function quantileSorted(s, p) {
  if (!s.length) return NaN;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const median = (xs) => quantileSorted([...xs].sort((a, b) => a - b), 0.5);
export const sdev = (xs) => Math.sqrt(variance(xs));

// log Φ(z), accurate far into the lower tail (Mills-ratio asymptotic series below −37, where Φ underflows).
export function logNormCdf(z) {
  if (z > -37) return Math.log(Math.max(normCdf(z), 1e-320));
  const z2 = z * z;
  return -z2 / 2 - Math.log(-z) - 0.5 * Math.log(2 * Math.PI) + Math.log(1 - 1 / z2 + 3 / (z2 * z2) - 15 / (z2 * z2 * z2));
}

// Exact (Garwood) Poisson interval for a count x: chi-square quantiles with 2x and 2x + 2 degrees of freedom.
export function poissonCI(x, conf = 0.95) {
  const a = (1 - conf) / 2;
  return { lo: x === 0 ? 0 : chi2Inv(a, 2 * x) / 2, hi: chi2Inv(1 - a, 2 * x + 2) / 2 };
}

// Ordinary least squares. X is rows of predictors (include the 1 for the intercept). Returns coefficients, the
// classical covariance, residuals and (X'X)⁻¹ for robust covariances.
export function ols(X, y) {
  const n = X.length, k = X[0].length;
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (__, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, t) => s + r[i] * y[t], 0));
  const I = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (__, j) => (i === j ? 1 : 0)));
  const inv = solve(XtX, I);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const sse = resid.reduce((s, e) => s + e * e, 0), df = n - k, s2 = sse / df;
  const cov = inv.map((row) => row.map((v) => v * s2));
  const ybar = avg(y), sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0);
  return { beta, cov, se: cov.map((r, i) => Math.sqrt(r[i])), resid, fitted, sse, df, s2, inv, n, k, r2: 1 - sse / sst };
}
// Newey-West (Bartlett kernel) covariance for OLS without a small-sample factor, as statsmodels
// OLS.fit(cov_type='HAC', cov_kwds={'maxlags': L}) computes it by default.
export function neweyWest(X, fit, L) {
  const n = X.length, k = X[0].length, e = fit.resid;
  const S = Array.from({ length: k }, () => new Array(k).fill(0));
  const add = (lag, w) => {
    for (let t = lag; t < n; t++) for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const v = w * e[t] * e[t - lag] * X[t][i] * X[t - lag][j];
      S[i][j] += v; if (lag > 0) S[j][i] += v;
    }
  };
  add(0, 1);
  for (let l = 1; l <= L; l++) add(l, 1 - l / (L + 1));
  const A = fit.inv, mul = (P, Q) => P.map((r) => Q[0].map((_, j) => r.reduce((s, v, m) => s + v * Q[m][j], 0)));
  const V = mul(mul(A, S), A);
  return { cov: V, se: V.map((r, i) => Math.sqrt(r[i])) };
}

// Gini coefficient of non-negative values: G = Σ (2i − n − 1) x₍ᵢ₎ / (n Σ x), values sorted ascending.
export function gini(values) {
  const s = [...values].sort((a, b) => a - b), n = s.length, tot = sum(s);
  if (n < 2 || !(tot > 0)) return NaN;
  let acc = 0; for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * s[i];
  return acc / (n * tot);
}

// Two-sided p-value from a z statistic.
export const pFromZ = (z) => 2 * normSf(Math.abs(z));
