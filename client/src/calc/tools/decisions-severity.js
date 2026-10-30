// Severity ratings across evaluators: aggregation (Nielsen 0–4, or impact × frequency × persistence), inter-rater
// agreement (Krippendorff's alpha, ICC), and how many evaluators are enough (Nielsen and Landauer's λ model and a
// Monte Carlo curve over random groups of evaluators). Pure functions; checked in server/scripts/check-decisions.js.
import { nonEmptyLines, splitCells, mean, median, sd, choose, rng, fmt, pctS } from './decisions-core.js';
import { krippendorffAlpha, adjustP } from '../stats.js';

const MISSING = new Set(['', '-', '.', 'na', 'n/a', '?']);
export const NIELSEN = ['Not a problem', 'Cosmetic', 'Minor', 'Major', 'Catastrophe'];

// Parse "problem, r1, r2, …" rows. Nielsen mode: ratings 0–4. IFP mode: each cell "impact/frequency/persistence",
// each 1–5, scored as the product (1–125). A first row of evaluator names is used as a header.
export function parseRatings(text, mode = 'nielsen') {
  const lines = nonEmptyLines(text), errors = [];
  let evaluators = null;
  const rows = [];
  lines.forEach((line, li) => {
    const c = splitCells(line);
    const cells = c.slice(1);
    if (li === 0 && cells.length && cells.every((v) => !MISSING.has(v.toLowerCase()) && !/^[\d./\s]+$/.test(v))) { evaluators = cells; return; }
    const vals = cells.map((v) => {
      const t = v.trim().toLowerCase();
      if (MISSING.has(t)) return null;
      if (mode === 'ifp') {
        const parts = t.split(/[/x×*]/).map(Number);
        if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p) || p < 1 || p > 5)) { errors.push(`Line ${li + 1}: "${v}" should be impact/frequency/persistence, each 1–5`); return null; }
        return { i: parts[0], f: parts[1], p: parts[2], v: parts[0] * parts[1] * parts[2] };
      }
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0 || n > 4) { errors.push(`Line ${li + 1}: "${v}" should be a whole number from 0 to 4`); return null; }
      return { v: n };
    });
    rows.push({ name: c[0] || `Problem ${rows.length + 1}`, vals });
  });
  const m = Math.max(0, ...rows.map((r) => r.vals.length));
  rows.forEach((r) => { while (r.vals.length < m) r.vals.push(null); });
  return { rows, evaluators: Array.from({ length: m }, (_, j) => evaluators?.[j] || `E${j + 1}`), errors };
}

// Per-problem aggregate: mean (Nielsen's recommendation: the mean of several evaluators), median, SD, range, and a
// flag when evaluators differ by 2 or more points (0–4 scale) or by a factor of 2 or more (IFP products).
export function aggregate(rows, mode = 'nielsen') {
  return rows.map((r, idx) => {
    const v = r.vals.filter(Boolean).map((x) => x.v);
    const m = mean(v), lo = Math.min(...v), hi = Math.max(...v);
    const parts = mode === 'ifp' ? ['i', 'f', 'p'].map((k) => mean(r.vals.filter(Boolean).map((x) => x[k]))) : null;
    const spread = mode === 'ifp' ? (lo > 0 ? hi / lo >= 2 : false) : hi - lo >= 2;
    return { idx, name: r.name, n: v.length, mean: m, median: median(v), sd: sd(v), lo, hi, spread, parts, label: mode === 'nielsen' && v.length ? NIELSEN[Math.round(m)] : null };
  });
}

