// Shared numerics for the experimentation and analytics tools (A/B health, multi-group comparisons, decision matrix,
// retention and funnels, meta-analysis). Pure functions with no React. Distributions build on lgamma and ibeta from
// stats.js; everything here is checked by `npm run check:expanalytics` against scipy and statsmodels.
import { lgamma, ibeta, tInv } from '../stats.js';

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const avg = (xs) => sum(xs) / xs.length;
export function variance(xs) { const m = avg(xs); return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1); }
export const sdev = (xs) => Math.sqrt(variance(xs));
export const toNumber = (v) => { const s = String(v ?? '').trim().replace(/,(?=\d{3}\b)/g, '').replace(/%$/, ''); if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return NaN; return Number(s); };

// ── Gamma family ──
// Regularised lower incomplete gamma P(a, x) by series, upper Q(a, x) by Lentz's continued fraction (Numerical Recipes 6.2).
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x >= a + 1) return 1 - gammaQ(a, x);
  let ap = a, del = 1 / a, s = del;
  for (let n = 0; n < 10000; n++) { ap += 1; del *= x / ap; s += del; if (Math.abs(del) < Math.abs(s) * 1e-16) break; }
  return s * Math.exp(-x + a * Math.log(x) - lgamma(a));
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - gammaP(a, x);
  const FPMIN = 1e-300;
  let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
export const chi2Sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));
export const chi2Cdf = (x, df) => (x <= 0 ? 0 : gammaP(df / 2, x / 2));
export function chi2Inv(p, df) {
  let lo = 0, hi = Math.max(10, df * 10);
  while (chi2Cdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (chi2Cdf(m, df) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ── Normal, t and F with accurate tails ──
// erfc(x) = Q(1/2, x²) for x ≥ 0, so Φ is accurate far into the tails (stats.js normCdf is good to about 1e-7).
export function normCdf(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const q = 0.5 * gammaQ(0.5, z * z / 2);
  return z >= 0 ? 1 - q : q;
}
export const normSf = (z) => normCdf(-z);
export function normInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  // Acklam's approximation, then two Newton steps on the accurate Φ.
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 2; i++) { const e = normCdf(x) - p; x -= e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); }
  return x;
}
// Two-sided and one-sided t tails.
export const tSf2 = (t, df) => (df > 1e7 ? 2 * normSf(Math.abs(t)) : ibeta(df / (df + t * t), df / 2, 0.5));
export const tSf = (t, df) => (t >= 0 ? tSf2(t, df) / 2 : 1 - tSf2(t, df) / 2);
export const tCrit = (conf, df) => (df > 1e7 ? normInv(1 - (1 - conf) / 2) : tInv(1 - (1 - conf) / 2, df));
export const fSf = (F, d1, d2) => (F <= 0 ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));

