// Statistical process control for UX metrics: XmR (individuals and moving range), p-charts and u-charts, Western
// Electric and Nelson run rules, a tabular CUSUM, binary-segmentation change points and an interrupted time series
// (segmented regression). Pure functions; checked by server/scripts/check-signals.js.
import { ols, neweyWest, tInv, tSf2, normInv, pFromZ, toNum, parseLines, rng, gauss, fmt, sig, pText } from './signals-core.js';

// Series parsing. XmR: "label, value". p: "label, defectives, n". u: "label, count, exposure". A label is optional
// when the line is only numbers.
export function parseSeries(text, type) {
  const pts = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    const nums = c.map(toNum), lab = Number.isFinite(nums[0]) && c.length === (type === 'x' ? 1 : 2) ? String(pts.length + 1) : c[0];
    const vals = Number.isFinite(nums[0]) && c.length === (type === 'x' ? 1 : 2) ? nums : nums.slice(1);
    if (type === 'x') { if (Number.isFinite(vals[0])) pts.push({ label: lab, x: vals[0] }); else bad.push(i + 1); }
    else if (Number.isFinite(vals[0]) && vals[1] > 0 && vals[0] >= 0 && (type === 'u' || vals[0] <= vals[1])) pts.push({ label: lab, count: vals[0], n: vals[1], x: vals[0] / vals[1] });
    else bad.push(i + 1);
  });
  return { pts, bad };
}

// Control limits. base = number of leading points used to compute the centre line and limits (0 or ≥ length: all).
// Returns per-point centre, sigma, limits and z = (x − centre) / sigma.
export function limits(pts, type, base = 0) {
  const m = base >= 2 && base < pts.length ? base : pts.length, B = pts.slice(0, m);
  let center, mrbar = NaN, sigmaOf;
  if (type === 'x') {
    center = B.reduce((s, p) => s + p.x, 0) / m;
    const mrs = B.slice(1).map((p, i) => Math.abs(p.x - B[i].x));
    mrbar = mrs.reduce((s, v) => s + v, 0) / mrs.length;
    const s = mrbar / 1.128; // d2 for n = 2
    sigmaOf = () => s;
  } else if (type === 'p') {
    center = B.reduce((s, p) => s + p.count, 0) / B.reduce((s, p) => s + p.n, 0);
    sigmaOf = (p) => Math.sqrt(center * (1 - center) / p.n);
  } else {
    center = B.reduce((s, p) => s + p.count, 0) / B.reduce((s, p) => s + p.n, 0);
    sigmaOf = (p) => Math.sqrt(center / p.n);
  }
  const rows = pts.map((p, i) => {
    const s = sigmaOf(p), lcl = center - 3 * s;
    return { ...p, i, center, sigma: s, ucl: center + 3 * s, lcl: type === 'x' ? lcl : Math.max(0, lcl), z: s > 0 ? (p.x - center) / s : 0, mr: i > 0 && type === 'x' ? Math.abs(p.x - pts[i - 1].x) : NaN };
  });
  return { rows, center, mrbar, mrUcl: 3.267 * mrbar, base: m, type, sigma: type === 'x' ? mrbar / 1.128 : NaN };
}

