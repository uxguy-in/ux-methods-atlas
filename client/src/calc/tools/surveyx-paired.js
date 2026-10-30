// Scaling from comparisons: Thurstone Case V and Bradley-Terry from a paired-preference matrix, and Guttman
// scalogram analysis of yes/no items. Pure functions shared by surveyx-Paired.jsx and check-surveyx.js.
import { normCdf, normInv, inv, chi2Sf, zCrit, parseTable, isNum, nonEmptyLines, splitCells, mean, fmt, pct, pval } from './surveyx-core.js';

// ── Input: a win matrix (row beat column) or a list of "winner, loser[, count]" lines ──
export function parseComparisons(text) {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) return { error: 'Paste a win matrix (names in the first row and column) or one "winner, loser" pair per line.' };
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const cells = lines.map((l) => splitCells(l, sep));
  const pairLike = cells.every((c) => (c.length === 2 || (c.length === 3 && isNum(c[2]))) && !isNum(c[0]) && !isNum(c[1]));
  if (pairLike && !(cells[0].length > 3)) {
    const names = []; const idx = (s) => { let i = names.indexOf(s); if (i < 0) { names.push(s); i = names.length - 1; } return i; };
    const trip = cells.filter((c) => !/^winner$/i.test(c[0])).map((c) => [idx(c[0]), idx(c[1]), c.length === 3 ? Number(c[2]) : 1]);
    const W = names.map(() => names.map(() => 0));
    for (const [a, b, n] of trip) if (a !== b) W[a][b] += n;
    return { names, W, format: 'pairs' };
  }
  const t = parseTable(text);
  const names = t.rows.map((r) => r[0]);
  const k = names.length;
  if (k < 3) return { error: 'Enter at least three items.' };
  if (t.head.length - 1 < k) return { error: `The matrix needs ${k} columns of counts after the name column.` };
  const W = t.rows.map((r, i) => names.map((_, j) => (i === j ? 0 : isNum(r[j + 1]) ? Number(r[j + 1]) : 0)));
  if (W.some((r) => r.some((v) => v < 0))) return { error: 'Counts cannot be negative.' };
  return { names, W, format: 'matrix' };
}

// Directed reachability: Bradley-Terry estimates exist only if every item beat, and lost to, a path of others (Ford 1957).
export function stronglyConnected(W) {
  const k = W.length;
  const reach = (fwd) => { const seen = new Set([0]), st = [0]; while (st.length) { const i = st.pop(); for (let j = 0; j < k; j++) if (!seen.has(j) && (fwd ? W[i][j] : W[j][i]) > 0) { seen.add(j); st.push(j); } } return seen.size === k; };
  return reach(true) && reach(false);
}

// ── Thurstone Case V (least squares on normal deviates; Mosteller 1951) ──
export function thurstone(W, { clip = 0.02 } = {}) {
  const k = W.length, Z = W.map(() => new Array(k).fill(NaN)), P = W.map(() => new Array(k).fill(NaN));
  const pairs = [];
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const n = W[i][j] + W[j][i];
    if (i !== j && n > 0) { P[i][j] = W[i][j] / n; Z[i][j] = normInv(Math.min(1 - clip, Math.max(clip, P[i][j]))); if (i < j) pairs.push([i, j, n]); }
  }
  // Minimise Σ (Z_ij − (s_i − s_j))² over observed pairs with Σ s = 0: (L + 11ᵀ/k) s = b, L the comparison-graph Laplacian.
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => 1 / k)), b = new Array(k).fill(0);
  for (const [i, j] of pairs) { A[i][i] += 1; A[j][j] += 1; A[i][j] -= 1; A[j][i] -= 1; b[i] += Z[i][j]; b[j] += Z[j][i]; }
  const Ai = inv(A); if (!Ai) return { error: 'The comparisons do not link every item to every other.' };
  const s = Ai.map((r) => r.reduce((acc, v, j) => acc + v * b[j], 0));
  const min = Math.min(...s), scale = s.map((v) => v - min);
  // Mosteller's (1951) goodness of fit on arcsine-transformed proportions (degrees): χ² = Σ n (θ − θ′)² / 821.
  let chi2 = 0, mad = 0;
  for (const [i, j, n] of pairs) {
    const pp = normCdf(s[i] - s[j]), th = (Math.asin(Math.sqrt(P[i][j])) * 180) / Math.PI, th2 = (Math.asin(Math.sqrt(pp)) * 180) / Math.PI;
    chi2 += (n * (th - th2) ** 2) / 821; mad += Math.abs(P[i][j] - pp);
  }
  const df = pairs.length - (k - 1);
  return { s, scale, P, Z, chi2, df, p: df > 0 ? chi2Sf(chi2, df) : NaN, mad: mad / pairs.length, nPairs: pairs.length, clipped: P.flat().filter((v) => Number.isFinite(v) && (v < clip || v > 1 - clip)).length / 2 };
}

