import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as A from './scorers-agree.js';
import { parseMatrix, toCSV } from './scorers-math.js';
import { IntervalRows, Scatter, Columns, Table } from './scorers-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pv, download } from './ui.jsx';

// Example data. ICC: 15 recorded sessions scored 1–10 for task-flow quality by four researchers.
const ICC_EX = `Session, Ana, Ben, Chloe, Dev
S01, 7, 8, 6, 7
S02, 4, 5, 3, 5
S03, 9, 9, 8, 9
S04, 5, 6, 4, 6
S05, 6, 7, 6, 7
S06, 3, 4, 2, 4
S07, 8, 8, 7, 9
S08, 5, 5, 4, 6
S09, 7, 7, 5, 8
S10, 2, 3, 2, 3
S11, 6, 8, 5, 7
S12, 8, 9, 7, 8
S13, 4, 4, 3, 5
S14, 6, 6, 5, 7
S15, 9, 10, 8, 9`;
// Shrout and Fleiss (1979), Table 2: six targets rated by four judges.
const SF_EX = `Target, J1, J2, J3, J4
T1, 9, 2, 5, 8
T2, 6, 1, 3, 2
T3, 8, 4, 6, 8
T4, 7, 1, 2, 6
T5, 10, 5, 6, 9
T6, 6, 2, 4, 7`;
// Kendall's W: six stakeholders rank eight roadmap features (1 = most important).
const W_EX = `Feature, PM, Design, Eng, Support, Sales, Research
Saved searches, 1, 2, 3, 1, 2, 1
Bulk edit, 3, 1, 2, 4, 5, 3
Offline mode, 6, 7, 5, 6, 8, 7
Dark mode, 8, 8, 8, 7, 6, 8
SSO, 5, 4, 1, 5, 1, 4
Export to CSV, 2, 3, 4, 2, 3, 2
In-app chat, 7, 6, 7, 8, 7, 6
Templates, 4, 5, 6, 3, 4, 5`;
// rwg(j): members of seven product teams answer three 5-point items on "we understand our users".
const RWG_EX = `Team, Q1, Q2, Q3
Search, 4, 4, 5
Search, 4, 5, 4
Search, 5, 4, 4
Search, 4, 4, 4
Search, 4, 5, 5
Checkout, 2, 4, 3
Checkout, 5, 2, 4
Checkout, 3, 3, 1
Checkout, 4, 5, 2
Checkout, 1, 3, 4
Onboarding, 3, 4, 3
Onboarding, 4, 4, 3
Onboarding, 3, 3, 4
Onboarding, 4, 3, 3
Onboarding, 3, 4, 4
Onboarding, 2, 3, 3
Billing, 5, 5, 4
Billing, 4, 5, 5
Billing, 5, 4, 5
Billing, 5, 5, 5
Mobile, 2, 3, 2
Mobile, 3, 2, 2
Mobile, 2, 2, 3
Mobile, 4, 2, 2
Mobile, 2, 3, 2
Admin, 3, 5, 2
Admin, 4, 2, 4
Admin, 2, 4, 5
Admin, 5, 3, 3
Settings, 4, 4, 4
Settings, 4, 3, 4
Settings, 3, 4, 4
Settings, 4, 4, 5
Settings, 4, 4, 3`;
// Bland-Altman: task time from analytics logs vs a moderator's stopwatch, 32 sessions (seconds).
const BA_EX = `Session, Logs (s), Stopwatch (s)
P01, 60.0, 60.2
P02, 68.6, 69.3
P03, 53.0, 57.7
P04, 40.2, 40.6
P05, 48.9, 51.1
P06, 38.4, 42.5
P07, 61.6, 62.7
P08, 109.7, 112.4
P09, 48.1, 50.6
P10, 45.4, 47.8
P11, 74.8, 74.7
P12, 70.5, 73.2
P13, 62.9, 68.3
P14, 39.5, 38.3
P15, 59.2, 63.5
P16, 82.0, 84.9
P17, 32.8, 33.5
P18, 48.8, 55.5
P19, 25.5, 29.2
P20, 33.6, 33.1
P21, 26.2, 28.4
P22, 54.0, 57.6
P23, 33.9, 35.6
P24, 67.8, 71.8
P25, 64.4, 66.7
P26, 55.2, 59.0
P27, 19.3, 24.5
P28, 47.1, 47.9
P29, 58.7, 61.5
P30, 63.1, 64.5
P31, 30.1, 32.5
P32, 48.4, 48.1`;
export const AGREEMENT_EXAMPLES = { ICC_EX, SF_EX, W_EX, RWG_EX, BA_EX };

