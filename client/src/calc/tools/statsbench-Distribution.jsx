import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './statsbench-core.js';
import * as D from './statsbench-distribution.js';
import { DISTRIBUTION_EXAMPLE } from './statsbench-examples.js';
import { Chart } from './statsbench-ui.jsx';
import { Table } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About, num, pv } from './ui.jsx';

const EXAMPLE = DISTRIBUTION_EXAMPLE.join(', ');

// ── Distribution check ──
function SbDistribution() {
  const [text, setText] = useState(EXAMPLE);
  const [unit, setUnit] = useState('s');
  const [scale, setScale] = useState('raw');
  const [bw, setBw] = useState('scott');
  const [conf, setConf] = useState(0.95);
  const raw = useMemo(() => C.parseNums(text), [text]);
  const n = raw.length, positive = n > 0 && raw.every((v) => v > 0);
  const useLog = scale === 'log' && positive;
  const xs = useMemo(() => (useLog ? raw.map(Math.log) : raw), [raw, useLog]);
  const ok = n >= 3 && n <= 5000 && new Set(raw).size > 1;
  const r = useMemo(() => {
    if (!ok) return null;
    const d = D.describe(raw, conf), sw = D.shapiroWilk(raw), ad = D.andersonDarling(raw), ks = D.lilliefors(raw, n > 1000 ? 500 : 2000);
    const ln = positive ? D.logNormal(raw, conf) : null, lad = D.ladder(raw), lam = positive ? D.boxcoxLambda(raw) : NaN;
    return { d, sw, ad, ks, ln, lad, lam };
  }, [raw, ok, positive, n, conf]);
  const view = useMemo(() => {
    if (!ok) return null;
    const h = D.bins(xs), lo = h.edges[0], hi = h.edges[h.edges.length - 1], pad = (hi - lo) * 0.08;
    const grid = Array.from({ length: 121 }, (_, i) => lo - pad + (i / 120) * (hi - lo + 2 * pad));
    const k = D.kde(xs, grid, bw), m = C.mean(xs), s = C.sd(xs);
    const normal = grid.map((g) => [g, Math.exp(-0.5 * ((g - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI))]);
    return { h, grid, k, normal, pp: D.probplot(xs), sw: useLog ? D.shapiroWilk(xs) : null };
  }, [xs, ok, bw, useLog]);
  const u = unit ? ` ${unit}` : '';
  const c = Math.round(conf * 100);
  const nonNormal = r && (r.sw.p < 0.05 || r.ad.p < 0.05);
  const load = () => { setText(EXAMPLE); setUnit('s'); setScale('raw'); setBw('scott'); setConf(0.95); };
  const best = r ? [...r.lad].sort((a, b) => b.W - a.W)[0] : null;
  return (
    <>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={load}>Load example (time on task, 40 people)</button></div>
      <div className="calc-inputs sb-inputs">
        <Area label="Values (one measure, any separators)" value={text} onChange={setText} rows={5} hint={`${n} values read. For task times, include successful attempts only.`} />
        <label className="calc-field"><span>Unit (optional)</span><input className="tl-code" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        <Choice label="Plot scale" value={scale} onChange={setScale} options={[['raw', 'Raw values'], ['log', 'Log values']]} />
        <Choice label="Density bandwidth" value={bw} onChange={setBw} options={[['scott', 'Scott'], ['silverman', 'Silverman']]} />
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      {scale === 'log' && !positive && n > 0 && <Problem>Log values need every value above 0; showing raw values.</Problem>}
      {!ok ? <Problem>Enter between 3 and 5,000 values that are not all the same.</Problem> : (
        <>
          <Result big={nonNormal ? 'Not normal' : 'No clear departure from normal'} tone={nonNormal ? 'bad' : 'good'} label={`Shapiro-Wilk W = ${num(r.sw.W, 4)}, p ${pv(r.sw.p)}; skewness ${num(r.d.G1, 2)}, excess kurtosis ${num(r.d.G2, 2)}; n = ${n}`}>
            <p>Mean {num(r.d.mean, 2)}{u}, median {num(r.d.median, 2)}{u}{r.ln ? `, geometric mean ${num(r.ln.gm, 2)}${u} (${c}% CI ${num(r.ln.lo, 2)} to ${num(r.ln.hi, 2)})` : ''}.</p>
          </Result>
          <div className="sb-grid2">
            <Chart label="Histogram with a kernel density estimate and the fitted normal curve" xLabel={useLog ? `log(value${u ? ` in${u}` : ''})` : `Value${u}`} yLabel="Density" height={260} yMin={0}
              series={[
                { type: 'bars', name: 'Histogram', bars: view.h.counts.map((k, i) => ({ x0: view.h.edges[i], x1: view.h.edges[i + 1], y: k / (n * view.h.width) })), color: 'var(--c1)' },
                { type: 'line', name: `Kernel density (h = ${num(view.k.h, 3)})`, pts: view.grid.map((g, i) => [g, view.k.y[i]]), color: 'var(--c2)' },
                { type: 'line', name: 'Normal with the same mean and SD', pts: view.normal, color: 'var(--ink-3)', dash: '5 4', width: 1.6 },
              ]} />
            <Chart label="Normal QQ plot" xLabel="Normal quantile" yLabel={useLog ? 'Ordered log values' : `Ordered values${u}`} height={260}
              series={[{ type: 'points', name: 'Values', pts: view.pp.osm.map((q, i) => [q, view.pp.osr[i], `${num(useLog ? Math.exp(view.pp.osr[i]) : view.pp.osr[i], 2)}${u}`]) }, { type: 'line', name: 'Normal line', color: 'var(--ink-3)', dash: '5 4', pts: [view.pp.osm[0], view.pp.osm[n - 1]].map((q) => [q, view.pp.intercept + view.pp.slope * q]) }]} legend={false} />
          </div>
          <p className="tl-note">On a normal QQ plot the points follow the dashed line; a curve bending upwards at the right means a long right tail (typical of task times). QQ correlation r = {num(view.pp.r, 4)}.{useLog && view.sw ? ` On the log scale Shapiro-Wilk W = ${num(view.sw.W, 4)}, p ${pv(view.sw.p)}.` : ''}</p>
          <Stats rows={[
            ['n / mean / SD', `${n} / ${num(r.d.mean, 2)} / ${num(r.d.sd, 2)}`],
            [`Mean ${c}% CI`, `${num(r.d.ci[0], 2)} to ${num(r.d.ci[1], 2)}`],
            ['Median (Q1 to Q3)', `${num(r.d.median, 2)} (${num(r.d.q1, 2)} to ${num(r.d.q3, 2)})`],
            ['Min to max', `${num(r.d.min, 2)} to ${num(r.d.max, 2)}`],
            ['Skewness G1 (SE)', `${num(r.d.G1, 3)} (${num(r.d.ses, 3)}), z = ${num(r.d.zSkew, 2)}`],
            ['Excess kurtosis G2 (SE)', `${num(r.d.G2, 3)} (${num(r.d.sek, 3)}), z = ${num(r.d.zKurt, 2)}`],
            ["Outside Tukey's fences", r.d.outliers.length ? `${r.d.outliers.length}: ${r.d.outliers.slice(0, 5).map((v) => num(v, 1)).join(', ')}${r.d.outliers.length > 5 ? '…' : ''}` : 'none'],
          ]} />
          <h3 className="clu-h3">Normality tests</h3>
          <Table label="Normality tests" head={['Test', 'Statistic', 'p', 'Reading']} rows={[
            ['Shapiro-Wilk', `W = ${num(r.sw.W, 4)}`, pv(r.sw.p), r.sw.p < 0.05 ? 'departs from normal' : 'no clear departure'],
            ['Anderson-Darling', `A² = ${num(r.ad.A2, 3)}`, pv(r.ad.p), r.ad.p < 0.05 ? 'departs from normal' : 'no clear departure'],
            ['Kolmogorov-Smirnov (Lilliefors)', `D = ${num(r.ks.D, 4)}`, pv(r.ks.p), `${r.ks.p < 0.05 ? 'departs from normal' : 'no clear departure'} (p simulated from ${r.ks.sims.toLocaleString('en')} normal samples)`],
          ]} />
          {r.ln && (
            <>
              <h3 className="clu-h3">Log-normal fit (for task times and other positive, right-skewed measures)</h3>
              <Stats rows={[
                ['Geometric mean', `${num(r.ln.gm, 2)}${u}`],
                [`Geometric mean ${c}% CI`, `${num(r.ln.lo, 2)} to ${num(r.ln.hi, 2)}${u}`],
                ['Geometric SD (multiplicative)', `× ${num(r.ln.gsd, 3)}`],
                ['Log-normal μ, σ (maximum likelihood)', `${num(r.ln.mu, 3)}, ${num(r.ln.sigma, 3)}`],
                ['Mean implied by the log-normal', `${num(r.ln.meanMLE, 2)}${u}`],
                ['AIC: log-normal vs normal', `${num(r.ln.aicLog, 1)} vs ${num(r.ln.aicNorm, 1)} (${r.ln.aicLog < r.ln.aicNorm - 2 ? 'log-normal fits better' : r.ln.aicNorm < r.ln.aicLog - 2 ? 'normal fits better' : 'similar'})`],
                ['Shapiro-Wilk on the logs', `W = ${num(r.ln.swLog.W, 4)}, p ${pv(r.ln.swLog.p)}`],
              ]} />
            </>
          )}
          <h3 className="clu-h3">Ladder of powers</h3>
          <Table label="Ladder of powers" head={['Transform', 'Skewness', 'Excess kurtosis', 'Shapiro-Wilk W', 'p']} rows={r.lad.map((l) => ({ cls: l === best ? 'tl-cell-ok' : '', cells: [l.label, num(l.skew, 3), num(l.kurt, 3), num(l.W, 4), pv(l.pSW)] }))} />
          <p className="tl-note">Highlighted: the transform with the most normal shape (largest W).{Number.isFinite(r.lam) ? ` Box-Cox maximum-likelihood λ = ${num(r.lam, 3)} (0 means log, 0.5 square root, 1 no change).` : ' Powers of zero or below need every value above 0.'}</p>
          <StudySummary {...D.distributionSummary({ ...r, unit, name: 'the values', conf })} />
        </>
      )}
      <About method="examine-for-distributional-assumptions" links={[['right-skew-detection', 'Right-skew detection'], ['log-transformation-of-task-completion-times', 'Log-transforming task times'], ['confidence-intervals-for-task-time-log-transformed-and-median', 'Task time intervals'], ['geometric-mean-reporting', 'Geometric mean reporting'], ['re-expression-with-the-ladder-of-powers', 'Ladder of powers'], ['kernel-density-estimation', 'Kernel density estimation'], ['frequencies-and-descriptives-descriptive-screening', 'Descriptive screening']]}>
        <p><b>Shape.</b> Skewness G1 = g1·√(n(n − 1))/(n − 2) and excess kurtosis G2 = ((n + 1)g2 + 6)(n − 1)/((n − 2)(n − 3)), the adjusted forms used by SPSS and Excel, with g1 = m₃/m₂<sup>3/2</sup> and g2 = m₄/m₂² − 3; SE(G1) = √(6n(n − 1)/((n − 2)(n + 1)(n + 3))). Quartiles use linear interpolation; Tukey's fences are Q1 − 1.5·IQR and Q3 + 1.5·IQR.</p>
        <p><b>Tests.</b> Shapiro-Wilk W with Royston's (1995) coefficients and p-value (algorithm AS R94, as R and scipy; n from 3 to 5,000). Anderson-Darling A² against a normal with estimated mean and SD, p from A*= A²(1 + 0.75/n + 2.25/n²) and the D'Agostino and Stephens (1986) formulas. Kolmogorov-Smirnov D with estimated parameters needs the Lilliefors correction: its p-value here is simulated from 2,000 normal samples of the same size.</p>
        <p><b>Log-normal.</b> Geometric mean = exp(mean of ln x) with interval exp(mean ± t·SD/√n) on the logs (Sauro and Lewis 2016 recommend it as the typical task time for samples under about 25). μ and σ by maximum likelihood; AIC compares the log-normal with a normal fit (both 2 parameters). <b>Ladder of powers</b> (Tukey 1977): x³, x², x, √x, log x, −1/√x, −1/x, −1/x²; Box-Cox λ maximises −(n/2)·ln σ̂²(λ) + (λ − 1)Σ ln x. <b>Density</b>: Gaussian kernel with bandwidth SD·n^(−1/5) (Scott) or SD·(3n/4)^(−1/5) (Silverman); histogram bins by numpy's 'auto' rule; QQ positions are Filliben's order-statistic medians. Checked against scipy (shapiro, anderson, skew, kurtosis, lognorm, boxcox_normmax, gaussian_kde, probplot) and statsmodels (normal_ad, lilliefors): <code>npm run check:statsbench</code>.</p>
        <p><b>When not to use it.</b> Do not treat a normality test as a gate: with small samples it misses real skew and with large ones it flags trivial bumps. What matters for a t-test is whether the mean is roughly normal, which holds for moderate skew from about 30 values. Do not remove outliers just because they are outside the fences; check whether they are errors first.</p>
      </About>
    </>
  );
}

export default SbDistribution;