// ── Bradley-Terry by maximum likelihood (Newton-Raphson with item 1 fixed at 0, then centred) ──
export function bradleyTerry(W, { conf = 0.95, maxIter = 100 } = {}) {
  const k = W.length;
  if (!stronglyConnected(W)) return { error: 'Some item won (or lost) every comparison it was in, or a group of items was never compared with the rest, so Bradley-Terry strengths are infinite. Collect more comparisons or merge items.' };
  const N = W.map((r, i) => r.map((v, j) => v + W[j][i]));
  let beta = new Array(k).fill(0), converged = false, I = null;
  for (let it = 0; it < maxIter; it++) {
    const g = new Array(k).fill(0); I = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      if (i === j || !N[i][j]) continue;
      const p = 1 / (1 + Math.exp(beta[j] - beta[i])), v = N[i][j] * p * (1 - p);
      g[i] += W[i][j] - N[i][j] * p; I[i][i] += v; I[i][j] -= v;
    }
    const Ir = I.slice(1).map((r) => r.slice(1)), Iinv = inv(Ir);
    if (!Iinv) return { error: 'The information matrix is singular; check that every item was compared.' };
    const step = Iinv.map((r) => r.reduce((s, v, j) => s + v * g[j + 1], 0));
    for (let i = 1; i < k; i++) beta[i] += step[i - 1];
    if (Math.max(...step.map(Math.abs)) < 1e-10) { converged = true; break; }
  }
  // Final information and covariances: with item 1 as reference, and for the centred (sum-to-zero) log-worths.
  I = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    if (i === j || !N[i][j]) continue;
    const p = 1 / (1 + Math.exp(beta[j] - beta[i])), v = N[i][j] * p * (1 - p); I[i][i] += v; I[i][j] -= v;
  }
  const covR = inv(I.slice(1).map((r) => r.slice(1)));
  const full = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i && j ? covR[i - 1][j - 1] : 0)));
  const M = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0) - 1 / k));
  const covC = M.map((r) => M.map((r2) => r.reduce((s, a, x) => s + a * r2.reduce((t, b, y) => t + full[x][y] * b, 0), 0)));
  const m = mean(beta), bc = beta.map((b) => b - m), z = zCrit(conf);
  const ex = bc.map(Math.exp), tot = ex.reduce((a, b) => a + b, 0);
  const items = bc.map((b, i) => ({ i, beta: b, se: Math.sqrt(covC[i][i]), lo: b - z * Math.sqrt(covC[i][i]), hi: b + z * Math.sqrt(covC[i][i]), worth: ex[i] / tot, betaRef: beta[i] - beta[0], seRef: Math.sqrt(full[i][i]) }));
  const prob = bc.map((bi) => bc.map((bj) => 1 / (1 + Math.exp(bj - bi))));
  let dev = 0, pairs = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    if (i === j || !N[i][j]) continue;
    if (i < j) pairs++;
    if (W[i][j] > 0) dev += 2 * W[i][j] * Math.log(W[i][j] / (N[i][j] * prob[i][j]));
  }
  const df = pairs - (k - 1);
  return { items, prob, covC, covR, dev, df, p: df > 0 ? chi2Sf(dev, df) : NaN, converged, nTotal: N.flat().reduce((a, b) => a + b, 0) / 2 };
}