// ── Studentized range distribution (Tukey HSD, Games-Howell, Nemenyi) ──
// A port of R's ptukey (Copenhaver and Holland 1988, AS 190 with Gauss-Legendre quadrature).
const XLEG = [0.981560634246719250690549090149, 0.904117256370474856678465866119, 0.769902674194304687036893833213, 0.587317954286617447296702418941, 0.367831498998180193752691536644, 0.125233408511468915472441369464];
const ALEG = [0.047175336386511827194615961485, 0.106939325995318430960254718194, 0.160078328543346226334652529543, 0.203167426723065921749064455810, 0.233492536538354808760849898925, 0.249147045813402785000562436043];
function wprob(w, rr, cc) {
  const nleg = 12, ihalf = 6, C1 = -30, C2 = -50, C3 = 60, bb = 8, wlar = 3;
  const qsqz = w * 0.5;
  if (qsqz >= bb) return 1;
  let prW = 2 * normCdf(qsqz) - 1;
  prW = prW >= Math.exp(C2 / cc) ? prW ** cc : 0;
  const wincr = w > wlar ? 2 : 3;
  let blb = qsqz; const binc = (bb - qsqz) / wincr; let bub = blb + binc, einsum = 0;
  const cc1 = cc - 1;
  for (let wi = 1; wi <= wincr; wi++) {
    let elsum = 0; const a = 0.5 * (bub + blb), b = 0.5 * (bub - blb);
    for (let jj = 1; jj <= nleg; jj++) {
      let j, xx;
      if (ihalf < jj) { j = nleg - jj + 1; xx = XLEG[j - 1]; } else { j = jj; xx = -XLEG[j - 1]; }
      const ac = a + b * xx, qexpo = ac * ac;
      if (qexpo > C3) break;
      let rinsum = normCdf(ac) - normCdf(ac - w);
      if (rinsum >= Math.exp(C1 / cc1)) { rinsum = ALEG[j - 1] * Math.exp(-0.5 * qexpo) * rinsum ** cc1; elsum += rinsum; }
    }
    elsum *= 2 * b * cc / Math.sqrt(2 * Math.PI);
    einsum += elsum; blb = bub; bub += binc;
  }
  prW += einsum;
  if (prW <= Math.exp(C1 / rr)) return 0;
  prW **= rr;
  return prW >= 1 ? 1 : prW;
}
const XLEGQ = [0.989400934991649932596154173450, 0.944575023073232576077988415535, 0.865631202387831743880467897712, 0.755404408355003033895101194847, 0.617876244402643748446671764049, 0.458016777657227386342419442984, 0.281603550779258913230460501460, 0.950125098376374401853193354250e-1];
const ALEGQ = [0.271524594117540948517805724560e-1, 0.622535239386478928628438369944e-1, 0.951585116824927848099251076022e-1, 0.124628971255533872052476282192, 0.149595988816576732081501730547, 0.169156519395002538189312079030, 0.182603415044923588866763667969, 0.189450610455068496285396723208];
// P(Q ≤ q) for the range of k means with df error degrees of freedom.
export function ptukey(q, k, df, rr = 1) {
  if (!(q > 0)) return 0;
  if (!Number.isFinite(q)) return 1;
  if (!Number.isFinite(df) || df > 25000) return wprob(q, rr, k);
  const nlegq = 16, ihalfq = 8, eps1 = -30, eps2 = 1e-14;
  const f2 = df * 0.5;
  let f2lf = f2 * Math.log(df) - df * Math.LN2 - lgamma(f2);
  const f21 = f2 - 1, ff4 = df * 0.25;
  const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
  f2lf += Math.log(ulen);
  let ans = 0, otsum = 0;
  for (let i = 1; i <= 50; i++) {
    otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= nlegq; jj++) {
      let j, t1;
      if (ihalfq < jj) { j = jj - ihalfq - 1; t1 = f2lf + f21 * Math.log(twa1 + XLEGQ[j] * ulen) - (XLEGQ[j] * ulen + twa1) * ff4; }
      else { j = jj - 1; t1 = f2lf + f21 * Math.log(twa1 - XLEGQ[j] * ulen) + (XLEGQ[j] * ulen - twa1) * ff4; }
      if (t1 >= eps1) {
        const qsqz = ihalfq < jj ? q * Math.sqrt((XLEGQ[j] * ulen + twa1) * 0.5) : q * Math.sqrt((-(XLEGQ[j] * ulen) + twa1) * 0.5);
        otsum += wprob(qsqz, rr, k) * ALEGQ[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1 && otsum <= eps2) break;
    ans += otsum;
  }
  return Math.min(1, ans);
}
export const ptukeySf = (q, k, df) => Math.max(0, 1 - ptukey(q, k, df));
// Upper quantile: the q with P(Q ≤ q) = p.
export function qtukey(p, k, df) {
  let lo = 0, hi = 10;
  while (ptukey(hi, k, df) < p) hi *= 2;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (ptukey(m, k, df) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ── Kolmogorov-Smirnov ──
// Exact P(D_n < d) by Marsaglia, Tsang and Wang (2003), with exponent tracking so large n does not overflow.
function mmul(A, B, m) {
  const C = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i++) for (let k = 0; k < m; k++) { const a = A[i][k]; if (a === 0) continue; const Bk = B[k], Ci = C[i]; for (let j = 0; j < m; j++) Ci[j] += a * Bk[j]; }
  return C;
}
export function ksCdfExact(n, d) {
  if (d <= 0) return 0; if (d >= 1) return 1;
  const k = Math.floor(n * d) + 1, m = 2 * k - 1, h = k - n * d;
  const H = Array.from({ length: m }, (_, i) => Float64Array.from({ length: m }, (__, j) => (i - j + 1 >= 0 ? 1 : 0)));
  for (let i = 0; i < m; i++) { H[i][0] -= h ** (i + 1); H[m - 1][i] -= h ** (m - i); }
  H[m - 1][0] += 2 * h - 1 > 0 ? (2 * h - 1) ** m : 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i - j + 1 > 0) for (let g = 1; g <= i - j + 1; g++) H[i][j] /= g;
  // Matrix power with a running power-of-ten exponent.
  const pow = (A, eA, e) => {
    if (e === 1) return [A, eA];
    let [V, eV] = pow(A, eA, Math.floor(e / 2));
    let B = mmul(V, V, m), eB = 2 * eV;
    if (e % 2 === 1) { B = mmul(A, B, m); eB += eA; }
    if (B[k - 1][k - 1] > 1e140) { for (const row of B) for (let j = 0; j < m; j++) row[j] *= 1e-140; eB += 140; }
    return [B, eB];
  };
  const [Q, eQ] = pow(H, 0, n);
  let s = Q[k - 1][k - 1], eS = eQ;
  for (let i = 1; i <= n; i++) { s = s * i / n; if (s < 1e-140) { s *= 1e140; eS -= 140; } }
  return s * 10 ** eS;
}
// Asymptotic Kolmogorov distribution with Stephens' (1970) small-sample adjustment, for large n.
export function ksSfAsymptotic(n, d) {
  const sn = Math.sqrt(n), l = (sn + 0.12 + 0.11 / sn) * d;
  let s = 0; for (let j = 1; j <= 100; j++) s += 2 * (-1) ** (j - 1) * Math.exp(-2 * j * j * l * l);
  return Math.max(0, Math.min(1, s));
}
// One-sample KS test against Uniform(0, 1): D = max(D+, D−), two-sided exact p for n ≤ 1000.
export function ksUniform(ps) {
  const x = [...ps].sort((a, b) => a - b), n = x.length;
  let dp = 0, dm = 0;
  x.forEach((v, i) => { dp = Math.max(dp, (i + 1) / n - v); dm = Math.max(dm, v - i / n); });
  const D = Math.max(dp, dm);
  const exact = n <= 1000 && Math.floor(n * D) + 1 <= 300;
  const p = exact ? Math.max(0, Math.min(1, 1 - ksCdfExact(n, D))) : ksSfAsymptotic(n, D);
  return { D, dPlus: dp, dMinus: dm, n, p, method: exact ? 'exact' : 'asymptotic' };
}

// ── Multiple-comparison adjustments (as statsmodels multipletests) ──
export function adjustP(ps, method = 'holm') {
  const m = ps.length, order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(m);
  if (method === 'bonferroni') return ps.map((p) => Math.min(1, p * m));
  if (method === 'holm') { let run = 0; order.forEach(([p, i], r) => { run = Math.max(run, Math.min(1, (m - r) * p)); out[i] = run; }); return out; }
  if (method === 'hochberg') { let run = 1; for (let r = m - 1; r >= 0; r--) { const [p, i] = order[r]; run = Math.min(run, (m - r) * p); out[i] = Math.min(1, run); } return out; }
  if (method === 'bh') { let run = 1; for (let r = m - 1; r >= 0; r--) { const [p, i] = order[r]; run = Math.min(run, p * m / (r + 1)); out[i] = Math.min(1, run); } return out; }
  throw new Error(`Unknown method ${method}`);
}

// ── Linear algebra ──
export function solve(A, b) {
  const n = A.length, M = A.map((r, i) => [...r, ...(Array.isArray(b[0]) ? b[i] : [b[i]])]), w = M[0].length;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-14) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let j = c; j < w; j++) M[r][j] -= f * M[c][j]; }
  }
  const X = M.map((r, i) => r.slice(n).map((v) => v / M[i][i]));
  return Array.isArray(b[0]) ? X : X.map((r) => r[0]);
}
// Eigenvalues of a symmetric matrix (cyclic Jacobi).
export function symEigenvalues(S) {
  const n = S.length, A = S.map((r) => [...r]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => b - a);
}
// Nelder-Mead minimiser for small smooth problems (the sBG fit).
export function nelderMead(f, x0, { step = 0.5, tol = 1e-12, maxIter = 4000 } = {}) {
  const n = x0.length; let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))].map((x) => [x, f(x)]);
  for (let it = 0; it < maxIter; it++) {
    pts.sort((a, b) => a[1] - b[1]);
    if (Math.abs(pts[n][1] - pts[0][1]) < tol * (Math.abs(pts[0][1]) + tol)) break;
    const c = x0.map((_, j) => avg(pts.slice(0, n).map((p) => p[0][j])));
    const at = (t) => c.map((v, j) => v + t * (pts[n][0][j] - v));
    const xr = at(-1), fr = f(xr);
    if (fr < pts[0][1]) { const xe = at(-2), fe = f(xe); pts[n] = fe < fr ? [xe, fe] : [xr, fr]; }
    else if (fr < pts[n - 1][1]) pts[n] = [xr, fr];
    else {
      const xc = fr < pts[n][1] ? at(-0.5) : at(0.5), fc = f(xc);
      if (fc < Math.min(fr, pts[n][1])) pts[n] = [xc, fc];
      else pts = pts.map((p, i) => (i === 0 ? p : ((x) => [x, f(x)])(p[0].map((v, j) => pts[0][0][j] + 0.5 * (v - pts[0][0][j])))));
    }
  }
  pts.sort((a, b) => a[1] - b[1]);
  return { x: pts[0][0], f: pts[0][1] };
}

// Wilson score interval (as statsmodels proportion_confint method='wilson').
export function wilsonCI(x, n, conf = 0.95) {
  if (!(n > 0)) return { lo: NaN, hi: NaN };
  const z = normInv(1 - (1 - conf) / 2), p = x / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, me = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { lo: Math.max(0, c - me), hi: Math.min(1, c + me) };
}
// Average ranks with ties, and the tie counts for corrections.
export function rankAll(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length), ties = [];
  for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; if (j > i) ties.push(j - i + 1); i = j + 1; }
  return { r, ties };
}
// Plain-language p-value text.
export const pText = (p) => (!Number.isFinite(p) ? 'n/a' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const pctText = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : 'n/a');
