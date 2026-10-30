// Use FMEA: failure modes with severity (S), occurrence (O) and detection (D) ratings from 1 to 10, the risk priority
// number RPN = S × O × D, the AIAG-VDA action priority (AP) and residual risk after actions. Pure functions; checked
// in server/scripts/check-decisions.js.
import { nonEmptyLines, splitCells, toCsv, fmt } from './decisions-core.js';

// AIAG & VDA FMEA Handbook (1st edition, 2019), Action Priority table for design and process FMEA. Rows: severity
// band × occurrence band; columns: detection bands 7–10, 5–6, 2–4, 1. H = high, M = medium, L = low priority.
const AP_TABLE = {
  '9-10': { '8-10': 'HHHH', '6-7': 'HHHH', '4-5': 'HHHM', '2-3': 'HMLL', '1': 'LLLL' },
  '7-8': { '8-10': 'HHHH', '6-7': 'HHHM', '4-5': 'HMMM', '2-3': 'MMLL', '1': 'LLLL' },
  '4-6': { '8-10': 'HHMM', '6-7': 'MMML', '4-5': 'MLLL', '2-3': 'LLLL', '1': 'LLLL' },
  '2-3': { '8-10': 'MMLL', '6-7': 'LLLL', '4-5': 'LLLL', '2-3': 'LLLL', '1': 'LLLL' },
  '1': { '8-10': 'LLLL', '6-7': 'LLLL', '4-5': 'LLLL', '2-3': 'LLLL', '1': 'LLLL' },
};
const sBand = (s) => (s >= 9 ? '9-10' : s >= 7 ? '7-8' : s >= 4 ? '4-6' : s >= 2 ? '2-3' : '1');
const oBand = (o) => (o >= 8 ? '8-10' : o >= 6 ? '6-7' : o >= 4 ? '4-5' : o >= 2 ? '2-3' : '1');
const dCol = (d) => (d >= 7 ? 0 : d >= 5 ? 1 : d >= 2 ? 2 : 3);
export const validRating = (v) => Number.isInteger(v) && v >= 1 && v <= 10;
export function actionPriority(s, o, d) {
  if (![s, o, d].every(validRating)) return null;
  return AP_TABLE[sBand(s)][oBand(o)][dCol(d)];
}
export const rpn = (s, o, d) => ([s, o, d].every(validRating) ? s * o * d : NaN);
export const AP_RANK = { H: 3, M: 2, L: 1 };
export const AP_NAME = { H: 'High', M: 'Medium', L: 'Low' };

export const FIELDS = [
  ['step', 'Task step'], ['mode', 'Use error (failure mode)'], ['effect', 'Effect / harm'], ['cause', 'Cause'], ['controls', 'Current controls'],
  ['s', 'S'], ['o', 'O'], ['d', 'D'], ['action', 'Recommended action'], ['s2', 'S after'], ['o2', 'O after'], ['d2', 'D after'],
];
const HEAD_ALIASES = {
  step: ['task step', 'step', 'task', 'function'], mode: ['use error (failure mode)', 'use error', 'failure mode', 'mode'], effect: ['effect / harm', 'effect', 'harm', 'effects'],
  cause: ['cause', 'causes'], controls: ['current controls', 'controls', 'control'], s: ['s', 'severity', 'sev'], o: ['o', 'occurrence', 'occ'], d: ['d', 'detection', 'det'],
  action: ['recommended action', 'action', 'actions', 'mitigation'], s2: ['s after', 's2', 'severity after', 'new s'], o2: ['o after', 'o2', 'occurrence after', 'new o'], d2: ['d after', 'd2', 'detection after', 'new d'],
};

