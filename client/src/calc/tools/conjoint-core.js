// Conjoint studio, part 1: random numbers, small dense linear algebra, attribute coding, study and result codes,
// experimental designs (orthogonal arrays, D-optimal coordinate exchange, CBC task generators) and their efficiency.
// Pure functions with no React, so the page, the Web Worker and `npm run check:conjoint` all run the same code.
import { encodeCode, decodeCode } from './codec.js';

// ── Seeded random numbers (mulberry32), normal (Box-Muller), gamma (Marsaglia-Tsang) and Gumbel draws ──
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  u.normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x; do { x = u(); } while (x <= 1e-300);
    const r = Math.sqrt(-2 * Math.log(x)), th = 2 * Math.PI * u();
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  u.gamma = (shape) => {
    if (shape < 1) return u.gamma(shape + 1) * Math.pow(u() || 1e-300, 1 / shape);
    const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v; do { x = u.normal(); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const w = u();
      if (w < 1 - 0.0331 * x ** 4 || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  u.gumbel = () => -Math.log(-Math.log(u() || 1e-300) || 1e-300);
  u.int = (n) => Math.floor(u() * n);
  return u;
}
export function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = r.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function newId(r = Math.random) { const A = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 8; i++) s += A[Math.floor(r() * A.length)]; return s; }

// ── Dense linear algebra on flat row-major Float64Arrays (K × K) ──
// Cholesky A = L Lᵀ (lower); returns null if A is not positive definite.
export function chol(A, K) {
  const L = new Float64Array(K * K);
  for (let i = 0; i < K; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * K + j];
      for (let k = 0; k < j; k++) s -= L[i * K + k] * L[j * K + k];
      if (i === j) { if (!(s > 0)) return null; L[i * K + i] = Math.sqrt(s); } else L[i * K + j] = s / L[j * K + j];
    }
  }
  return L;
}
export function cholSolve(L, K, b) {
  const y = new Float64Array(K);
  for (let i = 0; i < K; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * K + k] * y[k]; y[i] = s / L[i * K + i]; }
  for (let i = K - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < K; k++) s -= L[k * K + i] * y[k]; y[i] = s / L[i * K + i]; }
  return y;
}
export function cholInv(L, K) {
  const inv = new Float64Array(K * K), e = new Float64Array(K);
  for (let j = 0; j < K; j++) { e.fill(0); e[j] = 1; const c = cholSolve(L, K, e); for (let i = 0; i < K; i++) inv[i * K + j] = c[i]; }
  return inv;
}
export const logdetChol = (L, K) => { let s = 0; for (let i = 0; i < K; i++) s += 2 * Math.log(L[i * K + i]); return s; };
export function invSPD(A, K, ridge = 0) {
  let L = chol(A, K);
  if (!L && ridge > 0) { const B = Float64Array.from(A); for (let i = 0; i < K; i++) B[i * K + i] += ridge; L = chol(B, K); }
  return L ? cholInv(L, K) : null;
}
// Lower-triangular solve Lᵀ x = z (used to turn N(0, I) draws into N(0, (L Lᵀ)⁻¹) draws).
export function solveLT(L, K, z) {
  const x = new Float64Array(K);
  for (let i = K - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < K; k++) s -= L[k * K + i] * x[k]; x[i] = s / L[i * K + i]; }
  return x;
}

