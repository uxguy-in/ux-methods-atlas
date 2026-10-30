// Checks the "scorers" tools (questionnaire scorer pack, agreement indices, item analysis and Rasch, survey
// weighting) in client/src/calc/tools/scorers-*.js against pingouin, scipy, statsmodels, girth, samplics, ipfn and
// numpy (server/scripts/scorers-reference.py, run on the example data in scorers-input.json written by
// scorers-dump.js) and against the published Shrout and Fleiss (1979) ICC example. Also unit-tests the
// "Reading your results" summaries and their confidence rules. Run with `npm run check:scorers`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from '../../client/src/calc/tools/scorers-math.js';
import * as A from '../../client/src/calc/tools/scorers-agree.js';
import * as Q from '../../client/src/calc/tools/scorers-qkeys.js';
import * as I from '../../client/src/calc/tools/scorers-items.js';
import * as Wt from '../../client/src/calc/tools/scorers-rake.js';
import { QUESTIONNAIRE_EXAMPLES as EX, ITEM_EXAMPLE, WEIGHT_EXAMPLE, WEIGHT_TARGETS } from '../../client/src/calc/tools/scorers-examples.js';
import { CATALOG } from '../../client/src/calc/catalog.js';
import { kinds } from '../lib/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'scorers-reference.json'), 'utf8'));
const IN = JSON.parse(readFileSync(path.join(here, 'scorers-input.json'), 'utf8'));
let fails = 0, passes = 0;
const fmt = (v) => (Array.isArray(v) ? `[${v.map(fmt).join(', ')}]` : Number.isFinite(v) ? String(+v.toFixed(6)) : String(v));
function near(label, got, want, tol = 1e-6) {
  const g = [got].flat(3), w = [want].flat(3);
  const ok = g.length === w.length && g.every((x, i) => Number.isFinite(x) && Math.abs(x - w[i]) <= tol);
  if (ok) passes++; else fails++;
  const worst = g.length === w.length ? Math.max(...g.map((x, i) => Math.abs(x - w[i]))) : NaN;
  const short = (v) => (v.length > 8 ? `${fmt(v.slice(0, 6))}…(${v.length})` : fmt(v));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${short(w)}, got ${short(g)}${g.length > 1 ? ` (max diff ${worst.toExponential(1)})` : ''}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const calcIds = new Set(CATALOG.map((c) => c.id));
// The same rules check-summaries.js applies to the page's own summaries.
function summary(label, s, key) {
  const all = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  const ok = typeof s.headline === 'string' && s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && ['high', 'medium', 'low'].includes(s.confidence)
    && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20
    && !/undefined|NaN|\bnull\b|—|not available|n\/a/.test(all) && !/\]\(\//.test(s.report)
    && [...all.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)].every((m) => { const [, kind, target] = m[1].split('/'); return kind === 'calculators' ? calcIds.has(target) : kind === 'methods' ? kinds.byId.has(target) : false; })
    && !/(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?true/i.test(all);
  same(`${label}: summary complete, plain, valid links, no NaN, no "% chance the true value" wording`, ok, true);
  if (!ok) console.log(JSON.stringify(s, null, 1));
  for (const k of [].concat(key || [])) truthy(`${label}: headline and report mention "${k}"`, s.headline.includes(k) && s.report.includes(k));
  return s;
}
const arr = (rows) => rows.map((r) => r.map((v) => (v === null ? NaN : v)));

// ── Distributions ──
console.log('\n── Distributions (scipy.stats) ──');
near('χ² survival at (30, 20), (3.2, 1), (150, 120), (0.5, 7)', [M.chi2Sf(30, 20), M.chi2Sf(3.2, 1), M.chi2Sf(150, 120), M.chi2Sf(0.5, 7)], [0.06985366069940986, 0.07363827012030258, 0.03307348091130466, 0.9994464813904249], 1e-12);
near('F survival at (3.1; 4, 20) and (1.2; 6.67, 33.3)', [M.fSf(3.1, 4, 20), M.fSf(1.2, 6.67, 33.3)], [0.03877408813088653, 0.3301765080700224], 1e-10);
near('Exact two-sided binomial p (scipy binomtest)', [M.binomTest(46, 118, 0.4).p, M.binomTest(7, 20, 0.3).p, M.binomTest(3, 30, 0.5).p], [0.8514418045546575, 0.6294979666766769, 8.430331945419312e-06], 1e-12);

// ── Agreement ──
console.log('\n── Intraclass correlation (pingouin.intraclass_corr; Shrout and Fleiss 1979) ──');
for (const [name, rows, ref] of [['Shrout-Fleiss data', IN.sf, REF.sf], ['Example sessions', IN.icc, REF.icc]]) {
  const r = A.icc(rows);
  near(`${name}: six ICCs`, r.forms.map((f) => f.icc), ref.icc, 1e-12);
  near(`${name}: 95% lower bounds (scipy F quantiles, pingouin formulas)`, r.forms.map((f) => f.lo), ref.lo, 1e-6);
  near(`${name}: 95% upper bounds (scipy F quantiles, pingouin formulas)`, r.forms.map((f) => f.hi), ref.hi, 1e-6);
  near(`${name}: 95% bounds as pingouin prints them (rounded to 2 decimals)`, r.forms.flatMap((f) => [+f.lo.toFixed(2), +f.hi.toFixed(2)]), ref.pgLo.flatMap((l, i) => [l, ref.pgHi[i]]), 1e-9);
  near(`${name}: F statistics`, r.forms.map((f) => f.F), ref.F, 1e-10);
  near(`${name}: denominator df`, r.forms.map((f) => f.df2), ref.df2, 0);
  near(`${name}: p-values`, r.forms.map((f) => f.p), ref.p, 1e-9);
}
near('Shrout and Fleiss (1979) published ICCs to 2 decimals (.17 .29 .71 .44 .62 .91)', A.icc(IN.sf).forms.map((f) => +f.icc.toFixed(2)), [0.17, 0.29, 0.71, 0.44, 0.62, 0.91], 1e-9);
const icc90 = A.icc(IN.icc, 0.9); truthy('A 90% interval is narrower than the 95% interval', icc90.forms[1].hi - icc90.forms[1].lo < A.icc(IN.icc).forms[1].hi - A.icc(IN.icc).forms[1].lo);
same('Form picker: same raters, agreement, single → ICC2; different raters, mean → ICC1k; consistency, mean → ICC3k', [A.pickForm({ sameRaters: true, agreement: true, average: false }), A.pickForm({ sameRaters: false, average: true }), A.pickForm({ sameRaters: true, agreement: false, average: true })], ['ICC2', 'ICC1k', 'ICC3k']);
same('Koo and Li bands at 0.49, 0.6, 0.8, 0.95', [0.49, 0.6, 0.8, 0.95].map(A.kooLi), ['poor', 'moderate', 'good', 'excellent']);

console.log("\n── Kendall's W (pingouin.friedman, scipy.stats.friedmanchisquare) ──");
for (const [name, rows, ref] of [['Feature ranking', IN.w, REF.w], ['Scores with ties', IN.wTies, REF.wTies]]) {
  const r = A.kendallW(rows);
  near(`${name}: W`, r.W, ref.W, 1e-12);
  near(`${name}: χ² (pingouin Q, scipy Friedman)`, [r.chi2, r.chi2], [ref.Q, ref.scipyQ], 1e-9);
  near(`${name}: χ² p-value`, r.p, ref.p, 1e-12);
  near(`${name}: F and its p-value (pingouin method="f")`, [r.F, r.pF, r.fdf1], [ref.F, ref.pF, ref.df1F], 1e-9);
}
truthy('Tie correction raises W above the uncorrected value when there are ties', A.kendallW(IN.wTies).W > A.kendallW(IN.wTies).Wraw);

console.log('\n── rwg / rwg(j) and AD(M) (numpy, James, Demaree and Wolf 1984) ──');
const rw = A.rwg(IN.rwg.map((g) => ({ name: g.name, raters: arr(g.raters) })), { A: 5 });
near('rwg(j) unconstrained, per team', rw.groups.map((g) => g.raw), REF.rwg.groups.map((g) => g.raw), 1e-12);
near('rwg(j) reported (out-of-range set to 0), per team', rw.groups.map((g) => g.value), REF.rwg.groups.map((g) => g.value), 1e-12);
near('AD(M), per team', rw.groups.map((g) => g.adm), REF.rwg.groups.map((g) => g.adm), 1e-12);
near('Median rwg(j)', rw.median, REF.rwg.median, 1e-12);
near('Single item: 3 raters answering 4, 5, 4 on a 5-point scale → 1 − (1/3)/2 = 0.8333', A.rwg([{ name: 'a', raters: [[4], [5], [4]] }], { A: 5 }).groups[0].value, 1 - (1 / 3) / 2, 1e-12);
same('LeBreton and Senter bands at 0.25, 0.45, 0.65, 0.85, 0.95', [0.25, 0.45, 0.65, 0.85, 0.95].map(A.leBreton), ['lack of agreement', 'weak agreement', 'moderate agreement', 'strong agreement', 'very strong agreement']);

console.log('\n── Bland-Altman (pingouin.plot_blandaltman formulas; scipy t.interval, linregress) ──');
for (const [name, pctMode, ref] of [['Differences', false, REF.ba], ['Percent differences', true, REF.baPct]]) {
  const r = A.blandAltman(IN.ba.map((x) => x[0]), IN.ba.map((x) => x[1]), { percent: pctMode });
  near(`${name}: bias and SD`, [r.bias, r.sd], [ref.bias, ref.sd], 1e-10);
  near(`${name}: bias 95% CI`, [r.biasLo, r.biasHi], ref.biasCI, 1e-8);
  near(`${name}: limits of agreement`, [r.lower, r.upper], [ref.lower, ref.upper], 1e-8);
  near(`${name}: CIs of the limits`, [r.lowerLo, r.lowerHi, r.upperLo, r.upperHi], [...ref.lowerCI, ...ref.upperCI], 1e-7);
  near(`${name}: proportional-bias slope and p`, [r.reg.b, r.reg.p], [ref.slope, ref.slopeP], 1e-8);
  near(`${name}: one-sample t p for the bias`, r.pBias, ref.pBias, 1e-8);
}

// ── Questionnaires ──
console.log('\n── Questionnaire scoring (independent pandas scoring; scipy t intervals; pingouin alpha) ──');
const qrows = (id) => arr(IN.q[id]);
function checkScales(id, ref, opts = {}, label = id) {
  const r = Q.scoreInstrument(id, qrows(id), opts);
  for (const s of r.scales) {
    const w = ref[s.key];
    near(`${label} ${s.key}: n, mean, SD, 95% CI`, [s.n, s.mean, s.sd, s.lo, s.hi], [w.n, w.mean, w.sd, w.lo, w.hi], 1e-9);
    if (w.alpha !== null) near(`${label} ${s.key}: Cronbach's alpha`, s.alpha, w.alpha, 1e-9);
    if (w.t !== undefined) near(`${label} ${s.key}: t and p against the Lewis (2002) norm`, [s.test.t, s.test.p], [w.t, w.p], 1e-9);
  }
  return r;
}
const ps = checkScales('pssuq', REF.pssuq);
same('PSSUQ norms (Lewis 2002 via Sauro and Lewis 2016)', ps.scales.map((s) => s.bench), [2.82, 2.80, 3.02, 2.49]);
const rev = Q.scoreInstrument('pssuq', qrows('pssuq').map((r) => r.map((v) => (Number.isFinite(v) ? 8 - v : v))), { polarity: 'rev' });
near('PSSUQ reversed form (7 = agree) scores the same as the standard form', rev.scales[0].mean, REF.pssuq.Overall.mean, 1e-12);
checkScales('ues', REF.ues, {}, 'UES-SF');
checkScales('tam', REF.tam, { polarity: 'std' }, 'TAM');
checkScales('sam', REF.sam, {}, 'SAM');
checkScales('smeq', REF.smeq, {}, 'SMEQ');
checkScales('asq', REF.asq, {}, 'ASQ');
checkScales('geq', REF.geq, {}, 'GEQ');
checkScales('swls', REF.swls, {}, 'SWLS');
checkScales('pens', REF.pens, { groups: IN.pensGroups }, 'Raw groups (PENS)');
same('GEQ key covers items 1–33 exactly once', Q.INSTRUMENTS.geq.subscales.flatMap((s) => s.items).sort((a, b) => a - b), Array.from({ length: 33 }, (_, i) => i + 1));
same('UES-SF: PU items reversed, 12 items', [Q.INSTRUMENTS.ues.subscales.find((s) => s.key === 'PU').reverse, Q.INSTRUMENTS.ues.items], [[4, 5, 6], 12]);
same('SWLS bands (Pavot and Diener 2008) at 7, 12, 17, 20, 23, 28, 33', [7, 12, 17, 20, 23, 28, 33].map(Q.swlsBand), ['extremely dissatisfied', 'dissatisfied', 'slightly dissatisfied', 'neutral', 'slightly satisfied', 'satisfied', 'extremely satisfied']);
same('SMEQ anchor nearest 30 and 90', [Q.smeqLabel(30), Q.smeqLabel(90)], ['a bit hard to do', 'very hard to do']);
near('PSSUQ 0–100 rescaling: 1 → 100, 4 → 50, 7 → 0', [Q.rescale100(1), Q.rescale100(4), Q.rescale100(7)], [100, 50, 0], 1e-12);
same('Groups spec "A: 1-3, 5; B: 4 6"', Q.parseGroupsSpec('A: 1-3, 5; B: 4 6', 6), [{ key: 'A', items: [1, 2, 3, 5] }, { key: 'B', items: [4, 6] }]);
const oneMissing = Q.scoreInstrument('swls', [[5, 5, 5, 5, NaN], [4, 4, 4, 4, 4], [6, 6, 6, 6, 6]]);
same('SWLS needs all five items (a respondent with one missing is not scored)', oneMissing.scales[0].n, 2);
const halfRule = Q.scoreInstrument('asq', [[2, NaN, NaN], [2, 3, NaN], [1, 1, 1]]);
same('ASQ needs at least half the items (2 of 3)', halfRule.scales[0].n, 2);

console.log('\n── Semantic differential and product/market fit (scipy, statsmodels) ──');
const sd = Q.parseSemantic(EX.sd);
const sp = Q.semanticProfile(sd.rows, sd.groups, sd.pairs);
for (const [k, g] of sp.prof.entries()) {
  near(`${g.group}: pair means`, g.items.map((x) => x.mean), REF.sd.prof[k].means, 1e-12);
  near(`${g.group}: 95% CI lower and upper`, [...g.items.map((x) => x.lo), ...g.items.map((x) => x.hi)], [...REF.sd.prof[k].lo, ...REF.sd.prof[k].hi], 1e-9);
}
near("Osgood's profile distance D", sp.D, REF.sd.D, 1e-12);
const pm = Q.pmf(IN.pmf);
near('PMF share and Wilson 95% CI (statsmodels)', [pm.share, pm.lo, pm.hi], [REF.pmf.share, REF.pmf.lo, REF.pmf.hi], 1e-9);
near('PMF exact binomial p, two-sided and "greater" (scipy binomtest)', [pm.pTwo, pm.pAbove], [REF.pmf.pTwo, REF.pmf.pGreater], 1e-12);
const pmNA = Q.pmf(IN.pmf, { includeNA: true });
near('PMF with "no longer use" in the base: n and Wilson CI', [pmNA.n, pmNA.lo, pmNA.hi], [REF.pmfNA.n, REF.pmfNA.lo, REF.pmfNA.hi], 1e-9);
same('PMF parser: words, codes and counts', Q.parsePmf('very\n2\nNot disappointed\nN/A\nI no longer use it\nsomewhat, 3\n1').counts, { very: 2, somewhat: 4, not: 1, na: 2 });

// ── Item analysis ──
console.log('\n── Classical item analysis (pingouin cronbach_alpha, scipy pointbiserialr, numpy) ──');
const pi = I.parseItems(ITEM_EXAMPLE);
same('Example parses 160 people × 20 items with a 20-letter key', [pi.rows.length, pi.rows[0].length, pi.key.length], [160, 20, 20]);
same('Example parsed scores equal the dump', pi.rows, IN.items.rows);
const ca = I.classical(pi.rows, { raw: pi.raw, key: pi.key });
near('KR-20 / alpha (pingouin)', ca.alpha, REF.classical.alpha, 1e-12);
near('SEM = SD·√(1 − alpha)', ca.sem, REF.classical.sem, 1e-10);
near('Difficulty p, 20 items', ca.items.map((x) => x.p), REF.classical.items.map((x) => x.p), 1e-12);
near('Upper-lower D (27% groups, stable tie order), 20 items', ca.items.map((x) => x.D), REF.classical.items.map((x) => x.D), 1e-12);
near('Point-biserial r (scipy), 20 items', ca.items.map((x) => x.rpb), REF.classical.items.map((x) => x.rpb), 1e-10);
near('Corrected item-total r (numpy), 20 items', ca.items.map((x) => x.rit), REF.classical.items.map((x) => x.rit), 1e-10);
near('Alpha if deleted (pingouin), 20 items', ca.items.map((x) => x.aid), REF.classical.items.map((x) => x.aid), 1e-10);
const d7 = ca.items[6].distractors.filter((d) => d.option !== '(blank)');
near('Distractor shares for Q7 (all, upper, lower)', d7.flatMap((d) => [d.all, d.upper, d.lower]), REF.distractor7.filter((d) => d.option !== '').flatMap((d) => [d.all, d.upper, d.lower]), 1e-12);
truthy('Miskeyed Q7 is flagged "negative: check key"', ca.items[6].flags.includes('negative: check key'));
same('Ebel and Frisbie bands at .45, .35, .25, .1', [0.45, 0.35, 0.25, 0.1].map(I.ebel), ['very good', 'reasonably good', 'marginal', 'poor']);

console.log('\n── Rasch model (scipy CML and JML, girth 0.8 rasch_conditional, numpy fit statistics) ──');
const ra = I.rasch(pi.rows);
same('Items kept (none extreme)', ra.keepItems, REF.rasch.keep);
same('Persons used in estimation (non-extreme scores)', ra.nUsed, REF.rasch.nUsed);
near('CML difficulties (scipy BFGS on the conditional likelihood, gtol 1e-10)', ra.b, REF.rasch.b, 2e-6);
near('CML difficulties (girth rasch_conditional, its 1e-3 stopping rule)', ra.b, REF.rasch.girth, 2e-3);
near('CML standard errors (numerical Hessian of the conditional likelihood)', ra.se, REF.rasch.se, 1e-4);
near('Person measure for each raw score 0–20, extreme scores at 0.3 and 19.7 (scipy brentq)', ra.byScore.map((x) => x.theta), REF.rasch.theta, 1e-5);
near('Person SE for each raw score', ra.byScore.map((x) => x.se), REF.rasch.thetaSe, 1e-5);
near('Item infit mean-squares', ra.itemFit.map((f) => f.infit), REF.rasch.infit, 1e-5);
near('Item outfit mean-squares', ra.itemFit.map((f) => f.outfit), REF.rasch.outfit, 1e-5);
near('Item infit ZSTD (Wilson-Hilferty)', ra.itemFit.map((f) => f.inZ), REF.rasch.inZ, 1e-4);
near('Item outfit ZSTD (Wilson-Hilferty)', ra.itemFit.map((f) => f.outZ), REF.rasch.outZ, 1e-4);
const firstFit = ra.personFit.filter(Boolean).slice(0, 10);
near('Person infit and outfit, first 10 non-extreme people', [...firstFit.map((f) => f.infit), ...firstFit.map((f) => f.outfit)], [...REF.rasch.personInfit, ...REF.rasch.personOutfit], 1e-5);
near('Person and item separation reliability', [ra.relPerson, ra.relItem], [REF.rasch.relP, REF.rasch.relI], 1e-5);
const rj = I.rasch(pi.rows, { method: 'JML' });
near('JML difficulties before correction (scipy BFGS on the joint likelihood)', rj.raw, REF.rasch.jmlRaw, 1e-5);
near('JML difficulties × (L − 1)/L', rj.b, REF.rasch.jml, 1e-5);
truthy('Q7 (miskeyed) is the worst-fitting item by outfit', ra.itemFit.map((f) => f.outfit).indexOf(Math.max(...ra.itemFit.map((f) => f.outfit))) === 6);
// A longer test (60 items, 400 simulated people) checks the stable ESF removal on extreme difficulties.
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const bTrue = Array.from({ length: 60 }, (_, i) => -3.5 + (7 * i) / 59);
const big = Array.from({ length: 400 }, () => { const t = 2 * (rnd() + rnd() + rnd() - 1.5); return bTrue.map((b) => (rnd() < 1 / (1 + Math.exp(-(t - b))) ? 1 : 0)); });
const rb = I.rasch(big);
truthy('60-item CML converges and recovers the generating difficulties (correlation > 0.98)', rb.converged && M.pearson(rb.b, rb.keepItems.map((j) => bTrue[j])) > 0.98);
const rbg = I.raschCML(I.raschPrep(big).X);
truthy('60-item CML standard errors are finite and positive', rbg.se.every((x) => x > 0 && Number.isFinite(x)));

// ── Survey weighting ──
console.log('\n── Survey weighting (samplics rake and TaylorEstimator, ipfn) ──');
const sv = Wt.parseSurvey(WEIGHT_EXAMPLE), tg = Wt.parseTargets(WEIGHT_TARGETS).targets;
same('Targets parse to three variables and normalise to 1', tg.map((t) => +t.levels.reduce((a, l) => a + l.share, 0).toFixed(12)), [1, 1, 1]);
same('Targets match the data', Wt.checkTargets(sv, tg), []);
const rk = Wt.rake(sv.rows, tg);
near('Raked weights, first 20 (samplics SampleWeight.rake)', rk.w.slice(0, 20), REF.weight.samplics, 1e-8);
near('Raked weights, first 20 (ipfn)', rk.w.slice(0, 20), REF.weight.ipfn, 1e-8);
near('samplics and ipfn agree with each other (max abs diff)', REF.weight.maxAbsSamplicsIpfn, 0, 1e-8);
near('Kish design effect and effective n', [rk.deff, rk.nEff], [REF.weight.deff, REF.weight.nEff], 1e-6);
near('Min and max weight', [rk.min, rk.max], [REF.weight.min, REF.weight.max], 1e-8);
truthy('Every weighted margin equals its target within 1e-9', rk.margins.every((m) => m.levels.every((l) => Math.abs(l.weighted - l.target) < 1e-9)));
const es = Wt.estimates(sv, rk.w, ['satisfaction', 'will_renew']);
const sat = es[0].rows[0], yes = es[1].rows.find((x) => x.label === 'Yes');
for (const [name, got, ref] of [['Weighted mean satisfaction', sat.wt, REF.weight.est.satisfaction_w], ['Unweighted mean satisfaction', sat.un, REF.weight.est.satisfaction_u], ['Weighted share renewing', yes.wt, REF.weight.est.renewYes_w], ['Unweighted share renewing', yes.un, REF.weight.est.renewYes_u]]) {
  near(`${name}: estimate, SE and 95% CI (samplics TaylorEstimator)`, [got.mean, got.se, got.lo, got.hi], [ref.mean, ref.se, ref.lo, ref.hi], 1e-9);
}
const rt = Wt.rake(sv.rows, tg, { trim: { lo: 0.3, hi: 3 } });
near('Trimmed at [0.3, 3] × mean then re-raked: first 20 weights (numpy, same algorithm written independently)', rt.w.slice(0, 20), REF.weight.trim.first20, 1e-6);
near('Trimmed: min, max and design effect', [rt.min, rt.max, rt.deff], [REF.weight.trim.min, REF.weight.trim.max, REF.weight.trim.deff], 1e-6);
near('Kish deff of weights 1,1,2,2 = 4·10/36', Wt.weightStats([1, 1, 2, 2]).deff, 40 / 36, 1e-12);
same('Missing target level is reported', Wt.checkTargets(sv, [{ variable: 'plan', levels: [{ level: 'Free', share: 0.5 }, { level: 'Gold', share: 0.5 }] }]).length, 2);

// ── Summaries and confidence rules ──
console.log('\n── Reading your results: summaries and confidence rules ──');
const iccS = summary('ICC', A.iccSummary(A.icc(IN.sf), 'ICC2'), 'ICC(2,1) = 0.29');
same('ICC summary: Shrout-Fleiss data is low confidence (6 targets)', iccS.confidence, 'low');
same('ICC confidence rule', [A.iccConfidence(40, 0.15), A.iccConfidence(20, 0.5), A.iccConfidence(8, 0.6)], ['high', 'medium', 'low']);
summary('ICC session example, average form', A.iccSummary(A.icc(IN.icc), 'ICC2k'), 'ICC(2,k)');
const wS = summary("Kendall's W", A.kendallSummary(A.kendallW(IN.w)), "Kendall's W = 0.80");
same("Kendall's W summary: high confidence with 6 judges, 8 items, p < .001", wS.confidence, 'high');
summary('rwg', A.rwgSummary(rw), 'rwg(j)');
const baR = A.blandAltman(IN.ba.map((x) => x[0]), IN.ba.map((x) => x[1]));
const baS = summary('Bland-Altman', A.baSummary(baR, { tol: 5 }), 'limits of agreement');
truthy('Bland-Altman summary: medium confidence with 32 pairs, mentions the acceptable difference', baS.confidence === 'medium' && baS.meaning.some((m) => m.includes('±5')));
const psS = summary('PSSUQ', Q.questionnaireSummary(ps), 'PSSUQ');
truthy('PSSUQ summary cites the Lewis norm and the 0–100 rescaling', psS.meaning.some((m) => m.includes('published mean 2.82')) && psS.meaning.some((m) => m.includes('0–100')));
same('Questionnaire confidence rule (n, half-width share, alpha)', [Q.questionnaireConfidence(40, 0.04, 0.85), Q.questionnaireConfidence(40, 0.04, 0.6), Q.questionnaireConfidence(12, 0.2, NaN), Q.questionnaireConfidence(5, 0.3, NaN)], ['high', 'medium', 'medium', 'low']);
for (const id of ['csuq', 'asq', 'smeq', 'ues', 'tam', 'sam', 'geq', 'swls']) summary(id.toUpperCase(), Q.questionnaireSummary(Q.scoreInstrument(id, qrows(id))), Q.INSTRUMENTS[id].short);
summary('Raw groups', Q.questionnaireSummary(Q.scoreInstrument('pens', qrows('pens'), { groups: IN.pensGroups })));
summary('Semantic differential', Q.semanticSummary(sp), 'D = ');
const pmS = summary('PMF', Q.pmfSummary(pm), '39%');
same('PMF summary: not clearly above or below 40%, medium confidence (118 answers, CI includes 40%)', [pmS.headline.includes('not clearly above or below'), pmS.confidence], [true, 'medium']);
const clS = summary('Classical items', I.classicalSummary(ca, pi.names), 'KR-20');
truthy('Classical summary names Q7 as a key problem', clS.meaning.some((m) => m.startsWith('Q7 correlates negatively')));
const raS = summary('Rasch', I.raschSummary(ra, pi.names), 'Rasch');
same('Rasch summary: high confidence with 100+ non-extreme people', raS.confidence, 'high');
summary('Rasch JML', I.raschSummary(rj, pi.names), 'JML');
const wsS = summary('Weighting', Wt.weightingSummary(rk, es), 'design effect');
same('Weighting summary confidence (effective n 281: medium)', wsS.confidence, 'medium');

// ── Catalog ──
console.log('\n── Catalog ──');
for (const id of ['questionnaires', 'agreement', 'item-analysis', 'survey-weighting']) {
  const c = CATALOG.find((x) => x.id === id);
  truthy(`Catalog has "${id}" and all its method ids exist`, c && c.methods.length && c.methods.every((m) => kinds.byId.has(m)));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
