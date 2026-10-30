// Fractional factorial and orthogonal-array designs, and the analysis of an unreplicated two-level experiment
// (effects, half-normal plot, Lenth's pseudo standard error). Checked against pyDOE3 1.6.2 and Montgomery's
// filtration-rate example (server/scripts/causal-reference.py).
import { rng, normInv, tQuant, fmt, toCsv, parseTable, mean } from './causal-core.js';
import { L18, L32, L36 } from './causal-oa.js';

// Factor letters skip I (it stands for the identity in defining relations), as Montgomery and Box, Hunter and Hunter do.
export const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
const popcount = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
export const wordStr = (mask, k = 25) => { let s = ''; for (let j = 0; j < k; j++) if (mask >> j & 1) s += LETTERS[j]; return s || 'I'; };

// Minimum-aberration 2^(k−p) designs, Montgomery, Design and Analysis of Experiments (8th ed.), table 8.14.
// [k, p, resolution, generators]. check-causal.js recomputes every resolution from the generators.
export const DESIGNS = [
  [3, 1, 3, ['C=AB']],
  [4, 1, 4, ['D=ABC']],
  [5, 1, 5, ['E=ABCD']], [5, 2, 3, ['D=AB', 'E=AC']],
  [6, 1, 6, ['F=ABCDE']], [6, 2, 4, ['E=ABC', 'F=BCD']], [6, 3, 3, ['D=AB', 'E=AC', 'F=BC']],
  [7, 1, 7, ['G=ABCDEF']], [7, 2, 4, ['F=ABCD', 'G=ABDE']], [7, 3, 4, ['E=ABC', 'F=BCD', 'G=ACD']], [7, 4, 3, ['D=AB', 'E=AC', 'F=BC', 'G=ABC']],
  [8, 2, 5, ['G=ABCD', 'H=ABEF']], [8, 3, 4, ['F=ABC', 'G=ABD', 'H=BCDE']], [8, 4, 4, ['E=BCD', 'F=ACD', 'G=ABC', 'H=ABD']],
  [9, 2, 6, ['H=ACDFG', 'J=BCEFG']], [9, 3, 4, ['G=ABCD', 'H=ACEF', 'J=CDEF']], [9, 4, 4, ['F=BCDE', 'G=ACDE', 'H=ABDE', 'J=ABCE']], [9, 5, 3, ['E=ABC', 'F=BCD', 'G=ACD', 'H=ABD', 'J=ABCD']],
  [10, 3, 5, ['H=ABCG', 'J=BCDE', 'K=ACDF']], [10, 4, 4, ['G=BCDF', 'H=ACDF', 'J=ABDE', 'K=ABCE']], [10, 5, 4, ['F=ABCD', 'G=ABCE', 'H=ABDE', 'J=ACDE', 'K=BCDE']], [10, 6, 3, ['E=ABC', 'F=BCD', 'G=ACD', 'H=ABD', 'J=ABCD', 'K=AB']],
  [11, 4, 5, ['H=ABCG', 'J=BCDE', 'K=ACDF', 'L=ABCDEFG']], [11, 5, 4, ['G=CDE', 'H=ABCD', 'J=ABF', 'K=BDEF', 'L=ADEF']], [11, 6, 4, ['F=ABC', 'G=BCD', 'H=CDE', 'J=ACD', 'K=ADE', 'L=BDE']], [11, 7, 3, ['E=ABC', 'F=BCD', 'G=ACD', 'H=ABD', 'J=ABCD', 'K=AB', 'L=AC']],
];
export const designsFor = (k) => DESIGNS.filter((d) => d[0] === k);
export const defaultGens = (k, p) => (DESIGNS.find((d) => d[0] === k && d[1] === p) || [])[3] || [];

