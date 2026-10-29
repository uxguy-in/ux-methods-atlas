// Copies the atlas data next to the static Pages build, which reads it in the browser.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicBook } from '../lib/kinds.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, process.argv[2] || 'site', 'data');
mkdirSync(out, { recursive: true });
for (const f of ['methods.json', 'meta.json']) cpSync(path.join(root, 'server', 'data', f), path.join(out, f));
// The published books leave out the source spreadsheet's personal reading status.
const books = JSON.parse(readFileSync(path.join(root, 'server', 'data', 'books.json'), 'utf8')).map(publicBook);
writeFileSync(path.join(out, 'books.json'), JSON.stringify(books));
console.log(`Copied data to ${path.relative(root, out)}`);
