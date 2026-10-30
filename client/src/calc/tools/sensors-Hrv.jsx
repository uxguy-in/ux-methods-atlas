import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as H from './sensors-hrv.js';
import { fmt, pctS, toCsv } from './sensors-core.js';
import { EX_HRV } from './sensors-examples.js';
import { LinePlot, Table, LoadExample, color } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import { CsvButton } from './sensors-ui.jsx';
import './sensors.css';

// RR series over time with flagged beats, one colour per segment.
function Tachogram({ res }) {
  const W = 680, Hh = 230, L = 50, R = 12, T = 12, B = 38;
  let off = 0;
  const segs = res.map((r) => { const raw = r.rawRR, t = []; let a = off; for (const v of raw) { a += v / 1000; t.push(a); } const s = { ...r, tt: t, t0: off, t1: a }; off = a; return s; });
  const all = segs.flatMap((s) => s.rawRR), y0 = Math.max(250, Math.min(...all) - 20), y1 = Math.min(2100, Math.max(...all) + 20);
  const sx = (t) => L + (t / off) * (W - L - R), sy = (v) => T + (1 - (Math.min(y1, Math.max(y0, v)) - y0) / (y1 - y0)) * (Hh - T - B);
  const ticks = []; const step = (y1 - y0) > 600 ? 200 : 100; for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) ticks.push(v);
  const tstep = off > 900 ? 120 : 60, xt = []; for (let v = 0; v <= off; v += tstep) xt.push(v);
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="RR intervals over time by segment, with artefacts marked">
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{v}</text></g>)}
        {xt.map((v) => <text key={v} x={sx(v)} y={Hh - B + 15} className="ax" textAnchor="middle">{fmt(v / 60, 0)}</text>)}
        {segs.map((s, k) => (
          <g key={s.name}>
            <rect x={sx(s.t0)} y={T} width={sx(s.t1) - sx(s.t0)} height={Hh - T - B} className="seg" style={{ fill: color(k) }} />
            <text x={sx(s.t0) + 4} y={T + 12} className="lbs">{s.name}</text>
            <polyline points={s.tt.map((t, i) => (Number.isFinite(s.nnShow[i]) ? `${sx(t)},${sy(s.nnShow[i])}` : null)).filter(Boolean).join(' ')} style={{ fill: 'none', stroke: color(k), strokeWidth: 1.3 }} />
            {s.bad.map((b, i) => (b ? <circle key={i} cx={sx(s.tt[i])} cy={sy(s.rawRR[i])} r={3.5} className="art" /> : null))}
          </g>
        ))}
        <text x={(L + W - R) / 2} y={Hh - 4} className="ax" textAnchor="middle">Time (minutes); red dots = flagged beats (raw value)</text>
        <text x={12} y={(T + Hh - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + Hh - B) / 2})`}>RR (ms)</text>
      </svg>
    </figure>
  );
}

// Poincaré plot: NN_i against NN_i+1 with the SD1/SD2 ellipse per segment.
function Poincare({ res }) {
  const S = 320, P = 44;
  const vals = res.flatMap((r) => r.nn), lo = Math.min(...vals) - 10, hi = Math.max(...vals) + 10;
  const s = (v) => P + ((v - lo) / (hi - lo)) * (S - P - 10), sy = (v) => S - P - ((v - lo) / (hi - lo)) * (S - P - 10);
  const step = hi - lo > 400 ? 100 : 50, ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const k = (S - P - 10) / (hi - lo);
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${S} ${S}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Poincaré plot of successive intervals with SD1 and SD2 ellipses">
        {ticks.map((v) => <g key={v}><line x1={s(v)} x2={s(v)} y1={10} y2={S - P} className="grid" /><line x1={P} x2={S - 10} y1={sy(v)} y2={sy(v)} className="grid" /><text x={s(v)} y={S - P + 14} className="ax" textAnchor="middle">{v}</text><text x={P - 4} y={sy(v) + 4} className="ax" textAnchor="end">{v}</text></g>)}
        <line x1={s(lo)} y1={sy(lo)} x2={s(hi)} y2={sy(hi)} className="ea-ref" />
        {res.map((r, j) => (
          <g key={r.name}>
            {r.nn.slice(1).map((v, i) => <circle key={i} cx={s(r.nn[i])} cy={sy(v)} r={1.8} style={{ fill: color(j), opacity: 0.45 }} />)}
            <ellipse cx={s(r.meanNN)} cy={sy(r.meanNN)} rx={r.sd2 * k} ry={r.sd1 * k} transform={`rotate(-45 ${s(r.meanNN)} ${sy(r.meanNN)})`} style={{ fill: 'none', stroke: color(j), strokeWidth: 2 }} />
          </g>
        ))}
        <text x={(P + S) / 2} y={S - 8} className="ax" textAnchor="middle">NN(i), ms</text>
        <text x={11} y={(S - P) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 11 ${(S - P) / 2})`}>NN(i+1), ms</text>
      </svg>
      <p className="sn-note">Ellipse half-widths: SD1 across the identity line (beat-to-beat), SD2 along it (longer-term).</p>
    </figure>
  );
}

