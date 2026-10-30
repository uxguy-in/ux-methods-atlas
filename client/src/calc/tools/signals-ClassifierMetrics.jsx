import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as M from './signals-classifier.js';
import { LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, pv, n_ } from './ui.jsx';

const ROWS = [
  ['accuracy', 'Accuracy', 'Share of all cases classified correctly', 'Wilson'],
  ['precision', 'Precision (PPV)', 'Of the flagged cases, the share truly positive', 'Wilson'],
  ['recall', 'Recall (sensitivity)', 'Of the true positives, the share flagged', 'Wilson'],
  ['specificity', 'Specificity', 'Of the true negatives, the share not flagged', 'Wilson'],
  ['npv', 'Negative predictive value', 'Of the cases not flagged, the share truly negative', 'Wilson'],
  ['f1', 'F1 score', 'Harmonic mean of precision and recall', 'Delta method'],
  ['balanced', 'Balanced accuracy', 'Mean of recall and specificity', 'Delta method'],
  ['mcc', 'Matthews correlation (MCC)', 'Correlation between prediction and truth, −1 to 1', 'Delta method'],
  ['kappa', "Cohen's kappa", 'Agreement beyond chance, −1 to 1', 'Delta method'],
  ['lift', 'Lift', 'Precision ÷ prevalence', 'Wilson ÷ prevalence'],
  ['lrPos', 'Positive likelihood ratio', 'Recall ÷ (1 − specificity)', 'Log method'],
  ['lrNeg', 'Negative likelihood ratio', '(1 − recall) ÷ specificity', 'Log method'],
];
const isPct = (k) => ['accuracy', 'precision', 'recall', 'specificity', 'npv', 'balanced'].includes(k);

function Matrix({ cm }) {
  return (
    <div className="sg-matrix" role="table" aria-label="Confusion matrix">
      <div className="h" role="columnheader" />
      <div className="h" role="columnheader">Truly positive</div>
      <div className="h" role="columnheader">Truly negative</div>
      <div className="h" role="rowheader">Flagged</div>
      <div className="ok" role="cell"><b>{cm.TP.toLocaleString()}</b><small>true positives</small></div>
      <div className="bad" role="cell"><b>{cm.FP.toLocaleString()}</b><small>false positives</small></div>
      <div className="h" role="rowheader">Not flagged</div>
      <div className="bad" role="cell"><b>{cm.FN.toLocaleString()}</b><small>false negatives</small></div>
      <div className="ok" role="cell"><b>{cm.TN.toLocaleString()}</b><small>true negatives</small></div>
    </div>
  );
}

