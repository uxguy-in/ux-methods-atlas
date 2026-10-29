// Writes the example datasets of the survey statistics tools (factor analysis, scale validity, key drivers,
// crosstabs) as plain numbers to server/scripts/surveystats-input.json, so the Python reference
// (surveystats-reference.py) analyses exactly the data the browser does. Run: node server/scripts/surveystats-dump.js
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../../client/src/calc/tools/surveystatsData.js';
import * as X from '../../client/src/calc/tools/surveystatsCrosstab.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const num = (text) => { const { table, cols } = D.readTable(text); return D.numericData(table, cols, cols.filter(D.isNumericCol).map((c) => c.name)); };

const fa = num(D.exampleFactorSurvey());
const sv = num(D.exampleValiditySurvey());
const kd = num(D.exampleDrivers());
const ct = D.readTable(D.exampleCrosstab());
const col = (nm) => ct.cols.find((c) => c.name === nm);
const cat = D.categoricalData(ct.table, ['Onboarding', 'Completed set-up', 'Device'].map((nm) => col(nm).index));
const devices = [...new Set(cat.rows.map((r) => r[2]))].sort();
const layers = devices.map((dv) => X.crossTable(cat.rows.filter((r) => r[2] === dv).map((r) => r[0]), cat.rows.filter((r) => r[2] === dv).map((r) => r[1]), ['New', 'Old'], ['Yes', 'No']).N);
const ord = D.categoricalData(ct.table, ['Tenure', 'Satisfaction'].map((nm) => col(nm).index));
const tenure = X.crossTable(ord.rows.map((r) => r[0]), ord.rows.map((r) => r[1]), col('Tenure').levels, col('Satisfaction').levels);
const plan = D.categoricalData(ct.table, ['Plan', 'Satisfaction'].map((nm) => col(nm).index));
const planSat = X.crossTable(plan.rows.map((r) => r[0]), plan.rows.map((r) => r[1]), null, col('Satisfaction').levels);

const out = {
  harman: D.HARMAN8,
  fa: { names: fa.names, X: fa.X, cats: fa.cats },
  sv: { names: sv.names, X: sv.X, groups: D.SV_CONSTRUCTS.map(([name, items]) => ({ name, items: items.map((it) => sv.names.indexOf(it)) })) },
  kd: { names: kd.names, X: kd.X },
  ct: { onboardingByDevice: layers, devices, tenureSat: tenure, planSat },
};
writeFileSync(path.join(here, 'surveystats-input.json'), JSON.stringify(out));
console.log('wrote surveystats-input.json', fa.X.length, sv.X.length, kd.X.length);
