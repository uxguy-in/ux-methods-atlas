import { useEffect, useRef, useState } from 'react';
import * as S from '../stats.js';
import './KLM-Builder.css';

// A step-by-step form for the Keystroke-Level Model sequence. It reads the current operator text one line at a time and
// writes every edit straight back to it, so the form and the text always describe the same sequence. One line is one
// step; anything after # on a line is that step's note.

// ── The kinds of step, in plain words, and the operators each one stands for ──
export const KINDS = [
  ['click', 'Click on something', 'Point the mouse at a target, then press and release the button', 'P BB'],
  ['point', 'Point', 'Move the mouse to a target without clicking', 'P'],
  ['key', 'Press a key', 'One key, such as Enter or Tab, pressed once or several times', 'K'],
  ['type', 'Type text', 'One keystroke for every character you type', '"text"'],
  ['hands', 'Move hands to mouse/keyboard', 'Move a hand between the keyboard and the mouse', 'H'],
  ['think', 'Think/decide', 'A pause to recall, find or decide what to do next', 'M'],
  ['wait', 'Wait for the system', 'Time the user waits for the screen to respond', 'R(seconds)'],
  ['drag', 'Drag', 'Point at it, press the button, move to where it goes, release', 'P B P B'],
];

// ── One line of text ↔ one step ──
// Split a line at the first # that is not inside "quoted text".
function splitLine(line) {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === '#' && !q) return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }
  return [line.trim(), ''];
}
function classify(code) {
  const c = code.replace(/\s+/g, ' ').trim();
  const u = c.toUpperCase();
  let m;
  if (!c) return { kind: 'note' };
  if (u === 'P BB' || u === 'PBB' || u === 'P B B') return { kind: 'click' };
  if (u === 'P') return { kind: 'point' };
  if ((m = u.match(/^(\d+) ?K$/)) && Number(m[1]) > 0) return { kind: 'key', n: m[1] };
  if (u === 'K') return { kind: 'key', n: '1' };
  if ((m = c.match(/^"([^"]*)"$/))) return { kind: 'type', text: m[1] };
  if (u === 'H') return { kind: 'hands' };
  if (u === 'M') return { kind: 'think' };
  if ((m = u.match(/^R ?\( ?(\d+(?:\.\d+)?) ?\)$/))) return { kind: 'wait', secs: m[1] };
  if (u === 'P B P B' || u === 'PBPB') return { kind: 'drag' };
  return { kind: 'other', code: c };
}
export function readSteps(text) {
  return String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const [code, note] = splitLine(l);
    return { ...classify(code), note };
  });
}
const num = (v, int) => { const x = int ? parseInt(v, 10) : parseFloat(v); return Number.isFinite(x) && x >= 0 ? x : 0; };
export function codeOf(s) {
  switch (s.kind) {
    case 'click': return 'P BB';
    case 'point': return 'P';
    case 'key': { const n = Math.max(1, num(s.n, true)); return n > 1 ? `${n}K` : 'K'; }
    case 'type': return `"${String(s.text ?? '').replace(/["\n]/g, '')}"`;
    case 'hands': return 'H';
    case 'think': return 'M';
    case 'wait': return `R(${num(s.secs)})`;
    case 'drag': return 'P B P B';
    case 'other': return s.code ?? '';
    default: return '';
  }
}
// Notes line up in one column, as in the example.
export function writeSteps(steps) {
  const codes = steps.map(codeOf);
  const width = Math.max(0, ...codes.map((c, i) => (steps[i].note ? c.length : 0))) + 1;
  return steps.map((s, i) => {
    const note = String(s.note ?? '').replace(/\n/g, ' ').trim();
    if (!note) return codes[i];
    return codes[i] ? `${codes[i].padEnd(Math.max(width, codes[i].length + 1))}# ${note}` : `# ${note}`;
  }).join('\n');
}
const fresh = (kind) => ({ kind, n: '1', text: '', secs: '1', note: '' });

// ── Predicted time of each step, with the think steps the placement rules would add ──
// Each step is parsed on its own and its units are kept apart, so the rules see the same sequence as the whole text.
export function stepTimes(steps, k, auto) {
  const all = [], unitRow = new Map();
  let base = 0;
  steps.forEach((s, row) => {
    const ops = S.parseKlm(codeOf(s)).ops;
    let top = base;
    for (const o of ops) { const unit = o.unit + base; top = Math.max(top, unit); unitRow.set(unit, row); all.push({ ...o, unit, row }); }
    base = top + 1;
  });
  const placed = S.placeM(all);
  const rows = steps.map(() => ({ ops: [], rulesM: 0 }));
  // A think step the rules add belongs to the step it comes before (it carries that step's unit).
  for (const o of placed) if (o.auto) rows[unitRow.get(o.unit)].rulesM++;
  for (const o of auto ? placed : all) rows[o.row ?? unitRow.get(o.unit)].ops.push(o);
  return rows.map((r) => ({ secs: S.klmTime(r.ops, k).total, ops: shortOps(r.ops), rulesM: r.rulesM }));
}

