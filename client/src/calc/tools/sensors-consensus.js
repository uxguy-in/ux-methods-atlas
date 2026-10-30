// Cultural consensus analysis (Romney, Weller and Batchelder 1986): agreement between respondents corrected for
// guessing, a one-factor minimum residual solution, the eigenvalue ratio, competence scores and the culturally
// correct answer key with posterior probabilities. Pure functions.
import { lines, cells, eigSym, mean, fmt, pctS, plural } from './sensors-core.js';

const MISSING = new Set(['', '.', '-', 'na', 'n/a', '?']);
// Matrix: a header row of question names, then "respondent, answer, answer, …". Answers are any labels (T/F, A–D, 1–5).
export function parseAnswers(text) {
  const ls = lines(text), errors = [];
  if (ls.length < 3) return { questions: [], rows: [], errors: ['Paste a header row and at least two respondents.'] };
  const head = cells(ls[0]), questions = head.slice(1);
  const rows = [];
  ls.slice(1).forEach((l, i) => {
    const c = cells(l);
    if (c.length - 1 !== questions.length) { errors.push(`Row ${i + 2}: expected ${questions.length} answers, found ${c.length - 1}`); return; }
    rows.push({ id: c[0] || `R${i + 1}`, a: c.slice(1).map((v) => (MISSING.has(v.toLowerCase()) ? null : v.toUpperCase())) });
  });
  return { questions, rows, errors };
}

export function optionsOf(rows, nq) {
  return Array.from({ length: nq }, (_, j) => [...new Set(rows.map((r) => r.a[j]).filter((v) => v !== null))].sort());
}

// Proportion of matches M_ij over the questions both answered, corrected for guessing with L options:
// M*_ij = (L·M_ij − 1)/(L − 1) (Romney, Weller and Batchelder 1986). Diagonal 1.
export function agreement(rows, L) {
  const n = rows.length, M = [], Ms = [], common = [];
  for (let i = 0; i < n; i++) {
    M.push([]); Ms.push([]); common.push([]);
    for (let j = 0; j < n; j++) {
      let both = 0, same = 0;
      rows[i].a.forEach((v, q) => { const w = rows[j].a[q]; if (v !== null && w !== null) { both++; if (v === w) same++; } });
      const m = both ? same / both : NaN;
      M[i].push(m); common[i].push(both); Ms[i].push(i === j ? 1 : (L * m - 1) / (L - 1));
    }
  }
  return { M, Ms, common };
}

// One-factor minimum residual (unweighted least squares on the off-diagonal cells): iterate principal axis factoring,
// replacing the diagonal with the current communalities λ², until the loadings stop changing. The fixed point
// minimises Σ_{i≠j} (M*_ij − λ_i λ_j)².
export function minres1(R, { tol = 1e-12, maxIter = 5000 } = {}) {
  const n = R.length;
  let e = eigSym(R), lam = e.vectors[0].map((v) => v * Math.sqrt(Math.max(e.values[0], 0)));
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const Rr = R.map((r, i) => r.map((v, j) => (i === j ? lam[i] ** 2 : v)));
    e = eigSym(Rr);
    const next = e.vectors[0].map((v) => v * Math.sqrt(Math.max(e.values[0], 0)));
    const sgn = next.reduce((a, b) => a + b, 0) < 0 ? -1 : 1;
    const nn = next.map((v) => v * sgn);
    const delta = Math.max(...nn.map((v, i) => Math.abs(v - lam[i])));
    lam = nn;
    if (delta < tol) break;
  }
  const Rr = R.map((r, i) => r.map((v, j) => (i === j ? lam[i] ** 2 : v)));
  const ev = eigSym(Rr).values;
  let ssr = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) ssr += (R[i][j] - lam[i] * lam[j]) ** 2;
  return { loadings: lam, eigen: ev, iter, ssr };
}

// Answer key: for each question and option k, log posterior = Σ over respondents of log(D_i + (1 − D_i)/L) if they
// answered k, else log((1 − D_i)/L) (Batchelder and Romney 1988), with equal priors and D clipped to [0.001, 0.999].
// Options nobody chose share the remaining probability (there are L − observed of them).
export function answerKey(rows, opts, D, L) {
  const d = D.map((v) => Math.min(0.999, Math.max(0.001, v)));
  return opts.map((os, q) => {
    const logp = os.map((k) => rows.reduce((s, r, i) => { const v = r.a[q]; if (v === null) return s; return s + Math.log(v === k ? d[i] + (1 - d[i]) / L : (1 - d[i]) / L); }, 0));
    const none = rows.reduce((s, r, i) => (r.a[q] === null ? s : s + Math.log((1 - d[i]) / L)), 0);
    const extra = Math.max(0, L - os.length);
    const mx = Math.max(...logp, extra ? none : -Infinity);
    const z = logp.reduce((s, v) => s + Math.exp(v - mx), 0) + extra * Math.exp(none - mx);
    const post = logp.map((v) => Math.exp(v - mx) / z);
    const best = post.indexOf(Math.max(...post));
    const counts = os.map((k) => rows.filter((r) => r.a[q] === k).length);
    const maj = counts.indexOf(Math.max(...counts));
    return { answer: os[best], post: post[best], posts: post, options: os, counts, majority: os[maj], majorityShare: counts[maj] / counts.reduce((a, b) => a + b, 0), answered: counts.reduce((a, b) => a + b, 0) };
  });
}

