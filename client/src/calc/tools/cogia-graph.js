// IA graph analysis: parse an indented sitemap and/or a link list, then compute click depth, breadth per level,
// shortest click paths, orphans and dead ends, betweenness, closeness, PageRank and space-syntax integration, plus a
// tree or force layout. Pure functions. Validated against networkx in server/scripts/check-cogia.js.
import { fmt, pct, sig } from './cogia-core.js';

export const EXAMPLE = `Home
  Shop
    Women
      Dresses
      Shoes
      Sale (women)
    Men
      Shirts
      Shoes (men)
    Gift cards
  Help centre
    Orders
      Track an order
      Change delivery address
      Cancel an order
    Returns
      Start a return
      Refund status
    Account
      Reset password
      Delete account
    Contact us
  About us
    Careers
    Press
  Basket
    Checkout
      Order confirmed
# Cross-links (from -> to)
Basket -> Shop
Checkout -> Basket
Track an order -> Contact us
Refund status -> Start a return
Start a return -> Contact us
Sale (women) -> Shoes
Shoes -> Shoes (men)
Shirts -> Shop
Dresses -> Basket
Shoes -> Basket
Shirts -> Basket
Home -> Basket
Store finder -> Contact us
Accessibility statement -> About us`;

const EDGE = /^\s*(\S.*?)\s*(?:->|→|=>|\t)\s*(\S.*?)\s*$/;
const BULLET = /^[-*•+]\s+|^\d+(\.\d+)*[.)]?\s+/;

// Parses the text into nodes and directed edges. Lines with "->", "→", "=>" or a tab are links (from → to); other
// lines form an indented hierarchy (parent → child). Lines starting with # are comments.
export function parseGraph(text, { upLinks = false, homeLinks = false } = {}) {
  const names = [], index = new Map(), edges = new Map(), problems = [];
  const id = (raw) => {
    const name = raw.trim().replace(BULLET, '').trim();
    const key = name.toLowerCase();
    if (!index.has(key)) { index.set(key, names.length); names.push(name); }
    return index.get(key);
  };
  const add = (a, b, kind) => { if (a === b) return; const k = `${a}>${b}`; if (!edges.has(k)) edges.set(k, { from: a, to: b, kind }); };
  const stack = []; let treeLines = 0, linkLines = 0;
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((line, ln) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const m = line.match(EDGE);
    if (m) { add(id(m[1]), id(m[2]), 'link'); linkLines++; return; }
    if (/->|→|=>/.test(line)) { problems.push(`Line ${ln + 1} looks like a link but one end is empty.`); return; }
    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    const node = id(line);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1].node;
      add(parent, node, 'tree');
      if (upLinks) add(node, parent, 'up');
    }
    stack.push({ indent, node }); treeLines++;
  });
  if (homeLinks && names.length) for (let i = 1; i < names.length; i++) add(i, 0, 'home');
  return { names, edges: [...edges.values()], treeLines, linkLines, problems };
}

export function adjacency(n, edges) {
  const out = Array.from({ length: n }, () => []), inn = Array.from({ length: n }, () => []);
  for (const e of edges) { out[e.from].push(e.to); inn[e.to].push(e.from); }
  return { out, inn };
}
// Breadth-first search: distances (Infinity if unreachable) and the first-found parent of each node.
export function bfs(adj, s) {
  const n = adj.length, dist = new Array(n).fill(Infinity), parent = new Array(n).fill(-1), order = [s];
  dist[s] = 0;
  for (let h = 0; h < order.length; h++) { const v = order[h]; for (const w of adj[v]) if (dist[w] === Infinity) { dist[w] = dist[v] + 1; parent[w] = v; order.push(w); } }
  return { dist, parent, order };
}
export function pathTo(parent, t) { const p = []; for (let v = t; v >= 0; v = parent[v]) p.unshift(v); return p; }

