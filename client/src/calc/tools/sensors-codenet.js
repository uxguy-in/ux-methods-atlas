// Code co-occurrence networks from coded qualitative segments: counts, Jaccard (the c-coefficient of ATLAS.ti),
// Ochiai (cosine) and lift, a hypergeometric test for co-occurring more than chance, Louvain clusters and a
// force-directed layout. Pure functions.
import { lines, rng, fmt, pctS, plural } from './sensors-core.js';
import { lgamma } from '../stats.js';

// One segment per line: "segment id: code, code, code" (without a colon, the whole line is codes). Codes are matched
// ignoring case and extra spaces; the first spelling is kept.
export function parseSegments(text) {
  const segs = [], labels = new Map();
  lines(text).forEach((l, i) => {
    const k = l.indexOf(':');
    const id = k >= 0 ? l.slice(0, k).trim() : `Segment ${i + 1}`;
    const list = (k >= 0 ? l.slice(k + 1) : l).split(/[,;|]/).map((c) => c.trim().replace(/\s+/g, ' ')).filter(Boolean);
    const set = [];
    for (const c of list) { const key = c.toLowerCase(); if (!labels.has(key)) labels.set(key, c); if (!set.includes(key)) set.push(key); }
    if (set.length) segs.push({ id, codes: set });
  });
  const keys = [...labels.keys()];
  return { segs, codes: keys.map((k) => labels.get(k)), keys };
}

const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
// P(X ≥ c) for X ~ Hypergeometric(N segments, a with code 1, b drawn with code 2).
export function hyperSf(c, N, a, b) {
  const hi = Math.min(a, b); let p = 0;
  for (let k = c; k <= hi; k++) p += Math.exp(lchoose(a, k) + lchoose(N - a, b - k) - lchoose(N, b));
  return Math.min(1, p);
}

export function cooccurrence(parsed) {
  const { segs, keys } = parsed, K = keys.length, N = segs.length, idx = new Map(keys.map((k, i) => [k, i]));
  const freq = new Array(K).fill(0), C = Array.from({ length: K }, () => new Array(K).fill(0));
  for (const s of segs) {
    const ii = s.codes.map((c) => idx.get(c));
    for (const a of ii) freq[a]++;
    for (let x = 0; x < ii.length; x++) for (let y = x + 1; y < ii.length; y++) { C[ii[x]][ii[y]]++; C[ii[y]][ii[x]]++; }
  }
  const pairs = [];
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) {
    const c = C[i][j]; if (!c) continue;
    const a = freq[i], b = freq[j], expected = (a * b) / N;
    pairs.push({ i, j, c, jaccard: c / (a + b - c), ochiai: c / Math.sqrt(a * b), lift: c / expected, expected, p: hyperSf(c, N, a, b) });
  }
  return { N, K, freq, C, pairs, multi: segs.filter((s) => s.codes.length > 1).length };
}

// Weighted modularity Q = Σ_c [W_c/m − (S_c/2m)²], W_c the weight inside cluster c, S_c its total strength, m the total weight.
export function modularity(n, edges, comm) {
  const m = edges.reduce((s, e) => s + e.w, 0); if (!m) return 0;
  const inW = {}, deg = {};
  for (const e of edges) {
    deg[comm[e.a]] = (deg[comm[e.a]] || 0) + e.w; deg[comm[e.b]] = (deg[comm[e.b]] || 0) + e.w;
    if (comm[e.a] === comm[e.b]) inW[comm[e.a]] = (inW[comm[e.a]] || 0) + e.w;
  }
  return Object.keys(deg).reduce((q, c) => q + (inW[c] || 0) / m - (deg[c] / (2 * m)) ** 2, 0);
}

