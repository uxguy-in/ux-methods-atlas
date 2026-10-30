// Adoption models: the SIR epidemic model for viral spread and the Bass diffusion model fitted to observed adoption
// counts by nonlinear least squares, with peak timing and projections. Pure functions.
import { lines, cells, toNum, normalRng, quantile, invert, solveLinear, fmt, pctS, plural } from './sensors-core.js';

// ── SIR: S' = −βSI/N, I' = βSI/N − γI, R' = γI, integrated with classical 4th-order Runge-Kutta (step dt days).
export function sir({ N, I0, R0: Rinit = 0, beta, gamma, days, dt = 0.02 }) {
  let S = N - I0 - Rinit, I = I0, R = Rinit;
  const f = (s, i) => [-beta * s * i / N, beta * s * i / N - gamma * i];
  const out = [{ t: 0, S, I, R }];
  let peakI = I, peakT = 0;
  const steps = Math.round(1 / dt);
  for (let d = 1; d <= days; d++) {
    for (let k = 0; k < steps; k++) {
      const [a1, b1] = f(S, I), [a2, b2] = f(S + dt / 2 * a1, I + dt / 2 * b1), [a3, b3] = f(S + dt / 2 * a2, I + dt / 2 * b2), [a4, b4] = f(S + dt * a3, I + dt * b3);
      const dS = dt / 6 * (a1 + 2 * a2 + 2 * a3 + a4), dI = dt / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
      S += dS; I += dI; R = N - S - I;
      if (I > peakI) { peakI = I; peakT = d - 1 + (k + 1) * dt; }
    }
    out.push({ t: d, S, I, R });
  }
  return { series: out, peakI, peakT, R0: beta / gamma, beta, gamma, final: out[out.length - 1] };
}
// Final size of an SIR epidemic started by a tiny seed: z = 1 − exp(−R0·z) (Kermack and McKendrick 1927).
export function finalSize(R0) {
  if (R0 <= 1) return 0;
  let z = 0.9;
  for (let i = 0; i < 100; i++) { const g = z - 1 + Math.exp(-R0 * z), dg = 1 - R0 * Math.exp(-R0 * z); const nz = z - g / dg; if (Math.abs(nz - z) < 1e-15) { z = nz; break; } z = nz; }
  return z;
}

// ── Bass (1969): F(t) = (1 − e^{−(p+q)t}) / (1 + (q/p) e^{−(p+q)t}); adopters in period t: m[F(t) − F(t − 1)].
export const bassF = (t, p, q) => (t <= 0 ? 0 : (1 - Math.exp(-(p + q) * t)) / (1 + (q / p) * Math.exp(-(p + q) * t)));
export const bassNew = (t, [p, q, m]) => m * (bassF(t, p, q) - bassF(t - 1, p, q));

// "period, new adopters" or "period, cumulative adopters" per line (a header row is skipped).
export function parseCounts(text, cumulative = false) {
  const rows = [], errors = [];
  lines(text).forEach((l, i) => {
    const c = cells(l); const t = toNum(c[0]), v = toNum(c[1]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) { if (i > 0) errors.push(`Line ${i + 1}: use "period, adopters"`); return; }
    if (v < 0) { errors.push(`Line ${i + 1}: adopters cannot be negative`); return; }
    rows.push({ t, v });
  });
  rows.sort((a, b) => a.t - b.t);
  if (cumulative) for (let i = rows.length - 1; i >= 0; i--) rows[i] = { t: rows[i].t, v: rows[i].v - (i ? rows[i - 1].v : 0) };
  if (rows.some((r) => r.v < 0)) errors.push('Cumulative counts must not go down.');
  return { rows, errors };
}

