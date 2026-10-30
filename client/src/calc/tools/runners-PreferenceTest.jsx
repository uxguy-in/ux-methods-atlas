import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as P from './runners-preference.js';
import * as C from './runners-common.js';
import { Choice, Result, Stats, Problem, About, download, num, pct } from './ui.jsx';
import { RunFrame, DoneScreen, ShareBox, CodesBox, ShareChart, linkFor } from './runners-ui.jsx';

const DRAFT_KEY = 'uxatlas:preference-test:draft';
const TONES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c7)'];

function Shot({ u, alt, onZoom }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className="rn-missing">The image could not be loaded{P.isUrl(u) ? ` from ${u}` : ''}.</div>;
  return <button type="button" className="shot" onClick={onZoom} aria-label={`Enlarge ${alt}`}><img src={P.imageSrc(u)} alt={alt} loading="lazy" onError={() => setBad(true)} /></button>;
}
function Zoom({ src, alt, onClose }) {
  const [fit, setFit] = useState(true);
  return createPortal(
    <div className="rn-zoom" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="tt-actions" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn ghost small" onClick={() => setFit(!fit)}>{fit ? 'Actual size' : 'Fit to screen'}</button>
        <button type="button" className="btn small" onClick={onClose} autoFocus>Close</button>
      </div>
      <div className={fit ? 'fit' : ''}><img src={src} alt={alt} /></div>
    </div>,
    document.body,
  );
}

// ── Participant ──
function Participant({ study, preview, onExit }) {
  const K = study.d.length;
  const [pid, setPid] = useState(() => `P-${P.newId().slice(0, 5)}`);
  const [order, setOrder] = useState(() => P.displayOrder(K, !!study.r));
  const [phase, setPhase] = useState('intro');
  const [seg, setSeg] = useState(-1);
  const [pick, setPick] = useState(-1);
  const [why, setWhy] = useState('');
  const [zoom, setZoom] = useState(null);
  const [t0, setT0] = useState(0);
  const [ms, setMs] = useState(0);
  const [code, setCode] = useState('');
  const [saved, setSaved] = useState(false);
  const finish = (y, took) => {
    const r = { v: 1, t: 'prefr', s: study.id, p: pid, d: Date.now(), c: pick, o: order, y: String(y || '').trim().slice(0, 600), g: seg, ms: took };
    const c = P.encodeResult(r);
    setCode(c); setSaved(preview ? false : C.saveSession(P.TOOL, study.id, c)); setPhase('done');
  };
  const choose = () => { const took = Math.round(performance.now() - t0); setMs(took); if (study.w) setPhase('why'); else finish('', took); };
  const again = () => { setPid(`P-${P.newId().slice(0, 5)}`); setOrder(P.displayOrder(K, !!study.r)); setSeg(-1); setPick(-1); setWhy(''); setCode(''); setPhase('intro'); };
  return (
    <RunFrame label={`Preference test: ${study.n}`} wide={phase === 'choose'} preview={preview} onExit={onExit} scrollKey={phase}>
      {phase === 'intro' && (
        <>
          <p className="eyebrow">Preference test</p>
          <h1>{study.n}</h1>
          <p>You'll see {K} designs side by side and choose the one you prefer. There are no right or wrong answers. {study.d.some((d) => d.u) ? 'Tap an image to see it larger.' : ''}</p>
          {study.a && (
            <div className="calc-field">
              <span>{study.a.q}</span>
              <div className="rn-options" role="radiogroup" aria-label={study.a.q}>{study.a.o.map((o, i) => <button key={i} type="button" role="radio" aria-checked={seg === i} className={`rn-option${seg === i ? ' on' : ''}`} onClick={() => setSeg(i)}>{o}</button>)}</div>
            </div>
          )}
          <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
          <div className="tt-actions"><button type="button" className="btn" disabled={!!study.a && seg < 0} onClick={() => { setT0(performance.now()); setPhase('choose'); }}>Start</button></div>
        </>
      )}
      {phase === 'choose' && (
        <>
          <div className="task">{study.q}</div>
          <div className={`rn-designs${K === 2 ? ' n2' : ''}`} role="radiogroup" aria-label={study.q}>
            {order.map((di, pos) => {
              const d = study.d[di], name = `Option ${pos + 1}`;
              return (
                <div key={di} className={`rn-design${pick === di ? ' on' : ''}`}>
                  <h2>{name}</h2>
                  {d.u && <Shot u={d.u} alt={name} onZoom={() => setZoom({ src: P.imageSrc(d.u), alt: name })} />}
                  {d.x && <div className="txt">{d.x}</div>}
                  <button type="button" role="radio" aria-checked={pick === di} className={`btn small ${pick === di ? 'red' : 'ghost'}`} onClick={() => setPick(di)}>{pick === di ? `${name} chosen` : `Choose ${name.toLowerCase()}`}</button>
                </div>
              );
            })}
          </div>
          <div className="tt-actions"><button type="button" className="btn" disabled={pick < 0} onClick={choose}>{study.w ? 'Next' : 'Finish'}</button></div>
          {zoom && <Zoom {...zoom} onClose={() => setZoom(null)} />}
        </>
      )}
      {phase === 'why' && (
        <>
          <h1>Why that one?</h1>
          <label className="calc-field wide"><span>In a sentence or two, what made you prefer option {order.indexOf(pick) + 1}? (optional)</span><textarea className="st-textarea rn-text" rows={4} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={600} /></label>
          <div className="tt-actions"><button type="button" className="btn" onClick={() => finish(why, ms)}>Finish</button><button type="button" className="btn ghost" onClick={() => finish('', ms)}>Skip</button></div>
        </>
      )}
      {phase === 'done' && <DoneScreen code={code} title={study.n} saved={saved} preview={preview} onAgain={again} onExit={onExit} />}
    </RunFrame>
  );
}

