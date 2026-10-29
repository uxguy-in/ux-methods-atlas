// Information foraging (Pirolli and Card 1999): Charnov's marginal value theorem for patches, information scent
// along a navigation path, and the diet model for which sources are worth pursuing. Pure functions.
import { entropy } from './info.js';

// ── Patch model ──
// Exponential diminishing returns: g(t) = G (1 − e^(−t/τ)). The overall rate of gain is R(t) = g(t) / (Tb + t);
// Charnov's optimum t* is where the gain slope g'(t*) equals R(t*) (the tangent from (−Tb, 0)).
export const expGain = (G, tau) => (t) => G * (1 - Math.exp(-t / tau));
const expSlope = (G, tau) => (t) => (G / tau) * Math.exp(-t / tau);

// Solve g'(t)(Tb + t) − g(t) = 0 by bisection; for a concave g the left side falls as t grows.
export function charnovExp(G, tau, Tb) {
  const g = expGain(G, tau), d = expSlope(G, tau);
  const f = (t) => d(t) * (Tb + t) - g(t);
  let lo = 0, hi = tau;
  while (f(hi) > 0 && hi < 1e9) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const t = (lo + hi) / 2;
  return { t, gain: g(t), rate: g(t) / (Tb + t), slope: d(t), share: g(t) / G };
}

// Lambert W on the lower branch W₋₁(x) for −1/e < x < 0 (Halley iterations), used for the analytic check.
export function lambertWm1(x) {
  let w = x < -0.25 ? -1 - Math.sqrt(2 * (1 + Math.E * x)) : Math.log(-x) - Math.log(-Math.log(-x));
  for (let i = 0; i < 100; i++) {
    const e = Math.exp(w), f = w * e - x;
    const wn = w - f / (e * (w + 1) - ((w + 2) * f) / (2 * w + 2));
    if (Math.abs(wn - w) < 1e-15 * Math.abs(wn)) { w = wn; break; }
    w = wn;
  }
  return w;
}
// Analytic optimum for the exponential curve: t* = τ (−W₋₁(−e^(−(1 + Tb/τ))) − 1) − Tb.
export const charnovExpAnalytic = (tau, Tb) => tau * (-lambertWm1(-Math.exp(-(1 + Tb / tau))) - 1) - Tb;

// Pasted cumulative gain: points (t, g) in a patch, joined by straight lines. The best leaving time on a
// piecewise-linear curve is at one of the points, so take the point with the highest g / (Tb + t).
export function charnovPoints(points, Tb) {
  const pts = [[0, 0], ...points.filter(([t]) => t > 0)].sort((a, b) => a[0] - b[0]);
  let best = null;
  pts.forEach(([t, g], i) => {
    if (i === 0) return;
    const r = g / (Tb + t);
    if (!best || r > best.rate + 1e-12) best = { t, gain: g, rate: r, i };
  });
  if (!best) return null;
  const next = pts[best.i + 1], prev = pts[best.i - 1];
  const slopeAfter = next ? (next[1] - best.gain) / (next[0] - best.t) : 0;
  const slopeBefore = (best.gain - prev[1]) / (best.t - prev[0]);
  const G = Math.max(...pts.map((p) => p[1]));
  return { ...best, slope: slopeAfter, slopeBefore, share: G > 0 ? best.gain / G : NaN, points: pts, concave: isConcave(pts) };
}
function isConcave(pts) {
  for (let i = 2; i < pts.length; i++) {
    const s1 = (pts[i - 1][1] - pts[i - 2][1]) / (pts[i - 1][0] - pts[i - 2][0]);
    const s2 = (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0]);
    if (s2 > s1 + 1e-9) return false;
  }
  return true;
}
export function parsePoints(text) {
  return String(text || '').split(/\r?\n/).map((l) => (l.match(/-?\d+(?:\.\d+)?/g) || []).map(Number)).filter((r) => r.length >= 2).map((r) => [r[0], r[1]]);
}

