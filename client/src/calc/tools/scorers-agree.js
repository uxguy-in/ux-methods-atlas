// Agreement indices: intraclass correlations (Shrout and Fleiss 1979; McGraw and Wong 1996), Kendall's W with its
// chi-square and F tests, rwg and rwg(j) (James, Demaree and Wolf 1984) with the average deviation index, and
// Bland-Altman limits of agreement (Bland and Altman 1986, 1999). Pure functions; the summaries are unit-tested in
// server/scripts/check-scorers.js and every statistic is checked there against pingouin, scipy and numpy.
import { mean, variance, sd, ranks, fInv, fSf, chi2Sf, tInv, tCdf, normInv, linreg, splitLine, toNum, isNumCell } from './scorers-math.js';

const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

// Targets (rows) × raters (columns); rows with any missing rating are dropped (listwise), as pingouin does.
export function completeRows(rows) {
  const k = Math.max(0, ...rows.map((r) => r.length));
  const keep = rows.filter((r) => r.length === k && r.every(Number.isFinite));
  return { rows: keep, dropped: rows.length - keep.length, k };
}

// ── Intraclass correlation ──
// Two-way ANOVA mean squares: MSR (targets), MSC (raters), MSE (residual) and the one-way within-target MSW.
// Six forms, named as Shrout and Fleiss (1979) and McGraw and Wong (1996). Confidence intervals follow McGraw and
// Wong (1996) Table 7, as implemented in pingouin.intraclass_corr and R psych::ICC.
export function icc(rows, conf = 0.95) {
  const n = rows.length, k = rows[0]?.length || 0;
  if (n < 2 || k < 2) return null;
  const all = rows.flat(), gm = mean(all);
  const rm = rows.map(mean), cm = rows[0].map((_, j) => mean(rows.map((r) => r[j])));
  const SST = all.reduce((a, x) => a + (x - gm) ** 2, 0);
  const SSR = k * rm.reduce((a, x) => a + (x - gm) ** 2, 0), SSC = n * cm.reduce((a, x) => a + (x - gm) ** 2, 0);
  const SSE = SST - SSR - SSC;
  const msb = SSR / (n - 1), msj = SSC / (k - 1), mse = SSE / ((n - 1) * (k - 1)), msw = (SSC + SSE) / (n * (k - 1));
  const a = 1 - conf;
  const icc1 = (msb - msw) / (msb + (k - 1) * msw), icc2 = (msb - mse) / (msb + (k - 1) * mse + k * (msj - mse) / n);
  const icc3 = (msb - mse) / (msb + (k - 1) * mse);
  const icc1k = (msb - msw) / msb, icc2k = (msb - mse) / (msb + (msj - mse) / n), icc3k = (msb - mse) / msb;
  const df1 = n - 1, df1kd = n * (k - 1), df2kd = (n - 1) * (k - 1);
  const f1 = msb / msw, f3 = msb / mse;
  const f1l = f1 / fInv(1 - a / 2, df1, df1kd), f1u = f1 * fInv(1 - a / 2, df1kd, df1);
  const f3l = f3 / fInv(1 - a / 2, df1, df2kd), f3u = f3 * fInv(1 - a / 2, df2kd, df1);
  const fj = msj / mse;
  const vn = df2kd * (k * icc2 * fj + n * (1 + (k - 1) * icc2) - k * icc2) ** 2;
  const vd = df1 * k * k * icc2 * icc2 * fj * fj + (n * (1 + (k - 1) * icc2) - k * icc2) ** 2;
  const v = vn / vd;
  const f2u = fInv(1 - a / 2, n - 1, v), f2l = fInv(1 - a / 2, v, n - 1);
  const l2 = n * (msb - f2u * mse) / (f2u * (k * msj + (k * n - k - n) * mse) + n * msb);
  const u2 = n * (f2l * msb - mse) / (k * msj + (k * n - k - n) * mse + n * f2l * msb);
  const p1 = fSf(f1, df1, df1kd), p3 = fSf(f3, df1, df2kd);
  const forms = [
    { id: 'ICC1', sf: 'ICC(1,1)', mw: 'ICC(1): one-way random, single rater', model: 'one-way', unit: 'single', type: 'absolute', icc: icc1, lo: (f1l - 1) / (f1l + k - 1), hi: (f1u - 1) / (f1u + k - 1), F: f1, df2: df1kd, p: p1 },
    { id: 'ICC2', sf: 'ICC(2,1)', mw: 'ICC(A,1): two-way, absolute agreement, single rater', model: 'two-way random', unit: 'single', type: 'absolute', icc: icc2, lo: l2, hi: u2, F: f3, df2: df2kd, p: p3 },
    { id: 'ICC3', sf: 'ICC(3,1)', mw: 'ICC(C,1): two-way, consistency, single rater', model: 'two-way mixed', unit: 'single', type: 'consistency', icc: icc3, lo: (f3l - 1) / (f3l + k - 1), hi: (f3u - 1) / (f3u + k - 1), F: f3, df2: df2kd, p: p3 },
    { id: 'ICC1k', sf: 'ICC(1,k)', mw: 'ICC(k): one-way random, mean of k raters', model: 'one-way', unit: 'average', type: 'absolute', icc: icc1k, lo: 1 - 1 / f1l, hi: 1 - 1 / f1u, F: f1, df2: df1kd, p: p1 },
    { id: 'ICC2k', sf: 'ICC(2,k)', mw: 'ICC(A,k): two-way, absolute agreement, mean of k raters', model: 'two-way random', unit: 'average', type: 'absolute', icc: icc2k, lo: l2 * k / (1 + l2 * (k - 1)), hi: u2 * k / (1 + u2 * (k - 1)), F: f3, df2: df2kd, p: p3 },
    { id: 'ICC3k', sf: 'ICC(3,k)', mw: 'ICC(C,k): two-way, consistency, mean of k raters', model: 'two-way mixed', unit: 'average', type: 'consistency', icc: icc3k, lo: 1 - 1 / f3l, hi: 1 - 1 / f3u, F: f3, df2: df2kd, p: p3 },
  ].map((f) => ({ ...f, df1 }));
  return { n, k, msb, msj, mse, msw, forms, raterMeans: cm, targetMeans: rm, conf };
}
// Which form answers the user's three questions (Koo and Li 2016 flowchart; McGraw and Wong 1996).
export function pickForm({ sameRaters, raterGeneral, agreement, average }) {
  if (!sameRaters) return average ? 'ICC1k' : 'ICC1';
  if (agreement) return average ? 'ICC2k' : 'ICC2';
  return raterGeneral ? (average ? 'ICC3k' : 'ICC3') : (average ? 'ICC3k' : 'ICC3');
}
// Koo and Li (2016): below 0.5 poor, 0.5–0.75 moderate, 0.75–0.9 good, above 0.9 excellent.
export const kooLi = (v) => (v < 0.5 ? 'poor' : v < 0.75 ? 'moderate' : v < 0.9 ? 'good' : 'excellent');

