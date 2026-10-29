// Behavioural calculators drawn from atlas methods with a clear formula: signal detection (d′, c), hyperbolic
// discounting (k), loss aversion (λ) and the just noticeable difference (Weber fraction). Pure functions.
import { normInv, normCdf } from '../stats.js';

const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');
const sig = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '—');
const geo = (xs) => Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

// Rows of "label n n n …": a first token that is not a number is a label (participant id).
export function parseLabelled(text, min = 2) {
  const rows = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.replace(/#.*/, '').trim(); if (!s) return;
    const parts = s.split(/[\s,;\t]+/).filter(Boolean);
    let label = null;
    if (!Number.isFinite(Number(parts[0])) && !/^(y|n|yes|no|accept|reject|later|sooner|ll|ss)$/i.test(parts[0])) label = parts.shift();
    const vals = parts.map((p) => (/^(y|yes|accept|a|later|ll|l)$/i.test(p) ? 1 : /^(n|no|reject|r|sooner|ss|s)$/i.test(p) ? 0 : Number(p)));
    if (vals.length < min || vals.some((v) => !Number.isFinite(v))) { bad.push(i + 1); return; }
    rows.push({ label, vals, line: i + 1 });
  });
  return { rows, bad };
}

// ── Signal detection theory ──
// Hit rate H and false-alarm rate F, corrected so z stays finite: log-linear (Hautus 1995) adds 0.5 to each count
// and 1 to each total for everyone; '1/2N' (Macmillan and Kaplan 1985) moves only rates of 0 or 1 to 1/(2N) and
// 1 − 1/(2N). d′ = z(H) − z(F); c = −(z(H) + z(F))/2; ln β = c·d′; A′ and B″ (Grier) are the nonparametric versions.
export function sdt(hits, misses, fas, crs, correction = 'loglinear') {
  const ns = hits + misses, nn = fas + crs;
  let H = hits / ns, F = fas / nn;
  if (correction === 'loglinear') { H = (hits + 0.5) / (ns + 1); F = (fas + 0.5) / (nn + 1); }
  else if (correction === 'half') { if (H === 1) H = 1 - 1 / (2 * ns); if (H === 0) H = 1 / (2 * ns); if (F === 1) F = 1 - 1 / (2 * nn); if (F === 0) F = 1 / (2 * nn); }
  return { ...sdtRates(H, F), ns, nn, rawH: hits / ns, rawF: fas / nn };
}
export function sdtRates(H, F) {
  const zH = normInv(H), zF = normInv(F);
  const d = zH - zF, c = -(zH + zF) / 2;
  const A = H >= F ? 0.5 + ((H - F) * (1 + H - F)) / (4 * H * (1 - F)) : 0.5 - ((F - H) * (1 + F - H)) / (4 * F * (1 - H));
  const B = H >= F ? (H * (1 - H) - F * (1 - F)) / (H * (1 - H) + F * (1 - F)) : (F * (1 - F) - H * (1 - H)) / (F * (1 - F) + H * (1 - H));
  return { H, F, zH, zF, d, c, lnBeta: c * d, beta: Math.exp(c * d), cRel: d !== 0 ? c / d : NaN, A, B };
}
export function sdtSummary(rows, ctx = {}) {
  if (!rows.length) return null;
  const ds = rows.map((r) => r.d), cs = rows.map((r) => r.c);
  const md = rows.length > 1 ? ds.reduce((a, b) => a + b, 0) / ds.length : ds[0], mc = cs.reduce((a, b) => a + b, 0) / cs.length;
  const sens = md >= 2 ? 'very good' : md >= 1 ? 'moderate' : md >= 0.5 ? 'poor' : 'near chance';
  const bias = mc > 0.2 ? 'cautious: they tend to say "no" (miss real signals) rather than raise false alarms' : mc < -0.2 ? 'liberal: they tend to say "yes", catching most signals but with many false alarms' : 'roughly neutral';
  const trials = Math.min(...rows.map((r) => r.ns + r.nn));
  const signal = ctx.signal || 'the signal';
  return {
    headline: `People told ${signal} from noise ${sens === 'near chance' ? 'barely better than chance' : `with ${sens} sensitivity`} (d′ = ${f2(md)}), and their bias was ${mc > 0.2 ? 'cautious' : mc < -0.2 ? 'liberal' : 'neutral'} (c = ${f2(mc)}).`,
    meaning: [
      `d′ measures how far apart signal and noise feel to people, in standard deviations: 0 is guessing, 1 is moderate, 2 or more is easy.`,
      `The criterion c shows their bias, which is ${bias}.`,
      rows.length > 1 ? `Across ${rows.length} participants d′ ranged from ${f2(Math.min(...ds))} to ${f2(Math.max(...ds))}.` : `Hit rate ${pc(rows[0].rawH)}, false-alarm rate ${pc(rows[0].rawF)}.`,
      md < 1 ? 'Failures are mostly perceptual: the design does not make the signal distinct enough. Changing instructions or incentives will not fix that.' : Math.abs(mc) > 0.5 ? 'Sensitivity is fine, so errors come mainly from the decision rule: people\'s threshold, which incentives, defaults and costs can move.' : 'Both sensitivity and bias are reasonable.',
    ],
    confidence: trials >= 100 ? 'high' : trials >= 40 ? 'medium' : 'low',
    confidenceNote: `${trials < 40 ? 'Few' : 'The smallest participant has'} ${trials} trials. ${trials < 40 ? 'd′ from fewer than about 40 trials per person is noisy, and the correction for 0% or 100% rates pulls it towards 0.' : ''}`,
    caveats: ['d′ assumes the signal and noise distributions are normal with equal spread; if not (see the rating example in Stanislaw and Todorov 1999), use A′ or collect confidence ratings.', 'Hit and false-alarm rates of 0 or 100% need a correction; the log-linear one is applied to every participant so they stay comparable.'],
    next: [md < 1 ? `Make ${signal} more distinct (salience, contrast, position, wording) and retest.` : 'Keep the design; check the criterion against the cost of each error type.', mc > 0.2 ? 'If misses are costly, lower the cost of responding (fewer steps, softer confirmation).' : mc < -0.2 ? 'If false alarms are costly, add friction or clearer cues for the "no" case.' : 'Report both measures together.'],
    report: `Mean sensitivity was d′ = ${f2(md)} with criterion c = ${f2(mc)} (${rows.length} participant${rows.length > 1 ? 's' : ''}, log-linear correction).`,
  };
}

