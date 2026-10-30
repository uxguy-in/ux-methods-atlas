// Tolerance intervals, distribution-free percentile intervals, and quick rules for zero events. Pure functions.
// Validated in server/scripts/check-cogia.js against the toleranceinterval package (Howe, Guenther, exact and
// nonparametric), scipy and statsmodels (cogia-reference.py) and published tables (Wilks 1941; Odeh and Owen 1980).
import { normInv, chi2Inv, chi2Cdf, nctInv, normCdf, integrate, binomCdf, betaInv, ibeta, mean, sd, fmt, sig, pct } from './cogia-core.js';

// Example: seconds to complete "change delivery address" for 32 participants (a skewed, task-time-like sample).
export const EXAMPLE = '48.0, 53.8, 43.3, 34.2, 40.4, 32.9, 49.1, 79.9, 39.8, 37.9, 57.8, 55.0, 50.0, 33.7, 47.5, 62.5,\n28.8, 40.3, 23.3, 29.4, 23.8, 43.9, 29.7, 53.2, 50.9, 44.7, 18.4, 39.1, 47.1, 50.1, 96.4, 71.2';

export function parseValues(text) {
  const toks = String(text ?? '').split(/[\s,;]+/).filter((t) => t !== '');
  const values = [], bad = [];
  for (const t of toks) { const v = Number(t); if (Number.isFinite(v)) values.push(v); else bad.push(t); }
  return { values, bad };
}

// ── Normal-theory tolerance factors ──
// Howe (1969): k = z_(1+p)/2 · √(1 + 1/n) · √(ν / χ²_(1−γ, ν)), ν = n − 1.
export function kHowe(n, p, g) {
  const nu = n - 1;
  return normInv((1 + p) / 2) * Math.sqrt(1 + 1 / n) * Math.sqrt(nu / chi2Inv(1 - g, nu));
}
// Guenther (1977): Howe's k times √(1 + (n − 3 − χ²_(1−γ, ν)) / (2(n + 1)²)).
export function kGuenther(n, p, g) {
  const nu = n - 1, c = chi2Inv(1 - g, nu);
  return kHowe(n, p, g) * Math.sqrt(1 + (n - 3 - c) / (2 * (n + 1) ** 2));
}
// r(z): the half-width (in σ units) of an interval centred at z that holds proportion p of N(0, 1).
function rOf(z, p) {
  let r = normInv((1 + p) / 2) + Math.abs(z);
  for (let i = 0; i < 60; i++) {
    const f = normCdf(z + r) - normCdf(z - r) - p;
    const d = Math.exp(-0.5 * (z + r) ** 2) / Math.sqrt(2 * Math.PI) + Math.exp(-0.5 * (z - r) ** 2) / Math.sqrt(2 * Math.PI);
    const dr = f / d; r -= dr;
    if (Math.abs(dr) < 1e-14) break;
  }
  return r;
}
// Exact two-sided confidence of x̄ ± k·s (Odeh and Owen 1980): γ(k) = √(2n/π) ∫₀^∞ P(χ²_ν > ν r(z)²/k²) e^(−n z²/2) dz.
export function confTwoSided(k, n, p) {
  const nu = n - 1, top = 9 / Math.sqrt(n);
  return Math.sqrt((2 * n) / Math.PI) * integrate((z) => (1 - chi2Cdf((nu * rOf(z, p) ** 2) / (k * k), nu)) * Math.exp(-0.5 * n * z * z), 0, top, 24);
}
export function kExact(n, p, g) {
  let lo = normInv((1 + p) / 2) * 0.5, hi = kHowe(n, p, g) * 1.5 + 1;
  while (confTwoSided(hi, n, p) < g) hi *= 1.5;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (confTwoSided(m, n, p) < g) lo = m; else hi = m; if (hi - lo < 1e-11) break; }
  return (lo + hi) / 2;
}
// One-sided: k = t'_γ(ν, z_p √n) / √n, the noncentral t quantile (exact).
export const kOneSided = (n, p, g) => nctInv(g, n - 1, normInv(p) * Math.sqrt(n)) / Math.sqrt(n);
export function kFactor(n, p, g, side, method) {
  if (side !== 'two') return kOneSided(n, p, g);
  return method === 'guenther' ? kGuenther(n, p, g) : method === 'exact' ? kExact(n, p, g) : kHowe(n, p, g);
}

