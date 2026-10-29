import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as B from './behaviour.js';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, sig, n_ } from './ui.jsx';

const CONST_SAMPLE = `# comparison delay (ms)  judged slower  trials
200 2 40
220 6 40
240 13 40
260 22 40
280 29 40
300 35 40
320 38 40`;
const WEBER_SAMPLE = `# standard  JND
100 9
200 17
400 37
800 70`;

function PsychPlot({ levels, fit, S }) {
  const W = 520, H = 240, L = 46, R = 14, T = 12, BOT = 36;
  const x0 = Math.min(...levels.map((l) => l.x)), x1 = Math.max(...levels.map((l) => l.x));
  const pad = (x1 - x0) * 0.08, a = x0 - pad, b = x1 + pad;
  const sx = (x) => L + ((x - a) / (b - a)) * (W - L - R), sy = (p) => T + (1 - p) * (H - T - BOT);
  const xs = Array.from({ length: 101 }, (_, i) => a + (i / 100) * (b - a));
  const P = (x) => B.normCdfAccurate(fit.a + fit.b * x);
  const x25 = fit.pse - fit.jnd, x75 = fit.pse + fit.jnd;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot" role="img" aria-label={`Psychometric function with PSE ${sig(fit.pse)} and JND ${sig(fit.jnd)}`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - BOT} className="q ok" />
      {[0, 0.25, 0.5, 0.75, 1].map((p) => <g key={p}><line x1={L} x2={W - R} y1={sy(p)} y2={sy(p)} style={{ stroke: 'var(--line)' }} /><text x={L - 6} y={sy(p) + 4} className="ax" textAnchor="end">{pct(p)}</text></g>)}
      <rect x={sx(x25)} y={T} width={Math.max(0, sx(x75) - sx(x25))} height={H - T - BOT} style={{ fill: 'color-mix(in srgb, var(--c4) 16%, transparent)' }} />
      {Number.isFinite(S) && S >= a && S <= b && <line x1={sx(S)} x2={sx(S)} y1={T} y2={H - BOT} style={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }} />}
      <polyline points={xs.map((x) => `${sx(x)},${sy(P(x))}`).join(' ')} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2.5 }} />
      {levels.map((l) => <circle key={l.x} cx={sx(l.x)} cy={sy(l.k / l.n)} r={4.5} className="dot" />)}
      <text x={sx(fit.pse) + 6} y={sy(0.5) - 6} className="dl">PSE {sig(fit.pse)}</text>
      {[x0, (x0 + x1) / 2, x1].map((x) => <text key={x} x={sx(x)} y={H - BOT + 15} className="ax" textAnchor="middle">{sig(x)}</text>)}
      <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Comparison level (shaded: 25% to 75%, two JNDs wide)</text>
    </svg>
  );
}

