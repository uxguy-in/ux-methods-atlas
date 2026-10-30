// Risk and harm measures for UX epidemiology: risk ratio, odds ratio, risk difference, NNT/NNH, attributable
// fractions, incidence vs prevalence, and direct and indirect standardisation. Pure functions; checked by
// server/scripts/check-signals.js against statsmodels (Table2x2, proportion_confint, confint_proportions_2indep) and scipy.
import { wilsonCI, zConf, normSf, chi2Sf, chi2Inv, poissonCI, toNum, parseLines, fmt, pctText, intText, sig, pText } from './signals-core.js';

// 2×2 table: a = exposed with the outcome, b = exposed without, c = unexposed with, d = unexposed without.
export function twoByTwo(a, b, c, d, { conf = 0.95, design = 'cohort', pe } = {}) {
  const z = zConf(conf), n1 = a + b, n0 = c + d, N = n1 + n0;
  if (![a, b, c, d].every((v) => v >= 0) || !(n1 > 0) || !(n0 > 0)) return null;
  const r1 = a / n1, r0 = c / n0;
  // Odds ratio with Woolf's log interval (statsmodels Table2x2.oddsratio_confint); 0.5 is added to every cell when any is 0.
  const zero = [a, b, c, d].some((v) => v === 0), [A, B, C, D] = zero ? [a + 0.5, b + 0.5, c + 0.5, d + 0.5] : [a, b, c, d];
  const or = (A * D) / (B * C), seOr = Math.sqrt(1 / A + 1 / B + 1 / C + 1 / D);
  // Risk ratio with the Katz log interval (statsmodels Table2x2.riskratio_confint).
  const rr = (A / (A + B)) / (C / (C + D)), seRr = Math.sqrt(1 / A - 1 / (A + B) + 1 / C - 1 / (C + D));
  // Risk difference with the Wald interval (statsmodels confint_proportions_2indep(compare='diff', method='wald')) and
  // the Newcombe hybrid score interval (method='newcomb').
  const rd = r1 - r0, seRd = Math.sqrt((r1 * (1 - r1)) / n1 + (r0 * (1 - r0)) / n0);
  const w1 = wilsonCI(a, n1, conf), w0 = wilsonCI(c, n0, conf);
  const newcombe = { lo: rd - Math.sqrt((r1 - w1.lo) ** 2 + (w0.hi - r0) ** 2), hi: rd + Math.sqrt((w1.hi - r1) ** 2 + (r0 - w0.lo) ** 2) };
  // Pearson χ² without continuity correction.
  const chi2 = (N * (a * d - b * c) ** 2) / (n1 * n0 * (a + c) * (b + d));
  // NNT/NNH = 1/|RD|; its interval inverts the Newcombe interval of RD (Altman 1998). When that interval includes 0 the
  // NNT interval runs through infinity: from NNT_lo (benefit) to ∞ and from ∞ to NNH (harm).
  const nn = { value: 1 / Math.abs(rd), harm: rd > 0, crosses: newcombe.lo <= 0 && newcombe.hi >= 0, lo: 1 / Math.max(Math.abs(newcombe.lo), Math.abs(newcombe.hi)), hi: 1 / Math.min(Math.abs(newcombe.lo), Math.abs(newcombe.hi)), bound1: 1 / Math.abs(newcombe.lo), bound2: 1 / Math.abs(newcombe.hi) };
  // Attributable fractions. Among the exposed: AFe = (RR − 1)/RR. Population (Levin): PAF = pe(RR − 1)/(1 + pe(RR − 1)),
  // with pe the share of the population exposed (from the table unless given). For case-control data, OR replaces RR
  // and Miettinen's form PAF = pc(OR − 1)/OR uses pc, the share of cases exposed.
  const eff = design === 'casecontrol' ? or : rr;
  const pExp = Number.isFinite(pe) ? pe : n1 / N, pc = a / (a + c);
  const afe = (eff - 1) / eff;
  const paf = design === 'casecontrol' ? (pc * (eff - 1)) / eff : (pExp * (eff - 1)) / (1 + pExp * (eff - 1));
  const out = {
    a, b, c, d, n1, n0, N, r1, r0, design, conf, zero,
    or: { est: or, lo: Math.exp(Math.log(or) - z * seOr), hi: Math.exp(Math.log(or) + z * seOr), se: seOr },
    rr: { est: rr, lo: Math.exp(Math.log(rr) - z * seRr), hi: Math.exp(Math.log(rr) + z * seRr), se: seRr },
    rd: { est: rd, lo: rd - z * seRd, hi: rd + z * seRd, se: seRd, nLo: newcombe.lo, nHi: newcombe.hi },
    chi2, p: chi2Sf(chi2, 1), nn, afe, paf, pExp, pc,
    r1CI: w1, r0CI: w0,
  };
  return out;
}

