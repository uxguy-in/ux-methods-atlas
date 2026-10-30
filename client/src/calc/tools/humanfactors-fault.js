// Fault tree analysis: parse an indented outline of AND, OR and k-of-n gates over basic events, build a binary
// decision diagram (BDD) for the exact top-event probability, find minimal cut sets by MOCUS, and compute Birnbaum,
// criticality, Fussell-Vesely, RAW and RRW importance. Pure functions (no React), shared by the page and
// server/scripts/check-humanfactors.js.
import { sig, fmtP } from './humanfactors-core.js';

// ── Parsing ──
// Gate line:   Label [AND] | [OR] | [2/3] | [2 of 3]
// Event line:  Label: 0.003   (or Label: p=0.003, Label = 3e-3). Writing an event's label again, with or without its
//              probability, re-uses the same basic event (a shared or "repeated" event).
// Lines starting with # are comments. Children are indented under their gate.
export function parseFaultTree(text) {
  const errors = [];
  const raw = String(text || '').split(/\r?\n/);
  const lines = [];
  raw.forEach((l, i) => {
    const t = l.replace(/\t/g, '  ');
    if (!t.trim() || t.trim().startsWith('#')) return;
    lines.push({ indent: t.length - t.trimStart().length, body: t.trim(), line: i + 1 });
  });
  if (!lines.length) return { errors: ['Write at least a top event with two basic events under it.'] };
  const events = [], byName = new Map();
  const nodes = [];
  const stack = []; // { indent, node }
  let root = null;
  for (const ln of lines) {
    let node;
    const g = /^(.*?)\s*\[\s*(and|or|(\d+)\s*(?:\/|of)\s*(\d+)?)\s*\]\s*$/i.exec(ln.body);
    if (g) {
      const label = g[1].trim() || `Gate ${nodes.length + 1}`;
      const op = g[3] ? 'kofn' : g[2].toLowerCase();
      node = { type: 'gate', op, k: g[3] ? Number(g[3]) : null, nDeclared: g[4] ? Number(g[4]) : null, label, children: [], line: ln.line };
    } else {
      const m = /^(.*?)\s*(?::|=)\s*(?:p\s*=\s*)?([0-9.]+(?:e[-+]?\d+)?)\s*$/i.exec(ln.body);
      const label = (m ? m[1] : ln.body).trim();
      const key = label.toLowerCase();
      let idx = byName.get(key);
      if (m) {
        const p = Number(m[2]);
        if (!(p >= 0 && p <= 1)) errors.push(`Line ${ln.line}: probability ${m[2]} must be between 0 and 1.`);
        if (idx === undefined) { idx = events.length; events.push({ name: label, p, line: ln.line, uses: 0 }); byName.set(key, idx); }
        else if (Math.abs(events[idx].p - p) > 1e-15) errors.push(`Line ${ln.line}: "${label}" was already given probability ${events[idx].p}; a shared event must have one probability.`);
      } else if (idx === undefined) {
        errors.push(`Line ${ln.line}: "${label}" needs a gate in brackets ([AND], [OR], [2/3]) or a probability (Label: 0.01).`);
        continue;
      }
      events[idx].uses++;
      node = { type: 'event', idx, label: events[idx].name, children: [], line: ln.line };
    }
    while (stack.length && stack[stack.length - 1].indent >= ln.indent) stack.pop();
    if (!stack.length) {
      if (root) { errors.push(`Line ${ln.line}: only one top event is allowed; indent "${node.label}" under a gate.`); continue; }
      root = node;
    } else {
      const parent = stack[stack.length - 1].node;
      if (parent.type !== 'gate') { errors.push(`Line ${ln.line}: "${parent.label}" is a basic event, so nothing can sit under it. Give it a gate or outdent this line.`); continue; }
      parent.children.push(node);
    }
    nodes.push(node);
    stack.push({ indent: ln.indent, node });
  }
  if (!root) return { errors: errors.length ? errors : ['No top event found.'] };
  if (root.type !== 'gate') errors.push('The top event must be a gate ([AND], [OR] or [k/n]) with basic events under it.');
  for (const n of nodes) {
    if (n.type !== 'gate') continue;
    if (!n.children.length) errors.push(`Line ${n.line}: gate "${n.label}" has nothing under it.`);
    if (n.op === 'kofn') {
      if (n.nDeclared !== null && n.nDeclared !== n.children.length) errors.push(`Line ${n.line}: "${n.label}" says ${n.k} of ${n.nDeclared} but has ${n.children.length} inputs.`);
      if (!(n.k >= 1 && n.k <= n.children.length)) errors.push(`Line ${n.line}: "${n.label}" needs k between 1 and its ${n.children.length} inputs.`);
    }
  }
  if (events.length > 60) errors.push('This tool handles up to 60 distinct basic events.');
  return { root, events, nodes, errors };
}

