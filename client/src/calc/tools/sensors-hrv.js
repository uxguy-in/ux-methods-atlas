// Heart rate variability from RR (inter-beat) intervals: artefact correction, time-domain measures, Poincaré SD1/SD2
// and a Lomb-Scargle spectrum with LF and HF power, per segment (baseline, task, recovery …). Pure functions.
import { lines, toNum, mean, sd, median, trapz, fmt, pctS, plural } from './sensors-core.js';

// Text: "label: 812 830 845 …" (several values), "label, 812" (one value) or a bare number (continues the last
// segment, or "all"). Values below 10 are read as seconds and converted to milliseconds.
export function parseRR(text) {
  const segs = [], errors = [];
  const seg = (name) => { let s = segs.find((x) => x.name === name); if (!s) { s = { name, rr: [] }; segs.push(s); } return s; };
  let cur = null;
  lines(text).forEach((l, i) => {
    let name = null, rest = l;
    const m = /^([^:,;\t\d.+-][^:,;\t]*)\s*[:,;\t]\s*(.*)$/.exec(l);
    if (m) { name = m[1].trim(); rest = m[2]; }
    const vals = rest.split(/[\s,;]+/).filter(Boolean).map(toNum);
    if (vals.some((v) => !Number.isFinite(v) || v <= 0)) { errors.push(`Line ${i + 1}: expected interval values in ms`); return; }
    cur = seg(name || cur?.name || 'all');
    cur.rr.push(...vals);
  });
  for (const s of segs) if (s.rr.length && Math.max(...s.rr) < 10) s.rr = s.rr.map((v) => v * 1000);
  return { segments: segs.filter((s) => s.rr.length), errors };
}

// Artefacts: outside [lo, hi] ms, or more than `pct` away from the median of the `half` intervals on each side
// (excluding the beat itself and other out-of-range beats).
export function detectArtefacts(rr, { lo = 300, hi = 2000, pct = 0.2, half = 5 } = {}) {
  const n = rr.length, range = rr.map((v) => v < lo || v > hi);
  return rr.map((v, i) => {
    if (range[i]) return true;
    const win = [];
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) if (j !== i && !range[j]) win.push(rr[j]);
    if (!win.length) return false;
    const m = median(win);
    return Math.abs(v - m) > pct * m;
  });
}

// Corrected series. 'interpolate' replaces flagged beats by linear interpolation between the nearest good beats (by
// beat index); 'delete' drops them and uses successive differences only between beats that were adjacent. Beat times
// always come from the raw recording (cumulative sum of the raw intervals), so deleting leaves a real gap in time.
export function correct(rr, bad, method = 'interpolate') {
  const n = rr.length, tRaw = []; let acc = 0;
  for (const v of rr) { acc += v / 1000; tRaw.push(acc); }
  const good = bad.map((b) => !b);
  if (method === 'delete') {
    const nn = [], t = [], pairs = [];
    for (let i = 0; i < n; i++) if (good[i]) { nn.push(rr[i]); t.push(tRaw[i]); if (i > 0 && good[i - 1]) pairs.push([rr[i - 1], rr[i]]); }
    return { nn, t, pairs };
  }
  const gi = good.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
  if (!gi.length) return { nn: [], t: [], pairs: [] };
  const nn = rr.map((v, i) => {
    if (good[i]) return v;
    let a = -1, b = -1;
    for (const j of gi) { if (j < i) a = j; else { b = j; break; } }
    if (a < 0) return rr[b];
    if (b < 0) return rr[a];
    return rr[a] + ((i - a) / (b - a)) * (rr[b] - rr[a]);
  });
  return { nn, t: tRaw, pairs: nn.slice(1).map((v, i) => [nn[i], v]) };
}

// Time domain (Task Force 1996): SDNN = SD of the NN intervals, RMSSD = √mean(ΔNN²), pNN50 = NN50 count / number of
// NN intervals. Poincaré plot of successive pairs (NN_i, NN_i+1): SD1 = SD((NN_i+1 − NN_i)/√2), SD2 = SD((NN_i+1 + NN_i)/√2).
export function timeDomain(nn, pairs) {
  const diffs = pairs.map(([a, b]) => b - a);
  const meanNN = mean(nn), sdnn = sd(nn), sdsd = sd(diffs);
  const rmssd = Math.sqrt(mean(diffs.map((d) => d * d)));
  const sd1 = sdsd / Math.SQRT2, sd2 = sd(pairs.map(([a, b]) => (a + b) / Math.SQRT2));
  const nn50 = diffs.filter((d) => Math.abs(d) > 50).length;
  return {
    n: nn.length, meanNN, sdnn, rmssd, sdsd, lnRmssd: Math.log(rmssd), nn50, pnn50: nn50 / nn.length,
    meanHR: mean(nn.map((v) => 60000 / v)), minHR: 60000 / Math.max(...nn), maxHR: 60000 / Math.min(...nn),
    sd1, sd2, sd1sd2: sd1 / sd2,
  };
}

