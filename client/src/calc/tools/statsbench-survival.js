// Kaplan-Meier time-to-event analysis: survival curves with censoring, Greenwood standard errors, log-log
// ("exponential Greenwood") intervals as lifelines, median survival with its interval, Nelson-Aalen cumulative hazard,
// restricted mean survival time, and the log-rank test across groups. Checked against lifelines.
import { normInv, chi2Sf, inv, f, pText } from './statsbench-core.js';

// times: numbers ≥ 0; events: 1 = the event happened (adopted, abandoned), 0 = censored (not yet, or lost).
export function kaplanMeier(times, events, conf = 0.95) {
  const z = normInv(1 - (1 - conf) / 2), idx = times.map((_, i) => i).sort((a, b) => times[a] - times[b]);
  const n = times.length, rows = [];
  let atRisk = n, S = 1, gw = 0, H = 0, i = 0;
  while (i < n) {
    const t = times[idx[i]]; let d = 0, c = 0;
    while (i < n && times[idx[i]] === t) { if (events[idx[i]]) d++; else c++; i++; }
    if (d > 0) {
      S *= 1 - d / atRisk; H += d / atRisk;
      gw += atRisk > d ? d / (atRisk * (atRisk - d)) : 0;
      const v = Math.log(S), se = S * Math.sqrt(gw);
      const lo = S > 0 && S < 1 ? Math.exp(-Math.exp(Math.log(-v) - (z * Math.sqrt(gw)) / v)) : S === 1 ? 1 : 0;
      const hi = S > 0 && S < 1 ? Math.exp(-Math.exp(Math.log(-v) + (z * Math.sqrt(gw)) / v)) : S === 1 ? 1 : 0;
      rows.push({ t, atRisk, d, c, S, se, lo, hi, H, gw });
    } else rows.push({ t, atRisk, d, c, S, se: S * Math.sqrt(gw), lo: rows.length ? rows[rows.length - 1].lo : 1, hi: rows.length ? rows[rows.length - 1].hi : 1, H, gw, censorOnly: true });
    atRisk -= d + c;
  }
  const ev = rows.filter((r) => !r.censorOnly);
  // Quantile time (lifelines): the first time the curve is at or below q; infinite if it never gets there.
  const qTime = (key, q = 0.5) => { const r = rows.find((x) => x[key] <= q + 1e-12); return r ? r.t : Infinity; };
  const median = qTime('S'), medianLo = qTime('lo'), medianHi = qTime('hi');
  return { rows, events: ev, n, nEvents: events.filter(Boolean).length, median, medianCI: [medianLo, medianHi], maxT: Math.max(...times), lastS: rows.length ? rows[rows.length - 1].S : 1, conf, at: (t) => survivalAt(rows, t) };
}
export function survivalAt(rows, t) {
  let r = { S: 1, lo: 1, hi: 1, se: 0, atRisk: rows[0]?.atRisk ?? 0 };
  for (const x of rows) { if (x.t <= t) r = x; else break; }
  return r;
}
// Restricted mean survival time: the area under the Kaplan-Meier step curve from 0 to τ.
export function rmst(rows, tau) {
  let area = 0, prevT = 0, prevS = 1;
  for (const r of rows) { if (r.t > tau) break; area += prevS * (r.t - prevT); prevT = r.t; prevS = r.S; }
  return area + prevS * (tau - prevT);
}

// Log-rank test for k groups (Mantel-Haenszel): O − E and its covariance summed over the distinct event times,
// χ² = (O − E)'V⁻¹(O − E) on k − 1 df using the first k − 1 groups.
export function logRank(times, events, groups) {
  const levels = [...new Set(groups)], k = levels.length;
  const order = times.map((_, i) => i).sort((a, b) => times[a] - times[b]);
  const nAt = levels.map((g) => groups.filter((x) => x === g).length);
  const O = new Array(k).fill(0), E = new Array(k).fill(0), V = Array.from({ length: k }, () => new Array(k).fill(0));
  let i = 0;
  while (i < order.length) {
    const t = times[order[i]], dG = new Array(k).fill(0), leave = new Array(k).fill(0);
    while (i < order.length && times[order[i]] === t) { const g = levels.indexOf(groups[order[i]]); leave[g]++; if (events[order[i]]) dG[g]++; i++; }
    const d = dG.reduce((a, b) => a + b, 0), N = nAt.reduce((a, b) => a + b, 0);
    if (d > 0) {
      for (let g = 0; g < k; g++) {
        O[g] += dG[g]; E[g] += (d * nAt[g]) / N;
        if (N > 1) for (let h = 0; h < k; h++) V[g][h] += (d * (N - d) / (N - 1)) * (nAt[g] / N) * ((g === h ? 1 : 0) - nAt[h] / N);
      }
    }
    for (let g = 0; g < k; g++) nAt[g] -= leave[g];
  }
  const diff = O.map((o, g) => o - E[g]).slice(0, k - 1), Vi = inv(V.slice(0, k - 1).map((r) => r.slice(0, k - 1)));
  const chi2 = Vi ? diff.reduce((s, a, r) => s + a * Vi[r].reduce((acc, v, c) => acc + v * diff[c], 0), 0) : NaN;
  return { levels, O, E, chi2, df: k - 1, p: chi2Sf(chi2, k - 1) };
}
// Pairwise log-rank tests with Holm's adjustment, for three or more groups.
export function pairwiseLogRank(times, events, groups) {
  const levels = [...new Set(groups)], out = [];
  for (let a = 0; a < levels.length; a++) for (let b = a + 1; b < levels.length; b++) {
    const keep = groups.map((g, i) => (g === levels[a] || g === levels[b] ? i : -1)).filter((i) => i >= 0);
    const r = logRank(keep.map((i) => times[i]), keep.map((i) => events[i]), keep.map((i) => groups[i]));
    out.push({ a: levels[a], b: levels[b], chi2: r.chi2, p: r.p });
  }
  const order = out.map((_, i) => i).sort((x, y) => out[x].p - out[y].p); let run = 0;
  order.forEach((j, r) => { run = Math.max(run, Math.min(1, (out.length - r) * out[j].p)); out[j].pHolm = run; });
  return out;
}

