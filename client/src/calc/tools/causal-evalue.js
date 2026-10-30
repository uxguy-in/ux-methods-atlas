// E-value sensitivity analysis (VanderWeele and Ding 2017, Annals of Internal Medicine 167:268–274): how strongly an
// unmeasured confounder would have to be associated with both the exposure and the outcome, on the risk-ratio
// scale, to explain away an observed association. Conversions from odds ratios, hazard ratios and standardised mean
// differences follow VanderWeele and Ding (2017, table) and VanderWeele (2017, 2020).
import { fmt, normInv } from './causal-core.js';

// E-value of a risk ratio (on either side of 1): RR + √(RR(RR − 1)) after taking 1/RR when RR < 1.
export function evalueRR(rr) {
  if (!(rr > 0)) return NaN;
  const r = rr < 1 ? 1 / rr : rr;
  return r + Math.sqrt(r * (r - 1));
}

// Converts an estimate and its interval to the risk-ratio scale.
// type: 'RR' | 'OR' | 'HR' | 'SMD'. common: the outcome is common (over 15% by the end of follow-up).
// For SMD, est is Cohen's d and se its standard error (lo/hi are ignored): RR ≈ exp(0.91·d), CI exp(0.91·d ± 1.78·se).
export function toRR({ type, est, lo, hi, se, common }) {
  const hrCommon = (h) => (1 - 0.5 ** Math.sqrt(h)) / (1 - 0.5 ** Math.sqrt(1 / h));
  const f = type === 'OR' ? (common ? (x) => Math.sqrt(x) : (x) => x)
    : type === 'HR' ? (common ? hrCommon : (x) => x)
      : (x) => x;
  if (type === 'SMD') return { rr: Math.exp(0.91 * est), lo: Number.isFinite(se) ? Math.exp(0.91 * est - 1.78 * se) : NaN, hi: Number.isFinite(se) ? Math.exp(0.91 * est + 1.78 * se) : NaN };
  return { rr: f(est), lo: Number.isFinite(lo) ? f(lo) : NaN, hi: Number.isFinite(hi) ? f(hi) : NaN };
}

// Full analysis. trueRR is the value to shift the estimate to (1 = explain away entirely); the E-value for a
// non-null target uses RR/trueRR (VanderWeele, Ding and Mathur 2019).
export function evalue(input) {
  const t = input.trueRR > 0 ? input.trueRR : 1;
  const c = toRR(input);
  if (!(c.rr > 0)) return { error: 'Enter a positive estimate.' };
  if (Number.isFinite(c.lo) && Number.isFinite(c.hi) && !(c.lo <= c.rr && c.rr <= c.hi)) return { error: 'The estimate must lie between the lower and upper limits.' };
  const above = c.rr >= t;
  const point = evalueRR(c.rr / t);
  // The limit closer to the target; if the interval contains it, the E-value for the interval is 1.
  let near = NaN, ciE = NaN, includes = false;
  if (Number.isFinite(c.lo) || Number.isFinite(c.hi)) {
    near = above ? c.lo : c.hi;
    if (Number.isFinite(near)) { includes = above ? near <= t : near >= t; ciE = includes ? 1 : evalueRR(near / t); }
  }
  return { ...c, inputEst: input.est, trueRR: t, above, point, ciE, near, includes, type: input.type, common: !!input.common };
}

// Bias factor of a confounder with exposure-confounder RR_EU and confounder-outcome RR_UD (Ding and VanderWeele 2016):
// B = RR_EU·RR_UD / (RR_EU + RR_UD − 1). Dividing the observed RR by B gives the most it could be shifted.
export const biasFactor = (eu, ud) => (eu * ud) / (eu + ud - 1);
// The curve of confounder strengths that exactly explain away a ratio rr (> 1): RR_UD = rr(RR_EU − 1)/(RR_EU − rr),
// for RR_EU > rr.
export function biasCurve(rr, max = Math.max(4, 3 * evalueRR(rr)), steps = 120) {
  const r = rr < 1 ? 1 / rr : rr;
  if (!(r > 1)) return [];
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const eu = r + ((max - r) * (i + 1)) / (steps + 1);
    const ud = (r * (eu - 1)) / (eu - r);
    if (ud <= max * 1.001) pts.push([eu, ud]);
  }
  return pts;
}
// Adjusted estimate for a hypothesised confounder (on the risk-ratio scale, moved towards the null).
export function adjustFor(res, eu, ud) {
  const B = biasFactor(eu, ud), dir = res.rr >= 1 ? 1 : -1;
  const adj = (x) => (dir > 0 ? x / B : x * B);
  return { B, rr: adj(res.rr), lo: adj(res.lo), hi: adj(res.hi) };
}

// Standard error of d from its interval, for the SMD input.
export const seFromCI = (lo, hi, conf = 0.95) => (hi - lo) / (2 * normInv(1 - (1 - conf) / 2));