// Runs of three or more of one operator are shown as a count, such as 21K.
function shortOps(ops) {
  const out = [];
  for (const o of ops) {
    const name = o.op === 'R' ? `R(${o.t})` : o.op, last = out[out.length - 1];
    if (last && last.name === name && o.op !== 'R') last.n++; else out.push({ name, n: 1 });
  }
  return out.flatMap(({ name, n }) => (n > 2 ? [`${n}${name}`] : Array(n).fill(name)));
}

// The operator text trims spaces, so a box keeps its own text while it has focus; otherwise "Q3 " would lose its space
// before the next letter arrives.
function Box({ value, onText, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input {...rest} value={draft ?? value} onFocus={() => setDraft(value)} onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onText(e.target.value); }} />
  );
}

const two = (x) => `${x.toFixed(2)} s`;

export function KlmHowTo() {
  return (
    <details className="kb-howto">
      <summary>How to write a KLM sequence</summary>
      <ol className="kb-steps">
        <li><b>Pick one routine task</b> done by someone who already knows how, such as "save a file under a new name". KLM times an expert who makes no mistakes.</li>
        <li><b>Write each thing the hands do, in order</b>, one step per line: <span className="kb-mono">P</span> point the mouse, <span className="kb-mono">B</span> press or release the mouse button (so a click is <span className="kb-mono">BB</span>), <span className="kb-mono">K</span> press a key, <span className="kb-mono">H</span> move a hand between keyboard and mouse.</li>
        <li><b>Shortcuts for typing:</b> <span className="kb-mono">5K</span> is five presses of a key, and <span className="kb-mono">"Q3 report"</span> counts one keystroke for each character, spaces included.</li>
        <li><b>Add waiting time</b> when the user has to wait for the screen: <span className="kb-mono">R(2)</span> is two seconds.</li>
        <li><b>Add thinking time</b> with <span className="kb-mono">M</span> (1.35 s), or leave "Place M for me" on and the calculator adds it by the standard rules: before each new pointing action and each new typed entry, but not between pointing at something and the key it leads to, and only once for a word or number typed in one go.</li>
        <li><b>Optional: notes.</b> Anything after <span className="kb-mono">#</span> is a note for you; the calculator ignores it.</li>
      </ol>
      <pre className="kb-annot">{`H             # ← move the hand to the mouse
P BB          # ← point at the File menu and click it
"Q3 report"   # ← type 9 characters = 9 keystrokes
K             # ← press Enter
R(0.5)        # ← wait half a second for the save`}</pre>
      <p className="kb-note">The form below writes this text for you if you would rather not type it.</p>
    </details>
  );
}

function StepFields({ s, i, set }) {
  if (s.kind === 'type') return <label className="kb-f kb-wide"><span>Text typed</span><Box value={s.text} onText={set('text')} placeholder="for example Q3 report" aria-label={`Step ${i + 1}: text typed`} /></label>;
  if (s.kind === 'key') return <label className="kb-f"><span>How many times</span><Box value={s.n} onText={set('n')} inputMode="numeric" aria-label={`Step ${i + 1}: how many key presses`} /></label>;
  if (s.kind === 'wait') return <label className="kb-f"><span>Seconds</span><Box value={s.secs} onText={set('secs')} inputMode="decimal" aria-label={`Step ${i + 1}: seconds to wait`} /></label>;
  if (s.kind === 'other') return <label className="kb-f kb-wide"><span>Operators</span><Box className="kb-code" value={s.code} onText={set('code')} aria-label={`Step ${i + 1}: operators`} /></label>;
  return null;
}

