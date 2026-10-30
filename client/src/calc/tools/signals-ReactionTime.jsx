import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as R from './signals-rt.js';
import { Histogram, LinePlot, Table, LoadExample, color } from './signals-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, pv, n_ } from './ui.jsx';

function DistMode() {
  const [text, setText] = useState(() => R.exampleDist());
  const [method, setMethod] = useState('absolute');
  const [lo, setLo] = useState('200');
  const [hi, setHi] = useState('2500');
  const [k, setK] = useState('2.5');
  const [onlyCorrect, setOnlyCorrect] = useState(true);
  const parsed = useMemo(() => R.parseTrials(text, 'dist'), [text]);
  const rts = useMemo(() => parsed.rows.filter((r) => !onlyCorrect || r.correct === 1).map((r) => r.rt), [parsed, onlyCorrect]);
  const opts = { method, lo: n_(lo), hi: n_(hi), k: n_(k) };
  const okOpts = method === 'none' || (method === 'absolute' ? opts.hi > opts.lo : opts.k > 0);
  const t = useMemo(() => (okOpts && rts.length >= 3 ? R.trim(rts, opts) : null), [rts, JSON.stringify(opts), okOpts]);
  const d = t && t.kept.length >= 3 ? R.describe(t.kept) : null;
  const fit = useMemo(() => (t && t.kept.length >= 10 ? R.exGaussian(t.kept) : null), [t]);
  const bins = d ? R.histogram(t.kept, 30) : [];
  const curve = fit && bins.length ? Array.from({ length: 120 }, (_, i) => { const x = bins[0].x0 + (i / 119) * (bins[bins.length - 1].x1 - bins[0].x0); return [x, R.exgPdf(x, fit.mu, fit.sigma, fit.tau)]; }) : null;
  return (
    <>
      <LoadExample onClick={() => { setText(R.exampleDist()); setMethod('absolute'); setLo('200'); setHi('2500'); setK('2.5'); setOnlyCorrect(true); }}>Load example (220 trials of a menu-selection task)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Area label="One trial per line: RT in ms, correct (1/0, optional)" value={text} onChange={setText} rows={7} />
      </div>
      <div className="calc-inputs sg-inputs">
        <Choice label="Trimming" value={method} onChange={setMethod} options={[['none', 'None'], ['absolute', 'Absolute cut-offs'], ['sd', 'Mean ± k SD'], ['mad', 'Median ± k MAD']]} />
        {method === 'absolute' ? <><Num label="Keep from" value={lo} onChange={setLo} suffix="ms" /><Num label="Keep up to" value={hi} onChange={setHi} suffix="ms" /></> : method !== 'none' && <Num label="k" value={k} onChange={setK} step="0.5" hint={method === 'mad' ? 'Leys et al. (2013) recommend 2.5 (moderately conservative).' : '2.5 or 3 are common.'} />}
        <label className="tl-check"><input type="checkbox" checked={onlyCorrect} onChange={(e) => setOnlyCorrect(e.target.checked)} /> Correct trials only</label>
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 10).join(', ')}: each line needs an RT and, if given, a correct flag of 1 or 0.</Problem>}
      {!okOpts ? <Problem>Check the trimming settings: the upper cut-off must be above the lower one, and k above 0.</Problem> : !d ? <Problem>Enter at least 3 trials that survive trimming.</Problem> : (
        <>
          <Result big={fit ? `τ = ${num(fit.tau, 0)} ms` : `Median ${num(d.median, 0)} ms`} label={`${d.n} trials kept, ${t.removed} removed; median ${num(d.median, 0)} ms, mean ${num(d.mean, 0)} ms, SD ${num(d.sd, 0)} ms`}>
            {fit && <p>Ex-Gaussian: μ = {num(fit.mu, 0)} ms, σ = {num(fit.sigma, 0)} ms, τ = {num(fit.tau, 0)} ms (μ + τ = {num(fit.mean, 0)} ms).</p>}
          </Result>
          <h3 className="clu-h3">Distribution with the ex-Gaussian fit</h3>
          <Histogram bins={bins} curve={curve} label="Histogram of reaction times with the fitted ex-Gaussian density" xLabel="Reaction time (ms)" />
          {fit && <Table label="Ex-Gaussian parameters" head={['Parameter', 'Estimate (ms)', 'SE', '95% CI (Wald)', 'Meaning']}
            rows={[['μ', fit.mu, fit.se.mu, 'Mean of the normal part: typical fast responses'], ['σ', fit.sigma, fit.se.sigma, 'Spread of the normal part'], ['τ', fit.tau, fit.se.tau, 'Mean of the exponential part: the slow tail']].map(([p, e, s, m]) => [p, num(e, 1), num(s, 1), `${num(e - 1.96 * s, 1)} to ${num(e + 1.96 * s, 1)}`, m])} />}
          <Stats rows={[['Trials kept', d.n], ['Removed by trimming', t.removed], ['Median', `${num(d.median, 0)} ms`], ['Mean', `${num(d.mean, 0)} ms`], ['10th–90th percentile', `${num(d.q10, 0)} to ${num(d.q90, 0)} ms`], ['Skewness', num(d.skew, 2)], fit && ['Log-likelihood', num(fit.logLik, 2)]]} />
          <StudySummary {...R.distSummary(d, fit, { ...opts, removed: t.removed })} />
        </>
      )}
    </>
  );
}

