// Tree testing: parse a navigation tree, encode studies and results, and analyse click paths.
// Success, directness, first click, time and lostness follow the usual tree-test measures (Treejack, Sauro).
// Path categories and error types are heuristic labels read from the click path; see classifyAttempt.
import { adjustedWald, timeCI, lostness } from '../stats.js';
import { encodeCode, decodeCode } from './codec.js';

// ── Tree ──
// Indented text: one label per line, children indented under their parent (spaces or tabs; leading -, * or • are
// ignored). Node 0 is the invisible root ("Home"); the other nodes are numbered in reading order.
export function parseTree(text) {
  const nodes = [{ i: 0, label: 'Home', depth: 0, parent: -1, children: [] }];
  const stack = [{ indent: -1, i: 0 }];
  const bad = [];
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line, li) => {
    if (!line.trim()) return;
    const m = line.match(/^([ \t]*)(?:[-*•]\s+)?(.*)$/);
    const indent = m[1].replace(/\t/g, '    ').length;
    const label = m[2].trim();
    if (!label) { bad.push(li + 1); return; }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1].i;
    const node = { i: nodes.length, label, depth: nodes[parent].depth + 1, parent, children: [] };
    nodes.push(node); nodes[parent].children.push(node.i);
    stack.push({ indent, i: node.i });
  });
  return { nodes, bad };
}
// Canonical text: one tab per level. Used inside study codes so the numbering is stable.
export const treeToText = (nodes) => nodes.slice(1).map((n) => '\t'.repeat(n.depth - 1) + n.label).join('\n');
export function pathOf(nodes, i) { const p = []; for (let x = i; x > 0; x = nodes[x].parent) p.unshift(x); return p; }
export const pathLabel = (nodes, i) => (i > 0 ? pathOf(nodes, i).map((x) => nodes[x].label).join(' › ') : 'Home');
export const topOf = (nodes, i) => { let x = i; while (x > 0 && nodes[x].parent > 0) x = nodes[x].parent; return x; };
// A node is on a correct path if it is a correct destination or an ancestor of one.
export function correctSet(nodes, answers) { const s = new Set([0]); for (const a of answers) for (const x of pathOf(nodes, a)) s.add(x); return s; }

