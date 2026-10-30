// Concentration of engagement: Lorenz curve and Gini, top shares and the Pareto 80/20 check, and a power-law fit by the
// method of Clauset, Shalizi and Newman (2009): xmin by minimum Kolmogorov-Smirnov distance, α by maximum likelihood,
// a likelihood-ratio comparison with an exponential tail and a bootstrap goodness-of-fit test (run in a Web Worker).
// Pure functions; checked by server/scripts/check-signals.js against the powerlaw package.
import { gini, sum, rng, normSf, toNum, parseLines, fmt, pctText, intText, sig, quantileSorted } from './signals-core.js';

// Values: one per line, or "label, value" (the last number on each line is used).
export function parseValues(text) {
  const vals = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    const nums = c.map(toNum).filter(Number.isFinite);
    if (!nums.length) { if (i > 0) bad.push(i + 1); return; }
    const v = nums[nums.length - 1];
    if (v < 0) bad.push(i + 1); else vals.push(v);
  });
  return { vals, bad };
}

// ── Lorenz curve, Gini and top shares ──
export function lorenz(values) {
  const s = [...values].sort((a, b) => a - b), n = s.length, tot = sum(s);
  const pts = [[0, 0]]; let c = 0;
  const step = Math.max(1, Math.floor(n / 400));
  for (let i = 0; i < n; i++) { c += s[i]; if ((i + 1) % step === 0 || i === n - 1) pts.push([(i + 1) / n, c / tot]); }
  return pts;
}
// Share of the total held by the top fraction f of units (ceil(f·n) largest values).
export function topShare(values, f) {
  const s = [...values].sort((a, b) => b - a), k = Math.max(1, Math.ceil(f * s.length));
  return sum(s.slice(0, k)) / sum(s);
}
// Smallest fraction of units (largest first) that together hold the share q of the total.
export function unitsForShare(values, q = 0.8) {
  const s = [...values].sort((a, b) => b - a), tot = sum(s); let c = 0;
  for (let i = 0; i < s.length; i++) { c += s[i]; if (c >= q * tot - 1e-12) return (i + 1) / s.length; }
  return 1;
}
export function concentration(values) {
  const n = values.length, G = gini(values);
  return {
    n, total: sum(values), gini: G, giniUnbiased: (G * n) / (n - 1), lorenz: lorenz(values),
    top1: topShare(values, 0.01), top10: topShare(values, 0.1), top20: topShare(values, 0.2), bottom50: 1 - topShare(values, 0.5),
    for80: unitsForShare(values, 0.8), zeros: values.filter((v) => v === 0).length,
  };
}
// Percentile bootstrap interval for the Gini (resampling units). Run in the worker for large B.
export function giniBoot(values, B = 2000, seed = 1, conf = 0.95) {
  const r = rng(seed), n = values.length, out = new Float64Array(B), x = new Float64Array(n);
  for (let b = 0; b < B; b++) { for (let i = 0; i < n; i++) x[i] = values[Math.floor(r() * n)]; out[b] = gini(x); }
  const s = Array.from(out).filter(Number.isFinite).sort((a, b) => a - b);
  const m = s.reduce((t, v) => t + v, 0) / s.length, se = Math.sqrt(s.reduce((t, v) => t + (v - m) ** 2, 0) / (s.length - 1));
  return { lo: quantileSorted(s, (1 - conf) / 2), hi: quantileSorted(s, 1 - (1 - conf) / 2), se, B };
}

