// Checks the voice tool's pure helpers (client/src/voice/voice-core.js): filler removal, Whisper windows, paragraphs,
// transcript text the coding workbench can split, and that every model id names a browser-ready Whisper model.
import assert from 'node:assert/strict';
import * as V from '../../client/src/voice/voice-core.js';
import { prepare } from '../../client/src/calc/tools/qual-core.js';
import * as U from '../../client/src/voice/voice-understand.js';
import { readFileSync } from 'node:fs';
// The finder's questions live in a JSX page; read each question's option values from its source.
const finderSrc = readFileSync(new URL('../../client/src/pages/Finder.jsx', import.meta.url), 'utf8');
const optionsOf = (q) => { const i = finderSrc.indexOf(`id: '${q}'`); const j = finderSrc.indexOf('\n  },', i); return [...finderSrc.slice(i, j).matchAll(/\{ v: '([^']+)'/g)].map((m) => m[1]); };

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
ok(V.cleanSpeech('Um, so, like, how many users do we, you know, need need for a usability test?') === 'How many users do we need for a usability test?', 'fillers');
ok(V.cleanSpeech('[Music] Okay, why are people, I mean, dropping off at sign up?') === 'Why are people dropping off at sign up?', 'fillers 2');
ok(V.cleanSpeech('I like the new design') === 'I like the new design', 'keeps a meaningful like');
ok(V.chunkCount(10) === 1 && V.chunkCount(30) === 1 && V.chunkCount(31) === 2 && V.chunkCount(70) === 3, 'chunks');
ok(V.stamp(65) === '01:05' && V.stamp(3725) === '1:02:05', 'stamp');
const paras = V.toParagraphs([{ start: 0, end: 3, text: ' Tell me about it.' }, { start: 4.5, end: 9, text: ' I tried to sign up.' }, { start: 9.2, end: 12, text: ' Then I gave up.' }, { start: 14, end: null, text: ' Why?' }]);
ok(paras.length === 3 && paras[1].text === 'I tried to sign up. Then I gave up.' && paras[2].end === 14, 'paragraphs');
ok(V.mergeUp(paras, 1).length === 2 && V.mergeUp(paras, 0) === paras, 'merge');
const labelled = paras.map((p, i) => ({ ...p, speaker: i % 2 ? 'Participant' : 'Interviewer' }));
const iv = prepare(V.transcriptText(labelled, { name: 'P1', stamps: true }));
ok(iv.length === 1 && iv[0].name === 'P1' && iv[0].segments.length === 3, 'workbench splits it');
ok(iv[0].segments[0].interviewer && !iv[0].segments[1].interviewer && iv[0].segments[1].text === 'I tried to sign up. Then I gave up.', 'speakers and stamps');
for (const [k, m] of Object.entries(V.MODELS)) { ok(/^Xenova\/whisper-(tiny|base|small)\.en$/.test(m.en) && m.multi === m.en.replace('.en', ''), `model ${k}`); }
ok(V.modelId('quick', 'english') === 'Xenova/whisper-tiny.en' && V.modelId('quick', 'hindi') === 'Xenova/whisper-tiny' && V.modelId('nope', '') === 'Xenova/whisper-base', 'model choice');
ok(V.LANGUAGES[0][0] === 'english' && new Set(V.LANGUAGES.map(([v]) => v)).size === V.LANGUAGES.length, 'languages');
// Reading a spoken situation into the finder's answers
const story = 'We run a banking app and since the redesign people are dropping off at sign up. I need to find out why and decide what to fix first. Our users are small business owners, we can probably talk to five of them and we have analytics. I am a product designer and we have two weeks.';
const u = U.understand(story);
ok(u.sel.goal.includes('behaviour') && u.sel.goal.length <= 2 && u.sel.material === 'live' && u.sel.participants === 'few' && u.sel.time === 'weeks' && u.sel.level === 'newcomer', `story: ${JSON.stringify(u.sel)}`);
ok(u.because.participants[0] === 'talk to five', 'shows its evidence');
const u2 = U.understand('We are exploring a new market for elderly people, nothing built yet, a researcher on our team has a few months, and leadership wants numbers.').sel;
ok(u2.goal[0] === 'explore' && u2.material === 'none' && u2.time === 'months' && u2.data === 'quantitative' && u2.level === 'mid', `story 2: ${JSON.stringify(u2)}`);
const u3 = U.understand('Which of our two checkout designs converts better? We can run an A/B test with thousands of users this sprint.').sel;
ok(u3.goal.includes('compare') && u3.goal.includes('impact') && u3.participants === 'large' && u3.time === 'days', `story 3: ${JSON.stringify(u3)}`);
ok(Object.keys(U.understand('hello there').sel).length === 0, 'says nothing when nothing fits');
// Every inferred value is a real finder option
for (const t of [story, 'navigation labels card sort, accessibility risk, support tickets, personas, roadmap, hours, statistician, both']) {
  for (const [q, v] of Object.entries(U.understand(t).sel)) {
    const opts = optionsOf(q);
    for (const x of [].concat(v)) ok(opts.includes(x), `${q}=${x} is a finder option`);
  }
}
ok(U.composeBrief(['A banking app.', '', 'Small businesses.', '']).split('\n\n').length === 2, 'brief skips empty turns');
const adv = U.adviceText({ goalLabels: ['Understand why people do what they do'], timeLabel: 'Weeks', methods: [{ name: 'Contextual inquiry', why: 'Watch the work' }, { name: 'Diary study' }], extra: { name: 'Critical incident technique' } });
ok(adv.startsWith('It sounds like you need to understand why') && adv.includes('Start with Contextual inquiry. Watch the work.') && adv.includes('Critical incident technique'), adv);
import('../../client/src/questions-match.js').then(({ bestQuestion }) => {
  const turns = ['We run a banking app and since the redesign people are dropping off at sign up.', 'I need to find out why and decide what to fix first.'];
  const q = bestQuestion([turns[0], turns[1], turns.join(' ')]);
  ok(q?.id && /sign-up/.test(q.question), `best library question: ${q?.question}`);
  ok(bestQuestion(['hello', '']) === null, 'no question for small talk');
  console.log(`check:voice OK: ${n} checks`);
});
if (0) console.log(`check:voice OK: ${n} checks`);
