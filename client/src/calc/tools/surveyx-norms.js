// Norms and standard scores: z, T (McCall 1922), stanines, stens and percentile ranks (empirical mid-rank and normal),
// with intervals for percentile ranks. Pure functions shared by surveyx-Norms.jsx and check-surveyx.js.
import { normCdf, normInv, mean, sd, skewness, wilson, clamp, fmt, pct } from './surveyx-core.js';
import { lgamma } from '../stats.js';

export const stanine = (z) => clamp(Math.floor(2 * z + 5.5), 1, 9); // bands 0.5 SD wide, 5 = −0.25 to +0.25 SD
export const sten = (z) => clamp(Math.floor(2 * z + 6), 1, 10); // bands 0.5 SD wide, 5 and 6 either side of the mean
export const STANINE_PCT = [4, 7, 12, 17, 20, 17, 12, 7, 4];

// Non-central t cdf by integrating Φ(t·s − δ) over the distribution of s = √(V/ν), V ~ χ²(ν) (Simpson's rule).
export function nctCdf(t, df, delta) {
  const sig = 1 / Math.sqrt(2 * df), lo = Math.max(0, 1 - 12 * sig), hi = 1 + 12 * sig + (df < 30 ? 4 : 0), N = 4000, h = (hi - lo) / N;
  const lc = Math.log(2) + Math.log(df) - (df / 2) * Math.log(2) - lgamma(df / 2);
  const f = (s) => { if (s <= 0) return 0; const v = df * s * s; return normCdf(t * s - delta) * Math.exp(lc + Math.log(s) + (df / 2 - 1) * Math.log(v) - v / 2); };
  let acc = f(lo) + f(hi);
  for (let i = 1; i < N; i++) acc += (i % 2 ? 4 : 2) * f(lo + i * h);
  return Math.min(1, Math.max(0, (acc * h) / 3));
}
// Crawford and Garthwaite (2002): interval for the percentile of a score x against a normative sample of size n with
// mean M and SD S. z√n follows a non-central t on n − 1 df with non-centrality θ√n, where θ is the true z.
export function percentileCI(z, n, conf = 0.95) {
  if (!(n >= 3)) return { lo: NaN, hi: NaN };
  const df = n - 1, obs = z * Math.sqrt(n), a = (1 - conf) / 2;
  const solve = (target) => {
    let l = obs - 6, u = obs + 6;
    for (let i = 0; i < 60 && nctCdf(obs, df, l) < target; i++) l -= 6 + Math.abs(l) * 0.5;
    for (let i = 0; i < 60 && nctCdf(obs, df, u) > target; i++) u += 6 + Math.abs(u) * 0.5;
    for (let i = 0; i < 70; i++) { const m = (l + u) / 2; if (nctCdf(obs, df, m) > target) l = m; else u = m; }
    return (l + u) / 2;
  };
  const dL = solve(1 - a), dU = solve(a);
  return { lo: normCdf(dL / Math.sqrt(n)), hi: normCdf(dU / Math.sqrt(n)), dL, dU };
}

export function reference({ mode = 'sample', sample = [], M, SD, n }) {
  if (mode === 'sample') {
    const xs = sample.filter(Number.isFinite);
    if (xs.length < 3) return { error: 'Paste at least three reference scores (ideally hundreds).' };
    const s = [...xs].sort((a, b) => a - b);
    return { mode, xs: s, n: s.length, M: mean(s), SD: sd(s), skew: skewness(s), min: s[0], max: s[s.length - 1] };
  }
  if (!Number.isFinite(M) || !(SD > 0)) return { error: 'Enter the norm group mean and a positive standard deviation.' };
  return { mode, xs: null, n: Number.isFinite(n) && n >= 3 ? Math.round(n) : NaN, M, SD, skew: NaN };
}
// Empirical percentile rank with the mid-rank convention: (number below + half the number equal) / n.
export function empiricalPR(xs, x) {
  let below = 0, eq = 0; for (const v of xs) { if (v < x) below++; else if (v === x) eq++; }
  return { below, eq, count: below + eq / 2, pr: (below + eq / 2) / xs.length };
}
export function convert(ref, x, conf = 0.95) {
  const z = (x - ref.M) / ref.SD;
  const out = { x, z, T: 50 + 10 * z, stanine: stanine(z), sten: sten(z), prNormal: normCdf(z) };
  if (Number.isFinite(ref.n)) { const c = percentileCI(z, ref.n, conf); out.prNormalLo = c.lo; out.prNormalHi = c.hi; }
  if (ref.xs) {
    const e = empiricalPR(ref.xs, x), w = wilson(e.count, ref.n, conf);
    // Normalised (area-transformed) scores: the normal deviate of the empirical percentile, kept inside (0.5/n, 1 − 0.5/n).
    const pc = clamp(e.pr, 0.5 / ref.n, 1 - 0.5 / ref.n), zn = normInv(pc);
    Object.assign(out, { prEmp: e.pr, prEmpLo: w.lo, prEmpHi: w.hi, below: e.below, eq: e.eq, zNorm: zn, TNorm: 50 + 10 * zn, stanineNorm: stanine(zn), stenNorm: sten(zn), outside: x < ref.min || x > ref.max });
  }
  return out;
}
// Norm table: one row per distinct score in the reference sample.
export function normTable(ref) {
  if (!ref.xs) return [];
  const vals = [...new Set(ref.xs)];
  let cum = 0;
  return vals.map((v) => { const f = ref.xs.filter((x) => x === v).length; const c = convert(ref, v); cum += f; return { ...c, f, cum }; });
}
export const tableCsv = (rows) => [['score', 'frequency', 'cumulative', 'percentile_rank_empirical', 'z', 'T', 'stanine', 'sten', 'normalised_z', 'normalised_T', 'normalised_stanine', 'percentile_normal'],
  ...rows.map((r) => [r.x, r.f, r.cum, (r.prEmp * 100).toFixed(1), r.z.toFixed(3), r.T.toFixed(1), r.stanine, r.sten, r.zNorm.toFixed(3), r.TNorm.toFixed(1), r.stanineNorm, (r.prNormal * 100).toFixed(1)])];

