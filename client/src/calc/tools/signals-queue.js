// Queueing for service design: Little's law, the M/M/1 queue, and the M/M/c (Erlang C) model for contact centres and
// support desks: chance of waiting, average speed of answer, service level and the agents needed for a target.
// Pure functions; checked by server/scripts/check-signals.js against pyworkforce and published Erlang C examples.
import { fmt, pctText, intText, sig } from './signals-core.js';

// Little's law L = λW. Give any two of L (items in the system), lambda (arrivals per unit time), W (time in system).
export function little({ L, lambda, W }) {
  const has = (v) => Number.isFinite(v) && v > 0;
  if (has(lambda) && has(W)) return { L: lambda * W, lambda, W, solved: 'L' };
  if (has(L) && has(W)) return { L, lambda: L / W, W, solved: 'lambda' };
  if (has(L) && has(lambda)) return { L, lambda, W: L / lambda, solved: 'W' };
  return null;
}

// M/M/1 with arrival rate λ and service rate μ (same time unit): ρ = λ/μ; L = ρ/(1 − ρ); Lq = ρ²/(1 − ρ);
// W = 1/(μ − λ); Wq = ρ/(μ − λ); P(wait > t) = ρ e^(−(μ − λ)t); P(n in system) = (1 − ρ)ρⁿ.
export function mm1(lambda, mu) {
  if (!(lambda > 0 && mu > 0)) return null;
  const rho = lambda / mu;
  if (rho >= 1) return { rho, stable: false };
  return { rho, stable: true, L: rho / (1 - rho), Lq: rho * rho / (1 - rho), W: 1 / (mu - lambda), Wq: rho / (mu - lambda), pWait: rho, pWaitOver: (t) => rho * Math.exp(-(mu - lambda) * t), pN: (n) => (1 - rho) * rho ** n };
}

// Erlang B by the stable recursion B(0) = 1, B(k) = A·B(k−1)/(k + A·B(k−1)); Erlang C from B:
// C = c·B / (c − A(1 − B)), the probability that an arriving contact waits (A = traffic in Erlangs, c agents).
export function erlangB(A, c) { let B = 1; for (let k = 1; k <= c; k++) B = (A * B) / (k + A * B); return B; }
export function erlangC(A, c) {
  if (!(c > A)) return 1;
  const B = erlangB(A, c);
  return (c * B) / (c - A * (1 - B));
}
// M/M/c measures with traffic A = λ × AHT (Erlangs), c agents, answer-time target t (same time unit as AHT):
// service level SL = 1 − C·e^(−(c − A)t/AHT); ASA = C·AHT/(c − A); occupancy = A/c; Lq = λ·ASA.
export function mmc({ A, c, aht, t = 0, lambda }) {
  if (!(A > 0 && c >= 1 && aht > 0)) return null;
  if (c <= A) return { A, c, stable: false, occupancy: A / c };
  const C = erlangC(A, c), ASA = (C * aht) / (c - A);
  return { A, c, stable: true, C, ASA, sl: 1 - C * Math.exp((-(c - A) * t) / aht), occupancy: A / c, Lq: Number.isFinite(lambda) ? lambda * ASA : C * A / (c - A), pWaitOver: (s) => C * Math.exp((-(c - A) * s) / aht), answeredImmediately: 1 - C };
}
// Agents needed: the smallest c above A whose service level reaches the target (and, if set, whose occupancy is at or
// below the cap). Staff to schedule = ceil(c / (1 − shrinkage)).
export function agentsNeeded({ calls, interval, aht, t, target, shrinkage = 0, maxOcc = 1 }) {
  const lambda = calls / interval, A = lambda * aht;
  if (!(A > 0) || !(target > 0 && target < 1)) return null;
  let c = Math.max(1, Math.floor(A) + 1);
  for (; c < A + 10000; c++) { const m = mmc({ A, c, aht, t, lambda }); if (m.sl >= target && m.occupancy <= maxOcc) break; }
  const m = mmc({ A, c, aht, t, lambda });
  const table = [];
  for (let k = Math.max(1, Math.floor(A) + 1); k <= c + 4; k++) table.push(mmc({ A, c: k, aht, t, lambda }));
  return { A, lambda, agents: c, staff: Math.ceil(c / (1 - shrinkage) - 1e-9), shrinkage, ...m, table };
}

