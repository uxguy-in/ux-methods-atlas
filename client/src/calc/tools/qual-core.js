// Interview coding workbench: the pure logic behind the qual-coding tool. Splitting pasted transcripts into interviews
// and segments, the anonymise helper, tokens and stopwords, TF-IDF "words worth a look", code co-occurrence and the
// interview × code presence matrix, saturation counts, the exports (codebook, coded segments, themes, the formats the
// code-network, intercoder and saturation tools read), the project file and the "Reading your results" summary.
// Plain JS with no React, so `npm run check:qual` can test every function against Python references.
// Nothing here stores anything: transcripts stay in memory in the page and leave it only as files the user downloads.

export const VERSION = 1;
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const pctS = (x, d = 0) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
export const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ── Splitting transcripts ──────────────────────────────────────────────────────────────────────────────────────
// Interviews start at a heading line: a Markdown heading ("# P3"), a line such as "Interview: P3", "Transcript 4" or
// "Session – P2", or a separator line of three or more -, =, * or _. Text before the first heading is an interview too.
const MD_HEAD = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
const WORD_HEAD = /^\s*(?:interview|transcript|session)\b\s*(?:no\.?|number)?\s*[:#\-–—]?\s*(.{0,40})$/i;
const SEPARATOR = /^\s*(?:-{3,}|={3,}|\*{3,}|_{3,})\s*$/;
export const DEFAULT_INTERVIEWER = 'I, Q, Int, Interviewer, Moderator, Mod, Facilitator, Researcher';
// Labels always taken as speakers even if they appear once.
const KNOWN_SPEAKER = /^(?:i|q|a|r|p|int|interviewer|interviewee|moderator|mod|facilitator|researcher|respondent|participant|user|customer|speaker(?:\s+\d+)?|[pr]\d{1,3})$/i;

function headingName(line) {
  const m = line.match(MD_HEAD);
  if (m) return m[1].trim();
  const w = line.match(WORD_HEAD);
  if (w) {
    const name = w[1].trim();
    // "Interview: so tell me about…" is speech, not a heading: keep short names only.
    if (!name) return line.trim().replace(/[:#\-–—\s]+$/, '');
    if (name.split(/\s+/).length <= 5 && !/[?.!,]$/.test(name)) return name;
  }
  return null;
}

// Removes a leading timestamp ("[00:12:31]", "00:12", "(12:31) -") and a bracketed one after a speaker name
// ("Speaker 1 (00:01): …").
export function stripStamp(line) {
  let s = line.replace(/^\s*[[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]?\s*[-–—]?\s*/, '');
  s = s.replace(/^([^:]{0,30}?)\s*[[(]\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?[\])]/, '$1');
  return s;
}
const LABEL = /^\s*((?:[A-Z][\w.'’-]*|[pPrR]\d{1,3}|[iIqQ])(?:\s+[A-Z0-9][\w.'’-]*){0,2})\s*:\s*(.*)$/;
function speakerOf(line) {
  const m = stripStamp(line).match(LABEL);
  return m ? { label: m[1].trim(), rest: m[2] } : null;
}

export function splitInterviews(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let cur = null;
  const start = (name) => { cur = { name, lines: [] }; out.push(cur); };
  for (const line of lines) {
    if (SEPARATOR.test(line)) { start(null); continue; }
    const h = headingName(line);
    if (h !== null) {
      if (cur && !cur.name && !cur.lines.some((l) => l.trim())) cur.name = h; else start(h);
      continue;
    }
    if (!cur) start(null);
    cur.lines.push(line);
  }
  const kept = out.filter((iv) => iv.lines.some((l) => l.trim()));
  const seen = new Map();
  return kept.map((iv, i) => {
    let name = (iv.name || `Interview ${i + 1}`).replace(/\s+/g, ' ').slice(0, 40);
    const n = (seen.get(name.toLowerCase()) || 0) + 1; seen.set(name.toLowerCase(), n);
    if (n > 1) name = `${name} (${n})`;
    return { name, lines: iv.lines };
  });
}

export const parseLabelList = (s) => String(s || '').split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
export const wordCount = (s) => (String(s).match(/\S+/g) || []).length;

// Segments of one interview. mode 'turn': a new segment at each speaker label, so a turn's paragraphs stay together
// (falls back to paragraphs when the interview has no labels); mode 'paragraph': a new segment at each blank line too.
// A label counts as a speaker if it is a known label (P3, I, Q, Interviewer…) or starts at least two lines, so
// "Honestly: …" in the middle of an answer is not taken for a speaker.
export function splitSegments(lines, { mode = 'turn', interviewerLabels = DEFAULT_INTERVIEWER } = {}) {
  const ivSet = new Set(parseLabelList(interviewerLabels));
  const counts = new Map();
  for (const l of lines) { const s = speakerOf(l); if (s) counts.set(s.label.toLowerCase(), (counts.get(s.label.toLowerCase()) || 0) + 1); }
  const isSpeaker = (lab) => KNOWN_SPEAKER.test(lab) || ivSet.has(lab.toLowerCase()) || (counts.get(lab.toLowerCase()) || 0) >= 2;
  const anyLabel = lines.some((l) => { const s = speakerOf(l); return s && isSpeaker(s.label); });
  const byPara = mode === 'paragraph' || !anyLabel;
  const segs = []; let cur = null, speaker = '';
  const flush = () => { if (cur && cur.parts.join(' ').trim()) segs.push(cur); cur = null; };
  for (const raw of lines) {
    if (!raw.trim()) { if (byPara) flush(); continue; }
    const s = speakerOf(raw);
    if (s && isSpeaker(s.label)) { flush(); speaker = s.label; cur = { speaker, parts: [s.rest.trim()] }; continue; }
    if (!cur) cur = { speaker, parts: [] };
    cur.parts.push(stripStamp(raw).trim());
  }
  flush();
  const isIv = (lab) => { const l = lab.toLowerCase(); return ivSet.has(l) || ivSet.has(l.split(/\s+/)[0]); };
  return segs.map((s) => ({ speaker: s.speaker, text: s.parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(), interviewer: !!s.speaker && isIv(s.speaker) }));
}

// The whole project's interviews and segments. Segment ids are "<interview name>#<n>" so re-splitting the same text
// keeps the coding of unchanged segments.
export function prepare(text, opts = {}) {
  return splitInterviews(text).map((iv) => ({
    name: iv.name,
    segments: splitSegments(iv.lines, opts).map((s, j) => ({ id: `${iv.name}#${j + 1}`, n: j + 1, ...s })),
  }));
}
// Segments the analysis uses: everything, or only the participants' turns.
export const analysable = (interviews, excludeInterviewer = true) =>
  interviews.flatMap((iv, ii) => iv.segments.filter((s) => s.text && !(excludeInterviewer && s.interviewer)).map((s) => ({ ...s, interview: iv.name, ii })));

export function counts(interviews, excludeInterviewer = true) {
  const all = interviews.flatMap((iv) => iv.segments);
  const used = analysable(interviews, excludeInterviewer);
  return { interviews: interviews.length, segments: all.length, analysable: used.length, interviewer: all.filter((s) => s.interviewer).length, words: all.reduce((s, x) => s + wordCount(x.text), 0), analysableWords: used.reduce((s, x) => s + wordCount(x.text), 0), speakers: [...new Set(all.map((s) => s.speaker).filter(Boolean))] };
}

// ── Anonymising ────────────────────────────────────────────────────────────────────────────────────────────────
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"]*[^\s<>()".,;:!?'’]/gi;
// Phone-like runs: optional +country code, then groups of digits split by spaces, dots, dashes or brackets. A match
// counts only with 9 to 15 digits, so years, prices and times are left alone.
const PHONE = /(?<![\w@])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,5}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\w@])/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// terms: lines of "Sarah Jones" or "Sarah Jones = [colleague]" (also "=>"). Terms are replaced as whole words,
// ignoring case, longest first; a term without its own placeholder becomes [name 1], [name 2]…
export function parseTerms(text) {
  const out = []; let n = 0;
  for (const line of String(text || '').split('\n')) {
    const t = line.trim(); if (!t) continue;
    const m = t.match(/^(.+?)\s*(?:=>|=|→)\s*(.+)$/);
    if (m) out.push({ term: m[1].trim(), with: m[2].trim() });
    else out.push({ term: t, with: `[name ${++n}]` });
  }
  return out;
}
export function anonymise(text, { emails = true, phones = true, urls = true, terms = '' } = {}) {
  let s = String(text || ''); const n = { emails: 0, phones: 0, urls: 0, terms: 0 };
  if (emails) s = s.replace(EMAIL, () => { n.emails++; return '[email]'; });
  if (urls) s = s.replace(URL_RE, () => { n.urls++; return '[link]'; });
  if (phones) s = s.replace(PHONE, (m) => { const d = m.replace(/\D/g, '').length; if (d < 9 || d > 15) return m; n.phones++; return '[phone]'; });
  const list = parseTerms(terms).sort((a, b) => b.term.length - a.term.length);
  for (const t of list) {
    const re = new RegExp(`(?<![\\w])${escapeRe(t.term)}(?![\\w])`, 'gi');
    s = s.replace(re, () => { n.terms++; return t.with; });
  }
  return { text: s, n };
}
// Capitalised words in mid-sentence that are not common words: candidate names and places to check by eye.
const NOT_NAMES = new Set('i i\'m i\'ve i\'d i\'ll ok okay monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december english british uk us usa nhs gp app apple android google iphone ipad wifi tv pdf covid christmas easter interviewer participant moderator facilitator researcher yes no oh well so and but the a an'.split(' '));
export function nameCandidates(text, max = 15) {
  const counts = new Map();
  const body = String(text || '').split('\n').filter((l) => !SEPARATOR.test(l) && headingName(l) === null).map((l) => { const s = speakerOf(l); return s ? s.rest : l; }).join('\n');
  for (const m of body.matchAll(/(?<=[a-z,;]\s+)([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)/g)) {
    const w = m[1]; if (NOT_NAMES.has(w.toLowerCase()) || NOT_NAMES.has(w.split(' ')[0].toLowerCase())) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([w, c]) => ({ word: w, count: c }));
}

// ── Tokens and stopwords ───────────────────────────────────────────────────────────────────────────────────────
export const STOPWORDS = new Set(`a about above after again against all almost also although always am among an and another any anyone anything
are aren't around as at away back be because been before being below between both but by can can't cannot could couldn't did didn't do
does doesn't doing don't done down during each either else enough even ever every everything few for from further get gets getting got
gotten had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's however i i'd
i'll i'm i've if in into is isn't it it's its itself just kind least less let let's like likely lot lots made make makes making many may
maybe me might mine more most much must mustn't my myself near need needed needs neither never next no nobody none nor not nothing now of
off often oh ok okay on once one ones only onto or other others otherwise ought our ours ourselves out over own perhaps please pretty quite
rather really right said same say saying says see seem seemed seems shall shan't she she'd she'll she's should shouldn't since so some
somebody someone something sometimes somewhat sort still such sure take than that that's the their theirs them themselves then there
there's these they they'd they'll they're they've thing things think this those though through thus to together too took toward towards
two under until up upon us use used using very via want wanted wants was wasn't way we we'd we'll we're we've well went were weren't what
what's whatever when when's where where's whether which while who who's whom whose why why's will with within without won't would wouldn't
yeah yes yet you you'd you'll you're you've your yours yourself yourselves um uh erm er ah hmm mm mhm yep nope gonna wanna gotta actually
basically literally probably definitely honestly obviously anyway guess mean know knew go goes going come comes coming came tell told look
looked looking bit bits stuff whole lots again first last time times day days week year years every also around able else ever etc`.split(/\s+/).filter(Boolean));

// Lower-case word tokens with apostrophes kept inside words ("don't"); curly quotes and possessive 's normalised.
export function words(text) {
  return (String(text || '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)*/g) || []).map((w) => w.replace(/'s$/, ''));
}
// Content tokens for TF-IDF and topic models: no stopwords, no words under 3 letters, no placeholders like [name 1].
export function contentTokens(text, extraStop = null) {
  const clean = String(text || '').replace(/\[[^\]]*\]/g, ' ');
  return words(clean).filter((w) => w.length >= 3 && !w.includes("'") && !STOPWORDS.has(w) && !(extraStop && extraStop.has(w)));
}
export const parseStop = (s) => new Set(String(s || '').toLowerCase().split(/[\s,;]+/).filter(Boolean));

// ── TF-IDF: words worth a look ─────────────────────────────────────────────────────────────────────────────────
// Each interview (its analysable segments joined) is one document. tf = the word's count in the interview;
// idf = ln((1 + N) / (1 + df)) + 1 with N interviews and df the interviews that use the word (the smoothed idf of
// scikit-learn's TfidfVectorizer, norm=None); score = tf × idf. Words worth a look are an interview's highest scores
// among words it uses at least twice that do not appear in every interview. They are prompts to read, never codes.
export function tfidf(docs) {
  const N = docs.length, df = new Map(), tf = docs.map((toks) => { const m = new Map(); for (const w of toks) m.set(w, (m.get(w) || 0) + 1); return m; });
  for (const m of tf) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  const idf = new Map([...df.entries()].map(([w, d]) => [w, Math.log((1 + N) / (1 + d)) + 1]));
  const scores = tf.map((m) => new Map([...m.entries()].map(([w, c]) => [w, c * idf.get(w)])));
  return { N, df, idf, tf, scores };
}
export function wordsWorthALook(docs, top = 8) {
  const t = tfidf(docs);
  return t.scores.map((m, d) => [...m.entries()]
    .filter(([w]) => t.tf[d].get(w) >= 2 && (t.N === 1 || t.df.get(w) < t.N))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top)
    .map(([w, s]) => ({ word: w, score: s, count: t.tf[d].get(w), df: t.df.get(w) })));
}

