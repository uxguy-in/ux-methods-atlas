// Small shared pieces for the causal tools: a Web Worker runner and inline SVG charts (point-range plot, half-normal
// plot, tornado, histogram). Theme tokens only, so light and dark mode follow the site.
import { useEffect, useRef, useState } from 'react';
import './causal.css';

const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};

// Runs one job in the causal Web Worker (or on the page if workers are unavailable). Returns { result, busy, error };
// the job re-runs whenever `key` changes and stale answers are ignored.
export function useWorkerJob(job, key, fallback) {
  const [state, setState] = useState({ result: null, busy: false, error: null });
  const seq = useRef(0);
  useEffect(() => {
    if (!job) { setState({ result: null, busy: false, error: null }); return undefined; }
    const id = ++seq.current;
    let w = null;
    setState((s) => ({ ...s, busy: true, error: null }));
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./causal.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
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

// Points with vertical interval bars over a numeric x axis (event-study coefficients). pts: [{ x, y, lo, hi, hollow }].
export function PointRange({ pts, label, xLabel, yLabel, vline, vlineLabel, xFmt = (v) => String(v), yFmt = (v) => String(+v.toFixed(2)) }) {
  const W = 620, H = 260, L = 54, R = 14, T = 14, B = 40;
  const ys = pts.flatMap((p) => [p.lo, p.hi, p.y]).filter(Number.isFinite);
  let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); const pad = (y1 - y0) * 0.08 || 1; y0 -= pad; y1 += pad;
  const xs = pts.map((p) => p.x), x0 = Math.min(...xs) - 0.5, x1 = Math.max(...xs) + 0.5;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(y0, y1, 5).map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
      <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} className="ca-zero" />
      {Number.isFinite(vline) && <><line x1={sx(vline)} x2={sx(vline)} y1={T} y2={H - B} className="ea-ref" />{vlineLabel && <text x={sx(vline) + 4} y={T + 10} className="lbs">{vlineLabel}</text>}</>}
      {pts.map((p) => (
        <g key={p.x} className={p.hollow ? 'ca-pt hollow' : p.post ? 'ca-pt post' : 'ca-pt'}>
          {Number.isFinite(p.lo) && p.hi > p.lo && <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.lo)} y2={sy(p.hi)} />}
          <circle cx={sx(p.x)} cy={sy(p.y)} r={4.5} />
          <text x={sx(p.x)} y={H - B + 16} className="ax" textAnchor="middle">{xFmt(p.x)}</text>
        </g>
      ))}
      {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
      {yLabel && <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>}
    </svg>
  );
}