// Run rules on standardised values z. Each rule returns the indexes of the points that complete a signal.
export const RULES = {
  we: [
    ['1', 'One point beyond 3σ'],
    ['2', '2 of 3 in a row beyond 2σ on the same side'],
    ['3', '4 of 5 in a row beyond 1σ on the same side'],
    ['4', '8 in a row on the same side of the centre'],
  ],
  nelson: [
    ['1', 'One point beyond 3σ'],
    ['2', '9 in a row on the same side of the centre'],
    ['3', '6 in a row steadily increasing or decreasing'],
    ['4', '14 in a row alternating up and down'],
    ['5', '2 of 3 in a row beyond 2σ on the same side'],
    ['6', '4 of 5 in a row beyond 1σ on the same side'],
    ['7', '15 in a row within 1σ (either side)'],
    ['8', '8 in a row beyond 1σ (either side)'],
  ],
};
const kOfN = (z, k, n, lim) => {
  const out = [];
  for (let i = n - 1; i < z.length; i++) {
    const w = z.slice(i - n + 1, i + 1);
    if (w.filter((v) => v > lim).length >= k && z[i] > lim) out.push(i);
    else if (w.filter((v) => v < -lim).length >= k && z[i] < -lim) out.push(i);
  }
  return out;
};
const run = (z, n, test) => { const out = []; for (let i = n - 1; i < z.length; i++) if (test(z.slice(i - n + 1, i + 1), i)) out.push(i); return out; };
const sameSide = (w) => w.every((v) => v > 0) || w.every((v) => v < 0);
const monotone = (w) => w.slice(1).every((v, j) => v > w[j]) || w.slice(1).every((v, j) => v < w[j]);
const alternating = (w) => { const d = w.slice(1).map((v, j) => Math.sign(v - w[j])); return d.every((s) => s !== 0) && d.slice(1).every((s, j) => s === -d[j]); };
export function runRules(z, set = 'we') {
  const beyond3 = z.map((v, i) => (Math.abs(v) > 3 ? i : -1)).filter((i) => i >= 0);
  const hits = set === 'we'
    ? { 1: beyond3, 2: kOfN(z, 2, 3, 2), 3: kOfN(z, 4, 5, 1), 4: run(z, 8, sameSide) }
    : { 1: beyond3, 2: run(z, 9, sameSide), 3: run(z, 6, monotone), 4: run(z, 14, alternating), 5: kOfN(z, 2, 3, 2), 6: kOfN(z, 4, 5, 1), 7: run(z, 15, (w) => w.every((v) => Math.abs(v) < 1)), 8: run(z, 8, (w) => w.every((v) => Math.abs(v) > 1)) };
  const byPoint = z.map(() => []);
  for (const [r, idx] of Object.entries(hits)) idx.forEach((i) => byPoint[i].push(r));
  return { hits, byPoint, any: byPoint.some((b) => b.length) };
}

// Tabular CUSUM on standardised values (Montgomery, Introduction to Statistical Quality Control, 9.1):
// C⁺ᵢ = max(0, zᵢ − k + C⁺ᵢ₋₁), C⁻ᵢ = max(0, −zᵢ − k + C⁻ᵢ₋₁); signal when either exceeds h. Defaults k = 0.5, h = 5.
export function cusum(z, k = 0.5, h = 5) {
  let cp = 0, cm = 0; const up = [], dn = [], sig = [];
  z.forEach((v, i) => { cp = Math.max(0, v - k + cp); cm = Math.max(0, -v - k + cm); up.push(cp); dn.push(cm); if (cp > h || cm > h) sig.push(i); });
  return { up, dn, signals: sig, first: sig.length ? sig[0] : -1, k, h };
}

// Binary segmentation for changes in the mean (as ruptures.Binseg(model='l2', min_size=2, jump=1)). The cost of a
// segment is its sum of squared deviations; at each step the split with the largest cost reduction is taken while that
// reduction exceeds the penalty. Default penalty: 2σ² ln n, the BIC for a mean change with known σ.
export function binseg(x, pen, minSize = 2) {
  const n = x.length, cs = [0], cs2 = [0];
  x.forEach((v, i) => { cs.push(cs[i] + v); cs2.push(cs2[i] + v * v); });
  const cost = (a, b) => { const m = b - a; if (m <= 0) return 0; const s = cs[b] - cs[a]; return cs2[b] - cs2[a] - (s * s) / m; };
  const bestSplit = (a, b) => {
    let best = null;
    for (let t = a + minSize; t <= b - minSize; t++) { const g = cost(a, b) - cost(a, t) - cost(t, b); if (!best || g > best.gain) best = { t, gain: g }; }
    return best;
  };
  let bkps = [n];
  for (;;) {
    const segs = [0, ...bkps].slice(0, -1).map((a, i) => [a, bkps[i]]);
    let best = null;
    for (const [a, b] of segs) { const s = bestSplit(a, b); if (s && (!best || s.gain > best.gain)) best = s; }
    if (!best || !(best.gain > pen)) break;
    bkps = [...bkps, best.t].sort((p, q) => p - q);
  }
  const cuts = bkps.slice(0, -1);
  const segs = [0, ...cuts].map((a, i) => { const b = [...cuts, n][i]; return { from: a, to: b - 1, mean: (cs[b] - cs[a]) / (b - a), n: b - a }; });
  return { cuts, segments: segs };
}

