// Web Worker for the model-based clustering in the "Cluster to personas" calculator. EM over k = 1..8 with random
// starts takes a few seconds on 1,000 × 30 data, so the page sends each k to one of a small pool of these workers and
// stays responsive; the last message assembles the result (map, silhouette, profiles' inputs) from the fits.
import { fitMixtureK, runMixture } from './cluster.js';

self.onmessage = ({ data }) => {
  const { id, type, prep, opts, k, fits } = data;
  try {
    if (type === 'fit') {
      const fit = fitMixtureK(prep, opts, k);
      self.postMessage({ id, k, fit });
    } else {
      const result = runMixture(prep, opts, null, fits);
      self.postMessage({ id, result }, [result.D.buffer]);
    }
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
