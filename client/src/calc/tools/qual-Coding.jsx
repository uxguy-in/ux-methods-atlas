// Interview coding workbench: paste transcripts, then work through open, axial and selective coding with coaching
// beside each step, followed by sentiment, topic models, latent classes and exports. Everything stays in this browser
// tab: transcripts are never written to localStorage or put in a URL; the project file download is the way to save.
// Logic: qual-core.js (splitting, counts, exports, summary), qual-sentiment.js, qual-lda.js and qual-lca.js (both run
// in qual.worker.js), the example in qual-example.js and the coaching text in qual-coach.js.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import { TabList, tabPanelProps } from '../../components/CalcLearn.jsx';
import * as Q from './qual-core.js';
import { rollup, scoreSegments } from './qual-sentiment.js';
import { buildCorpus, describeTopics, lda as runLdaSync } from './qual-lda.js';
import { runLCA } from './qual-lca.js';
import { exampleProject } from './qual-example.js';
import { AxialStep, Coach, ExportStep, OpenStep, PatternsStep, PrepareStep, SelectiveStep, SentimentStep } from './qual-steps.jsx';
import { About, download } from './ui.jsx';
import './qual.css';

const STEPS = [
  ['prepare', '1. Prepare'], ['open', '2. Open coding'], ['axial', '3. Axial coding'], ['selective', '4. Themes'],
  ['sentiment', '5. Sentiment'], ['patterns', '6. Patterns'], ['export', '7. Export'],
];

