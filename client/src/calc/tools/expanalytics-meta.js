// Meta-analysis: converts study results to a common metric (Hedges' g, log odds ratio, log risk ratio or Fisher's z),
// pools them with fixed-effect and random-effects models (DerSimonian-Laird, REML or Paule-Mandel τ², optional
// Hartung-Knapp), reports Q, I² with a Q-profile interval, τ² and the prediction interval, and checks publication bias
// (Egger's test, Duval and Tweedie trim-and-fill), leave-one-out influence and moderator subgroups.
// Pure functions with no React; `npm run check:expanalytics` checks them against metafor's published output for
// dat.bcg and dat.egger2001, statsmodels combine_effects and PythonMeta.
import { sum, normSf, normInv, tCrit, tSf2, chi2Sf, chi2Inv, fmt, pText, toNumber } from './expanalytics-core.js';

export const METRICS = {
  smd: { name: "Hedges' g", null: 0, back: (x) => x, backName: "Hedges' g" },
  logor: { name: 'log odds ratio', null: 0, back: Math.exp, backName: 'odds ratio' },
  logrr: { name: 'log risk ratio', null: 0, back: Math.exp, backName: 'risk ratio' },
  z: { name: "Fisher's z", null: 0, back: Math.tanh, backName: 'correlation r' },
};
const TYPES = { means: 6, props: 4, d: 3, g: 3, r: 2, es: 2 };
const J = (df) => 1 - 3 / (4 * df - 1); // Hedges' small-sample correction (Borenstein et al. 2009, eq. 4.22)

// One row per study: "Study, type, numbers…, moderator". Types: means (m1, sd1, n1, m2, sd2, n2), props (events1, n1,
// events2, n2), d or g (value, n1, n2), r (r, n), es (effect, SE on the chosen metric). A trailing non-number is the
// moderator. Group 1 is the treatment (or new design), group 2 the comparison.
export function parseStudies(text) {
  const rows = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const parts = s.split(/\t|,|;/).map((x) => x.trim()).filter((x, j, a) => x !== '' || j < a.length - 1);
    const type = String(parts[1] || '').toLowerCase();
    if (!TYPES[type]) { if (!(i === 0 && /type/i.test(parts[1] || ''))) bad.push(i + 1); return; }
    const rest = parts.slice(2);
    const nums = rest.slice(0, TYPES[type]).map(toNumber);
    const mod = rest[TYPES[type]] ?? '';
    if (nums.length < TYPES[type] || nums.some((v) => !Number.isFinite(v))) { bad.push(i + 1); return; }
    rows.push({ study: parts[0] || `Study ${rows.length + 1}`, type, v: nums, mod: String(mod).trim(), line: i + 1 });
  });
  return { rows, bad };
}

