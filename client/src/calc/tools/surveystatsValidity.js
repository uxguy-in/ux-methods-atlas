// Convergent and discriminant validity for the "Scale validity" tool: composite reliability, AVE, coefficient H,
// the Fornell-Larcker table, HTMT, a maximum-likelihood confirmatory factor analysis with simple structure (each item
// on one construct, constructs correlated) and the CFA fit index calculator (RMSEA with its 90% interval, CFI, TLI,
// SRMR). Pure functions; checked against semopy, scipy and numpy by server/scripts/check-surveystats.js.
import { inverse, logDet, matMul, transpose, ncx2Cdf, ncx2Lambda, chi2Sf, minimize, f2, fp, fpct, plural, listAnd } from './surveystatsMath.js';
import { minresOrMl } from './surveystatsFactor.js';

// ── Reliability and convergent validity from standardised loadings ──
// CR = (Σλ)² / ((Σλ)² + Σ(1 − λ²))  (Jöreskog 1971; Fornell & Larcker 1981)
// AVE = Σλ² / k                      (Fornell & Larcker 1981)
// H = 1 / (1 + 1 / Σ(λ²/(1 − λ²)))   (Hancock & Mueller 2001)
export function compositeReliability(l) { const s = l.reduce((a, b) => a + b, 0), e = l.reduce((a, v) => a + 1 - v * v, 0); return s * s / (s * s + e); }
export const ave = (l) => l.reduce((a, v) => a + v * v, 0) / l.length;
export function coefficientH(l) { if (l.some((v) => Math.abs(v) >= 1)) return 1; const s = l.reduce((a, v) => a + v * v / (1 - v * v), 0); return 1 / (1 + 1 / s); }
export const constructStats = (l) => ({ cr: compositeReliability(l), ave: ave(l), h: coefficientH(l), sqrtAve: Math.sqrt(ave(l)), k: l.length, min: Math.min(...l) });

// Fornell-Larcker: discriminant validity holds for a pair when each construct's √AVE exceeds their correlation.
export function fornellLarcker(stats, Phi) {
  const k = stats.length, fails = [];
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { const r = Math.abs(Phi[a][b]); if (r >= stats[a].sqrtAve || r >= stats[b].sqrtAve) fails.push([a, b, Phi[a][b]]); }
  return { fails };
}

// HTMT (Henseler, Ringle & Sarstedt 2015): the mean heterotrait-heteromethod correlation (items of A with items of B)
// divided by the geometric mean of the mean monotrait-heteromethod correlations (items within A, items within B).
export function htmt(R, groups) {
  const k = groups.length, out = Array.from({ length: k }, () => new Array(k).fill(1));
  const within = groups.map((g) => { let s = 0, m = 0; for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { s += R[g[i]][g[j]]; m++; } return m ? s / m : NaN; });
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
    let s = 0, m = 0; for (const i of groups[a]) for (const j of groups[b]) { s += R[i][j]; m++; }
    out[a][b] = out[b][a] = (s / m) / Math.sqrt(within[a] * within[b]);
  }
  return { htmt: out, within };
}

