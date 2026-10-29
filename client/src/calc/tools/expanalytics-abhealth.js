// A/B test health checks: sample ratio mismatch, MDE and duration planning (with CUPED), ratio metrics by the
// delta method, non-inferiority and equivalence tests, and the A/A p-value check. Pure functions with no React;
// `npm run check:expanalytics` checks them against scipy and statsmodels (server/scripts/expanalytics-reference.py).
import { clopperPearson, binomCdf } from '../stats.js';
import { sum, avg, chi2Sf, normCdf, normSf, normInv, tSf, tCrit, ksUniform, fmt, pctText, pText } from './expanalytics-core.js';

// ── Sample ratio mismatch ──
// χ² goodness of fit of the observed users per arm against the planned split. Flag at p < 0.001, the threshold
// used by Kohavi, Tang and Xu (2020, Trustworthy Online Controlled Experiments, ch. 21) and Fabijan et al. (2019).
export const SRM_ALPHA = 0.001;
export function srm(counts, weights, names = []) {
  const N = sum(counts), W = sum(weights);
  const expected = weights.map((w) => (N * w) / W);
  const parts = counts.map((c, i) => (c - expected[i]) ** 2 / expected[i]);
  const chi2 = sum(parts), df = counts.length - 1, p = chi2Sf(chi2, df);
  return {
    N, chi2, df, p, flag: p < SRM_ALPHA, expected, parts,
    arms: counts.map((c, i) => ({ name: names[i] || `Arm ${i + 1}`, observed: c, expected: expected[i], share: c / N, planned: weights[i] / W, diff: c - expected[i], rel: c / expected[i] - 1 })),
  };
}

// ── Power, MDE and duration ──
// Two-sample z test of each treatment arm against control with equal allocation. For a mean with SD σ, the standard
// error of the difference is σ√(2/n); for a proportion it is √((p₁q₁ + p₂q₂)/n) (unpooled). CUPED with pre-period
// correlation ρ multiplies the variance by (1 − ρ²). Power includes both tails for a two-sided test, as statsmodels'
// NormalIndPower does. With several treatment arms α can be split across the k − 1 comparisons (Bonferroni).
export function powerAt({ type, base, sd, n, delta, alpha, sided, rho = 0 }) {
  const shrink = 1 - rho * rho;
  const v = type === 'mean' ? 2 * sd * sd : base * (1 - base) + (base + delta) * (1 - base - delta);
  const se = Math.sqrt((v * shrink) / n);
  if (!(se > 0)) return NaN;
  if (sided === 1) return normCdf(delta / se - normInv(1 - alpha));
  const z = normInv(1 - alpha / 2);
  return normCdf(delta / se - z) + normCdf(-delta / se - z);
}
const solveUp = (f, target, lo, hi) => {
  if (f(hi) < target) return NaN;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; }
  return hi;
};
export function planAlpha(alpha, arms, correct) { return correct && arms > 2 ? alpha / (arms - 1) : alpha; }
// Smallest absolute effect detectable with n per arm.
export function mdeFor(o, n) {
  const hi = o.type === 'mean' ? 100 * o.sd : 1 - o.base - 1e-9;
  return solveUp((d) => powerAt({ ...o, n, delta: d }), o.power, 0, hi);
}
// Users per arm needed for an absolute effect.
export function nFor(o, delta) {
  let hi = 100; while (powerAt({ ...o, n: hi, delta }) < o.power && hi < 1e13) hi *= 2;
  return Math.ceil(solveUp((n) => powerAt({ ...o, n, delta }), o.power, 1, hi));
}
export function plan({ type, base, sd = 0, daily, arms, alpha, power, sided, rho = 0, correct = true, days, mde, mdeRel = true }) {
  const a = planAlpha(alpha, arms, correct);
  const o = { type, base, sd, alpha: a, power, sided, rho };
  const perDayPerArm = daily / arms;
  const weeks = [1, 2, 3, 4, 6, 8].map((w) => { const n = perDayPerArm * 7 * w; const d = mdeFor(o, n); return { weeks: w, n, mde: d, rel: d / base }; });
  const out = { alphaUsed: a, perDayPerArm, weeks, varianceFactor: 1 - rho * rho };
  if (days != null) {
    const n = perDayPerArm * days; const d = mdeFor(o, n);
    Object.assign(out, { mode: 'mde', n, mde: d, rel: d / base, mdeNoCuped: rho ? mdeFor({ ...o, rho: 0 }, n) : d });
  } else {
    const delta = mdeRel ? mde * base : mde;
    if (type === 'prop' && (base + delta >= 1 || base + delta <= 0)) return { ...out, mode: 'n', error: 'The target rate must stay between 0% and 100%.' };
    const n = nFor(o, delta), nNo = rho ? nFor({ ...o, rho: 0 }, delta) : n;
    Object.assign(out, { mode: 'n', delta, n, days: Math.ceil(n / perDayPerArm), daysNoCuped: Math.ceil(nNo / perDayPerArm), total: n * arms });
  }
  return out;
}

