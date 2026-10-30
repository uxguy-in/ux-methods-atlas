import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as NR from './surveyx-nonresponse.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, pval, signed, parseTable, numericColumn } from './surveyx-core.js';
import { Table, LinePlot, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About, Bars, Choice } from './ui.jsx';
import { Tabs, ColumnPick, ColumnChips, useWorkerJob, Histogram } from './surveyx-ui.jsx';

const TIMING = /wave|day|time|date|reminder|attempt/i;

function RatesTab({ disp, setDisp, e, setE }) {
  const a = useMemo(() => NR.aapor(disp, e), [disp, e]);
  const valid = a.I > 0 && Number.isFinite(a.RR1);
  return (
    <>
      <div className="sx-disp">
        {NR.DISPOSITIONS.map(([k, name, hint]) => (
          <label key={k} className="calc-field">
            <span>{name} ({k})</span>
            <span className="calc-input"><input type="number" min={0} inputMode="numeric" value={disp[k]} onChange={(ev) => setDisp({ ...disp, [k]: ev.target.value })} /></span>
            <small>{hint}</small>
          </label>
        ))}
        <label className="calc-field">
          <span>e: share of unknowns that are eligible</span>
          <span className="calc-input"><input type="number" min={0} max={1} step={0.01} inputMode="decimal" value={e} placeholder={`${a.eEst.toFixed(3)} (estimated)`} onChange={(ev) => setE(ev.target.value)} /></span>
          <small>Leave blank to estimate it from cases with known eligibility</small>
        </label>
      </div>
      {!valid && <Problem>Enter at least one complete interview.</Problem>}
      {valid && (
        <>
          <Result big={pct(a.RR3, 1)} label={`AAPOR response rate 3 (e = ${a.e.toFixed(3)}${e === '' ? ', estimated' : ''})`} tone={a.RR3 >= 0.5 ? 'good' : undefined}>
            <Stats rows={[['RR1 (minimum)', pct(a.RR1, 1)], ['RR6 (maximum)', pct(a.RR6, 1)], ['Cooperation rate 1', pct(a.COOP1, 1)], ['Contact rate 1', pct(a.CON1, 1)], ['Refusal rate 1', pct(a.REF1, 1)], ['Cases sampled', a.total]]} />
          </Result>
          <div className="sx-grid2">
            <Table label="AAPOR outcome rates" num={false} head={['Rate', 'Value', 'Formula']} rows={NR.RATE_ROWS.map(([k, name, f]) => [<b key="k">{k}</b>, pct(a[k], 1), <span key="f" className="sx-mono">{f}</span>])} />
            <div>
              <h3 className="clu-h3">Where the sample went</h3>
              <Bars label="Share of sampled cases by final disposition" rows={NR.DISPOSITIONS.map(([k, name]) => [name, a.total ? (Number(disp[k]) || 0) / a.total : 0, `${Number(disp[k]) || 0} (${pct(a.total ? (Number(disp[k]) || 0) / a.total : 0, 0)})`, k === 'I' || k === 'P' ? 'ok' : k === 'R' ? 'bad' : undefined])} />
            </div>
          </div>
          <StudySummary {...NR.ratesSummary(a)} />
        </>
      )}
    </>
  );
}