function SensorsHrv() {
  const [text, setText] = useState(EX_HRV);
  const [method, setMethod] = useState('interpolate');
  const [pct, setPct] = useState('20');
  const loadExample = () => { setText(EX_HRV); setMethod('interpolate'); setPct('20'); };
  const parsed = useMemo(() => H.parseRR(text), [text]);
  const thr = Math.min(50, Math.max(5, Number(pct) || 20)) / 100;
  const res = useMemo(() => H.analyse(parsed.segments, { method, pct: thr }).map((r, i) => {
    const seg = parsed.segments[i];
    const shown = r.ok && method === 'interpolate' ? r.nn : seg.rr.map((v, j) => (r.bad[j] ? NaN : v));
    return { ...r, rawRR: seg.rr, nnShow: shown };
  }), [parsed, method, thr]);
  const ok = res.filter((r) => r.ok);
  const short = res.filter((r) => !r.ok);
  const cmp = ok.length > 1 ? H.compare(ok) : [];
  const csv = toCsv([['segment', 'beats', 'corrected', 'duration_s', 'mean_hr_bpm', 'mean_nn_ms', 'sdnn_ms', 'rmssd_ms', 'ln_rmssd', 'pnn50', 'sd1_ms', 'sd2_ms', 'vlf_ms2', 'lf_ms2', 'hf_ms2', 'lf_hf', 'hf_peak_hz'],
    ...ok.map((r) => [r.name, r.n, r.nBad, r.duration.toFixed(1), r.meanHR.toFixed(2), r.meanNN.toFixed(2), r.sdnn.toFixed(2), r.rmssd.toFixed(2), r.lnRmssd.toFixed(3), r.pnn50.toFixed(4), r.sd1.toFixed(2), r.sd2.toFixed(2), r.vlf.toFixed(1), r.lf.toFixed(1), r.hf.toFixed(1), r.lfhf.toFixed(3), r.hfPeak])]);
  const b = ok[0], last = ok[1] || ok[0];

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <Area label="RR intervals (ms), with a segment label before a colon" value={text} onChange={setText} rows={7} hint='e.g. "baseline: 812 830 845 …" then "task: 702 690 …". The first segment is the baseline. Values below 10 are read as seconds.' wrap="off" />
      <div className="calc-inputs ea-inputs">
        <Choice label="Artefact correction" value={method} onChange={setMethod} options={[['interpolate', 'Interpolate flagged beats'], ['delete', 'Delete flagged beats']]} />
        <Num label="Flag beats that differ from the local median by more than" value={pct} onChange={setPct} min={5} max={50} step={5} suffix="%" hint="And any beat outside 300–2000 ms" />
      </div>
      {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
      {short.length > 0 && <Problem>{short.map((r) => `"${r.name}"`).join(', ')} {short.length === 1 ? 'has' : 'have'} too few good beats (at least 10 needed) and {short.length === 1 ? 'is' : 'are'} left out.</Problem>}
      {!ok.length ? <Problem>Paste at least 10 RR intervals.</Problem> : (
        <>
          <Result big={`${fmt(last.rmssd, 1)} ms`} label={`RMSSD in "${last.name}"${ok.length > 1 ? ` vs ${fmt(b.rmssd, 1)} ms in "${b.name}"` : ''}`}>
            <Stats rows={[
              ['Mean heart rate', ok.map((r) => `${r.name} ${fmt(r.meanHR, 1)} bpm`).join(' · ')],
              ['SDNN', ok.map((r) => `${r.name} ${fmt(r.sdnn, 1)} ms`).join(' · ')],
              ['LF/HF', ok.map((r) => `${r.name} ${fmt(r.lfhf, 2)}`).join(' · ')],
              ['Flagged beats', ok.map((r) => `${r.name} ${r.nBad} (${pctS(r.badShare, 1)})`).join(' · ')],
            ]} />
          </Result>
          <Tachogram res={res.filter((r) => r.ok)} />
          <Table label="HRV by segment" head={['Segment', 'Beats', 'Corrected', 'Minutes', 'Mean HR', 'Mean NN', 'SDNN', 'RMSSD', 'ln RMSSD', 'pNN50', 'SD1', 'SD2', 'SD1/SD2', 'VLF ms²', 'LF ms²', 'HF ms²', 'LF/HF', 'HF peak Hz']}
            rows={ok.map((r) => [r.name, r.n, r.nBad, fmt(r.duration / 60, 1), fmt(r.meanHR, 1), fmt(r.meanNN, 0), fmt(r.sdnn, 1), fmt(r.rmssd, 1), fmt(r.lnRmssd, 2), pctS(r.pnn50, 1), fmt(r.sd1, 1), fmt(r.sd2, 1), fmt(r.sd1sd2, 2), fmt(r.vlf, 0), fmt(r.lf, 0), fmt(r.hf, 0), fmt(r.lfhf, 2), fmt(r.hfPeak, 3)])} />
          {cmp.length > 0 && <Table label="Change from baseline" head={['Segment vs ' + b.name, 'Heart rate', 'RMSSD', 'ln RMSSD', 'SDNN', 'HF power', 'LF/HF ratio']}
            rows={cmp.map((c) => [c.name, `${c.dHR >= 0 ? '+' : '−'}${fmt(Math.abs(c.dHR), 1)} bpm`, `${c.dRmssdPct >= 0 ? '+' : '−'}${pctS(Math.abs(c.dRmssdPct), 0)}`, `${c.dLnRmssd >= 0 ? '+' : '−'}${fmt(Math.abs(c.dLnRmssd), 2)}`, `${c.dSdnnPct >= 0 ? '+' : '−'}${pctS(Math.abs(c.dSdnnPct), 0)}`, `${c.dHfPct >= 0 ? '+' : '−'}${pctS(Math.abs(c.dHfPct), 0)}`, `× ${fmt(c.lfhfRatio, 2)}`])} />}
          <div className="ea-grid2">
            <Poincare res={ok} />
            <p className="sn-note">Each dot is one beat against the next. A tighter, smaller cloud means less beat-to-beat variability; during a task the cloud usually shrinks and moves down-left (shorter intervals, faster heart rate).</p>
          </div>
          <div>
            <LinePlot label="Lomb-Scargle power spectral density by segment" xLabel="Frequency (Hz): VLF < 0.04 ≤ LF < 0.15 ≤ HF ≤ 0.40" yLabel="ms²/Hz" xMin={0} xMax={0.4} yMin={0}
              vlines={[{ x: 0.04, label: '' }, { x: 0.15, label: 'HF' }]} series={ok.map((r) => ({ name: r.name, pts: H.FREQS.map((f, i) => [f, r.psd[i]]), width: 1.8 }))} xFmt={(v) => fmt(v, 2)} yFmt={(v) => (v >= 1000 ? `${fmt(v / 1000, 0)}k` : fmt(v, 0))} />
          </div>
          <div className="sn-actions"><CsvButton name="hrv-by-segment.csv" csv={csv} /></div>
          <StudySummary {...H.hrvSummary(ok, method)} />
        </>
      )}
      <About method="heart-rate-and-heart-rate-variability-measurement" links={[['physiological-signal-acquisition-and-digital-filtering', 'Physiological signal acquisition and filtering'], ['biometric-storyboards', 'Biometric storyboards'], ['cognitive-load-assessment-cognitive-load-theory', 'Cognitive load assessment']]}>
        <p><b>Artefacts.</b> A beat is flagged when it lies outside 300–2000 ms or differs by more than the chosen share (default 20%) from the median of the five good beats on each side. Interpolation replaces it linearly between the nearest good beats; deletion drops it and uses successive differences only between beats that were adjacent in the recording. Beat times always come from the raw recording.</p>
        <p><b>Time domain</b> (Task Force of the ESC and NASPE 1996): mean NN; SDNN = SD of the NN intervals (n − 1); RMSSD = √(mean of (NN<sub>i+1</sub> − NN<sub>i</sub>)²); pNN50 = share of successive differences above 50 ms, out of the number of NN intervals; mean HR = mean of 60000/NN. <b>Poincaré</b> (Brennan, Palaniswami and Kamen 2001): SD1 = SD(ΔNN)/√2, SD2 = SD((NN<sub>i</sub> + NN<sub>i+1</sub>)/√2).</p>
        <p><b>Frequency domain.</b> Classic Lomb-Scargle periodogram (Lomb 1976; Scargle 1982) of the mean-centred NN intervals at their beat times, which needs no resampling: P(ω) = ½[(Σ y cos ω(t − τ))² / Σ cos² ω(t − τ) + (Σ y sin ω(t − τ))² / Σ sin² ω(t − τ)], tan 2ωτ = Σ sin 2ωt / Σ cos 2ωt, on a 0.001 Hz grid from 0.003 to 0.400 Hz, scaled to a one-sided density S = 2PT/N (ms²/Hz) so that its integral is close to the variance. Band powers are trapezoid integrals over VLF 0.003–0.04, LF 0.04–0.15 and HF 0.15–0.40 Hz.</p>
        <p><b>Checked</b> against neurokit2 (hrv_time, hrv_nonlinear: identical SDNN, RMSSD, pNN50, SD1, SD2), scipy.signal.lombscargle and astropy LombScargle (identical spectrum and band powers); neurokit2's own LF/HF, on its own frequency grid and scaling, agrees within 4%.</p>
        <p><b>When not to use it.</b> Do not compare segments of very different length (SDNN and LF grow with duration), segments under 2 minutes for LF/HF, or recordings where people talk, move or change posture during one segment only. Use beat-to-beat intervals from an ECG or a chest strap; wrist PPG optical sensors smooth and miss beats. One person's segments show a within-person change, not a population effect.</p>
      </About>
    </div>
  );
}

export default SensorsHrv;