// ── Incidence and prevalence ──
// Incidence rate = new cases / person-time with the exact Poisson interval; cumulative incidence = new cases / people at
// risk at the start, prevalence = existing cases / people observed (Wilson intervals). In a steady state
// P/(1 − P) = I × D, so the mean duration D = P / (I(1 − P)).
export function incidencePrevalence({ newCases, personTime, atRisk, existing, population, conf = 0.95 }) {
  const out = {};
  if (newCases >= 0 && personTime > 0) { const ci = poissonCI(newCases, conf); out.rate = { est: newCases / personTime, lo: ci.lo / personTime, hi: ci.hi / personTime }; }
  if (newCases >= 0 && atRisk > 0 && newCases <= atRisk) out.cumulative = { est: newCases / atRisk, ...wilsonCI(newCases, atRisk, conf) };
  if (existing >= 0 && population > 0 && existing <= population) out.prevalence = { est: existing / population, ...wilsonCI(existing, population, conf) };
  if (out.rate && out.prevalence && out.rate.est > 0) out.duration = out.prevalence.est / (out.rate.est * (1 - out.prevalence.est));
  return out;
}

// ── Standardisation ──
// Rows: stratum, events A, people A, events B, people B, standard population (optional; default = A + B people).
export function parseStrata(text) {
  const rows = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    const v = c.slice(1).map(toNum);
    if (c.length >= 5 && v.slice(0, 4).every((x) => x >= 0) && v[1] > 0 && v[3] > 0 && v[0] <= v[1] * 1e9 && v[2] <= v[3] * 1e9) rows.push({ name: c[0], xa: v[0], na: v[1], xb: v[2], nb: v[3], std: Number.isFinite(v[4]) && v[4] > 0 ? v[4] : v[1] + v[3] });
    else if (i > 0 || c.length >= 5) bad.push(i + 1);
  });
  return { rows, bad };
}
// Directly standardised rate DSR = Σ wᵢ xᵢ/nᵢ with weights wᵢ = stdᵢ/Σstd, and the Fay and Feuer (1997) gamma interval
// (as R epitools::ageadjust.direct): with y = DSR, v = Σ wᵢ² xᵢ/nᵢ², wM = max(wᵢ/nᵢ),
// lower = v/(2y)·χ²_{α/2}(2y²/v), upper = (v + wM²)/(2(y + wM))·χ²_{1−α/2}(2(y + wM)²/(v + wM²)).
export function directRate(rows, key, conf = 0.95) {
  const tot = rows.reduce((s, r) => s + r.std, 0), a = (1 - conf) / 2;
  const w = rows.map((r) => r.std / tot), x = rows.map((r) => r[`x${key}`]), n = rows.map((r) => r[`n${key}`]);
  const y = w.reduce((s, wi, i) => s + (wi * x[i]) / n[i], 0), v = w.reduce((s, wi, i) => s + (wi * wi * x[i]) / (n[i] * n[i]), 0);
  const wM = Math.max(...w.map((wi, i) => wi / n[i]));
  const lo = y > 0 ? (v / (2 * y)) * chi2Inv(a, (2 * y * y) / v) : 0;
  const hi = ((v + wM * wM) / (2 * (y + wM))) * chi2Inv(1 - a, (2 * (y + wM) ** 2) / (v + wM * wM));
  const crude = x.reduce((s, xi) => s + xi, 0) / n.reduce((s, ni) => s + ni, 0);
  return { est: y, lo, hi, se: Math.sqrt(v), crude };
}
// Indirect standardisation: group A's expected events from group B's stratum rates; SMR = observed / expected with the
// exact Poisson interval on the observed count.
export function smr(rows, conf = 0.95) {
  const O = rows.reduce((s, r) => s + r.xa, 0), E = rows.reduce((s, r) => s + (r.na * r.xb) / r.nb, 0);
  const ci = poissonCI(O, conf);
  return { O, E, est: O / E, lo: ci.lo / E, hi: ci.hi / E };
}
export function standardise(rows, conf = 0.95) {
  if (rows.length < 2) return null;
  const A = directRate(rows, 'a', conf), B = directRate(rows, 'b', conf);
  const z = zConf(conf), ratio = A.est / B.est, seLog = Math.sqrt((A.se / A.est) ** 2 + (B.se / B.est) ** 2);
  return { A, B, ratio: { est: ratio, lo: Math.exp(Math.log(ratio) - z * seLog), hi: Math.exp(Math.log(ratio) + z * seLog) }, smr: smr(rows, conf), rows, crudeRatio: A.crude / B.crude };
}

