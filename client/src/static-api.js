// Static stand-in for the Node API, used by the GitHub Pages build.
// It answers the same routes from the JSON files shipped beside the page.
import { recommend, shelve } from '../../server/lib/recommend.js';
import { listFields } from '../../server/lib/fields.js';

const base = import.meta.env.BASE_URL;
const files = {};
const load = (name) => (files[name] ||= fetch(`${base}data/${name}.json?v=${__DATA_VERSION__}`).then((r) => {
  if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
  return r.json();
}));

async function all() {
  const [methods, books, meta] = await Promise.all([load('methods'), load('books'), load('meta')]);
  return { methods, books, meta };
}

export async function staticGet(url) {
  const { methods, books, meta } = await all();
  if (url === '/api/meta') return { ...meta, counts: { methods: methods.length, books: books.length }, ai: false, static: true };
  if (url === '/api/methods') return methods.map(listFields);
  if (url === '/api/books') return books;
  const m = url.match(/^\/api\/methods\/([^/?#]+)$/);
  if (m) {
    const byId = new Map(methods.map((x) => [x.id, x]));
    const rec = byId.get(decodeURIComponent(m[1]));
    if (!rec) throw new Error('Method not found');
    const related = (rec.relatedIds || []).map((id) => byId.get(id)).filter(Boolean).map(listFields);
    const sourceBooks = (rec.bookIds || []).map((id) => books.find((b) => b.id === id)).filter(Boolean);
    return { ...rec, related, sourceBooks };
  }
  throw new Error(`Unknown route ${url}`);
}

export async function staticPost(url, data = {}) {
  const { methods } = await all();
  if (url === '/api/recommend') {
    const ranked = recommend(methods, data.answers || {}, data.brief || '', 30);
    const slim = (r) => ({ ...listFields(r.m), score: Math.round(r.score * 10) / 10, why: r.why });
    const { primary, lost, rest } = shelve(ranked);
    return { primary: primary.map(slim), lost: lost.map(slim), rest: rest.map(slim) };
  }
  if (url === '/api/brief') {
    throw new Error('The AI research direction needs the Node version of the site with an Anthropic API key. Download it from GitHub to use it. The matches below still work here.');
  }
  throw new Error(`Unknown route ${url}`);
}