export default function KlmBuilder({ text, onChange, k, auto }) {
  const steps = readSteps(text);
  const times = stepTimes(steps, k, auto);
  const total = times.reduce((a, t) => a + t.secs, 0);
  const listRef = useRef(null);
  const [focus, setFocus] = useState(null);
  useEffect(() => {
    if (!focus || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-row="${focus.row}"] [data-act="${focus.act}"]`)
      || listRef.current.querySelector(`[data-row="${focus.row}"] select`)
      || listRef.current.querySelector('.kb-palette button');
    if (el) el.focus();
    setFocus(null);
  }, [focus]);

  const write = (next) => onChange(writeSteps(next));
  const change = (i, patch) => write(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i, d) => {
    const j = i + d; if (j < 0 || j >= steps.length) return;
    const next = [...steps]; [next[i], next[j]] = [next[j], next[i]];
    write(next);
    setFocus({ row: j, act: (j === 0 || j === steps.length - 1) ? (d < 0 ? 'down' : 'up') : d < 0 ? 'up' : 'down' });
  };
  const remove = (i) => { write(steps.filter((_, j) => j !== i)); setFocus({ row: Math.min(i, steps.length - 2), act: 'remove' }); };
  const add = (kind) => { write([...steps, fresh(kind)]); setFocus({ row: steps.length, act: 'first' }); };
  const insertThink = (i) => { write([...steps.slice(0, i), fresh('think'), ...steps.slice(i)]); setFocus({ row: i + 1, act: 'first' }); };
  const setKind = (i, kind) => { const s = steps[i]; change(i, { ...fresh(kind), note: s.note, text: s.text ?? '', n: s.n ?? '1', secs: s.secs ?? '1' }); };

  return (
    <div className="kb">
      {steps.length === 0 && <p className="kb-note">No steps yet. Add the first thing the user does with the buttons below.</p>}
      {steps.length > 0 && (
        <ol className="kb-list" ref={listRef}>
          {steps.map((s, i) => {
            const t = times[i];
            const set = (key) => (v) => change(i, { [key]: v });
            const prevThink = i > 0 && steps[i - 1].kind === 'think';
            const wantsM = t.rulesM > 0;
            return (
              <li className={`kb-step kb-s-${s.kind}`} key={i} data-row={i}>
                <div className="kb-row">
                  <span className="kb-n" aria-hidden="true">{i + 1}</span>
                  <label className="kb-f kb-kind"><span>Step {i + 1}</span>
                    <select value={s.kind} onChange={(e) => setKind(i, e.target.value)} data-act="first" aria-label={`Step ${i + 1}: what the user does`}>
                      {s.kind === 'other' && <option value="other">Written as operators</option>}
                      {s.kind === 'note' && <option value="note">Note only</option>}
                      {KINDS.map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}
                    </select>
                  </label>
                  <StepFields s={s} i={i} set={set} />
                  <label className="kb-f kb-wide"><span>Note <em>optional</em></span>
                    <Box value={s.note} onText={(v) => change(i, { note: v })} placeholder="what this step is for" aria-label={`Step ${i + 1}: note`} />
                  </label>
                  <div className="kb-tools">
                    <button type="button" className="kb-x" data-act="up" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>↑</button>
                    <button type="button" className="kb-x" data-act="down" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>↓</button>
                    <button type="button" className="kb-x kb-del" data-act="remove" onClick={() => remove(i)} aria-label={`Remove step ${i + 1}`}>×</button>
                  </div>
                </div>
                <div className="kb-meta">
                  <span className="kb-time"><b>{two(t.secs)}</b>{t.ops.length > 0 && <> · <span className="kb-mono">{t.ops.join(' ')}</span></>}</span>
                  <span className="kb-hint">{hintFor(s, t, auto, wantsM, prevThink)}</span>
                  {!auto && wantsM && !prevThink && s.kind !== 'think' && <button type="button" className="kb-add" onClick={() => insertThink(i)}>+ Add a think step before this</button>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="kb-palette" role="group" aria-label="Add a step">
        <span className="kb-note">Add a step:</span>
        {KINDS.map(([k2, l, what]) => <button key={k2} type="button" className="btn ghost small" title={what} onClick={() => add(k2)}>+ {l}</button>)}
      </div>
      {steps.length > 0 && <p className="kb-total">Total of the steps: <b>{two(total)}</b> ({steps.length} step{steps.length === 1 ? '' : 's'})</p>}
    </div>
  );
}

function hintFor(s, t, auto, wantsM, prevThink) {
  if (s.kind === 'note') return 'A note only: it takes no time.';
  if (s.kind === 'other') return 'Written as operators (K, P, B, H, M, R), so it is shown as written. Edit it here or in the text.';
  if (s.kind === 'think') return auto ? 'Ignored while "Place M for me" is on: the rules decide where thinking goes.' : 'Thinking time you placed: 1.35 s.';
  if (auto) return wantsM ? `Includes ${t.rulesM === 1 ? 'a think step' : `${t.rulesM} think steps`} (M, 1.35 s) added by the placement rules.` : '';
  if (wantsM) return prevThink ? 'Has the think step the rules would put here.' : 'The placement rules would put a think step (M) before this.';
  return '';
}

