import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QUESTIONS, QUESTION_BY_ID, SYNONYMS, questionsForMethod, themeOf } from '../questions.js';
import { LIBRARY } from '../questions-library.js';
import { calcInfo } from '../calc/learn.js';
import { useMethodNames } from './CalcLearn.jsx';

// One line on a method page: up to two library questions this method helps answer, linked to the question library.
export function MethodQuestionsLine({ methodId }) {
  const list = questionsForMethod(methodId, 2);
  if (!list.length) return null;
  return (
    <p className="ql-method-line">
      <span className="label">Answers questions like</span>{' '}
      {list.map((q, i) => (
        <span key={q.id}>{i > 0 && ' · '}<Link to={`/questions?id=${q.id}`}>{q.question}</Link></span>
      ))}
    </p>
  );
}

export const cite = (s) => [s.author, s.year && `(${s.year})`, s.author ? `, ${s.title}` : s.title].filter(Boolean).join(' ').replace(' ,', ',');

// A source line: the book (linked to the library when it is listed there), author and year.
function Source({ s }) {
  const title = s.book ? <Link to={`/library?q=${encodeURIComponent(s.title)}`}><cite>{s.title}</cite></Link> : <cite>{s.title}</cite>;
  return <span className="ql-src">{title}{s.author ? `, ${s.author}` : ''}{s.year ? ` (${s.year})` : ''}</span>;
}

// What the books in the atlas's library say about this question: paraphrased insights, rules of thumb, pitfalls
// and further reading, from the reading notes behind the atlas.
export function FromLibrary({ id }) {
  const lib = LIBRARY[id];
  if (!lib) return null;
  const list = (items, cls) => (
    <ul className={`ql-lib ${cls || ''}`}>
      {items.map((it, i) => <li key={i}>{it.text} <Source s={it.source} /></li>)}
    </ul>
  );
  return (
    <div className="ql-block ql-library">
      {lib.insights && <><h4 className="label">From the library</h4>{list(lib.insights)}</>}
      {lib.rules && <><h4 className="label">Rules of thumb</h4>{list(lib.rules, 'ql-rules')}</>}
      {lib.pitfalls && <><h4 className="label">Pitfalls</h4>{list(lib.pitfalls, 'ql-pitfalls')}</>}
      {lib.reading && (
        <>
          <h4 className="label">Further reading</h4>
          <ul className="ql-lib ql-reading">{lib.reading.map((r, i) => <li key={i}><Source s={r} />{r.why ? <span className="ql-why">{r.why}</span> : null}</li>)}</ul>
        </>
      )}
    </div>
  );
}


// ── Library questions inside Find a method and Plan a study ──

// The finder's "What do you need to find out?" answers that best fit each theme of the question library. A rough
// starting point: the visitor can change them afterwards.
const THEME_GOALS = {
  working: ['usability', 'behaviour'], users: ['why', 'segments'], build: ['prioritise'], better: ['compare'],
  why: ['why'], sure: ['impact'], safe: ['risk'], rigour: ['synthesis'],
};
export const goalsForQuestion = (q) => THEME_GOALS[q?.theme] || [];

const STOP = new Set('a an and are as at be but by can do does for from how i if in is it its me my of on or our should so that the their them they this to us was we what when where which who why will with would you your'.split(' '));
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
// Library questions most like a piece of free text (a research question or a brief), best first. Scores the share
// of the text's words found in the question, its keywords or answer, counting synonyms; the question text weighs most.
export function similarQuestions(text, max = 4) {
  const ws = [...new Set(words(text).map(stem))];
  if (!ws.length) return [];
  const syn = (w) => SYNONYMS.find((g) => g.some((x) => stem(fold(x)) === w)) || [w];
  return QUESTIONS.map((q) => {
    const head = new Set(words([q.question, ...(q.keywords || [])].join(' ')).map(stem));
    const body = new Set(words([q.answer, q.askInstead?.question].join(' ')).map(stem));
    let score = 0;
    for (const w of ws) {
      const forms = syn(w).map((x) => stem(fold(x)));
      if (forms.some((f) => head.has(f))) score += 1; else if (forms.some((f) => body.has(f))) score += 0.4;
    }
    return { q, score: score / Math.max(3, ws.length) };
  }).filter((x) => x.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.q);
}

// Pick a question from the library: a search box with live matches, or matches for text the visitor already wrote.
export function QuestionPicker({ onPick, seedText = '', label = 'Start from a question someone asked you', compact }) {
  const [q, setQ] = useState('');
  const query = q.trim() || seedText;
  const list = query.trim() ? similarQuestions(query, 5) : [];
  return (
    <div className={`qpick${compact ? ' compact' : ''}`}>
      <label className="qpick-label">
        <span>{label}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a few words, for example drop off sign-up, how many users, is it better" />
      </label>
      {list.length > 0 && (
        <ul className="qpick-list" aria-label={q.trim() ? 'Matching questions' : 'Questions like yours'}>
          {!q.trim() && <li className="qpick-note">Questions like yours in the <Link to="/questions">question library</Link>:</li>}
          {list.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => { onPick(x); setQ(''); }}>
                <b>{x.question}</b><small>{themeOf(x.theme).name}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && !list.length && <p className="qpick-note">No close match. Try other words, or browse the <Link to="/questions">question library</Link>.</p>}
    </div>
  );
}

// What the question library says about the visitor's chosen question: the short answer, its methods and calculators,
// and what the books say. Shown on the finder's results and in the study plan.
export function LibraryQuestionPanel({ id, onClear }) {
  const methodName = useMethodNames();
  const q = QUESTION_BY_ID.get(id);
  if (!q) return null;
  const calcs = q.calcs.map(calcInfo).filter(Boolean);
  return (
    <section className="qpanel" aria-labelledby="qpanel-h">
      <p className="eyebrow">From the question library</p>
      <h2 id="qpanel-h">{q.question}</h2>
      <p className="qpanel-answer">{q.answer}</p>
      {q.askInstead && <p className="qpanel-instead"><b>Ask instead:</b> {q.askInstead.question}</p>}
      <div className="qpanel-grid">
        <div>
          <h3 className="label">Methods, easiest first</h3>
          <ol className="qpanel-methods">{q.methods.map((m) => <li key={m.id}><Link to={`/methods/${m.id}`}>{methodName(m.id)}</Link> <span>{m.why}</span></li>)}</ol>
        </div>
        {calcs.length > 0 && (
          <div>
            <h3 className="label">Calculators</h3>
            <ul className="qpanel-calcs">{calcs.map((c) => <li key={c.id}><Link to={`/calculators/${c.id}`}>{c.name}</Link> <span>{c.question}</span></li>)}</ul>
          </div>
        )}
      </div>
      {LIBRARY[q.id] && (
        <details className="qpanel-more">
          <summary>What the books say</summary>
          <FromLibrary id={q.id} />
        </details>
      )}
      <p className="qpanel-foot">
        <Link to={`/questions?id=${q.id}`}>Open in the question library</Link>
        {onClear && <> · <button type="button" className="skip-link" onClick={onClear}>Not my question</button></>}
      </p>
    </section>
  );
}
