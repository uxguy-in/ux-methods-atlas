import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as C from './statsbench-core.js';
import * as RS from './statsbench-resampling.js';
import { TIMES_A, TIMES_B, PAIRS, SUCCESSES } from './statsbench-examples.js';
import { Chart, Progress, useJob } from './statsbench-ui.jsx';
import { Area, Choice, Pick, Num, Result, Stats, Problem, About, num, pv } from './ui.jsx';

const EX = { one: TIMES_A.join(', '), a: TIMES_A.join(', '), b: TIMES_B.join(', '), pairs: PAIRS.map((p) => p.join(', ')).join('\n'), prop: SUCCESSES.join(' ') };
const parsePairs = (text) => {
  const x = [], y = [];
  for (const line of String(text).split(/\r?\n/)) { const v = C.parseNums(line); if (v.length >= 2) { x.push(v[0]); y.push(v[1]); } }
  return [x, y];
};

// ── Bootstrap and permutation tests ──
function SbResampling() {
  const [key, setKey] = useState('diffmedian');
  const [mode, setMode] = useState('boot');
  const [one, setOne] = useState(EX.one);
  const [a, setA] = useState(EX.a);
  const [b, setB] = useState(EX.b);
  const [pairs, setPairs] = useState(EX.pairs);
  const [names, setNames] = useState(['Current checkout', 'Redesign']);
  const [B, setBn] = useState(10000);
  const [conf, setConf] = useState(0.95);
  const [mu0, setMu0] = useState('60');
  const [seed, setSeed] = useState(1);
  const st = RS.STATS[key];
  const data = useMemo(() => {
    if (st.kind === 'one') return [C.parseNums(one)];
    if (st.kind === 'two') return [C.parseNums(a), C.parseNums(b)];
    return parsePairs(pairs);
  }, [st.kind, one, a, b, pairs]);
  const nMin = Math.min(...data.map((d) => d.length));
  const binaryOk = key !== 'prop' || data[0].every((v) => v === 0 || v === 1);
  const permOk = !(mode === 'perm' && key === 'prop');
  const valid = nMin >= (st.kind === 'paired' ? 4 : 3) && binaryOk && permOk && (mode === 'boot' || st.kind !== 'one' || Number.isFinite(C.toNum(mu0)));
  const m0 = C.toNum(mu0);
  const jobKey = valid ? `${mode}|${key}|${data.map((d) => d.join(',')).join('/')}|${B}|${seed}|${mode === 'perm' ? m0 : ''}` : null;
  const job = useJob(jobKey, jobKey ? (mode === 'boot' ? { type: 'boot', args: { key, data, B, seed } } : { type: 'perm', args: { key, data, B, seed, mu0: m0 } }) : null,
    () => (mode === 'boot' ? RS.bootstrap(key, data, B, seed) : RS.permutationTest(key, data, { B, seed, mu0: m0 })));
  const fresh = job.result && job.key === jobKey;
  const ci = useMemo(() => (fresh && mode === 'boot' ? RS.bootIntervals(key, data, job.result, conf) : null), [fresh, mode, key, data, job.result, conf]);
  const perm = fresh && mode === 'perm' ? job.result : null;
  const hist = useMemo(() => (fresh ? RS.histogram(mode === 'boot' ? job.result : job.result.nulls, 50) : null), [fresh, mode, job.result]);
  const changeStat = (k) => {
    setKey(k);
    if (k === 'prop') { setOne(EX.prop); setMu0('0.5'); if (mode === 'perm') { setMode('boot'); setBn(10000); } } else if (RS.STATS[k].kind === 'one' && one === EX.prop) { setOne(EX.one); setMu0('60'); }
  };
  const load = () => {
    if (st.kind === 'one') { setOne(key === 'prop' ? EX.prop : EX.one); setMu0(key === 'prop' ? '0.5' : '60'); } else if (st.kind === 'two') { setA(EX.a); setB(EX.b); setNames(['Current checkout', 'Redesign']); } else setPairs(EX.pairs);
    setSeed(1); setConf(0.95); setBn(mode === 'boot' ? 10000 : 9999);
  };
  const c = Math.round(conf * 100), d = (v) => num(v, key === 'corr' || key === 'prop' ? 3 : 2);
  const labelA = names[0] || 'A', labelB = names[1] || 'B';
  return (
    <>
      <div className="calc-inputs sb-inputs">
        <Pick label="Statistic" value={key} onChange={changeStat} options={Object.entries(RS.STATS).map(([k, s]) => [k, s.name])} />
        <Choice label="Analysis" value={mode} onChange={(m) => { setMode(m); setBn(m === 'boot' ? 10000 : 9999); }} options={[['boot', 'Bootstrap interval'], ['perm', 'Permutation test']]} />
      </div>
      <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={load}>{st.kind === 'paired' ? 'Load example (ease rating and SUS, 22 people)' : key === 'prop' ? 'Load example (25 task attempts, 1 = success)' : 'Load example (checkout task times, seconds)'}</button></div>
      <div className="calc-inputs sb-inputs">
        {st.kind === 'one' && <Area label={key === 'prop' ? 'Outcomes (1 = success, 0 = failure)' : 'Values'} value={one} onChange={setOne} rows={4} hint={`${data[0].length} values read. Any separators work.`} />}
        {st.kind === 'two' && (
          <>
            <label className="calc-field"><span>Name of group A</span><input className="tl-code" value={names[0]} onChange={(e) => setNames([e.target.value, names[1]])} /></label>
            <label className="calc-field"><span>Name of group B</span><input className="tl-code" value={names[1]} onChange={(e) => setNames([names[0], e.target.value])} /></label>
            <Area label={`Values for ${labelA}`} value={a} onChange={setA} rows={3} hint={`${data[0].length} values.`} />
            <Area label={`Values for ${labelB}`} value={b} onChange={setB} rows={3} hint={`${data[1].length} values.`} />
          </>
        )}
        {st.kind === 'paired' && <Area label="Pairs: x, y on each line (same person)" value={pairs} onChange={setPairs} rows={6} hint={`${data[0].length} pairs read.`} />}
        <Choice label={mode === 'boot' ? 'Resamples (B)' : 'Random rearrangements'} value={B} onChange={setBn} options={mode === 'boot' ? [[2000, '2,000'], [10000, '10,000'], [50000, '50,000']] : [[9999, '9,999'], [49999, '49,999']]} />
        {mode === 'boot' ? <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
          : st.kind === 'one' && <Num label={`Null value of the ${key === 'median' ? 'median' : 'mean'}`} value={mu0} onChange={setMu0} step={0.1} hint="The sign-flip test asks whether the values are centred on this." />}
      </div>
      {!binaryOk ? <Problem>For a proportion, enter only 0s and 1s.</Problem>
        : !permOk ? <Problem>For one proportion against a target, use the exact binomial test in <Link to="/calculators/rate-benchmark">Completion rate vs benchmark</Link>; the bootstrap interval is available here.</Problem>
          : !valid ? <Problem>Enter at least {st.kind === 'paired' ? 4 : 3} values{st.kind === 'two' ? ' in each group' : ''}.</Problem>
            : (
              <>
                {job.running && <Progress value={job.progress} label={mode === 'boot' ? `Resampling ${B.toLocaleString('en')} times` : 'Rearranging'} />}
                {job.error && <Problem>The calculation failed: {job.error}</Problem>}
                {ci && (
                  <>
                    <Result big={`${d(ci.bca[0])} to ${d(ci.bca[1])}`} tone={st.kind !== 'one' && (ci.bca[0] > 0 || ci.bca[1] < 0) ? 'good' : ''} label={`${c}% BCa bootstrap interval for the ${st.name.toLowerCase().replace('(a − b)', `(${labelA} − ${labelB})`)}; estimate ${d(ci.est)}; ${ci.B.toLocaleString('en')} resamples`}>
                      <p>Percentile interval {d(ci.pct[0])} to {d(ci.pct[1])}. {ci.degenerate ? 'Every resample gave the same value, so no interval can be formed: the data have too few distinct values.' : ''}</p>
                    </Result>
                    <Chart label="Bootstrap distribution with the interval" xLabel={`${st.name} in each resample`} yLabel="Resamples" height={250} yMin={0}
                      vlines={[{ x: ci.bca[0], label: 'BCa', color: 'var(--c2)' }, { x: ci.bca[1], label: 'BCa', color: 'var(--c2)' }, { x: ci.pct[0], label: 'percentile' }, { x: ci.pct[1], label: 'percentile' }, { x: ci.est, label: 'estimate', color: 'var(--ink)' }]}
                      series={[{ type: 'bars', bars: hist.counts.map((n, i) => ({ x0: hist.edges[i], x1: hist.edges[i + 1], y: n })), color: 'var(--c1)' }]} legend={false} />
                    <Stats rows={[
                      ['Estimate', d(ci.est)],
                      [`Percentile ${c}% CI`, `${d(ci.pct[0])} to ${d(ci.pct[1])}`],
                      [`BCa ${c}% CI`, `${d(ci.bca[0])} to ${d(ci.bca[1])}`],
                      ['Bootstrap SE', d(ci.se)],
                      ['Bias (mean of resamples − estimate)', d(ci.bias)],
                      ['Bias correction z₀ / acceleration a', `${num(ci.z0, 3)} / ${num(ci.a, 4)}`],
                    ]} />
                    <StudySummary {...RS.resamplingSummary({ key, data, ci, conf, labels: [labelA, labelB] })} />
                  </>
                )}
                {perm && (
                  <>
                    <Result big={`p ${pv(perm.p)}`} tone={perm.p < 0.05 ? 'good' : ''} label={`Two-sided ${perm.exact ? 'exact' : 'Monte Carlo'} permutation test of the ${st.name.toLowerCase().replace('(a − b)', `(${labelA} − ${labelB})`)}; observed ${d(perm.observed + (st.kind === 'one' ? m0 : 0))}${st.kind === 'one' ? ` against ${num(m0, 2)}` : ''}; ${perm.n.toLocaleString('en')} ${perm.exact ? 'arrangements (all of them)' : 'rearrangements'}`} />
                    <Chart label="Distribution of the statistic when the null hypothesis is true" xLabel={st.kind === 'one' ? `${key === 'median' ? 'Median' : 'Mean'} minus the null value, after random sign flips` : `${st.name} after shuffling ${st.kind === 'two' ? 'group labels' : 'pairings'}`} yLabel="Arrangements" height={250} yMin={0}
                      vlines={[{ x: perm.observed, label: 'observed', color: 'var(--c2)' }, ...(perm.observed !== 0 ? [{ x: -perm.observed, label: 'mirror' }] : [])]}
                      series={[{ type: 'bars', bars: hist.counts.map((n, i) => ({ x0: hist.edges[i], x1: hist.edges[i + 1], y: n })), color: 'var(--c1)' }]} legend={false} />
                    <Stats rows={[['Two-sided p', pv(perm.p)], ['One-sided p (lower)', num(perm.pLess, 4)], ['One-sided p (higher)', num(perm.pGreater, 4)], ['Arrangements possible', perm.total > 1e15 ? 'more than 10¹⁵' : perm.total.toLocaleString('en')]]} />
                    <StudySummary {...RS.resamplingSummary({ key, data, perm, mu0: m0, labels: [labelA, labelB] })} />
                  </>
                )}
                <div className="tl-row sb-row"><button type="button" className="btn ghost small" onClick={() => setSeed(seed + 1)} disabled={job.running}>Draw new resamples (seed {seed})</button></div>
              </>
            )}
      <About method="bootstrap-methods-for-confidence-intervals" links={[['permutation-test-resampling-significance-test', 'Permutation test']]}>
        <p><b>Bootstrap.</b> Draw B resamples of the same size with replacement (each group separately for two groups; whole pairs for a correlation), compute the statistic in each, and read the interval from their distribution. Percentile: the α/2 and 1 − α/2 quantiles. BCa (Efron 1987): z₀ = Φ⁻¹(share of resamples below the estimate, ties counted half), acceleration a = ΣU³/(6(ΣU²)<sup>3/2</sup>) from jackknife values Uᵢ = (n − 1)(θ̄₍.₎ − θ₍ᵢ₎) (summed over groups), and quantiles Φ(z₀ + (z₀ + z)/(1 − a(z₀ + z))) for z = ±z<sub>α/2</sub>. Quantiles use linear interpolation. This follows scipy.stats.bootstrap exactly.</p>
        <p><b>Permutation test.</b> Two groups: shuffle the group labels; a correlation: shuffle y against x; one sample: flip the sign of each value's distance from the null value. If the number of possible arrangements is at most the number you ask for, every arrangement is used (an exact test) and p = share at least as extreme; otherwise p = (k + 1)/(B + 1) with the observed arrangement counted. Two-sided p = 2 × the smaller one-sided p, capped at 1, as scipy.stats.permutation_test.</p>
        <p>Checked by replaying our resamples in numpy and applying scipy's own BCa code to them, against scipy.stats.bootstrap with its own resamples, and against exact scipy permutation tests: <code>npm run check:statsbench</code>. Resampling runs in a background worker.</p>
        <p><b>When not to use it.</b> The bootstrap cannot rescue a tiny sample: with fewer than about 10 to 15 values per group its intervals are too narrow. It also fails for extremes (minimum, maximum) and for data that are not independent (several tasks from the same person; use one value per person). A permutation test of two groups assumes the groups have the same shape when the null is true, so a difference in spread alone can make it significant. For equivalence, use the TOST in the <Link to="/calculators/ab-health">A/B test health checks</Link>.</p>
      </About>
    </>
  );
}

export default SbResampling;
