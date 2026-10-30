// Top task analysis (Gerry McGovern): votes per task, vote share with intervals, the long neck, cumulative share,
// statistically separable tiers and task groups. Pure functions; checked by server/scripts/check-signals.js.
import { wilsonCI, normSf, toNum, parseLines, rng, fmt, pctText, pText, intText } from './signals-core.js';

// "task, votes[, group]" per line.
export function parseTotals(text) {
  const tasks = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    const v = toNum(c[1]);
    if (!c[0] || !Number.isFinite(v) || v < 0) bad.push(i + 1); else tasks.push({ name: c[0], votes: Math.round(v), group: c[2] || '' });
  });
  return { tasks, bad };
}
// One respondent per line, their chosen tasks separated by ; or |. Duplicate picks on one ballot count once.
export function parseBallots(text) {
  const ballots = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => [...new Set(l.split(/\s*[;|]\s*/).map((t) => t.trim()).filter(Boolean))]);
  const count = new Map();
  ballots.forEach((b) => b.forEach((t) => count.set(t, (count.get(t) || 0) + 1)));
  return { ballots, tasks: [...count].map(([name, votes]) => ({ name, votes, group: '' })) };
}

// Analysis. tasks: [{ name, votes, group }]; N respondents. ballots (optional) gives exact co-selection for tier tests
// and pick-any rates for groups. alpha: the test level for tiers.
export function analyse(tasks, N, { conf = 0.95, alpha = 0.05, ballots = null } = {}) {
  const sorted = [...tasks].filter((t) => t.votes >= 0).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const V = sorted.reduce((s, t) => s + t.votes, 0), n = sorted.length;
  if (!(N > 0) || !(V > 0) || n < 2) return null;
  const perResp = V / N;
  let cum = 0;
  const rows = sorted.map((t, i) => {
    const pick = t.votes / N, ci = wilsonCI(Math.min(t.votes, N), N, conf);
    cum += t.votes / V;
    // Vote share = votes / all votes. Its interval rescales the respondent-level Wilson interval by N / V, treating the
    // average number of votes per respondent as fixed (each respondent can vote for a task at most once).
    return { ...t, rank: i + 1, share: t.votes / V, shareLo: ci.lo / perResp, shareHi: ci.hi / perResp, pick, pickLo: ci.lo, pickHi: ci.hi, cum };
  });
  // Co-selection: share of respondents who picked both tasks (exact from ballots, otherwise assumed independent).
  const index = new Map(rows.map((r, i) => [r.name, i]));
  let both = null;
  if (ballots) {
    both = new Map();
    for (const b of ballots) {
      const ids = b.map((t) => index.get(t)).filter((x) => x !== undefined);
      for (const i of ids) for (const j of ids) if (i < j) { const k = `${i}|${j}`; both.set(k, (both.get(k) || 0) + 1); }
    }
  }
  const pBoth = (i, j) => (both ? (both.get(i < j ? `${i}|${j}` : `${j}|${i}`) || 0) / N : rows[i].pick * rows[j].pick);
  // z test of two pick rates from the same respondents: Var(p̂ᵢ − p̂ⱼ) = [pᵢ(1 − pᵢ) + pⱼ(1 − pⱼ) − 2(pᵢⱼ − pᵢpⱼ)] / N.
  const compare = (i, j) => {
    const a = rows[i].pick, b = rows[j].pick, v = (a * (1 - a) + b * (1 - b) - 2 * (pBoth(i, j) - a * b)) / N;
    const z = v > 0 ? (a - b) / Math.sqrt(v) : (a === b ? 0 : Infinity);
    return { z, p: 2 * normSf(Math.abs(z)) };
  };
  // Tiers: a new tier starts at the first task whose pick rate is significantly below the current tier's leader.
  let tier = 1, leader = 0;
  rows.forEach((r, i) => {
    if (i > 0) { const c = compare(leader, i); if (c.p < alpha) { tier++; leader = i; } }
    r.tier = tier;
  });
  for (let i = 0; i < n - 1; i++) { const c = compare(i, i + 1); rows[i].nextZ = c.z; rows[i].nextP = c.p; }
  // Long neck: the fewest tasks that together take a quarter of the vote; and the bottom half's share.
  const neck = rows.findIndex((r) => r.cum >= 0.25 - 1e-12) + 1;
  const half = Math.ceil(n / 2), bottomHalf = rows.slice(n - half).reduce((s, r) => s + r.share, 0);
  const top5 = Math.max(1, Math.ceil(n * 0.05)), top5Share = rows.slice(0, top5).reduce((s, r) => s + r.share, 0);
  const top10 = Math.max(1, Math.ceil(n * 0.1)), top10Share = rows.slice(0, top10).reduce((s, r) => s + r.share, 0);
  // Groups: vote share per group; with ballots also the share of respondents who picked any task in the group.
  const gmap = new Map();
  rows.forEach((r) => { if (r.group) { const g = gmap.get(r.group) || { name: r.group, votes: 0, tasks: 0 }; g.votes += r.votes; g.tasks++; gmap.set(r.group, g); } });
  const groups = [...gmap.values()].map((g) => {
    let any = null;
    if (ballots) {
      const members = new Set(rows.filter((r) => r.group === g.name).map((r) => r.name));
      const x = ballots.filter((b) => b.some((t) => members.has(t))).length;
      any = { x, p: x / N, ...wilsonCI(x, N, conf) };
    }
    return { ...g, share: g.votes / V, perTask: g.votes / V / g.tasks, any };
  }).sort((a, b) => b.votes - a.votes);
  return { rows, N, V, n, perResp, neck, half, bottomHalf, top5, top5Share, top10, top10Share, groups, tiers: tier, topTier: rows.filter((r) => r.tier === 1), conf, alpha, exactPairs: !!ballots };
}

