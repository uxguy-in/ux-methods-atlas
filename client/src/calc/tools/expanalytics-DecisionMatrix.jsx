import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as D from './expanalytics-decision.js';
import { LinePlot, Table, LoadExample, color } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Problem, About, Bars, num, pct } from './ui.jsx';

const lines = (t) => String(t).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
const nPairs = (n) => (n * (n - 1)) / 2;
const fit = (arr, n) => Array.from({ length: n }, (_, i) => arr?.[i] ?? 0);

// Example: three navigation concepts judged by a product lead and a research lead.
const EX = {
  crit: 'User value\nBusiness impact\nBuild effort (less is better)\nDelivery risk (less is better)',
  opts: 'Mega menu\nSearch-first\nGuided wizard',
  judges: [
    { crit: [2, 4, 3, 2, 2, 0], opts: [[-2, 1, 3], [0, 2, 2], [2, 4, 2], [1, 3, 2]] },
    { crit: [1, 3, 4, 2, 3, 1], opts: [[-3, 0, 3], [-1, 1, 2], [2, 3, 1], [0, 2, 2]] },
  ],
  smart: {
    weights: [40, 30, 20, 10], dirs: ['higher', 'higher', 'lower', 'lower'],
    scores: [[6, 7, 5, 4], [9, 8, 8, 6], [5, 6, 3, 3]],
  },
  effort: [5, 8, 3],
};

function Slider({ a, b, step, onChange }) {
  // Slider value v = −step: left favours a, right favours b.
  const v = -step, r = D.stepToRatio(step);
  const txt = step === 0 ? 'Equal importance' : step > 0 ? `${a}: ${D.SAATY_WORDS[step + 1]} (${step + 1})` : `${b}: ${D.SAATY_WORDS[1 - step]} (${1 - step})`;
  return (
    <div className={`ea-slider${Math.abs(step) >= 4 ? ' strong' : ''}`}>
      <span className="a">{a}</span>
      <span className="mid">
        <input type="range" min={-8} max={8} step={1} value={v} onChange={(e) => onChange(-Number(e.target.value))} aria-label={`${a} versus ${b}`} aria-valuetext={txt} />
        <span className="v">{txt}{step !== 0 && ` · ratio ${r >= 1 ? num(r, 0) : `1/${num(1 / r, 0)}`}`}</span>
      </span>
      <span className="b">{b}</span>
    </div>
  );
}

function PairSliders({ names, steps, setSteps }) {
  const out = []; let x = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const idx = x++;
    out.push(<Slider key={`${i}-${j}`} a={names[i]} b={names[j]} step={steps[idx] ?? 0} onChange={(s) => setSteps(steps.map((v, k) => (k === idx ? s : v)))} />);
  }
  return <div className="ea-sliders">{out}</div>;
}

function Stability({ sens, names, critNames }) {
  const W = 620, rowH = 30, L = 170, R = 20, T = 10, B = 34, H = T + sens.length * rowH + B;
  const sx = (t) => L + t * (W - L - R);
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot ea-tornado" role="img" aria-label="Range of each criterion weight over which the leader stays on top">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={T} y2={H - B} className="grid" /><text x={sx(t)} y={H - B + 15} className="ax" textAnchor="middle">{pct(t)}</text></g>)}
        {sens.map((s, i) => {
          const y = T + i * rowH + 6, lo = s.down ? s.down.t : 0, hi = s.up ? s.up.t : 1;
          return (
            <g key={i}>
              <text x={8} y={y + 13} className="lb">{critNames[i].length > 22 ? `${critNames[i].slice(0, 21)}…` : critNames[i]}</text>
              {s.down && <rect x={sx(0)} y={y + 4} width={sx(lo) - sx(0)} height={10} className="neg" opacity="0.35" />}
              <rect x={sx(lo)} y={y} width={Math.max(1, sx(hi) - sx(lo))} height={18} className="pos" opacity="0.8" />
              {s.up && <rect x={sx(hi)} y={y + 4} width={sx(1) - sx(hi)} height={10} className="neg" opacity="0.35" />}
              <line x1={sx(s.w)} x2={sx(s.w)} y1={y - 3} y2={y + 21} style={{ stroke: 'var(--ink)', strokeWidth: 2.5 }} />
            </g>
          );
        })}
        <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Weight of the criterion (others rescaled in proportion)</text>
      </svg>
      <ul className="tl-legend"><li><span className="ea-legend-sw" style={{ background: 'var(--c1)' }} />{names.length ? 'Leader unchanged' : ''}</li><li><span className="ea-legend-sw" style={{ background: 'var(--c2)', opacity: 0.5 }} />A different option leads</li><li><span className="ea-legend-sw" style={{ background: 'var(--ink)' }} />Current weight</li></ul>
    </figure>
  );
}

