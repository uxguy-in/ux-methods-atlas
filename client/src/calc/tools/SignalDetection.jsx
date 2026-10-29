import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as B from './behaviour.js';
import { Area, Choice, Result, Stats, Problem, About, num, pct } from './ui.jsx';

const SDT_SAMPLE = `# participant  hits  misses  false-alarms  correct-rejections
P1 18 2 6 14
P2 15 5 3 17
P3 19 1 9 11
P4 12 8 2 18
P5 17 3 5 15
P6 20 0 7 13`;

// Signal and noise distributions with the criterion, for the mean d′ and c.
function SdtPlot({ d, c }) {
  const W = 520, H = 220, L = 20, R = 20, T = 14, B = 34;
  const x0 = Math.min(-3.5, d - 3.5) , x1 = Math.max(3.5, d + 3.5);
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R), sy = (y) => T + (1 - y / 0.42) * (H - T - B);
  const pdf = (x, m) => Math.exp(-((x - m) ** 2) / 2) / Math.sqrt(2 * Math.PI);
  const xs = Array.from({ length: 161 }, (_, i) => x0 + (i / 160) * (x1 - x0));
  const crit = d / 2 + c;
  const line = (m) => xs.map((x) => `${sx(x)},${sy(pdf(x, m))}`).join(' ');
  const area = (m, from) => { const pts = xs.filter((x) => x >= from); return `${sx(from)},${sy(0)} ${pts.map((x) => `${sx(x)},${sy(pdf(x, m))}`).join(' ')} ${sx(x1)},${sy(0)}`; };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot" role="img" aria-label={`Noise and signal distributions ${num(d)} standard deviations apart, criterion at ${num(crit)}`}>
      <polygon points={area(0, crit)} style={{ fill: 'color-mix(in srgb, var(--bad) 25%, transparent)' }} />
      <polygon points={area(d, crit)} style={{ fill: 'color-mix(in srgb, var(--ok) 22%, transparent)' }} />
      <polyline points={line(0)} style={{ fill: 'none', stroke: 'var(--ink-3)', strokeWidth: 2 }} />
      <polyline points={line(d)} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2.5 }} />
      <line x1={sx(crit)} x2={sx(crit)} y1={T} y2={H - B} style={{ stroke: 'var(--accent)', strokeWidth: 2, strokeDasharray: '5 4' }} />
      <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} style={{ stroke: 'var(--line)' }} />
      <text x={sx(0)} y={sy(0.4) - 2} className="ax" textAnchor="middle">noise</text>
      <text x={sx(d)} y={sy(0.4) - 2} className="ax" textAnchor="middle">signal</text>
      <text x={sx(crit) + 6} y={T + 12} className="dl">criterion: say “yes” to the right</text>
      <text x={W / 2} y={H - 8} className="ax" textAnchor="middle">Strength of evidence (green: hits, red: false alarms)</text>
    </svg>
  );
}

