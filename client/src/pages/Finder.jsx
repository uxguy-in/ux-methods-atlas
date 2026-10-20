import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useMeta } from '../hooks.js';
import MethodCard, { Status } from '../components/MethodCard.jsx';

const QUESTIONS = [
  {
    id: 'goal',
    title: 'What do you need to find out?',
    help: 'Pick up to two. This matters most.',
    multi: 2,
    options: [
      { v: 'explore', label: 'Explore an unknown space', hint: 'New domain, new audience, no clear questions yet', goals: ['explore-unknowns', 'map-context'] },
      { v: 'why', label: 'Understand why people do what they do', hint: 'Motivations, mental models, decisions', goals: ['understand-why', 'model-cognition'] },
      { v: 'usability', label: 'Find usability problems', hint: 'Where people struggle, slip or give up', goals: ['evaluate-usability', 'diagnose-errors'] },
      { v: 'attitudes', label: 'Measure attitudes or satisfaction', hint: 'Trust, perceived ease, preference, sentiment', goals: ['measure-attitudes', 'validate-instrument'] },
      { v: 'behaviour', label: 'Measure what people actually do', hint: 'Behaviour, engagement, drift over time', goals: ['measure-behavior', 'monitor-over-time'] },
      { v: 'impact', label: 'Prove a change caused an effect', hint: 'Redesign impact, A/B tests, attribution', goals: ['prove-causation', 'compare-designs'] },
      { v: 'predict', label: 'Predict performance before building', hint: 'Time on task, load, errors, without users', goals: ['predict-performance', 'model-cognition'] },
      { v: 'prioritise', label: 'Decide what to build or fix first', hint: 'Prioritisation, trade-offs, roadmap calls', goals: ['prioritize', 'decision-support'] },
      { v: 'segments', label: 'Find the different kinds of users', hint: 'Segments, archetypes, behavioural clusters', goals: ['segment-users'] },
      { v: 'risk', label: 'Assess risk, errors or harm', hint: 'Safety, failure modes, dark patterns', goals: ['assess-risk', 'diagnose-errors'] },
      { v: 'ia', label: 'Structure content and navigation', hint: 'IA, labels, findability', goals: ['information-architecture'] },
      { v: 'synthesis', label: 'Make sense of data I already have', hint: 'Transcripts, tickets, logs, survey text', goals: ['synthesize-data'] },
      { v: 'ideas', label: 'Generate ideas or futures', hint: 'Co-design, speculative and participatory work', goals: ['generate-ideas'] },
    ],
  },
  {
    id: 'stage',
    title: 'Where is the product right now?',
    options: [
      { v: 'strategy', label: 'Strategy', hint: 'Deciding where to play' },
      { v: 'discovery', label: 'Discovery', hint: 'Understanding people and problems' },
      { v: 'definition', label: 'Definition', hint: 'Framing requirements and concepts' },
      { v: 'design', label: 'Design', hint: 'Shaping and prototyping solutions' },
      { v: 'evaluation', label: 'Evaluation', hint: 'Testing what has been designed' },
      { v: 'post-launch', label: 'Live', hint: 'Shipped and in use' },
    ],
  },
  {
    id: 'participants',
    title: 'Who or what can you get access to?',
    options: [
      { v: 'none', label: 'Nobody, just the team', hint: 'Expert and analytical methods' },
      { v: 'few', label: 'A handful of users', hint: 'Up to about 12 people' },
      { v: 'moderate', label: 'A decent sample', hint: 'Roughly 13 to 100 people' },
      { v: 'large', label: 'Hundreds or more', hint: 'Surveys and experiments at scale' },
      { v: 'logs', label: 'Logs and analytics', hint: 'Behavioural data already exists' },
      { v: 'any', label: 'Not a constraint', hint: 'Whatever the method needs' },
    ],
  },
  {
    id: 'time',
    title: 'How long do you have?',
    options: [
      { v: 'hours', label: 'Hours', hint: 'Today' },
      { v: 'days', label: 'Days', hint: 'This sprint' },
      { v: 'weeks', label: 'Weeks', hint: 'A proper study' },
      { v: 'months', label: 'Months', hint: 'A research programme' },
    ],
  },
  {
    id: 'data',
    title: 'What kind of evidence will convince people?',
    options: [
      { v: 'qualitative', label: 'Stories and depth', hint: 'Qualitative' },
      { v: 'quantitative', label: 'Numbers', hint: 'Quantitative' },
      { v: 'mixed', label: 'Both', hint: 'Mixed methods' },
      { v: 'any', label: 'Whatever is right', hint: 'Let the method decide' },
    ],
  },
  {
    id: 'expertise',
    title: 'How comfortable is the team with rigour?',
    options: [
      { v: 'beginner', label: 'New to research', hint: 'Keep it approachable' },
      { v: 'intermediate', label: 'Experienced', hint: 'Comfortable with structured methods' },
      { v: 'advanced', label: 'Methodologist', hint: 'Statistics, modelling, theory welcome' },
    ],
  },
  {
    id: 'appetite',
    title: 'How adventurous should the advice be?',
    options: [
      { v: 'proven', label: 'Stick to proven methods', hint: 'What most teams use today' },
      { v: 'mix', label: 'Mix in the lost ones', hint: 'Familiar core, rigorous additions' },
      { v: 'lost', label: 'Show me the lost methods', hint: 'Borrowed, forgotten, unmigrated' },
    ],
  },
];

