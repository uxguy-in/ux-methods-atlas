// Retention and funnel analytics: cohort tables from counts or raw events, retention curves, power-law and
// shifted-beta-geometric fits (Fader and Hardie 2007), stickiness, unit economics (churn, CLV, CAC payback), funnels
// with Wilson intervals and segment comparison, Markov journey attribution (removal effect) and viral growth.
// Pure functions with no React; checked by `npm run check:expanalytics` against scipy, statsmodels and numpy.
import { sum, normSf, wilsonCI, adjustP, solve, nelderMead, fmt, pctText, pText, toNumber } from './expanalytics-core.js';

// ── Cohorts ──
// Table format: one cohort per line: label, cohort size, then active (or retained) users in periods 1, 2, …
// A first line whose second value is not a number is treated as a header. With asPercent, values after the size are
// percentages of the size.
export function parseCohortTable(text, asPercent = false) {
  const out = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const parts = s.split(/\t|,|;/).map((x) => x.trim());
    const size = toNumber(parts[1]);
    if (!Number.isFinite(size)) { if (out.length || i > 0) bad.push(i + 1); return; }
    const vals = parts.slice(2).filter((x) => x !== '').map(toNumber);
    if (vals.some((v) => !Number.isFinite(v))) { bad.push(i + 1); return; }
    const counts = [size, ...vals.map((v) => (asPercent ? (v / 100) * size : v))];
    out.push({ label: parts[0], size, counts });
  });
  return { cohorts: out, bad };
}
// Event list: user, signup date, activity date (ISO dates). Period: 'day', 'week' (Monday start) or 'month'.
const dayIndex = (s) => { const t = Date.parse(`${String(s).trim().slice(0, 10)}T00:00:00Z`); return Number.isFinite(t) ? Math.floor(t / 86400000) : NaN; };
export function periodOf(day, unit) {
  if (unit === 'day') return day;
  if (unit === 'week') return Math.floor((day + 3) / 7);
  const d = new Date(day * 86400000); return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
export function periodLabel(p, unit) {
  if (unit === 'month') return `${Math.floor(p / 12)}-${String((p % 12) + 1).padStart(2, '0')}`;
  const day = unit === 'week' ? p * 7 - 3 : p;
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
export function cohortsFromEvents(text, unit = 'week') {
  const users = new Map(), bad = [];
  let maxP = -Infinity;
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const [u, sd, ad] = s.split(/\t|,|;/).map((x) => x.trim());
    const d0 = dayIndex(sd), d1 = ad ? dayIndex(ad) : d0;
    if (!u || !Number.isFinite(d0) || !Number.isFinite(d1)) { if (i > 0) bad.push(i + 1); return; }
    if (!users.has(u)) users.set(u, { signup: d0, active: new Set() });
    const rec = users.get(u); rec.signup = Math.min(rec.signup, d0);
    rec.active.add(d1); maxP = Math.max(maxP, periodOf(d1, unit), periodOf(d0, unit));
  });
  const byCohort = new Map();
  for (const rec of users.values()) {
    const c = periodOf(rec.signup, unit);
    if (!byCohort.has(c)) byCohort.set(c, []);
    byCohort.get(c).push(new Set([...rec.active].map((d) => periodOf(d, unit) - c).filter((k) => k >= 0)));
  }
  const cohorts = [...byCohort.keys()].sort((a, b) => a - b).map((c) => {
    const us = byCohort.get(c), horizon = maxP - c;
    const counts = Array.from({ length: horizon + 1 }, (_, k) => us.filter((set) => set.has(k)).length);
    counts[0] = us.length; // period 0: everyone who signed up
    return { label: periodLabel(c, unit), size: us.length, counts };
  });
  return { cohorts, bad, users: users.size };
}
// Retention rates and the size-weighted average curve over the cohorts observed at each period.
export function retention(cohorts) {
  const T = Math.max(...cohorts.map((c) => c.counts.length));
  const rows = cohorts.map((c) => ({ ...c, rates: c.counts.map((x) => x / c.size) }));
  const avgCurve = Array.from({ length: T }, (_, k) => {
    const obs = cohorts.filter((c) => c.counts.length > k);
    const n = sum(obs.map((c) => c.size));
    return { k, rate: n ? sum(obs.map((c) => c.counts[k])) / n : NaN, n, cohorts: obs.length };
  });
  return { rows, avgCurve, T };
}
// Power law r(t) = a·t^(−b) by least squares on log r against log t, for t ≥ 1.
export function powerLawFit(curve) {
  const pts = curve.filter((p) => p.k >= 1 && p.rate > 0).map((p) => [Math.log(p.k), Math.log(p.rate)]);
  if (pts.length < 2) return null;
  const mx = sum(pts.map((p) => p[0])) / pts.length, my = sum(pts.map((p) => p[1])) / pts.length;
  const sxy = sum(pts.map(([x, y]) => (x - mx) * (y - my))), sxx = sum(pts.map(([x]) => (x - mx) ** 2));
  const slope = sxy / sxx, a = Math.exp(my - slope * mx);
  const ssr = sum(pts.map(([x, y]) => (y - (my + slope * (x - mx))) ** 2)), sst = sum(pts.map(([, y]) => (y - my) ** 2));
  return { a, b: -slope, r2: sst > 0 ? 1 - ssr / sst : 1, at: (t) => (t <= 0 ? 1 : a * t ** slope) };
}