function EzMode() {
  const [src, setSrc] = useState('trials');
  const [text, setText] = useState(() => R.exampleEz());
  const [pc, setPc] = useState('0.802');
  const [vrt, setVrt] = useState('0.112');
  const [mrt, setMrt] = useState('0.723');
  const [nT, setNT] = useState('100');
  const parsed = useMemo(() => R.parseTrials(text, 'ez'), [text]);
  const conds = useMemo(() => (src === 'trials' && parsed.rows.length ? R.ezConditions(parsed.rows) : null), [src, parsed]);
  const single = src === 'summary' ? R.ez(n_(pc), n_(vrt), n_(mrt), { N: n_(nT) }) : null;
  const okConds = conds && conds.some((c) => c.est);
  return (
    <>
      <LoadExample onClick={() => { setSrc('trials'); setText(R.exampleEz()); setPc('0.802'); setVrt('0.112'); setMrt('0.723'); setNT('100'); }}>Load example (two layouts, 160 trials each)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Choice label="Input" value={src} onChange={setSrc} options={[['trials', 'Trials by condition'], ['summary', 'Summary statistics']]} />
      </div>
      {src === 'trials' ? (
        <div className="calc-inputs sg-inputs"><Area label="One trial per line: condition, RT in ms, correct (1/0)" value={text} onChange={setText} rows={7} hint="Use a two-choice task (yes/no, same/different, left/right) where errors are possible." /></div>
      ) : (
        <div className="calc-inputs sg-inputs">
          <Num label="Proportion correct (Pc)" value={pc} onChange={setPc} step="any" />
          <Num label="Variance of correct RTs (VRT)" value={vrt} onChange={setVrt} step="any" suffix="s²" />
          <Num label="Mean of correct RTs (MRT)" value={mrt} onChange={setMrt} step="any" suffix="s" />
          <Num label="Trials" value={nT} onChange={setNT} hint="Used only for the edge correction when Pc = 1." />
        </div>
      )}
      {src === 'trials' && parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 10).join(', ')}.</Problem>}
      {src === 'summary' ? (!single ? <Problem>EZ needs Pc between 0 and 1 but not exactly 0.5, and a variance above 0.</Problem> : (
        <>
          <Result big={`v = ${num(single.v, 4)}`} label={`boundary a = ${num(single.a, 4)}, non-decision time Ter = ${num(single.Ter, 3)} s (decision time ${num(single.MDT, 3)} s)`}>
            <p>Wagenmakers et al. (2007) worked example: Pc = 0.802, VRT = 0.112, MRT = 0.723 gives v = 0.0999, a = 0.1400, Ter = 0.300.{single.corrected ? ' Pc was edge-corrected.' : ''}</p>
          </Result>
          <StudySummary {...R.ezSummary([{ cond: 'Your data', N: n_(nT), Pc: single.Pc, MRT: n_(mrt), VRT: n_(vrt), est: single, ci: null }])} />
        </>
      )) : !okConds ? <Problem>Each condition needs correct and error trials and at least two correct RTs; EZ cannot be computed at exactly 50% correct.</Problem> : (
        <>
          <Result big={conds.filter((c) => c.est).map((c) => `v = ${num(c.est.v, 3)}`).join(' vs ')} label={conds.filter((c) => c.est).map((c) => c.cond).join(' vs ')} />
          <Table label="EZ-diffusion estimates by condition" head={['Condition', 'Trials', 'Correct', 'Mean correct RT', 'Drift v (95% CI)', 'Boundary a (95% CI)', 'Non-decision Ter (95% CI)']}
            rows={conds.map((c) => (c.est ? [c.cond, c.N, pct(c.Pc, 1), `${num(c.MRT * 1000, 0)} ms`, `${num(c.est.v, 3)} (${num(c.ci.v[0], 3)} to ${num(c.ci.v[1], 3)})`, `${num(c.est.a, 3)} (${num(c.ci.a[0], 3)} to ${num(c.ci.a[1], 3)})`, `${num(c.est.Ter * 1000, 0)} ms (${num(c.ci.Ter[0] * 1000, 0)} to ${num(c.ci.Ter[1] * 1000, 0)})`] : [c.cond, c.N, Number.isFinite(c.Pc) ? pct(c.Pc, 1) : '', '', 'not computable', '', '']))} />
          <p className="tl-note">Intervals: 1,000 bootstrap resamples of trials within each condition (percentile method). Scaling s = 0.1.</p>
          <StudySummary {...R.ezSummary(conds)} />
        </>
      )}
    </>
  );
}

