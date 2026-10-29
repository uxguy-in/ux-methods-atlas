// Small shared inputs and layout pieces for the tools in this folder. They mirror the helpers inside
// pages/Calculators.jsx (same classes and markup) so the new tools look and behave like the existing calculators.
import { Link } from 'react-router-dom';
import './tools.css';

export const pct = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
export const num = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
export const pv = (p) => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3));
export const sig = (x, d = 3) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '—');

export function Num({ label, value, onChange, min, max, step = 1, hint, suffix }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <span className="calc-input">
        <input type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)} />
        {suffix && <em>{suffix}</em>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Choice({ label, value, onChange, options }) {
  return (
    <div className="calc-field">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
export function Area({ label, value, onChange, rows = 5, hint, placeholder, wrap }) {
  return (
    <label className="calc-field wide">
      <span>{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} wrap={wrap} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Pick({ label, value, onChange, options }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
export const n_ = (v) => (v === '' || v === null ? NaN : Number(v));
export function Result({ big, label, children, tone }) {
  return (
    <div className={`calc-result${tone ? ` ${tone}` : ''}`}>
      {big !== undefined && <div className="big">{big}</div>}
      {label && <div className="lbl">{label}</div>}
      {children}
    </div>
  );
}
export function Stats({ rows }) {
  return <dl className="calc-stats">{rows.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
export function Problem({ children }) { return <p className="calc-warn" role="alert">{children}</p>; }
export function About({ method, links = [], children }) {
  return (
    <details className="calc-about">
      <summary>How this is calculated</summary>
      <div>{children}</div>
      {method && <p><Link to={`/methods/${method}`}>Read the method in the atlas</Link></p>}
      {links.length > 0 && <p>Related in the atlas: {links.map(([id, name], i) => <span key={id}>{i > 0 && ', '}<Link to={`/methods/${id}`}>{name}</Link></span>)}</p>}
    </details>
  );
}
export const download = (name, text, type = 'text/plain') => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* downloads blocked */ }
};
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch { return false; }
  }
}
// Horizontal bars: rows of [label, value 0–1, right-hand text, optional tone].
export function Bars({ rows, label }) {
  return (
    <div className="tl-bars" role="list" aria-label={label}>
      {rows.map(([name, v, txt, tone], i) => (
        <div key={`${name}-${i}`} role="listitem" className={tone ? `tone-${tone}` : ''}>
          <span className="nm" title={name}>{name}</span>
          <span className="bar"><i style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} /></span>
          <b>{txt}</b>
        </div>
      ))}
    </div>
  );
}
