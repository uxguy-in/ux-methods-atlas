import { useEffect, useMemo, useState } from 'react';
import { Link, useHref, useNavigationType, useSearchParams } from 'react-router-dom';
import { BIAS_BY_ID } from '../biases.js';
import { DEMOS, DEMO_BY_ID, KINDS, kindOf, versionText } from '../demos.js';
import { WeakStrong } from '../components/WeakStrong.jsx';

const NARROW = '(max-width: 900px)';

function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const scrollToEl = (el) => el?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const HAY = new Map(DEMOS.map((d) => [d.id, norm([
  d.title, d.problem, kindOf(d.kind)?.name, d.tryIt,
  ...d.biases.map((b) => BIAS_BY_ID.get(b)?.name), ...d.annotations.map((a) => a.note),
  ...versionText(d.weak), ...versionText(d.strong),
].join(' '))]));
function matchesQuery(d, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = HAY.get(d.id);
  return words.every((w) => hay.includes(w));
}

export default function Demos() {
  const [params, setParams] = useSearchParams();
  const navType = useNavigationType();
  const narrow = useMedia(NARROW);
  const base = useHref('/demos');
  const kind = KINDS.some((k) => k.id === params.get('kind')) ? params.get('kind') : '';
  const bias = BIAS_BY_ID.has(params.get('bias')) ? params.get('bias') : '';
  const q = params.get('q') || '';
  const chosen = DEMO_BY_ID.has(params.get('d')) ? params.get('d') : null;
  const [status, setStatus] = useState('');

  const list = useMemo(() => DEMOS.filter((d) => (!kind || d.kind === kind) && (!bias || d.biases.includes(bias)) && matchesQuery(d, q)), [kind, bias, q]);
  const filtering = Boolean(kind || bias || q.trim());
  // On wide screens something is always on show; on phones a demo opens under its title.
  const selected = chosen || (!narrow && list.length ? list[0].id : null);
  const demo = selected ? DEMO_BY_ID.get(selected) : null;
  const idx = list.findIndex((d) => d.id === selected);

  const update = (changes, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace, preventScrollReset: true });
  };
  const hrefFor = (id) => { const next = new URLSearchParams(params); next.set('d', id); return `${base}?${next.toString()}`; };

  const pick = (id, focus = false) => {
    update({ d: id }, false);
    setStatus(id ? `Showing ${DEMO_BY_ID.get(id).title}` : 'Example closed');
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById('ws-current');
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (focus || r.top < 70 || r.top > window.innerHeight * 0.7) scrollToEl(el);
      if (focus) el.focus({ preventScroll: true });
    });
  };

  // Arriving from a link to one demo: bring it into view once the page has settled.
  useEffect(() => {
    if (!chosen || navType === 'POP') return undefined;
    const t = setTimeout(() => scrollToEl(document.getElementById('ws-current')), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = chosen ? `${DEMO_BY_ID.get(chosen).title} · Weak vs strong · UX Methods Atlas` : 'Weak vs strong · UX Methods Atlas'; }, [chosen]);

  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k.id, DEMOS.filter((d) => d.kind === k.id && (!bias || d.biases.includes(bias)) && matchesQuery(d, q)).length])), [bias, q]);

  const pager = demo && idx !== -1 && list.length > 1 && (
    <nav className="ws-pager" aria-label="More examples">
      <button type="button" className="btn small ghost" disabled={idx <= 0} onClick={() => pick(list[idx - 1].id, true)}>← Previous</button>
      <span className="muted">{idx + 1} of {list.length}</span>
      <button type="button" className="btn small ghost" disabled={idx >= list.length - 1} onClick={() => pick(list[idx + 1].id, true)}>Next →</button>
    </nav>
  );
  const current = (d) => (
    <div className="ws-current" id="ws-current" tabIndex={-1}>
      <WeakStrong key={d.id} demo={d} headingLevel={2} footer={pager} />
    </div>
  );

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Weak vs strong</p>
          <h1 className="h1">Small changes, <em>better evidence</em>.</h1>
          <p className="lede">
            {DEMOS.length} side-by-side examples of research done weakly and done well: interview questions, survey items, task scenarios,
            screeners, charts and readouts. Flip each one between Weak and Strong to see exactly what changed and why it matters.
          </p>
        </div>
      </section>

      <section className="section tight ws-section">
        <div className="wrap">
          <div className="ws-filters">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search examples, e.g. NPS, screener, axis" aria-label="Search examples" />
            </label>
            <div className="filters" role="group" aria-label="Filter by kind">
              <button type="button" className={`chip${!kind ? ' on' : ''}`} aria-pressed={!kind} onClick={() => update({ kind: '' })}>All kinds</button>
              {KINDS.map((k) => (
                <button key={k.id} type="button" className={`chip${kind === k.id ? ' on' : ''}`} aria-pressed={kind === k.id} onClick={() => update({ kind: kind === k.id ? '' : k.id })}>
                  {k.short}<span className="n">{counts[k.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="results-line">
            <span>{filtering ? <>Showing <b>{list.length}</b> of {DEMOS.length} examples</> : <><b>{DEMOS.length}</b> examples in {KINDS.length} kinds</>}</span>
            {bias && (
              <span className="ws-bias-filter">
                Addressing <Link to={`/biases?b=${bias}`}>{BIAS_BY_ID.get(bias).name}</Link>
                <button type="button" className="chip" onClick={() => update({ bias: '' })} aria-label={`Stop filtering by ${BIAS_BY_ID.get(bias).name}`}>Clear ×</button>
              </span>
            )}
          </div>
          <p className="sr-only" role="status">{status}</p>

          {!list.length && <p className="muted ws-none">No examples match. Try another word, or <button type="button" className="ws-linkbtn" onClick={() => update({ q: '', kind: '', bias: '' })}>show them all</button>.</p>}

          {narrow ? (
            <>
              {demo && idx === -1 && current(demo)}
              <ol className="ws-index is-narrow">
                {list.map((d) => (
                  <li key={d.id} className={d.id === selected ? 'is-sel' : ''}>
                    <a href={hrefFor(d.id)} aria-expanded={d.id === selected} onClick={(e) => { e.preventDefault(); pick(d.id === selected ? null : d.id); }}>
                      <span className="ws-index-kind">{kindOf(d.kind).short}</span>
                      <span className="ws-index-title">{d.title}</span>
                    </a>
                    {d.id === selected && current(d)}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="ws-layout">
              <nav className="ws-index-wrap" aria-label="Examples">
                <ol className="ws-index">
                  {list.map((d) => (
                    <li key={d.id} className={d.id === selected ? 'is-sel' : ''}>
                      <a href={hrefFor(d.id)} aria-current={d.id === selected ? 'true' : undefined} onClick={(e) => { e.preventDefault(); pick(d.id); }}>
                        <span className="ws-index-kind">{kindOf(d.kind).short}</span>
                        <span className="ws-index-title">{d.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="ws-main">{demo && current(demo)}</div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