// ── Codes, coding and their counts ─────────────────────────────────────────────────────────────────────────────
export const newId = (prefix, list) => { let i = list.length + 1; const have = new Set(list.map((x) => x.id)); while (have.has(`${prefix}${i}`)) i++; return `${prefix}${i}`; };
export const codesOf = (coding, segId) => coding[segId] || [];

// Per code: segments and interviews it is applied to (analysable segments only), first interview it appears in.
export function codeStats(codes, segs, coding) {
  const by = new Map(codes.map((c) => [c.id, { id: c.id, segs: [], interviews: new Set() }]));
  for (const s of segs) for (const cid of codesOf(coding, s.id)) { const b = by.get(cid); if (b) { b.segs.push(s); b.interviews.add(s.ii); } }
  return new Map([...by.entries()].map(([id, b]) => [id, { id, n: b.segs.length, nInterviews: b.interviews.size, segs: b.segs, interviews: [...b.interviews].sort((a, b2) => a - b2), first: b.interviews.size ? Math.min(...b.interviews) : -1 }]));
}

// Segment-level co-occurrence: C[a][b] = segments carrying both a and b; the diagonal = segments carrying a.
export function cooccurrence(codeIds, segs, coding) {
  const idx = new Map(codeIds.map((c, i) => [c, i])), K = codeIds.length;
  const C = Array.from({ length: K }, () => new Array(K).fill(0));
  for (const s of segs) {
    const ii = [...new Set(codesOf(coding, s.id))].map((c) => idx.get(c)).filter((v) => v !== undefined);
    for (const a of ii) for (const b of ii) C[a][b]++;
  }
  return C;
}
// Interview × code presence: M[i][k] = segments in interview i carrying code k (present when > 0).
export function presence(codeIds, interviews, segs, coding) {
  const idx = new Map(codeIds.map((c, i) => [c, i]));
  const M = interviews.map(() => new Array(codeIds.length).fill(0));
  for (const s of segs) for (const c of new Set(codesOf(coding, s.id))) { const k = idx.get(c); if (k !== undefined) M[s.ii][k]++; }
  return M;
}
// Category (theme) membership of a segment: the categories of its codes.
export function segCategories(codesById, coding, segId) {
  return [...new Set(codesOf(coding, segId).map((c) => codesById.get(c)?.category).filter(Boolean))];
}

