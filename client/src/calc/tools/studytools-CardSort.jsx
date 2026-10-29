import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as K from './studytools-cardsort.js';
import * as U from './studytools-common.js';
import { Choice, Result, Problem, About, download, copyText, num, pct } from './ui.jsx';
import './studytools.css';

const TOOL = 'card-sort';
const DRAFT_KEY = 'uxatlas:card-sort:draft';
const MAP_KEY = (id) => `uxatlas:card-sort:names:${id}`;
const tone = (i) => `var(--c${(i % 8) + 1})`;

// ── Participant: sort the cards ──
function CsParticipant({ study, preview, onExit }) {
  const fresh = () => ({ groups: study.k === 'open' ? [] : study.g.map((name, ci) => ({ id: `c${ci}`, name, cards: [], ci })), pile: K.cardOrder(study.c.length, !!study.o?.r), unsure: [] });
  const [board, setBoard] = useState(fresh);
  const [phase, setPhase] = useState('intro');
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [pid, setPid] = useState(() => `P-${U.newId().slice(0, 5)}`);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(null);
  const t0 = useRef(0), nid = useRef(0), dragRef = useRef(null), suppress = useRef(false), focusNext = useRef(null), top = useRef(null);
  const canCreate = study.k !== 'closed';
  const allowUnsure = !!study.o?.u;
  const problems = K.boardProblems(study, board);

  useEffect(() => { top.current?.scrollTo?.(0, 0); }, [phase]);
  useEffect(() => {
    const f = focusNext.current; if (f == null) return; focusNext.current = null;
    const el = document.querySelector(typeof f === 'string' ? f : `[data-card="${f}"]`); el?.focus?.();
  }, [board]);

  const move = (card, dest, keyboard = false) => {
    let newId = null;
    if (dest === 'new') newId = `n${++nid.current}`;
    setBoard((b) => {
      const strip = (arr) => arr.filter((c) => c !== card);
      let groups = b.groups.map((g) => ({ ...g, cards: strip(g.cards) }));
      let pile = strip(b.pile), unsure = strip(b.unsure);
      if (dest === 'pile') pile = [...pile, card];
      else if (dest === 'unsure') unsure = [...unsure, card];
      else if (dest === 'new') groups = [...groups, { id: newId, name: '', cards: [card], ci: -1 }];
      else groups = groups.map((g) => (g.id === dest ? { ...g, cards: [...g.cards, card] } : g));
      return { groups, pile, unsure };
    });
    setSel(null);
    if (dest === 'new') focusNext.current = `[data-gname="${newId}"]`;
    else if (keyboard) { const next = board.pile.find((c) => c !== card); focusNext.current = next ?? `[data-drop="${dest}"]`; }
  };
  const newGroup = () => { const id = `n${++nid.current}`; setBoard((b) => ({ ...b, groups: [...b.groups, { id, name: '', cards: [], ci: -1 }] })); focusNext.current = `[data-gname="${id}"]`; };
  const rename = (id, name) => setBoard((b) => ({ ...b, groups: b.groups.map((g) => (g.id === id ? { ...g, name } : g)) }));
  const merge = (from, into) => setBoard((b) => { const src = b.groups.find((g) => g.id === from); return { ...b, groups: b.groups.filter((g) => g.id !== from).map((g) => (g.id === into ? { ...g, cards: [...g.cards, ...src.cards] } : g)) }; });
  const remove = (id) => setBoard((b) => { const src = b.groups.find((g) => g.id === id); return { ...b, pile: [...b.pile, ...src.cards], groups: b.groups.filter((g) => g.id !== id) }; });

  // Pointer drag and drop: mouse anywhere on a card, touch or pen on its handle (so the page still scrolls on phones).
  const dropAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-drop]')?.getAttribute('data-drop') || null;
  const onDown = (e, card) => {
    if (e.pointerType === 'mouse' ? e.button !== 0 : !e.target.closest('.st-handle')) return;
    dragRef.current = { x: e.clientX, y: e.clientY, card, moved: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  };
  const onMove = (e) => {
    const d = dragRef.current; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true; e.preventDefault();
    setDrag({ card: d.card, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY) });
  };
  const onUp = (e) => {
    const d = dragRef.current; dragRef.current = null; if (!d) return;
    if (d.moved) { const over = dropAt(e.clientX, e.clientY); setDrag(null); suppress.current = true; if (over) move(d.card, over); }
  };
  const onCancel = () => { dragRef.current = null; setDrag(null); };
  const onCardClick = (card) => { if (suppress.current) { suppress.current = false; return; } setSel(sel === card ? null : card); };

  const label = (c) => study.c[c][0];
  const card = (c) => (
    <button key={c} type="button" data-card={c} className={`st-card${sel === c ? ' sel' : ''}${drag?.card === c ? ' dragging' : ''}`} aria-pressed={sel === c}
      onPointerDown={(e) => onDown(e, c)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onClick={() => onCardClick(c)}
      onKeyDown={(e) => { if (e.key === 'Escape') setSel(null); }}>
      <span className="st-handle" aria-hidden="true">⠿</span>
      <span className="st-txt">{study.c[c][0]}{study.c[c][1] && <small>{study.c[c][1]}</small>}</span>
    </button>
  );
  const put = (dest, name) => (sel !== null ? <button type="button" className="st-put" onClick={() => move(sel, dest, true)}>Put “{label(sel)}” {name}</button> : null);

  const start = () => { t0.current = performance.now(); setPhase('sort'); };
  const finish = () => {
    if (problems.length) return;
    const r = K.boardToResult(study, board, pid, performance.now() - t0.current);
    const c = K.encodeResult(r);
    setCode(c); setSaved(preview ? null : U.saveSession(TOOL, study.id, c)); setPhase('done');
  };
  const again = () => { setPid(`P-${U.newId().slice(0, 5)}`); setBoard(fresh()); setSel(null); setCode(''); setCopied(false); setPhase('intro'); };
  const mail = `mailto:?subject=${encodeURIComponent(`Card sort results: ${study.n}`)}&body=${encodeURIComponent(`My result code for "${study.n}":\n\n${code}\n`)}`;
  const intro = study.k === 'open' ? 'Sort the cards into groups that make sense to you, and give each group a name.'
    : study.k === 'closed' ? 'Sort the cards into the groups given.' : 'Sort the cards into the groups given, or make your own groups if none fits.';

  return createPortal(
    <div className="tt-run" ref={top} role="dialog" aria-modal="true" aria-label={`Card sort: ${study.n}`} onKeyDown={(e) => { if (e.key === 'Escape') setSel(null); }}>
      <div className="tt-run-in st-run-wide">
        {preview && <p className="calc-warn">Preview: this run is not saved in the browser. <button type="button" className="clu-link" onClick={onExit}>Close the preview</button></p>}
        {phase === 'intro' && (
          <>
            <p className="eyebrow">Card sort</p>
            <h1>{study.n}</h1>
            <p>{intro} There are {study.c.length} cards. There are no right or wrong answers: we want to learn how you think about these things.</p>
            <p><b>How to move a card:</b> drag it with a mouse, or drag its ⠿ handle on a touch screen. Or tap or press Enter on a card to pick it up, then choose where to put it.{allowUnsure ? ' If you don\'t know where a card goes, put it in "Not sure".' : ''}</p>
            <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
            <div className="tt-actions"><button type="button" className="btn" onClick={start}>Start</button></div>
          </>
        )}
        {phase === 'sort' && (
          <>
            <div className="prog">{study.c.length - board.pile.length} of {study.c.length} cards sorted</div>
            {sel !== null && (
              <div className="st-movebar" role="status">
                <span>Moving <b>“{label(sel)}”</b>: choose a group below, or</span>
                {canCreate && <button type="button" className="btn small" onClick={() => move(sel, 'new', true)}>New group</button>}
                {allowUnsure && <button type="button" className="btn ghost small" onClick={() => move(sel, 'unsure', true)}>Not sure</button>}
                {!board.pile.includes(sel) && <button type="button" className="btn ghost small" onClick={() => move(sel, 'pile', true)}>Back to unsorted</button>}
                <button type="button" className="clu-link" onClick={() => setSel(null)}>Cancel</button>
              </div>
            )}
            <div className="st-board">
              <section className={`st-pile${drag?.over === 'pile' ? ' over' : ''}`} data-drop="pile" aria-label="Cards to sort">
                <h2>Cards to sort ({board.pile.length})</h2>
                <div className="st-cards">{board.pile.map((c) => card(c))}</div>
                {!board.pile.length && <p className="st-empty">All cards are sorted.</p>}
                {!board.pile.includes(sel) && put('pile', 'back here')}
              </section>
              <div className="st-groups">
                {board.groups.map((g, gi) => (
                  <section key={g.id} className={`st-group${drag?.over === g.id ? ' over' : ''}`} data-drop={g.id} aria-label={`Group ${g.name || gi + 1}`}>
                    <div className="st-group-head">
                      {g.ci >= 0 ? <span className="fixed">{g.name}</span> : <input type="text" data-gname={g.id} value={g.name} placeholder="Name this group" aria-label={`Name of group ${gi + 1}`} onChange={(e) => rename(g.id, e.target.value)} />}
                      {g.ci < 0 && board.groups.length > 1 && (
                        <select aria-label={`Merge group ${g.name || gi + 1} into another`} value="" onChange={(e) => e.target.value && merge(g.id, e.target.value)}>
                          <option value="">Merge into…</option>
                          {board.groups.filter((x) => x.id !== g.id).map((x, xi) => <option key={x.id} value={x.id}>{x.name || `Unnamed group ${xi + 1}`}</option>)}
                        </select>
                      )}
                      {g.ci < 0 && <button type="button" className="clu-link" onClick={() => remove(g.id)} aria-label={`Remove group ${g.name || gi + 1}; its cards go back to the pile`}>Remove</button>}
                    </div>
                    <div className="st-cards">{g.cards.map((c) => card(c))}</div>
                    {!g.cards.length && sel === null && <p className="st-empty">Drop cards here.</p>}
                    {!g.cards.includes(sel) && put(g.id, `in ${g.name ? `“${g.name}”` : 'this group'}`)}
                  </section>
                ))}
                {canCreate && (
                  <section className={`st-group${drag?.over === 'new' ? ' over' : ''}`} data-drop="new" aria-label="New group">
                    <h2>New group</h2>
                    <p className="st-empty">Drop a card here to start a new group.</p>
                    <button type="button" className="btn ghost small" onClick={() => (sel !== null ? move(sel, 'new', true) : newGroup())}>{sel !== null ? `Start a new group with “${label(sel)}”` : 'Add an empty group'}</button>
                  </section>
                )}
                {allowUnsure && (
                  <section className={`st-group unsure${drag?.over === 'unsure' ? ' over' : ''}`} data-drop="unsure" aria-label="Not sure">
                    <h2>Not sure / don't know ({board.unsure.length})</h2>
                    <div className="st-cards">{board.unsure.map((c) => card(c))}</div>
                    {!board.unsure.includes(sel) && put('unsure', 'in “Not sure”')}
                  </section>
                )}
              </div>
            </div>
            {problems.length > 0 && <ul className="tl-defs" aria-live="polite">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
            <div className="tt-actions"><button type="button" className="btn" disabled={problems.length > 0} onClick={finish}>I'm done</button></div>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="eyebrow">Finished</p>
            <h1>Thank you</h1>
            <p>Please send this code to the researcher. It holds your groups and nothing else.</p>
            <textarea className="tl-code" readOnly rows={5} value={code} aria-label="Your result code" onFocus={(e) => e.target.select()} />
            <div className="tt-actions">
              <button type="button" className="btn" onClick={async () => setCopied(await copyText(code))}>{copied ? 'Copied' : 'Copy code'}</button>
              <a className="btn ghost" href={mail}>Email to researcher</a>
            </div>
            <p className="tl-note">Nothing has been uploaded: your answers stay on this device until you send the code. {saved ? 'A copy is kept in this browser so a researcher running sessions here can collect it.' : ''}</p>
            {!preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={again}>Start a new session (moderated testing)</button></div>}
            {preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={onExit}>Close the preview</button></div>}
          </>
        )}
      </div>
      {drag && <div className="st-card st-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><span className="st-txt">{label(drag.card)}</span></div>}
    </div>,
    document.body,
  );
}

// ── Charts ──
function Dendrogram({ an, colourOf }) {
  const { Z, order, C, cut } = an;
  const rowH = 22, labelW = 230, plotW = 380, padT = 14, padB = 34;
  const W = labelW + plotW + 30, H = padT + C * rowH + padB;
  const X = (h) => labelW + 10 + Math.max(0, Math.min(1, h)) * plotW;
  const ys = new Map(order.map((leaf, i) => [leaf, padT + i * rowH + rowH / 2]));
  const xs = new Map(order.map((leaf) => [leaf, X(0)]));
  const lines = [];
  Z.forEach(([a, b, h], t) => {
    const id = C + t, x = X(h), ya = ys.get(a), yb = ys.get(b);
    lines.push(<path key={t} className="link" d={`M${xs.get(a)},${ya} H${x} V${yb} H${xs.get(b)}`} />);
    ys.set(id, (ya + yb) / 2); xs.set(id, x);
  });
  return (
    <div className="tl-scroll">
      <svg className="st-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dendrogram of the cards, average linkage on 1 minus similarity">
        {[0, 0.25, 0.5, 0.75, 1].map((h) => <g key={h}><line className="grid" x1={X(h)} x2={X(h)} y1={padT - 4} y2={H - padB + 4} /><text className="ax" x={X(h)} y={H - padB + 18} textAnchor="middle">{h.toFixed(2)}</text></g>)}
        <text className="ax" x={X(0.5)} y={H - 4} textAnchor="middle">Distance (1 − similarity) at which groups join</text>
        {lines}
        {order.map((leaf, i) => (
          <g key={leaf}>
            <circle cx={labelW + 2} cy={padT + i * rowH + rowH / 2} r={4.5} style={{ fill: colourOf(leaf) }} />
            <text className="lb" x={labelW - 6} y={padT + i * rowH + rowH / 2 + 4} textAnchor="end">{an.study.c[leaf][0].length > 32 ? `${an.study.c[leaf][0].slice(0, 31)}…` : an.study.c[leaf][0]}</text>
          </g>
        ))}
        <line className="cut" x1={X(cut)} x2={X(cut)} y1={padT - 8} y2={H - padB + 6} />
      </svg>
    </div>
  );
}

function StabilityChart({ stab, P }) {
  const pts = stab.points; if (!pts.length) return null;
  const W = 560, H = 240, l = 46, r = 16, t = 14, b = 38;
  const yMin = Math.min(0.5, Math.floor(Math.min(...pts.map((p) => p.lo)) * 10) / 10);
  const X = (m) => l + ((m - 2) / Math.max(1, P - 2)) * (W - l - r), Y = (v) => t + (1 - (v - yMin) / (1 - yMin)) * (H - t - b);
  const band = `${pts.map((p) => `${X(p.m)},${Y(p.hi)}`).join(' ')} ${[...pts].reverse().map((p) => `${X(p.m)},${Y(p.lo)}`).join(' ')}`;
  const ticks = []; for (let v = yMin; v <= 1.0001; v += 0.1) ticks.push(+v.toFixed(1));
  return (
    <svg className="st-plot exp-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Correlation with the full-sample similarity matrix by number of participants" style={{ maxWidth: W }}>
      {ticks.map((v) => <g key={v}><line className="grid" x1={l} x2={W - r} y1={Y(v)} y2={Y(v)} /><text className="ax" x={l - 6} y={Y(v) + 4} textAnchor="end">{v.toFixed(1)}</text></g>)}
      <polygon className="band" points={band} />
      <line className="ref" x1={l} x2={W - r} y1={Y(0.9)} y2={Y(0.9)} />
      <polyline className="line" points={pts.map((p) => `${X(p.m)},${Y(p.r)}`).join(' ')} />
      {stab.enough && <circle cx={X(stab.enough)} cy={Y(pts.find((p) => p.m === stab.enough).r)} r={5} style={{ fill: 'var(--ok)' }} />}
      {[2, ...pts.filter((_, i) => i % Math.ceil(pts.length / 8) === 0).map((p) => p.m), P].filter((v, i, a) => a.indexOf(v) === i).map((m) => <text key={m} className="ax" x={X(m)} y={H - b + 16} textAnchor="middle">{m}</text>)}
      <text className="ax" x={(l + W - r) / 2} y={H - 4} textAnchor="middle">Participants in the subsample</text>
    </svg>
  );
}

function CardMap({ an, colourOf }) {
  const m = useMemo(() => K.cardMap(an.S, an.C), [an]);
  if (!m) return null;
  const W = 640, H = 400, pad = 40;
  const xs = m.coords.map((c) => c[0]), ys = m.coords.map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (v) => pad + ((v - y0) / (y1 - y0 || 1)) * (H - 2 * pad);
  return (
    <div className="tl-scroll">
      <svg className="st-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the cards: cards close together were often grouped together">
        {m.coords.map((c, i) => <g key={i}><circle cx={X(c[0])} cy={Y(c[1])} r={6} style={{ fill: colourOf(i) }} /><text className="lb" x={X(c[0]) + 9} y={Y(c[1]) + 4} style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}>{an.study.c[i][0].length > 24 ? `${an.study.c[i][0].slice(0, 23)}…` : an.study.c[i][0]}</text></g>)}
      </svg>
    </div>
  );
}

// Run the stability curve in a worker (synchronously if workers are unavailable).
function useStability(people, C) {
  const [stab, setStab] = useState(null);
  useEffect(() => {
    setStab(null);
    const P = people.length;
    if (P < 3 || C < 3) return undefined;
    let w = null, done = false;
    const groupOfs = people.map((p) => Array.from(p.groupOf));
    const B = P * C * C > 2e6 ? 20 : 40;
    try {
      w = new Worker(new URL('./studytools-cardsort.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => { done = true; setStab(data.error ? { points: [], enough: null, error: data.error } : data.result); w.terminate(); };
      w.onerror = () => { if (!done) setStab(K.stabilityCurve(people, C, { B })); };
      w.postMessage({ id: 1, groupOfs, C, B });
    } catch { const id = setTimeout(() => setStab(K.stabilityCurve(people, C, { B })), 0); return () => clearTimeout(id); }
    return () => { try { w?.terminate(); } catch { /* gone */ } };
  }, [people, C]);
  return stab;
}

// ── Analysis ──
function CsAnalysis({ study, codes, setCodes, mapping, setMapping }) {
  const [cut, setCut] = useState(K.DEFAULT_CUT);
  const [aamT, setAamT] = useState(0.5);
  const [checked, setChecked] = useState([]);
  const [stdName, setStdName] = useState('');
  const parsed = useMemo(() => U.parseCodes(codes, K.decodeResult), [codes]);
  const other = parsed.results.filter((r) => r.s && r.s !== study.id).length;
  const an = useMemo(() => K.analyse(study, parsed.results, { mapping, cut, aamThreshold: aamT }), [study, parsed, mapping, cut, aamT]);
  const basePeople = useMemo(() => K.placements(study, parsed.results), [study, parsed]);
  const stab = useStability(basePeople, study.c.length);
  const sum = useMemo(() => K.cardSortSummary(an, stab), [an, stab]);
  const stored = U.loadSessions(TOOL, study.id);
  const clusterIx = useMemo(() => { const m = new Map(); an.clusters.forEach((c, i) => c.cards.forEach((k) => m.set(k, c.cards.length > 1 ? i : -1))); return m; }, [an]);
  const colourOf = (k) => (clusterIx.get(k) >= 0 ? tone(clusterIx.get(k)) : 'var(--ink-3)');
  const L = (k) => study.c[k][0];
  const created = useMemo(() => {
    const m = new Map();
    an.people.forEach((p) => p.groups.forEach((g) => { if (g.ci >= 0) return; const e = m.get(g.norm) || { norm: g.norm, spell: g.raw.trim(), n: 0, cat: g.cat }; e.n++; m.set(g.norm, e); }));
    return [...m.values()].sort((a, b) => a.cat.localeCompare(b.cat) || b.n - a.n);
  }, [an]);
  const usedCats = an.cats.filter((c) => c.n > 0 || c.predefined);
  const amb = an.cards.filter((c) => c.ambiguous);
  const orph = K.orphans(an);
  const isOpen = study.k !== 'closed';
  const mergeChecked = () => { const name = stdName.trim(); if (!name || !checked.length) return; const m = { ...mapping }; checked.forEach((n) => { m[n] = name; }); setMapping(m); setChecked([]); setStdName(''); };
  return (
    <div className="clu-root">
      <div className="calc-inputs">
        <label className="calc-field wide">
          <span>Result codes, one per line</span>
          <textarea rows={6} value={codes} onChange={(e) => setCodes(e.target.value)} spellCheck={false} placeholder="Paste the codes participants sent you" />
          <small>Codes from other studies are ignored. Nothing is uploaded; the analysis runs in this browser.</small>
        </label>
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" disabled={!stored.length} onClick={() => setCodes([...new Set([...codes.split(/\s+/).filter(Boolean), ...stored])].join('\n'))}>Load {stored.length} session{stored.length === 1 ? '' : 's'} saved in this browser</button>
        {stored.length > 0 && <button type="button" className="clu-link" onClick={() => { if (window.confirm('Remove the sessions saved in this browser for this study?')) { U.clearSessions(TOOL, study.id); setCodes(`${codes} `); } }}>Clear saved sessions</button>}
        <button type="button" className="btn ghost small" disabled={!an.P} onClick={() => download(`card-sort-similarity-${study.id}.csv`, K.similarityCsv(an), 'text/csv')}>Similarity matrix (CSV)</button>
        <button type="button" className="btn ghost small" disabled={!an.P} onClick={() => download(`card-sort-placements-${study.id}.csv`, K.placementsCsv(an), 'text/csv')}>Placements (CSV)</button>
        <button type="button" className="btn ghost small" disabled={!an.P} onClick={() => download(`card-sort-report-${study.id}.md`, K.markdownReport(an, sum, stab, mapping), 'text/markdown')}>Report (Markdown)</button>
      </div>
      {parsed.bad.length > 0 && <Problem>{parsed.bad.length} code{parsed.bad.length > 1 ? 's' : ''} could not be read; check they were copied in full.</Problem>}
      {other > 0 && <Problem>{other} code{other > 1 ? 's are' : ' is'} from a different study and {other > 1 ? 'were' : 'was'} left out.</Problem>}
      {an.C < 3 ? <Problem>Add at least three cards to the study.</Problem> : !an.P ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : (
        <>
          <Result big={`${an.clusters.filter((c) => c.cards.length > 1).length} groups`} label={`${an.P} participants, ${an.C} cards, ${K.SORT_TYPES[study.k].toLowerCase()} sort, cut at ${cut.toFixed(2)}`} />

          <h3 className="clu-h3">Dendrogram (average linkage)</h3>
          <label className="st-range">
            <span>Cut height: <b>{cut.toFixed(2)}</b>. Cards that join to the left of the red line form a group (on average, {Math.round((1 - cut) * 100)}% or more of participants put them together).</span>
            <input type="range" min={0.05} max={0.95} step={0.05} value={cut} onChange={(e) => setCut(Number(e.target.value))} aria-label="Cut height" />
          </label>
          <Dendrogram an={an} colourOf={colourOf} />

          <h3 className="clu-h3">Suggested groups at this cut</h3>
          <div className="clu-scroll"><table className="clu-table" aria-label="Suggested groups">
            <thead><tr><th>Most used name</th><th>Cards</th><th>Average agreement</th><th>All together (AAM)</th></tr></thead>
            <tbody>{an.clusters.map((c, i) => (
              <tr key={i}>
                <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 6, background: c.cards.length > 1 ? tone(i) : 'var(--ink-3)' }} />{c.name || '—'}</td>
                <td style={{ whiteSpace: 'normal' }}>{c.cards.map(L).join(', ')}</td>
                <td>{c.cards.length > 1 ? <>{pct(c.cohesion)} <span className={`qtag ${c.cohesion >= 0.6 ? 'promote' : c.cohesion >= 0.4 ? 'opp' : 'fix'}`}>{K.strength(c.cohesion)}</span></> : <span className="qtag">single card</span>}</td>
                <td>{pct(c.aam)}</td>
              </tr>
            ))}</tbody>
          </table></div>

          <h3 className="clu-h3">Suggested categories by actual agreement (best merge)</h3>
          <div className="calc-inputs"><Choice label="Merge while at least this share put all the cards together" value={aamT} onChange={setAamT} options={[[0.3, '30%'], [0.4, '40%'], [0.5, '50%'], [0.6, '60%'], [0.7, '70%']]} /></div>
          <ul className="exp-list">
            {an.aam.groups.filter((g) => g.cards.length > 1).map((g, i) => <li key={i}><span className="qtag promote">{pct(g.score)}</span> {g.cards.map(L).join(', ')}</li>)}
            {an.aam.groups.filter((g) => g.cards.length === 1).length > 0 && <li><span className="qtag">alone</span> {an.aam.groups.filter((g) => g.cards.length === 1).map((g) => L(g.cards[0])).join(', ')}</li>}
          </ul>

          {isOpen && created.length > 0 && (
            <>
              <h3 className="clu-h3">Standardise category names</h3>
              <p className="tl-note">Tick the names participants made up that mean the same thing (such as "Billing" and "Payments"), type the standard name, and merge. Labels that differ only in case, spacing, punctuation or "and" / "&" are already treated as one. Your merges are kept in this browser for this study.</p>
              <div className="st-std" role="group" aria-label="Category names to standardise">
                {created.map((e) => (
                  <label key={e.norm}>
                    <input type="checkbox" checked={checked.includes(e.norm)} onChange={(ev) => setChecked(ev.target.checked ? [...checked, e.norm] : checked.filter((x) => x !== e.norm))} />
                    <span>{e.spell}</span><span className="cnt">×{e.n}</span>
                    {mapping[e.norm] ? <span className="qtag promote">→ {mapping[e.norm]}</span> : null}
                    {mapping[e.norm] && <button type="button" className="clu-link" onClick={() => { const m = { ...mapping }; delete m[e.norm]; setMapping(m); }}>Undo</button>}
                  </label>
                ))}
              </div>
              <div className="tl-row">
                <input type="text" className="tl-code" style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 360, padding: '7px 10px' }} placeholder="Standard name, such as Billing & payments" value={stdName} list="st-cats" onChange={(e) => setStdName(e.target.value)} aria-label="Standard category name" />
                <datalist id="st-cats">{an.cats.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                <button type="button" className="btn small" disabled={!checked.length || !stdName.trim()} onClick={mergeChecked}>Merge {checked.length || ''} into this name</button>
                {Object.keys(mapping).length > 0 && <button type="button" className="clu-link" onClick={() => setMapping({})}>Clear all merges</button>}
              </div>
            </>
          )}

          <h3 className="clu-h3">{isOpen ? 'Standardised categories × cards' : 'Card × category placements'}</h3>
          <div className="clu-scroll"><table className="st-matrix" aria-label="Cards by category">
            <thead>
              <tr><th className="rl">Card</th>{usedCats.map((c) => <th key={c.name} title={c.raw.map(([r, n]) => `${r} (${n})`).join(', ')}>{c.name}{c.predefined && study.k === 'hybrid' ? ' *' : ''}</th>)}<th>Most common</th><th>Unsure</th></tr>
              <tr><th className="rl">Participants who used it</th>{usedCats.map((c) => <th key={c.name}>{c.n}</th>)}<th /><th /></tr>
              <tr><th className="rl">Agreement</th>{usedCats.map((c) => <th key={c.name}>{num(c.agreement)}</th>)}<th /><th /></tr>
            </thead>
            <tbody>{an.order.map((k) => { const cp = an.cards[k]; return (
              <tr key={k}>
                <th className="rl" title={L(k)}>{L(k)}</th>
                {usedCats.map((c) => { const v = c.counts[k], s = cp.sorted ? v / cp.sorted : 0; return <td key={c.name} style={v ? { background: `color-mix(in srgb, var(--c1) ${Math.round(s * 70)}%, transparent)` } : undefined}>{v || ''}</td>; })}
                <td style={{ whiteSpace: 'nowrap' }}>{cp.top ? `${pct(cp.share)} ` : '—'}{cp.ambiguous && <span className="qtag opp">split</span>}</td>
                <td>{cp.unsure || ''}</td>
              </tr>
            ); })}</tbody>
          </table></div>
          <p className="tl-note">Cells count the participants who put the card in that category; shading is the share of those who sorted the card. "Most common" is the share of those who sorted the card who chose its most common category. Agreement is the mean, over the cards anyone put in a category, of the share of the category's users who put that card there (1.00 = everyone who used it put the same cards in it).{study.k === 'hybrid' ? ' * = category you gave.' : ''}</p>
          {(amb.length > 0 || orph.length > 0) && (
            <ul className="exp-list">
              {amb.map((c) => <li key={`a${c.k}`}><span className="qtag opp">Split</span> <b>{c.label}</b>: {c.by.slice(0, 3).map((b) => `${b.name} ${pct(b.n / c.sorted)}`).join(', ')}</li>)}
              {orph.map((c) => <li key={`o${c.k}`}><span className="qtag fix">No home</span> <b>{c.label}</b>: closest partner "{L(c.nearest.card)}" at {pct(c.nearest.s)}{c.unsure ? `; ${c.unsure} unsure` : ''}</li>)}
            </ul>
          )}

          <h3 className="clu-h3">Similarity matrix</h3>
          <div className="clu-scroll"><table className="st-matrix" aria-label="Similarity matrix: share of participants who put each pair together">
            <thead><tr><th className="rl">Card</th>{an.order.map((k, i) => <th key={k} title={L(k)}>{i + 1}</th>)}</tr></thead>
            <tbody>{an.order.map((a, i) => (
              <tr key={a}>
                <th className="rl" title={L(a)}>{i + 1}. {L(a)}</th>
                {an.order.map((b) => { const v = an.S[a * an.C + b]; return a === b ? <td key={b} className="diag">—</td> : <td key={b} title={`${L(a)} + ${L(b)}: ${Math.round(an.together[a * an.C + b])} of ${Math.round(an.both[a * an.C + b])}`} style={{ background: `color-mix(in srgb, var(--c1) ${Math.round(v * 75)}%, transparent)` }}>{Math.round(v * 100)}</td>; })}
              </tr>
            ))}</tbody>
          </table></div>
          <p className="tl-note">Percentage of participants who put the two cards in the same group, of those who sorted both. Cards are in dendrogram order, so groups show as darker blocks.</p>

          <h3 className="clu-h3">How many participants are enough?</h3>
          {!stab ? <p className="tl-note">Working out the stability curve…</p> : stab.points.length ? (
            <>
              <StabilityChart stab={stab} P={an.P} />
              <p className="tl-note">Each point: the mean correlation between the similarity matrix from a random subset of participants and the matrix from all {an.P} (40 random subsets per size; the band covers the middle 80%). {stab.enough ? `It passes 0.90 at ${stab.enough} participants.` : 'It does not pass 0.90 before the full sample.'} Tullis &amp; Wood (2004, "How many users are enough for a card-sorting study?", UPA conference) did the same with 168 participants and found about 15 gave r ≈ 0.90 and 20–30 gave 0.93–0.95. With a small sample the curve is optimistic, because every subset shares participants with the full sample it is compared to.</p>
            </>
          ) : <p className="tl-note">Needs at least 3 participants.</p>}

          <h3 className="clu-h3">Map of the cards (classical MDS)</h3>
          <CardMap an={an} colourOf={colourOf} />
          <p className="tl-note">Cards close together were often grouped together. Distances are squeezed into two dimensions, so trust the dendrogram and the matrix when they disagree with the map. Colours are the groups at the cut.</p>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </div>
  );
}

// ── Builder ──
function CsBuilder({ draft, setDraft, study, link, onPreview }) {
  const [copied, setCopied] = useState(false);
  const { cards, dup } = useMemo(() => K.parseCards(draft.cards), [draft.cards]);
  const cats = K.parseCategories(draft.categories);
  return (
    <div className="clu-root">
      <label className="calc-field wide">
        <span>Study name</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} />
      </label>
      <div className="tt-build">
        <label className="calc-field wide">
          <span>Cards: one per line; add a description after " | " if needed</span>
          <textarea rows={16} value={draft.cards} onChange={(e) => setDraft({ ...draft, cards: e.target.value })} spellCheck={false} />
          <small>{cards.length} cards. 30 to 60 cards is typical; more than 80 tires people out. Avoid cards that share an obvious word, which people group by the word instead of the meaning.</small>
        </label>
        <div className="clu-root" style={{ gap: 14 }}>
          <Choice label="Sort type" value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} options={[['open', 'Open'], ['closed', 'Closed'], ['hybrid', 'Hybrid']]} />
          <p className="tl-note">{draft.type === 'open' ? 'Open: participants make and name their own groups. Best for discovering how people think about the content.' : draft.type === 'closed' ? 'Closed: participants put cards into the categories you give. Best for checking an existing structure.' : 'Hybrid: your categories are there, and participants can add their own when nothing fits.'}</p>
          {draft.type !== 'open' && (
            <label className="calc-field wide">
              <span>Categories, one per line</span>
              <textarea rows={6} value={draft.categories} onChange={(e) => setDraft({ ...draft, categories: e.target.value })} spellCheck={false} />
              <small>{cats.length} categories.</small>
            </label>
          )}
          <label className="tl-check"><input type="checkbox" checked={draft.randomise} onChange={(e) => setDraft({ ...draft, randomise: e.target.checked })} /> Randomise card order for each participant</label>
          <label className="tl-check"><input type="checkbox" checked={draft.unsure} onChange={(e) => setDraft({ ...draft, unsure: e.target.checked })} /> Allow a "Not sure / don't know" pile</label>
          <label className="tl-check"><input type="checkbox" checked={draft.requireAll} onChange={(e) => setDraft({ ...draft, requireAll: e.target.checked })} /> Require every card to be sorted</label>
        </div>
      </div>
      {dup.length > 0 && <Problem>Duplicate cards were left out: {dup.join(', ')}.</Problem>}
      {cards.length < 3 && <Problem>Add at least three cards.</Problem>}
      {draft.type !== 'open' && cats.length < 2 && <Problem>A {draft.type} sort needs at least two categories.</Problem>}
      <h3 className="clu-h3">Share with participants</h3>
      <textarea className="tl-code" readOnly rows={3} value={link} aria-label="Participant link" onFocus={(e) => e.target.select()} />
      <div className="clu-actions">
        <button type="button" className="btn small" onClick={async () => setCopied(await copyText(link))}>{copied ? 'Copied' : 'Copy participant link'}</button>
        <button type="button" className="btn ghost small" onClick={onPreview}>Preview as participant</button>
        <span className="tl-note">Study id <code>{study.id}</code> · link {link.length} characters</span>
      </div>
      <p className="tl-note">The whole study travels inside the link, compressed; nothing is stored on a server. Participants sort the cards and get a result code to copy or email to you. For moderated sessions on this device, results are also kept in this browser under the study id, so you can load them in Analyse.</p>
    </div>
  );
}

