// Conjoint studio, part 3: hierarchical Bayes multinomial logit and MCMC convergence diagnostics.
// The sampler follows Allenby and Rossi's random-walk Metropolis-within-Gibbs scheme as implemented in bayesm's
// rhierMnlRwMixture with one normal component (Rossi, Allenby and McCulloch 2005, Bayesian Statistics and Marketing):
//   β_i ~ N(b̄, V);  b̄ | V ~ N(0, V / A) with A = 0.01;  V ~ IW(ν = K + 3, ν I).
// Each iteration: (1) draw (b̄, V) given all β_i from the conjugate normal–inverse-Wishart posterior (bayesm's
// rmultireg with a column of ones); (2) for each respondent, one Metropolis-Hastings step for β_i with proposal
// β* = β_i + s · N(0, (H_i + V⁻¹)⁻¹), s = 2.93/√K, where H_i is the information of i's own likelihood at the
// maximum of the "fractional" likelihood (1 − w) ℓ_i(β) + w (n_i/N) log N(β | β_pooled, H_pooled⁻¹), w = 0.1.
// Pure and synchronous so it runs in a Web Worker in the browser and in Node for the checks.
import { rng, chol, cholInv, invSPD } from './conjoint-core.js';
import { mnlEval, mnlLL, fitMNL } from './conjoint-models.js';

// In-place Cholesky and triangular solve for the per-respondent proposal (no allocation in the inner loop).
function cholInto(A, K, L) {
  for (let i = 0; i < K; i++) for (let j = 0; j <= i; j++) {
    let v = A[i * K + j]; for (let k = 0; k < j; k++) v -= L[i * K + k] * L[j * K + k];
    if (i === j) L[i * K + i] = Math.sqrt(Math.max(v, 1e-12)); else L[i * K + j] = v / L[j * K + j];
  }
}
function solveLTInto(L, K, z, x) {
  for (let i = K - 1; i >= 0; i--) { let v = z[i]; for (let k = i + 1; k < K; k++) v -= L[k * K + i] * x[k]; x[i] = v / L[i * K + i]; }
}
function lndMvnQuad(beta, mean, prec, K) {
  let q = 0; for (let a = 0; a < K; a++) { const da = beta[a] - mean[a]; for (let b = 0; b < K; b++) q += da * prec[a * K + b] * (beta[b] - mean[b]); }
  return -0.5 * q;
}
// Draw V ~ IW(nu, S) via Bartlett: W ~ Wishart(nu, S⁻¹), V = W⁻¹.
export function rInvWishart(nu, S, K, r) {
  const Sinv = invSPD(S, K); const Lc = chol(Sinv, K);
  const A = new Float64Array(K * K);
  for (let i = 0; i < K; i++) { A[i * K + i] = Math.sqrt(2 * r.gamma((nu - i) / 2)); for (let j = 0; j < i; j++) A[i * K + j] = r.normal(); }
  const LA = new Float64Array(K * K);
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { let s = 0; for (let k = 0; k < K; k++) s += Lc[i * K + k] * A[k * K + j]; LA[i * K + j] = s; }
  const W = new Float64Array(K * K);
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { let s = 0; for (let k = 0; k < K; k++) s += LA[i * K + k] * LA[j * K + k]; W[i * K + j] = s; }
  return invSPD(W, K, 1e-10);
}

