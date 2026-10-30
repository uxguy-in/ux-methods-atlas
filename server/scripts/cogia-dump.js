// Writes the inputs for the cogia reference script (server/scripts/cogia-reference.py) from the tools' own examples,
// so Python checks exactly the data the pages load. Run: node server/scripts/cogia-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as GR from '../../client/src/calc/tools/cogia-graph.js';
import * as IAT from '../../client/src/calc/tools/cogia-iat.js';
import * as MT from '../../client/src/calc/tools/cogia-mouse.js';
import * as CA from '../../client/src/calc/tools/cogia-ca.js';
import * as TI from '../../client/src/calc/tools/cogia-tolerance.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const g = (opts) => { const p = GR.parseGraph(GR.EXAMPLE, opts); return { names: p.names, edges: p.edges.map((e) => [e.from, e.to]) }; };
const iat = IAT.parseTrials(IAT.exampleCsv()).trials;
const mouse = MT.parseSamples(MT.exampleCsv()).trials.map((t) => ({ participant: t.participant, trial: t.trial, condition: t.condition, t: t.t, x: t.x, y: t.y }));
const tab = CA.parseTable(CA.EXAMPLE);
const out = {
  graph: g({}),
  graphNav: g({ upLinks: true, homeLinks: true }),
  iat: iat.map((x) => [x.p, x.block, x.lat, x.err, x.order]),
  mouse,
  ca: { rows: tab.rows, cols: tab.cols, N: tab.N },
  tolerance: TI.parseValues(TI.EXAMPLE).values,
};
writeFileSync(path.join(here, 'cogia-reference-input.json'), JSON.stringify(out));
console.log(`wrote cogia-reference-input.json: graph ${out.graph.names.length} pages, ${iat.length} IAT trials, ${mouse.length} mouse trials, CA ${tab.N.length}×${tab.cols.length}, ${out.tolerance.length} values`);
