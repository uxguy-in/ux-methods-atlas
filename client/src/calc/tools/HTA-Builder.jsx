import { useMemo, useState } from 'react';
import * as H from './hta.js';

// A form for building the task analysis without writing the outline by hand. It reads the current outline with the
// tool's own parser and writes every edit straight back to it, so the form and the text always show the same analysis.

// Several spellings of a field are accepted by the parser; the form edits whichever one is already there.
const ALIASES = { t: ['t', 'time'], f: ['f', 'freq', 'frequency'], mode: ['mode', 'err', 'error'] };
const keysOf = (k) => ALIASES[k] || [k];
const getField = (fields, k) => { const key = keysOf(k).find((x) => fields[x] !== undefined); return key ? fields[key] : ''; };
const setField = (fields, k, v) => {
  const key = keysOf(k).find((x) => fields[x] !== undefined) || k;
  const val = String(v).replace(/\|/g, '/').trim();
  if (val) fields[key] = val; else keysOf(k).forEach((x) => delete fields[x]);
};

// ── Outline text from a tree ──
export function serialise(notes, root) {
  const out = [...notes];
  const walk = (n, depth) => {
    const pad = '  '.repeat(depth);
    const fields = Object.entries(n.fields).filter(([, v]) => v !== '' && v != null).map(([k, v]) => ` | ${k}=${v}`).join('');
    out.push(`${pad}${n.name}${fields}`);
    if (n.plan) out.push(`${pad}  Plan: ${n.plan}`);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  if (root) walk(root, 0);
  return out.join('\n');
}
// Comment lines before the first task are kept as the outline's title.
const leadingNotes = (text) => {
  const notes = [];
  for (const l of String(text).split(/\r?\n/)) { if (l.trim().startsWith('#')) notes.push(l.trim()); else if (l.trim()) break; }
  return notes;
};
const toTree = (nodes, i = 0) => {
  const n = nodes[i];
  return { name: n.name, fields: { ...n.fields }, plan: n.planText, t: n.t, klmBad: n.klmBad || [], children: n.children.map((c) => toTree(nodes, c)) };
};
const strip = (n) => ({ name: n.name, fields: n.fields, plan: n.plan, children: n.children.map(strip) });
export const STARTER = 'My main goal\n  Plan: do 1 then 2\n  First step | t=5\n  Second step | t=5';

// The outline trims spaces, so a box keeps its own text while it has focus; otherwise "Pay " would lose its space
// before the next letter arrives.
function Box({ value, onText, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input {...rest} value={draft ?? value} onFocus={() => setDraft(value)} onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onText(e.target.value); }} />
  );
}

const KLM_CHIPS = [
  ['K', 'Keystroke', 'press one key'],
  ['"text"', 'Typed text', 'one keystroke per letter; replace text with the words'],
  ['P', 'Point', 'move the mouse or finger to a target'],
  ['BB', 'Click', 'press and release the mouse button'],
  ['H', 'Home hands', 'move hands between keyboard and mouse'],
  ['M', 'Think', 'a moment to decide or recall'],
  ['R(2)', 'Wait', 'for the system, in seconds (change the 2)'],
];
const MODE_OPTS = [['', 'Not set'], ['action', 'Action (doing it wrong)'], ['checking', 'Checking (missing a check)'], ['retrieval', 'Retrieval (wrong or forgotten information)'], ['communication', 'Communication (misunderstood)'], ['selection', 'Selection (picking the wrong thing)']];
const LEVEL_OPTS = [['', 'Not set'], ['L', 'Low'], ['M', 'Medium'], ['H', 'High']];
const levelOf = (v) => { const s = String(v || '').trim().toLowerCase(); return s.startsWith('l') || s === '1' ? 'L' : s.startsWith('m') || s === '2' ? 'M' : s.startsWith('h') || s === '3' ? 'H' : ''; };
const modeOf = (v) => { const s = String(v || '').trim(); if (!s) return ''; const L = (H.MODES[s[0].toUpperCase()] || '').toLowerCase(); return MODE_OPTS.some(([x]) => x === s.toLowerCase()) ? s.toLowerCase() : L; };

const at = (root, path) => path.reduce((n, i) => n.children[i], root);

