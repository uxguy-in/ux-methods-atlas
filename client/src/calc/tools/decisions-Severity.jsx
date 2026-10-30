import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as SV from './decisions-severity.js';
import { fmt, pctS } from './decisions-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About, Bars } from './ui.jsx';
import { useWorkerJob } from './decisions-ui.jsx';

// Example: four evaluators rate 14 problems from a heuristic evaluation of a web app, and the evaluator-by-problem
// detection matrix from the eight evaluators who inspected it.
const EX = 'Problem, Ana, Ben, Chen, Dee\nNo undo after deleting a draft, 2, 2, 3, 3\nError message hides the form, 3, 4, 3, 3\nSearch ignores typos, 2, 1, 2, 2\nDate picker starts on Sunday, 1, 1, 1, 2\nCheckout asks for account first, 3, 4, 2, 2\nIcons without labels in toolbar, 2, 2, 1, 3\nLow contrast placeholder text, 1, 1, 2, 1\nPassword rules shown after failure, 3, 3, 2, 2\nProgress lost on back button, 4, 4, 4, 4\nInconsistent button order in dialogs, 1, 1, 1, 1\nFilters reset when sorting, 2, 3, 1, 3\nJargon in settings, 1, 1, 1, 0\nTiny tap targets on mobile, 2, 3, 2, 2\nNo confirmation before sending payment, 4, 3, 4, 4';
const EX_IFP = 'Problem, Ana, Ben, Chen\nNo undo after deleting a draft, 4/2/2, 4/2/3, 3/2/2\nError message hides the form, 4/3/3, 5/3/3, 4/3/2\nSearch ignores typos, 3/4/4, 2/4/4, 3/3/4\nDate picker starts on Sunday, 1/3/2, 1/2/2, 2/3/2\nCheckout asks for account first, 4/4/3, 4/5/3, 3/4/3\nProgress lost on back button, 5/3/2, 5/3/3, 5/2/2\nJargon in settings, 2/2/3, 2/1/3, 1/2/3\nNo confirmation before sending payment, 5/2/2, 5/2/3, 5/2/2';
const EX_DET = 'Problem, E1, E2, E3, E4, E5, E6, E7, E8\nNo undo after deleting a draft, 0, 0, 0, 0, 0, 0, 0, 1\nError message hides the form, 1, 1, 0, 0, 0, 0, 1, 0\nSearch ignores typos, 0, 0, 0, 0, 1, 1, 1, 1\nDate picker starts on Sunday, 0, 0, 0, 1, 0, 0, 0, 0\nCheckout asks for account first, 1, 0, 0, 0, 1, 0, 1, 0\nIcons without labels in toolbar, 0, 0, 1, 0, 1, 0, 0, 0\nLow contrast placeholder text, 0, 0, 0, 0, 0, 0, 1, 0\nPassword rules shown after failure, 0, 0, 1, 0, 0, 0, 1, 0\nProgress lost on back button, 1, 0, 1, 1, 1, 1, 1, 0\nInconsistent button order in dialogs, 0, 1, 0, 0, 0, 0, 0, 0\nFilters reset when sorting, 0, 1, 0, 0, 1, 0, 0, 0\nJargon in settings, 0, 0, 1, 0, 0, 0, 0, 0\nTiny tap targets on mobile, 1, 0, 1, 0, 0, 0, 1, 0\nNo confirmation before sending payment, 1, 0, 1, 0, 1, 0, 1, 0';

