import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as A from './sensors-adoption.js';
import { fmt, pctS, toCsv } from './sensors-core.js';
import { EX_BASS } from './sensors-examples.js';
import { LinePlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import { CsvButton } from './sensors-ui.jsx';
import './sensors.css';

function BassPanel() {
  const [text, setText] = useState(EX_BASS);
  const [cum, setCum] = useState(false);
  const [horizon, setHorizon] = useState('30');
  const [unit, setUnit] = useState('week');
  const loadExample = () => { setText(EX_BASS); setCum(false); setHorizon('30'); setUnit('week'); };
  const parsed = useMemo(() => A.parseCounts(text, cum), [text, cum]);
  const rows = parsed.rows;
  const consecutive = rows.every((r, i) => r.t === rows[0].t + i) && rows.length && rows[0].t === 1;
  const fit = useMemo(() => (rows.length >= 4 && consecutive ? A.fitBass(rows.map((r) => r.t), rows.map((r) => r.v)) : null), [rows, consecutive]);
  const last = rows.length ? rows[rows.length - 1].t : 0;
  const hz = Math.max(last + 1, Math.min(500, Math.round(Number(horizon) || 0)));
  const bands = useMemo(() => (fit && Number.isFinite(fit.p) ? A.bassBands(fit, hz) : null), [fit, hz]);
  const ts = Array.from({ length: hz }, (_, i) => i + 1);
  const total = rows.reduce((s, r) => s + r.v, 0);
  let acc = 0; const obsCum = rows.map((r) => { acc += r.v; return [r.t, acc]; });
  const csv = fit ? toCsv([[unit, 'observed_new', 'fitted_new', 'fitted_cumulative', 'cumulative_low_95', 'cumulative_high_95'], ...ts.map((t) => [t, rows.find((r) => r.t === t)?.v ?? '', A.bassNew(t, [fit.p, fit.q, fit.m]).toFixed(1), (fit.m * A.bassF(t, fit.p, fit.q)).toFixed(1), bands?.cum[t] ? bands.cum[t].lo.toFixed(1) : '', bands?.cum[t] ? bands.cum[t].hi.toFixed(1) : ''])]) : '';

  return (
    <>
      <LoadExample onClick={loadExample} />
      <Area label={`Adopters per ${unit}: period number, count`} value={text} onChange={setText} rows={7} hint="Periods 1, 2, 3 … with no gaps. A header row is skipped." />
      <div className="calc-inputs ea-inputs">
        <Choice label="Counts are" value={cum} onChange={setCum} options={[[false, 'New adopters per period'], [true, 'Cumulative adopters']]} />
        <Choice label="Period" value={unit} onChange={setUnit} options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']]} />
        <Num label="Project to period" value={horizon} onChange={setHorizon} min={last + 1} max={500} step={1} />
      </div>
      {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
      {rows.length > 0 && !consecutive && <Problem>Number the periods 1, 2, 3 … without gaps.</Problem>}
      {rows.length < 4 ? <Problem>Enter at least four periods.</Problem> : fit && !Number.isFinite(fit.m) ? <Problem>The Bass model could not be fitted to these counts.</Problem> : fit && (
        <>
          <Result big={fmt(fit.m, 0)} label={`estimated eventual adopters (m); ${fmt(total, 0)} so far (${pctS(total / fit.m, 0)}), peak around ${unit} ${fmt(fit.tPeak, 1)}`} tone={A.bassConfidence(fit, last) === 'low' ? 'bad' : 'good'}>
            <Stats rows={[
              ['Innovation p (± SE)', `${fmt(fit.p, 4)} ± ${fmt(fit.se[0], 4)}`],
              ['Imitation q (± SE)', `${fmt(fit.q, 3)} ± ${fmt(fit.se[1], 3)}`],
              ['Market m (± SE)', `${fmt(fit.m, 0)} ± ${fmt(fit.se[2], 0)}`],
              ['Approximate 95% range for m', bands ? `${fmt(bands.m.lo, 0)} to ${fmt(bands.m.hi, 0)}` : '·'],
              ['Peak adoptions', `${fmt(fit.peakRate, 0)} per ${unit} around ${unit} ${fmt(fit.tPeak, 1)}`],
              ['R², RMSE', `${fmt(fit.r2, 3)}, ${fmt(fit.rmse, 1)}`],
            ]} />
          </Result>
          <div className="ea-grid2">
            <LinePlot label={`New adopters per ${unit}: observed and Bass fit`} xLabel={unit[0].toUpperCase() + unit.slice(1)} yLabel={`New adopters per ${unit}`} yMin={0}
              vlines={[{ x: fit.tPeak, label: 'peak' }]}
              series={[
                { name: 'Observed', pts: rows.map((r) => [r.t, r.v]), dots: true, width: 0.01 },
                { name: 'Bass fit and projection', pts: ts.map((t) => [t, A.bassNew(t, [fit.p, fit.q, fit.m])]) },
                ...(bands ? [{ name: '95% range', pts: ts.map((t) => [t, bands.per[t]?.lo]), dash: '4 3', width: 1.2, color: 'var(--c2)' }, { name: '95% range (high)', pts: ts.map((t) => [t, bands.per[t]?.hi]), dash: '4 3', width: 1.2, color: 'var(--c2)', hideLegend: true }] : []),
              ]} yFmt={(v) => fmt(v, 0)} />
            <LinePlot label="Cumulative adopters: observed and Bass projection" xLabel={unit[0].toUpperCase() + unit.slice(1)} yLabel="Cumulative adopters" yMin={0}
              hlines={[{ y: fit.m, label: `m = ${fmt(fit.m, 0)}` }]}
              series={[
                { name: 'Observed', pts: obsCum, dots: true, width: 0.01 },
                { name: 'Bass projection', pts: ts.map((t) => [t, fit.m * A.bassF(t, fit.p, fit.q)]) },
                ...(bands ? [{ name: '95% range', pts: ts.map((t) => [t, bands.cum[t]?.lo]), dash: '4 3', width: 1.2, color: 'var(--c2)' }, { name: '95% range (high)', pts: ts.map((t) => [t, bands.cum[t]?.hi]), dash: '4 3', width: 1.2, color: 'var(--c2)', hideLegend: true }] : []),
              ]} yFmt={(v) => fmt(v, 0)} />
          </div>
          <Table label="Projection" head={[unit[0].toUpperCase() + unit.slice(1), 'Observed new', 'Fitted new', 'Cumulative (fit)', '95% range, cumulative']}
            rows={ts.filter((t) => t <= last + 1 || t % Math.max(1, Math.round((hz - last) / 8)) === 0 || t === hz).map((t) => [t, rows.find((r) => r.t === t)?.v ?? '', fmt(A.bassNew(t, [fit.p, fit.q, fit.m]), 0), fmt(fit.m * A.bassF(t, fit.p, fit.q), 0), bands?.cum[t] ? `${fmt(bands.cum[t].lo, 0)}–${fmt(bands.cum[t].hi, 0)}` : '·'])} />
          <div className="sn-actions"><CsvButton name="bass-projection.csv" csv={csv} /></div>
          <StudySummary {...A.bassSummary(fit, rows, bands, unit)} />
        </>
      )}
    </>
  );
}

function SirPanel() {
  const [Np, setN] = useState('10000');
  const [I0, setI0] = useState('10');
  const [beta, setBeta] = useState('0.3');
  const [gamma, setGamma] = useState('0.1');
  const [days, setDays] = useState('160');
  const v = { N: Number(Np), I0: Number(I0), beta: Number(beta), gamma: Number(gamma), days: Math.round(Number(days)) };
  const valid = v.N > 0 && v.I0 > 0 && v.I0 < v.N && v.beta > 0 && v.gamma > 0 && v.days >= 1 && v.days <= 2000;
  const res = useMemo(() => (valid ? A.sir(v) : null), [valid, v.N, v.I0, v.beta, v.gamma, v.days]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Num label="Population (N)" value={Np} onChange={setN} min={1} step={100} />
        <Num label="Initial spreaders" value={I0} onChange={setI0} min={1} step={1} />
        <Num label="β: people reached per spreader per day" value={beta} onChange={setBeta} min={0.001} step={0.05} hint="invitations sent × acceptance rate, per day" />
        <Num label="γ: share of spreaders who stop per day" value={gamma} onChange={setGamma} min={0.001} step={0.01} hint="1 / days a user keeps spreading" />
        <Num label="Days" value={days} onChange={setDays} min={1} max={2000} step={10} />
      </div>
      {!valid ? <Problem>Enter a population, between 1 and N − 1 initial spreaders, positive β and γ, and up to 2,000 days.</Problem> : (
        <>
          <Result big={`R₀ = ${fmt(res.R0, 2)}`} tone={res.R0 > 1 ? 'good' : 'bad'} label={res.R0 > 1 ? `self-sustaining spread: peak ${fmt(res.peakI, 0)} active spreaders on day ${fmt(res.peakT, 0)}` : 'below 1: spread dies out without new seeding'}>
            <Stats rows={[
              ['Reached by the end (R)', `${fmt(res.final.R, 0)} (${pctS(res.final.R / v.N, 1)})`],
              ['Never reached (S)', `${fmt(res.final.S, 0)} (${pctS(res.final.S / v.N, 1)})`],
              ['Final share for a tiny seed, z = 1 − e^(−R₀z)', pctS(A.finalSize(res.R0), 1)],
              ['Days a spreader stays active, 1/γ', fmt(1 / v.gamma, 1)],
            ]} />
          </Result>
          <LinePlot label="SIR model: susceptible, active spreaders and reached over time" xLabel="Day" yLabel="People" yMin={0}
            series={[
              { name: 'Not yet reached (S)', pts: res.series.map((s) => [s.t, s.S]) },
              { name: 'Active spreaders (I)', pts: res.series.map((s) => [s.t, s.I]) },
              { name: 'Reached, no longer spreading (R)', pts: res.series.map((s) => [s.t, s.R]) },
            ]} yFmt={(x) => fmt(x, 0)} />
          <StudySummary {...A.sirSummary(res, v.N)} />
        </>
      )}
    </>
  );
}

function SensorsAdoption() {
  const [mode, setMode] = useState('bass');
  return (
    <div className="sn-root">
      <div className="calc-inputs ea-inputs">
        <Choice label="Model" value={mode} onChange={setMode} options={[['bass', 'Bass diffusion: fit my adoption counts'], ['sir', 'SIR: what-if viral spread']]} />
      </div>
      {mode === 'bass' ? <BassPanel /> : <SirPanel />}
      <About method="epidemic-models-sir-seir-for-adoption-and-virality" links={[['innovation-diffusion-analysis', 'Innovation diffusion analysis'], ['viral-coefficient-and-viral-cycle-time', 'Viral coefficient and cycle time'], ['sir-transmission-models-for-dark-pattern-spread', 'SIR models for dark-pattern spread']]}>
        <p><b>Bass diffusion</b> (Bass 1969): the share adopted by time t is F(t) = (1 − e<sup>−(p+q)t</sup>)/(1 + (q/p)e<sup>−(p+q)t</sup>), with p the coefficient of innovation (adoption from outside influence), q of imitation (word of mouth) and m the eventual number of adopters. New adopters in period t are m[F(t) − F(t − 1)]. The fit minimises Σ(n<sub>t</sub> − m[F(t) − F(t − 1)])² by Levenberg-Marquardt (Srinivasan and Mason 1986), started from Bass's discrete regression n<sub>t</sub> = a + bN<sub>t−1</sub> + cN<sub>t−1</sub>²; standard errors from s²(JᵀJ)⁻¹. Peak at t* = ln(q/p)/(p + q) with n(t*) = m(p + q)²/4q. The 95% range draws 2,000 (p, q, m) from the normal approximation to the estimates; it reflects parameter uncertainty only.</p>
        <p><b>SIR</b> (Kermack and McKendrick 1927): S′ = −βSI/N, I′ = βSI/N − γI, R′ = γI, solved by fourth-order Runge-Kutta with a 0.02-day step. R₀ = β/γ; the final share reached from a tiny seed solves z = 1 − e<sup>−R₀z</sup>.</p>
        <p><b>Checked</b> against scipy curve_fit (identical p, q, m, standard errors and SSE) and numpy least squares for the start values; SIR against scipy solve_ivp (DOP853, tolerance 1e-12) and brentq for the final size.</p>
        <p><b>When not to use it.</b> Bass needs counts of first-time adopters (not active users), a fixed market and data reaching or passing the peak; forecasts from the first few periods are unreliable. SIR is a thought experiment about rates you supply, assuming everyone can reach everyone; it is not fitted to data here.</p>
      </About>
    </div>
  );
}

export default SensorsAdoption;
