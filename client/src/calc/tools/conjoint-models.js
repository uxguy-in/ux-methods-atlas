// Conjoint studio, part 2: data (result codes, pasted long or wide tables), the models (per-respondent OLS,
// multinomial logit by Newton-Raphson, rank-ordered "exploded" logit, latent-class MNL by EM), importance,
// willingness to pay with delta-method intervals, the market simulator and the product-line optimiser.
import { rng, makeCoder, invSPD, chol, cholInv, dot, studyAttrs, studyDesign, fullFactorial, prohibited, numberIn, toCsv, cbcDesign, traditionalDesign, makeStudy, parseAttributes, parseProhibitions, linearEfficiency, levelBalance, isOrthogonal } from './conjoint-core.js';

// ── Datasets ──
// CBC: { kind: 'cbc', none, resp: [{ id, tasks: [{ alts: [profile…], y }] }] }, y the index of the chosen
//   alternative, or alts.length when "none" was chosen.
// Ratings or rankings: { kind: 'trad', mode: 'rate' | 'rank', resp: [{ id, cards: [{ lv: profile, y, hold }] }] },
//   y a rating (higher is better) or a rank (1 is best).
export function datasetFromResults(study, results) {
  const D = studyDesign(study); const mine = results.filter((r) => (!r.s || r.s === study.id) && (!r.dh || !study.dh || r.dh === study.dh));
  const seen = new Set(); const people = [];
  for (const r of mine) { const key = `${r.p}|${r.d}`; if (seen.has(key)) continue; seen.add(key); people.push(r); }
  if (study.k === 'cbc') {
    const resp = people.filter((r) => D.versions[r.ver]).map((r, i) => ({
      id: r.p || `R${i + 1}`,
      tasks: D.versions[r.ver].map((alts, t) => ({ alts, y: r.y[t] })).filter((t) => Number.isInteger(t.y) && t.y >= 0 && t.y <= (study.no ? t.alts.length : t.alts.length - 1)),
    })).filter((p) => p.tasks.length);
    return { kind: 'cbc', none: !!study.no, resp };
  }
  const all = [...D.cards.map((lv) => ({ lv, hold: false })), ...D.holdouts.map((lv) => ({ lv, hold: true }))];
  const resp = people.map((r, i) => ({ id: r.p || `R${i + 1}`, cards: all.map((c, j) => ({ ...c, y: r.y[j] })).filter((c) => Number.isFinite(c.y)) })).filter((p) => p.cards.length);
  return { kind: 'trad', mode: study.r === 'rank' ? 'rank' : 'rate', resp };
}

