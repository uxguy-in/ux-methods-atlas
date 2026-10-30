// Bootstrap confidence intervals (percentile and BCa) and permutation tests for a chosen statistic. The BCa interval
// and the permutation p-value follow scipy.stats.bootstrap and scipy.stats.permutation_test exactly, so the check
// script can replay the same resamples in numpy. Large B runs in the Web Worker.
import { rng, mean, median, pearson, sorted, quantileSorted, normInv, normCdf, f, pText, lgamma } from './statsbench-core.js';

// kind: 'one' (one sample), 'two' (two independent samples, A − B), 'paired' (x, y pairs for a correlation).
export const STATS = {
  mean: { kind: 'one', name: 'Mean', fn: (a) => mean(a) },
  median: { kind: 'one', name: 'Median', fn: (a) => median(a) },
  prop: { kind: 'one', name: 'Proportion (0/1 data)', fn: (a) => mean(a) },
  diffmean: { kind: 'two', name: 'Difference in means (A − B)', fn: (a, b) => mean(a) - mean(b) },
  diffmedian: { kind: 'two', name: 'Difference in medians (A − B)', fn: (a, b) => median(a) - median(b) },
  corr: { kind: 'paired', name: 'Correlation (Pearson r)', fn: (x, y) => pearson(x, y) },
};
export const statOf = (key, data) => (STATS[key].kind === 'one' ? STATS[key].fn(data[0]) : STATS[key].fn(data[0], data[1]));

// Bootstrap replicates. Each replicate draws indices with mulberry32(seed) in this order: sample A (n_A draws), then
// sample B (n_B draws) for two samples; one set of n indices shared by x and y for pairs.
export function bootstrap(key, data, B = 9999, seed = 1, onProgress) {
  const r = rng(seed), st = STATS[key], out = new Float64Array(B);
  const draw = (arr, buf) => { for (let i = 0; i < arr.length; i++) buf[i] = arr[Math.floor(r() * arr.length)]; return buf; };
  const bufA = new Float64Array(data[0].length), bufB = data[1] ? new Float64Array(data[1].length) : null;
  for (let b = 0; b < B; b++) {
    if (st.kind === 'one') out[b] = st.fn(draw(data[0], bufA));
    else if (st.kind === 'two') out[b] = st.fn(draw(data[0], bufA), draw(data[1], bufB));
    else {
      const n = data[0].length;
      for (let i = 0; i < n; i++) { const k = Math.floor(r() * n); bufA[i] = data[0][k]; bufB[i] = data[1][k]; }
      out[b] = st.fn(bufA, bufB);
    }
    if (onProgress && b % 1000 === 999) onProgress((b + 1) / B);
  }
  return out;
}

// Jackknife acceleration as scipy: leave one out of each sample in turn (keeping the other sample whole); for a
// paired statistic leave out one pair. a = Σ_j Σ_i U³/n_j³ / (6 (Σ_j Σ_i U²/n_j²)^{3/2}), U = (n_j − 1)(θ̄_j − θ_(i)).
export function acceleration(key, data) {
  const st = STATS[key], groups = st.kind === 'two' ? [0, 1] : [0];
  let num = 0, den = 0;
  for (const j of groups) {
    const n = data[j].length, th = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const drop = (arr) => arr.filter((_, k) => k !== i);
      if (st.kind === 'one') th[i] = st.fn(drop(data[0]));
      else if (st.kind === 'two') th[i] = j === 0 ? st.fn(drop(data[0]), data[1]) : st.fn(data[0], drop(data[1]));
      else th[i] = st.fn(drop(data[0]), drop(data[1]));
    }
    const tm = mean(th); let s2 = 0, s3 = 0;
    for (const t of th) { const u = (n - 1) * (tm - t); s2 += u * u; s3 += u * u * u; }
    num += s3 / n ** 3; den += s2 / n ** 2;
  }
  return den > 0 ? num / (6 * den ** 1.5) : 0;
}

