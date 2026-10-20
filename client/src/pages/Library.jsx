import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi, useMethods, useRemembered } from '../hooks.js';
import Loading from '../components/Loading.jsx';
import { Status } from '../components/MethodCard.jsx';

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
    const rows = [['#', 'Method', 'Discipline', 'Status', 'Books in your library', 'Sources']]
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

function ViewSwitch({ view, counts }) {
  return (
    <div className="view-switch" role="tablist">
      <Link role="tab" aria-selected={view === 'books'} className={`chip${view === 'books' ? ' on' : ''}`} to="/library">Books{counts.books ? ` (${counts.books})` : ''}</Link>
      <Link role="tab" aria-selected={view === 'methods'} className={`chip${view === 'methods' ? ' on' : ''}`} to="/library?view=methods">All methods{counts.methods ? ` (${counts.methods})` : ''}</Link>
    </div>
  );
}

export default function Library() {
  const [params] = useSearchParams();
  const view = params.get('view') === 'methods' ? 'methods' : 'books';
  const { data: meta } = useApi('/api/meta');
  const counts = meta?.counts || {};
  if (view === 'methods') {
    return (
      <>
        <section className="hero">
          <div className="wrap">
            <p className="eyebrow">The library</p>
            <h1 className="h1">{counts.methods ?? '…'} methods, every one listed.</h1>
            <p className="lede">Every method in the atlas, numbered A to Z. Each number is one record with its own page, so you can count them, open any one, or download the list.</p>
            <ViewSwitch view={view} counts={counts} />
          </div>
        </section>
        <MethodIndex />
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

  const genres = useMemo(() => [...new Set((books || []).map((b) => b.genre).filter(Boolean))].sort(), [books]);
  const types = useMemo(() => [...new Set((books || []).map((b) => b.readingType).filter(Boolean))].sort(), [books]);
  const list = useMemo(() => {
    const w = q.toLowerCase();
    return (books || []).filter((b) =>
      (!genre || b.genre === genre) &&
      (!withMethods || b.methods?.length) &&
      (!type || b.readingType === type) &&
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
          <h1 className="h1">{books.length} books behind the methods.</h1>
          <p className="lede">The reading list the atlas was mined from. Books with methods attached show you exactly what each one teaches.</p>
          <div className="stats">
            <div className="stat"><b>{books.filter((b) => b.methods?.length).length}</b><span>books with methods</span></div>
            <div className="stat"><b>{books.filter((b) => b.core).length}</b><span>80/20 core books</span></div>
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
            <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Reading list">
              <option value="">Any reading list</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className={`chip${core ? ' on' : ''}`} onClick={() => setCore((v) => !v)} aria-pressed={core}>80/20 core</button>
            <button className={`chip${withMethods ? ' on' : ''}`} onClick={() => setWithMethods((v) => !v)} aria-pressed={withMethods}>Only books with methods</button>
          </div>
        </div>
      </div>
      <div className="wrap" style={{ paddingBottom: 88 }}>
        <div className="results-line"><span><b>{list.length}</b> books</span></div>
        {list.map((b) => (
          <div key={b.id} className="book-row">
            <div>
              <h3>{b.title}</h3>
              {b.fullTitle && <div className="by" style={{ marginTop: 2 }}>{b.fullTitle}</div>}
              <div className="by">{b.author}{b.genre ? ` · ${b.genre}` : ''}</div>
              <div className="book-meta">
                {b.core && <span className="badge core">80/20</span>}
                {b.readingType && <span className="badge">{b.readingType}</span>}
              </div>
            </div>
            <div className="tags" style={{ alignContent: 'flex-start' }}>
              {(b.methods || []).map((m) => <Link key={m.id} className="tag" to={`/methods/${m.id}`}>{m.name}</Link>)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
