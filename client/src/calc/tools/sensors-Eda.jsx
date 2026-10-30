import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as E from './sensors-eda.js';
import { fmt, toCsv } from './sensors-core.js';
import { EX_EDA, EX_EDA_FS, EX_EDA_SEGMENTS } from './sensors-examples.js';
import { Table, LoadExample, color } from './expanalytics-charts.jsx';
import { Area, Num, Result, Stats, Problem, About } from './ui.jsx';
import { CsvButton } from './sensors-ui.jsx';
import './sensors.css';

// Skin conductance (top: smoothed signal and tonic level; bottom: phasic component with SCR onsets and peaks).
function EdaPlot({ r, segments }) {
  const W = 680, H1 = 170, H2 = 140, L = 50, R = 12, T = 10, G = 26, B = 36, H = T + H1 + G + H2 + B;
  const n = r.smooth.length, step = Math.max(1, Math.floor(n / 1200));
  const sx = (i) => L + (i / (n - 1)) * (W - L - R);
  const lo = Math.min(...r.smooth, ...r.tonic), hi = Math.max(...r.smooth, ...r.tonic), pad = (hi - lo) * 0.06 || 0.01;
  const sy1 = (v) => T + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * H1;
  const plo = Math.min(...r.phasic), phi = Math.max(...r.phasic), pp = (phi - plo) * 0.08 || 0.01;
  const sy2 = (v) => T + H1 + G + (1 - (v - plo + pp) / (phi - plo + 2 * pp)) * H2;
  const line = (arr, sy) => arr.map((v, i) => (i % step === 0 || i === n - 1 ? `${sx(i)},${sy(v)}` : null)).filter(Boolean).join(' ');
  const dur = n / r.fs, tStep = dur > 600 ? 120 : dur > 240 ? 60 : 30, xt = []; for (let v = 0; v <= dur; v += tStep) xt.push(v);
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Skin conductance with tonic level, and the phasic component with detected responses">
        {segments.map((s, k) => <g key={s.name}><rect x={sx(s.start * r.fs)} y={T} width={Math.max(0, sx(Math.min(n - 1, s.end * r.fs)) - sx(s.start * r.fs))} height={H1 + G + H2} className="seg" style={{ fill: color(k) }} /><text x={sx(s.start * r.fs) + 4} y={T + 12} className="lbs">{s.name}</text></g>)}
        <line x1={L} x2={W - R} y1={sy2(0)} y2={sy2(0)} className="grid" />
        {xt.map((v) => <text key={v} x={sx(v * r.fs)} y={H - B + 15} className="ax" textAnchor="middle">{v >= 60 ? `${fmt(v / 60, v % 60 ? 1 : 0)} min` : `${v} s`}</text>)}
        <text x={L - 6} y={sy1(hi) + 4} className="ax" textAnchor="end">{fmt(hi, 2)}</text>
        <text x={L - 6} y={sy1(lo) + 4} className="ax" textAnchor="end">{fmt(lo, 2)}</text>
        <text x={L - 6} y={sy2(0) + 4} className="ax" textAnchor="end">0</text>
        <text x={L - 6} y={sy2(phi) + 4} className="ax" textAnchor="end">{fmt(phi, 2)}</text>
        <polyline points={line(r.smooth, sy1)} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 1.5 }} />
        <polyline points={line(r.tonic, sy1)} style={{ fill: 'none', stroke: 'var(--c3)', strokeWidth: 2, strokeDasharray: '6 3' }} />
        <polyline points={line(r.phasic, sy2)} style={{ fill: 'none', stroke: 'var(--c2)', strokeWidth: 1.4 }} />
        {r.scrs.map((p, k) => <g key={k}><line x1={sx(p.onset)} x2={sx(p.peak)} y1={sy2(r.phasic[p.onset])} y2={sy2(r.phasic[p.peak])} style={{ stroke: 'var(--ink)', strokeWidth: 1 }} /><circle cx={sx(p.peak)} cy={sy2(r.phasic[p.peak])} r={3.4} className="pk" /></g>)}
        <text x={W - R} y={T + H1 + G - 8} className="lbs" textAnchor="end">phasic (µS) with responses ●</text>
        <text x={W - R} y={T + 12} className="lbs" textAnchor="end">smoothed (solid) and tonic level (dashed), µS</text>
      </svg>
    </figure>
  );
}

