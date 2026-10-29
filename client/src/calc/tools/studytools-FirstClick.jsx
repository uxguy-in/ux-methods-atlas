import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHref, useNavigate, useSearchParams } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as F from './studytools-firstclick.js';
import * as U from './studytools-common.js';
import { Choice, Result, Stats, Problem, About, Bars, download, copyText, num, pct } from './ui.jsx';
import './studytools.css';

const TOOL = 'first-click';
const DRAFT_KEY = 'uxatlas:first-click:draft';
const vLetter = (i) => String.fromCharCode(65 + i);

// Resolve an image reference ('ex:', 'idb:' or a URL) to a src; status 'loading' | 'ok' | 'missing'.
function useImage(ref) {
  const [state, setState] = useState({ src: null, status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ src: null, status: 'loading' });
    F.resolveImage(ref).then((src) => { if (live) setState(src ? { src, status: 'ok' } : { src: null, status: 'missing' }); }).catch(() => { if (live) setState({ src: null, status: 'missing' }); });
    return () => { live = false; };
  }, [ref]);
  return state;
}
const loadSize = (src) => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => reject(new Error('Image did not load')); im.src = src; });
const readFile = (file) => new Promise((resolve, reject) => { try { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); } catch (e) { reject(e); } });
const cssVar = (name, fallback) => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; } };
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [227, 73, 72]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

