// Reaction-time analysis: trimming (absolute, SD, MAD), the ex-Gaussian fitted by maximum likelihood, EZ-diffusion
// (Wagenmakers, van der Maas and Grasman 2007) and visual-search slopes. Pure functions; checked by
// server/scripts/check-signals.js against scipy and the EZ paper's worked example.
import { nelderMead, logNormCdf, normCdf, ols, tInv, tSf2, solve, toNum, parseLines, rng, gauss, median, quantileSorted, fmt, sig, intText, pctText, pText } from './signals-core.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const isCorrect = (v) => (v === undefined || v === '' ? 1 : ['1', 'yes', 'true', 'correct', 'c', 'y'].includes(String(v).toLowerCase()) ? 1 : ['0', 'no', 'false', 'error', 'incorrect', 'e', 'n'].includes(String(v).toLowerCase()) ? 0 : NaN);

// Trials: "rt[, correct][, condition]" (distribution); "condition, rt, correct" (EZ); "condition, set size, rt[, correct]" (search).
export function parseTrials(text, layout) {
  const rows = [], bad = [];
  parseLines(text, /\t|,|;/).forEach((c, i) => {
    let r;
    if (layout === 'dist') r = { rt: toNum(c[0]), correct: isCorrect(c[1]), cond: c[2] || '' };
    else if (layout === 'ez') r = { cond: c[0], rt: toNum(c[1]), correct: isCorrect(c[2]) };
    else r = { cond: c[0], size: toNum(c[1]), rt: toNum(c[2]), correct: isCorrect(c[3]) };
    if (!Number.isFinite(r.rt) || !Number.isFinite(r.correct) || (layout === 'search' && !Number.isFinite(r.size)) || (layout !== 'dist' && !r.cond)) { if (i > 0 || Number.isFinite(toNum(c[0]))) bad.push(i + 1); }
    else rows.push(r);
  });
  return { rows, bad };
}

// ── Trimming ──
// absolute: keep lo ≤ rt ≤ hi. sd: keep |rt − mean| ≤ k·SD (one pass). mad: keep |rt − median| ≤ k·1.4826·MAD
// (Leys et al. 2013 recommend k = 2.5).
export function trim(rts, { method = 'none', lo = 0, hi = Infinity, k = 2.5 } = {}) {
  let keep;
  if (method === 'absolute') keep = rts.map((v) => v >= lo && v <= hi);
  else if (method === 'sd') { const m = mean(rts), s = sd(rts); keep = rts.map((v) => Math.abs(v - m) <= k * s); }
  else if (method === 'mad') { const md = median(rts), mad = 1.4826 * median(rts.map((v) => Math.abs(v - md))); keep = rts.map((v) => Math.abs(v - md) <= k * mad); }
  else keep = rts.map(() => true);
  const kept = rts.filter((_, i) => keep[i]);
  return { kept, removed: rts.length - kept.length, keep, below: rts.filter((v, i) => !keep[i] && v < median(rts)).length };
}
export function describe(rts) {
  const s = [...rts].sort((a, b) => a - b), n = s.length, m = mean(s), v = sd(s);
  const skew = (s.reduce((a, x) => a + (x - m) ** 3, 0) / n) / ((s.reduce((a, x) => a + (x - m) ** 2, 0) / n) ** 1.5);
  return { n, mean: m, sd: v, median: quantileSorted(s, 0.5), q10: quantileSorted(s, 0.1), q90: quantileSorted(s, 0.9), min: s[0], max: s[n - 1], skew };
}