// ── Hyperbolic discounting ──
// Mazur's hyperbola V = A / (1 + kD). From a choice between a smaller-sooner amount S now and a larger-later L after
// D days, the indifference k is (L/S − 1)/D. Kirby's (1999) method: the person's k is the candidate most consistent
// with all their choices (they choose later when their k is below the question's), geometric mean over ties.
export const kIndiff = (S, L, D) => (L / S - 1) / D;
export function kirbyK(choices) {
  const qs = choices.map((c) => ({ ...c, k: kIndiff(c.S, c.L, c.D) })).sort((a, b) => a.k - b.k);
  const ks = [...new Set(qs.map((q) => q.k))];
  const cands = [ks[0] / 2, ...ks.slice(1).map((k, i) => Math.sqrt(k * ks[i])), ks[ks.length - 1] * 2];
  const cons = cands.map((k) => qs.filter((q) => (k < q.k ? q.later === 1 : q.later === 0)).length / qs.length);
  const best = Math.max(...cons);
  const tied = cands.filter((_, i) => cons[i] === best);
  return { k: geo(tied), consistency: best, n: qs.length, questions: qs, tied: tied.length, laterShare: qs.filter((q) => q.later).length / qs.length };
}
// Indifference points (delay D, subjective value V as a share of the amount): least-squares fits of the hyperbola
// V = 1/(1 + kD) and the exponential V = e^(−kD), by golden-section search on log k, plus the area under the curve
// (Myerson, Green and Warusawitharana 2001): delays and values scaled to 0–1, trapezoids from (0, 1).
function golden(f, lo, hi, it = 200) {
  const r = (Math.sqrt(5) - 1) / 2; let a = lo, b = hi, c = b - r * (b - a), d = a + r * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < it; i++) { if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); } }
  return (a + b) / 2;
}
export function fitDiscount(points, model = 'hyperbolic') {
  const m = model === 'hyperbolic' ? (k, D) => 1 / (1 + k * D) : (k, D) => Math.exp(-k * D);
  const sse = (lk) => points.reduce((s, [D, V]) => s + (V - m(Math.exp(lk), D)) ** 2, 0);
  let lk = golden(sse, -20, 10); lk = golden(sse, lk - 2, lk + 2);
  const k = Math.exp(lk), mv = points.reduce((s, p) => s + p[1], 0) / points.length;
  const sst = points.reduce((s, [, V]) => s + (V - mv) ** 2, 0);
  return { k, sse: sse(lk), r2: sst > 0 ? 1 - sse(lk) / sst : NaN };
}
export function discountAuc(points) {
  const pts = [[0, 1], ...points].sort((a, b) => a[0] - b[0]); const Dmax = pts[pts.length - 1][0];
  let a = 0; for (let i = 1; i < pts.length; i++) a += ((pts[i][0] - pts[i - 1][0]) / Dmax) * (pts[i][1] + pts[i - 1][1]) / 2;
  return a;
}
export function discountSummary({ k, mode, consistency, n, r2, auc, people = 1 }) {
  if (!Number.isFinite(k)) return null;
  const month = 1 / (1 + 30 * k), half = 1 / k;
  const level = k < 0.002 ? 'patient' : k < 0.02 ? 'moderately impatient' : 'very impatient';
  const conf = mode === 'choices' ? (consistency >= 0.9 && n >= 15 ? 'high' : consistency >= 0.75 ? 'medium' : 'low') : (r2 >= 0.8 && n >= 5 ? 'high' : r2 >= 0.5 ? 'medium' : 'low');
  return {
    headline: `A reward a month away is worth about ${pc(month)} of its face value to ${people > 1 ? 'the typical participant' : 'this participant'} (k = ${sig(k)} per day: ${level}).`,
    meaning: [
      `Rewards lose half their value after about ${half >= 365 ? `${f1(half / 365)} years` : `${Math.round(half)} days`} (the delay 1/k).`,
      `A delay of one week cuts value to ${pc(1 / (1 + 7 * k))}; one year to ${pc(1 / (1 + 365 * k))}.`,
      level === 'very impatient' ? 'Benefits that arrive later (savings, long-term rewards, onboarding that pays off next week) will be heavily undervalued: show an immediate benefit.' : level === 'patient' ? 'Delayed benefits will be weighed fairly; long-term framing can work.' : 'Delays matter: pull at least part of the benefit forward.',
      Number.isFinite(auc) && `Area under the discounting curve is ${f2(auc)} (1 means no discounting, 0 means total).`,
    ].filter(Boolean),
    confidence: conf,
    confidenceNote: mode === 'choices' ? `Choices were ${pc(consistency)} consistent with a single k over ${n} questions${consistency < 0.75 ? '; inconsistent answering suggests inattention or confusion' : ''}.` : `The hyperbola explains ${pc(r2)} of the variation in ${n} indifference points.`,
    caveats: ['Hypothetical rewards give similar k to real ones in studies, but small stakes discount more steeply than large ones (the magnitude effect).', 'k is on a log scale across people: compare log k or use the median, not the mean.'],
    next: ['Use the k to frame offers: express delayed value in today\'s terms, or split a reward into an immediate and a later part.', 'Compare k between segments with a nonparametric test on log k.'],
    report: `Hyperbolic discounting (V = A/(1 + kD)) gave k = ${sig(k)} per day${mode === 'choices' ? ` (Kirby method, ${pc(consistency)} consistency)` : ` (least squares, R² = ${f2(r2)})`}: a reward one month away retains about ${pc(month)} of its value.`,
  };
}

