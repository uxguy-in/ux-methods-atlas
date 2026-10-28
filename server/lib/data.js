import { readFileSync } from 'node:fs';
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

export { listFields } from './fields.js';
