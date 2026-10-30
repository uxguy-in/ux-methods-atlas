import { useMemo, useState } from 'react';
import * as DT from './decisions-tree.js';

// A form for building the decision-tree outline without writing it by hand. It reads the current outline and writes
// every edit straight back to it, so the form and the text always show the same tree.

// ── Outline text from a tree ──
const attrText = (n, inChance) => {
  const parts = [];
  if (inChance) parts.push(`p=${n.attrs.p ?? ''}`);
  if (n.attrs.value) parts.push(`value=${n.attrs.value}`);
  if (n.attrs.cost) parts.push(`cost=${n.attrs.cost}`);
  return parts.length ? `: ${parts.join(', ')}` : '';
};
export function serialise(notes, params, root) {
  const out = [...notes];
  for (const p of params) {
    const range = p.lo !== undefined && p.lo !== '' && p.hi !== undefined && p.hi !== '' ? ` [${p.lo}, ${p.hi}]` : '';
    out.push(`$${p.name} = ${p.base}${range}${p.note ? `  ${p.note}` : ''}`);
  }
  if (params.length) out.push('');
  const walk = (n, depth, inChance) => {
    const mark = n.children.length ? ` [${n.type === 'C' ? 'C' : 'D'}]` : '';
    out.push(`${'  '.repeat(depth)}${n.label}${attrText(n, inChance)}${mark}`);
    n.children.forEach((c) => walk(c, depth + 1, n.type === 'C'));
  };
  if (root) walk(root, 0, false);
  return out.join('\n');
}
// Comment lines before the first parameter or node are kept as the outline's title.
const leadingNotes = (text) => {
  const notes = [];
  for (const l of String(text).split(/\r?\n/)) { if (l.trim().startsWith('#')) notes.push(l.trim()); else if (l.trim()) break; }
  return notes;
};
const clean = (n) => ({ label: n.label, type: n.children.length ? n.type : 'T', attrs: { ...n.attrs }, children: n.children.map(clean) });
export const STARTER = 'My decision [D]\n  Option A [C]\n    Goes well: p=0.5, value=100\n    Goes badly: p=rest, value=0\n  Option B: value=40';

// The outline trims spaces, so a box keeps its own text while it has focus; otherwise "Big " would lose its space
// before the next letter arrives.
function Box({ value, onText, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input {...rest} value={draft ?? value} onFocus={() => setDraft(value)} onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onText(e.target.value); }} />
  );
}

const at = (root, path) => path.reduce((n, i) => n.children[i], root);