// Half-normal plot of |effects|: points labelled when active; reference lines at Lenth's ME and SME.
export function HalfNormalPlot({ pts, me, sme, label }) {
  const W = 620, H = 300, L = 54, R = 24, T = 14, B = 40;
  const xMax = Math.max(...pts.map((p) => p.abs), sme || 0) * 1.08 || 1, yMax = Math.max(...pts.map((p) => p.q)) * 1.08;
  const sx = (x) => L + (x / xMax) * (W - L - R), sy = (y) => T + (1 - y / yMax) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(0, xMax, 6).map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{+v.toPrecision(3)}</text></g>)}
      {niceTicks(0, yMax, 4).map((v) => <text key={`y${v}`} x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{v.toFixed(1)}</text>)}
      {Number.isFinite(me) && <><line x1={sx(me)} x2={sx(me)} y1={T} y2={H - B} className="ea-ref" /><text x={sx(me) + 4} y={T + 10} className="lbs">ME</text></>}
      {Number.isFinite(sme) && sme < xMax && <><line x1={sx(sme)} x2={sx(sme)} y1={T} y2={H - B} className="ea-ref" /><text x={sx(sme) + 4} y={T + 24} className="lbs">SME</text></>}
      {pts.map((p, i) => (
        <g key={i} className={p.active ? 'ca-hn on' : 'ca-hn'}>
          <circle cx={sx(p.abs)} cy={sy(p.q)} r={4.2} />
          {p.active && <text x={sx(p.abs) - 7} y={sy(p.q) + 4} className="lb" textAnchor="end">{p.name}</text>}
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">|Effect|</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Half-normal quantile</text>
    </svg>
  );
}

// Tornado: one bar per input from the output at its low to its high value, around the base (all inputs at their median).
export function Tornado({ rows, base, fmt, label, lowLabel = 'Input at its 5th percentile', highLabel = 'Input at its 95th percentile', log = true }) {
  const rowH = 30, W = 680, L = 230, R = 70, T = 24, B = 34, H = T + rows.length * rowH + B;
  const tr = (v) => (log ? Math.log10(Math.max(v, 1e-300)) : v);
  const vals = rows.flatMap((r) => [r.lo, r.hi, base]).map(tr);
  let a = Math.min(...vals), b = Math.max(...vals); const pad = (b - a) * 0.04 || 0.5; a -= pad; b += pad;
  const sx = (v) => L + ((tr(v) - a) / (b - a)) * (W - L - R);
  const ticks = log ? niceTicks(a, b, 5).map((t) => 10 ** t) : niceTicks(a, b, 5);
  return (
    <div className="tl-scroll ea-contain">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="tl-plot ca-tornado" role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T - 6} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmt(v)}</text></g>)}
        {rows.map((r, i) => {
          const y = T + i * rowH;
          const x1 = sx(Math.min(r.lo, base)), x2 = sx(Math.max(r.lo, base)), x3 = sx(Math.min(r.hi, base)), x4 = sx(Math.max(r.hi, base));
          return (
            <g key={r.name + i}>
              <text x={8} y={y + rowH / 2 + 4} className="lb">{r.name.length > 32 ? `${r.name.slice(0, 31)}…` : r.name}</text>
              <rect x={x1} y={y + 5} width={Math.max(1, x2 - x1)} height={rowH - 10} className="lo" />
              <rect x={x3} y={y + 5} width={Math.max(1, x4 - x3)} height={rowH - 10} className="hi" />
              {Number.isFinite(r.share) && <text x={W - 6} y={y + rowH / 2 + 4} className="lbs" textAnchor="end">{`${(r.share * 100).toFixed(0)}%`}</text>}
            </g>
          );
        })}
        <line x1={sx(base)} x2={sx(base)} y1={T - 8} y2={H - B} className="ca-zero" />
        <text x={W - 6} y={14} className="ax" textAnchor="end">Share of uncertainty</text>
      </svg>
      <ul className="tl-legend ca-legend"><li><i className="ca-sw lo" />{lowLabel}</li><li><i className="ca-sw hi" />{highLabel}</li></ul>
    </div>
  );
}

// Histogram on a log axis: bins [[x (bin centre), share]]; marks: [{ x, label }].
export function LogHistogram({ bins, marks = [], fmt, label, xLabel }) {
  const W = 620, H = 220, L = 14, R = 14, T = 22, B = 40;
  if (!bins.length) return null;
  const lx = bins.map(([x]) => Math.log10(x)), step = bins.length > 1 ? lx[1] - lx[0] : 1;
  const a = lx[0] - step / 2, b = lx[lx.length - 1] + step / 2, ymax = Math.max(...bins.map((x) => x[1])) || 1;
  const sx = (v) => L + ((Math.log10(v) - a) / (b - a)) * (W - L - R), bw = ((W - L - R) * step) / (b - a);
  const sy = (s) => T + (1 - s / ymax) * (H - T - B);
  const ticks = niceTicks(a, b, 5).map((t) => 10 ** t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {bins.map(([x, s]) => <rect key={x} x={sx(x) - bw / 2 + 0.5} y={sy(s)} width={Math.max(0.5, bw - 1)} height={H - B - sy(s)} className="ca-hist" />)}
      {ticks.map((v) => <text key={v} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmt(v)}</text>)}
      {marks.map((m, i) => <g key={i}><line x1={sx(m.x)} x2={sx(m.x)} y1={T - 4} y2={H - B} className="ea-ref" /><text x={sx(m.x)} y={T - 8 + (i % 2) * 0} className="lbs" textAnchor="middle">{m.label}</text></g>)}
      {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
    </svg>
  );
}