// ── Participant ──
function FcStage({ study, task, variant, onDone }) {
  const img = useImage(variant.u);
  const [box, setBox] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const t0 = useRef(0), done = useRef(false), bar = useRef(null);
  const [barH, setBarH] = useState(56);
  const [left, setLeft] = useState(task.y === '5s' ? task.s : null);
  useEffect(() => { const on = () => setBox({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  useEffect(() => { if (bar.current) setBarH(bar.current.offsetHeight + 16); }, [box, img.status]);
  // 5-second exposure: start when the image has loaded, hide after s seconds.
  useEffect(() => {
    if (task.y !== '5s' || img.status !== 'ok') return undefined;
    const start = performance.now();
    const id = setInterval(() => { const l = task.s - (performance.now() - start) / 1000; if (l <= 0) { clearInterval(id); if (!done.current) { done.current = true; onDone({ x: null, y: null, ms: Math.round(task.s * 1000) }); } } else setLeft(Math.ceil(l)); }, 100);
    return () => clearInterval(id);
  }, [img.status]);
  const w = variant.w || 1, h = variant.h || 1;
  const fit = F.fitRect(w, h, box.w, Math.max(120, box.h - (task.y === 'click' ? barH : 0)));
  const click = (e) => {
    if (task.y !== 'click' || done.current) return;
    const p = F.normaliseClick(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    if (!p) return;
    done.current = true;
    onDone({ x: p.x, y: p.y, ms: Math.round(performance.now() - t0.current) });
  };
  return (
    <div className="st-fc-stage" role="dialog" aria-modal="true" aria-label={task.y === 'click' ? 'Click where you would click first' : 'Look at the page'}>
      {img.status === 'ok' && <img src={img.src} alt={task.y === 'click' ? 'The page to click on' : 'The page to look at'} draggable={false} style={{ left: fit.left, top: fit.top, width: fit.width, height: fit.height }} onLoad={() => { t0.current = performance.now(); }} onClick={click} />}
      {img.status === 'missing' && <div className="tt-run-in"><p className="calc-warn">This image is not available on this device. It was uploaded in another browser for moderated sessions. Ask the researcher, or skip this task.</p></div>}
      {(task.y === 'click' || img.status !== 'ok') && (
        <div className="st-fc-bar" ref={bar}>
          <span className="q">{task.y === 'click' ? task.q : 'Loading…'}</span>
          <button type="button" className="btn ghost small" onClick={() => { if (!done.current) { done.current = true; onDone({ x: null, y: null, ms: Math.round(performance.now() - t0.current) }); } }}>Skip</button>
        </div>
      )}
      {task.y === '5s' && img.status === 'ok' && <div className="st-fc-bar" style={{ left: 'auto' }} aria-live="off"><span>{left}</span></div>}
    </div>
  );
}

function FcParticipant({ study, preview, onExit }) {
  const session = useRef(U.loadSessions(TOOL, study.id).length);
  const mkPlan = () => F.taskOrder(study.k.length, !!study.o?.r).map((ti) => ({ ti, vi: F.pickVariant(study.k[ti].im.length, preview ? null : session.current) }));
  const [plan, setPlan] = useState(mkPlan);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState('intro');
  const [atts, setAtts] = useState([]);
  const [pending, setPending] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [rating, setRating] = useState(null);
  const [pid, setPid] = useState(() => `P-${U.newId().slice(0, 5)}`);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(null);
  const top = useRef(null);
  useEffect(() => { top.current?.scrollTo?.(0, 0); }, [phase, pos]);
  const cur = plan[pos], task = cur ? study.k[cur.ti] : null, variant = task ? task.im[cur.vi] : null;
  const commit = (a) => {
    const all = [...atts, a]; setAtts(all);
    if (pos + 1 < plan.length) { setPos(pos + 1); setPhase('brief'); return; }
    const c = F.encodeResult({ v: 1, t: 'fcr', s: study.id, p: pid, d: Date.now(), k: all });
    setCode(c); setSaved(preview ? null : U.saveSession(TOOL, study.id, c)); setPhase('done');
  };
  const shown = (r) => {
    const a = { t: cur.ti, i: cur.vi, x: r.x, y: r.y, ms: r.ms };
    if (task.y === '5s') { setPending(a); setAnswers(task.qs.map(() => '')); setRating(null); setPhase('questions'); } else commit(a);
  };
  const again = () => { session.current += 1; setPid(`P-${U.newId().slice(0, 5)}`); setPlan(mkPlan()); setAtts([]); setPos(0); setCode(''); setCopied(false); setPhase('intro'); };
  const mail = `mailto:?subject=${encodeURIComponent(`First-click test results: ${study.n}`)}&body=${encodeURIComponent(`My result code for "${study.n}":\n\n${code}\n`)}`;
  if (phase === 'show') return createPortal(<FcStage key={pos} study={study} task={task} variant={variant} onDone={shown} />, document.body);
  return createPortal(
    <div className="tt-run" ref={top} role="dialog" aria-modal="true" aria-label={`First-click test: ${study.n}`}>
      <div className="tt-run-in">
        {preview && <p className="calc-warn">Preview: this run is not saved in the browser. <button type="button" className="clu-link" onClick={onExit}>Close the preview</button></p>}
        {phase === 'intro' && (
          <>
            <p className="eyebrow">First-click test</p>
            <h1>{study.n}</h1>
            <p>You'll see {study.k.length === 1 ? 'a picture of a page' : `${study.k.length} pictures of pages`}. {study.k.some((t) => t.y === 'click') ? 'For some, we\'ll ask where you would click first to do something: click once, where you would really click. ' : ''}{study.k.some((t) => t.y === '5s') ? 'For others, the page shows for a few seconds and then we ask what you remember. ' : ''}</p>
            <p>There are no right or wrong answers: we are testing the design, not you. The page fills the screen; your first click is all we record.</p>
            <p className="tl-note">Nothing is uploaded. At the end you'll get a code to copy or email to the researcher.</p>
            <div className="tt-actions"><button type="button" className="btn" onClick={() => setPhase('brief')}>Start</button></div>
          </>
        )}
        {phase === 'brief' && task && (
          <>
            <div className="prog">Task {pos + 1} of {plan.length}</div>
            <div className="task">{task.y === 'click' ? task.q : task.q || `You'll see a page for ${task.s} seconds. Look at it as you normally would.`}</div>
            <p>{task.y === 'click' ? 'When you press Show the page, it fills the screen. Click once where you would click first. You can skip if you really can\'t decide.' : `The page shows for ${task.s} seconds and then disappears. Afterwards we'll ask what you remember.`}</p>
            <div className="tt-actions"><button type="button" className="btn" onClick={() => setPhase('show')}>Show the page</button></div>
          </>
        )}
        {phase === 'questions' && task && (
          <>
            <div className="prog">Task {pos + 1} of {plan.length}</div>
            <h1>What do you remember?</h1>
            {task.qs.map((q, i) => (
              <label key={i} className="calc-field wide"><span>{q}</span><textarea className="st-textarea" rows={3} value={answers[i] || ''} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} /></label>
            ))}
            {task.rt && (
              <div className="calc-field">
                <span>{task.rt}</span>
                <div className="tt-scale" role="radiogroup" aria-label={task.rt}>{[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={rating === v} className={rating === v ? 'on' : ''} onClick={() => setRating(v)}>{v}</button>)}</div>
              </div>
            )}
            <div className="tt-actions"><button type="button" className="btn" onClick={() => commit({ ...pending, a: answers.map((a) => a.trim()), ...(rating ? { g: rating } : {}) })}>Next</button></div>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="eyebrow">Finished</p>
            <h1>Thank you</h1>
            <p>Please send this code to the researcher. It holds your clicks and answers and nothing else.</p>
            <textarea className="tl-code" readOnly rows={5} value={code} aria-label="Your result code" onFocus={(e) => e.target.select()} />
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

// ── Heatmap and click views ──
function HeatCanvas({ clicks, w, h, bw }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const cols = 120, rows = Math.max(1, Math.round((cols * h) / w));
    cv.width = cols; cv.height = rows;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, cols, rows);
    const pts = clicks.filter((c) => c.x != null).map((c) => [c.x * w, c.y * h]);
    const grid = F.kdeGrid(pts, w, h, cols, rows, bw === 'scott' ? 'scott' : bw * w);
    if (!grid || !grid.max) return;
    const lo = hexRgb(cssVar('--warn', '#e3a33b')), hi = hexRgb(cssVar('--bad', '#e34948'));
    const data = ctx.createImageData(cols, rows);
    for (let i = 0; i < grid.g.length; i++) {
      const t = grid.g[i] / grid.max; if (t < 0.04) continue;
      const k = i * 4; data.data[k] = lo[0] + (hi[0] - lo[0]) * t; data.data[k + 1] = lo[1] + (hi[1] - lo[1]) * t; data.data[k + 2] = lo[2] + (hi[2] - lo[2]) * t; data.data[k + 3] = Math.round(40 + 175 * t);
    }
    ctx.putImageData(data, 0, 0);
  }, [clicks, w, h, bw]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function Shot({ variant, children, label }) {
  const img = useImage(variant.u);
  return (
    <div className="st-shot" style={{ aspectRatio: `${variant.w || 4} / ${variant.h || 3}` }} role="img" aria-label={label}>
      {img.status === 'ok' ? <img src={img.src} alt="" /> : <div className="st-missing">{img.status === 'loading' ? 'Loading image…' : 'This image is not available in this browser (it was uploaded on another device). Clicks are still analysed.'}</div>}
      {children}
    </div>
  );
}

async function exportHeatmap(variant, clicks, bw, name) {
  const w = variant.w, h = variant.h, s = Math.min(1, 1600 / w), W = Math.round(w * s), H = Math.round(h * s);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  let note = '';
  try { const src = await F.resolveImage(variant.u); if (src) { const im = new Image(); im.crossOrigin = 'anonymous'; await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = src; }); ctx.drawImage(im, 0, 0, W, H); } } catch { note = 'image'; }
  const cols = 240, rows = Math.max(1, Math.round((cols * h) / w));
  const grid = F.kdeGrid(clicks.filter((c) => c.x != null).map((c) => [c.x * w, c.y * h]), w, h, cols, rows, bw === 'scott' ? 'scott' : bw * w);
  if (grid && grid.max) {
    const off = document.createElement('canvas'); off.width = cols; off.height = rows;
    const o = off.getContext('2d'), data = o.createImageData(cols, rows);
    for (let i = 0; i < grid.g.length; i++) { const t = grid.g[i] / grid.max; if (t < 0.04) continue; const k = i * 4; data.data[k] = 227 + (220 - 227) * t; data.data[k + 1] = 163 - 130 * t; data.data[k + 2] = 59 - 20 * t; data.data[k + 3] = Math.round(40 + 175 * t); }
    o.putImageData(data, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, W, H);
  }
  clicks.filter((c) => c.x != null).forEach((c) => { ctx.beginPath(); ctx.arc(c.x * W, c.y * H, 5, 0, Math.PI * 2); ctx.fillStyle = c.hit >= 0 ? '#2b711a' : '#c62828'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff'; ctx.stroke(); });
  const save = (canvas) => new Promise((resolve) => { try { canvas.toBlob((b) => { if (!b) { resolve(false); return; } const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); resolve(true); }, 'image/png'); } catch { resolve(false); } });
  if (await save(cv)) return note;
  // A hosted image without CORS headers taints the canvas: export the heatmap and dots on white instead.
  const clean = document.createElement('canvas'); clean.width = W; clean.height = H;
  const c2 = clean.getContext('2d'); c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, W, H);
  clicks.filter((c) => c.x != null).forEach((c) => { c2.beginPath(); c2.arc(c.x * W, c.y * H, 5, 0, Math.PI * 2); c2.fillStyle = c.hit >= 0 ? '#2b711a' : '#c62828'; c2.fill(); });
  await save(clean);
  return 'image';
}

function ClickView({ t, v, name }) {
  const [show, setShow] = useState({ heat: true, dots: true, targets: true, spots: false });
  const [bwMode, setBwMode] = useState('fixed');
  const [bw, setBw] = useState(0.03);
  const [note, setNote] = useState('');
  const toggle = (k) => setShow({ ...show, [k]: !show[k] });
  const ar = (v.v.h || 1) / (v.v.w || 1);
  return (
    <>
      <Stats rows={[
        ['First-click success', `${v.succ} of ${v.n} (${pct(v.rate)}), 95% CI ${v.ci ? `${pct(v.ci.lo)}–${pct(v.ci.hi)}` : '—'}`],
        ['Time to first click (geometric mean)', v.time ? `${num(v.time.geo, 1)} s${Number.isFinite(v.time.geoLo) ? ` (95% CI ${num(v.time.geoLo, 1)}–${num(v.time.geoHi, 1)} s)` : ''}` : '—'],
        ['Time for correct first clicks', v.timeOk ? `${num(v.timeOk.geo, 1)} s` : '—'],
        ['Skipped', `${v.skipped}`],
        ['Hotspots', `${v.hot.spots.length}${v.hot.scattered ? `, plus ${v.hot.scattered} scattered click${v.hot.scattered > 1 ? 's' : ''}` : ''}`],
      ]} />
      <div className="tl-row" role="group" aria-label="Layers">
        {[['heat', 'Heatmap'], ['dots', 'Click dots'], ['targets', 'Targets'], ['spots', 'Hotspots']].map(([k, l]) => <label key={k} className="tl-check"><input type="checkbox" checked={show[k]} onChange={() => toggle(k)} /> {l}</label>)}
      </div>
      <div className="tl-row">
        <Choice label="Heatmap smoothing" value={bwMode} onChange={setBwMode} options={[['fixed', 'Fixed radius'], ['scott', "Scott's rule (scipy default)"]]} />
        {bwMode === 'fixed' && <label className="st-range" style={{ minWidth: 200 }}><span>Radius: {Math.round(bw * 100)}% of image width</span><input type="range" min={0.01} max={0.1} step={0.005} value={bw} onChange={(e) => setBw(Number(e.target.value))} aria-label="Heatmap radius" /></label>}
      </div>
      <Shot variant={v.v} label={`Clicks on task ${t.ti + 1}${t.task.im.length > 1 ? `, version ${vLetter(v.vi)}` : ''}: ${v.succ} of ${v.n} on target`}>
        {show.heat && <HeatCanvas clicks={v.clicks} w={v.v.w || 1} h={v.v.h || 1} bw={bwMode === 'scott' ? 'scott' : bw} />}
        <svg viewBox={`0 0 1000 ${Math.round(1000 * ar)}`} preserveAspectRatio="none" aria-hidden="true">
          {show.targets && v.v.r.map((r, k) => <rect key={k} className="st-rect" x={r[0] * 1000} y={r[1] * 1000 * ar} width={r[2] * 1000} height={r[3] * 1000 * ar} />)}
          {show.spots && v.hot.spots.map((s, k) => <rect key={k} className="st-rect-off" x={s.box[0] * 1000 - 8} y={s.box[1] * 1000 * ar - 8} width={s.box[2] * 1000 + 16} height={s.box[3] * 1000 * ar + 16} />)}
          {show.dots && v.clicks.filter((c) => c.x != null).map((c, k) => <ellipse key={k} className="st-dot" cx={c.x * 1000} cy={c.y * 1000 * ar} rx={7} ry={7} style={{ fill: c.hit >= 0 ? 'var(--ok)' : 'var(--bad)' }} />)}
        </svg>
      </Shot>
      <ul className="tl-legend"><li><i style={{ background: 'var(--ok)' }} />Click on a target</li><li><i style={{ background: 'var(--bad)' }} />Click elsewhere</li><li><i style={{ background: 'color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 0, border: '1px solid var(--ok)' }} />Target area</li><li>Heatmap: kernel density of clicks, warmer = more</li></ul>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={async () => { const r = await exportHeatmap(v.v, v.clicks, bwMode === 'scott' ? 'scott' : bw, `${name}-task${t.ti + 1}${t.task.im.length > 1 ? vLetter(v.vi) : ''}-heatmap.png`); setNote(r === 'image' ? 'The screenshot could not be drawn into the PNG (a hosted image without cross-origin permission), so the PNG has the clicks only.' : ''); }}>Heatmap (PNG)</button>
        {note && <span className="tl-note">{note}</span>}
      </div>
      <div className="tt-build">
        <div>
          <h3 className="clu-h3">Hit rate per target</h3>
          {v.targets.length ? <Bars label="Hit rate per target" rows={v.targets.map((g) => [`Target ${g.k + 1}`, g.share, `${g.x} (${pct(g.share)})`, 'ok'])} /> : <p className="tl-note">No targets drawn for this image.</p>}
        </div>
        <div>
          <h3 className="clu-h3">Hotspots</h3>
          {v.hot.spots.length ? <Bars label="Share of clicks per hotspot" rows={[...v.hot.spots.map((s, k) => [`${k + 1}. at ${pct(s.x)} across, ${pct(s.y)} down${s.target >= 0 ? ` · target ${s.target + 1}` : ''}`, s.share, `${s.n} (${pct(s.share)})`, s.target >= 0 ? 'ok' : 'bad']), ...(v.hot.scattered ? [['Scattered', v.hot.scattered / Math.max(1, v.n - v.skipped), `${v.hot.scattered}`, 'warn']] : [])]} /> : <p className="tl-note">Not enough clicks close together.</p>}
        </div>
      </div>
    </>
  );
}

function FiveView({ t, v }) {
  return (
    <>
      <Stats rows={[
        ['Participants', `${v.n}`],
        t.task.kw?.length > 0 && ['Mentioned a keyword', `${v.kwAll.any.x} of ${v.kwAll.any.n} (${pct(v.kwAll.any.share)}), 95% CI ${v.kwAll.any.ci ? `${pct(v.kwAll.any.ci.lo)}–${pct(v.kwAll.any.ci.hi)}` : '—'}`],
        v.rating && [t.task.rt || 'Rating', `mean ${num(v.rating.mean, 2)} of 5${v.rating.ci ? ` (95% CI ${num(v.rating.ci.lo, 2)}–${num(v.rating.ci.hi, 2)})` : ''}, median ${v.rating.median}, ${pct(v.rating.top2)} gave 4 or 5`],
      ]} />
      <Shot variant={v.v} label="The page shown" />
      {t.task.kw?.length > 0 && (<><h3 className="clu-h3">Keywords mentioned (any answer)</h3><Bars label="Keyword mentions" rows={v.kwAll.each.map((k) => [k.kw, k.share, `${k.x} (${pct(k.share)})`])} /></>)}
      {v.qs.map((q, i) => (
        <div key={i} className="clu-root" style={{ gap: 10 }}>
          <h3 className="clu-h3">{q.q}</h3>
          {q.words.length ? <Bars label={`Most used words: ${q.q}`} rows={q.words.slice(0, 12).map((w) => [w.word, w.share, `${w.n} (${pct(w.share)})`])} /> : <p className="tl-note">No answers.</p>}
          <details><summary>All {q.answers.length} answers</summary><ul className="tl-defs">{q.answers.map((a, k) => <li key={k}>{a}</li>)}</ul></details>
        </div>
      ))}
      {v.rating && (<><h3 className="clu-h3">{t.task.rt}</h3><Bars label="Rating distribution" rows={v.rating.dist.map((c, k) => [`${k + 1}`, c / v.rating.n, `${c}`])} /></>)}
    </>
  );
}

function FcAnalysis({ study, codes, setCodes }) {
  const [sel, setSel] = useState(0);
  const [vsel, setVsel] = useState(0);
  const parsed = useMemo(() => U.parseCodes(codes, F.decodeResult), [codes]);
  const other = parsed.results.filter((r) => r.s && r.s !== study.id).length;
  const an = useMemo(() => F.analyse(study, parsed.results), [study, parsed]);
  const sum = useMemo(() => F.firstClickSummary(an), [an]);
  const stored = U.loadSessions(TOOL, study.id);
  const t = an.tasks[Math.max(0, Math.min(sel, an.tasks.length - 1))];
  const v = t ? t.variants[Math.min(vsel, t.variants.length - 1)] : null;
  return (
    <div className="clu-root">
      <div className="calc-inputs">
        <label className="calc-field wide">
          <span>Result codes, one per line</span>
          <textarea rows={6} value={codes} onChange={(e) => setCodes(e.target.value)} spellCheck={false} placeholder="Paste the codes participants sent you" />
          <small>Codes from other studies are ignored. Nothing is uploaded; the analysis runs in this browser.</small>
        </label>
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" disabled={!stored.length} onClick={() => setCodes([...new Set([...codes.split(/\s+/).filter(Boolean), ...stored])].join('\n'))}>Load {stored.length} session{stored.length === 1 ? '' : 's'} saved in this browser</button>
        {stored.length > 0 && <button type="button" className="clu-link" onClick={() => { if (window.confirm('Remove the sessions saved in this browser for this study?')) { U.clearSessions(TOOL, study.id); setCodes(`${codes} `); } }}>Clear saved sessions</button>}
        <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`first-click-${study.id}.csv`, F.clicksCsv(study, an), 'text/csv')}>Clicks (CSV)</button>
        <button type="button" className="btn ghost small" disabled={!an.n} onClick={() => download(`first-click-report-${study.id}.md`, F.markdownReport(study, an, sum), 'text/markdown')}>Report (Markdown)</button>
      </div>
      {parsed.bad.length > 0 && <Problem>{parsed.bad.length} code{parsed.bad.length > 1 ? 's' : ''} could not be read; check they were copied in full.</Problem>}
      {other > 0 && <Problem>{other} code{other > 1 ? 's are' : ' is'} from a different study and {other > 1 ? 'were' : 'was'} left out.</Problem>}
      {!an.tasks.length ? <Problem>The study has no complete tasks yet: give each task an instruction and an image.</Problem> : !an.n ? <Problem>Paste at least one result code, load saved sessions, or use the example.</Problem> : (
        <>
          <h3 className="clu-h3">All tasks</h3>
          <div className="clu-scroll"><table className="clu-table clu-num" aria-label="Summary across tasks">
            <thead><tr><th>Task</th><th>Type</th><th>Version</th><th>n</th><th>Result</th><th>Time (geo mean)</th></tr></thead>
            <tbody>{an.tasks.flatMap((x) => x.variants.map((y) => (
              <tr key={`${x.ti}-${y.vi}`} className={x.ti === t.ti && y.vi === v.vi ? 'on' : ''}>
                <td><button type="button" className="clu-link" onClick={() => { setSel(x.ti); setVsel(y.vi); }}>Task {x.ti + 1}</button></td>
                <td>{F.TASK_TYPES[x.task.y]}</td><td>{x.task.im.length > 1 ? vLetter(y.vi) : '—'}</td><td>{y.n}</td>
                <td>{x.task.y === 'click' ? <>{pct(y.rate)} ({y.ci ? `${pct(y.ci.lo)}–${pct(y.ci.hi)}` : '—'}) <span className={`qtag ${y.rate >= 0.8 ? 'promote' : y.rate >= 0.7 ? 'opp' : 'fix'}`}>{y.succ}/{y.n}</span></> : x.task.kw?.length ? `${pct(y.kwAll.any.share)} mentioned a keyword` : `${y.n} answered`}</td>
                <td>{x.task.y === 'click' && y.time ? `${num(y.time.geo, 1)} s` : '—'}</td>
              </tr>
            )))}</tbody>
          </table></div>
          <h3 className="clu-h3">Task {t.ti + 1}: {t.task.q}</h3>
          <div className="tl-row">{an.tasks.map((x) => <button key={x.ti} type="button" className={`btn small ${x.ti === t.ti ? '' : 'ghost'}`} onClick={() => { setSel(x.ti); setVsel(0); }}>Task {x.ti + 1}</button>)}</div>
          {t.variants.length > 1 && <div className="tl-row">{t.variants.map((y) => <button key={y.vi} type="button" className={`btn small ${y.vi === v.vi ? '' : 'ghost'}`} onClick={() => setVsel(y.vi)}>Version {vLetter(y.vi)} ({y.n})</button>)}</div>}
          {t.cmp && <p className="tl-note">Version A {pct(t.variants[0].rate)} vs version B {pct(t.variants[1].rate)}: difference {pct(t.cmp.diff)} (95% CI {pct(t.cmp.lo)} to {pct(t.cmp.hi)}), N−1 two-proportion test p = {num(t.cmp.p, 3)}.</p>}
          {!v.n ? <Problem>No one has done this {t.variants.length > 1 ? 'version' : 'task'} yet.</Problem> : t.task.y === 'click' ? (
            <>
              <Result big={pct(v.rate)} label={`first clicks on target (${v.succ} of ${v.n})`} tone={v.rate >= 0.8 ? 'good' : v.rate < 0.7 ? 'bad' : undefined} />
              <ClickView t={t} v={v} name={`first-click-${study.id}`} />
            </>
          ) : <FiveView t={t} v={v} />}
          {sum && <StudySummary {...sum} />}
        </>
      )}
    </div>
  );
}

// ── Builder ──
function TargetDrawer({ variant, onChange }) {
  const img = useImage(variant.u);
  const ref = useRef(null);
  const [tmp, setTmp] = useState(null);
  const start = useRef(null);
  const ar = (variant.h || 1) / (variant.w || 1);
  const pt = (e) => { const r = ref.current.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  const down = (e) => { if (e.button !== undefined && e.button !== 0) return; start.current = pt(e); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } setTmp(F.rectFrom(start.current, start.current)); };
  const move = (e) => { if (start.current) setTmp(F.rectFrom(start.current, pt(e))); };
  const up = (e) => { if (!start.current) return; const r = F.rectFrom(start.current, pt(e)); start.current = null; setTmp(null); if (r[2] > 0.005 && r[3] > 0.005) onChange([...variant.r, r]); };
  const setR = (i, k, val) => onChange(variant.r.map((r, j) => (j === i ? r.map((x, q) => (q === k ? F.round4(Math.max(0, Math.min(1, Number(val) / 100))) : x)) : r)));
  if (img.status !== 'ok') return <div className="st-missing">{img.status === 'loading' ? 'Loading image…' : 'Image not available in this browser.'}</div>;
  return (
    <div className="clu-root" style={{ gap: 8 }}>
      <div className="st-draw" ref={ref} style={{ aspectRatio: `${variant.w} / ${variant.h}` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setTmp(null); }} aria-label="Drag on the image to draw a correct target area">
        <img src={img.src} alt="Screenshot for this task" draggable={false} />
        <svg viewBox={`0 0 1000 ${Math.round(1000 * ar)}`} preserveAspectRatio="none" aria-hidden="true">
          {variant.r.map((r, i) => <g key={i}><rect className="st-rect" x={r[0] * 1000} y={r[1] * 1000 * ar} width={r[2] * 1000} height={r[3] * 1000 * ar} /><text x={r[0] * 1000 + 6} y={r[1] * 1000 * ar + 22} style={{ fontSize: 22, fontWeight: 800, fill: 'var(--ok)' }}>{i + 1}</text></g>)}
          {tmp && <rect className="st-rect new" x={tmp[0] * 1000} y={tmp[1] * 1000 * ar} width={tmp[2] * 1000} height={tmp[3] * 1000 * ar} />}
        </svg>
      </div>
      <div className="st-rects">
        <small className="tl-note">Drag on the image to draw a target, or type its position in % of the image (left, top, width, height).</small>
        {variant.r.map((r, i) => (
          <div key={i}>
            <b>Target {i + 1}</b>
            {['Left', 'Top', 'Width', 'Height'].map((l, k) => <label key={l}>{l} <input type="number" min={0} max={100} step={0.5} value={Math.round(r[k] * 1000) / 10} onChange={(e) => setR(i, k, e.target.value)} aria-label={`Target ${i + 1} ${l.toLowerCase()} in percent`} /></label>)}
            <button type="button" className="clu-link" onClick={() => onChange(variant.r.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div><button type="button" className="btn ghost small" onClick={() => onChange([...variant.r, [0.4, 0.4, 0.2, 0.1]])}>Add a target by numbers</button></div>
      </div>
    </div>
  );
}

function VariantEditor({ studyId, task, variant, vi, mode, onChange, onRemove, canRemove }) {
  const [url, setUrl] = useState(F.isUrl(variant.u) ? variant.u : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (file) => {
    if (!file) return; setErr(''); setBusy(true);
    try {
      const data = await readFile(file); const { w, h } = await loadSize(data);
      const key = `${studyId}-${U.newId()}`; const where = await F.putImage(key, data);
      onChange({ ...variant, u: `idb:${key}`, w, h, r: [] });
      if (where === 'memory') setErr('This browser blocks storage, so the image is kept only until you close this tab.');
    } catch { setErr('That file could not be read as an image.'); }
    setBusy(false);
  };
  const useUrl = async () => {
    setErr(''); if (!F.isUrl(url)) { setErr('Enter a full address starting with https://'); return; }
    setBusy(true);
    try { const { w, h } = await loadSize(url); onChange({ ...variant, u: url.trim(), w, h, r: variant.u === url.trim() ? variant.r : [] }); } catch { setErr('The image did not load from that address. Check it opens in a new tab and is publicly reachable.'); }
    setBusy(false);
  };
  return (
    <div className="st-variant">
      <div className="tl-row"><b>{task.im.length > 1 ? `Version ${vLetter(vi)}` : 'Screenshot'}</b>{variant.u && <span className="tl-note">{variant.u.startsWith('idb:') ? 'Uploaded, kept in this browser' : variant.u.startsWith('ex:') ? 'Built-in example image' : 'Hosted image'} · {variant.w}×{variant.h}px</span>}{canRemove && <button type="button" className="clu-link" onClick={onRemove}>Remove version</button>}</div>
      <div className="tl-row">
        {mode === 'local'
          ? <label className="calc-field"><span>Upload a screenshot</span><input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} aria-label={`Upload screenshot${task.im.length > 1 ? ` for version ${vLetter(vi)}` : ''}`} /></label>
          : <span className="tl-row" style={{ flex: '1 1 300px' }}><input type="url" className="tl-code" style={{ flex: 1, minWidth: 0, padding: '7px 10px' }} placeholder="https://your-site.example/screenshot.png" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Image address" /><button type="button" className="btn ghost small" disabled={!url.trim() || busy} onClick={useUrl}>Use this image</button></span>}
        {busy && <span className="tl-note">Loading…</span>}
      </div>
      {err && <Problem>{err}</Problem>}
      {variant.u && task.y === 'click' && <TargetDrawer variant={variant} onChange={(r) => onChange({ ...variant, r })} />}
      {variant.u && task.y === '5s' && <Shot variant={variant} label="Screenshot for this task" />}
    </div>
  );
}

function FcBuilder({ draft, setDraft, study, link, onPreview }) {
  const [copied, setCopied] = useState(false);
  const setTask = (i, patch) => setDraft({ ...draft, tasks: draft.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const local = F.localRefs(study);
  const missing = draft.tasks.map((t, i) => (!t.im.some((v) => v.u) ? `Task ${i + 1} has no image` : t.y === 'click' && t.im.some((v) => v.u && !v.r.length) ? `Task ${i + 1} needs at least one target on each image` : t.y === 'click' && !t.q.trim() ? `Task ${i + 1} needs an instruction` : t.y === '5s' && !t.qs.trim() ? `Task ${i + 1} needs at least one question` : null)).filter(Boolean);
  return (
    <div className="clu-root">
      <label className="calc-field wide">
        <span>Study name</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ width: '100%', maxWidth: 480 }} />
      </label>
      <Choice label="How participants will see the images" value={draft.mode} onChange={(m) => setDraft({ ...draft, mode: m })} options={[['local', 'Moderated, in this browser'], ['url', 'Shareable link, images you host']]} />
      <div className="calc-warn" role="note" style={{ display: 'grid', gap: 6 }}>
        <b>Images never go into the link, and nothing is uploaded to this site.</b>
        {draft.mode === 'local'
          ? <span>Moderated mode: screenshots you upload are read on this device and kept in this browser (IndexedDB, or memory if storage is blocked). The participant link works only in this browser on this device, so run sessions here, one participant after another.</span>
          : <span>Shareable mode: put each screenshot somewhere public (your website, a CDN or a file host with direct image links) and paste its address. Only the addresses go into the link, so participants anywhere can take the test. Anyone with the link can see the images.</span>}
      </div>
      {draft.mode === 'url' && local.length > 0 && <Problem>{local.length} image{local.length > 1 ? 's were' : ' was'} uploaded in this browser and will not reach participants on other devices: replace {local.length > 1 ? 'them' : 'it'} with hosted addresses.</Problem>}
      <h3 className="clu-h3">Tasks ({draft.tasks.length} of up to 10)</h3>
      <div className="tt-tasks">
        {draft.tasks.map((t, i) => (
          <div key={i} className="tt-task">
            <div className="tl-row"><b>Task {i + 1}</b><Choice label="Type" value={t.y} onChange={(y) => setTask(i, { y })} options={[['click', 'First click'], ['5s', '5-second test']]} /><button type="button" className="clu-link" disabled={draft.tasks.length <= 1} onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })}>Remove task</button></div>
            <label className="calc-field wide"><span>{t.y === 'click' ? 'Instruction' : 'Instruction before the page shows (optional)'}</span><textarea rows={2} value={t.q} onChange={(e) => setTask(i, { q: e.target.value })} placeholder={t.y === 'click' ? 'A realistic scenario, such as "You want to change your delivery address. Where would you click first?"' : ''} /></label>
            {t.y === '5s' && (
              <div className="tl-row" style={{ alignItems: 'start' }}>
                <label className="calc-field"><span>Seconds shown</span><input type="number" min={1} max={60} value={t.s} onChange={(e) => setTask(i, { s: e.target.value })} style={{ width: 90 }} /></label>
                <label className="calc-field wide" style={{ flex: '2 1 260px' }}><span>Recall questions, one per line</span><textarea rows={3} value={t.qs} onChange={(e) => setTask(i, { qs: e.target.value })} placeholder="What does this company offer?" /></label>
                <label className="calc-field wide" style={{ flex: '1 1 220px' }}><span>Rating question, 1–5 (optional)</span><input type="text" value={t.rt} onChange={(e) => setTask(i, { rt: e.target.value })} placeholder="How clear was the purpose of the page?" /></label>
                <label className="calc-field wide" style={{ flex: '1 1 220px' }}><span>Keywords that show the message got through (comma-separated)</span><input type="text" value={t.kw} onChange={(e) => setTask(i, { kw: e.target.value })} placeholder="invoice, payment" /></label>
              </div>
            )}
            <div className="st-variants">
              {t.im.map((v, vi) => <VariantEditor key={vi} studyId={draft.id} task={t} variant={v} vi={vi} mode={draft.mode} canRemove={t.im.length > 1} onRemove={() => setTask(i, { im: t.im.filter((_, j) => j !== vi) })} onChange={(nv) => setTask(i, { im: t.im.map((x, j) => (j === vi ? nv : x)) })} />)}
            </div>
            {t.im.length < 4 && <div><button type="button" className="btn ghost small" onClick={() => setTask(i, { im: [...t.im, { u: '', w: 0, h: 0, r: [] }] })}>Add another version (A/B)</button> <span className="tl-note">Each participant sees one version, alternating in moderated sessions.</span></div>}
          </div>
        ))}
      </div>
      <div className="tl-row">
        <button type="button" className="btn ghost small" disabled={draft.tasks.length >= 10} onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, { y: 'click', q: '', s: 5, qs: '', rt: '', kw: '', im: [{ u: '', w: 0, h: 0, r: [] }] }] })}>Add a task</button>
        <label className="tl-check"><input type="checkbox" checked={draft.randomise} onChange={(e) => setDraft({ ...draft, randomise: e.target.checked })} /> Randomise task order</label>
      </div>
      {missing.length > 0 && <Problem>{missing.join('. ')}. Incomplete tasks are left out of the link.</Problem>}
      <h3 className="clu-h3">{draft.mode === 'local' ? 'Run sessions in this browser' : 'Share with participants'}</h3>
      <textarea className="tl-code" readOnly rows={3} value={link} aria-label="Participant link" onFocus={(e) => e.target.select()} />
      <div className="clu-actions">
        <button type="button" className="btn small" onClick={async () => setCopied(await copyText(link))}>{copied ? 'Copied' : 'Copy participant link'}</button>
        <button type="button" className="btn ghost small" onClick={onPreview}>Preview as participant</button>
        <span className="tl-note">Study id <code>{study.id}</code> · link {link.length} characters</span>
      </div>
      <p className="tl-note">Results come back as codes that participants copy or email to you. Sessions run on this device are also kept in this browser under the study id, so you can load them in Analyse.</p>
    </div>
  );
}

const draftTask = (t) => ({ y: t.y, q: t.q, s: t.s || 5, qs: (t.qs || []).join('\n'), rt: t.rt || '', kw: (t.kw || []).join(', '), im: t.im.map((v) => ({ ...v, r: v.r.map((r) => [...r]) })) });
const exampleDraft = () => { const s = F.exampleStudy(); return { id: s.id, name: s.n, mode: 'local', randomise: false, tasks: s.k.map(draftTask) }; };
const studyFromDraft = (d) => F.makeStudy({
  id: d.id, name: d.name, mode: d.mode, randomise: d.randomise,
  tasks: d.tasks.map((t) => ({ y: t.y, q: t.q, s: t.s, qs: String(t.qs || '').split(/\r?\n/), rt: t.rt, kw: String(t.kw || '').split(','), im: t.im.filter((v) => v.u && v.w && v.h) }))
    .filter((t) => t.im.length && (t.y === '5s' ? t.qs.some((q) => q.trim()) : t.q.trim() && t.im.every((v) => v.r.length))),
});

// ── First click ──
function FirstClick() {
  const [params, setParams] = useSearchParams();
  const go = useNavigate();
  const studyParam = params.get('study');
  const [draft, setDraftRaw] = useState(() => U.readStore(DRAFT_KEY) || exampleDraft());
  const setDraft = (d) => { setDraftRaw(d); U.writeStore(DRAFT_KEY, d); };
  const [tab, setTab] = useState('build');
  const study = useMemo(() => studyFromDraft(draft), [draft]);
  const code = useMemo(() => F.encodeStudy(study), [study]);
  const href = useHref(`/calculators/first-click?study=${code}`);
  const link = typeof window !== 'undefined' ? new URL(href, window.location.href).href : href;
  const isExample = draft.id === 'fcexample';
  const [codes, setCodes] = useState(() => (isExample ? F.exampleResults(F.exampleStudy()).map(F.encodeResult).join('\n') : ''));
  const [pasted, setPasted] = useState('');
  const [loadErr, setLoadErr] = useState('');

  let runStudy = null, runErr = '';
  if (studyParam) { try { runStudy = F.decodeStudy(studyParam); } catch (e) { runErr = e.message; } }
  if (runStudy) return <FcParticipant study={runStudy} preview={params.get('preview') === '1'} onExit={() => { if (window.opener) window.close(); else setParams({}); }} />;

  const loadStudy = () => {
    try { const s = F.decodeStudy(pasted); setDraft({ id: s.id, name: s.n, mode: s.m, randomise: !!s.o?.r, tasks: s.k.map(draftTask) }); setLoadErr(''); setPasted(''); setCodes(''); } catch { setLoadErr('That is not a first-click study link.'); }
  };
  const fresh = () => { if (!window.confirm('Start a new, empty study? The current one is replaced in this browser (copy its link first if you need it).')) return; setDraft({ id: F.newId(), name: 'First-click test', mode: 'local', randomise: false, tasks: [{ y: 'click', q: '', s: 5, qs: '', rt: '', kw: '', im: [{ u: '', w: 0, h: 0, r: [] }] }] }); setCodes(''); };
  const example = () => { setDraft(exampleDraft()); setCodes(F.exampleResults(F.exampleStudy()).map(F.encodeResult).join('\n')); };
  return (
    <>
      {runErr && <Problem>The study link could not be read ({runErr}). Ask the researcher for a fresh link.</Problem>}
      <div className="calc-inputs">
        <Choice label="Step" value={tab} onChange={setTab} options={[['build', '1. Build the study'], ['analyse', '2. Analyse results']]} />
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" onClick={example}>Load the example study and data</button>
        <button type="button" className="btn ghost small" onClick={fresh}>New empty study</button>
        <span className="tl-row" style={{ flex: '1 1 260px' }}>
          <input type="text" className="tl-code" style={{ flex: 1, minWidth: 0, padding: '7px 10px' }} placeholder="Or paste a study link to open it" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Study link" />
          <button type="button" className="btn ghost small" disabled={!pasted.trim()} onClick={loadStudy}>Open</button>
        </span>
      </div>
      {loadErr && <Problem>{loadErr}</Problem>}
      {tab === 'build'
        ? <FcBuilder draft={draft} setDraft={setDraft} study={study} link={link} onPreview={() => { const w = window.open(`${link}&preview=1`, '_blank'); if (!w) go(`/calculators/first-click?study=${code}&preview=1`); }} />
        : <FcAnalysis study={study} codes={codes} setCodes={setCodes} />}
      <About method="first-click-testing" links={[['5-second-test', '5-second test'], ['glanceability-measurement', 'Glanceability measurement'], ['search-and-select-icon-recognition-test', 'Search-and-select icon recognition'], ['heatmap-and-scrollmap-interpretation-protocol', 'Heatmap interpretation'], ['tree-testing', 'Tree testing'], ['adjusted-wald-confidence-interval-for-completion-rates', 'Adjusted-Wald interval'], ['usability-testing', 'Usability testing']]}>
        <p>A <b>first-click test</b> shows a screenshot and a task, and records where people click first. A <b>5-second test</b> shows a page briefly, hides it, and asks what people remember: a quick check that the main message and purpose come across. Each task can have several versions (A/B); each participant sees one.</p>
        <p><b>Clicks</b> are stored as fractions of the image's width and height: x = (click − image left) ÷ displayed width, and the same for y, so they do not depend on screen size. A click counts as correct when it falls inside (or on the edge of) any target rectangle you drew. <b>Success</b> is the share of correct first clicks, with skips counted as failures, and the adjusted-Wald interval (Sauro and Lewis). <b>Time to first click</b> is the geometric mean with a t-interval on log times, because times are right-skewed. Two versions are compared with the N−1 two-proportion test.</p>
        <p><b>Heatmap</b>: a Gaussian kernel density of the clicks in image pixels, f(x) = 1/(n·2π·√|Σ|) Σ<sub>i</sub> exp(−½ (x − x<sub>i</sub>)ᵀ Σ⁻¹ (x − x<sub>i</sub>)). "Fixed radius" uses Σ = h²I with h a share of the image width; "Scott's rule" uses the clicks' covariance times n<sup>−1/3</sup>, as scipy.stats.gaussian_kde does, which smooths several hotspots into one blob, so the fixed radius is the default. <b>Hotspots</b> are found with DBSCAN (radius 5% of the image width, at least 3 clicks, or 2 when there are fewer than 10); a hotspot is "on" a target when at least half its clicks hit it.</p>
        <p><b>5-second answers</b>: word counts give how many answers use each word (stop words left out). An answer mentions a keyword when one of its words starts with the keyword. The rating is summarised by its mean with a t-interval, its median and the share of 4s and 5s.</p>
        <p><b>Why the first click matters.</b> Bailey and Wolfson (2009, "FirstClick usability testing") found that people whose first click was right completed the task about 87% of the time, against about 46% when it was wrong: roughly twice as likely. That is an association across their studies, not a guarantee for your design.</p>
        <p><b>When not to use it.</b> Do not use first clicks to judge whole journeys, content quality or anything that needs scrolling, hovering or typing. A 5-second test suits pages whose job is to communicate quickly (home pages, landing pages, dashboards); it is the wrong test for pages people study. Results from a dozen people show only big problems; plan for 20 to 40 per version.</p>
      </About>
    </>
  );
}

export default FirstClick;