// ── Hurwitz zeta ζ(s, q) = Σₖ (q + k)^(−s), by Euler-Maclaurin summation ──
const B2 = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510];
export function hurwitz(s, q) {
  const N = Math.max(0, 12 - Math.floor(q)); let acc = 0;
  for (let k = 0; k < N; k++) acc += (q + k) ** -s;
  const a = q + N;
  acc += a ** (1 - s) / (s - 1) + 0.5 * a ** -s;
  let fact = 1, poch = s, pw = a ** (-s - 1);
  for (let j = 1; j <= B2.length; j++) {
    fact *= (2 * j - 1) * (2 * j);
    const term = (B2[j - 1] / fact) * poch * pw;
    acc += term;
    if (Math.abs(term) < 1e-17 * acc) break;
    poch *= (s + 2 * j - 1) * (s + 2 * j); pw /= a * a;
  }
  return acc;
}
// Golden-section maximiser on [a, b].
function golden(f, a, b, tol = 1e-10) {
  const g = (Math.sqrt(5) - 1) / 2; let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) { if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); } }
  return (a + b) / 2;
}

// ── Power law with a fixed xmin. tail = sorted ascending values ≥ xmin. ──
// Continuous: α = 1 + n / Σ ln(x / xmin), F(x) = 1 − (x / xmin)^(1 − α), σα = (α − 1)/√n.
// Discrete: α maximises −n ln ζ(α, xmin) − α Σ ln x; P(X < x) = 1 − ζ(α, x) / ζ(α, xmin); σα from the curvature.
// D is the largest gap between the empirical share of the tail below x and the fitted P(X < x), over the distinct
// values x of the tail (the convention of the powerlaw package).
export function fitAt(tail, xmin, discrete) {
  const n = tail.length, L = tail.reduce((s, x) => s + Math.log(x), 0);
  let alpha, se;
  if (!discrete) {
    alpha = 1 + n / (L - n * Math.log(xmin));
    se = (alpha - 1) / Math.sqrt(n);
  } else {
    const ll = (a) => -n * Math.log(hurwitz(a, xmin)) - a * L;
    alpha = golden(ll, 1.0001, 8);
    const h = 1e-4, d2 = (Math.log(hurwitz(alpha + h, xmin)) - 2 * Math.log(hurwitz(alpha, xmin)) + Math.log(hurwitz(alpha - h, xmin))) / (h * h);
    se = 1 / Math.sqrt(n * d2);
  }
  const zmin = discrete ? hurwitz(alpha, xmin) : NaN;
  const cdf = (x) => (discrete ? 1 - hurwitz(alpha, x) / zmin : 1 - (x / xmin) ** (1 - alpha));
  let D = 0;
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && tail[j + 1] === tail[i]) j++; D = Math.max(D, Math.abs(i / n - cdf(tail[i]))); i = j + 1; }
  return { xmin, alpha, se, D, n };
}
// Full fit: every distinct value except the largest is tried as xmin; the one with the smallest D wins.
export function fitPowerLaw(values, discrete, { minTail = 2 } = {}) {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b);
  const uniq = [...new Set(s)];
  let best = null; const scan = [];
  for (let k = 0; k < uniq.length - 1; k++) {
    const xmin = uniq[k], start = s.findIndex((v) => v >= xmin), tail = s.slice(start);
    if (tail.length < minTail) break;
    const f = fitAt(tail, xmin, discrete);
    if (!Number.isFinite(f.D) || !Number.isFinite(f.alpha)) continue;
    scan.push([xmin, f.D, f.alpha]);
    if (!best || f.D < best.D) best = f;
  }
  if (!best) return null;
  return { ...best, ntail: best.n, ntotal: s.length, discrete, scan };
}
// Pointwise log-likelihoods of the tail under the fitted power law and an exponential tail, and Vuong's normalised
// likelihood-ratio test (CSN 2009 §5; as powerlaw's distribution_compare(..., normalized_ratio=True)).
export function compareExponential(values, fit) {
  const tail = values.filter((v) => v >= fit.xmin), n = tail.length, { xmin, alpha, discrete } = fit;
  const mean = tail.reduce((a, b) => a + b, 0) / n;
  let lam, lexp, lpl;
  if (discrete) {
    lam = Math.log(1 + 1 / (mean - xmin));
    const z = Math.log(hurwitz(alpha, xmin));
    lpl = tail.map((x) => -alpha * Math.log(x) - z);
    lexp = tail.map((x) => Math.log(1 - Math.exp(-lam)) - lam * (x - xmin));
  } else {
    lam = 1 / (mean - xmin);
    lpl = tail.map((x) => Math.log((alpha - 1) / xmin) - alpha * Math.log(x / xmin));
    lexp = tail.map((x) => Math.log(lam) - lam * (x - xmin));
  }
  const d = lpl.map((v, i) => v - lexp[i]), R = d.reduce((a, b) => a + b, 0), m = R / n;
  const sd = Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / n);
  const Rn = R / (sd * Math.sqrt(n));
  return { R, Rn, p: 2 * normSf(Math.abs(Rn)), lambda: lam, favours: R > 0 ? 'power law' : 'exponential' };
}
// Bootstrap goodness of fit (CSN 2009 §4.1): synthetic data sets of the same size take each value from the fitted power
// law above xmin with probability ntail / n, otherwise a random observed value below xmin; each is refitted with its own
// xmin. p = share of synthetic D at least as large as the observed D. Discrete draws use CSN's approximation
// x = ⌊(xmin − ½)(1 − u)^(−1/(α − 1)) + ½⌋.
export function gofBootstrap(values, fit, { B = 1000, seed = 1, onProgress } = {}) {
  const r = rng(seed), s = values.filter((v) => v > 0), below = s.filter((v) => v < fit.xmin), n = s.length, pt = fit.ntail / n;
  let ge = 0; const Ds = [];
  for (let b = 0; b < B; b++) {
    const x = new Array(n);
    for (let i = 0; i < n; i++) {
      if (r() < pt || !below.length) {
        const u = r();
        x[i] = fit.discrete ? Math.floor((fit.xmin - 0.5) * (1 - u) ** (-1 / (fit.alpha - 1)) + 0.5) : fit.xmin * (1 - u) ** (-1 / (fit.alpha - 1));
      } else x[i] = below[Math.floor(r() * below.length)];
    }
    const f = fitPowerLaw(x, fit.discrete);
    if (f) { Ds.push(f.D); if (f.D >= fit.D) ge++; }
    if (onProgress && (b + 1) % 25 === 0) onProgress((b + 1) / B);
  }
  return { p: ge / Ds.length, B: Ds.length, Ds };
}
// Empirical complementary CDF P(X ≥ x) at distinct positive values, for the log-log plot.
export function ccdf(values) {
  const s = values.filter((v) => v > 0).sort((a, b) => a - b), n = s.length, out = [];
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && s[j + 1] === s[i]) j++; out.push([s[i], (n - i) / n]); i = j + 1; }
  return out;
}

