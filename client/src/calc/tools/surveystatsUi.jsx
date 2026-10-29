// Shared pieces for the survey statistics tools: the pasted-data box, the column table with types (cluster.js rules),
// a Web Worker runner, matrices and the inline SVG charts (scree plot, importance-performance grid, residual plot,
// mosaic). Theme classes only, so light and dark mode both work.
import { useEffect, useMemo, useState } from 'react';
import { summarise } from '../cluster.js';
import { readTable } from './surveystatsData.js';
import { Area, num } from './ui.jsx';
import './surveystats.css';

// ── Pasted data and column types ──
export function useColumns(text) {
  const base = useMemo(() => readTable(text), [text]);
  const [over, setOver] = useState({});
  const cols = useMemo(() => base.cols.map((c) => (over[c.name] && over[c.name] !== c.type ? { ...c, type: over[c.name] } : c)), [base, over]);
  return { table: base.table, cols, setType: (nm, t) => setOver((o) => ({ ...o, [nm]: t })) };
}
export function DataBox({ text, setText, examples = [], label = 'Paste survey data with a header row', hint, rows = 8 }) {
  return (
    <div className="calc-inputs">
      <Area label={label} value={text} onChange={setText} rows={rows} wrap="off"
        hint={hint || 'Copy the cells straight from Excel or Google Sheets (tab-separated), or paste CSV. One respondent per row, one question per column. Nothing is uploaded: everything runs in your browser.'} />
      <div className="svs-actions">
        {examples.map(([lbl, fn]) => <button key={lbl} type="button" className="btn ghost small" onClick={() => setText(fn())}>{lbl}</button>)}
        <button type="button" className="btn ghost small" onClick={() => setText('')}>Clear</button>
      </div>
    </div>
  );
}
const TYPES = [['continuous', 'Numbers'], ['ordinal', 'Ordered scale'], ['nominal', 'Categories'], ['ignore', 'Ignore']];
// Column table: type per column (guessed, can be changed), missing values, summary; optional tick boxes.
export function ColumnTable({ table, cols, setType, pick = null }) {
  return (
    <div className="clu-scroll">
      <table className="clu-table svs-pick">
        <thead><tr>{pick && <th>{pick.label}</th>}<th>Column</th><th>Type</th><th>Missing</th><th>Summary</th></tr></thead>
        <tbody>
          {cols.map((c) => {
            const sm = c.type === 'ignore' ? { text: c.why ? `Guessed: ${c.why}` : '', bad: 0 } : summarise(table, c, c.type, c.levels);
            const can = pick ? pick.eligible(c) : false;
            return (
              <tr key={c.name} className={c.type === 'ignore' || (pick && !can) ? 'off' : ''}>
                {pick && <td><input type="checkbox" aria-label={`Use ${c.name}`} disabled={!can} checked={can && pick.selected.includes(c.name)} onChange={() => pick.toggle(c.name)} /></td>}
                <td><b>{c.name}</b></td>
                <td>
                  <select className="select" value={c.type} aria-label={`Type of ${c.name}`} onChange={(e) => setType(c.name, e.target.value)}>
                    {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td>{c.missing}</td>
                <td>{sm.text}{sm.bad > 0 && <> <span className="qtag opp">{sm.bad} unreadable, treated as missing</span></>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Web Worker jobs ──
let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./surveystats.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        const p = pending.get(data.id); if (!p) return;
        if (data.progress !== undefined) { p.onProgress?.(data.progress); return; }
        pending.delete(data.id);
        if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
      };
      worker.onerror = (e) => { e.preventDefault?.(); const ps = [...pending.values()]; pending.clear(); worker = null; ps.forEach((p) => p.fallback()); };
    } catch { worker = null; }
  }
  return worker;
}
// Runs `type` in the worker; if workers are unavailable or fail, runs `fallback()` on the main thread instead.
export function runJob(type, args, fallback, onProgress) {
  return new Promise((resolve, reject) => {
    const fb = () => setTimeout(() => { try { resolve(fallback()); } catch (e) { reject(e); } }, 0);
    const w = getWorker();
    if (!w) { fb(); return; }
    const id = ++seq; pending.set(id, { resolve, reject, onProgress, fallback: fb });
    w.postMessage({ id, type, args });
  });
}
// Starts a job whenever `key` changes and returns its latest result (stale results are ignored).
export function useJob(key, start) {
  const [st, setSt] = useState({ key: null, result: null, error: null, progress: 0 });
  useEffect(() => {
    if (key == null) return undefined;
    let live = true;
    start((f) => { if (live) setSt((s) => ({ ...s, progress: f })); })
      .then((r) => { if (live) setSt({ key, result: r, error: null, progress: 1 }); })
      .catch((e) => { if (live) setSt({ key, result: null, error: e.message || String(e), progress: 1 }); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st.key === key ? { ...st, busy: false } : { key, result: null, error: null, busy: key != null, progress: st.progress };
}

// ── Labels ──
export const short = (s, n = 16) => { const t = String(s); const head = t.split(':')[0].trim(); const b = head.length <= n && head.length < t.length ? head : t; return b.length > n ? `${b.slice(0, n - 1)}…` : b; };

// ── Matrix table ──
export function Matrix({ names, M, fmt = (v) => num(v), cls = () => '', corner = '', lower = false, label }) {
  return (
    <div className="clu-scroll">
      <table className="clu-table clu-num svs-table" aria-label={label}>
        <thead><tr><th>{corner}</th>{names.map((n) => <th key={n} title={n}>{short(n, 14)}</th>)}</tr></thead>
        <tbody>
          {M.map((row, i) => (
            <tr key={names[i]}><td title={names[i]}>{short(names[i], 22)}</td>
              {row.map((v, j) => <td key={j} className={cls(i, j, v)}>{lower && j > i ? '' : fmt(v, i, j)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Charts ──
const nice = (lo, hi, n = 5) => { const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag; const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; };
// Scree plot: observed eigenvalues with parallel-analysis 95th percentile and mean, the Kaiser line and the chosen k.
export function ScreePlot({ observed, sim95 = null, simMean = null, k = null, label = 'Scree plot' }) {
  const W = 640, Hh = 300, l = 46, r = 16, t = 14, b = 40, p = observed.length;
  const ymax = Math.max(...observed, ...(sim95 || []), 1.2) * 1.08, ymin = Math.min(0, ...observed);
  const x = (i) => l + (p > 1 ? (i / (p - 1)) * (W - l - r) : (W - l - r) / 2), y = (v) => t + (1 - (v - ymin) / (ymax - ymin)) * (Hh - t - b);
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <figure style={{ margin: 0 }}>
      <svg className="svs-plot" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={label}>
        {nice(ymin, ymax).map((v) => <g key={v}><line className="grid" x1={l} x2={W - r} y1={y(v)} y2={y(v)} /><text className="ax" x={l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        <line className="ref" x1={l} x2={W - r} y1={y(1)} y2={y(1)} />
        <text className="ax" x={W - r} y={y(1) - 5} textAnchor="end">eigenvalue 1 (Kaiser)</text>
        {k > 0 && <line className="kline" x1={x(k - 1)} x2={x(k - 1)} y1={t} y2={Hh - b} />}
        {simMean && <path className="simm" d={path(simMean)} />}
        {sim95 && <path className="sim" d={path(sim95)} />}
        <path className="obs" d={path(observed)} />
        {observed.map((v, i) => <circle key={i} className="obs-pt" cx={x(i)} cy={y(v)} r={4} />)}
        {observed.map((_, i) => (p <= 20 || i % 2 === 0) && <text key={i} className="ax" x={x(i)} y={Hh - b + 16} textAnchor="middle">{i + 1}</text>)}
        <text className="ax" x={(l + W - r) / 2} y={Hh - 4} textAnchor="middle">Factor or component number</text>
      </svg>
      <ul className="svs-legend">
        <li><i />Your data</li>
        {sim95 && <li><i className="sim" />Random data, 95th percentile</li>}
        {simMean && <li><i className="simm" />Random data, mean</li>}
      </ul>
    </figure>
  );
}
// Importance-performance grid with labelled quadrants.
export function QuadrantPlot({ points, mx, my, xLabel, yLabel, qLabels, yFmt = (v) => `${Math.round(v * 100)}%` }) {
  const W = 640, Hh = 400, l = 56, r = 20, t = 16, b = 46;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const pad = (lo, hi) => { const s = (hi - lo) || 1; return [lo - s * 0.12, hi + s * 0.12]; };
  const [x0, x1] = pad(Math.min(...xs, mx), Math.max(...xs, mx)), [y0, y1] = pad(Math.min(0, ...ys), Math.max(...ys, my));
  const X = (v) => l + (v - x0) / (x1 - x0) * (W - l - r), Y = (v) => t + (1 - (v - y0) / (y1 - y0)) * (Hh - t - b);
  return (
    <svg className="svs-plot" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      <rect className="q fix" x={l} y={t} width={X(mx) - l} height={Y(my) - t} />
      <rect className="q keep" x={X(mx)} y={t} width={W - r - X(mx)} height={Y(my) - t} />
      <rect className="q low" x={l} y={Y(my)} width={X(mx) - l} height={Hh - b - Y(my)} />
      <rect className="q overkill" x={X(mx)} y={Y(my)} width={W - r - X(mx)} height={Hh - b - Y(my)} />
      <text className="ql" x={l + 8} y={t + 16}>{qLabels.fix}</text>
      <text className="ql" x={W - r - 8} y={t + 16} textAnchor="end">{qLabels.keep}</text>
      <text className="ql" x={l + 8} y={Hh - b - 8}>{qLabels.low}</text>
      <text className="ql" x={W - r - 8} y={Hh - b - 8} textAnchor="end">{qLabels.overkill}</text>
      {nice(x0, x1).map((v) => <text key={`x${v}`} className="ax" x={X(v)} y={Hh - b + 16} textAnchor="middle">{v}</text>)}
      {nice(y0, y1).map((v) => <text key={`y${v}`} className="ax" x={l - 6} y={Y(v) + 4} textAnchor="end">{yFmt(v)}</text>)}
      <text className="ax" x={(l + W - r) / 2} y={Hh - 6} textAnchor="middle">{xLabel}</text>
      <text className="ax" transform={`translate(13 ${(t + Hh - b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
      {points.map((p) => (
        <g key={p.name}>
          <circle className="pt" cx={X(p.x)} cy={Y(p.y)} r={6} />
          <text className="lbb" x={X(p.x) + (X(p.x) > W - 170 ? -10 : 10)} y={Y(p.y) - 8} textAnchor={X(p.x) > W - 170 ? 'end' : 'start'}>{short(p.name, 20)}</text>
        </g>
      ))}
    </svg>
  );
}
// Residuals against fitted values.
export function ResidualPlot({ fitted, resid }) {
  const W = 640, Hh = 280, l = 50, r = 16, t = 14, b = 40;
  const [x0, x1] = [Math.min(...fitted), Math.max(...fitted)], m = Math.max(...resid.map(Math.abs)) * 1.1 || 1;
  const X = (v) => l + (v - x0) / ((x1 - x0) || 1) * (W - l - r), Y = (v) => t + (1 - (v + m) / (2 * m)) * (Hh - t - b);
  return (
    <svg className="svs-plot" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Residuals against fitted values">
      {nice(-m, m).map((v) => <g key={v}><line className="grid" x1={l} x2={W - r} y1={Y(v)} y2={Y(v)} /><text className="ax" x={l - 6} y={Y(v) + 4} textAnchor="end">{v}</text></g>)}
      <line className="axis" x1={l} x2={W - r} y1={Y(0)} y2={Y(0)} />
      {fitted.map((f, i) => <circle key={i} className="dot" cx={X(f)} cy={Y(resid[i])} r={3} />)}
      {nice(x0, x1).map((v) => <text key={v} className="ax" x={X(v)} y={Hh - b + 16} textAnchor="middle">{v}</text>)}
      <text className="ax" x={(l + W - r) / 2} y={Hh - 4} textAnchor="middle">Fitted value</text>
    </svg>
  );
}
// Mosaic: column widths by row share, heights by column share within the row; cells with |z| > 1.96 outlined.
export function Mosaic({ rows, cols, N, adj }) {
  const W = 640, Hh = 300, l = 8, t = 8, legendH = 0;
  const rs = N.map((r) => r.reduce((a, b) => a + b, 0)), n = rs.reduce((a, b) => a + b, 0) || 1;
  let xAt = l; const w = W - 2 * l, h = Hh - 2 * t - legendH;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="svs-plot" viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label="Mosaic of the table">
        {N.map((row, i) => {
          const rw = rs[i] / n * w, x = xAt; xAt += rw; let yAt = t;
          return (
            <g key={rows[i]}>
              {row.map((v, j) => {
                const ch = rs[i] ? v / rs[i] * h : 0, y = yAt; yAt += ch;
                const hi = Math.abs(adj[i][j]) > 1.96;
                return (
                  <g key={j}>
                    <rect className={`mos${hi ? ' hi' : ''}`} x={x} y={y} width={Math.max(0, rw)} height={Math.max(0, ch)} style={{ fill: `var(--c${(j % 8) + 1})`, fillOpacity: 0.75 }}><title>{`${rows[i]} × ${cols[j]}: ${v} (z = ${num(adj[i][j])})`}</title></rect>
                    {rw > 54 && ch > 18 && <text className="lbb" x={x + 6} y={y + 15}>{adj[i][j] > 1.96 ? '▲ ' : adj[i][j] < -1.96 ? '▼ ' : ''}{short(rows[i], Math.floor(rw / 9))}</text>}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <ul className="svs-legend">{cols.map((c, j) => <li key={c}><i className="sw" style={{ background: `var(--c${(j % 8) + 1})` }} />{c}</li>)}<li>Outlined, ▲ ▼: more or fewer than expected (|z| &gt; 1.96)</li></ul>
    </figure>
  );
}
