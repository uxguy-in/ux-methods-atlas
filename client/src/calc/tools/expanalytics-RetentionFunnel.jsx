import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as R from './expanalytics-retention.js';
import { LinePlot, BarChart, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, Bars, num, pct, pv, n_ } from './ui.jsx';

const COHORT_SAMPLE = '# cohort, users, active in month 1, 2, 3, …\n2026-01, 1840, 1404, 1167, 988, 854, 773, 695\n2026-02, 1625, 1243, 1031, 873, 761, 674\n2026-03, 1990, 1549, 1282, 1074, 926\n2026-04, 2210, 1663, 1355, 1143\n2026-05, 1765, 1367, 1128\n2026-06, 2050, 1549\n2026-07, 1930';
// Deterministic example event list: 300 users signing up over five weeks, each active on some later days.
function exampleEvents() {
  let s = 99; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = ['# user, signup date, activity date'];
  const day0 = Date.UTC(2026, 7, 3) / 86400000; // Monday 3 Aug 2026
  const end = day0 + 7 * 8 - 1;
  for (let u = 1; u <= 300; u++) {
    const sd = day0 + Math.floor(r() * 35), loyal = r() < 0.35 ? 0.9 : 0.55;
    const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
    out.push(`u${u}, ${iso(sd)}, ${iso(sd)}`);
    for (let w = 1; sd + 7 * w <= end; w++) { if (r() > loyal ** Math.sqrt(w)) break; out.push(`u${u}, ${iso(sd)}, ${iso(sd + 7 * w - 2 + Math.floor(r() * 4))}`); }
  }
  return out.join('\n');
}
const FUNNEL_SAMPLE = 'Step\tMobile\tDesktop\nViewed product\t18400\t9600\nAdded to basket\t3120\t1980\nStarted checkout\t1610\t1240\nEntered payment\t1020\t905\nOrder placed\t832\t771';
const PATH_SAMPLE = '# journey, number of users (conversion step: Buy)\nHome>Search>Product>Cart>Buy, 310\nHome>Search>Product, 520\nHome>Category>Product>Cart>Buy, 240\nHome>Category>Product>Cart, 180\nHome>Category, 400\nAd>Product>Cart>Buy, 260\nAd>Product, 610\nEmail>Product>Cart>Buy, 150\nEmail>Cart>Buy, 90\nHome>Search>Search>Product>Cart>Buy, 70\nHome>Search, 450\nAd>Home>Search>Product>Cart>Buy, 60';

const heatStyle = (v) => ({ background: `color-mix(in srgb, var(--c1) ${Math.round(Math.max(0, Math.min(1, v)) * 85)}%, transparent)` });

