import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { REPO_URL, REPORT_URL } from '../vocab.js';

// Report a bug or mistake: builds a prefilled GitHub issue (public), with a copy-the-text fallback.
const KINDS = [
  'A calculator gives a wrong or odd result',
  'Something is broken or does not load',
  'A method write-up is wrong, missing something or out of date',
  'A book or source is wrong',
  'A link is broken',
  'Accessibility problem',
  'Typo or wording',
  'Something else',
];
// GitHub rejects very long prefilled URLs, so longer reports fall back to the blank issue form or copied text.
const MAX_URL = 7500;

function browserName() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, os && `on ${os}`].filter(Boolean).join(' ');
}

export default function ReportProblem() {
  const [params] = useSearchParams();
  const fromPage = params.get('page') || '';
  const ref = useRef(null);
  const [f, setF] = useState({ kind: fromPage.startsWith('/calculators/') ? KINDS[0] : fromPage.startsWith('/methods/') ? KINDS[2] : '', page: fromPage, what: '', expected: '', steps: '', device: '' });
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setF((x) => ({ ...x, device: x.device || browserName() })); }, []);
  // Arriving from a "Report a problem" link: bring the form into view.
  // Wait a moment so the layout's scroll restore runs first.
  useEffect(() => {
    if (!params.get('report')) return undefined;
    const t = setTimeout(() => ref.current?.scrollIntoView({ block: 'start' }), 150);
    return () => clearTimeout(t);
  }, [params]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setCopied(false); };

  const missing = !f.kind || !f.what.trim();
  const body = useMemo(() => {
    const sec = (h, v) => (String(v).trim() ? `### ${h}\n\n${String(v).trim()}\n\n` : '');
    return (sec('What kind of problem?', f.kind) + sec('Page', f.page) + sec('What went wrong?', f.what) +
      sec('What did you expect, or what should it say?', f.expected) + sec('How can we see it?', f.steps) + sec('Browser and device', f.device)).trim();
  }, [f]);
  const title = `Problem: ${f.what.trim().split('\n')[0].slice(0, 70) || f.kind}`;
  const issueUrl = `${REPO_URL}/issues/new?${new URLSearchParams({ title, body, labels: 'bug' })}`;
  const tooLong = issueUrl.length > MAX_URL;

  const open = () => { setTried(true); if (!missing) window.open(tooLong ? REPORT_URL : issueUrl, '_blank', 'noopener'); };
  const copy = async () => {
    setTried(true);
    if (missing) return;
    try { await navigator.clipboard.writeText(`${title}\n\n${body}`); setCopied(true); } catch { setCopied(false); }
  };

  return (
    <section className="report-problem" id="report" ref={ref} aria-labelledby="report-h">
      <h2 id="report-h">Report a problem</h2>
      <p>Found a wrong calculation, a broken page, a dead link or a mistake in a method? Tell us here. The form opens a prefilled issue on GitHub, where we track and fix reports; you need a free GitHub account to send it. Reports are public, so leave out names, contact details and any participant or client data. No GitHub account? Copy the report and send it to the UX Brighton team.</p>
      <div className="report-grid">
        <label className="field">
          <span>What kind of problem? <em>required</em></span>
          <select className={`select${tried && !f.kind ? ' invalid' : ''}`} value={f.kind} onChange={set('kind')} aria-invalid={tried && !f.kind} required>
            <option value="">Choose one</option>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Page, method or calculator</span>
          <input value={f.page} onChange={set('page')} placeholder="For example /calculators/sus or Card sorting" />
        </label>
        <label className="field wide">
          <span>What went wrong? <em>required</em></span>
          <textarea className={tried && !f.what.trim() ? 'invalid' : ''} rows={4} value={f.what} onChange={set('what')} aria-invalid={tried && !f.what.trim()} required />
        </label>
        <label className="field wide">
          <span>What did you expect, or what should it say?</span>
          <textarea rows={3} value={f.expected} onChange={set('expected')} placeholder="For a calculation, the value you expected and where it comes from (a textbook, R, SPSS, a paper)." />
        </label>
        <label className="field wide">
          <span>How can we see it?</span>
          <textarea rows={3} value={f.steps} onChange={set('steps')} placeholder="Steps, or the numbers you entered. Use made-up or anonymised numbers." />
        </label>
        <label className="field">
          <span>Browser and device</span>
          <input value={f.device} onChange={set('device')} />
        </label>
      </div>
      {tried && missing && <p className="form-error" role="alert">Please choose the kind of problem and say what went wrong.</p>}
      <div className="submit-actions">
        <button type="button" className="btn accent" onClick={open}>Open the report on GitHub</button>
        <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy the report'}</button>
      </div>
      {tooLong && !missing && <p className="muted small-print">This report is long, so GitHub will open the blank form; copy the report first and paste it in.</p>}
    </section>
  );
}
