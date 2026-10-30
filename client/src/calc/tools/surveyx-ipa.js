// Importance-performance analysis (Martilla and James 1977) with stated or derived importance, plus the KAP gap
// (Rogers 2003) and the awareness-usefulness gap (Albert and Tullis). Pure functions shared by surveyx-Ipa.jsx and
// server/scripts/check-surveyx.js.
import { parseTable, isNum, numericColumn, mean, median, pearson, spearman, wilson, newcombe, fmt, pct, pval } from './surveyx-core.js';

export const QUADS = {
  concentrate: ['Concentrate here', 'High importance, low performance: fix these first'],
  keep: ['Keep up the good work', 'High importance, high performance: protect these'],
  low: ['Low priority', 'Low importance, low performance: leave for now'],
  overkill: ['Possible overkill', 'Low importance, high performance: effort may be better spent elsewhere'],
};

// Stated importance: one row per attribute with mean importance and mean performance.
export function parseStated(text) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const nums = t.head.map((_, j) => numericColumn(t.rows, j));
  const ni = nums.indexOf(true), np = nums.indexOf(true, ni + 1);
  if (ni < 0 || np < 0) return { error: 'Give a name column, then an importance column and a performance column.' };
  const nameCol = nums.indexOf(false) >= 0 ? nums.indexOf(false) : -1;
  const attrs = t.rows.filter((r) => isNum(r[ni]) && isNum(r[np])).map((r, i) => ({ name: nameCol >= 0 ? r[nameCol] : `Attribute ${i + 1}`, imp: Number(r[ni]), perf: Number(r[np]) }));
  return { attrs, impLabel: t.head[ni], perfLabel: t.head[np] };
}
// Derived importance: respondent-level ratings of each attribute plus an overall outcome; importance is the correlation
// of each attribute with the outcome, performance is the attribute's mean rating.
export function deriveImportance(text, outcomeCol, method = 'pearson') {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const nums = t.head.map((_, j) => numericColumn(t.rows, j));
  const oc = outcomeCol >= 0 && nums[outcomeCol] ? outcomeCol : nums.lastIndexOf(true);
  const cols = t.head.map((_, j) => j).filter((j) => j !== oc && nums[j]);
  if (oc < 0 || cols.length < 2) return { error: 'Paste one row per respondent: a numeric column per attribute and an overall outcome column (satisfaction, likelihood to recommend).' };
  const f = method === 'spearman' ? spearman : pearson;
  const attrs = cols.map((j) => {
    const pairs = t.rows.filter((r) => isNum(r[j]) && isNum(r[oc])).map((r) => [Number(r[j]), Number(r[oc])]);
    const c = f(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    return { name: t.head[j], imp: c.r, perf: mean(t.rows.filter((r) => isNum(r[j])).map((r) => Number(r[j]))), lo: c.lo, hi: c.hi, p: c.p, n: pairs.length };
  });
  return { attrs, outcome: t.head[oc], outcomeCol: oc, n: t.rows.length, impLabel: `${method === 'spearman' ? 'Spearman' : 'Pearson'} r with ${t.head[oc]}`, perfLabel: 'Mean rating', head: t.head, nums };
}
export function ipa(attrs, { cross = 'mean', impAt, perfAt } = {}) {
  const imps = attrs.map((a) => a.imp), perfs = attrs.map((a) => a.perf);
  const ci = cross === 'custom' && Number.isFinite(impAt) ? impAt : cross === 'median' ? median(imps) : mean(imps);
  const cp = cross === 'custom' && Number.isFinite(perfAt) ? perfAt : cross === 'median' ? median(perfs) : mean(perfs);
  const out = attrs.map((a) => {
    const hiI = a.imp >= ci, hiP = a.perf >= cp;
    const q = hiI ? (hiP ? 'keep' : 'concentrate') : hiP ? 'overkill' : 'low';
    return { ...a, q, gap: a.imp - a.perf, dImp: a.imp - ci, dPerf: a.perf - cp };
  });
  // Priority within the quadrant: distance below the performance line weighted by distance above the importance line.
  const ranked = [...out].sort((a, b) => (a.q === 'concentrate' ? 0 : 1) - (b.q === 'concentrate' ? 0 : 1) || (b.dImp - b.dPerf) - (a.dImp - a.dPerf));
  return { attrs: out, ranked, ci, cp, cross, counts: Object.fromEntries(Object.keys(QUADS).map((k) => [k, out.filter((a) => a.q === k).length])) };
}

// ── KAP gap: counts who know, favour and practise, treated as a nested funnel ──
export function parseKap(text) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const rows = t.rows.filter((r) => [1, 2, 3, 4].every((j) => isNum(r[j]))).map((r) => ({ name: r[0], n: Number(r[1]), know: Number(r[2]), favour: Number(r[3]), practise: Number(r[4]) }));
  if (!rows.length) return { error: 'Use columns: behaviour, respondents, know, favour, practise.' };
  return { rows };
}
export function kap(rows, conf = 0.95) {
  return rows.map((r) => {
    const K = wilson(r.know, r.n, conf), A = wilson(r.favour, r.n, conf), P = wilson(r.practise, r.n, conf);
    const drops = [
      ['knowledge', r.n - r.know, 'never heard of it'],
      ['attitude', r.know - r.favour, 'know but do not favour it'],
      ['practice', r.favour - r.practise, 'favour but do not do it'],
    ].map(([stage, x, what]) => ({ stage, x, what, ...wilson(Math.max(0, x), r.n, conf) }));
    const worst = [...drops].sort((a, b) => b.x - a.x)[0];
    const nested = r.know <= r.n && r.favour <= r.know && r.practise <= r.favour;
    return { ...r, K, A, P, drops, worst, nested, kapGap: K.p - P.p, aToP: r.favour > 0 ? r.practise / r.favour : NaN, kToA: r.know > 0 ? r.favour / r.know : NaN };
  });
}

