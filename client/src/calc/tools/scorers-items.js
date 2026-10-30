// Classical item analysis (difficulty, upper-lower discrimination, point-biserial and corrected item-total
// correlations, alpha if deleted, distractor analysis) and the dichotomous Rasch model estimated by conditional
// maximum likelihood (CML) or joint maximum likelihood (JML) with the (L − 1)/L bias correction, with person
// measures, infit/outfit and a Wright map. Pure functions; checked in server/scripts/check-scorers.js against
// pingouin, scipy and girth (scorers-reference.py).
import { mean, variance, pearson, invert, splitLine, parseMatrix, MISSING } from './scorers-math.js';

const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

// ── Parsing ──
// Numbers (0/1 or item scores) or letter answers with a key line ("key: B C A …"). With a key, an answer that
// matches is 1 and anything else, including a blank, is 0. A first column of IDs and a header row are optional.
export function parseItems(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  let key = null; const body = [];
  for (const l of lines) {
    const m = l.match(/^\s*key\s*[:,;\t ]\s*(.+)$/i);
    if (m) key = splitLine(m[1]).map((s) => s.trim().toUpperCase()); else body.push(splitLine(l));
  }
  if (!body.length) return { rows: [], labels: [], names: [], key, raw: null };
  if (!key) {
    const m = parseMatrix(body.map((r) => r.join('\t')).join('\n'));
    return { rows: m.rows, labels: m.labels, names: m.names.map((x, j) => (/^Item \d+$/.test(x) ? `Q${j + 1}` : x)), key: null, raw: null };
  }
  // Letter answers: a header row has a multi-character cell after the first; an ID column has multi-character
  // first cells in every row.
  const long = (c) => c.trim().length > 1 && !MISSING.has(c.trim().toLowerCase());
  const header = body[0].slice(1).some(long) ? body.shift() : null;
  const labelled = body.every((r) => long(r[0]));
  const cells = body.map((r) => (labelled ? r.slice(1) : r));
  const labels = body.map((r, i) => (labelled ? r[0] : String(i + 1)));
  const k = Math.max(...cells.map((r) => r.length));
  const names = header ? (labelled ? header.slice(1) : header).slice(0, k) : [];
  while (names.length < k) names.push(`Q${names.length + 1}`);
  const raw = cells.map((r) => Array.from({ length: k }, (_, j) => { const a = String(r[j] ?? '').trim().toUpperCase(); return MISSING.has(a.toLowerCase()) ? '' : a; }));
  const rows = raw.map((r) => r.map((a, j) => (key[j] !== undefined && a === key[j] ? 1 : 0)));
  return { rows, labels, names, key: key.slice(0, k), raw };
}

