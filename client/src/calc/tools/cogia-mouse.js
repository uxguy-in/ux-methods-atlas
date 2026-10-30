// Mouse-tracking curvature (Freeman and Ambady 2010; Kieslich et al. 2019, the mousetrap conventions): remap each
// trajectory, measure maximum absolute deviation (MAD), area under the curve (AUC) and x-flips on the raw samples,
// time-normalise to 101 steps for mean trajectories, and compute the bimodality coefficient. Pure functions;
// validated against an independent numpy/scipy implementation in server/scripts/cogia-reference.py.
import { mean, sd, variance, meanCI, welch, tCdf, tInv, rng, gauss, fmt, pText, detectSep, splitRow, nonEmptyLines } from './cogia-core.js';

const findCol = (head, names) => head.findIndex((h) => names.includes(h.toLowerCase().replace(/[^a-z]/g, '')));

// Example: 12 participants choose between two plan names on screen (start button at the bottom centre, options in
// the top corners), 8 trials each. In "Ambiguous label" trials the unchosen option attracts the cursor more, and a
// few trials show a change of mind. Screen pixels (y grows downward), sampled about every 25 ms.
export function exampleCsv(seed = 2010) {
  const r = rng(seed), rows = ['participant,trial,condition,t,x,y'];
  const start = [640, 690], L = [190, 90], R = [1090, 90];
  for (let p = 1; p <= 12; p++) {
    for (let k = 1; k <= 8; k++) {
      const cond = k % 2 ? 'Clear label' : 'Ambiguous label';
      const right = r() < 0.5, tgt = right ? R : L, alt = right ? L : R;
      const flip = cond === 'Ambiguous label' && r() < 0.22;
      const pull = flip ? 0.55 + 0.25 * r() : (cond === 'Ambiguous label' ? 0.16 : 0.05) + 0.07 * Math.abs(gauss(r));
      const T = 700 + 450 * r() + (cond === 'Ambiguous label' ? 180 : 0) + (flip ? 250 : 0), wait = 80 + 120 * r();
      let t = 0;
      while (t <= T + 1e-9) {
        const u = Math.max(0, Math.min(1, (t - wait) / (T - wait)));
        const s = 10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5; // minimum-jerk progress
        const bump = pull * Math.sin(Math.PI * Math.min(1, s * 1.15)) ** 2;
        const jitter = u > 0 && u < 1 ? 0.8 : 0; // hand tremor only while moving
        const x = start[0] + s * (tgt[0] - start[0]) + bump * (alt[0] - tgt[0]) * (1 - s) + jitter * gauss(r);
        const y = start[1] + s * (tgt[1] - start[1]) + jitter * gauss(r);
        rows.push(`P${String(p).padStart(2, '0')},${k},${cond},${Math.round(t)},${x.toFixed(1)},${y.toFixed(1)}`);
        if (t >= T) break;
        t = Math.min(T, t + 20 + 10 * r());
      }
    }
  }
  return rows.join('\n');
}

