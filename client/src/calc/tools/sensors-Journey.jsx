import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as J from './sensors-journey.js';
import { fmt, pctS, fmtS, toCsv } from './sensors-core.js';
import { EX_JOURNEY } from './sensors-examples.js';
import { IntervalPlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, Bars } from './ui.jsx';
import { CsvButton, useWorkerJob } from './sensors-ui.jsx';
import './sensors.css';

function Histogram({ hist, c }) {
  const W = 620, H = 200, L = 40, R = 10, T = 10, B = 40;
  const n = hist.counts.length, mx = Math.max(...hist.counts), bw = (W - L - R) / n;
  const x0 = hist.lo, x1 = hist.lo + hist.w * n, sx = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Distribution of simulated end-to-end completion rates">
        <rect x={sx(c.lo)} y={T} width={Math.max(1, sx(c.hi) - sx(c.lo))} height={H - T - B} style={{ fill: 'var(--c1)', opacity: 0.12 }} />
        {hist.counts.map((v, i) => <rect key={i} x={L + i * bw + 1} y={T + (1 - v / mx) * (H - T - B)} width={Math.max(1, bw - 2)} height={(v / mx) * (H - T - B)} className="ea-bar" />)}
        <line x1={sx(c.mean)} x2={sx(c.mean)} y1={T} y2={H - B} className="ea-ref" />
        {[x0, (x0 + x1) / 2, x1].map((v) => <text key={v} x={sx(v)} y={H - B + 15} className="ax" textAnchor="middle">{pctS(v, 1)}</text>)}
        <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">End-to-end completion rate (shaded: 95% credible interval; dashed: mean)</text>
      </svg>
    </figure>
  );
}