// ── Confirmatory factor analysis by maximum likelihood ──
// Σ(θ) = ΛΦΛᵀ + Θ, factor variances fixed at 1, each item loading on one construct. F = ln|Σ| + tr(SΣ⁻¹) − ln|S| − p,
// minimised with analytic gradients (Ω = Σ⁻¹(Σ − S)Σ⁻¹: ∂F/∂Λ = 2ΩΛΦ, ∂F/∂Θᵢᵢ = Ωᵢᵢ, ∂F/∂φ = 2(ΛᵀΩΛ)). χ² = (n − 1)F.
export function cfa(S, n, groups) {
  const p = S.length, k = groups.length, item = new Array(p).fill(-1);
  groups.forEach((g, c) => g.forEach((i) => { item[i] = c; }));
  const used = item.map((c, i) => (c >= 0 ? i : -1)).filter((i) => i >= 0);
  if (used.length !== p) throw new Error('Every item must belong to one construct.');
  // Start values: one-factor solutions per construct and the correlations of their unit-weighted composites.
  const lam0 = new Array(p).fill(0.7);
  groups.forEach((g) => { if (g.length >= 3) { const sub = g.map((i) => g.map((j) => S[i][j])); const { L } = minresOrMl(sub, 1, 'minres'); const sg = L.reduce((s, r) => s + r[0], 0) < 0 ? -1 : 1; g.forEach((i, t) => { lam0[i] = Math.max(0.2, sg * L[t][0]); }); } else if (g.length === 2) { const r = Math.max(0.05, S[g[0]][g[1]]); g.forEach((i) => { lam0[i] = Math.sqrt(r); }); } });
  const pairs = []; for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) pairs.push([a, b]);
  const phi0 = pairs.map(([a, b]) => { let s = 0; for (const i of groups[a]) for (const j of groups[b]) s += S[i][j]; const va = groups[a].reduce((t, i) => t + groups[a].reduce((u, j) => u + S[i][j], 0), 0), vb = groups[b].reduce((t, i) => t + groups[b].reduce((u, j) => u + S[i][j], 0), 0); return Math.max(-0.95, Math.min(0.95, s / Math.sqrt(va * vb) / Math.sqrt(ave(groups[a].map((i) => lam0[i])) * ave(groups[b].map((i) => lam0[i]))) * 0.9)); });
  const x0 = [...lam0, ...lam0.map((l) => Math.max(0.05, 1 - l * l)), ...phi0];
  const unpack = (x) => {
    const Phi = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => (a === b ? 1 : 0)));
    pairs.forEach(([a, b], t) => { Phi[a][b] = Phi[b][a] = x[2 * p + t]; });
    const Lam = Array.from({ length: p }, (_, i) => Array.from({ length: k }, (__, c) => (item[i] === c ? x[i] : 0)));
    return { Lam, Phi, theta: x.slice(p, 2 * p) };
  };
  const ldS = logDet(S).log;
  const fg = (x) => {
    const { Lam, Phi, theta } = unpack(x);
    const LP = matMul(Lam, Phi), Sig = matMul(LP, transpose(Lam)); for (let i = 0; i < p; i++) Sig[i][i] += theta[i];
    const ld = logDet(Sig); const Si = inverse(Sig);
    if (!Si || ld.sign <= 0) return { f: Infinity, g: x.map(() => 0) };
    let tr = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += S[i][j] * Si[j][i];
    const f = ld.log + tr - ldS - p;
    const D = Sig.map((r, i) => r.map((v, j) => v - S[i][j]));
    const Om = matMul(matMul(Si, D), Si);
    const OL = matMul(Om, LP), LtOL = matMul(matMul(transpose(Lam), Om), Lam);
    const g = new Array(x.length).fill(0);
    for (let i = 0; i < p; i++) { g[i] = 2 * OL[i][item[i]]; g[p + i] = Om[i][i]; }
    pairs.forEach(([a, b], t) => { g[2 * p + t] = 2 * LtOL[a][b]; });
    return { f, g };
  };
  const lo = [...new Array(p).fill(-5), ...new Array(p).fill(1e-4), ...pairs.map(() => -0.999)];
  const hi = [...new Array(p).fill(5), ...new Array(p).fill(10), ...pairs.map(() => 0.999)];
  const res = minimize(fg, x0, { lo, hi, maxIter: 3000, gtol: 1e-9 });
  const { Lam, Phi, theta } = unpack(res.x);
  const Sig = matMul(matMul(Lam, Phi), transpose(Lam)); for (let i = 0; i < p; i++) Sig[i][i] += theta[i];
  const sd = Sig.map((r, i) => Math.sqrt(r[i]));
  // Standardised (completely standardised) loadings: λ / model-implied SD of the item. Signs make each construct's
  // loadings sum positive, flipping its correlations to match.
  const flip = groups.map((g) => (g.reduce((s, i) => s + res.x[i], 0) < 0 ? -1 : 1));
  const std = res.x.slice(0, p).map((l, i) => flip[item[i]] * l / sd[i]);
  const PhiS = Phi.map((r, a) => r.map((v, b) => v * flip[a] * flip[b]));
  const q = 2 * p + pairs.length, df = p * (p + 1) / 2 - q;
  const chi2 = (n - 1) * res.f;
  let ssr = 0; for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) ssr += ((S[i][j] - Sig[i][j]) / Math.sqrt(S[i][i] * S[j][j])) ** 2;
  const srmr = Math.sqrt(ssr / (p * (p + 1) / 2));
  const chi2b = (n - 1) * (-ldS + S.reduce((s, r, i) => s + Math.log(r[i]), 0)), dfb = p * (p - 1) / 2;
  const heywood = theta.map((t, i) => (t <= 2e-4 || Math.abs(std[i]) >= 0.999 ? i : -1)).filter((i) => i >= 0);
  return { std, Phi: PhiS, theta, F: res.f, chi2, df, chi2b, dfb, srmr, converged: res.converged, iter: res.iter, heywood, implied: Sig, fit: fitIndices({ chi2, df, n, chi2b, dfb, srmr }) };
}

