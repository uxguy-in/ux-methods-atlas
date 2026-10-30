// Small shared pieces for the surveyx tools: column pickers, a worker runner and inline SVG charts.
// Theme tokens only (--c1…--c8, --ink, --line, --ok/--warn/--bad), so light and dark mode follow the site.
import { useEffect, useRef, useState } from 'react';
import { download } from './ui.jsx';
import './surveyx.css';

export const color = (i) => `var(--c${(i % 8) + 1})`;
export const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};

export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="seg sx-tabs" role="tablist" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
// Toggle chips for choosing several columns.
export function ColumnChips({ label, head, value, onChange, allowed }) {
  return (
    <div className="calc-field wide">
      <span>{label}</span>
      <div className="sx-chips" role="group" aria-label={label}>
        {head.map((h, j) => (allowed && !allowed(j) ? null : (
          <button key={j} type="button" aria-pressed={value.includes(j)} className={`sx-chip${value.includes(j) ? ' on' : ''}`} onClick={() => onChange(value.includes(j) ? value.filter((x) => x !== j) : [...value, j].sort((a, b) => a - b))}>{h}</button>
        )))}
      </div>
    </div>
  );
}
export function ColumnPick({ label, head, value, onChange, allowed, none }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {none && <option value={-1}>{none}</option>}
        {head.map((h, j) => (allowed && !allowed(j) ? null : <option key={j} value={j}>{h}</option>))}
      </select>
    </label>
  );
}
export function CsvButton({ name, rows, children = 'Download CSV' }) {
  const csv = rows.map((r) => r.map((v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  return <button type="button" className="btn ghost small" onClick={() => download(name, csv, 'text/csv')}>{children}</button>;
}

// Runs one job in the surveyx Web Worker (falls back to the page when workers are unavailable).
export function useWorkerJob(job, key, fallback) {
  const [state, setState] = useState({ result: null, busy: false, error: null });
  const seq = useRef(0);
  useEffect(() => {
    if (!job) { setState({ result: null, busy: false, error: null }); return undefined; }
    const id = ++seq.current;
    let w = null;
    setState((s) => ({ ...s, busy: true, error: null }));
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./surveyx.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
    if (!w) {
      const t = setTimeout(() => {
        try { const r = fallback(job); if (id === seq.current) setState({ result: r, busy: false, error: null }); } catch (e) { if (id === seq.current) setState({ result: null, busy: false, error: e.message }); }
      }, 10);
      return () => clearTimeout(t);
    }
    w.onmessage = ({ data }) => { if (id === seq.current) setState(data.error ? { result: null, busy: false, error: data.error } : { result: data.result, busy: false, error: null }); w.terminate(); };
    w.onerror = (e) => { if (id === seq.current) setState({ result: null, busy: false, error: e.message || 'Worker failed' }); w.terminate(); };
    w.postMessage(job);
    return () => w.terminate();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// Quadrant chart with crosshairs (importance-performance). points: [{ name, x, y, q }]; quadrant classes on q.
export function QuadrantChart({ points, cx, cy, xLabel, yLabel, label, quadNames, fmtX = (v) => String(v), fmtY = (v) => String(v) }) {
  const W = 640, H = 420, L = 56, R = 16, T = 16, B = 46;
  const xs = points.map((p) => p.x).concat(cx), ys = points.map((p) => p.y).concat(cy);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x1 - x0) * 0.12 || 1, py = (y1 - y0) * 0.12 || 1; x0 -= px; x1 += px; y0 -= py; y1 += py;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  // Label placement: alternate sides, and nudge labels that would overlap a previous one.
  const placed = [];
  const labels = points.map((p, i) => {
    let lx = sx(p.x) + 8, ly = sy(p.y) + 4, anchor = 'start';
    if (lx > W - R - 120) { lx = sx(p.x) - 8; anchor = 'end'; }
    for (let k = 0; k < 6 && placed.some((q) => Math.abs(q.y - ly) < 13 && Math.abs(q.x - lx) < 110); k++) ly += 13;
    placed.push({ x: lx, y: ly });
    return { lx, ly, anchor, i };
  });
  return (
    <div className="sx-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot sx-quad" role="img" aria-label={label}>
        <rect x={L} y={T} width={sx(cx) - L} height={sy(cy) - T} className="q concentrate" />
        <rect x={sx(cx)} y={T} width={W - R - sx(cx)} height={sy(cy) - T} className="q keep" />
        <rect x={L} y={sy(cy)} width={sx(cx) - L} height={H - B - sy(cy)} className="q low" />
        <rect x={sx(cx)} y={sy(cy)} width={W - R - sx(cx)} height={H - B - sy(cy)} className="q overkill" />
        {niceTicks(y0, y1, 5).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{fmtY(v)}</text></g>)}
        {niceTicks(x0, x1, 6).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmtX(v)}</text>)}
        <line x1={sx(cx)} x2={sx(cx)} y1={T} y2={H - B} className="sx-cross" />
        <line x1={L} x2={W - R} y1={sy(cy)} y2={sy(cy)} className="sx-cross" />
        {quadNames && <>
          <text x={L + 6} y={T + 14} className="lbs sx-qn">{quadNames.concentrate}</text>
          <text x={W - R - 6} y={T + 14} className="lbs sx-qn" textAnchor="end">{quadNames.keep}</text>
          <text x={L + 6} y={H - B - 8} className="lbs sx-qn">{quadNames.low}</text>
          <text x={W - R - 6} y={H - B - 8} className="lbs sx-qn" textAnchor="end">{quadNames.overkill}</text>
        </>}
        {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={5} className={`sx-pt ${p.q}`} />)}
        {labels.map(({ lx, ly, anchor, i }) => <text key={`l${i}`} x={lx} y={ly} className="lb" textAnchor={anchor}>{points[i].name.length > 22 ? `${points[i].name.slice(0, 21)}…` : points[i].name}</text>)}
        <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>
        <text x={14} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );
}

// Histogram with an optional density curve and vertical markers. bins: [{ x0, x1, count }]; curve: [[x, count]].
export function Histogram({ bins, curve, marks = [], label, xLabel, bands }) {
  const W = 640, H = 260, L = 46, R = 14, T = 22, B = 42;
  const x0 = bins[0].x0, x1 = bins[bins.length - 1].x1;
  const ymax = Math.max(...bins.map((b) => b.count), ...(curve || []).map((c) => c[1])) * 1.08 || 1;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - y / ymax) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {bands && bands.map((b, i) => (b.x1 > x0 && b.x0 < x1 ? <g key={`b${i}`}><rect x={sx(Math.max(x0, b.x0))} y={T} width={Math.max(0, sx(Math.min(x1, b.x1)) - sx(Math.max(x0, b.x0)))} height={H - T - B} className={`sx-band ${i % 2 ? 'odd' : ''}`} /><text x={(sx(Math.max(x0, b.x0)) + sx(Math.min(x1, b.x1))) / 2} y={T - 6} className="lbs" textAnchor="middle">{b.label}</text></g> : null))}
      {niceTicks(0, ymax, 4).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{v}</text></g>)}
      {bins.map((b, i) => <rect key={i} x={sx(b.x0) + 0.5} y={sy(b.count)} width={Math.max(0, sx(b.x1) - sx(b.x0) - 1)} height={Math.max(0, H - B - sy(b.count))} className="sx-bin" />)}
      {curve && <polyline points={curve.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} className="sx-curve" />}
      {niceTicks(x0, x1, 8).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{v}</text>)}
      {marks.map((m, i) => (m.x >= x0 && m.x <= x1 ? <g key={`m${i}`}><line x1={sx(m.x)} x2={sx(m.x)} y1={T} y2={H - B} className="sx-mark" style={{ stroke: color(i) }} /><text x={sx(m.x) + 4} y={T + 12 + 13 * i} className="lb" style={{ fill: color(i) }}>{m.label}</text></g> : null))}
      {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
    </svg>
  );
}

