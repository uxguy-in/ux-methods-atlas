import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as FC from './decisions-forecast.js';
import { fmt, pctS } from './decisions-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About } from './ui.jsx';
import './decisions.css';

// Example: three researchers forecast 24 product questions ("Will variant B beat control?", "Will the new onboarding
// reach a 40% activation target?") before the answers were known.
const EX = 'forecaster, probability, happened\nAna, 0.6, 1\nBen, 0.7, 1\nChen, 0.5, 1\nAna, 0.5, 1\nBen, 0.7, 1\nChen, 0.6, 1\nAna, 0.4, 0\nBen, 0.1, 0\nChen, 0.4, 0\nAna, 0.5, 0\nBen, 0.4, 0\nChen, 0.5, 0\nAna, 0.8, 1\nBen, 0.9, 1\nChen, 0.6, 1\nAna, 0.2, 1\nBen, 0.05, 1\nChen, 0.2, 1\nAna, 0.3, 0\nBen, 0.1, 0\nChen, 0.4, 0\nAna, 0.4, 1\nBen, 0.4, 1\nChen, 0.6, 1\nAna, 0.3, 0\nBen, 0.05, 0\nChen, 0.5, 0\nAna, 0.7, 1\nBen, 0.95, 1\nChen, 0.6, 1\nAna, 0.2, 0\nBen, 0.05, 0\nChen, 0.5, 0\nAna, 0.2, 0\nBen, 0.05, 0\nChen, 0.3, 0\nAna, 0.2, 1\nBen, 0.05, 1\nChen, 0.4, 1\nAna, 0.8, 1\nBen, 0.95, 1\nChen, 0.7, 1\nAna, 0.6, 1\nBen, 0.9, 1\nChen, 0.5, 1\nAna, 0.9, 1\nBen, 0.95, 1\nChen, 0.8, 1\nAna, 0.4, 0\nBen, 0.3, 0\nChen, 0.4, 0\nAna, 0.5, 0\nBen, 0.6, 0\nChen, 0.6, 0\nAna, 0.4, 0\nBen, 0.3, 0\nChen, 0.6, 0\nAna, 0.5, 0\nBen, 0.1, 0\nChen, 0.5, 0\nAna, 0.8, 1\nBen, 0.9, 1\nChen, 0.7, 1\nAna, 0.6, 1\nBen, 0.7, 1\nChen, 0.7, 1\nAna, 0.4, 1\nBen, 0.4, 1\nChen, 0.4, 1\nAna, 0.6, 1\nBen, 0.95, 1\nChen, 0.6, 1';
// Example answers for the interval exercise (a typical first attempt).
const EX_IV = 'question, low, high, true value\nFitts\' law paper year, 1960, 1975, 1954\nMiller\'s magical number seven, 1950, 1965, 1956\nHick\'s law paper year, 1955, 1970, 1952\nWorld Wide Web proposal, 1988, 1992, 1989\nMacintosh launch, 1983, 1986, 1984\nWCAG 2.0 Recommendation, 2005, 2010, 2008\nUN member states, 180, 200, 193\nBones in the adult body, 150, 250, 206\nEarth to Moon (km), 200000, 300000, 384400\nBoiling point of water (°F), 200, 220, 212';

function CalibrationPlot({ bins }) {
  const W = 420, H = 380, L = 52, R = 14, T = 12, B = 44;
  const sx = (v) => L + v * (W - L - R), sy = (v) => T + (1 - v) * (H - T - B);
  const maxN = Math.max(...bins.map((b) => b.n));
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label="Calibration curve: forecast probability against observed frequency">
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => <g key={v}><line x1={sx(0)} x2={sx(1)} y1={sy(v)} y2={sy(v)} className="grid" /><line x1={sx(v)} x2={sx(v)} y1={sy(0)} y2={sy(1)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{pctS(v)}</text><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{pctS(v)}</text></g>)}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="ea-ref" />
        <text x={sx(0.62)} y={sy(0.7)} className="lbs" transform={`rotate(-42 ${sx(0.62)} ${sy(0.7)})`}>perfect calibration</text>
        {bins.map((b) => <line key={`e${b.key}`} x1={sx(b.f)} x2={sx(b.f)} y1={sy(b.lo)} y2={sy(b.hi)} style={{ stroke: 'var(--c1)', strokeWidth: 1.5, opacity: 0.6 }} />)}
        <polyline points={bins.map((b) => `${sx(b.f)},${sy(b.obs)}`).join(' ')} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2 }} />
        {bins.map((b) => <circle key={b.key} cx={sx(b.f)} cy={sy(b.obs)} r={3 + 5 * Math.sqrt(b.n / maxN)} style={{ fill: 'var(--c1)' }} />)}
        <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">Forecast probability</text>
        <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Observed frequency</text>
      </svg>
      <p className="dc-note">Dot size shows how many forecasts are in each bin; whiskers are 95% Wilson intervals for the observed frequency. Points below the line mean "happened less often than forecast".</p>
    </figure>
  );
}