const KOO = [{ from: 0, to: 0.5, label: 'Poor', tone: 'bad' }, { from: 0.5, to: 0.75, label: 'Moderate', tone: 'warn' }, { from: 0.75, to: 0.9, label: 'Good', tone: 'ok' }, { from: 0.9, to: 1, label: 'Excellent', tone: 'good' }];

function IccPanel({ conf }) {
  const [text, setText] = useState(ICC_EX);
  const [same, setSame] = useState(true);
  const [agree, setAgree] = useState(true);
  const [avg, setAvg] = useState(false);
  const parsed = useMemo(() => parseMatrix(text), [text]);
  const cr = useMemo(() => A.completeRows(parsed.rows), [parsed]);
  const r = useMemo(() => (cr.rows.length >= 2 && cr.k >= 2 ? A.icc(cr.rows, conf) : null), [cr, conf]);
  const pick = A.pickForm({ sameRaters: same, agreement: agree, average: avg });
  const f = r?.forms.find((x) => x.id === pick);
  return (
    <>
      <div className="tl-row sc-row">
        <button type="button" className="btn ghost small" onClick={() => setText(ICC_EX)}>Load example (session scoring)</button>
        <button type="button" className="btn ghost small" onClick={() => setText(SF_EX)}>Load Shrout and Fleiss (1979) data</button>
      </div>
      <div className="calc-inputs sc-inputs">
        <Area label="One target per row, one rater per column (optional label column and header row)" value={text} onChange={setText} rows={8} hint="Targets are the things rated (sessions, screens, issues). Rows with a missing rating are left out." />
        <Choice label="Did the same raters rate every target?" value={same} onChange={setSame} options={[[true, 'Yes'], [false, 'No, different raters per target']]} />
        {same && <Choice label="Must raters give the same scores, or only rank targets alike?" value={agree} onChange={setAgree} options={[[true, 'Same scores (absolute agreement)'], [false, 'Rank alike (consistency)']]} />}
        <Choice label="Will you use one rater's score or the mean of all raters?" value={avg} onChange={setAvg} options={[[false, 'One rater'], [true, 'Mean of raters']]} />
      </div>
      {cr.dropped > 0 && <Problem>Left out {cr.dropped} row{cr.dropped === 1 ? '' : 's'} with a missing or extra rating.</Problem>}
      {!r ? <Problem>Enter at least two targets and two raters.</Problem> : (
        <>
          <Result big={`${f.sf} = ${num(f.icc, 3)}`} tone={f.lo >= 0.75 ? 'good' : f.hi < 0.5 ? 'bad' : ''} label={`${f.mw}; ${Math.round(conf * 100)}% CI ${num(f.lo, 3)} to ${num(f.hi, 3)}; ${r.n} targets × ${r.k} raters`} />
          <h3 className="clu-h3">All six forms</h3>
          <IntervalRows label="ICC forms with confidence intervals against Koo and Li's bands" min={Math.min(0, ...r.forms.map((x) => x.lo).filter(Number.isFinite))} max={1} bands={KOO}
            rows={r.forms.map((x, i) => ({ name: x.sf, est: x.icc, lo: x.lo, hi: x.hi, bold: x.id === pick, color: x.id === pick ? 'var(--c2)' : 'var(--c1)', i }))}
            right={(row) => `${num(row.est, 3)} [${num(row.lo, 2)}, ${num(row.hi, 2)}]`} xLabel="ICC (bands: Koo and Li 2016)" />
          <Table label="ICC forms" head={['Shrout-Fleiss', 'McGraw-Wong', 'ICC', `${Math.round(conf * 100)}% CI`, 'F', 'df', 'p']} rows={r.forms.map((x) => ({ cls: x.id === pick ? 'on' : '', cells: [x.sf, x.mw, num(x.icc, 3), `${num(x.lo, 3)} to ${num(x.hi, 3)}`, num(x.F, 2), `${x.df1}, ${x.df2}`, pv(x.p)] }))} />
          <p className="tl-note">McGraw and Wong's ten forms give six distinct values: two-way random and two-way mixed models share a formula, so ICC(A,1) and ICC(C,1) here serve both; only the interpretation (generalise to other raters or not) differs.</p>
          <Stats rows={[['MS targets', num(r.msb, 3)], ['MS raters', num(r.msj, 3)], ['MS error', num(r.mse, 3)], ['MS within targets', num(r.msw, 3)], ['Rater means', r.raterMeans.map((v, j) => `${parsed.names[j] || j + 1} ${num(v, 2)}`).join(' · ')]]} />
          <StudySummary {...A.iccSummary(r, pick)} />
        </>
      )}
    </>
  );
}

