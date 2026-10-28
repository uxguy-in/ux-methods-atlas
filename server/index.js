import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { books, meta, byId, kinds, listFields, watchData } from './lib/data.js';
import { booksPayload, metaPayload, methodPayload } from './lib/kinds.js';
import { shelvesPayload } from './lib/recommend.js';
import { generateBrief, DEFAULT_MODEL } from './lib/brief.js';

const MODEL = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/meta', (_req, res) => {
  res.json({ ...metaPayload(meta, kinds, books), ai: aiAvailable() });
});

// The atlas lists research methods only; design & product practices have their own list.
app.get('/api/methods', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(kinds.research.map(listFields));
});

app.get('/api/design', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(kinds.design.map(listFields));
});

app.get('/api/methods/:id', (req, res) => {
  const m = byId.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Method not found' });
  res.json(methodPayload(m, byId, books));
});

app.get('/api/books', (_req, res) => res.json(booksPayload(books, byId)));

app.post('/api/recommend', (req, res) => {
  const { answers = {}, brief = '', seed = 1, exclude = [] } = req.body || {};
  res.json(shelvesPayload(kinds.research, answers, brief, seed, Array.isArray(exclude) ? exclude.slice(0, 200) : []));
});

app.post('/api/brief', async (req, res) => {
  const { answers = {}, brief = '' } = req.body || {};
  if (!brief || brief.trim().length < 20) return res.status(400).json({ error: 'Write a few sentences about the problem first.' });
  // A visitor's own key (sent per request, never stored or logged) is used when the server has none.
  const visitorKey = String(req.get('x-visitor-api-key') || '').trim();
  if (!aiAvailable() && !visitorKey) {
    return res.status(503).json({ error: 'Add your own Anthropic API key to use the AI research direction. The rule-based matches still work.', needsKey: true });
  }
  try {
    const client = aiAvailable() ? new Anthropic() : new Anthropic({ apiKey: visitorKey });
    res.json(await generateBrief(client, kinds.research, kinds.researchById, { answers, brief }, MODEL));
  } catch (err) {
    console.error(err instanceof Anthropic.APIError ? `Anthropic API error ${err.status}` : err);
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited by the API. Try again in a minute.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(401).json({ error: 'The API key was rejected.', needsKey: !aiAvailable() });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `API error: ${err.message}` });
    res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
  }
});

// Serve the built client in production.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

watchData();
const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`UX Methods Atlas on http://localhost:${port} (AI brief ${aiAvailable() ? 'on' : 'off'})`));
