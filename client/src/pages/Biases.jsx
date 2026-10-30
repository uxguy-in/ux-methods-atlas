import { useEffect, useMemo, useState } from 'react';
import { Link, useHref, useNavigationType, useSearchParams } from 'react-router-dom';
import { BIASES, BIAS_BY_ID, CHECK_METHODS, GROUPS, STAGE_ORDER, biasesForStudy, groupOf } from '../biases.js';
import { STAGES, calcInfo } from '../calc/learn.js';
import { CalcCard, StageBadges, useMethodNames } from '../components/CalcLearn.jsx';
import { SeeItLink } from '../components/WeakStrong.jsx';

const NARROW = '(max-width: 760px)';

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
function matchesQuery(b, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([b.name, ...b.aka, b.what, b.looksLike, groupOf(b.group).name].join(' '));
  return words.every((w) => hay.includes(w));
}

// ---------------------------------------------------------------- the radial map

const SIZE = 1040;
const C = SIZE / 2;
const R_NODE = 184; // ring of dots
const R_LABEL = 198; // where labels start
const R_BAND_IN = 96;
const R_BAND_OUT = 172;
// The labels never reach the corners, so the view is cropped to the drawing.
const VIEW = '80 86 880 868';
const GAP = 1.6; // gap between groups, in node steps
const START = 4; // degrees clear of the top, so the first labels are not vertical

const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const f = (n) => Math.round(n * 10) / 10;