function KendallPanel() {
  const [text, setText] = useState(W_EX);
  const parsed = useMemo(() => parseMatrix(text), [text]);
  const cr = useMemo(() => A.completeRows(parsed.rows), [parsed]);
  const r = useMemo(() => (cr.rows.length >= 2 && cr.k >= 2 ? A.kendallW(cr.rows) : null), [cr]);
  const labels = parsed.labels.filter((_, i) => parsed.rows[i].length === cr.k && parsed.rows[i].every(Number.isFinite));
  const order = r ? r.meanRanks.map((m, i) => [m, i]).sort((a, b) => a[0] - b[0]) : [];
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => setText(W_EX)}>Load example (feature ranking)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="One item per row, one judge per column: ranks, or scores that will be ranked within each judge" value={text} onChange={setText} rows={8} hint="Ties get average ranks. Direction does not matter for W, but mean ranks below assume 1 = first." />
      </div>
      {cr.dropped > 0 && <Problem>Left out {cr.dropped} row{cr.dropped === 1 ? '' : 's'} with a missing value.</Problem>}
      {!r ? <Problem>Enter at least two items and two judges.</Problem> : (
        <>
          <Result big={`W = ${num(r.W, 3)}`} tone={r.W >= 0.7 ? 'good' : r.W < 0.3 ? 'bad' : ''} label={`χ²(${r.df}) = ${num(r.chi2, 2)}, p ${pv(r.p)}; ${r.m} judges, ${r.n} items; ${A.schmidt(r.W)} (Schmidt 1997)`} />
          <h3 className="clu-h3">Mean rank of each item</h3>
          <Columns label="Mean rank by item, lower is ranked higher" bars={order.map(([m, i]) => ({ label: labels[i] || `Item ${i + 1}`, value: m, top: num(m, 1) }))} min={0} max={r.n} refY={(r.n + 1) / 2} refLabel="Mean rank if random" />
          <Stats rows={[
            ["Kendall's W (tie-corrected)", num(r.W, 4)], ['W without tie correction', num(r.Wraw, 4)], ['χ² = m(n − 1)W', `${num(r.chi2, 3)} on ${r.df} df, p ${pv(r.p)}`],
            ['F test', `F(${num(r.fdf1, 2)}, ${num(r.fdf2, 2)}) = ${num(r.F, 3)}, p ${pv(r.pF)}`], ['Mean Spearman ρ between judges', num(r.rBar, 3)], ['Sum of squared rank deviations S', num(r.S, 1)],
          ]} />
          <StudySummary {...A.kendallSummary(r)} />
        </>
      )}
    </>
  );
}