export const EXAMPLE_2X2 = { a: 46, b: 354, c: 21, d: 379 };
export const EXAMPLE_STRATA = ['# stratum, harms in A, users in A, harms in B, users in B, standard population (optional)',
  'New (under 30 days), 38, 900, 24, 300', 'Established (30–365 days), 22, 700, 30, 900', 'Long-term (over 1 year), 6, 400, 20, 1800'].join('\n');

// ── Reading your results ──
// Confidence rule (2×2): "high" when every cell has at least 10 people and the interval for the risk ratio (odds ratio
// for case-control) excludes 1 or is narrower than a factor of 2; "medium" when every cell has at least 5; "low"
// otherwise. Small cells make log intervals unstable (Agresti 2013, Categorical Data Analysis).
export function summary2x2(t, labels = { exp: 'exposed users', unexp: 'unexposed users', out: 'harm' }) {
  const cc = t.design === 'casecontrol', eff = cc ? t.or : t.rr, effName = cc ? 'odds ratio' : 'risk ratio';
  const minCell = Math.min(t.a, t.b, t.c, t.d), excl = eff.lo > 1 || eff.hi < 1, narrow = eff.hi / eff.lo < 2;
  const confidence = minCell >= 10 && (excl || narrow) ? 'high' : minCell >= 5 ? 'medium' : 'low';
  const nnName = t.nn.harm ? 'NNH' : 'NNT';
  const nnText = t.nn.crosses ? `${nnName} ${fmt(t.nn.value, 1)}, but its 95% interval runs from NNH ${fmt(1 / t.rd.nHi, 1)} through infinity to NNT ${fmt(1 / Math.abs(t.rd.nLo), 1)}, so the direction is uncertain` : `${nnName} ${fmt(t.nn.value, 1)} (95% CI ${fmt(t.nn.lo, 1)} to ${fmt(t.nn.hi, 1)})`;
  const meaning = cc ? [
    `In a case-control design the share of people with ${labels.out} is set by the sampling, so risks, the risk ratio and NNT cannot be estimated. The odds ratio can: ${fmt(t.or.est, 2)} (95% CI ${fmt(t.or.lo, 2)} to ${fmt(t.or.hi, 2)}). When the outcome is rare (under about 10%), it approximates the risk ratio.`,
    `${pctText(t.pc, 0)} of cases were exposed. If the odds ratio reflects a causal effect, about ${pctText(t.paf, 0)} of cases are attributable to the exposure (Miettinen's population attributable fraction).`,
  ] : [
    `Risk of ${labels.out}: ${pctText(t.r1, 1)} when ${labels.exp} vs ${pctText(t.r0, 1)} when ${labels.unexp}. Risk ratio ${fmt(t.rr.est, 2)} (95% CI ${fmt(t.rr.lo, 2)} to ${fmt(t.rr.hi, 2)}); odds ratio ${fmt(t.or.est, 2)}.`,
    `Risk difference ${t.rd.est >= 0 ? '+' : ''}${fmt(t.rd.est * 100, 1)} percentage points (95% CI ${fmt(t.rd.nLo * 100, 1)} to ${fmt(t.rd.nHi * 100, 1)}): ${nnText}. ${t.nn.harm ? `For every ${fmt(Math.ceil(t.nn.value), 0)} people exposed, about one more has the outcome (${labels.out}).` : `For every ${fmt(Math.ceil(t.nn.value), 0)} people exposed, about one fewer has the outcome (${labels.out}).`}`,
    t.rr.est > 1 ? `Among ${labels.exp}, ${pctText(t.afe, 0)} of cases of ${labels.out} are attributable to the exposure; across the population (${pctText(t.pExp, 0)} exposed) the attributable fraction is ${pctText(t.paf, 0)}, if the link is causal.` : `The exposure is associated with less ${labels.out}; attributable fractions apply to harmful exposures, so read the risk difference instead.`,
    'Relative measures (risk ratio, odds ratio) sound larger than absolute ones: report the risk difference or NNT alongside, as Gigerenzer and colleagues recommend for transparent risk communication.',
  ];
  return {
    headline: cc ? `Odds ratio ${fmt(t.or.est, 2)} (95% CI ${fmt(t.or.lo, 2)} to ${fmt(t.or.hi, 2)}) for ${labels.out} with the exposure.` : `Risk ratio ${fmt(t.rr.est, 2)}: ${pctText(t.r1, 1)} vs ${pctText(t.r0, 1)} (${t.rd.est >= 0 ? '+' : ''}${fmt(t.rd.est * 100, 1)} percentage points, ${nnName} ${fmt(t.nn.value, 1)}).`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong when every cell has at least 10 people and the ${effName} interval excludes 1 (or is narrower than a factor of 2); some evidence when every cell has at least 5; weak otherwise. Here the smallest cell is ${intText(minCell)}; χ²(1) = ${fmt(t.chi2, 2)}, ${pText(t.p)}.`,
    caveats: [
      'An association is not a cause: people who meet the exposure (a dark pattern, a confusing flow) may differ in other ways. Compare like with like, or standardise by the obvious confounders.',
      cc ? 'Odds ratios overstate risk ratios when the outcome is common; do not describe an odds ratio of 3 as "three times the risk" unless the outcome is rare.' : 'NNT and NNH depend on the baseline risk: the same risk ratio gives a much larger NNH where the harm is rare.',
    ],
    next: ['Report absolute numbers alongside the ratio (for example "8 more in every 100 users").', 'Check whether the effect holds within segments (device, tenure) with the standardisation tab or a stratified analysis.'],
    report: cc
      ? `In a case-control comparison, exposure was associated with ${labels.out} (odds ratio ${fmt(t.or.est, 2)}, 95% CI ${fmt(t.or.lo, 2)} to ${fmt(t.or.hi, 2)}).`
      : `${labels.out[0].toUpperCase()}${labels.out.slice(1)} occurred in ${pctText(t.r1, 1)} of ${labels.exp} (${t.a}/${t.n1}) vs ${pctText(t.r0, 1)} of ${labels.unexp} (${t.c}/${t.n0}): risk ratio ${fmt(t.rr.est, 2)} (95% CI ${fmt(t.rr.lo, 2)} to ${fmt(t.rr.hi, 2)}), risk difference ${fmt(t.rd.est * 100, 1)} percentage points (95% CI ${fmt(t.rd.nLo * 100, 1)} to ${fmt(t.rd.nHi * 100, 1)}), ${nnName} ${fmt(t.nn.value, 1)}.`,
  };
}
// Confidence rule (incidence/prevalence): "high" with at least 20 new cases and 20 existing cases, "medium" with 5,
// "low" below; Poisson and binomial intervals are wide for small counts.
export function summaryIP(r, inp, unit = 'person-years') {
  const minC = Math.min(inp.newCases ?? 0, inp.existing ?? 0);
  const confidence = minC >= 20 ? 'high' : minC >= 5 ? 'medium' : 'low';
  const meaning = [];
  if (r.rate) meaning.push(`Incidence rate: ${sig(r.rate.est, 3)} new cases per ${unit.replace(/s$/, '')} (95% CI ${sig(r.rate.lo, 3)} to ${sig(r.rate.hi, 3)}). This is how fast new harm occurs.`);
  if (r.cumulative) meaning.push(`Cumulative incidence: ${pctText(r.cumulative.est, 1)} of people at risk had a new case over the period (95% CI ${pctText(r.cumulative.lo, 1)} to ${pctText(r.cumulative.hi, 1)}).`);
  if (r.prevalence) meaning.push(`Prevalence: ${pctText(r.prevalence.est, 1)} have the problem at the time of measurement (95% CI ${pctText(r.prevalence.lo, 1)} to ${pctText(r.prevalence.hi, 1)}). This is how common it is, which also depends on how long it lasts.`);
  if (r.duration) meaning.push(`If incidence and prevalence are stable, the average case lasts about ${sig(r.duration, 3)} ${unit.replace(/^person-/, '')} (P/(1 − P) = I × D). A long duration with low incidence means few new cases that linger; fixing recovery helps more than prevention.`);
  return {
    headline: `${r.prevalence ? `Prevalence ${pctText(r.prevalence.est, 1)}` : ''}${r.prevalence && r.rate ? ' and ' : ''}${r.rate ? `incidence ${sig(r.rate.est, 3)} per ${unit.replace(/s$/, '')}` : ''}${r.duration ? `, implying cases last about ${sig(r.duration, 3)} ${unit.replace(/^person-/, '')}` : ''}.`,
    meaning: meaning.length ? meaning : ['Enter counts to see incidence and prevalence.'],
    confidence,
    confidenceNote: `Rule: strong with at least 20 new and 20 existing cases, some evidence with at least 5, weak below. Here: ${intText(inp.newCases ?? 0)} new and ${intText(inp.existing ?? 0)} existing cases.`,
    caveats: ['Incidence needs a clear denominator of people at risk: exclude people who already have the problem at the start.', 'The duration estimate assumes a steady state; during a launch or a fix, incidence and prevalence are out of balance.'],
    next: ['Track incidence after a change (it moves first); prevalence follows only as old cases resolve.'],
    report: `${r.rate ? `Incidence was ${sig(r.rate.est, 3)} per ${unit.replace(/s$/, '')} (95% CI ${sig(r.rate.lo, 3)} to ${sig(r.rate.hi, 3)})` : ''}${r.rate && r.prevalence ? '; ' : ''}${r.prevalence ? `prevalence was ${pctText(r.prevalence.est, 1)} (95% CI ${pctText(r.prevalence.lo, 1)} to ${pctText(r.prevalence.hi, 1)})` : ''}.`,
  };
}
// Confidence rule (standardisation): "high" when every stratum has at least 10 events in each group, "medium" with at
// least 3, "low" otherwise.
export function summaryStd(s, names = ['A', 'B'], per = 1000) {
  const minX = Math.min(...s.rows.flatMap((r) => [r.xa, r.xb]));
  const confidence = minX >= 10 ? 'high' : minX >= 3 ? 'medium' : 'low';
  const f = (v) => sig(v * per, 3);
  const flips = (s.crudeRatio - 1) * (s.ratio.est - 1) < 0;
  return {
    headline: `Standardised rates: ${names[0]} ${f(s.A.est)} vs ${names[1]} ${f(s.B.est)} per ${per.toLocaleString()} (ratio ${fmt(s.ratio.est, 2)}); crude ratio ${fmt(s.crudeRatio, 2)}.`,
    meaning: [
      `Crude rates: ${names[0]} ${f(s.A.crude)} vs ${names[1]} ${f(s.B.crude)} per ${per.toLocaleString()}. Standardising to the same mix of strata gives ${f(s.A.est)} (95% CI ${f(s.A.lo)} to ${f(s.A.hi)}) vs ${f(s.B.est)} (${f(s.B.lo)} to ${f(s.B.hi)}).`,
      flips ? 'The comparison reverses after standardisation: the crude difference was driven by the different mix of strata (Simpson\'s paradox), not by the groups themselves.' : Math.abs(Math.log(s.crudeRatio / s.ratio.est)) > 0.1 ? 'Standardisation changes the size of the gap noticeably, so the mix of strata explains part of the crude difference.' : 'Standardisation changes little, so the different mix of strata does not explain the gap.',
      `Indirect standardisation: ${names[0]} had ${intText(s.smr.O)} events where ${names[1]}'s stratum rates predict ${sig(s.smr.E, 3)}, a standardised ratio of ${fmt(s.smr.est, 2)} (95% CI ${fmt(s.smr.lo, 2)} to ${fmt(s.smr.hi, 2)}).`,
    ],
    confidence,
    confidenceNote: `Rule: strong when every stratum has at least 10 events in each group, some evidence with at least 3, weak otherwise. Here the smallest stratum count is ${intText(minX)}.`,
    caveats: ['A standardised rate depends on the standard population chosen; report which one you used and compare rates only when they share it.', 'Standardisation adjusts only for the strata you entered; other differences between the groups remain.'],
    next: ['Report the standardised rates with the standard population, and the crude rates for context.'],
    report: `Directly standardised harm rates were ${f(s.A.est)} per ${per.toLocaleString()} for ${names[0]} (95% CI ${f(s.A.lo)} to ${f(s.A.hi)}) and ${f(s.B.est)} for ${names[1]} (${f(s.B.lo)} to ${f(s.B.hi)}), a ratio of ${fmt(s.ratio.est, 2)} (crude ratio ${fmt(s.crudeRatio, 2)}).`,
  };
}
export { normSf };
