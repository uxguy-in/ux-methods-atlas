// Crosstab explorer: r × c tables with percentages and expected counts, Pearson and likelihood-ratio χ², Fisher's
// exact test (Freeman-Halton for small 2 × c tables, Monte Carlo otherwise), adjusted residuals with Holm's
// adjustment, Cramér's V with a noncentral-χ² interval, the linear-by-linear trend test, and for a layer column the
// Cochran-Mantel-Haenszel test, Breslow-Day (with Tarone's adjustment) and a Simpson's paradox check.
// Pure functions; checked against scipy and statsmodels by server/scripts/check-surveystats.js.
import { fisherExact } from '../stats.js';
import { chi2Sf, ncx2Lambda, phiInv, normSf2, holm, lgam, rng, pearson, f2, fp, fpct, listAnd } from './surveystatsMath.js';

// Count table from label pairs; level order from `order` (e.g. an ordinal column's levels) or sorted.
export function crossTable(a, b, orderA = null, orderB = null) {
  const lv = (xs, ord) => { const s = [...new Set(xs)]; if (ord) { const known = ord.filter((x) => s.includes(x)); return [...known, ...s.filter((x) => !known.includes(x)).sort()]; } return s.sort((x, y) => x.localeCompare(y, undefined, { numeric: true })); };
  const rows = lv(a, orderA), cols = lv(b, orderB);
  const ri = new Map(rows.map((r, i) => [r, i])), ci = new Map(cols.map((c, j) => [c, j]));
  const N = rows.map(() => cols.map(() => 0)); a.forEach((x, i) => { N[ri.get(x)][ci.get(b[i])]++; });
  return { rows, cols, N };
}
export const margins = (N) => { const rs = N.map((r) => r.reduce((s, v) => s + v, 0)), cs = N[0].map((_, j) => N.reduce((s, r) => s + r[j], 0)); return { rs, cs, n: rs.reduce((s, v) => s + v, 0) }; };

// Pearson χ² = Σ(O − E)²/E with E = rᵢcⱼ/n; G² = 2ΣO ln(O/E); adjusted residual (O − E)/√(E(1 − rᵢ/n)(1 − cⱼ/n))
// (Haberman 1973), compared with ±1.96 and Holm-adjusted across all cells. Yates' correction is reported for 2 × 2.
export function chiSquare(N) {
  const { rs, cs, n } = margins(N), r = N.length, c = N[0].length;
  const E = rs.map((ri) => cs.map((cj) => ri * cj / n));
  let chi2 = 0, g2 = 0, yates = 0;
  N.forEach((row, i) => row.forEach((o, j) => { const e = E[i][j]; chi2 += (o - e) ** 2 / e; if (o > 0) g2 += 2 * o * Math.log(o / e); yates += Math.max(0, Math.abs(o - e) - 0.5) ** 2 / e; }));
  const df = (r - 1) * (c - 1);
  const adj = N.map((row, i) => row.map((o, j) => (o - E[i][j]) / Math.sqrt(E[i][j] * (1 - rs[i] / n) * (1 - cs[j] / n))));
  const pz = adj.flat().map((z) => normSf2(z)), ph = holm(pz);
  const low = E.flat().filter((e) => e < 5).length;
  return {
    chi2, df, p: chi2Sf(chi2, df), g2, gp: chi2Sf(g2, df), yates: r === 2 && c === 2 ? yates : NaN, yatesP: r === 2 && c === 2 ? chi2Sf(yates, 1) : NaN,
    E, adj, adjP: adj.map((row, i) => row.map((_, j) => pz[i * c + j])), holmP: adj.map((row, i) => row.map((_, j) => ph[i * c + j])),
    minE: Math.min(...E.flat()), lowE: low, lowShare: low / (r * c), n, rs, cs,
  };
}