function SearchMode() {
  const [text, setText] = useState(() => R.exampleSearch());
  const parsed = useMemo(() => R.parseTrials(text, 'search'), [text]);
  const fits = useMemo(() => R.searchSlopes(parsed.rows), [parsed]);
  const ok = fits.filter((f) => f.fit);
  return (
    <>
      <LoadExample onClick={() => setText(R.exampleSearch())}>Load example (finding an icon among 4 to 24 items)</LoadExample>
      <div className="calc-inputs sg-inputs"><Area label="One trial per line: condition, set size, RT in ms, correct (1/0, optional)" value={text} onChange={setText} rows={7} hint="Set size = the number of items on screen. Conditions might be target present vs absent, or two designs of the target." /></div>
      {parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 10).join(', ')}.</Problem>}
      {!ok.length ? <Problem>Each condition needs correct trials at two or more set sizes.</Problem> : (
        <>
          <Result big={ok.map((f) => `${num(f.fit.slope, 1)}`).join(' vs ') + ' ms/item'} label={ok.map((f) => f.cond).join(' vs ')} />
          <LinePlot label="Mean RT by set size with fitted lines" height={280}
            series={ok.flatMap((f, i) => [
              { name: f.cond, pts: f.means.map((m) => [m.size, m.mean]), dots: true, line: false, color: color(i) },
              { name: `${f.cond} fit`, pts: [f.means[0].size, f.means[f.means.length - 1].size].map((x) => [x, f.fit.intercept + f.fit.slope * x]), color: color(i), dash: '6 3', hideLegend: true },
            ])}
            xLabel="Set size (items on screen)" yLabel="Mean correct RT (ms)" />
          <Table label="Search slopes by condition" head={['Condition', 'Correct trials', 'Errors', 'Slope (ms/item)', '95% CI', 'Intercept (ms)', 'R²', 'Search']}
            rows={ok.map((f) => [f.cond, f.n, pct(f.errorRate, 1), num(f.fit.slope, 2), `${num(f.fit.lo, 2)} to ${num(f.fit.hi, 2)}`, num(f.fit.intercept, 0), num(f.fit.r2, 3), f.kind])} />
          {ok.length >= 2 && <Stats rows={[['Slope ratio (second ÷ first)', num(ok[1].fit.slope / ok[0].fit.slope, 2)], ['Slope difference', `${num(ok[1].fit.slope - ok[0].fit.slope, 1)} ms/item`]]} />}
          <StudySummary {...R.searchSummary(fits)} />
        </>
      )}
    </>
  );
}

