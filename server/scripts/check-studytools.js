// Checks the card sort and first-click tools (client/src/calc/tools/studytools-*) against scipy and hand calculations.
// Run with `npm run check:studytools`. Reference values: server/scripts/studytools-reference.py (scipy 1.18, numpy 2.5),
// saved in studytools-reference.json.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S from '../../client/src/calc/stats.js';
import * as K from '../../client/src/calc/tools/studytools-cardsort.js';
import * as F from '../../client/src/calc/tools/studytools-firstclick.js';
import * as U from '../../client/src/calc/tools/studytools-common.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(readFileSync(path.join(here, 'studytools-reference.json'), 'utf8'));
const input = JSON.parse(readFileSync(path.join(here, 'studytools-reference-input.json'), 'utf8'));

let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-9) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toFixed(12) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
function maxDiff(label, got, want, tol = 1e-12) {
  let m = 0; got.forEach((v, i) => { m = Math.max(m, Math.abs(v - want[i])); });
  const ok = got.length === want.length && m <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${got.length} values, largest difference ${m.toExponential(2)} (tolerance ${tol})`);
}
// Two labelings describe the same partition when they map one-to-one.
const partition = (labels) => { const m = new Map(); return labels.map((l) => { if (!m.has(l)) m.set(l, m.size); return m.get(l); }); };
const LEVELS = ['high', 'medium', 'low'];
function summaryShape(label, s) {
  const ok = s && typeof s.headline === 'string' && s.headline.length > 10 && Array.isArray(s.meaning) && s.meaning.length > 0 && s.meaning.every((m) => typeof m === 'string' && m.length > 0)
    && LEVELS.includes(s.confidence) && typeof s.confidenceNote === 'string' && Array.isArray(s.caveats) && Array.isArray(s.next) && s.next.length > 0 && typeof s.report === 'string' && s.report.length > 20
    && !/NaN|undefined|Infinity|\bnull\b|—/.test(JSON.stringify(s));
  same(`${label}: summary has every part, in words, with no NaN, undefined or empty values`, !!ok, true);
  // The same limits check-summaries.js applies to the other calculators.
  same(`${label}: 1–6 points, 1–3 caveats, 1–3 next steps, no link markup in the report`, [s.meaning.length <= 6, s.caveats.length >= 1 && s.caveats.length <= 3, s.next.length <= 3, !/\]\(\//.test(s.report)], [true, true, true, true]);
  same(`${label}: no "% chance the true value" wording`, /(?<!not an? )(?<!\d)\d+% (chance|probability) (that )?(the )?true/i.test(JSON.stringify(s)), false);
}

// ── Card sort: small hand-made sort (6 cards, 5 participants) vs scipy ──
const smallStudy = K.makeStudy({ id: 'small', name: 'Small', cardsText: 'A\nB\nC\nD\nE\nF', type: 'open' });
const g = (groups, u = []) => groups.map((cards, i) => [`G${i}`, cards, -1]);
const smallResults = [
  { v: 1, t: 'csr', s: 'small', p: 'P1', g: g([[0, 1, 2], [3, 4], [5]]), u: [] },
  { v: 1, t: 'csr', s: 'small', p: 'P2', g: g([[0, 1], [2, 3], [4, 5]]), u: [] },
  { v: 1, t: 'csr', s: 'small', p: 'P3', g: g([[0, 1, 2, 3], [4, 5]]), u: [] },
  { v: 1, t: 'csr', s: 'small', p: 'P4', g: g([[0, 2], [1], [3, 4, 5]]), u: [] },
  { v: 1, t: 'csr', s: 'small', p: 'P5', g: g([[0, 1], [2], [3, 4]]), u: [5] },
];
const sm = K.analyse(smallStudy, smallResults);
maxDiff('Small sort: similarity matrix (numpy, among participants who sorted both)', Array.from(sm.S), ref.small.S.flat());
near('Small sort: A and B together for 4 of 5 participants', sm.S[0 * 6 + 1], 0.8, 1e-15);
near('Small sort: E and F together for 3 of the 4 who sorted F (one unsure)', sm.S[4 * 6 + 5], 0.75, 1e-15);
maxDiff('Small sort: average-linkage merges, heights and sizes (scipy linkage method=average)', sm.Z.flat(), ref.small.Z.flat());
same('Small sort: dendrogram leaf order (scipy dendrogram leaves)', sm.order, ref.small.dendrogram_leaves);
for (const h of ['0.3', '0.5', '0.7']) same(`Small sort: groups at cut ${h} (scipy fcluster criterion=distance)`, partition(K.cutAtHeight(sm.Z, 6, Number(h))), partition(ref.small.fcluster[h]));

// ── Card sort: the built-in example (20 cards, 18 participants) vs scipy ──
const exStudy = K.exampleStudy();
const exResults = K.exampleResults(exStudy);
const ex = K.analyse(exStudy, exResults, { mapping: K.EXAMPLE_MAPPING });
same('Example placements still match the Python input file', ex.people.map((p) => Array.from(p.groupOf)), input.cardsort.groupOf);
maxDiff('Example: similarity matrix (numpy)', Array.from(ex.S), ref.example.S.flat());
maxDiff('Example: merge heights (scipy linkage method=average)', ex.Z.map((z) => z[2]), ref.example.Z.map((z) => z[2]));
maxDiff('Example: full linkage matrix (scipy)', ex.Z.flat(), ref.example.Z.flat());
same('Example: dendrogram leaf order (scipy)', ex.order, ref.example.dendrogram_leaves);
for (const h of ['0.3', '0.5', '0.7']) same(`Example: groups at cut ${h} (scipy fcluster)`, partition(K.cutAtHeight(ex.Z, ex.C, Number(h))), partition(ref.example.fcluster[h]));
// Cophenetic distances from our linkage: the height at which two cards first share a cluster.
const coph = (Z, n) => { const D = new Float64Array(n * n); const mem = Array.from({ length: 2 * n - 1 }, (_, i) => (i < n ? [i] : [])); Z.forEach(([a, b, h], t) => { for (const i of mem[a]) for (const j of mem[b]) { D[i * n + j] = h; D[j * n + i] = h; } mem[n + t] = [...mem[a], ...mem[b]]; }); return D; };
maxDiff('Example: cophenetic distances (scipy cophenet)', Array.from(coph(ex.Z, ex.C)), ref.example.cophenetic.flat());

// ── Actual agreement, by hand on the small sort ──
near('AAM for A+B: 4 of the 5 who sorted both', K.aamScore(sm.people, [0, 1]).score, 0.8, 1e-15);
near('AAM for A+B+C: P1 and P3 of 5', K.aamScore(sm.people, [0, 1, 2]).score, 0.4, 1e-15);
near('AAM for D+E+F: only P4 of the 4 who sorted all three', K.aamScore(sm.people, [3, 4, 5]).score, 0.25, 1e-15);
const aam = K.aamMerge(sm.people, 6, 0.5);
same('Best merge at 50%: AB (0.8), then EF (0.75), then nothing reaches 50%', aam.groups.map((x) => [x.cards, +x.score.toFixed(4)]), [[[0, 1], 0.8], [[4, 5], 0.75], [[2], 1], [[3], 1]]);
same('Best merge steps in order', aam.steps.map((s) => s.cards), [[0, 1], [4, 5]]);

// ── Categories and agreement, by hand on a small closed sort ──
const cl = K.makeStudy({ id: 'cl', name: 'Closed', cardsText: 'c0\nc1\nc2\nc3', type: 'closed', categoriesText: 'X\nY' });
const cr = (p, x, y) => ({ v: 1, t: 'csr', s: 'cl', p, g: [['X', x, 0], ['Y', y, 1]].filter((q) => q[1].length), u: [] });
const clAn = K.analyse(cl, [cr('P1', [0, 1], [2, 3]), cr('P2', [0, 1, 2, 3], []), cr('P3', [0], [1, 2, 3]), cr('P4', [0, 2], [1, 3])]);
const X = clAn.cats.find((c) => c.name === 'X'), Y = clAn.cats.find((c) => c.name === 'Y');
same('Closed sort: placement counts for X and Y', [X.counts, Y.counts, X.n, Y.n], [[4, 2, 2, 1], [0, 2, 2, 3], 4, 3]);
near('Agreement for X by hand: (4 + 2 + 2 + 1) / (4 cards × 4 users) = 9/16', X.agreement, 9 / 16, 1e-15);
near('Agreement for Y by hand: (2 + 2 + 3) / (3 cards × 3 users) = 7/9', Y.agreement, 7 / 9, 1e-15);
same('Closed sort: top share per card', clAn.cards.map((c) => [c.top, +c.share.toFixed(4)]), [['X', 1], ['X', 0.5], ['X', 0.5], ['Y', 0.75]]);
same('Closed sort: c1 and c2 split 50/50 are ambiguous; c0 and c3 are not', clAn.cards.map((c) => c.ambiguous), [false, true, true, false]);
same('Category agreement is 1 when every user put the same cards in it', K.categoryTable(cl, K.placements(cl, [cr('P1', [0, 1], [2, 3]), cr('P2', [0, 1], [2, 3])])).map((c) => c.agreement), [1, 1]);

// ── Standardising open-sort names ──
same('Label normalising: case, punctuation and "and" / "&"', [K.normLabel('  Bills and Payments! '), K.normLabel('bills & payments')], ['bills & payments', 'bills & payments']);
const op = K.makeStudy({ id: 'op', name: 'Open', cardsText: 'a\nb\nc', type: 'open' });
const opR = [{ v: 1, t: 'csr', s: 'op', p: 'P1', g: [['Billing', [0, 1], -1], ['Other', [2], -1]], u: [] }, { v: 1, t: 'csr', s: 'op', p: 'P2', g: [['billing!', [0], -1], ['Help', [1, 2], -1]], u: [] }, { v: 1, t: 'csr', s: 'op', p: 'P3', g: [['Payments', [0, 1, 2], -1]], u: [] }];
const before = K.categoryTable(op, K.placements(op, opR));
same('Without merges: "Billing" and "billing!" are one category, "Payments" another', before.map((c) => [c.name, c.n]), [['Billing', 2], ['Help', 1], ['Other', 1], ['Payments', 1]]);
const after = K.categoryTable(op, K.placements(op, opR, { payments: 'Billing & payments', billing: 'Billing & payments' }));
const bp = after.find((c) => c.name === 'Billing & payments');
same('After merging synonyms: one standard category with 3 users and both names listed', [bp.n, bp.counts, bp.raw.map((r) => r[0]).sort()], [3, [3, 2, 1], ['Billing', 'Payments']]);
near('Standardised agreement by hand: (3 + 2 + 1) / (3 cards × 3 users)', bp.agreement, 6 / 9, 1e-15);

// ── Stability (Tullis & Wood style subsampling) ──
const stab = K.stabilityCurve(ex.people, ex.C, { B: 40, seed: 11 });
near('Stability: the full sample correlates 1 with itself', stab.points[stab.points.length - 1].r, 1, 1e-12);
truthy('Stability: correlation rises with sample size (first < last)', stab.points[0].r < stab.points[stab.points.length - 1].r);
same('Stability is reproducible with a seed', K.stabilityCurve(ex.people, ex.C, { B: 40, seed: 11 }).points.map((p) => +p.r.toFixed(10)), stab.points.map((p) => +p.r.toFixed(10)));
near('Pearson r by hand: [1,2,3] vs [1,2,4]', U.pearson([1, 2, 3], [1, 2, 4]), 0.9819805060619657, 1e-12);
same('Confidence rule: 10 low, 20 medium, 35 with curve ≥ 0.90 high, 35 without medium', [K.confidenceFor(10, null), K.confidenceFor(20, null), K.confidenceFor(35, { enough: 12 }), K.confidenceFor(35, { enough: null })], ['low', 'medium', 'high', 'medium']);

// ── Card sort: MDS reuses cluster.js ──
const map = K.cardMap(ex.S, ex.C);
truthy('Card map: 20 points in 2D from classical MDS', map && map.coords.length === 20 && map.coords.every((c) => c.length === 2 && c.every(Number.isFinite)));

// ── Card sort: summary, exports and codes ──
const exSum = K.cardSortSummary(ex, stab);
summaryShape('Card sort example', exSum);
same('Card sort example: 5 groups and the misfit card', [ex.clusters.filter((c) => c.cards.length > 1).length, K.orphans(ex).map((c) => c.label)], [5, ['Find a store']]);
truthy('Card sort summary: names the misfit card and links to the tree test', exSum.meaning.some((m) => m.includes('"Find a store"')) && exSum.next.some((m) => m.includes('[tree test](/calculators/tree-test)')));
truthy('Card sort summary: cites Tullis & Wood 2004 in the confidence note', exSum.confidenceNote.includes('Tullis & Wood 2004'));
same('Card sort example: 18 participants is medium confidence', exSum.confidence, 'medium');
const tiny = K.analyse(smallStudy, smallResults.slice(0, 2));
summaryShape('Card sort, two participants', K.cardSortSummary(tiny, K.stabilityCurve(tiny.people, tiny.C)));
same('Card sort, two participants: low confidence', K.cardSortSummary(tiny, null).confidence, 'low');
summaryShape('Closed card sort', K.cardSortSummary(clAn, null));
truthy('Closed card sort summary: lists the split cards', K.cardSortSummary(clAn, null).meaning.some((m) => m.includes('"c1"') && m.includes('split')));
const simCsv = K.similarityCsv(ex).split('\n');
same('Similarity CSV: header and 20 rows', [simCsv.length, simCsv[0].split(',')[1], simCsv[1].split(',')[1]], [21, 'Pay my bill', '1.0000']);
const plCsv = K.placementsCsv(ex).split('\n');
same('Placements CSV: one row per card placed or marked unsure', plCsv.length - 1, ex.people.reduce((s, p) => s + p.groups.reduce((a, q) => a + q.cards.length, 0) + p.unsure.size, 0));
truthy('Markdown report has groups, categories and the summary', /## Groups at the cut/.test(K.markdownReport(ex, exSum, stab, K.EXAMPLE_MAPPING)) && K.markdownReport(ex, exSum, stab, K.EXAMPLE_MAPPING).includes('## Reading the results'));
const sCode = K.encodeStudy(exStudy);
same('Card sort study code round trip', K.decodeStudy(sCode), exStudy);
same('Card sort study code read from a full hash-route link', K.decodeStudy(`https://x.github.io/atlas/#/calculators/card-sort?study=${sCode}&preview=1`), exStudy);
same('Card sort result code round trip', exResults.map((r) => K.decodeResult(K.encodeResult(r))), exResults);
let threw = false; try { K.decodeStudy(F.encodeStudy(F.exampleStudy())); } catch { threw = true; }
same('A first-click study is not read as a card sort', threw, true);
const board = { groups: [{ name: 'Money', cards: [2, 0], ci: -1 }, { name: '', cards: [], ci: -1 }], pile: [1], unsure: [3] };
same('Participant board: unsorted cards block finishing when all are required', K.boardProblems({ ...smallStudy, o: { a: 1 } }, board), ['1 card is still to sort.']);
same('Participant board: an unnamed group with cards must be named', K.boardProblems({ ...smallStudy, o: { a: 0 } }, { ...board, groups: [{ name: ' ', cards: [0], ci: -1 }] }), ['Name the group you made.']);
const br = K.boardToResult(smallStudy, board, 'P9', 1234.4);
same('Board to result: empty groups dropped, cards sorted, unsure kept', [br.g, br.u, br.ms], [[['Money', [0, 2], -1]], [3], 1234]);

// ── First click: geometry ──
const rect = { left: 100, top: 50, width: 600, height: 400 };
same('Click normalisation: centre, corners and outside', [F.normaliseClick(400, 250, rect), F.normaliseClick(100, 50, rect), F.normaliseClick(700, 450, rect), F.normaliseClick(99, 60, rect), F.normaliseClick(300, 451, rect)], [{ x: 0.5, y: 0.5 }, { x: 0, y: 0 }, { x: 1, y: 1 }, null, null]);
same('Click normalisation rounds to 4 decimals', F.normaliseClick(100 + 600 / 3, 50 + 400 / 7, rect), { x: 0.3333, y: 0.1429 });
const fit = F.fitRect(1200, 800, 390, 700);
same('Fit a 1200×800 image in a 390×700 phone screen', [fit.width, fit.height, fit.left, fit.top], [390, 260, 0, 220]);
same('Fit a 1200×800 image in a 1366×600 window', Object.values(F.fitRect(1200, 800, 1366, 600)).slice(0, 4), [233, 0, 900, 600]);
const r1 = [0.2, 0.1, 0.1, 0.05];
same('Hit test: inside, on the edges, outside', [F.inRect(r1, 0.25, 0.12), F.inRect(r1, 0.2, 0.1), F.inRect(r1, 0.3, 0.15), F.inRect(r1, 0.3001, 0.12), F.inRect(r1, 0.25, 0.0999)], [true, true, true, false, false]);
same('Hit index: first matching target; a skipped click hits nothing', [F.hitIndex([[0, 0, 1, 1], r1], 0.25, 0.12), F.hitIndex([r1], 0.5, 0.5), F.hitIndex([r1], null, null)], [0, -1, -1]);
same('Drawn rectangle from two corners in any order, clamped', [F.rectFrom({ x: 0.6, y: 0.5 }, { x: 0.2, y: 0.1 }), F.rectFrom({ x: -0.1, y: 0.9 }, { x: 0.3, y: 1.2 })], [[0.2, 0.1, 0.4, 0.4], [0, 0.9, 0.3, 0.1]]);

// ── First click: kernel density vs scipy and by hand ──
const kS = F.kde(input.clicks, 'scott');
maxDiff('KDE covariance, Scott\'s rule (scipy gaussian_kde.covariance)', kS.cov.flat(), ref.kde_scott.covariance.flat(), 1e-8);
ref.kde_scott.points.forEach((p, i) => { const want = ref.kde_scott.density[i]; const got = kS.f(p[0], p[1]); const rel = want > 1e-300 ? Math.abs(got - want) / want : Math.abs(got); const ok = rel <= 1e-9; if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} KDE Scott density at (${p}) vs scipy: expected ${want}, got ${got} (relative difference ${rel.toExponential(2)})`); });
const kF = F.kde(input.clicks, ref.kde_fixed.h);
ref.kde_fixed.points.forEach((p, i) => { const want = ref.kde_fixed.density[i], got = kF.f(p[0], p[1]); const rel = want > 1e-300 ? Math.abs(got - want) / want : Math.abs(got); const ok = rel <= 1e-9; if (ok) passes++; else fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} KDE fixed h = 36 px at (${p}) vs numpy formula: expected ${want}, got ${got}`); });
near('KDE by hand, h = 1: (1 + e^−0.5 + e^−2) / (3·2π) at the origin', F.kde([[0, 0], [1, 0], [0, 2]], 1).f(0, 0), ref.kde_hand, 1e-15);
const grid = F.kdeGrid([[0, 0], [1, 0], [0, 2]], 4, 4, 2, 2, 1);
near('KDE grid: cell centre (1, 1) of a 4×4 image on a 2×2 grid', grid.g[0], F.kde([[0, 0], [1, 0], [0, 2]], 1).f(1, 1), 1e-15);