function Cohorts({ onFit }) {
  const [src, setSrc] = useState('table');
  const [text, setText] = useState(COHORT_SAMPLE);
  const [ev, setEv] = useState(exampleEvents);
  const [asPct, setAsPct] = useState(false);
  const [unit, setUnit] = useState('week');
  const [horizon, setHorizon] = useState('12');
  const parsed = useMemo(() => (src === 'table' ? R.parseCohortTable(text, asPct) : R.cohortsFromEvents(ev, unit)), [src, text, ev, asPct, unit]);
  const cohorts = parsed.cohorts.filter((c) => c.size > 0);
  const ok = cohorts.length >= 1 && Math.max(...cohorts.map((c) => c.counts.length)) >= 3;
  const res = useMemo(() => {
    if (!ok) return null;
    const ret = R.retention(cohorts), fit = R.sbgFit(cohorts), pl = R.powerLawFit(ret.avgCurve);
    return { ret, fit, pl };
  }, [ok, JSON.stringify(cohorts)]);
  const H = Math.max(3, Math.min(120, Math.round(n_(horizon)) || 12));
  const unitName = src === 'table' ? 'period' : unit;
  const S = res ? R.sbgCurve(res.fit.alpha, res.fit.beta, H) : [];
  return (
    <>
      <LoadExample onClick={() => { setSrc('table'); setText(COHORT_SAMPLE); setAsPct(false); }} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Your data" value={src} onChange={setSrc} options={[['table', 'Cohort table'], ['events', 'Event list']]} />
        {src === 'table' ? <>
          <Area label="One cohort per line: label, cohort size, then active users in period 1, 2, 3 …" value={text} onChange={setText} rows={8} hint="Periods can be days, weeks or months. Counts are people still active (or still subscribed) at that age." />
          <Choice label="Values after the size are" value={asPct} onChange={setAsPct} options={[[false, 'Counts'], [true, 'Percentages']]} />
        </> : <>
          <Area label="One activity per line: user, signup date, activity date (YYYY-MM-DD)" value={ev} onChange={setEv} rows={8} hint="Exported from analytics: every day a user was active. The tool groups users by signup period and counts who is active at each age." />
          <Choice label="Period" value={unit} onChange={setUnit} options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
        </>}
        <Num label="Project to period" value={horizon} onChange={setHorizon} min={3} max={120} />
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped lines {parsed.bad.slice(0, 8).join(', ')}.</Problem>}
      {!res ? <Problem>Enter at least one cohort with a size and two or more later periods.</Problem> : (
        <>
          <Result big={`${pct(res.ret.avgCurve[1].rate, 0)} → ${pct(res.ret.avgCurve[res.ret.T - 1].rate, 0)}`} label={`Average retention after 1 and ${res.ret.T - 1} ${unitName}s; sBG projection ${pct(S[H], 1)} at ${unitName} ${H}`}>
            <p>sBG α = {num(res.fit.alpha, 3)}, β = {num(res.fit.beta, 3)}; median lifetime {Number.isFinite(R.sbgMedian(res.fit.alpha, res.fit.beta)) ? `${R.sbgMedian(res.fit.alpha, res.fit.beta)} ${unitName}s` : 'beyond the horizon'}; mean lifetime {res.fit.alpha > 1 ? `${num(R.sbgDEL(res.fit.alpha, res.fit.beta, 0), 1)} ${unitName}s` : 'unbounded (α ≤ 1)'}.</p>
          </Result>
          <h3 className="clu-h3">Retention triangle</h3>
          <div className="clu-scroll ea-contain"><table className="clu-table clu-num ea-heat" aria-label="Retention by cohort and age">
            <thead><tr><th>Cohort</th><th>Users</th>{Array.from({ length: res.ret.T - 1 }, (_, k) => <th key={k}>{k + 1}</th>)}</tr></thead>
            <tbody>
              {res.ret.rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{Math.round(r.size).toLocaleString()}</td>{Array.from({ length: res.ret.T - 1 }, (_, k) => { const v = r.rates[k + 1]; return <td key={k} className={`h${v > 0.6 ? ' dark' : ''}`} style={Number.isFinite(v) ? heatStyle(v) : undefined}>{Number.isFinite(v) ? pct(v, 0) : ''}</td>; })}</tr>)}
              <tr><td><b>Weighted average</b></td><td />{res.ret.avgCurve.slice(1).map((p) => <td key={p.k} className="h"><b>{pct(p.rate, 0)}</b></td>)}</tr>
            </tbody>
          </table></div>
          <h3 className="clu-h3">Retention curves and projection</h3>
          <LinePlot label="Retention curves by cohort with the fitted sBG and power-law projections" xLabel={`Age (${unitName}s)`} yLabel="Share still active" yMin={0} yMax={1} yFmt={(v) => pct(v)}
            series={[
              ...res.ret.rows.map((r, i) => ({ name: r.label, pts: r.rates.map((v, k) => [k, v]), opacity: 0.35, width: 1.4, hideLegend: true, color: `var(--c${(i % 8) + 1})` })),
              { name: 'Average (observed)', pts: res.ret.avgCurve.map((p) => [p.k, p.rate]), dots: true, color: 'var(--ink)', width: 2.5 },
              { name: 'sBG projection', pts: S.map((v, k) => [k, v]), dash: '6 4', color: 'var(--c2)' },
              res.pl && { name: 'Power law', pts: Array.from({ length: H + 1 }, (_, k) => [k, Math.min(1, res.pl.at(k))]), dash: '2 3', color: 'var(--c3)' },
            ].filter(Boolean)} />
          <Stats rows={[['sBG α, β', `${num(res.fit.alpha, 4)}, ${num(res.fit.beta, 4)}`], ['Mean churn probability α/(α+β)', pct(res.fit.meanChurn, 1)], ['Log-likelihood', num(res.fit.ll, 2)], ['Retention among survivors, period 1 → ' + H, `${pct(R.sbgRetentionRate(res.fit.alpha, res.fit.beta, 1), 1)} → ${pct(R.sbgRetentionRate(res.fit.alpha, res.fit.beta, H), 1)}`], res.pl && ['Power law a·t^−b', `a = ${num(res.pl.a, 3)}, b = ${num(res.pl.b, 3)}, R² = ${num(res.pl.r2, 3)}`]]} />
          <div className="tl-row"><button type="button" className="btn ghost small" onClick={() => onFit(res.fit)}>Use α and β in Unit economics</button></div>
          <StudySummary {...R.cohortSummary({ ret: res.ret, fit: res.fit, pl: res.pl, unit: unitName, horizon: H })} />
        </>
      )}
    </>
  );
}

