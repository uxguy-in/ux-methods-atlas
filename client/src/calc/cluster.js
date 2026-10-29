// Clustering for the "Cluster to personas" calculator: parsing pasted survey data, guessing column types, Gower
// distance, k-means, k-prototypes, k-medoids (PAM), DBSCAN, hierarchical clustering, silhouettes, the adjusted Rand
// index, PCA and classical MDS, and the per-cluster profiles that become persona drafts. Plain JS, no React, so
// `npm run check:calc` can test it against scikit-learn and scipy. Everything runs in the browser.

// ── Seeded random numbers (mulberry32) ──
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
const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
const mean = (xs) => { let s = 0; for (const x of xs) s += x; return xs.length ? s / xs.length : NaN; };
const sdOf = (xs) => { const m = mean(xs); let s = 0; for (const x of xs) s += (x - m) ** 2; return xs.length > 1 ? Math.sqrt(s / (xs.length - 1)) : 0; };

// ── Parsing pasted data ──
// Tab-separated (pasted from Excel or Google Sheets), comma- or semicolon-separated, with a header row and
// double-quoted fields.
export function parseTable(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return { headers: [], rows: [], delimiter: '\t' };
  const first = lines[0];
  const count = (c) => first.split(c).length - 1;
  const delimiter = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';
  const splitLine = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
      else if (ch === delimiter) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const raw = splitLine(first);
  const seen = new Map();
  const headers = raw.map((h, i) => { let name = h || `Column ${i + 1}`; const c = seen.get(name) || 0; seen.set(name, c + 1); if (c) name = `${name} (${c + 1})`; return name; });
  const rows = lines.slice(1).filter((l) => l.trim()).map((l) => { const r = splitLine(l); while (r.length < headers.length) r.push(''); return r.slice(0, headers.length); });
  return { headers, rows, delimiter };
}

