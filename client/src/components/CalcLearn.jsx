// Shared pieces for finding and learning the calculators: guide text with links, stage badges and the study strip,
// keyboard tabs, the calculator switcher (a combobox), the "Before you start" panel and "What to do next".
// Every piece reads calc/learn.js, which falls back to the catalog when a calculator has no guide.
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks.js';
import { ShowMoreList } from './ShowMore.jsx';
import { CALC_INFO, DATA, STAGES, STAGE_KEYS, byPopularity, calcInfo, idWords, linkParts, matches } from '../calc/learn.js';

// Text from a guide, with its [label](/calculators/id) and [label](/methods/id) links as router links.
export function RichText({ text }) {
  return linkParts(text).map((p, i) => (p.to ? <Link key={i} to={p.to}>{p.text}</Link> : <Fragment key={i}>{p.text}</Fragment>));
}

// Method names for links and search: the research and design lists, cached by the API layer. Until they load,
// or for an id missing from both, the id spelt out as words stands in.
export function useMethodNames() {
  const { data: research } = useApi('/api/methods');
  const { data: design } = useApi('/api/design');
  return useMemo(() => {
    const map = new Map();
    for (const m of [...(research || []), ...(design || [])]) map.set(m.id, m.name);
    const name = (id) => map.get(id) || idWords(id).replace(/^./, (ch) => ch.toUpperCase());
    return name;
  }, [research, design]);
}

export function StageBadges({ stages, short = true }) {
  return (
    <span className="stage-badges">
      {stages.map((s) => <span key={s} className={`badge stage-badge st-${s}`}>{short ? STAGES[s]?.short : STAGES[s]?.label}</span>)}
    </span>
  );
}

// The four stages of a study in order, with this calculator's highlighted.
export function StageStrip({ stages }) {
  return (
    <ol className="stage-strip">
      {STAGE_KEYS.map((k, i) => {
        const on = stages.includes(k);
        return (
          <li key={k} className={on ? 'on' : ''}>
            <span className="n" aria-hidden="true">{i + 1}</span>
            <span>{STAGES[k].label}</span>
            {on && <span className="sr-only"> (used here)</span>}
          </li>
        );
      })}
    </ol>
  );
}

// A row of tabs with arrow-key, Home and End support (the WAI-ARIA tabs pattern, activation follows focus).
// Controlled: the parent owns `value` and renders the panel with tabPanelProps(id).
export function TabList({ items, value, onChange, label, idBase, className = '' }) {
  const refs = useRef({});
  function onKey(e) {
    const i = items.findIndex((t) => t.id === value);
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    if (j === null) return;
    e.preventDefault();
    onChange(items[j].id);
    refs.current[items[j].id]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className={`ctabs ${className}`.trim()} onKeyDown={onKey}>
      {items.map((t) => (
        <button
          key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab"
          id={`${idBase}-tab-${t.id}`} aria-controls={`${idBase}-panel`} aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1} className={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}
        >
          {t.label}{t.count !== undefined && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export const tabPanelProps = (idBase, value) => ({ role: 'tabpanel', id: `${idBase}-panel`, 'aria-labelledby': `${idBase}-tab-${value}`, tabIndex: 0 });

// Search box that jumps to another calculator: type to filter, arrows to move, Enter to open, Escape to close.
export function CalcSwitcher({ currentId, methodName }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const go = useNavigate();
  const id = useId();
  const listRef = useRef(null);
  const list = useMemo(() => {
    const all = q.trim() ? CALC_INFO.filter((c) => matches(c, q, methodName)) : [...CALC_INFO].sort(byPopularity);
    return all.filter((c) => c.id !== currentId);
  }, [q, currentId, methodName]);
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  const pick = (c) => { setOpen(false); setQ(''); go(`/calculators/${c.id}`); };
  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(list.length - 1); }
    else if (e.key === 'Enter') { if (open && list[active]) { e.preventDefault(); pick(list[active]); } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); } else setQ(''); }
  }
  const expanded = open && list.length > 0;
  return (
    <div className="calc-switch">
      <label htmlFor={`${id}-in`} className="sr-only">Jump to another calculator</label>
      <input
        id={`${id}-in`} type="text" role="combobox" autoComplete="off" spellCheck="false"
        placeholder="Jump to a calculator…" value={q}
        aria-expanded={expanded} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={expanded && list[active] ? `${id}-o-${list[active].id}` : undefined}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKey}
      />
      <ul id={`${id}-list`} role="listbox" aria-label="Calculators" ref={listRef} hidden={!expanded} className="calc-switch-list">
        {list.map((c, i) => (
          <li
            key={c.id} id={`${id}-o-${c.id}`} data-i={i} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
            onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseMove={() => setActive(i)}
          >
            <span className="nm">{c.name}</span>
            <span className="gp">{c.group}</span>
          </li>
        ))}
      </ul>
      {open && q.trim() && !list.length && <p className="calc-switch-none" role="status">No calculator matches “{q}”.</p>}
    </div>
  );
}