// ── "Reading your results" ──
// Confidence rule: high when the norm group has at least 300 people and (for a sample) |skew| < 0.5, so normal and
// empirical percentiles agree; medium with at least 100 people; low otherwise or when the norm group size is unknown.
export function normsSummary(ref, rows, { label = 'score' } = {}) {
  const n = ref.n, skewOk = !Number.isFinite(ref.skew) || Math.abs(ref.skew) < 0.5;
  const confidence = n >= 300 && skewOk ? 'high' : n >= 100 ? 'medium' : 'low';
  const r = rows[0];
  const prTxt = (x) => (x.prEmp !== undefined ? `${ordinal(x.prEmp * 100)} percentile (empirical; ${ordinal(x.prNormal * 100)} if scores were normal)` : `${ordinal(x.prNormal * 100)} percentile (assuming normal scores)`);
  const ciTxt = (x) => (x.prEmp !== undefined ? `95% CI ${ordinal(x.prEmpLo * 100)} to ${ordinal(x.prEmpHi * 100)}` : Number.isFinite(x.prNormalLo) ? `95% CI ${ordinal(x.prNormalLo * 100)} to ${ordinal(x.prNormalHi * 100)}` : 'no interval without the norm group size');
  const meaning = rows.slice(0, 4).map((x) => `A ${label} of ${fmt(x.x, 2)} is z = ${signed2(x.z)}, T = ${fmt(x.T, 1)}, stanine ${x.stanine}, sten ${x.sten}: the ${prTxt(x)}, ${ciTxt(x)}.`);
  if (Number.isFinite(ref.skew) && !skewOk) meaning.push(`The norm group is ${ref.skew > 0 ? 'right' : 'left'}-skewed (skewness ${fmt(ref.skew, 2)}), so normal-curve percentiles are off; use the empirical percentiles or the normalised T scores.`);
  if (rows.some((x) => x.outside)) meaning.push('At least one score lies outside the range of the norm group; its percentile is an extrapolation.');
  return {
    headline: `A ${label} of ${fmt(r.x, 2)} sits at the ${r.prEmp !== undefined ? ordinal(r.prEmp * 100) : ordinal(r.prNormal * 100)} percentile of the norm group (T = ${fmt(r.prEmp !== undefined && !skewOk ? r.TNorm : r.T, 1)}).`,
    meaning,
    confidence,
    confidenceNote: `Rule: high with a norm group of at least 300 and (for a pasted sample) skewness between −0.5 and 0.5; medium with at least 100; low otherwise or if the size is unknown (here ${Number.isFinite(n) ? n : 'unknown'}${Number.isFinite(ref.skew) ? `, skewness ${fmt(ref.skew, 2)}` : ''}). Empirical intervals are Wilson intervals on the mid-rank proportion; normal intervals follow Crawford and Garthwaite (2002), allowing for error in the norm mean and SD.`,
    caveats: [
      'Norms describe how a reference group scored, not what is good. A product at the 70th percentile of weak competitors can still be poor.',
      'Norms are only as good as the norm group: use one that matches your users, mode and version of the questionnaire, and say when and how it was collected.',
    ],
    next: [
      'Publish a norm table (download below) with the norm group described, so others convert scores the same way.',
      'For SUS, UMUX-Lite and other standard questionnaires, use their published norms in the [questionnaires](/calculators/questionnaires) tool.',
    ],
    report: `Against a norm group of ${Number.isFinite(n) ? `n = ${n}` : 'unknown size'} (mean ${fmt(ref.M, 2)}, SD ${fmt(ref.SD, 2)}), a ${label} of ${fmt(r.x, 2)} corresponds to z = ${signed2(r.z)}, T = ${fmt(r.T, 1)}, stanine ${r.stanine} and the ${r.prEmp !== undefined ? ordinal(r.prEmp * 100) : ordinal(r.prNormal * 100)} percentile (${ciTxt(r)}).`,
  };
}
const signed2 = (z) => `${z < 0 ? '−' : ''}${fmt(Math.abs(z), 2)}`;
export function ordinal(p) {
  const v = Math.round(p);
  if (v < 1) return 'below 1st'; if (v > 99) return 'above 99th';
  const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] || 'th';
  return `${v}${s}`;
}
export { pct };