// ── Loss aversion ──
// Accept or reject 50/50 mixed gambles: win G or lose L. Logistic regression P(accept) = σ(b0 + bG·G + bL·L) with L
// as a positive amount (Tom et al. 2007); λ = −bL / bG. Fitted by Newton-Raphson. When the choices separate
// perfectly the logistic estimates run away, so the switch-point λ is also given: the ratio G/L threshold that
// best separates accepts from rejects (accept when G/L > λ), geometric mean over ties.
export function logistic(X, y, { maxIter = 100, tol = 1e-10, ridge = 0 } = {}) {
  const p = X[0].length; let b = new Array(p).fill(0), converged = false, it = 0;
  for (; it < maxIter; it++) {
    const g = new Array(p).fill(0), Hm = Array.from({ length: p }, () => new Array(p).fill(0));
    X.forEach((x, i) => { const eta = x.reduce((s, v, j) => s + v * b[j], 0), mu = 1 / (1 + Math.exp(-eta)), w = mu * (1 - mu); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) Hm[j][k] += w * x[j] * x[k]; } });
    for (let j = 1; j < p; j++) { g[j] -= ridge * b[j]; Hm[j][j] += ridge; }
    const step = solve(Hm, g); if (!step) break;
    b = b.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < tol) { converged = true; break; }
    if (Math.max(...b.map(Math.abs)) > 1e6) break;
  }
  const ll = X.reduce((s, x, i) => { const eta = x.reduce((a, v, j) => a + v * b[j], 0); return s + y[i] * eta - Math.log1p(Math.exp(eta)); }, 0);
  return { b, converged, iter: it, ll };
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
export function switchLambda(trials) {
  const ratios = [...new Set(trials.map((t) => t.G / t.L))].sort((a, b) => a - b);
  const cands = [ratios[0] / 2, ...ratios.slice(1).map((r, i) => Math.sqrt(r * ratios[i])), ratios[ratios.length - 1] * 2];
  const cons = cands.map((lam) => trials.filter((t) => (t.G / t.L > lam ? t.accept === 1 : t.accept === 0)).length / trials.length);
  const best = Math.max(...cons); const tied = cands.filter((_, i) => cons[i] === best);
  return { lambda: geo(tied), consistency: best };
}
export function lossAversion(trials) {
  const sw = switchLambda(trials);
  const accepts = trials.filter((t) => t.accept).length;
  let lg = null;
  if (accepts > 0 && accepts < trials.length) {
    const fit = logistic(trials.map((t) => [1, t.G, t.L]), trials.map((t) => t.accept));
    const lambda = -fit.b[2] / fit.b[1];
    lg = { ...fit, lambda, ok: fit.converged && fit.b[1] > 0 && fit.b[2] < 0 && Number.isFinite(lambda) };
  }
  return { n: trials.length, accepts, switch: sw, logistic: lg, lambda: lg && lg.ok ? lg.lambda : sw.lambda, method: lg && lg.ok ? 'logistic' : 'switch' };
}
export function lossSummary(people) {
  if (!people.length) return null;
  const ls = people.map((p) => p.lambda).filter(Number.isFinite);
  const lam = people.length > 1 ? median(ls) : ls[0];
  const averse = people.filter((p) => p.lambda > 1).length;
  const minN = Math.min(...people.map((p) => p.n));
  const cons = Math.min(...people.map((p) => p.switch.consistency));
  return {
    headline: `People needed a possible gain about ${f1(lam)} times the possible loss before they would take a 50/50 bet (λ = ${f2(lam)}).`,
    meaning: [
      lam > 1.2 ? `Losses weigh about ${f1(lam)} times as much as equal gains; published estimates are usually between 1.5 and 2.5.` : lam < 0.9 ? 'This group is loss-seeking or indifferent to losses, which is unusual; check the instructions and the stakes.' : 'Losses and gains weigh about the same here.',
      people.length > 1 && `${averse} of ${people.length} participants were loss averse (λ above 1).`,
      lam > 1.2 && `For design: framing a change as something people lose (features, discounts, progress) will feel about ${f1(lam)} times bigger than the same thing framed as a gain.`,
    ].filter(Boolean),
    confidence: minN >= 40 && cons >= 0.85 ? 'high' : minN >= 16 && cons >= 0.7 ? 'medium' : 'low',
    confidenceNote: `${minN} gambles for the participant with the fewest; choices ${pc(cons)} consistent with a single threshold at worst.`,
    caveats: ['λ measured with small hypothetical stakes is lower than with real money, and it depends on the reference point you set.', 'A 50/50 accept/reject task also picks up risk attitude; the logistic slope separates them only partly.'],
    next: ['Frame changes as preserving what people already have, rather than adding gains of the same size.', 'Retest with the stakes your product involves, or compare framings directly in an A/B test.'],
    report: `Loss aversion, estimated from accept/reject decisions on 50/50 mixed gambles, was λ = ${f2(lam)}${people.length > 1 ? ` (median of ${people.length} participants)` : ''}.`,
  };
}