// ── Classical item analysis ──
// rows: complete numeric rows. maxScore per item = the largest observed value (1 for 0/1 items).
export function classical(rows, { groupShare = 0.27, raw = null, key = null } = {}) {
  const n = rows.length, k = rows[0]?.length || 0;
  if (n < 3 || k < 2) return null;
  const cols = Array.from({ length: k }, (_, j) => rows.map((r) => r[j]));
  const total = rows.map((r) => r.reduce((a, b) => a + b, 0));
  const alphaOf = (idx) => {
    const kk = idx.length; if (kk < 2) return NaN;
    const t = rows.map((r) => idx.reduce((a, j) => a + r[j], 0));
    return kk / (kk - 1) * (1 - idx.reduce((a, j) => a + variance(cols[j]), 0) / variance(t));
  };
  const all = cols.map((_, j) => j);
  const alpha = alphaOf(all);
  const dich = rows.every((r) => r.every((v) => v === 0 || v === 1));
  // Upper and lower groups: the top and bottom round(27% × n) respondents by total score; ties at the cut are
  // broken by input order (stable sort), so results are reproducible.
  const g = Math.max(1, Math.round(groupShare * n));
  const order = total.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1]);
  const upper = order.slice(0, g), lower = order.slice(n - g);
  const sdT = Math.sqrt(variance(total));
  const items = cols.map((c, j) => {
    const max = Math.max(1, ...c);
    const p = mean(c) / max;
    const D = (mean(upper.map((i) => c[i])) - mean(lower.map((i) => c[i]))) / max;
    const rpb = pearson(c, total);
    const rit = pearson(c, total.map((t, i) => t - c[i]));
    const aid = alphaOf(all.filter((x) => x !== j));
    let distractors = null;
    if (raw && key) {
      const opts = [...new Set(raw.map((r) => r[j]))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
      distractors = opts.map((o) => ({ option: o === '' ? '(blank)' : o, key: o === key[j], all: raw.filter((r) => r[j] === o).length / n, upper: upper.filter((i) => raw[i][j] === o).length / g, lower: lower.filter((i) => raw[i][j] === o).length / g }));
    }
    const flags = [];
    if (p < 0.2) flags.push('very hard'); if (p > 0.9) flags.push('very easy');
    if (rit < 0) flags.push('negative: check key'); else if (rit < 0.2) flags.push('weak discrimination');
    if (aid > alpha + 0.01) flags.push('alpha rises without it');
    if (distractors) for (const d of distractors) if (!d.key && d.option !== '(blank)' && d.upper > d.lower && d.upper >= 0.1) { flags.push(`distractor ${d.option} draws top scorers`); break; }
    return { item: j + 1, max, mean: mean(c), p, sd: Math.sqrt(variance(c)), D, rpb, rit, aid, distractors, flags };
  });
  return { n, k, alpha, dich, sem: sdT * Math.sqrt(Math.max(0, 1 - alpha)), meanTotal: mean(total), sdTotal: sdT, items, g, total };
}
// Ebel and Frisbie (1991): D ≥ .40 very good, .30–.39 reasonably good, .20–.29 marginal, below .20 poor.
export const ebel = (d) => (d >= 0.4 ? 'very good' : d >= 0.3 ? 'reasonably good' : d >= 0.2 ? 'marginal' : 'poor');

// ── Rasch model (dichotomous) ──
// Elementary symmetric functions γ_0..γ_L of ε_i = exp(−b_i), leaving out the items in `skip`.
function esf(eps, skip = -1) {
  const g = new Float64Array(eps.length + 1); g[0] = 1; let len = 0;
  for (let i = 0; i < eps.length; i++) {
    if (i === skip) continue;
    len++;
    for (let r = len; r >= 1; r--) g[r] += eps[i] * g[r - 1];
  }
  return g;
}
// Remove item j from γ^(i) (length L + 1). Forward recursion when ε_j ≤ 1, backward otherwise, for stability.
function removeItem(g, e, m) {
  // g holds the ESF of m items; return the ESF of the m − 1 items left after removing one with ε = e.
  const out = new Float64Array(g.length);
  if (e <= 1) { out[0] = g[0]; for (let r = 1; r < m; r++) out[r] = g[r] - e * out[r - 1]; }
  else { out[m - 1] = g[m] / e; for (let r = m - 1; r >= 1; r--) out[r - 1] = (g[r] - out[r]) / e; }
  return out;
}

// Complete 0/1 rows only. Drops items everyone got right or wrong, then persons with extreme scores (for estimation).
export function raschPrep(rows) {
  const L0 = rows[0]?.length || 0;
  const colSum = Array.from({ length: L0 }, (_, j) => rows.reduce((a, r) => a + r[j], 0));
  const keepItems = colSum.map((s, j) => (s > 0 && s < rows.length ? j : -1)).filter((j) => j >= 0);
  const extremeItems = colSum.map((s, j) => (s === 0 ? { item: j + 1, all: 'wrong' } : s === rows.length ? { item: j + 1, all: 'right' } : null)).filter(Boolean);
  const X = rows.map((r) => keepItems.map((j) => r[j]));
  return { X, keepItems, extremeItems };
}