// Effect size and sampling variance on the chosen metric (Borenstein, Hedges, Higgins and Rothstein 2009, ch. 4–7).
export function effectOf(row, metric) {
  const { type, v } = row;
  let d, vd, n1, n2, N;
  // Two-group designs (means, d, g): g = J·d with the Cochrane/RevMan variance N/(n₁n₂) + g²/(2(N − 3.94)), as
  // statsmodels effectsize_smd and PythonMeta. Effects converted from odds ratios or correlations use J² V_d.
  const twoGroup = type === 'means' || type === 'd' || type === 'g';
  const fromD = () => {
    if (metric === 'smd') { const j = J(N - 2), g = j * d; return { yi: g, vi: twoGroup ? N / (n1 * n2) + (g * g) / (2 * (N - 3.94)) : j * j * vd, N }; }
    if (metric === 'logor') return { yi: (d * Math.PI) / Math.sqrt(3), vi: (vd * Math.PI ** 2) / 3, N };
    if (metric === 'z') { const a = n1 && n2 ? (n1 + n2) ** 2 / (n1 * n2) : 4; const r = d / Math.sqrt(d * d + a); return { yi: Math.atanh(r), vi: 1 / (N - 3), N }; }
    return null;
  };
  if (type === 'es') return v[1] > 0 ? { yi: v[0], vi: v[1] ** 2, N: NaN } : null;
  if (type === 'means') {
    const [m1, s1, a, m2, s2, b] = v; n1 = a; n2 = b; N = a + b;
    if (!(s1 > 0 && s2 > 0 && a > 1 && b > 1)) return null;
    const sp = Math.sqrt(((a - 1) * s1 * s1 + (b - 1) * s2 * s2) / (N - 2));
    d = (m1 - m2) / sp; vd = N / (a * b) + (d * d) / (2 * N);
    return fromD();
  }
  if (type === 'd' || type === 'g') {
    [d, n1, n2] = v; N = n1 + n2; if (!(n1 > 1 && n2 > 1)) return null;
    if (type === 'g') d /= J(N - 2);
    vd = N / (n1 * n2) + (d * d) / (2 * N);
    return fromD();
  }
  if (type === 'r') {
    const [r, n] = v; N = n; if (!(Math.abs(r) < 1 && n > 3)) return null;
    if (metric === 'z') return { yi: Math.atanh(r), vi: 1 / (n - 3), N };
    const vr = (1 - r * r) ** 2 / (n - 1);
    d = (2 * r) / Math.sqrt(1 - r * r); vd = (4 * vr) / (1 - r * r) ** 3;
    return fromD();
  }
  if (type === 'props') {
    let [x1, a, x2, b] = v; N = a + b; n1 = a; n2 = b;
    if (!(a > 0 && b > 0 && x1 >= 0 && x2 >= 0 && x1 <= a && x2 <= b)) return null;
    if (metric === 'logrr') {
      if (x1 === 0 || x2 === 0) { x1 += 0.5; x2 += 0.5; a += 1; b += 1; }
      return { yi: Math.log((x1 / a) / (x2 / b)), vi: 1 / x1 - 1 / a + 1 / x2 - 1 / b, N };
    }
    let c1 = x1, c2 = a - x1, c3 = x2, c4 = b - x2;
    if ([c1, c2, c3, c4].some((c) => c === 0)) { c1 += 0.5; c2 += 0.5; c3 += 0.5; c4 += 0.5; }
    const lor = Math.log((c1 * c4) / (c2 * c3)), vl = 1 / c1 + 1 / c2 + 1 / c3 + 1 / c4;
    if (metric === 'logor') return { yi: lor, vi: vl, N };
    d = (lor * Math.sqrt(3)) / Math.PI; vd = (vl * 3) / Math.PI ** 2;
    return fromD();
  }
  return null;
}
export function prepare(rows, metric) {
  const studies = [], skipped = [];
  for (const r of rows) {
    if (metric === 'logrr' && !['props', 'es'].includes(r.type)) { skipped.push({ ...r, why: 'risk ratios need event counts' }); continue; }
    const e = effectOf(r, metric);
    if (!e || !Number.isFinite(e.yi) || !(e.vi > 0)) { skipped.push({ ...r, why: 'values out of range' }); continue; }
    studies.push({ study: r.study, mod: r.mod, type: r.type, ...e });
  }
  return { studies, skipped };
}