// ── Ratio metrics by the delta method ──
// R = X̄ / Ȳ per arm, where users are randomised and X, Y are per-user sums (clicks and sessions). By the delta method
// Var(R) ≈ (1/n)(σx²/μy² − 2μx σxy/μy³ + μx² σy²/μy⁴) (Deng, Knoblich and Lu 2018). The lift R_T/R_C − 1 uses
// Var ≈ Var(R_T)/R_C² + R_T² Var(R_C)/R_C⁴.
export function ratioStats(xs, ys) {
  const n = xs.length, mx = avg(xs), my = avg(ys);
  let vx = 0, vy = 0, cxy = 0;
  for (let i = 0; i < n; i++) { vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; cxy += (xs[i] - mx) * (ys[i] - my); }
  return { n, mx, my, vx: vx / (n - 1), vy: vy / (n - 1), cxy: cxy / (n - 1) };
}
export function ratioVar({ n, mx, my, vx, vy, cxy }) {
  return (vx / my ** 2 - (2 * mx * cxy) / my ** 3 + (mx ** 2 * vy) / my ** 4) / n;
}
export function deltaMethod(c, t, conf = 0.95) {
  const rc = c.mx / c.my, rt = t.mx / t.my, vc = ratioVar(c), vt = ratioVar(t);
  const z = normInv(1 - (1 - conf) / 2);
  const diff = rt - rc, seDiff = Math.sqrt(vc + vt);
  const lift = rt / rc - 1, seLift = Math.sqrt(vt / rc ** 2 + (rt ** 2 * vc) / rc ** 4);
  // For contrast, the naive SE that treats the denominator as fixed: √(σx²/n)/μy per arm.
  const naive = Math.sqrt(c.vx / c.n / c.my ** 2 + t.vx / t.n / t.my ** 2);
  const zStat = diff / seDiff;
  return { rc, rt, seC: Math.sqrt(vc), seT: Math.sqrt(vt), diff, seDiff, lo: diff - z * seDiff, hi: diff + z * seDiff, lift, seLift, liftLo: lift - z * seLift, liftHi: lift + z * seLift, z: zStat, p: 2 * normSf(Math.abs(zStat)), naiveSe: naive };
}
export function parseRatioRows(text) {
  const arms = new Map(), bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const parts = s.split(/[\t,;]+/).map((x) => x.trim());
    if (parts.length < 3) { bad.push(i + 1); return; }
    const x = Number(parts[parts.length - 2]), y = Number(parts[parts.length - 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || y < 0) { if (i > 0) bad.push(i + 1); return; }
    const arm = parts.length >= 4 ? parts[1] : parts[0];
    if (!arms.has(arm)) arms.set(arm, { xs: [], ys: [] });
    arms.get(arm).xs.push(x); arms.get(arm).ys.push(y);
  });
  return { arms: [...arms.entries()].map(([name, v]) => ({ name, ...v })), bad };
}

