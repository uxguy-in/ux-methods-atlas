// Static stand-in for the Node API, used by the GitHub Pages build.
// It answers the same routes from the JSON files shipped beside the page.
import { shelvesPayload } from '../../server/lib/recommend.js';
import { buildPlan } from '../../server/lib/plan.js';
import { listFields } from '../../server/lib/fields.js';
import { booksPayload, metaPayload, methodPayload, splitKinds } from '../../server/lib/kinds.js';
import { getVisitorKey } from './visitor-key.js';

const base = import.meta.env.BASE_URL;
const files = {};
const load = (name) => (files[name] ||= fetch(`${base}data/${name}.json?v=${__DATA_VERSION__}`).then((r) => {
  if (!r.ok) throw new Error(`Could not load ${name} (${r.status})`);
  return r.json();
}));

let ready;
function all() {
  return (ready ||= Promise.all([load('methods'), load('books'), load('meta')]).then(([methods, books, meta]) => {
    const kinds = splitKinds(methods);
    return { kinds, books, meta, bookList: booksPayload(books, kinds.byId) };
  }).catch((e) => { ready = null; throw e; }));
}

export async function staticGet(url) {
  const { kinds, books, meta, bookList } = await all();
  if (url === '/api/meta') return { ...metaPayload(meta, kinds, books), ai: false, static: true };
  // The atlas lists research methods only; design & product practices have their own list.
  if (url === '/api/methods') return kinds.research.map(listFields);
  if (url === '/api/design') return kinds.design.map(listFields);
  if (url === '/api/books') return bookList;
  const m = url.match(/^\/api\/methods\/([^/?#]+)$/);
  if (m) {
    const rec = kinds.byId.get(decodeURIComponent(m[1]));
    if (!rec) throw new Error('Method not found');
    return methodPayload(rec, kinds.byId, books);
  }
  throw new Error(`Unknown route ${url}`);
}

export async function staticPost(url, data = {}) {
  const { kinds } = await all();
  if (url === '/api/recommend') {
    return shelvesPayload(kinds.research, data.answers || {}, data.brief || '', data.seed || 1, data.exclude || []);
  }
  if (url === '/api/plan') return buildPlan(kinds.research, kinds.researchById, data.input || {});
  if (url === '/api/brief') {
    // No server here, so the browser calls Anthropic directly with the visitor's own key.
    const key = getVisitorKey();
    if (!key) throw Object.assign(new Error('Add your own Anthropic API key to use the AI research direction.'), { needsKey: true });
    if (!data.brief || data.brief.trim().length < 20) throw new Error('Write a few sentences about the problem first.');
    const [{ default: Anthropic }, { generateBrief }] = await Promise.all([import('@anthropic-ai/sdk'), import('../../server/lib/brief.js')]);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    try {
      return await generateBrief(client, kinds.research, kinds.researchById, data);
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
