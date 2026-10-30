// Monte Carlo journey forecast: each step's success rate gets a Beta posterior from its counts and each step's time a
// log-normal distribution from its median and 90th percentile; simulation gives end-to-end completion and time with
// intervals, and which step to fix first. Pure functions; the simulation runs in sensors.worker.js.
import { ibeta } from '../stats.js';
import { lines, cells, toNum, rng, normalRng, betaDraw, quantileSorted, normInv, fmt, pctS, plural, fmtS } from './sensors-core.js';

// "step, successes, attempts[, median s, p90 s]"; a header row is skipped.
export function parseSteps(text) {
  const steps = [], errors = [];
  lines(text).forEach((l, i) => {
    const c = cells(l); const s = toNum(c[1]), n = toNum(c[2]), md = toNum(c[3]), p90 = toNum(c[4]);
    if (!Number.isFinite(s) || !Number.isFinite(n)) { if (i > 0) errors.push(`Line ${i + 1}: use "step, successes, attempts, median s, p90 s"`); return; }
    if (n <= 0 || s < 0 || s > n || !Number.isInteger(s) || !Number.isInteger(n)) { errors.push(`Line ${i + 1}: successes must be a whole number between 0 and the attempts`); return; }
    const hasTime = Number.isFinite(md) && md > 0;
    if (hasTime && Number.isFinite(p90) && p90 < md) { errors.push(`Line ${i + 1}: the 90th percentile must be at least the median`); return; }
    steps.push({ name: c[0] || `Step ${steps.length + 1}`, s, n, median: hasTime ? md : NaN, p90: hasTime && Number.isFinite(p90) ? p90 : hasTime ? md : NaN });
  });
  return { steps, errors };
}

export const Z90 = normInv(0.9);
// Log-normal from the median and the 90th percentile: μ = ln(median), σ = (ln p90 − ln median)/z₀.₉₀.
export const lognormal = (st) => ({ mu: Math.log(st.median), sigma: (Math.log(st.p90) - Math.log(st.median)) / Z90 });
// Beta(s + a, n − s + a): a = 1 is the uniform prior, a = 0.5 Jeffreys.
export const posterior = (st, prior = 1) => ({ a: st.s + prior, b: st.n - st.s + prior });

// Exact moments of the product of independent Beta variables: E[Πp] = Π a/(a+b), E[(Πp)²] = Π a(a+1)/((a+b)(a+b+1)).
export function exactMoments(post) {
  const m1 = post.reduce((s, { a, b }) => s * (a / (a + b)), 1), m2 = post.reduce((s, { a, b }) => s * ((a * (a + 1)) / ((a + b) * (a + b + 1))), 1);
  return { mean: m1, sd: Math.sqrt(Math.max(0, m2 - m1 * m1)) };
}
// Expected gain in completion if step k's failures were halved: E[Π_{j≠k} p_j] · E[(1 − p_k)/2].
export function exactGain(post, k) {
  const rest = post.reduce((s, { a, b }, j) => (j === k ? s : s * (a / (a + b))), 1);
  return rest * (post[k].b / (post[k].a + post[k].b)) / 2;
}

