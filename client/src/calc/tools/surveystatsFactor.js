// Exploratory factor analysis for the "Factor analysis" tool: suitability checks (KMO, Bartlett, determinant, initial
// communalities), how many factors (eigenvalues, Horn's parallel analysis, Velicer's MAP, Kaiser), extraction
// (iterated principal axis, minimum residual, maximum likelihood), rotation (varimax, oblimin, promax), item flags by
// the .40/.30/.20 rule, alpha per factor, polychoric correlations, and the plain-language summary.
// Pure functions; checked against factor_analyzer, pingouin and numpy by server/scripts/check-surveystats.js.
import { cronbach } from '../stats.js';
import {
  eye, zeros, transpose, matMul, inverse, logDet, eigen, sqrtm, corrMatrix, smc, chi2Sf, phi, phiInv, bvnCdf, normalRng,
  minimize, f2, fp, fpct, plural, listAnd,
} from './surveystatsMath.js';

// ── Suitability checks ──
// KMO = Σr² / (Σr² + Σq²) over off-diagonal pairs, q the partial correlations −R⁻¹ᵢⱼ/√(R⁻¹ᵢᵢR⁻¹ⱼⱼ); per item likewise over
// its row. Bartlett: χ² = −(n − 1 − (2p + 5)/6) ln|R| on p(p − 1)/2 df.
export function checks(R, n) {
  const p = R.length, inv = inverse(R), ld = logDet(R);
  const out = { p, n, det: ld.sign > 0 ? Math.exp(ld.log) : 0, logDet: ld.log, singular: !inv || ld.sign <= 0 };
  if (out.singular) return { ...out, kmo: NaN, msa: R.map(() => NaN), bartlett: { chi2: NaN, df: p * (p - 1) / 2, p: NaN }, smc: R.map(() => NaN) };
  const Q = inv.map((r, i) => r.map((v, j) => -v / Math.sqrt(inv[i][i] * inv[j][j])));
  let r2 = 0, q2 = 0; const rs = new Array(p).fill(0), qs = new Array(p).fill(0);
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) { rs[i] += R[i][j] ** 2; qs[i] += Q[i][j] ** 2; }
  for (let i = 0; i < p; i++) { r2 += rs[i]; q2 += qs[i]; }
  const chi2 = -(n - 1 - (2 * p + 5) / 6) * ld.log, df = p * (p - 1) / 2;
  return { ...out, kmo: r2 / (r2 + q2), msa: rs.map((v, i) => v / (v + qs[i])), partial: Q, bartlett: { chi2, df, p: chi2Sf(chi2, df) }, smc: smc(R) };
}
// Kaiser (1974): .90s marvellous, .80s meritorious, .70s middling, .60s mediocre, .50s miserable, below .50 unacceptable.
export const kmoLabel = (k) => (!Number.isFinite(k) ? 'not available' : k >= 0.9 ? 'marvellous' : k >= 0.8 ? 'meritorious' : k >= 0.7 ? 'middling' : k >= 0.6 ? 'mediocre' : k >= 0.5 ? 'miserable' : 'unacceptable');

// ── How many factors ──
export const eigenvalues = (R) => eigen(R).values;
export function reducedEigenvalues(R) { const h = smc(R); if (!h) return null; return eigen(R.map((r, i) => r.map((v, j) => (i === j ? h[i] : v)))).values; }

// Velicer's (1976) minimum average partial test: after removing the first m principal components, the mean squared
// (and, in the 2000 revision, fourth-power) partial correlation; the m with the smallest average is the suggestion.
export function mapTest(R) {
  const p = R.length, { values, vectors } = eigen(R);
  const sq = [], q4 = [];
  for (let m = 0; m < p - 1; m++) {
    let C = R.map((r) => r.slice());
    if (m > 0) for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s = 0; for (let c = 0; c < m; c++) s += vectors[c][i] * vectors[c][j] * values[c]; C[i][j] -= s; }
    const d = C.map((r, i) => r[i]);
    if (d.some((v) => v <= 1e-10)) break;
    let s2 = 0, s4 = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) { const v = C[i][j] / Math.sqrt(d[i] * d[j]); s2 += v * v; s4 += v ** 4; }
    sq.push(s2 / (p * (p - 1))); q4.push(s4 / (p * (p - 1)));
  }
  const argmin = (a) => a.indexOf(Math.min(...a));
  return { avgSq: sq, avg4: q4, k: argmin(sq), k4: argmin(q4) };
}

