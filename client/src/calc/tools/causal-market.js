// Market sizing: TAM, SAM and SOM as products of uncertain inputs, from a top-down and a bottom-up chain. Each input
// is a 90% range (5th and 95th percentiles) with a log-normal or triangular shape; a Monte Carlo run (in the Web
// Worker) gives the distribution of each size, and a tornado shows which inputs matter. Checked against the exact
// log-normal product and scipy in server/scripts/causal-reference.py.
import { rng, normInv, quantileSorted, fmt, short } from './causal-core.js';

const Z95 = normInv(0.95);
export const STAGES = ['TAM', 'SAM', 'SOM'];

// ── Input distributions ──
// Log-normal from a 90% range: μ = (ln lo + ln hi)/2, σ = (ln hi − ln lo)/(2·1.645).
export const lnParams = (lo, hi) => ({ mu: (Math.log(lo) + Math.log(hi)) / 2, sigma: (Math.log(hi) - Math.log(lo)) / (2 * Z95) });
export function triCdf(x, a, c, b) {
  if (x <= a) return 0; if (x >= b) return 1;
  return x <= c ? (x - a) ** 2 / ((b - a) * (c - a || 1e-300)) : 1 - (b - x) ** 2 / ((b - a) * (b - c || 1e-300));
}
export function triInv(u, a, c, b) {
  const fc = (c - a) / (b - a);
  return u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}
// Triangular distribution with mode c whose 5th and 95th percentiles are lo and hi: solves for the minimum a and
// maximum b by nested bisection (F(hi) = 0.95 for each a; then F(lo) = 0.05).
export function triFromRange(lo, c, hi) {
  const w = hi - lo;
  const bFor = (a) => { let l = Math.max(hi, c), h = Math.max(hi, c) + 50 * w; for (let i = 0; i < 90; i++) { const m = (l + h) / 2; if (triCdf(hi, a, c, m) > 0.95) l = m; else h = m; } return (l + h) / 2; };
  let l = Math.min(lo, c) - 50 * w, h = Math.min(lo, c);
  for (let i = 0; i < 90; i++) { const m = (l + h) / 2; if (triCdf(lo, m, c, bFor(m)) > 0.05) l = m; else h = m; }
  const a = (l + h) / 2;
  return { a, c, b: bFor(a) };
}
// Prepares one input. Values are in natural units (shares as fractions). dist: 'lognormal' | 'triangular'.
export function prepInput(x) {
  const lo = Number(x.lo), hi = Number(x.hi), mode = Number(x.mode);
  const base = { ...x, lo, hi, mode };
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return { ...base, error: `${x.name}: enter a low and a high value.` };
  if (lo > hi) return { ...base, error: `${x.name}: the low value is above the high value.` };
  if (lo < 0) return { ...base, error: `${x.name}: values cannot be negative.` };
  if (x.kind === 'share' && hi > 1) return { ...base, error: `${x.name}: a share cannot be above 100%.` };
  if (lo === hi) return { ...base, fixed: true, median: lo, q05: lo, q95: lo, sample: () => lo };
  if (x.dist === 'triangular') {
    const c = Number.isFinite(mode) ? mode : (lo + hi) / 2;
    if (c < lo || c > hi) return { ...base, error: `${x.name}: the most likely value must lie between low and high.` };
    const t = triFromRange(lo, c, hi), cap = x.kind === 'share' ? 1 : Infinity, floor = 1e-9 * hi;
    const clip = (v) => Math.min(cap, Math.max(floor, v));
    return { ...base, tri: t, clipped: t.a < 0 || (x.kind === 'share' && t.b > 1), median: clip(triInv(0.5, t.a, t.c, t.b)), q05: lo, q95: hi, sample: (u) => clip(triInv(u(), t.a, t.c, t.b)) };
  }
  if (!(lo > 0)) return { ...base, error: `${x.name}: a log-normal range needs a low value above zero.` };
  const { mu, sigma } = lnParams(lo, hi), cap = x.kind === 'share' ? 1 : Infinity;
  const u2n = (u) => { let a = u(); while (a <= 1e-300) a = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); };
  return { ...base, mu, sigma, clipped: x.kind === 'share' && Math.exp(mu + 2.576 * sigma) > 1, median: Math.min(cap, Math.exp(mu)), q05: lo, q95: hi, sample: (u) => Math.min(cap, Math.exp(mu + sigma * u2n(u))) };
}

