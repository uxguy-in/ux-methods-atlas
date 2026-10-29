// Checks the behaviour, information, tree-test and HTA tools in client/src/calc/tools against scipy, scikit-learn,
// statsmodels, published worked examples and hand calculations. Run with `npm run check:tools`.
// Reference values come from server/scripts/tools-reference.py (scipy 1.18, scikit-learn 1.9, statsmodels 0.15).
import * as S from '../../client/src/calc/stats.js';
import * as I from '../../client/src/calc/tools/info.js';
import * as F from '../../client/src/calc/tools/foraging.js';
import * as B from '../../client/src/calc/tools/behaviour.js';
import * as T from '../../client/src/calc/tools/treetest.js';
import * as C from '../../client/src/calc/tools/codec.js';
import * as H from '../../client/src/calc/tools/hta.js';

let fails = 0, passes = 0;
function near(label, got, want, tol = 1e-6) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toFixed(9) : got}`);
}
function same(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
}
const truthy = (label, v) => same(label, !!v, true);
const LEVELS = ['high', 'medium', 'low'];
function summaryShape(label, s) {
  const ok = s && typeof s.headline === 'string' && s.headline.length > 10 && Array.isArray(s.meaning) && s.meaning.length > 0 && s.meaning.every((m) => typeof m === 'string' && m.length > 0)
    && LEVELS.includes(s.confidence) && typeof s.confidenceNote === 'string' && Array.isArray(s.caveats) && Array.isArray(s.next) && s.next.length > 0 && typeof s.report === 'string' && s.report.length > 20
    && !/NaN|undefined|Infinity/.test(JSON.stringify(s));
  same(`${label}: summary has every part, in words, with no NaN or undefined`, !!ok, true);
}

// ── Shannon information ──
const counts = [10, 7, 5, 3, 1];
near('Entropy in bits (scipy.stats.entropy base 2)', I.entropy(counts), 2.037543818915049, 1e-12);
near('Entropy in nats (scipy.stats.entropy)', I.entropy(counts, Math.E), 1.4123177533483098, 1e-12);
const dv = I.diversity(counts);
const sp = counts.reduce((s, c) => s + (c / 26) ** 2, 0);
near('Pielou evenness J = H / log2 S, by hand', dv.J, 2.037543818915049 / Math.log2(5), 1e-12);
near('Effective number of themes 2^H, by hand', dv.N1, 2 ** 2.037543818915049, 1e-12);
near('Simpson diversity 1 − Σp², by hand', dv.simpson, 1 - sp, 1e-12);
near('Inverse Simpson 1/Σp², by hand', dv.N2, 1 / sp, 1e-12);
near('Unbiased Simpson 1 − Σn(n−1)/(N(N−1)), by hand', dv.simpsonUnbiased, 1 - (90 + 42 + 20 + 6 + 0) / (26 * 25), 1e-12);
near('Miller-Madow: H + (S − 1)/(2N) nats, in bits', dv.millerMadow, 2.037543818915049 + 4 / 52 / Math.LN2, 1e-12);
near('Entropy of a fair coin is 1 bit', I.entropy([5, 5]), 1, 1e-15);
near('Entropy of one category is 0', I.entropy([9, 0]), 0, 1e-15);

const coded = I.parseCoded('P1: a, b\nP1: a\nP2: c\nP2: a, c\nnot a segment', 'segments');
same('Coded segments: codes and per-participant counts', [coded.codes, coded.participants.map((p) => p.counts), coded.bad], [['a', 'b', 'c'], [[2, 1, 0], [1, 0, 2]], [5]]);
const tab = I.parseCoded('Code\tP1\tP2\na\t2\t1\nb\t1\t0\nc\t0\t2', 'table');
same('Code × participant table reads the same as the segments', tab.participants.map((p) => p.counts), [[2, 1, 0], [1, 0, 2]]);
const ci = I.codeInformation(coded);
near('Per-participant entropy, P1 counts 2 and 1 (scipy)', ci.people[0].H, I.entropy([2, 1]), 1e-15);
same('Reach: how many participants used each code', ci.reach.map((r) => r.people), [2, 1, 1]);
const it = I.itemEntropy(['1', '1', '1', '2', '5', '']);
same('Survey item: options span the 1–5 scale; blanks skipped', [it.n, it.k, it.observed], [5, 5, 3]);
near('Survey item: normalised entropy H / log2 5', it.Hnorm, I.entropy([3, 1, 1]) / Math.log2(5), 1e-12);

const plan = 'Pro Pro Free Free Free Pro Free Free Team Team Pro Pro Pro Pro Team Team Pro Pro Free Team Pro Team Team Free Free Free Free Pro Free Free Free Team Free Team Team Free Team Free Team Pro'.split(' ');
const renew = 'Yes Yes No No No No No Yes Yes Yes Yes No Yes Yes Yes Yes Yes Yes No Yes Yes Yes Yes No No No No No Yes No Yes No No Yes Yes No Yes Yes Yes Yes'.split(' ');
const mi = I.mutualInformation(I.contingency(plan, renew).table);
near('Mutual information in nats (sklearn mutual_info_score)', mi.miNats, 0.19332627085924242, 1e-12);
near('Mutual information in bits = nats / ln 2', mi.mi, 0.19332627085924242 / Math.LN2, 1e-12);
near('Normalised MI, arithmetic mean (sklearn normalized_mutual_info_score)', mi.nmi, 0.2194505856160828, 1e-12);
near('G-test statistic, G = 2N·MI·ln2 (scipy chi2_contingency, log-likelihood)', mi.G, 15.466101668739391, 1e-9);
near('G-test p-value (scipy)', mi.p, 0.00043810548889059174, 1e-9);
same('G-test degrees of freedom', mi.df, 2);
near('Chi-square survival, x = 7, df = 3 (scipy chi2.sf)', I.chiSqSf(7, 3), 0.07189777249646509, 1e-10);
near('Chi-square survival, x = 0.5, df = 1 (scipy chi2.sf)', I.chiSqSf(0.5, 1), 0.47950012218695337, 1e-10);
near('Independent questions have zero mutual information', I.mutualInformation([[5, 5], [10, 10]]).mi, 0, 1e-15);
const igTable = { headers: ['Plan', 'Renew', 'Same as renew'], rows: plan.map((p, i) => [p, renew[i], renew[i]]) };
const ig = I.informationGain(igTable, 1);
same('Information gain: a copy of the outcome ranks first with 100% of its entropy', [ig[0].name, +ig[0].share.toFixed(12)], ['Same as renew', 1]);
near('Information gain of Plan about Renew equals I(Plan; Renew)', ig[1].ig, mi.mi, 1e-12);

const cs = I.codeSummary(I.codeInformation(I.parseCoded('P1: a, b\nP1: a, c\nP2: a\nP2: d, a\nP3: a, b\nP3: e', 'segments')));
summaryShape('Codes', cs);
truthy('Codes summary: headline gives the effective number of themes, 2^H', cs.headline.includes((2 ** I.entropy([5, 2, 1, 1, 1])).toFixed(1)));
truthy('Codes summary: single-participant codes are flagged', cs.meaning.some((m) => m.includes('3 of 5 codes come from a single participant')));
same('Codes summary: 10 segments from 3 people is low confidence', cs.confidence, 'low');
const ssum = I.surveySummary(I.surveyInformation({ headers: ['Country', 'Plan'], rows: plan.map((p, i) => [i < 39 ? 'UK' : 'Ireland', p]) }));
summaryShape('Survey', ssum);
truthy('Survey summary: the near-constant question is flagged as low information', ssum.headline.startsWith('1 of 2') && ssum.meaning.some((m) => m.includes('"Country"')));
const msum = I.miSummary(mi, 'Plan', 'Would renew');
summaryShape('Mutual information', msum);
truthy('MI summary: significant association reported with the G-test', msum.report.includes('G(2) = 15.47') && msum.report.includes('p < 0.001'));
summaryShape('Information gain', I.igSummary(ig, 'Renew'));

// ── Information foraging ──
near("Charnov optimum, exponential gain, τ = 25, Tb = 15 (scipy lambertw, k = −1)", F.charnovExp(4, 25, 15).t, 23.17635816630885, 1e-9);
near('Analytic formula with our Lambert W₋₁ matches scipy', F.charnovExpAnalytic(25, 15), 23.17635816630885, 1e-9);
const ce = F.charnovExp(4, 25, 15);
near("At the optimum the gain slope equals the overall rate (marginal value theorem)", ce.slope, ce.rate, 1e-9);
near('Lambert W₋₁(−0.2) satisfies w·e^w = x', (() => { const w = F.lambertWm1(-0.2); return w * Math.exp(w); })(), -0.2, 1e-14);
truthy('Shorter travel time means leaving sooner', F.charnovExp(4, 25, 5).t < F.charnovExp(4, 25, 15).t);
const cp = F.charnovPoints([[5, 1], [10, 1.8], [20, 2.8], [30, 3.3], [45, 3.7], [60, 3.9]], 15);
const rates = [[5, 1], [10, 1.8], [20, 2.8], [30, 3.3], [45, 3.7], [60, 3.9]].map(([t, g]) => g / (15 + t));
same('Measured gains: leave at the point with the highest g / (Tb + t), by hand (20 s: 2.8 / 35)', [cp.t, +cp.rate.toFixed(12)], [20, +Math.max(...rates).toFixed(12)]);
const sc = F.scent(F.parseScent('Top: Shop 4, Plans 3, Support 22*, My account 9, About us 2\nSupport: Billing 3, Network 4, Device help 25*\nDevice help: Set up my phone 6, Repairs 19*').steps);
near('Scent path probability = product of step scents, by hand (22/40 × 25/32 × 19/25)', sc.pathSuccess, (22 / 40) * (25 / 32) * (19 / 25), 1e-12);
near('Scent entropy at step 1 (scipy.stats.entropy base 2)', sc.steps[0].H, I.entropy([4, 3, 22, 9, 2]), 1e-12);
same('Weakest scent step', sc.weakest.name, 'Top');
summaryShape('Scent', F.scentSummary(sc));
const dietRows = [{ name: 'A', g: 3, h: 2, lambda: 0.4 }, { name: 'B', g: 2, h: 6, lambda: 0.6 }, { name: 'C', g: 4, h: 8, lambda: 0.15 }, { name: 'D', g: 5, h: 12, lambda: 0.1 }, { name: 'E', g: 1, h: 3, lambda: 0.3 }];
const dt = F.diet(dietRows);
const best = F.dietBest(dietRows);
near('Diet model: rule reaches the best rate over all 31 subsets', dt.R, best.R, 1e-12);
same('Diet model: same sources as the exhaustive search', dt.chosen.map((r) => r.name).sort(), best.set.sort());
near('Diet rate by hand for {A}: λg / (1 + λh) = 1.2 / 1.8', F.dietRate([dietRows[0]]), 1.2 / 1.8, 1e-12);
summaryShape('Patch', F.patchSummary(ce, { Tb: 15, unit: 's', gainUnit: 'items', place: 'page', alt: { ...F.charnovExp(4, 25, 5), Tb: 5 } }));
summaryShape('Diet', F.dietSummary(dt));

// ── Signal detection ──
// Stanislaw and Todorov (1999), Figure 1: H = .9332, F = .3085 → d′ = 2.00, β = 0.37, ln β = −1.00, c = −0.50, A′ = .89, B″ = −0.55.
const st1 = B.sdtRates(0.9332, 0.3085);
near("d′, Stanislaw and Todorov's example (2.00)", st1.d, 2.0, 0.005);
near('c, Stanislaw and Todorov (−0.50)', st1.c, -0.5, 0.005);
near('β, Stanislaw and Todorov (0.37)', st1.beta, 0.37, 0.005);
near('ln β, Stanislaw and Todorov (−1.00)', st1.lnBeta, -1.0, 0.005);
near("A′, Stanislaw and Todorov (.89)", st1.A, 0.89, 0.005);
near('B″ (Grier), Stanislaw and Todorov (−0.55)', st1.B, -0.55, 0.005);
// Their Table 6, yes = 3–6: H = .92, F = .44 → d′ 1.56, c −0.63, β 0.38, A′ .84.
const st2 = B.sdtRates(0.92, 0.44);
same('Stanislaw and Todorov Table 6 row 3–6: d′, c, β, A′ to 2 decimals', [st2.d, st2.c, st2.beta, st2.A].map((v) => +v.toFixed(2)), [1.56, -0.63, 0.38, 0.84]);
const sl = B.sdt(18, 2, 6, 14, 'loglinear');
near("d′ with log-linear correction (scipy norm.ppf)", sl.d, 1.6769616882934153, 1e-7);
near('c with log-linear correction (scipy norm.ppf)', sl.c, -0.34128027346515355, 1e-7);
const sh = B.sdt(20, 0, 3, 17, 'half');
near('1/(2N) rule: a 100% hit rate becomes 1 − 1/40', sh.H, 1 - 1 / 40, 1e-15);
summaryShape('Signal detection', B.sdtSummary([sl, B.sdt(15, 5, 3, 17)], { signal: 'the warning' }));

// ── Delay discounting ──
near('Kirby indifference k for £54 now or £55 in 117 days (published 0.00016)', B.kIndiff(54, 55, 117), 0.00016, 0.000005);
near('Kirby indifference k for £11 now or £30 in 7 days (published 0.25)', B.kIndiff(11, 30, 7), 0.25, 0.005);
const kk = B.kirbyK([{ S: 54, L: 55, D: 117, later: 0 }, { S: 47, L: 50, D: 160, later: 0 }, { S: 11, L: 30, D: 7, later: 1 }]);
near('Kirby k = geometric midpoint between the switching questions, by hand', kk.k, Math.sqrt(B.kIndiff(47, 50, 160) * B.kIndiff(11, 30, 7)), 1e-15);
same('Kirby consistency for a consistent chooser', kk.consistency, 1);
const pts = [[1, 0.95], [7, 0.82], [30, 0.6], [90, 0.38], [180, 0.27], [365, 0.16]];
near('Hyperbolic k by least squares (scipy curve_fit)', B.fitDiscount(pts).k, 0.0192152033512965, 1e-7);
near('Exponential k by least squares (scipy curve_fit)', B.fitDiscount(pts, 'exponential').k, 0.010253728617489691, 1e-7);
near('Area under the discounting curve, trapezoids by hand', B.discountAuc([[50, 0.5], [100, 0.25]]), 0.5 * (1 + 0.5) / 2 + 0.5 * (0.5 + 0.25) / 2, 1e-15);
summaryShape('Discounting (choices)', B.discountSummary({ k: kk.k, mode: 'choices', consistency: 1, n: 3 }));
summaryShape('Discounting (points)', B.discountSummary({ k: 0.0192, mode: 'points', r2: 0.98, n: 6, auc: 0.3 }));

// ── Loss aversion ──
const gains = [4, 6, 8, 10, 12, 4, 6, 8, 10, 12, 4, 6, 8, 10, 12, 16, 20, 4, 6, 8, 10, 12, 16, 20];
const losses = [2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8];
const acc = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 1];
const la = B.lossAversion(gains.map((G, i) => ({ G, L: losses[i], accept: acc[i] })));
near('Logistic intercept (statsmodels Logit)', la.logistic.b[0], 1.9365320410560547, 1e-7);
near('Logistic gain coefficient (statsmodels Logit)', la.logistic.b[1], 0.7030111664915686, 1e-7);
near('Logistic loss coefficient (statsmodels Logit)', la.logistic.b[2], -1.2894458561398707, 1e-7);
near('λ = −b_loss / b_gain (statsmodels)', la.lambda, 1.8341754976310685, 1e-7);
const sw = B.switchLambda([{ G: 4, L: 4, accept: 0 }, { G: 6, L: 4, accept: 0 }, { G: 10, L: 4, accept: 1 }, { G: 12, L: 4, accept: 1 }]);
near('Switch-point λ for a consistent chooser: geometric midpoint of 1.5 and 2.5', sw.lambda, Math.sqrt(1.5 * 2.5), 1e-15);
const sep = B.lossAversion([{ G: 4, L: 4, accept: 0 }, { G: 6, L: 4, accept: 0 }, { G: 10, L: 4, accept: 1 }, { G: 12, L: 4, accept: 1 }]);
same('Perfectly separated choices fall back to the switch point', sep.method, 'switch');
summaryShape('Loss aversion', B.lossSummary([la, sep]));

// ── JND and Weber fraction ──
const pf = B.probit([[200, 2], [220, 6], [240, 13], [260, 22], [280, 29], [300, 35], [320, 38]].map(([x, k]) => ({ x, k, n: 40 })));
near('Probit intercept (statsmodels GLM, binomial probit)', pf.a, -7.017780578641842, 1e-6);
near('Probit slope (statsmodels GLM, binomial probit)', pf.b, 0.0272553496667696, 1e-9);
near('PSE = −a/b (statsmodels)', pf.pse, 257.4826837462333, 1e-5);
near('JND = z(0.75)/b (scipy norm.ppf)', pf.jnd, 24.747059144078285, 1e-5);
near('Accurate Φ(1.96) (scipy norm.cdf 0.9750021048517795)', B.normCdfAccurate(1.96), 0.9750021048517795, 1e-13);
const wf = B.weberFit([{ S: 100, J: 9 }, { S: 200, J: 17 }, { S: 400, J: 37 }, { S: 800, J: 70 }]);
near('Weber k through the origin, Σ S·J / Σ S², by hand', wf.k, (900 + 3400 + 14800 + 56000) / (10000 + 40000 + 160000 + 640000), 1e-15);
summaryShape('JND, one standard', B.weberSummary({ mode: 'constant', S: 250, fit: pf, levels: [{ n: 40 }], unit: ' ms' }));
summaryShape('JND, several standards', B.weberSummary({ mode: 'weber', wf }));

// ── Study and result codes ──
const study = T.exampleStudy();
same('Study code round trip', T.decodeStudy(T.encodeStudy(study)), study);
const results = T.exampleResults(study);
same('Result code round trip, all 14 example participants', results.map((r) => T.decodeResult(T.encodeResult(r))), results);
same('Pasted codes with blank lines and a bad code', (() => { const p = T.parseResultCodes(`${T.encodeResult(results[0])}\n\nnot-a-code\n${T.encodeResult(results[1])}`); return [p.results.length, p.bad.length]; })(), [2, 1]);
const uni = { v: 1, text: 'Ünïcödé, emoji 🌳, Chinese 树测试, quotes "" and \\ backslash', list: Array.from({ length: 50 }, (_, i) => i % 7) };
same('Codes keep Unicode text', C.decodeCode(C.encodeCode(uni)), uni);
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const big = Array.from({ length: 300000 }, () => 'abcdefgh'[Math.floor(rnd() * 8)]).join('');
same('LZW round trip past the 65,536-entry dictionary limit', C.decodeCode(C.encodeCode({ big })).big === big, true);
same('LZW round trip on a repetitive string (the KwKwK case)', C.decodeCode(C.encodeCode({ s: 'a'.repeat(1000) })).s, 'a'.repeat(1000));
truthy('Codes use only URL-safe characters', /^[0-9A-Za-z\-_.]+$/.test(T.encodeStudy(study)));
truthy('A study link is accepted as well as a bare code', T.decodeStudy(`https://example.org/#/calculators/tree-test?study=${T.encodeStudy(study)}&preview=1`).id === 'example1');
same('base64url round trip of all byte values', [...C.fromBase64url(C.toBase64url(Uint8Array.from({ length: 256 }, (_, i) => i)))], Array.from({ length: 256 }, (_, i) => i));

