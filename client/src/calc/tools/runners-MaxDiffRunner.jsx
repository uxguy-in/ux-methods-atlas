import { useEffect, useMemo, useRef, useState } from 'react';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as M from './runners-maxdiff.js';
import * as C from './runners-common.js';
import { Choice, Num, Result, Stats, Problem, About, download, copyText, num, pct } from './ui.jsx';
import { RunFrame, DoneScreen, ShareBox, CodesBox, ShareChart, linkFor } from './runners-ui.jsx';

const DRAFT_KEY = 'uxatlas:maxdiff-runner:draft';
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

// ── Participant ──
function Participant({ study, preview, onExit }) {
  const V = study.d.length;
  const start = () => {
    const x = M.pickVersion(V, preview ? null : C.loadSessions(M.TOOL, study.id).length);
    const sets = study.d[x];
    return { x, order: C.shuffle(C.range(sets.length)), shown: sets.map((s) => C.shuffle(s)) };
  };
  const [plan, setPlan] = useState(start);
  const [pid, setPid] = useState(() => `R-${M.newId().slice(0, 5)}`);
  const [phase, setPhase] = useState('intro');
  const [pos, setPos] = useState(0);
  const [best, setBest] = useState(-1);
  const [worst, setWorst] = useState(-1);
  const [answers, setAnswers] = useState([]);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const t0 = useRef(0);
  const total = plan.order.length;
  const si = plan.order[pos];
  const next = () => {
    const all = [...answers, [si, best, worst]];
    setAnswers(all); setBest(-1); setWorst(-1);
    if (pos + 1 < total) { setPos(pos + 1); return; }
    const r = { v: 1, t: 'mdxr', s: study.id, p: pid, d: Date.now(), x: plan.x, k: all, ms: Math.round(performance.now() - t0.current) };
    const c = M.encodeResult(r);
    setCode(c); setSaved(preview ? false : C.saveSession(M.TOOL, study.id, c)); setPhase('done');
  };
  const again = () => { setPlan(start()); setPid(`R-${M.newId().slice(0, 5)}`); setPos(0); setAnswers([]); setCode(''); setPhase('intro'); };
  const pickB = (i) => { setBest(i); if (worst === i) setWorst(-1); };
  const pickW = (i) => { setWorst(i); if (best === i) setBest(-1); };
  return (
    <RunFrame label={`MaxDiff survey: ${study.n}`} preview={preview} onExit={onExit} scrollKey={`${phase}-${pos}`}>
      {phase === 'intro' && (
        <>
          <p className="eyebrow">Survey</p>
          <h1>{study.n}</h1>
          {study.q && <p>{study.q}</p>}
          <p>You'll see {total} short lists of {study.d[0][0].length} items. In each list, choose the one that is <b>{study.b.toLowerCase()}</b> to you and the one that is <b>{study.w.toLowerCase()}</b>. Items come back in different combinations; that is on purpose, so answer each list on its own.</p>
          <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
          <div className="tt-actions"><button type="button" className="btn" onClick={() => { t0.current = performance.now(); setPhase('set'); }}>Start</button></div>
        </>
      )}
      {phase === 'set' && (
        <>
          <div className="prog">Set {pos + 1} of {total}</div>
          <div className="rn-progress" aria-hidden="true"><i style={{ width: `${(pos / total) * 100}%` }} /></div>
          {study.q && <div className="task">{study.q}</div>}
          <table className="rn-md">
            <thead><tr><th scope="col">{study.b}</th><th scope="col">Item</th><th scope="col">{study.w}</th></tr></thead>
            <tbody>{plan.shown[si].map((it) => (
              <tr key={it}>
                <td><button type="button" className={`best${best === it ? ' on' : ''}`} aria-pressed={best === it} aria-label={`${study.b}: ${study.it[it]}`} onClick={() => pickB(it)}>{best === it ? '✓' : ''}</button></td>
                <td className="it">{study.it[it]}</td>
                <td><button type="button" className={`worst${worst === it ? ' on' : ''}`} aria-pressed={worst === it} aria-label={`${study.w}: ${study.it[it]}`} onClick={() => pickW(it)}>{worst === it ? '✕' : ''}</button></td>
              </tr>
            ))}</tbody>
          </table>
          <div className="tt-actions"><button type="button" className="btn" disabled={best < 0 || worst < 0 || best === worst} onClick={next}>{pos + 1 < total ? 'Next' : 'Finish'}</button></div>
          <p className="tl-note">Choose one in each column; they must be different items.</p>
        </>
      )}
      {phase === 'done' && <DoneScreen code={code} title={study.n} saved={saved} preview={preview} onAgain={again} onExit={onExit} />}
    </RunFrame>
  );
}

