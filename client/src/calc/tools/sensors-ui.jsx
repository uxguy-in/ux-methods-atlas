// Small shared pieces for the sensors tools: a Web Worker runner, a shaded matrix and a CSV button.
import { useEffect, useRef, useState } from 'react';
import { download } from './ui.jsx';
import './sensors.css';

export function CsvButton({ name, csv, children = 'Download CSV' }) {
  return <button type="button" className="btn ghost small" onClick={() => download(name, csv, 'text/csv')}>{children}</button>;
}

// Matrix with row and column headers; cells shaded by value / max with one categorical token.
export function HeatMatrix({ rows, rowNames, colNames, label, corner = '', fmtCell = (v) => String(v), max, tone = 'var(--c1)', diag = false }) {
  const mx = max ?? Math.max(1e-12, ...rows.flat().filter(Number.isFinite).map(Math.abs));
  return (
    <div className="clu-scroll ea-contain"><table className="clu-table clu-num sn-heat" aria-label={label}>
      <thead><tr><th>{corner}</th>{colNames.map((c, j) => <th key={j} title={c}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}><th scope="row">{rowNames[i]}</th>{r.map((v, j) => {
          const isDiag = diag && i === j, a = Number.isFinite(v) && !isDiag ? Math.min(1, Math.abs(v) / mx) : 0;
          return <td key={j} className={`h${isDiag ? ' diag' : ''}`} style={a ? { background: `color-mix(in srgb, ${tone} ${Math.round(a * 45)}%, transparent)` } : undefined}>{isDiag ? '·' : Number.isFinite(v) ? fmtCell(v) : '·'}</td>;
        })}</tr>
      ))}</tbody>
    </table></div>
  );
}

// Runs one job in the sensors Web Worker (falls back to running `fallback` on the page if workers are unavailable).
// Returns { result, busy, error }. The job re-runs whenever `key` changes; stale answers are ignored.
export function useWorkerJob(job, key, fallback) {
  const [state, setState] = useState({ result: null, busy: false, error: null });
  const seq = useRef(0);
  useEffect(() => {
    if (!job) { setState({ result: null, busy: false, error: null }); return undefined; }
    const id = ++seq.current;
    let w = null;
    setState((s) => ({ ...s, busy: true, error: null }));
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./sensors.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
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
