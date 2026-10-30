// Checks the decision and risk tools (counterbalancing, value of information, decision trees, forecast calibration,
// use FMEA, severity ratings, human error probability, colour contrast) against scipy, numpy, scikit-learn,
// statsmodels, pingouin and the krippendorff package (server/scripts/decisions-reference.py →
// decisions-reference.json) and against published worked examples: Williams (1949), Hillier and Lieberman's
// Goferbroke example, Sharma, Wu and Dalal (2005), the APCA-W3 reference values, the HEART worked example, the
// AIAG-VDA action priority table and Krippendorff (2011). Also checks every "Reading your results" summary.
// Run with `npm run check:decisions`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../client/src/calc/tools/decisions-core.js';
import * as CB from '../../client/src/calc/tools/decisions-counterbalance.js';
import * as VI from '../../client/src/calc/tools/decisions-voi.js';
import * as DT from '../../client/src/calc/tools/decisions-tree.js';
import * as FC from '../../client/src/calc/tools/decisions-forecast.js';
import * as FM from '../../client/src/calc/tools/decisions-fmea.js';
import * as SV from '../../client/src/calc/tools/decisions-severity.js';
import * as HR from '../../client/src/calc/tools/decisions-hra.js';
import * as CC from '../../client/src/calc/tools/decisions-colour.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const tools = path.join(here, '..', '..', 'client', 'src', 'calc', 'tools');
const REF = JSON.parse(readFileSync(path.join(here, 'decisions-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'decisions-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
const nearRel = (label, got, want, rel = 1e-7) => near(label, got, want, Math.abs(want) * rel + 1e-12);
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
function summary(label, s, key, level, rkey) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && LEVELS.includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20;
  same(`${label}: summary has every part`, !!ok, true);
  same(`${label}: no NaN, undefined, Infinity or empty values`, /NaN|undefined|Infinity|\bnull\b|—|n\/a/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const k of [].concat(key || [])) truthy(`${label}: headline contains "${k}"`, s.headline.includes(k));
  for (const k of [].concat(rkey || [])) truthy(`${label}: report contains "${k}"`, s.report.includes(k));
  if (level) same(`${label}: confidence`, s.confidence, level);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} is a calculator page`, /^\/calculators\/(value-of-information|decision-tree|use-fmea|human-error)$/.test(m[1]));
  if (process.env.SHOW) console.log(`  headline: ${s.headline}\n  report: ${s.report}`);
  return s;
}
// The examples on the pages are the datasets the Python reference used.
const grab = (file, name) => { const s = readFileSync(path.join(tools, file), 'utf8'); const i = s.indexOf(`const ${name} = '`) + `const ${name} = `.length; return eval(s.slice(i, s.indexOf("';\n", i) + 1)); };
same('Forecast example on the page = reference input', grab('decisions-Forecast.jsx', 'EX'), INP.forecasts);
same('Interval example on the page = reference input', grab('decisions-Forecast.jsx', 'EX_IV'), INP.intervals);
same('Severity example on the page = reference input', grab('decisions-Severity.jsx', 'EX'), INP.severity);
same('IFP example on the page = reference input', grab('decisions-Severity.jsx', 'EX_IFP'), INP.severityIfp);
same('Detection example on the page = reference input', grab('decisions-Severity.jsx', 'EX_DET'), INP.detection);

// ── Core numerics (scipy) ──
near('Normal cdf(−6) (scipy 9.865876450376946e-10)', K.normCdf(-6), 9.865876450376946e-10, 1e-18);
near('Normal cdf(1.2345) (scipy 0.8914916766373298)', K.normCdf(1.2345), 0.8914916766373298, 1e-14);
near('Normal ppf(0.975) (scipy 1.959963984540054)', K.normInv(0.975), 1.959963984540054, 1e-13);
near('Normal ppf(1e-8) (scipy −5.612001244174789)', K.normInv(1e-8), -5.612001244174789, 1e-10);
near('Unit normal loss L(0) = φ(0) = 0.3989422804014327', VI.unitLoss(0), 0.3989422804014327, 1e-15);
near('Unit normal loss L(1.5) (scipy: pdf − 1.5·sf = 0.029306793762604644)', VI.unitLoss(1.5), 0.029306793762604644, 1e-14);

// ── Counterbalancing ──
const L = (rows) => rows.map((r) => r.map((c) => CB.LETTERS[c]).join(''));
same('Williams square for 4 conditions is the textbook ABDC, BCAD, CDBA, DACB', L(CB.williams(4)), ['ABDC', 'BCAD', 'CDBA', 'DACB']);
same('Williams for 3 conditions: square plus mirror image (6 orders)', L(CB.williams(3)), ['ABC', 'BCA', 'CAB', 'CBA', 'ACB', 'BAC']);
for (let k = 2; k <= 12; k++) {
  const W = CB.williams(k), b = CB.balance(W, k);
  const perms = W.every((r) => new Set(r).size === k);
  const pairsOnce = b.carry.every((r, i) => r.every((v, j) => (i === j ? v === 0 : v === (k % 2 ? 2 : 1))));
  same(`Williams k = ${k}: ${W.length} orders, each a permutation, position-balanced, every ordered pair ${k % 2 ? 'twice' : 'once'}`, [W.length, perms, b.posBalanced, pairsOnce], [k % 2 ? 2 * k : k, true, true, true]);
  const C = CB.balance(CB.cyclicSquare(k), k);
  same(`Cyclic square k = ${k}: position-balanced, carryover ${k > 2 ? 'not ' : ''}balanced`, [C.posBalanced, C.carryBalanced], [true, k <= 2]);
}
same('All orders for 4 conditions: 24 distinct permutations', new Set(CB.permutations(4).map((r) => r.join(''))).size, 24);
const asg = CB.assign({ k: 5, design: 'williams', n: 20, randomise: true, seed: 9 });
const ab = CB.balance(asg.list.map((r) => r.order), 5);
same('Shuffled Williams k = 5, 20 participants (2 blocks): still exactly balanced', [asg.R, ab.posBalanced, ab.carryBalanced], [10, true, true]);
const asg2 = CB.assign({ k: 4, design: 'williams', n: 10, randomise: false });
same('k = 4 with 10 participants: position spread 1, assignment cycles through the 4 orders', [CB.balance(asg2.list.map((r) => r.order), 4).posSpread, asg2.list.map((r) => r.row)], [1, [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]]);
same('Assignment CSV header and first row', CB.assignmentCsv(asg2.list, ['Old', 'New', 'Fast', 'Guest']).split('\n').slice(0, 2), ['participant,order_number,position_1,position_2,position_3,position_4', '1,1,Old,New,Guest,Fast']);
const cbNames = ['Current checkout', 'One-page checkout', 'Express pay first', 'Guest-first'];
const cbEx = CB.assign({ k: 4, design: 'williams', n: 16, randomise: true, seed: 4 });
summary('Counterbalancing example (16 participants, Williams k = 4)', CB.counterbalanceSummary({ k: 4, design: 'williams', n: 16, R: cbEx.R, bal: CB.balance(cbEx.list.map((r) => r.order), 4), names: cbNames }), ['16 participants', '4 orders'], 'high', '16 participants');
summary('Counterbalancing: 10 participants, k = 4', CB.counterbalanceSummary({ k: 4, design: 'williams', n: 10, R: 4, bal: CB.balance(asg2.list.map((r) => r.order), 4), names: cbNames }), '10 participants', 'medium');
summary('Counterbalancing: cyclic square', CB.counterbalanceSummary({ k: 4, design: 'latin', n: 8, R: 4, bal: CB.balance([...CB.cyclicSquare(4), ...CB.cyclicSquare(4)], 4), names: cbNames }), 'cyclic Latin square', 'low');
summary('Counterbalancing: too few participants', CB.counterbalanceSummary({ k: 5, design: 'williams', n: 6, R: 10, bal: CB.balance(CB.williams(5).slice(0, 6), 5), names: [...cbNames, 'Fifth'] }), 'not enough', 'low', 'not balanced');

// ── Value of information ──
for (const [name, c] of Object.entries(REF.voi)) {
  const r = VI.voiNormal({ ...c.input, studyFixed: 0, studyPer: 0 }, { draws: 400000, seed: 5 });
  if (r.exact) {
    nearRel(`EVPI, ${name} (scipy numerical integration)`, r.evpi.value, c.evpi, 1e-6);
    nearRel(`EVSI, ${name} (scipy numerical integration)`, r.evsi.value, c.evsi, 1e-6);
  } else {
    near(`EVPI, ${name}, Monte Carlo within 4 SE of scipy integration (SE ${r.evpi.se.toFixed(1)})`, r.evpi.value, c.evpi, 4 * r.evpi.se);
    near(`EVSI, ${name}, Monte Carlo within 4 SE of scipy integration (SE ${r.evsi.se.toFixed(1)})`, r.evsi.value, c.evsi, 4 * r.evsi.se);
    near(`EVPI, ${name}: scipy integration agrees with a 2,000,000-draw numpy simulation (within 0.3%)`, c.evpi_mc / c.evpi, 1, 0.003);
  }
}
const ck = VI.voiNormal({ ...REF.voi.checkout.input, studyFixed: 8000, studyPer: 2 });
nearRel('Checkout example: chance the study changes the decision, Φ(−|M|/S_pre) (scipy)', ck.evsi.pChange, REF.voi.checkout.pChange, 1e-9);
same('Checkout example: study cost = 8,000 + 2 × 4,000 × 1 uncertain option', ck.cost, 16000);
truthy('EVSI rises with n and stays below EVPI', ck.curve.every((c, i) => i === 0 || c.value >= ck.curve[i - 1].value - 1e-9) && ck.curve.every((c) => c.value <= ck.evpi.value + 1e-9));
same('EVSI at n = 0 is 0', ck.curve[0].value, 0);
const g = VI.voiDiscrete({ probs: [0.25, 0.75], U: [[700, -100], [90, 90]], L: [[0.6, 0.2], [0.4, 0.8]], cost: 30 });
near('Goferbroke: EVPI (Hillier and Lieberman: 142.5)', g.evpi, 142.5, 1e-9);
near('Goferbroke: EVSI of the seismic survey (Hillier and Lieberman: 53)', g.evsi, 53, 1e-9);
near('Goferbroke: P(favourable soundings) = 0.3', g.results[0].pr, 0.3, 1e-12);
same('Goferbroke: drill if favourable, sell if unfavourable', g.results.map((x) => x.choice), [0, 1]);
near('Goferbroke: EVPI (numpy)', g.evpi, REF.discrete.goferbroke.evpi, 1e-9);
const ob = VI.voiDiscrete({ probs: [0.3, 0.4, 0.3], U: [[500, 150, -250], [200, 120, -40], [0, 0, 0]], L: [[0.7, 0.25, 0.1], [0.2, 0.5, 0.3], [0.1, 0.25, 0.6]], cost: 15 });
near('Onboarding example: EVPI (numpy)', ob.evpi, REF.discrete.onboarding.evpi, 1e-9);
near('Onboarding example: EVSI (numpy)', ob.evsi, REF.discrete.onboarding.evsi, 1e-9);
same('Accuracy matrix columns sum to 1', VI.accuracyMatrix(4, 0.7).reduce((a, r) => a.map((v, j) => v + r[j]), [0, 0, 0, 0]).map((v) => +v.toFixed(12)), [1, 1, 1, 1]);
same('Confidence rule: EVSI/cost 4 high, 2 medium, 1.2 low, 0.5 medium, 0.2 high', [4, 2, 1.2, 0.5, 0.2].map((r) => VI.voiConfidence(r * 100, 100)), ['high', 'medium', 'low', 'medium', 'high']);
summary('VOI normal example', VI.voiSummary({ mode: 'normal', names: ck.P.map((p) => p.name), evpi: ck.evpi.value, evsi: ck.evsi.value, cost: ck.cost, best: ck.best, pChange: ck.evsi.pChange, unit: '£', n: 4000, optimalN: ck.optimal.n, optimalNet: ck.optimal.net, exact: true }), ['Perfect information is worth up to £', 'pays for itself'], undefined, '£35,174');
summary('VOI discrete example', VI.voiSummary({ mode: 'discrete', names: ['Build full self-serve', 'Build a light wizard', 'Do not build'], evpi: ob.evpi, evsi: ob.evsi, cost: 15, best: ob.best, pChange: ob.pChange, unit: '£k' }), ['this study is worth about', '£75k'], undefined, '£26k');
summary('VOI: study not worth it', VI.voiSummary({ mode: 'discrete', names: ['A', 'B'], evpi: 20, evsi: 5, cost: 30, best: 0, pChange: 0.1, unit: '$' }), 'does not pay for itself', 'high');

// ── Decision tree ──
const treeSrc = readFileSync(path.join(tools, 'decisions-Tree.jsx'), 'utf8');
const EXT = treeSrc.slice(treeSrc.indexOf('const EX = `') + 12, treeSrc.indexOf('`;', treeSrc.indexOf('const EX = `')));
const tr = DT.analyse(EXT);
same('Tree example parses without errors', tr.errors, []);
for (const o of tr.rootOptions) near(`Tree example: expected value of "${o.label}" (independent Python rollback)`, o.ev, REF.tree.root[o.label], 1e-9);
for (const t of tr.tornado) {
  near(`Tornado $${t.name} at low (Python)`, t.evLo, REF.tree.tornado[t.name][0], 1e-9);
  near(`Tornado $${t.name} at high (Python)`, t.evHi, REF.tree.tornado[t.name][1], 1e-9);
}
for (const [k, v] of Object.entries(REF.tree.breakEven)) near(`Break-even $${k} (scipy brentq)`, tr.tornado.find((t) => t.name === k).flips[0].at, v, 1e-7);
same('Tornado sorted by swing, $big first', tr.tornado[0].name, 'big');
near('Risk profile probabilities sum to 1', tr.profile.reduce((a, o) => a + o.prob, 0), 1, 1e-12);
near('Risk profile mean equals the rolled-back value', tr.profile.reduce((a, o) => a + o.prob * o.total, 0), tr.tree.ev, 1e-9);
const gof = DT.analyse('Goferbroke [D]\n  Do seismic survey: cost=30 [C]\n    Favourable: p=0.3 [D]\n      Drill [C]\n        Oil: p=0.5, value=700\n        Dry: p=rest, value=-100\n      Sell: value=90\n    Unfavourable: p=rest [D]\n      Drill [C]\n        Oil: p=1/7, value=700\n        Dry: p=rest, value=-100\n      Sell: value=90\n  No survey [D]\n    Drill [C]\n      Oil: p=0.25, value=700\n      Dry: p=rest, value=-100\n    Sell: value=90');
same('Goferbroke tree: survey 123, no survey 100 (Hillier and Lieberman)', gof.rootOptions.map((o) => +o.ev.toFixed(9)), [REF.tree.goferbroke.survey, REF.tree.goferbroke.noSurvey]);
same('Goferbroke policy: survey; drill if favourable; sell if not', gof.policy.map((p) => p.choose), ['Do seismic survey', 'Drill', 'Sell']);
same('Expression evaluator: ($a + 2) * 3 / 4 − 10%', DT.evalExpr('($a + 2) * 3 / 4 - 10%', { a: 6 }), 5.9);
truthy('Probabilities that do not add up to 1 are reported', DT.analyse('R [C]\n  a: p=0.5, value=1\n  b: p=0.4, value=2').errors.some((e) => /add up to 0.9/.test(e)));
truthy('Unknown parameters are reported', DT.analyse('R [D]\n  a: value=$x\n  b: value=1').errors.some((e) => /Unknown parameter \$x/.test(e)));
truthy('Minimise mode picks the cheaper branch', DT.analyse('R [D]\n  a: cost=10\n  b: cost=5', { minimise: true }).tree.best === 0);
summary('Decision tree example', DT.treeSummary({ ...tr, unit: '£' }), 'Full redesign', 'low', ['Full redesign', '$p_big']);
const stable = DT.analyse('$v = 100 [90, 110]\nR [D]\n  Go: value=$v\n  Stop: value=0');
summary('Decision tree: robust choice', DT.treeSummary({ ...stable, unit: '' }), 'Go', 'high');

// ── Forecast calibration ──
const fp = FC.parseForecasts(INP.forecasts);
same('Forecast example: 72 forecasts parsed, no errors', [fp.rows.length, fp.errors.length], [72, 0]);
const fm = FC.murphy(fp.rows, 'unique');
for (const k of ['bs', 'rel', 'res', 'unc']) near(`Example, all forecasters: ${k} (scikit-learn brier_score_loss / numpy)`, fm[k], REF.forecast.all[k], 1e-12);
near('Murphy identity BS = REL − RES + UNC with unique-value bins', fm.rel - fm.res + fm.unc, fm.bs, 1e-12);
for (const p of FC.byForecaster(fp.rows)) {
  near(`${p.who}: Brier (scikit-learn)`, p.bs, REF.forecast.per[p.who].bs, 1e-12);
  near(`${p.who}: reliability (numpy)`, p.rel, REF.forecast.per[p.who].rel, 1e-12);
  near(`${p.who}: resolution (numpy)`, p.res, REF.forecast.per[p.who].res, 1e-12);
}
const f10 = FC.binsOf(fp.rows, 'ten').bins;
same('Ten-bin calibration curve: observed frequency per bin (scikit-learn calibration_curve)', f10.map((b) => +b.obs.toFixed(12)), REF.forecast.curve10.prob_true.map((v) => +v.toFixed(12)));
same('Ten-bin calibration curve: mean forecast per bin (scikit-learn)', f10.map((b) => +b.f.toFixed(12)), REF.forecast.curve10.prob_pred.map((v) => +v.toFixed(12)));
same('Percentages and yes/no outcomes parse', FC.parseForecasts('70%, yes\n0.2, no\n35, 1').rows.map((r) => [r.p, r.o]), [[0.7, 1], [0.2, 0], [0.35, 1]]);
const ivs = FC.intervalScore(FC.parseIntervals(INP.intervals).rows);
same('Interval example: hits and n', [ivs.hits, ivs.n], [REF.intervals.hits, REF.intervals.n]);
near('Interval example: one-sided binomial p vs 90% (scipy binomtest)', ivs.p, REF.intervals.p, 1e-9);
near('Interval example: Clopper-Pearson lower (statsmodels)', ivs.lo, REF.intervals.lo, 1e-6);
near('Interval example: Clopper-Pearson upper (statsmodels)', ivs.hi, REF.intervals.hi, 1e-6);
same('Quiz has 10 questions with answers', FC.QUIZ.filter((q) => Number.isFinite(q.a)).length, 10);
summary('Brier example (72 forecasts)', FC.brierSummary(fm, FC.byForecaster(fp.rows)), 'Brier score 0.187', 'medium', 'Brier score of 0.187');
summary('Brier: small sample', FC.brierSummary(FC.murphy(fp.rows.slice(0, 12))), '12 forecasts', 'low');
summary('Interval example', FC.intervalSummary(ivs), '7 of 10', 'medium', '7 of 10');
const over = FC.intervalScore(Array.from({ length: 20 }, (_, i) => ({ q: `q${i}`, lo: 0, hi: 1, truth: i < 3 ? 0.5 : 2 })));
near('3 of 20 hits: binomial p (scipy)', over.p, REF.intervals.p_3_of_20, 1e-18);
summary('Interval: clear overconfidence', FC.intervalSummary(over), '3 of 20', 'medium');

// ── Use FMEA ──
// Spot checks against the AIAG & VDA FMEA Handbook (2019) Action Priority table, one per band where H, M and L meet.
const AP = [[10, 2, 3, 'L'], [9, 4, 7, 'H'], [9, 4, 1, 'M'], [9, 2, 7, 'H'], [9, 2, 5, 'M'], [9, 1, 10, 'L'], [8, 6, 1, 'M'], [8, 9, 1, 'H'], [7, 4, 8, 'H'], [7, 4, 5, 'M'], [7, 3, 6, 'M'], [7, 2, 4, 'L'], [5, 8, 7, 'H'], [5, 8, 3, 'M'], [5, 6, 7, 'M'], [5, 6, 1, 'L'], [4, 4, 7, 'M'], [4, 4, 6, 'L'], [3, 9, 7, 'M'], [3, 9, 3, 'L'], [2, 6, 10, 'L'], [1, 10, 10, 'L']];
same('Action priority, 22 spot checks against the AIAG-VDA table', AP.map(([s, o, d]) => FM.actionPriority(s, o, d)), AP.map((x) => x[3]));
same('Action priority needs whole ratings 1–10', [FM.actionPriority(0, 5, 5), FM.actionPriority(5, 11, 5), FM.actionPriority(5.5, 5, 5)], [null, null, null]);
let apCounts = { H: 0, M: 0, L: 0 };
for (let s = 1; s <= 10; s++) for (let o = 1; o <= 10; o++) for (let d = 1; d <= 10; d++) apCounts[FM.actionPriority(s, o, d)]++;
same('AP table over all 1,000 S×O×D combinations is monotone (raising S, O or D never lowers priority)', (() => { for (let s = 1; s <= 10; s++) for (let o = 1; o <= 10; o++) for (let d = 1; d <= 10; d++) { const a = FM.AP_RANK[FM.actionPriority(s, o, d)]; if ((s < 10 && FM.AP_RANK[FM.actionPriority(s + 1, o, d)] < a) || (o < 10 && FM.AP_RANK[FM.actionPriority(s, o + 1, d)] < a) || (d < 10 && FM.AP_RANK[FM.actionPriority(s, o, d + 1)] < a)) return false; } return true; })(), true);
const fmSrc = readFileSync(path.join(tools, 'decisions-Fmea.jsx'), 'utf8');
const fmEx = eval(`(() => { const row = (step, mode, effect, cause, controls, s, o, d, action = '', s2 = '', o2 = '', d2 = '') => ({ step, mode, effect, cause, controls, s: String(s), o: String(o), d: String(d), action, s2: String(s2), o2: String(o2), d2: String(d2) }); return ${fmSrc.slice(fmSrc.indexOf('const EX = [') + 11, fmSrc.indexOf('];', fmSrc.indexOf('const EX = [')) + 1)}; })()`);
const fa = FM.analyseFmea(fmEx);
same('FMEA example: RPN = S × O × D for every row', fa.valid.every((r) => r.rpn === r.S * r.O * r.D), true);
same('FMEA example: AP counts', fa.counts, { H: 3, M: 4, L: 2 });
same('FMEA example: first by AP is "Accepts without reading" (S9 O6 D8)', fa.byAp[0].mode, 'Accepts without reading');
same('FMEA example: double-tap (S10 O2 D3, RPN 60) is Low by AP and last by RPN, and flagged as high severity with a low RPN', [fa.byAp.findIndex((r) => r.mode === 'Double-taps Deliver') + 1, fa.byRpn.findIndex((r) => r.mode === 'Double-taps Deliver') + 1, fa.highSevLowRpn.map((r) => r.mode)], [8, 9, ['Double-taps Deliver']]);
same('FMEA example: total RPN of actioned rows (manual sum)', [fa.after.before, fa.after.afterSum], [216 + 280 + 432 + 60 + 252, 54 + 32 + 144 + 20 + 72]);
const round = FM.parseFmeaCsv(FM.fmeaCsv(fmEx)).rows;
same('FMEA CSV export and import round-trip (including quoted commas)', round.map((r) => FM.FIELDS.map(([k]) => r[k])), fmEx.map((r) => FM.FIELDS.map(([k]) => r[k])));
same('FMEA CSV import with headers in another order', FM.parseFmeaCsv('Severity,Failure mode,Occurrence,Detection\n8,"Wrong, dose",3,4').rows.map((r) => [r.mode, r.s, r.o, r.d]), [['Wrong, dose', '8', '3', '4']]);
summary('FMEA example', FM.fmeaSummary(fa), ['3 of 9', 'Accepts without reading'], 'medium', ['3 High', 'Accepts without reading']);
summary('FMEA: unrated rows', FM.fmeaSummary(FM.analyseFmea([...fmEx, { mode: 'New', s: '', o: '', d: '' }])), 'use errors', 'low');

// ── Severity ratings and evaluators ──
const sp = SV.parseRatings(INP.severity, 'nielsen');
same('Severity example: 14 problems × 4 evaluators, names from the header', [sp.rows.length, sp.evaluators], [14, ['Ana', 'Ben', 'Chen', 'Dee']]);
const sag = SV.agreement(sp.rows), sagg = SV.aggregate(sp.rows);
near('ICC(2,1) (pingouin ICC(A,1))', sag.icc.icc21, REF.severity.icc21, 1e-12);
near('ICC(2,k) (pingouin ICC(A,k))', sag.icc.icc2k, REF.severity.icc2k, 1e-12);
near('Krippendorff alpha, ordinal (krippendorff package)', sag.alpha, REF.severity.alpha_ordinal, 1e-9);
same('Mean severity per problem (numpy)', sagg.map((a) => +a.mean.toFixed(12)), REF.severity.means.map((v) => +v.toFixed(12)));
const ifp = SV.parseRatings(INP.severityIfp, 'ifp');
near('IFP products: Krippendorff alpha, ordinal (krippendorff package)', SV.agreement(ifp.rows).alpha, REF.severity.ifp_alpha_ordinal, 1e-9);
same('IFP products: mean per problem (numpy)', SV.aggregate(ifp.rows, 'ifp').map((a) => +a.mean.toFixed(9)), REF.severity.ifp_means.map((v) => +v.toFixed(9)));
same('IFP cell 4/3/2 scores 24; 6/1/1 is rejected', [SV.parseRatings('P, 4/3/2', 'ifp').rows[0].vals[0].v, SV.parseRatings('P, 6/1/1', 'ifp').errors.length], [24, 1]);
const dp = SV.parseDetection(INP.detection), DD = dp.rows.map((r) => r.row);
const lam = SV.lambdaOf(DD);
near('λ, mean share found by one evaluator (numpy)', lam.lam, REF.evaluators.lambda, 1e-12);
same('Problems found by one evaluator only', lam.once, REF.evaluators.once);
const ex = SV.exactCurve(DD);
ex.forEach((e, i) => near(`Exact mean share found by ${e.i} evaluators (all ${Math.round(K.choose(8, e.i))} groups enumerated with itertools)`, e.mean, REF.evaluators.curve[i], 1e-12));
const mcR = SV.mcCurve(DD, 20000, 1);
mcR.forEach((e, i) => near(`Monte Carlo mean for ${e.i} evaluators within 0.006 of the exact value`, e.mean, ex[i].mean, 0.006));
same('Nielsen-Landauer: evaluators for 75% and 90% at λ = 0.31', [SV.nlNeeded(0.31, 0.75), SV.nlNeeded(0.31, 0.9)], [4, 7]);
near('Lewis (2001) adjusted λ = ½(λ − 1/n)(1 − 1/n) + ½ λ/(1 + once/P)', lam.adj, 0.5 * (lam.lam - 1 / 8) * (1 - 1 / 8) + 0.5 * lam.lam / (1 + lam.once / lam.P), 1e-12);
const curve = { lam: lam.lam, n75: SV.nlNeeded(lam.lam, 0.75), n90: SV.nlNeeded(lam.lam, 0.9), mcAt3: ex[2].mean };
summary('Severity example', SV.severitySummary({ agg: sagg, ag: sag, mode: 'nielsen', evaluators: sp.evaluators, curve }), ['of 14 problems', 'Progress lost on back button'], 'medium', 'alpha (ordinal) = 0.70');
summary('Severity IFP example', SV.severitySummary({ agg: SV.aggregate(ifp.rows, 'ifp'), ag: SV.agreement(ifp.rows), mode: 'ifp', evaluators: ifp.evaluators }), 'of 8 problems', 'medium');
const noisy = SV.parseRatings('P,A,B\na,0,4\nb,4,0\nc,2,2\nd,1,3');
summary('Severity: poor agreement', SV.severitySummary({ agg: SV.aggregate(noisy.rows), ag: SV.agreement(noisy.rows), mode: 'nielsen', evaluators: noisy.evaluators }), 'of 4 problems', 'low');

// ── Human error probability ──
const hx = HR.heart('F', [{ id: 15, apoa: 0.4 }, { id: 9, apoa: 1 }, { id: 12, apoa: 0.8 }, { id: 18, apoa: 0.8 }, { id: 31, apoa: 0.6 }]);
near('HEART worked example: 0.003 × 1.8 × 6 × 3.4 × 2.2 × 1.12 (published 0.27)', hx.hep, REF.hra.heart_example, 1e-15);
same('HEART worked example rounds to the published 0.27', +hx.hep.toFixed(2), 0.27);
same('HEART assessed effects 1.8, 6, 3.4, 2.2, 1.12', hx.rows.map((r) => +r.effect.toFixed(10)), [1.8, 6, 3.4, 2.2, 1.12]);
same('HEART caps at 1', HR.heart('A', [{ id: 1, apoa: 1 }]).hep, 1);
same('HEART tables: 9 generic task types and 38 error-producing conditions', [HR.GTT.length, HR.EPC.length], [9, 38]);
const ix = (part, picks) => HR.PSF.map((p, i) => (p.id in picks ? p[part].findIndex(([l]) => l.startsWith(picks[p.id])) : HR.nominalIndex(p, part)));
const pump = HR.sparhPart('action', ix('action', { stress: 'High', complexity: 'Moderately', procedures: 'Available, but poor', ergonomics: 'Poor' }));
near('SPAR-H infusion-pump action: 4 negative PSFs, composite 200, adjusted HEP', pump.hep, REF.hra.sparh_pump_action, 1e-15);
same('SPAR-H pump: composite and negative count', [pump.composite, pump.negative, pump.adjusted], [200, 4, true]);
const d2 = HR.sparhPart('diagnosis', ix('diagnosis', { time: 'Barely', stress: 'High' }));
near('SPAR-H diagnosis with 2 negative PSFs: 0.01 × 20 (no adjustment)', d2.hep, REF.hra.sparh_diag_two_negative, 1e-15);
const d3 = HR.sparhPart('diagnosis', ix('diagnosis', { time: 'Barely', stress: 'High', complexity: 'Moderately' }));
near('SPAR-H diagnosis with 3 negative PSFs: 0.4/1.39 after adjustment', d3.hep, REF.hra.sparh_diag_three_negative, 1e-15);
near('SPAR-H diagnosis + action: Pd + Pa − Pd·Pa', HR.combine(d3.hep, pump.hep), REF.hra.combined, 1e-15);
for (const lv of ['low', 'moderate', 'high']) near(`SPAR-H ${lv} dependence`, HR.withDependence(pump.hep, lv), REF.hra.dep[lv], 1e-15);
same('SPAR-H inadequate time gives P = 1', HR.sparhPart('action', ix('action', { time: 'Inadequate' })).hep, 1);
same('SPAR-H all nominal gives the nominal HEPs', [HR.sparhPart('diagnosis', []).hep, HR.sparhPart('action', []).hep], [0.01, 0.001]);
summary('HEART example', HR.heartSummary(hx), ['0.27', 'task type F'], 'low', 'human error probability of 0.27');
summary('HEART: one mild condition', HR.heartSummary(HR.heart('E', [{ id: 26, apoa: 0.5 }])), 'task type E', 'medium');
summary('SPAR-H pump example', HR.sparhSummary({ parts: [pump], total: pump.hep, dep: pump.hep, depLevel: 'zero' }), '0.17', 'low');
summary('SPAR-H with dependence', HR.sparhSummary({ parts: [d2, HR.sparhPart('action', [])], total: HR.combine(d2.hep, 0.001), dep: HR.withDependence(HR.combine(d2.hep, 0.001), 'moderate'), depLevel: 'moderate' }), 'diagnosis and action');

// ── Colour contrast and difference ──
// Sharma, Wu and Dalal (2005), Table 1: all 34 CIEDE2000 test pairs (L1 a1 b1 L2 a2 b2 ΔE00).
const SHARMA = [
  [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425], [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615], [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
  [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0], [50, -1.1848, -84.8006, 50, 0, -82.7485, 1.0], [50, -0.9009, -85.5211, 50, 0, -82.7485, 1.0],
  [50, 0, 0, 50, -1, 2, 2.3669], [50, -1, 2, 50, 0, 0, 2.3669], [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792], [50, 2.49, -0.001, 50, -2.49, 0.001, 7.1792],
  [50, 2.49, -0.001, 50, -2.49, 0.0011, 7.2195], [50, 2.49, -0.001, 50, -2.49, 0.0012, 7.2195], [50, -0.001, 2.49, 50, 0.0009, -2.49, 4.8045],
  [50, -0.001, 2.49, 50, 0.001, -2.49, 4.8045], [50, -0.001, 2.49, 50, 0.0011, -2.49, 4.7461], [50, 2.5, 0, 50, 0, -2.5, 4.3065],
  [50, 2.5, 0, 73, 25, -18, 27.1492], [50, 2.5, 0, 61, -5, 29, 22.8977], [50, 2.5, 0, 56, -27, -3, 31.903], [50, 2.5, 0, 58, 24, 15, 19.4535],
  [50, 2.5, 0, 50, 3.1736, 0.5854, 1.0], [50, 2.5, 0, 50, 3.2972, 0, 1.0], [50, 2.5, 0, 50, 1.8634, 0.5757, 1.0], [50, 2.5, 0, 50, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644], [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731], [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373], [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441], [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377], [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];
SHARMA.forEach((r, i) => {
  near(`CIEDE2000 Sharma pair ${i + 1} (published ${r[6]})`, CC.deltaE2000(r.slice(0, 3), r.slice(3, 6)), r[6], 5e-5);
  near(`CIEDE2000 Sharma pair ${i + 1}, colours swapped`, CC.deltaE2000(r.slice(3, 6), r.slice(0, 3)), r[6], 5e-5);
});
const h = CC.parseHex;
// APCA-W3 reference values (README of the apca-w3 package, 0.0.98G-4g constants).
for (const [t, b, want] of [['#888', '#fff', 63.056469930209424], ['#fff', '#888', -68.54146436644962], ['#000', '#aaa', 58.146262578561334], ['#aaa', '#000', -56.24113336839742], ['#000', '#fff', 106.04067321268862], ['#fff', '#000', -107.88473318309848]]) {
  near(`APCA Lc, ${t} text on ${b} (APCA-W3 ${want.toFixed(3)})`, CC.apca(h(t), h(b)), want, 1e-3);
}
same('APCA: near-identical colours give Lc 0', CC.apca(h('#123'), h('#234')), 0);
for (const [a, b, want] of REF.wcag) near(`WCAG contrast ${a} on ${b} (independent Python)`, CC.contrast(h(a), h(b)), want, 1e-12);
same('Known pairs: black on white 21:1; #777 on white fails AA (4.47); #767676 passes (4.54)', [CC.contrast(h('#000'), h('#fff')), CC.contrast(h('#777'), h('#fff')) >= 4.5, CC.contrast(h('#767676'), h('#fff')) >= 4.5], [21, false, true]);
same('Ratio display truncates, never rounds up to a pass: 4.478 shows 4.47:1', CC.ratioText(CC.contrast(h('#777'), h('#fff'))), '4.47:1');
for (const [hex, lab] of Object.entries(REF.lab)) same(`CIELAB of ${hex} (numpy, D65)`, CC.toLab(h(hex)).map((v) => +v.toFixed(9)), lab.map((v) => +v.toFixed(9)));
same('Lab → sRGB round trip for #123456 and the brand blue', [CC.toHex(CC.fromLab(CC.toLab(h('#123456')))), CC.toHex(CC.fromLab(CC.toLab(h('#2a6fdb'))))], ['#123456', '#2a6fdb']);
const np45 = CC.nearestPassing(h('#777777'), h('#ffffff'), 4.5), np7 = CC.nearestPassing(h('#2a6fdb'), h('#ffffff'), 7);
truthy('Nearest passing colour for #777 on white reaches 4.5:1 with a tiny change (ΔE < 2)', np45.ratio >= 4.5 && np45.de < 2);
truthy('Nearest AAA colour for brand blue reaches 7:1', np7.ratio >= 7);
same('Palette parser reads names and 3- or 6-digit hex', CC.parsePalette('Ink #1b1f24\n#fff\nbad').colours.map((c) => [c.name, c.hex]), [['Ink', '#1b1f24'], ['#ffffff', '#ffffff']]);
const cs = (fg, bg) => CC.colourSummary({ fgHex: fg, bgHex: bg, ratio: CC.contrast(h(fg), h(bg)), lc: CC.apca(h(fg), h(bg)), de: CC.deltaE(h(fg), h(bg)) });
summary('Colour example (#777 on white)', cs('#777777', '#ffffff'), ['#777777 on #ffffff', '4.47:1'], 'medium', '4.47:1');
summary('Colour: black on white', cs('#000000', '#ffffff'), '21.00:1', 'high');
summary('Colour: WCAG and APCA disagree (white on orange)', cs('#ffffff', '#e67e22'), 'fails', 'medium');
summary('Colour: grey text on black (WCAG passes, APCA below body text)', cs('#a0a0a0', '#000000'), 'passes', 'low');

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