// ── Pair co-occurrence heatmap ──
function PairMap({ rep, names }) {
  const J = rep.J, cell = J > 24 ? 9 : 14, pad = 6, W = pad * 2 + J * cell, max = Math.max(1, rep.pairMax);
  return (
    <div className="tl-scroll" style={{ maxWidth: W + 2, border: 0 }}>
      <svg className="rn-plot" viewBox={`0 0 ${W} ${W}`} width={W} height={W} role="img" aria-label={`How often each pair of items appears together: ${rep.pairMin} to ${rep.pairMax} times`}>
        {C.range(J).map((a) => C.range(J).map((b) => {
          const v = a === b ? null : rep.pairs[a * J + b];
          return <rect key={`${a}-${b}`} x={pad + b * cell} y={pad + a * cell} width={cell - 1} height={cell - 1} style={{ fill: v == null ? 'var(--bg-sunk)' : v === 0 ? 'var(--bad)' : 'var(--c1)', opacity: v == null ? 1 : v === 0 ? 0.8 : 0.2 + 0.8 * (v / max) }}><title>{v == null ? names[a] : `${names[a]} + ${names[b]}: ${v} together`}</title></rect>;
        }))}
      </svg>
    </div>
  );
}

// ── Analysis ──
function Analysis({ study, codes, setCodes }) {
  const [robust, setRobust] = useState(true);
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => C.parseCodes(codes, M.decodeResult, study.id), [codes, study.id]);
  const an = useMemo(() => M.analyse(study, parsed.results, { robust }), [study, parsed, robust]);
  const sum = useMemo(() => M.summary(an, study), [an, study]);
  const exportText = useMemo(() => M.countsFormat(study, an.tasks), [study, an]);
  const mdHref = linkFor(useHref('/calculators/maxdiff'));
  const f = an.fit;
  const maxX = f ? Math.min(1, Math.ceil(Math.max(...f.shareHi) * 10) / 10) : 1;
  return (
    <div className="clu-root rn-an">
      <div>
        <CodesBox tool={M.TOOL} studyId={study.id} codes={codes} setCodes={setCodes} parsed={parsed}>
          <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`maxdiff-answers-${study.id}.csv`, M.answersCsv(study, parsed.results), 'text/csv')}>Download answers (CSV)</button>
          <button type="button" className="btn ghost small" disabled={!f} onClick={() => download(`maxdiff-summary-${study.id}.md`, M.markdown(study, an, sum), 'text/markdown')}>Download summary (Markdown)</button>
        </CodesBox>
      </div>
      {!an.n ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : !f ? <Problem>The logit needs answers from at least two respondents; the count scores are below.</Problem> : (
        <>
          <Result big={study.it[an.order[0]]} label={`Most preferred of ${an.J} items: ${pct(f.share[an.order[0]], 1)} share of preference, from ${an.n} respondents and ${an.tasks.length} sets`} />
          {(!f.converged || f.separated) && <Problem>The model did not settle on finite values for every item (an item was almost always or never chosen). Read the count scores for those items.</Problem>}
          <ShareChart label="Share of preference with 95% intervals" max={maxX} refLine={1 / an.J} rows={an.order.map((i) => ({ label: study.it[i], share: f.share[i], lo: f.shareLo[i], hi: f.shareHi[i] }))} />
          <p className="tl-note">Share of preference: how often each item would be chosen as best if all {an.J} were offered at once. Whiskers: 95% delta-method intervals. Dashed line: equal shares ({pct(1 / an.J, 1)}).</p>
          <div className="calc-inputs"><Choice label="Standard errors" value={robust ? 'r' : 'm'} onChange={(v) => setRobust(v === 'r')} options={[['r', 'Clustered by respondent'], ['m', 'Model (each choice independent)']]} /></div>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="MaxDiff scores">
            <thead><tr><th>Rank</th><th>Item</th><th>Share (95% CI)</th><th>Utility (95% CI)</th><th>Best</th><th>Worst</th><th>Shown</th><th>(B − W) / shown</th></tr></thead>
            <tbody>{an.order.map((i, r) => { const c = an.counts.find((x) => x.item === study.it[i]) || {}; return (
              <tr key={i}><td>{r + 1}</td><td style={{ whiteSpace: 'normal' }}>{study.it[i]}</td><td>{pct(f.share[i], 1)} ({pct(f.shareLo[i], 1)}–{pct(f.shareHi[i], 1)})</td><td>{num(f.u[i])} ({num(f.lo[i])} to {num(f.hi[i])})</td><td>{c.best ?? 0}</td><td>{c.worst ?? 0}</td><td>{c.shown ?? 0}</td><td>{num(c.norm)}</td></tr>
            ); })}</tbody>
          </table></div>
          <Stats rows={[
            ['Log-likelihood', `${num(f.ll, 2)} (all items equal: ${num(f.ll0, 2)})`],
            ['Likelihood-ratio test', `χ²(${f.df}) = ${num(f.lr, 1)}, ${C.pText(f.pLR)}`],
            ['McFadden ρ²', num(f.rho2, 3)],
            [`${study.it[an.order[0]]} vs ${study.it[an.order[1]]}`, `difference ${num(an.top2.d)} (SE ${num(an.top2.se)}), ${C.pText(an.top2.p)}`],
            ['Agreement with count scores', `Spearman ρ = ${num(an.rCounts, 3)}`],
            ['Estimation', `${f.converged ? 'converged' : 'did not converge'} in ${f.iter + 1} Newton steps; ${f.nChoices} choices (best and worst per set)`],
          ]} />
          {sum && <StudySummary {...sum} />}
        </>
      )}
      {an.tasks.length > 0 && (
        <div>
          <h3 className="clu-h3">Use with the MaxDiff counts calculator</h3>
          <p className="tl-note" style={{ marginBottom: 8 }}>One line per answered set, in its format (items shown | best | worst). Copy the lines, open the calculator and paste them into its box, replacing the sample. Commas, semicolons and bars inside item names become spaces.</p>
          <textarea className="tl-code" readOnly rows={4} value={exportText} aria-label="Answers in the MaxDiff counts format" onFocus={(e) => e.target.select()} />
          <div className="clu-actions" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={async () => setCopied(await copyText(exportText))}>{copied ? 'Copied' : 'Copy lines'}</button>
            <a className="btn ghost small" href={mdHref} target="_blank" rel="noopener noreferrer">Open MaxDiff counts in a new tab</a>
            <button type="button" className="btn ghost small" onClick={() => download(`maxdiff-tasks-${study.id}.txt`, exportText, 'text/plain')}>Download lines (TXT)</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Builder ──
function Builder({ draft, setDraft, study, link, onPreview }) {
  const [busy, setBusy] = useState(false);
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const items = M.parseItems(draft.items);
  const J = items.length, k = clampInt(draft.k, 2, 7, 4), S = clampInt(draft.S, 1, 60, M.recommendedSets(J, k)), V = clampInt(draft.V, 1, 20, 1);
  const des = draft.design;
  const fits = des && des.length === V && des[0].length === S && des[0][0].length === k && des.every((sets) => sets.every((s) => s.every((x) => x < J))) && draft.designJ === J;
  const rep = useMemo(() => (fits ? M.balance(des, J) : null), [des, J, fits]);
  const generate = () => {
    const opts = { J, k, S, V, seed: Math.floor(Math.random() * 1e9) + 1 };
    setBusy(true);
    const done = (res) => { setBusy(false); if (res) setDraft({ ...draft, design: res.versions, designJ: J }); };
    try {
      worker.current?.terminate();
      const w = new Worker(new URL('./runners-maxdiff.worker.js', import.meta.url), { type: 'module' });
      worker.current = w;
      let finished = false;
      w.onmessage = ({ data }) => { finished = true; done(data.error ? null : data.result); w.terminate(); };
      w.onerror = () => { if (!finished) { finished = true; done(M.makeDesign(opts)); } };
      w.postMessage({ id: 1, opts });
    } catch { done(M.makeDesign(opts)); }
  };
  const problems = [];
  if (J < 3) problems.push('Enter at least three items.');
  if (J > 40) problems.push('Use 40 items or fewer.');
  if (k >= J) problems.push('Show fewer items per set than there are items.');
  if (!fits && J >= 3 && k < J) problems.push('Generate the design for these settings.');
  const perResp = J ? (S * k) / J : 0;
  return (
    <div className="clu-root rn-an">
      <div className="calc-inputs">
        <label className="calc-field wide"><span>Study name</span><input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} /></label>
        <label className="calc-field wide"><span>Question shown above every set</span><input type="text" value={draft.question} onChange={(e) => set({ question: e.target.value })} style={{ width: '100%', maxWidth: 720 }} /></label>
        <label className="calc-field"><span>Best label</span><input type="text" value={draft.bestLabel} onChange={(e) => set({ bestLabel: e.target.value })} style={{ width: 200 }} /></label>
        <label className="calc-field"><span>Worst label</span><input type="text" value={draft.worstLabel} onChange={(e) => set({ worstLabel: e.target.value })} style={{ width: 200 }} /></label>
        <label className="calc-field wide"><span>Items, one per line ({J})</span><textarea rows={8} value={draft.items} onChange={(e) => set({ items: e.target.value })} /><small>Short, parallel wording works best (all features, or all benefits). Changing the number of items needs a new design; rewording keeps it.</small></label>
      </div>
      <div>
        <h3 className="clu-h3">Design</h3>
        <div className="calc-inputs">
          <Num label="Items per set" value={draft.k} onChange={(v) => set({ k: v })} min={2} max={7} hint="4 or 5 is usual." />
          <Num label="Sets per respondent" value={draft.S} onChange={(v) => set({ S: v })} min={1} max={60} hint={`Recommended ${J >= 3 ? M.recommendedSets(J, k) : '—'}: each item about 3 times.`} />
          <Num label="Versions" value={draft.V} onChange={(v) => set({ V: v })} min={1} max={20} hint="Different sets for different people; balance improves." />
        </div>
        <div className="clu-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn small" disabled={busy || J < 3 || k >= J} onClick={generate}>{busy ? 'Generating…' : fits ? 'Generate a new design' : 'Generate design'}</button>
          {fits && <button type="button" className="btn ghost small" onClick={() => download(`maxdiff-design-${study.id}.csv`, M.designCsv(study), 'text/csv')}>Download design (CSV)</button>}
        </div>
      </div>
      {rep && (
        <div>
          <h3 className="clu-h3">Balance {rep.bibd ? <span className="qtag promote">Balanced incomplete block design</span> : <span className="qtag">Near-balanced</span>}</h3>
          <Stats rows={[
            ['Each item per respondent', rep.perVersionMin === rep.perVersionMax ? `${rep.perVersionMin} times` : `${rep.perVersionMin}–${rep.perVersionMax} times`],
            ['Each item across all versions', rep.itemMin === rep.itemMax ? `${rep.itemMin} times` : `${rep.itemMin}–${rep.itemMax} times`],
            ['Each pair shown together', `${rep.pairMin}–${rep.pairMax} times (mean ${num(rep.pairMean)}, SD ${num(rep.pairSd)})`],
            ['Pairs never shown together', `${rep.pairsNever} of ${rep.nPairs}`],
            ['Repeats within a set', rep.repeats ? `${rep.repeats}` : 'none'],
            ['Position in the set', 'randomised for every participant'],
          ]} />
          {perResp < 3 && <Problem>Each item is shown about {num(perResp, 1)} times per respondent. Sawtooth Software's MaxDiff guidance is at least 3 for stable scores; add sets or reduce items.</Problem>}
          {rep.pairsNever > 0 && <p className="tl-note">Some pairs never meet. That is fine for pooled scores (items are linked through others), but more versions spread pairs more evenly.</p>}
          <PairMap rep={rep} names={items} />
          <p className="tl-note">Pair map: the shade shows how often two items appear in the same set (red: never). Even shading means a well-balanced design.</p>
        </div>
      )}
      <ShareBox link={fits ? link : ''} studyId={study.id} onPreview={onPreview} problems={problems} />
    </div>
  );
}

const draftFrom = (s) => ({ id: s.id, name: s.n, question: s.q, bestLabel: s.b, worstLabel: s.w, items: s.it.join('\n'), k: String(s.d[0][0].length), S: String(s.d[0].length), V: String(s.d.length), design: s.d, designJ: s.it.length });
const studyFrom = (d) => M.makeStudy({ id: d.id, name: d.name, question: d.question, bestLabel: d.bestLabel, worstLabel: d.worstLabel, items: M.parseItems(d.items), design: d.design || [[[]]] });

// ── MaxDiff runner ──
function RunnersMaxDiff() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => C.readStore(DRAFT_KEY) || draftFrom(M.exampleStudy()));
  const setDraft = (d) => { setDraftRaw(d); C.writeStore(DRAFT_KEY, d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => studyFrom(draft), [draft]);
  const code = useMemo(() => M.encodeStudy(study), [study]);
  const href = useHref(`/calculators/maxdiff-runner?study=${code}`);
  const link = linkFor(href);
  const [codes, setCodes] = useState(() => (draft.id === 'mdxex1' ? M.exampleCodes() : ''));
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = M.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <Participant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;

  const loadStudy = () => { try { setDraft(draftFrom(M.decodeStudy(pasted))); setLoadErr(''); setPasted(''); setCodes(''); } catch { setLoadErr('That is not a MaxDiff study link.'); } };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ id: M.newId(), name: 'MaxDiff survey', question: 'Which of these matters most and least to you?', bestLabel: 'Most important', worstLabel: 'Least important', items: '', k: '4', S: '', V: '1', design: null, designJ: 0 }); setCodes(''); };
  const example = () => { const s = M.exampleStudy(); setDraft(draftFrom(s)); setCodes(M.exampleCodes(s)); };
  return (
    <>
      {runErr && <Problem>The study link could not be read ({runErr}). Ask the researcher for a fresh link.</Problem>}
      <div className="calc-inputs"><Choice label="Step" value={tab} onChange={setTab} options={[['build', '1. Build the study'], ['analyse', '2. Analyse results']]} /></div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={example}>Load example</button>
        <button type="button" className="btn ghost small" onClick={fresh}>New empty study</button>
        <span className="tl-row" style={{ flex: '1 1 260px' }}>
          <input type="text" className="tl-code" style={{ flex: 1, minWidth: 0, padding: '7px 10px' }} placeholder="Or paste a study link to open it" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Study link" />
          <button type="button" className="btn ghost small" disabled={!pasted.trim()} onClick={loadStudy}>Open</button>
        </span>
      </div>
      {loadErr && <Problem>{loadErr}</Problem>}
      {tab === 'build'
        ? <Builder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/maxdiff-runner?study=${code}&preview=1`); }} />
        : <Analysis study={study} codes={codes} setCodes={setCodes} />}
      <About method="maxdiff-best-worst-scaling" links={[['incomplete-block-designs-bibd-pbib-alpha-and-test-versus-control-designs', 'Incomplete block designs'], ['discrete-choice-modeling', 'Discrete choice modelling'], ['rank-ordered-exploded-logit', 'Rank-ordered (exploded) logit']]}>
        <p>MaxDiff (best-worst scaling, Finn and Louviere 1992) shows people short sets of items and asks for the best and the worst in each. Two choices per set give a ratio-like scale that avoids the "everything is important" problem of rating scales.</p>
        <p><b>Design.</b> With J items, k per set and S sets per respondent, every item should appear equally often and every pair of items should appear together equally often: a balanced incomplete block design (BIBD). A BIBD exists only for some (J, k, S), so the tool searches for the most balanced design: each version is cut from shuffled copies of the item list (so item counts differ by at most one), then simulated annealing swaps items between sets to remove repeats and minimise Σ(pair count − mean)². Several versions spread pairs further. The order of sets and of items within each set is shuffled for every participant, which balances position.</p>
        <p><b>Count scores</b> are the same as in the MaxDiff counts calculator: (best − worst) / times shown, from −1 to +1.</p>
        <p><b>Sequential best-worst logit.</b> Each set is two choices. Best: P(b) = e<sup>u<sub>b</sub></sup> / Σ<sub>j∈set</sub> e<sup>u<sub>j</sub></sup>. Worst, from the k − 1 items left: P(w) = e<sup>−u<sub>w</sub></sup> / Σ<sub>j≠b</sub> e<sup>−u<sub>j</sub></sup>. One item is fixed at 0, the log-likelihood is maximised by Newton-Raphson, and utilities are shown centred on their mean. Standard errors are either from the inverse Hessian (as in statsmodels ConditionalLogit) or, by default, a sandwich estimator clustered by respondent, because each person answers many sets. <b>Share of preference</b> = e<sup>u<sub>i</sub></sup> / Σ<sub>j</sub> e<sup>u<sub>j</sub></sup>, with delta-method 95% intervals; read an interval as the range of values compatible with the data, not as a 95% chance that the true value is inside. The likelihood-ratio test compares the model with all items equal.</p>
        <p><b>When not to use it:</b> for absolute importance (MaxDiff only ranks items against each other), for items of mixed kinds (features against prices against brands), or for more than about 40 items per person. These are aggregate scores for the whole sample: for individual scores or segments, use hierarchical Bayes or latent-class models. Sample size: Sawtooth Software's MaxDiff technical paper suggests each item be seen at least three times per respondent, and 100–200 respondents is common for stable aggregate scores.</p>
      </About>
    </>
  );
}

export default RunnersMaxDiff;
