import { readFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { splitKinds } from './kinds.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

export const methods = load('methods.json');
export const books = load('books.json');
export const meta = load('meta.json');

// Research methods and design & product practices, kept apart (see kinds.js).
export const kinds = splitKinds(methods);
export const byId = kinds.byId;

// Reload in place when the data files change, so a running server picks up a data refresh without a restart.
// The exported objects keep their identity; only their contents are swapped.
function reload() {
  let next;
  try { next = { methods: load('methods.json'), books: load('books.json'), meta: load('meta.json') }; } catch { return; } // mid-copy: wait for the next event
  methods.splice(0, methods.length, ...next.methods);
  books.splice(0, books.length, ...next.books);
  for (const k of Object.keys(meta)) delete meta[k];
  Object.assign(meta, next.meta);
  const fresh = splitKinds(methods);
  kinds.research.splice(0, kinds.research.length, ...fresh.research);
  kinds.design.splice(0, kinds.design.length, ...fresh.design);
  for (const key of ['byId', 'researchById']) { kinds[key].clear(); for (const [id, m] of fresh[key]) kinds[key].set(id, m); }
  console.log(`Data reloaded: ${kinds.research.length} methods, ${kinds.design.length} design practices, ${books.length} books`);
}
let timer;
export function watchData() {
  watch(dir, () => { clearTimeout(timer); timer = setTimeout(reload, 1500); });
}

export { listFields } from './fields.js';