export function raschCML(X, { maxIter = 200, tol = 1e-10 } = {}) {
  const L = X[0].length;
  const scores = X.map((r) => r.reduce((a, b) => a + b, 0));
  const use = X.filter((_, v) => scores[v] > 0 && scores[v] < L);
  const nr = new Float64Array(L + 1); for (const r of use) nr[r.reduce((a, b) => a + b, 0)]++;
  const s = Array.from({ length: L }, (_, i) => use.reduce((a, r) => a + r[i], 0));
  const N = use.length;
  let b = s.map((si) => Math.log((N - si + 0.5) / (si + 0.5)));
  const c0 = mean(b); b = b.map((x) => x - c0);
  const loglik = (bb) => { const e = bb.map((x) => Math.exp(-x)), g = esf(e); let ll = -s.reduce((a, si, i) => a + si * bb[i], 0); for (let r = 1; r < L; r++) if (nr[r]) ll -= nr[r] * Math.log(g[r]); return ll; };
  let info = null, it = 0, ll = loglik(b), converged = false;
  for (; it < maxIter; it++) {
    const e = b.map((x) => Math.exp(-x)), g = esf(e);
    const gi = e.map((_, i) => esf(e, i));
    const pi = e.map((ei, i) => Array.from({ length: L + 1 }, (_, r) => (r >= 1 && r < L ? ei * gi[i][r - 1] / g[r] : 0)));
    const grad = s.map((si, i) => { let x = -si; for (let r = 1; r < L; r++) x += nr[r] * pi[i][r]; return x; });
    info = Array.from({ length: L }, () => new Array(L).fill(0));
    for (let i = 0; i < L; i++) {
      for (let r = 1; r < L; r++) info[i][i] += nr[r] * pi[i][r] * (1 - pi[i][r]);
      for (let j = i + 1; j < L; j++) {
        const gij = removeItem(gi[i], e[j], L - 1);
        let v = 0;
        for (let r = 2; r < L; r++) if (nr[r]) v += nr[r] * (e[i] * e[j] * gij[r - 2] / g[r] - pi[i][r] * pi[j][r]);
        for (let r = 1; r < 2 && r < L; r++) v += nr[r] * (0 - pi[i][r] * pi[j][r]);
        info[i][j] = info[j][i] = v;
      }
    }
    // Newton step on the shift-invariant likelihood: (I + 11ᵀ)⁻¹ g equals the minimum-norm step I⁺g.
    const Ireg = info.map((row) => row.map((v) => v + 1));
    const inv = invert(Ireg); if (!inv) break;
    let step = inv.map((row) => row.reduce((a, v, j) => a + v * grad[j], 0));
    let nb = b.map((x, i) => x + step[i]), nll = loglik(nb), half = 0;
    while (!(nll >= ll - 1e-12) && half < 30) { step = step.map((x) => x / 2); nb = b.map((x, i) => x + step[i]); nll = loglik(nb); half++; }
    const c = mean(nb); b = nb.map((x) => x - c); ll = nll;
    if (Math.max(...step.map(Math.abs)) < tol) { converged = true; break; }
  }
  // Covariance of the centred difficulties: (I + 11ᵀ)⁻¹ − 11ᵀ/L² (the Moore-Penrose inverse of the information).
  const inv = invert(info.map((row) => row.map((v) => v + 1)));
  const cov = inv ? inv.map((row) => row.map((v) => v - 1 / (L * L))) : null;
  const se = cov ? cov.map((row, i) => Math.sqrt(Math.max(0, row[i]))) : b.map(() => NaN);
  return { b, se, iterations: it + 1, converged, loglik: ll, nUsed: N, method: 'CML' };
}

// Person ability by maximum likelihood for raw score r (0 < r < L); extreme scores use r = 0.3 or L − 0.3.
export function thetaFor(r, b, { extreme = 0.3 } = {}) {
  const L = b.length; const rr = r <= 0 ? extreme : r >= L ? L - extreme : r;
  let th = Math.log(rr / (L - rr)) + mean(b);
  for (let i = 0; i < 100; i++) {
    let e = 0, w = 0; for (const bi of b) { const p = 1 / (1 + Math.exp(-(th - bi))); e += p; w += p * (1 - p); }
    const d = (rr - e) / w; th += Math.max(-2, Math.min(2, d)); if (Math.abs(d) < 1e-12) break;
  }
  let w = 0; for (const bi of b) { const p = 1 / (1 + Math.exp(-(th - bi))); w += p * (1 - p); }
  return { theta: th, se: 1 / Math.sqrt(w) };
}

