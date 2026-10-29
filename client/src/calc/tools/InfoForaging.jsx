import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as F from './foraging.js';
import { Area, Choice, Num, Result, Stats, Problem, About, Bars, num, pct, n_ } from './ui.jsx';

const PRESETS = {
  serp: { name: 'Search results page', place: 'results page', unit: 's', gainUnit: 'useful results', Tb: '15', G: '4', tau: '25', alt: '6', pts: '5 1\n10 1.8\n20 2.8\n30 3.3\n45 3.7\n60 3.9' },
  docs: { name: 'Documentation page', place: 'page', unit: 's', gainUnit: 'answers', Tb: '30', G: '3', tau: '60', alt: '10', pts: '15 0.8\n30 1.5\n60 2.2\n90 2.6\n120 2.8\n180 3' },
  probe: { name: 'Interview topic', place: 'topic', unit: 'min', gainUnit: 'insights', Tb: '1.5', G: '6', tau: '4', alt: '0.5', pts: '1 2\n2 3.3\n3 4.2\n5 5\n8 5.6\n12 5.9' },
};

function PatchPlot({ g, Tb, opt, tMax, unit, gainUnit, points }) {
  const W = 560, H = 290, L = 48, R = 16, T = 16, B = 40;
  const x0 = -Tb, x1 = tMax;
  const ts = Array.from({ length: 121 }, (_, i) => (i / 120) * tMax);
  const ys = points ? points.map((p) => p[1]) : ts.map(g);
  const yMax = Math.max(...ys, opt.gain) * 1.12 || 1;
  const sx = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R), sy = (v) => T + (1 - v / yMax) * (H - T - B);
  const curve = points ? points.map(([t, v]) => `${sx(t)},${sy(v)}`).join(' ') : ts.map((t) => `${sx(t)},${sy(g(t))}`).join(' ');
  const tEnd = Math.min(tMax, (yMax * 0.98) / opt.rate - Tb);
  const ticks = [0, tMax / 4, tMax / 2, (3 * tMax) / 4, tMax];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot" role="img" aria-label={`Gain curve with the optimal leaving time at ${num(opt.t, 1)} ${unit}`}>
      <rect x={L} y={T} width={W - L - R} height={H - T - B} className="q ok" />
      <line x1={sx(0)} x2={sx(0)} y1={T} y2={H - B} style={{ stroke: 'var(--ink-3)' }} />
      <line x1={sx(x0)} x2={sx(0)} y1={H - B + 1} y2={H - B + 1} style={{ stroke: 'var(--c2)', strokeWidth: 4 }} />
      <text x={(sx(x0) + sx(0)) / 2} y={H - B - 6} className="ax" textAnchor="middle">travel {num(Tb, 1)} {unit}</text>
      {[0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={sy(f * yMax / 1.12)} y2={sy(f * yMax / 1.12)} style={{ stroke: 'var(--line)' }} /><text x={L - 6} y={sy(f * yMax / 1.12) + 4} className="ax" textAnchor="end">{num(f * yMax / 1.12, 1)}</text></g>)}
      {ticks.map((t) => <text key={t} x={sx(t)} y={H - B + 16} className="ax" textAnchor="middle">{num(t, t < 10 ? 1 : 0)}</text>)}
      <polyline points={curve} style={{ fill: 'none', stroke: 'var(--c1)', strokeWidth: 2.5 }} />
      {points && points.map(([t, v]) => <circle key={t} cx={sx(t)} cy={sy(v)} r={3} style={{ fill: 'var(--c1)' }} />)}
      <line x1={sx(x0)} y1={sy(0)} x2={sx(tEnd)} y2={sy(opt.rate * (tEnd + Tb))} style={{ stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '6 4' }} />
      <line x1={sx(opt.t)} x2={sx(opt.t)} y1={sy(opt.gain)} y2={H - B} style={{ stroke: 'var(--accent)', strokeDasharray: '2 3' }} />
      <circle cx={sx(opt.t)} cy={sy(opt.gain)} r={6} className="dot" />
      <text x={sx(opt.t) + 8} y={sy(opt.gain) + 16} className="dl">leave at {num(opt.t, 1)} {unit}</text>
      <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Time in the patch ({unit})</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Cumulative {gainUnit}</text>
    </svg>
  );
}