// Horn's parallel analysis: eigenvalues of correlation matrices of n × p independent normal data, `iters` times.
// Component eigenvalues (of R) and factor eigenvalues (of R with squared multiple correlations on the diagonal).
// Returns the mean and the 95th percentile of each position. Seeded, so the same data give the same answer.
export function parallelSim(n, p, { iters = 500, seed = 2024, onProgress = null } = {}) {
  const z = normalRng(seed), pcs = Array.from({ length: p }, () => []), fas = Array.from({ length: p }, () => []);
  const X = Array.from({ length: p }, () => new Float64Array(n));
  for (let it = 0; it < iters; it++) {
    for (let j = 0; j < p; j++) { const c = X[j]; let m = 0; for (let i = 0; i < n; i++) { c[i] = z(); m += c[i]; } m /= n; let ss = 0; for (let i = 0; i < n; i++) { c[i] -= m; ss += c[i] * c[i]; } const s = Math.sqrt(ss); for (let i = 0; i < n; i++) c[i] /= s; }
    const R = eye(p);
    for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) { let s = 0; const xa = X[a], xb = X[b]; for (let i = 0; i < n; i++) s += xa[i] * xb[i]; R[a][b] = R[b][a] = s; }
    eigen(R).values.forEach((v, k) => pcs[k].push(v));
    const fe = reducedEigenvalues(R); if (fe) fe.forEach((v, k) => fas[k].push(v));
    if (onProgress && it % 25 === 0) onProgress(it / iters);
  }
  const q = (xs, pr) => { const s = [...xs].sort((a, b) => a - b); const h = (s.length - 1) * pr, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); };
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { iters, n, p, pcaMean: pcs.map(avg), pca95: pcs.map((x) => q(x, 0.95)), faMean: fas.map(avg), fa95: fas.map((x) => q(x, 0.95)) };
}
// Retain factors while the observed eigenvalue beats the simulated one, stopping at the first that does not.
export function parallelK(observed, simulated) { let k = 0; while (k < observed.length && observed[k] > simulated[k]) k++; return k; }