function IntervalStrip({ rows, pos }) {
  const W = 640, rowH = 24, L = 190, R = 20, T = 18, B = 30, H = T + rows.length * rowH + B;
  const lo = -1, hi = 2, sx = (v) => L + ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (W - L - R);
  return (
    <div className="tl-scroll dc-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="tl-plot" role="img" aria-label="Where each true value fell relative to its interval">
        <rect x={sx(0)} y={T - 6} width={sx(1) - sx(0)} height={rows.length * rowH + 6} className="dc-band" />
        <text x={sx(0)} y={T - 8} className="ax" textAnchor="middle">low</text><text x={sx(1)} y={T - 8} className="ax" textAnchor="middle">high</text>
        {rows.map((r, i) => {
          const y = T + i * rowH + rowH / 2, p = pos[i], inside = p >= 0 && p <= 1;
          return <g key={i}><text x={8} y={y + 4} className="lb">{r.q.length > 26 ? `${r.q.slice(0, 25)}…` : r.q}</text><circle cx={sx(p)} cy={y} r={5} style={{ fill: inside ? 'var(--ok)' : 'var(--bad)' }} />{!Number.isFinite(p) && <text x={sx(p) + (p > 0 ? -12 : 8)} y={y + 4} className="lbs">{p > 0 ? '»' : '«'}</text>}</g>;
        })}
        <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">True value relative to your interval (shaded = inside)</text>
      </svg>
    </div>
  );
}

