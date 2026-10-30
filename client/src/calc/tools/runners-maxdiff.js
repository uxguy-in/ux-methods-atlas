// MaxDiff runner (group "runners"): a balanced incomplete block design for best-worst sets, a participant flow, count
// scores (the same as the MaxDiff counts calculator) and an aggregate sequential best-worst logit with intervals.
// The logit is checked against statsmodels ConditionalLogit in server/scripts/check-runners.js.
import { maxdiff as countScores, normCdf } from '../stats.js';
import { encodeCode, decodeCode, seeded, newId, shuffle, range, sum, invert, toCsv, pc, f2, pText, mdCell, plural, lines } from './runners-common.js';
import { chi2Sf } from './expanalytics-core.js';

export { newId };
export const TOOL = 'maxdiff-runner';

// ── Design ──
// Each version is cut from whole shuffled copies of the item list, topped up with the items shown least so far, so
// every item appears equally often (to within one) in every version and overall. Then a local search swaps items between sets of the same version (which
// keeps those counts) to remove repeats within a set and to even out how often each pair of items appears together:
// cost = 1000 × repeats + Σ_pairs (pair count − mean pair count)², by simulated annealing (at most 150,000 swaps per
// restart, three restarts; the best design is kept). Run in a Web Worker on the page (runners-maxdiff.worker.js).
export const recommendedSets = (J, k) => Math.max(1, Math.ceil((3 * J) / k));
export function makeDesign({ J, k, S, V = 1, seed = 1, iters = 4000, restarts = 3, maxSteps = 150000 }) {
  if (!(J >= 3 && k >= 2 && k < J && S >= 1 && V >= 1)) return null;
  const key = (a, b) => (a < b ? a * J + b : b * J + a);
  const totalPairs = (V * S * k * (k - 1)) / 2, target = totalPairs / ((J * (J - 1)) / 2);
  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    const rnd = seeded(seed * 7919 + rs * 104729 + 17);
    // Each version: whole shuffled copies of the list, topped up with the items shown least so far overall.
    const overall = new Array(J).fill(0);
    const versions = range(V).map(() => {
      const seq = []; while (seq.length + J <= S * k) seq.push(...shuffle(range(J), rnd));
      const extra = shuffle(range(J), rnd).sort((a, b) => overall[a] - overall[b]).slice(0, S * k - seq.length);
      seq.push(...extra);
      const mixed = shuffle(seq, rnd); mixed.forEach((x) => { overall[x]++; });
      return range(S).map((s) => mixed.slice(s * k, (s + 1) * k));
    });
    const pc2 = new Float64Array(J * J); let dup = 0;
    const apply = (set, sign) => { for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { if (set[i] === set[j]) dup += sign; else pc2[key(set[i], set[j])] += sign; } };
    versions.forEach((sets) => sets.forEach((set) => apply(set, 1)));
    const keysOf = (set) => { const ks = []; for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) if (set[i] !== set[j]) ks.push(key(set[i], set[j])); return ks; };
    const local = (ks) => { let c = 0; for (const x of ks) c += (pc2[x] - target) ** 2; return c; };
    const steps = Math.min(maxSteps, iters * V * S);
    let temp = 1;
    for (let it = 0; it < steps && S > 1; it++) {
      const v = Math.floor(rnd() * V), a = Math.floor(rnd() * S); let b = Math.floor(rnd() * (S - 1)); if (b >= a) b++;
      const A = versions[v][a], B = versions[v][b], i = Math.floor(rnd() * k), j = Math.floor(rnd() * k);
      if (A[i] === B[j]) continue;
      const A2 = [...A], B2 = [...B]; [A2[i], B2[j]] = [B2[j], A2[i]];
      const keys = new Set([...keysOf(A), ...keysOf(B), ...keysOf(A2), ...keysOf(B2)]);
      const before = local(keys) + 1000 * dup;
      apply(A, -1); apply(B, -1); [A[i], B[j]] = [B[j], A[i]]; apply(A, 1); apply(B, 1);
      const delta = local(keys) + 1000 * dup - before;
      if (delta <= 0 || rnd() < Math.exp(-delta / temp)) { /* keep */ } else { apply(A, -1); apply(B, -1); [A[i], B[j]] = [B[j], A[i]]; apply(A, 1); apply(B, 1); }
      temp = Math.max(0.02, 1 - it / (0.7 * steps));
    }
    const rep = balance(versions, J);
    const score = rep.repeats * 1e6 + rep.pairSS;
    if (!best || score < best.score) best = { versions: versions.map((sets) => sets.map((s) => [...s])), score, report: rep };
  }
  return { versions: best.versions, report: best.report };
}
// Balance of a design: appearances per item (overall and per version), pair co-occurrence, repeats within a set, and
// position counts. A design is a balanced incomplete block design (BIBD) when every item appears equally often and
// every pair appears together equally often.
export function balance(versions, J) {
  const k = versions[0]?.[0]?.length || 0;
  const items = new Array(J).fill(0), pairs = new Float64Array(J * J); let repeats = 0;
  const perVersion = versions.map((sets) => { const c = new Array(J).fill(0); sets.forEach((s) => s.forEach((x) => { c[x]++; })); return c; });
  versions.forEach((sets) => sets.forEach((s) => {
    s.forEach((x) => { items[x]++; });
    for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) { if (s[a] === s[b]) repeats++; else { pairs[s[a] * J + s[b]]++; pairs[s[b] * J + s[a]]++; } }
  }));
  const pv = []; for (let a = 0; a < J; a++) for (let b = a + 1; b < J; b++) pv.push(pairs[a * J + b]);
  const mean = sum(pv) / pv.length, ss = sum(pv.map((x) => (x - mean) ** 2));
  const vMin = Math.min(...perVersion.map((c) => Math.min(...c))), vMax = Math.max(...perVersion.map((c) => Math.max(...c)));
  return {
    J, k, V: versions.length, S: versions[0]?.length || 0, items, perVersion, pairs, repeats,
    itemMin: Math.min(...items), itemMax: Math.max(...items), perVersionMin: vMin, perVersionMax: vMax,
    pairMin: Math.min(...pv), pairMax: Math.max(...pv), pairMean: mean, pairSd: Math.sqrt(ss / pv.length), pairSS: ss, pairsNever: pv.filter((x) => x === 0).length, nPairs: pv.length,
    bibd: repeats === 0 && Math.min(...items) === Math.max(...items) && Math.min(...pv) === Math.max(...pv),
  };
}

