import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as A from './expanalytics-abhealth.js';
import { LinePlot, BarChart, IntervalPlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, pv, n_ } from './ui.jsx';

const SRM_SAMPLE = '# arm, users, planned share\nControl, 50812, 50\nNew checkout, 49388, 50';
// Deterministic example users (a simple LCG, so the example is the same on every load).
function exampleRatioRows() {
  let s = 12345; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const lines = ['# user, arm, clicks, sessions'];
  for (let i = 1; i <= 400; i++) {
    const arm = i % 2 ? 'Control' : 'Treatment';
    const sessions = 1 + Math.floor(-Math.log(1 - r()) * 3);
    const rate = (arm === 'Control' ? 0.9 : 1.05) * (0.5 + r());
    let clicks = 0; for (let k = 0; k < sessions; k++) clicks += Math.floor(rate * 2 * r() + 0.3);
    lines.push(`u${i}, ${arm}, ${clicks}, ${sessions}`);
  }
  return lines.join('\n');
}
export function exampleAAPs() {
  let s = 2024; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: 120 }, () => +r().toFixed(4));
}

function SrmMode() {
  const [text, setText] = useState(SRM_SAMPLE);
  const rows = useMemo(() => String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/[\t,;]+/).map((x) => x.trim())), [text]);
  const parsed = rows.map((r) => ({ name: r[0], n: Number(r[1]), w: r[2] === undefined ? 1 : Number(String(r[2]).replace('%', '')) }));
  const ok = parsed.length >= 2 && parsed.every((p) => Number.isFinite(p.n) && p.n >= 0 && p.w > 0) && parsed.some((p) => p.n > 0);
  const r = ok ? A.srm(parsed.map((p) => p.n), parsed.map((p) => p.w), parsed.map((p) => p.name)) : null;
  return (
    <>
      <LoadExample onClick={() => setText(SRM_SAMPLE)} />
      <div className="calc-inputs ea-inputs">
        <Area label="One arm per line: name, users assigned, planned share" value={text} onChange={setText} rows={5} hint="Planned share can be a percentage or a weight (50, 50 or 1, 1). Count users at assignment, the same way for every arm." />
      </div>
      {!r ? <Problem>Enter at least two arms with user counts and positive planned shares.</Problem> : (
        <>
          <Result big={r.flag ? 'Sample ratio mismatch' : 'No mismatch'} tone={r.flag ? 'bad' : 'good'} label={`χ²(${r.df}) = ${num(r.chi2, 2)}, p ${pv(r.p)}; flagged when p < 0.001`}>
            <p>{r.flag ? 'The users are not split the way the test was set up. Stop and find the cause before reading any result.' : 'The observed split is consistent with the planned allocation.'}</p>
          </Result>
          <Table label="Observed and expected users per arm" head={['Arm', 'Observed', 'Expected', 'Observed share', 'Planned share', 'Difference', 'χ² part']}
            rows={r.arms.map((a, i) => [a.name, a.observed.toLocaleString(), Math.round(a.expected).toLocaleString(), pct(a.share, 2), pct(a.planned, 2), `${a.rel >= 0 ? '+' : ''}${pct(a.rel, 2)}`, num(r.parts[i], 2)])} />
          <StudySummary {...A.srmSummary(r)} />
        </>
      )}
    </>
  );
}

