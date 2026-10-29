// Hierarchical task analysis: parse an indented HTA, number it (0, 1, 1.1 …), parse plans in Annett and Stanton's
// notation, add up times (given or from KLM operators), and rank bottom-level operations by SHERPA-style P × C.
// Pure functions, checked by `npm run check:tools`.
import { parseKlm, klmTime } from '../stats.js';

export const MODES = { A: 'Action', C: 'Checking', R: 'Retrieval', I: 'Communication', S: 'Selection' };
const MODE_WORDS = { action: 'A', checking: 'C', check: 'C', retrieval: 'R', retrieve: 'R', communication: 'I', communicate: 'I', information: 'I', selection: 'S', select: 'S' };
const LEVEL = { l: 1, low: 1, m: 2, med: 2, medium: 2, h: 3, high: 3 };

const parseLevel = (v) => { if (v == null || v === '') return NaN; const s = String(v).trim().toLowerCase(); if (LEVEL[s]) return LEVEL[s]; const n = Number(s); return Number.isFinite(n) && n >= 1 && n <= 3 ? Math.round(n) : NaN; };
export function parseSeconds(v) {
  const s = String(v || '').trim().toLowerCase(); if (!s) return NaN;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hours?)?$/);
  if (!m) return NaN;
  const x = Number(m[1]), u = m[2] || 's';
  return u === 'ms' ? x / 1000 : /^m(in|ins|inutes?)?$/.test(u) ? x * 60 : /^h/.test(u) ? x * 3600 : x;
}

// One node per line; indentation sets the level. "Plan: …" lines attach a plan to the node they sit under.
// Fields after | on a line: t=seconds (or 2 min), klm=operators, f=frequency, p=L/M/H, c=L/M/H, mode=A/C/R/I/S, note=…
export function parseHta(text, k = 0.28) {
  const raw = [], bad = [];
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line, li) => {
    if (!line.trim() || /^\s*#/.test(line)) return;
    const m = line.match(/^([ \t]*)(?:[-*•]\s+|\d+(?:\.\d+)*[.)]?\s+)?(.*)$/);
    const indent = m[1].replace(/\t/g, '    ').length;
    const body = m[2].trim();
    const pm = body.match(/^plan(?:\s+[\d.]+)?\s*[:-]\s*(.*)$/i);
    if (pm) { raw.push({ plan: pm[1].trim(), indent, line: li + 1 }); return; }
    const [name, ...fields] = body.split('|').map((x) => x.trim());
    const f = {};
    fields.forEach((fl) => { const mm = fl.match(/^([a-z]+)\s*[=:]\s*(.*)$/i); if (mm) f[mm[1].toLowerCase()] = mm[2].trim(); else if (fl) bad.push(li + 1); });
    raw.push({ name, f, indent, line: li + 1 });
  });
  // Build the tree. Several top-level lines get a common root goal.
  const tops = raw.filter((r) => r.name !== undefined && r.indent === Math.min(...raw.filter((x) => x.name !== undefined).map((x) => x.indent)));
  const nodes = [];
  const mk = (r, parent, depth) => ({ i: nodes.length, name: r.name, fields: r.f || {}, parent, depth, children: [], planText: '', line: r.line });
  let base = -1;
  if (tops.length !== 1) { nodes.push({ i: 0, name: 'Main goal', fields: {}, parent: -1, depth: 0, children: [], planText: '', line: 0 }); base = 0; }
  const stack = base === 0 ? [{ indent: -1, i: 0 }] : [];
  raw.forEach((r) => {
    if (r.plan !== undefined) {
      // A plan belongs to the nearest node above it with a smaller indent, or the node directly above at the same indent.
      let owner = null;
      for (let s = stack.length - 1; s >= 0; s--) if (stack[s].indent < r.indent) { owner = stack[s].i; break; }
      if (owner === null && stack.length) owner = stack[stack.length - 1].i;
      if (owner === null) bad.push(r.line); else nodes[owner].planText = nodes[owner].planText ? `${nodes[owner].planText}; ${r.plan}` : r.plan;
      return;
    }
    while (stack.length && stack[stack.length - 1].indent >= r.indent) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].i : -1;
    if (parent < 0 && nodes.length) { bad.push(r.line); return; }
    const node = mk(r, parent, parent < 0 ? 0 : nodes[parent].depth + 1);
    nodes.push(node); if (parent >= 0) nodes[parent].children.push(node.i);
    stack.push({ indent: r.indent, i: node.i });
  });
  if (!nodes.length) return { nodes, bad };
  // Number: root 0, its children 1, 2 …, below that 1.1, 1.2 …
  const number = (i, num) => { nodes[i].num = num; nodes[i].children.forEach((c, j) => number(c, num === '0' ? String(j + 1) : `${num}.${j + 1}`)); };
  number(0, '0');
  nodes.forEach((n) => {
    n.leaf = n.children.length === 0;
    const F = n.fields;
    n.t = parseSeconds(F.t ?? F.time);
    n.klm = F.klm || '';
    if (n.klm) { const p = parseKlm(n.klm); n.klmTime = klmTime(p.ops, k).total; n.klmBad = p.bad; if (!Number.isFinite(n.t)) n.t = n.klmTime; }
    const fq = Number(F.f ?? F.freq ?? F.frequency); n.freq = Number.isFinite(fq) && fq > 0 ? fq : 1;
    n.P = parseLevel(F.p); n.C = parseLevel(F.c);
    n.risk = Number.isFinite(n.P) && Number.isFinite(n.C) ? n.P * n.C : NaN;
    const md = String(F.mode ?? F.err ?? F.error ?? '').trim();
    n.mode = md ? (MODE_WORDS[md.toLowerCase()] || md[0].toUpperCase()) : '';
    n.note = F.note || '';
    n.plan = n.leaf ? null : parsePlan(n.planText, n.children.length, n.num);
  });
  return { nodes, bad };
}