// ── Fit indices from χ² ──
// RMSEA = √(max(χ² − df, 0) / (df (n − 1)))  (Steiger 1990); 90% interval from the noncentral χ²: λ_L and λ_U solve
// P(χ²(df, λ) ≤ χ²_obs) = .95 and .05, RMSEA = √(λ / (df (n − 1))). p-close = P(RMSEA ≤ .05) = 1 − F(χ²; df, .0025 df (n − 1)).
// CFI = 1 − max(χ² − df, 0) / max(χ²_b − df_b, χ² − df, 0) (Bentler 1990); TLI = (χ²_b/df_b − χ²/df) / (χ²_b/df_b − 1).
export function fitIndices({ chi2, df, n, chi2b = NaN, dfb = NaN, srmr = NaN }) {
  const N1 = n - 1, out = { chi2, df, n, p: df > 0 ? chi2Sf(chi2, df) : NaN, ratio: chi2 / df };
  if (df > 0) {
    out.rmsea = Math.sqrt(Math.max(chi2 - df, 0) / (df * N1));
    const lL = ncx2Lambda(chi2, df, 0.95), lU = ncx2Lambda(chi2, df, 0.05);
    out.rmseaLo = Math.sqrt(lL / (df * N1)); out.rmseaHi = Math.sqrt(lU / (df * N1));
    out.pclose = 1 - ncx2Cdf(chi2, df, 0.0025 * df * N1);
  }
  if (Number.isFinite(chi2b) && dfb > 0) {
    const d = Math.max(chi2 - df, 0), db = Math.max(chi2b - dfb, chi2 - df, 0);
    out.cfi = db > 0 ? 1 - d / db : 1;
    out.tli = (chi2b / dfb - chi2 / df) / (chi2b / dfb - 1);
  }
  out.srmr = srmr;
  return out;
}
// Hu & Bentler (1999) combination cut-offs, read as rules of thumb.
export const HU_BENTLER = { cfi: 0.95, tli: 0.95, rmsea: 0.06, srmr: 0.08 };
export function fitVerdicts(f) {
  return {
    cfi: Number.isFinite(f.cfi) ? f.cfi >= HU_BENTLER.cfi : null,
    tli: Number.isFinite(f.tli) ? f.tli >= HU_BENTLER.tli : null,
    rmsea: Number.isFinite(f.rmsea) ? f.rmsea <= HU_BENTLER.rmsea : null,
    srmr: Number.isFinite(f.srmr) ? f.srmr <= HU_BENTLER.srmr : null,
  };
}

