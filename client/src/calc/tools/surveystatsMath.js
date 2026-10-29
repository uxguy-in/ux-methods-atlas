// Shared maths for the survey statistics tools (factor analysis, scale validity, key drivers, crosstabs): small dense
// linear algebra, correlation matrices, the normal, chi-square and noncentral chi-square distributions, the bivariate
// normal CDF (for polychoric correlations), a box-constrained quasi-Newton minimiser and Holm's adjustment.
// Plain JS, no React, so server/scripts/check-surveystats.js can test it against numpy and scipy.
import { symEigen, rng } from '../cluster.js';
import { tCdf } from '../stats.js';

// ── Linear algebra on arrays of arrays ──
export const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
export const eye = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)));
export const transpose = (A) => (A.length ? A[0].map((_, j) => A.map((r) => r[j])) : []);
export function matMul(A, B) {
  const n = A.length, m = B[0].length, k = B.length, out = zeros(n, m);
  for (let i = 0; i < n; i++) for (let t = 0; t < k; t++) { const a = A[i][t]; if (a === 0) continue; const Bt = B[t], o = out[i]; for (let j = 0; j < m; j++) o[j] += a * Bt[j]; }
  return out;
}
export const matVec = (A, v) => A.map((r) => r.reduce((s, a, j) => s + a * v[j], 0));
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// Gauss-Jordan inverse with partial pivoting; null when the matrix is (numerically) singular.
export function inverse(M) {
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(1e-300, ...M.flat().map(Math.abs));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-13 * scale) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}
// log|det| and sign by LU with partial pivoting.
export function logDet(M) {
  const n = M.length, A = M.map((r) => r.slice()); let sign = 1, ld = 0;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (A[p][c] === 0) return { sign: 0, log: -Infinity };
    if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; sign = -sign; }
    const d = A[c][c]; if (d < 0) sign = -sign; ld += Math.log(Math.abs(d));
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / d; if (f) for (let j = c; j < n; j++) A[r][j] -= f * A[c][j]; }
  }
  return { sign, log: ld };
}
export const det = (M) => { const { sign, log } = logDet(M); return sign * Math.exp(log); };
export function solve(A, b) { const inv = inverse(A); return inv ? matVec(inv, b) : null; }

// Symmetric eigen decomposition (Jacobi, from cluster.js), largest eigenvalue first, vectors as plain arrays.
export function eigen(A) {
  const { values, vectors } = symEigen(A);
  return { values, vectors: vectors.map((v) => Array.from(v)) };
}
// Symmetric square root and inverse square root.
export function sqrtm(A, inv = false) {
  const { values, vectors } = eigen(A), p = A.length, out = zeros(p, p);
  values.forEach((l, k) => { const s = inv ? 1 / Math.sqrt(Math.max(l, 1e-300)) : Math.sqrt(Math.max(l, 0)); const v = vectors[k]; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) out[i][j] += s * v[i] * v[j]; });
  return out;
}

// ── Descriptives and correlations ──
export const mean = (xs) => { let s = 0; for (const x of xs) s += x; return s / xs.length; };
export const variance = (xs) => { const m = mean(xs); let s = 0; for (const x of xs) s += (x - m) ** 2; return s / (xs.length - 1); };
export const sdev = (xs) => Math.sqrt(variance(xs));
export function pearson(x, y) {
  const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
}
// cols: one array per variable (complete cases). Returns the Pearson correlation matrix.
export function corrMatrix(cols) {
  const p = cols.length, R = eye(p);
  for (let i = 0; i < p; i++) for (let j = i + 1; j < p; j++) { R[i][j] = R[j][i] = pearson(cols[i], cols[j]); }
  return R;
}
// Squared multiple correlations 1 − 1/diag(R⁻¹): each item's initial communality.
export function smc(R) { const inv = inverse(R); return inv ? inv.map((r, i) => 1 - 1 / r[i]) : null; }