// Starting values from the discrete Bass regression n_t = a + b·N_{t−1} + c·N_{t−1}² (Bass 1969).
export function bassStart(t, y) {
  let cum = 0; const X = [], Y = [];
  t.forEach((_, i) => { X.push([1, cum, cum * cum]); Y.push(y[i]); cum += y[i]; });
  const XtX = [0, 1, 2].map((a) => [0, 1, 2].map((b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const XtY = [0, 1, 2].map((a) => X.reduce((s, r, i) => s + r[a] * Y[i], 0));
  const sol = solveLinear(XtX, XtY);
  if (sol) {
    const [a, b, c] = sol;
    if (c < 0) { const m = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * c); if (m > cum && a > 0) return [a / m, -c * m, m]; }
  }
  return [0.01, 0.3, Math.max(cum * 2, 1)];
}

// Nonlinear least squares by Levenberg-Marquardt on Σ(n_t − m[F(t) − F(t−1)])² (Srinivasan and Mason 1986), with a
// central-difference Jacobian; standard errors from s²(JᵀJ)⁻¹, s² = SSE/(n − 3).
export function fitBass(t, y) {
  const n = t.length;
  let th = bassStart(t, y);
  const resid = (x) => t.map((ti, i) => y[i] - bassNew(ti, x));
  const sse = (x) => resid(x).reduce((s, r) => s + r * r, 0);
  const jac = (x) => t.map((ti) => x.map((_, k) => { const h = Math.abs(x[k]) * 1e-6 + 1e-10; const a = [...x], b = [...x]; a[k] += h; b[k] -= h; return (bassNew(ti, a) - bassNew(ti, b)) / (2 * h); }));
  let lambda = 1e-3, cur = sse(th), iter = 0;
  for (; iter < 500; iter++) {
    const J = jac(th), r = resid(th);
    const JtJ = [0, 1, 2].map((a) => [0, 1, 2].map((b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = [0, 1, 2].map((a) => J.reduce((s, row, i) => s + row[a] * r[i], 0));
    let stepped = false;
    for (let tries = 0; tries < 30; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
      const d = solveLinear(A, Jtr);
      if (!d) { lambda *= 10; continue; }
      const cand = th.map((v, k) => v + d[k]);
      if (cand.every((v) => v > 0)) {
        const s = sse(cand);
        if (s < cur) { const rel = (cur - s) / Math.max(cur, 1e-300); th = cand; cur = s; lambda = Math.max(lambda / 10, 1e-12); stepped = true; if (rel < 1e-14) iter = 1e9; break; }
      }
      lambda *= 10;
    }
    if (!stepped) break;
  }
  const J = jac(th), JtJ = [0, 1, 2].map((a) => [0, 1, 2].map((b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
  const s2 = cur / Math.max(1, n - 3), inv = invert(JtJ);
  const cov = inv ? inv.map((r) => r.map((v) => v * s2)) : null;
  const se = cov ? cov.map((r, i) => Math.sqrt(r[i])) : [NaN, NaN, NaN];
  const mean = y.reduce((a, b) => a + b, 0) / n, sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const [p, q, m] = th;
  return { p, q, m, se, cov, sse: cur, r2: 1 - cur / sst, rmse: Math.sqrt(cur / n), ...bassPeak(p, q, m) };
}
// Peak of the adoption rate: t* = ln(q/p)/(p+q), n(t*) = m(p+q)²/(4q), share adopted by then = 1/2 − p/(2q) (when q > p).
export const bassPeak = (p, q, m) => (q > p ? { tPeak: Math.log(q / p) / (p + q), peakRate: (m * (p + q) ** 2) / (4 * q), peakShare: 0.5 - p / (2 * q) } : { tPeak: 0, peakRate: m * p, peakShare: 0 });

// Approximate 95% range for projections: draw (p, q, m) from the normal approximation to the estimates (2,000 draws,
// seeded), keep draws with all three positive, and take the 2.5th and 97.5th percentiles.
export function bassBands(fit, horizon, draws = 2000, seed = 11) {
  if (!fit.cov) return null;
  const C = fit.cov, L = [[Math.sqrt(C[0][0]), 0, 0]];
  L[1] = [C[1][0] / L[0][0], 0, 0]; L[1][1] = Math.sqrt(Math.max(0, C[1][1] - L[1][0] ** 2));
  L[2] = [C[2][0] / L[0][0], 0, 0]; L[2][1] = L[1][1] ? (C[2][1] - L[2][0] * L[1][0]) / L[1][1] : 0; L[2][2] = Math.sqrt(Math.max(0, C[2][2] - L[2][0] ** 2 - L[2][1] ** 2));
  const z = normalRng(seed), mu = [fit.p, fit.q, fit.m];
  const cum = Array.from({ length: horizon + 1 }, () => []), per = Array.from({ length: horizon + 1 }, () => []), tp = [];
  for (let d = 0; d < draws; d++) {
    const e = [z(), z(), z()], th = mu.map((v, i) => v + L[i][0] * e[0] + L[i][1] * e[1] + L[i][2] * e[2]);
    if (th.some((v) => v <= 0)) continue;
    for (let t = 1; t <= horizon; t++) { cum[t].push(th[2] * bassF(t, th[0], th[1])); per[t].push(bassNew(t, th)); }
    tp.push(bassPeak(th[0], th[1], th[2]).tPeak);
  }
  const band = (arr) => ({ lo: quantile(arr, 0.025), hi: quantile(arr, 0.975) });
  return { kept: tp.length, cum: cum.map((a) => (a.length ? band(a) : null)), per: per.map((a) => (a.length ? band(a) : null)), tPeak: band(tp), m: band(cum[horizon]) };
}

// ── Reading your results ──
// Confidence rule (Srinivasan and Mason 1986; Mahajan, Muller and Bass 1990: Bass estimates are unstable before the
// peak of adoptions): high when the data run past the estimated peak and the standard error of m is under 10% of m;
// medium when the data reach the peak or the standard error of m is under 25%; low otherwise.
export function bassConfidence(fit, lastT) {
  const rel = fit.se[2] / fit.m;
  if (lastT >= fit.tPeak + 1 && rel < 0.1) return 'high';
  if (lastT >= fit.tPeak || rel < 0.25) return 'medium';
  return 'low';
}
export function bassSummary(fit, rows, bands, unit = 'period') {
  const lastT = rows[rows.length - 1].t, total = rows.reduce((s, r) => s + r.v, 0), rel = fit.se[2] / fit.m;
  const past = lastT >= fit.tPeak;
  return {
    headline: `The Bass model puts eventual adoption at about ${fmt(fit.m, 0)}, with new adoptions peaking around ${unit} ${fmt(fit.tPeak, 1)}; ${fmt(total, 0)} (${pctS(total / fit.m, 0)}) have adopted so far.`,
    meaning: [
      `q/p = ${fmt(fit.q / fit.p, 1)}: ${fit.q > fit.p ? 'adoption is driven mostly by imitation (word of mouth, seeing others use it) rather than by your own promotion' : 'adoption is driven mostly by innovation (your own messaging) rather than word of mouth'}. Across 213 published product categories, average p was about 0.03 and q about 0.38 per year (Sultan, Farley and Lehmann 1990).`,
      past ? `The data run past the estimated peak, so the eventual total (m) is reasonably pinned down (standard error ${fmt(fit.se[2], 0)}).` : `The data have not reached the estimated peak yet, so the eventual total is uncertain (standard error ${fmt(fit.se[2], 0)}, ${pctS(rel, 0)} of m). Forecasts made before the peak are often too low or too high.`,
      bands ? `An approximate 95% range for the eventual total, from the uncertainty in the fitted parameters, is ${fmt(bands.m.lo, 0)} to ${fmt(bands.m.hi, 0)}.` : null,
      `The fit explains ${pctS(fit.r2, 0)} of the ${unit}-to-${unit} variation in new adopters (RMSE ${fmt(fit.rmse, 1)}).`,
    ].filter(Boolean),
    confidence: bassConfidence(fit, lastT),
    confidenceNote: `High needs data running at least one ${unit} past the estimated peak and a standard error of m below 10% of m; medium needs the data to reach the peak or a standard error below 25% (Srinivasan and Mason 1986; Mahajan, Muller and Bass 1990). Here: last ${unit} ${lastT}, peak ${fmt(fit.tPeak, 1)}, standard error ${pctS(rel, 0)} of m.`,
    caveats: [
      'The model assumes a fixed market size and that nothing changes along the way (pricing, a relaunch, a competitor). A change breaks the forecast.',
      'The range reflects only the parameter uncertainty of this fit, not changes in the market, so real outcomes vary more.',
      'Counts per period should be new adopters, not active users: churn is not part of the Bass model.',
    ],
    next: [
      'Refit every few periods and watch whether m settles; a forecast that keeps rising means the market is bigger than the early data suggest.',
      'Compare with retention: use the [retention and funnel](/calculators/retention-funnel) calculator to see whether adopters stay.',
    ],
    report: `A Bass diffusion model fitted by nonlinear least squares to ${rows.length} ${unit}s (R² ${fmt(fit.r2, 2)}) gave p = ${fmt(fit.p, 4)}, q = ${fmt(fit.q, 3)} and m = ${fmt(fit.m, 0)} (SE ${fmt(fit.se[2], 0)}), with adoptions peaking around ${unit} ${fmt(fit.tPeak, 1)}.`,
  };
}
export function sirSummary(res, N) {
  const z = res.final.R / N;
  return {
    headline: `With R₀ = ${fmt(res.R0, 2)}, ${res.R0 > 1 ? `spread peaks around day ${fmt(res.peakT, 0)} with ${fmt(res.peakI, 0)} active spreaders, and ${pctS(z, 0)} of the population has been reached by the end` : `spread dies out: each spreader recruits fewer than one new person on average`}.`,
    meaning: [
      `R₀ = β/γ is the average number of people one spreader reaches while active. Above 1, adoption grows on its own; below 1, it needs continued seeding (like a viral coefficient below 1).`,
      res.R0 > 1 ? `For a tiny starting seed, the final share reached is the solution of z = 1 − e^(−R₀·z): ${pctS(finalSize(res.R0), 0)}. Not everyone is reached even without any intervention.` : 'Raising β (more invitations or shares per user) or lowering γ (users staying active spreaders for longer) is what would tip it above 1.',
      `Spreaders stay active for 1/γ = ${fmt(1 / res.gamma, 1)} days on average and reach β = ${fmt(res.beta, 3)} people a day while active.`,
    ],
    confidence: 'low',
    confidenceNote: 'This is a what-if simulation from the rates you entered, not an estimate from data, so it is only as good as β and γ. Fit the Bass model to real counts for an evidence-based forecast.',
    caveats: [
      'SIR assumes everyone mixes with everyone; real products spread through networks and communities, which slows and caps spread.',
      'The rates are assumed constant: launches, seasonality and saturation of interest all change them.',
    ],
    next: ['Estimate β from your invitation rate × acceptance rate per day, and γ from how long new users keep inviting.', 'Switch to the Bass model with your observed counts to check the forecast against data.'],
    report: `An SIR simulation with N = ${fmt(N, 0)}, β = ${fmt(res.beta, 3)} and γ = ${fmt(res.gamma, 3)} per day (R₀ = ${fmt(res.R0, 2)}) reaches ${pctS(z, 0)} of the population, with a peak of ${fmt(res.peakI, 0)} active spreaders on day ${fmt(res.peakT, 0)}.`,
  };
}
export { plural };
