import { useEffect, useMemo, useRef, useState } from 'react';

// A form for describing a site without writing the sitemap text by hand: a tree of pages and a list of cross-links.
// It reads the current text and writes every edit straight back to it, so the form and the text always match. The
// reading below mirrors parseGraph in cogia-graph.js (same link, comment and indent rules); the analysis itself still
// runs on the text.

const EDGE = /^\s*(\S.*?)\s*(?:->|→|=>|\t)\s*(\S.*?)\s*$/;
const BULLET = /^[-*•+]\s+|^\d+(\.\d+)*[.)]?\s+/;
const LINKS_NOTE = '# Cross-links (from -> to)';
export const STARTER = 'Home\n  Products\n  Help\n  About us';

const pageName = (raw) => raw.trim().replace(BULLET, '').trim();
const key = (s) => s.trim().toLowerCase();

// Text → { notes (comments before the sitemap), rows [{ name, depth }], mid (other comments), links [{ from, to }] }.
export function readSite(text) {
  const notes = [], mid = [], rows = [], links = [];
  const stack = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { (rows.length || links.length ? mid : notes).push(t); continue; }
    const m = line.match(EDGE);
    if (m) { links.push({ from: pageName(m[1]), to: pageName(m[2]) }); continue; }
    if (/->|→|=>/.test(line)) continue;
    const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    while (stack.length && stack[stack.length - 1] >= indent) stack.pop();
    rows.push({ name: pageName(line), depth: stack.length });
    stack.push(indent);
  }
  return { notes, rows, mid, links };
}

export function writeSite({ notes, rows, mid, links }) {
  const out = [...notes, ...rows.map((r) => `${'  '.repeat(r.depth)}${r.name}`)];
  if (links.length || mid.length) out.push(...(mid.length ? mid : [LINKS_NOTE]));
  out.push(...links.map((l) => `${l.from} -> ${l.to}`));
  return out.join('\n');
}