function Stickiness() {
  const [dau, setDau] = useState('4200'); const [wau, setWau] = useState('11800'); const [mau, setMau] = useState('24500');
  const o = { dau: n_(dau), wau: n_(wau), mau: n_(mau) };
  const ok = o.dau > 0 && o.wau > 0 && o.mau > 0;
  const s = ok ? R.stickiness(o) : null;
  return (
    <>
      <LoadExample onClick={() => { setDau('4200'); setWau('11800'); setMau('24500'); }} />
      <div className="calc-inputs ea-inputs">
        <Num label="Average daily active users" value={dau} onChange={setDau} />
        <Num label="Weekly active users" value={wau} onChange={setWau} />
        <Num label="Monthly active users" value={mau} onChange={setMau} />
      </div>
      {!s ? <Problem>Enter DAU, WAU and MAU above zero.</Problem> : (
        <>
          {!s.consistent && <Problem>DAU should not exceed WAU, and WAU should not exceed MAU; check that all three use the same definition of "active".</Problem>}
          <Result big={`DAU/MAU ${pct(s.dauMau, 1)}`} label={`About ${num(s.daysPerMonth, 1)} active days per monthly user`} />
          <Bars label="Stickiness ratios" rows={[['DAU / MAU', s.dauMau, pct(s.dauMau, 1)], ['WAU / MAU', s.wauMau, pct(s.wauMau, 1)], ['DAU / WAU', s.dauWau, pct(s.dauWau, 1)]]} />
          <StudySummary {...R.stickinessSummary(s, o)} />
        </>
      )}
    </>
  );
}

