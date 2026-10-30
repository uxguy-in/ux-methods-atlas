// Difference-in-differences: the 2×2 table of means and the panel regression y ~ treat + post + treat×post with
// cluster-robust errors by unit, a pre-period trend test and event-study coefficients. Checked against statsmodels
// (server/scripts/causal-reference.py).
import { olsCluster, waldF, tCrit, tP2, mean, variance, fmt, rng, randNorm, pText, signed, parseTable, toNum } from './causal-core.js';

// ── 2×2 from summary statistics ──
// cells: { t0, t1, c0, c1 }, each { m, s, n } (treated before/after, comparison before/after), four independent
// samples (repeated cross-sections). DiD = (T1 − T0) − (C1 − C0); SE = √Σ s²/n (equal to the HC2 standard error of
// the interaction in OLS on the individual data); Welch-Satterthwaite degrees of freedom.
export function did2x2(cells, conf = 0.95) {
  const v = Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, (c.s * c.s) / c.n]));
  const est = (cells.t1.m - cells.t0.m) - (cells.c1.m - cells.c0.m);
  const varSum = v.t0 + v.t1 + v.c0 + v.c1, se = Math.sqrt(varSum);
  const df = varSum ** 2 / Object.keys(v).reduce((s, k) => s + v[k] ** 2 / (cells[k].n - 1), 0);
  const crit = tCrit(conf, df);
  const tChange = cells.t1.m - cells.t0.m, cChange = cells.c1.m - cells.c0.m;
  const counterfactual = cells.t0.m + cChange;
  return {
    est, se, df, t: est / se, p: tP2(est / se, df), lo: est - crit * se, hi: est + crit * se,
    tChange, cChange, tChangeSe: Math.sqrt(v.t0 + v.t1), cChangeSe: Math.sqrt(v.c0 + v.c1),
    counterfactual, rel: est / counterfactual, relLo: (est - crit * se) / counterfactual, relHi: (est + crit * se) / counterfactual,
    preGap: cells.t0.m - cells.c0.m, conf,
  };
}

// ── Panel data ──
// Reads a long table (one row per unit and period) given the column names. `treated` is 0/1 (or two labels, the
// second in sort order counting as treated); post is period ≥ start.
export function readPanel(text, cols) {
  const tab = parseTable(text);
  const col = (name) => tab.cols.find((c) => c.name === name);
  const cu = col(cols.unit), cp = col(cols.period), cg = col(cols.treated), cy = col(cols.y);
  if (!cu || !cp || !cg || !cy) return { error: 'Choose the unit, period, treated-group and outcome columns.', tab };
  if (!cp.numeric) return { error: `The period column (${cp.name}) must be numbers, such as week 1, 2, 3.`, tab };
  if (!cy.numeric) return { error: `The outcome column (${cy.name}) must be numbers.`, tab };
  const gLevels = cg.numeric ? [...new Set(cg.values.filter((v) => v !== null))].sort((a, b) => a - b) : cg.levels;
  if (gLevels.length !== 2) return { error: `The treated-group column (${cg.name}) must have exactly two values, such as 0 and 1.`, tab };
  const rows = [];
  for (let i = 0; i < tab.n; i++) {
    const u = cu.values[i], p = cp.values[i], gv = cg.values[i], y = cy.values[i];
    if (u === null || p === null || gv === null || y === null) continue;
    rows.push({ unit: String(u), period: p, treat: gv === gLevels[1] ? 1 : 0, y });
  }
  // A unit must stay in one group.
  const byUnit = new Map();
  for (const r of rows) { if (!byUnit.has(r.unit)) byUnit.set(r.unit, new Set()); byUnit.get(r.unit).add(r.treat); }
  const mixed = [...byUnit].filter(([, s]) => s.size > 1).map(([u]) => u);
  if (mixed.length) return { error: `Unit ${mixed[0]} appears in both groups; the treated-group column must be fixed for each unit.`, tab };
  return { rows, treatedLabel: String(gLevels[1]), controlLabel: String(gLevels[0]), dropped: tab.n - rows.length, tab };
}

