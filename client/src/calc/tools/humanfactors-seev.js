// SEEV model of visual attention allocation (Wickens, Helleberg, Goh, Xu and Horrey 2001; Wickens, Goh,
// Helleberg, Horrey and Talleur 2003, Human Factors 45(3), 360–380; Wickens and McCarley 2008, Applied Attention
// Theory). Pure functions, no React.
//   P(A_i) = s·S_i − ef·EF_i + ex·EX_i + v·V_i          (additive form)
//   P(A_i) = s·S_i − ef·EF_i + ex·EX_i × v·V_i          (expectancy × value form, used when value is task relevance
//                                                         × task priority and only matters where events occur)
// Predicted percent dwell time (PDT) = max(0, P_i) / Σ max(0, P_j).
import { pearson, spearman, mean, sig, fmt, nonEmptyLines, splitCells } from './humanfactors-core.js';

export function parseAois(text) {
  const rows = [], errors = [];
  for (const line of nonEmptyLines(text)) {
    const c = splitCells(line);
    if (c.length < 5) { errors.push(`"${line}" needs a name and four ratings: salience, effort, expectancy, value (and optionally observed % dwell).`); continue; }
    const v = c.slice(1, 6).map((x) => (x === '' ? NaN : Number(x)));
    if (!v.slice(0, 4).every(Number.isFinite)) { if (rows.length === 0 && !Number.isFinite(Number(c[1]))) continue; errors.push(`"${line}": the four ratings must be numbers.`); continue; }
    rows.push({ name: c[0], S: v[0], EF: v[1], EX: v[2], V: v[3], obs: Number.isFinite(v[4]) ? v[4] : null });
  }
  return { rows, errors };
}
export function seev(rows, { s = 1, ef = 1, ex = 1, v = 1, form = 'add' } = {}) {
  const raw = rows.map((r) => s * r.S - ef * r.EF + (form === 'mult' ? ex * r.EX * v * r.V : ex * r.EX + v * r.V));
  const pos = raw.map((x) => Math.max(0, x));
  const tot = pos.reduce((a, b) => a + b, 0);
  const pred = pos.map((x) => (tot > 0 ? (100 * x) / tot : NaN));
  const out = rows.map((r, i) => ({ ...r, raw: raw[i], pred: pred[i] }));
  const withObs = out.filter((r) => r.obs !== null);
  let fit = null;
  if (withObs.length >= 3) {
    const ot = withObs.reduce((a, r) => a + r.obs, 0);
    const obsN = withObs.map((r) => (100 * r.obs) / ot);
    const pt = withObs.reduce((a, r) => a + r.pred, 0);
    const predN = withObs.map((r) => (100 * r.pred) / pt);
    const pr = pearson(predN, obsN);
    fit = { n: withObs.length, r: pr.r, lo: pr.lo, hi: pr.hi, p: pr.p, rho: spearman(predN, obsN), mad: mean(predN.map((p, i) => Math.abs(p - obsN[i]))), obsN, predN, names: withObs.map((r) => r.name), obsTotal: ot };
  }
  return { rows: out, fit, clipped: raw.filter((x) => x < 0).length };
}
// Confidence rule (SEEV): the model is a rating exercise, so confidence depends on validation against observed
// dwell. High when at least 6 AOIs were compared and r ≥ 0.8 with a 95% interval lower bound above 0.5;
// medium when at least 4 AOIs and r ≥ 0.6; low otherwise, or when there are no observed data.
export function seevSummary(m) {
  const top = [...m.rows].sort((a, b) => b.pred - a.pred);
  const f = m.fit;
  const confidence = !f ? 'low' : f.n >= 6 && f.r >= 0.8 && f.lo > 0.5 ? 'high' : f.n >= 4 && f.r >= 0.6 ? 'medium' : 'low';
  const headline = `SEEV predicts that "${top[0].name}" draws the most attention (${fmt(top[0].pred, 0)}% of dwell time)${f ? `, and the predictions correlate r = ${sig(f.r, 2)} with the observed dwell` : ''}.`;
  const meaning = [`Predicted shares: ${top.map((r) => `${r.name} ${fmt(r.pred, 0)}%`).join(', ')}.`];
  if (f) {
    const diffs = f.names.map((n, i) => ({ n, d: f.obsN[i] - f.predN[i] })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    meaning.push(`Across ${f.n} areas, r = ${sig(f.r, 2)} (95% CI ${sig(f.lo, 2)} to ${sig(f.hi, 2)}), Spearman ρ = ${sig(f.rho, 2)}; the average gap is ${sig(f.mad, 2)} percentage points.`);
    meaning.push(`Biggest mismatch: "${diffs[0].n}" got ${fmt(Math.abs(diffs[0].d), 0)} points ${diffs[0].d > 0 ? 'more' : 'less'} attention than predicted${diffs[0].d > 0 ? ', so something (salience, habit or an unrated task) pulls the eyes there' : ', so it may be harder to reach or less useful than rated'}.`);
  } else meaning.push('Add observed dwell percentages from eye tracking to test the predictions.');
  const lowValueHigh = m.rows.filter((r) => r.S >= Math.max(...m.rows.map((x) => x.S)) && r.V <= Math.min(...m.rows.map((x) => x.V)) && m.rows.length > 2);
  if (lowValueHigh.length) meaning.push(`"${lowValueHigh[0].name}" is among the most salient but least valuable areas: salience there pulls attention away from task-relevant information.`);
  if (m.clipped) meaning.push(`${m.clipped} area${m.clipped > 1 ? 's have' : ' has'} a negative score (effort outweighs everything else) and is predicted to get no attention.`);
  const caveats = ['The ratings are ordinal judgements; the coefficients (all 1 by default) set how much each factor counts. Fit them to dwell data before using the model for absolute predictions.', 'With few areas, a correlation can be high by chance; the interval shows how wide the uncertainty is.'];
  const next = ['Use the what-if controls: make high-value areas more salient and easier to reach, and lower the salience of low-value ones.', 'Validate with eye tracking on the real display, using the same areas of interest.'];
  const report = `A SEEV model (Wickens et al. 2003) of ${m.rows.length} areas of interest predicted the largest dwell share for ${top[0].name} (${fmt(top[0].pred, 0)}%)${f ? `; predicted and observed percent dwell times correlated r = ${sig(f.r, 2)} (95% CI ${sig(f.lo, 2)} to ${sig(f.hi, 2)}, n = ${f.n} areas)` : ''}.`;
  return { headline, meaning, confidence, confidenceNote: 'High when at least 6 areas were compared with observed dwell, r ≥ 0.8 and the interval\'s lower bound is above 0.5; medium with at least 4 areas and r ≥ 0.6; low otherwise or without observed data.', caveats, next, report };
}
// Example: a car driver's display areas, rated 0–3 (S, EF, EX, V). Observed dwell is illustrative.
export const EXAMPLE = `Area, Salience, Effort, Expectancy, Value, Observed % dwell
Road ahead, 2, 0, 3, 3, 62
Left mirror, 1, 2, 1, 2, 4
Rear-view mirror, 1, 1, 1, 2, 6
Speedometer, 1, 1, 2, 2, 9
Navigation display, 2, 1, 2, 1, 11
Infotainment screen, 3, 2, 1, 0, 8`;