function RwgPanel() {
  const [text, setText] = useState(RWG_EX);
  const [opts, setOpts] = useState('5');
  const [nullVar, setNullVar] = useState('');
  const g = useMemo(() => A.parseGroups(text), [text]);
  const Aopt = Math.round(Number(opts));
  const r = useMemo(() => (g.groups.length && Aopt >= 2 ? A.rwg(g.groups, { A: Aopt, nullVar: nullVar === '' ? NaN : Number(nullVar) }) : null), [g, Aopt, nullVar]);
  const name = g.J > 1 ? 'rwg(j)' : 'rwg';
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(RWG_EX); setOpts('5'); setNullVar(''); }}>Load example (team survey)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="One rater per row: group name, then their answer to each item" value={text} onChange={setText} rows={8} hint="One item gives rwg; several parallel items give rwg(j)." />
        <Num label="Response options on the scale (A)" value={opts} onChange={setOpts} min={2} max={101} />
        <Num label="Null variance (blank = uniform, (A² − 1)/12)" value={nullVar} onChange={setNullVar} min={0} step={0.01} hint={`Uniform for A = ${Aopt || '?'}: ${Aopt >= 2 ? num(A.uniformNullVar(Aopt), 3) : '—'}. Enter a skewed-null variance from LeBreton and Senter (2008) if answers lean one way.`} />
      </div>
      {g.bad > 0 && <Problem>Could not read {g.bad} line{g.bad === 1 ? '' : 's'}.</Problem>}
      {!r || !r.k ? <Problem>Enter at least one group with two or more raters.</Problem> : (
        <>
          <Result big={`Median ${name} = ${num(r.median, 2)}`} tone={r.median >= 0.7 ? 'good' : r.median < 0.5 ? 'bad' : ''} label={`${r.k} groups; ${num(r.share70 * 100, 0)}% at or above 0.70; ${A.leBreton(r.median)} (LeBreton and Senter 2008)`} />
          <Columns label={`${name} by group with the 0.70 line`} bars={r.groups.filter((x) => x.ok).map((x) => ({ label: x.name, value: x.value, top: num(x.value, 2), tone: x.value >= 0.7 ? 'ok' : x.value >= 0.5 ? 'warn' : 'bad' }))} min={0} max={1} refY={0.7} refLabel="0.70" />
          <Table label="Agreement by group" head={['Group', 'Raters', 'Items', 'Mean', 'Mean item variance', name, 'Untruncated', 'AD(M)', `AD ≤ ${num(r.admCut, 2)}`]}
            rows={r.groups.map((x) => (x.ok ? [x.name, x.n, x.J, num(x.mean, 2), num(x.sBar, 3), num(x.value, 3), x.truncated ? `${num(x.raw, 3)} → 0` : num(x.raw, 3), num(x.adm, 3), x.adm <= r.admCut ? 'yes' : 'no'] : [x.name, x.n, '—', '—', '—', 'needs 2 raters', '—', '—', '—']))} />
          <StudySummary {...A.rwgSummary(r)} />
        </>
      )}
    </>
  );
}