export function panelDiD(rows, start, conf = 0.95) {
  const periods = [...new Set(rows.map((r) => r.period))].sort((a, b) => a - b);
  const pre = periods.filter((p) => p < start), post = periods.filter((p) => p >= start);
  const units = new Set(rows.map((r) => r.unit)), tUnits = new Set(rows.filter((r) => r.treat).map((r) => r.unit));
  const G = units.size, Gt = tUnits.size, Gc = G - Gt;
  if (!pre.length || !post.length) return { error: 'The treatment start must leave at least one period before and one after.' };
  if (Gt < 2 || Gc < 2) return { error: 'Each group needs at least two units for cluster-robust errors.' };

  // Group means by period, for the trends plot.
  const means = periods.map((p) => {
    const t = rows.filter((r) => r.period === p && r.treat).map((r) => r.y), c = rows.filter((r) => r.period === p && !r.treat).map((r) => r.y);
    return { period: p, t: mean(t), c: mean(c), nt: t.length, nc: c.length };
  });

  // Main model: y = b0 + b1·treat + b2·post + b3·treat×post, CR1 errors by unit.
  const X = rows.map((r) => { const po = r.period >= start ? 1 : 0; return [1, r.treat, po, r.treat * po]; });
  const y = rows.map((r) => r.y), g = rows.map((r) => r.unit);
  const main = olsCluster(X, y, g, conf);
  if (!main) return { error: 'The model cannot be fitted: check that both groups have rows before and after the start.' };

  // Event study: y = a + b·treat + Σ period dummies + Σ_{k ≠ ref} θ_k·treat×[period = k]; ref = last pre period.
  const ref = pre[pre.length - 1];
  const others = periods.filter((p) => p !== ref), pdum = periods.slice(1);
  const XE = rows.map((r) => [1, r.treat, ...pdum.map((p) => (r.period === p ? 1 : 0)), ...others.map((p) => (r.treat && r.period === p ? 1 : 0))]);
  const ev = olsCluster(XE, y, g, conf);
  const off = 2 + pdum.length;
  const event = ev ? [
    ...others.map((p, j) => ({ period: p, rel: periods.indexOf(p) - periods.indexOf(ref), ...ev.rows[off + j], pre: p < start })),
    { period: ref, rel: 0, b: 0, se: 0, lo: 0, hi: 0, p: NaN, pre: true, ref: true },
  ].sort((a, b) => a.period - b.period) : [];
  const preIdx = ev ? others.map((p, j) => (p < start ? off + j : -1)).filter((i) => i >= 0) : [];
  const preJoint = ev && preIdx.length ? waldF(ev, preIdx) : null;

  // Linear pre-trend test on the pre periods: y = a + b·treat + c·period + d·treat×period; d is the difference in slopes.
  let trend = null;
  if (pre.length >= 2) {
    const pr = rows.filter((r) => r.period < start);
    const tf = olsCluster(pr.map((r) => [1, r.treat, r.period, r.treat * r.period]), pr.map((r) => r.y), pr.map((r) => r.unit), conf);
    if (tf) trend = { ...tf.rows[3], df: tf.df };
  }

  const r3 = main.rows[3];
  const cf = means.filter((m) => m.period >= start);
  const counterfactual = mean(cf.map((m) => m.t)) - r3.b;
  return {
    periods, pre, post, ref, start, G, Gt, Gc, n: rows.length, means,
    main: { ...main, est: r3.b, se: r3.se, p: r3.p, lo: r3.lo, hi: r3.hi, t: r3.t },
    event, preJoint, trend, counterfactual, rel: r3.b / counterfactual, conf,
  };
}

