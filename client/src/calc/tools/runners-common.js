// Shared helpers for the study runners (group "runners"): preference test, MaxDiff runner and product reaction cards.
// Studies and results travel as compact codes (./codec.js, imported, never edited). Statistics here are checked against
// scipy and statsmodels in server/scripts/check-runners.js (reference: server/scripts/runners-reference.py).
import { encodeCode, decodeCode } from './codec.js';
import { wilson, binomPmf, normCdf, tCdf, tInv, fisherExact } from '../stats.js';
import { chi2Sf } from './expanalytics-core.js';

export { encodeCode, decodeCode, wilson, fisherExact };

// ── Random numbers, ids and lists ──
export function seeded(seed = 1) {
  let s = Math.floor(Math.abs(seed)) % 2147483647; if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
export function newId(rnd = Math.random) { let s = ''; const A = 'abcdefghjkmnpqrstuvwxyz23456789'; for (let i = 0; i < 8; i++) s += A[Math.floor(rnd() * A.length)]; return s; }
export function shuffle(a, rnd = Math.random) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
export const range = (n) => Array.from({ length: n }, (_, i) => i);
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const isUrl = (u) => /^https?:\/\/\S+$/i.test(String(u || '').trim());
export const lines = (text) => String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

// ── Text for reports ──
export const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n');
export const pc = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
export const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const pText = (p) => (!Number.isFinite(p) ? 'p not available' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const mdCell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ── Sessions kept in this browser (moderated runs); every access is wrapped because storage can be blocked ──
const KEY = (tool, id) => `uxatlas:${tool}:${id}`;
export function loadSessions(tool, id) { try { const v = JSON.parse(localStorage.getItem(KEY(tool, id)) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function saveSession(tool, id, code) { try { const all = loadSessions(tool, id); if (!all.includes(code)) all.push(code); localStorage.setItem(KEY(tool, id), JSON.stringify(all)); return true; } catch { return false; } }
export function clearSessions(tool, id) { try { localStorage.removeItem(KEY(tool, id)); return true; } catch { return false; } }
export function readStore(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } }
export function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }

// Result codes pasted one per line (or separated by spaces or commas). Unreadable codes are counted; codes from other
// studies are counted and left out; a participant id seen twice keeps only its first code.
export function parseCodes(text, decode, studyId) {
  const results = [], bad = [], seen = new Set(); let other = 0, dupes = 0;
  String(text || '').split(/[\s,]+/).filter(Boolean).forEach((c, i) => {
    let r; try { r = decode(c); } catch { bad.push(i + 1); return; }
    if (studyId && r.s && r.s !== studyId) { other++; return; }
    const k = `${r.p}|${r.d || ''}`;
    if (seen.has(k)) { dupes++; return; }
    seen.add(k); results.push(r);
  });
  return { results, bad, other, dupes };
}

// ── Tests ──
// Exact two-sided binomial test, as scipy.stats.binomtest: the sum of the probabilities of every outcome no more
// likely than the one observed (with scipy's relative tolerance of 1e-7).
export function binomTest(k, n, p = 0.5) {
  if (!(n > 0)) return { p: NaN };
  const d = binomPmf(k, n, p) * (1 + 1e-7);
  let s = 0; for (let i = 0; i <= n; i++) { const q = binomPmf(i, n, p); if (q <= d) s += q; }
  return { k, n, p: Math.min(1, s), share: k / n };
}
// Chi-square goodness of fit against equal shares (or given expected proportions), as scipy.stats.chisquare.
export function chiSquareGof(counts, props) {
  const n = sum(counts), k = counts.length;
  const pr = props || counts.map(() => 1 / k);
  const exp = pr.map((p) => n * p);
  const stat = sum(counts.map((o, i) => (o - exp[i]) ** 2 / exp[i]));
  const df = k - 1;
  return { stat, df, p: chi2Sf(stat, df), expected: exp, minExpected: Math.min(...exp) };
}
// Chi-square test of independence (no continuity correction), as scipy.stats.chi2_contingency(correction=False).
// Empty rows and columns are dropped. Cramér's V = √(χ² / (n · (min(r, c) − 1))).
export function chiSquareTable(table) {
  let t = table.filter((r) => sum(r) > 0);
  const keep = range(t[0]?.length || 0).filter((j) => t.some((r) => r[j] > 0));
  t = t.map((r) => keep.map((j) => r[j]));
  const R = t.length, C = keep.length;
  if (R < 2 || C < 2) return { stat: NaN, df: 0, p: NaN, v: NaN, minExpected: NaN };
  const rs = t.map(sum), cs = range(C).map((j) => sum(t.map((r) => r[j]))), n = sum(rs);
  let stat = 0, minE = Infinity;
  for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) { const e = rs[i] * cs[j] / n; minE = Math.min(minE, e); stat += (t[i][j] - e) ** 2 / e; }
  const df = (R - 1) * (C - 1);
  return { stat, df, p: chi2Sf(stat, df), v: Math.sqrt(stat / (n * (Math.min(R, C) - 1))), minExpected: minE, n };
}

// ── Small linear algebra ──
export function invert(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...range(n).map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c && M[r][c] !== 0) { const f = M[r][c]; for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map((r) => r.slice(n));
}
export const matMul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));

