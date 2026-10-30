// Web Worker for the causal tools' Monte Carlo runs, so the page stays responsive:
//  - 'bandit': the multi-armed bandit simulator (hundreds of simulated tests per policy);
//  - 'market': market-sizing chains (100,000 draws per chain).
import { simulate } from './causal-bandit.js';
import { simulateMarket } from './causal-market.js';

self.onmessage = ({ data }) => {
  try {
    let result;
    if (data.type === 'bandit') result = simulate(data.params);
    else if (data.type === 'market') result = simulateMarket(data.chains, data.opts);
    else throw new Error(`Unknown job ${data.type}`);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