function MdeMode() {
  const [type, setType] = useState('prop');
  const [base, setBase] = useState('4.2'); const [mean, setMean] = useState('38'); const [sd, setSd] = useState('55');
  const [daily, setDaily] = useState('12000'); const [arms, setArms] = useState('2');
  const [alpha, setAlpha] = useState('0.05'); const [power, setPower] = useState('0.8'); const [sided, setSided] = useState(2);
  const [rho, setRho] = useState('0'); const [goal, setGoal] = useState('mde'); const [days, setDays] = useState('14'); const [target, setTarget] = useState('5');
  const example = () => { setType('prop'); setBase('4.2'); setDaily('12000'); setArms('2'); setAlpha('0.05'); setPower('0.8'); setSided(2); setRho('0.5'); setGoal('mde'); setDays('14'); setTarget('5'); };
  const b = type === 'prop' ? n_(base) / 100 : n_(mean);
  const o = { type, base: b, sd: n_(sd), daily: n_(daily), arms: Math.round(n_(arms)), alpha: n_(alpha), power: n_(power), sided, rho: n_(rho), correct: true };
  const ok = b > 0 && (type === 'mean' ? o.sd > 0 : b < 1) && o.daily > 0 && o.arms >= 2 && o.alpha > 0 && o.alpha < 0.5 && o.power > 0.5 && o.power < 1 && o.rho >= 0 && o.rho < 1;
  const r = useMemo(() => (ok ? A.plan({ ...o, ...(goal === 'mde' ? { days: n_(days) } : { mde: n_(target) / 100, mdeRel: true }) }) : null), [ok, JSON.stringify(o), goal, days, target]);
  const unit = type === 'prop' ? (v) => `${(v * 100).toFixed(2)} pp` : (v) => num(v, 2);
  const valid = r && !r.error && (r.mode === 'mde' ? Number.isFinite(r.mde) && n_(days) > 0 : Number.isFinite(r.n));
  return (
    <>
      <LoadExample onClick={example}>Load example (with CUPED)</LoadExample>
      <div className="calc-inputs ea-inputs">
        <Choice label="Metric" value={type} onChange={setType} options={[['prop', 'Conversion rate'], ['mean', 'Mean (revenue, time…)']]} />
        {type === 'prop' ? <Num label="Baseline rate" value={base} onChange={setBase} step="any" suffix="%" /> : <><Num label="Baseline mean" value={mean} onChange={setMean} step="any" /><Num label="Standard deviation" value={sd} onChange={setSd} step="any" /></>}
        <Num label="Users per day (all arms)" value={daily} onChange={setDaily} step="any" />
        <Num label="Arms (incl. control)" value={arms} onChange={setArms} min={2} />
        <Num label="α" value={alpha} onChange={setAlpha} step="0.01" />
        <Num label="Power" value={power} onChange={setPower} step="0.05" />
        <Choice label="Test" value={sided} onChange={setSided} options={[[2, 'Two-sided'], [1, 'One-sided']]} />
        <Num label="CUPED pre-period correlation ρ" value={rho} onChange={setRho} step="0.05" hint="0 for no CUPED. ρ is the correlation between the metric and the same metric before the test." />
        <Choice label="Solve for" value={goal} onChange={setGoal} options={[['mde', 'MDE for a duration'], ['days', 'Duration for an MDE']]} />
        {goal === 'mde' ? <Num label="Duration" value={days} onChange={setDays} suffix="days" /> : <Num label="Target MDE (relative)" value={target} onChange={setTarget} step="any" suffix="%" />}
      </div>
      {!ok ? <Problem>Check the inputs: a baseline above 0 (below 100% for rates), traffic above 0, at least 2 arms, α below 0.5, power between 0.5 and 1, and ρ from 0 to below 1.</Problem> : r?.error ? <Problem>{r.error}</Problem> : !valid ? <Problem>No sample size reaches that power; try a larger effect.</Problem> : (
        <>
          {r.mode === 'mde'
            ? <Result big={`MDE ${pct(r.rel, 1)} relative`} label={`${unit(r.mde)} absolute, with ${Math.round(r.n).toLocaleString()} users per arm in ${days} days`}><p>{o.rho > 0 && `Without CUPED the MDE would be ${unit(r.mdeNoCuped)} (${pct(r.mdeNoCuped / b, 1)}). `}α used per comparison: {num(r.alphaUsed, 4)}.</p></Result>
            : <Result big={`${r.days} days`} label={`${r.n.toLocaleString()} users per arm, ${r.total.toLocaleString()} in total`}><p>{o.rho > 0 && `Without CUPED: ${r.daysNoCuped} days. `}Round up to whole weeks so every weekday is covered equally.</p></Result>}
          <h3 className="clu-h3">MDE by test length</h3>
          <LinePlot label="Relative MDE by number of weeks" series={[{ name: 'Relative MDE', pts: r.weeks.map((w) => [w.weeks, w.rel * 100]), dots: true }]} xLabel="Weeks" yLabel="Relative MDE (%)" yMin={0} xFmt={(v) => String(v)} yFmt={(v) => `${v}%`} />
          <Table label="MDE by weeks" head={['Weeks', 'Users per arm', 'MDE (absolute)', 'MDE (relative)']} rows={r.weeks.map((w) => [w.weeks, Math.round(w.n).toLocaleString(), unit(w.mde), pct(w.rel, 1)])} />
          <StudySummary {...A.mdeSummary(r, { ...o, days: goal === 'mde' ? n_(days) : r.days })} />
        </>
      )}
    </>
  );
}

