import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as CA from './cogia-ca.js';
import { fmt, pct, pText } from './cogia-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Stats, Problem, About, download } from './ui.jsx';
import './cogia.css';

// Biplot of rows and columns on two chosen dimensions. map: 'symmetric' (both principal), 'rowp' (rows principal,
// columns standard: the row-profile map), 'colp' (columns principal, rows standard).
function Biplot({ t, res, d1, d2, map }) {
  const W = 680, H = 520, M = 56;
  const R = map === 'colp' ? res.rowStd : res.rowPr, C = map === 'rowp' ? res.colStd : res.colPr;
  const pts = [...R.map((f) => [f[d1], f[d2]]), ...C.map((g) => [g[d1], g[d2]])];
  const ext = Math.max(...pts.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)])) * 1.12 || 1;
  const xs = Math.max(...pts.map((p) => Math.abs(p[0]))) * 1.15 || ext, ys = Math.max(...pts.map((p) => Math.abs(p[1]))) * 1.15 || ext;
  // Same scale on both axes so distances are not distorted.
  const s = Math.min((W - 2 * 120) / (2 * xs), (H - 2 * M) / (2 * ys)); // room for labels at the sides
  const cx = W / 2, cy = H / 2, X = (v) => cx + v * s, Y = (v) => cy - v * s;
  const label = (x, y) => ({ x: X(x) + (x >= 0 ? 7 : -7), y: Y(y) + 4, a: x >= 0 ? 'start' : 'end' });
  return (
    <figure className="ea-fig">
      <div className="cg-wrap cg-fit"><svg viewBox={`0 0 ${W} ${H}`} className="cg-plot" role="img" aria-label={`Correspondence analysis map, dimensions ${d1 + 1} and ${d2 + 1}`}>
        <line x1={M / 2} x2={W - M / 2} y1={cy} y2={cy} className="axis0" />
        <line x1={cx} x2={cx} y1={M / 2} y2={H - M / 2} className="axis0" />
        <text x={W - M / 2} y={cy - 6} textAnchor="end" className="ax">Dim {d1 + 1} ({pct(res.share[d1], 1)})</text>
        <text x={cx + 6} y={M / 2 + 4} className="ax">Dim {d2 + 1} ({pct(res.share[d2], 1)})</text>
        {C.map((g, j) => { const l = label(g[d1], g[d2]); return <g key={`c${j}`}><rect x={X(g[d1]) - 4.5} y={Y(g[d2]) - 4.5} width={9} height={9} className="pt-col" /><text x={l.x} y={l.y} textAnchor={l.a} className="lc halo">{t.cols[j]}</text></g>; })}
        {R.map((f, i) => { const l = label(f[d1], f[d2]); return <g key={`r${i}`}><circle cx={X(f[d1])} cy={Y(f[d2])} r={5.5} className="pt-row" /><text x={l.x} y={l.y} textAnchor={l.a} className="lr halo">{t.rows[i]}</text></g>; })}
      </svg></div>
      <ul className="cg-legend"><li><i style={{ background: 'var(--c1)' }} />Rows{map === 'colp' ? ' (standard coordinates)' : ''}</li><li><i style={{ background: 'var(--c2)', borderRadius: 0 }} />Columns{map === 'rowp' ? ' (standard coordinates)' : ''}</li></ul>
    </figure>
  );
}