// ── Kendall's W ──
// rows: objects (rows) × judges (columns). Each judge's column is ranked (average ranks for ties).
// W = 12S / (m²(n³ − n) − mΣT), T = Σ(t³ − t) over tie groups (Kendall and Babington Smith 1939; Siegel and Castellan 1988).
export function kendallW(rows) {
  const n = rows.length, m = rows[0]?.length || 0;
  if (n < 2 || m < 2) return null;
  const cols = rows[0].map((_, j) => ranks(rows.map((r) => r[j])));
  let T = 0;
  for (let j = 0; j < m; j++) {
    const counts = new Map(); for (const v of rows.map((r) => r[j])) counts.set(v, (counts.get(v) || 0) + 1);
    for (const t of counts.values()) T += t ** 3 - t;
  }
  const R = rows.map((_, i) => cols.reduce((a, c) => a + c[i], 0));
  const Rbar = m * (n + 1) / 2;
  const S = R.reduce((a, r) => a + (r - Rbar) ** 2, 0);
  const W = 12 * S / (m * m * (n ** 3 - n) - m * T);
  const Wraw = 12 * S / (m * m * (n ** 3 - n));
  const chi2 = m * (n - 1) * W, df = n - 1, p = chi2Sf(chi2, df);
  const fdf1 = n - 1 - 2 / m, fdf2 = (m - 1) * fdf1, F = W * (m - 1) / (1 - W), pF = W < 1 ? fSf(F, fdf1, fdf2) : 0;
  const rBar = (m * W - 1) / (m - 1);
  const meanRanks = R.map((r) => r / m);
  return { n, m, W, Wraw, S, T, chi2, df, p, F, fdf1, fdf2, pF, rBar, R, meanRanks };
}
// Schmidt (1997, Decision Sciences 28(3)): W ≈ 0.1 very weak, 0.3 weak, 0.5 moderate, 0.7 strong, 0.9 unusually strong.
export const schmidt = (w) => (w < 0.2 ? 'very weak' : w < 0.4 ? 'weak' : w < 0.6 ? 'moderate' : w < 0.8 ? 'strong' : 'unusually strong');

