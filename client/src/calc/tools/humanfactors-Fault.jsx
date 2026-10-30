import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as FT from './humanfactors-fault.js';
import { sig, fmtP, toCsv } from './humanfactors-core.js';
import { Table } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, About, Bars, Problem, download } from './ui.jsx';
import FaultBuilder from './humanfactors-FaultBuilder.jsx';
import './humanfactors.css';

const SIMPLE = `# A first fault tree: a participant misses the start of a remote usability session.
Participant misses the session [OR]
  Forgets the session: 0.05
  Cannot join the call [AND]
    Link in the invitation is wrong: 0.02
    No backup phone number given: 0.3`;
const EXAMPLES = { pump: ['Infusion pump overdose', FT.EXAMPLE], simple: ['A first fault tree', SIMPLE] };

// A plain-language guide to the outline, with a tiny annotated example.
function HowToWrite() {
  return (
    <details className="dc-howto">
      <summary>How to write a fault tree</summary>
      <ol className="dc-steps">
        <li><b>Start with the failure you want to prevent.</b> That is the top line, such as "Overdose reaches patient". It is always a gate.</li>
        <li><b>Choose how its causes combine.</b> <span className="dc-mono">[AND]</span> means all of the causes under it must happen; <span className="dc-mono">[OR]</span> means any one is enough; <span className="dc-mono">[2/3]</span> means at least 2 of its 3 causes must happen (useful for a set of checks).</li>
        <li><b>List the causes under it</b>, one per line, indented two spaces. A cause you can put a number on is a basic event: write its name, a colon and its probability, <span className="dc-mono">Barcode scan bypassed: 0.08</span>. The probability is a number from 0 to 1, so "1 in 1,000" is <span className="dc-mono">0.001</span>.</li>
        <li><b>Break a cause down further</b> by making it a gate too, with its own causes indented under it.</li>
        <li><b>Reuse a shared cause</b> by writing its name again in another branch, without the probability. The calculator counts it as one event, so the answer stays exact.</li>
      </ol>
      <pre className="dc-annot">{`Participant misses the session [OR]   ← the failure; any cause is enough
  Forgets the session: 0.05           ← a basic event, 1 in 20
  Cannot join the call [AND]          ← a gate: both causes below are needed
    Link is wrong: 0.02               ← basic event
    No backup phone number: 0.3       ← basic event`}</pre>
      <p className="dc-note">Use the same unit for every probability (per session, per shift, per programming episode). Lines starting with <span className="dc-mono">#</span> are notes, and the form below writes this outline for you if you would rather not type it.</p>
    </details>
  );
}