// ── Reaction-time analysis ──
function SignalsReactionTime() {
  const [mode, setMode] = useState('dist');
  const M = { dist: DistMode, ez: EzMode, search: SearchMode }[mode];
  return (
    <>
      <div className="calc-inputs sg-inputs">
        <Choice label="Analysis" value={mode} onChange={setMode} options={[['dist', 'Distribution and ex-Gaussian'], ['ez', 'EZ-diffusion'], ['search', 'Visual-search slope']]} />
      </div>
      <M key={mode} />
      <About method="reaction-time-distribution-analysis" links={[['drift-diffusion-modelling-of-decisions', 'Drift diffusion modelling'], ['visual-search-paradigm-testing', 'Visual search paradigm testing'], ['mental-chronometry', 'Mental chronometry']]}>
        <p><b>Trimming.</b> Absolute: keep RTs between two cut-offs (often 200 ms to remove anticipations and 2,000 to 3,000 ms to remove lapses). SD: keep |RT − mean| ≤ k·SD, one pass. MAD: keep |RT − median| ≤ k × 1.4826 × MAD, which is robust to the outliers it is trying to find (Leys et al. 2013, recommend k = 2.5). Ratcliff (1993) shows every rule trades lost power against bias, so fix the rule in advance.</p>
        <p><b>Ex-Gaussian.</b> RT = Normal(μ, σ) + Exponential(τ), density f(x) = (1/τ) exp(μ/τ + σ²/(2τ²) − x/τ) Φ((x − μ)/σ − σ/τ). Parameters maximise the log-likelihood (Nelder-Mead from method-of-moments starts); standard errors come from the inverse numerical Hessian. Checked against scipy.stats.exponnorm (K = τ/σ, loc = μ, scale = σ).</p>
        <p><b>EZ-diffusion.</b> Wagenmakers, van der Maas and Grasman (2007), Psychonomic Bulletin and Review 14(1). With Pc the proportion correct, VRT and MRT the variance and mean of correct RTs in seconds, and s = 0.1: L = logit(Pc); x = L(L·Pc² − L·Pc + Pc − ½)/VRT; drift v = sign(Pc − ½)·s·x^¼; boundary a = s²L/v; MDT = (a/2v)(1 − e^y)/(1 + e^y) with y = −va/s²; non-decision time Ter = MRT − MDT. Pc = 1 is edge-corrected to 1 − 1/(2N). The paper's worked example (Pc = 0.802, VRT = 0.112, MRT = 0.723) gives v = 0.0999, a = 0.1400, Ter = 0.300, which this tool reproduces.</p>
        <p><b>Visual search.</b> RT = intercept + slope × set size, fitted by OLS to correct trials in each condition, with a t interval for the slope. Wolfe (1998) summarises slopes under about 10 ms per item as efficient search and 20 to 40 ms per item as inefficient; Treisman and Gelade (1980) link flat slopes to features that pop out and steep ones to conjunctions.</p>
        <p><b>When not to use it.</b> The ex-Gaussian and EZ need many trials per person and condition (about 100); with 10 to 20 trials report medians instead. EZ is for simple two-choice decisions with errors; it does not fit tasks with several steps, with 100% accuracy across the board, or with very different correct and error RTs. Search slopes need at least three set sizes to check that the relation is linear.</p>
      </About>
    </>
  );
}

export default SignalsReactionTime;