// ── OLS with standard errors clustered by participant ──
// rows: { y, x: [..], g: cluster id }. β = (X'X)⁻¹X'y; V = c · (X'X)⁻¹ [Σ_g (X_g'e_g)(X_g'e_g)'] (X'X)⁻¹ with
// c = G/(G − 1) · (N − 1)/(N − p), and t-intervals on G − 1 degrees of freedom: the defaults of statsmodels
// OLS.fit(cov_type='cluster', use_t=True). Used for shares of words or picks where one person contributes many.
export function clusterOls(rows, conf = 0.95) {
  const N = rows.length, p = rows[0]?.x.length || 0;
  const groups = new Map(); rows.forEach((r) => { if (!groups.has(r.g)) groups.set(r.g, []); groups.get(r.g).push(r); });
  const G = groups.size;
  if (!N || G < 2) return null;
  const XtX = range(p).map((a) => range(p).map((b) => sum(rows.map((r) => r.x[a] * r.x[b]))));
  const B = invert(XtX); if (!B) return null;
  const Xty = range(p).map((a) => sum(rows.map((r) => r.x[a] * r.y)));
  const beta = B.map((r) => sum(r.map((v, k) => v * Xty[k])));
  const meat = range(p).map(() => range(p).map(() => 0));
  for (const rs of groups.values()) {
    const s = range(p).map((a) => sum(rs.map((r) => r.x[a] * (r.y - sum(r.x.map((v, k) => v * beta[k]))))));
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) meat[a][b] += s[a] * s[b];
  }
  const c = (G / (G - 1)) * ((N - 1) / (N - p));
  const V = matMul(matMul(B, meat), B).map((r) => r.map((v) => v * c));
  const df = G - 1, tc = tInv(1 - (1 - conf) / 2, df);
  const se = range(p).map((a) => Math.sqrt(V[a][a]));
  return { beta, se, V, df, G, N, lo: beta.map((b, a) => b - tc * se[a]), hi: beta.map((b, a) => b + tc * se[a]), t: beta.map((b, a) => b / se[a]), p: beta.map((b, a) => 2 * (1 - tCdfAbs(Math.abs(b / se[a]), df))) };
}
// Student t CDF for |t| (via the normal for very large df).
const tCdfAbs = (t, df) => (Number.isFinite(t) ? (df > 1e6 ? normCdf(t) : tCdf(t, df)) : 1);

// Share of 0/1 items when each participant contributes several (picks, words): the ratio Σy / Σm with a cluster-robust
// interval. Equals the intercept of an OLS of the item-level 0/1 on a constant, clustered by participant.
export function clusteredShare(perPerson, conf = 0.95) {
  // perPerson: [{ g, yes, total }]
  const rows = [];
  perPerson.forEach((q) => { for (let i = 0; i < q.total; i++) rows.push({ y: i < q.yes ? 1 : 0, x: [1], g: q.g }); });
  const m = clusterOls(rows, conf);
  const share = rows.length ? sum(rows.map((r) => r.y)) / rows.length : NaN;
  return m ? { share, lo: Math.max(0, m.lo[0]), hi: Math.min(1, m.hi[0]), se: m.se[0], df: m.df, n: m.G, items: rows.length } : { share, lo: NaN, hi: NaN, se: NaN, df: 0, n: perPerson.length, items: rows.length };
}