// ── Extraction ──
// Principal axis factoring, iterated as SPSS FACTOR does: start from squared multiple correlations, put the
// communalities on the diagonal, take the first k eigenvectors × √eigenvalue, recompute communalities, repeat until
// no communality changes by more than `tol` (SPSS: 25 iterations, .001).
export function paf(R, k, { maxIter = 25, tol = 0.001 } = {}) {
  const p = R.length; let h = smc(R) || R.map((r, i) => Math.max(...r.filter((_, j) => j !== i).map(Math.abs)));
  let L = null, iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    const { values, vectors } = eigen(R.map((r, i) => r.map((v, j) => (i === j ? h[i] : v))));
    L = Array.from({ length: p }, (_, i) => Array.from({ length: k }, (__, c) => vectors[c][i] * Math.sqrt(Math.max(values[c], 0))));
    const next = L.map((r) => r.reduce((s, v) => s + v * v, 0));
    const diff = Math.max(...next.map((v, i) => Math.abs(v - h[i])));
    h = next;
    if (diff < tol) { converged = true; iter++; break; }
  }
  return { L, iter, converged };
}
function ulsFG(psi, R, k) {
  const p = R.length, { values, vectors } = eigen(R.map((r, i) => r.map((v, j) => (i === j ? 1 - psi[i] : v))));
  let f = 0; for (let j = k; j < p; j++) f += values[j] ** 2;
  for (let j = 0; j < k; j++) if (values[j] < 0) f += values[j] ** 2;
  const g = psi.map((ps, i) => { let m = 0; for (let c = 0; c < k; c++) m += vectors[c][i] ** 2 * Math.max(values[c], 0); return -2 * (1 - ps - m); });
  return { f, g };
}
// Jöreskog's ML discrepancy as in R's factanal: with S* = Ψ^-½ R Ψ^-½, F(Ψ) = −Σⱼ>ₖ(ln θⱼ − θⱼ) − k + p.
function mlFG(psi, R, k) {
  const p = R.length, s = psi.map((v) => 1 / Math.sqrt(v));
  const { values, vectors } = eigen(R.map((r, i) => r.map((v, j) => v * s[i] * s[j])));
  let f = 0; for (let j = k; j < p; j++) f -= Math.log(values[j]) - values[j]; f += k - p;
  const g = psi.map((ps, i) => { let m = 0; for (let c = 0; c < k; c++) m += vectors[c][i] ** 2 * Math.max(values[c] - 1, 0); m *= ps; return (m + ps - 1) / (ps * ps); });
  return { f, g };
}
export function minresOrMl(R, k, method = 'minres') {
  const p = R.length, h = smc(R) || R.map(() => 0.5);
  const start = h.map((v) => Math.min(0.995, Math.max(0.005, 1 - v)));
  const fg = method === 'ml' ? (x) => mlFG(x, R, k) : (x) => ulsFG(x, R, k);
  const res = minimize(fg, start, { lo: new Array(p).fill(0.005), hi: new Array(p).fill(1), maxIter: 2000, gtol: 1e-10 });
  const psi = res.x;
  let L;
  if (method === 'ml') {
    const s = psi.map((v) => 1 / Math.sqrt(v)), { values, vectors } = eigen(R.map((r, i) => r.map((v, j) => v * s[i] * s[j])));
    L = Array.from({ length: p }, (_, i) => Array.from({ length: k }, (__, c) => Math.sqrt(psi[i]) * vectors[c][i] * Math.sqrt(Math.max(values[c] - 1, 0))));
  } else {
    const { values, vectors } = eigen(R.map((r, i) => r.map((v, j) => (i === j ? 1 - psi[i] : v))));
    L = Array.from({ length: p }, (_, i) => Array.from({ length: k }, (__, c) => vectors[c][i] * Math.sqrt(Math.max(values[c], 0))));
  }
  return { L, psi, F: res.f, iter: res.iter, converged: res.converged };
}

