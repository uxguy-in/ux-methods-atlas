import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import { CATALOG } from '../catalog.js';
import { useMethods } from '../../hooks.js';
import * as TS from './statsbench-selector.js';
import { Result, About } from './ui.jsx';
import './statsbench.css';

const calcName = (id) => CATALOG.find((c) => c.id === id)?.name || TS.BATCH2[id] || id;
const humanise = (id) => { const s = id.replace(/-/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

// ── Statistical test selector ──
function SbTestSelector() {
  const [a, setA] = useState({});
  const { data: methods } = useMethods();
  const names = useMemo(() => Object.fromEntries((methods || []).map((m) => [m.id, m.name])), [methods]);
  const qs = TS.flow(a);
  const done = TS.complete(a);
  const rec = done ? TS.recommend(a) : null;
  const answer = (k, v) => {
    // Changing an answer clears the answers to questions that no longer apply.
    const next = { ...a, [k]: v }, keep = {};
    for (const q of TS.flow(next)) if (next[q] !== undefined) keep[q] = next[q];
    for (let i = 0; i < 4; i++) for (const q of TS.flow(keep)) if (next[q] !== undefined) keep[q] = next[q];
    setA(keep);
  };
  return (
    <>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={() => setA({ goal: 'compare', outcome: 'continuous', groups: '2', paired: 'no', size: 'small', shape: 'skewed' })}>Load example (task times, two designs)</button>
        {Object.keys(a).length > 0 && <button type="button" className="btn ghost small" onClick={() => setA({})}>Start again</button>}</div>
      <div className="sb-flow">
        {qs.map((k) => (
          <div key={k} className="sb-q" role="radiogroup" aria-label={TS.QUESTIONS[k].label}>
            <span>{TS.QUESTIONS[k].label}</span>
            <div className="sb-opts">
              {TS.QUESTIONS[k].options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={a[k] === v} className={a[k] === v ? 'on' : ''} onClick={() => answer(k, v)}>{l}</button>)}
            </div>
          </div>
        ))}
      </div>
      {rec && (
        <>
          <Result big={rec.test} label={rec.why} tone="good">
            <div className="tl-row sb-row sb-rec"><Link className="btn small" to={`/calculators/${rec.calc}`}>Open {calcName(rec.calc)}</Link></div>
            {rec.alts.length > 0 && (
              <>
                <p>Alternatives:</p>
                <ul className="sb-alts">{rec.alts.map(([t, id]) => <li key={t}>{id ? <Link to={`/calculators/${id}`}>{t}</Link> : t}{id ? ` (${calcName(id)})` : ' (not built in yet)'}</li>)}</ul>
              </>
            )}
            {rec.methods.length > 0 && <p>In the atlas: {rec.methods.map((m, i) => <span key={m}>{i > 0 && ', '}<Link to={`/methods/${m}`}>{names[m] || humanise(m)}</Link></span>)}</p>}
          </Result>
          <StudySummary {...TS.selectorSummary(a, rec, calcName(rec.calc))} />
        </>
      )}
      {!rec && <p className="tl-note">Answer the questions above; the recommendation appears as soon as there is enough to go on.</p>}
      <About method="statistical-test-selection-by-design" links={[['ordinal-vs-interval-distinction', 'Ordinal vs interval data'], ['statistical-power-analysis', 'Statistical power analysis']]}>
        <p><b>How it chooses.</b> The test follows from four things: what you want to know (compare, relate, predict, estimate, time to an event, agreement, equivalence), the type of outcome (yes/no, numeric, a rating item, a count, a category), the design (how many groups; the same or different people) and, for numeric outcomes in small samples, whether the data are skewed. Paired designs use within-person tests (paired t, Wilcoxon, McNemar, Friedman, Cochran's Q); skewed small samples use log transforms, rank tests or resampling; yes/no outcomes use proportion tests; counts use Poisson or negative binomial models. The rules follow Sauro and Lewis (2016, <i>Quantifying the User Experience</i>, ch. 5 to 10) and standard textbooks.</p>
        <p>Every recommendation links to a calculator on this site; <code>npm run check:statsbench</code> walks every possible set of answers and fails if any link points to a calculator or atlas method that does not exist. Equivalence and non-inferiority go to the TOST in the A/B test health checks rather than a second copy here.</p>
        <p><b>When not to use it.</b> It covers the common designs in UX research, not mixed designs with several factors, clustered data (several tasks per person analysed together) or multilevel models; for those, get a statistician involved before you collect data. Pick the test before seeing the results.</p>
      </About>
    </>
  );
}

export default SbTestSelector;