// ── Reduced ordered BDD ──
// Variables are ordered by first appearance (depth first), which keeps related events close together.
export function makeBdd(limit = 400000) {
  const V = [Infinity, Infinity], LO = [0, 1], HI = [0, 1];
  const uniq = new Map(), memo = new Map();
  const mk = (v, lo, hi) => {
    if (lo === hi) return lo;
    const key = `${v},${lo},${hi}`;
    let id = uniq.get(key);
    if (id === undefined) {
      if (V.length >= limit) throw new Error('The tree is too large for an exact BDD.');
      id = V.length; V.push(v); LO.push(lo); HI.push(hi); uniq.set(key, id);
    }
    return id;
  };
  const apply = (op, a, b) => {
    if (op === 'and') { if (a === 0 || b === 0) return 0; if (a === 1) return b; if (b === 1) return a; }
    else { if (a === 1 || b === 1) return 1; if (a === 0) return b; if (b === 0) return a; }
    if (a === b) return a;
    if (a > b) [a, b] = [b, a];
    const key = `${op}${a},${b}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const v = Math.min(V[a], V[b]);
    const a0 = V[a] === v ? LO[a] : a, a1 = V[a] === v ? HI[a] : a;
    const b0 = V[b] === v ? LO[b] : b, b1 = V[b] === v ? HI[b] : b;
    const r = mk(v, apply(op, a0, b0), apply(op, a1, b1));
    memo.set(key, r);
    return r;
  };
  const variable = (v) => mk(v, 0, 1);
  // Probability that the function is true, with independent P(x_v = 1) = p[v].
  const prob = (root, p) => {
    const cache = new Map();
    const go = (n) => {
      if (n < 2) return n;
      let r = cache.get(n);
      if (r === undefined) { r = p[V[n]] * go(HI[n]) + (1 - p[V[n]]) * go(LO[n]); cache.set(n, r); }
      return r;
    };
    return go(root);
  };
  const size = (root) => { const seen = new Set(); const st = [root]; while (st.length) { const n = st.pop(); if (n < 2 || seen.has(n)) continue; seen.add(n); st.push(LO[n], HI[n]); } return seen.size; };
  return { mk, apply, variable, prob, size, count: () => V.length - 2 };
}

// Build the BDD for every gate (bottom up). Variable order = order of first appearance of each event in the tree.
export function buildBdd(tree) {
  const B = makeBdd();
  const order = new Map(); let next = 0;
  const visitOrder = (n) => { if (n.type === 'event') { if (!order.has(n.idx)) order.set(n.idx, next++); } else n.children.forEach(visitOrder); };
  visitOrder(tree.root);
  const atLeast = (k, kids) => {
    const memo = new Map();
    const go = (k2, i) => {
      if (k2 <= 0) return 1;
      if (kids.length - i < k2) return 0;
      const key = `${k2},${i}`;
      if (memo.has(key)) return memo.get(key);
      const r = B.apply('or', B.apply('and', kids[i], go(k2 - 1, i + 1)), go(k2, i + 1));
      memo.set(key, r);
      return r;
    };
    return go(k, 0);
  };
  const build = (n) => {
    if (n.type === 'event') { n.bdd = B.variable(order.get(n.idx)); return n.bdd; }
    const kids = n.children.map(build);
    if (n.op === 'and') n.bdd = kids.reduce((a, b) => B.apply('and', a, b), 1);
    else if (n.op === 'or') n.bdd = kids.reduce((a, b) => B.apply('or', a, b), 0);
    else n.bdd = atLeast(n.k, kids);
    return n.bdd;
  };
  build(tree.root);
  // p by BDD variable from p by event index
  const pv = (pe) => { const out = new Array(order.size); for (const [idx, v] of order) out[v] = pe[idx]; return out; };
  return { B, order, pv };
}

// ── Minimal cut sets (MOCUS, Fussell and Vesely 1972) ──
// Rows of the cut-set matrix are expanded top down: an OR gate splits a row, an AND gate widens it, a k-of-n gate
// becomes the OR of all k-subsets of its inputs. Rows are then reduced to minimal sets (Boolean absorption).
export function mocus(tree, maxRows = 50000) {
  let rows = [[tree.root]];
  let done = [];
  while (rows.length) {
    const row = rows.pop();
    const gi = row.findIndex((x) => x.type === 'gate');
    if (gi < 0) { done.push([...new Set(row.map((x) => x.idx))].sort((a, b) => a - b)); continue; }
    const g = row[gi], rest = row.slice(0, gi).concat(row.slice(gi + 1));
    if (g.op === 'and') rows.push(rest.concat(g.children));
    else if (g.op === 'or') for (const c of g.children) rows.push(rest.concat([c]));
    else for (const combo of combinations(g.children, g.k)) rows.push(rest.concat(combo));
    if (rows.length + done.length > maxRows) {
      done = minimise(done);
      if (rows.length + done.length > maxRows) throw new Error(`More than ${maxRows.toLocaleString('en-GB')} cut-set rows: the tree is too large for MOCUS here.`);
    }
  }
  return minimise(done);
}
export function combinations(arr, k) {
  const out = [];
  const go = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i <= arr.length - (k - acc.length); i++) { acc.push(arr[i]); go(i + 1, acc); acc.pop(); }
  };
  go(0, []);
  return out;
}
export function minimise(sets) {
  const uniq = [...new Map(sets.map((s) => [s.join(','), s])).values()].sort((a, b) => a.length - b.length || cmp(a, b));
  const kept = [];
  for (const s of uniq) {
    const ss = new Set(s);
    if (!kept.some((k) => k.length <= s.length && k.every((x) => ss.has(x)))) kept.push(s);
  }
  return kept;
}
const cmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// Exact probability of the union of cut sets by inclusion-exclusion (only for a handful of cut sets: 2^m terms).
export function inclusionExclusion(cuts, p, maxCuts = 16) {
  const m = cuts.length;
  if (m > maxCuts) return NaN;
  let total = 0;
  const go = (i, union, size) => {
    if (i === m) { if (size) { let pr = 1; for (const e of union) pr *= p[e]; total += (size % 2 ? 1 : -1) * pr; } return; }
    go(i + 1, union, size);
    const u2 = new Set(union); for (const e of cuts[i]) u2.add(e);
    go(i + 1, u2, size + 1);
  };
  go(0, new Set(), 0);
  return total;
}

// ── Full analysis ──
export function analyseFaultTree(tree) {
  const { events, root } = tree;
  const p = events.map((e) => e.p);
  const { B, pv } = buildBdd(tree);
  const Q = B.prob(root.bdd, pv(p));
  const gateProb = new Map();
  const walk = (n) => { if (n.type === 'gate') { gateProb.set(n, B.prob(n.bdd, pv(p))); n.children.forEach(walk); } };
  walk(root);
  const cuts = mocus(tree);
  const cutProb = cuts.map((c) => c.reduce((a, e) => a * p[e], 1));
  const rareEvent = cutProb.reduce((a, b) => a + b, 0);
  const mcub = 1 - cutProb.reduce((a, b) => a * (1 - b), 1);
  const ie = inclusionExclusion(cuts, p);
  const importance = events.map((e, i) => {
    const p1 = p.slice(); p1[i] = 1;
    const p0 = p.slice(); p0[i] = 0;
    const Q1 = B.prob(root.bdd, pv(p1)), Q0 = B.prob(root.bdd, pv(p0));
    const birnbaum = Q1 - Q0;
    const inCuts = cuts.map((c, j) => (c.includes(i) ? cutProb[j] : 0)).reduce((a, b) => a + b, 0);
    return {
      i, name: e.name, p: e.p, uses: e.uses,
      birnbaum,
      criticality: Q > 0 ? (birnbaum * e.p) / Q : NaN,
      fv: Q > 0 ? (Q - Q0) / Q : NaN,
      fvCut: rareEvent > 0 ? inCuts / rareEvent : NaN,
      raw: Q > 0 ? Q1 / Q : NaN,
      rrw: Q0 > 0 ? Q / Q0 : Infinity,
      Q1, Q0,
      minOrder: Math.min(...cuts.filter((c) => c.includes(i)).map((c) => c.length)),
    };
  });
  const orders = {};
  cuts.forEach((c) => { orders[c.length] = (orders[c.length] || 0) + 1; });
  const ranked = cuts.map((c, j) => ({ set: c, names: c.map((e) => events[e].name), p: cutProb[j], share: rareEvent > 0 ? cutProb[j] / rareEvent : NaN })).sort((a, b) => b.p - a.p || a.set.length - b.set.length);
  return { Q, rareEvent, mcub, ie, cuts: ranked, orders, importance, gateProb, bddNodes: B.size(root.bdd), events };
}

// ── "Reading your results" summary ──
// Confidence rule: the tree's arithmetic is exact, so confidence reflects the inputs.
//   high   — never: basic-event probabilities in human-factors trees are estimates (HRA tables, incident rates,
//            expert judgement), usually uncertain by a factor of 3 to 10;
//   medium — no basic event has a Birnbaum-weighted share (criticality) above 0.9 that rests on a single estimate,
//            and the top event depends on more than one cut set;
//   low    — a single basic event is a single point of failure (an order-1 cut set) or one cut set carries more
//            than 90% of the risk, so one uncertain number decides the answer.
export function faultSummary(r, topLabel) {
  const top = r.cuts[0];
  const spof = r.cuts.filter((c) => c.set.length === 1);
  const dominant = top && top.share > 0.9;
  const confidence = spof.length || dominant ? 'low' : 'medium';
  const imp = [...r.importance].sort((a, b) => b.fv - a.fv);
  const shared = r.events.filter((e) => e.uses > 1);
  const headline = `The top event "${topLabel}" has a probability of ${fmtP(r.Q)} (${oneIn(r.Q)}), from ${r.cuts.length} minimal cut set${r.cuts.length === 1 ? '' : 's'}.`;
  const meaning = [
    top ? `The most likely way it happens is ${top.names.length === 1 ? `"${top.names[0]}" on its own` : `${top.names.map((n) => `"${n}"`).join(' and ')} together`} (${fmtP(top.p)}, ${pct(top.share)} of the rare-event total).` : 'There are no cut sets.',
    spof.length ? `${spof.length} basic event${spof.length === 1 ? ' is a single point' : 's are single points'} of failure: ${spof.map((c) => `"${c.names[0]}"`).join(', ')} cause${spof.length === 1 ? 's' : ''} the top event alone.` : `No single event causes the top event; the smallest cut sets have ${Math.min(...r.cuts.map((c) => c.set.length))} events, so defences overlap.`,
    imp[0] ? `"${imp[0].name}" matters most: removing it entirely would cut the top-event probability by ${pct(imp[0].fv)} (Fussell-Vesely), and making it certain would multiply it by ${sig(imp[0].raw, 3)} (risk achievement worth).` : '',
    Math.abs(r.rareEvent - r.Q) / (r.Q || 1) > 0.1 ? `The rare-event approximation (sum of cut-set probabilities, ${fmtP(r.rareEvent)}) overstates the exact value by ${pct(r.rareEvent / r.Q - 1)}: some events are too likely for the shortcut, so use the exact figure.` : `The rare-event approximation (${fmtP(r.rareEvent)}) is within 10% of the exact value, so either can be quoted.`,
  ].filter(Boolean);
  if (shared.length) meaning.push(`${shared.length} event${shared.length === 1 ? ' appears' : 's appear'} in more than one branch (${shared.map((e) => `"${e.name}"`).join(', ')}); the exact calculation counts ${shared.length === 1 ? 'it' : 'them'} once, which simple gate-by-gate multiplication would not.`);
  const caveats = [
    'The calculation assumes basic events are independent. Common causes (the same fatigue, the same confusing screen) make events fail together; model them as a shared basic event or the result is too optimistic.',
    'The probabilities are only as good as their sources. Note where each came from (incident data, a HEART or SPAR-H estimate, judgement) and try the high and low values.',
  ];
  const next = [
    imp[0] ? `Strengthen the defence against "${imp[0].name}" first, then re-run to see the new top cut sets.` : 'Add the basic events that lead to the top event.',
    'Estimate human-error probabilities for the task steps with the [human error calculator](/calculators/human-error), and rank the failure modes and their effects in a [use FMEA](/calculators/use-fmea).',
  ];
  const report = `A fault tree for "${topLabel}" with ${r.events.length} basic events gave an exact top-event probability of ${fmtP(r.Q)} (rare-event approximation ${fmtP(r.rareEvent)}). There were ${r.cuts.length} minimal cut sets (${Object.entries(r.orders).map(([k, v]) => `${v} of order ${k}`).join(', ')}); the most important basic event by Fussell-Vesely importance was "${imp[0]?.name}" (${pct(imp[0]?.fv)}).`;
  return { headline, meaning, confidence, confidenceNote: CONF, caveats, next, report };
}
const CONF = 'Never high: the tree arithmetic is exact, but basic-event probabilities for people and devices are estimates that can be out by a factor of 3 to 10. Medium when the risk is spread over several cut sets with no single point of failure; low when one event alone causes the top event or one cut set carries over 90% of the risk, because then one uncertain number decides the answer.';
export const oneIn = (p) => (p >= 1 ? 'certain' : p > 0 ? `about 1 in ${Math.round(1 / p).toLocaleString('en-GB')}` : 'impossible');
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%` : 'not defined');

export const EXAMPLE = `# Infusion pump: a 10-fold overdose reaches the patient. Probabilities are per programming episode.
Overdose reaches patient [AND]
  Wrong rate programmed [OR]
    Decimal point slip on keypad: 0.003
    Wrong concentration selected: 0.002
    Dose worked out by hand [AND]
      Drug library not used (basic mode): 0.15
      Hand calculation error: 0.01
  Error not caught [AND]
    Dose-limit alert fails [OR]
      Drug library not used (basic mode)
      Limit set too wide for this drug: 0.05
      Alert overridden without reading: 0.2
    Two of three checks miss it [2/3]
      Second-nurse check missed: 0.1
      Barcode scan bypassed: 0.08
      Patient or family does not notice: 0.6`;