// ── Fault tree analysis ──
function HfFaultTree() {
  const [text, setText] = useState(FT.EXAMPLE);
  const [mode, setMode] = useState('form');
  const tree = useMemo(() => FT.parseFaultTree(text), [text]);
  const res = useMemo(() => {
    if (!tree.root || tree.errors.length) return null;
    try { return { r: FT.analyseFaultTree(tree) }; } catch (e) { return { error: e.message }; }
  }, [tree]);
  const r = res?.r;
  const fvMax = r ? Math.max(...r.importance.map((x) => x.fv), 1e-12) : 1;
  const csv = () => {
    const rows = [['section', 'name', 'events', 'order', 'probability', 'share_of_rare_event_sum', 'birnbaum', 'criticality', 'fussell_vesely', 'raw', 'rrw']];
    r.cuts.forEach((c, i) => rows.push(['cut set', `C${i + 1}`, c.names.join(' & '), c.set.length, c.p, c.share, '', '', '', '', '']));
    r.importance.forEach((m) => rows.push(['basic event', m.name, '', m.minOrder, m.p, '', m.birnbaum, m.criticality, m.fv, m.raw, Number.isFinite(m.rrw) ? m.rrw : 'inf']));
    download('fault-tree.csv', toCsv(rows), 'text/csv');
  };
  return (
    <div className="hf-root">
      <div className="tl-row hf-examples">
        <span className="hf-note">Examples:</span>
        {Object.entries(EXAMPLES).map(([k, [label, src]]) => (
          <button key={k} type="button" className={`btn ghost small${text === src ? ' on' : ''}`} onClick={() => setText(src)}>{label}</button>
        ))}
      </div>
      <HowToWrite />
      <Choice label="Build the tree with" value={mode} onChange={setMode} options={[['form', 'A form'], ['text', 'The outline text']]} />
      {mode === 'form'
        ? <FaultBuilder text={text} onChange={setText} />
        : (
          <div className="hf-code">
            <Area label="Fault tree outline" rows={14} value={text} onChange={setText} wrap="off"
              hint="One line per node, children indented under their gate. Gates: Label [AND], Label [OR], Label [2/3] (k of n). Basic events: Label: 0.003. Write an event's label again (without a probability) to reuse it in another branch. Lines starting with # are comments." />
          </div>
        )}
      {tree.errors?.length > 0 && <Problem>{tree.errors.length === 1 ? tree.errors[0] : <>Fix these lines:<ul className="hf-errs">{tree.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></>}</Problem>}
      {res?.error && <Problem>{res.error}</Problem>}
      {r && (
        <>
          <Result big={fmtP(r.Q)} tone={r.Q > 0.01 ? 'bad' : undefined} label={`Probability of the top event "${tree.root.label}" (exact, ${FT.oneIn(r.Q)})`}>
            <Stats rows={[
              ['Rare-event approximation (Σ cut sets)', fmtP(r.rareEvent)],
              ['Min-cut upper bound 1 − Π(1 − P(C))', fmtP(r.mcub)],
              Number.isFinite(r.ie) ? ['Inclusion-exclusion over cut sets', fmtP(r.ie)] : null,
              ['Minimal cut sets', `${r.cuts.length} (${Object.entries(r.orders).map(([k, v]) => `${v} of order ${k}`).join(', ')})`],
              ['Basic events / BDD nodes', `${r.events.length} / ${r.bddNodes}`],
            ]} />
          </Result>
          <h3 className="clu-h3">The tree</h3>
          <TreeDiagram tree={tree} r={r} />
          <h3 className="clu-h3">Minimal cut sets</h3>
          <p className="hf-note">Each row is a smallest combination of basic events that causes the top event on its own (MOCUS). Order 1 means a single point of failure.</p>
          <Table label="Minimal cut sets" head={['#', 'Probability', 'Share of Σ', 'Order', 'Events']} rows={r.cuts.slice(0, 30).map((c, i) => [`C${i + 1}`, fmtP(c.p), `${sig(c.share * 100, 3)}%`, c.set.length, c.names.join(' + ')])} />
          {r.cuts.length > 30 && <p className="hf-note">Showing the 30 most likely of {r.cuts.length} cut sets; the CSV has them all.</p>}
          <h3 className="clu-h3">Importance of each basic event</h3>
          <Bars label="Fussell-Vesely importance" rows={[...r.importance].sort((a, b) => b.fv - a.fv).map((m) => [m.name, m.fv / fvMax, `FV ${sig(m.fv * 100, 3)}%`, m.fv > 0.5 ? 'bad' : m.fv > 0.1 ? 'warn' : undefined])} />
          <Table label="Importance measures" head={['Basic event', 'p', 'Birnbaum ∂Q/∂p', 'Criticality', 'Fussell-Vesely', 'RAW', 'RRW', 'Smallest cut set']} rows={[...r.importance].sort((a, b) => b.fv - a.fv).map((m) => [
            m.uses > 1 ? `${m.name} (×${m.uses})` : m.name, sig(m.p, 3), fmtP(m.birnbaum), sig(m.criticality, 3), sig(m.fv, 3), sig(m.raw, 3), Number.isFinite(m.rrw) ? sig(m.rrw, 3) : '∞', m.minOrder])} />
          <div className="tl-row"><button type="button" className="btn ghost small" onClick={csv}>Download CSV</button></div>
          <StudySummary {...FT.faultSummary(r, tree.root.label)} />
        </>
      )}
      <About method="fault-tree-analysis" links={[['therp-technique-for-human-error-rate-prediction', 'THERP'], ['hazop-hazard-and-operability-study', 'HAZOP']]}>
        <p><b>Gates.</b> An AND gate occurs when all its inputs occur, an OR gate when any does, and a k-of-n (voting) gate when at least k of its n inputs do. Basic events are assumed independent, with probability p per demand or per mission.</p>
        <p><b>Exact top-event probability.</b> The tree is compiled into a reduced ordered binary decision diagram (Bryant 1986; Rauzy 1993, Reliability Engineering and System Safety 40, 203–211), with variables in order of first appearance. Q = P(top) is computed by Shannon decomposition, P(f) = p<sub>x</sub>·P(f | x = 1) + (1 − p<sub>x</sub>)·P(f | x = 0), which is exact even when the same event appears in several branches. For up to 16 cut sets the page also shows inclusion-exclusion over the minimal cut sets, P(∪C<sub>i</sub>) = Σ P(C<sub>i</sub>) − Σ P(C<sub>i</sub>C<sub>j</sub>) + …, which gives the same exact value.</p>
        <p><b>Approximations.</b> Rare-event: Q ≈ Σ<sub>i</sub> Π<sub>e∈C<sub>i</sub></sub> p<sub>e</sub>. Min-cut upper bound: Q ≤ 1 − Π<sub>i</sub>(1 − P(C<sub>i</sub>)). Both are close to exact when every probability is small (below about 0.01) and overstate it when events are likely (NUREG-0492, Fault Tree Handbook, Vesely et al. 1981).</p>
        <p><b>Minimal cut sets</b> by MOCUS (Fussell and Vesely 1972): starting from the top gate, an OR gate splits a row of the cut-set matrix, an AND gate widens it, and a k-of-n gate becomes the OR of all k-subsets of its inputs; rows are then reduced by Boolean absorption.</p>
        <p><b>Importance</b> (Q<sub>1</sub> and Q<sub>0</sub> are the top-event probability with the event certain and impossible). Birnbaum I<sub>B</sub> = Q<sub>1</sub> − Q<sub>0</sub> = ∂Q/∂p. Criticality I<sub>B</sub>·p/Q. Fussell-Vesely FV = (Q − Q<sub>0</sub>)/Q, the share of risk that involves the event. Risk achievement worth RAW = Q<sub>1</sub>/Q and risk reduction worth RRW = Q/Q<sub>0</sub>.</p>
        <p><b>Checked</b> against brute-force enumeration of every event state and every subset in Python, and against closed forms (2-of-3 at p = 0.1 is 3p² − 2p³ = 0.028).</p>
        <p><b>When not to use it.</b> When events are dependent (common causes, the same tired person doing two steps), when timing or order matters (use an event tree or a dynamic model), or when the probabilities are guesses you cannot defend: then use the cut sets qualitatively and rank them by order. Estimate task-step error probabilities with the <Link to="/calculators/human-error">human error calculator</Link> and rank failure modes with a <Link to="/calculators/use-fmea">use FMEA</Link>.</p>
      </About>
    </div>
  );
}

// ── Tree diagram: leaves spread across, each gate centred over its children ──
const BW = 132, BH = 46, GAP = 12, LV = 96;
function wrapLabel(s, n = 20) {
  const words = String(s).split(/\s+/); const lines = [''];
  for (const w of words) { const cur = lines[lines.length - 1]; if ((cur + ' ' + w).trim().length > n && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim(); }
  if (lines.length > 2) { lines.length = 2; lines[1] = `${lines[1].slice(0, n - 1)}…`; }
  return lines.map((l) => (l.length > n + 2 ? `${l.slice(0, n)}…` : l));
}
function TreeDiagram({ tree, r }) {
  const imp = new Map(r.importance.map((m) => [m.i, m]));
  const pos = new Map(); let slot = 0, depthMax = 0;
  const place = (n, d) => {
    depthMax = Math.max(depthMax, d);
    if (n.type === 'event' || !n.children.length) { pos.set(n, { x: slot++ * (BW + GAP) + BW / 2 + 8, y: d * LV + 8 }); return; }
    n.children.forEach((c) => place(c, d + 1));
    const xs = n.children.map((c) => pos.get(c).x);
    pos.set(n, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: d * LV + 8 });
  };
  place(tree.root, 0);
  const W = slot * (BW + GAP) + 16, H = (depthMax + 1) * LV + 10;
  const nodes = [...pos.keys()];
  return (
    <figure className="ea-fig">
      <div className="hf-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="tl-plot hf-tree" role="img" aria-label={`Fault tree for ${tree.root.label}`}>
          {nodes.filter((n) => n.type === 'gate').flatMap((n) => n.children.map((c, i) => {
            const a = pos.get(n), b = pos.get(c), y0 = a.y + BH + 24, ym = (y0 + b.y) / 2;
            return <path key={`${n.line}-${i}`} className="edge" d={`M${a.x},${y0} V${ym} H${b.x} V${b.y}`} />;
          }))}
          {nodes.map((n) => {
            const { x, y } = pos.get(n);
            const isGate = n.type === 'gate';
            const p = isGate ? r.gateProb.get(n) : r.events[n.idx].p;
            const m = !isGate ? imp.get(n.idx) : null;
            const lines = wrapLabel(n.label);
            const op = n.op === 'kofn' ? `${n.k}/${n.children.length}` : (n.op || '').toUpperCase();
            return (
              <g key={`${n.line}-${n.label}`}>
                <title>{`${n.label}: P = ${fmtP(p)}${m ? `, Fussell-Vesely ${sig(m.fv, 3)}` : ''}`}</title>
                <rect x={x - BW / 2} y={y} width={BW} height={BH} rx={4} className={`box${n === tree.root ? ' top' : ''}${m && m.uses > 1 ? ' shared' : ''}`} />
                {lines.map((l, i) => <text key={i} x={x} y={y + 15 + i * 13} textAnchor="middle">{l}</text>)}
                <text x={x} y={y + BH - 5} textAnchor="middle" className="sub">P = {fmtP(p)}</text>
                {isGate ? (
                  <g><rect x={x - 20} y={y + BH + 4} width={40} height={18} rx={9} className={`g-${n.op}`} /><text x={x} y={y + BH + 17} textAnchor="middle" className="op">{op}</text></g>
                ) : (
                  <circle cx={x} cy={y + BH + 12} r={8} className={`ev${m.fv > 0.5 ? ' hot' : m.fv > 0.1 ? ' warm' : ''}${m.uses > 1 ? ' shared' : ''}`} />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="hf-legend">
        <li><i style={{ background: 'var(--c1)' }} />AND gate</li>
        <li><i style={{ background: 'var(--c2)' }} />OR gate</li>
        <li><i style={{ background: 'var(--c4)' }} />k-of-n gate</li>
        <li><i style={{ background: 'color-mix(in srgb, var(--bad) 30%, var(--bg))', border: '1px solid var(--bad)' }} />basic event, Fussell-Vesely above 50%</li>
        <li><i style={{ background: 'color-mix(in srgb, var(--warn) 30%, var(--bg))', border: '1px solid var(--warn)' }} />10% to 50%</li>
        <li>dashed outline: event used in more than one branch</li>
      </ul>
      <p className="hf-note">Gate probabilities are exact for each gate's own sub-tree. Scroll sideways inside the diagram on small screens; hover a box for details.</p>
    </figure>
  );
}

export default HfFaultTree;