export function runHB(S, opts = {}, onProgress = null) {
  const K = S.K, n = S.nResp;
  const { R = 20000, burn = Math.floor(R / 2), thin = 10, seed = 1, w = 0.1, A = 0.01 } = opts;
  const s = opts.s ?? 2.93 / Math.sqrt(K); const nu = opts.nu ?? K + 3;
  const r = rng(seed);
  // Pooled MLE and its information, then each respondent's fractional-likelihood maximum and information.
  const pooled = fitMNL(S, { ridge: 1e-6 });
  const bp = Float64Array.from(pooled.beta), Hp = pooled.info;
  const H = []; const Ntot = S.nSets;
  for (let i = 0; i < n; i++) {
    const a = S.respStart[i], b = S.respStart[i + 1]; const wgt = (b - a) / Ntot;
    let beta = Float64Array.from(bp);
    const fll = (bb) => (1 - w) * mnlEval(S, bb, { from: a, to: b }) + w * wgt * lndMvnQuad(bb, bp, Hp, K);
    let cur = fll(beta);
    for (let it = 0; it < 50; it++) {
      const g = new Float64Array(K), Hi = new Float64Array(K * K);
      mnlEval(S, beta, { from: a, to: b, grad: g, hess: Hi });
      for (let k = 0; k < K; k++) { g[k] *= 1 - w; for (let l = 0; l < K; l++) { g[k] -= w * wgt * Hp[k * K + l] * (beta[l] - bp[l]); Hi[k * K + l] = (1 - w) * Hi[k * K + l] + w * wgt * Hp[k * K + l]; } }
      const Lc = chol(Hi, K); if (!Lc) break;
      const inv = cholInv(Lc, K); const d = new Float64Array(K);
      for (let k = 0; k < K; k++) for (let l = 0; l < K; l++) d[k] += inv[k * K + l] * g[l];
      let t = 1, next, nv;
      for (let h = 0; h < 30; h++) { next = beta.map((v, k) => v + t * d[k]); nv = fll(next); if (nv >= cur - 1e-12) break; t /= 2; }
      const ch = nv - cur; beta = next; cur = nv; if (Math.abs(ch) < 1e-10) break;
    }
    const Hi = new Float64Array(K * K); mnlEval(S, beta, { from: a, to: b, hess: Hi });
    H.push(Hi);
  }

  // Chain state: bayesm starts the individual betas at 0.
  const betas = Array.from({ length: n }, () => new Float64Array(K));
  const llCur = new Float64Array(n);
  for (let i = 0; i < n; i++) llCur[i] = mnlLL(S, betas[i], S.respStart[i], S.respStart[i + 1]);
  let bbar = new Float64Array(K), V = new Float64Array(K * K); for (let k = 0; k < K; k++) V[k * K + k] = 1;
  const nKeep = Math.floor((R - burn) / thin);
  const traceEvery = thin; const nTrace = Math.floor(R / traceEvery);
  const trace = { bbar: Array.from({ length: K }, () => new Float64Array(nTrace)), ll: new Float64Array(nTrace), acc: new Float64Array(nTrace), sd: Array.from({ length: K }, () => new Float64Array(nTrace)) };
  const kept = []; const sumB = Array.from({ length: n }, () => new Float64Array(K)), sumB2 = Array.from({ length: n }, () => new Float64Array(K));
  const sumV = new Float64Array(K * K); let accAll = 0, accWin = 0, nWin = 0, accKept = 0, nAccKept = 0;
  const z = new Float64Array(K), P = new Float64Array(K * K), Lp = new Float64Array(K * K), inc = new Float64Array(K);
  for (let rep = 0; rep < R; rep++) {
    // (1) b̄, V | betas: Y = 1 b̄ᵀ + U, prior b̄ ~ N(0, V/A), V ~ IW(nu, nu I).
    const At = n + A; const Bt = new Float64Array(K);
    for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) Bt[k] += betas[i][k] / At;
    const Sm = new Float64Array(K * K);
    for (let i = 0; i < n; i++) for (let a = 0; a < K; a++) { const da = betas[i][a] - Bt[a]; for (let b = 0; b <= a; b++) Sm[a * K + b] += da * (betas[i][b] - Bt[b]); }
    for (let a = 0; a < K; a++) for (let b = 0; b <= a; b++) { Sm[a * K + b] += A * Bt[a] * Bt[b] + (a === b ? nu : 0); Sm[b * K + a] = Sm[a * K + b]; }
    V = rInvWishart(nu + n, Sm, K, r);
    const LV = chol(V, K);
    for (let k = 0; k < K; k++) z[k] = r.normal();
    bbar = new Float64Array(K);
    for (let a = 0; a < K; a++) { let sum = 0; for (let b = 0; b <= a; b++) sum += LV[a * K + b] * z[b]; bbar[a] = Bt[a] + sum / Math.sqrt(At); }
    const Vinv = cholInv(LV, K);
    // (2) β_i | b̄, V, data: one random-walk Metropolis-Hastings step each.
    let acc = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K * K; k++) P[k] = H[i][k] + Vinv[k];
      cholInto(P, K, Lp); for (let k = 0; k < K; k++) z[k] = r.normal();
      solveLTInto(Lp, K, z, inc); const cand = new Float64Array(K);
      for (let k = 0; k < K; k++) cand[k] = betas[i][k] + s * inc[k];
      const llC = mnlLL(S, cand, S.respStart[i], S.respStart[i + 1]);
      const lpC = llC + lndMvnQuad(cand, bbar, Vinv, K), lpO = llCur[i] + lndMvnQuad(betas[i], bbar, Vinv, K);
      if (Math.log(r() || 1e-300) < lpC - lpO) { betas[i] = cand; llCur[i] = llC; acc++; }
    }
    const rate = acc / n; accAll += rate; accWin += rate; nWin++;
    if (rep >= burn) { accKept += rate; nAccKept++; }
    if ((rep + 1) % traceEvery === 0) {
      const t = (rep + 1) / traceEvery - 1; let llSum = 0; for (let i = 0; i < n; i++) llSum += llCur[i];
      for (let k = 0; k < K; k++) { trace.bbar[k][t] = bbar[k]; trace.sd[k][t] = Math.sqrt(V[k * K + k]); }
      trace.ll[t] = llSum; trace.acc[t] = accWin / nWin; accWin = 0; nWin = 0;
    }
    if (rep >= burn && (rep - burn + 1) % thin === 0) {
      kept.push(Array.from(bbar));
      for (let i = 0; i < n; i++) for (let k = 0; k < K; k++) { sumB[i][k] += betas[i][k]; sumB2[i][k] += betas[i][k] ** 2; }
      for (let k = 0; k < K * K; k++) sumV[k] += V[k];
    }
    if (onProgress && (rep + 1) % Math.max(1, Math.floor(R / 100)) === 0) onProgress((rep + 1) / R);
  }
  const nk = Math.max(1, kept.length);
  const betaMean = sumB.map((v) => Array.from(v, (x) => x / nk));
  const betaSd = sumB2.map((v, i) => Array.from(v, (x, k) => Math.sqrt(Math.max(0, x / nk - betaMean[i][k] ** 2))));
  const Vmean = Array.from(sumV, (x) => x / nk);
  const bbarMean = Array.from({ length: K }, (_, k) => kept.reduce((sum, d) => sum + d[k], 0) / nk);
  const bbarCI = Array.from({ length: K }, (_, k) => { const x = kept.map((d) => d[k]).sort((a, b) => a - b); return [qs(x, 0.025), qs(x, 0.975)]; });
  const diag = Array.from({ length: K }, (_, k) => { const x = kept.map((d) => d[k]); return { rhat: splitRhat(x), ess: essGeyer(x), geweke: geweke(x) }; });
  const llKept = Array.from(trace.ll.slice(Math.floor(burn / traceEvery)));
  return {
    K, n, R, burn, thin, s, nKept: kept.length, pooled: pooled.beta, betaMean, betaSd, bbarMean, bbarCI, Vmean, draws: kept,
    trace: { bbar: trace.bbar.map((x) => Array.from(x)), sd: trace.sd.map((x) => Array.from(x)), ll: Array.from(trace.ll), acc: Array.from(trace.acc), every: traceEvery },
    acceptance: accKept / Math.max(1, nAccKept), acceptanceAll: accAll / R, diag, llDiag: { rhat: splitRhat(llKept), ess: essGeyer(llKept), geweke: geweke(llKept) },
  };
}