// Cramér's V = √(χ²/(n(m − 1))), m = min(r, c), with the noncentral-χ² interval (Smithson 2003): find λ with
// P(χ²(df, λ) ≤ χ²_obs) = .975 and .025, then V = √((λ + df)/(n(m − 1))); a lower λ of 0 gives a lower limit of 0.
export function cramerV(chi2, n, r, c, conf = 0.95) {
  const m = Math.min(r, c) - 1, df = (r - 1) * (c - 1), v = Math.sqrt(chi2 / (n * m));
  const lL = ncx2Lambda(chi2, df, 1 - (1 - conf) / 2), lU = ncx2Lambda(chi2, df, (1 - conf) / 2);
  return { v, lo: lL > 0 ? Math.min(v, Math.sqrt((lL + df) / (n * m))) : 0, hi: Math.min(1, Math.sqrt((lU + df) / (n * m))), w: v * Math.sqrt(m), m };
}
// Cohen (1988) for w = V·√(min(r, c) − 1): .10 small, .30 medium, .50 large.
export const effectWord = (w) => (w >= 0.5 ? 'large' : w >= 0.3 ? 'medium' : w >= 0.1 ? 'small' : 'negligible');

// ── Exact tests ──
const lfact = (k) => lgam(k + 1);
// log probability of a table given its margins (multivariate hypergeometric).
export function logTableProb(N) {
  const { rs, cs, n } = margins(N);
  let s = rs.reduce((a, v) => a + lfact(v), 0) + cs.reduce((a, v) => a + lfact(v), 0) - lfact(n);
  for (const row of N) for (const v of row) s -= lfact(v);
  return s;
}
// Freeman-Halton exact test for 2 × c (or r × 2) tables by enumerating the first row; null if more than `limit` tables.
export function freemanHalton(N, limit = 3e5) {
  let T = N;
  if (N.length !== 2 && N[0].length === 2) T = N[0].map((_, j) => N.map((r) => r[j]));
  if (T.length !== 2) return null;
  const { rs, cs } = margins(T), c = cs.length, r1 = rs[0], r2 = rs[1];
  const obs = logTableProb(T); let p = 0, count = 0;
  const x = new Array(c).fill(0);
  const rec = (j, left) => {
    if (count > limit) return;
    if (j === c - 1) {
      const v = left; if (v < Math.max(0, cs[j] - r2) || v > Math.min(cs[j], r1)) return;
      x[j] = v; count++;
      const lp = logTableProb([x.slice(), x.map((xx, t) => cs[t] - xx)]);
      if (lp <= obs + 1e-7 * Math.abs(obs) + 1e-12) p += Math.exp(lp);
      return;
    }
    let restMax = 0; for (let t = j + 1; t < c; t++) restMax += Math.min(cs[t], r1);
    for (let v = Math.max(0, cs[j] - r2); v <= Math.min(cs[j], r1, left); v++) { if (left - v > restMax) continue; x[j] = v; rec(j + 1, left - v); }
  };
  rec(0, r1);
  return count > limit ? null : { p: Math.min(1, p), tables: count };
}
// Monte Carlo exact p: shuffle one variable's labels B times (margins fixed) and count tables at most as probable as
// the observed one; p = (1 + hits)/(B + 1). The page runs this in a Web Worker.
export function monteCarloExact(N, { B = 10000, seed = 31 } = {}) {
  const { rs, cs } = margins(N), r = rs.length, c = cs.length, obs = logTableProb(N);
  const rowLab = [], colLab = []; rs.forEach((v, i) => { for (let k = 0; k < v; k++) rowLab.push(i); }); cs.forEach((v, j) => { for (let k = 0; k < v; k++) colLab.push(j); });
  const u = rng(seed), n = rowLab.length, M = new Int32Array(r * c); let hits = 0;
  const base = rs.reduce((a, v) => a + lfact(v), 0) + cs.reduce((a, v) => a + lfact(v), 0) - lfact(n);
  for (let b = 0; b < B; b++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); const t = colLab[i]; colLab[i] = colLab[j]; colLab[j] = t; }
    M.fill(0); for (let i = 0; i < n; i++) M[rowLab[i] * c + colLab[i]]++;
    let lp = base; for (let k = 0; k < r * c; k++) lp -= lfact(M[k]);
    if (lp <= obs + 1e-7 * Math.abs(obs) + 1e-12) hits++;
  }
  return { p: (1 + hits) / (B + 1), B };
}
export function exactTest(N) {
  if (N.length === 2 && N[0].length === 2) return { p: fisherExact(N[0][0], N[0][1], N[1][0], N[1][1]), method: "Fisher's exact test" };
  const fh = freemanHalton(N);
  return fh ? { p: fh.p, method: 'Freeman-Halton exact test', tables: fh.tables } : null;
}