// JML: alternate person (by raw score) and item Newton updates, centre items, then multiply difficulties by
// (L − 1)/L (Wright and Douglas 1977; Wright and Masters 1982) to remove most of JML's bias.
export function raschJML(X, { maxIter = 500, tol = 1e-10 } = {}) {
  const L = X[0].length;
  const scores = X.map((r) => r.reduce((a, b) => a + b, 0));
  const use = X.filter((_, v) => scores[v] > 0 && scores[v] < L);
  const nr = new Float64Array(L + 1); for (const r of use) nr[r.reduce((a, b) => a + b, 0)]++;
  const s = Array.from({ length: L }, (_, i) => use.reduce((a, r) => a + r[i], 0));
  const N = use.length;
  let b = s.map((si) => Math.log((N - si) / si)); let c = mean(b); b = b.map((x) => x - c);
  let th = new Float64Array(L + 1); let it = 0, converged = false;
  for (; it < maxIter; it++) {
    for (let r = 1; r < L; r++) if (nr[r]) th[r] = thetaFor(r, b).theta;
    let maxd = 0;
    const nb = b.map((bi, i) => {
      let x = bi;
      for (let k = 0; k < 50; k++) {
        let e = 0, w = 0; for (let r = 1; r < L; r++) if (nr[r]) { const p = 1 / (1 + Math.exp(-(th[r] - x))); e += nr[r] * p; w += nr[r] * p * (1 - p); }
        const d = (e - s[i]) / w; x += Math.max(-2, Math.min(2, d)); if (Math.abs(d) < 1e-13) break;
      }
      return x;
    });
    c = mean(nb); const cb = nb.map((x) => x - c);
    maxd = Math.max(...cb.map((x, i) => Math.abs(x - b[i]))); b = cb;
    if (maxd < tol) { converged = true; break; }
  }
  const raw = b.slice();
  const corr = (L - 1) / L;
  const bc = raw.map((x) => x * corr);
  // Model standard errors from the item information at the person estimates (scaled by the correction).
  const se = raw.map((bi) => { let w = 0; for (let r = 1; r < L; r++) if (nr[r]) { const p = 1 / (1 + Math.exp(-(th[r] - bi))); w += nr[r] * p * (1 - p); } return corr / Math.sqrt(w); });
  return { b: bc, raw, se, iterations: it + 1, converged, nUsed: N, method: 'JML', correction: corr };
}

// Fit: standardised residuals z = (x − P)/√W. Outfit = mean z²; infit = Σ(x − P)²/ΣW. ZSTD by the Wilson-Hilferty
// cube-root transformation with the model variance of the mean-square (Wright and Masters 1982; Linacre, Winsteps).
function zstd(ms, q) { return q > 0 ? (Math.cbrt(ms) - 1) * (3 / q) + q / 3 : NaN; }
export function raschFit(X, b, theta) {
  const N = X.length, L = b.length;
  const P = theta.map((t) => b.map((bi) => 1 / (1 + Math.exp(-(t - bi)))));
  const stat = (cells) => {
    let z2 = 0, num = 0, W = 0, cOut = 0, cIn = 0; const n = cells.length;
    for (const [x, p] of cells) { const w = p * (1 - p), C = w * (1 - 3 * w); z2 += (x - p) ** 2 / w; num += (x - p) ** 2; W += w; cOut += C / (w * w); cIn += C - w * w; }
    const outfit = z2 / n, infit = num / W;
    const qo = Math.sqrt(Math.max(0, cOut / (n * n) - 1 / n)), qi = Math.sqrt(Math.max(0, cIn / (W * W)));
    return { outfit, infit, outZ: zstd(outfit, qo), inZ: zstd(infit, qi) };
  };
  const items = b.map((_, i) => stat(X.map((r, v) => [r[i], P[v][i]])));
  const persons = X.map((r, v) => stat(r.map((x, i) => [x, P[v][i]])));
  return { items, persons, P };
}