// ICC for a complete problems × evaluators matrix (Shrout and Fleiss 1979, two-way random effects, absolute
// agreement): ICC(2,1) for one evaluator and ICC(2,k) for the mean of k evaluators, from the two-way ANOVA mean squares.
export function icc(X) {
  const n = X.length, k = X[0]?.length || 0;
  if (n < 2 || k < 2) return null;
  const g = mean(X.flat()), rm = X.map((r) => mean(r)), cm = Array.from({ length: k }, (_, j) => mean(X.map((r) => r[j])));
  const ssr = k * rm.reduce((a, m) => a + (m - g) ** 2, 0), ssc = n * cm.reduce((a, m) => a + (m - g) ** 2, 0);
  const sst = X.flat().reduce((a, x) => a + (x - g) ** 2, 0), sse = sst - ssr - ssc;
  const msr = ssr / (n - 1), msc = ssc / (k - 1), mse = sse / ((n - 1) * (k - 1));
  return {
    icc21: (msr - mse) / (msr + (k - 1) * mse + (k * (msc - mse)) / n),
    icc2k: (msr - mse) / (msr + (msc - mse) / n),
    n, k, msr, msc, mse, colMeans: cm,
  };
}

export function agreement(rows) {
  const units = rows.map((r) => r.vals.map((x) => (x ? x.v : null)));
  const ka = krippendorffAlpha(units, 'ordinal');
  const complete = units.filter((u) => u.every((v) => v !== null));
  const ic = complete.length >= 2 ? icc(complete) : null;
  // Pairwise: share of evaluator pairs (per problem) giving the same rating, and within one point.
  let pairs = 0, same = 0, near = 0;
  for (const u of units) {
    const v = u.filter((x) => x !== null);
    for (let a = 0; a < v.length; a++) for (let b = a + 1; b < v.length; b++) { pairs++; if (v[a] === v[b]) same++; if (Math.abs(v[a] - v[b]) <= 1) near++; }
  }
  // Leniency: each evaluator's mean and their correlation with the mean of the others.
  const k = units[0]?.length || 0;
  const raters = Array.from({ length: k }, (_, j) => {
    const own = [], rest = [];
    units.forEach((u) => {
      if (u[j] === null) return;
      const o = u.filter((x, jj) => jj !== j && x !== null);
      if (!o.length) return;
      own.push(u[j]); rest.push(mean(o));
    });
    const mo = mean(own), mr = mean(rest);
    const cov = own.reduce((a, x, i) => a + (x - mo) * (rest[i] - mr), 0);
    const r = cov / Math.sqrt(own.reduce((a, x) => a + (x - mo) ** 2, 0) * rest.reduce((a, x) => a + (x - mr) ** 2, 0));
    return { j, n: own.length, mean: mo, r };
  });
  // ICC from very few or anti-correlated ratings can fall outside −1 to 1; it is then not meaningful and not shown.
  const icOk = ic && [ic.icc21, ic.icc2k].every((v) => Number.isFinite(v) && Math.abs(v) <= 1) ? ic : null;
  return { alpha: ka.alpha, alphaUnits: ka.units, icc: icOk, nComplete: complete.length, exact: pairs ? same / pairs : NaN, within1: pairs ? near / pairs : NaN, pairs, raters };
}

// ── How many evaluators are enough ──
// Detection matrix D[problem][evaluator] = 1 if that evaluator found the problem.
export function parseDetection(text) {
  const out = [], errors = [];
  nonEmptyLines(text).forEach((line, li) => {
    const c = splitCells(line), vals = c.slice(1).map((v) => v.trim().toLowerCase());
    if (li === 0 && vals.length && vals.every((v) => !/^(1|0|x|y|yes|no|n|-|)$/.test(v))) return; // header
    const row = vals.map((v) => (/^(1|x|y|yes)$/.test(v) ? 1 : 0));
    if (vals.some((v) => !/^(1|0|x|y|yes|no|n|-|)$/.test(v))) errors.push(`Line ${li + 1}: use 1 for found and 0 for missed`);
    out.push({ name: c[0], row });
  });
  const m = Math.max(0, ...out.map((r) => r.row.length));
  out.forEach((r) => { while (r.row.length < m) r.row.push(0); });
  return { rows: out.filter((r) => r.row.some((v) => v)), all: out, m, errors };
}

