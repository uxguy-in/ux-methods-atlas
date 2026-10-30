// Shared UI for the statistics workbench tools: an inline SVG chart (lines, steps, points, bands, bars, shaded
// regions), a Web Worker job hook with progress, and a small column summary for pasted tables. Theme tokens only.
import { useEffect, useRef, useState } from 'react';
import './statsbench.css';

const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};
export const col = (i) => `var(--c${(i % 8) + 1})`;
const short = (v) => { const a = Math.abs(v); return a >= 1e4 ? `${+(v / 1000).toPrecision(3)}k` : a >= 100 ? String(Math.round(v)) : String(+v.toPrecision(3)); };
const stepPts = (pts, xEnd) => {
  const out = [];
  pts.forEach(([x, y], i) => { if (i > 0) out.push([x, pts[i - 1][1]]); out.push([x, y]); });
  if (Number.isFinite(xEnd) && pts.length && xEnd > pts[pts.length - 1][0]) out.push([xEnd, pts[pts.length - 1][1]]);
  return out;
};

// series: [{ type: 'line' | 'points' | 'band' | 'bars', name, pts | lo + hi | bars, color, dash, step, r, hideLegend }]
// regions: shaded x ranges [{ x0, x1, tone: 'ok' | 'bad' | 'soft' }]; hlines/vlines: [{ y | x, label }]; diag: y = x line.
export function Chart({ series, label, xLabel, yLabel, height = 280, xMin, xMax, yMin, yMax, xFmt = short, yFmt = short, hlines = [], vlines = [], regions = [], legend = true, diag = false, stepEnd }) {
  const W = 640, H = height, L = 58, R = 16, T = 14, B = 44;
  const xs = [], ys = [];
  for (const s of series) {
    const pts = s.type === 'band' ? [...s.lo, ...s.hi] : s.type === 'bars' ? s.bars.flatMap((b) => [[b.x0, 0], [b.x1, b.y]]) : s.pts;
    for (const [x, y] of pts) { if (Number.isFinite(x)) xs.push(x); if (Number.isFinite(y)) ys.push(y); }
  }
  if (!xs.length || !ys.length) return null;
  let x0 = xMin ?? Math.min(...xs), x1 = xMax ?? Math.max(...xs), y0 = yMin ?? Math.min(...ys, ...hlines.map((h) => h.y)), y1 = yMax ?? Math.max(...ys, ...hlines.map((h) => h.y));
  if (diag) { y0 = Math.min(y0, x0); y1 = Math.max(y1, x1); }
  if (x1 === x0) { x1 += 1; x0 -= 1; }
  if (y1 === y0) { y1 += 1; y0 -= 1; }
  if (yMin === undefined && yMax === undefined) { const p = (y1 - y0) * 0.04; y0 -= p; y1 += p; }
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const clampY = (y) => Math.max(y0, Math.min(y1, y));
  const path = (pts) => pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y]) => `${sx(x).toFixed(1)},${sy(clampY(y)).toFixed(1)}`).join(' ');
  return (
    <figure className="sb-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
        {regions.map((r, i) => <rect key={`r${i}`} x={sx(Math.max(x0, r.x0))} y={T} width={Math.max(0, sx(Math.min(x1, r.x1)) - sx(Math.max(x0, r.x0)))} height={H - T - B} className={`sb-region ${r.tone || 'soft'}`} />)}
        {niceTicks(y0, y1, 5).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
        {niceTicks(x0, x1, 6).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{xFmt(v)}</text>)}
        {diag && <line x1={sx(Math.max(x0, y0))} y1={sy(Math.max(x0, y0))} x2={sx(Math.min(x1, y1))} y2={sy(Math.min(x1, y1))} className="ea-ref" />}
        {hlines.map((h, i) => <g key={`h${i}`}><line x1={L} x2={W - R} y1={sy(h.y)} y2={sy(h.y)} className="ea-ref" />{h.label && <text x={W - R - 4} y={sy(h.y) - 5} className="lbs" textAnchor="end">{h.label}</text>}</g>)}
        {vlines.map((v, i) => <g key={`v${i}`}><line x1={sx(v.x)} x2={sx(v.x)} y1={T} y2={H - B} className="ea-ref" style={v.color ? { stroke: v.color, strokeDasharray: 'none', strokeWidth: 2 } : undefined} />{v.label && <text x={Math.min(sx(v.x) + 4, W - R - 60)} y={T + 12 + (i % 3) * 13} className="lbs">{v.label}</text>}</g>)}
        {series.map((s, i) => {
          const c = s.color || col(i);
          if (s.type === 'band') {
            const lo = s.step ? stepPts(s.lo, stepEnd) : s.lo, hi = s.step ? stepPts(s.hi, stepEnd) : s.hi;
            return <polygon key={i} points={`${path(lo)} ${path([...hi].reverse())}`} className="sb-band" style={{ fill: c }} />;
          }
          if (s.type === 'bars') return <g key={i}>{s.bars.map((b, j) => <rect key={j} x={sx(b.x0) + 0.5} y={sy(b.y)} width={Math.max(0.5, sx(b.x1) - sx(b.x0) - 1)} height={Math.max(0, sy(y0 < 0 ? 0 : y0) - sy(b.y))} className="sb-bar" style={{ fill: c }} />)}</g>;
          if (s.type === 'points') return <g key={i}>{s.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y, t, hl], j) => <circle key={j} cx={sx(x)} cy={sy(clampY(y))} r={hl ? (s.r || 3.2) + 1.8 : s.r || 3.2} className={hl ? 'sb-pt hl' : 'sb-pt'} style={{ fill: hl ? 'var(--bad)' : c }}>{t && <title>{t}</title>}</circle>)}</g>;
          const pts = s.step ? stepPts(s.pts, stepEnd) : s.pts;
          return <polyline key={i} points={path(pts)} style={{ fill: 'none', stroke: c, strokeWidth: s.width || 2.2, strokeDasharray: s.dash || 'none' }} />;
        })}
        {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
        {yLabel && <text x={13} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 13 ${(T + H - B) / 2})`}>{yLabel}</text>}
      </svg>
      {legend && series.filter((s) => s.name && !s.hideLegend).length > 1 && (
        <ul className="tl-legend">{series.map((s, i) => (s.name && !s.hideLegend ? <li key={i}><i style={{ background: s.color || col(i) }} />{s.name}</li> : null))}</ul>
      )}
    </figure>
  );
}

// Runs a job in statsbench.worker.js with progress; falls back to running it inline. `key` changes trigger a rerun;
// `job` is { type, args } or null. A new job terminates the previous worker, so stale results never arrive.
export function useJob(key, job, inline) {
  const [state, setState] = useState({ result: null, progress: 0, running: false, error: null, key: null });
  const ref = useRef(null);
  useEffect(() => {
    if (!job) { setState({ result: null, progress: 0, running: false, error: null, key }); return undefined; }
    let cancelled = false, w = null;
    setState((s) => ({ ...s, running: true, progress: 0, error: null }));
    const t = setTimeout(() => {
      try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./statsbench.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
      if (!w) {
        try { const result = inline(); if (!cancelled) setState({ result, progress: 1, running: false, error: null, key }); } catch (e) { if (!cancelled) setState({ result: null, progress: 0, running: false, error: e.message, key }); }
        return;
      }
      ref.current = w;
      w.onmessage = ({ data }) => {
        if (cancelled) return;
        if (data.progress !== undefined) setState((s) => ({ ...s, progress: data.progress }));
        else { setState({ result: data.error ? null : data.result, progress: 1, running: false, error: data.error || null, key }); w.terminate(); }
      };
      w.onerror = (e) => { if (!cancelled) { setState({ result: null, progress: 0, running: false, error: e.message || 'Worker failed', key }); } w.terminate(); };
      w.postMessage({ id: 1, ...job });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); if (w) w.terminate(); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
export function Progress({ value, label = 'Resampling' }) {
  return <div className="sb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}><i style={{ width: `${Math.round(value * 100)}%` }} /><span>{label}… {Math.round(value * 100)}%</span></div>;
}

// The columns found in a pasted table, as tags.
export function ColumnTags({ table }) {
  if (!table.cols.length) return null;
  return (
    <p className="sb-cols">
      <span className="sb-muted">{table.n} rows · </span>
      {table.cols.map((c) => <span key={c.name} className="qtag" title={c.numeric ? 'numeric' : `categorical: ${c.levels.slice(0, 8).join(', ')}`}>{c.name}<em>{c.numeric ? ' num' : ` ${c.levels.length} levels`}</em>{c.missing ? ` · ${c.missing} missing` : ''}</span>)}
    </p>
  );
}