// ── Studies and results ──
// Study: { v: 1, t: 'mdx', id, n, q: intro question, b: best label, w: worst label, it: [items], d: [versions][sets][k item indices] }.
export function makeStudy({ id, name, question, bestLabel, worstLabel, items, design }) {
  return { v: 1, t: 'mdx', id: id || newId(), n: String(name || 'MaxDiff survey').trim(), q: String(question || '').trim(), b: String(bestLabel || 'Most important').trim(), w: String(worstLabel || 'Least important').trim(), it: items.map((s) => String(s).trim()), d: design };
}
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'mdx' || !Array.isArray(s.it) || !Array.isArray(s.d) || !s.d.length) throw new Error('Not a MaxDiff study');
  return s;
}
// Result: { v: 1, t: 'mdxr', s, p, d: time, x: version, k: [[set, best item, worst item], …], ms }.
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'mdxr' || !Array.isArray(r.k)) throw new Error('Not a MaxDiff result');
  return r;
}
// Version for a participant: rotate by sessions saved in this browser in moderated runs, otherwise at random.
export const pickVersion = (V, session = null, rnd = Math.random) => (V <= 1 ? 0 : session != null ? session % V : Math.floor(rnd() * V));

// Every answered set as { r: respondent, items: [indices], best, worst }, dropping answers that do not fit the design.
export function tasksOf(study, results) {
  const out = [];
  results.forEach((r, ri) => {
    const sets = study.d[r.x]; if (!sets) return;
    (r.k || []).forEach(([si, b, w]) => {
      const items = sets[si];
      if (items && items.every((i) => i >= 0 && i < study.it.length) && items.includes(b) && items.includes(w) && b !== w) out.push({ r: ri, items, best: b, worst: w });
    });
  });
  return out;
}