// ── rwg and rwg(j) ──
// Text: one rater per line: group label, then the rater's answers to J items.
export function parseGroups(text) {
  // Group labels are text, so only a first row whose answer cells are not numbers is a header.
  const cells = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).map(splitLine);
  if (cells.length && cells[0].slice(1).some((c) => !isNumCell(c))) cells.shift();
  const groups = new Map(); let bad = 0;
  for (const r of cells) {
    if (r.length < 2) { bad++; continue; }
    const vals = r.slice(1).map(toNum);
    if (!vals.some(Number.isFinite)) { bad++; continue; }
    if (!groups.has(r[0])) groups.set(r[0], []);
    groups.get(r[0]).push(vals);
  }
  const J = Math.max(0, ...[...groups.values()].flat().map((v) => v.length));
  return { groups: [...groups.entries()].map(([name, raters]) => ({ name, raters: raters.map((v) => Array.from({ length: J }, (_, j) => v[j] ?? NaN)) })), J, bad };
}
// σ²_EU = (A² − 1)/12 for A response options (rectangular null).
export const uniformNullVar = (A) => (A * A - 1) / 12;
export function rwg(groups, { A = 5, nullVar } = {}) {
  const s2E = Number.isFinite(nullVar) && nullVar > 0 ? nullVar : uniformNullVar(A);
  const out = groups.map((g) => {
    const J = g.raters[0]?.length || 0;
    const items = Array.from({ length: J }, (_, j) => g.raters.map((r) => r[j]).filter(Number.isFinite));
    const used = items.filter((x) => x.length >= 2);
    if (!used.length) return { name: g.name, n: g.raters.length, ok: false };
    const vars = used.map(variance), sBar = mean(vars);
    const ratio = sBar / s2E;
    const single = 1 - ratio;
    const Jn = used.length;
    const raw = Jn === 1 ? single : (Jn * (1 - ratio)) / (Jn * (1 - ratio) + ratio);
    // James, Demaree and Wolf (1984) and LeBreton and Senter (2008): when the observed variance exceeds the null
    // variance the index is out of range and is set to 0.
    const value = sBar >= s2E ? 0 : Math.min(1, Math.max(0, raw));
    const adm = mean(used.map((x) => { const m = mean(x); return mean(x.map((v) => Math.abs(v - m))); }));
    const gm = mean(used.map(mean));
    return { name: g.name, n: Math.max(...used.map((x) => x.length)), ok: true, J: Jn, sBar, raw, value, truncated: sBar >= s2E, adm, mean: gm };
  });
  const ok = out.filter((g) => g.ok);
  const vals = ok.map((g) => g.value).sort((a, b) => a - b);
  const median = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : NaN;
  return { groups: out, s2E, A, median, mean: mean(vals), share70: vals.length ? vals.filter((v) => v >= 0.7).length / vals.length : NaN, admCut: A / 6, k: ok.length };
}
// LeBreton and Senter (2008, Table 3): 0–.30 lack of agreement, .31–.50 weak, .51–.70 moderate, .71–.90 strong, .91–1 very strong.
export const leBreton = (v) => (v <= 0.3 ? 'lack of agreement' : v <= 0.5 ? 'weak agreement' : v <= 0.7 ? 'moderate agreement' : v <= 0.9 ? 'strong agreement' : 'very strong agreement');

// ── Bland-Altman ──
// d = a − b (or 100(a − b)/|mean| for percent differences). Bias CI from t; limits of agreement bias ± z·SD with the
// approximate SE √(3s²/n) (Bland and Altman 1986, 1999), t on n − 1 df, as pingouin.plot_blandaltman.
export function blandAltman(a, b, { conf = 0.95, loa = 0.95, percent = false } = {}) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = pairs.length; if (n < 3) return null;
  const m = pairs.map(([x, y]) => (x + y) / 2);
  const d = pairs.map(([x, y], i) => (percent ? ((x - y) / Math.abs(m[i])) * 100 : x - y));
  if (d.some((v) => !Number.isFinite(v))) return { error: 'Percent differences need pairs whose mean is not zero.' };
  const bias = mean(d), s = sd(d), z = normInv(1 - (1 - loa) / 2), t = tInv(1 - (1 - conf) / 2, n - 1);
  const seB = s / Math.sqrt(n), seL = Math.sqrt(3 * s * s / n);
  const upper = bias + z * s, lower = bias - z * s;
  const reg = linreg(m, d);
  const outside = d.filter((v) => v > upper || v < lower).length;
  return {
    n, bias, sd: s, z, t, seBias: seB, seLoA: seL, biasLo: bias - t * seB, biasHi: bias + t * seB,
    upper, lower, upperLo: upper - t * seL, upperHi: upper + t * seL, lowerLo: lower - t * seL, lowerHi: lower + t * seL,
    reg, outside, m, d, percent, conf, loa, tBias: bias / seB, pBias: 2 * (1 - tCdf(Math.abs(bias / seB), n - 1)),
  };
}