// ── Tree parsing and path classification ──
const { nodes } = T.parseTree(T.EXAMPLE_TREE);
same('Tree: 34 labels under Home, 3 levels', [nodes.length - 1, Math.max(...nodes.map((n) => n.depth))], [34, 3]);
same('Tree: bullets and tabs', T.parseTree('- A\n\t- B\n\t- C\n- D').nodes.map((n) => [n.label, n.parent]), [['Home', -1], ['A', 0], ['B', 1], ['C', 1], ['D', 0]]);
const N = (l) => T.findNode(nodes, l);
const repairs = [N('Repairs')];
const att = (script) => { let s2 = 1; const r = () => { s2 = (s2 * 48271) % 2147483647; return s2 / 2147483647; }; return T.runScript(nodes, script, r); };
const cl = (script) => T.classifyAttempt(nodes, repairs, att(script));
const pick = (c) => ({ category: c.category, slips: c.slips, mistakes: c.mistakes, retreats: c.retreats, lapse: c.lapse ? c.lapseKind : false, first: c.firstCorrect });
same('Direct success: Support › Device help › Repairs', pick(cl(['Support', 'Device help', 'Repairs', '!'])), { category: 'direct-success', slips: 0, mistakes: 0, retreats: 0, lapse: false, first: true });
same('Indirect success with a slip: opens Network, backs out at once, then finds Repairs', pick(cl(['Support', 'Network', '^', 'Device help', 'Repairs', '!'])), { category: 'indirect-success', slips: 1, mistakes: 0, retreats: 1, lapse: false, first: true });
same('Slip at the top level: opens Shop and backs out at once', pick(cl(['Shop', '^', 'Support', 'Device help', 'Repairs', '!'])), { category: 'indirect-success', slips: 1, mistakes: 0, retreats: 1, lapse: false, first: false });
same('Direct failure and a mistake: two levels into Shop, chooses iPhone', pick(cl(['Shop', 'Phones', 'iPhone', '!'])), { category: 'direct-failure', slips: 0, mistakes: 1, retreats: 0, lapse: false, first: false });
same('Indirect failure with a slip and a lapse: reached Device help, backed out, chose Refunds', pick(cl(['Support', 'Device help', 'Set up my phone', '^', '^', 'Billing', 'Refunds', '!'])), { category: 'indirect-failure', slips: 1, mistakes: 0, retreats: 2, lapse: 'near miss', first: true });
same('Skip with a mistake: About us › Contact us, then gave up (lapse: abandoned)', pick(cl(['About us', 'Contact us', '~'])), { category: 'skip', slips: 0, mistakes: 1, retreats: 0, lapse: 'abandoned', first: false });
same('Wandering off one level then back two steps later is not a slip', cl(['Support', 'Network', 'Coverage checker', '^', '^', 'Device help', 'Repairs', '!']).slips, 0);
same('One level into a wrong section is not a mistake', cl(['Plans', '!']).mistakes, 0);
same('Two levels into a wrong section is a mistake', cl(['Plans', 'SIM only', '!']).mistakes, 1);
same('Two different wrong sections count as two mistakes', cl(['Shop', 'Phones', '^', '^', 'About us', 'Careers', '^', '^', 'Support', 'Device help', 'Repairs', '!']).mistakes, 2);
same('Several correct answers: either counts as success', T.classifyAttempt(nodes, [N('Understand my bill'), N('Bills and payments')], att(['My account', 'Bills and payments', '!'])).success, true);
const lostAtt = cl(['Support', 'Network', '^', 'Device help', 'Repairs', '!']);
near('Lostness by hand: N = 5, S = 6, R = 4, √((5/6 − 1)² + (4/5 − 1)²)', lostAtt.lost, Math.sqrt((5 / 6 - 1) ** 2 + (4 / 5 - 1) ** 2), 1e-15);
near('Lostness of a direct path is 0', cl(['Support', 'Device help', 'Repairs', '!']).lost, 0, 1e-15);
near('Lostness agrees with the existing Lostness calculator formula', lostAtt.lost, S.lostness(5, 6, 4), 1e-15);

