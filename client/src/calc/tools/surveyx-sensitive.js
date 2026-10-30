// Sensitive questions: the list experiment (item count technique) and randomised response (Warner and forced-response
// designs). Pure functions shared by surveyx-Sensitive.jsx and server/scripts/check-surveyx.js.
import { normCdf, zCrit, tInv, tCdf, clamp, fmt, pct, pval } from './surveyx-core.js';

// Counts by answer: counts[y] = number of respondents who said y items apply.
function moments(counts) {
  const n = counts.reduce((a, b) => a + b, 0), m = counts.reduce((s, c, y) => s + c * y, 0) / n;
  const v = counts.reduce((s, c, y) => s + c * (y - m) ** 2, 0) / (n - 1);
  return { n, m, v };
}
const cdf = (counts, n) => { let c = 0; return counts.map((k) => (c += k) / n); };

// List experiment. control: counts for 0..J items, treat: counts for 0..J+1 items (J control items plus the sensitive one).
export function listExperiment(control, treat, { conf = 0.95, direct = null } = {}) {
  const J = control.length - 1;
  const C = moments(control), T = moments(treat);
  if (!(C.n >= 2 && T.n >= 2)) return { error: 'Enter answers for at least two people in each group.' };
  const est = T.m - C.m, se = Math.sqrt(T.v / T.n + C.v / C.n);
  const df = (T.v / T.n + C.v / C.n) ** 2 / ((T.v / T.n) ** 2 / (T.n - 1) + (C.v / C.n) ** 2 / (C.n - 1));
  const q = tInv(1 - (1 - conf) / 2, df), t = est / se, p = 2 * (1 - tCdf(Math.abs(t), df));
  // Blair and Imai (2012): joint proportions of (number of control items y, sensitive trait z).
  const FC = cdf(control, C.n), FT = cdf(treat, T.n);
  const at = (F, y) => (y < 0 ? 0 : y >= F.length ? 1 : F[y]);
  const pis = [];
  for (let y = 0; y <= J; y++) {
    const p1 = at(FC, y) - at(FT, y), s1 = Math.sqrt((at(FC, y) * (1 - at(FC, y))) / C.n + (at(FT, y) * (1 - at(FT, y))) / T.n);
    const p0 = at(FT, y) - at(FC, y - 1), s0 = Math.sqrt((at(FT, y) * (1 - at(FT, y))) / T.n + (at(FC, y - 1) * (1 - at(FC, y - 1))) / C.n);
    pis.push({ y, z: 1, est: p1, se: s1, p: s1 > 0 ? normCdf(p1 / s1) : p1 < 0 ? 0 : 1 });
    pis.push({ y, z: 0, est: p0, se: s0, p: s0 > 0 ? normCdf(p0 / s0) : p0 < 0 ? 0 : 1 });
  }
  const minP = Math.min(...pis.map((x) => x.p)), deP = Math.min(1, minP * pis.length);
  const floor = control[0] / C.n, ceiling = control[J] / C.n;
  let dq = null;
  if (direct && direct.n > 0) {
    const pd = direct.x / direct.n, sed = Math.sqrt((pd * (1 - pd)) / direct.n), g = est - pd, sg = Math.sqrt(se * se + sed * sed), z = zCrit(conf);
    dq = { p: pd, gap: g, se: sg, lo: g - z * sg, hi: g + z * sg, pval: 2 * (1 - normCdf(Math.abs(g / sg))) };
  }
  return { J, C, T, est, se, df, lo: est - q * se, hi: est + q * se, t, p, pis, deP, negative: pis.filter((x) => x.est < 0), floor, ceiling, direct: dq, conf };
}