// Plans: clauses separated by ; or by sentences. "do 1 then 2", "1 > 2 > 3", "if card declined do 3",
// "repeat 2–3 until done", "do 1 and 2 at the same time", "do 4 as required", "1, 2 in any order".
// Step references are child positions (1, 2 …) or full numbers (1.2 under task 1); ranges with - or – or "to".
export function parsePlan(text, nChildren, num = '0') {
  const clauses = [], unknown = [];
  const refs = (s) => {
    const out = [];
    const norm = s.replace(/[–—]/g, '-').replace(/\s+to\s+/gi, '-');
    for (const m of norm.matchAll(/(\d+(?:\.\d+)*)(?:\s*-\s*(\d+(?:\.\d+)*))?/g)) {
      const loc = (x) => { if (num !== '0' && x.startsWith(`${num}.`)) x = x.slice(num.length + 1); return x.includes('.') ? NaN : Number(x); };
      const a = loc(m[1]), b = m[2] ? loc(m[2]) : a;
      if (!Number.isFinite(a) || !Number.isFinite(b)) { unknown.push(m[0]); continue; }
      for (let x = Math.min(a, b); x <= Math.max(a, b); x++) { if (x >= 1 && x <= nChildren) out.push(x); else unknown.push(String(x)); }
    }
    return out;
  };
  String(text || '').split(/;|\.\s+|\n/).map((c) => c.trim()).filter(Boolean).forEach((c) => {
    let m;
    if ((m = c.match(/^(?:if|when|unless)\s+(.+?)(?:,|:|\s+then)?\s+(?:do|go to|then)\s+(.+)$/i))) clauses.push({ kind: 'if', cond: m[1].trim(), steps: refs(m[2]), text: c });
    else if ((m = c.match(/repeat\s+(.+?)\s+(until|while|for)\s+(.+)$/i))) clauses.push({ kind: 'repeat', cond: `${m[2]} ${m[3]}`, steps: refs(m[1]), text: c });
    else if (/any order|either order/i.test(c)) clauses.push({ kind: 'any', steps: refs(c), text: c });
    else if (/same time|in parallel|simultaneous|together|concurrent/i.test(c)) clauses.push({ kind: 'parallel', steps: refs(c), text: c });
    else if (/optional|as required|as needed|if needed|if required|when needed/i.test(c)) clauses.push({ kind: 'optional', steps: refs(c), text: c });
    else if (/exit|stop|end|finish/i.test(c) && !refs(c).length) clauses.push({ kind: 'exit', steps: [], text: c });
    else clauses.push({ kind: 'seq', steps: refs(c), text: c });
  });
  const mentioned = new Set(clauses.flatMap((c) => c.steps));
  const mandatory = new Set(clauses.filter((c) => ['seq', 'any', 'parallel'].includes(c.kind)).flatMap((c) => c.steps));
  const conditional = [...mentioned].filter((s) => !mandatory.has(s));
  const missing = [...Array(nChildren).keys()].map((x) => x + 1).filter((x) => !mentioned.has(x));
  // With no plan, or for steps the plan never mentions, assume they are done once, in order.
  missing.forEach((x) => mandatory.add(x));
  const parallel = clauses.filter((c) => c.kind === 'parallel').map((c) => c.steps);
  return { clauses, mandatory: [...mandatory].sort((a, b) => a - b), conditional: conditional.sort((a, b) => a - b), parallel, missing: text ? missing : [], unknown, empty: !String(text || '').trim() };
}