// ── Non-inferiority and equivalence ──
// Treatment minus control, with a margin m > 0 in the metric's units. With "higher is better", non-inferiority
// means H0: diff ≤ −m is rejected. Equivalence (TOST) rejects both diff ≤ −m and diff ≥ +m; p = max of the two.
// Proportions use the unpooled Wald SE (statsmodels test_proportions_2indep, method='wald'); means use Welch's t.
export function nonInferiority({ kind, c, t, margin, higherBetter = true, alpha = 0.05 }) {
  let diff, se, df = Infinity;
  if (kind === 'prop') {
    const pc = c.x / c.n, pt = t.x / t.n;
    diff = pt - pc; se = Math.sqrt((pc * (1 - pc)) / c.n + (pt * (1 - pt)) / t.n);
  } else {
    const vc = c.sd ** 2 / c.n, vt = t.sd ** 2 / t.n;
    diff = t.m - c.m; se = Math.sqrt(vc + vt); df = (vc + vt) ** 2 / (vc ** 2 / (c.n - 1) + vt ** 2 / (t.n - 1));
  }
  const tail = (z) => (Number.isFinite(df) ? tSf(z, df) : normSf(z));
  const s = higherBetter ? 1 : -1;
  // "Worse" direction: for higher-is-better, worse = negative diff.
  const zNI = (s * diff + margin) / se, pNI = tail(zNI);
  const zLow = (diff + margin) / se, zUp = (margin - diff) / se;
  const pLow = tail(zLow), pUp = tail(zUp), pEq = Math.max(pLow, pUp);
  const crit = Number.isFinite(df) ? tCrit(1 - 2 * alpha, df) : normInv(1 - alpha);
  const lo = diff - crit * se, hi = diff + crit * se; // the (1 − 2α) two-sided interval
  return { diff, se, df, zNI, pNI, ni: pNI < alpha, pLow, pUp, pEq, eq: pEq < alpha, lo, hi, crit, margin, higherBetter, alpha };
}

// ── A/A check ──
// Under a healthy system, A/A p-values are Uniform(0, 1): KS test against the uniform, and the share below α
// compared with α by an exact one-sided binomial test, with a Clopper-Pearson interval.
export function aaCheck(ps, alpha = 0.05) {
  const valid = ps.filter((p) => p >= 0 && p <= 1);
  const ks = ksUniform(valid), n = valid.length, x = valid.filter((p) => p < alpha).length;
  const ci = clopperPearson(x, n, 0.95);
  const pBinom = x === 0 ? 1 : 1 - binomCdf(x - 1, n, alpha);
  const bins = Array.from({ length: 10 }, (_, i) => valid.filter((p) => p >= i / 10 && (i === 9 ? p <= 1 : p < (i + 1) / 10)).length);
  return { n, ks, fp: x, fpr: x / n, ci, pBinom, bins, alpha };
}
export function parsePs(text) { return (String(text || '').match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number).filter(Number.isFinite); }

// ── Reading your results ──
// Confidence rule (SRM): the χ² test is the evidence. p < 0.001 → "high" confidence that the split is broken;
// 0.001 ≤ p < 0.05 → "medium" (worth investigating, not a hard fail); p ≥ 0.05 → "high" confidence there is no
// large mismatch only when every arm has ≥ 1,000 users, otherwise "medium" because small samples miss small skews.
export function srmSummary(r) {
  const worst = [...r.arms].sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))[0];
  const big = r.arms.every((a) => a.observed >= 1000);
  const confidence = r.flag ? 'high' : r.p < 0.05 ? 'medium' : big ? 'high' : 'medium';
  const shares = r.arms.map((a) => pctText(a.share, 2)).join(' / ');
  const planned = r.arms.map((a) => pctText(a.planned, 1)).join(' / ');
  return {
    headline: r.flag
      ? `Sample ratio mismatch: the split is ${shares} against a planned ${planned} (χ²(${r.df}) = ${fmt(r.chi2)}, ${pText(r.p)}). Do not trust this test's results.`
      : `No sample ratio mismatch at the 0.001 threshold: the split is ${shares} against a planned ${planned} (χ²(${r.df}) = ${fmt(r.chi2)}, ${pText(r.p)}).`,
    meaning: [
      r.flag ? 'An SRM means the users in each arm are not the comparable random groups the test assumes. Something (a redirect, a bot filter, a crash, a logging gap, an eligibility rule) removed or added users unevenly, and it may be related to the outcome. Every metric in the test is suspect, including the ones that look good.' : 'The observed split is consistent with the planned allocation, so this check gives no reason to distrust the randomisation.',
      `The arm furthest from plan is "${worst.name}": ${Math.round(worst.observed).toLocaleString()} users vs ${Math.round(worst.expected).toLocaleString()} expected (${worst.rel >= 0 ? '+' : ''}${pctText(worst.rel, 2)}).`,
      'The 0.001 threshold is deliberately strict (Kohavi, Tang and Xu 2020; Fabijan et al. 2019): SRM checks run on every test, so a looser threshold would raise many false alarms.',
    ],
    confidence,
    confidenceNote: 'Rule: p < 0.001 is strong evidence of a broken split; p between 0.001 and 0.05 is a warning to investigate; a clean result is strong only when every arm has at least 1,000 users, because small tests cannot detect small skews.',
    caveats: [
      'Do not "fix" an SRM by reweighting or dropping users and then reading the results. The cause decides which users are missing, and that bias stays.',
      'A clean SRM check does not prove the test is healthy: it only rules out uneven losses large enough to change the counts.',
    ],
    next: r.flag
      ? ['Find the cause before reading any metric: compare the split by day, browser, platform and entry point, and check redirects, bot filtering and when users are counted (assignment vs exposure).', 'Once fixed, restart the test with fresh users rather than salvaging this run.']
      : ['Keep running the SRM check daily: a mismatch that appears mid-test points to a deployment or logging change.', 'Go on to read the metrics, with a guardrail check alongside.'],
    report: r.flag
      ? `The test failed its sample ratio mismatch check (observed split ${shares} vs planned ${planned}; χ²(${r.df}) = ${fmt(r.chi2)}, ${pText(r.p)}), so its results were not used.`
      : `The sample ratio check passed (observed split ${shares} vs planned ${planned}; χ²(${r.df}) = ${fmt(r.chi2)}, ${pText(r.p)}, threshold 0.001).`,
  };
}

