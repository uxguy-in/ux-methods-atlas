// Moderation (Hayes PROCESS model 1) and simple mediation (PROCESS model 4). OLS throughout; the indirect effect is
// tested with a percentile bootstrap (and optionally bias-corrected, as pingouin), run in a Web Worker for large B.
// Checked against statsmodels OLS and pingouin.mediation_analysis by `npm run check:statsbench`.
import { olsFit, mean, sd, tCrit, tP2, zP2, normInv, normCdf, rng, sorted, quantileSorted, f, pText } from './statsbench-core.js';

// Rows of numbers for the chosen columns with listwise deletion.
export function pickRows(table, names) {
  const cols = names.map((n) => table.cols.find((c) => c.name === n));
  if (cols.some((c) => !c || !c.numeric)) return null;
  const rows = [];
  for (let i = 0; i < table.n; i++) { const r = cols.map((c) => c.values[i]); if (r.every((v) => v !== null && Number.isFinite(v))) rows.push(r); }
  return rows;
}

const coefRow = (fit, j, conf, name) => {
  const b = fit.b[j], se = Math.sqrt(fit.cov[j][j]), t = b / se, tc = tCrit(conf, fit.df);
  return { name, b, se, t, p: tP2(t, fit.df), lo: b - tc * se, hi: b + tc * se };
};

// ── Moderation: Y = b0 + b1·X + b2·W + b3·X·W + covariates ──
// Conditional effect of X at W = w: θ(w) = b1 + b3·w, SE² = V11 + 2w·V13 + w²·V33, t on n − p df.
// Johnson-Neyman: the w where θ(w)/SE(w) = ±t_crit, the roots of
// (b3² − t²V33)w² + 2(b1·b3 − t²V13)w + (b1² − t²V11) = 0 that fall inside the observed range of W.
export function moderation(rows, { conf = 0.95, center = true, probe = 'sd', covNames = [] } = {}) {
  const n = rows.length;
  const xs = rows.map((r) => r[0]), ws = rows.map((r) => r[1]), ys = rows.map((r) => r[2]);
  const mx = center ? mean(xs) : 0, mw = center ? mean(ws) : 0;
  const X = rows.map((r) => { const x = r[0] - mx, w = r[1] - mw; return [1, x, w, x * w, ...r.slice(3)]; });
  const fit = olsFit(X, ys); if (!fit) return null;
  const names = ['Intercept', 'X', 'W', 'X × W', ...covNames];
  const coefs = names.map((nm, j) => coefRow(fit, j, conf, nm));
  const my = mean(ys), sst = ys.reduce((s, v) => s + (v - my) ** 2, 0), r2 = 1 - fit.sse / sst;
  const tInt = coefs[3].t, dR2 = (tInt * tInt * (1 - r2)) / fit.df;
  const V = fit.cov, b1 = fit.b[1], b3 = fit.b[3], tc = tCrit(conf, fit.df);
  const effectAt = (wRaw) => {
    const w = wRaw - mw, est = b1 + b3 * w, se = Math.sqrt(V[1][1] + 2 * w * V[1][3] + w * w * V[3][3]), t = est / se;
    return { w: wRaw, est, se, t, p: tP2(t, fit.df), lo: est - tc * se, hi: est + tc * se };
  };
  const wDistinct = [...new Set(ws)].sort((a, b) => a - b);
  const sw = sorted(ws);
  let probeVals;
  if (wDistinct.length <= 2) probeVals = wDistinct;
  else if (probe === 'pct') probeVals = [0.16, 0.5, 0.84].map((q) => quantileSorted(sw, q));
  else { const m = mean(ws), s = sd(ws); probeVals = [m - s, m, m + s]; }
  const slopes = probeVals.map(effectAt);
  // Johnson-Neyman.
  const A = b3 * b3 - tc * tc * V[3][3], B = 2 * (b1 * b3 - tc * tc * V[1][3]), C = b1 * b1 - tc * tc * V[1][1];
  const disc = B * B - 4 * A * C, wMin = sw[0], wMax = sw[n - 1];
  let jn = [];
  if (Math.abs(A) > 1e-15 && disc >= 0) jn = [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].map((r) => r + mw).sort((a, b) => a - b);
  const jnInside = jn.filter((w) => w >= wMin && w <= wMax);
  const pctBelow = (w) => ws.filter((v) => v < w).length / n;
  const curve = Array.from({ length: 61 }, (_, i) => effectAt(wMin + (i / 60) * (wMax - wMin)));
  // Regions of significance across the observed range.
  const cuts = [wMin, ...jnInside, wMax], regions = [];
  for (let i = 0; i < cuts.length - 1; i++) { const mid = (cuts[i] + cuts[i + 1]) / 2, e = effectAt(mid); regions.push({ from: cuts[i], to: cuts[i + 1], sig: e.p < 1 - conf, sign: Math.sign(e.est) }); }
  return {
    n, coefs, r2, dR2, F: tInt * tInt, pInt: coefs[3].p, df: fit.df, slopes, jn, jnInside: jnInside.map((w) => ({ w, below: pctBelow(w) })), regions, curve,
    wMin, wMax, mx, mw, center, conf, binaryW: wDistinct.length <= 2, effectAt,
  };
}

