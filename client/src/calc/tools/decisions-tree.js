// Decision trees: a small outline language, expected-value rollback, the optimal policy and its risk profile, one-way
// sensitivity (tornado) and break-even values. Pure functions; checked in server/scripts/check-decisions.js against an
// independent Python rollback and Hillier and Lieberman's Goferbroke example.
//
// Outline language (two spaces per level):
//   $name = expression [low, high]  description      a parameter with an optional range for the tornado chart
//   Label [D]                                        a decision node (choose the best branch)
//   Label: p=0.3, value=200, cost=40 [C]             a chance node reached with probability 0.3
//   Label: p=rest, value=$gain*2                     p=rest is 1 minus the other branches' probabilities
// value is a payoff collected on that branch and cost is subtracted; a branch's total is the sum along its path.
// Nodes with children are chance nodes when their children have p=, otherwise decision nodes, unless marked.
import { fmt } from './decisions-core.js';

// ── Expressions: numbers, $parameters, + − × ÷, parentheses ──
export function evalExpr(src, env) {
  const s = String(src).trim();
  let i = 0;
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const fail = (m) => { throw new Error(`${m} in "${s}"`); };
  function factor() {
    ws();
    if (s[i] === '-') { i++; return -factor(); }
    if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '(') { i++; const v = expr(); ws(); if (s[i] !== ')') fail('Missing )'); i++; return v; }
    if (s[i] === '$') {
      const m = /^\$([A-Za-z_]\w*)/.exec(s.slice(i)); if (!m) fail('Bad parameter name');
      i += m[0].length;
      if (!(m[1] in env)) fail(`Unknown parameter $${m[1]}`);
      return env[m[1]];
    }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(%)?/i.exec(s.slice(i));
    if (!m) fail('Expected a number');
    i += m[0].length;
    return Number(m[1] + (m[2] || '')) / (m[3] ? 100 : 1);
  }
  function term() {
    let v = factor();
    for (;;) { ws(); if (s[i] === '*') { i++; v *= factor(); } else if (s[i] === '/') { i++; v /= factor(); } else return v; }
  }
  function expr() {
    let v = term();
    for (;;) { ws(); if (s[i] === '+') { i++; v += term(); } else if (s[i] === '-') { i++; v -= term(); } else return v; }
  }
  if (!s) fail('Empty expression');
  const v = expr(); ws();
  if (i < s.length) fail(`Unexpected "${s[i]}"`);
  return v;
}

// ── Parse the outline into parameters and a tree ──
export function parseTree(text) {
  const params = [], errors = [];
  const nodes = [];
  String(text || '').split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) return;
    const pm = /^\s*\$([A-Za-z_]\w*)\s*=\s*(.*)$/.exec(line);
    if (pm) {
      // $name = base [low, high] note   or   $name = base  note (two or more spaces before the note)
      const rest = pm[2], b = rest.indexOf('[');
      let base, lo, hi, note = '';
      if (b >= 0) {
        const e = rest.indexOf(']', b);
        base = rest.slice(0, b).trim();
        const rng = rest.slice(b + 1, e < 0 ? undefined : e).split(',');
        if (rng.length !== 2) errors.push(`Line ${ln + 1}: write the range as [low, high]`);
        else { lo = rng[0].trim(); hi = rng[1].trim(); }
        note = e < 0 ? '' : rest.slice(e + 1).trim();
      } else {
        const m = /^(.*?)(?:\s{2,}(.*))?$/.exec(rest.trim());
        base = m[1].trim(); note = (m[2] || '').trim();
      }
      params.push({ name: pm[1], base, lo, hi, note, line: ln + 1 });
      return;
    }
    const indent = line.length - line.trimStart().length;
    let body = line.trim(), type = null;
    const tm = /\s*\[(d|c|decision|chance)\]\s*$/i.exec(body);
    if (tm) { type = tm[1][0].toUpperCase() === 'D' ? 'D' : 'C'; body = body.slice(0, tm.index).trim(); }
    let label = body, attrs = {};
    const am = /^(.*?):\s*((?:p|v|value|c|cost)\s*=.*)$/i.exec(body);
    if (am) {
      label = am[1].trim();
      for (const part of am[2].split(',')) {
        const kv = /^\s*(p|v|value|c|cost)\s*=\s*(.+?)\s*$/i.exec(part);
        if (!kv) { errors.push(`Line ${ln + 1}: cannot read "${part.trim()}" (use p=, value= or cost=)`); continue; }
        const k = kv[1].toLowerCase();
        attrs[k === 'v' ? 'value' : k === 'c' ? 'cost' : k] = kv[2];
      }
    }
    label = label.replace(/:\s*$/, '').trim();
    nodes.push({ label: label || '(unnamed)', indent, type, attrs, line: ln + 1, children: [] });
  });
  if (!nodes.length) return { params, root: null, errors: [...errors, 'Write at least one node.'] };
  const root = nodes[0], stack = [root];
  for (const n of nodes.slice(1)) {
    while (stack.length && stack[stack.length - 1].indent >= n.indent) stack.pop();
    if (!stack.length) { errors.push(`Line ${n.line}: only one top-level node is allowed (indent it under "${root.label}")`); stack.push(root); continue; }
    stack[stack.length - 1].children.push(n);
    stack.push(n);
  }
  const fix = (n) => {
    if (n.children.length) {
      if (!n.type) n.type = n.children.some((c) => 'p' in c.attrs) ? 'C' : 'D';
    } else n.type = 'T';
    n.children.forEach(fix);
  };
  fix(root);
  return { params, root, errors };
}

