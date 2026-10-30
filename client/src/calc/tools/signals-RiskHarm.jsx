import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as K from './signals-risk.js';
import { Table, LoadExample } from './signals-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, pv, sig, n_ } from './ui.jsx';

// Icon array: 100 people, the exposed risk vs the unexposed risk (natural frequencies).
function IconArray({ r1, r0, label1, label0 }) {
  const row = (r, lbl, cls) => {
    const k = Math.round(r * 100);
    return (
      <div className="sg-card">
        <h4>{lbl}: {k} in 100</h4>
        <svg viewBox="0 0 200 100" className="tl-plot" role="img" aria-label={`${k} in 100 ${lbl}`} style={{ maxWidth: 320 }}>
          {Array.from({ length: 100 }, (_, i) => <circle key={i} cx={10 + (i % 10) * 20} cy={5 + Math.floor(i / 10) * 10} r={3.6} className={i < k ? cls : 'grid'} style={i < k ? undefined : { fill: 'var(--bg-sunk)' }} />)}
        </svg>
      </div>
    );
  };
  return <div className="sg-grid2">{row(r1, label1, 'sg-bar tone-bad')}{row(r0, label0, 'sg-bar')}</div>;
}

function TableMode() {
  const E = K.EXAMPLE_2X2;
  const [v, setV] = useState({ a: String(E.a), b: String(E.b), c: String(E.c), d: String(E.d) });
  const [design, setDesign] = useState('cohort');
  const [pe, setPe] = useState('');
  const [names, setNames] = useState({ exp: 'users shown the pre-ticked add-on', unexp: 'users not shown it', out: 'an unwanted-purchase complaint' });
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const cells = ['a', 'b', 'c', 'd'].map((k) => Math.round(n_(v[k])));
  const t = cells.every((x) => x >= 0) ? K.twoByTwo(...cells, { design, pe: pe === '' ? undefined : n_(pe) / 100 }) : null;
  return (
    <>
      <LoadExample onClick={() => { setV({ a: String(E.a), b: String(E.b), c: String(E.c), d: String(E.d) }); setDesign('cohort'); setPe(''); setNames({ exp: 'users shown the pre-ticked add-on', unexp: 'users not shown it', out: 'an unwanted-purchase complaint' }); }}>Load example (pre-ticked add-on and complaints)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Choice label="Design" value={design} onChange={setDesign} options={[['cohort', 'Cohort or A/B (follow exposed and unexposed)'], ['casecontrol', 'Case-control (sample by outcome)']]} />
      </div>
      <div className="calc-inputs sg-inputs">
        <Num label="Exposed, with the outcome" value={v.a} onChange={set('a')} min={0} />
        <Num label="Exposed, without" value={v.b} onChange={set('b')} min={0} />
        <Num label="Unexposed, with the outcome" value={v.c} onChange={set('c')} min={0} />
        <Num label="Unexposed, without" value={v.d} onChange={set('d')} min={0} />
        {design === 'cohort' && <Num label="Share of the population exposed (optional)" value={pe} onChange={setPe} suffix="%" hint="For the population attributable fraction. Blank = the share exposed in this table." />}
      </div>
      <div className="calc-inputs sg-inputs">
        <label className="calc-field"><span>Exposed group</span><input className="sg-text" value={names.exp} onChange={(e) => setNames((n) => ({ ...n, exp: e.target.value }))} /></label>
        <label className="calc-field"><span>Unexposed group</span><input className="sg-text" value={names.unexp} onChange={(e) => setNames((n) => ({ ...n, unexp: e.target.value }))} /></label>
        <label className="calc-field"><span>Outcome</span><input className="sg-text" value={names.out} onChange={(e) => setNames((n) => ({ ...n, out: e.target.value }))} /></label>
      </div>
      {!t ? <Problem>Enter counts of 0 or more, with at least one exposed and one unexposed person.</Problem> : (
        <>
          <Result big={design === 'casecontrol' ? `OR ${num(t.or.est, 2)}` : `RR ${num(t.rr.est, 2)}`} tone={(design === 'casecontrol' ? t.or : t.rr).lo > 1 ? 'bad' : undefined}
            label={design === 'casecontrol' ? `95% CI ${num(t.or.lo, 2)} to ${num(t.or.hi, 2)}` : `${pct(t.r1, 1)} vs ${pct(t.r0, 1)}; 95% CI ${num(t.rr.lo, 2)} to ${num(t.rr.hi, 2)}; ${t.nn.harm ? 'NNH' : 'NNT'} ${num(t.nn.value, 1)}`}>
            {t.zero && <p>A cell is 0, so 0.5 was added to every cell for the ratios.</p>}
          </Result>
          {design === 'cohort' && <IconArray r1={t.r1} r0={t.r0} label1="Exposed" label0="Unexposed" />}
          <Table label="Risk measures" head={['Measure', 'Estimate', '95% CI', 'Method']}
            rows={[
              design === 'cohort' && ['Risk, exposed', pct(t.r1, 2), `${pct(t.r1CI.lo, 2)} to ${pct(t.r1CI.hi, 2)}`, 'Wilson'],
              design === 'cohort' && ['Risk, unexposed', pct(t.r0, 2), `${pct(t.r0CI.lo, 2)} to ${pct(t.r0CI.hi, 2)}`, 'Wilson'],
              design === 'cohort' && ['Risk ratio (RR)', num(t.rr.est, 3), `${num(t.rr.lo, 3)} to ${num(t.rr.hi, 3)}`, 'Katz log'],
              ['Odds ratio (OR)', num(t.or.est, 3), `${num(t.or.lo, 3)} to ${num(t.or.hi, 3)}`, 'Woolf log'],
              design === 'cohort' && ['Risk difference', `${num(t.rd.est * 100, 2)} pp`, `${num(t.rd.lo * 100, 2)} to ${num(t.rd.hi * 100, 2)} pp`, 'Wald'],
              design === 'cohort' && ['Risk difference', `${num(t.rd.est * 100, 2)} pp`, `${num(t.rd.nLo * 100, 2)} to ${num(t.rd.nHi * 100, 2)} pp`, 'Newcombe hybrid score'],
              design === 'cohort' && [t.nn.harm ? 'Number needed to harm (NNH)' : 'Number needed to treat (NNT)', num(t.nn.value, 1), t.nn.crosses ? `NNH ${num(1 / t.rd.nHi, 1)} to ∞ to NNT ${num(1 / Math.abs(t.rd.nLo), 1)}` : `${num(t.nn.lo, 1)} to ${num(t.nn.hi, 1)}`, '1 / Newcombe interval (Altman 1998)'],
              design === 'cohort' && ['Attributable fraction, exposed', pct(t.afe, 1), '', '(RR − 1) / RR'],
              ['Population attributable fraction', pct(t.paf, 1), '', design === 'cohort' ? `Levin, exposure ${pct(t.pExp, 0)}` : `Miettinen, ${pct(t.pc, 0)} of cases exposed`],
              ['Pearson χ²(1)', num(t.chi2, 3), `p ${pv(t.p)}`, 'No continuity correction'],
            ].filter(Boolean)} />
          <StudySummary {...K.summary2x2(t, names)} />
        </>
      )}
    </>
  );
}