// ── Monte Carlo ──
// chains: [{ name, items: [{ name, lo, mode, hi, dist, kind, stage }] }]. Returns, per chain and stage, percentiles,
// mean, a histogram of log10 values, the one-way tornado and each input's share of Var(log size).
export function simulateMarket(chains, { draws = 100000, seed = 7 } = {}) {
  const u = rng(seed);
  return chains.map((ch, ci) => {
    const items = ch.items.map(prepInput);
    const err = items.find((x) => x.error);
    if (err) return { name: ch.name, error: err.error };
    for (const s of STAGES) if (!items.some((x) => x.stage === s) && s === 'TAM') return { name: ch.name, error: `${ch.name}: add at least one TAM input.` };
    const n = draws, cols = items.map(() => new Float64Array(n));
    const out = Object.fromEntries(STAGES.map((s) => [s, new Float64Array(n)]));
    const stageIdx = (s) => STAGES.indexOf(s);
    for (let i = 0; i < n; i++) {
      const acc = [1, 1, 1];
      items.forEach((x, j) => { const v = x.sample(u); cols[j][i] = v; for (let k = stageIdx(x.stage); k < 3; k++) acc[k] *= v; });
      out.TAM[i] = acc[0]; out.SAM[i] = acc[1]; out.SOM[i] = acc[2];
    }
    // Variance of log values per input (inputs are independent, so Var(log size) is their sum).
    const vlog = cols.map((c) => { let m = 0; for (let i = 0; i < n; i++) m += Math.log(c[i]); m /= n; let v = 0; for (let i = 0; i < n; i++) v += (Math.log(c[i]) - m) ** 2; return v / (n - 1); });
    const stages = {};
    for (const s of STAGES) {
      const inc = items.map((x, j) => (stageIdx(x.stage) <= stageIdx(s) ? j : -1)).filter((j) => j >= 0);
      const sorted = Float64Array.from(out[s]).sort();
      let mean = 0; for (let i = 0; i < n; i++) mean += out[s][i]; mean /= n;
      const q = (p) => quantileSorted(sorted, p);
      const base = inc.reduce((a, j) => a * items[j].median, 1);
      const tot = inc.reduce((a, j) => a + vlog[j], 0);
      const tornado = inc.map((j) => ({ name: items[j].name, lo: (base / items[j].median) * items[j].q05, hi: (base / items[j].median) * items[j].q95, share: tot > 0 ? vlog[j] / tot : 0 }))
        .sort((a, b) => (b.hi - b.lo) - (a.hi - a.lo));
      // Histogram on a log10 scale between the 0.5th and 99.5th percentiles.
      const L = Math.log10(Math.max(q(0.005), 1e-300)), H = Math.log10(Math.max(q(0.995), 1e-300)), bins = 40, hist = new Array(bins).fill(0);
      if (H > L) for (let i = 0; i < n; i++) { const b = Math.floor(((Math.log10(out[s][i]) - L) / (H - L)) * bins); if (b >= 0 && b < bins) hist[b]++; }
      stages[s] = { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), mean, base, tornado, hist: hist.map((c, b) => [10 ** (L + ((b + 0.5) * (H - L)) / bins), c / n]), logLo: L, logHi: H, has: s === 'TAM' || items.some((x) => x.stage === s) };
    }
    return { name: ch.name, idx: ci, stages, vlog, items: items.map(({ sample, ...rest }) => rest), clipped: items.filter((x) => x.clipped).map((x) => x.name) };
  });
}

