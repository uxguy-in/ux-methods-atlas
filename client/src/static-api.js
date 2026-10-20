// Static stand-in for the Node API, used by the GitHub Pages build.
// It answers the same routes from the JSON files shipped beside the page.
import { shelvesPayload } from '../../server/lib/recommend.js';
import { listFields } from '../../server/lib/fields.js';
import { getVisitorKey } from './visitor-key.js';

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
    return shelvesPayload(methods, data.answers || {}, data.brief || '', data.seed || 1, data.exclude || []);
  }
  if (url === '/api/brief') {
    // No server here, so the browser calls Anthropic directly with the visitor's own key.
    const key = getVisitorKey();
    if (!key) throw Object.assign(new Error('Add your own Anthropic API key to use the AI research direction.'), { needsKey: true });
    if (!data.brief || data.brief.trim().length < 20) throw new Error('Write a few sentences about the problem first.');
    const [{ default: Anthropic }, { generateBrief }] = await Promise.all([import('@anthropic-ai/sdk'), import('../../server/lib/brief.js')]);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      return await generateBrief(client, methods, new Map(methods.map((x) => [x.id, x])), data);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Anthropic rejected that API key. Check it and try again.'), { needsKey: true });
      if (err instanceof Anthropic.RateLimitError) throw new Error('Your Anthropic account is rate limited. Try again in a minute.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('Your API key does not have access to this model. Check your Anthropic account.');
      if (err instanceof Anthropic.APIError) throw new Error(`Anthropic API error: ${err.message}`);
      throw err;
    }
  }
  throw new Error(`Unknown route ${url}`);
}