function EarlyLateTab({ text, setText, nonresp, setNonresp, defaultNr }) {
  const parsed = useMemo(() => parseTable(text), [text]);
  const nums = useMemo(() => parsed.head.map((_, j) => numericColumn(parsed.rows, j)), [parsed]);
  const [tCol, setTCol] = useState(0);
  const [vars, setVars] = useState(null);
  const [rule, setRule] = useState('wave');
  const [show, setShow] = useState(0);
  const tc = nums[tCol] ? tCol : nums.findIndex(Boolean);
  const chosen = (vars || parsed.head.map((h, j) => j).filter((j) => j !== tc && nums[j] && !TIMING.test(parsed.head[j]))).filter((j) => j !== tc && nums[j]);
  const nr = nonresp === '' ? defaultNr : Number(nonresp);
  const e = useMemo(() => {
    const d = NR.timingData(text, tc);
    if (d.error) return d;
    return NR.earlyLate(d, rule, chosen, nr);
  }, [text, tc, rule, chosen.join(','), nr]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = !e.error && e.results.length ? NR.earlyLateSummary(e) : null;
  const sel = !e.error && e.results.length ? e.results[Math.min(show, e.results.length - 1)] : null;
  return (
    <>
      <Area label="Respondents: one row each, with a timing column (wave or days to respond) and the answers to compare" value={text} onChange={(v) => { setText(v); setVars(null); }} rows={7} />
      {parsed.head.length > 0 && (
        <div className="sx-inputs">
          <ColumnPick label="Timing column" head={parsed.head} value={tc} onChange={(v) => { setTCol(v); setVars(null); }} allowed={(j) => nums[j]} />
          <Choice label="Early vs late" value={rule} onChange={setRule} options={[['wave', 'First vs last wave'], ['quartile', 'Fastest vs slowest 25%'], ['half', 'First vs second half']]} />
          <label className="calc-field"><span>Eligible non-respondents</span><span className="calc-input"><input type="number" min={0} value={nonresp} placeholder={String(defaultNr)} onChange={(ev) => setNonresp(ev.target.value)} /></span><small>For the extrapolation; blank uses R + NC + O + e(UH + UO) from the rates tab</small></label>
        </div>
      )}
      {parsed.head.length > 0 && <ColumnChips label="Answers to compare" head={parsed.head} value={chosen} onChange={setVars} allowed={(j) => nums[j] && j !== tc} />}
      {e.error && <Problem>{e.error}</Problem>}
      {!e.error && !e.results.length && <Problem>Choose at least one numeric answer to compare.</Problem>}
      {summary && (
        <>
          <Result big={`${e.results.filter((x) => x.w && x.w.p < 0.05).length} of ${e.results.length}`} label={`answers differ between ${e.labels[0]} (n = ${e.nEarly}) and ${e.labels[1]} (n = ${e.nLate}) at p < 0.05`} tone={e.results.some((x) => x.w && x.w.p < 0.05) ? 'bad' : 'good'} />
          <Table label="Early vs late respondents and the trend across waves" head={['Answer', 'Early', 'Late', 'Late − early (95% CI)', 'p', 'Trend per wave', 'p', 'All respondents', 'With non-respondents extrapolated']}
            rows={e.results.filter((x) => x.w).map((x) => {
              const f = (v) => (x.binary ? pct(v, 1) : fmt(v, 2)), k = x.binary ? 100 : 1, u = x.binary ? ' pts' : '';
              return [x.name, f(x.w.m2), f(x.w.m1), `${signed(x.w.d * k, x.binary ? 1 : 2)}${u} (${fmt(x.w.lo * k, x.binary ? 1 : 2)} to ${fmt(x.w.hi * k, x.binary ? 1 : 2)})`, pval(x.w.p), x.trend ? `${signed(x.trend.b * k, 2)}${u}` : '—', x.trend ? pval(x.trend.p) : '—', f(x.obs), Number.isFinite(x.adjusted) ? f(x.adjusted) : '—'];
            })} />
          <div>
            <div className="sx-actions">
              <h3 className="clu-h3" style={{ margin: 0 }}>Wave by wave</h3>
              <select className="select" aria-label="Answer to plot" value={Math.min(show, e.results.length - 1)} onChange={(ev) => setShow(Number(ev.target.value))}>{e.results.map((x, i) => <option key={x.col} value={i}>{x.name}</option>)}</select>
            </div>
            <LinePlot label={`Mean ${sel.name} by wave, and the cumulative mean as waves are added`} xLabel={e.waveNames.length === 4 && /Q1/.test(e.waveNames[0]) ? 'Timing quartile' : 'Wave'} yLabel={sel.binary ? 'Share' : 'Mean'}
              xFmt={(v) => (Number.isInteger(v) && sel.waves[v - 1] ? sel.waves[v - 1].name : '')} yFmt={(v) => (sel.binary ? pct(v, 0) : String(+v.toFixed(2)))}
              xMin={0.8} xMax={sel.waves.length + (Number.isFinite(sel.extrap) ? 1.2 : 0.2)}
              series={[
                { name: 'Mean in this wave', pts: sel.waves.map((w) => [w.wave, w.mean]), dots: true },
                { name: 'Cumulative mean', pts: sel.waves.map((w) => [w.wave, w.cumMean]), dash: '5 4' },
                ...(Number.isFinite(sel.extrap) ? [{ name: 'Trend extrapolated to non-respondents', pts: [[sel.waves.length, sel.trend.a + sel.trend.b * sel.waves.length], [sel.waves.length + 1, sel.extrap]], dash: '2 3', dots: true }] : []),
              ]} />
            <p className="sx-note">Each wave's n: {sel.waves.map((w) => `${w.name}: ${w.n}`).join(', ')}. A cumulative mean that keeps moving as reminders bring in more people is the classic sign of non-response bias.</p>
          </div>
          <StudySummary {...summary} />
        </>
      )}
    </>
  );
}

function RIndicatorTab({ text, setText }) {
  const parsed = useMemo(() => parseTable(text), [text]);
  const guessResp = Math.max(0, parsed.head.findIndex((h) => /respon|return|complete/i.test(h)));
  const [resp, setResp] = useState(null);
  const [aux, setAux] = useState(null);
  const rc = resp ?? guessResp;
  const auxCols = (aux || parsed.head.map((_, j) => j).filter((j) => j !== rc && !/(^|_)id$|^id|name|email/i.test(parsed.head[j]))).filter((j) => j !== rc);
  const job = parsed.head.length ? { kind: 'rindicator', text, resp: rc, aux: auxCols, boot: 250 } : null;
  const { result: r, busy, error } = useWorkerJob(job, `${text.length}:${text.slice(0, 200)}:${text.slice(-200)}:${rc}:${auxCols.join(',')}`, (j) => NR.rIndicator(j.text, j.resp, j.aux, { boot: j.boot }));
  const hist = useMemo(() => {
    if (!r || r.error) return null;
    const bins = Array.from({ length: 20 }, (_, i) => ({ x0: i / 20, x1: (i + 1) / 20, count: 0 }));
    for (const p of r.fitted) bins[Math.min(19, Math.floor(p * 20))].count++;
    const lo = bins.findIndex((b) => b.count), hi = 19 - [...bins].reverse().findIndex((b) => b.count);
    return bins.slice(Math.max(0, lo - 1), Math.min(20, hi + 2));
  }, [r]);
  return (
    <>
      <Area label="Everyone sampled (respondents and non-respondents): one row each, a response column (1/0) and frame variables known for all" value={text} onChange={(v) => { setText(v); setAux(null); setResp(null); }} rows={7} />
      {parsed.head.length > 0 && (
        <div className="sx-inputs">
          <ColumnPick label="Responded? (1/0 or yes/no)" head={parsed.head} value={rc} onChange={(v) => { setResp(v); setAux(null); }} />
        </div>
      )}
      {parsed.head.length > 0 && <ColumnChips label="Auxiliary variables (text columns become categories)" head={parsed.head} value={auxCols} onChange={setAux} allowed={(j) => j !== rc} />}
      {busy && <p className="sx-note" role="status">Fitting the response model and bootstrapping…</p>}
      {(error || (r && r.error)) && <Problem>{error || r.error}</Problem>}
      {r && !r.error && (
        <>
          <Result big={r.R.toFixed(3)} label={`R-indicator (95% bootstrap CI ${fmt(r.ci[0], 3)} to ${fmt(r.ci[1], 3)}, ${r.nBoot} resamples)`} tone={r.R >= 0.8 ? 'good' : undefined}>
            <Stats rows={[['Sampled cases', r.n], ['Response rate', pct(r.rate, 1)], ['Mean propensity', pct(r.mean, 1)], ['SD of propensities', r.S.toFixed(4)], ['Maximal absolute standardised bias', r.maxBias.toFixed(3)], r.dropped ? ['Rows left out (missing data)', r.dropped] : null]} />
          </Result>
          <div className="sx-grid2">
            <div>
              <h3 className="clu-h3">Partial R-indicators</h3>
              <Table label="Unconditional partial R-indicators by variable and category" head={['Variable / category', 'n', 'Response rate', 'Partial R']}
                rows={r.partials.flatMap((p) => [{ cls: 'sx-strong', cells: [<b key="n">{p.name}{p.kind === 'num' ? ' (quarters)' : ''}</b>, '', '', <b key="v">{p.pu.toFixed(4)}</b>] }, ...p.cats.map((c) => [`  ${c.name}`, c.n, pct(c.rate, 1), signed(c.pu, 4)])])} />
              <p className="sx-note">Variable rows: how much response varies between its categories. Category rows: negative means under-represented among respondents, positive over-represented.</p>
            </div>
            <div>
              <h3 className="clu-h3">Estimated response propensities</h3>
              {hist && <Histogram bins={hist} label="Histogram of estimated response propensities" xLabel="Estimated chance of responding" marks={[{ x: r.mean, label: `mean ${pct(r.mean, 0)}` }]} />}
              <p className="sx-note">A narrow spike means everyone had a similar chance of responding (R near 1); a wide spread means some groups were much easier to get.</p>
            </div>
          </div>
          <StudySummary {...NR.rIndicatorSummary(r)} />
        </>
      )}
    </>
  );
}

// ── Non-response checks ──
function SxNonresponse() {
  const [tab, setTab] = useState('rates');
  const [disp, setDisp] = useState({ ...EX.EX_DISP });
  const [e, setE] = useState('');
  const [waves, setWaves] = useState(() => EX.exWaves());
  const [frame, setFrame] = useState(() => EX.exFrame());
  const [nonresp, setNonresp] = useState('');
  const [k, setK] = useState(0);
  const a = NR.aapor(disp, e);
  const defaultNr = Math.round(a.R + a.NC + a.O + a.e * a.U);
  const load = () => { setDisp({ ...EX.EX_DISP }); setE(''); setWaves(EX.exWaves()); setFrame(EX.exFrame()); setNonresp(''); setK(k + 1); };
  return (
    <div className="sx-root">
      <LoadExample onClick={load}>Load example (customer survey of a budgeting app)</LoadExample>
      <Tabs label="Check" value={tab} onChange={setTab} options={[['rates', 'Response rates'], ['earlylate', 'Early vs late and waves'], ['rind', 'R-indicator']]} />
      {tab === 'rates' && <RatesTab disp={disp} setDisp={setDisp} e={e} setE={setE} />}
      {tab === 'earlylate' && <EarlyLateTab key={k} text={waves} setText={setWaves} nonresp={nonresp} setNonresp={setNonresp} defaultNr={defaultNr} />}
      {tab === 'rind' && <RIndicatorTab key={k} text={frame} setText={setFrame} />}
      <About method="non-response-bias-assessment" links={[['r-indicators-for-nonresponse-representativeness', 'R-indicators'], ['total-survey-error-framework', 'Total survey error'], ['responsive-and-adaptive-survey-design', 'Responsive and adaptive survey design'], ['survey-fieldwork-planning-monitoring-and-back-checks', 'Fieldwork monitoring'], ['survey-paradata-analysis', 'Survey paradata analysis']]}>
        <p><b>Response rates</b> follow the AAPOR Standard Definitions (American Association for Public Opinion Research, 10th edition, 2023). With completes I, partials P, refusals and break-offs R, non-contacts NC, other eligible non-interviews O and unknown-eligibility cases UH + UO: RR1 = I ÷ (I + P + R + NC + O + UH + UO), RR2 adds P to the numerator, RR3 and RR4 count only e(UH + UO) of the unknowns, RR5 and RR6 count none. Cooperation rate COOP1 = I ÷ (I + P + R + O); contact rate CON1 = (I + P + R + O) ÷ (I + P + R + O + NC + UH + UO). When you leave e blank it is estimated by proportional allocation: e = (I + P + R + NC + O) ÷ (I + P + R + NC + O + NE).</p>
        <p><b>Early vs late.</b> Under the continuum-of-resistance model (Armstrong and Overton 1977; Lin and Schaeffer 1995), people who needed more reminders resemble those who never answered. The tool compares the first and last wave (or fastest and slowest quarter) with Welch's t test, late − early, and fits a straight line of each answer on wave number (OLS, one row per respondent). The extrapolated value is the line at one wave past the last, kept inside the observed range; the adjusted estimate is (Σy + N<sub>nr</sub> × extrapolated) ÷ (n + N<sub>nr</sub>). Binary (0/1) answers are treated as proportions. With more than 8 distinct timing values, waves are replaced by quartiles of the timing column.</p>
        <p><b>R-indicator</b> (Schouten, Cobben and Bethlehem 2009). Response propensities ρ̂<sub>i</sub> come from a main-effects logistic regression of response on the auxiliary variables (text columns as categories with the most common as reference, numbers as linear terms). R = 1 − 2·S(ρ̂), where S is the standard deviation of the propensities (n − 1 denominator). The maximal absolute standardised bias of a respondent mean is (1 − R) ÷ (2ρ̄), which equals the coefficient of variation S ÷ ρ̄. Unconditional partial R-indicators (Schouten, Shlomo and Skinner 2011): P<sub>u</sub>(Z) = √(Σ<sub>k</sub> (n<sub>k</sub>/n)(ρ̄<sub>k</sub> − ρ̄)²) for variable Z, and √(n<sub>k</sub>/n)(ρ̄<sub>k</sub> − ρ̄) for category k; numeric variables are split into quarters. The 95% interval is a percentile bootstrap (250 resamples of cases, refitting the model each time, fixed seed), run in a background worker.</p>
        <p><b>When not to use it.</b> These checks cannot prove the absence of bias: late respondents are only a proxy, and the R-indicator only covers the variables you have for everyone. For opt-in panels without a known sampling frame, AAPOR response rates do not apply (report participation rates). The R-indicator needs data on non-respondents, so it does not work on respondent-only files.</p>
      </About>
    </div>
  );
}

export default SxNonresponse;