function Quadrant({ names, impact, effort }) {
  const W = 520, H = 340, L = 50, R = 16, T = 14, B = 42;
  const sx = (e) => L + ((e - 1) / 9) * (W - L - R), sy = (v) => T + (1 - v) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot ea-quad" role="img" aria-label="Effort against impact for each option">
      <rect x={sx(1)} y={sy(1)} width={sx(5.5) - sx(1)} height={sy(0.5) - sy(1)} className="q win" />
      <rect x={sx(5.5)} y={sy(1)} width={sx(10) - sx(5.5)} height={sy(0.5) - sy(1)} className="q bet" />
      <rect x={sx(1)} y={sy(0.5)} width={sx(5.5) - sx(1)} height={sy(0) - sy(0.5)} className="q fill" />
      <rect x={sx(5.5)} y={sy(0.5)} width={sx(10) - sx(5.5)} height={sy(0) - sy(0.5)} className="q pit" />
      {[['Quick wins', 1.2, 0.95], ['Big bets', 5.7, 0.95], ['Fill-ins', 1.2, 0.05], ['Money pits', 5.7, 0.05]].map(([t, e, v]) => <text key={t} x={sx(e)} y={sy(v) + (v > 0.5 ? 6 : 0)} className="ql">{t}</text>)}
      {[1, 4, 7, 10].map((e) => <text key={e} x={sx(e)} y={H - B + 15} className="ax" textAnchor="middle">{e}</text>)}
      {[0, 0.5, 1].map((v) => <text key={v} x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{Math.round(v * 100)}</text>)}
      {names.map((n, i) => <g key={n + i}><circle cx={sx(effort[i])} cy={sy(impact[i])} r={6} style={{ fill: color(i) }} /><text x={sx(effort[i]) + 9} y={sy(impact[i]) + 4} className="dl">{n}</text></g>)}
      <text x={(L + W - R) / 2} y={H - 6} className="ax" textAnchor="middle">Effort (1 = trivial, 10 = huge)</text>
      <text x={12} y={(T + H - B) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Impact (score scaled 0–100)</text>
    </svg>
  );
}

