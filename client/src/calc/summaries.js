// "Reading your results": plain-language study summaries for every calculator, written for UX researchers who are
// not statisticians. Pure functions with no React, so `npm run check:summaries` can test them in Node; the calculators
// page passes their output straight to <StudySummary>. Each function returns
//   { headline, meaning[], confidence: 'high' | 'medium' | 'low', confidenceNote, caveats[], next[], report }.
// Text may link to other pages as [label](/calculators/id) or [label](/methods/id); StudySummary renders the links and
// strips them from the copyable report.
//
// ── How "How sure you can be" is decided ──
// The badge reads Strong / Some / Weak evidence for the headline claim. The rules are deliberately simple and are the
// same wherever the same kind of statistic appears:
//  R1  Rates on a 0–100% scale (completion, top-box, demand): width of the interval in percentage points.
//      Under 20 points high; 20 to 40 medium; over 40 low.
//  R1s Survey margins of error (probability samples): ±5 points or less high; up to ±10 medium; more low.
//  R2  Means on a bounded rating scale: interval width as a share of the scale's range. Up to 10% high, up to 20% medium,
//      more low (SUS, UMUX and TLX 0–100: 10 and 20 points; SEQ 1–7: 0.6 and 1.2; UEQ and AttrakDiff −3 to +3: 0.6 and 1.2).
//  R3  Significance tests: p below 0.01 high; p below the chosen α (1 − confidence level) medium; otherwise low, because
//      the data do not show a difference (which is not the same as showing there is none).
//  R4  Bayesian probability that B beats A: 95% or more (or 5% or less) high; 80% or more (or 20% or less) medium; else low.
//  R5  Effect sizes: interval excludes 0 and its end nearer 0 is at least 0.2 (Cohen's "small") high; excludes 0 medium;
//      includes 0 low.
//  R6  Agreement (kappa, Krippendorff's alpha): under 20 coded segments low, 20 to 49 medium, 50 or more high; and low
//      whenever the kappa interval is wider than 0.4. Reliability (Cronbach's alpha): Feldt interval width up to 0.1 high,
//      up to 0.2 medium, more low.
//  R7  Clusters: average silhouette above 0.5 with stability (mean adjusted Rand index) of 0.8 or more high; silhouette above
//      0.25 medium (and capped at medium until the stability check has been run); otherwise, or stability below 0.6, low.
//      Mixture models: entropy R² ≥ 0.8, smallest average posterior probability ≥ 0.8, at least 10 respondents per parameter,
//      converged, and the best fit reached by two or more runs high; entropy R² ≥ 0.6 and smallest average posterior
//      probability ≥ 0.7 medium; otherwise low. One class (no groups) is low.
//  R8  Descriptive counts with no interval (pricing curves, Kano, MaxDiff, TURF, lostness): under 30 respondents (or
//      showings) low, 30 to 99 medium, 100 or more high, with the per-calculator adjustments noted in each function.
//  R9  Models and formulas (sample size plans, KLM, Fitts, Hick, ROI, readability, expectation quadrants): judged on how
//      far the answer rests on assumptions; see each function.
import * as S from './stats.js';

// ── Formatting ──
const fin = Number.isFinite;
const p0 = (x) => (fin(x) ? `${Math.round(x * 100)}%` : '—');
const p1 = (x) => (fin(x) ? `${(x * 100).toFixed(1)}%` : '—');
const n1 = (x, d = 1) => (fin(x) ? x.toFixed(d) : '—');
const pts = (x) => `${Math.round(Math.abs(x) * 100)} point${Math.round(Math.abs(x) * 100) === 1 ? '' : 's'}`;
const signed = (x, d = 0) => (fin(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}` : '—');
const pEq = (p) => (!fin(p) ? 'p not available' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
const cl = (conf) => `${Math.round(conf * 100)}%`;
// Article for a number written as text: "an 85%", "an 11%", "a 90%".
const aan = (s) => (/^(8|1[18](\D|$))/.test(String(s)) ? `an ${s}` : `a ${s}`);
const secs = (x) => (fin(x) ? (x >= 120 ? `${Math.floor(x / 60)} min ${Math.round(x % 60)} s` : `${x.toFixed(1)} s`) : '—');
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const ord = (n) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; };
const calc = (id, label) => `[${label}](/calculators/${id})`;
const method = (id, label) => `[${label}](/methods/${id})`;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const quote = (s) => `“${s}”`;

// ── Shared wording for the most common misreadings ──
const CI_MEANING = (conf) => `A ${cl(conf)} confidence interval is not ${aan(cl(conf))} chance that the true value lies in this particular range; it means the method captures the true value in ${cl(conf)} of studies run this way.`;
const NOT_SIG = 'Not significant does not mean no difference: it means this sample cannot tell. The interval shows how big a difference is still plausible.';
const P_NOT = 'The p-value is not the chance that the result is wrong, nor the chance that the designs are the same; it is how surprising data like these would be if there were no real difference.';
const SIG_NOT_BIG = 'Statistically significant does not mean important: judge the size of the difference against what matters for the product.';

// ── Confidence rules (see the header) ──
function rateConfidence(lo, hi, conf) {
  const w = Math.round((hi - lo) * 100);
  const level = w < 20 ? 'high' : w <= 40 ? 'medium' : 'low';
  const why = level === 'high' ? 'narrow enough to act on the number itself' : level === 'medium' ? 'precise enough for a direction, not for an exact figure' : 'too wide to pin the rate down; treat it as a rough indication';
  return [level, `The ${cl(conf)} interval is ${w} percentage points wide: ${why}. (Rule: under 20 points strong, 20 to 40 some, over 40 weak.)`];
}
function scaleConfidence(lo, hi, min, max, conf, unit = 'points') {
  const w = hi - lo, share = w / (max - min);
  const level = share <= 0.1 ? 'high' : share <= 0.2 ? 'medium' : 'low';
  const d = max - min > 20 ? 0 : 1;
  return [level, `The ${cl(conf)} interval is ${n1(w, d)} ${unit} wide, ${p0(share)} of the scale's range. (Rule: up to 10% of the range strong, up to 20% some, more weak.)`];
}
function pConfidence(p, alpha, test = 'test') {
  if (p < 0.01) return ['high', `The ${test} gives ${pEq(p)}, well below 0.01. (Rule: p below 0.01 strong, below your α of ${n1(alpha, 2)} some, otherwise weak.)`];
  if (p < alpha) return ['medium', `The ${test} gives ${pEq(p)}: below your α of ${n1(alpha, 2)}, but not by much, so a repeat study could easily land on the other side. (Rule: p below 0.01 strong, below α some, otherwise weak.)`];
  return ['low', `The ${test} gives ${pEq(p)}, above your α of ${n1(alpha, 2)}, so this sample does not show a difference. (Rule: p below 0.01 strong, below α some, otherwise weak.)`];
}
const downgrade = (c) => (c === 'high' ? 'medium' : 'low');
const result = (o) => ({ meaning: [], caveats: [], next: [], ...o });

// ── Measure ──

export function completionRate({ x, n, conf = 0.95 }) {
  const aw = S.adjustedWald(x, n, conf), best = S.bestPoint(x, n, conf), obs = x / n;
  const w = aw.hi - aw.lo, half = w / 2;
  const meaning = [];
  if (w > 0.3) {
    const claim = aw.lo >= 0.5 ? 'you can say most users can complete it, not how many exactly' : aw.hi <= 0.5 ? 'you can say fewer than half of users can complete it, not how many exactly' : 'it cannot even tell you whether most users can complete it';
    meaning.push(`The range is wide because ${n} ${n === 1 ? 'person is' : 'people is'} a small sample: ${claim}.`);
  } else meaning.push(`The range is narrow enough to report the rate to within about ±${pts(half)}.`);
  if (aw.lo > 0.78) meaning.push('Even the low end is above 78%, the average completion rate Sauro found across about 1,200 usability tasks (MeasuringU, 2011), so this task does better than a typical task.');
  else if (aw.hi < 0.78) meaning.push('Even the high end is below 78%, the average completion rate Sauro found across about 1,200 usability tasks (MeasuringU, 2011), so this task is harder than a typical task.');
  else meaning.push('The range includes 78%, the average completion rate Sauro found across about 1,200 usability tasks (MeasuringU, 2011), so you cannot yet say whether this task is easier or harder than a typical one.');
  if (x === n) meaning.push(`Everyone in the sample succeeded, but that does not mean every user will: the cautious reading is that at least about ${p0(aw.lo)} would.`);
  else if (x === 0) meaning.push(`Nobody succeeded. A task no one in your sample could finish is a problem to fix before measuring again; up to about ${p0(aw.hi)} of users might still manage it.`);
  else meaning.push(`Look at why the ${n - x} ${n - x === 1 ? 'person' : 'people'} who failed did so: the reasons tell you what to fix, the rate only how often.`);
  const [confidence, confidenceNote] = rateConfidence(aw.lo, aw.hi, conf);
  const caveats = [CI_MEANING(conf), 'The rate describes people like your participants doing this task in this setting; if they were more expert or more motivated than real users, the real rate is lower.'];
  if (x === n || x === 0) caveats.push(`"${x === n ? '100%' : '0%'} of participants" is a fact about your sample, not about all users.`);
  const next = [];
  const target = half > 0.2 ? 0.15 : half > 0.1 ? 0.1 : null;
  if (target) {
    const need = S.nForProportion(clamp(best.value, 0.1, 0.9), target, conf);
    if (need > n) next.push(`Test about ${need - n} more people (${need} in total) to narrow the range to roughly ±${pts(target)}; see the ${calc('sample-size', 'Sample size planner')}.`);
  }
  next.push(`To check the rate against a target, such as 78% or last release's rate, use ${calc('rate-benchmark', 'Completion rate vs benchmark')}.`);
  return result({
    headline: `${x} of ${n} people (${p0(obs)}) completed the task; for all users the plausible range is ${p0(aw.lo)} to ${p0(aw.hi)} (${cl(conf)} confidence).`,
    meaning, confidence, confidenceNote, caveats, next,
    report: `${x} of ${n} participants (${p0(obs)}) completed the task (${cl(conf)} confidence interval ${p0(aw.lo)} to ${p0(aw.hi)}, adjusted Wald).`,
  });
}

export function taskTime({ times, conf = 0.95, target = NaN }) {
  const r = S.timeCI(times, conf);
  const useMed = r.recommend === 'median' && fin(r.medLo);
  const lo = useMed ? r.medLo : r.geoLo, hi = useMed ? r.medHi : r.geoHi, pt = useMed ? r.median : r.geo;
  const name = useMed ? 'median' : 'geometric mean';
  const min = Math.min(...times), max = Math.max(...times);
  const meaning = [];
  if (r.mean > pt * 1.08) meaning.push(`The ordinary average is ${secs(r.mean)}, higher because a few slow attempts pull it up. The ${name} (${secs(pt)}) is closer to what most people experienced, so report that.`);
  meaning.push(`About half of users will take longer than the typical time. If people must finish within a limit, look at the slower times, not the typical one: here they ranged from ${secs(min)} to ${secs(max)}${max / min >= 2 ? `, so the slowest took ${n1(max / min, 1)} times as long as the fastest; watch those sessions for the cause` : ''}.`);
  if (fin(target)) meaning.push(hi < target ? `The whole range is under your ${secs(target)} target, so the typical user meets it.` : lo > target ? `The whole range is above your ${secs(target)} target, so the typical user misses it.` : `Your ${secs(target)} target lies inside the range, so you cannot yet tell whether the typical user meets it.`);
  const rel = (hi - lo) / pt;
  const confidence = rel <= 0.25 ? 'high' : rel <= 0.5 ? 'medium' : 'low';
  // Rule for times: the interval's width relative to the typical time, up to 25% strong, up to 50% some, more weak.
  const confidenceNote = `The ${cl(conf)} interval is ${secs(hi - lo)} wide, ${p0(rel)} of the typical time, from ${r.n} times. (Rule: up to 25% of the typical time strong, up to 50% some, more weak.)`;
  return result({
    headline: `The typical participant took about ${secs(pt)} (${name}); for all users the typical time is plausibly ${secs(lo)} to ${secs(hi)} (${cl(conf)} confidence).`,
    meaning, confidence, confidenceNote,
    caveats: ['Leave failed attempts out: a design can look fast because the people who struggled gave up early.', 'Times from a think-aloud session are slower than real use, so compare them only with times collected the same way.'],
    next: [`To compare two designs, use ${calc('compare-means', 'Compare two means')} with "Task times", which works on the log scale.`, `For an error-free expert baseline to compare against, model the task with the ${calc('klm', 'KLM task-time predictor')}.`],
    report: `The typical time on task was ${secs(pt)} (${name}; ${cl(conf)} confidence interval ${secs(lo)} to ${secs(hi)}, n = ${r.n}).`,
  });
}

const BENCH_SOURCE = {
  sus: 'The benchmark of 68 is the average SUS score across about 500 studies in Sauro\'s database (Sauro 2011).',
  seq: 'The benchmark of 5.5 is about the average SEQ across several hundred tasks in Sauro\'s data (MeasuringU).',
  umux: 'The benchmark of 68 is the SUS average (Sauro 2011); compare UMUX-Lite with it only after converting it to the SUS scale in the [UMUX scorer](/calculators/umux-lite).',
};
export function rating({ preset = 'custom', label = 'rating', min, max, M, SD, N, B, conf = 0.95 }) {
  if (preset === 'custom') label = 'rating';
  const ci = S.meanCI(M, SD, N, conf);
  const t = fin(B) && SD > 0 ? S.oneSampleT(M, SD, N, B) : null;
  const d = max - min > 20 ? 1 : 2;
  const meaning = [];
  let rel = '';
  if (t) {
    if (ci.lo > B) { meaning.push(`The whole interval is above the benchmark of ${n1(B, d)}, so the mean is reliably higher (one-sided ${pEq(t.pOne)}).`); rel = `, reliably above the benchmark of ${n1(B, d)} (one-sided ${pEq(t.pOne)})`; }
    else if (ci.hi < B) { meaning.push(`The whole interval is below the benchmark of ${n1(B, d)}, so the mean is reliably lower (two-sided ${pEq(t.pTwo)}).`); rel = `, reliably below the benchmark of ${n1(B, d)} (two-sided ${pEq(t.pTwo)})`; }
    else { meaning.push(`The interval includes the benchmark of ${n1(B, d)}, so you cannot yet say the mean differs from it.`); rel = `, not distinguishable from the benchmark of ${n1(B, d)} (two-sided ${pEq(t.pTwo)})`; }
    if ((preset === 'sus' || preset === 'umux') && B === 68) meaning.push(BENCH_SOURCE[preset]);
    if (preset === 'seq' && B === 5.5) meaning.push(BENCH_SOURCE.seq);
  }
  if (preset === 'sus') meaning.push(`On the Sauro-Lewis curved grading scale the mean earns grade ${S.susGrade(M)[1]}; across the interval it could be anything from ${S.susGrade(clamp(ci.lo, 0, 100))[1]} to ${S.susGrade(clamp(ci.hi, 0, 100))[1]}.`);
  const [confidence, confidenceNote] = scaleConfidence(ci.lo, ci.hi, min, max, conf);
  const caveats = [CI_MEANING(conf)];
  if (t && ci.lo <= B && ci.hi >= B) caveats.push(NOT_SIG); else caveats.push(P_NOT);
  if (t) caveats.push('A benchmark comparison only holds if you asked the question with the same wording and scale as the benchmark studies.');
  const next = [];
  const target = (max - min) * 0.05;
  if (ci.me > target * 1.2) next.push(`About ${S.nForMean(SD, target, conf)} people would narrow the interval to ±${n1(target, d)}; see the ${calc('sample-size', 'Sample size planner')}.`);
  next.push(`To compare two designs or versions, use ${calc('compare-means', 'Compare two means')}.`);
  return result({
    headline: `The mean ${label} score was ${n1(M, d)} from ${N} people; the true mean is plausibly between ${n1(ci.lo, d)} and ${n1(ci.hi, d)} (${cl(conf)} confidence).`,
    meaning, confidence, confidenceNote, caveats, next,
    report: `The mean ${label} score was ${n1(M, d)} (SD ${n1(SD, d)}, n = ${N}; ${cl(conf)} confidence interval ${n1(ci.lo, d)} to ${n1(ci.hi, d)})${rel}.`,
  });
}