// Brandes (2001) betweenness on the directed, unweighted graph; normalised like networkx: 1/((n − 1)(n − 2)).
export function betweenness(adj, normalized = true) {
  const n = adj.length, cb = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const S = [], P = Array.from({ length: n }, () => []), sigma = new Array(n).fill(0), d = new Array(n).fill(-1);
    sigma[s] = 1; d[s] = 0; const Q = [s];
    for (let h = 0; h < Q.length; h++) {
      const v = Q[h]; S.push(v);
      for (const w of adj[v]) {
        if (d[w] < 0) { Q.push(w); d[w] = d[v] + 1; }
        if (d[w] === d[v] + 1) { sigma[w] += sigma[v]; P[w].push(v); }
      }
    }
    const delta = new Array(n).fill(0);
    while (S.length) { const w = S.pop(); for (const v of P[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]); if (w !== s) cb[w] += delta[w]; }
  }
  const scale = normalized && n > 2 ? 1 / ((n - 1) * (n - 2)) : 1;
  return cb.map((v) => v * scale);
}
// Out-closeness: how few clicks it takes to reach everything reachable from a page, with the Wasserman-Faust
// correction for pages that cannot reach everything: ((r − 1)/(n − 1)) · ((r − 1)/Σ d), r = pages reachable incl. itself.
// (networkx's closeness_centrality on the reversed graph.)
export function closenessOut(adj) {
  const n = adj.length;
  return adj.map((_, s) => {
    const { dist } = bfs(adj, s); let tot = 0, r = 0;
    for (const d of dist) if (Number.isFinite(d)) { tot += d; r++; }
    return tot > 0 && n > 1 ? ((r - 1) / tot) * ((r - 1) / (n - 1)) : 0;
  });
}
// PageRank (Brin and Page 1998) by power iteration, damping 0.85; pages with no links out share their rank evenly
// (networkx's default treatment of dangling nodes).
export function pagerank(adj, alpha = 0.85, tol = 1e-13) {
  const n = adj.length; if (!n) return [];
  let x = new Array(n).fill(1 / n);
  for (let it = 0; it < 1000; it++) {
    const nx = new Array(n).fill(0); let dangle = 0;
    for (let v = 0; v < n; v++) { if (!adj[v].length) dangle += x[v]; else for (const w of adj[v]) nx[w] += (alpha * x[v]) / adj[v].length; }
    let err = 0;
    for (let v = 0; v < n; v++) { nx[v] += (alpha * dangle) / n + (1 - alpha) / n; err += Math.abs(nx[v] - x[v]); }
    x = nx;
    if (err < n * tol) break;
  }
  return x;
}
// Space-syntax integration (Hillier and Hanson 1984) on the undirected graph, within each page's connected
// component of k pages: mean depth MD = Σ d / (k − 1); relative asymmetry RA = 2(MD − 1)/(k − 2); real relative
// asymmetry RRA = RA / D_k with the diamond value D_k = 2{k[log₂((k + 2)/3) − 1] + 1}/((k − 1)(k − 2)); integration = 1/RRA.
export const diamond = (k) => (2 * (k * (Math.log2((k + 2) / 3) - 1) + 1)) / ((k - 1) * (k - 2));
export function spaceSyntax(n, edges) {
  const und = Array.from({ length: n }, () => new Set());
  for (const e of edges) { und[e.from].add(e.to); und[e.to].add(e.from); }
  const adj = und.map((s) => [...s]);
  return adj.map((_, s) => {
    const { dist } = bfs(adj, s); let tot = 0, k = 0;
    for (const d of dist) if (Number.isFinite(d)) { tot += d; k++; }
    if (k < 3) return { k, md: k === 2 ? 1 : NaN, ra: NaN, rra: NaN, integration: NaN };
    const md = tot / (k - 1), ra = (2 * (md - 1)) / (k - 2), rra = ra / diamond(k);
    return { k, md, ra, rra, integration: rra > 0 ? 1 / rra : Infinity };
  });
}

// The full analysis.
export function analyseGraph(g, home = 0) {
  const n = g.names.length;
  if (n < 2) return { error: 'Enter at least two pages.' };
  if (!g.edges.length) return { error: 'No links found. Indent child pages under their parent, or write links as "From -> To".' };
  const { out, inn } = adjacency(n, g.edges);
  const b = bfs(out, home);
  const depths = b.dist.filter(Number.isFinite);
  const maxDepth = Math.max(...depths);
  const levels = Array.from({ length: maxDepth + 1 }, (_, d) => b.dist.filter((x) => x === d).length);
  const unreachable = b.dist.map((d, i) => (Number.isFinite(d) ? -1 : i)).filter((i) => i >= 0);
  const orphans = inn.map((l, i) => (l.length === 0 && i !== home ? i : -1)).filter((i) => i >= 0);
  const deadEnds = out.map((l, i) => (l.length === 0 ? i : -1)).filter((i) => i >= 0);
  const bet = betweenness(out), clo = closenessOut(out), pr = pagerank(out), ss = spaceSyntax(n, g.edges);
  const reach = depths.length;
  const meanDepth = reach > 1 ? depths.reduce((a, c) => a + c, 0) / (reach - 1) : 0;
  const parents = out.filter((l) => l.length > 0);
  const meanBreadth = parents.length ? parents.reduce((a, l) => a + l.length, 0) / parents.length : 0;
  const pages = g.names.map((name, i) => ({
    i, name, depth: b.dist[i], path: Number.isFinite(b.dist[i]) ? pathTo(b.parent, i) : [],
    outDeg: out[i].length, inDeg: inn[i].length, betweenness: bet[i], closeness: clo[i], pagerank: pr[i],
    md: ss[i].md, rra: ss[i].rra, integration: ss[i].integration,
    orphan: orphans.includes(i), deadEnd: deadEnds.includes(i), unreachable: !Number.isFinite(b.dist[i]),
  }));
  const ssHome = ss[home];
  const intVals = pages.filter((p) => Number.isFinite(p.integration)).map((p) => p.integration);
  return {
    n, nEdges: g.edges.length, home, out, inn, levels, maxDepth, meanDepth, meanBreadth, maxBreadth: Math.max(...out.map((l) => l.length)),
    unreachable, orphans, deadEnds, pages, bfsParent: b.parent, reach,
    meanIntegration: intVals.length ? intVals.reduce((a, c) => a + c, 0) / intVals.length : NaN, homeIntegration: ssHome.integration,
    density: g.edges.length / (n * (n - 1)),
  };
}