// ── Study and result codes ──
export function makeStudy({ id, name, treeText, tasks, randomise = true, confidence = false, seq = false }) {
  const { nodes } = parseTree(treeText);
  return { v: 1, id: id || newId(), n: name || 'Tree test', tr: treeToText(nodes), tk: tasks.map((t) => ({ q: t.q, a: [...t.a] })), o: { r: randomise ? 1 : 0, c: confidence ? 1 : 0, s: seq ? 1 : 0 } };
}
export const encodeStudy = (study) => encodeCode(study);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || typeof s.tr !== 'string' || !Array.isArray(s.tk)) throw new Error('Not a tree-test study');
  return s;
}
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || !Array.isArray(r.k)) throw new Error('Not a tree-test result');
  return r;
}
export function newId(rnd = Math.random) { let s = ''; const A = 'abcdefghjkmnpqrstuvwxyz23456789'; for (let i = 0; i < 8; i++) s += A[Math.floor(rnd() * A.length)]; return s; }
export function taskOrder(n, randomise, rnd = Math.random) {
  const a = [...Array(n).keys()]; if (!randomise) return a;
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Result codes pasted one per line (or separated by spaces or commas); blank and unreadable lines are reported.
export function parseResultCodes(text) {
  const results = [], bad = [];
  String(text || '').split(/[\s,]+/).filter(Boolean).forEach((c, i) => { try { results.push(decodeResult(c)); } catch { bad.push(i + 1); } });
  return { results, bad };
}

// ── Attempt events ──
// Each attempt is { t: task index, e: [[kind, node, ms], …], r: chosen node or −1, ms, c, q }.
// kinds: 'o' open a child, 'u' go up (to the node given), 's' select "I'd find it here", 'x' skip the task.

// Path categories (Treejack's outcomes plus skip):
//   direct success: chose a correct node without going back up at any point;
//   indirect success: chose a correct node after going back up at least once;
//   direct failure: chose a wrong node without going back up;
//   indirect failure: chose a wrong node after going back up;
//   skip: gave up on the task without choosing.
// Error types (heuristic, after Norman 1981 and Reason 1990, adapted for navigation):
//   slip: opened a sibling of the correct next node (a wrong child of a node on the correct path) and went straight
//     back up from it as the next action. The intention was right; the click was wrong and was noticed at once.
//   mistake: went two or more levels deep into a top-level section that holds no correct answer: committed to the
//     wrong place, suggesting a mental model that differs from the tree.
//   retreat: each use of Back / Go up (counted).
//   lapse: reached the parent of a correct answer (or the answer itself) but ended on something else, or abandoned
//     the task (skip).
export function classifyAttempt(nodes, answers, a) {
  const ok = correctSet(nodes, answers);
  const ans = new Set(answers);
  const parents = new Set(answers.map((x) => nodes[x].parent));
  const visits = [0]; let cur = 0;
  const ev = a.e || [];
  let slips = 0, retreats = 0;
  const wrongDeep = new Set();
  let reachedParent = parents.has(0), reachedAnswer = false, first = null;
  ev.forEach((e, i) => {
    const [k, node] = e;
    if (k === 'o') {
      if (first === null) first = node;
      cur = node; visits.push(node);
      if (parents.has(node)) reachedParent = true;
      if (ans.has(node)) reachedAnswer = true;
      const top = topOf(nodes, node);
      if (!ok.has(top) && nodes[node].depth >= 2) wrongDeep.add(top);
      const nx = ev[i + 1];
      if (!ok.has(node) && ok.has(nodes[node].parent) && nx && nx[0] === 'u' && nx[1] === nodes[node].parent) slips++;
    } else if (k === 'u') { retreats++; cur = node; visits.push(node); }
  });
  const skipped = a.r == null || a.r < 0;
  const success = !skipped && ans.has(a.r);
  const direct = retreats === 0;
  const category = skipped ? 'skip' : `${direct ? 'direct' : 'indirect'}-${success ? 'success' : 'failure'}`;
  const lapse = !success && (skipped || reachedParent || reachedAnswer);
  const minR = Math.min(...answers.map((x) => nodes[x].depth)) + 1;
  const N = new Set(visits).size, S = visits.length;
  return {
    category, success, direct, skipped, slips, retreats, mistakes: wrongDeep.size, mistakeBranches: [...wrongDeep],
    lapse, lapseKind: !lapse ? null : skipped ? 'abandoned' : 'near miss', visits, first,
    firstCorrect: first !== null && ok.has(first), seconds: (a.ms || 0) / 1000,
    lost: N >= 1 && S >= N ? lostness(N, S, Math.min(minR, N)) : NaN, N, S, R: minR,
  };
}
export const CATEGORY_NAMES = { 'direct-success': 'Direct success', 'indirect-success': 'Indirect success', 'direct-failure': 'Direct failure', 'indirect-failure': 'Indirect failure', skip: 'Skip' };
export const CATEGORY_ORDER = ['direct-success', 'indirect-success', 'direct-failure', 'indirect-failure', 'skip'];

// ── Analysis across participants ──
export function analyse(study, results, conf = 0.95) {
  const { nodes } = parseTree(study.tr);
  const mine = results.filter((r) => !r.s || r.s === study.id);
  const people = mine.map((r, pi) => ({ id: r.p || `P${pi + 1}`, r }));
  const tasks = study.tk.map((task, ti) => {
    const ok = correctSet(nodes, task.a);
    const atts = [];
    people.forEach((p) => { const a = p.r.k.find((x) => x.t === ti); if (a) atts.push({ pid: p.id, a, c: classifyAttempt(nodes, task.a, a) }); });
    const n = atts.length;
    const succ = atts.filter((x) => x.c.success).length;
    const cats = Object.fromEntries(CATEGORY_ORDER.map((k) => [k, atts.filter((x) => x.c.category === k).length]));
    const times = atts.filter((x) => x.c.success && x.c.seconds > 0).map((x) => x.c.seconds);
    const visits = new Map(), selected = new Map(), firsts = new Map(), edges = new Map();
    atts.forEach((x) => {
      new Set(x.c.visits).forEach((v) => visits.set(v, (visits.get(v) || 0) + 1));
      for (let i = 1; i < x.c.visits.length; i++) { const v = x.c.visits[i]; if (nodes[v].parent === x.c.visits[i - 1]) edges.set(v, (edges.get(v) || 0) + 1); }
      if (!x.c.skipped) selected.set(x.a.r, (selected.get(x.a.r) || 0) + 1);
      if (x.c.first !== null) firsts.set(x.c.first, (firsts.get(x.c.first) || 0) + 1);
    });
    const wrongFirst = [...firsts.entries()].filter(([v]) => !ok.has(v)).sort((a, b) => b[1] - a[1]);
    const wrongSel = [...selected.entries()].filter(([v]) => !task.a.includes(v)).sort((a, b) => b[1] - a[1]);
    const lostVals = atts.filter((x) => x.c.success).map((x) => x.c.lost).filter(Number.isFinite);
    const res = {
      ti, q: task.q, answers: task.a, n, succ, rate: n ? succ / n : NaN, ci: n ? adjustedWald(succ, n, conf) : null, cats,
      directSucc: cats['direct-success'], direct: n ? atts.filter((x) => x.c.direct).length / n : NaN,
      firstCorrect: n ? atts.filter((x) => x.c.firstCorrect).length / Math.max(1, atts.filter((x) => x.c.first !== null).length) : NaN,
      time: times.length >= 2 ? timeCI(times, conf) : times.length === 1 ? { geo: times[0], geoLo: NaN, geoHi: NaN, n: 1 } : null,
      slips: atts.reduce((s, x) => s + x.c.slips, 0), slipAttempts: atts.filter((x) => x.c.slips).length,
      mistakes: atts.filter((x) => x.c.mistakes).length, retreats: atts.reduce((s, x) => s + x.c.retreats, 0),
      lapses: atts.filter((x) => x.c.lapse).length, nearMiss: atts.filter((x) => x.c.lapseKind === 'near miss').length,
      lost: lostVals.length ? lostVals.reduce((a, b) => a + b, 0) / lostVals.length : NaN,
      visits, selected, firsts, edges, wrongFirst, wrongSel, atts, ok,
      conf: atts.filter((x) => Number.isFinite(x.a.c)).map((x) => x.a.c), seq: atts.filter((x) => Number.isFinite(x.a.q)).map((x) => x.a.q),
    };
    res.diagnosis = diagnose(nodes, res);
    return res;
  });
  const perPerson = people.map((p) => {
    const cs = study.tk.map((task, ti) => { const a = p.r.k.find((x) => x.t === ti); return a ? classifyAttempt(nodes, task.a, a) : null; }).filter(Boolean);
    const lost = cs.filter((c) => c.success).map((c) => c.lost).filter(Number.isFinite);
    return { id: p.id, n: cs.length, succ: cs.filter((c) => c.success).length, lost: lost.length ? lost.reduce((a, b) => a + b, 0) / lost.length : NaN, retreats: cs.reduce((s, c) => s + c.retreats, 0) };
  });
  // Labels that drew wrong clicks across all tasks: off-path opens and wrong selections.
  const lure = new Map();
  tasks.forEach((t) => t.atts.forEach((x) => {
    x.c.visits.slice(1).forEach((v, i) => { if (!t.ok.has(v) && x.c.visits[i] === nodes[v].parent) lure.set(v, (lure.get(v) || 0) + 1); });
  }));
  const lures = [...lure.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ node: v, label: nodes[v].label, path: pathLabel(nodes, v), clicks: c }));
  return { nodes, tasks, people: perPerson, lures, n: people.length };
}