// Percentile and BCa intervals from bootstrap replicates (scipy.stats.bootstrap definitions).
export function bootIntervals(key, data, reps, conf = 0.95) {
  const est = statOf(key, data), s = sorted(reps), B = s.length, alpha = (1 - conf) / 2;
  const pct = [quantileSorted(s, alpha), quantileSorted(s, 1 - alpha)];
  let below = 0, atOrBelow = 0; for (const v of s) { if (v < est) below++; if (v <= est) atOrBelow++; }
  const z0 = normInv((below + atOrBelow) / (2 * B));
  const a = acceleration(key, data);
  const adj = (z) => normCdf(z0 + (z0 + z) / (1 - a * (z0 + z)));
  const q1 = adj(normInv(alpha)), q2 = adj(normInv(1 - alpha));
  const bca = Number.isFinite(z0) ? [quantileSorted(s, q1), quantileSorted(s, q2)] : [NaN, NaN];
  const m = mean(s), se = Math.sqrt(s.reduce((acc, v) => acc + (v - m) ** 2, 0) / (B - 1));
  return { est, pct, bca, z0, a, q: [q1, q2], se, bias: m - est, B, degenerate: s[0] === s[B - 1] };
}

// ── Permutation tests ──
// one sample: flip the signs of (x − μ0); two samples: shuffle group labels; pairs: shuffle y against x.
// Exact (every arrangement) when the number of arrangements is at most B, otherwise B random ones plus the observed
// arrangement: p = (k + 1)/(B + 1), as scipy.stats.permutation_test.
const lchoose = (n, k) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
export function arrangements(key, data) {
  const st = STATS[key];
  if (st.kind === 'one') return 2 ** data[0].length;
  if (st.kind === 'two') return Math.round(Math.exp(lchoose(data[0].length + data[1].length, data[0].length)));
  let p = 1; for (let i = 2; i <= data[0].length; i++) p *= i; return p;
}
export function permutationTest(key, data, { B = 9999, seed = 1, mu0 = 0, onProgress } = {}) {
  const st = STATS[key];
  const stat = st.kind === 'one' ? (a) => st.fn(a) - (key === 'prop' ? mu0 : 0) : st.fn;
  const base = st.kind === 'one' ? data[0].map((v) => v - mu0) : null;
  const one = (d) => (key === 'median' ? median(d) : mean(d));
  const observed = st.kind === 'one' ? one(base) : stat(data[0], data[1]);
  const total = arrangements(key, data), exact = total <= B && total <= 2e5;
  const nulls = [];
  if (exact) {
    if (st.kind === 'one') {
      const n = base.length, buf = new Float64Array(n);
      for (let mask = 0; mask < total; mask++) { for (let i = 0; i < n; i++) buf[i] = mask & (1 << i) ? -base[i] : base[i]; nulls.push(one(buf)); }
    } else if (st.kind === 'two') {
      const all = [...data[0], ...data[1]], N = all.length, k = data[0].length, pick = Array.from({ length: k }, (_, i) => i);
      for (;;) {
        const inA = new Uint8Array(N); pick.forEach((i) => { inA[i] = 1; });
        const A = [], Bv = []; for (let i = 0; i < N; i++) (inA[i] ? A : Bv).push(all[i]);
        nulls.push(stat(A, Bv));
        let i = k - 1; while (i >= 0 && pick[i] === N - k + i) i--;
        if (i < 0) break;
        pick[i]++; for (let j = i + 1; j < k; j++) pick[j] = pick[j - 1] + 1;
      }
    } else {
      const y = [...data[1]], n = y.length, c = new Array(n).fill(0);
      nulls.push(stat(data[0], y));
      for (let i = 0; i < n;) {
        if (c[i] < i) { const j = i % 2 ? c[i] : 0; [y[j], y[i]] = [y[i], y[j]]; nulls.push(stat(data[0], y)); c[i]++; i = 0; } else { c[i] = 0; i++; }
      }
    }
  } else {
    const r = rng(seed);
    if (st.kind === 'one') {
      const buf = new Float64Array(base.length);
      for (let b = 0; b < B; b++) { for (let i = 0; i < base.length; i++) buf[i] = r() < 0.5 ? -base[i] : base[i]; nulls.push(one(buf)); if (onProgress && b % 1000 === 999) onProgress((b + 1) / B); }
    } else {
      const all = st.kind === 'two' ? [...data[0], ...data[1]] : [...data[1]], k = data[0].length;
      for (let b = 0; b < B; b++) {
        for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
        nulls.push(st.kind === 'two' ? stat(all.slice(0, k), all.slice(k)) : stat(data[0], all));
        if (onProgress && b % 1000 === 999) onProgress((b + 1) / B);
      }
    }
  }
  const adjust = exact ? 0 : 1, m = nulls.length, gamma = Math.abs(observed * 2.220446049250313e-14);
  let le = 0, ge = 0; for (const v of nulls) { if (v <= observed + gamma) le++; if (v >= observed - gamma) ge++; }
  const pLess = (le + adjust) / (m + adjust), pGreater = (ge + adjust) / (m + adjust);
  return { observed, exact, total, n: m, pLess, pGreater, p: Math.min(1, 2 * Math.min(pLess, pGreater)), nulls: Float64Array.from(nulls) };
}