export const isMissing = (v) => v == null || /^\s*(|na|n\/a|nan|null|none|-|\.|\?|missing|#n\/a)\s*$/i.test(String(v));
const toNum = (v) => { const s = String(v).trim().replace(/,(?=\d{3}\b)/g, ''); if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN; return Number(s); };

// Ordered answer scales recognised when guessing ordinal columns. Every value in the column must come from one scale.
const LEXICONS = [
  { 'strongly disagree': 1, 'disagree': 2, 'somewhat disagree': 2.5, 'slightly disagree': 2.5, 'neither agree nor disagree': 3, 'neutral': 3, 'somewhat agree': 3.5, 'slightly agree': 3.5, 'agree': 4, 'strongly agree': 5 },
  { 'never': 0, 'rarely': 1, 'seldom': 1, 'sometimes': 2, 'occasionally': 2, 'often': 3, 'usually': 3.5, 'very often': 3.5, 'always': 4 },
  { 'very low': 1, 'low': 2, 'medium': 3, 'moderate': 3, 'average': 3, 'high': 4, 'very high': 5 },
  { 'very dissatisfied': 1, 'dissatisfied': 2, 'neutral': 3, 'neither satisfied nor dissatisfied': 3, 'satisfied': 4, 'very satisfied': 5 },
  { 'very unlikely': 1, 'unlikely': 2, 'neutral': 3, 'likely': 4, 'very likely': 5 },
  { 'very poor': 1, 'poor': 2, 'fair': 3, 'good': 4, 'very good': 5, 'excellent': 6 },
  { 'very difficult': 1, 'difficult': 2, 'neutral': 3, 'easy': 4, 'very easy': 5 },
  { 'novice': 1, 'beginner': 1, 'intermediate': 2, 'advanced': 3, 'expert': 4 },
  { 'daily': 5, 'weekly': 4, 'monthly': 3, 'quarterly': 2, 'yearly': 1, 'less often': 0 },
  { 'xs': 1, 'small': 2, 's': 2, 'medium': 3, 'm': 3, 'large': 4, 'l': 4, 'xl': 5 },
];
// Bands such as "18-24", "25–34", "55+", "Under 18", "<1 year", "1-3 years": order by the first number in the label.
const bandKey = (s) => { const m = String(s).match(/-?\d+(\.\d+)?/); if (!m) return NaN; let v = Number(m[0]); if (/^\s*(under|less than|below|<|up to)/i.test(s)) v -= 0.5; if (/(\+|or more|and over|or older|plus)\s*$/i.test(s) || /^\s*(over|more than|>)/i.test(s)) v += 0.5; return v; };

// Guess each column's type from its values: continuous, ordinal, nominal or ignore.
export function guessColumns(table) {
  const { headers, rows } = table;
  return headers.map((name, j) => {
    const vals = rows.map((r) => r[j]);
    const present = vals.filter((v) => !isMissing(v)).map((v) => String(v).trim());
    const distinct = [...new Set(present)];
    const nums = present.map(toNum);
    const allNum = present.length > 0 && nums.every(Number.isFinite);
    const base = { name, index: j, missing: vals.length - present.length, distinct: distinct.length, numeric: allNum };
    let type = 'nominal', levels = null, why = '';
    if (!present.length) { type = 'ignore'; why = 'empty'; }
    else if (allNum) {
      const ints = nums.every(Number.isInteger);
      const lo = Math.min(...nums), hi = Math.max(...nums);
      const idLike = ints && distinct.length === present.length && present.length >= 10 && (/(^|[\s_-])(id|key|uuid|respondent|code)([\s_-]|$)/i.test(name) || hi - lo + 1 === distinct.length);
      if (idLike) { type = 'ignore'; why = 'a different value on every row, like an ID'; }
      else if (ints && distinct.length <= 11 && hi - lo <= 10) { type = 'ordinal'; why = 'a short whole-number scale'; }
      else { type = 'continuous'; why = 'numbers with many values'; }
      if (type === 'ordinal') levels = [...new Set(nums)].sort((a, b) => a - b).map(String);
    } else {
      const lower = distinct.map((d) => d.toLowerCase());
      const lex = LEXICONS.find((L) => lower.every((d) => d in L));
      const bands = distinct.every((d) => Number.isFinite(bandKey(d)) && d.length <= 24);
      const avgLen = mean(present.map((v) => v.length));
      if (lex && distinct.length >= 2) { type = 'ordinal'; why = 'an ordered answer scale'; levels = [...distinct].sort((a, b) => lex[a.toLowerCase()] - lex[b.toLowerCase()]); }
      else if (bands && distinct.length >= 2 && distinct.length <= 15) { type = 'ordinal'; why = 'ordered bands'; levels = [...distinct].sort((a, b) => bandKey(a) - bandKey(b)); }
      else if ((distinct.length > 30 && distinct.length > 0.5 * present.length) || (distinct.length >= 0.9 * present.length && present.length >= 10) || avgLen > 40) { type = 'ignore'; why = 'free text or a different value on most rows'; }
      else { type = 'nominal'; why = 'categories with no order'; }
    }
    return { ...base, type, guessed: type, why, levels: levels || defaultLevels(distinct, allNum) };
  });
}
const defaultLevels = (distinct, allNum) => (allNum ? [...distinct].sort((a, b) => toNum(a) - toNum(b)) : [...distinct].sort((a, b) => a.localeCompare(b)));

// Per-column summary for the data step, under the chosen type.
export function summarise(table, col, type, levels) {
  const vals = table.rows.map((r) => r[col.index]).filter((v) => !isMissing(v)).map((v) => String(v).trim());
  if (type === 'continuous') {
    const xs = vals.map(toNum).filter(Number.isFinite);
    return { bad: vals.length - xs.length, text: xs.length ? `${fmt(Math.min(...xs))} to ${fmt(Math.max(...xs))}, median ${fmt(median(xs))}` : 'no numbers' };
  }
  const counts = new Map(); for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  if (type === 'ordinal') {
    const unknown = vals.filter((v) => !levels.includes(v)).length;
    return { bad: unknown, text: `${levels.length} levels: ${levels.slice(0, 6).join(' < ')}${levels.length > 6 ? ' < …' : ''}` };
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { bad: 0, text: top.map(([k, c]) => `${k} (${c})`).join(', ') + (counts.size > 3 ? ` +${counts.size - 3} more` : '') };
}
const fmt = (x, d = 1) => (Number.isInteger(x) ? String(x) : x.toFixed(d));

// ── Preparing features ──
// spec: [{ name, index, type: 'continuous'|'ordinal'|'nominal', levels }]. Returns the rows used and one feature per
// column: continuous `x`; ordinal `x` (the level's number when the levels are numbers, otherwise its position) and
// `r` (position scaled to 0–1); nominal `c` (category code). Missing values drop the row or are imputed (median for
// continuous and ordinal, mode for nominal).
export function prepare(table, spec, missing = 'drop') {
  const n0 = table.rows.length;
  const feats = spec.map((s) => {
    const raw = table.rows.map((r) => (isMissing(r[s.index]) ? null : String(r[s.index]).trim()));
    if (s.type === 'continuous') return { ...s, val: raw.map((v) => (v == null ? NaN : toNum(v))) };
    if (s.type === 'ordinal') {
      const pos = new Map(s.levels.map((l, i) => [l, i]));
      return { ...s, val: raw.map((v) => (v != null && pos.has(v) ? pos.get(v) : NaN)) };
    }
    const cats = [...new Set(raw.filter((v) => v != null))].sort((a, b) => a.localeCompare(b));
    const pos = new Map(cats.map((l, i) => [l, i]));
    return { ...s, cats, val: raw.map((v) => (v == null ? NaN : pos.get(v))) };
  });
  let used = [];
  let imputed = 0;
  if (missing === 'drop') { for (let i = 0; i < n0; i++) if (feats.every((f) => Number.isFinite(f.val[i]))) used.push(i); }
  else {
    used = Array.from({ length: n0 }, (_, i) => i).filter((i) => feats.some((f) => Number.isFinite(f.val[i])));
    for (const f of feats) {
      const ok = used.map((i) => f.val[i]).filter(Number.isFinite);
      let fill;
      if (f.type === 'nominal') { const c = new Map(); for (const v of ok) c.set(v, (c.get(v) || 0) + 1); fill = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]; }
      else if (f.type === 'ordinal') fill = Math.round(median(ok) - 1e-9);
      else fill = median(ok);
      for (const i of used) if (!Number.isFinite(f.val[i])) { f.val[i] = fill; imputed++; }
    }
  }
  const out = feats.map((f) => {
    const v = used.map((i) => f.val[i]);
    if (f.type === 'continuous') { const lo = Math.min(...v), hi = Math.max(...v); return { name: f.name, index: f.index, type: f.type, x: v, range: hi - lo, min: lo }; }
    if (f.type === 'ordinal') {
      const L = f.levels.length, numericLevels = f.levels.every((l) => Number.isFinite(toNum(l)));
      const lo = Math.min(...v), hi = Math.max(...v);
      return { name: f.name, index: f.index, type: f.type, levels: f.levels, pos: v, x: numericLevels ? v.map((p) => toNum(f.levels[p])) : v.slice(), r: v.map((p) => (L > 1 ? p / (L - 1) : 0)), range: hi - lo, numericLevels };
    }
    return { name: f.name, index: f.index, type: f.type, cats: f.cats, c: v };
  });
  return { used, feats: out, n: used.length, dropped: n0 - used.length, imputed };
}

// Numeric matrix for k-means, Ward and PCA: continuous and ordinal columns scaled (z-score or min-max); nominal
// columns one-hot encoded as 0/1 when `oneHot`, otherwise left out.
export function numericMatrix(feats, scaling = 'z', oneHot = false) {
  const cols = [], names = [];
  for (const f of feats) {
    if (f.type === 'nominal') {
      if (!oneHot) continue;
      f.cats.forEach((c, k) => { cols.push(f.c.map((v) => (v === k ? 1 : 0))); names.push(`${f.name} = ${c}`); });
      continue;
    }
    const v = f.x, m = mean(v), s = sdOf(v), lo = Math.min(...v), hi = Math.max(...v);
    cols.push(scaling === 'minmax' ? v.map((x) => (hi > lo ? (x - lo) / (hi - lo) : 0)) : v.map((x) => (s > 0 ? (x - m) / s : 0)));
    names.push(f.name);
  }
  const n = feats[0] ? (feats[0].x || feats[0].c).length : 0;
  const X = Array.from({ length: n }, (_, i) => Float64Array.from(cols, (c) => c[i]));
  return { X, names, p: cols.length };
}

// ── Distances ──
// Gower (1971): the mean over columns of a per-column dissimilarity in [0, 1]. Continuous |x − y|/range; ordinal
// |rank − rank| on positions scaled to 0–1 (ranks / (levels − 1)); nominal 0 if equal, 1 if not. A column with zero
// range contributes 0.
export function gowerPair(feats, i, j) {
  let s = 0;
  for (const f of feats) {
    if (f.type === 'continuous') s += f.range > 0 ? Math.abs(f.x[i] - f.x[j]) / f.range : 0;
    else if (f.type === 'ordinal') s += Math.abs(f.r[i] - f.r[j]);
    else s += f.c[i] === f.c[j] ? 0 : 1;
  }
  return feats.length ? s / feats.length : 0;
}
// Full n × n matrix (Float64Array, row-major) over the rows in `idx` (default: all rows).
export function gowerMatrix(feats, idx) {
  const n = idx ? idx.length : (feats[0].x || feats[0].c).length;
  const id = idx || Array.from({ length: n }, (_, i) => i);
  const D = new Float64Array(n * n);
  // Column-by-column accumulation is much faster than pair-by-pair for wide data.
  for (const f of feats) {
    if (f.type === 'nominal') { const c = id.map((i) => f.c[i]); for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (c[a] !== c[b]) D[a * n + b] += 1; }
    else {
      const v = f.type === 'continuous' ? id.map((i) => f.x[i]) : id.map((i) => f.r[i]);
      const scale = f.type === 'continuous' ? (f.range > 0 ? 1 / f.range : 0) : 1;
      if (!scale) continue;
      for (let a = 0; a < n; a++) { const va = v[a]; for (let b = a + 1; b < n; b++) D[a * n + b] += Math.abs(va - v[b]) * scale; }
    }
  }
  const p = feats.length || 1;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) { const d = D[a * n + b] / p; D[a * n + b] = d; D[b * n + a] = d; }
  return D;
}
export function euclidMatrix(X, idx) {
  const id = idx || X.map((_, i) => i);
  const n = id.length, D = new Float64Array(n * n);
  for (let a = 0; a < n; a++) { const xa = X[id[a]]; for (let b = a + 1; b < n; b++) { const xb = X[id[b]]; let s = 0; for (let k = 0; k < xa.length; k++) { const d = xa[k] - xb[k]; s += d * d; } const d = Math.sqrt(s); D[a * n + b] = d; D[b * n + a] = d; } }
  return D;
}
const sq = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) { const d = a[k] - b[k]; s += d * d; } return s; };

