import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { methods, books, meta, byId, listFields } from './lib/data.js';
import { recommend, shelve } from './lib/recommend.js';
import { generateBrief, aiAvailable } from './lib/brief.js';

const app = express();
app.use(express.json({ limit: '200kb' }));

app.get('/api/meta', (_req, res) => {
  res.json({ ...meta, counts: { methods: methods.length, books: books.length }, ai: aiAvailable() });
});

app.get('/api/methods', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(methods.map(listFields));
});

app.get('/api/methods/:id', (req, res) => {
  const m = byId.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Method not found' });
  const related = (m.relatedIds || []).map((id) => byId.get(id)).filter(Boolean).map(listFields);
  const sourceBooks = (m.bookIds || []).map((id) => books.find((b) => b.id === id)).filter(Boolean);
  res.json({ ...m, related, sourceBooks });
});

app.get('/api/books', (_req, res) => res.json(books));

app.post('/api/recommend', (req, res) => {
  const { answers = {}, brief = '' } = req.body || {};
  const ranked = recommend(methods, answers, brief, 30);
  const slim = (r) => ({ ...listFields(r.m), score: Math.round(r.score * 10) / 10, why: r.why });
  const { primary, lost, rest } = shelve(ranked);
  res.json({ primary: primary.map(slim), lost: lost.map(slim), rest: rest.map(slim) });
});

app.post('/api/brief', async (req, res) => {
  const { answers = {}, brief = '' } = req.body || {};
  if (!brief || brief.trim().length < 20) return res.status(400).json({ error: 'Write a few sentences about the problem first.' });
  if (!aiAvailable()) {
    return res.status(503).json({ error: 'The AI brief needs ANTHROPIC_API_KEY set on the server. The rule-based recommendations still work.' });
  }
  try {
    res.json(await generateBrief(methods, byId, { answers, brief }));
  } catch (err) {
    console.error(err);
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Rate limited by the API. Try again in a minute.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(401).json({ error: 'The API key was rejected.' });
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

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`UX Methods Atlas on http://localhost:${port} (AI brief ${aiAvailable() ? 'on' : 'off'})`));