function PatchMode() {
  const [preset, setPreset] = useState('serp');
  const P = PRESETS[preset];
  const [curve, setCurve] = useState('exp');
  const [Tb, setTb] = useState(P.Tb); const [G, setG] = useState(P.G); const [tau, setTau] = useState(P.tau); const [alt, setAlt] = useState(P.alt); const [pts, setPts] = useState(P.pts);
  const choose = (k) => { const p = PRESETS[k]; setPreset(k); setTb(p.Tb); setG(p.G); setTau(p.tau); setAlt(p.alt); setPts(p.pts); };
  const tb = n_(Tb), g0 = n_(G), ta = n_(tau), tbAlt = n_(alt);
  const points = useMemo(() => F.parsePoints(pts), [pts]);
  const bad = !(tb >= 0) || (curve === 'exp' ? !(g0 > 0 && ta > 0) : points.length < 2);
  const r = bad ? null : curve === 'exp' ? F.charnovExp(g0, ta, tb) : F.charnovPoints(points, tb);
  const altR = !bad && tbAlt >= 0 && tbAlt !== tb ? (curve === 'exp' ? F.charnovExp(g0, ta, tbAlt) : F.charnovPoints(points, tbAlt)) : null;
  const sum = r ? F.patchSummary(r, { Tb: tb, unit: P.unit, gainUnit: P.gainUnit, place: P.place, alt: altR ? { ...altR, Tb: tbAlt } : null }) : null;
  const tMax = curve === 'exp' ? Math.max(4 * ta, r ? r.t * 2 : 0) : Math.max(...points.map((p) => p[0]));
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Use case" value={preset} onChange={choose} options={Object.entries(PRESETS).map(([k, p]) => [k, p.name])} />
        <Choice label="Gain curve" value={curve} onChange={setCurve} options={[['exp', 'Diminishing returns'], ['points', 'My measured gains']]} />
        <Num label={`Time between ${P.place}s (Tb)`} value={Tb} onChange={setTb} min={0} step="any" suffix={P.unit} hint="Getting to the next one: searching, clicking, loading, switching topic." />
        {curve === 'exp' ? <>
          <Num label={`Total ${P.gainUnit} in a ${P.place} (G)`} value={G} onChange={setG} min={0} step="any" />
          <Num label="Time to get 63% of it (τ)" value={tau} onChange={setTau} min={0} step="any" suffix={P.unit} hint="g(t) = G(1 − e^(−t/τ)): steep at first, then levelling off." />
        </> : <Area label={`Cumulative ${P.gainUnit} by time in the ${P.place}: one "time gain" pair per line`} value={pts} onChange={setPts} rows={6} hint="From observation, think-aloud or coding: e.g. 30 3.3 means 3.3 useful items found after 30 seconds." />}
        <Num label={`Compare with a between-${P.place} time of`} value={alt} onChange={setAlt} min={0} step="any" suffix={P.unit} hint="A redesign that makes moving on faster or slower. Leave blank to skip." />
      </div>
      {bad ? <Problem>{curve === 'exp' ? 'Enter a travel time of 0 or more and positive G and τ.' : 'Enter at least two time and gain pairs.'}</Problem> : (
        <>
          <Result big={`${num(r.t, 1)} ${P.unit}`} label={`Optimal time per ${P.place}, by Charnov's marginal value theorem`}>
            <PatchPlot g={curve === 'exp' ? F.expGain(g0, ta) : null} points={curve === 'points' ? r.points : null} Tb={tb} opt={r} tMax={tMax} unit={P.unit} gainUnit={P.gainUnit} />
            <p>The dashed line runs from the moment people start travelling (−Tb) and touches the gain curve where the overall rate of gain is highest. Leaving earlier wastes the travel; staying later means the {P.place} is giving less per {P.unit} than the average elsewhere.</p>
          </Result>
          <Stats rows={[
            ['Optimal stay t*', `${num(r.t, 2)} ${P.unit}`],
            ['Gain by then', `${num(r.gain, 2)} ${P.gainUnit} (${pct(r.share)} of the ${P.place})`],
            ['Best overall rate R* = g / (Tb + t*)', `${num(r.rate, 3)} per ${P.unit}`],
            ['Gain rate inside the patch at t*', `${num(r.slope, 3)} per ${P.unit}`],
            altR && [`With Tb = ${num(tbAlt, 1)} ${P.unit}`, `leave at ${num(altR.t, 1)} ${P.unit}, R* ${num(altR.rate, 3)}`],
            curve === 'points' && !r.concave && ['Note', 'Your curve is not always diminishing, so the best point may be a later jump'],
          ]} />
        </>
      )}
      {sum && <StudySummary {...sum} />}
    </>
  );
}

