// Non-response checks: AAPOR outcome rates, early vs late respondents, wave analysis and the R-indicator.
// Pure functions shared by surveyx-Nonresponse.jsx and server/scripts/check-surveyx.js.
import { mean, sd, quantile, welch, linreg, logistic, rng, bootIndex, parseTable, isNum, numericColumn, fmt, pct, pval, signed, clamp } from './surveyx-core.js';

// ── AAPOR Standard Definitions (10th edition, 2023) ──
// I complete, P partial, R refusal and break-off, NC non-contact, O other eligible non-interview,
// UH unknown if household/occupied, UO unknown other, NE not eligible, e share of unknown-eligibility cases that are eligible.
export const DISPOSITIONS = [
  ['I', 'Complete interviews', 'Finished the survey'],
  ['P', 'Partial interviews', 'Answered enough to count as a partial (by your own rule, e.g. 50–80% of key items)'],
  ['R', 'Refusals and break-offs', 'Eligible, contacted, declined or quit early'],
  ['NC', 'Non-contacts', 'Eligible but never reached (e.g. invitation bounced back as out of office)'],
  ['O', 'Other eligible non-interviews', 'Eligible but could not take part (language, illness, access)'],
  ['UH', 'Unknown eligibility, no contact', 'Nothing came back at all: invitation never opened'],
  ['UO', 'Unknown eligibility, other', 'Some contact but eligibility never established'],
  ['NE', 'Not eligible', 'Screened out or outside the target population; left out of every rate'],
];
export function aapor(d, eIn = null) {
  const g = (k) => Math.max(0, Number(d[k]) || 0);
  const I = g('I'), P = g('P'), R = g('R'), NC = g('NC'), O = g('O'), U = g('UH') + g('UO'), NE = g('NE');
  const known = I + P + R + NC + O;
  // e by proportional allocation: the eligible share among cases whose eligibility is known (AAPOR's "CASRO" method).
  const eEst = known + NE > 0 ? known / (known + NE) : 1;
  const e = eIn === null || eIn === '' || !Number.isFinite(Number(eIn)) ? eEst : clamp(Number(eIn), 0, 1);
  const d1 = I + P + R + NC + O + U, d3 = I + P + R + NC + O + e * U, d5 = I + P + R + NC + O;
  const coopD = I + P + R + O, conD = coopD + NC;
  const div = (a, b) => (b > 0 ? a / b : NaN);
  return {
    I, P, R, NC, O, U, NE, e, eEst, total: d1 + NE,
    RR1: div(I, d1), RR2: div(I + P, d1), RR3: div(I, d3), RR4: div(I + P, d3), RR5: div(I, d5), RR6: div(I + P, d5),
    COOP1: div(I, coopD), COOP2: div(I + P, coopD), COOP3: div(I, I + P + R), COOP4: div(I + P, I + P + R),
    REF1: div(R, d1), REF2: div(R, d3), REF3: div(R, d5),
    CON1: div(coopD, conD + U), CON2: div(coopD, conD + e * U), CON3: div(coopD, conD),
    unknownShare: div(U, d1),
  };
}
export const RATE_ROWS = [
  ['RR1', 'Response rate 1', 'I ÷ (I + P + R + NC + O + UH + UO)', 'Minimum: completes only, every unknown case counted as eligible'],
  ['RR2', 'Response rate 2', '(I + P) ÷ (I + P + R + NC + O + UH + UO)', 'Counts partials as responses'],
  ['RR3', 'Response rate 3', 'I ÷ (I + P + R + NC + O + e(UH + UO))', 'Only the estimated eligible share of unknowns'],
  ['RR4', 'Response rate 4', '(I + P) ÷ (I + P + R + NC + O + e(UH + UO))', 'Partials, and e of unknowns'],
  ['RR5', 'Response rate 5', 'I ÷ (I + P + R + NC + O)', 'Assumes no unknown case is eligible (e = 0)'],
  ['RR6', 'Response rate 6', '(I + P) ÷ (I + P + R + NC + O)', 'Maximum'],
  ['COOP1', 'Cooperation rate 1', 'I ÷ (I + P + R + O)', 'Of eligible people contacted'],
  ['COOP2', 'Cooperation rate 2', '(I + P) ÷ (I + P + R + O)', ''],
  ['REF1', 'Refusal rate 1', 'R ÷ (I + P + R + NC + O + UH + UO)', ''],
  ['REF2', 'Refusal rate 2', 'R ÷ (I + P + R + NC + O + e(UH + UO))', ''],
  ['CON1', 'Contact rate 1', '(I + P + R + O) ÷ (I + P + R + O + NC + UH + UO)', ''],
  ['CON2', 'Contact rate 2', '(I + P + R + O) ÷ (I + P + R + O + NC + e(UH + UO))', ''],
];

