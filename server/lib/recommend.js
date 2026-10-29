import { listFields } from './fields.js';
// Rule-based method recommender. Scores every method against the finder answers,
// then optionally against the words in a free-text brief, and deals the best
// matches onto shelves by experience level with a little controlled variety.

const EFFORT = ['hours', 'days', 'weeks', 'months'];
const PARTICIPANTS = ['none', 'few', 'moderate', 'large'];

// What the team has to work with, mapped to the product stages it usually implies.
const MATERIAL_STAGES = {
  none: ['strategy', 'discovery'],
  concept: ['definition', 'design'],
  prototype: ['design', 'evaluation'],
  live: ['evaluation', 'post-launch'],
  data: ['post-launch', 'evaluation'],
};

const STOP = new Set(
  'a an and are as at be but by can do for from has have how i if in into is it its me my of on or our so that the their them they this to was we were what when where which who why will with you your users user product team want need'.split(' ')
);

export function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function haystack(m) {
  return [m.name, ...(m.aka || []), m.summary, m.useWhen, m.whereToUse, m.donor, m.family, ...(m.keywords || [])]
    .join(' ')
    .toLowerCase();
}

export function textScore(m, words) {
  if (!words.length) return 0;
  const h = haystack(m);
  let s = 0;
  for (const w of words) if (h.includes(w)) s += m.name.toLowerCase().includes(w) ? 3 : 1;
  return s / Math.sqrt(words.length);
}

function participantsFit(need, have) {
  if (!need || !have || have === 'any') return 0;
  if (need === 'none') return 1;
  if (need === 'logs') return have === 'logs' ? 3 : -4;
  if (have === 'logs') return -3;
  if (have === 'none') return -6;
  const gap = PARTICIPANTS.indexOf(need) - PARTICIPANTS.indexOf(have);
  return gap <= 0 ? 2 : -3 * gap;
}

// Goals the person picked come in order (first pick matters most); a method's goals
// are also ordered, with its main purpose first. A match on both firsts scores highest.
function goalScore(methodGoals = [], wanted = []) {
  let s = 0;
  wanted.forEach((g, i) => {
    const at = methodGoals.indexOf(g);
    if (at >= 0) s += (i === 0 ? 1 : i === 1 ? 0.8 : 0.6) * [1, 0.65, 0.45, 0.35][at];
  });
  return s;
}

function materialFit(needs = [], have) {
  if (!have || have === 'any' || !needs.length) return 0;
  if (needs.includes(have)) return 4;
  if (needs.includes('none') && have !== 'data') return 1; // works with people alone
  if (have === 'none' && needs.some((n) => n === 'prototype' || n === 'live')) return -6; // nothing to test yet
  if (have === 'data' && !needs.includes('data')) return -2;
  return -2;
}

export function scoreMethod(m, a = {}, words = []) {
  const f = m.facets || {};
  let s = 0;
  const why = [];

  if (a.goals?.length) {
    const g = goalScore(f.goals, a.goals);
    if (g > 0) { s += 10 * g; why.push(g >= 0.9 ? 'built for your goal' : 'matches your goal'); }
    else s -= 9;
  }
  const mat = materialFit(f.material, a.material);
  s += mat;
  if (mat >= 4) why.push('works with what you have');
  if (mat <= -6) why.push('needs something to test first');
  const stages = a.stage ? [a.stage] : MATERIAL_STAGES[a.material] || [];
  if (stages.some((st) => (f.stage || []).includes(st))) { s += 2; if (a.stage) why.push('fits your stage'); }
  if (a.data && a.data !== 'any') {
    if (f.data === a.data) s += 3;
    else if (f.data === 'mixed' || a.data === 'mixed') s += 1;
    else if (f.data === 'analytical') s += 0; // expert reviews and models can serve either kind of evidence
    else s -= 2;
  }
  const p = participantsFit(f.participants, a.participants);
  s += p;
  if (p < 0) why.push('needs more access than you have');
  if (a.time) {
    const gap = EFFORT.indexOf(f.effort) - EFFORT.indexOf(a.time);
    s += gap <= 0 ? 1.5 - 0.5 * Math.abs(gap) : -3 * gap; // prefer methods that use the time available
    if (gap > 0) why.push('takes longer than you have');
  }
  if (a.appetite === 'proven') s += m.status === 'active' ? 3 : m.status === 'community' ? (m.validation === 'tested' ? 0 : -2) : -2;
  if (a.appetite === 'lost') s += m.status === 'active' ? -2 : 3;
  if (m.status === 'community' && m.validation !== 'tested') s -= 1;

  s += textScore(m, words) * 2;
  return { score: s, why, fine: fineScore(m, a) };
}