// Linear-by-linear association for two ordered variables: M² = (n − 1)r², r the Pearson correlation of the row and
// column scores (1, 2, 3 …), on 1 df (Agresti 2007).
export function linearByLinear(N, rowScores = null, colScores = null) {
  const r = N.length, c = N[0].length, u = rowScores || N.map((_, i) => i + 1), v = colScores || N[0].map((_, j) => j + 1);
  const xs = [], ys = []; N.forEach((row, i) => row.forEach((k, j) => { for (let t = 0; t < k; t++) { xs.push(u[i]); ys.push(v[j]); } }));
  const rr = pearson(xs, ys), n = xs.length, m2 = (n - 1) * rr * rr;
  return { r: rr, m2, p: chi2Sf(m2, 1), z: Math.sign(rr) * Math.sqrt(m2) };
}

// ── Layers ──
const or2 = (t) => { const [[a, b], [c, d]] = t; const z = a === 0 || b === 0 || c === 0 || d === 0 ? 0.5 : 0; return ((a + z) * (d + z)) / ((b + z) * (c + z)); };
// Cochran-Mantel-Haenszel for 2 × 2 × K: MH odds ratio Σ(aᵢdᵢ/nᵢ)/Σ(bᵢcᵢ/nᵢ) with the Robins-Breslow-Greenland interval;
// CMH χ² = (|Σaᵢ − ΣE(aᵢ)| − ½)²/ΣVar(aᵢ) (the ½ only with correction), Var = r₁r₂c₁c₂/(n²(n − 1)).
// Breslow-Day: Σ(aᵢ − Âᵢ)²/Var(Âᵢ), Âᵢ the cell expected under the common MH odds ratio, on K − 1 df; Tarone's
// adjustment subtracts (Σaᵢ − ΣÂᵢ)²/ΣVar(Âᵢ).
export function cmh(tables, conf = 0.95) {
  const S = tables.filter((t) => t[0][0] + t[0][1] + t[1][0] + t[1][1] > 1);
  let R = 0, Sx = 0, sa = 0, se = 0, sv = 0, PR = 0, PSQR = 0, QS = 0;
  for (const [[a, b], [c, d]] of S) {
    const n = a + b + c + d, r1 = a + b, r2 = c + d, c1 = a + c, c2 = b + d;
    const Ri = a * d / n, Si = b * c / n, P = (a + d) / n, Q = (b + c) / n;
    R += Ri; Sx += Si; PR += P * Ri; PSQR += P * Si + Q * Ri; QS += Q * Si;
    sa += a; se += r1 * c1 / n; sv += r1 * r2 * c1 * c2 / (n * n * (n - 1));
  }
  const or = R / Sx, lor = Math.log(or);
  const seLog = Math.sqrt(PR / (2 * R * R) + PSQR / (2 * R * Sx) + QS / (2 * Sx * Sx));
  const zc = phiInv(1 - (1 - conf) / 2);
  const stat = (sa - se) ** 2 / sv, statC = Math.max(0, Math.abs(sa - se) - 0.5) ** 2 / sv;
  // Breslow-Day
  let bd = 0, sA = 0, sEa = 0, sVa = 0;
  for (const [[a, b], [c, d]] of S) {
    const r1 = a + b, c1 = a + c, r2 = c + d;
    const lo = Math.max(0, c1 - r2), hi = Math.min(r1, c1);
    // Solve (A(r2 − c1 + A)) / ((r1 − A)(c1 − A)) = or for A in [lo, hi] (a quadratic).
    const qa = 1 - or, qb = (r2 - c1) + or * (r1 + c1), qc = -or * r1 * c1;
    let A;
    if (Math.abs(qa) < 1e-12) A = -qc / qb;
    else { const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc)); const x1 = (-qb + disc) / (2 * qa), x2 = (-qb - disc) / (2 * qa); A = x1 >= lo - 1e-9 && x1 <= hi + 1e-9 ? x1 : x2; }
    const B = r1 - A, C = c1 - A, D = r2 - c1 + A;
    const v = 1 / (1 / A + 1 / B + 1 / C + 1 / D);
    bd += (a - A) ** 2 / v; sA += a; sEa += A; sVa += v;
  }
  const K = S.length, tarone = bd - (sA - sEa) ** 2 / sVa;
  return {
    or, lo: Math.exp(lor - zc * seLog), hi: Math.exp(lor + zc * seLog), seLog,
    chi2: stat, p: chi2Sf(stat, 1), chi2c: statC, pc: chi2Sf(statC, 1),
    bd, bdP: K > 1 ? chi2Sf(bd, K - 1) : NaN, tarone, taroneP: K > 1 ? chi2Sf(tarone, K - 1) : NaN, K,
  };
}
// Collapse a layered set of tables (same shape) into one.
export const collapse = (tables) => tables[0].map((row, i) => row.map((_, j) => tables.reduce((s, t) => s + t[i][j], 0)));