// ── Early vs late and wave analysis ──
// rows: parsed table rows; tCol: timing column (wave number or days to respond); vars: column indexes to compare.
export function timingData(text, tCol) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const nums = t.head.map((_, j) => numericColumn(t.rows, j));
  const tc = tCol !== undefined && tCol !== null && tCol >= 0 && tCol < t.head.length ? tCol : nums.findIndex(Boolean);
  if (tc < 0 || !nums[tc]) return { error: 'Choose a numeric timing column (wave number or days until the person responded).', head: t.head, nums };
  return { head: t.head, rows: t.rows, nums, tCol: tc };
}
export function earlyLate(data, rule = 'wave', vars = null, nonresp = 0) {
  const { head, rows, nums, tCol } = data;
  const cols = (vars || head.map((_, j) => j)).filter((j) => j !== tCol && nums[j]);
  const T = rows.map((r) => (isNum(r[tCol]) ? Number(r[tCol]) : NaN));
  const valid = T.map((t, i) => (Number.isFinite(t) ? i : -1)).filter((i) => i >= 0);
  const ts = valid.map((i) => T[i]);
  const distinct = [...new Set(ts)].sort((a, b) => a - b);
  let early, late, labels;
  if (rule === 'wave') {
    early = valid.filter((i) => T[i] === distinct[0]); late = valid.filter((i) => T[i] === distinct[distinct.length - 1]);
    labels = [`first wave (${head[tCol]} = ${distinct[0]})`, `last wave (${head[tCol]} = ${distinct[distinct.length - 1]})`];
  } else if (rule === 'quartile') {
    const q1 = quantile(ts, 0.25), q3 = quantile(ts, 0.75);
    early = valid.filter((i) => T[i] <= q1); late = valid.filter((i) => T[i] >= q3);
    labels = [`fastest quarter (${head[tCol]} ≤ ${+q1.toFixed(2)})`, `slowest quarter (${head[tCol]} ≥ ${+q3.toFixed(2)})`];
  } else {
    const m = quantile(ts, 0.5);
    early = valid.filter((i) => T[i] <= m); late = valid.filter((i) => T[i] > m);
    labels = [`first half (${head[tCol]} ≤ ${+m.toFixed(2)})`, `second half (${head[tCol]} > ${+m.toFixed(2)})`];
  }
  // Waves: the distinct timing values when there are at most 8, otherwise quartile groups of the timing column.
  let waveOf, waveNames;
  if (distinct.length <= 8) { waveOf = (i) => distinct.indexOf(T[i]) + 1; waveNames = distinct.map((v) => `${v}`); }
  else {
    const qs = [0.25, 0.5, 0.75].map((q) => quantile(ts, q));
    waveOf = (i) => 1 + qs.filter((q) => T[i] > q).length; waveNames = ['Q1 (fastest)', 'Q2', 'Q3', 'Q4 (slowest)'];
  }
  const results = cols.map((j) => {
    const val = (i) => (isNum(rows[i][j]) ? Number(rows[i][j]) : NaN);
    const a = early.map(val).filter(Number.isFinite), b = late.map(val).filter(Number.isFinite);
    const all = valid.map((i) => [waveOf(i), val(i)]).filter(([, y]) => Number.isFinite(y));
    const ys = all.map((p) => p[1]);
    const binary = ys.every((y) => y === 0 || y === 1);
    const w = a.length > 1 && b.length > 1 ? welch(b, a) : null; // late − early
    const nW = Math.max(...all.map((p) => p[0]));
    const waves = Array.from({ length: nW }, (_, k) => { const v = all.filter((p) => p[0] === k + 1).map((p) => p[1]); return { wave: k + 1, name: waveNames[k], n: v.length, mean: mean(v) }; });
    let cum = 0, cn = 0; for (const wv of waves) { cum += wv.mean * wv.n || 0; cn += wv.n; wv.cumMean = cn ? cum / cn : NaN; }
    const xs = all.map((p) => p[0]);
    const trend = new Set(xs).size > 2 || (new Set(xs).size === 2 && all.length > 3) ? linreg(xs, ys) : null;
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const extrap = trend ? clamp(trend.a + trend.b * (nW + 1), lo, hi) : NaN; // the next, unseen "wave": a proxy for non-respondents
    const obs = mean(ys), nr = Math.max(0, Number(nonresp) || 0);
    const adjusted = trend && nr > 0 ? (obs * ys.length + extrap * nr) / (ys.length + nr) : NaN;
    return { col: j, name: head[j], binary, early: a, late: b, w, waves, trend, extrap, obs, adjusted, n: ys.length };
  });
  return { labels, nEarly: early.length, nLate: late.length, nValid: valid.length, waveNames, results, rule, nonresp: Number(nonresp) || 0 };
}