// Saturation in interview order: codes first seen in each interview, codes used in a single segment, uncoded
// segments, and Guest, Namey and Chen's (2020) new-information ratio: new codes in a run of the last 2 coded
// interviews ÷ codes found in the base (the coded interviews before the run, at least 4 of them).
export function saturation(codes, interviews, segs, coding) {
  const stats = codeStats(codes, segs, coding);
  const used = [...stats.values()].filter((s) => s.n > 0);
  const codedIv = interviews.map((_, i) => segs.some((s) => s.ii === i && codesOf(coding, s.id).length)).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const perInterview = interviews.map((iv, i) => {
    const mine = segs.filter((s) => s.ii === i);
    return { name: iv.name, segments: mine.length, coded: mine.filter((s) => codesOf(coding, s.id).length).length, newCodes: used.filter((s) => s.first === i).length, codes: used.filter((s) => s.interviews.includes(i)).length };
  });
  const run = 2, base = codedIv.length - run;
  let newInfo = null;
  if (base >= 4) {
    const baseSet = new Set(codedIv.slice(0, base)), runSet = codedIv.slice(base);
    const inBase = used.filter((s) => baseSet.has(s.first)).length;
    const inRun = used.filter((s) => runSet.includes(s.first)).length;
    newInfo = { base, run, inBase, inRun, ratio: inBase ? inRun / inBase : NaN };
  }
  const coded = segs.filter((s) => codesOf(coding, s.id).length).length;
  return { perInterview, codedInterviews: codedIv.length, usedCodes: used.length, unusedCodes: codes.length - used.length, once: used.filter((s) => s.n === 1).length, singleInterview: used.filter((s) => s.nInterviews === 1).length, coded, uncoded: segs.length - coded, total: segs.length, newInfo };
}

