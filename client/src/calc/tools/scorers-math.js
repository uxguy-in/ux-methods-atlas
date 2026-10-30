// Small numeric helpers shared by the "scorers" tools (questionnaire scorer, agreement indices, item analysis and
// survey weighting). Pure functions, no React. Distributions come from calc/stats.js; the rest is written here.
import { lgamma, tInv, tCdf, normInv, normCdf, fInv, fCdf, ibeta } from '../stats.js';

export { tInv, tCdf, normInv, normCdf, fInv, fCdf, ibeta };

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function variance(xs) {
  const n = xs.length; if (n < 2) return NaN;
  const m = mean(xs); return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1);
}
export const sd = (xs) => Math.sqrt(variance(xs));
export function pearson(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
// Average ranks (ties share the mean of their positions), 1-based.
export function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// t interval for a mean. Returns { n, mean, sd, se, lo, hi, df }.
export function meanCI(xs, conf = 0.95) {
  const n = xs.length, m = mean(xs), s = sd(xs), se = s / Math.sqrt(n);
  const t = n > 1 ? tInv(1 - (1 - conf) / 2, n - 1) : NaN;
  return { n, mean: m, sd: s, se, lo: m - t * se, hi: m + t * se, df: n - 1 };
}
// One-sample t test against mu (two-sided).
export function oneSampleT(xs, mu) {
  const c = meanCI(xs); const t = (c.mean - mu) / c.se;
  return { t, df: c.df, p: 2 * (1 - tCdf(Math.abs(t), c.df)) };
}

// Regularised lower incomplete gamma P(a, x) (series and continued fraction, Numerical Recipes 6.2).
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, s = 1 / a, d = s;
    for (let n = 0; n < 10000; n++) { ap += 1; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-16) break; }
    return s * Math.exp(-x + a * Math.log(x) - lgammaAcc(a));
  }
  return 1 - gammaQcf(a, x);
}
function gammaQcf(a, x) {
  const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgammaAcc(a)) * h;
}
// Lanczos (g = 7, n = 9) log-gamma, accurate to about 1e-15 (the one in stats.js is accurate to about 1e-10).
const LZ = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgammaAcc(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgammaAcc(1 - x);
  x -= 1; let a = LZ[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LZ[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
export const chi2Sf = (x, df) => (x <= 0 ? 1 : x < df + 1 ? 1 - gammaP(df / 2, x / 2) : gammaQcf(df / 2, x / 2));
export const fSf = (x, d1, d2) => (x <= 0 ? 1 : ibeta(d2 / (d2 + d1 * x), d2 / 2, d1 / 2));
export const lgam = lgamma;

// Exact two-sided binomial test (scipy.stats.binomtest method: sum the probabilities no larger than P(X = k)).
export function binomTest(k, n, p0) {
  const lp = (i) => lgammaAcc(n + 1) - lgammaAcc(i + 1) - lgammaAcc(n - i + 1) + i * Math.log(p0) + (n - i) * Math.log(1 - p0);
  const pk = lp(k); let s = 0;
  for (let i = 0; i <= n; i++) { const v = lp(i); if (v <= pk + 1e-7) s += Math.exp(v); }
  const greater = (() => { let g = 0; for (let i = k; i <= n; i++) g += Math.exp(lp(i)); return g; })();
  return { p: Math.min(1, s), pGreater: Math.min(1, greater) };
}
// Wilson score interval for a proportion.
export function wilson(x, n, conf = 0.95) {
  const z = normInv(1 - (1 - conf) / 2), p = x / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, me = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - me), hi: Math.min(1, c + me) };
}

// ── Parsing ──
// A grid of cells from pasted text: rows on lines, cells split by tabs, commas, semicolons or spaces. Lines starting
// with # are comments. A first row with any non-numeric cell is taken as a header.
export const MISSING = new Set(['', '.', 'na', 'n/a', 'nan', '-', '?', 'null', 'missing']);
export function splitLine(line) {
  const t = line.trim();
  if (t.includes('\t')) return t.split('\t').map((s) => s.trim());
  if (t.includes(',') || t.includes(';')) return t.split(/[,;]/).map((s) => s.trim());
  return t.split(/\s+/);
}
export const toNum = (s) => { const v = String(s ?? '').trim(); if (MISSING.has(v.toLowerCase())) return NaN; const x = Number(v); return Number.isFinite(x) ? x : NaN; };
export const isNumCell = (s) => MISSING.has(String(s ?? '').trim().toLowerCase()) || Number.isFinite(Number(String(s).trim()));
export function parseGrid(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const cells = lines.map(splitLine);
  let header = null;
  if (cells.length && cells[0].some((c) => !isNumCell(c))) header = cells.shift();
  return { header, cells };
}
// Numeric matrix with optional leading label column (any non-numeric first cell in data rows). Missing → NaN.
export function parseMatrix(text) {
  const { header, cells } = parseGrid(text);
  const labelled = cells.length > 0 && cells.some((r) => r.length > 1 && !isNumCell(r[0]));
  const rows = cells.map((r) => (labelled ? r.slice(1) : r).map(toNum));
  const labels = cells.map((r, i) => (labelled ? r[0] : String(i + 1)));
  const k = Math.max(0, ...rows.map((r) => r.length));
  const full = rows.map((r) => Array.from({ length: k }, (_, j) => (j < r.length ? r[j] : NaN)));
  const names = header ? (labelled ? header.slice(1) : header).slice(0, k) : [];
  while (names.length < k) names.push(`Item ${names.length + 1}`);
  return { rows: full, labels, names, k };
}
export const toCSV = (head, rows) => [head, ...rows].map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

// Linear algebra for small symmetric systems: Gauss-Jordan inverse with partial pivoting (null if singular).
export function invert(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
// Simple least squares line y = a + b x with the slope's t test.
export function linreg(x, y) {
  const n = x.length, mx = mean(x), my = mean(y);
  let sxx = 0, sxy = 0; for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  const b = sxy / sxx, a = my - b * mx;
  const rss = x.reduce((s, xi, i) => s + (y[i] - a - b * xi) ** 2, 0);
  const se = Math.sqrt(rss / (n - 2) / sxx), t = b / se;
  return { a, b, se, t, df: n - 2, p: 2 * (1 - tCdf(Math.abs(t), n - 2)), r: pearson(x, y) };
}