// ── Information scent ──
// Each step: "label share, label share*" with * on the correct link. Shares can be counts or proportions.
// Scent strength = share choosing the correct link. Scent entropy = H of the choice distribution: high means the
// labels did not tell people apart. Predicted path success = product of the step scents, assuming no backtracking.
export function parseScent(text) {
  const steps = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, li) => {
    let s = line.trim(); if (!s || s.startsWith('#')) return;
    let name = `Step ${steps.length + 1}`;
    const m = s.match(/^([^:]+):\s*(.*)$/); if (m && !/\d\s*\*?\s*$/.test(m[1])) { name = m[1].trim(); s = m[2]; }
    const links = s.split(/[,;|]/).map((part) => {
      const mm = part.trim().match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(%?)\s*(\*?)\s*$/);
      if (!mm) return null;
      return { label: mm[1].replace(/\*$/, '').trim(), v: Number(mm[2]), correct: !!mm[4] || /\*$/.test(mm[1]) };
    });
    if (links.some((x) => !x) || !links.length) { bad.push(li + 1); return; }
    steps.push({ name, links });
  });
  return { steps, bad };
}
export function scent(steps) {
  const out = steps.map((st) => {
    const total = st.links.reduce((a, l) => a + l.v, 0);
    const links = st.links.map((l) => ({ ...l, p: total > 0 ? l.v / total : 0 }));
    const correct = links.filter((l) => l.correct);
    const p = correct.reduce((a, l) => a + l.p, 0);
    const H = entropy(links.map((l) => l.v));
    const k = links.length;
    const wrong = links.filter((l) => !l.correct).sort((a, b) => b.p - a.p)[0];
    return { name: st.name, links, scent: p, H, Hnorm: k > 1 ? H / Math.log2(k) : 0, N1: 2 ** H, k, rival: wrong, hasCorrect: correct.length > 0, total };
  });
  let cum = 1;
  out.forEach((s) => { cum *= s.scent; s.cum = cum; });
  return { steps: out, pathSuccess: cum, weakest: [...out].sort((a, b) => a.scent - b.scent)[0] };
}

// ── Diet model ──
// Sources with value g_i, handling time h_i and encounter rate λ_i (per unit of between-source time).
// Profitability π_i = g_i / h_i. Rank by π, add sources while π_k > R_(k−1), where
// R_k = Σ_(i≤k) λ_i g_i / (1 + Σ_(i≤k) λ_i h_i) is the rate of gain from the best k sources (Pirolli and Card 1999).
export function parseDiet(text) {
  const rows = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const parts = s.split(/[,\t;]/).map((x) => x.trim());
    const nums = parts.slice(1).map(Number);
    if (parts.length < 4 || nums.slice(0, 3).some((x) => !Number.isFinite(x) || x < 0) || !(nums[1] > 0)) { bad.push(i + 1); return; }
    rows.push({ name: parts[0], g: nums[0], h: nums[1], lambda: nums[2] });
  });
  return { rows, bad };
}
export const dietRate = (set) => set.reduce((a, s) => a + s.lambda * s.g, 0) / (1 + set.reduce((a, s) => a + s.lambda * s.h, 0));
export function diet(rows) {
  const ranked = rows.map((r) => ({ ...r, profit: r.g / r.h })).sort((a, b) => b.profit - a.profit);
  let R = 0; const inDiet = [];
  ranked.forEach((r) => { r.rateBefore = R; r.include = r.profit > R; if (r.include) { inDiet.push(r); R = dietRate(inDiet); } r.rateAfter = R; });
  // Once one source is excluded, every less profitable source is too (π falls while R stays).
  let cut = false; ranked.forEach((r) => { if (!r.include) cut = true; if (cut) r.include = false; });
  const chosen = ranked.filter((r) => r.include);
  return { ranked, chosen, R: dietRate(chosen), allRate: dietRate(ranked) };
}
// Brute force over every subset, for checking the rule.
export function dietBest(rows) {
  let best = { R: 0, set: [] };
  for (let m = 1; m < 1 << rows.length; m++) { const set = rows.filter((_, i) => m & (1 << i)); const R = dietRate(set); if (R > best.R) best = { R, set: set.map((s) => s.name) }; }
  return best;
}

// ── Summaries ──
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');

export function patchSummary(r, { Tb, unit = 's', gainUnit = 'items', place = 'patch', alt }) {
  const meaning = [
    `Leave each ${place} after about ${f1(r.t)} ${unit}, when it has given ${f1(r.gain)} ${gainUnit} (${pc(r.share)} of what it holds). Staying longer earns less per ${unit} than moving on.`,
    `At that point the ${place} yields ${f2(r.slope)} ${gainUnit} per ${unit}, the same as the best overall rate R* = ${f2(r.rate)} ${gainUnit} per ${unit} including the ${f1(Tb)} ${unit} it takes to reach the next one.`,
  ];
  if (alt) meaning.push(`If getting to the next ${place} took ${f1(alt.Tb)} ${unit} instead, people should leave after ${f1(alt.t)} ${unit} and the overall rate would be ${f2(alt.rate)} (${alt.rate > r.rate ? '+' : ''}${pc(alt.rate / r.rate - 1)}). ${alt.Tb < Tb ? 'Cheaper moves between patches make skimming rational: expect shorter visits.' : 'Costlier moves make people stay and dig.'}`);
  return {
    headline: `The optimal stay is about ${f1(r.t)} ${unit} per ${place}, for ${f2(r.rate)} ${gainUnit} per ${unit} overall.`,
    meaning,
    confidence: 'medium',
    confidenceNote: 'This is a normative model: it says what a rational forager would do given your gain curve and travel time, not what your users did. Its accuracy depends on how well the curve fits.',
    caveats: ['The model assumes people know the average gain curve and travel time; new users do not.', 'If observed visits are much longer than the optimum, the patch may have poor cues that it is exhausted; if much shorter, people may not expect anything useful in it.'],
    next: [`Compare the ${f1(r.t)} ${unit} with observed dwell times from analytics or sessions.`, `To make ${place}s worth longer stays, put the most valuable content first (a steeper start of the curve).`],
    report: `Under Charnov's marginal value theorem, with ${f1(Tb)} ${unit} between ${place}s, the rate-maximising stay is ${f1(r.t)} ${unit} (gain ${f1(r.gain)} ${gainUnit}, overall rate ${f2(r.rate)} ${gainUnit}/${unit}).`,
  };
}

