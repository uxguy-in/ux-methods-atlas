import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './statsbench-core.js';
import * as M from './statsbench-mediation.js';
import { histogram } from './statsbench-resampling.js';
import { MEDIATION_EXAMPLE } from './statsbench-examples.js';
import { Chart, ColumnTags, Progress, useJob } from './statsbench-ui.jsx';
import { Table } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Result, Stats, Problem, About, num, pv } from './ui.jsx';

const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };

function PathDiagram({ p, x, m, y, conf }) {
  const W = 640, H = 230, box = (cx, cy, label) => (
    <g>
      <rect x={cx - 85} y={cy - 22} width={170} height={44} rx={4} className="sb-node" />
      <text x={cx} y={cy + 5} textAnchor="middle" className="lb ea-b">{label.length > 22 ? `${label.slice(0, 21)}…` : label}</text>
    </g>
  );
  const star = (q) => (q.p < 1 - conf ? ' *' : '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={`Path diagram: ${x} to ${m} to ${y}`}>
      <defs><marker id="sb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="sb-arrowhead" /></marker></defs>
      <line x1={150} y1={170} x2={258} y2={68} className="sb-edge" markerEnd="url(#sb-arrow)" />
      <line x1={382} y1={68} x2={490} y2={170} className="sb-edge" markerEnd="url(#sb-arrow)" />
      <line x1={190} y1={190} x2={445} y2={190} className="sb-edge" markerEnd="url(#sb-arrow)" />
      {box(105, 190, x)}{box(320, 46, m)}{box(535, 190, y)}
      <text x={170} y={110} className="lb" textAnchor="end">a = {num(p.a.b, 3)}{star(p.a)}</text>
      <text x={470} y={110} className="lb">b = {num(p.b.b, 3)}{star(p.b)}</text>
      <text x={320} y={216} className="lb" textAnchor="middle">c′ = {num(p.cp.b, 3)}{star(p.cp)} (total c = {num(p.c.b, 3)}{star(p.c)})</text>
    </svg>
  );
}