// ── Exports ────────────────────────────────────────────────────────────────────────────────────────────────────
const mdCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
const csvCell = (v, sep) => { const s = String(v ?? ''); return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toDelimited = (rows, sep = ',') => rows.map((r) => r.map((v) => csvCell(v, sep)).join(sep)).join('\n');
export const shortQuote = (t, max = 160) => { const s = String(t || '').trim(); return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s; };
// Names safe for the other tools' parsers, which split codes on commas, semicolons, bars and tabs.
export const safeName = (s) => String(s || '').replace(/[,;|\t:]+/g, ' ').replace(/\s+/g, ' ').trim();

// The example quote for a code: a starred segment if any, else its medium-length segment closest to 25 words.
export function exampleQuote(stat, starred = {}) {
  if (!stat || !stat.segs.length) return null;
  const star = stat.segs.find((s) => starred[s.id]);
  if (star) return star;
  return [...stat.segs].sort((a, b) => Math.abs(wordCount(a.text) - 25) - Math.abs(wordCount(b.text) - 25) || a.ii - b.ii)[0];
}

export function codebookMarkdown(p, segs) {
  const stats = codeStats(p.codes, segs, p.coding), cats = new Map(p.categories.map((c) => [c.id, c.name]));
  const head = '| Code | Definition | Include | Exclude | Category | Segments | Interviews | Example quote |\n|---|---|---|---|---|---:|---:|---|';
  const rows = p.codes.map((c) => {
    const s = stats.get(c.id), q = exampleQuote(s, p.starred);
    return `| ${mdCell(c.name)} | ${mdCell(c.definition)} | ${mdCell(c.include)} | ${mdCell(c.exclude)} | ${mdCell(cats.get(c.category) || '')} | ${s.n} | ${s.nInterviews} | ${q ? `“${mdCell(shortQuote(q.text))}” (${mdCell(q.interview)})` : ''} |`;
  });
  return `# Codebook\n\n${head}\n${rows.join('\n')}\n`;
}

export function codedSegmentsRows(p, segs, sentiment = null) {
  const names = new Map(p.codes.map((c) => [c.id, c.name])), codesById = new Map(p.codes.map((c) => [c.id, c])), cats = new Map(p.categories.map((c) => [c.id, c.name]));
  const head = ['interview', 'segment', 'speaker', 'text', 'codes', 'categories', 'sentiment_score', 'sentiment', 'memo'];
  return [head, ...segs.map((s) => {
    const sen = sentiment?.get(s.id);
    return [s.interview, s.n, s.speaker, s.text, codesOf(p.coding, s.id).map((c) => names.get(c)).filter(Boolean).join('; '), segCategories(codesById, p.coding, s.id).map((c) => cats.get(c)).join('; '), sen ? sen.score.toFixed(3) : '', sen ? sen.label : '', (p.segMemos || {})[s.id] || ''];
  })];
}

// Themes: each category with its codes, the interviews and segments that carry any of them, and up to `quotes`
// example quotes (starred first, then segments carrying the most of the theme's codes, from different interviews).
export function themeSummary(p, segs, quotes = 3) {
  const stats = codeStats(p.codes, segs, p.coding);
  return p.categories.map((cat) => {
    const members = p.codes.filter((c) => c.category === cat.id);
    const ids = new Set(members.map((c) => c.id));
    const hit = segs.filter((s) => codesOf(p.coding, s.id).some((c) => ids.has(c)));
    const ranked = [...hit].sort((a, b) => (p.starred?.[b.id] ? 1 : 0) - (p.starred?.[a.id] ? 1 : 0)
      || codesOf(p.coding, b.id).filter((c) => ids.has(c)).length - codesOf(p.coding, a.id).filter((c) => ids.has(c)).length
      || Math.abs(wordCount(a.text) - 25) - Math.abs(wordCount(b.text) - 25));
    const picked = [], seenIv = new Set();
    for (const s of ranked) { if (picked.length >= quotes) break; if (p.starred?.[s.id] || !seenIv.has(s.ii)) { picked.push(s); seenIv.add(s.ii); } }
    for (const s of ranked) { if (picked.length >= quotes) break; if (!picked.includes(s)) picked.push(s); }
    return { id: cat.id, name: cat.name, description: cat.description || '', codes: members.map((c) => ({ name: c.name, n: stats.get(c.id).n })), segments: hit.length, interviews: new Set(hit.map((s) => s.ii)).size, quotes: picked, cat };
  });
}
export function themesMarkdown(p, segs, nInterviews) {
  const th = themeSummary(p, segs), core = p.categories.find((c) => c.id === p.core);
  const parts = ['# Themes', ''];
  if (core) parts.push(`**Core category:** ${core.name}`, '');
  if (p.storyline?.trim()) parts.push('## Storyline', '', p.storyline.trim(), '');
  for (const t of th) {
    parts.push(`## ${t.name}${t.id === p.core ? ' (core)' : ''}`, '');
    if (t.description) parts.push(t.description, '');
    parts.push(`${t.interviews} of ${nInterviews} interviews · ${plural(t.segments, 'segment')} · codes: ${t.codes.map((c) => `${c.name} (${c.n})`).join(', ') || 'none'}`, '');
    const pm = [['Conditions', t.cat.conditions], ['Context', t.cat.context], ['Actions and interactions', t.cat.actions], ['Consequences', t.cat.consequences]].filter(([, v]) => v && v.trim());
    if (pm.length) { for (const [k, v] of pm) parts.push(`- **${k}:** ${v.trim()}`); parts.push(''); }
    for (const q of t.quotes) parts.push(`> “${q.text}” (${q.interview})`, '');
  }
  const loose = p.codes.filter((c) => !c.category);
  if (loose.length) parts.push('## Codes not yet in a theme', '', loose.map((c) => c.name).join(', '), '');
  return parts.join('\n');
}
// For the "Code co-occurrence network" tool: one coded segment per line, "id: code, code".
export function codeNetworkText(p, segs) {
  const names = new Map(p.codes.map((c) => [c.id, safeName(c.name)]));
  return segs.filter((s) => codesOf(p.coding, s.id).length).map((s) => `${safeName(s.interview)}-${s.n}: ${codesOf(p.coding, s.id).map((c) => names.get(c)).filter(Boolean).join(', ')}`).join('\n');
}
// For the "Saturation and coverage" tool: one interview per line, the codes it uses, in interview order.
export function saturationText(p, interviews, segs) {
  const M = presence(p.codes.map((c) => c.id), interviews, segs, p.coding);
  return M.map((row) => p.codes.filter((_, k) => row[k] > 0).map((c) => safeName(c.name)).join(', ')).filter(Boolean).join('\n');
}
// Check-coding: a blind sheet for a second coder (segment id and text, no codes) and, once their codes are pasted
// back, the two-column text the "Inter-coder agreement" tool reads. Each segment's first code is its primary code.
export function blindSheet(segs) { return toDelimited([['segment_id', 'text', 'code'], ...segs.map((s) => [`${safeName(s.interview)}-${s.n}`, s.text, ''])]); }
export function intercoderText(p, segs, theirsText) {
  const names = new Map(p.codes.map((c) => [c.id, safeName(c.name)]));
  const theirs = new Map();
  for (const line of String(theirsText || '').split('\n')) {
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length >= 2 && cells[0] && cells[0] !== 'segment_id') theirs.set(cells[0].toLowerCase(), safeName(cells[cells.length - 1]) || '.');
  }
  const rows = segs.map((s) => {
    const id = `${safeName(s.interview)}-${s.n}`.toLowerCase();
    const mine = names.get(codesOf(p.coding, s.id)[0]) || '.';
    return { id, mine, theirs: theirs.has(id) ? theirs.get(id) : null };
  });
  const matched = rows.filter((r) => r.theirs !== null);
  return { text: matched.map((r) => `${r.mine}, ${r.theirs}`).join('\n'), matched: matched.length, total: rows.length };
}

