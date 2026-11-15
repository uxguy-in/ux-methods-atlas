// Pure helpers for the voice tool (pages/Voice.jsx): which Whisper model to load, how to tidy spoken text before
// matching it to the question library, and how to turn Whisper's timed chunks into paragraphs and a transcript the
// interview coding workbench can read. Checked by server/scripts/check-voice.js.

// Whisper models converted for the browser (Xenova on Hugging Face, 8-bit). The .en models are more accurate for
// English; the others handle about 100 languages and can translate into English.
export const MODELS = {
  quick: { name: 'Quick', en: 'Xenova/whisper-tiny.en', multi: 'Xenova/whisper-tiny', size: 'about 40 MB', note: 'Fast, fine for a clear spoken question.' },
  balanced: { name: 'Balanced', en: 'Xenova/whisper-base.en', multi: 'Xenova/whisper-base', size: 'about 80 MB', note: 'Better with accents and background noise.' },
  accurate: { name: 'Accurate', en: 'Xenova/whisper-small.en', multi: 'Xenova/whisper-small', size: 'about 250 MB', note: 'Best for interview recordings. Slower, and needs a good computer.' },
};
export const modelId = (size, language) => (MODELS[size] || MODELS.balanced)[language === 'english' ? 'en' : 'multi'];

// Whisper's language names. '' lets the model detect the language itself.
export const LANGUAGES = [
  ['english', 'English'], ['', 'Detect automatically'], ['hindi', 'Hindi'], ['tamil', 'Tamil'], ['malayalam', 'Malayalam'],
  ['telugu', 'Telugu'], ['kannada', 'Kannada'], ['marathi', 'Marathi'], ['bengali', 'Bengali'], ['urdu', 'Urdu'],
  ['spanish', 'Spanish'], ['portuguese', 'Portuguese'], ['french', 'French'], ['german', 'German'], ['italian', 'Italian'],
  ['dutch', 'Dutch'], ['polish', 'Polish'], ['turkish', 'Turkish'], ['arabic', 'Arabic'], ['japanese', 'Japanese'],
  ['korean', 'Korean'], ['chinese', 'Chinese'],
];

// How many 30-second windows Whisper will run over a recording (windows overlap by 5 seconds at each side).
export function chunkCount(seconds, chunk = 30, stride = 5) {
  if (!(seconds > 0)) return 1;
  if (seconds <= chunk) return 1;
  return 1 + Math.ceil((seconds - chunk) / (chunk - 2 * stride));
}

// Spoken questions come with fillers and false starts; they only add noise to matching.
const FILLERS = [
  /\b(?:um+|uh+|erm+|er|ah+|hmm+|mm+)\b[,.]?/gi,
  /,?\s*\b(?:you know|i mean|sort of|kind of|basically|actually|literally)\b,?/gi,
  /(^\s*|[,.]\s*)(?:so|okay|ok|right|well|like)\s*,\s*/gi,
  /\blike,\s*/gi,
  /^\s*like\s+/i,
];
export function cleanSpeech(text) {
  let s = String(text || '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' '); // [Music], (laughs)
  for (const re of FILLERS) s = s.replace(re, (m, lead) => (typeof lead === 'string' ? lead : ' '));
  s = s.replace(/\b(\w+)(\s+\1\b)+/gi, '$1'); // "the the"
  s = s.replace(/\s+([,.?!])/g, '$1').replace(/([,.?!])(?:\s*[,.])+/g, '$1').replace(/\s+/g, ' ').replace(/^[\s,.]+/, '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Groups timed chunks into paragraphs: a new paragraph after a pause of at least `gap` seconds, or once a paragraph
// passes `maxChars` and the chunk ends a sentence. Chunks without an end time take the next chunk's start.
export function toParagraphs(chunks, { gap = 1.2, maxChars = 700 } = {}) {
  const out = [];
  let cur = null;
  (chunks || []).forEach((c, i) => {
    const text = String(c.text || '').trim();
    if (!text) return;
    const start = Number.isFinite(c.start) ? c.start : cur?.end ?? 0;
    const end = Number.isFinite(c.end) ? c.end : (Number.isFinite(chunks[i + 1]?.start) ? chunks[i + 1].start : start);
    const pause = cur ? start - cur.end : 0;
    if (!cur || pause >= gap || (cur.text.length >= maxChars && /[.?!]["”']?$/.test(cur.text))) {
      cur = { start, end, text, speaker: '' };
      out.push(cur);
    } else {
      cur.text = `${cur.text} ${text}`;
      cur.end = Math.max(cur.end, end);
    }
  });
  return out;
}

export function stamp(seconds) {
  const t = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

// The transcript as text: an optional "# name" heading (the coding workbench starts a new interview at one), then one
// paragraph per block with "[mm:ss]" and "Speaker:" when set, separated by blank lines.
export function transcriptText(paras, { name = '', stamps = true } = {}) {
  const lines = [];
  if (name.trim()) lines.push(`# ${name.trim()}`, '');
  for (const p of paras) {
    const t = String(p.text || '').trim();
    if (!t) continue;
    lines.push(`${stamps ? `[${stamp(p.start)}] ` : ''}${p.speaker ? `${p.speaker}: ` : ''}${t}`, '');
  }
  return lines.join('\n').trim() + '\n';
}

// Joins paragraph i onto the one before it.
export function mergeUp(paras, i) {
  if (i <= 0 || i >= paras.length) return paras;
  const a = paras[i - 1], b = paras[i];
  const next = paras.slice();
  next.splice(i - 1, 2, { ...a, text: `${a.text} ${b.text}`.trim(), end: Math.max(a.end, b.end) });
  return next;
}

// Mono 16 kHz samples, as Whisper expects: averages the channels.
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}