// ── Example: a redesigned onboarding checklist rolled out to 18 of 36 customer workspaces from week 5. Outcome:
// weekly active users per 100 seats. Deterministic (seeded) so the reference script uses the same data.
export function examplePanel() {
  const u = rng(20261030);
  const lines = ['workspace,week,new_onboarding,active_per_100'];
  for (let i = 1; i <= 36; i++) {
    const treat = i <= 18 ? 1 : 0;
    const base = 52 + 6 * randNorm(u) + (treat ? 2.5 : 0);
    for (let w = 1; w <= 8; w++) {
      const season = [0, 0.8, 1.2, 0.4, 1.9, 2.6, 2.2, 3.1][w - 1];
      const effect = treat && w >= 5 ? 3.2 + 0.4 * (w - 5) : 0;
      const yv = base + season + effect + 2.4 * randNorm(u);
      lines.push(`W${String(i).padStart(2, '0')},${w},${treat},${yv.toFixed(1)}`);
    }
  }
  return lines.join('\n');
}
export const EXAMPLE_COLS = { unit: 'workspace', period: 'week', treated: 'new_onboarding', y: 'active_per_100' };
export const EXAMPLE_START = 5;
// 2×2 example: mean minutes to complete a monthly report, before and after a redesign in one region (treated)
// and in a region that kept the old design (comparison).
export const EXAMPLE_2X2 = { t0: { m: 14.2, s: 5.1, n: 180 }, t1: { m: 11.0, s: 4.6, n: 175 }, c0: { m: 13.8, s: 5.3, n: 210 }, c1: { m: 13.1, s: 5.0, n: 205 } };

// Guess the columns of a pasted panel from their names.
export function guessCols(names) {
  const find = (re, not = []) => names.find((n) => re.test(n) && !not.includes(n));
  const unit = find(/unit|id|user|workspace|account|store|team|region|cluster/i) || names[0];
  const period = find(/period|week|month|day|time|wave|date|year/i, [unit]) || names[1];
  const treated = find(/treat|group|exposed|cohort|new|arm/i, [unit, period]) || names[2];
  const y = names.filter((n) => ![unit, period, treated].includes(n)).pop() || names[3];
  return { unit, period, treated, y };
}