// ── Project file ───────────────────────────────────────────────────────────────────────────────────────────────
export function emptyProject() {
  return { app: 'ux-methods-atlas/qual-coding', version: VERSION, raw: '', options: { mode: 'turn', excludeInterviewer: true, interviewerLabels: DEFAULT_INTERVIEWER }, interviews: [], codes: [], categories: [], coding: {}, segMemos: {}, starred: {}, overrides: {}, core: '', storyline: '', stop: '' };
}
// Accepts a saved project, fills in anything missing and drops references to codes or segments that no longer exist.
export function loadProject(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  if (!o || typeof o !== 'object' || !Array.isArray(o.interviews) || !Array.isArray(o.codes)) throw new Error('This is not a coding workbench project file.');
  const p = { ...emptyProject(), ...o, options: { ...emptyProject().options, ...(o.options || {}) } };
  p.interviews = p.interviews.map((iv) => ({ name: String(iv.name || 'Interview'), segments: (iv.segments || []).map((s, j) => ({ id: String(s.id || `${iv.name}#${j + 1}`), n: s.n || j + 1, speaker: String(s.speaker || ''), text: String(s.text || ''), interviewer: !!s.interviewer })) }));
  p.codes = p.codes.map((c, i) => ({ id: String(c.id || `c${i + 1}`), name: String(c.name || `Code ${i + 1}`), definition: c.definition || '', include: c.include || '', exclude: c.exclude || '', memo: c.memo || '', category: c.category || '', inVivo: !!c.inVivo }));
  p.categories = (p.categories || []).map((c, i) => ({ id: String(c.id || `t${i + 1}`), name: String(c.name || `Theme ${i + 1}`), description: c.description || '', conditions: c.conditions || '', context: c.context || '', actions: c.actions || '', consequences: c.consequences || '', memo: c.memo || '' }));
  const segIds = new Set(p.interviews.flatMap((iv) => iv.segments.map((s) => s.id))), codeIds = new Set(p.codes.map((c) => c.id)), catIds = new Set(p.categories.map((c) => c.id));
  p.coding = Object.fromEntries(Object.entries(p.coding || {}).filter(([k]) => segIds.has(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter((c) => codeIds.has(c))]).filter(([, v]) => v.length));
  for (const c of p.codes) if (c.category && !catIds.has(c.category)) c.category = '';
  if (!catIds.has(p.core)) p.core = '';
  return p;
}
export const saveProject = (p) => JSON.stringify({ ...p, savedAt: new Date().toISOString() }, null, 1);