// Runs a job in qual.worker.js, falling back to the main thread if workers are unavailable.
function useJob() {
  const [st, setSt] = useState({ busy: false, progress: 0, result: null, error: '' });
  const ref = useRef(null);
  useEffect(() => () => ref.current?.terminate(), []);
  const run = useCallback((msg, fallback, decorate = (r) => r) => {
    ref.current?.terminate(); ref.current = null;
    setSt((s) => ({ ...s, busy: true, progress: 0, error: '' }));
    const done = (result) => setSt({ busy: false, progress: 1, result: decorate(result), error: '' });
    const fail = (e) => setSt((s) => ({ ...s, busy: false, error: e }));
    let w = null;
    try { w = new Worker(new URL('./qual.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
    if (!w) { setTimeout(() => { try { done(fallback()); } catch (e) { fail(e.message || String(e)); } }, 30); return; }
    ref.current = w;
    w.onmessage = ({ data }) => {
      if (data.progress !== undefined) { setSt((s) => ({ ...s, progress: data.progress })); return; }
      w.terminate(); if (ref.current === w) ref.current = null;
      if (data.error) fail(data.error); else done(data.result);
    };
    w.onerror = () => { w.terminate(); ref.current = null; try { done(fallback()); } catch (e) { fail(e.message || String(e)); } };
    w.postMessage({ id: 1, ...msg });
  }, []);
  const clear = useCallback(() => { ref.current?.terminate(); ref.current = null; setSt({ busy: false, progress: 0, result: null, error: '' }); }, []);
  return [st, run, clear];
}

function QualCoding() {
  const [p, setP] = useState(() => exampleProject(Q.emptyProject()));
  const [tab, setTab] = useState('open');
  const [selCode, setSelCode] = useState('');
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [lda, runLdaJob, clearLda] = useJob();
  const [lca, runLcaJob, clearLca] = useJob();
  const up = useCallback((fn) => { setP((q) => fn(q)); setDirty(true); }, []);

  // Warn before leaving with unsaved work: nothing is stored anywhere else.
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const o = p.options;
  const segs = useMemo(() => Q.analysable(p.interviews, o.excludeInterviewer), [p.interviews, o.excludeInterviewer]);
  const codesById = useMemo(() => new Map(p.codes.map((c) => [c.id, c])), [p.codes]);
  const stats = useMemo(() => Q.codeStats(p.codes, segs, p.coding), [p.codes, segs, p.coding]);
  const counts = useMemo(() => Q.counts(p.interviews, o.excludeInterviewer), [p.interviews, o.excludeInterviewer]);
  const worth = useMemo(() => Q.wordsWorthALook(p.interviews.map((_, i) => segs.filter((s) => s.ii === i).flatMap((s) => Q.contentTokens(s.text))), 8), [p.interviews, segs]);
  const sentiment = useMemo(() => scoreSegments(segs, p.overrides), [segs, p.overrides]);
  const themes = useMemo(() => Q.themeSummary(p, segs), [p.codes, p.categories, p.coding, p.starred, segs]);
  const sentAll = useMemo(() => rollup(segs.map((s) => sentiment.get(s.id))), [segs, sentiment]);
  const sentRollups = useMemo(() => ({
    interview: p.interviews.map((iv, i) => ({ name: iv.name, r: rollup(segs.filter((s) => s.ii === i).map((s) => sentiment.get(s.id))) })).filter((x) => x.r.n),
    code: p.codes.map((c) => ({ name: c.name, r: rollup(stats.get(c.id).segs.map((s) => sentiment.get(s.id))) })).filter((x) => x.r.n),
    category: p.categories.map((cat) => ({ name: cat.name, r: rollup(segs.filter((s) => Q.segCategories(codesById, p.coding, s.id).includes(cat.id)).map((s) => sentiment.get(s.id))) })).filter((x) => x.r.n),
  }), [p.interviews, p.codes, p.categories, p.coding, segs, sentiment, stats, codesById]);
  const sat = useMemo(() => Q.saturation(p.codes, p.interviews, segs, p.coding), [p.codes, p.interviews, segs, p.coding]);
  const d = { segs, codesById, stats, counts, worth, sentiment, themes, sentAll, sentRollups };

  // Live preview of a re-split, to warn before codes are lost.
  const preview = useMemo(() => {
    const next = Q.prepare(p.raw, o);
    const changed = JSON.stringify(next.map((iv) => iv.segments.map((s) => [s.id, s.text, s.interviewer]))) !== JSON.stringify(p.interviews.map((iv) => iv.segments.map((s) => [s.id, s.text, s.interviewer])));
    return { next, changed, lost: changed ? Q.resplit(p, next).lost : 0 };
  }, [p.raw, o.mode, o.interviewerLabels, p.interviews, p.coding]);
  const onSplit = () => {
    const { project, lost } = Q.resplit(p, preview.next);
    if (lost && !window.confirm(`Splitting again removes the codes from ${Q.plural(lost, 'segment')} whose text changed. Continue?`)) return;
    up(() => project); clearLda(); clearLca();
    setNote(`Split into ${Q.plural(preview.next.length, 'interview')} and ${Q.plural(preview.next.reduce((t, iv) => t + iv.segments.length, 0), 'segment')}.`);
  };

  const loadExample = () => { setP(exampleProject(Q.emptyProject())); setDirty(false); setSelCode(''); clearLda(); clearLca(); setTab('open'); setNote('Example loaded: six fictional interviews about a GP surgery app, partly coded.'); };
  const onClear = () => {
    if (dirty && !window.confirm('Start a new project? Anything you have not downloaded will be lost.')) return;
    setP(Q.emptyProject()); setDirty(false); setSelCode(''); clearLda(); clearLca(); setTab('prepare'); setNote('New, empty project. Paste your transcripts below.');
  };
  const onSave = () => { download(`coding-project-${new Date().toISOString().slice(0, 10)}.json`, Q.saveProject(p), 'application/json'); setDirty(false); };
  const onLoad = (file) => {
    const r = new FileReader();
    r.onload = () => {
      try { setP(Q.loadProject(String(r.result))); setDirty(false); setSelCode(''); clearLda(); clearLca(); setTab('open'); setNote(`Loaded ${file.name}.`); } catch (e) { setNote(`Could not load that file: ${e.message}`); }
    };
    r.readAsText(file);
  };

  const runLda = (opts, corpusOpts) => {
    const stop = Q.parseStop(p.stop);
    const tokDocs = segs.map((s) => Q.contentTokens(s.text, stop));
    runLdaJob({ type: 'lda', tokDocs, opts, corpusOpts }, () => {
      const corpus = buildCorpus(tokDocs, corpusOpts); const fit = runLdaSync(corpus, opts);
      return { topics: describeTopics(fit, corpus), trace: fit.trace, theta: fit.theta.map((t) => Array.from(t)), V: fit.V, tokens: corpus.tokens, D: fit.D, docLen: corpus.docs.map((x) => x.length), opts };
    }, (r) => ({ ...r, minDf: corpusOpts.minDf }));
  };
  const runLca = (ld, items, on) => runLcaJob({ type: 'lca', C: ld.C, opts: { seed: 1 } }, () => runLCA(ld.C, { seed: 1 }), (r) => ({ ...r, names: ld.names, on }));

  const exports = useMemo(() => buildExports(p, d, lda.result), [p, segs, sentiment, lda.result]);
  const summary = useMemo(() => Q.qualSummary({ sat, nInterviews: p.interviews.length, codes: p.codes, themes, core: p.core, sentimentShares: segs.length ? sentAll : null }), [sat, p.interviews.length, p.codes, themes, p.core, sentAll, segs.length]);

  const tabs = STEPS.map(([id, label]) => ({ id, label, count: id === 'open' ? (segs.length ? `${sat.coded}/${segs.length}` : undefined) : id === 'axial' ? (p.categories.length || undefined) : undefined }));
  return (
    <div className="qc-root">
      <p className="qc-privacy"><b>Your transcripts stay in this browser tab.</b> Nothing is uploaded, stored in your browser or put in a link. Anonymise before you code, and download the project file to save your work.</p>
      <div className="tl-row">
        <button type="button" className="btn ghost small" onClick={loadExample}>Load example</button>
        <button type="button" className="btn ghost small" onClick={onClear}>Start a new project</button>
        {dirty && <span className="qtag opp">Unsaved changes</span>}
        {note && <span className="tl-note" role="status">{note}</span>}
      </div>
      <TabList items={tabs} value={tab} onChange={setTab} label="Coding steps" idBase="qc" className="qc-tabs" />
      <div className="qc-layout" {...tabPanelProps('qc', tab)}>
        <div className="qc-panel-main">
          {tab === 'prepare' && <PrepareStep p={p} up={up} d={d} onSplit={onSplit} preview={preview} />}
          {tab === 'open' && <OpenStep p={p} up={up} d={d} selCode={selCode} setSelCode={setSelCode} />}
          {tab === 'axial' && <AxialStep p={p} up={up} d={d} selCode={selCode} setSelCode={setSelCode} />}
          {tab === 'selective' && <SelectiveStep p={p} up={up} d={d} />}
          {tab === 'sentiment' && <SentimentStep p={p} up={up} d={d} />}
          {tab === 'patterns' && <PatternsStep p={p} up={up} d={d} lda={lda} runLda={runLda} lca={lca} runLca={runLca} />}
          {tab === 'export' && <ExportStep p={p} d={d} exports={exports} onSave={onSave} onLoad={onLoad} onClear={onClear} />}
        </div>
        <Coach step={tab} />
      </div>
      {tab !== 'prepare' && segs.length > 0 && <StudySummary {...summary} />}
      <About method="open-axial-and-selective-coding-pipeline" links={[['open-coding-constant-comparative-method', 'Open coding and constant comparison'], ['axial-coding', 'Axial coding'], ['selective-coding-and-core-category-identification', 'Selective coding and the core category'], ['grounded-theory', 'Grounded theory'], ['thematic-analysis', 'Thematic analysis'], ['in-vivo-coding', 'In-vivo coding'], ['focused-coding-charmaz', 'Focused coding (Charmaz)'], ['analytic-memo-writing', 'Analytic memo writing'], ['start-list-coding-with-a-structured-codebook-and-check-coding', 'Codebook coding and check-coding'], ['template-analysis', 'Template analysis'], ['framework-analysis', 'Framework analysis'], ['gioia-data-structure-coding-first-order-to-aggregate-dimensions', 'Gioia data structure'], ['content-analysis', 'Content analysis'], ['sentiment-analysis', 'Sentiment analysis'], ['latent-dirichlet-allocation-lda-for-qualitative-scale-up', 'LDA topic modelling'], ['latent-class-analysis-for-personas', 'Latent class analysis']]}>
        <p><b>The method.</b> Open coding labels what is going on in each segment and compares each new segment with the others under the same code (constant comparison, Glaser and Strauss 1967). Axial coding relates codes to each other in categories, using Strauss and Corbin’s (1998) paradigm model of conditions, context, actions and interactions, and consequences as prompts. Selective coding chooses a core category and writes the storyline that connects the rest. The categories double as themes for thematic analysis (Braun and Clarke 2006), as a template for template analysis, or as the columns of a framework matrix (the interviews × codes table). The tool keeps the analysis in your hands: it counts and arranges, but never applies a code.</p>
        <p><b>Splitting.</b> An interview starts at a heading line (# P3, Interview: P3, Transcript 3) or a line of three dashes. A segment starts at each speaker label (P3:, I:, Interviewer:) or, if you choose, at each blank line. A label counts as a speaker if it is a common one (I, Q, P3, Interviewer, Moderator…) or starts at least two lines. Interviewer turns are kept for context and left out of every count by default.</p>
        <p><b>Words worth a look</b> use TF-IDF with each interview as a document: score = count × [ln((1 + N) ÷ (1 + df)) + 1], N interviews and df the interviews using the word (the smoothed idf of scikit-learn). Words used at least twice and not in every interview are listed. <b>Co-occurrence</b> counts segments carrying both codes; the interview matrix counts segments per interview. <b>Saturation</b> lists the codes first used in each interview; the new-information ratio divides the new codes in the last two coded interviews by those found earlier (Guest, Namey and Chen 2020 suggest stopping at 5% or less after a base of 4 to 6 interviews).</p>
        <p><b>Sentiment</b> sums word valences (−3 to +3) from a word list written for this site, with about 460 common and UX words such as intuitive, seamless, confusing, clunky, buggy and slow, and 38 phrases. A negator up to three words before (not, never, -n’t, without, hardly) multiplies a valence by −0.75; a booster (very, really, so) by 1.3 and a softener (slightly, a bit, kind of) by 0.7; in a sentence with “but” or “however”, words before it count half and words after one and a half times. The compound score is S ÷ √(S² + 15), the normalisation of VADER (Hutto and Gilbert 2014). Positive at 0.05 or more, negative at −0.05 or less, mixed when both positive and negative sums reach 0.9 and the smaller is at least half the larger.</p>
        <p><b>Topic modelling</b> is latent Dirichlet allocation fitted by collapsed Gibbs sampling (Griffiths and Steyvers 2004): each word’s topic is redrawn with probability ∝ (n<sub>dk</sub> + α)(n<sub>kw</sub> + β) ÷ (n<sub>k</sub> + Vβ); topics’ word probabilities are φ<sub>kw</sub> = (n<sub>kw</sub> + β) ÷ (n<sub>k</sub> + Vβ) and segments’ topic shares θ<sub>dk</sub> = (n<sub>dk</sub> + α) ÷ (n<sub>d</sub> + Kα). Words in fewer than the minimum number of segments or in more than half of them are left out. The fit is log p(w | z), which should rise and level off. The sampler is seeded, so the same settings give the same topics. Checked by recovering planted topics in a synthetic corpus and against scikit-learn’s LDA (<code>npm run check:qual</code>).</p>
        <p><b>Latent class analysis</b> treats each code or category as present or absent in an interview and fits k = 1 to 4 classes by EM with 20 random starts, using the same code as the Cluster to personas calculator (checked there against StepMix and poLCA): P(x) = Σ<sub>c</sub> π<sub>c</sub> Π<sub>j</sub> θ<sub>cj</sub><sup>x<sub>j</sub></sup>(1 − θ<sub>cj</sub>)<sup>1 − x<sub>j</sub></sup>, with one pseudo-answer per item and class so no θ is exactly 0 or 1. BIC = −2 log L + P ln n picks k, with P = (k − 1) + k × items.</p>
        <p><b>When not to use it.</b> For reflexive thematic analysis the counts and agreement exports matter less than your interpretation; use the tool to organise, not to prove. Do not report sentiment, topics or classes as findings without reading the segments behind them: with 5 to 30 interviews, LDA and latent classes are unstable and the word list misreads sarcasm and domain language. Do not paste transcripts you are not allowed to process on this device, and anonymise them first.</p>
      </About>
    </div>
  );
}

// The exports offered in step 7, each with its text, file name and a note on where it goes.
function buildExports(p, d, ldaRes) {
  const segs = d.segs, n = p.interviews.length;
  const rows = Q.codedSegmentsRows(p, segs, d.sentiment);
  const sentRows = [['level', 'name', 'segments', 'mean_score', 'positive', 'mixed', 'neutral', 'negative'],
    ...Object.entries(d.sentRollups).flatMap(([lvl, list]) => list.map((x) => [lvl, x.name, x.r.n, x.r.mean.toFixed(3), x.r.positive.toFixed(3), x.r.mixed.toFixed(3), x.r.neutral.toFixed(3), x.r.negative.toFixed(3)]))];
  const topics = ldaRes ? [`# Topics (LDA, K = ${ldaRes.opts.K}, seed ${ldaRes.opts.seed}, ${ldaRes.opts.iters} iterations)`, '', 'Topics are prompts for coding, not findings.', '',
    ...ldaRes.topics.flatMap((t) => [`## Topic ${t.k + 1} (${Q.pctS(t.share)} of words)`, '', t.words.map((w) => `${w.word} (${(w.p * 100).toFixed(1)}%)`).join(', '), '', ...t.docs.map((x) => (segs[x.doc] ? `> “${Q.shortQuote(segs[x.doc].text, 240)}” (${segs[x.doc].interview}-${segs[x.doc].n}, ${Q.pctS(x.theta)})` : '')).filter(Boolean), ''])].join('\n') : '';
  return [
    { id: 'codebook', label: 'Codebook', file: 'codebook.md', type: 'text/markdown', text: p.codes.length ? Q.codebookMarkdown(p, segs) : '', empty: 'No codes yet.', note: 'A Markdown table: code, definition, include and exclude notes, category, segments, interviews and an example quote. Pastes into Notion, Confluence, GitHub and most docs that read Markdown.' },
    { id: 'segments', label: 'Coded segments (CSV)', file: 'coded-segments.csv', type: 'text/csv', text: Q.toDelimited(rows, ','), note: 'One row per analysed segment: interview, segment, speaker, text, codes, categories, sentiment score and label, memo. Opens in Excel or Google Sheets.' },
    { id: 'segments-tsv', label: 'Coded segments (TSV)', file: 'coded-segments.tsv', type: 'text/tab-separated-values', text: Q.toDelimited(rows, '\t'), note: 'The same table separated by tabs: copy and paste straight into a spreadsheet.' },
    { id: 'themes', label: 'Themes', file: 'themes.md', type: 'text/markdown', text: p.categories.length ? Q.themesMarkdown(p, segs, n) : '', empty: 'No categories yet.', note: 'Core category, storyline, then each theme with its counts, codes, paradigm notes and example quotes, in Markdown.' },
    { id: 'sentiment', label: 'Sentiment table', file: 'sentiment.csv', type: 'text/csv', text: Q.toDelimited(sentRows, ','), note: 'Mean score and share of each label by interview, code and category, with your overrides applied. A rough guide: quote segments alongside it.' },
    { id: 'topics', label: 'Topics', file: 'topics.md', type: 'text/markdown', text: topics, empty: 'Run the topic model in step 6 first.', note: 'Top words and most typical segments of each topic.' },
    { id: 'network', label: 'For co-occurrence network', file: 'coded-segments-for-network.txt', type: 'text/plain', text: Q.codeNetworkText(p, segs), link: ['code-network', 'Code co-occurrence network'], note: 'One coded segment per line, “id: code, code”, the input of the Code co-occurrence network calculator. Commas and colons in code names become spaces.' },
    { id: 'saturation', label: 'For saturation', file: 'codes-per-interview.txt', type: 'text/plain', text: Q.saturationText(p, p.interviews, segs), link: ['saturation', 'Saturation and coverage'], note: 'One interview per line, in order, listing the codes it uses: the input of the Saturation and coverage calculator.' },
  ];
}

export default QualCoding;
