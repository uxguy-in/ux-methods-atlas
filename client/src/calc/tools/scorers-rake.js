// Survey weighting: raking (iterative proportional fitting) to target margins, weight trimming, Kish's design
// effect and effective sample size, and weighted means and proportions with linearisation (Taylor) standard errors.
// Pure functions; checked in server/scripts/check-scorers.js against samplics, ipfn and numpy (scorers-reference.py).
import { mean, tInv, splitLine, MISSING } from './scorers-math.js';

const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const pct = (x, d = 1) => `${f2(x * 100, d)}%`;

// CSV-like text with a header row. Columns whose non-missing cells are all numbers are numeric.
export function parseSurvey(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return { cols: [], rows: [], types: {} };
  const head = splitLine(lines[0]).map((h, j) => h || `col${j + 1}`);
  const rows = lines.slice(1).map((l) => { const c = splitLine(l); return Object.fromEntries(head.map((h, j) => [h, (c[j] ?? '').trim()])); });
  const types = Object.fromEntries(head.map((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => !MISSING.has(v.toLowerCase()));
    return [h, vals.length && vals.every((v) => Number.isFinite(Number(v))) ? 'num' : 'cat'];
  }));
  return { cols: head, rows, types };
}
// "variable: level=share, level=share" per line; shares may be percents, proportions or counts (normalised).
export function parseTargets(text) {
  const out = []; const bad = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([^:]+):\s*(.+)$/); if (!m) { bad.push(t); continue; }
    const levels = [];
    for (const part of m[2].split(/[,;]/)) {
      const q = part.match(/^\s*(.+?)\s*=\s*([0-9.]+)\s*%?\s*$/);
      if (q && Number(q[2]) >= 0) levels.push([q[1], Number(q[2])]); else if (part.trim()) bad.push(part.trim());
    }
    const tot = levels.reduce((a, [, v]) => a + v, 0);
    if (levels.length && tot > 0) out.push({ variable: m[1].trim(), levels: levels.map(([l, v]) => ({ level: l, share: v / tot })) });
  }
  return { targets: out, bad };
}
// Check targets against the data: every respondent's value must have a target, and every target level must have
// respondents (otherwise raking cannot reach it).
export function checkTargets(survey, targets) {
  const problems = [];
  for (const t of targets) {
    if (!survey.cols.includes(t.variable)) { problems.push(`No column called "${t.variable}".`); continue; }
    const seen = new Set(survey.rows.map((r) => r[t.variable]));
    const levels = new Set(t.levels.map((l) => l.level));
    for (const l of t.levels) if (!seen.has(l.level) && l.share > 0) problems.push(`No respondents have ${t.variable} = ${l.level}, so its target cannot be met.`);
    const extra = [...seen].filter((v) => !levels.has(v));
    if (extra.length) problems.push(`${t.variable} has values with no target: ${extra.slice(0, 5).map((v) => v || '(blank)').join(', ')}.`);
  }
  return problems;
}