const an = T.analyse(study, results);
const t3 = an.tasks[2];
same('Example task 3: success, categories and errors', [t3.n, t3.succ, t3.cats, t3.mistakes, t3.lapses], [14, 7, { 'direct-success': 4, 'indirect-success': 3, 'direct-failure': 3, 'indirect-failure': 3, skip: 1 }, 9, 1]);
same('Example task 3: success interval is the adjusted-Wald interval', t3.ci, S.adjustedWald(7, 14));
same('Example task 3: diagnosed as a wrong top-level grouping', t3.diagnosis[0].kind, 'grouping');
same('Example task 5: diagnosed as ambiguous final labels (Coverage checker next to Service status)', [an.tasks[4].diagnosis[0].kind, nodes[an.tasks[4].wrongSel[0][0]].label], ['label', 'Coverage checker']);
const tsum = T.treeSummary(an);
summaryShape('Tree test', tsum);
truthy('Tree test summary: names the failing tasks', tsum.headline.includes('Task 2, Task 3, Task 5'));
truthy('Tree test summary: names the labels that drew wrong clicks', tsum.meaning.some((m) => m.startsWith('Labels that drew the most wrong clicks: "Shop"')));
truthy('Tree test summary: suggests moving content for the grouping problem', tsum.next.some((m) => m.startsWith('Task 3: move or cross-link')));
const csv = T.clicksCsv(study, results).split('\n');
same('Clicks CSV: header and one row per event', [csv[0], csv.length - 1], ['participant,task,task_text,step,action,node,path,ms,outcome', results.reduce((s, r) => s + r.k.reduce((a, k) => a + k.e.length, 0), 0)]);
truthy('Markdown summary has the task table and definitions', /\| Task \| Success/.test(T.markdownSummary(study, an, tsum)) && T.markdownSummary(study, an, tsum).includes('**Slip**'));