// ── Attributes ──
// Text format, one attribute per line: "Price: £4, £7, £10, £13". A number is read from each level label so a price
// attribute can be coded as a linear term (needed for willingness to pay in money).
export function parseAttributes(text) {
  const attrs = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim(); if (!t) return;
    const m = t.match(/^([^:]+):(.+)$/);
    if (!m) { bad.push(i + 1); return; }
    const levels = m[2].split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    if (levels.length < 2 || new Set(levels.map((l) => l.toLowerCase())).size !== levels.length) { bad.push(i + 1); return; }
    attrs.push({ name: m[1].trim(), levels });
  });
  return { attrs, bad };
}
export const attributesToText = (attrs) => attrs.map((a) => `${a.name}: ${a.levels.join(', ')}`).join('\n');
export function numberIn(label) {
  const m = String(label).replace(/,(?=\d{3}\b)/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}
export const looksLikePrice = (a) => /price|cost|fee|£|\$|€|per month|\/mo/i.test(`${a.name} ${a.levels.join(' ')}`) && a.levels.every((l) => Number.isFinite(numberIn(l)));

// Prohibitions: "Storage = Unlimited & Price = £4" per line → [attr, level, attr, level].
export function parseProhibitions(text, attrs) {
  const out = [], bad = [];
  const find = (s) => {
    const m = s.split('='); if (m.length !== 2) return null;
    const a = attrs.findIndex((x) => x.name.toLowerCase() === m[0].trim().toLowerCase()); if (a < 0) return null;
    const l = attrs[a].levels.findIndex((x) => x.toLowerCase() === m[1].trim().toLowerCase()); return l < 0 ? null : [a, l];
  };
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const parts = line.split(/&|\band\b|\+/i).map((s) => s.trim());
    const p = parts.length === 2 ? parts.map(find) : null;
    if (!p || !p[0] || !p[1] || p[0][0] === p[1][0]) bad.push(i + 1); else out.push([...p[0], ...p[1]]);
  });
  return { list: out, bad };
}
export const prohibited = (prof, list) => list.some(([a, l, b, m]) => prof[a] === l && prof[b] === m);

// ── Study and result codes (the same LZW base64url codec as the tree test) ──
// Profiles are stored as one base-36 character per attribute, so a design of many versions stays short in the link.
export const profToStr = (p) => p.map((v) => v.toString(36)).join('');
export const strToProfs = (s, K) => { const out = []; for (let i = 0; i + K <= s.length; i += K) out.push([...s.slice(i, i + K)].map((c) => parseInt(c, 36))); return out; };

