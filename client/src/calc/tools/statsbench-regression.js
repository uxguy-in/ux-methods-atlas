// Regression workbench: multiple linear regression with diagnostics, binary logistic, ordinal (proportional odds)
// logistic, and Poisson / negative binomial (NB2) models for counts. Pure functions; checked against statsmodels
// (OLS, Logit, OrderedModel, GLM Poisson, NegativeBinomial) by `npm run check:statsbench`.
import {
  olsFit, inv, crossprod, crossvec, matVec, mean, sd, tCrit, tP2, zP2, fSf, chi2Sf, normInv, lgamma, digamma,
  f, pText, sorted, quantileSorted,
} from './statsbench-core.js';

const z95 = (conf) => normInv(1 - (1 - conf) / 2);
const logistic = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// ── Multiple linear regression ──
// OLS: b = (X'X)⁻¹X'y, SE from s²(X'X)⁻¹, t on n − p df. Standardised beta = b·sd(x)/sd(y).
// Diagnostics: leverage hᵢ = xᵢ'(X'X)⁻¹xᵢ, internally studentised residual rᵢ = eᵢ/(s√(1 − hᵢ)),
// Cook's D = rᵢ²hᵢ/(p(1 − hᵢ)), VIF_j = 1/(1 − R²_j) from regressing column j on the others.
export function fitLinear(X, y, names, conf = 0.95) {
  const fit = olsFit(X, y); if (!fit) return null;
  const { b, cov, fitted, resid, sse, df, s2, n, p } = fit;
  const tc = tCrit(conf, df), sy = sd(y), my = mean(y);
  const coefs = b.map((bj, j) => {
    const se = Math.sqrt(cov[j][j]), t = bj / se;
    const sx = j === 0 && names[0] === 'Intercept' ? NaN : sd(X.map((r) => r[j]));
    return { name: names[j], b: bj, se, t, p: tP2(t, df), lo: bj - tc * se, hi: bj + tc * se, beta: Number.isFinite(sx) ? bj * sx / sy : NaN };
  });
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const r2 = 1 - sse / sst, k = p - 1;
  const adjR2 = 1 - (1 - r2) * (n - 1) / df;
  const F = k > 0 ? ((sst - sse) / k) / s2 : NaN;
  const lev = X.map((r) => dot(r, matVec(fit.XtXi, r)));
  const s = Math.sqrt(s2);
  const stdResid = resid.map((e, i) => e / (s * Math.sqrt(1 - lev[i])));
  const cooks = stdResid.map((r, i) => (r * r * lev[i]) / (p * (1 - lev[i])));
  const vif = names.map((nm, j) => {
    if (j === 0 && nm === 'Intercept') return null;
    const others = X.map((r) => r.filter((_, c) => c !== j)), xj = X.map((r) => r[j]);
    const sub = olsFit(others, xj); if (!sub) return { name: nm, vif: Infinity };
    const m = mean(xj), tot = xj.reduce((a, v) => a + (v - m) ** 2, 0);
    return { name: nm, vif: 1 / (sub.sse / tot) };
  }).filter(Boolean);
  const ll = -n / 2 * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1);
  // Durbin-Watson for ordered data; Breusch-Pagan (Koenker studentised) for non-constant variance.
  let dw = 0; for (let i = 1; i < n; i++) dw += (resid[i] - resid[i - 1]) ** 2; dw /= sse;
  const e2 = resid.map((e) => e * e), bp = olsFit(X, e2);
  const me2 = mean(e2), bpR2 = bp ? 1 - bp.sse / e2.reduce((a, v) => a + (v - me2) ** 2, 0) : NaN;
  const bpStat = n * bpR2;
  return {
    model: 'linear', coefs, n, p, df, r2, adjR2, F, dfModel: k, pF: fSf(F, k, df), sigma: s, fitted, resid, leverage: lev, stdResid, cooks, vif,
    // AIC and BIC count the coefficients only (as statsmodels OLS; R's AIC adds 2 for σ).
    ll, aic: -2 * ll + 2 * p, bic: -2 * ll + Math.log(n) * p, dw, bp: { stat: bpStat, df: k, p: chi2Sf(bpStat, k) }, conf,
  };
}

