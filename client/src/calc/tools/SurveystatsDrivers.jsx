import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as K from './surveystatsDrivers.js';
import { corrMatrix, mean, sdev } from './surveystatsMath.js';
import { numericData, isNumericCol, exampleDrivers, isMissing } from './surveystatsData.js';
import { Choice, Num, Pick, Result, Stats, Problem, About, Bars, num, pct, pv } from './ui.jsx';
import { DataBox, ColumnTable, useColumns, useJob, runJob, QuadrantPlot, ResidualPlot, Matrix, short } from './surveystatsUi.jsx';

const OUTCOME_RX = /recommend|nps|overall|satisf|likelihood|loyal|intent/i;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const QTAG = { fix: 'fix', keep: 'promote', low: '', overkill: 'opp' };

// ── Key driver analysis ──
function SurveystatsDrivers() {
  const [text, setText] = useState(exampleDrivers);
  const { table, cols, setType } = useColumns(text);
  const outcomeOk = (c) => isNumericCol(c) || (c.type === 'nominal' && c.distinct === 2);
  const outcomes = cols.filter(outcomeOk);
  const [outName, setOutName] = useState('');
  const out = outcomes.find((c) => c.name === outName) || outcomes.find((c) => OUTCOME_RX.test(c.name)) || outcomes[0];
  const [model, setModel] = useState('linear');
  const binaryOnly = out && !isNumericCol(out);
  const mdl = binaryOnly ? 'logistic' : model;
  const outVals = useMemo(() => (out && isNumericCol(out) ? table.rows.map((r) => Number(r[out.index])).filter(Number.isFinite) : []), [out, table]);
  const outMax = outVals.length ? Math.max(...outVals) : 1, outMin = outVals.length ? Math.min(...outVals) : 0;
  const [cutText, setCutText] = useState('');
  const cut = cutText !== '' && Number.isFinite(Number(cutText)) ? Number(cutText) : outMax === 10 && outMin >= 0 ? 9 : outMax;
  const [yesLevel, setYesLevel] = useState('');
  const yesLv = binaryOnly ? (out.levels.includes(yesLevel) ? yesLevel : out.levels[out.levels.length - 1]) : null;
  const [picked, setPicked] = useState(null);
  const eligible = (c) => isNumericCol(c) && c.name !== out?.name;
  const defaults = cols.filter((c) => eligible(c) && !OUTCOME_RX.test(c.name)).map((c) => c.name);
  const drivers = (picked || defaults).filter((nm) => cols.some((c) => c.name === nm && eligible(c)));
  const toggle = (nm) => setPicked((p) => { const cur = p || defaults; return cur.includes(nm) ? cur.filter((x) => x !== nm) : [...cur, nm]; });
  const [impMethod, setImpMethod] = useState('rw');

  const data = useMemo(() => {
    if (!out) return { error: 'Paste data with an outcome column and at least two driver columns.' };
    if (drivers.length < 2) return { error: 'Tick at least two driver columns.' };
    if (drivers.length > 20) return { error: 'Use at most 20 drivers; group or drop some first.' };
    const nd = numericData(table, cols, drivers);
    let y = [], keep = [];
    nd.used.forEach((ri, i) => {
      const raw = table.rows[ri][out.index];
      if (isMissing(raw)) return;
      if (binaryOnly) { y.push(String(raw).trim() === yesLv ? 1 : 0); keep.push(i); return; }
      const v = Number(String(raw).trim()); if (!Number.isFinite(v)) return;
      y.push(mdl === 'logistic' ? (v >= cut ? 1 : 0) : v); keep.push(i);
    });
    const X = keep.map((i) => nd.X[i]), n = y.length, p = drivers.length;
    if (n < p + 10) return { error: `Only ${n} complete responses for ${p} drivers; you need far more (at least 10 per driver).` };
    const flat = nd.names.filter((_, j) => sdev(X.map((r) => r[j])) === 0);
    if (flat.length) return { error: `${flat.join(', ')} has the same rating from everyone; untick it.` };
    if (mdl === 'logistic') { const k = y.reduce((a, b) => a + b, 0); if (k < 5 || n - k < 5) return { error: `Only ${Math.min(k, n - k)} respondents in the smaller outcome group; logistic regression needs more of both.` }; }
    else if (sdev(y) === 0) return { error: 'The outcome has the same value for everyone.' };
    return { y, X, n, p, names: nd.names, dropped: table.rows.length - n };
  }, [out, drivers.join('|'), table, cols, mdl, cut, yesLv, binaryOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = useMemo(() => {
    if (data.error) return null;
    const { y, X, names } = data, colsX = names.map((_, j) => X.map((r) => r[j]));
    const R = corrMatrix([y, ...colsX]), Rxx = R.slice(1).map((r) => r.slice(1)), rxy = R.slice(1).map((r) => r[0]);
    const means = colsX.map(mean), corrs = K.driverCorrelations(y, colsX);
    if (mdl === 'logistic') { const lg = K.logistic(y, X), o = K.ols(y, X); return { lg, vif: o.error ? names.map(() => NaN) : o.vif, means, corrs, Rxx, rxy }; }
    const o = K.ols(y, X); if (o.error) return { error: o.error };
    return { o, rw: K.relativeWeights(Rxx, rxy), vif: o.vif, means, corrs, Rxx, rxy };
  }, [data, mdl]);
  const key = data.error || !fit || fit.error ? null : `${mdl}|${hash(text)}|${data.names.join('|')}|${cut}|${yesLv}`;
  const dom = useJob(key, () => (mdl === 'logistic' ? runJob('logitDominance', { y: data.y, X: data.X }, () => K.logisticDominance(data.y, data.X)) : runJob('olsDominance', { Rxx: fit.Rxx, rxy: fit.rxy }, () => K.olsDominance(fit.Rxx, fit.rxy))));
  const D = dom.result;
  const useDom = mdl === 'logistic' || impMethod === 'dom';
  const imp = !fit || fit.error ? null : useDom ? (D ? D.share : null) : fit.rw.share;
  const ipa = imp ? K.ipa(data.names, fit.means, imp) : null;
  const fitVal = fit && !fit.error ? (mdl === 'logistic' ? fit.lg.mcFadden : fit.o.r2) : NaN;
  const outLabel = mdl === 'logistic' ? (binaryOnly ? `${out.name} = ${yesLv}` : `${out.name} ≥ ${cut}`) : out?.name;
  const sum = ipa ? K.driverSummary({ outcome: outLabel, names: data.names, imp, method: useDom ? 'dominance analysis' : "Johnson's relative weights", fit: fitVal, vif: fit.vif, n: data.n, quads: ipa.points, logisticFit: mdl === 'logistic' }) : null;
  const maxV = fit && !fit.error ? Math.max(...fit.vif) : 0;

  return (
    <div className="svs-root">
      <DataBox text={text} setText={(t) => { setText(t); setPicked(null); setOutName(''); }} examples={[['Load example survey', exampleDrivers]]} />
      {cols.length > 0 && (
        <>
          <div className="calc-inputs">
            {outcomes.length > 0 && <Pick label="Outcome" value={out?.name || ''} onChange={(v) => { setOutName(v); setPicked(null); }} options={outcomes.map((c) => [c.name, c.name])} />}
            {!binaryOnly && <Choice label="Model" value={model} onChange={setModel} options={[['linear', 'Rating (linear regression)'], ['logistic', 'Yes or no (logistic)']]} />}
            {mdl === 'logistic' && !binaryOnly && <Num label="Counts as yes when the outcome is at least" value={cutText === '' ? String(cut) : cutText} onChange={setCutText} hint={outMax === 10 ? 'On a 0–10 likelihood-to-recommend scale, 9 makes a promoter.' : undefined} />}
            {binaryOnly && <Pick label="Which answer counts as yes" value={yesLv} onChange={setYesLevel} options={out.levels.map((l) => [l, l])} />}
            {mdl === 'linear' && <Choice label="Importance for the grid" value={impMethod} onChange={setImpMethod} options={[['rw', 'Relative weights'], ['dom', 'Dominance (Shapley)']]} />}
          </div>
          <ColumnTable table={table} cols={cols} setType={setType} pick={{ label: 'Driver', selected: drivers, toggle, eligible }} />
        </>
      )}
      {data.error ? <Problem>{data.error}</Problem> : fit?.error ? <Problem>{fit.error}</Problem> : (
        <>
          {mdl === 'linear' ? (
            <Result big={`R² = ${num(fit.o.r2)}`} label={`The ${data.p} drivers explain ${pct(fit.o.r2)} of the variation in ${out.name} (adjusted R² ${num(fit.o.adjR2)})`} tone={fit.o.Fp < 0.05 ? 'good' : ''}>
              <p>F({data.p}, {fit.o.df}) = {num(fit.o.F)}, p {pv(fit.o.Fp)}; residual SD {num(fit.o.sigma)}; n = {data.n}{data.dropped ? ` (${data.dropped} rows with missing answers left out)` : ''}.</p>
            </Result>
          ) : (
            <Result big={`McFadden R² = ${num(fit.lg.mcFadden)}`} label={`Logistic regression of ${outLabel} (${data.y.reduce((a, b) => a + b, 0)} yes of ${data.n})`}>
              <p>Log-likelihood {num(fit.lg.ll, 1)} against {num(fit.lg.ll0, 1)} with no drivers; likelihood-ratio χ²({data.p}) = {num(2 * (fit.lg.ll - fit.lg.ll0), 1)}.{fit.lg.separated ? ' Warning: the model did not converge cleanly (a driver may separate yes from no perfectly), so odds ratios are unreliable.' : ''}</p>
            </Result>
          )}
          {maxV >= 5 && <Problem>Multicollinearity: {data.names.filter((_, j) => fit.vif[j] >= 5).join(', ')} {maxV >= 10 ? 'have VIF of 10 or more' : 'have VIF of 5 or more'}. Their individual coefficients are unstable and can even flip sign; rely on the relative weights or dominance shares, which share overlapping variance fairly.</Problem>}
          {imp ? (
            <>
              <h3 className="clu-h3">Importance (share of {mdl === 'logistic' ? 'McFadden R²' : 'R²'}{useDom ? ', dominance analysis' : ", Johnson's relative weights"})</h3>
              <Bars label="Driver importance" rows={[...data.names.keys()].sort((a, b) => imp[b] - imp[a]).map((j) => [data.names[j], imp[j] / Math.max(...imp), pct(imp[j], 1), ipa.points[j].quad === 'fix' ? 'bad' : ''])} />
              <h3 className="clu-h3">Importance and performance</h3>
              <QuadrantPlot points={ipa.points} mx={ipa.mx} my={ipa.my} xLabel="Performance: mean rating" yLabel="Derived importance" qLabels={K.QUAD} />
              <p className="svs-note">Lines at the average importance ({pct(ipa.my, 1)}) and the average rating ({num(ipa.mx)}), so quadrants are relative to these drivers (Martilla &amp; James 1977).</p>
            </>
          ) : <p className="svs-note">Running dominance analysis ({data.p <= K.MAX_EXACT ? `${2 ** data.p} subsets` : 'sampled orderings'})…</p>}
          <div className="clu-scroll"><table className="clu-table clu-num svs-table">
            <thead><tr><th>Driver</th><th>Mean</th><th>r with outcome</th>{mdl === 'linear' ? <><th>Std β [95% CI]</th><th>p</th></> : <><th>Odds ratio [95% CI]</th><th>p</th></>}<th>VIF</th>{mdl === 'linear' && <th>Relative weight</th>}<th>Dominance</th><th>Quadrant</th></tr></thead>
            <tbody>{data.names.map((nm, j) => (
              <tr key={nm}><td title={nm}>{short(nm, 26)}</td><td>{num(fit.means[j])}</td><td>{num(fit.corrs[j].r)}</td>
                {mdl === 'linear' ? <><td>{num(fit.o.beta[j])} <small>[{num(fit.o.betaLo[j])}, {num(fit.o.betaHi[j])}]</small></td><td>{pv(fit.o.pv[j + 1])}</td></> : <><td>{num(fit.lg.or[j + 1])} <small>[{num(fit.lg.orLo[j + 1])}, {num(fit.lg.orHi[j + 1])}]</small></td><td>{pv(fit.lg.pv[j + 1])}</td></>}
                <td className={fit.vif[j] >= 10 ? 'bad' : fit.vif[j] >= 5 ? 'warn' : ''}>{num(fit.vif[j], 2)}</td>
                {mdl === 'linear' && <td>{num(fit.rw.raw[j], 3)} <small>{pct(fit.rw.share[j], 1)}</small></td>}
                <td>{D ? <>{num(D.general[j], 3)} <small>{pct(D.share[j], 1)}</small></> : '…'}</td>
                <td>{ipa ? <span className={`qtag ${QTAG[ipa.points[j].quad]}`}>{K.QUAD[ipa.points[j].quad]}</span> : ''}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="svs-note">{mdl === 'linear' ? 'Standardised β is the change in the outcome, in SDs, for a one-SD higher rating with the other drivers held constant. Relative weights and dominance split R² between drivers and add up to it.' : 'Odds ratios are per one-point higher rating with other drivers held constant. Dominance splits McFadden R² between drivers.'}{D && !D.exact ? ` More than ${K.MAX_EXACT} drivers: dominance is estimated from ${D.perms} random orderings.` : ''}</p>
          {mdl === 'linear' && (
            <details className="calc-about"><summary>Diagnostics: residuals and driver correlations</summary>
              <ResidualPlot fitted={fit.o.fitted} resid={fit.o.resid} />
              <p className="svs-note">Residuals should scatter evenly around zero. A funnel shape means the error grows with the outcome; stripes are normal for whole-number ratings; a curve means a driver's effect is not straight-line.</p>
              <Matrix names={data.names} M={fit.Rxx} lower label="Correlations between drivers" />
            </details>
          )}
          {sum && <StudySummary {...sum} />}
        </>
      )}
      <About method="key-driver-analysis-regression-based" links={[['dominance-analysis-for-the-relative-importance-of-predictors', 'Dominance analysis'], ['importance-performance-analysis', 'Importance-performance analysis'], ['random-forest-key-driver-analysis', 'Random forest key drivers'], ['shap-driver-analysis', 'SHAP driver analysis'], ['multiple-regression', 'Multiple regression'], ['logistic-regression-for-binary-outcomes', 'Logistic regression'], ['regression-diagnostics', 'Regression diagnostics']]}>
        <p><b>Regression.</b> Ordinary least squares with an intercept: b = (XᵀX)⁻¹Xᵀy, standard errors from s²(XᵀX)⁻¹ with s² = SSE/(n − p − 1), t-tests and 95% intervals on n − p − 1 df, R² = 1 − SSE/SST, adjusted R² = 1 − (1 − R²)(n − 1)/(n − p − 1). Standardised β = b·s_x/s_y (its interval is the b interval rescaled the same way). <b>VIF</b>ⱼ = 1/(1 − R²ⱼ), R²ⱼ from regressing driver j on the others; above 5 coefficients become unstable, above 10 they are unreliable.</p>
        <p><b>Relative importance.</b> Drivers of satisfaction are correlated (a halo), so regression coefficients understate some drivers and can even flip sign. <b>Johnson's (2000) relative weights</b> replace the drivers by their closest uncorrelated versions: with R_xx = QΛQᵀ, Λ* = R_xx^½ = QΛ^½Qᵀ, β* = Λ*⁻¹r_xy and weight εⱼ = Σₖ Λ*ⱼₖ² β*ₖ². <b>Dominance analysis</b> (Budescu 1993; Azen &amp; Budescu 2003) fits every subset of drivers; a driver's <b>general dominance</b> is its average gain in R² when added, first averaged within each subset size and then across sizes. That is exactly the Shapley value of R² (the same idea behind SHAP), so the shares add up to R². With up to 12 drivers all 2^p subsets are used; beyond that the Shapley value is estimated from 2,000 random orderings. Both run on the correlation matrix, so they are on the standardised scale.</p>
        <p><b>Yes or no outcomes.</b> Logistic regression by iteratively reweighted least squares; odds ratios with Wald intervals; <b>McFadden's R²</b> = 1 − ln L/ln L₀. Dominance analysis on McFadden's R² fits a logistic regression for every subset of drivers (in a background thread). McFadden's R² runs lower than OLS R²: .2 to .4 is a good fit (McFadden 1979).</p>
        <p><b>Importance-performance grid</b> (Martilla &amp; James 1977): derived importance against the mean rating, split at the average of each. High importance and low rating: <b>Fix first</b>. High and high: <b>Keep up</b>. Low importance, low rating: <b>Low priority</b>. Low importance, high rating: <b>Possible overkill</b>.</p>
        <p>Validated against statsmodels (OLS coefficients, SEs, p-values, intervals, R², F, VIF; Logit coefficients, SEs and McFadden R²), the relativeImp package (relative weights), and numpy enumeration of all subsets (dominance on R² and on McFadden R²) (<code>npm run check:surveystats</code>). With uncorrelated drivers both methods reduce to each driver's r², as Johnson (2000) and Budescu (1993) note.</p>
        <p><b>When not to use it.</b> Derived importance is correlational: it shows what goes together with the outcome in this sample, not what would change it. It needs roughly 10 to 20 respondents per driver, drivers measured on comparable scales, and an outcome that is not part of the drivers (an "overall" item next to its own components inflates everything). Random forest and SHAP drivers capture curves and interactions but need far more data and are not computed here; this tool is the linear version.</p>
      </About>
    </div>
  );
}

export default SurveystatsDrivers;