// Confidence rule (MDE): the plan is arithmetic, so confidence describes the inputs. "high" when the duration is at
// least one full week and at most eight; "medium" when shorter than a week (day-of-week effects are not covered) or
// CUPED's ρ is above 0.7 (needs checking on your own pre-period data); "low" when it needs more than 8 weeks.
export function mdeSummary(r, o) {
  const unit = o.type === 'prop' ? (v) => `${(v * 100).toFixed(2)} percentage points` : (v) => fmt(v, 3);
  const days = r.mode === 'mde' ? o.days : r.days;
  const confidence = !Number.isFinite(days) ? 'low' : days > 56 ? 'low' : days < 7 || o.rho > 0.7 ? 'medium' : 'high';
  const head = r.mode === 'mde'
    ? `In ${o.days} days (${Math.round(r.n).toLocaleString()} users per arm) the smallest effect you can reliably detect is ${unit(r.mde)}, a ${pctText(r.rel)} relative change.`
    : `To detect a ${pctText(r.delta / o.base)} relative change (${unit(r.delta)}) you need ${r.n.toLocaleString()} users per arm, about ${r.days} days at your traffic.`;
  return {
    headline: head,
    meaning: [
      `The minimum detectable effect (MDE) is the effect you would detect ${pctText(o.power, 0)} of the time if it were real, at α = ${o.alpha}${r.alphaUsed !== o.alpha ? ` (split to ${fmt(r.alphaUsed, 4)} per comparison for ${o.arms - 1} treatment arms)` : ''}. It is not a prediction of the effect you will get.`,
      o.rho > 0 ? `CUPED with a pre-period correlation of ${o.rho} cuts the variance to ${pctText(r.varianceFactor, 0)} of its original size${r.mode === 'mde' ? `, shrinking the MDE from ${unit(r.mdeNoCuped)} to ${unit(r.mde)}` : `, shortening the test from ${r.daysNoCuped} to ${r.days} days`}.` : 'With no pre-period covariate (CUPED off), the plan uses the raw variance of the metric.',
      'Effects smaller than the MDE can still be real; this test just will not reliably tell them from noise.',
    ],
    confidence,
    confidenceNote: 'Rule: strong when the plan covers 1 to 8 full weeks; some when it is under a week (weekday and weekend users differ) or assumes a CUPED correlation above 0.7; weak beyond 8 weeks, when novelty effects, cookie churn and other launches get in the way.',
    caveats: [
      'An MDE is not the expected effect. Most changes move metrics by less than teams hope, so an MDE of 10% often means the test cannot see the effect you will actually get.',
      'The baseline and SD come from past data; if traffic mix or seasonality shifts, the real MDE will differ.',
    ],
    next: [
      'Round the duration up to whole weeks and fix it before launch; stopping early when the result looks good inflates false positives.',
      'If the MDE is larger than any effect you could plausibly get, test a bolder change, pick a more sensitive metric, or use CUPED.',
    ],
    report: r.mode === 'mde'
      ? `With ${Math.round(r.n).toLocaleString()} users per arm over ${o.days} days (α = ${o.alpha}, ${pctText(o.power, 0)} power${o.rho ? `, CUPED ρ = ${o.rho}` : ''}), the minimum detectable effect is ${unit(r.mde)} (${pctText(r.rel)} relative).`
      : `Detecting a ${pctText(r.delta / o.base)} relative change needs ${r.n.toLocaleString()} users per arm, about ${r.days} days (α = ${o.alpha}, ${pctText(o.power, 0)} power${o.rho ? `, CUPED ρ = ${o.rho}` : ''}).`,
  };
}