// ── Shifted-beta-geometric (Fader and Hardie 2007, "How to project customer retention", J. Interactive Marketing) ──
// Churn probability θ ~ Beta(α, β). P(T = 1) = α/(α + β); P(T = t) = P(T = t − 1)·(β + t − 2)/(α + β + t − 1);
// S(t) = S(t − 1) − P(T = t). Likelihood per cohort: Σ (n_{t−1} − n_t) ln P(T = t) + n_T ln S(T). Counts that rise
// are capped at the previous value, since the model treats churn as permanent.
export function sbgCurve(alpha, beta, T) {
  const S = [1]; let P = alpha / (alpha + beta);
  for (let t = 1; t <= T; t++) { if (t > 1) P *= (beta + t - 2) / (alpha + beta + t - 1); S.push(S[t - 1] - P); }
  return S;
}
export function sbgLogLik(alpha, beta, cohorts) {
  let ll = 0;
  for (const c of cohorts) {
    const n = []; c.counts.forEach((x, t) => n.push(t === 0 ? c.size : Math.min(x, n[t - 1])));
    const T = n.length - 1; if (T < 1) continue;
    let P = alpha / (alpha + beta), S = 1;
    for (let t = 1; t <= T; t++) {
      if (t > 1) P *= (beta + t - 2) / (alpha + beta + t - 1);
      S -= P;
      const lost = n[t - 1] - n[t]; if (lost > 0) ll += lost * Math.log(P);
    }
    if (n[T] > 0) ll += n[T] * Math.log(Math.max(S, 1e-300));
  }
  return ll;
}
export function sbgFit(cohorts) {
  const f = ([la, lb]) => { const v = -sbgLogLik(Math.exp(la), Math.exp(lb), cohorts); return Number.isFinite(v) ? v : 1e300; };
  let best = null;
  for (const start of [[0, 0], [-1, 1], [1, 2], [-0.5, 0.5]]) { const r = nelderMead(f, start, { step: 0.6, tol: 1e-14, maxIter: 6000 }); if (!best || r.f < best.f) best = r; }
  const r2 = nelderMead(f, best.x, { step: 0.05, tol: 1e-15, maxIter: 6000 });
  const [alpha, beta] = r2.x.map(Math.exp);
  return { alpha, beta, ll: -r2.f, meanChurn: alpha / (alpha + beta) };
}
// Discounted expected lifetime in periods, counting the current one: Σ_{t≥0} S(t)/(1 + d)^t = ₂F₁(1, β; α + β; 1/(1 + d))
// (Fader and Hardie 2010). With d = 0 it is the undiscounted mean lifetime, finite only when α > 1: (α + β − 1)/(α − 1).
export function sbgDEL(alpha, beta, d = 0) {
  if (d <= 0) return alpha > 1 ? (alpha + beta - 1) / (alpha - 1) : Infinity;
  let s = 0, S = 1, P = alpha / (alpha + beta);
  for (let t = 0; t < 200000; t++) {
    const term = S / (1 + d) ** t; s += term;
    if (term < 1e-13 * s) break;
    if (t >= 1) P *= (beta + t - 1) / (alpha + beta + t);
    S -= P;
  }
  return s;
}
export function sbgMedian(alpha, beta) {
  let S = 1, P = alpha / (alpha + beta);
  for (let t = 1; t < 100000; t++) { if (t > 1) P *= (beta + t - 2) / (alpha + beta + t - 1); S -= P; if (S <= 0.5) return t; }
  return Infinity;
}
// Retention among those still active: r(t) = S(t)/S(t − 1) = (β + t − 1)/(α + β + t − 1) rises over time.
export const sbgRetentionRate = (alpha, beta, t) => (beta + t - 1) / (alpha + beta + t - 1);

