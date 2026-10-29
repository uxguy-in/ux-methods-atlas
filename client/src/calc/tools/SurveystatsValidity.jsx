import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as V from './surveystatsValidity.js';
import { parseCorrMatrix } from './surveystatsFactor.js';
import { corrMatrix, sdev } from './surveystatsMath.js';
import { numericData, isNumericCol, exampleValiditySurvey, exampleMapping, SV_LOADINGS_TEXT, SV_PHI_TEXT, readTable } from './surveystatsData.js';
import { Choice, Num, Area, Result, Stats, Problem, About, num, pv, n_ } from './ui.jsx';
import { DataBox, ColumnTable, useColumns, Matrix, short } from './surveystatsUi.jsx';

const yes = (v) => (v === null ? <span className="qtag">Not available</span> : v ? <span className="qtag promote">Meets</span> : <span className="qtag fix">Misses</span>);

function ConstructTable({ names, stats }) {
  return (
    <div className="clu-scroll"><table className="clu-table clu-num svs-table">
      <thead><tr><th>Construct</th><th>Items</th><th>CR</th><th>AVE</th><th>√AVE</th><th>Coefficient H</th><th>Lowest loading</th><th>Convergent validity</th></tr></thead>
      <tbody>{stats.map((s, i) => (
        <tr key={names[i]}><td>{names[i]}</td><td>{s.k}</td><td className={s.cr < 0.7 ? 'bad' : ''}>{num(s.cr)}</td><td className={s.ave < 0.5 ? 'bad' : ''}>{num(s.ave)}</td><td>{num(s.sqrtAve)}</td><td>{num(s.h)}</td><td className={s.min < 0.5 ? 'bad' : s.min < 0.7 ? 'warn' : ''}>{num(s.min)}</td>
          <td>{s.cr >= 0.7 && s.ave >= 0.5 ? <span className="qtag promote">CR ≥ .70, AVE ≥ .50</span> : <span className="qtag fix">{s.cr < 0.7 ? 'CR below .70' : 'AVE below .50'}</span>}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
function FornellTable({ names, stats, Phi }) {
  const M = Phi.map((r, i) => r.map((v, j) => (i === j ? stats[i].sqrtAve : v)));
  return <Matrix names={names} M={M} lower label="Fornell-Larcker table" corner="√AVE on the diagonal" cls={(i, j, v) => (i === j ? 'diag' : j < i ? (Math.abs(v) >= Math.min(stats[i].sqrtAve, stats[j].sqrtAve) ? 'bad' : 'good') : '')} />;
}
function FitTable({ f }) {
  const v = V.fitVerdicts(f);
  return (
    <div className="clu-scroll"><table className="clu-table clu-num svs-table">
      <thead><tr><th>Index</th><th>Value</th><th>Hu &amp; Bentler (1999)</th><th>Rule of thumb</th></tr></thead>
      <tbody>
        <tr><td>χ² (df), p</td><td>{num(f.chi2, 2)} ({f.df}), p {pv(f.p)}</td><td>—</td><td>χ²/df = {num(f.ratio)}</td></tr>
        <tr><td>RMSEA [90% CI]</td><td>{num(f.rmsea, 3)} [{num(f.rmseaLo, 3)}, {num(f.rmseaHi, 3)}]</td><td>≤ .06</td><td>{yes(v.rmsea)}</td></tr>
        <tr><td>p-close (RMSEA ≤ .05)</td><td>{pv(f.pclose)}</td><td>—</td><td>{f.pclose > 0.05 ? 'Close fit not rejected' : 'Close fit rejected'}</td></tr>
        <tr><td>CFI</td><td>{num(f.cfi, 3)}</td><td>≥ .95</td><td>{yes(v.cfi)}</td></tr>
        <tr><td>TLI</td><td>{num(f.tli, 3)}</td><td>≥ .95</td><td>{yes(v.tli)}</td></tr>
        <tr><td>SRMR</td><td>{num(f.srmr, 3)}</td><td>≤ .08</td><td>{yes(v.srmr)}</td></tr>
      </tbody>
    </table></div>
  );
}

function RawMode() {
  const [text, setText] = useState(exampleValiditySurvey);
  const [mapText, setMapText] = useState(exampleMapping);
  const { table, cols, setType } = useColumns(text);
  const res = useMemo(() => {
    const numCols = cols.filter(isNumericCol).map((c) => c.name);
    const mp = V.parseMapping(mapText, numCols);
    if (!mp.groups.length) return { error: 'Map items to constructs: one line per construct, like "Usefulness: PU1, PU2, PU3".' };
    if (mp.unknown.length) return { error: `Not found among the numeric columns: ${mp.unknown.slice(0, 5).join(', ')}.` };
    if (mp.dup.length) return { error: `An item can belong to only one construct: ${mp.dup.join(', ')}.` };
    const thin = mp.groups.filter((g) => g.items.length < 2).map((g) => g.name);
    if (thin.length) return { error: `Each construct needs at least two items (${thin.join(', ')}).` };
    const used = mp.groups.flatMap((g) => g.items.map((i) => numCols[i]));
    const nd = numericData(table, cols, used);
    if (nd.n < used.length + 5) return { error: `Only ${nd.n} complete responses for ${used.length} items; a CFA needs many more.` };
    const flat = nd.cols.map((c, j) => (sdev(c) > 0 ? null : nd.names[j])).filter(Boolean);
    if (flat.length) return { error: `${flat.join(', ')} has the same answer from everyone.` };
    const pos = new Map(nd.names.map((nm, i) => [nm, i]));
    const groups = mp.groups.map((g) => g.items.map((i) => pos.get(numCols[i])));
    const R = corrMatrix(nd.cols);
    let cf;
    try { cf = V.cfa(R, nd.n, groups); } catch (e) { return { error: e.message }; }
    const stats = groups.map((g) => V.constructStats(g.map((i) => cf.std[i])));
    const names = mp.groups.map((g) => g.name);
    const ht = groups.length > 1 ? V.htmt(R, groups).htmt : null;
    const fl = V.fornellLarcker(stats, cf.Phi);
    return { names, groups, items: nd.names, n: nd.n, dropped: nd.dropped, cf, stats, ht, fl };
  }, [table, cols, mapText]);
  const r = res;
  const sum = r.error ? null : V.validitySummary({ names: r.names, stats: r.stats, Phi: r.cf.Phi, fl: r.fl, ht: r.ht, fit: r.cf.df > 0 ? r.cf.fit : null, n: r.n, mode: 'raw', cfaOk: r.cf.converged, heywood: r.cf.heywood.length });
  return (
    <>
      <DataBox text={text} setText={(t) => { setText(t); }} examples={[['Load example survey', () => { setMapText(exampleMapping()); return exampleValiditySurvey(); }]]} />
      {cols.length > 0 && <details className="calc-about"><summary>Columns and types ({cols.length})</summary><ColumnTable table={table} cols={cols} setType={setType} /></details>}
      <div className="calc-inputs">
        <Area label="Which items measure which construct" value={mapText} onChange={setMapText} rows={5} hint="One construct per line: its name, a colon, then its item columns separated by commas. Items must be reflective (interchangeable indicators of the construct)." />
      </div>
      {r.error ? <Problem>{r.error}</Problem> : (
        <>
          <Result big={`${r.stats.filter((s) => s.cr >= 0.7 && s.ave >= 0.5).length} of ${r.names.length}`} label="constructs with convergent validity (CR ≥ .70 and AVE ≥ .50)" tone={r.stats.every((s) => s.cr >= 0.7 && s.ave >= 0.5) ? 'good' : 'bad'}>
            <p>Standardised loadings come from a confirmatory factor analysis (maximum likelihood) of all {r.items.length} items with every construct correlated, fitted to {r.n} complete responses{r.dropped ? ` (${r.dropped} with missing answers left out)` : ''}.</p>
          </Result>
          {!r.cf.converged && <Problem>The CFA did not fully converge; treat the numbers with caution.</Problem>}
          {r.cf.heywood.length > 0 && <Problem>Heywood case: {r.cf.heywood.map((i) => r.items[i]).join(', ')} has a standardised loading of about 1 or a uniqueness of about 0. The model is probably misspecified or the construct has too few items.</Problem>}
          <h3 className="clu-h3">Convergent validity and reliability</h3>
          <ConstructTable names={r.names} stats={r.stats} />
          <details className="calc-about"><summary>Standardised loadings per item</summary>
            <div className="clu-scroll"><table className="clu-table clu-num svs-table">
              <thead><tr><th>Item</th><th>Construct</th><th>Loading</th><th>R² (loading²)</th></tr></thead>
              <tbody>{r.groups.flatMap((g, c) => g.map((i) => <tr key={r.items[i]}><td>{short(r.items[i], 30)}</td><td>{r.names[c]}</td><td className={r.cf.std[i] < 0.5 ? 'bad' : r.cf.std[i] < 0.7 ? 'warn' : ''}>{num(r.cf.std[i], 3)}</td><td>{num(r.cf.std[i] ** 2)}</td></tr>))}</tbody>
            </table></div>
          </details>
          {r.names.length > 1 && (
            <div className="svs-two">
              <div><h3 className="clu-h3">Fornell-Larcker</h3><FornellTable names={r.names} stats={r.stats} Phi={r.cf.Phi} /><p className="svs-note">√AVE on the diagonal; below it, construct correlations from the CFA. Red: a correlation at least as large as a √AVE.</p></div>
              <div><h3 className="clu-h3">HTMT</h3><Matrix names={r.names} M={r.ht} lower label="HTMT" cls={(i, j, v) => (j < i ? (v >= 0.9 ? 'bad' : v >= 0.85 ? 'warn' : 'good') : '')} fmt={(v, i, j) => (i === j ? '' : num(v))} /><p className="svs-note">From the raw item correlations. Amber at .85 (strict), red at .90 (liberal), after Henseler, Ringle &amp; Sarstedt (2015).</p></div>
            </div>
          )}
          {r.cf.df > 0 && <><h3 className="clu-h3">CFA model fit</h3><FitTable f={r.cf.fit} /><p className="svs-note">χ² = (n − 1) × the ML discrepancy; the baseline model has uncorrelated items: χ²(df) = {num(r.cf.chi2b, 1)} ({r.cf.dfb}). SRMR uses the residuals of the fitted correlations.</p></>}
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </>
  );
}

function LoadingsMode() {
  const [lText, setLText] = useState(SV_LOADINGS_TEXT);
  const [pText, setPText] = useState(SV_PHI_TEXT);
  const res = useMemo(() => {
    const { constructs, bad } = V.parseLoadings(lText);
    if (bad.length) return { error: `Line${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: use "Construct: 0.81, 0.77, 0.70" with at least two loadings between −1 and 1.` };
    if (!constructs.length) return { error: 'Enter standardised loadings for at least one construct.' };
    const stats = constructs.map((c) => V.constructStats(c.loadings));
    const names = constructs.map((c) => c.name);
    let Phi = null, phiError = null;
    if (pText.trim() && constructs.length > 1) {
      const m = parseCorrMatrix(readTable(pText).table);
      if (m.error) phiError = m.error;
      else {
        const key = (s) => s.toLowerCase().trim(), idx = names.map((nm) => m.names.findIndex((x) => key(x) === key(nm)));
        if (idx.some((i) => i < 0)) phiError = `The correlation matrix must name the same constructs (${names.join(', ')}).`;
        else Phi = idx.map((a) => idx.map((b) => m.R[a][b]));
      }
    }
    return { names, stats, Phi, phiError, fl: Phi ? V.fornellLarcker(stats, Phi) : { fails: [] } };
  }, [lText, pText]);
  const sum = res.error ? null : V.validitySummary({ names: res.names, stats: res.stats, Phi: res.Phi, fl: res.fl, mode: 'typed' });
  return (
    <>
      <div className="calc-inputs">
        <Area label="Standardised loadings, one construct per line" value={lText} onChange={setLText} rows={5} hint='Like "Ease of use: 0.82, 0.79, 0.74" from your CFA or a published paper (completely standardised loadings).' />
        <Area label="Construct correlations (optional, for Fornell-Larcker)" value={pText} onChange={setPText} rows={5} wrap="off" hint="A correlation matrix with a header row of the same construct names; the lower triangle is enough." />
        <div className="svs-actions"><button type="button" className="btn ghost small" onClick={() => { setLText(SV_LOADINGS_TEXT); setPText(SV_PHI_TEXT); }}>Load example</button></div>
      </div>
      {res.error ? <Problem>{res.error}</Problem> : (
        <>
          <Result big={`${res.stats.filter((s) => s.cr >= 0.7 && s.ave >= 0.5).length} of ${res.names.length}`} label="constructs with convergent validity (CR ≥ .70 and AVE ≥ .50)" />
          <ConstructTable names={res.names} stats={res.stats} />
          {res.phiError && <Problem>{res.phiError}</Problem>}
          {res.Phi && <><h3 className="clu-h3">Fornell-Larcker</h3><FornellTable names={res.names} stats={res.stats} Phi={res.Phi} /></>}
          <p className="svs-note">HTMT needs the item-level correlations, so switch to "Raw item data" to get it.</p>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </>
  );
}

function FitMode() {
  const [chi2, setChi2] = useState('85.3'); const [df, setDf] = useState('48'); const [n, setN] = useState('250');
  const [chi2b, setChi2b] = useState('1450.2'); const [dfb, setDfb] = useState('66');
  const [srmrText, setSrmrText] = useState(''); const [resid, setResid] = useState('');
  const srmrFromResid = useMemo(() => {
    if (!resid.trim()) return NaN;
    const rows = resid.trim().split(/\r?\n/).map((l) => l.trim().split(/[\s,;\t]+/).map(Number).filter(Number.isFinite)).filter((r) => r.length);
    const vals = rows.flatMap((r, i) => r.slice(0, i + 1));
    return vals.length ? Math.sqrt(vals.reduce((s, v) => s + v * v, 0) / vals.length) : NaN;
  }, [resid]);
  const srmr = Number.isFinite(srmrFromResid) ? srmrFromResid : n_(srmrText);
  const ok = [chi2, df, n].every((v) => Number(v) > 0) && Number(n) > 1;
  const f = ok ? V.fitIndices({ chi2: Number(chi2), df: Math.round(Number(df)), n: Math.round(Number(n)), chi2b: n_(chi2b), dfb: n_(dfb), srmr }) : null;
  const sum = f ? V.fitSummary(f) : null;
  return (
    <>
      <div className="calc-inputs">
        <Num label="Model χ²" value={chi2} onChange={setChi2} step={0.1} />
        <Num label="Model df" value={df} onChange={setDf} />
        <Num label="Sample size n" value={n} onChange={setN} />
        <Num label="Baseline χ²" value={chi2b} onChange={setChi2b} step={0.1} hint="Independence (null) model, for CFI and TLI." />
        <Num label="Baseline df" value={dfb} onChange={setDfb} hint="p(p − 1)/2 for p items." />
        <Num label="SRMR (if reported)" value={srmrText} onChange={setSrmrText} step={0.001} />
        <Area label="Or paste standardised residuals (lower triangle) to compute SRMR" value={resid} onChange={setResid} rows={4} wrap="off" hint="Residual correlations, observed minus model-implied, one row per item, diagonal included." />
      </div>
      {!f ? <Problem>Enter χ², df (at least 1) and n.</Problem> : (
        <>
          <Result big={`RMSEA ${num(f.rmsea, 3)}`} label={`90% CI ${num(f.rmseaLo, 3)} to ${num(f.rmseaHi, 3)}`} />
          <FitTable f={f} />
          {Number.isFinite(srmrFromResid) && <p className="svs-note">SRMR computed from {resid.trim().split(/\r?\n/).length} rows of residuals.</p>}
          <StudySummary {...sum} />
        </>
      )}
    </>
  );
}

// ── Scale validity ──
function SurveystatsValidity() {
  const [mode, setMode] = useState('raw');
  return (
    <div className="svs-root">
      <Choice label="What you have" value={mode} onChange={setMode} options={[['raw', 'Raw item data'], ['loadings', 'Loadings from a paper or CFA'], ['fit', 'CFA fit indices from χ²']]} />
      {mode === 'raw' ? <RawMode /> : mode === 'loadings' ? <LoadingsMode /> : <FitMode />}
      <Stats rows={[['Convergent validity', 'CR ≥ .70, AVE ≥ .50'], ['Discriminant validity', '√AVE > correlations; HTMT < .85 (strict) or .90'], ['Fit (Hu & Bentler 1999)', 'CFI, TLI ≥ .95; RMSEA ≤ .06; SRMR ≤ .08']]} />
      <About method="convergent-and-discriminant-validity-cr-ave-fornell-larcker-htmt" links={[['fit-indices-cfi-rmsea-srmr', 'Fit indices'], ['coefficient-h-maximal-reliability', 'Coefficient H'], ['cfa-confirmatory-factor-analysis', 'Confirmatory factor analysis'], ['validated-scale-construction', 'Validated scale construction']]}>
        <p><b>Convergent validity.</b> From the standardised loadings λ of a construct's k items: <b>composite reliability</b> CR = (Σλ)² / ((Σλ)² + Σ(1 − λ²)) (Jöreskog 1971), the reliability of the sum score when items differ in quality; <b>average variance extracted</b> AVE = Σλ²/k (Fornell &amp; Larcker 1981), the share of the items' variance the construct explains; <b>coefficient H</b> = 1 / (1 + 1/Σ(λ²/(1 − λ²))) (Hancock &amp; Mueller 2001), the reliability of the best-weighted composite, which is never below CR. Usual minimums: CR .70 and AVE .50.</p>
        <p><b>Discriminant validity.</b> <b>Fornell-Larcker</b>: each construct's √AVE should exceed its correlations with every other construct. <b>HTMT</b> (Henseler, Ringle &amp; Sarstedt 2015) is the mean correlation between items of two different constructs divided by the geometric mean of the mean within-construct item correlations; values at or above .85 (strict) or .90 (liberal) suggest the two constructs are not distinct. Henseler and colleagues showed by simulation that Fornell-Larcker often misses overlap that HTMT detects.</p>
        <p><b>The CFA.</b> With raw data the tool fits a confirmatory factor analysis by maximum likelihood to the item correlation matrix: each item loads on its own construct only, constructs correlate freely and have variance 1. It minimises F = ln|Σ| + tr(RΣ⁻¹) − ln|R| − p with Σ = ΛΦΛᵀ + Θ, using analytic gradients and a box-constrained quasi-Newton search (uniquenesses kept positive, correlations within ±.999). Loadings are completely standardised. χ² = (n − 1)F on p(p + 1)/2 − (2p + k(k − 1)/2) df; the baseline model has uncorrelated items, χ²_b = −(n − 1) ln|R| on p(p − 1)/2 df. SRMR is the root mean square of the residual correlations, diagonal included. Software that uses n instead of n − 1 (semopy, lavaan) gives a χ² larger by n/(n − 1).</p>
        <p><b>Fit indices.</b> RMSEA = √(max(χ² − df, 0) / (df(n − 1))) (Steiger 1990), with a 90% interval from the noncentral χ² distribution: the noncentralities λ at which χ²_obs is the 95th and 5th percentile give √(λ/(df(n − 1))). p-close tests RMSEA ≤ .05. CFI = 1 − max(χ² − df, 0) / max(χ²_b − df_b, χ² − df, 0) (Bentler 1990); TLI = (χ²_b/df_b − χ²/df) / (χ²_b/df_b − 1). Hu &amp; Bentler (1999) suggested CFI and TLI ≥ .95, RMSEA ≤ .06 and SRMR ≤ .08; Marsh, Hau &amp; Wen (2004) warn these are not golden rules.</p>
        <p>Validated against semopy (standardised loadings, construct correlations, discrepancy, CFI, TLI, RMSEA), scipy's noncentral χ² (RMSEA interval and p-close) and numpy (CR, AVE, H, HTMT) (<code>npm run check:surveystats</code>).</p>
        <p><b>When not to use it.</b> All of these assume <b>reflective</b> constructs, where the construct causes its items and the items are interchangeable. For <b>formative</b> constructs (an index whose items define it, such as features used or channels tried) low item correlations are expected and CR, AVE and HTMT do not apply. Constructs with two items are only weakly identified. With fewer than about 200 respondents the CFA and fit indices are unstable, and testing a structure on the same data that suggested it flatters the fit.</p>
      </About>
    </div>
  );
}

export default SurveystatsValidity;