// ── Example: a UX research repository tool sold to product teams (UK, EU and US), sizes in £ per year. ──
export const EXAMPLE = {
  currency: '£',
  chains: [
    { name: 'Top-down', items: [
      { name: 'Companies with in-house product teams', lo: '120000', mode: '', hi: '260000', dist: 'lognormal', kind: 'count', stage: 'TAM' },
      { name: 'Annual research-tool budget per company', lo: '2500', mode: '', hi: '12000', dist: 'lognormal', kind: 'money', stage: 'TAM' },
      { name: 'Share in segments we serve (50–1,000 staff)', lo: '25', mode: '35', hi: '45', dist: 'triangular', kind: 'share', stage: 'SAM' },
      { name: 'Share of budget a repository can take', lo: '10', mode: '20', hi: '30', dist: 'triangular', kind: 'share', stage: 'SAM' },
      { name: 'Share we can win in three years', lo: '2', mode: '', hi: '8', dist: 'lognormal', kind: 'share', stage: 'SOM' },
    ] },
    { name: 'Bottom-up', items: [
      { name: 'UX researchers and designers', lo: '350000', mode: '', hi: '700000', dist: 'lognormal', kind: 'count', stage: 'TAM' },
      { name: 'Price per seat per year', lo: '540', mode: '720', hi: '960', dist: 'triangular', kind: 'money', stage: 'TAM' },
      { name: 'Share in companies we can sell to', lo: '30', mode: '40', hi: '50', dist: 'triangular', kind: 'share', stage: 'SAM' },
      { name: 'Share reachable through our channels', lo: '15', mode: '', hi: '40', dist: 'lognormal', kind: 'share', stage: 'SOM' },
      { name: 'Conversion of reached teams', lo: '4', mode: '', hi: '12', dist: 'lognormal', kind: 'share', stage: 'SOM' },
    ] },
  ],
};
// The page shows shares in %; the model uses fractions.
export const toModel = (chains) => chains.map((c) => ({ ...c, items: c.items.map((x) => (x.kind === 'share' ? { ...x, lo: x.lo === '' ? NaN : Number(x.lo) / 100, hi: x.hi === '' ? NaN : Number(x.hi) / 100, mode: x.mode === '' ? NaN : Number(x.mode) / 100 } : { ...x, lo: x.lo === '' ? NaN : Number(x.lo), hi: x.hi === '' ? NaN : Number(x.hi), mode: x.mode === '' ? NaN : Number(x.mode) })) }));
export const isMoney = (chain) => chain.items.some((x) => x.kind === 'money');
export const money = (x, cur, isM = true) => (isM ? `${cur}${short(x)}` : short(x));