const STORE = 'atlas-finder';

function toAnswers(sel) {
  const goals = [...new Set((sel.goal || []).flatMap((v) => QUESTIONS[0].options.find((o) => o.v === v)?.goals || []))];
  const { goal, ...rest } = sel;
  return { ...rest, goals };
}

export default function Finder() {
  const { data: meta } = useMeta();
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(STORE)) || {}; } catch { return {}; }
  });
  const [brief, setBrief] = useState('');
  const [recs, setRecs] = useState(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const done = step >= QUESTIONS.length;
  const q = QUESTIONS[step];

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(sel)); } catch { /* storage unavailable */ }
  }, [sel]);

  useEffect(() => {
    if (!done) return;
    post('/api/recommend', { answers: toAnswers(sel), brief }).then(setRecs).catch((e) => setError(e.message));
    // brief is applied when the AI plan is requested, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, sel]);

  const pick = (v) => {
    if (q.multi) {
      const cur = sel[q.id] || [];
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].slice(-q.multi);
      setSel({ ...sel, [q.id]: next });
    } else {
      setSel({ ...sel, [q.id]: v });
      setTimeout(() => setStep((s) => s + 1), 160);
    }
  };

  async function askAI() {
    setBusy(true); setError(''); setPlan(null);
    try {
      const answers = toAnswers(sel);
      const [p, r] = await Promise.all([post('/api/brief', { answers, brief }), post('/api/recommend', { answers, brief })]);
      setPlan(p); setRecs(r);
    } catch (e) {
      setError(e.message);
      post('/api/recommend', { answers: toAnswers(sel), brief }).then(setRecs).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const reset = () => { setSel({}); setStep(0); setRecs(null); setPlan(null); setBrief(''); };

  if (!done) {
    const val = sel[q.id];
    return (
      <div className="wrap finder">
        <div className="progress" aria-hidden="true">
          {QUESTIONS.map((_, i) => <span key={i} className={i <= step ? 'done' : ''} />)}
        </div>
        <p className="eyebrow">Question {step + 1} of {QUESTIONS.length}</p>
        <div className="question">
          <h2>{q.title}</h2>
          <p className="help">{q.help || 'Choose one. You can skip any question.'}</p>
          <div className="options" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.title}>
            {q.options.map((o) => {
              const on = q.multi ? (val || []).includes(o.v) : val === o.v;
              return (
                <button key={o.v} className={`option${on ? ' on' : ''}`} onClick={() => pick(o.v)} aria-pressed={on}>
                  <b>{o.label}</b>
                  {o.hint && <small>{o.hint}</small>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="finder-nav">
          <button className="btn ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={() => setStep((s) => s + 1)}>Skip</button>
            {q.multi && <button className="btn" onClick={() => setStep((s) => s + 1)} disabled={!(val || []).length}>Next</button>}
          </div>
        </div>
      </div>
    );
  }

  const chips = QUESTIONS.flatMap((qq, i) => {
    const v = sel[qq.id];
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    return vals.map((x) => (
      <button key={qq.id + x} className="chip" onClick={() => setStep(i)} title="Change this answer">
        {qq.options.find((o) => o.v === x)?.label}
      </button>
    ));
  });

  return (
    <div className="wrap finder">
      <p className="eyebrow">Your brief</p>
      <h1 className="h1" style={{ maxWidth: '16ch' }}>Now tell it what's going on.</h1>
      <p className="lede" style={{ margin: '18px 0 26px' }}>
        Describe the product, the problem and the decision you need to make. Plain words are fine.
      </p>
      <div className="answers-summary">
        {chips}
        <button className="chip" onClick={reset}>Start over</button>
      </div>
      <label htmlFor="brief" className="eyebrow" style={{ display: 'block', color: 'var(--ink-3)' }}>Problem brief</label>
      <textarea
        id="brief"
        className="brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="e.g. On our trading app, first-time investors sometimes tap Sell when they meant Buy. Support tickets spiked after the order screen redesign. We need to know whether the redesign caused it and what to change before the next release."
      />
      <div className="finder-nav">
        <span className="muted" style={{ fontSize: 14, alignSelf: 'center' }}>
          {meta?.static ? 'The AI research direction runs in the downloadable version with an API key. Matches here still update with your brief.' : meta && !meta.ai ? 'The AI brief is off on this server (no API key). Rule-based matches still update with your brief.' : 'Uses Claude to read your brief against the atlas.'}
        </span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={() => post('/api/recommend', { answers: toAnswers(sel), brief }).then(setRecs)} disabled={!brief.trim()}>
            Refine matches
          </button>
          {!meta?.static && (
            <button className="btn accent" onClick={askAI} disabled={busy || brief.trim().length < 20}>
              {busy ? <><span className="spinner" /> Thinking</> : 'Get a research direction'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="notice error" style={{ marginTop: 24 }}>{error}</div>}
      {plan && <Plan plan={plan} />}

      {recs && (
        <>
          <section className="shelf">
            <h2>Best fit for your answers</h2>
            <p>The methods that match your goal, access, time and evidence needs.</p>
            <div className="grid">{recs.primary.map((m) => <MethodCard key={m.id} m={m} why={m.why} />)}</div>
          </section>
          {recs.lost.length > 0 && (
            <section className="shelf">
              <h2>Lost and borrowed methods to add rigour</h2>
              <p>Forgotten, siloed or unmigrated methods that fit the same situation.</p>
              <div className="grid">{recs.lost.map((m) => <MethodCard key={m.id} m={m} why={m.why} />)}</div>
            </section>
          )}
          {recs.rest.length > 0 && (
            <section className="shelf">
              <h2>Also worth a look</h2>
              <div className="grid">{recs.rest.map((m) => <MethodCard key={m.id} m={m} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Plan({ plan }) {
  return (
    <article className="ai-plan" aria-live="polite">
      <p className="eyebrow">Research direction</p>
      <h2>{plan.decision}</h2>
      <p className="lede" style={{ fontSize: 19, maxWidth: '70ch' }}>{plan.reframedProblem}</p>

      <h3>Research questions</h3>
      <ul>{plan.researchQuestions.map((x) => <li key={x}>{x}</li>)}</ul>

      {plan.assumptionsToTest?.length > 0 && (
        <>
          <h3>Assumptions to test</h3>
          <ul>{plan.assumptionsToTest.map((x) => <li key={x}>{x}</li>)}</ul>
        </>
      )}

      <h3>The plan</h3>
      <div className="plan-steps">
        {plan.plan.map((p, i) => (
          <div key={p.methodId + i} className="plan-step">
            <span className="num">{i + 1}</span>
            <div>
              <span className="mono muted" style={{ fontSize: 13 }}>{p.phase}</span>
              <h4><Link to={`/methods/${p.methodId}`}>{p.method?.name || p.methodId}</Link> <Status value={p.method?.status} /></h4>
              <p><span className="lbl">Why</span>{p.why}</p>
              <p><span className="lbl">How</span>{p.how}</p>
              <p><span className="lbl">You get</span>{p.output}</p>
            </div>
          </div>
        ))}
      </div>

      {plan.lostMethodPicks?.length > 0 && (
        <>
          <h3>Lost methods that would add rigour</h3>
          <div className="plan-steps">
            {plan.lostMethodPicks.map((p) => (
              <div key={p.methodId} className="plan-step">
                <span className="num" style={{ background: 'var(--ink)' }}>✦</span>
                <div>
                  <h4><Link to={`/methods/${p.methodId}`}>{p.method?.name}</Link> <Status value={p.method?.status} /></h4>
                  <p>{p.why}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="split" style={{ marginTop: 28 }}>
        <div className="panel bad"><h3>Watch out for</h3><ul>{plan.watchOuts.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div className="panel good"><h3>You'll know it worked when</h3><ul>{plan.successCriteria.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
    </article>
  );
}
