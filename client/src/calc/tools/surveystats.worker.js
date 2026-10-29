// Web Worker for the survey statistics tools: Horn's parallel analysis (hundreds of simulated correlation matrices),
// dominance analysis on McFadden's R² (one logistic regression per subset of drivers) and the Monte Carlo exact test
// for crosstabs. Keeps the page responsive; the same functions run on the main thread if workers are unavailable.
import { parallelSim, polychoricMatrix } from './surveystatsFactor.js';
import { logisticDominance, olsDominance } from './surveystatsDrivers.js';
import { monteCarloExact, exactTest } from './surveystatsCrosstab.js';

self.onmessage = ({ data }) => {
  const { id, type, args } = data;
  try {
    let result;
    if (type === 'parallel') result = parallelSim(args.n, args.p, { iters: args.iters, seed: args.seed, onProgress: (f) => self.postMessage({ id, progress: f }) });
    else if (type === 'polychoric') result = polychoricMatrix(args.cats);
    else if (type === 'logitDominance') result = logisticDominance(args.y, args.X);
    else if (type === 'olsDominance') result = olsDominance(args.Rxx, args.rxy);
    else if (type === 'monteCarlo') result = monteCarloExact(args.N, { B: args.B, seed: args.seed });
    else if (type === 'exact') result = exactTest(args.N) || { ...monteCarloExact(args.N, { B: 10000 }), method: 'Monte Carlo exact test (10,000 tables)' };
    else throw new Error(`Unknown job ${type}`);
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: e.message || String(e) });
  }
};