// ── Awareness-usefulness gap ──
export function parseAware(text) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const rows = t.rows.filter((r) => [1, 2, 3, 4].every((j) => isNum(r[j]))).map((r) => ({ name: r[0], nA: Number(r[1]), aware: Number(r[2]), nU: Number(r[3]), useful: Number(r[4]) }));
  if (!rows.length) return { error: 'Use columns: feature, asked about awareness, aware, rated usefulness, useful (top-2-box).' };
  return { rows };
}
export function awareness(rows, conf = 0.95) {
  return rows.map((r) => {
    const A = wilson(r.aware, r.nA, conf), U = wilson(r.useful, r.nU, conf), g = newcombe(r.useful, r.nU, r.aware, r.nA, conf);
    const tag = g.lo > 0 ? 'promote' : g.hi < 0 ? 'known' : 'even';
    return { ...r, A, U, gap: g.d, lo: g.lo, hi: g.hi, tag };
  }).sort((a, b) => b.gap - a.gap);
}

// ── "Reading your results" ──
// Confidence rule (IPA): with derived importance, high when n ≥ 200 respondents, medium when n ≥ 60, low otherwise;
// with stated means, the same thresholds on the number of respondents behind the means, and low when it is not given.
// Quadrant edges are always fuzzy, so attributes within 10% of the axis range of a crosshair are flagged as borderline.
export function ipaSummary(r, { n = 0, derived = false, outcome = '' } = {}) {
  const confidence = n >= 200 ? 'high' : n >= 60 ? 'medium' : 'low';
  const conc = r.ranked.filter((a) => a.q === 'concentrate'), keep = r.attrs.filter((a) => a.q === 'keep'), over = r.attrs.filter((a) => a.q === 'overkill');
  const iR = Math.max(...r.attrs.map((a) => a.imp)) - Math.min(...r.attrs.map((a) => a.imp)) || 1, pR = Math.max(...r.attrs.map((a) => a.perf)) - Math.min(...r.attrs.map((a) => a.perf)) || 1;
  const border = r.attrs.filter((a) => Math.abs(a.dImp) < 0.1 * iR || Math.abs(a.dPerf) < 0.1 * pR);
  const list = (xs) => xs.map((a) => a.name).join(', ');
  return {
    headline: conc.length ? `${conc.length} attribute${conc.length === 1 ? '' : 's'} fall in "Concentrate here": ${list(conc)}.` : 'No attribute is both above-average in importance and below-average in performance.',
    meaning: [
      `Crosshairs at the ${r.cross === 'custom' ? 'values you chose' : r.cross} of the attributes: importance ${fmt(r.ci, derived ? 3 : 2)}, performance ${fmt(r.cp)}. Positions are relative to these attributes, not absolute good or bad.`,
      keep.length ? `Keep up the good work: ${list(keep)}.` : 'No attribute is both important and performing well; strengths are missing where it matters.',
      over.length ? `Possible overkill: ${list(over)}. These perform well but matter less${derived ? ` to ${outcome}` : ''}; do not cut them blindly, as low derived importance can hide basic expectations.` : 'Nothing looks like overkill.',
      derived ? `Importance is the correlation of each attribute with ${outcome}, so it shows what moves together with the outcome, not what people say matters. Attributes rated high by almost everyone correlate weakly even when essential.` : 'Importance is what people said matters; stated importance tends to rate everything as important, so the spread is often small.',
      border.length ? `${list(border)} ${border.length === 1 ? 'sits' : 'sit'} close to a crosshair; small changes could move ${border.length === 1 ? 'it' : 'them'} to another quadrant.` : '',
    ].filter(Boolean),
    confidence,
    confidenceNote: `Rule: high with at least 200 respondents, medium with at least 60, low otherwise or when the number is not given (here ${n || 'not given'}). Attributes within 10% of the axis range of a crosshair are treated as borderline.`,
    caveats: [
      'Moving the crosshairs (mean, median or scale midpoint) moves attributes between quadrants; report which you used.',
      derived ? 'Correlations between attributes (halo) inflate every derived importance; for unique contributions use [key driver analysis](/calculators/key-drivers).' : 'Stated importance and performance must be on comparable scales for the gap column to mean anything.',
    ],
    next: [
      conc.length ? `Plan design work on ${conc[0].name} first, then re-measure performance with the same items.` : 'Look at the lowest-performing important attributes anyway; quadrant boundaries are arbitrary.',
      'Check whether segments disagree: run the grid separately for new and experienced users.',
    ],
    report: `Importance-performance analysis of ${r.attrs.length} attributes (${derived ? `importance derived as correlation with ${outcome}` : 'stated importance'}, crosshairs at the ${r.cross}${n ? `, n = ${n}` : ''}) placed ${conc.length ? list(conc) : 'no attribute'} in the "concentrate here" quadrant.`,
  };
}