// Parameter values: base values, with one parameter overridden (for sensitivity). Ranges are evaluated too.
export function paramEnv(params, override = {}) {
  const env = {}, info = [], errors = [];
  for (const p of params) {
    try {
      const base = evalExpr(p.base, env);
      const lo = p.lo !== undefined ? evalExpr(p.lo, env) : NaN, hi = p.hi !== undefined ? evalExpr(p.hi, env) : NaN;
      env[p.name] = p.name in override ? override[p.name] : base;
      info.push({ ...p, baseV: base, loV: lo, hiV: hi });
    } catch (e) { errors.push(`Line ${p.line}: ${e.message}`); env[p.name] = NaN; }
  }
  return { env, info, errors };
}

// Evaluate and roll back. Returns a new tree with p, payoff, ev, best (for decisions) and errors.
export function rollback(root, env, { minimise = false } = {}) {
  const errors = [];
  const num = (n, k, d) => {
    if (!(k in n.attrs)) return d;
    try { const v = evalExpr(n.attrs[k], env); if (!Number.isFinite(v)) throw new Error('not a number'); return v; } catch (e) { errors.push(`Line ${n.line}: ${e.message}`); return NaN; }
  };
  function go(n) {
    const payoff = num(n, 'value', 0) - num(n, 'cost', 0);
    const kids = n.children.map(go);
    let ev = payoff, best = -1;
    if (n.type === 'C') {
      const rest = kids.filter((k) => k.pRaw === 'rest');
      const known = kids.filter((k) => k.pRaw !== 'rest');
      if (rest.length > 1) errors.push(`Line ${n.line}: only one branch of "${n.label}" can use p=rest`);
      known.forEach((k) => { if (k.pRaw === undefined) errors.push(`Line ${k.line}: "${k.label}" needs a probability (p=)`); });
      const sKnown = known.reduce((a, k) => a + (Number.isFinite(k.p) ? k.p : 0), 0);
      rest.forEach((k) => { k.p = 1 - sKnown; });
      const tot = kids.reduce((a, k) => a + k.p, 0);
      kids.forEach((k) => { if (!(k.p >= -1e-9 && k.p <= 1 + 1e-9)) errors.push(`Line ${k.line}: probability of "${k.label}" is ${fmt(k.p, 3)}, outside 0 to 1`); });
      if (Math.abs(tot - 1) > 1e-6) errors.push(`Line ${n.line}: probabilities under "${n.label}" add up to ${fmt(tot, 4)}, not 1`);
      ev = payoff + kids.reduce((a, k) => a + k.p * k.ev, 0);
    } else if (n.type === 'D') {
      kids.forEach((k, i) => { if (best < 0 || (minimise ? k.ev < kids[best].ev : k.ev > kids[best].ev)) best = i; });
      ev = payoff + kids[best].ev;
    }
    const pRaw = n.attrs.p === undefined ? undefined : String(n.attrs.p).trim().toLowerCase() === 'rest' ? 'rest' : n.attrs.p;
    const p = pRaw === undefined || pRaw === 'rest' ? NaN : num(n, 'p', NaN);
    return { label: n.label, type: n.type, line: n.line, payoff, ev, best, children: kids, pRaw, p };
  }
  const tree = go(root);
  return { tree, errors };
}

