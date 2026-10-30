import { useId, useMemo, useState } from 'react';
import * as FT from './humanfactors-fault.js';
import './decisions.css';

// A form for building the fault-tree outline without writing it by hand. It reads the current outline and writes
// every edit straight back to it, so the form and the text always show the same tree. The tool's parser
// (FT.parseFaultTree) drops lines it cannot use, such as a cause whose probability box has just been emptied, so the
// form reads the outline's shape with the same gate and event patterns but keeps every line; the parser still reports
// any problems under the form.

// ── Reading the outline ──
const GATE = /^(.*?)\s*\[\s*(and|or|(\d+)\s*(?:\/|of)\s*(\d+)?)\s*\]\s*$/i; // as in parseFaultTree
const EVENT = /^(.*?)\s*(?::|=)\s*(?:p\s*=\s*)?([0-9.]+(?:e[-+]?\d+)?)\s*$/i; // as in parseFaultTree
function readOutline(text) {
  const notes = [], tops = [], stack = [];
  let started = false;
  for (const l of String(text || '').split(/\r?\n/)) {
    const t = l.replace(/\t/g, '  ');
    const body = t.trim();
    if (!body) continue;
    if (body.startsWith('#')) { if (!started) notes.push(body); continue; } // a comment before the tree is its title
    started = true;
    const indent = t.length - t.trimStart().length;
    let node;
    const g = GATE.exec(body);
    if (g) node = { kind: 'gate', op: g[3] ? 'kofn' : g[2].toLowerCase(), k: g[3] ? Number(g[3]) : 2, label: g[1].trim(), children: [] };
    else {
      const m = EVENT.exec(body);
      // A half-typed probability ("1 in") is not a number yet, so split at the first colon (names cannot hold one).
      const loose = !m && /^(.*?)\s*[:=]\s*(.*)$/.exec(body);
      node = { kind: 'event', label: (m ? m[1] : loose ? loose[1] : body).trim(), p: m ? m[2] : loose ? loose[2].trim() : '', children: [] };
    }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node); else tops.push(node);
    stack.push({ indent, node });
  }
  return { notes, tops };
}

// ── Writing the outline ──
export function serialise(notes, tops) {
  const out = [...notes];
  const walk = (n, depth) => {
    const pad = '  '.repeat(depth);
    if (n.kind === 'gate') {
      const op = n.op === 'kofn' ? `${n.k}/${n.children.length}` : n.op.toUpperCase();
      out.push(`${pad}${n.label} [${op}]`);
    } else out.push(`${pad}${n.label}${n.p !== '' ? `: ${n.p}` : ''}`);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  tops.forEach((t) => walk(t, 0));
  return out.join('\n');
}

// "1 in 1000", "1/1000", "0.1%" and "1e-3" all become a plain number, because the outline only takes numbers.
export function toProbability(s) {
  const t = String(s).trim().replace(/,/g, '');
  if (!t || /^[0-9.]+(?:e[-+]?\d+)?$/i.test(t)) return t;
  const neat = (x) => String(Number(x.toPrecision(6)));
  let m = /^([0-9.]+)\s*(?:in|\/|out of)\s*([0-9.]+)$/i.exec(t);
  if (m && Number(m[2]) > 0) return neat(Number(m[1]) / Number(m[2]));
  m = /^([0-9.]+)\s*%$/.exec(t);
  if (m) return neat(Number(m[1]) / 100);
  return t;
}
const cleanName = (v) => v.replace(/[:=[\]]/g, '').replace(/^#+/, '').replace(/\s+/g, ' ').trim() || 'Unnamed';
export const STARTER = 'What goes wrong [OR]\n  First cause: 0.01\n  Second cause: 0.005';

// The outline trims spaces, so a box keeps its own text while it has focus; otherwise "Wrong " would lose its space
// before the next letter arrives.
function Box({ value, onText, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input {...rest} value={draft ?? value} onFocus={() => setDraft(value)} onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onText(e.target.value); }} />
  );
}

const at = (tops, path) => path.slice(1).reduce((n, i) => n.children[i], tops[path[0]]);
const ROLE = {
  and: 'AND gate: all of these must happen',
  or: 'OR gate: any one of these is enough',
};
const allEvents = (tops) => { const out = []; const go = (n) => { if (n.kind === 'event') out.push(n); n.children.forEach(go); }; tops.forEach(go); return out; };