function annulus(r1, r2, a0, a1) {
  const [x0, y0] = pt(r2, a0); const [x1, y1] = pt(r2, a1);
  const [x2, y2] = pt(r1, a1); const [x3, y3] = pt(r1, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${f(x0)} ${f(y0)} A${r2} ${r2} 0 ${large} 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r1} ${r1} 0 ${large} 0 ${f(x3)} ${f(y3)} Z`;
}
// An arc for a group's name to sit on; drawn right to left in the lower half so the text stays upright.
function labelArc(r, a0, a1) {
  const mid = (a0 + a1) / 2;
  const flip = mid > 90 && mid < 270;
  const [sx, sy] = pt(r, flip ? a1 : a0); const [ex, ey] = pt(r, flip ? a0 : a1);
  return `M${f(sx)} ${f(sy)} A${r} ${r} 0 0 ${flip ? 0 : 1} ${f(ex)} ${f(ey)}`;
}

function layout() {
  const units = BIASES.length + GROUPS.length * GAP;
  const step = (360 - 2 * START) / units;
  let a = START + (GAP / 2) * step;
  const nodes = []; const sectors = [];
  for (const g of GROUPS) {
    const list = BIASES.filter((b) => b.group === g.id);
    const a0 = a - step / 2;
    for (const b of list) { nodes.push({ b, angle: a }); a += step; }
    // Each sector reaches a little into the gaps either side, leaving a thin gap between groups.
    sectors.push({ g, a0: a0 - (GAP / 2 - 0.3) * step, a1: a - step / 2 + (GAP / 2 - 0.3) * step, n: list.length });
    a += GAP * step;
  }
  return { nodes, sectors, step };
}
const LAYOUT = layout();

function BiasMap({ selected, visible, onPick, hrefFor, total }) {
  const [hot, setHot] = useState(null);
  const hotGroup = hot ? BIAS_BY_ID.get(hot)?.group : null;
  const selGroup = selected ? BIAS_BY_ID.get(selected)?.group : null;
  return (
    <svg className="bm-svg" viewBox={VIEW} role="group" aria-label={`Map of ${total} research biases in ${GROUPS.length} groups. Each name is a link that opens its card.`}>
      <defs>
        {LAYOUT.sectors.map(({ g, a0, a1 }) => <path key={g.id} id={`bm-arc-${g.id}`} d={labelArc((R_BAND_IN + R_BAND_OUT) / 2, a0, a1)} fill="none" />)}
      </defs>
      <circle cx={C} cy={C} r={R_NODE} className="bm-ring" />
      {LAYOUT.sectors.map(({ g, a0, a1, n }, i) => (
        <g key={g.id} className={`bm-sector bm-g${i + 1}${hotGroup === g.id || selGroup === g.id ? ' is-hot' : ''}`} aria-hidden="true">
          <path d={annulus(R_BAND_IN, R_BAND_OUT, a0, a1)} />
          <text className="bm-group-label" dominantBaseline="central"><textPath href={`#bm-arc-${g.id}`} startOffset="50%" textAnchor="middle">{g.name}</textPath></text>
          <title>{`${g.name}: ${n} biases`}</title>
        </g>
      ))}
      <g aria-hidden="true" className="bm-centre">
        <circle cx={C} cy={C} r={R_BAND_IN - 10} />
        <text x={C} y={C - 8} textAnchor="middle" className="bm-centre-n">{visible.size}</text>
        <text x={C} y={C + 26} textAnchor="middle" className="bm-centre-t">{visible.size === total ? 'research biases' : `of ${total} biases`}</text>
      </g>
      {LAYOUT.nodes.map(({ b, angle }) => {
        const gi = GROUPS.findIndex((g) => g.id === b.group) + 1;
        const [x, y] = pt(R_NODE, angle);
        const [tx, ty] = pt(R_LABEL, angle);
        const right = angle < 180;
        const rot = right ? angle - 90 : angle + 90;
        const on = visible.has(b.id);
        const cls = ['bm-node', `bm-g${gi}`, selected === b.id && 'is-sel', !on && 'is-dim', hot === b.id && 'is-hot'].filter(Boolean).join(' ');
        return (
          <a
            key={b.id} href={hrefFor(b.id)} className={cls} aria-current={selected === b.id ? 'true' : undefined}
            aria-label={`${b.name} (${groupOf(b.group).name})${on ? '' : ', not in the current filter'}`}
            onClick={(e) => { e.preventDefault(); onPick(b.id); }}
            onMouseEnter={() => setHot(b.id)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(b.id)} onBlur={() => setHot(null)}
          >
            <line x1={f(pt(R_BAND_OUT, angle)[0])} y1={f(pt(R_BAND_OUT, angle)[1])} x2={f(x)} y2={f(y)} className="bm-spoke" />
            <circle cx={f(x)} cy={f(y)} r="14" className="bm-halo" />
            <circle cx={f(x)} cy={f(y)} r="7" className="bm-dot" />
            <text x={f(tx)} y={f(ty)} dy="0.35em" textAnchor={right ? 'start' : 'end'} transform={`rotate(${f(rot)} ${f(tx)} ${f(ty)})`} className="bm-label">{b.name}</text>
          </a>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- the card

function BiasCard({ b, methodName, onClose, id = 'bias-card' }) {
  const g = groupOf(b.group);
  const calcs = b.calcs.map(calcInfo).filter(Boolean);
  return (
    <article className="bm-card" id={id} tabIndex={-1} aria-labelledby={`${id}-h`}>
      <div className="bm-card-top">
        <p className="eyebrow">{g.name}</p>
        {onClose && <button type="button" className="bm-close" onClick={onClose} aria-label={`Close ${b.name}`}>×</button>}
      </div>
      <h2 id={`${id}-h`} className="bm-card-h">{b.name}</h2>
      {b.aka.length > 0 && <p className="muted bm-aka">Also called {b.aka.join(', ')}</p>}
      <div className="bm-stages"><span className="label">Threatens</span><StageBadges stages={b.stages} short={false} /></div>
      <p className="bm-what">{b.what}</p>
      <div className="panel bm-looks"><h3>What it looks like</h3><p>{b.looksLike}</p></div>
      <div className="bm-two">
        <div><h3 className="label">How to spot it</h3><ul className="bm-list">{b.spot.map((s) => <li key={s}>{s}</li>)}</ul></div>
        <div><h3 className="label">What to do about it</h3><ul className="bm-list bm-list-do">{b.counter.map((s) => <li key={s}>{s}</li>)}</ul></div>
      </div>
      <div className="bm-links">
        <h3 className="label">Methods that guard against it</h3>
        <div className="tags">{b.methods.map((m) => <Link key={m} className="tag" to={`/methods/${m}`}>{methodName(m)}</Link>)}</div>
      </div>
      {b.threatens?.length > 0 && (
        <div className="bm-links">
          <h3 className="label">Methods most prone to it</h3>
          <div className="tags">{b.threatens.map((m) => <Link key={m} className="tag" to={`/methods/${m}`}>{methodName(m)}</Link>)}</div>
        </div>
      )}
      {calcs.length > 0 && (
        <div className="bm-links">
          <h3 className="label">Calculators that help</h3>
          <div className="bm-calcs">{calcs.map((c) => <CalcCard key={c.id} c={c} />)}</div>
        </div>
      )}
      <SeeItLink biasId={b.id} />
      {b.source && (
        <p className="bm-source"><span className="label">Further reading</span>{b.source.author} ({b.source.year}). <i>{b.source.title}</i>{b.source.where ? `. ${b.source.where}.` : '.'}</p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- the list (phones, and the List view)

function BiasList({ selected, visible, onPick, hrefFor, methodName, filtering, alwaysOpen }) {
  const [open, setOpen] = useState(() => new Set(selected ? [BIAS_BY_ID.get(selected)?.group] : []));
  useEffect(() => {
    const g = selected && BIAS_BY_ID.get(selected)?.group;
    if (g) setOpen((s) => (s.has(g) ? s : new Set([...s, g])));
  }, [selected]);
  return (
    <div className={`bm-groups${alwaysOpen ? ' is-wide' : ''}`}>
      {GROUPS.map((g, i) => {
        const list = BIASES.filter((b) => b.group === g.id && visible.has(b.id));
        if (filtering && !list.length) return null;
        const expanded = alwaysOpen || filtering || open.has(g.id);
        const toggle = () => setOpen((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
        return (
          <section key={g.id} className={`bm-group bm-g${i + 1}`} aria-labelledby={`bm-gh-${g.id}`}>
            <h2 className="bm-group-h" id={`bm-gh-${g.id}`}>
              {alwaysOpen || filtering ? (
                <span className="bm-group-btn as-text"><span>{g.name}</span><span className="n">{list.length}</span></span>
              ) : (
                <button type="button" className="bm-group-btn" aria-expanded={expanded} aria-controls={`bm-gl-${g.id}`} onClick={toggle}>
                  <span>{g.name}</span><span className="n">{list.length}</span><span className="show-more-icon" aria-hidden="true">{expanded ? '−' : '+'}</span>
                </button>
              )}
            </h2>
            <p className="bm-group-blurb">{g.blurb}</p>
            <ul className="bm-items" id={`bm-gl-${g.id}`} hidden={!expanded}>
              {list.map((b) => (
                <li key={b.id} className={selected === b.id ? 'is-sel' : ''}>
                  <a href={hrefFor(b.id)} aria-expanded={selected === b.id} onClick={(e) => { e.preventDefault(); onPick(selected === b.id ? null : b.id); }}>
                    <span>{b.name}</span><StageBadges stages={b.stages} />
                  </a>
                  {selected === b.id && <BiasCard b={b} methodName={methodName} onClose={() => onPick(null)} />}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- check your study

function toMarkdown(list, stages, methods, methodName, linkFor) {
  const lines = ['# Research bias checklist', ''];
  if (stages.length) lines.push(`Study stages: ${stages.map((s) => STAGES[s].label).join(', ')}`);
  if (methods.length) lines.push(`Methods: ${methods.map(methodName).join(', ')}`);
  lines.push('');
  for (const g of GROUPS) {
    const items = list.filter((b) => b.group === g.id);
    if (!items.length) continue;
    lines.push(`## ${g.name}`, '');
    for (const b of items) {
      lines.push(`- [ ] **${b.name}**: ${b.what}`);
      lines.push(`  - Spot it: ${b.spot[0]}`);
      lines.push(`  - Counter it: ${b.counter[0]}`);
      lines.push(`  - More: ${linkFor(b.id)}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

function CheckStudy({ methodName, onPick, hrefFor, linkFor }) {
  const [stages, setStages] = useState([]);
  const [methods, setMethods] = useState([]);
  const [copied, setCopied] = useState('');
  const list = useMemo(() => biasesForStudy(stages, methods), [stages, methods]);
  const md = useMemo(() => toMarkdown(list, stages, methods, methodName, linkFor), [list, stages, methods, methodName, linkFor]);
  const flip = (setter, v) => setter((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]));
  const copy = async () => {
    try { await navigator.clipboard.writeText(md); setCopied('Copied the checklist as Markdown.'); }
    catch { setCopied('Copying is blocked here: open “Show the Markdown” and copy it from there.'); }
  };
  useEffect(() => { setCopied(''); }, [md]);
  const sortedMethods = useMemo(() => [...CHECK_METHODS].sort((a, b) => methodName(a).localeCompare(methodName(b))), [methodName]);
  return (
    <section className="section soft bm-check" id="check-your-study" tabIndex={-1} aria-labelledby="bm-check-h">
      <div className="wrap">
        <div className="section-head"><div><p className="eyebrow">Check your study</p><h2 className="h2" id="bm-check-h">Which biases should you watch for?</h2></div></div>
        <p className="bm-check-lede">Tick where your study is and the methods you are using. You get the biases most likely to creep in, as a checklist you can paste into your research plan.</p>
        <div className="bm-check-grid">
          <fieldset className="bm-fieldset">
            <legend className="label">Study stage</legend>
            {STAGE_ORDER.map((s) => (
              <label key={s} className="bm-check-opt"><input type="checkbox" checked={stages.includes(s)} onChange={() => flip(setStages, s)} /> {STAGES[s].label}</label>
            ))}
          </fieldset>
          <fieldset className="bm-fieldset bm-fieldset-methods">
            <legend className="label">Methods you are using</legend>
            {sortedMethods.map((m) => (
              <label key={m} className="bm-check-opt"><input type="checkbox" checked={methods.includes(m)} onChange={() => flip(setMethods, m)} /> {methodName(m)}</label>
            ))}
          </fieldset>
        </div>
        <div className="bm-check-out" aria-live="polite">
          {!stages.length && !methods.length ? (
            <p className="muted">Pick a stage or a method to see your checklist.</p>
          ) : !list.length ? (
            <p className="muted">No biases in the map match that combination. Try fewer stages, or another method.</p>
          ) : (
            <>
              <div className="results-line">
                <span><b>{list.length}</b> {list.length === 1 ? 'bias' : 'biases'} to watch for</span>
                <button type="button" className="btn small accent" onClick={copy}>Copy as Markdown</button>
              </div>
              {copied && <p className="bm-copied" role="status">{copied}</p>}
              <ol className="bm-check-list">
                {list.map((b) => (
                  <li key={b.id}>
                    <a href={hrefFor(b.id)} onClick={(e) => { e.preventDefault(); onPick(b.id, true); }}>{b.name}</a>
                    <span className="muted"> · {groupOf(b.group).name}</span>
                    <p>{b.counter[0]}</p>
                  </li>
                ))}
              </ol>
              <details className="bm-md">
                <summary>Show the Markdown</summary>
                <textarea readOnly value={md} aria-label="Checklist as Markdown" rows={12} onFocus={(e) => e.target.select()} />
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the page

export default function Biases() {
  const [params, setParams] = useSearchParams();
  const navType = useNavigationType();
  const narrow = useMedia(NARROW);
  const methodName = useMethodNames();
  const base = useHref('/biases');
  const selected = BIAS_BY_ID.has(params.get('b')) ? params.get('b') : null;
  const stage = STAGE_ORDER.includes(params.get('stage')) ? params.get('stage') : '';
  const q = params.get('q') || '';
  const view = params.get('view') === 'list' ? 'list' : 'map';
  const [status, setStatus] = useState('');

  const visible = useMemo(() => new Set(BIASES.filter((b) => (!stage || b.stages.includes(stage)) && matchesQuery(b, q)).map((b) => b.id)), [stage, q]);
  const filtering = Boolean(stage || q.trim());

  const update = (changes, replace = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace, preventScrollReset: true });
  };
  const hrefFor = (id) => {
    const next = new URLSearchParams(params); next.set('b', id);
    return `${base}?${next.toString()}`;
  };
  const linkFor = useMemo(() => (id) => new URL(`${base}?b=${id}`, window.location.href).toString(), [base]);

  const pick = (id, scroll = false) => {
    update({ b: id }, false);
    setStatus(id ? `Showing ${BIAS_BY_ID.get(id).name}` : 'Card closed');
    if (id && (scroll || (!narrow && view === 'map'))) {
      requestAnimationFrame(() => {
        const el = document.getElementById('bias-card');
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (scroll || r.top < 70 || r.top > window.innerHeight * 0.6) scrollToEl(el);
        if (scroll) el.focus({ preventScroll: true });
      });
    }
  };

  // Arriving from a link to one bias: bring its card into view once the page has settled.
  useEffect(() => {
    if (!selected || navType === 'POP') return undefined;
    const t = setTimeout(() => scrollToEl(document.getElementById('bias-card')), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.title = selected ? `${BIAS_BY_ID.get(selected).name} · Research biases · UX Methods Atlas` : 'Research biases · UX Methods Atlas'; }, [selected]);

  const showMap = !narrow && view === 'map';
  const sel = selected ? BIAS_BY_ID.get(selected) : null;

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Research biases</p>
          <h1 className="h1">Every method has <em>blind spots</em>.</h1>
          <p className="lede">
            Research is done by people, so our biases creep in: in who we recruit, how we ask, how we run sessions, how we read the results and how we decide.
            This map shows {BIASES.length} of them, how to spot each one in your own study, and the methods and calculators that guard against it.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn accent" onClick={() => { const el = document.getElementById('check-your-study'); scrollToEl(el); el?.focus({ preventScroll: true }); }}>Check your study</button>
            <Link to="/methods" className="btn ghost">Browse the methods</Link>
          </div>
        </div>
      </section>

      <section className="section tight bm-section">
        <div className="wrap">
          <div className="bm-filters">
            <label className="search bm-search">
              <span aria-hidden="true">⌕</span>
              <input type="search" value={q} onChange={(e) => update({ q: e.target.value })} placeholder="Search biases, e.g. survey, memory, A/B" aria-label="Search biases" />
            </label>
            <div className="filters" role="group" aria-label="Filter by study stage">
              <button type="button" className={`chip${!stage ? ' on' : ''}`} aria-pressed={!stage} onClick={() => update({ stage: '' })}>All stages</button>
              {STAGE_ORDER.map((s) => (
                <button key={s} type="button" className={`chip${stage === s ? ' on' : ''}`} aria-pressed={stage === s} onClick={() => update({ stage: stage === s ? '' : s })}>{STAGES[s].label}</button>
              ))}
            </div>
          </div>
          <div className="results-line">
            <span>{filtering ? <>Showing <b>{visible.size}</b> of {BIASES.length} biases</> : <><b>{BIASES.length}</b> biases in {GROUPS.length} groups</>}</span>
            {!narrow && (
              <div className="bm-view" role="group" aria-label="View">
                <button type="button" className={`chip${view === 'map' ? ' on' : ''}`} aria-pressed={view === 'map'} onClick={() => update({ view: '' })}>Map</button>
                <button type="button" className={`chip${view === 'list' ? ' on' : ''}`} aria-pressed={view === 'list'} onClick={() => update({ view: 'list' })}>List</button>
              </div>
            )}
          </div>
          <p className="sr-only" role="status">{status}</p>

          {showMap ? (
            <div className={`bm-layout${sel ? ' has-card' : ''}`}>
              <div className="bm-map">
                <BiasMap selected={selected} visible={visible} onPick={pick} hrefFor={hrefFor} total={BIASES.length} />
                <ul className="bm-legend" aria-label="Groups">
                  {GROUPS.map((g, i) => (
                    <li key={g.id} className={`bm-g${i + 1}`}><span className="sw" aria-hidden="true" /><span><b>{g.name}</b> <span className="muted">{g.blurb}</span></span></li>
                  ))}
                </ul>
              </div>
              <div className="bm-aside">
                {sel ? (
                  <BiasCard b={sel} methodName={methodName} onClose={() => pick(null)} />
                ) : (
                  <div className="bm-empty">
                    <h2 className="bm-card-h">Pick a bias</h2>
                    <p>Select any name on the map to see what it is, what it looks like in a real study, how to spot it and what guards against it.</p>
                    <p className="muted">The inner ring groups them by where they strike: who you ask, how you ask, how you run it, how you look at the results and how you decide. Use the stage buttons to see the biases that threaten one part of a study.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <BiasList selected={selected} visible={visible} onPick={pick} hrefFor={hrefFor} methodName={methodName} filtering={filtering} alwaysOpen={!narrow} />
          )}
          {filtering && !visible.size && <p className="muted bm-none">No bias matches “{q}”{stage ? ` at the ${STAGES[stage].label.toLowerCase()} stage` : ''}.</p>}
        </div>
      </section>

      <CheckStudy methodName={methodName} onPick={pick} hrefFor={hrefFor} linkFor={linkFor} />
    </>
  );
}
