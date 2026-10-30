// Shared numerics and parsing for the "sensors" tools (HRV, EDA/GSR peaks, eye-tracking AOIs, cultural consensus,
// code co-occurrence networks, SIR and Bass adoption, journey forecasts, Nash equilibria). Pure functions with no
// React, so the pages, the Web Worker and server/scripts/check-sensors.js all run the same code.
import { rng, normalRng, fmt, pctS, sig, mean, sd, median, sum, toCsv, normInv } from './decisions-core.js';

export { rng, normalRng, fmt, pctS, sig, mean, sd, median, sum, toCsv, normInv };

// Numbers: accepts 1,234 (thousands), decimals with a point, and rejects words.
export const toNum = (v) => {
  const s = String(v ?? '').trim().replace(/,(?=\d{3}\b)/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN;
  return Number(s);
};
export const lines = (text) => String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
// Cells: tabs, commas or semicolons separate cells.
export const cells = (line) => line.split(/\t|,|;/).map((c) => c.trim());
export const numberList = (text) => String(text ?? '').split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);

// Quantile with linear interpolation (numpy's default, type 7) of a sorted array.
export function quantileSorted(s, q) {
  if (!s.length) return NaN;
  const h = (s.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (h - lo) * (s[hi] - s[lo]);
}
export const quantile = (xs, q) => quantileSorted([...xs].sort((a, b) => a - b), q);
export const trapz = (y, x) => { let s = 0; for (let i = 1; i < y.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1]); return s; };

// Symmetric eigen-decomposition by cyclic Jacobi rotations. Returns values (descending) and vectors (columns).
export function eigSym(A) {
  const n = A.length, a = A.map((r) => [...r]), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = a.map((r, i) => [r[i], i]).sort((x, y) => y[0] - x[0]);
  return { values: order.map((o) => o[0]), vectors: order.map(([, i]) => V.map((r) => r[i])) };
}

// Solve A x = b by Gaussian elimination with partial pivoting; null when singular.
export function solveLinear(A, b) {
  const n = A.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function invert(A) {
  const n = A.length, cols = [];
  for (let j = 0; j < n; j++) { const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)); const x = solveLinear(A, e); if (!x) return null; cols.push(x); }
  return A.map((_, i) => cols.map((c) => c[i]));
}

// Gamma and beta draws (Marsaglia and Tsang 2000), for Beta posteriors in the journey simulation.
export function gammaDraw(shape, u, z) {
  if (shape < 1) return gammaDraw(shape + 1, u, z) * u() ** (1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = z(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const w = u();
    if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export const betaDraw = (a, b, u, z) => { const x = gammaDraw(a, u, z), y = gammaDraw(b, u, z); return x / (x + y); };

export const letters = (i) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const fmtS = (sec) => (!Number.isFinite(sec) ? 'n/a' : sec < 90 ? `${fmt(sec, sec < 10 ? 1 : 0)} s` : `${fmt(sec / 60, 1)} min`);