function CogiaCorrespondence() {
  const [text, setText] = useState(CA.EXAMPLE);
  const [map, setMap] = useState('symmetric');
  const [dims, setDims] = useState('0,1');
  const [view, setView] = useState('rows');
  const load = () => { setText(CA.EXAMPLE); setMap('symmetric'); setDims('0,1'); };
  const t = useMemo(() => CA.parseTable(text), [text]);
  const res = useMemo(() => (t.error ? null : CA.ca(t.N)), [t]);
  const ok = res && !res.error;
  const [d1, d2] = dims.split(',').map(Number);
  const dimOpts = ok ? Array.from({ length: res.K }, (_, a) => a).flatMap((a) => Array.from({ length: res.K }, (_, b) => b).filter((b) => b > a).map((b) => [`${a},${b}`, `Dimensions ${a + 1} and ${b + 1}`])) : [];
  const useDims = ok && res.K >= 2 && d2 < res.K ? [d1, d2] : [0, 1];
  const K = ok ? res.K : 0;
  const rowsOf = (labels, mass, inertia, F, ctr, cos2) => labels.map((l, i) => [l, fmt(mass[i], 3), fmt(inertia[i] / res.total, 3), ...Array.from({ length: Math.min(K, 3) }, (_, k) => fmt(F[i][k], 3)), ...Array.from({ length: Math.min(K, 2) }, (_, k) => <span key={k} className={ctr[i][k] > 1 / labels.length ? 'ea-b' : ''}>{fmt(ctr[i][k] * 100, 1)}</span>), fmt(cos2[i][0] + (cos2[i][1] || 0), 2)]);
  const head = (what) => [what, 'Mass', 'Share of inertia', ...Array.from({ length: Math.min(K, 3) }, (_, k) => `F${k + 1}`), ...Array.from({ length: Math.min(K, 2) }, (_, k) => `Ctr ${k + 1} %`), 'Quality (cos², dims 1–2)'];

  return (
    <div className="cg-root">
      <LoadExample onClick={load} />
      <Area label="Contingency table (counts; first row = column labels, first column = row labels; tab or comma separated)" value={text} onChange={setText} rows={8} wrap="off" hint="For example brands × attributes ticked, segments × reasons, or tasks × error types." />
      {t.error && <Problem>{t.error}</Problem>}
      {res?.error && <Problem>{res.error}</Problem>}
      {ok && res.K < 1 && <Problem>The table needs at least two rows and two columns.</Problem>}
      {ok && res.K >= 1 && (
        <>
          <Result big={`${pct(res.share[0] + (res.share[1] || 0), 1)}`} tone={res.p < 0.05 ? 'good' : undefined} label={`of the association (inertia) is shown by the first two dimensions of a ${t.rows.length} × ${t.cols.length} table.`}>
            <Stats rows={[
              ['Total inertia (χ²/n)', fmt(res.total, 4)],
              ['Chi-square test of independence', `χ²(${res.df}) = ${fmt(res.chi2, 1)}, ${pText(res.p)}`],
              ['Counts in the table', Math.round(res.n).toLocaleString('en-GB')],
              ['Dimensions', `${res.K}; average-inertia rule keeps ${res.lam.filter((l) => l > res.total / res.K).length}`],
            ]} />
          </Result>
          <div className="calc-inputs">
            <Choice label="Map" value={map} onChange={setMap} options={[['symmetric', 'Symmetric'], ['rowp', 'Row profiles'], ['colp', 'Column profiles']]} />
            {res.K > 2 && <Pick label="Dimensions" value={dims} onChange={setDims} options={dimOpts} />}
          </div>
          {res.K >= 2 ? <Biplot t={t} res={res} d1={useDims[0]} d2={useDims[1]} map={map} /> : <p className="cg-note">Only one dimension: the rows and columns lie on a line (see F1 in the tables).</p>}
          <p className="cg-note">{map === 'symmetric' ? 'Symmetric map: rows and columns both in principal coordinates. Compare rows with rows and columns with columns; a row and a column in the same direction from the centre are associated.' : map === 'rowp' ? 'Row-profile (asymmetric) map: rows in principal coordinates, columns as vertices in standard coordinates. A row lies towards the columns its profile is heavy in.' : 'Column-profile (asymmetric) map: columns in principal coordinates, rows as vertices in standard coordinates.'}</p>
          <h3 className="clu-h3">Inertia by dimension</h3>
          <Table label="Principal inertias" head={['Dimension', 'Singular value', 'Principal inertia', 'Share', 'Cumulative']} rows={res.lam.map((l, k) => [k + 1, fmt(res.sv[k], 4), fmt(l, 5), pct(res.share[k], 1), pct(res.share.slice(0, k + 1).reduce((a, b) => a + b, 0), 1)])} />
          <div className="cg-actions">
            <Choice label="Show" value={view} onChange={setView} options={[['rows', 'Rows'], ['cols', 'Columns'], ['std', 'Standard coordinates']]} />
            <button type="button" className="btn ghost small" onClick={() => download('correspondence-analysis.csv', CA.caCsv(t, res), 'text/csv')}>Download CSV</button>
          </div>
          {view === 'rows' && <Table label="Row statistics" head={head('Row')} rows={rowsOf(t.rows, res.r, res.rowInertia, res.rowPr, res.rowCtr, res.rowCos2)} />}
          {view === 'cols' && <Table label="Column statistics" head={head('Column')} rows={rowsOf(t.cols, res.c, res.colInertia, res.colPr, res.colCtr, res.colCos2)} />}
          {view === 'std' && <Table label="Standard coordinates" head={['Label', 'Type', ...Array.from({ length: Math.min(K, 3) }, (_, k) => `Standard ${k + 1}`)]} rows={[...t.rows.map((l, i) => [l, 'row', ...res.rowStd[i].slice(0, 3).map((x) => fmt(x, 3))]), ...t.cols.map((l, j) => [l, 'column', ...res.colStd[j].slice(0, 3).map((x) => fmt(x, 3))])]} />}
          <p className="cg-note">F = principal coordinates. Ctr = contribution of the point to the dimension (in bold when above the average, 100/number of points). Quality = cos² on the first two dimensions: how well the map shows that point (1 = perfectly).</p>
          <StudySummary {...CA.caSummary(t, res)} />
        </>
      )}
      <About method="correspondence-analysis" links={[['multidimensional-scaling-and-perceptual-mapping', 'Multidimensional scaling and perceptual mapping'], ['factor-analytic-and-correspondence-analytic-persona-development', 'Factor-analytic and correspondence-analytic persona development']]}>
        <p><b>Idea.</b> Correspondence analysis turns a table of counts into a map where rows with similar profiles sit together, columns with similar profiles sit together, and the main contrasts in the table become the axes (Benzécri 1973; Greenacre 2017).</p>
        <p><b>Formulas.</b> With N the table and n its total, P = N/n, row masses r = P·1 and column masses c = Pᵀ·1. The standardised residuals are S = D_r^(−½)(P − r cᵀ)D_c^(−½). The singular value decomposition S = U Σ Vᵀ gives principal inertias λ_k = σ_k²; their sum is the total inertia χ²/n. Row standard coordinates are D_r^(−½)U and principal coordinates F = D_r^(−½)UΣ; columns likewise, G = D_c^(−½)VΣ. The contribution of row i to dimension k is r_i f_ik²/λ_k, and its cos² is f_ik²/Σ_k f_ik² (the share of its squared χ² distance from the centre shown on that dimension). Signs of the axes are arbitrary; here each axis is oriented so its most extreme column is on the positive side.</p>
        <p><b>Reading the map.</b> In the symmetric map, distances between rows (and between columns) approximate χ² distances between profiles; a row–column distance has no exact meaning, but a row and a column in the same direction from the centre go together. The asymmetric maps make row–column relationships exact at the cost of crowding one set near the centre. The "strongest links" in the summary come from the Pearson residuals (o − e)/√e of the table, not from the map.</p>
        <p><b>Checks.</b> Inertias, coordinates, contributions and cos² are checked against the prince Python package and a numpy SVD.</p>
        <p><b>When not to use it.</b> On measurements (ratings, times) rather than counts or frequencies; on tables with very small totals, where one or two counts can create a dimension; or as a test: the map describes association, it does not show that it is real (use the chi-square test and a fresh sample for that).</p>
      </About>
    </div>
  );
}

export default CogiaCorrespondence;
