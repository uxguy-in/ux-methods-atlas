// Electrodermal activity (EDA, GSR): smoothing, tonic/phasic split by a running median, skin conductance responses
// (SCRs) with an amplitude threshold, rise time, half-recovery time and SCR rate per minute by segment. Pure functions.
import { lines, cells, toNum, numberList, mean, median, fmt, pctS, plural } from './sensors-core.js';

export const parseSignal = (text) => numberList(text);
// Segments: "label, start s, end s" per line.
export function parseSegments(text, duration) {
  const out = [], errors = [];
  lines(text).forEach((l, i) => {
    const c = cells(l);
    const a = toNum(c[1]), b = toNum(c[2]);
    if (c.length < 3 || !Number.isFinite(a) || !Number.isFinite(b) || b <= a) { errors.push(`Segment line ${i + 1}: use "label, start s, end s"`); return; }
    out.push({ name: c[0] || `Segment ${i + 1}`, start: a, end: Math.min(b, duration) });
  });
  return { segments: out.length ? out.filter((s) => s.end > s.start) : [{ name: 'whole recording', start: 0, end: duration }], errors };
}

const odd = (k) => { const r = Math.max(1, Math.round(k)); return r % 2 ? r : r + 1; };
const at = (x, i) => x[Math.min(x.length - 1, Math.max(0, i))]; // 'nearest' edge handling: repeat the end values

// Centred moving average of k samples (k odd) with edges padded by repeating the end values (scipy.ndimage
// uniform_filter1d, mode 'nearest').
export function movingAverage(x, k) {
  const h = (k - 1) / 2, out = new Array(x.length);
  let s = 0; for (let j = -h; j <= h; j++) s += at(x, j);
  for (let i = 0; i < x.length; i++) { out[i] = s / k; s += at(x, i + h + 1) - at(x, i - h); }
  return out;
}
// Centred running median of k samples (k odd), edges padded the same way (scipy.ndimage median_filter, mode 'nearest').
export function runningMedian(x, k) {
  const h = (k - 1) / 2, win = [];
  for (let j = -h; j <= h; j++) win.push(at(x, j));
  win.sort((a, b) => a - b);
  const out = new Array(x.length);
  const remove = (v) => { let lo = 0, hi = win.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (win[m] < v) lo = m + 1; else hi = m; } win.splice(lo, 1); };
  const insert = (v) => { let lo = 0, hi = win.length; while (lo < hi) { const m = (lo + hi) >> 1; if (win[m] < v) lo = m + 1; else hi = m; } win.splice(lo, 0, v); };
  for (let i = 0; i < x.length; i++) { out[i] = win[h]; remove(at(x, i - h)); insert(at(x, i + h + 1)); }
  return out;
}

// SCRs on the phasic signal. Local minima and maxima are found in order (a minimum is lower than the sample before it
// and no higher than the one after; a maximum the other way round; the first sample counts as a minimum when the
// signal starts by rising). The onset of a candidate response is the lowest minimum since the last accepted response
// that lies within `maxRise` seconds before the maximum; the maximum is accepted when it rises at least `thr` µS above
// that onset. Rise time = peak − onset; half recovery = time from the peak until the signal falls back below
// peak − amplitude/2 (linear interpolation between samples), missing when the next response starts first or the
// recording ends.
export function findScrs(x, fs, thr = 0.01, maxRise = 5) {
  const n = x.length, peaks = [], W = Math.round(maxRise * fs);
  let minima = n > 1 && x[1] > x[0] ? [0] : [];
  for (let i = 1; i < n - 1; i++) {
    if (x[i] < x[i - 1] && x[i] <= x[i + 1]) minima.push(i);
    else if (x[i] > x[i - 1] && x[i] >= x[i + 1]) {
      let onset = -1;
      for (const j of minima) if (j >= i - W && (onset < 0 || x[j] < x[onset])) onset = j;
      if (onset >= 0 && x[i] - x[onset] >= thr) { peaks.push({ onset, peak: i, amp: x[i] - x[onset] }); minima = []; }
    }
  }
  peaks.forEach((p, k) => {
    const stop = k + 1 < peaks.length ? peaks[k + 1].onset : n - 1, half = x[p.peak] - p.amp / 2;
    p.rise = (p.peak - p.onset) / fs; p.tPeak = p.peak / fs; p.tOnset = p.onset / fs; p.recovery = NaN;
    for (let j = p.peak + 1; j <= stop; j++) {
      if (x[j] <= half) { p.recovery = (j - 1 + (x[j - 1] - half) / (x[j - 1] - x[j]) - p.peak) / fs; break; }
    }
  });
  return peaks;
}

export function analyse(sc, fs, { smoothSec = 0.75, medianSec = 8, thr = 0.01, maxRise = 5, segments } = {}) {
  const kS = odd(smoothSec * fs), kM = odd(medianSec * fs);
  const smooth = kS > 1 ? movingAverage(sc, kS) : [...sc];
  const tonic = runningMedian(smooth, kM);
  const phasic = smooth.map((v, i) => v - tonic[i]);
  const scrs = findScrs(phasic, fs, thr, maxRise);
  const duration = sc.length / fs;
  const segs = (segments || [{ name: 'whole recording', start: 0, end: duration }]).map((s) => {
    const inSeg = scrs.filter((p) => p.tPeak >= s.start && p.tPeak < s.end);
    const i0 = Math.max(0, Math.ceil(s.start * fs - 1e-9)), i1 = Math.min(sc.length, Math.ceil(s.end * fs - 1e-9));
    const minutes = (s.end - s.start) / 60, rec = inSeg.map((p) => p.recovery).filter(Number.isFinite);
    return {
      ...s, minutes, count: inSeg.length, rate: inSeg.length / minutes,
      meanAmp: inSeg.length ? mean(inSeg.map((p) => p.amp)) : NaN, maxAmp: inSeg.length ? Math.max(...inSeg.map((p) => p.amp)) : NaN,
      sumAmp: inSeg.reduce((a, p) => a + p.amp, 0), meanRise: inSeg.length ? mean(inSeg.map((p) => p.rise)) : NaN,
      meanRecovery: rec.length ? mean(rec) : NaN, scl: mean(tonic.slice(i0, i1)),
    };
  });
  return { n: sc.length, fs, duration, kS, kM, smooth, tonic, phasic, scrs, segments: segs, medianRise: median(scrs.map((p) => p.rise)) };
}