function NodeRow({ node, path, edit, firstOf, uses, listId }) {
  const isGate = node.kind === 'gate';
  const isTop = path.length === 1;
  const remove = () => edit((t) => { if (path.length === 1) t.splice(path[0], 1); else at(t, path.slice(0, -1)).children.splice(path[path.length - 1], 1); });
  const addCause = () => edit((t) => {
    const n = at(t, path);
    n.children.push({ kind: 'event', label: `Cause ${n.children.length + 1}`, p: '0.01', children: [] });
  });
  const toGate = () => edit((t) => {
    const n = at(t, path);
    // If this was the line that gave a shared event its probability, hand the number on to its next use.
    if (n.p !== '') {
      const other = allEvents(t).find((e) => e !== n && e.label.toLowerCase() === n.label.toLowerCase() && e.p === '');
      if (other) other.p = n.p;
    }
    Object.assign(n, { kind: 'gate', op: 'or', k: 2, children: [
      { kind: 'event', label: 'First cause', p: n.p || '0.01', children: [] },
      { kind: 'event', label: 'Second cause', p: '0.01', children: [] },
    ] });
    delete n.p;
  });
  const setOp = (op) => edit((t) => { const n = at(t, path); n.op = op; if (op === 'kofn') n.k = Math.min(Math.max(1, n.k || 2), Math.max(1, n.children.length)); });
  const setK = (v) => edit((t) => { const n = at(t, path); const k = parseInt(v, 10); if (k >= 1) n.k = Math.min(k, Math.max(1, n.children.length)); });
  const name = (v) => edit((t) => { at(t, path).label = cleanName(v); });
  const setP = (v) => edit((t) => { at(t, path).p = toProbability(v); });

  const first = !isGate ? firstOf.get(node.label.toLowerCase()) : null;
  const shared = !isGate && first && first !== node;
  const pNum = Number(node.p);
  const n = node.children.length;
  const role = isGate
    ? `${isTop ? 'Top event, ' : ''}${node.op === 'kofn' ? `voting gate: at least ${node.k} of these ${n} must happen` : ROLE[node.op]}`
    : shared ? `Shared event: the same "${first.label}" as above${first.p !== '' ? `, probability ${first.p}` : ''}`
      : (uses.get(node.label.toLowerCase()) || 0) > 1 ? `Basic event, shared by ${uses.get(node.label.toLowerCase())} branches` : 'Basic event: a cause you can put a number on';
  return (
    <li className={`tb-node ftb-node ftb-${isGate ? node.op : 'event'}`}>
      <div className="tb-row">
        <span className={`ftb-icon ftb-i-${isGate ? node.op : shared ? 'shared' : 'event'}`} aria-hidden="true" />
        <label className="tb-label"><span className="sr">Name</span>
          <Box value={node.label} onText={name} aria-label={`${isTop ? 'Top event' : isGate ? 'Gate' : 'Cause'}: name`} list={isGate ? undefined : listId} autoComplete="off" />
        </label>
        {isGate ? (
          <>
            <label className="tb-f ftb-op"><span>Happens when</span>
              <select value={node.op} onChange={(e) => setOp(e.target.value)} aria-label={`${node.label}: happens when`}>
                <option value="and">All of these must happen (AND)</option>
                <option value="or">Any one is enough (OR)</option>
                <option value="kofn">At least k of n (voting)</option>
              </select>
            </label>
            {node.op === 'kofn' && (
              <label className="tb-f ftb-k"><span>At least</span>
                <span className="ftb-kof"><input type="number" min={1} max={Math.max(1, n)} value={node.k} onChange={(e) => setK(e.target.value)} aria-label={`${node.label}: at least how many`} /> of {n}</span>
              </label>
            )}
          </>
        ) : (
          <label className="tb-f ftb-p"><span>Probability</span>
            <Box value={node.p} onText={setP} placeholder={shared ? 'shared' : '0.01 or 1 in 100'} aria-label={`${node.label}: probability`} inputMode="decimal" />
          </label>
        )}
        {!isTop && <button type="button" className="tb-x" onClick={remove} aria-label={`Remove ${node.label}${n ? ' and everything under it' : ''}`}>×</button>}
      </div>
      <div className="tb-meta">
        <span className="tb-role">{role}</span>
        {!isGate && !shared && pNum > 0 && pNum <= 1 && <span className="tb-role">({FT.oneIn(pNum)})</span>}
        {isGate && <button type="button" className="tb-add" onClick={addCause}>+ Add a cause</button>}
        {!isGate && <button type="button" className="tb-add" onClick={toGate}>+ Turn into a gate</button>}
      </div>
      {n > 0 && (
        <ul className="tb-kids">
          {node.children.map((c, i) => <NodeRow key={i} node={c} path={[...path, i]} edit={edit} firstOf={firstOf} uses={uses} listId={listId} />)}
        </ul>
      )}
    </li>
  );
}

export default function FaultBuilder({ text, onChange }) {
  const listId = useId();
  const { notes, tops } = useMemo(() => readOutline(text), [text]);
  const edit = (fn) => { const t = structuredClone(tops); fn(t); onChange(serialise(notes, t)); };
  // The first use of each event name is the one that carries its probability.
  const events = allEvents(tops);
  const firstOf = new Map();
  for (const e of events) { const k = e.label.toLowerCase(); if (!firstOf.has(k) || (firstOf.get(k).p === '' && e.p !== '')) firstOf.set(k, e); }
  const uses = new Map();
  for (const e of events) uses.set(e.label.toLowerCase(), (uses.get(e.label.toLowerCase()) || 0) + 1);
  const names = [...new Set(events.map((e) => e.label))];

  if (!tops.length) {
    return (
      <div className="tb">
        <p className="dc-note">There is no fault tree yet.</p>
        <button type="button" className="btn ghost small" onClick={() => onChange([...notes, STARTER].join('\n'))}>Start a fault tree</button>
      </div>
    );
  }
  return (
    <div className="tb ftb">
      <ul className="tb-tree">
        {tops.map((t, i) => <NodeRow key={i} node={t} path={[i]} edit={edit} firstOf={firstOf} uses={uses} listId={listId} />)}
      </ul>
      <datalist id={listId}>{names.map((nm) => <option key={nm} value={nm} />)}</datalist>
      <p className="dc-note"><b>Reusing a shared event.</b> When one cause can trigger more than one branch (the same drug library left off, the same tired nurse), add a cause in each branch and give it exactly the same name; the name box suggests names you have already used. Give the probability once and leave the other boxes empty. The calculator then counts it as one event, which is what makes the answer exact.</p>
    </div>
  );
}
