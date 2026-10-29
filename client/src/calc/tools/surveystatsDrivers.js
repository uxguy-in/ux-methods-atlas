// Key driver analysis for the "Key driver analysis" tool: multiple regression (standardised betas, intervals, VIF),
// correlations, Johnson's relative weights, dominance analysis (Shapley decomposition of R², exact for up to 12
// drivers), logistic regression with McFadden's pseudo-R² and dominance on it, the importance-performance grid and the
// summary. Pure functions; checked against statsmodels and hand numpy by server/scripts/check-surveystats.js.
import { inverse, matVec, transpose, matMul, eigen, mean, sdev, pearson, corrMatrix, tP, tQuant, fSf, phi, rng, f2, fp, fpct, plural, listAnd } from './surveystatsMath.js';

// ── Ordinary least squares ──
// b = (XᵀX)⁻¹Xᵀy with an intercept; SE from s²(XᵀX)⁻¹; standardised β = b·sₓ/s_y (its interval is the b interval
// rescaled the same way, treating the SDs as fixed); VIF_j = 1/(1 − R²_j) = (R_xx⁻¹)_jj.
export function ols(y, X, conf = 0.95) {
  const n = y.length, p = X[0].length, Z = X.map((r) => [1, ...r]);
  const ZtZ = matMul(transpose(Z), Z), inv = inverse(ZtZ);
  if (!inv) return { error: 'The drivers are perfectly collinear (one is an exact combination of others), so the regression cannot be fitted.' };
  const b = matVec(inv, matVec(transpose(Z), y));
  const fitted = Z.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)), resid = y.map((v, i) => v - fitted[i]);
  const my = mean(y), sst = y.reduce((s, v) => s + (v - my) ** 2, 0), sse = resid.reduce((s, v) => s + v * v, 0);
  const df = n - p - 1, s2 = sse / df;
  const se = inv.map((r, j) => Math.sqrt(s2 * r[j]));
  const tc = tQuant(conf, df);
  const t = b.map((v, j) => v / se[j]);
  const sx = X[0].map((_, j) => sdev(X.map((r) => r[j]))), sy = sdev(y);
  const r2 = 1 - sse / sst, adj = 1 - (1 - r2) * (n - 1) / df;
  const F = (r2 / p) / ((1 - r2) / df);
  const Rxx = corrMatrix(X[0].map((_, j) => X.map((r) => r[j])));
  const Ri = inverse(Rxx);
  return {
    n, p, df, b, se, t, pv: t.map((v) => tP(v, df)), lo: b.map((v, j) => v - tc * se[j]), hi: b.map((v, j) => v + tc * se[j]),
    beta: b.slice(1).map((v, j) => v * sx[j] / sy), betaLo: b.slice(1).map((v, j) => (v - tc * se[j + 1]) * sx[j] / sy), betaHi: b.slice(1).map((v, j) => (v + tc * se[j + 1]) * sx[j] / sy),
    r2, adjR2: adj, F, Fp: fSf(F, p, df), sigma: Math.sqrt(s2), fitted, resid, vif: Ri ? Ri.map((r, j) => r[j]) : X[0].map(() => Infinity), sx, sy,
  };
}

// R² of y on a subset of drivers from the correlation matrix: r_Sᵀ R_SS⁻¹ r_S.
export function r2Subset(Rxx, rxy, idx) {
  if (!idx.length) return 0;
  const inv = inverse(idx.map((i) => idx.map((j) => Rxx[i][j])));
  if (!inv) return NaN;
  const r = idx.map((i) => rxy[i]); return r.reduce((s, v, a) => s + v * inv[a].reduce((t, w, c) => t + w * r[c], 0), 0);
}