// Parses generator lines such as "E = ABC" or "F=-BCD" for a 2^(k−p) design. Added factors must be the last p
// letters; words may use only the k − p basic factors.
export function parseGenerators(text, k, p) {
  const b = k - p, lines = String(text || '').split(/[\n;,]+/).map((s) => s.trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean);
  if (lines.length !== p) return { error: `A 2^(${k}−${p}) design needs ${p} generator${p === 1 ? '' : 's'}, one for each of ${[...LETTERS.slice(b, k)].join(', ')}.` };
  const gens = [];
  for (const line of lines) {
    const m = /^([A-Z])=([+\-−]?)([A-Z]+)$/.exec(line);
    if (!m) return { error: `Could not read "${line}". Write generators like E=ABC or F=-BCD.` };
    const t = LETTERS.indexOf(m[1]);
    if (t < b || t >= k) return { error: `${m[1]} is not an added factor; the added factors are ${[...LETTERS.slice(b, k)].join(', ')}.` };
    if (gens.some((g) => g.target === t)) return { error: `${m[1]} has two generators.` };
    let mask = 0;
    for (const ch of m[3]) {
      const j = LETTERS.indexOf(ch);
      if (j < 0 || j >= b) return { error: `In ${line}, ${ch} is not a basic factor (use ${[...LETTERS.slice(0, b)].join('')}).` };
      mask ^= 1 << j;
    }
    if (popcount(mask) < 2) return { error: `In ${line}, the word needs at least two basic factors, or ${m[1]} would be confounded with a main effect.` };
    gens.push({ target: t, mask, sign: m[2] === '-' || m[2] === '−' ? -1 : 1 });
  }
  gens.sort((a, c) => a.target - c.target);
  const words = new Set(gens.map((g) => g.mask));
  if (words.size < gens.length) return { error: 'Two added factors have the same generator, so they would be identical columns.' };
  return { gens };
}

// Builds the design (Yates standard order: A changes fastest), the defining relation, resolution, word-length
// pattern and alias classes.
export function fracDesign(k, gens) {
  const p = gens.length, b = k - p, n = 2 ** b;
  const runs = [];
  for (let r = 0; r < n; r++) {
    const x = new Array(k);
    for (let j = 0; j < b; j++) x[j] = (r >> j) & 1 ? 1 : -1;
    for (const g of gens) { let v = g.sign; for (let j = 0; j < b; j++) if (g.mask >> j & 1) v *= x[j]; x[g.target] = v; }
    runs.push(x);
  }
  // Defining contrast subgroup: every product of the generator words I = ±(word × added factor).
  const base = gens.map((g) => ({ mask: g.mask | (1 << g.target), sign: g.sign }));
  const words = [];
  for (let s = 1; s < 2 ** p; s++) {
    let mask = 0, sign = 1;
    for (let i = 0; i < p; i++) if (s >> i & 1) { mask ^= base[i].mask; sign *= base[i].sign; }
    words.push({ mask, sign, len: popcount(mask) });
  }
  words.sort((a, c) => a.len - c.len || a.mask - c.mask);
  const resolution = p ? words[0].len : Infinity;
  const wlp = []; for (let L = 3; L <= k; L++) wlp.push(words.filter((w) => w.len === L).length);
  // Alias classes over every effect.
  const wordSet = new Map(words.map((w) => [w.mask, w.sign]));
  const seen = new Set(), classes = [];
  const order = []; for (let e = 1; e < 2 ** k; e++) order.push(e);
  order.sort((a, c) => popcount(a) - popcount(c) || a - c);
  for (const e of order) {
    if (seen.has(e) || wordSet.has(e)) continue;
    const members = [{ mask: e, sign: 1 }, ...words.map((w) => ({ mask: e ^ w.mask, sign: w.sign }))];
    members.forEach((m) => { seen.add(m.mask); m.len = popcount(m.mask); });
    members.sort((a, c) => a.len - c.len || a.mask - c.mask);
    classes.push(members);
  }
  // Clear effects (Montgomery): a main effect or two-factor interaction is clear if none of its aliases is a main
  // effect or a two-factor interaction.
  const clearOf = (cls) => cls.filter((m) => m.len <= 2).length === 1;
  const mainClear = classes.filter((c) => c[0].len === 1 && clearOf(c)).length;
  const twoClear = classes.filter((c) => c[0].len === 2 && clearOf(c)).length;
  return { k, p, b, n, runs, words, resolution, wlp, classes, mainClear, twoClear };
}
// "A = BCD = −ACE …" for display: members up to `maxLen` letters, then a count of longer ones.
export function chainText(cls, k, maxLen = 3) {
  const shown = cls.filter((m) => m.len <= maxLen), rest = cls.length - shown.length;
  return shown.map((m, i) => `${i && m.sign < 0 ? '−' : ''}${wordStr(m.mask, k)}`).join(' = ') + (rest ? ` (+${rest} higher)` : '');
}
export const romanRes = (r) => (r === Infinity ? 'full' : ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][r] || String(r));