// ── Distribution-free (order-statistic) tolerance limits ──
// Two-sided (X(r), X(n−r+1)) holds at least p of the population with confidence 1 − I_p(n − 2r + 1, 2r)
// (the coverage of the interval between order statistics r and n − r + 1 is Beta(n − 2r + 1, 2r); Wilks 1941).
export const npTwoConf = (n, r, p) => 1 - ibeta(p, n - 2 * r + 1, 2 * r);
// One-sided upper limit X(j): P(X(j) ≥ p-quantile) = P(Bin(n, p) ≤ j − 1).
export const npOneConf = (n, j, p) => binomCdf(j - 1, n, p);
// Smallest n for which the extremes (min and max, or the max alone) give the requested coverage and confidence.
export function npMinN(p, g, side) {
  for (let n = 2; n < 1e6; n++) if ((side === 'two' ? npTwoConf(n, 1, p) : npOneConf(n, n, p)) >= g) return n;
  return NaN;
}
export function npTolerance(sorted, p, g, side) {
  const n = sorted.length;
  if (side === 'two') {
    let best = 0;
    for (let r = 1; 2 * r < n; r++) { if (npTwoConf(n, r, p) >= g) best = r; else break; }
    if (!best) return { ok: false, nNeeded: npMinN(p, g, 'two') };
    return { ok: true, r: best, s: best, lo: sorted[best - 1], hi: sorted[n - best], conf: npTwoConf(n, best, p) };
  }
  let j = 0;
  for (let k = 1; k <= n; k++) if (npOneConf(n, k, p) >= g) { j = k; break; }
  if (!j) return { ok: false, nNeeded: npMinN(p, g, 'one') };
  // Upper: X(j); lower: X(n + 1 − j), by symmetry.
  return side === 'upper'
    ? { ok: true, j, lo: -Infinity, hi: sorted[j - 1], conf: npOneConf(n, j, p) }
    : { ok: true, j: n + 1 - j, lo: sorted[n - j], hi: Infinity, conf: npOneConf(n, j, p) };
}

// ── Distribution-free confidence interval for the q-th percentile (Hahn and Meeker 1991, §5.2) ──
// Ranks l < u with P(X(l) ≤ ξ_q ≤ X(u)) = F(u − 1) − F(l − 1) ≥ conf, F the Bin(n, q) cdf: l is the largest rank with
// F(l − 1) ≤ α/2 and u the smallest with F(u − 1) ≥ 1 − α/2.
export function percentileCI(sorted, q, conf = 0.95) {
  const n = sorted.length, a = (1 - conf) / 2;
  let l = 0, u = 0;
  for (let k = 1; k <= n; k++) if (binomCdf(k - 1, n, q) <= a) l = k;
  for (let k = n; k >= 1; k--) if (binomCdf(k - 1, n, q) >= 1 - a) u = k;
  const est = (() => { const h = (n - 1) * q, lo = Math.floor(h); return sorted[lo] + (h - lo) * ((sorted[Math.ceil(h)] ?? sorted[lo]) - sorted[lo]); })();
  if (!l || !u) {
    let need = n; while (need < 1e5) { need++; let L = 0, U = 0; for (let k = 1; k <= need; k++) if (binomCdf(k - 1, need, q) <= a) L = k; for (let k = need; k >= 1; k--) if (binomCdf(k - 1, need, q) >= 1 - a) U = k; if (L && U) break; }
    return { ok: false, est, nNeeded: need };
  }
  return { ok: true, est, l, u, lo: sorted[l - 1], hi: sorted[u - 1], cover: binomCdf(u - 1, n, q) - binomCdf(l - 1, n, q) };
}

// ── Zero (or few) events and counts ──
// Clopper-Pearson exact limits; with x = 0 the one-sided upper limit is 1 − α^(1/n), which the rule of three (3/n)
// approximates for 95% (Hanley and Lippman-Hand 1983).
export function zeroEvents(x, n, conf = 0.95) {
  const a = 1 - conf;
  const upper1 = x >= n ? 1 : betaInv(1 - a, x + 1, n - x);
  const lo2 = x <= 0 ? 0 : betaInv(a / 2, x, n - x + 1), hi2 = x >= n ? 1 : betaInv(1 - a / 2, x + 1, n - x);
  const ruleN = -Math.log(a); // 2.996 for 95%: the "rule of three" numerator
  return { x, n, conf, rate: x / n, upper1, lo2, hi2, ruleOf3: ruleN / n, rule3: 3 / n, ruleN };
}
// Trials needed to show the rate is below `target` with `conf` confidence if no events occur: (1 − target)^n ≤ 1 − conf.
export const nForZero = (target, conf = 0.95) => Math.ceil(Math.log(1 - conf) / Math.log(1 - target));
// A count c: square-root rule c ± 2√c, and the exact (Garwood) Poisson interval from chi-square quantiles.
export function countRule(c, conf = 0.95) {
  const a = 1 - conf;
  return { c, lo: Math.max(0, c - 2 * Math.sqrt(c)), hi: c + 2 * Math.sqrt(c), exLo: c === 0 ? 0 : chi2Inv(a / 2, 2 * c) / 2, exHi: chi2Inv(1 - a / 2, 2 * c + 2) / 2 };
}

