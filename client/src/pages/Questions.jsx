import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useHref, useNavigationType, useSearchParams } from 'react-router-dom';
import { QUESTIONS, QUESTION_BY_ID, THEMES, matchQuestion, themeOf } from '../questions.js';
import { BIAS_BY_ID } from '../biases.js';
import { LIBRARY } from '../questions-library.js';
import { STAGES, STAGE_KEYS, calcInfo } from '../calc/learn.js';
import { CalcCard, StageBadges, useMethodNames } from '../components/CalcLearn.jsx';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const scrollToEl = (el) => el?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
const domId = (id) => `q-${id}`;

// The plan as Markdown: the question, the short answer, the reframe, then methods, calculators and biases with links.
function toMarkdown(q, methodName, abs) {
  const lines = [`# ${q.question}`, ''];
  lines.push(`Theme: ${themeOf(q.theme).name}  `);
  lines.push(`Study stages: ${q.stages.map((s) => STAGES[s].label).join(', ')}`, '');
  lines.push('## Short answer', '', q.answer, '');
  if (q.askInstead) lines.push('## Ask instead', '', `> ${q.askInstead.question}`, '', q.askInstead.why, '');
  lines.push('## Methods, easiest first', '');
  q.methods.forEach((mm, i) => lines.push(`${i + 1}. [${methodName(mm.id)}](${abs(`/methods/${mm.id}`)}): ${mm.why}`));
  lines.push('');
  const calcs = q.calcs.map(calcInfo).filter(Boolean);
  if (calcs.length) {
    lines.push('## Calculators', '');
    for (const c of calcs) lines.push(`- [${c.name}](${abs(`/calculators/${c.id}`)}): ${c.question}`);
    lines.push('');
  }
  const biases = q.biases.map((b) => BIAS_BY_ID.get(b)).filter(Boolean);
  if (biases.length) {
    lines.push('## Biases to watch for', '');
    for (const b of biases) lines.push(`- [ ] [${b.name}](${abs(`/biases?b=${b.id}`)}): ${b.what}`);
    lines.push('');
  }
  const lib = LIBRARY[q.id];
  if (lib?.insights) {
    lines.push('## From the library', '');
    for (const it of lib.insights) lines.push(`- ${it.text} (${cite(it.source)})`);
    lines.push('');
  }
  if (lib?.rules) { lines.push('## Rules of thumb', ''); for (const it of lib.rules) lines.push(`- ${it.text} (${cite(it.source)})`); lines.push(''); }
  if (lib?.pitfalls) { lines.push('## Pitfalls', ''); for (const it of lib.pitfalls) lines.push(`- ${it.text} (${cite(it.source)})`); lines.push(''); }
  if (lib?.reading) { lines.push('## Further reading', ''); for (const r of lib.reading) lines.push(`- ${cite(r)}${r.why ? `: ${r.why}` : ''}`); lines.push(''); }
  lines.push(`Source: ${abs(`/questions?id=${q.id}`)}`);
  return lines.join('\n').trim() + '\n';
}

const cite = (s) => [s.author, s.year && `(${s.year})`, s.author ? `, ${s.title}` : s.title].filter(Boolean).join(' ').replace(' ,', ',');

// A source line: the book (linked to the library when it is listed there), author and year.
function Source({ s }) {
  const title = s.book ? <Link to={`/library?q=${encodeURIComponent(s.title)}`}><cite>{s.title}</cite></Link> : <cite>{s.title}</cite>;
  return <span className="ql-src">{title}{s.author ? `, ${s.author}` : ''}{s.year ? ` (${s.year})` : ''}</span>;
}