// Example: sessions per user in a month for 1,500 users: a body of light users and a power-law tail (α ≈ 2.4 above 6).
export function exampleValues(n = 1500, seed = 3) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    if (r() < 0.38) out.push(Math.floor((6 - 0.5) * (1 - r()) ** (-1 / 1.4) + 0.5));
    else out.push(1 + Math.floor(r() * r() * 5.99));
  }
  return out;
}
export const exampleText = () => ['# sessions per user, last 30 days', ...exampleValues()].join('\n');

// ── Reading your results ──
// Confidence rule for the concentration reading: "high" with at least 500 units, "medium" with at least 100, "low"
// below. For the power-law claim, "high" also needs at least 50 points in the tail and a bootstrap p > 0.1 with the
// exponential rejected (Vuong p < 0.1); with fewer than 50 tail points the fit is called weak (CSN 2009).
export function summary(c, pl, cmp, gof, ci) {
  const confidence = c.n >= 500 ? (pl && pl.ntail < 50 ? 'medium' : 'high') : c.n >= 100 ? 'medium' : 'low';
  const pareto = c.top20 >= 0.8;
  const level = c.gini >= 0.6 ? 'highly concentrated' : c.gini >= 0.4 ? 'moderately concentrated' : 'fairly evenly spread';
  const meaning = [
    `The top 20% of units hold ${pctText(c.top20, 0)} of the total, and ${pctText(c.for80, 0)} of units account for 80%. ${pareto ? 'That meets or beats the 80/20 rule of thumb.' : 'That is less extreme than the 80/20 rule of thumb, which is a rough heuristic (Juran\'s "vital few"), not a law.'}`,
    `The top 1% hold ${pctText(c.top1, 1)} and the bottom half hold ${pctText(c.bottom50, 1)}.`,
    `A Gini of 0 means every unit contributes the same; 1 means one unit contributes everything. ${fmt(c.gini, 2)} is ${level}.`,
  ];
  if (pl) {
    const plausible = gof ? gof.p > 0.1 : null;
    meaning.push(`Power-law fit: α = ${fmt(pl.alpha, 2)} (SE ${fmt(pl.se, 2)}) above xmin = ${sig(pl.xmin, 4)}, covering ${intText(pl.ntail)} of ${intText(pl.ntotal)} positive values (KS distance D = ${fmt(pl.D, 3)}). ${gof ? (plausible ? `The bootstrap p = ${fmt(gof.p, 2)} (over 0.1), so a power law is plausible for the tail.` : `The bootstrap p = ${fmt(gof.p, 2)} (0.1 or less), so a power law is ruled out for the tail (CSN 2009 use p ≤ 0.1).`) : 'Run the bootstrap to test whether the power law is plausible.'}`);
    if (cmp) meaning.push(`Against an exponential tail, the log-likelihood ratio is ${fmt(cmp.R, 1)} (normalised ${fmt(cmp.Rn, 2)}, p = ${fmt(cmp.p, 3)}): ${cmp.p < 0.1 ? `the data favour the ${cmp.favours}` : 'the test cannot tell them apart'}.`);
  }
  const plGood = pl && gof && gof.p > 0.1 && cmp && cmp.p < 0.1 && cmp.R > 0 && pl.ntail >= 50;
  return {
    headline: `Gini ${fmt(c.gini, 2)}${ci ? ` (95% CI ${fmt(ci.lo, 2)} to ${fmt(ci.hi, 2)})` : ''}: the top 20% of ${intText(c.n)} units hold ${pctText(c.top20, 0)} of the total.`,
    meaning: meaning.slice(0, 6),
    confidence: pl && !plGood && confidence === 'high' && gof ? 'medium' : confidence,
    confidenceNote: `Rule: strong with at least 500 units (and, for any power-law claim, at least 50 tail points, a bootstrap p above 0.1 and an exponential tail rejected); some evidence from 100 units; weak below. Here: ${intText(c.n)} units${pl ? `, ${intText(pl.ntail)} in the tail` : ''}.`,
    caveats: [
      'The Gini depends on who is counted: including inactive accounts (zeros) raises it sharply. Decide whether zeros belong before comparing Gini values.',
      'A straight line on a log-log plot is not evidence of a power law; only the bootstrap test and the comparison with alternatives are (Clauset, Shalizi and Newman 2009).',
    ],
    next: [
      'Profile the top 20% separately (what they do, where they come from) before designing for the average user.',
      'Track the Gini over time with the same population definition: a rising value means growth is coming from fewer, heavier users.',
    ],
    report: `Engagement was concentrated: across ${intText(c.n)} units the Gini was ${fmt(c.gini, 2)}${ci ? ` (95% bootstrap CI ${fmt(ci.lo, 2)} to ${fmt(ci.hi, 2)})` : ''}, and the top 20% held ${pctText(c.top20, 0)} of the total.${pl ? ` A power-law fit to the tail gave α = ${fmt(pl.alpha, 2)} above xmin = ${sig(pl.xmin, 4)}${gof ? ` (bootstrap p = ${fmt(gof.p, 2)})` : ''}.` : ''}`,
  };
}
