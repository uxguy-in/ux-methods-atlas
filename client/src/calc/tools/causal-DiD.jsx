import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as D from './causal-did.js';
import { fmt, pText, signed } from './causal-core.js';
import { LinePlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Num, Area, Pick, Result, Stats, Problem, About } from './ui.jsx';
import { PointRange } from './causal-ui.jsx';

const CELLS = [['t0', 'Treated, before'], ['t1', 'Treated, after'], ['c0', 'Comparison, before'], ['c1', 'Comparison, after']];
const str = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { m: String(v.m), s: String(v.s), n: String(v.n) }]));
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function CausalDiD() {
  const [mode, setMode] = useState('panel');
  const [conf, setConf] = useState(0.95);
  const [cells, setCells] = useState(str(D.EXAMPLE_2X2));
  const [metric2, setMetric2] = useState('Minutes to complete the report');
  const [text, setText] = useState(D.examplePanel());
  const [cols, setCols] = useState(D.EXAMPLE_COLS);
  const [start, setStart] = useState(String(D.EXAMPLE_START));
  const [metric, setMetric] = useState('Weekly active users per 100 seats');
  const [unit, setUnit] = useState('workspaces');
  const load = () => { setCells(str(D.EXAMPLE_2X2)); setMetric2('Minutes to complete the report'); setText(D.examplePanel()); setCols(D.EXAMPLE_COLS); setStart(String(D.EXAMPLE_START)); setMetric('Weekly active users per 100 seats'); setUnit('workspaces'); };

  // ── 2×2 ──
  const c2 = useMemo(() => {
    const c = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { m: num(v.m), s: num(v.s), n: num(v.n) }]));
    const bad = Object.values(c).some((v) => !Number.isFinite(v.m) || !(v.s >= 0) || !(v.n >= 2)) ? 'Every cell needs a mean, an SD of 0 or more and at least 2 people.' : null;
    return bad ? { bad } : { r: D.did2x2(c, conf) };
  }, [cells, conf]);

  // ── Panel ──
  const panel = useMemo(() => {
    if (mode !== 'panel') return null;
    const p = D.readPanel(text, cols);
    const colNames = p.tab ? p.tab.names : [];
    if (p.error) return { error: p.error, colNames };
    const s = num(start);
    if (!Number.isFinite(s)) return { error: 'Enter the first period with the treatment.', colNames };
    const r = D.panelDiD(p.rows, s, conf);
    return r.error ? { error: r.error, colNames } : { r, colNames, p };
  }, [mode, text, cols, start, conf]);
  const colOpts = (panel?.colNames || []).map((n) => [n, n]);
  const setCol = (k, v) => setCols((c) => ({ ...c, [k]: v }));
  const onPaste = (v) => { setText(v); const p = D.readPanel(v, cols); if (p.tab && p.tab.names.length >= 4 && !p.tab.names.includes(cols.y)) setCols(D.guessCols(p.tab.names)); };
  const r = panel?.r;
  const confW = `${Math.round(conf * 100)}%`;

  return (
    <div className="ca-root">
      <LoadExample onClick={load} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Data" value={mode} onChange={setMode} options={[['panel', 'Panel: one row per unit and period'], ['2x2', '2×2 table of means']]} />
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      {mode === '2x2' ? (
        <>
          <section className="ea-card">
            <h4>Group means before and after</h4>
            <p className="ca-note">Four separate samples (different people before and after). Enter each group's mean, standard deviation and number of people.</p>
            <label className="calc-field"><span>Outcome</span><input className="ea-mini wide" value={metric2} onChange={(e) => setMetric2(e.target.value)} /></label>
            <div className="ca-cells">
              {CELLS.map(([k, lab]) => (
                <div key={k} className="ca-cell">
                  <h5>{lab}</h5>
                  <div className="row">
                    {[['m', 'Mean'], ['s', 'SD'], ['n', 'n']].map(([f, fl]) => (
                      <label key={f}>{fl}<input inputMode="decimal" value={cells[k][f]} aria-label={`${lab} ${fl}`} onChange={(e) => setCells((c) => ({ ...c, [k]: { ...c[k], [f]: e.target.value } }))} /></label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
          {c2.bad && <Problem>{c2.bad}</Problem>}
          {c2.r && (
            <>
              <Result big={signed(c2.r.est, 2)} tone={c2.r.lo > 0 || c2.r.hi < 0 ? 'good' : undefined} label={`Difference-in-differences: ${confW} CI ${fmt(c2.r.lo, 2)} to ${fmt(c2.r.hi, 2)}, ${pText(c2.r.p)}`}>
                <Stats rows={[
                  ['Change in treated group', `${signed(c2.r.tChange, 2)} (SE ${fmt(c2.r.tChangeSe, 2)})`],
                  ['Change in comparison group', `${signed(c2.r.cChange, 2)} (SE ${fmt(c2.r.cChangeSe, 2)})`],
                  ['Standard error', fmt(c2.r.se, 3)],
                  ['Welch degrees of freedom', fmt(c2.r.df, 1)],
                  ['Treated after, without treatment (counterfactual)', fmt(c2.r.counterfactual, 2)],
                  ['Effect relative to counterfactual', `${signed(c2.r.rel * 100, 1)}% (${fmt(c2.r.relLo * 100, 1)}% to ${fmt(c2.r.relHi * 100, 1)}%)`],
                ]} />
              </Result>
              <LinePlot label="Group means before and after, with the treated group's counterfactual" xLabel="" yLabel={metric2} xMin={-0.15} xMax={1.15} xFmt={(v) => (v === 0 ? 'Before' : v === 1 ? 'After' : '')}
                series={[
                  { name: 'Treated', pts: [[0, num(cells.t0.m)], [1, num(cells.t1.m)]], dots: true, width: 3 },
                  { name: 'Comparison', pts: [[0, num(cells.c0.m)], [1, num(cells.c1.m)]], dots: true },
                  { name: 'Treated without treatment (parallel to comparison)', pts: [[0, num(cells.t0.m)], [1, c2.r.counterfactual]], dash: '5 4', color: 'var(--ink-3)' },
                ]} />
              <StudySummary {...D.didSummary(c2.r, { mode: '2x2', metric: metric2.toLowerCase() || 'the outcome' })} />
            </>
          )}
        </>
      ) : (
        <>
          <section className="ea-card">
            <h4>Panel data</h4>
            <Area label="One row per unit and period, with a header" value={text} onChange={onPaste} rows={7} hint="Columns: a unit id, a numeric period, a 0/1 treated-group flag and the outcome. Comma, tab or semicolon separated." />
            <div className="calc-inputs ea-inputs">
              <Pick label="Unit (clusters)" value={cols.unit} onChange={(v) => setCol('unit', v)} options={colOpts} />
              <Pick label="Period" value={cols.period} onChange={(v) => setCol('period', v)} options={colOpts} />
              <Pick label="Treated group (0/1)" value={cols.treated} onChange={(v) => setCol('treated', v)} options={colOpts} />
              <Pick label="Outcome" value={cols.y} onChange={(v) => setCol('y', v)} options={colOpts} />
              <Num label="First period with the treatment" value={start} onChange={setStart} />
              <label className="calc-field"><span>Outcome name</span><input className="ea-mini wide" value={metric} onChange={(e) => setMetric(e.target.value)} /></label>
              <label className="calc-field"><span>Units are called</span><input className="ea-mini" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
            </div>
          </section>
          {panel?.error && <Problem>{panel.error}</Problem>}
          {r && (
            <>
              <Result big={signed(r.main.est, 2)} tone={r.main.lo > 0 || r.main.hi < 0 ? 'good' : undefined} label={`Difference-in-differences (treat × post): ${confW} CI ${fmt(r.main.lo, 2)} to ${fmt(r.main.hi, 2)}, ${pText(r.main.p)}, cluster-robust by ${unit.replace(/s$/, '') || 'unit'}`}>
                <Stats rows={[
                  ['Units', `${r.Gt} treated, ${r.Gc} comparison`],
                  ['Periods', `${r.pre.length} before, ${r.post.length} after (${r.n} rows)`],
                  ['Pre-period joint test (event study)', r.preJoint ? `F(${r.preJoint.q}, ${r.preJoint.df2}) = ${fmt(r.preJoint.F, 2)}, ${pText(r.preJoint.p)}` : 'Needs two or more pre periods'],
                  ['Pre-period slope difference', r.trend ? `${signed(r.trend.b, 3)} per period, ${pText(r.trend.p)}` : 'Needs two or more pre periods'],
                  ['Effect relative to counterfactual', `${signed(r.rel * 100, 1)}%`],
                  panel.p.dropped ? ['Rows skipped (missing values)', fmt(panel.p.dropped)] : null,
                ]} />
              </Result>
              <Table label="Regression coefficients" head={['Term', 'Coefficient', 'Cluster SE', 't', 'p', `${confW} CI`]}
                rows={['Intercept (comparison, before)', 'Treated group (gap before)', 'Post period (comparison change)', 'Treated × post (DiD)'].map((t, i) => {
                  const x = r.main.rows[i]; return [i === 3 ? <b key="b">{t}</b> : t, fmt(x.b, 3), fmt(x.se, 3), fmt(x.t, 2), pText(x.p).replace('p = ', '').replace('p ', ''), `${fmt(x.lo, 2)} to ${fmt(x.hi, 2)}`];
                })} />
              <h3 className="clu-h3">Trends by group</h3>
              <LinePlot label="Mean outcome by period for each group" xLabel="Period" yLabel={metric} xFmt={(v) => (Number.isInteger(v) ? String(v) : '')}
                vlines={[{ x: r.start - 0.5, label: 'Treatment starts' }]}
                series={[
                  { name: `Treated (${panel.p.treatedLabel})`, pts: r.means.map((m) => [m.period, m.t]), dots: true, width: 3 },
                  { name: `Comparison (${panel.p.controlLabel})`, pts: r.means.map((m) => [m.period, m.c]), dots: true },
                  { name: 'Treated without treatment (comparison trend)', pts: r.means.filter((m) => m.period >= r.ref).map((m) => { const g = r.means.find((x) => x.period === r.ref); return [m.period, m.c + g.t - g.c]; }), dash: '5 4', color: 'var(--ink-3)' },
                ]} />
              <h3 className="clu-h3">Event study: gap between groups relative to period {r.ref}</h3>
              <PointRange label="Event-study coefficients with confidence intervals" xLabel="Period" yLabel="Treated − comparison, vs reference" vline={r.start - 0.5} vlineLabel="Start"
                pts={r.event.map((e) => ({ x: e.period, y: e.b, lo: e.lo, hi: e.hi, hollow: e.ref, post: !e.pre }))} />
              <p className="ca-note">Before the start the points should sit around zero with no trend (parallel trends); after it they show the effect period by period. The hollow point is the reference period, fixed at zero.</p>
              <StudySummary {...D.didSummary(r, { mode: 'panel', unit: unit || 'units', metric: metric.toLowerCase() || 'the outcome' })} />
            </>
          )}
        </>
      )}
      <About method="difference-in-differences-did" links={[['staggered-adoption-did-and-event-study', 'Staggered adoption DiD and event study'], ['cluster-robust-standard-errors', 'Cluster-robust standard errors'], ['interrupted-time-series-its', 'Interrupted time series'], ['synthetic-control-method', 'Synthetic control'], ['pre-post-release-comparison-with-confound-checklist', 'Pre-post release comparison'], ['causal-inference-methods', 'Causal inference methods']]}>
        <p><b>Idea.</b> Compare how much the treated group changed with how much a comparison group changed over the same time. The comparison group's change stands in for what would have happened anyway, so DiD = (treated after − treated before) − (comparison after − comparison before). It removes fixed differences between the groups and shocks that hit both.</p>
        <p><b>2×2 table.</b> With four independent samples, SE = √(s²_T0/n_T0 + s²_T1/n_T1 + s²_C0/n_C0 + s²_C1/n_C1), which equals the HC2 robust standard error of the interaction in OLS; the interval uses Welch-Satterthwaite degrees of freedom. Checked against statsmodels OLS with HC2 errors.</p>
        <p><b>Panel regression.</b> y = β₀ + β₁·treat + β₂·post + β₃·treat×post + e, with β₃ the DiD. Standard errors are cluster-robust by unit (CR1: the sandwich (X′X)⁻¹ Σ_g X_g′e_g e_g′X_g (X′X)⁻¹ × G/(G − 1) × (N − 1)/(N − K)), with t tests on G − 1 degrees of freedom, as statsmodels OLS with cov_type='cluster'. Repeated measurements of the same unit are correlated, which is why clustering matters (Bertrand, Duflo and Mullainathan 2004).</p>
        <p><b>Checking parallel trends.</b> The event study replaces post with one treat × period term per period (period dummies for common shocks), relative to the last period before the start. Pre-period coefficients near zero support parallel trends; their joint Wald F test (cluster-robust) and a linear test of different pre-period slopes (y ~ treat + period + treat×period on the pre periods) are shown. All checked against statsmodels.</p>
        <p><b>When not to use it.</b> When the groups were already on different trajectories before the change, when the treated group was picked because it was doing unusually badly (it will bounce back anyway), when something else changed for one group at the same time, or when units adopted the change at different dates (use a staggered-adoption estimator). With fewer than about 20 units, cluster-robust errors are too small; treat p-values as optimistic.</p>
      </About>
    </div>
  );
}

export default CausalDiD;
