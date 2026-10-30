import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as Wt from './scorers-rake.js';
import { WEIGHT_EXAMPLE, WEIGHT_TARGETS } from './scorers-examples.js';
import { toCSV } from './scorers-math.js';
import { IntervalRows, Columns, Table, color } from './scorers-charts.jsx';
import { Area, Choice, Num, Pick, Result, Stats, Problem, About, num, download } from './ui.jsx';

const pc = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');

// ── Survey weighting ──
function ScorersWeighting() {
  const [text, setText] = useState(WEIGHT_EXAMPLE);
  const [tgt, setTgt] = useState(WEIGHT_TARGETS);
  const [baseCol, setBaseCol] = useState('');
  const [trimOn, setTrimOn] = useState(false);
  const [lo, setLo] = useState('0.3'); const [hi, setHi] = useState('3');
  const [conf, setConf] = useState(0.95);
  const s = useMemo(() => Wt.parseSurvey(text), [text]);
  const t = useMemo(() => Wt.parseTargets(tgt), [tgt]);
  const problems = useMemo(() => Wt.checkTargets(s, t.targets), [s, t]);
  const numCols = s.cols.filter((c) => s.types[c] === 'num');
  const base = baseCol && s.types[baseCol] === 'num' ? s.rows.map((r) => Number(r[baseCol])) : null;
  const badBase = base && base.some((x) => !(x > 0));
  const ok = s.rows.length >= 2 && t.targets.length > 0 && !problems.length && !badBase;
  const r = useMemo(() => (ok ? Wt.rake(s.rows, t.targets, { base, trim: trimOn ? { lo: Number(lo) || NaN, hi: Number(hi) || NaN } : null }) : null), [ok, s, t, base, trimOn, lo, hi]);
  const raked = new Set(t.targets.map((x) => x.variable));
  const idCol = s.cols.find((c) => /^(id|respondent|resp|participant)$/i.test(c));
  const outcomes = s.cols.filter((c) => !raked.has(c) && c !== baseCol && c !== idCol && (s.types[c] === 'num' || new Set(s.rows.map((x) => x[c])).size <= 12));
  const est = useMemo(() => (r ? Wt.estimates(s, r.w, outcomes, conf) : []), [r, s, outcomes.join('|'), conf]);
  const load = () => { setText(WEIGHT_EXAMPLE); setTgt(WEIGHT_TARGETS); setBaseCol(''); setTrimOn(false); setLo('0.3'); setHi('3'); };
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={load}>Load example (SaaS user survey, 400 responses)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="Responses: a header row, then one respondent per row (comma or tab separated)" value={text} onChange={setText} rows={8} hint="Columns you rake on must match the target levels exactly. Other columns are treated as outcomes." />
        <Area label="Targets: one variable per line, as variable: level=share, level=share" value={tgt} onChange={setTgt} rows={4} hint="Shares can be percents, proportions or counts; each line is normalised to 100%. Use population figures from your CRM, analytics or a census." />
        <Pick label="Base (design) weight column" value={baseCol} onChange={setBaseCol} options={[['', 'None (all 1)'], ...numCols.map((c) => [c, c])]} />
        <Choice label="Trim weights" value={trimOn} onChange={setTrimOn} options={[[false, 'No'], [true, 'Yes']]} />
        {trimOn && <><Num label="Lowest weight (× mean)" value={lo} onChange={setLo} min={0} step={0.1} /><Num label="Highest weight (× mean)" value={hi} onChange={setHi} min={1} step={0.5} /></>}
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      {t.bad.length > 0 && <Problem>Could not read: {t.bad.slice(0, 4).join('; ')}.</Problem>}
      {problems.length > 0 && <Problem>{problems.slice(0, 4).join(' ')}</Problem>}
      {badBase && <Problem>Base weights must all be positive numbers.</Problem>}
      {!r ? (!problems.length && <Problem>Enter responses with a header row and at least one target line.</Problem>) : (
        <>
          <Result big={`Design effect ${num(r.deff, 2)}`} tone={r.deff > 2 ? 'bad' : r.deff < 1.5 ? 'good' : ''} label={`Effective n ${Math.round(r.nEff)} of ${r.n} (${pc(r.nEff / r.n, 0)}); weights ${num(r.min, 2)} to ${num(r.max, 2)}; ${r.converged ? `converged in ${r.iterations} passes` : `did not fully converge (largest gap ${pc(r.maxGap, 2)})`}`} />
          <h3 className="clu-h3">Margins: sample, target and weighted</h3>
          <Table label="Raking margins" head={['Variable', 'Level', 'Respondents', 'Sample share', 'Target', 'Weighted share']}
            rows={r.margins.flatMap((m) => m.levels.map((l, k) => [k === 0 ? m.variable : '', l.level, l.n, pc(l.sample), pc(l.target), pc(l.weighted, 2)]))} />
          <h3 className="clu-h3">Weight distribution</h3>
          <Columns label="Histogram of weights" bars={(() => { const B = 12, w0 = r.min, w1 = r.max + 1e-9, step = (w1 - w0) / B || 1; return Array.from({ length: B }, (_, i) => ({ label: num(w0 + (i + 0.5) * step, 2), value: r.w.filter((w) => w >= w0 + i * step && w < w0 + (i + 1) * step).length })); })()} />
          <Stats rows={[['Kish design effect (1 + CV²)', num(r.deff, 3)], ['Effective sample size', num(r.nEff, 1)], ['Coefficient of variation of weights', num(r.cv, 3)], ['Max ÷ min weight', num(r.ratio, 2)], ['Raking passes', `${r.iterations}${r.trimmedLast ? `; trimming changed ${r.trimmedLast} weights in the last round` : ''}`]]} />
          {est.length > 0 && (
            <>
              <h3 className="clu-h3">Estimates, unweighted and weighted</h3>
              {est.some((e) => e.kind === 'share') && <IntervalRows label="Unweighted and weighted estimates with confidence intervals" min={0} max={1} fmtX={(v) => `${Math.round(v * 100)}%`}
                rows={est.filter((e) => e.kind === 'share').flatMap((e) => e.rows.flatMap((x) => [{ name: `${e.col}: ${x.label}`, est: x.un.mean, lo: x.un.lo, hi: x.un.hi, color: color(0) }, { name: '  weighted', est: x.wt.mean, lo: x.wt.lo, hi: x.wt.hi, color: color(1), bold: true }]))}
                right={(row) => pc(row.est)} xLabel="Share: first row unweighted, second row weighted" />}
              <Table label="Estimates" head={['Outcome', 'Unweighted', `${Math.round(conf * 100)}% CI`, 'Weighted', `${Math.round(conf * 100)}% CI`, 'SE ratio (weighted ÷ unweighted)']}
                rows={est.flatMap((e) => e.rows.map((x) => { const f = e.kind === 'share' ? (v) => pc(v) : (v) => num(v, 3); return [`${e.col}${e.kind === 'share' ? `: ${x.label}` : ' (mean)'}`, f(x.un.mean), `${f(x.un.lo)} to ${f(x.un.hi)}`, f(x.wt.mean), `${f(x.wt.lo)} to ${f(x.wt.hi)}`, num(x.wt.se / x.un.se, 2)]; }))} />
            </>
          )}
          <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => download('raked-weights.csv', toCSV([...s.cols, 'weight'], s.rows.map((row, i) => [...s.cols.map((c) => row[c]), +r.w[i].toFixed(6)])), 'text/csv')}>Download data with weights (CSV)</button></div>
          <StudySummary {...Wt.weightingSummary(r, est, conf)} />
        </>
      )}
      <About method="survey-weighting" links={[['design-effects-and-design-based-analysis-of-complex-samples', 'Design effects'], ['non-probability-sample-adjustment-sample-matching-and-propensity-weighting', 'Non-probability sample adjustment']]}>
        <p><b>Raking</b> (iterative proportional fitting; Deming and Stephan 1940). Start from the base weights scaled to sum to n. For each target variable in turn, multiply the weights of everyone in level l by (target share × Σw)/(Σw in l). Repeat until every weighted share is within 10⁻¹⁰ of its target. Raking matches each margin, not the joint cells, so it needs only one-way targets. <b>Trimming</b>: after raking, weights outside [lo, hi] × the mean weight are set to the bound and the data are raked again, repeating until the bounds hold (Battaglia, Izrael, Hoaglin and Frankel 2009); the margins can then miss slightly if bounds and targets conflict.</p>
        <p><b>Design effect and effective n</b> (Kish 1965, 1992): deff = nΣw²/(Σw)² = 1 + CV², n_eff = (Σw)²/Σw². This is the variance inflation from unequal weights alone. <b>Weighted estimates</b>: ȳ_w = Σwy/Σw with the linearisation variance v = n/(n − 1)·Σw²(y − ȳ_w)²/(Σw)², treating each respondent as an independent draw with replacement (as samplics' TaylorEstimator and Stata's svy with no strata or clusters); CI ȳ_w ± t(n − 1)·√v. Shares use y = 1 for the level and 0 otherwise. The variance ignores the precision raking gains from known margins, so it is slightly conservative.</p>
        <p><b>When not to use it.</b> Weighting cannot fix variables you do not rake on, or groups with no or very few respondents (a weight above about 5 × the mean is a warning). Do not rake on a variable that is itself an outcome. Targets must come from a trusted population source, measured the same way as your survey question. For clustered or stratified samples use a full design-based analysis.</p>
      </About>
    </>
  );
}

export default ScorersWeighting;
