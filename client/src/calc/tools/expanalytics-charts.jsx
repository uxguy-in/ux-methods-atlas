// Inline SVG charts shared by the experimentation and analytics tools. Theme tokens only (--c1…--c8, --ink, --line).
import './expanalytics.css';

const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};
export const color = (i) => `var(--c${(i % 8) + 1})`;

// Lines (and optional points) over a shared x axis. series: [{ name, pts: [[x, y]], dash, dots, width, color }].
export function LinePlot({ series, label, xLabel, yLabel, xFmt = (v) => String(v), yFmt = (v) => String(v), yMin, yMax, xMin, xMax, height = 260, hlines = [], vlines = [], legend = true }) {
  const W = 620, H = height, L = 54, R = 14, T = 12, B = 40;
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!all.length) return null;
  const x0 = xMin ?? Math.min(...all.map((p) => p[0])), x1 = xMax ?? Math.max(...all.map((p) => p[0]));
  let y0 = yMin ?? Math.min(...all.map((p) => p[1]), ...hlines.map((h) => h.y)), y1 = yMax ?? Math.max(...all.map((p) => p[1]), ...hlines.map((h) => h.y));
  if (y1 === y0) { y1 += 1; y0 -= y0 === 0 ? 0 : 1; }
  const sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const yt = niceTicks(y0, y1, 5), xt = niceTicks(x0, x1, 6);
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
        {yt.map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
        {xt.map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{xFmt(v)}</text>)}
        {hlines.map((h, i) => <g key={`h${i}`}><line x1={L} x2={W - R} y1={sy(h.y)} y2={sy(h.y)} className="ea-ref" /><text x={W - R - 4} y={sy(h.y) - 5} className="lbs" textAnchor="end">{h.label}</text></g>)}
        {vlines.map((v, i) => <g key={`v${i}`}><line x1={sx(v.x)} x2={sx(v.x)} y1={T} y2={H - B} className="ea-ref" /><text x={sx(v.x) + 4} y={T + 12} className="lbs">{v.label}</text></g>)}
        {series.map((s, i) => {
          const pts = s.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
          const c = s.color || color(i);
          return (
            <g key={s.name + i}>
              {pts.length > 1 && <polyline points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} style={{ fill: 'none', stroke: c, strokeWidth: s.width || 2.2, strokeDasharray: s.dash || 'none', opacity: s.opacity ?? 1 }} />}
              {s.dots && pts.map(([x, y]) => <circle key={`${x}`} cx={sx(x)} cy={sy(y)} r={3.4} style={{ fill: c, opacity: s.opacity ?? 1 }} />)}
            </g>
          );
        })}
        {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
        {yLabel && <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>}
      </svg>
      {legend && series.length > 1 && (
        <ul className="tl-legend">{series.filter((s) => !s.hideLegend).map((s, i) => <li key={s.name + i}><i style={{ background: s.color || color(series.indexOf(s)) }} />{s.name}</li>)}</ul>
      )}
    </figure>
  );
}

