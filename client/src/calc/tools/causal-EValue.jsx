import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as E from './causal-evalue.js';
import { fmt } from './causal-core.js';
import { LinePlot, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import './causal.css';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function CausalEValue() {
  const [s, setS] = useState(E.EXAMPLE);
  const [names, setNames] = useState({ exposure: 'using the in-app guide', outcome: 'churn' });
  const [conf, setConf] = useState({ eu: '1.5', ud: '1.8' });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const load = (ex, nm) => { setS(ex); setNames(nm); };

  const r = useMemo(() => {
    const est = num(s.est), lo = num(s.lo), hi = num(s.hi);
    let se = num(s.se);
    if (s.type === 'SMD' && !Number.isFinite(se) && Number.isFinite(lo) && Number.isFinite(hi)) se = E.seFromCI(lo, hi);
    if (!Number.isFinite(est)) return { error: 'Enter the estimate.' };
    if (s.type !== 'SMD' && !(est > 0)) return { error: 'A ratio must be above zero.' };
    if (s.type !== 'SMD' && ((Number.isFinite(lo) && !(lo > 0)) || (Number.isFinite(hi) && !(hi > 0)))) return { error: 'Interval limits of a ratio must be above zero.' };
    return E.evalue({ type: s.type, est, lo, hi, se, common: s.common, trueRR: num(s.trueRR) || 1 });
  }, [s]);
  const eu = num(conf.eu), ud = num(conf.ud);
  const adj = !r.error && eu >= 1 && ud >= 1 ? E.adjustFor(r, eu, ud) : null;
  const ratio = s.type === 'SMD' ? 'd' : s.type;

  const plot = useMemo(() => {
    if (r.error) return null;
    const t = r.trueRR, pr = r.rr / t;
    const max = Math.max(4, Math.ceil(1.6 * Math.max(r.point, eu || 0, ud || 0)));
    const series = [{ name: 'Explains away the estimate', pts: E.biasCurve(pr, max), width: 3 }];
    if (Number.isFinite(r.ciE) && r.ciE > 1) series.push({ name: 'Moves the confidence limit to the null', pts: E.biasCurve(r.near / t, max), dash: '6 4' });
    series.push({ name: `E-value (${fmt(r.point, 2)}, ${fmt(r.point, 2)})`, pts: [[r.point, r.point]], dots: true, color: 'var(--c3)' });
    if (adj) series.push({ name: 'Your hypothesised confounder', pts: [[eu, ud]], dots: true, color: 'var(--c4)' });
    return { series, max };
  }, [r, eu, ud, adj]);

  return (
    <div className="ca-root">
      <div className="ca-actions">
        <LoadExample onClick={() => load(E.EXAMPLE, { exposure: 'using the in-app guide', outcome: 'churn' })} />
        <button type="button" className="btn ghost small" onClick={() => load(E.PAPER_EXAMPLE, { exposure: 'breastfeeding', outcome: 'infant death from respiratory infection' })}>Load VanderWeele and Ding's example</button>
      </div>
      <section className="ea-card">
        <h4>Your observed association</h4>
        <div className="calc-inputs ea-inputs">
          <Choice label="Measure" value={s.type} onChange={(v) => set('type', v)} options={[['RR', 'Risk ratio'], ['OR', 'Odds ratio'], ['HR', 'Hazard ratio'], ['SMD', 'Std. mean difference (d)']]} />
          {(s.type === 'OR' || s.type === 'HR') && <Choice label="Outcome by end of follow-up" value={s.common} onChange={(v) => set('common', v)} options={[[false, 'Rare (under 15%)'], [true, 'Common (15% or more)']]} />}
        </div>
        <div className="calc-inputs ea-inputs">
          <Num label={`Estimate (${ratio})`} value={s.est} onChange={(v) => set('est', v)} step={0.01} />
          <Num label="Lower 95% limit" value={s.lo} onChange={(v) => set('lo', v)} step={0.01} />
          <Num label="Upper 95% limit" value={s.hi} onChange={(v) => set('hi', v)} step={0.01} />
          {s.type === 'SMD' && <Num label="Standard error of d" value={s.se} onChange={(v) => set('se', v)} step={0.01} hint="Leave empty to work it out from the limits" />}
          <Num label="Shift the estimate to (true value)" value={s.trueRR} onChange={(v) => set('trueRR', v)} step={0.05} hint="1 = explain the association away completely" />
        </div>
        <div className="calc-inputs ea-inputs">
          <label className="calc-field"><span>Exposure (for the text)</span><input className="ea-mini wide" value={names.exposure} onChange={(e) => setNames({ ...names, exposure: e.target.value })} /></label>
          <label className="calc-field"><span>Outcome (for the text)</span><input className="ea-mini wide" value={names.outcome} onChange={(e) => setNames({ ...names, outcome: e.target.value })} /></label>
        </div>
      </section>
      {r.error && <Problem>{r.error}</Problem>}
      {!r.error && (
        <>
          <Result big={fmt(r.point, 2)} tone={(Number.isFinite(r.ciE) ? r.ciE : r.point) >= 2 ? 'good' : undefined} label={`E-value for the estimate${Number.isFinite(r.ciE) ? `; ${fmt(r.ciE, 2)} for the confidence limit` : ''}`}>
            <Stats rows={[
              ['Estimate on the risk-ratio scale', `${fmt(r.rr, 3)}${Number.isFinite(r.lo) ? ` (${fmt(r.lo, 3)} to ${fmt(r.hi, 3)})` : ''}`],
              s.type !== 'RR' ? ['Conversion', s.type === 'SMD' ? 'RR ≈ exp(0.91·d), limits exp(0.91·d ± 1.78·SE)' : s.common ? (s.type === 'OR' ? 'RR ≈ √OR (common outcome)' : 'RR ≈ (1 − 0.5^√HR)/(1 − 0.5^√(1/HR)) (common outcome)') : `RR ≈ ${s.type} (rare outcome)`] : null,
              ['E-value, estimate', fmt(r.point, 3)],
              ['E-value, confidence limit', Number.isFinite(r.ciE) ? `${fmt(r.ciE, 3)}${r.includes ? ' (interval includes the null)' : ''}` : 'Enter the limits'],
              r.trueRR !== 1 ? ['Target value', fmt(r.trueRR, 3)] : null,
            ]} />
          </Result>
          <section className="ea-card">
            <h4>Try a confounder</h4>
            <p className="ca-note">How strongly might an unmeasured factor be linked to the exposure (RR_EU: how much more common it is among the exposed) and to the outcome (RR_UD: how much it raises the outcome's risk)? The bias factor is RR_EU·RR_UD/(RR_EU + RR_UD − 1).</p>
            <div className="calc-inputs ea-inputs">
              <Num label="RR_EU (exposure–confounder)" value={conf.eu} onChange={(v) => setConf({ ...conf, eu: v })} min={1} step={0.1} />
              <Num label="RR_UD (confounder–outcome)" value={conf.ud} onChange={(v) => setConf({ ...conf, ud: v })} min={1} step={0.1} />
            </div>
            {adj && <Stats rows={[['Bias factor', fmt(adj.B, 3)], ['Most the estimate could move to', fmt(adj.rr, 3)], ['Most the interval could move to', Number.isFinite(adj.lo) ? `${fmt(adj.lo, 3)} to ${fmt(adj.hi, 3)}` : 'Enter the limits'], ['Explains it away?', (r.rr >= 1 ? adj.rr <= r.trueRR : adj.rr >= r.trueRR) ? 'Yes, the estimate' : (r.rr >= 1 ? adj.lo <= r.trueRR : adj.hi >= r.trueRR) ? 'Only the interval' : 'No']]} />}
          </section>
          {plot && (
            <>
              <h3 className="clu-h3">Bias plot</h3>
              <LinePlot label="Confounder strengths that would explain away the estimate" xLabel="RR_EU: confounder's link with the exposure" yLabel="RR_UD: confounder's link with the outcome" xMin={1} xMax={plot.max} yMin={1} yMax={plot.max} xFmt={(v) => fmt(v, 1)} yFmt={(v) => fmt(v, 1)} height={300} series={plot.series} />
              <p className="ca-note">Any confounder on or above a curve would be enough; below it, not enough. The E-value is where the solid curve crosses the diagonal (equal strength on both sides).</p>
            </>
          )}
          <StudySummary {...E.evalueSummary(r, names)} />
        </>
      )}
      <About method="sensitivity-analysis-with-the-e-value" links={[['confounder-mediator-collider-identification', 'Confounder, mediator and collider identification'], ['causal-effect-estimation-from-observational-data', 'Causal effect estimation from observational data'], ['propensity-score-matching', 'Propensity score matching'], ['causal-thinking-audit-for-research-reports', 'Causal thinking audit']]}>
        <p><b>Idea.</b> An observational comparison (users who adopted a feature vs those who did not) can be biased by things you did not measure. The E-value (VanderWeele and Ding 2017) is the minimum strength of association, on the risk-ratio scale, that an unmeasured confounder would need with both the exposure and the outcome, beyond the measured covariates, to fully explain away the observed association.</p>
        <p><b>Formula.</b> For a risk ratio RR &gt; 1, E = RR + √(RR × (RR − 1)); for RR &lt; 1 use 1/RR first. For the confidence interval, use the limit closer to 1; if the interval includes 1 the E-value is 1. To shift the estimate to a true value t instead of 1, use RR/t (VanderWeele, Ding and Mathur 2019). The bias factor of a confounder with strengths RR_EU and RR_UD is B = RR_EU·RR_UD/(RR_EU + RR_UD − 1) (Ding and VanderWeele 2016), and the curve RR_UD = RR(RR_EU − 1)/(RR_EU − RR) shows every pair that gives B = RR.</p>
        <p><b>Other measures.</b> Odds ratios: RR ≈ OR when the outcome is rare (under about 15%), RR ≈ √OR when it is common. Hazard ratios: RR ≈ HR when rare, RR ≈ (1 − 0.5^√HR)/(1 − 0.5^√(1/HR)) when common. Standardised mean differences: RR ≈ exp(0.91·d), interval exp(0.91·d ± 1.78·SE). Checked against an independent Python implementation and the paper's worked example (RR 3.9, 95% CI 1.8 to 8.7: E-values 7.26 and 3.00).</p>
        <p><b>When not to use it.</b> For randomised experiments (randomisation already deals with confounding), for bias from selection, drop-out or measurement error (the E-value does not cover them), or as a pass mark: there is no universal threshold. Compare it with the strength of the confounders you did measure.</p>
      </About>
    </div>
  );
}

export default CausalEValue;