export function rasch(rows, { method = 'CML' } = {}) {
  const prep = raschPrep(rows);
  const X = prep.X, L = X[0]?.length || 0;
  if (L < 3 || X.length < 5) return { error: 'The Rasch model needs at least 3 items that some, but not all, people get right, and 5 or more people.' };
  const scores = X.map((r) => r.reduce((a, b) => a + b, 0));
  const nonExtreme = scores.filter((s) => s > 0 && s < L).length;
  if (nonExtreme < 3) return { error: 'Too few people with a score between 0 and the maximum.' };
  const est = method === 'JML' ? raschJML(X) : raschCML(X);
  const byScore = Array.from({ length: L + 1 }, (_, r) => thetaFor(r, est.b));
  const theta = scores.map((r) => byScore[r].theta), pse = scores.map((r) => byScore[r].se);
  const fitIdx = X.map((_, v) => v).filter((v) => scores[v] > 0 && scores[v] < L);
  const fit = raschFit(fitIdx.map((v) => X[v]), est.b, fitIdx.map((v) => theta[v]));
  const personFit = X.map(() => null); fitIdx.forEach((v, k) => { personFit[v] = fit.persons[k]; });
  // Separation reliability (model): (observed variance − mean error variance)/observed variance, non-extreme persons.
  const th = fitIdx.map((v) => theta[v]), se2 = fitIdx.map((v) => pse[v] ** 2);
  const vObs = variance(th), relP = Math.max(0, (vObs - mean(se2)) / vObs);
  const vB = variance(est.b), relI = Math.max(0, (vB - mean(est.se.map((x) => x * x))) / vB);
  return {
    ...est, L, N: X.length, keepItems: prep.keepItems, extremeItems: prep.extremeItems, scores, theta, pse, byScore,
    itemFit: fit.items, personFit, nonExtreme, extremePersons: X.length - nonExtreme,
    relPerson: relP, sepPerson: Math.sqrt(relP / (1 - relP)), relItem: relI, sepItem: Math.sqrt(relI / (1 - relI)),
    targeting: mean(th) - mean(est.b), meanTheta: mean(th), sdTheta: Math.sqrt(vObs),
  };
}
// Linacre (2002, Rasch Measurement Transactions 16:2): mean-squares 0.5–1.5 are productive for measurement;
// above 2.0 distorts the measurement system.
export const fitBand = (ms) => (ms > 2 ? 'distorting' : ms > 1.5 ? 'noisy' : ms < 0.5 ? 'overfitting' : 'productive');

