// Comparing three or more designs: one-way and Welch ANOVA, Levene and Brown-Forsythe, Tukey HSD, Games-Howell,
// Kruskal-Wallis with Dunn, repeated-measures ANOVA with Greenhouse-Geisser, Friedman with Nemenyi or Conover,
// Cochran's Q with pairwise McNemar, p-value corrections and a compact letter display. Pure functions with no React;
// checked by `npm run check:expanalytics` against scipy, statsmodels, pingouin and scikit-posthocs.
import { parseTable, isMissing } from '../cluster.js';
import { mcnemar } from '../stats.js';
import { sum, avg, variance, toNumber, fSf, chi2Sf, normSf, tSf2, tCrit, ptukeySf, qtukey, adjustP, rankAll, symEigenvalues, fmt, pText } from './expanalytics-core.js';

// ── Parsing ──
// Wide: a header row of group (or condition) names, one column per group. Long: "group, value" or, for repeated
// measures, "participant, condition, value". Returns groups for independent data or a complete matrix for repeated.
export function parseData(text, layout = 'wide', design = 'independent') {
  const t = parseTable(text), bad = [];
  if (layout === 'wide') {
    const names = t.headers;
    if (design === 'independent') {
      const groups = names.map((name) => ({ name, xs: [] }));
      t.rows.forEach((r, i) => r.forEach((v, j) => { if (isMissing(v)) return; const x = toNumber(v); if (Number.isFinite(x)) groups[j].xs.push(x); else bad.push(i + 2); }));
      return { groups: groups.filter((g) => g.xs.length), bad: [...new Set(bad)] };
    }
    const rows = [], dropped = [];
    t.rows.forEach((r, i) => { const xs = r.map(toNumber); if (xs.every(Number.isFinite)) rows.push(xs); else dropped.push(i + 2); });
    return { names, rows, subjects: rows.map((_, i) => `P${i + 1}`), dropped, bad };
  }
  if (design === 'independent') {
    const m = new Map();
    t.rows.forEach((r, i) => { const x = toNumber(r[r.length - 1]); const g = r[0]; if (!g || !Number.isFinite(x)) { bad.push(i + 2); return; } if (!m.has(g)) m.set(g, []); m.get(g).push(x); });
    return { groups: [...m.entries()].map(([name, xs]) => ({ name, xs })), bad };
  }
  const subj = new Map(), conds = [];
  t.rows.forEach((r, i) => {
    const [s, c, v] = r; const x = toNumber(v);
    if (!s || !c || !Number.isFinite(x)) { bad.push(i + 2); return; }
    if (!conds.includes(c)) conds.push(c);
    if (!subj.has(s)) subj.set(s, new Map()); subj.get(s).set(c, x);
  });
  const rows = [], subjects = [], dropped = [];
  for (const [s, m] of subj) { if (conds.every((c) => m.has(c))) { rows.push(conds.map((c) => m.get(c))); subjects.push(s); } else dropped.push(s); }
  return { names: conds, rows, subjects, dropped, bad };
}

// ── Descriptives ──
export function describe(groups, conf = 0.95) {
  return groups.map((g) => {
    const n = g.xs.length, m = avg(g.xs), v = n > 1 ? variance(g.xs) : NaN, se = Math.sqrt(v / n), t = n > 1 ? tCrit(conf, n - 1) : NaN;
    const s = [...g.xs].sort((a, b) => a - b), med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    return { name: g.name, n, mean: m, sd: Math.sqrt(v), var: v, se, lo: m - t * se, hi: m + t * se, median: med };
  });
}

