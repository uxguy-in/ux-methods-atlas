// AHP and weighted decision matrices: Saaty's pairwise comparisons with the principal eigenvector, λmax, CI and CR,
// geometric-mean aggregation of judges, SMART/MAUT weighted scoring, weight sensitivity (break-even weights) and an
// effort × impact view. Pure functions with no React; checked by `npm run check:expanalytics` against numpy and
// Saaty's published school-selection example.
import { sum, fmt, pctText } from './expanalytics-core.js';

// Saaty's random index RI(n) for n = 1..10 (Saaty 1980, The Analytic Hierarchy Process, table 1.7).
export const SAATY_RI = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];
export const CR_LIMIT = 0.1;

// A judgement is stored as a signed step s in −8..8: s > 0 means the row item is (s + 1) times as important as the
// column item, s < 0 the reverse, 0 equal. So the slider runs 9 … 1 … 9.
export const stepToRatio = (s) => (s >= 0 ? s + 1 : 1 / (1 - s));
export const ratioToStep = (r) => (r >= 1 ? Math.round(r - 1) : -Math.round(1 / r - 1));
export const SAATY_WORDS = { 1: 'equal', 2: 'equal to moderate', 3: 'moderately more', 4: 'moderate to strong', 5: 'strongly more', 6: 'strong to very strong', 7: 'very strongly more', 8: 'very to extremely', 9: 'extremely more' };

// Full reciprocal matrix from the upper-triangle steps (pairs listed i < j in row order).
export function matrixFromSteps(n, steps) {
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  let x = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const r = stepToRatio(steps[x++] ?? 0); A[i][j] = r; A[j][i] = 1 / r; }
  return A;
}
export function matrixFromRatios(n, ratios) {
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
  let x = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const r = ratios[x++] ?? 1; A[i][j] = r; A[j][i] = 1 / r; }
  return A;
}
// Element-wise geometric mean of several judges' matrices (Aczél and Saaty 1983): keeps the result reciprocal.
export function geoMeanMatrix(mats) {
  const n = mats[0].length;
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => Math.exp(sum(mats.map((m) => Math.log(m[i][j]))) / mats.length)));
}
// Principal eigenvector by power iteration, normalised to sum 1; λmax = average of (Aw)_i / w_i; CI = (λmax − n)/(n − 1);
// CR = CI / RI(n).
export function ahpPriorities(A) {
  const n = A.length;
  if (n === 1) return { w: [1], lambda: 1, ci: 0, cr: 0, ri: 0, n };
  let w = Array(n).fill(1 / n);
  for (let it = 0; it < 1000; it++) {
    const v = A.map((row) => sum(row.map((a, j) => a * w[j]))), s = sum(v), nw = v.map((x) => x / s);
    const d = Math.max(...nw.map((x, i) => Math.abs(x - w[i]))); w = nw;
    if (d < 1e-15) break;
  }
  const Aw = A.map((row) => sum(row.map((a, j) => a * w[j])));
  const lambda = sum(Aw.map((x, i) => x / w[i])) / n;
  const ci = n > 2 ? (lambda - n) / (n - 1) : 0, ri = SAATY_RI[n] ?? 1.49;
  return { w, lambda, ci, cr: ri > 0 ? ci / ri : 0, ri, n };
}
// For an inconsistent matrix, the judgement that most disagrees with the priorities: max |a_ij · w_j / w_i − 1|
// on the log scale, and the ratio the priorities imply instead.
export function worstJudgement(A, w) {
  let best = null;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const e = Math.abs(Math.log(A[i][j] * (w[j] / w[i])));
    if (!best || e > best.e) best = { i, j, e, given: A[i][j], implied: w[i] / w[j] };
  }
  return best;
}
// Whole AHP: criteria matrix plus one options matrix per criterion. Global scores are the weighted sum of local priorities.
export function ahp(criteriaA, optionMats) {
  const crit = ahpPriorities(criteriaA);
  const local = optionMats.map((m) => ahpPriorities(m));
  const nOpt = optionMats[0].length;
  const scores = Array.from({ length: nOpt }, (_, o) => sum(crit.w.map((wc, c) => wc * local[c].w[o])));
  return { crit, local, scores, V: Array.from({ length: nOpt }, (_, o) => local.map((l) => l.w[o])) };
}

