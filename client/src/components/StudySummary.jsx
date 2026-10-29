import { useState } from 'react';
import { Link } from 'react-router-dom';

// Plain-language reading of a calculator result, shared by every calculator.
// headline: one sentence on what happened. meaning: short points on what it means.
// confidence: 'high' | 'medium' | 'low', with confidenceNote saying why.
// caveats: common misreadings. next: what to do next. report: a sentence or two to paste into a report.
// Text items may contain site links written as [label](/calculators/id) or [label](/methods/id); they become router links.
// Items that are not strings (React nodes) are rendered as they are.
const SURE = { high: 'Strong evidence', medium: 'Some evidence', low: 'Weak evidence' };
const LINK = /\[([^\]]+)\]\((\/[a-z0-9\-/]+)\)/g;

function Rich({ text }) {
  if (typeof text !== 'string') return text;
  const out = []; let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Link key={m.index} to={m[2]}>{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
// The report is plain text for pasting, so any link markup is reduced to its label.
const plain = (s) => (typeof s === 'string' ? s.replace(LINK, '$1') : s);

export default function StudySummary({ headline, meaning = [], confidence, confidenceNote, next = [], report, caveats = [] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(plain(report)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); } catch { /* clipboard blocked */ }
  };
  return (
    <section className="study-summary" aria-label="Reading your results">
      <div className="eyebrow">Reading your results</div>
      {headline && <p className="ss-headline"><Rich text={headline} /></p>}
      {meaning.length > 0 && (
        <>
          <h4>What it means</h4>
          <ul>{meaning.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
        </>
      )}
      {confidence && (
        <>
          <h4>How sure you can be</h4>
          <p><span className={`ss-sure ss-${confidence}`}>{SURE[confidence]}</span> <Rich text={confidenceNote} /></p>
        </>
      )}
      {caveats.length > 0 && (
        <>
          <h4>Watch out for</h4>
          <ul>{caveats.map((c, i) => <li key={i}><Rich text={c} /></li>)}</ul>
        </>
      )}
      {next.length > 0 && (
        <>
          <h4>What to do next</h4>
          <ul>{next.map((n, i) => <li key={i}><Rich text={n} /></li>)}</ul>
        </>
      )}
      {report && (
        <>
          <h4>For your report</h4>
          <blockquote className="ss-report">{plain(report)}</blockquote>
          <button type="button" className="btn ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy for report'}</button>
        </>
      )}
    </section>
  );
}
