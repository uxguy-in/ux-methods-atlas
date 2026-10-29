import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../api.js';
import { useMeta, useRemembered } from '../hooks.js';
import MethodCard, { Status } from '../components/MethodCard.jsx';
import { forgetVisitorKey, getVisitorKey, isRemembered, looksLikeKey, setVisitorKey } from '../visitor-key.js';

// Shared with the study planner, which asks the same goal and material questions.
export const QUESTIONS = [
  {
    id: 'goal',
    short: 'What you need to find out',
    title: 'What do you need to find out?',
    help: 'Pick up to two. This matters most.',
    multi: 2,
    options: [
      { v: 'explore', label: 'Explore an unknown space', hint: 'New domain, new audience, no clear questions yet', goals: ['explore-unknowns', 'map-context'] },
      { v: 'why', label: 'Understand why people do what they do', hint: 'Motivations, mental models, decisions', goals: ['understand-why', 'model-cognition'] },
      { v: 'usability', label: 'Find usability problems', hint: 'Where people struggle, slip or give up', goals: ['evaluate-usability', 'diagnose-errors'] },
      { v: 'attitudes', label: 'Measure attitudes or satisfaction', hint: 'Trust, perceived ease, preference, sentiment', goals: ['measure-attitudes', 'validate-instrument'] },
      { v: 'behaviour', label: 'Measure what people actually do', hint: 'Behaviour, engagement, drift over time', goals: ['measure-behavior', 'monitor-over-time'] },
      { v: 'compare', label: 'Compare two or more designs', hint: 'Which version works better, and by how much', goals: ['compare-designs', 'evaluate-usability'] },
      { v: 'impact', label: 'Prove a change caused an effect', hint: 'Redesign impact, A/B tests, attribution', goals: ['prove-causation', 'compare-designs'] },
      { v: 'predict', label: 'Predict performance before building', hint: 'Time on task, load, errors, without users', goals: ['predict-performance', 'model-cognition'] },
      { v: 'prioritise', label: 'Decide what to build or fix first', hint: 'Prioritisation, trade-offs, roadmap calls', goals: ['prioritize', 'decision-support'] },
      { v: 'segments', label: 'Find the different kinds of users', hint: 'Segments, archetypes, behavioural clusters', goals: ['segment-users'] },
      { v: 'risk', label: 'Assess risk, errors or harm', hint: 'Safety, failure modes, dark patterns', goals: ['assess-risk', 'diagnose-errors'] },
      { v: 'ia', label: 'Structure content and navigation', hint: 'IA, labels, findability', goals: ['information-architecture'] },
      { v: 'synthesis', label: 'Make sense of data I already have', hint: 'Transcripts, tickets, logs, survey text', goals: ['synthesize-data'] },
      { v: 'ideas', label: 'Generate ideas or futures', hint: 'Co-design, speculative and participatory work', goals: ['generate-ideas'] },
      { v: 'share', label: 'Turn findings into decisions', hint: 'Synthesis people act on, reports, alignment', goals: ['communicate-findings', 'decision-support'] },
    ],
  },
  {
    id: 'material',
    short: 'What you have',
    title: 'What do you have to work with?',
    help: 'Choose the closest. It rules out methods that need something you do not have yet.',
    options: [
      { v: 'none', label: 'Nothing built yet', hint: 'A problem space, a hunch, people to talk to' },
      { v: 'concept', label: 'Ideas, sketches or content', hint: 'Concepts, flows, labels, copy' },
      { v: 'prototype', label: 'A prototype or design', hint: 'Clickable or static, ready to test' },
      { v: 'live', label: 'A live product', hint: 'Shipped and in real use' },
      { v: 'data', label: 'Data I already have', hint: 'Analytics, logs, tickets, transcripts, survey answers' },
    ],
  },
  {
    id: 'participants',
    short: 'Who you can reach',
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
    short: 'Time',
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
    short: 'Evidence that convinces',
    title: 'What kind of evidence will convince people?',
    options: [
      { v: 'qualitative', label: 'Stories and depth', hint: 'Qualitative' },
      { v: 'quantitative', label: 'Numbers', hint: 'Quantitative' },
      { v: 'mixed', label: 'Both', hint: 'Mixed methods' },
      { v: 'any', label: 'Whatever is right', hint: 'Let the method decide' },
    ],
  },
  {
    id: 'level',
    short: 'Who runs it',
    title: 'Who will run the research?',
    help: 'You will see picks for every level. This one is shown first.',
    options: [
      { v: 'newcomer', label: 'Someone new to research', hint: 'A designer, PM or junior researcher' },
      { v: 'mid', label: 'A mid-level researcher', hint: 'Comfortable with structured methods' },
      { v: 'expert', label: 'A senior or specialist', hint: 'Statistics, modelling and theory welcome' },
    ],
  },
  {
    id: 'appetite',
    short: 'How adventurous',
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
  const [step, setStep] = useRemembered('step', 0);
  // Every visit starts blank, so no answer appears chosen before the person chooses it.
  const [sel, setSel] = useRemembered('answers', {});
  const [editing, setEditing] = useRemembered('editing', false); // changing one answer from the summary
  const [brief, setBrief] = useRemembered('brief', '');
  const [recs, setRecs] = useState(null);
  const [plan, setPlan] = useRemembered('plan', null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seed, setSeed] = useRemembered('seed', () => Math.floor(Math.random() * 1e9));
  const shown = useRef({ key: '', ids: [] }); // methods already shown for the current answers
  // Question transitions: the chosen answer stays visible for a beat, the question slides out,
  // then the next one slides in from the direction of travel.
  const [leaving, setLeaving] = useState(false);
  const [dir, setDir] = useState(1);
  const busyMove = useRef(false);
  const go = (to) => {
    if (busyMove.current || to === step) return;
    busyMove.current = true;
    setDir(to > step ? 1 : -1);
    setLeaving(true);
    setTimeout(() => {
      setStep(to);
      setLeaving(false);
      busyMove.current = false;
      const top = document.querySelector('.finder');
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
  };

  const [picked, setPicked] = useState(null);
  const done = step >= QUESTIONS.length;
  // After a change made from the summary, go straight back to it instead of through the rest.
  const advance = () => { if (editing) { setEditing(false); go(QUESTIONS.length); } else go(step + 1); };
  const change = (i) => { setEditing(true); go(i); };
  const q = QUESTIONS[step];

  useEffect(() => {
    try { sessionStorage.removeItem(STORE); } catch { /* answers were kept here by earlier versions */ }
  }, []);

  useEffect(() => {
    if (!done) return;
    const key = JSON.stringify(sel);
    if (shown.current.key !== key) shown.current = { key, ids: [] };
    post('/api/recommend', { answers: toAnswers(sel), brief, seed, exclude: shown.current.ids }).then(setRecs).catch((e) => setError(e.message));
    // brief is applied when the AI plan is requested, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, sel, seed]);
  const shuffle = () => {
    const ids = Object.values(recs || {}).flat().map((m) => m.id);
    shown.current.ids = [...new Set([...shown.current.ids, ...ids])];
    setSeed((n) => n + 1);
  };

  const pick = (v) => {
    if (q.multi) {
      const cur = sel[q.id] || [];
      const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].slice(-q.multi);
      setSel({ ...sel, [q.id]: next });
    } else {
      if (picked) return;
      setSel({ ...sel, [q.id]: v });
      setPicked(v);
      // Hold the confirmed choice long enough to register before the next question slides in.
      setTimeout(() => { setPicked(null); advance(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 520);
    }
  };

  const [visitorKey, setKeyState] = useState(getVisitorKey);
  const [showKey, setShowKey] = useState(false);
  const serverKey = Boolean(meta?.ai);
  const needKey = meta && !serverKey && !visitorKey;

  async function askAI() {
    if (needKey) { setShowKey(true); return; }
    setBusy(true); setError(''); setPlan(null);
    try {
      const answers = toAnswers(sel);
      // On a server without its own key, the visitor's key travels with this one request only.
      const headers = !serverKey && visitorKey ? { 'x-visitor-api-key': visitorKey } : {};
      const [p, r] = await Promise.all([post('/api/brief', { answers, brief }, headers), post('/api/recommend', { answers, brief, seed })]);
      setPlan(p); setRecs(r);
    } catch (e) {
      setError(e.message);
      if (e.needsKey) setShowKey(true);
      post('/api/recommend', { answers: toAnswers(sel), brief, seed }).then(setRecs).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  const reset = () => { setSel({}); setEditing(false); setDir(-1); setStep(0); setRecs(null); setPlan(null); setBrief(''); };

  if (!done) {
    const val = sel[q.id];
    const hasAnswer = Array.isArray(val) ? val.length > 0 : Boolean(val);
    return (
      <div className="wrap finder">
        <div className="progress" aria-hidden="true">
          {QUESTIONS.map((_, i) => <span key={i} className={i <= step ? 'done' : ''} />)}
        </div>
        <div key={step} className={`question-stage${leaving ? ' leaving' : ''}`} style={{ '--dir': dir }}>
        <p className="eyebrow">Question {step + 1} of {QUESTIONS.length}</p>
        <div className="question">
          <h2>{q.title}</h2>
          <p className="help">{q.help || 'Choose one, or skip it if it does not matter.'}</p>
          <div className="options" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.title}>
            {q.options.map((o) => {
              const on = q.multi ? (val || []).includes(o.v) : val === o.v;
              return (
                <button key={o.v} className={`option${on ? ' on' : ''}${picked === o.v ? ' picked' : ''}`} onClick={() => pick(o.v)} aria-pressed={on}>
                  <b>{o.label}</b>
                  {o.hint && <small>{o.hint}</small>}
                </button>
              );
            })}
          </div>
        </div>
        </div>
        <div className="finder-nav question-nav">
          {editing
            ? <button className="btn ghost" onClick={() => { setEditing(false); go(QUESTIONS.length); }}>Back to your answers</button>
            : <button className="btn ghost" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>Back</button>}
          <div className="question-nav-end">
            <button type="button" className="skip-link" onClick={() => { setSel({ ...sel, [q.id]: undefined }); advance(); }}>
              {editing ? 'Clear this answer' : 'Skip this question'}
            </button>
            {q.multi && (
              <button className="btn accent" onClick={advance} disabled={!hasAnswer}>
                {editing ? 'Save' : step === QUESTIONS.length - 1 ? 'See methods' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap finder">
      <div className="question-stage finder-done" style={{ '--dir': dir }}>
      <div className="progress" aria-hidden="true">
        {QUESTIONS.map((_, i) => <span key={i} className="done" />)}
      </div>
      <section className="answers-bar" aria-label="Your answers">
        <span className="answers-bar-label">Your answers</span>
        <ul className="answers-chips">
          {QUESTIONS.map((qq, i) => {
            const v = sel[qq.id];
            const vals = (Array.isArray(v) ? v : v ? [v] : []).map((x) => qq.options.find((o) => o.v === x)?.label).filter(Boolean);
            return (
              <li key={qq.id}>
                <button type="button" className={`answer-chip${vals.length ? '' : ' skipped'}`} onClick={() => change(i)} title={`Change: ${qq.short}`}>
                  {vals.length > 0 && <span className="sr-only">{qq.short}: </span>}{vals.length ? vals.join(' + ') : `${qq.short}: any`}
                  <span className="answer-chip-edit" aria-hidden="true">Change</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="skip-link" onClick={reset}>Start over</button>
      </section>

      <p className="eyebrow" style={{ marginTop: 36 }}>Your brief</p>
      <h1 className="h1" style={{ maxWidth: '20ch' }}>Now tell it what's going on.</h1>
      <p className="lede" style={{ margin: '14px 0 22px' }}>
        Describe the product, the problem and the decision you need to make. Plain words are fine.
      </p>
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
          {serverKey ? 'Uses Claude to read your brief against the atlas.' : visitorKey
            ? <>Uses Claude with your own API key. <button type="button" className="linklike" onClick={() => setShowKey((v) => !v)}>Change key</button></>
            : 'The AI research direction uses your own Anthropic API key. Matches below work without one.'}
        </span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={() => post('/api/recommend', { answers: toAnswers(sel), brief, seed }).then(setRecs)} disabled={!brief.trim()}>
            Refine matches
          </button>
          <button className="btn accent" onClick={askAI} disabled={busy || (!needKey && brief.trim().length < 20)}>
            {busy ? <><span className="spinner" /> Thinking</> : needKey ? 'Add your API key' : 'Get a research direction'}
          </button>
        </div>
      </div>
      {!serverKey && (showKey || (needKey && error)) && (
        <KeyPanel
          current={visitorKey}
          onSave={(k, remember) => { setVisitorKey(k, remember); setKeyState(k); setShowKey(false); setError(''); }}
          onForget={() => { forgetVisitorKey(); setKeyState(''); }}
          onClose={() => setShowKey(false)}
        />
      )}

      {error && <div className="notice error" style={{ marginTop: 24 }}>{error}</div>}
      {plan && <Plan plan={plan} />}

      {recs && <Shelves recs={recs} level={sel.level} onShuffle={shuffle} />}
      {recs && <PlanCta sel={sel} />}
      </div>
    </div>
  );
}

// Hands the finder answers to the study planner, so the roadmap starts from the same situation.
function PlanCta({ sel }) {
  const a = {
    goal: sel.goal?.length ? sel.goal : undefined,
    material: sel.material,
    participants: sel.participants !== 'any' ? sel.participants : undefined,
    time: sel.time,
    approach: ['qualitative', 'quantitative', 'mixed'].includes(sel.data) ? sel.data : undefined,
    expertise: sel.level,
  };
  const known = Object.fromEntries(Object.entries(a).filter(([, v]) => v));
  return (
    <aside className="plan-cta">
      <div>
        <p className="eyebrow">Next step</p>
        <h2>Turn these methods into a study plan.</h2>
        <p>Frame the question, add your constraints, and get a phased roadmap from framing to reporting, with similar methods to swap in.</p>
      </div>
      <Link to={`/plan?a=${encodeURIComponent(JSON.stringify(known))}`} className="btn accent">Plan my study</Link>
    </aside>
  );
}

function KeyPanel({ current, onSave, onForget, onClose }) {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(isRemembered);
  const [bad, setBad] = useState(false);
  const save = (e) => {
    e.preventDefault();
    if (!looksLikeKey(key)) { setBad(true); return; }
    onSave(key, remember);
  };
  return (
    <form className="key-panel" onSubmit={save}>
      <h3>Use your own Anthropic API key</h3>
      <p>
        The AI research direction runs on Claude and is paid for by your own Anthropic account, usually a few cents
        per brief. Your key stays in this browser and is sent only to Anthropic with each request. It is never sent to
        this site or stored anywhere else.
      </p>
      <label className="field">
        <span>API key</span>
        <input
          type="password" autoComplete="off" spellCheck={false} value={key}
          className={bad ? 'invalid' : ''}
          onChange={(e) => { setKey(e.target.value); setBad(false); }}
          placeholder={current ? 'A key is saved. Paste a new one to replace it.' : 'sk-ant-...'}
        />
        {bad && <small className="form-error">That does not look like an Anthropic API key. It starts with sk-ant-.</small>}
      </label>
      <label className="radio">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember it on this device. Leave unticked on a shared computer; the key is then forgotten when you close the tab.
      </label>
      <div className="submit-actions">
        <button type="submit" className="btn accent">Save key</button>
        {current && <button type="button" className="btn ghost" onClick={onForget}>Forget my key</button>}
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <p className="muted small-print">
        No key yet? Create one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> after
        adding a payment method under Billing. You can set a monthly spend limit there.
      </p>
    </form>
  );
}

const SHELVES = [
  { key: 'newcomer', level: 'newcomer', title: 'If you are new to research', blurb: 'Established methods with plenty of guidance, that a designer, PM or junior researcher can run well.' },
  { key: 'mid', level: 'mid', title: 'For a mid-level researcher', blurb: 'Structured methods that take some practice and give you more depth or confidence.' },
  { key: 'expert', level: 'expert', title: 'For a senior or specialist', blurb: 'Statistics, modelling and specialist methods for when the decision needs real rigour.' },
];

function Shelves({ recs, level, onShuffle }) {
  const ordered = [...SHELVES].sort((a, b) => (b.level === level) - (a.level === level));
  const empty = SHELVES.every((sh) => !recs[sh.key]?.length) && !recs.tryNext?.length;
  return (
    <div className="shelves">
      <div className="shelves-head">
        <h2 className="h2">Methods for your situation</h2>
        <button type="button" className="btn ghost small" onClick={onShuffle}>Show different picks</button>
      </div>
      {empty && <p className="notice">Nothing matched all of your answers. Try skipping a question or changing the time or access you have.</p>}
      {ordered.map((sh) => recs[sh.key]?.length > 0 && (
        <section key={sh.key} className="shelf">
          <h2>{sh.title}{sh.level === level && <span className="your-level">Your level</span>}</h2>
          <p>{sh.blurb}</p>
          <div className="grid">{recs[sh.key].map((m) => <MethodCard key={m.id} m={m} why={m.why} />)}</div>
        </section>
      ))}
      {recs.tryNext?.length > 0 && (
        <section className="shelf">
          <h2>What else to try</h2>
          <p>Lost, borrowed and forgotten methods that fit the same situation and add something the usual toolkit misses.</p>
          <div className="grid">{recs.tryNext.map((m) => <MethodCard key={m.id} m={m} why={m.why} />)}</div>
        </section>
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