// ── Rotation ──
const colSq = (A) => A[0].map((_, c) => A.reduce((s, r) => s + r[c] ** 2, 0));
// Polar factor U·Vᵀ of a small square matrix M (from its SVD), and the sum of its singular values.
function polar(M) { const MtM = matMul(transpose(M), M), S = sqrtm(MtM), Si = sqrtm(MtM, true); return { Q: matMul(M, Si), d: S.reduce((s, r, i) => s + r[i], 0) }; }
// Varimax with Kaiser normalisation (Kaiser 1958), the SVD algorithm used by R and factor_analyzer.
export function varimax(A, { normalize = true, tol = 1e-12, maxIter = 1000 } = {}) {
  const p = A.length, k = A[0].length; if (k < 2) return { L: A.map((r) => r.slice()), T: eye(k) };
  const w = A.map((r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0)) || 1);
  const X = normalize ? A.map((r, i) => r.map((v) => v / w[i])) : A.map((r) => r.slice());
  let T = eye(k), d = 0;
  for (let it = 0; it < maxIter; it++) {
    const B = matMul(X, T), cs = colSq(B);
    const G = matMul(transpose(X), B.map((r) => r.map((v, c) => v ** 3 - v * cs[c] / p)));
    const { Q, d: dn } = polar(G); T = Q;
    const old = d; d = dn; if (d < old * (1 + tol)) break;
  }
  const L = matMul(X, T).map((r, i) => (normalize ? r.map((v) => v * w[i]) : r));
  return { L, T };
}
// Direct oblimin with γ = 0 (quartimin), by the gradient projection algorithm of Bernaards & Jennrich (2005).
export function oblimin(A, { tol = 1e-8, maxIter = 5000 } = {}) {
  const k = A[0].length; if (k < 2) return { L: A.map((r) => r.slice()), T: eye(k), Phi: eye(k) };
  const crit = (L) => { const L2 = L.map((r) => r.map((v) => v * v)); const X = L2.map((r) => r.map((_, c) => r.reduce((s, v, j) => s + (j === c ? 0 : v), 0))); return { f: L2.reduce((s, r, i) => s + r.reduce((t, v, c) => t + v * X[i][c], 0), 0) / 4, G: L.map((r, i) => r.map((v, c) => v * X[i][c])) }; };
  const rotOf = (T) => { const Ti = inverse(T); return Ti ? matMul(A, transpose(Ti)) : null; };
  const gradT = (L, Gq, T) => transpose(matMul(matMul(transpose(L), Gq), inverse(T))).map((r) => r.map((v) => -v));
  let T = eye(k), L = rotOf(T), c = crit(L), G = gradT(L, c.G, T), al = 1;
  let it = 0;
  for (; it < maxIter; it++) {
    const cs = T[0].map((_, j) => T.reduce((s, r, i) => s + r[j] * G[i][j], 0));
    const Gp = G.map((r, i) => r.map((v, j) => v - T[i][j] * cs[j]));
    const s = Math.sqrt(Gp.flat().reduce((a, v) => a + v * v, 0));
    if (s < tol) break;
    al *= 2; let Tt = T, Lt = L, ct = c;
    for (let i = 0; i <= 10; i++) {
      const X = T.map((r, a) => r.map((v, b) => v - al * Gp[a][b]));
      const v = X[0].map((_, j) => 1 / Math.sqrt(X.reduce((t, r) => t + r[j] ** 2, 0)));
      Tt = X.map((r) => r.map((x, j) => x * v[j])); Lt = rotOf(Tt); ct = crit(Lt);
      if (c.f - ct.f > 0.5 * s * s * al) break;
      al /= 2;
    }
    T = Tt; L = Lt; c = ct; G = gradT(L, c.G, T);
  }
  return { L, T, Phi: matMul(transpose(T), T), iter: it };
}
// Promax (Hendrickson & White 1964) with power 4 and Kaiser normalisation, as SPSS and factor_analyzer do it.
export function promax(A, { power = 4 } = {}) {
  const k = A[0].length; if (k < 2) return { L: A.map((r) => r.slice()), Phi: eye(k) };
  const h = A.map((r) => Math.sqrt(r.reduce((s, v) => s + v * v, 0)) || 1);
  const W = A.map((r, i) => r.map((v) => v / h[i]));
  const { L: X } = varimax(W);
  const Y = X.map((r) => r.map((v) => v * Math.abs(v) ** (power - 1)));
  const Xt = transpose(X);
  let coef = matMul(inverse(matMul(Xt, X)), matMul(Xt, Y));
  const dInv = inverse(matMul(transpose(coef), coef));
  coef = coef.map((r) => r.map((v, j) => v * Math.sqrt(dInv[j][j])));
  const L = matMul(X, coef).map((r, i) => r.map((v) => v * h[i]));
  const ci = inverse(coef);
  return { L, Phi: matMul(ci, transpose(ci)) };
}

