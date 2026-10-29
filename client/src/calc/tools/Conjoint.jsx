import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './conjoint-core.js';
import * as M from './conjoint-models.js';
import * as R from './conjoint-report.js';
import { runHB } from './conjoint-hb.js';
import { Choice, Result, Stats, Problem, About, Num, Pick, Area, Bars, download, copyText, num, pct } from './ui.jsx';
import './conjoint.css';

const DRAFT_KEY = 'uxatlas:conjoint:draft';
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const writeDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'];
const col = (i) => COLORS[i % COLORS.length];
const LETTERS = 'ABCDEFGHIJ';
const money = (x, u) => (Number.isFinite(x) ? `${x < 0 ? '−' : ''}${u}${Math.abs(x).toFixed(2)}` : '—');
const exampleCodes = (ex) => ex.results.map(C.encodeResult).join('\n');

// ── Respondent screen: choice tasks, rating cards or a ranking, then a result code ──
function Participant({ study, preview, onExit }) {
  const attrs = useMemo(() => C.studyAttrs(study), [study]);
  const D = useMemo(() => C.studyDesign(study), [study]);
  const isCbc = study.k === 'cbc';
  const all = useMemo(() => (isCbc ? [] : [...D.cards, ...D.holdouts]), [D, isCbc]);
  const fresh = () => ({ pid: `P-${C.newId().slice(0, 5)}`, ver: isCbc ? Math.floor(Math.random() * D.versions.length) : 0, order: C.shuffle([...Array(isCbc ? study.T : all.length).keys()], C.rng((Math.random() * 1e9) | 0)) });
  const [s, setS] = useState(fresh);
  const [phase, setPhase] = useState('intro');
  const [pos, setPos] = useState(0);
  const [y, setY] = useState([]);
  const [ranked, setRanked] = useState([]);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const top = useRef(null);
  useEffect(() => { top.current?.scrollTo?.(0, 0); }, [phase, pos]);
  const finish = (vals) => {
    const result = { v: 1, t: 'cjr', s: study.id, dh: study.dh, p: s.pid, d: Date.now(), ...(isCbc ? { ver: s.ver } : {}), y: vals };
    const c = C.encodeResult(result); setCode(c); setSaved(preview ? false : C.saveSession(study.id, c)); setPhase('done');
  };
  const answer = (v) => {
    const next = [...y]; next[isCbc ? pos : s.order[pos]] = v;
    setY(next);
    if (pos + 1 < (isCbc ? study.T : all.length)) setPos(pos + 1); else finish(next);
  };
  const again = () => { setS(fresh()); setY([]); setRanked([]); setPos(0); setCode(''); setCopied(false); setPhase('intro'); };
  const Profile = ({ p }) => <dl>{attrs.map((a, q) => <div key={a.name}><dt>{a.name}</dt><dd>{a.levels[p[q]]}</dd></div>)}</dl>;
  const rankOrder = s.order; const unranked = rankOrder.filter((i) => !ranked.includes(i));
  const pickRank = (i) => { const r = [...ranked, i]; const rest = rankOrder.filter((k) => !r.includes(k)); setRanked(rest.length === 1 ? [...r, rest[0]] : r); };
  const mail = `mailto:?subject=${encodeURIComponent(`Conjoint results: ${study.n}`)}&body=${encodeURIComponent(`My result code for "${study.n}":\n\n${code}\n`)}`;
  const task = isCbc ? D.versions[s.ver][s.order[pos]] : null;
  const nSteps = isCbc ? study.T : study.r === 'rank' ? 1 : all.length;
  return createPortal(
    <div className="tt-run" ref={top} role="dialog" aria-modal="true" aria-label={`Survey: ${study.n}`}>
      <div className="tt-run-in" style={isCbc ? { maxWidth: 900 } : undefined}>
        {preview && <p className="calc-warn">Preview: this run is not saved in the browser. <button type="button" className="clu-link" onClick={onExit}>Close the preview</button></p>}
        {phase === 'intro' && (
          <>
            <p className="eyebrow">Short survey</p>
            <h1>{study.n}</h1>
            {isCbc
              ? <p>You'll see {study.T} sets of {study.J} options. In each set, choose the one you would pick if these were the only options available{study.no ? ', or say you would choose none of them' : ''}. Options differ in {attrs.map((a) => a.name.toLowerCase()).join(', ')}.</p>
              : study.r === 'rank'
                ? <p>You'll see {all.length} options. Click them in order of preference: your favourite first, then your next favourite, and so on.</p>
                : <p>You'll see {all.length} options, one at a time. Rate how likely you would be to choose each one, from 0 (definitely not) to 10 (definitely).</p>}
            <p>There are no right or wrong answers. Go with your first reaction.</p>
            <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
            <div className="tt-actions"><button type="button" className="btn" onClick={() => setPhase('task')}>Start</button></div>
          </>
        )}
        {phase === 'task' && isCbc && (
          <>
            <div className="prog">Choice {pos + 1} of {nSteps}</div>
            <h1 style={{ fontSize: 22 }}>Which would you choose?</h1>
            <div className="cj-choice" style={{ '--cols': study.J }}>
              {task.map((p, j) => (
                <div key={j} className="cj-opt">
                  <h2>Option {LETTERS[j]}</h2>
                  <Profile p={p} />
                  <button type="button" className="btn" onClick={() => answer(j)} aria-label={`Choose option ${LETTERS[j]}`}>Choose {LETTERS[j]}</button>
                </div>
              ))}
            </div>
            {!!study.no && <button type="button" className="btn ghost cj-none" onClick={() => answer(study.J)}>I wouldn't choose any of these</button>}
          </>
        )}
        {phase === 'task' && !isCbc && study.r !== 'rank' && (
          <>
            <div className="prog">Option {pos + 1} of {nSteps}</div>
            <div className="cj-opt"><Profile p={all[s.order[pos]]} /></div>
            <div className="calc-field">
              <span>How likely would you be to choose this?</span>
              <div className="cj-scale" role="group" aria-label="Rating from 0 to 10">{[...Array(11).keys()].map((v) => <button key={v} type="button" onClick={() => answer(v)}>{v}</button>)}</div>
              <div className="cj-scale-ends"><span>0 Definitely not</span><span>10 Definitely</span></div>
            </div>
          </>
        )}
        {phase === 'task' && !isCbc && study.r === 'rank' && (
          <>
            <div className="prog">{ranked.length} of {all.length} ranked</div>
            <h1 style={{ fontSize: 22 }}>{unranked.length ? `Click your ${ranked.length ? 'next favourite' : 'favourite'}` : 'All ranked'}</h1>
            <div className="cj-choice" style={{ '--cols': 3 }}>
              {rankOrder.map((i) => {
                const r = ranked.indexOf(i);
                return (
                  <div key={i} className={`cj-opt${r >= 0 ? ' ranked' : ''}`}>
                    {r >= 0 ? <span className="rk">Rank {r + 1}</span> : null}
                    <Profile p={all[i]} />
                    {r < 0 && <button type="button" className="btn small" onClick={() => pickRank(i)}>Rank {ranked.length + 1}</button>}
                  </div>
                );
              })}
            </div>
            <div className="tt-actions">
              <button type="button" className="btn ghost small" disabled={!ranked.length} onClick={() => setRanked(ranked.slice(0, ranked.length >= all.length ? -2 : -1))}>Undo</button>
              <button type="button" className="btn" disabled={ranked.length < all.length} onClick={() => { const v = []; ranked.forEach((i, r) => { v[i] = r + 1; }); finish(v); }}>Finish</button>
            </div>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="eyebrow">Finished</p>
            <h1>Thank you</h1>
            <p>Please send this code to the researcher. It holds your answers and nothing else.</p>
            <textarea className="tl-code" readOnly rows={4} value={code} aria-label="Your result code" onFocus={(e) => e.target.select()} />
            <div className="tt-actions">
              <button type="button" className="btn" onClick={async () => setCopied(await copyText(code))}>{copied ? 'Copied' : 'Copy code'}</button>
              <a className="btn ghost" href={mail}>Email to researcher</a>
            </div>
            <p className="tl-note">Nothing has been uploaded: your answers stay on this device until you send the code. {saved ? 'A copy is kept in this browser so a researcher running sessions here can collect it.' : ''}</p>
            {!preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={again}>Start a new session (moderated testing)</button></div>}
            {preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={onExit}>Close the preview</button></div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Charts ──
// Part-worths per attribute as diverging bars around zero, with 95% interval whiskers when given.
// series: [{ name, pw: [[level values]], ci: [[[lo, hi]]] | null }]
function PwChart({ attrs, series, fmt = (v) => num(v) }) {
  const max = Math.max(1e-9, ...series.flatMap((s) => s.pw.flat().map(Math.abs)), ...series.flatMap((s) => (s.ci ? s.ci.flat().flat().filter(Number.isFinite).map(Math.abs) : [])));
  const x = (v) => 50 + (50 * v) / max;
  const multi = series.length > 1;
  return (
    <div className="cj-pw">
      {attrs.map((a, q) => (
        <div key={a.name} className="cj-pw-attr">
          <h4>{!multi && <i style={{ background: col(q) }} />}{a.name}</h4>
          {a.levels.map((l, li) => (
            <div key={l} className="cj-pw-row">
              <span className="nm" title={l}>{l}</span>
              <span className="cj-track" aria-hidden="true">
                {series.map((s, si) => {
                  const v = s.pw[q][li]; const h = multi ? Math.max(4, 14 / series.length) : 10; const top = multi ? 2 + si * (h + 1) : 4;
                  const ci = s.ci?.[q]?.[li];
                  return (
                    <span key={si}>
                      <i className="cj-bar" style={{ left: `${Math.min(x(0), x(v))}%`, width: `${Math.abs(x(v) - x(0))}%`, top, height: h, background: multi ? col(si) : col(q) }} />
                      {ci && Number.isFinite(ci[0]) && <i className="cj-ci" style={{ left: `${x(ci[0])}%`, width: `${Math.max(0.3, x(ci[1]) - x(ci[0]))}%`, top: top + h / 2 - 1 }} />}
                    </span>
                  );
                })}
              </span>
              <b>{multi ? series.map((s) => fmt(s.pw[q][li])).join(' / ') : fmt(series[0].pw[q][li])}</b>
            </div>
          ))}
        </div>
      ))}
      {multi && <ul className="cj-legend">{series.map((s, i) => <li key={s.name}><i style={{ background: col(i) }} />{s.name}</li>)}</ul>}
    </div>
  );
}
function ImpBars({ attrs, imp, label = 'Attribute importance' }) {
  const mx = Math.max(...imp, 1e-9);
  return <Bars label={label} rows={attrs.map((a, q) => [a.name, imp[q] / mx, pct(imp[q], 1)]).sort((a, b) => b[1] - a[1])} />;
}
// Lines of y against x (share against price). series: [{ name, ys }]
function LineChart({ xs, series, xFmt, yFmt = (v) => pct(v), label }) {
  const W = 640, H = 300, pl = 54, pr = 130, pt = 14, pb = 40;
  const ymax = Math.max(0.05, ...series.flatMap((s) => s.ys)); const yTop = Math.min(1, Math.ceil(ymax * 10) / 10);
  const X = (v) => pl + ((v - xs[0]) / Math.max(1e-9, xs[xs.length - 1] - xs[0])) * (W - pl - pr), Y = (v) => pt + (1 - v / yTop) * (H - pt - pb);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yTop);
  const ends = series.map((s, i) => ({ i, y: Y(s.ys[s.ys.length - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
  const labelY = Object.fromEntries(ends.map((e) => [e.i, e.y]));
  return (
    <svg className="cj-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => <g key={t}><line className="grid" x1={pl} x2={W - pr} y1={Y(t)} y2={Y(t)} /><text className="ax" x={pl - 8} y={Y(t) + 4} textAnchor="end">{yFmt(t)}</text></g>)}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => { const v = xs[0] + t * (xs[xs.length - 1] - xs[0]); return <text key={t} className="ax" x={X(v)} y={H - pb + 20} textAnchor="middle">{xFmt(v)}</text>; })}
      {series.map((s, i) => (
        <g key={s.name}>
          <polyline className="ln" style={{ stroke: col(i), strokeDasharray: s.dashed ? '6 4' : undefined }} points={s.ys.map((v, k) => `${X(xs[k])},${Y(v)}`).join(' ')} />
          <text className="lb" x={W - pr + 8} y={labelY[i] + 4} style={{ fill: col(i) }}>{s.name} {pct(s.ys[s.ys.length - 1])}</text>
        </g>
      ))}
    </svg>
  );
}
function Trace({ name, values, burn, stat }) {
  const n = values.length; const lo = Math.min(...values), hi = Math.max(...values); const span = hi - lo || 1;
  const step = Math.max(1, Math.floor(n / 400));
  const pts = []; for (let i = 0; i < n; i += step) pts.push(`${(i / (n - 1)) * 300},${60 - ((values[i] - lo) / span) * 56 - 2}`);
  return (
    <div className="cj-trace">
      <div className="t"><span title={name}>{name}</span><em>{stat}</em></div>
      <svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
        <rect className="burn" x="0" y="0" width={(burn / n) * 300} height="60" />
        <polyline className="ln" points={pts.join(' ')} />
      </svg>
    </div>
  );
}
function WtpTable({ attrs, priceIdx, wtp, unit, interval = '95% CI' }) {
  if (!wtp) return null;
  const rows = [];
  attrs.forEach((a, q) => { if (q !== priceIdx && wtp[q]) a.levels.forEach((l, li) => { if (li > 0) rows.push([`${a.name}: ${l} vs ${a.levels[0]}`, wtp[q][li]]); }); });
  return (
    <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Willingness to pay">
      <thead><tr><th>Upgrade</th><th>Willingness to pay</th><th>{interval}</th></tr></thead>
      <tbody>{rows.map(([k, w]) => <tr key={k}><td>{k}</td><td>{money(w.w, unit)}</td><td>{money(w.lo, unit)} to {money(w.hi, unit)}</td></tr>)}</tbody>
    </table></div>
  );
}
function Progress({ value, label }) {
  return <div className="calc-field wide"><span>{label} {pct(value)}</span><div className="cj-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: `${value * 100}%` }} /></div></div>;
}

// Runs a fit in a Web Worker (falls back to the page if workers are unavailable), with progress.
function useJob() {
  const [state, setState] = useState({ running: null, progress: 0, error: '' });
  const ref = useRef(null);
  const stop = () => { ref.current?.terminate(); ref.current = null; setState((s) => ({ ...s, running: null })); };
  useEffect(() => () => ref.current?.terminate(), []);
  const run = (type, S, opts, onDone) => {
    ref.current?.terminate();
    const inPage = () => { setState({ running: type, progress: 0, error: '' }); setTimeout(() => { try { onDone(type === 'hb' ? runHB(S, opts) : M.latentClassSweep(S, opts)); setState({ running: null, progress: 1, error: '' }); } catch (e) { setState({ running: null, progress: 0, error: e.message }); } }, 30); };
    let w = null;
    try { if (typeof Worker !== 'undefined') w = new Worker(new URL('./conjoint.worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }
    if (!w) { inPage(); return; }
    ref.current = w;
    w.onmessage = ({ data }) => {
      if (data.progress !== undefined) setState((s) => ({ ...s, progress: data.progress }));
      else { w.terminate(); ref.current = null; if (data.error) setState({ running: null, progress: 0, error: data.error }); else { onDone(data.result); setState({ running: null, progress: 1, error: '' }); } }
    };
    w.onerror = (e) => { e.preventDefault?.(); w.terminate(); ref.current = null; inPage(); };
    setState({ running: type, progress: 0, error: '' });
    w.postMessage({ id: 1, type, S, opts });
  };
  return { ...state, run, stop };
}

// ── Step 1: design ──
function DesignStep({ draft, setDraft, built, study }) {
  const set = (patch) => setDraft({ ...draft, ...patch, fixed: undefined });
  const isCbc = draft.kind === 'cbc';
  const parsed = useMemo(() => C.parseAttributes(draft.attrsText), [draft.attrsText]);
  const numericAttrs = parsed.attrs.map((a, q) => [q, a]).filter(([, a]) => a.levels.every((l) => Number.isFinite(C.numberIn(l))));
  const info = useMemo(() => {
    if (!study) return null;
    const attrs = built.attrs, L = built.L;
    if (isCbc) {
      const dg = C.cbcDiagnostics(built.design, L);
      const coder = C.makeCoder(attrs, { price: built.price, none: !!study.no });
      const nPlan = Math.max(1, Math.round(Number(draft.nPlan) || 200));
      const ex = C.expectedSE(built.design.versions, coder, nPlan);
      const maxSE = ex.se ? Math.max(...ex.se) : Infinity;
      return { kind: 'cbc', dg, coder, ex, nPlan, maxSE, dErr: C.dError(ex.info, coder.K), orme: C.ormeN(L, study.T, study.J), overlap: Math.max(...dg.overlap) };
    }
    const D = built.design; const p = 1 + L.reduce((s, l) => s + l - 1, 0);
    return { kind: 'trad', eff: D.eff, balance: D.balance, p, df: D.cards.length - p, method: D.method, orthogonal: D.orthogonal };
  }, [built, study, isCbc, draft.nPlan]);
  const sum = useMemo(() => {
    if (!info) return null;
    if (info.kind === 'cbc') return R.designSummary({ kind: 'cbc', method: { random: 'random sampling', balanced: 'balanced overlap', enumeration: 'complete enumeration' }[draft.method] || draft.method, dEff: info.dg.eff.dEff, maxSE: info.maxSE, nPlan: info.nPlan, orme: info.orme, overlap: info.overlap, nVersions: study.d.length, tasks: study.T, alts: study.J });
    return R.designSummary({ kind: 'trad', method: info.method, dEff: info.eff.dEff, nParams: info.p, nCards: built.design.cards.length, df: info.df });
  }, [info, draft.method, study, built]);
  const csv = () => download(`conjoint-design-${study.id}.csv`, C.designCsv(study), 'text/csv');
  return (
    <div className="clu-root">
      <div className="cj-row">
        <label className="calc-field cj-name" style={{ flex: '1 1 280px' }}><span>Study name</span><input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <Choice label="Kind of conjoint" value={draft.kind} onChange={(k) => set({ kind: k })} options={[['cbc', 'Choice-based (CBC)'], ['trad', 'Ratings or ranking cards']]} />
      </div>
      <div className="cj-grid2">
        <Area label="Attributes and levels, one attribute per line" value={draft.attrsText} onChange={(v) => set({ attrsText: v })} rows={6} hint='Write "Name: level, level, level". 2–6 attributes of 2–5 levels each work best. Levels with numbers (prices) can be used as a numeric price.' />
        <div className="clu-root" style={{ gap: 14 }}>
          <Pick label="Price attribute (numeric, for willingness to pay)" value={String(draft.price)} onChange={(v) => set({ price: Number(v) })} options={[['-1', 'None'], ...numericAttrs.map(([q, a]) => [String(q), a.name])]} />
          <Area label="Prohibited pairs (optional), one per line" value={draft.prohibText} onChange={(v) => set({ prohibText: v })} rows={3} placeholder="Storage = Unlimited & Price = £4" hint="Combinations that must never be shown. Prohibitions lower efficiency; use as few as possible." />
        </div>
      </div>
      {parsed.bad.length > 0 && <Problem>Lines {parsed.bad.join(', ')} could not be read: use "Name: level, level", with at least two different levels.</Problem>}
      {built.prohibBad?.length > 0 && <Problem>Prohibition lines {built.prohibBad.join(', ')} could not be read: use "Attribute = level & Attribute = level" with names exactly as above.</Problem>}
      {isCbc ? (
        <div className="cj-row">
          <Num label="Tasks per respondent" value={draft.T} onChange={(v) => set({ T: v })} min={2} max={30} />
          <Num label="Alternatives per task" value={draft.J} onChange={(v) => set({ J: v })} min={2} max={5} />
          <Num label="Versions" value={draft.V} onChange={(v) => set({ V: v })} min={1} max={50} hint="Different task sets, handed out in turn." />
          <Num label="Planned respondents" value={draft.nPlan} onChange={(v) => set({ nPlan: v })} min={10} />
          <Choice label="Design method" value={draft.method} onChange={(m) => set({ method: m })} options={[['enumeration', 'Complete enumeration'], ['balanced', 'Balanced overlap'], ['random', 'Random']]} />
          <label className="tl-check"><input type="checkbox" checked={!!draft.none} onChange={(e) => set({ none: e.target.checked })} /> Include "none of these"</label>
        </div>
      ) : (
        <div className="cj-row">
          <Choice label="Respondents" value={draft.resp} onChange={(r) => set({ resp: r })} options={[['rate', 'Rate each card 0–10'], ['rank', 'Rank all cards']]} />
          <Num label="Minimum cards (blank: auto)" value={draft.minCards} onChange={(v) => set({ minCards: v })} min={2} max={60} />
          <Num label="Holdout cards" value={draft.holdouts} onChange={(v) => set({ holdouts: v })} min={0} max={6} />
          <Num label="Planned respondents" value={draft.nPlan} onChange={(v) => set({ nPlan: v })} min={5} />
        </div>
      )}
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={() => set({ seed: (Number(draft.seed) || 1) + 1 })}>Generate another design</button>
        {study && <button type="button" className="btn ghost small" onClick={csv}>Download design (CSV for Qualtrics, Google Forms…)</button>}
        <span className="tl-note">Seed {draft.seed}: the same settings and seed always give the same design.</span>
      </div>
      {built.error && <Problem>{built.error}</Problem>}
      {draft.fixed && <p className="tl-note">This design was opened from a study link and is kept exactly as it was. Changing any setting above generates a new design, and codes collected with the old one will no longer match.</p>}
      {info?.kind === 'cbc' && (
        <>
          <Result big={`${num(info.dg.eff.dEff, 1)}% D-efficient`} label={`${study.d.length} versions × ${study.T} tasks × ${study.J} alternatives${study.no ? ' + none' : ''}; largest expected SE at n = ${info.nPlan}: ${num(info.maxSE, 3)}`} tone={info.maxSE <= 0.05 && info.dg.eff.dEff >= 80 ? 'good' : info.maxSE > 0.1 ? 'bad' : undefined} />
          <Stats rows={[
            ['D-efficiency (Street-Burgess)', `${num(info.dg.eff.dEff, 1)}%`],
            ['D-error per respondent (β = 0)', num(info.dErr, 4)],
            ['Parameters estimated', `${info.coder.K}`],
            ["Orme's minimum sample", `${info.orme} respondents`],
            ['Largest expected SE', `${num(info.maxSE, 3)} at n = ${info.nPlan}`],
            ['Tasks with a repeated level', info.dg.overlap.map((o, q) => `${built.attrs[q].name} ${pct(o)}`).join(', ')],
          ]} />
          <details>
            <summary><b>Level balance and expected standard errors</b></summary>
            <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Level balance">
              <thead><tr><th>Attribute</th><th>Times each level is shown</th></tr></thead>
              <tbody>{built.attrs.map((a, q) => <tr key={a.name}><td>{a.name}</td><td>{a.levels.map((l, i) => `${l}: ${info.dg.balance[q][i]}`).join(' · ')}</td></tr>)}</tbody>
            </table></div>
            <div className="clu-scroll" style={{ marginTop: 10 }}><table className="clu-table clu-num" aria-label="Expected standard errors">
              <thead><tr><th>Parameter (effects coding)</th><th>Expected SE at n = {info.nPlan}</th></tr></thead>
              <tbody>{info.coder.cols.map((c, k) => <tr key={c}><td>{c}</td><td className={info.ex.se?.[k] > 0.05 ? 'tl-cell-bad' : ''}>{num(info.ex.se?.[k], 3)}</td></tr>)}</tbody>
            </table></div>
          </details>
          <h3 className="clu-h3">First tasks of version 1</h3>
          <div className="cj-tasks">{built.design.versions[0].slice(0, 3).map((t, ti) => (
            <div key={ti} className="cj-task"><b>Task {ti + 1}</b><div className="cj-alts">{t.map((p, j) => <div key={j} className="cj-alt"><dl>{built.attrs.map((a, q) => <div key={a.name}><dt>{a.name}</dt><dd>{a.levels[p[q]]}</dd></div>)}</dl></div>)}{study.no ? <div className="cj-alt"><dl><dt>Option {LETTERS[t.length]}</dt><dd>None of these</dd></dl></div> : null}</div></div>
          ))}</div>
        </>
      )}
      {info?.kind === 'trad' && (
        <>
          <Result big={`${num(info.eff.dEff, 1)}% D-efficient`} label={`${built.design.cards.length} cards + ${built.design.holdouts.length} holdouts · ${info.method}`} tone={info.eff.dEff >= 90 && info.df >= 4 ? 'good' : info.df < 2 ? 'bad' : undefined} />
          <Stats rows={[
            ['Design', info.method],
            ['Orthogonal (strength 2)', info.orthogonal ? 'Yes' : 'No'],
            ['Parameters (with intercept)', `${info.p}`],
            ['Residual df per respondent', `${info.df}`],
            ['Level balance', info.balance.map((b, q) => `${built.attrs[q].name} ${b.join('/')}`).join(', ')],
          ]} />
          <div className="clu-scroll"><table className="clu-table" aria-label="Cards">
            <thead><tr><th>Card</th>{built.attrs.map((a) => <th key={a.name}>{a.name}</th>)}</tr></thead>
            <tbody>
              {built.design.cards.map((p, i) => <tr key={`c${i}`}><td>{i + 1}</td>{p.map((l, q) => <td key={q}>{built.attrs[q].levels[l]}</td>)}</tr>)}
              {built.design.holdouts.map((p, i) => <tr key={`h${i}`}><td>{built.design.cards.length + i + 1} <span className="qtag">holdout</span></td>{p.map((l, q) => <td key={q}>{built.attrs[q].levels[l]}</td>)}</tr>)}
            </tbody>
          </table></div>
        </>
      )}
      {sum && <StudySummary {...sum} />}
    </div>
  );
}

// ── Step 2: field ──
function FieldStep({ study, link, onPreview }) {
  const [copied, setCopied] = useState(false);
  if (!study) return <Problem>Fix the design first.</Problem>;
  const attrs = C.studyAttrs(study);
  return (
    <div className="clu-root">
      <h3 className="clu-h3">Respondent link</h3>
      <textarea className="tl-code" readOnly rows={3} value={link} aria-label="Respondent link" onFocus={(e) => e.target.select()} />
      <div className="clu-actions">
        <button type="button" className="btn small" onClick={async () => setCopied(await copyText(link))}>{copied ? 'Copied' : 'Copy respondent link'}</button>
        <button type="button" className="btn ghost small" onClick={onPreview}>Preview as respondent</button>
        <span className="tl-note">Study <code>{study.id}</code> · design <code>{study.dh}</code> · link {link.length} characters</span>
      </div>
      <p className="tl-note">The whole design travels inside the link, compressed; nothing is stored on a server. {study.k === 'cbc' ? `Each respondent gets one of the ${study.d.length} versions at random and makes ${study.T} choices.` : study.r === 'rank' ? 'Each respondent ranks all cards (in random screen order).' : 'Each respondent rates every card from 0 to 10, in random order.'} At the end they see a result code to copy or email to you; paste the codes into step 3. For moderated sessions on one device, results are also kept in this browser.</p>
      <p className="tl-note">If you change the design after sharing the link, the old codes no longer match it and are left out, so finish the design first.</p>
      <h3 className="clu-h3">Or field it in your own survey tool</h3>
      <ul className="tl-defs">
        <li>Download the design CSV in step 1 and build one question per {study.k === 'cbc' ? 'task (a version per block or embedded-data branch)' : 'card'} in Qualtrics, SurveyMonkey or Google Forms.</li>
        {study.k === 'cbc'
          ? <li>Paste the answers in step 3 in <b>long format</b>: one row per alternative with columns <code>respondent, task, alternative, {attrs.map((a) => a.name).join(', ')}, choice</code> (1 chosen, 0 not). Give the "none" row empty attribute cells or the word none.</li>
          : <><li><b>Wide</b>: one row per respondent: <code>respondent</code>, then one column per card in design order with holdouts last.</li><li><b>Long</b>: <code>respondent, card, rating</code> (or <code>rank</code>), or <code>respondent, {attrs.map((a) => a.name).join(', ')}, rating</code>.</li></>}
      </ul>
    </div>
  );
}

// ── Step 3: analyse ──
function TradResults({ attrs, coder, fit, rol, ds, wtp, unit, sum, priceIdx }) {
  const pw = coder.partWorths(fit.mean);
  const K = coder.K; const ci = coder.pwRows.map((rows) => rows.map((c) => { let v = 0; for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) v += c[a] * fit.cov[a * K + b] * c[b]; const m = C.dot(c, fit.mean); return [m - 1.96 * Math.sqrt(v), m + 1.96 * Math.sqrt(v)]; }));
  const imp = M.meanImportance(fit.ok.map((p) => coder.partWorths(p.beta)));
  return (
    <>
      <Result big={`R² ${num(fit.meanR2, 2)}`} label={`Mean R² of ${fit.ok.length} per-respondent regressions${Number.isFinite(fit.hitRate) ? `; holdout hit rate ${pct(fit.hitRate)} (chance ${pct(fit.chance)})` : ''}`} />
      <Stats rows={[
        ['Respondents fitted', `${fit.ok.length} of ${fit.people.length}`],
        ['Cards per respondent', `${ds.resp[0].cards.filter((c) => !c.hold).length} + ${ds.resp[0].cards.filter((c) => c.hold).length} holdouts`],
        ['Holdout hit rate', Number.isFinite(fit.hitRate) ? `${pct(fit.hitRate)} (chance ${pct(fit.chance)})` : 'no holdouts'],
        ['Mean holdout correlation', num(fit.holdR, 2)],
        ['Dependent variable', ds.mode === 'rank' ? 'Reversed rank (C + 1 − rank)' : 'Rating'],
      ]} />
      <h3 className="clu-h3">Attribute importance (mean of individual importances)</h3>
      <ImpBars attrs={attrs} imp={imp} />
      <h3 className="clu-h3">Mean part-worths with 95% confidence intervals</h3>
      <PwChart attrs={attrs} series={[{ name: 'Mean', pw, ci }]} />
      {rol && (
        <details open>
          <summary><b>Rank-ordered (exploded) logit on all rankings</b></summary>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Rank-ordered logit">
            <thead><tr><th>Parameter</th><th>β</th><th>SE</th><th>z</th></tr></thead>
            <tbody>{coder.cols.map((c, k) => <tr key={c}><td>{c}</td><td>{num(rol.beta[k], 3)}</td><td>{num(rol.se?.[k], 3)}</td><td>{num(rol.beta[k] / rol.se?.[k], 2)}</td></tr>)}</tbody>
          </table></div>
          <p className="tl-note">Log-likelihood {num(rol.ll, 2)} over {rol.nSets} exploded choices.</p>
        </details>
      )}
      {wtp && <><h3 className="clu-h3">Willingness to pay ({unit || 'price units'})</h3><WtpTable attrs={attrs} priceIdx={priceIdx} wtp={wtp} unit={unit} /><p className="tl-note">From the mean part-worths, with a delta-method interval using the spread of individual estimates.</p></>}
      <details>
        <summary><b>Every respondent</b></summary>
        <div className="clu-scroll"><table className="clu-table clu-num">
          <thead><tr><th>Respondent</th><th>R²</th><th>Residual df</th><th>Holdout hit</th><th>Most important</th></tr></thead>
          <tbody>{fit.people.map((p) => { if (!p.ok) return <tr key={p.id}><td>{p.id}</td><td colSpan={4}>Not enough cards to fit</td></tr>; const im = M.importance(coder.partWorths(p.beta)); const qb = im.indexOf(Math.max(...im)); return <tr key={p.id} className={p.r2 < 0.5 ? 'hl' : ''}><td>{p.id}</td><td>{num(p.r2, 2)}</td><td>{p.df}</td><td>{Number.isFinite(p.hit) ? (p.hit ? 'Yes' : 'No') : '—'}</td><td>{attrs[qb].name} ({pct(im[qb])})</td></tr>; })}</tbody>
        </table></div>
      </details>
      {sum && <StudySummary {...sum} />}
    </>
  );
}

function MnlResults({ attrs, coder, mnl, stats, wtp, unit, sum, priceIdx }) {
  const pw = coder.partWorths(mnl.beta); const K = coder.K;
  const ci = coder.pwRows.map((rows) => rows.map((c) => { let v = 0; for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) v += c[a] * mnl.cov[a * K + b] * c[b]; const m = C.dot(c, mnl.beta); return [m - 1.96 * Math.sqrt(v), m + 1.96 * Math.sqrt(v)]; }));
  return (
    <>
      <Result big={`ρ² ${num(stats.rho2, 3)}`} label={`McFadden pseudo-R² · hit rate ${pct(stats.hit)} (chance ${pct(stats.chance)}) · RLH ${num(stats.rlh, 3)}`} />
      <Stats rows={[
        ['Choices', `${stats.nSets}`], ['Log-likelihood', `${num(stats.ll, 2)} (null ${num(stats.ll0, 2)})`], ['Hit rate', pct(stats.hit, 1)], ['Root likelihood (RLH)', num(stats.rlh, 3)],
        Number.isFinite(stats.noneObs) && ['"None" share', `${pct(stats.noneObs, 1)} chosen, ${pct(stats.nonePred, 1)} predicted`],
        ['Newton-Raphson', `${mnl.iter} iterations${mnl.converged ? '' : ' (not converged)'}`],
      ]} />
      <h3 className="clu-h3">Attribute importance</h3>
      <ImpBars attrs={attrs} imp={M.importance(pw)} />
      <h3 className="clu-h3">Part-worths (utilities) with 95% confidence intervals</h3>
      <PwChart attrs={attrs} series={[{ name: 'MNL', pw, ci }]} />
      <details>
        <summary><b>Coefficients</b></summary>
        <div className="clu-scroll"><table className="clu-table clu-num" aria-label="MNL coefficients">
          <thead><tr><th>Parameter (effects coding)</th><th>β</th><th>SE</th><th>z</th></tr></thead>
          <tbody>{coder.cols.map((c, k) => <tr key={c}><td>{c}</td><td>{num(mnl.beta[k], 4)}</td><td>{num(mnl.se?.[k], 4)}</td><td>{num(mnl.beta[k] / mnl.se?.[k], 2)}</td></tr>)}</tbody>
        </table></div>
        <p className="tl-note">The last level of each attribute is −(sum of the others). Price is per unit of money, centred on the mean price.</p>
      </details>
      {wtp && <><h3 className="clu-h3">Willingness to pay ({unit || 'price units'})</h3><WtpTable attrs={attrs} priceIdx={priceIdx} wtp={wtp} unit={unit} /></>}
      {sum && <StudySummary {...sum} />}
    </>
  );
}

function LcResults({ attrs, coder, lc, n, job, onRun, kMax, setKMax, sum, unit, priceIdx }) {
  const [k, setK] = useState(null);
  const f = lc ? lc.fits.find((x) => x.k === (k ?? lc.best)) || lc.fits[0] : null;
  return (
    <>
      <div className="cj-row">
        <Num label="Up to k segments" value={kMax} onChange={setKMax} min={2} max={8} />
        <button type="button" className="btn small" disabled={!!job.running} onClick={onRun}>{lc ? 'Fit again' : 'Fit latent-class models'}</button>
        {job.running === 'lc' && <button type="button" className="btn ghost small" onClick={job.stop}>Stop</button>}
      </div>
      {job.running === 'lc' && <Progress value={job.progress} label="Fitting k = 1 to the maximum, 6 random starts each…" />}
      {job.error && <Problem>{job.error}</Problem>}
      {!lc && !job.running && <p className="tl-note">Latent class splits respondents into k segments with their own part-worths, fitted by EM with random starts in a background worker; BIC chooses k. It takes a few seconds for 200 respondents.</p>}
      {lc && f && (
        <>
          <Result big={`${lc.best} segment${lc.best > 1 ? 's' : ''} by BIC`} label={`Sizes ${lc.fits.find((x) => x.k === lc.best).pi.map((p) => pct(p)).join(', ')} · ${n} respondents`} />
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Model selection">
            <thead><tr><th>k</th><th>Log-likelihood</th><th>Parameters</th><th>BIC</th><th>AIC</th><th>CAIC</th><th>Entropy R²</th><th>Smallest</th></tr></thead>
            <tbody>{lc.fits.map((x) => <tr key={x.k} className={x.k === f.k ? 'on' : ''}><td><button type="button" className="clu-link" onClick={() => setK(x.k)}>{x.k}</button>{x.k === lc.best ? ' ✓' : ''}</td><td>{num(x.ll, 1)}</td><td>{x.P}</td><td className={x.k === lc.best ? 'cj-cell-best' : ''}>{num(x.bic, 1)}</td><td>{num(x.aic, 1)}</td><td>{num(x.caic, 1)}</td><td>{x.k > 1 ? num(x.entropyR2, 2) : '—'}</td><td>{pct(Math.min(...x.pi))}</td></tr>)}</tbody>
          </table></div>
          <p className="tl-note">Click a k to inspect it. ✓ marks the lowest BIC.</p>
          <h3 className="clu-h3">Segment part-worths, k = {f.k}</h3>
          <PwChart attrs={attrs} series={f.betas.map((b, c) => ({ name: `Segment ${c + 1} (${pct(f.pi[c])})`, pw: coder.partWorths(b) }))} />
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Importance by segment">
            <thead><tr><th>Importance</th>{f.betas.map((_, c) => <th key={c}>Segment {c + 1} ({pct(f.pi[c])})</th>)}</tr></thead>
            <tbody>{attrs.map((a, q) => <tr key={a.name}><td>{a.name}</td>{f.betas.map((b, c) => <td key={c}>{pct(M.importance(coder.partWorths(b))[q], 1)}</td>)}</tr>)}
              {coder.none && <tr><td>None constant</td>{f.betas.map((b, c) => <td key={c}>{num(b[coder.noneCol], 2)}</td>)}</tr>}
              {priceIdx >= 0 && attrs.map((a, q) => (q === priceIdx ? null : a.levels.slice(1).map((l, li) => <tr key={`${q}-${li}`}><td>WTP {a.name}: {l}</td>{f.betas.map((b, c) => { const w = M.wtpDelta(coder, b, null); return <td key={c}>{money(w[q][li + 1].w, unit)}</td>; })}</tr>)))}
            </tbody>
          </table></div>
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </>
  );
}

function HbResults({ attrs, coder, hb, rlh, job, onRun, opts, setOpts, sum, wtp, unit, priceIdx, imp }) {
  const K = coder.K;
  const pwDraws = hb ? hb.draws.map((d) => coder.partWorths(d)) : [];
  const ci = hb ? coder.pwRows.map((rows, q) => rows.map((_, l) => { const v = pwDraws.map((p) => p[q][l]).sort((a, b) => a - b); return [M.quantile(v, 0.025), M.quantile(v, 0.975)]; })) : null;
  return (
    <>
      <div className="cj-row">
        <Num label="Iterations" value={opts.R} onChange={(v) => setOpts({ ...opts, R: v })} min={1000} step={1000} />
        <Num label="Burn-in" value={opts.burn} onChange={(v) => setOpts({ ...opts, burn: v })} min={0} step={1000} />
        <Num label="Keep every" value={opts.thin} onChange={(v) => setOpts({ ...opts, thin: v })} min={1} />
        <Num label="Seed" value={opts.seed} onChange={(v) => setOpts({ ...opts, seed: v })} min={1} />
        <button type="button" className="btn small" disabled={!!job.running} onClick={onRun}>{hb ? 'Run again' : 'Run hierarchical Bayes'}</button>
        {job.running === 'hb' && <button type="button" className="btn ghost small" onClick={job.stop}>Stop</button>}
      </div>
      {job.running === 'hb' && <Progress value={job.progress} label="MCMC in a background worker:" />}
      {job.error && <Problem>{job.error}</Problem>}
      {!hb && !job.running && <p className="tl-note">Hierarchical Bayes estimates part-worths for every respondent by Markov chain Monte Carlo (Gibbs sampling with a Metropolis-Hastings step per person). 10,000 iterations take roughly 5–20 seconds for 200 respondents, in a background worker.</p>}
      {hb && (
        <>
          <Result big={`Acceptance ${pct(hb.acceptance)}`} label={`${hb.R.toLocaleString('en-GB')} iterations, ${hb.burn.toLocaleString('en-GB')} burn-in, ${hb.nKept} draws kept · largest split R̂ ${num(Math.max(...hb.diag.map((d) => d.rhat)), 3)} · smallest ESS ${Math.round(Math.min(...hb.diag.map((d) => d.ess)))}`} tone={Math.max(...hb.diag.map((d) => d.rhat)) < 1.05 && Math.min(...hb.diag.map((d) => d.ess)) >= 400 ? 'good' : undefined} />
          <Stats rows={[
            ['Respondents', `${hb.n}`], ['Mean RLH', `${num(rlh.mean, 3)} (chance ${num(rlh.chance, 3)})`], ['Respondents with RLH < 1.5 × chance', `${rlh.low} (${pct(rlh.low / hb.n)})`],
            ['Proposal scale s', num(hb.s, 3)], ['Log-likelihood: split R̂ / ESS', `${num(hb.llDiag.rhat, 3)} / ${Math.round(hb.llDiag.ess)}`],
          ]} />
          <h3 className="clu-h3">Attribute importance (mean of individual importances)</h3>
          <ImpBars attrs={attrs} imp={imp} />
          <h3 className="clu-h3">Population mean part-worths with 95% credible intervals</h3>
          <PwChart attrs={attrs} series={[{ name: 'HB mean', pw: coder.partWorths(hb.bbarMean), ci }]} />
          <h3 className="clu-h3">Convergence diagnostics</h3>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Convergence diagnostics">
            <thead><tr><th>Parameter</th><th>Posterior mean</th><th>95% credible interval</th><th>Heterogeneity SD √V</th><th>Split R̂</th><th>ESS</th><th>Geweke z</th></tr></thead>
            <tbody>{coder.cols.map((c, k) => { const d = hb.diag[k]; return <tr key={c}><td>{c}</td><td>{num(hb.bbarMean[k], 3)}</td><td>{num(hb.bbarCI[k][0], 3)} to {num(hb.bbarCI[k][1], 3)}</td><td>{num(Math.sqrt(hb.Vmean[k * K + k]), 3)}</td><td className={d.rhat >= 1.05 ? 'tl-cell-bad' : ''}>{num(d.rhat, 3)}</td><td className={d.ess < 400 ? 'tl-cell-bad' : ''}>{Math.round(d.ess)}</td><td className={Math.abs(d.geweke) > 1.96 ? 'tl-cell-bad' : ''}>{num(d.geweke, 2)}</td></tr>; })}</tbody>
          </table></div>
          <h3 className="clu-h3">Trace plots of the population means (shaded: burn-in)</h3>
          <div className="cj-traces">
            <Trace name="Log-likelihood" values={hb.trace.ll} burn={Math.floor(hb.burn / hb.trace.every)} stat={`R̂ ${num(hb.llDiag.rhat, 2)}`} />
            {coder.cols.map((c, k) => <Trace key={c} name={c} values={hb.trace.bbar[k]} burn={Math.floor(hb.burn / hb.trace.every)} stat={`R̂ ${num(hb.diag[k].rhat, 2)} · ESS ${Math.round(hb.diag[k].ess)}`} />)}
            <Trace name="Acceptance rate" values={hb.trace.acc} burn={Math.floor(hb.burn / hb.trace.every)} stat={pct(hb.acceptance)} />
          </div>
          {wtp && <><h3 className="clu-h3">Willingness to pay ({unit || 'price units'})</h3><WtpTable attrs={attrs} priceIdx={priceIdx} wtp={wtp} unit={unit} interval="95% credible interval" /><p className="tl-note">The ratio −β(level) ÷ β(price) for each kept draw of the population mean; median and 2.5–97.5% quantiles.</p></>}
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </>
  );
}

// ── Step 4: simulate ──
function Simulator({ attrs, coder, models, prohib, priceIdx, unit, onReport }) {
  const sources = Object.keys(models);
  const [srcKey, setSrcKey] = useState(sources.includes('hb') ? 'hb' : sources[0]);
  const source = models[srcKey] ? srcKey : sources[0];
  const model = models[source];
  const L = attrs.map((a) => a.levels.length);
  const pb = coder.blocks[priceIdx];
  const defaults = () => [0, 1, 2].map((j) => ({ name: `Product ${LETTERS[j]}`, lv: L.map((l) => Math.min(j, l - 1)), price: pb ? pb.values[Math.min(j, L[priceIdx] - 1)] : undefined, own: j === 0 }));
  const [products, setProducts] = useState(defaults);
  const [method, setMethod] = useState(source === 'trad' ? 'first' : 'logit');
  const [focal, setFocal] = useState(0);
  const [objective, setObjective] = useState('share');
  const [opt, setOpt] = useState(null);
  const valid = products.every((p) => p.lv.length === L.length && p.lv.every((v, q) => v < L[q]));
  const prods = valid ? products : defaults();
  const shares = useMemo(() => M.simulateShares(coder, model.units, prods, { method }), [coder, model, prods, method]);
  const curve = useMemo(() => (pb ? M.priceCurve(coder, model.units, prods, Math.min(focal, prods.length - 1), { method: method === 'first' ? 'first' : method, steps: 12, draws: 80 }) : null), [coder, model, prods, focal, method, pb]);
  const names = prods.map((p) => p.name);
  const noneShare = coder.none ? shares[prods.length] : NaN;
  const summary = useMemo(() => R.simSummary({
    products: names, shares: shares.slice(0, prods.length), noneShare, method, source, modelConfidence: model.confidence, nUnits: model.units.length, unit,
    curve: curve ? { name: names[Math.min(focal, prods.length - 1)], lo: curve[0].price, hi: curve[curve.length - 1].price, sLo: curve[0].shares[Math.min(focal, prods.length - 1)], sHi: curve[curve.length - 1].shares[Math.min(focal, prods.length - 1)] } : null,
    optim: opt ? { method: opt.method, evals: opt.evals, text: opt.text } : null,
  }), [names, shares, prods.length, noneShare, method, source, model, curve, focal, opt, unit]);
  useEffect(() => { onReport?.({ method, source: model.label, rows: [...names.map((nm, j) => [nm, pct(shares[j], 1)]), ...(coder.none ? [['None', pct(noneShare, 1)]] : [])], summary }); }, [summary]); // eslint-disable-line react-hooks/exhaustive-deps
  const setP = (j, patch) => setProducts(prods.map((p, i) => (i === j ? { ...p, ...patch } : p)));
  const setLevel = (j, q, v) => { const lv = [...prods[j].lv]; lv[q] = v; setP(j, q === priceIdx && pb ? { lv, price: pb.values[v] } : { lv }); };
  const runOpt = () => {
    const own = prods.map((p, j) => (p.own ? j : -1)).filter((j) => j >= 0);
    if (!own.length) { setOpt({ error: 'Tick "optimise" on at least one product.' }); return; }
    const r = M.optimise(coder, model.units, prods, own, { objective: pb ? objective : 'share', method: method === 'rfc' ? 'logit' : method, prohib });
    const text = own.map((j, g) => `${prods[j].name}: ${r.genome[g].map((l, q) => attrs[q].levels[l]).join(', ')}`).join('; ') + ` (${objective === 'revenue' && pb ? `revenue index ${unit}${r.value.toFixed(2)} per person` : `total share ${pct(r.value, 1)}`})`;
    setOpt({ ...r, own, text });
  };
  const applyOpt = () => { if (!opt?.genome) return; setProducts(prods.map((p, j) => { const g = opt.own.indexOf(j); return g < 0 ? p : { ...p, lv: [...opt.genome[g]], price: pb ? pb.values[opt.genome[g][priceIdx]] : undefined }; })); };
  const prohibitedProducts = prods.filter((p) => C.prohibited(p.lv, prohib)).map((p) => p.name);
  return (
    <div className="clu-root">
      <div className="cj-row">
        <Pick label="Part-worths from" value={source} onChange={setSrcKey} options={sources.map((k) => [k, models[k].label])} />
        <Choice label="Method" value={method} onChange={setMethod} options={[['logit', 'Share of preference'], ['first', 'First choice'], ['rfc', 'Randomised first choice']]} />
      </div>
      {method === 'first' && model.units.length === 1 && <Problem>First choice with one set of part-worths gives all of the market to one product. Use individual (HB) part-worths, or share of preference.</Problem>}
      {source === 'trad' && method === 'logit' && <Problem>Ratings part-worths have an arbitrary scale, so logit shares depend on it. First choice is the safer method for ratings.</Problem>}
      <div className="clu-scroll"><table className="clu-table" aria-label="Products">
        <thead><tr><th>Attribute</th>{prods.map((p, j) => <th key={j}><input type="text" aria-label={`Name of product ${j + 1}`} value={p.name} onChange={(e) => setP(j, { name: e.target.value })} style={{ width: 120, font: 'inherit', fontWeight: 700, padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--ink)' }} /></th>)}</tr></thead>
        <tbody>
          {attrs.map((a, q) => (
            <tr key={a.name}>
              <td>{a.name}</td>
              {prods.map((p, j) => (
                <td key={j}>
                  <select className="select" aria-label={`${a.name} of ${p.name}`} value={p.lv[q]} onChange={(e) => setLevel(j, q, Number(e.target.value))}>{a.levels.map((l, li) => <option key={l} value={li}>{l}</option>)}</select>
                  {q === priceIdx && pb && <input type="number" aria-label={`Exact price of ${p.name}`} step="0.5" min={Math.min(...pb.values)} max={Math.max(...pb.values)} value={p.price} onChange={(e) => setP(j, { price: Number(e.target.value) })} style={{ width: 80, marginLeft: 6, font: 'inherit', padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--ink)' }} />}
                </td>
              ))}
            </tr>
          ))}
          <tr><td>Optimise</td>{prods.map((p, j) => <td key={j}><label className="tl-check"><input type="checkbox" checked={!!p.own} onChange={(e) => setP(j, { own: e.target.checked })} /> ours</label></td>)}</tr>
          <tr><td /><td colSpan={prods.length}><span className="tl-row">
            <button type="button" className="btn ghost small" disabled={prods.length >= 6} onClick={() => setProducts([...prods, { name: `Product ${LETTERS[prods.length]}`, lv: L.map(() => 0), price: pb ? pb.values[0] : undefined }])}>Add product</button>
            <button type="button" className="btn ghost small" disabled={prods.length <= 2} onClick={() => { setProducts(prods.slice(0, -1)); setFocal(0); }}>Remove last</button>
          </span></td></tr>
        </tbody>
      </table></div>
      {prohibitedProducts.length > 0 && <Problem>{prohibitedProducts.join(', ')} use a prohibited combination, which respondents never saw; its share is an extrapolation.</Problem>}
      {pb && <p className="tl-note">Prices between the tested levels are interpolated with the linear price coefficient; prices outside {money(Math.min(...pb.values), unit)}–{money(Math.max(...pb.values), unit)} are not allowed.</p>}
      <Result big={`${names[shares.slice(0, prods.length).indexOf(Math.max(...shares.slice(0, prods.length)))]} ${pct(Math.max(...shares.slice(0, prods.length)), 1)}`} label={`${{ logit: 'Share of preference', first: 'First choice', rfc: 'Randomised first choice' }[method]} · ${model.label}`} />
      <Bars label="Simulated shares" rows={[...names.map((nm, j) => [nm, shares[j], pct(shares[j], 1)]), ...(coder.none ? [['None of these', noneShare, pct(noneShare, 1), 'warn']] : [])]} />
      {curve && (
        <>
          <div className="cj-row">
            <h3 className="clu-h3" style={{ margin: 0 }}>Share against price</h3>
            <Pick label="Change the price of" value={String(Math.min(focal, prods.length - 1))} onChange={(v) => setFocal(Number(v))} options={prods.map((p, j) => [String(j), p.name])} />
          </div>
          <LineChart label="Share against price" xs={curve.map((c) => c.price)} xFmt={(v) => money(v, unit)} series={[...names.map((nm, j) => ({ name: nm, ys: curve.map((c) => c.shares[j]) })), ...(coder.none ? [{ name: 'None', ys: curve.map((c) => c.shares[prods.length]), dashed: true }] : [])]} />
        </>
      )}
      <h3 className="clu-h3">Optimiser</h3>
      <div className="cj-row">
        {pb && <Choice label="Maximise" value={objective} onChange={setObjective} options={[['share', 'Share'], ['revenue', 'Revenue (share × price)']]} />}
        <button type="button" className="btn small" onClick={runOpt}>Find the best {prods.filter((p) => p.own).length > 1 ? 'product line' : 'product'}</button>
        {opt?.genome && <button type="button" className="btn ghost small" onClick={applyOpt}>Apply to the products</button>}
      </div>
      {opt?.error && <Problem>{opt.error}</Problem>}
      {opt?.genome && <p className="tl-note"><b>{opt.method === 'exhaustive' ? 'Exhaustive search' : 'Genetic algorithm'}</b> over {opt.space.toLocaleString('en-GB')} possible configurations ({opt.evals.toLocaleString('en-GB')} evaluated): {opt.text}. Competitors are held fixed{method === 'rfc' ? '; the search uses logit shares for speed' : ''}.</p>}
      <StudySummary {...summary} />
    </div>
  );
}

// ── The studio ──
function Studio() {
  const go = useNavigate();
  const [draft, setDraftRaw] = useState(() => { const d = readDraft(); return d && d.attrsText ? d : { ...M.EXAMPLE_CBC_DRAFT }; });
  const setDraft = (d) => { setDraftRaw(d); writeDraft(d); };
  const [step, setStep] = useState('design');
  const built = useMemo(() => M.studyFromDraft(draft), [draft]);
  const study = built.study || null;
  const code = useMemo(() => (study ? C.encodeStudy(study) : ''), [study]);
  const href = useHref(`/calculators/conjoint?study=${code}`);
  const link = typeof window !== 'undefined' ? new URL(href, window.location.href).href : href;
  const [src, setSrc] = useState('codes');
  const [codes, setCodes] = useState(() => (draft.id === 'example-cbc' ? exampleCodes(M.exampleCbc()) : draft.id === 'example-rate' || draft.id === 'example-rank' ? exampleCodes(M.exampleTrad(draft.resp)) : ''));
  const [table, setTable] = useState('');
  const [tradMode, setTradMode] = useState('');
  const [model, setModel] = useState('mnl');
  const [lcRes, setLcRes] = useState(null);
  const [hbRes, setHbRes] = useState(null);
  const [kMax, setKMax] = useState(5);
  const [hbOpts, setHbOpts] = useState({ R: 10000, burn: 5000, thin: 5, seed: 1 });
  const [simRep, setSimRep] = useState(null);
  const [pasted, setPasted] = useState(''); const [loadErr, setLoadErr] = useState('');
  const job = useJob();

  const attrs = built.attrs || [];
  const priceIdx = study ? study.p : -1;
  const unit = R.currencyOf(attrs[priceIdx]);
  const parsedCodes = useMemo(() => C.parseResultCodes(codes), [codes]);
  const data = useMemo(() => {
    if (!study) return { ds: null, problems: [] };
    if (src === 'codes') {
      const other = parsedCodes.results.filter((r) => (r.s && r.s !== study.id) || (r.dh && r.dh !== study.dh)).length;
      const ds = M.datasetFromResults(study, parsedCodes.results);
      const problems = [];
      if (parsedCodes.bad.length) problems.push(`${parsedCodes.bad.length} code${parsedCodes.bad.length > 1 ? 's' : ''} could not be read; check they were copied in full.`);
      if (other) problems.push(`${other} code${other > 1 ? 's are' : ' is'} from a different study or an earlier version of this design and ${other > 1 ? 'were' : 'was'} left out.`);
      return { ds: ds.resp.length ? ds : null, problems };
    }
    return study.k === 'cbc' ? M.parseCbcLong(table, attrs) : M.parseTrad(table, study, tradMode || study.r);
  }, [study, src, parsedCodes, table, tradMode, attrs]);
  const ds = data.ds;
  const dataKey = `${study?.dh}|${src}|${src === 'codes' ? codes.length : table.length}|${tradMode}|${ds?.resp.length}`;
  const coder = useMemo(() => (study ? C.makeCoder(attrs, { price: priceIdx, none: study.k === 'cbc' && !!ds?.none }) : null), [study, attrs, priceIdx, ds?.none]);
  const isCbc = study?.k === 'cbc';

  // CBC: aggregate MNL straight away; latent class and HB on request in the worker.
  const S = useMemo(() => (isCbc && ds && coder ? M.buildSets(ds, coder) : null), [isCbc, ds, coder]);
  const mnl = useMemo(() => (S && S.nSets ? M.fitMNL(S) : null), [S]);
  const mnlStats = useMemo(() => (mnl ? M.mnlStats(S, mnl.beta, coder.none ? coder.noneCol : -1) : null), [mnl, S, coder]);
  const lc = lcRes?.key === dataKey ? lcRes.res : null;
  const hb = hbRes?.key === dataKey ? hbRes.res : null;
  // Ratings / rankings.
  const trad = useMemo(() => (!isCbc && ds && coder ? M.fitTraditional(ds, coder) : null), [isCbc, ds, coder]);
  const rol = useMemo(() => { if (!trad || ds.mode !== 'rank') return null; const Sr = M.rolSets(ds, coder); const f = M.fitMNL(Sr); return { ...f, nSets: Sr.nSets }; }, [trad, ds, coder]);

  const results = useMemo(() => {
    if (!coder || !ds) return null;
    const out = {};
    if (trad && trad.ok.length) {
      const imp = M.meanImportance(trad.ok.map((p) => coder.partWorths(p.beta)));
      const wtp = priceIdx >= 0 ? M.wtpDelta(coder, trad.mean, trad.cov) : null;
      out.trad = { imp, wtp, sum: R.tradSummary({ attrs, n: trad.ok.length, meanR2: trad.meanR2, hitRate: trad.hitRate, chance: trad.chance, imp, wtp, unit, mode: ds.mode, rol }) };
    }
    if (mnl) {
      const imp = M.importance(coder.partWorths(mnl.beta)); const wtp = priceIdx >= 0 ? M.wtpDelta(coder, mnl.beta, mnl.cov) : null;
      out.mnl = { imp, wtp, sum: R.mnlSummary({ attrs, n: ds.resp.length, stats: mnlStats, imp, se: mnl.se.filter((_, k) => k !== coder.noneCol), wtp, unit, noneShare: mnlStats.noneObs }) };
    }
    if (lc) {
      const f = lc.fits.find((x) => x.k === lc.best);
      out.lc = { sum: R.lcSummary({ attrs, n: ds.resp.length, fits: lc.fits, best: lc.best, imps: f.betas.map((b) => M.importance(coder.partWorths(b))) }) };
    }
    if (hb) {
      const imp = M.meanImportance(hb.betaMean.map((b) => coder.partWorths(b)));
      const rl = M.respondentRLH(S, hb.betaMean); const chance = mnlStats.chance;
      const rlh = { mean: rl.reduce((s, x) => s + x, 0) / rl.length, chance, low: rl.filter((x) => x < 1.5 * chance).length, all: rl };
      const wtp = priceIdx >= 0 ? M.wtpDraws(coder, hb.draws) : null;
      out.hb = { imp, rlh, wtp, sum: R.hbSummary({ attrs, n: hb.n, hb, imp, wtp, unit, rlhMean: rlh.mean, chance }) };
    }
    return out;
  }, [coder, ds, trad, rol, mnl, mnlStats, lc, hb, S, attrs, priceIdx, unit]);

  const simModels = useMemo(() => {
    const m = {};
    if (hb) m.hb = { label: `Hierarchical Bayes (${hb.n} respondents)`, units: hb.betaMean.map((b) => ({ beta: b, w: 1 })), confidence: results?.hb?.sum.confidence };
    if (lc) { const f = lc.fits.find((x) => x.k === lc.best); m.lc = { label: `Latent class (${f.k} segments)`, units: f.betas.map((b, c) => ({ beta: b, w: f.pi[c] })), confidence: results?.lc?.sum.confidence }; }
    if (mnl) m.mnl = { label: 'Aggregate logit', units: [{ beta: mnl.beta, w: 1 }], confidence: results?.mnl?.sum.confidence };
    if (trad && trad.ok.length) m.trad = { label: `Individual ${ds.mode === 'rank' ? 'rank' : 'ratings'} part-worths (${trad.ok.length})`, units: trad.ok.map((p) => ({ beta: p.beta, w: 1 })), confidence: results?.trad?.sum.confidence };
    if (rol) m.rol = { label: 'Rank-ordered logit (aggregate)', units: [{ beta: rol.beta, w: 1 }], confidence: results?.trad?.sum.confidence };
    return m;
  }, [hb, lc, mnl, trad, rol, results, ds]);

  const runLc = () => job.run('lc', S, { kMax: Math.max(2, Math.min(8, Math.round(Number(kMax)) || 5)), seed: 1, aggregate: { beta: mnl.beta, ll: mnl.ll, iter: mnl.iter } }, (res) => setLcRes({ key: dataKey, res }));
  const runHb = () => { const Rn = Math.max(1000, Math.round(Number(hbOpts.R)) || 10000); job.run('hb', S, { R: Rn, burn: Math.min(Rn - 100, Math.max(0, Math.round(Number(hbOpts.burn)) || 0)), thin: Math.max(1, Math.round(Number(hbOpts.thin)) || 5), seed: Math.max(1, Math.round(Number(hbOpts.seed)) || 1) }, (res) => setHbRes({ key: dataKey, res })); };

  const loadExample = (kind) => {
    if (kind === 'cbc') { setDraft({ ...M.EXAMPLE_CBC_DRAFT }); setCodes(exampleCodes(M.exampleCbc())); }
    else { const ex = M.exampleTrad(kind); setDraft({ ...M.EXAMPLE_TRAD_DRAFT, id: ex.study.id, name: ex.study.n, resp: kind }); setCodes(exampleCodes(ex)); }
    setSrc('codes'); setTradMode(''); setModel('mnl'); setStep('analyse');
  };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ ...M.EXAMPLE_CBC_DRAFT, id: C.newId(), name: 'Conjoint study', attrsText: 'Price: £5, £8, £12\nFeature A: Yes, No\nBrand: A, B, C', seed: 1 }); setCodes(''); setTable(''); setStep('design'); };
  const loadStudy = () => {
    try {
      const s = C.decodeStudy(pasted);
      const d = C.studyDesign(s);
      // Rebuild a draft that regenerates exactly this design is not possible in general, so keep the decoded design.
      setDraft({ ...M.EXAMPLE_CBC_DRAFT, id: s.id, name: s.n, kind: s.k, attrsText: C.attributesToText(C.studyAttrs(s)), price: s.p, prohibText: (s.x || []).map(([a, l, b, m]) => `${s.a[a][0]} = ${s.a[a][1][l]} & ${s.a[b][0]} = ${s.a[b][1][m]}`).join('\n'), fixed: s, ...(s.k === 'cbc' ? { T: s.T, J: s.J, V: d.versions.length, none: !!s.no } : { resp: s.r, holdouts: d.holdouts.length }) });
      setLoadErr(''); setPasted(''); setCodes('');
    } catch { setLoadErr('That is not a Conjoint studio study link.'); }
  };
  const stored = study ? C.loadSessions(study.id) : [];

  const report = () => {
    const sections = [];
    if (results?.trad) sections.push({ title: 'Ratings / ranking analysis (per-respondent OLS)', stats: [['Respondents', trad.ok.length], ['Mean R²', num(trad.meanR2, 3)], ['Holdout hit rate', pct(trad.hitRate)]], table: { head: ['Attribute', 'Importance'], rows: attrs.map((a, q) => [a.name, pct(results.trad.imp[q], 1)]) }, summary: results.trad.sum });
    if (results?.mnl) sections.push({ title: 'Aggregate multinomial logit', stats: [['McFadden ρ²', num(mnlStats.rho2, 3)], ['Hit rate', pct(mnlStats.hit, 1)], ['RLH', num(mnlStats.rlh, 3)]], table: { head: ['Parameter', 'β', 'SE'], rows: coder.cols.map((c, k) => [c, num(mnl.beta[k], 4), num(mnl.se[k], 4)]) }, summary: results.mnl.sum });
    if (results?.lc) { const f = lc.fits.find((x) => x.k === lc.best); sections.push({ title: `Latent-class MNL (${f.k} segments)`, table: { head: ['k', 'LL', 'BIC'], rows: lc.fits.map((x) => [x.k, num(x.ll, 1), num(x.bic, 1)]) }, summary: results.lc.sum }); }
    if (results?.hb) sections.push({ title: 'Hierarchical Bayes MNL', table: { head: ['Parameter', 'Mean', '95% CrI', 'R̂', 'ESS'], rows: coder.cols.map((c, k) => [c, num(hb.bbarMean[k], 3), `${num(hb.bbarCI[k][0], 3)} to ${num(hb.bbarCI[k][1], 3)}`, num(hb.diag[k].rhat, 3), Math.round(hb.diag[k].ess)]) }, summary: results.hb.sum });
    const designInfo = study.k === 'cbc' ? `${study.d.length} versions × ${study.T} tasks × ${study.J} alternatives${study.no ? ' plus none' : ''}.` : `${C.studyDesign(study).cards.length} cards and ${C.studyDesign(study).holdouts.length} holdouts.`;
    download(`conjoint-report-${study.id}.md`, R.markdownReport({ study, attrs, designInfo, sections, sim: simRep }), 'text/markdown');
  };
  const pwCsv = () => {
    let rows;
    if (hb) rows = hb.betaMean.map((b, i) => ({ id: ds.resp[i].id, beta: b, extra: { model: 'HB posterior mean', rlh: results.hb.rlh.all[i].toFixed(4) } }));
    else if (trad) rows = trad.ok.map((p) => ({ id: p.id, beta: p.beta, extra: { model: 'OLS', r2: p.r2.toFixed(4) } }));
    else if (lc) { const f = lc.fits.find((x) => x.k === lc.best); rows = f.betas.map((b, c) => ({ id: `Segment ${c + 1}`, beta: b, extra: { model: 'Latent class', size: f.pi[c].toFixed(4) } })); }
    else rows = [{ id: 'Aggregate', beta: mnl.beta, extra: { model: 'MNL' } }];
    download(`conjoint-partworths-${study.id}.csv`, R.partWorthsCsv(attrs, coder, rows), 'text/csv');
  };

  return (
    <div className="cj-app">
      <div className="calc-inputs cj-steps">
        <Choice label="Step" value={step} onChange={setStep} options={[['design', '1. Design'], ['field', '2. Field'], ['analyse', '3. Analyse'], ['simulate', '4. Simulate']]} />
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={() => loadExample('cbc')}>Load the CBC example (200 respondents)</button>
        <button type="button" className="btn ghost small" onClick={() => loadExample('rate')}>Ratings example</button>
        <button type="button" className="btn ghost small" onClick={() => loadExample('rank')}>Ranking example</button>
        <button type="button" className="btn ghost small" onClick={fresh}>New empty study</button>
        <span className="tl-row" style={{ flex: '1 1 260px' }}>
          <input type="text" className="tl-code" style={{ flex: 1, minWidth: 0, padding: '7px 10px' }} placeholder="Or paste a study link to open it" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Study link" />
          <button type="button" className="btn ghost small" disabled={!pasted.trim()} onClick={loadStudy}>Open</button>
        </span>
      </div>
      {loadErr && <Problem>{loadErr}</Problem>}
      {step === 'design' && <DesignStep draft={draft} setDraft={setDraft} built={built} study={study} />}
      {step === 'field' && <FieldStep study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/conjoint?study=${code}&preview=1`); }} />}
      {step === 'analyse' && study && (
        <div className="clu-root">
          <div className="cj-row">
            <Choice label="Data" value={src} onChange={setSrc} options={[['codes', 'Result codes'], ['table', 'Pasted table']]} />
            {!isCbc && src === 'table' && <Choice label="Values are" value={tradMode || study.r} onChange={setTradMode} options={[['rate', 'Ratings'], ['rank', 'Ranks (1 = best)']]} />}
          </div>
          {src === 'codes' ? (
            <>
              <Area label="Result codes, one per line" value={codes} onChange={setCodes} rows={5} placeholder="Paste the codes respondents sent you" hint="Codes from other studies, or from an earlier version of this design, are left out. Nothing is uploaded." />
              <div className="clu-actions">
                <button type="button" className="btn ghost small" disabled={!stored.length} onClick={() => setCodes([...new Set([...codes.split(/\s+/).filter(Boolean), ...stored])].join('\n'))}>Load {stored.length} session{stored.length === 1 ? '' : 's'} saved in this browser</button>
                {stored.length > 0 && <button type="button" className="clu-link" onClick={() => { if (window.confirm('Remove the sessions saved in this browser for this study?')) { C.clearSessions(study.id); setCodes(`${codes} `); } }}>Clear saved sessions</button>}
                {ds && <button type="button" className="btn ghost small" onClick={() => download(`conjoint-responses-${study.id}.csv`, M.longCsv(ds, attrs), 'text/csv')}>Download responses (long CSV)</button>}
              </div>
            </>
          ) : <Area label={isCbc ? 'Long-format choices: respondent, task, alternative, attributes…, choice' : 'Ratings or ranks: wide (respondent, card 1…) or long (respondent, card, value)'} value={table} onChange={setTable} rows={7} wrap="off" hint="Comma, semicolon or tab separated, with a header row. Attribute columns use the attribute names from step 1." />}
          {data.problems.map((p) => <Problem key={p}>{p}</Problem>)}
          {!ds ? <Problem>No usable responses yet: paste result codes or a table, load sessions saved in this browser, or load an example.</Problem> : (
            <>
              <p className="tl-note">{ds.resp.length} respondents{isCbc ? `, ${S?.nSets} choices` : ''}. {priceIdx >= 0 ? `${attrs[priceIdx].name} is coded as a linear price term.` : 'No numeric price attribute, so willingness to pay is not computed.'}</p>
              {isCbc && <Choice label="Model" value={model} onChange={setModel} options={[['mnl', 'Aggregate logit'], ['lc', 'Latent class'], ['hb', 'Hierarchical Bayes']]} />}
              {isCbc && model === 'mnl' && mnl && <MnlResults attrs={attrs} coder={coder} mnl={mnl} stats={mnlStats} wtp={results.mnl.wtp} unit={unit} sum={results.mnl.sum} priceIdx={priceIdx} />}
              {isCbc && model === 'lc' && <LcResults attrs={attrs} coder={coder} lc={lc} n={ds.resp.length} job={job} onRun={runLc} kMax={kMax} setKMax={setKMax} sum={results?.lc?.sum} unit={unit} priceIdx={priceIdx} />}
              {isCbc && model === 'hb' && <HbResults attrs={attrs} coder={coder} hb={hb} rlh={results?.hb?.rlh} job={job} onRun={runHb} opts={hbOpts} setOpts={setHbOpts} sum={results?.hb?.sum} wtp={results?.hb?.wtp} unit={unit} priceIdx={priceIdx} imp={results?.hb?.imp} />}
              {!isCbc && trad && (trad.ok.length ? <TradResults attrs={attrs} coder={coder} fit={trad} rol={rol} ds={ds} wtp={results.trad.wtp} unit={unit} sum={results.trad.sum} priceIdx={priceIdx} /> : <Problem>No respondent has more estimation cards than parameters ({coder.K + 1}), so no part-worths can be fitted.</Problem>)}
              <div className="clu-actions">
                <button type="button" className="btn ghost small" onClick={pwCsv}>Download part-worths (CSV)</button>
                <button type="button" className="btn ghost small" onClick={report}>Download report (Markdown)</button>
              </div>
            </>
          )}
        </div>
      )}
      {step === 'simulate' && (Object.keys(simModels).length && coder && ds
        ? <Simulator key={study.dh} attrs={attrs} coder={coder} models={simModels} prohib={study.x || []} priceIdx={priceIdx} unit={unit} onReport={setSimRep} />
        : <Problem>Fit a model in step 3 first (load an example to try it).</Problem>)}
    </div>
  );
}

function ConjointStudio() {
  const [params, setParams] = useSearchParams();
  const studyParam = params.get('study');
  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = C.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <Participant key={studyParam} study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;
  return (
    <>
      {runErr && <Problem>The study link could not be read ({runErr}). Ask the researcher for a fresh link.</Problem>}
      <Studio />
      <About method="conjoint-analysis" links={[['discrete-choice-modeling', 'Discrete choice modelling'], ['adaptive-choice-based-conjoint-acbc', 'Adaptive choice-based conjoint (ACBC)'], ['conjoint-choice-simulator', 'Conjoint choice simulator'], ['willingness-to-pay-and-welfare-measures-from-choice-models', 'Willingness to pay from choice models'], ['rank-ordered-exploded-logit', 'Rank-ordered (exploded) logit'], ['optimal-design-criteria-and-design-efficiency-a-d-e-optimality', 'Optimal design criteria and efficiency'], ['fractional-factorial-experiments', 'Fractional factorial experiments'], ['incomplete-block-designs-bibd-pbib-alpha-and-test-versus-control-designs', 'Incomplete block designs'], ['product-line-optimisation-with-genetic-algorithms-over-conjoint-simulations', 'Product-line optimisation with genetic algorithms'], ['mcmc-convergence-diagnostics', 'MCMC convergence diagnostics'], ['self-explicated-preference-measurement', 'Self-explicated preference measurement'], ['maxdiff-best-worst-scaling', 'MaxDiff (best-worst scaling)']]}>
        <p>Conjoint analysis infers how much each feature of a product is worth to people from the whole products they choose, rate or rank. The studio covers <b>ratings or ranking conjoint</b> (cards, analysed one respondent at a time) and <b>choice-based conjoint</b> (CBC: choose one of 2–5 options, optionally "none"), in four steps: design, field, analyse, simulate. Everything runs in your browser.</p>
        <p><b>Coding.</b> Effects coding: an attribute with L levels has L − 1 parameters, and the part-worth of the last level is minus the sum of the others, so part-worths average zero within each attribute. A price attribute marked numeric is one linear term, β<sub>price</sub>(price − mean price), so β<sub>price</sub> is utility per unit of money. "None" has its own constant.</p>
        <p><b>Ratings designs.</b> The smallest orthogonal array that fits (Rao-Hamming arrays over GF(2), GF(3), GF(4), GF(5), GF(7), the L18 and the 12-run Plackett-Burman array; columns with more levels are collapsed, which keeps proportional frequencies) with at least 1.5 × the number of parameters; with prohibitions, or when no array fits, a D-optimal design by coordinate exchange (Meyer and Nachtsheim 1995). D-efficiency = 100 ÷ (N |(XᵀX)⁻¹|<sup>1/p</sup>) with orthonormal coding (Kuhfeld 2010). Holdout cards are extra profiles not used for estimation.</p>
        <p><b>CBC designs.</b> Random, complete enumeration (each alternative is the allowed profile with the least overlap within the task, then the best level balance and fewest repeated level pairs) and balanced overlap (half the attributes in each task may repeat levels), after Sawtooth Software's methods. D-efficiency follows Street and Burgess (2007): C = (1/N) Σ<sub>tasks</sub> (1/m) Σ (b<sub>j</sub> − b̄)(b<sub>j</sub> − b̄)ᵀ with orthonormal main-effects contrasts, divided by its largest possible value for tasks of m options, (|C| ÷ |C<sub>opt</sub>|)<sup>1/p</sup>. Expected standard errors at n respondents are √diag((n I)⁻¹), I being the information per respondent at β = 0. D-error = |I⁻¹|<sup>1/K</sup>.</p>
        <p><b>Ratings analysis.</b> Each respondent's ratings are regressed on the coded attributes by ordinary least squares, y = b₀ + Xβ; R² = 1 − SSE/SST. For rankings the dependent variable is the reversed rank, and the <b>rank-ordered (exploded) logit</b> (Beggs, Cardell and Hausman 1981) treats a ranking of C cards as C − 1 successive choices. Importance = range of an attribute's part-worths ÷ sum of ranges, per respondent, then averaged. The holdout hit rate is the share of people whose best holdout is predicted best.</p>
        <p><b>Multinomial logit.</b> P(j) = exp(x<sub>j</sub>ᵀβ) ÷ Σ<sub>k</sub> exp(x<sub>k</sub>ᵀβ), fitted by Newton-Raphson with step halving; standard errors from the inverse information matrix. McFadden ρ² = 1 − ℓ/ℓ₀ (ℓ₀: every option equally likely); hit rate = share of tasks where the highest-utility option was chosen; RLH = exp(ℓ ÷ choices), the geometric mean probability of the chosen options.</p>
        <p><b>Latent-class MNL</b> (Kamakura and Russell 1989) gives each of k segments its own β and size π, fitted by EM (posterior segment probabilities, then a weighted Newton step per segment), six random starts per k, BIC = −2ℓ + P ln n with P = kK + k − 1. <b>Hierarchical Bayes</b> (Allenby and Rossi; bayesm's rhierMnlRwMixture with one component): β<sub>i</sub> ~ N(b̄, V), b̄ ~ N(0, V/0.01), V ~ inverse Wishart(K + 3, (K + 3)I); each iteration draws b̄ and V from their conjugate posterior and each β<sub>i</sub> by one random-walk Metropolis-Hastings step with proposal covariance s²(H<sub>i</sub> + V⁻¹)⁻¹, s = 2.93/√K, H<sub>i</sub> from i's fractional likelihood. Diagnostics: split R̂ (two halves of the kept chain), effective sample size by Geyer's initial monotone sequence, and Geweke's z (first 10% vs last 50%).</p>
        <p><b>Willingness to pay</b> for level l over the attribute's first level = −(pw<sub>l</sub> − pw<sub>1</sub>) ÷ β<sub>price</sub>: delta-method 95% confidence intervals for the logit and ratings models, posterior 2.5–97.5% quantiles of the ratio for HB. <b>Simulator</b>: share of preference (logit), first choice, and randomised first choice (Huber, Orme and Miller 1999: an attribute-level error N(0, 0.3²) shared by products with that level plus a Gumbel product error, 200 draws per respondent). The <b>optimiser</b> searches exhaustively up to 20,000 configurations, otherwise a genetic algorithm (population 60, 80 generations; Balakrishnan and Jacob 1996).</p>
        <p><b>Validation</b> (<code>npm run check:conjoint</code>): MNL and the exploded logit match statsmodels ConditionalLogit, OLS part-worths match statsmodels OLS, latent class matches an independent numpy EM, HB matches an independent numpy implementation of the same sampler and recovers known simulated part-worths, and D-efficiencies match numpy computations. R and bayesm were not available, so HB is not compared with bayesm itself.</p>
        <p><b>When not to use it.</b> Conjoint needs attributes that people can trade off and that can vary independently; if two attributes always go together, combine them. Keep to about 6 attributes for full profiles (use ACBC or partial profiles beyond that, not built here). Stated choices are hypothetical: shares and willingness to pay are typically higher than in real purchasing, so use them to compare options rather than to forecast sales. Importance depends on the levels you chose. Do not use ratings conjoint for pricing decisions with fewer than about 30 respondents, or CBC with fewer than Orme's minimum. For ranking a list of features without trade-offs, MaxDiff is simpler; for a quick pre-study, self-explicated ratings.</p>
      </About>
    </>
  );
}

export default ConjointStudio;
