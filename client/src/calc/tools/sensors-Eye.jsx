import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as Y from './sensors-eye.js';
import { fmt, pctS, toCsv } from './sensors-core.js';
import { EX_EYE_FIX, EX_EYE_AOI } from './sensors-examples.js';
import { Table, LoadExample, color } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About } from './ui.jsx';
import { CsvButton, HeatMatrix } from './sensors-ui.jsx';
import './sensors.css';

// The stimulus area with AOI rectangles and every fixation (circle area ∝ duration).
function Stimulus({ rows, aois }) {
  const w = Math.max(...aois.map((a) => a.x + a.w), ...rows.map((r) => r.x)) * 1.02, h = Math.max(...aois.map((a) => a.y + a.h), ...rows.map((r) => r.y)) * 1.02;
  const maxD = Math.max(...rows.map((r) => r.d));
  const k = Math.max(w, h) / 120;
  return (
    <figure className="sn-fig">
      <svg viewBox={`${-k} ${-k} ${w + 2 * k} ${h + 2 * k}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Areas of interest and all fixations on the stimulus">
        <rect x={0} y={0} width={w} height={h} style={{ fill: 'none', stroke: 'var(--line)' }} />
        {aois.map((a, i) => <g key={a.code}><rect x={a.x} y={a.y} width={a.w} height={a.h} className="aoi-fill" style={{ fill: color(i) }} /><rect x={a.x} y={a.y} width={a.w} height={a.h} className="aoi" style={{ stroke: color(i) }} /></g>)}
        {rows.map((r, i) => <circle key={i} cx={r.x} cy={r.y} r={k * (0.4 + 1.1 * Math.sqrt(r.d / maxD))} className="fx" style={{ fill: 'var(--ink-2)' }} />)}
        {aois.map((a, i) => <text key={a.code} x={a.x + k} y={a.y + 2.8 * k} className="node-lbl" style={{ fontSize: 2.4 * k }}>{a.code} · {a.name}</text>)}
      </svg>
      <p className="sn-note">Dots are fixations from every participant; bigger dots are longer fixations. Fixations in overlapping AOIs count for the first AOI in your list.</p>
    </figure>
  );
}

function SensorsEyeTracking() {
  const [fixText, setFix] = useState(EX_EYE_FIX);
  const [aoiText, setAoi] = useState(EX_EYE_AOI);
  const [collapse, setCollapse] = useState(true);
  const [tMode, setTMode] = useState('count');
  const loadExample = () => { setFix(EX_EYE_FIX); setAoi(EX_EYE_AOI); setCollapse(true); setTMode('count'); };
  const fx = useMemo(() => Y.parseFixations(fixText), [fixText]);
  const ao = useMemo(() => Y.parseAois(aoiText), [aoiText]);
  const r = useMemo(() => (fx.rows.length && ao.aois.length ? Y.analyse(fx.rows, ao.aois, { collapse }) : null), [fx, ao, collapse]);
  const codes = ao.aois.map((a) => `${a.code} ${a.name}`);
  const csv = r ? toCsv([['aoi', 'hit_ratio', 'dwell_share', 'mean_dwell_ms_all', 'mean_dwell_ms_seen', 'mean_ttff_ms', 'median_ttff_ms', 'mean_fixations', 'mean_revisits'], ...r.aoiStats.map((a) => [a.name, a.hitRatio.toFixed(3), a.dwellShare.toFixed(4), a.dwellMean.toFixed(1), Number.isFinite(a.dwellMeanSeen) ? a.dwellMeanSeen.toFixed(1) : '', Number.isFinite(a.ttffMean) ? a.ttffMean.toFixed(1) : '', Number.isFinite(a.ttffMedian) ? a.ttffMedian.toFixed(1) : '', a.countMean.toFixed(2), Number.isFinite(a.revisitsMean) ? a.revisitsMean.toFixed(2) : ''])]) : '';
  const ids = r ? r.people.map((p) => p.id) : [];

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <div className="ea-grid2">
        <Area label="Fixations: participant, x, y, duration ms (optional start ms), in viewing order" value={fixText} onChange={setFix} rows={8} hint="Export fixations (not raw gaze samples) from your eye tracker; a header row is skipped." wrap="off" />
        <Area label="AOIs: name, x, y, width, height (pixels, top-left origin)" value={aoiText} onChange={setAoi} rows={8} hint="Each AOI gets a letter (A, B, C …) used in the scanpaths." wrap="off" />
      </div>
      <div className="calc-inputs ea-inputs">
        <Choice label="Scanpaths" value={collapse} onChange={setCollapse} options={[[true, 'Collapse repeated AOIs (AAB → AB)'], [false, 'Every fixation']]} />
      </div>
      {fx.errors.length > 0 && <Problem>{fx.errors.slice(0, 3).join(' · ')}</Problem>}
      {ao.errors.length > 0 && <Problem>{ao.errors.slice(0, 3).join(' · ')}</Problem>}
      {!r ? <Problem>Paste fixations and at least one AOI.</Problem> : (
        <>
          <Result big={pctS([...r.aoiStats].sort((a, b) => b.dwellShare - a.dwellShare)[0].dwellShare, 0)} label={`of fixation time on "${[...r.aoiStats].sort((a, b) => b.dwellShare - a.dwellShare)[0].name}", the most-viewed AOI (${r.N} participants, ${fx.rows.length} fixations)`}>
            <Stats rows={[
              ['Fixation time outside every AOI', pctS(r.outsideShare, 1)],
              ['AOI transitions', r.nTrans],
              ['Mean scanpath similarity', r.N > 1 ? fmt(r.meanSim, 2) : '·'],
            ]} />
          </Result>
          <Stimulus rows={fx.rows} aois={ao.aois} />
          <div>
            <Table label="AOI metrics" head={['AOI', 'Hit ratio', 'Dwell share', 'Mean dwell (lookers)', 'Time to first fixation', 'Fixations / person', 'Revisits']}
              rows={r.aoiStats.map((a) => [`${a.code} ${a.name}`, pctS(a.hitRatio, 0), pctS(a.dwellShare, 1), Number.isFinite(a.dwellMeanSeen) ? `${fmt(a.dwellMeanSeen, 0)} ms` : '·', Number.isFinite(a.ttffMean) ? `${fmt(a.ttffMean / 1000, 2)} s` : '·', fmt(a.countMean, 1), Number.isFinite(a.revisitsMean) ? fmt(a.revisitsMean, 2) : '·'])} />
          </div>
          <h3 className="clu-h3">Transitions between AOIs (from row to column)</h3>
          <div className="calc-inputs ea-inputs"><Choice label="Show" value={tMode} onChange={setTMode} options={[['count', 'Counts'], ['p', 'Share of moves leaving the row AOI']]} /></div>
          <HeatMatrix label="AOI transition matrix" corner="from → to" rowNames={codes} colNames={ao.aois.map((a) => a.code)} rows={tMode === 'count' ? r.T : r.Tp} fmtCell={tMode === 'count' ? (v) => String(v) : (v) => pctS(v, 0)} max={tMode === 'count' ? undefined : 1} />
          {r.N > 1 && (
            <>
              <h3 className="clu-h3">Scanpath similarity between participants</h3>
              <p className="sn-note">1 − Levenshtein distance / length of the longer scanpath: 1 = identical order of AOIs, 0 = nothing in common.</p>
              <HeatMatrix label="Scanpath similarity matrix" rowNames={ids} colNames={ids} rows={r.S} fmtCell={(v) => fmt(v, 2)} max={1} tone="var(--c4)" diag />
              <Table label="Scanpaths" num={false} head={['Participant', 'Fixations', 'Scanpath', 'Mean similarity to others']} rows={r.people.map((p) => [p.id, p.n, <span key="p" className="sn-mono">{p.path || '·'}</span>, fmt(r.typical.find((t) => t.id === p.id).mean, 2)])} />
            </>
          )}
          <div className="sn-actions"><CsvButton name="aoi-metrics.csv" csv={csv} /></div>
          <StudySummary {...Y.eyeSummary(r)} />
        </>
      )}
      <About method="eye-tracking" links={[['eye-movement-scanpath-analysis', 'Scanpath analysis']]}>
        <p><b>AOI hits.</b> A fixation belongs to the first AOI in your list whose rectangle contains it (edges included). <b>Dwell share</b> = fixation time in the AOI / all fixation time. <b>Hit ratio</b> = share of participants with at least one fixation in it. <b>Time to first fixation</b> = start of the first fixation in the AOI relative to the first fixation of the trial (the start column if given, otherwise the sum of earlier fixation durations), averaged over the participants who looked at it. <b>Visits</b> are runs of consecutive fixations in the same AOI; revisits = visits − 1.</p>
        <p><b>Transitions</b> count moves between consecutive AOI fixations of the same person, with fixations outside every AOI dropped and repeats collapsed. <b>Scanpath similarity</b> (Privitera and Stark 2000; Josephson and Holmes 2002): each scanpath is a string of AOI letters; similarity = 1 − d/max(|a|, |b|), with d the Levenshtein edit distance (insertions, deletions and substitutions cost 1).</p>
        <p><b>Checked</b> against pandas (identical dwell, hit ratio, time to first fixation, fixation counts and revisits) and the Levenshtein package (identical distances and similarity matrix).</p>
        <p><b>When not to use it.</b> With raw gaze samples instead of fixations, AOIs smaller than the tracker's accuracy (about 1° of visual angle), dynamic pages where content moves under fixed AOIs, or scrolling pages without mapping gaze to page coordinates. Levenshtein similarity ignores how long people looked; use it to compare viewing order, not attention.</p>
      </About>
    </div>
  );
}

export default SensorsEyeTracking;
