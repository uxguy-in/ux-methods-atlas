// Multi-armed bandit simulator: Thompson sampling, epsilon-greedy and UCB1 against a fixed equal split, on Bernoulli
// arms (conversion rates). Traffic arrives in batches (allocation is updated between batches, as in production
// systems). Runs in the Web Worker (causal.worker.js); checked against an independent numpy simulation and exact
// binomial results in server/scripts/causal-reference.py.
import { rng, randBeta, randBinom, fmt, pctS } from './causal-core.js';

export const POLICIES = [
  ['fixed', 'Fixed A/B split'],
  ['thompson', 'Thompson sampling'],
  ['egreedy', 'Epsilon-greedy'],
  ['ucb', 'UCB1'],
];
export const POLICY_NAME = Object.fromEntries(POLICIES);

const argmaxRandom = (v, u) => {
  let best = -Infinity, idx = [];
  v.forEach((x, i) => { if (x > best + 1e-15) { best = x; idx = [i]; } else if (Math.abs(x - best) <= 1e-15) idx.push(i); });
  return idx.length === 1 ? idx[0] : idx[Math.floor(u() * idx.length)];
};
// Splits `B` visitors by weights w (sum 1): floor of each share, then the leftover visitors one at a time with
// probability proportional to the fractional parts (so the expected count is exactly B·w_k).
export function allocate(B, w, u) {
  const c = w.map((x) => Math.floor(B * x)); let left = B - c.reduce((a, b) => a + b, 0);
  const frac = w.map((x, i) => B * x - c[i]);
  while (left > 0) {
    const tot = frac.reduce((a, b) => a + b, 0); let r = u() * tot, k = 0;
    while (k < frac.length - 1 && r >= frac[k]) { r -= frac[k]; k++; }
    c[k]++; frac[k] = 0; left--;
  }
  return c;
}
// Thompson sampling allocation: the posterior probability that each arm is best (Beta(1 + s, 1 + n − s) posteriors),
// estimated from `draws` joint draws. When both Beta parameters exceed 30 the draw is a normal with the same mean
// and variance (indistinguishable there, and much faster); Box-Muller pairs are used in full.
export function probBest(s, n, u, draws = 64) {
  const K = s.length, w = new Array(K).fill(0);
  const a = s.map((x) => 1 + x), b = s.map((x, k) => 1 + n[k] - x);
  const approx = a.map((x, k) => x > 30 && b[k] > 30);
  const m = a.map((x, k) => x / (x + b[k])), sd = a.map((x, k) => Math.sqrt((x * b[k]) / ((x + b[k]) ** 2 * (x + b[k] + 1))));
  let spare = null;
  const z = () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let r1 = u(); while (r1 <= 1e-300) r1 = u();
    const r = Math.sqrt(-2 * Math.log(r1)), th = 2 * Math.PI * u();
    spare = r * Math.sin(th); return r * Math.cos(th);
  };
  for (let d = 0; d < draws; d++) {
    let best = -1, bv = -Infinity;
    for (let k = 0; k < K; k++) { const x = approx[k] ? m[k] + sd[k] * z() : randBeta(a[k], b[k], u); if (x > bv) { bv = x; best = k; } }
    w[best]++;
  }
  return w.map((x) => x / draws);
}

// One policy's weights for the next batch, given successes s and trials n so far.
function weights(policy, s, n, t, u, eps) {
  const K = s.length;
  const eq = new Array(K).fill(1 / K);
  if (policy === 'fixed') return eq;
  if (n.some((x) => x === 0)) { const z = n.map((x) => (x === 0 ? 1 : 0)), c = z.reduce((a, b) => a + b, 0); return z.map((x) => x / c); }
  if (policy === 'thompson') return probBest(s, n, u);
  if (policy === 'egreedy') { const b = argmaxRandom(s.map((x, k) => x / n[k]), u); return eq.map((x, k) => eps / K + (k === b ? 1 - eps : 0)); }
  if (policy === 'ucb') { const b = argmaxRandom(s.map((x, k) => x / n[k] + Math.sqrt((2 * Math.log(t)) / n[k])), u); return eq.map((_, k) => (k === b ? 1 : 0)); }
  throw new Error(`Unknown policy ${policy}`);
}