function splitTable(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { head: [], rows: [] };
  const d = lines[0].includes('\t') ? '\t' : lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  return { head: split(lines[0]), rows: lines.slice(1).map(split) };
}
const findCol = (head, names) => head.findIndex((h) => names.includes(h.trim().toLowerCase()));
function levelOf(attr, cell) {
  const c = String(cell ?? '').trim().toLowerCase(); if (!c) return -1;
  let i = attr.levels.findIndex((l) => l.toLowerCase() === c);
  if (i < 0 && Number.isFinite(Number(c))) i = attr.levels.findIndex((l) => numberIn(l) === Number(c));
  if (i < 0 && /^\d+$/.test(c) && Number(c) >= 1 && Number(c) <= attr.levels.length) i = Number(c) - 1;
  return i;
}
// CBC long format: one row per alternative with columns respondent, task, (alternative), one per attribute (level
// label, its number, or 1-based level index) and choice (1 chosen, 0 not). A "none" row has empty attribute cells or
// the word none.
export function parseCbcLong(text, attrs) {
  const { head, rows } = splitTable(text); const problems = [];
  const rc = findCol(head, ['respondent', 'resp', 'id', 'participant', 'person', 'respid']);
  const tc = findCol(head, ['task', 'set', 'question', 'choice set', 'choiceset', 'scenario']);
  const yc = findCol(head, ['choice', 'chosen', 'selected', 'y', 'choose']);
  const ac = attrs.map((a) => findCol(head, [a.name.toLowerCase()]));
  if (rc < 0 || tc < 0 || yc < 0) return { ds: null, problems: ['The header needs respondent, task and choice columns.'] };
  if (ac.some((c) => c < 0)) return { ds: null, problems: [`No column for ${attrs.filter((_, q) => ac[q] < 0).map((a) => a.name).join(', ')}. Column names must match the attribute names.`] };
  const byResp = new Map(); let none = false, badRows = 0;
  rows.forEach((r) => {
    const id = r[rc]; if (!id) { badRows++; return; }
    if (!byResp.has(id)) byResp.set(id, new Map());
    const tasks = byResp.get(id); const tk = r[tc];
    if (!tasks.has(tk)) tasks.set(tk, { alts: [], y: -1, none: false, chosenNone: false });
    const t = tasks.get(tk); const chosen = /^(1|yes|true|x)$/i.test(r[yc]);
    const cells = ac.map((c) => r[c]);
    if (cells.every((c) => !c || /^none\b/i.test(c))) { none = true; t.none = true; if (chosen) t.chosenNone = true; return; }
    const lv = cells.map((c, q) => levelOf(attrs[q], c));
    if (lv.some((v) => v < 0)) { badRows++; return; }
    if (chosen) t.y = t.alts.length;
    t.alts.push(lv);
  });
  const resp = [];
  for (const [id, tasks] of byResp) {
    const list = [];
    for (const t of tasks.values()) {
      if (t.alts.length < 1) continue;
      if (t.chosenNone) list.push({ alts: t.alts, y: t.alts.length }); else if (t.y >= 0) list.push({ alts: t.alts, y: t.y }); else badRows++;
    }
    if (list.length) resp.push({ id, tasks: list });
  }
  if (badRows) problems.push(`${badRows} row${badRows > 1 ? 's' : ''} or task${badRows > 1 ? 's' : ''} could not be read (unknown level, or no choice marked) and ${badRows > 1 ? 'were' : 'was'} left out.`);
  return { ds: resp.length ? { kind: 'cbc', none, resp } : null, problems };
}
// Ratings or rankings: long with attribute columns (respondent, attributes…, rating or rank, optional holdout 1/0),
// long by card number (respondent, card, value; cards numbered as in the design, holdouts after the cards), or wide
// (respondent, then one column per card in design order, holdouts last).
export function parseTrad(text, study, mode) {
  const attrs = studyAttrs(study), D = studyDesign(study); const { head, rows } = splitTable(text); const problems = [];
  const all = [...D.cards.map((lv) => ({ lv, hold: false })), ...D.holdouts.map((lv) => ({ lv, hold: true }))];
  const rc = Math.max(0, findCol(head, ['respondent', 'resp', 'id', 'participant', 'person', 'respid']));
  const vc = findCol(head, ['rating', 'rank', 'score', 'y', 'response', 'value', 'preference']);
  const ac = attrs.map((a) => findCol(head, [a.name.toLowerCase()]));
  const cc = findCol(head, ['card', 'profile', 'stimulus', 'card number']);
  const hc = findCol(head, ['holdout', 'hold']);
  const byResp = new Map(); let badRows = 0;
  const add = (id, card) => { if (!byResp.has(id)) byResp.set(id, []); byResp.get(id).push(card); };
  if (vc >= 0 && ac.every((c) => c >= 0)) {
    rows.forEach((r) => {
      const lv = ac.map((c, q) => levelOf(attrs[q], r[c])); const y = Number(r[vc]);
      if (lv.some((v) => v < 0) || !Number.isFinite(y) || !r[rc]) { badRows++; return; }
      const hold = hc >= 0 ? /^(1|yes|true)$/i.test(r[hc]) : D.holdouts.some((h) => h.join() === lv.join()) && !D.cards.some((c) => c.join() === lv.join());
      add(r[rc], { lv, y, hold });
    });
  } else if (vc >= 0 && cc >= 0) {
    rows.forEach((r) => { const k = Number(r[cc]) - 1, y = Number(r[vc]); if (!all[k] || !Number.isFinite(y) || !r[rc]) { badRows++; return; } add(r[rc], { ...all[k], y }); });
  } else {
    // Wide: if the first line is all numbers after the respondent column it is data, not a header.
    const startCol = rc + 1; const firstIsData = head.length > startCol && head.slice(startCol).every((h) => h !== '' && Number.isFinite(Number(h)));
    const data = firstIsData ? [head, ...rows] : rows;
    data.forEach((r) => { const id = r[rc]; const vals = r.slice(startCol).map(Number); if (!id || vals.length !== all.length || vals.some((v) => !Number.isFinite(v))) { badRows++; return; } vals.forEach((y, j) => add(id, { ...all[j], y })); });
  }
  const resp = [...byResp].map(([id, cards]) => ({ id, cards }));
  if (badRows) problems.push(`${badRows} row${badRows > 1 ? 's' : ''} could not be read and ${badRows > 1 ? 'were' : 'was'} left out. Wide data needs one value for each of the ${all.length} cards (${D.cards.length} cards and ${D.holdouts.length} holdouts, in design order).`);
  return { ds: resp.length ? { kind: 'trad', mode, resp } : null, problems };
}
export function longCsv(ds, attrs) {
  if (ds.kind === 'cbc') {
    const rows = [['respondent', 'task', 'alternative', ...attrs.map((a) => a.name), 'choice']];
    ds.resp.forEach((p) => p.tasks.forEach((t, ti) => {
      t.alts.forEach((lv, j) => rows.push([p.id, ti + 1, j + 1, ...lv.map((l, q) => attrs[q].levels[l]), t.y === j ? 1 : 0]));
      if (ds.none) rows.push([p.id, ti + 1, t.alts.length + 1, ...attrs.map(() => 'none'), t.y === t.alts.length ? 1 : 0]);
    }));
    return toCsv(rows);
  }
  const rows = [['respondent', ...attrs.map((a) => a.name), ds.mode === 'rank' ? 'rank' : 'rating', 'holdout']];
  ds.resp.forEach((p) => p.cards.forEach((c) => rows.push([p.id, ...c.lv.map((l, q) => attrs[q].levels[l]), c.y, c.hold ? 1 : 0])));
  return toCsv(rows);
}

// ── Choice sets in flat arrays ──
// X: one row of K coded values per alternative; start[s]..start[s+1] the alternatives of set s; y[s] the absolute
// row of the chosen one; resp[s] the respondent; respStart[i]..respStart[i+1] respondent i's sets.
export function buildSets(ds, coder) {
  const K = coder.K; const rows = []; const start = [0], y = [], resp = [], respStart = [0];
  ds.resp.forEach((p, i) => {
    for (const t of p.tasks) {
      const s0 = rows.length;
      t.alts.forEach((lv) => rows.push(coder.encode(lv)));
      if (ds.none) rows.push(coder.encode(null));
      y.push(s0 + t.y); resp.push(i); start.push(rows.length);
    }
    respStart.push(y.length);
  });
  const X = new Float64Array(rows.length * K); rows.forEach((r, j) => X.set(r, j * K));
  return { X, K, start: Int32Array.from(start), y: Int32Array.from(y), resp: Int32Array.from(resp), respStart: Int32Array.from(respStart), nSets: y.length, nResp: ds.resp.length };
}
// Rank-ordered (exploded) logit, Beggs, Cardell and Hausman (1981): a ranking of C cards is C − 1 choices: the
// first-ranked from all C, the second from the remaining C − 1, and so on. Tied ranks end the explosion there.
export function rolSets(ds, coder) {
  const exploded = { kind: 'cbc', none: false, resp: ds.resp.map((p) => {
    const est = p.cards.filter((c) => !c.hold).slice().sort((a, b) => a.y - b.y); const tasks = [];
    for (let k = 0; k < est.length - 1; k++) {
      if (k + 1 < est.length && est[k].y === est[k + 1].y) break;
      tasks.push({ alts: est.slice(k).map((c) => c.lv), y: 0 });
    }
    return { id: p.id, tasks };
  }) };
  return buildSets(exploded, coder);
}

