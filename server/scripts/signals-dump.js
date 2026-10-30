// Writes the inputs for the "signals" reference script (server/scripts/signals-reference.py) from the tools' own
// example generators, so Python checks exactly the data the pages load. Run: node server/scripts/signals-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../../client/src/calc/tools/signals-toptasks.js';
import * as Q from '../../client/src/calc/tools/signals-search.js';
import * as C from '../../client/src/calc/tools/signals-spc.js';
import * as K from '../../client/src/calc/tools/signals-concentration.js';
import * as M from '../../client/src/calc/tools/signals-classifier.js';
import * as R from '../../client/src/calc/tools/signals-rt.js';
import * as H from '../../client/src/calc/tools/signals-risk.js';
import { rng, gauss } from '../../client/src/calc/tools/signals-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ballots = T.exampleBallots();
const log = Q.parseLog(Q.exampleLog()).rows;
const x = C.parseSeries(C.exampleX(), 'x').pts.map((p) => p.x);
const pS = C.parseSeries(C.exampleP(), 'p').pts.map((p) => [p.count, p.n]);
const uS = C.parseSeries(C.exampleU(), 'u').pts.map((p) => [p.count, p.n]);
const conc = K.exampleValues();
// A continuous heavy-tailed sample (Pareto tail above 30 with α = 2.2 plus a lognormal body), for the continuous fit.
const cont = (() => { const r = rng(99), out = []; for (let i = 0; i < 800; i++) out.push(r() < 0.45 ? 30 * (1 - r()) ** (-1 / 1.2) : Math.exp(2 + 0.6 * gauss(r))); return out.map((v) => +v.toFixed(4)); })();
const scores = M.parseScores(M.exampleScores()).rows;
const rtDist = R.parseTrials(R.exampleDist(), 'dist').rows.filter((r) => r.correct === 1).map((r) => r.rt);
const rtKept = R.trim(rtDist, { method: 'absolute', lo: 200, hi: 2500 }).kept;
const search = R.parseTrials(R.exampleSearch(), 'search').rows;
const strata = H.parseStrata(H.EXAMPLE_STRATA).rows;
const input = { ballots, log, x, pS, uS, conc, cont, scores, rtDist, rtKept, search, strata };
writeFileSync(path.join(here, 'signals-reference-input.json'), JSON.stringify(input));
console.log('wrote signals-reference-input.json');