export function sus({ scores, conf = 0.95 }) {
  const n = scores.length, M = S.mean(scores), SD = n > 1 ? S.sd(scores) : NaN;
  const ci = n > 1 && SD > 0 ? S.meanCI(M, SD, n, conf) : null;
  const g = S.susGrade(M), pc = S.susPercentile(M);
  const meaning = [];
  if (ci) {
    meaning.push(ci.lo > 68 ? 'The whole interval is above 68, the average SUS across about 500 studies in Sauro\'s database (Sauro 2011): people find it more usable than a typical product.'
      : ci.hi < 68 ? 'The whole interval is below 68, the average SUS across about 500 studies in Sauro\'s database (Sauro 2011): people find it less usable than a typical product.'
        : `The interval (${n1(ci.lo)} to ${n1(ci.hi)}) includes 68, the average SUS across about 500 studies in Sauro's database (Sauro 2011), so you cannot yet say it is better or worse than a typical product.`);
    meaning.push(`With ${n} ${n === 1 ? 'person' : 'people'}, the true mean could plausibly be anything from grade ${S.susGrade(clamp(ci.lo, 0, 100))[1]} to grade ${S.susGrade(clamp(ci.hi, 0, 100))[1]}.`);
  } else meaning.push(`The mean is ${M >= 68 ? 'above' : 'below'} 68, the average SUS in Sauro's database (Sauro 2011), but ${n === 1 ? 'one person gives no interval' : 'the scores do not vary, so there is no interval'}.`);
  meaning.push(`On Bangor, Kortum and Miller's (2009) adjective scale, ${n1(M)} is closest to ${quote(S.susAdjective(M).toLowerCase())}.`);
  const [confidence, confidenceNote] = ci ? scaleConfidence(ci.lo, ci.hi, 0, 100, conf) : ['low', 'There is no interval to judge, so any reading is tentative.'];
  const sdPlan = n >= 5 && SD > 0 ? SD : 17.7;
  const need = S.nForMean(sdPlan, 5, conf);
  return result({
    headline: `The mean SUS score was ${n1(M)} from ${plural(n, 'participant')}: grade ${g[1]} on the Sauro-Lewis curved scale, about the ${ord(pc)} percentile.`,
    meaning, confidence, confidenceNote,
    caveats: [`SUS is not a percentage: ${n1(M, 0)} means better than about ${pc}% of the products in Sauro's benchmark, not "${n1(M, 0)}% usable".`, 'SUS says how usable people felt the product was overall, not which problems to fix; pair it with what you observed.', 'Only the total score is benchmarked; do not read single items against 68.'],
    next: [need > n ? `About ${need} participants would narrow the interval to ±5 points (assuming an SD of ${n1(sdPlan)}); see the ${calc('sample-size', 'Sample size planner')}.` : 'The interval is already about ±5 points or narrower.', `For a formal test against 68 or a competitor's score, use ${calc('rating', 'Rating scale and benchmark')}; to compare two designs, ${calc('compare-means', 'Compare two means')}.`],
    report: `The mean SUS score was ${n1(M)}${ci ? ` (${cl(conf)} confidence interval ${n1(ci.lo)} to ${n1(ci.hi)}, n = ${n})` : ` (n = ${n})`}, grade ${g[1]} on the Sauro-Lewis curved grading scale, around the ${ord(pc)} percentile of Sauro's benchmark (average 68).`,
  });
}

export function umux({ form, scores }) {
  const n = scores.length, M = S.mean(scores), SD = n > 1 ? S.sd(scores) : NaN;
  const ci = n > 1 && SD > 0 ? S.meanCI(M, SD, n, 0.95) : null;
  const toSus = (v) => (form === 'lite' ? S.umuxLiteToSus(v) : v);
  const sus = toSus(M), name = form === 'lite' ? 'UMUX-Lite' : 'UMUX';
  const meaning = [form === 'lite'
    ? 'The SUS equivalent uses Lewis, Utesch and Maher\'s (2013) regression, 0.65 × UMUX-Lite + 22.9; read grades and the SUS average of 68 against that figure, not against the raw score.'
    : 'The four-item UMUX tracks SUS closely (r = 0.96 in Finstad\'s 2010 validation), so the SUS average of 68 is a reasonable reference.'];
  if (ci) {
    const lo = toSus(ci.lo), hi = toSus(ci.hi);
    meaning.push(lo > 68 ? `On the SUS scale the whole interval (${n1(lo)} to ${n1(hi)}) is above 68, the average in Sauro's database (Sauro 2011).` : hi < 68 ? `On the SUS scale the whole interval (${n1(lo)} to ${n1(hi)}) is below 68, the average in Sauro's database (Sauro 2011).` : `On the SUS scale the interval (${n1(lo)} to ${n1(hi)}) includes 68, the average in Sauro's database (Sauro 2011), so you cannot say whether it is above or below average.`);
  }
  const [confidence, confidenceNote] = ci ? scaleConfidence(ci.lo, ci.hi, 0, 100, 0.95) : ['low', 'With one response, or identical responses, there is no interval, so any reading is tentative.'];
  return result({
    headline: `The mean ${name} was ${n1(M)} from ${plural(n, 'participant')}, about ${n1(sus)} on the SUS scale (grade ${S.susGrade(sus)[1]}).`,
    meaning, confidence, confidenceNote,
    caveats: [form === 'lite' ? 'The SUS conversion is an average relationship across products; an individual product\'s SUS could differ from it by several points.' : 'UMUX and SUS are close but not identical; say which questionnaire you used when you quote a grade.', 'Fewer items means less precision per person than the ten-item SUS, so expect a wider interval for the same sample.'],
    next: [`For a formal test against a benchmark, enter the scores in ${calc('rating', 'Rating scale and benchmark')}.`, `To compare two designs, use ${calc('compare-means', 'Compare two means')}.`],
    report: `The mean ${name} score was ${n1(M)}${ci ? ` (95% confidence interval ${n1(ci.lo)} to ${n1(ci.hi)}, n = ${n})` : ` (n = ${n})`}, equivalent to about ${n1(sus)} on the SUS scale${form === 'lite' ? ' (Lewis, Utesch and Maher 2013 regression)' : ''}.`,
  });
}

export function nps({ P, PA, D, conf = 0.9 }) {
  const r = S.nps(P, PA, D, conf);
  const sc = r.score * 100, lo = r.lo * 100, hi = r.hi * 100, w = hi - lo;
  const z = S.zFor(conf), na = r.n + 3, pp = (P + 0.75) / na, pd = (D + 0.75) / na, v = pp + pd - (pp - pd) ** 2;
  const need = Math.max(1, Math.ceil(z * z * v / 0.01 - 3));
  const meaning = [
    'NPS is the share of promoters (9–10) minus the share of detractors (0–6), from −100 to +100. There is no universal good score: published benchmarks vary widely by industry, so compare with your own earlier waves or a benchmark from the same industry measured the same way.',
    `${p0(r.pctPass)} are passives (7–8): they do not count in the score, but turning them into promoters raises it.`,
    `With samples this size, a change between two waves smaller than about ${Math.round((w / 2) * Math.SQRT2)} points cannot be told apart from noise.`,
  ];
  if (D > P) meaning.splice(1, 0, 'More people are detractors than promoters: read what the detractors said first.');
  const level = w <= 20 ? 'high' : w <= 40 ? 'medium' : 'low';
  return result({
    headline: `NPS is ${signed(sc)} from ${r.n} responses (${p0(r.pctProm)} promoters, ${p0(r.pctDet)} detractors); the true NPS is plausibly between ${signed(lo)} and ${signed(hi)} (${cl(conf)} confidence).`,
    meaning, confidence: level,
    confidenceNote: `The ${cl(conf)} interval is ${Math.round(w)} NPS points wide. (Rule: up to 20 points strong, up to 40 some, more weak; NPS from a few dozen people swings a lot.)`,
    caveats: ['NPS from a small sample swings a lot between waves; do not report a few points of change as a trend.', 'Likelihood to recommend is a stated intention, not behaviour, and it does not say why people feel this way.', 'Do not compare NPS from surveys asked at different moments (straight after a support call versus a random sample of customers).'],
    next: [`Ask an open follow-up ("What is the main reason for your score?") and code the answers; if two people code, check them with ${calc('intercoder', 'Inter-coder agreement')}.`, need > r.n ? `About ${need} responses would narrow the range to roughly ±10 points.` : 'The interval is already about ±10 points or narrower.'],
    report: `NPS was ${signed(sc)} (${cl(conf)} confidence interval ${signed(lo)} to ${signed(hi)}, adjusted Wald; n = ${r.n}: ${p0(r.pctProm)} promoters, ${p0(r.pctPass)} passives, ${p0(r.pctDet)} detractors).`,
  });
}

// ── Compare ──

export function compareRatesBetween({ x1, n1: na, x2, n2: nb, conf = 0.9 }) {
  const r = S.twoProportions(x1, na, x2, nb, conf);
  const fisher = r.minExpected < 1;
  const p = fisher ? S.fisherExact(x1, na - x1, x2, nb - x2) : r.p;
  const alpha = 1 - conf, sig = p < alpha;
  const d = r.p2 - r.p1, lo = -r.hi, hi = -r.lo;
  const dir = d > 0 ? 'higher' : d < 0 ? 'lower' : 'the same as';
  const test = fisher ? 'Fisher exact test' : 'N−1 two-proportion test';
  const meaning = [`The true difference (B − A) is plausibly between ${signed(lo * 100)} and ${signed(hi * 100)} points (${cl(conf)} confidence).`];
  if (sig) meaning.push(lo > 0 ? `So B is better, by at least about ${pts(lo)} and perhaps as much as ${pts(hi)}.` : `So A is better, by at least about ${pts(-hi)} and perhaps as much as ${pts(-lo)}.`);
  else meaning.push(`That range includes zero and differences as large as ${pts(Math.max(Math.abs(lo), Math.abs(hi)))}, so the test cannot tell you which design is better yet.`);
  if (fisher) meaning.push('An expected count is below 1, so the Fisher exact test is used instead of the N−1 test.');
  const [confidence, confidenceNote] = pConfidence(p, alpha, test);
  const next = [];
  if (!sig && d !== 0) {
    const need = S.nForProportions(clamp(r.p1, 0.01, 0.99), clamp(r.p2, 0.01, 0.99), conf, 0.8);
    next.push(`If the true difference is as big as this sample suggests, you would need about ${need} people per design for an 80% chance of detecting it; see the ${calc('sample-size', 'Sample size planner')}.`);
  } else next.push('Watch the failures on the weaker design: the reasons tell you what to fix.');
  next.push('If the same people tried both designs, switch to "The same people" (McNemar), which is more sensitive.');
  return result({
    headline: `Design B's completion rate was ${d === 0 ? 'the same as' : `${pts(d)} ${dir} than`} design A's (${p0(r.p2)} vs ${p0(r.p1)}); the difference is ${sig ? '' : 'not '}statistically significant (${pEq(p)}).`,
    meaning, confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, P_NOT, 'Different people tried each design, so differences between the groups (experience, device) could also explain a gap; assign people to designs at random.'],
    next,
    report: `Design B's completion rate was ${p0(r.p2)} (${x2}/${nb}) against ${p0(r.p1)} (${x1}/${na}) for design A, a difference of ${signed(d * 100)} points (${cl(conf)} confidence interval ${signed(lo * 100)} to ${signed(hi * 100)} points; ${test}, ${pEq(p)}).`,
  });
}

export function compareRatesWithin({ a, b, c, d, conf = 0.9 }) {
  const r = S.mcnemar(a, b, c, d, conf);
  const n = a + b + c + d, alpha = 1 - conf, sig = r.midP < alpha;
  const diff = r.pB - r.pA, lo = -r.hi, hi = -r.lo;
  const [confidence, confidenceNote] = pConfidence(r.midP, alpha, 'McNemar mid-p test');
  return result({
    headline: `The same ${n} people succeeded ${p0(r.pB)} of the time on design B and ${p0(r.pA)} on design A; the difference is ${sig ? '' : 'not '}statistically significant (mid-${pEq(r.midP)}).`,
    meaning: [
      `Only the ${b + c} people who succeeded on one design but not the other carry information about the difference: ${c} did better on B and ${b} on A.`,
      `The true difference (B − A) is plausibly between ${signed(lo * 100)} and ${signed(hi * 100)} points (${cl(conf)} confidence).`,
      sig ? (diff > 0 ? 'So B helps more people succeed than A.' : 'So A helps more people succeed than B.') : 'That range includes zero, so this sample cannot tell you which design is better.',
    ],
    confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, 'Because the same people tried both designs, what they learned on the first can help on the second; check that half saw A first and half saw B first.', P_NOT],
    next: [b + c < 10 ? `Only ${b + c} people switched outcome between designs; test more people to get a usable comparison.` : 'Look at the people who failed on one design but not the other: they show what makes the difference.', `To plan the size of a follow-up, use the ${calc('sample-size', 'Sample size planner')} ("Compare rates").`],
    report: `${n} participants tried both designs: ${p0(r.pB)} succeeded on B and ${p0(r.pA)} on A (difference ${signed(diff * 100)} points, ${cl(conf)} confidence interval ${signed(lo * 100)} to ${signed(hi * 100)}; McNemar exact mid-${pEq(r.midP)}).`,
  });
}

const cohenSource = (x) => `a ${S.effectLabel(x)} effect by Cohen's (1988) conventions of 0.2 small, 0.5 medium and 0.8 large`;
const EFFECT_CONTEXT = "Cohen's bands are generic, not judgements of importance: a small effect on checkout completion can matter more than a large one on a rarely used setting.";

export function compareMeansBetween({ m1, s1, n1: na, m2, s2, n2: nb, conf = 0.95 }) {
  const r = S.welch(m2, s2, nb, m1, s1, na, conf), es = S.effectSize(m1, s1, na, m2, s2, nb, conf);
  const alpha = 1 - conf, sig = r.p < alpha;
  const dir = r.diff >= 0 ? 'higher' : 'lower';
  const meaning = [`The true difference (B − A) is plausibly between ${n1(r.lo, 2)} and ${n1(r.hi, 2)} (${cl(conf)} confidence).`];
  meaning.push(sig ? `So design B is ${dir}, by at least ${n1(Math.min(Math.abs(r.lo), Math.abs(r.hi)), 2)}.` : `That range includes zero, and differences as large as ${n1(Math.max(Math.abs(r.lo), Math.abs(r.hi)), 2)} either way, so this sample cannot tell you which design is better.`);
  meaning.push(`Cohen's d is ${n1(es.d, 2)}: ${cohenSource(es.d)}.`);
  const [confidence, confidenceNote] = pConfidence(r.p, alpha, "Welch's t-test");
  const next = [];
  if (!sig && Math.abs(r.diff) > 0) next.push(`If the true difference is as big as this sample suggests (${n1(Math.abs(r.diff), 2)}), you would need about ${S.nForMeans(es.sp, Math.abs(r.diff), conf, 0.8, 'between')} people per design for an 80% chance of detecting it; see the ${calc('sample-size', 'Sample size planner')}.`);
  next.push(`For the effect size with its own interval, use the ${calc('effect-size', 'Effect size')} calculator; for skewed ratings, check with the ${calc('nonparametric', 'Nonparametric comparison')}.`);
  return result({
    headline: `Design B scored ${n1(Math.abs(r.diff), 2)} ${dir} than design A on average (${n1(m2, 2)} vs ${n1(m1, 2)}); the difference is ${sig ? '' : 'not '}statistically significant (${pEq(r.p)}).`,
    meaning, confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, P_NOT, EFFECT_CONTEXT],
    next,
    report: `Design B averaged ${n1(m2, 2)} (SD ${n1(s2, 2)}, n = ${nb}) against ${n1(m1, 2)} (SD ${n1(s1, 2)}, n = ${na}) for design A, a difference of ${n1(r.diff, 2)} (${cl(conf)} confidence interval ${n1(r.lo, 2)} to ${n1(r.hi, 2)}; Welch's t(${n1(r.df, 1)}) = ${n1(r.t, 2)}, ${pEq(r.p)}; Cohen's d = ${n1(es.d, 2)}).`,
  });
}