function DeltaMode() {
  const [input, setInput] = useState('rows');
  const [text, setText] = useState(exampleRatioRows);
  const [sumText, setSumText] = useState('# arm, users, mean clicks, mean sessions, SD clicks, SD sessions, correlation\nControl, 25000, 4.10, 3.02, 5.8, 3.1, 0.82\nTreatment, 25100, 4.32, 3.05, 6.1, 3.2, 0.83');
  const parsed = useMemo(() => (input === 'rows' ? A.parseRatioRows(text) : null), [text, input]);
  let arms = [];
  if (input === 'rows' && parsed) arms = parsed.arms.filter((a) => a.xs.length >= 2).map((a) => ({ name: a.name, ...A.ratioStats(a.xs, a.ys) }));
  else {
    arms = sumText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/[\t,;]+/).map((x) => x.trim())).filter((p) => p.length >= 7).map((p) => {
      const [n, mx, my, sx, sy, r] = p.slice(1, 7).map(Number);
      return { name: p[0], n, mx, my, vx: sx * sx, vy: sy * sy, cxy: r * sx * sy };
    });
  }
  const ok = arms.length >= 2 && arms.slice(0, 2).every((a) => a.n >= 2 && a.my > 0 && [a.mx, a.vx, a.vy, a.cxy].every(Number.isFinite));
  const r = ok ? A.deltaMethod(arms[0], arms[1]) : null;
  return (
    <>
      <LoadExample onClick={() => { setInput('rows'); setText(exampleRatioRows()); }} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Your data" value={input} onChange={setInput} options={[['rows', 'One row per user'], ['summary', 'Summary per arm']]} />
        {input === 'rows'
          ? <Area label="One row per randomised user: user, arm, numerator, denominator" value={text} onChange={setText} rows={8} hint="For clicks per session: the user's total clicks and total sessions. The first arm listed is the control." />
          : <Area label="One line per arm: arm, users, mean numerator, mean denominator, SD numerator, SD denominator, correlation" value={sumText} onChange={setSumText} rows={4} hint="Per-user means, SDs and the correlation between a user's numerator and denominator. The first line is the control." />}
      </div>
      {parsed?.bad.length > 0 && <Problem>Skipped lines {parsed.bad.slice(0, 8).join(', ')}: use "user, arm, numerator, denominator".</Problem>}
      {!r ? <Problem>Enter two arms with at least two users each and a positive mean denominator.</Problem> : (
        <>
          <Result big={`${r.lift >= 0 ? '+' : ''}${pct(r.lift, 1)} lift`} tone={r.lo > 0 || r.hi < 0 ? 'good' : ''} label={`95% CI ${pct(r.liftLo, 1)} to ${pct(r.liftHi, 1)}; ${arms[1].name} ${num(r.rt, 4)} vs ${arms[0].name} ${num(r.rc, 4)}`}>
            <p>Difference {num(r.diff, 4)} (95% CI {num(r.lo, 4)} to {num(r.hi, 4)}), z = {num(r.z, 2)}, p {pv(r.p)}.</p>
          </Result>
          <Stats rows={[
            [`${arms[0].name}: users, ratio`, `${arms[0].n.toLocaleString()}, ${num(r.rc, 4)}`],
            [`${arms[1].name}: users, ratio`, `${arms[1].n.toLocaleString()}, ${num(r.rt, 4)}`],
            ['Delta-method SE per arm', `${num(r.seC, 5)}, ${num(r.seT, 5)}`],
            ['SE of the difference', num(r.seDiff, 5)],
            ['SE if the denominator were fixed', num(r.naiveSe, 5)],
            ['SE of the relative lift', pct(r.seLift, 2)],
          ]} />
          <IntervalPlot label="Ratio per arm with 95% intervals" xLabel="Ratio (numerator per denominator unit)" rows={[{ name: arms[0].name, est: r.rc, lo: r.rc - 1.96 * r.seC, hi: r.rc + 1.96 * r.seC, color: 'var(--c1)' }, { name: arms[1].name, est: r.rt, lo: r.rt - 1.96 * r.seT, hi: r.rt + 1.96 * r.seT, color: 'var(--c2)' }]} fmtX={(v) => num(v, 3)} />
          <StudySummary {...A.deltaSummary(r, arms[0], arms[1], [arms[0].name, arms[1].name])} />
        </>
      )}
    </>
  );
}