// ── Plackett-Burman designs ──
// N = 12, 20, 24: cyclic shifts of the first rows of Plackett and Burman (1946) plus a row of minuses. N = 8, 16:
// Sylvester-Hadamard (saturated regular fractions). Columns are ±1; N − 1 factors at most.
const PB_ROWS = { 12: '++-+++---+-', 20: '++--++++-+-+----++-', 24: '+++++-+-++--++--+-+----' };
export function plackettBurman(N) {
  if (N === 8 || N === 16) {
    const out = [];
    for (let r = 0; r < N; r++) { const row = []; for (let m = 1; m < N; m++) row.push(popcount(r & m) % 2 ? 1 : -1); out.push(row); }
    // Put the all-minus run last, as in the cyclic designs.
    return [...out.slice(1), out[0]];
  }
  const g = PB_ROWS[N]; if (!g) return null;
  const first = [...g].map((c) => (c === '+' ? 1 : -1)), m = N - 1, out = [];
  for (let s = 0; s < m; s++) out.push(first.map((_, j) => first[(j - s + m) % m]));
  out.push(new Array(m).fill(-1));
  return out;
}
export const PB_SIZES = [8, 12, 16, 20, 24];

// ── Orthogonal arrays (strength 2) ──
// Levels coded 0 … s − 1. Constructions: GF(2), GF(3), GF(4) and GF(5) linear arrays; L18, L32 and L36 from causal-oa.js.
const gfLinear = (q, dim, vectors, add, mul) => {
  const rows = [];
  for (let r = 0; r < q ** dim; r++) {
    const a = []; let t = r; for (let i = 0; i < dim; i++) { a.push(t % q); t = Math.floor(t / q); }
    rows.push(vectors.map((v) => v.reduce((s, c, i) => add(s, mul(c, a[i])), 0)));
  }
  return rows;
};
const modAdd = (q) => (a, b) => (a + b) % q, modMul = (q) => (a, b) => (a * b) % q;
const GF4_MUL = [[0, 0, 0, 0], [0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2]];
const twoLevel = (dim) => { const v = []; for (let m = 1; m < 2 ** dim; m++) v.push([...Array(dim)].map((_, i) => (m >> i) & 1)); return gfLinear(2, dim, v, (a, b) => a ^ b, (a, b) => a & b); };
// Normalised vectors of GF(3)^3 (first non-zero entry 1): the 13 columns of L27.
const gf3Cols = () => { const v = []; for (let r = 1; r < 27; r++) { const a = [r % 3, Math.floor(r / 3) % 3, Math.floor(r / 9)]; if (a.find((x) => x) === 1) v.push(a); } return v; };
// A 4-level column from the 2-level columns 1, 2 and 3 (= 1 + 2) of a GF(2) array, as Taguchi does.
const merge4 = (rows) => rows.map((r) => [2 * r[1] + r[0], ...r.slice(3)]);
const parseOA = (s) => s.split(' ').map((r) => [...r].map(Number));
const split6 = (rows) => rows.map((r) => [Math.floor(r[0] / 3), r[0] % 3, ...r.slice(1)]);
export const ARRAYS = [
  { name: 'L4(2^3)', build: () => twoLevel(2) },
  { name: 'L8(2^7)', build: () => twoLevel(3) },
  { name: 'L8(4^1 2^4)', build: () => merge4(twoLevel(3)) },
  { name: 'L9(3^4)', build: () => gfLinear(3, 2, [[1, 0], [0, 1], [1, 1], [1, 2]], modAdd(3), modMul(3)) },
  { name: 'L12(2^11)', build: () => plackettBurman(12).map((r) => r.map((v) => (v > 0 ? 1 : 0))) },
  { name: 'L16(2^15)', build: () => twoLevel(4) },
  { name: 'L16(4^1 2^12)', build: () => merge4(twoLevel(4)) },
  { name: 'L16(4^5)', build: () => gfLinear(4, 2, [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]], (a, b) => a ^ b, (a, b) => GF4_MUL[a][b]) },
  { name: 'L18(2^1 3^7)', build: () => split6(parseOA(L18)) },
  { name: 'L18(6^1 3^6)', build: () => parseOA(L18) },
  { name: 'L25(5^6)', build: () => gfLinear(5, 2, [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3], [1, 4]], modAdd(5), modMul(5)) },
  { name: 'L27(3^13)', build: () => gfLinear(3, 3, gf3Cols(), modAdd(3), modMul(3)) },
  { name: 'L32(2^1 4^9)', build: () => parseOA(L32) },
  { name: 'L36(2^11 3^12)', build: () => parseOA(L36) },
];
export const levelsOf = (rows) => rows[0].map((_, j) => new Set(rows.map((r) => r[j])).size);
// Strength-2 check: every pair of columns shows every level combination equally often.
export function isStrength2(rows) {
  const L = levelsOf(rows), n = rows.length;
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const cnt = new Map(); for (const r of rows) { const key = r[a] * 16 + r[b]; cnt.set(key, (cnt.get(key) || 0) + 1); }
    if (cnt.size !== L[a] * L[b] || [...cnt.values()].some((c) => c !== n / (L[a] * L[b]))) return false;
  }
  return true;
}
// The smallest array with enough columns for the factors' level counts. levels: e.g. [2, 3, 3, 3].
export function pickArray(levels) {
  const need = {}; for (const l of levels) need[l] = (need[l] || 0) + 1;
  const fits = ARRAYS.map((a) => { const rows = a.build(), L = levelsOf(rows); return { ...a, rows, L }; })
    .filter((a) => Object.entries(need).every(([l, c]) => a.L.filter((x) => x === Number(l)).length >= c))
    .sort((x, y) => x.rows.length - y.rows.length);
  if (!fits.length) return null;
  const a = fits[0], used = new Set(), cols = [];
  for (const l of levels) { const j = a.L.findIndex((x, i) => x === l && !used.has(i)); used.add(j); cols.push(j); }
  return { name: a.name, rows: a.rows.map((r) => cols.map((j) => r[j])), cols, full: levels.reduce((s, l) => s * l, 1) };
}