export function makeStudy({ id, name, kind, attrs, price = -1, prohib = [], design, resp = 'rate', scale = [0, 10], none = false }) {
  const s = { v: 1, t: 'cj', id: id || newId(), n: name || 'Conjoint study', k: kind, a: attrs.map((a) => [a.name, a.levels]), p: price, x: prohib };
  if (kind === 'cbc') {
    s.J = design.J; s.T = design.T; s.no = none ? 1 : 0;
    s.d = design.versions.map((v) => v.map((task) => task.map(profToStr).join('')).join(''));
  } else {
    s.r = resp; s.sc = scale;
    s.c = design.cards.map(profToStr).join(''); s.h = design.holdouts.map(profToStr).join('');
  }
  // A fingerprint of the design (FNV-1a over attributes and profiles): result codes carry it, so codes collected with
  // an earlier version of the design are recognised and left out instead of being misread.
  s.dh = fnv1a(JSON.stringify([s.a, s.d || null, s.c || null, s.h || null, s.no || 0])).toString(36);
  return s;
}
export function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export function studyAttrs(s) { return s.a.map(([name, levels]) => ({ name, levels })); }
export function studyDesign(s) {
  const K = s.a.length;
  if (s.k === 'cbc') {
    return { J: s.J, T: s.T, versions: s.d.map((str) => { const p = strToProfs(str, K), v = []; for (let t = 0; t < s.T; t++) v.push(p.slice(t * s.J, (t + 1) * s.J)); return v; }) };
  }
  return { cards: strToProfs(s.c, K), holdouts: strToProfs(s.h || '', K) };
}
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'cj' || !Array.isArray(s.a)) throw new Error('Not a conjoint study');
  return s;
}
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'cjr' || !Array.isArray(r.y)) throw new Error('Not a conjoint result');
  return r;
}
export function parseResultCodes(text) {
  const results = [], bad = [];
  String(text || '').split(/[\s,]+/).filter(Boolean).forEach((c, i) => { try { results.push(decodeResult(c)); } catch { bad.push(i + 1); } });
  return { results, bad };
}
const KEY = (id) => `uxatlas:conjoint:sessions:${id}`;
export function loadSessions(id) { try { const v = JSON.parse(localStorage.getItem(KEY(id)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveSession(id, code) { try { const all = loadSessions(id); if (!all.includes(code)) all.push(code); localStorage.setItem(KEY(id), JSON.stringify(all)); return true; } catch { return false; } }
export function clearSessions(id) { try { localStorage.removeItem(KEY(id)); return true; } catch { return false; } }

// ── Coding ──
// Effects coding: an attribute with L levels gets L − 1 columns; level j < L − 1 is 1 in column j, the last level is
// −1 in every column, so part-worths sum to zero within the attribute (last = −Σ others). A price attribute marked
// numeric is one centred linear column (price − mean of its levels), so β_price is utility per unit of money.
// With a "none" option one more column is an alternative-specific constant that is 1 for "none" only.
export function makeCoder(attrs, { price = -1, priceValues = null, none = false } = {}) {
  const cols = []; const blocks = [];
  attrs.forEach((a, q) => {
    if (q === price) {
      const v = (priceValues || a.levels.map(numberIn)); const mean = v.reduce((s, x) => s + x, 0) / v.length;
      blocks.push({ q, linear: true, start: cols.length, size: 1, values: v, mean });
      cols.push(`${a.name} (per unit)`);
    } else {
      blocks.push({ q, linear: false, start: cols.length, size: a.levels.length - 1 });
      a.levels.slice(0, -1).forEach((l) => cols.push(`${a.name}: ${l}`));
    }
  });
  const noneCol = none ? cols.length : -1;
  if (none) cols.push('None');
  const K = cols.length;
  const encodeInto = (prof, out, off = 0) => {
    for (const b of blocks) {
      const v = prof[b.q];
      if (b.linear) out[off + b.start] = (Number.isFinite(prof.priceValue) ? prof.priceValue : b.values[v]) - b.mean;
      else if (v === b.size) for (let j = 0; j < b.size; j++) out[off + b.start + j] = -1;
      else out[off + b.start + v] = 1;
    }
  };
  const encode = (prof) => { const x = new Float64Array(K); if (prof) encodeInto(prof, x); else if (none) x[noneCol] = 1; return x; };
  // Part-worth of each level as a linear combination of β: rows of C (one per attribute level).
  const pwRows = attrs.map((a, q) => {
    const b = blocks[q];
    return a.levels.map((_, l) => {
      const c = new Float64Array(K);
      if (b.linear) c[b.start] = b.values[l] - b.mean;
      else if (l === b.size) for (let j = 0; j < b.size; j++) c[b.start + j] = -1;
      else c[b.start + l] = 1;
      return c;
    });
  });
  const partWorths = (beta) => pwRows.map((rows) => rows.map((c) => dot(c, beta)));
  return { K, cols, blocks, none, noneCol, price, encode, encodeInto, pwRows, partWorths, attrs };
}
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// Orthonormal contrasts (normalised Helmert) for L levels: L × (L − 1), columns orthonormal and orthogonal to 1.
export function orthoContrasts(L) {
  const C = Array.from({ length: L }, () => new Float64Array(L - 1));
  for (let j = 1; j < L; j++) {
    const norm = Math.sqrt(j * (j + 1));
    for (let i = 0; i < j; i++) C[i][j - 1] = 1 / norm;
    C[j][j - 1] = -j / norm;
  }
  return C;
}

// ── Orthogonal arrays ──
// Rao-Hamming construction over GF(s), s = 2, 3, 4, 5, 7: s^m runs, (s^m − 1)/(s − 1) columns of s levels, strength 2.
// Rows are every vector u in GF(s)^m; columns every non-zero vector c whose first non-zero entry is 1; entry u·c.
function gf(s) {
  if (s === 4) { // GF(4) = {0, 1, x, x+1} mod x² + x + 1, as 2-bit polynomials: add is XOR.
    const mul = (a, b) => { let r = 0; for (let i = 0; i < 2; i++) if ((b >> i) & 1) r ^= a << i; if (r & 4) r ^= 0b111; return r; };
    return { add: (a, b) => a ^ b, mul };
  }
  return { add: (a, b) => (a + b) % s, mul: (a, b) => (a * b) % s };
}
export function raoHamming(s, m) {
  const F = gf(s); const N = s ** m;
  const vec = (n) => { const v = []; for (let i = 0; i < m; i++) { v.unshift(n % s); n = Math.floor(n / s); } return v; };
  const cols = [];
  for (let n = 1; n < N; n++) { const c = vec(n); if (c.find((x) => x !== 0) === 1) cols.push(c); }
  const rows = [];
  for (let n = 0; n < N; n++) { const u = vec(n); rows.push(cols.map((c) => c.reduce((acc, ci, i) => F.add(acc, F.mul(ci, u[i])), 0))); }
  return { name: `L${N} (${s}^${cols.length})`, levels: cols.map(() => s), rows };
}
// Taguchi L18 (2^1 × 3^7) and the Plackett-Burman 12-run array (2^11), from the standard tables.
const L18 = ['11111111', '11222222', '11333333', '12112233', '12223311', '12331122', '13121323', '13232131', '13313212', '21133221', '21211332', '21322113', '22123132', '22231213', '22312321', '23132312', '23213123', '23321231'];
const PB12 = '++-+++---+-';
export function oaLibrary(maxRuns = 81) {
  const lib = [];
  for (const s of [2, 3, 4, 5, 7]) for (let m = 2; s ** m <= maxRuns; m++) lib.push(raoHamming(s, m));
  lib.push({ name: 'L18 (2^1 3^7)', levels: [2, 3, 3, 3, 3, 3, 3, 3], rows: L18.map((r) => [...r].map((c) => Number(c) - 1)) });
  const pb = []; for (let i = 0; i < 11; i++) pb.push([...PB12].map((_, j) => (PB12[(j - i + 11) % 11] === '+' ? 0 : 1)));
  pb.push(Array(11).fill(1));
  lib.push({ name: 'L12 (2^11, Plackett-Burman)', levels: Array(11).fill(2), rows: pb });
  return lib.sort((a, b) => a.rows.length - b.rows.length);
}
// Strength-2 check with proportional frequencies: every pair of columns has n(a, b) · N = n(a) · n(b).
export function isOrthogonal(rows) {
  const k = rows[0].length, N = rows.length;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    const ci = new Map(), cj = new Map(), cij = new Map();
    for (const r of rows) { ci.set(r[i], (ci.get(r[i]) || 0) + 1); cj.set(r[j], (cj.get(r[j]) || 0) + 1); const key = `${r[i]},${r[j]}`; cij.set(key, (cij.get(key) || 0) + 1); }
    for (const [a, na] of ci) for (const [b, nb] of cj) if ((cij.get(`${a},${b}`) || 0) * N !== na * nb) return false;
  }
  return true;
}
// Fit attributes into an array: each attribute takes the unused column with the fewest levels that is ≥ its own;
// a column with more levels is collapsed (v mod L), which keeps proportional frequencies (Addelman 1962).
export function fitOA(oa, L) {
  const order = L.map((l, q) => [l, q]).sort((a, b) => b[0] - a[0]);
  const used = new Set(); const colOf = [];
  for (const [l, q] of order) {
    let best = -1;
    oa.levels.forEach((s, c) => { if (!used.has(c) && s >= l && (best < 0 || s < oa.levels[best])) best = c; });
    if (best < 0) return null;
    used.add(best); colOf[q] = best;
  }
  return oa.rows.map((r) => L.map((l, q) => r[colOf[q]] % l));
}

// ── Design efficiency ──
// Linear (ratings) designs, Kuhfeld (2010): with orthonormal coding scaled so a balanced column has Σx² = N and an
// intercept, D-efficiency = 100 / (N · |(XᵀX)⁻¹|^(1/p)). A balanced orthogonal array scores 100.
export function orthoRow(prof, L) {
  const x = [1];
  prof.forEach((v, q) => { const C = orthoContrasts(L[q]); for (let j = 0; j < L[q] - 1; j++) x.push(C[v][j] * Math.sqrt(L[q])); });
  return x;
}
function xtx(rows, L) {
  const X = rows.map((r) => orthoRow(r, L)); const p = X[0].length; const M = new Float64Array(p * p);
  for (const x of X) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) M[i * p + j] += x[i] * x[j];
  return { M, p };
}
export function linearEfficiency(rows, L) {
  const { M, p } = xtx(rows, L); const N = rows.length;
  const Lc = chol(M, p);
  if (!Lc) return { dEff: 0, p, N, singular: true };
  const logdetInv = -logdetChol(Lc, p);
  return { dEff: 100 / (N * Math.exp(logdetInv / p)), p, N, singular: false, logdet: -logdetInv };
}
export function levelBalance(rows, L) { return L.map((l, q) => { const c = Array(l).fill(0); rows.forEach((r) => c[r[q]]++); return c; }); }

// Choice designs, Street and Burgess (2007): with β = 0 and orthonormal main-effects contrasts B_M over the full
// factorial, C_M = (1/N) Σ_tasks (1/m) Σ_alts (b_j − b̄)(b_j − b̄)ᵀ, where b codes level v of attribute q as
// c_q[v] · √(ℓ_q / Πℓ). The largest possible |C_M| for tasks of m alternatives is
// Π_q (2 S_q ℓ_q / (m² (ℓ_q − 1) Πℓ))^(ℓ_q − 1), S_q the most distinct level pairs a task can hold; D-efficiency is
// (|C_M| / |C_M,opt|)^(1/p) × 100.
export function streetBurgessSq(l, m) {
  if (l === 2) return m % 2 ? (m * m - 1) / 4 : (m * m) / 4;
  if (l >= m) return (m * (m - 1)) / 2;
  const x = Math.floor(m / l), y = m - l * x;
  return (m * m - (l * x * x + 2 * x * y + y)) / 2;
}
export function choiceEfficiency(tasks, L) {
  const m = tasks[0].length, Lprod = L.reduce((a, b) => a * b, 1), p = L.reduce((s, l) => s + l - 1, 0);
  const C = L.map(orthoContrasts);
  const code = (prof) => { const b = []; prof.forEach((v, q) => { const f = Math.sqrt(L[q] / Lprod); for (let j = 0; j < L[q] - 1; j++) b.push(C[q][v][j] * f); }); return b; };
  const M = new Float64Array(p * p);
  for (const task of tasks) {
    const B = task.map(code); const mean = Array(p).fill(0);
    B.forEach((b) => b.forEach((v, i) => { mean[i] += v / task.length; }));
    for (const b of B) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) M[i * p + j] += (b[i] - mean[i]) * (b[j] - mean[j]) / (task.length * tasks.length);
  }
  const Lc = chol(M, p);
  const logdetOpt = L.reduce((s, l) => s + (l - 1) * Math.log((2 * streetBurgessSq(l, m) * l) / (m * m * (l - 1) * Lprod)), 0);
  if (!Lc) return { dEff: 0, p, singular: true, logdetOpt };
  const logdet = logdetChol(Lc, p);
  return { dEff: 100 * Math.exp((logdet - logdetOpt) / p), p, logdet, logdetOpt, singular: false };
}
// Information per respondent at β = 0 in the model's own coding (effects, linear price, "none" constant), averaged over
// versions: I = (1/V) Σ_v Σ_t (1/J) Σ_j (x_j − x̄)(x_j − x̄)ᵀ. Expected standard errors at n respondents are
// √diag((n I)⁻¹), the precision the design gives if people chose at random (the usual planning assumption).
export function expectedSE(versions, coder, n) {
  const K = coder.K; const I = new Float64Array(K * K);
  for (const v of versions) for (const task of v) {
    const X = task.map((p) => coder.encode(p)); if (coder.none) X.push(coder.encode(null));
    const mean = new Float64Array(K); X.forEach((x) => x.forEach((val, i) => { mean[i] += val / X.length; }));
    for (const x of X) for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) I[i * K + j] += ((x[i] - mean[i]) * (x[j] - mean[j])) / (X.length * versions.length);
  }
  const inv = invSPD(I.map((v) => v * n), K);
  return { se: inv ? Array.from({ length: K }, (_, i) => Math.sqrt(inv[i * K + i])) : null, info: I };
}
// D-error per respondent at β = 0 in the model's coding: |I⁻¹|^(1/K) (lower is better).
export function dError(info, K) { const Lc = chol(info, K); return Lc ? Math.exp(-logdetChol(Lc, K) / K) : Infinity; }

