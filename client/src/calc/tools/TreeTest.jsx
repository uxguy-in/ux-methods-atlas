import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as T from './treetest.js';
import { Choice, Result, Stats, Problem, About, download, copyText, num, pct } from './ui.jsx';

const DRAFT_KEY = 'uxatlas:tree-test:draft';
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const writeDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };

const CAT_TONE = { 'direct-success': 'var(--ok)', 'indirect-success': 'var(--c3)', 'direct-failure': 'var(--bad)', 'indirect-failure': 'var(--c2)', skip: 'var(--ink-3)' };

// ── Participant screen ──
function Participant({ study, preview, onExit }) {
  const nodes = useMemo(() => T.parseTree(study.tr).nodes, [study]);
  const [pid, setPid] = useState(() => `P-${T.newId().slice(0, 5)}`);
  const [order, setOrder] = useState(() => T.taskOrder(study.tk.length, !!study.o?.r));
  const [phase, setPhase] = useState('intro');
  const [pos, setPos] = useState(0);
  const [cur, setCur] = useState(0);
  const [attempts, setAttempts] = useState([]);
  const [rating, setRating] = useState({});
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(null);
  const ev = useRef([]); const t0 = useRef(0); const pending = useRef(null);
  const now = () => Math.round(performance.now() - t0.current);
  const ti = order[pos];
  const top = useRef(null);
  useEffect(() => { top.current?.scrollTo?.(0, 0); }, [phase, pos, cur]);

  const startTask = () => { ev.current = []; t0.current = performance.now(); setCur(0); setRating({}); setPhase('task'); };
  const open = (c) => { ev.current.push(['o', c, now()]); setCur(c); };
  const up = (to) => { ev.current.push(['u', to, now()]); setCur(to); };
  const finishTask = (r) => {
    const ms = now();
    ev.current.push(r < 0 ? ['x', -1, ms] : ['s', r, ms]);
    pending.current = { t: ti, e: ev.current, r, ms };
    if (r >= 0 && (study.o?.c || study.o?.s)) setPhase('rate'); else commit({});
  };
  const commit = (extra) => {
    const a = { ...pending.current, ...extra };
    const all = [...attempts, a];
    setAttempts(all);
    if (pos + 1 < order.length) { setPos(pos + 1); startTask(); return; }
    const result = { v: 1, s: study.id, p: pid, d: Date.now(), k: all };
    const c = T.encodeResult(result);
    setCode(c);
    setSaved(preview ? null : T.saveSession(study.id, c));
    setPhase('done');
  };
  const again = () => { setPid(`P-${T.newId().slice(0, 5)}`); setOrder(T.taskOrder(study.tk.length, !!study.o?.r)); setAttempts([]); setPos(0); setCode(''); setCopied(false); setPhase('intro'); };
  const crumbs = T.pathOf(nodes, cur);
  const node = nodes[cur];
  const scale = (key, label, lo, hi) => (
    <div className="calc-field">
      <span>{label}</span>
      <div className="tt-scale" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5, 6, 7].map((v) => <button key={v} type="button" role="radio" aria-checked={rating[key] === v} className={rating[key] === v ? 'on' : ''} onClick={() => setRating({ ...rating, [key]: v })}>{v}</button>)}</div>
      <div className="tt-scale-ends"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
  const mail = `mailto:?subject=${encodeURIComponent(`Tree test results: ${study.n}`)}&body=${encodeURIComponent(`My result code for "${study.n}":\n\n${code}\n`)}`;
  return createPortal(
    <div className="tt-run" ref={top} role="dialog" aria-modal="true" aria-label={`Tree test: ${study.n}`}>
      <div className="tt-run-in">
        {preview && <p className="calc-warn">Preview: this run is not saved in the browser. <button type="button" className="clu-link" onClick={onExit}>Close the preview</button></p>}
        {phase === 'intro' && (
          <>
            <p className="eyebrow">Tree test</p>
            <h1>{study.n}</h1>
            <p>You'll be asked to find {study.tk.length} things in a list of links, one level at a time. There are no pictures and no search, only the labels. Click a label to open it, use <b>Back</b> if you want to go back, and choose <b>I'd find it here</b> when you reach the place you would look.</p>
            <p>There are no right or wrong answers: we are testing the labels, not you. If you can't decide, you can skip a task.</p>
            <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
            <div className="tt-actions"><button type="button" className="btn" onClick={startTask}>Start</button></div>
          </>
        )}
        {phase === 'task' && (
          <>
            <div className="prog">Task {pos + 1} of {order.length}</div>
            <div className="task">{study.tk[ti].q}</div>
            <nav className="tt-crumbs" aria-label="Where you are">
              <button type="button" onClick={() => cur !== 0 && up(0)} disabled={cur === 0}>Home</button>
              {crumbs.map((c) => <span key={c}>› {c === cur ? <b>{nodes[c].label}</b> : <button type="button" onClick={() => up(c)}>{nodes[c].label}</button>}</span>)}
            </nav>
            {node.children.length > 0 ? (
              <ul className="tt-list">{node.children.map((c) => <li key={c}><button type="button" onClick={() => open(c)}><span>{nodes[c].label}</span><span aria-hidden="true">{nodes[c].children.length ? '›' : ''}</span></button></li>)}</ul>
            ) : <p className="tl-note">There is nothing more under "{node.label}".</p>}
            {cur !== 0 && (
              <div className="tt-here">
                <p>Would you find it in <b>{node.label}</b>?</p>
                <div className="tt-actions">
                  <button type="button" className="btn accent" onClick={() => finishTask(cur)}>I'd find it here</button>
                  <button type="button" className="btn ghost" onClick={() => up(node.parent)}>Back</button>
                </div>
              </div>
            )}
            <div><button type="button" className="clu-link" onClick={() => finishTask(-1)}>Skip this task</button></div>
          </>
        )}
        {phase === 'rate' && (
          <>
            <div className="prog">Task {pos + 1} of {order.length}</div>
            <h1>Before the next task</h1>
            {!!study.o?.c && scale('c', 'How confident are you that you chose the right place?', '1 Not at all', '7 Completely')}
            {!!study.o?.s && scale('q', 'Overall, how difficult or easy was this task?', '1 Very difficult', '7 Very easy')}
            <div className="tt-actions"><button type="button" className="btn" onClick={() => commit({ ...(rating.c ? { c: rating.c } : {}), ...(rating.q ? { q: rating.q } : {}) })}>Next</button></div>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="eyebrow">Finished</p>
            <h1>Thank you</h1>
            <p>Please send this code to the researcher. It holds your clicks and nothing else.</p>
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
    </div>,
    document.body,
  );
}

// ── Pietree-style path diagram ──
function PathTree({ nodes, t }) {
  const show = new Set([0]);
  t.visits.forEach((_, v) => { for (let x = v; x >= 0; x = nodes[x].parent) show.add(x); });
  t.ok.forEach((v) => show.add(v));
  const kids = (i) => nodes[i].children.filter((c) => show.has(c));
  const rows = []; const y = {};
  const place = (i) => { const k = kids(i); if (!k.length) { y[i] = rows.length; rows.push(i); return y[i]; } const ys = k.map(place); y[i] = (ys[0] + ys[ys.length - 1]) / 2; return y[i]; };
  place(0);
  const maxD = Math.max(...[...show].map((v) => nodes[v].depth));
  const colW = 200, rowH = 34, padL = 20, padT = 24;
  const W = padL + (maxD + 1) * colW + 40, H = padT * 2 + rows.length * rowH;
  const X = (i) => padL + nodes[i].depth * colW + 8, Y = (i) => padT + y[i] * rowH + rowH / 2;
  const n = Math.max(1, t.n);
  const firstTotal = [...t.firsts.values()].reduce((a, b) => a + b, 0) || 1;
  const fill = (v) => (t.answers.includes(v) ? 'var(--ok)' : t.ok.has(v) ? 'var(--c3)' : 'var(--bad)');
  return (
    <div className="tl-scroll">
      <svg className="tl-plot" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Paths taken in task ${t.ti + 1}`}>
        {[...show].filter((v) => v > 0).map((v) => {
          const p = nodes[v].parent, e = t.edges.get(v) || 0;
          const x1 = X(p), y1 = Y(p), x2 = X(v), y2 = Y(v), mx = (x1 + x2) / 2;
          return <path key={`e${v}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} style={{ fill: 'none', stroke: e ? fill(v) : 'var(--line)', strokeWidth: e ? 1.5 + (7 * e) / n : 1.5, strokeDasharray: e ? undefined : '4 4', opacity: e ? 0.75 : 1 }} />;
        })}
        {[...show].map((v) => {
          const vis = t.visits.get(v) || 0, sel = t.selected.get(v) || 0, fc = nodes[v].depth === 1 ? t.firsts.get(v) || 0 : 0;
          const r = v === 0 ? 7 : 3 + 9 * Math.sqrt(vis / n);
          return (
            <g key={v}>
              <circle cx={X(v)} cy={Y(v)} r={r} style={{ fill: v === 0 ? 'var(--ink)' : vis ? fill(v) : 'var(--bg)', stroke: t.answers.includes(v) ? 'var(--ok)' : 'var(--ink-3)', strokeWidth: t.answers.includes(v) ? 3 : 1 }}><title>{`${T.pathLabel(nodes, v)}: ${vis} visited, ${sel} chose it`}</title></circle>
              <text x={v === 0 ? X(v) - 4 : X(v) + r + 5} y={v === 0 ? Y(v) - 12 : Y(v) + 4} className="lb" style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 5, strokeLinejoin: 'round' }}>{nodes[v].label}{v > 0 && <tspan className="lbs"> {vis}{sel ? ` · ${t.answers.includes(v) ? '✓' : '✗'}${sel} chose` : ''}{fc ? ` · ${pct(fc / firstTotal)} first` : ''}</tspan>}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CatBar({ cats, n }) {
  return (
    <div style={{ display: 'flex', height: 14, background: 'var(--bg-sunk)', minWidth: 120 }} aria-hidden="true">
      {T.CATEGORY_ORDER.map((k) => cats[k] ? <i key={k} title={`${T.CATEGORY_NAMES[k]}: ${cats[k]}`} style={{ display: 'block', width: `${(cats[k] / n) * 100}%`, background: CAT_TONE[k] }} /> : null)}
    </div>
  );
}

function Analysis({ study, codes, setCodes }) {
  const [sel, setSel] = useState(0);
  const parsed = useMemo(() => T.parseResultCodes(codes), [codes]);
  const other = parsed.results.filter((r) => r.s && r.s !== study.id).length;
  const an = useMemo(() => T.analyse(study, parsed.results), [study, parsed]);
  const sum = useMemo(() => T.treeSummary(an), [an]);
  const stored = T.loadSessions(study.id);
  const t = an.tasks[Math.max(0, Math.min(sel, an.tasks.length - 1))];
  const dests = useMemo(() => {
    const s = new Set(); an.tasks.forEach((x) => x.selected.forEach((_, v) => s.add(v))); an.tasks.forEach((x) => x.answers.forEach((v) => s.add(v)));
    return [...s].sort((a, b) => a - b);
  }, [an]);
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
        {stored.length > 0 && <button type="button" className="clu-link" onClick={() => { if (window.confirm('Remove the sessions saved in this browser for this study?')) { T.clearSessions(study.id); setCodes(codes + ' '); } }}>Clear saved sessions</button>}
        <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`tree-test-clicks-${study.id}.csv`, T.clicksCsv(study, parsed.results.filter((r) => !r.s || r.s === study.id)), 'text/csv')}>Download clicks (CSV)</button>
        <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`tree-test-summary-${study.id}.md`, T.markdownSummary(study, an, sum), 'text/markdown')}>Download summary (Markdown)</button>
      </div>
      {parsed.bad.length > 0 && <Problem>{parsed.bad.length} code{parsed.bad.length > 1 ? 's' : ''} could not be read; check they were copied in full.</Problem>}
      {other > 0 && <Problem>{other} code{other > 1 ? 's are' : ' is'} from a different study and {other > 1 ? 'were' : 'was'} left out.</Problem>}
      {!an.tasks.length ? <Problem>The study has no complete tasks yet: give each task wording and a correct answer.</Problem> : !an.n ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : (
        <>
          <Result big={`${pct(an.tasks.reduce((s, x) => s + x.succ, 0) / Math.max(1, an.tasks.reduce((s, x) => s + x.n, 0)))} success`} label={`${an.n} participants, ${an.tasks.length} tasks`} />
          <h3 className="clu-h3">All tasks</h3>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Summary across tasks">
            <thead><tr><th>Task</th><th>Success (95% CI)</th><th>Outcomes</th><th>Direct success</th><th>No backtracking</th><th>First click right</th><th>Time (geo mean)</th><th>Mistakes</th><th>Slips</th><th>Lapses</th><th>Retreats</th><th>Lostness</th></tr></thead>
            <tbody>{an.tasks.map((x) => (
              <tr key={x.ti} className={x.ti === t.ti ? 'on' : ''}>
                <td><button type="button" className="clu-link" onClick={() => setSel(x.ti)}>Task {x.ti + 1}</button></td>
                <td>{pct(x.rate)} ({x.ci ? `${pct(x.ci.lo)}–${pct(x.ci.hi)}` : '—'}) <span className={`qtag ${x.rate >= 0.8 ? 'promote' : x.rate >= 0.7 ? 'opp' : 'fix'}`}>{x.succ}/{x.n}</span></td>
                <td><CatBar cats={x.cats} n={x.n} /></td>
                <td>{pct(x.n ? x.directSucc / x.n : NaN)}</td><td>{pct(x.direct)}</td><td>{pct(x.firstCorrect)}</td>
                <td>{x.time ? `${num(x.time.geo, 1)} s${Number.isFinite(x.time.geoLo) ? ` (${num(x.time.geoLo, 1)}–${num(x.time.geoHi, 1)})` : ''}` : '—'}</td>
                <td>{x.mistakes}</td><td>{x.slipAttempts}</td><td>{x.lapses}</td><td>{x.retreats}</td><td>{num(x.lost)}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <ul className="tl-legend">{T.CATEGORY_ORDER.map((k) => <li key={k}><i style={{ background: CAT_TONE[k], borderRadius: 0 }} />{T.CATEGORY_NAMES[k]}</li>)}</ul>

          <h3 className="clu-h3">Task {t.ti + 1}: {t.q}</h3>
          <div className="tl-row">{an.tasks.map((x) => <button key={x.ti} type="button" className={`btn small ${x.ti === t.ti ? '' : 'ghost'}`} onClick={() => setSel(x.ti)}>Task {x.ti + 1}</button>)}</div>
          <Stats rows={[
            ['Correct answer', t.answers.map((a) => T.pathLabel(an.nodes, a)).join(' or ')],
            ['Success', `${t.succ} of ${t.n} (${pct(t.rate)}), 95% CI ${t.ci ? `${pct(t.ci.lo)}–${pct(t.ci.hi)}` : '—'}`],
            ...T.CATEGORY_ORDER.map((k) => [T.CATEGORY_NAMES[k], `${t.cats[k]} (${pct(t.n ? t.cats[k] / t.n : NaN)})`]),
            ['Most common wrong first click', t.wrongFirst[0] ? `${an.nodes[t.wrongFirst[0][0]].label} (${t.wrongFirst[0][1]})` : 'none'],
            ['Most common wrong answer', t.wrongSel[0] ? `${T.pathLabel(an.nodes, t.wrongSel[0][0])} (${t.wrongSel[0][1]})` : 'none'],
            t.conf.length > 0 && ['Mean confidence (1–7)', num(t.conf.reduce((a, b) => a + b, 0) / t.conf.length, 1)],
            t.seq.length > 0 && ['Mean ease, SEQ (1–7)', num(t.seq.reduce((a, b) => a + b, 0) / t.seq.length, 1)],
          ]} />
          {t.diagnosis.length > 0 && <ul className="exp-list">{t.diagnosis.map((d) => <li key={d.kind}><span className={`qtag ${d.kind === 'detour' || d.kind === 'slip' ? 'opp' : 'fix'}`}>{{ grouping: 'Grouping', label: 'Labels', abandon: 'No match', detour: 'Detours', slip: 'Slips' }[d.kind]}</span> {d.text}</li>)}</ul>}
          <PathTree nodes={an.nodes} t={t} />
          <ul className="tl-legend">
            <li><i style={{ background: 'var(--ok)' }} />Correct destination</li>
            <li><i style={{ background: 'var(--c3)' }} />On the way to it</li>
            <li><i style={{ background: 'var(--bad)' }} />Off the correct path</li>
            <li>Circle size and line width: how many people went there. "% first": share of first clicks.</li>
          </ul>
          <details>
            <summary><b>Every attempt at task {t.ti + 1}</b></summary>
            <div className="clu-scroll"><table className="clu-table">
              <thead><tr><th>Participant</th><th>Outcome</th><th>Errors</th><th>Path</th><th>Time</th></tr></thead>
              <tbody>{t.atts.map((x) => (
                <tr key={x.pid}>
                  <td>{x.pid}</td>
                  <td><span className={`qtag ${x.c.success ? 'promote' : x.c.skipped ? '' : 'fix'}`}>{T.CATEGORY_NAMES[x.c.category]}</span></td>
                  <td className="clu-tags">{x.c.slips > 0 && <span className="qtag opp">Slip ×{x.c.slips}</span>}{x.c.mistakes > 0 && <span className="qtag fix">Mistake</span>}{x.c.lapse && <span className="qtag opp">Lapse ({x.c.lapseKind})</span>}{x.c.retreats > 0 && <span className="qtag">Back ×{x.c.retreats}</span>}</td>
                  <td>{(x.a.e || []).map((e) => (e[0] === 'o' ? an.nodes[e[1]].label : e[0] === 'u' ? '↩' : e[0] === 's' ? '✔' : 'skip')).join(' › ')}</td>
                  <td>{num(x.c.seconds, 1)} s</td>
                </tr>
              ))}</tbody>
            </table></div>
          </details>

          <h3 className="clu-h3">Destinations</h3>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Destination matrix">
            <thead><tr><th>Chosen node</th>{an.tasks.map((x) => <th key={x.ti}>Task {x.ti + 1}</th>)}</tr></thead>
            <tbody>{dests.map((v) => (
              <tr key={v}><td style={{ whiteSpace: 'normal' }}>{T.pathLabel(an.nodes, v)}</td>{an.tasks.map((x) => { const c = x.selected.get(v) || 0; const right = x.answers.includes(v); return <td key={x.ti} className={right ? 'tl-cell-ok' : c / Math.max(1, x.n) >= 0.15 ? 'tl-cell-bad' : ''}>{c ? `${c} (${pct(c / x.n)})` : right ? '0 ✓' : ''}</td>; })}</tr>
            ))}<tr><td>Skipped</td>{an.tasks.map((x) => <td key={x.ti}>{x.cats.skip || ''}</td>)}</tr></tbody>
          </table></div>
          <p className="tl-note">Green cells are correct destinations; red cells are wrong destinations chosen by 15% or more.</p>

          <h3 className="clu-h3">Lostness per participant (successful tasks)</h3>
          <div className="disc-table" role="table" aria-label="Lostness per participant">
            {an.people.map((p) => (
              <div key={p.id} role="row" className={p.lost > 0.5 ? 'hl' : ''}>
                <span role="cell">{p.id}</span>
                <span role="cell" className="bar"><i style={{ width: pct(Math.min(1, p.lost || 0)) }} /></span>
                <span role="cell">{num(p.lost)}</span>
              </div>
            ))}
          </div>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </div>
  );
}

function Builder({ draft, setDraft, study, link, onPreview }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const { nodes, bad } = useMemo(() => T.parseTree(draft.tree), [draft.tree]);
  const tasks = draft.tasks;
  const setTask = (i, patch) => setDraft({ ...draft, tasks: tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const toggle = (v) => { const t = tasks[active]; if (!t) return; setTask(active, { a: t.a.includes(v) ? t.a.filter((x) => x !== v) : [...t.a, v] }); };
  const missing = tasks.map((t, i) => (!t.q.trim() || !t.a.length ? i + 1 : null)).filter(Boolean);
  const stale = tasks.some((t) => t.a.some((v) => v >= nodes.length));
  return (
    <div className="clu-root">
      <label className="calc-field wide">
        <span>Study name</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} />
      </label>
      <div className="tt-build">
        <label className="calc-field wide">
          <span>Navigation tree: one label per line, indent children</span>
          <textarea rows={18} value={draft.tree} onChange={(e) => setDraft({ ...draft, tree: e.target.value })} spellCheck={false} wrap="off" />
          <small>Use two spaces or a tab for each level. Paste from a sitemap or spreadsheet outline. Changing the tree after choosing answers can shift them: check the ticks.</small>
        </label>
        <div className="calc-field wide">
          <span>Preview: click nodes to mark the correct answers for task {active + 1}</span>
          <div className="tt-preview" role="list" aria-label="Tree preview">
            {nodes.slice(1).map((n) => {
              const on = tasks[active]?.a.includes(n.i);
              return <button key={n.i} type="button" role="listitem" aria-pressed={!!on} className={on ? 'on' : ''} style={{ paddingLeft: 8 + (n.depth - 1) * 18 }} onClick={() => toggle(n.i)}>{n.label}{on && <span className="mk">✓ task {active + 1}</span>}</button>;
            })}
          </div>
          <small>{nodes.length - 1} nodes, {Math.max(0, ...nodes.map((n) => n.depth))} levels deep.</small>
        </div>
      </div>
      {bad.length > 0 && <Problem>Empty labels on lines {bad.join(', ')}.</Problem>}
      <h3 className="clu-h3">Tasks ({tasks.length} of up to 10)</h3>
      <div className="tt-tasks">
        {tasks.map((t, i) => (
          <div key={i} className={`tt-task${i === active ? ' on' : ''}`} onFocus={() => setActive(i)} onClick={() => setActive(i)}>
            <label className="calc-field wide"><span>Task {i + 1}</span><textarea rows={2} value={t.q} onChange={(e) => setTask(i, { q: e.target.value })} placeholder="Write a scenario in the participant's words, without using the label you're testing." /></label>
            <div className="ans">Correct: {t.a.length ? t.a.filter((v) => v < nodes.length).map((v) => T.pathLabel(nodes, v)).join(' or ') : <em>select this task, then click the correct node(s) in the preview</em>}</div>
            <div className="tl-row">
              <button type="button" className="clu-link" onClick={(e) => { e.stopPropagation(); setActive(i); }}>{i === active ? 'Choosing answers for this task' : 'Choose answers'}</button>
              <button type="button" className="clu-link" disabled={tasks.length <= 1} onClick={(e) => { e.stopPropagation(); setDraft({ ...draft, tasks: tasks.filter((_, j) => j !== i) }); setActive(0); }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      <div className="tl-row">
        <button type="button" className="btn ghost small" disabled={tasks.length >= 10} onClick={() => { setDraft({ ...draft, tasks: [...tasks, { q: '', a: [] }] }); setActive(tasks.length); }}>Add a task</button>
        <label className="tl-check"><input type="checkbox" checked={draft.randomise} onChange={(e) => setDraft({ ...draft, randomise: e.target.checked })} /> Randomise task order</label>
        <label className="tl-check"><input type="checkbox" checked={draft.confidence} onChange={(e) => setDraft({ ...draft, confidence: e.target.checked })} /> Ask confidence (1–7)</label>
        <label className="tl-check"><input type="checkbox" checked={draft.seq} onChange={(e) => setDraft({ ...draft, seq: e.target.checked })} /> Ask ease (SEQ 1–7)</label>
      </div>
      {(missing.length > 0 || stale) && <Problem>{missing.length > 0 && `Task${missing.length > 1 ? 's' : ''} ${missing.join(', ')} need${missing.length > 1 ? '' : 's'} wording and at least one correct answer. `}{stale && 'Some answers point past the end of the tree; choose them again.'}</Problem>}
      <h3 className="clu-h3">Share with participants</h3>
      <textarea className="tl-code" readOnly rows={3} value={link} aria-label="Participant link" onFocus={(e) => e.target.select()} />
      <div className="clu-actions">
        <button type="button" className="btn small" onClick={async () => setCopied(await copyText(link))}>{copied ? 'Copied' : 'Copy participant link'}</button>
        <button type="button" className="btn ghost small" onClick={onPreview}>Preview as participant</button>
        <span className="tl-note">Study id <code>{study.id}</code> · link {link.length} characters</span>
      </div>
      <p className="tl-note">The whole study travels inside the link, compressed; nothing is stored on a server. Results come back as codes that participants copy or email to you. If you run moderated sessions on this device, results are also kept in this browser under the study id, so you can load them in Analyse.</p>
    </div>
  );
}

const exampleDraft = () => {
  const s = T.exampleStudy();
  return { id: s.id, name: s.n, tree: T.EXAMPLE_TREE, tasks: s.tk.map((t) => ({ q: t.q, a: t.a })), randomise: true, confidence: true, seq: true };
};

// ── Tree test ──
function TreeTest() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => readDraft() || exampleDraft());
  const setDraft = (d) => { setDraftRaw(d); writeDraft(d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => T.makeStudy({ id: draft.id, name: draft.name, treeText: draft.tree, tasks: draft.tasks.filter((t) => t.q.trim() && t.a.length), randomise: draft.randomise, confidence: draft.confidence, seq: draft.seq }), [draft]);
  const code = useMemo(() => T.encodeStudy(study), [study]);
  const href = useHref(`/calculators/tree-test?study=${code}`);
  const link = typeof window !== 'undefined' ? new URL(href, window.location.href).href : href;
  const isExample = draft.id === 'example1';
  const [codes, setCodes] = useState(() => (isExample ? T.exampleResults(T.exampleStudy()).map(T.encodeResult).join('\n') : ''));
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = T.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <Participant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else { setParams({}); } }} />;

  const loadStudy = () => {
    try {
      const s = T.decodeStudy(pasted);
      setDraft({ id: s.id, name: s.n, tree: s.tr.replace(/\t/g, '  '), tasks: s.tk.map((t) => ({ q: t.q, a: t.a })), randomise: !!s.o?.r, confidence: !!s.o?.c, seq: !!s.o?.s });
      setLoadErr(''); setPasted(''); setCodes('');
    } catch { setLoadErr('That is not a tree-test study link.'); }
  };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ id: T.newId(), name: 'Navigation tree test', tree: 'Section A\n  Page 1\n  Page 2\nSection B\n  Page 3', tasks: [{ q: '', a: [] }], randomise: true, confidence: false, seq: false }); setCodes(''); };
  const example = () => { setDraft(exampleDraft()); setCodes(T.exampleResults(T.exampleStudy()).map(T.encodeResult).join('\n')); };
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
        ? <Builder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/tree-test?study=${code}&preview=1`); }} />
        : <Analysis study={study} codes={codes} setCodes={setCodes} />}
      <h3 className="clu-h3">How attempts are labelled</h3>
      <ul className="tl-defs">
        <li><b>Direct success</b>: chose a correct place without ever going back. <b>Indirect success</b>: chose a correct place after going back at least once.</li>
        <li><b>Direct failure</b>: chose a wrong place without going back. <b>Indirect failure</b>: chose a wrong place after going back. <b>Skip</b>: gave up without choosing.</li>
        <li><b>Slip</b>: was on the right path, opened a neighbouring label, and went straight back as the very next click. The intention was right; the click was not.</li>
        <li><b>Mistake</b>: went two or more levels into a top-level section that does not hold the answer. The person committed to the wrong place, which points to a different mental model of the site.</li>
        <li><b>Lapse</b>: reached the section that holds the answer (its parent) but chose something else, or abandoned the task.</li>
        <li><b>Retreat</b>: every use of Back or a breadcrumb to go up. Directness is the share of attempts with no retreats.</li>
      </ul>
      <p className="tl-note">These labels are read from click paths with fixed rules, so they are hypotheses about what people were thinking. Check them with a few moderated sessions before acting on a single label.</p>
      <About method="tree-testing" links={[['tree-testing-and-navigation-error-taxonomy', 'Tree testing and navigation error taxonomy'], ['tree-taxonomy-diagnostic-loop', 'Tree and taxonomy diagnostic loop'], ['first-click-testing', 'First-click testing'], ['lostness-metric', 'Lostness'], ['error-taxonomy-slips-lapses-mistakes', 'Slips, lapses and mistakes'], ['card-sorting', 'Card sorting'], ['information-foraging-analysis', 'Information foraging and scent'], ['information-architecture', 'Information architecture'], ['mental-model-elicitation-expected-ia', 'Expected IA'], ['adjusted-wald-confidence-interval-for-completion-rates', 'Adjusted-Wald interval'], ['single-ease-question-seq-benchmarking', 'Single Ease Question']]}>
        <p>A tree test (reverse card sort) checks whether people can find things in a navigation structure with all visual design and search removed. Participants see the top level of the tree, open labels one level at a time, can go back, and say where they would expect to find the answer to each task.</p>
        <p><b>Success</b> is the share who chose a correct destination, with the adjusted-Wald interval (Sauro and Lewis), which behaves well at small samples. <b>Direct success</b> is success with no backtracking; <b>no backtracking</b> is the share of all attempts that never went back. <b>First click right</b> is the share whose first click was on a correct path; people whose first click is right are far more likely to succeed. <b>Time</b> is the geometric mean of successful attempts with a t-interval on the log times. <b>Lostness</b> (Smith 1996) is √((N/S − 1)² + (R/N − 1)²), with N the different nodes visited, S all nodes visited including revisits and the home level, and R the nodes on the shortest route; it is averaged over each participant's successful tasks (above 0.5 suggests being lost).</p>
        <p><b>Error types</b> adapt Norman's (1981) and Reason's (1990) distinction between slips (right intention, wrong action), lapses (a memory or attention failure) and mistakes (a wrong plan or mental model) to click paths, using the rules listed above. The diagnosis of each task combines them: many wrong first clicks or mistakes point to a top-level grouping problem; many wrong answers next to the correct one, or near misses, to ambiguous final labels; many give-ups to missing or unfamiliar words.</p>
        <p>Plan for about 50 participants for stable success rates, and write tasks that do not reuse the words of the target label. The study and its results are encoded in links and codes (LZW-compressed JSON in base64url), so the tool needs no server.</p>
      </About>
    </>
  );
}

export default TreeTest;