// ── Run sheet ──
// Randomised run order (Fisher-Yates with a seed), keeping the standard order number for analysis.
export function randomOrder(n, seed) {
  const u = rng(seed), idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
}
// factors: [{ name, levels: [labels] }]; coded rows hold level indexes (0 …) or ±1 for two-level designs.
export function runSheet(coded, factors, order, twoLevelPm = true) {
  const label = (f, v) => f.levels[twoLevelPm && f.levels.length === 2 ? (v > 0 ? 1 : 0) : v] ?? String(v);
  const head = ['Run', 'Standard order', ...factors.map((f) => f.name)];
  const body = order.map((s, i) => [i + 1, s + 1, ...factors.map((f, j) => label(f, coded[s][j]))]);
  return { head, body, csv: toCsv([head, ...body]) };
}

// ── Analysis of a two-level experiment ──
// table: parsed with parseTable; factors: names of two-level columns; response: name of the numeric outcome.
// Columns are coded −1 (lower value, or the first label to appear) and +1. Effects are mean(y | +) − mean(y | −)
// for every main effect and interaction whose column is orthogonal to those already taken (shortest words first);
// interactions whose columns duplicate an earlier one are listed as its aliases.
export function analyseTwoLevel(table, factors, response) {
  const col = (n) => table.cols.find((c) => c.name === n);
  const yc = col(response);
  if (!yc || !yc.numeric) return { error: 'Choose a numeric response column.' };
  const fc = factors.map(col);
  if (fc.length < 2) return { error: 'Choose at least two factor columns.' };
  // Numeric factors: the lower value is −1. Labels: the first label to appear is −1 (in standard order the first run has
  // every factor at its low level).
  const lev = fc.map((c) => (c.numeric ? [...new Set(c.values.filter((v) => v !== null))].sort((a, b) => a - b) : [...new Set(c.values.filter((v) => v !== null))]));
  const bad = fc.findIndex((c, i) => lev[i].length !== 2);
  if (bad >= 0) return { error: `${fc[bad].name} has ${lev[bad].length} distinct values; every factor needs exactly two levels.` };
  const X = [], y = [];
  for (let i = 0; i < table.n; i++) {
    if (yc.values[i] === null || fc.some((c) => c.values[i] === null)) continue;
    X.push(fc.map((c, j) => (c.values[i] === lev[j][1] ? 1 : -1))); y.push(yc.values[i]);
  }
  const n = y.length, k = fc.length;
  if (n < 4) return { error: 'Need at least four complete runs.' };
  if (k > 12) return { error: 'Analyse at most 12 factors at a time.' };
  const unbalanced = fc.filter((_, j) => X.reduce((s, r) => s + r[j], 0) !== 0).map((c) => c.name);
  const cols = [], classes = [], words = [];
  const order = []; for (let e = 1; e < 2 ** k; e++) order.push(e);
  order.sort((a, c) => popcount(a) - popcount(c) || a - c);
  let partial = 0;
  for (const e of order) {
    const v = X.map((r) => { let s = 1; for (let j = 0; j < k; j++) if (e >> j & 1) s *= r[j]; return s; });
    if (v.every((x) => x === v[0])) { words.push({ mask: e, sign: v[0] }); continue; }
    const dup = cols.findIndex((c) => c.every((x, i) => x === v[i]) || c.every((x, i) => x === -v[i]));
    if (dup >= 0) { classes[dup].aliases.push({ mask: e, sign: cols[dup][0] === v[0] ? 1 : -1 }); continue; }
    if (cols.length >= n - 1) continue;
    if (cols.some((c) => c.reduce((s, x, i) => s + x * v[i], 0) !== 0)) { if (popcount(e) <= 2) partial++; continue; }
    cols.push(v);
    classes.push({ mask: e, aliases: [], v });
  }
  const effects = classes.map((c) => {
    const plus = [], minus = [];
    c.v.forEach((x, i) => (x > 0 ? plus : minus).push(y[i]));
    return { mask: c.mask, name: wordStr(c.mask, k), order: popcount(c.mask), aliases: c.aliases, effect: mean(plus) - mean(minus), coef: (mean(plus) - mean(minus)) / 2 };
  });
  const L = lenth(effects.map((e) => e.effect));
  const names = factors;
  for (const e of effects) {
    e.label = [...wordStr(e.mask, k)].map((ch) => names[LETTERS.indexOf(ch)]).join(' × ');
    e.active = Math.abs(e.effect) > L.ME; e.strong = Math.abs(e.effect) > L.SME;
  }
  const hn = halfNormal(effects.map((e) => Math.abs(e.effect)));
  return { n, k, y, X, effects, lenth: L, halfNormal: hn, words, unbalanced, partial, grand: mean(y), levels: lev, names };
}