// ── Simple mediation: a path M ~ X (+ covariates); b and c′ from Y ~ X + M (+ covariates); total c from Y ~ X (+ covariates) ──
// Indirect effect = a·b (= c − c′ in OLS). Sobel z = ab/√(b²·SEa² + a²·SEb²) is shown only for comparison.
export function mediationPaths(rows, conf = 0.95) {
  const xs = rows.map((r) => r[0]), ms = rows.map((r) => r[1]), ys = rows.map((r) => r[2]);
  const cov = (r) => r.slice(3);
  const fa = olsFit(rows.map((r) => [1, r[0], ...cov(r)]), ms);
  const fb = olsFit(rows.map((r) => [1, r[0], r[1], ...cov(r)]), ys);
  const fc = olsFit(rows.map((r) => [1, r[0], ...cov(r)]), ys);
  if (!fa || !fb || !fc) return null;
  const a = coefRow(fa, 1, conf, 'a (X → M)'), b = coefRow(fb, 2, conf, 'b (M → Y | X)'), cp = coefRow(fb, 1, conf, "c′ direct (X → Y | M)"), c = coefRow(fc, 1, conf, 'c total (X → Y)');
  const ab = a.b * b.b, sobelSe = Math.sqrt(b.b ** 2 * a.se ** 2 + a.b ** 2 * b.se ** 2), sobelZ = ab / sobelSe;
  const sx = sd(xs), sy = sd(ys);
  const my = mean(ys), sst = ys.reduce((s, v) => s + (v - my) ** 2, 0), mm = mean(ms), ssm = ms.reduce((s, v) => s + (v - mm) ** 2, 0);
  return {
    n: rows.length, a, b, cp, c, ab, sobel: { se: sobelSe, z: sobelZ, p: zP2(sobelZ) }, propMediated: ab / c.b,
    abStd: ab * sx / sy, abPartStd: ab / sy, r2M: 1 - fa.sse / ssm, r2Y: 1 - fb.sse / sst, binaryX: new Set(xs).size === 2, conf,
  };
}
// a·b by least squares on 2×2 / 3×3 normal equations (fast path for the bootstrap; covariates handled by olsFit).
function abOf(rows, idx) {
  const take = idx.map((i) => rows[i]);
  if (rows[0].length > 3) {
    const fa = olsFit(take.map((r) => [1, r[0], ...r.slice(3)]), take.map((r) => r[1]));
    const fb = olsFit(take.map((r) => [1, r[0], r[1], ...r.slice(3)]), take.map((r) => r[2]));
    return fa && fb ? fa.b[1] * fb.b[2] : NaN;
  }
  let sx = 0, sm = 0, sy = 0; const n = idx.length;
  for (const r of take) { sx += r[0]; sm += r[1]; sy += r[2]; }
  const mx = sx / n, mmv = sm / n, my = sy / n;
  let sxx = 0, smm = 0, sxm = 0, sxy = 0, smy = 0;
  for (const r of take) { const dx = r[0] - mx, dm = r[1] - mmv, dy = r[2] - my; sxx += dx * dx; smm += dm * dm; sxm += dx * dm; sxy += dx * dy; smy += dm * dy; }
  const a = sxm / sxx, det = sxx * smm - sxm * sxm;
  if (!(Math.abs(det) > 1e-12)) return NaN;
  const b = (sxx * smy - sxm * sxy) / det;
  return a * b;
}
// Bootstrap a·b: B resamples of n row indices drawn with mulberry32(seed), in order (replayed in the Python reference).
export function bootIndirect(rows, B = 5000, seed = 1, onProgress) {
  const r = rng(seed), n = rows.length, out = new Float64Array(B), idx = new Array(n);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) idx[i] = Math.floor(r() * n);
    out[b] = abOf(rows, idx);
    if (onProgress && b % 500 === 499) onProgress((b + 1) / B);
  }
  return out;
}
// Percentile interval (numpy linear percentiles) and the bias-corrected interval used by pingouin
// (z0 = Φ⁻¹(share of bootstrap values below the estimate); bounds at Φ(2z0 ± z)).
export function bootCI(dist, est, conf = 0.95) {
  const good = Array.from(dist).filter(Number.isFinite), s = sorted(good), alpha = 1 - conf;
  const pct = [quantileSorted(s, alpha / 2), quantileSorted(s, 1 - alpha / 2)];
  const z0 = normInv(good.filter((v) => v < est).length / good.length);
  const bc = [normCdf(2 * z0 + normInv(alpha / 2)), normCdf(2 * z0 + normInv(1 - alpha / 2))].map((q) => quantileSorted(s, q));
  const m = mean(good), se = Math.sqrt(good.reduce((a, v) => a + (v - m) ** 2, 0) / (good.length - 1));
  const pBoot = est === 0 ? 1 : Math.min(1, (2 * Math.min(good.filter((v) => v > 0).length, good.filter((v) => v < 0).length)) / good.length);
  return { pct, bc, se, pBoot, B: good.length, failed: dist.length - good.length };
}