// Johnson's (2000) relative weights: Λ = R_xx^½ (from its eigen decomposition), β* = Λ⁻¹ r_xy, ε_j = Σ_k Λ_jk² β*_k².
// The weights add up to R².
export function relativeWeights(Rxx, rxy) {
  const { values, vectors } = eigen(Rxx), p = Rxx.length;
  const Lam = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (__, j) => values.reduce((s, l, k) => s + vectors[k][i] * vectors[k][j] * Math.sqrt(Math.max(l, 0)), 0)));
  const bstar = matVec(inverse(Lam), rxy);
  const eps = Lam.map((r) => r.reduce((s, v, k) => s + v * v * bstar[k] ** 2, 0));
  const total = eps.reduce((a, b) => a + b, 0);
  return { raw: eps, share: eps.map((e) => e / total), r2: total };
}

// Dominance analysis (Budescu 1993; Azen & Budescu 2003) from any subset fit function r2(mask) on p predictors.
// General dominance = Shapley value: Σ over subsets S without j of |S|!(p − |S| − 1)!/p! · [R²(S ∪ j) − R²(S)].
// Conditional dominance: the average increment at each subset size. Complete dominance of i over j: i adds more than j
// to every subset that contains neither.
export function dominance(p, r2) {
  const N = 1 << p, val = new Float64Array(N);
  for (let m = 0; m < N; m++) val[m] = r2(m);
  const fact = [1]; for (let i = 1; i <= p; i++) fact.push(fact[i - 1] * i);
  const popc = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
  const general = new Array(p).fill(0), cond = Array.from({ length: p }, () => new Array(p).fill(0)), cnt = new Array(p).fill(0);
  for (let s = 0; s < p; s++) cnt[s] = fact[p - 1] / (fact[s] * fact[p - 1 - s]);
  for (let m = 0; m < N; m++) {
    const s = popc(m);
    for (let j = 0; j < p; j++) if (!(m & (1 << j))) { const inc = val[m | (1 << j)] - val[m]; general[j] += inc * fact[s] * fact[p - s - 1] / fact[p]; cond[j][s] += inc / cnt[s]; }
  }
  const complete = Array.from({ length: p }, () => new Array(p).fill(null));
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
    if (i === j) continue;
    let all = true, none = true;
    for (let m = 0; m < N; m++) { if (m & (1 << i) || m & (1 << j)) continue; const d = val[m | (1 << i)] - val[m | (1 << j)]; if (!(d > 0)) all = false; if (!(d < 0)) none = false; }
    complete[i][j] = all ? true : none ? false : null;
  }
  return { general, conditional: cond, complete, full: val[N - 1], share: general.map((g) => g / val[N - 1]), exact: true };
}
// Shapley values by random orderings when there are too many drivers for every subset (p > 12).
export function dominanceSampled(p, r2, { perms = 2000, seed = 99 } = {}) {
  const u = rng(seed), cache = new Map(), get = (m) => { if (!cache.has(m)) cache.set(m, r2(m)); return cache.get(m); };
  const general = new Array(p).fill(0), order = Array.from({ length: p }, (_, i) => i);
  for (let t = 0; t < perms; t++) {
    for (let i = p - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let m = 0, prev = 0; for (const j of order) { const nm = m | (1 << j), v = get(nm); general[j] += (v - prev) / perms; prev = v; m = nm; }
  }
  const full = get((1 << p) - 1);
  return { general, full, share: general.map((g) => g / full), exact: false, perms };
}
export const MAX_EXACT = 12;
export function olsDominance(Rxx, rxy) {
  const p = Rxx.length, fn = (m) => r2Subset(Rxx, rxy, Array.from({ length: p }, (_, j) => j).filter((j) => m & (1 << j)));
  return p <= MAX_EXACT ? dominance(p, fn) : dominanceSampled(p, fn);
}

// ── Logistic regression (IRLS) ──
export function logistic(y, X, { maxIter = 100, tol = 1e-10 } = {}) {
  const n = y.length, Z = X.map((r) => [1, ...r]), q = Z[0].length;
  let b = new Array(q).fill(0), iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    const eta = Z.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)), mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
    const H = Array.from({ length: q }, () => new Array(q).fill(0)), g = new Array(q).fill(0);
    for (let i = 0; i < n; i++) { const w = mu[i] * (1 - mu[i]), r = Z[i]; for (let a = 0; a < q; a++) { g[a] += r[a] * (y[i] - mu[i]); for (let c = a; c < q; c++) H[a][c] += w * r[a] * r[c]; } }
    for (let a = 0; a < q; a++) for (let c = 0; c < a; c++) H[a][c] = H[c][a];
    const Hi = inverse(H); if (!Hi) break;
    const step = matVec(Hi, g); b = b.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < tol) { converged = true; iter++; break; }
  }
  const softplus = (e) => (e > 30 ? e + Math.log1p(Math.exp(-e)) : Math.log1p(Math.exp(e)));
  const ll = (beta) => Z.reduce((s, r, i) => { const e = r.reduce((t, v, j) => t + v * beta[j], 0); return s + y[i] * e - softplus(e); }, 0);
  const ybar = mean(y), ll0 = n * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar));
  const eta = Z.map((r) => r.reduce((s, v, j) => s + v * b[j], 0)), mu = eta.map((e) => 1 / (1 + Math.exp(-e)));
  const H = Array.from({ length: q }, () => new Array(q).fill(0));
  for (let i = 0; i < n; i++) { const w = mu[i] * (1 - mu[i]); for (let a = 0; a < q; a++) for (let c = 0; c < q; c++) H[a][c] += w * Z[i][a] * Z[i][c]; }
  const cov = inverse(H) || H.map((r) => r.map(() => NaN));
  const se = cov.map((r, j) => Math.sqrt(r[j]));
  const z = b.map((v, j) => v / se[j]);
  const llm = ll(b);
  const separated = !converged || b.some((v) => Math.abs(v) > 15);
  return { b, se, z, pv: z.map((v) => 2 * phi(-Math.abs(v))), or: b.map(Math.exp), orLo: b.map((v, j) => Math.exp(v - 1.959963984540054 * se[j])), orHi: b.map((v, j) => Math.exp(v + 1.959963984540054 * se[j])), ll: llm, ll0, mcFadden: 1 - llm / ll0, converged, separated, iter, mu };
}
// McFadden R² for every subset of drivers (2^p fits; the page runs this in a Web Worker).
export function logisticDominance(y, X) {
  const p = X[0].length;
  const ybar = mean(y), ll0 = y.length * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar));
  const fn = (m) => { const idx = Array.from({ length: p }, (_, j) => j).filter((j) => m & (1 << j)); if (!idx.length) return 0; const fit = logistic(y, X.map((r) => idx.map((j) => r[j])), { maxIter: 50, tol: 1e-9 }); return 1 - fit.ll / ll0; };
  return p <= MAX_EXACT ? dominance(p, fn) : dominanceSampled(p, fn, { perms: 300 });
}

