import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as MK from './causal-market.js';
import { fmt } from './causal-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Result, Stats, Problem, About } from './ui.jsx';
import { useWorkerJob, Tornado, LogHistogram } from './causal-ui.jsx';
import './causal.css';

const clone = (x) => JSON.parse(JSON.stringify(x));
const KINDS = [['count', 'Count'], ['money', 'Money'], ['share', 'Share (%)'], ['number', 'Other number']];
const BLANK = { name: 'New input', lo: '', mode: '', hi: '', dist: 'lognormal', kind: 'share', stage: 'SOM' };

function CausalMarket() {
  const [chains, setChains] = useState(clone(MK.EXAMPLE.chains));
  const [currency, setCurrency] = useState(MK.EXAMPLE.currency);
  const [stage, setStage] = useState('SOM');
  const [draws, setDraws] = useState(100000);
  const load = () => { setChains(clone(MK.EXAMPLE.chains)); setCurrency(MK.EXAMPLE.currency); setStage('SOM'); setDraws(100000); };
  const edit = (ci, ii, k, v) => setChains((cs) => cs.map((c, a) => (a !== ci ? c : { ...c, items: c.items.map((x, b) => (b !== ii ? x : { ...x, [k]: v })) })));
  const addItem = (ci) => setChains((cs) => cs.map((c, a) => (a !== ci ? c : { ...c, items: [...c.items, { ...BLANK }] })));
  const delItem = (ci, ii) => setChains((cs) => cs.map((c, a) => (a !== ci ? c : { ...c, items: c.items.filter((_, b) => b !== ii) })));

  const model = useMemo(() => MK.toModel(chains.filter((c) => c.items.length)), [chains]);
  const precheck = useMemo(() => {
    for (const c of model) { for (const x of c.items) { const p = MK.prepInput(x); if (p.error) return p.error; } if (!c.items.some((x) => x.stage === 'TAM')) return `${c.name}: add at least one TAM input.`; }
    return model.length ? null : 'Add at least one input.';
  }, [model]);
  const key = JSON.stringify([model, draws]);
  const { result: res, busy, error } = useWorkerJob(precheck ? null : { type: 'market', chains: model, opts: { draws, seed: 7 } }, precheck ? `bad${key}` : key, (j) => MK.simulateMarket(j.chains, j.opts));
  const ok = res && !precheck ? res.filter((r) => !r.error && r.stages[stage].has) : [];
  const stageOk = ok.length > 0;
  const cur = currency;
  const show = (r, x) => MK.money(x, cur, MK.isMoney(r));

  return (
    <div className="ca-root">
      <LoadExample onClick={load} />
      <p className="ca-note">Each size is the product of its inputs: TAM multiplies the TAM inputs, SAM multiplies those by the SAM shares, SOM by the SOM shares as well. Give each input a 90% range: you would be surprised if the true value fell outside it.</p>
      {chains.map((c, ci) => (
        <section key={ci} className="ea-card">
          <h4>{c.name} chain</h4>
          <div className="clu-scroll ea-contain"><table className="clu-table ca-table" aria-label={`${c.name} inputs`}>
            <thead><tr><th>Input</th><th>Low (5th pct)</th><th>Most likely</th><th>High (95th pct)</th><th>Shape</th><th>Type</th><th>Stage</th><th /></tr></thead>
            <tbody>{c.items.map((x, ii) => (
              <tr key={ii}>
                <td><input className="ca-edit wide" value={x.name} aria-label="Input name" onChange={(e) => edit(ci, ii, 'name', e.target.value)} /></td>
                <td><input className="ca-edit" inputMode="decimal" value={x.lo} aria-label={`${x.name} low`} onChange={(e) => edit(ci, ii, 'lo', e.target.value)} /></td>
                <td><input className="ca-edit" inputMode="decimal" value={x.mode} placeholder={x.dist === 'triangular' ? 'midpoint' : 'n/a'} disabled={x.dist !== 'triangular'} aria-label={`${x.name} most likely`} onChange={(e) => edit(ci, ii, 'mode', e.target.value)} /></td>
                <td><input className="ca-edit" inputMode="decimal" value={x.hi} aria-label={`${x.name} high`} onChange={(e) => edit(ci, ii, 'hi', e.target.value)} /></td>
                <td><select className="ca-edit" value={x.dist} aria-label={`${x.name} shape`} onChange={(e) => edit(ci, ii, 'dist', e.target.value)}><option value="lognormal">Log-normal</option><option value="triangular">Triangular</option></select></td>
                <td><select className="ca-edit" value={x.kind} aria-label={`${x.name} type`} onChange={(e) => edit(ci, ii, 'kind', e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                <td><select className="ca-edit" value={x.stage} aria-label={`${x.name} stage`} onChange={(e) => edit(ci, ii, 'stage', e.target.value)}>{MK.STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                <td><button type="button" className="btn ghost small" aria-label={`Remove ${x.name}`} onClick={() => delItem(ci, ii)}>×</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="ca-actions"><button type="button" className="btn ghost small" onClick={() => addItem(ci)}>+ Add input</button></div>
        </section>
      ))}
      <div className="calc-inputs ea-inputs">
        <label className="calc-field"><span>Currency symbol</span><input className="ea-mini" value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
        <Choice label="Show" value={stage} onChange={setStage} options={MK.STAGES.map((s) => [s, s])} />
        <Choice label="Draws" value={draws} onChange={setDraws} options={[[20000, '20,000'], [100000, '100,000'], [300000, '300,000']]} />
      </div>
      {precheck && <Problem>{precheck}</Problem>}
      {error && <Problem>{error}</Problem>}
      {busy && <p className="ca-note" role="status">Simulating {fmt(draws)} draws per chain…</p>}
      {res && !precheck && !stageOk && <Problem>No chain has a {stage} input yet.</Problem>}
      {stageOk && (
        <>
          <Result big={ok.map((r) => show(r, r.stages[stage].p50)).join(' / ')} label={`${stage} median${ok.length > 1 ? `s (${ok.map((r) => r.name.toLowerCase()).join(' / ')})` : ''}, from ${fmt(draws)} simulated draws`}>
            <Stats rows={ok.map((r) => [`${r.name}: 90% range`, `${show(r, r.stages[stage].p05)} to ${show(r, r.stages[stage].p95)} (mean ${show(r, r.stages[stage].mean)})`])} />
          </Result>
          <Table label="Market sizes by chain" head={['Chain', 'Stage', '5th percentile', 'Median', 'Mean', '95th percentile', 'All inputs at median']}
            rows={res.filter((r) => !r.error).flatMap((r) => MK.STAGES.filter((s) => r.stages[s].has).map((s) => [r.name, s, show(r, r.stages[s].p05), show(r, r.stages[s].p50), show(r, r.stages[s].mean), show(r, r.stages[s].p95), show(r, r.stages[s].base)]))} />
          {ok.map((r) => (
            <div key={r.name} className="ca-root">
              <h3 className="clu-h3">{r.name}: distribution of the {stage}</h3>
              <LogHistogram label={`${r.name} ${stage} distribution`} bins={r.stages[stage].hist} fmt={(v) => show(r, v)} xLabel={`${stage} (log scale)`}
                marks={[{ x: r.stages[stage].p05, label: 'P5' }, { x: r.stages[stage].p50, label: 'Median' }, { x: r.stages[stage].p95, label: 'P95' }]} />
              <h3 className="clu-h3">{r.name}: which inputs matter (tornado)</h3>
              <Tornado label={`${r.name} tornado for the ${stage}`} rows={r.stages[stage].tornado} base={r.stages[stage].base} fmt={(v) => show(r, v)} />
            </div>
          ))}
          <p className="ca-note">Each tornado bar moves one input from its 5th to its 95th percentile with the others at their medians; the percentage is that input's share of the variance of log({stage}).</p>
          <StudySummary {...MK.marketSummary(res, { currency: cur, stage })} />
        </>
      )}
      <About method="target-market-sizing" links={[['fermi-estimation', 'Fermi estimation'], ['participation-rate-demand-estimation', 'Participation rate demand estimation'], ['one-way-sensitivity-analysis', 'One-way sensitivity analysis'], ['scenario-generation-under-uncertainty', 'Scenario generation under uncertainty']]}>
        <p><b>Idea.</b> Market sizes are chains of multiplied guesses: TAM (total addressable market) = units × value per unit; SAM (serviceable) = TAM × the shares you can serve; SOM (obtainable) = SAM × the share you can win. Top-down chains start from the whole market; bottom-up chains start from customers and prices. Two chains that agree corroborate each other (triangulation).</p>
        <p><b>Uncertainty.</b> Each input is a 90% range. Log-normal: μ = (ln low + ln high)/2, σ = (ln high − ln low)/(2 × 1.645), so the range is the 5th to 95th percentile and the median is √(low × high). Triangular: the minimum and maximum are solved so that the 5th and 95th percentiles equal low and high around your most likely value. Shares are capped at 100%. A Monte Carlo simulation (100,000 draws per chain by default, in a Web Worker) multiplies the draws and reports percentiles; for log-normal inputs the result is exactly log-normal with μ = Σμᵢ and σ² = Σσᵢ², which the checks use.</p>
        <p><b>Tornado.</b> Each bar is the size with one input at its 5th and then its 95th percentile and the others at their medians (one-way sensitivity). The share is that input's part of Var(log size) = Σ Var(log inputᵢ), since inputs are independent.</p>
        <p><b>When not to use it.</b> When inputs are strongly linked (price and share won, for example: the model treats them as independent and understates the range), as a revenue forecast (SOM is an opportunity, not a plan), or with ranges made up to reach a target number. People's 90% ranges are usually too narrow, so widen them if unsure.</p>
      </About>
    </div>
  );
}

export default CausalMarket;