// Point estimates with intervals, one row per item (means with CIs, forest plots). rows: [{ name, est, lo, hi, tag,
// size (0–1 marker scale), kind: 'diamond' | 'pred' | 'hollow', note }]. refX: a vertical reference line.
export function IntervalPlot({ rows, label, xLabel, refX, refLabel, fmtX = (v) => String(+v.toFixed(3)), right, rightHead, leftHead, xLo, xHi }) {
  const W = 680, rowH = 26, T = 26, B = 40, L = 190, R = right ? 150 : 24;
  const H = T + rows.length * rowH + B;
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.est]).filter(Number.isFinite);
  if (!vals.length) return null;
  let a = xLo ?? Math.min(...vals, refX ?? Infinity), b = xHi ?? Math.max(...vals, refX ?? -Infinity);
  const pad = (b - a) * 0.05 || 1; a -= pad; b += pad;
  const sx = (x) => L + ((x - a) / (b - a)) * (W - L - R);
  const ticks = niceTicks(a, b, 6);
  return (
    <div className="tl-scroll ea-scroll ea-contain">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="tl-plot ea-interval" role="img" aria-label={label}>
        {leftHead && <text x={8} y={16} className="ax">{leftHead}</text>}
        {rightHead && <text x={W - 8} y={16} className="ax" textAnchor="end">{rightHead}</text>}
        {ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T - 4} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmtX(v)}</text></g>)}
        {Number.isFinite(refX) && <><line x1={sx(refX)} x2={sx(refX)} y1={T - 8} y2={H - B} className="ea-ref" />{refLabel && <text x={sx(refX) + 4} y={T - 10} className="lbs">{refLabel}</text>}</>}
        {rows.map((r, i) => {
          const y = T + i * rowH + rowH / 2;
          const c = r.color || 'var(--c1)';
          const lo = Math.max(a, r.lo), hi = Math.min(b, r.hi);
          return (
            <g key={`${r.name}-${i}`} className={r.kind === 'hollow' ? 'ea-hollow' : ''}>
              <text x={8} y={y + 4} className={r.kind === 'diamond' ? 'lb ea-b' : 'lb'}>{r.name.length > 26 ? `${r.name.slice(0, 25)}…` : r.name}</text>
              {r.kind === 'diamond' ? (
                <polygon points={`${sx(r.lo)},${y} ${sx(r.est)},${y - 8} ${sx(r.hi)},${y} ${sx(r.est)},${y + 8}`} style={{ fill: c }} />
              ) : r.kind === 'pred' ? (
                <line x1={sx(lo)} x2={sx(hi)} y1={y} y2={y} style={{ stroke: c, strokeWidth: 4, strokeDasharray: '6 3' }} />
              ) : (
                <>
                  {Number.isFinite(r.lo) && <line x1={sx(lo)} x2={sx(hi)} y1={y} y2={y} style={{ stroke: c, strokeWidth: 1.6 }} />}
                  <rect x={sx(r.est) - (3 + 6 * (r.size ?? 0.5))} y={y - (3 + 6 * (r.size ?? 0.5))} width={2 * (3 + 6 * (r.size ?? 0.5))} height={2 * (3 + 6 * (r.size ?? 0.5))} style={r.kind === 'hollow' ? { fill: 'var(--bg)', stroke: c, strokeWidth: 1.5 } : { fill: c }} />
                </>
              )}
              {r.tag && <text x={Math.min(sx(hi) + 8, W - R - 4)} y={y + 4} className="lb ea-b">{r.tag}</text>}
              {right && <text x={W - 8} y={y + 4} className="lbs" textAnchor="end">{right(r)}</text>}
            </g>
          );
        })}
        {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
      </svg>
    </div>
  );
}

// Vertical bars with labels. bars: [{ label, value, tone }].
export function BarChart({ bars, label, yFmt = (v) => String(v), height = 220, refY, refLabel }) {
  const W = 620, H = height, L = 48, R = 10, T = 14, B = 44;
  const max = Math.max(...bars.map((b) => b.value), refY ?? 0) || 1;
  const bw = (W - L - R) / bars.length;
  const sy = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(0, max, 4).map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
      {bars.map((b, i) => (
        <g key={b.label + i}>
          <rect x={L + i * bw + bw * 0.12} y={sy(b.value)} width={bw * 0.76} height={Math.max(0, H - B - sy(b.value))} className={`ea-bar ${b.tone ? `tone-${b.tone}` : ''}`} />
          <text x={L + i * bw + bw / 2} y={H - B + 15} className="ax" textAnchor="middle">{b.label}</text>
          {b.top && <text x={L + i * bw + bw / 2} y={sy(b.value) - 4} className="lbs" textAnchor="middle">{b.top}</text>}
        </g>
      ))}
      {Number.isFinite(refY) && <><line x1={L} x2={W - R} y1={sy(refY)} y2={sy(refY)} className="ea-ref" /><text x={W - R - 2} y={sy(refY) - 5} className="lbs" textAnchor="end">{refLabel}</text></>}
    </svg>
  );
}

// A small table helper with the site's table classes.
export function Table({ head, rows, num = true, label }) {
  return (
    <div className="clu-scroll ea-contain"><table className={`clu-table${num ? ' clu-num' : ''}`} aria-label={label}>
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className={r.cls || ''}>{(r.cells || r).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
export function LoadExample({ onClick, children = 'Load example' }) {
  return <div className="tl-row"><button type="button" className="btn ghost small" onClick={onClick}>{children}</button></div>;
}