function EvaluatorCurve({ mc, exact, lam, m }) {
  const W = 620, H = 300, L = 54, R = 16, T = 14, B = 42;
  const sx = (i) => L + ((i - 1) / Math.max(1, m - 1)) * (W - L - R), sy = (v) => T + (1 - v) * (H - T - B);
  const band = mc ? `${mc.map((p) => `${sx(p.i)},${sy(p.p90)}`).join(' ')} ${[...mc].reverse().map((p) => `${sx(p.i)},${sy(p.p10)}`).join(' ')}` : '';
  const model = Array.from({ length: m }, (_, t) => [t + 1, SV.nlFound(lam, t + 1)]);
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label="Share of known problems found by groups of evaluators">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{pctS(v)}</text></g>)}
        {Array.from({ length: m }, (_, t) => t + 1).map((i) => <text key={i} x={sx(i)} y={H - B + 16} className="ax" textAnchor="middle">{i}</text>)}
        {mc && <polygon points={band} className="dc-band" />}
        <polyline points={model.map(([i, v]) => `${sx(i)},${sy(v)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--c2)', strokeWidth: 2, strokeDasharray: '6 4' }} />
        <polyline points={exact.map((p) => `${sx(p.i)},${sy(p.mean)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2.4 }} />
        {mc && mc.map((p) => <circle key={p.i} cx={sx(p.i)} cy={sy(p.mean)} r={3.4} style={{ fill: 'var(--c1)' }} />)}
        <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">Number of evaluators</text>
        <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Share of known problems found</text>
      </svg>
      <ul className="dc-legend"><li><i style={{ background: 'var(--c1)' }} />Your data: mean over random groups (dots: Monte Carlo, line: exact)</li><li><i style={{ background: 'var(--c1)', opacity: 0.25 }} />10th–90th percentile of groups</li><li><i style={{ background: 'var(--c2)' }} />Nielsen–Landauer model, 1 − (1 − λ)^i</li></ul>
    </figure>
  );
}