function Unit({ fit }) {
  const [arpu, setArpu] = useState('49'); const [margin, setMargin] = useState('80'); const [churn, setChurn] = useState('4.5');
  const [cac, setCac] = useState('420'); const [rate, setRate] = useState('10');
  const [a, setA] = useState(fit ? fit.alpha.toFixed(3) : '0.9'); const [b, setB] = useState(fit ? fit.beta.toFixed(3) : '9');
  const o = { arpu: n_(arpu), margin: n_(margin) / 100, churn: n_(churn) / 100, cac: n_(cac), annualRate: n_(rate) / 100, alpha: n_(a), beta: n_(b) };
  const ok = o.arpu > 0 && o.margin > 0 && o.churn > 0 && o.churn < 1 && o.cac >= 0 && o.annualRate >= 0;
  const u = ok ? R.unitEconomics(o) : null;
  const money = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—');
  const curve = u ? Array.from({ length: 37 }, (_, t) => [t, (u.m * (1 - (1 - o.churn) ** t)) / o.churn - o.cac]) : [];
  return (
    <>
      <LoadExample onClick={() => { setArpu('49'); setMargin('80'); setChurn('4.5'); setCac('420'); setRate('10'); setA('0.9'); setB('9'); }} />
      <div className="calc-inputs ea-inputs">
        <Num label="Revenue per customer per month" value={arpu} onChange={setArpu} step="any" />
        <Num label="Gross margin" value={margin} onChange={setMargin} suffix="%" />
        <Num label="Monthly churn" value={churn} onChange={setChurn} step="any" suffix="%" />
        <Num label="Acquisition cost (CAC)" value={cac} onChange={setCac} step="any" />
        <Num label="Annual discount rate" value={rate} onChange={setRate} suffix="%" />
        <Num label="sBG α (optional)" value={a} onChange={setA} step="any" />
        <Num label="sBG β (optional)" value={b} onChange={setB} step="any" hint={fit ? 'Filled from the cohort fit.' : 'Fit them in Cohort retention, or leave blank.'} />
      </div>
      {!u ? <Problem>Enter revenue, margin and churn above zero (churn below 100%) and a CAC of zero or more.</Problem> : (
        <>
          <Result big={`CLV ${money(u.discounted)}`} tone={u.ltvCac >= 3 ? 'good' : u.ltvCac < 1 ? 'bad' : ''} label={`LTV:CAC ${num(u.ltvCac, 1)}; payback ${Number.isFinite(u.churnPayback) ? `${u.churnPayback} months` : 'never'}`} />
          <Stats rows={[['Margin per month', money(u.m)], ['Expected lifetime (1/churn)', `${num(u.lifetimeMonths, 1)} months`], ['Simple CLV (m / churn)', money(u.simple)], ['Discounted CLV m(1+d)/(1+d−r)', money(u.discounted)], ['sBG CLV (m × DEL)', money(u.sbg)], ['Payback ignoring churn', `${num(u.payback, 1)} months`], ['Payback with churn', Number.isFinite(u.churnPayback) ? `${u.churnPayback} months` : 'never'], ['Monthly discount rate', pct(u.d, 3)]]} />
          <LinePlot label="Cumulative margin minus acquisition cost per customer" xLabel="Months since acquisition" yLabel="Cumulative margin − CAC" series={[{ name: 'Cumulative margin − CAC (with churn)', pts: curve }]} hlines={[{ y: 0, label: 'Break-even' }]} yFmt={(v) => Math.round(v).toLocaleString()} />
          <StudySummary {...R.unitSummary(u, o)} />
        </>
      )}
    </>
  );
}