// ── Newton-Raphson with a numerical Hessian of an analytic gradient, and step halving on the log-likelihood ──
function numHessian(grad, x) {
  const k = x.length, H = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let j = 0; j < k; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(x[j]));
    const xp = [...x], xm = [...x]; xp[j] += h; xm[j] -= h;
    const gp = grad(xp), gm = grad(xm);
    for (let i = 0; i < k; i++) H[i][j] = (gp[i] - gm[i]) / (2 * h);
  }
  for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) { const a = (H[i][j] + H[j][i]) / 2; H[i][j] = a; H[j][i] = a; }
  return H;
}
function newton(ll, grad, x0, maxIter = 200) {
  let x = [...x0], cur = ll(x), iter = 0, converged = false;
  for (; iter < maxIter; iter++) {
    const g = grad(x), H = numHessian(grad, x), Hi = inv(H.map((r) => r.map((v) => -v)));
    if (!Hi) break;
    const step = matVec(Hi, g);
    let t = 1, next, val;
    for (let h = 0; h < 40; h++) { next = x.map((v, i) => v + t * step[i]); val = ll(next); if (Number.isFinite(val) && val >= cur - 1e-12) break; t /= 2; }
    const change = Math.max(...step.map((s) => Math.abs(s * t)));
    x = next; const gain = val - cur; cur = val;
    if (change < 1e-10 || (Math.abs(gain) < 1e-13 && change < 1e-7)) { converged = true; break; }
  }
  return { x, ll: cur, iter, converged };
}

// ── Binary logistic regression (IRLS) ──
export function fitLogistic(X, y, names, conf = 0.95) {
  const n = X.length, p = X[0].length;
  let b = new Array(p).fill(0), it = 0, converged = false, mu = [];
  for (; it < 100; it++) {
    const eta = X.map((r) => dot(r, b)); mu = eta.map(logistic);
    const w = mu.map((m) => Math.max(m * (1 - m), 1e-12));
    const z = eta.map((e, i) => e + (y[i] - mu[i]) / w[i]);
    const A = inv(crossprod(X, w)); if (!A) break;
    const nb = matVec(A, crossvec(X, z, w));
    const ch = Math.max(...nb.map((v, i) => Math.abs(v - b[i]))); b = nb;
    if (ch < 1e-10) { converged = true; break; }
    if (b.some((v) => Math.abs(v) > 40)) break; // perfect separation: coefficients run off to infinity
  }
  const eta = X.map((r) => dot(r, b)); mu = eta.map(logistic);
  const w = mu.map((m) => Math.max(m * (1 - m), 1e-12));
  const cov = inv(crossprod(X, w)) || X[0].map(() => X[0].map(() => NaN));
  const zc = z95(conf);
  const coefs = b.map((bj, j) => {
    const se = Math.sqrt(cov[j][j]), z = bj / se;
    return { name: names[j], b: bj, se, z, p: zP2(z), lo: bj - zc * se, hi: bj + zc * se, or: Math.exp(bj), orLo: Math.exp(bj - zc * se), orHi: Math.exp(bj + zc * se) };
  });
  const clamp = (m) => Math.min(1 - 1e-15, Math.max(1e-15, m));
  const ll = y.reduce((s, v, i) => s + (v ? Math.log(clamp(mu[i])) : Math.log(1 - clamp(mu[i]))), 0);
  const ybar = mean(y), ll0 = n * (ybar * Math.log(ybar) + (1 - ybar) * Math.log(1 - ybar));
  const lr = 2 * (ll - ll0), k = p - 1;
  const coxSnell = 1 - Math.exp((2 * (ll0 - ll)) / n), nagelkerke = coxSnell / (1 - Math.exp((2 * ll0) / n));
  const table = { tp: 0, fp: 0, tn: 0, fn: 0 };
  y.forEach((v, i) => { const pr = mu[i] >= 0.5 ? 1 : 0; if (pr && v) table.tp++; else if (pr) table.fp++; else if (v) table.fn++; else table.tn++; });
  const separation = !converged || b.some((v) => Math.abs(v) > 15) || coefs.some((c) => c.se > 1e3);
  return {
    model: 'logistic', coefs, n, p, ll, ll0, lr, dfModel: k, pLR: chi2Sf(lr, k), mcfadden: 1 - ll / ll0, coxSnell, nagelkerke,
    aic: -2 * ll + 2 * p, bic: -2 * ll + Math.log(n) * p, table, accuracy: (table.tp + table.tn) / n,
    sensitivity: table.tp / (table.tp + table.fn), specificity: table.tn / (table.tn + table.fp), base: Math.max(ybar, 1 - ybar), events: y.filter(Boolean).length,
    fitted: mu, iterations: it + 1, separation, conf,
  };
}