// ── SMART / MAUT ──
// Raw weights are normalised to sum 1. Scores on each criterion are rescaled 0–1 by min-max (linear value function,
// Edwards and Barron 1994); for "lower is better" criteria the scale is reversed. Overall = Σ w_c v_oc.
export function smart(weights, scores, directions) {
  const W = sum(weights), w = weights.map((x) => x / W);
  const nC = weights.length;
  const V = scores.map((row) => row.slice());
  for (let c = 0; c < nC; c++) {
    const col = scores.map((r) => r[c]), lo = Math.min(...col), hi = Math.max(...col);
    scores.forEach((r, o) => { const v = hi > lo ? (r[c] - lo) / (hi - lo) : 1; V[o][c] = directions[c] === 'lower' ? 1 - v : v; });
  }
  const total = V.map((row) => sum(row.map((v, c) => v * w[c])));
  return { w, V, total };
}

// ── Sensitivity ──
// Vary criterion c's weight t from 0 to 1, keeping the other weights in proportion: score_o(t) = t·V_oc + (1 − t)·Σ_{j≠c}
// w_j/(1 − w_c)·V_oj. Scores are straight lines in t, so the weights where the leader changes are exact.
export function scoreLines(w, V, c) {
  const rest = 1 - w[c];
  return V.map((row) => {
    const other = rest > 1e-12 ? sum(row.map((v, j) => (j === c ? 0 : (v * w[j]) / rest))) : sum(row.filter((_, j) => j !== c)) / Math.max(1, row.length - 1);
    return { a: other, b: row[c] - other }; // score(t) = a + b·t
  });
}
const leaderAt = (lines, t) => lines.map((l, o) => [l.a + l.b * t, o]).sort((x, y) => y[0] - x[0] || x[1] - y[1])[0][1];
export function sensitivity(w, V, names = []) {
  const top = leaderAt(scoreLines(w, V, 0), w[0]);
  return w.map((wc, c) => {
    const lines = scoreLines(w, V, c);
    const cuts = [];
    for (let o = 0; o < lines.length; o++) for (let p = o + 1; p < lines.length; p++) {
      const db = lines[o].b - lines[p].b; if (Math.abs(db) < 1e-14) continue;
      const t = (lines[p].a - lines[o].a) / db; if (t > 1e-12 && t < 1 - 1e-12) cuts.push(t);
    }
    cuts.sort((a, b) => a - b);
    // Nearest break-even below and above the current weight where the leader actually changes.
    // Scan down from the current weight for the first change of leader, then up.
    let down = null, up = null;
    for (const t of [...cuts].reverse()) if (t < wc - 1e-12) { const nb = leaderAt(lines, Math.max(0, t - 1e-9)); if (nb !== top) { down = { t, to: nb }; break; } }
    for (const t of cuts) if (t > wc + 1e-12) { const nb = leaderAt(lines, Math.min(1, t + 1e-9)); if (nb !== top) { up = { t, to: nb }; break; } }
    return { c, name: names[c], w: wc, down, up, lines, nearest: [down, up].filter(Boolean).sort((a, b) => Math.abs(a.t - wc) - Math.abs(b.t - wc))[0] || null };
  });
}

// ── Effort × impact ──
// Quadrants split at the midpoints of the scales: impact 0–1 (overall score) and effort 1–10.
export function quadrant(impact, effort, impactMid = 0.5, effortMid = 5.5) {
  if (impact >= impactMid) return effort < effortMid ? 'Quick win' : 'Big bet';
  return effort < effortMid ? 'Fill-in' : 'Money pit';
}

