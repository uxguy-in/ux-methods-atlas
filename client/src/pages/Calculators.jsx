import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import * as S from '../calc/stats.js';

// ── Formatting ──
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pv = (p) => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3));
const secs = (x) => (Number.isFinite(x) ? (x >= 120 ? `${Math.floor(x / 60)} min ${Math.round(x % 60)} s` : `${x.toFixed(1)} s`) : '—');

// ── Shared inputs ──
function Num({ label, value, onChange, min, max, step = 1, hint, suffix }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <span className="calc-input">
        <input type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.value)} />
        {suffix && <em>{suffix}</em>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Choice({ label, value, onChange, options }) {
  return (
    <div className="calc-field">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
function Conf({ value, onChange }) {
  return <Choice label="Confidence level" value={value} onChange={onChange} options={[[0.8, '80%'], [0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />;
}
function Area({ label, value, onChange, rows = 5, hint, placeholder }) {
  return (
    <label className="calc-field wide">
      <span>{label}</span>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
const n_ = (v) => (v === '' || v === null ? NaN : Number(v));
const int = (v) => { const x = n_(v); return Number.isInteger(x) ? x : NaN; };

function Result({ big, label, children, tone }) {
  return (
    <div className={`calc-result${tone ? ` ${tone}` : ''}`}>
      {big !== undefined && <div className="big">{big}</div>}
      {label && <div className="lbl">{label}</div>}
      {children}
    </div>
  );
}
function Stats({ rows }) {
  return <dl className="calc-stats">{rows.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
function Problem({ children }) { return <p className="calc-warn" role="alert">{children}</p>; }

// Interval drawn on a fixed scale, with an optional benchmark line.
function IntervalBar({ lo, hi, point, min = 0, max = 1, bench, fmt = (v) => pct(v, 0), benchLabel = 'Benchmark' }) {
  if (![lo, hi, point].every(Number.isFinite)) return null;
  const x = (v) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="ibar" aria-hidden="true">
      <div className="track" />
      <div className="range" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <div className="pt" style={{ left: x(point) }} />
      {Number.isFinite(bench) && <div className="bench" style={{ left: x(bench) }}><span>{benchLabel} {fmt(bench)}</span></div>}
      <div className="ends"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
    </div>
  );
}

function About({ method, children }) {
  return (
    <details className="calc-about">
      <summary>How this is calculated</summary>
      <div>{children}</div>
      {method && <p><Link to={`/methods/${method}`}>Read the method in the atlas</Link></p>}
    </details>
  );
}

// ── 1. Completion rate interval ──
function CompletionRate() {
  const [x, setX] = useState('7'); const [n, setN] = useState('8'); const [conf, setConf] = useState(0.95);
  const X = int(x), N = int(n);
  const bad = !(N > 0 && X >= 0 && X <= N);
  const r = useMemo(() => (bad ? null : {
    aw: S.adjustedWald(X, N, conf), cp: S.clopperPearson(X, N, conf), wi: S.wilson(X, N, conf), wa: S.wald(X, N, conf), best: S.bestPoint(X, N, conf),
  }), [X, N, conf, bad]);
  return (
    <>
      <div className="calc-inputs">
        <Num label="Successes" value={x} onChange={setX} min={0} />
        <Num label="Attempts" value={n} onChange={setN} min={1} />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Successes must be a whole number between 0 and the number of attempts.</Problem> : (
        <>
          <Result big={`${pct(r.aw.lo, 0)} – ${pct(r.aw.hi, 0)}`} label={`${conf * 100}% adjusted-Wald interval for the completion rate`}>
            <IntervalBar lo={r.aw.lo} hi={r.aw.hi} point={r.best.value} />
            <p>{X} of {N} succeeded ({pct(X / N, 0)}). You can be {conf * 100}% confident that between {pct(r.aw.lo, 0)} and {pct(r.aw.hi, 0)} of all users would complete this task. The best single estimate is {pct(r.best.value, 0)} ({r.best.name}).</p>
          </Result>
          <Stats rows={[
            ['Observed rate', pct(X / N)],
            ['Best estimate', `${pct(r.best.value)} (${r.best.name})`],
            ['Adjusted-Wald (recommended)', `${pct(r.aw.lo)} – ${pct(r.aw.hi)}`],
            ['Exact (Clopper-Pearson)', `${pct(r.cp.lo)} – ${pct(r.cp.hi)}`],
            ['Wilson score', `${pct(r.wi.lo)} – ${pct(r.wi.hi)}`],
            ['Wald (not for small samples)', `${pct(r.wa.lo)} – ${pct(r.wa.hi)}`],
          ]} />
        </>
      )}
      <About method="adjusted-wald-confidence-interval-for-completion-rates">
        <p>The adjusted-Wald interval adds z²/2 successes and z² attempts before applying the usual formula: p̂ = (x + z²/2)/(n + z²), then p̂ ± z√(p̂(1−p̂)/(n + z²)). Sauro and Lewis found it has the best coverage for the small samples used in usability tests. The exact interval is shown for comparison; it is conservative (too wide). The plain Wald interval is shown only to illustrate how badly it behaves at small n.</p>
        <p>The best point estimate follows Lewis and Sauro (2006): Wilson below 50%, the observed rate between 50% and 90%, and Laplace (x+1)/(n+2) above 90%.</p>
      </About>
    </>
  );
}

// ── 2. Task time interval ──
const SAMPLE_TIMES = '94 95 96 113 121 132 190 193 255 298';
function TaskTime() {
  const [text, setText] = useState(SAMPLE_TIMES); const [conf, setConf] = useState(0.95); const [target, setTarget] = useState('');
  const times = S.parseNumbers(text);
  const bad = times.length < 2 || times.some((t) => t <= 0);
  const r = bad ? null : S.timeCI(times, conf);
  const T = n_(target);
  const useMed = r && r.recommend === 'median' && Number.isFinite(r.medLo);
  const lo = r && (useMed ? r.medLo : r.geoLo), hi = r && (useMed ? r.medHi : r.geoHi), pt = r && (useMed ? r.median : r.geo);
  return (
    <>
      <div className="calc-inputs">
        <Area label="Task times in seconds" value={text} onChange={setText} rows={4} hint="Paste from a spreadsheet: one per line, or separated by spaces or commas. Leave out failed attempts." />
        <Conf value={conf} onChange={setConf} />
        <Num label="Target time (optional)" value={target} onChange={setTarget} min={0} suffix="s" />
      </div>
      {bad ? <Problem>Enter at least two task times, all above zero.</Problem> : (
        <>
          <Result big={`${secs(lo)} – ${secs(hi)}`} label={`${conf * 100}% interval for the ${useMed ? 'median' : 'typical (geometric mean)'} task time`}
            tone={Number.isFinite(T) ? (hi < T ? 'good' : lo > T ? 'bad' : '') : ''}>
            <IntervalBar lo={lo} hi={hi} point={pt} min={0} max={Math.max(...times, T || 0) * 1.05} bench={T} fmt={(v) => `${Math.round(v)} s`} benchLabel="Target" />
            <p>
              The typical user takes about {secs(pt)}. {Number.isFinite(T) && (hi < T ? `The whole interval is under the ${secs(T)} target, so the target is met.` : lo > T ? `The whole interval is above the ${secs(T)} target, so the target is missed.` : `The target of ${secs(T)} falls inside the interval, so you cannot tell yet whether it is met.`)}
            </p>
          </Result>
          <Stats rows={[
            ['Participants', r.n],
            ['Arithmetic mean (skewed by slow users)', secs(r.mean)],
            ['Median', secs(r.median)],
            ['Geometric mean', `${secs(r.geo)} (${secs(r.geoLo)} – ${secs(r.geoHi)})`],
            Number.isFinite(r.medLo) && ['Median interval', `${secs(r.medLo)} – ${secs(r.medHi)}`],
            ['Recommended summary', r.recommend === 'geometric' ? 'Geometric mean (fewer than 25 times)' : 'Median (25 or more times)'],
          ]} />
        </>
      )}
      <About method="confidence-intervals-for-task-time-log-transformed-and-median">
        <p>Task times are skewed, so the arithmetic mean overstates how long most people take. For fewer than 25 times, the calculator takes natural logs, computes a t interval on the log scale and converts back, giving the geometric mean and an asymmetric interval. For 25 or more, it reports the median with an interval from binomial order statistics (ranks n/2 ± z√(n/4)). This follows Sauro and Lewis (2010).</p>
      </About>
    </>
  );
}

// ── 3. Rating scale interval and benchmark ──
const PRESETS = { sus: ['SUS', 0, 100, 68, 'Average SUS across about 500 studies'], seq: ['SEQ (7-point)', 1, 7, 5.5, 'Historical SEQ average'], umux: ['UMUX-Lite', 0, 100, 68, 'Set to match SUS'], custom: ['Other scale', 1, 5, 4, ''] };
function Rating() {
  const [preset, setPreset] = useState('sus'); const [mode, setMode] = useState('summary');
  const [raw, setRaw] = useState('72.5 85 65 90 57.5 77.5 80 70 92.5 62.5');
  const [m, setM] = useState('75'); const [s, setS] = useState('12'); const [n, setN] = useState('20');
  const [bench, setBench] = useState('68'); const [conf, setConf] = useState(0.95);
  const [label, lo0, hi0] = PRESETS[preset];
  const pick = (p) => { setPreset(p); setBench(String(PRESETS[p][3])); };
  let M = n_(m), SD = n_(s), N = int(n);
  if (mode === 'raw') { const xs = S.parseNumbers(raw); N = xs.length; M = N ? S.mean(xs) : NaN; SD = N > 1 ? S.sd(xs) : NaN; }
  const B = n_(bench);
  const bad = !(N > 1 && Number.isFinite(M) && SD >= 0);
  const ci = bad ? null : S.meanCI(M, SD, N, conf);
  const t = !bad && Number.isFinite(B) && SD > 0 ? S.oneSampleT(M, SD, N, B) : null;
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Scale" value={preset} onChange={pick} options={Object.entries(PRESETS).map(([k, v]) => [k, v[0]])} />
        <Choice label="Data" value={mode} onChange={setMode} options={[['summary', 'Mean and SD'], ['raw', 'Raw scores']]} />
        {mode === 'raw' ? <Area label="Scores" value={raw} onChange={setRaw} rows={3} /> : (
          <>
            <Num label="Mean" value={m} onChange={setM} step="any" />
            <Num label="Standard deviation" value={s} onChange={setS} step="any" min={0} />
            <Num label="Sample size" value={n} onChange={setN} min={2} />
          </>
        )}
        <Num label="Benchmark" value={bench} onChange={setBench} step="any" hint={PRESETS[preset][4]} />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Enter a mean, a standard deviation and at least two participants.</Problem> : (
        <>
          <Result big={`${num(ci.lo)} – ${num(ci.hi)}`} label={`${conf * 100}% confidence interval for the mean ${label} score`}
            tone={t ? (ci.lo > B ? 'good' : ci.hi < B ? 'bad' : '') : ''}>
            <IntervalBar lo={ci.lo} hi={ci.hi} point={M} min={lo0} max={hi0} bench={B} fmt={(v) => num(v, preset === 'seq' || preset === 'custom' ? 1 : 0)} />
            {t && <p>The mean of {num(M)} is {M > B ? 'above' : 'below'} the benchmark of {num(B)}. {t.pOne < 1 - conf && M > B ? `It is statistically higher (one-sided p = ${pv(t.pOne)}), so you can claim the benchmark is beaten.` : M > B ? `It is not yet statistically higher (one-sided p = ${pv(t.pOne)}); a larger sample may settle it.` : `The two-sided p-value for the difference is ${pv(t.pTwo)}.`}</p>}
          </Result>
          <Stats rows={[
            ['Mean', num(M, 2)], ['Standard deviation', num(SD, 2)], ['Sample size', N],
            ['Margin of error', `± ${num(ci.me, 2)}`],
            t && ['t against benchmark', `t(${t.df}) = ${num(t.t, 2)}`],
            t && ['p (higher than benchmark)', pv(t.pOne)],
            t && ['p (two-sided)', pv(t.pTwo)],
            preset === 'sus' && ['Grade (Sauro-Lewis)', `${S.susGrade(M)[1]}, about the ${S.susPercentile(M)}th percentile`],
          ]} />
        </>
      )}
      <About method="testing-against-a-benchmark-one-sample-tests">
        <p>The interval is mean ± t × SD/√n with n − 1 degrees of freedom. The benchmark test is a one-sample t-test; the one-sided p-value answers "is the true mean higher than the benchmark?". Sauro and Lewis show t-based methods work well for rating scales, even with small samples.</p>
      </About>
    </>
  );
}

// ── 4. SUS scorer ──
const SUS_SAMPLE = '4 2 5 1 4 2 5 2 4 1\n3 3 4 2 3 2 4 3 3 2\n5 1 5 1 5 1 5 1 4 2\n4 2 4 3 4 2 3 2 4 2\n2 4 3 3 2 4 3 4 2 3';
function SUS() {
  const [text, setText] = useState(SUS_SAMPLE); const [conf, setConf] = useState(0.95);
  const rows = S.parseRows(text);
  const bad = rows.filter((r) => r.length !== 10 || r.some((v) => v < 1 || v > 5));
  const ok = rows.filter((r) => r.length === 10 && r.every((v) => v >= 1 && v <= 5));
  const scores = ok.map(S.susScore);
  const M = scores.length ? S.mean(scores) : NaN, SD = scores.length > 1 ? S.sd(scores) : NaN;
  const ci = scores.length > 1 ? S.meanCI(M, SD, scores.length, conf) : null;
  const g = Number.isFinite(M) ? S.susGrade(M) : null;
  return (
    <>
      <div className="calc-inputs">
        <Area label="Responses: one participant per line, ten answers from 1 to 5" value={text} onChange={setText} rows={7} hint="Items in questionnaire order. Odd items are positive, even items negative; the calculator handles the reversal." />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad.length > 0 && <Problem>{bad.length} line{bad.length > 1 ? 's' : ''} skipped: each line needs exactly ten answers between 1 and 5.</Problem>}
      {scores.length === 0 ? <Problem>Add at least one complete set of ten answers.</Problem> : (
        <>
          <Result big={num(M)} label={`Mean SUS score from ${scores.length} participant${scores.length > 1 ? 's' : ''}`} tone={M >= 68 ? 'good' : 'bad'}>
            {ci && <IntervalBar lo={ci.lo} hi={ci.hi} point={M} min={0} max={100} bench={68} fmt={(v) => num(v, 0)} benchLabel="Average" />}
            <p>Grade {g[1]} on the Sauro-Lewis curved scale, roughly the {S.susPercentile(M)}th percentile of products tested. In words: {S.susAdjective(M).toLowerCase()}. {M >= 68 ? 'That is above the average SUS of 68.' : 'That is below the average SUS of 68.'}</p>
          </Result>
          <Stats rows={[
            ci && [`${conf * 100}% interval`, `${num(ci.lo)} – ${num(ci.hi)}`],
            ['Standard deviation', num(SD, 1)],
            ['Grade', `${g[1]} (percentile range ${g[2]})`],
            ['Individual scores', scores.map((s) => num(s, 1)).join(', ')],
          ]} />
        </>
      )}
      <About method="system-usability-scale-sus">
        <p>Each odd item contributes its answer minus 1; each even item contributes 5 minus its answer. The sum is multiplied by 2.5 to give 0 to 100. Grades use the Sauro-Lewis curved grading scale from Quantifying the User Experience (2nd ed.); the percentile assumes a normal distribution with mean 68 and SD 12.5 from Sauro's database. Adjectives follow Bangor, Kortum and Miller (2009).</p>
      </About>
    </>
  );
}

// ── 5. UMUX-Lite ──
function UMUXLite() {
  const [text, setText] = useState('6 6\n7 6\n5 5\n6 7\n4 5\n7 7\n6 5');
  const rows = S.parseRows(text).filter((r) => r.length === 2 && r.every((v) => v >= 1 && v <= 7));
  const scores = rows.map(([a, b]) => S.umuxLite(a, b));
  const M = scores.length ? S.mean(scores) : NaN;
  const ci = scores.length > 1 ? S.meanCI(M, S.sd(scores), scores.length, 0.95) : null;
  const sus = S.umuxLiteToSus(M);
  return (
    <>
      <div className="calc-inputs">
        <Area label="Responses: one participant per line, two answers from 1 to 7" value={text} onChange={setText} rows={6}
          hint="Item 1: This system's capabilities meet my requirements. Item 2: This system is easy to use." />
      </div>
      {scores.length === 0 ? <Problem>Add at least one pair of answers between 1 and 7.</Problem> : (
        <>
          <Result big={num(M)} label={`Mean UMUX-Lite from ${scores.length} participants`}>
            {ci && <IntervalBar lo={ci.lo} hi={ci.hi} point={M} min={0} max={100} bench={68} fmt={(v) => num(v, 0)} benchLabel="SUS average" />}
            <p>On the SUS scale this is about {num(sus)} (grade {S.susGrade(sus)[1]}), using the regression-adjusted conversion.</p>
          </Result>
          <Stats rows={[ci && ['95% interval', `${num(ci.lo)} – ${num(ci.hi)}`], ['SUS-equivalent', num(sus)], ['Grade', S.susGrade(sus)[1]]]} />
        </>
      )}
      <About method="umux-lite">
        <p>UMUX-Lite = ((item 1 − 1) + (item 2 − 1)) / 12 × 100. The SUS-equivalent uses Lewis, Utesch and Maher's (2013) regression: 0.65 × UMUX-Lite + 22.9, which corrects a tendency for raw UMUX-Lite to run higher than SUS.</p>
      </About>
    </>
  );
}

// ── 6. NPS ──
function NPS() {
  const [mode, setMode] = useState('counts');
  const [p, setP] = useState('50'); const [pa, setPa] = useState('30'); const [d, setD] = useState('20');
  const [raw, setRaw] = useState('10 9 9 8 7 10 6 9 3 8 10 9 7 5 10');
  const [conf, setConf] = useState(0.9);
  let P = int(p), PA = int(pa), D = int(d);
  if (mode === 'raw') { const xs = S.parseNumbers(raw).filter((x) => x >= 0 && x <= 10); P = xs.filter((x) => x >= 9).length; PA = xs.filter((x) => x === 7 || x === 8).length; D = xs.filter((x) => x <= 6).length; }
  const bad = !(P >= 0 && PA >= 0 && D >= 0 && P + PA + D > 0);
  const r = bad ? null : S.nps(P, PA, D, conf);
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Data" value={mode} onChange={setMode} options={[['counts', 'Counts'], ['raw', 'Raw 0–10 ratings']]} />
        {mode === 'raw' ? <Area label="Likelihood-to-recommend ratings (0 to 10)" value={raw} onChange={setRaw} rows={3} /> : (
          <>
            <Num label="Promoters (9–10)" value={p} onChange={setP} min={0} />
            <Num label="Passives (7–8)" value={pa} onChange={setPa} min={0} />
            <Num label="Detractors (0–6)" value={d} onChange={setD} min={0} />
          </>
        )}
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Enter at least one response.</Problem> : (
        <>
          <Result big={num(r.score * 100, 0)} label={`Net Promoter Score from ${r.n} responses`}>
            <IntervalBar lo={r.lo * 100} hi={r.hi * 100} point={r.score * 100} min={-100} max={100} fmt={(v) => num(v, 0)} />
            <p>With {conf * 100}% confidence the true NPS lies between {num(r.lo * 100, 0)} and {num(r.hi * 100, 0)}. {r.hi - r.lo > 0.3 ? 'That is a wide range; treat small changes between waves with caution.' : ''}</p>
          </Result>
          <div className="nps-split" aria-hidden="true">
            <span className="d" style={{ flex: r.pctDet || 0.0001 }}>{pct(r.pctDet, 0)}</span>
            <span className="pa" style={{ flex: r.pctPass || 0.0001 }}>{pct(r.pctPass, 0)}</span>
            <span className="p" style={{ flex: r.pctProm || 0.0001 }}>{pct(r.pctProm, 0)}</span>
          </div>
          <Stats rows={[['Promoters', `${P} (${pct(r.pctProm)})`], ['Passives', `${PA} (${pct(r.pctPass)})`], ['Detractors', `${D} (${pct(r.pctDet)})`], [`${conf * 100}% interval`, `${num(r.lo * 100)} to ${num(r.hi * 100)}`]]} />
        </>
      )}
      <About method="net-promoter-score">
        <p>NPS = % promoters − % detractors. The interval uses the adjusted-Wald method recommended by Rocks (2016) and MeasuringU: add 3/4 to the promoter and detractor counts and 3 to the total, then use the variance of a difference of two proportions from the same sample, (p + d − (p − d)²)/n.</p>
      </About>
    </>
  );
}

// ── 7. Compare two completion rates ──
function CompareRates() {
  const [design, setDesign] = useState('between'); const [conf, setConf] = useState(0.9);
  const [x1, setX1] = useState('11'); const [n1, setN1] = useState('20'); const [x2, setX2] = useState('18'); const [n2, setN2] = useState('21');
  const [a, setA] = useState('7'); const [b, setB] = useState('1'); const [c, setC] = useState('6'); const [d, setD] = useState('1');
  let body;
  if (design === 'between') {
    const X1 = int(x1), N1 = int(n1), X2 = int(x2), N2 = int(n2);
    const bad = !(N1 > 0 && N2 > 0 && X1 >= 0 && X2 >= 0 && X1 <= N1 && X2 <= N2);
    const r = bad ? null : S.twoProportions(X1, N1, X2, N2, conf);
    body = (
      <>
        <div className="calc-inputs">
          <Num label="Design A successes" value={x1} onChange={setX1} min={0} /><Num label="Design A attempts" value={n1} onChange={setN1} min={1} />
          <Num label="Design B successes" value={x2} onChange={setX2} min={0} /><Num label="Design B attempts" value={n2} onChange={setN2} min={1} />
          <Conf value={conf} onChange={setConf} />
        </div>
        {bad ? <Problem>Each group needs attempts above zero and successes between 0 and the attempts.</Problem> : (
          <>
            <Result big={`p = ${pv(r.p)}`} label="N-1 two-proportion test" tone={r.p < 1 - conf ? 'good' : ''}>
              <IntervalBar lo={-r.hi} hi={-r.lo} point={-r.diff} min={-1} max={1} bench={0} fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`} benchLabel="No difference" />
              <p>Design B {r.diff < 0 ? 'beats' : r.diff > 0 ? 'trails' : 'matches'} design A by {num(Math.abs(r.diff) * 100, 0)} points ({pct(r.p2, 0)} vs {pct(r.p1, 0)}). {r.p < 1 - conf ? `The difference is statistically significant at the ${conf * 100}% level.` : `The difference is not statistically significant at the ${conf * 100}% level.`} The difference is plausibly between {num(-r.hi * 100, 0)} and {num(-r.lo * 100, 0)} points.</p>
            </Result>
            {r.minExpected < 1 && <Problem>An expected cell count is below 1. Use Fisher's exact test instead.</Problem>}
            <Stats rows={[['Design A', pct(r.p1)], ['Design B', pct(r.p2)], ['z (N−1 adjusted)', num(r.z, 3)], ['p (two-sided)', pv(r.p)], [`${conf * 100}% interval, B − A`, `${num(-r.hi * 100)} to ${num(-r.lo * 100)} points`]]} />
          </>
        )}
      </>
    );
  } else {
    const A = int(a), B = int(b), C = int(c), D = int(d);
    const bad = ![A, B, C, D].every((v) => v >= 0) || A + B + C + D === 0;
    const r = bad ? null : S.mcnemar(A, B, C, D, conf);
    body = (
      <>
        <div className="calc-inputs">
          <Num label="Succeeded on both" value={a} onChange={setA} min={0} />
          <Num label="Succeeded on A only" value={b} onChange={setB} min={0} />
          <Num label="Succeeded on B only" value={c} onChange={setC} min={0} />
          <Num label="Failed on both" value={d} onChange={setD} min={0} />
          <Conf value={conf} onChange={setConf} />
        </div>
        {bad ? <Problem>Enter whole-number counts, with at least one participant.</Problem> : (
          <>
            <Result big={`p = ${pv(r.midP)}`} label="McNemar exact test (mid-p)" tone={r.midP < 1 - conf ? 'good' : ''}>
              <IntervalBar lo={-r.hi} hi={-r.lo} point={-r.adjDiff} min={-1} max={1} bench={0} fmt={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} pts`} benchLabel="No difference" />
              <p>The same {A + B + C + D} people tried both designs: {pct(r.pA, 0)} succeeded on A and {pct(r.pB, 0)} on B. {r.midP < 1 - conf ? 'The difference is statistically significant.' : 'The difference is not statistically significant yet.'} Only the {B + C} people who succeeded on one design but not the other carry information about the difference.</p>
            </Result>
            <Stats rows={[['Design A', pct(r.pA)], ['Design B', pct(r.pB)], ['Exact p', pv(r.exact)], ['Mid-p (recommended)', pv(r.midP)], [`${conf * 100}% interval, B − A`, `${num(-r.hi * 100)} to ${num(-r.lo * 100)} points`]]} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="calc-inputs"><Choice label="Who tried each design?" value={design} onChange={setDesign} options={[['between', 'Different people'], ['within', 'The same people']]} /></div>
      {body}
      <About method={design === 'between' ? 'n-1-two-proportion-test' : 'mcnemar-exact-test-for-paired-proportions'}>
        {design === 'between'
          ? <p>For different people, the N−1 two-proportion test multiplies the usual z statistic by √((N−1)/N), which Campbell (2007) showed keeps error rates accurate at small sample sizes as long as every expected count is at least 1. The interval adds z²/4 successes and z²/2 attempts to each group (adjusted-Wald for a difference).</p>
          : <p>For the same people, McNemar's test uses only the discordant pairs. The exact two-sided p-value is a binomial test of the smaller discordant count with p = 0.5; the mid-p version subtracts half the probability of the observed count and is less conservative, as Sauro and Lewis recommend. The interval adds 0.5 to every cell (Agresti-Min).</p>}
      </About>
    </>
  );
}

// ── 8. Compare two means ──
function CompareMeans() {
  const [design, setDesign] = useState('between'); const [conf, setConf] = useState(0.95); const [logT, setLogT] = useState(false);
  const [m1, setM1] = useState('70'); const [s1, setS1] = useState('18'); const [n1, setN1] = useState('22');
  const [m2, setM2] = useState('80'); const [s2, setS2] = useState('15'); const [n2, setN2] = useState('20');
  const [pairs, setPairs] = useState('4 5\n3 5\n5 6\n4 4\n2 4\n5 7\n3 4\n4 6\n6 6\n3 5\n4 5\n5 5');
  let body;
  if (design === 'between') {
    const v = [m1, s1, n1, m2, s2, n2].map(n_);
    const bad = !(v[2] > 1 && v[5] > 1 && v[1] > 0 && v[4] > 0 && Number.isFinite(v[0]) && Number.isFinite(v[3]));
    const r = bad ? null : S.welch(v[3], v[4], v[5], v[0], v[1], v[2], conf);
    body = (
      <>
        <div className="calc-inputs">
          <Num label="Design A mean" value={m1} onChange={setM1} step="any" /><Num label="Design A SD" value={s1} onChange={setS1} step="any" min={0} /><Num label="Design A n" value={n1} onChange={setN1} min={2} />
          <Num label="Design B mean" value={m2} onChange={setM2} step="any" /><Num label="Design B SD" value={s2} onChange={setS2} step="any" min={0} /><Num label="Design B n" value={n2} onChange={setN2} min={2} />
          <Conf value={conf} onChange={setConf} />
        </div>
        {bad ? <Problem>Each group needs a mean, a standard deviation above zero, and at least two people.</Problem> : (
          <>
            <Result big={`p = ${pv(r.p)}`} label="Welch two-sample t-test" tone={r.p < 1 - conf ? 'good' : ''}>
              <IntervalBar lo={r.lo} hi={r.hi} point={r.diff} min={Math.min(r.lo, -Math.abs(r.hi)) * 1.2} max={Math.max(r.hi, Math.abs(r.lo)) * 1.2} bench={0} fmt={(x) => num(x, 1)} benchLabel="No difference" />
              <p>Design B is {num(Math.abs(r.diff))} points {r.diff >= 0 ? 'higher' : 'lower'} than design A. {r.p < 1 - conf ? 'The difference is statistically significant.' : 'The difference is not statistically significant.'} The true difference is plausibly between {num(r.lo)} and {num(r.hi)}.</p>
            </Result>
            <Stats rows={[['Difference (B − A)', num(r.diff, 2)], ['t', `t(${num(r.df, 1)}) = ${num(r.t, 3)}`], ['p (two-sided)', pv(r.p)], [`${conf * 100}% interval`, `${num(r.lo, 2)} to ${num(r.hi, 2)}`]]} />
          </>
        )}
      </>
    );
  } else {
    const rows = S.parseRows(pairs).filter((r) => r.length === 2 && (!logT || (r[0] > 0 && r[1] > 0)));
    const diffs = rows.map(([a, b]) => (logT ? Math.log(b) - Math.log(a) : b - a));
    const bad = diffs.length < 2 || S.sd(diffs) === 0;
    const r = bad ? null : S.pairedT(diffs, conf);
    const shown = (x) => (logT ? `${num((Math.exp(x) - 1) * 100, 0)}%` : num(x, 2));
    body = (
      <>
        <div className="calc-inputs">
          <Area label="One participant per line: score on A, then score on B" value={pairs} onChange={setPairs} rows={6} />
          <Choice label="Values are" value={logT ? 'time' : 'score'} onChange={(v) => setLogT(v === 'time')} options={[['score', 'Ratings or scores'], ['time', 'Task times']]} />
          <Conf value={conf} onChange={setConf} />
        </div>
        {bad ? <Problem>Enter at least two pairs of values, and make sure they are not all identical differences.</Problem> : (
          <>
            <Result big={`p = ${pv(r.p)}`} label="Paired t-test" tone={r.p < 1 - conf ? 'good' : ''}>
              <p>{logT ? `Design B times are ${shown(r.diff)} relative to design A (negative means faster).` : `On average design B scores ${num(Math.abs(r.diff), 2)} ${r.diff >= 0 ? 'higher' : 'lower'} than design A.`} {r.p < 1 - conf ? 'The difference is statistically significant.' : 'The difference is not statistically significant.'} Plausible range: {shown(r.lo)} to {shown(r.hi)}.</p>
            </Result>
            <Stats rows={[['Participants', r.n], ['Mean difference', shown(r.diff)], ['SD of differences', num(r.sd, 3)], ['t', `t(${r.df}) = ${num(r.t, 3)}`], ['p (two-sided)', pv(r.p)]]} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="calc-inputs"><Choice label="Who tried each design?" value={design} onChange={setDesign} options={[['between', 'Different people'], ['within', 'The same people']]} /></div>
      {body}
      <About method="t-tests-for-comparing-designs-paired-and-two-sample">
        <p>For different people the calculator uses Welch's t-test, which does not assume equal variances, with Welch-Satterthwaite degrees of freedom. For the same people it runs a one-sample t-test on each person's difference. Task times are compared on the log scale, as Sauro and Lewis recommend, and reported as a percentage change. Log-transform times before entering means and SDs in the different-people mode.</p>
      </About>
    </>
  );
}

// ── 9. Rate vs benchmark ──
function RateBenchmark() {
  const [x, setX] = useState('22'); const [n, setN] = useState('25'); const [b, setB] = useState('80'); const [conf, setConf] = useState(0.9);
  const X = int(x), N = int(n), B = n_(b) / 100;
  const bad = !(N > 0 && X >= 0 && X <= N && B > 0 && B < 1);
  const r = bad ? null : S.proportionVsBenchmark(X, N, B);
  const ci = bad ? null : S.adjustedWald(X, N, 1 - 2 * (1 - conf));
  const met = r && r.p < 1 - conf;
  return (
    <>
      <div className="calc-inputs">
        <Num label="Successes" value={x} onChange={setX} min={0} /><Num label="Attempts" value={n} onChange={setN} min={1} />
        <Num label="Benchmark" value={b} onChange={setB} min={1} max={99} suffix="%" hint="The completion rate you want to beat, such as 78% (the average across tasks)" />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Successes must be between 0 and the attempts, and the benchmark between 1% and 99%.</Problem> : (
        <>
          <Result big={met ? 'Benchmark beaten' : 'Not yet shown'} label={`${r.large ? 'Normal approximation' : 'Exact mid-p binomial test'}, one-sided p = ${pv(r.p)}`} tone={met ? 'good' : X / N < B ? 'bad' : ''}>
            <IntervalBar lo={ci.lo} hi={1} point={X / N} bench={B} />
            <p>{X} of {N} ({pct(X / N, 0)}) succeeded. {met ? `You can be ${conf * 100}% confident that more than ${pct(B, 0)} of all users would succeed.` : `You cannot yet claim that more than ${pct(B, 0)} of all users would succeed. ${X / N > B ? 'The sample is above the benchmark, so more participants may settle it.' : 'The sample is below the benchmark.'}`}</p>
          </Result>
          <Stats rows={[['Observed', pct(X / N)], ['Exact p', pv(r.exact)], ['Mid-p', pv(r.midP)], ['Normal approximation p', `${pv(r.pNormal)}${r.large ? ' (used: large sample)' : ''}`], [`${conf * 100}% one-sided lower bound`, pct(ci.lo)]]} />
        </>
      )}
      <About method="testing-against-a-benchmark-one-sample-tests">
        <p>The one-sided test asks how likely this many successes would be if the true rate were only at the benchmark. With fewer than 15 expected successes or failures it uses the exact binomial probability with the mid-p adjustment (Sauro and Lewis's recommendation, less conservative than the exact test); otherwise the normal approximation. The lower bound is the adjusted-Wald interval at the matching two-sided level.</p>
      </About>
    </>
  );
}

// ── 10. Sample size planner ──
function SampleSize() {
  const [goal, setGoal] = useState('discovery');
  const [p, setP] = useState('15'); const [want, setWant] = useState('85');
  const [margin, setMargin] = useState('10'); const [prop, setProp] = useState('50'); const [conf, setConf] = useState(0.9);
  const [sdv, setSdv] = useState('17.7'); const [diff, setDiff] = useState('10'); const [power, setPower] = useState(0.8);
  const [pa, setPa] = useState('50'); const [pb, setPb] = useState('70'); const [design, setDesign] = useState('between');
  let res = null; let note = ''; let table = null;
  if (goal === 'discovery') {
    const P = n_(p) / 100, W = n_(want) / 100;
    if (P > 0 && P < 1 && W > 0 && W < 1) {
      res = [S.discoveryN(P, W), 'participants'];
      note = `With ${res[0]} participants you have a ${pct(S.discoveryProb(P, res[0]), 0)} chance of seeing, at least once, any problem that affects ${pct(P, 0)} of users.`;
      table = [1, 3, 5, 8, 10, 15, 20].map((nn) => [nn, S.discoveryProb(P, nn)]);
    }
  } else if (goal === 'rate') {
    const M = n_(margin) / 100, P = n_(prop) / 100;
    if (M > 0 && M < 0.5 && P > 0 && P < 1) { res = [S.nForProportion(P, M, conf), 'participants']; note = `Estimates a completion rate to within ±${pct(M, 0)} at ${conf * 100}% confidence. Use 50% if you have no idea of the rate; it gives the largest sample.`; }
  } else if (goal === 'mean') {
    const SD = n_(sdv), M = n_(margin);
    if (SD > 0 && M > 0) { res = [S.nForMean(SD, M, conf), 'participants']; note = `Estimates a mean to within ±${num(M)} at ${conf * 100}% confidence. The SD of SUS scores is typically about 17.7.`; }
  } else if (goal === 'means') {
    const SD = n_(sdv), D = n_(diff);
    if (SD > 0 && D > 0) { const nn = S.nForMeans(SD, D, conf, power, design); res = [nn, design === 'between' ? 'per group' : 'participants']; note = `Detects a difference of ${num(D)} with ${power * 100}% power at ${conf * 100}% confidence (two-sided). ${design === 'between' ? `Total: ${nn * 2}.` : 'Within subjects, use the SD of the differences if you know it; otherwise this is conservative.'}`; }
  } else if (goal === 'rates') {
    const A = n_(pa) / 100, B = n_(pb) / 100;
    if (A > 0 && A < 1 && B > 0 && B < 1 && A !== B) { const nn = S.nForProportions(A, B, conf, power); res = [nn, 'per group']; note = `Detects a change from ${pct(A, 0)} to ${pct(B, 0)} with ${power * 100}% power at ${conf * 100}% confidence (two-sided), with different people in each group. Total: ${nn * 2}.`; }
  }
  return (
    <>
      <div className="calc-inputs">
        <Choice label="What is the study for?" value={goal} onChange={setGoal} options={[['discovery', 'Find problems'], ['rate', 'Estimate a rate'], ['mean', 'Estimate a score'], ['means', 'Compare scores'], ['rates', 'Compare rates']]} />
        {goal === 'discovery' && (<>
          <Num label="Smallest problem frequency you care about" value={p} onChange={setP} min={1} max={99} suffix="%" hint="31% is the average Nielsen and Landauer assumed; 10–15% is more cautious" />
          <Num label="Chance of seeing such a problem" value={want} onChange={setWant} min={1} max={99} suffix="%" />
        </>)}
        {goal === 'rate' && (<>
          <Num label="Margin of error" value={margin} onChange={setMargin} min={1} max={49} suffix="± %" />
          <Num label="Expected rate" value={prop} onChange={setProp} min={1} max={99} suffix="%" />
        </>)}
        {(goal === 'mean' || goal === 'means') && <Num label="Standard deviation" value={sdv} onChange={setSdv} step="any" min={0} />}
        {goal === 'mean' && <Num label="Margin of error" value={margin} onChange={setMargin} step="any" min={0} suffix="±" />}
        {goal === 'means' && (<>
          <Num label="Smallest difference worth detecting" value={diff} onChange={setDiff} step="any" min={0} />
          <Choice label="Design" value={design} onChange={setDesign} options={[['between', 'Different people'], ['within', 'Same people']]} />
        </>)}
        {goal === 'rates' && (<>
          <Num label="Current rate" value={pa} onChange={setPa} min={1} max={99} suffix="%" />
          <Num label="Rate you want to detect" value={pb} onChange={setPb} min={1} max={99} suffix="%" />
        </>)}
        {goal !== 'discovery' && <Conf value={conf} onChange={setConf} />}
        {(goal === 'means' || goal === 'rates') && <Choice label="Power" value={power} onChange={setPower} options={[[0.5, '50%'], [0.8, '80%'], [0.9, '90%']]} />}
      </div>
      {!res ? <Problem>Check the inputs: percentages must be between 1 and 99 and other values above zero.</Problem> : (
        <>
          <Result big={res[0]} label={res[1]}><p>{note}</p></Result>
          {table && (
            <div className="disc-table" role="table" aria-label="Chance of seeing the problem by sample size">
              {table.map(([nn, pr]) => (
                <div key={nn} role="row" className={nn === 5 ? 'hl' : ''}>
                  <span role="cell">{nn} {nn === 1 ? 'user' : 'users'}</span>
                  <span role="cell" className="bar"><i style={{ width: pct(pr, 0) }} /></span>
                  <span role="cell">{pct(pr, 0)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <About method={goal === 'discovery' ? 'problem-discovery-sample-size-model-1-1-p-n' : 'sample-size-planning-for-summative-ux-studies'}>
        <p>Finding problems uses n = ln(1 − goal) / ln(1 − p). Estimating a rate uses the adjusted-Wald approach, n = z²p(1−p)/d² − z². Estimating or comparing means iterates the t-based formula until n stops changing, n = ((t<sub>α</sub> + t<sub>β</sub>)s/d)² (doubled per group for different people). Comparing rates uses the standard normal-approximation formula with pooled and unpooled variances. Add 10 to 20% for drop-outs and cleaning in unmoderated studies.</p>
      </About>
    </>
  );
}

// ── 11. Problem discovery from observed data ──
function Discovery() {
  const [n, setN] = useState('6'); const [text, setText] = useState('6 4 3 3 2 2 1 1 1 1');
  const N = int(n); const counts = S.parseNumbers(text).filter((c) => c > 0);
  const bad = !(N > 1) || counts.length === 0 || counts.some((c) => c > N || !Number.isInteger(c));
  let r = null;
  if (!bad) {
    const pEst = S.mean(counts.map((c) => c / N));
    const once = counts.filter((c) => c === 1).length / counts.length;
    const pAdj = S.adjustP(pEst, N, once);
    const found = S.discoveryProb(pAdj, N);
    const total = counts.length / found;
    r = { pEst, once, pAdj, found, total, remaining: Math.max(0, Math.round(total - counts.length)), more: [0.9, 0.95].map((g) => Math.max(0, S.discoveryN(pAdj, g) - N)) };
  }
  return (
    <>
      <div className="calc-inputs">
        <Num label="Participants tested" value={n} onChange={setN} min={2} />
        <Area label="For each problem found, how many participants hit it" value={text} onChange={setText} rows={3} hint="One number per problem. For example 6 4 3 means one problem hit by 6 people, one by 4, one by 3." />
      </div>
      {bad ? <Problem>Each count must be a whole number between 1 and the number of participants.</Problem> : (
        <>
          <Result big={pct(r.found, 0)} label="Estimated share of problems already found">
            <p>You found {counts.length} problems. After adjusting for small-sample inflation, the average problem affects about {pct(r.pAdj, 0)} of users, so there are probably around {Math.round(r.total)} problems in total and about {r.remaining} not yet seen. To reach 90% discovery you would need about {r.more[0]} more participants; for 95%, about {r.more[1]} more.</p>
          </Result>
          <Stats rows={[['Raw p (average problem frequency)', pct(r.pEst)], ['Problems seen only once', pct(r.once, 0)], ['Adjusted p (Lewis 2001)', pct(r.pAdj)], ['Estimated total problems', num(r.total, 1)]]} />
        </>
      )}
      <About method="problem-discovery-sample-size-model-1-1-p-n">
        <p>The raw estimate of p from a small test is inflated, because problems nobody hit are missing from the matrix. Lewis (2001) averages two corrections: normalisation, (p − 1/n)(1 − 1/n), and Good-Turing, p / (1 + share of problems seen once). The share found is then 1 − (1 − p<sub>adj</sub>)<sup>n</sup>, and the total is the number found divided by that share.</p>
      </About>
    </>
  );
}

const CALCS = [
  { group: 'Plan', id: 'sample-size', name: 'Sample size planner', blurb: 'How many participants you need to find problems, estimate a metric or compare designs.', C: SampleSize },
  { group: 'Measure', id: 'completion-rate', name: 'Completion rate interval', blurb: 'Confidence interval for a task success rate from a small sample.', C: CompletionRate },
  { group: 'Measure', id: 'task-time', name: 'Task time interval', blurb: 'Typical task time with an interval that respects skew.', C: TaskTime },
  { group: 'Measure', id: 'rating', name: 'Rating scale and benchmark', blurb: 'Interval for SUS, SEQ or any rating scale, tested against a benchmark.', C: Rating },
  { group: 'Measure', id: 'sus', name: 'SUS scorer', blurb: 'Score raw System Usability Scale answers, with grade and percentile.', C: SUS },
  { group: 'Measure', id: 'umux-lite', name: 'UMUX-Lite scorer', blurb: 'Score the two-item UMUX-Lite and convert it to the SUS scale.', C: UMUXLite },
  { group: 'Measure', id: 'nps', name: 'Net Promoter Score', blurb: 'NPS with a proper confidence interval.', C: NPS },
  { group: 'Compare', id: 'compare-rates', name: 'Compare two completion rates', blurb: 'N−1 two-proportion test or McNemar for the same people.', C: CompareRates },
  { group: 'Compare', id: 'compare-means', name: 'Compare two means', blurb: 'Welch or paired t-test for ratings and task times.', C: CompareMeans },
  { group: 'Compare', id: 'rate-benchmark', name: 'Completion rate vs benchmark', blurb: 'Did more than the target share of users succeed?', C: RateBenchmark },
  { group: 'Discover', id: 'discovery', name: 'Problems left to find', blurb: 'Estimate how many usability problems your test missed.', C: Discovery },
];

export default function Calculators() {
  const { calc } = useParams();
  const current = CALCS.find((c) => c.id === calc);
  const groups = [...new Set(CALCS.map((c) => c.group))];
  const go = useNavigate();

  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <p className="eyebrow">UX calculators</p>
          <h1 className="h1">{current ? current.name : 'Do the maths properly.'}</h1>
          <p className="lede" style={{ marginBottom: 0 }}>
            {current ? current.blurb : 'Sample sizes, confidence intervals, questionnaire scoring and significance tests for UX research, using the small-sample methods from Sauro and Lewis. Everything runs in your browser; nothing you enter is sent anywhere.'}
          </p>
        </div>
      </section>
      <section className="section tight"><div className="wrap calc-layout">
        <label className="calc-pick">
          <span>Calculator</span>
          <select className="select" value={current?.id || ''} onChange={(e) => go(e.target.value ? `/calculators/${e.target.value}` : '/calculators')}>
            <option value="">All calculators</option>
            {groups.map((g) => <optgroup key={g} label={g}>{CALCS.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
          </select>
        </label>
        <nav className="calc-nav" aria-label="Calculators">
          {groups.map((g) => (
            <div key={g}>
              <h3>{g}</h3>
              {CALCS.filter((c) => c.group === g).map((c) => <NavLink key={c.id} to={`/calculators/${c.id}`}>{c.name}</NavLink>)}
            </div>
          ))}
        </nav>
        <div className="calc-main">
          {current ? <current.C key={current.id} /> : (
            <div className="calc-grid">
              {CALCS.map((c) => (
                <Link key={c.id} to={`/calculators/${c.id}`} className="card">
                  <span className="fam">{c.group}</span>
                  <h3>{c.name}</h3>
                  <p>{c.blurb}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div></section>
    </>
  );
}