// ── Just noticeable difference and the Weber fraction ──
// Method of constant stimuli: at each comparison level x, k of n trials were judged "more" than the standard S.
// Fit the cumulative normal P = Φ(a + b·x) by maximum likelihood (probit GLM, Newton-Raphson). PSE = −a/b (50%),
// σ = 1/b, JND = (x75 − x25)/2 = 0.6745 σ, Weber fraction = JND / S.
export function probit(levels) {
  let a = 0, b = 0;
  { // start from a least-squares fit on z of the proportions
    const pts = levels.map((l) => [l.x, normInv(Math.min(0.99, Math.max(0.01, (l.k + 0.5) / (l.n + 1))))]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, mz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0), sxz = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - mz), 0);
    b = sxx > 0 ? sxz / sxx : 0; a = mz - b * mx;
  }
  const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const ll = (a_, b_) => levels.reduce((s, l) => { const P = Math.min(1 - 1e-15, Math.max(1e-15, normCdfX(a_ + b_ * l.x))); return s + l.k * Math.log(P) + (l.n - l.k) * Math.log(1 - P); }, 0);
  let converged = false;
  for (let it = 0; it < 200; it++) {
    // Fisher scoring
    let g0 = 0, g1 = 0, i00 = 0, i01 = 0, i11 = 0;
    for (const l of levels) {
      const z = a + b * l.x, P = Math.min(1 - 1e-12, Math.max(1e-12, normCdfX(z))), d = phi(z);
      const s = (l.k - l.n * P) * d / (P * (1 - P)), w = l.n * d * d / (P * (1 - P));
      g0 += s; g1 += s * l.x; i00 += w; i01 += w * l.x; i11 += w * l.x * l.x;
    }
    const det = i00 * i11 - i01 * i01; if (Math.abs(det) < 1e-300) break;
    let da = (i11 * g0 - i01 * g1) / det, db = (-i01 * g0 + i00 * g1) / det;
    const l0 = ll(a, b); let t = 1;
    while (t > 1e-6 && ll(a + t * da, b + t * db) < l0 - 1e-12) t /= 2;
    a += t * da; b += t * db;
    if (Math.abs(t * da) < 1e-12 && Math.abs(t * db) < 1e-12) { converged = true; break; }
  }
  const sigma = 1 / b, pse = -a / b, jnd = 0.6744897501960817 * sigma;
  return { a, b, pse, sigma, jnd, converged, ll: ll(a, b) };
}
// Accurate Φ (erfc continued fraction via complementary error function) for the probit fit.
function normCdfX(z) {
  const x = Math.abs(z) / Math.SQRT2;
  // erfc by Numerical Recipes' Chebyshev approximation (fractional error < 1.2e-7) refined by series for small x
  let erfc;
  if (x < 3) { // series for erf
    let sum = x, term = x; for (let n = 1; n < 200; n++) { term *= -x * x / n; const add = term / (2 * n + 1); sum += add; if (Math.abs(add) < 1e-17) break; }
    erfc = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else { // continued fraction
    let f = 0; for (let n = 60; n >= 1; n--) f = (n / 2) / (x + f);
    erfc = Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
}
export { normCdfX as normCdfAccurate };
// Several standards, each with its measured JND: Weber's law says JND = k·S. k by least squares through the origin,
// with each ratio JND/S and their coefficient of variation (low CV means the law holds over this range).
export function weberFit(rows) {
  const k = rows.reduce((s, r) => s + r.S * r.J, 0) / rows.reduce((s, r) => s + r.S * r.S, 0);
  const ratios = rows.map((r) => r.J / r.S), m = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const sd = ratios.length > 1 ? Math.sqrt(ratios.reduce((s, x) => s + (x - m) ** 2, 0) / (ratios.length - 1)) : 0;
  return { k, ratios, meanRatio: m, cv: m ? sd / m : NaN };
}
export function weberSummary({ mode, S, fit, wf, levels, unit = '' }) {
  if (mode === 'constant' && fit) {
    const w = fit.jnd / S, n = Math.min(...levels.map((l) => l.n));
    return {
      headline: `A change of about ${sig(fit.jnd)}${unit} from ${sig(S)}${unit} is just noticeable: a Weber fraction of ${pc(w)}.`,
      meaning: [
        `Changes smaller than about ${pc(w)} of the standard will go unnoticed by most people; changes of twice that are noticed about 91% of the time when compared directly.`,
        `The point of subjective equality is ${sig(fit.pse)}${unit}: ${Math.abs(fit.pse - S) > fit.jnd / 2 ? `people judged ${sig(fit.pse)}${unit} as equal to the standard, a constant bias of ${sig(fit.pse - S)}${unit}` : 'close to the standard, so there is no strong bias'}.`,
        `By Weber's law the same fraction should apply at other levels: from ${sig(2 * S)}${unit} a change of about ${sig(2 * fit.jnd)}${unit} would be needed.`,
      ],
      confidence: n >= 40 && fit.converged ? 'high' : n >= 15 && fit.converged ? 'medium' : 'low',
      confidenceNote: `${n} trials at the least-tested level${fit.converged ? '' : '; the fit did not converge, so treat the values as rough'}.`,
      caveats: ['The JND is a threshold for direct side-by-side comparison; when people see one version at a time, the noticeable change is larger.', 'Weber fractions hold best in the middle of a range and break down near the extremes.'],
      next: [`Keep unwanted changes (price rises, latency regressions) below ${pc(w)}; make changes you want noticed at least ${pc(2 * w)}.`, 'Measure at two or three other standards to check that the fraction holds.'],
      report: `The JND at a standard of ${sig(S)}${unit} was ${sig(fit.jnd)}${unit} (Weber fraction ${f2(w)}, PSE ${sig(fit.pse)}${unit}; cumulative normal fit by maximum likelihood).`,
    };
  }
  if (mode === 'weber' && wf) {
    return {
      headline: `The just noticeable change is about ${pc(wf.k)} of the starting level (Weber fraction k = ${f2(wf.k)}).`,
      meaning: [`Across the standards, JND/S ranged from ${f2(Math.min(...wf.ratios))} to ${f2(Math.max(...wf.ratios))} (coefficient of variation ${pc(wf.cv)}).`, wf.cv < 0.2 ? 'The fraction is nearly constant, so Weber\'s law describes this range well.' : 'The fraction changes with level, so Weber\'s law holds only roughly here; use the fraction measured nearest to your case.'],
      confidence: wf.ratios.length >= 4 && wf.cv < 0.2 ? 'high' : wf.ratios.length >= 3 ? 'medium' : 'low',
      confidenceNote: `${wf.ratios.length} standards.`,
      caveats: ['Each JND should come from enough trials (about 40 or more per standard).'],
      next: [`Size deliberate changes to at least ${pc(2 * wf.k)} so most people notice; keep unwanted ones under ${pc(wf.k)}.`],
      report: `JNDs at ${wf.ratios.length} standards gave a Weber fraction of k = ${f2(wf.k)} (least squares through the origin; CV of the ratios ${pc(wf.cv)}).`,
    };
  }
  return null;
}
