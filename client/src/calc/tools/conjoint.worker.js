// Web Worker for the Conjoint studio's heavy fits: hierarchical Bayes MCMC (tens of thousands of iterations over
// every respondent) and the latent-class sweep (EM with random starts for k = 1..kMax). The page stays responsive and
// shows a progress bar from the messages posted here.
import { runHB } from './conjoint-hb.js';
import { latentClassSweep } from './conjoint-models.js';

self.onmessage = ({ data }) => {
  const { id, type, S, opts } = data;
  try {
    let last = 0;
    const progress = (p) => { if (p - last >= 0.01 || p >= 1) { last = p; self.postMessage({ id, progress: p }); } };
    if (type === 'hb') self.postMessage({ id, result: runHB(S, opts, progress) });
    else if (type === 'lc') self.postMessage({ id, result: latentClassSweep(S, { ...opts, onProgress: progress }) });
    else throw new Error(`Unknown job ${type}`);
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