// ── R-indicator (Schouten, Cobben and Bethlehem 2009) ──
// Response propensities from a main-effects logistic regression of response on the auxiliary variables.
export function designMatrix(rows, cols, nums) {
  const parts = [], names = ['(intercept)'];
  for (const j of cols) {
    if (nums[j]) { parts.push({ j, kind: 'num' }); names.push(`col${j}`); continue; }
    const counts = new Map(); for (const r of rows) counts.set(r[j], (counts.get(r[j]) || 0) + 1);
    const levels = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || String(a).localeCompare(String(b)));
    parts.push({ j, kind: 'cat', ref: levels[0], levels: levels.slice(1), all: levels });
    for (const l of levels.slice(1)) names.push(`col${j}=${l}`);
  }
  const X = rows.map((r) => [1, ...parts.flatMap((p) => (p.kind === 'num' ? [Number(r[p.j])] : p.levels.map((l) => (r[p.j] === l ? 1 : 0))))]);
  return { X, parts, names };
}
export function rIndicatorCore(rho) {
  const n = rho.length, m = mean(rho), S = sd(rho);
  // Maximal absolute standardised bias (1 − R) / (2 ρ̄), which equals the coefficient of variation S / ρ̄.
  return { n, mean: m, S, R: 1 - 2 * S, cv: S / m, maxBias: (2 * S) / (2 * m) };
}
export function rIndicator(text, respCol, auxCols, { boot = 250, seed = 7 } = {}) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const nums = t.head.map((_, j) => numericColumn(t.rows, j));
  if (!(respCol >= 0)) return { error: 'Choose the column that says whether each sampled person responded (1/0, yes/no).' };
  const yes = new Set(['1', 'yes', 'y', 'true', 'responded', 'r']);
  const no = new Set(['0', 'no', 'n', 'false', 'nonrespondent', 'nr']);
  const cols = auxCols.filter((j) => j !== respCol && j >= 0 && j < t.head.length);
  if (!cols.length) return { error: 'Choose at least one auxiliary variable known for respondents and non-respondents alike.' };
  const rows = t.rows.filter((r) => (yes.has(String(r[respCol]).toLowerCase()) || no.has(String(r[respCol]).toLowerCase())) && cols.every((j) => r[j] !== '' && (!nums[j] || isNum(r[j]))));
  const dropped = t.rows.length - rows.length;
  if (rows.length < 20) return { error: 'The R-indicator needs at least 20 sampled cases with complete auxiliary data.' };
  const y = rows.map((r) => (yes.has(String(r[respCol]).toLowerCase()) ? 1 : 0));
  const nResp = y.reduce((a, b) => a + b, 0);
  if (nResp === 0 || nResp === rows.length) return { error: 'Everyone (or no one) responded, so response propensities cannot vary.' };
  const { X, parts } = designMatrix(rows, cols, nums);
  const fit = logistic(X, y);
  if (!fit.converged) return { error: 'The response model did not converge. A category may have everyone or no one responding; merge small categories and try again.' };
  const core = rIndicatorCore(fit.fitted);
  // Unconditional partial R-indicators (Schouten, Shlomo and Skinner 2011): between-category spread of propensities.
  const partials = parts.map((p) => {
    const j = p.j;
    let groupOf, gnames;
    if (p.kind === 'cat') { gnames = p.all; groupOf = (r) => gnames.indexOf(r[j]); }
    else {
      const v = rows.map((r) => Number(r[j])), qs = [0.25, 0.5, 0.75].map((q) => quantile(v, q));
      gnames = ['lowest quarter', 'second quarter', 'third quarter', 'highest quarter']; groupOf = (r) => qs.filter((q) => Number(r[j]) > q).length;
    }
    const cats = gnames.map((name, k) => {
      const idx = rows.map((r, i) => (groupOf(r) === k ? i : -1)).filter((i) => i >= 0);
      const mr = mean(idx.map((i) => fit.fitted[i])), share = idx.length / rows.length;
      return { name, n: idx.length, rate: mean(idx.map((i) => y[i])), meanRho: mr, pu: Math.sqrt(share) * (mr - core.mean) };
    }).filter((c) => c.n > 0);
    const pu = Math.sqrt(cats.reduce((s, c) => s + (c.n / rows.length) * (c.meanRho - core.mean) ** 2, 0));
    return { col: j, name: t.head[j], kind: p.kind, pu, cats };
  }).sort((a, b) => b.pu - a.pu);
  // Percentile bootstrap interval for R: resample cases, refit the model, recompute R.
  const u = rng(seed), Rs = [];
  for (let b = 0; b < boot; b++) {
    const idx = bootIndex(rows.length, u), Xb = idx.map((i) => X[i]), yb = idx.map((i) => y[i]);
    const s = yb.reduce((a, c) => a + c, 0); if (s === 0 || s === yb.length) continue;
    const fb = logistic(Xb, yb, null, 30, fit.beta); if (fb.converged) Rs.push(rIndicatorCore(fb.fitted).R);
  }
  Rs.sort((a, b) => a - b);
  const ci = Rs.length >= 50 ? [quantile(Rs, 0.025), quantile(Rs, 0.975)] : [NaN, NaN];
  return { ...core, ci, nBoot: Rs.length, nResp, rate: nResp / rows.length, partials, fitted: fit.fitted, y, beta: fit.beta, dropped, head: t.head, cols };
}