// ── The whole analysis for k factors ──
// R: correlation matrix; n: respondents; method 'paf' | 'minres' | 'ml'; rotation 'none' | 'varimax' | 'oblimin' | 'promax'.
export function efa(R, n, k, { method = 'minres', rotation = 'oblimin', pafIter = 25 } = {}) {
  const p = R.length;
  const ext = method === 'paf' ? paf(R, k, { maxIter: pafIter }) : minresOrMl(R, k, method);
  const unrot = ext.L;
  const h2 = unrot.map((r) => r.reduce((s, v) => s + v * v, 0));
  let pattern = unrot.map((r) => r.slice()), Phi = null;
  if (k > 1 && rotation === 'varimax') pattern = varimax(unrot).L;
  else if (k > 1 && rotation === 'oblimin') ({ L: pattern, Phi } = oblimin(unrot));
  else if (k > 1 && rotation === 'promax') ({ L: pattern, Phi } = promax(unrot));
  // Signs: each factor's loadings sum to a positive number. Order: by sum of squared pattern loadings, largest first.
  const sign = pattern[0].map((_, c) => (pattern.reduce((s, r) => s + r[c], 0) < 0 ? -1 : 1));
  pattern = pattern.map((r) => r.map((v, c) => v * sign[c]));
  if (Phi) Phi = Phi.map((r, a) => r.map((v, b) => v * sign[a] * sign[b]));
  const ss = colSq(pattern), order = ss.map((v, c) => [v, c]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  pattern = pattern.map((r) => order.map((c) => r[c]));
  if (Phi) Phi = order.map((a) => order.map((b) => Phi[a][b]));
  const structure = Phi ? matMul(pattern, Phi) : pattern.map((r) => r.slice());
  const ssOrdered = order.map((c) => ss[c]);
  const unrotSS = colSq(unrot);
  // Residual correlations: observed minus reproduced (ΛΦΛᵀ), off the diagonal.
  const rep = matMul(matMul(pattern, Phi || eye(k)), transpose(pattern));
  const resid = []; for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) resid.push(R[i][j] - rep[i][j]);
  const rmsr = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / Math.max(1, resid.length));
  const out = {
    k, method, rotation: k > 1 ? rotation : 'none', oblique: !!Phi, unrotated: unrot, pattern, structure, Phi, h2, u2: h2.map((v) => 1 - v),
    ss: ssOrdered, propVar: ssOrdered.map((v) => v / p), unrotSS, unrotProp: unrotSS.map((v) => v / p), totalCommon: h2.reduce((a, b) => a + b, 0) / p,
    rmsr, bigResid: resid.filter((v) => Math.abs(v) > 0.05).length / Math.max(1, resid.length),
    heywood: h2.map((v, i) => (v >= 0.995 ? i : -1)).filter((i) => i >= 0), iter: ext.iter, converged: ext.converged,
  };
  if (method === 'ml') {
    const df = ((p - k) ** 2 - (p + k)) / 2, stat = (n - 1 - (2 * p + 5) / 6 - (2 * k) / 3) * ext.F;
    out.mlTest = { chi2: stat, df, p: df > 0 ? chi2Sf(stat, df) : NaN };
  }
  return out;
}

// ── Item flags: the .40/.30/.20 rule ──
// Keep an item when its main loading is at least .40, no other loading reaches .30, and the main loading beats the
// next by at least .20 (e.g. Howard 2016). Assignment uses the pattern matrix.
export function itemFlags(pattern, { primary = 0.4, cross = 0.3, gap = 0.2 } = {}) {
  return pattern.map((r) => {
    const abs = r.map(Math.abs), order = abs.map((v, c) => [v, c]).sort((a, b) => b[0] - a[0]);
    const [top, f] = order[0], second = order[1] ? order[1][0] : 0;
    const flags = [];
    if (top < primary) flags.push('weak');
    if (order.length > 1 && second >= cross) flags.push('cross');
    if (order.length > 1 && top - second < gap) flags.push('close');
    return { factor: f, top, second, sign: Math.sign(r[f]) || 1, flags, clean: flags.length === 0 };
  });
}
// Rows ordered by main factor, then by loading size, for the sorted loadings table.
export const sortedOrder = (pattern, flags) => pattern.map((_, i) => i).sort((a, b) => flags[a].factor - flags[b].factor || flags[b].top - flags[a].top);

