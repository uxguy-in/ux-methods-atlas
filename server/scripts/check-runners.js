// Checks the runner tools (client/src/calc/tools/runners-*): preference test, MaxDiff runner and product reaction cards,
// against scipy and statsmodels and by hand. Run with `npm run check:runners`.
// Reference values: server/scripts/runners-reference.py (scipy 1.18, statsmodels 0.15), saved in runners-reference.json,
// on the examples written by runners-dump.js to runners-reference-input.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
import * as C from '../../client/src/calc/tools/runners-common.js';
import * as P from '../../client/src/calc/tools/runners-preference.js';
import * as M from '../../client/src/calc/tools/runners-maxdiff.js';
import * as R from '../../client/src/calc/tools/runners-cards.js';
import { runnersInput } from './runners-dump.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(path.join(here, 'runners-reference.json'), 'utf8'));
const input = JSON.parse(readFileSync(path.join(here, 'runners-reference-input.json'), 'utf8'));

let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${+Number(want).toPrecision(12)}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
function maxDiff(label, got, want, tol) {
  let m = 0; got.forEach((v, i) => { m = Math.max(m, Math.abs(v - want[i])); });
  const ok = got.length === want.length && m <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got.length} values, largest difference ${m.toExponential(2)} (tolerance ${tol})`);
}
const LEVELS = ['high', 'medium', 'low'];
function summaryShape(label, s) {
  const ok = s && typeof s.headline === 'string' && s.headline.length > 10 && Array.isArray(s.meaning) && s.meaning.length > 0 && s.meaning.every((m) => typeof m === 'string' && m.length > 0)
    && LEVELS.includes(s.confidence) && typeof s.confidenceNote === 'string' && s.confidenceNote.startsWith('Rule:') && Array.isArray(s.caveats) && Array.isArray(s.next) && s.next.length > 0 && typeof s.report === 'string' && s.report.length > 20
    && !/NaN|undefined|Infinity|\bnull\b|n\/a/.test(JSON.stringify(s));
  same(`${label}: summary has every part, in words, with no NaN, undefined or empty values`, !!ok, true);
  same(`${label}: 1–6 points, 1–3 caveats, 1–3 next steps, no link markup in the report`, [s.meaning.length <= 6, s.caveats.length >= 1 && s.caveats.length <= 3, s.next.length <= 3, !/\]\(\//.test(s.report)], [true, true, true, true]);
  same(`${label}: no "% chance the true value" wording`, /(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?true/i.test(JSON.stringify(s)), false);
}

// ── The examples still produce the data the Python reference used ──
same('Example data still match runners-reference-input.json', JSON.stringify(runnersInput()) === JSON.stringify(input), true);

// ── Codes ──
{
  const s = P.exampleStudy(), r = P.exampleResults(s)[0];
  same('Preference: study code round-trips', P.decodeStudy(P.encodeStudy(s)), s);
  same('Preference: result code round-trips', P.decodeResult(P.encodeResult(r)), r);
  const ms = M.exampleStudy();
  same('MaxDiff: study code round-trips (with the design)', M.decodeStudy(M.encodeStudy(ms)), ms);
  const rs = R.exampleStudy();
  same('Reaction cards: study code round-trips', R.decodeStudy(R.encodeStudy(rs)), rs);
  let threw = 0; for (const f of [() => P.decodeStudy(M.encodeStudy(ms)), () => M.decodeResult(P.encodeResult(r)), () => R.decodeStudy(P.encodeStudy(s))]) { try { f(); } catch { threw++; } }
  same('Each tool rejects the other tools\' codes', threw, 3);
  const parsed = C.parseCodes(`${P.encodeResult(r)}\nnot-a-code\n${P.encodeResult(r)}\n${P.encodeResult({ ...r, s: 'other', p: 'X' })}`, P.decodeResult, s.id);
  same('parseCodes: keeps one, counts the bad code, the duplicate and the other study', [parsed.results.length, parsed.bad.length, parsed.dupes, parsed.other], [1, 1, 1, 1]);
}

// ── Preference test vs scipy and statsmodels ──
{
  const study = P.exampleStudy(), an = P.analyse(study, P.exampleResults(study)), rp = ref.preference;
  same('Preference example: counts per design', an.counts, rp.counts);
  an.designs.forEach((d, i) => { near(`Preference: Wilson lower bound, design ${i + 1} (statsmodels proportion_confint wilson)`, d.ci.lo, rp.wilson[i][0], 1e-9); near(`Preference: Wilson upper bound, design ${i + 1}`, d.ci.hi, rp.wilson[i][1], 1e-9); });
  near('Preference: chi-square goodness of fit (scipy chisquare)', an.overall.stat, rp.gof_stat, 1e-12);
  near('Preference: chi-square p-value', an.overall.p, rp.gof_p, 1e-9);
  near('Preference: head-to-head exact binomial p (scipy binomtest)', an.head.p, rp.head_p, 1e-9);
  same('Preference: segment × design table', an.segments.rows.map((r) => r.counts), rp.table);
  near('Preference: chi-square of independence (scipy chi2_contingency, no correction)', an.segments.test.stat, rp.chi2, 1e-9);
  near('Preference: its p-value', an.segments.test.p, rp.chi2_p, 1e-9);
  same('Preference: its degrees of freedom', an.segments.test.df, rp.chi2_df);
  near("Preference: Cramér's V", an.segments.test.v, rp.cramers_v, 1e-12);
  an.segments.rows.forEach((r, g) => r.ci.forEach((ci, i) => near(`Preference: segment ${g + 1}, design ${i + 1} Wilson lower bound`, ci.lo, rp.segment_wilson[g][i][0], 1e-9)));
  same('Preference: chose the first design shown', an.position.first, rp.first);
  near('Preference: position-bias exact binomial p (vs 1/3)', an.position.test.p, rp.position_p, 1e-9);
  for (const b of ref.binom) near(`Exact binomial test ${b.k}/${b.n} vs ${+b.p0.toFixed(3)} (scipy binomtest)`, C.binomTest(b.k, b.n, b.p0).p, b.p, 1e-9);
  const g = C.chiSquareGof(ref.gof_small.counts);
  near('Chi-square goodness of fit, 9/4/2 (scipy)', g.stat, ref.gof_small.stat, 1e-12); near('  its p-value', g.p, ref.gof_small.p, 1e-9);
  const t = C.chiSquareTable(ref.table22.table);
  near('Chi-square, 2 × 2 table (scipy, no correction)', t.stat, ref.table22.chi2, 1e-9); near('  its p-value', t.p, ref.table22.p, 1e-9);
  near("Fisher's exact on the same table (scipy fisher_exact)", S.fisherExact(18, 7, 9, 14), ref.table22.fisher_p, 1e-9);
  same('chiSquareTable drops an empty row and column', C.chiSquareTable([[5, 0, 3], [0, 0, 0], [2, 0, 6]]).df, 1);

  // Summaries
  const sm = P.summary(an);
  summaryShape('Preference example', sm);
  same('Preference example: confidence (overall p 0.048, head to head p 0.23 → some evidence)', sm.confidence, 'medium');
  same('Preference example: segment difference is reported', sm.meaning.some((m) => /segments chose differently/.test(m)), true);
  // Two designs, clear winner.
  const s2 = P.makeStudy({ id: 'two', name: 'Two', question: 'Which?', designs: [{ l: 'Old', x: 'a' }, { l: 'New', x: 'b' }] });
  const res2 = [...Array(40)].map((_, i) => ({ v: 1, t: 'prefr', s: 'two', p: `p${i}`, c: i < 29 ? 1 : 0, o: i % 2 ? [0, 1] : [1, 0], y: '', g: -1, ms: 5000 }));
  const a2 = P.analyse(s2, res2), sm2 = P.summary(a2);
  near('Two designs: exact binomial p for 29 of 40 (scipy binomtest)', a2.overall.p, ref.binom.find((b) => b.k === 29 && b.n === 40).p, 1e-9);
  summaryShape('Preference, two designs', sm2);
  same('Two designs, 29 of 40, p = 0.0064: strong evidence', sm2.confidence, 'high');
  same('Two designs: headline names the winner', /^New was preferred by 73%/.test(sm2.headline), true);
  // Tie, tiny sample, no randomisation.
  const s3 = P.makeStudy({ id: 'tie', designs: [{ l: 'A', x: 'a' }, { l: 'B', x: 'b' }, { l: 'C', x: 'c' }], randomise: false });
  const res3 = [0, 1, 0, 1, 2].map((c, i) => ({ v: 1, t: 'prefr', s: 'tie', p: `t${i}`, c, o: [0, 1, 2], y: '', g: -1 }));
  const sm3 = P.summary(P.analyse(s3, res3));
  summaryShape('Preference, tie in a tiny unrandomised study', sm3);
  same('Tie: headline says so, confidence low, order caveat shown', [/tied/.test(sm3.headline), sm3.confidence, sm3.caveats.some((c) => /same order/.test(c))], [true, 'low', true]);
  same('Preference with no results: no summary', P.summary(P.analyse(s3, [])), null);
  same('Study problems: a design without content and a non-https image', P.studyProblems(P.makeStudy({ designs: [{ l: 'A' }, { l: 'B', u: 'ftp://x' }] })).length, 2);
}

// ── MaxDiff: designs ──
{
  for (const [J, k, S] of [[7, 3, 7], [13, 4, 13], [9, 3, 12]]) {
    const d = M.makeDesign({ J, k, S, V: 1, seed: 5 });
    same(`Design (${J} items, ${k} per set, ${S} sets) is a balanced incomplete block design (each pair together exactly λ times)`, [d.report.bibd, d.report.pairMin, d.report.pairMax, d.report.repeats], [true, (S * k * (k - 1)) / (J * (J - 1)), (S * k * (k - 1)) / (J * (J - 1)), 0]);
  }
  for (const [J, k, S, V] of [[12, 4, 9, 4], [16, 5, 10, 3], [20, 4, 7, 2], [10, 5, 3, 5]]) {
    const d = M.makeDesign({ J, k, S, V, seed: 9 }), r = d.report;
    same(`Design ${J}/${k}/${S}×${V}: no repeats; items within one per version and overall; pair counts within ±1 of the best possible`, [r.repeats, r.perVersionMax - r.perVersionMin <= 1, r.itemMax - r.itemMin <= 1, r.pairMax - r.pairMin <= 2], [0, true, true, true]);
  }
  const ex = M.balance(M.exampleStudy().d, 12);
  same('Example design: every item 3 times per respondent, 12 overall, each pair together 3 or 4 times (the best possible for a mean of 3.27)', [ex.perVersionMin, ex.perVersionMax, ex.itemMin, ex.itemMax, ex.pairMin, ex.pairMax], [3, 3, 12, 12, 3, 4]);
  same('Design refuses impossible settings (k ≥ J)', M.makeDesign({ J: 4, k: 4, S: 3 }), null);
  same('Recommended sets: each item about 3 times (12 items, 4 per set → 9)', M.recommendedSets(12, 4), 9);
}

// ── MaxDiff: sequential best-worst logit vs statsmodels ConditionalLogit ──
{
  const study = M.exampleStudy(), results = M.exampleResults(study);
  const rm = ref.maxdiff;
  const tasks = M.tasksOf(study, results);
  const fitM = M.fitLogit(tasks, study.it.length, { robust: false });
  const fitR = M.fitLogit(tasks, study.it.length, { robust: true });
  same('Logit converged', fitR.converged, true);
  maxDiff('Logit coefficients, last item = 0 (statsmodels ConditionalLogit)', fitM.theta, rm.theta, 1e-7);
  maxDiff('Model standard errors (inverse Hessian, statsmodels bse)', fitM.seModel, rm.se_model, 1e-7);
  maxDiff('Robust standard errors clustered by respondent (numpy sandwich)', fitR.seRobust, rm.se_robust, 1e-7);
  near('Log-likelihood (statsmodels llf)', fitR.ll, rm.llf, 1e-7);
  near('Null log-likelihood (all items equal)', fitR.ll0, rm.ll0, 1e-9);
  near('Likelihood-ratio test p-value (scipy chi2.sf)', fitR.pLR, rm.lr_p, 1e-12);
  maxDiff('Centred utilities', fitR.u, rm.u_centred, 1e-7);
  maxDiff('Centred utilities: robust standard errors', fitR.se, rm.se_centred_robust, 1e-7);
  maxDiff('Centred utilities: model standard errors', fitM.se, rm.se_centred_model, 1e-7);
  maxDiff('Shares of preference', fitR.share, rm.share, 1e-8);
  maxDiff('Shares of preference: delta-method robust standard errors', fitR.shareSe, rm.share_se_robust, 1e-8);
  near('Shares add to 1', C.sum(fitR.share), 1, 1e-12);
  // Counts agree with a plain count and with the MaxDiff counts calculator after export.
  const an = M.analyse(study, results);
  const byName = Object.fromEntries(an.counts.map((c) => [c.item, c]));
  same('Count scores: shown, best and worst per item (Python count)', [study.it.map((n) => byName[n].shown), study.it.map((n) => byName[n].best), study.it.map((n) => byName[n].worst)], [rm.counts.shown, rm.counts.best, rm.counts.worst]);
  // Parse the export as the MaxDiff counts calculator does (Calculators.jsx, MaxDiff()) and score it with stats.maxdiff.
  const lines = M.countsFormat(study, an.tasks).split('\n');
  const parsed = lines.map((line) => { const p = line.split('|'); const items = [...new Set(p[0].split(/[,;\t]/).map((x) => x.trim()).filter(Boolean))]; return { items, best: p[1].trim(), worst: p[2].trim() }; });
  same('Export: every line is valid for the MaxDiff counts calculator', parsed.every((t) => t.items.length === 4 && t.items.includes(t.best) && t.items.includes(t.worst) && t.best !== t.worst), true);
  same('Export: the MaxDiff counts calculator gives the same scores', S.maxdiff(parsed).map((r) => [r.item, r.bw, r.shown]), an.counts.map((r) => [r.item, r.bw, r.shown]));
  same('Export: commas and bars in item names are removed', M.countsFormat({ it: ['A, B', 'C|D', 'E'] }, [{ items: [0, 1, 2], best: 0, worst: 1 }]), 'A B, C D, E | A B | C D');
  const sm = M.summary(an, study);
  summaryShape('MaxDiff example', sm);
  same('MaxDiff example: top item and confidence (48 respondents)', [study.it[an.order[0]], sm.confidence], [study.it[an.order[0]], M.confidenceLevel(an)]);
  near('MaxDiff: top-two comparison uses the clustered covariance', an.top2.se, Math.sqrt(fitR.Vc[an.order[0]][an.order[0]] + fitR.Vc[an.order[1]][an.order[1]] - 2 * fitR.Vc[an.order[0]][an.order[1]]), 1e-12);
  same('MaxDiff: logit order agrees with count scores (Spearman above 0.9)', an.rCounts > 0.9, true);
  // A respondent who answered nothing valid, a set index outside the design, and a single respondent.
  same('MaxDiff: answers that do not fit the design are dropped', M.tasksOf(study, [{ x: 0, k: [[99, 0, 1], [0, study.d[0][0][0], study.d[0][0][0]]] }]).length, 0);
  same('MaxDiff: one respondent gives counts but no model', M.analyse(study, results.slice(0, 1)).fit, null);
  // Recovery: 600 simulated respondents on the example design recover the true utilities closely.
  const big = []; const rnd = C.seeded(77); const gum = () => -Math.log(-Math.log(Math.max(1e-12, rnd())));
  const truth = [0.8, 0.4, 0, -0.3, -0.9, 0.2, 1.1, -0.5, 0.1, -0.2, 0.6, -1.3];
  for (let p = 0; p < 600; p++) { const x = p % study.d.length; big.push({ x, k: study.d[x].map((set, si) => { const b = set.reduce((a, j) => { const v = truth[j] + gum(); return v > a[0] ? [v, j] : a; }, [-Infinity, -1])[1]; const w = set.filter((j) => j !== b).reduce((a, j) => { const v = -truth[j] + gum(); return v > a[0] ? [v, j] : a; }, [-Infinity, -1])[1]; return [si, b, w]; }) }); }
  const fb = M.fitLogit(M.tasksOf(study, big), 12);
  const tc = truth.map((t) => t - C.sum(truth) / 12);
  maxDiff('Recovery: 600 simulated respondents give utilities within 0.15 of the truth', fb.u, tc, 0.15);
}

// ── Reaction cards ──
{
  same('The list has 118 different words (Benedek and Miner 2002)', [R.WORDS.length, new Set(R.WORDS).size], [118, 118]);
  same('Valence: 73 positive, 40 negative, 5 neutral (about 60/40, as the authors designed)', ['p', 'n', 'o'].map((v) => R.VALENCE.filter((x) => x === v).length), [73, 40, 5]);
  near('Base rate 73/118', R.BASE_RATE, ref.cards.base, 1e-15);
  const study = R.exampleStudy(), an = R.analyse(study, R.exampleResults(study)), rc = ref.cards;
  an.designs.forEach((d, k) => {
    const r = rc.designs[k];
    near(`${d.label}: positive share (statsmodels OLS intercept)`, d.pos.share, r.share, 1e-12);
    near(`${d.label}: cluster-robust standard error (statsmodels cov_type=cluster)`, d.pos.se, r.se, 1e-10);
    near(`${d.label}: 95% CI lower (t on G − 1 df, use_t=True)`, d.pos.lo, r.lo, 1e-8);
    near(`${d.label}: 95% CI upper`, d.pos.hi, r.hi, 1e-8);
    near(`${d.label}: t against the base rate`, d.vsBase.t, r.t_vs_base, 1e-9);
    near(`${d.label}: its p-value (scipy t.sf)`, d.vsBase.p, r.p_vs_base, 1e-9);
    same(`${d.label}: five most chosen words and counts (ties by list order)`, d.words.map((w) => [w.i, w.count]).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5), r.top_words.map((w) => [w[0], w[1]]));
    r.top_words.forEach(([i, , ci]) => { const w = d.words.find((x) => x.i === i); near(`${d.label}: "${R.WORDS[i]}" Wilson lower bound (statsmodels)`, w.ci.lo, ci[0], 1e-9); });
  });
  near('Difference in positive share (OLS slope, statsmodels)', an.compare.diff, rc.diff, 1e-12);
  near('  its clustered standard error', an.compare.se, rc.diff_se, 1e-10);
  near('  95% CI lower', an.compare.lo, rc.diff_lo, 1e-8);
  near('  95% CI upper', an.compare.hi, rc.diff_hi, 1e-8);
  near('  p-value', an.compare.p, rc.diff_p, 1e-9);
  // Within participants: build a study where the same six people describe both designs.
  const wStudy = R.makeStudy({ id: 'w', designs: [{ l: 'One' }, { l: 'Two' }], mode: 'w' });
  const posIdx = R.VALENCE.map((v, i) => (v === 'p' ? i : -1)).filter((i) => i >= 0), negIdx = R.VALENCE.map((v, i) => (v === 'n' ? i : -1)).filter((i) => i >= 0);
  const byP = new Map();
  ref.cards_within.data.forEach(([p, d, ys]) => { let pi = 0, ni = 0; const w = ys.map((y) => (y ? posIdx[pi++] : negIdx[ni++])); if (!byP.has(p)) byP.set(p, []); byP.get(p).push({ d, w, t: [] }); });
  const wRes = [...byP].map(([p, r]) => ({ v: 1, t: 'prcr', s: 'w', p, r }));
  const wAn = R.analyse(wStudy, wRes);
  same('Within participants: pairing detected', wAn.compare.paired, true);
  near('Within participants: difference (statsmodels, clustered by person)', wAn.compare.diff, ref.cards_within.diff, 1e-12);
  near('  its standard error', wAn.compare.se, ref.cards_within.se, 1e-10);
  near('  p-value', wAn.compare.p, ref.cards_within.p, 1e-9);
  // Word cloud: inside the box, no overlaps, largest first.
  const cloud = R.cloudLayout(an.designs[1].words, { W: 640, H: 340 });
  const overlap = cloud.some((a, i) => cloud.some((b, j) => j > i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y));
  same('Word cloud: every word placed, inside the box, none overlapping', [cloud.length, cloud.every((w) => w.x >= 0 && w.y >= 0 && w.x + w.w <= 640 && w.y + w.h <= 340), overlap], [an.designs[1].words.length, true, false]);
  same('Word cloud: font size grows with count', cloud[0].f >= cloud[cloud.length - 1].f, true);
  // Summaries
  const sm = R.summary(an);
  summaryShape('Reaction cards, two designs', sm);
  same('Reaction cards example: redesign more positive, strong evidence', [/^Redesigned dashboard drew more positive words/.test(sm.headline), sm.confidence], [true, 'high']);
  const one = R.makeStudy({ id: 'one', designs: [{ l: 'Checkout' }], top5: false });
  const oneRes = R.exampleResults(study).filter((r) => r.r[0].d === 1).slice(0, 8).map((r) => ({ ...r, s: 'one', r: [{ ...r.r[0], d: 0 }] }));
  const sm1 = R.summary(R.analyse(one, oneRes));
  summaryShape('Reaction cards, one design', sm1);
  same('One design, 8 people, mostly positive: names the base rate; confidence follows the rule', [/62%/.test(sm1.headline), sm1.confidence], [true, R.confidenceLevel(R.analyse(one, oneRes))]);
  same('Reaction cards with no results: no summary', R.summary(R.analyse(one, [])), null);
  same('Between participants: designs alternate by session in moderated runs', [R.assignDesigns(study, 0), R.assignDesigns(study, 1), R.assignDesigns(study, 2)], [[0], [1], [0]]);
  same('Within participants: both designs, in some order', R.assignDesigns(wStudy).slice().sort(), [0, 1]);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
