import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as X from './surveystatsCrosstab.js';
import { categoricalData, exampleCrosstab } from './surveystatsData.js';
import { Choice, Pick, Result, Stats, Problem, About, num, pct, pv } from './ui.jsx';
import { DataBox, ColumnTable, useColumns, useJob, runJob, Mosaic, short } from './surveystatsUi.jsx';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const heat = (z) => { const a = Math.min(Math.abs(z), 4) / 4 * 34; return { background: `color-mix(in srgb, var(${z > 0 ? '--c1' : '--c2'}) ${a.toFixed(0)}%, transparent)` }; };
const isCat = (c) => (c.type === 'nominal' || c.type === 'ordinal') && c.distinct >= 2 && c.distinct <= 15;

function CountTable({ tab, x, mode, showE, rowName, colName }) {
  const { rs, cs, n } = X.margins(tab.N);
  const share = (v, i, j) => (mode === 'row' ? v / rs[i] : mode === 'col' ? v / cs[j] : v / n);
  return (
    <div className="clu-scroll">
      <table className="clu-table clu-num svs-table svs-heat" aria-label="Cross-tabulation">
        <thead><tr><th>{short(rowName, 18)} \ {short(colName, 18)}</th>{tab.cols.map((c) => <th key={c} title={c}>{short(c, 16)}</th>)}<th>Total</th></tr></thead>
        <tbody>
          {tab.rows.map((rl, i) => (
            <tr key={rl}><td title={rl}>{short(rl, 22)}</td>
              {tab.N[i].map((v, j) => {
                const z = x.adj[i][j], sig = Math.abs(z) > 1.96, holm = x.holmP[i][j] < 0.05;
                return <td key={j} style={heat(z)} className={sig ? 'hi' : ''} title={`Adjusted residual ${num(z)}; Holm p ${pv(x.holmP[i][j])}`}>{v}{holm ? '†' : ''}<small>{pct(share(v, i, j), 1)}{showE ? ` · E ${num(x.E[i][j], 1)}` : ''}</small></td>;
              })}
              <td>{rs[i]}<small>{pct(mode === 'col' ? rs[i] / n : mode === 'total' ? rs[i] / n : 1, 1)}</small></td></tr>
          ))}
          <tr><td>Total</td>{cs.map((c, j) => <td key={j}>{c}<small>{pct(mode === 'row' ? c / n : mode === 'total' ? c / n : 1, 1)}</small></td>)}<td>{n}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
function ResidTable({ tab, x }) {
  return (
    <div className="clu-scroll">
      <table className="clu-table clu-num svs-table svs-heat" aria-label="Adjusted residuals">
        <thead><tr><th>Adjusted residual z</th>{tab.cols.map((c) => <th key={c} title={c}>{short(c, 16)}</th>)}</tr></thead>
        <tbody>{tab.rows.map((rl, i) => <tr key={rl}><td title={rl}>{short(rl, 22)}</td>{x.adj[i].map((z, j) => <td key={j} style={heat(z)} className={Math.abs(z) > 1.96 ? 'hi' : ''}>{num(z)}{x.holmP[i][j] < 0.05 ? '†' : ''}<small>Holm p {pv(x.holmP[i][j])}</small></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Crosstab explorer ──
function SurveystatsCrosstab() {
  const [text, setText] = useState(exampleCrosstab);
  const { table, cols, setType } = useColumns(text);
  const cand = cols.filter(isCat);
  const [rowName, setRowName] = useState('Onboarding');
  const [colName, setColName] = useState('Completed set-up');
  const [layerName, setLayerName] = useState('Device');
  const rowC = cand.find((c) => c.name === rowName) || cand[0];
  const colC = cand.find((c) => c.name === colName && c !== rowC) || cand.find((c) => c !== rowC);
  const layC = layerName ? cand.find((c) => c.name === layerName && c !== rowC && c !== colC) : null;
  const [mode, setMode] = useState('row');
  const [showE, setShowE] = useState(false);
  const [ordered, setOrdered] = useState('auto');
  // Ordered scales keep their order; yes/no-style answers put the "yes" level first, so odds ratios read naturally.
  const order = (c) => (c.type === 'ordinal' ? c.levels : c.levels.length === 2 && c.levels.some((l) => /^(yes|y|true|completed?|success)$/i.test(l)) ? [...c.levels].sort((a) => (/^(yes|y|true|completed?|success)$/i.test(a) ? -1 : 1)) : null);

  const res = useMemo(() => {
    if (!rowC || !colC) return { error: 'Paste data with at least two category columns (2 to 15 different answers each).' };
    const idx = [rowC.index, colC.index, ...(layC ? [layC.index] : [])];
    const cat = categoricalData(table, idx);
    if (cat.rows.length < 5) return { error: 'Too few rows with answers to both questions.' };
    const tab = X.crossTable(cat.rows.map((r) => r[0]), cat.rows.map((r) => r[1]), order(rowC), order(colC));
    if (tab.rows.length < 2 || tab.cols.length < 2) return { error: 'Each question needs at least two different answers.' };
    const x = X.chiSquare(tab.N), cv = X.cramerV(x.chi2, x.n, tab.rows.length, tab.cols.length);
    const is22 = tab.rows.length === 2 && tab.cols.length === 2;
    const fisher = is22 ? { p: X.exactTest(tab.N).p, method: "Fisher's exact test" } : null;
    const bothOrd = rowC.type === 'ordinal' && colC.type === 'ordinal';
    const useTrend = ordered === 'yes' || (ordered === 'auto' && bothOrd);
    const trend = useTrend && !is22 ? X.linearByLinear(tab.N) : null;
    let layers = null, cm = null, simpson = null, lstats = null;
    if (layC) {
      const lv = layC.type === 'ordinal' ? layC.levels.filter((l) => cat.rows.some((r) => r[2] === l)) : [...new Set(cat.rows.map((r) => r[2]))].sort();
      layers = lv.map((l) => { const sub = cat.rows.filter((r) => r[2] === l); return { level: l, tab: X.crossTable(sub.map((r) => r[0]), sub.map((r) => r[1]), tab.rows, tab.cols) }; });
      layers.forEach((L) => { L.tab = { ...L.tab, N: tab.rows.map((rl) => tab.cols.map((cl) => { const i = L.tab.rows.indexOf(rl), j = L.tab.cols.indexOf(cl); return i < 0 || j < 0 ? 0 : L.tab.N[i][j]; })), rows: tab.rows, cols: tab.cols }; });
      lstats = X.layerStats(layers.map((L) => L.tab.N));
      const usable = layers.filter((L) => L.tab.N.flat().reduce((a, b) => a + b, 0) > 1);
      if (is22 && usable.length >= 2) { cm = X.cmh(usable.map((L) => L.tab.N)); simpson = X.simpsonCheck(usable.map((L) => L.tab.N)); }
    }
    return { tab, x, cv, fisher, trend, layers, lstats, cm, simpson, n: x.n, dropped: cat.dropped, is22 };
  }, [table, rowC, colC, layC, ordered]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exact p for larger sparse tables: Freeman-Halton when the 2 × c enumeration is small enough, otherwise Monte Carlo
  // with 10,000 tables, both in the background thread.
  const needExact = !res.error && !res.is22 && res.x.lowE > 0;
  const ex = useJob(needExact ? `ex|${hash(text)}|${rowC?.name}|${colC?.name}` : null, () => runJob('exact', { N: res.tab.N }, () => X.exactTest(res.tab.N) || { ...X.monteCarloExact(res.tab.N, { B: 10000 }), method: 'Monte Carlo exact test (10,000 tables)' }));
  const exact = res.fisher || ex.result || null;
  const sum = res.error ? null : X.crosstabSummary({ rowName: rowC.name, colName: colC.name, layerName: layC?.name, tab: res.tab, x: res.x, cv: res.cv, exact, trend: res.trend, simpson: res.simpson, cm: res.cm, layers: res.lstats });
  const opts = cand.map((c) => [c.name, `${c.name}${c.type === 'ordinal' ? ' (ordered)' : ''}`]);

  return (
    <div className="svs-root">
      <DataBox text={text} setText={setText} examples={[['Load example survey', exampleCrosstab]]} />
      {cols.length > 0 && <details className="calc-about"><summary>Columns and types ({cols.length})</summary><ColumnTable table={table} cols={cols} setType={setType} /></details>}
      {cand.length >= 2 && (
        <div className="calc-inputs">
          <Pick label="Rows" value={rowC?.name || ''} onChange={setRowName} options={opts} />
          <Pick label="Columns" value={colC?.name || ''} onChange={setColName} options={opts.filter(([v]) => v !== rowC?.name)} />
          <Pick label="Layer (optional)" value={layC?.name || ''} onChange={setLayerName} options={[['', 'None'], ...opts.filter(([v]) => v !== rowC?.name && v !== colC?.name)]} />
          <Choice label="Percentages" value={mode} onChange={setMode} options={[['row', 'Row %'], ['col', 'Column %'], ['total', 'Total %']]} />
          <Choice label="Expected counts" value={showE} onChange={setShowE} options={[[false, 'Hide'], [true, 'Show']]} />
          <Choice label="Ordered trend test" value={ordered} onChange={setOrdered} options={[['auto', 'If both ordered'], ['yes', 'Always'], ['no', 'Never']]} />
        </div>
      )}
      {res.error ? <Problem>{res.error}</Problem> : (
        <>
          <Result big={`V = ${num(res.cv.v)}`} label={`Cramér's V, a ${X.effectWord(res.cv.w)} association (95% CI ${num(res.cv.lo)} to ${num(res.cv.hi)})`} tone={(exact ? exact.p : res.x.p) < 0.05 ? 'good' : ''}>
              <p>χ²({res.x.df}) = {num(res.x.chi2)}, p {pv(res.x.p)}{exact ? `; ${exact.method} p ${pv(exact.p)}` : ''}. n = {res.n}{res.dropped ? ` (${res.dropped} rows with a missing answer left out)` : ''}.</p>
          </Result>
          {res.x.lowE > 0 && <Problem>{res.x.lowE} of {res.tab.rows.length * res.tab.cols.length} expected counts are below 5 (smallest {num(res.x.minE, 2)}), so the χ² p-value is only approximate. {res.is22 ? "Use Fisher's exact test." : ex.busy ? 'Computing an exact p-value…' : exact ? `Use the ${exact.method}.` : 'Merge sparse categories.'}</Problem>}
          <CountTable tab={res.tab} x={res.x} mode={mode} showE={showE} rowName={rowC.name} colName={colC.name} />
          <p className="svs-note">Cells are shaded by adjusted residual: blue where there are more people than if the questions were unrelated, orange where there are fewer; bold beyond ±1.96, † still significant after Holm's adjustment across all {res.tab.rows.length * res.tab.cols.length} cells.</p>
          <Stats rows={[
            ['Pearson χ²', `${num(res.x.chi2, 3)} on ${res.x.df} df, p ${pv(res.x.p)}`],
            ['Likelihood ratio G²', `${num(res.x.g2, 3)}, p ${pv(res.x.gp)}`],
            res.is22 && ["Yates' corrected χ²", `${num(res.x.yates, 3)}, p ${pv(res.x.yatesP)}`],
            exact && [exact.method, `p ${pv(exact.p)}`],
            ["Cramér's V [95% CI]", `${num(res.cv.v, 3)} [${num(res.cv.lo, 3)}, ${num(res.cv.hi, 3)}]`],
            res.is22 && ['Odds ratio (first row, first column)', num(X.or2(res.tab.N), 3)],
            res.trend && ['Linear-by-linear (ordered trend)', `M² = ${num(res.trend.m2, 3)}, p ${pv(res.trend.p)}, r = ${num(res.trend.r, 3)}`],
            ['Smallest expected count', num(res.x.minE, 2)],
          ]} />
          <div className="svs-two">
            <div><h3 className="clu-h3">Mosaic</h3><Mosaic rows={res.tab.rows} cols={res.tab.cols} N={res.tab.N} adj={res.x.adj} /></div>
            <div><h3 className="clu-h3">Standardised (adjusted) residuals</h3><ResidTable tab={res.tab} x={res.x} /></div>
          </div>
          {res.layers && (
            <>
              <h2 className="svs-h">Within each level of {layC.name}</h2>
              <div className="clu-scroll"><table className="clu-table clu-num svs-table">
                <thead><tr><th>{short(layC.name, 18)}</th><th>n</th>{res.tab.rows.map((rl) => <th key={rl}>{short(rl, 12)}: {short(res.tab.cols[0], 12)}</th>)}<th>χ² p</th><th>Cramér's V</th>{res.is22 && <th>Odds ratio</th>}</tr></thead>
                <tbody>{res.layers.map((L, k) => { const st = res.lstats[k]; return (
                  <tr key={L.level}><td>{L.level}</td><td>{st.n}</td>{L.tab.N.map((r, i) => { const t = r.reduce((a, b) => a + b, 0); return <td key={i}>{t ? pct(r[0] / t, 1) : '—'}<small>{r[0]} of {t}</small></td>; })}<td>{st.tooSmall ? 'too few' : pv(st.p)}</td><td>{num(st.v)}</td>{res.is22 && <td>{num(st.or)}</td>}</tr>
                ); })}
                <tr><td><b>All together</b></td><td>{res.n}</td>{res.tab.N.map((r, i) => { const t = r.reduce((a, b) => a + b, 0); return <td key={i}><b>{pct(r[0] / t, 1)}</b><small>{r[0]} of {t}</small></td>; })}<td>{pv(res.x.p)}</td><td>{num(res.cv.v)}</td>{res.is22 && <td>{num(X.or2(res.tab.N))}</td>}</tr>
                </tbody>
              </table></div>
              <p className="svs-note">Columns show the share answering "{res.tab.cols[0]}" in each row group.</p>
              {res.cm && (
                <Stats rows={[
                  ['Mantel-Haenszel odds ratio [95% CI]', `${num(res.cm.or, 3)} [${num(res.cm.lo, 3)}, ${num(res.cm.hi, 3)}]`],
                  ['Cochran-Mantel-Haenszel χ²(1)', `${num(res.cm.chi2, 3)}, p ${pv(res.cm.p)} (with continuity correction ${num(res.cm.chi2c, 3)}, p ${pv(res.cm.pc)})`],
                  [`Breslow-Day χ²(${res.cm.K - 1})`, `${num(res.cm.bd, 3)}, p ${pv(res.cm.bdP)}`],
                  ["Tarone's adjusted", `${num(res.cm.tarone, 3)}, p ${pv(res.cm.taroneP)}`],
                  ['Pooled (collapsed) odds ratio', num(res.simpson.pooled, 3)],
                  ["Simpson's paradox", res.simpson.reversal ? 'Yes: the pooled and within-layer associations point opposite ways' : res.simpson.confounded ? `No reversal, but ${layC.name} changes the odds ratio by ${pct(res.simpson.change)}` : 'No'],
                ]} />
              )}
              {res.simpson?.reversal && <Problem>Simpson's paradox: pooled over {layC.name}, the odds ratio is {num(res.simpson.pooled)}, but within each {layC.name} it is {num(res.simpson.adjusted)}. {layC.name} is unevenly spread across the {rowC.name} groups and also affects {colC.name}, so the pooled table misleads. Report the within-layer comparison.</Problem>}
              {!res.is22 && <p className="svs-note">The Cochran-Mantel-Haenszel and Breslow-Day tests here are for 2 × 2 tables; for larger tables compare the per-layer χ² and V (the elaboration model: replication, explanation, specification).</p>}
            </>
          )}
          {sum && <StudySummary {...sum} />}
        </>
      )}
      <About method="chi-square-and-fishers-exact-tests" links={[['cross-tabulation-of-ux-metrics', 'Cross-tabulation'], ['stratified-2x2-analysis-cochran-mantel-haenszel-and-breslow-day', 'Stratified 2 × 2 (CMH, Breslow-Day)'], ['simpsons-paradox-and-composition-shift-check', "Simpson's paradox check"], ['elaboration-model-lazarsfeld-paradigm', 'Elaboration model'], ['ordinal-trend-tests-for-contingency-tables-linear-by-linear-and-cochran-armitage', 'Ordinal trend tests']]}>
        <p><b>The table.</b> Counts with row, column or total percentages. Expected counts under independence are Eᵢⱼ = rowᵢ × columnⱼ / n. <b>Pearson's χ²</b> = Σ(O − E)²/E on (r − 1)(c − 1) df; the likelihood-ratio <b>G²</b> = 2ΣO ln(O/E); for 2 × 2 tables Yates' correction subtracts ½ from each |O − E|. When expected counts fall below 5 the χ² approximation weakens (Cochran 1954): for 2 × 2 tables <b>Fisher's exact test</b> sums the hypergeometric probabilities of all tables with the same margins that are no more likely than the observed one; for 2 × c tables the <b>Freeman-Halton</b> extension does the same by enumerating every table; otherwise a <b>Monte Carlo</b> exact p shuffles one variable 10,000 times, p = (1 + hits)/(10,001).</p>
        <p><b>Which cells?</b> The <b>adjusted residual</b> (Haberman 1973) zᵢⱼ = (O − E)/√(E(1 − rowᵢ/n)(1 − columnⱼ/n)) is approximately standard normal, so |z| &gt; 1.96 marks a cell that departs from independence. Checking every cell inflates false alarms, so the cell p-values are also adjusted by <b>Holm's</b> step-down method (†).</p>
        <p><b>How strong?</b> <b>Cramér's V</b> = √(χ²/(n(m − 1))), m = min(r, c), runs from 0 to 1. Its 95% interval inverts the noncentral χ² distribution (Smithson 2003): the noncentralities λ that put the observed χ² at the 97.5th and 2.5th percentiles give V = √((λ + df)/(n(m − 1))). Cohen's (1988) benchmarks apply to w = V√(m − 1): .10 small, .30 medium, .50 large.</p>
        <p><b>Ordered answers.</b> When both questions are ordered (satisfaction, tenure bands), the <b>linear-by-linear</b> test M² = (n − 1)r², r the correlation of the row and column scores 1, 2, 3 …, on 1 df (Agresti 2007), is more powerful than χ² for a steady trend. For a 2 × c table it equals the Cochran-Armitage trend test.</p>
        <p><b>Layers.</b> For 2 × 2 tables split by a third variable: the <b>Mantel-Haenszel</b> odds ratio Σ(aᵢdᵢ/nᵢ)/Σ(bᵢcᵢ/nᵢ) with the Robins-Breslow-Greenland interval; the <b>CMH</b> test (Σaᵢ − ΣE(aᵢ))²/ΣVar(aᵢ) of no association within layers; the <b>Breslow-Day</b> test (with Tarone's adjustment) of whether the odds ratio is the same in every layer. The <b>Simpson's paradox</b> check compares the pooled odds ratio with the Mantel-Haenszel one: a reversal is flagged when they fall on opposite sides of 1, each by more than 10%. For larger tables the per-layer χ² and V show whether the association replicates, weakens (explanation) or holds only in some layers (specification), as in Lazarsfeld's elaboration model.</p>
        <p>Validated against scipy (chi2_contingency, fisher_exact, contingency.association, ncx2), statsmodels (Table residuals and ordinal association, StratifiedTable CMH, Breslow-Day and Tarone, multipletests Holm) and a full enumeration in Python for Freeman-Halton (<code>npm run check:surveystats</code>).</p>
        <p><b>When not to use it.</b> Each person must appear once in the table (for before-and-after answers from the same people use McNemar's test in Compare two rates). With large samples (over 1,000) almost any difference is significant, so judge V and the percentages. A crosstab shows association, not cause: always ask which third variable could explain it, and add it as a layer.</p>
      </About>
    </div>
  );
}

export default SurveystatsCrosstab;
