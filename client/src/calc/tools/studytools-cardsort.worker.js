// Web Worker for the card sort's stability curve: B random subsamples at every sample size, each with its own
// similarity matrix, which is slow for large studies (100+ participants × 80 cards), so the page stays responsive.
import { stabilityCurve } from './studytools-cardsort.js';

self.onmessage = ({ data }) => {
  const { id, groupOfs, C, B } = data;
  try {
    const people = groupOfs.map((g) => ({ groupOf: Int32Array.from(g) }));
    self.postMessage({ id, result: stabilityCurve(people, C, { B }) });
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
