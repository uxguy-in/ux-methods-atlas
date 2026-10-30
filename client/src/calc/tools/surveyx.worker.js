// Web Worker for the surveyx tools: the R-indicator refits the response model for every bootstrap resample, which can
// take half a second on large frames, so it runs off the main thread.
import { rIndicator } from './surveyx-nonresponse.js';

self.onmessage = ({ data }) => {
  try {
    if (data.kind === 'rindicator') self.postMessage({ result: rIndicator(data.text, data.resp, data.aux, { boot: data.boot }) });
    else self.postMessage({ error: `Unknown job ${data.kind}` });
  } catch (e) {
    self.postMessage({ error: e.message || String(e) });
  }
};
