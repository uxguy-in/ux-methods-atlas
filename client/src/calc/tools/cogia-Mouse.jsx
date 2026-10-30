import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as MT from './cogia-mouse.js';
import { fmt, pText } from './cogia-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About, download } from './ui.jsx';
import './cogia.css';

const col = (i) => `var(--c${(i % 8) + 1})`;

// Time-normalised trajectories (remapped: start at 0,0, chosen option to the right, y up), faint per trial, bold mean.
function TrajPlot({ r, showTrials }) {
  const W = 620, H = 440, M = 30;
  const pts = r.trials.flatMap((t) => t.tn.x.map((x, k) => [x, t.tn.y[k]]));
  let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(0, ...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const s = Math.min((W - 2 * M) / (x1 - x0 || 1), (H - 2 * M) / (y1 - y0 || 1));
  const ox = M + ((W - 2 * M) - s * (x1 - x0)) / 2, oy = H - M - ((H - 2 * M) - s * (y1 - y0)) / 2;
  const X = (v) => ox + (v - x0) * s, Y = (v) => oy - (v - y0) * s;
  const path = (xs, ys) => xs.map((x, k) => `${k ? 'L' : 'M'}${X(x).toFixed(1)},${Y(ys[k]).toFixed(1)}`).join('');
  const sample = r.trials.length > 300 ? r.trials.filter((_, i) => i % Math.ceil(r.trials.length / 300) === 0) : r.trials;
  return (
    <figure className="ea-fig">
      <div className="cg-wrap cg-fit"><svg viewBox={`0 0 ${W} ${H}`} className="cg-plot" role="img" aria-label="Mean time-normalised trajectories by condition">
        <line x1={X(x0)} x2={X(x1)} y1={Y(0)} y2={Y(0)} className="grid" />
        <line x1={X(0)} x2={X(0)} y1={Y(y0)} y2={Y(y1)} className="grid" />
        {showTrials && sample.map((t, i) => <path key={i} d={path(t.tn.x, t.tn.y)} className="trj" style={{ stroke: col(r.conds.indexOf(t.condition)) }} />)}
        {r.per.map((p, i) => <path key={p.condition} d={`M${X(0)},${Y(0)}L${X(p.avg[p.avg.length - 1][0])},${Y(p.avg[p.avg.length - 1][1])}`} className="direct" style={{ opacity: i ? 0 : 1 }} />)}
        {r.per.map((p, i) => <path key={`m${p.condition}`} d={path(p.avg.map((a) => a[0]), p.avg.map((a) => a[1]))} className="trj mean" style={{ stroke: col(i) }} />)}
        <text x={X(0) + 6} y={Y(0) - 6} className="ax">start</text>
        <text x={M} y={M - 10} className="ax">← unchosen side</text>
        <text x={W - M} y={M - 10} className="ax" textAnchor="end">chosen side →</text>
      </svg></div>
      <ul className="cg-legend">{r.per.map((p, i) => <li key={p.condition}><i className="ln" style={{ background: col(i) }} />{p.condition} (mean of {p.n} trials)</li>)}<li><i className="ln" style={{ background: 'var(--ink-3)' }} />Direct path</li></ul>
    </figure>
  );
}

// Histogram of z-scored AUC per condition: a dip in the middle suggests two kinds of trials.
function AucHist({ r }) {
  const W = 620, H = 200, L = 34, R = 10, T = 10, B = 30, lo = -3, hi = 3.5, bins = 13, w = (hi - lo) / bins;
  const zs = new Map(); // recompute z (within participant when known) for display, same as the analysis
  const groups = r.hasParticipant ? [...new Set(r.trials.map((t) => t.participant))] : [''];
  for (const g of groups) { const ts = r.trials.filter((t) => !r.hasParticipant || t.participant === g); const m = ts.reduce((a, t) => a + t.auc, 0) / ts.length; const sd = Math.sqrt(ts.reduce((a, t) => a + (t.auc - m) ** 2, 0) / (ts.length - 1)); ts.forEach((t) => zs.set(t, sd > 0 ? (t.auc - m) / sd : 0)); }
  const counts = r.conds.map((c) => { const h = new Array(bins).fill(0); r.trials.filter((t) => t.condition === c).forEach((t) => { const k = Math.min(bins - 1, Math.max(0, Math.floor((zs.get(t) - lo) / w))); h[k]++; }); return h; });
  const max = Math.max(1, ...counts.flat());
  const bw = (W - L - R) / bins, gw = bw / r.conds.length;
  return (
    <figure className="ea-fig">
      <div className="cg-wrap cg-fit"><svg viewBox={`0 0 ${W} ${H}`} className="cg-plot" role="img" aria-label="Distribution of z-scored AUC by condition">
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={T + (1 - f) * (H - T - B)} y2={T + (1 - f) * (H - T - B)} className="grid" /><text x={L - 5} y={T + (1 - f) * (H - T - B) + 4} className="ax" textAnchor="end">{Math.round(f * max)}</text></g>)}
        {counts.map((h, c) => h.map((v, k) => <rect key={`${c}-${k}`} x={L + k * bw + c * gw + 1} y={T + (1 - v / max) * (H - T - B)} width={Math.max(1, gw - 2)} height={(v / max) * (H - T - B)} style={{ fill: col(c) }} />))}
        {[-3, -2, -1, 0, 1, 2, 3].map((v) => <text key={v} x={L + ((v - lo) / (hi - lo)) * (W - L - R)} y={H - B + 15} className="ax" textAnchor="middle">{v}</text>)}
        <text x={(W + L) / 2} y={H - 3} className="ax" textAnchor="middle">AUC (z-score{r.hasParticipant ? ' within participant' : ''})</text>
      </svg></div>
    </figure>
  );
}