// λ = mean proportion of the known problems found by one evaluator (Nielsen and Landauer 1993); Lewis's (2001)
// small-sample adjustment averages a normalisation and a Good-Turing deflation.
export function lambdaOf(D) {
  const P = D.length, m = D[0]?.length || 0;
  const perEval = Array.from({ length: m }, (_, j) => D.reduce((a, r) => a + r[j], 0) / P);
  const lam = mean(perEval);
  const once = D.filter((r) => r.reduce((a, b) => a + b, 0) === 1).length;
  const adj = m >= 2 ? adjustP(lam, m, once / P) : lam;
  return { lam, adj, perEval, once, P, m };
}
// Exact expected share of known problems found by a random group of i evaluators (drawn without replacement):
// a problem found by c of m evaluators is missed by the group with probability C(m − c, i)/C(m, i).
export function exactCurve(D) {
  const m = D[0]?.length || 0, cs = D.map((r) => r.reduce((a, b) => a + b, 0));
  return Array.from({ length: m }, (_, t) => {
    const i = t + 1;
    return { i, mean: mean(cs.map((c) => 1 - choose(m - c, i) / choose(m, i))) };
  });
}
// Monte Carlo over random groups (Nielsen and Molich's procedure): for each group size, draw `draws` random groups
// without replacement, take the union of their problems and record the share found; returns mean and the 10th and
// 90th percentiles.
export function mcCurve(D, draws = 2000, seed = 3) {
  const m = D[0]?.length || 0, P = D.length, r = rng(seed);
  const cols = Array.from({ length: m }, (_, j) => D.map((row) => row[j]));
  const idx = [...Array(m).keys()];
  const found = new Uint8Array(P);
  return Array.from({ length: m }, (_, t) => {
    const i = t + 1, vals = new Float64Array(draws);
    for (let d = 0; d < draws; d++) {
      for (let a = 0; a < i; a++) { const b = a + Math.floor(r() * (m - a)); const tmp = idx[a]; idx[a] = idx[b]; idx[b] = tmp; }
      found.fill(0);
      for (let a = 0; a < i; a++) { const col = cols[idx[a]]; for (let p = 0; p < P; p++) if (col[p]) found[p] = 1; }
      let s = 0; for (let p = 0; p < P; p++) s += found[p];
      vals[d] = s / P;
    }
    const sorted = Array.from(vals).sort((x, y) => x - y);
    return { i, mean: sorted.reduce((a, b) => a + b, 0) / draws, p10: sorted[Math.floor(0.1 * (draws - 1))], p90: sorted[Math.ceil(0.9 * (draws - 1))] };
  });
}
// Nielsen and Landauer (1993): found(i) = 1 − (1 − λ)^i, and the evaluators needed for a target share.
export const nlFound = (lam, i) => 1 - (1 - lam) ** i;
export const nlNeeded = (lam, goal) => (lam > 0 && lam < 1 ? Math.ceil(Math.log(1 - goal) / Math.log(1 - lam)) : NaN);