// ── Stickiness ──
export function stickiness({ dau, wau, mau, days = 30 }) {
  return { dauMau: dau / mau, wauMau: wau / mau, dauWau: dau / wau, daysPerMonth: (dau / mau) * days, consistent: dau <= wau && wau <= mau };
}

// ── Unit economics ──
// Monthly margin m = ARPU × gross margin. Simple CLV = m / churn (undiscounted). Discounted CLV with retention r = 1 −
// churn and monthly discount d, paid at the start of each month: m(1 + d)/(1 + d − r) (Gupta and Lehmann 2003).
// sBG CLV = m × DEL(d). Payback: CAC / m months; with churn, the first month t where Σ_{s<t} m·r^s ≥ CAC.
export function unitEconomics({ arpu, margin, churn, cac, annualRate = 0.1, alpha, beta }) {
  const m = arpu * margin, r = 1 - churn, d = (1 + annualRate) ** (1 / 12) - 1;
  const simple = m / churn, discounted = (m * (1 + d)) / (1 + d - r);
  const sbg = alpha > 0 && beta > 0 ? m * sbgDEL(alpha, beta, d) : NaN;
  const payback = cac / m;
  let churnPayback = Infinity, acc = 0;
  if (m / churn > cac) for (let t = 1; t <= 1200; t++) { acc += m * r ** (t - 1); if (acc >= cac) { churnPayback = t; break; } }
  return { m, d, simple, discounted, sbg, payback, churnPayback, ltvCac: discounted / cac, lifetimeMonths: 1 / churn };
}

// ── Funnels ──
// Steps with counts. Step conversion n_i/n_{i−1} and overall n_i/n_0, each with a Wilson interval.
export function funnel(steps) {
  const n0 = steps[0].count;
  const rows = steps.map((s, i) => {
    const prev = i ? steps[i - 1].count : s.count;
    const step = i ? s.count / prev : 1, overall = s.count / n0;
    return { ...s, i, prev, step, stepCI: i ? wilsonCI(s.count, prev) : { lo: 1, hi: 1 }, overall, overallCI: wilsonCI(s.count, n0), lost: prev - s.count };
  });
  const later = rows.slice(1);
  const worstRate = later.length ? later.reduce((a, b) => (b.step < a.step ? b : a)) : null;
  const worstLoss = later.length ? later.reduce((a, b) => (b.lost > a.lost ? b : a)) : null;
  return { rows, worstRate, worstLoss, overall: rows[rows.length - 1].overall };
}
// Two segments: a pooled two-proportion z-test on each step's conversion (as statsmodels proportions_ztest), Holm-adjusted
// across steps; the overall conversion is tested separately.
export function twoProp(x1, n1, x2, n2) {
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p1 - p2) / se : 0;
  return { p1, p2, diff: p1 - p2, z, p: 2 * normSf(Math.abs(z)) };
}
export function compareFunnels(a, b) {
  const steps = a.slice(1).map((s, i) => ({ name: s.name, ...twoProp(s.count, a[i].count, b[i + 1].count, b[i].count) }));
  const adj = adjustP(steps.map((s) => s.p), 'holm'); steps.forEach((s, i) => { s.pHolm = adj[i]; });
  const overall = twoProp(a[a.length - 1].count, a[0].count, b[b.length - 1].count, b[0].count);
  return { steps, overall };
}
export function parseFunnel(text) {
  const rows = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\t|,|;/).map((x) => x.trim()));
  if (!rows.length) return { segments: [], steps: [] };
  const header = rows[0].slice(1).every((v) => !Number.isFinite(toNumber(v))) ? rows.shift() : null;
  const k = Math.max(1, ...rows.map((r) => r.length - 1));
  const segs = Array.from({ length: Math.min(k, 2) }, (_, j) => ({ name: header?.[j + 1] || (k > 1 ? `Segment ${String.fromCharCode(65 + j)}` : 'All users'), steps: [] }));
  const bad = [];
  rows.forEach((r, i) => { segs.forEach((s, j) => { const v = toNumber(r[j + 1]); if (Number.isFinite(v) && v >= 0) s.steps.push({ name: r[0], count: v }); else bad.push(i + 1); }); });
  return { segments: segs, bad: [...new Set(bad)] };
}