const SCENT_SAMPLE = `Top level: Shop 4, Plans 3, Support 22*, My account 9, About us 2
Support: Billing 3, Network 4, Device help 25*
Device help: Set up my phone 6, Repairs 19*`;
function ScentMode() {
  const [text, setText] = useState(SCENT_SAMPLE);
  const p = useMemo(() => F.parseScent(text), [text]);
  const s = p.steps.length ? F.scent(p.steps) : null;
  const ok = s && s.steps.every((x) => x.hasCorrect && x.total > 0);
  const sum = ok ? F.scentSummary(s) : null;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One step per line: the links shown and how many chose each, with * on the correct link" value={text} onChange={setText} rows={6}
          hint="From a tree test or first-click test: Step name: Label count, Label count*, … Counts or percentages both work." />
      </div>
      {p.bad.length > 0 && <Problem>Skipped line{p.bad.length > 1 ? 's' : ''} {p.bad.join(', ')}: write each link as a label followed by a number.</Problem>}
      {!ok ? <Problem>Each step needs links with numbers and one link marked * as correct.</Problem> : (
        <>
          <Result big={pct(s.pathSuccess)} label="Predicted success along the path, with no backtracking" tone={s.pathSuccess >= 0.6 ? 'good' : s.pathSuccess < 0.4 ? 'bad' : ''}>
            <p>The product of the scent at each step: {s.steps.map((x) => pct(x.scent)).join(' × ')} = {pct(s.pathSuccess)}.</p>
          </Result>
          {s.steps.map((st) => (
            <div key={st.name}>
              <h3 className="clu-h3">{st.name}: scent {pct(st.scent)}, entropy {num(st.H)} bits (as if {num(st.N1, 1)} equal links)</h3>
              <Bars label={`Choices at ${st.name}`} rows={[...st.links].sort((a, b) => b.p - a.p).map((l) => [`${l.label}${l.correct ? ' ✓' : ''}`, l.p, pct(l.p), l.correct ? 'ok' : l.p > 0.15 ? 'bad' : ''])} />
            </div>
          ))}
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Step</th><th>Scent</th><th>Entropy (bits)</th><th>Normalised</th><th>Strongest rival</th><th>Cumulative success</th></tr></thead>
            <tbody>{s.steps.map((st) => <tr key={st.name}><td>{st.name}</td><td>{pct(st.scent)}</td><td>{num(st.H)}</td><td>{num(st.Hnorm)}</td><td>{st.rival ? `${st.rival.label} (${pct(st.rival.p)})` : '—'}</td><td>{pct(st.cum)}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
      {sum && <StudySummary {...sum} />}
    </>
  );
}

const DIET_SAMPLE = `Help centre article, 3, 2, 0.4
Community forum thread, 2, 6, 0.6
Video tutorial, 4, 8, 0.15
Support chat, 5, 12, 0.1
Release notes, 1, 3, 0.3`;
function DietMode() {
  const [text, setText] = useState(DIET_SAMPLE);
  const p = useMemo(() => F.parseDiet(text), [text]);
  const d = p.rows.length ? F.diet(p.rows) : null;
  const sum = d ? F.dietSummary(d, 'min') : null;
  const maxP = d ? d.ranked[0].profit : 1;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One source per line: name, value when used, handling time, how often it is met" value={text} onChange={setText} rows={6}
          hint="Value in any consistent unit (useful facts, answers). Handling time in minutes. Encounter rate: how many of this source people meet per minute of searching." />
      </div>
      {p.bad.length > 0 && <Problem>Skipped line{p.bad.length > 1 ? 's' : ''} {p.bad.join(', ')}: use name, value, time (above 0), rate.</Problem>}
      {!d ? <Problem>Enter at least one source.</Problem> : (
        <>
          <Result big={`${d.chosen.length} of ${d.ranked.length}`} label="sources worth pursuing when met" tone="good">
            <p>Rate of gain with the optimal diet: {num(d.R, 3)} per minute, against {num(d.allRate, 3)} when every source is pursued.</p>
          </Result>
          <Bars label="Profitability by source" rows={d.ranked.map((r) => [r.name, r.profit / maxP, `${num(r.profit, 2)} /min`, r.include ? 'ok' : 'bad'])} />
          <div className="clu-scroll"><table className="clu-table clu-num">
            <thead><tr><th>Source</th><th>Value g</th><th>Handling h</th><th>Rate λ</th><th>Profitability g/h</th><th>R before adding</th><th>Decision</th></tr></thead>
            <tbody>{d.ranked.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.g}</td><td>{r.h}</td><td>{r.lambda}</td><td>{num(r.profit, 3)}</td><td>{num(r.rateBefore, 3)}</td><td><span className={`qtag ${r.include ? 'promote' : 'fix'}`}>{r.include ? 'Pursue' : 'Skip'}</span></td></tr>)}</tbody>
          </table></div>
        </>
      )}
      {sum && <StudySummary {...sum} />}
    </>
  );
}