// ── Distributions ──
// Standard normal CDF to double precision (Hart 1968, as given by West 2005).
export function phi(x) {
  const a = Math.abs(x); let c;
  if (a > 37) c = 0;
  else {
    const e = Math.exp(-a * a / 2);
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-2 * a + 0.700383064443688; b = b * a + 6.37396220353165; b = b * a + 33.912866078383; b = b * a + 112.079291497871; b = b * a + 221.213596169931; b = b * a + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * a + 1.75566716318264; b = b * a + 16.064177579207; b = b * a + 86.7807322029461; b = b * a + 296.564248779674; b = b * a + 637.333633378831; b = b * a + 793.826512519948; b = b * a + 440.413735824752;
      c /= b;
    } else { let b = a + 0.65; b = a + 4 / b; b = a + 3 / b; b = a + 2 / b; b = a + 1 / b; c = e / b / 2.506628274631; }
  }
  return x > 0 ? 1 - c : c;
}
// Normal quantile: Acklam's approximation polished with one Halley step against phi().
export function phiInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  let x;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  const e = phi(x) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
  return x - u / (1 + x * u / 2);
}
export const normSf2 = (z) => 2 * phi(-Math.abs(z)); // two-sided normal p

// log Γ(x), Lanczos (g = 7, n = 9), about 1e-15 relative.
const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgam(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgam(1 - x);
  x -= 1; let a = LG[0]; const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
// Regularised lower incomplete gamma P(a, x) (series below a + 1, continued fraction above).
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const gln = lgam(a);
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 0; n < 100000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  return 1 - gammaQcf(a, x, gln);
}
function gammaQcf(a, x, gln) {
  const FPMIN = 1e-300; let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let i = 1; i < 100000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (!Number.isFinite(x)) return 0;
  return x < a + 1 ? 1 - gammaP(a, x) : gammaQcf(a, x, lgam(a));
}
export const chi2Cdf = (x, df) => gammaP(df / 2, x / 2);
export const chi2Sf = (x, df) => (x <= 0 ? 1 : gammaQ(df / 2, x / 2));
// Noncentral chi-square CDF: Poisson(λ/2)-weighted mixture of central chi-squares, summed outwards from the mode.
export function ncx2Cdf(x, df, lambda) {
  if (x <= 0) return 0;
  if (lambda <= 0) return chi2Cdf(x, df);
  const m = lambda / 2, j0 = Math.floor(m);
  const logw = (j) => -m + j * Math.log(m) - lgam(j + 1);
  let s = 0;
  for (let j = j0; ; j++) { const w = Math.exp(logw(j)); s += w * gammaP(df / 2 + j, x / 2); if (w < 1e-17 && j > j0 + 5) break; if (j - j0 > 100000) break; }
  for (let j = j0 - 1; j >= 0; j--) { const w = Math.exp(logw(j)); s += w * gammaP(df / 2 + j, x / 2); if (w < 1e-17) break; }
  return Math.min(1, Math.max(0, s));
}
// The noncentrality λ at which P(χ²(df, λ) ≤ x) = p (decreasing in λ); 0 when even λ = 0 gives less than p.
export function ncx2Lambda(x, df, p) {
  if (ncx2Cdf(x, df, 0) < p) return 0;
  let lo = 0, hi = Math.max(10, x);
  while (ncx2Cdf(x, df, hi) > p) { lo = hi; hi *= 2; if (hi > 1e7) return hi; }
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (ncx2Cdf(x, df, mid) > p) lo = mid; else hi = mid; if (hi - lo < 1e-10 * Math.max(1, hi)) break; }
  return (lo + hi) / 2;
}
export const tSf2 = (t, df) => 2 * (1 - tCdf(Math.abs(t), df)); // two-sided t p
export const fSf = (f, d1, d2) => { if (!(f > 0)) return 1; const x = d2 / (d2 + d1 * f); return ibetaReg(x, d2 / 2, d1 / 2); };
// Regularised incomplete beta (continued fraction, Numerical Recipes), using lgam above for precision.
export function ibetaReg(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
  const cf = (aa, bb, xx) => {
    const FPMIN = 1e-300; const qab = aa + bb, qap = aa + 1, qam = aa - 1; let c = 1, d = 1 - qab * xx / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= 10000; m++) {
      const m2 = 2 * m; let an = m * (bb - m) * xx / ((qam + m2) * (aa + m2));
      d = 1 + an * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      an = -(aa + m) * (qab + m) * xx / ((aa + m2) * (qap + m2));
      d = 1 + an * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + an / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2) ? bt * cf(a, b, x) / a : 1 - bt * cf(b, a, 1 - x) / b;
}
// Two-sided t p-value with the precise incomplete beta (keeps small p accurate).
export const tP = (t, df) => ibetaReg(df / (df + t * t), df / 2, 0.5);
// t quantile by bisection on tP.
export function tQuant(conf, df) { const target = 1 - conf; let lo = 0, hi = 1000; for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (tP(mid, df) > target) lo = mid; else hi = mid; } return (lo + hi) / 2; }