function RateMode() {
  const ex = { newCases: '48', personTime: '1200', atRisk: '1500', existing: '90', population: '1600' };
  const [v, setV] = useState(ex);
  const [unit, setUnit] = useState('person-years');
  const set = (k) => (x) => setV((s) => ({ ...s, [k]: x }));
  const inp = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? NaN : n_(x)]));
  const r = K.incidencePrevalence(inp);
  const any = r.rate || r.cumulative || r.prevalence;
  return (
    <>
      <LoadExample onClick={() => { setV(ex); setUnit('person-years'); }}>Load example (repeated failed log-ins)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Num label="New cases in the period" value={v.newCases} onChange={set('newCases')} min={0} />
        <Num label="Person-time at risk" value={v.personTime} onChange={set('personTime')} min={0} step="any" />
        <Choice label="Time unit" value={unit} onChange={setUnit} options={[['person-years', 'Years'], ['person-months', 'Months'], ['person-weeks', 'Weeks'], ['person-days', 'Days']]} />
        <Num label="People at risk at the start" value={v.atRisk} onChange={set('atRisk')} min={0} />
        <Num label="Existing cases at a point in time" value={v.existing} onChange={set('existing')} min={0} />
        <Num label="People observed at that time" value={v.population} onChange={set('population')} min={0} />
      </div>
      {!any ? <Problem>Enter new cases with person-time or people at risk, or existing cases with the people observed.</Problem> : (
        <>
          <Result big={r.prevalence ? `Prevalence ${pct(r.prevalence.est, 1)}` : `Incidence ${sig(r.rate?.est ?? r.cumulative.est, 3)}`} label={[r.rate && `incidence ${sig(r.rate.est, 3)} per ${unit.replace(/s$/, '')}`, r.duration && `mean duration about ${sig(r.duration, 3)} ${unit.replace(/^person-/, '')}`].filter(Boolean).join('; ')} />
          <Table label="Incidence and prevalence" head={['Measure', 'Estimate', '95% CI', 'Method']}
            rows={[
              r.rate && ['Incidence rate', `${sig(r.rate.est, 4)} per ${unit.replace(/s$/, '')}`, `${sig(r.rate.lo, 4)} to ${sig(r.rate.hi, 4)}`, 'Exact Poisson (Garwood)'],
              r.cumulative && ['Cumulative incidence (risk)', pct(r.cumulative.est, 2), `${pct(r.cumulative.lo, 2)} to ${pct(r.cumulative.hi, 2)}`, 'Wilson'],
              r.prevalence && ['Point prevalence', pct(r.prevalence.est, 2), `${pct(r.prevalence.lo, 2)} to ${pct(r.prevalence.hi, 2)}`, 'Wilson'],
              r.duration && ['Implied mean duration', `${sig(r.duration, 3)} ${unit.replace(/^person-/, '')}`, '', 'P / (I (1 − P)), steady state'],
            ].filter(Boolean)} />
          <StudySummary {...K.summaryIP(r, inp, unit)} />
        </>
      )}
    </>
  );
}

