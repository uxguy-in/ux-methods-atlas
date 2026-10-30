import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as VI from './decisions-voi.js';
import { money, fmt, pctS } from './decisions-core.js';
import { LinePlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import { useWorkerJob } from './decisions-ui.jsx';

const Z90 = 1.6448536269514722;
// Example: is it worth A/B testing a one-page checkout before rolling it out? Conversion in %, £400,000 a year per
// percentage point; the new design costs £60,000 to finish and roll out.
const EX_N = {
  unit: '£', metric: 'Checkout conversion (%)', V: '400000',
  options: [{ name: 'Keep current checkout', lo: '3.0', hi: '3.0', cost: '0' }, { name: 'One-page checkout', lo: '2.52', hi: '3.68', cost: '60000' }],
  n: '4000', sigma: '17.3', fixed: '8000', per: '2',
};
// Discrete example: build self-serve onboarding? Payoffs in £ thousands over two years.
const EX_D = {
  scen: ['Strong demand', 'Moderate demand', 'Weak demand'], probs: ['0.3', '0.4', '0.3'],
  opts: ['Build full self-serve', 'Build a light wizard', 'Do not build'],
  U: [['500', '150', '-250'], ['200', '120', '-40'], ['0', '0', '0']],
  res: ['Interviews and fake door positive', 'Mixed', 'Negative'],
  L: [['0.7', '0.25', '0.1'], ['0.2', '0.5', '0.3'], ['0.1', '0.25', '0.6']], cost: '15', unit: '£k',
};
// Hillier and Lieberman's Goferbroke example (Introduction to Operations Research, ch. 15): drill or sell oil land,
// with a seismic survey costing 30 (thousand dollars). EVPI 142.5, EVSI 53.
const EX_G = {
  scen: ['Oil', 'Dry'], probs: ['0.25', '0.75'], opts: ['Drill for oil', 'Sell the land'], U: [['700', '-100'], ['90', '90']],
  res: ['Favourable seismic soundings', 'Unfavourable soundings'], L: [['0.6', '0.2'], ['0.4', '0.8']], cost: '30', unit: '$k',
};
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const setAt = (arr, i, v) => arr.map((x, j) => (j === i ? v : x));
const setAt2 = (arr, i, j, v) => arr.map((r, a) => (a === i ? r.map((x, b) => (b === j ? v : x)) : r));

function Cell({ value, onChange, label, wide }) {
  return <input className={`ea-mini${wide ? ' wide' : ''}`} value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} />;
}

