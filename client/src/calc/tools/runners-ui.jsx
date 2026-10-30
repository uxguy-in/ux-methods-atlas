// Pieces shared by the runner tools (group "runners"): the participant frame, the finish screen with the result code,
// the study-link box, the result-code box and a share chart with interval whiskers.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { copyText, Problem } from './ui.jsx';
import * as C from './runners-common.js';
import './runners.css';

export function RunFrame({ label, wide, preview, onExit, children, scrollKey }) {
  const top = useRef(null);
  useEffect(() => { top.current?.scrollTo?.(0, 0); }, [scrollKey]);
  return createPortal(
    <div className="tt-run rn-run" ref={top} role="dialog" aria-modal="true" aria-label={label}>
      <div className={`tt-run-in${wide ? ' rn-wide' : ''}`}>
        {preview && <p className="calc-warn">Preview: this run is not saved in the browser. <button type="button" className="clu-link" onClick={onExit}>Close the preview</button></p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function DoneScreen({ code, title, saved, preview, onAgain, onExit }) {
  const [copied, setCopied] = useState(false);
  const mail = `mailto:?subject=${encodeURIComponent(`Study results: ${title}`)}&body=${encodeURIComponent(`My result code for "${title}":\n\n${code}\n`)}`;
  return (
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
      {!preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={onAgain}>Start a new session (moderated testing)</button></div>}
      {preview && <div className="tt-actions"><button type="button" className="btn ghost small" onClick={onExit}>Close the preview</button></div>}
    </>
  );
}

export function ShareBox({ link, studyId, onPreview, problems = [], note }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <h3 className="clu-h3">Share with participants</h3>
      {problems.length > 0 && <Problem>{problems.join(' ')}</Problem>}
      <textarea className="tl-code" readOnly rows={3} value={link} aria-label="Participant link" onFocus={(e) => e.target.select()} />
      <div className="clu-actions">
        <button type="button" className="btn small" disabled={problems.length > 0} onClick={async () => setCopied(await copyText(link))}>{copied ? 'Copied' : 'Copy participant link'}</button>
        <button type="button" className="btn ghost small" disabled={problems.length > 0} onClick={onPreview}>Preview as participant</button>
        <span className="tl-note">Study id <code>{studyId}</code> · link {link.length.toLocaleString('en-GB')} characters</span>
      </div>
      <p className="tl-note">{note || 'The whole study travels inside the link, compressed; nothing is stored on a server. Participants copy or email a result code back to you. In moderated sessions on this device, results are also kept in this browser under the study id, so you can load them in Analyse.'}</p>
    </>
  );
}

export function CodesBox({ tool, studyId, codes, setCodes, parsed, children }) {
  const stored = C.loadSessions(tool, studyId);
  return (
    <>
      <div className="calc-inputs">
        <label className="calc-field wide">
          <span>Result codes, one per line</span>
          <textarea rows={5} value={codes} onChange={(e) => setCodes(e.target.value)} spellCheck={false} placeholder="Paste the codes participants sent you" />
          <small>Codes from other studies are ignored. Nothing is uploaded; the analysis runs in this browser.</small>
        </label>
      </div>
      <div className="clu-actions">
        <button type="button" className="btn ghost small" disabled={!stored.length} onClick={() => setCodes([...new Set([...codes.split(/\s+/).filter(Boolean), ...stored])].join('\n'))}>Load {stored.length} session{stored.length === 1 ? '' : 's'} saved in this browser</button>
        {stored.length > 0 && <button type="button" className="clu-link" onClick={() => { if (window.confirm('Remove the sessions saved in this browser for this study?')) { C.clearSessions(tool, studyId); setCodes(`${codes} `); } }}>Clear saved sessions</button>}
        {children}
      </div>
      {parsed.bad.length > 0 && <Problem>{parsed.bad.length} code{parsed.bad.length > 1 ? 's' : ''} could not be read; check {parsed.bad.length > 1 ? 'they were' : 'it was'} copied in full.</Problem>}
      {parsed.other > 0 && <Problem>{parsed.other} code{parsed.other > 1 ? 's are' : ' is'} from a different study and {parsed.other > 1 ? 'were' : 'was'} left out.</Problem>}
      {parsed.dupes > 0 && <Problem>{parsed.dupes} duplicate code{parsed.dupes > 1 ? 's were' : ' was'} left out.</Problem>}
    </>
  );
}

// Horizontal shares with interval whiskers. rows: [{ label, share, lo, hi, tone }]; ref: a reference share (dashed line).
export function ShareChart({ rows, refLine, label, max = 1 }) {
  const W = 640, padL = 170, padR = 70, rowH = 30, padT = 20, H = padT + rows.length * rowH + 22;
  const X = (v) => padL + (Math.max(0, Math.min(max, v)) / max) * (W - padL - padR);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <svg className="rn-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ maxWidth: W }}>
      {ticks.map((t) => <g key={t}><line className="grid" x1={X(t)} x2={X(t)} y1={padT - 6} y2={H - 20} /><text className="ax" x={X(t)} y={H - 6} textAnchor="middle">{Math.round(t * 100)}%</text></g>)}
      {Number.isFinite(refLine) && <line className="ref" x1={X(refLine)} x2={X(refLine)} y1={padT - 10} y2={H - 20} />}
      {rows.map((r, i) => {
        const y = padT + i * rowH;
        const name = r.label.length > 26 ? `${r.label.slice(0, 25)}…` : r.label;
        return (
          <g key={i}>
            <text className="lb" x={padL - 8} y={y + 15} textAnchor="end">{name}<title>{r.label}</title></text>
            <rect x={X(0)} y={y + 4} width={Math.max(0, X(r.share) - X(0))} height={rowH - 12} style={{ fill: r.tone || 'var(--c1)', opacity: 0.85 }} />
            {Number.isFinite(r.lo) && <><line className="whisk" x1={X(r.lo)} x2={X(r.hi)} y1={y + rowH / 2 - 1} y2={y + rowH / 2 - 1} /><line className="whisk" x1={X(r.lo)} x2={X(r.lo)} y1={y + 8} y2={y + rowH - 10} /><line className="whisk" x1={X(r.hi)} x2={X(r.hi)} y1={y + 8} y2={y + rowH - 10} /></>}
            <text className="lb" x={X(Number.isFinite(r.hi) ? r.hi : r.share) + 6} y={y + 15}>{Number.isFinite(r.share) ? `${Math.round(r.share * 100)}%` : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Wrap a study link so it works on both the Express app and the hash-routed static build.
export function linkFor(href) { try { return new URL(href, window.location.href).href; } catch { return href; } }
