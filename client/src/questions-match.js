// Matching free text (a typed or spoken research question, or a brief) to the question library. Plain JS so the
// checks can run it in Node.
import { QUESTIONS, SYNONYMS } from './questions.js';

const STOP = new Set('a an and are as at be but by can do does for from how i if in is it its me my of on or our should so that the their them they this to us was we what when where which who why will with would you your'.split(' '));
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
// Library questions most like a piece of free text (a research question or a brief), best first. Scores the share
// of the text's words found in the question, its keywords or answer, counting synonyms; the question text weighs most.
export function similarQuestions(text, max = 4, { scores = false } = {}) {
  const ws = [...new Set(words(text).map(stem))];
  if (!ws.length) return [];
  const syn = (w) => SYNONYMS.find((g) => g.some((x) => stem(fold(x)) === w)) || [w];
  return QUESTIONS.map((q) => {
    const head = new Set(words([q.question, ...(q.keywords || [])].join(' ')).map(stem));
    const body = new Set(words([q.answer, q.askInstead?.question].join(' ')).map(stem));
    let score = 0;
    for (const w of ws) {
      const forms = syn(w).map((x) => stem(fold(x)));
      if (forms.some((f) => head.has(f))) score += 1; else if (forms.some((f) => body.has(f))) score += 0.4;
    }
    return { q, score: score / Math.max(3, ws.length) };
  }).filter((x) => x.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, max).map((x) => (scores ? x : x.q));
}

// The best library question for several pieces of text said about one problem (each turn of a conversation, and
// them together): the question that matches most of them, then the strongest single match.
export function bestQuestion(texts) {
  const tally = new Map();
  for (const t of texts.filter((x) => String(x || '').trim())) {
    similarQuestions(t, 3, { scores: true }).forEach(({ q, score }, rank) => {
      const e = tally.get(q.id) || { q, n: 0, best: 0 };
      e.n += 1; e.best = Math.max(e.best, score - rank * 0.05);
      tally.set(q.id, e);
    });
  }
  return [...tally.values()].sort((a, b) => b.n - a.n || b.best - a.best)[0]?.q || null;
}
