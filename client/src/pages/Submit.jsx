import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeta } from '../hooks.js';
import { REPO_URL, SUBMIT_URL } from '../vocab.js';

const EMPTY = {
  kind: 'community', name: '', aka: '', family: '', summary: '', description: '', steps: '',
  useWhen: '', avoidWhen: '', origin: '', reference: '', tested: 'untested', evidence: '', proposer: '',
};
const REQUIRED = { name: 'a name', summary: 'a one-line summary', description: 'a description' };
// GitHub rejects very long prefilled URLs, so longer submissions fall back to the issue form or copied text.
const MAX_URL = 7500;

function toMarkdown(f) {
  const sec = (h, v) => (v.trim() ? `### ${h}\n\n${v.trim()}\n\n` : '');
  const steps = f.steps.split('\n').map((s) => s.trim()).filter(Boolean).map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`).join('\n');
  return (
    sec('Type', f.kind === 'community' ? 'New community-proposed framework' : 'Existing method missing from the atlas') +
    sec('Also known as', f.aka) +
    sec('Discipline', f.family) +
    sec('Summary', f.summary) +
    sec('What it is', f.description) +
    sec('How to do it', steps) +
    sec('Use it when', f.useWhen) +
    sec('Avoid it when', f.avoidWhen) +
    sec('Origin', f.origin) +
    sec('Key reference or source', f.reference) +
    (f.kind === 'community' ? sec('Tested?', f.tested === 'tested' ? 'Tested' : 'Not yet tested') + sec('Evidence of testing', f.evidence) : '') +
    sec('Proposed by', f.proposer)
  ).trim();
}

export default function Submit() {
  const { data: meta } = useMeta();
  const [f, setF] = useState(EMPTY);
  const [tried, setTried] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setCopied(false); };

  const missing = Object.keys(REQUIRED).filter((k) => !f[k].trim());
  const body = useMemo(() => toMarkdown(f), [f]);
  const title = `Method submission: ${f.name.trim()}`;
  const issueUrl = `${REPO_URL}/issues/new?${new URLSearchParams({ title, body, labels: 'method-submission' })}`;
  const tooLong = issueUrl.length > MAX_URL;

  const open = () => {
    setTried(true);
    if (missing.length) return;
    window.open(tooLong ? SUBMIT_URL : issueUrl, '_blank', 'noopener');
  };
  const copy = async () => {
    setTried(true);
    if (missing.length) return;
    try { await navigator.clipboard.writeText(`${title}\n\n${body}`); setCopied(true); } catch { setCopied(false); }
  };
  const err = (k) => tried && !f[k].trim();

  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <p className="eyebrow">Community</p>
          <h1 className="h1">Submit a method.</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            Know a method the atlas is missing, or have you built a framework of your own? Describe it here. Each submission
            becomes a public GitHub issue that is reviewed before it is added. New frameworks are listed as
            community-proposed and marked <b>tested</b> or <b>not yet tested</b>.
          </p>
        </div>
      </section>
      <section className="section tight"><div className="wrap submit-form">
        <form onSubmit={(e) => { e.preventDefault(); open(); }} noValidate>
          <fieldset className="field">
            <legend>What are you submitting?</legend>
            <label className="radio"><input type="radio" name="kind" value="community" checked={f.kind === 'community'} onChange={set('kind')} /> A new framework I or someone in the community proposed</label>
            <label className="radio"><input type="radio" name="kind" value="existing" checked={f.kind === 'existing'} onChange={set('kind')} /> An established method the atlas is missing</label>
          </fieldset>

          <label className="field">
            <span>Method name <em>required</em></span>
            <input className={err('name') ? 'invalid' : ''} value={f.name} onChange={set('name')} placeholder="For example, Error-opportunity rate" />
          </label>
          <label className="field">
            <span>Also known as</span>
            <input value={f.aka} onChange={set('aka')} placeholder="Other names, separated by commas" />
          </label>
          <label className="field">
            <span>Discipline</span>
            <select className="select" value={f.family} onChange={set('family')}>
              <option value="">Not sure</option>
              {(meta?.families || []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>One-line summary <em>required</em></span>
            <input className={err('summary') ? 'invalid' : ''} value={f.summary} onChange={set('summary')} maxLength={240} placeholder="What it does, in one sentence" />
          </label>
          <label className="field">
            <span>What it is <em>required</em></span>
            <textarea className={err('description') ? 'invalid' : ''} rows={6} value={f.description} onChange={set('description')} placeholder="How it works and why it is useful" />
          </label>
          <label className="field">
            <span>How to do it</span>
            <textarea rows={5} value={f.steps} onChange={set('steps')} placeholder="One step per line" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Use it when</span>
              <textarea rows={3} value={f.useWhen} onChange={set('useWhen')} />
            </label>
            <label className="field">
              <span>Avoid it when</span>
              <textarea rows={3} value={f.avoidWhen} onChange={set('avoidWhen')} />
            </label>
          </div>
          <label className="field">
            <span>Origin</span>
            <input value={f.origin} onChange={set('origin')} placeholder="Who created it, where and when" />
          </label>
          <label className="field">
            <span>Key reference or source</span>
            <input value={f.reference} onChange={set('reference')} placeholder="Book, paper, article or link" />
          </label>

          {f.kind === 'community' && (
            <>
              <fieldset className="field">
                <legend>Has it been tested?</legend>
                <label className="radio"><input type="radio" name="tested" value="untested" checked={f.tested === 'untested'} onChange={set('tested')} /> Not yet tested</label>
                <label className="radio"><input type="radio" name="tested" value="tested" checked={f.tested === 'tested'} onChange={set('tested')} /> Tested: it has been used beyond the person who proposed it, with results</label>
              </fieldset>
              {f.tested === 'tested' && (
                <label className="field">
                  <span>Evidence of testing</span>
                  <textarea rows={3} value={f.evidence} onChange={set('evidence')} placeholder="Studies, case studies or projects where it was used, and what happened" />
                </label>
              )}
            </>
          )}

          <label className="field">
            <span>Proposed by</span>
            <input value={f.proposer} onChange={set('proposer')} placeholder="Name to credit (optional)" />
            <small>Submissions are public, so leave out email addresses and phone numbers.</small>
          </label>

          {tried && missing.length > 0 && (
            <p className="form-error" role="alert">Please add {missing.map((k) => REQUIRED[k]).join(', ')}.</p>
          )}
          <div className="submit-actions">
            <button type="submit" className="btn accent">Open as a GitHub issue</button>
            <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy as text'}</button>
          </div>
          <p className="muted small-print">
            {tooLong
              ? 'This submission is long, so the button opens the blank submission form. Copy the text first and paste it in.'
              : 'You need a free GitHub account to post the issue. No account? Copy the text and send it to the UX Brighton organisers.'}
          </p>
        </form>
        <aside className="aside-box">
          <h3>What happens next</h3>
          <ol className="plain-list">
            <li>Your submission is posted as an issue on the <a href={REPO_URL} target="_blank" rel="noreferrer">project on GitHub</a>.</li>
            <li>A maintainer checks it is not already in the atlas and asks questions there if needed.</li>
            <li>Accepted methods are added with credit. New frameworks start as not yet tested.</li>
            <li>A framework moves to tested once there is evidence of use beyond the person who proposed it.</li>
          </ol>
          <p style={{ margin: '14px 0 0' }}><Link to="/methods?status=community">See community-proposed frameworks</Link></p>
        </aside>
      </div></section>
    </>
  );
}