// ── Markov journeys ──
// Paths like "Home>Search>Product>Cart>Buy", optionally followed by a count. A path converts when it reaches the
// conversion step (it stops there); otherwise it ends in the drop state. First-order transition probabilities from the
// counts; absorption probabilities B = (I − Q)⁻¹R. Removal effect of a step: 1 − P(convert | step removed)/P(convert),
// where removing a step sends every transition into it to the drop state (Anderl et al. 2016, IJRM).
export function parsePaths(text, conv = 'Buy') {
  const paths = [], bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim(); if (!s || s.startsWith('#')) return;
    const m = s.match(/^(.*?)(?:[\t,;]\s*(\d+(?:\.\d+)?))?\s*$/);
    const steps = m[1].split(/>|→/).map((x) => x.trim()).filter(Boolean);
    const n = m[2] ? Number(m[2]) : 1;
    if (!steps.length || !(n > 0)) { bad.push(i + 1); return; }
    const cut = steps.findIndex((x) => x.toLowerCase() === conv.toLowerCase());
    paths.push({ steps: cut >= 0 ? steps.slice(0, cut) : steps, converted: cut >= 0, n });
  });
  return { paths, bad };
}
export const START = '(start)', CONV = '(conversion)', NULL = '(drop)';
export function markov(paths, removed = null) {
  const pages = [...new Set(paths.flatMap((p) => p.steps))];
  const transient = [START, ...pages], idx = new Map(transient.map((s, i) => [s, i]));
  const nT = transient.length, counts = Array.from({ length: nT }, () => new Array(nT + 2).fill(0));
  for (const p of paths) {
    const seq = [START, ...p.steps];
    for (let i = 0; i < seq.length; i++) {
      const from = idx.get(seq[i]);
      const to = i + 1 < seq.length ? idx.get(seq[i + 1]) : p.converted ? nT : nT + 1;
      counts[from][to] += p.n;
    }
  }
  const P = counts.map((row) => { const s = sum(row); return row.map((c) => (s ? c / s : 0)); });
  // Removing a step: transitions into it go to the drop state; its own row is irrelevant (never reached).
  if (removed !== null) { const r = idx.get(removed); P.forEach((row) => { row[nT + 1] += row[r]; row[r] = 0; }); }
  const IQ = transient.map((_, i) => transient.map((__, j) => (i === j ? 1 : 0) - P[i][j]));
  const R = P.map((row) => [row[nT], row[nT + 1]]);
  const B = solve(IQ, R) || transient.map(() => [0, 1]);
  return { states: transient, P, counts, B, pConv: B[0][0], pages };
}
export function removalEffects(paths) {
  const base = markov(paths), totalConv = sum(paths.filter((p) => p.converted).map((p) => p.n));
  const eff = base.pages.map((s) => { const m = markov(paths, s); return { step: s, pRemoved: m.pConv, effect: base.pConv > 0 ? 1 - m.pConv / base.pConv : 0 }; });
  const tot = sum(eff.map((e) => e.effect));
  eff.forEach((e) => { e.share = tot > 0 ? e.effect / tot : 0; e.conversions = e.share * totalConv; });
  return { base, effects: eff.sort((a, b) => b.effect - a.effect), totalConv, totalPaths: sum(paths.map((p) => p.n)) };
}