// ── The whole analysis for one sample ──
export function analyse(values, { p = 0.9, g = 0.95, side = 'two', method = 'howe', log = false, q = 0.9, qconf = 0.95 } = {}) {
  const n = values.length;
  if (n < 3) return { error: 'Enter at least 3 values.' };
  if (log && values.some((v) => !(v > 0))) return { error: 'The log scale needs every value above 0. Switch it off or remove zero and negative values.' };
  const ys = log ? values.map(Math.log) : values;
  const m = mean(ys), s = sd(ys);
  const k = kFactor(n, p, g, side, method);
  const back = (v) => (log ? Math.exp(v) : v);
  const nlo = side === 'upper' ? -Infinity : back(m - k * s), nhi = side === 'lower' ? Infinity : back(m + k * s);
  const sorted = [...values].sort((a, b) => a - b);
  const np = npTolerance(sorted, p, g, side);
  const pc = percentileCI(sorted, q, qconf);
  // Sample skewness (adjusted Fisher-Pearson) on the scale used, to warn when the normal interval is doubtful.
  const skew = (() => { const d = ys.map((v) => v - m), m2 = mean(d.map((v) => v * v)), m3 = mean(d.map((v) => v ** 3)); return (m3 / m2 ** 1.5) * Math.sqrt(n * (n - 1)) / (n - 2); })();
  const zp = normInv(side === 'two' ? (1 + p) / 2 : p);
  return { n, mean: m, sd: s, k, lo: nlo, hi: nhi, log, sorted, np, pc, skew, zp, p, g, side, method, q, qconf, min: sorted[0], max: sorted[n - 1], gm: back(m) };
}

const sideWords = (side, p) => (side === 'two' ? `the middle ${pct(p)}` : side === 'upper' ? `at least ${pct(p)} of values below the upper limit` : `at least ${pct(p)} of values above the lower limit`);
const range = (lo, hi, d = 1) => (Number.isFinite(lo) && Number.isFinite(hi) ? `${sig(lo, 4)} to ${sig(hi, 4)}` : Number.isFinite(hi) ? `up to ${sig(hi, 4)}` : `from ${sig(lo, 4)}`) + (d ? '' : '');

