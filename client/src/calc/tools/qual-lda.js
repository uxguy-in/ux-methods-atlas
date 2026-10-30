// Latent Dirichlet allocation by collapsed Gibbs sampling (Griffiths and Steyvers 2004), for the Patterns step of the
// interview coding workbench. Each analysable segment is a document; words are content tokens (stopwords removed).
// Plain JS with a seeded generator, so the same seed gives the same topics, and `npm run check:qual` can test it.
//
//   Sampling   for each token, remove it from the counts and draw its topic k with probability
//              p(z = k) ∝ (n_dk + α) · (n_kw + β) / (n_k + Vβ)
//   Estimates  φ_kw = (n_kw + β) / (n_k + Vβ)   (topic → word),   θ_dk = (n_dk + α) / (n_d + Kα)   (segment → topic)
//   Fit        log p(w | z) = K[ln Γ(Vβ) − V ln Γ(β)] + Σ_k [Σ_w ln Γ(n_kw + β) − ln Γ(n_k + Vβ)], which should rise
//              as the sampler settles (Griffiths and Steyvers 2004, eq. 2).
import { rng } from '../cluster.js';
import { lgamma } from '../stats.js';

// Vocabulary from tokenised documents: words in at least `minDf` documents (and at most `maxDfShare` of them, so words
// in nearly every segment do not swamp the topics). Documents become arrays of word ids.
export function buildCorpus(tokDocs, { minDf = 2, maxDfShare = 0.5 } = {}) {
  const df = new Map();
  for (const d of tokDocs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const maxDf = Math.max(minDf, Math.floor(maxDfShare * tokDocs.length));
  const vocab = [...df.entries()].filter(([, c]) => c >= minDf && c <= maxDf).map(([w]) => w).sort();
  const id = new Map(vocab.map((w, i) => [w, i]));
  const docs = tokDocs.map((d) => Int32Array.from(d.filter((w) => id.has(w)).map((w) => id.get(w))));
  return { vocab, docs, tokens: docs.reduce((s, d) => s + d.length, 0) };
}

export function logLik(nkw, nk, K, V, beta) {
  let ll = K * (lgamma(V * beta) - V * lgamma(beta));
  for (let k = 0; k < K; k++) {
    let s = 0; const o = k * V;
    for (let w = 0; w < V; w++) s += lgamma(nkw[o + w] + beta);
    ll += s - lgamma(nk[k] + V * beta);
  }
  return ll;
}

// Runs the sampler. Returns φ, θ, the final topic of every token, and the log-likelihood every `every` sweeps.
export function lda(corpus, { K = 4, alpha = 0.1, beta = 0.01, iters = 1000, seed = 1, every = 10, onProgress = null } = {}) {
  const { docs, vocab } = corpus, V = vocab.length, D = docs.length;
  if (!V || !corpus.tokens) throw new Error('No words are left after removing stopwords and rare words.');
  const rnd = rng(seed);
  const nkw = new Float64Array(K * V), nk = new Float64Array(K), ndk = new Float64Array(D * K);
  const z = docs.map((d) => new Int32Array(d.length));
  for (let d = 0; d < D; d++) for (let i = 0; i < docs[d].length; i++) {
    const k = Math.floor(rnd() * K), w = docs[d][i];
    z[d][i] = k; nkw[k * V + w]++; nk[k]++; ndk[d * K + k]++;
  }
  const trace = [{ iter: 0, ll: logLik(nkw, nk, K, V, beta) }];
  const p = new Float64Array(K), Vb = V * beta;
  for (let it = 1; it <= iters; it++) {
    for (let d = 0; d < D; d++) {
      const doc = docs[d], zd = z[d], od = d * K;
      for (let i = 0; i < doc.length; i++) {
        const w = doc[i]; let k = zd[i];
        nkw[k * V + w]--; nk[k]--; ndk[od + k]--;
        let tot = 0;
        for (let t = 0; t < K; t++) { tot += (ndk[od + t] + alpha) * (nkw[t * V + w] + beta) / (nk[t] + Vb); p[t] = tot; }
        const u = rnd() * tot; k = 0; while (k < K - 1 && p[k] <= u) k++;
        zd[i] = k; nkw[k * V + w]++; nk[k]++; ndk[od + k]++;
      }
    }
    if (it % every === 0 || it === iters) { trace.push({ iter: it, ll: logLik(nkw, nk, K, V, beta) }); if (onProgress) onProgress(it, iters); }
  }
  const phi = Array.from({ length: K }, (_, k) => Float64Array.from({ length: V }, (_, w) => (nkw[k * V + w] + beta) / (nk[k] + Vb)));
  const theta = Array.from({ length: D }, (_, d) => Float64Array.from({ length: K }, (_, k) => (ndk[d * K + k] + alpha) / (docs[d].length + K * alpha)));
  const share = Array.from(nk, (v) => v / corpus.tokens);
  return { K, V, D, alpha, beta, iters, seed, phi, theta, z, nk: Array.from(nk), share, trace, vocab };
}

// The top words of each topic, and its most representative segments (highest θ among segments with at least
// `minTokens` content words, so a two-word answer does not top the list).
export function describeTopics(fit, corpus, { top = 10, reps = 3, minTokens = 4 } = {}) {
  return fit.phi.map((ph, k) => {
    const words = Array.from(ph, (v, w) => [w, v]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, top).map(([w, v]) => ({ word: fit.vocab[w], p: v }));
    const docs = fit.theta.map((t, d) => [d, t[k]]).filter(([d]) => corpus.docs[d].length >= minTokens).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, reps).map(([d, v]) => ({ doc: d, theta: v }));
    return { k, share: fit.share[k], words, docs };
  });
}
