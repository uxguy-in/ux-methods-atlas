// Nash equilibria of two-player games in normal form: pure equilibria, mixed equilibria by support enumeration,
// iterated elimination of strictly dominated strategies, best-response curves for 2×2 games and teaching examples.
// Pure functions.
import { solveLinear, fmt, pctS, plural } from './sensors-core.js';

const EPS = 1e-9;
export const EXAMPLES = {
  pd: { name: "Prisoner's dilemma", rows: ['Cooperate', 'Defect'], cols: ['Cooperate', 'Defect'], A: [[3, 0], [5, 1]], B: [[3, 5], [0, 1]], note: 'Two teams each choose whether to share their research findings. Sharing helps both, but each does best by keeping its own findings while the other shares.' },
  stag: { name: 'Coordination (stag hunt)', rows: ['Adopt new system', 'Keep old'], cols: ['Adopt new system', 'Keep old'], A: [[4, 0], [3, 3]], B: [[4, 3], [0, 3]], note: 'Two product teams decide whether to move to a new design system. Moving together pays most; moving alone is worst; staying put is safe.' },
  bos: { name: 'Battle of the sexes', rows: ['Standard X', 'Standard Y'], cols: ['Standard X', 'Standard Y'], A: [[3, 0], [0, 2]], B: [[2, 0], [0, 3]], note: 'Two partners must agree on a file standard; each prefers a different one, but any agreement beats none.' },
  pennies: { name: 'Matching pennies', rows: ['Heads', 'Tails'], cols: ['Heads', 'Tails'], A: [[1, -1], [-1, 1]], B: [[-1, 1], [1, -1]], note: 'A fraud checker chooses where to look and a fraudster where to strike: no pure equilibrium, only randomising.' },
  chicken: { name: 'Chicken (hawk-dove)', rows: ['Yield', 'Hold firm'], cols: ['Yield', 'Hold firm'], A: [[2, 1], [3, 0]], B: [[2, 3], [1, 0]], note: 'Two marketplace sellers decide whether to cut prices aggressively; if both hold firm, both lose.' },
  rps: { name: 'Rock, paper, scissors', rows: ['Rock', 'Paper', 'Scissors'], cols: ['Rock', 'Paper', 'Scissors'], A: [[0, -1, 1], [1, 0, -1], [-1, 1, 0]], B: [[0, 1, -1], [-1, 0, 1], [1, -1, 0]], note: 'A 3×3 zero-sum game whose only equilibrium mixes all three strategies equally.' },
};

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const col = (M, j) => M.map((r) => r[j]);
function combos(n, k) {
  const out = [], c = [];
  const rec = (start) => { if (c.length === k) { out.push([...c]); return; } for (let i = start; i < n; i++) { c.push(i); rec(i + 1); c.pop(); } };
  rec(0); return out;
}

// Pure equilibria: cells where each strategy is a best response to the other.
export function pureEquilibria(A, B) {
  const m = A.length, n = A[0].length, out = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    if (A[i][j] >= Math.max(...col(A, j)) - EPS && B[i][j] >= Math.max(...B[i]) - EPS) out.push([i, j]);
  }
  return out;
}

// Support enumeration (Nash equilibria of nondegenerate games have supports of equal size; von Stengel 2007): for
// every pair of supports I, J of size k, solve for the column mix y on J that makes the row player indifferent across I
// (A_IJ y = v, Σy = 1) and the row mix x on I that makes the column player indifferent across J (B_IJᵀ x = u, Σx = 1);
// keep it when x, y ≥ 0 and no strategy outside the supports pays more.
export function supportEnumeration(A, B) {
  const m = A.length, n = A[0].length, out = [];
  for (let k = 1; k <= Math.min(m, n); k++) {
    for (const I of combos(m, k)) for (const J of combos(n, k)) {
      const My = I.map((i) => [...J.map((j) => A[i][j]), -1]); My.push([...J.map(() => 1), 0]);
      const y0 = solveLinear(My, [...I.map(() => 0), 1]);
      const Mx = J.map((j) => [...I.map((i) => B[i][j]), -1]); Mx.push([...I.map(() => 1), 0]);
      const x0 = solveLinear(Mx, [...J.map(() => 0), 1]);
      if (!y0 || !x0) continue;
      const ys = y0.slice(0, k), xs = x0.slice(0, k);
      if (ys.some((v) => v < -EPS) || xs.some((v) => v < -EPS)) continue;
      const x = new Array(m).fill(0), y = new Array(n).fill(0);
      I.forEach((i, a) => { x[i] = Math.max(0, xs[a]); }); J.forEach((j, a) => { y[j] = Math.max(0, ys[a]); });
      const rowPay = A.map((r) => dot(r, y)), colPay = Array.from({ length: n }, (_, j) => dot(x, col(B, j)));
      const v = Math.max(...rowPay), u = Math.max(...colPay);
      if (I.some((i) => rowPay[i] < v - 1e-7) || J.some((j) => colPay[j] < u - 1e-7)) continue;
      if (out.some((e) => e.x.every((a, i) => Math.abs(a - x[i]) < 1e-7) && e.y.every((a, j) => Math.abs(a - y[j]) < 1e-7))) continue;
      out.push({ x, y, rowPayoff: dot(x, rowPay), colPayoff: dot(y, colPay), pure: k === 1, support: [I, J] });
    }
  }
  return out;
}