// ── Classifier metrics ──
function SignalsClassifierMetrics() {
  const [mode, setMode] = useState('scores');
  const [text, setText] = useState(() => M.exampleScores());
  const [thr, setThr] = useState('0.5');
  const [cells, setCells] = useState({ TP: '47', FP: '34', FN: '13', TN: '146' });
  const example = () => { setText(M.exampleScores()); setThr('0.5'); setCells({ TP: '47', FP: '34', FN: '13', TN: '146' }); };
  const parsed = useMemo(() => M.parseScores(text), [text]);
  const curves = useMemo(() => (mode === 'scores' ? M.rocPr(parsed.rows) : null), [mode, parsed]);
  const dl = useMemo(() => (curves ? M.delong(parsed.rows) : null), [curves, parsed]);
  const best = curves ? M.youdenBest(curves.roc) : null;
  const t = n_(thr);
  const counts = mode === 'scores' ? (curves && Number.isFinite(t) ? M.atThreshold(parsed.rows, t) : null) : ['TP', 'FP', 'FN', 'TN'].map((k) => Math.round(n_(cells[k])));
  const cm = counts && counts.every((v) => v >= 0) ? M.confusion(...counts) : null;
  const okCm = cm && cm.TP + cm.FN > 0 && cm.FP + cm.TN > 0;
  const set = (k) => (v) => setCells((c) => ({ ...c, [k]: v }));
  const op = cm && okCm ? [cm.FP / (cm.FP + cm.TN), cm.TP / (cm.TP + cm.FN)] : null;
  return (
    <>
      <LoadExample onClick={example}>Load example (AI ticket triage, 240 tickets)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Choice label="Data" value={mode} onChange={setMode} options={[['scores', 'Scores and true labels'], ['counts', 'Confusion matrix counts']]} />
      </div>
      {mode === 'scores' ? (
        <div className="calc-inputs sg-inputs">
          <Area label="One case per line: score, true label (1 = positive, 0 = negative)" value={text} onChange={setText} rows={8} hint="Scores can be probabilities, confidence ratings or any number where higher means 'more likely positive'." />
          <Num label="Flag as positive when score ≥" value={thr} onChange={setThr} step="any" hint={best ? `The threshold with the best Youden's J here is ${best.thr}.` : undefined} />
          {best && <div className="tl-row sg-load"><button type="button" className="btn ghost small" onClick={() => setThr(String(best.thr))}>Use the Youden threshold</button></div>}
        </div>
      ) : (
        <div className="calc-inputs sg-inputs">
          <Num label="True positives" value={cells.TP} onChange={set('TP')} min={0} />
          <Num label="False positives" value={cells.FP} onChange={set('FP')} min={0} />
          <Num label="False negatives" value={cells.FN} onChange={set('FN')} min={0} />
          <Num label="True negatives" value={cells.TN} onChange={set('TN')} min={0} />
        </div>
      )}
      {mode === 'scores' && parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 10).join(', ')}: each line needs a number and a label of 1 or 0.</Problem>}
      {mode === 'scores' && !curves ? <Problem>Enter scores with both positive (1) and negative (0) cases.</Problem> : !okCm ? <Problem>Enter counts of 0 or more, with at least one positive and one negative case.</Problem> : (
        <>
          <Result big={dl ? `AUC ${num(dl.auc, 3)}` : `F1 ${num(cm.m.f1.est, 3)}`} label={dl ? `DeLong 95% CI ${num(dl.lo, 3)} to ${num(dl.hi, 3)}; ${dl.m} positive and ${dl.n} negative cases; average precision ${num(curves.ap, 3)}` : `${cm.N.toLocaleString()} cases, prevalence ${pct(cm.m.prevalence.est, 1)}`}>
            <p>{mode === 'scores' ? `At the threshold ${thr}: ` : ''}precision {pct(cm.m.precision.est, 1)}, recall {pct(cm.m.recall.est, 1)}, F1 {num(cm.m.f1.est, 3)}, MCC {num(cm.m.mcc.est, 3)}.</p>
          </Result>
          {curves && (
            <div className="sg-grid2">
              <div>
                <h3 className="clu-h3">ROC curve</h3>
                <LinePlot label="ROC curve with the chance line and the current threshold" height={300}
                  series={[{ name: 'ROC', pts: curves.roc.map((p) => [p.fpr, p.tpr]) }, { name: 'Chance', pts: [[0, 0], [1, 1]], dash: '5 4', width: 1.2, color: 'var(--ink-3)' }, ...(op ? [{ name: 'Current threshold', pts: [op], dots: true, line: false, color: 'var(--bad)', r: 5 }] : [])]}
                  xLabel="False positive rate (1 − specificity)" yLabel="True positive rate (recall)" xMin={0} xMax={1} yMin={0} yMax={1} />
              </div>
              <div>
                <h3 className="clu-h3">Precision-recall curve</h3>
                <LinePlot label="Precision-recall curve with the prevalence baseline" height={300}
                  series={[{ name: 'Precision-recall', pts: curves.pr.map((p) => [p.recall, p.precision]) }, ...(op ? [{ name: 'Current threshold', pts: [[cm.m.recall.est, cm.m.precision.est]], dots: true, line: false, color: 'var(--bad)', r: 5 }] : [])]}
                  hlines={[{ y: curves.prevalence, label: `no skill = prevalence ${pct(curves.prevalence, 0)}` }]}
                  xLabel="Recall" yLabel="Precision" xMin={0} xMax={1} yMin={0} yMax={1} />
              </div>
            </div>
          )}
          <h3 className="clu-h3">Confusion matrix</h3>
          <Matrix cm={cm} />
          <Table label="Metrics with 95% confidence intervals" head={['Metric', 'Value', '95% CI', 'Interval', 'Meaning']}
            rows={ROWS.map(([k, name, meaning, how]) => {
              const x = cm.m[k], f = (v) => (isPct(k) ? pct(v, 1) : num(v, 3));
              return [name, f(x.est), Number.isFinite(x.lo) ? `${f(x.lo)} to ${f(x.hi)}` : '', how, meaning];
            })} />
          {dl && <Stats rows={[['AUC', num(dl.auc, 4)], ['DeLong SE', num(dl.se, 4)], ['AUC vs 0.5', `z = ${num(dl.z, 2)}, p ${pv(dl.p)}`], ['Average precision', num(curves.ap, 4)], ['Youden-best threshold', best ? `${best.thr} (J = ${num(best.j, 3)})` : ''], ['Prevalence', pct(curves.prevalence, 1)]]} />}
          <StudySummary {...M.summary(cm, dl)} />
        </>
      )}
      <About method="classifier-evaluation-confusion-matrix-precision-recall-roc-lift" links={[['roc-curve-analysis-for-ui-alerts', 'ROC curve analysis for UI alerts']]}>
        <p><b>Confusion matrix.</b> With TP, FP, FN and TN: accuracy = (TP + TN)/N; precision = TP/(TP + FP); recall = TP/(TP + FN); specificity = TN/(TN + FP); NPV = TN/(TN + FN); F1 = 2TP/(2TP + FP + FN); MCC = (TP·TN − FP·FN)/√((TP + FP)(TP + FN)(TN + FP)(TN + FN)); Cohen's κ = (pₒ − pₑ)/(1 − pₑ) with pₑ from the margins; lift = precision / prevalence; LR+ = recall/(1 − specificity), LR− = (1 − recall)/specificity.</p>
        <p><b>Intervals.</b> Proportions use Wilson score intervals. F1, MCC, κ and balanced accuracy use the delta method under multinomial sampling of the four cells: Var = (1/N)[Σpᵢgᵢ² − (Σpᵢgᵢ)²], with gᵢ the derivative of the metric with respect to cell proportion pᵢ (for κ this equals the Fleiss, Cohen and Everitt 1969 standard error that statsmodels reports). Likelihood ratios use the log method (Simel, Samsa and Matchar 1991). Lift's interval treats prevalence as known.</p>
        <p><b>ROC and AUC.</b> The ROC curve plots recall against the false positive rate at every distinct score; AUC is its area (trapezoid rule), equal to P(score of a random positive &gt; score of a random negative), ties counting ½. The DeLong, DeLong and Clarke-Pearson (1988) variance uses structural components: V10ᵢ = share of negatives scored below positive i (ties ½), V01ⱼ = share of positives scored above negative j; Var(AUC) = s²(V10)/m + s²(V01)/n, with a normal 95% interval. The PR curve plots precision against recall; average precision = Σ(Rₖ − Rₖ₋₁)Pₖ, as sklearn.</p>
        <p><b>When not to use it.</b> Do not judge a classifier on accuracy when classes are imbalanced, and do not pick the threshold and report its metrics on the same data without saying so. ROC curves look optimistic when positives are rare; the PR curve is more informative then. For more than two classes, evaluate each class against the rest.</p>
      </About>
    </>
  );
}

export default SignalsClassifierMetrics;
