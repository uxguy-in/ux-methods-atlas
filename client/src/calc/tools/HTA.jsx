import { useEffect, useMemo, useRef, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import { KLM_K } from '../stats.js';
import * as H from './hta.js';
import { Area, Choice, Result, Stats, Problem, About, Bars, download, num, pct } from './ui.jsx';

const wrap = (text, max) => {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  words.forEach((w) => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur);
  return lines;
};

// Top-down HTA chart: numbered boxes, the plan under each parent, and a thick line under each bottom-level
// operation (the stopping rule: not broken down further).
function Diagram({ nodes, svgRef, fit }) {
  const BW = 156, GAP = 18, PAD = 20, LH = 14.5;
  const layout = useMemo(() => {
    const box = nodes.map((n) => {
      const lines = wrap(n.name, 22).slice(0, 4);
      const meta = n.leaf ? [Number.isFinite(n.t) ? H.fmtTime(n.t * n.freq) : '', n.freq !== 1 ? `×${n.freq}` : '', Number.isFinite(n.risk) ? `P×C ${n.risk}` : '', n.mode].filter(Boolean).join(' · ') : '';
      return { lines, meta, h: 24 + lines.length * LH + (meta ? 14 : 0) };
    });
    const x = []; let next = 0;
    const place = (i) => { const n = nodes[i]; if (n.leaf) { x[i] = next; next += BW + GAP; return; } n.children.forEach(place); x[i] = (x[n.children[0]] + x[n.children[n.children.length - 1]]) / 2; };
    place(0);
    const maxD = Math.max(...nodes.map((n) => n.depth));
    const plan = nodes.map((n) => {
      if (n.leaf || !n.planText) return [];
      const span = n.children.length > 1 ? x[n.children[n.children.length - 1]] - x[n.children[0]] + BW : BW;
      return wrap(`Plan ${n.num}: ${n.planText}`, Math.max(26, Math.floor(span / 6.6))).slice(0, 6);
    });
    const boxH = [], planH = [];
    for (let d = 0; d <= maxD; d++) { boxH[d] = Math.max(...nodes.filter((n) => n.depth === d).map((n) => box[n.i].h)); planH[d] = Math.max(0, ...nodes.filter((n) => n.depth === d).map((n) => plan[n.i].length * 13.5)); }
    const y = [PAD]; for (let d = 1; d <= maxD; d++) y[d] = y[d - 1] + boxH[d - 1] + planH[d - 1] + 46;
    return { box, x, plan, y, boxH, planH, W: next - GAP + PAD * 2, H: y[maxD] + boxH[maxD] + PAD + 8 };
  }, [nodes]);
  const { box, x, plan, y, boxH, W, H: Ht } = layout;
  const wrapRef = useRef(null);
  // Start with the main goal in view: the tree is usually wider than the screen.
  useEffect(() => { const el = wrapRef.current; if (el && !fit) el.scrollLeft = Math.max(0, PAD + x[0] + BW / 2 - el.clientWidth / 2); }, [layout, fit]);
  return (
    <div className="tl-scroll" ref={wrapRef}>
      <svg ref={svgRef} className="tl-plot hta-svg" width={fit ? '100%' : W} height={fit ? undefined : Ht} style={fit ? { height: 'auto', maxWidth: W } : undefined} viewBox={`0 0 ${W} ${Ht}`} role="img" aria-label={`Hierarchical task analysis diagram of ${nodes[0].name}`} xmlns="http://www.w3.org/2000/svg">
        {nodes.filter((n) => !n.leaf).map((n) => {
          const px = PAD + x[n.i] + BW / 2, py = y[n.depth] + box[n.i].h;
          const barY = y[n.depth] + boxH[n.depth] + layout.planH[n.depth] + 22;
          const cx = n.children.map((c) => PAD + x[c] + BW / 2);
          return (
            <g key={`l${n.i}`}>
              <line className="link" x1={px} x2={px} y1={py} y2={barY} />
              {cx.length > 1 && <line className="link" x1={cx[0]} x2={cx[cx.length - 1]} y1={barY} y2={barY} />}
              {cx.map((c, j) => <line key={j} className="link" x1={c} x2={c} y1={barY} y2={y[n.depth + 1]} />)}
              {plan[n.i].map((l, j) => <text key={j} className="plan" x={px + 6} y={y[n.depth] + boxH[n.depth] + 14 + j * 13.5}>{l}</text>)}
            </g>
          );
        })}
        {nodes.map((n) => {
          const bx = PAD + x[n.i], by = y[n.depth], b = box[n.i];
          const cls = n.i === 0 ? 'box root' : n.risk >= 6 ? 'box risk-h' : n.risk >= 3 ? 'box risk-m' : 'box';
          return (
            <g key={n.i}>
              <rect className={cls} x={bx} y={by} width={BW} height={b.h} rx={3} />
              <text className="num" x={bx + 8} y={by + 15}>{n.num}</text>
              {b.lines.map((l, j) => <text key={j} className="nm" x={bx + 8} y={by + 30 + j * LH}>{l}</text>)}
              {b.meta && <text className="meta" x={bx + 8} y={by + 30 + b.lines.length * LH}>{b.meta}</text>}
              {n.leaf && <line className="stop" x1={bx + 6} x2={bx + BW - 6} y1={by + b.h + 4} y2={by + b.h + 4} />}
              <title>{`${n.num} ${n.name}${n.note ? ` (${n.note})` : ''}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Outline({ nodes, i = 0 }) {
  const n = nodes[i];
  const label = (
    <>
      <span className="n">{n.num}</span><span className={n.leaf ? 'leaf' : ''}>{n.name}</span>
      {n.leaf && Number.isFinite(n.t) && <span className="muted"> · {H.fmtTime(n.t)}{n.freq !== 1 ? ` ×${n.freq}` : ''}</span>}
      {Number.isFinite(n.risk) && <span className={`qtag ${n.risk >= 6 ? 'fix' : n.risk >= 3 ? 'opp' : 'promote'}`}>P×C {n.risk}</span>}
      {n.mode && <span className="qtag">{H.MODES[n.mode] || n.mode}</span>}
    </>
  );
  if (n.leaf) return <li>{label}</li>;
  return (
    <li>
      <details open>
        <summary>{label}{!n.leaf && <span className="muted"> · {H.fmtTime(n.total)}</span>}</summary>
        {n.planText && <span className="pl">Plan {n.num}: {n.planText}</span>}
        <ul>{n.children.map((c) => <Outline key={c} nodes={nodes} i={c} />)}</ul>
      </details>
    </li>
  );
}

// Copy computed theme colours into the SVG so the exported file looks the same outside the page.
function exportSvg(svg) {
  const clone = svg.cloneNode(true);
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'font-style', 'font-family', 'opacity'];
  src.forEach((el, i) => { const cs = getComputedStyle(el); dst[i].setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')); });
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', getComputedStyle(document.body).backgroundColor);
  clone.insertBefore(bg, clone.firstChild);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const vb = svg.getAttribute('viewBox').split(' ');
  clone.setAttribute('width', vb[2]); clone.setAttribute('height', vb[3]); clone.removeAttribute('style');
  return new XMLSerializer().serializeToString(clone);
}
function exportPng(svg, name) {
  const text = exportSvg(svg);
  const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const ctx = c.getContext('2d'); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      c.toBlob((b) => { if (!b) return; const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
    } catch { /* canvas blocked */ }
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

// ── Hierarchical task analysis ──
function HTA() {
  const [text, setText] = useState(H.HTA_EXAMPLE);
  const [k, setK] = useState(0.28);
  const [view, setView] = useState('diagram');
  const svgRef = useRef(null);
  const [fit, setFit] = useState(false);
  const parsed = useMemo(() => H.parseHta(text, k), [text, k]);
  const st = useMemo(() => (parsed.nodes.length ? H.htaStats(parsed.nodes) : null), [parsed]);
  const sum = st ? H.htaSummary(st) : null;
  const nodes = parsed.nodes;
  const slug = nodes[0] ? nodes[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'hta' : 'hta';
  const maxTop = st ? Math.max(...st.top.map((t) => t.total), 0) : 0;
  return (
    <>
      <div className="calc-inputs">
        <Area label="Your task analysis: one goal or operation per line, indented under its parent" value={text} onChange={setText} rows={16} wrap="off"
          hint={'Numbers are added for you. Under a goal, write "Plan: do 1 then 2; if card declined do 3; repeat 2–3 until done". After an operation, add fields with |: t=8 (seconds, or 2 min), klm=M P BB "text" (KLM operators), f=3 (times it is done), p=L/M/H (error likelihood), c=L/M/H (criticality), mode=A/C/R/I/S (action, checking, retrieval, communication, selection), note=…'} />
        <Choice label="Typing speed for KLM (K)" value={k} onChange={setK} options={KLM_K.map(([v, l]) => [v, `${l.split(' (')[0]} ${v} s`])} />
      </div>
      {parsed.bad.length > 0 && <Problem>Check line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 8).join(', ')}: a field without = or a plan with no task above it.</Problem>}
      {st && st.planIssues.length > 0 && <Problem>{st.planIssues.map((p) => `Plan ${p.num}: ${p.empty ? 'no plan written (steps assumed in order)' : [p.unknown.length && `refers to ${p.unknown.join(', ')}, which ${p.unknown.length > 1 ? 'do' : 'does'} not exist`, p.missing.length && `does not mention ${p.missing.join(', ')}`].filter(Boolean).join('; ')}`).join('. ')}.</Problem>}
      {!st ? <Problem>Write at least one goal.</Problem> : (
        <>
          <Result big={`${st.operations} operations · ${H.fmtTime(st.total)}`} label={`${st.subgoals} subgoals, ${st.depth} levels deep; critical path ${H.fmtTime(st.critical)}`} tone={st.high.length ? 'bad' : ''}>
            {st.top.length > 0 && st.total > 0 && <Bars label="Share of total time by top-level task" rows={st.top.map((t) => [`${t.num} ${t.name}`, maxTop ? t.total / maxTop : 0, `${H.fmtTime(t.total)} · ${pct(t.share)}`])} />}
          </Result>
          <div className="clu-actions" style={{ alignItems: 'flex-end' }}>
            <Choice label="View" value={view} onChange={setView} options={[['diagram', 'Diagram'], ['outline', 'Outline'], ['table', 'Table']]} />
            <button type="button" className="btn ghost small" disabled={view !== 'diagram'} onClick={() => svgRef.current && download(`${slug}.svg`, exportSvg(svgRef.current), 'image/svg+xml')}>Export SVG</button>
            <button type="button" className="btn ghost small" disabled={view !== 'diagram'} onClick={() => svgRef.current && exportPng(svgRef.current, `${slug}.png`)}>Export PNG</button>
            <button type="button" className="btn ghost small" onClick={() => download(`${slug}.csv`, H.htaCsv(nodes), 'text/csv')}>Table as CSV</button>
            <button type="button" className="btn ghost small" onClick={() => download(`${slug}.md`, H.htaMarkdown(nodes, sum), 'text/markdown')}>Table as Markdown</button>
          </div>
          {view === 'diagram' && <><label className="tl-check"><input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Shrink to fit the width</label><Diagram nodes={nodes} svgRef={svgRef} fit={fit} /><p className="tl-note">Scroll sideways inside the diagram on small screens. A thick line under a box marks a bottom-level operation (the stopping rule); red boxes have P × C of 6 or more, amber 3 to 4.</p></>}
          {view === 'outline' && <ul className="hta-outline"><Outline nodes={nodes} /></ul>}
          {view === 'table' && (
            <div className="clu-scroll"><table className="clu-table clu-num">
              <thead><tr><th>No.</th><th>Task</th><th>Plan</th><th>Time</th><th>Freq</th><th>P</th><th>C</th><th>P × C</th><th>Error mode</th></tr></thead>
              <tbody>{H.htaRows(nodes).map((r) => <tr key={r.num}><td>{r.num}</td><td style={{ paddingLeft: 12 + r.level * 14, whiteSpace: 'normal', minWidth: 180 }}>{r.name}</td><td style={{ whiteSpace: 'normal', minWidth: 200 }}>{r.plan}</td><td>{r.type === 'operation' ? (r.time === '' ? '—' : `${r.time} s`) : `${r.total} s`}</td><td>{r.freq}</td><td>{r.P}</td><td>{r.C}</td><td>{r.PxC}</td><td>{r.mode}</td></tr>)}</tbody>
            </table></div>
          )}
          <Stats rows={[
            ['Main goal', nodes[0].name],
            ['Subgoals / operations', `${st.subgoals} / ${st.operations}`],
            ['Depth (levels below the goal)', `${st.depth} (deepest: ${st.deepest.num})`],
            ['Breadth (most subtasks under one goal)', `${st.breadth} (mean ${num(st.meanBranch, 1)})`],
            ['Total time, every step once', H.fmtTime(st.total)],
            ['Critical path, required steps only', H.fmtTime(st.critical)],
            ['Operations per top-level task', st.top.map((t) => `${t.num}: ${t.ops}`).join(' · ')],
            ['Conditional or repeated plan steps', st.conditional],
            st.untimed > 0 && ['Operations without a time', st.untimed],
          ]} />
          {st.ranked.length > 0 && (
            <>
              <h3 className="clu-h3">Operations ranked by risk (P × C)</h3>
              <div className="clu-scroll"><table className="clu-table clu-num">
                <thead><tr><th>Rank</th><th>No.</th><th>Operation</th><th>P</th><th>C</th><th>P × C</th><th>Error mode</th><th>Note</th></tr></thead>
                <tbody>{st.ranked.map((n, i) => <tr key={n.i}><td>{i + 1}</td><td>{n.num}</td><td style={{ whiteSpace: 'normal' }}>{n.name}</td><td>{'LMH'[n.P - 1]}</td><td>{'LMH'[n.C - 1]}</td><td><span className={`qtag ${n.risk >= 6 ? 'fix' : n.risk >= 3 ? 'opp' : 'promote'}`}>{n.risk}</span></td><td>{H.MODES[n.mode] || n.mode || '—'}</td><td style={{ whiteSpace: 'normal' }}>{n.note}</td></tr>)}</tbody>
              </table></div>
              <p className="tl-note">SHERPA error modes in this analysis: {Object.entries(st.modes).filter(([, c]) => c).map(([m, c]) => `${H.MODES[m]} ${c}`).join(', ') || 'none given'}.</p>
            </>
          )}
          {sum && <StudySummary {...sum} />}
        </>
      )}
      <About method="hierarchical-task-analysis" links={[['sherpa-systematic-human-error-reduction-and-prediction-approach', 'SHERPA'], ['keystroke-level-model-klm', 'Keystroke-Level Model'], ['goms-klm', 'GOMS / KLM'], ['cognitive-task-analysis', 'Cognitive task analysis'], ['goal-directed-task-analysis-gdta', 'Goal-directed task analysis'], ['error-taxonomy-slips-lapses-mistakes', 'Slips, lapses and mistakes'], ['temporal-operator-task-modelling-hamsters-concurtasktrees', 'Task models with temporal operators'], ['predictive-human-error-analysis-phea', 'Predictive human error analysis']]}>
        <p>Hierarchical task analysis (Annett and Duncan 1967; Stanton 2006) breaks a goal into subgoals and operations, and says in a <b>plan</b> how the subgoals are put together: in order, in any order, at the same time, on a condition, or repeated. Numbering follows the usual convention: the main goal is 0, its subgoals 1, 2, 3, theirs 1.1, 1.2, and so on. Redescription stops when an operation is clear enough for its purpose; Annett's P × C rule stops when the probability of failure times its cost is acceptable. A thick line under a box marks such a bottom-level operation.</p>
        <p><b>Plans</b> are read clause by clause (separated by semicolons): "do 1 then 2" and "1 &gt; 2" are sequences, "if … do 3" a condition, "repeat 2–3 until …" a loop, "in any order", "at the same time" and "as required" the other common forms. Steps a plan never mentions are assumed to be done once, in order. <b>Times</b> come from t= or from Keystroke-Level Model operators (K, P, B, H, M, R(s), with the same values as the KLM calculator; Ms are used as written). Total time adds every operation once, times its frequency and the frequency of every goal above it. The critical path adds only required steps (not conditional or optional ones) and counts steps done at the same time once, by the longest.</p>
        <p><b>Risk</b> follows SHERPA (Embrey 1986): rate each operation's probability of error and criticality as low, medium or high (1–3); P × C runs from 1 to 9, and 6 or more is high. The error modes are SHERPA's five classes: action, checking, retrieval, communication (information) and selection. An HTA is an analyst's model: validate it by watching people do the task, and have a second analyst rate P and C.</p>
      </About>
    </>
  );
}

export default HTA;