// ── Independent groups ──
// One-way ANOVA. η² = SSB/SST; ω² = (SSB − (k − 1)·MSW)/(SST + MSW).
export function anova(groups) {
  const k = groups.length, all = groups.flatMap((g) => g.xs), N = all.length, G = avg(all);
  const ssb = sum(groups.map((g) => g.xs.length * (avg(g.xs) - G) ** 2));
  const ssw = sum(groups.map((g) => { const m = avg(g.xs); return sum(g.xs.map((x) => (x - m) ** 2)); }));
  const sst = ssb + ssw, dfb = k - 1, dfw = N - k, msb = ssb / dfb, msw = ssw / dfw, F = msb / msw;
  return { k, N, ssb, ssw, sst, dfb, dfw, msb, msw, F, p: fSf(F, dfb, dfw), eta2: ssb / sst, omega2: (ssb - dfb * msw) / (sst + msw) };
}
// Welch's ANOVA (Welch 1951).
export function welchAnova(groups) {
  const k = groups.length, d = describe(groups);
  const w = d.map((g) => g.n / g.var), W = sum(w), mw = sum(d.map((g, i) => w[i] * g.mean)) / W;
  const a = sum(d.map((g, i) => w[i] * (g.mean - mw) ** 2)) / (k - 1);
  const lam = sum(d.map((g, i) => (1 - w[i] / W) ** 2 / (g.n - 1)));
  const F = a / (1 + (2 * (k - 2) * lam) / (k * k - 1)), df2 = (k * k - 1) / (3 * lam);
  return { F, df1: k - 1, df2, p: fSf(F, k - 1, df2) };
}
// Levene (center = mean) and Brown-Forsythe (center = median) tests of equal variances.
export function levene(groups, center = 'median') {
  const k = groups.length, d = describe(groups);
  const z = groups.map((g, i) => g.xs.map((x) => Math.abs(x - (center === 'mean' ? d[i].mean : d[i].median))));
  const N = sum(z.map((zz) => zz.length)), zbar = z.map(avg), Z = sum(z.flat()) / N;
  const num = sum(z.map((zz, i) => zz.length * (zbar[i] - Z) ** 2)), den = sum(z.map((zz, i) => sum(zz.map((v) => (v - zbar[i]) ** 2))));
  const W = ((N - k) / (k - 1)) * (num / den);
  return { W, df1: k - 1, df2: N - k, p: fSf(W, k - 1, N - k) };
}
const pairsOf = (k) => { const out = []; for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) out.push([i, j]); return out; };
// Tukey HSD (Tukey-Kramer for unequal n), as statsmodels pairwise_tukeyhsd: diff = mean_j − mean_i.
export function tukey(groups, conf = 0.95) {
  const d = describe(groups), a = anova(groups), k = groups.length, qc = qtukey(conf, k, a.dfw);
  return pairsOf(k).map(([i, j]) => {
    const diff = d[j].mean - d[i].mean, se = Math.sqrt((a.msw / 2) * (1 / d[i].n + 1 / d[j].n)), q = Math.abs(diff) / se;
    return { i, j, a: d[i].name, b: d[j].name, diff, se, q, p: ptukeySf(q, k, a.dfw), lo: diff - qc * se, hi: diff + qc * se };
  });
}
// Games-Howell, as pingouin pairwise_gameshowell: diff = mean_i − mean_j, Welch df, p from the studentized range.
export function gamesHowell(groups, conf = 0.95) {
  const d = describe(groups), k = groups.length;
  return pairsOf(k).map(([i, j]) => {
    const vi = d[i].var / d[i].n, vj = d[j].var / d[j].n, se = Math.sqrt(vi + vj);
    const df = (vi + vj) ** 2 / (vi ** 2 / (d[i].n - 1) + vj ** 2 / (d[j].n - 1));
    const diff = d[i].mean - d[j].mean, t = diff / se, qc = qtukey(conf, k, df) / Math.SQRT2;
    return { i, j, a: d[i].name, b: d[j].name, diff, se, t, df, p: ptukeySf(Math.abs(t) * Math.SQRT2, k, df), lo: diff - qc * se, hi: diff + qc * se };
  });
}
// Kruskal-Wallis H with the tie correction (scipy.stats.kruskal). ε² = H/(N − 1) (Tomczak and Tomczak 2014).
export function kruskal(groups) {
  const all = groups.flatMap((g) => g.xs), N = all.length, { r, ties } = rankAll(all);
  let off = 0; const R = groups.map((g) => { const s = sum(r.slice(off, off + g.xs.length)); off += g.xs.length; return s; });
  const Hraw = (12 / (N * (N + 1))) * sum(R.map((s, i) => (s * s) / groups[i].xs.length)) - 3 * (N + 1);
  const C = 1 - sum(ties.map((t) => t ** 3 - t)) / (N ** 3 - N), H = Hraw / C, df = groups.length - 1;
  return { H, df, p: chi2Sf(H, df), eps2: H / (N - 1), meanRanks: R.map((s, i) => s / groups[i].xs.length), N, tieSum: sum(ties.map((t) => t ** 3 - t)) };
}
// Dunn's test (1964) with the tie-corrected variance, two-sided, then adjusted (Holm by default).
export function dunn(groups, method = 'holm') {
  const kw = kruskal(groups), N = kw.N;
  const base = (N * (N + 1)) / 12 - kw.tieSum / (12 * (N - 1));
  const pairs = pairsOf(groups.length).map(([i, j]) => {
    const z = (kw.meanRanks[i] - kw.meanRanks[j]) / Math.sqrt(base * (1 / groups[i].xs.length + 1 / groups[j].xs.length));
    return { i, j, a: groups[i].name, b: groups[j].name, diff: kw.meanRanks[i] - kw.meanRanks[j], z, pRaw: 2 * normSf(Math.abs(z)) };
  });
  const adj = adjustP(pairs.map((p) => p.pRaw), method);
  pairs.forEach((p, i) => { p.p = adj[i]; });
  return pairs;
}