// ── Traditional (card) designs ──
export function fullFactorial(L, prohib = []) {
  const out = []; const total = L.reduce((a, b) => a * b, 1);
  for (let n = 0; n < total; n++) { const p = []; let x = n; for (let q = L.length - 1; q >= 0; q--) { p.unshift(x % L[q]); x = Math.floor(x / L[q]); } if (!prohibited(p, prohib)) out.push(p); }
  return out;
}
const randomProfile = (L, prohib, r) => { for (let i = 0; i < 1000; i++) { const p = L.map((l) => r.int(l)); if (!prohibited(p, prohib)) return p; } return null; };
// D-optimal search by coordinate exchange (Meyer and Nachtsheim 1995): start from random allowed profiles, then for
// each card and attribute try every level, keeping a change when it raises |XᵀX|; repeat until no change; best of
// several random starts. Prohibited profiles are never used.
export function dOptimal(L, N, { prohib = [], seed = 1, starts = 6 } = {}) {
  const r = rng(seed); let best = null;
  const score = (rows) => { const e = linearEfficiency(rows, L); return e.singular ? -Infinity : e.logdet; };
  for (let s = 0; s < starts; s++) {
    const rows = []; for (let i = 0; i < N; i++) { const p = randomProfile(L, prohib, r); if (!p) return null; rows.push(p); }
    let cur = score(rows);
    for (let pass = 0; pass < 20; pass++) {
      let changed = false;
      for (let i = 0; i < N; i++) for (let q = 0; q < L.length; q++) {
        const keep = rows[i][q]; let bestV = keep, bestS = cur;
        for (let v = 0; v < L[q]; v++) {
          if (v === keep) continue; rows[i][q] = v;
          if (prohibited(rows[i], prohib)) continue;
          const sc = score(rows); if (sc > bestS + 1e-10) { bestS = sc; bestV = v; }
        }
        rows[i][q] = bestV; if (bestV !== keep) { cur = bestS; changed = true; }
      }
      if (!changed) break;
    }
    if (!best || cur > best.ld) best = { rows: rows.map((x) => [...x]), ld: cur };
  }
  return best.rows;
}
// Cards: the full factorial when it is small enough, else the smallest orthogonal array that fits with at least
// `minCards` runs and no prohibited profile, else a D-optimal design of `minCards` cards. Rows are shuffled.
export function traditionalDesign(L, { minCards, maxCards = 40, prohib = [], holdouts = 2, seed = 1 } = {}) {
  const r = rng(seed); const p = 1 + L.reduce((s, l) => s + l - 1, 0);
  const need = Math.max(p + 1, minCards || Math.ceil(1.5 * p));
  const ff = fullFactorial(L, prohib); const total = L.reduce((a, b) => a * b, 1);
  let rows = null, method = '';
  if (!prohib.length && total >= need && total <= Math.min(maxCards, 2 * need)) { rows = ff; method = `Full factorial (${total} profiles)`; }
  if (!rows && !prohib.length) {
    const fits = oaLibrary().map((oa) => ({ oa, rows: oa.rows.length >= need && oa.rows.length <= maxCards ? fitOA(oa, L) : null })).filter((x) => x.rows);
    if (fits.length) {
      // The smallest array, unless a fully efficient (balanced) one needs at most 1.5 times as many cards.
      const nMin = Math.min(...fits.map((f) => f.rows.length));
      const scored = fits.filter((f) => f.rows.length <= 1.5 * nMin).map((f) => ({ ...f, e: linearEfficiency(f.rows, L).dEff }));
      const full = scored.filter((f) => f.e > 99.999).sort((a, b) => a.rows.length - b.rows.length)[0];
      const best = full || scored.filter((f) => f.rows.length === nMin).sort((a, b) => b.e - a.e)[0];
      rows = best.rows; method = `Orthogonal array ${best.oa.name}`;
    }
  }
  if (!rows) { rows = dOptimal(L, Math.min(need, ff.length), { prohib, seed }); method = `D-optimal (coordinate exchange, ${Math.min(need, ff.length)} cards)`; }
  if (!rows) return null;
  rows = shuffle(rows.map((x) => [...x]), r);
  const used = new Set(rows.map((x) => x.join(','))); const hold = [];
  const pool = shuffle(ff.filter((x) => !used.has(x.join(','))), r);
  for (const h of pool) { if (hold.length >= holdouts) break; hold.push(h); }
  return { cards: rows, holdouts: hold, method, eff: linearEfficiency(rows, L), balance: levelBalance(rows, L), orthogonal: isOrthogonal(rows) };
}

