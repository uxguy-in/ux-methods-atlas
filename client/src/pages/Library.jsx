import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useMethods, useRemembered } from '../hooks.js';
import Loading from '../components/Loading.jsx';
import { Status } from '../components/MethodCard.jsx';
import { ShowMoreList } from '../components/ShowMore.jsx';
import { CORE_LABEL, DESIGN_KIND, readingLevel } from '../vocab.js';
import { CALC_INFO, stageLabel } from '../calc/learn.js';
import { StageBadges } from '../components/CalcLearn.jsx';
import { BIASES } from '../biases.js';
import { DEMOS } from '../demos.js';
import { QUESTIONS } from '../questions.js';

// Books listed at a time; "Show more books" adds the next batch.
const BOOK_PAGE = 40;

function csvCell(v) { return `"${String(v ?? '').replace(/"/g, '""')}"`; }

function MethodIndex() {
  const { data: methods, error } = useMethods();
  const [q, setQ] = useRemembered('q', '');
  const numbered = useMemo(() => [...(methods || [])]
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map((m, i) => ({ ...m, n: i + 1 })), [methods]);
  const list = useMemo(() => {
    const w = q.toLowerCase().trim();
    return w ? numbered.filter((m) => [m.name, ...(m.aka || []), m.family].join(' ').toLowerCase().includes(w)) : numbered;
  }, [numbered, q]);
  const download = () => {
    const rows = [['#', 'Method', 'Discipline', 'Status', 'Books in the library', 'Sources']]
      .concat(numbered.map((m) => [m.n, m.name, m.family, m.status, (m.bookIds || []).length, (m.sources || []).join(' | ')]));
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ux-methods-atlas-methods.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };
  if (!methods) return <Loading error={error} />;
  return (
    <>
      <div className="toolbar">
        <div className="wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter the list by name or discipline" aria-label="Filter methods" />
          </label>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 88 }}>
        <div className="results-line">
          <span>{q ? <>Showing <b>{list.length}</b> of </> : null}<b>{numbered.length}</b> methods, numbered A to Z</span>
          <button className="btn ghost small" onClick={download}>Download as CSV</button>
        </div>
        <ol className="method-index">
          {list.map((m) => (
            <li key={m.id}>
              <span className="num">{m.n}</span>
              <Link to={`/methods/${m.id}`} className="name">{m.name}</Link>
              <span className="fam">{m.family}</span>
              <Status value={m.status} />
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

// Every calculator in one long A-Z list, for people who would rather scroll than filter.
function CalcIndex() {
  const [q, setQ] = useRemembered('calcq', '');
  const numbered = useMemo(() => [...CALC_INFO]
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map((c, i) => ({ ...c, n: i + 1 })), []);
  const list = useMemo(() => {
    const w = q.toLowerCase().trim();
    return w ? numbered.filter((c) => [c.name, c.question, c.blurb, c.group].join(' ').toLowerCase().includes(w)) : numbered;
  }, [numbered, q]);
  const download = () => {
    const rows = [['#', 'Calculator', 'Question it answers', 'Group', 'Study stages', 'Link']]
      .concat(numbered.map((c) => [c.n, c.name, c.question, c.group, c.stages.map(stageLabel).join(' | '), `#/calculators/${c.id}`]));
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ux-methods-atlas-calculators.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <>
      <div className="toolbar">
        <div className="wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, question or group" aria-label="Filter calculators" />
          </label>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 88 }}>
        <div className="results-line">
          <span>{q ? <>Showing <b>{list.length}</b> of </> : null}<b>{numbered.length}</b> calculators, numbered A to Z</span>
          <button className="btn ghost small" onClick={download}>Download as CSV</button>
        </div>
        <ol className="method-index calc-index">
          {list.map((c) => (
            <li key={c.id}>
              <span className="num">{c.n}</span>
              <span><Link to={`/calculators/${c.id}`} className="name">{c.name}</Link><span className="calc-q">{c.question}</span></span>
              <span className="fam">{c.group}</span>
              <StageBadges stages={c.stages} />
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function ViewSwitch({ view, counts }) {
  return (
    <div className="view-switch" role="tablist">
      <Link role="tab" aria-selected={view === 'books'} className={`chip${view === 'books' ? ' on' : ''}`} to="/library">Books{counts.books ? ` (${counts.books})` : ''}</Link>
      <Link role="tab" aria-selected={view === 'methods'} className={`chip${view === 'methods' ? ' on' : ''}`} to="/library?view=methods">All methods{counts.methods ? ` (${counts.methods})` : ''}</Link>
      <Link role="tab" aria-selected={view === 'calculators'} className={`chip${view === 'calculators' ? ' on' : ''}`} to="/library?view=calculators">All calculators ({CALC_INFO.length})</Link>
      {counts.design > 0 && <Link className="chip" to="/design">{DESIGN_KIND} ({counts.design})</Link>}
      <Link className="chip" to="/biases">Research biases ({BIASES.length})</Link>
      <Link className="chip" to="/demos">Weak vs strong ({DEMOS.length})</Link>
      <Link className="chip" to="/questions">Questions ({QUESTIONS.length})</Link>
    </div>
  );
}

export default function Library() {
  const [params] = useSearchParams();
  const view = ['methods', 'calculators'].includes(params.get('view')) ? params.get('view') : 'books';
  const { data: meta } = useApi('/api/meta');
  const counts = meta?.counts || {};
  if (view === 'methods') {
    return (
      <>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">The library</p>
            <h1 className="h1">Books, methods and calculators in one place.</h1>
            <p className="lede">All {counts.methods ?? '…'} methods in the atlas, numbered A to Z. Each number is one record with its own page, so you can count them, open any one, or download the list.</p>
            <ViewSwitch view={view} counts={counts} />
          </div>
        </section>
        <MethodIndex />
      </>
    );
  }
  if (view === 'calculators') {
    return (
      <>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">The library</p>
            <h1 className="h1">Books, methods and calculators in one place.</h1>
            <p className="lede">All {CALC_INFO.length} calculators on the site, numbered A to Z, with the question it answers and where it fits in a study. To find one by your study stage or your data instead, use the <Link to="/calculators">calculators page</Link>.</p>
            <ViewSwitch view={view} counts={counts} />
          </div>
        </section>
        <CalcIndex />
      </>
    );
  }
  return <BookList counts={counts} />;
}

function BookList({ counts }) {
  const { data: books, error } = useApi('/api/books');
  const [params] = useSearchParams();
  const [q, setQ] = useRemembered('q', params.get('q') || '');
  const [genre, setGenre] = useRemembered('genre', '');
  const [withMethods, setWithMethods] = useRemembered('withMethods', false);
  const [type, setType] = useRemembered('type', '');
  const [core, setCore] = useRemembered('core', false);
  const [limit, setLimit] = useRemembered('limit', BOOK_PAGE);

  const genres = useMemo(() => [...new Set((books || []).map((b) => b.genre).filter(Boolean))].sort(), [books]);
  const types = useMemo(() => [...new Set((books || []).map((b) => readingLevel(b.readingType)).filter(Boolean))].sort(), [books]);
  const list = useMemo(() => {
    const w = q.toLowerCase();
    return (books || []).filter((b) =>
      (!genre || b.genre === genre) &&
      (!withMethods || b.methods?.length) &&
      (!type || readingLevel(b.readingType) === type) &&
      (!core || b.core) &&
      (!w || [b.title, b.fullTitle, b.author, ...(b.methods || []).map((m) => m.name)].join(' ').toLowerCase().includes(w))
    );
  }, [books, q, genre, withMethods, type, core]);

  if (!books) return <Loading error={error} />;
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">The library</p>
          <h1 className="h1">Books, methods and calculators in one place.</h1>
          <p className="lede">{books.length} books the atlas was mined from. Books with methods attached show you exactly what each one teaches. Switch tabs for every method or every calculator.</p>
          <div className="stats">
            <div className="stat"><b>{books.filter((b) => b.methods?.length).length}</b><span>books with methods</span></div>
            <div className="stat"><b>{books.filter((b) => b.core).length}</b><span>{CORE_LABEL.toLowerCase()} books</span></div>
          </div>
          <ViewSwitch view="books" counts={counts} />
        </div>
      </section>
      <div className="toolbar">
        <div className="wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search books, authors or methods" aria-label="Search books" />
          </label>
          <div className="filters">
            <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Subject">
              <option value="">All subjects</option>
              {genres.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Reading level">
              <option value="">Any reading level</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className={`chip${core ? ' on' : ''}`} onClick={() => setCore((v) => !v)} aria-pressed={core}>{CORE_LABEL}</button>
            <button className={`chip${withMethods ? ' on' : ''}`} onClick={() => setWithMethods((v) => !v)} aria-pressed={withMethods}>Only books with methods</button>
          </div>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 88 }}>
        <div className="results-line"><span><b>{list.length}</b> books</span></div>
        {list.slice(0, limit).map((b) => (
          <div key={b.id} className="book-row">
            <div>
              <h3>{b.title}</h3>
              {b.fullTitle && <div className="by" style={{ marginTop: 2 }}>{b.fullTitle}</div>}
              <div className="by">{b.author}{b.genre ? ` · ${b.genre}` : ''}</div>
              <div className="book-meta">
                {b.core && <span className="badge core">{CORE_LABEL}</span>}
                {readingLevel(b.readingType) && <span className="badge">{readingLevel(b.readingType)}</span>}
              </div>
            </div>
            <div>
              <ShowMoreList className="tags" limit={6} noun="methods">
                {(b.methods || []).map((m) => (
                  <Link key={m.id} className="tag" to={`/methods/${m.id}`}>{m.name}{m.kind === 'design' && <span className="tag-kind"> · {DESIGN_KIND}</span>}</Link>
                ))}
              </ShowMoreList>
            </div>
          </div>
        ))}
        {list.length > limit && (
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button className="btn ghost" onClick={() => setLimit((l) => l + BOOK_PAGE)}>Show {Math.min(BOOK_PAGE, list.length - limit)} more books</button>
          </div>
        )}
      </div>
    </>
  );
}
