// Distribution check: descriptives, skewness and kurtosis, Shapiro-Wilk (Royston 1995, algorithm AS R94, as scipy and
// R), Lilliefors-corrected Kolmogorov-Smirnov, Anderson-Darling, a log-normal fit with the geometric mean, Tukey's
// ladder of powers with the Box-Cox λ, a Gaussian KDE and a normal QQ plot. Checked against scipy and statsmodels.
import { mean, sd, sorted, quantileSorted, moments, normCdf, normInv, normSf, tCrit, rng, randNorm, f, pText } from './statsbench-core.js';

const poly = (c, x) => { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * x + c[i]; return r; };

// ── Shapiro-Wilk W and p (n from 3 to 5,000) ──
export function shapiroWilk(xs) {
  const x = sorted(xs), n = x.length;
  if (n < 3) return { W: NaN, p: NaN };
  const nn2 = Math.floor(n / 2), a = new Array(nn2 + 1).fill(0);
  if (n === 3) a[1] = Math.SQRT1_2;
  else {
    const an25 = n + 0.25; let summ2 = 0;
    for (let i = 1; i <= nn2; i++) { a[i] = normInv((i - 0.375) / an25); summ2 += a[i] * a[i]; }
    summ2 *= 2; const ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n);
    const a1 = poly([0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056], rsn) - a[1] / ssumm2;
    let i1, fac;
    if (n > 5) {
      i1 = 3; const a2 = -a[2] / ssumm2 + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], rsn);
      fac = Math.sqrt((summ2 - 2 * a[1] ** 2 - 2 * a[2] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2)); a[2] = a2;
    } else { i1 = 2; fac = Math.sqrt((summ2 - 2 * a[1] ** 2) / (1 - 2 * a1 ** 2)); }
    a[1] = a1;
    for (let i = i1; i <= nn2; i++) a[i] /= -fac;
  }
  const range = x[n - 1] - x[0];
  if (range < 1e-19) return { W: NaN, p: NaN, constant: true };
  // W = (Σ cᵢ x₍ᵢ₎)² / Σ (xᵢ − x̄)² with c antisymmetric: −a for the lower half, +a for the upper half.
  const m = mean(x); let num = 0, ss = 0;
  for (let i = 0; i < n; i++) { ss += ((x[i] - m) / range) ** 2; }
  for (let i = 1; i <= nn2; i++) num += a[i] * (x[n - i] - x[i - 1]) / range;
  const W = Math.min(1, (num * num) / ss), w1 = 1 - W;
  let p;
  if (n === 3) p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.PI / 3));
  else {
    let y = Math.log(w1), mu, s;
    if (n <= 11) {
      const g = -2.273 + 0.459 * n;
      if (y >= g) return { W, p: 1e-99 };
      y = -Math.log(g - y); mu = poly([0.544, -0.39978, 0.025054, -6.714e-4], n); s = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      const ln = Math.log(n); mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], ln); s = Math.exp(poly([-0.4803, -0.082676, 0.0030302], ln));
    }
    p = normSf((y - mu) / s);
  }
  return { W, p, n };
}

// ── Kolmogorov-Smirnov D against a normal with the sample mean and SD (ddof = 1), as statsmodels' lilliefors ──
export function ksNormal(xs) {
  const x = sorted(xs), n = x.length, m = mean(x), s = sd(x); let dp = 0, dm = 0;
  for (let i = 0; i < n; i++) { const F = normCdf((x[i] - m) / s); dp = Math.max(dp, (i + 1) / n - F); dm = Math.max(dm, F - i / n); }
  return Math.max(dp, dm);
}
// Lilliefors p-value by simulation: the share of normal samples of the same size whose D is at least as large.
export function lilliefors(xs, sims = 2000, seed = 11) {
  const D = ksNormal(xs), n = xs.length, r = rng(seed), buf = new Float64Array(n); let k = 0;
  for (let s = 0; s < sims; s++) { for (let i = 0; i < n; i++) buf[i] = randNorm(r); if (ksNormal(buf) >= D) k++; }
  return { D, p: (k + 1) / (sims + 1), sims };
}