// ── Hierarchical task analysis ──
const h1 = H.parseHta(`Make tea
  Plan: do 1 then 2; if no milk do 3; do 4 and 5 at the same time
  Boil water | t=120
  Add tea bag | t=5 | p=M | c=L | mode=action
  Buy milk | t=600 | f=1
  Pour | t=10 | p=H | c=H | mode=A
  Stir | t=8 | f=2 | p=L | c=H | mode=checking`);
same('HTA numbering', h1.nodes.map((n) => n.num), ['0', '1', '2', '3', '4', '5']);
const p0 = h1.nodes[0].plan;
same('Plan parsing: clause kinds and steps', p0.clauses.map((c) => [c.kind, c.steps]), [['seq', [1, 2]], ['if', [3]], ['parallel', [4, 5]]]);
same('Plan parsing: required and conditional steps', [p0.mandatory, p0.conditional], [[1, 2, 4, 5], [3]]);
const hs = H.htaStats(h1.nodes);
near('Total time: every step once × frequency = 120 + 5 + 600 + 10 + 16', hs.total, 751, 1e-12);
near('Critical path: 120 + 5 + max(10, 16), conditional step left out', hs.critical, 141, 1e-12);
same('P × C ranking (L/M/H = 1/2/3): Pour 9, then Stir 3, then Add tea bag 2', hs.ranked.map((n) => [n.name, n.risk]), [['Pour', 9], ['Stir', 3], ['Add tea bag', 2]]);
same('SHERPA modes from letters and words', hs.ranked.map((n) => n.mode), ['A', 'C', 'A']);
const h2 = H.parseHta(`Goal
  Plan 0: do 1-2 in any order; repeat 1 to 2 until done
  A
    Plan: 1.1 > 1.2
    A one | klm=M P BB "hi"
    A two | t=2 min
  B | t=1.5`);