// Plain-language summary of a tolerance analysis.
// Confidence rule: high when n ≥ 30, the chosen normal model looks reasonable (|skewness| < 0.5 on the scale used) and
// the distribution-free interval exists and roughly agrees (its limits within 15% of the normal ones); medium when
// n ≥ 15 and |skewness| < 1; low otherwise (small samples make tolerance limits wide and sensitive to the model).
export function toleranceSummary(r, unit = '') {
  const u = unit ? ` ${unit}` : '';
  const what = sideWords(r.side, r.p);
  const normal = range(r.lo, r.hi);
  const npTxt = r.np.ok ? range(r.np.lo, r.np.hi) : null;
  const agree = r.np.ok && [[r.lo, r.np.lo], [r.hi, r.np.hi]].every(([a, b]) => !Number.isFinite(a) || Math.abs(a - b) <= 0.15 * Math.max(Math.abs(a), Math.abs(b), 1e-9));
  const conf = r.n >= 30 && Math.abs(r.skew) < 0.5 && agree ? 'high' : r.n >= 15 && Math.abs(r.skew) < 1 ? 'medium' : 'low';
  const meaning = [
    `With ${pct(r.g)} confidence, ${what} of individual users fall within ${normal}${u} (normal${r.log ? ' model on the log scale' : ' model'}, k = ${fmt(r.k, 3)}).`,
    r.np.ok ? `Without assuming any distribution, the order statistics give ${npTxt}${u} (achieved confidence ${pct(r.np.conf, 1)}).` : `There are too few values for a distribution-free limit at this coverage and confidence: it needs at least ${r.np.nNeeded} values.`,
    `A tolerance interval is about individual users, not the average: it is much wider than a confidence interval for the mean, and it stays wide as the sample grows (it approaches ±${fmt(r.zp, 2)} SD).`,
    r.pc.ok ? `The ${pct(r.q)} percentile is ${sig(r.pc.est, 4)}${u}; a ${pct(r.qconf)} distribution-free confidence interval for it runs from ${sig(r.pc.lo, 4)} to ${sig(r.pc.hi, 4)}${u} (ranks ${r.pc.l} and ${r.pc.u}).` : `The ${pct(r.q)} percentile needs at least ${r.pc.nNeeded} values for a distribution-free ${pct(r.qconf)} interval.`,
  ];
  return {
    headline: `With ${pct(r.g)} confidence, ${what} of individuals lie ${Number.isFinite(r.lo) && Number.isFinite(r.hi) ? 'between' : 'within'} ${normal}${u} (n = ${r.n}).`,
    meaning,
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong needs at least 30 values, a roughly symmetric sample on the scale used (|skewness| below 0.5; here ${fmt(r.skew, 2)}) and a distribution-free interval that agrees with the normal one within 15%; some evidence needs at least 15 values and |skewness| below 1. Here n = ${r.n}.`,
    caveats: [
      `"${pct(r.g)} confidence" describes the method: if you repeated the study many times, ${pct(r.g)} of intervals built this way would hold at least ${pct(r.p)} of the population. It is not the chance that this particular interval does.`,
      Math.abs(r.skew) >= 0.5 && !r.log ? 'The data are skewed, so the normal limits are doubtful. Task times are usually right-skewed: try the log scale, or rely on the distribution-free interval.' : 'Normal limits depend heavily on the tails of the distribution; check the distribution-free interval before quoting them.',
    ],
    next: [
      'Use the upper limit as a design or service-level target (for example "nearly all users finish within X seconds"), not the mean.',
      r.np.ok ? 'Report both the normal and the distribution-free limits if they differ.' : `Collect at least ${r.np.nNeeded} values for a distribution-free limit, or lower the coverage.`,
      'To compare designs on their averages, use [Compare two means](/calculators/compare-means) instead.',
    ],
    report: `Tolerance interval (n = ${r.n}, ${pct(r.p)} coverage, ${pct(r.g)} confidence, ${r.side === 'two' ? 'two-sided' : `one-sided ${r.side}`}): ${normal}${u} from a normal model${r.log ? ' on log values' : ''} (k = ${fmt(r.k, 3)})${r.np.ok ? `; distribution-free ${npTxt}${u}` : ''}.`,
  };
}

// Plain-language summary of the zero-events panel.
// Confidence rule: high when n ≥ 300 (upper limit at most 1%), medium when n ≥ 60 (at most 5%), low otherwise.
export function zeroSummary(z) {
  const conf = z.n >= 300 ? 'high' : z.n >= 60 ? 'medium' : 'low';
  const none = z.x === 0;
  return {
    headline: none ? `0 of ${z.n}: the true rate could still be as high as ${pct(z.upper1, 2)} (${pct(z.conf)} one-sided upper limit).` : `${z.x} of ${z.n}: the rate is ${pct(z.rate, 1)}, with a ${pct(z.conf)} interval of ${pct(z.lo2, 1)} to ${pct(z.hi2, 1)}.`,
    meaning: [
      none ? `Seeing no events does not mean the rate is zero. The exact one-sided ${pct(z.conf)} upper limit is 1 − ${fmt(1 - z.conf, 2)}^(1/${z.n}) = ${pct(z.upper1, 2)}; the rule of three gives 3/${z.n} = ${pct(z.rule3, 2)}.` : `The exact (Clopper-Pearson) one-sided ${pct(z.conf)} upper limit is ${pct(z.upper1, 2)}.`,
      `To show a rate below ${pct(0.01)} with no events at ${pct(z.conf)} confidence you would need ${nForZero(0.01, z.conf)} trials; below 5% needs ${nForZero(0.05, z.conf)}.`,
    ],
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong when there are at least 300 trials (the upper limit is then near 1% or less), some evidence from 60 trials (near 5%), weak below that. Here n = ${z.n}.`,
    caveats: ['The limit assumes independent trials with the same chance of the event; repeated attempts by the same person are not independent.', `"${pct(z.conf)} confidence" describes how often limits built this way cover the true rate, not the chance that this limit does.`],
    next: ['Use the upper limit, not 0%, when you report a problem that did not appear in testing.', 'Plan the number of trials from the rate you need to rule out.'],
    report: `${z.x} events in ${z.n} trials; exact one-sided ${pct(z.conf)} upper limit ${pct(z.upper1, 2)} (rule of three: ${pct(z.rule3, 2)}).`,
  };
}