// Lenth (1989): s0 = 1.5·median|c|, PSE = 1.5·median{|c| : |c| < 2.5·s0}, margin of error ME = t(0.975, m/3)·PSE,
// simultaneous margin SME = t(γ, m/3)·PSE with γ = (1 + 0.95^(1/m))/2.
export function lenth(c, alpha = 0.05) {
  const a = c.map(Math.abs), m = a.length;
  const med = (xs) => { const s = [...xs].sort((x, y) => x - y), h = s.length / 2; return s.length % 2 ? s[Math.floor(h)] : (s[h - 1] + s[h]) / 2; };
  const s0 = 1.5 * med(a), PSE = 1.5 * med(a.filter((x) => x < 2.5 * s0));
  const d = m / 3, gamma = (1 + (1 - alpha) ** (1 / m)) / 2;
  return { s0, PSE, d, m, ME: tQuant(1 - alpha / 2, d) * PSE, SME: tQuant(gamma, d) * PSE, gamma };
}
// Half-normal plot positions: the i-th smallest |effect| against Φ⁻¹(0.5 + 0.5·(i − 0.5)/m).
export function halfNormal(abs) {
  const m = abs.length, idx = abs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  return idx.map(([v, i], r) => ({ i, abs: v, q: normInv(0.5 + 0.5 * (r + 0.5) / m) }));
}

