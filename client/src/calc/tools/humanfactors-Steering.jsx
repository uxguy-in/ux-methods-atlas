import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as S from './humanfactors-steering.js';
import { sig, fmt } from './humanfactors-core.js';
import { Table, LoadExample, LinePlot } from './expanalytics-charts.jsx';
import { Num, Choice, Pick, Area, Result, Stats, About, Bars, Problem, n_ } from './ui.jsx';
import './humanfactors.css';

const EX_SEQ = 'E P C C M F2.5';

// ── Steering law and Model Human Processor ──
function HfSteering() {
  const [mode, setMode] = useState('steer');
  const [data, setData] = useState(S.EXAMPLE_DATA);
  const [designs, setDesigns] = useState(S.EXAMPLE_DESIGNS);
  const [tun, setTun] = useState({ shape: 'narrowing', A: 300, W: 40, W2: 10, R: 100 });
  const [seq, setSeq] = useState(EX_SEQ);
  const load = () => { setData(S.EXAMPLE_DATA); setDesigns(S.EXAMPLE_DESIGNS); setSeq(EX_SEQ); setTun({ shape: 'narrowing', A: 300, W: 40, W2: 10, R: 100 }); };

  const parsed = useMemo(() => S.parseSteeringData(data), [data]);
  const ids = new Set(parsed.rows.map((r) => r.ID));
  const fit = parsed.rows.length >= 3 && ids.size >= 2 ? S.fitSteering(parsed.rows) : null;
  const des = S.parseDesigns(designs);
  const tunId = S.steeringId({ shape: tun.shape, A: n_(tun.A), W: n_(tun.W), W2: n_(tun.W2), R: n_(tun.R) });
  const mhp = S.parseMhp(seq);
  const mt = mhp.steps.length ? S.mhpTotal(mhp.steps) : null;

  return (
    <div className="hf-root">
      <div className="calc-inputs ea-inputs">
        <Choice label="Model" value={mode} onChange={setMode} options={[['steer', 'Steering law'], ['mhp', 'Model Human Processor']]} />
      </div>
      <LoadExample onClick={load} />
      {mode === 'steer' ? (
        <>
          <Area label="Trials or condition means: A (path length), W (path width), T (ms); or ID, T" rows={8} value={data} onChange={setData} hint="One row per trial or condition. A and W in the same unit. A header row is optional." />
          {parsed.errors.length > 0 && <Problem>{parsed.errors[0]}{parsed.errors.length > 1 ? ` (and ${parsed.errors.length - 1} more)` : ''}</Problem>}
          {!fit && <Problem>Enter at least 3 rows with at least 2 different values of A/W.</Problem>}
          {fit && (
            <>
              <Result big={`${fmt(fit.a, 0)} + ${sig(fit.b, 3)} × A/W`} label="Fitted steering law, T in ms">
                <Stats rows={[
                  ['Slope b, 95% CI', `${sig(fit.b, 3)} ms (${sig(fit.bLo, 3)} to ${sig(fit.bHi, 3)})`],
                  ['Intercept a, 95% CI', `${fmt(fit.a, 0)} ms (${fmt(fit.aLo, 0)} to ${fmt(fit.aHi, 0)})`],
                  ['R²', sig(fit.r2, 3)],
                  ['Throughput 1/b', `${sig(fit.ip, 3)} ID units per second`],
                  ['Points, distinct A/W', `${fit.n}, ${ids.size}`],
                ]} />
              </Result>
              <LinePlot label="Steering time against index of difficulty" xLabel="Index of difficulty ID = A/W" yLabel="Time (ms)" xMin={0} yMin={0}
                series={[
                  { name: 'Observed', pts: parsed.rows.map((r) => [r.ID, r.T]), dots: true, width: 0.001 },
                  { name: 'Fitted T = a + b·ID', pts: [[0, fit.a], [Math.max(...ids) * 1.05, fit.a + fit.b * Math.max(...ids) * 1.05]], color: 'var(--c2)' },
                ]} />
              <h3 className="clu-h3">Predict designs</h3>
              <Area label="Designs: label, A, W (same unit as the data)" rows={4} value={designs} onChange={setDesigns} />
              {des.length > 0 && <Table label="Predicted steering times" head={['Design', 'A', 'W', 'ID = A/W', 'Predicted T (ms)']} rows={des.map((d) => [d.label, d.A, d.W, sig(d.ID, 3), fmt(fit.a + fit.b * d.ID, 0)])} />}
              <StudySummary {...S.steeringSummary(fit, parsed.rows, '')} />
            </>
          )}
          <section className="ea-card">
            <h4>Index of difficulty for other tunnel shapes</h4>
            <div className="calc-inputs ea-inputs">
              <Pick label="Tunnel" value={tun.shape} onChange={(v) => setTun({ ...tun, shape: v })} options={[['straight', 'Straight, constant width'], ['narrowing', 'Linearly narrowing or widening'], ['circle', 'Circular']]} />
              {tun.shape !== 'circle' && <Num label="Length A" value={tun.A} onChange={(v) => setTun({ ...tun, A: v })} min={0} />}
              {tun.shape === 'circle' && <Num label="Radius R" value={tun.R} onChange={(v) => setTun({ ...tun, R: v })} min={0} />}
              <Num label={tun.shape === 'narrowing' ? 'Width at start W₁' : 'Width W'} value={tun.W} onChange={(v) => setTun({ ...tun, W: v })} min={0} />
              {tun.shape === 'narrowing' && <Num label="Width at end W₂" value={tun.W2} onChange={(v) => setTun({ ...tun, W2: v })} min={0} />}
            </div>
            {Number.isFinite(tunId) && tunId > 0 ? <p className="hf-note"><b>ID = {sig(tunId, 4)}</b>{fit ? `; predicted time ${fmt(fit.a + fit.b * tunId, 0)} ms with the fit above` : ''}. {tun.shape === 'narrowing' ? 'ID = A·ln(W₁/W₂)/(W₁ − W₂), the integral of ds/W(s).' : tun.shape === 'circle' ? 'ID = 2πR/W.' : 'ID = A/W.'}</p> : <p className="hf-err">Enter positive sizes.</p>}
          </section>
        </>
      ) : (
        <>
          <Pick label="Start from a Card, Moran and Newell example" value="" onChange={(v) => v && setSeq(v)} options={[['', 'Choose…'], ...S.MHP_PRESETS]} />
          <Area label="Operator sequence" rows={2} value={seq} onChange={setSeq} hint="P = perceive (τP), C = cognitive cycle (τC), M = motor cycle (τM), E = eye movement; a number before a letter repeats it (3C); F followed by bits is an aimed movement (F2.5 = 2.5 bits × I_M)." />
          {mhp.errors.length > 0 && <Problem>{mhp.errors[0]}</Problem>}
          {mt && (
            <>
              <Result big={`${fmt(mt.t, 0)} ms`} label={`Middleman estimate (Fastman ${fmt(mt.lo, 0)} ms, Slowman ${fmt(mt.hi, 0)} ms)`} />
              <Bars label="Time by operator (middleman)" rows={mhp.steps.map((s, i) => { const p = s.op === 'F' ? S.IM : S.MHP[s.op]; const t = s.n * p.t; return [`${i + 1}. ${s.op === 'F' ? `Aimed move, ${s.n} bits` : `${s.n > 1 ? `${s.n} × ` : ''}${p.name}`}`, t / mt.t, `${fmt(t, 0)} ms`]; })} />
              <Table label="Model Human Processor parameters" head={['Operator', 'Middleman', 'Fastman', 'Slowman']} rows={[...Object.entries(S.MHP).map(([k, p]) => [`${k}: ${p.name}`, `${p.t} ms`, `${p.lo} ms`, `${p.hi} ms`]), ['F: Fitts slope I_M', `${S.IM.t} ms/bit`, `${S.IM.lo} ms/bit`, `${S.IM.hi} ms/bit`]]} />
              <StudySummary {...S.mhpSummary(mhp.steps, mt)} />
            </>
          )}
        </>
      )}
      <About method="steering-law" links={[['model-human-processor-calculation', 'Model Human Processor']]}>
        <p><b>Steering law</b> (Accot and Zhai 1997, "Beyond Fitts' law: models for trajectory-based HCI tasks", CHI '97, 295–302). The time to move through a tunnel is T = a + b·ID with ID = ∫<sub>C</sub> ds / W(s): A/W for a straight tunnel of length A and width W, A·ln(W₁/W₂)/(W₁ − W₂) for a linearly narrowing one, and 2πR/W for a circle. a and b are fitted by ordinary least squares; the intervals use the t distribution with n − 2 degrees of freedom. Checked against scipy's linregress and numerical integration.</p>
        <p><b>Model Human Processor</b> (Card, Moran and Newell 1983, The Psychology of Human-Computer Interaction, chapter 2). Perceptual cycle τP = 100 [50–200] ms, cognitive τC = 70 [25–170] ms, motor τM = 70 [30–100] ms, eye movement 230 [70–700] ms, and Fitts slope I_M = 100 [70–120] ms/bit. A sequence's time is the sum of its cycles; Fastman and Slowman sum the lower and upper values. Simple reaction P + C + M = 240 [105–470] ms, as in the book.</p>
        <p><b>When not to use it.</b> The steering law needs a constrained path where leaving it is an error; for free movements to a target use <Link to="/calculators/fitts">Fitts' law</Link>, for decisions <Link to="/calculators/hick">Hick-Hyman</Link>, and for whole tasks the <Link to="/calculators/klm">KLM</Link>. MHP sums are for comparing designs by their number of processing steps; they ignore learning, overlap and errors.</p>
      </About>
    </div>
  );
}

export default HfSteering;
