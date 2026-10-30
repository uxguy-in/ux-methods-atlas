import { useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as Q from './signals-queue.js';
import { BarChart, LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Choice, Num, Result, Stats, Problem, About, num, pct, sig, n_ } from './ui.jsx';

function ErlangMode() {
  const ex = { calls: '100', interval: '30', aht: '180', t: '20', target: '80', shrink: '30', occ: '100' };
  const [v, setV] = useState(ex);
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const o = { calls: n_(v.calls), interval: n_(v.interval) * 60, aht: n_(v.aht), t: n_(v.t), target: n_(v.target) / 100, shrinkage: n_(v.shrink) / 100, maxOcc: n_(v.occ) / 100 };
  const ok = o.calls > 0 && o.interval > 0 && o.aht > 0 && o.t >= 0 && o.target > 0 && o.target < 1 && o.shrinkage >= 0 && o.shrinkage < 1 && o.maxOcc > 0 && o.maxOcc <= 1;
  const r = ok ? Q.agentsNeeded(o) : null;
  return (
    <>
      <LoadExample onClick={() => setV(ex)}>Load example (100 contacts per 30 minutes, 80% in 20 seconds)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Num label="Contacts per interval" value={v.calls} onChange={set('calls')} min={0} step="any" />
        <Num label="Interval" value={v.interval} onChange={set('interval')} suffix="minutes" />
        <Num label="Average handling time" value={v.aht} onChange={set('aht')} suffix="seconds" hint="Talk or chat time plus wrap-up." />
        <Num label="Answer within" value={v.t} onChange={set('t')} suffix="seconds" />
        <Num label="Service-level target" value={v.target} onChange={set('target')} suffix="%" />
        <Num label="Shrinkage" value={v.shrink} onChange={set('shrink')} suffix="%" hint="Breaks, training, absence: time paid but not answering." />
        <Num label="Maximum occupancy" value={v.occ} onChange={set('occ')} suffix="%" hint="100 = no cap. Many centres cap at 85 to 90%." />
      </div>
      {!ok || !r ? <Problem>Enter contacts, interval and handling time above 0, a target between 0 and 100%, shrinkage below 100% and a maximum occupancy up to 100%.</Problem> : (
        <>
          <Result big={`${r.agents} agents`} tone="good" label={`${pct(r.sl, 1)} answered within ${v.t} s; average speed of answer ${num(r.ASA, 1)} s; occupancy ${pct(r.occupancy, 0)}; ${r.staff} staff to schedule with ${v.shrink}% shrinkage`}>
            <p>Traffic intensity {num(r.A, 2)} Erlangs ({num(r.lambda * 3600, 1)} contacts per hour × {v.aht} s).</p>
          </Result>
          <h3 className="clu-h3">Service level by number of agents</h3>
          <BarChart label="Service level for each number of agents" height={220} bars={r.table.map((m) => ({ label: String(m.c), value: m.sl * 100, tone: m.c === r.agents ? 'ok' : m.sl < o.target ? 'bad' : '', top: `${Math.round(m.sl * 100)}%` }))} yMax={100} yFmt={(x) => `${x}%`} refY={o.target * 100} refLabel={`target ${v.target}%`} />
          <Table label="Erlang C by number of agents" head={['Agents', 'Chance of waiting', `Answered in ${v.t} s`, 'Average speed of answer', 'Occupancy', 'Average queue']}
            rows={r.table.map((m) => ({ cls: m.c === r.agents ? 'tl-cell-ok' : '', cells: [m.c, pct(m.C, 1), pct(m.sl, 1), `${num(m.ASA, 1)} s`, pct(m.occupancy, 0), num(m.Lq, 2)] }))} />
          <h3 className="clu-h3">Chance of waiting longer than t, with {r.agents} agents</h3>
          <LinePlot label="Probability of waiting longer than t seconds" height={220} series={[{ name: 'P(wait > t)', pts: Array.from({ length: 61 }, (_, i) => [i * 2, r.pWaitOver(i * 2) * 100]) }]} xLabel="Seconds" yLabel="Share waiting longer (%)" yMin={0} yFmt={(x) => `${x}%`} />
          <StudySummary {...Q.summaryErlang(r, o)} />
        </>
      )}
    </>
  );
}

function MM1Mode() {
  const [lam, setLam] = useState('8');
  const [mu, setMu] = useState('10');
  const [unit, setUnit] = useState('minutes');
  const r = Q.mm1(n_(lam), n_(mu));
  const per = unit.replace(/s$/, '');
  return (
    <>
      <LoadExample onClick={() => { setLam('8'); setMu('10'); setUnit('minutes'); }}>Load example (help desk: 8 arrivals and 10 served per hour)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Num label="Arrival rate λ" value={lam} onChange={setLam} step="any" suffix={`per ${per === 'minute' ? 'hour' : 'time unit'}`} />
        <Num label="Service rate μ" value={mu} onChange={setMu} step="any" suffix={`per ${per === 'minute' ? 'hour' : 'time unit'}`} hint="How many one server can finish per time unit when busy (1 / mean service time)." />
        <Choice label="Show times in" value={unit} onChange={setUnit} options={[['minutes', 'Minutes (rates per hour)'], ['units', 'The rates\' time unit']]} />
      </div>
      {!r ? <Problem>Enter arrival and service rates above 0.</Problem> : !r.stable ? <Problem>Utilisation is {pct(r.rho, 0)}: with arrivals as fast as or faster than service, the queue grows without limit.</Problem> : (() => {
        const k = unit === 'minutes' ? 60 : 1, u = unit === 'minutes' ? 'minutes' : 'time units';
        const shown = { ...r, W: r.W * k, Wq: r.Wq * k };
        return (
          <>
            <Result big={`W = ${sig(shown.W, 3)} ${u}`} label={`utilisation ρ = ${pct(r.rho, 0)}; waiting time Wq = ${sig(shown.Wq, 3)} ${u}; L = ${sig(r.L, 3)} in the system`} />
            <Stats rows={[['Utilisation ρ', pct(r.rho, 1)], ['In the system, L', sig(r.L, 4)], ['Waiting, Lq', sig(r.Lq, 4)], [`Time in system, W`, `${sig(shown.W, 4)} ${u}`], ['Time waiting, Wq', `${sig(shown.Wq, 4)} ${u}`], ['Chance of waiting', pct(r.pWait, 1)], ['Nobody there', pct(r.pN(0), 1)]]} />
            <h3 className="clu-h3">Waiting time against utilisation (same service rate)</h3>
            <LinePlot label="Average wait against utilisation" height={220} series={[{ name: 'Wq', pts: Array.from({ length: 19 }, (_, i) => { const p = 0.05 * (i + 1); return [p * 100, (p / (n_(mu) * (1 - p))) * k]; }) }, { name: 'This queue', pts: [[r.rho * 100, shown.Wq]], dots: true, line: false, color: 'var(--bad)', r: 5 }]} xLabel="Utilisation (%)" yLabel={`Average wait (${u})`} xFmt={(x) => `${x}%`} />
            <StudySummary {...Q.summaryMM1(shown, u)} />
          </>
        );
      })()}
    </>
  );
}

function LittleMode() {
  const [L, setL] = useState('');
  const [lam, setLam] = useState('40');
  const [W, setW] = useState('5');
  const r = Q.little({ L: n_(L), lambda: n_(lam), W: n_(W) });
  return (
    <>
      <LoadExample onClick={() => { setL(''); setLam('40'); setW('5'); }}>Load example (40 tickets a day, 5 days each)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Num label="Items in the system, L" value={L} onChange={setL} step="any" hint="Leave the one you want blank." />
        <Num label="Arrival rate, λ" value={lam} onChange={setLam} step="any" suffix="per time unit" />
        <Num label="Time in the system, W" value={W} onChange={setW} step="any" suffix="time units" />
      </div>
      {!r ? <Problem>Enter any two of L, λ and W, above 0.</Problem> : (
        <>
          <Result big={r.solved === 'L' ? `L = ${sig(r.L, 4)}` : r.solved === 'lambda' ? `λ = ${sig(r.lambda, 4)}` : `W = ${sig(r.W, 4)}`} label={`L = λ × W: ${sig(r.L, 4)} = ${sig(r.lambda, 4)} × ${sig(r.W, 4)}`} />
          <StudySummary {...Q.summaryLittle(r)} />
        </>
      )}
    </>
  );
}

// ── Queueing ──
function SignalsQueueing() {
  const [mode, setMode] = useState('erlang');
  const M = { erlang: ErlangMode, mm1: MM1Mode, little: LittleMode }[mode];
  return (
    <>
      <div className="calc-inputs sg-inputs">
        <Choice label="Model" value={mode} onChange={setMode} options={[['erlang', 'Staffing (M/M/c, Erlang C)'], ['mm1', 'Single server (M/M/1)'], ['little', "Little's law"]]} />
      </div>
      <M key={mode} />
      <About method="queueing-theory-and-littles-law">
        <p><b>Little's law.</b> L = λW: the average number in a stable system equals the arrival rate times the average time each item spends in it, whatever the arrival and service patterns (Little 1961, Operations Research 9(3)).</p>
        <p><b>M/M/1.</b> Random (Poisson) arrivals at rate λ, one server with exponential service at rate μ, ρ = λ/μ &lt; 1: L = ρ/(1 − ρ), Lq = ρ²/(1 − ρ), W = 1/(μ − λ), Wq = ρ/(μ − λ), P(wait &gt; t) = ρe^(−(μ − λ)t).</p>
        <p><b>Erlang C (M/M/c).</b> Traffic A = λ × AHT in Erlangs; with c &gt; A agents, Erlang B is computed by the recursion B(k) = A·B(k − 1)/(k + A·B(k − 1)) and the chance of waiting is C = cB/(c − A(1 − B)). Service level = 1 − C·e^(−(c − A)t/AHT); average speed of answer = C·AHT/(c − A); occupancy = A/c. Agents needed is the smallest c meeting the service-level target (and the occupancy cap); staff = ⌈c/(1 − shrinkage)⌉. Checked against the pyworkforce package and the Call Centre Helper worked example (100 calls in 30 minutes, 180 s handling time, 80% in 20 s: 68.21% wait with 11 agents; 14 agents needed).</p>
        <p><b>When not to use it.</b> Erlang C assumes nobody abandons, every agent handles every contact type, and contacts arrive at random within the interval. With high abandonment use Erlang A; with several skills, channels or chat concurrency, or with strongly variable handling times, simulate the service instead. All three models describe long-run averages, not the busiest five minutes.</p>
      </About>
    </>
  );
}

export default SignalsQueueing;