// One row with every derived value: RPN and AP before and after the action, and the reduction.
export function scoreRow(r) {
  const n = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  const s = n(r.s), o = n(r.o), d = n(r.d);
  const s2 = r.s2 === '' || r.s2 === undefined ? NaN : n(r.s2), o2 = r.o2 === '' || r.o2 === undefined ? NaN : n(r.o2), d2 = r.d2 === '' || r.d2 === undefined ? NaN : n(r.d2);
  const after = [s2, o2, d2].every(Number.isFinite);
  return {
    ...r, S: s, O: o, D: d, rpn: rpn(s, o, d), ap: actionPriority(s, o, d), valid: [s, o, d].every(validRating),
    after, rpn2: after ? rpn(s2, o2, d2) : NaN, ap2: after ? actionPriority(s2, o2, d2) : null, S2: s2, O2: o2, D2: d2,
  };
}

// Order: action priority, then severity, then occurrence, then RPN (the handbook prioritises by AP and, within it, by
// severity first; RPN only breaks ties).
export function analyseFmea(rows) {
  const scored = rows.map((r, i) => ({ ...scoreRow(r), idx: i }));
  const valid = scored.filter((r) => r.valid);
  const byAp = [...valid].sort((a, b) => AP_RANK[b.ap] - AP_RANK[a.ap] || b.S - a.S || b.O - a.O || b.rpn - a.rpn);
  const byRpn = [...valid].sort((a, b) => b.rpn - a.rpn || b.S - a.S);
  const count = (k, key = 'ap') => valid.filter((r) => r[key] === k).length;
  const withAfter = valid.filter((r) => r.after && Number.isFinite(r.rpn2));
  const so = Array.from({ length: 10 }, () => new Array(10).fill(0));
  valid.forEach((r) => { so[r.S - 1][r.O - 1]++; });
  // Rank disagreement: how many of the top AP-ranked items (as many as there are High items, at least 3) are missing
  // from the same number of top RPN items.
  const k = Math.min(valid.length, Math.max(3, count('H')));
  const topAp = new Set(byAp.slice(0, k).map((r) => r.idx)), topRpn = new Set(byRpn.slice(0, k).map((r) => r.idx));
  const disagree = [...topAp].filter((i) => !topRpn.has(i)).length;
  const highSevLowRpn = valid.filter((r) => r.S >= 9 && r.rpn < 100);
  return {
    rows: scored, valid, byAp, byRpn, so, k, disagree, highSevLowRpn,
    counts: { H: count('H'), M: count('M'), L: count('L') },
    after: { n: withAfter.length, H: withAfter.filter((r) => r.ap2 === 'H').length, before: withAfter.reduce((a, r) => a + r.rpn, 0), afterSum: withAfter.reduce((a, r) => a + r.rpn2, 0), rows: withAfter },
    invalid: scored.filter((r) => !r.valid),
  };
}

// CSV import: a header row naming the columns (any order), or columns in the FIELDS order.
export function parseFmeaCsv(text) {
  const lines = nonEmptyLines(text);
  if (!lines.length) return { rows: [], errors: ['Paste at least one row.'] };
  const first = splitCells(lines[0]).map((h) => h.toLowerCase().trim());
  const map = {};
  first.forEach((h, j) => { for (const [k, al] of Object.entries(HEAD_ALIASES)) if (al.includes(h) && !(k in map)) map[k] = j; });
  const hasHead = 's' in map && 'o' in map && 'd' in map;
  const order = hasHead ? map : Object.fromEntries(FIELDS.map(([k], j) => [k, j]));
  const rows = (hasHead ? lines.slice(1) : lines).map((l) => {
    const c = splitCells(l);
    return Object.fromEntries(FIELDS.map(([k]) => [k, order[k] !== undefined ? (c[order[k]] ?? '') : '']));
  });
  return { rows, errors: [] };
}
export function fmeaCsv(rows) {
  const sc = rows.map(scoreRow);
  return toCsv([[...FIELDS.map(([, l]) => l), 'RPN', 'AP', 'RPN after', 'AP after'], ...sc.map((r) => [...FIELDS.map(([k]) => r[k] ?? ''), Number.isFinite(r.rpn) ? r.rpn : '', r.ap ? AP_NAME[r.ap] : '', Number.isFinite(r.rpn2) ? r.rpn2 : '', r.ap2 ? AP_NAME[r.ap2] : ''])]);
}

