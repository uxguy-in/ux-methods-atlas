import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './statsbench-core.js';
import * as G from './statsbench-regression.js';
import { REGRESSION_EXAMPLE } from './statsbench-examples.js';
import { Chart, ColumnTags } from './statsbench-ui.jsx';
import { Table } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Stats, Problem, About, num, pv } from './ui.jsx';

const DEFAULT_OUTCOME = { linear: 'satisfaction', logistic: 'renewed', ordinal: 'recommend', count: 'support_tickets' };
const MODELS = [['linear', 'Linear'], ['logistic', 'Binary logistic'], ['ordinal', 'Ordinal'], ['count', 'Counts']];
const isCount = (c) => c.numeric && c.values.every((v) => v === null || (Number.isInteger(v) && v >= 0));
const suits = (c, model, n) => {
  if (!c || (!c.numeric && c.distinct >= n * 0.9)) return false;
  if (model === 'linear') return c.numeric && c.distinct > 2;
  if (model === 'logistic') return c.distinct === 2;
  if (model === 'ordinal') return c.distinct >= 3 && c.distinct <= 12;
  return isCount(c);
};
const looksLikeId = (c, n) => !c.numeric && c.distinct >= n * 0.9;

// ── Regression workbench ──
function SbRegression() {
  const [text, setText] = useState(REGRESSION_EXAMPLE);
  const [model, setModel] = useState('linear');
  const [outcome, setOutcome] = useState('satisfaction');
  const [pick, setPick] = useState({ plan: { on: true }, tenure_months: { on: true }, ease: { on: true }, tasks_per_week: { on: true } });
  const [event, setEvent] = useState('');
  const [order, setOrder] = useState('');
  const [family, setFamily] = useState('nb');
  const [exposure, setExposure] = useState('');
  const [conf, setConf] = useState(0.95);
  const table = useMemo(() => C.parseTable(text), [text]);
  const colOf = useMemo(() => Object.fromEntries(table.cols.map((c) => [c.name, c])), [table]);
  const outCol = colOf[outcome];
  const okOutcome = suits(outCol, model, table.n);
  const changeModel = (m) => {
    setModel(m);
    if (!suits(colOf[outcome], m, table.n)) {
      const pref = colOf[DEFAULT_OUTCOME[m]] && suits(colOf[DEFAULT_OUTCOME[m]], m, table.n) ? DEFAULT_OUTCOME[m] : table.cols.find((c) => suits(c, m, table.n))?.name;
      if (pref) { setOutcome(pref); setPick((p) => ({ ...p, [pref]: { ...(p[pref] || {}), on: false } })); }
    }
  };
  const load = () => {
    setText(REGRESSION_EXAMPLE); setModel('linear'); setOutcome('satisfaction'); setFamily('nb'); setExposure(''); setEvent(''); setOrder(''); setConf(0.95);
    setPick({ plan: { on: true }, tenure_months: { on: true }, ease: { on: true }, tasks_per_week: { on: true } });
  };
  const levels = useMemo(() => {
    if (!outCol) return [];
    if (outCol.numeric) return [...new Set(outCol.values.filter((v) => v !== null))].sort((a, b) => a - b).map(String);
    return outCol.levels;
  }, [outCol]);
  const ordLevels = useMemo(() => {
    const typed = order.split(',').map((s) => s.trim()).filter(Boolean);
    return typed.length === levels.length && typed.every((t) => levels.includes(t)) ? typed : levels;
  }, [order, levels]);
  const eventLevel = levels.includes(event) ? event : levels[levels.length - 1];
  const predList = table.cols.filter((c) => c.name !== outcome && c.name !== exposure && !looksLikeId(c, table.n));
  const preds = predList.filter((c) => pick[c.name]?.on).map((c) => ({ name: c.name, type: !c.numeric || pick[c.name]?.cat ? 'cat' : 'num', ref: pick[c.name]?.ref }));

  const res = useMemo(() => {
    if (!okOutcome || !preds.length) return null;
    const extra = model === 'count' && exposure ? [exposure] : [];
    const dm = C.designMatrix(table, outcome, preds, { intercept: model !== 'ordinal', extra });
    const k = dm.names.length;
    if (dm.X.length < k + 2) return { error: `Only ${dm.X.length} complete rows for ${k} model columns; add rows or drop predictors.` };
    let fit;
    if (model === 'linear') fit = G.fitLinear(dm.X, dm.y, dm.names, conf);
    else if (model === 'logistic') fit = G.fitLogistic(dm.X, dm.y.map((v) => (String(v) === eventLevel ? 1 : 0)), dm.names, conf);
    else if (model === 'ordinal') {
      const y = dm.y.map((v) => ordLevels.indexOf(String(v)));
      fit = G.fitOrdinal(dm.X, y, dm.names, ordLevels.length, conf);
      if (fit?.error) return { error: 'Every outcome level needs at least one person in the complete rows.' };
    } else {
      const offset = exposure ? dm.rows.map((i) => colOf[exposure].values[i]) : null;
      if (offset && offset.some((v) => !(v > 0))) return { error: 'Exposure values must all be positive.' };
      fit = G.fitCount(dm.X, dm.y, dm.names, { family, offset: offset ? offset.map(Math.log) : null, conf });
    }
    if (!fit) return { error: 'The model could not be fitted: two predictor columns carry the same information (for example a category with every person in it, or a predictor that is a sum of others). Drop one.' };
    return { fit, dm };
  }, [table, outcome, okOutcome, JSON.stringify(preds), model, eventLevel, ordLevels.join('|'), family, exposure, conf]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = res?.fit, c = Math.round(conf * 100);
  const ratio = model === 'logistic' || model === 'ordinal' ? 'or' : model === 'count' ? 'irr' : null;
  const ratioName = model === 'count' ? 'IRR' : 'OR';
  const flagged = fit?.model === 'linear' ? new Set(fit.cooks.map((d, i) => (d > 4 / fit.n ? i : -1)).filter((i) => i >= 0)) : new Set();
  const id = (i) => { const idCol = table.cols.find((cc) => looksLikeId(cc, table.n)); return idCol ? idCol.values[res.dm.rows[i]] : `Row ${res.dm.rows[i] + 2}`; };
  return (
    <>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={load}>Load example (customer survey, n = 160)</button></div>
      <div className="calc-inputs sb-inputs">
        <Area label="Data table: header row, then one row per person (comma, tab or semicolon separated)" value={text} onChange={setText} rows={8} wrap="off"
          hint="Paste from a spreadsheet. Text columns are treated as categories; empty cells, NA or . are missing, and rows with a missing value in any used column are left out." />
      </div>
      <ColumnTags table={table} />
      <div className="calc-inputs sb-inputs">
        <Choice label="Model" value={model} onChange={changeModel} options={MODELS} />
        <Pick label="Outcome" value={outcome} onChange={(v) => { setOutcome(v); setEvent(''); setOrder(''); }} options={table.cols.filter((cc) => suits(cc, model, table.n) || cc.name === outcome).map((cc) => [cc.name, cc.name])} />
        {model === 'logistic' && levels.length === 2 && <Pick label="Event (coded 1)" value={eventLevel} onChange={setEvent} options={levels.map((l) => [l, l])} />}
        {model === 'count' && <Choice label="Count model" value={family} onChange={setFamily} options={[['poisson', 'Poisson'], ['nb', 'Negative binomial']]} />}
        {model === 'count' && <Pick label="Exposure (optional, for rates)" value={exposure} onChange={setExposure} options={[['', 'None'], ...table.cols.filter((cc) => cc.numeric && cc.name !== outcome).map((cc) => [cc.name, cc.name])]} />}
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      {model === 'ordinal' && levels.length > 2 && (
        <label className="calc-field wide">
          <span>Order of outcome levels, lowest first</span>
          <input className="tl-code" value={order || ordLevels.join(', ')} onChange={(e) => setOrder(e.target.value)} />
          <small>Comma-separated; must list every level exactly once. Now: {ordLevels.join(' < ')}.</small>
        </label>
      )}
      <div className="sb-card">
        <h4>Predictors</h4>
        <div className="sb-preds">
          {predList.map((cc) => {
            const st = pick[cc.name] || {}, cat = !cc.numeric || st.cat;
            const lv = cc.numeric ? [...new Set(cc.values.filter((v) => v !== null))].sort((a, b) => a - b).map(String) : cc.levels;
            return (
              <div key={cc.name} className="sb-pred">
                <label><input type="checkbox" checked={!!st.on} onChange={(e) => setPick({ ...pick, [cc.name]: { ...st, on: e.target.checked } })} />{cc.name}</label>
                <span className="sb-muted">{cc.numeric ? (st.cat ? `numeric codes as ${lv.length} categories` : 'numeric') : `${cc.levels.length} categories`}{cc.missing ? `, ${cc.missing} missing` : ''}</span>
                {cat ? (
                  <select className="select" aria-label={`Reference level for ${cc.name}`} value={lv.includes(String(st.ref)) ? String(st.ref) : lv[0]} onChange={(e) => setPick({ ...pick, [cc.name]: { ...st, ref: e.target.value } })} disabled={!st.on}>
                    {lv.slice(0, 50).map((l) => <option key={l} value={l}>Reference: {l}</option>)}
                  </select>
                ) : cc.distinct <= 12 ? (
                  <select className="select" aria-label={`Treat ${cc.name} as`} value="num" onChange={(e) => setPick({ ...pick, [cc.name]: { ...st, cat: e.target.value === 'cat' } })} disabled={!st.on}>
                    <option value="num">Numeric</option><option value="cat">Categories</option>
                  </select>
                ) : <span />}
              </div>
            );
          })}
        </div>
        {predList.some((cc) => pick[cc.name]?.cat) && <button type="button" className="btn ghost small" onClick={() => setPick(Object.fromEntries(Object.entries(pick).map(([k, v]) => [k, { ...v, cat: false }])))}>Treat all numeric columns as numbers</button>}
      </div>
      {!okOutcome ? <Problem>{outCol ? `“${outcome}” does not suit a ${model} model: ${model === 'logistic' ? 'it needs exactly two values' : model === 'ordinal' ? 'it needs 3 to 12 ordered levels' : model === 'count' ? 'it needs whole numbers of 0 or more' : 'it needs a numeric outcome'}.` : 'Choose an outcome column.'}</Problem>
        : !preds.length ? <Problem>Tick at least one predictor.</Problem>
          : res?.error ? <Problem>{res.error}</Problem> : fit && (
            <>
              {fit.model === 'linear' && (
                <Result big={`R² = ${num(fit.r2, 3)}`} tone={fit.pF < 1 - conf ? 'good' : ''} label={`Adjusted R² ${num(fit.adjR2, 3)}; F(${fit.dfModel}, ${fit.df}) = ${num(fit.F, 2)}, p ${pv(fit.pF)}; n = ${fit.n}${res.dm.dropped ? ` (${res.dm.dropped} rows with missing values left out)` : ''}`}>
                  <p>Residual SD {num(fit.sigma, 3)}. Coefficients are the change in {outcome} per unit of each predictor, holding the others constant.</p>
                </Result>
              )}
              {fit.model === 'logistic' && (
                <Result big={`${num(fit.accuracy * 100, 1)}% classified correctly`} tone={fit.pLR < 1 - conf ? 'good' : ''} label={`P(${outcome} = ${eventLevel}); LR χ²(${fit.dfModel}) = ${num(fit.lr, 2)}, p ${pv(fit.pLR)}; McFadden R² ${num(fit.mcfadden, 3)}, Nagelkerke ${num(fit.nagelkerke, 3)}; n = ${fit.n}, ${fit.events} events`}>
                  {fit.separation && <p className="calc-warn">The fit did not converge cleanly: some predictor separates the outcomes perfectly, so its odds ratio is not estimable.</p>}
                </Result>
              )}
              {fit.model === 'ordinal' && (
                <Result big={`McFadden R² = ${num(fit.mcfadden, 3)}`} tone={fit.pLR < 1 - conf ? 'good' : ''} label={`Proportional odds model for ${ordLevels.join(' < ')}; LR χ²(${fit.dfModel}) = ${num(fit.lr, 2)}, p ${pv(fit.pLR)}; n = ${fit.n}`} />
              )}
              {(fit.model === 'poisson' || fit.model === 'negbin') && (
                <Result big={`${fit.model === 'poisson' ? 'Poisson' : 'Negative binomial'}: LR χ²(${fit.dfModel}) = ${num(fit.lr, 1)}`} tone={fit.pLR < 1 - conf ? 'good' : ''} label={`p ${pv(fit.pLR)}; McFadden R² ${num(fit.mcfadden, 3)}; dispersion (Pearson χ²/df, Poisson) ${num(fit.dispersion, 2)}${fit.alpha ? `; α = ${num(fit.alpha.est, 3)}` : ''}; n = ${fit.n}`}>
                  {fit.model === 'poisson' && fit.dispersion > 1.5 && <p className="calc-warn">The counts are overdispersed ({num(fit.dispersion, 2)} times the Poisson variance): switch to negative binomial.</p>}
                </Result>
              )}
              <h3 className="clu-h3">Coefficients</h3>
              <Table label="Regression coefficients" head={fit.model === 'linear' ? ['Term', 'b', 'SE', 't', 'p', `${c}% CI`, 'Std. beta'] : ['Term', 'b', 'SE', 'z', 'p', ratioName, `${c}% CI (${ratioName})`]}
                rows={fit.coefs.map((r) => (fit.model === 'linear'
                  ? { cls: r.p < 1 - conf && r.name !== 'Intercept' ? 'tl-cell-ok' : '', cells: [r.name, num(r.b, 4), num(r.se, 4), num(r.t, 2), pv(r.p), `${num(r.lo, 3)} to ${num(r.hi, 3)}`, Number.isFinite(r.beta) ? num(r.beta, 3) : ''] }
                  : { cls: r.p < 1 - conf && r.name !== 'Intercept' ? 'tl-cell-ok' : '', cells: [r.name, num(r.b, 4), num(r.se, 4), num(r.z, 2), pv(r.p), num(r[ratio], 3), `${num(r[`${ratio}Lo`], 3)} to ${num(r[`${ratio}Hi`], 3)}`] }))} />
              {fit.model === 'ordinal' && <p className="tl-note">Cut points (log-odds scale): {fit.cuts.map((ct, i) => `${ordLevels[i]} | ${ordLevels[i + 1]} = ${num(ct.t, 3)} (SE ${num(ct.se, 3)})`).join('; ')}. Positive coefficients move people towards {ordLevels[ordLevels.length - 1]}.</p>}
              {fit.model === 'linear' && (
                <>
                  <Stats rows={[
                    ['Largest VIF', `${num(Math.max(...fit.vif.map((v) => v.vif)), 2)} (${fit.vif.reduce((a, b) => (b.vif > a.vif ? b : a)).name})`],
                    ["People with Cook's D > 4/n", `${flagged.size} of ${fit.n}`],
                    ['Breusch-Pagan (constant variance)', `χ²(${fit.bp.df}) = ${num(fit.bp.stat, 2)}, p ${pv(fit.bp.p)}`],
                    ['Durbin-Watson (row order)', num(fit.dw, 2)],
                    ['AIC / BIC', `${num(fit.aic, 1)} / ${num(fit.bic, 1)}`],
                  ]} />
                  <h3 className="clu-h3">Diagnostics</h3>
                  <div className="sb-grid2">
                    <Chart label="Residuals against fitted values" xLabel={`Fitted ${outcome}`} yLabel="Residual" height={260} hlines={[{ y: 0 }]}
                      series={[{ type: 'points', pts: fit.fitted.map((f, i) => [f, fit.resid[i], `${id(i)}: fitted ${num(f, 2)}, residual ${num(fit.resid[i], 2)}`, flagged.has(i)]) }]} />
                    <Chart label="Normal QQ plot of studentised residuals" xLabel="Normal quantile" yLabel="Studentised residual" height={260} diag
                      series={[{ type: 'points', pts: G.qqPoints(fit.stdResid) }]} />
                    <Chart label="Cook's distance by person" xLabel="Row in the complete data" yLabel="Cook's distance" height={240} hlines={[{ y: 4 / fit.n, label: '4/n' }]} yMin={0}
                      series={[{ type: 'bars', bars: fit.cooks.map((d, i) => ({ x0: i + 0.5, x1: i + 1.5, y: d })) }, { type: 'points', r: 2.6, pts: fit.cooks.map((d, i) => [i + 1, d, `${id(i)}: D = ${num(d, 3)}`, flagged.has(i)]).filter((p) => p[3]) }]} legend={false} />
                    <Chart label="Leverage against studentised residuals" xLabel="Leverage h" yLabel="Studentised residual" height={240} hlines={[{ y: 2 }, { y: -2 }]} vlines={[{ x: (2 * fit.p) / fit.n, label: '2p/n' }]}
                      series={[{ type: 'points', pts: fit.leverage.map((h, i) => [h, fit.stdResid[i], `${id(i)}: h = ${num(h, 3)}, r = ${num(fit.stdResid[i], 2)}`, flagged.has(i)]) }]} />
                  </div>
                  <p className="tl-note">Red points have Cook's distance above 4/n. Look for a curve or funnel in the residual plot and for points far off the line in the QQ plot. Hover a point to see the row.</p>
                  <Table label="Variance inflation factors" head={['Predictor column', 'VIF', 'Reading']} rows={fit.vif.map((v) => ({ cls: v.vif > 5 ? 'tl-cell-bad' : '', cells: [v.name, num(v.vif, 2), v.vif > 10 ? 'severe overlap' : v.vif > 5 ? 'high overlap' : v.vif > 2.5 ? 'some overlap' : 'fine'] }))} />
                </>
              )}
              {fit.model === 'logistic' && (
                <Table label="Classification table at a 0.5 cut-off" head={['', `Predicted ${eventLevel}`, 'Predicted other', 'Correct']} rows={[
                  [`Actual ${eventLevel}`, fit.table.tp, fit.table.fn, `${num(fit.sensitivity * 100, 1)}% (sensitivity)`],
                  ['Actual other', fit.table.fp, fit.table.tn, `${num(fit.specificity * 100, 1)}% (specificity)`],
                ]} />
              )}
              {(fit.model === 'poisson' || fit.model === 'negbin') && (
                <Stats rows={[
                  [`Mean / variance of ${outcome}`, `${num(fit.meanY, 2)} / ${num(fit.varY, 2)}`],
                  ['Zeros: observed / expected', `${fit.zeros} / ${num(fit.expectedZeros, 1)}`],
                  ['Deviance (Poisson)', `${num(fit.deviance, 1)} on ${fit.dfResid} df`],
                  fit.alpha && ['α (NB2, Var = μ + αμ²)', `${num(fit.alpha.est, 3)} (SE ${num(fit.alpha.se, 3)}); test of α = 0: p ${pv(fit.pAlpha)}`],
                  ['AIC / BIC', `${num(fit.aic, 1)} / ${num(fit.bic, 1)}`],
                ]} />
              )}
              {(fit.model === 'logistic' || fit.model === 'ordinal') && <Stats rows={[['Log-likelihood (null)', `${num(fit.ll, 2)} (${num(fit.ll0, 2)})`], ['AIC / BIC', `${num(fit.aic, 1)} / ${num(fit.bic, 1)}`], fit.model === 'ordinal' && ['Most likely category correct', `${num(fit.accuracy * 100, 1)}% (largest category alone ${num(fit.base * 100, 1)}%)`]]} />}
              <StudySummary {...G.regressionSummary(fit, { outcome, eventLabel: eventLevel, levels: ordLevels })} />
            </>
          )}
      <About method="multiple-regression" links={[['regression-analysis', 'Regression analysis'], ['regression-diagnostics', 'Regression diagnostics'], ['regression-with-assumption-checks', 'Regression with assumption checks'], ['logistic-regression-for-binary-outcomes', 'Logistic regression'], ['ordinal-regression', 'Ordinal regression'], ['poisson-and-negative-binomial-regression-for-counts-and-rates', 'Poisson and negative binomial regression']]}>
        <p><b>Linear.</b> Ordinary least squares: b = (X′X)⁻¹X′y with s² = Σe²/(n − p), SE = √diag(s²(X′X)⁻¹), t on n − p df. R² = 1 − SSE/SST, adjusted R² = 1 − (1 − R²)(n − 1)/(n − p), F = (SSR/(p − 1))/s². Standardised beta = b·SD(x)/SD(y). Categorical predictors are dummy-coded against the reference level you choose (treatment coding). Diagnostics: leverage hᵢ = xᵢ′(X′X)⁻¹xᵢ, studentised residual rᵢ = eᵢ/(s√(1 − hᵢ)), Cook's D = rᵢ²hᵢ/(p(1 − hᵢ)) (flagged above 4/n), VIF = 1/(1 − R²ⱼ) from regressing each column on the others, Breusch-Pagan (Koenker's studentised LM = n·R² of e² on X) and Durbin-Watson.</p>
        <p><b>Binary logistic.</b> logit P(y = 1) = Xb fitted by iteratively reweighted least squares; Wald SE from (X′WX)⁻¹ with W = p(1 − p); odds ratio = eᵇ with interval e^(b ± z·SE). Likelihood-ratio χ² = 2(LL − LL₀); McFadden R² = 1 − LL/LL₀, Cox-Snell = 1 − e^(2(LL₀ − LL)/n), Nagelkerke = Cox-Snell/(1 − e^(2LL₀/n)). <b>Ordinal.</b> Proportional odds: P(Y ≤ j) = logistic(θⱼ − x′b), fitted by Newton-Raphson; a positive b moves people to higher levels, and one odds ratio applies at every cut point. <b>Counts.</b> Poisson: log μ = Xb (+ log exposure), rate ratio = eᵇ, dispersion = Pearson χ²/(n − p). Negative binomial NB2: Var = μ + αμ², b and α by maximum likelihood, SE from the observed information; the test of α = 0 uses ½·P(χ²₁ > LR).</p>
        <p>Every number is checked against statsmodels (OLS, OLSInfluence, variance_inflation_factor, het_breuschpagan, Logit, OrderedModel, GLM Poisson and NegativeBinomial) on the example data: <code>npm run check:statsbench</code>.</p>
        <p><b>When not to use it.</b> Do not read coefficients as causal effects: they are associations adjusted only for the predictors you included. Avoid more than one predictor column per 10 to 20 people (or per 10 events in the smaller group for logistic). Do not use linear regression for yes/no, rating-item or count outcomes, and do not use stepwise selection to pick predictors from the same data you report.</p>
      </About>
    </>
  );
}

export default SbRegression;