// Cronbach's alpha per factor (stats.js), using the items whose main loading on it is at least .40; items loading
// negatively are reverse-scored first. With only a correlation matrix, standardised alpha kr̄/(1 + (k − 1)r̄).
export function alphaPerFactor({ X = null, R }, flags, k, minLoad = 0.4) {
  return Array.from({ length: k }, (_, f) => {
    const items = flags.map((fl, i) => (fl.factor === f && fl.top >= minLoad ? i : -1)).filter((i) => i >= 0);
    if (items.length < 2) return { items, alpha: NaN };
    if (X) {
      const lo = items.map((i) => Math.min(...X.map((r) => r[i]))), hi = items.map((i) => Math.max(...X.map((r) => r[i])));
      const rows = X.map((r) => items.map((i, t) => (flags[i].sign < 0 ? lo[t] + hi[t] - r[i] : r[i])));
      const c = cronbach(rows);
      return { items, alpha: c.alpha, lo: c.lo, hi: c.hi, reversed: items.filter((i) => flags[i].sign < 0) };
    }
    let s = 0, m = 0; for (const a of items) for (const b of items) if (a < b) { s += R[a][b] * flags[a].sign * flags[b].sign; m++; }
    const rbar = s / m, kk = items.length;
    return { items, alpha: kk * rbar / (1 + (kk - 1) * rbar), standardised: true, reversed: items.filter((i) => flags[i].sign < 0) };
  });
}

// ── Polychoric correlations (two-step: thresholds from the margins, then ρ by maximum likelihood) ──
function thresholds(cats, L) {
  const n = cats.length, cnt = new Array(L).fill(0); for (const c of cats) cnt[c]++;
  const out = []; let cum = 0; for (let t = 0; t < L - 1; t++) { cum += cnt[t]; out.push(cum <= 0 ? -Infinity : cum >= n ? Infinity : phiInv(cum / n)); }
  return out;
}
// a, b: category positions 0..L−1 (unused levels are dropped first).
export function polychoric(a, b) {
  const relabel = (xs) => { const lv = [...new Set(xs)].sort((x, y) => x - y), m = new Map(lv.map((v, i) => [v, i])); return { v: xs.map((x) => m.get(x)), L: lv.length }; };
  const A = relabel(a), B = relabel(b);
  if (A.L < 2 || B.L < 2) return { rho: NaN };
  const ta = [-Infinity, ...thresholds(A.v, A.L), Infinity], tb = [-Infinity, ...thresholds(B.v, B.L), Infinity];
  const N = Array.from({ length: A.L }, () => new Array(B.L).fill(0)); A.v.forEach((x, i) => { N[x][B.v[i]]++; });
  const cdf = (h, k, r) => (h === -Infinity || k === -Infinity ? 0 : h === Infinity ? (k === Infinity ? 1 : phi(k)) : k === Infinity ? phi(h) : bvnCdf(h, k, r));
  const ll = (r) => {
    let s = 0;
    for (let i = 0; i < A.L; i++) for (let j = 0; j < B.L; j++) {
      if (!N[i][j]) continue;
      const pr = cdf(ta[i + 1], tb[j + 1], r) - cdf(ta[i], tb[j + 1], r) - cdf(ta[i + 1], tb[j], r) + cdf(ta[i], tb[j], r);
      s += N[i][j] * Math.log(Math.max(pr, 1e-300));
    }
    return s;
  };
  // Golden-section search on (−1, 1), then a parabolic polish.
  let lo = -0.9999, hi = 0.9999; const g = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo), f1 = ll(x1), f2v = ll(x2);
  for (let it = 0; it < 80 && hi - lo > 1e-10; it++) {
    if (f1 > f2v) { hi = x2; x2 = x1; f2v = f1; x1 = hi - g * (hi - lo); f1 = ll(x1); } else { lo = x1; x1 = x2; f1 = f2v; x2 = lo + g * (hi - lo); f2v = ll(x2); }
  }
  return { rho: (lo + hi) / 2, thresholdsA: ta.slice(1, -1), thresholdsB: tb.slice(1, -1), table: N };
}
// Polychoric matrix; smoothed to the nearest positive-definite correlation matrix (eigenvalues floored) if needed.
export function polychoricMatrix(cats) {
  const p = cats.length, R = eye(p);
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) { const r = polychoric(cats[i], cats[j]).rho; R[i][j] = R[j][i] = Number.isFinite(r) ? r : 0; }
  const { values, vectors } = eigen(R);
  if (values[values.length - 1] > 1e-6) return { R, smoothed: false };
  const fl = values.map((v) => Math.max(v, 1e-6)), S = zeros(p, p);
  fl.forEach((l, c) => { for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) S[i][j] += l * vectors[c][i] * vectors[c][j]; });
  const d = S.map((r, i) => Math.sqrt(r[i]));
  return { R: S.map((r, i) => r.map((v, j) => (i === j ? 1 : v / (d[i] * d[j])))), smoothed: true };
}

