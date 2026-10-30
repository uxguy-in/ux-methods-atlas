import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as R from './runners-cards.js';
import * as C from './runners-common.js';
import { Choice, Num, Result, Stats, Problem, About, download, num, pct } from './ui.jsx';
import { RunFrame, DoneScreen, ShareBox, CodesBox, ShareChart, linkFor } from './runners-ui.jsx';

const DRAFT_KEY = 'uxatlas:reaction-cards:draft';
const VTONE = { p: 'var(--ok)', n: 'var(--bad)', o: 'var(--ink-3)' };

function Stimulus({ d, label }) {
  const [zoom, setZoom] = useState(false);
  const [bad, setBad] = useState(false);
  return (
    <div className="rn-stim">
      {d.x && <div className="task">{d.x}</div>}
      {d.u && (bad ? <div className="rn-missing">The image could not be loaded.</div> : (
        <div className="rn-design" style={{ padding: 0, border: 0 }}>
          <button type="button" className="shot" onClick={() => setZoom(true)} aria-label={`Enlarge ${label}`}><img src={R.imageSrc(d.u)} alt={label} onError={() => setBad(true)} /></button>
        </div>
      ))}
      {!d.x && !d.u && <div className="task">Think about the product you have just used.</div>}
      {zoom && createPortal(
        <div className="rn-zoom" role="dialog" aria-modal="true" aria-label={label}>
          <div className="tt-actions" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn small" onClick={() => setZoom(false)} autoFocus>Close</button></div>
          <div className="fit"><img src={R.imageSrc(d.u)} alt={label} /></div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Participant ──
function Participant({ study, preview, onExit }) {
  const plan = () => ({ ds: R.assignDesigns(study, preview ? null : C.loadSessions(R.TOOL, study.id).length), orders: study.d.map(() => C.shuffle(C.range(R.WORDS.length))) });
  const [p, setP] = useState(plan);
  const [pid, setPid] = useState(() => `P-${R.newId().slice(0, 5)}`);
  const [phase, setPhase] = useState('intro');
  const [pos, setPos] = useState(0);
  const [sel, setSel] = useState([]);
  const [top, setTop] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const [t0] = useState(() => performance.now());
  const di = p.ds[pos], d = study.d[di], max = study.mx || R.WORDS.length, min = study.mn || 1;
  const name = p.ds.length > 1 ? `design ${pos + 1} of ${p.ds.length}` : 'the design';
  const toggle = (i) => setSel(sel.includes(i) ? sel.filter((x) => x !== i) : sel.length < max ? [...sel, i] : sel);
  const commit = (t) => {
    const all = [...answers, { d: di, w: sel, t }];
    setAnswers(all); setSel([]); setTop([]);
    if (pos + 1 < p.ds.length) { setPos(pos + 1); setPhase('pick'); return; }
    const r = { v: 1, t: 'prcr', s: study.id, p: pid, d: Date.now(), r: all, ms: Math.round(performance.now() - t0) };
    const c = R.encodeResult(r);
    setCode(c); setSaved(preview ? false : C.saveSession(R.TOOL, study.id, c)); setPhase('done');
  };
  const afterPick = () => { if (study.t5 && sel.length > 5) setPhase('top'); else commit(study.t5 ? sel : []); };
  const again = () => { setP(plan()); setPid(`P-${R.newId().slice(0, 5)}`); setPos(0); setSel([]); setTop([]); setAnswers([]); setCode(''); setPhase('intro'); };
  return (
    <RunFrame label={`Reaction cards: ${study.n}`} wide={phase === 'pick'} preview={preview} onExit={onExit} scrollKey={`${phase}-${pos}`}>
      {phase === 'intro' && (
        <>
          <p className="eyebrow">Word choice</p>
          <h1>{study.n}</h1>
          <p>You'll see {p.ds.length > 1 ? `${p.ds.length} designs, one after the other` : 'a design'} and a list of {R.WORDS.length} words. Choose the words that best describe {p.ds.length > 1 ? 'each design' : 'it'}{study.mx ? `: at least ${min} and up to ${study.mx}` : ` (at least ${min})`}.{study.t5 ? ' Then, if you chose more than five, pick the five that fit best.' : ''} Go with your first impression; there are no right answers.</p>
          <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
          <div className="tt-actions"><button type="button" className="btn" onClick={() => setPhase('pick')}>Start</button></div>
        </>
      )}
      {phase === 'pick' && (
        <>
          {p.ds.length > 1 && <div className="prog">Design {pos + 1} of {p.ds.length}</div>}
          <Stimulus d={d} label={`The ${name}`} />
          <h2 style={{ fontSize: 18, margin: 0 }}>Which words describe {name}?</h2>
          <div className="rn-words" role="group" aria-label="Words">
            {p.orders[di].map((i) => <button key={i} type="button" className={`rn-word${sel.includes(i) ? ' on' : ''}`} aria-pressed={sel.includes(i)} disabled={!sel.includes(i) && sel.length >= max} onClick={() => toggle(i)}>{R.WORDS[i]}</button>)}
          </div>
          <div className="rn-sticky">
            <span>{sel.length} chosen{study.mx ? ` of up to ${study.mx}` : ''}{sel.length < min ? ` · choose at least ${min}` : ''}</span>
            <button type="button" className="btn small" disabled={sel.length < min} onClick={afterPick}>Next</button>
          </div>
        </>
      )}
      {phase === 'top' && (
        <>
          <h1>Your top five</h1>
          <p>Of the words you chose, which five describe {name} best?</p>
          <div className="rn-words" role="group" aria-label="Your words">
            {sel.map((i) => <button key={i} type="button" className={`rn-word${top.includes(i) ? ' on' : ''}`} aria-pressed={top.includes(i)} disabled={!top.includes(i) && top.length >= 5} onClick={() => setTop(top.includes(i) ? top.filter((x) => x !== i) : [...top, i])}>{R.WORDS[i]}</button>)}
          </div>
          <div className="tt-actions"><button type="button" className="btn" disabled={top.length !== 5} onClick={() => commit(top)}>Next</button><span className="tl-note">{top.length} of 5</span></div>
        </>
      )}
      {phase === 'done' && <DoneScreen code={code} title={study.n} saved={saved} preview={preview} onAgain={again} onExit={onExit} />}
    </RunFrame>
  );
}

// ── Word cloud ──
function Cloud({ d }) {
  const W = 640, H = 340;
  const placed = useMemo(() => R.cloudLayout(d.words, { W, H }), [d]);
  return (
    <svg className="rn-cloud" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Word cloud for ${d.label}: ${d.words.slice(0, 8).map((w) => `${w.word} ${w.count}`).join(', ')}`}>
      {placed.map((w) => <text key={w.i} x={w.x + w.w / 2} y={w.y + w.h / 2} fontSize={w.f} textAnchor="middle" dominantBaseline="central" className={w.valence === 'p' ? 'pos' : w.valence === 'n' ? 'neg' : ''} style={w.valence === 'o' ? { fill: 'var(--ink-2)' } : undefined}><title>{`${w.word}: ${w.count} of ${d.n} participants (${R.VALENCE_NAMES[w.valence]})`}</title>{w.word}</text>)}
    </svg>
  );
}

// ── Analysis ──
function Analysis({ study, codes, setCodes }) {
  const parsed = useMemo(() => C.parseCodes(codes, R.decodeResult, study.id), [codes, study.id]);
  const an = useMemo(() => R.analyse(study, parsed.results), [study, parsed]);
  const sum = useMemo(() => R.summary(an), [an]);
  const has = an.designs.some((d) => d.n);
  const c = an.compare;
  return (
    <div className="clu-root rn-an">
      <div>
        <CodesBox tool={R.TOOL} studyId={study.id} codes={codes} setCodes={setCodes} parsed={parsed}>
          <button type="button" className="btn ghost small" disabled={!has} onClick={() => download(`reaction-cards-words-${study.id}.csv`, R.wordsCsv(an), 'text/csv')}>Download word counts (CSV)</button>
          <button type="button" className="btn ghost small" disabled={!has} onClick={() => download(`reaction-cards-answers-${study.id}.csv`, R.answersCsv(study, parsed.results), 'text/csv')}>Download answers (CSV)</button>
          <button type="button" className="btn ghost small" disabled={!has} onClick={() => download(`reaction-cards-${study.id}.md`, R.markdown(study, an, sum), 'text/markdown')}>Download summary (Markdown)</button>
        </CodesBox>
      </div>
      {!has ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : (
        <>
          {c ? <Result big={`${c.diff > 0 ? '+' : '−'}${num(Math.abs(c.diff) * 100, 0)} points`} label={`Positive share, ${an.designs[1].label} vs ${an.designs[0].label} (95% CI ${num(c.lo * 100, 1)} to ${num(c.hi * 100, 1)}; ${C.pText(c.p)})`} />
            : <Result big={`${pct(an.designs.find((d) => d.n).pos.share)} positive`} label={`of ${an.designs.find((d) => d.n).picks} words chosen by ${an.designs.find((d) => d.n).n} participants (the list is ${pct(R.BASE_RATE)} positive)`} />}
          {an.K === 2 && !c && <Problem>Both designs need answers from at least two participants for a comparison.</Problem>}
          <ShareChart label="Positive share of words chosen, with 95% intervals clustered by participant" refLine={R.BASE_RATE} rows={an.designs.filter((d) => d.n).map((d) => ({ label: d.label, share: d.pos.share, lo: d.pos.lo, hi: d.pos.hi, tone: 'var(--ok)' }))} />
          <p className="tl-note">Bars: share of all chosen words that are positive. Whiskers: 95% interval with standard errors clustered by participant (each person picks several words). Dashed line: the share of positive words in the list ({pct(R.BASE_RATE)}), what picking at random would give.</p>
          <Stats rows={an.designs.filter((d) => d.n).flatMap((d) => [
            [d.label, `${d.n} participants, ${d.picks} words (${num(d.meanPicks, 1)} each); ${pct(d.pos.share)} positive (${pct(d.pos.lo)}–${pct(d.pos.hi)}), ${pct(d.neg)} negative`],
            d.vsBase && [`${d.label} vs ${pct(R.BASE_RATE)} base rate`, `t(${d.vsBase.df}) = ${num(d.vsBase.t)}, ${C.pText(d.vsBase.p)}`],
            d.topPos && [`${d.label}, top-5 words`, `${pct(d.topPos.share)} positive (${pct(d.topPos.lo)}–${pct(d.topPos.hi)}), ${d.topN} participants`],
          ])} />
          <div className="rn-two">
            {an.designs.filter((d) => d.n).map((d) => (
              <div key={d.k}>
                <h3 className="clu-h3">{d.label}</h3>
                <Cloud d={d} />
              </div>
            ))}
          </div>
          <ul className="tl-legend"><li><i style={{ background: 'var(--ok)' }} />Positive</li><li><i style={{ background: 'var(--bad)' }} />Negative</li><li><i style={{ background: 'var(--ink-2)' }} />Neutral</li><li>Size: participants who chose the word (square root scale).</li></ul>
          {c && (
            <div>
              <h3 className="clu-h3">Biggest shifts between designs</h3>
              <div className="clu-scroll"><table className="clu-table clu-num">
                <thead><tr><th>Word</th><th>{an.designs[0].label}</th><th>{an.designs[1].label}</th><th>Difference</th></tr></thead>
                <tbody>{c.words.slice(0, 12).map((w) => <tr key={w.i}><td><span className="rn-swatch" style={{ background: VTONE[w.valence] }} />{w.word}</td><td>{pct(w.a)}</td><td>{pct(w.b)}</td><td>{w.diff > 0 ? '+' : '−'}{num(Math.abs(w.diff) * 100, 0)} points</td></tr>)}</tbody>
              </table></div>
              <p className="tl-note">Share of each design's participants who chose the word. These are exploratory: with 118 words, some large differences arise by chance.</p>
            </div>
          )}
          {an.designs.filter((d) => d.n).map((d) => (
            <details key={d.k}>
              <summary><b>All words chosen for {d.label} ({d.words.length})</b></summary>
              <div className="clu-scroll"><table className="clu-table clu-num">
                <thead><tr><th>Word</th><th>Valence</th><th>Participants</th><th>Share (95% CI)</th>{study.t5 ? <th>In top 5</th> : null}</tr></thead>
                <tbody>{d.words.map((w) => <tr key={w.i}><td>{w.word}</td><td><span className="rn-swatch" style={{ background: VTONE[w.valence] }} />{R.VALENCE_NAMES[w.valence]}</td><td>{w.count}</td><td>{pct(w.share)} ({pct(w.ci.lo)}–{pct(w.ci.hi)})</td>{study.t5 ? <td>{w.top}</td> : null}</tr>)}</tbody>
              </table></div>
            </details>
          ))}
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </div>
  );
}

// ── Builder ──
function Builder({ draft, setDraft, study, link, onPreview }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const setD = (i, patch) => set({ designs: draft.designs.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const problems = [];
  study.d.forEach((d, i) => { if (d.u && !d.u.startsWith('ex:') && !C.isUrl(d.u)) problems.push(`Design ${i + 1}: the image address must start with https://`); });
  if (study.mx && study.mn > study.mx) problems.push('The fewest words cannot be more than the most.');
  return (
    <div className="clu-root rn-an">
      <div className="calc-inputs">
        <label className="calc-field wide"><span>Study name</span><input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} /></label>
      </div>
      <div>
        <h3 className="clu-h3">What participants describe ({draft.designs.length} of 1–2)</h3>
        <p className="tl-note" style={{ marginBottom: 10 }}>Usually people use the product first, then choose words. Add an image you host (only its address goes into the link) or a short prompt; leave both empty to ask about "the product you have just used". Two designs let you compare versions.</p>
        <div className="rn-build-list">
          {draft.designs.map((d, i) => (
            <div key={i} className="rn-build-item">
              <div className="row">
                <label className="calc-field" style={{ flex: '1 1 220px' }}><span>Design {i + 1}: label for your analysis</span><input type="text" className="grow" value={d.l} onChange={(e) => setD(i, { l: e.target.value })} /></label>
                <button type="button" className="clu-link" disabled={draft.designs.length < 2} onClick={() => set({ designs: draft.designs.filter((_, j) => j !== i) })}>Remove</button>
              </div>
              <label className="calc-field wide"><span>Prompt shown to participants (optional)</span><input type="text" className="grow" value={d.x} onChange={(e) => setD(i, { x: e.target.value })} placeholder="e.g. Think about the checkout you just used." /></label>
              <label className="calc-field wide"><span>Image address (optional, https://…)</span><input type="url" className="grow" value={d.u.startsWith('ex:') ? `(built-in example image ${d.u.slice(3)})` : d.u} readOnly={d.u.startsWith('ex:')} onChange={(e) => setD(i, { u: e.target.value.trim() })} /></label>
              {d.u.startsWith('ex:') && <button type="button" className="clu-link" style={{ justifySelf: 'start' }} onClick={() => setD(i, { u: '' })}>Remove the example image</button>}
              {(d.u.startsWith('ex:') || C.isUrl(d.u)) && <div className="rn-thumb"><img src={R.imageSrc(d.u)} alt={`Design ${i + 1}`} /></div>}
            </div>
          ))}
        </div>
        <div className="tl-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost small" disabled={draft.designs.length >= 2} onClick={() => set({ designs: [...draft.designs, { l: `Design ${draft.designs.length + 1}`, u: '', x: '' }] })}>Add a second design</button>
        </div>
      </div>
      <div className="calc-inputs">
        {draft.designs.length === 2 && <Choice label="Who sees which design" value={draft.mode} onChange={(m) => set({ mode: m })} options={[['b', 'One design each (between)'], ['w', 'Both, in random order (within)']]} />}
        <Num label="Most words (0 = no limit)" value={draft.max} onChange={(v) => set({ max: v })} min={0} max={40} />
        <Num label="Fewest words" value={draft.min} onChange={(v) => set({ min: v })} min={1} max={40} />
        <label className="tl-check" style={{ alignSelf: 'center' }}><input type="checkbox" checked={draft.top5} onChange={(e) => set({ top5: e.target.checked })} /> Then ask for the top 5</label>
      </div>
      <details>
        <summary><b>The 118 words and their valence</b></summary>
        <p className="tl-note" style={{ margin: '8px 0' }}>Every participant sees the words in a fresh random order. Valence is this tool's reading of Benedek and Miner's 60/40 split.</p>
        <div className="rn-words">{R.WORDS.map((w, i) => <span key={w} className="qtag" style={{ color: VTONE[R.VALENCE[i]] }}>{w}</span>)}</div>
      </details>
      <ShareBox link={link} studyId={study.id} onPreview={onPreview} problems={problems} />
    </div>
  );
}

const draftFrom = (s) => ({ id: s.id, name: s.n, designs: s.d.map((d) => ({ ...d })), mode: s.m, max: String(s.mx), min: String(s.mn), top5: !!s.t5 });
const studyFrom = (d) => R.makeStudy({ id: d.id, name: d.name, designs: d.designs, mode: d.mode, max: d.max, min: d.min, top5: d.top5 });

// ── Reaction cards ──
function RunnersReactionCards() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => C.readStore(DRAFT_KEY) || draftFrom(R.exampleStudy()));
  const setDraft = (d) => { setDraftRaw(d); C.writeStore(DRAFT_KEY, d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => studyFrom(draft), [draft]);
  const code = useMemo(() => R.encodeStudy(study), [study]);
  const href = useHref(`/calculators/reaction-cards?study=${code}`);
  const link = linkFor(href);
  const [codes, setCodes] = useState(() => (draft.id === 'prcex1' ? R.exampleCodes() : ''));
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = R.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <Participant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;

  const loadStudy = () => { try { setDraft(draftFrom(R.decodeStudy(pasted))); setLoadErr(''); setPasted(''); setCodes(''); } catch { setLoadErr('That is not a reaction-card study link.'); } };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ id: R.newId(), name: 'Desirability test', designs: [{ l: 'Our product', u: '', x: '' }], mode: 'b', max: '8', min: '3', top5: true }); setCodes(''); };
  const example = () => { setDraft(draftFrom(R.exampleStudy())); setCodes(R.exampleCodes()); };
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
        ? <Builder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/reaction-cards?study=${code}&preview=1`); }} />
        : <Analysis study={study} codes={codes} setCodes={setCodes} />}
      <About method="product-reaction-cards-microsoft-desirability-toolkit" links={[['semantic-differential', 'Semantic differential'], ['brand-audit-for-interactive-products', 'Brand audit for interactive products']]}>
        <p>The Microsoft Product Reaction Cards are 118 words, about 60% positive and 40% negative or neutral, created by Joey Benedek and Trish Miner (2002, "Measuring desirability: New methods for evaluating desirability in a usability lab setting", Usability Professionals' Association conference). After using a product, participants choose the words that describe it, then the five that fit best, and explain their choices. The method's strength is that conversation; the counts help you see patterns across people.</p>
        <p><b>Word share</b> = participants who chose the word / participants, with a 95% Wilson interval. <b>Positive share</b> = positive words chosen / all words chosen. Each person contributes several words, so its interval uses a standard error clustered by participant: the intercept of an ordinary least squares regression of the word-level 0/1 (positive) on a constant, with V = G/(G − 1) · (X′X)⁻¹ Σ<sub>g</sub>(X<sub>g</sub>′e<sub>g</sub>)(X<sub>g</sub>′e<sub>g</sub>)′ (X′X)⁻¹ and a t-interval on G − 1 degrees of freedom (G participants). The base rate is the list's own share of positive words, 73/118 = 61.9%, which picking at random would give.</p>
        <p><b>Comparing two designs:</b> the same regression with a design indicator; its slope is the difference in positive share. Clustering by participant makes the test valid both when each person sees one design (between) and when they see both (within). Word-by-word differences are shown for exploration only.</p>
        <p><b>Word cloud:</b> words are sized by the square root of how many participants chose them and coloured by valence; placement is a spiral layout and carries no meaning.</p>
        <p><b>When not to use it:</b> as a stand-alone score of how good a design is (use a standardised questionnaire), with participants who do not read the language fluently (the words are nuanced), or when you cannot follow up on the choices. Valence labels are this tool's reading of the published 60/40 split; a few words (such as "Predictable" or "Familiar") can be positive or negative depending on the product.</p>
        <p>Full word list: {R.WORDS.join(', ')}.</p>
      </About>
    </>
  );
}

export default RunnersReactionCards;