// ── Anderson-Darling A² against a normal (mean and SD estimated) with the D'Agostino-Stephens (1986) p-value ──
export function andersonDarling(xs) {
  const x = sorted(xs), n = x.length, m = mean(x), s = sd(x);
  const lcdf = (z) => Math.log(normCdf(z)), lsf = (z) => Math.log(normSf(z));
  let S = 0; for (let i = 0; i < n; i++) S += (2 * i + 1) * (lcdf((x[i] - m) / s) + lsf((x[n - 1 - i] - m) / s));
  const A2 = -n - S / n, A = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  const p = A >= 0.6 ? Math.exp(1.2937 - 5.709 * A + 0.0186 * A * A) : A > 0.34 ? Math.exp(0.9177 - 4.279 * A - 1.38 * A * A)
    : A > 0.2 ? 1 - Math.exp(-8.318 + 42.796 * A - 59.938 * A * A) : 1 - Math.exp(-13.436 + 101.14 * A - 223.73 * A * A);
  return { A2, Astar: A, p: Math.min(1, Math.max(0, p)) };
}

// ── Descriptives ──
export function describe(xs, conf = 0.95) {
  const s = sorted(xs), n = s.length, m = mean(s), sdv = sd(s), q = [0.25, 0.5, 0.75].map((p) => quantileSorted(s, p));
  const iqr = q[2] - q[0], mo = moments(s), tc = tCrit(conf, n - 1);
  const fences = [q[0] - 1.5 * iqr, q[2] + 1.5 * iqr];
  return {
    n, mean: m, sd: sdv, se: sdv / Math.sqrt(n), ci: [m - tc * sdv / Math.sqrt(n), m + tc * sdv / Math.sqrt(n)], min: s[0], max: s[n - 1], q1: q[0], median: q[1], q3: q[2], iqr,
    ...mo, zSkew: mo.G1 / mo.ses, zKurt: mo.G2 / mo.sek, outliers: Array.from(s).filter((v) => v < fences[0] || v > fences[1]), fences, positive: s[0] > 0,
  };
}

// ── Log-normal fit: geometric mean with a t interval on the log scale, and MLE parameters (scipy lognorm.fit, floc = 0) ──
export function logNormal(xs, conf = 0.95) {
  const n = xs.length, l = xs.map(Math.log), m = mean(l), s = sd(l), tc = tCrit(conf, n - 1);
  const sigma = Math.sqrt(l.reduce((a, v) => a + (v - m) ** 2, 0) / n);
  const llLog = l.reduce((a, v) => a - v - Math.log(sigma) - 0.5 * Math.log(2 * Math.PI) - (v - m) ** 2 / (2 * sigma * sigma), 0);
  const mx = mean(xs), sx = Math.sqrt(xs.reduce((a, v) => a + (v - mx) ** 2, 0) / n);
  const llNorm = xs.reduce((a, v) => a - Math.log(sx) - 0.5 * Math.log(2 * Math.PI) - (v - mx) ** 2 / (2 * sx * sx), 0);
  return {
    gm: Math.exp(m), lo: Math.exp(m - tc * s / Math.sqrt(n)), hi: Math.exp(m + tc * s / Math.sqrt(n)), mu: m, sigma, sdLog: s, gsd: Math.exp(s),
    meanMLE: Math.exp(m + sigma * sigma / 2), aicLog: -2 * llLog + 4, aicNorm: -2 * llNorm + 4, llLog, llNorm, swLog: shapiroWilk(l),
  };
}

