// Writes server/scripts/scorers-input.json: the built-in example data of the scorers tools, parsed exactly as the
// tools parse them, so that scorers-reference.py computes its reference values on identical numbers.
// Run: node server/scripts/scorers-dump.js && python3 server/scripts/scorers-reference.py
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMatrix } from '../../client/src/calc/tools/scorers-math.js';
import * as A from '../../client/src/calc/tools/scorers-agree.js';
import * as Q from '../../client/src/calc/tools/scorers-qkeys.js';
import * as I from '../../client/src/calc/tools/scorers-items.js';
import * as Wt from '../../client/src/calc/tools/scorers-rake.js';
import { QUESTIONNAIRE_EXAMPLES as EX, ITEM_EXAMPLE, WEIGHT_EXAMPLE, WEIGHT_TARGETS } from '../../client/src/calc/tools/scorers-examples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
// The agreement examples live in the component file; read them from the source so the check uses the same text.
const src = readFileSync(path.join(root, 'client', 'src', 'calc', 'tools', 'scorers-Agreement.jsx'), 'utf8');
const grab = (name) => { const i = src.indexOf(`const ${name} = \``) + name.length + 10; return src.slice(i, src.indexOf('`;', i)); };
const nanToNull = (rows) => rows.map((r) => r.map((v) => (Number.isFinite(v) ? v : null)));

const icc = A.completeRows(parseMatrix(grab('ICC_EX')).rows).rows;
const sf = A.completeRows(parseMatrix(grab('SF_EX')).rows).rows;
const w = A.completeRows(parseMatrix(grab('W_EX')).rows).rows;
// Kendall's W with ties: six judges score eight items 1–5 (scores are ranked within judge).
const wTies = [[5, 4, 4, 5, 3, 4], [3, 4, 2, 3, 3, 2], [4, 5, 4, 4, 5, 5], [2, 2, 3, 1, 2, 2], [3, 3, 3, 4, 2, 3], [5, 5, 4, 5, 4, 4], [1, 2, 1, 2, 1, 1], [3, 3, 5, 3, 4, 3]];
const rwg = A.parseGroups(grab('RWG_EX')).groups;
const ba = parseMatrix(grab('BA_EX')).rows;

const q = {};
for (const id of ['pssuq', 'csuq', 'asq', 'smeq', 'ues', 'tam', 'sam', 'geq', 'swls', 'pens']) q[id] = nanToNull(parseMatrix(EX[id]).rows);
const sd = Q.parseSemantic(EX.sd);
const items = I.parseItems(ITEM_EXAMPLE);
const survey = Wt.parseSurvey(WEIGHT_EXAMPLE);
const targets = Wt.parseTargets(WEIGHT_TARGETS).targets;

const out = {
  icc, sf, w, wTies, rwg: rwg.map((g) => ({ name: g.name, raters: nanToNull(g.raters) })), ba: nanToNull(ba),
  q, pensGroups: Q.parseGroupsSpec(EX.pensGroups, 9),
  sd: { rows: nanToNull(sd.rows), groups: sd.groups, rev: sd.pairs.map((p) => p.rev) },
  pmf: Q.parsePmf(EX.pmf).counts,
  items: { rows: items.rows, raw: items.raw, key: items.key },
  survey: { cols: survey.cols, rows: survey.rows }, targets,
};
writeFileSync(path.join(here, 'scorers-input.json'), JSON.stringify(out));
console.log('wrote scorers-input.json');