// ── Repeated measures ──
// rows: n participants × k conditions, complete. Greenhouse-Geisser ε from the double-centred covariance matrix:
// ε = (Σλ)² / ((k − 1) Σλ²) over the eigenvalues of the covariance of orthonormal contrasts. Mauchly's W from the same
// eigenvalues. Partial η² = SSc/(SSc + SSe); generalised η² = SSc/(SSc + SSs + SSe) (Olejnik and Algina 2003).
export function rmAnova(rows) {
  const n = rows.length, k = rows[0].length, G = avg(rows.flat());
  const cm = Array.from({ length: k }, (_, j) => avg(rows.map((r) => r[j]))), sm = rows.map(avg);
  const ssc = n * sum(cm.map((m) => (m - G) ** 2)), sss = k * sum(sm.map((m) => (m - G) ** 2));
  const sst = sum(rows.flat().map((x) => (x - G) ** 2)), sse = sst - ssc - sss;
  const dfc = k - 1, dfe = (k - 1) * (n - 1), F = (ssc / dfc) / (sse / dfe);
  // Covariance matrix of the conditions, double-centred.
  const S = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => sum(rows.map((r) => (r[a] - cm[a]) * (r[b] - cm[b]))) / (n - 1)));
  const rmean = S.map(avg), gmean = avg(rmean);
  const D = S.map((row, a) => row.map((v, b) => v - rmean[a] - rmean[b] + gmean));
  const lam = symEigenvalues(D).slice(0, k - 1).map((v) => Math.max(v, 0));
  const eps = Math.min(1, sum(lam) ** 2 / ((k - 1) * sum(lam.map((l) => l * l))));
  const p = k - 1, W = lam.reduce((a, l) => a * l, 1) / (sum(lam) / p) ** p;
  const f = 1 - (2 * p * p + p + 2) / (6 * p * (n - 1));
  const chi = -(n - 1) * f * Math.log(W), dfM = (p * (p + 1)) / 2 - 1;
  // Second-order correction to the χ² approximation, as R mauchly.test and pingouin (R uses k, not p, in the 3k term).
  const w2 = ((p + 2) * (p - 1) * (p - 2) * (2 * p ** 3 + 6 * p * p + 3 * k + 2)) / (288 * ((n - 1) * p * f) ** 2);
  const sfM = chi2Sf(chi, dfM), mauchlyP = Math.min(1, Math.max(0, sfM - w2 * (sfM - chi2Sf(chi, dfM + 4))));
  return {
    n, k, ssc, sss, sse, sst, dfc, dfe, F, p: fSf(F, dfc, dfe), eps, pGG: fSf(F, dfc * eps, dfe * eps),
    np2: ssc / (ssc + sse), ng2: ssc / (ssc + sss + sse), mauchlyW: W, mauchlyChi2: chi, mauchlyDf: dfM, mauchlyP: k > 2 ? mauchlyP : 1, means: cm,
  };
}
// Paired t-tests between conditions (Holm-adjusted), the usual follow-up to a repeated-measures ANOVA.
export function pairedPosthoc(rows, names, method = 'holm') {
  const k = rows[0].length, n = rows.length;
  const pairs = pairsOf(k).map(([i, j]) => {
    const d = rows.map((r) => r[i] - r[j]), m = avg(d), se = Math.sqrt(variance(d) / n), t = m / se;
    const tc = tCrit(0.95, n - 1);
    return { i, j, a: names[i], b: names[j], diff: m, t, df: n - 1, pRaw: tSf2(t, n - 1), lo: m - tc * se, hi: m + tc * se };
  });
  const adj = adjustP(pairs.map((p) => p.pRaw), method); pairs.forEach((p, i) => { p.p = adj[i]; });
  return pairs;
}
// Friedman χ² with the tie correction (scipy.stats.friedmanchisquare). Kendall's W = χ²/(n(k − 1)).
export function friedman(rows) {
  const n = rows.length, k = rows[0].length;
  const rk = rows.map((r) => rankAll(r)), R = Array.from({ length: k }, (_, j) => sum(rk.map((x) => x.r[j])));
  const tieSum = sum(rk.flatMap((x) => x.ties.map((t) => t ** 3 - t)));
  const chi = ((12 / (n * k * (k + 1))) * sum(R.map((s) => s * s)) - 3 * n * (k + 1)) / (1 - tieSum / (n * (k ** 3 - k)));
  return { chi2: chi, df: k - 1, p: chi2Sf(chi, k - 1), W: chi / (n * (k - 1)), rankSums: R, meanRanks: R.map((s) => s / n), ranks: rk.map((x) => x.r), n, k };
}
// Nemenyi (as scikit-posthocs posthoc_nemenyi_friedman): q = |R̄i − R̄j| / √(k(k + 1)/(6n)), p from the studentized
// range with infinite df at q·√2.
export function nemenyi(rows, names) {
  const f = friedman(rows), { n, k } = f, se = Math.sqrt((k * (k + 1)) / (6 * n));
  return pairsOf(k).map(([i, j]) => { const q = Math.abs(f.meanRanks[i] - f.meanRanks[j]) / se; return { i, j, a: names[i], b: names[j], diff: f.meanRanks[i] - f.meanRanks[j], q, p: ptukeySf(q * Math.SQRT2, k, Infinity) }; });
}
// Conover (1999, p. 371) for Friedman: t = |Ri − Rj| / √(2n(A₁ − C₁)/((n − 1)(k − 1)) · (1 − T₁/(n(k − 1)))) on
// (n − 1)(k − 1) df, with rank sums R, A₁ = Σ ranks², C₁ = nk(k + 1)²/4, T₁ = (k − 1)(ΣR² − nC₁)/(A₁ − C₁). Holm-adjusted.
export function conoverFriedman(rows, names, method = 'holm') {
  const f = friedman(rows), { n, k } = f;
  const A1 = sum(f.ranks.flat().map((r) => r * r)), C1 = (n * k * (k + 1) ** 2) / 4;
  const T1 = ((k - 1) * (sum(f.rankSums.map((s) => s * s)) - n * C1)) / (A1 - C1);
  const df = (n - 1) * (k - 1), den = Math.sqrt(((2 * n * (A1 - C1)) / df) * (1 - T1 / (n * (k - 1))));
  const pairs = pairsOf(k).map(([i, j]) => { const t = Math.abs(f.rankSums[i] - f.rankSums[j]) / den; return { i, j, a: names[i], b: names[j], diff: f.meanRanks[i] - f.meanRanks[j], t, df, pRaw: tSf2(t, df) }; });
  const adj = adjustP(pairs.map((p) => p.pRaw), method); pairs.forEach((p, i) => { p.p = adj[i]; });
  return pairs;
}
// Cochran's Q for k related binary outcomes, with exact McNemar tests for each pair (Holm-adjusted).
export function cochranQ(rows, names, method = 'holm') {
  const k = rows[0].length, n = rows.length;
  const C = Array.from({ length: k }, (_, j) => sum(rows.map((r) => r[j]))), R = rows.map(sum), N = sum(C);
  const Q = ((k - 1) * (k * sum(C.map((c) => c * c)) - N * N)) / (k * N - sum(R.map((r) => r * r)));
  const pairs = pairsOf(k).map(([i, j]) => {
    let a = 0, b = 0, c = 0, d = 0;
    rows.forEach((r) => { if (r[i] && r[j]) a++; else if (r[i]) b++; else if (r[j]) c++; else d++; });
    return { i, j, a: names[i], b: names[j], onlyA: b, onlyB: c, diff: (C[i] - C[j]) / n, pRaw: mcnemar(a, b, c, d).exact };
  });
  const adj = adjustP(pairs.map((p) => p.pRaw), method); pairs.forEach((p, i) => { p.p = adj[i]; });
  return { Q, df: k - 1, p: Number.isFinite(Q) ? chi2Sf(Q, k - 1) : 1, rates: C.map((c) => c / n), n, k, pairs };
}