function StdMode() {
  const [text, setText] = useState(K.EXAMPLE_STRATA);
  const [nA, setNA] = useState('App');
  const [nB, setNB] = useState('Web');
  const [per, setPer] = useState(1000);
  const p = useMemo(() => K.parseStrata(text), [text]);
  const s = useMemo(() => K.standardise(p.rows), [p]);
  return (
    <>
      <LoadExample onClick={() => { setText(K.EXAMPLE_STRATA); setNA('App'); setNB('Web'); setPer(1000); }}>Load example (harm reports by account age, app vs web)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Area label="One stratum per line: stratum, events A, people A, events B, people B, standard population (optional)" value={text} onChange={setText} rows={5} hint="Strata are segments that affect the rate (age, tenure, device). The standard population defaults to A + B combined." />
      </div>
      <div className="calc-inputs sg-inputs">
        <label className="calc-field"><span>Group A</span><input className="sg-text" value={nA} onChange={(e) => setNA(e.target.value)} /></label>
        <label className="calc-field"><span>Group B</span><input className="sg-text" value={nB} onChange={(e) => setNB(e.target.value)} /></label>
        <Choice label="Rates per" value={per} onChange={setPer} options={[[100, '100'], [1000, '1,000'], [10000, '10,000']]} />
      </div>
      {p.bad.length > 0 && <Problem>Skipped line{p.bad.length > 1 ? 's' : ''} {p.bad.join(', ')}: each needs a name and four counts, with people above 0.</Problem>}
      {!s ? <Problem>Enter at least two strata.</Problem> : (
        <>
          <Result big={`${sig(s.A.est * per, 3)} vs ${sig(s.B.est * per, 3)}`} label={`Directly standardised rates per ${per.toLocaleString()}, ${nA} vs ${nB}; ratio ${num(s.ratio.est, 2)} (crude ${num(s.crudeRatio, 2)})`} />
          <Table label="Rates by stratum" head={['Stratum', `${nA} rate`, `${nB} rate`, 'Standard population', 'Weight']}
            rows={[...s.rows.map((r) => [r.name, sig((r.xa / r.na) * per, 3), sig((r.xb / r.nb) * per, 3), r.std.toLocaleString(), pct(r.std / s.rows.reduce((t, x) => t + x.std, 0), 1)]),
              { cls: 'tl-cell-ok', cells: ['Crude', sig(s.A.crude * per, 3), sig(s.B.crude * per, 3), '', ''] },
              { cls: 'tl-cell-ok', cells: ['Standardised (95% CI)', `${sig(s.A.est * per, 3)} (${sig(s.A.lo * per, 3)} to ${sig(s.A.hi * per, 3)})`, `${sig(s.B.est * per, 3)} (${sig(s.B.lo * per, 3)} to ${sig(s.B.hi * per, 3)})`, '', ''] }]} />
          <Stats rows={[['Standardised rate ratio', `${num(s.ratio.est, 3)} (${num(s.ratio.lo, 3)} to ${num(s.ratio.hi, 3)})`], ['Crude rate ratio', num(s.crudeRatio, 3)], [`SMR (${nA} vs ${nB}'s rates)`, `${num(s.smr.est, 3)} (${num(s.smr.lo, 3)} to ${num(s.smr.hi, 3)})`], ['Observed / expected', `${s.smr.O} / ${sig(s.smr.E, 4)}`]]} />
          <StudySummary {...K.summaryStd(s, [nA, nB], per)} />
        </>
      )}
    </>
  );
}