// ── Signal detection ──
function SignalDetection() {
  const [text, setText] = useState(SDT_SAMPLE);
  const [corr, setCorr] = useState('loglinear');
  const [signal, setSignal] = useState('the warning');
  const p = useMemo(() => B.parseLabelled(text, 4), [text]);
  const rows = p.rows.filter((r) => r.vals.slice(0, 4).every((v) => Number.isInteger(v) && v >= 0) && r.vals[0] + r.vals[1] > 0 && r.vals[2] + r.vals[3] > 0)
    .map((r, i) => ({ label: r.label || `Row ${i + 1}`, ...B.sdt(r.vals[0], r.vals[1], r.vals[2], r.vals[3], corr) }));
  const sum = rows.length ? B.sdtSummary(rows, { signal }) : null;
  const md = rows.length ? rows.reduce((s, r) => s + r.d, 0) / rows.length : NaN, mc = rows.length ? rows.reduce((s, r) => s + r.c, 0) / rows.length : NaN;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One participant or condition per line: hits, misses, false alarms, correct rejections" value={text} onChange={setText} rows={7}
          hint="A label first is optional. Hits: signal present and they said yes. Misses: present, said no. False alarms: absent, said yes. Correct rejections: absent, said no." />
        <Choice label="Correction for 0% and 100%" value={corr} onChange={setCorr} options={[['loglinear', 'Log-linear (recommended)'], ['half', '1/(2N) when needed'], ['none', 'None']]} />
        <label className="calc-field"><span>What is the signal?</span><input type="text" value={signal} onChange={(e) => setSignal(e.target.value)} style={{ width: 220 }} /></label>
      </div>
      {p.bad.length + (p.rows.length - rows.length) > 0 && <Problem>Skipped {p.bad.length + p.rows.length - rows.length} line(s): each needs four whole numbers, with at least one signal and one noise trial.</Problem>}
      {!rows.length ? <Problem>Enter at least one line of counts.</Problem> : (
        <>
          <Result big={`d′ = ${num(md)}`} label={`${rows.length > 1 ? `Mean of ${rows.length}` : 'Sensitivity'}, with criterion c = ${num(mc)}`} tone={md >= 1 ? 'good' : md < 0.5 ? 'bad' : ''}>
            {Number.isFinite(md) && Number.isFinite(mc) && <SdtPlot d={Math.max(-3, Math.min(5, md))} c={Math.max(-3, Math.min(3, mc))} />}
          </Result>
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Participant</th><th>Hit rate</th><th>False-alarm rate</th><th>d′</th><th>c</th><th>β</th><th>A′</th><th>B″</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{pct(r.H, 1)}</td><td>{pct(r.F, 1)}</td><td>{num(r.d)}</td><td>{num(r.c)}</td><td>{num(r.beta)}</td><td>{num(r.A)}</td><td>{num(r.B)}</td></tr>)}</tbody>
          </table></div>
          <Stats rows={[['Mean d′', num(md, 3)], ['Mean c', num(mc, 3)], ['Rates shown', corr === 'none' ? 'raw' : 'after correction']]} />
          {corr === 'none' && rows.some((r) => !Number.isFinite(r.d)) && <Problem>Some rates are 0% or 100%, so d′ is infinite. Use a correction.</Problem>}
        </>
      )}
      {sum && <StudySummary {...sum} />}
      <About method="signal-detection-theory" links={[['psychophysical-threshold-methods-jnd', 'Psychophysical thresholds'], ['free-recall-and-recognition-testing', 'Recall and recognition testing']]}>
        <p>Signal detection theory (Green and Swets 1966) separates two things that a plain error rate mixes up: how well people can tell a signal from noise (sensitivity) and how willing they are to say "yes" (bias). Typical UX uses: noticing a warning or a badge, spotting phishing emails, recognising a brand or a feature in a memory test, or reviewers flagging defects.</p>
        <p>With hit rate H and false-alarm rate F: d′ = z(H) − z(F), where z is the inverse of the standard normal distribution; c = −(z(H) + z(F)) / 2, positive when people are cautious; β = exp(c · d′), the likelihood ratio at the criterion. A′ and B″ (Grier 1971) are the nonparametric versions, following Stanislaw and Todorov (1999). Rates of 0 or 1 make z infinite, so the log-linear correction (Hautus 1995) adds 0.5 to every count and 1 to every total for all participants; the 1/(2N) rule (Macmillan and Kaplan 1985) changes only extreme rates. The check script reproduces Stanislaw and Todorov's worked example (H = .9332, F = .3085: d′ = 2.00, c = −0.50, β = 0.37, A′ = .89, B″ = −0.55) and scipy's norm.ppf.</p>
        <p>d′ assumes the signal and noise distributions are normal with equal variance. If that fails (it often does in memory tasks), collect confidence ratings and fit an ROC curve.</p>
      </About>
    </>
  );
}

export default SignalDetection;