function CogiaMouse() {
  const [text, setText] = useState(() => MT.exampleCsv());
  const [yDown, setYDown] = useState(true);
  const [showTrials, setShowTrials] = useState(true);
  const load = () => { setText(MT.exampleCsv()); setYDown(true); };
  const parsed = useMemo(() => MT.parseSamples(text), [text]);
  const r = useMemo(() => (parsed.error ? null : MT.analyseMouse(parsed, { yDown })), [parsed, yDown]);
  const c = r?.compare[0];

  return (
    <div className="cg-root">
      <LoadExample onClick={load} />
      <Area label="Cursor samples (CSV with a header: participant, trial, condition, t, x, y)" value={text} onChange={setText} rows={7} wrap="off" hint="One row per sample; t in ms. Participant and condition are optional. Each trial should run from the start click to the response click." />
      <div className="calc-inputs">
        <label className="tl-check"><input type="checkbox" checked={yDown} onChange={(e) => setYDown(e.target.checked)} /> y grows downward (screen pixels)</label>
        <label className="tl-check"><input type="checkbox" checked={showTrials} onChange={(e) => setShowTrials(e.target.checked)} /> Show single trials</label>
      </div>
      {parsed.error && <Problem>{parsed.error}</Problem>}
      {r && (
        <>
          <Result big={c?.auc ? `${c.auc.diff > 0 ? '+' : ''}${fmt(c.auc.diff, 0)} px²` : `${fmt(r.per[0].auc.mean, 0)} px²`} tone={c?.auc && c.auc.p < 0.05 ? 'good' : undefined} label={c?.auc ? `Difference in mean area under the curve, ${c.condition} minus ${c.ref} (${pText(c.auc.p)}).` : 'Mean area under the curve.'}>
            <Stats rows={[
              ['Trials', `${r.trials.length}${r.hasParticipant ? ` from ${r.nParticipants} participants` : ''}${parsed.skipped ? `; ${parsed.skipped} rows unreadable` : ''}`],
              ['Conditions', r.conds.join(', ')],
              c?.auc && ['AUC difference, 95% CI', `${fmt(c.auc.lo, 0)} to ${fmt(c.auc.hi, 0)} px² (${c.auc.kind === 'paired' ? `paired, ${c.auc.n} participants` : 'Welch, trials'})`],
              c?.mad && ['MAD difference', `${fmt(c.mad.diff, 1)} px (${pText(c.mad.p)})`],
              c?.rt && ['Response-time difference', `${fmt(c.rt.diff, 0)} ms (${pText(c.rt.p)})`],
              ['Bimodality coefficient, all trials', `${fmt(r.all.bc, 3)} (0.555 = threshold)`],
            ]} />
          </Result>
          <TrajPlot r={r} showTrials={showTrials} />
          <Table label="Measures by condition" head={['Condition', 'Trials', 'AUC (px²)', 'MAD (px)', 'x-flips', 'RT (ms)', 'Initiation (ms)', 'BC of AUC']} rows={r.per.map((p) => [p.condition, p.n, `${fmt(p.auc.mean, 0)} [${fmt(p.auc.lo, 0)}, ${fmt(p.auc.hi, 0)}]`, `${fmt(p.mad.mean, 1)} [${fmt(p.mad.lo, 1)}, ${fmt(p.mad.hi, 1)}]`, fmt(p.flips.mean, 2), fmt(p.rt.mean, 0), fmt(p.init.mean, 0), <span key="b" className={p.bc.bc > 0.555 ? 'cg-flag warn' : ''}>{fmt(p.bc.bc, 3)}</span>])} />
          <p className="cg-note">Means with 95% confidence intervals over trials in brackets. BC = bimodality coefficient of z-scored AUC; above 0.555 suggests two kinds of trial (Pfister et al. 2013).</p>
          <h3 className="clu-h3">Distribution of curvature</h3>
          <AucHist r={r} />
          <div className="cg-actions"><button type="button" className="btn ghost small" onClick={() => download('mouse-tracking-trials.csv', MT.trialsCsv(r), 'text/csv')}>Download trial measures (CSV)</button></div>
          <StudySummary {...MT.mouseSummary(r)} />
        </>
      )}
      <About method="mouse-tracking-of-decision-conflict">
        <p><b>Preparation</b> (as in the mousetrap package; Kieslich et al. 2019). Each trial is sorted by time, moved so it starts at (0, 0), flipped so y points up (screen coordinates grow downward), and mirrored so it ends on the right. Deviations towards the left of the direct path, the side of the unchosen option, are then positive.</p>
        <p><b>Measures on the raw samples.</b> The direct path runs from the first to the last sample. For every sample, a is its position along the path and d its signed perpendicular distance. Maximum absolute deviation (MAD) is the d with the largest absolute value (sign kept). Area under the curve AUC = Σ (a_(i+1) − a_i)(d_i + d_(i+1))/2, the area between the trajectory and the direct path, with area on the far side counting negative (Freeman and Ambady 2010). x-flips count reversals of direction along x (zero steps ignored). RT is last minus first time stamp; initiation time is the time of the last sample before the cursor first moves.</p>
        <p><b>Time normalisation.</b> Each trajectory is resampled at 101 equally spaced times from start to end by linear interpolation, so trials of different length can be averaged step by step into mean trajectories per condition.</p>
        <p><b>Bimodality coefficient</b> (SAS Institute; Freeman and Dale 2013; Pfister et al. 2013): BC = (g₁² + 1)/(g₂ + 3(n − 1)²/((n − 2)(n − 3))) with the bias-corrected skewness g₁ and excess kurtosis g₂, computed on AUC z-scored within participant. BC above 0.555 (the value for a uniform distribution) suggests a bimodal mix, such as straight trials plus changes of mind.</p>
        <p><b>Comparisons.</b> Each condition is compared with the first: a paired t test on participant means when a participant column is given, otherwise a Welch t test over trials.</p>
        <p><b>Checks.</b> Every trial's MAD, AUC, x-flips and time-normalised path, the condition means and the bimodality coefficients are checked against an independent numpy/scipy implementation.</p>
        <p><b>When not to use it.</b> When participants could start moving before the options were visible (or long after), when the response layout differs between conditions, or with touch screens and very low sampling rates. Curvature is a relative measure: compare conditions within one set-up.</p>
      </About>
    </div>
  );
}

export default CogiaMouse;