// ── Sequential best-worst logit ──
// Each set gives two choices: the best item from all k items, P(b) = e^{u_b} / Σ_{j∈set} e^{u_j}; then the worst item
// from the k − 1 left, P(w) = e^{−u_w} / Σ_{j∈set, j≠b} e^{−u_j}. One item is fixed at 0 for identification; the
// log-likelihood is maximised by Newton-Raphson with step halving. Model standard errors come from the inverse Hessian
// (statsmodels ConditionalLogit gives the same); the default robust ones are a sandwich clustered by respondent,
// H⁻¹ (Σ_r g_r g_rᵀ) H⁻¹ × R/(R − 1), because one person's choices are not independent. Utilities are reported centred
// on their mean; shares of preference are e^{u_i} / Σ_j e^{u_j}, with delta-method intervals.
export function choicesOf(tasks) {
  const ch = [];
  tasks.forEach((t) => { ch.push({ r: t.r, alts: t.items, c: t.best, s: 1 }); ch.push({ r: t.r, alts: t.items.filter((x) => x !== t.best), c: t.worst, s: -1 }); });
  return ch;
}
export function fitLogit(tasks, J, { ref = J - 1, conf = 0.95, robust = true } = {}) {
  const ch = choicesOf(tasks);
  if (!ch.length) return null;
  const P = J - 1, idx = (j) => (j < ref ? j : j > ref ? j - 1 : -1);
  const util = (th) => range(J).map((j) => (j === ref ? 0 : th[idx(j)]));
  const evalAt = (th, withHess) => {
    const u = util(th); let ll = 0; const g = new Float64Array(P); const H = withHess ? range(P).map(() => new Float64Array(P)) : null;
    const per = withHess ? new Map() : null;
    for (const o of ch) {
      const v = o.alts.map((j) => o.s * u[j]); const m = Math.max(...v); const e = v.map((x) => Math.exp(x - m)); const z = sum(e); const p = e.map((x) => x / z);
      const ci = o.alts.indexOf(o.c);
      ll += v[ci] - m - Math.log(z);
      const gi = o.alts.map((j, a) => o.s * ((a === ci ? 1 : 0) - p[a]));
      o.alts.forEach((j, a) => { const q = idx(j); if (q >= 0) g[q] += gi[a]; });
      if (withHess) {
        let gr = per.get(o.r); if (!gr) { gr = new Float64Array(P); per.set(o.r, gr); }
        o.alts.forEach((j, a) => { const q = idx(j); if (q >= 0) gr[q] += gi[a]; });
        for (let a = 0; a < o.alts.length; a++) { const qa = idx(o.alts[a]); if (qa < 0) continue; for (let b = 0; b < o.alts.length; b++) { const qb = idx(o.alts[b]); if (qb < 0) continue; H[qa][qb] += p[a] * ((a === b ? 1 : 0) - p[b]); } }
      }
    }
    return { ll, g, H, per };
  };
  let th = new Float64Array(P), cur = evalAt(th, true), iter = 0, converged = false;
  for (; iter < 100; iter++) {
    const Hi = invert(cur.H.map((r) => [...r])); if (!Hi) break;
    const step = Hi.map((r) => sum(r.map((v, q) => v * cur.g[q])));
    let t = 1, next, nth;
    for (let h = 0; h < 30; h++) { nth = th.map((x, q) => x + t * step[q]); next = evalAt(nth, false); if (next.ll >= cur.ll - 1e-12) break; t /= 2; }
    th = nth; const prev = cur.ll; cur = evalAt(th, true);
    if (Math.max(...step.map(Math.abs)) * t < 1e-10 || Math.abs(cur.ll - prev) < 1e-13) { converged = true; break; }
  }
  const Hinv = invert(cur.H.map((r) => [...r]));
  if (!Hinv) return null;
  const R = cur.per.size;
  let Vrob = null;
  if (R > 1) {
    const meat = range(P).map(() => new Float64Array(P));
    for (const gr of cur.per.values()) for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) meat[a][b] += gr[a] * gr[b];
    const left = Hinv.map((r) => range(P).map((b) => sum(r.map((v, q) => v * meat[q][b]))));
    Vrob = left.map((r) => range(P).map((b) => sum(r.map((v, q) => v * Hinv[q][b])) * (R / (R - 1))));
  }
  const V = robust && Vrob ? Vrob : Hinv;
  const z = -inverseNorm((1 - conf) / 2);
  // Centred utilities u_c = T θ with T = (I − 11ᵀ/J) M, M the J × (J − 1) map from θ to u.
  const u = util(th), mu = sum(u) / J, uc = u.map((x) => x - mu);
  const T = range(J).map((i) => range(P).map((q) => ((idx(i) === q ? 1 : 0) - 1 / J)));
  const covOf = (A, Vm) => A.map((ra) => A.map((rb) => sum(ra.map((x, q) => x * sum(rb.map((y, s) => Vm[q][s] * y))))));
  const Vc = covOf(T, V);
  const ex = u.map((x) => Math.exp(x - Math.max(...u))), Z = sum(ex), sh = ex.map((x) => x / Z);
  const Js = range(J).map((i) => range(P).map((q) => { let d = 0; range(J).forEach((j) => { if (idx(j) === q) d += sh[i] * ((i === j ? 1 : 0) - sh[j]); }); return d; }));
  const Vs = covOf(Js, V);
  const ll0 = -sum(ch.map((o) => Math.log(o.alts.length)));
  const lr = 2 * (cur.ll - ll0);
  return {
    J, ref, converged, iter, ll: cur.ll, ll0, lr, df: P, pLR: chi2Sf(lr, P), rho2: 1 - cur.ll / ll0, nChoices: ch.length, R,
    theta: Array.from(th), seModel: range(P).map((q) => Math.sqrt(Hinv[q][q])), seRobust: Vrob ? range(P).map((q) => Math.sqrt(Vrob[q][q])) : null, robust: robust && !!Vrob,
    u: uc, se: range(J).map((i) => Math.sqrt(Vc[i][i])), lo: uc.map((x, i) => x - z * Math.sqrt(Vc[i][i])), hi: uc.map((x, i) => x + z * Math.sqrt(Vc[i][i])), Vc,
    share: sh, shareSe: range(J).map((i) => Math.sqrt(Vs[i][i])), shareLo: sh.map((x, i) => Math.max(0, x - z * Math.sqrt(Vs[i][i]))), shareHi: sh.map((x, i) => Math.min(1, x + z * Math.sqrt(Vs[i][i]))),
    separated: Array.from(th).some((x) => Math.abs(x) > 12),
  };
}
const inverseNorm = (p) => { let lo = -10, hi = 10; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
// Difference between two centred utilities with its z-test (Wald), using the covariance the model reported.
export function compareItems(fit, a, b) {
  const d = fit.u[a] - fit.u[b], se = Math.sqrt(fit.Vc[a][a] + fit.Vc[b][b] - 2 * fit.Vc[a][b]), zz = d / se;
  return { d, se, z: zz, p: 2 * (1 - normCdf(Math.abs(zz))) };
}

// ── Analysis ──
export function analyse(study, results, opts = {}) {
  const J = study.it.length;
  const tasks = tasksOf(study, results);
  const resp = new Set(tasks.map((t) => t.r)).size;
  const names = study.it;
  const counts = tasks.length ? countScores(tasks.map((t) => ({ items: t.items.map((i) => names[i]), best: names[t.best], worst: names[t.worst] }))) : [];
  const fit = tasks.length && resp >= 2 ? fitLogit(tasks, J, opts) : null;
  const order = fit ? range(J).sort((a, b) => fit.u[b] - fit.u[a]) : counts.map((c) => names.indexOf(c.item));
  const top2 = fit && order.length > 1 ? compareItems(fit, order[0], order[1]) : null;
  const rCounts = fit && counts.length ? spearman(order.map((i) => fit.u[i]), order.map((i) => counts.find((c) => c.item === names[i])?.norm ?? 0)) : NaN;
  return { J, n: resp, tasks, counts, fit, order, top2, rCounts, names };
}
function spearman(a, b) {
  const rank = (xs) => { const o = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(xs.length); let i = 0; while (i < o.length) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let q = i; q <= j; q++) r[o[q][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const ra = rank(a), rb = rank(b), n = a.length, ma = sum(ra) / n, mb = sum(rb) / n;
  let s = 0, sa = 0, sb = 0; for (let i = 0; i < n; i++) { s += (ra[i] - ma) * (rb[i] - mb); sa += (ra[i] - ma) ** 2; sb += (rb[i] - mb) ** 2; }
  return sa && sb ? s / Math.sqrt(sa * sb) : NaN;
}

// ── Reading the results ──
// Confidence rule (shown in confidenceNote):
//   high   — at least 50 respondents, the logit converged without runaway estimates, and the top item beats the second (Wald p < 0.01);
//   medium — the top item beats the second with p < 0.05, or at least 100 respondents;
//   low    — anything else (including no model).
export function confidenceLevel(an) {
  const f = an.fit, p = an.top2?.p;
  if (f && f.converged && !f.separated && an.n >= 50 && p < 0.01) return 'high';
  if (f && (p < 0.05 || an.n >= 100)) return 'medium';
  return 'low';
}
export function summary(an, study) {
  if (!an || !an.n || !an.fit) return null;
  const { fit, order, names, n } = an;
  const top = names[order[0]], second = names[order[1]], bottom = names[order[order.length - 1]];
  const confidence = confidenceLevel(an);
  const sig = an.top2.p < 0.05;
  const shown = an.tasks.length / n;
  const headline = sig
    ? `${top} is the clear favourite of ${n} respondents, with ${pc(fit.share[order[0]], 1)} share of preference, ahead of ${second} (${pc(fit.share[order[1]], 1)}).`
    : `${top} and ${second} lead (${pc(fit.share[order[0]], 1)} and ${pc(fit.share[order[1]], 1)} share of preference) and cannot be separated with ${plural(n, 'respondent')}.`;
  const meaning = [
    `Top three: ${order.slice(0, 3).map((i) => `${names[i]} (${pc(fit.share[i], 1)})`).join(', ')}. Bottom: ${bottom} (${pc(fit.share[order[order.length - 1]], 1)}). A share of preference is how often an item would be picked as best if all ${an.J} were offered together; an even split would give ${pc(1 / an.J, 1)} each.`,
    `${top} vs ${second}: utility difference ${f2(an.top2.d)} (${pText(an.top2.p)}). ${sig ? 'The lead is unlikely to be chance.' : 'More respondents are needed to rank these two.'}`,
    `The logit fits much better than "all items equal" (likelihood-ratio χ²(${fit.df}) = ${f2(fit.lr, 1)}, ${pText(fit.pLR)}; McFadden ρ² = ${f2(fit.rho2)}), and its order agrees with the count scores (Spearman ρ = ${f2(an.rCounts)}).`,
  ];
  const caveats = ['MaxDiff gives relative importance among these items only: the last item may still matter, and the first may not be worth building. Ask about absolute need separately (for example an anchored MaxDiff or a must-have question).'];
  if (fit.separated || !fit.converged) caveats.push('At least one item was (almost) always or never chosen, so its utility runs off towards infinity and its interval is not meaningful; read its count score instead.');
  else if (shown < 6) caveats.push(`Each respondent answered ${f2(shown, 1)} sets on average; with so few sets per person, only the pooled scores are reliable.`);
  else caveats.push('These are pooled (aggregate) scores. Segments with opposite priorities can average out to the middle; split by segment or fit a hierarchical Bayes model to see individual differences.');
  const next = sig
    ? [`Prioritise around ${top} and ${second}; check the bottom items (${bottom}) are not must-haves people take for granted.`, 'Export the answers to the [MaxDiff counts calculator](/calculators/maxdiff) or a TURF analysis to find a set of items that reaches most people.']
    : ['Collect more responses: around 100–200 respondents is typical for stable aggregate scores (Sawtooth Software, MaxDiff technical paper).', 'Look at the count scores and the intervals together: items whose intervals overlap are effectively tied.'];
  const confidenceNote = `Rule: strong when there are at least 50 respondents, the logit converged with no runaway estimates and the top item beats the second with p < 0.01; some when that comparison gives p < 0.05, or there are at least 100 respondents; weak otherwise. Here: ${n} respondents, ${pText(an.top2.p)}. Intervals use standard errors ${fit.robust ? 'clustered by respondent' : 'from the model'}.`;
  const report = `In a MaxDiff survey of ${an.J} items with ${n} respondents (${an.tasks.length} sets), a sequential best-worst logit ranked ${top} first (share of preference ${pc(fit.share[order[0]], 1)}, 95% CI ${pc(fit.shareLo[order[0]], 1)}–${pc(fit.shareHi[order[0]], 1)}), then ${second} (${pc(fit.share[order[1]], 1)}); ${bottom} was last (${pc(fit.share[order[order.length - 1]], 1)}).`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}

// ── Exports ──
const clean = (s) => String(s).replace(/[,;\t|\n]+/g, ' ').replace(/\s+/g, ' ').trim();
// One line per answered set, in the format of the MaxDiff counts calculator: items shown | best | worst.
export const countsFormat = (study, tasks) => tasks.map((t) => `${t.items.map((i) => clean(study.it[i])).join(', ')} | ${clean(study.it[t.best])} | ${clean(study.it[t.worst])}`).join('\n');
export function answersCsv(study, results) {
  const rows = [['participant', 'version', 'set', ...range(study.d[0][0].length).map((i) => `item_${i + 1}`), 'best', 'worst']];
  results.forEach((r) => (r.k || []).forEach(([si, b, w]) => { const items = study.d[r.x]?.[si]; if (items) rows.push([r.p, r.x + 1, si + 1, ...items.map((i) => study.it[i]), study.it[b], study.it[w]]); }));
  return toCsv(rows);
}
export function designCsv(study) {
  const rows = [['version', 'set', ...range(study.d[0][0].length).map((i) => `item_${i + 1}`)]];
  study.d.forEach((sets, v) => sets.forEach((s, si) => rows.push([v + 1, si + 1, ...s.map((i) => study.it[i])])));
  return toCsv(rows);
}
export function markdown(study, an, sm) {
  const out = [`# ${study.n}: MaxDiff results`, '', `${an.n} respondents, ${an.tasks.length} sets, ${an.J} items.`, ''];
  if (an.fit) {
    out.push('| Rank | Item | Share of preference (95% CI) | Utility (95% CI) | Best | Worst | Shown | (B − W)/shown |', '|---|---|---|---|---|---|---|---|');
    an.order.forEach((i, r) => { const c = an.counts.find((x) => x.item === study.it[i]) || {}; out.push(`| ${r + 1} | ${mdCell(study.it[i])} | ${pc(an.fit.share[i], 1)} (${pc(an.fit.shareLo[i], 1)}–${pc(an.fit.shareHi[i], 1)}) | ${f2(an.fit.u[i])} (${f2(an.fit.lo[i])} to ${f2(an.fit.hi[i])}) | ${c.best ?? 0} | ${c.worst ?? 0} | ${c.shown ?? 0} | ${f2(c.norm)} |`); });
    out.push('');
  }
  if (sm) out.push(`**${sm.headline}**`, '', ...sm.meaning.map((m) => `- ${m}`), '', `Confidence: ${sm.confidence}. ${sm.confidenceNote}`);
  return out.join('\n');
}
export const parseItems = (text) => [...new Set(lines(text))];

// ── Built-in example ──
export const EXAMPLE_ITEMS = ['Offline mode', 'Calendar sync', 'Dark theme', 'Shared templates', 'Time tracking', 'Guest access for clients', 'Recurring tasks', 'Gantt chart view', 'Slack notifications', 'Custom fields', 'Two-factor sign-in', 'Bulk editing'];
const EX_TRUE = [0.2, 0.9, -1.0, 0.4, -0.3, 0.1, 1.2, -0.6, 0.0, 0.5, 0.7, -0.4];
export function exampleStudy() {
  const J = EXAMPLE_ITEMS.length, k = 4;
  const des = makeDesign({ J, k, S: recommendedSets(J, k), V: 4, seed: 11, restarts: 1, maxSteps: 30000 });
  return makeStudy({ id: 'mdxex1', name: 'Project tool feature priorities', question: 'Thinking about how your team plans work, which of these would matter most and least to you?', bestLabel: 'Most important', worstLabel: 'Least important', items: EXAMPLE_ITEMS, design: des.versions });
}
// 48 simulated respondents choosing with sequential best-worst logit probabilities around EX_TRUE, plus person-level noise.
export function exampleResults(study = exampleStudy()) {
  const rnd = seeded(4242);
  const gum = () => -Math.log(-Math.log(Math.max(1e-12, rnd())));
  const out = [];
  for (let p = 0; p < 48; p++) {
    const x = p % study.d.length;
    const me = EX_TRUE.map((u) => u + 0.5 * (gum() - 0.5772));
    const k = study.d[x].map((set, si) => {
      const b = set.reduce((best, j) => { const v = me[j] + gum(); return v > best[0] ? [v, j] : best; }, [-Infinity, -1])[1];
      const w = set.filter((j) => j !== b).reduce((best, j) => { const v = -me[j] + gum(); return v > best[0] ? [v, j] : best; }, [-Infinity, -1])[1];
      return [si, b, w];
    });
    out.push({ v: 1, t: 'mdxr', s: study.id, p: `R-${String(p + 1).padStart(2, '0')}`, d: 1793318400000 + p * 900000, x, k, ms: Math.round(90000 + rnd() * 120000) });
  }
  return out;
}
export const exampleCodes = (study = exampleStudy()) => exampleResults(study).map(encodeResult).join('\n');