export function analyse(parsed, Lin) {
  const { rows, questions } = parsed;
  const opts = optionsOf(rows, questions.length);
  const L = Lin >= 2 ? Lin : Math.max(2, ...opts.map((o) => o.length));
  const ag = agreement(rows, L);
  const missingPairs = ag.common.flat().filter((v) => v === 0).length;
  if (missingPairs) return { error: 'Some pairs of respondents have no question answered in common.' };
  const fa = minres1(ag.Ms);
  const D = fa.loadings;
  const key = answerKey(rows, opts, D, L);
  const ratio = fa.eigen[0] / fa.eigen[1];
  return {
    L, n: rows.length, nq: questions.length, ag, fa, D, key, ratio, eigen: fa.eigen,
    meanD: mean(D), negative: rows.filter((_, i) => D[i] < 0).map((r) => r.id), heywood: rows.filter((_, i) => D[i] > 1).map((r) => r.id),
    differs: key.filter((k) => k.answer !== k.majority).length, uncertain: key.filter((k) => k.post < 0.95).length,
  };
}

// ── Reading your results ──
// Confidence rule (Weller 2007, "Cultural consensus theory: applications and frequently asked questions"; Romney,
// Weller and Batchelder 1986): high when the first-to-second eigenvalue ratio is at least 3, mean competence at least
// 0.5, no respondent has a negative competence and there are at least 20 respondents; medium when the ratio is at
// least 3 and mean competence at least 0.5 with fewer respondents or a few negative competences; low otherwise
// (the single shared answer key is not supported).
export function consensusConfidence(r) {
  if (r.ratio >= 3 && r.meanD >= 0.5 && !r.negative.length && r.n >= 20) return 'high';
  if (r.ratio >= 3 && r.meanD >= 0.5) return 'medium';
  return 'low';
}
export function consensusSummary(r, ids) {
  const one = r.ratio >= 3;
  const lowest = ids.map((id, i) => ({ id, d: r.D[i] })).sort((a, b) => a.d - b.d);
  return {
    headline: one
      ? `One shared answer key fits: the eigenvalue ratio is ${fmt(r.ratio, 1)} (above 3) and mean competence ${fmt(r.meanD, 2)}.`
      : `No single shared answer key: the eigenvalue ratio is ${fmt(r.ratio, 1)}, below the rule-of-thumb 3, so respondents may hold different views.`,
    meaning: [
      one ? 'Respondents share one body of knowledge about this domain; differences between them are mostly about how much each knows, not about different "cultures".' : 'Look for subgroups (roles, teams, segments) with different answer patterns before treating the key as a consensus.',
      `Competence (the estimated share of questions a respondent knows, not guesses) ranged from ${fmt(lowest[0].d, 2)} (${lowest[0].id}) to ${fmt(lowest[lowest.length - 1].d, 2)} (${lowest[lowest.length - 1].id}).`,
      r.negative.length ? `${r.negative.join(', ')} had negative competence: they disagree with the consensus more than chance, which points to a different view, careless answering or a reversed scale.` : 'No respondent had a negative competence.',
      `${plural(r.differs, 'question')} had a consensus answer different from the simple majority, because the answers of more competent respondents count for more; ${plural(r.uncertain, 'question')} had a posterior probability below 0.95.`,
    ],
    confidence: consensusConfidence(r),
    confidenceNote: `High needs an eigenvalue ratio of at least 3, mean competence of at least 0.5, no negative competences and 20 or more respondents (Weller 2007; Romney, Weller and Batchelder 1986 show about 17 to 20 respondents with competence 0.5 classify 95% of questions correctly); medium needs the first two. Here: ratio ${fmt(r.ratio, 1)}, mean competence ${fmt(r.meanD, 2)}, ${r.n} respondents.`,
    caveats: [
      'Consensus is not truth: the key is what this group agrees on, which can be a shared misconception.',
      'The model assumes each question has one correct answer, respondents answer independently and every question is equally hard.',
      `Agreement is corrected for guessing among ${r.L} options per question; if some options are rarely plausible, guessing is not uniform and competence is underestimated.`,
    ],
    next: [
      'Use the competence scores to choose expert informants for follow-up interviews.',
      'Re-run the analysis within subgroups (for example by role) if the ratio is low or some competences are negative.',
    ],
    report: `Cultural consensus analysis of ${r.n} respondents and ${r.nq} questions gave an eigenvalue ratio of ${fmt(r.ratio, 1)} and a mean competence of ${fmt(r.meanD, 2)}${one ? ', supporting a single shared answer key' : ', which does not support a single shared answer key'}.`,
  };
}
export { pctS };
