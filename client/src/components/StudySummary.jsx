import { useState } from 'react';

// Plain-language reading of a calculator result, shared by every calculator.
// headline: one sentence on what happened. meaning: short points on what it means.
// confidence: 'high' | 'medium' | 'low', with confidenceNote saying why.
// next: what to do next. report: a sentence or two to paste into a report.
const SURE = { high: 'Strong evidence', medium: 'Some evidence', low: 'Weak evidence' };

export default function StudySummary({ headline, meaning = [], confidence, confidenceNote, next = [], report, caveats = [] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try { navigator.clipboard.writeText(report).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); } catch { /* clipboard blocked */ }
  };
  return (
    <section className="study-summary" aria-label="Reading your results">
      <div className="eyebrow">Reading your results</div>
      {headline && <p className="ss-headline">{headline}</p>}
      {meaning.length > 0 && (
        <>
          <h4>What it means</h4>
          <ul>{meaning.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      )}
      {confidence && (
        <>
          <h4>How sure you can be</h4>
          <p><span className={`ss-sure ss-${confidence}`}>{SURE[confidence]}</span> {confidenceNote}</p>
        </>
      )}
      {caveats.length > 0 && (
        <>
          <h4>Watch out for</h4>
          <ul>{caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}
      {next.length > 0 && (
        <>
          <h4>What to do next</h4>
          <ul>{next.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {report && (
        <>
          <h4>For your report</h4>
          <blockquote className="ss-report">{report}</blockquote>
          <button type="button" className="btn ghost small" onClick={copy}>{copied ? 'Copied' : 'Copy for report'}</button>
        </>
      )}
    </section>
  );
}
