// The seven steps of the interview coding workbench (Prepare, Open coding, Axial coding, Selective coding, Sentiment,
// Patterns, Export) and the coaching panel beside them. State lives in qual-Coding.jsx; each step gets the project `p`,
// an updater `up(fn)` and the derived data `d` (analysable segments, code stats, sentiment).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Q from './qual-core.js';
import { COACH } from './qual-coach.js';
import { LABELS } from './qual-sentiment.js';
import { lcaData, lcaKMax } from './qual-lca.js';
import { LinePlot } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Problem, copyText, download } from './ui.jsx';

const cx = (...a) => a.filter(Boolean).join(' ');
const segLabel = (s) => `${s.interview} · ${s.n}`;

// ── Coaching ──
export function Coach({ step }) {
  const c = COACH[step]; if (!c) return null;
  return (
    <aside className="qc-coach" aria-label={`Coaching: ${c.title}`}>
      <p className="eyebrow">How to do this step well</p>
      <h3>{c.title}</h3>
      <ul className="qc-how">{c.how.map((h, i) => <li key={i}>{h}</li>)}</ul>
      {(c.good.length > 0 || c.weak.length > 0) && (
        <details open>
          <summary>Good and weak examples</summary>
          <ul className="qc-eg">
            {c.good.map(([e, why], i) => <li key={`g${i}`}><span className="qtag promote">Good</span> <b>{e}</b> <span>{why}</span></li>)}
            {c.weak.map(([e, why], i) => <li key={`w${i}`}><span className="qtag fix">Weak</span> <b>{e}</b> <span>{why}</span></li>)}
          </ul>
        </details>
      )}
      <details>
        <summary>Common mistakes</summary>
        <ul>{c.mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </details>
      {c.memos.length > 0 && (
        <details>
          <summary>Memo prompts</summary>
          <ul>{c.memos.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </details>
      )}
    </aside>
  );
}

function CopyBtn({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="btn ghost small" onClick={async () => { if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1600); } }}>{done ? 'Copied' : label}</button>;
}
function Check({ label, checked, onChange }) {
  return <label className="tl-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}
function TextField({ label, value, onChange, placeholder, wide = true }) {
  return (
    <label className={cx('calc-field', wide && 'wide', 'qc-text')}>
      <span>{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Memo({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <label className="calc-field wide qc-memo">
      <span>{label}</span>
      <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
const heat = (v, max, c = 'var(--c1)') => (v > 0 ? { background: `color-mix(in srgb, ${c} ${Math.round(12 + 60 * (v / (max || 1)))}%, transparent)` } : undefined);

// ── 1. Prepare ──
export function PrepareStep({ p, up, d, onSplit, preview }) {
  const [anon, setAnon] = useState({ emails: true, phones: true, urls: true });
  const [terms, setTerms] = useState('');
  const [msg, setMsg] = useState('');
  const names = useMemo(() => Q.nameCandidates(p.raw), [p.raw]);
  const o = p.options;
  const setOpt = (k, v) => up((q) => ({ ...q, options: { ...q.options, [k]: v } }));
  const runAnon = () => {
    const r = Q.anonymise(p.raw, { ...anon, terms });
    up((q) => ({ ...q, raw: r.text }));
    setMsg(`Replaced ${Q.plural(r.n.emails, 'email address', 'email addresses')}, ${Q.plural(r.n.phones, 'phone number')}, ${Q.plural(r.n.urls, 'link')} and ${Q.plural(r.n.terms, 'name or term', 'names or terms')}. Split again to update the segments.`);
  };
  const changed = preview.changed;
  return (
    <div className="qc-step">
      <Area label="Transcripts" value={p.raw} onChange={(v) => up((q) => ({ ...q, raw: v }))} rows={14}
        hint="One or more interviews. Start each with a heading line such as “# P3”, “Interview: P3” or a line of three dashes. Start each turn with a speaker label such as “P3:”, “I:” or “Interviewer:”. Timestamps at the start of a line are ignored."
        placeholder={'# P1\nI: Tell me about the last time you…\nP1: Well, it was…\n\n# P2\n…'} />
      <div className="calc-inputs">
        <Choice label="Segments" value={o.mode} onChange={(v) => setOpt('mode', v)} options={[['turn', 'One per speaker turn'], ['paragraph', 'One per paragraph']]} />
        <TextField wide={false} label="Interviewer labels" value={o.interviewerLabels} onChange={(v) => setOpt('interviewerLabels', v)} />
        <div className="calc-field"><span>Analysis</span><Check label="Leave interviewer turns out of the analysis" checked={o.excludeInterviewer} onChange={(v) => setOpt('excludeInterviewer', v)} /></div>
      </div>
      <details className="qc-panel" open>
        <summary>Anonymise first</summary>
        <p className="tl-note">Masks are applied to the text above, in this browser only. Read the result: no automatic method finds every identifying detail.</p>
        <div className="tl-row">
          <Check label="Email addresses → [email]" checked={anon.emails} onChange={(v) => setAnon({ ...anon, emails: v })} />
          <Check label="Phone numbers → [phone]" checked={anon.phones} onChange={(v) => setAnon({ ...anon, phones: v })} />
          <Check label="Web links → [link]" checked={anon.urls} onChange={(v) => setAnon({ ...anon, urls: v })} />
        </div>
        <Area label="Names and terms to replace, one per line" value={terms} onChange={setTerms} rows={3}
          hint="“Sarah Jones” becomes [name 1]; write “Acme Ltd = [employer]” to choose the placeholder. Whole words, any case." />
        {names.length > 0 && (
          <div className="qc-chips" aria-label="Possible names to check">
            <span className="muted">Capitalised words worth checking:</span>
            {names.map((n) => <button key={n.word} type="button" className="chip" onClick={() => setTerms((t) => (t.split('\n').map((x) => x.trim()).includes(n.word) ? t : `${t ? `${t.replace(/\n$/, '')}\n` : ''}${n.word}`))}>{n.word} <span className="n">{n.count}</span></button>)}
          </div>
        )}
        <div className="tl-row"><button type="button" className="btn small" onClick={runAnon}>Anonymise the text</button>{msg && <span className="tl-note" role="status">{msg}</span>}</div>
      </details>
      <div className="tl-row">
        <button type="button" className="btn accent small" onClick={onSplit}>{p.interviews.length ? 'Split again' : 'Split into segments'}</button>
        {changed && p.interviews.length > 0 && <span className="tl-note" role="status">The text or settings have changed since the last split.{preview.lost ? ` Splitting again removes the codes from ${Q.plural(preview.lost, 'segment')} whose text changed.` : ' Codes on unchanged segments are kept.'}</span>}
      </div>
      {p.interviews.length > 0 && (
        <>
          <dl className="calc-stats">
            <div><dt>Interviews</dt><dd>{d.counts.interviews}</dd></div>
            <div><dt>Segments</dt><dd>{d.counts.segments} ({d.counts.analysable} analysed)</dd></div>
            <div><dt>Interviewer turns</dt><dd>{d.counts.interviewer}{o.excludeInterviewer ? ', left out' : ', included'}</dd></div>
            <div><dt>Words</dt><dd>{d.counts.words.toLocaleString('en-GB')} ({d.counts.analysableWords.toLocaleString('en-GB')} analysed)</dd></div>
          </dl>
          <div className="clu-scroll"><table className="clu-table qc-table">
            <thead><tr><th>Interview</th><th>Segments</th><th>Analysed</th><th>Words analysed</th><th>Speakers</th></tr></thead>
            <tbody>{p.interviews.map((iv) => {
              const a = iv.segments.filter((s) => s.text && !(o.excludeInterviewer && s.interviewer));
              return <tr key={iv.name}><td>{iv.name}</td><td>{iv.segments.length}</td><td>{a.length}</td><td>{a.reduce((t, s) => t + Q.wordCount(s.text), 0)}</td><td>{[...new Set(iv.segments.map((s) => s.speaker || '(none)'))].join(', ')}</td></tr>;
            })}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

// ── Code editor with constant comparison, used by Open and Axial coding ──
function CodeEditor({ p, up, d, codeId, onClose }) {
  const code = p.codes.find((c) => c.id === codeId);
  const [tick, setTick] = useState({});
  const [splitName, setSplitName] = useState('');
  const [into, setInto] = useState('');
  useEffect(() => { setTick({}); setSplitName(''); setInto(''); }, [codeId]);
  if (!code) return null;
  const st = d.stats.get(code.id);
  const set = (k, v) => up((q) => ({ ...q, codes: q.codes.map((c) => (c.id === code.id ? { ...c, [k]: v } : c)) }));
  const ticked = Object.keys(tick).filter((k) => tick[k]);
  return (
    <section className="qc-editor" aria-label={`Code: ${code.name}`}>
      <div className="qc-editor-head">
        <h3>{code.inVivo && <span className="qtag opp">In vivo</span>} {code.name}</h3>
        <span className="muted">{Q.plural(st.n, 'segment')} · {Q.plural(st.nInterviews, 'interview')}</span>
        {onClose && <button type="button" className="btn ghost small" onClick={onClose}>Close</button>}
      </div>
      <TextField label="Name" value={code.name} onChange={(v) => set('name', v)} />
      <Memo label="Definition: what this code means" value={code.definition} onChange={(v) => set('definition', v)} rows={2} placeholder="One sentence a colleague could apply without asking you." />
      <div className="qc-two">
        <Memo label="Include when…" value={code.include} onChange={(v) => set('include', v)} rows={2} />
        <Memo label="Exclude when… (use instead)" value={code.exclude} onChange={(v) => set('exclude', v)} rows={2} />
      </div>
      <Memo label="Code memo" value={code.memo} onChange={(v) => set('memo', v)} rows={3} placeholder="How is this code changing? What do its segments have in common? What would make you split it?" />
      <h4 className="clu-h3">Constant comparison: every segment with this code</h4>
      {!st.n ? <p className="tl-note">Not applied to any segment yet.</p> : (
        <div className="qc-compare">
          {st.segs.map((s) => (
            <article key={s.id} className={cx('qc-quote', p.starred[s.id] && 'star')}>
              <header>
                <label className="tl-check"><input type="checkbox" checked={!!tick[s.id]} onChange={(e) => setTick({ ...tick, [s.id]: e.target.checked })} /><span className="sr-only">Tick for split: </span>{segLabel(s)}</label>
                <button type="button" className="qc-icon" aria-pressed={!!p.starred[s.id]} title="Star as an example quote" onClick={() => up((q) => ({ ...q, starred: { ...q.starred, [s.id]: !q.starred[s.id] } }))}>{p.starred[s.id] ? '★' : '☆'}<span className="sr-only">Star as example quote</span></button>
                <button type="button" className="qc-icon" title="Remove this code from the segment" onClick={() => up((q) => ({ ...q, coding: Q.toggleCode(q.coding, s.id, code.id) }))}>×<span className="sr-only">Remove code from segment</span></button>
              </header>
              <p>{s.text}</p>
              <p className="qc-also">{Q.codesOf(p.coding, s.id).filter((c) => c !== code.id).map((c) => d.codesById.get(c)?.name).filter(Boolean).join(' · ')}</p>
            </article>
          ))}
        </div>
      )}
      <div className="qc-ops">
        <div className="tl-row">
          <TextField wide={false} label={`Split: move ${ticked.length} ticked to a new code`} value={splitName} onChange={setSplitName} placeholder="New code name" />
          <button type="button" className="btn ghost small" disabled={!ticked.length || !splitName.trim()} onClick={() => { up((q) => Q.splitCode(q, code.id, ticked, splitName)); setTick({}); setSplitName(''); }}>Split</button>
        </div>
        <div className="tl-row">
          <label className="calc-field"><span>Merge this code into</span>
            <select className="select" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">Choose a code…</option>
              {p.codes.filter((c) => c.id !== code.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn ghost small" disabled={!into} onClick={() => { const t = into; up((q) => Q.mergeCodes(q, code.id, t)); onClose?.(t); }}>Merge</button>
          <button type="button" className="btn ghost small" onClick={() => { if (window.confirm(`Delete “${code.name}” and remove it from ${Q.plural(st.n, 'segment')}?`)) { up((q) => Q.deleteCode(q, code.id)); onClose?.(); } }}>Delete code</button>
        </div>
      </div>
    </section>
  );
}

function Codebook({ p, d, sel, onSel }) {
  const [q, setQ] = useState('');
  const list = p.codes.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="qc-codebook">
      <div className="tl-row"><h3 className="clu-h3">Codebook ({p.codes.length})</h3>
        <input className="qc-search" type="search" aria-label="Filter codes" placeholder="Filter codes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="qc-codes">
        {list.map((c) => {
          const st = d.stats.get(c.id);
          return (
            <li key={c.id}>
              <button type="button" className={cx('qc-code', sel === c.id && 'on')} onClick={() => onSel(sel === c.id ? '' : c.id)} aria-pressed={sel === c.id}>
                <span className="nm">{c.name}</span>
                <span className="n">{st.n} · {st.nInterviews}</span>
                {!c.definition.trim() && <span className="qtag opp" title="No definition yet">No definition</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="tl-note">Numbers: segments · interviews. Select a code to edit it and compare its segments.</p>
    </div>
  );
}

// ── 2. Open coding ──
export function OpenStep({ p, up, d, selCode, setSelCode }) {
  const [view, setView] = useState('one');
  const [ivF, setIvF] = useState('all');
  const [onlyUncoded, setOnlyUncoded] = useState(false);
  const [search, setSearch] = useState('');
  const [codeF, setCodeF] = useState('');
  const [pos, setPos] = useState(0);
  const [newName, setNewName] = useState('');
  const [hint, setHint] = useState('');
  const textRef = useRef(null);
  const segs = d.segs;
  const filtered = useMemo(() => segs.filter((s) => (ivF === 'all' || String(s.ii) === ivF)
    && (!onlyUncoded || !Q.codesOf(p.coding, s.id).length)
    && (!codeF || Q.codesOf(p.coding, s.id).includes(codeF))
    && (!search.trim() || s.text.toLowerCase().includes(search.trim().toLowerCase()))), [segs, ivF, onlyUncoded, codeF, search, p.coding]);
  const cur = filtered[Math.min(pos, Math.max(0, filtered.length - 1))];
  useEffect(() => { if (pos >= filtered.length && filtered.length) setPos(filtered.length - 1); }, [filtered.length, pos]);
  const worth = d.worth[ivF === 'all' ? (cur ? cur.ii : 0) : Number(ivF)] || [];
  const ivName = p.interviews[ivF === 'all' ? (cur ? cur.ii : 0) : Number(ivF)]?.name;

  const addCode = (name, segId, inVivo = false) => {
    const nm = name.trim(); if (!nm) return;
    up((q) => {
      const ex = q.codes.find((c) => c.name.toLowerCase() === nm.toLowerCase());
      if (ex) return segId ? { ...q, coding: (q.coding[segId] || []).includes(ex.id) ? q.coding : Q.toggleCode(q.coding, segId, ex.id) } : q;
      const id = Q.newId('c', q.codes);
      const codes = [...q.codes, { id, name: nm, definition: '', include: '', exclude: '', memo: '', category: '', inVivo }];
      return { ...q, codes, coding: segId ? Q.toggleCode(q.coding, segId, id) : q.coding };
    });
  };
  const inVivo = () => {
    const sel = (window.getSelection?.().toString() || '').replace(/\s+/g, ' ').trim();
    const node = window.getSelection?.().anchorNode;
    if (!sel || !textRef.current || !node || !textRef.current.contains(node)) { setHint('Select a few words in the segment text first, then press the button.'); return; }
    if (sel.length > 60) { setHint('In-vivo codes work best as a short phrase: select up to about 8 words.'); return; }
    addCode(`“${sel.replace(/^["“”']+|["“”']+$/g, '')}”`, cur.id, true); setHint('');
  };
  const prevQ = cur && (() => { const iv = p.interviews[cur.ii]; const k = iv.segments.findIndex((s) => s.id === cur.id); for (let j = k - 1; j >= 0; j--) if (iv.segments[j].interviewer) return iv.segments[j]; return null; })();
  const nextUncoded = () => { const j = filtered.findIndex((s, i) => i > pos && !Q.codesOf(p.coding, s.id).length); if (j >= 0) setPos(j); };
  const memo = cur ? (p.segMemos[cur.id] || '') : '';
  const highlight = (t) => {
    const w = search.trim(); if (!w) return t;
    const parts = t.split(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
    return parts.map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x));
  };
  if (!segs.length) return <Problem>Paste transcripts and split them into segments in Prepare first.</Problem>;
  return (
    <div className="qc-open">
      <div className="qc-main-col">
        <div className="calc-inputs qc-filters">
          <Choice label="View" value={view} onChange={setView} options={[['one', 'One at a time'], ['list', 'List']]} />
          <label className="calc-field"><span>Interview</span>
            <select className="select" value={ivF} onChange={(e) => { setIvF(e.target.value); setPos(0); }}>
              <option value="all">All interviews</option>
              {p.interviews.map((iv, i) => <option key={iv.name} value={String(i)}>{iv.name}</option>)}
            </select>
          </label>
          <label className="calc-field"><span>With code</span>
            <select className="select" value={codeF} onChange={(e) => { setCodeF(e.target.value); setPos(0); }}>
              <option value="">Any or none</option>
              {p.codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="calc-field"><span>Find words</span><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPos(0); }} placeholder="e.g. password" /></label>
          <div className="calc-field"><span>Show</span><Check label="Uncoded only" checked={onlyUncoded} onChange={(v) => { setOnlyUncoded(v); setPos(0); }} /></div>
        </div>
        {worth.length > 0 && (
          <div className="qc-chips qc-worth">
            <span className="muted">Words worth a look in {ivName} <span title="Words this interview uses more than the others (TF-IDF). A prompt to read, not a code.">(TF-IDF)</span>:</span>
            {worth.map((w) => <button key={w.word} type="button" className={cx('chip', search === w.word && 'on')} onClick={() => { setSearch(search === w.word ? '' : w.word); setPos(0); }}>{w.word} <span className="n">{w.count}</span></button>)}
          </div>
        )}
        {!filtered.length ? <p className="tl-note">No segments match these filters.</p> : view === 'one' ? (
          <section className="qc-focus" aria-label="Current segment">
            <div className="qc-focus-head">
              <b>{segLabel(cur)}</b> <span className="muted">{cur.speaker && `${cur.speaker} · `}{pos + 1} of {filtered.length}</span>
              <span className="qc-nav">
                <button type="button" className="btn ghost small" disabled={pos <= 0} onClick={() => setPos(pos - 1)}>Previous</button>
                <button type="button" className="btn ghost small" disabled={pos >= filtered.length - 1} onClick={() => setPos(pos + 1)}>Next</button>
                <button type="button" className="btn ghost small" onClick={nextUncoded}>Next uncoded</button>
              </span>
            </div>
            {prevQ && <p className="qc-context"><span className="qtag">{prevQ.speaker || 'Q'}</span> {prevQ.text}</p>}
            <blockquote className="qc-seg" ref={textRef}>{highlight(cur.text)}</blockquote>
            <div className="qc-chips" role="group" aria-label="Codes on this segment">
              {p.codes.map((c) => { const on = Q.codesOf(p.coding, cur.id).includes(c.id); return <button key={c.id} type="button" className={cx('chip', on && 'on')} aria-pressed={on} title={c.definition || 'No definition yet'} onClick={() => up((q) => ({ ...q, coding: Q.toggleCode(q.coding, cur.id, c.id) }))}>{c.name}</button>; })}
              {!p.codes.length && <span className="tl-note">No codes yet: name what is going on in this segment below.</span>}
            </div>
            <form className="tl-row qc-add" onSubmit={(e) => { e.preventDefault(); addCode(newName, cur.id); setNewName(''); }}>
              <label className="calc-field"><span>New code for this segment</span><input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Checking whether it worked" /></label>
              <button type="submit" className="btn small" disabled={!newName.trim()}>Add code</button>
              <button type="button" className="btn ghost small" onMouseDown={(e) => e.preventDefault()} onClick={inVivo}>Code selection in vivo</button>
            </form>
            {hint && <p className="tl-note" role="status">{hint}</p>}
            <Memo label="Segment memo" value={memo} onChange={(v) => up((q) => ({ ...q, segMemos: { ...q.segMemos, [cur.id]: v } }))} rows={2} placeholder="What is going on here? What does it remind you of in other interviews?" />
          </section>
        ) : (
          <ol className="qc-list">
            {filtered.map((s) => {
              const mine = Q.codesOf(p.coding, s.id);
              return (
                <li key={s.id} className={cx('qc-row', !mine.length && 'uncoded')}>
                  <div className="qc-row-head"><b>{segLabel(s)}</b>{s.speaker && <span className="muted"> {s.speaker}</span>}{p.segMemos[s.id] && <span className="qtag" title={p.segMemos[s.id]}>Memo</span>}</div>
                  <p>{highlight(s.text)}</p>
                  <div className="qc-chips">
                    {mine.map((c) => <button key={c} type="button" className="chip on" title="Remove" onClick={() => up((q) => ({ ...q, coding: Q.toggleCode(q.coding, s.id, c) }))}>{d.codesById.get(c)?.name} <span aria-hidden="true">×</span><span className="sr-only">remove</span></button>)}
                    <select className="select qc-addsel" aria-label={`Add a code to ${segLabel(s)}`} value="" onChange={(e) => { const v = e.target.value; if (v) up((q) => ({ ...q, coding: Q.toggleCode(q.coding, s.id, v) })); }}>
                      <option value="">Add code…</option>
                      {p.codes.filter((c) => !mine.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="qc-side-col">
        <Codebook p={p} d={d} sel={selCode} onSel={setSelCode} />
        {selCode && <CodeEditor p={p} up={up} d={d} codeId={selCode} onClose={(to) => setSelCode(typeof to === 'string' ? to : '')} />}
      </div>
    </div>
  );
}

// ── 3. Axial coding ──
export function AxialStep({ p, up, d, selCode, setSelCode }) {
  const [mode, setMode] = useState('codes');
  const [from, setFrom] = useState(''); const [into, setInto] = useState('');
  const used = p.codes.filter((c) => d.stats.get(c.id).n > 0);
  const co = useMemo(() => Q.cooccurrence(used.map((c) => c.id), d.segs, p.coding), [used.map((c) => c.id).join(), d.segs, p.coding]);
  const maxCo = Math.max(1, ...co.flatMap((r, i) => r.filter((_, j) => j !== i)));
  const setCat = (id, k, v) => up((q) => ({ ...q, categories: q.categories.map((c) => (c.id === id ? { ...c, [k]: v } : c)) }));
  const cols = mode === 'codes' ? used.map((c) => ({ id: c.id, name: c.name })) : p.categories.map((c) => ({ id: c.id, name: c.name }));
  const M = useMemo(() => {
    if (mode === 'codes') return Q.presence(cols.map((c) => c.id), p.interviews, d.segs, p.coding);
    return p.interviews.map((_, i) => p.categories.map((cat) => d.segs.filter((s) => s.ii === i && Q.segCategories(d.codesById, p.coding, s.id).includes(cat.id)).length));
  }, [mode, cols.map((c) => c.id).join(), p.interviews, d.segs, p.coding, p.categories, d.codesById]);
  const maxM = Math.max(1, ...M.flat());
  if (!p.codes.length) return <Problem>Create some codes in Open coding first.</Problem>;
  return (
    <div className="qc-step">
      <h3 className="clu-h3">Categories (themes)</h3>
      <div className="qc-cats">
        {p.categories.map((cat, ci) => {
          const members = p.codes.filter((c) => c.category === cat.id);
          return (
            <article key={cat.id} className="qc-cat" style={{ '--qc': `var(--c${(ci % 8) + 1})` }}>
              <TextField label="Category name" value={cat.name} onChange={(v) => setCat(cat.id, 'name', v)} />
              <Memo label="What this category says" value={cat.description} onChange={(v) => setCat(cat.id, 'description', v)} rows={2} placeholder="A sentence with a claim, not a topic label." />
              <div className="qc-chips">{members.length ? members.map((c) => <button key={c.id} type="button" className="chip" onClick={() => setSelCode(c.id)}>{c.name} <span className="n">{d.stats.get(c.id).n}</span></button>) : <span className="tl-note">No codes yet: assign codes in the table below.</span>}</div>
              <details>
                <summary>Paradigm model (optional)</summary>
                <Memo label="Conditions: what leads to it?" value={cat.conditions} onChange={(v) => setCat(cat.id, 'conditions', v)} rows={2} />
                <Memo label="Context: where and when?" value={cat.context} onChange={(v) => setCat(cat.id, 'context', v)} rows={2} />
                <Memo label="Actions and interactions: what do people do?" value={cat.actions} onChange={(v) => setCat(cat.id, 'actions', v)} rows={2} />
                <Memo label="Consequences: what follows?" value={cat.consequences} onChange={(v) => setCat(cat.id, 'consequences', v)} rows={2} />
              </details>
              <details><summary>Category memo</summary><Memo label="Memo" value={cat.memo} onChange={(v) => setCat(cat.id, 'memo', v)} rows={3} /></details>
              <button type="button" className="btn ghost small" onClick={() => up((q) => ({ ...q, categories: q.categories.filter((c) => c.id !== cat.id), codes: q.codes.map((c) => (c.category === cat.id ? { ...c, category: '' } : c)), core: q.core === cat.id ? '' : q.core }))}>Remove category</button>
            </article>
          );
        })}
      </div>
      <div className="tl-row"><button type="button" className="btn small" onClick={() => up((q) => ({ ...q, categories: [...q.categories, { id: Q.newId('t', q.categories), name: `New category ${q.categories.length + 1}`, description: '', conditions: '', context: '', actions: '', consequences: '', memo: '' }] }))}>Add category</button></div>

      <h3 className="clu-h3">Codes and their categories</h3>
      <div className="clu-scroll"><table className="clu-table qc-table">
        <thead><tr><th>Code</th><th>Category</th><th>Segments</th><th>Interviews</th><th>Definition</th></tr></thead>
        <tbody>{p.codes.map((c) => {
          const st = d.stats.get(c.id);
          return (
            <tr key={c.id} className={st.n ? '' : 'off'}>
              <td><button type="button" className="qc-link" onClick={() => setSelCode(c.id)}>{c.name}</button></td>
              <td><select className="select" aria-label={`Category for ${c.name}`} value={c.category} onChange={(e) => up((q) => ({ ...q, codes: q.codes.map((x) => (x.id === c.id ? { ...x, category: e.target.value } : x)) }))}>
                <option value="">Not in a category</option>
                {p.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select></td>
              <td>{st.n}</td><td>{st.nInterviews}</td><td>{c.definition || <span className="muted">No definition yet</span>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="tl-row qc-merge">
        <label className="calc-field"><span>Merge</span><select className="select" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose a code…</option>{p.codes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="calc-field"><span>into</span><select className="select" value={into} onChange={(e) => setInto(e.target.value)}><option value="">Choose a code…</option>{p.codes.filter((c) => c.id !== from).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="button" className="btn ghost small" disabled={!from || !into || from === into} onClick={() => { up((q) => Q.mergeCodes(q, from, into)); setFrom(''); }}>Merge codes</button>
        <span className="tl-note">To rename or split, select a code (split moves ticked segments to a new code).</span>
      </div>
      {selCode && <CodeEditor p={p} up={up} d={d} codeId={selCode} onClose={(to) => setSelCode(typeof to === 'string' ? to : '')} />}

      <h3 className="clu-h3">Code co-occurrence (segments carrying both codes)</h3>
      {used.length < 2 ? <p className="tl-note">Apply at least two codes to see which travel together.</p> : (
        <div className="clu-scroll qc-matrix"><table className="clu-table qc-heat" aria-label="Code co-occurrence counts">
          <thead><tr><th>Code</th>{used.map((c, j) => <th key={c.id} title={c.name}><span>{j + 1}</span></th>)}</tr></thead>
          <tbody>{used.map((c, i) => <tr key={c.id}><td>{i + 1}. {c.name}</td>{co[i].map((v, j) => <td key={j} className={i === j ? 'diag' : ''} style={i === j ? undefined : heat(v, maxCo)}>{v || ''}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      <p className="tl-note">The diagonal is the number of segments with the code. Pairs that always co-occur may be one idea; pairs that never do may be alternatives. For Jaccard, lift and a network diagram, export to <Link to="/calculators/code-network">Code co-occurrence network</Link>.</p>

      <h3 className="clu-h3">Who said what: interviews × {mode === 'codes' ? 'codes' : 'categories'}</h3>
      <Choice label="Columns" value={mode} onChange={setMode} options={[['codes', 'Codes'], ['cats', 'Categories']]} />
      {!cols.length ? <p className="tl-note">Nothing to show yet.</p> : (
        <div className="clu-scroll qc-matrix"><table className="clu-table qc-heat" aria-label="Segments per interview">
          <thead><tr><th>{mode === 'codes' ? 'Code' : 'Category'}</th>{p.interviews.map((iv) => <th key={iv.name}>{iv.name}</th>)}<th>Interviews</th></tr></thead>
          <tbody>{cols.map((c, k) => <tr key={c.id}><td>{c.name}</td>{p.interviews.map((iv, i) => <td key={iv.name} style={heat(M[i][k], maxM, 'var(--c3)')}>{M[i][k] || ''}</td>)}<td><b>{M.filter((r) => r[k] > 0).length}</b></td></tr>)}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ── 4. Selective coding and themes ──
export function SelectiveStep({ p, up, d }) {
  const themes = d.themes;
  if (!p.categories.length) return <Problem>Group your codes into categories in Axial coding first.</Problem>;
  const loose = p.codes.filter((c) => !c.category && d.stats.get(c.id).n > 0);
  return (
    <div className="qc-step">
      <div className="calc-inputs">
        <label className="calc-field"><span>Core category</span>
          <select className="select" value={p.core} onChange={(e) => up((q) => ({ ...q, core: e.target.value }))}>
            <option value="">Not chosen yet</option>
            {p.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <small>The idea most other categories connect to, that recurs and that explains differences between people.</small>
        </label>
      </div>
      <Memo label="Storyline memo" value={p.storyline} onChange={(v) => up((q) => ({ ...q, storyline: v }))} rows={5}
        placeholder="In a few sentences: what is going on across these interviews? Use your categories as the vocabulary, and say how they connect." />
      <h3 className="clu-h3">Theme summary</h3>
      <div className="qc-themes">
        {themes.map((t, ti) => (
          <article key={t.id} className={cx('qc-theme', t.id === p.core && 'core')} style={{ '--qc': `var(--c${(p.categories.findIndex((c) => c.id === t.id) % 8) + 1})` }}>
            <header><h4>{t.name}{t.id === p.core && <span className="qtag promote">Core</span>}</h4>
              <span className="muted">{t.interviews} of {p.interviews.length} interviews · {Q.plural(t.segments, 'segment')}</span></header>
            {t.description && <p>{t.description}</p>}
            <div className="tl-bars qc-bars" role="list" aria-label={`Interviews with ${t.name}`}>
              <div role="listitem"><span className="nm">Interviews</span><span className="bar"><i style={{ width: `${(t.interviews / Math.max(1, p.interviews.length)) * 100}%` }} /></span><b>{t.interviews} / {p.interviews.length}</b></div>
            </div>
            <p className="qc-also">Codes: {t.codes.map((c) => `${c.name} (${c.n})`).join(' · ') || 'none'}</p>
            {t.quotes.map((s) => (
              <blockquote key={s.id} className="qc-q">
                “{Q.shortQuote(s.text, 260)}” <cite>{s.interview}</cite>
                <button type="button" className="qc-icon" aria-pressed={!!p.starred[s.id]} title="Star as an example quote" onClick={() => up((q) => ({ ...q, starred: { ...q.starred, [s.id]: !q.starred[s.id] } }))}>{p.starred[s.id] ? '★' : '☆'}<span className="sr-only">Star</span></button>
              </blockquote>
            ))}
            {!t.quotes.length && <p className="tl-note">No coded segments yet.</p>}
          </article>
        ))}
      </div>
      {loose.length > 0 && <p className="tl-note"><b>Codes not in a theme:</b> {loose.map((c) => c.name).join(', ')}. Decide whether each belongs in a theme, is a negative case worth reporting, or can go.</p>}
      <p className="tl-note">Quotes: starred segments first, then the segments carrying most of the theme’s codes, one per interview where possible. Star better quotes in the code editor or here.</p>
    </div>
  );
}

// ── 5. Sentiment ──
const TONE = { positive: 'var(--ok)', mixed: 'var(--warn)', neutral: 'var(--bg-sunk)', negative: 'var(--bad)' };
function SentimentBars({ rows }) {
  const W = 640, rowH = 26, L = 150, R = 60, H = rows.length * rowH + 30;
  const sx = (v) => L + v * (W - L - R);
  return (
    <figure className="qc-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label="Share of segments by sentiment label">
        {rows.map((r, i) => {
          let x = 0; const y = 4 + i * rowH;
          return (
            <g key={r.name}>
              <text x={L - 8} y={y + 15} textAnchor="end" className="lb">{r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name}</text>
              {['negative', 'mixed', 'neutral', 'positive'].map((l) => { const w = r.r[l] || 0; const el = w > 0 && <rect key={l} x={sx(x)} y={y + 2} width={Math.max(0, sx(x + w) - sx(x))} height={rowH - 8} style={{ fill: TONE[l] }}><title>{`${r.name}: ${l} ${(w * 100).toFixed(0)}%`}</title></rect>; x += w; return el; })}
              <text x={W - R + 6} y={y + 15} className="lbs">{Q.fmt(r.r.mean, 2)}</text>
            </g>
          );
        })}
        <text x={W - R + 6} y={H - 6} className="ax">mean</text>
        <text x={L} y={H - 6} className="ax">0%</text><text x={W - R} y={H - 6} className="ax" textAnchor="end">100%</text>
      </svg>
      <ul className="tl-legend">{['negative', 'mixed', 'neutral', 'positive'].map((l) => <li key={l}><i style={{ background: TONE[l], border: '1px solid var(--line)' }} />{l}</li>)}</ul>
    </figure>
  );
}
export function SentimentStep({ p, up, d }) {
  const [by, setBy] = useState('interview');
  const [lab, setLab] = useState('all');
  if (!d.segs.length) return <Problem>Split transcripts into segments in Prepare first.</Problem>;
  const rows = d.sentRollups[by];
  const list = d.segs.filter((s) => lab === 'all' || d.sentiment.get(s.id).label === lab || (lab === 'overridden' && d.sentiment.get(s.id).overridden));
  return (
    <div className="qc-step">
      <p className="calc-warn"><b>A rough guide, not a measurement.</b> Scores come from a word list with rules for negation (“not good”), intensifiers (“very slow”) and “but” clauses. They cannot hear sarcasm or tone, miss words whose meaning depends on your product, and swing on one word in a short segment. Read the segments, override labels you disagree with, and report sentiment with quotes.</p>
      <dl className="calc-stats">
        {LABELS.map((l) => <div key={l}><dt>{l[0].toUpperCase() + l.slice(1)}</dt><dd>{Q.pctS(d.sentAll[l])} ({d.sentAll.counts[l]})</dd></div>)}
        <div><dt>Overridden by you</dt><dd>{d.segs.filter((s) => d.sentiment.get(s.id).overridden).length}</dd></div>
      </dl>
      <Choice label="Roll up by" value={by} onChange={setBy} options={[['interview', 'Interview'], ['code', 'Code'], ['category', 'Category']]} />
      {rows.length ? <SentimentBars rows={rows} /> : <p className="tl-note">Nothing coded yet at this level.</p>}
      <p className="tl-note">A segment with several codes counts towards each of them. Mean is the average compound score (−1 to +1); a label you set counts as +0.5, −0.5 or 0.</p>
      <h3 className="clu-h3">Segments</h3>
      <Choice label="Show" value={lab} onChange={setLab} options={[['all', 'All'], ['negative', 'Negative'], ['mixed', 'Mixed'], ['positive', 'Positive'], ['neutral', 'Neutral'], ['overridden', 'Overridden']]} />
      <div className="clu-scroll"><table className="clu-table qc-table qc-sent">
        <thead><tr><th>Segment</th><th>Text</th><th>Words scored</th><th>Score</th><th>Label</th></tr></thead>
        <tbody>{list.map((s) => {
          const r = d.sentiment.get(s.id);
          return (
            <tr key={s.id}>
              <td>{segLabel(s)}</td>
              <td>{Q.shortQuote(s.text, 220)}</td>
              <td className="qc-hits">{r.hits.length ? r.hits.map((h, i) => <span key={i} className={cx('qtag', h.value > 0 ? 'promote' : 'fix')} title={`${h.base > 0 ? '+' : ''}${h.base}${h.rules.length ? `, ${h.rules.join(', ')}` : ''} → ${h.value.toFixed(2)}`}>{h.rules.includes('negated') && 'not '}{h.word}</span>) : <span className="muted">none</span>}</td>
              <td>{Q.fmt(r.autoScore, 2)}</td>
              <td><select className="select" aria-label={`Sentiment for ${segLabel(s)}`} value={p.overrides[s.id] || ''} onChange={(e) => up((q) => { const o = { ...q.overrides }; if (e.target.value) o[s.id] = e.target.value; else delete o[s.id]; return { ...q, overrides: o }; })}>
                <option value="">Auto: {r.auto}</option>
                {LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select></td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </div>
  );
}

// ── 6. Patterns: LDA and latent classes ──
export function PatternsStep({ p, up, d, lda, runLda, lca, runLca }) {
  const [K, setK] = useState('4');
  const [iters, setIters] = useState('1000');
  const [seed, setSeed] = useState('1');
  const [alpha, setAlpha] = useState('0.1');
  const [beta, setBeta] = useState('0.01');
  const [minDf, setMinDf] = useState('2');
  const [lcaOn, setLcaOn] = useState('cats');
  if (!d.segs.length) return <Problem>Split transcripts into segments in Prepare first.</Problem>;
  const words = d.counts.analysableWords;
  const ldaRes = lda.result;
  const items = lcaOn === 'cats' ? p.categories.map((c) => ({ id: c.id, name: c.name })) : p.codes.filter((c) => d.stats.get(c.id).n > 0).map((c) => ({ id: c.id, name: c.name }));
  const M = lcaOn === 'cats'
    ? p.interviews.map((_, i) => p.categories.map((cat) => d.segs.filter((s) => s.ii === i && Q.segCategories(d.codesById, p.coding, s.id).includes(cat.id)).length))
    : Q.presence(items.map((c) => c.id), p.interviews, d.segs, p.coding);
  const ld = lcaData(M, items.map((c) => c.name));
  const lcaRes = lca.result;
  const go = () => runLda({ K: Math.max(2, Math.min(12, Math.round(+K) || 4)), iters: Math.max(50, Math.min(5000, Math.round(+iters) || 1000)), seed: Math.round(+seed) || 1, alpha: +alpha > 0 ? +alpha : 0.1, beta: +beta > 0 ? +beta : 0.01 }, { minDf: Math.max(1, Math.round(+minDf) || 2) });
  return (
    <div className="qc-step">
      <h3 className="clu-h3">Topic modelling (LDA)</h3>
      <p className="calc-warn"><b>LDA needs far more text than a handful of interviews.</b> It finds words that tend to appear in the same segments; with under about 10,000 words its topics change from seed to seed. You have {words.toLocaleString('en-GB')} words in {d.segs.length} segments{words < 10000 ? ', so treat every topic as a prompt for your own coding, not a finding' : ''}. Topics are not themes.</p>
      <div className="calc-inputs">
        <Num label="Topics (K)" value={K} onChange={setK} min={2} max={12} />
        <Num label="Iterations" value={iters} onChange={setIters} min={50} max={5000} step={50} />
        <Num label="Seed" value={seed} onChange={setSeed} min={1} />
        <Num label="Min segments per word" value={minDf} onChange={setMinDf} min={1} max={10} />
      </div>
      <details className="qc-panel">
        <summary>Stopwords and priors</summary>
        <Area label="Extra stopwords (words to leave out)" value={p.stop} onChange={(v) => up((q) => ({ ...q, stop: v }))} rows={2} hint="Separate with spaces or commas. Add product and company names that appear everywhere. Common English words and filler (um, like, yeah, kind of) are left out already." />
        <div className="calc-inputs">
          <Num label="α (segment–topic prior)" value={alpha} onChange={setAlpha} min={0.001} step={0.05} hint="Smaller: each segment leans on fewer topics." />
          <Num label="β (topic–word prior)" value={beta} onChange={setBeta} min={0.001} step={0.01} hint="Smaller: topics use fewer words." />
        </div>
      </details>
      <div className="tl-row">
        <button type="button" className="btn accent small" onClick={go} disabled={lda.busy}>{lda.busy ? 'Running…' : 'Run topic model'}</button>
        {lda.busy && <span className="qc-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lda.progress * 100)}><i style={{ width: `${lda.progress * 100}%` }} /></span>}
        {lda.error && <span className="calc-warn" role="alert">{lda.error}</span>}
      </div>
      {ldaRes && (
        <>
          <p className="tl-note">{ldaRes.opts.K} topics from {ldaRes.tokens.toLocaleString('en-GB')} words ({ldaRes.V} different words used in at least {ldaRes.minDf} segments), {ldaRes.opts.iters} sweeps, seed {ldaRes.opts.seed}. Run again with another seed: topics that come back are worth more.</p>
          <div className="qc-topics">
            {ldaRes.topics.map((t) => (
              <article key={t.k} className="qc-topic" style={{ '--qc': `var(--c${(t.k % 8) + 1})` }}>
                <header><h4>Topic {t.k + 1}</h4><span className="muted">{Q.pctS(t.share)} of words</span></header>
                <div className="tl-bars qc-bars" role="list" aria-label={`Top words, topic ${t.k + 1}`}>
                  {t.words.slice(0, 8).map((w) => <div key={w.word} role="listitem"><span className="nm">{w.word}</span><span className="bar"><i style={{ width: `${(w.p / t.words[0].p) * 100}%` }} /></span><b>{(w.p * 100).toFixed(1)}%</b></div>)}
                </div>
                <h5>Most typical segments</h5>
                {t.docs.map((x) => { const s = d.segs[x.doc]; return s ? <blockquote key={x.doc} className="qc-q">“{Q.shortQuote(s.text, 200)}” <cite>{segLabel(s)} · {Q.pctS(x.theta)}</cite></blockquote> : null; })}
              </article>
            ))}
          </div>
          <LinePlot label="Log-likelihood by iteration" series={[{ name: 'log p(w | z)', pts: ldaRes.trace.map((t) => [t.iter, t.ll]) }]} xLabel="Iteration" yLabel="Log-likelihood" yFmt={(v) => Math.round(v).toLocaleString('en-GB')} height={200} legend={false} />
          <p className="tl-note">The fit should climb then level off. If it is still climbing at the end, run more iterations.</p>
        </>
      )}

      <h3 className="clu-h3">Latent class analysis of interviews</h3>
      <p className="calc-warn"><b>Exploratory at best with {p.interviews.length} interviews.</b> Latent class analysis looks for groups of interviews that share a pattern of {lcaOn === 'cats' ? 'themes' : 'codes'}. It is normally run on hundreds of cases; with 5 to 30 interviews any classes are a hunch to check by re-reading those interviews together, never a segmentation or personas.</p>
      <Choice label="Use" value={lcaOn} onChange={setLcaOn} options={[['cats', 'Categories (fewer, steadier)'], ['codes', 'Codes']]} />
      <p className="tl-note">{ld.n} interviews × {ld.q} {lcaOn === 'cats' ? 'categories' : 'codes'} (present or absent).{ld.dropped.length > 0 && ` Left out because every interview or none has them: ${ld.dropped.join(', ')}.`} Up to {lcaKMax(ld.n)} classes; a {Math.min(2, lcaKMax(ld.n))}-class model has {Math.min(2, lcaKMax(ld.n)) - 1 + Math.min(2, lcaKMax(ld.n)) * ld.q} parameters for {ld.n} interviews.</p>
      <div className="tl-row">
        <button type="button" className="btn accent small" disabled={lca.busy || ld.n < 3 || !ld.q} onClick={() => runLca(ld, items, lcaOn)}>{lca.busy ? 'Running…' : 'Run latent class analysis'}</button>
        {lca.error && <span className="calc-warn" role="alert">{lca.error}</span>}
        {(ld.n < 3 || !ld.q) && <span className="tl-note">Needs at least 3 interviews and one {lcaOn === 'cats' ? 'category' : 'code'} that some but not all interviews have.</span>}
      </div>
      {lcaRes && <LcaResult r={lcaRes} p={p} />}
    </div>
  );
}
function LcaResult({ r, p }) {
  const best = r.fits.find((f) => f.k === r.best);
  return (
    <>
      <div className="clu-scroll"><table className="clu-table qc-table" aria-label="Model comparison">
        <thead><tr><th>Classes</th><th>Log-likelihood</th><th>Parameters</th><th>BIC</th><th>AIC</th><th>Entropy R²</th></tr></thead>
        <tbody>{r.fits.map((f) => <tr key={f.k} className={f.k === r.best ? 'qc-best' : ''}><td>{f.k}{f.k === r.best ? ' (lowest BIC)' : ''}</td><td>{Q.fmt(f.ll, 2)}</td><td>{f.nParams}{f.nParams >= r.n ? ' ⚠' : ''}</td><td>{Q.fmt(f.bic, 2)}</td><td>{Q.fmt(f.aic, 2)}</td><td>{f.k > 1 ? Q.fmt(f.entropyR2, 2) : '—'}</td></tr>)}</tbody>
      </table></div>
      {r.best === 1 ? (
        <p className="tl-note"><b>BIC prefers one class:</b> there is no evidence of distinct groups of interviews in these {r.on === 'cats' ? 'categories' : 'codes'}. That is the usual and honest answer with few interviews. ⚠ marks models with at least as many parameters as interviews.</p>
      ) : (
        <>
          <p className="tl-note">BIC prefers {best.k} classes. Re-read the interviews in each class together before believing it. ⚠ marks models with at least as many parameters as interviews.</p>
          <div className="clu-scroll qc-matrix"><table className="clu-table qc-heat" aria-label="Class profiles: probability of each item">
            <thead><tr><th>{r.on === 'cats' ? 'Category' : 'Code'}</th>{best.w.map((w, c) => <th key={c}>Class {c + 1} ({Q.pctS(w)})</th>)}</tr></thead>
            <tbody>{r.names.map((nm, j) => <tr key={nm}><td>{nm}</td>{best.theta.map((th, c) => <td key={c} style={heat(th[j], 1, 'var(--c7)')}>{Q.pctS(th[j])}</td>)}</tr>)}</tbody>
          </table></div>
          <ul className="plain-list qc-members">{best.w.map((_, c) => <li key={c}><b>Class {c + 1}:</b> {best.labels.map((l, i) => (l === c ? `${p.interviews[i]?.name} (${Q.pctS(best.cert[i])})` : null)).filter(Boolean).join(', ') || 'no interviews'}</li>)}</ul>
        </>
      )}
    </>
  );
}

// ── 7. Export ──
export function ExportStep({ p, d, exports, onSave, onLoad, onClear }) {
  const [which, setWhich] = useState('codebook');
  const [theirs, setTheirs] = useState('');
  const fileRef = useRef(null);
  const ex = exports.find((e) => e.id === which) || exports[0];
  const ic = useMemo(() => Q.intercoderText(p, d.segs, theirs), [p, d.segs, theirs]);
  return (
    <div className="qc-step">
      <section className="qc-panel qc-save">
        <h3 className="clu-h3">Save your project</h3>
        <p className="tl-note">Nothing is stored in your browser, so closing this tab loses your work. Download the project file (transcripts, codes, categories, memos and overrides) and load it next time. Keep it where you keep participant data, and anonymise first.</p>
        <div className="tl-row">
          <button type="button" className="btn accent small" onClick={onSave}>Download project file (.json)</button>
          <button type="button" className="btn ghost small" onClick={() => fileRef.current?.click()}>Load a project file</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Project file" onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoad(f); e.target.value = ''; }} />
          <button type="button" className="btn ghost small" onClick={onClear}>Start a new, empty project</button>
        </div>
      </section>
      <h3 className="clu-h3">Copy or download results</h3>
      <div className="seg qc-exp-pick" role="radiogroup" aria-label="What to export">
        {exports.map((e) => <button key={e.id} type="button" role="radio" aria-checked={which === e.id} className={which === e.id ? 'on' : ''} onClick={() => setWhich(e.id)}>{e.label}</button>)}
      </div>
      <p className="tl-note">{ex.note}</p>
      <textarea className="tl-code qc-preview" readOnly rows={10} value={ex.text || ex.empty || ''} aria-label={`${ex.label} preview`} />
      <div className="tl-row">
        <CopyBtn text={ex.text} />
        <button type="button" className="btn ghost small" disabled={!ex.text} onClick={() => download(ex.file, ex.text, ex.type)}>Download {ex.file}</button>
        {ex.link && <Link className="btn ghost small" to={`/calculators/${ex.link[0]}`}>Open {ex.link[1]}</Link>}
      </div>
      <section className="qc-panel">
        <h3 className="clu-h3">Check-coding with a colleague</h3>
        <ol className="tl-defs">
          <li>Give a colleague the blind sheet: segment ids and text without your codes. They code each segment with one code from your codebook.</li>
          <li>Paste their sheet back below (segment id, then their code, one per line; CSV or tab-separated straight from a spreadsheet).</li>
          <li>Copy the result into <Link to="/calculators/intercoder">Inter-coder agreement</Link>. Your column uses each segment’s first code.</li>
        </ol>
        <div className="tl-row"><button type="button" className="btn ghost small" onClick={() => download('blind-coding-sheet.csv', Q.blindSheet(d.segs), 'text/csv')}>Download blind sheet (.csv)</button></div>
        <Area label="Your colleague’s codes" value={theirs} onChange={setTheirs} rows={4} placeholder={'segment_id,text,code\nP1-2,"It was back in March…",No appointments in the app'} />
        {theirs.trim() && <p className="tl-note">Matched {ic.matched} of {ic.total} segments.</p>}
        {ic.text && <><textarea className="tl-code qc-preview" readOnly rows={5} value={ic.text} aria-label="Inter-coder input" /><div className="tl-row"><CopyBtn text={ic.text} label="Copy for inter-coder agreement" /></div></>}
      </section>
    </div>
  );
}
