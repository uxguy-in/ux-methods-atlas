// Practice: rounds of short scenario questions (quiz.js) on which method, calculator or fix fits a situation.
// Progress lives only in this browser (localStorage, wrapped in try/catch) and holds nothing that identifies anyone:
// per question, how often it was answered and whether the last answer was right, plus the current and best streak.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BADGES, LEVELS, QUESTIONS, ROUND, TOPICS, TYPES, linkId, linkKind, optionKind, questionsAbout } from '../quiz.js';
import { BIAS_BY_ID } from '../biases.js';
import { CATALOG } from '../calc/catalog.js';
import { useApi } from '../hooks.js';
import { idWords } from '../calc/learn.js';

const STORE = 'atlas-practice:v1';
const EMPTY = { q: {}, streak: 0, best: 0 };
const CALC_NAME = new Map(CATALOG.map((c) => [c.id, c.name]));
const LEVEL_NAME = Object.fromEntries(LEVELS.map((l) => [l.id, l.name]));
const KEYS = ['1', '2', '3', '4'];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw || typeof raw !== 'object' || typeof raw.q !== 'object') return EMPTY;
    return { q: raw.q || {}, streak: Number(raw.streak) || 0, best: Number(raw.best) || 0 };
  } catch { return EMPTY; }
}
function save(p) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* storage unavailable or full */ }
}
function clear() {
  try { localStorage.removeItem(STORE); } catch { /* storage unavailable */ }
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const scrollTo = (el) => el?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Unseen questions first, then the ones last answered wrongly, then the rest; random within each group.
function pickRound(pool, progress) {
  const rank = (q) => { const s = progress.q[q.id]; return !s ? 0 : s.last ? 2 : 1; };
  const groups = [0, 1, 2].map((r) => shuffle(pool.filter((q) => rank(q) === r)));
  return groups.flat().slice(0, ROUND).map((q) => ({ id: q.id, order: shuffle(q.options.map((o) => (typeof o === 'string' ? o : o.id))) }));
}

function useNames() {
  const { data: research, loading: l1 } = useApi('/api/methods');
  const { data: design, loading: l2 } = useApi('/api/design');
  return useMemo(() => {
    const map = new Map();
    for (const m of [...(research || []), ...(design || [])]) map.set(m.id, m.name);
    const fallback = (id) => idWords(id).replace(/^./, (ch) => ch.toUpperCase());
    const name = (kind, id) => (kind === 'calc' ? CALC_NAME.get(id) : kind === 'bias' ? BIAS_BY_ID.get(id)?.name : map.get(id)) || fallback(id);
    return { name, ready: !(l1 || l2) };
  }, [research, design, l1, l2]);
}

const hrefFor = (kind, id) => (kind === 'calc' ? `/calculators/${id}` : kind === 'bias' ? `/biases?b=${id}` : `/methods/${id}`);
const KIND_LABEL = { method: 'Method', calc: 'Calculator', bias: 'Bias' };

function optionText(q, oid, name) {
  const kind = optionKind(q);
  return kind ? name(kind, oid) : q.options.find((o) => o.id === oid)?.text || oid;
}

// ---------------------------------------------------------------- progress

function stats(progress, list) {
  let answered = 0; let right = 0;
  for (const q of list) { const s = progress.q[q.id]; if (s) { answered += 1; if (s.last) right += 1; } }
  return { answered, right, total: list.length };
}

function badgeFor(progress) {
  const ok = QUESTIONS.filter((q) => progress.q[q.id]?.ok);
  const at = (lvl) => ok.filter((q) => q.level === lvl).length;
  let current = BADGES[0];
  for (const b of BADGES) if (ok.length >= b.total && (!b.at || at(b.at) >= b.atLevel)) current = b;
  const next = BADGES[BADGES.indexOf(current) + 1] || null;
  return { current, next, ok: ok.length, at };
}

function ProgressPanel({ progress, onReset }) {
  const { current, next, ok, at } = badgeFor(progress);
  const any = Object.keys(progress.q).length > 0;
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="pq-progress" aria-labelledby="pq-progress-h">
      <div className="pq-progress-head">
        <div>
          <p className="label">Your level</p>
          <h2 id="pq-progress-h" className="pq-badge"><span className={`pq-badge-mark pq-b-${current.id}`} aria-hidden="true" />{current.name}</h2>
          <ol className="pq-ladder" aria-label="Levels">
            {BADGES.map((b) => <li key={b.id} className={b.id === current.id ? 'on' : ''} aria-current={b.id === current.id ? 'step' : undefined}>{b.name}</li>)}
          </ol>
          {next ? (
            <p className="pq-next">
              Next: <b>{next.name}</b>. {ok} of {next.total} different questions right
              {next.at ? <>, with {Math.min(at(next.at), next.atLevel)} of {next.atLevel} {next.at === 'mid' ? 'mid-level' : 'specialist'}</> : null}.
            </p>
          ) : <p className="pq-next">You have reached the top level. Keep your streak going.</p>}
        </div>
        <dl className="pq-streak">
          <div><dt>Streak</dt><dd>{progress.streak}</dd></div>
          <div><dt>Best</dt><dd>{progress.best}</dd></div>
        </dl>
      </div>
      {any && (
        <div className="pq-tables">
          <ProgressTable title="By level" rows={LEVELS.map((l) => [l.name, stats(progress, QUESTIONS.filter((q) => q.level === l.id))])} />
          <ProgressTable title="By topic" rows={TOPICS.map((t) => [t, stats(progress, QUESTIONS.filter((q) => q.topic === t))])} />
        </div>
      )}
      <p className="pq-privacy muted">
        Progress is kept only in this browser and holds no personal details.{' '}
        {any && !confirm && <button type="button" className="linklike" onClick={() => setConfirm(true)}>Reset my progress</button>}
        {confirm && (
          <span className="pq-confirm" role="group" aria-label="Confirm reset">
            Clear all progress?{' '}
            <button type="button" className="btn small red" onClick={() => { onReset(); setConfirm(false); }}>Reset</button>{' '}
            <button type="button" className="btn small ghost" onClick={() => setConfirm(false)}>Keep it</button>
          </span>
        )}
      </p>
    </section>
  );
}