export function compareMeansWithin({ diffs, logT = false, conf = 0.95 }) {
  const r = S.pairedT(diffs, conf), alpha = 1 - conf, sig = r.p < alpha, dz = r.diff / r.sd;
  const shown = (x) => (logT ? `${signed((Math.exp(x) - 1) * 100)}%` : signed(x, 2));
  const what = logT
    ? `design B times were ${Math.abs(Math.round((Math.exp(r.diff) - 1) * 100))}% ${r.diff < 0 ? 'shorter' : 'longer'} than design A's`
    : `design B scored ${n1(Math.abs(r.diff), 2)} ${r.diff >= 0 ? 'higher' : 'lower'} than design A`;
  const [confidence, confidenceNote] = pConfidence(r.p, alpha, 'paired t-test');
  return result({
    headline: `For the same ${r.n} people, ${what} on average; the difference is ${sig ? '' : 'not '}statistically significant (${pEq(r.p)}).`,
    meaning: [
      `The true average change (B − A) is plausibly between ${shown(r.lo)} and ${shown(r.hi)} (${cl(conf)} confidence)${logT ? ', where negative means faster' : ''}.`,
      sig ? 'The whole range is on one side of zero, so the direction is settled; the range says how big the change might be.' : 'That range includes zero, so this sample cannot tell which design is better.',
      `The effect size d_z is ${n1(dz, 2)} (the mean change divided by the spread of changes). It is not comparable with a between-groups d, so do not apply Cohen's bands to it directly.`,
    ],
    confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, 'People can learn on the first design they try; check that the order was counterbalanced.', P_NOT],
    next: [`For ratings that are clearly not normal, check the result with the ${calc('nonparametric', 'Nonparametric comparison')} (Wilcoxon).`, `To plan a larger study, use the ${calc('sample-size', 'Sample size planner')} ("Compare scores", same people).`],
    report: `For the same ${r.n} participants, ${what} (mean ${logT ? 'change' : 'difference'} ${shown(r.diff)}, ${cl(conf)} confidence interval ${shown(r.lo)} to ${shown(r.hi)}; paired t(${r.df}) = ${n1(r.t, 2)}, ${pEq(r.p)}).`,
  });
}

export function rateBenchmark({ x, n, b, conf = 0.9 }) {
  const r = S.proportionVsBenchmark(x, n, b), ci = S.adjustedWald(x, n, 1 - 2 * (1 - conf)), obs = x / n;
  const alpha = 1 - conf, met = r.p < alpha;
  const meaning = [`You can be ${cl(conf)} confident that the true rate is at least ${p0(ci.lo)}.`];
  if (!met && obs > b) meaning.push(`The sample is above ${p0(b)}, but with ${n} people that could be luck; more participants may settle it.`);
  if (!met && obs <= b) meaning.push(`The sample itself is at or below ${p0(b)}: rather than testing more people, find out why people failed.`);
  if (Math.abs(b - 0.78) < 1e-9) meaning.push('78% is the average completion rate Sauro found across about 1,200 usability tasks (MeasuringU, 2011).');
  const [confidence, confidenceNote] = pConfidence(r.p, alpha, `one-sided ${r.large ? 'normal' : 'mid-p binomial'} test`);
  const next = [];
  if (!met && obs > b) {
    let need = null;
    for (let m = n + 1; m <= 2000; m++) { const xm = Math.round(obs * m); if (xm <= m && S.proportionVsBenchmark(xm, m, b).p < alpha) { need = m; break; } }
    if (need) next.push(`If later participants succeed at the same rate (${p0(obs)}), about ${need} in total would be enough to clear the benchmark.`);
  }
  next.push(`For the full interval around the rate, use the ${calc('completion-rate', 'Completion rate interval')}.`);
  return result({
    headline: `${x} of ${n} people (${p0(obs)}) succeeded, which ${met ? 'is enough to show' : 'does not yet show'} that more than ${p0(b)} of all users would (one-sided ${pEq(r.p)}).`,
    meaning, confidence, confidenceNote,
    caveats: [met ? 'Beating the benchmark says the rate is above it, not by how much; the lower bound is the safe figure to quote.' : NOT_SIG, P_NOT],
    next,
    report: `${x} of ${n} participants (${p0(obs)}) completed the task; ${met ? 'the completion rate is above' : 'the data do not show the completion rate is above'} the ${p0(b)} benchmark (one-sided ${r.large ? 'normal approximation' : 'exact mid-p binomial'} ${pEq(r.p)}; ${cl(conf)} lower bound ${p0(ci.lo)}).`,
  });
}

// ── Plan ──

// R9 for plans: "Some evidence" when the assumptions are cautious, "Weak" when the discovery plan assumes problems as common
// as Nielsen and Landauer's 31% average (optimistic for most products). A plan never earns "Strong": it rests on guesses.
export function sampleSize(o) {
  const { goal, conf = 0.9, power = 0.8 } = o;
  if (goal === 'discovery') {
    const n = S.discoveryN(o.p, o.want), alt = S.discoveryN(o.p * 2 / 3, o.want);
    return result({
      headline: `Test ${n} participants for ${aan(p0(o.want))} chance of seeing, at least once, any given problem that affects ${p0(o.p)} of users.`,
      meaning: [`This is not ${p0(o.want)} of all problems: problems rarer than ${p0(o.p)} have a lower chance of showing up, and problems that only some kinds of user hit need those users in the sample.`, 'Several small rounds with fixes in between usually find more than one large round, because fixing the obvious problems uncovers the ones they were hiding.'],
      confidence: o.p >= 0.31 ? 'low' : 'medium',
      confidenceNote: o.p >= 0.31 ? `${p0(o.p)} matches or exceeds Nielsen and Landauer's (1993) 31% average, which is optimistic for most products; if problems affect ${p0(o.p * 2 / 3)} instead, you would need ${alt}.` : `A plan is only as good as its assumption about how common problems are: if they affect ${p0(o.p * 2 / 3)} instead of ${p0(o.p)}, you would need ${alt}.`,
      caveats: ['The formula assumes every participant is equally likely to hit each problem; real users differ, so treat the result as a minimum.'],
      next: [`After testing, check how much you found with ${calc('discovery', 'Problems left to find')} or ${calc('capture-recapture', 'Capture-recapture estimate')}.`],
      report: `We planned ${n} participants, giving ${aan(p0(o.want))} chance of observing any problem that affects at least ${p0(o.p)} of users (1 − (1 − p)^n).`,
    });
  }
  if (goal === 'rate') {
    const n = S.nForProportion(o.prop, o.margin, conf), worst = S.nForProportion(0.5, o.margin, conf);
    return result({
      headline: `About ${n} participants estimate a completion rate to within ±${pts(o.margin)} at ${cl(conf)} confidence, if the rate is near ${p0(o.prop)}.`,
      meaning: ['The margin is widest when the rate is near 50%, so a guess near 50% is the safe choice if you have no idea.', 'Small usability samples give wide intervals; this tells you what precision your budget buys.'],
      confidence: 'medium',
      confidenceNote: worst > n ? `It assumes a rate near ${p0(o.prop)}; if it turns out nearer 50%, you would need ${worst}.` : 'It already assumes the worst case (a rate near 50%), so the plan is cautious.',
      caveats: ['Add 10 to 20% for no-shows and unusable sessions.'],
      next: [`After the study, report the interval with the ${calc('completion-rate', 'Completion rate interval')}.`],
      report: `We planned ${n} participants to estimate the completion rate within ±${pts(o.margin)} at ${cl(conf)} confidence (adjusted-Wald planning, assumed rate ${p0(o.prop)}).`,
    });
  }
  if (goal === 'mean') {
    const n = S.nForMean(o.sd, o.margin, conf), alt = S.nForMean(o.sd * 1.2, o.margin, conf);
    return result({
      headline: `About ${n} participants estimate a mean score to within ±${n1(o.margin)} at ${cl(conf)} confidence, if the SD is about ${n1(o.sd)}.`,
      meaning: ['The required sample grows with the square of the SD and falls with the square of the margin: halving the margin needs about four times as many people.'],
      confidence: 'medium',
      confidenceNote: `The plan depends on the SD you entered: if the true SD is 20% larger, you would need about ${alt}.`,
      caveats: ['Take the SD from an earlier study of the same measure if you can; a guess that is too low leaves the study short.'],
      next: [`After the study, report the interval with ${calc('rating', 'Rating scale and benchmark')}.`],
      report: `We planned ${n} participants to estimate the mean within ±${n1(o.margin)} at ${cl(conf)} confidence (assumed SD ${n1(o.sd)}).`,
    });
  }
  if (goal === 'means') {
    const n = S.nForMeans(o.sd, o.diff, conf, power, o.design), alt = S.nForMeans(o.sd * 1.2, o.diff, conf, power, o.design);
    const per = o.design === 'between';
    return result({
      headline: `About ${n} ${per ? `per group (${n * 2} in total)` : 'participants'} give ${aan(p0(power))} chance of detecting a true difference of ${n1(o.diff)} at ${cl(conf)} confidence.`,
      meaning: [`Power is the chance of a significant result if the true difference is exactly ${n1(o.diff)}; smaller real differences will often be missed.`, per ? 'Testing the same people on both designs usually needs far fewer participants, because each person is compared with themselves.' : 'Within subjects, the SD that matters is the SD of each person\'s difference; if you used the SD of scores, this is cautious.'],
      confidence: 'medium',
      confidenceNote: `The plan depends on the SD and the difference you entered: if the SD is 20% larger, you would need about ${alt}${per ? ' per group' : ''}.`,
      caveats: ['A non-significant result from a study planned this way still does not show the designs are the same.'],
      next: [`After the study, analyse it with ${calc('compare-means', 'Compare two means')}.`],
      report: `We planned ${per ? `${n} participants per design (${n * 2} in total)` : `${n} participants`} for ${p0(power)} power to detect a difference of ${n1(o.diff)} at α = ${n1(1 - conf, 2)} (two-sided; assumed SD ${n1(o.sd)}).`,
    });
  }
  const n = S.nForProportions(o.pa, o.pb, conf, power);
  return result({
    headline: `About ${n} per group (${n * 2} in total) give ${aan(p0(power))} chance of detecting a change from ${p0(o.pa)} to ${p0(o.pb)} at ${cl(conf)} confidence.`,
    meaning: ['Detecting small changes in rates needs large samples; usability tests of 5 to 10 people can only detect very large differences.', 'If the real change is smaller than the one you entered, the study will often miss it.'],
    confidence: 'medium',
    confidenceNote: `The plan assumes the change you entered (${pts(o.pb - o.pa)}); halving the change needs roughly four times as many people.`,
    caveats: ['A non-significant result from a study planned this way still does not show the designs are the same.'],
    next: [`After the study, analyse it with ${calc('compare-rates', 'Compare two completion rates')}.`],
    report: `We planned ${n} participants per design (${n * 2} in total) for ${p0(power)} power to detect a change from ${p0(o.pa)} to ${p0(o.pb)} at α = ${n1(1 - conf, 2)} (two-sided).`,
  });
}

// R9 for discovery: fewer than 5 participants, or more than half the problems seen only once, weak; 10 or more
// participants with at most 30% one-off problems strong; otherwise some.
export function discovery({ N, counts }) {
  const pEst = S.mean(counts.map((c) => c / N)), once = counts.filter((c) => c === 1).length / counts.length;
  const pAdj = S.adjustP(pEst, N, once), found = S.discoveryProb(pAdj, N), total = counts.length / found;
  const remaining = Math.max(0, Math.round(total - counts.length));
  const more = [0.9, 0.95].map((g) => Math.max(0, S.discoveryN(pAdj, g) - N));
  const confidence = N < 5 || once > 0.5 ? 'low' : N >= 10 && once <= 0.3 ? 'high' : 'medium';
  return result({
    headline: `Your ${N} participants have probably uncovered about ${p0(found)} of the problems this test could reveal: ${counts.length} found, about ${Math.round(total)} in total, so roughly ${remaining} not yet seen.`,
    meaning: [
      `After Lewis's (2001) small-sample adjustment, the average problem affects about ${p0(pAdj)} of users (the raw figure, ${p0(pEst)}, is inflated because problems nobody hit are missing).`,
      `${p0(once)} of the problems were seen by only one participant; the more one-off problems, the more are probably still out there.`,
      more[0] > 0 ? `About ${more[0]} more participants would take you to roughly 90% discovery, and ${more[1]} more to 95%.` : 'You have probably passed 90% discovery for problems this test can reveal.',
    ],
    confidence,
    confidenceNote: `Based on ${N} participants with ${p0(once)} of problems seen once. (Rule: under 5 participants or over half one-off problems weak; 10 or more participants with at most 30% one-off strong; otherwise some.)`,
    caveats: ['This only covers problems these tasks and these kinds of participant could reveal; untested tasks, devices and user groups have their own problems.', 'The model assumes everyone is equally likely to hit each problem. In reality some problems are much harder to hit, so the true total is probably higher.'],
    next: [`If you know who found each problem, cross-check with the ${calc('capture-recapture', 'Capture-recapture estimate')}.`, `Plan the next round with the ${calc('sample-size', 'Sample size planner')} ("Find problems").`],
    report: `After ${N} participants, ${counts.length} problems had been found; using Lewis's (2001) adjusted problem frequency (p = ${n1(pAdj, 2)}), an estimated ${p0(found)} of discoverable problems had been seen (about ${Math.round(total)} in total).`,
  });
}

export function topBox({ xs, C, B, conf = 0.8 }) {
  const n = xs.length, x = xs.filter((v) => v >= C).length;
  const test = S.proportionVsBenchmark(x, n, B), ci = S.adjustedWald(x, n, conf);
  const M = S.mean(xs), SD = S.sd(xs), t = SD > 0 ? S.oneSampleT(M, SD, n, C) : null;
  const alpha = 1 - conf, met = test.p < alpha;
  const [confidence, confidenceNote] = pConfidence(test.p, alpha, `one-sided ${test.large ? 'normal' : 'mid-p binomial'} test against ${p0(B)}`);
  const meaning = [`With ${cl(conf)} confidence, between ${p0(ci.lo)} and ${p0(ci.hi)} of all users would choose ${C} or higher.`];
  if (t) meaning.push(`Analysed as a mean instead (${n1(M, 2)}), the one-sided test that the average is above ${C} gives ${pEq(t.pOne)}${t.pOne < test.p ? ': stronger evidence, because the mean keeps the strength of agreement that top-box throws away' : ''}.`);
  meaning.push(met ? 'The target is met: you can say more than the target share of users agree.' : 'The target is not shown to be met; that is different from showing it is missed.');
  return result({
    headline: `${x} of ${n} people (${p0(x / n)}) chose ${C} or higher, which ${met ? 'is enough to show' : 'does not yet show'} that at least ${p0(B)} of all users agree (one-sided ${pEq(test.p)}).`,
    meaning, confidence, confidenceNote,
    caveats: [met ? SIG_NOT_BIG : NOT_SIG, 'Top-box turns every rating into agree or not, so a shift from 1 to 3 counts for nothing; report the mean alongside it.', P_NOT],
    next: [`For an interval around the mean rating, use ${calc('rating', 'Rating scale and benchmark')}.`, `To plan a sample that can settle the target, use the ${calc('sample-size', 'Sample size planner')}.`],
    report: `${x} of ${n} participants (${p0(x / n)}) rated ${C} or higher (${cl(conf)} confidence interval ${p0(ci.lo)} to ${p0(ci.hi)}); against a target of ${p0(B)}, one-sided ${test.large ? 'normal approximation' : 'mid-p binomial'} ${pEq(test.p)}.`,
  });
}

