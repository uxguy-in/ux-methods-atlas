// Checks the "Reading your results" summaries (client/src/calc/summaries.js). Run with `npm run check:summaries`.
// For every calculator it builds the summary from the page's default inputs, exactly as the component does, and checks
// that the summary is complete, names the key number, links only to pages that exist and avoids the misreadings it warns
// about. Then it spot-checks edge cases: tiny samples, 0% and 100% completion, non-significant results and DBSCAN with
// only noise.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
import * as CL from '../../client/src/calc/cluster.js';
import * as SM from '../../client/src/calc/summaries.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let passes = 0, fails = 0;
const ok = (label, cond, detail = '') => { if (cond) passes++; else fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${!cond && detail ? `: ${detail}` : ''}`); };
const calcIds = new Set(CATALOG.map((c) => c.id));
const textOf = (s) => [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].filter((x) => typeof x === 'string').join('\n');

// Every summary: all parts present, the key number in the headline and the report, valid links, no "% chance the true
// value is in this interval" wording for frequentist results.
const covered = new Set();
function check(id, label, s, key, { bayes = false } = {}) {
  covered.add(id);
  const name = `${id} (${label})`;
  ok(`${name}: headline`, typeof s.headline === 'string' && s.headline.length > 20, s.headline);
  ok(`${name}: meaning has 1 to 6 points`, Array.isArray(s.meaning) && s.meaning.length >= 1 && s.meaning.length <= 6, String(s.meaning?.length));
  ok(`${name}: confidence level`, ['high', 'medium', 'low'].includes(s.confidence), s.confidence);
  ok(`${name}: confidence note`, typeof s.confidenceNote === 'string' && s.confidenceNote.length > 10);
  ok(`${name}: caveats 1 to 3`, s.caveats.length >= 1 && s.caveats.length <= 3, String(s.caveats.length));
  ok(`${name}: next steps 1 to 3`, s.next.length >= 1 && s.next.length <= 3, String(s.next.length));
  ok(`${name}: report`, typeof s.report === 'string' && s.report.length > 20);
  for (const k of [].concat(key)) {
    ok(`${name}: headline contains "${k}"`, s.headline.includes(k), s.headline);
    ok(`${name}: report contains "${k}"`, s.report.includes(k), s.report);
  }
  const all = textOf(s);
  ok(`${name}: no undefined, NaN or empty values`, !/undefined|NaN|\bnull\b|—/.test(all), all.match(/.{0,40}(undefined|NaN|\bnull\b|—).{0,40}/)?.[0]);
  for (const m of all.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) {
    const [, kind, target] = m[1].split('/');
    ok(`${name}: link ${m[1]} exists`, kind === 'calculators' ? calcIds.has(target) : kind === 'methods' ? kinds.byId.has(target) : false);
  }
  ok(`${name}: report has no link markup`, !/\]\(\//.test(s.report));
  if (!bayes) ok(`${name}: no "chance the true value is in the interval" wording`, !/(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?true/i.test(all), all.match(/.{0,30}\d+% (chance|probability).{0,40}/i)?.[0]);
  return s;
}

// ── Defaults from Calculators.jsx ──
check('completion-rate', 'default 7 of 8', SM.completionRate({ x: 7, n: 8, conf: 0.95 }), ['7 of 8', '88%']);
const times = S.parseNumbers('94 95 96 113 121 132 190 193 255 298');
const tt = S.timeCI(times, 0.95);
check('task-time', 'default', SM.taskTime({ times, conf: 0.95, target: NaN }), `${(tt.geo / 60 | 0)} min ${Math.round(tt.geo % 60)} s`);
check('rating', 'SUS summary 75, 12, 20', SM.rating({ preset: 'sus', label: 'SUS', min: 0, max: 100, M: 75, SD: 12, N: 20, B: 68, conf: 0.95 }), '75.0');
const susRows = S.parseRows('4 2 5 1 4 2 5 2 4 1\n3 3 4 2 3 2 4 3 3 2\n5 1 5 1 5 1 5 1 4 2\n4 2 4 3 4 2 3 2 4 2\n2 4 3 3 2 4 3 4 2 3');
const susScores = susRows.map(S.susScore);
const susS = check('sus', 'default', SM.sus({ scores: susScores, conf: 0.95 }), (S.mean(susScores)).toFixed(1));
ok('sus: names the Sauro-Lewis grade and the 68 average', /grade [A-F]/.test(susS.headline) && /68/.test(susS.meaning[0]));
ok('sus: warns that SUS is not a percentage', susS.caveats.some((c) => /not a percentage/.test(c)));
const umuxScores = S.parseRows('6 6\n7 6\n5 5\n6 7\n4 5\n7 7\n6 5').map((r) => S.umuxLite(r[0], r[1]));
check('umux-lite', 'UMUX-Lite default', SM.umux({ form: 'lite', scores: umuxScores }), S.mean(umuxScores).toFixed(1));
check('umux-lite', 'UMUX default', SM.umux({ form: 'full', scores: S.parseRows('6 2 6 2\n7 1 6 2\n5 3 5 3\n6 2 7 1\n4 4 5 3\n7 1 7 2').map(S.umux) }), 'UMUX');
const sumR = S.sumScore({ x: 8, n: 10, times: S.parseNumbers('60 70 80 90 100 120 150'), specTime: 100, sat: S.parseNumbers('5 6 7 4 6 6 5 6'), specSat: 5, errors: 4, opportunities: 5 });
check('sum', 'default', SM.sum({ x: 8, n: 10, parts: sumR.parts, sum: sumR.sum }), `${Math.round(sumR.sum * 100)}%`);
const tb = S.parseNumbers('4 4 5 5 5 5 3 5 1 5 5 5');
check('top-box', 'default', SM.topBox({ xs: tb, C: 4, B: 0.75, conf: 0.8 }), ['10 of 12', '83%']);
const npsS = check('nps', 'default counts', SM.nps({ P: 50, PA: 30, D: 20, conf: 0.9 }), '+30');
ok('nps: says there is no universal good score', /no universal good score/.test(npsS.meaning[0]));
check('seq', 'default', SM.seq({ xs: S.parseNumbers('6 5 7 4 6 5 3 6 7 5 6 4'), B: 5.5, conf: 0.95 }), '5.33');
const tlxPeople = S.parseRows('70 20 60 40 65 50 5 0 3 2 4 1\n55 10 75 30 60 70 4 0 5 1 3 2\n80 15 50 55 75 45 5 1 2 3 4 0\n45 5 40 20 50 30 4 0 3 2 5 1\n65 25 70 35 70 60 5 0 4 1 3 2')
  .map((r) => ({ raw: S.tlxRaw(r.slice(0, 6)), wt: S.tlxWeighted(r.slice(0, 6), r.slice(6)), r: r.slice(0, 6) }));
check('nasa-tlx', 'several participants', SM.nasaTlxMany({ people: tlxPeople, useW: true }), S.mean(tlxPeople.map((p) => p.wt)).toFixed(1));
const R1 = [70, 20, 60, 40, 65, 50], picks = S.TLX_PAIRS.map(([a, b]) => ([0, 2, 4].includes(a) ? a : b)), w1 = S.TLX_DIMS.map((_, i) => picks.filter((p) => p === i).length);
check('nasa-tlx', 'one participant', SM.nasaTlxOne({ R: R1, w: w1, raw: S.tlxRaw(R1), weighted: S.tlxWeighted(R1, w1) }), S.tlxWeighted(R1, w1).toFixed(1));
const UEQ_SAMPLE = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8').match(/const UEQ_SAMPLE = '([^']+)'/)[1].replace(/\\n/g, '\n');
const ueqRows = S.parseRows(UEQ_SAMPLE).filter((r) => r.length === 26);
const ueqScales = S.ueqScore(ueqRows);
check('ueq', 'default', SM.ueq({ scales: ueqScales, n: ueqRows.length }), ueqScales[0].mean.toFixed(2));
const attRows = S.parseRows('6 5 6 5 4 5 3 4 6 5\n5 6 5 6 5 4 4 5 5 6\n7 6 6 6 3 4 3 3 6 6\n4 5 5 4 5 5 4 4 5 4\n6 6 7 6 4 3 4 5 6 6\n5 4 5 5 4 5 3 4 5 5').map((r) => r.map((v) => v - 4));
const sc = (idx) => { const per = attRows.map((r) => S.mean(idx.map((i) => r[i]))); const m = S.mean(per); return { m, ci: S.meanCI(m, S.sd(per), per.length, 0.95) }; };
const PQ = sc([0, 1, 2, 3]), HQ = sc([4, 5, 6, 7]), ATT = sc([8, 9]);
check('attrakdiff', 'default', SM.attrakdiff({ PQ, HQ, ATT, region: 'task-oriented', n: attRows.length }), PQ.m.toFixed(2));

const crB = check('compare-rates', 'different people (default)', SM.compareRatesBetween({ x1: 11, n1: 20, x2: 18, n2: 21, conf: 0.9 }), ['86%', '55%']);
ok('compare-rates: default is significant and says so', /statistically significant/.test(crB.headline) && !/not statistically/.test(crB.headline));
check('compare-rates', 'same people (default)', SM.compareRatesWithin({ a: 7, b: 1, c: 6, d: 1, conf: 0.9 }), ['15', '87%', '53%']);
const cmB = check('compare-means', 'different people (default)', SM.compareMeansBetween({ m1: 70, s1: 18, n1: 22, m2: 80, s2: 15, n2: 20, conf: 0.95 }), '10.00');
ok("compare-means: names Cohen's d band with its source", cmB.meaning.some((m) => /Cohen's \(1988\)/.test(m)));
const pairs = S.parseRows('4 5\n3 5\n5 6\n4 4\n2 4\n5 7\n3 4\n4 6\n6 6\n3 5\n4 5\n5 5');
check('compare-means', 'same people (default)', SM.compareMeansWithin({ diffs: pairs.map(([a, b]) => b - a), conf: 0.95 }), ['12', '1.17']);
check('compare-means', 'same people, task times', SM.compareMeansWithin({ diffs: [[30, 25], [42, 40], [55, 41], [38, 30], [60, 48]].map(([a, b]) => Math.log(b) - Math.log(a)), logT: true, conf: 0.95 }), 'shorter');
check('rate-benchmark', 'default', SM.rateBenchmark({ x: 22, n: 25, b: 0.8, conf: 0.9 }), ['22 of 25', '80%']);
check('correlation', 'default', SM.correlation({ xs: [72, 65, 80, 55, 90, 60, 77, 48, 85, 70], ys: [0.9, 0.8, 1, 0.6, 1, 0.7, 0.9, 0.5, 0.9, 0.8], conf: 0.95 }), '0.95');
const es = check('effect-size', 'default', SM.effectSize({ m1: 70, s1: 18, n1: 22, m2: 80, s2: 15, n2: 20, conf: 0.95 }), S.effectSize(70, 18, 22, 80, 15, 20).g.toFixed(2));
ok('effect-size: context caveat', es.meaning.some((m) => /not judgements of importance/.test(m)));
check('nonparametric', 'Mann-Whitney (default)', SM.nonparametricBetween({ A: S.parseNumbers('3 4 2 5 3 4 3 2 4 3 5 2'), B: S.parseNumbers('5 4 6 5 7 4 5 6 5 6 4'), conf: 0.95 }), 'Mann-Whitney');
const npPairs = S.parseRows('4 5\n3 5\n5 6\n4 4\n2 4\n5 7\n3 4\n4 6\n6 6\n3 5\n4 5\n5 4');
check('nonparametric', 'Wilcoxon (default)', SM.nonparametricWithin({ diffs: npPairs.map(([x, y]) => y - x), total: npPairs.length, conf: 0.95 }), 'Wilcoxon');
const ba = check('bayes-ab', 'default', SM.bayesAB({ xa: 40, na: 1000, xb: 55, nb: 1000, T: 0.001, conf: 0.95 }), `${(S.bayesAB(40, 1000, 55, 1000).pBbeatsA * 100).toFixed(1)}%`, { bayes: true });
ok('bayes-ab: credible interval may be read as a probability', /probability that B's true rate is between/.test(ba.meaning[1]));
check('sprt', 'default', SM.sprt({ p0: 0.1, p1: 0.15, alpha: 0.05, beta: 0.2, X: 20, N: 100 }), '20 conversions in 100 trials');
const REL = S.parseRows('1 3 1 4 1\n4 5 3 2 3\n2 1 2 3 3\n4 3 2 3 2\n2 4 3 3 4\n5 4 5 3 3\n5 3 2 2 3\n3 3 3 4 4\n4 4 5 1 2\n3 3 2 3 3\n2 4 3 4 4\n3 4 5 2 5\n4 4 5 3 3\n5 4 3 1 4').map((r) => r.map((v, j) => (j === 3 ? 6 - v : v)));
const rel = S.cronbach(REL, 0.95);
const relS = check('reliability', 'default', SM.reliability({ r: rel, reversed: [4], conf: 0.95 }), rel.alpha.toFixed(2));
ok('reliability: Nunnally band with source', /Nunnally \(1978\)/.test(relS.meaning[0]));
ok('reliability: warns a high alpha can mean redundant items', relS.caveats.some((c) => /redundant/.test(c)));
check('margin-of-error', 'margin (default)', SM.marginOfError({ mode: 'moe', n: 400, p: 0.5, N: Infinity, deff: 1, conf: 0.95 }), '±4.9');
check('margin-of-error', 'sample size', SM.marginOfError({ mode: 'n', e: 0.05, p: 0.5, N: Infinity, deff: 1, conf: 0.95 }), '385');
const coder = S.parseCodeRows('price, price\nprice, trust\ntrust, trust\nspeed, speed\nspeed, speed\ntrust, trust\nprice, price\nsupport, support\nsupport, trust\nspeed, speed\ntrust, trust\nprice, price\nsupport, support\nspeed, price\ntrust, trust\nprice, price\nsupport, support\nspeed, speed\ntrust, .\nprice, price');
const kr = S.krippendorffAlpha(coder.rows);
const ic = check('intercoder', 'default', SM.intercoder({ rows: coder.rows, level: 'nominal', numeric: coder.numeric, conf: 0.95 }), kr.alpha.toFixed(2));
ok('intercoder: Krippendorff and Landis-Koch bands attributed', /Krippendorff's \(2004\)/.test(ic.headline) && ic.meaning.some((m) => /Landis and Koch's \(1977\)/.test(m)));
ok('intercoder: names the most confused pair of codes', ic.meaning.some((m) => /most common disagreement/.test(m)));
const SAT = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8').match(/const SAT_SAMPLE = '([^']+)'/)[1].replace(/\\n/g, '\n');
check('saturation', 'default', SM.saturation({ lists: S.parseCodeLists(SAT), k: 3 }), 'After 10 interviews');
const expTasks = [['Find opening hours', 6.5, 6.1], ['Change delivery address', 6.2, 3.4], ['Compare two plans', 3.1, 5.6], ['Cancel subscription', 2.8, 2.5], ['Download invoice', 5.9, 6.3]].map(([name, e, x]) => ({ name, e, x }));
check('expectation', 'default', SM.expectation({ tasks: expTasks, mid: 4 }), 'Change delivery address');
check('discovery', 'default', SM.discovery({ N: 6, counts: S.parseNumbers('6 4 3 3 2 2 1 1 1 1') }), ['6 participants', '81%']);
check('capture-recapture', 'two evaluators (default)', SM.captureTwo({ A: 10, B: 15, M: 5, conf: 0.95 }), String(Math.round(S.lincolnPetersen(10, 15, 5).chapman)));
const crRows = S.parseRows('1 1 1 0\n1 0 1 1\n1 0 0 0\n0 1 0 0\n1 1 0 0\n0 0 1 0\n1 1 1 1\n0 0 0 1\n1 0 1 0\n0 1 0 0');
check('capture-recapture', 'matrix (default)', SM.captureMany({ rows: crRows, conf: 0.95 }), `found ${S.captureMatrix(crRows).S}`);
const klmOps = S.placeM(S.parseKlm('H\nP BB\nP BB\nH\n"Q3 report"\nK\nR(0.5)').ops), klmR = S.klmTime(klmOps, 0.28);
check('klm', 'default', SM.klm({ total: klmR.total, counts: klmR.counts, time: klmR.time, nOps: klmOps.length, k: 0.28 }), `${klmR.total.toFixed(1)} s`);
const fr = S.fitts({ D: 256, W: 16, a: 0.1, b: 0.2 });
const fittsS = check('fitts', 'pointer, default constants', SM.fitts({ mode: 'pointer', ab: 'default', id: fr.id, mt: fr.mt, saving: 0.2 * (fr.id - S.fittsId(128, 16)), fitR: null, unitLabel: 'px', D: 256, W: 16, sigma: 0, hit: NaN, size95: NaN }), fr.id.toFixed(2));
ok('fitts: default constants rate weak', fittsS.confidence === 'low');
const ft = S.fitts({ D: 30, W: 7, a: 0.1, b: 0.15, sigmaA: 1.5 });
check('fitts', 'touch', SM.fitts({ mode: 'touch', ab: 'own', id: ft.id, mt: ft.mt, saving: 0.15 * (ft.id - S.fittsId(15, 7)), fitR: null, unitLabel: 'mm', D: 30, W: 7, sigma: 1.5, hit: S.hitRate(7, 1.5, 2), size95: S.widthForHit(0.95, 1.5, 2) }), ft.id.toFixed(2));
check('hick', 'equal (default)', SM.hick({ mode: 'equal', n: 8, H: S.hickBits(8), a: 0.2, b: 0.15, equalH: S.hickBits(8) }), S.hickBits(8).toFixed(2));
const hf = [40, 25, 15, 10, 5, 3, 1, 1];
check('hick', 'weighted', SM.hick({ mode: 'weighted', n: 8, H: S.hickBits(0, hf), a: 0.2, b: 0.15, equalH: S.hickBits(8) }), S.hickBits(0, hf).toFixed(2));
const vw = S.vanWestendorp(S.parseRows('10, 15, 25, 35\n5, 10, 20, 30\n8, 12, 18, 25\n12, 18, 30, 45\n6, 10, 15, 20\n15, 20, 28, 40\n4, 8, 12, 16\n9, 14, 22, 32\n7, 12, 20, 28\n11, 16, 24, 30'));
check('van-westendorp', 'default', SM.vanWestendorp({ r: vw }), vw.pmc.x.toFixed(2).replace(/\.?0+$/, ''));
const gg = S.gaborGranger([[5, 72, 80], [7.5, 60, 80], [10, 46, 80], [12.5, 30, 80], [15, 18, 80]].map(([price, k, n]) => ({ price, demand: k / n, n })));
check('gabor-granger', 'default', SM.gaborGranger({ r: gg, cost: 0, nAsked: 80 }), String(gg.bestRevenue.price));
const KANO = 'Export to PDF: 1 5, 2 5, 1 5, 1 4, 2 5, 1 5, 3 5, 1 5, 1 5, 2 5\nSecure login: 2 5, 3 5, 2 5, 2 5, 1 5, 3 5, 2 5, 2 4, 2 5, 3 5\nDark mode: 1 3, 1 4, 3 3, 1 3, 2 3, 1 4, 3 3, 1 3, 1 2, 3 3\nAnimated onboarding: 3 3, 3 3, 1 3, 3 4, 4 3, 3 3, 5 1, 3 3, 3 3, 2 3';
const feats = KANO.split('\n').map((line) => { const [name, rest] = line.split(':'); const ns = S.parseNumbers(rest); const ps = []; for (let j = 0; j + 1 < ns.length; j += 2) ps.push([ns[j], ns[j + 1]]); return { name, ...S.kano(ps) }; });
check('kano', 'default', SM.kano({ feats }), '4 features');
const MD = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8').match(/const MD_SAMPLE = '([^']+)'/)[1].replace(/\\n/g, '\n');
const mdTasks = MD.split('\n').map((l) => { const p = l.split('|'); return { items: p[0].split(',').map((x) => x.trim()), best: p[1].trim(), worst: p[2].trim() }; });
const mdRows = S.maxdiff(mdTasks);
check('maxdiff', 'default', SM.maxdiff({ rows: mdRows, tasks: mdTasks.length }), mdRows[0].item);
const TURF = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8').match(/const TURF_SAMPLE = '([^']+)'/)[1].replace(/\\n/g, '\n');
const tl = S.parseCodeLists(TURF), names = [], ix = new Map();
const people = tl.map((l) => [...new Set(l.map((x) => { const k = x.toLowerCase(); if (!ix.has(k)) { ix.set(k, names.length); names.push(x); } return ix.get(k); }))]);
const tr = S.turf(people, names.length, 3), lastT = tr[tr.length - 1], bestT = lastT.exhaustive || lastT.greedy;
const single = names.map((nm, i) => ({ nm, reach: people.filter((p) => p.includes(i)).length / people.length })).sort((a, b) => b.reach - a.reach);
check('turf', 'default', SM.turf({ best: { ...bestT, label: bestT.items.map((i) => names[i]).join(', ') }, k: 3, people: people.length, single: single[0], prev: tr[1].exhaustive || tr[1].greedy }), `${Math.round(bestT.reach * 100)}%`);
const roi = S.uxRoi({ users: 2000, tasks: 250, seconds: 20, hourly: 45, errors: 300, errorCost: 80, visitors: 500000, baseConv: 0.02, uplift: 0.05, convValue: 60, calls: 1200, callCost: 6, oneOff: 120000, running: 15000, years: 3, rate: 0.08 });
check('ux-roi', 'default', SM.uxRoi({ r: roi, years: 3, rate: 0.08, oneOff: 120000, running: 15000 }), `${Math.round(roi.roi * 100)}%`);
const lostL = [[4, 4, 4], [5, 7, 4], [6, 11, 4], [6, 8, 4], [8, 16, 4], [4, 5, 4]].map(([N, Sx, R]) => S.lostness(N, Sx, R));
const lostS = check('lostness', 'default', SM.lostness({ L: lostL }), S.mean(lostL).toFixed(2));
ok("lostness: Smith's 0.4 and 0.5 thresholds attributed", /Smith's \(1996\)/.test(lostS.headline) && /0\.4/.test(lostS.headline) && /0\.5/.test(lostS.headline));
const READ = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8').match(/const READ_SAMPLE = '((?:[^'\\]|\\.)+)'/)[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
const rr = S.readability(READ, 25);
const rdS = check('readability', 'default', SM.readability({ r: rr, longAt: 25 }), rr.fre.toFixed(0));
ok("readability: Flesch's bands attributed", /Flesch's \(1948\)/.test(rdS.meaning[0]));
for (const [goal, extra, key] of [['discovery', { p: 0.15, want: 0.85 }, '12 participants'], ['rate', { margin: 0.1, prop: 0.5 }, 'participants'], ['mean', { sd: 17.7, margin: 10 }, 'participants'], ['means', { sd: 17.7, diff: 10, design: 'between' }, `(${2 * S.nForMeans(17.7, 10, 0.9, 0.8, 'between')} in total)`], ['rates', { pa: 0.5, pb: 0.7 }, `(${2 * S.nForProportions(0.5, 0.7, 0.9, 0.8)} in total)`]]) {
  check('sample-size', goal, SM.sampleSize({ goal, conf: 0.9, power: 0.8, ...extra }), key);
}

// ── Cluster to personas: k-medoids, DBSCAN, hierarchical and the mixtures, from the example survey ──
const table = CL.parseTable(CL.exampleSurvey());
const spec = CL.guessColumns(table).filter((c) => c.type !== 'ignore').map((c) => ({ name: c.name, index: c.index, type: c.type, levels: c.levels }));
const prepI = CL.prepare(table, spec, 'impute'), prepS = CL.prepare(table, spec, 'skip');
const base = { distance: 'gower', scaling: 'z', oneHot: true, linkage: 'average', k: 'auto', eps: NaN, minPts: 5, seed: 1, gammaScale: 1 };
for (const algo of ['pam', 'kproto', 'kmeans', 'dbscan', 'hier']) {
  const opts = { ...base, algo };
  const r = CL.run(prepI, opts), profs = CL.profiles(prepI, r.labels);
  const stab = algo === 'pam' ? CL.stability(prepI, opts, r, 10) : null;
  const s = check('cluster-personas', `${algo}${stab ? ' with stability' : ''}`, SM.clusterPersonas({ r, profs, names: profs.map((p) => p.suggestedName), stab, algo }), r.clusters.length ? `${r.clusters.length} cluster` : 'noise');
  ok(`cluster-personas (${algo}): says clusters are not personas until validated`, s.caveats.some((c) => /not personas until/.test(c)));
  if (stab) ok('cluster-personas (pam): mentions stability', s.meaning.some((m) => /adjusted Rand index/.test(m)));
}
for (const algo of ['gmm', 'lca', 'mixed']) {
  const opts = { ...base, algo, cov: 'diag', ...(algo === 'lca' ? { k: 4 } : {}) };
  const r = CL.runMixture(algo === 'gmm' ? prepI : prepS, opts), profs = CL.mixtureProfiles(algo === 'gmm' ? prepI : prepS, r.labels, r.mix);
  const s = check('cluster-personas', algo, SM.clusterPersonas({ r, profs, names: profs.map((p) => p.suggestedName), stab: null, algo }), r.k === 1 ? 'no evidence' : `${r.k} classes`);
  if (r.k > 1) ok(`cluster-personas (${algo}): entropy attributed to Clark and Muthén`, s.meaning.some((m) => /Clark and Muthén \(2009\)/.test(m)));
}

// ── Edge cases ──
const c0 = check('completion-rate', '0 of 5', SM.completionRate({ x: 0, n: 5, conf: 0.95 }), '0 of 5');
ok('edge 0%: says nobody succeeded and rates weak', /Nobody succeeded/.test(c0.meaning.join(' ')) && c0.confidence === 'low');
const c100 = check('completion-rate', '5 of 5', SM.completionRate({ x: 5, n: 5, conf: 0.95 }), ['5 of 5', '100%']);
ok('edge 100%: does not claim every user will succeed', /does not mean every user will/.test(c100.meaning.join(' ')));
const c1 = check('completion-rate', 'tiny n, 1 of 1', SM.completionRate({ x: 1, n: 1, conf: 0.95 }), '1 of 1');
ok('edge n = 1: wide interval rated weak', c1.confidence === 'low');
const cBig = check('completion-rate', 'large n, 780 of 1000', SM.completionRate({ x: 780, n: 1000, conf: 0.95 }), '780 of 1000');
ok('edge large n: narrow interval rated strong', cBig.confidence === 'high');
const ns = check('compare-rates', 'non-significant', SM.compareRatesBetween({ x1: 6, n1: 10, x2: 7, n2: 10, conf: 0.95 }), ['70%', '60%']);
ok('non-significant: headline says not significant, caveat says not no difference, rated weak', /not statistically significant/.test(ns.headline) && ns.caveats.some((c) => /does not mean no difference/.test(c)) && ns.confidence === 'low');
const nsm = check('compare-means', 'non-significant', SM.compareMeansBetween({ m1: 70, s1: 18, n1: 8, m2: 72, s2: 18, n2: 8, conf: 0.95 }), '2.00');
ok('non-significant means: rated weak with the not-significant caveat', nsm.confidence === 'low' && nsm.caveats.some((c) => /does not mean no difference/.test(c)));
const tinyNps = check('nps', 'tiny sample', SM.nps({ P: 3, PA: 1, D: 1, conf: 0.9 }), '+40');
ok('tiny NPS: rated weak', tinyNps.confidence === 'low');
const tinySus = check('sus', 'one participant', SM.sus({ scores: [72.5], conf: 0.95 }), '72.5');
ok('one SUS response: rated weak', tinySus.confidence === 'low');
ok('sus: weak sample uses 17.7 SD for planning', /17\.7/.test(tinySus.next[0]));
const lowAlpha = SM.intercoder({ rows: [['a', 'b'], ['a', 'a'], ['b', 'a'], ['b', 'b'], ['a', 'b']], level: 'nominal', conf: 0.95 });
check('intercoder', 'tiny and unreliable', lowAlpha, 'Krippendorff');
ok('tiny intercoder: below 0.667 and rated weak', /below Krippendorff's \(2004\) 0\.667/.test(lowAlpha.headline) && lowAlpha.confidence === 'low');
const bayesFlat = check('bayes-ab', 'tiny and undecided', SM.bayesAB({ xa: 1, na: 10, xb: 1, nb: 10, T: 0.001, conf: 0.95 }), '50.0%', { bayes: true });
ok('tiny Bayes: rated weak and warns about the prior', bayesFlat.confidence === 'low' && bayesFlat.caveats.some((c) => /prior still shapes/.test(c)));
const bayesZero = SM.bayesAB({ xa: 0, na: 50, xb: 3, nb: 50, T: 0.1, conf: 0.95 });
check('bayes-ab', 'A has no conversions', bayesZero, `${(S.bayesAB(0, 50, 3, 50).pBbeatsA * 100).toFixed(1)}%`, { bayes: true });
// DBSCAN with only noise: a tiny eps leaves every respondent unclustered.
const noiseOpts = { ...base, algo: 'dbscan', eps: 1e-6, minPts: 5 };
const noiseR = CL.run(prepI, noiseOpts);
ok('DBSCAN tiny eps leaves every respondent as noise', noiseR.clusters.length === 0 && noiseR.noise === prepI.n, `${noiseR.clusters.length} clusters, ${noiseR.noise} noise`);
const noiseS = check('cluster-personas', 'DBSCAN only noise', SM.clusterPersonas({ r: noiseR, profs: CL.profiles(prepI, noiseR.labels), names: [], stab: null, algo: 'dbscan' }), [`all ${prepI.n} respondents`]);
ok('DBSCAN only noise: weak, and suggests raising eps', noiseS.confidence === 'low' && noiseS.next.some((n) => /Raise eps/.test(n)));
const flatTable = CL.parseTable(['q1\tq2', ...Array.from({ length: 30 }, (_, i) => `${(i * 7) % 5 + 1}\t${(i * 3) % 5 + 1}`)].join('\n'));
const flatPrep = CL.prepare(flatTable, [{ name: 'q1', index: 0, type: 'continuous' }, { name: 'q2', index: 1, type: 'continuous' }], 'impute');
const oneClass = CL.runMixture(flatPrep, { ...base, algo: 'gmm', cov: 'diag', k: 1 });
const oneS = check('cluster-personas', 'mixture with one class', SM.clusterPersonas({ r: oneClass, profs: CL.mixtureProfiles(flatPrep, oneClass.labels, oneClass.mix), names: [], stab: null, algo: 'gmm' }), 'no evidence');
ok('one class: rated weak', oneS.confidence === 'low');
const sat0 = check('saturation', 'too few interviews', SM.saturation({ lists: [['a', 'b'], ['b', 'c'], ['c', 'd']], k: 3 }), 'After 3 interviews');
ok('saturation with 3 interviews: rated weak', sat0.confidence === 'low');
const rb = check('rate-benchmark', 'below benchmark', SM.rateBenchmark({ x: 3, n: 8, b: 0.78, conf: 0.9 }), '3 of 8');
ok('rate below benchmark: source of 78% given', rb.meaning.some((m) => /Sauro/.test(m)));

// ── Every calculator on the calculators page has a summary, and every one is checked here ──
// (Calculators whose components live in their own files are left to their own checks.)
const src = readFileSync(path.join(root, 'client', 'src', 'pages', 'Calculators.jsx'), 'utf8');
const compBlock = src.slice(src.indexOf('const COMPONENTS = {'), src.indexOf('};', src.indexOf('const COMPONENTS = {')));
const compOf = Object.fromEntries([...compBlock.matchAll(/'?([a-z0-9-]+)'?: ([A-Za-z]+)/g)].map((m) => [m[1], m[2]]));
const bodyOf = (name) => { const i = src.indexOf(`\nfunction ${name}(`); const j = src.indexOf('\nfunction ', i + 1); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j); };
const onPage = CATALOG.filter((c) => compOf[c.id] && bodyOf(compOf[c.id]));
const noSummary = onPage.filter((c) => !bodyOf(compOf[c.id]).includes('<StudySummary')).map((c) => c.id);
ok(`All ${onPage.length} calculators on the page render <StudySummary>`, noSummary.length === 0, noSummary.join(', '));
const unchecked = onPage.map((c) => c.id).filter((id) => !covered.has(id));
ok(`All ${onPage.length} calculators on the page have a checked summary`, unchecked.length === 0, unchecked.join(', '));

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