// Classic Lomb-Scargle periodogram (Lomb 1976, Scargle 1982) of the mean-centred intervals y at times t (s), on the
// frequency grid f (Hz). P(ω) = ½[(Σy cos ω(t−τ))² / Σcos² ω(t−τ) + (Σy sin ω(t−τ))² / Σsin² ω(t−τ)], tan 2ωτ = Σsin 2ωt / Σcos 2ωt.
// Scaled to a one-sided density in ms²/Hz, S(f) = 2·P·T/N (T the duration), so ∫S df ≈ the variance of the intervals.
export const FREQS = Array.from({ length: 398 }, (_, i) => +(0.003 + i * 0.001).toFixed(3));
export function lombScargle(t, x, freqs = FREQS) {
  const m = mean(x), y = x.map((v) => v - m), N = t.length, T = t[N - 1] - t[0];
  return freqs.map((f) => {
    const w = 2 * Math.PI * f;
    let s2 = 0, c2 = 0;
    for (const ti of t) { s2 += Math.sin(2 * w * ti); c2 += Math.cos(2 * w * ti); }
    const tau = Math.atan2(s2, c2) / (2 * w);
    let yc = 0, ys = 0, cc = 0, ss = 0;
    for (let i = 0; i < N; i++) { const a = w * (t[i] - tau), c = Math.cos(a), s = Math.sin(a); yc += y[i] * c; ys += y[i] * s; cc += c * c; ss += s * s; }
    return (2 * T / N) * 0.5 * (yc * yc / cc + ys * ys / ss);
  });
}
export const BANDS = { vlf: [0.003, 0.04], lf: [0.04, 0.15], hf: [0.15, 0.4] };
// Band power: trapezoid rule over the grid points with lo ≤ f < hi (HF includes 0.40 Hz).
export function bandPower(freqs, psd, [lo, hi], incl = false) {
  const f = [], p = [];
  freqs.forEach((v, i) => { if (v >= lo - 1e-12 && (incl ? v <= hi + 1e-12 : v < hi - 1e-12)) { f.push(v); p.push(psd[i]); } });
  return trapz(p, f);
}
export function frequencyDomain(t, nn) {
  const psd = lombScargle(t, nn);
  const vlf = bandPower(FREQS, psd, BANDS.vlf), lf = bandPower(FREQS, psd, BANDS.lf), hf = bandPower(FREQS, psd, BANDS.hf, true);
  let peak = -1, hfPeak = NaN;
  FREQS.forEach((f, i) => { if (f >= 0.15 && f <= 0.4 && psd[i] > peak) { peak = psd[i]; hfPeak = f; } });
  return { psd, vlf, lf, hf, lfhf: lf / hf, lfnu: lf / (lf + hf), hfnu: hf / (lf + hf), hfPeak, total: vlf + lf + hf, duration: t[t.length - 1] - t[0] };
}

export function analyseSegment(seg, opts = {}) {
  const bad = detectArtefacts(seg.rr, opts);
  const c = correct(seg.rr, bad, opts.method || 'interpolate');
  const duration = seg.rr.reduce((a, b) => a + b, 0) / 1000;
  const nBad = bad.filter(Boolean).length;
  if (c.nn.length < 10 || c.pairs.length < 5) return { name: seg.name, n: seg.rr.length, nBad, bad, duration, ok: false };
  return { name: seg.name, n: seg.rr.length, nBad, badShare: nBad / seg.rr.length, bad, duration, ok: true, nn: c.nn, t: c.t, ...timeDomain(c.nn, c.pairs), ...frequencyDomain(c.t, c.nn) };
}
export const analyse = (segments, opts) => segments.map((s) => analyseSegment(s, opts));

// Each segment compared with the first (the baseline).
export function compare(res) {
  const b = res[0];
  return res.slice(1).filter((r) => r.ok && b.ok).map((r) => ({
    name: r.name, dHR: r.meanHR - b.meanHR, dRmssdPct: r.rmssd / b.rmssd - 1, dLnRmssd: r.lnRmssd - b.lnRmssd,
    dSdnnPct: r.sdnn / b.sdnn - 1, dHfPct: r.hf / b.hf - 1, lfhfRatio: r.lfhf / b.lfhf,
  }));
}

