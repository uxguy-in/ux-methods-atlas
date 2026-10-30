import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as BD from './causal-bandit.js';
import { fmt, pctS } from './causal-core.js';
import { LinePlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Num, Result, Stats, Problem, About, Bars } from './ui.jsx';
import { useWorkerJob } from './causal-ui.jsx';
import './causal.css';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const POL_COLOR = { fixed: 'var(--ink-3)', thompson: 'var(--c1)', egreedy: 'var(--c2)', ucb: 'var(--c3)' };

function CausalBandit() {
  const [arms, setArms] = useState(BD.EXAMPLE.arms);
  const [T, setT] = useState(BD.EXAMPLE.T);
  const [batch, setBatch] = useState(BD.EXAMPLE.batch);
  const [sims, setSims] = useState(BD.EXAMPLE.sims);
  const [eps, setEps] = useState(BD.EXAMPLE.eps);
  const [seed, setSeed] = useState('1');
  const load = () => { setArms(BD.EXAMPLE.arms); setT(BD.EXAMPLE.T); setBatch(BD.EXAMPLE.batch); setSims(BD.EXAMPLE.sims); setEps(BD.EXAMPLE.eps); setSeed('1'); };

  const params = useMemo(() => {
    const p = arms.map(([, r]) => num(r) / 100);
    if (arms.length < 2) return { error: 'Add at least two arms.' };
    if (p.some((x) => !(x > 0 && x < 1))) return { error: 'Every arm needs a conversion rate between 0% and 100%.' };
    const t = Math.round(num(T)), b = Math.round(num(batch)), s = Math.round(num(sims)), e = num(eps);
    if (!(t >= 100 && t <= 1e6)) return { error: 'Visitors in the test must be between 100 and 1,000,000.' };
    if (!(b >= 1 && b <= t)) return { error: 'The batch size must be between 1 and the number of visitors.' };
    if (t / b > 5000) return { error: 'Use a larger batch: at most 5,000 batches per test (visitors ÷ batch size).' };
    if (!(s >= 50 && s <= 5000)) return { error: 'Use between 50 and 5,000 simulations.' };
    if (!(e >= 0 && e <= 1)) return { error: 'Epsilon must be between 0 and 1.' };
    return { p, T: t, batch: b, sims: s, eps: e, seed: Math.round(num(seed)) || 1 };
  }, [arms, T, batch, sims, eps, seed]);
  const job = params.error ? null : { type: 'bandit', params };
  const { result: r, busy, error } = useWorkerJob(job, JSON.stringify(params), (j) => BD.simulate(j.params));
  const names = arms.map(([n], i) => n || `Arm ${i + 1}`);
  const setArm = (i, k, v) => setArms((a) => a.map((x, j) => (j === i ? (k === 0 ? [v, x[1]] : [x[0], v]) : x)));
  const fresh = r && JSON.stringify(r.p) === JSON.stringify(params.p) && r.T === params.T;

  return (
    <div className="ca-root">
      <LoadExample onClick={load} />
      <section className="ea-card">
        <h4>Arms and their true conversion rates (your best guess)</h4>
        <div className="ca-arms">
          {arms.map(([n, rate], i) => (
            <div key={i} className="ca-arm">
              <input value={n} aria-label={`Arm ${i + 1} name`} onChange={(e) => setArm(i, 0, e.target.value)} />
              <input inputMode="decimal" value={rate} aria-label={`Arm ${i + 1} conversion rate (%)`} onChange={(e) => setArm(i, 1, e.target.value)} />
              <button type="button" className="btn ghost small" aria-label={`Remove arm ${i + 1}`} disabled={arms.length <= 2} onClick={() => setArms((a) => a.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <div className="ca-actions">{arms.length < 8 && <button type="button" className="btn ghost small" onClick={() => setArms((a) => [...a, [`Arm ${a.length + 1}`, '3.0']])}>+ Add arm</button>}<span className="ca-note">Rates in %.</span></div>
        <div className="calc-inputs ea-inputs">
          <Num label="Visitors in the test" value={T} onChange={setT} min={100} step={1000} />
          <Num label="Batch size (visitors between updates)" value={batch} onChange={setBatch} min={1} step={50} />
          <Num label="Epsilon (epsilon-greedy)" value={eps} onChange={setEps} min={0} max={1} step={0.05} />
          <Num label="Simulations" value={sims} onChange={setSims} min={50} max={5000} step={100} />
          <Num label="Random seed" value={seed} onChange={setSeed} />
        </div>
      </section>
      {params.error && <Problem>{params.error}</Problem>}
      {error && <Problem>{error}</Problem>}
      {busy && <p className="ca-note" role="status">Simulating {fmt(params.sims)} tests for each policy…</p>}
      {r && fresh && !params.error && (
        <>
          {(() => {
            const R = r.res, best = [...r.policies].sort((a, b) => R[a].regret - R[b].regret)[0];
            return (
              <Result big={BD.POLICY_NAME[best]} tone="good" label={`loses the fewest conversions: ${fmt(R[best].regret, 0)} of ${fmt(r.expectedBest, 0)} expected with the best arm alone (mean of ${fmt(r.sims)} simulations)`}>
                <Stats rows={[
                  ['Best arm', `${names[r.p.indexOf(r.best)]} (${pctS(r.best, 1)})`],
                  ['Gap to the runner-up arm', `${fmt((r.best - [...r.p].sort((a, b) => b - a)[1]) * 100, 2)} points`],
                  ['Allocation updated', `every ${fmt(r.batch)} visitors (${fmt(Math.ceil(r.T / r.batch))} batches)`],
                ]} />
              </Result>
            );
          })()}
          <Table label="Policy comparison" head={['Policy', 'Conversions lost (regret)', 'Traffic to best arm', 'Picks the right winner', 'Total conversions']}
            rows={r.policies.map((x) => { const v = r.res[x]; return [BD.POLICY_NAME[x], `${fmt(v.regret, 1)} ± ${fmt(1.96 * v.regretSe, 1)}`, pctS(v.bestShare, 1), `${pctS(v.pCorrect, 1)} ± ${fmt(196 * v.pCorrectSe, 1)}`, fmt(v.conversions, 0)]; })} />
          <p className="ca-note">± values are 95% Monte Carlo margins (simulation noise), not uncertainty about your real rates.</p>
          <h3 className="clu-h3">Cumulative regret over the test</h3>
          <LinePlot label="Mean cumulative conversions lost by each policy" xLabel="Visitors" yLabel="Conversions lost" xFmt={(v) => fmt(v)} yFmt={(v) => fmt(v)}
            series={r.policies.map((x) => ({ name: BD.POLICY_NAME[x], pts: [[0, 0], ...r.res[x].curve], color: POL_COLOR[x], width: x === 'fixed' ? 2 : 2.6, dash: x === 'fixed' ? '5 4' : undefined }))} />
          <h3 className="clu-h3">Share of traffic sent to the best arm</h3>
          <Bars label="Share of traffic to the best arm by policy" rows={r.policies.map((x) => [BD.POLICY_NAME[x], r.res[x].bestShare, pctS(r.res[x].bestShare, 0)])} />
          <StudySummary {...BD.banditSummary(r)} />
        </>
      )}
      <About method="multi-armed-bandit-testing-for-adaptive-ux" links={[['thompson-sampling-bandits', 'Thompson sampling bandits'], ['a-b-testing', 'A/B testing'], ['bayesian-a-b-testing-with-expected-loss', 'Bayesian A/B testing with expected loss']]}>
        <p><b>Idea.</b> A fixed A/B split sends the same share of visitors to every version until the test ends. A bandit shifts traffic towards the versions that are doing well while the test runs, so fewer visitors see weak versions, at the price of learning less about them. This page simulates both with the conversion rates you expect, so you can see the trade-off before you choose.</p>
        <p><b>Policies.</b> Visitors arrive in batches; after each batch the allocation is updated. <i>Fixed split</i>: 1/K to each arm. <i>Thompson sampling</i> (Thompson 1933): each arm's share is the posterior probability that it is best, with Beta(1 + conversions, 1 + non-conversions) posteriors, estimated from 64 joint posterior draws (normal draws with the same mean and variance once both Beta parameters exceed 30). <i>Epsilon-greedy</i>: share ε/K to every arm and 1 − ε more to the arm with the highest observed rate. <i>UCB1</i> (Auer, Cesa-Bianchi and Fischer 2002): the whole batch goes to the arm with the highest rate + √(2 ln t / n). Arms with no visitors yet are tried first.</p>
        <p><b>Measures.</b> Regret = Σ visitors × (best rate − rate of the arm shown), the expected conversions lost against always showing the best arm. "Picks the right winner": the arm with the highest observed rate (posterior mean for Thompson sampling) at the end is a best arm. Each is averaged over the simulations; the ± values are 1.96 Monte Carlo standard errors. Conversions are exact binomial draws. The simulation runs in a Web Worker. Checked against exact binomial results (a fixed split's regret is deterministic) and an independent numpy simulation of the same policies.</p>
        <p><b>When not to use it.</b> When you need an unbiased estimate of each version's effect to report (use a fixed split), when conversions arrive days after the visit, when rates drift over the test (bandits can lock on early), or when you have only two arms and plenty of traffic, where the gain is small.</p>
      </About>
    </div>
  );
}

export default CausalBandit;
