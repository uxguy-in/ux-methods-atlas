// Simple correspondence analysis of a contingency table (Benzécri; Greenacre 2017, Correspondence Analysis in
// Practice): SVD of the standardised residuals, principal inertias, row and column principal and standard
// coordinates, contributions and cos². Pure functions; validated against the prince package and numpy.
import { chi2Cdf, fmt, pct, pText, detectSep, splitRow, nonEmptyLines } from './cogia-core.js';

// Example: 6 banking apps × 8 attributes from a brand-image survey of 480 people: each cell counts the people who
// ticked the attribute for that app (they could tick any number), 2,207 mentions in all.
export const EXAMPLE = `App	Easy to use	Secure	Modern	Fast	Good value	Helpful support	Trustworthy	Fun
Atlas Bank	62	88	21	34	25	55	91	8
Nimbus	71	30	84	77	20	19	28	66
Ledger+	35	64	18	22	88	27	50	9
Pocket	80	26	69	72	78	15	24	57
Harbour	30	69	12	19	23	82	81	6
Volt	40	37	77	64	58	22	35	39`;

export function parseTable(text) {
  const lines = nonEmptyLines(text);
  if (lines.length < 3) return { error: 'Paste a table with a header row and at least two rows.' };
  const sep = detectSep(lines[0]);
  const head = splitRow(lines[0], sep);
  const cols = head.slice(1);
  const rows = [], N = [], problems = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const c = splitRow(line, sep);
    const vals = c.slice(1, cols.length + 1).map((v) => (v === '' ? 0 : Number(v)));
    if (vals.length < cols.length || vals.some((v) => !Number.isFinite(v) || v < 0)) { problems.push(`Row ${i + 2} (${c[0] || 'unnamed'}) needs ${cols.length} counts of 0 or more.`); continue; }
    rows.push(c[0] || `Row ${i + 1}`); N.push(vals);
  }
  if (cols.length < 2) return { error: 'The table needs at least two columns of counts after the row labels.' };
  if (problems.length) return { error: problems[0] };
  return { rows, cols, N };
}