// R9 for expectation quadrants: never strong, because the calculator has only means, not how many people rated each
// task; weak when any task sits within 0.5 of a split line on either axis, otherwise some.
export function expectation({ tasks, mid }) {
  const q = (t) => (t.e >= mid ? (t.x >= mid ? 'ok' : 'fix') : (t.x >= mid ? 'promote' : 'opp'));
  const by = { fix: [], opp: [], promote: [], ok: [] }; tasks.forEach((t) => by[q(t)].push(t));
  const gap = (t) => t.x - t.e;
  const worst = [...tasks].sort((a, b) => gap(a) - gap(b))[0];
  const fix = [...by.fix].sort((a, b) => gap(a) - gap(b));
  const near = tasks.filter((t) => Math.abs(t.e - mid) < 0.5 || Math.abs(t.x - mid) < 0.5);
  const list = (ts) => ts.map((t) => quote(t.name)).join(', ');
  const meaning = [];
  if (by.fix.length) meaning.push(`Fix it fast: ${list(by.fix)}. People expected ${by.fix.length > 1 ? 'these' : 'this'} to be easy and found ${by.fix.length > 1 ? 'them' : 'it'} hard, which causes the most dissatisfaction.`);
  if (by.opp.length) meaning.push(`Big opportunity: ${list(by.opp)}. Expected hard and found hard; making ${by.opp.length > 1 ? 'them' : 'it'} easy could set you apart.`);
  if (by.promote.length) meaning.push(`Promote it: ${list(by.promote)}. Expected hard but found easy; tell people.`);
  if (by.ok.length) meaning.push(`Don't touch it: ${list(by.ok)}. Expected easy and found easy.`);
  return result({
    headline: fix.length ? `${by.fix.length} of ${tasks.length} tasks were harder than people expected; ${quote(fix[0].name)} has the biggest gap (expected ${n1(fix[0].e)}, experienced ${n1(fix[0].x)} out of 7).` : `No task was harder than people expected; the largest drop is ${quote(worst.name)} (expected ${n1(worst.e)}, experienced ${n1(worst.x)}).`,
    meaning,
    confidence: near.length ? 'low' : 'medium',
    confidenceNote: near.length ? `${list(near)} ${near.length > 1 ? 'sit' : 'sits'} within half a point of a split line, so a few more participants could move ${near.length > 1 ? 'them' : 'it'} to another quadrant. (Rule: never strong, because the calculator sees only means; weak if any task is within 0.5 of a line.)` : 'Every task sits clearly inside a quadrant, but the calculator sees only the means, not how many people rated each task or how much they disagreed. (Rule: never strong; weak if any task is within 0.5 of a line.)',
    caveats: ['Quadrants are a reading aid, not a test: check the spread of ratings before acting on a task near a line.', 'Collect expectation ratings before people try the tasks, or the experience colours the expectation.'],
    next: [`To test whether a gap is real, enter each person's expected and experienced rating for that task in ${calc('compare-means', 'Compare two means')} with "The same people".`, `To compare a task's ease with the SEQ average of about 5.5, use the ${calc('seq', 'SEQ scorer')}.`],
    report: `Of ${tasks.length} tasks, ${by.fix.length} ${by.fix.length === 1 ? 'was' : 'were'} rated harder after attempting ${by.fix.length === 1 ? 'it' : 'them'} than expected beforehand${fix.length ? `; the largest gap was ${quote(fix[0].name)} (expected ${n1(fix[0].e)}, experienced ${n1(fix[0].x)} on a 7-point ease scale)` : ''}.`,
  });
}

const SUM_LABEL = { completion: 'completion', time: 'time on task', satisfaction: 'satisfaction', errors: 'errors' };
export function sum({ x, n, parts, sum: total }) {
  const entries = Object.entries(parts).sort((a, b) => a[1] - b[1]);
  const [wk, wv] = entries[0];
  const aw = S.adjustedWald(x, n, 0.95);
  const [confidence] = rateConfidence(aw.lo, aw.hi, 0.95);
  return result({
    headline: `The task scores ${p0(total)} on the Single Usability Metric; the weakest part is ${SUM_LABEL[wk]} at ${p0(wv)}.`,
    meaning: [
      'SUM averages the share of users meeting each target (Sauro and Kindlund 2005), so 100% would mean everyone completed, within the time target, satisfied and without errors.',
      `Components: ${entries.map(([k, v]) => `${SUM_LABEL[k]} ${p0(v)}`).join(', ')}. Improving ${SUM_LABEL[wk]} would raise the score most.`,
      'A SUM is only comparable with others that used the same targets for time and satisfaction.',
    ],
    confidence,
    confidenceNote: `Each component is estimated from ${n} attempts; the completion part alone has a 95% interval of ${p0(aw.lo)} to ${p0(aw.hi)}, and the average inherits that uncertainty. (Rule R1 on the completion interval.)`,
    caveats: ['SUM depends on the targets you chose: a lenient time target or a low satisfaction target raises the score.', 'Averaging hides trade-offs; always report the components alongside the single number.'],
    next: [`Get the interval for each part with the ${calc('completion-rate', 'Completion rate interval')} and the ${calc('task-time', 'Task time interval')}.`],
    report: `The task's Single Usability Metric was ${p0(total)} (${entries.map(([k, v]) => `${SUM_LABEL[k]} ${p0(v)}`).join(', ')}; Sauro and Kindlund 2005, n = ${n}).`,
  });
}

export function correlation({ xs, ys, kind = 'pearson', conf = 0.95 }) {
  const r = S.correlation(xs, ys, conf);
  const a = Math.abs(r.r), size = a >= 0.5 ? 'strong' : a >= 0.3 ? 'moderate' : a >= 0.1 ? 'weak' : 'negligible';
  const alpha = 1 - conf, sig = r.p < alpha, name = kind === 'pearson' ? 'Pearson' : 'Spearman';
  let [confidence, confidenceNote] = pConfidence(r.p, alpha, `${name} correlation test`);
  // A significant correlation whose interval is wider than 0.6 is downgraded: the direction is clear, the strength is not.
  if (confidence !== 'low' && r.hi - r.lo > 0.6) { confidence = downgrade(confidence); confidenceNote += ` The interval is ${n1(r.hi - r.lo, 2)} wide, so the strength is uncertain even if the direction is clear (downgraded one step).`; }
  return result({
    headline: `The two measures show a ${size} ${r.r >= 0 ? 'positive' : 'negative'} correlation (r = ${n1(r.r, 2)}, ${r.n} pairs); it is ${sig ? '' : 'not '}statistically significant (${pEq(r.p)}).`,
    meaning: [
      `The true correlation is plausibly between ${n1(r.lo, 2)} and ${n1(r.hi, 2)} (${cl(conf)} confidence).`,
      `By Cohen's (1988) conventions, 0.1 is weak, 0.3 moderate and 0.5 strong. r² = ${p0(r.r2)}: that share of the variation in one measure goes along with the other.`,
      sig ? 'Use it as a lead to investigate, not as proof that one measure drives the other.' : 'The range includes zero, so this sample does not show a relationship.',
    ],
    confidence, confidenceNote,
    caveats: ['Correlation does not show cause: a third factor, such as experience, can drive both measures.', `${name === 'Pearson' ? 'Pearson measures straight-line relationships; a curve or a single outlier can hide or create one. ' : ''}Plot the points before trusting the number.`, sig ? SIG_NOT_BIG : NOT_SIG],
    next: [`Read more on ${method('correlation-analysis-with-confidence-intervals', 'correlation with confidence intervals')}.`],
    report: `${name} r = ${n1(r.r, 2)} (${cl(conf)} confidence interval ${n1(r.lo, 2)} to ${n1(r.hi, 2)}, n = ${r.n}, ${pEq(r.p)}).`,
  });
}

// ── Qualitative rigour ──

const landisKoch = (k) => (k < 0 ? 'poor' : k <= 0.2 ? 'slight' : k <= 0.4 ? 'fair' : k <= 0.6 ? 'moderate' : k <= 0.8 ? 'substantial' : 'almost perfect');
export function intercoder({ rows, level = 'nominal', numeric = false, conf = 0.95 }) {
  const lv = numeric ? level : 'nominal';
  const kr = S.krippendorffAlpha(rows, lv), agree = S.percentAgreement(rows);
  const coders = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const pairs = coders === 2 ? rows.filter((r) => r[0] != null && r[1] != null).map((r) => [r[0], r[1]]) : [];
  const kap = pairs.length > 1 ? S.cohenKappa(pairs, conf) : null;
  const a = kr.alpha;
  // Most frequent disagreement between two codes, across every pair of coders on every segment.
  const dis = new Map();
  for (const u of rows) { const v = u.filter((x) => x != null); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i] !== v[j]) { const key = [String(v[i]), String(v[j])].sort().join('\u0001'); dis.set(key, (dis.get(key) || 0) + 1); } }
  const top = [...dis.entries()].sort((x, y) => y[1] - x[1])[0];
  const band = a >= 0.8 ? "at or above Krippendorff's (2004) 0.8 standard for relying on the codes" : a >= 0.667 ? "between Krippendorff's (2004) 0.667 and 0.8, enough only for tentative conclusions" : "below Krippendorff's (2004) 0.667 minimum for drawing conclusions";
  const meaning = [`Percent agreement (${p0(agree.value)}) is higher than alpha because some agreement happens by chance; alpha and kappa correct for it.`];
  if (kap) meaning.push(`Cohen's kappa is ${n1(kap.kappa, 2)} (${cl(conf)} confidence interval ${n1(kap.lo, 2)} to ${n1(kap.hi, 2)}), ${quote(landisKoch(kap.kappa))} on Landis and Koch's (1977) scale, whose bands are conventions rather than tested thresholds.`);
  meaning.push(a >= 0.8 ? 'You can treat the codebook as applied consistently for this kind of material.' : a >= 0.667 ? 'Use the codes for tentative conclusions only; sharpen the definitions for the codes the coders confused.' : 'Do not analyse the coded data yet: the codes mean different things to different coders.');
  if (top) { const [c1, c2] = top[0].split('\u0001'); meaning.push(`The most common disagreement was ${quote(c1)} versus ${quote(c2)} (${plural(top[1], 'time')}): clarify the boundary between those codes first.`); }
  let confidence = kr.units < 20 ? 'low' : kr.units < 50 ? 'medium' : 'high';
  if (kap && kap.hi - kap.lo > 0.4) confidence = 'low';
  return result({
    headline: `The coders agreed on ${p0(agree.value)} of ${agree.units} segments; Krippendorff's alpha is ${n1(a, 2)}, ${band}.`,
    meaning, confidence,
    confidenceNote: `Based on ${kr.units} segments${kap ? `, with a kappa interval ${n1(kap.hi - kap.lo, 2)} wide` : ''}. (Rule: under 20 segments weak, 20 to 49 some, 50 or more strong; weak whenever the kappa interval is wider than 0.4.)`,
    caveats: ['Do not recode the segments you discussed and report the new figure: that measures memory of the discussion, not reliability.', 'Agreement statistics suit codebook coding, not reflexive thematic analysis, where codes are meant to be interpretive.', 'A good overall figure can hide poor agreement on rare codes; check the codes that matter most to your findings.'],
    next: ['Refine the code definitions with examples and non-examples, then have both coders code a fresh sample of segments and recheck.', `See ${method('start-list-coding-with-a-structured-codebook-and-check-coding', 'codebook coding with check-coding')}.`],
    report: `${coders} coders coded ${agree.units} segments; percent agreement was ${p0(agree.value)} and Krippendorff's alpha (${lv}) was ${n1(a, 2)}${kap ? `; Cohen's kappa was ${n1(kap.kappa, 2)} (${cl(conf)} confidence interval ${n1(kap.lo, 2)} to ${n1(kap.hi, 2)})` : ''}.`,
  });
}

// R9 for saturation: fewer than 6 interviews weak; coverage of 90% or more with no new codes in the look-back strong;
// coverage of 80% or more some; otherwise weak.
export function saturation({ lists, k = 3 }) {
  const r = S.saturation(lists, k);
  const none = r.newLast.length === 0;
  const confidence = r.T < 6 ? 'low' : r.coverage >= 0.9 && none ? 'high' : r.coverage >= 0.8 ? 'medium' : 'low';
  return result({
    headline: `After ${r.T} interviews you have ${r.S} codes; about ${p0(r.coverage)} of the code mentions in a new interview would be codes you already have.`,
    meaning: [
      `Chao's estimator puts the total at about ${n1(r.chao, 0)} codes, so roughly ${p0(r.S / r.chao)} of the codes this kind of interview can produce are already in hand.`,
      none ? `The last ${plural(r.k, 'interview')} added no new codes.` : `The last ${plural(r.k, 'interview')} still added ${plural(r.newLast.length, 'new code')} (${r.newLast.map(quote).join(', ')}), so you have not reached code saturation.`,
      r.f1 ? `${plural(r.f1, 'code')} appeared in only one interview; these are the sign that more codes are out there.` : 'Every code appeared in at least two interviews.',
    ],
    confidence,
    confidenceNote: `Coverage ${p0(r.coverage)} after ${r.T} interviews, with ${none ? 'no' : r.newLast.length} new codes in the last ${r.k}. (Rule: under 6 interviews weak; coverage 90% or more with no new codes strong; 80% or more some; otherwise weak.)`,
    caveats: ['These numbers measure code saturation (no new labels), not meaning saturation (understanding each code well).', 'They assume all interviews come from one population: a user group you have not interviewed yet can still hold new codes.'],
    next: [none && r.coverage >= 0.9 ? 'Check that every user group you care about is represented before you stop.' : 'Run a few more interviews and stop when the last 3 add nothing new and coverage stays above 90%.', `Choose the next people deliberately, as in ${method('theoretical-sampling-and-saturation', 'theoretical sampling')}.`],
    report: `After ${r.T} interviews, ${r.S} distinct codes had been identified (Good-Turing sample coverage ${p0(r.coverage)}; Chao estimate of total codes ${n1(r.chao, 0)}); the last ${r.k} interviews added ${r.newLast.length} new code${r.newLast.length === 1 ? '' : 's'}.`,
  });
}

// ── Survey quality ──

export function reliability({ r, reversed = [], conf = 0.95 }) {
  const a = r.alpha;
  const band = a >= 0.9 ? 'high enough even for decisions about individuals, the 0.9 level Nunnally (1978) recommends for that' : a >= 0.8 ? 'at the 0.8 level Nunnally (1978) recommends for basic research' : a >= 0.7 ? 'at the 0.7 level Nunnally (1978) suggests for early-stage research and comparing groups' : 'below the 0.7 Nunnally (1978) suggests for early-stage research, so scores are noisy';
  const flagged = r.items.filter((it) => it.rCorrected < 0.3 || it.alphaIfDeleted > a + 0.01);
  const meaning = [`That is ${band}.`];
  if (a > 0.95) meaning.push('Alpha above 0.95 can mean some items are near-duplicates that add length without adding information (Streiner 2003).');
  if (fin(r.omega.omega)) meaning.push(`McDonald's omega, which does not assume every item measures the construct equally well, is ${n1(r.omega.omega, 2)}.`);
  if (flagged.length) meaning.push(`${flagged.length === 1 ? 'Item' : 'Items'} ${flagged.map((it) => it.item).join(', ')} ${flagged.length === 1 ? 'fits' : 'fit'} the rest poorly (item-total correlation below 0.3, or alpha rises without ${flagged.length === 1 ? 'it' : 'them'}): check the wording${reversed.length ? '' : ' and whether it needs reverse scoring'}.`);
  const w = r.hi - r.lo;
  const confidence = w <= 0.1 ? 'high' : w <= 0.2 ? 'medium' : 'low';
  return result({
    headline: `Cronbach's alpha is ${n1(a, 2)} from ${r.n} respondents and ${r.k} items; the true reliability is plausibly between ${n1(r.lo, 2)} and ${n1(r.hi, 2)} (${cl(conf)} confidence).`,
    meaning, confidence,
    confidenceNote: `The Feldt interval is ${n1(w, 2)} wide with ${r.n} respondents. (Rule: up to 0.1 strong, up to 0.2 some, wider weak.)`,
    caveats: ['A high alpha does not show the items measure one thing: a long scale can reach a high alpha with several factors.', 'A very high alpha can mean redundant items rather than a better scale.', 'Alpha belongs to this sample, not to the questionnaire; report it for every study.'],
    next: [flagged.length ? `Review item${flagged.length > 1 ? 's' : ''} ${flagged.map((it) => it.item).join(', ')} before dropping anything, and recheck on a fresh sample.` : 'No item stands out as a poor fit.', `Read more on ${method('reliability-analysis-cronbachs-alpha-split-half-omega', 'reliability analysis')}.`],
    report: `Cronbach's alpha was ${n1(a, 2)} (${cl(conf)} confidence interval ${n1(r.lo, 2)} to ${n1(r.hi, 2)}, Feldt; n = ${r.n}, ${r.k} items)${fin(r.omega.omega) ? `; McDonald's omega was ${n1(r.omega.omega, 2)}` : ''}.`,
  });
}