// ── k-means (Lloyd), with k-means++ initialisation ──
// Greedy k-means++ as in scikit-learn: each new centre is the best of 2 + ⌊ln k⌋ candidates drawn with probability
// proportional to D², judged by the resulting total D².
export function kmeansPP(X, k, rnd) {
  const n = X.length, trials = 2 + Math.floor(Math.log(k));
  const centers = [X[Math.floor(rnd() * n)]];
  const d2 = X.map((x) => sq(x, centers[0]));
  for (let c = 1; c < k; c++) {
    const total = d2.reduce((a, b) => a + b, 0);
    let best = null, bestPot = Infinity, bestD = null;
    for (let t = 0; t < trials; t++) {
      let r = rnd() * total, i = 0;
      if (total > 0) { while (i < n - 1 && r >= d2[i]) { r -= d2[i]; i++; } } else i = Math.floor(rnd() * n);
      const nd = d2.map((v, j) => Math.min(v, sq(X[j], X[i])));
      const pot = nd.reduce((a, b) => a + b, 0);
      if (pot < bestPot) { bestPot = pot; best = i; bestD = nd; }
    }
    centers.push(X[best]); for (let j = 0; j < n; j++) d2[j] = bestD[j];
  }
  return centers.map((c) => Float64Array.from(c));
}
// Lloyd's algorithm from given initial centres. Stops when no assignment changes. An empty cluster is re-seeded with
// the point farthest from its centre.
export function kmeansLloyd(X, init, maxIter = 300) {
  const n = X.length, k = init.length, p = X[0].length;
  const centers = init.map((c) => Float64Array.from(c));
  const labels = new Int32Array(n).fill(-1);
  let iter = 0;
  for (; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = sq(X[i], centers[c]); if (d < bd) { bd = d; b = c; } }
      if (labels[i] !== b) { labels[i] = b; changed++; }
    }
    if (!changed && iter > 0) break;
    const sums = Array.from({ length: k }, () => new Float64Array(p)), cnt = new Int32Array(k);
    for (let i = 0; i < n; i++) { cnt[labels[i]]++; const s = sums[labels[i]]; for (let q = 0; q < p; q++) s[q] += X[i][q]; }
    for (let c = 0; c < k; c++) {
      if (cnt[c]) { for (let q = 0; q < p; q++) centers[c][q] = sums[c][q] / cnt[c]; }
      else { let far = 0, fd = -1; for (let i = 0; i < n; i++) { const d = sq(X[i], centers[labels[i]]); if (d > fd) { fd = d; far = i; } } centers[c] = Float64Array.from(X[far]); }
    }
  }
  let inertia = 0; for (let i = 0; i < n; i++) inertia += sq(X[i], centers[labels[i]]);
  return { labels: Array.from(labels), centers, inertia, iter };
}
export function kmeans(X, k, { seed = 1, nInit = 10 } = {}) {
  const rnd = rng(seed); let best = null;
  for (let r = 0; r < nInit; r++) { const res = kmeansLloyd(X, kmeansPP(X, k, rnd)); if (!best || res.inertia < best.inertia - 1e-12) best = res; }
  return { ...best, cost: best.inertia };
}

// ── k-prototypes (Huang 1997) ──
// Cost = Σ squared Euclidean distance on the scaled numeric columns + γ × number of mismatched nominal columns.
// Prototypes are the means of numeric columns and the modes of nominal columns. Random initial prototypes, several restarts.
export function kprototypes(Xn, Xc, k, gamma, { seed = 1, nInit = 10, maxIter = 100 } = {}) {
  const n = Xn.length, p = Xn[0]?.length || 0, m = Xc[0]?.length || 0, rnd = rng(seed);
  const dist = (i, proto) => { let s = 0; for (let q = 0; q < p; q++) { const d = Xn[i][q] - proto.num[q]; s += d * d; } let mm = 0; for (let q = 0; q < m; q++) if (Xc[i][q] !== proto.cat[q]) mm++; return s + gamma * mm; };
  let best = null;
  for (let r = 0; r < nInit; r++) {
    const start = shuffle(Array.from({ length: n }, (_, i) => i), rnd).slice(0, k);
    let protos = start.map((i) => ({ num: Float64Array.from(Xn[i]), cat: Array.from(Xc[i]) }));
    const labels = new Int32Array(n).fill(-1);
    for (let it = 0; it < maxIter; it++) {
      let changed = 0;
      for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = dist(i, protos[c]); if (d < bd) { bd = d; b = c; } } if (labels[i] !== b) { labels[i] = b; changed++; } }
      if (!changed && it > 0) break;
      protos = protos.map((old, c) => {
        const members = []; for (let i = 0; i < n; i++) if (labels[i] === c) members.push(i);
        if (!members.length) { const i = Math.floor(rnd() * n); return { num: Float64Array.from(Xn[i]), cat: Array.from(Xc[i]) }; }
        const num = new Float64Array(p); for (const i of members) for (let q = 0; q < p; q++) num[q] += Xn[i][q] / members.length;
        const cat = Array.from({ length: m }, (_, q) => { const cnt = new Map(); for (const i of members) cnt.set(Xc[i][q], (cnt.get(Xc[i][q]) || 0) + 1); return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]; });
        return { num, cat };
      });
    }
    let cost = 0; for (let i = 0; i < n; i++) cost += dist(i, protos[labels[i]]);
    if (!best || cost < best.cost - 1e-12) best = { labels: Array.from(labels), protos, cost };
  }
  return best;
}

// ── k-medoids: PAM (Kaufman and Rousseeuw) with the FastPAM1 swap (Schubert and Rousseeuw 2019) ──
// BUILD picks medoids greedily; SWAP repeatedly makes the single medoid/non-medoid exchange that lowers the total
// distance most, until none does. FastPAM1 finds the same best swap as classic PAM in O(n²) per pass instead of O(kn²).
export function pam(D, n, k, { maxIter = 100 } = {}) {
  const med = [];
  const isMed = new Uint8Array(n);
  const dn = new Float64Array(n).fill(Infinity);
  for (let c = 0; c < k; c++) {
    let best = -1, bestCost = Infinity;
    for (let x = 0; x < n; x++) {
      if (isMed[x]) continue;
      let cost = 0; const o = x * n;
      for (let y = 0; y < n; y++) { const d = D[o + y]; cost += d < dn[y] ? d : dn[y]; }
      if (cost < bestCost - 1e-12) { bestCost = cost; best = x; }
    }
    med.push(best); isMed[best] = 1;
    const o = best * n; for (let y = 0; y < n; y++) if (D[o + y] < dn[y]) dn[y] = D[o + y];
  }
  const near = new Int32Array(n), ds = new Float64Array(n);
  const update = () => {
    for (let o = 0; o < n; o++) {
      let a = -1, da = Infinity, db = Infinity;
      for (let c = 0; c < k; c++) { const d = D[o * n + med[c]]; if (d < da) { db = da; da = d; a = c; } else if (d < db) db = d; }
      near[o] = a; dn[o] = da; ds[o] = db;
    }
  };
  update();
  let iter = 0;
  const removal = new Float64Array(k), delta = new Float64Array(k);
  for (; iter < maxIter; iter++) {
    removal.fill(0);
    for (let o = 0; o < n; o++) removal[near[o]] += ds[o] - dn[o];
    let bestDelta = -1e-10, bestM = -1, bestX = -1;
    for (let x = 0; x < n; x++) {
      if (isMed[x]) continue;
      delta.set(removal); let acc = 0; const row = x * n;
      for (let o = 0; o < n; o++) {
        const d = D[row + o], a = dn[o];
        if (d < a) { acc += d - a; delta[near[o]] += a - ds[o]; }
        else if (d < ds[o]) delta[near[o]] += d - ds[o];
      }
      for (let c = 0; c < k; c++) { const t = delta[c] + acc; if (t < bestDelta) { bestDelta = t; bestM = c; bestX = x; } }
    }
    if (bestX < 0) break;
    isMed[med[bestM]] = 0; isMed[bestX] = 1; med[bestM] = bestX; update();
  }
  let cost = 0; for (let o = 0; o < n; o++) cost += dn[o];
  return { medoids: med.slice(), labels: Array.from(near), cost, iter };
}