// ── Reading a pasted correlation matrix (header row of names; optional label column) ──
export function parseCorrMatrix(table) {
  const { headers, rows } = table;
  const num = (v) => { const x = Number(String(v).trim()); return Number.isFinite(x) ? x : NaN; };
  const labelled = rows.length && !Number.isFinite(num(rows[0][0]));
  const names = labelled ? headers.slice(1) : headers;
  const R = rows.map((r) => (labelled ? r.slice(1) : r).map(num));
  const p = names.length;
  if (R.length !== p || R.some((r) => r.length < p)) return { error: `A correlation matrix needs as many rows as columns (${p} names, ${R.length} rows).` };
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
    if (i === j && Number.isNaN(R[i][j])) R[i][j] = 1;
    if (Number.isNaN(R[i][j]) && Number.isFinite(R[j][i])) R[i][j] = R[j][i];
  }
  if (R.flat().some((v) => !Number.isFinite(v))) return { error: 'Every cell of the matrix must be a number (the upper or lower triangle alone is fine).' };
  if (R.some((r, i) => Math.abs(r[i] - 1) > 1e-6)) return { error: 'The diagonal of a correlation matrix must be 1.' };
  if (R.some((r, i) => r.some((v, j) => Math.abs(v - R[j][i]) > 1e-6 || Math.abs(v) > 1))) return { error: 'The matrix must be symmetric with values between −1 and 1.' };
  return { names, R: R.map((r) => r.slice(0, p)) };
}
export { corrMatrix };

