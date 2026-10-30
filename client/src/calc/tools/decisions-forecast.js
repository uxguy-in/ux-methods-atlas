// Forecast calibration: Brier score with Murphy's decomposition, a calibration curve, per-forecaster scores, and the
// 90% interval (overconfidence) exercise. Pure functions; checked against scikit-learn, numpy and scipy in
// server/scripts/check-decisions.js.
import { nonEmptyLines, splitCells, fmt, pctS } from './decisions-core.js';
import { wilson, clopperPearson, binomCdf } from '../stats.js';

const YES = new Set(['1', 'yes', 'y', 'true', 't', 'happened', 'hit', 'x']);
const NO = new Set(['0', 'no', 'n', 'false', 'f', 'did not happen', 'miss', '']);

// Rows of "probability, outcome" or "forecaster, probability, outcome". Probabilities above 1 are read as percentages.
// A first line that is not numeric is treated as a header.
export function parseForecasts(text) {
  const rows = [], errors = [];
  nonEmptyLines(text).forEach((line, i) => {
    const c = splitCells(line);
    if (c.length < 2) { errors.push(`Line ${i + 1}: needs a probability and an outcome`); return; }
    const [who, pS, oS] = c.length >= 3 ? [c[0], c[1], c[2]] : ['', c[0], c[1]];
    let p = Number(String(pS).replace('%', ''));
    const o = String(oS).trim().toLowerCase();
    if (!Number.isFinite(p)) { if (i === 0) return; errors.push(`Line ${i + 1}: "${pS}" is not a probability`); return; }
    if (p > 1 || /%/.test(pS)) p /= 100;
    if (p < 0 || p > 1) { errors.push(`Line ${i + 1}: probability must be between 0 and 1 (or 0% and 100%)`); return; }
    if (!YES.has(o) && !NO.has(o)) { errors.push(`Line ${i + 1}: outcome "${oS}" should be 1/0 or yes/no`); return; }
    rows.push({ who: who || 'All', p, o: YES.has(o) ? 1 : 0 });
  });
  return { rows, errors };
}

export const brier = (rows) => rows.reduce((a, r) => a + (r.p - r.o) ** 2, 0) / rows.length;

// Bins: 'unique' groups identical forecasts (the decomposition is then exact); 'ten' uses 10 equal-width bins
// as scikit-learn's calibration_curve(strategy='uniform') does.
export function binsOf(rows, mode = 'auto') {
  const uniq = [...new Set(rows.map((r) => r.p))].sort((a, b) => a - b);
  const useUnique = mode === 'unique' || (mode === 'auto' && uniq.length <= 11);
  // Ten bins as numpy.searchsorted on the inner edges: [0, 0.1], (0.1, 0.2], …, (0.9, 1].
  const key = useUnique ? (p) => uniq.indexOf(p) : (p) => Math.min(9, Math.max(0, Math.ceil(p * 10 - 1e-9) - 1));
  const map = new Map();
  for (const r of rows) { const k = key(r.p); if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
  const bins = [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, rs]) => {
    const n = rs.length, hits = rs.reduce((a, r) => a + r.o, 0);
    const f = rs.reduce((a, r) => a + r.p, 0) / n, obs = hits / n, ci = wilson(hits, n, 0.95);
    return { key: k, n, hits, f, obs, lo: ci.lo, hi: ci.hi, label: useUnique ? pctS(uniq[k]) : `${k * 10}–${k * 10 + 10}%` };
  });
  return { bins, unique: useUnique };
}

// Murphy (1973) decomposition: BS = reliability − resolution + uncertainty, with
//   REL = (1/N) Σ n_k (f̄_k − ō_k)², RES = (1/N) Σ n_k (ō_k − ō)², UNC = ō(1 − ō).
// With binned (not identical) forecasts there is an extra within-bin term (Stephenson, Coelho and Jolliffe 2008),
// reported as BS − (REL − RES + UNC).
export function murphy(rows, mode = 'auto') {
  const N = rows.length, base = rows.reduce((a, r) => a + r.o, 0) / N;
  const { bins, unique } = binsOf(rows, mode);
  const rel = bins.reduce((a, b) => a + b.n * (b.f - b.obs) ** 2, 0) / N;
  const res = bins.reduce((a, b) => a + b.n * (b.obs - base) ** 2, 0) / N;
  const unc = base * (1 - base), bs = brier(rows);
  const meanP = rows.reduce((a, r) => a + r.p, 0) / N;
  return { N, bs, rel, res, unc, within: bs - (rel - res + unc), bss: unc > 0 ? 1 - bs / unc : NaN, base, meanP, bins, unique };
}