export function marginOfError({ mode, n, e, p = 0.5, N = Infinity, deff = 1, conf = 0.95 }) {
  const caveats = ['The margin covers only random sampling error in a probability sample. It says nothing about who did not respond, an opt-in panel or leading questions; AAPOR cautions against quoting it for opt-in samples.'];
  if (mode === 'moe') {
    const r = S.surveyMoe({ n, p, conf, N, deff });
    const m = r.moe * 100;
    const confidence = m <= 5 ? 'high' : m <= 10 ? 'medium' : 'low';
    return result({
      headline: `With ${n} responses, a result near ${p0(p)} is accurate to about ±${n1(m, 1)} points (${cl(conf)} confidence), if this is a random sample.`,
      meaning: [
        `If ${p0(p)} of respondents chose an answer, the population figure is plausibly between ${p1(r.lo)} and ${p1(r.hi)}.`,
        `Subgroups have wider margins: a subgroup of half the sample is accurate to about ±${n1(m * Math.SQRT2, 1)} points.`,
        deff > 1 ? `The design effect of ${n1(deff, 1)} means the sample is worth only about ${Math.floor(r.neff)} simple random responses.` : 'Two answers that differ by less than about the margin may not differ in the population; test the difference before reporting it.',
      ],
      confidence,
      confidenceNote: `±${n1(m, 1)} points. (Rule for surveys: ±5 or less strong, up to ±10 some, more weak.)`,
      caveats,
      next: [`For small usability samples, use the ${calc('completion-rate', 'Completion rate interval')} instead.`],
      report: `With n = ${n}, the margin of error for a proportion near ${p0(p)} is ±${n1(m, 1)} percentage points at ${cl(conf)} confidence${deff > 1 ? ` (design effect ${n1(deff, 1)})` : ''}${fin(N) ? ` (population ${N})` : ''}, assuming a probability sample.`,
    });
  }
  const r = S.surveyN({ e, p, conf, N, deff });
  return result({
    headline: `Plan for about ${r.n} completed responses to report a proportion to within ±${n1(e * 100, 1)} points at ${cl(conf)} confidence.`,
    meaning: ['Divide by your expected response rate to get the number of invitations to send.', `Subgroups will have wider margins; if you need ±${n1(e * 100, 1)} for each of two equal subgroups, you need about twice as many.`],
    confidence: 'medium',
    confidenceNote: 'A plan rests on its assumptions: the expected proportion, the design effect and getting a genuinely random sample. (Plans are never rated strong.)',
    caveats,
    next: [`After fieldwork, check the achieved margin with "Margin of error" here.`],
    report: `We planned ${r.n} completed responses for a margin of error of ±${n1(e * 100, 1)} points at ${cl(conf)} confidence (expected proportion ${p0(p)}${deff > 1 ? `, design effect ${n1(deff, 1)}` : ''}${fin(N) ? `, population ${N}` : ''}).`,
  });
}

// ── Questionnaires ──

export function nasaTlxOne({ R, w, raw, weighted }) {
  const i = w.indexOf(Math.max(...w)), hi = R.indexOf(Math.max(...R));
  return result({
    headline: `This person's weighted workload is ${n1(weighted)} out of 100 (raw ${n1(raw)}); they judged ${S.TLX_DIMS[i].toLowerCase()} the biggest contributor.`,
    meaning: [`Their highest rating was ${S.TLX_DIMS[hi].toLowerCase()} (${n1(R[hi], 0)}).`, 'TLX has no universal pass mark: compare with the same person on another design, or with a group measured the same way.'],
    confidence: 'low',
    confidenceNote: 'One person\'s ratings describe one experience; they cannot tell you about users in general.',
    caveats: ['Performance runs from "perfect" (0) to "failure" (100), so a high number there means they felt they did badly.'],
    next: ['Collect ratings from several participants and enter them under "Several participants".'],
    report: `One participant's weighted NASA-TLX workload was ${n1(weighted)} (raw ${n1(raw)}); the dimension weighted highest was ${S.TLX_DIMS[i].toLowerCase()}.`,
  });
}
export function nasaTlxMany({ people, useW }) {
  const scores = people.map((p) => (useW ? p.wt : p.raw)), n = scores.length, M = S.mean(scores);
  const ci = n > 1 && S.sd(scores) > 0 ? S.meanCI(M, S.sd(scores), n, 0.95) : null;
  const ms = S.TLX_DIMS.map((_, i) => S.mean(people.map((p) => p.r[i]))), top = ms.indexOf(Math.max(...ms));
  const [confidence, confidenceNote] = ci ? scaleConfidence(ci.lo, ci.hi, 0, 100, 0.95) : ['low', 'With one participant, or identical scores, there is no interval.'];
  return result({
    headline: `Mean ${useW ? 'weighted' : 'raw'} workload was ${n1(M)} out of 100 from ${plural(n, 'participant')}; the biggest source was ${S.TLX_DIMS[top].toLowerCase()} (${n1(ms[top], 0)}).`,
    meaning: [
      ci ? `The true mean workload is plausibly between ${n1(ci.lo, 0)} and ${n1(ci.hi, 0)} (95% confidence).` : 'There is no interval yet.',
      'TLX has no universal pass mark; compare with another design or task measured the same way, not with another study\'s numbers.',
      `To reduce workload, start with ${S.TLX_DIMS[top].toLowerCase()}: that is where people felt the most demand.`,
    ],
    confidence, confidenceNote,
    caveats: ['High workload is not automatically bad: an expert tool can be demanding and still succeed. Read it with success and time.', 'Raw and weighted TLX are close but not identical; do not mix them across studies.'],
    next: [`To compare two designs, enter each person's scores in ${calc('compare-means', 'Compare two means')}.`],
    report: `Mean ${useW ? 'weighted' : 'raw'} NASA-TLX workload was ${n1(M)}${ci ? ` (95% confidence interval ${n1(ci.lo)} to ${n1(ci.hi)}, n = ${n})` : ` (n = ${n})`}; the highest-rated dimension was ${S.TLX_DIMS[top].toLowerCase()} (${n1(ms[top], 0)}).`,
  });
}

export function ueq({ scales, n }) {
  const att = scales[0], sorted = [...scales].sort((a, b) => a.mean - b.mean), weak = sorted[0], strong = sorted[sorted.length - 1];
  const by = Object.fromEntries(scales.map((s) => [s.name, s.mean]));
  const pq = (by.Perspicuity + by.Efficiency + by.Dependability) / 3, hq = (by.Stimulation + by.Novelty) / 2;
  const widths = scales.map((s) => s.hi - s.lo).filter(fin);
  const lowAlpha = scales.filter((s) => fin(s.alpha) && s.alpha < 0.7).map((s) => s.name.toLowerCase());
  const [confidence, confidenceNote] = widths.length ? scaleConfidence(0, S.mean(widths), -3, 3, 0.95, 'scale points on average') : ['low', 'With one participant there are no intervals.'];
  return result({
    headline: `Attractiveness was ${n1(att.mean, 2)} on the −3 to +3 scale from ${plural(n, 'participant')}, ${quote(att.band.toLowerCase())} against the UEQ benchmark.`,
    meaning: [
      `The strongest scale is ${strong.name.toLowerCase()} (${n1(strong.mean, 2)}, ${strong.band.toLowerCase()}); the weakest is ${weak.name.toLowerCase()} (${n1(weak.mean, 2)}, ${weak.band.toLowerCase()}), so start there.`,
      `Pragmatic quality (perspicuity, efficiency, dependability) averages ${n1(pq, 2)} and hedonic quality (stimulation, novelty) ${n1(hq, 2)}: ${pq - hq > 0.5 ? 'people see it as usable more than as engaging' : hq - pq > 0.5 ? 'people find it engaging more than usable' : 'the two are about balanced'}.`,
      'Bands compare your means with 452 product evaluations in Schrepp, Hinderks and Thomaschewski (2017): excellent is the top 10%, good the next 15%. Means between −0.8 and +0.8 are a neutral impression.',
    ],
    confidence, confidenceNote,
    caveats: ['The benchmark only applies if you used the official items, order and translation.', lowAlpha.length ? `Scale${lowAlpha.length > 1 ? 's' : ''} ${lowAlpha.join(', ')} ${lowAlpha.length > 1 ? 'have' : 'has'} alpha below 0.7, which can mean participants read some items differently; interpret ${lowAlpha.length > 1 ? 'them' : 'it'} with care.` : 'A band is about the mean, not about every user: some people will have rated it much lower.'],
    next: [`To compare two versions, enter each person's scale score in ${calc('compare-means', 'Compare two means')}.`],
    report: `UEQ scores (n = ${n}, −3 to +3): ${scales.map((s) => `${s.name.toLowerCase()} ${n1(s.mean, 2)} (${s.band.toLowerCase()})`).join(', ')}; bands from the Schrepp, Hinderks and Thomaschewski (2017) benchmark.`,
  });
}

export function seq({ xs, B = 5.5, conf = 0.95 }) {
  const n = xs.length, M = S.mean(xs), SD = S.sd(xs), ci = S.meanCI(M, SD, n, conf), t = S.oneSampleT(M, SD, n, B);
  const low = xs.filter((x) => x <= 3).length, top = xs.filter((x) => x >= 6).length;
  const meaning = [
    ci.lo > B ? `The whole interval is above ${n1(B, 1)}, so this task is easier than average.` : ci.hi < B ? `The whole interval is below ${n1(B, 1)}, so this task is harder than average: look at what made it difficult.` : `The interval includes ${n1(B, 1)}, so you cannot yet say this task differs from a typical one.`,
    B === 5.5 ? 'About 5.5 is the average SEQ across several hundred tasks in Sauro\'s data (MeasuringU).' : `The benchmark of ${n1(B, 1)} is the one you entered.`,
    `${plural(top, 'person', 'people')} rated it 6 or 7${low ? `, and ${plural(low, 'person', 'people')} rated it 3 or lower: watch their sessions to see what went wrong` : ''}.`,
  ];
  const [confidence, confidenceNote] = scaleConfidence(ci.lo, ci.hi, 1, 7, conf);
  return result({
    headline: `The task's mean SEQ was ${n1(M, 2)} from ${n} ratings; the true mean is plausibly between ${n1(ci.lo, 1)} and ${n1(ci.hi, 1)} (${cl(conf)} confidence).`,
    meaning, confidence, confidenceNote,
    caveats: [ci.lo <= B && ci.hi >= B ? NOT_SIG : P_NOT, 'Compare with 5.5 only if you asked the standard question on the 7-point scale straight after the task.'],
    next: [`To compare two tasks or designs, use ${calc('compare-means', 'Compare two means')}.`, `To see where expectations and experience part ways, try ${calc('expectation', 'Expectation vs experience')}.`],
    report: `The task's mean SEQ rating was ${n1(M, 2)} (${cl(conf)} confidence interval ${n1(ci.lo, 2)} to ${n1(ci.hi, 2)}, n = ${n}; benchmark ${n1(B, 1)}, two-sided ${pEq(t.pTwo)}).`,
  });
}

export function attrakdiff({ PQ, HQ, ATT, region, n }) {
  const widths = [PQ.ci, HQ.ci].filter(Boolean).map((c) => c.hi - c.lo);
  const crosses = [PQ, HQ].some((s) => s.ci && [-1, 1].some((b) => s.ci.lo < b && s.ci.hi > b));
  let [confidence, confidenceNote] = widths.length ? scaleConfidence(0, Math.max(...widths), -3, 3, 0.95, 'scale points (the wider of PQ and HQ)') : ['low', 'With one participant there are no intervals.'];
  if (crosses && confidence !== 'low') { confidence = downgrade(confidence); confidenceNote += ' An interval crosses a region border at ±1, so the region itself is uncertain (downgraded one step).'; }
  return result({
    headline: `The product sits in the ${quote(region || 'between regions')} region: pragmatic quality ${n1(PQ.m, 2)} and hedonic quality ${n1(HQ.m, 2)} on −3 to +3, from ${plural(n, 'participant')}.`,
    meaning: [
      PQ.m - HQ.m > 0.5 ? 'People see it as useful and usable more than as stimulating or expressive.' : HQ.m - PQ.m > 0.5 ? 'People find it stimulating or expressive more than usable.' : 'Pragmatic and hedonic qualities are about balanced.',
      `Attractiveness is ${n1(ATT.m, 2)}${ATT.ci ? ` (95% confidence interval ${n1(ATT.ci.lo, 2)} to ${n1(ATT.ci.hi, 2)})` : ''}.`,
      'There is no published benchmark for the ten-item short form, so compare with a competitor or an earlier version measured the same way.',
    ],
    confidence, confidenceNote,
    caveats: ['Portfolio regions are a reading aid, not a test: two products whose intervals overlap may not really sit in different regions.'],
    next: [`For a benchmarked comparison, the ${calc('ueq', 'UEQ scorer')} has published norms; to compare two versions, use ${calc('compare-means', 'Compare two means')}.`],
    report: `AttrakDiff (short), n = ${n}: pragmatic quality ${n1(PQ.m, 2)}${PQ.ci ? ` (95% CI ${n1(PQ.ci.lo, 2)} to ${n1(PQ.ci.hi, 2)})` : ''}, hedonic quality ${n1(HQ.m, 2)}${HQ.ci ? ` (95% CI ${n1(HQ.ci.lo, 2)} to ${n1(HQ.ci.hi, 2)})` : ''}, attractiveness ${n1(ATT.m, 2)}.`,
  });
}

// ── Experiments ──

export function effectSize({ m1, s1, n1: na, m2, s2, n2: nb, conf = 0.95 }) {
  const r = S.effectSize(m1, s1, na, m2, s2, nb, conf), cl2 = S.normCdf(r.d / Math.SQRT2);
  const excl = r.gLo > 0 || r.gHi < 0, near = excl ? Math.min(Math.abs(r.gLo), Math.abs(r.gHi)) : 0;
  const confidence = excl && near >= 0.2 ? 'high' : excl ? 'medium' : 'low';
  const need = S.nForMeans(r.sp, Math.abs(m2 - m1), conf, 0.8, 'between');
  return result({
    headline: `Design B is ${n1(Math.abs(r.g), 2)} standard deviations ${r.g >= 0 ? 'higher' : 'lower'} than design A (Hedges' g): ${cohenSource(r.g)}.`,
    meaning: [
      `The true effect is plausibly between ${n1(r.gLo, 2)} and ${n1(r.gHi, 2)} (${cl(conf)} confidence)${excl ? '' : ', which includes zero, so the direction is not settled'}.`,
      `Put another way, a randomly chosen person from B scores higher than one from A about ${p0(cl2)} of the time (50% would mean no difference).`,
      EFFECT_CONTEXT,
    ],
    confidence,
    confidenceNote: `${excl ? `The interval excludes zero; its end nearer zero is ${n1(near, 2)}.` : 'The interval includes zero.'} (Rule: excludes zero with the nearer end at least 0.2 strong, excludes zero some, includes zero weak.)`,
    caveats: ['An effect size says how big a difference is, not how sure you are of it; read it with its interval.', 'Effects measured on a narrow, similar group of participants look bigger than the same difference across varied real users.'],
    next: [need > Math.min(na, nb) ? `About ${need} people per design would give an 80% chance of detecting a difference this size; see the ${calc('sample-size', 'Sample size planner')}.` : 'The sample is large enough to detect a difference of this size most of the time.', `For the significance test, use ${calc('compare-means', 'Compare two means')}.`],
    report: `Hedges' g = ${n1(r.g, 2)} (${cl(conf)} confidence interval ${n1(r.gLo, 2)} to ${n1(r.gHi, 2)}; Cohen's d = ${n1(r.d, 2)}; n = ${na} and ${nb}), a ${S.effectLabel(r.g)} effect by Cohen's conventions.`,
  });
}

