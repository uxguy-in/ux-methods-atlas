// Reads a researcher's spoken description of their situation into the finder's answers (goal, material, people,
// time, evidence, who runs it), so the voice assistant can recommend methods without anyone filling in a form, and
// turns the matches into a short spoken reply. Keyword rules, not AI: every inference shows the words it came from
// and can be changed. Checked by server/scripts/check-voice.js.

// The conversation the assistant leads: one prompt per turn, each answer free speech.
export const TALK_STEPS = [
  { id: 'situation', ask: 'Tell me about the product and the problem you are seeing.', hint: 'What it is, who it is for, what is going wrong or what you are unsure about.' },
  { id: 'decision', ask: 'What do you need to find out, and what decision will it help you make?', hint: 'For example: why people drop out, which design to ship, what to build next.' },
  { id: 'people', ask: 'Who are your users, and how many of them can you reach?', hint: 'The kind of people, and whether you can talk to a few, survey hundreds, or only have analytics.' },
  { id: 'constraints', ask: 'How long do you have, and who will run the research?', hint: 'Hours, days, weeks or months; a designer, a PM, a researcher or a specialist.' },
];

// Each rule: an answer value and the phrases that point to it. Weights favour specific phrases over loose words.
const RULES = {
  goal: [
    ['why', 2, /\bwhy\b|motivat|reasons?\b|mental models?|how (?:they|people) (?:think|decide)|understand (?:our |the )?(?:users|customers|people|behaviou?r)/g],
    ['usability', 2, /usabilit|struggl|confus|stuck|hard to use|difficult to use|can'?t find|cannot find|friction|mistakes?|errors?\b|gets? lost|pain points?/g],
    ['attitudes', 2, /satisf|\btrust|perceiv|perception|sentiment|\bnps\b|net promoter|opinions?|how (?:they|people|users) feel/g],
    ['behaviour', 2, /analytics|engagement|retention|churn|usage|how often|drop(?:ping)?[- ]?offs?|drop(?:ping)? out|abandon|conversions?|funnel/g],
    ['compare', 2, /compar|versus|\bvs\.?\b|which (?:version|design|option|one)|(?:two|both|three) (?:\w+ )?(?:designs|versions|options|variants)|option a|\bbetter\b/g],
    ['impact', 3, /\bcaused?\b|impact of|\ba\/?b\b|split test|did (?:it|the redesign|the change) work|attribut|effect of (?:the|our)/g],
    ['predict', 3, /predict|before (?:we )?build|estimate (?:how long|the time|task time)|without users/g],
    ['prioritise', 2, /prioriti[sz]|roadmap|what to build|which features?|backlog|what (?:should we |to )?(?:do|fix|build) first|(?:fix|build|tackle) first|trade-?offs?/g],
    ['segments', 3, /segment|personas?|archetypes?|types of (?:users|customers|people)|different (?:kinds|groups) of (?:users|customers|people)/g],
    ['risk', 3, /\brisks?\b|safety|\bharm|compliance|regulat|dark patterns?|failure modes?|accessib/g],
    ['ia', 3, /navigation|\bmenus?\b|information architecture|\blabels?\b|findab|card sort|categor(?:y|ies|ise)|tree test/g],
    ['synthesis', 3, /transcripts|support tickets|existing data|data (?:we|i) (?:already )?have|already have (?:the )?(?:data|interviews|feedback|responses)|survey (?:responses|answers)|make sense of/g],
    ['explore', 2, /new (?:market|domain|space|audience|area)|don'?t know (?:much|anything|where)|explor|discovery|unknown/g],
    ['ideas', 2, /\bideas?\b|co-?design|workshops?|brainstorm|futures?\b|concepts? to try/g],
    ['share', 2, /stakeholders?|convince|buy-?in|\breport\b|get (?:the team|leadership) aligned|align/g],
  ],
  material: [
    ['live', 2, /\blive\b|launched|in production|already (?:shipped|out)|our (?:app|site|website|product|platform|service)|current (?:app|site|product|version)|people (?:are )?using|redesign(?:ed)?/g],
    ['prototype', 3, /prototype|figma|mock-?ups?|wireframes?|designs? (?:are )?ready|clickable/g],
    ['concept', 2, /\bconcepts?\b|sketch|early (?:idea|stage)|just an idea|storyboard/g],
    ['none', 3, /nothing (?:is )?built|haven'?t built|not built (?:anything|it) yet|from scratch|no product yet/g],
    ['data', 2, /we have (?:lots of |some )?(?:data|analytics|logs|tickets|transcripts)|existing data|data (?:we|i) (?:already )?have/g],
  ],
  participants: [
    ['none', 3, /no (?:users|access|participants|customers)|can'?t (?:reach|talk to|access) (?:any )?(?:users|customers|people)|just the team|only the team/g],
    ['few', 2, /a few (?:users|people|customers|participants)|handful|a couple of|small (?:number|group)|\b(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve|[3-9]|1[0-2]) (?:users|people|customers|participants|interviews)|(?:talk to|interview|speak to|reach|get hold of) (?:about |maybe |probably |around |only )?(?:three|four|five|six|seven|eight|nine|ten|eleven|twelve|[3-9]|1[0-2])\b/g],
    ['moderate', 2, /dozens?|\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|[2-9]\d|1[3-9]) (?:users|people|customers|participants|respondents)|a (?:decent|reasonable) (?:number|sample)/g],
    ['large', 2, /hundreds|thousands|millions|\b\d{3,}[\d,]* (?:users|people|customers|respondents)|large (?:sample|number|user base)|survey (?:them|our users|everyone)/g],
    ['logs', 2, /only (?:have )?analytics|just analytics|logs|tracking data|event data/g],
  ],
  time: [
    ['hours', 3, /\btoday\b|by tonight|\bhours?\b|this afternoon|tomorrow/g],
    ['days', 2, /\bdays?\b|this week|next week|a week\b|one week|\bsprint\b/g],
    ['weeks', 2, /\bweeks\b|a month\b|one month|couple of weeks|few weeks/g],
    ['months', 2, /\bmonths\b|a quarter|this quarter|half a year|a year\b|long[- ]term/g],
  ],
  data: [
    ['mixed', 3, /\bboth\b|mixed methods|numbers and stories|qual and quant/g],
    ['quantitative', 2, /numbers|quantitative|\bquant\b|statistic|significan|metrics|percentages?/g],
    ['qualitative', 2, /stories|qualitative|\bqual\b|in depth|in-depth|quotes/g],
  ],
  level: [
    ['newcomer', 2, /\bi'?m a (?:designer|product manager|\bpm\b|developer|founder)|\bdesigners?\b|product managers?|\bpms?\b|new to research|junior|first time|never done research|developers?|founders?/g],
    ['mid', 2, /\b(?:a|our|the) (?:ux )?researchers?\b|research team|mid-?level|i'?m a (?:ux )?researcher/g],
    ['expert', 3, /senior researcher|statistician|data scientists?|specialist|phd|quant(?:itative)? researcher|research lead/g],
  ],
};

// Finds the answers a piece of speech points to. Returns the chosen answers and, for each, the words that led to it.
export function understand(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, "'")} `;
  const sel = {}, because = {};
  for (const [q, rules] of Object.entries(RULES)) {
    const scored = rules.map(([v, w, re]) => {
      const hits = [...t.matchAll(re)].map((m) => m[0].trim());
      return { v, score: hits.length * w, hits };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) continue;
    if (q === 'goal') {
      const keep = scored.slice(0, 2).filter((x, i) => i === 0 || x.score >= scored[0].score / 2);
      sel.goal = keep.map((x) => x.v);
      because.goal = [...new Set(keep.flatMap((x) => x.hits))].slice(0, 4);
    } else {
      sel[q] = scored[0].v;
      because[q] = [...new Set(scored[0].hits)].slice(0, 3);
    }
  }
  // "Logs" as the only access implies live data to work with.
  if (sel.participants === 'logs' && !sel.material) { sel.material = 'data'; because.material = because.participants; }
  return { sel, because };
}

// The whole conversation as one brief, labelled by turn, for the AI research direction and the finder.
export function composeBrief(answers) {
  return TALK_STEPS.map((s, i) => [s, String(answers[i] || '').trim()])
    .filter(([, a]) => a)
    .map(([s, a]) => `${s.ask} ${a}`)
    .join('\n\n');
}

const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// A short spoken reply from the matched methods: what it understood, where to start, what to add for rigour.
// `labels` maps finder answers to their option labels; `methods` are best first; `extra` is a lost or borrowed method.
export function adviceText({ goalLabels = [], timeLabel = '', methods = [], extra = null, libraryQuestion = '' }) {
  const parts = [];
  if (goalLabels.length) parts.push(`It sounds like you need to ${goalLabels.map(lc).join(', and ')}${timeLabel ? `, with ${lc(timeLabel)} to do it` : ''}.`);
  else parts.push('Here is where I would start.');
  if (libraryQuestion) parts.push(`The closest question teams usually ask is: ${libraryQuestion}`);
  const why = typeof methods[0]?.why === 'string' ? methods[0].why.trim() : '';
  if (methods[0]) parts.push(`Start with ${methods[0].name}${why ? `. ${why.replace(/\.?$/, '.')}` : '.'}`);
  if (methods[1]) parts.push(`Then ${methods[1].name}${methods[2] ? `, and ${methods[2].name} if you have time.` : '.'}`);
  if (extra) parts.push(`For more rigour, look at ${extra.name}, a method most teams have forgotten.`);
  if (!methods.length) parts.push('I could not match methods to that yet. Tell me a little more about what you need to find out.');
  return parts.join(' ');
}