// Confidence rule (KAP): high when every behaviour has at least 200 respondents, medium when at least 50, low otherwise.
export function kapSummary(rows) {
  const minN = Math.min(...rows.map((r) => r.n)), confidence = minN >= 200 ? 'high' : minN >= 50 ? 'medium' : 'low';
  const big = [...rows].sort((a, b) => b.kapGap - a.kapGap)[0];
  const stalls = { knowledge: rows.filter((r) => r.worst.stage === 'knowledge'), attitude: rows.filter((r) => r.worst.stage === 'attitude'), practice: rows.filter((r) => r.worst.stage === 'practice') };
  return {
    headline: `The largest KAP gap is for ${big.name}: ${pct(big.K.p, 0)} know about it but only ${pct(big.P.p, 0)} do it (${fmt(big.kapGap * 100, 0)} points).`,
    meaning: [
      ...rows.slice(0, 4).map((r) => `${r.name}: know ${pct(r.K.p, 0)}, favour ${pct(r.A.p, 0)}, practise ${pct(r.P.p, 0)}. The biggest loss is at ${r.worst.stage} (${pct(r.worst.p, 0)} ${r.worst.what}, 95% CI ${pct(r.worst.lo, 0)} to ${pct(r.worst.hi, 0)}).`),
      stalls.practice.length ? `Where people know and agree but do not act (${stalls.practice.map((r) => r.name).join(', ')}), more awareness campaigns will not help; look at friction in the flow, cost or habit.` : '',
    ].filter(Boolean),
    confidence,
    confidenceNote: `Rule: high when every behaviour has at least 200 respondents, medium when at least 50, low otherwise (smallest here ${minN}). Intervals are Wilson 95% intervals and treat the stages as a nested funnel.`,
    caveats: [
      'Self-reported practice is usually inflated; link answers to product logs where you can.',
      rows.some((r) => !r.nested) ? 'Some rows are not nested (more people favour than know, or practise than favour); the stage losses are then net figures.' : 'The funnel assumes people only favour what they know and only practise what they favour.',
    ],
    next: ['Interview people stuck at the biggest stage to learn why (for practice gaps, observe the flow).', 'Repeat the same three questions after a change to show which stage moved.'],
    report: `Of ${big.n} respondents, ${pct(big.K.p, 0)} knew about ${big.name}, ${pct(big.A.p, 0)} favoured it and ${pct(big.P.p, 0)} practised it, a KAP gap of ${fmt(big.kapGap * 100, 0)} points concentrated at the ${big.worst.stage} stage.`,
  };
}