const rBand = (r) => { const a = Math.abs(r); return a >= 0.5 ? 'large' : a >= 0.3 ? 'medium' : a >= 0.1 ? 'small' : 'negligible'; };
export function nonparametricBetween({ A, B, conf = 0.95 }) {
  const r = S.mannWhitney(A, B), alpha = 1 - conf, sig = r.p < alpha;
  let [confidence, confidenceNote] = pConfidence(r.p, alpha, 'Mann-Whitney test');
  if ((r.n1 < 8 || r.n2 < 8) && confidence === 'high') { confidence = 'medium'; confidenceNote += ' Fewer than 8 per group makes the normal approximation rough (downgraded one step).'; }
  return result({
    headline: `Design B's values tend to be ${r.z < 0 ? 'higher' : 'lower'} than A's (medians ${n1(r.med2, 1)} vs ${n1(r.med1, 1)}); the difference is ${sig ? '' : 'not '}statistically significant (Mann-Whitney ${pEq(r.p)}).`,
    meaning: [`The effect size r = ${n1(Math.abs(r.r), 2)} is ${rBand(r.r)} by Cohen's (1988) conventions (0.1 small, 0.3 medium, 0.5 large).`, sig ? 'A randomly chosen value from one design tends to beat one from the other; the test does not say by how much the means differ.' : 'This sample does not show that values on one design tend to be higher.'],
    confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, 'This test compares ranks, not means; report medians rather than means alongside it.'],
    next: [`Compare with the t-test in ${calc('compare-means', 'Compare two means')}: if both agree, the conclusion does not hinge on the test chosen.`],
    report: `Values on design B (median ${n1(r.med2, 1)}, n = ${r.n2}) were ${sig ? '' : 'not significantly '}${r.z < 0 ? 'higher' : 'lower'} than on design A (median ${n1(r.med1, 1)}, n = ${r.n1}) (Mann-Whitney U = ${n1(r.U1, 1)}, z = ${n1(r.z, 2)}, ${pEq(r.p)}, r = ${n1(Math.abs(r.r), 2)}).`,
  });
}
export function nonparametricWithin({ diffs, total, conf = 0.95 }) {
  const r = S.wilcoxonSigned(diffs), alpha = 1 - conf, sig = r.p < alpha;
  let [confidence, confidenceNote] = pConfidence(r.p, alpha, 'Wilcoxon signed-rank test');
  if (r.n < 10 && confidence === 'high') { confidence = 'medium'; confidenceNote += ' Fewer than 10 non-zero differences makes the normal approximation rough (downgraded one step).'; }
  return result({
    headline: `For the same people, values on B were ${sig ? 'reliably' : 'not reliably'} ${r.z > 0 ? 'higher' : 'lower'} than on A (median change ${n1(r.medDiff, 2)}; Wilcoxon ${pEq(r.p)}).`,
    meaning: [`The effect size r = ${n1(Math.abs(r.r), 2)} is ${rBand(r.r)} by Cohen's (1988) conventions.`, r.zeros ? `${plural(r.zeros, 'participant')} with no change ${r.zeros === 1 ? 'was' : 'were'} left out, as Wilcoxon's method requires.` : 'Every participant changed between the designs.'],
    confidence, confidenceNote,
    caveats: [sig ? SIG_NOT_BIG : NOT_SIG, 'People can learn on the first design they try; check the order was counterbalanced.'],
    next: [`Compare with the paired t-test in ${calc('compare-means', 'Compare two means')}.`],
    report: `For ${total} participants who tried both designs (${r.n} with a change), the median change from A to B was ${n1(r.medDiff, 2)} (Wilcoxon signed-rank z = ${n1(r.z, 2)}, ${pEq(r.p)}, r = ${n1(Math.abs(r.r), 2)}).`,
  });
}

export function bayesAB({ xa, na, xb, nb, T, conf = 0.95 }) {
  const r = S.bayesAB(xa, na, xb, nb, conf);
  const pick = r.lossB <= T && r.lossB <= r.lossA ? 'B' : r.lossA <= T ? 'A' : null;
  const pp = (v) => `${n1(v * 100, 3)} points`;
  const pb = r.pBbeatsA;
  const confidence = pb >= 0.95 || pb <= 0.05 ? 'high' : pb >= 0.8 || pb <= 0.2 ? 'medium' : 'low';
  const lift = r.mA > 0 ? (r.mB - r.mA) / r.mA : NaN;
  return result({
    headline: `There is ${aan(p1(pb))} probability that B converts better than A (posterior means ${p1(r.mB)} vs ${p1(r.mA)}), assuming a flat prior.`,
    meaning: [
      pick ? `Choose ${pick}: if it is in fact the worse version, you expect to give up only ${pp(pick === 'B' ? r.lossB : r.lossA)} of conversion, within the ${pp(T)} you said you can accept.` : `Keep the test running: choosing B now risks ${pp(r.lossB)} on average and choosing A risks ${pp(r.lossA)}, both above the ${pp(T)} you can accept.`,
      `There is ${aan(cl(conf))} probability that B's true rate is between ${p1(r.ciB[0])} and ${p1(r.ciB[1])}, and A's between ${p1(r.ciA[0])} and ${p1(r.ciA[1])} (credible intervals).`,
      fin(lift) ? `The best guess at the relative lift is ${signed(lift * 100)}%; a high probability that B is better is not a high probability that B is much better.` : 'A has no conversions yet, so a relative lift is not defined.',
    ],
    confidence,
    confidenceNote: `P(B > A) = ${p1(pb)}. (Rule: 95% or more, or 5% or less, strong; 80% or more, or 20% or less, some; otherwise weak.)`,
    caveats: [Math.min(na, nb) >= 100 ? 'These probabilities assume a flat Beta(1, 1) prior; with this much data the prior makes little difference.' : 'With so few visitors the flat Beta(1, 1) prior still shapes the answer; collect more data before relying on it.', 'Stopping as soon as the probability looks good, without a loss threshold set in advance, makes false wins more likely.', 'Expected loss is for yes-or-no conversions; it does not cover revenue per visitor or long-term effects such as novelty wearing off.'],
    next: [`Set the acceptable loss before the test starts; for a single rate against a known baseline, the ${calc('sprt', 'Sequential test planner')} gives fixed stopping boundaries.`],
    report: `B converted ${xb}/${nb} (${p1(xb / nb)}) and A ${xa}/${na} (${p1(xa / na)}); with flat Beta(1, 1) priors, P(B > A) = ${p1(pb)} and the expected loss of choosing B is ${pp(r.lossB)} (${cl(conf)} credible interval for B ${p1(r.ciB[0])} to ${p1(r.ciB[1])}).`,
  });
}

export function sprt({ p0: q0, p1: q1, alpha, beta, X, N }) {
  const r = S.sprt(q0, q1, alpha, beta, X, N);
  const done = r.decision !== 'continue';
  return result({
    headline: r.decision === 'h1' ? `Stop: ${X} conversions in ${N} trials crosses the upper boundary, so the evidence favours a rate of ${p0(q1)} over ${p0(q0)}.` : r.decision === 'h0' ? `Stop: ${X} conversions in ${N} trials crosses the lower boundary, so the evidence favours the baseline of ${p0(q0)}.` : `Keep going: ${X} conversions in ${N} trials is between the boundaries, so the test has not decided yet.`,
    meaning: [
      done ? `Stopping here keeps the error rates you set: about ${p0(alpha)} false positives and ${p0(beta)} false negatives.` : `Stop for a lift once conversions reach ${Math.ceil(r.upper(N) - 1e-9)} at ${N} trials, or for no lift at ${Math.max(0, Math.floor(r.lower(N) + 1e-9))} or fewer (the boundaries move up as trials accumulate).`,
      `On average the test stops after about ${Math.ceil(r.asn0)} trials if there is no lift and ${Math.ceil(r.asn1)} if there is (Wald's approximations).`,
      r.decision === 'h1' ? `This says the rate is closer to ${p0(q1)} than to ${p0(q0)}; it does not estimate the rate itself.` : r.decision === 'h0' ? `This says the rate is closer to ${p0(q0)} than to ${p0(q1)}; a smaller lift than ${p0(q1)} may still exist.` : 'Check after each new batch of trials, and stop only at a boundary.',
    ],
    confidence: done ? 'high' : 'low',
    confidenceNote: done ? `The test stopped at a boundary set by your α (${p0(alpha)}) and β (${p0(beta)}). (Rule: a decision at a boundary strong; no decision yet weak.)` : 'No boundary has been crossed, so there is no conclusion yet. (Rule: a decision at a boundary strong; no decision yet weak.)',
    caveats: ['The error rates hold only if you stop at the first boundary crossing and did not change p0, p1, α or β after starting.', 'This tests one rate against a known baseline; it is not a two-version A/B test.'],
    next: [`For two versions run side by side, use the ${calc('bayes-ab', 'Bayesian A/B test')}.`],
    report: `A Wald SPRT of H0: p = ${p0(q0)} against H1: p = ${p0(q1)} (α = ${n1(alpha, 2)}, β = ${n1(beta, 2)}) ${done ? `stopped for ${r.decision === 'h1' ? 'H1' : 'H0'}` : 'had not reached a boundary'} after ${X} conversions in ${N} trials (log-likelihood ratio ${n1(r.llr, 2)}).`,
  });
}

// ── Discover ──

// Capture-recapture confidence: fewer than 3 shared problems (two evaluators) or no problem found by exactly two
// (several) weak; otherwise interval width relative to the estimate, up to 30% strong, up to 60% some, wider weak.
function crConfidence(lo, hi, est, unstable, why) {
  const rel = (hi - lo) / est;
  if (unstable) return ['low', why];
  return [rel <= 0.3 ? 'high' : rel <= 0.6 ? 'medium' : 'low', `The interval is ${p0(rel)} of the estimate wide. (Rule: up to 30% strong, up to 60% some, wider weak; weak whenever the overlap is too small to trust.)`];
}
const CR_CAVEATS = ['Problems differ in how easy they are to find, which makes these estimates too low: read them as "at least this many".', 'The method assumes evaluators worked independently on the same tasks; shared notes or different scopes break it.'];
export function captureTwo({ A, B, M, conf = 0.95 }) {
  const r = S.lincolnPetersen(A, B, M, conf);
  const [confidence, confidenceNote] = crConfidence(r.lo, r.hi, r.chapman, M < 3, `Only ${M} problem${M === 1 ? ' was' : 's were'} found by both, so the estimate is very unstable. (Rule: fewer than 3 shared problems weak.)`);
  return result({
    headline: `The overlap between the two evaluators suggests about ${n1(r.chapman, 0)} problems in total; you have found ${r.seen}, so roughly ${n1(r.remaining, 0)} are still to find.`,
    meaning: [`The total is plausibly between ${n1(r.lo, 0)} and ${n1(r.hi, 0)} problems (${cl(conf)} confidence).`, `Each evaluator found about ${p0(r.pA)} and ${p0(r.pB)} of the estimated total; the less their lists overlap, the more is still out there.`],
    confidence, confidenceNote, caveats: CR_CAVEATS,
    next: [r.remaining / r.chapman > 0.2 ? 'Add another evaluator or session, then rerun with "Several (matrix)".' : 'Most problems have probably been found; spend the effort on fixing them.', `For the 1 − (1 − p)^n view, use ${calc('discovery', 'Problems left to find')}.`],
    report: `Two evaluators found ${A} and ${B} problems with ${M} in common (${r.seen} distinct); the Chapman estimate of the total is ${n1(r.chapman, 0)} (${cl(conf)} confidence interval ${n1(r.lo, 0)} to ${n1(r.hi, 0)}), suggesting about ${n1(r.remaining, 0)} not yet found.`,
  });
}
export function captureMany({ rows, conf = 0.95 }) {
  const r = S.captureMatrix(rows, conf);
  const [confidence, confidenceNote] = crConfidence(r.lo, r.hi, r.chao, r.Q2 === 0, 'No problem was found by exactly two evaluators, so the estimate falls back to a rough form. (Rule: no doubletons weak.)');
  return result({
    headline: `The ${r.T} evaluators' overlap suggests about ${n1(r.chao, 0)} problems in total; you have found ${r.S}, so roughly ${n1(r.remaining, 0)} are still to find.`,
    meaning: [`The total is plausibly between ${n1(r.lo, 0)} and ${n1(r.hi, 0)} problems (${cl(conf)} confidence).`, `${r.Q1} of the ${r.S} problems were found by only one evaluator; problems seen once are the sign that more remain.`, `On average each evaluator found ${p0(r.pMean)} of the estimated total${r.pMean < 0.3 ? ', so adding evaluators will keep turning up new problems' : ''}.`],
    confidence, confidenceNote, caveats: CR_CAVEATS,
    next: [r.remaining / r.chao > 0.2 ? 'Add evaluators or sessions until the number of one-off problems stops growing.' : 'Most problems have probably been found; spend the effort on fixing them.', `For the 1 − (1 − p)^n view, use ${calc('discovery', 'Problems left to find')}.`],
    report: `${r.T} evaluators found ${r.S} distinct problems (${r.Q1} found by one, ${r.Q2} by two); Chao's estimate of the total is ${n1(r.chao, 0)} (${cl(conf)} confidence interval ${n1(r.lo, 0)} to ${n1(r.hi, 0)}).`,
  });
}

// ── Predictive models ──

const KLM_NAMES = { K: 'keystrokes', P: 'pointing', B: 'mouse clicks', H: 'moving hands between devices', M: 'thinking (mental preparation)', R: 'waiting for the system' };
// R9 for KLM: always "some" — the model is validated for skilled, error-free use only.
export function klm({ total, counts, time, nOps, k }) {
  const [big, bt] = Object.entries(time).sort((a, b) => b[1] - a[1])[0];
  return result({
    headline: `A skilled user who makes no errors would take about ${secs(total)} for this method (${nOps} operators).`,
    meaning: [
      `The biggest share is ${KLM_NAMES[big]}, ${p0(bt / total)} of the time${big === 'M' ? ': fewer decisions or steps would save the most' : big === 'P' ? ': shortcuts or larger, closer targets would save the most' : big === 'K' ? ': fewer characters to type, defaults or autocomplete would save the most' : ''}.`,
      `Without thinking time the physical steps alone take ${secs(total - time.M)}; ${counts.M} mental operator${counts.M === 1 ? '' : 's'} add${counts.M === 1 ? 's' : ''} ${secs(time.M)}.`,
      'The model is most useful for comparing two designs of the same routine task: write the alternative\'s sequence the same way and compare the totals.',
    ],
    confidence: 'medium',
    confidenceNote: 'KLM predictions for skilled, error-free use are typically within about 20% of measured times (Card, Moran and Newell 1980 reported a 21% root-mean-square error); real users who hesitate or make mistakes take longer. (Rule: KLM is never rated strong.)',
    caveats: ['This is not how long novices take, nor whether people will find this method at all.', 'Mental operator placement follows heuristic rules; a different but defensible placement can change the total by several seconds.'],
    next: [`Time real users on the task with the ${calc('task-time', 'Task time interval')} and compare.`],
    report: `The Keystroke-Level Model predicts ${secs(total)} for error-free skilled performance of this method (${nOps} operators, K = ${k} s; Card, Moran and Newell 1980 operator times).`,
  });
}