// The "Before you start" panel above a calculator: compact by default, the details behind tabs.
export function LearnPanel({ c, methodName }) {
  const g = c.guide;
  const tabs = g ? [
    (g.when?.length || g.notFor || g.needs) && { id: 'when', label: 'When to use it' },
    g.steps?.length && { id: 'steps', label: 'Step by step' },
    g.example && { id: 'example', label: 'Worked example' },
    (g.learn || g.deeper) && { id: 'learn', label: 'Learn the idea' },
    g.mistakes?.length && { id: 'mistakes', label: 'Common mistakes' },
  ].filter(Boolean) : [];
  const [tab, setTab] = useState(tabs[0]?.id);
  const [deep, setDeep] = useState(false);
  const idBase = useId().replace(/:/g, '');
  const methods = c.methods;

  return (
    <section className="calc-learn" aria-labelledby={`${idBase}-h`}>
      <div className="calc-learn-top">
        <p className="eyebrow" id={`${idBase}-h`}>Before you start</p>
        {c.hasGuide && <p className="calc-q">{c.question}</p>}
      </div>
      <div className="calc-learn-grid">
        <div>
          <h3 className="label">Where it fits in your study</h3>
          <StageStrip stages={c.stages} />
          {g?.studies?.length > 0 && <p className="calc-studies"><span className="muted">Used in:</span> {g.studies.join(' · ')}</p>}
          {!g && <p className="calc-studies muted">Part of the {c.group} tools.</p>}
        </div>
        {methods.length > 0 && (
          <div>
            <h3 className="label">Which methods it serves</h3>
            <ShowMoreList as="ul" className="calc-methods" limit={4} noun="methods">
              {methods.map((m) => <li key={m}><Link to={`/methods/${m}`}>{methodName(m)}</Link></li>)}
            </ShowMoreList>
          </div>
        )}
        {g?.needs && (
          <div>
            <h3 className="label">What you need</h3>
            <p className="calc-needs"><RichText text={g.needs} /></p>
          </div>
        )}
      </div>
      {tabs.length > 0 && (
        <div className="calc-learn-tabs">
          <TabList items={tabs} value={tab} onChange={setTab} label="Learn about this calculator" idBase={idBase} />
          <div className="calc-learn-panel" {...tabPanelProps(idBase, tab)}>
            {tab === 'when' && (
              <div className="split calc-when">
                {g.when?.length > 0 && <div className="panel good"><h4>Use it when</h4><ul>{g.when.map((w) => <li key={w}><RichText text={w} /></li>)}</ul></div>}
                {g.notFor && <div className="panel bad"><h4>Not for</h4><p><RichText text={g.notFor} /></p></div>}
              </div>
            )}
            {tab === 'steps' && <ol className="steps calc-steps">{g.steps.map((s, i) => <li key={i}><span><RichText text={s} /></span></li>)}</ol>}
            {tab === 'example' && <><p className="calc-example"><RichText text={g.example} /></p><p className="muted small">The numbers are a realistic scenario to show how to read the result; your own data will give different figures.</p></>}
            {tab === 'learn' && (
              <div className="calc-idea">
                {g.learn && <p><RichText text={g.learn} /></p>}
                {g.deeper && (
                  <>
                    <button type="button" className="show-more" aria-expanded={deep} aria-controls={`${idBase}-deep`} onClick={() => setDeep((v) => !v)}>
                      Go deeper<span className="show-more-icon" aria-hidden="true">{deep ? '−' : '+'}</span>
                    </button>
                    <div id={`${idBase}-deep`} hidden={!deep} className="calc-deeper"><p><RichText text={g.deeper} /></p></div>
                  </>
                )}
              </div>
            )}
            {tab === 'mistakes' && <ul className="calc-mistakes">{g.mistakes.map((m) => <li key={m}><RichText text={m} /></li>)}</ul>}
          </div>
        </div>
      )}
    </section>
  );
}

// Cards for the calculators that naturally come next, from the guide.
export function NextSteps({ c }) {
  const next = (c.guide?.next || []).map(calcInfo).filter(Boolean);
  if (!next.length) return null;
  return (
    <section className="calc-next" aria-labelledby="calc-next-h">
      <h2 id="calc-next-h">What to do next</h2>
      <div className="calc-cards">
        {next.map((n) => <CalcCard key={n.id} c={n} />)}
      </div>
    </section>
  );
}

// A compact card: name, plain question, stage badges and group.
export function CalcCard({ c }) {
  return (
    <Link to={`/calculators/${c.id}`} className="card calc-card">
      <h3>{c.name}</h3>
      <p>{c.question}</p>
      <div className="meta"><StageBadges stages={c.stages} /><span className="calc-card-group">{c.group}</span></div>
    </Link>
  );
}

export { DATA, STAGES };
