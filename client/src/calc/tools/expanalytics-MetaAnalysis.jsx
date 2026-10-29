import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as X from './expanalytics-meta.js';
import { IntervalPlot, Table } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Stats, Problem, About, num, pv, pct } from './ui.jsx';

// Example: inline validation vs validation on submit, form completion time (seconds; lower is better), with setting.
const UX_SAMPLE = `# study, type, values…, moderator   (group 1 = inline validation, group 2 = on submit)
Ali 2019, means, 62.4, 18.1, 24, 71.0, 20.3, 24, Lab
Brooks 2019, means, 55.1, 15.2, 30, 60.8, 16.9, 31, Lab
Chen 2020, means, 48.9, 21.5, 120, 53.2, 22.4, 118, Remote
Diaz 2020, d, -0.62, 16, 16, Lab
Evans 2021, means, 70.2, 25.0, 45, 74.9, 24.1, 44, Remote
Fischer 2021, g, -0.35, 40, 42, Lab
Gupta 2022, means, 39.8, 12.9, 210, 41.1, 13.4, 205, Remote
Hansen 2022, es, -0.48, 0.21, Lab
Ito 2023, means, 66.0, 19.5, 18, 75.3, 21.0, 18, Lab
Jones 2023, means, 51.7, 17.8, 160, 53.0, 18.2, 158, Remote
Kowal 2024, d, -0.15, 90, 88, Remote
Lee 2024, means, 58.3, 20.0, 12, 70.1, 19.4, 12, Lab`;
// metafor's dat.bcg (Colditz et al. 1994): TB cases among vaccinated and unvaccinated, with treatment allocation.
const BCG = `# study, type, events (vaccinated), n (vaccinated), events (control), n (control), allocation
Aronson 1948, props, 4, 123, 11, 139, random
Ferguson & Simes 1949, props, 6, 306, 29, 303, random
Rosenthal et al 1960, props, 3, 231, 11, 220, random
Hart & Sutherland 1977, props, 62, 13598, 248, 12867, random
Frimodt-Moller et al 1973, props, 33, 5069, 47, 5808, alternate
Stein & Aronson 1953, props, 180, 1541, 372, 1451, alternate
Vandiviere et al 1973, props, 8, 2545, 10, 629, random
TPT Madras 1980, props, 505, 88391, 499, 88391, random
Coetzee & Berjak 1968, props, 29, 7499, 45, 7277, random
Rosenthal et al 1961, props, 17, 1716, 65, 1665, systematic
Comstock et al 1974, props, 186, 50634, 141, 27338, systematic
Comstock & Webster 1969, props, 5, 2498, 3, 2341, systematic
Comstock et al 1976, props, 27, 16913, 29, 17854, systematic`;

function FunnelPlot({ studies, filled, center, metric }) {
  const W = 560, H = 340, L = 56, R = 16, T = 14, B = 42;
  const all = [...studies, ...filled];
  const ses = all.map((s) => Math.sqrt(s.vi)), maxSe = Math.max(...ses) * 1.08;
  const xs = all.map((s) => s.yi), span = Math.max(...xs.map((x) => Math.abs(x - center)), 1.96 * maxSe) * 1.1;
  const a = center - span, b = center + span;
  const sx = (x) => L + ((x - a) / (b - a)) * (W - L - R), sy = (se) => T + (se / maxSe) * (H - T - B);
  const ticks = [a, center - span / 2, center, center + span / 2, b];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label="Funnel plot of effect sizes against standard errors">
      <polygon points={`${sx(center)},${sy(0)} ${sx(center - 1.96 * maxSe)},${sy(maxSe)} ${sx(center + 1.96 * maxSe)},${sy(maxSe)}`} style={{ fill: 'var(--bg-soft)', stroke: 'var(--line)' }} />
      <line x1={sx(center)} x2={sx(center)} y1={sy(0)} y2={sy(maxSe)} className="ea-ref" />
      {[0, maxSe / 2, maxSe].map((s) => <text key={s} x={L - 6} y={sy(s) + 4} className="ax" textAnchor="end">{num(s, 2)}</text>)}
      {ticks.map((t) => <text key={t} x={sx(t)} y={H - B + 16} className="ax" textAnchor="middle">{num(t, 2)}</text>)}
      {studies.map((s, i) => <circle key={`s${i}`} cx={sx(s.yi)} cy={sy(Math.sqrt(s.vi))} r={4.5} style={{ fill: 'var(--c1)' }}><title>{s.study}</title></circle>)}
      {filled.map((s, i) => <circle key={`f${i}`} cx={sx(s.yi)} cy={sy(Math.sqrt(s.vi))} r={4.5} style={{ fill: 'var(--bg)', stroke: 'var(--c2)', strokeWidth: 2 }}><title>{s.study}</title></circle>)}
      <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">{X.METRICS[metric].name} (shaded: pseudo 95% limits around the fixed-effect estimate)</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Standard error</text>
    </svg>
  );
}