function NiMode() {
  const [kind, setKind] = useState('prop');
  const [cx, setCx] = useState('1210'); const [cn, setCn] = useState('10000'); const [tx, setTx] = useState('1195'); const [tn, setTn] = useState('10000');
  const [cm, setCm] = useState('62.0'); const [cs, setCs] = useState('18'); const [cN, setCN] = useState('400'); const [tm, setTm] = useState('61.2'); const [ts, setTs] = useState('19'); const [tN, setTN] = useState('410');
  const [margin, setMargin] = useState('1'); const [better, setBetter] = useState('higher'); const [alpha, setAlpha] = useState('0.05');
  const example = () => { setKind('prop'); setCx('1210'); setCn('10000'); setTx('1195'); setTn('10000'); setMargin('1'); setBetter('higher'); setAlpha('0.05'); };
  const m = kind === 'prop' ? n_(margin) / 100 : n_(margin);
  const c = kind === 'prop' ? { x: n_(cx), n: n_(cn) } : { m: n_(cm), sd: n_(cs), n: n_(cN) };
  const t = kind === 'prop' ? { x: n_(tx), n: n_(tn) } : { m: n_(tm), sd: n_(ts), n: n_(tN) };
  const ok = m > 0 && n_(alpha) > 0 && n_(alpha) < 0.5 && (kind === 'prop' ? c.n > 0 && t.n > 0 && c.x >= 0 && t.x >= 0 && c.x <= c.n && t.x <= t.n && (c.x > 0 || t.x > 0) : c.n > 1 && t.n > 1 && c.sd > 0 && t.sd > 0);
  const r = ok ? A.nonInferiority({ kind, c, t, margin: m, higherBetter: better === 'higher', alpha: n_(alpha) }) : null;
  const u = kind === 'prop' ? (v) => `${(v * 100).toFixed(2)} pp` : (v) => num(v, 2);
  const s = r && (r.higherBetter ? 1 : -1);
  return (
    <>
      <LoadExample onClick={example} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Metric" value={kind} onChange={setKind} options={[['prop', 'Proportions'], ['mean', 'Means']]} />
        {kind === 'prop' ? <>
          <Num label="Control successes" value={cx} onChange={setCx} /><Num label="Control users" value={cn} onChange={setCn} />
          <Num label="New version successes" value={tx} onChange={setTx} /><Num label="New version users" value={tn} onChange={setTn} />
        </> : <>
          <Num label="Control mean" value={cm} onChange={setCm} step="any" /><Num label="Control SD" value={cs} onChange={setCs} step="any" /><Num label="Control n" value={cN} onChange={setCN} />
          <Num label="New mean" value={tm} onChange={setTm} step="any" /><Num label="New SD" value={ts} onChange={setTs} step="any" /><Num label="New n" value={tN} onChange={setTN} />
        </>}
        <Num label="Margin" value={margin} onChange={setMargin} step="any" suffix={kind === 'prop' ? 'pp' : 'units'} hint="The largest loss you would accept, fixed before the test." />
        <Choice label="Better is" value={better} onChange={setBetter} options={[['higher', 'Higher'], ['lower', 'Lower']]} />
        <Num label="α (one-sided)" value={alpha} onChange={setAlpha} step="0.005" />
      </div>
      {!r ? <Problem>Enter both groups (counts within their totals, or means with SDs and n of 2 or more), a positive margin and α below 0.5.</Problem> : (
        <>
          <Result big={r.ni ? 'Non-inferior' : 'Not shown'} tone={r.ni ? 'good' : 'bad'} label={`Difference ${u(r.diff)} (new − control), ${pct(1 - 2 * r.alpha, 0)} CI ${u(r.lo)} to ${u(r.hi)}; margin ${u(r.margin)}`}>
            <p>Non-inferiority p {pv(r.pNI)}. Equivalence (TOST): p {pv(r.pEq)}, {r.eq ? 'equivalent within the margin' : 'not shown'}.</p>
          </Result>
          <IntervalPlot label="Difference with its interval against the margin" xLabel={`New − control (${kind === 'prop' ? 'percentage points' : 'units'})`} refX={0} refLabel="No difference"
            rows={[{ name: 'Margin −m', est: -r.margin * 100 ** (kind === 'prop'), lo: NaN, hi: NaN, color: 'var(--bad)', size: 0 }, { name: 'Difference', est: r.diff * 100 ** (kind === 'prop'), lo: r.lo * 100 ** (kind === 'prop'), hi: r.hi * 100 ** (kind === 'prop'), color: r.ni ? 'var(--ok)' : 'var(--c1)' }, { name: 'Margin +m', est: r.margin * 100 ** (kind === 'prop'), lo: NaN, hi: NaN, color: 'var(--bad)', size: 0 }]}
            fmtX={(v) => num(v, 2)} />
          <Stats rows={[[s > 0 ? 'Test: H0 new ≤ control − m' : 'Test: H0 new ≥ control + m', `${Number.isFinite(r.df) ? 't' : 'z'} = ${num(r.zNI, 3)}, p ${pv(r.pNI)}`], ['TOST lower test', `p ${pv(r.pLow)}`], ['TOST upper test', `p ${pv(r.pUp)}`], ['Standard error', u(r.se)], Number.isFinite(r.df) && ['Welch df', num(r.df, 1)]]} />
          <StudySummary {...A.niSummary(r, { kind })} />
        </>
      )}
    </>
  );
}