function Funnel() {
  const [text, setText] = useState(FUNNEL_SAMPLE);
  const parsed = useMemo(() => R.parseFunnel(text), [text]);
  const segs = parsed.segments.filter((s) => s.steps.length >= 2 && s.steps[0].count > 0 && s.steps.every((st, i) => i === 0 || st.count <= s.steps[i - 1].count));
  const ok = segs.length >= 1 && segs.length === parsed.segments.length;
  const fs = ok ? segs.map((s) => R.funnel(s.steps)) : [];
  const cmp = ok && segs.length === 2 && segs[0].steps.length === segs[1].steps.length ? R.compareFunnels(segs[0].steps, segs[1].steps) : null;
  return (
    <>
      <LoadExample onClick={() => setText(FUNNEL_SAMPLE)} />
      <div className="calc-inputs ea-inputs">
        <Area label="One step per line: step name, then the count (or two counts for two segments, with a header row)" value={text} onChange={setText} rows={7} hint="Counts must not increase from one step to the next. Count people, not sessions, where you can." />
      </div>
      {!ok ? <Problem>Enter at least two steps with counts that never increase down the funnel.</Problem> : (
        <>
          {fs.map((f, si) => (
            <section key={si} className="ea-card">
              <h4>{segs[si].name}: {pct(f.overall, 1)} overall</h4>
              <BarChart label={`Funnel for ${segs[si].name}`} bars={f.rows.map((r) => ({ label: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name, value: r.count, top: pct(r.overall, 1), tone: f.worstRate && r.i === f.worstRate.i ? 'bad' : '' }))} yFmt={(v) => Math.round(v).toLocaleString()} />
              <Table label={`Funnel steps for ${segs[si].name}`} head={['Step', 'People', 'Step conversion (95% CI)', 'Overall (95% CI)', 'Lost']} rows={f.rows.map((r) => [r.name, Math.round(r.count).toLocaleString(), r.i ? `${pct(r.step, 1)} (${pct(r.stepCI.lo, 1)}–${pct(r.stepCI.hi, 1)})` : '', `${pct(r.overall, 1)} (${pct(r.overallCI.lo, 1)}–${pct(r.overallCI.hi, 1)})`, r.i ? Math.round(r.lost).toLocaleString() : ''])} />
            </section>
          ))}
          {cmp && (
            <>
              <h3 className="clu-h3">{segs[0].name} vs {segs[1].name}, step by step</h3>
              <Table label="Segment comparison by step" head={['Step', segs[0].name, segs[1].name, 'Difference', 'z', 'p', 'p (Holm)', '']} rows={[...cmp.steps.map((s) => [s.name, pct(s.p1, 1), pct(s.p2, 1), `${(s.diff * 100).toFixed(1)} pp`, num(s.z, 2), pv(s.p), pv(s.pHolm), <span key="t" className={`qtag ${s.pHolm < 0.05 ? 'promote' : ''}`}>{s.pHolm < 0.05 ? 'Differs' : 'n.s.'}</span>]), ['Overall', pct(cmp.overall.p1, 1), pct(cmp.overall.p2, 1), `${(cmp.overall.diff * 100).toFixed(1)} pp`, num(cmp.overall.z, 2), pv(cmp.overall.p), '', '']]} />
            </>
          )}
          <StudySummary {...R.funnelSummary(fs[0], cmp, segs.map((s) => s.name))} />
        </>
      )}
    </>
  );
}

function Journeys() {
  const [text, setText] = useState(PATH_SAMPLE);
  const [conv, setConv] = useState('Buy');
  const parsed = useMemo(() => R.parsePaths(text, conv), [text, conv]);
  const ok = parsed.paths.length >= 2 && parsed.paths.some((p) => p.converted) && parsed.paths.some((p) => p.steps.length);
  const r = useMemo(() => (ok ? R.removalEffects(parsed.paths) : null), [ok, parsed]);
  return (
    <>
      <LoadExample onClick={() => { setText(PATH_SAMPLE); setConv('Buy'); }} />
      <div className="calc-inputs ea-inputs">
        <Area label="One journey per line: steps separated by >, then optionally a comma and how many users took it" value={text} onChange={setText} rows={8} />
        <label className="calc-field"><span>Conversion step</span><input type="text" value={conv} onChange={(e) => setConv(e.target.value)} style={{ width: 140 }} /></label>
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped lines {parsed.bad.slice(0, 8).join(', ')}.</Problem>}
      {!r ? <Problem>Enter at least two journeys, with at least one reaching the conversion step "{conv}".</Problem> : (
        <>
          <Result big={`${pct(r.base.pConv, 1)} convert`} label={`${r.totalPaths.toLocaleString()} journeys, ${r.totalConv.toLocaleString()} conversions; Markov absorption probability from the start`} />
          <h3 className="clu-h3">Removal effect and attributed conversions</h3>
          <Bars label="Removal effect by step" rows={r.effects.map((e) => [e.step, e.effect, `${pct(e.effect, 0)} · ${num(e.conversions, 1)} conv.`])} />
          <Table label="Removal effects" head={['Step', 'P(convert) if removed', 'Removal effect', 'Share of credit', 'Attributed conversions', 'P(convert | reached)']} rows={r.effects.map((e) => [e.step, pct(e.pRemoved, 1), pct(e.effect, 1), pct(e.share, 1), num(e.conversions, 1), pct(r.base.B[r.base.states.indexOf(e.step)][0], 1)])} />
          <h3 className="clu-h3">Transition matrix</h3>
          <div className="clu-scroll ea-contain"><table className="clu-table clu-num ea-heat" aria-label="Transition probabilities">
            <thead><tr><th>From \ to</th>{r.base.states.slice(1).map((s) => <th key={s}>{s}</th>)}<th>{R.CONV}</th><th>{R.NULL}</th></tr></thead>
            <tbody>{r.base.states.map((s, i) => <tr key={s}><td>{s}</td>{r.base.P[i].slice(1).map((v, j) => <td key={j} className={`h${v > 0.6 ? ' dark' : ''}`} style={v > 0 ? heatStyle(v) : undefined}>{v > 0 ? num(v, 2) : ''}</td>)}</tr>)}</tbody>
          </table></div>
          <StudySummary {...R.markovSummary(r)} />
        </>
      )}
    </>
  );
}