// ── Meta-analysis ──
function ExpMetaAnalysis() {
  const [text, setText] = useState(UX_SAMPLE);
  const [metric, setMetric] = useState('smd');
  const [method, setMethod] = useState('reml');
  const [hk, setHk] = useState(false);
  const [est, setEst] = useState('L0');
  const parsed = useMemo(() => X.parseStudies(text), [text]);
  const prep = useMemo(() => X.prepare(parsed.rows, metric), [parsed, metric]);
  const S = prep.studies;
  const ok = S.length >= 2;
  const res = useMemo(() => {
    if (!ok) return null;
    const opts = { method, hk };
    const r = X.pool(S, opts), eg = X.egger(S), tf = S.length >= 3 ? X.trimFill(S, { model: 'random', method, estimator: est }) : null;
    const loo = S.length >= 3 ? X.leaveOneOut(S, opts) : [];
    const sub = X.subgroups(S, opts);
    return { r, eg, tf, loo, sub };
  }, [ok, S, method, hk, est]);
  const M = X.METRICS[metric], isRatio = metric === 'logor' || metric === 'logrr';
  const show = (v) => num(M.back(v), isRatio ? 2 : 3);
  const load = (t, m) => { setText(t); setMetric(m); setMethod('reml'); setHk(false); setEst('L0'); };
  return (
    <>
      <div className="tl-row">
        <button type="button" className="btn ghost small" onClick={() => load(UX_SAMPLE, 'smd')}>Load example (UX studies)</button>
        <button type="button" className="btn ghost small" onClick={() => load(BCG, 'logrr')}>Load the BCG trials (metafor dat.bcg)</button>
      </div>
      <div className="calc-inputs ea-inputs">
        <Area label="One study per line: name, type, numbers, optional moderator" value={text} onChange={setText} rows={10}
          hint="Types: means (mean1, SD1, n1, mean2, SD2, n2) · props (events1, n1, events2, n2) · d or g (value, n1, n2) · r (r, n) · es (effect, SE, already on the chosen metric). Group 1 is the new design or treatment. A last word (Lab, Remote…) is the moderator." />
        <Pick label="Common metric" value={metric} onChange={setMetric} options={[['smd', "Standardised mean difference (Hedges' g)"], ['logor', 'Log odds ratio'], ['logrr', 'Log risk ratio (event counts only)'], ['z', "Fisher's z (correlations)"]]} />
        <Choice label="τ² estimator" value={method} onChange={setMethod} options={[['dl', 'DerSimonian-Laird'], ['reml', 'REML'], ['pm', 'Paule-Mandel']]} />
        <Choice label="Hartung-Knapp" value={hk} onChange={setHk} options={[[false, 'Off'], [true, 'On']]} />
        <Choice label="Trim-and-fill estimator" value={est} onChange={setEst} options={[['L0', 'L0'], ['R0', 'R0']]} />
      </div>
      {(parsed.bad.length > 0 || prep.skipped.length > 0) && <Problem>{parsed.bad.length > 0 && `Could not read lines ${parsed.bad.slice(0, 8).join(', ')} (check the type and the number of values). `}{prep.skipped.length > 0 && `Left out ${prep.skipped.map((s) => `${s.study} (${s.why})`).slice(0, 5).join(', ')}.`}</Problem>}
      {!res ? <Problem>Enter at least two studies.</Problem> : (
        <>
          <Result big={`${M.backName} ${show(res.r.random.est)}`} tone={res.r.random.lo > 0 || res.r.random.hi < 0 ? 'good' : ''} label={`Random effects, 95% CI ${show(res.r.random.lo)} to ${show(res.r.random.hi)}; I² = ${num(res.r.i2 * 100, 0)}%; ${res.r.k} studies`}>
            <p>Prediction interval {res.r.k > 2 ? `${show(res.r.pi.lo)} to ${show(res.r.pi.hi)}` : 'needs 3 or more studies'}. Fixed effect: {show(res.r.fixed.est)} ({show(res.r.fixed.lo)} to {show(res.r.fixed.hi)}).{isRatio && ' Values are back-transformed from the log scale.'}{metric === 'z' && ' Values are back-transformed to r.'}</p>
          </Result>
          <h3 className="clu-h3">Forest plot ({M.name})</h3>
          <IntervalPlot label="Forest plot of study effects with pooled estimates" xLabel={`${M.name}${isRatio ? ' (0 = no difference)' : ''}; squares sized by random-effects weight`} refX={0} refLabel="No effect"
            leftHead="Study" rightHead="Estimate [95% CI]   Weight"
            right={(row) => (row.kind === 'pred' ? `[${num(row.lo, 2)}, ${num(row.hi, 2)}]` : `${num(row.est, 2)} [${num(row.lo, 2)}, ${num(row.hi, 2)}]${row.w !== undefined ? `  ${pct(row.w, 1)}` : ''}`)}
            rows={[
              ...S.map((s, i) => ({ name: s.study, est: s.yi, lo: s.yi - 1.96 * Math.sqrt(s.vi), hi: s.yi + 1.96 * Math.sqrt(s.vi), size: Math.sqrt(res.r.weightsR[i] / Math.max(...res.r.weightsR)), w: res.r.weightsR[i], color: 'var(--c1)' })),
              { name: 'Fixed effect', kind: 'diamond', est: res.r.fixed.est, lo: res.r.fixed.lo, hi: res.r.fixed.hi, color: 'var(--ink-3)' },
              { name: `Random effects${res.r.hk ? ' (HK)' : ''}`, kind: 'diamond', est: res.r.random.est, lo: res.r.random.lo, hi: res.r.random.hi, color: 'var(--c2)' },
              ...(res.r.k > 2 ? [{ name: 'Prediction interval', kind: 'pred', est: res.r.random.est, lo: res.r.pi.lo, hi: res.r.pi.hi, color: 'var(--c2)' }] : []),
            ]} />
          <Stats rows={[
            ['Random effects', `${num(res.r.random.est, 4)} (SE ${num(res.r.random.se, 4)}), ${res.r.hk ? `t(${res.r.random.df})` : 'z'} = ${num(res.r.random.stat, 3)}, p ${pv(res.r.random.p)}`],
            ['Fixed effect', `${num(res.r.fixed.est, 4)} (SE ${num(res.r.fixed.se, 4)}), p ${pv(res.r.fixed.p)}`],
            ['Q (heterogeneity)', `Q(${res.r.df}) = ${num(res.r.Q, 3)}, p ${pv(res.r.pQ)}`],
            ['τ² (95% CI, Q-profile)', `${num(res.r.tau2, 4)} (${num(res.r.tau2CI[0], 4)} to ${num(res.r.tau2CI[1], 4)})`],
            ['I² (95% CI)', `${num(res.r.i2 * 100, 1)}% (${num(res.r.i2CI[0] * 100, 1)}% to ${num(res.r.i2CI[1] * 100, 1)}%)`],
            ['H²', num(res.r.h2, 2)],
            ['Prediction interval (t, k − 2 df)', res.r.k > 2 ? `${num(res.r.pi.lo, 3)} to ${num(res.r.pi.hi, 3)}` : 'n/a'],
            ['Prediction interval (z, as metafor)', `${num(res.r.piZ.lo, 3)} to ${num(res.r.piZ.hi, 3)}`],
          ]} />
          {res.tf && (
            <>
              <h3 className="clu-h3">Publication bias</h3>
              <div className="ea-grid2">
                <FunnelPlot studies={S} filled={res.tf.filled} center={res.r.fixed.est} metric={metric} />
                <Stats rows={[
                  res.eg && ["Egger's test (intercept)", `${num(res.eg.intercept, 3)}, t(${res.eg.df}) = ${num(res.eg.t, 3)}, p ${pv(res.eg.p)}`],
                  res.eg && ['Limit estimate (slope)', `${num(res.eg.limit, 3)} (${num(res.eg.limitLo, 3)} to ${num(res.eg.limitHi, 3)})`],
                  ['Trim-and-fill', `${res.tf.k0} missing on the ${res.tf.side} (SE ${num(res.tf.se, 2)})`],
                  ['Adjusted estimate', `${num(res.tf.est.est, 4)} (${num(res.tf.est.lo, 3)} to ${num(res.tf.est.hi, 3)}); ${M.backName} ${show(res.tf.est.est)}`],
                ]} />
              </div>
              <p className="tl-note">Hollow points are the studies trim-and-fill imputes as missing. With fewer than 10 studies both checks have little power.</p>
              <h3 className="clu-h3">Leave one out</h3>
              <Table label="Leave-one-out sensitivity" head={['Left out', 'Estimate', '95% CI', 'p', 'I²', 'τ²']} rows={res.loo.map((l) => ({ cls: (l.lo > 0 || l.hi < 0) !== (res.r.random.lo > 0 || res.r.random.hi < 0) ? 'tl-cell-bad' : '', cells: [l.study, show(l.est), `${show(l.lo)} to ${show(l.hi)}`, pv(l.p), `${num(l.i2 * 100, 0)}%`, num(l.tau2, 4)] }))} />
            </>
          )}
          {res.sub && (
            <>
              <h3 className="clu-h3">Subgroups by moderator</h3>
              <Table label="Subgroup analysis" head={['Moderator', 'k', 'Estimate', '95% CI', 'τ²', 'I²']} rows={res.sub.groups.map((g) => [g.level, g.k, show(g.est), `${show(g.lo)} to ${show(g.hi)}`, num(g.tau2, 4), `${num(g.i2 * 100, 0)}%`])} />
              <p className="tl-note">Test of subgroup differences: Q_between({res.sub.df}) = {num(res.sub.Qb, 3)}, p {pv(res.sub.p)}{res.sub.untagged ? `; ${res.sub.untagged} studies have no moderator value and are left out of this test` : ''}.</p>
            </>
          )}
          <StudySummary {...X.metaSummary({ r: res.r, metric, eg: res.eg, tf: res.tf, loo: res.loo, sub: res.sub, studies: S })} />
        </>
      )}
      <About method="meta-analysis-of-ux-studies" links={[['publication-bias-diagnosis-and-adjustment', 'Publication bias'], ['vote-counting-procedures', 'Vote-counting procedures'], ['psychometric-meta-analysis-hunter-schmidt-artifact-correction', 'Psychometric meta-analysis'], ['ux-systematic-review-and-meta-analysis', 'Systematic review and meta-analysis'], ['effect-size-calculation', 'Effect size calculation']]}>
        <p><b>Common metric</b> (Borenstein, Hedges, Higgins and Rothstein 2009, <i>Introduction to Meta-Analysis</i>, ch. 4–7). Means: d = (m₁ − m₂)/s_pooled, V_d = (n₁ + n₂)/(n₁n₂) + d²/(2(n₁ + n₂)); Hedges' g = J·d with J = 1 − 3/(4df − 1) and V_g = N/(n₁n₂) + g²/(2(N − 3.94)) (the Cochrane Handbook and RevMan formula, as statsmodels and PythonMeta); effects converted from odds ratios or correlations use J²V_d. Event counts: log OR = ln(ad/bc), V = 1/a + 1/b + 1/c + 1/d, or log RR with V = 1/a − 1/n₁ + 1/c − 1/n₂, adding 0.5 to every cell of a study with a zero. Correlations: z = atanh(r), V = 1/(n − 3). Conversions: d = ln OR·√3/π; d = 2r/√(1 − r²); r = d/√(d² + (n₁ + n₂)²/(n₁n₂)). <b>Vote-counting</b> (counting significant studies) is not used: it ignores effect sizes and loses power as studies are added. Hunter-Schmidt <b>psychometric</b> corrections for unreliability or range restriction are not applied automatically: correct each effect first and enter it with its SE as type es.</p>
        <p><b>Pooling.</b> Fixed effect: weights 1/vᵢ. Random effects: weights 1/(vᵢ + τ²), with τ² from DerSimonian-Laird (moment estimator), REML (Fisher scoring) or Paule-Mandel (generalised Q = k − 1). Hartung-Knapp replaces the SE by √(Σw*(yᵢ − μ)²/((k − 1)Σw*)) with t on k − 1 df. Q = Σwᵢ(yᵢ − μ_FE)² on k − 1 df; I² = τ²/(τ² + s²) with the typical within-study variance s² (equal to (Q − df)/Q for DerSimonian-Laird); the τ² and I² intervals use the Q-profile method (Viechtbauer 2007). Prediction interval: μ ± t·√(τ² + SE²), with t on k − 2 df (Higgins, Thompson and Spiegelhalter 2009); metafor's default uses z, shown too.</p>
        <p><b>Publication bias.</b> Egger's test regresses yᵢ/SEᵢ on 1/SEᵢ; a non-zero intercept means small studies show different effects (Egger et al. 1997). Trim-and-fill (Duval and Tweedie 2000) estimates the number of missing studies k₀ with L0 = (4S_r − k(k + 1))/(2k − 1) or R0 = γ* − 1, iterates trimming and re-estimating, then mirrors the trimmed studies around the centre. <b>Subgroups</b> fit a separate random-effects model per moderator level and test Q_between on G − 1 df. Values reproduce metafor's published output for dat.bcg (REML: −0.7145, SE 0.1798, τ² 0.3132 [0.1197, 1.1115], I² 92.22%; trim-and-fill k₀ = 1 right, −0.6571) and dat.egger2001 (Egger t = −3.1783, p = 0.0073), and statsmodels' combine_effects: <code>npm run check:expanalytics</code>.</p>
        <p><b>When not to use it.</b> Do not pool studies that measure different things or use incompatible designs just because numbers are available. With fewer than 5 studies τ² is very uncertain, and with fewer than 10 the bias checks are weak. A meta-analysis of biased studies gives a precise biased answer.</p>
      </About>
    </>
  );
}

export default ExpMetaAnalysis;
