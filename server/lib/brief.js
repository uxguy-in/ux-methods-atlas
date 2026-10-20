import Anthropic from '@anthropic-ai/sdk';
import { recommend, tokenize, textScore } from './recommend.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

const SYSTEM = `You are a senior research methodologist advising a UX team. You know the full history of research methods,
including rigorous methods that UX has lost and methods borrowed from epidemiology, econometrics, human factors,
cognitive science, linguistics, systems engineering, physics and other fields.

The team has described a problem. Turn it into a research direction:
- Reframe the problem as the decision it must inform, and name the real unknowns.
- Write sharp research questions (a mix of "why", "how much" and "what would change if" questions where relevant).
- Recommend a sequenced plan using ONLY methods from the catalogue supplied, referenced by their exact id. Favour the
  simplest methods that answer the questions credibly, then show where a lost or borrowed method adds rigour that
  ordinary "talk to users and report" research would miss.
- Be honest about what each method cannot tell them, and respect their stated time, access and expertise.
Write in plain, direct British English. No hype.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reframedProblem', 'decision', 'researchQuestions', 'assumptionsToTest', 'plan', 'lostMethodPicks', 'watchOuts', 'successCriteria'],
  properties: {
    reframedProblem: { type: 'string' },
    decision: { type: 'string' },
    researchQuestions: { type: 'array', items: { type: 'string' } },
    assumptionsToTest: { type: 'array', items: { type: 'string' } },
    plan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['phase', 'methodId', 'why', 'how', 'output'],
        properties: {
          phase: { type: 'string' },
          methodId: { type: 'string' },
          why: { type: 'string' },
          how: { type: 'string' },
          output: { type: 'string' },
        },
      },
    },
    lostMethodPicks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['methodId', 'why'],
        properties: { methodId: { type: 'string' }, why: { type: 'string' } },
      },
    },
    watchOuts: { type: 'array', items: { type: 'string' } },
    successCriteria: { type: 'array', items: { type: 'string' } },
  },
};

function candidates(methods, answers, brief) {
  const fromAnswers = recommend(methods, answers, brief, 45).map((r) => r.m);
  const words = tokenize(brief);
  const fromText = methods
    .map((m) => ({ m, s: textScore(m, words) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 35)
    .map((x) => x.m);
  const seen = new Set();
  return [...fromAnswers, ...fromText].filter((m) => (seen.has(m.id) ? false : seen.add(m.id))).slice(0, 70);
}

const catalogueLine = (m) => ({
  id: m.id,
  name: m.name,
  family: m.family,
  status: m.status,
  summary: m.summary,
  useWhen: m.useWhen,
  avoidWhen: m.avoidWhen,
  facets: m.facets,
});

export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function generateBrief(methods, byId, { answers = {}, brief = '' }) {
  const pool = candidates(methods, answers, brief);
  const client = new Anthropic();

  const user = `Problem brief from the team:
"""
${brief.trim()}
"""

Their answers to the finder questions (JSON): ${JSON.stringify(answers)}

Method catalogue (choose only from these ids):
${JSON.stringify(pool.map(catalogueLine))}

Give 3 to 6 plan steps in the order they should run, and 2 to 4 lost or borrowed methods worth adding.`;

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('The model declined this brief. Try rephrasing it.'), { status: 422 });
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const out = JSON.parse(text);

  // Drop any method id the model invented; attach the record summaries the UI needs.
  const attach = (id) => {
    const m = byId.get(id);
    return m && { id: m.id, name: m.name, family: m.family, status: m.status, summary: m.summary };
  };
  out.plan = out.plan.filter((p) => byId.has(p.methodId)).map((p) => ({ ...p, method: attach(p.methodId) }));
  out.lostMethodPicks = out.lostMethodPicks.filter((p) => byId.has(p.methodId)).map((p) => ({ ...p, method: attach(p.methodId) }));
  out.model = response.model;
  return out;
}