// ── "Reading your results" ──
// Confidence rule (response rates): the rates are exact counts, so confidence describes how well the rate pins down
// eligibility. High when unknown-eligibility cases are under 10% of the denominator, medium under 25%, low otherwise.
export function ratesSummary(a) {
  const rr = a.RR3, spread = a.RR1 && a.RR5 ? a.RR5 - a.RR1 : 0;
  const confidence = a.unknownShare < 0.1 ? 'high' : a.unknownShare < 0.25 ? 'medium' : 'low';
  const coopLow = a.COOP1 < a.CON1;
  return {
    headline: `AAPOR response rate 3 is ${pct(a.RR3, 1)} (RR1 ${pct(a.RR1, 1)} to RR6 ${pct(a.RR6, 1)}) from ${a.I} completes out of ${a.total} cases sampled.`,
    meaning: [
      `${pct(a.unknownShare, 0)} of cases never established whether they were eligible; with e = ${a.e.toFixed(3)} of them treated as eligible, RR3 sits between the strict RR1 and the generous RR5.`,
      `Of eligible people you reached, ${pct(a.COOP1, 0)} completed (cooperation rate 1), and you reached ${pct(a.CON1, 0)} of the eligible sample (contact rate 1). ${coopLow ? 'Cooperation is the bigger loss: work on the invitation, incentive or survey length.' : 'Contact is the bigger loss: work on reaching people (channel, timing, reminders).'}`,
      `A response rate says how many answered, not whether they differ from those who did not. Groves and Peytcheva's (2008) meta-analysis of 59 studies found the response rate explained little of the variation in non-response bias, so check bias directly with the early/late and R-indicator tabs.`,
    ],
    confidence,
    confidenceNote: `The rates are exact counts; how sure you can be depends on eligibility. Rule: high when unknown-eligibility cases are under 10% of the RR1 denominator, medium under 25%, low otherwise (here ${pct(a.unknownShare, 0)}, so the RR1 to RR5 range is ${(spread * 100).toFixed(1)} points).`,
    caveats: [
      'Always name the rate you report (RR1, RR3 …) and how you estimated e; a bare "response rate" cannot be compared with anyone else\'s.',
      'For opt-in panels and river samples the base is unknown, so AAPOR calls these participation rates, not response rates.',
    ],
    next: [
      'Compare early and late respondents on key answers (next tab) to see whether harder-to-get people answer differently.',
      'If you have frame data on everyone sampled, compute the R-indicator to see which groups are under-represented, then weight with the [survey weighting](/calculators/survey-weighting) tool.',
    ],
    report: `Of ${a.total} sampled cases, ${a.I} completed the survey (AAPOR RR1 ${pct(a.RR1, 1)}, RR3 ${pct(a.RR3, 1)} with e = ${a.e.toFixed(3)} estimated by proportional allocation; cooperation rate 1 ${pct(a.COOP1, 1)}, contact rate 1 ${pct(a.CON1, 1)}).`,
  };
}

