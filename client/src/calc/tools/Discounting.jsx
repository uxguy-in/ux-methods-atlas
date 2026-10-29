import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as B from './behaviour.js';
import { Area, Choice, Result, Stats, Problem, About, num, pct, sig } from './ui.jsx';

// Questions in the style of Kirby's Monetary Choice Questionnaire: £now, £later, days, and the answer.
const QS = [[54, 55, 117], [55, 75, 61], [19, 25, 53], [31, 85, 7], [14, 25, 19], [47, 50, 160], [15, 35, 13], [25, 60, 14], [78, 80, 192], [40, 55, 62], [11, 30, 7], [67, 75, 119]];
const pick = (k) => QS.map(([s, l, d]) => `${s} ${l} ${d} ${B.kIndiff(s, l, d) > k ? 'later' : 'sooner'}`);
const CHOICE_SAMPLE = `# participant  now  later  days  choice\n${pick(0.006).map((l) => `P1 ${l}`).join('\n')}\n${pick(0.04).map((l, i) => `P2 ${i === 3 ? l.replace('later', 'sooner') : l}`).join('\n')}\n${pick(0.0015).map((l) => `P3 ${l}`).join('\n')}`;
const POINTS_SAMPLE = `# delay (days)  value as a share of the amount
1 0.95
7 0.82
30 0.6
90 0.38
180 0.27
365 0.16`;

function CurvePlot({ k, pts, kExp }) {
  const W = 520, H = 240, L = 46, R = 14, T = 12, B = 36;
  const Dm = Math.max(...pts.map((p) => p[0]), 30);
  const sx = (d) => L + (d / Dm) * (W - L - R), sy = (v) => T + (1 - v) * (H - T - B);
  const xs = Array.from({ length: 101 }, (_, i) => (i / 100) * Dm);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot" role="img" aria-label={`Discounting curve with k ${sig(k)}`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="q ok" />
      {[0, 0.5, 1].map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} style={{ stroke: 'var(--line)' }} /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{pct(v)}</text></g>)}
      {[0, Dm / 2, Dm].map((d) => <text key={d} x={sx(d)} y={H - B + 15} className="ax" textAnchor="middle">{Math.round(d)}</text>)}
      {Number.isFinite(kExp) && <polyline points={xs.map((d) => `${sx(d)},${sy(Math.exp(-kExp * d))}`).join(' ')} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 1.5, strokeDasharray: '5 4' }} />}
      <polyline points={xs.map((d) => `${sx(d)},${sy(1 / (1 + k * d))}`).join(' ')} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2.5 }} />
      {pts.map(([d, v]) => <circle key={`${d}-${v}`} cx={sx(d)} cy={sy(v)} r={4} className="dot" />)}
      <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Delay (days)</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Value today</text>
    </svg>
  );
}

