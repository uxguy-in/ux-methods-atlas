// Writes the human factors tools' example inputs to humanfactors-reference-input.json, so the independent Python
// reference (humanfactors-reference.py) checks exactly the data the pages load. Run: node server/scripts/humanfactors-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from '../../client/src/calc/tools/humanfactors-fault.js';
import * as E from '../../client/src/calc/tools/humanfactors-ergo.js';
import * as St from '../../client/src/calc/tools/humanfactors-steering.js';
import * as SE from '../../client/src/calc/tools/humanfactors-seev.js';
import * as AL from '../../client/src/calc/tools/humanfactors-alarm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TREE2 = `System fails [OR]
  Both pumps fail [AND]
    Pump A fails: 0.05
    Pump B fails: 0.06
  Controls fail [2/3]
    Sensor 1 fails: 0.1
    Sensor 2 fails: 0.1
    Common power loss: 0.02
  Power and pump [AND]
    Common power loss
    Pump A fails`;
// Larger tree: 3-of-5 voting, shared events in several branches, nested gates.
export const TREE3 = `Wrong patient record opened [OR]
  Search returns similar names [AND]
    Two patients share a surname: 0.3
    List not sorted by date of birth: 0.4
    Checks fail [3/5]
      Photo not shown: 0.5
      Date of birth not read: 0.2
      Ward not checked: 0.25
      Time pressure: 0.35
      Wristband not scanned: 0.15
  Previous record left open [AND]
    Time pressure
    Session not timed out: 0.1
    Banner not noticed [OR]
      Banner too small: 0.3
      Photo not shown`;
const strip = (n) => (n.type === 'event' ? { e: n.idx } : { op: n.op, k: n.k, c: n.children.map(strip) });
const tree = (text) => { const t = F.parseFaultTree(text); if (t.errors.length) throw new Error(t.errors.join('\n')); return { p: t.events.map((e) => e.p), root: strip(t.root) }; };

const out = {
  trees: { example: tree(F.EXAMPLE), tree2: tree(TREE2), tree3: tree(TREE3) },
  niosh: { example: E.NIOSH_EXAMPLE },
  rula: E.RULA_EXAMPLE, reba: E.REBA_EXAMPLE,
  anthro: E.ANTHRO_EXAMPLE,
  borg: { scale: E.BORG_EXAMPLE.scale, values: E.parseRatings(E.BORG_EXAMPLE.text) },
  swat: { order: E.prototypeOrder(E.SWAT_EXAMPLE.proto), events: E.parseSwatEvents(E.SWAT_EXAMPLE.events), custom: E.prototypeOrder('ETS').map((c, i, a) => (i === 5 ? a[6] : i === 6 ? a[5] : c)) },
  steering: St.EXAMPLE_DATA,
  designs: St.EXAMPLE_DESIGNS,
  seev: SE.EXAMPLE,
  alarmLog: AL.exampleLog(),
};
writeFileSync(path.join(here, 'humanfactors-reference-input.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log('wrote humanfactors-reference-input.json');