// Follow the optimal policy: every end point it can reach, with its probability and total payoff (the risk profile).
export function riskProfile(tree) {
  const out = [];
  const walk = (n, prob, total, path) => {
    const t = total + n.payoff, pth = [...path, n.label];
    if (n.type === 'T') { out.push({ prob, total: t, path: pth }); return; }
    if (n.type === 'D') { walk(n.children[n.best], prob, t, pth); return; }
    n.children.forEach((c) => walk(c, prob * c.p, t, pth));
  };
  walk(tree, 1, 0, []);
  return out;
}
// The chosen branch at every decision node on the optimal path (the policy), in reading order.
export function policy(tree) {
  const out = [];
  const walk = (n, onPath) => {
    if (n.type === 'D') { if (onPath) out.push({ at: n.label, choose: n.children[n.best].label, ev: n.ev }); n.children.forEach((c, i) => walk(c, onPath && i === n.best)); }
    else n.children.forEach((c) => walk(c, onPath));
  };
  walk(tree, true);
  return out;
}

// Full analysis for the page: parse, roll back, sensitivity for every parameter with a range.
export function analyse(text, { minimise = false } = {}) {
  const parsed = parseTree(text);
  if (!parsed.root) return { errors: parsed.errors };
  const base = paramEnv(parsed.params);
  const rb = rollback(parsed.root, base.env, { minimise });
  const errors = [...parsed.errors, ...base.errors, ...rb.errors];
  if (errors.length) return { errors, params: base.info };
  const tree = rb.tree;
  const rootChoice = (t) => (t.type === 'D' ? t.children[t.best].label : null);
  const evAt = (name, v) => { const e = paramEnv(parsed.params, { [name]: v }); const r = rollback(parsed.root, e.env, { minimise }); return r.errors.length ? null : r.tree; };
  const tornado = base.info.filter((p) => Number.isFinite(p.loV) && Number.isFinite(p.hiV)).map((p) => {
    const tl = evAt(p.name, p.loV), th = evAt(p.name, p.hiV);
    const row = { name: p.name, note: p.note, base: p.baseV, lo: p.loV, hi: p.hiV, evLo: tl ? tl.ev : NaN, evHi: th ? th.ev : NaN, choiceLo: tl && rootChoice(tl), choiceHi: th && rootChoice(th), invalid: !tl || !th };
    row.swing = Math.abs(row.evHi - row.evLo);
    // Break-even: scan the range for a change of the root decision, then bisect.
    const grid = 60, flips = [];
    let prevV = p.loV, prevC = row.choiceLo;
    for (let g = 1; g <= grid; g++) {
      const v = p.loV + ((p.hiV - p.loV) * g) / grid, t = evAt(p.name, v);
      const c = t && rootChoice(t);
      if (t && prevC !== null && c !== prevC) {
        let a = prevV, b = v;
        for (let it = 0; it < 60; it++) { const m = (a + b) / 2, tm = evAt(p.name, m); if (tm && rootChoice(tm) === prevC) a = m; else b = m; }
        flips.push({ at: (a + b) / 2, from: prevC, to: c });
      }
      prevV = v; prevC = c;
    }
    row.flips = flips;
    return row;
  }).sort((a, b) => (b.swing || 0) - (a.swing || 0));
  const kids = tree.type === 'D' ? tree.children.map((c) => ({ label: c.label, ev: c.ev + tree.payoff })) : [];
  return { errors: [], tree, params: base.info, tornado, profile: riskProfile(tree), policy: policy(tree), rootOptions: kids };
}