// ── Reading your results ──
// Confidence rule (Task Force of the ESC and NASPE 1996; Shaffer and Ginsberg 2017): high when every segment lasts at
// least 5 minutes (the standard short-term recording, long enough for LF) and has at most 2% corrected beats; medium
// when every segment lasts at least 2 minutes (the minimum for LF; RMSSD is usable from about 1 minute) and has at
// most 5% corrected beats; low otherwise.
export function hrvConfidence(res) {
  const ok = res.filter((r) => r.ok);
  if (!ok.length) return 'low';
  const minDur = Math.min(...ok.map((r) => r.duration)), maxBad = Math.max(...ok.map((r) => r.badShare));
  if (minDur >= 300 && maxBad <= 0.02) return 'high';
  if (minDur >= 120 && maxBad <= 0.05) return 'medium';
  return 'low';
}
export function hrvSummary(res, method = 'interpolate') {
  const ok = res.filter((r) => r.ok), b = ok[0], cmp = compare(ok);
  const level = hrvConfidence(res);
  const minDur = Math.min(...ok.map((r) => r.duration)), maxBad = Math.max(...ok.map((r) => r.badShare));
  const totalBad = ok.reduce((s, r) => s + r.nBad, 0);
  const biggest = cmp.length ? [...cmp].sort((x, y) => x.dLnRmssd - y.dLnRmssd)[0] : null;
  const headline = biggest
    ? `In "${biggest.name}", RMSSD was ${fmt(Math.abs(biggest.dRmssdPct) * 100, 0)}% ${biggest.dRmssdPct < 0 ? 'lower' : 'higher'} than in "${b.name}" (${fmt(ok.find((r) => r.name === biggest.name).rmssd, 1)} vs ${fmt(b.rmssd, 1)} ms) and heart rate ${biggest.dHR >= 0 ? 'rose' : 'fell'} by ${fmt(Math.abs(biggest.dHR), 1)} bpm.`
    : `"${b.name}": mean heart rate ${fmt(b.meanHR, 1)} bpm and RMSSD ${fmt(b.rmssd, 1)} ms over ${fmt(b.duration / 60, 1)} minutes.`;
  const meaning = [];
  if (biggest) meaning.push(biggest.dRmssdPct < 0 ? 'Lower RMSSD and HF power with a faster heart rate is the usual sign of vagal withdrawal: the body shifted towards effort, stress or mental workload during this segment.' : 'Higher RMSSD than the baseline points to more parasympathetic (vagal) activity, as in rest or recovery, not to more effort.');
  for (const c of cmp) meaning.push(`"${c.name}" vs "${b.name}": heart rate ${c.dHR >= 0 ? '+' : '−'}${fmt(Math.abs(c.dHR), 1)} bpm, RMSSD ${c.dRmssdPct >= 0 ? '+' : '−'}${fmt(Math.abs(c.dRmssdPct) * 100, 0)}%, HF power ${c.dHfPct >= 0 ? '+' : '−'}${fmt(Math.abs(c.dHfPct) * 100, 0)}%, LF/HF ${fmt(ok.find((r) => r.name === c.name).lfhf, 2)} (baseline ${fmt(b.lfhf, 2)}).`);
  if (meaning.length > 5) meaning.splice(5);
  meaning.push(`${plural(totalBad, 'beat')} ${totalBad === 1 ? 'was' : 'were'} flagged as artefacts and ${method === 'delete' ? 'removed' : 'interpolated'}; the most in one segment was ${pctS(maxBad, 1)}.`);
  return {
    headline,
    meaning,
    confidence: level,
    confidenceNote: `High needs every segment to last at least 5 minutes with at most 2% corrected beats; medium at least 2 minutes with at most 5% (Task Force of the ESC and NASPE 1996: 2 minutes is the minimum for LF power, 5 minutes the standard short-term recording). Your shortest segment lasted ${fmt(minDur / 60, 1)} minutes.`,
    caveats: [
      'HRV changes with breathing rate, talking and posture as much as with workload. If people spoke or moved more during the task, that alone lowers RMSSD and shifts power between LF and HF.',
      'LF/HF is not a clean "sympathovagal balance" index (Billman 2013); report RMSSD and HF power as the vagal measures and treat LF/HF as descriptive.',
      'Segments of one person are not independent samples; to compare conditions, collect several people and test their per-person differences (for example on ln RMSSD).',
    ],
    next: [
      'Pair the HRV change with a workload rating (NASA-TLX) or task outcome so it can be interpreted.',
      'Repeat for every participant and compare ln RMSSD between conditions with a paired test in the [compare means](/calculators/compare-means) calculator.',
    ],
    report: biggest
      ? `Over ${ok.length} segments (shortest ${fmt(minDur / 60, 1)} min, ${pctS(maxBad, 1)} corrected beats at most), RMSSD ${biggest.dRmssdPct < 0 ? 'fell' : 'rose'} from ${fmt(b.rmssd, 1)} ms in "${b.name}" to ${fmt(ok.find((r) => r.name === biggest.name).rmssd, 1)} ms in "${biggest.name}" (${biggest.dRmssdPct < 0 ? '−' : '+'}${fmt(Math.abs(biggest.dRmssdPct) * 100, 0)}%), with mean heart rate ${fmt(b.meanHR, 1)} vs ${fmt(ok.find((r) => r.name === biggest.name).meanHR, 1)} bpm.`
      : `Mean heart rate ${fmt(b.meanHR, 1)} bpm, RMSSD ${fmt(b.rmssd, 1)} ms, SDNN ${fmt(b.sdnn, 1)} ms over ${fmt(b.duration / 60, 1)} minutes.`,
  };
}