// Example: 36 tasks on a university website, 412 respondents voting for up to 5. Votes follow a long-neck curve.
export const EXAMPLE_TASKS = [
  ['Course entry requirements', 'Study'], ['Course fees and funding', 'Study'], ['How to apply', 'Study'], ['Course content and modules', 'Study'],
  ['Application deadlines', 'Study'], ['Scholarships', 'Money'], ['Student accommodation', 'Student life'], ['Timetables', 'Current students'],
  ['Exam results', 'Current students'], ['Term dates', 'Current students'], ['Library opening hours', 'Current students'], ['Campus maps and directions', 'Visit'],
  ['Open days', 'Visit'], ['Graduate job prospects', 'Study'], ['Student loans', 'Money'], ['Contact a department', 'About'],
  ['Clubs and societies', 'Student life'], ['Mental health support', 'Student life'], ['Disability support', 'Student life'], ['International visas', 'Study'],
  ['Part-time study', 'Study'], ['IT and Wi-Fi help', 'Current students'], ['Parking', 'Visit'], ['Research projects', 'About'],
  ['Staff directory', 'About'], ['News', 'About'], ['Events calendar', 'About'], ['Rankings and league tables', 'About'],
  ['Alumni services', 'About'], ['Sports facilities', 'Student life'], ['Catering on campus', 'Student life'], ['Job vacancies', 'About'],
  ['Strategy and governance', 'About'], ['Freedom of information', 'About'], ['History of the university', 'About'], ['Press office', 'About'],
];
export function exampleBallots(N = 412, seed = 7, off = 4, ex = 1.2) {
  const r = rng(seed), k = EXAMPLE_TASKS.length;
  const w = EXAMPLE_TASKS.map((_, i) => 1 / (i + off) ** ex);
  const out = [];
  for (let p = 0; p < N; p++) {
    const want = 3 + Math.floor(r() * 3), picked = new Set();
    while (picked.size < want) {
      let u = r() * w.reduce((s, x, i) => s + (picked.has(i) ? 0 : x), 0);
      for (let i = 0; i < k; i++) { if (picked.has(i)) continue; u -= w[i]; if (u <= 0) { picked.add(i); break; } }
    }
    out.push([...picked].map((i) => EXAMPLE_TASKS[i][0]));
  }
  return out;
}
export function exampleTotalsText() {
  const b = exampleBallots(), c = new Map(); b.forEach((x) => x.forEach((t) => c.set(t, (c.get(t) || 0) + 1)));
  return ['# task, votes, group (optional)', ...EXAMPLE_TASKS.map(([t, g]) => `${t}, ${c.get(t) || 0}, ${g}`)].join('\n');
}
export const exampleBallotsText = () => ['# one respondent per line; separate their chosen tasks with ;', ...exampleBallots().map((b) => b.join('; '))].join('\n');
export const exampleGroups = () => Object.fromEntries(EXAMPLE_TASKS);