// "Reading your results" summary.
// Confidence rule (how clear the priorities are; S, O and D are team judgements, not measurements):
//   high   — every row is fully rated, and action priority and RPN agree on the top items (no more than one of the top
//            k AP items is missing from the top k by RPN);
//   medium — the two rankings disagree on two or more of the top items, or a severity 9–10 item has an RPN under 100
//            (so an RPN ranking alone would bury it);
//   low    — some rows are not fully rated, or fewer than three failure modes are rated.
export function fmeaSummary(a) {
  const nV = a.valid.length;
  const confidence = a.invalid.length || nV < 3 ? 'low' : a.disagree >= 2 || a.highSevLowRpn.length ? 'medium' : 'high';
  const top = a.byAp[0];
  const headline = nV
    ? `${a.counts.H} of ${nV} use errors are High action priority; the first to address is "${top.mode || top.step}" (S ${top.S}, O ${top.O}, D ${top.D}, RPN ${top.rpn}).`
    : 'No failure modes are fully rated yet.';
  const meaning = [
    `Action priority (AIAG-VDA 2019) puts severity first, then occurrence, then detection: High means act, Medium means act or justify why not, Low means act if you can. Counts: ${a.counts.H} High, ${a.counts.M} Medium, ${a.counts.L} Low.`,
    a.disagree ? `Ranking by RPN alone would order the top ${a.k} differently: ${a.disagree} of them would drop out, because RPN treats a 1-point change in detection the same as a 1-point change in severity.` : `Ranking by RPN gives the same top ${a.k} items as action priority.`,
  ];
  if (a.highSevLowRpn.length) meaning.push(`${a.highSevLowRpn.length} item${a.highSevLowRpn.length === 1 ? ' has' : 's have'} severity 9–10 but an RPN under 100 (${a.highSevLowRpn.slice(0, 2).map((r) => `"${r.mode || r.step}"`).join(', ')}); in a use-related risk analysis these deserve attention regardless of RPN.`);
  if (a.after.n) meaning.push(`For the ${a.after.n} item${a.after.n === 1 ? '' : 's'} with planned actions, total RPN falls from ${fmt(a.after.before)} to ${fmt(a.after.afterSum)} (${fmt(100 * (1 - a.after.afterSum / a.after.before))}% lower); ${a.after.H} would still be High priority.`);
  const caveats = [
    'S, O and D are ordinal judgements: an RPN of 200 is not "twice as risky" as 100, and different combinations give the same RPN. Use the numbers to order discussion, not as a measure.',
    'Occurrence ratings for use errors are guesses until you have test or field data; revisit them after formative usability testing.',
  ];
  const next = [
    a.counts.H ? `Design mitigations for the ${a.counts.H} High items first, preferring design changes that remove the error over warnings or training.` : 'Check the Medium items and record why any will not be acted on.',
    'Validate the predicted use errors in a formative test (see [human error probability](/calculators/human-error) for task-level estimates) and update O and D.',
  ];
  const report = `A use FMEA of ${nV} failure modes found ${a.counts.H} High, ${a.counts.M} Medium and ${a.counts.L} Low action-priority items (AIAG-VDA 2019).${top ? ` Highest priority: "${top.mode || top.step}" (S${top.S} O${top.O} D${top.D}, RPN ${top.rpn}).` : ''}${a.after.n ? ` Planned actions reduce total RPN for ${a.after.n} items from ${fmt(a.after.before)} to ${fmt(a.after.afterSum)}.` : ''}`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'High when every row is rated and action priority and RPN agree on the top items; medium when they disagree on two or more top items or a severity 9–10 item has a low RPN; low when rows are unrated or fewer than three are rated. The ratings are team judgements, so this reflects how clear the priorities are, not measurement error.',
    caveats, next, report,
  };
}