// A game is degenerate when some mixed strategy with support size k has more than k pure best responses (checked here
// for every equilibrium found and for every pure strategy); equilibria may then form a continuum.
export function isDegenerate(A, B, eqs) {
  const m = A.length, n = A[0].length;
  for (let i = 0; i < m; i++) { const r = B[i], mx = Math.max(...r); if (r.filter((v) => v >= mx - EPS).length > 1) return true; }
  for (let j = 0; j < n; j++) { const c = col(A, j), mx = Math.max(...c); if (c.filter((v) => v >= mx - EPS).length > 1) return true; }
  for (const e of eqs) {
    const rowPay = A.map((r) => dot(r, e.y)), colPay = Array.from({ length: n }, (_, j) => dot(e.x, col(B, j)));
    const k = e.support[0].length;
    if (rowPay.filter((v) => v >= Math.max(...rowPay) - 1e-7).length > k || colPay.filter((v) => v >= Math.max(...colPay) - 1e-7).length > k) return true;
  }
  return false;
}

// Iterated elimination of strictly dominated pure strategies (by another pure strategy).
export function eliminate(A, B) {
  let R = A.map((_, i) => i), C = A[0].map((_, j) => j);
  const log = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const i of R) {
      const by = R.find((k) => k !== i && C.every((j) => A[k][j] > A[i][j] + EPS));
      if (by !== undefined) { log.push({ player: 'row', s: i, by }); R = R.filter((x) => x !== i); changed = true; break; }
    }
    if (changed) continue;
    for (const j of C) {
      const by = C.find((k) => k !== j && R.every((i) => B[i][k] > B[i][j] + EPS));
      if (by !== undefined) { log.push({ player: 'col', s: j, by }); C = C.filter((x) => x !== j); changed = true; break; }
    }
  }
  return { rows: R, cols: C, log };
}

// Outcomes (pure cells) that give both players at least as much as the equilibrium, and one more.
export function paretoBetter(A, B, e) {
  const out = [];
  A.forEach((r, i) => r.forEach((a, j) => { if (a >= e.rowPayoff - EPS && B[i][j] >= e.colPayoff - EPS && (a > e.rowPayoff + EPS || B[i][j] > e.colPayoff + EPS)) out.push([i, j]); }));
  return out;
}

// Best responses in a 2×2 game: the row player's indifference point q* (probability the column player plays its
// first strategy) and the column player's p* (probability the row player plays its first strategy).
export function bestResponse2x2(A, B) {
  const dr = A[0][0] - A[1][0] - A[0][1] + A[1][1], dc = B[0][0] - B[0][1] - B[1][0] + B[1][1];
  const qStar = dr ? (A[1][1] - A[0][1]) / dr : NaN, pStar = dc ? (B[1][1] - B[1][0]) / dc : NaN;
  // row's payoff advantage of strategy 1 over 2 at q: dr·q + (A01 − A11); column's advantage at p: dc·p + (B10 − B11)
  return { qStar, pStar, rowAdv: (q) => dr * q + (A[0][1] - A[1][1]), colAdv: (p) => dc * p + (B[1][0] - B[1][1]) };
}

export function analyse(game) {
  const { A, B } = game;
  const eqs = supportEnumeration(A, B);
  const pure = pureEquilibria(A, B);
  const elim = eliminate(A, B);
  const degenerate = isDegenerate(A, B, eqs);
  const zeroSum = A.every((r, i) => r.every((v, j) => Math.abs(v + B[i][j]) < EPS));
  return { eqs, pure, elim, degenerate, zeroSum, pareto: eqs.map((e) => paretoBetter(A, B, e)) };
}

