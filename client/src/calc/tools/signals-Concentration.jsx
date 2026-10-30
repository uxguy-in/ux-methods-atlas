import { useEffect, useMemo, useRef, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as K from './signals-concentration.js';
import { LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About, num, pct, sig } from './ui.jsx';

// Runs the bootstraps in a Web Worker and reports progress. Returns { ci, gof, progress, error }.
function useBootstrap(values, fit, B) {
  const [state, setState] = useState({ ci: null, gof: null, progress: 0, error: null });
  const ref = useRef(null);
  useEffect(() => {
    if (!values || values.length < 10) { setState({ ci: null, gof: null, progress: 0, error: null }); return undefined; }
    let w;
    try { w = new Worker(new URL('./signals-concentration.worker.js', import.meta.url), { type: 'module' }); } catch (e) { setState((s) => ({ ...s, error: 'Web Workers are not available in this browser.' })); return undefined; }
    const id = Math.random();
    ref.current = id;
    setState({ ci: null, gof: null, progress: 0, error: null });
    const t = setTimeout(() => w.postMessage({ id, values, fit, B, Bgini: 2000, seed: 20261030 }), 250);
    w.onmessage = ({ data }) => {
      if (data.id !== ref.current) return;
      if (data.type === 'gini') setState((s) => ({ ...s, ci: data.ci }));
      else if (data.type === 'progress') setState((s) => ({ ...s, progress: data.p }));
      else if (data.type === 'gof') { setState((s) => ({ ...s, gof: data.gof, progress: 1 })); w.terminate(); }
      else if (data.type === 'error') { setState((s) => ({ ...s, error: data.error })); w.terminate(); }
    };
    return () => { clearTimeout(t); w.terminate(); };
  }, [values, fit, B]);
  return state;
}

// ── Lorenz curve, Gini and power law ──
function SignalsConcentration() {
  const [text, setText] = useState(() => K.exampleText());
  const [kind, setKind] = useState('auto');
  const [B, setB] = useState(1000);
  const p = useMemo(() => K.parseValues(text), [text]);
  const vals = p.vals;
  const discrete = kind === 'auto' ? vals.every((v) => Number.isInteger(v)) : kind === 'discrete';
  const c = useMemo(() => (vals.length >= 10 && vals.some((v) => v > 0) ? K.concentration(vals) : null), [vals]);
  const fit = useMemo(() => (c ? K.fitPowerLaw(vals, discrete) : null), [c, vals, discrete]);
  const cmp = useMemo(() => (fit && fit.ntail >= 3 ? K.compareExponential(vals, fit) : null), [fit, vals]);
  const fitLite = useMemo(() => (fit ? { xmin: fit.xmin, alpha: fit.alpha, D: fit.D, ntail: fit.ntail, discrete } : null), [fit, discrete]);
  const boot = useBootstrap(c ? vals : null, fitLite, B);
  const cc = useMemo(() => (c ? K.ccdf(vals) : []), [c, vals]);
  const fitLine = useMemo(() => {
    if (!fit) return [];
    const xs = cc.filter(([x]) => x >= fit.xmin).map(([x]) => x), share = fit.ntail / fit.ntotal;
    const z0 = discrete ? K.hurwitz(fit.alpha, fit.xmin) : 1;
    return xs.map((x) => [Math.log10(x), Math.log10(share * (discrete ? K.hurwitz(fit.alpha, x) / z0 : (x / fit.xmin) ** (1 - fit.alpha)))]);
  }, [fit, cc, discrete]);
  return (
    <>
      <LoadExample onClick={() => { setText(K.exampleText()); setKind('auto'); }}>Load example (sessions per user, 1,500 users)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Area label="One value per unit (user, page, creator), or label, value" value={text} onChange={setText} rows={8} hint="Engagement counts, minutes, revenue or views. Zeros are allowed for the Lorenz curve and Gini; the power-law fit uses positive values only." />
      </div>
      <div className="calc-inputs sg-inputs">
        <Choice label="Values are" value={kind} onChange={setKind} options={[['auto', `Detect (${vals.length && vals.every((v) => Number.isInteger(v)) ? 'whole numbers' : 'continuous'})`], ['discrete', 'Counts (discrete)'], ['continuous', 'Continuous']]} />
        <Choice label="Bootstrap data sets" value={B} onChange={setB} options={[[500, '500'], [1000, '1,000'], [2500, '2,500 (±0.01 on p)']]} />
      </div>
      {p.bad.length > 0 && <Problem>Skipped line{p.bad.length > 1 ? 's' : ''} {p.bad.slice(0, 10).join(', ')}: values must be numbers of 0 or more.</Problem>}
      {!c ? <Problem>Enter at least 10 values, with some above 0.</Problem> : (
        <>
          <Result big={`Gini ${num(c.gini, 3)}`} label={`${c.n.toLocaleString()} units, total ${sig(c.total, 6)}${boot.ci ? `; 95% bootstrap CI ${num(boot.ci.lo, 3)} to ${num(boot.ci.hi, 3)}` : '; interval computing…'}`}>
            <p>The top 20% hold {pct(c.top20, 0)} of the total; {pct(c.for80, 0)} of units account for 80%{c.top20 >= 0.8 ? ' (the 80/20 pattern holds)' : ''}.</p>
          </Result>
          <div className="sg-grid2">
            <div>
              <h3 className="clu-h3">Lorenz curve</h3>
              <LinePlot label="Lorenz curve with the line of equality" height={300}
                series={[{ name: 'Lorenz curve', pts: c.lorenz.map(([x, y]) => [x * 100, y * 100]) }, { name: 'Perfect equality', pts: [[0, 0], [100, 100]], dash: '5 4', width: 1.4, color: 'var(--ink-3)' }]}
                xLabel="Share of units, smallest first (%)" yLabel="Share of total (%)" xMin={0} xMax={100} yMin={0} yMax={100} xFmt={(v) => `${v}%`} yFmt={(v) => `${v}%`}
                vlines={[{ x: 80, label: 'top 20%' }]} />
            </div>
            {fit && (
              <div>
                <h3 className="clu-h3">Tail on log-log axes</h3>
                <LinePlot label="Complementary CDF with the fitted power law" height={300} logX logY
                  series={[{ name: 'P(X ≥ x), data', pts: cc.map(([x, y]) => [Math.log10(x), Math.log10(y)]), dots: true, line: false, r: 2.4 }, { name: `Power law, α = ${num(fit.alpha, 2)}`, pts: fitLine, color: 'var(--c2)' }]}
                  vlines={[{ x: Math.log10(fit.xmin), label: 'xmin' }]} xLabel="Value (log scale)" yLabel="P(X ≥ x) (log scale)" />
              </div>
            )}
          </div>
          <Stats rows={[['Gini', num(c.gini, 3)], ['Gini × n/(n − 1)', num(c.giniUnbiased, 3)], ['Top 1% share', pct(c.top1, 1)], ['Top 10% share', pct(c.top10, 1)], ['Top 20% share', pct(c.top20, 1)], ['Bottom 50% share', pct(c.bottom50, 1)], ['Units holding 80%', pct(c.for80, 1)], ['Zeros', c.zeros.toLocaleString()]]} />
          {fit && (
            <>
              <h3 className="clu-h3">Power-law fit (Clauset, Shalizi and Newman 2009)</h3>
              <Table label="Power-law fit" num={false} head={['Quantity', 'Value', 'Meaning']}
                rows={[
                  ['xmin', sig(fit.xmin, 5), `Where the power-law tail starts (${fit.ntail.toLocaleString()} of ${fit.ntotal.toLocaleString()} positive values)`],
                  ['α', `${num(fit.alpha, 3)} (SE ${num(fit.se, 3)})`, `Maximum-likelihood exponent, ${discrete ? 'discrete (Hurwitz zeta)' : 'continuous'} model`],
                  ['KS distance D', num(fit.D, 4), 'Largest gap between the data and the fitted tail (smaller is better)'],
                  ['Bootstrap p', boot.gof ? `${num(boot.gof.p, 3)} (${boot.gof.B.toLocaleString()} data sets)` : boot.error ? 'not available' : `running… ${Math.round(boot.progress * 100)}%`, 'Share of synthetic power-law data sets that fit worse; a power law is ruled out when p ≤ 0.1'],
                  cmp && ['vs exponential', `LR = ${num(cmp.R, 1)}, normalised ${num(cmp.Rn, 2)}, p = ${num(cmp.p, 3)}`, cmp.p < 0.1 ? `Favours the ${cmp.favours}` : 'No significant preference'],
                ].filter(Boolean)} />
              {!boot.gof && !boot.error && <div className="sg-progress" role="progressbar" aria-valuenow={Math.round(boot.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Bootstrap progress"><i style={{ width: `${boot.progress * 100}%` }} /></div>}
              {boot.error && <Problem>{boot.error}</Problem>}
            </>
          )}
          <StudySummary {...K.summary(c, fit, cmp, boot.gof, boot.ci)} />
        </>
      )}
      <About method="lorenz-curve-and-gini-coefficient-for-engagement-concentration" links={[['pareto-analysis', 'Pareto analysis'], ['power-law-distribution-analysis', 'Power-law distribution analysis']]}>
        <p><b>Lorenz curve and Gini.</b> Sort the n values ascending; the Lorenz curve plots the cumulative share of units against the cumulative share of the total. G = Σ(2i − n − 1)x₍ᵢ₎ / (n Σx), twice the area between the curve and the line of equality. Gini × n/(n − 1) is the small-sample version that reaches 1 when one unit holds everything. The 95% interval is a percentile bootstrap over units (2,000 resamples, in a Web Worker).</p>
        <p><b>Pareto check.</b> Top-k% share = the sum of the ⌈k·n⌉ largest values over the total. "Units holding 80%" is the smallest share of units, largest first, whose values reach 80% of the total. The 80/20 rule (Juran's "vital few") is a rule of thumb, not a statistical test.</p>
        <p><b>Power law.</b> Clauset, Shalizi and Newman (2009), "Power-law distributions in empirical data", SIAM Review 51(4). For each distinct value tried as xmin, α is fitted by maximum likelihood to the values ≥ xmin: continuous α = 1 + n / Σ ln(x/xmin), SE (α − 1)/√n; discrete α maximises −n ln ζ(α, xmin) − α Σ ln x, with ζ the Hurwitz zeta function, SE from the curvature of ln ζ. D = max |S(x) − P(x)| over the tail's distinct values, comparing the share of the tail below x with the fitted probability; the xmin with the smallest D is kept. The exponential comparison is Vuong's normalised log-likelihood ratio (positive favours the power law). The goodness-of-fit p is CSN's semi-parametric bootstrap: synthetic data take fitted power-law values with probability n_tail/n and resampled values below xmin otherwise, and are refitted from scratch. Values and D are checked against the powerlaw Python package (Alstott, Bullmore and Plenz 2014).</p>
        <p><b>When not to use it.</b> Do not compare Gini values across populations defined differently (with or without inactive users, different time windows). With fewer than about 50 values in the tail the power-law fit cannot be distinguished from other heavy tails, and a power law that "fits" is still not proof of any mechanism; lognormal tails often fit equally well.</p>
      </About>
    </>
  );
}

export default SignalsConcentration;