// Why a task failed, from its numbers. Returns a short list of { kind, text } in order of weight.
export function diagnose(nodes, t) {
  const out = [];
  if (!t.n) return out;
  const fail = t.n - t.succ;
  const wrongTopFirst = t.wrongFirst.reduce((s, [, c]) => s + c, 0);
  if (t.mistakes / t.n >= 0.25 || wrongTopFirst / t.n >= 0.35) {
    const [v, c] = t.wrongFirst[0] || [];
    out.push({ kind: 'grouping', text: v ? `Wrong top-level grouping: ${Math.round((c / t.n) * 100)}% started in "${nodes[v].label}" and ${t.mistakes} went two or more levels into a wrong section. People expect this content somewhere else.` : `${t.mistakes} people went deep into a wrong section.` });
  }
  const sib = t.wrongSel.filter(([v]) => t.answers.some((a) => nodes[a].parent === nodes[v].parent));
  const sibN = sib.reduce((s, [, c]) => s + c, 0);
  if (fail && (sibN / t.n >= 0.15 || t.nearMiss / t.n >= 0.2)) {
    out.push({ kind: 'label', text: sib.length ? `Label ambiguity at the last level: ${sibN} chose "${nodes[sib[0][0]].label}" next to the correct "${t.answers.map((a) => nodes[a].label).join('" or "')}".` : `${t.nearMiss} reached the right section but chose something else: the final labels are hard to tell apart.` });
  }
  if (t.cats.skip / t.n >= 0.15) out.push({ kind: 'abandon', text: `${t.cats.skip} gave up: no label looked right, which points to missing or unfamiliar wording.` });
  if (t.rate >= 0.7 && t.direct < 0.6) out.push({ kind: 'detour', text: `Most succeeded, but only ${Math.round(t.direct * 100)}% went straight there: people found it by trial and error.` });
  if (t.slips && t.slipAttempts / t.n >= 0.2) out.push({ kind: 'slip', text: `${t.slipAttempts} people opened a neighbouring label and backed out at once: labels in the right section are close in meaning or position.` });
  return out;
}