function BlandPanel({ conf }) {
  const [text, setText] = useState(BA_EX);
  const [pctMode, setPctMode] = useState(false);
  const [tol, setTol] = useState('');
  const parsed = useMemo(() => parseMatrix(text), [text]);
  const r = useMemo(() => (parsed.k >= 2 ? A.blandAltman(parsed.rows.map((x) => x[0]), parsed.rows.map((x) => x[1]), { conf, percent: pctMode }) : null), [parsed, conf, pctMode]);
  const [na, nb] = [parsed.names[0] || 'Method A', parsed.names[1] || 'Method B'];
  const u = pctMode ? '%' : '';
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(BA_EX); setPctMode(false); setTol('3'); }}>Load example (logged vs stopwatch task times)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="One case per row: measurement by method A, then by method B (optional label column and header)" value={text} onChange={setText} rows={8} />
        <Choice label="Differences" value={pctMode} onChange={setPctMode} options={[[false, 'A − B'], [true, 'Percent of the mean']]} />
        <Num label="Largest acceptable difference (optional)" value={tol} onChange={setTol} min={0} step={0.1} suffix={u || undefined} />
      </div>
      {!r ? <Problem>Enter at least three complete pairs.</Problem> : r.error ? <Problem>{r.error}</Problem> : (
        <>
          <Result big={`Bias ${num(r.bias, 2)}${u}`} label={`${Math.round(r.loa * 100)}% limits of agreement ${num(r.lower, 2)}${u} to ${num(r.upper, 2)}${u}; ${r.n} pairs; ${na} − ${nb}`} />
          <Scatter label="Bland-Altman plot: difference against mean of the two methods" points={r.m.map((x, i) => [x, r.d[i]])} xLabel={`Mean of ${na} and ${nb}`} yLabel={pctMode ? 'Difference (% of mean)' : `Difference (${na} − ${nb})`}
            hlines={[{ y: 0, kind: 'zero' }, { y: r.bias, kind: 'bias', label: `Bias ${num(r.bias, 2)}`, lo: r.biasLo, hi: r.biasHi }, { y: r.upper, label: `Upper ${num(r.upper, 2)}`, lo: r.upperLo, hi: r.upperHi }, { y: r.lower, label: `Lower ${num(r.lower, 2)}`, lo: r.lowerLo, hi: r.lowerHi }]}
            fit={r.reg} />
          <p className="tl-note">Shaded bands are the {Math.round(conf * 100)}% CIs of the bias and of each limit; the dashed sloping line is the regression of difference on mean (proportional bias check).</p>
          <Stats rows={[
            ['Bias (mean difference)', `${num(r.bias, 3)}${u}, ${Math.round(conf * 100)}% CI ${num(r.biasLo, 3)} to ${num(r.biasHi, 3)}; t(${r.n - 1}) = ${num(r.tBias, 2)}, p ${pv(r.pBias)}`],
            ['SD of differences', num(r.sd, 3)],
            ['Upper limit (bias + 1.96 SD)', `${num(r.upper, 3)}, CI ${num(r.upperLo, 3)} to ${num(r.upperHi, 3)}`],
            ['Lower limit (bias − 1.96 SD)', `${num(r.lower, 3)}, CI ${num(r.lowerLo, 3)} to ${num(r.lowerHi, 3)}`],
            ['Pairs outside the limits', `${r.outside} of ${r.n}`],
            ['Proportional bias (difference on mean)', `slope ${num(r.reg.b, 4)}, t(${r.reg.df}) = ${num(r.reg.t, 2)}, p ${pv(r.reg.p)}`],
          ]} />
          <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => download('bland-altman.csv', toCSV(['label', 'mean', 'difference'], r.m.map((x, i) => [parsed.labels[i], x, r.d[i]])), 'text/csv')}>Download differences (CSV)</button></div>
          <StudySummary {...A.baSummary(r, { tol: tol === '' ? NaN : Number(tol) })} />
        </>
      )}
    </>
  );
}