// Interrupted time series by segmented regression (Wagner et al. 2002): y = b0 + b1·t + b2·Dₜ + b3·(t − T0)·Dₜ,
// t = 1…n, Dₜ = 1 from the first post-change point T0. Plain OLS standard errors (t on n − 4 df) and Newey-West
// standard errors with L = ⌊4(n/100)^(2/9)⌋ lags (normal reference, as statsmodels HAC).
export function its(y, T0, { lags, conf = 0.95 } = {}) {
  const n = y.length;
  if (!(T0 >= 3 && T0 <= n - 2)) return null;
  const X = y.map((_, i) => { const t = i + 1, D = t >= T0 ? 1 : 0; return [1, t, D, D * (t - T0)]; });
  const fit = ols(X, y);
  if (!fit) return null;
  const L = lags ?? Math.floor(4 * (n / 100) ** (2 / 9));
  const nw = neweyWest(X, fit, L);
  const tc = tInv(1 - (1 - conf) / 2, fit.df), zc = normInv(1 - (1 - conf) / 2);
  const names = ['Intercept', 'Pre-change slope', 'Level change', 'Slope change'];
  const coefs = fit.beta.map((b, j) => ({
    name: names[j], b,
    se: fit.se[j], lo: b - tc * fit.se[j], hi: b + tc * fit.se[j], p: tSf2(b / fit.se[j], fit.df),
    nwSe: nw.se[j], nwLo: b - zc * nw.se[j], nwHi: b + zc * nw.se[j], nwP: pFromZ(b / nw.se[j]),
  }));
  // Post slope b1 + b3 and the effect at the last point b2 + b3 (n − T0), with their standard errors.
  const lin = (w, V) => Math.sqrt(w.reduce((s, wi, i) => s + w.reduce((t, wj, j) => t + wi * wj * V[i][j], 0), 0));
  const wPost = [0, 1, 0, 1], wEnd = [0, 0, 1, n - T0];
  const post = { b: fit.beta[1] + fit.beta[3], se: lin(wPost, fit.cov), nwSe: lin(wPost, nw.cov) };
  const end = { b: fit.beta[2] + fit.beta[3] * (n - T0), se: lin(wEnd, fit.cov), nwSe: lin(wEnd, nw.cov) };
  const e = fit.resid, dw = e.slice(1).reduce((s, v, i) => s + (v - e[i]) ** 2, 0) / fit.sse;
  const r1 = e.slice(1).reduce((s, v, i) => s + v * e[i], 0) / e.reduce((s, v) => s + v * v, 0);
  const counterfactual = y.map((_, i) => fit.beta[0] + fit.beta[1] * (i + 1));
  return { coefs, post, end, fit, L, dw, r1, T0, n, counterfactual, conf, df: fit.df };
}

export function analyse(pts, type, { base = 0, rules = 'we', T0 = 0, k = 0.5, h = 5, penalty, penMult = 2 } = {}) {
  if (pts.length < 8) return null;
  const lim = limits(pts, type, base);
  const z = lim.rows.map((r) => r.z);
  const rr = runRules(z, rules);
  const mrSignals = type === 'x' ? lim.rows.map((r, i) => (r.mr > lim.mrUcl ? i : -1)).filter((i) => i >= 0) : [];
  const cs = cusum(z, k, h);
  const xs = lim.rows.map((r) => r.x);
  // Change points on the plotted values; σ is the within-series (moving-range or binomial/Poisson) sigma.
  const s2 = type === 'x' ? lim.sigma ** 2 : lim.rows.reduce((s, r) => s + r.sigma ** 2, 0) / lim.rows.length;
  const pen = penalty ?? penMult * s2 * Math.log(xs.length);
  const bs = s2 > 0 ? binseg(xs, pen) : { cuts: [], segments: [] };
  const ts = T0 ? its(xs, T0) : null;
  return { lim, z, rules: rr, ruleSet: rules, mrSignals, cusum: cs, binseg: { ...bs, pen, s2 }, its: ts, type, n: pts.length };
}