// Randomised response. Warner (1965): with probability p the respondent answers "I have the trait", otherwise
// "I do not have the trait". Forced response (Boruch 1971): with probability pYes they must say yes, with pNo they
// must say no, otherwise they answer truthfully.
export function randomisedResponse({ design = 'forced', yes, n, p = 0.7, pYes = 1 / 6, pNo = 1 / 6, conf = 0.95 }) {
  if (!(n > 0) || !(yes >= 0) || yes > n) return { error: 'Enter the number of "yes" answers and the number of respondents.' };
  const lam = yes / n, z = zCrit(conf);
  let est, se, pTruth;
  if (design === 'warner') {
    if (Math.abs(2 * p - 1) < 1e-9) return { error: 'Warner\'s design needs p different from 0.5.' };
    est = (lam - (1 - p)) / (2 * p - 1); se = Math.sqrt((lam * (1 - lam)) / (n * (2 * p - 1) ** 2)); pTruth = p;
  } else {
    const p0 = 1 - pYes - pNo;
    if (!(p0 > 0)) return { error: 'The forced-yes and forced-no probabilities must add up to less than 1.' };
    est = (lam - pYes) / p0; se = Math.sqrt((lam * (1 - lam)) / (n * p0 * p0)); pTruth = p0;
  }
  const pi = clamp(est, 0, 1);
  // What a "yes" reveals about one person (Lanke 1976): P(trait | yes) and P(trait | no).
  const pYesTrait = design === 'warner' ? p : pYes + (1 - pYes - pNo), pNoTrait = design === 'warner' ? 1 - p : pNo;
  const lamFit = design === 'warner' ? p * pi + (1 - p) * (1 - pi) : pYes + (1 - pYes - pNo) * pi;
  const givenYes = lamFit > 0 ? (pi * pYesTrait) / lamFit : NaN, givenNo = lamFit < 1 ? (pi * pNoTrait) / (1 - lamFit) : NaN;
  const seDirect = Math.sqrt((pi * (1 - pi)) / n);
  return {
    design, yes, n, lam, est, se, lo: clamp(est - z * se, 0, 1), hi: clamp(est + z * se, 0, 1), rawLo: est - z * se, rawHi: est + z * se,
    pTruth, givenYes, givenNo, seDirect, effN: se > 0 ? (pi * (1 - pi)) / (se * se) : NaN, outside: est < 0 || est > 1, conf,
  };
}

// ── "Reading your results" ──
// Confidence rule (list experiment): high when the standard error is at most 5 points, no design-effect warning
// (Bonferroni p ≥ 0.05) and floor and ceiling shares in the control group are both under 10%; medium when the standard
// error is at most 10 points; low otherwise. The 10% floor/ceiling line is this tool's rule of thumb, following
// Blair and Imai's (2012) warning that ceiling and floor effects break the no-liars assumption.
export function listSummary(r, label = 'the sensitive item') {
  const clean = r.deP >= 0.05 && r.floor < 0.1 && r.ceiling < 0.1;
  const confidence = r.se <= 0.05 && clean ? 'high' : r.se <= 0.1 ? 'medium' : 'low';
  const meaning = [
    `The treatment group said ${fmt(r.T.m)} items apply on average and the control group ${fmt(r.C.m)}; the difference, ${pct(r.est, 1)}, estimates the share for whom ${label} is true (SE ${fmt(r.se * 100, 1)} points).`,
    r.negative.length
      ? `${r.negative.length} of the ${r.pis.length} Blair-Imai joint proportions are negative${r.deP < 0.05 ? `, more than chance would allow (Bonferroni p ${pval(r.deP)})` : ` but within chance (Bonferroni p ${pval(r.deP)})`}. ${r.deP < 0.05 ? 'Adding the sensitive item probably changed how people answered the control items (a design effect), so the estimate is not trustworthy.' : ''}`.trim()
      : 'All Blair-Imai joint proportions are zero or positive, so there is no sign that adding the sensitive item changed answers to the control items.',
    `In the control group ${pct(r.floor, 0)} said none of the items apply and ${pct(r.ceiling, 0)} said all ${r.J} apply. ${r.ceiling >= 0.1 ? 'That ceiling is high: people for whom every control item is true would reveal the sensitive answer by saying all, so some will under-report.' : r.floor >= 0.1 ? 'That floor is high: people with no control items would reveal the sensitive answer by saying one, so some will hide it.' : 'Both are low, so few people would be exposed by their count.'}`,
  ];
  if (r.direct) meaning.push(`Asked directly, ${pct(r.direct.p, 1)} said yes. The list estimate is ${fmt(r.direct.gap * 100, 1)} points ${r.direct.gap >= 0 ? 'higher' : 'lower'} (95% CI ${fmt(r.direct.lo * 100, 1)} to ${fmt(r.direct.hi * 100, 1)} points, p ${pval(r.direct.pval)}), ${r.direct.lo > 0 ? 'which suggests people under-report when asked directly.' : 'so the data do not show clear under-reporting.'}`);
  return {
    // A prevalence cannot be negative or above 100%, so the headline shows the estimate and interval cut to 0–100%.
    headline: `About ${pct(clamp(r.est, 0, 1), 0)} of respondents are estimated to have ${label} (95% CI ${pct(clamp(r.lo, 0, 1), 0)} to ${pct(clamp(r.hi, 0, 1), 0)}${r.lo < 0 || r.hi > 1 ? ', cut to 0–100%' : ''}).`,
    meaning,
    confidence,
    confidenceNote: `Rule: high when the standard error is at most 5 points, there is no design-effect warning and floor and ceiling shares in the control group are under 10% (this tool's rule of thumb); medium when the standard error is at most 10 points; low otherwise. Here the standard error is ${fmt(r.se * 100, 1)} points with ${r.C.n} control and ${r.T.n} treatment respondents.`,
    caveats: [
      'List experiments are noisy: the standard error is usually several times larger than a direct question with the same sample, because control-item variation adds noise.',
      'Pick control items that are not all common or all rare, and that are negatively related to each other, to keep people away from 0 and from all items.',
    ],
    next: [
      r.se > 0.05 ? `To halve the standard error, you need about four times as many respondents (about ${4 * (r.C.n + r.T.n)} in total).` : 'Report the interval, not only the point estimate, and keep the item wording identical in both versions.',
      'Compare with a direct question asked of another random subsample to measure under-reporting, or use randomised response in the next tab.',
    ],
    report: `In a list experiment with ${r.J} control items (control n = ${r.C.n}, treatment n = ${r.T.n}), the estimated prevalence of ${label} was ${pct(r.est, 1)} (difference in means, SE ${fmt(r.se * 100, 1)} points, 95% CI ${pct(r.lo, 1)} to ${pct(r.hi, 1)}); the Blair-Imai design-effect check gave Bonferroni p ${pval(r.deP)}.`,
  };
}

