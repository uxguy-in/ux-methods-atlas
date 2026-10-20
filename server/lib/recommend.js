// Rule-based method recommender. Scores every method against the finder answers,
// then optionally against the words in a free-text brief.

const EFFORT = ['hours', 'days', 'weeks', 'months'];
const EXPERTISE = ['beginner', 'intermediate', 'advanced'];
const PARTICIPANTS = ['none', 'few', 'moderate', 'large'];

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

export function scoreMethod(m, a = {}, words = []) {
  const f = m.facets || {};
  let s = 0;
  const why = [];

  if (a.goals?.length) {
    const hits = (f.goals || []).filter((g) => a.goals.includes(g));
    s += hits.length * 6;
    if (hits.length) why.push('matches your goal');
    else s -= 4;
  }
  if (a.stage && (f.stage || []).includes(a.stage)) { s += 3; why.push('fits your stage'); }
  if (a.data && a.data !== 'any') {
    if (f.data === a.data) s += 3;
    else if (f.data === 'mixed' || a.data === 'mixed') s += 1;
    else s -= 2;
  }
  const p = participantsFit(f.participants, a.participants);
  s += p;
  if (p < 0) why.push('needs more access than you have');
  if (a.time) {
    const gap = EFFORT.indexOf(f.effort) - EFFORT.indexOf(a.time);
    s += gap <= 0 ? 2 : -3 * gap;
  }
  if (a.expertise) {
    const gap = EXPERTISE.indexOf(f.expertise) - EXPERTISE.indexOf(a.expertise);
    s += gap <= 0 ? 1 : -2 * gap;
  }
  if (a.appetite === 'proven') s += m.status === 'active' ? 3 : m.status === 'original' ? 0 : -2;
  if (a.appetite === 'lost') s += m.status === 'active' ? -2 : 3;

  s += textScore(m, words) * 2;
  return { score: s, why };
}

export function recommend(methods, answers = {}, brief = '', limit = 24) {
  const words = tokenize(brief);
  return methods
    .map((m) => ({ m, ...scoreMethod(m, answers, words) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

// Splits a ranked list into the three shelves shown in the finder.
export function shelve(ranked) {
  const primary = [];
  const lost = [];
  const rest = [];
  for (const r of ranked) {
    if (primary.length < 5 && (r.m.status === 'active' || r.m.status === 'original' || primary.length < 2)) primary.push(r);
    else if (lost.length < 6 && r.m.status !== 'active') lost.push(r);
    else rest.push(r);
  }
  return { primary, lost, rest: rest.slice(0, 8) };
}