export function fitts({ mode, ab, id, mt, saving, fitR, unitLabel, D, W, sigma, hit, size95 }) {
  // R9 for Fitts: illustrative default constants weak; your own constants some; constants fitted to your data strong
  // when r² ≥ 0.9, some when r² ≥ 0.8, otherwise weak.
  const confidence = ab === 'default' ? 'low' : ab === 'own' ? 'medium' : fitR.r2 >= 0.9 ? 'high' : fitR.r2 >= 0.8 ? 'medium' : 'low';
  const confidenceNote = ab === 'default' ? 'The constants are illustrative round numbers, not measurements of any device, so absolute times are only a guess; comparisons between layouts are safer.' : ab === 'own' ? 'The time is only as good as the constants you entered, and they must come from the same kind of device and task.' : `The constants come from your ${fitR.n} conditions with r² = ${n1(fitR.r2, 2)}. (Rule: r² 0.9 or more strong, 0.8 or more some, lower weak.)`;
  const meaning = [`Halving the distance or doubling the width saves about ${n1(saving, 2)} s per movement${ab === 'default' ? ' with these illustrative constants' : ''}: that matters for targets people hit many times a day.`];
  if (mode === 'touch' && fin(hit)) meaning.push(`If taps scatter with an SD of ${n1(sigma, 2)} mm, about ${p0(hit)} would land inside this target; a square of about ${n1(size95, 1)} mm would catch 95%.`);
  meaning.push('Difficulty (in bits) grows with the logarithm of distance over width, so making a small target a little bigger helps more than moving a large one closer.');
  return result({
    headline: `Reaching a target ${n1(W, 1)} ${unitLabel} wide from ${n1(D, 1)} ${unitLabel} away is ${aan(n1(id, 2))}-bit task, predicted to take about ${secs(mt)}.`,
    meaning, confidence, confidenceNote,
    caveats: ['Fitts\' law covers a single aimed movement, not searching for the target or dragging along a path.', 'Constants measured on one device do not transfer to another.'],
    next: [ab === 'fit' ? 'Use the fitted constants to compare candidate layouts.' : 'Run a short pointing study and choose "Fit from data" for constants that match your device and users.', `To add pointing time to a whole task, see the ${calc('klm', 'KLM task-time predictor')}.`],
    report: `Fitts' law (Shannon form): ID = ${n1(id, 2)} bits, predicted movement time ${secs(mt)}${ab === 'default' ? ' (illustrative constants)' : ab === 'fit' ? ` (constants fitted to ${fitR.n} conditions, r² = ${n1(fitR.r2, 2)})` : ''}.`,
  });
}

export function hick({ mode, n, H, a, b, equalH }) {
  const rt = a + b * H;
  // R9 for Hick: the page's illustrative defaults (a = 0.2 s, b = 0.15 s/bit) weak; your own constants some; never strong,
  // because the law holds only for familiar, recognised choices.
  const defaults = a === 0.2 && b === 0.15;
  return result({
    headline: `Choosing among ${n} ${mode === 'equal' ? 'equally likely' : 'unequally used'} options carries ${n1(H, 2)} bits of uncertainty, predicted to take about ${secs(rt)}.`,
    meaning: [
      mode === 'weighted' ? `If all ${n} were equally likely it would take ${secs(a + b * equalH)}; putting the common choices first or making them stand out is what makes the difference.` : `Doubling to ${n * 2} choices adds only about ${n1(b * (S.hickBits(n * 2) - H), 2)} s, because decision time grows with the logarithm of the number of options.`,
      'This is decision time only; finding, reading and pointing come on top.',
    ],
    confidence: defaults ? 'low' : 'medium',
    confidenceNote: defaults ? 'The intercept is illustrative and the slope is Card, Moran and Newell\'s typical value, not a measurement of your users.' : 'The prediction rests on the constants you entered. The law is never rated strong here because it applies only to familiar choices.',
    caveats: ['Hick-Hyman applies when people recognise a known option. For an unfamiliar list they read and search, and time grows roughly in proportion to the number of items.', 'Do not use it to argue for or against long menus without testing them.'],
    next: [`For the time to point at the chosen option, add ${calc('fitts', "Fitts' law")}.`],
    report: `Hick-Hyman law: ${n} options, H = ${n1(H, 2)} bits, predicted decision time ${secs(rt)} (a = ${a} s, b = ${b} s/bit).`,
  });
}

// ── Pricing and prioritisation ──

const countConfidence = (n, what) => [n < 30 ? 'low' : n < 100 ? 'medium' : 'high', `Based on ${n} ${what}. (Rule: under 30 weak, 30 to 99 some, 100 or more strong.)`];
const money = (v) => (fin(v) ? v.toFixed(2).replace(/\.?0+$/, '') : '—');

export function vanWestendorp({ r }) {
  const range = r.pmc && r.pme;
  const [confidence, confidenceNote] = countConfidence(r.n, 'respondents; with few respondents one or two answers can move a crossing point');
  return result({
    headline: range ? `Respondents find prices from ${money(r.pmc.x)} to ${money(r.pme.x)} acceptable${r.opp ? `, with an optimal price point of ${money(r.opp.x)}` : ''}.` : 'The price curves do not cross in a way that gives an acceptable range.',
    meaning: [
      range ? `Below ${money(r.pmc.x)}, more people find the price suspiciously cheap than find it no longer cheap; above ${money(r.pme.x)}, more find it too expensive than not expensive.` : 'Collect more responses, or check that people understood the four questions.',
      r.ipp ? `At ${money(r.ipp.x)} (the indifference price), as many call it cheap as expensive.` : 'There is no indifference price where cheap and expensive cross.',
      'The range is what people say is acceptable, not what maximises revenue or how many will buy.',
    ],
    confidence, confidenceNote,
    caveats: ['Stated price acceptance overstates real willingness to pay; check against purchase data where you can.', 'Respondents need to understand the product and its alternatives for their answers to mean much.'],
    next: [`To see demand and revenue at specific prices, run ${calc('gabor-granger', 'Gabor-Granger pricing')}.`],
    report: range ? `Van Westendorp analysis (n = ${r.n}): acceptable price range ${money(r.pmc.x)} to ${money(r.pme.x)}${r.opp ? `, optimal price point ${money(r.opp.x)}` : ''}${r.ipp ? `, indifference price ${money(r.ipp.x)}` : ''}.` : `Van Westendorp analysis (n = ${r.n}) did not yield an acceptable price range.`,
  });
}

export function gaborGranger({ r, cost = 0, nAsked = null }) {
  const best = r.bestRevenue, first = r.points[0], last = r.points[r.points.length - 1];
  const edge = best === last ? 'top' : best === first ? 'bottom' : null;
  let confidence = 'medium', confidenceNote = 'Enter the number asked at each price to judge precision. Without it the shares have no interval.';
  if (nAsked) {
    const ci = S.adjustedWald(Math.round(best.demand * nAsked), nAsked, 0.95);
    [confidence, confidenceNote] = rateConfidence(ci.lo, ci.hi, 0.95);
    confidenceNote = `Demand at ${money(best.price)} is ${p0(ci.lo)} to ${p0(ci.hi)}. ${confidenceNote}`;
  }
  if (edge) { confidence = 'low'; confidenceNote += ` The peak is at the ${edge} price you tested, so the true peak may lie outside the range (rated weak).`; }
  const elastic = r.points.filter((p) => fin(p.elasticity) && p.elasticity < -1);
  return result({
    headline: `${money(best.price)} gives the most revenue per person asked among the prices tested: ${p0(best.demand)} say they would buy at that price.`,
    meaning: [
      edge ? `That is the ${edge === 'top' ? 'highest' : 'lowest'} price you tested, so revenue may keep ${edge === 'top' ? 'rising above' : 'rising below'} it: test ${edge === 'top' ? 'higher' : 'lower'} prices too.` : 'The peak sits inside the tested range.',
      elastic.length ? `Demand is elastic (elasticity below −1) from ${money(elastic[0].price)} upwards: past that point, raising the price loses more buyers than it gains in revenue.` : 'Demand is inelastic between all neighbouring prices: price rises lose proportionally fewer buyers.',
      cost > 0 ? `With a unit cost of ${money(cost)}, profit per person asked peaks at ${money(r.bestProfit.price)}.` : 'Add a unit cost to see the profit-maximising price as well.',
    ],
    confidence, confidenceNote,
    caveats: ['Stated purchase intent overstates real buying, often by a lot: read the shape and the peak, not the levels.', 'Asking the same person several prices anchors their answers; randomise the starting price or show one price per person.'],
    next: [`For the range people find acceptable, see the ${calc('van-westendorp', 'Van Westendorp price meter')}.`],
    report: `Gabor-Granger: revenue per respondent peaked at ${money(best.price)} among the prices tested (${p0(best.demand)} stated purchase intent${nAsked ? `, n = ${nAsked} per price` : ''}).`,
  });
}

export function kano({ feats }) {
  const cat = (k) => feats.filter((f) => f.category === k);
  const names = (fs) => fs.map((f) => quote(f.name)).join(', ');
  const minN = Math.min(...feats.map((f) => f.n));
  const close = feats.filter((f) => { const c = Object.values(f.counts).sort((a, b) => b - a); return (c[0] - c[1]) / f.n < 0.1; });
  let [confidence, confidenceNote] = countConfidence(minN, 'answers for the feature with the fewest');
  if (close.length && confidence !== 'low') { confidence = downgrade(confidence); confidenceNote += ` ${names(close)} ${close.length > 1 ? 'are' : 'is'} classified by a margin of under 10% of answers (downgraded one step).`; }
  const meaning = [];
  if (cat('M').length) meaning.push(`Must-be: ${names(cat('M'))}. People expect ${cat('M').length > 1 ? 'these' : 'this'}; missing, ${cat('M').length > 1 ? 'they cause' : 'it causes'} dissatisfaction, but adding ${cat('M').length > 1 ? 'them' : 'it'} will not delight.`);
  if (cat('O').length) meaning.push(`One-dimensional: ${names(cat('O'))}. The better ${cat('O').length > 1 ? 'they work' : 'it works'}, the more satisfied people are.`);
  if (cat('A').length) meaning.push(`Attractive: ${names(cat('A'))}. ${cat('A').length > 1 ? 'They' : 'It'} can delight without being missed if absent.`);
  if (cat('I').length) meaning.push(`Indifferent: ${names(cat('I'))}. Most people do not care either way.`);
  const odd = feats.filter((f) => (f.counts.Q + f.counts.R) / f.n > 0.2);
  if (odd.length) meaning.push(`${names(odd)}: over 20% of answers are reverse or questionable, which often means the question was misunderstood.`);
  return result({
    headline: `Of ${plural(feats.length, 'feature')}: ${cat('M').length} must-be, ${cat('O').length} one-dimensional, ${cat('A').length} attractive and ${cat('I').length} indifferent.`,
    meaning, confidence, confidenceNote,
    caveats: ['Categories drift: attractive features become expected over time.', 'Different segments want different things; classify segments separately rather than pooling them.'],
    next: [`To rank features by importance, try ${calc('maxdiff', 'MaxDiff counts')}.`],
    report: `Kano classification of ${plural(feats.length, 'feature')} (Berger et al. 1993 table; ${minN === Math.max(...feats.map((f) => f.n)) ? `${minN} answers per feature` : `${minN} to ${Math.max(...feats.map((f) => f.n))} answers per feature`}): ${feats.map((f) => `${f.name} ${S.KANO_NAMES[f.category].toLowerCase()} (Better ${n1(f.better, 2)}, Worse ${n1(f.worse, 2)})`).join('; ')}.`,
  });
}

export function maxdiff({ rows, tasks }) {
  const top = rows[0], bottom = rows[rows.length - 1];
  const minShown = Math.min(...rows.map((r) => r.shown));
  const [confidence, confidenceNote] = countConfidence(minShown, 'showings for the least-shown item');
  const tie = rows.length > 1 && Math.abs(rows[0].norm - rows[1].norm) < 0.1;
  return result({
    headline: `${quote(top.item)} is the most preferred of ${rows.length} items and ${quote(bottom.item)} the least, from ${plural(tasks, 'task')}.`,
    meaning: [
      `On the ratio scale, ${quote(top.item)} would be chosen about ${n1(top.share / bottom.share, 1)} times as often as ${quote(bottom.item)}.`,
      tie ? `${quote(rows[0].item)} and ${quote(rows[1].item)} are within 0.1 of each other: treat them as joint leaders until you have more data.` : `${quote(top.item)} leads clearly.`,
      'Shares say how often an item would win a choice among these items, not how much anyone would pay for it.',
    ],
    confidence, confidenceNote,
    caveats: ['Counts agree with model-based scores when every item is shown equally often; for an unbalanced design or segment-level scores, fit a choice model.', 'Preference is relative to this set: adding or removing items changes the shares.'],
    next: [`To find the set of items that reaches the most people, try ${calc('turf', 'TURF reach')}.`],
    report: `MaxDiff counting (${plural(tasks, 'task')}): ${rows.map((r) => `${r.item} ${signed(r.norm, 2)}`).join(', ')} (best minus worst over times shown, −1 to +1).`,
  });
}

export function turf({ best, k, people, single, prev }) {
  const [confidence, confidenceNote] = countConfidence(people, 'respondents');
  return result({
    headline: `${best.label} together reach ${p0(best.reach)} of the ${people} respondents: each of them would find at least one item they want.`,
    meaning: [
      `The single best item, ${quote(single.nm)}, reaches ${p0(single.reach)} on its own.`,
      prev ? `Going from ${k - 1} to ${k} items adds ${pts(best.reach - prev.reach)} of reach${best.reach - prev.reach < 0.05 ? ': little gain, so a smaller set may do' : ''}.` : 'Try a larger set size to see how quickly reach levels off.',
      `Those reached like ${n1(best.freq, 2)} of the items on average.`,
    ],
    confidence, confidenceNote,
    caveats: ['TURF assumes one wanted item is enough, which suits menus and product lines, not cases where people need several items.', 'Several sets often reach almost the same share; look at the alternatives before picking one.'],
    next: [`To see which items people prefer most, try ${calc('maxdiff', 'MaxDiff counts')}.`],
    report: `TURF (n = ${people}): the best set of ${k} (${best.label}) reaches ${p0(best.reach)} of respondents, with an average frequency of ${n1(best.freq, 2)}.`,
  });
}

// ── Business case and content ──

export function uxRoi({ r, years, rate, oneOff, running }) {
  let pvB = 0, pvC = oneOff;
  for (let t = 1; t <= years; t++) { pvB += r.annual / (1 + rate) ** t; pvC += running / (1 + rate) ** t; }
  const buffer = pvB > 0 ? r.npv / pvB : -Infinity;
  // R9 for ROI: how far the benefits could fall before the net present value reaches zero. More than 50% strong,
  // 20 to 50% some, less (or a negative NPV) weak.
  const confidence = buffer > 0.5 ? 'high' : buffer > 0.2 ? 'medium' : 'low';
  const fmt = (x) => (fin(x) ? `${x < 0 ? '−' : ''}${Math.round(Math.abs(x)).toLocaleString('en-GB')}` : '—');
  const [bk, bv] = Object.entries(r.parts).sort((a, b) => b[1] - a[1])[0];
  const LABEL = { time: 'time saved', errors: 'errors avoided', conversion: 'extra conversions', support: 'support contacts avoided' };
  return result({
    headline: `Over ${years} year${years > 1 ? 's' : ''} the change returns ${p0(r.roi)} on its cost, with a net present value of ${fmt(r.npv)}${fin(r.paybackYears) ? ` and payback in about ${n1(r.paybackYears * 12, 0)} months` : ' and no payback at these figures'}.`,
    meaning: [
      bv > 0 ? `${LABEL[bk][0].toUpperCase()}${LABEL[bk].slice(1)} is the biggest benefit (${p0(bv / r.annual)} of ${fmt(r.annual)} a year), so that is the assumption to check hardest.` : 'No benefit is entered yet.',
      r.npv > 0 ? `The benefits could be ${p0(buffer)} lower and the work would still pay for itself in today's money.` : `The benefits would need to be ${p0(pvC / Math.max(pvB, 1e-9) - 1)} higher for the work to pay for itself in today's money.`,
    ],
    confidence,
    confidenceNote: r.npv > 0 ? `The case survives ${aan(p0(buffer))} drop in benefits. (Rule: survives more than 50% strong, 20 to 50% some, less weak.)` : 'At these figures the work does not pay back. (Rule: a negative net present value is weak.)',
    caveats: ['The answer is only as good as the inputs, and uplift and time-saved figures often come from a small test or a guess; show a low and a high case.', 'Do not count the same benefit twice: fewer errors often means fewer support calls.', 'Time saved is only money if people use it for something else of value.'],
    next: [`Back the biggest assumption with data, for example a measured time saving from ${calc('compare-means', 'Compare two means')} or an uplift from the ${calc('bayes-ab', 'Bayesian A/B test')}.`],
    report: `Estimated annual benefit ${fmt(r.annual)} against ${fmt(oneOff)} up front and ${fmt(running)} a year; over ${years} years, ROI ${p0(r.roi)} and NPV ${fmt(r.npv)} at ${aan(n1(rate * 100, 1) + '%')} discount rate${fin(r.paybackYears) ? `, simple payback ${n1(r.paybackYears * 12, 0)} months` : ''}.`,
  });
}