// What the books in the atlas's library say about this question: paraphrased insights, rules of thumb, pitfalls
// and further reading, from the reading notes behind the atlas.
function FromLibrary({ id }) {
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

function Detail({ q, methodName, abs }) {
  const [copied, setCopied] = useState('');
  const md = useMemo(() => toMarkdown(q, methodName, abs), [q, methodName, abs]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(md); setCopied('Copied the plan as Markdown.'); }
    catch { setCopied('Copying is blocked here: open “Show the Markdown” and copy it from there.'); }
  };
  const calcs = q.calcs.map(calcInfo).filter(Boolean);
  const biases = q.biases.map((b) => BIAS_BY_ID.get(b)).filter(Boolean);
  return (
    <div className="ql-detail">
      <p className="ql-answer">{q.answer}</p>
      {q.askInstead && (
        <div className="ql-instead">
          <h4 className="label">Ask instead</h4>
          <p className="ql-instead-q">{q.askInstead.question}</p>
          <p className="ql-instead-why">{q.askInstead.why}</p>
        </div>
      )}
      <div className="ql-block">
        <h4 className="label">Methods, easiest first</h4>
        <ol className="ql-methods">
          {q.methods.map((mm) => (
            <li key={mm.id}>
              <Link to={`/methods/${mm.id}`}>{methodName(mm.id)}</Link>
              <span>{mm.why}</span>
            </li>
          ))}
        </ol>
      </div>
      {calcs.length > 0 && (
        <div className="ql-block">
          <h4 className="label">Calculators</h4>
          <div className="ql-calcs">{calcs.map((c) => <CalcCard key={c.id} c={c} />)}</div>
        </div>
      )}
      {biases.length > 0 && (
        <div className="ql-block">
          <h4 className="label">Biases to watch for</h4>
          <div className="tags">{biases.map((b) => <Link key={b.id} className="tag" to={`/biases?b=${b.id}`}>{b.name}</Link>)}</div>
        </div>
      )}
      <FromLibrary id={q.id} />
      <div className="ql-actions">
        <button type="button" className="btn small accent" onClick={copy}>Copy as plan</button>
        <span className="ql-stages"><span className="label">Stages</span><StageBadges stages={q.stages} short={false} /></span>
      </div>
      {copied && <p className="ql-copied" role="status">{copied}</p>}
      <details className="ql-md">
        <summary>Show the Markdown</summary>
        <label className="sr-only" htmlFor={`${domId(q.id)}-md`}>Plan as Markdown</label>
        <textarea id={`${domId(q.id)}-md`} readOnly rows={12} value={md} />
      </details>
    </div>
  );
}

