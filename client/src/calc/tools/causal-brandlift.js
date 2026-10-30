// Brand lift: exposed vs control survey answers per question, with intervals for the absolute lift (Newcombe's
// hybrid score interval) and the relative lift (log risk ratio), two-proportion z tests with Holm's correction across
// questions, and a sample-size planner. Checked against statsmodels (server/scripts/causal-reference.py).
import { normInv, normCdf, holm, fmt, pctS, pp, pText, zCrit, sum } from './causal-core.js';

export function wilsonCI(x, n, conf = 0.95) {
  const z = zCrit(conf), p = x / n, den = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / den, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [c - h, c + h];
}
// One question: exposed x1 of n1 said yes, control x0 of n0.
export function liftOne(x1, n1, x0, n0, conf = 0.95) {
  const p1 = x1 / n1, p0 = x0 / n0, d = p1 - p0, z = zCrit(conf);
  const [l1, u1] = wilsonCI(x1, n1, conf), [l0, u0] = wilsonCI(x0, n0, conf);
  // Newcombe (1998) method 10 (statsmodels confint_proportions_2indep, method='newcomb').
  const lo = d - Math.sqrt((p1 - l1) ** 2 + (u0 - p0) ** 2), hi = d + Math.sqrt((u1 - p1) ** 2 + (p0 - l0) ** 2);
  // Relative lift p1/p0 − 1 with the log (Katz) interval for the ratio (statsmodels method='log').
  const rr = p1 / p0, seLog = Math.sqrt(1 / x1 - 1 / n1 + 1 / x0 - 1 / n0);
  const rlo = Math.exp(Math.log(rr) - z * seLog) - 1, rhi = Math.exp(Math.log(rr) + z * seLog) - 1;
  // Pooled two-proportion z test (statsmodels proportions_ztest).
  const pPool = (x1 + x0) / (n1 + n0), se0 = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n0));
  const zs = d / se0, p = 2 * (1 - normCdf(Math.abs(zs)));
  return { x1, n1, x0, n0, p1, p0, d, lo, hi, rel: rr - 1, rlo, rhi, z: zs, p };
}
export function brandLift(rows, conf = 0.95, reach = NaN) {
  const res = rows.map((r) => ({ name: r.name, ...liftOne(r.x1, r.n1, r.x0, r.n0, conf) }));
  const adj = holm(res.map((r) => r.p));
  res.forEach((r, i) => { r.pHolm = adj[i]; r.sig = adj[i] < 1 - conf; r.people = Number.isFinite(reach) ? reach * r.d : NaN; r.peopleLo = Number.isFinite(reach) ? reach * r.lo : NaN; r.peopleHi = Number.isFinite(reach) ? reach * r.hi : NaN; });
  return { rows: res, conf, reach, alpha: 1 - conf };
}

// Sample size per exposed group for a two-sided test of p1 = p0 + Δ, with control:exposed ratio k and m questions
// (Bonferroni α/m, a safe bound for Holm). n1 = [z(1−α/2)·√(p̄q̄(1 + 1/k)) + z(power)·√(p1q1 + p0q0/k)]² / Δ²,
// p̄ = (p1 + k·p0)/(1 + k) (Fleiss; statsmodels samplesize_proportions_2indep_onetail).
export function sampleSize({ p0, delta, alpha = 0.05, power = 0.8, k = 1, m = 1 }) {
  const p1 = p0 + delta;
  if (!(p0 > 0 && p0 < 1 && p1 > 0 && p1 < 1 && delta !== 0)) return null;
  const a = alpha / m, za = normInv(1 - a / 2), zb = normInv(power);
  const pb = (p1 + k * p0) / (1 + k);
  const raw = (za * Math.sqrt(pb * (1 - pb) * (1 + 1 / k)) + zb * Math.sqrt(p1 * (1 - p1) + (p0 * (1 - p0)) / k)) ** 2 / delta ** 2;
  const n1 = Math.ceil(raw - 1e-9), n0 = Math.ceil(k * n1 - 1e-9);
  return { raw, n1, n0, total: n1 + n0, p1, alphaEach: a };
}
// Smallest detectable lift for given group sizes (solves the formula above for Δ > 0 by bisection).
export function mdl({ p0, n1, alpha = 0.05, power = 0.8, k = 1, m = 1 }) {
  let lo = 1e-6, hi = 1 - p0 - 1e-6;
  if (!(hi > lo)) return NaN;
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2, s = sampleSize({ p0, delta: mid, alpha, power, k, m }); if (s.raw > n1) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Pasted questions: name, exposed yes, exposed n, control yes, control n (comma or tab separated, header optional).
export function parseQuestions(text) {
  const out = [], errors = [];
  String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).forEach((l, i) => {
    const c = l.split(l.includes('\t') ? '\t' : l.includes(';') && !l.includes(',') ? ';' : ',').map((s) => s.trim());
    const nums = c.slice(1).map((s) => Number(s.replace(/,(?=\d{3}\b)/g, '')));
    if (nums.length < 4 || nums.slice(0, 4).some((v) => !Number.isFinite(v))) { if (i > 0 || nums.slice(0, 4).every((v) => Number.isFinite(v))) errors.push(`Line ${i + 1}: need a name and four numbers.`); return; }
    const [x1, n1, x0, n0] = nums;
    if (![x1, n1, x0, n0].every((v) => Number.isInteger(v) && v >= 0) || x1 > n1 || x0 > n0 || !n1 || !n0) { errors.push(`Line ${i + 1}: counts must be whole numbers with yes ≤ asked.`); return; }
    if (!x1 || !x0) { errors.push(`Line ${i + 1}: needs at least one yes in each group for the relative lift.`); return; }
    out.push({ name: c[0] || `Question ${out.length + 1}`, x1, n1, x0, n0 });
  });
  return { rows: out, errors };
}
// Example: a video campaign, survey of 1,240 exposed and 1,180 control respondents (top-box answers).
export const EXAMPLE = `question,exposed_yes,exposed_n,control_yes,control_n
Ad recall,412,1240,286,1180
Brand awareness (aided),868,1240,791,1180
Consideration,397,1240,342,1180
Favourability,446,1240,401,1180
Purchase intent,223,1240,196,1180`;

