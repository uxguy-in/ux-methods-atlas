// Inline SVG charts and small layout pieces for the "scorers" tools. Theme tokens only (--c1…--c8, --ink, --line,
// --ok, --warn, --bad), so light and dark mode follow the site.
import './scorers.css';

export const niceTicks = (lo, hi, n = 5) => {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = []; for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * step; v += step) out.push(+v.toPrecision(12));
  return out;
};
export const color = (i) => `var(--c${(i % 8) + 1})`;
const fmt = (v) => String(+(+v).toFixed(2));

export function Table({ head, rows, label, num = true }) {
  return (
    <div className="clu-scroll sc-contain"><table className={`clu-table${num ? ' clu-num' : ''}`} aria-label={label}>
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className={r.cls || ''}>{(r.cells || r).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

// One row per estimate with its interval on a shared horizontal scale. rows: [{ name, est, lo, hi, color, bold, mark }].
// bands: shaded ranges [{ from, to, label, tone }]; refs: vertical lines [{ x, label }].
export function IntervalRows({ rows, label, min, max, bands = [], refs = [], xLabel, fmtX = fmt, right }) {
  const W = 640, rowH = 28, T = bands.length ? 30 : 16, B = 40, L = 168, R = right ? 120 : 20;
  const H = T + rows.length * rowH + B;
  const sx = (x) => L + ((Math.max(min, Math.min(max, x)) - min) / (max - min)) * (W - L - R);
  return (
    <div className="tl-scroll sc-contain">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="tl-plot sc-wide" role="img" aria-label={label}>
        {bands.map((b, i) => (
          <g key={`b${i}`}>
            <rect x={sx(b.from)} y={T - 4} width={Math.max(0, sx(b.to) - sx(b.from))} height={H - B - T + 4} className={`sc-band sc-band-${b.tone || i}`} />
            <text x={(sx(b.from) + sx(b.to)) / 2} y={T - 10} className="lbs" textAnchor="middle">{b.label}</text>
          </g>
        ))}
        {niceTicks(min, max, 6).map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T - 4} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmtX(v)}</text></g>)}
        {refs.map((r, i) => <g key={`r${i}`}><line x1={sx(r.x)} x2={sx(r.x)} y1={T - 4} y2={H - B} className="sc-ref" />{r.label && <text x={sx(r.x) + 4} y={H - B - 4} className="lbs">{r.label}</text>}</g>)}
        {rows.map((r, i) => {
          const y = T + i * rowH + rowH / 2, c = r.color || 'var(--c1)';
          return (
            <g key={`${r.name}-${i}`}>
              <text x={8} y={y + 4} className={r.bold ? 'lb sc-b' : 'lb'}>{r.name.length > 24 ? `${r.name.slice(0, 23)}…` : r.name}</text>
              {Number.isFinite(r.lo) && Number.isFinite(r.hi) && <line x1={sx(r.lo)} x2={sx(r.hi)} y1={y} y2={y} style={{ stroke: c, strokeWidth: 2 }} />}
              {Number.isFinite(r.mark) && <line x1={sx(r.mark)} x2={sx(r.mark)} y1={y - 8} y2={y + 8} className="sc-mark" />}
              {Number.isFinite(r.est) && <circle cx={sx(r.est)} cy={y} r={r.bold ? 6 : 4.5} style={{ fill: c }} />}
              {right && <text x={W - 8} y={y + 4} className="lbs" textAnchor="end">{right(r)}</text>}
            </g>
          );
        })}
        {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
      </svg>
    </div>
  );
}

// Scatter with horizontal reference lines and optional shaded CI bands: points [[x, y]], hlines [{ y, label, kind, lo, hi }].
export function Scatter({ points, hlines = [], label, xLabel, yLabel, fit }) {
  const W = 620, H = 320, L = 56, R = 120, T = 14, B = 44;
  const xs = points.map((p) => p[0]), ys = [...points.map((p) => p[1]), ...hlines.flatMap((h) => [h.y, h.lo, h.hi]).filter(Number.isFinite)];
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x1 - x0) * 0.05 || 1, py = (y1 - y0) * 0.08 || 1; x0 -= px; x1 += px; y0 -= py; y1 += py;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(y0, y1, 5).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{fmt(v)}</text></g>)}
      {niceTicks(x0, x1, 6).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{fmt(v)}</text>)}
      {hlines.filter((h) => Number.isFinite(h.lo)).map((h, i) => <rect key={`band${i}`} x={L} width={W - L - R} y={sy(h.hi)} height={Math.max(0, sy(h.lo) - sy(h.hi))} className="sc-ciband" />)}
      {hlines.map((h, i) => (
        <g key={`h${i}`}>
          <line x1={L} x2={W - R} y1={sy(h.y)} y2={sy(h.y)} className={h.kind === 'zero' ? 'sc-zero' : h.kind === 'bias' ? 'sc-bias' : 'sc-ref'} />
          {h.label && <text x={W - R + 6} y={sy(h.y) + 4} className="lbs">{h.label}</text>}
        </g>
      ))}
      {fit && <line x1={sx(x0)} x2={sx(x1)} y1={sy(fit.a + fit.b * x0)} y2={sy(fit.a + fit.b * x1)} className="sc-fit" />}
      {points.map(([x, y], i) => <circle key={i} cx={sx(x)} cy={sy(y)} r={4} className="sc-pt" />)}
      {xLabel && <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{xLabel}</text>}
      {yLabel && <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>}
    </svg>
  );
}

// Vertical bars with a reference line. bars: [{ label, value, tone }].
export function Columns({ bars, label, min = 0, max, refY, refLabel, yFmt = fmt }) {
  const W = 620, H = 240, L = 48, R = 10, T = 14, B = 52;
  const hi = max ?? Math.max(...bars.map((b) => b.value), refY ?? 0, 1e-9);
  const bw = (W - L - R) / Math.max(1, bars.length);
  const sy = (v) => T + (1 - (v - min) / (hi - min)) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      {niceTicks(min, hi, 4).map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{yFmt(v)}</text></g>)}
      {bars.map((b, i) => (
        <g key={b.label + i}>
          <rect x={L + i * bw + bw * 0.14} y={sy(Math.max(min, b.value))} width={bw * 0.72} height={Math.max(0, sy(min) - sy(Math.max(min, b.value)))} className={`sc-bar${b.tone ? ` tone-${b.tone}` : ''}`} />
          <text x={L + i * bw + bw / 2} y={H - B + 15} className="ax" textAnchor="middle">{b.label.length > 10 ? `${b.label.slice(0, 9)}…` : b.label}</text>
          {b.top && <text x={L + i * bw + bw / 2} y={sy(Math.max(min, b.value)) - 4} className="lbs" textAnchor="middle">{b.top}</text>}
        </g>
      ))}
      {Number.isFinite(refY) && <><line x1={L} x2={W - R} y1={sy(refY)} y2={sy(refY)} className="sc-ref" /><text x={W - R - 2} y={sy(refY) - 5} className="lbs" textAnchor="end">{refLabel}</text></>}
    </svg>
  );
}