// Histogram counts for a bootstrap or null distribution.
export function histogram(vals, bins = 40) {
  const s = sorted(Array.from(vals).filter(Number.isFinite)); if (!s.length) return { edges: [], counts: [] };
  const lo = s[0], hi = s[s.length - 1] === lo ? lo + 1 : s[s.length - 1], w = (hi - lo) / bins;
  const counts = new Array(bins).fill(0); for (const v of s) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
  return { edges: Array.from({ length: bins + 1 }, (_, i) => lo + i * w), counts };
}

// ── Summary ──
// Confidence rule: high when every sample has n ≥ 30, B ≥ 5,000 and (for an interval) the BCa and percentile intervals
// agree to within 10% of their width; medium when n ≥ 15 per sample; otherwise low. Small samples make every
// bootstrap interval too narrow (Hesterberg 2015, "What teachers should know about the bootstrap").
export function resamplingSummary({ key, data, ci, perm, conf = 0.95, mu0 = 0, labels = ['A', 'B'] }) {
  const st = STATS[key], nMin = Math.min(...data.filter(Boolean).map((d) => d.length)), c = Math.round(conf * 100);
  const agree = ci ? Math.abs(ci.bca[0] - ci.pct[0]) + Math.abs(ci.bca[1] - ci.pct[1]) <= 0.1 * (ci.pct[1] - ci.pct[0] || 1) : true;
  const B = ci ? ci.B : perm.n;
  const confidence = nMin >= 30 && B >= 5000 && agree ? 'high' : nMin >= 15 ? 'medium' : 'low';
  const d = (x) => f(x, key === 'corr' || key === 'prop' ? 3 : 2);
  const what = (st.name[0].toLowerCase() + st.name.slice(1)).replace('(A − B)', `(${labels[0]} − ${labels[1]})`);
  const meaning = [], caveats = [], next = [];
  let headline, report;
  if (ci) {
    const excl0 = st.kind !== 'one' && (ci.bca[0] > 0 || ci.bca[1] < 0);
    headline = `The ${what} is ${d(ci.est)}, with a ${c}% BCa bootstrap interval of ${d(ci.bca[0])} to ${d(ci.bca[1])}.`;
    meaning.push(`The percentile interval is ${d(ci.pct[0])} to ${d(ci.pct[1])}; BCa corrects it for bias (z0 = ${f(ci.z0, 3)}) and skew (a = ${f(ci.a, 4)}).`);
    if (st.kind !== 'one') meaning.push(excl0 ? `The interval excludes 0, so the data are not consistent with no ${key === 'corr' ? 'correlation' : 'difference'} at the ${c}% level.` : `The interval includes 0, so no ${key === 'corr' ? 'correlation' : 'difference'} remains plausible.`);
    meaning.push(`Bootstrap standard error ${d(ci.se)} from ${ci.B.toLocaleString('en')} resamples.`);
    if (!agree) caveats.push('The percentile and BCa intervals disagree noticeably, a sign of skew or bias; prefer BCa, and treat the bounds as rough.');
    report = `The ${what} was ${d(ci.est)} (${c}% BCa bootstrap CI ${d(ci.bca[0])} to ${d(ci.bca[1])}; percentile CI ${d(ci.pct[0])} to ${d(ci.pct[1])}; ${ci.B.toLocaleString('en')} resamples; n = ${data.filter(Boolean).map((x) => x.length).join(' and ')}).`;
  } else {
    const obs = st.kind === 'one' ? perm.observed + mu0 : perm.observed;
    const nullText = st.kind === 'one' ? `a true ${what} of ${f(mu0, 2)}` : key === 'corr' ? 'no relationship' : `no difference between ${labels[0]} and ${labels[1]}`;
    headline = perm.p < 0.05
      ? `A ${what} of ${d(obs)} would be rare if there were ${nullText} (two-sided ${pText(perm.p)}).`
      : `The observed ${what} of ${d(obs)} is quite compatible with ${nullText} (two-sided ${pText(perm.p)}).`;
    meaning.push(`${perm.exact ? `All ${perm.n.toLocaleString('en')} possible arrangements were checked (an exact test)` : `${(perm.n).toLocaleString('en')} random rearrangements were drawn`}; one-sided p-values: ${f(perm.pLess, 4)} (lower) and ${f(perm.pGreater, 4)} (higher).`);
    meaning.push('A permutation test makes no normality assumption; it only assumes the labels (or signs) are exchangeable when the null hypothesis is true.');
    report = `A ${perm.exact ? 'exact' : 'Monte Carlo'} permutation test of the ${what} (observed ${d(obs)}; ${perm.n.toLocaleString('en')} ${perm.exact ? 'arrangements' : 'resamples'}) gave two-sided ${pText(perm.p)}.`;
    if (st.kind === 'one') caveats.push('The sign-flip test assumes the values are symmetric around the null value; for skewed task times test the log times instead.');
  }
  if (nMin < 15) caveats.push(ci ? `With only ${nMin} values in a sample, the bootstrap cannot see values you did not observe, so intervals tend to be too narrow.` : `With only ${nMin} values in a sample, the test has little power: a non-significant result does not show there is no difference.`);
  if (key === 'diffmedian' || key === 'median') caveats.push('Medians of small samples jump between a few observed values, so their bootstrap distribution is lumpy.');
  caveats.push(ci ? 'A confidence interval describes the method: 95% of intervals built this way would contain the true value; it is not a 95% chance for this one interval.' : 'A small p-value says the data are unusual under the null hypothesis; it does not measure how big or important the effect is.');
  next.push(ci ? 'Run the permutation test as well if you need a p-value.' : 'Switch to the bootstrap to put an interval around the effect size, which matters more than the p-value.');
  next.push('For skewed task times, check the shape in the [distribution check](/calculators/distribution-check) and consider the geometric mean.');
  return { headline, meaning: meaning.slice(0, 5), confidence, confidenceNote: `Rule: strong when every sample has at least 30 values, at least 5,000 resamples are used${ci ? ' and the BCa and percentile intervals agree within 10% of their width' : ''} (here smallest n = ${nMin}, B = ${B.toLocaleString('en')}); some evidence with at least 15 per sample; otherwise weak (Hesterberg 2015).`, caveats: caveats.slice(0, 3), next, report };
}
