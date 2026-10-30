// Site search analytics from a pasted query log: zero-result rate, refinement and reformulation, search exits,
// click-through, query concentration (head, torso, tail and Gini) and top queries, with intervals that respect
// sessions. Pure functions; checked by server/scripts/check-signals.js.
import { wilsonCI, zConf, toNum, parseLines, rng, gini, fmt, pctText, intText } from './signals-core.js';

export const normalise = (q) => String(q ?? '').toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '').trim();
const tokens = (q) => q.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
// Two queries are related (a reformulation) when one contains the other or they share a word of two or more letters.
export function related(a, b) {
  if (!a || !b || a === b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(tokens(a)); return tokens(b).some((t) => ta.has(t));
}

// "session, query, results, clicks" per line, in time order within each session. A header line is skipped.
export function parseLog(text) {
  const rows = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    if (c.length < 2) { bad.push(i + 1); return; }
    const results = c[2] === undefined || c[2] === '' ? NaN : toNum(c[2]), clicks = c[3] === undefined || c[3] === '' ? NaN : toNum(c[3]);
    if (i === 0 && !Number.isFinite(results) && /result|count|hits/i.test(c[2] || '')) return;
    const q = normalise(c[1]);
    if (!c[0] || !q) { bad.push(i + 1); return; }
    rows.push({ session: c[0], query: q, results, clicks });
  });
  return { rows, bad };
}

// Ratio of sums over sessions, with the cluster-robust (linearisation) standard error:
// R = Σyₛ / Σnₛ, Var(R) = S/(S − 1) · Σ (yₛ − R nₛ)² / (Σnₛ)². This equals OLS of y on a constant with standard errors
// clustered by session (statsmodels cov_type='cluster').
export function clusteredRate(perSession, conf = 0.95) {
  const S = perSession.length, Y = perSession.reduce((s, x) => s + x.y, 0), N = perSession.reduce((s, x) => s + x.n, 0);
  if (!(N > 0)) return { rate: NaN, lo: NaN, hi: NaN, se: NaN, x: 0, n: 0 };
  const R = Y / N;
  const ss = perSession.reduce((s, x) => s + (x.y - R * x.n) ** 2, 0);
  const se = S > 1 ? Math.sqrt((S / (S - 1)) * ss) / N : NaN, z = zConf(conf);
  return { rate: R, se, lo: Math.max(0, R - z * se), hi: Math.min(1, R + z * se), x: Y, n: N };
}

