// Eye-tracking metrics for areas of interest (AOIs) from a fixation list: dwell time and share, time to first
// fixation, fixation count, visits and revisits, the AOI transition matrix, and scanpath similarity between
// participants by normalised Levenshtein (string edit) distance. Pure functions.
import { lines, cells, toNum, mean, median, fmt, pctS, plural, letters } from './sensors-core.js';

// Fixations: "participant, x, y, duration ms[, start ms]" in viewing order; a header row is skipped.
export function parseFixations(text) {
  const rows = [], errors = [];
  lines(text).forEach((l, i) => {
    const c = cells(l);
    const x = toNum(c[1]), y = toNum(c[2]), d = toNum(c[3]), st = c.length > 4 ? toNum(c[4]) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(d)) { if (i > 0 || Number.isFinite(toNum(c[1]))) errors.push(`Fixation line ${i + 1}: use "participant, x, y, duration"`); return; }
    if (d <= 0) { errors.push(`Fixation line ${i + 1}: duration must be above 0`); return; }
    rows.push({ p: c[0], x, y, d, start: st });
  });
  return { rows, errors };
}
// AOIs: "name, x, y, width, height" (top-left corner and size, in the same pixels as the fixations).
export function parseAois(text) {
  const aois = [], errors = [];
  lines(text).forEach((l, i) => {
    const c = cells(l), v = c.slice(1, 5).map(toNum);
    if (v.some((z) => !Number.isFinite(z))) { if (i > 0) errors.push(`AOI line ${i + 1}: use "name, x, y, width, height"`); return; }
    if (v[2] <= 0 || v[3] <= 0) { errors.push(`AOI line ${i + 1}: width and height must be above 0`); return; }
    aois.push({ name: c[0] || `AOI ${aois.length + 1}`, x: v[0], y: v[1], w: v[2], h: v[3], code: letters(aois.length) });
  });
  return { aois, errors };
}
// A fixation belongs to the first AOI (in list order) whose rectangle contains it, edges included; -1 = outside.
export const hit = (aois, x, y) => aois.findIndex((a) => x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h);

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Similarity = 1 − distance / length of the longer string (both empty: 1).
export const similarity = (a, b) => (Math.max(a.length, b.length) ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1);

export function analyse(rows, aois, { collapse = true } = {}) {
  const K = aois.length, ids = [...new Set(rows.map((r) => r.p))];
  const people = ids.map((id) => {
    const fx = rows.filter((r) => r.p === id).map((r) => ({ ...r, a: hit(aois, r.x, r.y) }));
    const t0 = Number.isFinite(fx[0].start) ? fx[0].start : 0;
    let clock = 0;
    const per = aois.map(() => ({ dwell: 0, count: 0, visits: 0, ttff: NaN, first: NaN }));
    let prevA = -2;
    fx.forEach((f, k) => {
      const startAt = Number.isFinite(f.start) ? f.start - t0 : clock;
      if (f.a >= 0) {
        const s = per[f.a];
        s.dwell += f.d; s.count++;
        if (!Number.isFinite(s.ttff)) { s.ttff = startAt; s.first = k + 1; }
        if (prevA !== f.a) s.visits++;
      }
      prevA = f.a; clock += f.d;
    });
    const seq = fx.map((f) => f.a).filter((a) => a >= 0);
    const collapsed = seq.filter((a, i) => i === 0 || a !== seq[i - 1]);
    const path = (collapse ? collapsed : seq).map((a) => aois[a].code).join('');
    return { id, n: fx.length, total: fx.reduce((s, f) => s + f.d, 0), outside: fx.filter((f) => f.a < 0).reduce((s, f) => s + f.d, 0), per, collapsed, path };
  });
  const N = people.length, totalAll = people.reduce((s, p) => s + p.total, 0);
  const aoiStats = aois.map((a, k) => {
    const v = people.map((p) => p.per[k]), seen = v.filter((s) => s.count > 0);
    const dwellAll = v.reduce((s, x) => s + x.dwell, 0);
    return {
      ...a, k, hitRatio: seen.length / N, nSeen: seen.length, dwellTotal: dwellAll, dwellShare: dwellAll / totalAll,
      dwellMean: dwellAll / N, dwellMeanSeen: seen.length ? mean(seen.map((s) => s.dwell)) : NaN,
      ttffMean: seen.length ? mean(seen.map((s) => s.ttff)) : NaN, ttffMedian: seen.length ? median(seen.map((s) => s.ttff)) : NaN,
      firstFixMean: seen.length ? mean(seen.map((s) => s.first)) : NaN,
      countMean: v.reduce((s, x) => s + x.count, 0) / N, visitsMean: seen.length ? mean(seen.map((s) => s.visits)) : NaN,
      revisitsMean: seen.length ? mean(seen.map((s) => s.visits - 1)) : NaN, revisitShare: seen.length ? seen.filter((s) => s.visits > 1).length / seen.length : NaN,
    };
  });
  // Transitions between consecutive AOI fixations of the same person, outside fixations dropped and repeats collapsed.
  const T = Array.from({ length: K }, () => new Array(K).fill(0));
  for (const p of people) for (let i = 1; i < p.collapsed.length; i++) T[p.collapsed[i - 1]][p.collapsed[i]]++;
  const Tp = T.map((r) => { const s = r.reduce((a, b) => a + b, 0); return r.map((v) => (s ? v / s : NaN)); });
  const nTrans = T.flat().reduce((a, b) => a + b, 0);
  const S = people.map((a) => people.map((b) => similarity(a.path, b.path)));
  const D = people.map((a) => people.map((b) => levenshtein(a.path, b.path)));
  const offDiag = []; S.forEach((r, i) => r.forEach((v, j) => { if (j > i) offDiag.push(v); }));
  const typical = people.map((p, i) => ({ id: p.id, mean: N > 1 ? (S[i].reduce((a, b) => a + b, 0) - 1) / (N - 1) : NaN })).sort((x, y) => y.mean - x.mean);
  const pairs = [];
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) if (i !== j && T[i][j]) pairs.push({ from: i, to: j, n: T[i][j], p: Tp[i][j] });
  pairs.sort((x, y) => y.n - x.n);
  return { people, N, totalAll, aoiStats, T, Tp, nTrans, S, D, meanSim: offDiag.length ? mean(offDiag) : NaN, typical, pairs, outsideShare: people.reduce((s, p) => s + p.outside, 0) / totalAll };
}