// ── Compact letter display (insert-absorb, Piepho 2004) ──
// Groups sharing a letter are not significantly different. order: group indices sorted best first.
export function cld(k, sigPairs, order = [...Array(k).keys()]) {
  let cols = [new Set(order)];
  for (const [i, j] of sigPairs) {
    const next = [];
    for (const c of cols) {
      if (c.has(i) && c.has(j)) { const a = new Set(c); a.delete(i); const b = new Set(c); b.delete(j); next.push(a, b); } else next.push(c);
    }
    // Absorb: drop columns that are subsets of another column.
    cols = next.filter((c, x) => c.size && !next.some((d, y) => y !== x && [...c].every((v) => d.has(v)) && (d.size > c.size || y < x)));
  }
  // Letters in order of each column's best-ranked member.
  cols.sort((a, b) => Math.min(...[...a].map((v) => order.indexOf(v))) - Math.min(...[...b].map((v) => order.indexOf(v))));
  const letters = Array.from({ length: k }, () => '');
  cols.forEach((c, x) => { for (const v of c) letters[v] += String.fromCharCode(97 + (x % 26)); });
  return letters;
}

// ── Reading your results ──
// Confidence rule (independent groups): "high" when the omnibus test is significant at p < 0.01, every group has
// n ≥ 10, and the parametric and rank-based tests agree; "medium" when p < 0.05 or the tests disagree; "low" when
// neither test reaches p < 0.05 or any group has fewer than 5 values.
export function independentSummary({ d, a, w, lev, kw, post, postName, letters, unequal, alpha = 0.05 }) {
  const main = unequal ? { F: w.F, p: w.p, txt: `Welch's F(${fmt(w.df1, 0)}, ${fmt(w.df2, 1)}) = ${fmt(w.F)}` } : { F: a.F, p: a.p, txt: `F(${a.dfb}, ${a.dfw}) = ${fmt(a.F)}` };
  const sigPairs = post.filter((p) => p.p < alpha);
  const agree = (main.p < alpha) === (kw.p < alpha);
  const minN = Math.min(...d.map((g) => g.n));
  const confidence = main.p >= alpha && kw.p >= alpha || minN < 5 ? 'low' : main.p < 0.01 && minN >= 10 && agree ? 'high' : 'medium';
  const best = [...d].sort((x, y) => y.mean - x.mean)[0], worst = [...d].sort((x, y) => x.mean - y.mean)[0];
  const sigTxt = sigPairs.length ? sigPairs.map((p) => `${p.a} vs ${p.b}`).join('; ') : 'none';
  return {
    headline: main.p < alpha
      ? `The ${d.length} designs differ on average (${main.txt}, ${pText(main.p)}): means run from ${fmt(worst.mean)} (${worst.name}) to ${fmt(best.mean)} (${best.name}).`
      : `No reliable difference between the ${d.length} designs (${main.txt}, ${pText(main.p)}); means run from ${fmt(worst.mean)} to ${fmt(best.mean)}.`,
    meaning: [
      'The ANOVA only says whether some difference exists among the groups. It does not say which designs differ; the post hoc comparisons do that.',
      `${postName} found ${sigPairs.length} of ${post.length} pairs different at ${alpha}: ${sigTxt}. Groups sharing a letter (${d.map((g, i) => `${g.name} ${letters[i]}`).join(', ')}) are not significantly different.`,
      `Effect size: η² = ${fmt(a.eta2, 3)}, ω² = ${fmt(a.omega2, 3)} (ω² is less biased in small samples). About ${Math.round(Math.max(0, a.omega2) * 100)}% of the variation in scores is explained by which design people used.`,
      `Variances ${unequal ? 'look unequal' : 'look similar'} (Brown-Forsythe ${pText(lev.p)}), so ${unequal ? "Welch's ANOVA and Games-Howell" : 'the classic ANOVA and Tukey HSD'} are the main results. The rank-based Kruskal-Wallis test ${kw.p < alpha ? 'also finds a difference' : 'does not find a difference'} (H = ${fmt(kw.H)}, ${pText(kw.p)}).`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when the main test gives p < 0.01, every group has at least 10 values and the rank-based test agrees; some when p < 0.05 or the two tests disagree; weak when neither test reaches 0.05 or a group has fewer than 5 values.',
    caveats: [
      'Running separate t-tests for every pair instead of a post hoc test inflates false positives: with 4 designs there are 6 pairs, so about a 26% chance of at least one false "win" at 0.05.',
      'A non-significant pair is not proof that two designs are equal; check the interval width.',
      'Rating scales are ordinal and often skewed; if the two families of tests disagree, trust the rank-based one and report medians.',
    ],
    next: [
      'Report the means with 95% intervals and the letters, not just the F test.',
      'If the comparison of interest was planned in advance (new design vs current), a single planned contrast has more power than all pairs.',
      'Use [Compare two means](/calculators/compare-means) for a follow-up study on the top two designs.',
    ],
    report: `${unequal ? "Welch's ANOVA" : 'A one-way ANOVA'} found ${main.p < alpha ? 'a difference' : 'no reliable difference'} between the ${d.length} designs (${main.txt}, ${pText(main.p)}, ω² = ${fmt(a.omega2, 3)}). ${postName}: ${sigTxt === 'none' ? 'no pair differed' : `${sigTxt} differed`} at ${alpha}.`,
  };
}

// Confidence rule (repeated measures): "high" when the Greenhouse-Geisser-corrected p < 0.01 with n ≥ 10 and the
// Friedman test agrees; "medium" when p < 0.05 or they disagree; "low" when neither is significant or n < 6.
export function repeatedSummary({ rm, fr, names, post, postName, letters, alpha = 0.05 }) {
  const sigPairs = post.filter((p) => p.p < alpha);
  const agree = (rm.pGG < alpha) === (fr.p < alpha);
  const confidence = (rm.pGG >= alpha && fr.p >= alpha) || rm.n < 6 ? 'low' : rm.pGG < 0.01 && rm.n >= 10 && agree ? 'high' : 'medium';
  const order = rm.means.map((m, i) => [m, i]).sort((a, b) => b[0] - a[0]);
  const ftxt = `F(${fmt(rm.dfc * rm.eps, 2)}, ${fmt(rm.dfe * rm.eps, 1)}) = ${fmt(rm.F)}`;
  const sigTxt = sigPairs.length ? sigPairs.map((p) => `${p.a} vs ${p.b}`).join('; ') : 'none';
  return {
    headline: rm.pGG < alpha
      ? `The same ${rm.n} people scored the ${rm.k} designs differently (Greenhouse-Geisser ${ftxt}, ${pText(rm.pGG)}); highest ${names[order[0][1]]} (${fmt(order[0][0])}), lowest ${names[order[order.length - 1][1]]} (${fmt(order[order.length - 1][0])}).`
      : `No reliable difference between the ${rm.k} designs for these ${rm.n} people (Greenhouse-Geisser ${ftxt}, ${pText(rm.pGG)}).`,
    meaning: [
      'Because each person used every design, differences between people are removed from the error, which makes the test more sensitive than comparing separate groups.',
      `The ANOVA only says that some difference exists. ${postName} found ${sigPairs.length} of ${post.length} pairs different: ${sigTxt}. Shared letters (${names.map((n, i) => `${n} ${letters[i]}`).join(', ')}) mean no significant difference.`,
      `Sphericity ε = ${fmt(rm.eps, 3)} (1 means the assumption holds; the degrees of freedom are multiplied by ε). Mauchly's test ${pText(rm.mauchlyP)}. Partial η² = ${fmt(rm.np2, 3)}; generalised η² = ${fmt(rm.ng2, 3)}.`,
      `The rank-based Friedman test ${fr.p < alpha ? 'agrees' : 'does not find a difference'} (χ²(${fr.df}) = ${fmt(fr.chi2)}, ${pText(fr.p)}, Kendall's W = ${fmt(fr.W, 3)}).`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when the Greenhouse-Geisser p < 0.01 with 10 or more participants and Friedman agrees; some when p < 0.05 or the two disagree; weak when neither is significant or there are fewer than 6 participants.',
    caveats: [
      'Order effects can masquerade as design effects: counterbalance the order in which people see the designs.',
      'Participants with any missing condition were left out; if many were, the remaining sample may be unrepresentative.',
    ],
    next: ['Report means with intervals per design, the corrected F test and the pairwise results.', 'If the omnibus test is not significant, do not hunt through pairs for a "winner".'],
    report: `A repeated-measures ANOVA with the Greenhouse-Geisser correction (ε = ${fmt(rm.eps, 3)}) found ${rm.pGG < alpha ? 'a difference' : 'no reliable difference'} between the ${rm.k} designs (${ftxt}, ${pText(rm.pGG)}, generalised η² = ${fmt(rm.ng2, 3)}; n = ${rm.n}). ${postName}: ${sigTxt === 'none' ? 'no pair differed' : `${sigTxt} differed`}.`,
  };
}

// Confidence rule (Cochran's Q): "high" when p < 0.01 and n ≥ 20; "medium" when p < 0.05; "low" otherwise or when
// n < 10 (the χ² approximation needs enough people with mixed outcomes).
export function cochranSummary(r, names, alpha = 0.05) {
  const sig = r.pairs.filter((p) => p.p < alpha);
  const confidence = r.p >= alpha || r.n < 10 ? 'low' : r.p < 0.01 && r.n >= 20 ? 'high' : 'medium';
  const order = r.rates.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const sigTxt = sig.length ? sig.map((p) => `${p.a} vs ${p.b}`).join('; ') : 'none';
  return {
    headline: r.p < alpha
      ? `Success rates differ across the ${r.k} designs (Cochran's Q(${r.df}) = ${fmt(r.Q)}, ${pText(r.p)}): from ${Math.round(order[order.length - 1][0] * 100)}% (${names[order[order.length - 1][1]]}) to ${Math.round(order[0][0] * 100)}% (${names[order[0][1]]}).`
      : `No reliable difference in success rates across the ${r.k} designs (Cochran's Q(${r.df}) = ${fmt(r.Q)}, ${pText(r.p)}).`,
    meaning: [
      "Cochran's Q extends McNemar's test to three or more designs tried by the same people, using only the people whose outcome changed between designs.",
      `Like ANOVA, it only says that some difference exists. Pairwise exact McNemar tests with Holm's correction found: ${sigTxt}.`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when p < 0.01 with 20 or more participants; some when p < 0.05; weak otherwise or with fewer than 10 participants.',
    caveats: ['People who succeeded (or failed) on every design carry no information about the difference, so the effective sample can be much smaller than n.'],
    next: ['Report each design\'s success rate with an interval, for example with the [completion rate calculator](/calculators/completion-rate).'],
    report: `Cochran's Q(${r.df}) = ${fmt(r.Q)}, ${pText(r.p)}, n = ${r.n}. Pairwise McNemar tests (Holm): ${sigTxt === 'none' ? 'no pair differed' : `${sigTxt} differed`}.`,
  };
}

// Confidence rule (corrections): describes how robust the set of discoveries is. "high" when every method agrees on
// which p-values are significant; "medium" when the FDR method keeps more than the family-wise methods; "low" when
// nothing survives any correction.
export function correctionSummary(ps, adj, alpha = 0.05) {
  const count = (m) => adj[m].filter((p) => p < alpha).length, raw = ps.filter((p) => p < alpha).length;
  const c = { bonferroni: count('bonferroni'), holm: count('holm'), hochberg: count('hochberg'), bh: count('bh') };
  const confidence = c.bh === 0 ? 'low' : c.bonferroni === c.bh ? 'high' : 'medium';
  return {
    headline: `Of ${ps.length} p-values, ${raw} are below ${alpha} before correction; ${c.holm} survive Holm's correction and ${c.bh} survive the Benjamini-Hochberg false discovery rate.`,
    meaning: [
      `Bonferroni, Holm and Hochberg control the family-wise error rate: the chance of even one false positive among all ${ps.length} tests stays at ${alpha}. Holm is always at least as powerful as Bonferroni; Hochberg is slightly more powerful still but assumes the tests are independent or positively related.`,
      `Benjamini-Hochberg controls the false discovery rate instead: among the results you call significant, about ${Math.round(alpha * 100)}% or fewer are expected to be false. It keeps more discoveries (${c.bh} here vs ${c.bonferroni} with Bonferroni).`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when every correction keeps the same results; some when only the false-discovery-rate method keeps some of them; weak when nothing survives any correction.',
    caveats: ['Decide which family of tests to correct before looking: correcting only the tests that looked interesting defeats the purpose.', 'Without any correction, 1 in 20 tests of effects that do not exist comes out "significant" at 0.05.'],
    next: ['Use Holm for a small set of confirmatory comparisons, and Benjamini-Hochberg for exploratory screens (many metrics or segments).'],
    report: `${ps.length} tests: ${raw} with p < ${alpha} uncorrected, ${c.bonferroni} after Bonferroni, ${c.holm} after Holm, ${c.hochberg} after Hochberg and ${c.bh} after Benjamini-Hochberg (FDR ${alpha}).`,
  };
}