// ── Ladder of powers (Tukey 1977) and Box-Cox λ by maximum likelihood (scipy.stats.boxcox_normmax, method='mle') ──
export const LADDER = [[-2, '−1/x²'], [-1, '−1/x'], [-0.5, '−1/√x'], [0, 'log x'], [0.5, '√x'], [1, 'x (raw)'], [2, 'x²'], [3, 'x³']];
export const power = (x, p) => (p === 0 ? Math.log(x) : p < 0 ? -(x ** p) : x ** p);
export function ladder(xs) {
  const pos = xs.every((v) => v > 0);
  return LADDER.filter(([p]) => pos || (p > 0 && xs.every((v) => v >= 0)) || p === 1).map(([p, label]) => {
    const t = xs.map((v) => power(v, p)), mo = moments(t), sw = shapiroWilk(t);
    return { p, label, skew: mo.G1, kurt: mo.G2, W: sw.W, pSW: sw.p };
  });
}
export function boxcoxLLF(xs, lam) {
  const n = xs.length, y = xs.map((v) => (lam === 0 ? Math.log(v) : (v ** lam - 1) / lam)), m = mean(y);
  const v = y.reduce((a, b) => a + (b - m) ** 2, 0) / n;
  return -n / 2 * Math.log(v) + (lam - 1) * xs.reduce((a, b) => a + Math.log(b), 0);
}
export function boxcoxLambda(xs) {
  if (!xs.every((v) => v > 0)) return NaN;
  let a = -4, b = 4; const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = boxcoxLLF(xs, c), fd = boxcoxLLF(xs, d);
  for (let i = 0; i < 200 && b - a > 1e-11; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = boxcoxLLF(xs, c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = boxcoxLLF(xs, d); }
  }
  return (a + b) / 2;
}

// ── Gaussian kernel density (Scott's or Silverman's bandwidth, as scipy.stats.gaussian_kde) and histogram bins ──
export function kde(xs, grid, rule = 'scott') {
  const n = xs.length, factor = rule === 'silverman' ? (n * 3 / 4) ** (-1 / 5) : n ** (-1 / 5), h = sd(xs) * factor;
  const c = 1 / (n * h * Math.sqrt(2 * Math.PI));
  return { h, y: grid.map((g) => { let s = 0; for (const x of xs) s += Math.exp(-0.5 * ((g - x) / h) ** 2); return s * c; }) };
}
// numpy's 'auto' rule: the smaller bin width of Sturges and Freedman-Diaconis.
export function bins(xs) {
  const s = sorted(xs), n = s.length, range = s[n - 1] - s[0] || 1;
  const sturges = range / (Math.log2(n) + 1), iqr = quantileSorted(s, 0.75) - quantileSorted(s, 0.25);
  const fd = iqr > 0 ? 2 * iqr / Math.cbrt(n) : Infinity, w = Math.min(sturges, fd), k = Math.max(1, Math.ceil(range / w));
  const width = range / k, counts = new Array(k).fill(0);
  for (const v of s) counts[Math.min(k - 1, Math.floor((v - s[0]) / width))]++;
  return { edges: Array.from({ length: k + 1 }, (_, i) => s[0] + i * width), counts, width };
}
// Normal probability plot as scipy.stats.probplot: Filliben's medians, least-squares line and its correlation r.
export function probplot(xs) {
  const s = sorted(xs), n = s.length;
  const m = Array.from({ length: n }, (_, i) => (i === 0 ? 1 - 0.5 ** (1 / n) : i === n - 1 ? 0.5 ** (1 / n) : (i + 1 - 0.3175) / (n + 0.365))).map(normInv);
  const mx = mean(m), my = mean(s); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (m[i] - mx) * (s[i] - my); sxx += (m[i] - mx) ** 2; syy += (s[i] - my) ** 2; }
  const slope = sxy / sxx;
  return { osm: m, osr: Array.from(s), slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) };
}