// ── Plain-language summaries ──
// Moderation confidence rule: high when n ≥ 100 and the interaction has p < .01; medium when n ≥ 50 and p < .05;
// otherwise low (interactions need roughly four times the sample of a main effect to detect; Gelman 2018).
export function moderationSummary(m, { x, w, y }) {
  const conf = Math.round(m.conf * 100), it = m.coefs[3];
  const confidence = m.n >= 100 && it.p < 0.01 ? 'high' : m.n >= 50 && it.p < 0.05 ? 'medium' : 'low';
  const sigInt = it.p < 0.05;
  const fmtW = (v) => f(v, 2);
  const headline = sigInt
    ? `The effect of ${x} on ${y} depends on ${w}: each unit of ${w} changes the ${x} slope by ${f(it.b, 3)} (${conf}% CI ${f(it.lo, 3)} to ${f(it.hi, 3)}, ${pText(it.p)}).`
    : `No clear evidence that ${w} changes the effect of ${x} on ${y} (interaction ${f(it.b, 3)}, ${conf}% CI ${f(it.lo, 3)} to ${f(it.hi, 3)}, ${pText(it.p)}).`;
  const meaning = [
    `Simple slopes of ${x}: ${m.slopes.map((s) => `${f(s.est, 3)} at ${w} = ${fmtW(s.w)} (${pText(s.p)})`).join('; ')}.`,
    `The interaction adds ${f(m.dR2 * 100, 1)} percentage points to R² (model R² = ${f(m.r2, 3)}).`,
  ];
  if (!m.binaryW) {
    if (m.jnInside.length) meaning.push(`Johnson-Neyman: the effect of ${x} changes between significant and not at ${w} = ${m.jnInside.map((j) => `${fmtW(j.w)} (${f(j.below * 100, 0)}% of people below)`).join(' and ')}.`);
    else meaning.push(`Johnson-Neyman: the effect of ${x} is ${m.regions[0]?.sig ? 'significant' : 'not significant'} across the whole observed range of ${w}, so there is no transition point.`);
  }
  const caveats = ['A significant interaction in observational data does not show that changing the moderator would change the effect; other variables related to it may be responsible.'];
  if (!m.center) caveats.push(`Without centring, the coefficient for ${x} is its effect when ${w} = 0, which may be outside your data.`);
  else caveats.push(`With centring, the coefficient for ${x} is its effect at the average ${w} (${f(m.mw, 2)}), not an average effect.`);
  const next = ['Plot the simple slopes for your audience; the numbers alone are hard to read.', 'If the moderator is the thing you can change, test it directly in an experiment.'];
  const report = `A moderation model (PROCESS model 1, n = ${m.n}${m.center ? ', X and W mean-centred' : ''}) found ${sigInt ? 'a' : 'no significant'} ${x} × ${w} interaction on ${y}, b = ${f(it.b, 3)}, ${conf}% CI [${f(it.lo, 3)}, ${f(it.hi, 3)}], ${pText(it.p)}, ΔR² = ${f(m.dR2, 3)}. Conditional effects of ${x}: ${m.slopes.map((s) => `${f(s.est, 3)} at ${w} = ${fmtW(s.w)}`).join(', ')}.`;
  return { headline, meaning, confidence, confidenceNote: `Rule: strong when n ≥ 100 and the interaction has p < .01 (here n = ${m.n}, ${pText(it.p)}); some evidence when n ≥ 50 and p < .05; otherwise weak. Interactions need much larger samples than main effects.`, caveats, next, report };
}
// Mediation confidence rule: high when n ≥ 100, the bootstrap interval for a·b excludes 0 and B ≥ 5,000; medium when
// the interval excludes 0 with n ≥ 50 or B < 5,000; otherwise low. Fritz and MacKinnon (2007) give n ≈ 71–148 for
// medium a and b paths with the percentile bootstrap.
export function mediationSummary(p, ci, { x, m, y, method = 'pct' }) {
  const conf = Math.round(p.conf * 100), [lo, hi] = method === 'bc' ? ci.bc : ci.pct, excl = lo > 0 || hi < 0;
  const confidence = excl && p.n >= 100 && ci.B >= 5000 ? 'high' : excl && p.n >= 50 ? 'medium' : 'low';
  const label = method === 'bc' ? 'bias-corrected bootstrap' : 'percentile bootstrap';
  const headline = excl
    ? `${x} affects ${y} partly through ${m}: indirect effect a·b = ${f(p.ab, 3)} (${conf}% ${label} CI ${f(lo, 3)} to ${f(hi, 3)}).`
    : `No clear indirect effect of ${x} on ${y} through ${m}: a·b = ${f(p.ab, 3)} (${conf}% ${label} CI ${f(lo, 3)} to ${f(hi, 3)}, which includes 0).`;
  const meaning = [
    `a: ${x} → ${m} = ${f(p.a.b, 3)} (${pText(p.a.p)}); b: ${m} → ${y}, holding ${x} constant = ${f(p.b.b, 3)} (${pText(p.b.p)}).`,
    `Total effect c = ${f(p.c.b, 3)} (${pText(p.c.p)}) splits into the indirect ${f(p.ab, 3)} and the direct c′ = ${f(p.cp.b, 3)} (${pText(p.cp.p)}).`,
  ];
  if (excl && Math.abs(p.c.b) > 1e-9 && Math.sign(p.ab) === Math.sign(p.c.b) && Math.abs(p.ab / p.c.b) <= 1) meaning.push(`About ${f(100 * p.ab / p.c.b, 0)}% of the total effect runs through ${m}, a ratio that is unstable in samples under about 500 (MacKinnon 2008).`);
  if (excl && Math.sign(p.ab) !== Math.sign(p.cp.b) && p.cp.p < 0.05) meaning.push('The indirect and direct effects have opposite signs (inconsistent mediation), so the total effect can look small even though both paths matter.');
  meaning.push(`Standardised indirect effect: ${f(p.abStd, 3)} SD of ${y} per SD of ${x}.`);
  const caveats = [
    'Mediation analysis assumes the causal order X → M → Y and no unmeasured confounding of M and Y. With M and Y measured at the same time, the reverse order fits the data just as well.',
    `The Sobel test (z = ${f(p.sobel.z, 2)}, ${pText(p.sobel.p)}) is shown only for comparison; it assumes a·b is normally distributed, which it rarely is.`,
  ];
  if (!p.binaryX) caveats.push(`${x} is not a randomised 0/1 condition, so even the a path is an association.`);
  const next = ['Randomise X if you can (for example tutorial on or off); then at least the a and c paths are causal.', 'Measure the mediator before the outcome, ideally at a separate time point.'];
  const report = `A simple mediation model (PROCESS model 4, n = ${p.n}, ${ci.B.toLocaleString('en')} bootstrap resamples) estimated the indirect effect of ${x} on ${y} through ${m} as ab = ${f(p.ab, 3)}, ${conf}% ${label} CI [${f(lo, 3)}, ${f(hi, 3)}]; a = ${f(p.a.b, 3)}, b = ${f(p.b.b, 3)}, direct effect c′ = ${f(p.cp.b, 3)} (${pText(p.cp.p)}), total effect c = ${f(p.c.b, 3)} (${pText(p.c.p)}).`;
  return { headline, meaning: meaning.slice(0, 5), confidence, confidenceNote: `Rule: strong when the bootstrap interval excludes 0, n ≥ 100 and at least 5,000 resamples are used (here n = ${p.n}, B = ${ci.B.toLocaleString('en')}); some evidence when it excludes 0 with n ≥ 50; otherwise weak. Fritz and MacKinnon (2007) put the sample needed for medium paths at about 71 to 148.`, caveats, next, report };
}