// ── DBSCAN (Ester, Kriegel, Sander and Xu 1996) ──
// A core point has at least minPts points (itself included) within eps. Clusters grow from core points in row order;
// a border point joins the first cluster that reaches it; everything else is noise (−1). Same rules as scikit-learn.
export function dbscan(D, n, eps, minPts) {
  const nb = Array.from({ length: n }, (_, i) => { const out = []; for (let j = 0; j < n; j++) if (D[i * n + j] <= eps) out.push(j); return out; });
  const core = nb.map((l) => l.length >= minPts);
  const labels = new Array(n).fill(-1);
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1 || !core[i]) continue;
    const stack = [i]; labels[i] = c;
    while (stack.length) {
      const p = stack.pop();
      if (!core[p]) continue;
      for (const q of nb[p]) if (labels[q] === -1) { labels[q] = c; stack.push(q); }
    }
    c++;
  }
  return { labels, core, clusters: c, noise: labels.filter((l) => l === -1).length };
}
// Distance from each point to its (minPts − 1)th nearest other point, sorted: the k-distance plot for choosing eps.
export function kDistances(D, n, minPts) {
  const k = Math.max(1, Math.min(n - 1, minPts - 1));
  const out = new Float64Array(n);
  const row = new Float64Array(n - 1);
  for (let i = 0; i < n; i++) { let t = 0; for (let j = 0; j < n; j++) if (j !== i) row[t++] = D[i * n + j]; row.sort(); out[i] = row[k - 1]; }
  return Array.from(out).sort((a, b) => a - b);
}
// The "knee" of the sorted k-distance curve: the point farthest from the straight line joining its ends.
export function kneeEps(kd) {
  const n = kd.length; if (n < 3) return kd[n - 1] || 0;
  const x0 = 0, y0 = kd[0], x1 = n - 1, y1 = kd[n - 1];
  const ys = y1 - y0 || 1;
  let best = 0, bi = n - 1;
  for (let i = 0; i < n; i++) { const xn = (i - x0) / (x1 - x0), yn = (kd[i] - y0) / ys; const d = xn - yn; if (d > best) { best = d; bi = i; } }
  return kd[bi];
}

// ── Hierarchical agglomerative clustering: nearest-neighbour chain with Lance-Williams updates ──
// method 'ward' takes Euclidean distances (works on squared distances internally and reports heights as scipy does);
// 'average' (UPGMA) takes any distance, such as Gower. Returns a scipy-style linkage: [a, b, height, size] per merge,
// with clusters numbered n, n + 1, … in merge order.
export function hclust(D, n, method = 'ward') {
  const M = new Float64Array(D);
  if (method === 'ward') for (let i = 0; i < M.length; i++) M[i] = M[i] * M[i];
  const size = new Float64Array(n).fill(1), active = new Uint8Array(n).fill(1);
  const raw = [];
  const chain = [];
  let left = n;
  while (left > 1) {
    if (!chain.length) { for (let i = 0; i < n; i++) if (active[i]) { chain.push(i); break; } }
    for (;;) {
      const a = chain[chain.length - 1], prev = chain.length > 1 ? chain[chain.length - 2] : -1;
      let b = prev, bd = prev >= 0 ? M[a * n + prev] : Infinity;
      for (let j = 0; j < n; j++) { if (!active[j] || j === a) continue; const d = M[a * n + j]; if (d < bd) { bd = d; b = j; } }
      if (b === prev) {
        chain.length -= 2;
        const na = size[a], nb = size[b], dab = M[a * n + b];
        raw.push([a, b, dab]);
        // Merge a into b.
        for (let k = 0; k < n; k++) {
          if (!active[k] || k === a || k === b) continue;
          const nk = size[k];
          const v = method === 'ward' ? ((na + nk) * M[a * n + k] + (nb + nk) * M[b * n + k] - nk * dab) / (na + nb + nk) : (na * M[a * n + k] + nb * M[b * n + k]) / (na + nb);
          M[b * n + k] = v; M[k * n + b] = v;
        }
        active[a] = 0; size[b] = na + nb; left--;
        break;
      }
      chain.push(b);
    }
  }
  // Sort merges by height (stable) and relabel with union-find, as scipy does.
  const order = raw.map((r, i) => [r, i]).sort((p, q) => p[0][2] - q[0][2] || p[1] - q[1]).map((p) => p[0]);
  const parent = Array.from({ length: 2 * n - 1 }, (_, i) => i), sz = new Array(2 * n - 1).fill(1);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  return order.map(([a, b, h], t) => {
    const ra = find(a), rb = find(b), id = n + t;
    parent[ra] = id; parent[rb] = id; sz[id] = sz[ra] + sz[rb];
    return [Math.min(ra, rb), Math.max(ra, rb), method === 'ward' ? Math.sqrt(Math.max(0, h)) : h, sz[id]];
  });
}
// Cut a linkage into k clusters (labels 0..k−1 in order of first appearance).
export function cutTree(Z, n, k) {
  const parent = Array.from({ length: 2 * n - 1 }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < n - k; t++) { parent[Z[t][0]] = n + t; parent[Z[t][1]] = n + t; }
  const map = new Map();
  return Array.from({ length: n }, (_, i) => { const r = find(i); if (!map.has(r)) map.set(r, map.size); return map.get(r); });
}

// ── Silhouette (Rousseeuw 1987) ──
// s(i) = (b − a)/max(a, b), with a the mean distance to the rest of i's cluster and b the smallest mean distance to
// another cluster; 0 for a point alone in its cluster. Points labelled −1 (noise) are left out, as are their distances.
export function silhouette(D, n, labels) {
  const keep = []; for (let i = 0; i < n; i++) if (labels[i] >= 0) keep.push(i);
  const ids = [...new Set(keep.map((i) => labels[i]))].sort((a, b) => a - b);
  const pos = new Map(ids.map((c, i) => [c, i]));
  const L = new Int32Array(n).fill(-1); for (const i of keep) L[i] = pos.get(labels[i]);
  const K = ids.length, cnt = new Float64Array(K); for (const i of keep) cnt[L[i]]++;
  const s = new Array(n).fill(NaN);
  if (K < 2) return { mean: NaN, s, byCluster: [] };
  const sums = new Float64Array(K);
  for (const i of keep) {
    sums.fill(0);
    const o = i * n;
    for (let j = 0; j < n; j++) { const l = L[j]; if (l >= 0) sums[l] += D[o + j]; }
    const own = L[i];
    if (cnt[own] <= 1) { s[i] = 0; continue; }
    const a = sums[own] / (cnt[own] - 1);
    let b = Infinity; for (let c = 0; c < K; c++) if (c !== own) b = Math.min(b, sums[c] / cnt[c]);
    s[i] = Math.max(a, b) > 0 ? (b - a) / Math.max(a, b) : 0;
  }
  const vals = keep.map((i) => s[i]);
  return { mean: mean(vals), s, byCluster: ids.map((c) => ({ cluster: c, mean: mean(keep.filter((i) => labels[i] === c).map((i) => s[i])) })) };
}