// Confidence rule (awareness-usefulness): high when every feature has at least 100 answers to both questions, medium when
// at least 30, low otherwise. Features are flagged "promote" only when the 95% interval for usefulness − awareness is
// entirely above zero.
export function awarenessSummary(rows) {
  const minN = Math.min(...rows.map((r) => Math.min(r.nA, r.nU))), confidence = minN >= 100 ? 'high' : minN >= 30 ? 'medium' : 'low';
  const prom = rows.filter((r) => r.tag === 'promote'), top = rows[0];
  return {
    headline: prom.length ? `${prom.length} feature${prom.length === 1 ? ' is' : 's are'} clearly more useful than known: ${prom.map((r) => r.name).join(', ')}.` : `No feature is clearly more useful than it is known; the biggest gap is ${top.name} (${fmt(top.gap * 100, 0)} points).`,
    meaning: [
      `${top.name}: ${pct(top.U.p, 0)} found it useful after trying it, but only ${pct(top.A.p, 0)} knew about it (gap ${fmt(top.gap * 100, 0)} points, 95% CI ${fmt(top.lo * 100, 0)} to ${fmt(top.hi * 100, 0)}).`,
      'High usefulness with low awareness means a discoverability problem: promote it in onboarding or move it where people look. Low usefulness with high awareness means people know it and do not want it.',
    ],
    confidence,
    confidenceNote: `Rule: high when every feature has at least 100 answers to both questions, medium when at least 30, low otherwise (smallest here ${minN}). Gap intervals use Newcombe's method treating the two questions as independent samples, which is conservative when the same people answered both.`,
    caveats: [
      'Ask about awareness before showing the feature, or the question itself creates awareness (Albert and Tullis).',
      'Usefulness judged after a two-minute trial may not match real use; check adoption in analytics after you promote a feature.',
    ],
    next: ['Prototype a more prominent entry point for the top feature and test discoverability with a first-click test.', 'Track adoption of promoted features in analytics.'],
    report: `Across ${rows.length} features, the largest usefulness-awareness gap was ${top.name} (${pct(top.U.p, 0)} useful vs ${pct(top.A.p, 0)} aware, gap ${fmt(top.gap * 100, 0)} points, 95% CI ${fmt(top.lo * 100, 0)} to ${fmt(top.hi * 100, 0)}).`,
  };
}
