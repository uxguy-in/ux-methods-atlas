// Checks the interview coding workbench (qual-coding): transcript splitting and anonymising (unit cases), sentiment
// rules (negation, intensifiers, but-clauses), TF-IDF and co-occurrence against scikit-learn and numpy, LDA (planted
// topic recovery, rising log-likelihood, seeded determinism, the log-likelihood recomputed in Python and scikit-learn's
// LDA on the same corpus), latent class analysis via calc/cluster.js (planted classes, log-likelihood and BIC
// recomputed in numpy), the exports read back by the code-network, intercoder and saturation parsers, the project file
// round trip, and the "Reading your results" summary. References: qual-reference.py → qual-reference.json, fed by
// qual-dump.js. Run with `npm run check:qual` (VERBOSE=1 to list every check).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Q from '../../client/src/calc/tools/qual-core.js';
import * as SE from '../../client/src/calc/tools/qual-sentiment.js';
import { buildCorpus, describeTopics, lda } from '../../client/src/calc/tools/qual-lda.js';
import { lcaData, runLCA } from '../../client/src/calc/tools/qual-lca.js';
import { exampleProject } from '../../client/src/calc/tools/qual-example.js';
import { plantedCorpus, plantedLca } from './qual-dump.js';
import { parseSegments, cooccurrence as cnCooc } from '../../client/src/calc/tools/sensors-codenet.js';
import { parseCodeRows, parseCodeLists, krippendorffAlpha } from '../../client/src/calc/stats.js';
import { CATALOG } from '../../client/src/calc/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = JSON.parse(readFileSync(path.join(here, 'qual-reference.json'), 'utf8'));
const INP = JSON.parse(readFileSync(path.join(here, 'qual-reference-input.json'), 'utf8'));
let fails = 0, passes = 0;
const quiet = !process.env.VERBOSE;
function record(ok, msg) { if (ok) passes++; else fails++; if (!ok || !quiet) console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); }
function near(label, got, want, tol = 1e-9) { record(Number.isFinite(got) && Math.abs(got - want) <= tol, `${label}: expected ${want}, got ${Number.isFinite(got) ? +got.toPrecision(12) : got}`); }
function same(label, got, want) { record(JSON.stringify(got) === JSON.stringify(want), `${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
const truthy = (label, v) => same(label, !!v, true);
const show = (label, got, want) => console.log(`     ${label}: expected ${want}, got ${got}`);

// ── Splitting ──
{
  const t = `# P1\nI: How was it?\nP1: Fine.\nIt was ok.\n\nP1: Second answer.\n---\nInterview: P2\n[00:01:02] Interviewer: Hello?\nP2: Hi there: honestly, good.\nTranscript 3\nJust some text without labels.\n\nA second paragraph.`;
  const iv = Q.prepare(t);
  same('Interviews from #, ---/Interview:, Transcript headings', iv.map((x) => x.name), ['P1', 'P2', '3']);
  same('P1 turns (paragraphs of a turn joined)', iv[0].segments.map((s) => [s.speaker, s.text, s.interviewer]), [['I', 'How was it?', true], ['P1', 'Fine. It was ok.', false], ['P1', 'Second answer.', false]]);
  same('Timestamp stripped, Interviewer label recognised', iv[1].segments.map((s) => [s.speaker, s.text, s.interviewer]), [['Interviewer', 'Hello?', true], ['P2', 'Hi there: honestly, good.', false]]);
  same('No labels: falls back to paragraphs', iv[2].segments.map((s) => s.text), ['Just some text without labels.', 'A second paragraph.']);
  const para = Q.prepare(t, { mode: 'paragraph' });
  same('Paragraph mode splits a turn at blank lines', para[0].segments.map((s) => s.text), ['How was it?', 'Fine. It was ok.', 'Second answer.']);
  same('"Honestly:" once mid-answer is not a speaker', Q.prepare('P1: Well.\nHonestly: it was hard.\nP1: Next.')[0].segments.map((s) => s.text), ['Well. Honestly: it was hard.', 'Next.']);
  same('Repeated name label is a speaker', Q.prepare('Sam: a\nAlex: b\nSam: c\nAlex: d')[0].segments.length, 4);
  same('Speaker (00:01): label', Q.prepare('Speaker 1 (00:01): hello\nSpeaker 2 (00:05): hi')[0].segments.map((s) => s.speaker), ['Speaker 1', 'Speaker 2']);
  const c = Q.counts(iv);
  same('Counts (interviews, segments, interviewer, words)', [c.interviews, c.segments, c.interviewer, c.words], [3, 7, 2, 22]);
  same('Analysable excludes interviewer turns', Q.analysable(iv).length, 5);
  same('Analysable includes them when asked', Q.analysable(iv, false).length, 7);
  same('Duplicate interview names made unique', Q.splitInterviews('# A\nx\n# A\ny').map((x) => x.name), ['A', 'A (2)']);
}
// ── Anonymising ──
{
  const r = Q.anonymise('Mail jo.bloggs@example.co.uk or call 07700 900123 or +44 20 7946 0018, see https://www.example.com/a?b=1. In 2023 it cost £12.50 at 10:30. Sarah Jones met Sarah at Acme Ltd.', { terms: 'Sarah Jones\nSarah\nAcme Ltd = [employer]' });
  same('Anonymised text', r.text, 'Mail [email] or call [phone] or [phone], see [link]. In 2023 it cost £12.50 at 10:30. [name 1] met [name 2] at [employer].');
  same('Replacement counts', r.n, { emails: 1, phones: 2, urls: 1, terms: 3 });
  same('Whole words only', Q.anonymise('Annabel and Ann', { terms: 'Ann' }).text, 'Annabel and [name 1]');
  same('Name candidates', Q.nameCandidates('P1: I spoke to Priya about it, and then Priya called Dr Shah. Monday was fine.').map((x) => x.word), ['Priya', 'Shah']);
}
// ── Sentiment ──
{
  const s = (t) => SE.scoreText(t);
  near('"good" sum', s('It is good.').sum, 2);
  near('negation: "not good" = 2 × −0.75', s('It is not good.').sum, -1.5);
  near("negation with n't: \"isn't helpful\"", s("It isn't helpful.").sum, -1.5);
  near('negation scope 3 words: "not at all clear"', s('It was not at all clear.').sum, -1.5);
  near('negation stops at punctuation: "No, it is good"', s('No, it is good.').sum, 2);
  near('intensifier: "very good" = 2 × 1.3', s('It is very good.').sum, 2.6);
  near('two intensifiers: "really very slow"', s('It is really very slow.').sum, -1.5 * 1.69);
  near('downtoner: "a bit slow" = −1.5 × 0.7', s('It is a bit slow.').sum, -1.05);
  near('but-clause: "easy but slow" = 2×0.5 − 1.5×1.5', s('It was easy but slow.').sum, 1 - 2.25);
  near('sentence-initial But halves the sentence before', s('It was great. But the login is clunky.').sum, 2.5 * 0.5 - 2 * 1.5);
  near('phrase "not bad" is positive, not double-negated', s('Not bad at all.').sum, 1.5);
  near('compound = S / √(S² + 15)', s('It is good.').score, 2 / Math.sqrt(19), 1e-12);
  same('labels', ['Seamless and intuitive.', 'Confusing and buggy.', 'The page loads.', 'Brilliant design, terribly slow.'].map((t) => s(t).label), ['positive', 'negative', 'neutral', 'mixed']);
  same('UX words in the lexicon', ['confusing', 'intuitive', 'frustrating', 'slow', 'seamless', 'buggy', 'clunky'].map((w) => Math.sign(SE.LEXICON.get(w))), [-1, 1, -1, -1, 1, -1, -1]);
  truthy(`lexicon has a few hundred words (${SE.LEXICON.size})`, SE.LEXICON.size >= 300);
  const ov = SE.scoreSegments([{ id: 'a', text: 'Great.' }], { a: 'negative' }).get('a');
  same('override sets label and score', [ov.label, ov.score, ov.auto], ['negative', -0.5, 'positive']);
  const ru = SE.rollup([{ label: 'positive', score: 0.5 }, { label: 'negative', score: -0.3 }]);
  same('rollup', [ru.n, +ru.mean.toFixed(6), ru.positive, ru.negative], [2, 0.1, 0.5, 0.5]);
}
// ── TF-IDF against scikit-learn ──
{
  const t = Q.tfidf(INP.tfidf.docs);
  let maxd = 0;
  REF.tfidf.vocab.forEach((w, j) => {
    maxd = Math.max(maxd, Math.abs(t.idf.get(w) - REF.tfidf.idf[j]));
    REF.tfidf.scores.forEach((row, d) => { maxd = Math.max(maxd, Math.abs((t.scores[d].get(w) || 0) - row[j])); });
  });
  same('TF-IDF vocabulary = sklearn', [...t.df.keys()].sort(), [...REF.tfidf.vocab]);
  near(`TF-IDF scores and idf vs sklearn (${REF.tfidf.vocab.length} words × ${INP.tfidf.docs.length} interviews), max |diff|`, maxd, 0, 1e-12);
  show('TF-IDF max |JS − sklearn|', maxd.toExponential(2), '0');
  const ww = Q.wordsWorthALook(INP.tfidf.docs, 6);
  truthy('words worth a look: used twice, not in every interview', ww.flat().every((x) => x.count >= 2 && x.df < INP.tfidf.docs.length));
}
// ── Co-occurrence and presence against numpy ──
const ex = exampleProject(Q.emptyProject());
const exSegs = Q.analysable(ex.interviews);
{
  const ids = INP.cooc.codeIds;
  same('Co-occurrence matrix = numpy SᵀS', Q.cooccurrence(ids, exSegs, ex.coding), REF.cooc.C);
  same('Presence matrix = numpy', Q.presence(ids, ex.interviews, exSegs, ex.coding), REF.cooc.presence);
  // The export read by the code-network tool gives the same pair counts.
  const parsed = parseSegments(Q.codeNetworkText(ex, exSegs));
  const cn = cnCooc(parsed);
  const names = ex.codes.map((c) => Q.safeName(c.name).toLowerCase());
  let agree = true;
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    const a = parsed.keys.indexOf(names[i]), b = parsed.keys.indexOf(names[j]);
    const v = i === j ? cn.freq[a] : cn.C[a][b];
    if (v !== REF.cooc.C[i][j]) agree = false;
  }
  truthy('Code-network export parses to the same counts', agree);
  same('Code-network export: one line per coded segment', parsed.segs.length, Object.keys(ex.coding).length);
  const sat = parseCodeLists(Q.saturationText(ex, ex.interviews, exSegs));
  same('Saturation export: one line per coded interview', sat.length, 5);
  same('Saturation export: P1 codes', sat[0].length, 8);
}
// ── LDA ──
{
  const pc = plantedCorpus();
  const corpus = buildCorpus(pc.docs, { minDf: 1, maxDfShare: 1 });
  const fit = lda(corpus, { K: 3, iters: 300, seed: 3 });
  const tops = describeTopics(fit, corpus, { top: 8 }).map((t) => t.words.map((w) => w.word).sort());
  const planted = pc.topics.map((t) => [...t].sort());
  const match = tops.map((t) => planted.findIndex((p) => JSON.stringify(p) === JSON.stringify(t)));
  same('LDA recovers the 3 planted topics (top 8 words = planted sets)', [...match].sort(), [0, 1, 2]);
  show('LDA topics → planted', JSON.stringify(match), 'a permutation of [0,1,2]');
  const skMatch = REF.lda.sklearnTop.map((t) => planted.findIndex((p) => JSON.stringify(p) === JSON.stringify(t)));
  same('scikit-learn LDA recovers the same planted topics', [...skMatch].sort(), [0, 1, 2]);
  const tr = fit.trace;
  truthy(`LDA log-likelihood improves (${tr[0].ll.toFixed(1)} → ${tr.at(-1).ll.toFixed(1)})`, tr.at(-1).ll > tr[0].ll + 100);
  truthy('LDA log-likelihood levels off (last 100 sweeps within 2%)', Math.abs(tr.at(-1).ll - tr.find((t) => t.iter === 200).ll) < 0.02 * Math.abs(tr.at(-1).ll));
  near('LDA log p(w|z) vs scipy gammaln from the same assignments', fit.trace.at(-1).ll, REF.lda.ll, 1e-6);
  show('LDA log p(w|z)', fit.trace.at(-1).ll.toFixed(6), REF.lda.ll.toFixed(6));
  same('Dumped input matches this run (seeded)', fit.z.map((z) => Array.from(z)), INP.lda.z);
  const again = lda(corpus, { K: 3, iters: 300, seed: 3 });
  same('LDA deterministic with a seed', again.z.map((z) => Array.from(z)), fit.z.map((z) => Array.from(z)));
  const other = lda(corpus, { K: 3, iters: 300, seed: 4 });
  truthy('A different seed gives a different chain', JSON.stringify(other.z.map((z) => Array.from(z))) !== JSON.stringify(fit.z.map((z) => Array.from(z))));
  truthy('θ rows sum to 1', fit.theta.every((t) => Math.abs(t.reduce((s, v) => s + v, 0) - 1) < 1e-12));
  truthy('φ rows sum to 1', fit.phi.every((t) => Math.abs(t.reduce((s, v) => s + v, 0) - 1) < 1e-12));
  const truthAcc = fit.theta.filter((t, d) => { const k = t.indexOf(Math.max(...t)); return planted[pc.truth[d]].join() === tops[k].join(); }).length / pc.docs.length;
  truthy(`Documents assigned to their planted topic (${(truthAcc * 100).toFixed(0)}%)`, truthAcc >= 0.95);
  // The example corpus runs and gives readable topics.
  const stop = Q.parseStop(ex.stop);
  const exCorpus = buildCorpus(exSegs.map((s) => Q.contentTokens(s.text, stop)), { minDf: 2 });
  const exFit = lda(exCorpus, { K: 4, iters: 1000, seed: 1 });
  const exTops = describeTopics(exFit, exCorpus).map((t) => t.words.slice(0, 6).map((w) => w.word));
  truthy('Example: one topic is about prescriptions', exTops.some((t) => t.includes('pharmacy') && t.includes('prescriptions')));
  truthy('Example: one topic is about signing in', exTops.some((t) => t.includes('password') || t.includes('verification')));
  if (process.env.SHOW) console.log(exTops);
  same('Stopwords removed', Q.contentTokens("Um, I don't really like the app, it's kind of slow [name 1]"), ['app', 'slow']);
}
// ── Latent class analysis (cluster.js EM) ──
{
  const pl = plantedLca();
  const r = runLCA(pl.C, { seed: 1 });
  same('LCA: BIC picks 2 classes on planted data', r.best, 2);
  const f2 = r.fits.find((f) => f.k === 2);
  near('LCA log-likelihood vs numpy from the fitted parameters', f2.ll, REF.lca.ll, 1e-9);
  near('LCA BIC = −2LL + (1 + 2q) ln n vs numpy', f2.bic, REF.lca.bic, 1e-9);
  near('LCA adjusted Rand index vs planted classes (sklearn)', REF.lca.ari, 1, 1e-12);
  show('LCA LL (k = 2)', f2.ll.toFixed(6), REF.lca.ll.toFixed(6));
  same('LCA parameters k = 1..4', r.fits.map((f) => f.nParams), [6, 13, 20, 27]);
  same('LCA deterministic with a seed', runLCA(pl.C, { seed: 1 }).fits.map((f) => f.ll.toFixed(10)), r.fits.map((f) => f.ll.toFixed(10)));
  truthy('LCA LL does not fall as k rises (k = 1 → 2)', r.fits[1].ll >= r.fits[0].ll);
  // The example: 6 interviews × categories; BIC should not find classes in so little data.
  const M = ex.interviews.map((_, i) => ex.categories.map((cat) => exSegs.filter((s) => s.ii === i && Q.segCategories(new Map(ex.codes.map((c) => [c.id, c])), ex.coding, s.id).includes(cat.id)).length));
  const ld = lcaData(M, ex.categories.map((c) => c.name));
  same('Example LCA data: no constant columns here', [ld.n, ld.q, ld.dropped.length], [6, 4, 0]);
  same('lcaData drops constant columns', lcaData([[1, 0, 1], [1, 1, 0], [1, 0, 0]], ['a', 'b', 'c']).dropped, ['a']);
  same('Example LCA: BIC prefers one class', runLCA(ld.C).best, 1);
}
// ── Editing operations ──
{
  let p = exampleProject(Q.emptyProject());
  const before = Object.values(p.coding).filter((l) => l.includes('c10') || l.includes('c1')).length;
  p = Q.mergeCodes(p, 'c10', 'c1');
  same('merge removes the code', p.codes.some((c) => c.id === 'c10'), false);
  same('merge keeps every segment that had either code', Object.values(p.coding).filter((l) => l.includes('c1')).length, before);
  truthy('merge notes the old code in the memo', p.codes.find((c) => c.id === 'c1').memo.includes('felt like a lottery'));
  const segsWith = Object.keys(p.coding).filter((k) => p.coding[k].includes('c4')).slice(0, 2);
  p = Q.splitCode(p, 'c4', segsWith, 'Locked out');
  const nc = p.codes.find((c) => c.name === 'Locked out');
  same('split moves ticked segments to the new code', segsWith.map((k) => p.coding[k].includes(nc.id) && !p.coding[k].includes('c4')), [true, true]);
  p = Q.deleteCode(p, nc.id);
  truthy('delete removes it from every segment', !Object.values(p.coding).some((l) => l.includes(nc.id)));
  same('toggle twice is a no-op', Q.toggleCode(Q.toggleCode({ a: ['x'] }, 'a', 'y'), 'a', 'y'), { a: ['x'] });
  same('toggle off last code removes the key', Q.toggleCode({ a: ['x'] }, 'a', 'x'), {});
  // Re-splitting keeps codes on unchanged segments.
  const ex2 = exampleProject(Q.emptyProject());
  const edited = ex2.raw.replace('It was back in March.', 'It was back in April.');
  const r = Q.resplit(ex2, Q.prepare(edited, ex2.options));
  same('re-split after editing one segment loses only that coding', r.lost, 1);
  same('re-split keeps the rest', Object.keys(r.project.coding).length, Object.keys(ex2.coding).length - 1);
}
// ── Exports and project file ──
{
  const md = Q.codebookMarkdown(ex, exSegs);
  same('codebook: header + one row per code', md.trim().split('\n').length, 4 + ex.codes.length);
  truthy('codebook row has counts and a quote', md.includes('| Eight o’clock phone scramble |') && /\| 7 \| 5 \| “/.test(md));
  const rows = Q.codedSegmentsRows(ex, exSegs, SE.scoreSegments(exSegs, ex.overrides));
  same('coded segments: header + one row per analysable segment', rows.length, exSegs.length + 1);
  const csv = Q.toDelimited(rows, ',');
  truthy('CSV quotes fields with commas', csv.split('\n')[1].includes('"It was back in March. I had a chest infection'));
  const th = Q.themesMarkdown(ex, exSegs, ex.interviews.length);
  truthy('themes markdown names the core category and storyline', th.includes('**Core category:** Left guessing after acting') && th.includes('## Storyline'));
  const ts = Q.themeSummary(ex, exSegs);
  same('theme interview counts', ts.map((t) => t.interviews), [5, 5, 4, 2]);
  truthy('starred quote leads its theme', ts[0].quotes[0].text.includes('number twenty-three'));
  // Inter-coder round trip: a colleague who agrees on every segment gives alpha = 1.
  const sheet = Q.blindSheet(exSegs).split('\n');
  same('blind sheet has no codes', sheet[1].endsWith(','), true);
  const names = new Map(ex.codes.map((c) => [c.id, Q.safeName(c.name)]));
  const theirs = exSegs.map((s) => `${Q.safeName(s.interview)}-${s.n}\t${names.get(Q.codesOf(ex.coding, s.id)[0]) || '.'}`).join('\n');
  const ic = Q.intercoderText(ex, exSegs, theirs);
  same('inter-coder export matches every segment', [ic.matched, ic.total], [exSegs.length, exSegs.length]);
  const { rows: icRows } = parseCodeRows(ic.text);
  same('inter-coder tool reads two coders per row', icRows.every((r) => r.length === 2), true);
  near('perfect agreement → Krippendorff alpha 1', krippendorffAlpha(icRows).alpha, 1, 1e-12);
  const round = Q.loadProject(Q.saveProject(ex)); const norm = Q.loadProject(ex);
  same('project file round trip', [round.codes, round.categories, round.coding, round.overrides, round.storyline], [norm.codes, norm.categories, norm.coding, norm.overrides, norm.storyline]);
  let threw = false; try { Q.loadProject('{"hello":1}'); } catch { threw = true; }
  truthy('loading a non-project file fails clearly', threw);
  const dirty = Q.loadProject({ ...ex, coding: { ...ex.coding, 'nope#1': ['c1'], 'P1#2': ['c1', 'ghost'] } });
  truthy('loading drops unknown segments and codes', !dirty.coding['nope#1'] && JSON.stringify(dirty.coding['P1#2']) === '["c1"]');
}
// ── Reading your results ──
const CALC_IDS = new Set(CATALOG.map((c) => c.id));
function summary(label, s, level) {
  const text = [s.headline, ...s.meaning, s.confidenceNote, ...s.caveats, ...s.next, s.report].join('\n');
  truthy(`${label}: summary has every part`, s.headline.length > 20 && s.meaning.length >= 1 && s.meaning.length <= 6 && ['high', 'medium', 'low'].includes(s.confidence) && s.confidenceNote.length > 10 && s.caveats.length >= 1 && s.caveats.length <= 3 && s.next.length >= 1 && s.next.length <= 3 && s.report.length > 20);
  same(`${label}: no NaN, undefined or Infinity`, /NaN|undefined|Infinity|\bnull\b/.test(text), false);
  same(`${label}: no "% chance the true value" wording`, /\d+% (chance|probability) (that )?the true/i.test(text), false);
  for (const m of text.matchAll(/\]\((\/[a-z0-9\-/]+)\)/g)) truthy(`${label}: link ${m[1]} exists`, CALC_IDS.has(m[1].split('/')[2]));
  if (level) same(`${label}: confidence`, s.confidence, level);
  if (process.env.SHOW) console.log(`  [${s.confidence}] ${s.headline}\n  ${s.report}`);
  return s;
}
{
  const sat = Q.saturation(ex.codes, ex.interviews, exSegs, ex.coding);
  same('example saturation: new codes per interview', sat.perInterview.map((r) => r.newCodes), [8, 4, 1, 0, 0, 0]);
  same('example saturation: coded, uncoded, once, coded interviews', [sat.coded, sat.uncoded, sat.once, sat.codedInterviews], [30, 9, 2, 5]);
  same('example: new-information ratio needs 6 coded interviews', sat.newInfo, null);
  const s = summary('example', Q.qualSummary({ sat, nInterviews: 6, codes: ex.codes, themes: Q.themeSummary(ex, exSegs), core: ex.core, sentimentShares: SE.rollup(exSegs.map((x) => SE.scoreSegments(exSegs, ex.overrides).get(x.id))) }), 'medium');
  truthy('example headline counts', s.headline.startsWith('13 codes applied to 30 of 39 segments (77%) across 5 of 6 interviews'));
  // Synthetic projects for each confidence level.
  const mk = (perIv, codedShare = 1) => {
    const interviews = perIv.map((codes, i) => ({ name: `P${i + 1}`, segments: Array.from({ length: 10 }, (_, j) => ({ id: `P${i + 1}#${j + 1}`, n: j + 1, speaker: `P${i + 1}`, text: 'Some words here.', interviewer: false })) }));
    const all = [...new Set(perIv.flat())]; const codes = all.map((c) => ({ id: c, name: c, definition: '', include: '', exclude: '', memo: '', category: '', inVivo: false }));
    const coding = {};
    perIv.forEach((cs, i) => { for (let j = 0; j < Math.round(10 * codedShare); j++) coding[`P${i + 1}#${j + 1}`] = [cs[j % cs.length]]; });
    const segs = Q.analysable(interviews);
    return { sat: Q.saturation(codes, interviews, segs, coding), nInterviews: interviews.length, codes };
  };
  const base = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const settled = mk([base.slice(0, 6), base.slice(4, 12), base.slice(8, 16), base.slice(12, 20), base.slice(0, 10), base.slice(10, 20), base.slice(5, 15), base.slice(0, 20)]);
  const hi = summary('settled codebook', Q.qualSummary(settled), 'high');
  near('settled: new-information ratio', settled.sat.newInfo.ratio, 0, 0);
  truthy('settled: cites Guest, Namey and Chen', hi.confidenceNote.includes('Guest, Namey and Chen 2020'));
  const growing = mk([base.slice(0, 4), base.slice(2, 6), base.slice(4, 8), base.slice(6, 10), base.slice(10, 15), base.slice(15, 20)]);
  summary('still growing', Q.qualSummary(growing), 'low');
  near('growing: ratio = 10 new ÷ 10 earlier', growing.sat.newInfo.ratio, 1, 0);
  summary('three interviews', Q.qualSummary(mk([['a'], ['b'], ['c']])), 'low');
  summary('half coded', Q.qualSummary(mk([base.slice(0, 5), base.slice(0, 5), base.slice(0, 5), base.slice(0, 5), base.slice(0, 5), base.slice(0, 5)], 0.4)), 'low');
  summary('six interviews, not settled enough', Q.qualSummary(mk([base.slice(0, 5), base.slice(5, 10), base.slice(10, 15), base.slice(15, 19), base.slice(0, 8), ['c19', 'c0']])), 'medium');
  summary('nothing coded', Q.qualSummary(mk([['a'], ['b']], 0)), 'low');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