// "Reading your results" summary.
// Confidence rule (Krippendorff 2004 thresholds for ordinal alpha, with at least three evaluators, as Nielsen advises):
//   high   — alpha ≥ 0.80 and 3 or more evaluators rated each problem on average;
//   medium — alpha ≥ 0.667 (Krippendorff's lowest acceptable level for tentative conclusions), or alpha ≥ 0.80 with
//            fewer than 3 evaluators;
//   low    — alpha below 0.667, or alpha could not be computed.
export function severitySummary({ agg, ag, mode, evaluators, curve }) {
  const nR = mean(agg.map((a) => a.n));
  const a = ag.alpha;
  const confidence = !Number.isFinite(a) || a < 0.667 ? 'low' : a >= 0.8 && nR >= 3 ? 'high' : 'medium';
  const sorted = [...agg].filter((x) => x.n).sort((x, y) => y.mean - x.mean);
  const severe = mode === 'nielsen' ? sorted.filter((x) => x.mean >= 3) : sorted.filter((x) => x.mean >= 27);
  const spread = agg.filter((x) => x.spread);
  const top = sorted[0];
  const scale = mode === 'nielsen' ? 'on the 0–4 scale' : 'as impact × frequency × persistence (1–125)';
  const headline = `${severe.length} of ${agg.length} problems are rated ${mode === 'nielsen' ? 'major or catastrophic (mean 3 or more)' : 'high (product 27 or more, e.g. 3 × 3 × 3)'}; the most severe is "${top.name}" (mean ${fmt(top.mean, mode === 'nielsen' ? 1 : 0)} ${scale}).`;
  const meaning = [
    `Agreement between the ${evaluators.length} evaluators: Krippendorff's alpha (ordinal) ${fmt(a, 2)}${ag.icc ? `; ICC for one evaluator ${fmt(ag.icc.icc21, 2)}, for the mean of ${ag.icc.k} ${fmt(ag.icc.icc2k, 2)}` : ''}. The mean of several evaluators is much more reliable than any one rating, which is why Nielsen recommends averaging at least three.`,
    `${pctS(ag.exact)} of evaluator pairs gave exactly the same rating and ${pctS(ag.within1)} were within one point.`,
  ];
  if (spread.length) meaning.push(`${spread.length} problem${spread.length === 1 ? '' : 's'} had evaluators far apart (${spread.slice(0, 3).map((x) => `"${x.name}"`).join(', ')}); discuss these before fixing the order.`);
  if (curve) meaning.push(`One evaluator found ${pctS(curve.lam)} of the known problems on average (λ); by the Nielsen and Landauer model ${curve.n75} evaluators would find about 75% and ${curve.n90} about 90%. In your data, ${curve.mcAt3 !== undefined ? `three random evaluators found ${pctS(curve.mcAt3)} on average` : 'the curve flattens as shown'}.`);
  const caveats = [
    'Severity is a judgement. Agreement tells you whether the evaluators share a standard, not whether the standard is right; tie ratings to evidence such as how many test participants were affected.',
    curve ? 'The evaluator curve is relative to the problems this group found; problems none of them found are not counted, so the true share found is lower.' : 'Ratings from evaluators who also found the problems tend to be higher; rate the merged list after aggregation, as Nielsen advised.',
  ];
  const next = [
    confidence === 'low' ? 'Agree anchored definitions for each level with examples, then re-rate the problems with the widest spread.' : `Fix the ${Math.max(1, severe.length)} highest-rated problem${severe.length === 1 ? '' : 's'} first and track the severity mix across releases.`,
    'Log problems with their severity in an issue log, and use a [use FMEA](/calculators/use-fmea) when errors could cause harm.',
  ];
  const report = `${evaluators.length} evaluators rated ${agg.length} usability problems ${scale}; ${severe.length} were rated ${mode === 'nielsen' ? 'major or catastrophic' : 'high'} (top: "${top.name}", mean ${fmt(top.mean, mode === 'nielsen' ? 1 : 0)}). Inter-rater agreement: Krippendorff's alpha (ordinal) = ${fmt(a, 2)}${ag.icc ? `, ICC(2,k) = ${fmt(ag.icc.icc2k, 2)}` : ''}.${curve ? ` A single evaluator found ${pctS(curve.lam)} of the known problems on average.` : ''}`;
  return {
    headline, meaning, confidence,
    confidenceNote: 'Based on Krippendorff\'s alpha (ordinal): high when alpha is at least 0.80 and three or more evaluators rated each problem; medium when alpha is at least 0.667 (Krippendorff 2004\'s minimum for tentative conclusions) or fewer evaluators took part; low below 0.667.',
    caveats, next, report,
  };
}