function SensorsGsrPeaks() {
  const [text, setText] = useState(EX_EDA);
  const [fsIn, setFs] = useState(String(EX_EDA_FS));
  const [segText, setSegText] = useState(EX_EDA_SEGMENTS);
  const [thr, setThr] = useState('0.01');
  const [smoothSec, setSmooth] = useState('0.75');
  const [medianSec, setMedian] = useState('8');
  const [maxRise, setMaxRise] = useState('5');
  const loadExample = () => { setText(EX_EDA); setFs(String(EX_EDA_FS)); setSegText(EX_EDA_SEGMENTS); setThr('0.01'); setSmooth('0.75'); setMedian('8'); setMaxRise('5'); };
  const sc = useMemo(() => E.parseSignal(text), [text]);
  const fs = Number(fsIn), th = Number(thr), sm = Number(smoothSec), md = Number(medianSec), mr = Number(maxRise);
  const valid = fs > 0 && fs <= 1000 && th > 0 && sm >= 0 && md > 0 && mr > 0;
  const segs = useMemo(() => (fs > 0 ? E.parseSegments(segText, sc.length / fs) : { segments: [], errors: [] }), [segText, sc.length, fs]);
  const r = useMemo(() => (valid && sc.length >= Math.max(20, 3 * fs) ? E.analyse(sc, fs, { smoothSec: sm, medianSec: md, thr: th, maxRise: mr, segments: segs.segments }) : null), [sc, fs, sm, md, th, mr, segs, valid]);
  const q = useMemo(() => (r ? E.quality(sc, fs) : null), [r, sc, fs]);
  const csv = r ? toCsv([['onset_s', 'peak_s', 'amplitude_uS', 'rise_s', 'half_recovery_s'], ...r.scrs.map((p) => [p.tOnset.toFixed(2), p.tPeak.toFixed(2), p.amp.toFixed(4), p.rise.toFixed(2), Number.isFinite(p.recovery) ? p.recovery.toFixed(2) : ''])]) : '';
  const top = r ? [...r.segments].sort((a, b) => b.rate - a.rate)[0] : null;

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <Area label="Skin conductance samples (µS), in order" value={text} onChange={setText} rows={6} hint="Spaces, commas or new lines between values. One sensor channel at a fixed sampling rate." />
      <div className="calc-inputs ea-inputs">
        <Num label="Sampling rate" value={fsIn} onChange={setFs} min={1} max={1000} step={1} suffix="Hz" hint="Downsample high-rate recordings to 4–32 Hz first" />
        <Num label="Minimum response amplitude" value={thr} onChange={setThr} min={0.001} step={0.005} suffix="µS" hint="0.01–0.05 µS is usual (Boucsein 2012)" />
        <Num label="Smoothing window" value={smoothSec} onChange={setSmooth} min={0} step={0.25} suffix="s" />
        <Num label="Tonic (running median) window" value={medianSec} onChange={setMedian} min={1} step={1} suffix="s" />
        <Num label="Longest rise time" value={maxRise} onChange={setMaxRise} min={0.5} step={0.5} suffix="s" />
      </div>
      <Area label="Segments: label, start s, end s (optional)" value={segText} onChange={setSegText} rows={3} hint="Leave empty to analyse the whole recording. The first segment is the baseline." />
      {!valid && <Problem>Check the sampling rate, amplitude and window settings: all must be above 0.</Problem>}
      {segs.errors.length > 0 && <Problem>{segs.errors.slice(0, 3).join(' · ')}</Problem>}
      {q && q.negative > 0 && <Problem>{q.negative} negative values: skin conductance cannot be below 0, so check the units (µS) and the sensor.</Problem>}
      {q && q.jumps > 0 && <Problem>{q.jumps} sudden jumps above 10 µS/s, usually electrode movement; exclude those stretches.</Problem>}
      {valid && !r ? <Problem>Paste at least 3 seconds of samples (and at least 20 values).</Problem> : r && (
        <>
          <Result big={`${fmt(top.rate, 1)} / min`} label={`SCR rate in "${top.name}", the highest of ${r.segments.length} segment${r.segments.length > 1 ? 's' : ''}; ${r.scrs.length} responses in ${fmt(r.duration / 60, 1)} minutes`}>
            <Stats rows={[
              ['Median rise time', `${fmt(r.medianRise, 2)} s`],
              ['Mean tonic level', r.segments.map((s) => `${s.name} ${fmt(s.scl, 2)} µS`).join(' · ')],
              ['Windows', `smoothing ${r.kS} samples, tonic ${r.kM} samples`],
            ]} />
          </Result>
          <EdaPlot r={r} segments={r.segments} />
          <Table label="Responses by segment" head={['Segment', 'Minutes', 'SCRs', 'Per minute', 'Mean amplitude µS', 'Largest µS', 'Sum of amplitudes µS', 'Mean rise s', 'Mean half recovery s', 'Mean tonic µS']}
            rows={r.segments.map((s) => [s.name, fmt(s.minutes, 1), s.count, fmt(s.rate, 2), Number.isFinite(s.meanAmp) ? fmt(s.meanAmp, 3) : '·', Number.isFinite(s.maxAmp) ? fmt(s.maxAmp, 3) : '·', fmt(s.sumAmp, 3), Number.isFinite(s.meanRise) ? fmt(s.meanRise, 2) : '·', Number.isFinite(s.meanRecovery) ? fmt(s.meanRecovery, 2) : '·', fmt(s.scl, 3)])} />
          {r.scrs.length > 0 && (
            <details className="calc-about"><summary>Every response ({r.scrs.length})</summary>
              <Table label="Every skin conductance response" head={['#', 'Onset s', 'Peak s', 'Amplitude µS', 'Rise s', 'Half recovery s']} rows={r.scrs.map((p, k) => [k + 1, fmt(p.tOnset, 2), fmt(p.tPeak, 2), fmt(p.amp, 3), fmt(p.rise, 2), Number.isFinite(p.recovery) ? fmt(p.recovery, 2) : 'not reached'])} />
            </details>
          )}
          <div className="sn-actions"><CsvButton name="scr-responses.csv" csv={csv} /></div>
          <StudySummary {...E.edaSummary(r, q, th)} />
        </>
      )}
      <About method="galvanic-skin-response" links={[['physiological-signal-acquisition-and-digital-filtering', 'Physiological signal acquisition and filtering'], ['biometric-storyboards', 'Biometric storyboards']]}>
        <p><b>Smoothing and tonic/phasic split.</b> The signal is smoothed with a centred moving average (default 0.75 s), then the tonic level (skin conductance level, SCL) is a centred running median (default 8 s) of the smoothed signal; the phasic component is smoothed − tonic. Window lengths are rounded to an odd number of samples and the ends are padded by repeating the end values. This is the median-filter decomposition used, for example, in Ledalab's and neurokit2's simpler options; model-based methods (cvxEDA, continuous decomposition) can separate overlapping responses better.</p>
        <p><b>Responses (SCRs).</b> Local minima and maxima are found in order on the phasic signal. A maximum is accepted as a response when it rises at least the minimum amplitude above the lowest minimum since the previous response within the longest rise time (default 5 s). Amplitude = peak − onset value; rise time = peak time − onset time; half recovery = time from the peak until the signal falls back to peak − amplitude/2 (linear interpolation), shown as missing when the next response starts first. SCR rate = responses whose peak lies in the segment / segment minutes.</p>
        <p><b>Checked</b> against scipy.ndimage (uniform_filter1d and median_filter, identical tonic and phasic signals), the same peak rules written in numpy (identical onsets, peaks, amplitudes, rise and recovery times), and scipy.signal.find_peaks with a prominence threshold (the same 18 responses, each within 2 s).</p>
        <p><b>When not to use it.</b> Very short segments (under a minute), signals with long flat stretches or clipping, or rates below 2 Hz. EDA is slow (responses start 1–3 s after a stimulus), so it cannot attribute arousal to events closer together than that. It shows arousal, not whether people feel good or bad.</p>
      </About>
    </div>
  );
}

export default SensorsGsrPeaks;