// ── Risk and harm ──
function SignalsRiskHarm() {
  const [mode, setMode] = useState('table');
  const M = { table: TableMode, rate: RateMode, std: StdMode }[mode];
  return (
    <>
      <div className="calc-inputs sg-inputs">
        <Choice label="Measure" value={mode} onChange={setMode} options={[['table', 'Risk, odds, NNT/NNH'], ['rate', 'Incidence vs prevalence'], ['std', 'Standardised rates']]} />
      </div>
      <M key={mode} />
      <About method="number-needed-to-treat-and-harm" links={[['population-attributable-harm-estimation', 'Population attributable harm'], ['ux-incidence-and-prevalence-measurement', 'Incidence and prevalence'], ['direct-and-indirect-standardisation', 'Direct and indirect standardisation'], ['ux-case-control-study', 'UX case-control study'], ['ux-epidemiology-framework', 'UX epidemiology framework'], ['natural-frequencies-and-transparent-risk-formats', 'Natural frequencies']]}>
        <p><b>2×2 measures.</b> With a, b the exposed with and without the outcome and c, d the unexposed: risks r₁ = a/(a + b), r₀ = c/(c + d); RR = r₁/r₀ with the Katz interval exp(ln RR ± z√(1/a − 1/(a + b) + 1/c − 1/(c + d))); OR = ad/bc with Woolf's interval exp(ln OR ± z√(1/a + 1/b + 1/c + 1/d)), 0.5 added to every cell if one is 0; RD = r₁ − r₀ with Wald and Newcombe hybrid-score intervals. Checked against statsmodels Table2x2 and confint_proportions_2indep.</p>
        <p><b>NNT and NNH.</b> 1/|RD|: the number of people who must be exposed for one more (NNH) or one fewer (NNT) to have the outcome. The interval inverts the RD interval; when that includes 0, it runs from NNH through infinity to NNT (Altman 1998, BMJ 317:1309).</p>
        <p><b>Attributable fractions.</b> Among the exposed AFₑ = (RR − 1)/RR. Population (Levin 1953) PAF = pₑ(RR − 1)/(1 + pₑ(RR − 1)), pₑ = share of the population exposed. For case-control data Miettinen's PAF = p_c(OR − 1)/OR uses the share of cases exposed. Both assume the association is causal and unconfounded.</p>
        <p><b>Incidence and prevalence.</b> Incidence rate = new cases / person-time at risk, with the exact Poisson interval [χ²(α/2, 2x)/2, χ²(1 − α/2, 2x + 2)/2] / person-time; cumulative incidence and prevalence are proportions with Wilson intervals. In a steady state P/(1 − P) = I × D, so mean duration D = P/(I(1 − P)) (Rothman, Greenland and Lash, <i>Modern Epidemiology</i>).</p>
        <p><b>Standardisation.</b> Direct: DSR = Σwᵢxᵢ/nᵢ with standard weights wᵢ, and Fay and Feuer's (1997) gamma interval (as R epitools ageadjust.direct). The ratio of two DSRs uses a log-normal interval. Indirect: SMR = observed / expected, where expected applies group B's stratum rates to group A's people, with an exact Poisson interval on the observed count.</p>
        <p><b>When not to use it.</b> Do not compute risk ratios, risk differences or NNT from case-control data (the outcome share is fixed by design). Do not read attributable fractions as "harm we could prevent" unless the exposure is a cause and removing it would not shift people to another harm. With very small counts (under 5 in a cell) use exact methods.</p>
      </About>
    </>
  );
}

export default SignalsRiskHarm;
