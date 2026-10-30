// Web Worker for the decision tools' Monte Carlo runs, so the page stays responsive:
//  - 'voi': expected value of perfect and sample information for three or more uncertain options (200,000 draws,
//    for every sample size on the EVSI curve);
//  - 'evaluators': the share of known problems found by random groups of evaluators (5,000 groups per size).
import { voiNormal } from './decisions-voi.js';
import { mcCurve } from './decisions-severity.js';

self.onmessage = ({ data }) => {
  try {
    let result;
    if (data.type === 'voi') result = voiNormal(data.params, { draws: data.draws, seed: data.seed });
    else if (data.type === 'evaluators') result = mcCurve(data.D, data.draws, data.seed);
    else throw new Error(`Unknown job ${data.type}`);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