// Louvain method (Blondel et al. 2008): move nodes (in index order) to the neighbouring cluster with the largest
// modularity gain until nothing moves, merge clusters into single nodes and repeat.
export function louvain(n, edges) {
  let comm = Array.from({ length: n }, (_, i) => i);
  let nodes = n, E = edges.map((e) => ({ ...e }));
  const memberOf = Array.from({ length: n }, (_, i) => i); // original node → current super-node
  for (let level = 0; level < 20; level++) {
    const adj = Array.from({ length: nodes }, () => new Map()); const k = new Array(nodes).fill(0); let m2 = 0;
    for (const e of E) {
      adj[e.a].set(e.b, (adj[e.a].get(e.b) || 0) + e.w); if (e.a !== e.b) adj[e.b].set(e.a, (adj[e.b].get(e.a) || 0) + e.w);
      k[e.a] += e.w; k[e.b] += e.w; m2 += 2 * e.w;
    }
    if (!m2) break;
    const c = Array.from({ length: nodes }, (_, i) => i), tot = [...k];
    let moved = false, improved = true;
    for (let pass = 0; improved && pass < 100; pass++) {
      improved = false;
      for (let v = 0; v < nodes; v++) {
        const cv = c[v], wTo = new Map();
        for (const [u, w] of adj[v]) if (u !== v) wTo.set(c[u], (wTo.get(c[u]) || 0) + w);
        tot[cv] -= k[v];
        let best = cv, bestGain = (wTo.get(cv) || 0) - (tot[cv] * k[v]) / m2;
        for (const [cc, w] of wTo) { const g = w - (tot[cc] * k[v]) / m2; if (g > bestGain + 1e-12) { best = cc; bestGain = g; } }
        tot[best] += k[v]; c[v] = best;
        if (best !== cv) { improved = true; moved = true; }
      }
    }
    if (!moved) break;
    const ids = [...new Set(c)], ren = new Map(ids.map((x, i) => [x, i]));
    for (let i = 0; i < n; i++) memberOf[i] = ren.get(c[memberOf[i]]);
    const agg = new Map();
    for (const e of E) { const a = ren.get(c[e.a]), b = ren.get(c[e.b]); const key = a <= b ? `${a},${b}` : `${b},${a}`; agg.set(key, (agg.get(key) || 0) + e.w); }
    E = [...agg].map(([key, w]) => { const [a, b] = key.split(',').map(Number); return { a, b, w }; });
    nodes = ids.length;
  }
  comm = [...memberOf];
  // Number clusters by size (largest first), isolated codes last.
  const size = {}; comm.forEach((x) => { size[x] = (size[x] || 0) + 1; });
  const order = Object.keys(size).map(Number).sort((a, b) => size[b] - size[a] || a - b), ren = new Map(order.map((x, i) => [x, i]));
  return comm.map((x) => ren.get(x));
}

// Fruchterman-Reingold layout in a unit square, started from a circle; seeded jitter so it is repeatable.
export function layout(n, edges, iters = 400) {
  const u = rng(7), pos = Array.from({ length: n }, (_, i) => [0.5 + 0.35 * Math.cos((2 * Math.PI * i) / n) + 0.01 * u(), 0.5 + 0.35 * Math.sin((2 * Math.PI * i) / n) + 0.01 * u()]);
  if (n < 2) return pos.map(() => [0.5, 0.5]);
  const k = Math.sqrt(1 / n), maxW = Math.max(...edges.map((e) => e.w), 1e-9);
  for (let it = 0; it < iters; it++) {
    const t = 0.1 * (1 - it / iters) + 0.002, disp = pos.map(() => [0, 0]);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1], d = Math.max(1e-4, Math.hypot(dx, dy)), f = (k * k) / d;
      disp[a][0] += (dx / d) * f; disp[a][1] += (dy / d) * f; disp[b][0] -= (dx / d) * f; disp[b][1] -= (dy / d) * f;
    }
    for (const e of edges) {
      const dx = pos[e.a][0] - pos[e.b][0], dy = pos[e.a][1] - pos[e.b][1], d = Math.max(1e-4, Math.hypot(dx, dy)), f = ((d * d) / k) * (0.3 + e.w / maxW);
      disp[e.a][0] -= (dx / d) * f; disp[e.a][1] -= (dy / d) * f; disp[e.b][0] += (dx / d) * f; disp[e.b][1] += (dy / d) * f;
    }
    for (let a = 0; a < n; a++) {
      // weak pull to the centre keeps unconnected codes on screen
      disp[a][0] += (0.5 - pos[a][0]) * 0.5; disp[a][1] += (0.5 - pos[a][1]) * 0.5;
      const d = Math.max(1e-9, Math.hypot(disp[a][0], disp[a][1])), s = Math.min(d, t) / d;
      pos[a][0] += disp[a][0] * s; pos[a][1] += disp[a][1] * s;
    }
  }
  const xs = pos.map((p) => p[0]), ys = pos.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pos.map(([x, y]) => [(x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1)]);
}