// Confidence rule (delta method): "high" when the CI for the difference excludes 0 and each arm has ≥ 1,000 users;
// "medium" when it excludes 0 with fewer users (the delta method is a large-sample approximation); "low" when the
// interval includes 0.
export function deltaSummary(r, c, t, names = ['Control', 'Treatment']) {
  const sigd = r.lo > 0 || r.hi < 0;
  const big = c.n >= 1000 && t.n >= 1000;
  const confidence = sigd ? (big ? 'high' : 'medium') : 'low';
  const ratio = r.seDiff / Math.sqrt(r.naiveSe ** 2 || 1e-300);
  return {
    headline: `${names[1]}'s ratio is ${fmt(r.rt, 4)} vs ${fmt(r.rc, 4)} for ${names[0]}: a lift of ${pctText(r.lift)} (95% CI ${pctText(r.liftLo)} to ${pctText(r.liftHi)}).`,
    meaning: [
      sigd ? `The 95% interval for the difference (${fmt(r.lo, 4)} to ${fmt(r.hi, 4)}) excludes zero (${pText(r.p)}).` : `The 95% interval for the difference (${fmt(r.lo, 4)} to ${fmt(r.hi, 4)}) includes zero (${pText(r.p)}), so the data are consistent with no change.`,
      'Users were randomised, but the metric is per session (or per page, per click). Sessions from the same user are correlated, so treating each session as independent understates the uncertainty. The delta method gives the right standard error from user-level totals.',
      `Here the delta-method standard error is ${fmt(ratio, 2)}× the one you would get by ignoring the variation in the denominator.`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when the interval excludes zero and both arms have 1,000 or more users; some when it excludes zero with fewer users, since the delta method is a large-sample approximation; weak when the interval includes zero.',
    caveats: [
      'A 95% confidence interval is a range produced by a method that captures the true difference in 95% of repeated experiments; it is not a 95% probability for this particular range.',
      'If the treatment changes the denominator (more or fewer sessions), a ratio can rise while the totals fall. Check the numerator and denominator separately.',
    ],
    next: ['Report the numerator and denominator per user next to the ratio.', 'Run an [SRM check](/calculators/ab-health) on the user counts before trusting the ratio.'],
    report: `${names[1]} vs ${names[0]}: ratio ${fmt(r.rt, 4)} vs ${fmt(r.rc, 4)}, difference ${fmt(r.diff, 4)} (95% CI ${fmt(r.lo, 4)} to ${fmt(r.hi, 4)}, delta-method SE), relative lift ${pctText(r.lift)} (95% CI ${pctText(r.liftLo)} to ${pctText(r.liftHi)}).`,
  };
}

// Confidence rule (non-inferiority): "high" when the conclusion (passes or fails) holds with p < α/5, i.e. far from
// the line; "medium" when p is between α/5 and α or the (1 − 2α) interval touches the margin within 20% of it;
// "low" when the test fails because the interval is wide (it spans both −m and 0), meaning the test was too small.
export function niSummary(r, { kind, unitName = '' }) {
  const u = kind === 'prop' ? (v) => `${(v * 100).toFixed(2)} pp` : (v) => `${fmt(v, 3)}${unitName}`;
  const worseWord = r.higherBetter ? 'lower' : 'higher';
  const wide = r.lo < -r.margin && r.hi > r.margin;
  const confidence = r.ni ? (r.pNI < r.alpha / 5 ? 'high' : 'medium') : wide ? 'low' : 'medium';
  const ciTxt = `${pctText(1 - 2 * r.alpha, 0)} CI ${u(r.lo)} to ${u(r.hi)}`;
  return {
    headline: r.ni
      ? `Non-inferior: the new version is not worse by more than ${u(r.margin)} (difference ${u(r.diff)}, ${ciTxt}, ${pText(r.pNI)}).`
      : `Non-inferiority not shown: the data cannot rule out the new version being ${worseWord} by more than ${u(r.margin)} (difference ${u(r.diff)}, ${ciTxt}).`,
    meaning: [
      `Non-inferiority asks one question: is the new version no more than ${u(r.margin)} worse? It is shown when the ${pctText(1 - 2 * r.alpha, 0)} interval stays on the safe side of −${u(r.margin)}${r.higherBetter ? '' : ' (reversed, since lower is better)'}.`,
      r.eq ? `Equivalence also holds: the interval sits entirely inside ±${u(r.margin)} (TOST ${pText(r.pEq)}).` : `Equivalence (within ±${u(r.margin)} in both directions) is ${r.pEq < r.alpha ? 'shown' : 'not shown'} (TOST ${pText(r.pEq)}).`,
      wide ? 'The interval is wider than the margin on both sides, so the test was too small to answer the question either way.' : 'The margin was set before looking at the data, which is what makes the conclusion valid.',
    ],
    confidence,
    confidenceNote: `Rule: strong when the one-sided p is below α/5 (${fmt(r.alpha / 5, 3)}); some when it is between α/5 and α or the test fails narrowly; weak when the interval spans both the margin and zero, meaning too little data.`,
    caveats: [
      '"Not significantly different" from an ordinary test is not evidence of no harm; only a non-inferiority or equivalence test with a pre-set margin answers that.',
      'Choosing the margin after seeing the result invalidates the test. The margin should be the largest loss the business would accept.',
    ],
    next: r.ni ? ['Ship if the guardrail is the only concern, and keep monitoring it after launch.'] : ['Collect more data, or decide whether a larger margin is genuinely acceptable before re-testing (not after).', 'Use the [sample size planner](/calculators/sample-size) or the MDE mode to size the next run.'],
    report: r.ni
      ? `The new version was non-inferior with a margin of ${u(r.margin)}: difference ${u(r.diff)} (${ciTxt}; one-sided ${pText(r.pNI)}).`
      : `Non-inferiority with a margin of ${u(r.margin)} was not shown: difference ${u(r.diff)} (${ciTxt}; one-sided ${pText(r.pNI)}).`,
  };
}

// Confidence rule (A/A): "high" with at least 100 p-values (the KS test and false-positive rate have reasonable power);
// "medium" with 30–99; "low" with fewer than 30.
export function aaSummary(r) {
  const bad = r.ks.p < 0.05 || r.pBinom < 0.05;
  const confidence = r.n >= 100 ? 'high' : r.n >= 30 ? 'medium' : 'low';
  return {
    headline: bad
      ? `The A/A tests look unhealthy: ${pctText(r.fpr)} of ${r.n} came out "significant" at α = ${r.alpha} (expected ${pctText(r.alpha, 0)}), and the p-values ${r.ks.p < 0.05 ? 'are not uniform' : 'pass the uniformity test'} (KS D = ${fmt(r.ks.D, 3)}, ${pText(r.ks.p)}).`
      : `The A/A tests look healthy: ${pctText(r.fpr)} of ${r.n} came out "significant" at α = ${r.alpha} (expected ${pctText(r.alpha, 0)}), and the p-values are consistent with uniform (KS D = ${fmt(r.ks.D, 3)}, ${pText(r.ks.p)}).`,
    meaning: [
      'In an A/A test both arms get the same experience, so any "significant" result is a false positive. With a sound system, p-values are spread evenly between 0 and 1 and about α of them fall below α.',
      `False-positive rate ${pctText(r.fpr)} (95% CI ${pctText(r.ci.lo)} to ${pctText(r.ci.hi)}); one-sided binomial test of "more than α": ${pText(r.pBinom)}.`,
      bad ? 'A pile-up of small p-values usually means the variance is underestimated: the analysis unit differs from the randomisation unit, users are counted twice, or traffic is correlated (bots, caching).' : 'Neither check shows inflated false positives, so the variance estimates in your pipeline look right.',
    ],
    confidence,
    confidenceNote: 'Rule: strong with 100 or more A/A p-values; some with 30 to 99; weak with fewer than 30, because both checks then miss moderate problems.',
    caveats: ['Passing does not prove the pipeline is sound for every metric: run A/A checks per metric, especially ratio metrics.', 'Too few small p-values (a hump in the middle) also signals a problem: an overestimated variance makes tests too conservative.'],
    next: bad ? ['Check that the analysis unit matches the randomisation unit; use the delta method for ratio metrics.', 'Re-run the A/A set after the fix.'] : ['Repeat A/A checks after pipeline or metric changes.'],
    report: `${r.n} A/A tests: false-positive rate ${pctText(r.fpr)} at α = ${r.alpha} (95% CI ${pctText(r.ci.lo)} to ${pctText(r.ci.hi)}); KS test against a uniform distribution D = ${fmt(r.ks.D, 3)}, ${pText(r.ks.p)}.`,
  };
}