// Times: total = every operation done once (× its frequency, and × the frequency of each goal above it);
// critical path = mandatory steps only, with steps marked as done at the same time overlapped (the longest counts).
export function htaTimes(nodes) {
  const tot = (i) => { const n = nodes[i]; n.total = (n.leaf ? (Number.isFinite(n.t) ? n.t : 0) : n.children.reduce((s, c) => s + tot(c), 0)) * n.freq; return n.total; };
  const crit = (i) => {
    const n = nodes[i];
    if (n.leaf) { n.crit = (Number.isFinite(n.t) ? n.t : 0) * n.freq; return n.crit; }
    const kids = n.children.map((c) => crit(c));
    const inPar = new Set(n.plan.parallel.flat());
    let t = n.plan.mandatory.filter((s) => !inPar.has(s)).reduce((s, x) => s + kids[x - 1], 0);
    n.plan.parallel.forEach((g) => { const m = g.filter((x) => n.plan.mandatory.includes(x)); if (m.length) t += Math.max(...m.map((x) => kids[x - 1])); });
    n.crit = t * n.freq; return n.crit;
  };
  tot(0); crit(0);
  return { total: nodes[0].total, critical: nodes[0].crit };
}

export function htaStats(nodes) {
  const times = htaTimes(nodes);
  const leaves = nodes.filter((n) => n.leaf);
  const parents = nodes.filter((n) => !n.leaf);
  const depth = Math.max(...nodes.map((n) => n.depth));
  const breadth = Math.max(0, ...nodes.map((n) => n.children.length));
  const deepest = nodes.filter((n) => n.depth === depth)[0];
  const ranked = leaves.filter((n) => Number.isFinite(n.risk)).sort((a, b) => b.risk - a.risk || b.P - a.P || a.i - b.i);
  const leavesUnder = (i) => (nodes[i].leaf ? 1 : nodes[i].children.reduce((s, c) => s + leavesUnder(c), 0));
  const top = nodes[0].children.map((c) => ({ i: c, num: nodes[c].num, name: nodes[c].name, ops: leavesUnder(c), total: nodes[c].total * nodes[0].freq, share: times.total > 0 ? (nodes[c].total * nodes[0].freq) / times.total : NaN }));
  const modes = Object.fromEntries(Object.keys(MODES).map((m) => [m, leaves.filter((n) => n.mode === m).length]));
  const planIssues = parents.filter((n) => n.plan.empty || n.plan.unknown.length || n.plan.missing.length).map((n) => ({ num: n.num, name: n.name, empty: n.plan.empty, unknown: n.plan.unknown, missing: n.plan.missing }));
  const conditional = parents.reduce((s, n) => s + n.plan.clauses.filter((c) => c.kind === 'if' || c.kind === 'repeat').length, 0);
  const untimed = leaves.filter((n) => !Number.isFinite(n.t)).length;
  const meanBranch = parents.length ? parents.reduce((s, n) => s + n.children.length, 0) / parents.length : 0;
  const hints = [];
  if (depth >= 5) hints.push(`The deepest branch is ${depth} levels below the main goal (${deepest.num} ${deepest.name}): consider whether people need to hold that much structure in mind, or whether the task can be flattened.`);
  if (breadth >= 9) hints.push(`One goal has ${breadth} subtasks; above about 7 the analysis becomes hard to read and the task hard to remember. Group them.`);
  if (conditional >= 4) hints.push(`${conditional} conditional or repeated plan steps: the task branches a lot, so error paths deserve their own testing.`);
  if (!hints.length) hints.push(depth <= 2 ? 'Shallow analysis: check whether operations are described at a level where you can see errors (the P × C stopping rule).' : 'Depth and breadth are within the usual range for an HTA.');
  return {
    ...times, goals: 1, subgoals: parents.length - 1, operations: leaves.length, depth, breadth, meanBranch, deepest,
    ranked, high: ranked.filter((n) => n.risk >= 6), medium: ranked.filter((n) => n.risk >= 3 && n.risk < 6), top, modes, planIssues, conditional, untimed, hints,
    nodes,
  };
}

