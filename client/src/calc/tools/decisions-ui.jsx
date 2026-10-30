// Small shared pieces for the decision and risk tools: a count matrix, a Web Worker runner and a CSV button.
import { useEffect, useRef, useState } from 'react';
import { download } from './ui.jsx';
import './decisions.css';

// Matrix of counts with row and column headers; cells equal to `target` are plain, others are flagged.
export function CountMatrix({ rows, rowNames, colNames, label, corner = '', diag = false, target }) {
  return (
    <div className="clu-scroll ea-contain"><table className="clu-table clu-num dc-heat" aria-label={label}>
      <thead><tr><th>{corner}</th>{colNames.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}><th scope="row">{rowNames[i]}</th>{r.map((v, j) => {
          const isDiag = diag && i === j;
          return <td key={j} className={`h${isDiag ? ' diag' : ''}${!isDiag && target !== undefined && v !== target ? ' off' : ''}`}>{isDiag ? '·' : v}</td>;
        })}</tr>
      ))}</tbody>
    </table></div>
  );
}

export function CsvButton({ name, csv, children = 'Download CSV' }) {
  return <button type="button" className="btn ghost small" onClick={() => download(name, csv, 'text/csv')}>{children}</button>;
}

// Runs one job in the decisions Web Worker (falls back to running `fallback` on the page if workers are unavailable).
// Returns { result, busy, error }. The job re-runs whenever `key` changes; stale answers are ignored.
export function useWorkerJob(job, key, fallback) {
  const [state, setState] = useState({ result: null, busy: false, error: null });
  const seq = useRef(0);
  useEffect(() => {
    if (!job) { setState({ result: null, busy: false, error: null }); return undefined; }
    const id = ++seq.current;
    let w = null;
    setState((s) => ({ ...s, busy: true, error: null }));
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./decisions.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
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
