// Web Worker for the statistics workbench: bootstrap resampling for the mediation tool, and bootstrap and permutation
// runs for the resampling tool. Thousands of refits or resamples would freeze the page, so they run here and report
// progress; the page falls back to running them inline only if workers are unavailable.
import { bootIndirect } from './statsbench-mediation.js';
import { bootstrap, permutationTest } from './statsbench-resampling.js';

self.onmessage = ({ data }) => {
  const { id, type, args } = data;
  const progress = (p) => self.postMessage({ id, progress: p });
  try {
    if (type === 'mediation') {
      const out = bootIndirect(args.rows, args.B, args.seed, progress);
      self.postMessage({ id, result: out }, [out.buffer]);
    } else if (type === 'boot') {
      const out = bootstrap(args.key, args.data, args.B, args.seed, progress);
      self.postMessage({ id, result: out }, [out.buffer]);
    } else if (type === 'perm') {
      const out = permutationTest(args.key, args.data, { B: args.B, seed: args.seed, mu0: args.mu0, onProgress: progress });
      self.postMessage({ id, result: out }, [out.nulls.buffer]);
    } else throw new Error(`unknown job ${type}`);
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