// ── AHP and weighted decision matrix ──
function ExpDecisionMatrix() {
  const [method, setMethod] = useState('ahp');
  const [critText, setCritText] = useState(EX.crit);
  const [optText, setOptText] = useState(EX.opts);
  const [judges, setJudges] = useState(EX.judges);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState('crit');
  const [weights, setWeights] = useState(EX.smart.weights);
  const [dirs, setDirs] = useState(EX.smart.dirs);
  const [scores, setScores] = useState(EX.smart.scores);
  const [effort, setEffort] = useState(EX.effort);
  const [sensC, setSensC] = useState('0');
  const crit = lines(critText), opts = lines(optText);
  const nc = crit.length, no = opts.length;
  // Keep every judge's arrays the right size for the current lists.
  const J = judges.map((j) => ({ crit: fit(j.crit, nPairs(nc)), opts: Array.from({ length: nc }, (_, c) => fit(j.opts?.[c], nPairs(no))) }));
  const aj = Math.min(active, J.length - 1);
  const setJ = (fn) => setJudges(J.map((j, i) => (i === aj ? fn(j) : j)));
  const W = fit(weights, nc).map((v) => (Number.isFinite(+v) ? +v : 0)), DIRS = Array.from({ length: nc }, (_, i) => dirs[i] || 'higher');
  const S = Array.from({ length: no }, (_, o) => fit(scores[o], nc).map((v) => +v || 0));
  const E = Array.from({ length: no }, (_, o) => Math.min(10, Math.max(1, +effort[o] || 5)));
  const ok = nc >= 2 && no >= 2;
  const loadExample = () => { setCritText(EX.crit); setOptText(EX.opts); setJudges(EX.judges); setActive(0); setEditing('crit'); setWeights(EX.smart.weights); setDirs(EX.smart.dirs); setScores(EX.smart.scores); setEffort(EX.effort); };

  const res = useMemo(() => {
    if (!ok) return null;
    if (method === 'ahp') {
      const cm = D.geoMeanMatrix(J.map((j) => D.matrixFromSteps(nc, j.crit)));
      const om = Array.from({ length: nc }, (_, c) => D.geoMeanMatrix(J.map((j) => D.matrixFromSteps(no, j.opts[c]))));
      const r = D.ahp(cm, om);
      const crs = [{ name: 'Criteria', ...r.crit, A: cm }, ...r.local.map((l, c) => ({ name: crit[c], ...l, A: om[c] }))];
      const perJudge = J.map((j) => D.ahpPriorities(D.matrixFromSteps(nc, j.crit)).cr);
      return { w: r.crit.w, V: r.V, scores: r.scores, crs, perJudge };
    }
    if (W.reduce((a, b) => a + b, 0) <= 0) return null;
    const r = D.smart(W, S, DIRS);
    return { w: r.w, V: r.V, scores: r.total, crs: [] };
  }, [ok, method, JSON.stringify(J), JSON.stringify(W), JSON.stringify(S), JSON.stringify(DIRS), critText, optText]);
  const sens = res ? D.sensitivity(res.w, res.V, crit) : null;
  const sc = Math.min(Number(sensC), nc - 1);
  const maxScore = res ? Math.max(...res.scores) : 1;
  const impact = res ? res.scores.map((s) => (method === 'ahp' ? s / maxScore : s)) : [];
  const editNames = editing === 'crit' ? crit : opts;
  const editSteps = editing === 'crit' ? J[aj]?.crit : J[aj]?.opts[Number(editing)];
  const editCR = res && method === 'ahp' ? res.crs[editing === 'crit' ? 0 : Number(editing) + 1] : null;
  const worst = editCR && editCR.cr > D.CR_LIMIT ? D.worstJudgement(editCR.A, editCR.w) : null;

  return (
    <>
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Method" value={method} onChange={setMethod} options={[['ahp', 'AHP (pairwise comparisons)'], ['smart', 'Weighted scoring (SMART)']]} />
      </div>
      <div className="ea-grid2">
        <Area label="Criteria, one per line (2 to 8)" value={critText} onChange={setCritText} rows={5} />
        <Area label="Options, one per line (2 to 8)" value={optText} onChange={setOptText} rows={5} />
      </div>
      {!ok ? <Problem>Enter at least two criteria and two options.</Problem> : method === 'ahp' ? (
        <section className="ea-card">
          <div className="ea-tabs" role="group" aria-label="Judges">
            {J.map((_, i) => <button key={i} type="button" className={`btn small ${i === aj ? '' : 'ghost'}`} onClick={() => setActive(i)}>Judge {i + 1}</button>)}
            <button type="button" className="btn ghost small" onClick={() => { setJudges([...J, { crit: fit([], nPairs(nc)), opts: Array.from({ length: nc }, () => fit([], nPairs(no))) }]); setActive(J.length); }}>+ Add judge</button>
            {J.length > 1 && <button type="button" className="btn ghost small" onClick={() => { setJudges(J.filter((_, i) => i !== aj)); setActive(0); }}>Remove judge {aj + 1}</button>}
          </div>
          <Pick label="Comparing" value={editing} onChange={setEditing} options={[['crit', 'Criteria against each other'], ...crit.map((c, i) => [String(i), `Options on "${c}"`])]} />
          <p className="tl-note">{editing === 'crit' ? 'Which criterion matters more, and by how much?' : `Which option is better on "${crit[Number(editing)]}"?`} Drag towards the stronger one: 1 equal, 3 moderately, 5 strongly, 7 very strongly, 9 extremely.</p>
          {editSteps && <PairSliders names={editNames} steps={editSteps} setSteps={(s) => setJ((j) => (editing === 'crit' ? { ...j, crit: s } : { ...j, opts: j.opts.map((o, c) => (c === Number(editing) ? s : o)) }))} />}
          {editCR && <p className="tl-note">This matrix{J.length > 1 ? ' (all judges combined)' : ''}: CR = {num(editCR.cr, 3)} <span className={`qtag ${editCR.cr > D.CR_LIMIT ? 'fix' : 'promote'}`}>{editCR.cr > D.CR_LIMIT ? 'Inconsistent' : 'Consistent'}</span>{worst && <> Most out of line: {editNames[worst.i]} vs {editNames[worst.j]} (given {num(worst.given, 2)}, the other judgements imply about {num(worst.implied, 2)}).</>}</p>}
        </section>
      ) : (
        <section className="ea-card">
          <h4>Weights and scores</h4>
          <p className="tl-note">Weights in any units (they are normalised). Scores on any scale per criterion; each criterion is rescaled from the worst option (0) to the best (1).</p>
          <div className="clu-scroll ea-contain"><table className="clu-table clu-num" aria-label="Decision matrix">
            <thead><tr><th>Option</th>{crit.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              <tr><td><b>Weight</b></td>{crit.map((c, i) => <td key={c}><input className="ea-mini" type="number" value={W[i]} aria-label={`Weight of ${c}`} onChange={(e) => setWeights(W.map((v, k) => (k === i ? e.target.value : v)))} /></td>)}</tr>
              <tr><td><b>Better is</b></td>{crit.map((c, i) => <td key={c}><select className="ea-mini" value={DIRS[i]} aria-label={`Direction of ${c}`} onChange={(e) => setDirs(DIRS.map((v, k) => (k === i ? e.target.value : v)))}><option value="higher">Higher</option><option value="lower">Lower</option></select></td>)}</tr>
              {opts.map((o, oi) => <tr key={o}><td>{o}</td>{crit.map((c, ci) => <td key={c}><input className="ea-mini" type="number" value={S[oi][ci]} aria-label={`${o} on ${c}`} onChange={(e) => setScores(S.map((row, r) => (r === oi ? row.map((v, k) => (k === ci ? e.target.value : v)) : row)))} /></td>)}</tr>)}
            </tbody>
          </table></div>
        </section>
      )}
      {res && (
        <>
          <Result big={opts[res.scores.indexOf(maxScore)]} tone="good" label={method === 'ahp' ? `Highest overall priority, ${num(maxScore, 3)}${J.length > 1 ? `, combining ${J.length} judges` : ''}` : `Highest weighted score, ${num(maxScore * 100, 0)} out of 100`}>
            <Bars label="Overall score by option" rows={opts.map((o, i) => [o, res.scores[i] / maxScore, method === 'ahp' ? num(res.scores[i], 3) : num(res.scores[i] * 100, 0)]).sort((a, b) => b[1] - a[1])} />
          </Result>
          <div className="ea-grid2">
            <div>
              <h3 className="clu-h3">Criterion weights</h3>
              <Bars label="Criterion weights" rows={crit.map((c, i) => [c, res.w[i] / Math.max(...res.w), pct(res.w[i], 1)])} />
            </div>
            {method === 'ahp' && (
              <div>
                <h3 className="clu-h3">Consistency (Saaty: CR ≤ 0.10)</h3>
                <Table label="Consistency of each comparison matrix" head={['Matrix', 'λmax', 'CI', 'CR', '']} rows={res.crs.map((m) => [m.name, num(m.lambda, 3), num(m.ci, 3), num(m.cr, 3), <span key="t" className={`qtag ${m.cr > D.CR_LIMIT ? 'fix' : 'promote'}`}>{m.n < 3 ? 'n < 3' : m.cr > D.CR_LIMIT ? 'Inconsistent' : 'OK'}</span>])} />
                {J.length > 1 && <p className="tl-note">Criteria CR per judge: {res.perJudge.map((c, i) => `Judge ${i + 1} ${num(c, 3)}`).join(', ')}.</p>}
              </div>
            )}
          </div>
          <Table label="Option scores per criterion" head={['Option', ...crit.map((c, i) => `${c} (${pct(res.w[i], 0)})`), 'Overall']} rows={opts.map((o, oi) => [o, ...crit.map((_, ci) => num(res.V[oi][ci], 3)), <b key="t">{method === 'ahp' ? num(res.scores[oi], 3) : num(res.scores[oi] * 100, 1)}</b>])} />
          <h3 className="clu-h3">Sensitivity: how far can each weight move before the winner changes?</h3>
          <Stability sens={sens} names={opts} critNames={crit} />
          <Table label="Break-even weights" head={['Criterion', 'Current weight', 'Leader changes below', 'Leader changes above']} rows={sens.map((s) => [s.name, pct(s.w, 1), s.down ? `${pct(s.down.t, 1)} (${opts[s.down.to]})` : 'never', s.up ? `${pct(s.up.t, 1)} (${opts[s.up.to]})` : 'never'])} />
          <Pick label="Show scores as one weight changes" value={String(sc)} onChange={setSensC} options={crit.map((c, i) => [String(i), c])} />
          <LinePlot label={`Overall score of each option as the weight of ${crit[sc]} changes`} xLabel={`Weight of "${crit[sc]}"`} yLabel="Overall score" xMin={0} xMax={1} xFmt={(v) => pct(v)} yFmt={(v) => num(v, 2)}
            series={sens[sc].lines.map((l, o) => ({ name: opts[o], pts: [[0, l.a], [1, l.a + l.b]] }))} vlines={[{ x: res.w[sc], label: 'Now' }]} />
          <h3 className="clu-h3">Effort × impact</h3>
          <div className="calc-inputs ea-inputs">{opts.map((o, i) => <label key={o} className="calc-field"><span>Effort: {o}</span><input type="number" min={1} max={10} value={E[i]} onChange={(e) => setEffort(E.map((v, k) => (k === i ? e.target.value : v)))} /></label>)}</div>
          <Quadrant names={opts} impact={impact} effort={E} />
          <p className="tl-note">Impact is the overall score{method === 'ahp' ? ' relative to the leader' : ''}. Quadrants: {opts.map((o, i) => `${o}: ${D.quadrant(impact[i], E[i])}`).join(' · ')}.</p>
          <StudySummary {...D.decisionSummary({ method, names: opts, critNames: crit, scores: res.scores, crs: res.crs, sens, judges: method === 'ahp' ? J.length : 1 })} />
        </>
      )}
      <About method="analytic-hierarchy-process" links={[['multi-attribute-utility-analysis-maut-smart', 'MAUT/SMART'], ['effort-impact-grid', 'Effort × impact grid'], ['persona-weighted-feature-prioritisation-matrix', 'Persona-weighted prioritisation'], ['quality-function-deployment-house-of-quality', 'QFD (House of Quality)'], ['one-way-sensitivity-analysis', 'One-way sensitivity analysis'], ['rice-prioritisation-scoring', 'RICE scoring']]}>
        <p><b>AHP</b> (Saaty 1980). Each pair is judged on Saaty's 1–9 scale; the matrix A holds a_ij for "i over j" and 1/a_ij below the diagonal. Priorities are the principal eigenvector w of A, found by power iteration and scaled to sum to 1. λmax = mean of (Aw)_i / w_i; the consistency index CI = (λmax − n)/(n − 1); the consistency ratio CR = CI / RI(n), with Saaty's random indices RI = 0.58, 0.90, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49 for n = 3 to 10. CR above 0.10 flags judgements that contradict each other. The flagged pair is the one with the largest gap between the given ratio and w_i/w_j. Several judges are combined element by element with the geometric mean, which keeps the matrix reciprocal (Aczél and Saaty 1983). Overall scores = Σ criterion weight × the option's local priority. Checked against numpy's eigenvector and Saaty's (1990) school-selection example (priorities 0.32, 0.14, 0.03, 0.13, 0.24, 0.14).</p>
        <p><b>SMART</b> (Edwards and Barron 1994). Weights are normalised to sum to 1. Each criterion's scores are rescaled linearly from the worst option (0) to the best (1), reversed for "lower is better". Overall = Σ w_c · v_oc.</p>
        <p><b>Sensitivity.</b> When one weight w_c changes to t and the others keep their proportions, each option's score is a straight line, a + b·t, so the break-even weights where another option takes the lead are found exactly. The stability chart shows the range of each weight over which the current leader stays on top.</p>
        <p><b>Effort × impact.</b> Impact is the overall score (relative to the leader for AHP), effort a 1–10 estimate; the quadrants split at the scale midpoints.</p>
        <p><b>When not to use it.</b> With more than 7 to 9 items, pairwise comparisons get long and inconsistent; use weighted scoring or a MaxDiff survey. AHP's rankings can reverse when options are added or removed. Neither method replaces evidence on the criteria themselves.</p>
      </About>
    </>
  );
}

export default ExpDecisionMatrix;