export const TYPE_NAME = { RR: 'risk ratio', OR: 'odds ratio', HR: 'hazard ratio', SMD: 'standardised mean difference' };
// Example: an observational comparison of accounts that did and did not use a new in-app guide, with churn at 12
// months as the outcome (adjusted for plan, size and tenure): HR 0.68 (95% CI 0.55 to 0.84), churn 22%, so common.
export const EXAMPLE = { type: 'HR', est: '0.68', lo: '0.55', hi: '0.84', se: '', common: true, trueRR: '1' };
// VanderWeele and Ding (2017) worked example: breastfeeding and infant death from respiratory infection (Victora et
// al. 1987), RR 3.9 (95% CI 1.8 to 8.7): E-value 7.2, for the limit 3.0.
export const PAPER_EXAMPLE = { type: 'RR', est: '3.9', lo: '1.8', hi: '8.7', se: '', common: false, trueRR: '1' };

// ── Reading your results ──
// Confidence rule (the robustness of the association to unmeasured confounding, not proof of causation): strong
// when the E-value for the confidence limit is at least 2 (a confounder would need to double the risk on both
// sides beyond the measured covariates); some when it is between 1.25 and 2; weak when below 1.25 or when the
// interval already includes the null. These cut-offs are this tool's convention: VanderWeele and Ding (2017) give
// no universal threshold and advise comparing the E-value with the strength of measured confounders.
export function evalueSummary(r, { exposure = 'the exposure', outcome = 'the outcome' } = {}) {
  const tn = TYPE_NAME[r.type];
  const e = fmt(r.point, 2), ce = Number.isFinite(r.ciE) ? fmt(r.ciE, 2) : null;
  const target = r.trueRR === 1 ? 'explain away the association' : `move the estimate to ${fmt(r.trueRR, 2)}`;
  const headline = `To ${target}, an unmeasured confounder would need to be associated with both ${exposure} and ${outcome} by a risk ratio of at least ${e} each, beyond the measured covariates${r.includes ? '; the confidence interval already includes the null, so it needs no confounding at all' : ce ? `; to move the confidence limit, at least ${ce}` : ''}.`;
  const meaning = [];
  meaning.push(`On the risk-ratio scale the estimate is ${fmt(r.rr, 2)}${Number.isFinite(r.lo) ? ` (interval ${fmt(r.lo, 2)} to ${fmt(r.hi, 2)})` : ''}${r.type !== 'RR' ? `, converted from the ${tn}${r.type === 'OR' || r.type === 'HR' ? (r.common ? ' with the common-outcome approximation' : ' assuming a rare outcome') : ''}` : ''}.`);
  meaning.push(`A weaker confounder could still explain it if it were much stronger on one side: any pair of risk ratios on or above the curve in the bias plot would do it.`);
  if (r.includes) meaning.push('The interval already includes the null value, so no confounding is needed to make the result compatible with no effect: the E-value for the interval is 1.');
  else if (ce) meaning.push(`A confounder with risk ratios of ${ce} on both sides would move the interval to just touch ${r.trueRR === 1 ? 'no effect' : fmt(r.trueRR, 2)}.`);
  let confidence, confidenceNote;
  const k = Number.isFinite(r.ciE) ? r.ciE : r.point;
  if (r.includes || k < 1.25) { confidence = 'low'; confidenceNote = r.includes ? 'The interval includes the null, so the result is fragile before any unmeasured confounding.' : `The E-value for the limit is only ${fmt(k, 2)}: a weak confounder would be enough.`; }
  else if (k < 2) { confidence = 'medium'; confidenceNote = `The E-value for the limit is ${fmt(k, 2)}: a moderate confounder could explain the result.`; }
  else { confidence = 'high'; confidenceNote = `The E-value for the limit is ${fmt(k, 2)}: a confounder would need to at least double the risk on both sides beyond the measured covariates.`; }
  confidenceNote += ' Rule (this tool\'s convention, as VanderWeele and Ding give no fixed threshold): strong ≥ 2, some 1.25 to 2, weak below 1.25 or interval includes the null. It rates robustness to unmeasured confounding only, not bias from measurement or selection.';
  const caveats = [
    'A large E-value does not prove causation: it says nothing about selection bias, measurement error or reverse causation.',
    'Compare the E-value with how strongly your measured covariates (plan, tenure, company size) relate to the exposure and outcome; an unmeasured factor of that strength is the benchmark.',
    r.type === 'OR' || r.type === 'HR' ? 'The conversion to risk ratios is approximate; choose "common outcome" when more than about 15% have the outcome by the end of follow-up.' : r.type === 'SMD' ? 'The SMD conversion (exp(0.91·d)) assumes a roughly normal outcome; treat the E-value as approximate.' : 'E-values for risk ratios from a randomised experiment are not needed: randomisation handles confounding.',
  ];
  const next = [
    'List plausible unmeasured confounders and estimate their strength; enter them as RR_EU and RR_UD to see the adjusted estimate.',
    'If you can, add a negative-control outcome or a comparison over time with [difference-in-differences](/calculators/diff-in-diff).',
    'For a two-group comparison of rates with intervals, see [risk and harm](/calculators/risk-harm).',
  ];
  const report = `Sensitivity to unmeasured confounding (VanderWeele and Ding 2017): observed ${tn} ${fmt(Number(r.inputEst ?? r.rr), 2)}${r.type !== 'RR' ? ` (≈ RR ${fmt(r.rr, 2)})` : ''}; E-value ${e}${ce ? `, for the confidence limit ${ce}` : ''}. An unmeasured confounder associated with both ${exposure} and ${outcome} by a risk ratio of ${e} each, beyond the measured covariates, could ${target}; weaker confounding could not.`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}