// ── Reading your results ──
// Confidence rule: the formulas are exact for their assumptions, so confidence describes the assumptions. "medium"
// by default (Poisson arrivals and exponential handling times are approximations); "low" when occupancy is above 90%,
// where small errors in volume or handling time change waits a lot; "high" never, because the inputs are forecasts.
export function summaryErlang(r, { calls, interval, aht, t, target }) {
  const confidence = r.occupancy > 0.9 ? 'low' : 'medium';
  const tSec = t, ahtSec = aht;
  const worse = r.table.find((m) => m.c === r.agents - 1);
  return {
    headline: `${r.agents} agents answer ${pctText(r.sl, 1)} of contacts within ${fmt(tSec, 0)} seconds (target ${pctText(target, 0)}); schedule ${r.staff} people with ${pctText(r.shrinkage, 0)} shrinkage.`,
    meaning: [
      `Traffic: ${intText(calls)} contacts per ${fmt(interval / 60, 0)} minutes with ${fmt(ahtSec, 0)} seconds average handling time is ${fmt(r.A, 2)} Erlangs, the number of agents that would be busy all the time with no waiting at all.`,
      `With ${r.agents} agents, ${pctText(r.C, 1)} of contacts wait at all, the average speed of answer is ${fmt(r.ASA, 1)} seconds and agents are busy ${pctText(r.occupancy, 0)} of the time.`,
      worse ? `One agent fewer (${worse.c}) would give a service level of ${pctText(worse.sl, 1)} and an average wait of ${fmt(worse.ASA, 1)} seconds: queues get worse quickly as agents are removed.` : 'This is the smallest number of agents that keeps the queue stable.',
    ],
    confidence,
    confidenceNote: `Rule: the Erlang C formulas are exact only if contacts arrive at random (Poisson) and handling times are exponential, nobody hangs up and every agent is the same, so results are rated "some evidence" at best; "weak" when occupancy is above 90%, where small forecast errors change waits sharply. Here occupancy is ${pctText(r.occupancy, 0)}.`,
    caveats: [
      'Erlang C ignores abandonment: real queues lose impatient customers, which makes waits look better than the experience is. With many abandons, use Erlang A or a simulation.',
      'The forecast matters more than the formula: a 10% error in contact volume or handling time moves the agents needed more than any refinement of the model.',
    ],
    next: ['Run the calculation for each interval of the day (volumes vary by hour) rather than for a daily average.', 'Check the service level against what users experience: survey or interview people who waited, not only those who were answered.'],
    report: `For ${intText(calls)} contacts per ${fmt(interval / 60, 0)} minutes with an average handling time of ${fmt(ahtSec, 0)} s (${fmt(r.A, 2)} Erlangs), Erlang C gives ${r.agents} agents to answer ${pctText(r.sl, 1)} within ${fmt(tSec, 0)} s (average speed of answer ${fmt(r.ASA, 1)} s, occupancy ${pctText(r.occupancy, 0)}), or ${r.staff} scheduled staff with ${pctText(r.shrinkage, 0)} shrinkage.`,
  };
}
export function summaryMM1(r, unit = 'minutes') {
  const confidence = r.rho > 0.9 ? 'low' : 'medium';
  return {
    headline: `At ${pctText(r.rho, 0)} utilisation, people spend ${sig(r.W, 3)} ${unit} in the system on average, ${sig(r.Wq, 3)} of them waiting.`,
    meaning: [
      `On average ${sig(r.L, 3)} people are in the system and ${sig(r.Lq, 3)} are waiting; ${pctText(r.rho, 0)} of arrivals have to wait.`,
      `Waiting grows as ρ/(1 − ρ): at 80% utilisation the queue is 4 times the service time, at 90% it is 9 times and at 95% 19 times. Running a single server near capacity makes waits explode.`,
    ],
    confidence,
    confidenceNote: `Rule: M/M/1 is exact only for random (Poisson) arrivals and exponential service times, so results are "some evidence" at best; "weak" above 90% utilisation, where small changes in load change waits sharply. Here utilisation is ${pctText(r.rho, 0)}.`,
    caveats: ['Real service times are often less variable than exponential, which makes M/M/1 pessimistic; very variable times (a few long cases) make it optimistic.'],
    next: ['Use Little\'s law with measured queue lengths to check the model against reality.'],
    report: `Modelled as an M/M/1 queue at ${pctText(r.rho, 0)} utilisation, the average time in the system is ${sig(r.W, 3)} ${unit} (${sig(r.Wq, 3)} ${unit} waiting), with ${sig(r.L, 3)} people in the system on average.`,
  };
}
export function summaryLittle(r) {
  return {
    headline: `Little's law: L = λW gives ${r.solved === 'L' ? `${sig(r.L, 3)} items in the system` : r.solved === 'lambda' ? `a throughput of ${sig(r.lambda, 3)} per time unit` : `${sig(r.W, 3)} time units in the system`}.`,
    meaning: [`With ${sig(r.lambda, 3)} arrivals per time unit and ${sig(r.W, 3)} time units in the system, there are on average ${sig(r.L, 3)} items in the system. The law holds for any stable system, whatever the arrival or service pattern (Little 1961).`],
    confidence: 'high',
    confidenceNote: 'Rule: Little\'s law is exact for long-run averages of any stable system, so confidence is strong when the inputs are measured over the same, long enough period; it is weak if the backlog is growing.',
    caveats: ['Use averages over the same period, and a period long enough that the system starts and ends in a similar state.'],
    next: ['Use it to check backlogs: if tickets arrive at 40 a day and the backlog is 200, the average ticket waits 5 days.'],
    report: `By Little's law (L = λW), ${sig(r.lambda, 3)} arrivals per time unit and ${sig(r.W, 3)} time units in the system imply ${sig(r.L, 3)} items in the system on average.`,
  };
}
