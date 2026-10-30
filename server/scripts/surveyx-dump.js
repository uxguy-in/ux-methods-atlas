// Writes the example datasets of the surveyx tools (non-response, sensitive questions, scaling from comparisons,
// importance-performance, anchoring vignettes, norms) to server/scripts/surveyx-reference-input.json, so the Python
// reference (surveyx-reference.py) analyses exactly the text the browser does.
// Run: node server/scripts/surveyx-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../client/src/calc/tools/surveyx-examples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = {
  disp: E.EX_DISP, waves: E.exWaves(), frame: E.exFrame(), list: E.EX_LIST, rr: E.EX_RR,
  pairs: E.exPairs(), guttman: E.exGuttman(), stated: E.EX_STATED, derived: E.exDerived(), kap: E.EX_KAP, aware: E.EX_AWARE,
  vignettes: E.exVignettes(), normSample: E.exNormSample(), normScores: E.EX_NORM_SCORES, normParams: E.EX_NORM_PARAMS,
};
writeFileSync(path.join(here, 'surveyx-reference-input.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log('wrote surveyx-reference-input.json');