// ── Summary ──
// Confidence rule: high when n ≥ 50 (the tests have reasonable power and the shape estimates settle), medium when
// n ≥ 20, low below 20, where normality tests rarely reject even for clearly skewed data (Razali and Wah 2011).
export function distributionSummary({ d, sw, ad, ks, ln, lad, lam, unit = '', name = 'the values', conf = 0.95 }) {
  const c = Math.round(conf * 100), u = unit ? ` ${unit}` : '';
  const confidence = d.n >= 50 ? 'high' : d.n >= 20 ? 'medium' : 'low';
  const nonNormal = sw.p < 0.05 || ad.p < 0.05;
  const skewWord = Math.abs(d.G1) < 0.5 ? 'roughly symmetric' : d.G1 > 0 ? (d.G1 > 1 ? 'strongly right-skewed (a long tail of high values)' : 'moderately right-skewed') : (d.G1 < -1 ? 'strongly left-skewed' : 'moderately left-skewed');
  const logBetter = ln && ln.aicLog < ln.aicNorm - 2;
  const headline = nonNormal
    ? `${name[0].toUpperCase()}${name.slice(1)} are ${skewWord} and not normal (Shapiro-Wilk W = ${f(sw.W, 3)}, ${pText(sw.p)}).`
    : `${name[0].toUpperCase()}${name.slice(1)} are ${skewWord}, and the tests find no clear departure from normality (Shapiro-Wilk W = ${f(sw.W, 3)}, ${pText(sw.p)}).`;
  const meaning = [
    `Mean ${f(d.mean, 2)}${u} vs median ${f(d.median, 2)}${u}; skewness ${f(d.G1, 2)} (SE ${f(d.ses, 2)}), excess kurtosis ${f(d.G2, 2)} (SE ${f(d.sek, 2)}).`,
    `Anderson-Darling A² = ${f(d.n ? ad.A2 : NaN, 3)} (${pText(ad.p)}); Lilliefors KS D = ${f(ks.D, 3)} (${pText(ks.p)}, simulated).`,
  ];
  if (ln) meaning.push(`Geometric mean ${f(ln.gm, 2)}${u} (${c}% CI ${f(ln.lo, 2)} to ${f(ln.hi, 2)}). ${logBetter ? `A log-normal fits better than a normal (AIC ${f(ln.aicLog, 1)} vs ${f(ln.aicNorm, 1)}), so report the geometric mean as the typical value (Sauro and Lewis 2016 recommend it for task times under about 25 participants).` : `A log-normal does not fit clearly better than a normal (AIC ${f(ln.aicLog, 1)} vs ${f(ln.aicNorm, 1)}).`}`);
  if (lad && lad.length) {
    const best = [...lad].sort((a, b) => b.W - a.W)[0];
    meaning.push(`On the ladder of powers, ${best.label} gives the most normal shape (W = ${f(best.W, 3)}, skewness ${f(best.skew, 2)})${Number.isFinite(lam) ? `; the Box-Cox λ is ${f(lam, 2)}` : ''}.`);
  }
  if (d.outliers.length) meaning.push(`${d.outliers.length} value${d.outliers.length === 1 ? ' is' : 's are'} outside Tukey's fences (${f(d.fences[0], 2)} to ${f(d.fences[1], 2)}): ${d.outliers.slice(0, 6).map((v) => f(v, 1)).join(', ')}.`);
  const caveats = [
    d.n < 20 ? 'With fewer than 20 values a non-significant normality test says little: the tests have low power, so look at the QQ plot instead.' : 'With large samples normality tests flag trivial departures; judge by the QQ plot and the size of the skewness, not the p-value alone.',
    'A t-test or confidence interval needs an approximately normal mean, not normal raw data; with 30 or more values moderate skew matters much less.',
  ];
  const next = [nonNormal && d.positive ? 'For task times, analyse log times (the geometric mean) or use the [task time interval](/calculators/task-time).' : 'Parametric tests such as the t-test are reasonable here; see the [test selector](/calculators/test-selector).',
    'For comparisons that make no shape assumption, use [bootstrap or permutation tests](/calculators/resampling).'];
  const report = `${name[0].toUpperCase()}${name.slice(1)} (n = ${d.n}) had mean ${f(d.mean, 2)}${u} (SD ${f(d.sd, 2)}) and median ${f(d.median, 2)}${u}, skewness ${f(d.G1, 2)} and excess kurtosis ${f(d.G2, 2)}; Shapiro-Wilk W = ${f(sw.W, 3)}, ${pText(sw.p)}.${ln ? ` Geometric mean ${f(ln.gm, 2)}${u}, ${c}% CI ${f(ln.lo, 2)} to ${f(ln.hi, 2)}.` : ''}`;
  return { headline, meaning: meaning.slice(0, 5), confidence, confidenceNote: `Rule: strong with 50 or more values, some evidence with 20 to 49, weak below 20, where normality tests rarely reject even for clearly skewed data (Razali and Wah 2011). Here n = ${d.n}.`, caveats, next, report };
}