// ── Examples ──
// Montgomery (2017), Example 6.2: a 2^4 pilot-plant filtration experiment, runs in standard order. Published effects:
// A 21.625, C 9.875, D 14.625, AC −18.125, AD 16.625.
export const MONTGOMERY_Y = [45, 71, 48, 65, 68, 60, 80, 65, 43, 100, 45, 104, 75, 86, 70, 96];
export function montgomeryText() {
  const lines = ['Temperature,Pressure,Concentration,Stir rate,Filtration rate'];
  MONTGOMERY_Y.forEach((yv, r) => lines.push([0, 1, 2, 3].map((j) => ((r >> j) & 1 ? 1 : -1)).join(',') + `,${yv}`));
  return lines.join('\n');
}
// UX example: a 2^(5−1) resolution V sign-up page experiment, 16 cells with about 2,000 visitors each; the response is
// the sign-up rate in %. Factors: headline, hero image, button text, social proof, form length (E = ABCD).
export const UX_FACTORS = ['Headline', 'Hero image', 'Button text', 'Social proof', 'Form length'];
export const UX_LEVELS = [['Feature', 'Benefit'], ['Product shot', 'People'], ['Sign up', 'Start free'], ['None', 'Logos'], ['7 fields', '3 fields']];
export const UX_Y = [6.8, 8.9, 7.0, 9.4, 7.3, 9.6, 7.1, 10.5, 7.5, 9.3, 7.2, 9.9, 7.6, 10.4, 7.9, 11.2];
export function uxExampleText() {
  const { runs } = fracDesign(5, parseGenerators('E=ABCD', 5, 1).gens);
  const lines = [UX_FACTORS.join(',') + ',Sign-up rate (%)'];
  runs.forEach((r, i) => lines.push(r.map((v, j) => UX_LEVELS[j][v > 0 ? 1 : 0]).join(',') + `,${UX_Y[i]}`));
  return lines.join('\n');
}