export const MEASURES = { jaccard: 'Jaccard (c-coefficient)', ochiai: 'Ochiai (cosine)', count: 'Count', lift: 'Lift' };
export function network(co, measure = 'jaccard', minCount = 2) {
  const val = (p) => (measure === 'count' ? p.c : p[measure]);
  const kept = co.pairs.filter((p) => p.c >= minCount);
  const edges = kept.map((p) => ({ a: p.i, b: p.j, w: val(p), c: p.c }));
  const comm = louvain(co.K, edges);
  const Q = modularity(co.K, edges, comm);
  const pos = layout(co.K, edges);
  const degree = new Array(co.K).fill(0), strength = new Array(co.K).fill(0);
  for (const e of edges) { degree[e.a]++; degree[e.b]++; strength[e.a] += e.w; strength[e.b] += e.w; }
  const clusters = [...new Set(comm)].sort((a, b) => a - b).map((c) => ({ c, members: comm.map((x, i) => (x === c ? i : -1)).filter((i) => i >= 0) }));
  return { edges, comm, Q, pos, degree, strength, clusters, measure };
}

// ── Reading your results ──
// Confidence rule: high with at least 50 coded segments and the top pair co-occurring in at least 5 segments with a
// hypergeometric p below 0.01; medium with at least 20 segments and the top pair in at least 3 segments; low
// otherwise. With fewer segments, single coding decisions decide which links appear.
export function codenetConfidence(co, top) {
  if (co.N >= 50 && top && top.c >= 5 && top.p < 0.01) return 'high';
  if (co.N >= 20 && top && top.c >= 3) return 'medium';
  return 'low';
}
export function codenetSummary(co, net, codes) {
  const byM = [...co.pairs].filter((p) => p.c >= 2).sort((a, b) => (net.measure === 'count' ? b.c - a.c : (b[net.measure] - a[net.measure]) || b.c - a.c));
  const top = byM[0] || [...co.pairs].sort((a, b) => b.c - a.c)[0];
  const sig = co.pairs.filter((p) => p.p < 0.05 && p.c >= 2).length;
  const big = net.clusters.filter((c) => c.members.length > 1);
  const hub = net.strength.indexOf(Math.max(...net.strength));
  const name = (p) => `"${codes[p.i]}" and "${codes[p.j]}"`;
  return {
    headline: top ? `${name(top)} go together most: ${plural(top.c, 'segment')} share both codes (Jaccard ${fmt(top.jaccard, 2)}).` : 'No two codes were applied to the same segment.',
    meaning: [
      top ? `${name(top)} appear together ${fmt(top.lift, 1)} times as often as if codes were applied independently (one-sided hypergeometric p ${top.p < 0.001 ? '< 0.001' : `= ${fmt(top.p, 3)}`}).` : 'Code segments more finely, or apply several codes per segment, to see links.',
      `${plural(sig, 'pair')} co-occur more than chance at p < 0.05 (not corrected for the ${co.pairs.length} pairs tested, so expect some false alarms).`,
      big.length ? `The network splits into ${plural(big.length, 'cluster')} (modularity ${fmt(net.Q, 2)}): ${big.slice(0, 3).map((c) => c.members.slice(0, 4).map((i) => codes[i]).join(', ')).join(' | ')}.` : 'No clusters: too few links above the minimum count.',
      net.strength[hub] > 0 ? `"${codes[hub]}" is the most connected code (${plural(net.degree[hub], 'link')}); a code linked to everything may be too broad to be useful.` : null,
    ].filter(Boolean),
    confidence: codenetConfidence(co, top),
    confidenceNote: `High needs at least 50 coded segments with the top pair in at least 5 of them at p < 0.01; medium at least 20 segments and 3 for the top pair. Here: ${co.N} segments, top pair in ${top ? top.c : 0}.`,
    caveats: [
      'Co-occurrence depends on how long segments are: longer segments collect more codes and more links. Keep segmenting consistent.',
      'A link means the codes were applied together, not that one causes the other; read the segments behind each strong link.',
      'Clusters from community detection are one partition among several near-equal ones; treat them as prompts for themes, not as themes.',
    ],
    next: [
      'Open the segments behind the top pairs and write a memo on what connects them.',
      'Check how evenly the codes are used with the [Shannon information](/calculators/shannon-information) calculator.',
    ],
    report: top ? `Across ${co.N} coded segments and ${co.K} codes, ${name(top).replace(/"/g, '')} co-occurred most (${top.c} segments, Jaccard ${fmt(top.jaccard, 2)}, lift ${fmt(top.lift, 1)}); community detection found ${plural(big.length, 'cluster')} (modularity ${fmt(net.Q, 2)}).` : `Across ${co.N} coded segments no codes co-occurred.`,
  };
}
export { pctS };
