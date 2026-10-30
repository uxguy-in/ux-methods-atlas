// Expected value of information: "should we research this before deciding?"
// Normal mode: each option's payoff is uncertain with a normal prior; a study with n participants per option and
// per-participant noise σ shrinks that uncertainty. EVPI and EVSI are exact for two options (or one uncertain option
// against fixed ones) and use Monte Carlo (in the Web Worker) for three or more uncertain options.
// Discrete mode: scenarios with prior probabilities, a payoff table and a study whose result depends on the scenario.
// Pure functions; checked against scipy and published examples in server/scripts/check-decisions.js.
import { normCdf, normPdf, normalRng, money, fmt, pctS } from './decisions-core.js';

// Unit normal loss: L(z) = E[max(Z − z, 0)] = φ(z) − z(1 − Φ(z)).
export const unitLoss = (z) => normPdf(z) - z * (1 - normCdf(z));

// Payoff of each option in money: V × metric − cost. Prior SD of the payoff and the SD of the preposterior mean
// (how far the study's posterior mean can move) for n participants per option with per-participant SD σ:
// s_pre = s × √(s² / (s² + σ²/n)).
export function payoffs({ options, V }) {
  return options.map((o) => ({ name: o.name, mu: V * o.mean - (o.cost || 0), s: Math.abs(V) * Math.max(0, o.sd) }));
}
export function preSd(o, n, sigma, V) {
  if (!(n > 0) || !(o.sd > 0)) return 0;
  if (!(sigma > 0)) return Math.abs(V) * o.sd;
  const v = o.sd * o.sd;
  return Math.abs(V) * o.sd * Math.sqrt(v / (v + (sigma * sigma) / n));
}

// Expected gain from learning payoffs with spread s_i before choosing: E[max_i X_i] − max_i μ_i, X_i ~ N(μ_i, s_i²)
// independent. Exact when at most two options are uncertain-or-competing; otherwise Monte Carlo with the given draws.
export function gainAnalytic(mu, s) {
  const unc = s.map((v, i) => i).filter((i) => s[i] > 0);
  const best = Math.max(...mu);
  if (unc.length === 0) return { value: 0, pChange: 0, exact: true };
  if (mu.length === 2) {
    const M = mu[0] - mu[1], S = Math.hypot(s[0], s[1]);
    return { value: S * unitLoss(Math.abs(M) / S), pChange: normCdf(-Math.abs(M) / S), exact: true };
  }
  if (unc.length === 1) {
    const i = unc[0], c = Math.max(...mu.filter((_, j) => j !== i));
    const z = (c - mu[i]) / s[i];
    // E[max(X, c)] = c + s·L((c − μ)/s); the decision changes when X crosses c.
    const pChange = mu[i] >= c ? normCdf(z) : 1 - normCdf(z);
    return { value: c + s[i] * unitLoss(z) - best, pChange, exact: true };
  }
  return null;
}

// Monte Carlo for k ≥ 3 uncertain options, with common random numbers across a list of spread vectors (sList), so
// the EVSI curve over n is smooth. Returns one { value, se, pChange } per spread vector.
export function gainMC(mu, sList, draws = 200000, seed = 11) {
  const k = mu.length, z = normalRng(seed), best = Math.max(...mu), bi = mu.indexOf(best);
  const acc = sList.map(() => ({ s1: 0, s2: 0, ch: 0 }));
  const zz = new Float64Array(k);
  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < k; i++) zz[i] = z();
    for (let t = 0; t < sList.length; t++) {
      const s = sList[t]; let m = -Infinity, mi = 0;
      for (let i = 0; i < k; i++) { const x = mu[i] + s[i] * zz[i]; if (x > m) { m = x; mi = i; } }
      const g = m - best, a = acc[t];
      a.s1 += g; a.s2 += g * g; if (mi !== bi) a.ch++;
    }
  }
  return acc.map((a) => {
    const m = a.s1 / draws, v = Math.max(0, a.s2 / draws - m * m);
    return { value: m, se: Math.sqrt(v / draws), pChange: a.ch / draws, exact: false };
  });
}