// ── Pooling ──
const genQ = (ys, vs, t2) => { const w = vs.map((v) => 1 / (v + t2)), W = sum(w), mu = sum(w.map((x, i) => x * ys[i])) / W; return sum(w.map((x, i) => x * (ys[i] - mu) ** 2)); };
export function tau2DL(ys, vs) {
  const w = vs.map((v) => 1 / v), W = sum(w), W2 = sum(w.map((x) => x * x));
  const Q = genQ(ys, vs, 0), k = ys.length;
  return Math.max(0, (Q - (k - 1)) / (W - W2 / W));
}
// REML by Fisher scoring (Viechtbauer 2005), started from DL, truncated at 0.
export function tau2REML(ys, vs) {
  let t2 = tau2DL(ys, vs);
  for (let it = 0; it < 500; it++) {
    const w = vs.map((v) => 1 / (v + t2)), W = sum(w), mu = sum(w.map((x, i) => x * ys[i])) / W;
    // P = W − w wᵀ/Σw; score and information for τ².
    const w2 = sum(w.map((x) => x * x)), w3 = sum(w.map((x) => x ** 3));
    const Py = ys.map((y, i) => w[i] * (y - mu));
    const trP = W - w2 / W, trPP = w2 - (2 * w3) / W + (w2 / W) ** 2;
    const score = sum(Py.map((x) => x * x)) - trP;
    const step = score / trPP;
    let next = t2 + step;
    if (next < 0) next = 0;
    if (Math.abs(next - t2) < 1e-12) { t2 = next; break; }
    t2 = next;
  }
  return t2;
}
// Paule-Mandel: the τ² at which the generalised Q equals k − 1.
export function tau2PM(ys, vs) {
  const k = ys.length; if (genQ(ys, vs, 0) <= k - 1) return 0;
  let lo = 0, hi = 1; while (genQ(ys, vs, hi) > k - 1) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (genQ(ys, vs, m) > k - 1) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const TAU = { dl: tau2DL, reml: tau2REML, pm: tau2PM };
export function pool(studies, { method = 'reml', hk = false, conf = 0.95 } = {}) {
  const ys = studies.map((s) => s.yi), vs = studies.map((s) => s.vi), k = ys.length;
  const z = normInv(1 - (1 - conf) / 2);
  const w = vs.map((v) => 1 / v), W = sum(w), muF = sum(w.map((x, i) => x * ys[i])) / W, seF = Math.sqrt(1 / W);
  const Q = sum(w.map((x, i) => x * (ys[i] - muF) ** 2)), df = k - 1;
  const t2 = k > 1 ? TAU[method](ys, vs) : 0;
  const ws = vs.map((v) => 1 / (v + t2)), Ws = sum(ws), muR = sum(ws.map((x, i) => x * ys[i])) / Ws;
  let seR = Math.sqrt(1 / Ws), crit = z, dfR = Infinity;
  if (hk && k > 1) { const q = sum(ws.map((x, i) => x * (ys[i] - muR) ** 2)) / (k - 1); seR = Math.sqrt(q / Ws); crit = tCrit(conf, k - 1); dfR = k - 1; }
  const statR = muR / seR, pR = Number.isFinite(dfR) ? tSf2(statR, dfR) : 2 * normSf(Math.abs(statR));
  // Typical within-study variance (Higgins and Thompson 2002) and I² = τ²/(τ² + s²); with DL this equals (Q − df)/Q.
  const s2 = ((k - 1) * W) / (W * W - sum(w.map((x) => x * x)));
  const i2 = t2 / (t2 + s2), h2 = (t2 + s2) / s2;
  // Q-profile interval for τ² (Viechtbauer 2007), and the matching I² and H² bounds.
  const qp = (target) => { if (genQ(ys, vs, 0) < target) return 0; let lo = 0, hi = 1; while (genQ(ys, vs, hi) > target && hi < 1e8) hi *= 2; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (genQ(ys, vs, m) > target) lo = m; else hi = m; } return (lo + hi) / 2; };
  const t2lo = k > 1 ? qp(chi2Inv(1 - (1 - conf) / 2, df)) : 0, t2hi = k > 1 ? qp(chi2Inv((1 - conf) / 2, df)) : 0;
  // Prediction interval: μ ± t_{k−2}·√(τ² + SE²) (Higgins, Thompson and Spiegelhalter 2009); metafor's default uses z.
  const piSe = Math.sqrt(t2 + seR * seR), tPI = k > 2 ? tCrit(conf, k - 2) : NaN;
  return {
    k, method, hk, Q, df, pQ: k > 1 ? chi2Sf(Q, df) : 1, tau2: t2, tau: Math.sqrt(t2), i2, h2, s2,
    tau2CI: [t2lo, t2hi], i2CI: [t2lo / (t2lo + s2), t2hi / (t2hi + s2)], h2CI: [(t2lo + s2) / s2, (t2hi + s2) / s2],
    fixed: { est: muF, se: seF, lo: muF - z * seF, hi: muF + z * seF, z: muF / seF, p: 2 * normSf(Math.abs(muF / seF)) },
    random: { est: muR, se: seR, lo: muR - crit * seR, hi: muR + crit * seR, stat: statR, p: pR, df: dfR },
    pi: { lo: muR - tPI * piSe, hi: muR + tPI * piSe }, piZ: { lo: muR - z * Math.sqrt(t2 + seR * seR), hi: muR + z * Math.sqrt(t2 + seR * seR) },
    weightsF: w.map((x) => x / W), weightsR: ws.map((x) => x / Ws),
  };
}