// Cyclic Jacobi eigen-decomposition of a symmetric matrix. Returns eigenvalues (descending) and eigenvectors (columns).
export function jacobiEigen(A0) {
  const n = A0.length, A = A0.map((r) => [...r]), V = A.map((_, i) => A.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = A.map((_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return { values: idx.map((i) => A[i][i]), vectors: V.map((r) => idx.map((i) => r[i])) };
}

export function ca(N) {
  const I = N.length, J = N[0].length;
  const n = N.flat().reduce((a, b) => a + b, 0);
  const r = N.map((row) => row.reduce((a, b) => a + b, 0) / n), c = N[0].map((_, j) => N.reduce((a, row) => a + row[j], 0) / n);
  if (r.some((v) => v === 0) || c.some((v) => v === 0)) return { error: 'Every row and every column needs at least one count above 0.' };
  // Standardised residuals S = D_r^(−½) (P − r cᵀ) D_c^(−½).
  const S = N.map((row, i) => row.map((v, j) => (v / n - r[i] * c[j]) / Math.sqrt(r[i] * c[j])));
  const total = S.flat().reduce((a, b) => a + b * b, 0);
  const chi2 = n * total, df = (I - 1) * (J - 1), p = 1 - chi2Cdf(chi2, df);
  // Eigen-decomposition of SᵀS (J × J): eigenvalues are the principal inertias λ_k = σ_k², eigenvectors V.
  const StS = Array.from({ length: J }, (_, a) => Array.from({ length: J }, (__, b) => S.reduce((s, row) => s + row[a] * row[b], 0)));
  const eig = jacobiEigen(StS);
  const K = Math.min(I, J) - 1;
  const lam = eig.values.slice(0, K).map((v) => Math.max(0, v)), sv = lam.map(Math.sqrt);
  const V = eig.vectors.map((row) => row.slice(0, K));
  // U = S V Σ⁻¹.
  const U = S.map((row) => lam.map((_, k) => (sv[k] > 1e-14 ? row.reduce((s, x, j) => s + x * V[j][k], 0) / sv[k] : 0)));
  // Sign convention: in each dimension the column with the largest absolute coordinate is placed on the positive side.
  for (let k = 0; k < K; k++) {
    let best = 0; for (let j = 1; j < J; j++) if (Math.abs(V[j][k]) > Math.abs(V[best][k])) best = j;
    if (V[best][k] < 0) { for (let j = 0; j < J; j++) V[j][k] = -V[j][k]; for (let i = 0; i < I; i++) U[i][k] = -U[i][k]; }
  }
  const rowStd = U.map((u, i) => u.map((x) => x / Math.sqrt(r[i]))), colStd = V.map((v, j) => v.map((x) => x / Math.sqrt(c[j])));
  const rowPr = rowStd.map((u) => u.map((x, k) => x * sv[k])), colPr = colStd.map((v) => v.map((x, k) => x * sv[k]));
  const d2r = rowPr.map((f) => f.reduce((a, x) => a + x * x, 0)), d2c = colPr.map((g) => g.reduce((a, x) => a + x * x, 0));
  const rowCtr = rowPr.map((f, i) => f.map((x, k) => (lam[k] > 0 ? (r[i] * x * x) / lam[k] : 0)));
  const colCtr = colPr.map((g, j) => g.map((x, k) => (lam[k] > 0 ? (c[j] * x * x) / lam[k] : 0)));
  const rowCos2 = rowPr.map((f, i) => f.map((x) => (d2r[i] > 0 ? (x * x) / d2r[i] : 0)));
  const colCos2 = colPr.map((g, j) => g.map((x) => (d2c[j] > 0 ? (x * x) / d2c[j] : 0)));
  const rowInertia = r.map((m, i) => m * d2r[i]), colInertia = c.map((m, j) => m * d2c[j]);
  return { I, J, K, n, r, c, S, total, chi2, df, p, lam, sv, share: lam.map((l) => l / total), rowStd, colStd, rowPr, colPr, rowCtr, colCtr, rowCos2, colCos2, rowInertia, colInertia };
}

export function caCsv(t, res) {
  const K = res.K, dims = Array.from({ length: K }, (_, k) => k + 1);
  const head = ['type', 'label', 'mass', 'inertia', ...dims.map((d) => `F${d}`), ...dims.map((d) => `ctr${d}`), ...dims.map((d) => `cos2_${d}`)];
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const line = (type, label, m, inr, F, C, Q) => [type, q(label), m.toFixed(6), inr.toFixed(6), ...F.map((x) => x.toFixed(6)), ...C.map((x) => x.toFixed(6)), ...Q.map((x) => x.toFixed(6))].join(',');
  return [head.join(','), ...t.rows.map((l, i) => line('row', l, res.r[i], res.rowInertia[i], res.rowPr[i], res.rowCtr[i], res.rowCos2[i])), ...t.cols.map((l, j) => line('column', l, res.c[j], res.colInertia[j], res.colPr[j], res.colCtr[j], res.colCos2[j]))].join('\n');
}

// For each row, the column it is most over-associated with: the largest Pearson residual (o − e)/√e, observed
// above what independence predicts. Read from the table, not from map distances, which in a symmetric map are not exact.
export function strongestPairs(t, res) {
  return t.rows.map((row, i) => { let best = 0; for (let j = 1; j < res.J; j++) if (res.S[i][j] > res.S[i][best]) best = j; return { row, col: t.cols[best], resid: res.S[i][best] * Math.sqrt(res.n) }; });
}
// The labels that drive one dimension: rows and columns whose contribution exceeds the average (1/I or 1/J),
// grouped by the sign of their coordinate.
export function poles(t, res, k) {
  const pick = (labels, F, ctr, avg) => labels.map((l, i) => ({ l, x: F[i][k], c: ctr[i][k] })).filter((o) => o.c > avg).sort((a, b) => b.c - a.c);
  const rs = pick(t.rows, res.rowPr, res.rowCtr, 1 / res.I), cs = pick(t.cols, res.colPr, res.colCtr, 1 / res.J);
  const side = (s) => [...rs, ...cs].filter((o) => Math.sign(o.x) === s).map((o) => o.l);
  return { pos: side(1), neg: side(-1) };
}

// Plain-language summary.
// Confidence rule: high when the chi-square test of independence gives p < 0.001, the table has at least 200 counts
// and the first two dimensions keep at least 70% of the inertia; medium when p < 0.05 and two dimensions keep at least
// 50%; low otherwise (a weak or noisy association, or a map that hides much of it).
export function caSummary(t, res) {
  const two = res.share[0] + (res.share[1] || 0);
  const conf = res.p < 0.001 && res.n >= 200 && two >= 0.7 ? 'high' : res.p < 0.05 && two >= 0.5 ? 'medium' : 'low';
  const p1 = poles(t, res, 0), p2 = res.K > 1 ? poles(t, res, 1) : null;
  const pairs = strongestPairs(t, res).filter((x) => x.resid > 2);
  const lst = (a) => (a.length ? a.slice(0, 4).join(', ') : 'nothing in particular');
  return {
    headline: `The map's first two dimensions show ${pct(two, 0)} of the association between ${t.rows.length} rows and ${t.cols.length} columns (total inertia ${fmt(res.total, 3)}).`,
    meaning: [
      `Dimension 1 (${pct(res.share[0], 1)}) contrasts ${lst(p1.pos)} with ${lst(p1.neg)}.`,
      p2 ? `Dimension 2 (${pct(res.share[1], 1)}) contrasts ${lst(p2.pos)} with ${lst(p2.neg)}.` : 'There is only one dimension, so the map is a line.',
      pairs.length ? `Strongest links, from the table itself (Pearson residual above 2): ${pairs.slice(0, 5).map((x) => `${x.row} with ${x.col}`).join('; ')}.` : 'No row stands out strongly on any single column (no Pearson residual above 2).',
      `The chi-square test of independence gives χ²(${res.df}) = ${fmt(res.chi2, 1)}, ${pText(res.p)}: ${res.p < 0.05 ? 'the rows really do differ in their column profiles' : 'the differences between rows could be chance'}.`,
    ],
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong needs p < 0.001 on the chi-square test, at least 200 counts and at least 70% of inertia in the first two dimensions; some evidence needs p < 0.05 and at least 50%. Here p ${res.p < 0.001 ? '< 0.001' : `= ${fmt(res.p, 3)}`}, ${Math.round(res.n)} counts and ${pct(two, 0)}.`,
    caveats: [
      'In a symmetric map, the distance between a row point and a column point is not a measure of association; read rows against rows, columns against columns, and directions from the centre.',
      'Points with low quality (cos² in the first two dimensions) are poorly shown on this map; check the table before interpreting them.',
    ],
    next: ['Check that small rows or columns (low mass) are not driving a dimension through a few counts.', 'If the table comes from a survey, re-run the analysis with a fresh sample or by segment to see if the map is stable.', 'For segments rather than brands, try [Cluster to personas](/calculators/cluster-personas).'],
    report: `Correspondence analysis of a ${t.rows.length} × ${t.cols.length} table (n = ${Math.round(res.n)}): total inertia ${fmt(res.total, 3)}, χ²(${res.df}) = ${fmt(res.chi2, 1)}, ${pText(res.p)}; dimension 1 ${pct(res.share[0], 1)}, dimension 2 ${pct(res.share[1] || 0, 1)} of inertia.`,
  };
}