// ── First click: hotspots ──
const hc = [[0.1, 0.1], [0.11, 0.1], [0.1, 0.12], [0.8, 0.8], [0.81, 0.79], [0.8, 0.82], [0.5, 0.5]].map(([x, y]) => ({ x, y }));
const hs = F.hotspots(hc, 1000, 1000, [[0.05, 0.05, 0.1, 0.1]]);
same('Hotspots: two groups of 3, one scattered click; the first on target 1', [hs.spots.map((s) => [s.n, +s.share.toFixed(4), s.target]), hs.scattered], [[[3, 0.4286, 0], [3, 0.4286, -1]], 1]);
same('Hotspots use image proportions: 0.04 apart vertically on a wide image is close', F.hotspots([{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.14 }], 2000, 1000).spots.length, 1);

// ── First click: the example study ──
const fs = F.exampleStudy(), fr = F.exampleResults(fs);
const fa = F.analyse(fs, fr);
const t1 = fa.tasks[0].variants[0];
same('Example task 1: 18 of 24 first clicks on Pricing (17) or See plans (1)', [t1.n, t1.succ, t1.targets.map((x) => x.x)], [24, 18, [17, 1]]);
same('Example task 1: success interval is the adjusted-Wald interval from stats.js', t1.ci, S.adjustedWald(18, 24));
same('Example task 1: time is the geometric mean from stats.js timeCI', t1.time, S.timeCI(t1.clicks.filter((c) => c.x != null).map((c) => c.ms / 1000)));
const t2 = fa.tasks[1];
same('Example task 2: versions alternate and are compared with the N−1 two-proportion test', [t2.variants.map((v) => v.n), t2.cmp], [[12, 12], S.twoProportions(t2.variants[0].succ, 12, t2.variants[1].succ, 12)]);
const five = fa.tasks[2].variants[0];
same('Example 5-second test: 18 of 24 mention a keyword', [five.kwAll.any.x, five.kwAll.any.n], [18, 24]);
near('Example 5-second rating: mean', five.rating.mean, S.mean(fr.map((r) => r.k[2].g)), 1e-12);
same('Example 5-second rating: CI from stats.js meanCI', five.rating.ci, S.meanCI(five.rating.mean, S.sd(fr.map((r) => r.k[2].g)), 24));