// ── Plain-language summaries ──
// ICC confidence rule: high when there are at least 30 targets and the CI of the chosen form is narrower than 0.2;
// medium when there are at least 15 targets or the CI is narrower than 0.4; low otherwise (Koo and Li 2016 advise
// at least 30 heterogeneous targets and 3 raters).
export function iccConfidence(n, width) {
  if (n >= 30 && width < 0.2) return 'high';
  if (n >= 15 || width < 0.4) return 'medium';
  return 'low';
}
export function iccSummary(r, formId) {
  const f = r.forms.find((x) => x.id === formId) || r.forms[1];
  const band = kooLi(f.icc), loBand = kooLi(f.lo), hiBand = kooLi(f.hi);
  const pc = Math.round(r.conf * 100);
  const conf = iccConfidence(r.n, f.hi - f.lo);
  const a = r.forms.find((x) => x.id === 'ICC2'), c = r.forms.find((x) => x.id === 'ICC3');
  const gap = c.icc - a.icc;
  const single = r.forms.find((x) => x.id === f.id.replace('k', ''));
  const meaning = [
    `${f.sf} = ${f2(f.icc)} (${pc}% CI ${f2(f.lo)} to ${f2(f.hi)}): ${band} reliability on Koo and Li's (2016) bands. Read the interval, not just the point: it spans ${loBand === hiBand ? `only the ${loBand} band` : `${loBand} to ${hiBand}`}.`,
    f.unit === 'average' ? `This is the reliability of the mean of all ${r.k} raters. A single rater on their own reaches ${single.sf} = ${f2(single.icc)}.` : `This is the reliability of one rater's score. Averaging all ${r.k} raters gives ${r.forms.find((x) => x.id === `${f.id}k`).sf} = ${f2(r.forms.find((x) => x.id === `${f.id}k`).icc)}.`,
    gap > 0.05 ? `Consistency (${f2(c.icc)}) is higher than absolute agreement (${f2(a.icc)}): raters rank targets alike but some rate systematically higher or lower (rater means ${r.raterMeans.map((v) => f2(v, 1)).join(', ')}).` : `Consistency (${f2(c.icc)}) and absolute agreement (${f2(a.icc)}) are close, so raters do not differ much in their overall level.`,
  ];
  return {
    headline: `${f.sf} = ${f2(f.icc)}, ${band} reliability (${pc}% CI ${f2(f.lo)} to ${f2(f.hi)}) across ${r.n} targets and ${r.k} raters.`,
    meaning,
    confidence: conf,
    confidenceNote: `Rule: high with 30 or more targets and a CI narrower than 0.2; medium with 15 or more targets or a CI narrower than 0.4; low otherwise. Here: ${r.n} targets, CI width ${f2(f.hi - f.lo)}.`,
    caveats: [
      `An ICC depends on how different the targets are: the same raters score lower on a set of similar targets. Report the form, the targets and the raters.`,
      `The ${pc}% interval is a range of plausible values from this sample; it is not a ${pc}% probability that the true ICC lies inside it.`,
    ],
    next: [
      band === 'poor' || band === 'moderate' ? 'Calibrate raters on a shared rubric with worked examples, then re-rate a fresh set of targets.' : 'Keep a calibration set so new raters can be checked against the panel.',
      `For categories rather than scores use [Cohen's kappa or Krippendorff's alpha](/calculators/intercoder).`,
    ],
    report: `Inter-rater reliability was ${f.sf} = ${f2(f.icc)} (${f.mw}), ${pc}% CI [${f2(f.lo)}, ${f2(f.hi)}], F(${f.df1}, ${f.df2}) = ${f2(f.F)}, ${f.p < 0.001 ? 'p < .001' : `p = ${f2(f.p, 3)}`}, ${r.n} targets rated by ${r.k} raters.`,
  };
}
// Kendall's W confidence rule: high when p < 0.01 with at least 5 judges and 5 objects; medium when p < 0.05;
// low otherwise (the chi-square approximation needs about 7 or more objects; Siegel and Castellan 1988).
export function kendallSummary(r) {
  const conf = r.p < 0.01 && r.m >= 5 && r.n >= 5 ? 'high' : r.p < 0.05 ? 'medium' : 'low';
  const band = schmidt(r.W);
  const ptxt = r.p < 0.001 ? 'p < .001' : `p = ${f2(r.p, 3)}`;
  return {
    headline: `Kendall's W = ${f2(r.W)}: ${band} agreement among ${r.m} judges ranking ${r.n} items (χ²(${r.df}) = ${f2(r.chi2)}, ${ptxt}).`,
    meaning: [
      `W runs from 0 (no shared ordering) to 1 (every judge gives the same order). ${f2(r.W)} is ${band} on Schmidt's (1997) Delphi guide (0.1 very weak, 0.3 weak, 0.5 moderate, 0.7 strong, 0.9 unusually strong).`,
      `The average Spearman correlation between two judges is ${f2(r.rBar)}.`,
      r.p < 0.05 ? 'The test rejects "judges rank at random", which is a low bar; the size of W matters more than the p-value.' : 'The test cannot rule out that the judges rank at random.',
    ],
    confidence: conf,
    confidenceNote: `Rule: high when p < 0.01 with at least 5 judges and 5 items; medium when p < 0.05; low otherwise. Here: ${r.m} judges, ${r.n} items, ${ptxt}.${r.n < 7 ? ' With fewer than 7 items the chi-square p-value is only approximate.' : ''}`,
    caveats: [
      'W only says judges agree on the order, not that the order is right or that the gaps between items are large.',
      r.T > 0 ? 'Ties were given average ranks and W is corrected for them.' : 'No ties, so no tie correction was needed.',
    ],
    next: [
      r.W < 0.5 ? 'In a Delphi study, feed back the mean ranks and run another round; stop when W levels off.' : 'Report the mean ranks with W; consider stopping a Delphi study here.',
      'If judges gave scores rather than ranks, the [intraclass correlation](/methods/intraclass-correlation-icc) uses the full information.',
    ],
    report: `Agreement among ${r.m} judges on the ranking of ${r.n} items was ${band}, Kendall's W = ${f2(r.W)}, χ²(${r.df}) = ${f2(r.chi2)}, ${ptxt}.`,
  };
}
// rwg confidence rule: high with 10 or more groups and a median group size of 5 or more raters; medium with 3 or
// more groups or a median group size of 5 or more; low otherwise (rwg is biased upward in small groups;
// LeBreton and Senter 2008).
export function rwgSummary(r) {
  const ok = r.groups.filter((g) => g.ok);
  const sizes = ok.map((g) => g.n).sort((a, b) => a - b), medN = sizes[Math.floor((sizes.length - 1) / 2)] || 0;
  const conf = ok.length >= 10 && medN >= 5 ? 'high' : ok.length >= 3 || medN >= 5 ? 'medium' : 'low';
  const J = ok[0]?.J || 1, name = J > 1 ? `rwg(j)` : 'rwg';
  const low = ok.filter((g) => g.value < 0.7).map((g) => g.name);
  const pc = Math.round(r.share70 * 100);
  return {
    headline: `Median ${name} = ${f2(r.median)} across ${ok.length} group${ok.length === 1 ? '' : 's'}: ${leBreton(r.median)}; ${pc}% of groups reach the conventional 0.70.`,
    meaning: [
      `${name} compares how much raters in a group disagree with how much they would disagree if they answered at random on a ${r.A}-point scale (random-answer variance ${f2(r.s2E)}).`,
      low.length ? `Groups below 0.70: ${low.slice(0, 6).join(', ')}${low.length > 6 ? ` and ${low.length - 6} more` : ''}. Averaging their answers may hide real differences.` : 'Every group reaches 0.70, so averaging within groups is defensible on this criterion.',
      `The average deviation index gives a second view: values under ${f2(r.admCut)} (A/6; Burke and Dunlap 2002) indicate agreement.`,
    ],
    confidence: conf,
    confidenceNote: `Rule: high with 10 or more groups and a median of 5 or more raters per group; medium with 3 or more groups or 5 or more raters; low otherwise. Here: ${ok.length} groups, median ${medN} raters.`,
    caveats: [
      'The default assumes random answers spread evenly over the scale; if people lean positive (common in UX surveys) enter a smaller, skewed random-answer variance, which lowers rwg.',
      'rwg is agreement within groups, not reliability between groups; pair it with ICC(1) and ICC(2) when you aggregate to the group level.',
    ],
    next: [
      'Report the random-answer distribution you assumed, the cut-off and the share of groups that pass.',
      'For reliability of group means, see the [ICC](/methods/intraclass-correlation-icc).',
    ],
    report: `Within-group agreement was ${leBreton(r.median)} (median ${name} = ${f2(r.median)}, ${ok.length} groups, uniform random-answer variance on a ${r.A}-point scale; ${pc}% of groups ≥ .70).`,
  };
}
// Bland-Altman confidence rule: high with 100 or more pairs (Bland 2004 suggests about 100 for limits that are
// precise to about ±0.34 SD); medium with 30 or more; low otherwise. A proportional-bias slope (p < 0.05) lowers it
// one level because a single pair of limits no longer describes the data.
export function baSummary(r, { tol, unit = '' } = {}) {
  let conf = r.n >= 100 ? 'high' : r.n >= 30 ? 'medium' : 'low';
  const prop = r.reg.p < 0.05;
  if (prop) conf = conf === 'high' ? 'medium' : 'low';
  const u = r.percent ? '%' : unit ? ` ${unit}` : '';
  const pc = Math.round(r.conf * 100), lpc = Math.round(r.loa * 100);
  const biasSig = r.biasLo > 0 || r.biasHi < 0;
  const within = Number.isFinite(tol) && tol > 0 ? (r.lowerLo >= -tol && r.upperHi <= tol ? 'yes' : r.lower >= -tol && r.upper <= tol ? 'maybe' : 'no') : null;
  return {
    headline: `The two methods differ by ${f2(r.bias)}${u} on average; the ${lpc}% limits of agreement run from ${f2(r.lower)}${u} to ${f2(r.upper)}${u}.`,
    meaning: [
      biasSig ? `The bias is systematic: its ${pc}% CI (${f2(r.biasLo)} to ${f2(r.biasHi)}) excludes zero, so the first method reads ${r.bias > 0 ? 'higher' : 'lower'} on average.` : `The ${pc}% CI for the bias (${f2(r.biasLo)} to ${f2(r.biasHi)}) includes zero, so there is no clear systematic difference.`,
      `The limits of agreement are the range for individual measurements; their own ${pc}% CIs run ${f2(r.lowerLo)} to ${f2(r.lowerHi)} (lower) and ${f2(r.upperLo)} to ${f2(r.upperHi)} (upper).`,
      within === 'yes' ? `Even the outer CI bounds lie inside your acceptable difference of ±${tol}${u}, so the methods can be used interchangeably.` : within === 'maybe' ? `The limits lie inside ±${tol}${u} but their CIs cross it; collect more pairs before swapping methods.` : within === 'no' ? `The limits go beyond your acceptable difference of ±${tol}${u}, so the methods are not interchangeable.` : 'Whether these limits are acceptable is a design judgement: set the largest difference that would not change a decision before looking.',
      prop ? `The differences change with the size of the measurement (slope ${f2(r.reg.b, 3)}, p = ${f2(r.reg.p, 3)}): proportional bias. Try percent differences or a log scale.` : `No clear proportional bias (slope ${f2(r.reg.b, 3)}, p = ${f2(r.reg.p, 3)}).`,
    ],
    confidence: conf,
    confidenceNote: `Rule: high with 100 or more pairs, medium with 30 or more, low otherwise, one level lower if the differences trend with size. Here: ${r.n} pairs${prop ? ', proportional bias present' : ''}.`,
    caveats: [
      'A high correlation between methods does not show agreement; this plot does.',
      `The CIs are ranges of plausible values from this sample, not a ${pc}% probability that the true limits lie inside them.`,
    ],
    next: [
      'Decide the acceptable difference in advance and compare it with the outer CI bounds of the limits.',
      'For agreement among several raters on scores, use the [ICC](/methods/intraclass-correlation-icc).',
    ],
    report: `Bland-Altman analysis of ${r.n} pairs: bias ${f2(r.bias)}${u} (${pc}% CI ${f2(r.biasLo)} to ${f2(r.biasHi)}), ${lpc}% limits of agreement ${f2(r.lower)}${u} to ${f2(r.upper)}${u}.`,
  };
}