// "Reading your results" summary.
// Confidence rule (how robust the recommended choice is):
//   low    — at least one parameter, moved within its stated range, changes the decision at the root (a break-even
//            value lies inside the range);
//   medium — no parameter flips the decision, but the best option beats the runner-up by less than 10% of the
//            spread between the best and worst outcomes the policy can produce, or no ranges were given;
//   high   — no flip within any range and a clear margin.
export function treeSummary({ tree, tornado, profile, rootOptions, unit = '', minimise = false }) {
  const v = (x) => `${x < 0 ? '−' : ''}${unit}${fmt(Math.abs(x), Math.abs(x) < 10 && x % 1 ? 2 : 0)}`;
  const sorted = [...rootOptions].sort((a, b) => (minimise ? a.ev - b.ev : b.ev - a.ev));
  const best = sorted[0], second = sorted[1];
  const flips = tornado.filter((t) => t.flips.length);
  const outs = profile.map((o) => o.total);
  const spread = outs.length ? Math.max(...outs) - Math.min(...outs) : 0;
  const margin = best && second ? Math.abs(best.ev - second.ev) : Infinity;
  const confidence = flips.length ? 'low' : !tornado.length || (Number.isFinite(margin) && spread > 0 && margin < 0.1 * spread) ? 'medium' : 'high';
  const headline = best
    ? `The best choice is "${best.label}", with an expected value of ${v(best.ev)}${second ? ` against ${v(second.ev)} for "${second.label}"` : ''}.`
    : `The expected value of the tree is ${v(tree.ev)}.`;
  const pLoss = profile.filter((o) => o.total < 0).reduce((a, o) => a + o.prob, 0);
  const meaning = [
    `Expected value is the probability-weighted average over the outcomes; under the best policy the actual result ranges from ${v(Math.min(...outs))} to ${v(Math.max(...outs))}${pLoss > 0 ? `, with a ${fmt(pLoss * 100, 0)}% chance of a loss` : ''}.`,
  ];
  if (tornado.length) meaning.push(`The input that moves the result most is $${tornado[0].name}${tornado[0].note ? ` (${tornado[0].note})` : ''}: across its range the expected value goes from ${v(tornado[0].evLo)} to ${v(tornado[0].evHi)}.`);
  if (flips.length) meaning.push(`The decision changes inside the ranges you gave: ${flips.map((t) => `$${t.name} at about ${fmt(t.flips[0].at, Math.abs(t.flips[0].at) < 10 ? 3 : 0)} (from "${t.flips[0].from}" to "${t.flips[0].to}")`).join('; ')}.`);
  else if (tornado.length) meaning.push('No single input, moved across its range, changes the best choice.');
  const caveats = [
    'Expected value treats a small chance of a big loss the same as a likely small loss. If a bad outcome would be hard to recover from, look at the range of outcomes, not just the average.',
    'One-way sensitivity moves one input at a time; inputs that move together (for example adoption and revenue) can change the answer even when each alone does not.',
  ];
  const next = [
    flips.length ? `Research the inputs whose break-even value lies inside their range first (${flips.map((t) => `$${t.name}`).join(', ')}); see whether it is worth it with the [value of information](/calculators/value-of-information) calculator.` : 'Note the break-even values and revisit the decision if new evidence moves an input past them.',
    'Share the tree with stakeholders so the probabilities and payoffs, not just the answer, can be challenged.',
  ];
  const report = `A decision tree rolled back by expected value recommended "${best ? best.label : tree.label}" (expected value ${v(best ? best.ev : tree.ev)}${second ? `; next best "${second.label}" at ${v(second.ev)}` : ''}). ${flips.length ? `The choice was sensitive to ${flips.map((t) => `$${t.name}`).join(', ')}, whose break-even values fall within their plausible ranges.` : tornado.length ? 'No single input changed the recommendation within its plausible range.' : ''}`.trim();
  return {
    headline, meaning, confidence,
    confidenceNote: 'Low when moving any one input within its range changes the best choice; medium when no input does but the margin to the runner-up is under 10% of the spread of possible outcomes (or no ranges were given); high otherwise. The probabilities and payoffs are estimates, so this is about robustness, not statistical certainty.',
    caveats, next, report,
  };
}