export function lostness({ L }) {
  const n = L.length, M = S.mean(L), lost = L.filter((l) => l > 0.5).length, fine = L.filter((l) => l < 0.4).length;
  const ci = n > 1 && S.sd(L) > 0 ? S.meanCI(M, S.sd(L), n, 0.95) : null;
  // R8 for lostness: fewer than 5 participants weak; otherwise the 95% interval width, up to 0.1 strong, up to 0.2 some.
  const confidence = n < 5 || !ci ? 'low' : ci.hi - ci.lo <= 0.1 ? 'high' : ci.hi - ci.lo <= 0.2 ? 'medium' : 'low';
  return result({
    headline: `Mean lostness was ${n1(M, 2)} from ${plural(n, 'participant')}: ${lost} ${lost === 1 ? 'was' : 'were'} lost (above 0.5) and ${fine} ${fine === 1 ? 'was' : 'were'} not (below 0.4), by Smith's (1996) thresholds.`,
    meaning: [
      M > 0.5 ? 'On average people wandered: look at where paths left the shortest route.' : M < 0.4 ? 'On average people found their way efficiently.' : 'On average navigation was borderline; look at the individual paths.',
      `Smith (1996) found that people scoring below 0.4 showed no signs of being lost and those above 0.5 did; between the two is a grey zone.`,
      ci ? `The mean is plausibly between ${n1(ci.lo, 2)} and ${n1(ci.hi, 2)} (95% confidence); the median is ${n1(S.median(L), 2)}.` : `The median is ${n1(S.median(L), 2)}.`,
    ],
    confidence,
    confidenceNote: ci ? `With ${n} participants the 95% interval is ${n1(ci.hi - ci.lo, 2)} wide. (Rule: under 5 participants weak; otherwise width up to 0.1 strong, up to 0.2 some, wider weak.)` : 'There is no interval yet. (Rule: under 5 participants weak.)',
    caveats: ['Lostness needs a known shortest route; a participant can be efficient and still end on the wrong page, so read it with success.', 'Count pages the same way for everyone (decide whether a modal or a filter change is a page).'],
    next: [`Report success alongside it with the ${calc('completion-rate', 'Completion rate interval')}.`],
    report: `Mean lostness was ${n1(M, 2)}${ci ? ` (95% confidence interval ${n1(ci.lo, 2)} to ${n1(ci.hi, 2)})` : ''} across ${n} participants; ${lost} exceeded Smith's (1996) 0.5 threshold for being lost.`,
  });
}

export function readability({ r, longAt = 25 }) {
  const band = S.fleschBand(r.fre);
  // R9 for readability: the formulas were built on passages of about 100 words or more. Under 100 words weak,
  // 100 to 299 some, 300 or more strong.
  const confidence = r.words < 100 ? 'low' : r.words < 300 ? 'medium' : 'high';
  return result({
    headline: `Flesch Reading Ease is ${n1(r.fre, 0)} (${band[0].toLowerCase()}), about US school grade ${n1(r.fkgl, 1)}.`,
    meaning: [
      `On Flesch's (1948) scale 60 to 70 is plain English (${band[1]} for this score); plain-language guidance for a general audience commonly aims for 60 or more.`,
      `The text averages ${n1(r.wps, 1)} words per sentence and ${n1(r.spw, 2)} syllables per word; long sentences pull the score down fastest.`,
      r.long.length ? `${plural(r.long.length, 'sentence')} ${r.long.length === 1 ? 'is' : 'are'} longer than ${longAt} words; splitting ${r.long.length === 1 ? 'it' : 'them'} is usually the quickest gain.` : `No sentence is longer than ${longAt} words.`,
    ],
    confidence,
    confidenceNote: `Based on ${r.words} words, with syllables counted by a rule of thumb. (Rule: under 100 words weak, 100 to 299 some, 300 or more strong.)`,
    caveats: ['Formulas only measure sentence and word length: short words in a confusing order still score well.', 'They are designed for English prose, not interface labels, bullet fragments or other languages.'],
    next: [`Test the content with real readers; see ${method('readability-testing', 'readability testing')}.`],
    report: `Flesch Reading Ease ${n1(r.fre, 0)} (${band[0].toLowerCase()}), Flesch-Kincaid grade ${n1(r.fkgl, 1)}, ${n1(r.wps, 1)} words per sentence (${r.words} words).`,
  });
}

// ── Segmentation ──

const silBand = (s) => (s > 0.7 ? 'strong structure' : s > 0.5 ? 'reasonable structure' : s > 0.25 ? 'weak structure that could be partly artificial' : 'no substantial structure');
const stabWords = (m) => (m >= 0.8 ? 'the clusters come back almost the same when the data are resampled' : m >= 0.6 ? 'the clusters mostly come back, but some respondents move between them' : 'the clusters change a lot when the data are resampled, so they may be an artefact of this sample');
const MIX_NAME = { gmm: 'Gaussian mixture', lca: 'Latent class analysis', mixed: 'The mixed latent profile/class model' };
const ALGO_NAME = { pam: 'k-medoids (PAM)', kproto: 'k-prototypes', kmeans: 'k-means', dbscan: 'DBSCAN', hier: 'Hierarchical clustering' };

export function clusterPersonas({ r, profs, names = [], stab = null, algo }) {
  const nameOf = (c) => names[c] || `Cluster ${c + 1}`;
  const N = r.N, mix = r.mix;
  const sizes = profs.map((p) => ({ c: p.cluster, share: p.share }));
  const small = sizes.filter((s) => s.share < 0.05);
  const flat = profs.filter((p) => !p.apart.length);
  const standouts = profs.filter((p) => p.apart.length).slice(0, 4).map((p) => `${quote(nameOf(p.cluster))} (${p0(p.share)}) ${p.apart[0].text.charAt(0).toLowerCase()}${p.apart[0].text.slice(1)}`);
  const caveats = ['Clusters are not personas until you have validated them with interviews: the numbers show who answered alike, not why.', 'Clustering always returns clusters, even from data with no real groups in it.', 'Segments reflect the questions you asked: a survey of attitudes gives attitudinal segments.'];
  const next = [];
  if (!stab && (mix ? r.k > 1 : r.clusters.length > 1)) next.push('Press "Check stability" to see whether the clusters survive resampling.');
  next.push(`Interview a few people from each ${mix ? 'class' : 'cluster'} to learn the goals and contexts behind the numbers; see ${method('cluster-validation-with-qualitative-investigation', 'validating clusters qualitatively')}.`);
  next.push(`Check the personas against behavioural data before you use them; see ${method('persona-validation-against-behavioural-data', 'persona validation')}.`);
  const stabLine = stab ? `Stability: an adjusted Rand index of ${n1(stab.mean, 2)} across 10 reruns on 80% subsamples, so ${stabWords(stab.mean)}.` : null;

  if (mix) {
    const minDiag = Math.min(...mix.avepp.map((row, a) => (mix.counts[a] ? row[a] : 1)));
    const e = mix.fit.entropyR2, perParam = N / mix.fit.nParams;
    if (r.k === 1) {
      return result({
        headline: `${MIX_NAME[mix.model]} found no evidence of distinct groups in ${N} respondents: one class fits best by BIC.`,
        meaning: ['Treating everyone as one group describes these answers as well as any split, once the extra complexity is paid for.', 'You can choose k to explore a split anyway, but any groups it shows are not supported by the model.'],
        confidence: 'low', confidenceNote: 'One class means there are no groups to be confident about. (Rule: one class weak.)',
        caveats, next: next.slice(-2),
        report: `A ${MIX_NAME[mix.model].toLowerCase()} fitted to ${N} respondents for k = 1 to ${mix.sweep.length} had its lowest BIC at k = 1, giving no evidence of distinct segments.`,
      });
    }
    const strong = e >= 0.8 && minDiag >= 0.8 && perParam >= 10 && mix.fit.converged && mix.fit.hits >= 2;
    let confidence = strong ? 'high' : e >= 0.6 && minDiag >= 0.7 ? 'medium' : 'low';
    if (stab && stab.mean < 0.6) confidence = 'low';
    const meaning = [
      `Entropy R² is ${n1(e, 2)}: ${e >= 0.8 ? 'respondents are assigned with high certainty, above the 0.8 that Clark and Muthén (2009) treat as high classification accuracy' : e >= 0.6 ? 'moderate certainty; some respondents sit between classes' : 'low certainty; the classes overlap a lot'}.`,
      `The lowest average posterior probability for a class is ${n1(minDiag, 2)} (${minDiag >= 0.7 ? 'above' : 'below'} the 0.7 Nagin (2005) suggests as a minimum for a clear class).`,
    ];
    if (standouts.length) meaning.push(`What sets them apart: ${standouts.join('; ')}.`);
    if (flat.length) meaning.push(`${flat.map((p) => quote(nameOf(p.cluster))).join(', ')} ${flat.length > 1 ? 'have' : 'has'} nothing that stands out strongly from the whole sample: possibly a "middle" group rather than a segment.`);
    if (small.length) meaning.push(`${small.map((s) => quote(nameOf(s.c))).join(', ')} ${small.length > 1 ? 'are' : 'is'} under 5% of the sample: probably too small to build a persona on.`);
    if (stabLine) meaning.push(stabLine);
    const warn = [];
    if (perParam < 10) warn.push(`only ${n1(perParam, 1)} respondents per parameter (rough guide: 10)`);
    if (mix.model !== 'gmm' && N < 200) warn.push(`${N} respondents (latent class models usually need about 200)`);
    if (!mix.fit.converged) warn.push('the fit did not converge');
    if (mix.fit.hits < 2) warn.push('only one run reached the best fit');
    return result({
      headline: `${MIX_NAME[mix.model]} found ${r.k} classes in ${N} respondents${r.bestK === r.k ? ' (the number BIC prefers)' : ` (BIC prefers ${r.bestK})`}, with entropy R² of ${n1(e, 2)}.`,
      meaning, confidence,
      confidenceNote: `Entropy R² ${n1(e, 2)}, smallest average posterior probability ${n1(minDiag, 2)}${warn.length ? `, and ${warn.join(', ')}` : ''}${stab ? `; stability ${n1(stab.mean, 2)}` : ''}. (Rule: entropy and posterior probability both 0.8 or more with enough data and a stable fit strong; entropy 0.6 and posterior probability 0.7 or more some; otherwise, or stability below 0.6, weak.)`,
      caveats: [caveats[0], caveats[1], 'Model-based classes assume answers are independent within a class; strongly related questions can create extra classes.'],
      next,
      report: `A ${MIX_NAME[mix.model].toLowerCase()} with ${r.k} classes (${r.bestK === r.k ? 'lowest BIC' : `BIC preferred ${r.bestK}`}; entropy R² ${n1(e, 2)}, smallest average posterior probability ${n1(minDiag, 2)}) was fitted to ${N} respondents${stab ? `; stability (ARI) ${n1(stab.mean, 2)}` : ''}. The classes are candidate segments pending qualitative validation.`,
    });
  }

  const k = r.clusters.length, sil = r.sil.mean;
  if (k === 0) {
    return result({
      headline: `DBSCAN found no dense groups: all ${N} respondents were marked as noise.`,
      meaning: ['With this eps and minPts no respondent has enough close neighbours to start a cluster.', 'That can mean the answers are spread evenly, or that eps is too small for these distances.'],
      confidence: 'low', confidenceNote: 'There are no clusters to evaluate.',
      caveats: caveats.slice(1),
      next: ['Raise eps (or lower minPts), or leave eps blank to use the bend of the k-distance plot.', 'Try k-medoids, which always returns groups, and judge them by the silhouette.'],
      report: `DBSCAN (eps = ${r.eps < 0.001 ? r.eps.toExponential(1) : n1(r.eps, 3)}, minPts = ${r.minPts}) found no clusters: all ${N} respondents were marked as noise.`,
    });
  }
  // R7: silhouette and stability.
  let confidence = sil > 0.5 && stab && stab.mean >= 0.8 ? 'high' : sil > 0.25 ? 'medium' : 'low';
  if (stab && stab.mean < 0.6) confidence = 'low';
  const meaning = [];
  if (fin(sil)) meaning.push(`By Kaufman and Rousseeuw's (1990) rule of thumb, an average silhouette of ${n1(sil, 2)} means ${silBand(sil)} (above 0.7 strong, 0.5 to 0.7 reasonable, 0.25 to 0.5 weak).`);
  else meaning.push('With a single cluster there is no silhouette to judge how distinct it is.');
  meaning.push(`Sizes range from ${p0(Math.min(...sizes.map((s) => s.share)))} to ${p0(Math.max(...sizes.map((s) => s.share)))} of respondents${r.noise ? `, and ${r.noise} (${p0(r.noise / r.n)}) did not fit any group (noise)` : ''}.`);
  if (standouts.length) meaning.push(`What sets them apart: ${standouts.join('; ')}.`);
  if (flat.length) meaning.push(`${flat.map((p) => quote(nameOf(p.cluster))).join(', ')} ${flat.length > 1 ? 'have' : 'has'} nothing that stands out strongly from the whole sample: possibly a "middle" group rather than a segment.`);
  if (small.length) meaning.push(`${small.map((s) => quote(nameOf(s.c))).join(', ')} ${small.length > 1 ? 'are' : 'is'} under 5% of respondents: probably too small to build a persona on.`);
  if (stabLine) meaning.push(stabLine);
  if (k > 1 && sil <= 0.25) next.unshift('Try another number of clusters or another method, or accept that these respondents may not form clear groups.');
  return result({
    headline: `${ALGO_NAME[algo] || 'The method'} split ${N} respondents into ${plural(k, 'cluster')}; ${fin(sil) ? `the average silhouette of ${n1(sil, 2)} means ${silBand(sil)}` : 'there is only one group'}.`,
    meaning, confidence,
    confidenceNote: `Silhouette ${fin(sil) ? n1(sil, 2) : 'not defined'}${stab ? `, stability ${n1(stab.mean, 2)}` : ', stability not yet checked'}. (Rule: silhouette above 0.5 and stability 0.8 or more strong; silhouette above 0.25 some, and no higher until stability is checked; otherwise, or stability below 0.6, weak.)`,
    caveats, next,
    report: `${ALGO_NAME[algo] || 'Clustering'} grouped ${N} respondents into ${plural(k, 'cluster')} (average silhouette ${n1(sil, 2)}${stab ? `; stability, mean adjusted Rand index over 10 subsamples, ${n1(stab.mean, 2)}` : ''}${r.noise ? `; ${r.noise} noise points` : ''}). The clusters are candidate segments pending qualitative validation.`,
  });
}