// ── Reading your results ──
// Design confidence rule: strong when every main effect and two-factor interaction is clear of other main effects
// and two-factor interactions (resolution V or more, or a full factorial); some for resolution IV (main effects
// clear, two-factor interactions aliased with each other); weak for resolution III, Plackett-Burman and other
// screening arrays (main effects aliased with, or partly confounded by, two-factor interactions). Source for the
// resolution ladder: Box, Hunter and Hunter (2005), ch. 6.
export function designSummary(d) {
  const { kind, runs, k, res, name, full } = d;
  const resW = res === Infinity ? 'a full factorial' : `resolution ${romanRes(res)}`;
  const headline = kind === 'frac'
    ? `This ${runs}-run design tests ${k} two-level factors (${resW}) instead of the ${2 ** k} runs a full factorial would need.`
    : kind === 'pb' ? `This ${runs}-run Plackett-Burman design screens up to ${k} two-level factors for their main effects.`
      : `The ${name} orthogonal array tests ${k} factors in ${runs} runs instead of the ${full} a full factorial would need.`;
  const meaning = [];
  if (kind === 'frac') {
    meaning.push(res === Infinity ? 'Every main effect and interaction can be estimated separately.' : res >= 5 ? 'Main effects and two-factor interactions are not aliased with each other, so you can estimate all of them if three-factor and higher interactions are negligible.' : res === 4 ? 'Main effects are clear of two-factor interactions, but two-factor interactions are aliased in pairs or groups; you can see that "one of these" interactions matters, not which.' : 'Main effects are aliased with two-factor interactions: if an interaction is real, it will show up as (and bias) a main effect.');
    meaning.push(`${d.mainClear} of ${k} main effects and ${d.twoClear} of ${(k * (k - 1)) / 2} two-factor interactions are clear (not aliased with any other main effect or two-factor interaction).`);
  } else if (kind === 'pb') {
    meaning.push('Each main effect is estimated from all runs, but every two-factor interaction is spread over several main effects (partial aliasing), so only use it when you expect few, mostly main, effects.');
  } else {
    meaning.push('Every pair of columns is balanced, so main effects are estimated independently of each other; interactions are mixed into the main-effect columns.');
  }
  meaning.push('Run the experiment in the randomised order so time trends do not masquerade as effects.');
  let confidence, confidenceNote;
  if (kind === 'frac' && res >= 5) { confidence = 'high'; confidenceNote = 'Main effects and two-factor interactions are all separable.'; }
  else if (kind === 'frac' && res === 4) { confidence = 'medium'; confidenceNote = 'Main effects are clear, but two-factor interactions are aliased with each other.'; }
  else { confidence = 'low'; confidenceNote = 'Main effects can be biased by two-factor interactions; treat results as a screen to follow up.'; }
  confidenceNote += ' Rule (the design\'s ability to separate effects, from Box, Hunter and Hunter 2005): strong = resolution V or more; some = resolution IV; weak = resolution III, Plackett-Burman or orthogonal arrays with interactions in the main-effect columns.';
  const caveats = [
    'Aliasing assumes the higher-order interactions are negligible; if they are not, the estimates mix them in.',
    'An unreplicated design has no pure error; significance comes from Lenth\'s method or a half-normal plot, which needs most effects to be near zero (effect sparsity).',
    'In online experiments each run is a cell of traffic: give every cell enough visitors for the effect size you care about.',
  ];
  const next = [
    'Download the run sheet and run the cells in the randomised order (or randomise visitors into cells at the same time).',
    'Paste the results into the analysis tab to estimate the effects and see which are active.',
    'If a resolution III or IV design shows aliased effects that matter, fold it over (rerun with all signs switched) to separate them.',
  ];
  const report = kind === 'frac'
    ? `A ${runs}-run 2^(${k}−${d.p}) fractional factorial design (${resW}${d.gens && d.gens.length ? `, generators ${d.gens.join(', ')}` : ''}) was used for ${k} two-level factors, run in randomised order.`
    : kind === 'pb' ? `A ${runs}-run Plackett-Burman screening design was used for ${k} two-level factors, run in randomised order.`
      : `A ${name} orthogonal array (${runs} runs) was used for ${k} factors, run in randomised order.`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}