// ── Ordinal logistic regression (proportional odds) ──
// P(Y ≤ j | x) = F(θ_j − x'β) with F logistic, as statsmodels OrderedModel and R's MASS::polr: a positive β moves
// people towards higher categories. X has no intercept column. y holds category indices 0..K−1.
export function fitOrdinal(X, y, names, K, conf = 0.95) {
  const n = X.length, p = X[0]?.length || 0;
  const dens = (z) => { const F = logistic(z); return F * (1 - F); };
  const cdf = (z) => (z === Infinity ? 1 : z === -Infinity ? 0 : logistic(z));
  const pdf = (z) => (Math.abs(z) === Infinity ? 0 : dens(z));
  // Direct parameters: [θ_0..θ_{K−2}, β].
  const llDirect = (par) => {
    const th = par.slice(0, K - 1), be = par.slice(K - 1); let s = 0;
    for (let i = 0; i < K - 2; i++) if (!(th[i + 1] > th[i])) return -Infinity;
    for (let i = 0; i < n; i++) {
      const eta = p ? dot(X[i], be) : 0, k = y[i];
      const a = k < K - 1 ? th[k] - eta : Infinity, b = k > 0 ? th[k - 1] - eta : -Infinity;
      const pr = cdf(a) - cdf(b); s += Math.log(Math.max(pr, 1e-300));
    }
    return s;
  };
  const gradDirect = (par) => {
    const th = par.slice(0, K - 1), be = par.slice(K - 1), g = new Array(par.length).fill(0);
    for (let i = 0; i < n; i++) {
      const eta = p ? dot(X[i], be) : 0, k = y[i];
      const a = k < K - 1 ? th[k] - eta : Infinity, b = k > 0 ? th[k - 1] - eta : -Infinity;
      const pr = Math.max(cdf(a) - cdf(b), 1e-300), fa = pdf(a), fb = pdf(b);
      if (k < K - 1) g[k] += fa / pr;
      if (k > 0) g[k - 1] -= fb / pr;
      for (let j = 0; j < p; j++) g[K - 1 + j] -= X[i][j] * (fa - fb) / pr;
    }
    return g;
  };
  // Optimise in θ_0, log increments (keeps the cut points ordered), then take the Hessian in the direct parameters.
  const toDirect = (c) => { const d = [...c]; for (let j = 1; j < K - 1; j++) d[j] = d[j - 1] + Math.exp(c[j]); return d; };
  const llC = (c) => llDirect(toDirect(c));
  const gradC = (c) => {
    const d = toDirect(c), g = gradDirect(d), out = [...g];
    for (let j = K - 2; j >= 0; j--) { let tail = 0; for (let m = j; m < K - 1; m++) tail += g[m]; out[j] = j === 0 ? tail : Math.exp(c[j]) * tail; }
    return out;
  };
  const counts = new Array(K).fill(0); y.forEach((k) => counts[k]++);
  if (counts.some((c) => c === 0)) return { error: 'empty-category', counts };
  let cum = 0; const th0 = [];
  for (let j = 0; j < K - 1; j++) { cum += counts[j]; const q = cum / n; th0.push(Math.log(q / (1 - q))); }
  const c0 = th0.map((t, j) => (j === 0 ? t : Math.log(Math.max(1e-6, t - th0[j - 1]))));
  const opt = newton(llC, gradC, [...c0, ...new Array(p).fill(0)]);
  const par = toDirect(opt.x);
  const H = numHessian(gradDirect, par), cov = inv(H.map((r) => r.map((v) => -v)));
  if (!cov) return null;
  const zc = z95(conf);
  const se = par.map((_, j) => Math.sqrt(cov[j][j]));
  const coefs = names.map((nm, j) => {
    const b = par[K - 1 + j], s = se[K - 1 + j], z = b / s;
    return { name: nm, b, se: s, z, p: zP2(z), lo: b - zc * s, hi: b + zc * s, or: Math.exp(b), orLo: Math.exp(b - zc * s), orHi: Math.exp(b + zc * s) };
  });
  const cuts = par.slice(0, K - 1).map((t, j) => ({ t, se: se[j] }));
  const ll0 = counts.reduce((s, c) => s + c * Math.log(c / n), 0);
  const ll = opt.ll, lr = 2 * (ll - ll0);
  // Predicted category = the most probable one; compared with the observed category.
  let hits = 0;
  const probs = X.map((r, i) => {
    const eta = p ? dot(r, par.slice(K - 1)) : 0;
    const pr = []; let prev = 0;
    for (let k = 0; k < K; k++) { const c = k < K - 1 ? cdf(par[k] - eta) : 1; pr.push(c - prev); prev = c; }
    if (pr.indexOf(Math.max(...pr)) === y[i]) hits++;
    return pr;
  });
  return {
    model: 'ordinal', coefs, cuts, n, p, K, counts, ll, ll0, lr, dfModel: p, pLR: chi2Sf(lr, p), mcfadden: 1 - ll / ll0,
    aic: -2 * ll + 2 * (p + K - 1), bic: -2 * ll + Math.log(n) * (p + K - 1), accuracy: hits / n, base: Math.max(...counts) / n, probs,
    converged: opt.converged, conf,
  };
}

