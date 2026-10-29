import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as B from './behaviour.js';
import { Area, Result, Problem, About, num, pct } from './ui.jsx';

// Example: three people answering 50/50 gambles (win G or lose L), simulated with λ of about 1.6, 2.2 and 1.1.
const LOSS_SAMPLE = (() => {
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lines = ['# participant  gain  loss  answer'];
  [['P1', 1.6], ['P2', 2.2], ['P3', 1.1]].forEach(([id, lam]) => {
    for (const L of [4, 6, 8, 10]) for (const G of [4, 6, 8, 10, 12, 16, 20, 24]) {
      const u = 0.5 * G - 0.5 * lam * L + (rnd() - 0.5) * 2.4;
      lines.push(`${id} ${G} ${L} ${u > 0 ? 'accept' : 'reject'}`);
    }
  });
  return lines.join('\n');
})();

function GamblePlot({ trials, lambda }) {
  const W = 420, H = 260, L = 46, R = 14, T = 14, B = 38;
  const gMax = Math.max(...trials.map((t) => t.G)) * 1.08, lMax = Math.max(...trials.map((t) => t.L)) * 1.12;
  const sx = (l) => L + (l / lMax) * (W - L - R), sy = (g) => T + (1 - g / gMax) * (H - T - B);
  const lEnd = Math.min(lMax, gMax / lambda);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot" role="img" aria-label={`Accepted and rejected gambles with the line gain = ${num(lambda)} × loss`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="q ok" />
      <line x1={sx(0)} y1={sy(0)} x2={sx(lEnd)} y2={sy(lambda * lEnd)} style={{ stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '6 4' }} />
      {trials.map((t, i) => <circle key={i} cx={sx(t.L) + ((i % 3) - 1) * 3} cy={sy(t.G)} r={4} style={{ fill: t.accept ? 'var(--ok)' : 'var(--bad)', opacity: 0.75 }} />)}
      {[0, Math.round(lMax / 2), Math.round(lMax / 1.12)].map((v) => <text key={v} x={sx(v)} y={H - B + 15} className="ax" textAnchor="middle">{v}</text>)}
      {[0, Math.round(gMax / 2), Math.round(gMax / 1.08)].map((v) => <text key={v} x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{v}</text>)}
      <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Possible loss</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Possible gain</text>
      <text x={sx(lEnd) - 4} y={sy(lambda * lEnd) + 16} className="dl" textAnchor="end">gain = {num(lambda, 2)} × loss</text>
    </svg>
  );
}

// ── Loss aversion ──
function LossAversion() {
  const [text, setText] = useState(LOSS_SAMPLE);
  const parsed = useMemo(() => B.parseLabelled(text, 3), [text]);
  const people = useMemo(() => {
    const by = new Map();
    parsed.rows.forEach((r) => { const [G, L, a] = r.vals; if (G > 0 && L > 0 && (a === 0 || a === 1)) { const k = r.label || 'All'; if (!by.has(k)) by.set(k, []); by.get(k).push({ G, L, accept: a }); } });
    return [...by.entries()].filter(([, t]) => t.length >= 2).map(([id, trials]) => ({ id, trials, ...B.lossAversion(trials) }));
  }, [parsed]);
  const sum = people.length ? B.lossSummary(people) : null;
  const all = people.flatMap((p) => p.trials);
  const lams = people.map((p) => p.lambda).sort((a, b) => a - b);
  const med = lams.length ? (lams.length % 2 ? lams[(lams.length - 1) / 2] : (lams[lams.length / 2 - 1] + lams[lams.length / 2]) / 2) : NaN;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One 50/50 gamble per line: possible gain, possible loss, and whether they accepted" value={text} onChange={setText} rows={9}
          hint="Write accept or reject (or 1 / 0). Start a line with a participant id to score several people. Losses are positive amounts." />
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped line{parsed.bad.length > 1 ? 's' : ''} {parsed.bad.slice(0, 8).join(', ')}.</Problem>}
      {!people.length ? <Problem>Enter at least two gambles with positive gains and losses.</Problem> : (
        <>
          <Result big={`λ = ${num(med)}`} label={people.length > 1 ? `Median loss aversion, ${people.length} participants` : 'Loss aversion'} tone={med > 1.2 ? 'bad' : ''}>
            <GamblePlot trials={all} lambda={med} />
            <p>Green dots were accepted, red rejected. Above the dashed line the gain is more than λ times the loss, which is roughly where people start accepting.</p>
          </Result>
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Participant</th><th>Gambles</th><th>Accepted</th><th>λ (logistic)</th><th>λ (switch point)</th><th>Consistency</th><th>Used</th></tr></thead>
            <tbody>{people.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.n}</td><td>{pct(p.accepts / p.n)}</td><td>{p.logistic && p.logistic.ok ? num(p.logistic.lambda) : '—'}</td><td>{num(p.switch.lambda)}</td><td>{pct(p.switch.consistency)}</td><td>{p.method === 'logistic' ? 'Logistic' : 'Switch point'}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
      {sum && <StudySummary {...sum} />}
      <About method="loss-aversion-measurement" links={[['prospect-theory-application', 'Prospect theory'], ['behavioural-economics-analysis', 'Behavioural economics analysis'], ['reference-point-manipulation', 'Reference point manipulation']]}>
        <p>Loss aversion (Kahneman and Tversky 1979) is the finding that losing something hurts more than gaining the same thing pleases. λ says how many times more: with λ = 2, a loss of £10 is offset only by a gain of £20. It matters whenever a design takes something away (a feature, a discount, progress, a default) or frames a choice as avoiding a loss.</p>
        <p>The task: accept or reject a series of 50/50 gambles, win G or lose L. Following Tom, Fox, Trepel and Poldrack (2007), a logistic regression P(accept) = 1 / (1 + e<sup>−(b₀ + b<sub>G</sub>G + b<sub>L</sub>L)</sup>) is fitted by maximum likelihood (Newton-Raphson, matching statsmodels), and λ = −b<sub>L</sub> / b<sub>G</sub>. When the choices are perfectly consistent the logistic estimates run off to infinity, so the switch point is used instead: the ratio G/L that best separates accepted from rejected gambles (geometric midpoints between the ratios offered, the geometric mean over ties). Both are shown.</p>
        <p>λ measured this way also reflects risk attitude and depends on the stakes and the reference point; compare framings directly with an A/B test before relying on a single number.</p>
      </About>
    </>
  );
}

export default LossAversion;