// Simpson's paradox check for 2 × 2 × K: the pooled (collapsed) odds ratio against the MH (within-layer) odds ratio
// and each layer's. A reversal is flagged when the pooled and adjusted odds ratios sit on opposite sides of 1 and
// each is clearly away from it (beyond 1.1 or 1/1.1); confounding when they differ by more than 10%
// (the change-in-estimate rule of thumb).
export function simpsonCheck(tables) {
  const pooled = or2(collapse(tables)), m = cmh(tables), layers = tables.map(or2);
  const away = (x) => x > 1.1 || x < 1 / 1.1;
  const reversal = Math.sign(Math.log(pooled)) !== Math.sign(Math.log(m.or)) && away(pooled) && away(m.or);
  const allOpp = layers.every((o) => Math.sign(Math.log(o)) === Math.sign(Math.log(m.or)) && Math.sign(Math.log(o)) !== Math.sign(Math.log(pooled)));
  const change = Math.abs(Math.log(pooled / m.or));
  return { pooled, adjusted: m.or, layers, reversal, allLayersOpposite: allOpp, confounded: change > Math.log(1.1), change: Math.exp(change) - 1 };
}
// Per-layer χ² and Cramér's V for any shape (the elaboration model: does the association hold in every layer?).
export function layerStats(tables) {
  return tables.map((N) => {
    const keepR = N.map((r) => r.some((v) => v > 0)), keepC = N[0].map((_, j) => N.some((r) => r[j] > 0));
    const T = N.filter((_, i) => keepR[i]).map((r) => r.filter((_, j) => keepC[j]));
    if (T.length < 2 || T[0].length < 2) return { n: N.flat().reduce((a, b) => a + b, 0), chi2: NaN, df: 0, p: NaN, v: NaN, tooSmall: true };
    const x = chiSquare(T), cv = cramerV(x.chi2, x.n, T.length, T[0].length);
    return { n: x.n, chi2: x.chi2, df: x.df, p: x.p, v: cv.v, lowE: x.lowE, cells: T.length * T[0].length, or: T.length === 2 && T[0].length === 2 ? or2(T) : NaN };
  });
}
export { or2 };

