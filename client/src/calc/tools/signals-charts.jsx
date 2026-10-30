// Inline SVG charts for the "signals" tools. Theme tokens only (--c1…--c8, --ink, --line, --ok, --warn, --bad), so
// light and dark mode follow the site. Adapted from the experimentation tools' charts, with steps, point colours,
// bands and log axes added.
import './signals.css';

export const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};
export const color = (i) => `var(--c${(i % 8) + 1})`;
const logTicks = (lo, hi) => { const out = []; for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) if (e >= lo - 1e-9 && e <= hi + 1e-9) out.push(e); return out.length >= 2 ? out : niceTicks(lo, hi, 4); };
export const pow10Label = (v) => { const x = 10 ** v; return x >= 1e4 || x < 1e-3 ? `1e${Math.round(v)}` : String(+x.toPrecision(3)); };

// Lines and points over a shared x axis.
// series: [{ name, pts: [[x, y]], dash, dots, line (default true), step, width, color, dotColor(i) , r }]
// bands: [{ pts: [[x, lo, hi]], color }] shaded areas. hlines / vlines: reference lines with labels.
// logX / logY: values are already log10; ticks are drawn at powers of ten.
export function LinePlot({ series, label, xLabel, yLabel, xFmt = (v) => String(v), yFmt = (v) => String(v), yMin, yMax, xMin, xMax, height = 260, hlines = [], vlines = [], bands = [], legend = true, logX, logY, xTicks }) {
  const W = 640, H = height, L = 58, R = 16, T = 12, B = 42;
  const all = series.flatMap((s) => s.pts).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!all.length) return null;
  const bandY = bands.flatMap((b) => b.pts.flatMap((p) => [p[1], p[2]])).filter(Number.isFinite);
  const x0 = xMin ?? Math.min(...all.map((p) => p[0])), x1 = xMax ?? Math.max(...all.map((p) => p[0]));
  let y0 = yMin ?? Math.min(...all.map((p) => p[1]), ...hlines.map((h) => h.y), ...bandY), y1 = yMax ?? Math.max(...all.map((p) => p[1]), ...hlines.map((h) => h.y), ...bandY);
  if (y1 === y0) { y1 += 1; y0 -= y0 === 0 ? 0 : 1; }
  const sx = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const yt = logY ? logTicks(y0, y1) : niceTicks(y0, y1, 5), xt = xTicks || (logX ? logTicks(x0, x1) : niceTicks(x0, x1, 6));
  const cy = (y) => Math.max(T, Math.min(H - B, sy(y)));
  return (
    <figure className="sg-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
        {bands.map((b, i) => b.pts.length > 1 && (
          <polygon key={`b${i}`} className="sg-band" style={b.color ? { fill: b.color } : undefined}
            points={[...b.pts.map((p) => `${sx(p[0])},${cy(p[2])}`), ...[...b.pts].reverse().map((p) => `${sx(p[0])},${cy(p[1])}`)].join(' ')} />
        ))}
        {yt.map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{logY ? pow10Label(v) : yFmt(v)}</text></g>)}
        {xt.map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{logX ? pow10Label(v) : xFmt(v)}</text>)}
        {hlines.map((h, i) => <g key={`h${i}`}><line x1={L} x2={W - R} y1={sy(h.y)} y2={sy(h.y)} className={h.cls || 'sg-ref'} />{h.label && <text x={W - R - 4} y={sy(h.y) - 5} className="lbs" textAnchor="end">{h.label}</text>}</g>)}
        {vlines.map((v, i) => <g key={`v${i}`}><line x1={sx(v.x)} x2={sx(v.x)} y1={T} y2={H - B} className="sg-ref" />{v.label && <text x={Math.min(sx(v.x) + 4, W - R - 60)} y={T + 12} className="lbs">{v.label}</text>}</g>)}
        {series.map((s, i) => {
          const pts = s.pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
          const c = s.color || color(i);
          let path = '';
          if (s.line !== false && pts.length > 1) {
            if (s.step) path = pts.map(([x, y], j) => (j === 0 ? `M${sx(x - 0.5)},${cy(y)} H${sx(x + 0.5)}` : `V${cy(y)} H${sx(x + 0.5)}`)).join(' ');
            else path = `M${pts.map(([x, y]) => `${sx(x)},${cy(y)}`).join(' L')}`;
          }
          return (
            <g key={s.name + i}>
              {path && <path d={path} style={{ fill: 'none', stroke: c, strokeWidth: s.width || 2.2, strokeDasharray: s.dash || 'none', opacity: s.opacity ?? 1 }} />}
              {s.dots && pts.map(([x, y], j) => <circle key={`${j}`} cx={sx(x)} cy={cy(y)} r={s.r || 3.4} style={{ fill: s.dotColor ? s.dotColor(j) : c, opacity: s.opacity ?? 1 }} />)}
            </g>
          );
        })}
        {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
        {yLabel && <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>}
      </svg>
      {legend && series.filter((s) => !s.hideLegend).length > 1 && (
        <ul className="tl-legend">{series.map((s, i) => (s.hideLegend ? null : <li key={s.name + i}><i style={{ background: s.color || color(i) }} />{s.name}</li>))}</ul>
      )}
    </figure>
  );
}

