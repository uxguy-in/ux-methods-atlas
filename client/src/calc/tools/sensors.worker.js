// Web Worker for the sensors tools' heavier loops, so the page stays responsive:
//  - 'journey': the Monte Carlo journey forecast (20,000 draws of every step's success rate and time).
import { simulate } from './sensors-journey.js';

self.onmessage = ({ data }) => {
  try {
    let result;
    if (data.type === 'journey') result = simulate(data.steps, data.opts);
    else throw new Error(`Unknown job ${data.type}`);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