function SensorsJourney() {
  const [text, setText] = useState(EX_JOURNEY);
  const [prior, setPrior] = useState(1);
  const [drawsIn, setDraws] = useState('20000');
  const [cohortIn, setCohort] = useState('1000');
  const loadExample = () => { setText(EX_JOURNEY); setPrior(1); setDraws('20000'); setCohort('1000'); };
  const parsed = useMemo(() => J.parseSteps(text), [text]);
  const draws = Math.min(200000, Math.max(1000, Math.round(Number(drawsIn) || 20000)));
  const cohort = Math.max(0, Math.round(Number(cohortIn) || 0));
  const job = parsed.steps.length ? { type: 'journey', steps: parsed.steps, opts: { draws, prior, cohort } } : null;
  const { result: sim, busy, error } = useWorkerJob(job, JSON.stringify(job), (j) => J.simulate(j.steps, j.opts));
  const steps = parsed.steps;
  const fresh = sim && sim.steps.length === steps.length && sim.steps.every((s, k) => s.name === steps[k].name);
  const exact = steps.length ? J.exactMoments(steps.map((s) => J.posterior(s, prior))) : null;
  const csv = fresh ? toCsv([['step', 'successes', 'attempts', 'rate_mean', 'rate_low_95', 'rate_high_95', 'gain_if_failures_halved', 'p_best_fix', 'median_s', 'p90_s'], ...sim.steps.map((s, k) => [s.name, steps[k].s, steps[k].n, s.mean.toFixed(4), s.lo.toFixed(4), s.hi.toFixed(4), s.gain.toFixed(4), s.pBestFix.toFixed(3), s.time ? s.time.median : '', s.time ? s.time.p90 : ''])]) : '';
  const missingTime = steps.some((s) => !Number.isFinite(s.median));

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <Area label="Steps: name, successes, attempts, median time s, 90th percentile time s" value={text} onChange={setText} rows={6} hint="Attempts = people who reached the step; successes = people who passed it. Times are optional (give both, or leave them out for every step)." wrap="off" />
      <div className="calc-inputs ea-inputs">
        <Choice label="Prior for each step's rate" value={prior} onChange={setPrior} options={[[1, 'Uniform, Beta(1, 1)'], [0.5, 'Jeffreys, Beta(½, ½)']]} />
        <Num label="Simulation draws" value={drawsIn} onChange={setDraws} min={1000} max={200000} step={5000} />
        <Num label="Forecast for a cohort of" value={cohortIn} onChange={setCohort} min={0} step={100} suffix="people" hint="0 to skip" />
      </div>
      {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
      {error && <Problem>{error}</Problem>}
      {!steps.length ? <Problem>Enter at least one step with successes and attempts.</Problem> : !fresh ? <p className="sn-busy">{busy ? 'Simulating…' : ''}</p> : (
        <>
          <Result big={pctS(sim.completion.mean, 1)} label={`forecast end-to-end completion (95% credible interval ${pctS(sim.completion.lo, 1)} to ${pctS(sim.completion.hi, 1)})`}>
            <Stats rows={[
              ['Exact mean and SD of Π p', `${pctS(exact.mean, 2)} ± ${pctS(exact.sd, 2)}`],
              ['Fix first', `${sim.steps.reduce((b, s) => (s.gain > b.gain ? s : b)).name}`],
              sim.time ? ['Time for completers: median (80% of people)', `${fmtS(sim.time.median)} (${fmtS(sim.time.lo)} to ${fmtS(sim.time.hi)})`] : null,
              sim.cohort ? [`Completers out of ${fmt(sim.cohort.n, 0)}`, `${fmt(sim.cohort.median, 0)} (95% predictive ${fmt(sim.cohort.lo, 0)} to ${fmt(sim.cohort.hi, 0)})`] : null,
              ['Draws', `${fmt(sim.draws, 0)}${busy ? ' (updating…)' : ''}`],
            ]} />
          </Result>
          {missingTime && <p className="sn-note">Some steps have no times, so end-to-end time is not simulated.</p>}
          <div className="ea-grid2">
            <Histogram hist={sim.hist} c={sim.completion} />
            <div>
              <h3 className="clu-h3">Gain in completion if a step's failures were halved</h3>
              <Bars label="Gain if failures were halved, by step" rows={[...sim.steps].sort((a, b) => b.gain - a.gain).map((s, i) => [s.name, s.gain / Math.max(...sim.steps.map((x) => x.gain)), `+${fmt(s.gain * 100, 1)} pts`, i === 0 ? 'ok' : undefined])} />
            </div>
          </div>
          <IntervalPlot label="Success rate per step with 95% credible intervals" rows={sim.steps.map((s) => ({ name: s.name, est: s.mean, lo: s.lo, hi: s.hi }))} xLabel="Step success rate (Beta posterior mean and 95% credible interval)" fmtX={(v) => pctS(v, 0)} right={(r) => `${pctS(r.est, 1)}`} rightHead="mean" />
          <Table label="Steps" head={['Step', 'Passed / reached', 'Rate (95% CrI)', 'Gain if failures halved (95% CrI)', 'Best fix in', 'Median time', '90th percentile']}
            rows={sim.steps.map((s, k) => [s.name, `${steps[k].s} / ${steps[k].n}`, `${pctS(s.mean, 1)} (${pctS(s.lo, 1)}–${pctS(s.hi, 1)})`, `+${fmt(s.gain * 100, 1)} (${fmt(s.gainLo * 100, 1)} to ${fmt(s.gainHi * 100, 1)}) pts`, pctS(s.pBestFix, 0), s.time ? fmtS(s.time.median) : '·', s.time ? fmtS(s.time.p90) : '·'])} />
          <div className="sn-actions"><CsvButton name="journey-forecast.csv" csv={csv} /></div>
          <StudySummary {...J.journeySummary(sim, steps)} />
        </>
      )}
      <About method="monte-carlo-journey-simulation" links={[['monte-carlo-simulation-for-completion-rate-forecasting', 'Monte Carlo completion-rate forecasting'], ['funnel-analysis', 'Funnel analysis']]}>
        <p><b>Step rates.</b> Each step k with s<sub>k</sub> successes out of n<sub>k</sub> attempts gets a Beta(s<sub>k</sub> + a, n<sub>k</sub> − s<sub>k</sub> + a) posterior, with a = 1 (uniform prior) or ½ (Jeffreys). <b>End to end</b>, the completion rate is the product Π p<sub>k</sub>; its exact mean is Π a<sub>k</sub>/(a<sub>k</sub> + b<sub>k</sub>) and its second moment Π a<sub>k</sub>(a<sub>k</sub> + 1)/((a<sub>k</sub> + b<sub>k</sub>)(a<sub>k</sub> + b<sub>k</sub> + 1)). The simulation draws every step's rate (Marsaglia-Tsang gamma sampler) and reports the 2.5th and 97.5th percentiles of the product as the 95% credible interval.</p>
        <p><b>Which step to fix first.</b> In each draw, the gain from halving step k's failures is (Π p / p<sub>k</sub>) × (1 − p<sub>k</sub>)/2; its average is the expected gain, and "best fix in" is the share of draws in which that step gives the largest gain. <b>Times</b> are log-normal per step with μ = ln(median) and σ = (ln p90 − ln median)/z<sub>0.90</sub>; one simulated completer's time is the sum over steps. The cohort forecast draws completers as Binomial(cohort, Π p), a posterior predictive interval. The simulation runs in a Web Worker.</p>
        <p><b>Checked</b> against 2,000,000 numpy Beta draws (completion mean, percentiles, gains, best-fix shares and time percentiles) and scipy beta.ppf for the step intervals; the exact moments match to machine precision.</p>
        <p><b>When not to use it.</b> When the same people are counted at steps they never reached, when steps are optional or can be repeated (use a Markov chain model), or when failures at different steps are strongly related (the product then understates completion). Halving failures is a yardstick, not a forecast of a redesign.</p>
      </About>
    </div>
  );
}

export default SensorsJourney;