// Confidence rule (early vs late): high when every compared group has at least 50 respondents and at least 3 waves
// or timing groups exist; medium when both groups have at least 20; low otherwise. A null result is never "strong"
// evidence of no bias because late respondents are only a proxy for non-respondents.
export function earlyLateSummary(e) {
  const r = e.results.filter((x) => x.w);
  if (!r.length) return null;
  const sig = r.filter((x) => x.w.p < 0.05), trendSig = r.filter((x) => x.trend && x.trend.p < 0.05);
  const top = [...r].sort((a, b) => a.w.p - b.w.p)[0];
  const minN = Math.min(e.nEarly, e.nLate), nW = r[0].waves.length;
  const confidence = minN >= 50 && nW >= 3 ? (sig.length ? 'high' : 'medium') : minN >= 20 ? 'medium' : 'low';
  const unit = (x, v, d = 2) => (x.binary ? pct(v, 1) : fmt(v, d));
  const diffTxt = (x) => (x.binary ? `${signed(x.w.d * 100, 1)} points` : signed(x.w.d, 2));
  const meaning = r.slice(0, 4).map((x) => `${x.name}: ${e.labels[0]} ${unit(x, x.w.m2)} vs ${e.labels[1]} ${unit(x, x.w.m1)} (late − early ${diffTxt(x)}, 95% CI ${x.binary ? `${fmt(x.w.lo * 100, 1)} to ${fmt(x.w.hi * 100, 1)} points` : `${fmt(x.w.lo)} to ${fmt(x.w.hi)}`}, p ${pval(x.w.p)}).${x.trend ? ` Across waves the trend is ${signed(x.binary ? x.trend.b * 100 : x.trend.b, 2)}${x.binary ? ' points' : ''} per wave (p ${pval(x.trend.p)}).` : ''}`);
  if (e.nonresp > 0) {
    const adj = r.filter((x) => Number.isFinite(x.adjusted));
    if (adj.length) meaning.push(`Treating the ${e.nonresp} non-respondents as one more wave on the same trend (continuum of resistance), ${adj.slice(0, 3).map((x) => `${x.name} would move from ${unit(x, x.obs)} to ${unit(x, x.adjusted)}`).join('; ')}. This is a sensitivity check, not a correction.`);
  }
  return {
    headline: sig.length
      ? `${sig.length} of ${r.length} variable${r.length === 1 ? '' : 's'} differ between early and late respondents; the clearest is ${top.name} (late − early ${diffTxt(top)}, p ${pval(top.w.p)}).`
      : `No variable differs clearly between early and late respondents (smallest p ${pval(top.w.p)} for ${top.name}).`,
    meaning,
    confidence,
    confidenceNote: `Rule: high when both groups have at least 50 people, there are at least 3 waves and a difference was found; medium when both groups have at least 20 (here ${e.nEarly} early and ${e.nLate} late, ${nW} waves or timing groups); low otherwise. Late respondents are only a stand-in for people who never answered, so "no difference" is never strong evidence of no bias.`,
    caveats: [
      'The continuum-of-resistance idea (Armstrong and Overton 1977) assumes non-respondents resemble the hardest-to-get respondents. People who never answer can differ in other ways, such as lack of interest in the topic.',
      trendSig.length ? `A steady trend across waves (${trendSig.map((x) => x.name).join(', ')}) suggests non-respondents lie further along it, so the full-sample estimate is likely biased in the direction of the early respondents.` : 'With many variables, expect about 1 in 20 to differ at p < 0.05 by chance alone.',
    ],
    next: [
      'Weight on frame variables that predict both response and the answers (see the R-indicator tab and the [survey weighting](/calculators/survey-weighting) tool).',
      'If budgets allow, follow up a random subsample of non-respondents with a short version of the survey: the strongest check of non-response bias.',
    ],
    report: `Comparing ${e.labels[0]} (n = ${e.nEarly}) with ${e.labels[1]} (n = ${e.nLate}), ${sig.length ? `${sig.map((x) => `${x.name} differed (late − early ${diffTxt(x)}, p ${pval(x.w.p)})`).join('; ')}` : `no variable differed at p < 0.05`} (Welch t tests).`,
  };
}