// Finer-grained signals worth less than one point in total. They separate the many methods that
// tie on the coarse score above, which otherwise fall back to the data file's alphabetical order.
export function fineScore(m, a = {}) {
  const f = m.facets || {};
  const goals = f.goals || [];
  let s = 0;
  if (a.goals?.length) {
    if (goals[0] === a.goals[0]) s += 0.3; // the method's main purpose is the person's first goal
    s += 0.15 * (a.goals.filter((g) => goals.includes(g)).length / a.goals.length);
  }
  if (a.data && a.data !== 'any' && f.data === a.data) s += 0.1;
  if (a.participants && f.participants === a.participants) s += 0.1;
  if (a.time && f.effort === a.time) s += 0.1;
  // A fuller write-up is more useful to land on: steps to follow, when to use and avoid it, an example.
  s += 0.1 * Math.min((m.steps || []).length, 6) / 6;
  s += 0.05 * ['useWhen', 'avoidWhen', 'example', 'outputs'].filter((k) => m[k]?.length).length / 4;
  return s;
}

// Small deterministic generator so the same seed deals the same picks (server and static build agree).
function rng(seed) {
  let t = (seed >>> 0) || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// A stable draw in [0, 1) for one method under one seed. It depends only on the id and the seed,
// not on where the method sits in the list, so a new entry does not reshuffle everything after it.
export function seededDraw(id, seed = 1) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return rng((h ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0)();
}

// Equal coarse scores are ordered by the fine signals plus a seeded draw, so tied methods are
// shuffled per seed instead of always listing A to D first.
export function rank(methods, answers = {}, words = [], seed = 1) {
  return methods
    .map((m) => {
      const r = scoreMethod(m, answers, words);
      return { m, why: r.why, coarse: r.score, score: r.score + r.fine, tie: r.fine + 0.5 * seededDraw(m.id, seed) };
    })
    .sort((x, y) => y.coarse - x.coarse || y.tie - x.tie);
}

export function recommend(methods, answers = {}, brief = '', limit = 24, seed = 1) {
  return rank(methods, answers, tokenize(brief), seed).slice(0, limit);
}

const LEVEL = { beginner: 'newcomer', intermediate: 'mid', advanced: 'expert' };
const isLost = (m) => !['active', 'community'].includes(m.status);

// Deals the strongest matches onto four shelves: one per experience level, then lost and
// borrowed methods to try. Near-ties are shuffled by the seed and each shelf spreads across
// disciplines, so the same answers do not always produce the same handful of methods.
export function shelves(methods, answers = {}, brief = '', seed = 1, exclude = []) {
  const seen = new Set(exclude);
  const ranked = rank(methods, answers, tokenize(brief), seed)
    // Methods already shown in this session sink, so "Show different picks" really shows different ones.
    .map((r) => ({ ...r, jitter: r.score + seededDraw(r.m.id, seed) * 4 - (seen.has(r.m.id) ? 12 : 0) }))
    .sort((x, y) => y.jitter - x.jitter);
  const top = ranked[0]?.score ?? 0;
  const floor = Math.min(top - 14, top * 0.4);
  const pool = ranked.filter((r) => r.score > floor && r.score > 0);
  const used = new Set();
  const seenKeys = new Set();
  // Near-duplicate entries (e.g. two write-ups of the Fogg model) share their first two words; show one.
  const key = (m) => tokenize(m.name.replace(/\(.*?\)/g, '')).slice(0, 2).map((w) => w.replace(/s$/, '')).join(' ');

  function deal(test, size, bonus = () => 0, perFamily = 1) {
    const out = [];
    const fams = new Map();
    const order = [...pool].sort((x, y) => y.jitter + bonus(y.m) - (x.jitter + bonus(x.m)));
    for (const pass of [1, 2]) {
      for (const r of order) {
        if (out.length >= size) break;
        if (used.has(r.m.id) || seenKeys.has(key(r.m)) || !test(r.m)) continue;
        const n = fams.get(r.m.family) || 0;
        if (pass === 1 && n >= perFamily) continue; // first pass: spread across disciplines
        out.push(r); used.add(r.m.id); seenKeys.add(key(r.m)); fams.set(r.m.family, n + 1);
      }
    }
    return out;
  }

  const lvl = (m) => LEVEL[m.facets?.expertise] || 'mid';
  const provenFirst = answers.appetite !== 'lost';
  const familiar = (m) => !provenFirst || !isLost(m) || m.facets?.expertise === 'beginner';
  // Newcomers get the established methods with the most guidance written about them first.
  const established = (m) => (m.status === 'active' ? 4 : m.status === 'vestigial' ? 1.5 : 0);
  const newcomer = deal((m) => lvl(m) === 'newcomer' && familiar(m), 4, established, 2);
  if (newcomer.length < 4) newcomer.push(...deal((m) => lvl(m) === 'newcomer', 4 - newcomer.length));
  const mid = deal((m) => lvl(m) === 'mid', 4);
  const expert = deal((m) => lvl(m) === 'expert', 4);
  const tryNext = deal((m) => isLost(m), 6);
  return { newcomer, mid, expert, tryNext };
}

// The JSON the finder receives: each shelf as slim method records with the reasons they fit.
export function shelvesPayload(methods, answers, brief, seed, exclude) {
  const slim = (r) => ({ ...listFields(r.m), score: Math.round(r.score * 10) / 10, why: r.why });
  const s = shelves(methods, answers, brief, seed, exclude);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.map(slim)]));
}