export function byForecaster(rows) {
  const names = [...new Set(rows.map((r) => r.who))];
  return names.map((w) => {
    const rs = rows.filter((r) => r.who === w), m = murphy(rs);
    return { who: w, n: rs.length, bs: m.bs, rel: m.rel, res: m.res, bss: m.bss, meanP: m.meanP, base: m.base };
  }).sort((a, b) => a.bs - b.bs);
}

// ── 90% interval exercise ──
// Built-in questions with well-documented answers (sources in the About section).
export const QUIZ = [
  { q: 'In what year did Paul Fitts publish the paper behind Fitts\' law?', a: 1954 },
  { q: 'In what year was George Miller\'s "The magical number seven, plus or minus two" published?', a: 1956 },
  { q: 'In what year did W. E. Hick publish "On the rate of gain of information" (Hick\'s law)?', a: 1952 },
  { q: 'In what year did Tim Berners-Lee write his proposal for the World Wide Web at CERN?', a: 1989 },
  { q: 'In what year did the Apple Macintosh go on sale?', a: 1984 },
  { q: 'In what year was WCAG 2.0 published as a W3C Recommendation?', a: 2008 },
  { q: 'How many member states does the United Nations have?', a: 193 },
  { q: 'How many bones are there in the adult human body?', a: 206 },
  { q: 'What is the average distance from the Earth to the Moon, in kilometres?', a: 384400 },
  { q: 'What is the boiling point of water at sea level, in degrees Fahrenheit?', a: 212 },
];

// Rows "low, high, true value" (or "question, low, high, true value").
export function parseIntervals(text) {
  const rows = [], errors = [];
  nonEmptyLines(text).forEach((line, i) => {
    const c = splitCells(line);
    const nums = c.slice(-3).map((v) => Number(String(v).replace(/[, ]/g, '')));
    if (c.length < 3 || nums.some((v) => !Number.isFinite(v))) { if (i === 0) return; errors.push(`Line ${i + 1}: needs low, high and the true value`); return; }
    const [lo, hi, truth] = nums;
    rows.push({ q: c.length > 3 ? c.slice(0, -3).join(', ') : `Item ${rows.length + 1}`, lo: Math.min(lo, hi), hi: Math.max(lo, hi), truth });
  });
  return { rows, errors };
}

// Hit rate of the intervals with an exact (Clopper-Pearson) 95% interval and the one-sided exact binomial p-value
// for "fewer hits than a well-calibrated 90%" (scipy.stats.binomtest(k, n, 0.9, alternative='less')).
export function intervalScore(rows, target = 0.9) {
  const n = rows.length, hits = rows.filter((r) => r.truth >= r.lo && r.truth <= r.hi).length;
  const ci = clopperPearson(hits, n, 0.95);
  const p = binomCdf(hits, n, target);
  // Where the truth fell, as a position in the interval: 0 = low end, 1 = high end.
  const pos = rows.map((r) => (r.hi > r.lo ? (r.truth - r.lo) / (r.hi - r.lo) : r.truth === r.lo ? 0.5 : r.truth < r.lo ? -Infinity : Infinity));
  const below = rows.filter((r) => r.truth < r.lo).length, above = rows.filter((r) => r.truth > r.hi).length;
  return { n, hits, rate: hits / n, lo: ci.lo, hi: ci.hi, p, pos, below, above, target };
}