const exampleDraft = () => { const s = K.exampleStudy(); return { id: s.id, name: s.n, cards: K.EXAMPLE_CARDS, type: 'open', categories: '', randomise: true, unsure: true, requireAll: false }; };
const draftFromStudy = (s) => ({ id: s.id, name: s.n, cards: K.cardsToText(s.c), type: s.k, categories: s.g.join('\n'), randomise: !!s.o?.r, unsure: !!s.o?.u, requireAll: !!s.o?.a });

// ── Card sort ──
function CardSort() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => U.readStore(DRAFT_KEY) || exampleDraft());
  const setDraft = (d) => { setDraftRaw(d); U.writeStore(DRAFT_KEY, d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => K.makeStudy({ id: draft.id, name: draft.name, cardsText: draft.cards, type: draft.type, categoriesText: draft.categories, randomise: draft.randomise, unsure: draft.unsure, requireAll: draft.requireAll }), [draft]);
  const code = useMemo(() => K.encodeStudy(study), [study]);
  const href = useHref(`/calculators/card-sort?study=${code}`);
  const link = typeof window !== 'undefined' ? new URL(href, window.location.href).href : href;
  const isExample = draft.id === 'csexample';
  const [codes, setCodes] = useState(() => (isExample ? K.exampleResults(K.exampleStudy()).map(K.encodeResult).join('\n') : ''));
  const [mapping, setMappingRaw] = useState(() => U.readStore(MAP_KEY(draft.id)) || (isExample ? K.EXAMPLE_MAPPING : {}));
  const setMapping = (m) => { setMappingRaw(m); U.writeStore(MAP_KEY(study.id), m); };
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = K.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <CsParticipant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;

  const loadStudy = () => {
    try { const s = K.decodeStudy(pasted); setDraft(draftFromStudy(s)); setMappingRaw(U.readStore(MAP_KEY(s.id)) || {}); setLoadErr(''); setPasted(''); setCodes(''); } catch { setLoadErr('That is not a card-sort study link.'); }
  };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; const id = K.newId(); setDraft({ id, name: 'Card sort', cards: 'Card one\nCard two\nCard three', type: 'open', categories: '', randomise: true, unsure: true, requireAll: true }); setMappingRaw({}); setCodes(''); };
  const example = () => { setDraft(exampleDraft()); setMappingRaw(K.EXAMPLE_MAPPING); U.writeStore(MAP_KEY('csexample'), K.EXAMPLE_MAPPING); setCodes(K.exampleResults(K.exampleStudy()).map(K.encodeResult).join('\n')); };
  return (
    <>
      {runErr && <Problem>The study link could not be read ({runErr}). Ask the researcher for a fresh link.</Problem>}
      <div className="calc-inputs">
        <Choice label="Step" value={tab} onChange={setTab} options={[['build', '1. Build the study'], ['analyse', '2. Analyse results']]} />
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={example}>Load the example study and data</button>
        <button type="button" className="btn ghost small" onClick={fresh}>New empty study</button>
        <span className="tl-row" style={{ flex: '1 1 260px' }}>
          <input type="text" className="tl-code" style={{ flex: 1, minWidth: 0, padding: '7px 10px' }} placeholder="Or paste a study link to open it" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Study link" />
          <button type="button" className="btn ghost small" disabled={!pasted.trim()} onClick={loadStudy}>Open</button>
        </span>
      </div>
      {loadErr && <Problem>{loadErr}</Problem>}
      {tab === 'build'
        ? <CsBuilder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/card-sort?study=${code}&preview=1`); }} />
        : <CsAnalysis study={study} codes={codes} setCodes={setCodes} mapping={mapping} setMapping={setMapping} />}
      <About method="card-sorting" links={[['rapid-user-mental-modeling-rumm', 'Rapid User Mental Modeling (RUMM)'], ['labelling-system-analysis', 'Labelling system analysis'], ['additive-similarity-tree-analysis-addtree', 'Additive similarity trees (ADDTREE)'], ['tree-testing', 'Tree testing'], ['information-architecture', 'Information architecture'], ['mental-model-elicitation-expected-ia', 'Expected IA'], ['content-modeling-for-information-architecture', 'Content modelling for IA'], ['cluster-analysis', 'Cluster analysis'], ['cophenetic-and-matrix-correlation-checks-for-hierarchical-clustering', 'Checks for hierarchical clustering'], ['multidimensional-scaling-and-perceptual-mapping', 'Multidimensional scaling']]}>
        <p>In a card sort, participants group cards (pages, features, content) in the way that makes sense to them. <b>Open</b> sorts let them make and name groups; <b>closed</b> sorts give fixed categories; <b>hybrid</b> sorts give categories and let them add more. The study and its results travel as compressed links and codes (LZW-compressed JSON in base64url), so nothing is stored on a server.</p>
        <p><b>Similarity.</b> For cards i and j, S<sub>ij</sub> = (participants who put i and j in the same group) ÷ (participants who put both in some group). Cards left unsorted or marked "not sure" do not count for that participant. <b>Clustering</b> joins cards by average linkage (UPGMA) on the distance 1 − S<sub>ij</sub>: at each step the two groups with the smallest average distance between their cards merge, and the height of the join is that average distance. Cutting the tree at height h keeps groups whose cards are, on average, put together by at least 1 − h of participants. The implementation matches scipy's <code>linkage(method='average')</code> and <code>fcluster(criterion='distance')</code>.</p>
        <p><b>Actual agreement (AAM).</b> For a set of cards, the share of participants (among those who sorted all of them) who put every card in one group. The "best merge" list starts from single cards and repeatedly joins the two groups whose union the most participants actually made, until no join reaches the threshold you choose. Unlike the dendrogram, every group it suggests was really made by that share of people (Righi et al. 2013, "Card sort analysis best practices", Journal of Usability Studies 8(3), describe both approaches).</p>
        <p><b>Standardising names (open and hybrid sorts).</b> Labels that differ only in case, spacing, punctuation or "and"/"&" are merged automatically; you merge synonyms by hand. For each standard category, <b>agreement</b> = Σ<sub>c</sub> n<sub>c</sub> ÷ (k × n), where n is the number of participants who used the category, n<sub>c</sub> how many of them put card c in it, and k the number of different cards anyone put in it. It is 1 when everyone who used the category put exactly the same cards in it. Spencer (2009, Card Sorting: Designing Usable Categories) describes this standardisation step.</p>
        <p><b>Closed sorts.</b> For each card, the share of participants (of those who sorted it) who chose its most common category. A card is <b>split</b> (ambiguous) when no category gets 60% and at least two categories get 20% or more. A card has <b>no home</b> when its closest partner shares a group with it for fewer than 35% of participants, or when 25% or more marked it "not sure". These thresholds are rules of thumb, not published norms.</p>
        <p><b>How many participants.</b> Tullis and Wood (2004) took random subsets of 168 participants and correlated each subset's similarity matrix with the full one: 15 participants gave about r = 0.90 and 20 to 30 gave 0.93 to 0.95. The stability curve repeats this on your data (40 random subsets at each size, nested so each is a uniform random subset). The <b>map</b> is classical (Torgerson) multidimensional scaling of 1 − S.</p>
        <p><b>When not to use it.</b> A card sort tells you how people group things, not whether they can find them: test the resulting structure with a tree test. It suits content that people know; for unfamiliar or highly technical content, people sort by surface words. With fewer than about 15 participants the groups are fragile, and with more than about 60 cards people tire and sort carelessly at the end.</p>
      </About>
    </>
  );
}

export default CardSort;