// ── Publication bias ──
// Egger's regression: y/se on 1/se by OLS; the intercept tests asymmetry on k − 2 df. Identical to metafor's
// regtest(model = "lm"), whose "limit estimate" is the slope here.
export function egger(studies, conf = 0.95) {
  const k = studies.length; if (k < 3) return null;
  const X = studies.map((s) => 1 / Math.sqrt(s.vi)), Y = studies.map((s) => s.yi / Math.sqrt(s.vi));
  const mx = sum(X) / k, my = sum(Y) / k, sxx = sum(X.map((x) => (x - mx) ** 2)), sxy = sum(X.map((x, i) => (x - mx) * (Y[i] - my)));
  const slope = sxy / sxx, b0 = my - slope * mx;
  const rss = sum(Y.map((y, i) => (y - b0 - slope * X[i]) ** 2)), s2 = rss / (k - 2);
  const seB0 = Math.sqrt(s2 * (1 / k + (mx * mx) / sxx)), seB1 = Math.sqrt(s2 / sxx);
  const t = b0 / seB0, tc = tCrit(conf, k - 2);
  return { intercept: b0, se: seB0, t, df: k - 2, p: tSf2(t, k - 2), limit: slope, limitLo: slope - tc * seB1, limitHi: slope + tc * seB1 };
}
// Trim-and-fill (Duval and Tweedie 2000) with the L0 or R0 estimator, following metafor's trimfill: the side is taken
// from the sign of Egger's slope of y on se (positive → studies missing on the left), the k0 most extreme studies on the
// other side are trimmed, the model refitted, and the loop repeats until k0 is stable. The k0 trimmed studies are then
// mirrored around the trimmed estimate and the model is refitted with them.
export function trimFill(studies, { model = 'random', method = 'reml', estimator = 'L0', side = null } = {}) {
  const k = studies.length; if (k < 3) return null;
  const fit = (ss) => { const r = pool(ss, { method }); return model === 'fixed' ? r.fixed.est : r.random.est; };
  // Weighted regression of y on se (weights 1/v): sign of the slope.
  if (!side) {
    const w = studies.map((s) => 1 / s.vi), x = studies.map((s) => Math.sqrt(s.vi)), y = studies.map((s) => s.yi), W = sum(w);
    const mx = sum(w.map((wi, i) => wi * x[i])) / W, my = sum(w.map((wi, i) => wi * y[i])) / W;
    const slope = sum(w.map((wi, i) => wi * (x[i] - mx) * (y[i] - my))) / sum(w.map((wi, i) => wi * (x[i] - mx) ** 2));
    side = slope < 0 ? 'right' : 'left';
  }
  const sgn = side === 'right' ? -1 : 1;
  const sorted = studies.map((s) => ({ ...s, yf: sgn * s.yi })).sort((a, b) => a.yf - b.yf);
  let k0 = 0, prev = -1, iter = 0, beta = 0, se = NaN;
  while (k0 !== prev && iter < 100) {
    prev = k0; iter++;
    const kept = sorted.slice(0, k - k0);
    beta = fit(kept.map((s) => ({ ...s, yi: s.yf })));
    const c = sorted.map((s) => s.yf - beta);
    const order = c.map((v, i) => [Math.abs(v), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const rank = new Array(k); order.forEach(([, i], r) => { rank[i] = r + 1; });
    const signed = c.map((v, i) => Math.sign(v) * rank[i]);
    let est;
    if (estimator === 'R0') {
      const negs = signed.filter((v) => v < 0).map((v) => -v);
      est = k - (negs.length ? Math.max(...negs) : 0) - 1;
      se = Math.sqrt(2 * Math.max(0, est) + 2);
    } else {
      const Sr = sum(signed.filter((v) => v > 0));
      est = (4 * Sr - k * (k + 1)) / (2 * k - 1);
      const varSr = (k * (k + 1) * (2 * k + 1) + 10 * est ** 3 + 27 * est ** 2 + 17 * est - 18 * k * est ** 2 - 18 * k * est + 6 * k * k * est) / 24;
      se = (4 * Math.sqrt(Math.max(0, varSr))) / (2 * k - 1);
    }
    k0 = Math.max(0, Math.round(est));
  }
  const filled = sorted.slice(k - k0).map((s) => ({ study: `Filled (mirror of ${s.study})`, yi: sgn * (2 * beta - s.yf), vi: s.vi, filled: true }));
  const all = [...studies, ...filled];
  const res = pool(all, { method });
  return { side, k0, se, pR0: estimator === 'R0' ? 0.5 ** (k0 + 1) : NaN, filled, pooled: res, est: model === 'fixed' ? res.fixed : res.random, iter };
}
export function leaveOneOut(studies, opts) {
  return studies.map((s, i) => { const r = pool(studies.filter((_, j) => j !== i), opts); return { study: s.study, est: r.random.est, lo: r.random.lo, hi: r.random.hi, p: r.random.p, i2: r.i2, tau2: r.tau2 }; });
}
// Subgroups: a separate random-effects model (own τ²) per moderator level, and Q_between = Σ (μ_g − μ̄)²/SE_g² on G − 1 df
// (Borenstein et al. 2009, ch. 19, separate τ² estimates).
export function subgroups(studies, opts) {
  const levels = [...new Set(studies.map((s) => s.mod).filter(Boolean))];
  if (levels.length < 2) return null;
  const groups = levels.map((g) => { const ss = studies.filter((s) => s.mod === g); const r = pool(ss, opts); return { level: g, k: ss.length, est: r.random.est, se: r.random.se, lo: r.random.lo, hi: r.random.hi, tau2: r.tau2, i2: r.i2 }; });
  const w = groups.map((g) => 1 / g.se ** 2), W = sum(w), mu = sum(w.map((x, i) => x * groups[i].est)) / W;
  const Qb = sum(w.map((x, i) => x * (groups[i].est - mu) ** 2)), df = groups.length - 1;
  return { groups, Qb, df, p: chi2Sf(Qb, df), untagged: studies.filter((s) => !s.mod).length };
}

// ── Reading your results ──
// Confidence rule: "high" when k ≥ 10, the random-effects CI excludes the null, Egger's p ≥ 0.10 and leaving out any one
// study never changes whether the CI excludes the null; "low" when k < 5, or Egger's p < 0.10 and trim-and-fill moves the
// estimate so its CI includes the null; "medium" otherwise.
export function metaSummary({ r, metric, eg, tf, loo, sub, studies }) {
  const M = METRICS[metric], bk = (x) => M.back(x), isRatio = metric === 'logor' || metric === 'logrr';
  const show = (x) => fmt(bk(x), isRatio ? 2 : 3);
  const sig = r.random.lo > 0 || r.random.hi < 0;
  const flip = loo.some((l) => (l.lo > 0 || l.hi < 0) !== sig);
  const tfSig = tf ? tf.est.lo > 0 || tf.est.hi < 0 : sig;
  const asym = eg && eg.p < 0.1;
  const confidence = r.k < 5 || (asym && tfSig !== sig) ? 'low' : r.k >= 10 && sig && !asym && !flip ? 'high' : 'medium';
  const ci = `95% CI ${show(r.random.lo)} to ${show(r.random.hi)}`;
  const piTxt = r.k > 2 ? `${show(r.pi.lo)} to ${show(r.pi.hi)}` : 'not available with fewer than 3 studies';
  const meaning = [
    `Across ${r.k} studies the random-effects ${M.backName} is ${show(r.random.est)} (${ci}${r.hk ? ', Hartung-Knapp' : ''}). ${sig ? 'The interval excludes no effect.' : 'The interval includes no effect.'}`,
    `Heterogeneity: Q(${r.df}) = ${fmt(r.Q)}, ${pText(r.pQ)}; I² = ${fmt(r.i2 * 100, 0)}% (95% CI ${fmt(r.i2CI[0] * 100, 0)}% to ${fmt(r.i2CI[1] * 100, 0)}%); τ = ${fmt(r.tau, 3)}. I² is the share of the observed spread that is real rather than sampling error, not how big the differences are; τ and the prediction interval show that.`,
    `The 95% prediction interval, where the effect in a new comparable study would be expected to fall, is ${piTxt}.`,
  ];
  if (eg) meaning.push(`Egger's test ${asym ? 'suggests' : 'does not suggest'} small-study asymmetry (intercept ${fmt(eg.intercept, 2)}, t(${eg.df}) = ${fmt(eg.t, 2)}, ${pText(eg.p)}). Trim-and-fill estimates ${tf.k0} missing ${tf.k0 === 1 ? 'study' : 'studies'} on the ${tf.side}${tf.k0 ? `, adjusting the estimate to ${show(tf.est.est)}` : ''}.`);
  if (sub) meaning.push(`Subgroups by moderator ${sub.p < 0.05 ? 'differ' : 'do not differ significantly'} (Q_between(${sub.df}) = ${fmt(sub.Qb)}, ${pText(sub.p)}): ${sub.groups.map((g) => `${g.level} ${show(g.est)} (k = ${g.k})`).join('; ')}.`);
  return {
    headline: `Pooled ${M.backName}: ${show(r.random.est)} (${ci}) from ${r.k} studies, with ${r.i2 >= 0.75 ? 'high' : r.i2 >= 0.5 ? 'substantial' : r.i2 >= 0.25 ? 'moderate' : 'low'} heterogeneity (I² = ${fmt(r.i2 * 100, 0)}%).`,
    meaning: meaning.slice(0, 6),
    confidence,
    confidenceNote: 'Rule: strong with 10 or more studies when the interval excludes no effect, Egger\'s p ≥ 0.10 and no single study changes that conclusion; weak with fewer than 5 studies, or when there is asymmetry and trim-and-fill changes the conclusion; some otherwise.',
    caveats: [
      'I² is not the size of the heterogeneity in absolute terms: with very precise studies, small real differences give a high I². Read τ and the prediction interval for how much effects vary.',
      'A pooled estimate can hide real differences: if the prediction interval crosses no effect, some settings may see no benefit or harm.',
      'Publication-bias tests have little power with fewer than 10 studies, and asymmetry can come from real differences between small and large studies, not only from bias.',
    ],
    next: [
      flip ? 'The result depends on a single study: check the leave-one-out table and that study\'s quality before relying on the pooled value.' : 'Report the pooled estimate with its CI, the prediction interval, τ and I² together.',
      'Look at the forest plot for outliers and code moderators (method, population, product) to explain the spread.',
    ],
    report: `A random-effects meta-analysis (${r.method === 'dl' ? 'DerSimonian-Laird' : r.method === 'reml' ? 'REML' : 'Paule-Mandel'} τ²${r.hk ? ', Hartung-Knapp' : ''}) of ${r.k} studies gave a pooled ${M.backName} of ${show(r.random.est)} (${ci}; ${pText(r.random.p)}); Q(${r.df}) = ${fmt(r.Q)}, I² = ${fmt(r.i2 * 100, 0)}%, τ² = ${fmt(r.tau2, 3)}; 95% prediction interval ${piTxt}.${eg ? ` Egger's test ${pText(eg.p)}.` : ''}`,
  };
}