// Confidence rule (R-indicator): high when at least 500 sampled cases and the bootstrap interval for R is narrower
// than 0.10; medium when at least 200 cases or the interval is narrower than 0.20; low otherwise.
export function rIndicatorSummary(r) {
  const w = r.ci[1] - r.ci[0];
  const confidence = r.n >= 500 && w < 0.1 ? 'high' : r.n >= 200 || w < 0.2 ? 'medium' : 'low';
  const top = r.partials[0], cats = top ? [...top.cats].sort((a, b) => a.pu - b.pu) : [];
  const under = cats[0], over = cats[cats.length - 1];
  return {
    headline: `R-indicator ${r.R.toFixed(3)} (95% bootstrap CI ${fmt(r.ci[0], 3)} to ${fmt(r.ci[1], 3)}): response propensities vary with SD ${r.S.toFixed(3)} around an average of ${pct(r.mean, 1)}.`,
    meaning: [
      `R = 1 means everyone had the same chance of responding given these variables (a representative response); R = 0 is the worst case. It only covers the variables in the model: ${r.partials.map((p) => p.name).join(', ')}.`,
      `For any survey answer, the bias of the respondent mean is at most (1 − R) × SD ÷ (2 × mean propensity) = ${r.maxBias.toFixed(2)} standard deviations of that answer, if the answer depends on response only through these variables (Schouten, Cobben and Bethlehem 2009).`,
      top ? `${top.name} contributes most (partial R ${top.pu.toFixed(3)}): ${under.name} responded at ${pct(under.rate, 0)} and ${over.name} at ${pct(over.rate, 0)}.` : '',
      `That bound equals the coefficient of variation of the propensities (SD ÷ mean), which is easier than R to compare across surveys with different response rates; lower is better.`,
    ].filter(Boolean),
    confidence,
    confidenceNote: `Rule: high with at least 500 sampled cases and a bootstrap interval for R narrower than 0.10; medium with at least 200 cases or an interval narrower than 0.20; low otherwise (here ${r.n} cases, interval width ${fmt(w, 3)}). There is no agreed pass mark for R; compare it with earlier waves or similar surveys.`,
    caveats: [
      'R measures representativeness only on the variables you put in; a high R does not rule out bias on things the frame does not record.',
      'R-indicators estimated from small samples are biased downwards (random noise makes propensities look more variable), so expect slightly lower values from small samples.',
    ],
    next: [
      `Target follow-up reminders or incentives at the groups with the most negative partial R (${under ? under.name : 'the lowest-responding group'}), then recompute.`,
      'Weight respondents on the variables with the largest partial R using the [survey weighting](/calculators/survey-weighting) tool.',
    ],
    report: `Of ${r.n} sampled cases, ${r.nResp} responded (${pct(r.rate, 1)}). A logistic response-propensity model on ${r.partials.map((p) => p.name).join(', ')} gave an R-indicator of ${r.R.toFixed(3)} (95% bootstrap CI ${fmt(r.ci[0], 3)} to ${fmt(r.ci[1], 3)}) and a maximal absolute standardised bias of ${r.maxBias.toFixed(2)}; ${top ? `${top.name} contributed most to the lack of representativeness (partial R ${top.pu.toFixed(3)})` : ''}.`,
  };
}