// ── Summaries ──
// Classical confidence rule: high with 200 or more respondents (item statistics stable to about ±0.07); medium
// with 50 or more; low otherwise (Nunnally and Bernstein 1994 suggest 200+ for item analysis).
export function classicalSummary(c, names = []) {
  const conf = c.n >= 200 ? 'high' : c.n >= 50 ? 'medium' : 'low';
  const nm = (it) => names[it.item - 1] || `item ${it.item}`;
  const flagged = c.items.filter((it) => it.flags.length);
  const neg = c.items.filter((it) => it.rit < 0);
  const drop = c.items.filter((it) => it.aid > c.alpha + 0.01).sort((a, b) => b.aid - a.aid);
  const coef = c.dich ? 'KR-20' : "Cronbach's alpha";
  const band = c.alpha >= 0.9 ? 'high' : c.alpha >= 0.8 ? 'good' : c.alpha >= 0.7 ? 'acceptable' : 'low';
  return {
    headline: `${coef} = ${f2(c.alpha)} (${band}) for ${c.k} items and ${c.n} people; ${flagged.length} item${flagged.length === 1 ? '' : 's'} flagged for review.`,
    meaning: [
      `Average difficulty p = ${f2(mean(c.items.map((i) => i.p)))}${c.dich ? ' (share correct)' : ' (mean as a share of the maximum)'}; items between about 0.3 and 0.9 discriminate best.`,
      neg.length ? `${neg.map(nm).join(', ')} correlate${neg.length === 1 ? 's' : ''} negatively with the rest of the test: the key may be wrong or the item may be ambiguous.` : 'No item correlates negatively with the rest of the test.',
      drop.length ? `Alpha would rise without ${drop.slice(0, 3).map((it) => `${nm(it)} (to ${f2(it.aid)})`).join(', ')}.` : 'Removing any single item would not raise alpha.',
      `Standard error of measurement: ${f2(c.sem)} points on a ${c.k}${c.dich ? '-item' : '-item'} total (mean ${f2(c.meanTotal)}, SD ${f2(c.sdTotal)}).`,
    ],
    confidence: conf,
    confidenceNote: `Rule: high with 200 or more respondents, medium with 50 or more, low otherwise. Here: ${c.n}.`,
    caveats: [
      'Difficulty and discrimination describe these items with this group; a more or less expert group gives different values (use the Rasch model for sample-independent difficulties).',
      'A low discrimination can mean a flawed item or a skill that is genuinely different from the rest; read the item before you drop it.',
    ],
    next: [
      neg.length ? `Check the key for ${nm(neg[0])} first.` : 'Rewrite or replace items with D below 0.20 (Ebel and Frisbie 1991).',
      'See [scale reliability](/calculators/reliability) for omega and the alpha interval.',
    ],
    report: `Item analysis of ${c.k} items (n = ${c.n}): ${coef} = ${f2(c.alpha)}, SEM = ${f2(c.sem)}; ${flagged.length} items flagged (difficulty outside .20–.90, corrected item-total r below .20, or alpha rising when deleted).`,
  };
}
// Rasch confidence rule: high with 100 or more non-extreme persons (difficulties stable to about ±0.5 logit at 95%,
// Linacre 1994, Rasch Measurement Transactions 7:4); medium with 30 or more (about ±1 logit); low otherwise.
export function raschSummary(r, names = []) {
  const conf = r.nonExtreme >= 100 ? 'high' : r.nonExtreme >= 30 ? 'medium' : 'low';
  const nm = (i) => names[r.keepItems[i]] || `item ${r.keepItems[i] + 1}`;
  const mis = r.itemFit.map((f, i) => ({ i, ...f })).filter((f) => f.infit > 1.5 || f.outfit > 1.5 || f.infit < 0.5 || f.outfit < 0.5);
  const noisy = mis.filter((f) => f.infit > 1.5 || f.outfit > 1.5);
  const hard = r.b.map((b, i) => [b, i]).sort((a, b) => b[0] - a[0]);
  const tg = r.targeting;
  return {
    headline: `Rasch (${r.method}) fit for ${r.L} items and ${r.N} people: ${noisy.length ? `${noisy.length} item${noisy.length === 1 ? '' : 's'} misfit (mean-square above 1.5)` : 'no item misfits badly'}; person reliability ${f2(r.relPerson)}.`,
    meaning: [
      `Hardest: ${nm(hard[0][1])} (${f2(hard[0][0])} logits); easiest: ${nm(hard[hard.length - 1][1])} (${f2(hard[hard.length - 1][0])}). Item difficulties are centred at 0.`,
      Math.abs(tg) < 0.5 ? `The test is well targeted: people average ${f2(r.meanTheta)} logits against items at 0.` : `People average ${f2(r.meanTheta)} logits, so the test is ${tg > 0 ? 'too easy' : 'too hard'} for them; add ${tg > 0 ? 'harder' : 'easier'} items to measure them precisely.`,
      noisy.length ? `Noisy items (unexpected answers): ${noisy.slice(0, 4).map((f) => `${nm(f.i)} (infit ${f2(f.infit)}, outfit ${f2(f.outfit)})`).join('; ')}.` : 'All items have mean-squares within 0.5–1.5, the range Linacre (2002) calls productive for measurement.',
      `Person separation ${f2(r.sepPerson)} (reliability ${f2(r.relPerson)}): the test separates about ${f2(Math.max(1, (4 * r.sepPerson + 1) / 3), 1)} statistically distinct levels of ability.`,
    ],
    confidence: conf,
    confidenceNote: `Rule: high with 100 or more people with non-extreme scores (difficulties stable to about ±0.5 logit), medium with 30 or more (about ±1 logit), low otherwise (Linacre 1994). Here: ${r.nonExtreme}.`,
    caveats: [
      'Fit statistics flag surprises, not causes: check the misfitting item\'s wording, key and whether it measures a different skill.',
      r.method === 'JML' ? 'JML difficulties are biased outward with few items; the (L − 1)/L correction removes most of it, but CML is the consistent choice.' : 'CML difficulties do not depend on the ability distribution; person measures for extreme scores are estimated with a 0.3-point adjustment.',
    ],
    next: [
      'Read the Wright map: gaps on the item side are ability levels the test cannot tell apart.',
      'Check whether items work the same for different groups with [differential item functioning](/methods/differential-item-functioning-dif-analysis).',
    ],
    report: `A dichotomous Rasch model (${r.method}${r.method === 'JML' ? ', (L − 1)/L corrected' : ''}) was fitted to ${r.L} items and ${r.N} respondents; person separation reliability = ${f2(r.relPerson)}, item reliability = ${f2(r.relItem)}; ${noisy.length} items had infit or outfit mean-squares above 1.5.`,
  };
}
