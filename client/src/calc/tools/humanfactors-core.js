// Shared maths and formatting for the human factors tools (fault tree, ergonomics, steering law and MHP, SEEV,
// alarm floods). Pure functions, no React.
// The normal cdf and quantile come from decisions-core.js (accurate to ~1e-15); stats.js's versions are ~1e-7.
import { tCdf, tInv, ibeta } from '../stats.js';
import { normCdf, normInv, sig, fmt, splitCells, nonEmptyLines, toCsv, rng } from './decisions-core.js';

export { normCdf, normInv, tCdf, tInv, ibeta, sig, fmt, splitCells, nonEmptyLines, toCsv, rng };

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function sd(xs) { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)); }
export function median(xs) { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b), h = s.length / 2; return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2; }
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const pctS = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');

// Probabilities: 0.000123 → "1.23e-4"; 0.0456 → "0.0456".
export function fmtP(p) {
  if (!Number.isFinite(p)) return 'n/a';
  if (p === 0) return '0';
  if (p < 0.001) { const [m, e] = p.toExponential(2).split('e'); return `${Number(m)}e${Number(e)}`; }
  return sig(p, 3);
}

// Ordinary least squares y = a + b x with standard errors, t-based confidence intervals and R².
export function ols(xs, ys, conf = 0.95) {
  const n = xs.length;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  const b = sxy / sxx, a = my - b * mx;
  const sse = Math.max(0, syy - b * sxy);
  const df = n - 2;
  const s2 = df > 0 ? sse / df : NaN;
  const seB = Math.sqrt(s2 / sxx), seA = Math.sqrt(s2 * (1 / n + (mx * mx) / sxx));
  const tc = df > 0 ? tInv(1 - (1 - conf) / 2, df) : NaN;
  const r = sxy / Math.sqrt(sxx * syy);
  const tB = b / seB;
  return { n, a, b, seA, seB, aLo: a - tc * seA, aHi: a + tc * seA, bLo: b - tc * seB, bHi: b + tc * seB, r, r2: r * r, df, s: Math.sqrt(s2), p: df > 0 ? 2 * (1 - tCdf(Math.abs(tB), df)) : NaN, mx, sxx, tc };
}

// Pearson correlation with a Fisher-z interval, and Spearman (Pearson on average ranks).
export function pearson(xs, ys, conf = 0.95) {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = r * Math.sqrt(df / Math.max(1e-300, 1 - r * r));
  const p = df > 0 ? 2 * (1 - tCdf(Math.abs(t), df)) : NaN;
  const zc = normInv(1 - (1 - conf) / 2);
  const z = Math.atanh(Math.max(-0.999999999, Math.min(0.999999999, r))), se = n > 3 ? 1 / Math.sqrt(n - 3) : NaN;
  return { r, n, p, lo: Math.tanh(z - zc * se), hi: Math.tanh(z + zc * se) };
}
export function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys)).r;

// Parse a numeric table: header row optional. Returns { head, rows } with rows as arrays of strings.
export function parseTable(text) {
  const lines = nonEmptyLines(text);
  if (!lines.length) return { head: [], rows: [] };
  const cells = lines.map((l) => splitCells(l));
  const first = cells[0];
  const hasHead = first.some((c) => c !== '' && !Number.isFinite(Number(c)));
  return { head: hasHead ? first : first.map((_, i) => `Column ${i + 1}`), rows: hasHead ? cells.slice(1) : cells };
}