// Grouped columns: categories along x, one bar per series. series: [{ name, values }].
export function GroupedColumns({ cats, series, label, yFmt = (v) => String(v), yMax }) {
  const W = 640, H = 250, L = 46, R = 10, T = 14, B = 44;
  const max = yMax ?? Math.max(...series.flatMap((s) => s.values), 1e-9);
  const cw = (W - L - R) / cats.length, bw = (cw * 0.8) / series.length;
  const sy = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <figure className="sx-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
        {niceTicks(0, max, 4).map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
        {cats.map((c, i) => (
          <g key={c + i}>
            {series.map((s, k) => <rect key={k} x={L + i * cw + cw * 0.1 + k * bw} y={sy(s.values[i])} width={Math.max(1, bw - 1)} height={Math.max(0, H - B - sy(s.values[i]))} style={{ fill: color(k) }} />)}
            <text x={L + i * cw + cw / 2} y={H - B + 15} className="ax" textAnchor="middle">{c}</text>
          </g>
        ))}
      </svg>
      {series.length > 1 && <ul className="tl-legend">{series.map((s, k) => <li key={s.name}><i style={{ background: color(k) }} />{s.name}</li>)}</ul>}
    </figure>
  );
}

// Dumbbell rows: two values per row on a 0–1 scale (awareness vs usefulness).
export function Dumbbells({ rows, label, aName, bName }) {
  const W = 640, rowH = 28, T = 20, B = 30, L = 170, R = 60, H = T + rows.length * rowH + B;
  const sx = (v) => L + v * (W - L - R);
  return (
    <figure className="sx-fig">
      <div className="sx-scroll"><svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T - 6} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{`${v * 100}%`}</text></g>)}
        {rows.map((r, i) => {
          const y = T + i * rowH + rowH / 2;
          return (
            <g key={r.name + i}>
              <text x={8} y={y + 4} className="lb">{r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name}</text>
              <line x1={sx(r.a)} x2={sx(r.b)} y1={y} y2={y} className={`sx-db ${r.tone || ''}`} />
              <circle cx={sx(r.a)} cy={y} r={5.5} style={{ fill: color(0) }} />
              <circle cx={sx(r.b)} cy={y} r={5.5} style={{ fill: color(1) }} />
              <text x={W - 6} y={y + 4} className="lbs" textAnchor="end">{r.right}</text>
            </g>
          );
        })}
      </svg></div>
      <ul className="tl-legend"><li><i style={{ background: color(0) }} />{aName}</li><li><i style={{ background: color(1) }} />{bName}</li></ul>
    </figure>
  );
}