// ── Summaries and exports ──
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
export function treeSummary(an) {
  if (!an.tasks.some((t) => t.n)) return null;
  const T = an.tasks.filter((t) => t.n);
  const failed = T.filter((t) => t.rate < 0.7);
  const best = [...T].sort((a, b) => b.rate - a.rate)[0];
  const overall = T.reduce((s, t) => s + t.succ, 0) / T.reduce((s, t) => s + t.n, 0);
  const n = an.n;
  const short = (t) => `Task ${t.ti + 1}`;
  const meaning = [
    `Overall success was ${pc(overall)} across ${T.length} tasks and ${n} participants. ${best.rate >= 0.8 ? `${short(best)} worked best (${pc(best.rate)}).` : ''}`,
    ...failed.map((t) => `${short(t)} ("${t.q}") failed for ${pc(1 - t.rate)}${t.ci ? ` (success ${pc(t.ci.lo)} to ${pc(t.ci.hi)})` : ''}. ${t.diagnosis.length ? t.diagnosis[0].text : 'Failures were scattered with no single cause.'}`),
  ];
  if (an.lures.length) meaning.push(`Labels that drew the most wrong clicks: ${an.lures.slice(0, 3).map((l) => `"${l.label}" (${l.clicks})`).join(', ')}.`);
  const totalMist = T.reduce((s, t) => s + t.mistakes, 0), totalSlip = T.reduce((s, t) => s + t.slipAttempts, 0), totalLapse = T.reduce((s, t) => s + t.lapses, 0);
  meaning.push(`Across all attempts: ${totalMist} mistakes (deep in the wrong section), ${totalSlip} attempts with slips (wrong neighbour, backed out at once) and ${totalLapse} lapses (near misses or give-ups).`);
  const next = [];
  failed.forEach((t) => {
    const d = t.diagnosis[0];
    if (!d) next.push(`${short(t)}: watch recordings or run a few moderated sessions to see why.`);
    else if (d.kind === 'grouping') next.push(`${short(t)}: move or cross-link the content where people looked first ("${an.nodes[t.wrongFirst[0][0]].label}"), or rename the top-level sections; check with an open card sort.`);
    else if (d.kind === 'label') next.push(`${short(t)}: rename the destination or its neighbours so they are clearly different, then retest the labels.`);
    else if (d.kind === 'abandon') next.push(`${short(t)}: use the words people use for this task; collect them with interviews or search logs.`);
    else next.push(`${short(t)}: ${d.text}`);
  });
  if (!failed.length) next.push('No task fell below 70%: retest only the indirect paths, or move on to first-click testing of the visual design.');
  next.push('Change one thing per task, then rerun the same tasks with new participants to compare.');
  return {
    headline: failed.length ? `${failed.length} of ${T.length} tasks fell below 70% success: ${failed.map((t) => short(t)).join(', ')}.` : `All ${T.length} tasks reached 70% success or more.`,
    meaning,
    confidence: n >= 50 ? 'high' : n >= 20 ? 'medium' : 'low',
    confidenceNote: `${n} participants. ${n < 20 ? 'Intervals are wide; differences of less than about 30 points between tasks may be chance. Tree tests usually need 50 or more people for stable rates.' : n < 50 ? 'Large problems are clear, smaller differences between tasks are not.' : ''}`,
    caveats: ['Slip, mistake and lapse are labels inferred from click paths, not from what people were thinking; confirm them with a few moderated sessions.', 'A tree test removes search, visuals and context, so real-site success is usually higher for well-labelled items and lower for buried ones.', 'Tasks written with the same words as a label are easier than they should be; check the wording of any task that scored very high.'],
    next,
    report: `In a tree test with ${n} participants, success ranged from ${pc(Math.min(...T.map((t) => t.rate)))} to ${pc(Math.max(...T.map((t) => t.rate)))} (overall ${pc(overall)}); ${failed.length ? `${failed.map((t) => short(t)).join(', ')} fell below 70%, ${failed[0].diagnosis[0] ? `mainly through ${failed[0].diagnosis[0].kind === 'grouping' ? 'a wrong top-level grouping' : failed[0].diagnosis[0].kind === 'label' ? 'ambiguous final labels' : failed[0].diagnosis[0].kind === 'abandon' ? 'abandonment' : 'detours'}` : 'with scattered failures'}` : 'all tasks reached 70%'}.`,
  };
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function clicksCsv(study, results) {
  const { nodes } = parseTree(study.tr);
  const rows = [['participant', 'task', 'task_text', 'step', 'action', 'node', 'path', 'ms', 'outcome']];
  results.forEach((r, pi) => r.k.forEach((a) => {
    const task = study.tk[a.t]; if (!task) return;
    const c = classifyAttempt(nodes, task.a, a);
    (a.e || []).forEach((e, i) => rows.push([r.p || `P${pi + 1}`, a.t + 1, task.q, i + 1, { o: 'open', u: 'back', s: 'select', x: 'skip' }[e[0]] || e[0], e[1] >= 0 ? nodes[e[1]]?.label : '', e[1] >= 0 ? pathLabel(nodes, e[1]) : '', e[2], c.category]));
  }));
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}
export function markdownSummary(study, an, summary) {
  const L = [`# ${study.n}: tree test results`, '', `${an.n} participants, ${study.tk.length} tasks.`, '', '| Task | Success | 95% CI | Direct success | First click correct | Mistakes | Slips | Lapses | Retreats | Time (geo mean) |', '|---|---|---|---|---|---|---|---|---|---|'];
  an.tasks.forEach((t) => L.push(`| ${t.ti + 1}. ${t.q.replace(/\|/g, '/')} | ${pc(t.rate)} (${t.succ}/${t.n}) | ${t.ci ? `${pc(t.ci.lo)}–${pc(t.ci.hi)}` : '—'} | ${pc(t.n ? t.directSucc / t.n : NaN)} | ${pc(t.firstCorrect)} | ${t.mistakes} | ${t.slipAttempts} | ${t.lapses} | ${t.retreats} | ${t.time ? `${t.time.geo.toFixed(1)} s` : '—'} |`));
  if (summary) {
    L.push('', '## Reading the results', '', `**${summary.headline}**`, '', ...summary.meaning.map((m) => `- ${m}`), '', '### What to do next', '', ...summary.next.map((m) => `- ${m}`), '', '### For the report', '', `> ${summary.report}`);
  }
  L.push('', '## Definitions', '', '- **Direct success**: chose a correct node without going back. **Indirect success**: correct after going back. **Direct / indirect failure**: wrong node, without / after going back. **Skip**: gave up.', '- **Slip**: opened a wrong neighbour of the correct path and went straight back. **Mistake**: two or more levels into a wrong top-level section. **Lapse**: reached the right parent but did not choose the answer, or gave up. **Retreat**: each Back.');
  return L.join('\n');
}

// ── Example study and simulated results ──
export const EXAMPLE_TREE = `Shop
  Phones
    iPhone
    Android phones
    Refurbished phones
  Tablets
  Accessories
    Cases
    Chargers
Plans
  Pay monthly
  Pay as you go
  SIM only
  Roaming add-ons
Support
  Billing
    Understand my bill
    Payment methods
    Refunds
  Network
    Coverage checker
    Service status
  Device help
    Set up my phone
    Repairs
My account
  Profile
  Usage
  Upgrade
  Bills and payments
About us
  Careers
  Contact us
  Store finder`;
export const EXAMPLE_TASKS = [
  { q: "You're travelling abroad next month. Find where you would add data to use overseas.", ans: ['Roaming add-ons'] },
  { q: 'Your latest bill is higher than you expected. Where would you find out what the charges are for?', ans: ['Understand my bill', 'Bills and payments'] },
  { q: 'Your phone screen has cracked. Where would you arrange to get it fixed?', ans: ['Repairs'] },
  { q: 'You want a cheaper, second-hand phone. Where would you look?', ans: ['Refurbished phones'] },
  { q: "Your phone has had no signal all morning. Find out whether there's a known problem in your area.", ans: ['Service status'] },
];
export const findNode = (nodes, label) => nodes.findIndex((n) => n.label === label);
export function exampleStudy() {
  const { nodes } = parseTree(EXAMPLE_TREE);
  return makeStudy({ id: 'example1', name: 'Mobile network site (example)', treeText: EXAMPLE_TREE, tasks: EXAMPLE_TASKS.map((t) => ({ q: t.q, a: t.ans.map((l) => findNode(nodes, l)) })), randomise: true, confidence: true, seq: true });
}
// Scripts: labels to open in turn, '^' = go up one level, '!' = choose here, '~' = skip. Counts add up to 14 people.
const EXAMPLE_SCRIPTS = [
  [[['Plans', 'Roaming add-ons', '!'], 9], [['Shop', '^', 'Plans', 'Roaming add-ons', '!'], 2], [['My account', 'Usage', '^', 'Upgrade', '!'], 1], [['Plans', 'SIM only', '^', 'Roaming add-ons', '!'], 1], [['Support', 'Network', 'Coverage checker', '!'], 1]],
  [[['Support', 'Billing', 'Understand my bill', '!'], 5], [['My account', 'Bills and payments', '!'], 4], [['Support', 'Billing', 'Payment methods', '!'], 2], [['My account', 'Usage', '!'], 2], [['Support', 'Billing', '~'], 1]],
  [[['Support', 'Device help', 'Repairs', '!'], 4], [['Shop', 'Accessories', 'Cases', '^', '^', '^', 'Support', 'Device help', 'Repairs', '!'], 2], [['Shop', 'Phones', 'iPhone', '!'], 3], [['Shop', 'Phones', '^', '^', 'About us', 'Store finder', '!'], 3], [['Support', 'Network', '^', 'Device help', 'Repairs', '!'], 1], [['About us', 'Contact us', '~'], 1]],
  [[['Shop', 'Phones', 'Refurbished phones', '!'], 10], [['Shop', 'Phones', 'Android phones', '^', 'Refurbished phones', '!'], 2], [['Plans', 'Pay as you go', '!'], 2]],
  [[['Support', 'Network', 'Service status', '!'], 5], [['Support', 'Network', 'Coverage checker', '!'], 5], [['Support', 'Network', 'Coverage checker', '^', 'Service status', '!'], 1], [['My account', 'Usage', '^', '^', 'Support', 'Network', 'Coverage checker', '!'], 2], [['Support', 'Network', '~'], 1]],
];
export function runScript(nodes, script, rnd) {
  let cur = 0, ms = 0; const e = []; let r = -1;
  for (const step of script) {
    ms += Math.round(1500 + rnd() * 3500);
    if (step === '^') { cur = nodes[cur].parent; e.push(['u', cur, ms]); }
    else if (step === '!') { r = cur; e.push(['s', cur, ms]); }
    else if (step === '~') { e.push(['x', -1, ms]); }
    else { const c = nodes[cur].children.find((x) => nodes[x].label === step); if (c === undefined) throw new Error(`No child ${step} under ${nodes[cur].label}`); cur = c; e.push(['o', c, ms]); }
  }
  return { e, r, ms };
}
export function exampleResults(study = exampleStudy()) {
  const { nodes } = parseTree(study.tr);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const out = [];
  for (let p = 0; p < 14; p++) {
    const k = study.tk.map((_, ti) => {
      // Rotate who gets which script so each person mixes outcomes.
      const flat = EXAMPLE_SCRIPTS[ti].flatMap(([s, c]) => Array(c).fill(s));
      const s = flat[(p * [3, 5, 9, 11, 13][ti % 5] + ti * 2) % flat.length];
      const run = runScript(nodes, s, rnd);
      const success = study.tk[ti].a.includes(run.r);
      return { t: ti, ...run, c: success ? 5 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3), q: success ? 5 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3) };
    });
    out.push({ v: 1, s: study.id, p: `P${p + 1}`, d: Date.UTC(2026, 9, 1 + p), k });
  }
  return out;
}

// localStorage of moderated sessions, by study id. Every access is wrapped: storage can be blocked.
const KEY = (id) => `uxatlas:tree-test:${id}`;
export function loadSessions(id) { try { const v = JSON.parse(localStorage.getItem(KEY(id)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveSession(id, code) { try { const all = loadSessions(id); if (!all.includes(code)) all.push(code); localStorage.setItem(KEY(id), JSON.stringify(all)); return true; } catch { return false; } }
export function clearSessions(id) { try { localStorage.removeItem(KEY(id)); return true; } catch { return false; } }