// ── Reading your results ──
// Confidence rule: strong when both chains give a SOM, their medians are within a factor of 2 of each other and each
// chain's 90% range spans less than a factor of 10 (P95/P5); weak when the medians differ by more than a factor of 3
// or the 90% ranges do not overlap, or there is only one chain and its range spans more than a factor of 10; some
// otherwise. These factors are this tool's convention (triangulation practice: two independent estimates that agree
// within 2× are usually treated as corroborating each other).
export function marketSummary(res, { currency = '£', stage = 'SOM' } = {}) {
  const ok = res.filter((r) => !r.error && r.stages[stage].has);
  const fmtM = (r, x) => money(x, currency, isMoney(r));
  const a = ok[0], b = ok[1];
  const sa = a.stages[stage], sb = b ? b.stages[stage] : null;
  const headline = b
    ? `The ${stage} is about ${fmtM(a, sa.p50)} top-down and ${fmtM(b, sb.p50)} bottom-up (medians; 90% ranges ${fmtM(a, sa.p05)} to ${fmtM(a, sa.p95)} and ${fmtM(b, sb.p05)} to ${fmtM(b, sb.p95)}).`
    : `The ${stage} is about ${fmtM(a, sa.p50)} (median), with a 90% range of ${fmtM(a, sa.p05)} to ${fmtM(a, sa.p95)}.`;
  const meaning = [];
  for (const r of ok) meaning.push(`${r.name}: TAM ${fmtM(r, r.stages.TAM.p50)}${r.stages.SAM.has ? `, SAM ${fmtM(r, r.stages.SAM.p50)}` : ''}${r.stages.SOM.has ? `, SOM ${fmtM(r, r.stages.SOM.p50)}` : ''} (medians). The mean is higher than the median (${fmtM(r, r.stages[stage].mean)} for the ${stage}) because products of uncertain numbers are right-skewed.`);
  for (const r of ok) { const t = [...r.stages[stage].tornado].sort((x, y) => y.share - x.share)[0]; if (t) meaning.push(`${r.name}: the input that matters most is "${t.name}", with ${fmt(t.share * 100, 0)}% of the uncertainty (variance of the log ${stage}); narrowing it is the best use of research time.`); }
  const ratio = b ? Math.max(sa.p50, sb.p50) / Math.min(sa.p50, sb.p50) : NaN;
  const overlap = b ? sa.p05 <= sb.p95 && sb.p05 <= sa.p95 : true;
  const spans = ok.map((r) => r.stages[stage].p95 / r.stages[stage].p05);
  if (b) meaning.push(`The two chains' medians differ by a factor of ${fmt(ratio, 2)}${overlap ? ' and their 90% ranges overlap' : ' and their 90% ranges do not overlap'}.`);
  let confidence, confidenceNote;
  if ((b && (ratio > 3 || !overlap)) || (!b && spans[0] > 10)) { confidence = 'low'; confidenceNote = b ? `The top-down and bottom-up estimates disagree (a factor of ${fmt(ratio, 2)}${overlap ? '' : ', with no overlap'}).` : `There is only one chain and its 90% range spans a factor of ${fmt(spans[0], 0)}.`; }
  else if (b && ratio <= 2 && spans.every((s) => s < 10)) { confidence = 'high'; confidenceNote = `The two chains agree within a factor of ${fmt(ratio, 2)} and each 90% range spans less than a factor of 10.`; }
  else { confidence = 'medium'; confidenceNote = b ? `The chains agree within a factor of ${fmt(ratio, 2)}, but ${spans.some((s) => s >= 10) ? 'at least one range is very wide' : 'not within a factor of 2'}.` : 'Only one chain: add the other to triangulate.'; }
  confidenceNote += ' Rule (this tool\'s triangulation convention): strong = top-down and bottom-up medians within 2× and each 90% range under 10×; weak = medians more than 3× apart, ranges not overlapping, or one chain spanning over 10×; some otherwise. It reflects the inputs you gave, not their accuracy.';
  const caveats = [
    'The output is only as good as the ranges: people tend to give ranges that are too narrow, so the true uncertainty is usually larger.',
    'Inputs are treated as independent; if two inputs move together (for example price and share won), the real range is wider than shown.',
    ok.some((r) => r.clipped.length) ? `Some inputs were capped at 100% or floored near zero (${ok.flatMap((r) => r.clipped).join(', ')}); their ranges are a little narrower than entered.` : 'SOM is a market share you could win, not a forecast; it needs a go-to-market plan to back it.',
  ];
  const next = [
    'Spend research effort on the inputs at the top of the tornado; the others barely change the answer.',
    'Check your intervals for overconfidence with the 90% quiz in [forecast calibration](/calculators/forecast-calibration).',
    'Turn the SOM into a go or no-go decision with the [value of information](/calculators/value-of-information) calculator.',
  ];
  const report = `${ok.map((r) => `${r.name} ${stage} ${fmtM(r, r.stages[stage].p50)} (median; 90% range ${fmtM(r, r.stages[stage].p05)} to ${fmtM(r, r.stages[stage].p95)})`).join('; ')}, from a Monte Carlo simulation of ${ok.length > 1 ? 'top-down and bottom-up chains' : 'one chain'} with 90% ranges on every input.`;
  return { headline, meaning, confidence, confidenceNote, caveats, next, report };
}
