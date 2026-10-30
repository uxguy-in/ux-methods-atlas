// Shared numerics for the statistics workbench tools (regression, moderation and mediation, resampling, distribution
// check, survival, test selector). Pure functions with no React, so they run in the page, in the Web Worker and in
// `npm run check:statsbench`. Distribution functions come from stats.js and expanalytics-core.js.
import { lgamma, tInv } from '../stats.js';
import { normCdf, normInv, normSf, tSf2, fSf, chi2Sf, gammaP } from './expanalytics-core.js';

export { lgamma, normCdf, normInv, normSf, tSf2, fSf, chi2Sf, gammaP };
export const tCrit = (conf, df) => (df > 1e6 ? normInv(1 - (1 - conf) / 2) : tInv(1 - (1 - conf) / 2, df));
export const tP2 = (t, df) => (Number.isFinite(t) ? tSf2(Math.abs(t), df) : NaN);
export const zP2 = (z) => (Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN);

// ── Random numbers ──
// mulberry32: a small seeded 32-bit generator. server/scripts/statsbench-reference.py reimplements it, so the
// bootstrap resamples drawn here can be replayed in numpy and the intervals compared exactly.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (r, n) => Math.floor(r() * n);
export function randNorm(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

// ── Basic statistics ──
export const sum = (xs) => { let s = 0; for (const x of xs) s += x; return s; };
export const mean = (xs) => sum(xs) / xs.length;
export function variance(xs) { const m = mean(xs); let s = 0; for (const x of xs) s += (x - m) ** 2; return s / (xs.length - 1); }
export const sd = (xs) => Math.sqrt(variance(xs));
export const sorted = (xs) => Float64Array.from(xs).sort();
// numpy.percentile / quantile with the default 'linear' method; q in [0, 1]. `s` must be sorted.
export function quantileSorted(s, q) {
  const n = s.length; if (!n) return NaN;
  const h = (n - 1) * q, lo = Math.floor(h), hi = Math.min(n - 1, lo + 1);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const quantile = (xs, q) => quantileSorted(sorted(xs), q);
export const median = (xs) => quantile(xs, 0.5);
export function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
// Sample skewness and excess kurtosis: g1, g2 (scipy bias=True) and the adjusted G1, G2 (scipy bias=False, SPSS, Excel).
export function moments(xs) {
  const n = xs.length, m = mean(xs); let m2 = 0, m3 = 0, m4 = 0;
  for (const x of xs) { const d = x - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
  m2 /= n; m3 /= n; m4 /= n;
  const g1 = m3 / m2 ** 1.5, g2 = m4 / (m2 * m2) - 3;
  const G1 = n > 2 ? g1 * Math.sqrt(n * (n - 1)) / (n - 2) : NaN;
  const G2 = n > 3 ? ((n + 1) * g2 + 6) * (n - 1) / ((n - 2) * (n - 3)) : NaN;
  const ses = n > 2 ? Math.sqrt((6 * n * (n - 1)) / ((n - 2) * (n + 1) * (n + 3))) : NaN;
  const sek = n > 3 ? 2 * ses * Math.sqrt((n * n - 1) / ((n - 3) * (n + 5))) : NaN;
  return { g1, g2, G1, G2, ses, sek };
}
export function digamma(x) {
  let r = 0;
  while (x < 6) { r -= 1 / x; x += 1; }
  const f = 1 / (x * x);
  return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}

// ── Linear algebra (small dense matrices as arrays of rows) ──
export function inv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12 * Math.max(1, Math.abs(A[c][c]))) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c && M[r][c] !== 0) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
export const matVec = (A, v) => A.map((r) => r.reduce((s, a, j) => s + a * v[j], 0));
// X'WX and X'Wz for a design matrix X (rows) with optional weights.
export function crossprod(X, w) {
  const p = X[0].length, A = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < X.length; i++) { const x = X[i], wi = w ? w[i] : 1; for (let a = 0; a < p; a++) { const xa = x[a] * wi; for (let b = a; b < p; b++) A[a][b] += xa * x[b]; } }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) A[a][b] = A[b][a];
  return A;
}
export function crossvec(X, z, w) {
  const p = X[0].length, v = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) { const wi = w ? w[i] : 1; for (let a = 0; a < p; a++) v[a] += X[i][a] * wi * z[i]; }
  return v;
}