// ── Viral growth ──
// K = invites per user × invite conversion. Each cycle of length ct brings K times the previous cycle's new users;
// total after n cycles = U₀(1 − K^(n+1))/(1 − K), approaching U₀/(1 − K) when K < 1.
export function viral({ invites, conv, cycle, start, horizon }) {
  const K = invites * conv, n = Math.floor(horizon / cycle);
  const pts = []; let total = 0, cohort = start;
  for (let j = 0; j <= n; j++) { total += cohort; pts.push({ day: j * cycle, newUsers: cohort, total }); cohort *= K; }
  return { K, cycles: n, pts, total, limit: K < 1 ? start / (1 - K) : Infinity, amplification: K < 1 ? 1 / (1 - K) : Infinity };
}

// ── Reading your results ──
// Confidence rule (cohorts): "high" with at least 4 cohorts, 6 observed periods and an average cohort of ≥ 200 users;
// "low" with fewer than 3 observed periods or an average cohort under 50; "medium" otherwise.
export function cohortSummary({ ret, fit, pl, unit = 'period', horizon = 12 }) {
  const nC = ret.rows.length, avgSize = sum(ret.rows.map((r) => r.size)) / nC, T = ret.T - 1;
  const confidence = T < 3 || avgSize < 50 ? 'low' : nC >= 4 && T >= 6 && avgSize >= 200 ? 'high' : 'medium';
  const r1 = ret.avgCurve[1]?.rate, rl = ret.avgCurve[T]?.rate;
  const S = fit ? sbgCurve(fit.alpha, fit.beta, horizon) : null;
  const med = fit ? sbgMedian(fit.alpha, fit.beta) : NaN;
  return {
    headline: `On average ${pctText(r1, 0)} of a cohort is still active after 1 ${unit} and ${pctText(rl, 0)} after ${T} ${unit}s${fit ? `; the shifted-beta-geometric fit projects ${pctText(S[horizon], 0)} at ${horizon} ${unit}s` : ''}.`,
    meaning: [
      fit ? `The sBG fit (α = ${fmt(fit.alpha, 3)}, β = ${fmt(fit.beta, 3)}) says users differ in how likely they are to leave: the average churn chance is ${pctText(fit.meanChurn, 0)} per ${unit}, but those who stay are increasingly loyal, so retention among survivors rises from ${pctText(sbgRetentionRate(fit.alpha, fit.beta, 1), 0)} to ${pctText(sbgRetentionRate(fit.alpha, fit.beta, horizon), 0)} by ${unit} ${horizon}.` : 'There are too few periods to fit the shifted-beta-geometric model.',
      fit ? `Half of a new cohort is gone after ${Number.isFinite(med) ? `${med} ${unit}s` : `more than the projection horizon`}. ${fit.alpha > 1 ? `The implied mean lifetime is ${fmt(sbgDEL(fit.alpha, fit.beta, 0), 1)} ${unit}s.` : 'Because α ≤ 1 the undiscounted mean lifetime is unbounded (a long tail of very loyal users); use the discounted lifetime in Unit economics.'}` : 'Read the heatmap row by row: each row is one cohort, each column the same age.',
      pl ? `A power law r(t) = ${fmt(pl.a, 3)}·t^−${fmt(pl.b, 3)} fits the average curve with R² = ${fmt(pl.r2, 3)}; it flattens more slowly than the sBG curve and has no floor.` : 'The power law needs at least two periods with retention above zero.',
    ],
    confidence,
    confidenceNote: 'Rule: strong with 4 or more cohorts, 6 or more observed periods and an average cohort of at least 200 users; weak with fewer than 3 periods or average cohorts under 50; some otherwise.',
    caveats: [
      'Retention projections assume the future behaves like the past: a pricing change, a new competitor or seasonality will break the curve.',
      'The sBG model treats leaving as permanent. For product usage, where people lapse and come back, "active in period t" overstates churn early and understates it later.',
      'Later cohorts have fewer observed periods, so the right side of the average curve rests on the oldest cohorts only.',
    ],
    next: ['Compare the newest cohorts with older ones at the same age: improving rows mean onboarding changes are working.', 'Use the fitted α and β in [Unit economics](/calculators/retention-funnel) for a lifetime value that accounts for differences between users.'],
    report: `Across ${nC} cohorts (average ${Math.round(avgSize)} users), ${pctText(r1, 0)} were active after 1 ${unit} and ${pctText(rl, 0)} after ${T}.${fit ? ` A shifted-beta-geometric model (α = ${fmt(fit.alpha, 3)}, β = ${fmt(fit.beta, 3)}; Fader and Hardie 2007) projects ${pctText(S[horizon], 0)} retention at ${horizon} ${unit}s.` : ''}`,
  };
}
// Confidence rule (stickiness): arithmetic on your counts, so confidence is about the inputs: "low" when DAU > WAU or
// WAU > MAU (inconsistent definitions); "medium" when MAU < 1,000; "high" otherwise.
export function stickinessSummary(s, { dau, wau, mau }) {
  const confidence = !s.consistent ? 'low' : mau < 1000 ? 'medium' : 'high';
  return {
    headline: `DAU/MAU is ${pctText(s.dauMau, 1)}: the average monthly user is active on about ${fmt(s.daysPerMonth, 1)} days a month.`,
    meaning: [
      `WAU/MAU is ${pctText(s.wauMau, 0)} and DAU/WAU ${pctText(s.dauWau, 0)}. A DAU/MAU of 3.3% (1 in 30) means monthly users come once a month on average; 100% means every monthly user comes every day.`,
      'Stickiness measures habit, not value: a tool people need weekly (payroll, reporting) can be healthy at a low DAU/MAU. Compare it with your own history and with the natural frequency of the task.',
    ],
    confidence,
    confidenceNote: 'Rule: strong when the counts are consistent (DAU ≤ WAU ≤ MAU) and MAU is at least 1,000; some when MAU is smaller, so day-to-day noise matters; weak when the counts are inconsistent, which usually means different definitions of "active".',
    caveats: ['DAU/MAU depends heavily on how "active" is defined (opening the app vs completing a key action). Keep the definition fixed over time.', 'An average hides a split between daily power users and occasional visitors; look at the distribution of active days too.'],
    next: ['Track DAU/MAU per cohort and per segment, not only overall.'],
    report: `DAU ${Math.round(dau).toLocaleString()}, WAU ${Math.round(wau).toLocaleString()}, MAU ${Math.round(mau).toLocaleString()}: DAU/MAU ${pctText(s.dauMau, 1)} (about ${fmt(s.daysPerMonth, 1)} active days a month), WAU/MAU ${pctText(s.wauMau, 0)}.`,
  };
}
// Confidence rule (unit economics): every figure is an extrapolation from the inputs. "low" when monthly churn is below
// 2% (lifetimes over 4 years are mostly extrapolation) or the simple and sBG CLVs differ by more than 50%; "high" when
// churn is 5% or more and the two CLVs agree within 20% (or no sBG is given); "medium" otherwise.
export function unitSummary(u, { churn, cac }) {
  const diff = Number.isFinite(u.sbg) ? Math.abs(u.sbg - u.discounted) / u.discounted : 0;
  const confidence = churn < 0.02 || diff > 0.5 ? 'low' : churn >= 0.05 && diff <= 0.2 ? 'high' : 'medium';
  const money = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : 'not reached');
  return {
    headline: `Each customer is worth about ${money(u.discounted)} in margin over their lifetime (discounted), ${fmt(u.ltvCac, 1)} times the ${money(cac)} it costs to acquire them; the acquisition cost is paid back in ${Number.isFinite(u.churnPayback) ? `${u.churnPayback} months` : 'never (customers leave before paying it back)'}.`,
    meaning: [
      `Monthly margin per customer is ${money(u.m)}; with ${pctText(churn, 1)} monthly churn the average customer stays ${fmt(u.lifetimeMonths, 1)} months, so the simple CLV (margin ÷ churn) is ${money(u.simple)}.`,
      Number.isFinite(u.sbg) ? `The sBG-based CLV is ${money(u.sbg)}. It allows for loyal and fickle customers, so it is usually higher than the constant-churn figure when early churn is high.` : 'Add α and β from a cohort fit to get a CLV that allows for differences between customers.',
      'An LTV:CAC of 3 or more and a payback under 12 months are common SaaS rules of thumb (Skok 2013, "SaaS Metrics 2.0"); they are heuristics, not laws.',
    ],
    confidence,
    confidenceNote: 'Rule: strong when monthly churn is at least 5% and the constant-churn and sBG CLVs agree within 20%; weak when churn is under 2% (lifetimes of more than 4 years are mostly extrapolation) or the two CLVs differ by more than 50%; some otherwise.',
    caveats: ['CLV is very sensitive to churn: halving churn doubles the simple CLV. Small errors in churn swamp everything else.', 'Use gross margin, not revenue, and include the cost of serving the customer.'],
    next: ['Check the churn figure against actual cohort retention (Cohort retention mode), which shows whether churn falls with customer age.'],
    report: `With ARPU × margin of ${money(u.m)} a month and ${pctText(churn, 1)} monthly churn, discounted CLV is ${money(u.discounted)} (simple ${money(u.simple)}${Number.isFinite(u.sbg) ? `, sBG ${money(u.sbg)}` : ''}); LTV:CAC ${fmt(u.ltvCac, 1)}; CAC payback ${Number.isFinite(u.churnPayback) ? `${u.churnPayback} months` : 'not reached'}.`,
  };
}
// Confidence rule (funnel): "high" when every step's denominator is ≥ 100 (intervals within about ±10 points);
// "medium" when all are ≥ 30; "low" otherwise.
export function funnelSummary(f, cmp = null, names = []) {
  const minDen = Math.min(...f.rows.slice(1).map((r) => r.prev));
  const confidence = minDen >= 100 ? 'high' : minDen >= 30 ? 'medium' : 'low';
  const w = f.worstRate;
  const sig = cmp ? cmp.steps.filter((s) => s.pHolm < 0.05) : [];
  const meaning = [
    `The weakest step is "${w.name}": ${pctText(w.step, 1)} of those reaching "${f.rows[w.i - 1].name}" continue (95% CI ${pctText(w.stepCI.lo, 1)} to ${pctText(w.stepCI.hi, 1)}). The largest number of people (${Math.round(f.worstLoss.lost).toLocaleString()}) is lost before "${f.worstLoss.name}".`,
    'A funnel shows where people stop, not why. Use session recordings, interviews or a usability test on the weakest step to find the cause.',
  ];
  if (cmp) meaning.push(sig.length ? `${names[0]} and ${names[1]} differ at ${sig.length} step${sig.length > 1 ? 's' : ''} after Holm's correction: ${sig.map((s) => `"${s.name}" (${pctText(s.p1, 1)} vs ${pctText(s.p2, 1)}, ${pText(s.pHolm)})`).join('; ')}.` : `No step differs between ${names[0]} and ${names[1]} after Holm's correction; overall conversion ${pctText(cmp.overall.p1, 1)} vs ${pctText(cmp.overall.p2, 1)} (${pText(cmp.overall.p)}).`);
  return {
    headline: `${pctText(f.overall, 1)} of people who start the funnel finish it; the biggest drop-off is at "${w.name}" (${pctText(1 - w.step, 0)} lost).`,
    meaning,
    confidence,
    confidenceNote: 'Rule: strong when every step has at least 100 people reaching it (intervals within about ±10 points); some when every step has at least 30; weak otherwise.',
    caveats: ['A 95% confidence interval comes from a method that captures the true rate in 95% of samples; it is not a 95% chance for this particular range.', 'Funnels built from sessions double-count people who return; count people where you can.'],
    next: ['Investigate the weakest step first; a small improvement early in the funnel multiplies through every later step.', cmp ? 'If segments differ at a step, check whether they also differ in intent before blaming the design.' : 'Split the funnel by device or traffic source to see whether one segment drives the drop.'],
    report: `Overall conversion ${pctText(f.overall, 1)} (95% CI ${pctText(f.rows[f.rows.length - 1].overallCI.lo, 1)} to ${pctText(f.rows[f.rows.length - 1].overallCI.hi, 1)}); weakest step "${w.name}" at ${pctText(w.step, 1)} step conversion.${cmp ? ` Segment comparison (Holm-adjusted z-tests): ${sig.length ? sig.map((s) => s.name).join(', ') + ' differed' : 'no step differed'}.` : ''}`,
  };
}
// Confidence rule (Markov): "high" with ≥ 500 paths and ≥ 30 conversions; "medium" with ≥ 100 paths and ≥ 10
// conversions; "low" otherwise.
export function markovSummary(r) {
  const confidence = r.totalPaths >= 500 && r.totalConv >= 30 ? 'high' : r.totalPaths >= 100 && r.totalConv >= 10 ? 'medium' : 'low';
  const top = r.effects[0];
  return {
    headline: `${pctText(r.base.pConv, 1)} of journeys end in conversion; removing "${top.step}" would cut conversions by ${pctText(top.effect, 0)}, the largest removal effect of any step.`,
    meaning: [
      `Removal-effect attribution gives "${top.step}" ${pctText(top.share, 0)} of the credit (about ${fmt(top.conversions, 1)} of ${r.totalConv} conversions)${r.effects[1] ? `, then "${r.effects[1].step}" ${pctText(r.effects[1].share, 0)}` : ''}.`,
      'The Markov model assumes the next step depends only on the current one (first order); journeys that depend on earlier history are simplified.',
    ],
    confidence,
    confidenceNote: 'Rule: strong with 500 or more journeys and 30 or more conversions; some with 100 or more journeys and 10 or more conversions; weak otherwise.',
    caveats: ['Removal effects show how much journeys rely on a step, not that the step causes conversion: a step everyone passes through (like Cart) always looks essential.'],
    next: ['Compare removal effects with an experiment (remove or redesign a step for a test group) before reallocating budget.'],
    report: `A first-order Markov model of ${r.totalPaths.toLocaleString()} journeys (${r.totalConv} conversions) gave a conversion probability of ${pctText(r.base.pConv, 1)}; the largest removal effect was "${top.step}" (${pctText(top.effect, 0)}).`,
  };
}
// Confidence rule (viral): "low" when K ≥ 1 (exponential growth projections are fragile) or the horizon covers more than
// 10 cycles; "high" when K < 0.5 and 6 cycles or fewer (the projection barely depends on the tail); "medium" otherwise.
export function viralSummary(v, o) {
  const confidence = v.K >= 1 || v.cycles > 10 ? 'low' : v.K < 0.5 && v.cycles <= 6 ? 'high' : 'medium';
  return {
    headline: `Viral coefficient K = ${fmt(v.K, 2)}: ${v.K >= 1 ? 'each user brings in at least one more, so growth compounds' : `each user brings in ${fmt(v.K, 2)} more, so ${Math.round(o.start).toLocaleString()} seed users grow to about ${Math.round(v.total).toLocaleString()} in ${o.horizon} days`}.`,
    meaning: [
      v.K < 1 ? `With K below 1 virality amplifies rather than drives growth: the total levels off at ${Math.round(v.limit).toLocaleString()} (×${fmt(v.amplification, 2)}).` : 'With K at or above 1 each cycle is at least as large as the last; in practice K falls as you exhaust the reachable network.',
      `Cycle time matters as much as K: at ${o.cycle} days per cycle the horizon covers ${v.cycles} cycle${v.cycles === 1 ? '' : 's'}. Halving the cycle time doubles the number of cycles.`,
    ],
    confidence,
    confidenceNote: 'Rule: strong when K is below 0.5 and the horizon is 6 cycles or fewer; weak when K is 1 or more or the horizon exceeds 10 cycles; some otherwise.',
    caveats: ['Projections assume K and cycle time stay constant; both usually decline as the easiest contacts are reached.'],
    next: ['Measure invites per user and invite conversion per cohort, and improve the weaker of the two.'],
    report: `K = ${fmt(v.K, 2)} (${o.invites} invites per user × ${pctText(o.conv, 1)} conversion), cycle time ${o.cycle} days; projected ${Math.round(v.total).toLocaleString()} users after ${o.horizon} days from ${Math.round(o.start).toLocaleString()}.`,
  };
}