// ── Summary ──
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
export const fmtTime = (s) => (!Number.isFinite(s) ? '—' : s >= 120 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${f1(s)} s`);
export function htaSummary(st) {
  if (!st.operations) return null;
  const big = [...st.top].sort((a, b) => b.total - a.total)[0];
  const meaning = [
    `The task breaks down into ${st.subgoals} subgoal${st.subgoals === 1 ? '' : 's'} and ${st.operations} operations, ${st.depth} level${st.depth === 1 ? '' : 's'} deep, with up to ${st.breadth} subtasks under one goal.`,
  ];
  if (st.total > 0) {
    meaning.push(`Done in full it takes about ${fmtTime(st.total)}; the shortest required route (critical path) takes ${fmtTime(st.critical)}.`);
    if (big && big.share >= 0.35 && st.top.length > 1) meaning.push(`Task ${big.num} (${big.name}) accounts for ${pc(big.share)} of total time: the first place to look for savings.`);
  }
  if (st.ranked.length) meaning.push(st.high.length ? `${st.high.length} high-risk step${st.high.length > 1 ? 's' : ''} (P × C of 6 or more): ${st.high.slice(0, 5).map((n) => `${n.num} ${n.name}`).join('; ')}${st.high.length > 5 ? ` and ${st.high.length - 5} more` : ''}.` : 'No step is rated high risk (P × C of 6 or more).');
  const usedModes = Object.entries(st.modes).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  if (usedModes.length) meaning.push(`Most likely error type: ${MODES[usedModes[0][0]].toLowerCase()} errors (${usedModes[0][1]} step${usedModes[0][1] > 1 ? 's' : ''}).`);
  meaning.push(...st.hints);
  const conf = st.untimed === 0 && st.ranked.length === st.operations ? 'medium' : 'low';
  return {
    headline: st.high.length ? `${st.operations} operations, ${fmtTime(st.total)} in total, and ${st.high.length} high-risk step${st.high.length > 1 ? 's' : ''} to design out first.` : `${st.operations} operations taking ${fmtTime(st.total)} in total${big && st.total > 0 ? `, ${pc(big.share)} of it in task ${big.num}` : ''}.`,
    meaning,
    confidence: conf,
    confidenceNote: `An HTA is an expert model, not a measurement: times and ratings are estimates. ${st.untimed ? `${st.untimed} operation${st.untimed > 1 ? 's have' : ' has'} no time, so totals are too low. ` : ''}${st.ranked.length < st.operations ? `${st.operations - st.ranked.length} operation${st.operations - st.ranked.length > 1 ? 's are' : ' is'} not rated for P and C.` : ''}`,
    caveats: ['Totals assume each step is done once (times its frequency); conditional steps are counted in the total but not in the critical path.', 'KLM times are for skilled, error-free performance; novices take longer.', 'P and C ratings vary between analysts; have two people rate independently and discuss differences.'],
    next: [
      st.high.length ? `Redesign or add safeguards to ${st.high[0].num} ${st.high[0].name} first (highest P × C), then check the others with SHERPA's remedy analysis.` : 'Rate P and C for each operation to find where errors matter most.',
      big && st.total > 0 ? `Look for steps in task ${big.num} to remove, automate or prefill.` : 'Add times or KLM operators to the operations to see where time goes.',
      'Validate the analysis by observing a few real users doing the task.',
    ],
    report: `Hierarchical task analysis of "${st.nodes[0].name}" identified ${st.operations} operations under ${st.subgoals} subgoals (depth ${st.depth}); estimated time ${fmtTime(st.total)} (critical path ${fmtTime(st.critical)})${st.ranked.length ? `, with ${st.high.length} step${st.high.length === 1 ? '' : 's'} rated high risk (P × C ≥ 6)` : ''}.`,
  };
}