// Simulates `sims` runs of T visitors for each policy. Returns mean cumulative regret (expected conversions lost
// against always showing the best arm) at checkpoints, share of traffic to the best arm, the chance the arm picked
// at the end is a best arm, and Monte Carlo standard errors.
export function simulate({ p, T, batch = 100, sims = 1000, policies = POLICIES.map((x) => x[0]), eps = 0.1, seed = 1, points = 40 }) {
  const K = p.length, best = Math.max(...p), isBest = p.map((x) => x === best);
  const nb = Math.ceil(T / batch), every = Math.max(1, Math.ceil(nb / points));
  const cps = []; for (let b = every - 1; b < nb; b += every) cps.push(b); if (cps[cps.length - 1] !== nb - 1) cps.push(nb - 1);
  const out = {};
  policies.forEach((pol, pi) => {
    const u = rng((seed * 7919 + pi * 104729) >>> 0);
    const curve = new Float64Array(cps.length), regs = new Float64Array(sims);
    let shareSum = 0, correct = 0, convSum = 0;
    for (let r = 0; r < sims; r++) {
      const s = new Array(K).fill(0), n = new Array(K).fill(0);
      let reg = 0, conv = 0, t = 0, ci = 0;
      for (let b = 0; b < nb; b++) {
        const B = Math.min(batch, T - t);
        const c = allocate(B, weights(pol, s, n, t, u, eps), u);
        for (let k = 0; k < K; k++) { if (!c[k]) continue; const x = randBinom(c[k], p[k], u); s[k] += x; n[k] += c[k]; conv += x; reg += c[k] * (best - p[k]); }
        t += B;
        if (b === cps[ci]) { curve[ci] += reg; ci++; }
      }
      // The arm you would ship: highest posterior mean for Thompson sampling, highest observed rate otherwise.
      const est = pol === 'thompson' ? s.map((x, k) => (1 + x) / (2 + n[k])) : s.map((x, k) => (n[k] ? x / n[k] : -1));
      if (isBest[argmaxRandom(est, u)]) correct++;
      shareSum += n.reduce((a, x, k) => a + (isBest[k] ? x : 0), 0) / T;
      regs[r] = reg; convSum += conv;
    }
    const mReg = regs.reduce((a, b) => a + b, 0) / sims;
    const sdReg = Math.sqrt(regs.reduce((a, b) => a + (b - mReg) ** 2, 0) / Math.max(1, sims - 1));
    const pc = correct / sims;
    out[pol] = {
      regret: mReg, regretSe: sdReg / Math.sqrt(sims), bestShare: shareSum / sims, pCorrect: pc, pCorrectSe: Math.sqrt((pc * (1 - pc)) / sims),
      conversions: convSum / sims, curve: cps.map((b, i) => [Math.min(T, (b + 1) * batch), curve[i] / sims]),
    };
  });
  return { p, T, batch, sims, eps, K, best, policies, res: out, expectedBest: T * best };
}

// Example: four versions of a pricing-page headline, 3.0% to 3.6% sign-up, 20,000 visitors over the test.
export const EXAMPLE = { arms: [['Current headline', '3.0'], ['Save time', '3.3'], ['Social proof', '3.6'], ['Price first', '2.9']], T: '20000', batch: '200', sims: '500', eps: '0.1' };

// ── Reading your results ──
// Confidence rule (about the simulation, not your real test): strong when the policy with the lowest regret beats
// the runner-up by more than 3 Monte Carlo standard errors with at least 500 simulations; weak when the gap is under
// 2 standard errors or there are fewer than 300 simulations; some otherwise.
export function banditSummary(r) {
  const R = r.res, pols = r.policies.filter((x) => R[x]);
  const byReg = [...pols].sort((a, b) => R[a].regret - R[b].regret);
  const win = byReg[0], second = byReg[1];
  const f = R.fixed;
  const pct1 = (x) => pctS(x, 0);
  const headline = `Over ${fmt(r.T)} visitors, ${POLICY_NAME[win]} loses the fewest conversions (${fmt(R[win].regret, 0)} against always showing the best arm)${f && win !== 'fixed' ? `, versus ${fmt(f.regret, 0)} for a fixed equal split` : ''}.`;
  const meaning = pols.map((x) => `${POLICY_NAME[x]}: ${pct1(R[x].bestShare)} of traffic to the best arm, ${pct1(R[x].pCorrect)} chance of picking the right winner at the end, ${fmt(R[x].regret, 0)} conversions lost.`);
  const bestPick = [...pols].sort((a, b) => R[b].pCorrect - R[a].pCorrect)[0];
  if (bestPick !== win) meaning.push(`The trade-off: ${POLICY_NAME[win]} earns more during the test, but ${POLICY_NAME[bestPick]} is more likely to identify the true winner, because it keeps sending traffic to the weaker arms.`);
  const gap = second ? (R[second].regret - R[win].regret) / Math.hypot(R[second].regretSe, R[win].regretSe) : Infinity;
  let confidence, confidenceNote;
  if (r.sims < 300 || gap < 2) { confidence = 'low'; confidenceNote = r.sims < 300 ? `Only ${r.sims} simulations; the averages are noisy.` : `The top two policies are within ${fmt(gap, 1)} Monte Carlo standard errors of each other.`; }
  else if (gap > 3 && r.sims >= 500) { confidence = 'high'; confidenceNote = `The winner's lead is ${fmt(gap, 1)} Monte Carlo standard errors over ${fmt(r.sims)} simulations.`; }
  else { confidence = 'medium'; confidenceNote = `The winner's lead is ${fmt(gap, 1)} Monte Carlo standard errors.`; }
  confidenceNote += ' Rule (precision of this simulation only): strong = lead over 3 standard errors with at least 500 simulations; weak = under 2 standard errors or fewer than 300 simulations; some otherwise. It assumes your guessed conversion rates are right.';
  const caveats = [
    'The simulation assumes the conversion rates you entered and that they stay constant; real rates drift with seasonality and novelty, which can mislead a bandit that has stopped exploring.',
    'Bandits optimise conversions during the test, not learning: estimates for arms that get little traffic stay wide, and a fixed split gives cleaner, unbiased comparisons.',
    'Delayed conversions (sign-ups that happen days later) slow down how fast a bandit can learn.',
  ];
  const next = [
    'Use a bandit when the cost of showing weak versions is high and you need no precise estimate (headlines, promotions); use a fixed split when you need to learn and report the effect.',
    'Size a fixed-split test properly with the [sample size](/calculators/sample-size) calculator.',
    'Analyse a finished two-arm test with [Bayesian A/B testing](/calculators/bayes-ab).',
  ];
  const report = `In ${fmt(r.sims)} simulations of ${fmt(r.T)} visitors over ${r.K} arms (true rates ${r.p.map((x) => pctS(x, 1)).join(', ')}, allocation updated every ${fmt(r.batch)} visitors), ${pols.map((x) => `${POLICY_NAME[x]} lost ${fmt(R[x].regret, 0)} conversions and picked the best arm ${pct1(R[x].pCorrect)} of the time`).join('; ')}.`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}