// Bivariate normal upper probability P(X > h, Y > k) with correlation r (Genz 2004, after Drezner & Wesolowsky).
const GL = [
  [[0.1713244923791705, 0.3607615730481384, 0.4679139345726904], [0.9324695142031522, 0.6612093864662647, 0.238619186083197]],
  [[0.04717533638651177, 0.1069393259953183, 0.1600783285433464, 0.2031674267230659, 0.2334925365383547, 0.2491470458134029], [0.9815606342467191, 0.904117256370475, 0.769902674194305, 0.5873179542866171, 0.3678314989981802, 0.1252334085114692]],
  [[0.01761400713915212, 0.04060142980038694, 0.06267204833410906, 0.08327674157670475, 0.1019301198172404, 0.1181945319615184, 0.1316886384491766, 0.1420961093183821, 0.1491729864726037, 0.1527533871307259], [0.9931285991850949, 0.9639719272779138, 0.9122344282513259, 0.8391169718222188, 0.7463319064601508, 0.636053680726515, 0.5108670019508271, 0.3737060887154196, 0.2277858511416451, 0.07652652113349733]],
];
export function bvnUpper(dh, dk, r) {
  if (dh === Infinity || dk === Infinity) return 0;
  if (dh === -Infinity) return dk === -Infinity ? 1 : phi(-dk);
  if (dk === -Infinity) return phi(-dh);
  if (r === 0) return phi(-dh) * phi(-dk);
  const tp = 2 * Math.PI; let h = dh, k = dk, hk = h * k, bvn = 0;
  const [w0, x0] = Math.abs(r) < 0.3 ? GL[0] : Math.abs(r) < 0.75 ? GL[1] : GL[2];
  const w = [...w0, ...w0], x = [...x0.map((v) => 1 - v), ...x0.map((v) => 1 + v)];
  if (Math.abs(r) < 0.925) {
    const hs = (h * h + k * k) / 2, asr = Math.asin(r) / 2;
    for (let i = 0; i < x.length; i++) { const sn = Math.sin(asr * x[i]); bvn += w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn)); }
    bvn = bvn * asr / tp + phi(-h) * phi(-k);
  } else {
    if (r < 0) { k = -k; hk = -hk; }
    if (Math.abs(r) < 1) {
      const as = 1 - r * r; let a = Math.sqrt(as); const bs = (h - k) ** 2;
      let asr = -(bs / as + hk) / 2; const c = (4 - hk) / 8, d = (12 - hk) / 80;
      if (asr > -100) bvn = a * Math.exp(asr) * (1 - c * (bs - as) * (1 - d * bs) / 3 + c * d * as * as);
      if (hk > -100) { const b = Math.sqrt(bs), sp = Math.sqrt(tp) * phi(-b / a); bvn -= Math.exp(-hk / 2) * sp * b * (1 - c * bs * (1 - d * bs) / 3); }
      a /= 2; let s = 0;
      for (let i = 0; i < x.length; i++) {
        const xs = (a * x[i]) ** 2; asr = -(bs / xs + hk) / 2;
        if (asr > -100) { const sp = 1 + c * xs * (1 + 5 * d * xs), rs = Math.sqrt(1 - xs), ep = Math.exp(-(hk / 2) * xs / (1 + rs) ** 2) / rs; s += w[i] * Math.exp(asr) * (sp - ep); }
      }
      bvn = (a * s - bvn) / tp;
    }
    if (r > 0) bvn += phi(-Math.max(h, k));
    else if (h >= k) bvn = -bvn;
    else { const L = h < 0 ? phi(k) - phi(h) : phi(-h) - phi(-k); bvn = L - bvn; }
  }
  return Math.max(0, Math.min(1, bvn));
}
// Lower CDF P(X ≤ h, Y ≤ k).
export const bvnCdf = (h, k, r) => bvnUpper(-h, -k, r);