// ── Forecast calibration and Brier score ──
function DecForecastCalibration() {
  const [mode, setMode] = useState('brier');
  const [text, setText] = useState(EX);
  const [binMode, setBinMode] = useState('auto');
  const [who, setWho] = useState('All');
  const [ivMode, setIvMode] = useState('quiz');
  const [answers, setAnswers] = useState(() => FC.QUIZ.map(() => ({ lo: '', hi: '' })));
  const [revealed, setRevealed] = useState(false);
  const [ivText, setIvText] = useState(EX_IV);
  const loadExample = () => { setText(EX); setBinMode('auto'); setWho('All'); setIvText(EX_IV); setIvMode('custom'); };

  const parsed = useMemo(() => FC.parseForecasts(text), [text]);
  const people = [...new Set(parsed.rows.map((r) => r.who))];
  const rows = who === 'All' ? parsed.rows : parsed.rows.filter((r) => r.who === who);
  const m = rows.length >= 2 ? FC.murphy(rows, binMode) : null;
  const per = people.length > 1 ? FC.byForecaster(parsed.rows) : [];

  const ivRows = ivMode === 'quiz'
    ? (revealed ? FC.QUIZ.map((q, i) => ({ q: q.q, lo: Math.min(+answers[i].lo, +answers[i].hi), hi: Math.max(+answers[i].lo, +answers[i].hi), truth: q.a })).filter((r, i) => answers[i].lo !== '' && answers[i].hi !== '' && Number.isFinite(r.lo) && Number.isFinite(r.hi)) : [])
    : FC.parseIntervals(ivText).rows;
  const ivErr = ivMode === 'custom' ? FC.parseIntervals(ivText).errors : [];
  const iv = ivRows.length ? FC.intervalScore(ivRows) : null;
  const answered = answers.filter((a) => a.lo !== '' && a.hi !== '').length;

  return (
    <div className="dc-root">
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Exercise" value={mode} onChange={setMode} options={[['brier', 'Probability forecasts (Brier)'], ['interval', '90% interval quiz']]} />
      </div>
      {mode === 'brier' ? (
        <>
          <Area label="Forecasts: probability and outcome per line, optionally with the forecaster first" value={text} onChange={setText} rows={8} hint="e.g. Ana, 0.7, 1 or 70%, yes. Outcome 1/yes = it happened." />
          <div className="calc-inputs ea-inputs">
            <Choice label="Calibration bins" value={binMode} onChange={setBinMode} options={[['auto', 'Automatic'], ['unique', 'Each forecast value'], ['ten', 'Ten 10% bins']]} />
            {people.length > 1 && <Choice label="Forecaster" value={who} onChange={setWho} options={[['All', 'Everyone'], ...people.map((p) => [p, p])]} />}
          </div>
          {parsed.errors.length > 0 && <Problem>{parsed.errors.slice(0, 3).join(' · ')}</Problem>}
          {!m ? <Problem>Enter at least two forecasts with outcomes.</Problem> : (
            <>
              <Result big={fmt(m.bs, 3)} tone={m.bs < m.unc ? 'good' : 'bad'} label={`Brier score over ${m.N} forecasts (0 is perfect; always saying the base rate of ${pctS(m.base)} scores ${fmt(m.unc, 3)})`}>
                <Stats rows={[
                  ['Reliability (miscalibration, lower better)', fmt(m.rel, 4)],
                  ['Resolution (higher better)', fmt(m.res, 4)],
                  ['Uncertainty (base rate)', fmt(m.unc, 4)],
                  ...(m.unique ? [] : [['Within-bin term', fmt(m.within, 4)]]),
                  ['Brier skill score vs base rate', fmt(m.bss, 3)],
                  ['Mean forecast vs base rate', `${pctS(m.meanP, 1)} vs ${pctS(m.base, 1)}`],
                ]} />
              </Result>
              <div className="ea-grid2">
                <CalibrationPlot bins={m.bins} />
                <Table label="Calibration by bin" head={['Bin', 'Forecasts', 'Mean forecast', 'Happened', '95% interval']} rows={m.bins.map((b) => [b.label, b.n, pctS(b.f, 1), pctS(b.obs, 1), `${pctS(b.lo)}–${pctS(b.hi)}`])} />
              </div>
              {per.length > 1 && <><h3 className="clu-h3">By forecaster</h3><Table label="Brier score by forecaster" head={['Forecaster', 'Forecasts', 'Brier', 'Reliability', 'Resolution', 'Skill score', 'Mean forecast vs happened']} rows={per.map((p) => [p.who, p.n, fmt(p.bs, 3), fmt(p.rel, 4), fmt(p.res, 4), fmt(p.bss, 2), `${pctS(p.meanP)} vs ${pctS(p.base)}`])} /></>}
              <StudySummary {...FC.brierSummary(m, who === 'All' ? per : [])} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="calc-inputs ea-inputs">
            <Choice label="Questions" value={ivMode} onChange={setIvMode} options={[['quiz', 'Take the built-in quiz'], ['custom', 'Score my own list']]} />
          </div>
          {ivMode === 'quiz' ? (
            <section className="ea-card">
              <h4>Give a range you are 90% sure contains the answer</h4>
              <p className="dc-note">Not a guess with a margin: pick a low and a high value so that you would be surprised (one time in ten) if the answer fell outside.</p>
              <div className="dc-quiz">
                {FC.QUIZ.map((q, i) => (
                  <div key={i} className={`dc-q${revealed ? ' done' : ''}`}>
                    <span>{q.q}</span>
                    <input inputMode="decimal" aria-label={`Low for: ${q.q}`} placeholder="low" value={answers[i].lo} onChange={(e) => { setRevealed(false); setAnswers(answers.map((a, j) => (j === i ? { ...a, lo: e.target.value } : a))); }} />
                    <input inputMode="decimal" aria-label={`High for: ${q.q}`} placeholder="high" value={answers[i].hi} onChange={(e) => { setRevealed(false); setAnswers(answers.map((a, j) => (j === i ? { ...a, hi: e.target.value } : a))); }} />
                    {revealed && <span className={`qtag ${answers[i].lo !== '' && q.a >= Math.min(+answers[i].lo, +answers[i].hi) && q.a <= Math.max(+answers[i].lo, +answers[i].hi) ? 'promote' : 'fix'}`}>{q.a.toLocaleString('en-GB')}</span>}
                  </div>
                ))}
              </div>
              <div className="dc-actions">
                <button type="button" className="btn small" disabled={answered === 0} onClick={() => setRevealed(true)}>Reveal answers ({answered} answered)</button>
                <button type="button" className="btn ghost small" onClick={() => { setAnswers(FC.QUIZ.map(() => ({ lo: '', hi: '' }))); setRevealed(false); }}>Clear</button>
              </div>
            </section>
          ) : (
            <Area label="Your intervals: question (optional), low, high, true value" value={ivText} onChange={setIvText} rows={8} />
          )}
          {ivErr.length > 0 && <Problem>{ivErr.slice(0, 3).join(' · ')}</Problem>}
          {iv && (
            <>
              <Result big={`${iv.hits} of ${iv.n}`} tone={iv.p < 0.05 ? 'bad' : 'good'} label={`intervals contained the true value (${pctS(iv.rate)}; a well-calibrated 90% interval would catch about ${fmt(0.9 * iv.n, 0)})`}>
                <Stats rows={[
                  ['Hit rate, exact 95% CI', `${pctS(iv.lo)} to ${pctS(iv.hi)}`],
                  ['P(this few hits | calibrated 90%)', fmt(iv.p, 4)],
                  ['Truth below / above the range', `${iv.below} / ${iv.above}`],
                ]} />
              </Result>
              <IntervalStrip rows={ivRows} pos={iv.pos} />
              <StudySummary {...FC.intervalSummary(iv)} />
            </>
          )}
        </>
      )}
      <About method="brier-score-and-calibration-analysis" links={[['overconfidence-calibration-for-ux-researchers', 'Overconfidence calibration'], ['probability-inflation-ratio', 'Probability inflation ratio'], ['planning-fallacy-debiasing', 'Planning fallacy debiasing'], ['prediction-markets', 'Prediction markets']]}>
        <p><b>Brier score</b> (Brier 1950): BS = (1/N) Σ (f_i − o_i)², where f_i is the forecast probability and o_i is 1 if the event happened and 0 if not. 0 is perfect; a constant 50% forecast scores 0.25.</p>
        <p><b>Murphy decomposition</b> (Murphy 1973): grouping forecasts into bins k with n_k forecasts, mean forecast f̄_k and observed frequency ō_k, and overall base rate ō: BS = REL − RES + UNC, with reliability REL = (1/N) Σ n_k (f̄_k − ō_k)², resolution RES = (1/N) Σ n_k (ō_k − ō)² and uncertainty UNC = ō(1 − ō). The identity is exact when every forecast in a bin is the same value; with 10% bins a small within-bin term remains (Stephenson, Coelho and Jolliffe 2008) and is shown. Brier skill score = 1 − BS/UNC. The calibration curve plots ō_k against f̄_k with 95% Wilson intervals; the ten-bin option uses the same bin edges as scikit-learn's calibration_curve. Checked against scikit-learn's brier_score_loss and calibration_curve and a numpy decomposition.</p>
        <p><b>90% interval exercise</b> (Alpert and Raiffa 1982; Russo and Schoemaker 1992): the hit rate is the share of intervals containing the true value, with an exact Clopper-Pearson 95% confidence interval, and the one-sided exact binomial p-value P(X ≤ hits | n, 0.9) tests for overconfidence (checked against scipy.stats.binomtest). Quiz answers: Fitts (1954), Journal of Experimental Psychology 47; Miller (1956), Psychological Review 63; Hick (1952), Quarterly Journal of Experimental Psychology 4; Berners-Lee's "Information Management: A Proposal" (March 1989); Macintosh launch (January 1984); WCAG 2.0 W3C Recommendation (11 December 2008); 193 UN member states (since South Sudan joined in 2011); 206 bones; mean Earth–Moon distance 384,400 km (NASA); 212 °F.</p>
        <p><b>When not to use it.</b> Brier scores need forecasts of yes/no events that are later resolved unambiguously; vague questions ("will users like it?") cannot be scored. Compare forecasters only on the same questions. A few dozen forecasts say little about calibration at each probability level.</p>
      </About>
    </div>
  );
}

export default DecForecastCalibration;