// ── Count models: Poisson (IRLS) and negative binomial NB2 (Var = μ + αμ²) by maximum likelihood ──
function poissonIRLS(X, y, off, wfun = (m) => m, start) {
  const p = X[0].length;
  let b = start ? [...start] : new Array(p).fill(0);
  if (!start) b[0] = Math.log(Math.max(mean(y), 1e-8)) - mean(off);
  let it = 0, converged = false;
  for (; it < 200; it++) {
    const eta = X.map((r, i) => dot(r, b) + off[i]), mu = eta.map(Math.exp);
    const w = mu.map(wfun), z = eta.map((e, i) => e - off[i] + (y[i] - mu[i]) / mu[i]);
    const A = inv(crossprod(X, w)); if (!A) return null;
    const nb = matVec(A, crossvec(X, z, w));
    const ch = Math.max(...nb.map((v, i) => Math.abs(v - b[i]))); b = nb;
    if (!b.every(Number.isFinite)) return null;
    if (ch < 1e-11) { converged = true; break; }
  }
  return { b, converged, iter: it + 1 };
}
const lfact = (y) => lgamma(y + 1);
export function fitCount(X, y, names, { family = 'poisson', offset = null, conf = 0.95 } = {}) {
  const n = X.length, p = X[0].length, off = offset || new Array(n).fill(0), zc = z95(conf);
  const pois = poissonIRLS(X, y, off); if (!pois) return null;
  const muOf = (b) => X.map((r, i) => Math.exp(dot(r, b) + off[i]));
  const llPois = (b) => muOf(b).reduce((s, m, i) => s + y[i] * Math.log(m) - m - lfact(y[i]), 0);
  const muP = muOf(pois.b);
  const pearson = y.reduce((s, v, i) => s + (v - muP[i]) ** 2 / muP[i], 0);
  const deviance = 2 * y.reduce((s, v, i) => s + (v > 0 ? v * Math.log(v / muP[i]) : 0) - (v - muP[i]), 0);
  const dispersion = pearson / (n - p);
  // Intercept-only model: with an offset the rate is Σy / Σ exposure.
  const b0 = Math.log(y.reduce((a, v) => a + v, 0) / off.reduce((a, o) => a + Math.exp(o), 0));
  const llPois0 = y.reduce((s, v, i) => { const m = Math.exp(b0 + off[i]); return s + v * Math.log(m) - m - lfact(v); }, 0);
  const llPoisFull = llPois(pois.b);
  let res;
  if (family === 'poisson') {
    const cov = inv(crossprod(X, muP)); if (!cov) return null;
    const coefs = pois.b.map((b, j) => { const se = Math.sqrt(cov[j][j]), z = b / se; return { name: names[j], b, se, z, p: zP2(z), lo: b - zc * se, hi: b + zc * se, irr: Math.exp(b), irrLo: Math.exp(b - zc * se), irrHi: Math.exp(b + zc * se) }; });
    res = { coefs, ll: llPoisFull, ll0: llPois0, k: p, fitted: muP, converged: pois.converged };
  } else {
    // NB2 log-likelihood in (β, α), r = 1/α: Σ lnΓ(y + r) − lnΓ(r) − ln y! + r ln(r/(r + μ)) + y ln(μ/(r + μ)).
    const llNB = (par) => {
      const b = par.slice(0, p), a = par[p]; if (!(a > 0)) return -Infinity;
      const r = 1 / a, mu = muOf(b);
      let s = 0; for (let i = 0; i < n; i++) s += lgamma(y[i] + r) - lgamma(r) - lfact(y[i]) + r * Math.log(r / (r + mu[i])) + y[i] * Math.log(mu[i] / (r + mu[i]));
      return s;
    };
    const gradNB = (par) => {
      const b = par.slice(0, p), a = par[p], r = 1 / a, mu = muOf(b), g = new Array(p + 1).fill(0);
      let gr = 0;
      for (let i = 0; i < n; i++) {
        const c = (y[i] - mu[i]) / (1 + a * mu[i]);
        for (let j = 0; j < p; j++) g[j] += X[i][j] * c;
        gr += digamma(y[i] + r) - digamma(r) + Math.log(r) - Math.log(r + mu[i]) + (mu[i] - y[i]) / (r + mu[i]);
      }
      g[p] = -gr / (a * a);
      return g;
    };
    // Optimise over (β, ln α) for stability, starting from the Poisson fit and a moment estimate of α.
    const a0 = Math.max(0.05, (y.reduce((s, v, i) => s + ((v - muP[i]) ** 2 - muP[i]) / (muP[i] ** 2), 0)) / n);
    const llL = (q) => llNB([...q.slice(0, p), Math.exp(q[p])]);
    const grL = (q) => { const a = Math.exp(q[p]), g = gradNB([...q.slice(0, p), a]); g[p] *= a; return g; };
    const opt = newton(llL, grL, [...pois.b, Math.log(a0)]);
    const par = [...opt.x.slice(0, p), Math.exp(opt.x[p])];
    const H = numHessian(gradNB, par), cov = inv(H.map((r) => r.map((v) => -v)));
    if (!cov) return null;
    const coefs = par.slice(0, p).map((b, j) => { const se = Math.sqrt(cov[j][j]), z = b / se; return { name: names[j], b, se, z, p: zP2(z), lo: b - zc * se, hi: b + zc * se, irr: Math.exp(b), irrLo: Math.exp(b - zc * se), irrHi: Math.exp(b + zc * se) }; });
    const alpha = { est: par[p], se: Math.sqrt(cov[p][p]) };
    // Null NB model (intercept and α) for the pseudo-R².
    const X0 = X.map(() => [1]);
    const ll0f = (q) => { const a = Math.exp(q[1]), r = 1 / a; let s = 0; for (let i = 0; i < n; i++) { const m = Math.exp(q[0] + off[i]); s += lgamma(y[i] + r) - lgamma(r) - lfact(y[i]) + r * Math.log(r / (r + m)) + y[i] * Math.log(m / (r + m)); } return s; };
    const g0 = (q) => { const a = Math.exp(q[1]), r = 1 / a; let gb = 0, gr = 0; for (let i = 0; i < n; i++) { const m = Math.exp(q[0] + off[i]); gb += (y[i] - m) / (1 + a * m); gr += digamma(y[i] + r) - digamma(r) + Math.log(r) - Math.log(r + m) + (m - y[i]) / (r + m); } return [gb, -gr / a]; };
    const null0 = newton(ll0f, g0, [b0, Math.log(a0)]);
    const lrAlpha = Math.max(0, 2 * (opt.ll - llPoisFull));
    res = { coefs, ll: opt.ll, ll0: null0.ll, k: p + 1, fitted: muOf(par.slice(0, p)), alpha, lrAlpha, pAlpha: 0.5 * chi2Sf(lrAlpha, 1), converged: opt.converged, X0 };
  }
  const lr = 2 * (res.ll - res.ll0);
  return {
    model: family === 'poisson' ? 'poisson' : 'negbin', ...res, n, p, deviance, pearson, dispersion, dfResid: n - p,
    lr, dfModel: p - 1, pLR: chi2Sf(lr, p - 1), mcfadden: 1 - res.ll / res.ll0, aic: -2 * res.ll + 2 * res.k, bic: -2 * res.ll + Math.log(n) * res.k,
    zeros: y.filter((v) => v === 0).length, expectedZeros: res.fitted.reduce((s, m) => s + (family === 'poisson' ? Math.exp(-m) : (1 + res.alpha.est * m) ** (-1 / res.alpha.est)), 0),
    meanY: mean(y), varY: sd(y) ** 2, conf,
  };
}