// ── Parsing ──
// "Construct: 0.81, 0.77, 0.70" (or tab/space separated), one construct per line.
export function parseLoadings(text) {
  const out = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(/^\s*([^:\t]+?)\s*[:\t]\s*(.+)$/);
    if (!m) { bad.push(i + 1); return; }
    const ls = m[2].split(/[\s,;]+/).filter(Boolean).map(Number);
    if (ls.length < 2 || ls.some((v) => !Number.isFinite(v) || Math.abs(v) >= 1)) { bad.push(i + 1); return; }
    out.push({ name: m[1].trim(), loadings: ls });
  });
  return { constructs: out, bad };
}
// "Construct: item, item, item" against the data's column names (case and spacing ignored).
export function parseMapping(text, names) {
  const key = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const idx = new Map(names.map((nm, i) => [key(nm), i]));
  const groups = [], unknown = [], seen = new Set(), dup = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.+)$/); if (!m) return;
    const items = [];
    m[2].split(/[,;\t]+/).map((s) => s.trim()).filter(Boolean).forEach((s) => { const i = idx.get(key(s)); if (i === undefined) unknown.push(s); else if (seen.has(i)) dup.push(s); else { seen.add(i); items.push(i); } });
    groups.push({ name: m[1].trim(), items });
  });
  return { groups, unknown, dup };
}