// Characters that would turn a page name into a link, a comment or nothing at all.
const tidy = (v) => v.replace(/->|→|=>|\t/g, ' ').replace(/^\s*#+/, '').trim() || 'Untitled page';
// The row after the last page under row i.
const subtreeEnd = (rows, i) => { let j = i + 1; while (j < rows.length && rows[j].depth > rows[i].depth) j++; return j; };
const parentOf = (rows, i) => { for (let j = i - 1; j >= 0; j--) if (rows[j].depth < rows[i].depth) return j; return -1; };
const freshName = (taken) => { let n = 'New page', k = 1; while (taken.has(key(n))) n = `New page ${++k}`; return n; };

// The text trims spaces, so a box keeps its own text while it has focus; otherwise "Gift " would lose its space
// before the next letter arrives.
function Box({ value, onText, onFocus, ...rest }) {
  const [draft, setDraft] = useState(null);
  return (
    <input {...rest} value={draft ?? value} onFocus={() => { setDraft(value); onFocus?.(); }} onBlur={() => setDraft(null)}
      onChange={(e) => { setDraft(e.target.value); onText(e.target.value); }} />
  );
}

function PageSelect({ value, pages, onChange, label }) {
  return (
    <label className="ib-pick"><span className="ib-sr">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {pages.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
  );
}

export default function IaGraphBuilder({ text, onChange }) {
  const site = useMemo(() => readSite(text), [text]);
  const { rows } = site;
  // One spelling per page (the first one seen), as the analysis matches names regardless of case.
  const canon = new Map();
  for (const r of rows) if (!canon.has(key(r.name))) canon.set(key(r.name), r.name);
  for (const l of site.links) for (const n of [l.from, l.to]) if (!canon.has(key(n))) canon.set(key(n), n);
  const pages = [...canon.values()];
  const links = site.links.map((l) => ({ from: canon.get(key(l.from)), to: canon.get(key(l.to)) }));

  const root = useRef(null);
  const focusNext = useRef(null);
  const rename = useRef(null);
  useEffect(() => {
    const f = focusNext.current; focusNext.current = null;
    if (f && root.current) root.current.querySelector(f)?.focus();
  }, [text]);

  const write = (next, focus) => { focusNext.current = focus ?? null; onChange(writeSite({ ...site, links, ...next })); };
  const copyRows = () => rows.map((r) => ({ ...r }));

  // While a name box has focus, the cross-links that pointed at that page follow it as it is renamed.
  const startRename = (i) => {
    const k = key(rows[i].name);
    const unique = rows.filter((r) => key(r.name) === k).length === 1;
    rename.current = { i, follow: unique ? links.map((l) => [key(l.from) === k, key(l.to) === k]) : null };
  };
  const setName = (i) => (v) => {
    const rs = copyRows(); rs[i].name = tidy(v);
    const fol = rename.current?.i === i ? rename.current.follow : null;
    const ls = links.map((l, j) => (fol?.[j] ? { from: fol[j][0] ? rs[i].name : l.from, to: fol[j][1] ? rs[i].name : l.to } : l));
    write({ rows: rs, links: ls });
  };
  const addChild = (i) => {
    const rs = copyRows(); const at = subtreeEnd(rs, i);
    rs.splice(at, 0, { name: freshName(canon), depth: rs[i].depth + 1 });
    write({ rows: rs }, `[data-row="${at}"] input`);
  };
  const addBelow = (i) => {
    const rs = copyRows(); const at = subtreeEnd(rs, i);
    rs.splice(at, 0, { name: freshName(canon), depth: rs[i].depth });
    write({ rows: rs }, `[data-row="${at}"] input`);
  };
  const remove = (i) => {
    const rs = copyRows(); const end = subtreeEnd(rs, i);
    const gone = rs.splice(i, end - i).map((r) => key(r.name));
    const left = new Set(rs.map((r) => key(r.name)));
    const dropped = new Set(gone.filter((k) => !left.has(k)));
    const ls = links.filter((l) => !dropped.has(key(l.from)) && !dropped.has(key(l.to)));
    const focus = rs.length ? `[data-row="${Math.min(i, rs.length - 1)}"] input` : null;
    write({ rows: rs, links: ls }, focus);
  };
  // Move in: the page (with everything under it) goes under the page above it at the same level.
  const canIndent = (i) => i > 0 && rows[i - 1].depth >= rows[i].depth;
  const indent = (i) => {
    const rs = copyRows(); const end = subtreeEnd(rs, i);
    for (let j = i; j < end; j++) rs[j].depth++;
    write({ rows: rs }, `[data-row="${i}"] [data-act="in"]`);
  };
  // Move out: the page (with everything under it) goes up a level, just after its parent's branch.
  const outdent = (i) => {
    const rs = copyRows(); const end = subtreeEnd(rs, i); const p = parentOf(rs, i);
    const block = rs.splice(i, end - i).map((r) => ({ ...r, depth: r.depth - 1 }));
    const at = subtreeEnd(rs, p);
    rs.splice(at, 0, ...block);
    write({ rows: rs }, `[data-row="${at}"] [data-act="out"]`);
  };

  const addLink = () => {
    const from = pages[0], to = pages.find((p) => p !== from) ?? from;
    write({ links: [...links, { from, to }] }, `[data-link="${links.length}"] select`);
  };
  const setLink = (j, end) => (v) => write({ links: links.map((l, k) => (k === j ? { ...l, [end]: v } : l)) });
  const removeLink = (j) => {
    const ls = links.filter((_, k) => k !== j);
    write({ links: ls }, ls.length ? `[data-link="${Math.min(j, ls.length - 1)}"] select` : '[data-act="add-link"]');
  };

  if (!rows.length && !links.length) {
    return (
      <div className="ib">
        <p className="cg-note">There are no pages yet.</p>
        <button type="button" className="btn ghost small" onClick={() => onChange(STARTER)}>Start a sitemap</button>
      </div>
    );
  }

  // Rows grouped into a nested list so screen readers announce the levels. A render function, not a component, so
  // the inputs keep focus while typing.
  const kidsOf = (i) => { const out = []; for (let j = i + 1, end = subtreeEnd(rows, i); j < end; j = subtreeEnd(rows, j)) out.push(j); return out; };
  const tops = []; for (let j = 0; j < rows.length; j = subtreeEnd(rows, j)) tops.push(j);
  const row = (i) => {
    const r = rows[i], kids = kidsOf(i), p = parentOf(rows, i);
    const under = subtreeEnd(rows, i) - i - 1;
    const role = p < 0 ? (i === 0 ? 'Top page (usually home)' : 'Another top-level page') : `Under ${rows[p].name}`;
    return (
      <li key={i} className="ib-node" data-row={i}>
        <div className="ib-row">
          <span className={`ib-dot${p < 0 ? ' top' : ''}`} aria-hidden="true" />
          <label className="ib-label"><span className="ib-sr">Page name</span>
            <Box value={r.name} onText={setName(i)} onFocus={() => startRename(i)} aria-label={`Page name (${role.toLowerCase()})`} />
          </label>
          <div className="ib-tools">
            <button type="button" className="ib-btn" data-act="out" onClick={() => outdent(i)} disabled={p < 0} aria-label={`Move ${r.name} out a level`} title="Move out a level">← Out</button>
            <button type="button" className="ib-btn" data-act="in" onClick={() => indent(i)} disabled={!canIndent(i)} aria-label={`Move ${r.name} in, under the page above`} title="Move in, under the page above">In →</button>
            <button type="button" className="ib-btn ib-x" onClick={() => remove(i)} aria-label={`Remove ${r.name}${under ? ` and the ${under} page${under === 1 ? '' : 's'} under it` : ''}`} title="Remove">×</button>
          </div>
        </div>
        <div className="ib-meta">
          <span className="ib-role">{role}{under ? ` · ${under} page${under === 1 ? '' : 's'} under it` : ''}</span>
          <button type="button" className="ib-add" onClick={() => addChild(i)}>+ Add a child page</button>
          <button type="button" className="ib-add" onClick={() => addBelow(i)}>+ Add a page below</button>
        </div>
        {kids.length > 0 && <ul className="ib-kids">{kids.map(row)}</ul>}
      </li>
    );
  };

  const inTree = new Set(rows.map((r) => key(r.name)));
  const extra = pages.filter((p) => !inTree.has(key(p)));
  return (
    <div className="ib" ref={root}>
      <section className="ib-part" aria-labelledby="ib-h-tree">
        <h3 className="ib-h" id="ib-h-tree">Sitemap</h3>
        <p className="cg-note">Each page links to the pages listed under it. Use <b>In →</b> and <b>← Out</b> to change what sits under what.</p>
        {rows.length
          ? <ul className="ib-tree">{tops.map(row)}</ul>
          : <button type="button" className="ib-add" onClick={() => write({ rows: [{ name: freshName(canon), depth: 0 }] }, '[data-row="0"] input')}>+ Add a page</button>}
      </section>
      <section className="ib-part" aria-labelledby="ib-h-links">
        <h3 className="ib-h" id="ib-h-links">Cross-links ({links.length})</h3>
        <p className="cg-note">Links that do not follow the sitemap, such as a "Basket" button on every product page or a "Contact us" link in the help pages. Pick the page the link is on, then the page it goes to.</p>
        {links.length > 0 && (
          <ul className="ib-links">
            {links.map((l, j) => (
              <li key={j} className="ib-link" data-link={j}>
                <PageSelect value={l.from} pages={pages} onChange={setLink(j, 'from')} label={`Cross-link ${j + 1}: from page`} />
                <span className="ib-arrow" aria-hidden="true">→</span>
                <PageSelect value={l.to} pages={pages} onChange={setLink(j, 'to')} label={`Cross-link ${j + 1}: to page`} />
                <button type="button" className="ib-btn ib-x" onClick={() => removeLink(j)} aria-label={`Remove the cross-link from ${l.from} to ${l.to}`} title="Remove">×</button>
                {l.from === l.to && <span className="ib-warn">A page linking to itself is ignored.</span>}
              </li>
            ))}
          </ul>
        )}
        {pages.length > 1 && <button type="button" className="ib-add" data-act="add-link" onClick={addLink}>+ Add a cross-link</button>}
        {extra.length > 0 && <p className="cg-note">Only in cross-links, not in the sitemap: {extra.join(', ')}. Add them to the sitemap to place them in the hierarchy.</p>}
      </section>
    </div>
  );
}