// ── Correlations with the outcome ──
export function driverCorrelations(y, cols) { return cols.map((c) => { const r = pearson(c, y), n = y.length, t = r * Math.sqrt((n - 2) / (1 - r * r)); return { r, p: tP(t, n - 2) }; }); }

// ── Importance-performance grid ──
// x = mean rating (performance), y = derived importance (share of R²). Lines at the mean of each, so the quadrants
// are relative to these drivers: high importance + low performance = "Fix first"; high + high = "Keep up";
// low + low = "Low priority"; low importance + high performance = "Possible overkill" (Martilla & James 1977).
export function ipa(names, perf, imp) {
  const mx = mean(perf), my = mean(imp);
  return { mx, my, points: names.map((nm, i) => ({ name: nm, x: perf[i], y: imp[i], quad: imp[i] >= my ? (perf[i] < mx ? 'fix' : 'keep') : (perf[i] < mx ? 'low' : 'overkill') })) };
}
export const QUAD = { fix: 'Fix first', keep: 'Keep up', low: 'Low priority', overkill: 'Possible overkill' };

// ── Plain-language summary ──
// Confidence rule (also in confidenceNote): high when n ≥ 200, at least 20 respondents per driver and every VIF under
// 5; low when n < 50, fewer than 10 respondents per driver or any VIF of 10 or more; medium otherwise.
export function driverSummary({ outcome, names, imp, method, fit, vif, n, quads, logisticFit = false }) {
  const p = names.length, order = imp.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const top = order.slice(0, 2), topShare = top.reduce((s, i) => s + imp[i], 0);
  const r2txt = logisticFit ? `McFadden R² = ${f2(fit, 2)}` : `R² = ${f2(fit, 2)}`;
  const headline = `${listAnd(top.map((i) => names[i]))} ${top.length > 1 ? 'are' : 'is'} the strongest driver${top.length > 1 ? 's' : ''} of ${outcome}, accounting for ${fpct(topShare)} of what the drivers explain together (${r2txt}).`;
  const maxV = Math.max(...vif), hiV = names.filter((_, i) => vif[i] >= 5);
  const fix = quads.filter((q) => q.quad === 'fix').map((q) => q.name), over = quads.filter((q) => q.quad === 'overkill').map((q) => q.name);
  const meaning = [
    `Ranking by ${method}: ${order.map((i) => `${names[i]} ${fpct(imp[i])}`).join(', ')}.`,
    logisticFit ? `McFadden's pseudo-R² of ${f2(fit, 2)} is not a share of variance; values of .2 to .4 already indicate a good fit (McFadden 1979).` : `The drivers together explain ${fpct(fit)} of the variation in ${outcome}; the rest comes from things you did not ask about and from noise.`,
    fix.length ? `Fix first (above-average importance, below-average rating): ${listAnd(fix)}.` : 'No driver is both more important and lower rated than average, so there is no obvious "fix first" item.',
  ];
  if (over.length) meaning.push(`Possible overkill (rated well, matters less here): ${listAnd(over)}. Do not cut these without checking they are not hygiene factors people only notice when they fail.`);
  if (hiV.length) meaning.push(`Drivers overlap strongly (VIF ≥ 5: ${listAnd(hiV)}), so their individual regression coefficients are unstable; the relative weights and dominance shares are the safer ranking.`);
  const level = (n < 50 || n / p < 10 || maxV >= 10) ? 'low' : (n >= 200 && n / p >= 20 && maxV < 5) ? 'high' : 'medium';
  const confidenceNote = `Rated from the sample (n = ${n}, ${f2(n / p, 0)} per driver) and the overlap between drivers (largest VIF ${f2(maxV, 1)}). Strong needs n ≥ 200, 20 or more respondents per driver and every VIF under 5; weak if n < 50, fewer than 10 per driver or any VIF of 10 or more.`;
  const caveats = [
    'Importance is not causation: a driver that predicts the outcome may share a cause with it (a generally happy customer rates everything higher). Test changes before investing.',
    'Derived importance depends on which drivers you included; adding or removing one reshuffles the shares, and a missing driver can make others look more important.',
    'Close shares (a few percentage points apart) are not reliably different with this sample; treat the ranking as tiers, not an exact order.',
  ];
  const next = [
    fix.length ? `Look into ${listAnd(fix.slice(0, 2))} with follow-up research (open-ended answers, usability tests) to find what specifically is wrong.` : `Track the top drivers (${listAnd(top.map((i) => names[i]))}) over time alongside ${outcome}.`,
    'Check the strength of individual relationships in [Correlation](/calculators/correlation) and plan an experiment for the change you want to make.',
  ];
  const report = `A key driver analysis of ${outcome} (n = ${n}, ${plural(p, 'driver')}, ${r2txt}) ranked ${listAnd(order.slice(0, 3).map((i) => `${names[i]} (${fpct(imp[i])})`))} highest by ${method}.${fix.length ? ` ${listAnd(fix)} combined above-average importance with below-average ratings.` : ''}`;
  return { headline, meaning: meaning.slice(0, 6), confidence: level, confidenceNote, caveats, next, report };
}
