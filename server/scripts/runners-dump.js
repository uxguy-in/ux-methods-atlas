// Writes the runner tools' example data (preference test, MaxDiff runner, reaction cards) as plain numbers to
// server/scripts/runners-reference-input.json, so the Python reference (runners-reference.py) analyses exactly the
// data the browser does. check-runners.js fails if the examples drift from this file.
// Run: node server/scripts/runners-dump.js && python3 server/scripts/runners-reference.py
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from '../../client/src/calc/tools/runners-preference.js';
import * as M from '../../client/src/calc/tools/runners-maxdiff.js';
import * as R from '../../client/src/calc/tools/runners-cards.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function runnersInput() {
  const ps = P.exampleStudy(), pr = P.exampleResults(ps);
  const ms = M.exampleStudy(), mt = M.tasksOf(ms, M.exampleResults(ms));
  const rs = R.exampleStudy(), rr = R.responsesOf(rs, R.exampleResults(rs));
  return {
    preference: { K: ps.d.length, segments: ps.a.o.length, chosen: pr.map((r) => r.c), order: pr.map((r) => r.o), segment: pr.map((r) => r.g) },
    maxdiff: { J: ms.it.length, tasks: mt.map((t) => [t.r, t.items, t.best, t.worst]) },
    cards: { valence: R.VALENCE, people: rr.map((r) => r.p), design: rr.map((r) => r.d), words: rr.map((r) => r.w), top: rr.map((r) => r.t) },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(here, 'runners-reference-input.json'), `${JSON.stringify(runnersInput())}\n`);
  console.log('Wrote server/scripts/runners-reference-input.json');
}