// ── Adjusted Rand index (Hubert and Arabie 1985) ──
export function ari(a, b) {
  const n = a.length; const c2 = (x) => (x * (x - 1)) / 2;
  const t = new Map(), ra = new Map(), rb = new Map();
  for (let i = 0; i < n; i++) { const key = `${a[i]}|${b[i]}`; t.set(key, (t.get(key) || 0) + 1); ra.set(a[i], (ra.get(a[i]) || 0) + 1); rb.set(b[i], (rb.get(b[i]) || 0) + 1); }
  let sij = 0; for (const v of t.values()) sij += c2(v);
  let sa = 0; for (const v of ra.values()) sa += c2(v);
  let sb = 0; for (const v of rb.values()) sb += c2(v);
  const exp = (sa * sb) / c2(n), max = (sa + sb) / 2;
  return max === exp ? 1 : (sij - exp) / (max - exp);
}

// ── Eigen decomposition of a small symmetric matrix (cyclic Jacobi) ──
export function symEigen(A) {
  const p = A.length, a = A.map((r) => Float64Array.from(r));
  const V = Array.from({ length: p }, (_, i) => { const r = new Float64Array(p); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) off += a[i][j] ** 2;
    if (off < 1e-22) break;
    for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) {
      if (Math.abs(a[i][j]) < 1e-300) continue;
      const th = (a[j][j] - a[i][i]) / (2 * a[i][j]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < p; k++) { const x = a[k][i], y = a[k][j]; a[k][i] = c * x - s * y; a[k][j] = s * x + c * y; }
      for (let k = 0; k < p; k++) { const x = a[i][k], y = a[j][k]; a[i][k] = c * x - s * y; a[j][k] = s * x + c * y; }
      for (let k = 0; k < p; k++) { const x = V[k][i], y = V[k][j]; V[k][i] = c * x - s * y; V[k][j] = s * x + c * y; }
    }
  }
  const idx = Array.from({ length: p }, (_, i) => i).sort((x, y) => a[y][y] - a[x][x]);
  return { values: idx.map((i) => a[i][i]), vectors: idx.map((i) => Float64Array.from(V, (r) => r[i])) };
}
// Fix the sign of a vector so its largest-magnitude entry is positive (makes PCA and MDS output reproducible).
const fixSign = (v) => { let m = 0; for (let i = 1; i < v.length; i++) if (Math.abs(v[i]) > Math.abs(v[m])) m = i; if (v[m] < 0) for (let i = 0; i < v.length; i++) v[i] = -v[i]; return v; };

// ── PCA on a numeric matrix (columns centred) ──
// Eigen decomposition of the covariance matrix; explained variance = eigenvalue (with n − 1), as numpy's SVD gives
// s²/(n − 1). Returns the first two component scores per row.
export function pca(X, dims = 2) {
  const n = X.length, p = X[0].length;
  const mu = new Float64Array(p); for (const x of X) for (let q = 0; q < p; q++) mu[q] += x[q] / n;
  const C = Array.from({ length: p }, () => new Float64Array(p));
  for (const x of X) for (let a = 0; a < p; a++) { const da = x[a] - mu[a]; for (let b = a; b < p; b++) C[a][b] += da * (x[b] - mu[b]); }
  for (let a = 0; a < p; a++) for (let b = a; b < p; b++) { C[a][b] /= n - 1; C[b][a] = C[a][b]; }
  const { values, vectors } = symEigen(C);
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  const comps = vectors.slice(0, dims).map(fixSign);
  const scores = X.map((x) => comps.map((v) => { let s = 0; for (let q = 0; q < p; q++) s += (x[q] - mu[q]) * v[q]; return s; }));
  while (comps.length < dims) { comps.push(new Float64Array(p)); scores.forEach((s) => s.push(0)); }
  return { scores, variance: values, ratio: values.map((v) => (total > 0 ? Math.max(0, v) / total : 0)), components: comps };
}

// ── Classical (Torgerson) MDS ──
// B = −½ J D² J; coordinates are the top eigenvectors of B scaled by √eigenvalue. Uses subspace iteration with
// Rayleigh-Ritz, which handles 2,000 points quickly. Gower distances are not exactly Euclidean, so B can have
// negative eigenvalues; only the largest two positive ones are used.
export function classicalMDS(D, n, dims = 2) {
  const B = new Float64Array(n * n);
  const rowMean = new Float64Array(n); let all = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) { const v = D[i * n + j] ** 2; B[i * n + j] = v; s += v; } rowMean[i] = s / n; all += s; }
  all /= n * n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) B[i * n + j] = -0.5 * (B[i * n + j] - rowMean[i] - rowMean[j] + all);
  let trace = 0; for (let i = 0; i < n; i++) trace += B[i * n + i];
  // Subspace of the largest-magnitude eigenvalues; the largest positive ones are picked from it after Rayleigh-Ritz.
  const m = Math.min(n, dims + 4), rnd = rng(7);
  const mult = (v) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; const o = i * n; for (let j = 0; j < n; j++) s += B[o + j] * v[j]; out[i] = s; } return out; };
  const orth = (vs) => { for (let a = 0; a < vs.length; a++) { for (let b = 0; b < a; b++) { let d = 0; for (let i = 0; i < n; i++) d += vs[a][i] * vs[b][i]; for (let i = 0; i < n; i++) vs[a][i] -= d * vs[b][i]; } let nr = 0; for (let i = 0; i < n; i++) nr += vs[a][i] ** 2; nr = Math.sqrt(nr) || 1; for (let i = 0; i < n; i++) vs[a][i] /= nr; } return vs; };
  let Q = orth(Array.from({ length: m }, () => Float64Array.from({ length: n }, () => rnd() - 0.5)));
  let vals = [], prev = null;
  for (let it = 0; it < 300; it++) {
    const Y = Q.map(mult);
    const T = Q.map((qa) => Y.map((yb) => { let s = 0; for (let i = 0; i < n; i++) s += qa[i] * yb[i]; return s; }));
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) { const v = (T[a][b] + T[b][a]) / 2; T[a][b] = v; T[b][a] = v; }
    const e = symEigen(T);
    vals = e.values;
    if (prev && vals.slice(0, dims).every((v, i) => Math.abs(v - prev[i]) <= 1e-13 * Math.max(1, Math.abs(vals[0])))) {
      Q = e.vectors.map((w) => { const v = new Float64Array(n); for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) v[i] += w[a] * Q[a][i]; return v; });
      break;
    }
    prev = vals.slice(0, dims);
    // Rotate Y into Ritz order, then orthonormalise: the next subspace.
    Q = orth(e.vectors.map((w) => { const v = new Float64Array(n); for (let a = 0; a < m; a++) for (let i = 0; i < n; i++) v[i] += w[a] * Y[a][i]; return v; }));
  }
  const coords = Array.from({ length: n }, () => new Array(dims).fill(0));
  for (let d = 0; d < dims; d++) { const lam = vals[d]; if (!(lam > 0)) continue; const v = fixSign(Q[d]); const s = Math.sqrt(lam); for (let i = 0; i < n; i++) coords[i][d] = v[i] * s; }
  return { coords, eigenvalues: vals.slice(0, dims), trace };
}