// Normal QQ points for residuals: theoretical quantiles at Filliben's order-statistic medians (as scipy.stats.probplot).
export function qqPoints(vals) {
  const s = sorted(vals), n = s.length;
  const m = Array.from({ length: n }, (_, i) => (i === 0 ? 1 - 0.5 ** (1 / n) : i === n - 1 ? 0.5 ** (1 / n) : (i + 1 - 0.3175) / (n + 0.365)));
  return Array.from(s, (v, i) => [normInv(m[i]), v]);
}

// ── Plain-language summary ──
// Confidence rule (linear): high when n ≥ 20 per predictor column, the overall F test has p < .01, no VIF above 5 and
// fewer than 5% of points have Cook's D above 4/n; medium when n ≥ 10 per column and p < .05; otherwise low.
// Logistic: events per variable (EPV, the smaller outcome group per predictor column) ≥ 20 and LR p < .01 for high;
// EPV ≥ 10 and p < .05 for medium (Peduzzi et al. 1996). Ordinal and count models use the same rule on n per column.
export function regressionSummary(r, { outcome, eventLabel, levels } = {}) {
  const conf = Math.round(r.conf * 100);
  const preds = r.coefs.filter((c) => c.name !== 'Intercept');
  const sigP = preds.filter((c) => c.p < 0.05);
  const k = Math.max(1, preds.length);
  const caveats = [], next = [], meaning = [];
  let headline, confidence, confidenceNote, report;
  const listSig = (fmt) => (sigP.length ? sigP.slice(0, 4).map(fmt).join('; ') : 'none of the predictors');
  if (r.model === 'linear') {
    const flags = r.cooks.filter((d) => d > 4 / r.n).length, maxVif = Math.max(0, ...r.vif.map((v) => v.vif));
    const perCol = r.n / k;
    confidence = perCol >= 20 && r.pF < 0.01 && maxVif <= 5 && flags / r.n < 0.05 ? 'high' : perCol >= 10 && r.pF < 0.05 ? 'medium' : 'low';
    confidenceNote = `Rule: strong when there are at least 20 people per predictor column (here ${f(perCol, 1)}), the overall F test has p < .01 (here ${pText(r.pF)}), no VIF is above 5 (largest ${f(maxVif, 2)}) and fewer than 5% of people have Cook's distance above 4/n (here ${flags}); some evidence with at least 10 per column and p < .05; otherwise weak.`;
    headline = `The predictors explain ${f(r.r2 * 100, 1)}% of the variation in ${outcome} (adjusted R² ${f(r.adjR2, 3)}, F(${r.dfModel}, ${r.df}) = ${f(r.F, 2)}, ${pText(r.pF)}).`;
    meaning.push(`Predictors with a clear link (p < .05), holding the others constant: ${listSig((c) => `${c.name} ${c.b >= 0 ? '+' : ''}${f(c.b, 3)} per unit (${conf}% CI ${f(c.lo, 3)} to ${f(c.hi, 3)})`)}.`);
    const top = [...preds].filter((c) => Number.isFinite(c.beta)).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))[0];
    if (top) meaning.push(`The largest standardised beta is ${top.name} (${f(top.beta, 2)}): a one-SD change in it goes with ${f(Math.abs(top.beta), 2)} SD ${top.beta >= 0 ? 'higher' : 'lower'} ${outcome}. Betas for 0/1 dummy columns are hard to compare with numeric ones.`);
    meaning.push(`Typical prediction error (residual SD) is ${f(r.sigma, 3)} in the units of ${outcome}.`);
    if (maxVif > 5) caveats.push(`Some predictors overlap heavily (VIF up to ${f(maxVif, 1)}): their separate coefficients are unstable even if the model predicts well.`);
    if (r.bp.p < 0.05) caveats.push(`The spread of residuals changes with the fitted value (Breusch-Pagan ${pText(r.bp.p)}), so standard errors may be off; try a log transform of ${outcome} or report robust intervals.`);
    if (flags) caveats.push(`${flags} ${flags === 1 ? 'person has' : 'people have'} Cook's distance above 4/n = ${f(4 / r.n, 3)}; check them before trusting the coefficients.`);
    caveats.push('A coefficient is an association adjusted for the other predictors in this model, not the effect of changing that thing for a user.');
    report = `A multiple linear regression of ${outcome} on ${preds.length} predictor column${preds.length === 1 ? '' : 's'} (n = ${r.n}) explained ${f(r.r2 * 100, 1)}% of the variance (adjusted R² = ${f(r.adjR2, 3)}, F(${r.dfModel}, ${r.df}) = ${f(r.F, 2)}, ${pText(r.pF)}).${sigP.length ? ` Significant predictors: ${sigP.slice(0, 4).map((c) => `${c.name} (b = ${f(c.b, 3)}, ${conf}% CI ${f(c.lo, 3)} to ${f(c.hi, 3)}, ${pText(c.p)})`).join(', ')}.` : ''}`;
  } else if (r.model === 'logistic') {
    const minority = Math.min(r.events, r.n - r.events), epv = minority / k;
    confidence = r.separation ? 'low' : epv >= 20 && r.pLR < 0.01 ? 'high' : epv >= 10 && r.pLR < 0.05 ? 'medium' : 'low';
    confidenceNote = `Rule: strong when there are at least 20 people in the smaller outcome group per predictor column (events per variable, Peduzzi et al. 1996; here ${f(epv, 1)}) and the likelihood-ratio test has p < .01 (here ${pText(r.pLR)}); some evidence with at least 10 per column and p < .05; otherwise weak, and always weak when the fit separates the outcomes perfectly.`;
    headline = `The model predicts ${outcome} = ${eventLabel} better than chance (likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}), with McFadden pseudo-R² ${f(r.mcfadden, 3)}.`;
    if (r.pLR >= 0.05) headline = `The predictors do not reliably predict ${outcome} = ${eventLabel} (likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}).`;
    meaning.push(`Odds ratios above 1 raise the odds of ${eventLabel}: ${listSig((c) => `${c.name} OR ${f(c.or, 2)} (${conf}% CI ${f(c.orLo, 2)} to ${f(c.orHi, 2)})`)}.`);
    meaning.push(`At a 0.5 cut-off it classifies ${f(r.accuracy * 100, 1)}% of people correctly, against ${f(r.base * 100, 1)}% by always guessing the more common outcome (sensitivity ${f(r.sensitivity * 100, 0)}%, specificity ${f(r.specificity * 100, 0)}%).`);
    meaning.push(`McFadden values of 0.2 to 0.4 already mean a good fit (McFadden 1979); they run much lower than linear R².`);
    if (r.separation) caveats.push('Some coefficients are extremely large or did not converge: a predictor (or combination) separates the outcomes perfectly, so its odds ratio is not estimable. Merge sparse categories or drop that predictor.');
    caveats.push('An odds ratio is not a risk ratio: when the outcome is common (over about 10%), an OR of 2 means much less than "twice as likely".');
    if (epv < 10) caveats.push(`Only ${f(epv, 1)} events per predictor column: coefficients are biased away from zero and unstable. Use fewer predictors.`);
    report = `A binary logistic regression of ${outcome} (${eventLabel} vs not; n = ${r.n}, ${r.events} events) was significant overall, χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}, McFadden R² = ${f(r.mcfadden, 3)}, Nagelkerke R² = ${f(r.nagelkerke, 3)}.${sigP.length ? ` ${sigP.slice(0, 4).map((c) => `${c.name}: OR = ${f(c.or, 2)}, ${conf}% CI ${f(c.orLo, 2)} to ${f(c.orHi, 2)}`).join('; ')}.` : ''}`;
    if (r.pLR >= 0.05) report = report.replace('was significant overall', 'was not significant overall');
  } else {
    const perCol = r.n / k;
    const base = r.model === 'ordinal' ? 'higher categories' : 'the count';
    confidence = perCol >= 20 && r.pLR < 0.01 ? 'high' : perCol >= 10 && r.pLR < 0.05 ? 'medium' : 'low';
    if (r.model === 'poisson' && r.dispersion > 1.5) confidence = 'low';
    confidenceNote = `Rule: strong when there are at least 20 people per predictor column (here ${f(perCol, 1)}) and the likelihood-ratio test has p < .01 (here ${pText(r.pLR)}); some evidence with at least 10 per column and p < .05; otherwise weak${r.model === 'poisson' ? ', and always weak for a Poisson model with dispersion above 1.5' : ''}.`;
    if (r.model === 'ordinal') {
      headline = `The predictors shift people across the ${levels.length} levels of ${outcome} (likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}; McFadden pseudo-R² ${f(r.mcfadden, 3)}).`;
      if (r.pLR >= 0.05) headline = `The predictors do not reliably shift ${outcome} (likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}).`;
      meaning.push(`Odds ratios above 1 mean higher ${outcome} (towards "${levels[levels.length - 1]}"): ${listSig((c) => `${c.name} OR ${f(c.or, 2)} (${conf}% CI ${f(c.orLo, 2)} to ${f(c.orHi, 2)})`)}.`);
      meaning.push(`The same odds ratio applies at every cut point (for example "${levels[0]}" vs above, and "${levels[levels.length - 2]}" or below vs "${levels[levels.length - 1]}"): that is the proportional-odds assumption.`);
      caveats.push('Check the proportional-odds assumption: fit separate binary logistic models at each cut point and see whether the odds ratios are similar.');
    } else {
      const which = r.model === 'poisson' ? 'Poisson' : 'negative binomial';
      headline = `The ${which} model links the predictors to ${outcome} (likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}).`;
      if (r.pLR >= 0.05) headline = `The predictors do not reliably change ${outcome} (${which} likelihood ratio χ²(${r.dfModel}) = ${f(r.lr, 2)}, ${pText(r.pLR)}).`;
      meaning.push(`Incidence rate ratios multiply the expected count: ${listSig((c) => `${c.name} IRR ${f(c.irr, 2)} (${conf}% CI ${f(c.irrLo, 2)} to ${f(c.irrHi, 2)})`)}.`);
      meaning.push(`Mean ${outcome} is ${f(r.meanY, 2)} with variance ${f(r.varY, 2)}; Poisson dispersion (Pearson χ²/df) is ${f(r.dispersion, 2)}${r.model === 'negbin' ? `, and the negative binomial α is ${f(r.alpha.est, 3)} (test of α = 0: ${pText(r.pAlpha)})` : ''}.`);
      if (r.model === 'poisson' && r.dispersion > 1.5) caveats.push(`The counts vary ${f(r.dispersion, 1)} times more than Poisson allows, so these standard errors are too small. Switch to negative binomial.`);
      if (r.zeros > 1.5 * r.expectedZeros && r.zeros >= 5) caveats.push(`There are ${r.zeros} zeros where the model expects about ${f(r.expectedZeros, 0)}: a zero-inflated model may fit better.`);
    }
    caveats.push(`${base === 'the count' ? 'Rate ratios' : 'Odds ratios'} describe associations in these data, not what would happen if you changed a predictor.`);
    report = `${headline.replace(/\.$/, '')} (n = ${r.n}).${sigP.length ? ` ${sigP.slice(0, 4).map((c) => `${c.name}: ${r.model === 'ordinal' ? 'OR' : 'IRR'} = ${f(r.model === 'ordinal' ? c.or : c.irr, 2)}, ${conf}% CI ${f(r.model === 'ordinal' ? c.orLo : c.irrLo, 2)} to ${f(r.model === 'ordinal' ? c.orHi : c.irrHi, 2)}`).join('; ')}.` : ''}`;
  }
  next.push(r.model === 'linear' ? 'Look at the residual and QQ plots: a curve or funnel shape means the model is missing something.' : 'Report odds or rate ratios with their intervals, not only p-values.');
  if (sigP.length) next.push('Confirm the strongest predictors on a fresh sample or with a planned experiment before acting on them.');
  next.push('For which predictors matter most, try the [key driver analysis](/calculators/key-drivers); for a mediator or moderator, the [moderation and mediation](/calculators/mediation) tool.');
  return { headline, meaning: meaning.slice(0, 5), confidence, confidenceNote, caveats: caveats.slice(0, 3), next: next.slice(0, 3), report };
}

export const quartiles = (xs) => { const s = sorted(xs); return [0.25, 0.5, 0.75].map((q) => quantileSorted(s, q)); };