function AaMode() {
  const [text, setText] = useState(() => exampleAAPs().join(', '));
  const [alpha, setAlpha] = useState('0.05');
  const ps = A.parsePs(text).filter((p) => p >= 0 && p <= 1);
  const r = ps.length >= 5 ? A.aaCheck(ps, n_(alpha)) : null;
  return (
    <>
      <LoadExample onClick={() => setText(exampleAAPs().join(', '))} />
      <div className="calc-inputs ea-inputs">
        <Area label="p-values from A/A tests (any separator)" value={text} onChange={setText} rows={5} hint="One p-value per A/A comparison, for the same metric. Values outside 0–1 are ignored." />
        <Num label="α" value={alpha} onChange={setAlpha} step="0.01" />
      </div>
      {!r ? <Problem>Paste at least five p-values between 0 and 1.</Problem> : (
        <>
          <Result big={`${pct(r.fpr, 1)} false positives`} tone={r.ks.p < 0.05 || r.pBinom < 0.05 ? 'bad' : 'good'} label={`${r.fp} of ${r.n} below α = ${r.alpha}; KS D = ${num(r.ks.D, 3)}, p ${pv(r.ks.p)} (${r.ks.method})`} />
          <h3 className="clu-h3">Distribution of A/A p-values (flat if healthy)</h3>
          <BarChart label="Histogram of A/A p-values in ten bins" bars={r.bins.map((b, i) => ({ label: `${(i / 10).toFixed(1)}`, value: b, tone: i === 0 && b > r.n / 10 * 1.5 ? 'bad' : '' }))} refY={r.n / 10} refLabel="Expected if uniform" />
          <Stats rows={[['KS D (D+, D−)', `${num(r.ks.D, 4)} (${num(r.ks.dPlus, 4)}, ${num(r.ks.dMinus, 4)})`], ['KS p-value', pv(r.ks.p)], ['False-positive rate, 95% CI', `${pct(r.fpr, 1)} (${pct(r.ci.lo, 1)} to ${pct(r.ci.hi, 1)})`], ['Binomial test, rate > α', `p ${pv(r.pBinom)}`]]} />
          <StudySummary {...A.aaSummary(r)} />
        </>
      )}
    </>
  );
}

