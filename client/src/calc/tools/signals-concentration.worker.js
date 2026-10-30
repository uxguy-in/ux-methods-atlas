// Web Worker for the concentration tool: the Gini bootstrap and the Clauset-Shalizi-Newman bootstrap goodness-of-fit
// test refit the power law (with its own xmin search) hundreds of times, so they run here and post progress.
import { giniBoot, gofBootstrap } from './signals-concentration.js';

self.onmessage = ({ data }) => {
  const { id, values, fit, B, Bgini, seed } = data;
  try {
    const ci = giniBoot(values, Bgini, seed);
    self.postMessage({ id, type: 'gini', ci });
    if (fit) {
      const gof = gofBootstrap(values, fit, { B, seed: seed + 1, onProgress: (p) => self.postMessage({ id, type: 'progress', p }) });
      self.postMessage({ id, type: 'gof', gof: { p: gof.p, B: gof.B } });
    } else self.postMessage({ id, type: 'gof', gof: null });
  } catch (e) {
    self.postMessage({ id, type: 'error', error: e.message || String(e) });
  }
};
