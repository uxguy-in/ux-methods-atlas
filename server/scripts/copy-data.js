// Copies the atlas data next to the static Pages build, which reads it in the browser.
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, process.argv[2] || 'site', 'data');
mkdirSync(out, { recursive: true });
for (const f of ['methods.json', 'books.json', 'meta.json']) cpSync(path.join(root, 'server', 'data', f), path.join(out, f));
console.log(`Copied data to ${path.relative(root, out)}`);