function ProgressTable({ title, rows }) {
  return (
    <div className="pq-table-wrap">
      <table className="pq-table">
        <caption className="label">{title}</caption>
        <thead><tr><th scope="col">Area</th><th scope="col">Answered</th><th scope="col">Right</th></tr></thead>
        <tbody>
          {rows.map(([name, s]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{s.answered}<span className="muted"> / {s.total}</span></td>
              <td>
                <span className="pq-meter" aria-hidden="true"><span style={{ width: `${s.total ? (100 * s.right) / s.total : 0}%` }} /></span>
                {s.right}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- setup

function Setup({ level, topic, setChoice, progress, onStart, onReset }) {
  const inLevel = (q) => level === 'mixed' || q.level === level;
  const countFor = (t) => QUESTIONS.filter((q) => inLevel(q) && (t === 'mixed' || q.topic === t)).length;
  const pool = countFor(topic);
  return (
    <div className="pq-setup">
      <fieldset className="pq-fieldset">
        <legend className="label">Level</legend>
        <div className="filters">
          {[...LEVELS, { id: 'mixed', name: 'Mixed' }].map((l) => (
            <button key={l.id} type="button" className={`chip${level === l.id ? ' on' : ''}`} aria-pressed={level === l.id} onClick={() => setChoice({ level: l.id })}>{l.name}</button>
          ))}
        </div>
        <p className="pq-hint muted">{level === 'mixed' ? 'Questions from all three levels.' : LEVELS.find((l) => l.id === level)?.blurb}</p>
      </fieldset>
      <fieldset className="pq-fieldset">
        <legend className="label">Topic</legend>
        <div className="filters">
          {['mixed', ...TOPICS].map((t) => {
            const n = countFor(t);
            return (
              <button key={t} type="button" disabled={!n} className={`chip${topic === t ? ' on' : ''}`} aria-pressed={topic === t} onClick={() => setChoice({ topic: t })}>
                {t === 'mixed' ? 'Mixed' : t} <span className="n">{n}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="pq-start">
        <button type="button" className="btn accent" disabled={!pool} onClick={() => onStart()}>Start a round</button>
        <span className="muted">{pool >= ROUND ? `${ROUND} questions from ${pool}` : `${pool} question${pool === 1 ? '' : 's'} match; the round will be shorter`}. Answer with 1 to 4, then Enter for the next one.</span>
      </div>
      <ProgressPanel progress={progress} onReset={onReset} />
    </div>
  );
}

// ---------------------------------------------------------------- one question

function QuestionCard({ q, order, index, total, picked, onPick, onNext, name }) {
  const kind = optionKind(q);
  const answered = picked != null;
  const right = picked === q.answer;
  const feedbackRef = useRef(null);
  const nextRef = useRef(null);
  const firstRef = useRef(null);

  useEffect(() => { if (!answered) firstRef.current?.focus({ preventScroll: true }); }, [q.id, answered]);
  useEffect(() => {
    if (!answered) return;
    nextRef.current?.focus({ preventScroll: true });
    const el = feedbackRef.current;
    if (el) { const r = el.getBoundingClientRect(); if (r.bottom > window.innerHeight) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); }
  }, [answered]);

  const others = order.filter((o) => o !== q.answer && o !== picked);
  return (
    <article className="pq-card" aria-labelledby={`pq-q-${q.id}`}>
      <div className="pq-meta">
        <span className="badge">{TYPES[q.type].label}</span>
        <span className="badge kind">{LEVEL_NAME[q.level]}</span>
        <span className="badge kind">{q.topic}</span>
        <span className="pq-count muted">Question {index + 1} of {total}</span>
      </div>
      <p id={`pq-q-${q.id}`} className="pq-scenario">{q.scenario}</p>
      <p className="pq-prompt">{TYPES[q.type].prompt}</p>
      <div className="pq-options" role="group" aria-label="Answers">
        {order.map((oid, i) => {
          const state = !answered ? '' : oid === q.answer ? ' is-right' : oid === picked ? ' is-wrong' : ' is-dim';
          return (
            <button
              key={oid}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              className={`pq-option${state}`}
              aria-disabled={answered || undefined}
              aria-keyshortcuts={KEYS[i]}
              onClick={() => { if (!answered) onPick(oid); }}
            >
              <span className="pq-key" aria-hidden="true">{KEYS[i]}</span>
              <span className="pq-option-text">{optionText(q, oid, name)}</span>
              {answered && oid === q.answer && <span className="pq-mark">Best answer</span>}
              {answered && oid === picked && oid !== q.answer && <span className="pq-mark">Your answer</span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div ref={feedbackRef} className={`pq-feedback ${right ? 'is-right' : 'is-wrong'}`}>
          <p className="pq-verdict" role="status">{right ? 'Right.' : <>Not quite. The best answer is <b>{optionText(q, q.answer, name)}</b>.</>}</p>
          <p>{q.explanation}</p>
          {!right && <p className="pq-why-picked"><b>Why not {kind ? optionText(q, picked, name) : 'your answer'}:</b> {q.why[picked]}</p>}
          {others.length > 0 && (
            <details className="pq-others">
              <summary>Why not the other {others.length === 1 ? 'option' : 'options'}</summary>
              <ul>
                {others.map((o) => <li key={o}><b>{optionText(q, o, name)}.</b> {q.why[o]}</li>)}
              </ul>
            </details>
          )}
          <div className="pq-learn">
            <span className="label">Learn more</span>
            <span className="tags">
              {q.links.map((l) => <Link key={l} className="tag" to={hrefFor(linkKind(l), linkId(l))}><span className="tag-kind">{KIND_LABEL[linkKind(l)]}:</span> {name(linkKind(l), linkId(l))}</Link>)}
            </span>
          </div>
          <div className="pq-next-row">
            <button ref={nextRef} type="button" className="btn" onClick={onNext}>{index + 1 < total ? 'Next question' : 'See your round'}</button>
            <span className="muted pq-kbd">or press Enter</span>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- end of round

function Summary({ round, answers, name, level, onAgain, onSetup, aboutName }) {
  const items = round.map((r) => ({ q: QUESTIONS.find((x) => x.id === r.id), picked: answers[r.id] }));
  const score = items.filter((it) => it.picked === it.q.answer).length;
  const missed = items.filter((it) => it.picked !== it.q.answer);
  const reading = [];
  for (const it of (missed.length ? missed : items)) for (const l of it.q.links) if (!reading.includes(l)) reading.push(l);
  const nextLevel = level === 'newcomer' ? 'mid' : level === 'mid' ? 'specialist' : null;
  const headRef = useRef(null);
  useEffect(() => { headRef.current?.focus({ preventScroll: true }); scrollTo(headRef.current); }, []);
  return (
    <section className="pq-summary" aria-labelledby="pq-sum-h">
      <p className="eyebrow">Round complete{aboutName ? ` · ${aboutName}` : ''}</p>
      <h2 id="pq-sum-h" ref={headRef} tabIndex={-1} className="pq-score">{score} of {items.length} right</h2>
      <p className="pq-score-note">
        {score === items.length ? 'A clean round.' : score >= items.length * 0.75 ? 'A strong round. The few you missed are worth a second look.' : score >= items.length / 2 ? 'Good going. The reading below covers the ones you missed.' : 'These are the tricky ones. The reading below is the quickest way to close the gap.'}
      </p>
      <ol className="pq-review">
        {items.map(({ q, picked }) => {
          const ok = picked === q.answer;
          return (
            <li key={q.id} className={ok ? 'is-right' : 'is-wrong'}>
              <span className="pq-tick" aria-hidden="true">{ok ? '✓' : '✗'}</span>
              <span className="sr-only">{ok ? 'Right: ' : 'Missed: '}</span>
              <span>
                <span className="pq-review-q">{q.scenario}</span>
                <span className="pq-review-a muted">Best answer: {optionText(q, q.answer, name)}{!ok && picked != null ? `. You chose: ${optionText(q, picked, name)}` : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="pq-read">
        <h3 className="label">{missed.length ? 'What to read next' : 'To go further'}</h3>
        <ul className="pq-read-list">
          {reading.slice(0, 8).map((l) => (
            <li key={l}><Link to={hrefFor(linkKind(l), linkId(l))}>{name(linkKind(l), linkId(l))}</Link> <span className="muted">{KIND_LABEL[linkKind(l)].toLowerCase()}</span></li>
          ))}
        </ul>
        {!missed.length && nextLevel && <p className="muted">All right at this level. Try a round at <b>{LEVEL_NAME[nextLevel]}</b> level.</p>}
      </div>
      <div className="hero-actions">
        <button type="button" className="btn accent" onClick={() => onAgain()}>Another round</button>
        {nextLevel && !missed.length && <button type="button" className="btn ghost" onClick={() => onAgain(nextLevel)}>Try {LEVEL_NAME[nextLevel]}</button>}
        <button type="button" className="btn ghost" onClick={onSetup}>Change level or topic</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the page

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const levelParam = params.get('level');
  const level = LEVELS.some((l) => l.id === levelParam) ? levelParam : 'mixed';
  const topic = TOPICS.includes(params.get('topic')) ? params.get('topic') : 'mixed';
  const about = params.get('about') || '';
  const aboutPool = useMemo(() => (about ? questionsAbout(about) : []), [about]);
  const { name, ready } = useNames();

  const [progress, setProgress] = useState(load);
  const [round, setRound] = useState(null); // [{ id, order }]
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const stageRef = useRef(null);
  const roundFor = useRef(''); // the ?about= id the current round was started for, if any

  const aboutKind = aboutPool.length ? linkKind(aboutPool[0].links.find((l) => linkId(l) === about)) : null;
  const aboutName = aboutKind ? name(aboutKind, about) : '';

  useEffect(() => { document.title = 'Practice · UX Methods Atlas'; }, []);

  const setChoice = (changes) => {
    const next = new URLSearchParams(params);
    next.delete('about');
    for (const [k, v] of Object.entries(changes)) { if (v && v !== 'mixed') next.set(k, v); else next.delete(k); }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const start = useCallback((overrideLevel) => {
    const lvl = typeof overrideLevel === 'string' ? overrideLevel : level;
    if (typeof overrideLevel === 'string' && overrideLevel !== level) {
      const next = new URLSearchParams(params); next.set('level', overrideLevel); next.delete('about');
      setParams(next, { replace: true, preventScrollReset: true });
    }
    const pool = about && typeof overrideLevel !== 'string'
      ? aboutPool
      : QUESTIONS.filter((q) => (lvl === 'mixed' || q.level === lvl) && (topic === 'mixed' || q.topic === topic));
    if (!pool.length) return;
    roundFor.current = about && typeof overrideLevel !== 'string' ? about : '';
    setRound(pickRound(pool, progress));
    setAt(0); setAnswers({}); setDone(false);
    requestAnimationFrame(() => scrollTo(stageRef.current));
  }, [level, topic, about, aboutPool, progress, params, setParams]);
  const reset = () => { clear(); setProgress(EMPTY); };

  // Arriving from a "Test yourself" link: start the questions about that method, calculator or bias straight away.
  const startedAbout = useRef('');
  useEffect(() => {
    if (about && aboutPool.length && startedAbout.current !== about) { startedAbout.current = about; start(); }
  }, [about, aboutPool, start]);
  // Leaving a "Test yourself" round by link (for example the footer's Practice link) goes back to the setup.
  useEffect(() => {
    if (!about) startedAbout.current = '';
    if (roundFor.current && roundFor.current !== about) { roundFor.current = ''; setRound(null); setDone(false); }
  }, [about]);

  const current = round && !done ? round[at] : null;
  const q = current ? QUESTIONS.find((x) => x.id === current.id) : null;
  const picked = q ? answers[q.id] : undefined;

  const pick = useCallback((oid) => {
    if (!q || answers[q.id] != null) return;
    const ok = oid === q.answer;
    setAnswers((a) => ({ ...a, [q.id]: oid }));
    setProgress((p) => {
      const prev = p.q[q.id] || { n: 0, c: 0, last: 0, ok: 0 };
      const streak = ok ? p.streak + 1 : 0;
      const next = {
        q: { ...p.q, [q.id]: { n: prev.n + 1, c: prev.c + (ok ? 1 : 0), last: ok ? 1 : 0, ok: prev.ok || (ok ? 1 : 0) } },
        streak,
        best: Math.max(p.best, streak),
      };
      save(next);
      return next;
    });
  }, [q, answers]);

  const next = useCallback(() => {
    if (!round) return;
    if (at + 1 < round.length) { setAt(at + 1); requestAnimationFrame(() => scrollTo(stageRef.current)); } else setDone(true);
  }, [round, at]);

  // Keyboard: 1-4 answers, Enter moves on. Buttons and links keep their own Enter.
  useEffect(() => {
    if (!q) return undefined;
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (picked == null) {
        const i = KEYS.indexOf(e.key);
        if (i >= 0 && i < current.order.length) { e.preventDefault(); pick(current.order[i]); }
      } else if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A' && tag !== 'SUMMARY') {
        e.preventDefault(); next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, picked, current, pick, next]);

  const leave = () => { setRound(null); setDone(false); if (about) setChoice({}); requestAnimationFrame(() => scrollTo(stageRef.current)); };

  return (
    <>
      <section className="hero compact">
        <div className="wrap">
          <p className="eyebrow">Practice</p>
          <h1 className="h1">Learn which tool <em>fits</em>.</h1>
          <p className="lede">
            Short scenarios from real research work. Pick the method, calculator or bias that fits, or say what a result honestly shows,
            and see why each other answer is weaker. {QUESTIONS.length} questions at three levels, in rounds of {ROUND}.
          </p>
        </div>
      </section>

      <section className="section tight pq-section">
        <div className="wrap pq-wrap" ref={stageRef}>
          {about && !aboutPool.length && (
            <p className="notice">There are no practice questions about “{about}” yet. Choose a level and topic instead.</p>
          )}
          {!round && <Setup level={level} topic={topic} setChoice={setChoice} progress={progress} onStart={start} onReset={reset} />}
          {round && !done && q && (
            <>
              <div className="pq-topline">
                <span className="muted">{about && aboutName ? <>Questions about <b>{aboutName}</b></> : <>{level === 'mixed' ? 'Mixed levels' : LEVEL_NAME[level]} · {topic === 'mixed' ? 'Mixed topics' : topic}</>}</span>
                <button type="button" className="linklike" onClick={leave}>End round</button>
              </div>
              <div className="progress pq-bar" aria-hidden="true">
                {round.map((r, i) => <span key={r.id} className={answers[r.id] != null ? (answers[r.id] === QUESTIONS.find((x) => x.id === r.id).answer ? 'done' : 'missed') : i === at ? 'now' : ''} />)}
              </div>
              {ready ? (
                <QuestionCard key={q.id} q={q} order={current.order} index={at} total={round.length} picked={picked} onPick={pick} onNext={next} name={name} />
              ) : <p className="muted">Loading the question…</p>}
            </>
          )}
          {round && done && (
            <Summary round={round} answers={answers} name={name} level={level} aboutName={about ? aboutName : ''} onAgain={start} onSetup={leave} />
          )}
        </div>
      </section>
    </>
  );
}
