import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './statsbench-core.js';
import * as SV from './statsbench-survival.js';
import { SURVIVAL_EXAMPLE } from './statsbench-examples.js';
import { Chart, ColumnTags, col } from './statsbench-ui.jsx';
import { Table } from './expanalytics-charts.jsx';
import { Area, Choice, Pick, Num, Result, Stats, Problem, About, num, pv } from './ui.jsx';

const fin = (v, d = 1) => (Number.isFinite(v) ? num(v, d) : 'not reached');

// ── Kaplan-Meier time to event ──
function SbSurvival() {
  const [text, setText] = useState(SURVIVAL_EXAMPLE);
  const [tCol, setTCol] = useState('days');
  const [eCol, setECol] = useState('adopted');
  const [eLevel, setELevel] = useState('');
  const [gCol, setGCol] = useState('onboarding');
  const [unit, setUnit] = useState('days');
  const [word, setWord] = useState('adoption');
  const [show, setShow] = useState('F');
  const [t0, setT0] = useState('30');
  const [tau, setTau] = useState('');
  const [conf, setConf] = useState(0.95);
  const table = useMemo(() => C.parseTable(text), [text]);
  const colOf = Object.fromEntries(table.cols.map((c) => [c.name, c]));
  const T = colOf[tCol], Ev = colOf[eCol], Gr = gCol ? colOf[gCol] : null;
  const evLevels = Ev ? (Ev.numeric ? [...new Set(Ev.values.filter((v) => v !== null))].sort((a, b) => a - b).map(String) : Ev.levels) : [];
  const evIs = evLevels.includes(eLevel) ? eLevel : Ev?.numeric ? (evLevels.includes('1') ? '1' : evLevels[evLevels.length - 1]) : evLevels[evLevels.length - 1];
  const data = useMemo(() => {
    if (!T?.numeric || !Ev || evLevels.length > 2 || evLevels.length < 1) return null;
    const rows = [];
    for (let i = 0; i < table.n; i++) {
      const t = T.values[i], e = Ev.values[i], g = Gr ? Gr.values[i] : 'All';
      if (t === null || e === null || g === null || !(t >= 0)) continue;
      rows.push({ t, e: String(e) === evIs ? 1 : 0, g: String(g) });
    }
    return rows;
  }, [table, T, Ev, Gr, evIs, evLevels.length]);
  const res = useMemo(() => {
    if (!data || data.length < 2) return null;
    const groups = [...new Set(data.map((r) => r.g))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (groups.length > 8) return { error: `The group column has ${groups.length} values; use one with 8 or fewer.` };
    const fits = Object.fromEntries(groups.map((g) => { const rs = data.filter((r) => r.g === g); return [g, SV.kaplanMeier(rs.map((r) => r.t), rs.map((r) => r.e), conf)]; }));
    const lr = groups.length > 1 ? SV.logRank(data.map((r) => r.t), data.map((r) => r.e), data.map((r) => r.g)) : null;
    const pw = groups.length > 2 ? SV.pairwiseLogRank(data.map((r) => r.t), data.map((r) => r.e), data.map((r) => r.g)) : null;
    return { groups, fits, lr, pw, maxT: Math.max(...data.map((r) => r.t)), tauDefault: Math.min(...groups.map((g) => fits[g].maxT)) };
  }, [data, conf]);
  const tauV = Number.isFinite(C.toNum(tau)) && C.toNum(tau) > 0 ? C.toNum(tau) : res?.tauDefault;
  const t0V = C.toNum(t0);
  const rm = res && !res.error ? Object.fromEntries(res.groups.map((g) => [g, SV.rmst(res.fits[g].rows, tauV)])) : null;
  const c = Math.round(conf * 100);
  const load = () => { setText(SURVIVAL_EXAMPLE); setTCol('days'); setECol('adopted'); setELevel(''); setGCol('onboarding'); setUnit('days'); setWord('adoption'); setShow('F'); setT0('30'); setTau(''); setConf(0.95); };
  const F = show === 'F', tr = (v) => (F ? 1 - v : v);
  const ticks = res && !res.error ? Array.from({ length: 6 }, (_, i) => Math.round((res.maxT * i) / 5)) : [];
  const nAt = (g, t) => data.filter((r) => r.g === g && r.t >= t).length;
  const nums = table.cols.filter((x) => x.numeric).map((x) => [x.name, x.name]);
  return (
    <>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={load}>Load example (time to adoption)</button></div>
      <div className="calc-inputs sb-inputs">
        <Area label="Data table: header row, then one row per person or account" value={text} onChange={setText} rows={7} wrap="off"
          hint="Columns: the time observed, whether the event happened (1) or the person was censored (0: not yet by the end of the study, or lost), and an optional group." />
      </div>
      <ColumnTags table={table} />
      <div className="calc-inputs sb-inputs">
        <Pick label="Time column" value={tCol} onChange={setTCol} options={nums} />
        <Pick label="Event column" value={eCol} onChange={(v) => { setECol(v); setELevel(''); }} options={table.cols.filter((x) => x.distinct <= 2).map((x) => [x.name, x.name])} />
        {evLevels.length === 2 && <Pick label="Value meaning the event happened" value={evIs} onChange={setELevel} options={evLevels.map((l) => [l, l])} />}
        <Pick label="Group (optional)" value={gCol} onChange={setGCol} options={[['', 'None'], ...table.cols.filter((x) => x.name !== tCol && x.name !== eCol && x.distinct <= 8).map((x) => [x.name, x.name])]} />
        <label className="calc-field"><span>Event, in words</span><input className="tl-code" value={word} onChange={(e) => setWord(e.target.value)} /></label>
        <label className="calc-field"><span>Time unit</span><input className="tl-code" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        <Choice label="Plot" value={show} onChange={setShow} options={[['F', `Share who had the event`], ['S', 'Share still without it']]} />
        <Num label={`Survival at time (${unit})`} value={t0} onChange={setT0} min={0} />
        <Num label={`Restricted mean up to (${unit})`} value={tau || (res && !res.error ? String(res.tauDefault) : '')} onChange={setTau} min={0} hint="Defaults to the shortest group follow-up." />
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      {!T?.numeric ? <Problem>Choose a numeric time column.</Problem>
        : evLevels.length > 2 || !Ev ? <Problem>The event column needs two values (event and censored).</Problem>
          : !res ? <Problem>Enter at least two rows with a time of 0 or more.</Problem>
            : res.error ? <Problem>{res.error}</Problem> : (
              <>
                <Result big={res.groups.length === 1 ? `Median ${fin(res.fits[res.groups[0]].median)} ${unit}` : `Log-rank p ${pv(res.lr.p)}`} tone={res.lr && res.lr.p < 1 - conf ? 'good' : ''}
                  label={res.groups.length === 1 ? `Median time to ${word}, ${c}% CI ${fin(res.fits[res.groups[0]].medianCI[0])} to ${fin(res.fits[res.groups[0]].medianCI[1])}; ${data.length} people, ${res.fits[res.groups[0]].nEvents} events`
                    : `χ²(${res.lr.df}) = ${num(res.lr.chi2, 2)}; medians ${res.groups.map((g) => `${g} ${fin(res.fits[g].median)}`).join(', ')} ${unit}; ${data.length} people`} />
                <Chart label={`Kaplan-Meier curves: ${F ? `share who had ${word}` : `share still without ${word}`} over time`} xLabel={`Time (${unit}); + marks censored people`} yLabel={F ? `Share with ${word}` : `Share without ${word}`} height={300} yMin={0} yMax={1} xMin={0} xMax={res.maxT} stepEnd={res.maxT} yFmt={(v) => `${Math.round(v * 100)}%`}
                  series={res.groups.flatMap((g, i) => {
                    const fit = res.fits[g], pts = [[0, tr(1)], ...fit.events.map((r) => [r.t, tr(r.S)])];
                    const lo = [[0, tr(1)], ...fit.events.map((r) => [r.t, tr(F ? r.hi : r.lo)])], hi = [[0, tr(1)], ...fit.events.map((r) => [r.t, tr(F ? r.lo : r.hi)])];
                    const cens = fit.rows.filter((r) => r.c > 0).map((r) => [r.t, tr(r.S), `${r.c} censored at ${r.t}`]);
                    return [{ type: 'band', step: true, lo, hi, color: col(i), hideLegend: true }, { type: 'line', step: true, name: g, pts: [...pts, [fit.maxT, tr(fit.lastS)]], color: col(i) }, { type: 'points', r: 2.4, pts: cens, color: col(i), hideLegend: true }];
                  })} legend={res.groups.length > 1} />
                <Table label="Number at risk" head={[`At risk at ${unit}`, ...ticks.map(String)]} rows={res.groups.map((g) => [g, ...ticks.map((t) => nAt(g, t))])} />
                <h3 className="clu-h3">By group</h3>
                <Table label="Kaplan-Meier summary by group" head={['Group', 'n', 'Events', 'Censored', `Median (${c}% CI)`, `${F ? 'Had it' : 'Without it'} at ${Number.isFinite(t0V) ? t0V : '?'} (${c}% CI)`, `Restricted mean to ${num(tauV, 0)}`]}
                  rows={res.groups.map((g) => {
                    const fit = res.fits[g], at = Number.isFinite(t0V) ? fit.at(t0V) : null;
                    return [g, fit.n, fit.nEvents, fit.n - fit.nEvents, `${fin(fit.median)} (${fin(fit.medianCI[0])} to ${fin(fit.medianCI[1])})`,
                      at ? `${num(tr(at.S) * 100, 1)}% (${num(tr(F ? at.hi : at.lo) * 100, 1)}% to ${num(tr(F ? at.lo : at.hi) * 100, 1)}%)` : '', `${num(rm[g], 1)} ${unit}`];
                  })} />
                {res.lr && <Stats rows={[['Log-rank χ²', `χ²(${res.lr.df}) = ${num(res.lr.chi2, 3)}, p ${pv(res.lr.p)}`], ...res.lr.levels.map((g, i) => [`${g}: observed / expected events`, `${res.lr.O[i]} / ${num(res.lr.E[i], 1)}`])]} />}
                {res.pw && <Table label="Pairwise log-rank tests" head={['Pair', 'χ²(1)', 'p', 'Holm p']} rows={res.pw.map((x) => ({ cls: x.pHolm < 1 - conf ? 'tl-cell-ok' : '', cells: [`${x.a} vs ${x.b}`, num(x.chi2, 3), pv(x.p), pv(x.pHolm)] }))} />}
                <div className="sb-grid2">
                  <Chart label="Nelson-Aalen cumulative hazard" xLabel={`Time (${unit})`} yLabel="Cumulative hazard H(t)" height={240} yMin={0} xMin={0} xMax={res.maxT} stepEnd={res.maxT}
                    series={res.groups.map((g, i) => ({ type: 'line', step: true, name: g, color: col(i), pts: [[0, 0], ...res.fits[g].events.map((r) => [r.t, r.H])] }))} />
                  <div className="tl-note"><p>The cumulative hazard adds up the event rate among those still at risk: H(t) = Σ dᵢ/nᵢ. A straight line means a constant rate (exponential times); a curve bending upwards means the rate rises with time, bending down means early events are most likely. Roughly parallel curves on this plot fit the proportional hazards assumption of a Cox model.</p></div>
                </div>
                <details className="calc-about"><summary>Life tables (every event time)</summary>
                  {res.groups.map((g) => (
                    <div key={g}>
                      {res.groups.length > 1 && <h4>{g}</h4>}
                      <Table label={`Life table for ${g}`} head={[`Time (${unit})`, 'At risk', 'Events', 'Censored', 'S(t)', 'SE', `${c}% CI`, 'H(t)']}
                        rows={res.fits[g].rows.map((r) => [r.t, r.atRisk, r.d, r.c, num(r.S, 4), num(r.se, 4), `${num(r.lo, 3)} to ${num(r.hi, 3)}`, num(r.H, 4)])} />
                    </div>
                  ))}
                </details>
                <StudySummary {...SV.survivalSummary({ fits: res.fits, lr: res.lr, eventWord: word || 'the event', unit, tau: tauV, rm, conf })} />
              </>
            )}
      <About method="kaplan-meier-curves-for-time-to-adoption" links={[['probability-and-hazard-plotting-of-censored-time-to-event-data', 'Hazard plotting of censored data']]}>
        <p><b>Kaplan-Meier.</b> At each time tᵢ with dᵢ events among nᵢ people still at risk, S(t) = Π(1 − dᵢ/nᵢ). People censored at t are counted at risk at t and leave afterwards. Greenwood's variance: Var(S) = S²·Σ dᵢ/(nᵢ(nᵢ − dᵢ)). The interval uses the log(−log) transform, exp(−exp(ln(−ln S) ± z·√Σ/ln S)), which stays inside 0 to 1 (lifelines' default). The median is the first time S(t) ≤ 0.5, and its interval the first times the interval bounds cross 0.5; it is "not reached" when fewer than half had the event.</p>
        <p><b>Log-rank test.</b> At each event time the expected events in group g are Eg = d·ng/n; with V_gh = Σ d(n − d)/(n − 1)·(ng/n)(δgh − nh/n), χ² = (O − E)′V⁻¹(O − E) on k − 1 df. Pairwise tests use Holm's correction. <b>Cumulative hazard</b> (Nelson-Aalen) H(t) = Σ dᵢ/nᵢ. <b>Restricted mean survival time</b> is the area under S(t) up to τ: the average time without the event within that window, useful when a median is not reached. Values match lifelines (KaplanMeierFitter, median_survival_times, NelsonAalenFitter, logrank_test, multivariate_logrank_test, pairwise_logrank_test, restricted_mean_survival_time): <code>npm run check:statsbench</code>.</p>
        <p><b>When not to use it.</b> Kaplan-Meier assumes censoring is unrelated to the outcome: if people stopped being tracked because they were about to churn, the curves are too optimistic. Do not compare averages of observed times that ignore censoring. For several predictors (plan, device, cohort) at once use a Cox model; with competing events (adopted a different feature first) use competing-risks methods.</p>
      </About>
    </>
  );
}

export default SbSurvival;