// Sample sizes for the EVSI curve: 0, then a roughly geometric grid up to nMax.
export function nGrid(nMax, points = 40) {
  const out = new Set([0]);
  for (let i = 0; i < points; i++) out.add(Math.max(1, Math.round(Math.exp((Math.log(nMax) * (i + 1)) / points))));
  return [...out].sort((a, b) => a - b);
}

// The full normal-mode analysis. draws/seed are used only when the Monte Carlo path is needed.
export function voiNormal({ options, V, n, sigma, studyFixed = 0, studyPer = 0, nMax }, { draws = 200000, seed = 11 } = {}) {
  const P = payoffs({ options, V });
  const mu = P.map((p) => p.mu), sFull = P.map((p) => p.s);
  const learnable = options.filter((o) => o.sd > 0).length;
  const costOf = (m) => (m > 0 ? studyFixed + studyPer * m * learnable : 0);
  const grid = nGrid(Math.max(nMax || 4 * Math.max(n, 10), 2));
  if (!grid.includes(n)) grid.push(n);
  grid.sort((a, b) => a - b);
  const sAt = (m) => options.map((o) => preSd(o, m, sigma, V));
  const analytic = gainAnalytic(mu, sFull);
  let evpi, curve;
  if (analytic) {
    evpi = analytic;
    curve = grid.map((m) => ({ n: m, ...gainAnalytic(mu, sAt(m)) }));
  } else {
    const mc = gainMC(mu, [sFull, ...grid.map(sAt)], draws, seed);
    evpi = mc[0];
    curve = grid.map((m, i) => ({ n: m, ...mc[i + 1] }));
  }
  curve = curve.map((c) => ({ ...c, cost: costOf(c.n), net: c.value - costOf(c.n) }));
  const at = curve.find((c) => c.n === n);
  const bestNet = curve.reduce((b, c) => (c.net > b.net ? c : b), curve[0]);
  const bi = mu.indexOf(Math.max(...mu));
  return { P, mu, sFull, best: bi, evpi, evsi: at, cost: costOf(n), curve, optimal: bestNet, exact: !!analytic, learnable };
}

// Discrete scenarios. probs: prior P(scenario); U[option][scenario]: payoff; L[result][scenario]: P(result | scenario).
export function voiDiscrete({ probs, U, L, cost = 0 }) {
  const S = probs.length, sP = probs.reduce((a, b) => a + b, 0);
  const p = probs.map((v) => v / sP);
  const eu = U.map((row) => row.reduce((a, u, s) => a + u * p[s], 0));
  const best = eu.indexOf(Math.max(...eu)), evNo = eu[best];
  const evPerfect = p.reduce((a, ps, s) => a + ps * Math.max(...U.map((row) => row[s])), 0);
  const results = L.map((lrow, r) => {
    const joint = p.map((ps, s) => ps * lrow[s]);
    const pr = joint.reduce((a, b) => a + b, 0);
    const post = joint.map((j) => (pr > 0 ? j / pr : 0));
    const euPost = U.map((row) => row.reduce((a, u, s) => a + u * post[s], 0));
    const choice = euPost.indexOf(Math.max(...euPost));
    return { r, pr, post, euPost, choice, ev: euPost[choice] };
  });
  const evSample = results.reduce((a, x) => a + x.pr * x.ev, 0);
  const colSums = Array.from({ length: S }, (_, s) => L.reduce((a, row) => a + row[s], 0));
  const pChange = results.filter((x) => x.choice !== best).reduce((a, x) => a + x.pr, 0);
  return { p, eu, best, evNo, evPerfect, evpi: evPerfect - evNo, results, evSample, evsi: evSample - evNo, net: evSample - evNo - cost, cost, colSums, pChange };
}