// Examples. XmR: weekly SUS-style task success score with a drop after a release in week 27.
export function exampleX(seed = 5) {
  const r = rng(seed), out = ['# week, task success score'];
  for (let w = 1; w <= 40; w++) { const lvl = w < 27 ? 78 : 73.5; const trend = w < 27 ? 0.04 * w : 0.04 * 26 - 0.05 * (w - 26); out.push(`W${w}, ${(lvl + trend + gauss(r) * 1.6).toFixed(1)}`); }
  return out.join('\n');
}
// p-chart: daily checkout errors out of sessions; u-chart: support contacts per 1,000 orders.
export function exampleP(seed = 9) {
  const r = rng(seed), out = ['# day, sessions with an error, sessions'];
  for (let d = 1; d <= 35; d++) { const n = 900 + Math.floor(r() * 400), p = d < 24 ? 0.042 : 0.058; let x = 0; for (let i = 0; i < n; i++) if (r() < p) x++; out.push(`Day ${d}, ${x}, ${n}`); }
  return out.join('\n');
}
export function exampleU(seed = 13) {
  const r = rng(seed), out = ['# week, support contacts, orders (thousands)'];
  for (let w = 1; w <= 30; w++) { const n = 8 + r() * 6, rate = w < 18 ? 21 : 16.5, lam = rate * n; let x = 0, L = Math.exp(-lam), p = 1; do { x++; p *= r(); } while (p > L); out.push(`W${w}, ${x - 1}, ${n.toFixed(2)}`); }
  return out.join('\n');
}