// Confidence rule (randomised response): high when the standard error is at most 3 points, medium when at most 7
// points, low otherwise; an estimate outside 0–100% is always low because the design or the instructions failed.
export function rrSummary(r, label = 'the sensitive trait') {
  const confidence = r.outside ? 'low' : r.se <= 0.03 ? 'high' : r.se <= 0.07 ? 'medium' : 'low';
  const name = r.design === 'warner' ? 'Warner\'s design' : 'the forced-response design';
  return {
    headline: `About ${pct(Math.max(0, Math.min(1, r.est)), 0)} of respondents are estimated to have ${label} (95% CI ${pct(r.lo, 0)} to ${pct(r.hi, 0)}).`,
    meaning: [
      `${r.yes} of ${r.n} said yes (${pct(r.lam, 1)}). Removing the answers forced by the randomiser in ${name} gives ${pct(r.est, 1)} with a standard error of ${fmt(r.se * 100, 1)} points.`,
      `A direct question with the same ${r.n} people would have a standard error of about ${fmt(r.seDirect * 100, 1)} points, so the privacy protection costs you the information of all but about ${Math.round(r.effN)} respondents.`,
      `A "yes" means a ${pct(r.givenYes, 0)} chance the person has ${label}, and a "no" a ${pct(r.givenNo, 0)} chance (at the estimated prevalence). ${r.givenYes > 0.8 ? 'A "yes" is still quite revealing; respondents may not feel protected.' : 'Neither answer gives a respondent away.'}`,
      r.outside ? 'The estimate falls outside 0–100%, which usually means people did not follow the randomiser (for example saying no when told to say yes).' : '',
    ].filter(Boolean),
    confidence,
    confidenceNote: `Rule: high when the standard error is at most 3 points, medium when at most 7 points, low otherwise, and always low if the estimate falls outside 0–100%. Here the standard error is ${fmt(r.se * 100, 1)} points.`,
    caveats: [
      'The estimate assumes everyone followed the randomiser. Some people say no even when told to say yes ("self-protective no"), which biases prevalence downwards.',
      'Randomised response works best when respondents understand and trust the device; test the instructions with a few people first.',
    ],
    next: [
      'Report the design probabilities with the estimate so others can judge privacy and precision.',
      'If you need group comparisons, plan for several times the sample of a direct question.',
    ],
    report: `Using ${name} (${r.design === 'warner' ? `p = ${r.pTruth}` : `truthful answer with probability ${fmt(r.pTruth, 3)}`}), ${r.yes} of ${r.n} respondents said yes; the estimated prevalence of ${label} was ${pct(r.est, 1)} (SE ${fmt(r.se * 100, 1)} points, 95% CI ${pct(r.lo, 1)} to ${pct(r.hi, 1)}).`,
  };
}