// ── Expected value of information ──
function DecValueOfInfo() {
  const [mode, setMode] = useState('normal');
  const [N, setNState] = useState(EX_N);
  const [D, setD] = useState(EX_D);
  const setNf = (k, v) => setNState((s) => ({ ...s, [k]: v }));
  const loadExample = () => { setNState(EX_N); setD(EX_D); };

  // ── Normal mode ──
  const nIn = useMemo(() => {
    const options = N.options.map((o) => {
      const lo = num(o.lo), hi = num(o.hi);
      return { name: o.name || 'Option', mean: (lo + hi) / 2, sd: Math.abs(hi - lo) / (2 * Z90), cost: num(o.cost) || 0 };
    });
    const p = { options, V: num(N.V), n: Math.max(0, Math.round(num(N.n))), sigma: num(N.sigma), studyFixed: num(N.fixed) || 0, studyPer: num(N.per) || 0 };
    const bad = options.length < 2 ? 'Enter at least two options.' : options.some((o) => !Number.isFinite(o.mean) || !Number.isFinite(o.sd)) ? 'Every option needs a low and high value.' : !Number.isFinite(p.V) || p.V === 0 ? 'Enter the value of one unit of the metric.' : !(p.sigma >= 0) ? 'Enter the participant-level spread (σ).' : !Number.isFinite(p.n) ? 'Enter the planned sample size.' : !options.some((o) => o.sd > 0) ? 'At least one option needs a range (low below high), or there is nothing to learn.' : null;
    return { p: { ...p, nMax: Math.max(4 * Math.max(p.n, 10), 50) }, bad };
  }, [N]);
  const needsMC = mode === 'normal' && !nIn.bad && !VI.gainAnalytic(nIn.p.options.map((o) => nIn.p.V * o.mean - o.cost), nIn.p.options.map((o) => Math.abs(nIn.p.V) * o.sd));
  const pageRes = useMemo(() => (mode === 'normal' && !nIn.bad && !needsMC ? VI.voiNormal(nIn.p) : null), [mode, nIn, needsMC]);
  const job = needsMC ? { type: 'voi', params: nIn.p, draws: 200000, seed: 11 } : null;
  const mc = useWorkerJob(job, needsMC ? JSON.stringify(nIn.p) : 'none', (j) => VI.voiNormal(j.params, { draws: j.draws, seed: j.seed }));
  const nr = needsMC ? mc.result : pageRes;
  const unit = N.unit || '£';
  const $ = (x) => money(x, unit);

  // ── Discrete mode ──
  const dIn = useMemo(() => {
    const probs = D.probs.map(num), U = D.U.map((r) => r.map(num)), L = D.L.map((r) => r.map(num)), cost = num(D.cost) || 0;
    const sP = probs.reduce((a, b) => a + b, 0);
    const colSums = probs.map((_, s) => L.reduce((a, r) => a + r[s], 0));
    const bad = [...probs, ...U.flat(), ...L.flat()].some((v) => !Number.isFinite(v)) ? 'Fill in every cell with a number.'
      : probs.some((v) => v < 0) || L.flat().some((v) => v < 0) ? 'Probabilities cannot be negative.'
        : Math.abs(sP - 1) > 0.005 ? `The scenario probabilities add up to ${fmt(sP, 3)}; they should add up to 1.`
          : colSums.some((c) => Math.abs(c - 1) > 0.005) ? `Each scenario's column of study results should add up to 1 (now ${colSums.map((c) => fmt(c, 2)).join(', ')}).` : null;
    return { probs, U, L, cost, bad };
  }, [D]);
  const dr = mode === 'discrete' && !dIn.bad ? VI.voiDiscrete(dIn) : null;
  const dU = D.unit || '£';
  const $d = (x) => money(x, dU, Math.abs(x) < 10000 && Math.abs(x - Math.round(x)) > 1e-9 ? 1 : 0);

  const S = D.scen.length;
  const addScen = () => setD((d) => ({ ...d, scen: [...d.scen, `Scenario ${d.scen.length + 1}`], probs: [...d.probs, '0'], U: d.U.map((r) => [...r, '0']), L: d.L.map((r) => [...r, '0']), res: d.res }));
  const delScen = () => S > 2 && setD((d) => ({ ...d, scen: d.scen.slice(0, -1), probs: d.probs.slice(0, -1), U: d.U.map((r) => r.slice(0, -1)), L: d.L.map((r) => r.slice(0, -1)) }));
  const addOpt = () => setD((d) => ({ ...d, opts: [...d.opts, `Option ${d.opts.length + 1}`], U: [...d.U, d.scen.map(() => '0')] }));
  const delOpt = () => D.opts.length > 2 && setD((d) => ({ ...d, opts: d.opts.slice(0, -1), U: d.U.slice(0, -1) }));
  const addRes = () => setD((d) => ({ ...d, res: [...d.res, `Result ${d.res.length + 1}`], L: [...d.L, d.scen.map(() => '0')] }));
  const delRes = () => D.res.length > 2 && setD((d) => ({ ...d, res: d.res.slice(0, -1), L: d.L.slice(0, -1) }));
  const [acc, setAcc] = useState('0.7');
  const useAccuracy = () => { const a = Math.min(1, Math.max(0, num(acc) || 0)); const L = VI.accuracyMatrix(S, a).map((r) => r.map((v) => String(+v.toFixed(4)))); setD((d) => ({ ...d, res: d.scen.map((s) => `Study points to ${s}`), L })); };

  return (
    <div className="dc-root">
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Model" value={mode} onChange={setMode} options={[['normal', 'Uncertain payoffs (normal prior)'], ['discrete', 'Scenarios (discrete)']]} />
      </div>
      {mode === 'normal' ? (
        <>
          <section className="ea-card">
            <h4>The decision</h4>
            <p className="dc-note">For each option, give the range you are 90% sure the metric falls in if you choose it (low = high means you already know it). The payoff is value per unit × metric − cost.</p>
            <div className="calc-inputs ea-inputs">
              <label className="calc-field"><span>Metric</span><input className="ea-mini wide" value={N.metric} onChange={(e) => setNf('metric', e.target.value)} /></label>
              <Num label="Value of one unit of the metric" value={N.V} onChange={(v) => setNf('V', v)} hint="Money per unit, e.g. per percentage point per year" />
              <label className="calc-field"><span>Currency</span><input className="ea-mini" value={N.unit} onChange={(e) => setNf('unit', e.target.value.slice(0, 4))} /></label>
            </div>
            <div className="clu-scroll ea-contain"><table className="clu-table clu-num" aria-label="Options">
              <thead><tr><th>Option</th><th>90% low</th><th>90% high</th><th>Cost to choose it</th><th>Prior mean ± SD</th></tr></thead>
              <tbody>{N.options.map((o, i) => (
                <tr key={i}>
                  <td><Cell wide value={o.name} label={`Option ${i + 1} name`} onChange={(v) => setNf('options', setAt(N.options, i, { ...o, name: v }))} /></td>
                  <td><Cell value={o.lo} label={`${o.name} low`} onChange={(v) => setNf('options', setAt(N.options, i, { ...o, lo: v }))} /></td>
                  <td><Cell value={o.hi} label={`${o.name} high`} onChange={(v) => setNf('options', setAt(N.options, i, { ...o, hi: v }))} /></td>
                  <td><Cell value={o.cost} label={`${o.name} cost`} onChange={(v) => setNf('options', setAt(N.options, i, { ...o, cost: v }))} /></td>
                  <td>{nIn.p.options[i] && Number.isFinite(nIn.p.options[i].mean) ? `${fmt(nIn.p.options[i].mean, 3)} ± ${fmt(nIn.p.options[i].sd, 3)}` : ''}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="dc-actions">
              {N.options.length < 6 && <button type="button" className="btn ghost small" onClick={() => setNf('options', [...N.options, { name: `Option ${N.options.length + 1}`, lo: '', hi: '', cost: '0' }])}>+ Add option</button>}
              {N.options.length > 2 && <button type="button" className="btn ghost small" onClick={() => setNf('options', N.options.slice(0, -1))}>Remove last option</button>}
            </div>
          </section>
          <section className="ea-card">
            <h4>The study</h4>
            <div className="calc-inputs ea-inputs">
              <Num label="Participants per option (n)" value={N.n} onChange={(v) => setNf('n', v)} min={0} />
              <Num label="Spread between participants (σ)" value={N.sigma} onChange={(v) => setNf('sigma', v)} min={0} hint="SD of one person's metric; for a rate p in %, 100·√(p(1−p))" />
              <Num label="Fixed study cost" value={N.fixed} onChange={(v) => setNf('fixed', v)} min={0} />
              <Num label="Cost per participant" value={N.per} onChange={(v) => setNf('per', v)} min={0} />
            </div>
          </section>
          {nIn.bad && <Problem>{nIn.bad}</Problem>}
          {!nIn.bad && needsMC && mc.busy && <p className="dc-note" role="status">Simulating 200,000 draws for {N.options.length} options…</p>}
          {!nIn.bad && mc.error && <Problem>{mc.error}</Problem>}
          {!nIn.bad && nr && (
            <>
              <Result big={$(nr.evsi.net)} tone={nr.evsi.net > 0 ? 'good' : 'bad'} label={`Net value of the study: EVSI ${$(nr.evsi.value)} minus cost ${$(nr.cost)}. ${nr.evsi.net > 0 ? 'Worth running.' : 'Not worth running at this price.'}`}>
                <Stats rows={[
                  ['Best option without research', nr.P[nr.best].name],
                  ['EVPI (perfect information)', $(nr.evpi.value) + (nr.exact ? '' : ` ± ${$(1.96 * nr.evpi.se)}`)],
                  ['EVSI (this study)', $(nr.evsi.value) + (nr.exact ? '' : ` ± ${$(1.96 * nr.evsi.se)}`)],
                  ['Chance the study changes the choice', pctS(nr.evsi.pChange)],
                  ['Best sample size tried', nr.optimal.net > 0 ? `${fmt(nr.optimal.n)} per option (net ${$(nr.optimal.net)})` : 'None pays off'],
                  ['Method', nr.exact ? 'Exact (normal loss integral)' : 'Monte Carlo, 200,000 draws (± is 95% MC error)'],
                ]} />
              </Result>
              <Table label="Payoff of each option" head={['Option', 'Expected payoff', 'Prior SD of payoff', 'SD the study can resolve']} rows={nr.P.map((p, i) => [p.name, $(p.mu), $(p.s), $(VI.preSd(nIn.p.options[i], nIn.p.n, nIn.p.sigma, nIn.p.V))])} />
              <h3 className="clu-h3">Value of the study by sample size</h3>
              <LinePlot label="EVSI, study cost and net value against participants per option" xLabel="Participants per option" yLabel={`Value (${unit})`} xFmt={(v) => fmt(v)} yFmt={(v) => (Math.abs(v) >= 1e6 ? `${fmt(v / 1e6, 1)}M` : Math.abs(v) >= 1e3 ? `${fmt(v / 1e3, 0)}k` : fmt(v))}
                series={[
                  { name: 'EVSI', pts: nr.curve.map((c) => [c.n, c.value]) },
                  { name: 'Study cost', pts: nr.curve.map((c) => [c.n, c.cost]), dash: '5 4' },
                  { name: 'Net value (EVSI − cost)', pts: nr.curve.map((c) => [c.n, c.net]), width: 3 },
                ]}
                hlines={[{ y: nr.evpi.value, label: 'EVPI (upper limit)' }]} vlines={[{ x: nIn.p.n, label: `n = ${fmt(nIn.p.n)}` }]} />
              <StudySummary {...VI.voiSummary({ mode: 'normal', names: nr.P.map((p) => p.name), evpi: nr.evpi.value, evsi: nr.evsi.value, cost: nr.cost, best: nr.best, pChange: nr.evsi.pChange, unit, n: nIn.p.n, optimalN: nr.optimal.n, optimalNet: nr.optimal.net, exact: nr.exact })} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="dc-actions"><button type="button" className="btn ghost small" onClick={() => setD(EX_G)}>Load textbook example (Goferbroke)</button><label className="calc-field"><span>Currency</span><input className="ea-mini" value={D.unit} onChange={(e) => setD({ ...D, unit: e.target.value.slice(0, 4) })} /></label></div>
          <section className="ea-card">
            <h4>Scenarios and payoffs</h4>
            <div className="clu-scroll ea-contain"><table className="clu-table clu-num" aria-label="Payoff table">
              <thead><tr><th>Option \ scenario</th>{D.scen.map((s, j) => <th key={j}><Cell value={s} label={`Scenario ${j + 1} name`} onChange={(v) => setD({ ...D, scen: setAt(D.scen, j, v) })} /></th>)}</tr></thead>
              <tbody>
                <tr><td><b>Prior probability</b></td>{D.probs.map((p, j) => <td key={j}><Cell value={p} label={`Probability of ${D.scen[j]}`} onChange={(v) => setD({ ...D, probs: setAt(D.probs, j, v) })} /></td>)}</tr>
                {D.opts.map((o, i) => <tr key={i}><td><Cell wide value={o} label={`Option ${i + 1} name`} onChange={(v) => setD({ ...D, opts: setAt(D.opts, i, v) })} /></td>{D.U[i].map((u, j) => <td key={j}><Cell value={u} label={`${o} if ${D.scen[j]}`} onChange={(v) => setD({ ...D, U: setAt2(D.U, i, j, v) })} /></td>)}</tr>)}
              </tbody>
            </table></div>
            <div className="dc-actions">
              <button type="button" className="btn ghost small" onClick={addScen}>+ Scenario</button>{S > 2 && <button type="button" className="btn ghost small" onClick={delScen}>− Scenario</button>}
              <button type="button" className="btn ghost small" onClick={addOpt}>+ Option</button>{D.opts.length > 2 && <button type="button" className="btn ghost small" onClick={delOpt}>− Option</button>}
            </div>
          </section>
          <section className="ea-card">
            <h4>What the study could tell you</h4>
            <p className="dc-note">P(study result | scenario): how likely each result is if that scenario is true. Each column adds up to 1.</p>
            <div className="clu-scroll ea-contain"><table className="clu-table clu-num" aria-label="Study likelihoods">
              <thead><tr><th>Result \ scenario</th>{D.scen.map((s, j) => <th key={j}>{s}</th>)}</tr></thead>
              <tbody>{D.res.map((r, i) => <tr key={i}><td><Cell wide value={r} label={`Result ${i + 1} name`} onChange={(v) => setD({ ...D, res: setAt(D.res, i, v) })} /></td>{D.L[i].map((l, j) => <td key={j}><Cell value={l} label={`P(${r} | ${D.scen[j]})`} onChange={(v) => setD({ ...D, L: setAt2(D.L, i, j, v) })} /></td>)}</tr>)}</tbody>
            </table></div>
            <div className="dc-actions">
              <button type="button" className="btn ghost small" onClick={addRes}>+ Result</button>{D.res.length > 2 && <button type="button" className="btn ghost small" onClick={delRes}>− Result</button>}
              <label className="calc-field"><span>Or: study accuracy</span><input className="ea-mini" value={acc} onChange={(e) => setAcc(e.target.value)} /></label>
              <button type="button" className="btn ghost small" onClick={useAccuracy}>Fill from accuracy</button>
              <Num label="Study cost" value={D.cost} onChange={(v) => setD({ ...D, cost: v })} min={0} />
            </div>
          </section>
          {dIn.bad && <Problem>{dIn.bad}</Problem>}
          {dr && (
            <>
              <Result big={$d(dr.net)} tone={dr.net > 0 ? 'good' : 'bad'} label={`Net value of the study: EVSI ${$d(dr.evsi)} minus cost ${$d(dr.cost)}.`}>
                <Stats rows={[
                  ['Best option without research', `${D.opts[dr.best]} (expected ${$d(dr.evNo)})`],
                  ['Expected value with perfect information', $d(dr.evPerfect)],
                  ['EVPI', $d(dr.evpi)],
                  ['Expected value with the study (before its cost)', $d(dr.evSample)],
                  ['EVSI', $d(dr.evsi)],
                  ['Chance the study changes the choice', pctS(dr.pChange)],
                ]} />
              </Result>
              <Table label="Expected payoff of each option" head={['Option', 'Expected payoff now']} rows={D.opts.map((o, i) => [i === dr.best ? <b key="b">{o}</b> : o, $d(dr.eu[i])])} />
              <h3 className="clu-h3">Decision rule after the study</h3>
              <Table label="Best choice after each study result" head={['If the study says', 'Chance', ...D.scen.map((s) => `P(${s})`), 'Then choose', 'Expected payoff']}
                rows={dr.results.map((x) => [D.res[x.r], pctS(x.pr, 1), ...x.post.map((p) => pctS(p, 1)), x.choice !== dr.best ? <b key="c">{D.opts[x.choice]}</b> : D.opts[x.choice], $d(x.ev)])} />
              <StudySummary {...VI.voiSummary({ mode: 'discrete', names: D.opts, evpi: dr.evpi, evsi: dr.evsi, cost: dr.cost, best: dr.best, pChange: dr.pChange, unit: dU })} />
            </>
          )}
        </>
      )}
      <About method="expected-value-of-information-analysis" links={[['clinical-decision-analysis-decision-trees', 'Decision trees'], ['bayesian-a-b-testing-with-expected-loss', 'Bayesian A/B testing with expected loss'], ['scenario-generation-under-uncertainty', 'Scenario generation under uncertainty']]}>
        <p><b>Idea.</b> Research is worth something only if it might change what you do. The expected value of perfect information, EVPI = E[max over options of the payoff] − max over options of E[payoff], is what you would pay to know the true payoffs before choosing. The expected value of sample information (EVSI) is the same with the study's noisy answer instead of the truth. A study is worth running when EVSI exceeds its cost (Raiffa and Schlaifer 1961; Howard 1966).</p>
        <p><b>Normal model.</b> Option i's metric has prior N(m_i, s_i²), with s_i = (90% high − 90% low)/(2 × 1.645); its payoff is V·θ_i − cost_i. A study with n participants per option, each with spread σ, gives a posterior mean whose prior distribution (the preposterior) has SD s_pre = s·√(s²/(s² + σ²/n)). For two options with payoff difference D ~ N(M, S²), EVPI = S·L(|M|/S), where L(z) = φ(z) − z(1 − Φ(z)) is the unit normal loss integral; EVSI uses S_pre = √(s_pre,1² + s_pre,2²) in place of S. The chance the study changes the choice is Φ(−|M|/S_pre). With one uncertain option against fixed ones, E[max(X, c)] = c + s·L((c − μ)/s). With three or more uncertain options, E[max] has no closed form and is estimated by Monte Carlo (200,000 draws in a Web Worker, common random numbers across sample sizes, with its standard error shown). Checked against scipy numerical integration and a numpy simulation.</p>
        <p><b>Scenario model.</b> With scenario probabilities p_s, payoffs U_is and study likelihoods P(r | s): EVPI = Σ_s p_s max_i U_is − max_i Σ_s p_s U_is. For each result r, P(r) = Σ_s p_s P(r | s) and the posterior is p_s P(r | s)/P(r) (Bayes' rule); EVSI = Σ_r P(r) max_i Σ_s P(s | r) U_is − max_i Σ_s p_s U_is. Checked against Hillier and Lieberman's Goferbroke example (EVPI 142.5, EVSI 53 thousand dollars).</p>
        <p><b>When not to use it.</b> When you cannot put the outcomes in a common unit (money, users, hours), or when the decision is not really open (it has been made, or will be made on other grounds), the numbers mean little. The answer depends strongly on the prior ranges, so elicit them from several people before the study, not after.</p>
      </About>
    </div>
  );
}

export default DecValueOfInfo;