// ── Reading your results ──
// Confidence rule: "high" with at least 20 baseline points and a signal from rule 1 or a CUSUM/ITS result that agrees;
// "medium" with at least 12 baseline points; "low" otherwise. Limits estimated from fewer than about 20 points are
// themselves uncertain (Wheeler 2000, "Understanding Variation"), so signals near the limits are less trustworthy.
export function summary(a, unit = '') {
  const L = a.lim, sigPts = a.rules.byPoint.map((b, i) => (b.length ? i : -1)).filter((i) => i >= 0);
  const firstSig = sigPts.length ? L.rows[sigPts[0]] : null;
  const rule1 = a.rules.hits[1].length;
  const its = a.its, lvl = its?.coefs[2], slope = its?.coefs[3];
  const itsSig = its && (lvl.nwP < 0.05 || slope.nwP < 0.05);
  const confidence = L.base >= 20 && (rule1 > 0 || (a.cusum.first >= 0 && (!its || itsSig)) || (!a.rules.any && a.cusum.first < 0)) ? 'high' : L.base >= 12 ? 'medium' : 'low';
  const fmtV = (v) => (a.type === 'p' ? `${(v * 100).toFixed(2)}%` : `${sig(v, 4)}${unit}`);
  const num3 = (v) => (a.type === 'p' ? sig(v * 100, 3) : sig(v, 3)), unitD = a.type === 'p' ? ' percentage points' : '';
  const cps = a.binseg.segments;
  const meaning = [
    a.rules.any
      ? `${sigPts.length} point${sigPts.length > 1 ? 's' : ''} trigger a ${a.ruleSet === 'we' ? 'Western Electric' : 'Nelson'} rule, the first at ${firstSig.label} (rule ${a.rules.byPoint[sigPts[0]].join(', ')}). A rule signal means the process has probably changed (a special cause), not routine noise.`
      : `No point triggers a ${a.ruleSet === 'we' ? 'Western Electric' : 'Nelson'} rule: the variation is consistent with a stable process (common-cause noise).`,
    `Centre line ${fmtV(L.center)}${a.type === 'x' ? `, natural process limits ${fmtV(L.rows[0].lcl)} to ${fmtV(L.rows[0].ucl)} (from ${L.base} points)` : `; limits vary with each point's sample size (from ${L.base} points)`}.`,
    cps.length > 1 ? `Binary segmentation finds ${cps.length - 1} change point${cps.length > 2 ? 's' : ''}: ${cps.map((s) => `${L.rows[s.from].label}–${L.rows[s.to].label} mean ${fmtV(s.mean)}`).join('; ')}.` : 'Binary segmentation finds no change in the mean larger than its penalty.',
    a.cusum.first >= 0 ? `The CUSUM (k = ${a.cusum.k}, h = ${a.cusum.h}) first signals at ${L.rows[a.cusum.first].label}; CUSUM detects small sustained shifts sooner than the 3σ limits.` : `The CUSUM (k = ${a.cusum.k}, h = ${a.cusum.h}) does not signal.`,
  ];
  if (its) meaning.push(`Interrupted time series from ${L.rows[its.T0 - 1].label}: level change ${num3(lvl.b)}${unitD} (Newey-West 95% CI ${num3(lvl.nwLo)} to ${num3(lvl.nwHi)}, ${pText(lvl.nwP)}), slope change ${num3(slope.b)}${unitD} per period (${pText(slope.nwP)}).`);
  const head = a.rules.any
    ? `Special-cause signal: ${sigPts.length} point${sigPts.length > 1 ? 's' : ''} break the run rules, first at ${firstSig.label}${cps.length > 1 ? `, and the mean moves from ${fmtV(cps[0].mean)} in the first segment to ${fmtV(cps[cps.length - 1].mean)} in the last` : ''}.`
    : `No special-cause signal: all ${a.n} points stay within the run rules around a centre of ${fmtV(L.center)}.`;
  return {
    headline: head,
    meaning: meaning.slice(0, 6),
    confidence,
    confidenceNote: `Rule: strong when the limits come from at least 20 points and the signal is clear (a point beyond 3σ, or CUSUM and the interrupted time series agree) or there is no signal at all; some evidence with 12 to 19 baseline points; weak with fewer. Here: ${L.base} baseline points.`,
    caveats: [
      'Run rules raise false alarms on long series: with all eight Nelson rules, a stable process of 100 points will often trigger one by chance. Look for signals that line up with a known change.',
      a.type === 'x' ? 'XmR limits assume the points are independent. Strong autocorrelation (week-to-week carry-over) makes the limits too narrow; the Durbin-Watson value in the interrupted time series shows this.' : 'p- and u-chart limits assume binomial or Poisson variation. If the data vary more than that (overdispersion), most points will look like signals; switch to an XmR chart of the rates.',
    ],
    next: [
      a.rules.any ? 'Find what changed at the first signal (a release, a campaign, a tracking change) before acting on it.' : 'Keep plotting new points against these limits; recalculate the limits only after a confirmed, deliberate change.',
      its ? 'Report the interrupted time series with Newey-West intervals, and check the result against a control series if one exists.' : 'If you know when a change shipped, enter it as the change point to estimate the level and slope change.',
    ],
    report: `${a.type === 'x' ? 'An XmR' : a.type === 'p' ? 'A p' : 'A u'}-chart of ${a.n} points (centre ${fmtV(L.center)}, limits from ${L.base} points) ${a.rules.any ? `showed a special-cause signal from ${firstSig.label} (${a.ruleSet === 'we' ? 'Western Electric' : 'Nelson'} rule ${a.rules.byPoint[sigPts[0]].join(', ')})` : 'showed no special-cause signal'}.${its ? ` Segmented regression estimated a level change of ${num3(lvl.b)}${unitD} (Newey-West 95% CI ${num3(lvl.nwLo)} to ${num3(lvl.nwHi)}) and a slope change of ${num3(slope.b)}${unitD} per period.` : ''}`,
  };
}
export { fmt };