// ── Reading your results ──
// Confidence rule (shown in the summary): strong when the effect's interval excludes zero AND the pre-period
// checks do not reject parallel trends (joint pre-period test p ≥ 0.10 and, if run, linear trend p ≥ 0.10) AND there
// are at least 20 clusters (cluster-robust errors are unreliable with few clusters; Cameron and Miller 2015 suggest
// 20–50 as a minimum); weak when the interval includes zero or a pre-trend check rejects (p < 0.05); some otherwise.
// In 2×2 mode there is no pre-trend evidence at all, so the best rating is "some".
export function didSummary(r, { mode, unit = 'units', metric = 'the outcome', d = 2 }) {
  const confW = `${Math.round(r.conf * 100)}%`;
  const est = mode === '2x2' ? r.est : r.main.est, lo = mode === '2x2' ? r.lo : r.main.lo, hi = mode === '2x2' ? r.hi : r.main.hi, p = mode === '2x2' ? r.p : r.main.p;
  const excludes = lo > 0 || hi < 0;
  const dir = est > 0 ? 'raised' : 'lowered';
  const headline = excludes
    ? `Compared with the change in the comparison group, the treatment ${dir} ${metric} by ${fmt(Math.abs(est), d)} (${confW} CI ${fmt(lo, d)} to ${fmt(hi, d)}, ${pText(p)}).`
    : `The difference-in-differences is ${signed(est, d)} for ${metric}, but the ${confW} interval (${fmt(lo, d)} to ${fmt(hi, d)}) includes zero, so the data cannot separate the effect from noise.`;
  const meaning = [];
  if (mode === '2x2') {
    meaning.push(`The treated group changed by ${signed(r.tChange, d)} and the comparison group by ${signed(r.cChange, d)}; the comparison group's change stands in for what would have happened to the treated group anyway.`);
    meaning.push(`Without the treatment, the treated group would have been expected at about ${fmt(r.counterfactual, d)}; the estimate is ${signed(r.rel * 100, 1)}% of that.`);
    if (Math.abs(r.preGap) > 0) meaning.push(`The groups started ${fmt(Math.abs(r.preGap), d)} apart. That is allowed: DiD removes a fixed gap, but it assumes the gap would have stayed the same.`);
  } else {
    meaning.push(`The model compares ${r.Gt} treated and ${r.Gc} comparison ${unit} over ${r.periods.length} periods (${r.pre.length} before, ${r.post.length} after), with errors clustered by ${unit.replace(/s$/, '')}.`);
    meaning.push(`Without the treatment, the treated group's post-period average would have been about ${fmt(r.counterfactual, d)}; the effect is ${signed(r.rel * 100, 1)}% of that.`);
    if (r.preJoint) meaning.push(`Before the start, the event-study gaps are jointly ${r.preJoint.p < 0.1 ? 'different from zero' : 'close to zero'} (F = ${fmt(r.preJoint.F, 2)}, ${pText(r.preJoint.p)}), ${r.preJoint.p < 0.1 ? 'which casts doubt on parallel trends' : 'which is consistent with parallel trends (but does not prove them)'}.`);
    if (r.trend) meaning.push(`The pre-period slopes differ by ${signed(r.trend.b, 3)} per period (${pText(r.trend.p)}).`);
    const postEv = r.event.filter((e) => !e.pre);
    if (postEv.length > 1) meaning.push(`Period by period after the start, the gap runs from ${signed(postEv[0].b, d)} to ${signed(postEv[postEv.length - 1].b, d)}.`);
  }
  const preBad = mode === 'panel' && ((r.preJoint && r.preJoint.p < 0.05) || (r.trend && r.trend.p < 0.05));
  const preWarn = mode === 'panel' && ((r.preJoint && r.preJoint.p < 0.1) || (r.trend && r.trend.p < 0.1));
  const fewClusters = mode === 'panel' && r.G < 20;
  let confidence, confidenceNote;
  if (!excludes || preBad) {
    confidence = 'low';
    confidenceNote = !excludes ? `The ${confW} interval includes zero.` : 'A pre-period check rejects parallel trends (p < 0.05), so the comparison group may not show what would have happened.';
  } else if (mode === '2x2' || preWarn || fewClusters) {
    confidence = 'medium';
    confidenceNote = mode === '2x2' ? 'The interval excludes zero, but with only one period before and after there is no way to check parallel trends.' : preWarn ? 'The interval excludes zero, but a pre-period check is borderline (p < 0.10).' : `The interval excludes zero, but with only ${r.G} ${unit} the cluster-robust errors may be too small (Cameron and Miller 2015 suggest at least 20–50 clusters).`;
  } else {
    confidence = 'high';
    confidenceNote = `The interval excludes zero, the pre-period checks do not reject parallel trends (p ≥ 0.10) and there are ${r.G} ${unit} to cluster on.`;
  }
  confidenceNote += ' Rule: strong = interval excludes zero, pre-trend p ≥ 0.10 and at least 20 clusters; weak = interval includes zero or pre-trend p < 0.05; some otherwise (2×2 mode is at most "some").';
  const caveats = [
    'DiD rests on parallel trends: without the treatment, both groups would have moved together. Pre-period checks can only fail to find a problem; they cannot prove it.',
    mode === '2x2' ? 'With four independent samples the standard error ignores any repeated measurement of the same people; if the same people were measured twice, use the panel mode.' : 'If units adopted the change at different times, a single before/after split can be biased (Goodman-Bacon 2021); look at the event-study coefficients by period.',
    'Anything else that changed only for the treated group at the same time (a campaign, a price change) is mixed into the estimate.',
  ];
  const next = [
    mode === '2x2' ? 'If you have several periods before the change, switch to panel mode to check pre-trends.' : 'Check the event-study plot: the pre-period points should sit near zero with no slope.',
    'Ask how robust the effect is to an unmeasured confounder with the [E-value](/calculators/e-value) calculator.',
    'For a single series with no comparison group, use [control charts and interrupted time series](/calculators/control-charts).',
  ];
  const report = mode === '2x2'
    ? `Difference-in-differences of group means: the treated group changed by ${signed(r.tChange, d)} and the comparison group by ${signed(r.cChange, d)}, an estimated effect of ${signed(est, d)} (${confW} CI ${fmt(lo, d)} to ${fmt(hi, d)}; Welch t, df = ${fmt(r.df, 1)}, ${pText(p)}).`
    : `Difference-in-differences with ${r.Gt} treated and ${r.Gc} comparison ${unit} over ${r.periods.length} periods: effect ${signed(est, d)} (${confW} CI ${fmt(lo, d)} to ${fmt(hi, d)}, ${pText(p)}; OLS with cluster-robust errors by ${unit.replace(/s$/, '')}, t on ${r.main.df} df).${r.preJoint ? ` Joint test of pre-period event-study coefficients: F(${r.preJoint.q}, ${r.preJoint.df2}) = ${fmt(r.preJoint.F, 2)}, ${pText(r.preJoint.p)}.` : ''}`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}

export { variance, toNum };
