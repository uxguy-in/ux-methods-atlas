// Shared maths and parsing for the "surveyx" tools (non-response checks, sensitive questions, scaling from paired
// comparisons, importance-performance, anchoring vignettes, norms and standard scores). Pure functions, no React, so
// the pages and server/scripts/check-surveyx.js use the same code.
import { normCdf, normInv, rng, splitCells, nonEmptyLines, toCsv, csvCell } from './decisions-core.js';
import { tCdf, tInv, lgamma } from '../stats.js';

export { normCdf, normInv, rng, splitCells, nonEmptyLines, toCsv, csvCell, tCdf, tInv };

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function variance(xs) { if (xs.length < 2) return NaN; const m = mean(xs); return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1); }
export const sd = (xs) => Math.sqrt(variance(xs));
// Quantile with linear interpolation between order statistics (numpy's default, Hyndman and Fan type 7).
export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), h = (s.length - 1) * q, lo = Math.floor(h);
  return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo];
}
export const median = (xs) => quantile(xs, 0.5);
// Sample skewness with the adjusted Fisher-Pearson coefficient G1 (scipy.stats.skew(bias=False), Excel SKEW).
export function skewness(xs) {
  const n = xs.length; if (n < 3) return NaN;
  const m = mean(xs), m2 = sum(xs.map((x) => (x - m) ** 2)) / n, m3 = sum(xs.map((x) => (x - m) ** 3)) / n;
  return m2 > 0 ? (Math.sqrt(n * (n - 1)) / (n - 2)) * (m3 / m2 ** 1.5) : 0;
}
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const zCrit = (conf = 0.95) => normInv(1 - (1 - conf) / 2);

// Formatting for tables and plain-language text.
export function fmt(x, d = 2) {
  if (!Number.isFinite(x)) return 'n/a';
  return x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
export const pval = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? '< 0.001' : p.toFixed(3));
export const signed = (x, d = 2) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmt(Math.abs(x), d)}` : 'n/a');

// Regularised lower incomplete gamma P(a, x) (Numerical Recipes series and continued fraction); chi-square upper tail.
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, s = 1 / a, del = s;
    for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-15) break; }
    return s * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export const chi2Sf = (x, df) => (df > 0 ? 1 - gammaP(df / 2, x / 2) : NaN);

// Wilson score interval for a proportion x/n (x may be fractional, as with mid-rank percentiles).
export function wilson(x, n, conf = 0.95) {
  if (!(n > 0)) return { p: NaN, lo: NaN, hi: NaN };
  const z = zCrit(conf), p = x / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, me = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - me), hi: Math.min(1, c + me) };
}
// Newcombe's hybrid score interval for p1 − p2 from two independent samples (Newcombe 1998, method 10).
export function newcombe(x1, n1, x2, n2, conf = 0.95) {
  const a = wilson(x1, n1, conf), b = wilson(x2, n2, conf), d = a.p - b.p;
  return { d, lo: d - Math.sqrt((a.p - a.lo) ** 2 + (b.hi - b.p) ** 2), hi: d + Math.sqrt((a.hi - a.p) ** 2 + (b.p - b.lo) ** 2) };
}
// Welch's two-sample t test for mean(a) − mean(b).
export function welch(a, b, conf = 0.95) {
  const n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b), v1 = variance(a), v2 = variance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2), d = m1 - m2;
  const df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const t = d / se, p = 2 * (1 - tCdf(Math.abs(t), df)), q = tInv(1 - (1 - conf) / 2, df);
  return { n1, n2, m1, m2, d, se, df, t, p, lo: d - q * se, hi: d + q * se };
}
// Pearson correlation, Spearman (Pearson on mid-ranks) and the Fisher-z interval.
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]), r = new Array(xs.length);
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; }
  return r;
}
export function pearson(x, y, conf = 0.95) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  const t = r * Math.sqrt((n - 2) / Math.max(1e-300, 1 - r * r)), p = n > 2 ? 2 * (1 - tCdf(Math.abs(t), n - 2)) : NaN;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), h = zCrit(conf) / Math.sqrt(n - 3);
  return { r, n, p, lo: n > 3 ? Math.tanh(z - h) : NaN, hi: n > 3 ? Math.tanh(z + h) : NaN };
}
export const spearman = (x, y, conf = 0.95) => pearson(ranks(x), ranks(y), conf);

// Simple linear regression y = a + b x with OLS standard errors.
export function linreg(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const sse = sum(x.map((xi, i) => (y[i] - a - b * xi) ** 2)), s2 = sse / (n - 2);
  const seB = Math.sqrt(s2 / sxx), t = b / seB, p = 2 * (1 - tCdf(Math.abs(t), n - 2));
  return { a, b, seB, t, p, df: n - 2, s2, sxx, mx, n };
}

// ── Small dense linear algebra ──
export function inv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
export const matMul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));

// Logistic regression by iteratively reweighted least squares. X includes the intercept column; w are case weights.
export function logistic(X, y, w = null, maxIter = 50, init = null) {
  const n = X.length, p = X[0].length; let beta = init ? [...init] : new Array(p).fill(0), ll = -Infinity, converged = false, cov = null, info = null;
  for (let it = 0; it < maxIter; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
    let llNew = 0;
    for (let i = 0; i < n; i++) {
      const eta = X[i].reduce((s, v, j) => s + v * beta[j], 0), mu = 1 / (1 + Math.exp(-eta)), wi = w ? w[i] : 1;
      llNew += wi * (y[i] ? Math.log(Math.max(mu, 1e-300)) : Math.log(Math.max(1 - mu, 1e-300)));
      const v = wi * mu * (1 - mu);
      for (let j = 0; j < p; j++) { g[j] += wi * (y[i] - mu) * X[i][j]; for (let k = 0; k <= j; k++) H[j][k] += v * X[i][j] * X[i][k]; }
    }
    for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) H[k][j] = H[j][k];
    info = H; cov = inv(H);
    if (!cov) return { beta, converged: false, singular: true };
    const step = cov.map((r) => r.reduce((s, v, k) => s + v * g[k], 0));
    beta = beta.map((b, j) => b + step[j]);
    if (Math.abs(llNew - ll) < 1e-10 && Math.max(...step.map(Math.abs)) < 1e-8) { converged = true; ll = llNew; break; }
    ll = llNew;
  }
  const fitted = X.map((r) => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * beta[j], 0))));
  return { beta, cov, info, fitted, ll, converged, se: cov ? cov.map((r, i) => Math.sqrt(r[i])) : null };
}

// ── Table parsing: a header row, then one row per case (commas, tabs or semicolons). ──
export function parseTable(text) {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) return { head: [], rows: [], error: 'Paste a header row and at least one data row.' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const head = splitCells(lines[0], sep);
  const rows = lines.slice(1).map((l) => { const c = splitCells(l, sep); while (c.length < head.length) c.push(''); return c.slice(0, head.length); });
  return { head, rows, error: null };
}
export const isNum = (s) => s !== '' && s !== null && s !== undefined && Number.isFinite(Number(s));
export const numericColumn = (rows, j) => rows.length > 0 && rows.every((r) => r[j] === '' || isNum(r[j])) && rows.some((r) => isNum(r[j]));
export function parseNumbers(text) { return String(text || '').split(/[\s,;]+/).filter((s) => s !== '').map(Number).filter(Number.isFinite); }

// Seeded resampling helper.
export function bootIndex(n, u) { return Array.from({ length: n }, () => Math.floor(u() * n)); }