// Raking. Weights are scaled to sum to n. Each pass multiplies the weights in every level of every margin by
// target share / current weighted share, until the largest gap between a weighted share and its target is below
// tol. With trimming, weights are capped at [lo, hi] × the mean weight after raking and the data are raked again,
// repeating until the caps hold and the margins match, or until maxOuter rounds (then the margins may miss a little).
export function rake(rows, targets, { base = null, tol = 1e-10, maxIter = 2000, trim = null, maxOuter = 200 } = {}) {
  const n = rows.length;
  const b0 = rows.map((r, i) => (base ? base[i] : 1));
  const sb = b0.reduce((a, x) => a + x, 0);
  let w = b0.map((x) => (x * n) / sb);
  const idx = targets.map((t) => t.levels.map((l) => ({ ...l, members: rows.map((r, i) => (r[t.variable] === l.level ? i : -1)).filter((i) => i >= 0) })));
  const gap = () => { const tot = w.reduce((a, x) => a + x, 0); let g = 0; for (const m of idx) for (const l of m) { const s = l.members.reduce((a, i) => a + w[i], 0) / tot; g = Math.max(g, Math.abs(s - l.share)); } return g; };
  let iters = 0, outer = 0, converged = false;
  const rakeOnce = () => {
    for (let it = 0; it < maxIter; it++) {
      iters++;
      for (const m of idx) {
        const tot = w.reduce((a, x) => a + x, 0);
        for (const l of m) {
          const s = l.members.reduce((a, i) => a + w[i], 0);
          if (s > 0) { const f = (l.share * tot) / s; for (const i of l.members) w[i] *= f; }
        }
      }
      if (gap() < tol) return true;
    }
    return false;
  };
  converged = rakeOnce();
  let trimmed = 0;
  if (trim && (Number.isFinite(trim.lo) || Number.isFinite(trim.hi))) {
    for (outer = 0; outer < maxOuter; outer++) {
      const m = w.reduce((a, x) => a + x, 0) / n;
      const lo = Number.isFinite(trim.lo) ? trim.lo * m : -Infinity, hi = Number.isFinite(trim.hi) ? trim.hi * m : Infinity;
      let changed = 0;
      w = w.map((x) => { if (x > hi * (1 + 1e-9)) { changed++; return hi; } if (x < lo * (1 - 1e-9)) { changed++; return lo; } return x; });
      if (!changed) break;
      trimmed = Math.max(trimmed, changed);
      converged = rakeOnce();
    }
  }
  const tot = w.reduce((a, x) => a + x, 0);
  w = w.map((x) => (x * n) / tot);
  const margins = targets.map((t, k) => ({
    variable: t.variable,
    levels: idx[k].map((l) => ({ level: l.level, target: l.share, sample: l.members.length / n, weighted: l.members.reduce((a, i) => a + w[i], 0) / n, n: l.members.length })),
  }));
  return { w, iterations: iters, outer, converged, maxGap: gap(), margins, trimmedLast: trimmed, ...weightStats(w) };
}
// Kish (1965): deff = n Σw² / (Σw)² = 1 + CV² (CV with the n denominator); effective n = (Σw)² / Σw².
export function weightStats(w) {
  const n = w.length, s = w.reduce((a, x) => a + x, 0), s2 = w.reduce((a, x) => a + x * x, 0);
  const m = s / n, cv = Math.sqrt(s2 / n - m * m) / m;
  const min = Math.min(...w), max = Math.max(...w);
  return { n, sum: s, deff: (n * s2) / (s * s), nEff: (s * s) / s2, cv, min, max, ratio: max / min, meanW: m };
}

// Weighted mean with the linearisation variance for a ratio estimator, treating each respondent as its own primary
// sampling unit, with replacement: v = n/(n − 1) Σ wᵢ²(yᵢ − ȳ_w)² / (Σw)². CI with t on n − 1 df.
export function weightedMean(y, w, conf = 0.95) {
  const pairs = y.map((v, i) => [v, w[i]]).filter(([v, ww]) => Number.isFinite(v) && Number.isFinite(ww));
  const n = pairs.length; if (n < 2) return null;
  const sw = pairs.reduce((a, [, ww]) => a + ww, 0);
  const m = pairs.reduce((a, [v, ww]) => a + v * ww, 0) / sw;
  const v = (n / (n - 1)) * pairs.reduce((a, [x, ww]) => a + ww * ww * (x - m) ** 2, 0) / (sw * sw);
  const se = Math.sqrt(v), t = tInv(1 - (1 - conf) / 2, n - 1);
  return { n, mean: m, se, lo: m - t * se, hi: m + t * se };
}
// Estimates for every outcome column: numeric → mean; categorical → share of each level. Unweighted figures use the
// same formula with equal weights (the usual SE s/√n for a mean, √(p(1 − p)/(n − 1)) for a share).
export function estimates(survey, w, outcomes, conf = 0.95) {
  const ones = w.map(() => 1);
  return outcomes.map((col) => {
    if (survey.types[col] === 'num') {
      const y = survey.rows.map((r) => (MISSING.has(r[col].toLowerCase()) ? NaN : Number(r[col])));
      return { col, kind: 'mean', rows: [{ label: 'Mean', un: weightedMean(y, ones, conf), wt: weightedMean(y, w, conf) }] };
    }
    const vals = survey.rows.map((r) => r[col]);
    const levels = [...new Set(vals.filter((v) => !MISSING.has(v.toLowerCase())))].sort();
    return {
      col, kind: 'share',
      rows: levels.map((lv) => {
        const y = vals.map((v) => (MISSING.has(v.toLowerCase()) ? NaN : v === lv ? 1 : 0));
        return { label: lv, un: weightedMean(y, ones, conf), wt: weightedMean(y, w, conf) };
      }),
    };
  });
}