// ── Severity ratings and evaluator agreement ──
function DecSeverityRatings() {
  const [mode, setMode] = useState('nielsen');
  const [text, setText] = useState(EX);
  const [det, setDet] = useState(EX_DET);
  const loadExample = () => { setMode('nielsen'); setText(EX); setDet(EX_DET); };
  const switchMode = (m) => { setMode(m); setText(m === 'ifp' ? EX_IFP : EX); };

  const parsed = useMemo(() => SV.parseRatings(text, mode), [text, mode]);
  const agg = useMemo(() => SV.aggregate(parsed.rows, mode), [parsed, mode]);
  const ag = useMemo(() => (parsed.rows.length >= 2 && parsed.evaluators.length >= 2 ? SV.agreement(parsed.rows) : null), [parsed]);
  const dp = useMemo(() => SV.parseDetection(det), [det]);
  const D = dp.rows.map((r) => r.row);
  const detOk = D.length >= 2 && dp.m >= 2;
  const lam = detOk ? SV.lambdaOf(D) : null;
  const exact = detOk ? SV.exactCurve(D) : null;
  const mcJob = detOk ? { type: 'evaluators', D, draws: 5000, seed: 3 } : null;
  const mc = useWorkerJob(mcJob, detOk ? JSON.stringify(D) : 'none', (j) => SV.mcCurve(j.D, j.draws, j.seed));
  const curve = lam ? { lam: lam.lam, n75: SV.nlNeeded(lam.lam, 0.75), n90: SV.nlNeeded(lam.lam, 0.9), mcAt3: exact[2]?.mean } : null;
  const ok = ag && agg.some((a) => a.n);
  const sorted = [...agg].filter((a) => a.n).sort((a, b) => b.mean - a.mean);
  const maxV = mode === 'nielsen' ? 4 : 125;

  return (
    <div className="dc-root">
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Rating scheme" value={mode} onChange={switchMode} options={[['nielsen', 'Nielsen 0–4'], ['ifp', 'Impact × frequency × persistence (1–5 each)']]} />
      </div>
      <Area label={mode === 'nielsen' ? 'Ratings: problem, then one 0–4 rating per evaluator (blank or - if not rated)' : 'Ratings: problem, then impact/frequency/persistence per evaluator, e.g. 4/2/3'} value={text} onChange={setText} rows={8}
        hint={mode === 'nielsen' ? '0 not a problem, 1 cosmetic, 2 minor, 3 major, 4 usability catastrophe (Nielsen 1994). A first row of evaluator names is optional.' : 'Impact 1 cosmetic … 5 task failure; frequency 1 rare … 5 everyone; persistence 1 once … 5 every time, everywhere.'} />
      {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
      {!ok ? <Problem>Enter at least two problems rated by at least two evaluators.</Problem> : (
        <>
          <Result big={`α = ${fmt(ag.alpha, 2)}`} tone={ag.alpha >= 0.667 ? 'good' : 'bad'} label={`Krippendorff's alpha (ordinal) across ${parsed.evaluators.length} evaluators and ${agg.length} problems${ag.alpha >= 0.8 ? ': good agreement' : ag.alpha >= 0.667 ? ': acceptable for tentative conclusions' : ': evaluators do not share a standard yet'}`}>
            <Stats rows={[
              ['ICC(2,1), one evaluator', ag.icc ? fmt(ag.icc.icc21, 3) : `not available (${ag.nComplete} complete rows)`],
              ['ICC(2,k), mean of evaluators', ag.icc ? fmt(ag.icc.icc2k, 3) : '—'],
              ['Pairs with the same rating', pctS(ag.exact)],
              [mode === 'nielsen' ? 'Pairs within 1 point' : 'Pairs within 1 (products rarely tie)', pctS(ag.within1)],
            ]} />
          </Result>
          <h3 className="clu-h3">Problems by mean severity</h3>
          <Bars label="Mean severity per problem" rows={sorted.map((a) => [a.name, a.mean / maxV, `${fmt(a.mean, mode === 'nielsen' ? 2 : 0)}${a.spread ? ' ⚑' : ''}`, mode === 'nielsen' ? (a.mean >= 3 ? 'bad' : a.mean >= 2 ? 'warn' : 'ok') : (a.mean >= 27 ? 'bad' : a.mean >= 12 ? 'warn' : 'ok')])} />
          <Table label="Severity per problem" head={['Problem', 'Mean', 'Median', 'SD', 'Range', 'Raters', mode === 'nielsen' ? 'Category (rounded mean)' : 'Impact / freq. / persist. (means)', 'Discuss?']}
            rows={sorted.map((a) => [a.name, fmt(a.mean, 2), fmt(a.median, 1), fmt(a.sd, 2), `${a.lo}–${a.hi}`, a.n, mode === 'nielsen' ? a.label : a.parts.map((p) => fmt(p, 1)).join(' / '), a.spread ? <span key="s" className="qtag opp">Wide spread</span> : ''])} />
          <h3 className="clu-h3">Evaluators</h3>
          <Table label="Leniency and consistency of each evaluator" head={['Evaluator', 'Problems rated', 'Mean rating', 'Correlation with the others\' mean']}
            rows={ag.raters.map((r) => [parsed.evaluators[r.j], r.n, fmt(r.mean, 2), fmt(r.r, 2)])} />
          <StudySummary {...SV.severitySummary({ agg, ag, mode, evaluators: parsed.evaluators, curve })} />
        </>
      )}
      <h3 className="clu-h3">How many evaluators are enough?</h3>
      <Area label="Who found each problem: problem, then 1 (found) or 0 (missed) per evaluator" value={det} onChange={setDet} rows={6} hint="The evaluator-by-problem matrix from the independent evaluation, before the lists were merged." />
      {dp.errors.length > 0 && <Problem>{dp.errors.slice(0, 2).join(' · ')}</Problem>}
      {!detOk ? <Problem>Enter at least two problems found by at least two evaluators.</Problem> : (
        <>
          <Stats rows={[
            ['λ, share one evaluator finds', `${pctS(lam.lam, 1)} (adjusted ${pctS(lam.adj, 1)})`],
            ['Problems found by only one evaluator', `${lam.once} of ${lam.P}`],
            ['Evaluators for 75% (model)', `${SV.nlNeeded(lam.lam, 0.75)} (adjusted λ: ${SV.nlNeeded(lam.adj, 0.75)})`],
            ['Evaluators for 90% (model)', `${SV.nlNeeded(lam.lam, 0.9)} (adjusted λ: ${SV.nlNeeded(lam.adj, 0.9)})`],
          ]} />
          {mc.busy && <p className="dc-note" role="status">Drawing 5,000 random groups for each size…</p>}
          <EvaluatorCurve mc={mc.result} exact={exact} lam={lam.lam} m={dp.m} />
          <Table label="Share of known problems found by group size" head={['Evaluators', 'Mean (exact)', 'Monte Carlo mean', '10th–90th percentile', 'Model 1 − (1 − λ)^i']}
            rows={exact.map((e, t) => [e.i, pctS(e.mean, 1), mc.result ? pctS(mc.result[t].mean, 1) : '…', mc.result ? `${pctS(mc.result[t].p10)}–${pctS(mc.result[t].p90)}` : '…', pctS(SV.nlFound(lam.lam, e.i), 1)])} />
        </>
      )}
      <About method="severity-rating-scale-nielsen" links={[['severity-rating-with-impact-x-frequency-x-persistence', 'Impact × frequency × persistence'], ['heuristic-evaluation', 'Heuristic evaluation'], ['heuristic-evaluation-with-inter-evaluator-reliability', 'Inter-evaluator reliability'], ['monte-carlo-evaluator-aggregation-curve', 'Monte Carlo evaluator curve'], ['usability-issue-log-and-issue-based-metrics', 'Issue log and metrics'], ['capture-recapture-estimation-of-usability-problems', 'Capture-recapture']]}>
        <p><b>Aggregation.</b> Nielsen (1994, "Severity ratings for usability problems") found single evaluators' severity ratings unreliable and recommended using the mean of at least three evaluators, rating the merged problem list. Each problem's mean, median, SD and range are shown; a spread of 2 or more points (0–4) or a factor of 2 or more (impact × frequency × persistence products) is flagged for discussion. The multiplicative scheme rates impact, frequency and persistence 1–5 each and multiplies them (1–125).</p>
        <p><b>Agreement.</b> Krippendorff's alpha with the ordinal distance (Krippendorff 2011), which handles missing ratings; 0.80 or more is good and 0.667 the lowest level for tentative conclusions (Krippendorff 2004). ICC(2,1) and ICC(2,k) are the two-way random-effects, absolute-agreement intraclass correlations of Shrout and Fleiss (1979) for one evaluator and for the mean of k, computed on problems every evaluator rated: ICC(2,1) = (MS_R − MS_E)/(MS_R + (k−1)MS_E + k(MS_C − MS_E)/n), ICC(2,k) = (MS_R − MS_E)/(MS_R + (MS_C − MS_E)/n). Checked against pingouin's intraclass_corr and the krippendorff package.</p>
        <p><b>How many evaluators.</b> λ is the mean share of the known problems one evaluator found; Nielsen and Landauer (1993) model the share found by i evaluators as 1 − (1 − λ)^i and reported λ averaging 0.31 across 11 studies. Because λ from a small matrix is inflated, Lewis's (2001) adjustment (the mean of a normalisation and a Good-Turing deflation) is shown too. The curve from your data follows Nielsen and Molich (1990): random groups of each size are drawn without replacement (5,000 per size, in a Web Worker), their problems combined, and the share of the known problems found averaged; the exact mean is 1 − C(m − c, i)/C(m, i) averaged over problems found by c of m evaluators.</p>
        <p><b>When not to use it.</b> Agreement statistics need enough problems (ten or more) and a real spread of severities; if every problem is "minor", alpha is low even when evaluators agree. The evaluator curve counts only problems someone found, so it overstates coverage, most of all with few evaluators.</p>
      </About>
    </div>
  );
}

export default DecSeverityRatings;
