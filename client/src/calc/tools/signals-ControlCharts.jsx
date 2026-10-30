import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './signals-spc.js';
import { LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pv, sig, n_ } from './ui.jsx';

const EXAMPLES = { x: [C.exampleX, 26, 27], p: [C.exampleP, 23, 24], u: [C.exampleU, 17, 18] };
const LABEL = { x: 'One point per line: label, value', p: 'One point per line: label, count with the event, sample size', u: 'One point per line: label, event count, exposure (for example thousands of orders)' };

// ── Control charts, change points and interrupted time series ──
function SignalsControlCharts() {
  const [type, setType] = useState('x');
  const [text, setText] = useState(() => C.exampleX());
  const [base, setBase] = useState('26');
  const [rules, setRules] = useState('we');
  const [T0, setT0] = useState('27');
  const [k, setK] = useState('0.5');
  const [h, setH] = useState('5');
  const [pen, setPen] = useState('2');
  const load = (t = type) => { const [f, b, c] = EXAMPLES[t]; setText(f()); setBase(String(b)); setT0(String(c)); };
  const changeType = (t) => { setType(t); load(t); };
  const parsed = useMemo(() => C.parseSeries(text, type), [text, type]);
  const t0 = Math.round(n_(T0));
  const opts = { base: Math.round(n_(base)) || 0, rules, T0: t0 > 0 ? t0 : 0, k: n_(k), h: n_(h), penMult: n_(pen) };
  const okOpts = opts.k >= 0 && opts.h > 0 && opts.penMult > 0;
  const a = useMemo(() => (okOpts ? C.analyse(parsed.pts, type, opts) : null), [parsed, type, JSON.stringify(opts), okOpts]);
  const pc = type === 'p' ? 100 : 1;
  const f = (v) => (type === 'p' ? `${num(v * 100, 2)}%` : sig(v, 4));
  const yl = type === 'p' ? 'Rate (%)' : type === 'u' ? 'Rate per unit of exposure' : 'Value';
  return (
    <>
      <LoadExample onClick={() => load()}>Load example for this chart</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Choice label="Chart" value={type} onChange={changeType} options={[['x', 'XmR (individual values)'], ['p', 'p-chart (proportions)'], ['u', 'u-chart (rates)']]} />
        <Choice label="Run rules" value={rules} onChange={setRules} options={[['we', 'Western Electric'], ['nelson', 'Nelson (8 rules)']]} />
      </div>
      <div className="calc-inputs sg-inputs">
        <Area label={LABEL[type]} value={text} onChange={setText} rows={8} hint={type === 'x' ? 'Use XmR for any one number per period: a satisfaction score, median task time, a conversion rate from a stable traffic level.' : type === 'p' ? 'Use a p-chart when each point is x out of n (sessions with an error, tasks failed).' : 'Use a u-chart for counts per unit of exposure (contacts per 1,000 orders, crashes per 10,000 sessions).'} />
      </div>
      <div className="calc-inputs sg-inputs">
        <Num label="Limits from the first" value={base} onChange={setBase} min={0} suffix="points" hint="0 = all points. Use the period before a change so the limits describe the old process." />
        <Num label="First point after the change" value={T0} onChange={setT0} min={0} hint="Point number (1 = first) for the interrupted time series; 0 = none." />
        <Num label="CUSUM k" value={k} onChange={setK} step="0.1" suffix="σ" />
        <Num label="CUSUM h" value={h} onChange={setH} step="0.5" suffix="σ" />
        <Num label="Change-point penalty" value={pen} onChange={setPen} step="0.5" suffix="× σ² ln n" hint="2 is the BIC penalty; larger finds fewer change points." />
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 10).join(', ')}: {type === 'x' ? 'each line needs a number' : 'each line needs a count and a sample size above 0 (count ≤ n for a p-chart)'}.</Problem>}
      {!okOpts ? <Problem>CUSUM k must be 0 or more, and h and the penalty above 0.</Problem> : !a ? <Problem>Enter at least 8 points.</Problem> : (
        <>
          <Result big={a.rules.any ? 'Special-cause signal' : 'No special cause'} tone={a.rules.any ? 'bad' : 'good'} label={`${a.n} points; centre ${f(a.lim.center)}${type === 'x' ? `, limits ${f(a.lim.rows[0].lcl)} to ${f(a.lim.rows[0].ucl)}` : ''}; limits from ${a.lim.base} points`}>
            <p>{a.rules.any ? `${a.rules.byPoint.filter((b) => b.length).length} points break a run rule (red). ` : ''}{a.binseg.cuts.length ? `${a.binseg.cuts.length} change point${a.binseg.cuts.length > 1 ? 's' : ''} in the mean (dashed steps). ` : ''}{a.cusum.first >= 0 ? `CUSUM first signals at ${a.lim.rows[a.cusum.first].label}.` : 'CUSUM does not signal.'}</p>
          </Result>
          <h3 className="clu-h3">{type === 'x' ? 'Individuals chart' : type === 'p' ? 'p-chart' : 'u-chart'}</h3>
          <LinePlot label="Control chart with centre line, 3-sigma limits and signals" height={290}
            series={[
              { name: 'Value', pts: a.lim.rows.map((r) => [r.i + 1, r.x * pc]), dots: true, color: 'var(--c1)', dotColor: (j) => (a.rules.byPoint[j].length ? 'var(--bad)' : 'var(--c1)') },
              { name: 'Upper limit', pts: a.lim.rows.map((r) => [r.i + 1, r.ucl * pc]), step: type !== 'x', color: 'var(--bad)', dash: '6 3', width: 1.4 },
              { name: 'Lower limit', pts: a.lim.rows.map((r) => [r.i + 1, r.lcl * pc]), step: type !== 'x', color: 'var(--bad)', dash: '6 3', width: 1.4, hideLegend: true },
              { name: 'Centre', pts: a.lim.rows.map((r) => [r.i + 1, r.center * pc]), color: 'var(--ok)', width: 1.4 },
              ...(a.binseg.cuts.length ? [{ name: 'Segment means', pts: a.binseg.segments.flatMap((s) => [[s.from + 0.6, s.mean * pc], [s.to + 1.4, s.mean * pc]]), color: 'var(--c3)', dash: '3 3', width: 2 }] : []),
            ]}
            vlines={opts.T0 ? [{ x: opts.T0 - 0.5, label: 'change' }] : []}
            xLabel="Point" yLabel={yl} xFmt={(v) => String(v)} yFmt={(v) => String(+v.toPrecision(4))} />
          {type === 'x' && (
            <>
              <h3 className="clu-h3">Moving range chart</h3>
              <LinePlot label="Moving range chart" height={200} series={[{ name: 'Moving range', pts: a.lim.rows.slice(1).map((r) => [r.i + 1, r.mr]), dots: true, color: 'var(--c1)', dotColor: (j) => (r => (r.mr > a.lim.mrUcl ? 'var(--bad)' : 'var(--c1)'))(a.lim.rows[j + 1]) }]}
                hlines={[{ y: a.lim.mrUcl, label: `UCL ${sig(a.lim.mrUcl, 3)}`, cls: 'sg-lim' }, { y: a.lim.mrbar, label: `MR̄ ${sig(a.lim.mrbar, 3)}`, cls: 'sg-mid' }]} yMin={0} xMin={1} xMax={a.n} xLabel="Point" yFmt={(v) => String(+v.toPrecision(3))} legend={false} />
            </>
          )}
          <h3 className="clu-h3">Tabular CUSUM</h3>
          <LinePlot label="CUSUM of standardised values" height={210} series={[{ name: 'C⁺ (upward shift)', pts: a.cusum.up.map((v, i) => [i + 1, v]) }, { name: 'C⁻ (downward shift)', pts: a.cusum.dn.map((v, i) => [i + 1, v]) }]}
            hlines={[{ y: a.cusum.h, label: `h = ${a.cusum.h}`, cls: 'sg-lim' }]} yMin={0} xLabel="Point" yLabel="Cumulative sum (σ)" />
          {a.its && (
            <>
              <h3 className="clu-h3">Interrupted time series</h3>
              <LinePlot label="Segmented regression with the pre-change trend projected" height={260}
                series={[
                  { name: 'Observed', pts: a.lim.rows.map((r) => [r.i + 1, r.x * pc]), dots: true, line: false, color: 'var(--c1)' },
                  { name: 'Fitted', pts: a.its.fit.fitted.map((v, i) => [i + 1, v * pc]).filter(([t]) => t < a.its.T0), color: 'var(--c2)' },
                  { name: 'Fitted after', pts: a.its.fit.fitted.map((v, i) => [i + 1, v * pc]).filter(([t]) => t >= a.its.T0), color: 'var(--c2)', hideLegend: true },
                  { name: 'Pre-change trend continued', pts: a.its.counterfactual.map((v, i) => [i + 1, v * pc]).filter(([t]) => t >= a.its.T0 - 1), color: 'var(--ink-3)', dash: '6 4' },
                ]}
                vlines={[{ x: a.its.T0 - 0.5, label: 'change' }]} xLabel="Point" yLabel={yl} yFmt={(v) => String(+v.toPrecision(4))} />
              <Table label="Segmented regression coefficients" head={['Term', 'Estimate', 'OLS SE', 'OLS 95% CI', 'OLS p', 'Newey-West SE', 'Newey-West 95% CI', 'Newey-West p']}
                rows={a.its.coefs.map((c) => [c.name, sig(c.b * pc, 4), sig(c.se * pc, 3), `${sig(c.lo * pc, 3)} to ${sig(c.hi * pc, 3)}`, pv(c.p), sig(c.nwSe * pc, 3), `${sig(c.nwLo * pc, 3)} to ${sig(c.nwHi * pc, 3)}`, pv(c.nwP)])} />
              <Stats rows={[['Slope after the change', `${sig(a.its.post.b * pc, 3)} per point (NW SE ${sig(a.its.post.nwSe * pc, 3)})`], ['Effect at the last point', `${sig(a.its.end.b * pc, 3)} (NW SE ${sig(a.its.end.nwSe * pc, 3)})`], ['Newey-West lags', a.its.L], ['Durbin-Watson', num(a.its.dw, 2)], ['Lag-1 residual autocorrelation', num(a.its.r1, 2)], ['R²', num(a.its.fit.r2, 3)]]} />
              {type === 'p' && <p className="tl-note">Estimates for the p-chart are in percentage points.</p>}
            </>
          )}
          {a.rules.any && (
            <>
              <h3 className="clu-h3">Points that break a rule</h3>
              <Table label="Rule signals" head={['Point', 'Label', 'Value', 'z (σ from centre)', 'Rules']}
                rows={a.lim.rows.filter((r, i) => a.rules.byPoint[i].length).map((r) => [r.i + 1, r.label, f(r.x), num(r.z, 2), a.rules.byPoint[r.i].join(', ')])} />
              <ul className="tl-defs">{C.RULES[rules].map(([id, txt]) => <li key={id}><b>Rule {id}</b>: {txt}</li>)}</ul>
            </>
          )}
          <StudySummary {...C.summary(a)} />
        </>
      )}
      <About method="statistical-process-control-control-charts" links={[['change-point-detection', 'Change-point detection'], ['interrupted-time-series-its', 'Interrupted time series'], ['multiphase-regression-with-estimated-changepoints', 'Multiphase regression with estimated changepoints']]}>
        <p><b>XmR chart.</b> Centre x̄; moving ranges MRᵢ = |xᵢ − xᵢ₋₁|; σ̂ = MR̄ / 1.128 (d₂ for n = 2); natural process limits x̄ ± 2.66 MR̄ (= 3σ̂); the moving range chart's upper limit is 3.267 MR̄ (Wheeler 2000, <i>Understanding Variation</i>; Montgomery, <i>Introduction to Statistical Quality Control</i>).</p>
        <p><b>p- and u-charts.</b> p̄ = Σxᵢ / Σnᵢ with limits p̄ ± 3√(p̄(1 − p̄)/nᵢ), floored at 0; ū = Σcᵢ / Σnᵢ with limits ū ± 3√(ū/nᵢ). Limits vary with each point's size, so run rules use the standardised value zᵢ = (xᵢ − centre) / σᵢ.</p>
        <p><b>Run rules.</b> Western Electric (1956): one point beyond 3σ; 2 of 3 beyond 2σ on one side; 4 of 5 beyond 1σ on one side; 8 in a row on one side. Nelson (1984) adds 9 in a row on one side (replacing 8), 6 in a row trending, 14 alternating, 15 within 1σ and 8 outside 1σ.</p>
        <p><b>CUSUM.</b> On zᵢ: C⁺ᵢ = max(0, zᵢ − k + C⁺ᵢ₋₁), C⁻ᵢ = max(0, −zᵢ − k + C⁻ᵢ₋₁), signal when either exceeds h. k = 0.5 and h = 5 detect a 1σ shift quickly with an in-control average run length of about 465 points (Montgomery, tabular CUSUM ARL tables).</p>
        <p><b>Change points.</b> Binary segmentation for shifts in the mean: the cost of a segment is its sum of squared deviations; the split that most reduces total cost is added while the reduction exceeds the penalty β = 2σ̂² ln n (the BIC for a mean change with known σ, Killick, Fearnhead and Eckley 2012). σ̂ is the moving-range sigma (XmR) or the average binomial/Poisson sigma. This matches ruptures.Binseg(model='l2', min_size=2, jump=1).</p>
        <p><b>Interrupted time series.</b> Segmented regression (Wagner et al. 2002): y = b₀ + b₁t + b₂Dₜ + b₃(t − T₀)Dₜ, where Dₜ = 1 from the first post-change point T₀. b₂ is the immediate level change and b₃ the change in slope. Standard errors are given two ways: plain OLS (t on n − 4 df), and Newey-West with Bartlett weights and L = ⌊4(n/100)^(2/9)⌋ lags, with normal intervals, as statsmodels OLS.fit(cov_type='HAC'). Prefer Newey-West when the Durbin-Watson value is far from 2.</p>
        <p><b>When not to use it.</b> Control charts need a process that was stable for the baseline period and points that are roughly independent; strongly seasonal or autocorrelated series (daily traffic with weekly cycles) need the seasonality removed first. Interrupted time series needs about 8 or more points on each side of the change, and cannot rule out something else that changed at the same time; add a control series when you can.</p>
      </About>
    </>
  );
}

export default SignalsControlCharts;