// ── Summary ──
// Confidence rule: high when the effective sample size is at least 400, the largest weight is at most 5 × the mean
// and raking converged; medium when the effective n is at least 100 and raking converged; low otherwise.
export function weightingSummary(r, est, conf = 0.95) {
  const pc = Math.round(conf * 100);
  let c = r.nEff >= 400 && r.max / r.meanW <= 5 && r.converged ? 'high' : r.nEff >= 100 && r.converged ? 'medium' : 'low';
  const shifts = est.flatMap((e) => e.rows.filter((x) => x.un && x.wt).map((x) => ({ col: e.col, kind: e.kind, label: x.label, un: x.un.mean, wt: x.wt.mean, d: x.wt.mean - x.un.mean, se: x.wt.se })));
  const big = [...shifts].sort((a, b) => Math.abs(b.d / (b.se || 1)) - Math.abs(a.d / (a.se || 1)))[0];
  const show = (s, v) => (s.kind === 'mean' ? f2(v) : pct(v));
  const worst = r.margins.flatMap((m) => m.levels.map((l) => ({ ...l, variable: m.variable }))).sort((a, b) => Math.abs(b.target - b.sample) - Math.abs(a.target - a.sample))[0];
  const meaning = [
    `The sample was furthest off on ${worst.variable} = ${worst.level}: ${pct(worst.sample)} of respondents against a target of ${pct(worst.target)}.`,
    `Weights run from ${f2(r.min)} to ${f2(r.max)} (ratio ${f2(r.ratio, 1)}). Kish's design effect is ${f2(r.deff)}, so the ${r.n} respondents carry the precision of about ${Math.round(r.nEff)} unweighted ones (efficiency ${pct(r.nEff / r.n, 0)}).`,
  ];
  if (big) meaning.push(`Biggest change: ${big.col}${big.kind === 'share' ? ` = ${big.label}` : ''} moves from ${show(big, big.un)} unweighted to ${show(big, big.wt)} weighted.`);
  if (r.deff > 2) meaning.push('A design effect above 2 means weighting is doing heavy lifting: estimates lean on a few respondents. Consider trimming or fewer targets.');
  if (!r.converged) meaning.push(`Raking did not fully meet the targets (largest gap ${pct(r.maxGap, 2)}), usually because trimming caps conflict with them.`);
  return {
    headline: big ? `Weighting moves ${big.col}${big.kind === 'share' ? ` = ${big.label}` : ''} from ${show(big, big.un)} to ${show(big, big.wt)}, at a design effect of ${f2(r.deff)} (effective n ${Math.round(r.nEff)} of ${r.n}).` : `Raked weights give a design effect of ${f2(r.deff)} (effective n ${Math.round(r.nEff)} of ${r.n}).`,
    meaning,
    confidence: c,
    confidenceNote: `Rule: high with an effective n of 400 or more, no weight above 5 × the mean and converged raking; medium with an effective n of 100 or more and converged raking; low otherwise. Here: effective n ${Math.round(r.nEff)}, largest weight ${f2(r.max / r.meanW, 1)} × mean${r.converged ? '' : ', not converged'}.`,
    caveats: [
      'Weighting only corrects for the variables you rake on. If people who answer differ from those who do not in ways those variables miss, the bias remains.',
      `The ${pc}% CIs treat respondents as independent draws and ignore the gain from raking, so they are slightly conservative; they are ranges of plausible values, not ${pc}% probabilities.`,
    ],
    next: [
      'Report unweighted and weighted results side by side, with the targets and their source.',
      'Check who did not respond with a [non-response bias assessment](/methods/non-response-bias-assessment).',
    ],
    report: `Responses (n = ${r.n}) were raked to ${r.margins.map((m) => m.variable).join(', ')} targets${r.trimmedLast ? ' with weight trimming' : ''}; Kish design effect ${f2(r.deff)}, effective n = ${Math.round(r.nEff)}.${big ? ` Weighted ${big.col}${big.kind === 'share' ? ` (${big.label})` : ''}: ${show(big, big.wt)} (unweighted ${show(big, big.un)}).` : ''}`,
  };
}