// ── 5-second answers by hand ──
same('Word counts: each answer counts a word once; stop words dropped', F.wordFrequency(['Invoices and invoices', 'Send invoices', 'The payments page']).map((w) => [w.word, w.n]), [['invoices', 2], ['payments', 1], ['send', 1]]);
same('Keyword match is a word prefix: invoice → invoices, not "reinvoice"', [F.mentions('Sending invoices', 'invoice'), F.mentions('reinvoice it', 'invoice'), F.mentions('get paid faster', 'get paid'), F.mentions('get  paid', 'get paid')], [true, false, true, true]);
const ks = F.keywordShares(['invoices', 'payments and invoices', 'no idea'], ['invoice', 'payment']);
same('Keyword shares by hand', [ks.each.map((k) => k.x), ks.any.x, ks.any.n], [[2, 1], 2, 3]);
same('Keyword "any" interval is adjusted Wald', ks.any.ci, S.adjustedWald(2, 3));
const rs = F.ratingSummary([5, 4, 4, 2, 5]);
same('Rating summary by hand: mean 4, median 4, distribution, share of 4–5', [rs.mean, rs.median, rs.dist, rs.top2], [4, 4, [0, 1, 0, 2, 2], 0.8]);

// ── First click: codes, summary, exports ──
const fCode = F.encodeStudy(fs);
same('First-click study code round trip', F.decodeStudy(fCode), fs);
same('First-click result code round trip', fr.map((r) => F.decodeResult(F.encodeResult(r))), fr);
threw = false; try { F.decodeResult(K.encodeResult(exResults[0])); } catch { threw = true; }
same('A card-sort result is not read as a first-click result', threw, true);
same('Image references: uploaded images are flagged for shared links', F.localRefs(F.makeStudy({ tasks: [{ y: 'click', q: 'x', im: [{ u: 'idb:abc', w: 10, h: 10, r: [] }, { u: 'https://a.b/c.png', w: 1, h: 1, r: [] }] }] })), ['idb:abc']);
same('Study codes keep only URLs, not image data, for hosted images', JSON.stringify(F.makeStudy({ mode: 'url', tasks: [{ y: 'click', q: 'x', im: [{ u: 'https://a.b/c.png', w: 1200, h: 800, r: [[0.12345678, 0, 0.5, 0.5]] }] }] }).k[0].im[0]), '{"u":"https://a.b/c.png","w":1200,"h":800,"r":[[0.1235,0,0.5,0.5]]}');
const fsum = F.firstClickSummary(fa);
summaryShape('First-click example', fsum);
truthy('First-click summary: cites Bailey & Wolfson (2009) as context, not a guarantee', fsum.meaning.some((m) => m.includes("Bailey & Wolfson's (2009)") && m.includes('not a promise')));
truthy('First-click summary: names the failing task versions', fsum.headline.startsWith('2 of 3 first-click task versions fell below 70%'));
same('First-click confidence rule: 12 per version is low; 25 medium; 40 high', [fsum.confidence, F.confidenceFor(25), F.confidenceFor(40)], ['low', 'medium', 'high']);
// Edge cases: one participant, all wrong; many tasks fold into six points.
const one = F.analyse(fs, [fr[0]].map((r) => ({ ...r, k: r.k.map((a) => (a.t < 2 ? { ...a, x: 0.99, y: 0.99 } : a)) })));
const oneS = F.firstClickSummary(one);
summaryShape('First click, one participant, all wrong', oneS);
same('First click, one participant: low confidence and 0% success', [oneS.confidence, one.tasks[0].variants[0].rate], ['low', 0]);
const many = F.makeStudy({ tasks: Array.from({ length: 8 }, (_, i) => ({ y: 'click', q: `Task ${i}`, im: [{ u: 'ex:homeA', w: 1200, h: 800, r: [[0, 0, 0.5, 0.5]] }] })) });
const manyR = Array.from({ length: 5 }, (_, p) => ({ v: 1, t: 'fcr', s: many.id, p: `P${p}`, k: many.k.map((_, t) => ({ t, i: 0, x: (p + t) % 2 ? 0.2 : 0.8, y: 0.2, ms: 3000 })) }));
summaryShape('First click, eight tasks', F.firstClickSummary(F.analyse(many, manyR)));
const fcsv = F.clicksCsv(fs, fa).split('\n');
same('Clicks CSV: header and one row per attempt', [fcsv[0], fcsv.length - 1], ['participant,task,task_type,version,x,y,x_px,y_px,ms,hit_target,hotspot,answers,rating', 24 * 3]);
truthy('Markdown report lists each task and the summary', F.markdownReport(fs, fa, fsum).includes('## Task 3: 5-second test') && F.markdownReport(fs, fa, fsum).includes('## Reading the results'));
same('Variant rotation for moderated sessions', [0, 1, 2, 3].map((s) => F.pickVariant(2, s)), [0, 1, 0, 1]);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