// ── Hyperbolic discounting ──
function Discounting() {
  const [mode, setMode] = useState('choices');
  const [text, setText] = useState(CHOICE_SAMPLE);
  const [pts, setPts] = useState(POINTS_SAMPLE);
  const parsed = useMemo(() => B.parseLabelled(text, 4), [text]);
  const people = useMemo(() => {
    const by = new Map();
    parsed.rows.forEach((r) => { const [S, L, D, later] = r.vals; if (S > 0 && L > S && D > 0 && (later === 0 || later === 1)) { const k = r.label || 'All'; if (!by.has(k)) by.set(k, []); by.get(k).push({ S, L, D, later }); } });
    return [...by.entries()].map(([id, qs]) => ({ id, ...B.kirbyK(qs) }));
  }, [parsed]);
  const points = useMemo(() => B.parseLabelled(pts, 2).rows.map((r) => [r.vals[0], r.vals[1] > 1 ? r.vals[1] / 100 : r.vals[1]]).filter(([d, v]) => d >= 0 && v >= 0), [pts]);
  const fit = points.length >= 2 ? B.fitDiscount(points) : null;
  const fitE = points.length >= 2 ? B.fitDiscount(points, 'exponential') : null;
  const auc = points.length >= 2 ? B.discountAuc(points) : NaN;
  const logs = people.map((p) => Math.log(p.k)).sort((a, b) => a - b);
  const medK = people.length ? Math.exp(logs.length % 2 ? logs[(logs.length - 1) / 2] : (logs[logs.length / 2 - 1] + logs[logs.length / 2]) / 2) : NaN;
  const sum = mode === 'choices' ? (people.length ? B.discountSummary({ k: medK, mode, consistency: Math.min(...people.map((p) => p.consistency)), n: Math.min(...people.map((p) => p.n)), people: people.length }) : null)
    : fit ? B.discountSummary({ k: fit.k, mode, r2: fit.r2, n: points.length, auc }) : null;
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Your data" value={mode} onChange={setMode} options={[['choices', 'Sooner-or-later choices'], ['points', 'Indifference points']]} />
        {mode === 'choices' ? <Area label="One choice per line: amount now, amount later, delay in days, and which they chose" value={text} onChange={setText} rows={9} hint="Write later or sooner (or 1 / 0) for the answer. Start a line with a participant id to score several people." />
          : <Area label="One point per line: delay in days and what the delayed amount is worth today, as a share (0.6) or a percentage (60)" value={pts} onChange={setPts} rows={7} hint="From an adjusting-amount task: the immediate amount a person takes instead of the full amount after the delay." />}
      </div>
      {mode === 'choices' ? (!people.length ? <Problem>Enter choices where the later amount is larger than the sooner one.</Problem> : (
        <>
          <Result big={`k = ${sig(medK)}`} label={people.length > 1 ? `Median discount rate per day, ${people.length} participants` : 'Discount rate per day'}>
            <p>A reward 30 days away is worth {pct(1 / (1 + 30 * medK))} of its value; value halves after {Math.round(1 / medK)} days.</p>
          </Result>
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Participant</th><th>Questions</th><th>Chose later</th><th>k per day</th><th>ln k</th><th>Consistency</th><th>Worth after 30 days</th></tr></thead>
            <tbody>{people.map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.n}</td><td>{pct(p.laterShare)}</td><td>{sig(p.k)}</td><td>{num(Math.log(p.k))}</td><td><span className={`qtag ${p.consistency >= 0.9 ? 'promote' : p.consistency >= 0.75 ? '' : 'fix'}`}>{pct(p.consistency)}</span></td><td>{pct(1 / (1 + 30 * p.k))}</td></tr>)}</tbody>
          </table></div>
        </>
      )) : (!fit ? <Problem>Enter at least two delay and value pairs.</Problem> : (
        <>
          <Result big={`k = ${sig(fit.k)}`} label="Hyperbolic discount rate per day, least-squares fit">
            <CurvePlot k={fit.k} pts={points} kExp={fitE.k} />
            <p>Solid line: hyperbola V = 1/(1 + kD). Dashed: the exponential V = e^(−kD), for comparison.</p>
          </Result>
          <Stats rows={[['Hyperbolic k', `${sig(fit.k)} per day`], ['Hyperbolic R²', num(fit.r2, 3)], ['Exponential k', `${sig(fitE.k)} per day`], ['Exponential R²', num(fitE.r2, 3)], ['Area under the curve', num(auc, 3)], ['Half-life 1/k', `${Math.round(1 / fit.k)} days`]]} />
        </>
      ))}
      {sum && <StudySummary {...sum} />}
      <About method="risk-and-time-preference-elicitation-holt-laury-and-discounting-tasks" links={[['behavioural-economics-analysis', 'Behavioural economics analysis'], ['prospect-theory-application', 'Prospect theory']]}>
        <p>Delay discounting measures how much a reward loses value the longer people must wait for it. Mazur's hyperbola V = A / (1 + kD) fits human choices better than exponential discounting; k is the discount rate per day, and 1/k is the delay at which a reward is worth half as much. In UX it helps with anything that asks for effort now for a benefit later: onboarding, saving, setting up automation, annual plans.</p>
        <p><b>Choices.</b> A choice between S now and L after D days is a tie for someone whose k = (L/S − 1) / D. Following Kirby, Petry and Bickel (1999), each person's k is the value most consistent with all their choices (choosing the later reward when their k is below the question's), using geometric midpoints between the questions' k values and the geometric mean when several fit equally well. Consistency is the share of choices that value explains. Because k is spread on a log scale, the median (not the mean) is used across people.</p>
        <p><b>Indifference points.</b> The hyperbola and the exponential are fitted to the points by least squares (golden-section search on ln k), matching scipy.optimize.curve_fit. The area under the curve (Myerson, Green and Warusawitharana 2001) scales delays and values to 0–1, starts at (0, 1) and adds trapezoids: 1 means no discounting.</p>
      </About>
    </>
  );
}

export default Discounting;
