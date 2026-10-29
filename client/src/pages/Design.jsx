import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDesignMethods, useRemembered } from '../hooks.js';
import { Status } from '../components/MethodCard.jsx';
import Loading from '../components/Loading.jsx';
import { DESIGN_KIND } from '../vocab.js';

// Cards listed at a time; "Show N more" adds the next batch.
const PAGE = 30;

function matches(m, words) {
  if (!words.length) return true;
  const h = [m.name, ...(m.aka || []), m.summary, m.origin, ...(m.keywords || [])].join(' ').toLowerCase();
  return words.every((w) => h.includes(w));
}

const booksLabel = (n) => `${n} ${n === 1 ? 'book' : 'books'}`;

// Making and product practices (prototyping, critique, canvases, workshops). They sit beside
// the research atlas, so they are listed here instead of in the atlas, the finder or the counts.
export default function Design() {
  const { data: methods, error } = useDesignMethods();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useRemembered('limit', PAGE);
  const q = params.get('q') || '';

  const setQ = (v) => {
    setParams(v ? { q: v } : {}, { replace: true });
    setLimit(PAGE);
  };

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (methods || []).filter((m) => matches(m, words)).sort((a, b) => a.name.localeCompare(b.name));
  }, [methods, q]);

  if (!methods) return <Loading error={error} />;

  return (
    <>
      <section className="hero compact">
        <div className="wrap">
          <p className="eyebrow">{DESIGN_KIND}</p>
          <h1 className="h1">Design & product methods.</h1>
          <p className="lede">
            Prototyping, ideation, critique, canvases, storyboards, story mapping and workshops: {methods.length} making and
            product practices that sit beside research. They are listed here, separately from the{' '}
            <Link to="/methods">research atlas</Link>, and the method finder does not recommend them.
          </p>
        </div>
      </section>
      <div className="toolbar">
        <div className="wrap">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Try “prototype”, “story map”, “critique”…"
              aria-label="Search design and product methods"
            />
          </label>
        </div>
      </div>
      <div className="wrap">
        <div className="results-line">
          <span>{q ? <>Showing <b>{list.length}</b> of </> : null}<b>{methods.length}</b> design & product methods, A to Z</span>
        </div>
        {list.length === 0 ? (
          <div className="empty"><h3>No practices match.</h3><p>Try another word.</p></div>
        ) : (
          <div className="grid">
            {list.slice(0, limit).map((m) => (
              <Link key={m.id} to={`/methods/${m.id}`} className="card">
                <span className="fam">{DESIGN_KIND}</span>
                <h3>{m.name}</h3>
                <p>{m.summary}</p>
                <div className="meta">
                  <Status value={m.status} />
                  <span>{booksLabel((m.bookIds || []).length)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {list.length > limit && (
          <div style={{ textAlign: 'center', margin: '40px 0 88px' }}>
            <button className="btn ghost" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, list.length - limit)} more</button>
          </div>
        )}
        <div style={{ height: 88 }} />
      </div>
    </>
  );
}