// ── Layouts ──
// Tree: the breadth-first tree from home, laid out left to right (depth → x, leaf order → y), parents centred on
// their children. Pages that cannot be reached from home are listed in an extra column on the right.
export function treeLayout(r, { colW = 168, rowH = 24 } = {}) {
  const n = r.n, kids = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (r.bfsParent[i] >= 0) kids[r.bfsParent[i]].push(i);
  const pos = new Array(n); let row = 0;
  const place = (v) => {
    if (!kids[v].length) { pos[v] = { x: r.pages[v].depth * colW, y: row++ * rowH }; return pos[v].y; }
    const ys = kids[v].map(place);
    pos[v] = { x: r.pages[v].depth * colW, y: (ys[0] + ys[ys.length - 1]) / 2 }; return pos[v].y;
  };
  place(r.home);
  r.unreachable.forEach((v, j) => { pos[v] = { x: (r.maxDepth + 1) * colW, y: j * rowH }; });
  const H = Math.max(row, r.unreachable.length) * rowH;
  return { pos, width: (r.maxDepth + (r.unreachable.length ? 2 : 1)) * colW, height: H };
}
// Force-directed (Fruchterman and Reingold 1991) on the undirected graph, deterministic start on a circle in input
// order, 400 iterations with a cooling schedule.
export function forceLayout(r, { W = 760, H = 560, iters = 400 } = {}) {
  const n = r.n, area = W * H, k = Math.sqrt(area / n) * 0.9;
  const pos = Array.from({ length: n }, (_, i) => ({ x: W / 2 + (W / 3) * Math.cos((2 * Math.PI * i) / n), y: H / 2 + (H / 3) * Math.sin((2 * Math.PI * i) / n) }));
  const und = new Set(); for (let v = 0; v < n; v++) for (const w of r.out[v]) und.add(v < w ? `${v},${w}` : `${w},${v}`);
  const E = [...und].map((s) => s.split(',').map(Number));
  let t = W / 8;
  for (let it = 0; it < iters; it++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; let d = Math.hypot(dx, dy);
      if (d < 0.01) { dx = 0.01 * (i - j); dy = 0.01; d = Math.hypot(dx, dy); }
      const f = (k * k) / d; disp[i].x += (dx / d) * f; disp[i].y += (dy / d) * f; disp[j].x -= (dx / d) * f; disp[j].y -= (dy / d) * f;
    }
    for (const [a, b] of E) {
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y, d = Math.max(0.01, Math.hypot(dx, dy)), f = (d * d) / k;
      disp[a].x -= (dx / d) * f; disp[a].y -= (dy / d) * f; disp[b].x += (dx / d) * f; disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // A weak pull to the centre keeps disconnected pages on the canvas.
      disp[i].x += (W / 2 - pos[i].x) * 0.02 * k / 10; disp[i].y += (H / 2 - pos[i].y) * 0.02 * k / 10;
      const d = Math.hypot(disp[i].x, disp[i].y) || 1;
      pos[i].x = Math.min(W - 20, Math.max(20, pos[i].x + (disp[i].x / d) * Math.min(d, t)));
      pos[i].y = Math.min(H - 20, Math.max(20, pos[i].y + (disp[i].y / d) * Math.min(d, t)));
    }
    t = Math.max(0.5, t * 0.985);
  }
  return { pos, width: W, height: H };
}

export function pagesCsv(r) {
  const head = ['page', 'clicks_from_home', 'click_path', 'links_in', 'links_out', 'betweenness', 'closeness_out', 'pagerank', 'mean_depth', 'rra', 'integration', 'orphan', 'dead_end', 'unreachable'];
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [head.join(','), ...r.pages.map((p) => [q(p.name), Number.isFinite(p.depth) ? p.depth : '', q(p.path.map((i) => r.pages[i].name).join(' > ')), p.inDeg, p.outDeg, p.betweenness.toFixed(6), p.closeness.toFixed(6), p.pagerank.toFixed(6), fmt(p.md, 4), fmt(p.rra, 4), fmt(p.integration, 4), p.orphan ? 1 : 0, p.deadEnd ? 1 : 0, p.unreachable ? 1 : 0].join(','))].join('\n');
}