// ── Summary ──
// Confidence rule: high when every group has at least 20 events and fewer than half its people are censored; medium
// when every group has at least 10 events; low otherwise (Kaplan-Meier tails rest on very few people; Pocock,
// Clayton and Altman 2002 recommend not reading curves where few remain at risk).
export function survivalSummary({ fits, lr, eventWord = 'the event', unit = 'days', tau, rm, conf = 0.95 }) {
  const c = Math.round(conf * 100), names = Object.keys(fits);
  const minEv = Math.min(...names.map((g) => fits[g].nEvents)), maxCens = Math.max(...names.map((g) => 1 - fits[g].nEvents / fits[g].n));
  const confidence = minEv >= 20 && maxCens < 0.5 ? 'high' : minEv >= 10 ? 'medium' : 'low';
  const medTxt = (k) => (Number.isFinite(k.median) ? `${f(k.median, 1)} ${unit} (${c}% CI ${f(k.medianCI[0], 1)} to ${Number.isFinite(k.medianCI[1]) ? f(k.medianCI[1], 1) : 'not reached'})` : 'not reached');
  let headline;
  if (names.length === 1) {
    const k = fits[names[0]];
    headline = Number.isFinite(k.median) ? `Half the people reached ${eventWord} by ${f(k.median, 1)} ${unit}; by the end of follow-up ${f((1 - k.lastS) * 100, 0)}% had.` : `Fewer than half the people reached ${eventWord} during follow-up (${f((1 - k.lastS) * 100, 0)}% by ${f(k.maxT, 0)} ${unit}), so the median is not reached.`;
  } else {
    headline = lr.p < 0.05 ? `Time to ${eventWord} differs between ${names.join(' and ')} (log-rank χ²(${lr.df}) = ${f(lr.chi2, 2)}, ${pText(lr.p)}).` : `No clear difference in time to ${eventWord} between ${names.join(' and ')} (log-rank χ²(${lr.df}) = ${f(lr.chi2, 2)}, ${pText(lr.p)}).`;
  }
  const meaning = names.map((g) => `${names.length > 1 ? `${g}: ` : ''}median time to ${eventWord} ${medTxt(fits[g])}; ${fits[g].nEvents} of ${fits[g].n} reached it, ${fits[g].n - fits[g].nEvents} censored.`);
  if (rm && Number.isFinite(tau)) meaning.push(`Restricted mean time up to ${f(tau, 0)} ${unit}: ${names.map((g) => `${names.length > 1 ? `${g} ` : ''}${f(rm[g], 1)} ${unit}`).join(', ')}; the area under each curve, comparable even when a median is not reached.`);
  if (lr && names.length > 1) meaning.push(`Observed vs expected events under no difference: ${lr.levels.map((g, i) => `${g} ${lr.O[i]} vs ${f(lr.E[i], 1)}`).join('; ')}.`);
  const caveats = [
    'Censoring must be unrelated to the outcome: if people who drop out were about to adopt (or abandon), the curve is biased.',
    'The right-hand end of each curve rests on the few people still being followed; do not read much into late drops.',
  ];
  if (names.length > 1) caveats.push('The log-rank test is most powerful when one group is consistently ahead; when curves cross it can miss real differences, so look at the plot.');
  const next = ['Report the median (or restricted mean) with its interval and the number still at risk at key times.', 'For several predictors at once, a Cox proportional hazards model is the next step.'];
  const report = names.length === 1
    ? `Kaplan-Meier analysis (n = ${fits[names[0]].n}, ${fits[names[0]].nEvents} events) gave a median time to ${eventWord} of ${medTxt(fits[names[0]])}.`
    : `Kaplan-Meier medians: ${names.map((g) => `${g} ${medTxt(fits[g])}`).join('; ')}. Log-rank test χ²(${lr.df}) = ${f(lr.chi2, 2)}, ${pText(lr.p)}.`;
  return { headline, meaning: meaning.slice(0, 6), confidence, confidenceNote: `Rule: strong when every group has at least 20 events and under half its people are censored; some evidence with at least 10 events per group; otherwise weak. Here the smallest group has ${minEv} events and the most-censored group ${f(maxCens * 100, 0)}% censored.`, caveats, next, report };
}