// ── Information foraging ──
function InfoForaging() {
  const [mode, setMode] = useState('patch');
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Model" value={mode} onChange={setMode} options={[['patch', 'When to leave a patch'], ['scent', 'Information scent'], ['diet', 'Which sources to use']]} />
      </div>
      {mode === 'patch' ? <PatchMode /> : mode === 'scent' ? <ScentMode /> : <DietMode />}
      <About method="information-foraging-analysis" links={[['search-behaviour-pattern-analysis', 'Search behaviour patterns'], ['sensemaking-research', 'Sensemaking research'], ['tree-testing', 'Tree testing'], ['first-click-testing', 'First-click testing'], ['shannon-entropy-audit', 'Shannon entropy audit'], ['information-seeking-mode-analysis', 'Information-seeking modes']]}>
        <p>Information foraging theory (Pirolli and Card 1999) treats people looking for information like animals looking for food: they try to maximise the value found per unit of time, R = G / (T<sub>B</sub> + T<sub>W</sub>), where G is the value gained, T<sub>B</sub> the time spent moving between patches and T<sub>W</sub> the time within them.</p>
        <p><b>Patch model.</b> Within a patch (a results page, a document, an interview topic) gains come quickly at first, then dry up. Charnov's marginal value theorem says leave when the gain rate in the patch, g′(t), falls to the best overall rate R* = g(t*) / (T<sub>B</sub> + t*): graphically, where a line from (−T<sub>B</sub>, 0) touches the gain curve. For g(t) = G(1 − e<sup>−t/τ</sup>) the optimum is t* = τ(−W<sub>−1</sub>(−e<sup>−(1 + T<sub>B</sub>/τ)</sup>) − 1) − T<sub>B</sub>, with W<sub>−1</sub> the lower branch of the Lambert W function; the calculator solves g′(t)(T<sub>B</sub> + t) = g(t) numerically and the check script compares it with that formula. For measured points joined by straight lines, the best leaving time is the point with the highest g / (T<sub>B</sub> + t). Shorter travel time means leaving sooner: that is why fast search makes people skim.</p>
        <p><b>Information scent</b> is the cue a label gives about what lies behind it. Here it is the share of people choosing the correct link at each step. Entropy of the choices, H = −Σ p log₂ p, shows how spread they were: high entropy means several labels looked equally good (ambiguity); low entropy on a wrong link means one label strongly misleads. Predicted success along a path is the product of the step scents, which assumes no backtracking and independence between steps.</p>
        <p><b>Diet model.</b> For sources with value g<sub>i</sub>, handling time h<sub>i</sub> and encounter rate λ<sub>i</sub>, rank by profitability π<sub>i</sub> = g<sub>i</sub> / h<sub>i</sub> and add them in order while π<sub>k</sub> exceeds the rate R<sub>k−1</sub> = Σλg / (1 + Σλh) of the sources already chosen. The result maximises R; the check script confirms it against every possible subset.</p>
      </About>
    </>
  );
}

export default InfoForaging;