// ── Multinomial logit ──
// Log-likelihood ℓ(β) = Σ_s w_s [x_{s,y}ᵀβ − log Σ_j exp(x_{s,j}ᵀβ)], gradient Σ w (x_y − Σ p_j x_j), Hessian
// −Σ w Σ_j p_j (x_j − x̄)(x_j − x̄)ᵀ. Computed set by set with the largest utility subtracted before exp.
let scratchP = new Float64Array(64), scratchXb = new Float64Array(64);
// Log-likelihood only, for sets from..to, with no allocation (the inner loop of the HB sampler).
export function mnlLL(S, beta, from, to) {
  const X = S.X, K = S.K, start = S.start, y = S.y; let ll = 0;
  for (let s = from; s < to; s++) {
    const a = start[s], b = start[s + 1]; let mx = -Infinity, uy = 0;
    if (scratchP.length < b - a) scratchP = new Float64Array(2 * (b - a));
    for (let j = a; j < b; j++) { let u = 0; const o = j * K; for (let k = 0; k < K; k++) u += X[o + k] * beta[k]; scratchP[j - a] = u; if (u > mx) mx = u; if (j === y[s]) uy = u; }
    let sum = 0; for (let j = 0; j < b - a; j++) sum += Math.exp(scratchP[j] - mx);
    ll += uy - mx - Math.log(sum);
  }
  return ll;
}
export function mnlEval(S, beta, { w = null, from = 0, to = S.nSets, grad = null, hess = null, setLL = null } = {}) {
  const { X, K, start, y } = S; let ll = 0;
  if (scratchXb.length < K) scratchXb = new Float64Array(2 * K);
  const xb = scratchXb;
  for (let s = from; s < to; s++) {
    const a = start[s], b = start[s + 1], ws = w ? w[s] : 1; if (ws === 0) { if (setLL) setLL[s] = 0; continue; }
    if (scratchP.length < b - a) scratchP = new Float64Array(2 * (b - a));
    const p = scratchP; let mx = -Infinity;
    for (let j = a; j < b; j++) { let u = 0; for (let k = 0; k < K; k++) u += X[j * K + k] * beta[k]; p[j - a] = u; if (u > mx) mx = u; }
    let sum = 0; for (let j = a; j < b; j++) { p[j - a] = Math.exp(p[j - a] - mx); sum += p[j - a]; }
    const lls = Math.log(p[y[s] - a] / sum); ll += ws * lls; if (setLL) setLL[s] = lls;
    if (grad || hess) {
      for (let k = 0; k < K; k++) xb[k] = 0;
      for (let j = a; j < b; j++) { p[j - a] /= sum; for (let k = 0; k < K; k++) xb[k] += p[j - a] * X[j * K + k]; }
      if (grad) for (let k = 0; k < K; k++) grad[k] += ws * (X[y[s] * K + k] - xb[k]);
      if (hess) for (let j = a; j < b; j++) { const pj = ws * p[j - a]; for (let k = 0; k < K; k++) { const dk = X[j * K + k] - xb[k]; for (let l = 0; l <= k; l++) hess[k * K + l] += pj * dk * (X[j * K + l] - xb[l]); } }
    }
  }
  if (hess) for (let k = 0; k < K; k++) for (let l = 0; l < k; l++) hess[l * K + k] = hess[k * K + l];
  return ll;
}
// Newton-Raphson with step halving; hess here is the information (minus the Hessian). Standard errors are the
// square roots of the diagonal of its inverse at the maximum.
export function fitMNL(S, { w = null, init = null, maxIter = 100, tol = 1e-10, ridge = 0, from, to, cov: wantCov = true } = {}) {
  const K = S.K; let beta = init ? Float64Array.from(init) : new Float64Array(K);
  const pen = (b) => { let s = 0; for (let k = 0; k < K; k++) s += b[k] * b[k]; return 0.5 * ridge * s; };
  let ll = mnlEval(S, beta, { w, from, to }) - pen(beta); let iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    const g = new Float64Array(K), H = new Float64Array(K * K);
    mnlEval(S, beta, { w, from, to, grad: g, hess: H });
    for (let k = 0; k < K; k++) { g[k] -= ridge * beta[k]; H[k * K + k] += ridge; }
    let L = chol(H, K); if (!L) { for (let k = 0; k < K; k++) H[k * K + k] += 1e-6; L = chol(H, K); if (!L) break; }
    const step = cholInv(L, K); const d = new Float64Array(K);
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) d[i] += step[i * K + j] * g[j];
    let t = 1, next, nll;
    for (let h = 0; h < 30; h++) { next = beta.map((b, k) => b + t * d[k]); nll = mnlEval(S, next, { w, from, to }) - pen(next); if (nll >= ll - 1e-12) break; t /= 2; }
    const change = nll - ll; beta = next; ll = nll;
    if (Math.max(...d.map(Math.abs)) * t < 1e-8 || Math.abs(change) < tol) { converged = true; iter++; break; }
  }
  if (!wantCov) return { beta: Array.from(beta), ll: ll + pen(beta), iter, converged };
  const H = new Float64Array(K * K); mnlEval(S, beta, { w, from, to, hess: H });
  for (let k = 0; k < K; k++) H[k * K + k] += ridge;
  const cov = invSPD(H, K);
  return { beta: Array.from(beta), ll: ll + pen(beta), cov, se: cov ? Array.from({ length: K }, (_, i) => Math.sqrt(cov[i * K + i])) : null, iter, converged, info: H };
}
// Fit statistics: null log-likelihood (every alternative equally likely), McFadden ρ² = 1 − ℓ/ℓ₀, hit rate (the
// highest-utility alternative was chosen), root likelihood RLH = exp(ℓ / number of choices), and the share of
// choices of "none", observed and predicted.
export function mnlStats(S, beta, noneIdx = -1) {
  const { X, K, start, y } = S; let ll = 0, ll0 = 0, hits = 0, nonePred = 0, noneObs = 0;
  for (let s = 0; s < S.nSets; s++) {
    const a = start[s], b = start[s + 1]; const u = [];
    for (let j = a; j < b; j++) { let v = 0; for (let k = 0; k < K; k++) v += X[j * K + k] * beta[k]; u.push(v); }
    const mx = Math.max(...u); const e = u.map((v) => Math.exp(v - mx)); const sum = e.reduce((p, q) => p + q, 0);
    ll += Math.log(e[y[s] - a] / sum); ll0 += Math.log(1 / (b - a));
    if (u.indexOf(mx) === y[s] - a) hits++;
    if (noneIdx >= 0) { const nj = b - 1 - a; nonePred += e[nj] / sum; if (y[s] === b - 1) noneObs++; }
  }
  return { ll, ll0, rho2: 1 - ll / ll0, hit: hits / S.nSets, rlh: Math.exp(ll / S.nSets), nSets: S.nSets, noneObs: noneIdx >= 0 ? noneObs / S.nSets : NaN, nonePred: noneIdx >= 0 ? nonePred / S.nSets : NaN, chance: S.nSets / (S.start[S.nSets] - S.start[0]) };
}
// Per-respondent RLH at given betas (one row of K per respondent).
export function respondentRLH(S, betas) {
  const out = []; const setLL = new Float64Array(S.nSets);
  for (let i = 0; i < S.nResp; i++) {
    const a = S.respStart[i], b = S.respStart[i + 1];
    const ll = mnlEval(S, betas[i], { from: a, to: b, setLL }); out.push(Math.exp(ll / Math.max(1, b - a)));
  }
  return out;
}