function Viral() {
  const [inv, setInv] = useState('3'); const [cv, setCv] = useState('12'); const [cyc, setCyc] = useState('7'); const [start, setStart] = useState('5000'); const [hor, setHor] = useState('42');
  const o = { invites: n_(inv), conv: n_(cv) / 100, cycle: n_(cyc), start: n_(start), horizon: n_(hor) };
  const ok = o.invites >= 0 && o.conv >= 0 && o.conv <= 1 && o.cycle > 0 && o.start > 0 && o.horizon >= o.cycle && o.horizon / o.cycle <= 200;
  const v = ok ? R.viral(o) : null;
  return (
    <>
      <LoadExample onClick={() => { setInv('3'); setCv('12'); setCyc('7'); setStart('5000'); setHor('42'); }} />
      <div className="calc-inputs ea-inputs">
        <Num label="Invites sent per user" value={inv} onChange={setInv} step="any" />
        <Num label="Invite conversion" value={cv} onChange={setCv} step="any" suffix="%" />
        <Num label="Cycle time" value={cyc} onChange={setCyc} step="any" suffix="days" />
        <Num label="Starting users" value={start} onChange={setStart} />
        <Num label="Horizon" value={hor} onChange={setHor} suffix="days" />
      </div>
      {!v ? <Problem>Enter invites of 0 or more, a conversion between 0% and 100%, a positive cycle time and starting users, and a horizon of at least one cycle (up to 200 cycles).</Problem> : (
        <>
          <Result big={`K = ${num(v.K, 2)}`} tone={v.K >= 1 ? 'good' : ''} label={`${Math.round(v.total).toLocaleString()} users after ${o.horizon} days (${v.cycles} cycles)${v.K < 1 ? `; ceiling ${Math.round(v.limit).toLocaleString()}` : ''}`} />
          <LinePlot label="Projected total users by day" xLabel="Days" yLabel="Total users" yMin={0} yFmt={(x) => Math.round(x).toLocaleString()} series={[{ name: 'Total users', pts: v.pts.map((p) => [p.day, p.total]), dots: true }]} hlines={v.K < 1 ? [{ y: v.limit, label: 'Ceiling U₀/(1 − K)' }] : []} />
          <StudySummary {...R.viralSummary(v, o)} />
        </>
      )}
    </>
  );
}