export function scentSummary(s) {
  const weak = s.steps.filter((x) => x.scent < 0.5);
  const amb = s.steps.filter((x) => x.Hnorm > 0.7);
  const n = Math.min(...s.steps.map((x) => x.total));
  const counts = s.steps.every((x) => x.links.every((l) => Number.isInteger(l.v))) && n >= 2;
  return {
    headline: `About ${pc(s.pathSuccess)} of people would reach the target if they never backtracked; the weakest step is "${s.weakest.name}" (${pc(s.weakest.scent)} chose the right link).`,
    meaning: [
      ...s.steps.map((x) => `${x.name}: ${pc(x.scent)} chose the correct link; choices were spread as if among ${f1(x.N1)} equally attractive links${x.rival && x.rival.p > 0.15 ? `, with "${x.rival.label}" drawing ${pc(x.rival.p)}` : ''}.`),
    ],
    confidence: counts && n >= 30 ? 'high' : counts && n >= 12 ? 'medium' : 'low',
    confidenceNote: counts ? `The smallest step has ${n} people.` : 'Shares were given as proportions, so sample size is unknown; treat the figures as descriptive.',
    caveats: ['The product of steps assumes each step is independent and nobody backtracks; real success is usually higher because people recover.', 'Strong scent for a wrong link is a labelling problem; even spread over many links is an ambiguity problem.'],
    next: [
      weak.length ? `Rename or regroup the links at ${weak.map((x) => `"${x.name}"`).join(', ')}; test the new labels with a first-click or tree test.` : 'Scent is strong at every step; focus on other parts of the journey.',
      amb.length ? `At ${amb.map((x) => `"${x.name}"`).join(', ')} labels are hard to tell apart: make them more distinct or add descriptions.` : null,
    ].filter(Boolean),
    report: `Information scent along the path ranged from ${pc(Math.min(...s.steps.map((x) => x.scent)))} to ${pc(Math.max(...s.steps.map((x) => x.scent)))} per step, giving a predicted ${pc(s.pathSuccess)} success without backtracking; the weakest step was "${s.weakest.name}".`,
  };
}

export function dietSummary(d, unit = 'min') {
  const out = d.ranked.filter((r) => !r.include);
  return {
    headline: `Pursue ${d.chosen.length} of ${d.ranked.length} sources: ${d.chosen.map((r) => r.name).join(', ')}.`,
    meaning: [
      `Using only these gives ${f2(d.R)} units of value per ${unit} of search, against ${f2(d.allRate)} if every source were pursued.`,
      out.length ? `${out.map((r) => r.name).join(', ')} ${out.length > 1 ? 'are' : 'is'} not worth handling when met: ${out.length > 1 ? 'their' : 'its'} value per ${unit} of handling (${out.map((r) => f2(r.profit)).join(', ')}) is below the rate you get by moving on (${f2(d.R)}).` : 'Every source is worth handling when met.',
      `A source is dropped because better sources are common enough, not because it is worthless: if the better ones became rarer, it would come back into the diet.`,
    ],
    confidence: 'medium',
    confidenceNote: 'The ranking is exact for the numbers you entered; it is only as good as the value, time and encounter estimates.',
    caveats: ['Value is hard to put on one scale; use a consistent proxy such as relevant facts found or decisions supported.', 'People do not always know a source\'s value before handling it; poor previews push them to handle low-value sources.'],
    next: ['Improve previews and snippets so low-profit sources can be skipped cheaply.', out.length ? `Ask whether ${out[0].name} can be made faster to use (shorter handling time raises its profitability).` : 'Check whether adding a new, faster source would displace any of these.'],
    report: `By the diet model (Pirolli and Card 1999), the rate-maximising set is ${d.chosen.map((r) => r.name).join(', ')} (R = ${f2(d.R)} per ${unit}); ${out.length ? `${out.map((r) => r.name).join(', ')} fell below that rate` : 'no source was excluded'}.`,
  };
}