export function analyse(rows, { head = 0.5, torso = 0.8, conf = 0.95, top = 15 } = {}) {
  if (rows.length < 5) return null;
  const sessions = new Map();
  rows.forEach((r) => { if (!sessions.has(r.session)) sessions.set(r.session, []); sessions.get(r.session).push(r); });
  const hasResults = rows.some((r) => Number.isFinite(r.results)), hasClicks = rows.some((r) => Number.isFinite(r.clicks));
  const events = [];
  const per = { zero: [], click: [], refine: [], reform: [], exit: [], repeat: [] };
  const pairs = new Map();
  for (const list of sessions.values()) {
    const acc = { zero: [0, 0], click: [0, 0], refine: [0, 0], reform: [0, 0], exit: [0, 0], repeat: [0, 0] };
    list.forEach((r, i) => {
      const next = list[i + 1];
      const e = { ...r, zero: r.results === 0, clicked: r.clicks > 0, refined: !!next, repeat: !!next && next.query === r.query, reform: !!next && related(r.query, next.query), next: next?.query };
      e.exit = !next && !(r.clicks > 0);
      events.push(e);
      if (Number.isFinite(r.results)) { acc.zero[1]++; if (e.zero) acc.zero[0]++; }
      if (Number.isFinite(r.clicks)) { acc.click[1]++; if (e.clicked) acc.click[0]++; acc.exit[1]++; if (e.exit) acc.exit[0]++; }
      acc.refine[1]++; if (e.refined) acc.refine[0]++;
      acc.reform[1]++; if (e.reform) acc.reform[0]++;
      acc.repeat[1]++; if (e.repeat) acc.repeat[0]++;
      if (e.refined && !e.repeat) { const k = `${r.query} → ${next.query}`; pairs.set(k, (pairs.get(k) || 0) + 1); }
    });
    for (const k of Object.keys(per)) per[k].push({ y: acc[k][0], n: acc[k][1] });
  }
  const rate = Object.fromEntries(Object.entries(per).map(([k, v]) => [k, clusteredRate(v, conf)]));
  // Session-level: share of sessions with at least one zero-result search, and sessions that end in a search exit.
  const S = sessions.size;
  const sessZero = [...sessions.values()].filter((l) => l.some((r) => r.results === 0)).length;
  const sessExit = [...sessions.values()].filter((l) => { const last = l[l.length - 1]; return Number.isFinite(last.clicks) && !(last.clicks > 0); }).length;
  const multi = [...sessions.values()].filter((l) => l.length > 1).length;
  // Query concentration.
  const qmap = new Map();
  events.forEach((e) => {
    const q = qmap.get(e.query) || { query: e.query, n: 0, zero: 0, withResults: 0, clicks: 0, withClicks: 0, refine: 0, exits: 0 };
    q.n++; if (Number.isFinite(e.results)) { q.withResults++; if (e.zero) q.zero++; }
    if (Number.isFinite(e.clicks)) { q.withClicks++; if (e.clicked) q.clicks++; if (e.exit) q.exits++; }
    if (e.refined && !e.repeat) q.refine++;
    qmap.set(e.query, q);
  });
  const qs = [...qmap.values()].sort((a, b) => b.n - a.n || a.query.localeCompare(b.query));
  const total = events.length; let cum = 0;
  qs.forEach((q, i) => { q.rank = i + 1; q.share = q.n / total; const before = cum; cum += q.share; q.cum = cum; q.band = before < head - 1e-12 ? 'head' : before < torso - 1e-12 ? 'torso' : 'tail'; });
  const band = (b) => { const list = qs.filter((q) => q.band === b); return { queries: list.length, searches: list.reduce((s, q) => s + q.n, 0), share: list.reduce((s, q) => s + q.share, 0) }; };
  const once = qs.filter((q) => q.n === 1).length;
  const zeroQueries = qs.filter((q) => q.zero > 0).sort((a, b) => b.zero - a.zero || b.n - a.n);
  return {
    searches: total, sessions: S, distinct: qs.length, perSession: total / S, hasResults, hasClicks,
    rate, sessZero: { x: sessZero, n: S, p: sessZero / S, ...wilsonCI(sessZero, S, conf) }, sessExit: { x: sessExit, n: S, p: sessExit / S, ...wilsonCI(sessExit, S, conf) },
    multi, queries: qs, top: qs.slice(0, top), zeroQueries: zeroQueries.slice(0, top),
    pairs: [...pairs].map(([k, n]) => ({ pair: k, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    head: band('head'), torso: band('torso'), tail: band('tail'), cuts: { head, torso },
    gini: gini(qs.map((q) => q.n)), onceShare: once / qs.length, onceSearches: once / total, conf,
  };
}

// Example: an intranet-style site search log, 260 sessions, generated deterministically.
const VOCAB = [
  ['opening hours', 120, 0.95], ['parking', 70, 0.95], ['contact', 65, 0.9], ['login', 60, 0.85], ['refund', 55, 0.9], ['returns policy', 45, 0.9],
  ['delivery times', 40, 0.85], ['gift card', 32, 0.8], ['track order', 30, 0.75], ['size guide', 28, 0.8], ['click and collect', 22, 0.7], ['careers', 20, 0.9],
  ['student discount', 18, 0.6], ['price match', 14, 0.5], ['loyalty points', 14, 0.7], ['klarna', 12, 0], ['afterpay', 9, 0], ['vegan', 9, 0.6],
  ['store finder', 8, 0.9], ['black friday', 8, 0.5], ['warranty', 7, 0.7], ['cancel order', 7, 0.6], ['change address', 6, 0.5], ['invoice', 6, 0.4],
];
const RELATED = { refund: 'returns policy', 'returns policy': 'refund', 'track order': 'delivery times', klarna: 'pay later', afterpay: 'pay later', 'price match': 'price promise', 'cancel order': 'cancel my order', 'student discount': 'student', login: 'account login', invoice: 'vat receipt' };
const RARE = ['opening hours sunday', 'parking cost', 'returns without receipt', 'gift card balance', 'black friday dates', 'size guide shoes', 'refund how long', 'delivery to ireland', 'contact phone number', 'warranty claim', 'loyalty card lost', 'careers part time', 'pay later', 'price promise', 'cancel my order', 'student', 'account login', 'vat receipt', 'opening hours christmas', 'parking permit', 'gluten free', 'recycle batteries', 'click and collect time', 'exchange', 'faulty item'];
const ZERO_RARE = new Set(['pay later', 'price promise', 'gluten free', 'recycle batteries', 'vat receipt', 'delivery to ireland']);
export function exampleLog(S = 400, seed = 11) {
  const r = rng(seed), tot = VOCAB.reduce((s, v) => s + v[1], 0);
  const pick = () => { let u = r() * tot; for (const v of VOCAB) { u -= v[1]; if (u <= 0) return v; } return VOCAB[0]; };
  const lines = ['# session, query, results, clicks'];
  for (let s = 1; s <= S; s++) {
    let [q, , ok] = pick(); if (r() < 0.18) q = RARE[Math.floor(r() * RARE.length)];
    const steps = 1 + (r() < 0.32 ? 1 : 0) + (r() < 0.08 ? 1 : 0);
    for (let k = 0; k < steps; k++) {
      const v = VOCAB.find((x) => x[0] === q);
      const zero = ZERO_RARE.has(q) || (v ? v[2] === 0 : /help|today/.test(q));
      const results = zero ? 0 : 3 + Math.floor(r() * 60);
      const clickP = zero ? 0 : (v ? v[2] : 0.6) * 0.8;
      const last = k === steps - 1;
      const clicks = !last && !zero ? (r() < 0.3 ? 1 : 0) : r() < clickP ? 1 + Math.floor(r() * 2) : 0;
      lines.push(`s${String(s).padStart(3, '0')}, ${q}, ${results}, ${clicks}`);
      if (!last) q = RELATED[q] || (r() < 0.5 ? `${q} ${['uk', 'help', 'online', 'today'][Math.floor(r() * 4)]}` : pick()[0]);
    }
  }
  return lines.join('\n');
}

// ── Reading your results ──
// Confidence rule: "high" with at least 200 sessions and 500 searches, "medium" with at least 50 sessions,
// "low" below that. Rates are clustered by session, so the number of sessions limits precision.
export function summary(a) {
  const z = a.rate.zero, ex = a.rate.exit, rf = a.rate.refine, ct = a.rate.click;
  const confidence = a.sessions >= 200 && a.searches >= 500 ? 'high' : a.sessions >= 50 ? 'medium' : 'low';
  const worst = a.zeroQueries[0];
  const rateLine = (lbl, x) => `${lbl} ${pctText(x.rate, 1)} (95% CI ${pctText(x.lo, 1)} to ${pctText(x.hi, 1)})`;
  const meaning = [];
  if (a.hasResults) meaning.push(`${rateLine('Zero-result rate:', z)}. ${worst ? `The most frequent query with no results is "${worst.query}" (${worst.zero} of ${worst.n} searches). ` : ''}Zero-result queries are the clearest content and synonym gaps; fixing the top few usually covers most of them.`);
  meaning.push(`${rateLine('Refinement rate (another search follows in the same session):', rf)}; ${pctText(a.rate.reform.rate, 1)} of searches are followed by a related rewording. A high refinement rate means the first results often miss.`);
  if (a.hasClicks) meaning.push(`${rateLine('Search exit rate (the last search in a session, with no click):', ex)}; click-through is ${pctText(ct.rate, 1)}.`);
  meaning.push(`Concentration: the top ${a.head.queries} distinct quer${a.head.queries === 1 ? 'y covers' : 'ies cover'} ${pctText(a.head.share, 0)} of searches (the head), and ${pctText(a.onceShare, 0)} of distinct queries were searched only once (the long tail). Gini of query frequencies: ${fmt(a.gini, 2)}. Rosenfeld (2011, "Search Analytics for Your Site") recommends working from the head down, because a small set of queries carries a large share of the traffic.`);
  return {
    headline: a.hasResults
      ? `Zero-result rate ${pctText(z.rate, 1)} and refinement rate ${pctText(rf.rate, 1)} across ${intText(a.searches)} searches in ${intText(a.sessions)} sessions.`
      : `Refinement rate ${pctText(rf.rate, 1)} across ${intText(a.searches)} searches in ${intText(a.sessions)} sessions (no result counts were given).`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong with at least 200 sessions and 500 searches, some evidence from 50 sessions, weak below that. Intervals treat each session as one independent unit, because searches in one session are related. Here: ${intText(a.sessions)} sessions, ${intText(a.searches)} searches.`,
    caveats: [
      'Search exits are inferred: the log shows the last search without a click, not whether the person left the site or found the answer on the results page.',
      'Refinement is not always failure: people narrow good results too. Read the most common query pairs before calling a query a problem.',
    ],
    next: [
      a.hasResults && worst ? `Fix the top zero-result queries first ("${worst.query}" and the rest of that list): add synonyms, best bets or the missing content.` : 'Log the number of results per search so zero-result queries can be found.',
      'Re-run this on next month\'s log and compare the zero-result and exit rates; check the change against the intervals before calling it an improvement.',
    ],
    report: `Across ${intText(a.searches)} site searches in ${intText(a.sessions)} sessions, ${a.hasResults ? `${pctText(z.rate, 1)} returned no results (95% CI ${pctText(z.lo, 1)} to ${pctText(z.hi, 1)}, clustered by session), ` : ''}${pctText(rf.rate, 1)} were followed by another search${a.hasClicks ? ` and ${pctText(ex.rate, 1)} ended the session without a click` : ''}. The top ${a.head.queries > 1 ? `${a.head.queries} queries` : 'query'} made up ${pctText(a.head.share, 0)} of searches.`,
  };
}