// Vertical bars with labels. bars: [{ label, value, tone, top }]. Labels are thinned when there are many bars.
export function BarChart({ bars, label, yFmt = (v) => String(v), height = 220, refY, refLabel, line, yMax }) {
  const W = 640, H = height, L = 50, R = 12, T = 14, B = 46;
  const max = yMax ?? (Math.max(...bars.map((b) => b.value), refY ?? 0) || 1);
  const bw = (W - L - R) / bars.length;
  const sy = (v) => T + (1 - v / max) * (H - T - B);
  const every = Math.max(1, Math.ceil(bars.length / 14));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(0, max, 4).map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
      {bars.map((b, i) => (
        <g key={b.label + i}>
          <rect x={L + i * bw + bw * 0.1} y={sy(b.value)} width={Math.max(0.5, bw * 0.8)} height={Math.max(0, H - B - sy(b.value))} className={`sg-bar${b.tone ? ` tone-${b.tone}` : ''}`}><title>{`${b.label}: ${b.title ?? yFmt(b.value)}`}</title></rect>
          {i % every === 0 && <text x={L + i * bw + bw / 2} y={H - B + 15} className="ax" textAnchor="middle">{b.label.length > 10 ? `${b.label.slice(0, 9)}…` : b.label}</text>}
          {b.top && <text x={L + i * bw + bw / 2} y={sy(b.value) - 4} className="lbs" textAnchor="middle">{b.top}</text>}
        </g>
      ))}
      {line && line.length > 1 && <path d={`M${line.map((v, i) => `${L + i * bw + bw / 2},${sy(v)}`).join(' L')}`} className="sg-line" />}
      {Number.isFinite(refY) && <><line x1={L} x2={W - R} y1={sy(refY)} y2={sy(refY)} className="sg-ref" /><text x={W - R - 2} y={sy(refY) - 5} className="lbs" textAnchor="end">{refLabel}</text></>}
    </svg>
  );
}

// Histogram of densities with an optional fitted curve. bins: [{ x0, x1, density }]; curve: [[x, density]].
export function Histogram({ bins, curve, label, xLabel, xFmt = (v) => String(v), height = 240 }) {
  const W = 640, H = height, L = 50, R = 14, T = 12, B = 42;
  if (!bins.length) return null;
  const a = bins[0].x0, b = bins[bins.length - 1].x1;
  const max = Math.max(...bins.map((x) => x.density), ...(curve || []).map((p) => p[1])) * 1.05 || 1;
  const sx = (x) => L + ((x - a) / (b - a || 1)) * (W - L - R), sy = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="grid" />
      {bins.map((bn, i) => <rect key={i} x={sx(bn.x0) + 0.5} y={sy(bn.density)} width={Math.max(0.5, sx(bn.x1) - sx(bn.x0) - 1)} height={H - B - sy(bn.density)} className="sg-bar sg-soft" />)}
      {curve && curve.length > 1 && <path d={`M${curve.filter((p) => p[0] >= a && p[0] <= b).map(([x, y]) => `${sx(x)},${sy(y)}`).join(' L')}`} className="sg-line" />}
      {niceTicks(a, b, 6).map((v) => <text key={v} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{xFmt(v)}</text>)}
      {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
    </svg>
  );
}

// A table with the site's table classes, scrolling inside its own box on narrow screens.
export function Table({ head, rows, num = true, label }) {
  return (
    <div className="clu-scroll sg-contain"><table className={`clu-table${num ? ' clu-num' : ''}`} aria-label={label}>
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className={r.cls || ''}>{(r.cells || r).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}
export function LoadExample({ onClick, children = 'Load example' }) {
  return <div className="tl-row sg-load"><button type="button" className="btn ghost small" onClick={onClick}>{children}</button></div>;
}
