// Latent class analysis of the interview × code (or theme) presence matrix, for the Patterns step of the interview
// coding workbench. It reuses the site's EM implementation in calc/cluster.js (the same code the "Cluster to personas"
// calculator uses, checked there against StepMix and poLCA): each column is a yes/no item with two options, and
// θ_cj = P(code j present | class c) has the Dirichlet prior of one pseudo-answer per item and class.
// Columns present in every interview or in none carry no information and are left out.
import { fitMixture, rawMixtureData } from '../cluster.js';

export function lcaData(M, names) {
  const n = M.length;
  const keep = names.map((_, j) => j).filter((j) => { const s = M.reduce((t, r) => t + (r[j] > 0 ? 1 : 0), 0); return s > 0 && s < n; });
  const C = M.map((r) => keep.map((j) => (r[j] > 0 ? 1 : 0)));
  return { C, names: keep.map((j) => names[j]), dropped: names.filter((_, j) => !keep.includes(j)), n, q: keep.length };
}
export const lcaKMax = (n) => Math.max(1, Math.min(4, n - 1));

// Fits k = 1 … kMax and picks the lowest BIC. Each fit returns its log-likelihood, BIC, AIC, parameter count,
// entropy R², class sizes, every interview's class and posterior probabilities, and θ (probability of each code).
export function runLCA(C, { kMax = lcaKMax(C.length), seed = 1, nStarts = 20 } = {}) {
  const q = C[0]?.length || 0;
  if (C.length < 3 || !q) throw new Error('Latent class analysis needs at least 3 interviews and one code that some, but not all, interviews use.');
  const md = rawMixtureData(null, C, new Array(q).fill(2));
  const fits = [];
  for (let k = 1; k <= kMax; k++) {
    const f = fitMixture(md, k, { model: 'lca', seed, nStarts, nFinal: 5 });
    fits.push({
      k, ll: f.ll, bic: f.bic, aic: f.aic, nParams: f.nParams, entropyR2: f.entropyR2, hits: f.hits, converged: f.converged,
      w: Array.from(f.P.w), labels: f.labels, cert: Array.from(f.cert), counts: f.counts,
      post: Array.from({ length: md.n }, (_, i) => Array.from({ length: k }, (_, c) => f.R[i * k + c])),
      theta: f.P.theta.map((items) => items.map((t) => t[1])),
    });
  }
  const best = fits.reduce((a, b) => (b.bic < a.bic ? b : a));
  return { fits, best: best.k, n: C.length, q };
}