// ── CBC task generators (after Sawtooth Software's CBC methods) ──
// random: every alternative is a random allowed profile (no identical alternatives in a task).
// complete enumeration: each alternative is the allowed profile with (1) the least level overlap within the task,
// then (2) the best level balance and (3) the fewest repeated level pairs (orthogonality) so far in the version.
// balanced overlap: the same costs, but in each task a random half of the attributes may repeat levels (their overlap
// take random levels), which gives roughly half the overlap of random designs.
export function cbcDesign(L, { T = 12, J = 3, V = 20, method = 'enumeration', prohib = [], seed = 1 } = {}) {
  const r = rng(seed); const K = L.length;
  const total = L.reduce((a, b) => a * b, 1);
  const allProfiles = total <= 4000 ? fullFactorial(L, prohib) : null;
  if (allProfiles && allProfiles.length < J) return null;
  const w = { o: 1e6, b: 20, p: 1, n: 0.5 };
  const versions = [];
  for (let v = 0; v < V; v++) {
    const cnt = L.map((l) => Array(l).fill(0));
    const pair = new Map(); const pk = (q, a, s, b) => `${q}.${a}.${s}.${b}`;
    const tasks = [];
    for (let t = 0; t < T; t++) {
      const task = [];
      const free = L.map(() => method === 'balanced' && r() < 0.5);
      for (let j = 0; j < J; j++) {
        let pick = null;
        if (method === 'random') {
          for (let i = 0; i < 500 && !pick; i++) { const c = randomProfile(L, prohib, r); if (c && !task.some((x) => x.join() === c.join())) pick = c; }
        } else {
          const cands = allProfiles || Array.from({ length: 1500 }, () => randomProfile(L, prohib, r)).filter(Boolean);
          let bestC = Infinity;
          for (const c of cands) {
            if (task.some((x) => x.every((val, q) => val === c[q]))) continue;
            let o = 0, b = 0, pp = 0;
            for (let q = 0; q < K; q++) {
              let same = 0; for (const x of task) if (x[q] === c[q]) same++;
              if (free[q]) continue;
              o += same * same; b += cnt[q][c[q]] - Math.min(...cnt[q]);
              for (let s = q + 1; s < K; s++) if (!free[s]) pp += pair.get(pk(q, c[q], s, c[s])) || 0;
            }
            const cost = w.o * o + w.b * b + w.p * pp + r() * w.n;
            if (cost < bestC) { bestC = cost; pick = c; }
          }
        }
        if (pick && free.some(Boolean)) { // balanced overlap: the free attributes take random levels
          for (let i = 0; i < 200; i++) {
            const c = pick.map((val, q) => (free[q] ? r.int(L[q]) : val));
            if (!prohibited(c, prohib) && !task.some((x) => x.join() === c.join())) { pick = c; break; }
          }
        }
        if (!pick) return null;
        task.push([...pick]);
        pick.forEach((val, q) => { cnt[q][val]++; for (let s = q + 1; s < K; s++) { const key = pk(q, val, s, pick[s]); pair.set(key, (pair.get(key) || 0) + 1); } });
      }
      tasks.push(task);
    }
    versions.push(tasks);
  }
  return { J, T, versions, method };
}
export function cbcDiagnostics(design, L) {
  const tasks = design.versions.flat();
  const eff = choiceEfficiency(tasks, L);
  const balance = L.map((l, q) => { const c = Array(l).fill(0); tasks.forEach((t) => t.forEach((p) => c[p[q]]++)); return c; });
  // Overlap: share of tasks in which a level of the attribute appears more than once.
  const overlap = L.map((_, q) => tasks.filter((t) => new Set(t.map((p) => p[q])).size < t.length).length / tasks.length);
  return { eff, balance, overlap };
}
// Orme's (2010) rule of thumb for the minimum CBC sample: n ≥ 500 · c / (t · a), with c the largest number of levels
// in any attribute, t tasks and a alternatives per task (Orme, Getting Started with Conjoint Analysis, ch. 7).
export const ormeN = (L, T, J) => Math.ceil((500 * Math.max(...L)) / (T * J));

// ── Export the design ──
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
export function designCsv(study) {
  const attrs = studyAttrs(study), D = studyDesign(study);
  if (study.k === 'cbc') {
    const rows = [['version', 'task', 'alternative', ...attrs.map((a) => a.name)]];
    D.versions.forEach((v, vi) => v.forEach((task, ti) => {
      task.forEach((p, ai) => rows.push([vi + 1, ti + 1, ai + 1, ...p.map((l, q) => attrs[q].levels[l])]));
      if (study.no) rows.push([vi + 1, ti + 1, task.length + 1, ...attrs.map((_, q) => (q === 0 ? 'None: I would not choose any of these' : ''))]);
    }));
    return toCsv(rows);
  }
  const rows = [['card', 'holdout', ...attrs.map((a) => a.name)]];
  D.cards.forEach((p, i) => rows.push([i + 1, 0, ...p.map((l, q) => attrs[q].levels[l])]));
  D.holdouts.forEach((p, i) => rows.push([D.cards.length + i + 1, 1, ...p.map((l, q) => attrs[q].levels[l])]));
  return toCsv(rows);
}