function NodeRow({ node, path, num, edit, open, toggle }) {
  const goal = node.children.length > 0;
  const root = path.length === 0;
  const key = path.join('.');
  const set = (k) => (v) => edit((r) => setField(at(r, path).fields, k, v));
  const addChild = () => edit((r) => { const n = at(r, path); n.children.push({ name: `Step ${n.children.length + 1}`, fields: {}, plan: '', children: [] }); });
  const addAfter = () => edit((r) => { at(r, path.slice(0, -1)).children.splice(path[path.length - 1] + 1, 0, { name: 'New step', fields: {}, plan: '', children: [] }); });
  const remove = () => edit((r) => { at(r, path.slice(0, -1)).children.splice(path[path.length - 1], 1); });
  const appendKlm = (op) => edit((r) => { const n = at(r, path); const cur = getField(n.fields, 'klm'); setField(n.fields, 'klm', cur ? `${cur} ${op}` : op); });
  const role = root ? 'Main goal: what the person is trying to get done' : goal ? 'Goal: broken down into the steps below' : 'Operation: one action, not broken down further';
  const klm = getField(node.fields, 'klm');
  const showChips = open.has(key);
  const nKids = node.children.length;
  return (
    <li className={`htb-node ${goal ? 'htb-goal' : 'htb-op'}`}>
      <div className="htb-row">
        <span className="htb-num" aria-hidden="true">{num}</span>
        <label className="htb-label"><span className="sr">Name</span>
          <Box value={node.name} onText={(v) => edit((r) => { at(r, path).name = v.replace(/\|/g, '/').replace(/^\s*#+/, '').trim() || 'Unnamed step'; })} aria-label={`${num} ${goal || root ? 'goal' : 'operation'} name`} />
        </label>
        {!goal && !root && (
          <>
            <label className="htb-f htb-t"><span>Time</span><Box value={getField(node.fields, 't')} onText={set('t')} placeholder="seconds" aria-label={`${num} time (seconds, or for example 2 min)`} /></label>
            <label className="htb-f htb-klm"><span>KLM actions</span><Box value={klm} onText={set('klm')} placeholder="M P BB" aria-label={`${num} KLM actions`} /></label>
          </>
        )}
        {!root && <button type="button" className="htb-x" onClick={remove} aria-label={`Remove ${num} ${node.name}${goal ? ' and everything under it' : ''}`}>×</button>}
      </div>
      {goal && (
        <label className="htb-plan"><span>Plan for {num === '0' ? 'the main goal' : num}: in what order are steps {nKids > 1 ? `1 to ${nKids}` : '1'} done?</span>
          <Box value={node.plan} onText={(v) => edit((r) => { at(r, path).plan = v.replace(/\s*\n\s*/g, '; ').trim(); })} placeholder="do 1 then 2; if card declined do 3" aria-label={`Plan for ${num}`} />
        </label>
      )}
      <div className="htb-meta">
        <span className="htb-role">{role}</span>
        {!goal && !root && Number.isFinite(node.t) && <span className="htb-role">· {getField(node.fields, 't') ? '' : 'from KLM: '}{H.fmtTime(node.t)}</span>}
        <button type="button" className="htb-add" onClick={addChild}>+ Add a sub-step</button>
        {!root && <button type="button" className="htb-add" onClick={addAfter}>+ Add a step after</button>}
        {!goal && !root && <button type="button" className="htb-add" aria-expanded={showChips} onClick={() => toggle(key)}>{showChips ? 'Hide KLM actions' : 'Build the time from actions'}</button>}
      </div>
      {!goal && !root && showChips && (
        <div className="htb-chips" role="group" aria-label={`Add KLM actions to ${num}`}>
          {KLM_CHIPS.map(([op, word, help]) => (
            <button key={op} type="button" className="htb-chip" onClick={() => appendKlm(op)} title={help}>
              <b>{word}</b> <span className="htb-mono">{op}</span><span className="htb-chip-help">{help}</span>
            </button>
          ))}
          {node.klmBad.length > 0 && <p className="htb-warn">Not KLM actions: {node.klmBad.join(' ')}</p>}
        </div>
      )}
      {!goal && !root && (
        <details className="htb-more">
          <summary>Error risk and how often <span className="muted">optional</span></summary>
          <div className="htb-morerow">
            <label className="htb-f"><span>Times done</span><Box value={getField(node.fields, 'f')} onText={set('f')} placeholder="1" aria-label={`${num} times done`} /></label>
            <label className="htb-f"><span>Chance of error</span>
              <select value={levelOf(getField(node.fields, 'p'))} onChange={(e) => set('p')(e.target.value)} aria-label={`${num} chance of error`}>{LEVEL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="htb-f"><span>Cost of an error</span>
              <select value={levelOf(getField(node.fields, 'c'))} onChange={(e) => set('c')(e.target.value)} aria-label={`${num} cost of an error`}>{LEVEL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="htb-f htb-wide"><span>Likely kind of error</span>
              <select value={modeOf(getField(node.fields, 'mode'))} onChange={(e) => set('mode')(e.target.value)} aria-label={`${num} likely kind of error`}>{MODE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="htb-f htb-wide"><span>Note</span><Box value={getField(node.fields, 'note')} onText={set('note')} placeholder="Why it goes wrong" aria-label={`${num} note`} /></label>
          </div>
        </details>
      )}
      {goal && (
        <ul className="htb-kids">
          {node.children.map((c, i) => <NodeRow key={i} node={c} path={[...path, i]} num={root ? String(i + 1) : `${num}.${i + 1}`} edit={edit} open={open} toggle={toggle} />)}
        </ul>
      )}
    </li>
  );
}

export default function HTABuilder({ text, onChange, k }) {
  const parsed = useMemo(() => H.parseHta(text, k), [text, k]);
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const notes = leadingNotes(text);
  const root = parsed.nodes.length ? toTree(parsed.nodes) : null;
  const edit = (fn) => { const r = structuredClone(strip(root)); fn(r); onChange(serialise(notes, r)); };

  if (!root) {
    return (
      <div className="htb">
        <p className="htb-note">There is no task analysis yet.</p>
        <button type="button" className="btn ghost small" onClick={() => onChange(STARTER)}>Start a task analysis</button>
      </div>
    );
  }
  return (
    <div className="htb">
      <ul className="htb-tree">
        <NodeRow node={root} path={[]} num="0" edit={edit} open={open} toggle={toggle} />
      </ul>
    </div>
  );
}