// ── Ex-Gaussian: X = Normal(μ, σ) + Exponential(τ) ──
// log f(x) = −ln τ + (μ − x)/τ + σ²/(2τ²) + ln Φ((x − μ)/σ − σ/τ). Fitted by Nelder-Mead on (μ, ln σ, ln τ) from
// method-of-moments starting values; standard errors from the numerical Hessian of the log-likelihood.
export const exgLogPdf = (x, mu, s, tau) => -Math.log(tau) + (mu - x) / tau + (s * s) / (2 * tau * tau) + logNormCdf((x - mu) / s - s / tau);
export const exgPdf = (x, mu, s, tau) => Math.exp(exgLogPdf(x, mu, s, tau));
export function exGaussian(rts) {
  const n = rts.length;
  if (n < 10) return null;
  const d = describe(rts);
  const tau0 = d.skew > 0 ? d.sd * Math.max(0.2, Math.min(0.95, Math.cbrt(d.skew / 2))) : 0.2 * d.sd;
  const sig0 = Math.sqrt(Math.max(d.sd * d.sd - tau0 * tau0, (0.2 * d.sd) ** 2));
  const nll = ([mu, ls, lt]) => { const s = Math.exp(ls), t = Math.exp(lt); let ll = 0; for (const x of rts) ll += exgLogPdf(x, mu, s, t); return Number.isFinite(ll) ? -ll : 1e300; };
  let best = nelderMead(nll, [d.mean - tau0, Math.log(sig0), Math.log(tau0)], { step: 0.3, tol: 1e-14, maxIter: 6000 });
  for (let r = 0; r < 3; r++) { const again = nelderMead(nll, best.x, { step: 0.05, tol: 1e-15, maxIter: 6000 }); if (again.f >= best.f - 1e-10) { best = again; break; } best = again; }
  const [mu, ls, lt] = best.x, s = Math.exp(ls), tau = Math.exp(lt);
  // Hessian of the negative log-likelihood in (μ, σ, τ).
  const f = ([a, b, c]) => (b > 0 && c > 0 ? nll([a, Math.log(b), Math.log(c)]) : 1e300);
  const p = [mu, s, tau], h = p.map((v) => Math.max(1e-4, Math.abs(v) * 1e-4));
  const H = p.map((_, i) => p.map((__, j) => {
    const e = (di, dj) => { const q = [...p]; q[i] += di; q[j] += dj; return f(q); };
    return i === j ? (e(h[i], 0) - 2 * f(p) + e(-h[i], 0)) / (h[i] * h[i]) : (e(h[i], h[j]) - e(h[i], -h[j]) - e(-h[i], h[j]) + e(-h[i], -h[j])) / (4 * h[i] * h[j]);
  }));
  const inv = solve(H, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const se = inv ? inv.map((r, i) => Math.sqrt(Math.max(0, r[i]))) : [NaN, NaN, NaN];
  return { mu, sigma: s, tau, se: { mu: se[0], sigma: se[1], tau: se[2] }, logLik: -best.f, n, mean: mu + tau, tauShare: tau / (mu + tau) };
}
export function histogram(rts, bins = 30) {
  const s = [...rts].sort((a, b) => a - b), lo = s[0], hi = quantileSorted(s, 0.995), w = (hi - lo) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  s.forEach((v) => { if (v <= hi) out[Math.min(bins - 1, Math.floor((v - lo) / w))].count++; });
  out.forEach((b) => { b.density = b.count / (s.length * w); });
  return out;
}

// ── EZ-diffusion (Wagenmakers et al. 2007), scaling s = 0.1, RTs in seconds ──
// L = logit(Pc); x = L(L·Pc² − L·Pc + Pc − ½)/VRT; v = sign(Pc − ½)·s·x^¼; a = s²L/v; y = −va/s²;
// MDT = (a/2v)(1 − eʸ)/(1 + eʸ); Ter = MRT − MDT. Pc = 1 uses the edge correction 1 − 1/(2N).
export function ez(Pc, VRT, MRT, { s = 0.1, N } = {}) {
  let p = Pc, corrected = false;
  if (p >= 1 && N) { p = 1 - 1 / (2 * N); corrected = true; }
  if (p <= 0 && N) { p = 1 / (2 * N); corrected = true; }
  if (!(p > 0 && p < 1) || p === 0.5 || !(VRT > 0)) return null;
  const s2 = s * s, L = Math.log(p / (1 - p));
  const x = (L * (L * p * p - L * p + p - 0.5)) / VRT;
  const v = Math.sign(p - 0.5) * s * x ** 0.25, a = (s2 * L) / v, y = (-v * a) / s2;
  const MDT = (a / (2 * v)) * ((1 - Math.exp(y)) / (1 + Math.exp(y)));
  return { v, a, Ter: MRT - MDT, MDT, Pc: p, corrected };
}
// EZ per condition from trials (RTs in ms): Pc = share correct; MRT and VRT of correct RTs in seconds. Bootstrap
// percentile intervals resample trials within the condition.
export function ezConditions(rows, { B = 1000, seed = 1, conf = 0.95 } = {}) {
  const conds = [...new Set(rows.map((r) => r.cond))];
  const r = rng(seed);
  return conds.map((cond) => {
    const tr = rows.filter((x) => x.cond === cond), N = tr.length;
    const stats = (set) => { const c = set.filter((x) => x.correct === 1).map((x) => x.rt / 1000); return c.length > 1 ? { Pc: c.length / set.length, MRT: mean(c), VRT: sd(c) ** 2 } : null; };
    const st = stats(tr), est = st ? ez(st.Pc, st.VRT, st.MRT, { N }) : null;
    const boots = { v: [], a: [], Ter: [] };
    if (est) for (let b = 0; b < B; b++) {
      const res = Array.from({ length: N }, () => tr[Math.floor(r() * N)]), sb = stats(res), e = sb ? ez(sb.Pc, sb.VRT, sb.MRT, { N }) : null;
      if (e) { boots.v.push(e.v); boots.a.push(e.a); boots.Ter.push(e.Ter); }
    }
    const ci = (arr) => { const s = arr.sort((x, y) => x - y); return s.length > 20 ? [quantileSorted(s, (1 - conf) / 2), quantileSorted(s, 1 - (1 - conf) / 2)] : [NaN, NaN]; };
    return { cond, N, ...st, est, ci: est ? { v: ci(boots.v), a: ci(boots.a), Ter: ci(boots.Ter) } : null };
  });
}

// ── Visual search: RT = intercept + slope × set size, per condition (correct trials) ──
export function searchSlopes(rows, conf = 0.95) {
  const conds = [...new Set(rows.map((r) => r.cond))];
  return conds.map((cond) => {
    const tr = rows.filter((r) => r.cond === cond && r.correct === 1);
    const sizes = [...new Set(tr.map((r) => r.size))].sort((a, b) => a - b);
    if (tr.length < 3 || sizes.length < 2) return { cond, n: tr.length, fit: null, means: [] };
    const fit = ols(tr.map((r) => [1, r.size]), tr.map((r) => r.rt));
    const tc = tInv(1 - (1 - conf) / 2, fit.df);
    const means = sizes.map((k) => { const v = tr.filter((r) => r.size === k).map((r) => r.rt); return { size: k, mean: mean(v), n: v.length, se: v.length > 1 ? sd(v) / Math.sqrt(v.length) : NaN }; });
    const all = rows.filter((r) => r.cond === cond);
    return {
      cond, n: tr.length, errors: all.length - tr.length, errorRate: (all.length - tr.length) / all.length, means,
      fit: { intercept: fit.beta[0], slope: fit.beta[1], se: fit.se[1], lo: fit.beta[1] - tc * fit.se[1], hi: fit.beta[1] + tc * fit.se[1], p: tSf2(fit.beta[1] / fit.se[1], fit.df), r2: fit.r2, df: fit.df },
      kind: fit.beta[1] < 10 ? 'efficient' : fit.beta[1] < 20 ? 'intermediate' : 'inefficient',
    };
  });
}

// ── Examples ──
export function exampleDist(seed = 4) {
  const r = rng(seed), out = ['# rt (ms), correct (1/0)'];
  for (let i = 0; i < 220; i++) {
    let rt = 420 + 45 * gauss(r) - 160 * Math.log(1 - r());
    if (i % 53 === 7) rt = 95 + 60 * r();
    if (i % 71 === 3) rt = 2600 + 1500 * r();
    out.push(`${Math.round(rt)}, ${r() < 0.93 ? 1 : 0}`);
  }
  return out.join('\n');
}
export function exampleEz(seed = 8) {
  const r = rng(seed), out = ['# condition, rt (ms), correct (1/0)'];
  const conds = [['Old layout', 0.86, 640, 150], ['New layout', 0.92, 560, 120]];
  for (const [c, pc, base, tau] of conds) for (let i = 0; i < 160; i++) {
    const ok = r() < pc, rt = base + 50 * gauss(r) - tau * Math.log(1 - r()) + (ok ? 0 : 60);
    out.push(`${c}, ${Math.round(rt)}, ${ok ? 1 : 0}`);
  }
  return out.join('\n');
}
export function exampleSearch(seed = 6) {
  const r = rng(seed), out = ['# condition, set size, rt (ms), correct (1/0)'];
  const conds = [['Colour badge (feature)', 520, 2.5], ['Text label only (conjunction)', 560, 24]];
  for (const [c, base, slope] of conds) for (const k of [4, 8, 16, 24]) for (let i = 0; i < 24; i++) {
    const rt = base + slope * k + 60 * gauss(r) - 70 * Math.log(1 - r());
    out.push(`${c}, ${k}, ${Math.round(rt)}, ${r() < 0.95 ? 1 : 0}`);
  }
  return out.join('\n');
}

// ── Reading your results ──
// Confidence rules. Distribution: "high" with at least 100 trials after trimming and a stable fit (all SEs finite and
// τ's SE under a quarter of τ), "medium" with 40 or more, else "low"; the ex-Gaussian needs about 100 trials for stable
// τ estimates (Ratcliff 1979; Heathcote, Brown and Mewhort 2002 show bias below about 40). EZ: "high" with at least
// 100 trials per condition and no edge correction, "medium" with 40, else "low" (Wagenmakers et al. 2007 simulate 50
// to 1,000 trials). Search: "high" when every slope interval is narrower than 10 ms per item, "medium" under 20, else low.
export function distSummary(d, fit, t) {
  const stable = fit && Number.isFinite(fit.se.tau) && fit.se.tau < fit.tau / 4;
  const confidence = d.n >= 100 && stable ? 'high' : d.n >= 40 && fit ? 'medium' : 'low';
  const meaning = [
    `After trimming (${t.method === 'none' ? 'none' : t.method === 'absolute' ? `kept ${t.lo} to ${t.hi} ms` : t.method === 'sd' ? `within ${t.k} SD of the mean` : `within ${t.k} MADs of the median`}), ${intText(d.n)} trials remain (${intText(t.removed)} removed). Median ${fmt(d.median, 0)} ms, mean ${fmt(d.mean, 0)} ms: the mean is above the median because RTs are skewed to the right (skewness ${fmt(d.skew, 2)}).`,
  ];
  if (fit) meaning.push(`Ex-Gaussian fit: μ = ${fmt(fit.mu, 0)} ms (SE ${fmt(fit.se.mu, 1)}), σ = ${fmt(fit.sigma, 0)} ms (SE ${fmt(fit.se.sigma, 1)}), τ = ${fmt(fit.tau, 0)} ms (SE ${fmt(fit.se.tau, 1)}). μ and σ describe the typical, fast responses; τ describes the slow tail and makes up ${pctText(fit.tauShare, 0)} of the mean. A design change that raises τ but not μ adds occasional long hesitations rather than slowing everyone down.`);
  meaning.push(`10th to 90th percentile: ${fmt(d.q10, 0)} to ${fmt(d.q90, 0)} ms.`);
  return {
    headline: fit ? `Typical responses take about ${fmt(fit.mu, 0)} ms (μ), with a slow tail of τ = ${fmt(fit.tau, 0)} ms; median ${fmt(d.median, 0)} ms over ${intText(d.n)} trials.` : `Median ${fmt(d.median, 0)} ms over ${intText(d.n)} trials; too few trials for an ex-Gaussian fit.`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong with at least 100 trials after trimming and a stable fit (τ's standard error under a quarter of τ); some evidence from 40 trials; weak below that. Ex-Gaussian parameters are unstable with fewer than about 40 to 100 trials (Heathcote, Brown and Mewhort 2002). Here: ${intText(d.n)} trials.`,
    caveats: [
      'Trimming changes the answer: SD-based cut-offs remove more of the slow tail (and shrink τ) than MAD-based or absolute cut-offs. Choose the rule before looking at the results and report it.',
      'Ex-Gaussian parameters are descriptive. τ is not a pure measure of any single mental process (Matzke and Wagenmakers 2009).',
    ],
    next: [
      'Compare conditions on μ and τ separately rather than on the mean alone.',
      'Fit per participant and compare across participants, rather than pooling everyone\'s trials into one distribution.',
    ],
    report: `Response times (${intText(d.n)} trials after ${t.method === 'none' ? 'no trimming' : `${t.method} trimming`}) had a median of ${fmt(d.median, 0)} ms${fit ? `; an ex-Gaussian fit gave μ = ${fmt(fit.mu, 0)} ms, σ = ${fmt(fit.sigma, 0)} ms and τ = ${fmt(fit.tau, 0)} ms` : ''}.`,
  };
}
export function ezSummary(conds) {
  const ok = conds.filter((c) => c.est);
  const minN = Math.min(...ok.map((c) => c.N)), corrected = ok.some((c) => c.est.corrected);
  const confidence = minN >= 100 && !corrected ? 'high' : minN >= 40 ? 'medium' : 'low';
  const line = (c) => `${c.cond}: drift v = ${fmt(c.est.v, 3)}, boundary a = ${fmt(c.est.a, 3)}, non-decision Ter = ${fmt(c.est.Ter * 1000, 0)} ms (${pctText(c.Pc, 1)} correct, mean correct RT ${fmt(c.MRT * 1000, 0)} ms)`;
  const meaning = ok.map((c) => `${line(c)}.`);
  if (ok.length >= 2) {
    const [x, y] = ok, dv = y.est.v - x.est.v, da = y.est.a - x.est.a;
    meaning.push(`Between "${x.cond}" and "${y.cond}", drift ${dv > 0 ? 'rises' : 'falls'} by ${fmt(Math.abs(dv), 3)} and the boundary ${da > 0 ? 'widens' : 'narrows'} by ${fmt(Math.abs(da), 3)}. Higher drift means the information is easier to take in; a wider boundary means people are more cautious.`);
  }
  meaning.push('Drift and boundary are on the conventional scale s = 0.1; compare them only with other EZ results on the same scale.');
  return {
    headline: ok.length >= 2 ? `"${ok[1].cond}" has drift ${fmt(ok[1].est.v, 3)} vs ${fmt(ok[0].est.v, 3)} for "${ok[0].cond}" (EZ-diffusion).` : `EZ-diffusion: drift v = ${fmt(ok[0].est.v, 3)}, boundary a = ${fmt(ok[0].est.a, 3)}, non-decision time ${fmt(ok[0].est.Ter * 1000, 0)} ms.`,
    meaning: meaning.slice(0, 6),
    confidence,
    confidenceNote: `Rule: strong with at least 100 trials per condition and no edge correction (no condition at 100% correct), some evidence from 40 trials, weak below. Here: at least ${intText(minN)} trials per condition${corrected ? ', with an edge correction' : ''}. Intervals are bootstrap percentiles over trials.`,
    caveats: [
      'EZ assumes correct and error RTs come from the same simple diffusion process with no bias and no trial-to-trial variability; if error RTs differ a lot from correct RTs, use a full diffusion model fit.',
      'EZ cannot be computed at exactly 50% correct, and is unstable near ceiling; with very high accuracy, small changes in errors move the drift a lot.',
    ],
    next: ['Fit EZ per participant and compare drift between designs within participants.', 'If drift differs, the design changes how easy the information is to use; if only the boundary differs, it changes how careful people are.'],
    report: `EZ-diffusion estimates (Wagenmakers et al. 2007, s = 0.1): ${ok.map((c) => `${c.cond} v = ${fmt(c.est.v, 3)}${c.ci ? ` (95% bootstrap CI ${fmt(c.ci.v[0], 3)} to ${fmt(c.ci.v[1], 3)})` : ''}, a = ${fmt(c.est.a, 3)}, Ter = ${fmt(c.est.Ter * 1000, 0)} ms`).join('; ')}.`,
  };
}
export function searchSummary(fits) {
  const ok = fits.filter((f) => f.fit);
  const maxW = Math.max(...ok.map((f) => f.fit.hi - f.fit.lo));
  const confidence = maxW < 10 ? 'high' : maxW < 20 ? 'medium' : 'low';
  const meaning = ok.map((f) => `${f.cond}: ${fmt(f.fit.slope, 1)} ms per item (95% CI ${fmt(f.fit.lo, 1)} to ${fmt(f.fit.hi, 1)}), intercept ${fmt(f.fit.intercept, 0)} ms: ${f.kind === 'efficient' ? 'efficient search; the target pops out' : f.kind === 'intermediate' ? 'intermediate efficiency' : 'inefficient search; people check items one by one'}.`);
  meaning.push('Wolfe (1998, "What can 1 million trials tell us about visual search?") finds slopes under about 10 ms per item for efficient, pop-out search and 20 to 40 ms per item (target present) for inefficient search; target-absent slopes are typically about twice the target-present slope.');
  const s = [...ok].sort((a, b) => a.fit.slope - b.fit.slope);
  return {
    headline: ok.length >= 2 ? `Search slopes: ${s.map((f) => `${f.cond} ${fmt(f.fit.slope, 1)} ms/item`).join(', ')}.` : `Search slope ${fmt(ok[0].fit.slope, 1)} ms per item for ${ok[0].cond}.`,
    meaning: meaning.slice(0, 6),
    confidence,
    confidenceNote: `Rule: strong when every slope's 95% interval is narrower than 10 ms per item, some evidence when narrower than 20, weak otherwise. Here the widest interval is ${fmt(maxW, 1)} ms per item. Slopes are fitted to correct trials only.`,
    caveats: ['Slopes pooled over participants mix between-person differences into the error; fit per participant when you can.', 'A shallow slope with a high intercept is not "efficient" in practice: the item may be easy to find in a crowd but slow to recognise.'],
    next: ['If a key element has an inefficient slope, give it a unique feature (colour, shape, position) and re-test.', 'Check error rates by set size: rising errors with set size mean people give up rather than search.'],
    report: `Visual search slopes (correct trials): ${ok.map((f) => `${f.cond} ${fmt(f.fit.slope, 1)} ms/item (95% CI ${fmt(f.fit.lo, 1)} to ${fmt(f.fit.hi, 1)})`).join('; ')}.`,
  };
}
export { normCdf, sig, pText };