// ── Example data: a synthetic product survey with four built-in types of respondent ──
export function exampleSurvey(n = 120, seed = 42) {
  const r = rng(seed);
  const pick = (opts) => { let t = r() * opts.reduce((s, o) => s + o[1], 0); for (const [v, w] of opts) { if ((t -= w) <= 0) return v; } return opts[opts.length - 1][0]; };
  const norm = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const lik = (m) => Math.max(1, Math.min(5, Math.round(m + norm() * 0.75)));
  const ages = ['18–24', '25–34', '35–44', '45–54', '55+'];
  const types = [
    { w: 0.3, age: [0.1, 0.45, 0.35, 0.1, 0], role: [['Analyst', 6], ['Engineer', 4], ['Designer', 1]], hours: [30, 5], tenure: [42, 12], device: [['Laptop', 7], ['Desktop', 3], ['Mobile', 0.5]], lik: [4.0, 4.7, 3.6, 4.8, 4.3] },
    { w: 0.25, age: [0, 0.1, 0.35, 0.35, 0.2], role: [['Manager', 8], ['Analyst', 1], ['Support', 1]], hours: [3.5, 1.5], tenure: [26, 12], device: [['Mobile', 6], ['Tablet', 3], ['Laptop', 2]], lik: [3.2, 2.8, 3.4, 2.0, 3.0] },
    { w: 0.25, age: [0.45, 0.45, 0.1, 0, 0], role: [['Designer', 7], ['Engineer', 2], ['Analyst', 1]], hours: [12, 3], tenure: [5, 3], device: [['Laptop', 6], ['Desktop', 3], ['Mobile', 2]], lik: [2.1, 3.1, 2.4, 4.0, 2.4] },
    { w: 0.2, age: [0.15, 0.35, 0.3, 0.15, 0.05], role: [['Support', 9], ['Manager', 1]], hours: [15, 3], tenure: [18, 6], device: [['Desktop', 9], ['Tablet', 1]], lik: [4.7, 3.6, 4.8, 2.4, 4.0] },
  ];
  const head = ['respondent_id', 'age_band', 'role', 'weekly_hours', 'easy_to_learn', 'saves_me_time', 'trust_the_data', 'want_more_features', 'would_recommend', 'device', 'tenure_months'];
  const lines = [head.join('\t')];
  for (let i = 0; i < n; i++) {
    const t = pick(types.map((ty) => [ty, ty.w]));
    const age = pick(ages.map((a, j) => [a, t.age[j]]));
    const hours = Math.max(0.5, Math.round((t.hours[0] + norm() * t.hours[1]) * 2) / 2);
    const tenure = Math.max(1, Math.round(t.tenure[0] + norm() * t.tenure[1]));
    let device = pick(t.device); let hrs = String(hours);
    if (r() < 0.03) device = ''; if (r() < 0.03) hrs = '';
    lines.push([`R${String(1001 + i)}`, age, pick(t.role), hrs, ...t.lik.map((m) => lik(m)), device, tenure].join('\t'));
  }
  return lines.join('\n');
}

// ── The whole pipeline ──
// opts: { algo: 'pam'|'kproto'|'kmeans'|'dbscan'|'hier', distance: 'gower'|'euclid', scaling: 'z'|'minmax',
// oneHot, linkage: 'ward'|'average', k (number or 'auto'), eps, minPts, seed, gammaScale, maxRows }
export const MAX_ROWS = 2000;
export function setup(prep, opts) {
  const { feats } = prep;
  const hasNom = feats.some((f) => f.type === 'nominal'), hasNum = feats.some((f) => f.type !== 'nominal');
  const euclidUsed = opts.algo === 'kmeans' || (opts.algo === 'hier' && opts.linkage === 'ward') || (opts.algo !== 'kproto' && opts.distance === 'euclid');
  const oneHot = euclidUsed && hasNom && opts.oneHot !== false;
  const num = numericMatrix(feats, opts.scaling, oneHot);
  const numOnly = oneHot ? numericMatrix(feats, opts.scaling, false) : num;
  return { hasNom, hasNum, oneHot, num, numOnly };
}
// Which distance the method works on, and so the silhouette uses.
export function workingDistance(opts, hasNom) {
  if (opts.algo === 'kmeans') return 'euclid';
  if (opts.algo === 'hier') return opts.linkage === 'ward' ? 'euclid' : opts.distance;
  if (opts.algo === 'kproto') return 'gower';
  return opts.distance === 'euclid' ? 'euclid' : 'gower';
}

// Cluster rows `idx` (indices into the prepared rows) with fixed k. Returns labels for those rows plus extras.
export function clusterOnce(prep, ctx, opts, idx, k, Dw, nInit = 10) {
  const { feats } = prep; const { num } = ctx;
  const n = idx.length;
  const X = idx.map((i) => num.X[i]);
  const seed = opts.seed || 1;
  if (opts.algo === 'kmeans') { const r = kmeans(X, k, { seed, nInit }); return { labels: r.labels, cost: r.cost, centers: r.centers }; }
  if (opts.algo === 'kproto') {
    const Xn = idx.map((i) => ctx.numOnly.X[i]);
    const nomF = feats.filter((f) => f.type === 'nominal');
    const Xc = idx.map((i) => nomF.map((f) => f.c[i]));
    const sds = (Xn[0] || []).length ? Array.from(Xn[0], (_, q) => sdOf(Xn.map((r) => r[q]))) : [];
    const g = (sds.length ? mean(sds) : 1) * (opts.gammaScale ?? 1);
    const r = kprototypes(Xn, Xc, k, g, { seed, nInit });
    return { labels: r.labels, cost: r.cost, gamma: g };
  }
  const D = Dw || (workingDistance(opts) === 'euclid' ? euclidMatrix(num.X, idx) : gowerMatrix(feats, idx));
  if (opts.algo === 'pam') { const r = pam(D, n, k); return { labels: r.labels, cost: r.cost, medoids: r.medoids }; }
  if (opts.algo === 'dbscan') { const r = dbscan(D, n, opts.eps, opts.minPts); return { labels: r.labels, cost: NaN, core: r.core }; }
  const Z = hclust(D, n, opts.linkage === 'ward' ? 'ward' : 'average');
  return { labels: cutTree(Z, n, k), Z, cost: NaN };
}

// Within-cluster sum of squares on a numeric matrix, or sum of distances to the medoid on a distance matrix.
function wcss(X, labels) { const g = new Map(); labels.forEach((l, i) => { if (l < 0) return; if (!g.has(l)) g.set(l, []); g.get(l).push(X[i]); }); let s = 0; for (const rows of g.values()) { const p = rows[0].length; const mu = new Float64Array(p); for (const r of rows) for (let q = 0; q < p; q++) mu[q] += r[q] / rows.length; for (const r of rows) s += sq(r, mu); } return s; }
function medoidCost(D, n, labels) { const g = new Map(); labels.forEach((l, i) => { if (l < 0) return; if (!g.has(l)) g.set(l, []); g.get(l).push(i); }); let s = 0; for (const m of g.values()) { let best = Infinity; for (const a of m) { let t = 0; for (const b of m) t += D[a * n + b]; best = Math.min(best, t); } s += best; } return s; }