// ── Retention and funnel analytics ──
function ExpRetentionFunnel() {
  const [mode, setMode] = useState('cohort');
  const [fit, setFit] = useState(null);
  const takeFit = (f) => { setFit(f); setMode('unit'); };
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Choice label="Analysis" value={mode} onChange={setMode} options={[['cohort', 'Cohort retention'], ['stick', 'Stickiness'], ['unit', 'Unit economics'], ['funnel', 'Funnel'], ['markov', 'Markov journeys'], ['viral', 'Viral growth']]} />
      </div>
      {mode === 'cohort' && <Cohorts onFit={takeFit} />}
      {mode === 'stick' && <Stickiness />}
      {mode === 'unit' && <Unit key={fit ? `${fit.alpha}` : 'none'} fit={fit} />}
      {mode === 'funnel' && <Funnel />}
      {mode === 'markov' && <Journeys />}
      {mode === 'viral' && <Viral />}
      <About method="cohort-analysis" links={[['active-user-definition-and-dau-mau-stickiness', 'DAU/MAU stickiness'], ['customer-unit-economics-churn-clv-cac-repurchase-mode', 'Customer unit economics'], ['funnel-analysis', 'Funnel analysis'], ['markov-chain-funnel-modelling', 'Markov chain funnel'], ['viral-coefficient-and-viral-cycle-time', 'Viral coefficient'], ['startup-metric-frameworks-aarrr-lean-analytics-stages-omtm', 'AARRR metrics']]}>
        <p><b>Cohorts.</b> Retention at age k = active users at age k / cohort size; the average curve weights each cohort by its size, using only cohorts observed at that age. From an event list, users are grouped by the period of their first signup date and counted once per period they are active in. The <b>power law</b> r(t) = a·t^(−b) is fitted by least squares on log r against log t. The <b>shifted-beta-geometric</b> model (Fader and Hardie 2007, "How to project customer retention", <i>Journal of Interactive Marketing</i> 21(1)) lets each user's churn probability θ vary as Beta(α, β): P(T = 1) = α/(α + β), P(T = t) = P(T = t − 1)(β + t − 2)/(α + β + t − 1), S(t) = 1 − ΣP. α and β are fitted by maximum likelihood over all cohorts; the paper's example data reproduce its published α = 0.668, β = 3.806 and α = 0.704, β = 1.182. The discounted expected lifetime is Σ S(t)/(1 + d)^t = ₂F₁(1, β; α + β; 1/(1 + d)) (Fader and Hardie 2010).</p>
        <p><b>Stickiness.</b> DAU/MAU, WAU/MAU and DAU/WAU; DAU/MAU × 30 approximates active days a month. <b>Unit economics.</b> m = revenue × gross margin; simple CLV = m/churn; discounted CLV = m(1 + d)/(1 + d − r) with r = 1 − churn and d the monthly discount rate (Gupta and Lehmann 2003); sBG CLV = m × DEL; payback is the first month where cumulative margin, allowing for churn, covers CAC.</p>
        <p><b>Funnels.</b> Step and overall conversion with Wilson score intervals (statsmodels proportion_confint, method 'wilson'). Two segments are compared step by step with the pooled two-proportion z-test (statsmodels proportions_ztest), Holm-adjusted across steps. <b>Markov journeys.</b> First-order transition probabilities between steps plus start, conversion and drop states; absorption probabilities B = (I − Q)⁻¹R (checked with numpy). The removal effect of a step is 1 − P(convert without it)/P(convert), where removing it sends every transition into it to the drop state; credit is shared in proportion to removal effects (Anderl, Becker, von Wangenheim and Schumann 2016). <b>Viral growth.</b> K = invites per user × invite conversion; each cycle adds K times the previous cycle's new users.</p>
        <p><b>When not to use it.</b> Projections assume the future behaves like the past. The sBG model is for contractual churn (subscriptions); for usage that lapses and returns, read the observed triangle rather than the projection. Funnel and journey numbers describe behaviour, not causes: test a change before crediting it.</p>
      </About>
    </>
  );
}

export default ExpRetentionFunnel;
