import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as SV from './humanfactors-seev.js';
import { sig, fmt } from './humanfactors-core.js';
import { Table, LoadExample, LinePlot } from './expanalytics-charts.jsx';
import { Choice, Pick, Area, Result, Stats, About, Problem } from './ui.jsx';
import './humanfactors.css';

const COEF = [['s', 'Salience weight s'], ['ef', 'Effort weight ef'], ['ex', 'Expectancy weight ex'], ['v', 'Value weight v']];
const DIMS = [['S', 'Salience'], ['EF', 'Effort'], ['EX', 'Expectancy'], ['V', 'Value']];

// ── SEEV model of visual attention ──
function HfSeev() {
  const [text, setText] = useState(SV.EXAMPLE);
  const [co, setCo] = useState({ s: 1, ef: 1, ex: 1, v: 1, form: 'add' });
  const [wi, setWi] = useState({ name: '', S: 0, EF: 0, EX: 0, V: 0 });
  const { rows, errors } = useMemo(() => SV.parseAois(text), [text]);
  const m = rows.length >= 2 ? SV.seev(rows, co) : null;
  const target = rows.find((r) => r.name === wi.name);
  const whatIf = target ? SV.seev(rows.map((r) => (r === target ? { ...r, S: wi.S, EF: wi.EF, EX: wi.EX, V: wi.V } : r)), co) : null;
  const pickAoi = (name) => { const r = rows.find((x) => x.name === name); setWi(r ? { name, S: r.S, EF: r.EF, EX: r.EX, V: r.V } : { ...wi, name: '' }); };
  const load = () => { setText(SV.EXAMPLE); setCo({ s: 1, ef: 1, ex: 1, v: 1, form: 'add' }); setWi({ name: '', S: 0, EF: 0, EX: 0, V: 0 }); };
  const maxV = m ? Math.max(...m.rows.map((r) => Math.max(r.pred || 0, r.obs !== null && m.fit ? m.fit.obsN[m.fit.names.indexOf(r.name)] || 0 : 0, whatIf ? whatIf.rows.find((x) => x.name === r.name).pred : 0)), 1) : 1;
  return (
    <div className="hf-root">
      <LoadExample onClick={load} />
      <Area label="Areas of interest: name, salience, effort, expectancy, value, observed % dwell (optional)" rows={8} value={text} onChange={setText}
        hint="Rate each factor on the same small scale (for example 0–3). Effort is the cost of looking there (distance, head movement). Observed dwell can be percentages or seconds; it is normalised." />
      {errors.length > 0 && <Problem>{errors[0]}</Problem>}
      <section className="ea-card">
        <h4>Model weights</h4>
        <div className="calc-inputs ea-inputs">
          <Choice label="Form" value={co.form} onChange={(f) => setCo({ ...co, form: f })} options={[['add', 's·S − ef·EF + ex·EX + v·V'], ['mult', 's·S − ef·EF + ex·EX × v·V']]} />
          {COEF.map(([k, l]) => (
            <label key={k} className="calc-field"><span>{l}: {co[k].toFixed(1)}</span><input type="range" min={0} max={3} step={0.1} value={co[k]} onChange={(e) => setCo({ ...co, [k]: Number(e.target.value) })} /></label>
          ))}
        </div>
      </section>
      {m && (
        <>
          <Result big={`${fmt([...m.rows].sort((a, b) => b.pred - a.pred)[0].pred, 0)}%`} label={`Predicted share of dwell time for "${[...m.rows].sort((a, b) => b.pred - a.pred)[0].name}", the most attended area`}>
            {m.fit && <Stats rows={[['Correlation with observed dwell, r', `${sig(m.fit.r, 2)} (95% CI ${sig(m.fit.lo, 2)} to ${sig(m.fit.hi, 2)})`], ['Spearman ρ', sig(m.fit.rho, 2)], ['Mean absolute gap', `${sig(m.fit.mad, 2)} points`], ['Areas compared', m.fit.n]]} />}
          </Result>
          <PairBars m={m} whatIf={whatIf} maxV={maxV} />
          <Table label="SEEV predictions" head={['Area', 'S', 'EF', 'EX', 'V', 'Score', 'Predicted %', 'Observed %', ...(whatIf ? ['What-if %'] : [])]} rows={m.rows.map((r, i) => {
            const k = m.fit ? m.fit.names.indexOf(r.name) : -1;
            return [r.name, r.S, r.EF, r.EX, r.V, sig(r.raw, 3), fmt(r.pred, 1), k >= 0 ? fmt(m.fit.obsN[k], 1) : '', ...(whatIf ? [fmt(whatIf.rows[i].pred, 1)] : [])];
          })} />
          {m.fit && (
            <LinePlot label="Predicted against observed percent dwell time" xLabel="Predicted % dwell" yLabel="Observed % dwell" xMin={0} yMin={0} xMax={Math.ceil(maxV / 10) * 10} yMax={Math.ceil(maxV / 10) * 10}
              series={[{ name: 'Areas', pts: m.fit.predN.map((p, i) => [p, m.fit.obsN[i]]).sort((a, b) => a[0] - b[0]), dots: true, width: 0.001 }, { name: 'Perfect prediction', pts: [[0, 0], [Math.ceil(maxV / 10) * 10, Math.ceil(maxV / 10) * 10]], dash: '5 4', color: 'var(--ink-3)' }]} />
          )}
          <section className="ea-card">
            <h4>What if you redesigned one area?</h4>
            <Pick label="Area" value={wi.name} onChange={pickAoi} options={[['', 'Choose an area…'], ...rows.map((r) => [r.name, r.name])]} />
            {target && (
              <>
                <div className="calc-inputs ea-inputs">
                  {DIMS.map(([k, l]) => (
                    <label key={k} className="calc-field"><span>{l}: {wi[k]}</span><input type="range" min={0} max={Math.max(3, ...rows.map((r) => r[k]))} step={1} value={wi[k]} onChange={(e) => setWi({ ...wi, [k]: Number(e.target.value) })} /></label>
                  ))}
                </div>
                <p className="hf-note">"{target.name}" would get <b>{fmt(whatIf.rows[rows.indexOf(target)].pred, 1)}%</b> of attention instead of {fmt(m.rows[rows.indexOf(target)].pred, 1)}%. Attention is a fixed budget, so the other areas change too (dashed outlines in the chart).</p>
              </>
            )}
          </section>
          <StudySummary {...SV.seevSummary(m)} />
        </>
      )}
      <About method="seev-model-of-visual-attention-allocation" links={[['eye-tracking', 'Eye tracking']]}>
        <p><b>SEEV</b> (Wickens, Helleberg, Goh, Xu and Horrey 2001, University of Illinois technical report; Wickens, Goh, Helleberg, Horrey and Talleur 2003, Human Factors 45(3), 360–380; Wickens and McCarley 2008, Applied Attention Theory). Each area of interest i is rated for salience S (how much it grabs attention), effort EF (the cost of moving the eyes or head there), expectancy EX (how often new information appears there, its bandwidth) and value V (how important that information is to the task). The attractiveness score is P<sub>i</sub> = s·S<sub>i</sub> − ef·EF<sub>i</sub> + ex·EX<sub>i</sub> + v·V<sub>i</sub>, or with expectancy and value multiplied (information is only worth looking for where it appears). The predicted percent dwell time is PDT<sub>i</sub> = max(0, P<sub>i</sub>) / Σ<sub>j</sub> max(0, P<sub>j</sub>).</p>
        <p><b>Comparing with eye tracking.</b> Observed dwell for the areas you entered is rescaled to 100%, and so are the predictions for the same areas. The page reports Pearson's r with a Fisher-z 95% confidence interval, Spearman's ρ and the mean absolute gap in percentage points. Checked against numpy and scipy.</p>
        <p><b>When not to use it.</b> SEEV describes steady-state scanning by practised operators (pilots, drivers, control-room staff); it does not predict where a first-time visitor looks first on a web page. The ratings are judgements, so compare designs with the same raters, and fit the weights to real dwell data before trusting absolute shares. With fewer than about 6 areas, a high correlation can arise by chance.</p>
      </About>
    </div>
  );
}