// Relabel so cluster 0 is the largest; noise stays −1.
export function relabelBySize(labels) {
  const cnt = new Map(); for (const l of labels) if (l >= 0) cnt.set(l, (cnt.get(l) || 0) + 1);
  const order = [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map((e) => e[0]);
  const map = new Map(order.map((c, i) => [c, i]));
  return labels.map((l) => (l < 0 ? -1 : map.get(l)));
}

export function run(prep, opts) {
  const t0 = Date.now();
  const ctx = setup(prep, opts);
  const { feats } = prep; const { num, hasNom } = ctx;
  const N = prep.n;
  const notes = [];
  if (opts.algo === 'kmeans' && hasNom && !ctx.oneHot) notes.push('Nominal columns are left out of k-means.');
  if ((opts.algo === 'kmeans' || opts.algo === 'hier' && opts.linkage === 'ward') && num.p === 0) throw new Error('This method needs at least one continuous or ordinal column (or one-hot encoded nominal columns).');
  if (opts.algo === 'kproto' && !feats.some((f) => f.type !== 'nominal')) throw new Error('k-prototypes needs at least one continuous or ordinal column; use k-medoids on Gower distance for all-nominal data.');
  // Sample above MAX_ROWS (CLARA-style): cluster a random sample, then give every other row its nearest sampled row's cluster.
  const maxRows = opts.maxRows || MAX_ROWS;
  let idx = Array.from({ length: N }, (_, i) => i), sampled = false;
  if (N > maxRows) { idx = shuffle(idx, rng((opts.seed || 1) + 99)).slice(0, maxRows).sort((a, b) => a - b); sampled = true; }
  const n = idx.length;
  const wd = workingDistance(opts, hasNom);
  const needGower = wd === 'gower' || hasNom;
  const G = needGower ? gowerMatrix(feats, idx) : null;
  const E = wd === 'euclid' ? euclidMatrix(num.X, idx) : null;
  const Dw = wd === 'gower' ? G : E;
  const Xs = idx.map((i) => num.X[i]);

  // Choosing k.
  let sweep = [], kd = null, Z = null;
  if (opts.algo === 'dbscan') kd = kDistances(Dw, n, opts.minPts);
  else {
    if (opts.algo === 'hier') Z = hclust(Dw, n, opts.linkage === 'ward' ? 'ward' : 'average');
    for (let k = 2; k <= Math.min(8, n - 1); k++) {
      const r = opts.algo === 'hier' ? { labels: cutTree(Z, n, k) } : clusterOnce(prep, ctx, opts, idx, k, Dw, 5);
      const cost = opts.algo === 'hier' ? (opts.linkage === 'ward' ? wcss(Xs, r.labels) : medoidCost(Dw, n, r.labels)) : r.cost;
      sweep.push({ k, cost, sil: silhouette(Dw, n, r.labels).mean });
    }
  }
  const bestK = sweep.length ? sweep.reduce((a, b) => (b.sil > a.sil + 1e-12 ? b : a)).k : null;
  const k = opts.algo === 'dbscan' ? null : opts.k === 'auto' || !opts.k ? bestK : Math.max(2, Math.min(n - 1, opts.k));
  const eps = opts.algo === 'dbscan' ? (Number.isFinite(opts.eps) && opts.eps > 0 ? opts.eps : kneeEps(kd)) : null;
  const res = opts.algo === 'hier' ? { labels: cutTree(Z, n, k), Z } : clusterOnce(prep, ctx, { ...opts, eps }, idx, k, Dw);
  const map = relabelBySize(res.labels);
  // Map original cluster ids to new for medoids/centers.
  const sil = silhouette(Dw, n, map);

  // Labels for all prepared rows.
  const labels = new Array(N).fill(-1);
  idx.forEach((i, a) => { labels[i] = map[a]; });
  if (sampled) {
    const inSample = new Set(idx);
    for (let i = 0; i < N; i++) {
      if (inSample.has(i)) continue;
      let best = 0, bd = Infinity;
      for (let a = 0; a < n; a++) { const j = idx[a]; const d = wd === 'gower' ? gowerPair(feats, i, j) : Math.sqrt(sq(num.X[i], num.X[j])); if (d < bd) { bd = d; best = a; } }
      labels[i] = map[best];
    }
  }

  // Representative point per cluster: the medoid on the working distance (k-medoids gives it directly).
  const clusters = [...new Set(map.filter((l) => l >= 0))].sort((a, b) => a - b);
  const reps = clusters.map((c) => { const m = []; map.forEach((l, a) => { if (l === c) m.push(a); }); let best = m[0], bt = Infinity; for (const a of m) { let t = 0; for (const b of m) t += Dw[a * n + b]; if (t < bt) { bt = t; best = a; } } return best; });

  // 2D map: PCA when every column is numeric, classical MDS on Gower distance otherwise.
  // Above 1,000 rows the MDS map is drawn for a random 1,000 of them, to keep the page responsive.
  let embed;
  if (!hasNom) { const P = pca(Xs); embed = { kind: 'pca', coords: P.scores, ratio: P.ratio, points: Array.from({ length: n }, (_, a) => a) }; }
  else {
    const pts = n > 1000 ? shuffle(Array.from({ length: n }, (_, a) => a), rng(5)).slice(0, 1000).sort((a, b) => a - b) : Array.from({ length: n }, (_, a) => a);
    const m = pts.length, Gs = m === n ? G : new Float64Array(m * m);
    if (m !== n) for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) Gs[a * m + b] = G[pts[a] * n + pts[b]];
    const M = classicalMDS(Gs, m); embed = { kind: 'mds', coords: M.coords, eigenvalues: M.eigenvalues, points: pts };
  }

  return {
    ms: Date.now() - t0, n, N, sampled, idx, labels, sampleLabels: map, k: k ?? clusters.length, bestK, sweep, kd, eps, minPts: opts.minPts,
    Z: res.Z || Z, sil, wd, clusters, reps, embed, notes, oneHot: ctx.oneHot, gamma: res.gamma, cost: res.cost, D: Dw,
    noise: map.filter((l) => l < 0).length,
  };
}

// Stability: recluster B random 80% subsamples with different seeds and compare each with the full solution on the
// shared rows using the adjusted Rand index.
export function stability(prep, opts, result, B = 10) {
  const ctx = setup(prep, opts);
  const base = result.idx, n = base.length, out = [];
  const rnd = rng((opts.seed || 1) * 7919 + 13);
  const kFix = result.k;
  const DwFull = result.D;
  for (let b = 0; b < B; b++) {
    const pick = shuffle(Array.from({ length: n }, (_, i) => i), rnd).slice(0, Math.max(3, Math.round(n * 0.8))).sort((x, y) => x - y);
    const sub = pick.map((a) => base[a]);
    const D = new Float64Array(pick.length * pick.length);
    for (let a = 0; a < pick.length; a++) for (let c = 0; c < pick.length; c++) D[a * pick.length + c] = DwFull[pick[a] * n + pick[c]];
    const r = clusterOnce(prep, ctx, { ...opts, eps: result.eps, seed: (opts.seed || 1) + b + 1 }, sub, kFix, D, 5);
    out.push(ari(pick.map((a) => result.sampleLabels[a]), r.labels));
  }
  return { values: out, mean: mean(out), min: Math.min(...out) };
}