// ── Reading your results ──
// Confidence rule: "high" when the top option leads the runner-up by ≥ 0.10 (on the 0–1 score scale for SMART, or ≥ 20%
// of the leader's AHP priority), every AHP matrix has CR ≤ 0.10 and no single weight change of less than 0.10 flips the
// leader; "medium" when one of these fails; "low" when two or more fail.
export function decisionSummary({ method, names, critNames, scores, crs = [], sens, judges = 1 }) {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
  const [lead, second] = order;
  const gap = lead[0] - (second ? second[0] : 0);
  const close = method === 'ahp' ? gap < 0.2 * lead[0] : gap < 0.1;
  const bad = crs.filter((c) => c.cr > CR_LIMIT);
  const fragile = sens.filter((s) => s.nearest && Math.abs(s.nearest.t - s.w) < 0.1);
  const fails = [close, bad.length > 0, fragile.length > 0].filter(Boolean).length;
  const confidence = fails === 0 ? 'high' : fails === 1 ? 'medium' : 'low';
  const fmtS = (s) => (method === 'ahp' ? fmt(s, 3) : fmt(s * 100, 0));
  const meaning = [
    `${names[lead[1]]} scores ${fmtS(lead[0])}${second ? `, ahead of ${names[second[1]]} at ${fmtS(second[0])}` : ''}${method === 'ahp' ? ' (priorities sum to 1)' : ' out of 100'}.`,
  ];
  if (method === 'ahp') {
    meaning.push(bad.length
      ? `${bad.length} comparison matri${bad.length > 1 ? 'ces are' : 'x is'} inconsistent (CR above 0.10: ${bad.map((b) => `${b.name} ${fmt(b.cr, 2)}`).join(', ')}). The judgements contradict each other, for example A > B and B > C but C > A, so the priorities from ${bad.length > 1 ? 'them' : 'it'} are unreliable.`
      : `Every matrix is acceptably consistent (all CR ≤ 0.10, Saaty's rule), so the judgements hang together.`);
    if (judges > 1) meaning.push(`The ${judges} judges were combined by the geometric mean of their judgements, which keeps the matrix reciprocal (Aczél and Saaty 1983).`);
  }
  meaning.push(fragile.length
    ? `The ranking is sensitive: changing the weight of ${fragile.map((f) => `"${f.name}" from ${pctText(f.w, 0)} to ${pctText(f.nearest.t, 0)}`).join(' or ')} would put ${names[fragile[0].nearest.to]} on top.`
    : `The leader is robust: no single criterion's weight would have to move by less than 10 points to change it.`);
  return {
    headline: `${names[lead[1]]} comes out on top of ${names.length} options across ${critNames.length} criteria${close ? ', but the margin is small' : ''}.`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong when the leader is clearly ahead (${method === 'ahp' ? 'by 20% or more of its priority' : 'by 10 points or more'}), every AHP matrix has CR ≤ 0.10 and no weight change under 10 points flips the result; some when one of these fails; weak when two or more fail.`,
    caveats: [
      method === 'ahp' ? 'A CR above 0.1 means the judgements are inconsistent, not that the conclusion is wrong; revisit the pair the tool flags rather than nudging numbers until the CR passes.' : 'Scores are rescaled from worst (0) to best (1) among these options, so adding or removing an option can change the weights\' effect.',
      'The output is only as good as the criteria and weights: a decision matrix makes the reasoning visible, it does not make it objective.',
    ],
    next: ['Share the weights and the sensitivity chart with stakeholders before the scores, so the debate is about priorities rather than the answer.', fragile.length ? 'Agree the fragile weights explicitly, or gather evidence (research, data) on the criteria that decide the outcome.' : 'Record the weights and judgements as the audit trail for the decision.'],
    report: `Using ${method === 'ahp' ? 'the Analytic Hierarchy Process' : 'SMART weighted scoring'}, ${names[lead[1]]} ranked first (${fmtS(lead[0])}${second ? ` vs ${fmtS(second[0])} for ${names[second[1]]}` : ''})${method === 'ahp' ? `; consistency ratios ${crs.map((c) => fmt(c.cr, 2)).join(', ')}` : ''}. ${fragile.length ? 'The ranking was sensitive to the weights of ' + fragile.map((f) => f.name).join(' and ') + '.' : 'The ranking held for any single weight change of up to 10 points.'}`,
  };
}