export default function Questions() {
  const [params, setParams] = useSearchParams();
  const navType = useNavigationType();
  const methodName = useMethodNames();
  const base = useHref('/');
  const q = params.get('q') || '';
  const theme = THEMES.some((t) => t.id === params.get('theme')) ? params.get('theme') : '';
  const stage = STAGE_KEYS.includes(params.get('stage')) ? params.get('stage') : '';
  const open = QUESTION_BY_ID.has(params.get('id')) ? params.get('id') : null;

  // Absolute links for the copied plan; under hash routing the router href starts with "#/".
  const abs = useMemo(() => (path) => new URL(`${base.replace(/\/$/, '')}${path}`, window.location.href).toString(), [base]);

  const update = (changes, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace, preventScrollReset: true });
  };

  // Search and stage narrow the list; the theme counts reflect them so the chips say what each theme would show.
  const matching = useMemo(() => QUESTIONS.filter((x) => (!stage || x.stages.includes(stage)) && matchQuestion(x, q)), [q, stage]);
  const visible = theme ? matching.filter((x) => x.theme === theme) : matching;
  const filtering = Boolean(q.trim() || theme || stage);

  useEffect(() => {
    const sel = open ? QUESTION_BY_ID.get(open) : null;
    document.title = sel ? `${sel.question} · Question library · UX Methods Atlas` : 'Question library · UX Methods Atlas';
  }, [open]);

  // Bring the open question into view: on arrival from a link (or a fresh load of a shared link), and when opening
  // one collapses another above it so it would otherwise jump out of view. Back and Forward keep the browser's scroll.
  const first = useRef(true);
  useEffect(() => {
    const arriving = first.current;
    first.current = false;
    if (!open || (arriving && navType === 'POP' && window.scrollY > 10)) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(domId(open));
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      if (arriving || top < 60 || top > window.innerHeight * 0.7) scrollToEl(el);
    }, arriving ? 120 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id) => update({ id: open === id ? '' : id }, false);

  const groups = THEMES.map((t) => ({ t, list: visible.filter((x) => x.theme === t.id) })).filter((g) => g.list.length);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Question library</p>
          <h1 className="h1">Start from the <em>question</em>.</h1>
          <p className="lede">
            The questions stakeholders and researchers actually ask, from “is the new design better?” to “how many users do I need?”.
            Each one has a short answer, the methods that tackle it from easiest to most rigorous, the calculators that help and the biases to watch for.
          </p>
          <div className="hero-actions">
            <Link to="/find" className="btn accent">Find a method instead</Link>
            <Link to="/calculators" className="btn ghost">Browse the calculators</Link>
          </div>
        </div>
      </section>

      <section className="section tight ql-section">
        <div className="wrap">
          <div className="ql-filters">
            <label className="search ql-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search questions, e.g. drop off, sample size, trust" aria-label="Search questions" />
            </label>
            <div className="filters" role="group" aria-label="Filter by theme">
              <button type="button" className={`chip${!theme ? ' on' : ''}`} aria-pressed={!theme} onClick={() => update({ theme: '' })}>All themes <span className="n">{matching.length}</span></button>
              {THEMES.map((t) => (
                <button key={t.id} type="button" className={`chip${theme === t.id ? ' on' : ''}`} aria-pressed={theme === t.id} onClick={() => update({ theme: theme === t.id ? '' : t.id })}>
                  {t.name} <span className="n">{matching.filter((x) => x.theme === t.id).length}</span>
                </button>
              ))}
            </div>
            <div className="filters" role="group" aria-label="Filter by study stage">
              <button type="button" className={`chip${!stage ? ' on' : ''}`} aria-pressed={!stage} onClick={() => update({ stage: '' })}>Any stage</button>
              {STAGE_KEYS.map((s) => (
                <button key={s} type="button" className={`chip${stage === s ? ' on' : ''}`} aria-pressed={stage === s} onClick={() => update({ stage: stage === s ? '' : s })}>{STAGES[s].label}</button>
              ))}
            </div>
          </div>
          <div className="results-line" aria-live="polite">
            <span>{filtering ? <>Showing <b>{visible.length}</b> of {QUESTIONS.length} questions</> : <><b>{QUESTIONS.length}</b> questions in {THEMES.length} themes</>}</span>
            {filtering && <button type="button" className="chip" onClick={() => update({ q: '', theme: '', stage: '' })}>Clear filters</button>}
          </div>

          {!visible.length && <p className="muted ql-none">No question matches{q.trim() ? ` “${q.trim()}”` : ''}. Try other words, or <button type="button" className="ql-linkbtn" onClick={() => update({ q: '', theme: '', stage: '' })}>clear the filters</button>.</p>}

          {groups.map(({ t, list }) => (
            <section key={t.id} className="ql-theme" aria-labelledby={`ql-th-${t.id}`}>
              <div className="ql-theme-head">
                <h2 className="ql-theme-h" id={`ql-th-${t.id}`}>{t.name} <span className="n">{list.length}</span></h2>
                <p className="ql-theme-blurb">{t.blurb}</p>
              </div>
              <ul className="ql-items">
                {list.map((x) => {
                  const isOpen = open === x.id;
                  return (
                    <li key={x.id} id={domId(x.id)} className={isOpen ? 'is-open' : ''}>
                      <h3 className="ql-q">
                        <button type="button" aria-expanded={isOpen} aria-controls={`${domId(x.id)}-panel`} onClick={() => toggle(x.id)}>
                          <span className="ql-q-text">{x.question}</span>
                          {x.askInstead && <span className="badge kind ql-trap">Reframe</span>}
                          <span className="show-more-icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                        </button>
                      </h3>
                      <div id={`${domId(x.id)}-panel`} hidden={!isOpen}>
                        {isOpen && <Detail q={x} methodName={methodName} abs={abs} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