// ── Profiles: what each cluster looks like next to everyone ──
export function profiles(prep, labels) {
  const { feats } = prep; const N = labels.length;
  const clusters = [...new Set(labels.filter((l) => l >= 0))].sort((a, b) => a - b);
  const all = Array.from({ length: N }, (_, i) => i);
  return clusters.map((c) => {
    const m = all.filter((i) => labels[i] === c);
    const attrs = feats.map((f) => {
      if (f.type === 'continuous') {
        const xs = m.map((i) => f.x[i]), allx = f.x;
        const mc = mean(xs), ma = mean(allx), s = sdOf(allx);
        return { name: f.name, type: f.type, mean: mc, overall: ma, median: median(xs), overallMedian: median(allx), z: s > 0 ? (mc - ma) / s : 0, positive: Math.min(...allx) >= 0 };
      }
      if (f.type === 'ordinal') {
        const pc = m.map((i) => f.pos[i]); const s = sdOf(f.pos);
        const dist = f.levels.map((_, li) => pc.filter((p) => p === li).length / (pc.length || 1));
        const distAll = f.levels.map((_, li) => f.pos.filter((p) => p === li).length / N);
        const medLvl = (ps) => f.levels[Math.round(median(ps) - 1e-9)];
        return { name: f.name, type: f.type, levels: f.levels, dist, distAll, median: medLvl(pc), overallMedian: medLvl(f.pos), mean: mean(pc), overall: mean(f.pos), z: s > 0 ? (mean(pc) - mean(f.pos)) / s : 0 };
      }
      const cats = f.cats.map((cat, k) => {
        const p = m.filter((i) => f.c[i] === k).length / (m.length || 1), q = f.c.filter((v) => v === k).length / N;
        return { cat, share: p, overall: q, lift: q > 0 ? p / q : NaN, z: q > 0 && q < 1 ? (p - q) / Math.sqrt(q * (1 - q)) : 0 };
      }).sort((a, b) => b.share - a.share);
      const top = [...cats].sort((a, b) => b.z - a.z)[0];
      return { name: f.name, type: f.type, cats, top, z: top ? top.z : 0 };
    });
    const apart = attrs.filter((a) => Math.abs(a.z) >= 0.3 && (a.type !== 'nominal' || a.top.z > 0)).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 5).map((a) => ({ ...a, text: describe(a) }));
    return { cluster: c, size: m.length, share: m.length / N, attrs, apart, suggestedName: suggestName(apart), summary: summaryOf(m.length, m.length / N, apart) };
  });
}
const nice = (s) => String(s).replace(/_/g, ' ');
const f1 = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
export function describe(a) {
  if (a.type === 'nominal') return `${Math.round(a.top.share * 100)}% are ${a.top.cat} vs ${Math.round(a.top.overall * 100)}% overall`;
  if (a.type === 'ordinal') {
    if (a.median !== a.overallMedian) return `${a.z > 0 ? 'Higher' : 'Lower'} on ${nice(a.name)} (median ${a.median} vs ${a.overallMedian} overall)`;
    const m = a.levels.indexOf(a.overallMedian), side = (d) => d.reduce((s, v, i) => s + ((a.z > 0 ? i > m : i < m) ? v : 0), 0);
    return `${a.z > 0 ? 'Higher' : 'Lower'} on ${nice(a.name)} (${Math.round(side(a.dist) * 100)}% ${a.z > 0 ? 'above' : 'below'} ${a.overallMedian} vs ${Math.round(side(a.distAll) * 100)}% overall)`;
  }
  const ratio = a.positive && a.overall > 0 ? a.mean / a.overall : NaN;
  if (Number.isFinite(ratio) && ratio >= 1.4) return `${ratio.toFixed(1)}× the average ${nice(a.name)} (${f1(a.mean)} vs ${f1(a.overall)})`;
  if (Number.isFinite(ratio) && ratio <= 0.7 && ratio > 0) return `${ratio < 0.5 ? `Less than half` : `About ${Math.round(ratio * 100)}% of`} the average ${nice(a.name)} (${f1(a.mean)} vs ${f1(a.overall)})`;
  return `${a.z > 0 ? 'Higher' : 'Lower'} ${nice(a.name)} than average (${f1(a.mean)} vs ${f1(a.overall)})`;
}
function suggestName(apart) {
  const parts = apart.slice(0, 2).map((a) => (a.type === 'nominal' ? a.top.cat : `${a.z > 0 ? 'high' : 'low'} ${nice(a.name)}`));
  return parts.length ? parts.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'Typical respondents';
}
function summaryOf(size, share, apart) {
  if (!apart.length) return `${size} respondents (${Math.round(share * 100)}%) who look much like the sample as a whole.`;
  const bits = apart.slice(0, 3).map((a) => {
    if (a.type === 'nominal') return `are mostly ${a.top.cat} (${Math.round(a.top.share * 100)}%)`;
    if (a.type === 'ordinal') return `rate ${nice(a.name)} ${a.z > 0 ? 'higher' : 'lower'} than others`;
    return `have ${a.z > 0 ? 'higher' : 'lower'} ${nice(a.name)} than average`;
  });
  const list = bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}` : bits[0];
  return `${size} respondents (${Math.round(share * 100)}%) who ${list}.`;
}

// ── Exports ──
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCSV(table, used, labels, names) {
  const byRow = new Map(used.map((r, i) => [r, labels[i]]));
  const head = [...table.headers, 'cluster', 'persona'].map(csvCell).join(',');
  const body = table.rows.map((row, r) => {
    const l = byRow.has(r) ? byRow.get(r) : null;
    const cl = l == null ? 'not used' : l < 0 ? 'noise' : String(l + 1);
    const nm = l == null || l < 0 ? '' : names[l] || `Cluster ${l + 1}`;
    return [...row, cl, nm].map(csvCell).join(',');
  });
  return [head, ...body].join('\n');
}
export function toMarkdown(profs, names, meta) {
  const out = [`# Personas from cluster analysis`, '', meta, '', '> Clusters are a starting point. Before treating these as personas, ground each one in qualitative research: interview a few members of each cluster and check the goals, contexts and behaviours behind the numbers.', ''];
  for (const p of profs) {
    out.push(`## ${names[p.cluster] || p.suggestedName}`, '', p.summary, '', '### What sets them apart', '');
    if (p.apart.length) p.apart.forEach((a) => out.push(`- ${a.text}`)); else out.push('- Nothing stands out strongly from the overall sample.');
    out.push('', '### Profile', '', '| Attribute | This cluster | Overall |', '| --- | --- | --- |');
    for (const a of p.attrs) {
      if (a.type === 'continuous') out.push(`| ${a.name} | mean ${f1(a.mean)}, median ${f1(a.median)} | mean ${f1(a.overall)}, median ${f1(a.overallMedian)} |`);
      else if (a.type === 'ordinal') out.push(`| ${a.name} | median ${a.median} | median ${a.overallMedian} |`);
      else out.push(`| ${a.name} | ${a.cats.slice(0, 3).map((c) => `${c.cat} ${Math.round(c.share * 100)}%`).join(', ')} | ${a.cats.slice(0, 3).map((c) => `${c.cat} ${Math.round(c.overall * 100)}%`).join(', ')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}