// ── A/B test health checks ──
function ExpAbHealth() {
  const [mode, setMode] = useState('srm');
  const M = { srm: SrmMode, mde: MdeMode, delta: DeltaMode, ni: NiMode, aa: AaMode }[mode];
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Choice label="Check" value={mode} onChange={setMode} options={[['srm', 'Sample ratio (SRM)'], ['mde', 'MDE and duration'], ['delta', 'Ratio metric (delta method)'], ['ni', 'Non-inferiority'], ['aa', 'A/A check']]} />
      </div>
      <M key={mode} />
      <About method="sample-ratio-mismatch-srm-check" links={[['a-a-test', 'A/A test'], ['cuped-variance-reduction', 'CUPED'], ['delta-method-variance-for-ratio-metrics', 'Delta-method variance'], ['non-inferiority-and-equivalence-trials-for-design-changes', 'Non-inferiority and equivalence'], ['equivalence-testing-tost', 'Equivalence testing (TOST)'], ['guardrail-metric-monitoring', 'Guardrail monitoring'], ['statistical-power-analysis', 'Statistical power analysis'], ['a-b-testing', 'A/B testing']]}>
        <p><b>Sample ratio mismatch.</b> χ² = Σ (observed − expected)² / expected over the arms, where expected = total × planned share, on k − 1 degrees of freedom. A mismatch is flagged at p &lt; 0.001, the convention in Kohavi, Tang and Xu (2020), <i>Trustworthy Online Controlled Experiments</i>, and Fabijan et al. (2019), "Diagnosing sample ratio mismatch in online controlled experiments" (KDD). Checked against scipy.stats.chisquare.</p>
        <p><b>MDE and duration.</b> Each treatment arm is compared with control (equal allocation, traffic split evenly). For a mean, SE = σ√(2/n); for a rate, SE = √((p₁(1 − p₁) + p₂(1 − p₂))/n) with p₂ = p₁ + δ. Power = Φ(δ/SE − z₁₋α/₂) + Φ(−δ/SE − z₁₋α/₂) (two-sided) and the MDE is the δ that gives the target power, solved numerically; this matches statsmodels' NormalIndPower. With more than two arms α is divided by the k − 1 comparisons (Bonferroni). CUPED (Deng et al. 2013) adjusts each user's metric by its pre-period value, cutting the variance by a factor 1 − ρ², where ρ is the correlation between the pre-period and in-test values.</p>
        <p><b>Ratio metrics.</b> When users are randomised but the metric is per session, R = ΣX/ΣY = X̄/Ȳ. By the delta method, Var(R) ≈ (1/n)(σ²ₓ/μ²ᵧ − 2μₓσₓᵧ/μ³ᵧ + μ²ₓσ²ᵧ/μ⁴ᵧ) (Deng, Knoblich and Lu 2018, "Applying the delta method in metric analytics", KDD). The difference uses √(Var_C + Var_T); the relative lift R_T/R_C − 1 uses Var_T/R²_C + R²_T Var_C/R⁴_C. Checked against a numpy simulation of 20,000 experiments.</p>
        <p><b>Non-inferiority and equivalence.</b> With margin m and "higher is better", H0: new − control ≤ −m is tested one-sided; it is rejected exactly when the (1 − 2α) two-sided interval lies above −m. Equivalence (TOST, Schuirmann 1987) also tests H0: diff ≥ +m and takes the larger p. Rates use the unpooled Wald SE (statsmodels test_proportions_2indep, method 'wald'); means use Welch's t (scipy ttest_ind_from_stats).</p>
        <p><b>A/A check.</b> The Kolmogorov-Smirnov statistic D = max|F̂(p) − p| compares the p-values with the uniform distribution; the exact p-value uses Marsaglia, Tsang and Wang (2003), as scipy.stats.kstest(method='exact'). The false-positive rate gets a Clopper-Pearson interval and an exact one-sided binomial test against α.</p>
        <p><b>When not to use it.</b> These checks assume users are randomised independently; for cluster- or switchback-randomised tests the variances are larger. Do not use the MDE planner to justify stopping a test early, and do not choose a non-inferiority margin after seeing the data.</p>
      </About>
    </>
  );
}

export default ExpAbHealth;