// ── Reading your results ──
// Confidence rule: "high" when there are at least 400 respondents and the top tier is separated from the next task by
// a significant test; "medium" with at least 100 respondents; "low" otherwise. 400 voters gives a margin of about ±5
// percentage points on a pick rate near 50%, enough to rank tasks that are a few points apart.
export function summary(a) {
  const top = a.topTier, sep = a.tiers > 1;
  const confidence = a.N >= 400 && sep ? 'high' : a.N >= 100 ? 'medium' : 'low';
  const names = top.slice(0, 6).map((r) => `"${r.name}"`).join(', ');
  const neckShare = a.rows[a.neck - 1].cum;
  const lead = a.rows[0];
  const meaning = [
    `${a.neck} of ${a.n} tasks (${pctText(a.neck / a.n, 0)}) take a quarter of all votes, while the bottom half of the list (${a.half} tasks) shares ${pctText(a.bottomHalf, 0)}. McGovern (2018, "Top Tasks: A How-to Guide") reports this long-neck pattern in study after study: a handful of tasks at the top get about as much of the vote as the whole bottom half.`,
    `The top task, "${lead.name}", was picked by ${pctText(lead.pick, 0)} of respondents (95% CI ${pctText(lead.pickLo, 0)} to ${pctText(lead.pickHi, 0)}) and holds ${pctText(lead.share, 1)} of all votes.`,
    sep ? `The first tier (tasks no significantly less popular than the leader) holds ${top.length} task${top.length > 1 ? 's' : ''}: ${names}${top.length > 6 ? ' …' : ''}. Tasks within a tier cannot be ranked reliably from this sample.` : 'No task is significantly less popular than the top task, so the sample cannot separate any tiers yet.',
    a.perResp > 5.5 ? `Respondents cast ${fmt(a.perResp, 1)} votes each on average; McGovern's method asks for up to 5. More votes per person flatten the curve.` : `Respondents cast ${fmt(a.perResp, 1)} votes each on average (the method asks for up to 5).`,
  ];
  if (a.groups.length) meaning.push(`By group, "${a.groups[0].name}" takes the largest share of votes (${pctText(a.groups[0].share, 0)} across ${a.groups[0].tasks} tasks).`);
  return {
    headline: `The top ${a.neck > 1 ? `${a.neck} tasks take` : 'task takes'} ${pctText(neckShare, 0)} of the vote from ${intText(a.N)} respondents; "${lead.name}" leads with ${pctText(lead.share, 1)} of votes.`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong when there are at least 400 respondents and the top tier is statistically separated from the rest; some evidence from 100 respondents; weak below that. Here: ${intText(a.N)} respondents and ${a.tiers} tier${a.tiers > 1 ? 's' : ''}${a.exactPairs ? ' (tests use the exact overlap between ballots)' : ' (tests assume picks of two tasks are independent, because only totals were given)'}.`,
    caveats: [
      'Vote share depends on the list: splitting one task into two halves its votes. Check that tasks are written at the same level and in the users\' words before reading the ranking.',
      'Top tasks show what matters most to the people who answered. If the survey reached mostly current customers, prospective customers\' tasks will be under-ranked.',
    ],
    next: [
      'Measure how well the top tasks work now: task success and time for each, with the [Completion rate interval](/calculators/completion-rate) and [Task time interval](/calculators/task-time).',
      'Use the tail as a list of things to de-emphasise in navigation, not to delete without checking who needs them.',
    ],
    report: `In a top task survey of ${intText(a.N)} respondents (${intText(a.V)} votes over ${a.n} tasks), the top ${a.neck > 1 ? `${a.neck} tasks` : 'task'} took ${pctText(neckShare, 0)} of the vote and the bottom half of the list took ${pctText(a.bottomHalf, 0)}. "${lead.name}" led with ${pctText(lead.share, 1)} of votes (picked by ${pctText(lead.pick, 0)} of respondents, 95% CI ${pctText(lead.pickLo, 0)} to ${pctText(lead.pickHi, 0)}).`,
  };
}
export { pText };