// ── Moderation and mediation (PROCESS models 1 and 4) ──
function SbMediation() {
  const [text, setText] = useState(MEDIATION_EXAMPLE);
  const [mode, setMode] = useState('mediation');
  const [x, setX] = useState('tutorial');
  const [mid, setMid] = useState('confidence');
  const [w, setW] = useState('experience_years');
  const [y, setY] = useState('intent');
  const [covs, setCovs] = useState([]);
  const [center, setCenter] = useState(true);
  const [probe, setProbe] = useState('sd');
  const [B, setB] = useState(5000);
  const [method, setMethod] = useState('pct');
  const [seed, setSeed] = useState(1);
  const [conf, setConf] = useState(0.95);
  const table = useMemo(() => C.parseTable(text), [text]);
  const nums = table.cols.filter((c) => c.numeric).map((c) => c.name);
  const role = mode === 'mediation' ? mid : w;
  const setRole = mode === 'mediation' ? setMid : setW;
  const chosen = [x, role, y];
  const distinct = new Set(chosen).size === 3 && chosen.every((n) => nums.includes(n));
  const covList = covs.filter((cv) => nums.includes(cv) && !chosen.includes(cv));
  const rows = useMemo(() => (distinct ? M.pickRows(table, [...chosen, ...covList]) : null), [table, distinct, chosen.join('|'), covList.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const enough = rows && rows.length >= covList.length + 6;
  const mod = useMemo(() => (mode === 'moderation' && enough ? M.moderation(rows, { conf, center, probe, covNames: covList }) : null), [mode, enough, rows, conf, center, probe, covList.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => (mode === 'mediation' && enough ? M.mediationPaths(rows, conf) : null), [mode, enough, rows, conf]);
  const key = mode === 'mediation' && paths ? `${hash(text)}|${chosen.join('|')}|${covList.join('|')}|${B}|${seed}` : null;
  const job = useJob(key, key ? { type: 'mediation', args: { rows, B, seed } } : null, () => M.bootIndirect(rows, B, seed));
  const ci = useMemo(() => (paths && job.result && job.key === key ? M.bootCI(job.result, paths.ab, conf) : null), [paths, job.result, job.key, key, conf]);
  const load = () => { setText(MEDIATION_EXAMPLE); setX('tutorial'); setMid('confidence'); setW('experience_years'); setY('intent'); setCovs([]); setCenter(true); setProbe('sd'); setB(5000); setMethod('pct'); setSeed(1); setConf(0.95); };
  const switchMode = (m) => {
    setMode(m);
    if (text === MEDIATION_EXAMPLE) { if (m === 'moderation') { setX('ease'); setW('experience_years'); } else { setX('tutorial'); setMid('confidence'); } setY('intent'); }
  };
  const c = Math.round(conf * 100);
  const opts = nums.map((n) => [n, n]);
  // Predicted Y against X at the probe values of W (covariates at their means).
  const lines = useMemo(() => {
    if (!mod) return [];
    const b = mod.coefs.map((r) => r.b), xs = rows.map((r) => r[0]), lo = Math.min(...xs), hi = Math.max(...xs);
    const covAdj = covList.reduce((s, _, j) => s + b[4 + j] * C.mean(rows.map((r) => r[3 + j])), 0);
    return mod.slopes.map((s, i) => ({ type: 'line', name: `${w} = ${num(s.w, 2)}`, color: `var(--c${i + 1})`, pts: [lo, hi].map((xv) => { const xc = xv - mod.mx, wc = s.w - mod.mw; return [xv, b[0] + b[1] * xc + b[2] * wc + b[3] * xc * wc + covAdj]; }) }));
  }, [mod, rows, covList.join('|'), w]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lo, hi] = ci ? (method === 'bc' ? ci.bc : ci.pct) : [NaN, NaN];
  const hist = useMemo(() => (ci && job.result ? histogram(job.result, 50) : null), [ci, job.result]);
  return (
    <>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={load}>Load example (onboarding study, n = 140)</button></div>
      <div className="calc-inputs sb-inputs">
        <Area label="Data table: header row, then one row per person" value={text} onChange={setText} rows={7} wrap="off" hint="Numeric columns only (code a two-group condition as 0 and 1). Rows with a missing value in a used column are left out." />
      </div>
      <ColumnTags table={table} />
      <div className="calc-inputs sb-inputs">
        <Choice label="Question" value={mode} onChange={switchMode} options={[['mediation', 'Mediation: through what? (model 4)'], ['moderation', 'Moderation: for whom? (model 1)']]} />
        <Pick label="X (predictor or condition)" value={x} onChange={setX} options={opts} />
        <Pick label={mode === 'mediation' ? 'M (mediator)' : 'W (moderator)'} value={role} onChange={setRole} options={opts} />
        <Pick label="Y (outcome)" value={y} onChange={setY} options={opts} />
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
        {mode === 'moderation' ? (
          <>
            <Choice label="Mean-centre X and W" value={center} onChange={setCenter} options={[[true, 'Yes'], [false, 'No']]} />
            <Choice label="Probe W at" value={probe} onChange={setProbe} options={[['sd', 'Mean ± 1 SD'], ['pct', '16th, 50th, 84th percentiles']]} />
          </>
        ) : (
          <>
            <Choice label="Bootstrap resamples" value={B} onChange={setB} options={[[1000, '1,000'], [5000, '5,000'], [10000, '10,000']]} />
            <Choice label="Bootstrap interval" value={method} onChange={setMethod} options={[['pct', 'Percentile'], ['bc', 'Bias-corrected']]} />
          </>
        )}
      </div>
      {nums.length > 3 && (
        <div className="sb-card">
          <h4>Covariates (optional)</h4>
          <div className="tl-row">{nums.filter((n) => !chosen.includes(n)).map((n) => <label key={n} className="tl-check"><input type="checkbox" checked={covs.includes(n)} onChange={(e) => setCovs(e.target.checked ? [...covs, n] : covs.filter((v) => v !== n))} />{n}</label>)}</div>
        </div>
      )}
      {!distinct ? <Problem>Choose three different numeric columns for X, {mode === 'mediation' ? 'M' : 'W'} and Y.</Problem>
        : !enough ? <Problem>Not enough complete rows to fit the model.</Problem>
          : mode === 'moderation' && mod ? (
            <>
              <Result big={`X × W = ${num(mod.coefs[3].b, 3)}`} tone={mod.pInt < 1 - conf ? 'good' : ''} label={`Interaction ${c}% CI ${num(mod.coefs[3].lo, 3)} to ${num(mod.coefs[3].hi, 3)}, t(${mod.df}) = ${num(mod.coefs[3].t, 2)}, p ${pv(mod.pInt)}; ΔR² = ${num(mod.dR2, 3)}; n = ${mod.n}`}>
                <p>{mod.pInt < 1 - conf ? `The slope of ${y} on ${x} changes by ${num(mod.coefs[3].b, 3)} for each unit of ${w}.` : `The slope of ${y} on ${x} does not clearly depend on ${w}.`}</p>
              </Result>
              <Table label="Moderation model coefficients" head={['Term', 'b', 'SE', 't', 'p', `${c}% CI`]} rows={mod.coefs.map((r) => [r.name === 'X' ? `${x} (X)` : r.name === 'W' ? `${w} (W)` : r.name === 'X × W' ? `${x} × ${w}` : r.name, num(r.b, 4), num(r.se, 4), num(r.t, 2), pv(r.p), `${num(r.lo, 3)} to ${num(r.hi, 3)}`])} />
              <h3 className="clu-h3">Simple slopes: the effect of {x} at chosen values of {w}</h3>
              <Table label="Conditional effects of X" head={[`${w}`, `Effect of ${x}`, 'SE', 't', 'p', `${c}% CI`]} rows={mod.slopes.map((s) => ({ cls: s.p < 1 - conf ? 'tl-cell-ok' : '', cells: [num(s.w, 2), num(s.est, 4), num(s.se, 4), num(s.t, 2), pv(s.p), `${num(s.lo, 3)} to ${num(s.hi, 3)}`] }))} />
              <div className="sb-grid2">
                <Chart label={`Predicted ${y} against ${x} at three values of ${w}`} xLabel={x} yLabel={`Predicted ${y}`} height={260} series={lines} />
                {!mod.binaryW && (
                  <Chart label={`Johnson-Neyman plot: effect of ${x} across ${w}`} xLabel={`${w} (shaded: effect of ${x} significant)`} yLabel={`Effect of ${x}`} height={260} hlines={[{ y: 0 }]}
                    regions={mod.regions.filter((r) => r.sig).map((r) => ({ x0: r.from, x1: r.to, tone: 'ok' }))}
                    vlines={mod.jnInside.map((j) => ({ x: j.w, label: `J-N ${num(j.w, 2)}` }))}
                    series={[{ type: 'band', lo: mod.curve.map((e) => [e.w, e.lo]), hi: mod.curve.map((e) => [e.w, e.hi]), color: 'var(--c1)', name: `${c}% CI`, hideLegend: true }, { type: 'line', pts: mod.curve.map((e) => [e.w, e.est]), color: 'var(--c1)', name: 'Effect' }]} legend={false} />
                )}
              </div>
              {!mod.binaryW && <p className="tl-note">Johnson-Neyman: {mod.jnInside.length ? `the effect of ${x} crosses the ${c}% significance line at ${w} = ${mod.jnInside.map((j) => `${num(j.w, 2)} (${num(j.below * 100, 0)}% of people below)`).join(' and ')}.` : `no transition inside the observed range of ${w} (${num(mod.wMin, 2)} to ${num(mod.wMax, 2)}); the effect is ${mod.regions[0]?.sig ? 'significant' : 'not significant'} throughout.`}</p>}
              <Stats rows={[['R² of the model', num(mod.r2, 3)], ['ΔR² from the interaction', num(mod.dR2, 4)], ['F for the interaction', `F(1, ${mod.df}) = ${num(mod.F, 2)}`], ['Centring', mod.center ? `X at its mean ${num(mod.mx, 2)}, W at ${num(mod.mw, 2)}` : 'none']]} />
              <StudySummary {...M.moderationSummary(mod, { x, w, y })} />
            </>
          ) : mode === 'mediation' && paths ? (
            <>
              <Result big={ci ? `a·b = ${num(paths.ab, 3)} [${num(lo, 3)}, ${num(hi, 3)}]` : `a·b = ${num(paths.ab, 3)}`} tone={ci && (lo > 0 || hi < 0) ? 'good' : ''}
                label={ci ? `Indirect effect of ${x} on ${y} through ${mid}, ${c}% ${method === 'bc' ? 'bias-corrected' : 'percentile'} bootstrap CI from ${ci.B.toLocaleString('en')} resamples; n = ${paths.n}` : `Indirect effect of ${x} on ${y} through ${mid}; bootstrapping…`}>
                {job.running && <Progress value={job.progress} label={`Bootstrapping ${B.toLocaleString('en')} resamples`} />}
                {job.error && <p className="calc-warn">The bootstrap failed: {job.error}</p>}
              </Result>
              <PathDiagram p={paths} x={x} m={mid} y={y} conf={conf} />
              <p className="tl-note">* p &lt; {num(1 - conf, 2)}. a, b, c′ and c are unstandardised OLS coefficients{covList.length ? `, adjusted for ${covList.join(', ')}` : ''}.</p>
              <Table label="Mediation paths" head={['Path', 'b', 'SE', 't', 'p', `${c}% CI`]} rows={[paths.a, paths.b, paths.cp, paths.c].map((r) => [r.name, num(r.b, 4), num(r.se, 4), num(r.t, 2), pv(r.p), `${num(r.lo, 3)} to ${num(r.hi, 3)}`])} />
              {ci && hist && (
                <div className="sb-grid2">
                  <Chart label="Bootstrap distribution of the indirect effect" xLabel="a·b in bootstrap resamples" yLabel="Resamples" height={240} yMin={0}
                    vlines={[{ x: lo, label: 'lower', color: 'var(--c2)' }, { x: hi, label: 'upper', color: 'var(--c2)' }, { x: 0, label: '0' }]}
                    series={[{ type: 'bars', bars: hist.counts.map((n, i) => ({ x0: hist.edges[i], x1: hist.edges[i + 1], y: n })), color: 'var(--c1)' }]} legend={false} />
                  <Stats rows={[
                    ['Percentile CI', `${num(ci.pct[0], 4)} to ${num(ci.pct[1], 4)}`],
                    ['Bias-corrected CI', `${num(ci.bc[0], 4)} to ${num(ci.bc[1], 4)}`],
                    ['Bootstrap SE of a·b', num(ci.se, 4)],
                    ['Sobel test (for comparison)', `z = ${num(paths.sobel.z, 2)}, p ${pv(paths.sobel.p)}`],
                    ['Standardised indirect effect', num(paths.abStd, 3)],
                    ['R² for M and for Y', `${num(paths.r2M, 3)} and ${num(paths.r2Y, 3)}`],
                  ]} />
                </div>
              )}
              <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={() => setSeed(seed + 1)} disabled={job.running}>Draw new resamples (seed {seed})</button></div>
              {ci && <StudySummary {...M.mediationSummary(paths, ci, { x, m: mid, y, method })} />}
            </>
          ) : null}
      <About method="process-macro-hayes-for-moderation-and-mediation" links={[['moderation-interaction-effects', 'Moderation and interaction effects'], ['mediation-analysis', 'Mediation analysis'], ['bootstrapped-indirect-effects', 'Bootstrapped indirect effects']]}>
        <p><b>Moderation (Hayes PROCESS model 1).</b> Y = b₀ + b₁X + b₂W + b₃XW (+ covariates) by OLS, with X and W mean-centred if you choose (b₃ and its test do not change). The conditional effect of X at W = w is θ(w) = b₁ + b₃w with SE² = V₁₁ + 2wV₁₃ + w²V₃₃ and t on n − p df, probed at the mean ± 1 SD or the 16th, 50th and 84th percentiles of W (or at both values when W has two). The Johnson-Neyman points are the w that solve (b₃² − t²V₃₃)w² + 2(b₁b₃ − t²V₁₃)w + (b₁² − t²V₁₁) = 0 within the observed range. ΔR² = t²(1 − R²)/df is the share of variance the interaction adds.</p>
        <p><b>Mediation (PROCESS model 4).</b> a from M ~ X, b and the direct effect c′ from Y ~ X + M, the total effect c from Y ~ X (all with the same covariates). The indirect effect is a·b (= c − c′). Its interval comes from B bootstrap resamples of whole rows: the percentile interval takes the 2.5th and 97.5th percentiles of a·b; the bias-corrected interval shifts them by z₀ = Φ⁻¹(share of resamples below a·b), as pingouin does. The Sobel z = ab/√(b²SE_a² + a²SE_b²) is shown only for comparison, because a·b is rarely normal (Hayes 2018). Resampling runs in a background worker.</p>
        <p>Checked against statsmodels OLS and t_test (coefficients, simple slopes, Johnson-Neyman points) and pingouin.mediation_analysis (paths, bias-corrected interval from pingouin's own bootstrap draws), and our bootstrap is replayed exactly in numpy: <code>npm run check:statsbench</code>.</p>
        <p><b>When not to use it.</b> Mediation needs a causal order you can defend: X before M before Y, ideally with X randomised and M measured before Y. With all three from one survey, the model cannot tell X → M → Y from Y → M → X. Moderation with fewer than about 100 people will usually miss real interactions. For several mediators or latent variables use structural equation modelling.</p>
      </About>
    </>
  );
}

export default SbMediation;
