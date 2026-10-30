import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as BL from './causal-brandlift.js';
import { fmt, pctS, pp } from './causal-core.js';
import { IntervalPlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Num, Area, Result, Stats, Problem, About, pv } from './ui.jsx';
import './causal.css';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function CausalBrandLift() {
  const [text, setText] = useState(BL.EXAMPLE);
  const [conf, setConf] = useState(0.95);
  const [reach, setReach] = useState('2400000');
  const [plan, setPlan] = useState({ p0: '25', delta: '3', power: 0.8, k: '1', m: '5' });
  const load = () => { setText(BL.EXAMPLE); setConf(0.95); setReach('2400000'); setPlan({ p0: '25', delta: '3', power: 0.8, k: '1', m: '5' }); };
  const setP = (k, v) => setPlan((x) => ({ ...x, [k]: v }));

  const parsed = useMemo(() => BL.parseQuestions(text), [text]);
  const r = useMemo(() => (parsed.rows.length ? BL.brandLift(parsed.rows, conf, num(reach) > 0 ? num(reach) : NaN) : null), [parsed, conf, reach]);
  const confW = `${Math.round(conf * 100)}%`;
  const alpha = 1 - conf;

  const ss = useMemo(() => BL.sampleSize({ p0: num(plan.p0) / 100, delta: num(plan.delta) / 100, alpha, power: plan.power, k: num(plan.k), m: Math.max(1, Math.round(num(plan.m))) }), [plan, alpha]);
  const planBad = !(num(plan.k) > 0) ? 'The control-to-exposed ratio must be above zero.' : !ss ? 'Enter a baseline between 0% and 100% and a lift that keeps the exposed rate below 100%.' : null;
  const mdlNow = r && num(plan.k) > 0 ? BL.mdl({ p0: r.rows[0].p0, n1: r.rows[0].n1, alpha, power: plan.power, k: r.rows[0].n0 / r.rows[0].n1, m: r.rows.length }) : NaN;

  return (
    <div className="ca-root">
      <LoadExample onClick={load} />
      <section className="ea-card">
        <h4>Survey results by question</h4>
        <Area label="One line per question: name, exposed yes, exposed asked, control yes, control asked" value={text} onChange={setText} rows={7} hint="Comma or tab separated; a header line is optional. Count the top-box or 'yes' answers." />
        <div className="calc-inputs ea-inputs">
          <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
          <Num label="Campaign reach (people, optional)" value={reach} onChange={setReach} min={0} step={10000} hint="Turns lifts into numbers of people" />
        </div>
      </section>
      {parsed.errors.map((e) => <Problem key={e}>{e}</Problem>)}
      {!parsed.rows.length && <Problem>Enter at least one question with counts for both groups.</Problem>}
      {r && (
        <>
          {(() => {
            const sig = r.rows.filter((x) => x.sig);
            const top = [...(sig.length ? sig : r.rows)].sort((a, b) => b.d - a.d)[0];
            return (
              <Result big={`${sig.length} of ${r.rows.length}`} tone={sig.length ? 'good' : undefined} label={`questions with a lift that holds after Holm's correction (α = ${fmt(alpha, 2)}); ${sig.length ? 'largest' : 'largest observed'}: ${top.name} ${pp(top.d)}`}>
                <Stats rows={[
                  ['Exposed vs control (first question)', `${fmt(r.rows[0].n1)} vs ${fmt(r.rows[0].n0)} respondents`],
                  ['Smallest lift this sample could detect', Number.isFinite(mdlNow) ? `${pp(mdlNow)} at a ${pctS(r.rows[0].p0, 0)} baseline (${Math.round(plan.power * 100)}% power, Bonferroni over ${r.rows.length})` : 'Not available'],
                ]} />
              </Result>
            );
          })()}
          <IntervalPlot label={`Absolute lift by question with ${confW} intervals`} xLabel="Lift (percentage points)" refX={0} fmtX={(v) => `${+(v * 100).toFixed(1)}`}
            rows={r.rows.map((x) => ({ name: x.name, est: x.d, lo: x.lo, hi: x.hi, color: x.sig ? 'var(--c1)' : 'var(--ink-3)', size: 0.4 }))} right={(row) => pp(row.est)} rightHead="Lift" />
          <Table label="Lift by question" head={['Question', 'Exposed', 'Control', 'Absolute lift', `${confW} CI`, 'Relative lift', `${confW} CI`, 'p', 'Holm p', ...(Number.isFinite(r.reach) ? ['People (reach × lift)'] : [])]}
            rows={r.rows.map((x) => [x.name, pctS(x.p1, 1), pctS(x.p0, 1), pp(x.d), `${pp(x.lo)} to ${pp(x.hi)}`, `${fmt(x.rel * 100, 1)}%`, `${fmt(x.rlo * 100, 1)}% to ${fmt(x.rhi * 100, 1)}%`, pv(x.p), <span key="h" className={`ca-chip ${x.sig ? 'ok' : ''}`}>{pv(x.pHolm)}</span>, ...(Number.isFinite(r.reach) ? [`${fmt(x.people)} (${fmt(x.peopleLo)} to ${fmt(x.peopleHi)})`] : [])])} />
          <StudySummary {...BL.liftSummary(r)} />
        </>
      )}
      <section className="ea-card">
        <h4>Plan the next study</h4>
        <div className="calc-inputs ea-inputs">
          <Num label="Control rate (%)" value={plan.p0} onChange={(v) => setP('p0', v)} min={0} max={100} step={1} />
          <Num label="Smallest lift worth detecting (points)" value={plan.delta} onChange={(v) => setP('delta', v)} step={0.5} />
          <Choice label="Power" value={plan.power} onChange={(v) => setP('power', v)} options={[[0.8, '80%'], [0.9, '90%']]} />
          <Num label="Control per exposed respondent" value={plan.k} onChange={(v) => setP('k', v)} min={0.1} step={0.1} />
          <Num label="Questions tested" value={plan.m} onChange={(v) => setP('m', v)} min={1} step={1} />
        </div>
        {planBad ? <Problem>{planBad}</Problem> : (
          <Stats rows={[
            ['Exposed respondents', fmt(ss.n1)],
            ['Control respondents', fmt(ss.n0)],
            ['Total', fmt(ss.total)],
            ['Significance level per question', `${fmt(ss.alphaEach, 4)} (${fmt(alpha, 2)} ÷ ${Math.max(1, Math.round(num(plan.m)))}, Bonferroni, a safe bound for Holm)`],
          ]} />
        )}
      </section>
      <About method="brand-lift-and-drag-measurement" links={[['brand-awareness-attitude-and-usage-survey', 'Brand awareness, attitude and usage survey'], ['multiple-comparisons-correction', 'Multiple comparisons correction'], ['statistical-power-analysis', 'Statistical power analysis'], ['media-use-and-exposure-measurement', 'Media use and exposure measurement']]}>
        <p><b>Idea.</b> A brand lift study asks the same questions of people who saw a campaign (exposed) and a matched or randomised group who did not (control). The lift is the exposed rate minus the control rate, for each question.</p>
        <p><b>Intervals.</b> Absolute lift p₁ − p₀ uses Newcombe's hybrid score interval (1998, method 10), built from the Wilson intervals of each rate: lower = d − √((p₁ − l₁)² + (u₀ − p₀)²), upper = d + √((u₁ − p₁)² + (p₀ − l₀)²). Relative lift p₁/p₀ − 1 uses the log risk-ratio interval exp(ln RR ± z·√(1/x₁ − 1/n₁ + 1/x₀ − 1/n₀)) − 1. The test is the pooled two-proportion z test. Checked against statsmodels (confint_proportions_2indep with methods newcomb and log, proportions_ztest).</p>
        <p><b>Several questions.</b> Testing five questions at α = 0.05 gives a much higher chance of at least one false lift. Holm's step-down method (1979) controls that family-wise error: sort the p-values, multiply the i-th smallest by (m − i + 1), and keep the running maximum. Checked against statsmodels multipletests(method='holm').</p>
        <p><b>Sample size.</b> Exposed n₁ = [z(1 − α′/2)·√(p̄q̄(1 + 1/k)) + z(power)·√(p₁q₁ + p₀q₀/k)]² / Δ², with p̄ = (p₁ + k·p₀)/(1 + k), k control per exposed respondent and α′ = α/m (Bonferroni, which is never smaller than Holm needs). The detectable lift solves the same formula for Δ. Checked against statsmodels and the closed form.</p>
        <p><b>When not to use it.</b> When the control group was not randomised or matched (people who see an ad differ from those who do not, so the lift mixes in targeting), when exposed and control were surveyed at different times, or for behaviour (sales, sign-ups), which is better measured with a conversion holdout.</p>
      </About>
    </div>
  );
}

export default CausalBrandLift;