// ── Reading your results ──
// Confidence rule: strong when at least one question's lift is significant after Holm's correction and that
// question has 300 or more respondents per group; weak when no question is significant after correction; some
// otherwise (significant but smaller groups). The 300 figure is this tool's convention for stable survey
// percentages (margin of error about ±5.7 points at 50%).
export function liftSummary(r) {
  const confW = `${Math.round(r.conf * 100)}%`;
  const sig = r.rows.filter((x) => x.sig).sort((a, b) => b.d - a.d);
  const best = [...r.rows].sort((a, b) => b.d - a.d)[0];
  const headline = sig.length
    ? `${sig.length} of ${r.rows.length} question${r.rows.length === 1 ? '' : 's'} show${sig.length === 1 ? 's' : ''} a lift that holds after Holm's correction, led by ${sig[0].name} (${pp(sig[0].d)}, ${confW} CI ${pp(sig[0].lo)} to ${pp(sig[0].hi)}).`
    : `No question shows a lift that holds after Holm's correction; the largest is ${best.name} at ${pp(best.d)} (${confW} CI ${pp(best.lo)} to ${pp(best.hi)}).`;
  const meaning = r.rows.map((x) => `${x.name}: ${pctS(x.p1, 1)} exposed vs ${pctS(x.p0, 1)} control, ${pp(x.d)} (relative ${x.rel >= 0 ? '+' : '−'}${fmt(Math.abs(x.rel) * 100, 1)}%), Holm-adjusted ${pText(x.pHolm)}${x.sig ? '' : ', not significant'}.`);
  if (Number.isFinite(r.reach) && sig.length) meaning.push(`Across a reach of ${fmt(r.reach)} people, the ${sig[0].name.toLowerCase()} lift is about ${fmt(sig[0].people)} more people (${fmt(Math.max(0, sig[0].peopleLo))} to ${fmt(sig[0].peopleHi)}).`);
  const minN = sig.length ? Math.min(sig[0].n1, sig[0].n0) : 0;
  let confidence, confidenceNote;
  if (!sig.length) { confidence = 'low'; confidenceNote = 'No lift survives the correction for testing several questions.'; }
  else if (minN >= 300) { confidence = 'high'; confidenceNote = `${sig[0].name} is significant after Holm's correction with ${fmt(minN)} or more respondents per group.`; }
  else { confidence = 'medium'; confidenceNote = `${sig[0].name} is significant after correction, but a group has only ${fmt(minN)} respondents.`; }
  confidenceNote += ' Rule: strong = significant after Holm with at least 300 per group (this tool\'s convention for stable survey percentages); some = significant with fewer; weak = nothing significant after correction.';
  const caveats = [
    'The control group must match the exposed group on everything but the ad (ideally randomised holdouts); otherwise the lift mixes in who was targeted.',
    'Lower-funnel questions (consideration, intent) usually move less than recall; a small lift there can still matter commercially.',
    'Survey answers are stated, not behaviour: confirm with a conversion or search-volume holdout if you can.',
  ];
  const next = [
    'Plan the next study\'s sample with the planner below so the smallest lift you care about is detectable after correction.',
    'For a single yes/no comparison with more detail, use [compare two rates](/calculators/compare-rates).',
    'Run the survey questions through [multiple comparisons](/calculators/multi-compare) if you compare more than two groups.',
  ];
  const report = `Brand lift (exposed n = ${fmt(r.rows[0].n1)}, control n = ${fmt(r.rows[0].n0)}): ${r.rows.map((x) => `${x.name} ${pctS(x.p1, 1)} vs ${pctS(x.p0, 1)}, lift ${pp(x.d)} (${confW} CI ${pp(x.lo)} to ${pp(x.hi)}; Holm ${pText(x.pHolm)})`).join('; ')}. Intervals are Newcombe hybrid score intervals.`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}
export { sum };