// ── Plain-language summary ──
// Thresholds: CR ≥ .70 and AVE ≥ .50 (Fornell & Larcker 1981; Hair et al.), HTMT < .85 strict or < .90 liberal
// (Henseler, Ringle & Sarstedt 2015), fit by Hu & Bentler (1999).
// Confidence rule (also stated in confidenceNote): high when the loadings come from raw data with n ≥ 200, every
// construct has at least three items, the CFA converged without a Heywood case and CFI ≥ .95 and SRMR ≤ .08; low when
// n < 100, any construct has fewer than three items, or the CFA failed or hit a Heywood case; medium otherwise
// (including loadings typed in from elsewhere, which cannot be checked).
export function validitySummary({ names, stats, Phi, fl, ht = null, fit = null, n = NaN, mode = 'raw', cfaOk = true, heywood = 0 }) {
  const k = names.length;
  const conv = stats.map((s, i) => (s.cr >= 0.7 && s.ave >= 0.5 ? null : names[i])).filter(Boolean);
  const htFails85 = [], htFails90 = [];
  if (ht) for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) { if (ht[a][b] >= 0.85) htFails85.push(`${names[a]} and ${names[b]} (${f2(ht[a][b])})`); if (ht[a][b] >= 0.9) htFails90.push(`${names[a]} and ${names[b]}`); }
  const flPairs = fl.fails.map(([a, b]) => `${names[a]} and ${names[b]}`);
  const discOK = ht ? htFails85.length === 0 : flPairs.length === 0;
  const headline = `${k - conv.length} of ${k} constructs show convergent validity (CR ≥ .70 and AVE ≥ .50), and ${discOK ? 'every pair passes' : 'some pairs fail'} the discriminant validity check${ht ? ' (HTMT below .85)' : ' (Fornell-Larcker)'}.`;
  const meaning = [];
  meaning.push(`Composite reliability runs from ${f2(Math.min(...stats.map((s) => s.cr)))} to ${f2(Math.max(...stats.map((s) => s.cr)))} and AVE from ${f2(Math.min(...stats.map((s) => s.ave)))} to ${f2(Math.max(...stats.map((s) => s.ave)))}. AVE ≥ .50 means the construct explains at least half of its items' variance (Fornell & Larcker 1981).`);
  if (conv.length) meaning.push(`Weak convergent validity: ${listAnd(conv)}. Look for low-loading items (under about .60) that pull CR and AVE down.`);
  meaning.push(flPairs.length ? `Fornell-Larcker: ${listAnd(flPairs)} correlate at least as strongly as the square root of an AVE, so the constructs may overlap.` : 'Fornell-Larcker: every construct\'s √AVE is larger than its correlations with the others.');
  if (ht) meaning.push(htFails85.length ? `HTMT at or above .85: ${listAnd(htFails85)}${htFails90.length ? `; ${htFails90.length} of these also reach the liberal .90 cut-off` : ', though below the liberal .90 cut-off'} (Henseler, Ringle & Sarstedt 2015). HTMT detects overlap more reliably than Fornell-Larcker.` : 'HTMT is below .85 for every pair (Henseler, Ringle & Sarstedt 2015), the stricter cut-off.');
  if (fit) { const v = fitVerdicts(fit); meaning.push(`CFA fit: CFI ${f2(fit.cfi, 3)}, TLI ${f2(fit.tli, 3)}, RMSEA ${f2(fit.rmsea, 3)} (90% CI ${f2(fit.rmseaLo, 3)} to ${f2(fit.rmseaHi, 3)}), SRMR ${f2(fit.srmr, 3)}; ${Object.values(v).filter((x) => x === true).length} of 4 meet Hu & Bentler's (1999) suggested cut-offs.`); }
  const minItems = Math.min(...stats.map((s) => s.k));
  const fitGood = fit && fit.cfi >= 0.95 && fit.srmr <= 0.08;
  const level = (mode === 'raw' && (n < 100 || !cfaOk || heywood > 0)) || minItems < 3 ? 'low' : mode === 'raw' && n >= 200 && fitGood ? 'high' : 'medium';
  const confidenceNote = mode === 'raw'
    ? `Rated from the sample (n = ${n}), items per construct (at least ${minItems}) and the CFA. Strong needs n ≥ 200, three or more items per construct and a converged CFA with CFI ≥ .95 and SRMR ≤ .08; weak if n < 100, a construct has fewer than three items, or the CFA failed or hit a Heywood case.`
    : `Loadings typed in from elsewhere cannot be checked here, so this is at best some evidence; it is weak if a construct has fewer than three items. HTMT needs the raw item data.`;
  const caveats = [
    'HTMT, CR and AVE assume reflective constructs: the items are interchangeable symptoms of one underlying construct. For formative indices (items that add up to define the construct, like a checklist of features used) these checks do not apply.',
    'Hu & Bentler\'s cut-offs are rules of thumb from particular simulations, not pass marks (Marsh, Hau & Wen 2004). Report all indices and the χ² and look at the largest residuals.',
    mode === 'raw' ? 'Testing the structure on the same data you used to build it flatters the fit; confirm on a new sample.' : 'CR and AVE depend entirely on the loadings you entered; check they are standardised (completely standardised) loadings from one model.',
  ];
  const next = [
    conv.length ? `Inspect the items of ${listAnd(conv.slice(0, 2))} and consider dropping the weakest-loading one, then rerun.` : 'Report CR, AVE and HTMT together in a table; reviewers expect all three.',
    !discOK ? 'If two constructs overlap, check the item wording for shared content, or test whether one combined construct fits as well (a χ² difference test in your SEM software).' : 'Check reliability for each construct in [Scale reliability](/calculators/reliability).',
    'If you are still deciding which items belong together, explore the structure first with [Factor analysis](/calculators/factor-analysis).',
  ];
  const report = `Convergent validity: composite reliability ranged from ${f2(Math.min(...stats.map((s) => s.cr)))} to ${f2(Math.max(...stats.map((s) => s.cr)))} and AVE from ${f2(Math.min(...stats.map((s) => s.ave)))} to ${f2(Math.max(...stats.map((s) => s.ave)))} across ${plural(k, 'construct')}${conv.length ? ` (${listAnd(conv)} below CR .70 or AVE .50)` : ''}. Discriminant validity: ${flPairs.length ? `${flPairs.length} pair(s) failed` : 'all pairs met'} the Fornell-Larcker criterion${ht ? `, and HTMT ${htFails85.length ? `reached .85 for ${htFails85.length} pair(s)` : 'was below .85 for all pairs'}` : ''}.${fit ? ` CFA fit: χ²(${fit.df}) = ${f2(fit.chi2, 1)}, p ${fp(fit.p)}, CFI = ${f2(fit.cfi, 3)}, TLI = ${f2(fit.tli, 3)}, RMSEA = ${f2(fit.rmsea, 3)} [90% CI ${f2(fit.rmseaLo, 3)}, ${f2(fit.rmseaHi, 3)}], SRMR = ${f2(fit.srmr, 3)}.` : ''}`;
  return { headline, meaning: meaning.slice(0, 6), confidence: level, confidenceNote, caveats, next, report };
}
// Summary for the fit index calculator on its own.
// Confidence rule: high when n ≥ 200 and all available indices meet Hu & Bentler; low when n < 100 or fewer than half
// meet them; medium otherwise.
export function fitSummary(f) {
  const v = fitVerdicts(f), have = Object.values(v).filter((x) => x !== null), met = have.filter(Boolean).length;
  const headline = `${met} of ${have.length} fit indices meet Hu & Bentler's (1999) suggested cut-offs: RMSEA = ${f2(f.rmsea, 3)}${Number.isFinite(f.cfi) ? `, CFI = ${f2(f.cfi, 3)}` : ''}${Number.isFinite(f.srmr) ? `, SRMR = ${f2(f.srmr, 3)}` : ''}.`;
  const meaning = [
    `RMSEA ${f2(f.rmsea, 3)} with a 90% confidence interval of ${f2(f.rmseaLo, 3)} to ${f2(f.rmseaHi, 3)}: ${f.rmseaHi <= 0.06 ? 'the whole interval is in the close-fit zone' : f.rmseaLo > 0.08 ? 'even the lower end is above .08, so the misfit is not just sampling noise' : 'the interval spans close and poorer fit, so the data cannot settle it'}. p-close (H₀: RMSEA ≤ .05) ${fp(f.pclose)}.`,
    `χ²(${f.df}) = ${f2(f.chi2, 2)}, p ${fp(f.p)}, χ²/df = ${f2(f.ratio)}. With large samples the χ² test rejects almost any model, which is why the approximate indices exist.`,
  ];
  if (Number.isFinite(f.cfi)) meaning.push(`CFI ${f2(f.cfi, 3)} and TLI ${f2(f.tli, 3)} compare your model with a baseline in which no items correlate; .95 or more is Hu & Bentler's suggestion, .90 the older, looser one.`);
  const level = f.n < 100 || met < have.length / 2 ? 'low' : f.n >= 200 && met === have.length ? 'high' : 'medium';
  return {
    headline, meaning, confidence: level,
    confidenceNote: `Rated from the sample (n = ${f.n}) and how many indices meet the cut-offs (${met} of ${have.length}). Strong needs n ≥ 200 and all indices meeting them; weak if n < 100 or fewer than half meet them.`,
    caveats: ['Cut-offs are rules of thumb, not significance tests; Hu & Bentler derived them for particular models, and they are too strict for some and too lenient for others (Marsh, Hau & Wen 2004).', 'Good global fit does not make the model right: other models can fit as well, and local misfit (large residuals) can hide behind good averages.'],
    next: ['Report χ², df, CFI, TLI, RMSEA with its interval and SRMR together.', 'Look at modification indices and residuals in your SEM software before changing the model, and only make changes you can justify.'],
    report: `Model fit: χ²(${f.df}) = ${f2(f.chi2, 2)}, p ${fp(f.p)}; RMSEA = ${f2(f.rmsea, 3)} [90% CI ${f2(f.rmseaLo, 3)}, ${f2(f.rmseaHi, 3)}]${Number.isFinite(f.cfi) ? `; CFI = ${f2(f.cfi, 3)}; TLI = ${f2(f.tli, 3)}` : ''}${Number.isFinite(f.srmr) ? `; SRMR = ${f2(f.srmr, 3)}` : ''}.`,
  };
}
export { fpct };
