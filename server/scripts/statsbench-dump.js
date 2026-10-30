// Writes the example datasets of the statistics workbench tools (regression, moderation and mediation, resampling,
// distribution check, survival) to server/scripts/statsbench-reference-input.json, so the Python reference
// (statsbench-reference.py) analyses exactly the text the browser does. Also writes the first draws of the seeded
// generator so the Python port of mulberry32 can prove it replays the same bootstrap resamples.
// Run: node server/scripts/statsbench-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../client/src/calc/tools/statsbench-examples.js';
import { rng } from '../../client/src/calc/tools/statsbench-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = rng(1);
const out = {
  regression: E.REGRESSION_EXAMPLE, mediation: E.MEDIATION_EXAMPLE, timesA: E.TIMES_A, timesB: E.TIMES_B, pairs: E.PAIRS, successes: E.SUCCESSES,
  distribution: E.DISTRIBUTION_EXAMPLE, survival: E.SURVIVAL_EXAMPLE, mulberry1: Array.from({ length: 6 }, () => r()),
};
writeFileSync(path.join(here, 'statsbench-reference-input.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log('wrote statsbench-reference-input.json');