// ── Random numbers ──
export { rng };
export function normalRng(seed) {
  const u = rng(seed); let spare = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let a = 0; while (a <= 1e-300) a = u();
    const b = u(), m = Math.sqrt(-2 * Math.log(a));
    spare = m * Math.sin(2 * Math.PI * b); return m * Math.cos(2 * Math.PI * b);
  };
}

// ── Holm step-down adjustment ──
export function holm(ps) {
  const m = ps.length, idx = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]), out = new Array(m);
  let run = 0;
  idx.forEach(([p, i], r) => { run = Math.max(run, Math.min(1, (m - r) * p)); out[i] = run; });
  return out;
}

// ── Box-constrained quasi-Newton minimiser (projected BFGS with Armijo backtracking) ──
// f(x) returns { f, g }. Bounds lo/hi per coordinate (±Infinity allowed). Stops when the projected gradient is tiny.
export function minimize(fg, x0, { lo = null, hi = null, maxIter = 500, gtol = 1e-9, ftol = 1e-15 } = {}) {
  const n = x0.length;
  const L = lo || new Array(n).fill(-Infinity), U = hi || new Array(n).fill(Infinity);
  const proj = (x) => x.map((v, i) => Math.min(U[i], Math.max(L[i], v)));
  let x = proj(x0), cur = fg(x), H = eye(n), iter = 0, converged = false;
  const pgNorm = (x1, g) => Math.max(...x1.map((v, i) => Math.abs(Math.min(U[i], Math.max(L[i], v - g[i])) - v)));
  for (; iter < maxIter; iter++) {
    if (pgNorm(x, cur.g) < gtol) { converged = true; break; }
    // Free variables: not at a bound with the gradient pushing outwards.
    const free = x.map((v, i) => !((v <= L[i] && cur.g[i] > 0) || (v >= U[i] && cur.g[i] < 0)));
    let d = new Array(n).fill(0);
    for (let i = 0; i < n; i++) if (free[i]) { let s = 0; for (let j = 0; j < n; j++) if (free[j]) s -= H[i][j] * cur.g[j]; d[i] = s; }
    if (dot(d, cur.g) >= 0) { H = eye(n); d = cur.g.map((g, i) => (free[i] ? -g : 0)); }
    let t = 1, next = null, xn = null;
    for (let ls = 0; ls < 60; ls++) {
      xn = proj(x.map((v, i) => v + t * d[i]));
      next = fg(xn);
      const dec = dot(cur.g, xn.map((v, i) => v - x[i]));
      if (Number.isFinite(next.f) && next.f <= cur.f + 1e-4 * dec) break;
      t /= 2; next = null;
    }
    if (!next) { converged = pgNorm(x, cur.g) < Math.sqrt(gtol); break; }
    const s = xn.map((v, i) => v - x[i]), yv = next.g.map((g, i) => g - cur.g[i]), sy = dot(s, yv);
    const fprev = cur.f; x = xn; cur = next;
    if (sy > 1e-12) {
      const Hy = matVec(H, yv), yHy = dot(yv, Hy), rho = 1 / sy;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) H[i][j] += (1 + yHy * rho) * rho * s[i] * s[j] - rho * (Hy[i] * s[j] + s[i] * Hy[j]);
    }
    if (Math.abs(fprev - cur.f) <= ftol * Math.max(1, Math.abs(cur.f)) && pgNorm(x, cur.g) < Math.sqrt(gtol)) { converged = true; break; }
  }
  return { x, f: cur.f, g: cur.g, iter, converged };
}

// ── Formatting helpers for the summaries ──
export const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'not available');
export const fp = (p) => (!Number.isFinite(p) ? 'not available' : p < 0.001 ? '< 0.001' : `= ${p.toFixed(3)}`);
export const fpct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const listAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