// Plain-language summary.
// Confidence rule (how much the structure alone can tell you): high when every page is reachable from home and the
// graph has at least 15 pages; medium when at most 10% of pages are unreachable; low otherwise (the map is incomplete
// or broken, so path lengths and centralities describe the input more than the real site). Structural measures are
// exact for the graph entered; they are not evidence about what users do.
export function graphSummary(r) {
  const P = r.pages, name = (i) => P[i].name;
  const hub = [...P].sort((a, b) => b.betweenness - a.betweenness)[0];
  const top = [...P].sort((a, b) => b.pagerank - a.pagerank).slice(0, 3).map((p) => p.name);
  const deepest = P.filter((p) => p.depth === r.maxDepth).map((p) => p.name);
  const unreachShare = r.unreachable.length / r.n;
  const conf = !r.unreachable.length && r.n >= 15 ? 'high' : unreachShare <= 0.1 ? 'medium' : 'low';
  const list = (ix, k = 4) => (ix.length > k ? `${ix.slice(0, k).map(name).join(', ')} and ${ix.length - k} more` : ix.map(name).join(', '));
  const meaning = [
    `Pages per level from home: ${r.levels.map((c, d) => `${c} at ${d} click${d === 1 ? '' : 's'}`).join(', ')}. The average page is ${fmt(r.meanDepth, 2)} clicks from home and the deepest (${deepest.slice(0, 3).join(', ')}${deepest.length > 3 ? '…' : ''}) ${r.maxDepth === 1 ? 'is' : 'are'} ${r.maxDepth} clicks away.`,
    `${hub.name} is the main bottleneck: on average ${pct(hub.betweenness, 0)} of the shortest routes between pairs of other pages pass through it (betweenness). The pages that collect most link importance (PageRank) are ${top.join(', ')}.`,
    r.unreachable.length ? `${r.unreachable.length} page${r.unreachable.length === 1 ? ' cannot' : 's cannot'} be reached from ${name(r.home)} by clicking: ${list(r.unreachable)}.` : `Every page can be reached from ${name(r.home)}.`,
    r.orphans.length ? `${r.orphans.length} orphan page${r.orphans.length === 1 ? ' has' : 's have'} no links pointing to ${r.orphans.length === 1 ? 'it' : 'them'}: ${list(r.orphans)}.` : 'There are no orphan pages (every page except home has a link pointing to it).',
    r.deadEnds.length ? `${r.deadEnds.length} dead end${r.deadEnds.length === 1 ? '' : 's'} (no links out): ${list(r.deadEnds)}. Users there must use the back button or global navigation.` : 'No page is a dead end.',
  ];
  return {
    headline: `${r.n} pages and ${r.nEdges} links: the average page is ${fmt(r.meanDepth, 1)} clicks from ${name(r.home)}, ${r.unreachable.length ? `${r.unreachable.length} cannot be reached` : 'all can be reached'}, and ${r.deadEnds.length} ${r.deadEnds.length === 1 ? 'is a dead end' : 'are dead ends'}.`,
    meaning,
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong when every page can be reached from home and the map has at least 15 pages; some evidence when at most 10% of pages are unreachable; weak otherwise, because a broken or partial map makes depth and centrality describe the input more than the site. Here ${r.unreachable.length} of ${r.n} pages are unreachable. The numbers are exact for the graph you entered but say nothing about what users actually do.`,
    caveats: [
      'Click depth is not difficulty. Porter (2003) found no rise in drop-off after three clicks; clear labels matter more than the number of clicks.',
      'The map only knows the links you enter. Global navigation, search and footers usually shorten real paths a lot: add them (or tick "every page links to home") before judging depth.',
    ],
    next: [
      r.unreachable.length || r.orphans.length ? 'Link the orphan and unreachable pages from a sensible parent, or remove them.' : 'Check the bottleneck pages: if a hub fails or is mislabelled, many paths fail with it.',
      'Test the labels on the main paths with a [tree test](/calculators/tree-test) before changing the structure.',
      'Compare structural importance (PageRank, betweenness) with what users need most (top tasks) and promote the gaps.',
    ],
    report: `IA graph of ${r.n} pages and ${r.nEdges} links: mean click depth ${fmt(r.meanDepth, 2)} (max ${r.maxDepth}), ${r.unreachable.length} unreachable, ${r.orphans.length} orphan and ${r.deadEnds.length} dead-end pages; highest betweenness ${hub.name} (${sig(hub.betweenness, 3)})${Number.isFinite(r.meanIntegration) ? `; mean integration ${fmt(r.meanIntegration, 2)}` : ''}.`,
  };
}