// Analysis confidence rule: strong when at least one effect exceeds Lenth's simultaneous margin (SME) and there are at
// least 7 effects to estimate the PSE from; some when effects exceed the individual margin (ME) only; weak when none
// exceeds ME or there are fewer than 7 effects. Source: Lenth (1989); Montgomery (2017), section 6.5.
export function analysisSummary(a, { response = 'the response', goal = 'max' } = {}) {
  const act = a.effects.filter((e) => e.active).sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  const top = [...a.effects].sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect))[0];
  const d = Math.abs(a.grand) < 10 ? 2 : 1;
  const headline = act.length
    ? `${act.length} effect${act.length === 1 ? '' : 's'} stand${act.length === 1 ? 's' : ''} out from the noise on ${response}: ${act.slice(0, 5).map((e) => `${e.label} (${e.effect > 0 ? '+' : '−'}${fmt(Math.abs(e.effect), d)})`).join(', ')}${act.length > 5 ? ` and ${act.length - 5} more` : ''}.`
    : `No effect is larger than Lenth's margin of error (${fmt(a.lenth.ME, d)}); the largest is ${top.label} (${fmt(top.effect, d)}).`;
  const meaning = [
    `An effect is the average change in ${response} when a factor moves from its low to its high level. Lenth's pseudo standard error is ${fmt(a.lenth.PSE, 3)}, from ${a.lenth.m} effects.`,
    `Margin of error ${fmt(a.lenth.ME, d)} (individual) and ${fmt(a.lenth.SME, d)} (simultaneous, allowing for testing ${a.lenth.m} effects at once).`,
  ];
  const mains = act.filter((e) => e.order === 1);
  if (mains.length) meaning.push(`To ${goal === 'max' ? 'raise' : 'lower'} ${response}, set ${mains.map((e) => `${e.label} to ${a.levels[LETTERS.indexOf(e.name)][(e.effect > 0) === (goal === 'max') ? 1 : 0]}`).join(', ')}.`);
  const ints = act.filter((e) => e.order > 1);
  if (ints.length) meaning.push(`The interaction${ints.length > 1 ? 's' : ''} ${ints.map((e) => e.label).join(', ')} mean${ints.length > 1 ? '' : 's'} the best level of one factor depends on another; look at the cell means before choosing.`);
  const aliased = act.filter((e) => e.aliases.some((x) => popcount(x.mask) <= 2));
  if (aliased.length) meaning.push(`${aliased.map((e) => e.label).join(', ')} ${aliased.length > 1 ? 'are' : 'is'} aliased with other low-order effects, so the label is only one of the possible explanations.`);
  const strong = act.some((e) => e.strong);
  let confidence, confidenceNote;
  if (a.lenth.m < 7 || !act.length) { confidence = 'low'; confidenceNote = a.lenth.m < 7 ? `Only ${a.lenth.m} effects, too few to estimate the noise reliably.` : 'No effect exceeds the margin of error.'; }
  else if (strong) { confidence = 'high'; confidenceNote = 'At least one effect exceeds the simultaneous margin of error, which allows for testing all effects at once.'; }
  else { confidence = 'medium'; confidenceNote = 'Effects exceed the individual margin of error but not the simultaneous one, so one or two could be false alarms.'; }
  confidenceNote += ' Rule (Lenth 1989): strong = an effect beyond the simultaneous margin with at least 7 effects; some = beyond the individual margin only; weak = none beyond it, or fewer than 7 effects.';
  const caveats = [
    'Lenth\'s method assumes most effects are zero (effect sparsity); if many factors matter, the PSE is too large and real effects are missed.',
    a.unbalanced.length ? `${a.unbalanced.join(', ')} ${a.unbalanced.length > 1 ? 'are' : 'is'} not balanced (unequal numbers of low and high runs), so effects are only approximate.` : a.partial ? 'Some two-factor interactions are partly confounded with main effects (a non-regular design such as Plackett-Burman); only the main effects are estimated.' : 'Effects of factors held constant in the experiment, or of levels outside the tested range, are unknown.',
    'With rates from cells of different sizes, weight cells by visitors or analyse visitor-level data with logistic regression.',
  ];
  const next = [
    'Confirm the best settings with a follow-up test against the current design.',
    'Check large interactions by plotting the two factors\' cell means.',
    'For a simple two-version test of the winner, see [Bayesian A/B testing](/calculators/bayes-ab).',
  ];
  const report = `Effects were estimated from ${a.n} runs of a two-level design (${a.k} factors) and tested with Lenth's method (PSE = ${fmt(a.lenth.PSE, 3)}, ME = ${fmt(a.lenth.ME, 3)}, SME = ${fmt(a.lenth.SME, 3)}, ${a.lenth.m} effects). ${act.length ? `Active effects: ${act.map((e) => `${e.label} ${fmt(e.effect, 3)}`).join('; ')}.` : 'No effect exceeded the margin of error.'}`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}
export { parseTable };