// Simulation (seeded): each draw takes a success rate for every step from its posterior, the end-to-end completion
// rate Π p_k, the gain from halving each step's failures, and the time of one simulated user who completes (sum of
// log-normal step times). With a cohort size, completers in the cohort are drawn as Binomial(cohort, Π p_k).
export function simulate(steps, { draws = 20000, prior = 1, seed = 5, cohort = 0 } = {}) {
  const u = rng(seed), z = normalRng(seed + 1), post = steps.map((s) => posterior(s, prior)), K = steps.length;
  const times = steps.map((s) => (Number.isFinite(s.median) ? lognormal(s) : null));
  const comp = new Float64Array(draws), tt = new Float64Array(draws), gains = steps.map(() => new Float64Array(draws));
  const worst = new Array(K).fill(0), bestFix = new Array(K).fill(0), cohortDraws = cohort > 0 ? new Float64Array(draws) : null;
  const hasTime = times.every(Boolean);
  for (let d = 0; d < draws; d++) {
    const p = post.map(({ a, b }) => betaDraw(a, b, u, z));
    const prod = p.reduce((s, v) => s * v, 1);
    comp[d] = prod;
    let wi = 0, bi = 0, bg = -1;
    for (let k = 0; k < K; k++) {
      if (p[k] < p[wi]) wi = k;
      const g = (prod / p[k]) * ((1 - p[k]) / 2);
      gains[k][d] = g; if (g > bg) { bg = g; bi = k; }
    }
    worst[wi]++; bestFix[bi]++;
    if (hasTime) { let t = 0; for (const tm of times) t += Math.exp(tm.mu + tm.sigma * z()); tt[d] = t; }
    if (cohortDraws) {
      if (cohort <= 2000) { let x = 0; for (let i = 0; i < cohort; i++) if (u() < prod) x++; cohortDraws[d] = x; }
      else cohortDraws[d] = Math.max(0, Math.min(cohort, Math.round(cohort * prod + Math.sqrt(cohort * prod * (1 - prod)) * z())));
    }
  }
  const sorted = Float64Array.from(comp).sort();
  const q = (arr, x) => quantileSorted(arr, x);
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const out = {
    draws, prior,
    completion: { mean: mean(comp), median: q(sorted, 0.5), lo: q(sorted, 0.025), hi: q(sorted, 0.975), p10: q(sorted, 0.1), p90: q(sorted, 0.9) },
    hist: histogram(sorted, 30),
    steps: steps.map((s, k) => {
      const g = Float64Array.from(gains[k]).sort();
      const { a, b } = post[k];
      return { name: s.name, a, b, mean: a / (a + b), lo: betaQ(a, b, 0.025), hi: betaQ(a, b, 0.975), gain: mean(gains[k]), gainLo: q(g, 0.025), gainHi: q(g, 0.975), pWorst: worst[k] / draws, pBestFix: bestFix[k] / draws, time: times[k] ? { median: s.median, p90: s.p90, mean: Math.exp(times[k].mu + times[k].sigma ** 2 / 2) } : null };
    }),
  };
  if (hasTime) { const ts = Float64Array.from(tt).sort(); out.time = { median: q(ts, 0.5), lo: q(ts, 0.1), hi: q(ts, 0.9), p95: q(ts, 0.95), mean: mean(tt) }; }
  if (cohortDraws) { const cs = Float64Array.from(cohortDraws).sort(); out.cohort = { n: cohort, median: q(cs, 0.5), lo: q(cs, 0.025), hi: q(cs, 0.975) }; }
  return out;
}
// Beta quantile for the step table, by bisection on the regularised incomplete beta.
function betaQ(a, b, p) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
function histogram(sorted, bins) {
  const lo = sorted[0], hi = sorted[sorted.length - 1], w = (hi - lo) / bins || 1, h = new Array(bins).fill(0);
  for (const v of sorted) h[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return { lo, w, counts: h };
}

// ── Reading your results ──
// Confidence rule: high when the 95% credible interval for end-to-end completion is at most 10 percentage points
// wide, medium when at most 20 points, low otherwise. The width shrinks as every step gets more attempts; the
// smallest step usually decides it.
export function journeyConfidence(sim) {
  const w = sim.completion.hi - sim.completion.lo;
  return w <= 0.1 ? 'high' : w <= 0.2 ? 'medium' : 'low';
}
export function journeySummary(sim, steps) {
  const fix = [...sim.steps].map((s, k) => ({ ...s, k })).sort((a, b) => b.gain - a.gain);
  const f = fix[0], small = [...steps].sort((a, b) => a.n - b.n)[0];
  const c = sim.completion, w = c.hi - c.lo;
  return {
    headline: `About ${pctS(c.mean, 0)} of people are forecast to complete all ${steps.length} steps (95% credible interval ${pctS(c.lo, 0)} to ${pctS(c.hi, 0)}); fix "${f.name}" first.`,
    meaning: [
      `Halving the failures at "${f.name}" would lift completion by about ${fmt(f.gain * 100, 1)} percentage points; it gives the biggest gain in ${pctS(f.pBestFix, 0)} of simulations.`,
      fix[1] ? `Next: "${fix[1].name}" (+${fmt(fix[1].gain * 100, 1)} points), then "${fix[2] ? fix[2].name : fix[1].name}"${fix[2] ? ` (+${fmt(fix[2].gain * 100, 1)})` : ''}.` : null,
      sim.time ? `People who complete take a median ${fmtS(sim.time.median)} end to end; 80% of them between ${fmtS(sim.time.lo)} and ${fmtS(sim.time.hi)}.` : null,
      sim.cohort ? `Out of the next ${fmt(sim.cohort.n, 0)} people to start, expect ${fmt(sim.cohort.lo, 0)} to ${fmt(sim.cohort.hi, 0)} to complete (95% predictive interval).` : null,
      `Because this is a Bayesian model with a ${sim.prior === 1 ? 'uniform' : 'Jeffreys'} prior, the interval can be read directly: given these counts, there is a 95% probability that the true completion rate lies in it.`,
    ].filter(Boolean),
    confidence: journeyConfidence(sim),
    confidenceNote: `High when the 95% credible interval for completion is at most 10 points wide, medium up to 20 points, low otherwise. Here it is ${fmt(w * 100, 0)} points wide; the step with the fewest attempts is "${small.name}" (${small.n}).`,
    caveats: [
      'Steps are treated as independent: if the same kind of person struggles at several steps, the real completion rate is higher than the product suggests.',
      'Counts must be per step for the people who reached that step. Mixing sources (analytics for one step, a test for another) mixes populations.',
      '"Halving failures" is a yardstick for comparison, not a prediction of what a redesign will achieve.',
    ],
    next: [
      `Study why people fail at "${f.name}" (session recordings, a usability test of that step) before redesigning it.`,
      'Check each step rate on its own with the [completion rate interval](/calculators/completion-rate) calculator.',
    ],
    report: `A Monte Carlo forecast (${fmt(sim.draws, 0)} draws, Beta posteriors per step) puts end-to-end completion at ${pctS(c.mean, 0)} (95% credible interval ${pctS(c.lo, 0)} to ${pctS(c.hi, 0)}); halving failures at "${f.name}" would add about ${fmt(f.gain * 100, 1)} percentage points, the largest gain of any step.`,
  };
}