// ── Exports ──
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const LV = ['', 'L', 'M', 'H'];
export function htaRows(nodes) {
  return nodes.map((n) => ({
    num: n.num, name: n.name, level: n.depth, type: n.i === 0 ? 'goal' : n.leaf ? 'operation' : 'subgoal', plan: n.planText || '',
    time: n.leaf && Number.isFinite(n.t) ? +n.t.toFixed(2) : '', klm: n.klm, freq: n.freq, total: Number.isFinite(n.total) ? +n.total.toFixed(2) : '',
    P: LV[n.P] || '', C: LV[n.C] || '', PxC: Number.isFinite(n.risk) ? n.risk : '', mode: n.mode ? `${n.mode} ${MODES[n.mode] || ''}`.trim() : '', note: n.note,
  }));
}
export function htaCsv(nodes) {
  const rows = htaRows(nodes); const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(','))].join('\n');
}
export function htaMarkdown(nodes, summary) {
  const rows = htaRows(nodes);
  const L = [`# HTA: ${nodes[0].name}`, '', '| No. | Task | Plan | Time (s) | Freq | P | C | P×C | Error mode |', '|---|---|---|---|---|---|---|---|---|'];
  rows.forEach((r) => L.push(`| ${r.num} | ${'  '.repeat(r.level)}${r.name.replace(/\|/g, '/')} | ${r.plan.replace(/\|/g, '/')} | ${r.type === 'operation' ? r.time : r.total} | ${r.freq} | ${r.P} | ${r.C} | ${r.PxC} | ${r.mode} |`));
  if (summary) L.push('', `**${summary.headline}**`, '', ...summary.meaning.map((m) => `- ${m}`), '', `> ${summary.report}`);
  return L.join('\n');
}

export const HTA_EXAMPLE = `Book a train ticket online
  Plan: do 1 then 2 then 3 then 4; if payment declined do 5; repeat 4-5 until paid
  Find a journey
    Plan: do 1 and 2 in any order, then 3, then 4
    Enter the departure station | klm=M P BB "Leeds" | p=L | c=M | mode=action
    Enter the destination station | klm=M P BB "York" | p=M | c=H | mode=selection | note=Similar names (York, Yorkgate)
    Choose date and time | t=8 | p=M | c=H | mode=selection
    Search | klm=M P BB R(2) | p=L | c=L | mode=action
  Choose a train and ticket
    Plan: do 1 then 2 then 3; do 4 as required
    Compare journeys | t=20 | p=M | c=M | mode=checking
    Pick the cheapest suitable ticket | t=15 | p=H | c=H | mode=selection | note=Off-peak rules are unclear
    Check the ticket restrictions | t=12 | p=H | c=H | mode=checking
    Add a railcard | t=10 | p=M | c=M | mode=retrieval
  Enter passenger details
    Plan: do 1 then 2
    Type name and email | klm=M P BB "Ana Silva" M P BB "ana@example.com" | p=M | c=M | mode=action
    Choose ticket delivery | t=6 | p=M | c=M | mode=selection
  Pay
    Plan: do 1 then 2 then 3
    Enter card details
      Plan: do 1 then 2 then 3; if the card is saved, do 4 instead
      Type the card number | klm=M P BB "4111111111111111" | p=M | c=H | mode=action
      Type the expiry date | klm=M "0428" | p=M | c=M | mode=action
      Type the security code | klm=M "123" | p=L | c=M | mode=retrieval
      Choose a saved card | t=4 | p=L | c=H | mode=selection
    Confirm 3-D Secure in the bank app | t=20 | p=L | c=H | mode=communication
    Check the confirmation | t=6 | p=M | c=M | mode=checking
  Retry the payment | t=30 | p=M | c=M | mode=action`;
