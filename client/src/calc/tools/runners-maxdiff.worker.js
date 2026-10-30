// Web Worker for the MaxDiff runner's design search (simulated annealing over item swaps; up to about a second for
// large designs), so the page stays responsive while it runs.
import { makeDesign } from './runners-maxdiff.js';

self.onmessage = ({ data }) => {
  const { id, opts } = data;
  try {
    self.postMessage({ id, result: makeDesign(opts) });
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