// ── Guttman scalogram (Goodenough-Edwards error counting) with Loevinger/Mokken H ──
export function parseBinary(text) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const idCol = t.rows.some((r) => !/^[01]$/.test(String(r[0]).trim())) ? 0 : -1;
  const itemCols = t.head.map((_, j) => j).filter((j) => j !== idCol);
  const bad = t.rows.filter((r) => itemCols.some((j) => !/^[01]$/.test(String(r[j]).trim())));
  const rows = t.rows.filter((r) => !bad.includes(r));
  return { items: itemCols.map((j) => t.head[j]), ids: rows.map((r, i) => (idCol >= 0 ? r[idCol] : `R${i + 1}`)), X: rows.map((r) => itemCols.map((j) => Number(r[j]))), dropped: bad.length };
}
export function guttman(X, names) {
  const n = X.length, k = X[0].length;
  const p = names.map((_, j) => X.reduce((s, r) => s + r[j], 0) / n);
  const order = names.map((_, j) => j).sort((a, b) => p[b] - p[a] || a - b);
  let errors = 0;
  const rows = X.map((r, i) => {
    const s = r.reduce((a, b) => a + b, 0);
    const errs = order.map((j, pos) => (r[j] !== (pos < s ? 1 : 0) ? 1 : 0));
    const e = errs.reduce((a, b) => a + b, 0); errors += e;
    return { i, score: s, errs, e, pattern: order.map((j) => r[j]) };
  }).sort((a, b) => b.score - a.score || a.e - b.e || a.i - b.i);
  const CR = 1 - errors / (n * k);
  const MMR = mean(p.map((v) => Math.max(v, 1 - v)));
  const CS = MMR < 1 ? (CR - MMR) / (1 - MMR) : NaN;
  // Loevinger's H: for each pair, a Guttman error is passing the less popular item while failing the more popular one.
  let F = 0, E = 0; const Fj = new Array(k).fill(0), Ej = new Array(k).fill(0);
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
    const easy = order[a], hard = order[b];
    const f = X.reduce((s, r) => s + (r[easy] === 0 && r[hard] === 1 ? 1 : 0), 0), e = n * p[hard] * (1 - p[easy]);
    F += f; E += e; Fj[easy] += f; Fj[hard] += f; Ej[easy] += e; Ej[hard] += e;
  }
  const H = E > 0 ? 1 - F / E : NaN;
  const items = order.map((j) => ({ j, name: names[j], p: p[j], Hj: Ej[j] > 0 ? 1 - Fj[j] / Ej[j] : NaN, errors: rows.reduce((s, r) => s + r.errs[order.indexOf(j)], 0) }));
  const extremes = rows.filter((r) => r.score === 0 || r.score === k).length;
  return { n, k, order, items, rows, errors, CR, MMR, PPI: CR - MMR, CS, H, extremes, scoreDist: Array.from({ length: k + 1 }, (_, s) => rows.filter((r) => r.score === s).length) };
}

// ── "Reading your results" ──
const mokkenBand = (h) => (h >= 0.5 ? 'strong' : h >= 0.4 ? 'medium' : h >= 0.3 ? 'weak' : 'not a scale');

// Confidence rule (paired comparisons): high when there are at least 20 comparisons per compared pair on average and
// the Bradley-Terry deviance test does not reject the model (p ≥ 0.05); medium when there are at least 8 per pair;
// low otherwise or when the model fits badly.
export function pairedSummary(bt, th, names) {
  const perPair = bt.nTotal / Math.max(1, th.nPairs);
  const fits = !(bt.p < 0.05);
  const confidence = perPair >= 20 && fits ? 'high' : perPair >= 8 && fits ? 'medium' : 'low';
  const rank = [...bt.items].sort((a, b) => b.beta - a.beta);
  const top = rank[0], second = rank[1], last = rank[rank.length - 1];
  // Is the top item clearly ahead of the second? z test on the difference of log-worths.
  const i = top.i, j = second.i, vd = bt.covC[i][i] + bt.covC[j][j] - 2 * bt.covC[i][j], zd = (top.beta - second.beta) / Math.sqrt(vd);
  const pTop = 2 * (1 - normCdf(Math.abs(zd)));
  const thRank = names.map((_, x) => x).sort((a, b) => th.s[b] - th.s[a]);
  const agree = thRank.every((x, r) => x === rank[r].i);
  return {
    headline: `${names[top.i]} is preferred most (Bradley-Terry worth ${pct(top.worth, 0)}), followed by ${names[second.i]} (${pct(second.worth, 0)}); ${names[last.i]} is least preferred (${pct(last.worth, 0)}).`,
    meaning: [
      `Against ${names[second.i]}, ${names[top.i]} would be chosen ${pct(bt.prob[top.i][second.i], 0)} of the time; against ${names[last.i]}, ${pct(bt.prob[top.i][last.i], 0)}. ${pTop < 0.05 ? 'The lead over the runner-up is clear' : 'The lead over the runner-up is not clear'} (z = ${fmt(zd)}, p ${pval(pTop)}).`,
      `Thurstone Case V puts the items on an interval scale in units of the spread of judgements: ${thRank.map((x) => `${names[x]} ${fmt(th.scale[x])}`).join(', ')}. ${agree ? 'Both models give the same order.' : 'The two models order some items differently, a sign those items are close.'}`,
      `${fits ? 'The model fits the data' : 'The model does not fit well'} (Bradley-Terry deviance ${fmt(bt.dev)} on ${bt.df} df, p ${pval(bt.p)}; Mosteller's test for Thurstone χ² ${fmt(th.chi2)}, p ${pval(th.p)}). ${fits ? 'Preferences behave as if each item has one fixed appeal.' : 'Some choices are intransitive or depend on the pairing, so a single scale hides part of the story.'}`,
    ],
    confidence,
    confidenceNote: `Rule: high with at least 20 comparisons per compared pair on average and no misfit (deviance test p ≥ 0.05); medium with at least 8 per pair and no misfit; low otherwise. Here there are ${fmt(perPair, 1)} comparisons per pair.`,
    caveats: [
      'Worths are relative to this set of items: adding or removing an item changes every share.',
      'Treating every comparison as independent overstates precision when the same people judged many pairs; with few judges, report the intervals as optimistic.',
    ],
    next: [
      'Use the worths as ratio-scale weights (for example to prioritise features); use Thurstone values when you need an interval scale.',
      'For many items, MaxDiff collects comparisons more efficiently: see the [MaxDiff runner](/calculators/maxdiff-runner).',
    ],
    report: `From ${bt.nTotal} paired comparisons of ${names.length} items, a Bradley-Terry model ranked ${rank.map((r) => `${names[r.i]} (${pct(r.worth, 1)})`).join(', ')}; deviance ${fmt(bt.dev)} on ${bt.df} df (p ${pval(bt.p)}).`,
  };
}