// ── Just noticeable difference ──
function WeberJND() {
  const [mode, setMode] = useState('constant');
  const [text, setText] = useState(CONST_SAMPLE);
  const [std, setStd] = useState('250');
  const [unit, setUnit] = useState(' ms');
  const [wtext, setWtext] = useState(WEBER_SAMPLE);
  const levels = useMemo(() => B.parseLabelled(text, 3).rows.map((r) => ({ x: r.vals[0], k: r.vals[1], n: r.vals[2] })).filter((l) => l.n > 0 && l.k >= 0 && l.k <= l.n), [text]);
  const S = n_(std);
  const spread = levels.length >= 3 && levels.some((l) => l.k / l.n < 0.5) && levels.some((l) => l.k / l.n > 0.5);
  const fit = useMemo(() => (spread ? B.probit(levels) : null), [levels, spread]);
  const wrows = useMemo(() => B.parseLabelled(wtext, 2).rows.map((r) => ({ S: r.vals[0], J: r.vals[1] })).filter((r) => r.S > 0 && r.J > 0), [wtext]);
  const wf = wrows.length >= 2 ? B.weberFit(wrows) : null;
  const okFit = fit && fit.b > 0 && S > 0;
  const sum = mode === 'constant' ? (okFit ? B.weberSummary({ mode, S, fit, levels, unit }) : null) : wf ? B.weberSummary({ mode: 'weber', wf }) : null;
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Your data" value={mode} onChange={setMode} options={[['constant', 'Judgements at one standard'], ['weber', 'JNDs at several standards']]} />
        {mode === 'constant' ? <>
          <Area label="One comparison level per line: level, times judged greater than the standard, trials" value={text} onChange={setText} rows={8} hint="Method of constant stimuli: each comparison is shown with the standard and people say which is bigger, slower, louder or more expensive." />
          <Num label="Standard (S)" value={std} onChange={setStd} step="any" />
          <label className="calc-field"><span>Unit</span><input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 90 }} /></label>
        </> : <Area label="One standard per line: the standard and its measured JND" value={wtext} onChange={setWtext} rows={6} hint="From staircases or constant-stimuli fits at several levels, in the same unit." />}
      </div>
      {mode === 'constant' ? (!spread ? <Problem>Enter at least three levels, with some judged greater less than half the time and some more than half.</Problem> : !okFit ? <Problem>The fitted curve slopes downwards or the standard is missing; check that the counts are "judged greater".</Problem> : (
        <>
          <Result big={`JND ≈ ${sig(fit.jnd)}${unit}`} label={`Weber fraction ${pct(fit.jnd / S, 1)} at a standard of ${sig(S)}${unit}`}>
            <PsychPlot levels={levels} fit={fit} S={S} />
          </Result>
          <Stats rows={[['JND = 0.674 σ', `${sig(fit.jnd, 4)}${unit}`], ['Weber fraction JND / S', num(fit.jnd / S, 4)], ['Point of subjective equality', `${sig(fit.pse, 4)}${unit}`], ['Constant error PSE − S', `${sig(fit.pse - S, 3)}${unit}`], ['σ of the cumulative normal', sig(fit.sigma, 4)], ['Probit fit', `a = ${num(fit.a, 4)}, b = ${num(fit.b, 5)}${fit.converged ? '' : ' (not converged)'}`]]} />
        </>
      )) : (!wf ? <Problem>Enter at least two standards with their JNDs.</Problem> : (
        <>
          <Result big={`k = ${num(wf.k, 3)}`} label="Weber fraction: JND = k × standard">
            <p>Ratios JND / S: {wf.ratios.map((r) => num(r, 3)).join(', ')}. Coefficient of variation {pct(wf.cv)}.</p>
          </Result>
        </>
      ))}
      {sum && <StudySummary {...sum} />}
      <About method="just-noticeable-difference-and-weber-fraction-testing" links={[['psychophysical-threshold-methods-jnd', 'Psychophysical threshold methods'], ['magnitude-estimation-and-stevens-power-law', "Magnitude estimation and Stevens' law"], ['signal-detection-theory', 'Signal detection theory']]}>
        <p>The just noticeable difference (JND) is the smallest change people can reliably detect. Weber's law says it is a constant fraction of the starting level: JND = k × S. In UX it tells you how big a change must be to be noticed (a speed improvement, a price drop, a size change) and how small an unwanted change must stay to go unnoticed.</p>
        <p><b>One standard.</b> With the method of constant stimuli, each comparison level x is judged against the standard n times, k of them as "greater". The calculator fits a cumulative normal, P(greater) = Φ(a + b·x), by maximum likelihood (a probit model, Fisher scoring, matching statsmodels' binomial GLM with a probit link). The point of subjective equality is where P = 50%, PSE = −a/b; σ = 1/b; and the JND is half the distance between the 25% and 75% points, 0.6745 σ. The Weber fraction is JND / S.</p>
        <p><b>Several standards.</b> k is fitted by least squares through the origin, k = Σ S·JND / Σ S², and the coefficient of variation of the individual ratios shows how constant the fraction is. Weber's law usually holds in the middle of a range and fails near the extremes.</p>
      </About>
    </>
  );
}

export default WeberJND;