// Re-splitting keeps codes, memos, stars and overrides of segments whose id and text are unchanged.
export function resplit(p, interviews) {
  const old = new Map(p.interviews.flatMap((iv) => iv.segments.map((s) => [s.id, s.text])));
  const keep = new Set(interviews.flatMap((iv) => iv.segments.filter((s) => old.get(s.id) === s.text).map((s) => s.id)));
  const pick = (m) => Object.fromEntries(Object.entries(m || {}).filter(([k]) => keep.has(k)));
  const lost = Object.keys(p.coding || {}).filter((k) => !keep.has(k)).length;
  return { project: { ...p, interviews, coding: pick(p.coding), segMemos: pick(p.segMemos), starred: pick(p.starred), overrides: pick(p.overrides) }, lost };
}

// ── Editing codes ──────────────────────────────────────────────────────────────────────────────────────────────
export function toggleCode(coding, segId, codeId) {
  const cur = coding[segId] || [];
  const next = cur.includes(codeId) ? cur.filter((c) => c !== codeId) : [...cur, codeId];
  const out = { ...coding }; if (next.length) out[segId] = next; else delete out[segId];
  return out;
}
// Merge `from` into `into`: every segment with `from` gets `into` (once), `from` is removed, and its definition and
// memo are appended to `into`'s memo so nothing is lost.
export function mergeCodes(p, from, into) {
  if (from === into) return p;
  const a = p.codes.find((c) => c.id === from), b = p.codes.find((c) => c.id === into);
  if (!a || !b) return p;
  const coding = {};
  for (const [seg, list] of Object.entries(p.coding)) { const l = [...new Set(list.map((c) => (c === from ? into : c)))]; if (l.length) coding[seg] = l; }
  const note = [`Merged in “${a.name}”.`, a.definition && `Its definition: ${a.definition}`, a.memo && `Its memo: ${a.memo}`].filter(Boolean).join(' ');
  return { ...p, coding, codes: p.codes.filter((c) => c.id !== from).map((c) => (c.id === into ? { ...c, memo: [c.memo, note].filter(Boolean).join('\n\n') } : c)) };
}
// Split: the ticked segments move from `codeId` to a new code called `name`.
export function splitCode(p, codeId, segIds, name) {
  const src = p.codes.find((c) => c.id === codeId); if (!src || !segIds.length || !name.trim()) return p;
  const id = newId('c', p.codes);
  const coding = { ...p.coding };
  for (const s of segIds) coding[s] = [...new Set((coding[s] || []).map((c) => (c === codeId ? id : c)))];
  return { ...p, coding, codes: [...p.codes, { id, name: name.trim(), definition: '', include: '', exclude: '', memo: `Split from “${src.name}”.`, category: src.category, inVivo: false }] };
}
export function deleteCode(p, codeId) {
  const coding = {};
  for (const [seg, list] of Object.entries(p.coding)) { const l = list.filter((c) => c !== codeId); if (l.length) coding[seg] = l; }
  return { ...p, coding, codes: p.codes.filter((c) => c.id !== codeId) };
}