// ── Analysis ──
function Analysis({ study, codes, setCodes }) {
  const parsed = useMemo(() => C.parseCodes(codes, P.decodeResult, study.id), [codes, study.id]);
  const an = useMemo(() => P.analyse(study, parsed.results), [study, parsed]);
  const sum = useMemo(() => P.summary(an), [an]);
  return (
    <div className="clu-root rn-an">
      <div>
        <CodesBox tool={P.TOOL} studyId={study.id} codes={codes} setCodes={setCodes} parsed={parsed}>
          <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`preference-test-${study.id}.csv`, P.resultsCsv(study, parsed.results), 'text/csv')}>Download answers (CSV)</button>
          <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`preference-test-${study.id}.md`, P.markdown(study, an, sum), 'text/markdown')}>Download summary (Markdown)</button>
        </CodesBox>
      </div>
      {!an.n ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : (
        <>
          <Result big={an.tied ? 'Tie' : `${an.ranked[0].label}: ${pct(an.ranked[0].share)}`} label={`${an.n} participants chose between ${an.K} designs`} />
          <ShareChart label="Preference shares with 95% Wilson intervals" refLine={1 / an.K} rows={an.designs.map((d) => ({ label: d.label, share: d.share, lo: d.ci.lo, hi: d.ci.hi, tone: TONES[d.i] }))} />
          <p className="tl-note">Bars: share who chose each design. Whiskers: 95% Wilson interval. Dashed line: an even split ({pct(1 / an.K)}).</p>
          <Stats rows={[
            ...an.ranked.map((d) => [d.label, `${d.count} of ${an.n} (${pct(d.share)}), 95% CI ${pct(d.ci.lo)}–${pct(d.ci.hi)}`]),
            an.overall.kind === 'binomial' ? ['Exact binomial test vs 50/50', C.pText(an.overall.p)] : ['Chi-square vs equal shares', `χ²(${an.overall.df}) = ${num(an.overall.stat)}, ${C.pText(an.overall.p)}`],
            an.K > 2 && an.head && [`Head to head: ${an.ranked[0].label} vs ${an.ranked[1].label}`, `${an.ranked[0].count} vs ${an.ranked[1].count}, exact binomial ${C.pText(an.head.p)}`],
            an.position && ['Chose the design shown first', `${an.position.first} of ${an.position.n} (${pct(an.position.share)}; ${pct(an.position.expected)} expected), ${C.pText(an.position.test.p)}${an.position.randomised ? '' : ' · order not randomised'}`],
            Number.isFinite(an.medianSec) && ['Median time to choose', `${num(an.medianSec, 1)} s`],
          ]} />
          {an.segments && (
            <>
              <h3 className="clu-h3">By segment: {an.segments.question}</h3>
              <div className="clu-scroll"><table className="clu-table clu-num">
                <thead><tr><th>Segment</th><th>n</th>{an.designs.map((d) => <th key={d.i}>{d.label}</th>)}</tr></thead>
                <tbody>{an.segments.rows.map((r) => (
                  <tr key={r.g}><td>{r.label}</td><td>{r.n}</td>{r.counts.map((c, i) => <td key={i} className={r.n && i === r.top ? 'tl-cell-ok' : ''}>{r.n ? `${c} (${pct(r.shares[i])}; ${pct(r.ci[i].lo)}–${pct(r.ci[i].hi)})` : '—'}</td>)}</tr>
                ))}</tbody>
              </table></div>
              <p className="tl-note">{Number.isFinite(an.segments.test.p) ? `Chi-square test of independence: χ²(${an.segments.test.df}) = ${num(an.segments.test.stat)}, ${C.pText(an.segments.test.p)}, Cramér's V = ${num(an.segments.test.v)}${an.segments.fisher ? `; Fisher's exact ${C.pText(an.segments.fisher.p)}` : ''}.` : 'At least two segments with answers are needed for a test.'} {an.segments.unanswered ? `${an.segments.unanswered} participant(s) did not answer the question.` : ''} Shaded: each segment's most chosen design; intervals are 95% Wilson.</p>
            </>
          )}
          <h3 className="clu-h3">Reasons</h3>
          <div className="rn-two">
            {an.designs.map((d) => (
              <div key={d.i}>
                <p style={{ margin: '0 0 6px' }}><span className="rn-swatch" style={{ background: TONES[d.i] }} /><b>{d.label}</b> · {C.plural(d.reasons.length, 'reason')}</p>
                {d.reasons.length ? <ul className="rn-reasons">{d.reasons.map((x, i) => <li key={i}><b>{x.y}</b> <span>({x.p}{study.a && x.g >= 0 ? `, ${study.a.o[x.g]}` : ''})</span></li>)}</ul> : <p className="tl-note">No reasons given.</p>}
              </div>
            ))}
          </div>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </div>
  );
}

// ── Builder ──
function DesignEditor({ d, i, onChange, onRemove, canRemove }) {
  const kind = d.kind || (d.x && !d.u ? 'text' : 'image');
  return (
    <div className="rn-build-item">
      <div className="row">
        <label className="calc-field" style={{ flex: '1 1 220px' }}><span>Design {P.LETTERS[i]}: label for your analysis</span><input type="text" className="grow" value={d.l} onChange={(e) => onChange({ ...d, l: e.target.value })} /></label>
        <Choice label="Show" value={kind} onChange={(k) => onChange({ ...d, kind: k })} options={[['image', 'Image address'], ['text', 'Text']]} />
        <button type="button" className="clu-link" disabled={!canRemove} onClick={onRemove}>Remove</button>
      </div>
      {kind === 'image' ? (
        <>
          <label className="calc-field wide"><span>Image address (https://…)</span><input type="url" className="grow" value={d.u.startsWith('ex:') ? `(built-in example image ${d.u.slice(3)})` : d.u} readOnly={d.u.startsWith('ex:')} onChange={(e) => onChange({ ...d, u: e.target.value.trim() })} placeholder="https://example.com/design-a.png" /></label>
          {d.u.startsWith('ex:') && <button type="button" className="clu-link" style={{ justifySelf: 'start' }} onClick={() => onChange({ ...d, u: '' })}>Replace with your own image address</button>}
          {(d.u.startsWith('ex:') || P.isUrl(d.u)) && <div className="rn-thumb"><img src={P.imageSrc(d.u)} alt={`Design ${P.LETTERS[i]}`} /></div>}
        </>
      ) : (
        <label className="calc-field wide"><span>Text shown to participants (a headline, a label, a message)</span><textarea rows={3} value={d.x} onChange={(e) => onChange({ ...d, x: e.target.value })} /></label>
      )}
    </div>
  );
}

function Builder({ draft, setDraft, study, link, onPreview }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const setD = (i, d) => set({ designs: draft.designs.map((x, j) => (j === i ? d : x)) });
  const problems = P.studyProblems(study);
  return (
    <div className="clu-root rn-an">
      <div className="calc-inputs">
        <label className="calc-field wide"><span>Study name</span><input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} /></label>
        <label className="calc-field wide"><span>Question</span><input type="text" value={draft.question} onChange={(e) => set({ question: e.target.value })} style={{ width: '100%', maxWidth: 720 }} /></label>
      </div>
      <div>
        <h3 className="clu-h3">Designs ({draft.designs.length} of 2–4)</h3>
        <p className="tl-note" style={{ marginBottom: 10 }}>Use images you host (your website, a CDN or a file host with direct image links): only the addresses go into the link, so participants anywhere can see them. Anyone with the link can see the images. For words, headlines or messages, use text. Participants see neutral names (Option 1, 2…), never your labels.</p>
        <div className="rn-build-list">
          {draft.designs.map((d, i) => <DesignEditor key={i} d={d} i={i} canRemove={draft.designs.length > 2} onRemove={() => set({ designs: draft.designs.filter((_, j) => j !== i) })} onChange={(x) => setD(i, x)} />)}
        </div>
        <div className="tl-row" style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost small" disabled={draft.designs.length >= 4} onClick={() => set({ designs: [...draft.designs, { l: `Design ${P.LETTERS[draft.designs.length]}`, u: '', x: '' }] })}>Add a design</button>
          <label className="tl-check"><input type="checkbox" checked={draft.randomise} onChange={(e) => set({ randomise: e.target.checked })} /> Randomise the order for each participant</label>
          <label className="tl-check"><input type="checkbox" checked={draft.why} onChange={(e) => set({ why: e.target.checked })} /> Ask why (optional free text)</label>
        </div>
      </div>
      <div className="calc-inputs">
        <label className="calc-field" style={{ flex: '1 1 300px' }}><span>Segment question (optional)</span><input type="text" value={draft.attrQ} onChange={(e) => set({ attrQ: e.target.value })} placeholder="e.g. Do you use the product today?" style={{ width: '100%' }} /><small>Asked before the designs, to split results by group.</small></label>
        <label className="calc-field" style={{ flex: '1 1 260px' }}><span>Answer options, one per line (2–8)</span><textarea rows={3} value={draft.attrOptions} onChange={(e) => set({ attrOptions: e.target.value })} /></label>
      </div>
      <ShareBox link={link} studyId={study.id} onPreview={onPreview} problems={problems} />
    </div>
  );
}

const draftFrom = (s) => ({ id: s.id, name: s.n, question: s.q, designs: s.d.map((d) => ({ ...d, kind: d.u ? 'image' : 'text' })), why: !!s.w, randomise: !!s.r, attrQ: s.a?.q || '', attrOptions: (s.a?.o || []).join('\n') });
const studyFrom = (d) => P.makeStudy({ id: d.id, name: d.name, question: d.question, designs: d.designs.map((x) => ((x.kind || (x.u ? 'image' : 'text')) === 'image' ? { l: x.l, u: x.u, x: '' } : { l: x.l, u: '', x: x.x })), why: d.why, randomise: d.randomise, attrQ: d.attrQ, attrOptions: C.lines(d.attrOptions) });

// ── Preference test ──
function RunnersPreference() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => C.readStore(DRAFT_KEY) || draftFrom(P.exampleStudy()));
  const setDraft = (d) => { setDraftRaw(d); C.writeStore(DRAFT_KEY, d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => studyFrom(draft), [draft]);
  const code = useMemo(() => P.encodeStudy(study), [study]);
  const href = useHref(`/calculators/preference-test?study=${code}`);
  const link = linkFor(href);
  const [codes, setCodes] = useState(() => (draft.id === 'prefex1' ? P.exampleCodes() : ''));
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = P.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <Participant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;

  const loadStudy = () => { try { setDraft(draftFrom(P.decodeStudy(pasted))); setLoadErr(''); setPasted(''); setCodes(''); } catch { setLoadErr('That is not a preference-test study link.'); } };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ id: P.newId(), name: 'Preference test', question: 'Which design do you prefer?', designs: [{ l: 'Design A', u: '', x: '', kind: 'image' }, { l: 'Design B', u: '', x: '', kind: 'image' }], why: true, randomise: true, attrQ: '', attrOptions: '' }); setCodes(''); };
  const example = () => { setDraft(draftFrom(P.exampleStudy())); setCodes(P.exampleCodes()); };
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
        ? <Builder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/preference-test?study=${code}&preview=1`); }} />
        : <Analysis study={study} codes={codes} setCodes={setCodes} />}
      <About method="preference-test" links={[['chi-square-and-fishers-exact-tests', "Chi-square and Fisher's exact tests"], ['product-test-designs-blind-branded-monadic-paired-studio-home-use', 'Product test designs (monadic and paired)'], ['aesthetic-usability-effect-measurement', 'Aesthetic-usability effect'], ['5-second-test', '5-second test']]}>
        <p>A preference test shows two to four designs side by side and asks which one people prefer. The order is shuffled for each participant so no design always sits in the favoured first or left position; the tool also reports how many chose whatever was shown first.</p>
        <p><b>Share</b> of design i = x<sub>i</sub>/n with a 95% <b>Wilson interval</b>: (p̂ + z²/2n ± z√(p̂(1−p̂)/n + z²/4n²)) / (1 + z²/n), z = 1.96. It stays inside 0–100% and behaves well with small samples. Read it as the range of shares compatible with these answers, not as a 95% chance that the true share is inside.</p>
        <p><b>Two designs:</b> an exact two-sided binomial test of x<sub>A</sub> out of n against 50%: the p-value adds the probabilities of every split no more likely than the one observed. <b>Three or four:</b> a chi-square goodness-of-fit test against equal shares, χ² = Σ(x<sub>i</sub> − n/k)²/(n/k) on k − 1 degrees of freedom, followed by an exact binomial <b>head-to-head</b> test of the leader against the runner-up among the people who chose either. A significant overall test can come from one weak design; only the head-to-head test says the leader beats its closest rival.</p>
        <p><b>Segments:</b> with a segment question, a chi-square test of independence (no continuity correction) on the segment × design table, Cramér's V = √(χ²/(n(min(r, c) − 1))) for its size, and Fisher's exact test when the table is 2 × 2. <b>Position:</b> an exact binomial test of the share who chose the first design shown against 1/k.</p>
        <p><b>When not to use it:</b> to decide which design works better. Preference is a first impression; pair it with task-based tests. Avoid it when designs differ in many ways at once (you will not know what drove the choice), and when one design is familiar to participants (people favour what they know). For a 60/40 split between two designs, plan for about 200 participants (normal approximation, 80% power, two-sided α = 0.05).</p>
      </About>
    </>
  );
}

export default RunnersPreference;