// ── Paired bars: predicted and observed (and what-if) share per area ──
function PairBars({ m, whatIf, maxV }) {
  const W = 620, rowH = 34, L = 150, R = 54, T = 8;
  const H = T + m.rows.length * rowH + 10;
  const sx = (v) => ((W - L - R) * v) / maxV;
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot hf-pair" role="img" aria-label="Predicted and observed share of dwell time by area">
        {m.rows.map((r, i) => {
          const y = T + i * rowH;
          const k = m.fit ? m.fit.names.indexOf(r.name) : -1;
          const obs = k >= 0 ? m.fit.obsN[k] : null;
          const w = whatIf ? whatIf.rows[i].pred : null;
          return (
            <g key={r.name}>
              <text x={L - 8} y={y + 18} className="lb" textAnchor="end">{r.name.length > 20 ? `${r.name.slice(0, 19)}…` : r.name}</text>
              <rect x={L} y={y + 3} width={sx(r.pred)} height={obs !== null ? 12 : 22} className="p" />
              {obs !== null && <rect x={L} y={y + 16} width={sx(obs)} height={12} className="o" />}
              {w !== null && Math.abs(w - r.pred) > 0.05 && <rect x={L} y={y + 2} width={sx(w)} height={obs !== null ? 14 : 24} className="w" />}
              <text x={L + Math.max(sx(r.pred), obs !== null ? sx(obs) : 0, w !== null ? sx(w) : 0) + 6} y={y + 18} className="lbs">{fmt(r.pred, 0)}%{obs !== null ? ` / ${fmt(obs, 0)}%` : ''}</text>
            </g>
          );
        })}
      </svg>
      <ul className="hf-legend">
        <li><i style={{ background: 'var(--c1)' }} />predicted</li>
        {m.fit && <li><i style={{ background: 'var(--c3)' }} />observed</li>}
        {whatIf && <li><i style={{ border: '1.5px dashed var(--ink)' }} />what-if</li>}
      </ul>
    </figure>
  );
}

export default HfSeev;