// ── Plain-language summary ──
// Confidence rule (also in confidenceNote): high when p < .01, n ≥ 100 and either every expected count is at least 5
// or an exact p is used; low when p ≥ .05, or more than 20% of expected counts are under 5 with no exact test;
// medium otherwise. A layer with a reversal lowers it to medium at most.
export function crosstabSummary({ rowName, colName, layerName = null, tab, x, cv, exact = null, trend = null, simpson = null, cm = null, layers = null }) {
  const n = x.n, pUse = exact ? exact.p : x.p, sig = pUse < 0.05;
  const w = effectWord(cv.w);
  const big = []; tab.rows.forEach((rl, i) => tab.cols.forEach((cl, j) => { if (x.holmP[i][j] < 0.05) big.push({ rl, cl, z: x.adj[i][j] }); }));
  big.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const testTxt = `χ²(${x.df}) = ${f2(x.chi2)}, p ${fp(x.p)}${exact ? `; ${exact.method} p ${fp(exact.p)}` : ''}`;
  let headline = sig
    ? `"${rowName}" and "${colName}" are associated (${testTxt}), with a ${w} effect: Cramér's V = ${f2(cv.v)}.`
    : `No clear association between "${rowName}" and "${colName}" (${testTxt}); Cramér's V = ${f2(cv.v)}.`;
  if (simpson && simpson.reversal) headline = `Simpson's paradox: pooled over "${layerName}", the odds ratio is ${f2(simpson.pooled)}, but within each level of "${layerName}" it is ${f2(simpson.adjusted)} (Mantel-Haenszel), pointing the other way.`;
  const meaning = [];
  meaning.push(`Effect size: V = ${f2(cv.v)} (95% CI ${f2(cv.lo)} to ${f2(cv.hi)}), ${w} by Cohen's (1988) benchmarks for this table size (w = ${f2(cv.w)}; .10 small, .30 medium, .50 large).`);
  if (big.length) meaning.push(`Cells that stand out after Holm's adjustment: ${big.slice(0, 4).map((b) => `${b.rl} × ${b.cl} (${b.z > 0 ? 'more' : 'fewer'} than expected, z = ${f2(b.z)})`).join('; ')}.`);
  else if (sig) meaning.push('No single cell stands out after Holm\'s adjustment; the association is spread across the table.');
  if (x.lowE) meaning.push(`${x.lowE} of ${tab.rows.length * tab.cols.length} expected counts are below 5 (smallest ${f2(x.minE, 1)}), so the χ² p-value is approximate${exact ? `; rely on the ${exact.method} instead` : '; use the exact or Monte Carlo p, or merge sparse categories'}.`);
  if (trend) meaning.push(`Trend: the linear-by-linear test gives M² = ${f2(trend.m2)}, p ${fp(trend.p)} (r = ${f2(trend.r)}), ${trend.p < 0.05 ? `so higher "${rowName}" goes with ${trend.r > 0 ? 'higher' : 'lower'} "${colName}"` : 'so there is no clear ordered trend'}.`);
  if (cm) meaning.push(`Controlling for "${layerName}": Mantel-Haenszel odds ratio ${f2(cm.or)} (95% CI ${f2(cm.lo)} to ${f2(cm.hi)}), CMH χ²(1) = ${f2(cm.chi2)}, p ${fp(cm.p)}. Breslow-Day (Tarone) χ²(${cm.K - 1}) = ${f2(cm.tarone)}, p ${fp(cm.taroneP)}: ${cm.taroneP < 0.05 ? 'the odds ratio differs between layers, so report each layer rather than one pooled figure' : 'no evidence the odds ratio differs between layers'}.`);
  if (simpson) meaning.push(simpson.reversal ? `The pooled table points the opposite way to every layer${simpson.allLayersOpposite ? '' : ' on balance'}: "${layerName}" is related to both variables and reverses the pooled association.` : simpson.confounded ? `The pooled odds ratio (${f2(simpson.pooled)}) and the within-layer one (${f2(simpson.adjusted)}) differ by ${fpct(simpson.change)}, so "${layerName}" partly confounds the pooled result.` : `The pooled odds ratio (${f2(simpson.pooled)}) and the within-layer one (${f2(simpson.adjusted)}) agree, so "${layerName}" does not explain the association.`);
  else if (layers) { const vs = layers.filter((l) => Number.isFinite(l.v)); if (vs.length) meaning.push(`Within each level of "${layerName}", V runs from ${f2(Math.min(...vs.map((l) => l.v)))} to ${f2(Math.max(...vs.map((l) => l.v)))} against ${f2(cv.v)} pooled: ${Math.max(...vs.map((l) => l.v)) < cv.v * 0.6 ? 'the association weakens within layers (explanation or interpretation, in the elaboration model)' : Math.min(...vs.map((l) => l.v)) < cv.v * 0.5 ? 'it holds in some layers and not others (specification)' : 'it holds in every layer (replication)'}.`); }
  let level = (pUse < 0.01 && n >= 100 && (x.lowE === 0 || exact)) ? 'high' : (pUse >= 0.05 || (x.lowShare > 0.2 && !exact)) ? 'low' : 'medium';
  if (simpson && simpson.reversal && level === 'high') level = 'medium';
  const confidenceNote = `Rated from the p-value (${fp(pUse).replace('= ', '')}), the sample (n = ${n}) and the expected counts (${x.lowE} under 5). Strong needs p < .01, n ≥ 100 and no expected count under 5 (or an exact test); weak if p ≥ .05, or more than 20% of expected counts are under 5 with no exact test. A Simpson's reversal caps it at some evidence.`;
  const caveats = [
    n >= 1000 ? `With ${n} respondents even a trivial difference is "significant"; judge it by Cramér's V and the percentages, not the p-value.` : 'A significant χ² says the variables are related, not how strongly; read Cramér\'s V and the column percentages.',
    'Association is not causation: a third variable can create, hide or reverse a relationship. Try a layer column for the likeliest one.',
    'Checking every cell inflates false alarms; the highlighted cells use Holm\'s adjustment for that reason.',
  ];
  const next = [
    simpson && simpson.reversal ? `Report the within-${layerName} results, not the pooled table, and ask why "${layerName}" differs between the groups.` : layerName ? 'Report the layer results alongside the pooled table.' : 'Add a layer column for the most plausible confounder (device, plan, tenure) to see if the association holds within each group.',
    'For two proportions, get an interval for the difference in [Compare two rates](/calculators/compare-rates).',
  ];
  const report = `${rowName} × ${colName} (n = ${n}): ${testTxt}, Cramér's V = ${f2(cv.v)} [95% CI ${f2(cv.lo)}, ${f2(cv.hi)}].${trend ? ` Linear-by-linear M²(1) = ${f2(trend.m2)}, p ${fp(trend.p)}.` : ''}${cm ? ` Stratified by ${layerName}: MH OR = ${f2(cm.or)} [${f2(cm.lo)}, ${f2(cm.hi)}], CMH χ²(1) = ${f2(cm.chi2)}, p ${fp(cm.p)}; Breslow-Day-Tarone χ²(${cm.K - 1}) = ${f2(cm.tarone)}, p ${fp(cm.taroneP)}.` : ''}${simpson && simpson.reversal ? ` The pooled odds ratio (${f2(simpson.pooled)}) reverses within layers (Simpson's paradox).` : ''}`;
  return { headline, meaning: meaning.slice(0, 6), confidence: level, confidenceNote, caveats, next, report, big: big.length ? listAnd(big.slice(0, 3).map((b) => `${b.rl} × ${b.cl}`)) : '' };
}