// ── Agreement indices ──
function ScorersAgreement() {
  const [tab, setTab] = useState('icc');
  const [conf, setConf] = useState(0.95);
  return (
    <>
      <div className="calc-inputs sc-inputs">
        <Choice label="Index" value={tab} onChange={setTab} options={[['icc', 'Intraclass correlation'], ['w', "Kendall's W"], ['rwg', 'rwg / rwg(j)'], ['ba', 'Bland-Altman']]} />
        {(tab === 'icc' || tab === 'ba') && <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />}
      </div>
      {tab === 'icc' && <IccPanel conf={conf} />}
      {tab === 'w' && <KendallPanel />}
      {tab === 'rwg' && <RwgPanel />}
      {tab === 'ba' && <BlandPanel conf={conf} />}
      <About method="intraclass-correlation-icc" links={[['kendalls-coefficient-of-concordance-w', "Kendall's W"], ['within-group-agreement-index-rwg', 'rwg'], ['bland-altman-agreement-analysis', 'Bland-Altman analysis']]}>
        <p><b>Intraclass correlation.</b> From the two-way ANOVA of n targets × k raters: MSR (targets), MSC (raters), MSE (residual) and the one-way MSW = (SSC + SSE)/(n(k − 1)). ICC(1,1) = (MSR − MSW)/(MSR + (k − 1)MSW); ICC(2,1) = ICC(A,1) = (MSR − MSE)/(MSR + (k − 1)MSE + k(MSC − MSE)/n); ICC(3,1) = ICC(C,1) = (MSR − MSE)/(MSR + (k − 1)MSE); the average-measure forms are (MSR − MSW)/MSR, (MSR − MSE)/(MSR + (MSC − MSE)/n) and (MSR − MSE)/MSR (Shrout and Fleiss 1979; McGraw and Wong 1996). F tests: MSR/MSW on n − 1 and n(k − 1) df, or MSR/MSE on n − 1 and (n − 1)(k − 1) df. Confidence intervals use the F distribution (McGraw and Wong 1996, Table 7), with Satterthwaite's approximate df for the absolute-agreement forms, exactly as pingouin and R's psych::ICC. Bands: below 0.5 poor, 0.5–0.75 moderate, 0.75–0.9 good, above 0.9 excellent (Koo and Li 2016, J Chiropractic Medicine 15:155), judged on the interval, not just the point.</p>
        <p><b>Kendall's W.</b> Each judge's scores are ranked (average ranks for ties); with rank sums Rᵢ and S = Σ(Rᵢ − m(n + 1)/2)², W = 12S/(m²(n³ − n) − mΣ(t³ − t)). χ² = m(n − 1)W on n − 1 df; F = (m − 1)W/(1 − W) on n − 1 − 2/m and (m − 1)(n − 1 − 2/m) df; mean Spearman correlation (mW − 1)/(m − 1) (Kendall and Babington Smith 1939; Siegel and Castellan 1988). Guide: 0.1 very weak, 0.3 weak, 0.5 moderate, 0.7 strong, 0.9 unusually strong (Schmidt 1997, Decision Sciences 28:763).</p>
        <p><b>rwg and rwg(j).</b> rwg = 1 − s²/σ²_E for one item; rwg(j) = J(1 − s̄²/σ²_E)/(J(1 − s̄²/σ²_E) + s̄²/σ²_E) for J parallel items, where s̄² is the mean of the item variances within the group and σ²_E = (A² − 1)/12 is the variance of uniform random answers on A options (James, Demaree and Wolf 1984). Values with s̄² ≥ σ²_E are set to 0. AD(M) is the mean absolute deviation from the item mean, averaged over items; agreement when AD ≤ A/6 (Burke and Dunlap 2002). Bands: .00–.30 lack of agreement, .31–.50 weak, .51–.70 moderate, .71–.90 strong, .91–1.00 very strong (LeBreton and Senter 2008, Organizational Research Methods 11:815).</p>
        <p><b>Bland-Altman.</b> d = A − B (or 100(A − B)/|mean|). Bias = mean d with a t interval; limits = bias ± 1.96·SD(d); each limit's CI uses SE ≈ √(3s²/n) with t on n − 1 df (Bland and Altman 1986, Lancet i:307; 1999, Stat Methods Med Res 8:135). Proportional bias: least-squares slope of d on the mean of the two methods.</p>
        <p><b>When not to use them.</b> ICC needs interval-like scores and targets that really differ; for categories use <Link to="/calculators/intercoder">Cohen's kappa or Krippendorff's alpha</Link>. W is for rankings and says nothing about the size of differences. rwg assumes everyone in a group rates the same target and depends on the null you choose. Bland-Altman compares two methods measuring the same quantity on the same scale; it is not a test of correlation.</p>
      </About>
    </>
  );
}

export default ScorersAgreement;
