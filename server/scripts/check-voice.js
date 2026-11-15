// Checks the voice tool's pure helpers (client/src/voice/voice-core.js): filler removal, Whisper windows, paragraphs,
// transcript text the coding workbench can split, and that every model id names a browser-ready Whisper model.
import assert from 'node:assert/strict';
import * as V from '../../client/src/voice/voice-core.js';
import { prepare } from '../../client/src/calc/tools/qual-core.js';

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
console.log(`check:voice OK: ${n} checks`);