// Parses sample-level CSV: trial and t, x, y columns are required; participant and condition are optional.
export function parseSamples(text) {
  const lines = nonEmptyLines(text);
  if (lines.length < 3) return { error: 'Paste a header row and the samples of at least one trial.' };
  const sep = detectSep(lines[0]), head = splitRow(lines[0], sep);
  const cP = findCol(head, ['participant', 'subject', 'id', 'pid', 'person']);
  const cTr = findCol(head, ['trial', 'trialid', 'trialnum', 'trialnumber']);
  const cC = findCol(head, ['condition', 'cond', 'group', 'type']);
  const cT = findCol(head, ['t', 'time', 'timestamp', 'ms', 'timems', 'timestamps']);
  const cX = findCol(head, ['x', 'xpos', 'mousex']), cY = findCol(head, ['y', 'ypos', 'mousey']);
  const missing = [cTr < 0 && 'trial', cT < 0 && 't', cX < 0 && 'x', cY < 0 && 'y'].filter(Boolean);
  if (missing.length) return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected a header such as participant,trial,condition,t,x,y.` };
  const map = new Map(); let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitRow(line, sep);
    const t = Number(c[cT]), x = Number(c[cX]), y = Number(c[cY]);
    if (![t, x, y].every(Number.isFinite) || !c[cTr]) { skipped++; continue; }
    const pid = cP >= 0 ? c[cP] : '', key = `${pid}\u0001${c[cTr]}`;
    if (!map.has(key)) map.set(key, { participant: pid, trial: c[cTr], condition: cC >= 0 ? (c[cC] || 'All') : 'All', t: [], x: [], y: [] });
    const tr = map.get(key); tr.t.push(t); tr.x.push(x); tr.y.push(y);
  }
  const trials = [...map.values()].map((tr) => {
    const idx = tr.t.map((_, i) => i).sort((a, b) => tr.t[a] - tr.t[b] || a - b);
    return { ...tr, t: idx.map((i) => tr.t[i]), x: idx.map((i) => tr.x[i]), y: idx.map((i) => tr.y[i]) };
  }).filter((tr) => tr.t.length >= 3 && tr.t[tr.t.length - 1] > tr.t[0]);
  if (!trials.length) return { error: 'No trial has at least 3 samples over a positive time span.' };
  return { trials, skipped, hasParticipant: cP >= 0, hasCondition: cC >= 0 };
}

// Remaps a trajectory: start at (0, 0), y upward (screen y is flipped when yDown), and mirrored so it ends on the
// right (x_end ≥ 0), so deviations towards the unchosen side are positive.
export function remap(tr, { yDown = true } = {}) {
  const x0 = tr.x[0], y0 = tr.y[0];
  let xs = tr.x.map((v) => v - x0); const ys = tr.y.map((v) => (yDown ? -(v - y0) : v - y0));
  if (xs[xs.length - 1] < 0) xs = xs.map((v) => -v);
  return { t: tr.t, x: xs, y: ys };
}
// Measures on the raw (remapped) samples. The direct path runs from the first to the last sample. For each sample,
// a = position along the path and d = signed perpendicular distance (positive to the left of the path's direction,
// that is towards the unchosen option). MAD = the d with the largest |d|; AUC = Σ (a_(i+1) − a_i)(d_i + d_(i+1))/2
// (areas on the far side of the path count negative); x-flips = changes of sign between successive non-zero x steps.
export function measures(m) {
  const n = m.x.length, ex = m.x[n - 1], ey = m.y[n - 1], len = Math.hypot(ex, ey) || 1, ux = ex / len, uy = ey / len;
  const a = m.x.map((x, i) => x * ux + m.y[i] * uy), d = m.x.map((x, i) => -x * uy + m.y[i] * ux);
  let mad = 0, madT = m.t[0];
  d.forEach((v, i) => { if (Math.abs(v) > Math.abs(mad)) { mad = v; madT = m.t[i]; } });
  let auc = 0; for (let i = 0; i + 1 < n; i++) auc += ((a[i + 1] - a[i]) * (d[i] + d[i + 1])) / 2;
  let flips = 0, last = 0;
  for (let i = 0; i + 1 < n; i++) { const s = Math.sign(m.x[i + 1] - m.x[i]); if (s !== 0) { if (last !== 0 && s !== last) flips++; last = s; } }
  let init = m.t[0]; for (let i = 1; i < n; i++) if (m.x[i] !== m.x[0] || m.y[i] !== m.y[0]) { init = m.t[i - 1]; break; }
  return { mad, madTime: madT - m.t[0], auc, flips, rt: m.t[n - 1] - m.t[0], init: init - m.t[0], len };
}
// Time normalisation: `steps` equally spaced times from the first to the last sample, x and y linearly interpolated.
export function timeNormalise(m, steps = 101) {
  const t0 = m.t[0], T = m.t[m.t.length - 1] - t0, xs = [], ys = []; let j = 0;
  for (let k = 0; k < steps; k++) {
    const tt = t0 + (T * k) / (steps - 1);
    while (j + 1 < m.t.length - 1 && m.t[j + 1] < tt) j++;
    const ta = m.t[j], tb = m.t[j + 1], w = tb > ta ? Math.min(1, Math.max(0, (tt - ta) / (tb - ta))) : 0;
    xs.push(m.x[j] + w * (m.x[j + 1] - m.x[j])); ys.push(m.y[j] + w * (m.y[j + 1] - m.y[j]));
  }
  return { x: xs, y: ys };
}
// Bimodality coefficient (SAS Institute 1990; Pfister et al. 2013): BC = (g₁² + 1) / (g₂ + 3(n − 1)²/((n − 2)(n − 3)))
// with the bias-corrected sample skewness g₁ and excess kurtosis g₂. BC above 0.555 suggests bimodality.
export function bimodality(xs) {
  const n = xs.length; if (n < 4) return { bc: NaN, skew: NaN, kurt: NaN, n };
  const m = mean(xs), d = xs.map((v) => v - m), m2 = mean(d.map((v) => v * v)), m3 = mean(d.map((v) => v ** 3)), m4 = mean(d.map((v) => v ** 4));
  const g1 = m3 / m2 ** 1.5, g2 = m4 / (m2 * m2) - 3;
  const skew = g1 * Math.sqrt(n * (n - 1)) / (n - 2), kurt = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
  return { bc: (skew * skew + 1) / (kurt + (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))), skew, kurt, n };
}
const z = (xs) => { const m = mean(xs), s = sd(xs); return xs.map((v) => (s > 0 ? (v - m) / s : 0)); };

export function analyseMouse(parsed, { yDown = true, steps = 101 } = {}) {
  const trials = parsed.trials.map((tr) => { const m = remap(tr, { yDown }); return { ...tr, m, ...measures(m), tn: timeNormalise(m, steps) }; });
  const conds = [...new Set(trials.map((t) => t.condition))];
  // AUC z-scored within participant when participants are known (so BC reflects the shape, not person differences).
  const zAuc = new Map();
  const groups = parsed.hasParticipant ? [...new Set(trials.map((t) => t.participant))] : [''];
  for (const g of groups) { const ts = trials.filter((t) => !parsed.hasParticipant || t.participant === g); z(ts.map((t) => t.auc)).forEach((v, i) => zAuc.set(ts[i], v)); }
  const per = conds.map((c) => {
    const ts = trials.filter((t) => t.condition === c);
    const avg = Array.from({ length: steps }, (_, k) => [mean(ts.map((t) => t.tn.x[k])), mean(ts.map((t) => t.tn.y[k]))]);
    const ci = (key) => (ts.length >= 2 ? meanCI(ts.map((t) => t[key])) : { mean: ts[0][key], lo: NaN, hi: NaN, sd: NaN, n: 1 });
    return { condition: c, n: ts.length, avg, mad: ci('mad'), auc: ci('auc'), flips: ci('flips'), rt: ci('rt'), init: ci('init'), bc: bimodality(ts.map((t) => zAuc.get(t))), bcRaw: bimodality(ts.map((t) => t.auc)) };
  });
  // Each condition against the first: paired t on participant means when participants are known, else Welch on trials.
  const compare = per.slice(1).map((pc) => {
    const out = { condition: pc.condition, ref: per[0].condition };
    for (const key of ['auc', 'mad', 'rt']) {
      if (parsed.hasParticipant) {
        const ids = groups.filter((g) => trials.some((t) => t.participant === g && t.condition === pc.condition) && trials.some((t) => t.participant === g && t.condition === per[0].condition));
        const diffs = ids.map((g) => mean(trials.filter((t) => t.participant === g && t.condition === pc.condition).map((t) => t[key])) - mean(trials.filter((t) => t.participant === g && t.condition === per[0].condition).map((t) => t[key])));
        if (diffs.length >= 2) {
          const m = mean(diffs), se = Math.sqrt(variance(diffs) / diffs.length), df = diffs.length - 1, tt = m / se, tc = tInv(0.975, df);
          out[key] = { kind: 'paired', n: diffs.length, diff: m, lo: m - tc * se, hi: m + tc * se, t: tt, df, p: 2 * (1 - tCdf(Math.abs(tt), df)), dz: m / sd(diffs) };
        }
      } else {
        const a = trials.filter((t) => t.condition === pc.condition).map((t) => t[key]), b = trials.filter((t) => t.condition === per[0].condition).map((t) => t[key]);
        if (a.length >= 2 && b.length >= 2) out[key] = { kind: 'welch', n: a.length + b.length, ...welch(a, b) };
      }
    }
    return out;
  });
  const all = bimodality(trials.map((t) => zAuc.get(t)));
  return { trials, conds, per, compare, all, steps, nParticipants: parsed.hasParticipant ? groups.length : NaN, hasParticipant: parsed.hasParticipant };
}

export function trialsCsv(r) {
  return ['participant,trial,condition,rt_ms,initiation_ms,mad,mad_time_ms,auc,x_flips',
    ...r.trials.map((t) => [t.participant, t.trial, t.condition, t.rt, t.init, t.mad.toFixed(3), t.madTime, t.auc.toFixed(2), t.flips].join(','))].join('\n');
}

// Plain-language summary.
// Confidence rule: with two or more conditions, high when the AUC comparison has p < 0.01 and at least 20
// participants (or 100 trials without participant ids); medium when p < 0.05 and at least 10 participants (40 trials);
// low otherwise. With one condition the rule uses the sample size alone (medium at most, as nothing is compared).
export function mouseSummary(r) {
  const c0 = r.per[0], cmp = r.compare[0], a = cmp?.auc;
  const nUnit = r.hasParticipant ? r.nParticipants : r.trials.length;
  const conf = a ? (a.p < 0.01 && (r.hasParticipant ? nUnit >= 20 : nUnit >= 100) ? 'high' : a.p < 0.05 && (r.hasParticipant ? nUnit >= 10 : nUnit >= 40) ? 'medium' : 'low') : (r.hasParticipant ? nUnit >= 10 : nUnit >= 40) ? 'medium' : 'low';
  const bcs = r.per.filter((p) => p.bc.bc > 0.555).map((p) => p.condition);
  const pcB = cmp ? r.per.find((p) => p.condition === cmp.condition) : null;
  return {
    headline: cmp
      ? `${cmp.condition} trajectories curved ${a.diff > 0 ? 'more' : 'less'} towards the unchosen option than ${cmp.ref}: mean AUC ${fmt(pcB.auc.mean, 0)} vs ${fmt(c0.auc.mean, 0)} px² (${pText(a.p)}).`
      : `Across ${r.trials.length} trials the mean area under the curve is ${fmt(c0.auc.mean, 0)} px² and the mean maximum deviation ${fmt(c0.mad.mean, 0)} px.`,
    meaning: [
      'Area under the curve (AUC) and maximum absolute deviation (MAD) measure how far the cursor bent towards the option that was not chosen: larger values mean more pull from the competitor, which is read as more decision conflict.',
      ...(cmp ? [`Difference in AUC: ${fmt(a.diff, 0)} px², 95% CI ${fmt(a.lo, 0)} to ${fmt(a.hi, 0)} (${a.kind === 'paired' ? `paired over ${a.n} participants, t(${a.df}) = ${fmt(a.t, 2)}` : `Welch over trials, t(${fmt(a.df, 1)}) = ${fmt(a.t, 2)}`}).${cmp.mad ? ` MAD differs by ${fmt(cmp.mad.diff, 0)} px (${pText(cmp.mad.p)}).` : ''}`] : []),
      `Bimodality coefficient of AUC (z-scored${r.hasParticipant ? ' within participant' : ''}): ${r.per.map((p) => `${p.condition} ${fmt(p.bc.bc, 3)}`).join(', ')}. ${bcs.length ? `Above 0.555 in ${bcs.join(', ')}: some trials may be discrete changes of mind rather than a smooth pull.` : 'All at or below 0.555, consistent with a single, continuous pull rather than a mix of straight and change-of-mind trials.'}`,
      `Mean x-flips per trial: ${r.per.map((p) => `${p.condition} ${fmt(p.flips.mean, 1)}`).join(', ')}; mean response time: ${r.per.map((p) => `${p.condition} ${fmt(p.rt.mean, 0)} ms`).join(', ')}.`,
    ],
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong needs p < 0.01 on the AUC comparison and at least 20 participants (or 100 trials when participants are unknown); some evidence needs p < 0.05 and at least 10 participants (40 trials). Here ${r.hasParticipant ? `${nUnit} participants` : `${nUnit} trials`}${a ? `, ${pText(a.p)}` : ', and no comparison'}.`,
    caveats: [
      'Curvature depends on the set-up: start position, response layout, when the cursor must start moving and the sampling rate. Compare conditions within one set-up, not across studies.',
      r.hasParticipant ? 'Comparisons use participant means; trials from the same person are not independent.' : 'Without a participant column, trials are treated as independent, which overstates certainty when people did several trials.',
    ],
    next: ['Look at the mean trajectories and at single trials with the largest AUC to see whether conflict is a smooth pull or a change of mind.', 'Pair the curvature measure with choice and response time; conflict without a change in choice can still flag a confusing label.'],
    report: cmp
      ? `Mouse-tracking (${r.trials.length} trials${r.hasParticipant ? `, ${nUnit} participants` : ''}): AUC ${fmt(pcB.auc.mean, 0)} px² for ${cmp.condition} vs ${fmt(c0.auc.mean, 0)} px² for ${cmp.ref}, difference ${fmt(a.diff, 0)} (95% CI ${fmt(a.lo, 0)} to ${fmt(a.hi, 0)}), ${pText(a.p)}; MAD ${fmt(pcB.mad.mean, 0)} vs ${fmt(c0.mad.mean, 0)} px; bimodality coefficients ${r.per.map((p) => fmt(p.bc.bc, 3)).join(' and ')}.`
      : `Mouse-tracking (${r.trials.length} trials): mean AUC ${fmt(c0.auc.mean, 0)} px², mean MAD ${fmt(c0.mad.mean, 0)} px, bimodality coefficient ${fmt(c0.bc.bc, 3)}.`,
  };
}