// ── Plain-language summary ──
// Confidence rule (also stated in confidenceNote): high when n ≥ 200, KMO ≥ .80, every factor has at least three
// cleanly loading items, k agrees with parallel analysis and no item is a Heywood case; low when n < 100, KMO < .60,
// any factor has fewer than two clean items or there is a Heywood case; medium otherwise.
export function faSummary({ chk, k, kPA, kMAP, r, flags, alphas, names, factorNames = [], source = 'data' }) {
  const p = names.length;
  const fname = (f) => (factorNames[f] && factorNames[f].trim() ? `"${factorNames[f].trim()}"` : `Factor ${f + 1}`);
  const clean = flags.filter((f) => f.clean).length;
  const perFactor = Array.from({ length: k }, (_, f) => flags.filter((x) => x.clean && x.factor === f).length);
  const weak = flags.map((f, i) => (f.flags.includes('weak') ? names[i] : null)).filter(Boolean);
  const cross = flags.map((f, i) => (f.clean || f.flags.includes('weak') ? null : names[i])).filter(Boolean);
  const lowH2 = r.h2.map((h, i) => (h < 0.4 ? names[i] : null)).filter(Boolean);
  const explained = r.totalCommon;
  const headline = `${plural(k, 'factor')} extracted${kPA === k ? ' (as parallel analysis suggests)' : `, though parallel analysis suggests ${kPA}`}: together they account for ${fpct(explained)} of the items' variance, and ${clean} of ${p} items load cleanly on one factor.`;
  const meaning = [];
  meaning.push(`Sampling adequacy: KMO = ${f2(chk.kmo)} (${kmoLabel(chk.kmo)} on Kaiser's 1974 scale, where .60 is the usual minimum)${Number.isFinite(chk.bartlett.p) ? `; Bartlett's test χ²(${chk.bartlett.df}) = ${f2(chk.bartlett.chi2, 1)}, p ${fp(chk.bartlett.p)}, ${chk.bartlett.p < 0.05 ? 'so the items are correlated enough to factor' : 'so the items may be too unrelated to factor'}` : ''}.`);
  meaning.push(`How many factors: parallel analysis suggests ${kPA}${Number.isFinite(kMAP) ? `, Velicer's MAP test ${kMAP}` : ''}. When the methods disagree, look at both solutions and keep the one whose factors make sense.`);
  meaning.push(`Per factor: ${perFactor.map((c, f) => `${fname(f)} has ${plural(c, 'clean item')}${Number.isFinite(alphas[f]?.alpha) ? ` (alpha ${f2(alphas[f].alpha)})` : ''}`).join('; ')}.`);
  if (weak.length || cross.length) meaning.push(`Items to review by the .40/.30/.20 rule: ${[...weak.map((w) => `${w} (weak, main loading under .40)`), ...cross.map((c) => `${c} (loads on more than one factor)`)].slice(0, 6).join('; ')}.`);
  if (r.oblique && k > 1) { const off = []; for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) off.push(Math.abs(r.Phi[a][b])); const mx = Math.max(...off); meaning.push(`The factors correlate up to r = ${f2(mx)}${mx < 0.32 ? ', low enough that an orthogonal rotation (varimax) would give much the same picture (Tabachnick & Fidell suggest .32 as the cut-off)' : ', so keep an oblique rotation and read the pattern matrix'}.`); }
  if (lowH2.length) meaning.push(`Low communality (under .40): ${listAnd(lowH2.slice(0, 5))}${lowH2.length > 5 ? ' and others' : ''}. These items share little with the rest and are candidates to drop or rewrite.`);
  const n = chk.n, minClean = Math.min(...perFactor);
  const level = (n < 100 || chk.kmo < 0.6 || minClean < 2 || r.heywood.length) ? 'low' : (n >= 200 && chk.kmo >= 0.8 && minClean >= 3 && kPA === k) ? 'high' : 'medium';
  const confidenceNote = `Rated from the sample (n = ${n}), KMO (${f2(chk.kmo)}), the smallest number of clean items on a factor (${minClean}) and whether k matches parallel analysis. Strong needs n ≥ 200, KMO ≥ .80, at least three clean items per factor, k as parallel analysis suggests and no Heywood case; weak if n < 100, KMO < .60, a factor with fewer than two clean items or a Heywood case.`;
  const caveats = [
    'Factors are patterns in these answers, not proven constructs. Names are your interpretation; confirm the structure with a confirmatory factor analysis on a fresh sample before treating it as a validated scale.',
    source === 'data' ? 'Pearson correlations of 5-point items understate the true relationships, more so for skewed items; the polychoric option corrects this but needs a larger sample.' : 'Results from a correlation matrix cannot check missing data, outliers or item distributions; look at the raw data where you can.',
    'Do not choose k by the "eigenvalue above 1" (Kaiser) rule alone: it routinely keeps too many factors. Parallel analysis is the better guide.',
  ];
  const next = [
    'Confirm the structure on new data and check convergent and discriminant validity in the [Scale validity](/calculators/scale-validity) tool.',
    'Check each factor\'s reliability with the items you keep in [Scale reliability](/calculators/reliability).',
    weak.length || cross.length ? `Rewrite or drop the flagged items (${listAnd([...weak, ...cross].slice(0, 3))}), then rerun; drop one item at a time.` : 'Write a one-line definition for each factor from its highest-loading items before naming it.',
  ];
  const rotTxt = r.rotation === 'none' ? 'no rotation' : `${r.rotation} rotation`;
  const report = `An exploratory factor analysis (${{ paf: 'principal axis factoring', minres: 'minimum residual', ml: 'maximum likelihood' }[r.method]}, ${rotTxt}) of ${p} items from ${n} respondents (KMO = ${f2(chk.kmo)}${Number.isFinite(chk.bartlett.p) ? `; Bartlett's χ²(${chk.bartlett.df}) = ${f2(chk.bartlett.chi2, 1)}, p ${fp(chk.bartlett.p)}` : ''}) retained ${plural(k, 'factor')}, as parallel analysis suggested ${kPA}. The factors accounted for ${fpct(explained)} of the variance; ${clean} of ${p} items met the .40/.30/.20 loading criteria.`;
  return { headline, meaning: meaning.slice(0, 6), confidence: level, confidenceNote, caveats, next, report };
}
