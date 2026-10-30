// Web Worker for the Patterns step of the interview coding workbench: the LDA Gibbs sampler (1,000 sweeps over a few
// thousand words takes a second or two) and the latent class analysis, so the page stays responsive.
// Follows calc/mixture.worker.js: one message in, progress messages, one result or error message out.
import { buildCorpus, describeTopics, lda } from './qual-lda.js';
import { runLCA } from './qual-lca.js';

self.onmessage = ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'lda') {
      const corpus = buildCorpus(data.tokDocs, data.corpusOpts);
      let last = 0;
      const fit = lda(corpus, { ...data.opts, onProgress: (it, n) => { const now = Date.now(); if (now - last > 120) { last = now; self.postMessage({ id, progress: it / n }); } } });
      const topics = describeTopics(fit, corpus);
      self.postMessage({ id, result: { topics, trace: fit.trace, theta: fit.theta.map((t) => Array.from(t)), V: fit.V, tokens: corpus.tokens, D: fit.D, docLen: corpus.docs.map((d) => d.length), opts: data.opts } });
    } else if (type === 'lca') {
      self.postMessage({ id, result: runLCA(data.C, data.opts) });
    }
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