function NodeRow({ node, path, inChance, edit }) {
  const kind = node.children.length ? node.type : 'T';
  const set = (k) => (v) => edit((r) => { const n = at(r, path); if (v.trim()) n.attrs[k] = v.trim(); else delete n.attrs[k]; });
  const add = (type) => edit((r) => {
    const n = at(r, path);
    if (!n.children.length || n.type !== type) n.type = type;
    const child = { label: type === 'C' ? 'Outcome' : 'Option', type: 'T', attrs: {}, children: [] };
    if (type === 'C') child.attrs.p = n.children.some((c) => c.attrs.p === 'rest') ? '0.1' : 'rest';
    // An end point that becomes a chance node keeps its own value and cost on the way in.
    n.children.push(child);
  });
  const remove = () => edit((r) => { at(r, path.slice(0, -1)).children.splice(path[path.length - 1], 1); });
  const role = kind === 'D' ? 'Decision: you choose one option' : kind === 'C' ? 'Chance: what might happen' : 'End point';
  return (
    <li className={`tb-node tb-${kind}`}>
      <div className="tb-row">
        <span className={`tb-icon tb-i-${kind}`} aria-hidden="true" />
        <label className="tb-label"><span className="sr">Name</span>
          <Box value={node.label} onText={(v) => edit((r) => { at(r, path).label = v.replace(/[:[\]#$]/g, '').trim() || 'Unnamed'; })} aria-label={`${role}: name`} />
        </label>
        {inChance && <label className="tb-f"><span>Chance</span><Box value={node.attrs.p ?? ''} onText={set('p')} placeholder="0.3 or rest" aria-label="Chance (probability)" /></label>}
        <label className="tb-f"><span>Gain</span><Box value={node.attrs.value ?? ''} onText={set('value')} placeholder="0" aria-label="Gain (value)" /></label>
        <label className="tb-f"><span>Cost</span><Box value={node.attrs.cost ?? ''} onText={set('cost')} placeholder="0" aria-label="Cost" /></label>
        {path.length > 0 && <button type="button" className="tb-x" onClick={remove} aria-label={`Remove ${node.label} and everything under it`}>×</button>}
      </div>
      <div className="tb-meta">
        <span className="tb-role">{role}</span>
        {kind !== 'C' && <button type="button" className="tb-add" onClick={() => add('D')}>{kind === 'D' ? '+ Add an option' : '+ Then a decision'}</button>}
        {kind !== 'D' && <button type="button" className="tb-add" onClick={() => add('C')}>{kind === 'C' ? '+ Add an outcome' : '+ Then chance outcomes'}</button>}
      </div>
      {node.children.length > 0 && (
        <ul className="tb-kids">
          {node.children.map((c, i) => <NodeRow key={i} node={c} path={[...path, i]} inChance={kind === 'C'} edit={edit} />)}
        </ul>
      )}
    </li>
  );
}

export default function TreeBuilder({ text, onChange }) {
  const parsed = useMemo(() => DT.parseTree(text), [text]);
  const notes = leadingNotes(text);
  const params = parsed.params.map((p) => ({ name: p.name, base: p.base, lo: p.lo ?? '', hi: p.hi ?? '', note: p.note }));
  const root = parsed.root ? clean(parsed.root) : null;
  const write = (ps, r) => onChange(serialise(notes, ps, r));
  const edit = (fn) => { const r = structuredClone(root); fn(r); write(params, r); };
  const setParam = (i, k) => (v) => { const ps = params.map((p) => ({ ...p })); ps[i][k] = k === 'name' ? v.replace(/\W/g, '') : v.trim(); write(ps, root); };

  if (!root) {
    return (
      <div className="tb">
        <p className="dc-note">There is no tree yet.</p>
        <button type="button" className="btn ghost small" onClick={() => onChange(STARTER)}>Start a tree</button>
      </div>
    );
  }
  return (
    <div className="tb">
      <ul className="tb-tree">
        <NodeRow node={root} path={[]} inChance={false} edit={edit} />
      </ul>
      <details className="tb-params" open={params.length > 0}>
        <summary>Named numbers ({params.length}) <span className="muted">optional</span></summary>
        <p className="dc-note">Give a number a name to reuse it (type <span className="dc-mono">$name</span> in any box) and a low–high range to see in the tornado chart whether it could change the answer.</p>
        {params.length > 0 && (
          <div className="tb-ptable">
            <span>Name</span><span>Best guess</span><span>Low</span><span>High</span><span>What it is</span><span />
            {params.map((p, i) => (
              <div className="tb-prow" key={i}>
                <Box value={p.name} onText={setParam(i, 'name')} aria-label="Name" />
                <Box value={p.base} onText={setParam(i, 'base')} aria-label="Best guess" />
                <Box value={p.lo} onText={setParam(i, 'lo')} aria-label="Low" />
                <Box value={p.hi} onText={setParam(i, 'hi')} aria-label="High" />
                <Box value={p.note} onText={setParam(i, 'note')} aria-label="What it is" />
                <button type="button" className="tb-x" onClick={() => write(params.filter((_, j) => j !== i), root)} aria-label={`Remove $${p.name}`}>×</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="tb-add" onClick={() => write([...params, { name: `n${params.length + 1}`, base: '0', lo: '', hi: '', note: '' }], root)}>+ Add a named number</button>
      </details>
    </div>
  );
}