// Checks on the raw data that change how far to trust the result.
export function quality(sc, fs) {
  let flat = 0, jumps = 0;
  for (let i = 1; i < sc.length; i++) { if (sc[i] === sc[i - 1]) flat++; if (Math.abs(sc[i] - sc[i - 1]) * fs > 10) jumps++; }
  return { flatShare: flat / Math.max(1, sc.length - 1), jumps, negative: sc.filter((v) => v < 0).length, lowFs: fs < 4 };
}

// ── Reading your results ──
// Confidence rule: high when the sampling rate is at least 4 Hz, every segment lasts at least 2 minutes and the signal
// has no sudden jumps (> 10 µS/s, usually electrode movement) and under 20% flat samples (clipping or dropout); medium
// when segments last at least 1 minute and the sampling rate is at least 2 Hz; low otherwise. SCR rates from a minute
// or less of signal move by 1/min with every single response (Dawson, Schell and Filion 2007; Boucsein 2012).
export function edaConfidence(r, q) {
  const minMin = Math.min(...r.segments.map((s) => s.minutes));
  if (r.fs >= 4 && minMin >= 2 && q.jumps === 0 && q.flatShare < 0.2) return 'high';
  if (r.fs >= 2 && minMin >= 1) return 'medium';
  return 'low';
}
export function edaSummary(r, q, thr) {
  const level = edaConfidence(r, q), segs = r.segments, b = segs[0];
  const top = segs.length > 1 ? [...segs.slice(1)].sort((x, y) => y.rate - x.rate)[0] : null;
  const headline = top
    ? `${plural(r.scrs.length, 'skin conductance response')} in ${fmt(r.duration / 60, 1)} minutes: ${fmt(top.rate, 1)} per minute in "${top.name}" against ${fmt(b.rate, 1)} per minute in "${b.name}".`
    : `${plural(r.scrs.length, 'skin conductance response')} in ${fmt(r.duration / 60, 1)} minutes (${fmt(b.rate, 1)} per minute).`;
  const meaning = [];
  if (top) meaning.push(top.rate > b.rate * 1.5 ? `Responses were ${fmt(top.rate / Math.max(b.rate, 1e-9), 1)} times as frequent in "${top.name}": arousal rose, which fits effort, surprise, frustration or excitement (EDA cannot tell these apart).` : top.rate < b.rate * 0.67 ? `Fewer responses in "${top.name}" than in "${b.name}": arousal was lower than at baseline.` : `SCR rates were similar across segments: no clear change in arousal.`);
  meaning.push(`At rest, 1 to 3 non-specific responses per minute is typical (Dawson, Schell and Filion 2007); "${b.name}" had ${fmt(b.rate, 1)}.${b.rate < 0.5 ? ' Very few responses can mean a non-responder or poor electrode contact.' : ''}`);
  for (const s of segs) meaning.push(`"${s.name}": ${plural(s.count, 'response')}, mean amplitude ${Number.isFinite(s.meanAmp) ? `${fmt(s.meanAmp, 3)} µS` : 'none'}, tonic level ${fmt(s.scl, 2)} µS.`);
  if (meaning.length > 6) meaning.splice(6);
  return {
    headline,
    meaning,
    confidence: level,
    confidenceNote: `High needs a sampling rate of at least 4 Hz, segments of at least 2 minutes and no sudden jumps or flat stretches; medium needs at least 1-minute segments at 2 Hz or more. Here: ${fmt(r.fs, 0)} Hz, shortest segment ${fmt(Math.min(...segs.map((s) => s.minutes)), 1)} minutes, ${plural(q.jumps, 'sudden jump')}.`,
    caveats: [
      `Responses smaller than ${thr} µS were ignored; the count depends on this threshold and on the smoothing, so keep both fixed across participants and conditions.`,
      'Skin conductance shows arousal, not whether it is positive or negative. Pair it with observation, self-report or task events.',
      'Movement, talking, deep breaths and temperature also trigger responses; mark these in your session notes and exclude affected stretches.',
    ],
    next: [
      'Repeat for every participant and compare per-person SCR rates between segments with a paired test in the [compare means](/calculators/compare-means) calculator.',
      'Align responses with task events (timestamps of errors, page loads or questions) to see what triggered them.',
    ],
    report: top
      ? `Using a ${thr} µS amplitude threshold, we found ${fmt(top.rate, 1)} SCRs per minute in "${top.name}" against ${fmt(b.rate, 1)} per minute in "${b.name}" (mean amplitude ${Number.isFinite(top.meanAmp) ? fmt(top.meanAmp, 3) : '0'} vs ${Number.isFinite(b.meanAmp) ? fmt(b.meanAmp, 3) : '0'} µS).`
      : `Using a ${thr} µS amplitude threshold, we found ${fmt(b.rate, 1)} SCRs per minute over ${fmt(r.duration / 60, 1)} minutes.`,
  };
}
export { pctS };