export const mixText = (v, names) => v.map((p, i) => [p, names[i]]).filter(([p]) => p > 1e-9).map(([p, nm]) => (p > 1 - 1e-9 ? nm : `${nm} ${pctS(p, 0)}`)).join(', ');

// ── Reading your results ──
// Confidence here is about how clear-cut the game's prediction is, not about data: high when there is exactly one
// equilibrium and the game is nondegenerate (and, for a pure equilibrium, it survives elimination of dominated
// strategies or the game is solved by it); medium when there are several equilibria (players must coordinate, so the
// model alone cannot say which happens); low when the game is degenerate (ties in payoffs), where equilibria can form
// a continuum that support enumeration does not list in full.
export function nashConfidence(r) {
  if (r.degenerate) return 'low';
  return r.eqs.length === 1 ? 'high' : 'medium';
}
export function nashSummary(r, game) {
  const { rows, cols } = game;
  const desc = (e) => (e.pure ? `${rows[e.x.indexOf(1)]} / ${cols[e.y.indexOf(1)]}` : `row mixes ${mixText(e.x, rows)}; column mixes ${mixText(e.y, cols)}`);
  const pure = r.eqs.filter((e) => e.pure), mixed = r.eqs.filter((e) => !e.pure);
  const ineff = r.eqs.map((e, i) => ({ e, better: r.pareto[i] })).filter((z) => z.better.length);
  const solved = r.elim.rows.length === 1 && r.elim.cols.length === 1;
  return {
    headline: r.eqs.length === 1
      ? `One Nash equilibrium: ${desc(r.eqs[0])}, with payoffs ${fmt(r.eqs[0].rowPayoff, 2)} and ${fmt(r.eqs[0].colPayoff, 2)}.`
      : `${plural(r.eqs.length, 'Nash equilibrium', 'Nash equilibria')} (${pure.length} pure, ${mixed.length} mixed): the players have to coordinate on one.`,
    meaning: [
      solved ? `Removing strictly dominated strategies leaves only ${rows[r.elim.rows[0]]} / ${cols[r.elim.cols[0]]}: each player has a strategy that is better whatever the other does.` : r.elim.log.length ? `${plural(r.elim.log.length, 'strategy', 'strategies')} can be ruled out as strictly dominated, but that does not settle the game.` : 'No strategy is strictly dominated, so each player\'s best choice depends on what they expect the other to do.',
      ineff.length ? `The equilibrium ${desc(ineff[0].e)} is not the best joint outcome: ${ineff[0].better.map(([i, j]) => `${rows[i]} / ${cols[j]}`).join(', ')} would leave both at least as well off. This gap is the classic social dilemma; agreements, repeated play or changed incentives are what close it.` : 'No outcome makes both players better off than the equilibrium.',
      mixed.length ? `In the mixed equilibrium each player randomises so that the other is indifferent; the mix depends on the other player's payoffs, not their own.` : null,
      r.zeroSum ? 'The game is zero-sum: one player\'s gain is the other\'s loss, so the equilibrium is also each player\'s safest (maximin) strategy.' : null,
    ].filter(Boolean),
    confidence: nashConfidence(r),
    confidenceNote: 'This rates how clear-cut the prediction is, not the data: high with a single equilibrium in a game without payoff ties, medium with several equilibria, low when payoff ties make the game degenerate (equilibria may form a continuum).',
    caveats: [
      'Nash equilibrium assumes both players know the payoffs and act on them; real people also weigh fairness, habit and trust (see the economic games methods).',
      'The payoffs are your model of the situation. Small changes can move the equilibrium, so try nearby values.',
      r.degenerate ? 'This game has ties, so support enumeration may miss equilibria that form a continuum.' : 'Only equilibria in one-shot play are shown; repeated games can sustain cooperation that one-shot play cannot.',
    ],
    next: [
      'Test the predicted behaviour with an economic game in a study, or check it against logged behaviour.',
      'Change the payoffs to see which design incentive (a reward, a cost, a default) moves the equilibrium to the outcome you want.',
    ],
    report: r.eqs.length === 1
      ? `The ${rows.length}×${cols.length} game has one Nash equilibrium (${desc(r.eqs[0])}) with payoffs ${fmt(r.eqs[0].rowPayoff, 2)} and ${fmt(r.eqs[0].colPayoff, 2)}${ineff.length ? ', and it is Pareto-inefficient' : ''}.`
      : `The ${rows.length}×${cols.length} game has ${r.eqs.length} Nash equilibria (${pure.length} pure, ${mixed.length} mixed), so the outcome depends on coordination.`,
  };
}