// ── Convergence diagnostics ──
const qs = (sorted, p) => { if (!sorted.length) return NaN; const h = (sorted.length - 1) * p; const lo = Math.floor(h); return sorted[lo] + (h - lo) * (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]); };
const mean = (x) => x.reduce((s, v) => s + v, 0) / x.length;
// Autocorrelations ρ_t = γ_t / γ_0 with γ_t = (1/n) Σ (x_i − x̄)(x_{i+t} − x̄).
export function autocorr(x, maxLag = x.length - 1) {
  const n = x.length, m = mean(x); const d = x.map((v) => v - m); const out = [];
  let g0 = 0; for (let i = 0; i < n; i++) g0 += d[i] * d[i];
  for (let t = 0; t <= maxLag; t++) { let g = 0; for (let i = 0; i + t < n; i++) g += d[i] * d[i + t]; out.push(g0 > 0 ? g / g0 : 0); }
  return out;
}
// Effective sample size, Geyer's (1992) initial monotone sequence: Γ_k = ρ_{2k} + ρ_{2k+1}, summed while positive
// and made non-increasing; τ = −1 + 2 Σ Γ_k; ESS = n / τ (as in Stan for a single chain).
export function essGeyer(x) {
  const n = x.length; if (n < 4) return NaN;
  const rho = autocorr(x); let sum = 0, prev = Infinity;
  for (let k = 0; 2 * k + 1 < n; k++) {
    let G = rho[2 * k] + rho[2 * k + 1]; if (!(G > 0)) break;
    if (G > prev) G = prev; prev = G; sum += G;
  }
  const tau = -1 + 2 * sum;
  return n / Math.max(tau, 1 / Math.log10(Math.max(n, 10)));
}
// Split R̂ (Gelman et al. 2013, BDA3 §11.4): the kept chain is split into two halves treated as two chains;
// W = mean within-half variance, B = n × variance of the half means, R̂ = √(((n − 1)/n W + B/n) / W).
export function splitRhat(x) {
  const n = Math.floor(x.length / 2); if (n < 4) return NaN;
  const h = [x.slice(0, n), x.slice(x.length - n)];
  const m = h.map(mean); const v = h.map((c, i) => c.reduce((s, y) => s + (y - m[i]) ** 2, 0) / (n - 1));
  const W = mean(v); const gm = mean(m); const B = (n * m.reduce((s, y) => s + (y - gm) ** 2, 0));
  const vp = ((n - 1) / n) * W + B / n;
  return W > 0 ? Math.sqrt(vp / W) : NaN;
}
// Geweke (1992) z: mean of the first 10% of the kept draws minus the mean of the last 50%, divided by
// √(var₁/ESS₁ + var₂/ESS₂) — each segment's variance of the mean from its effective sample size.
export function geweke(x, a = 0.1, b = 0.5) {
  const n = x.length; const x1 = x.slice(0, Math.floor(a * n)), x2 = x.slice(n - Math.floor(b * n));
  if (x1.length < 8) return NaN;
  const vm = (y) => { const m = mean(y); const v = y.reduce((s, z) => s + (z - m) ** 2, 0) / (y.length - 1); return v / essGeyer(y); };
  return (mean(x1) - mean(x2)) / Math.sqrt(vm(x1) + vm(x2));
}