// Ordinary least squares: coefficients, covariance, residuals and fit. Returns null if X'X is singular.
export function olsFit(X, y) {
  const n = X.length, p = X[0].length;
  const XtXi = inv(crossprod(X)); if (!XtXi) return null;
  const b = matVec(XtXi, crossvec(X, y));
  const fitted = X.map((r) => r.reduce((s, x, j) => s + x * b[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const sse = resid.reduce((s, e) => s + e * e, 0), df = n - p, s2 = sse / df;
  return { b, cov: XtXi.map((r) => r.map((v) => v * s2)), XtXi, fitted, resid, sse, df, s2, n, p };
}

// ── Pasted tables ──
const MISSING = new Set(['', 'na', 'n/a', 'nan', '.', '-', 'null', 'missing']);
export const isMissing = (v) => MISSING.has(String(v ?? '').trim().toLowerCase());
export function toNum(v) {
  const s = String(v ?? '').trim().replace(/,(?=\d{3}\b)/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
}
// A pasted table with a header row: tab, comma or semicolon separated. Columns are numeric when every non-missing
// value is a number, otherwise categorical with levels in natural sort order (as patsy and R order factor levels).
export function parseTable(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return { names: [], cols: [], n: 0 };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const split = (l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const head = split(lines[0]);
  const body = lines.slice(1).map(split);
  const names = head.map((h, i) => h || `Column ${i + 1}`);
  const cols = names.map((name, j) => {
    const raw = body.map((r) => r[j] ?? '');
    const present = raw.filter((v) => !isMissing(v));
    const numeric = present.length > 0 && present.every((v) => Number.isFinite(toNum(v)));
    const levels = numeric ? null : [...new Set(present)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const values = raw.map((v) => (isMissing(v) ? null : numeric ? toNum(v) : v));
    const distinct = numeric ? new Set(present.map(toNum)).size : levels.length;
    return { name, numeric, levels, values, distinct, missing: raw.length - present.length };
  });
  return { names, cols, n: body.length };
}
// Numbers from free text: any separators.
export const parseNums = (text) => (String(text || '').match(/[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/g) || []).map(Number).filter(Number.isFinite);

// ── Design matrices with dummy coding ──
// spec: [{ name, type: 'num' | 'cat', ref }]. Categorical predictors get one 0/1 column per non-reference level
// (treatment coding, as patsy's C(x) and R's contr.treatment). Rows with a missing value in any used column are dropped.
export function designMatrix(table, outcome, preds, { intercept = true, extra = [] } = {}) {
  const colOf = Object.fromEntries(table.cols.map((c) => [c.name, c]));
  const used = [outcome, ...preds.map((p) => p.name), ...extra].filter(Boolean);
  const keep = [];
  for (let i = 0; i < table.n; i++) if (used.every((u) => colOf[u] && colOf[u].values[i] !== null)) keep.push(i);
  const terms = [], names = intercept ? ['Intercept'] : [];
  for (const p of preds) {
    const c = colOf[p.name]; if (!c) continue;
    if (c.numeric && p.type !== 'cat') { terms.push({ pred: p.name, kind: 'num', col: names.length }); names.push(p.name); continue; }
    const lv = c.numeric ? [...new Set(keep.map((i) => c.values[i]))].sort((a, b) => a - b).map(String) : c.levels.filter((l) => keep.some((i) => c.values[i] === l));
    const ref = lv.includes(String(p.ref)) ? String(p.ref) : lv[0];
    const others = lv.filter((l) => l !== ref);
    terms.push({ pred: p.name, kind: 'cat', ref, levels: others, cols: others.map((_, k) => names.length + k) });
    for (const l of others) names.push(`${p.name}: ${l}`);
  }
  const X = keep.map((i) => {
    const row = intercept ? [1] : [];
    for (const p of preds) {
      const c = colOf[p.name], t = terms.find((tt) => tt.pred === p.name); if (!c || !t) continue;
      if (t.kind === 'num') row.push(c.values[i]);
      else for (const l of t.levels) row.push(String(c.values[i]) === l ? 1 : 0);
    }
    return row;
  });
  return { X, names, terms, rows: keep, y: outcome ? keep.map((i) => colOf[outcome].values[i]) : null, dropped: table.n - keep.length };
}

// ── Formatting ──
export const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const pText = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const sig3 = (x) => (Number.isFinite(x) ? (Math.abs(x) >= 1000 ? x.toFixed(0) : Number(x.toPrecision(3)).toString()) : 'n/a');
export const confWord = (conf) => `${Math.round(conf * 100)}%`;
