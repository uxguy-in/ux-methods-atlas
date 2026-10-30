import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './sensors-consensus.js';
import { fmt, pctS, toCsv } from './sensors-core.js';
import { EX_CONSENSUS } from './sensors-examples.js';
import { BarChart, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Pick, Result, Stats, Problem, About, Bars } from './ui.jsx';
import { CsvButton, HeatMatrix } from './sensors-ui.jsx';
import './sensors.css';

function SensorsConsensus() {
  const [text, setText] = useState(EX_CONSENSUS);
  const [Lin, setL] = useState('auto');
  const loadExample = () => { setText(EX_CONSENSUS); setL('auto'); };
  const parsed = useMemo(() => C.parseAnswers(text), [text]);
  const enough = parsed.rows.length >= 3 && parsed.questions.length >= 2;
  const r = useMemo(() => (enough ? C.analyse(parsed, Lin === 'auto' ? 0 : Number(Lin)) : null), [parsed, Lin, enough]);
  const ids = parsed.rows.map((x) => x.id);
  const ok = r && !r.error;
  const csv = ok ? toCsv([['respondent', 'competence'], ...ids.map((id, i) => [id, r.D[i].toFixed(4)]), [], ['question', 'consensus_answer', 'posterior', 'majority_answer', 'majority_share'], ...r.key.map((k, j) => [parsed.questions[j], k.answer, k.post.toFixed(4), k.majority, k.majorityShare.toFixed(3)])]) : '';
  const order = ok ? ids.map((id, i) => [id, r.D[i]]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <Area label="Answers: a header row of questions, then one row per respondent" value={text} onChange={setText} rows={8} hint='e.g. "A01, T, F, T …". Any answer labels work (T/F, A–D, 1–5); leave a cell as "." for no answer.' wrap="off" />
      <div className="calc-inputs ea-inputs">
        <Pick label="Answer options per question (for the guessing correction)" value={Lin} onChange={setL} options={[['auto', 'Most options seen in any question'], ['2', '2 (true/false, yes/no)'], ['3', '3'], ['4', '4'], ['5', '5']]} />
      </div>
      {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
      {!enough ? <Problem>Paste a header row and at least three respondents with two or more questions.</Problem> : r.error ? <Problem>{r.error}</Problem> : (
        <>
          <Result big={fmt(r.ratio, 2)} tone={r.ratio >= 3 ? 'good' : 'bad'} label={`ratio of the first to the second eigenvalue (${r.ratio >= 3 ? 'at least 3: one shared answer key fits' : 'below 3: no single shared answer key'})`}>
            <Stats rows={[
              ['Mean competence', fmt(r.meanD, 3)],
              ['Respondents × questions', `${r.n} × ${r.nq}`],
              ['Options per question (L)', r.L],
              ['Negative competence', r.negative.length ? r.negative.join(', ') : 'none'],
              ['Competence above 1 (Heywood case)', r.heywood.length ? r.heywood.join(', ') : 'none'],
              ['Consensus answer ≠ majority', `${r.differs} of ${r.nq} questions`],
            ]} />
          </Result>
          <div className="ea-grid2">
            <figure className="sn-fig">
              <BarChart label="Eigenvalues of the agreement matrix" bars={r.eigen.slice(0, Math.min(8, r.eigen.length)).map((v, i) => ({ label: `${i + 1}`, value: Math.max(0, v), top: fmt(v, 2), tone: i === 0 ? 'ok' : undefined }))} yFmt={(v) => fmt(v, 1)} />
              <p className="sn-note">Scree of the reduced agreement matrix (communalities on the diagonal). A first bar at least three times the second supports a single culture.</p>
            </figure>
            <div>
              <h3 className="clu-h3">Competence (share of answers known, not guessed)</h3>
              <Bars label="Competence by respondent" rows={order.map(([id, d]) => [id, Math.max(0, Math.min(1, d)), fmt(d, 2), d < 0 ? 'bad' : d < 0.5 ? 'warn' : undefined])} />
            </div>
          </div>
          <h3 className="clu-h3">Answer key</h3>
          <Table label="Culturally correct answer key" head={['Question', 'Consensus answer', 'Posterior probability', 'Majority answer', 'Majority share', 'Answered']}
            rows={r.key.map((k, j) => ({ cls: k.answer !== k.majority ? 'hl' : '', cells: [parsed.questions[j], k.answer, fmt(k.post, 3), k.answer !== k.majority ? <span key="m" className="qtag opp">{k.majority}</span> : k.majority, pctS(k.majorityShare, 0), k.answered] }))} />
          <details className="calc-about"><summary>Agreement matrix corrected for guessing</summary>
            <HeatMatrix label="Agreement corrected for guessing" rowNames={ids} colNames={ids} rows={r.ag.Ms} fmtCell={(v) => fmt(v, 2)} max={1} diag />
          </details>
          <div className="sn-actions"><CsvButton name="consensus-competence-and-key.csv" csv={csv} /></div>
          <StudySummary {...C.consensusSummary(r, ids)} />
        </>
      )}
      <About method="cultural-consensus-analysis" links={[['free-listing-and-cultural-salience-analysis', 'Free listing and cultural salience'], ['expert-and-key-informant-interviewing', 'Expert and key informant interviewing']]}>
        <p><b>Model</b> (Romney, Weller and Batchelder 1986; Batchelder and Romney 1988): each respondent i knows the culturally correct answer with probability D<sub>i</sub> (competence) and otherwise guesses uniformly among L options. Then the share of matching answers between two respondents is M<sub>ij</sub> = D<sub>i</sub>D<sub>j</sub> + (1 − D<sub>i</sub>D<sub>j</sub>)/L, so the agreement corrected for guessing, M*<sub>ij</sub> = (L·M<sub>ij</sub> − 1)/(L − 1), equals D<sub>i</sub>D<sub>j</sub>. Matches are counted over the questions both answered.</p>
        <p><b>Competence</b> comes from a one-factor minimum residual solution of M*: loadings λ minimise Σ<sub>i≠j</sub>(M*<sub>ij</sub> − λ<sub>i</sub>λ<sub>j</sub>)², found by iterated principal axis factoring with the diagonal replaced by λ². The <b>eigenvalue ratio</b> is the first to second eigenvalue of that reduced matrix; the rule of thumb is a ratio of at least 3, all competences positive and a mean around 0.5 or more (Weller 2007).</p>
        <p><b>Answer key.</b> For each question and option k, with equal priors: log P(k) ∝ Σ over respondents of log(D<sub>i</sub> + (1 − D<sub>i</sub>)/L) if they chose k, else log((1 − D<sub>i</sub>)/L), with D clipped to [0.001, 0.999]. The consensus answer is the option with the highest posterior, which can differ from the simple majority when competent respondents disagree with the rest.</p>
        <p><b>Checked</b> against factor_analyzer (minres, within 1e-6), the exact least-squares minimiser from scipy (within 1e-7), numpy eigenvalues and an independent numpy answer key (identical key and posteriors).</p>
        <p><b>When not to use it.</b> For opinions or preferences with no shared "right" answer, questions with very unequal difficulty, or fewer than about 10 respondents. A good fit says the group agrees, not that it is right.</p>
      </About>
    </div>
  );
}

export default SensorsConsensus;