// Confidence rule (Guttman): high when at least 100 respondents, CR ≥ 0.90 and H ≥ 0.40; medium when at least 30
// respondents and CR ≥ 0.85; low otherwise. Benchmarks: CR ≥ 0.90 (Guttman 1950), CS ≥ 0.60 (Menzel 1953),
// H ≥ 0.3 weak, ≥ 0.4 medium, ≥ 0.5 strong (Mokken 1971).
export function guttmanSummary(g) {
  const confidence = g.n >= 100 && g.CR >= 0.9 && g.H >= 0.4 ? 'high' : g.n >= 30 && g.CR >= 0.85 ? 'medium' : 'low';
  const isScale = g.CR >= 0.9 && g.CS >= 0.6;
  const weak = g.items.filter((it) => it.Hj < 0.3);
  return {
    headline: `${isScale ? 'The items form a Guttman scale' : 'The items do not form a clean Guttman scale'}: reproducibility ${g.CR.toFixed(3)}, scalability ${fmt(g.CS, 3)}, Loevinger's H ${fmt(g.H, 3)} (${mokkenBand(g.H)}).`,
    meaning: [
      `From most to least endorsed: ${g.items.map((it) => `${it.name} (${pct(it.p, 0)})`).join(', ')}. In a perfect scale, anyone who endorses an item also endorses every item before it.`,
      `Knowing only a person's total score reproduces ${pct(g.CR, 1)} of their answers (${g.errors} errors in ${g.n * g.k} answers). The item popularities alone would reproduce ${pct(g.MMR, 1)}, so the scale adds ${fmt(g.PPI * 100, 1)} points; the scalability coefficient rescales that gain to ${fmt(g.CS, 3)}.`,
      `Benchmarks: reproducibility of 0.90 or more (Guttman 1950), scalability of 0.60 or more (Menzel 1953) and H of at least 0.3 (weak), 0.4 (medium) or 0.5 (strong) (Mokken 1971).`,
      weak.length ? `${weak.map((it) => it.name).join(', ')} ${weak.length === 1 ? 'has' : 'have'} item H below 0.3 and break${weak.length === 1 ? 's' : ''} the cumulative order most; consider dropping or rewording.` : 'Every item has an item H of at least 0.3.',
    ],
    confidence,
    confidenceNote: `Rule: high with at least 100 respondents, reproducibility ≥ 0.90 and H ≥ 0.40; medium with at least 30 respondents and reproducibility ≥ 0.85; low otherwise. Here n = ${g.n}.`,
    caveats: [
      `Reproducibility is inflated by very popular or unpopular items and by people who answer all yes or all no (${g.extremes} here); check scalability and H too.`,
      'A good fit on one sample does not make the order universal; check it again in other segments before using totals as a cumulative score.',
    ],
    next: [
      'Use the item order to build a short adaptive screener: ask the middle item first and branch.',
      'For graded items or to test fit more formally, use [item analysis](/calculators/item-analysis) or a Rasch model.',
    ],
    report: `Guttman scalogram analysis of ${g.k} items (n = ${g.n}): coefficient of reproducibility ${g.CR.toFixed(3)}, minimum marginal reproducibility ${g.MMR.toFixed(3)}, coefficient of scalability ${fmt(g.CS, 3)}, Loevinger's H ${fmt(g.H, 3)}.`,
  };
}