// "Reading your results" summaries.
// Brier confidence rule (from the number of forecasts N): high when N ≥ 100, medium when 30 ≤ N < 100, low when N < 30.
// The reliability term in particular needs many forecasts per bin before it means much.
export function brierSummary(m, perPerson = []) {
  const confidence = m.N >= 100 ? 'high' : m.N >= 30 ? 'medium' : 'low';
  const better = m.bs < m.unc;
  const over = m.meanP - m.base;
  const headline = `Brier score ${fmt(m.bs, 3)} across ${m.N} forecasts: ${better ? 'better' : 'no better'} than always forecasting the base rate of ${pctS(m.base)} (${fmt(m.unc, 3)}).`;
  const meaning = [
    'The Brier score is the mean squared gap between the forecast probability and what happened (1 or 0): 0 is perfect, 0.25 is what a constant 50% forecast scores.',
    `Reliability ${fmt(m.rel, 3)} (lower is better) measures miscalibration: how far the stated probabilities are from the observed frequencies. Resolution ${fmt(m.res, 3)} (higher is better) measures how well the forecasts separate events that happen from those that do not.`,
    `On average the forecasts said ${pctS(m.meanP)} and ${pctS(m.base)} happened, ${Math.abs(over) < 0.03 ? 'about right overall' : over > 0 ? 'so they leaned towards "it will happen" too often' : 'so they leaned towards "it won\'t happen" too often'}.`,
    `Brier skill score ${fmt(m.bss, 2)}: the share of the base-rate forecast's error removed (1 is perfect, 0 no better than the base rate, below 0 worse).`,
  ];
  if (perPerson.length > 1) meaning.push(`Best-scoring forecaster: ${perPerson[0].who} (${fmt(perPerson[0].bs, 3)} over ${perPerson[0].n} forecasts).`);
  const caveats = [
    'Scores are only comparable on the same questions: easy questions (base rates near 0% or 100%) give low Brier scores whatever the skill.',
    m.unique ? 'Bins with only a few forecasts give wide intervals on the calibration curve; do not over-read single points.' : 'With binned forecasts the decomposition has a small within-bin term, shown separately, so the three parts do not add up exactly to the Brier score.',
  ];
  const next = [
    over > 0.05 ? 'Pull your probabilities towards the base rate: you said "likely" more often than things happened.' : rel(m) ? 'Look at the bins that sit furthest from the diagonal and recalibrate those probability levels.' : 'Keep scoring: add new forecasts as they resolve and compare quarter by quarter.',
    'Practise with the 90% interval exercise to check confidence on numeric estimates too.',
  ];
  const report = `${m.N} probability forecasts had a Brier score of ${fmt(m.bs, 3)} (reliability ${fmt(m.rel, 3)}, resolution ${fmt(m.res, 3)}, uncertainty ${fmt(m.unc, 3)}; skill score ${fmt(m.bss, 2)} against the ${pctS(m.base)} base rate).`;
  return {
    headline, meaning: meaning.slice(0, 6), confidence,
    confidenceNote: 'Based on the number of forecasts: high with 100 or more, medium with 30 to 99, low with fewer than 30, because calibration needs many forecasts at each probability level.',
    caveats, next, report,
  };
}
const rel = (m) => m.rel > 0.01;

// Interval confidence rule (from the number of questions n): high when n ≥ 30, medium when 10 ≤ n < 30, low when n < 10.
export function intervalSummary(s) {
  const confidence = s.n >= 30 ? 'high' : s.n >= 10 ? 'medium' : 'low';
  const over = s.p < 0.05;
  const headline = `Your 90% intervals contained the true value ${s.hits} of ${s.n} times (${pctS(s.rate)}), ${s.rate >= 0.85 ? 'close to the 90% they should' : 'well short of 90%'}.`;
  const meaning = [
    `If the intervals were well calibrated, about ${fmt(0.9 * s.n, 0)} of ${s.n} would contain the truth. The exact 95% confidence interval for your hit rate is ${pctS(s.lo)} to ${pctS(s.hi)}.`,
    over ? `Getting ${s.hits} or fewer hits would happen only ${pctS(s.p, 1)} of the time with truly calibrated 90% intervals, so this is evidence of overconfidence: the intervals are too narrow.` : `That many misses is not unusual for well-calibrated intervals (p ${s.p < 0.001 ? '< 0.001' : `= ${fmt(s.p, 3)}`}).`,
    s.below + s.above > 0 ? `The truth fell below your range ${s.below} time${s.below === 1 ? '' : 's'} and above it ${s.above} time${s.above === 1 ? '' : 's'}.` : 'Every true value fell inside its interval.',
  ];
  const caveats = [
    'Most people\'s "90%" intervals catch the truth only about half the time (Alpert and Raiffa 1982; Russo and Schoemaker 1992), so a low hit rate is normal, not a personal failing.',
    'A 100% hit rate on a few questions can also mean the intervals are wider than they need to be.',
  ];
  const next = [
    over ? 'Widen your ranges: ask "what would surprise me?" for each end, and set the bound just beyond it.' : 'Keep practising with new questions; calibration drifts without feedback.',
    'Use the same exercise with your team before estimating effort, adoption or sample sizes.',
  ];
  const report = `In a calibration exercise, ${s.hits} of ${s.n} 90% confidence intervals contained the true value (${pctS(s.rate)}; exact 95% CI ${pctS(s.lo)} to ${pctS(s.hi)}; one-sided binomial p ${s.p < 0.001 ? '< 0.001' : `= ${fmt(s.p, 3)}`} against 90%).`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'Based on the number of questions: high with 30 or more, medium with 10 to 29, low with fewer than 10, since a hit rate from a handful of questions is very uncertain.',
    caveats, next, report,
  };
}