// ── Reading your results ──
// Confidence rule: high with 30 or more participants (Pernice and Nielsen 2009 recommend about 30 for stable heatmaps
// and quantitative gaze measures), medium with 10 to 29, low under 10, and one level lower when more than 30% of the
// fixation time falls outside every AOI (the AOIs miss much of what people looked at).
export function eyeConfidence(r) {
  let lv = r.N >= 30 ? 2 : r.N >= 10 ? 1 : 0;
  if (r.outsideShare > 0.3) lv = Math.max(0, lv - 1);
  return ['low', 'medium', 'high'][lv];
}
export function eyeSummary(r) {
  const byDwell = [...r.aoiStats].sort((a, b) => b.dwellShare - a.dwellShare);
  const missed = r.aoiStats.filter((a) => a.hitRatio < 0.5);
  const slow = [...r.aoiStats].filter((a) => a.nSeen).sort((a, b) => b.ttffMean - a.ttffMean)[0];
  const top = byDwell[0], pair = r.pairs[0];
  const meaning = [
    `"${top.name}" drew the most attention: ${pctS(top.dwellShare, 0)} of all fixation time, seen by ${pctS(top.hitRatio, 0)} of participants.`,
    missed.length ? `${missed.map((a) => `"${a.name}"`).join(', ')} ${missed.length === 1 ? 'was' : 'were'} looked at by fewer than half the participants (${missed.map((a) => pctS(a.hitRatio, 0)).join(', ')}): people may not notice ${missed.length === 1 ? 'it' : 'them'}.` : 'Every AOI was looked at by at least half of the participants.',
    slow ? `"${slow.name}" was found last, on average ${fmt(slow.ttffMean / 1000, 1)} s after the page appeared (among the ${slow.nSeen} who looked at it).` : null,
    pair ? `The most common move was "${r.aoiStats[pair.from].name}" → "${r.aoiStats[pair.to].name}" (${plural(pair.n, 'transition')}, ${pctS(pair.p, 0)} of moves leaving "${r.aoiStats[pair.from].name}").` : null,
    r.N > 1 ? `Scanpaths were ${r.meanSim >= 0.6 ? 'fairly similar' : r.meanSim >= 0.4 ? 'moderately similar' : 'quite different'} between participants (mean normalised similarity ${fmt(r.meanSim, 2)}); ${r.typical[0].id} had the most typical path.` : null,
  ].filter(Boolean);
  return {
    headline: `"${top.name}" took ${pctS(top.dwellShare, 0)} of fixation time across ${plural(r.N, 'participant')}${missed.length ? `, while ${missed.length === 1 ? `"${missed[0].name}" was` : `${missed.length} AOIs were`} seen by fewer than half` : ''}.`,
    meaning,
    confidence: eyeConfidence(r),
    confidenceNote: `High needs 30 or more participants (Pernice and Nielsen 2009), medium 10 to 29, low fewer; one level lower when more than 30% of fixation time falls outside the AOIs. Here: ${r.N} participants, ${pctS(r.outsideShare, 0)} of fixation time outside the AOIs.`,
    caveats: [
      'Looking is not understanding or liking: long dwell can mean interest or confusion. Ask or observe to tell which.',
      'Results depend on the AOI rectangles and on calibration accuracy (often 0.5 to 1° of visual angle, about 20 to 40 px at a normal viewing distance); give small AOIs a margin.',
      'Time to first fixation here ignores saccade time unless you give fixation start times, and it counts only the people who looked at the AOI.',
    ],
    next: [
      'Compare designs with the same AOIs: test hit ratios with the [compare rates](/calculators/compare-rates) calculator and dwell times with [compare means](/calculators/compare-means).',
      'Watch the gaze replays of the least typical scanpaths to see what those people were doing differently.',
    ],
    report: `Across ${plural(r.N, 'participant')}, "${top.name}" received ${pctS(top.dwellShare, 0)} of fixation time${missed.length ? `, and ${missed.map((a) => `"${a.name}" (${pctS(a.hitRatio, 0)} hit ratio)`).join(', ')} ${missed.length === 1 ? 'was' : 'were'} seen by fewer than half` : ''}; mean scanpath similarity was ${fmt(r.meanSim, 2)}.`,
  };
}
