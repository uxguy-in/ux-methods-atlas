// Shared maths and parsing for the "decisions" tools (counterbalancing, value of information, decision trees,
// forecast calibration, use FMEA, severity ratings, human error, colour contrast). Pure functions, no React, so the
// pages, the Web Worker and server/scripts/check-decisions.js all use the same code.

// Normal pdf and cdf. The cdf is West (2005), "Better approximations to cumulative normal functions", an
// implementation of Hart's (1968) algorithm 5666, accurate to double precision (the shared stats.js version is only
// good to about 1e-7, which is not enough for value-of-information tails).
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

// Seeded random numbers (mulberry32) and standard normal draws (Box-Muller), so Monte Carlo runs are repeatable.
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
export function normalRng(seed = 1) {
  const u = rng(seed); let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let r1 = u(); while (r1 <= 1e-300) r1 = u();
    const r = Math.sqrt(-2 * Math.log(r1)), th = 2 * Math.PI * u();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
export function sd(xs) { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1)); }
export function median(xs) { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b), h = s.length / 2; return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2; }
export function choose(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }

// Number formatting for plain-language text. fmt(1234.5) → "1,235"; fmt(0.0123, 3) → "0.0123".
export function fmt(x, d = 0) {
  if (!Number.isFinite(x)) return 'n/a';
  return x.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}
// A unit such as "£k" or "$m" is written as a prefix and a suffix: money(75, '£k') → "£75k".
export function money(x, unit = '£', d = 0) {
  if (!Number.isFinite(x)) return 'n/a';
  const s = fmt(Math.abs(x), d), m = /^(.*?)(k|m|bn)$/i.exec(unit);
  return m && m[1] ? `${x < 0 ? '−' : ''}${m[1]}${s}${m[2]}` : `${x < 0 ? '−' : ''}${unit}${s}`;
}
export const sig = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : 'n/a');
export const pctS = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');

// CSV: split one line into cells (commas, tabs or semicolons; double quotes allowed), and quote cells for export.
export function splitCells(line, sep) {
  const s = sep || (line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',');
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === s) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
export const nonEmptyLines = (text) => String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() && !l.trim().startsWith('#'));
export const csvCell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
