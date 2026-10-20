import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));

export const methods = load('methods.json');
export const books = load('books.json');
export const meta = load('meta.json');
export const byId = new Map(methods.map((m) => [m.id, m]));

export { listFields } from './fields.js';