// ── Ratings: ordinary least squares for each respondent ──
// y = b₀ + Xβ + e on the estimation cards, β = (XᵀX)⁻¹Xᵀy with the same effects coding. R² = 1 − SSE/SST.
// For rankings the dependent variable is the reversed rank (C + 1 − rank among the estimation cards).
export function olsFit(X, yv) {
  const n = X.length, p = X[0].length; const M = new Float64Array(p * p), v = new Float64Array(p);
  for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { v[a] += X[i][a] * yv[i]; for (let b = 0; b < p; b++) M[a * p + b] += X[i][a] * X[i][b]; }
  const inv = invSPD(M, p); if (!inv) return null;
  const beta = Array.from({ length: p }, (_, a) => { let s = 0; for (let b = 0; b < p; b++) s += inv[a * p + b] * v[b]; return s; });
  const fit = X.map((x) => dot(x, beta)); const my = yv.reduce((s, x) => s + x, 0) / n;
  const sse = yv.reduce((s, y, i) => s + (y - fit[i]) ** 2, 0), sst = yv.reduce((s, y) => s + (y - my) ** 2, 0);
  const df = n - p; const s2 = df > 0 ? sse / df : NaN;
  return { beta, r2: sst > 0 ? 1 - sse / sst : NaN, adjR2: sst > 0 && df > 0 ? 1 - (sse / df) / (sst / (n - 1)) : NaN, df, se: beta.map((_, a) => Math.sqrt(s2 * inv[a * p + a])), sse };
}
const reRank = (cards) => { const sorted = cards.map((c, i) => [c.y, i]).sort((a, b) => a[0] - b[0]); const r = Array(cards.length); let i = 0; while (i < sorted.length) { let j = i; while (j + 1 < sorted.length && sorted[j + 1][0] === sorted[i][0]) j++; for (let k = i; k <= j; k++) r[sorted[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
export function fitTraditional(ds, coder) {
  const people = ds.resp.map((p) => {
    const est = p.cards.filter((c) => !c.hold), hold = p.cards.filter((c) => c.hold);
    const yv = ds.mode === 'rank' ? reRank(est).map((r) => est.length + 1 - r) : est.map((c) => c.y);
    const X = est.map((c) => [1, ...coder.encode(c.lv)]);
    const f = est.length > coder.K + 1 ? olsFit(X, yv) : null;
    if (!f) return { id: p.id, ok: false };
    const beta = f.beta.slice(1);
    let hit = NaN, holdR = NaN;
    if (hold.length >= 2) {
      const pred = hold.map((c) => dot(coder.encode(c.lv), beta));
      const actual = hold.map((c) => (ds.mode === 'rank' ? -c.y : c.y)); const best = Math.max(...actual);
      hit = actual[pred.indexOf(Math.max(...pred))] === best ? 1 : 0;
      holdR = pearson(pred, actual);
    }
    return { id: p.id, ok: true, beta, intercept: f.beta[0], r2: f.r2, adjR2: f.adjR2, df: f.df, hit, holdR, nHold: hold.length };
  });
  const ok = people.filter((p) => p.ok);
  const K = coder.K; const mean = Array(K).fill(0);
  ok.forEach((p) => p.beta.forEach((b, k) => { mean[k] += b / ok.length; }));
  // Covariance of the mean part-worths across respondents, S / n, used for delta-method WTP intervals.
  const cov = new Float64Array(K * K);
  if (ok.length > 1) ok.forEach((p) => { for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) cov[a * K + b] += ((p.beta[a] - mean[a]) * (p.beta[b] - mean[b])) / ((ok.length - 1) * ok.length); });
  const hits = ok.filter((p) => Number.isFinite(p.hit));
  const nHold = hits.length ? hits[0].nHold : 0;
  return { people, ok, mean, cov, meanR2: avg(ok.map((p) => p.r2)), hitRate: hits.length ? avg(hits.map((p) => p.hit)) : NaN, chance: nHold ? 1 / nHold : NaN, holdR: avg(ok.map((p) => p.holdR).filter(Number.isFinite)) };
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function pearson(a, b) {
  const n = a.length; const ma = avg(a), mb = avg(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

// ── Latent-class MNL (Kamakura and Russell 1989), by expectation-maximisation ──
// Each respondent belongs to class c with probability π_c; within a class everyone shares β_c. E-step:
// τ_ic = π_c L_i(β_c) / Σ_d π_d L_i(β_d), with L_i the product of i's choice probabilities (log scale). M-step:
// π_c = mean τ_ic, β_c by Newton steps on the τ-weighted MNL log-likelihood. Stops when the log-likelihood
// changes by less than 10⁻⁷ (2,000 iterations at most). Six random starts (respondents split at random into
// k groups, one MNL per group), 20 EM iterations each; the best two continue to convergence.
// BIC = −2ℓ + P ln n with P = kK + (k − 1) and n respondents; entropy R² = 1 − Σ −τ ln τ / (n ln k).
function respLL(S, beta, out) {
  const setLL = new Float64Array(S.nSets); mnlEval(S, beta, { setLL });
  for (let i = 0; i < S.nResp; i++) { let s = 0; for (let t = S.respStart[i]; t < S.respStart[i + 1]; t++) s += setLL[t]; out[i] = s; }
  return out;
}
function eStep(S, betas, pi, k, tau) {
  const n = S.nResp; const L = betas.map((b) => respLL(S, b, new Float64Array(n))); let ll = 0;
  for (let i = 0; i < n; i++) {
    let mx = -Infinity; for (let c = 0; c < k; c++) mx = Math.max(mx, Math.log(pi[c]) + L[c][i]);
    let sum = 0; for (let c = 0; c < k; c++) { tau[i * k + c] = Math.exp(Math.log(pi[c]) + L[c][i] - mx); sum += tau[i * k + c]; }
    for (let c = 0; c < k; c++) tau[i * k + c] /= sum;
    ll += mx + Math.log(sum);
  }
  return ll;
}
function emRun(S, k, betas, pi, iters, tol) {
  const n = S.nResp; const tau = new Float64Array(n * k); let ll = eStep(S, betas, pi, k, tau), it = 0;
  for (; it < iters; it++) {
    for (let c = 0; c < k; c++) {
      const w = new Float64Array(S.nSets); let tot = 0;
      for (let s = 0; s < S.nSets; s++) w[s] = tau[S.resp[s] * k + c];
      for (let i = 0; i < n; i++) tot += tau[i * k + c];
      pi[c] = Math.max(tot / n, 1e-10);
      betas[c] = fitMNL(S, { w, init: betas[c], maxIter: 1, ridge: 1e-6, cov: false }).beta;
    }
    const nll = eStep(S, betas, pi, k, tau);
    const d = nll - ll; ll = nll;
    if (Math.abs(d) < tol) { it++; break; }
  }
  return { betas, pi, ll, tau, iter: it };
}
export function fitLatentClass(S, k, { seed = 1, starts = 6, aggregate = null } = {}) {
  const r = rng(seed * 7919 + k); const K = S.K; const n = S.nResp;
  if (k === 1) {
    const f = aggregate || fitMNL(S);
    return lcStats(S, { betas: [f.beta], pi: [1], ll: f.ll, tau: new Float64Array(n).fill(1), iter: f.iter }, 1);
  }
  const runs = [];
  for (let st = 0; st < starts; st++) {
    const grp = Array.from({ length: n }, () => r.int(k)); const betas = [];
    for (let c = 0; c < k; c++) {
      const w = new Float64Array(S.nSets); for (let s = 0; s < S.nSets; s++) w[s] = grp[S.resp[s]] === c ? 1 : 0;
      betas.push(fitMNL(S, { w, maxIter: 6, ridge: 0.05, cov: false }).beta);
    }
    runs.push(emRun(S, k, betas, Array(k).fill(1 / k), 20, 1e-7));
  }
  runs.sort((a, b) => b.ll - a.ll);
  const finals = runs.slice(0, 2).map((x) => emRun(S, k, x.betas, x.pi, 2000, 1e-7)).sort((a, b) => b.ll - a.ll);
  return lcStats(S, finals[0], k);
}
function lcStats(S, run, k) {
  const n = S.nResp, K = S.K;
  // Sort classes by size so labels are stable.
  const order = run.pi.map((p, c) => [p, c]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const betas = order.map((c) => run.betas[c]), pi = order.map((c) => run.pi[c]);
  const tau = new Float64Array(n * k); for (let i = 0; i < n; i++) order.forEach((c, j) => { tau[i * k + j] = k === 1 ? 1 : run.tau[i * k + c]; });
  const P = k * K + (k - 1);
  let ent = 0; for (let i = 0; i < n * k; i++) if (tau[i] > 0) ent -= tau[i] * Math.log(tau[i]);
  const cls = Array.from({ length: n }, (_, i) => { let b = 0; for (let c = 1; c < k; c++) if (tau[i * k + c] > tau[i * k + b]) b = c; return b; });
  return { k, betas, pi, ll: run.ll, P, bic: -2 * run.ll + P * Math.log(n), aic: -2 * run.ll + 2 * P, caic: -2 * run.ll + P * (Math.log(n) + 1), entropyR2: k > 1 ? 1 - ent / (n * Math.log(k)) : 1, tau: Array.from(tau), cls, iter: run.iter };
}
export function latentClassSweep(S, { kMax = 5, seed = 1, aggregate = null, onProgress } = {}) {
  const fits = [];
  for (let k = 1; k <= kMax; k++) { fits.push(fitLatentClass(S, k, { seed, aggregate })); onProgress?.(k / kMax); }
  const best = fits.reduce((a, b) => (b.bic < a.bic ? b : a));
  return { fits, best: best.k };
}

// ── Importance and willingness to pay ──
// Importance of an attribute = its range of part-worths ÷ the sum of ranges over attributes (× 100). With individual
// part-worths it is computed per person and then averaged. A linear price term's range is |β| × (max − min price).
export function importance(pw) { const r = pw.map((a) => Math.max(...a) - Math.min(...a)); const t = r.reduce((s, x) => s + x, 0); return r.map((x) => (t > 0 ? x / t : 0)); }
export function meanImportance(pwList, weights = null) {
  const K = pwList[0].length; const out = Array(K).fill(0); let tot = 0;
  pwList.forEach((pw, i) => { const w = weights ? weights[i] : 1; importance(pw).forEach((v, q) => { out[q] += w * v; }); tot += w; });
  return out.map((v) => v / tot);
}
// WTP for level l of attribute a, against the attribute's first level: (pw_l − pw_1) ÷ (−β_price), in money.
// The delta method: g = c'β, w = −g/β_p, ∇w = −c/β_p + (g/β_p²) e_p, Var(w) = ∇ᵀ Σ ∇. Interval w ± 1.96 SE.
export function wtpDelta(coder, beta, cov, z = 1.959963984540054) {
  const pb = coder.blocks[coder.price]; if (!pb) return null;
  const K = coder.K, bp = beta[pb.start];
  return coder.attrs.map((a, q) => {
    if (q === coder.price) return null;
    return a.levels.map((_, l) => {
      if (l === 0) return { w: 0, se: 0, lo: 0, hi: 0 };
      const c = coder.pwRows[q][l].map((v, i) => v - coder.pwRows[q][0][i]);
      const g = dot(c, beta); const w = -g / bp;
      const grad = c.map((v) => -v / bp); grad[pb.start] += g / (bp * bp);
      let v = 0; if (cov) for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) v += grad[i] * cov[i * K + j] * grad[j];
      const se = cov ? Math.sqrt(v) : NaN;
      return { w, se, lo: w - z * se, hi: w + z * se };
    });
  });
}
// WTP from posterior draws of the population mean: the ratio per draw, then the 2.5% and 97.5% quantiles.
export function wtpDraws(coder, draws) {
  const pb = coder.blocks[coder.price]; if (!pb || !draws.length) return null;
  return coder.attrs.map((a, q) => {
    if (q === coder.price) return null;
    return a.levels.map((_, l) => {
      if (l === 0) return { w: 0, lo: 0, hi: 0 };
      const c = coder.pwRows[q][l].map((v, i) => v - coder.pwRows[q][0][i]);
      const ws = draws.map((b) => -dot(c, b) / b[pb.start]).sort((x, y) => x - y);
      return { w: quantile(ws, 0.5), mean: avg(ws), lo: quantile(ws, 0.025), hi: quantile(ws, 0.975) };
    });
  });
}
export function quantile(sorted, p) { if (!sorted.length) return NaN; const h = (sorted.length - 1) * p; const lo = Math.floor(h); return sorted[lo] + (h - lo) * ((sorted[Math.min(lo + 1, sorted.length - 1)]) - sorted[lo]); }

// ── Market simulator ──
// A model for simulation is a list of units { beta, w }: one per respondent (OLS or HB), one per class weighted by
// its size (latent class), or one (aggregate MNL). A product is { lv: levels, price: optional money value }.
//   Share of preference (logit): s_j = Σ_i w_i exp(U_ij) / Σ_k exp(U_ik), averaged over units.
//   First choice: each unit picks its highest-utility product.
//   Randomised first choice (Huber, Orme and Miller 1999): for each of D draws, add an attribute-level error
//   N(0, σ_a²) shared by products with that level and a product error Gumbel(0, 1), then take the first choice.
export function productUtility(coder, beta, prod) {
  if (!prod) return coder.none ? beta[coder.noneCol] : -Infinity;
  const lv = [...prod.lv]; if (Number.isFinite(prod.price)) lv.priceValue = prod.price;
  return dot(coder.encode(lv), beta);
}
export function simulateShares(coder, units, products, { method = 'logit', none = coder.none, draws = 200, attrSd = 0.3, seed = 11, scale = 1 } = {}) {
  const J = products.length + (none ? 1 : 0); const share = Array(J).fill(0); let W = 0;
  const r = rng(seed);
  for (const u of units) {
    const U = products.map((p) => productUtility(coder, u.beta, p) * scale); if (none) U.push(u.beta[coder.noneCol] * scale);
    if (method === 'logit') { const mx = Math.max(...U); const e = U.map((v) => Math.exp(v - mx)); const s = e.reduce((a, b) => a + b, 0); e.forEach((v, j) => { share[j] += (u.w * v) / s; }); }
    else if (method === 'first') { const mx = Math.max(...U); const winners = U.map((v, j) => (v === mx ? j : -1)).filter((j) => j >= 0); winners.forEach((j) => { share[j] += u.w / winners.length; }); }
    else {
      for (let d = 0; d < draws; d++) {
        const err = new Map(); const Ud = U.map((v, j) => {
          let e = r.gumbel();
          if (j < products.length) products[j].lv.forEach((l, q) => { const key = `${q}.${l}`; if (!err.has(key)) err.set(key, r.normal() * attrSd); e += err.get(key); });
          return v + e;
        });
        let b = 0; for (let j = 1; j < J; j++) if (Ud[j] > Ud[b]) b = j; share[b] += u.w / draws;
      }
    }
    W += u.w;
  }
  return share.map((s) => s / W);
}
// Share against price for one product, with every other product held fixed.
export function priceCurve(coder, units, products, focal, { steps = 15, ...opts } = {}) {
  const pb = coder.blocks[coder.price]; if (!pb) return null;
  const lo = Math.min(...pb.values), hi = Math.max(...pb.values); const pts = [];
  for (let s = 0; s <= steps; s++) {
    const price = lo + ((hi - lo) * s) / steps;
    const prods = products.map((p, j) => (j === focal ? { ...p, price } : p));
    pts.push({ price, shares: simulateShares(coder, units, prods, opts) });
  }
  return pts;
}
// Product or product-line optimiser: choose the levels of the products in `own` (each from the allowed profiles,
// prices at the design's levels) to maximise their total share, or revenue = Σ share × price. Exhaustive search
// when there are at most `maxExhaustive` combinations; otherwise a genetic algorithm (Balakrishnan and Jacob 1996):
// population 60, tournament selection of 3, uniform crossover, mutation 1/(genes), 2 elite, 80 generations.
export function optimise(coder, units, products, own, { objective = 'share', method = 'logit', prohib = [], maxExhaustive = 20000, seed = 5, pop = 60, gens = 80 } = {}) {
  const L = coder.attrs.map((a) => a.levels.length); const allowed = fullFactorial(L, prohib);
  const pb = coder.blocks[coder.price];
  const fit = (genome) => {
    const prods = products.map((p, j) => { const g = own.indexOf(j); return g < 0 ? p : { lv: genome[g], price: pb ? pb.values[genome[g][coder.price]] : undefined }; });
    const sh = simulateShares(coder, units, prods, { method, seed: 17, draws: 60 });
    return own.reduce((s, j) => s + sh[j] * (objective === 'revenue' && pb ? prods[j].price : 1), 0);
  };
  const space = allowed.length ** own.length; let evals = 0;
  if (space <= maxExhaustive) {
    let best = null, bestF = -Infinity; const idx = Array(own.length).fill(0);
    for (let n = 0; n < space; n++) {
      let x = n; for (let g = 0; g < own.length; g++) { idx[g] = x % allowed.length; x = Math.floor(x / allowed.length); }
      const genome = idx.map((i) => allowed[i]); const f = fit(genome); evals++;
      if (f > bestF + 1e-12) { bestF = f; best = genome; }
    }
    return { genome: best, value: bestF, method: 'exhaustive', evals, space };
  }
  const r = rng(seed); const genes = own.length * L.length; const mut = 1 / genes;
  const randomG = () => own.map(() => allowed[r.int(allowed.length)].slice());
  const repair = (g) => g.map((p) => (prohibited(p, prohib) ? allowed[r.int(allowed.length)].slice() : p));
  let P = Array.from({ length: pop }, randomG).map((g) => ({ g, f: fit(g) })); evals += pop;
  for (let gen = 0; gen < gens; gen++) {
    P.sort((a, b) => b.f - a.f); const next = P.slice(0, 2);
    const pick = () => { let b = P[r.int(pop)]; for (let t = 1; t < 3; t++) { const c = P[r.int(pop)]; if (c.f > b.f) b = c; } return b.g; };
    while (next.length < pop) {
      const a = pick(), b = pick();
      const child = repair(a.map((p, i) => p.map((v, q) => { let x = r() < 0.5 ? v : b[i][q]; if (r() < mut) x = r.int(L[q]); return x; })));
      next.push({ g: child, f: fit(child) }); evals++;
    }
    P = next;
  }
  P.sort((a, b) => b.f - a.f);
  return { genome: P[0].g, value: P[0].f, method: 'genetic algorithm', evals, space };
}

// ── Example data ──
export const EXAMPLE_CBC_ATTRS = [
  { name: 'Price', levels: ['£4', '£7', '£10', '£13'] },
  { name: 'Storage', levels: ['5 GB', '50 GB', 'Unlimited'] },
  { name: 'Offline access', levels: ['No', 'Yes'] },
  { name: 'AI summaries', levels: ['None', 'Basic', 'Advanced'] },
  { name: 'Support', levels: ['Email', 'Live chat', 'Phone'] },
];
// Two segments in part-worth terms (zero-centred within each attribute; price in utility per £; none constant):
// 60% value seekers, 40% power users; each person adds N(0, 0.4²) to every coded parameter.
export const EXAMPLE_CBC_SEGMENTS = [
  { share: 0.6, price: -0.42, pw: [null, [-0.6, 0.1, 0.5], [-0.4, 0.4], [-0.3, 0.1, 0.2], [-0.2, 0.0, 0.2]], none: 0.4 },
  { share: 0.4, price: -0.15, pw: [null, [-1.0, 0.2, 0.8], [-0.8, 0.8], [-1.0, 0.2, 0.8], [-0.3, 0.0, 0.3]], none: -0.6 },
];
export function segmentBeta(coder, seg) {
  const b = new Float64Array(coder.K);
  coder.blocks.forEach((bl) => { if (bl.linear) b[bl.start] = seg.price; else for (let j = 0; j < bl.size; j++) b[bl.start + j] = seg.pw[bl.q][j]; });
  if (coder.none) b[coder.noneCol] = seg.none;
  return Array.from(b);
}
export function simulateCbc({ design, coder, n = 200, seed = 2024, segments = EXAMPLE_CBC_SEGMENTS, sd = 0.4, none = true }) {
  const r = rng(seed); const truth = []; const resp = [];
  for (let i = 0; i < n; i++) {
    const seg = r() < segments[0].share ? 0 : 1;
    const beta = segmentBeta(coder, segments[seg]).map((b) => b + sd * r.normal());
    const ver = i % design.versions.length;
    const y = design.versions[ver].map((alts) => {
      const U = alts.map((lv) => dot(coder.encode(lv), beta) + r.gumbel());
      if (none) U.push(beta[coder.noneCol] + r.gumbel());
      return U.indexOf(Math.max(...U));
    });
    truth.push({ beta, seg }); resp.push({ ver, y, id: `R${String(i + 1).padStart(3, '0')}` });
  }
  return { truth, resp };
}
export const EXAMPLE_TRAD_ATTRS = [
  { name: 'Monthly price', levels: ['£8', '£12', '£16'] },
  { name: 'Bikes', levels: ['Classic', 'E-bike', 'Mixed fleet'] },
  { name: 'Parking', levels: ['Docks only', 'Dockless'] },
  { name: 'Ride time included', levels: ['30 min', '45 min', '60 min'] },
];
export function simulateTrad({ cards, holdouts, coder, n = 40, seed = 77, mode = 'rate' }) {
  const r = rng(seed); const base = { price: -0.32, pw: [null, [-0.7, 0.6, 0.1], [-0.35, 0.35], [-0.5, 0.1, 0.4]] };
  const all = [...cards.map((lv) => ({ lv, hold: false })), ...holdouts.map((lv) => ({ lv, hold: true }))];
  const resp = [];
  for (let i = 0; i < n; i++) {
    const b0 = new Float64Array(coder.K);
    coder.blocks.forEach((bl) => { if (bl.linear) b0[bl.start] = base.price * (0.5 + r()); else for (let j = 0; j < bl.size; j++) b0[bl.start + j] = base.pw[bl.q][j] * (0.4 + 1.2 * r()) + 0.15 * r.normal(); });
    const u = all.map((c) => dot(coder.encode(c.lv), b0) + 0.35 * r.normal());
    let y;
    if (mode === 'rank') { const order = u.map((v, j) => [v, j]).sort((a, b) => b[0] - a[0]); y = Array(u.length); order.forEach(([, j], k) => { y[j] = k + 1; }); }
    else y = u.map((v) => Math.max(0, Math.min(10, Math.round(5 + 2.2 * v))));
    resp.push({ id: `P${String(i + 1).padStart(2, '0')}`, y });
  }
  return resp;
}

// ── Study from the builder's draft ──
// The draft holds the inputs; the design is generated from them with a fixed seed, so the same draft always gives
// the same design (the examples below rely on this).
export function studyFromDraft(d) {
  if (d.fixed && d.fixed.t === 'cj') {
    const study = d.fixed; const attrs = studyAttrs(study); const L = attrs.map((a) => a.levels.length); const D = studyDesign(study);
    const design = study.k === 'cbc' ? D : { ...D, method: 'Opened from a study link', eff: linearEfficiency(D.cards, L), balance: levelBalance(D.cards, L), orthogonal: isOrthogonal(D.cards) };
    return { study, design, attrs, L, price: study.p, bad: [], prohibBad: [] };
  }
  const { attrs, bad } = parseAttributes(d.attrsText);
  if (attrs.length < 2) return { error: 'Enter at least two attributes, each with two or more levels, as "Name: level, level".', bad };
  const price = d.price >= 0 && d.price < attrs.length && attrs[d.price].levels.every((l) => Number.isFinite(numberIn(l))) ? Number(d.price) : -1;
  const pr = parseProhibitions(d.prohibText, attrs);
  const L = attrs.map((a) => a.levels.length);
  const seed = Number(d.seed) || 1;
  let design;
  if (d.kind === 'cbc') {
    const T = clampInt(d.T, 2, 30, 12), J = clampInt(d.J, 2, 5, 3), V = clampInt(d.V, 1, 50, 20);
    design = cbcDesign(L, { T, J, V, method: d.method || 'balanced', prohib: pr.list, seed });
  } else {
    design = traditionalDesign(L, { minCards: d.minCards ? clampInt(d.minCards, 2, 60, 0) : undefined, holdouts: clampInt(d.holdouts, 0, 6, 2), prohib: pr.list, seed });
  }
  if (!design) return { error: 'No design fits these settings: too many prohibitions for the levels, or fewer allowed profiles than alternatives per task.', bad, prohibBad: pr.bad };
  const study = makeStudy({ id: d.id, name: d.name, kind: d.kind, attrs, price, prohib: pr.list, design, resp: d.resp || 'rate', scale: [0, 10], none: !!d.none });
  return { study, design, attrs, L, price, bad, prohibBad: pr.bad };
}
const clampInt = (v, lo, hi, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo ? Math.min(hi, n) : def; };

export const EXAMPLE_CBC_DRAFT = { id: 'example-cbc', name: 'Team notes app: which plan?', kind: 'cbc', attrsText: 'Price: £4, £7, £10, £13\nStorage: 5 GB, 50 GB, Unlimited\nOffline access: No, Yes\nAI summaries: None, Basic, Advanced\nSupport: Email, Live chat, Phone', price: 0, prohibText: '', seed: 7, T: 12, J: 3, V: 20, method: 'balanced', none: true, nPlan: 200, resp: 'rate', minCards: '', holdouts: 2 };
export const EXAMPLE_TRAD_DRAFT = { id: 'example-rate', name: 'Bike-share membership', kind: 'trad', attrsText: 'Monthly price: £8, £12, £16\nBikes: Classic, E-bike, Mixed fleet\nParking: Docks only, Dockless\nRide time included: 30 min, 45 min, 60 min', price: 0, prohibText: '', seed: 3, T: 12, J: 3, V: 20, method: 'balanced', none: true, nPlan: 40, resp: 'rate', minCards: '', holdouts: 2 };

// The built-in examples: a CBC study of 200 simulated respondents (12 tasks of 3 plans plus "none", 20 versions,
// balanced overlap) and a ratings (or ranking) study of 40 respondents and 18 cards (L18 array) plus 2 holdouts.
export function exampleCbc() {
  const { study, design } = studyFromDraft(EXAMPLE_CBC_DRAFT);
  const coder = makeCoder(studyAttrs(study), { price: study.p, none: true });
  const sim = simulateCbc({ design, coder });
  const results = sim.resp.map((r, i) => ({ v: 1, t: 'cjr', s: study.id, dh: study.dh, p: r.id, d: 1700000000000 + i, ver: r.ver, y: r.y }));
  return { study, results, truth: sim.truth };
}
export function exampleTrad(mode = 'rate') {
  const { study, design } = studyFromDraft({ ...EXAMPLE_TRAD_DRAFT, id: mode === 'rank' ? 'example-rank' : 'example-rate', name: mode === 'rank' ? 'Bike-share membership (ranking)' : 'Bike-share membership', resp: mode });
  const coder = makeCoder(studyAttrs(study), { price: study.p });
  const resp = simulateTrad({ cards: design.cards, holdouts: design.holdouts, coder, mode });
  const results = resp.map((r, i) => ({ v: 1, t: 'cjr', s: study.id, dh: study.dh, p: r.id, d: 1700000000000 + i, y: r.y }));
  return { study, results, design };
}