// Study accuracy helper for discrete mode: the study points to the true scenario with probability a and to each other
// scenario with probability (1 − a)/(S − 1). Returns L[result][scenario] with one result per scenario.
export function accuracyMatrix(S, a) {
  return Array.from({ length: S }, (_, r) => Array.from({ length: S }, (__, s) => (r === s ? a : (1 - a) / (S - 1))));
}

// "Reading your results" summary.
// Confidence rule (how robust "research or not" is): r = EVSI ÷ study cost.
//   high   — r ≥ 3 or r ≤ 1/3 (the value clearly beats, or clearly falls short of, the cost);
//   medium — r between 1.5 and 3, or between 1/3 and 2/3;
//   low    — r between 2/3 and 1.5 (a close call that small changes to the priors could flip).
// A study that costs nothing is judged on EVSI alone (high when EVSI > 0).
export function voiConfidence(evsi, cost) {
  if (!(cost > 0)) return evsi > 0 ? 'high' : 'low';
  const r = evsi / cost;
  return r >= 3 || r <= 1 / 3 ? 'high' : r >= 1.5 || r <= 2 / 3 ? 'medium' : 'low';
}
export function voiSummary({ mode, names, evpi, evsi, cost, best, pChange, unit = '£', n, optimalN, optimalNet, exact }) {
  const worth = evsi - cost;
  const go = worth > 0;
  const confidence = voiConfidence(evsi, cost);
  const $ = (x) => money(x, unit);
  const headline = `Perfect information is worth up to ${$(evpi)}; this study is worth about ${$(evsi)} against a cost of ${$(cost)}, so it ${go ? 'pays for itself' : 'does not pay for itself'} (net ${$(worth)}).`;
  const meaning = [
    `Without more research the best choice is "${names[best]}". The study has about a ${pctS(pChange)} chance of changing that choice; the value of research comes entirely from those cases.`,
    `EVPI (${$(evpi)}) is the most any research could be worth, because it assumes the answer would be certain. ${evpi < cost ? 'It is below the study cost, so no study of this decision is worth running at that price.' : 'Real studies are worth less (EVSI) because their answers are noisy.'}`,
  ];
  if (mode === 'normal' && Number.isFinite(optimalN)) meaning.push(optimalN > 0 && optimalNet > 0 ? `Among the sample sizes tried, about ${fmt(optimalN)} participants per option gives the largest net value (${$(optimalNet)}).` : 'No sample size tried gives a positive net value at these costs.');
  if (mode === 'normal' && !exact) meaning.push('With three or more uncertain options the values come from Monte Carlo simulation (200,000 draws); the standard errors are shown in the table.');
  const caveats = [
    'These values are only as good as the priors: if you are more uncertain than you entered, research is worth more; if less, it is worth less. Try a wider and a narrower prior.',
    'Value of information counts only the money you put in the payoffs. Learning that informs later decisions, or reduces risk you care about beyond the expected value, is not included.',
  ];
  const next = [
    go ? `Run the study${mode === 'normal' && n ? ` (about ${fmt(n)} per option)` : ''}, and write down beforehand which result would change the decision.` : `Decide now ("${names[best]}"), or find a cheaper or more decisive study: the research has to cost less than ${$(evsi)} to pay off.`,
    'Check the inputs that drive the answer most with the [decision tree](/calculators/decision-tree) tornado chart.',
  ];
  const report = `A value-of-information analysis gave an expected value of perfect information of ${$(evpi)} and an expected value of sample information of ${$(evsi)} for the planned study, against a cost of ${$(cost)} (net ${$(worth)}). Without research the preferred option was "${names[best]}"; the study had a ${pctS(pChange)} chance of changing it.`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'Based on the ratio of the study\'s value to its cost: high when the value is at least 3 times the cost or at most a third of it, medium between 1.5 and 3 times (or a third to two-thirds), low when value and cost are within a factor of 1.5 of each other. The priors are judgements, so treat close calls as close.',
    caveats, next, report,
  };
}
