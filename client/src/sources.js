// A method's sources in one list: the books in the atlas library (linked) first, then the other
// sources, without the exact or near repeats where a source string names one of those books again.

// Book titles and source strings compared without case, punctuation or a trailing "(Author, year)".
const norm = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const stripParens = (s) => { let t = s.trim(), prev; do { prev = t; t = t.replace(/\s*\([^()]*\)\s*$/, ''); } while (t !== prev && t); return t || s; };
// The ways one source string can name a book. Strict: whole, or without "(Author, year)".
// Loose: after an "Author, A.," prefix, before " — Author", or before a subtitle; a loose match also needs the book's author named.
function sourceKeys(src) {
  const strict = new Set([norm(src), norm(stripParens(src))]);
  const loose = new Set();
  const base = stripParens(src);
  loose.add(norm(base.split(/\s+[—–-]\s+/)[0]));
  const parts = base.split(', ');
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join(', ');
    loose.add(norm(tail));
    loose.add(norm(tail.split(': ')[0]));
  }
  return { strict, loose };
}
const surnames = (author = '') => norm(author).split(' ').filter((w) => w.length > 2 && !['and', 'eds', 'et', 'al'].includes(w));

// One list of sources: books in the library first (linked), then the other sources, without repeats.
export function mergeSources(books = [], sources = []) {
  const byKey = new Map();
  const looseByKey = new Map();
  const add = (map, k, b) => map.set(k, [...(map.get(k) || []), b]);
  for (const b of books) {
    const strict = new Set([norm(b.title), norm(stripParens(b.title))]);
    for (const k of strict) { add(byKey, k, b); add(looseByKey, k, b); }
    // "Qualitative Data Analysis (Miles & Huberman)" names "Qualitative Data Analysis: An Expanded Sourcebook".
    const short = norm(stripParens(b.title).split(': ')[0]);
    if (!strict.has(short)) add(looseByKey, short, b);
  }
  const seen = new Set();
  const out = books.map((b) => ({ key: `b:${b.id}`, book: b }));
  for (const s of sources) {
    const { strict, loose } = sourceKeys(s);
    if ([...strict].some((k) => byKey.has(k) || seen.has(k))) continue;
    const words = ` ${norm(s)} `;
    const looseHit = [...loose, ...strict].some((k) => (looseByKey.get(k) || []).some((b) => {
      const names = surnames(b.author);
      return !names.length || names.some((n) => words.includes(` ${n} `));
    }));
    if (looseHit) continue;
    for (const k of strict) seen.add(k);
    out.push({ key: `s:${s}`, text: s });
  }
  return out;
}