// ── Reading your results ───────────────────────────────────────────────────────────────────────────────────────
// Confidence is about how settled the codebook looks, not about whether the findings are true.
// Rule (in this order):
//   low    if fewer than 4 interviews have any coding, or under 50% of the analysable segments are coded, or the
//          new-information ratio (new codes in the last 2 coded interviews ÷ codes found in the earlier ones) is
//          above 20%;
//   high   if at least 6 interviews are coded, at least 80% of segments are coded and the new-information ratio is
//          5% or less (Guest, Namey and Chen 2020's stopping threshold);
//   medium otherwise.
export function qualSummary({ sat, nInterviews, codes, themes = [], sentimentShares = null, core = '' }) {
  const { codedInterviews: ci, usedCodes, coded, total, once, newInfo } = sat;
  const share = total ? coded / total : 0;
  const ratio = newInfo && Number.isFinite(newInfo.ratio) ? newInfo.ratio : null;
  let confidence = 'medium';
  if (ci < 4 || share < 0.5 || (ratio !== null && ratio > 0.2)) confidence = 'low';
  else if (ci >= 6 && share >= 0.8 && ratio !== null && ratio <= 0.05) confidence = 'high';
  const headline = !usedCodes ? `No codes applied yet: ${plural(total, 'segment')} from ${plural(nInterviews, 'interview')} are ready to read.`
    : `${plural(usedCodes, 'code')} applied to ${coded} of ${total} segments (${pctS(share)}) across ${ci} of ${nInterviews} interviews${themes.length ? `, grouped into ${plural(themes.length, 'theme')}` : ''}.`;
  const meaning = [];
  if (usedCodes) {
    meaning.push(`New codes per interview, in order: ${sat.perInterview.filter((r) => r.coded > 0).map((r) => `${r.name} ${r.newCodes}`).join(', ')}. ${ratio !== null ? `The last two coded interviews added ${newInfo.inRun} new ${newInfo.inRun === 1 ? 'code' : 'codes'}, ${pctS(ratio)} of the ${newInfo.inBase} found before them (Guest, Namey and Chen 2020 suggest stopping at 5% or less).` : 'You need at least six coded interviews to judge whether new codes are drying up.'}`);
    if (once) meaning.push(`${plural(once, 'code')} ${once === 1 ? 'is' : 'are'} used on a single segment. Keep ${once === 1 ? 'it' : 'them'} only if ${once === 1 ? 'it captures' : 'they capture'} something important; otherwise merge into a broader code.`);
    if (total - coded) meaning.push(`${plural(total - coded, 'segment')} ${total - coded === 1 ? 'has' : 'have'} no code yet. Not every segment needs one, but check none of them hold a new idea.`);
    if (themes.length) { const top = [...themes].sort((a, b) => b.interviews - a.interviews || b.segments - a.segments)[0]; meaning.push(`The most widespread theme is “${top.name}”, in ${top.interviews} of ${nInterviews} interviews (${plural(top.segments, 'segment')}).${core ? '' : ' No core category is chosen yet.'}`); }
    if (sentimentShares) meaning.push(`Sentiment, as a rough guide: ${pctS(sentimentShares.positive)} of segments read as positive, ${pctS(sentimentShares.negative)} negative, ${pctS(sentimentShares.mixed)} mixed and ${pctS(sentimentShares.neutral)} neutral.`);
  } else meaning.push('Start in Open coding: read a segment, name what is going on in it, and write a one-line definition for each new code.');
  const confidenceNote = `This rates how settled the codebook looks, not whether the findings are true. Rule: weak if fewer than 4 interviews are coded, under half the segments are coded or the last two coded interviews added more than 20% new codes; strong if at least 6 interviews and 80% of segments are coded and new codes have dropped to 5% or less (Guest, Namey and Chen 2020); otherwise some. Here: ${ci} coded interviews, ${pctS(share)} of segments coded${ratio !== null ? `, new information ${pctS(ratio)}` : ', new information not yet measurable'}.`;
  const caveats = [
    'Counts show how often you applied a code, not how important an idea is. One vivid story can matter more than ten passing mentions.',
    'Saturation depends on how fine-grained your codes are and on the order of interviews; say how you judged it rather than quoting a number alone.',
  ];
  if (sentimentShares) caveats.push('Sentiment scores come from a word list: they miss sarcasm, domain meaning and context. Read the segments before quoting a balance.');
  const next = [];
  if (confidence === 'low') next.push('Code more interviews, or code the rest of each interview, before drawing themes.');
  else next.push('Check a sample with a colleague in [Inter-coder agreement](/calculators/intercoder) if your codebook is meant to be applied the same way by anyone.');
  next.push('Paste the saturation export into [Saturation and coverage](/calculators/saturation) to estimate how many codes are still to find.');
  if (usedCodes > 2) next.push('See which codes travel together in [Code co-occurrence network](/calculators/code-network).');
  const report = usedCodes
    ? `We coded ${coded} of ${total} participant segments from ${nInterviews} interviews with ${plural(usedCodes, 'code')}${themes.length ? ` grouped into ${plural(themes.length, 'theme')}` : ''}. ${ratio !== null ? `The last two coded interviews added ${pctS(ratio)} new codes relative to the earlier ones.` : `New codes per interview, in order: ${sat.perInterview.filter((r) => r.coded > 0).map((r) => `${r.name} ${r.newCodes}`).join(', ')}.`} Counts describe our coding, not the prevalence of views in the wider population.`
    : `${nInterviews} interviews (${total} segments) prepared for coding; no codes applied yet.`;
  return { headline, meaning: meaning.slice(0, 6), confidence, confidenceNote, caveats: caveats.slice(0, 3), next: next.slice(0, 3), report };
}