same('Nested numbering and plan ranges', [h2.nodes.map((n) => n.num), h2.nodes[0].plan.clauses.map((c) => [c.kind, c.steps])], [['0', '1', '1.1', '1.2', '2'], [['any', [1, 2]], ['repeat', [1, 2]]]]);
same('Full step numbers in a plan (1.1 > 1.2 under task 1)', h2.nodes[1].plan.clauses.map((c) => [c.kind, c.steps]), [['seq', [1, 2]]]);
same('A plan that refers to a missing step is reported', H.parseHta('G\n  Plan: do 1 then 4\n  X\n  Y').nodes[0].plan.unknown, ['4']);
near('KLM time reuses the KLM calculator: M P BB "hi" at K = 0.28', h2.nodes[2].t, S.klmTime(S.parseKlm('M P BB "hi"').ops, 0.28).total, 1e-12);
near('Times in minutes: t=2 min is 120 s', h2.nodes[3].t, 120, 1e-12);
same('Depth, breadth, goals, subgoals and operations', [hs.depth, hs.breadth, hs.subgoals, hs.operations, H.htaStats(h2.nodes).depth], [1, 5, 0, 5, 2]);
const ex = H.htaStats(H.parseHta(H.HTA_EXAMPLE).nodes);
same('Example HTA: 17 operations, 5 subgoals, depth 3, 5 high-risk steps', [ex.operations, ex.subgoals, ex.depth, ex.high.length], [17, 5, 3, 5]);
const hsum = H.htaSummary(hs);
summaryShape('HTA', hsum);
truthy('HTA summary: the biggest top-level task share of time', hsum.meaning.some((m) => m.includes(`Task 3 (Buy milk) accounts for ${Math.round((600 / 751) * 100)}% of total time`)));
truthy('HTA summary: counts high-risk steps', hsum.meaning.some((m) => m.startsWith('1 high-risk step (P × C of 6 or more): 4 Pour')));
summaryShape('HTA example', H.htaSummary(ex));
const csvH = H.htaCsv(h1.nodes).split('\n');
same('HTA CSV: header and one row per node', [csvH[0], csvH.length], ['num,name,level,type,plan,time,klm,freq,total,P,C,PxC,mode,note', 7]);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
