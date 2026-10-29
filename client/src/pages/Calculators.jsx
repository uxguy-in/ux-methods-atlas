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

function About({ method, links = [], children }) {
  return (
    <details className="calc-about">
      <summary>How this is calculated</summary>
      <div>{children}</div>
      {method && <p><Link to={`/methods/${method}`}>Read the method in the atlas</Link></p>}
      {links.length > 0 && <p>Related in the atlas: {links.map(([id, name], i) => <span key={id}>{i > 0 && ', '}<Link to={`/methods/${id}`}>{name}</Link></span>)}</p>}
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
  const [form, setForm] = useState('lite');
  const [lite, setLite] = useState('6 6\n7 6\n5 5\n6 7\n4 5\n7 7\n6 5');
  const [full, setFull] = useState('6 2 6 2\n7 1 6 2\n5 3 5 3\n6 2 7 1\n4 4 5 3\n7 1 7 2');
  const k = form === 'lite' ? 2 : 4;
  const rows = S.parseRows(form === 'lite' ? lite : full).filter((r) => r.length === k && r.every((v) => v >= 1 && v <= 7));
  const scores = rows.map((r) => (form === 'lite' ? S.umuxLite(r[0], r[1]) : S.umux(r)));
  const M = scores.length ? S.mean(scores) : NaN;
  const ci = scores.length > 1 ? S.meanCI(M, S.sd(scores), scores.length, 0.95) : null;
  const sus = form === 'lite' ? S.umuxLiteToSus(M) : M;
  const name = form === 'lite' ? 'UMUX-Lite' : 'UMUX';
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Questionnaire" value={form} onChange={setForm} options={[['lite', 'UMUX-Lite (2 items)'], ['full', 'UMUX (4 items)']]} />
        {form === 'lite'
          ? <Area label="Responses: one participant per line, two answers from 1 to 7" value={lite} onChange={setLite} rows={6}
              hint="Item 1: This system's capabilities meet my requirements. Item 2: This system is easy to use." />
          : <Area label="Responses: one participant per line, four answers from 1 to 7" value={full} onChange={setFull} rows={6}
              hint="1: capabilities meet my requirements. 2: using it is a frustrating experience. 3: it is easy to use. 4: I spend too much time correcting things. Items 2 and 4 are reversed automatically." />}
      </div>
      {scores.length === 0 ? <Problem>Add at least one complete set of answers between 1 and 7.</Problem> : (
        <>
          <Result big={num(M)} label={`Mean ${name} from ${scores.length} participants`}>
            {ci && <IntervalBar lo={ci.lo} hi={ci.hi} point={M} min={0} max={100} bench={68} fmt={(v) => num(v, 0)} benchLabel="SUS average" />}
            <p>{form === 'lite' ? `On the SUS scale this is about ${num(sus)} (grade ${S.susGrade(sus)[1]}), using the regression-adjusted conversion.` : `The UMUX tracks SUS closely (r = 0.96 in Finstad's validation), so read it against SUS norms: grade ${S.susGrade(sus)[1]}.`}</p>
          </Result>
          <Stats rows={[ci && ['95% interval', `${num(ci.lo)} – ${num(ci.hi)}`], ['SUS-equivalent', num(sus)], ['Grade', S.susGrade(sus)[1]], ['Individual scores', scores.map((v) => num(v, 0)).join(', ')]]} />
        </>
      )}
      <About method={form === 'lite' ? 'umux-lite' : 'umux-usability-metric-for-user-experience'}>
        <p>UMUX-Lite = ((item 1 − 1) + (item 2 − 1)) / 12 × 100, and its SUS-equivalent uses Lewis, Utesch and Maher's (2013) regression, 0.65 × UMUX-Lite + 22.9. The four-item UMUX (Finstad 2010) recodes items 1 and 3 as response − 1 and items 2 and 4 as 7 − response, sums them, divides by 24 and multiplies by 100.</p>
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
    const fisher = bad ? NaN : S.fisherExact(X1, N1 - X1, X2, N2 - X2);
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
            {r.minExpected < 1 && <Problem>An expected cell count is below 1, so the N−1 test is not reliable here. Use the Fisher exact p-value of {pv(fisher)} instead.</Problem>}
            <Stats rows={[['Design A', pct(r.p1)], ['Design B', pct(r.p2)], ['z (N−1 adjusted)', num(r.z, 3)], ['p (two-sided)', pv(r.p)], ['Fisher exact p (conservative)', pv(fisher)], [`${conf * 100}% interval, B − A`, `${num(-r.hi * 100)} to ${num(-r.lo * 100)} points`]]} />
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
    const es = bad ? null : S.effectSize(v[0], v[1], v[2], v[3], v[4], v[5], conf);
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
            <Stats rows={[['Difference (B − A)', num(r.diff, 2)], ['t', `t(${num(r.df, 1)}) = ${num(r.t, 3)}`], ['p (two-sided)', pv(r.p)], [`${conf * 100}% interval`, `${num(r.lo, 2)} to ${num(r.hi, 2)}`], ["Cohen's d", `${num(es.d, 2)} (${num(es.dLo, 2)} to ${num(es.dHi, 2)}), ${S.effectLabel(es.d)}`], ["Hedges' g", `${num(es.g, 2)} (${num(es.gLo, 2)} to ${num(es.gHi, 2)})`]]} />
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
            <Stats rows={[['Participants', r.n], ['Mean difference', shown(r.diff)], ['SD of differences', num(r.sd, 3)], ['t', `t(${r.df}) = ${num(r.t, 3)}`], ['p (two-sided)', pv(r.p)], ['Effect size dz (mean ÷ SD of differences)', `${num(r.diff / r.sd, 2)}, ${S.effectLabel(r.diff / r.sd)}`]]} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="calc-inputs"><Choice label="Who tried each design?" value={design} onChange={setDesign} options={[['between', 'Different people'], ['within', 'The same people']]} /></div>
      {body}
      <About method="t-tests-for-comparing-designs-paired-and-two-sample" links={[['effect-size-calculation', 'Effect size calculation']]}>
        <p>For different people the calculator uses Welch's t-test, which does not assume equal variances, with Welch-Satterthwaite degrees of freedom. For the same people it runs a one-sample t-test on each person's difference. Task times are compared on the log scale, as Sauro and Lewis recommend, and reported as a percentage change. Log-transform times before entering means and SDs in the different-people mode.</p>
        <p>Effect sizes say how big the difference is in standard deviations. For different people, Cohen's d uses the pooled SD and Hedges' g corrects it for small samples (intervals by the Hedges and Olkin approximation; see the effect size calculator). For the same people, d<sub>z</sub> divides the mean difference by the SD of the differences, which is not comparable with a between-groups d.</p>
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


// ── 12. Top-box ──
function TopBox() {
  const [text, setText] = useState('4 4 5 5 5 5 3 5 1 5 5 5');
  const [points, setPoints] = useState(5); const [cut, setCut] = useState('4'); const [bench, setBench] = useState('75'); const [conf, setConf] = useState(0.8);
  const xs = S.parseNumbers(text).filter((v) => v >= 1 && v <= points);
  const C = n_(cut), B = n_(bench) / 100;
  const bad = xs.length < 2 || !(C >= 1 && C <= points) || !(B > 0 && B < 1);
  let r = null;
  if (!bad) {
    const x = xs.filter((v) => v >= C).length, n = xs.length;
    const test = S.proportionVsBenchmark(x, n, B), ci = S.adjustedWald(x, n, conf);
    const M = S.mean(xs), SD = S.sd(xs), t = SD > 0 ? S.oneSampleT(M, SD, n, C) : null;
    r = { x, n, test, ci, M, SD, t };
  }
  const boxes = points - (n_(cut) || points) + 1;
  return (
    <>
      <div className="calc-inputs">
        <Area label="Ratings" value={text} onChange={setText} rows={3} hint="One rating per participant, separated by spaces, commas or new lines." />
        <Choice label="Scale" value={points} onChange={(v) => { setPoints(v); setCut(String(v === 5 ? 4 : v === 7 ? 6 : 9)); }} options={[[5, '5-point'], [7, '7-point'], [10, '10-point']]} />
        <Num label="Counts as agree from" value={cut} onChange={setCut} min={1} max={points} hint={`Top ${boxes} box${boxes > 1 ? 'es' : ''}`} />
        <Num label="Target share agreeing" value={bench} onChange={setBench} min={1} max={99} suffix="%" />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Enter at least two ratings within the scale, a cut-off on the scale and a target between 1% and 99%.</Problem> : (
        <>
          <Result big={pct(r.x / r.n, 0)} label={`${r.x} of ${r.n} chose ${C} or higher`} tone={r.test.midP < 1 - conf ? 'good' : ''}>
            <IntervalBar lo={r.ci.lo} hi={r.ci.hi} point={r.x / r.n} bench={B} benchLabel="Target" />
            <p>There is a {pct(1 - r.test.p, 1)} chance that at least {pct(B, 0)} of all users would agree. {r.test.p < 1 - conf ? 'That clears your confidence level, so the target is met.' : 'That is not enough to claim the target is met.'} Analysed as a mean instead, the average of {num(r.M, 2)} gives a {r.t ? pct(1 - r.t.pOne, 1) : '—'} chance that the true mean is above {C}, because the mean keeps the strength of agreement that top-box throws away.</p>
          </Result>
          <Stats rows={[['Top-box share', pct(r.x / r.n)], [`${conf * 100}% interval`, `${pct(r.ci.lo)} – ${pct(r.ci.hi)}`], [`p (${r.test.large ? 'normal' : 'mid-p binomial'})`, pv(r.test.p)], ['Mean rating', `${num(r.M, 2)} (SD ${num(r.SD, 2)})`], r.t && [`p (mean above ${C})`, pv(r.t.pOne)]]} />
        </>
      )}
      <About method="top-box-analysis-of-rating-scales">
        <p>Ratings at or above the cut-off become 1 and the rest 0. The share is then tested against the target with the one-sided binomial mid-p test (small samples) or the normal approximation, and given an adjusted-Wald interval, exactly as for completion rates. The comparison with a one-sample t-test on the raw ratings follows Sauro and Lewis's worked example, where 10 of 12 agreeing gave a 72.5% chance of meeting 75%, against 81.4% for the mean.</p>
      </About>
    </>
  );
}

// ── 13. Expectation vs experience ──
const EXP_SAMPLE = 'Find opening hours, 6.5, 6.1\nChange delivery address, 6.2, 3.4\nCompare two plans, 3.1, 5.6\nCancel subscription, 2.8, 2.5\nDownload invoice, 5.9, 6.3';
function Expectation() {
  const [text, setText] = useState(EXP_SAMPLE); const [mid, setMid] = useState('4');
  const Mid = n_(mid);
  const tasks = text.split('\n').map((line) => {
    const parts = line.split(/[,\t;]/).map((s) => s.trim());
    const nums = parts.slice(1).map(Number);
    return parts.length >= 3 && nums.slice(0, 2).every((v) => v >= 1 && v <= 7) ? { name: parts[0] || 'Task', e: nums[0], x: nums[1] } : null;
  }).filter(Boolean);
  const quad = (t) => (t.e >= Mid ? (t.x >= Mid ? ['Don’t touch it', 'ok'] : ['Fix it fast', 'fix']) : (t.x >= Mid ? ['Promote it', 'promote'] : ['Big opportunity', 'opp']));
  const W = 420, P = 36, sc = (v) => P + ((v - 1) / 6) * (W - 2 * P);
  return (
    <>
      <div className="calc-inputs">
        <Area label="One task per line: name, expected ease, experienced ease" value={text} onChange={setText} rows={6} hint="Use mean ratings on a 7-point scale where 7 is very easy. Separate with commas or tabs." />
        <Num label="Quadrant split" value={mid} onChange={setMid} min={1} max={7} step="0.1" hint="The scale midpoint (4) or your average rating" />
      </div>
      {tasks.length === 0 || !(Mid > 1 && Mid < 7) ? <Problem>Enter at least one task with two ratings between 1 and 7, and a split between 1 and 7.</Problem> : (
        <>
          <div className="exp-wrap">
            <svg viewBox={`0 0 ${W} ${W}`} className="exp-plot" role="img" aria-label="Expected versus experienced ease by task">
              <rect x={P} y={P} width={sc(Mid) - P} height={sc(Mid) - P} className="q promote" />
              <rect x={sc(Mid)} y={P} width={W - P - sc(Mid)} height={sc(Mid) - P} className="q ok" />
              <rect x={P} y={sc(Mid)} width={sc(Mid) - P} height={W - P - sc(Mid)} className="q opp" />
              <rect x={sc(Mid)} y={sc(Mid)} width={W - P - sc(Mid)} height={W - P - sc(Mid)} className="q fix" />
              <text x={P + 6} y={P + 16} className="ql">Promote it</text>
              <text x={W - P - 6} y={P + 16} className="ql" textAnchor="end">Don’t touch it</text>
              <text x={P + 6} y={W - P - 8} className="ql">Big opportunity</text>
              <text x={W - P - 6} y={W - P - 8} className="ql" textAnchor="end">Fix it fast</text>
              {tasks.map((t, i) => <g key={i}><circle cx={sc(t.e)} cy={W - sc(t.x)} r="6" className="dot" /><text x={sc(t.e) + 9} y={W - sc(t.x) + 4} className="dl">{i + 1}</text></g>)}
              <text x={W / 2} y={W - 6} className="ax" textAnchor="middle">Expected ease →</text>
              <text x={12} y={W / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${W / 2})`}>Experienced ease →</text>
            </svg>
            <ol className="exp-list">
              {tasks.map((t, i) => { const [q, c] = quad(t); return <li key={i}><b>{t.name}</b> <span className={`qtag ${c}`}>{q}</span><br /><span className="muted">expected {num(t.e)}, experienced {num(t.x)} ({t.x - t.e >= 0 ? '+' : ''}{num(t.x - t.e)})</span></li>; })}
            </ol>
          </div>
          <Result label="Where to start">
            <p>{(() => { const fix = tasks.filter((t) => quad(t)[1] === 'fix').sort((a, b) => (a.x - a.e) - (b.x - b.e)); return fix.length ? `Fix "${fix[0].name}" first: users expected it to be easy (${num(fix[0].e)}) but found it hard (${num(fix[0].x)}). Gaps like this cause the most dissatisfaction.` : 'No task falls in the fix-it-fast quadrant. Look at the big-opportunity tasks next.'; })()}</p>
          </Result>
        </>
      )}
      <About method="expectation-ratings-expected-vs-experienced-difficulty">
        <p>Before any tasks, participants rate how easy they expect each one to be; after each task, how easy it was, on the same 7-point scale (Albert and Dixon 2003). Plotting the two means per task gives four quadrants (Tullis and Albert 2008). Expected easy but experienced hard is "fix it fast"; expected hard but experienced easy is "promote it".</p>
      </About>
    </>
  );
}

// ── 14. Single Usability Metric ──
function SUM() {
  const [x, setX] = useState('8'); const [n, setN] = useState('10');
  const [times, setTimes] = useState('60 70 80 90 100 120 150'); const [spec, setSpec] = useState('100');
  const [sat, setSat] = useState('5 6 7 4 6 6 5 6'); const [specSat, setSpecSat] = useState('5');
  const [err, setErr] = useState('4'); const [opp, setOpp] = useState('5');
  const X = int(x), N = int(n);
  const bad = !(N > 0 && X >= 0 && X <= N);
  const r = bad ? null : S.sumScore({ x: X, n: N, times: S.parseNumbers(times).filter((t) => t > 0), specTime: n_(spec), sat: S.parseNumbers(sat), specSat: n_(specSat), errors: n_(err), opportunities: n_(opp) });
  const label = { completion: 'Completion', time: 'Time (share under target)', satisfaction: 'Satisfaction (share above target)', errors: 'Errors (opportunities error-free)' };
  return (
    <>
      <div className="calc-inputs">
        <Num label="Successes" value={x} onChange={setX} min={0} /><Num label="Attempts" value={n} onChange={setN} min={1} />
        <Area label="Task times in seconds (successful attempts)" value={times} onChange={setTimes} rows={2} />
        <Num label="Target time" value={spec} onChange={setSpec} min={1} suffix="s" />
        <Area label="Post-task ratings (for example SEQ, 1 to 7)" value={sat} onChange={setSat} rows={2} />
        <Num label="Target rating" value={specSat} onChange={setSpecSat} step="any" hint="Sauro and Kindlund used 4 on a 5-point scale; 5 or 5.5 suits the 7-point SEQ" />
        <Num label="Total errors" value={err} onChange={setErr} min={0} /><Num label="Error opportunities per attempt" value={opp} onChange={setOpp} min={0} hint="Leave 0 if you did not log errors" />
      </div>
      {bad || !Number.isFinite(r.sum) ? <Problem>Enter at least successes and attempts.</Problem> : (
        <>
          <Result big={pct(r.sum, 0)} label={`Single Usability Metric from ${Object.keys(r.parts).length} components`} tone={r.sum >= 0.78 ? 'good' : r.sum < 0.6 ? 'bad' : ''}>
            <div className="sum-bars">
              {Object.entries(r.parts).map(([k, v]) => (
                <div key={k}><span>{label[k]}</span><span className="bar"><i style={{ width: pct(v, 0) }} /></span><b>{pct(v, 0)}</b></div>
              ))}
            </div>
            <p>{(() => { const [k, v] = Object.entries(r.parts).sort((a, b) => a[1] - b[1])[0]; return `The weakest component is ${label[k].split(' (')[0].toLowerCase()} at ${pct(v, 0)}, so that is where this task loses most of its score.`; })()}</p>
          </Result>
        </>
      )}
      <About method="single-usability-metric-sum">
        <p>Each metric becomes the share of users meeting a target, then the shares are averaged (Sauro and Kindlund 2005). Completion is the success rate. Time is the share predicted to finish under the target, from a normal fit to log times. Satisfaction is the share predicted to rate above the target, from a normal fit to the ratings. Errors are the share of error opportunities without an error. Components you leave out are skipped.</p>
      </About>
    </>
  );
}

// ── 15. Correlation ──
function Correlation() {
  const [text, setText] = useState('72 0.9\n65 0.8\n80 1\n55 0.6\n90 1\n60 0.7\n77 0.9\n48 0.5\n85 0.9\n70 0.8');
  const [kind, setKind] = useState('pearson'); const [conf, setConf] = useState(0.95);
  const rows = S.parseRows(text).filter((r) => r.length === 2);
  let xs = rows.map((r) => r[0]), ys = rows.map((r) => r[1]);
  if (kind === 'spearman') { xs = S.ranks(xs); ys = S.ranks(ys); }
  const bad = rows.length < 4 || S.sd(xs) === 0 || S.sd(ys) === 0;
  const r = bad ? null : S.correlation(xs, ys, conf);
  const size = (v) => { const a = Math.abs(v); return a >= 0.5 ? 'strong' : a >= 0.3 ? 'moderate' : a >= 0.1 ? 'weak' : 'negligible'; };
  return (
    <>
      <div className="calc-inputs">
        <Area label="One pair per line: first measure, second measure" value={text} onChange={setText} rows={7} hint="For example SUS score and completion rate per participant or per task." />
        <Choice label="Method" value={kind} onChange={setKind} options={[['pearson', 'Pearson'], ['spearman', 'Spearman (ranks)']]} />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Enter at least four pairs, and make sure neither column is constant.</Problem> : (
        <>
          <Result big={`r = ${num(r.r, 2)}`} label={`${kind === 'pearson' ? 'Pearson' : 'Spearman'} correlation from ${r.n} pairs`} tone={r.p < 1 - conf ? 'good' : ''}>
            <IntervalBar lo={r.lo} hi={r.hi} point={r.r} min={-1} max={1} bench={0} fmt={(v) => num(v, 1)} benchLabel="No relationship" />
            <p>A {size(r.r)} {r.r >= 0 ? 'positive' : 'negative'} relationship. {r.p < 1 - conf ? 'It is statistically significant.' : 'It is not statistically significant.'} The true correlation is plausibly between {num(r.lo, 2)} and {num(r.hi, 2)}{r.hi - r.lo > 0.6 ? ', which is wide, so treat the strength with caution' : ''}. Correlation alone does not show which measure drives the other.</p>
          </Result>
          <Stats rows={[['r', num(r.r, 3)], ['r² (shared variance)', pct(r.r2)], ['t', `t(${r.n - 2}) = ${num(r.t, 3)}`], ['p (two-sided)', pv(r.p)], [`${conf * 100}% interval`, `${num(r.lo, 3)} to ${num(r.hi, 3)}`]]} />
        </>
      )}
      <About method="correlation-analysis-with-confidence-intervals">
        <p>Pearson's r measures linear association; Spearman's version runs the same calculation on ranks, so it suits skewed or ordinal data. Significance uses t = r√((n−2)/(1−r²)) with n − 2 degrees of freedom. The interval uses the Fisher z transformation, atanh(r) ± z/√(n−3), converted back with tanh.</p>
      </About>
    </>
  );
}

// ── 16. Inter-coder agreement ──
const CODER_SAMPLE = 'price, price\nprice, trust\ntrust, trust\nspeed, speed\nspeed, speed\ntrust, trust\nprice, price\nsupport, support\nsupport, trust\nspeed, speed\ntrust, trust\nprice, price\nsupport, support\nspeed, price\ntrust, trust\nprice, price\nsupport, support\nspeed, speed\ntrust, .\nprice, price';
function InterCoder() {
  const [text, setText] = useState(CODER_SAMPLE); const [level, setLevel] = useState('nominal'); const [conf, setConf] = useState(0.95);
  const { rows, numeric } = S.parseCodeRows(text);
  const coders = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const kr = S.krippendorffAlpha(rows, numeric ? level : 'nominal');
  const krNom = level === 'nominal' || !numeric ? kr : S.krippendorffAlpha(rows, 'nominal');
  const agree = S.percentAgreement(rows);
  const pairs = coders === 2 ? rows.filter((r) => r[0] !== null && r[0] !== undefined && r[1] !== null && r[1] !== undefined).map((r) => [r[0], r[1]]) : [];
  const kap = pairs.length > 1 ? S.cohenKappa(pairs, conf) : null;
  const ok = kr.units >= 2 && Number.isFinite(kr.alpha);
  const a = kr.alpha;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One coded segment per line, one coder per column" value={text} onChange={setText} rows={8}
          hint="Separate coders with commas or tabs (paste straight from a spreadsheet). Codes can be words or numbers. Mark a missing code with a dot, a dash or NA." />
        <Choice label="Codes are" value={level} onChange={setLevel} options={[['nominal', 'Categories'], ['ordinal', 'Ordered (numbers)'], ['interval', 'Scores (numbers)']]} />
        <Conf value={conf} onChange={setConf} />
      </div>
      {level !== 'nominal' && !numeric && <Problem>Ordered and score levels need numeric codes, so alpha is shown for categories instead.</Problem>}
      {!ok ? <Problem>Enter at least two segments coded by two or more coders, with more than one code in use.</Problem> : (
        <>
          <Result big={`α = ${num(a, 3)}`} label={`Krippendorff's alpha (${numeric ? level : 'nominal'}), ${coders} coders, ${kr.units} segments`} tone={a >= 0.8 ? 'good' : a < 0.667 ? 'bad' : ''}>
            {kap && <IntervalBar lo={kap.lo} hi={kap.hi} point={kap.kappa} min={Math.min(0, kap.lo)} max={1} bench={0.8} fmt={(v) => num(v, 1)} benchLabel="Reliable" />}
            <p>The coders agree on {pct(agree.value, 0)} of segments. {a >= 0.8 ? 'Alpha is at or above 0.8, the level Krippendorff recommends before relying on the codes.' : a >= 0.667 ? 'Alpha is between 0.667 and 0.8: good enough for tentative conclusions, not for firm ones. Refine the code definitions and recode a fresh sample.' : 'Alpha is below 0.667, so the codes are not being applied consistently. Discuss disagreements, sharpen the codebook and recode before analysing.'} {kap && `Cohen's kappa for the two coders is ${num(kap.kappa, 2)}, plausibly between ${num(kap.lo, 2)} and ${num(kap.hi, 2)}.`}</p>
          </Result>
          <Stats rows={[
            ['Percent agreement', `${pct(agree.value)} of ${agree.units} segments`],
            kap && [`Cohen's kappa (${conf * 100}% interval)`, `${num(kap.kappa, 3)} (${num(kap.lo, 3)} to ${num(kap.hi, 3)})`],
            kap && ['Chance agreement (kappa)', pct(kap.pe)],
            kap && ['p (kappa = 0)', pv(kap.p)],
            [`Krippendorff's alpha, ${numeric ? level : 'nominal'}`, num(a, 3)],
            numeric && level !== 'nominal' && ['Krippendorff alpha, nominal', num(krNom.alpha, 3)],
            ['Codes in use', kr.cats.length <= 8 ? kr.cats.join(', ') : `${kr.cats.length} codes`],
            !kap && coders > 2 && ['Cohen kappa', 'Two coders only; use alpha'],
          ]} />
        </>
      )}
      <About method="cohens-kappa-and-krippendorffs-alpha-inter-rater-reliability" links={[['heuristic-evaluation-with-inter-evaluator-reliability', 'Inter-evaluator reliability for heuristic evaluation'], ['start-list-coding-with-a-structured-codebook-and-check-coding', 'Codebook coding with check-coding']]}>
        <p>Percent agreement counts matching pairs of codes, but ignores agreement that would happen by chance. Cohen's kappa corrects for chance using each coder's own code frequencies: κ = (p<sub>o</sub> − p<sub>e</sub>)/(1 − p<sub>e</sub>). Its interval uses the large-sample standard error of Fleiss, Cohen and Everitt (1969). Krippendorff's alpha works for any number of coders, tolerates missing codes and builds a coincidence matrix of all pairable values: α = 1 − D<sub>o</sub>/D<sub>e</sub>. Ordered codes weight disagreements by how many values lie between them; scores weight by the squared difference.</p>
        <p>Do not use agreement statistics for reflexive thematic analysis, where codes are the analyst's interpretation and are not expected to be reproducible. Use them when a codebook is meant to be applied the same way by anyone, and code a fresh sample after revising the codebook rather than recoding the segments you discussed.</p>
      </About>
    </>
  );
}

// ── 17. Saturation and coverage ──
const SAT_SAMPLE = 'pricing confusion, trust in reviews, delivery speed\npricing confusion, returns hassle, trust in reviews\ndelivery speed, app crashes, pricing confusion\ntrust in reviews, returns hassle, gift options\npricing confusion, delivery speed, loyalty points\nreturns hassle, trust in reviews, delivery speed\npricing confusion, app crashes, trust in reviews\ndelivery speed, returns hassle, pricing confusion\ntrust in reviews, loyalty points, pricing confusion\npricing confusion, delivery speed, returns hassle';
function Saturation() {
  const [text, setText] = useState(SAT_SAMPLE); const [k, setK] = useState('3');
  const lists = S.parseCodeLists(text);
  const K = int(k);
  const bad = lists.length < 2 || !(K >= 1);
  const r = bad ? null : S.saturation(lists, K);
  const top = r ? Math.max(r.chao, r.S) : 1;
  return (
    <>
      <div className="calc-inputs">
        <Area label="One interview per line, in the order you ran them, with the codes it produced" value={text} onChange={setText} rows={8}
          hint="Separate codes with commas, semicolons or tabs. A code counts once per interview however often it came up. Matching ignores capitals." />
        <Num label="Look back over the last" value={k} onChange={setK} min={1} suffix="interviews" />
      </div>
      {bad ? <Problem>Enter at least two interviews and a look-back of at least one interview.</Problem> : (
        <>
          <Result big={pct(r.coverage, 0)} label="Good-Turing sample coverage" tone={r.newLast.length === 0 && r.coverage >= 0.9 ? 'good' : r.coverage < 0.75 ? 'bad' : ''}>
            <p>If you ran one more interview, about {pct(r.coverage, 0)} of the code mentions it produced would be codes you already have. You have {r.S} codes; the Chao estimate puts the total at about {num(r.chao, 0)}, so roughly {pct(r.S / r.chao, 0)} of the codes this kind of interview can produce are already in hand. {r.newLast.length === 0 ? `The last ${r.k} interviews added no new codes.` : `The last ${r.k} interview${r.k > 1 ? 's' : ''} still added ${r.newLast.length} new code${r.newLast.length > 1 ? 's' : ''}: ${r.newLast.join(', ')}.`}</p>
          </Result>
          <div className="disc-table" role="table" aria-label="Code accumulation by interview">
            {r.curve.map((c) => (
              <div key={c.interview} role="row" className={c.interview > r.T - r.k ? 'hl' : ''}>
                <span role="cell">Int. {c.interview}</span>
                <span role="cell" className="bar"><i style={{ width: pct(c.total / top, 0) }} /></span>
                <span role="cell">{c.total}</span>
              </div>
            ))}
          </div>
          <Stats rows={[
            ['Interviews', r.T], ['Distinct codes', r.S], ['Code mentions (N)', r.N],
            ['Seen in one interview (f1)', r.f1], ['Seen in two interviews (f2)', r.f2],
            ['Chao estimate of total codes', num(r.chao, 1)],
            [`New in the last ${r.k}`, r.newLast.length ? r.newLast.join(', ') : 'None'],
            r.once.length > 0 && ['Codes seen only once', r.once.join(', ')],
          ]} />
        </>
      )}
      <About method="species-accumulation-and-good-turing-coverage-for-saturation" links={[['saturation-detection', 'Saturation detection'], ['saturation-monitoring', 'Saturation monitoring'], ['theoretical-sampling-and-saturation', 'Theoretical sampling and saturation']]}>
        <p>The bars show the accumulation curve: distinct codes after each interview, scaled to the estimated total. Sample coverage borrows Good and Turing's estimate from ecology and cryptography: 1 − f<sub>1</sub>/N, where f<sub>1</sub> is the number of codes seen in only one interview and N is the total number of code mentions. The total uses Chao's estimator in its form for presence-or-absence data, S + ((T − 1)/T) f<sub>1</sub>²/(2f<sub>2</sub>), with T interviews and f<sub>2</sub> codes seen in exactly two.</p>
        <p>These numbers measure code saturation (no new labels), not meaning saturation (understanding each code well). They assume interviews come from one population and that codes are applied consistently, so do not pool different user groups, and do not stop just because coverage is high if a group you care about has not been interviewed yet.</p>
      </About>
    </>
  );
}

// ── 18. Scale reliability ──
const REL_SAMPLE = '1 3 1 4 1\n4 5 3 2 3\n2 1 2 3 3\n4 3 2 3 2\n2 4 3 3 4\n5 4 5 3 3\n5 3 2 2 3\n3 3 3 4 4\n4 4 5 1 2\n3 3 2 3 3\n2 4 3 4 4\n3 4 5 2 5\n4 4 5 3 3\n5 4 3 1 4';
function Reliability() {
  const [text, setText] = useState(REL_SAMPLE); const [rev, setRev] = useState('4'); const [lo, setLo] = useState('1'); const [hi, setHi] = useState('5'); const [conf, setConf] = useState(0.95);
  const all = S.parseRows(text);
  const counts = {}; all.forEach((r) => { counts[r.length] = (counts[r.length] || 0) + 1; });
  const k = Number(Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0);
  const L = n_(lo), H = n_(hi), revSet = new Set(S.parseNumbers(rev).filter((v) => Number.isInteger(v) && v >= 1 && v <= k));
  const rows = all.filter((r) => r.length === k).map((r) => r.map((v, j) => (revSet.has(j + 1) ? L + H - v : v)));
  const skipped = all.length - rows.length;
  const bad = k < 2 || rows.length < 3 || (revSet.size > 0 && !(Number.isFinite(L) && Number.isFinite(H) && H > L));
  let r = null;
  if (!bad) { const c = S.cronbach(rows, conf); r = Number.isFinite(c.alpha) ? c : null; }
  return (
    <>
      <div className="calc-inputs">
        <Area label="One respondent per line, one answer per item" value={text} onChange={setText} rows={8} hint="Only complete lines with the usual number of items are used." />
        <label className="calc-field"><span>Reverse-scored items</span><span className="calc-input"><input type="text" value={rev} onChange={(e) => setRev(e.target.value)} /></span><small>Item numbers, such as 2 4</small></label>
        <Num label="Scale minimum" value={lo} onChange={setLo} /><Num label="Scale maximum" value={hi} onChange={setHi} />
        <Conf value={conf} onChange={setConf} />
      </div>
      {skipped > 0 && <Problem>{skipped} line{skipped > 1 ? 's' : ''} skipped: they do not have {k} answers.</Problem>}
      {bad || !r ? <Problem>Enter at least three respondents and two items with some variation, and a scale maximum above the minimum if you reverse items.</Problem> : (
        <>
          <Result big={`α = ${num(r.alpha, 2)}`} label={`Cronbach's alpha from ${r.n} respondents and ${r.k} items`} tone={r.alpha >= 0.7 ? 'good' : r.alpha < 0.6 ? 'bad' : ''}>
            <IntervalBar lo={Math.max(0, r.lo)} hi={r.hi} point={Math.max(0, r.alpha)} min={0} max={1} bench={0.7} fmt={(v) => num(v, 1)} benchLabel="Common minimum" />
            <p>With {conf * 100}% confidence the scale's reliability lies between {num(r.lo, 2)} and {num(r.hi, 2)}. {r.alpha >= 0.9 ? 'That is very high; check the items are not near-duplicates of each other.' : r.alpha >= 0.7 ? 'That is acceptable for comparing groups.' : 'That is below the usual 0.7, so the items may not measure one thing. Check the items flagged below.'} {Number.isFinite(r.omega.omega) ? `McDonald's omega, which does not assume every item measures the construct equally well, is ${num(r.omega.omega, 2)}.` : r.omega.reason}</p>
          </Result>
          <Stats rows={[
            [`${conf * 100}% interval (Feldt)`, `${num(r.lo, 3)} to ${num(r.hi, 3)}`],
            ["McDonald's omega (total)", Number.isFinite(r.omega.omega) ? num(r.omega.omega, 3) : 'Not reported'],
            ...r.items.map((it) => [`Item ${it.item}${revSet.has(it.item) ? ' (reversed)' : ''}`, <>r = {num(it.rCorrected, 2)} · α if deleted {num(it.alphaIfDeleted, 2)}{Number.isFinite(r.omega.loadings?.[it.item - 1]) ? ` · loading ${num(r.omega.loadings[it.item - 1], 2)}` : ''} {(it.rCorrected < 0.3 || it.alphaIfDeleted > r.alpha + 0.01) && <span className="qtag fix">Review</span>}</>]),
          ]} />
        </>
      )}
      <About method="reliability-analysis-cronbachs-alpha-split-half-omega" links={[['cronbachs-and-mcdonalds', "Cronbach's α and McDonald's ω"]]}>
        <p>Alpha = k/(k − 1) × (1 − Σ item variances / variance of the total). Its interval follows Feldt (1965): (1 − α)/(1 − α̂) has an F distribution with n − 1 and (n − 1)(k − 1) degrees of freedom. The corrected item-total correlation compares each item with the sum of the other items; items below about 0.3, or whose removal raises alpha, are flagged for review. Omega comes from a one-factor solution fitted by iterated principal-axis factoring (least squares) on the item correlations: ω = (Σλ)²/((Σλ)² + Σ(1 − λ²)). It is withheld if the fit does not converge, an item's communality exceeds 1, or an item loads negatively.</p>
        <p>Alpha is not evidence that a scale measures one thing; a long scale can have high alpha with several factors. Do not use it for single-item measures, for formative indexes where items need not correlate, or with fewer than about 30 respondents if you need a precise value: the interval will be wide.</p>
      </About>
    </>
  );
}

// ── 19. Survey margin of error ──
function MarginOfError() {
  const [mode, setMode] = useState('moe'); const [n, setN] = useState('400'); const [e, setE] = useState('5'); const [p, setP] = useState('50');
  const [pop, setPop] = useState(''); const [deff, setDeff] = useState('1'); const [conf, setConf] = useState(0.95);
  const P = n_(p) / 100, D = n_(deff), Npop = pop === '' ? Infinity : n_(pop), Nn = int(n), E = n_(e) / 100;
  const okCommon = P > 0 && P < 1 && D >= 1 && (Npop === Infinity || Npop >= 2);
  const bad = !okCommon || (mode === 'moe' ? !(Nn >= 2 && Nn <= Npop) : !(E > 0 && E < 0.5));
  const r = bad ? null : mode === 'moe' ? S.surveyMoe({ n: Nn, p: P, conf, N: Npop, deff: D }) : S.surveyN({ e: E, p: P, conf, N: Npop, deff: D });
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Work out" value={mode} onChange={setMode} options={[['moe', 'Margin of error'], ['n', 'Sample size needed']]} />
        {mode === 'moe' ? <Num label="Completed responses" value={n} onChange={setN} min={2} /> : <Num label="Target margin of error" value={e} onChange={setE} min={0.5} max={49} step="any" suffix="± %" />}
        <Num label="Expected proportion" value={p} onChange={setP} min={1} max={99} suffix="%" hint="50% gives the widest margin; use it if unsure" />
        <Num label="Population size (optional)" value={pop} onChange={setPop} min={2} hint="Leave blank for a large population" />
        <Num label="Design effect" value={deff} onChange={setDeff} min={1} step="0.1" hint="1 for simple random sampling; often 1.5 to 2 for clustered or weighted samples" />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Check the inputs: the proportion must be between 1% and 99%, the design effect at least 1, and the sample no larger than the population.</Problem> : mode === 'moe' ? (
        <>
          <Result big={`± ${num(r.moe * 100, 1)} pts`} label={`${conf * 100}% margin of error for a proportion near ${pct(P, 0)}`}>
            <IntervalBar lo={r.lo} hi={r.hi} point={P} />
            <p>If {pct(P, 0)} of your {Nn} respondents choose an answer, the population figure is plausibly between {pct(r.lo, 1)} and {pct(r.hi, 1)}. {D > 1 ? `The design effect of ${num(D, 1)} means the sample is worth only about ${Math.floor(r.neff)} simple random responses.` : ''} {r.fpc < 0.95 ? `Because you surveyed a large share of a small population, the margin shrinks by ${pct(1 - r.fpc, 0)}.` : ''} Subgroups have wider margins: half the sample gives about {num(r.moe * Math.SQRT2 * 100, 1)} points.</p>
          </Result>
          <Stats rows={[['Margin of error', `± ${num(r.moe * 100, 2)} points`], ['Effective sample size', num(r.neff, 0)], ['Finite population correction', num(r.fpc, 3)], [`${conf * 100}% interval`, `${pct(r.lo)} – ${pct(r.hi)}`]]} />
        </>
      ) : (
        <>
          <Result big={r.n} label={`completed responses for ± ${num(E * 100, 1)} points at ${conf * 100}% confidence`}>
            <p>Plan for about {r.n} completed responses. {D > 1 ? `That includes the design effect of ${num(D, 1)}; a simple random sample would need ${Math.ceil(r.nFpc - 1e-9)}.` : ''} {Number.isFinite(Npop) ? `The population of ${Npop} reduces the requirement from ${Math.ceil(r.n0 - 1e-9)}.` : ''} Divide by your expected response rate to get the number of invitations.</p>
          </Result>
          <Stats rows={[['Before corrections (Cochran n₀)', num(r.n0, 1)], ['After finite population correction', num(r.nFpc, 1)], ['With design effect', r.n]]} />
        </>
      )}
      <About method="probability-sampling" links={[['design-effects-and-design-based-analysis-of-complex-samples', 'Design effects and design-based analysis']]}>
        <p>The margin is z × √(p(1 − p)/n<sub>eff</sub>) × √((N − n)/(N − 1)), where the effective sample size n<sub>eff</sub> = n / design effect and the last term is the finite population correction. The reverse uses Cochran's n₀ = z²p(1 − p)/e², corrects it for the population with n₀/(1 + (n₀ − 1)/N), then multiplies by the design effect. For ±5 points at 95% this gives 385, or 278 from a population of 1,000.</p>
        <p>A margin of error only describes random sampling error in a probability sample. It says nothing about who did not respond, a panel or a convenience sample, or badly worded questions; with an opt-in sample, report it as "would be ± x if this were a random sample", or not at all. For small usability samples, use the completion rate calculator instead.</p>
      </About>
    </>
  );
}

// ── 20. NASA-TLX ──
const TLX_SAMPLE = '70 20 60 40 65 50 5 0 3 2 4 1\n55 10 75 30 60 70 4 0 5 1 3 2\n80 15 50 55 75 45 5 1 2 3 4 0\n45 5 40 20 50 30 4 0 3 2 5 1\n65 25 70 35 70 60 5 0 4 1 3 2';
function NasaTLX() {
  const [mode, setMode] = useState('many'); const [text, setText] = useState(TLX_SAMPLE);
  const [ratings, setRatings] = useState(['70', '20', '60', '40', '65', '50']);
  const [picks, setPicks] = useState(() => S.TLX_PAIRS.map(([a, b]) => ([0, 2, 4].includes(a) ? a : b)));
  let body;
  if (mode === 'one') {
    const R = ratings.map(n_);
    const w = S.TLX_DIMS.map((_, i) => picks.filter((p) => p === i).length);
    const bad = R.some((v) => !(v >= 0 && v <= 100));
    const raw = bad ? NaN : S.tlxRaw(R), wt = bad ? NaN : S.tlxWeighted(R, w);
    body = (
      <>
        <div className="calc-inputs">
          {S.TLX_DIMS.map((d, i) => <Num key={d} label={d} value={ratings[i]} onChange={(v) => setRatings(ratings.map((x, j) => (j === i ? v : x)))} min={0} max={100} step={5} />)}
        </div>
        <div className="calc-inputs">
          {S.TLX_PAIRS.map(([a, b], i) => (
            <Choice key={i} label={`Pair ${i + 1}: which contributed more?`} value={picks[i]} onChange={(v) => setPicks(picks.map((x, j) => (j === i ? v : x)))} options={[[a, S.TLX_DIMS[a]], [b, S.TLX_DIMS[b]]]} />
          ))}
        </div>
        {bad ? <Problem>Each rating must be between 0 and 100.</Problem> : (
          <>
            <Result big={num(wt, 1)} label="Weighted TLX workload (0 to 100)">
              <div className="sum-bars">
                {S.TLX_DIMS.map((d, i) => <div key={d}><span>{d} (weight {w[i]})</span><span className="bar"><i style={{ width: `${R[i]}%` }} /></span><b>{num(R[i], 0)}</b></div>)}
              </div>
              <p>The raw (unweighted) TLX is {num(raw, 1)}. {(() => { const i = w.indexOf(Math.max(...w)); return `This person judged ${S.TLX_DIMS[i].toLowerCase()} the biggest contributor to workload, and rated it ${num(R[i], 0)}.`; })()}</p>
            </Result>
            <Stats rows={[['Weighted TLX', num(wt, 1)], ['Raw TLX', num(raw, 1)], ['Weights (sum 15)', w.join(' · ')]]} />
          </>
        )}
      </>
    );
  } else {
    const rows = S.parseRows(text).filter((r) => (r.length === 6 || r.length === 12) && r.slice(0, 6).every((v) => v >= 0 && v <= 100));
    const people = rows.map((r) => {
      const w = r.length === 12 ? r.slice(6) : null;
      const okW = w && w.reduce((a, b) => a + b, 0) === 15 && w.every((v) => v >= 0);
      return { raw: S.tlxRaw(r.slice(0, 6)), wt: okW ? S.tlxWeighted(r.slice(0, 6), w) : NaN, r: r.slice(0, 6), badW: w && !okW };
    });
    const raws = people.map((p) => p.raw), wts = people.map((p) => p.wt).filter(Number.isFinite);
    const ci = (xs) => (xs.length > 1 ? S.meanCI(S.mean(xs), S.sd(xs), xs.length, 0.95) : null);
    const cr = ci(raws), cw = ci(wts);
    const useW = wts.length === people.length && wts.length > 0;
    const main = useW ? wts : raws, mc = useW ? cw : cr;
    body = (
      <>
        <div className="calc-inputs">
          <Area label="One participant per line: six ratings from 0 to 100, optionally followed by six weights" value={text} onChange={setText} rows={6}
            hint="Order: mental, physical, temporal, performance, effort, frustration. Weights are how often each was picked in the 15 pairs and must add up to 15. Leave weights off for raw TLX." />
        </div>
        {people.some((p) => p.badW) && <Problem>Some weights do not add up to 15, so those participants have a raw score only.</Problem>}
        {people.length === 0 ? <Problem>Enter at least one participant with six ratings between 0 and 100.</Problem> : (
          <>
            <Result big={num(S.mean(main), 1)} label={`Mean ${useW ? 'weighted' : 'raw'} TLX from ${people.length} participant${people.length > 1 ? 's' : ''}`}>
              {mc && <IntervalBar lo={mc.lo} hi={mc.hi} point={S.mean(main)} min={0} max={100} fmt={(v) => num(v, 0)} />}
              <div className="sum-bars">
                {S.TLX_DIMS.map((d, i) => { const m = S.mean(people.map((p) => p.r[i])); return <div key={d}><span>{d}</span><span className="bar"><i style={{ width: `${m}%` }} /></span><b>{num(m, 0)}</b></div>; })}
              </div>
              <p>{(() => { const ms = S.TLX_DIMS.map((_, i) => S.mean(people.map((p) => p.r[i]))); const i = ms.indexOf(Math.max(...ms)); return `${S.TLX_DIMS[i]} is the highest-rated source of workload on average (${num(ms[i], 0)}).`; })()} {mc && `With 95% confidence the mean workload is between ${num(mc.lo, 0)} and ${num(mc.hi, 0)}.`}</p>
            </Result>
            <Stats rows={[cr && ['Raw TLX (95% interval)', `${num(S.mean(raws), 1)} (${num(cr.lo, 1)} – ${num(cr.hi, 1)})`], !cr && ['Raw TLX', num(S.mean(raws), 1)], wts.length > 0 && ['Weighted TLX', `${num(S.mean(wts), 1)}${cw ? ` (${num(cw.lo, 1)} – ${num(cw.hi, 1)})` : ''}`], ['Individual scores', people.map((p) => num(Number.isFinite(p.wt) ? p.wt : p.raw, 0)).join(', ')]]} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="calc-inputs"><Choice label="Enter" value={mode} onChange={setMode} options={[['many', 'Several participants'], ['one', 'One participant, pairwise']]} /></div>
      {body}
      <About method="nasa-tlx">
        <p>Raw TLX is the mean of the six 0 to 100 ratings. The weighted TLX (Hart and Staveland 1988) asks people to choose, in each of the 15 pairs of dimensions, the one that contributed more to their workload; each dimension's weight is the number of times it was chosen (0 to 5), and the score is Σ rating × weight / 15. Performance is rated from "perfect" (0) to "failure" (100), so a high number always means more workload.</p>
        <p>Raw and weighted scores correlate highly, and many teams skip the pairs. TLX scores have no universal pass mark; compare designs or tasks measured the same way, not against another study's numbers.</p>
      </About>
    </>
  );
}

// ── 21. UEQ ──
const UEQ_SAMPLE = '5 4 5 3 4 5 5 3 3 6 4 3 5 4 3 5 4 4 4 5 3 6 3 3 3 2\n5 6 3 2 2 6 5 6 3 3 5 1 6 5 5 6 2 2 3 6 2 5 2 3 3 5\n6 7 3 1 2 6 6 6 1 3 6 2 7 5 5 6 3 2 1 6 1 6 1 2 1 5\n7 7 2 1 1 6 7 6 3 2 6 1 7 6 6 6 1 2 2 7 1 7 1 2 2 6\n4 4 6 3 5 3 4 3 5 6 4 4 5 4 4 4 4 4 4 4 4 4 4 4 4 3\n5 7 2 2 3 6 5 6 2 2 6 2 6 5 6 6 2 3 3 6 1 6 2 3 2 5\n5 6 4 3 4 4 5 5 4 4 5 3 5 4 3 4 4 3 3 5 2 4 3 3 3 4\n6 7 4 1 2 6 6 6 2 4 6 2 7 6 5 5 2 3 2 6 1 5 2 3 3 4\n5 6 3 3 4 5 5 5 4 3 6 3 5 6 4 5 2 4 3 5 3 5 3 3 3 5\n3 4 5 3 4 4 4 4 4 6 4 4 5 5 3 5 4 5 5 3 4 4 4 4 5 3';
const BAND_TAG = { Excellent: 'promote', Good: 'promote', 'Above average': '', 'Below average': 'opp', Bad: 'fix' };
function UEQ() {
  const [text, setText] = useState(UEQ_SAMPLE);
  const all = S.parseRows(text);
  const rows = all.filter((r) => r.length === 26 && r.every((v) => v >= 1 && v <= 7));
  const scales = rows.length ? S.ueqScore(rows) : null;
  const by = scales ? Object.fromEntries(scales.map((s) => [s.name, s.mean])) : {};
  const pq = scales ? (by.Perspicuity + by.Efficiency + by.Dependability) / 3 : NaN, hq = scales ? (by.Stimulation + by.Novelty) / 2 : NaN;
  const att = scales?.[0];
  return (
    <>
      <div className="calc-inputs">
        <Area label="One participant per line: 26 answers from 1 to 7, as ticked" value={text} onChange={setText} rows={8}
          hint="Enter the box ticked, 1 (left term) to 7 (right term), in the standard English item order. Items with the positive term on the left (3, 4, 5, 9, 10, 12, 17, 18, 19, 21, 23, 24, 25) are reversed automatically." />
      </div>
      {all.length > rows.length && <Problem>{all.length - rows.length} line{all.length - rows.length > 1 ? 's' : ''} skipped: each needs 26 answers between 1 and 7.</Problem>}
      {!scales ? <Problem>Add at least one complete set of 26 answers.</Problem> : (
        <>
          <Result big={num(att.mean, 2)} label={`Attractiveness from ${rows.length} participant${rows.length > 1 ? 's' : ''}, on a scale from −3 to +3`} tone={att.mean >= 1.52 ? 'good' : att.mean < 0.7 ? 'bad' : ''}>
            <div className="sum-bars">
              {scales.map((s) => <div key={s.name}><span>{s.name} <span className={`qtag ${BAND_TAG[s.band]}`}>{s.band}</span></span><span className="bar"><i style={{ width: pct((s.mean + 3) / 6, 0) }} /></span><b>{num(s.mean, 2)}</b></div>)}
            </div>
            <p>Against the UEQ benchmark of 452 products, attractiveness is {att.band.toLowerCase()}. {(() => { const w = [...scales].sort((a, b) => a.mean - b.mean)[0]; return `The weakest scale is ${w.name.toLowerCase()} (${num(w.mean, 2)}, ${w.band.toLowerCase()}).`; })()} Means between −0.8 and +0.8 are neutral; above +0.8 is a positive impression.</p>
          </Result>
          <Stats rows={[
            ...scales.map((s) => [s.name, `${num(s.mean, 2)}${Number.isFinite(s.lo) ? ` (${num(s.lo, 2)} to ${num(s.hi, 2)})` : ''}${Number.isFinite(s.alpha) ? ` · α ${num(s.alpha, 2)}` : ''}`]),
            ['Pragmatic quality', num(pq, 2)], ['Hedonic quality', num(hq, 2)],
          ]} />
        </>
      )}
      <About method="ueq-user-experience-questionnaire">
        <p>Each answer is recoded to −3 to +3 (reversing items with the positive term on the left), then averaged per person within each scale: attractiveness (items 1, 12, 14, 16, 24, 25), perspicuity (2, 4, 13, 21), efficiency (9, 20, 22, 23), dependability (8, 11, 17, 19), stimulation (5, 6, 7, 18) and novelty (3, 10, 15, 26). Intervals are t-based; alpha is shown per scale. Pragmatic quality averages perspicuity, efficiency and dependability; hedonic quality averages stimulation and novelty.</p>
        <p>Benchmark bands are from Schrepp, Hinderks and Thomaschewski (2017), 452 product evaluations: excellent is the top 10%, good the next 15%, above and below average the middle quarters, bad the bottom 25%. Later editions of the official UEQ analysis tool use an updated benchmark, so bands may differ slightly. Do not compare with the benchmark if you changed item wording, order or language version beyond the official translations.</p>
      </About>
    </>
  );
}

// ── 22. SEQ ──
function SEQ() {
  const [text, setText] = useState('6 5 7 4 6 5 3 6 7 5 6 4'); const [bench, setBench] = useState('5.5'); const [conf, setConf] = useState(0.95);
  const xs = S.parseNumbers(text).filter((v) => v >= 1 && v <= 7);
  const B = n_(bench);
  const bad = xs.length < 2 || S.sd(xs) === 0 || !Number.isFinite(B);
  const M = xs.length ? S.mean(xs) : NaN, SD = xs.length > 1 ? S.sd(xs) : NaN;
  const ci = bad ? null : S.meanCI(M, SD, xs.length, conf), t = bad ? null : S.oneSampleT(M, SD, xs.length, B);
  const counts = [1, 2, 3, 4, 5, 6, 7].map((v) => xs.filter((x) => x === v).length), maxC = Math.max(1, ...counts);
  return (
    <>
      <div className="calc-inputs">
        <Area label="SEQ ratings for one task, 1 (very difficult) to 7 (very easy)" value={text} onChange={setText} rows={3} />
        <Num label="Benchmark" value={bench} onChange={setBench} step="any" hint="About 5.5 is the average across tasks in Sauro's data" />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Enter at least two ratings between 1 and 7, not all the same.</Problem> : (
        <>
          <Result big={num(M, 2)} label={`Mean SEQ from ${xs.length} ratings`} tone={ci.lo > B ? 'good' : ci.hi < B ? 'bad' : ''}>
            <IntervalBar lo={ci.lo} hi={ci.hi} point={M} min={1} max={7} bench={B} fmt={(v) => num(v, 1)} benchLabel="Average" />
            <p>{ci.lo > B ? `This task is easier than average: the whole interval is above ${num(B, 1)}.` : ci.hi < B ? `This task is harder than average: the whole interval is below ${num(B, 1)}. Look at what made it difficult.` : `The interval (${num(ci.lo, 1)} to ${num(ci.hi, 1)}) includes the average of ${num(B, 1)}, so you cannot yet say it differs from a typical task.`}</p>
          </Result>
          <div className="disc-table" role="table" aria-label="Ratings by scale point">
            {counts.map((c, i) => (
              <div key={i} role="row" className={i + 1 >= 6 ? 'hl' : ''}>
                <span role="cell">{i + 1}{i === 0 ? ' hard' : i === 6 ? ' easy' : ''}</span>
                <span role="cell" className="bar"><i style={{ width: pct(c / maxC, 0) }} /></span>
                <span role="cell">{c}</span>
              </div>
            ))}
          </div>
          <Stats rows={[[`${conf * 100}% interval`, `${num(ci.lo, 2)} – ${num(ci.hi, 2)}`], ['Standard deviation', num(SD, 2)], ['t against benchmark', `t(${t.df}) = ${num(t.t, 2)}`], ['p (two-sided)', pv(t.pTwo)], ['Rated 6 or 7', pct(xs.filter((x) => x >= 6).length / xs.length, 0)]]} />
        </>
      )}
      <About method="single-ease-question-seq-benchmarking">
        <p>The Single Ease Question asks "Overall, how difficult or easy was the task to complete?" on a 7-point scale straight after each task. The calculator gives a t-based interval for the mean and a one-sample t-test against the benchmark. Sauro's database of several hundred tasks puts the average at about 5.5, so a mean reliably below that marks a harder-than-typical task.</p>
        <p>Use the same wording and the 7-point version if you compare with 5.5. SEQ is a post-task rating; it does not replace observing where people struggled, and a difference between two tasks needs the compare-means calculator.</p>
      </About>
    </>
  );
}

// ── 23. AttrakDiff short ──
const ATTRAK_SAMPLE = '6 5 6 5 4 5 3 4 6 5\n5 6 5 6 5 4 4 5 5 6\n7 6 6 6 3 4 3 3 6 6\n4 5 5 4 5 5 4 4 5 4\n6 6 7 6 4 3 4 5 6 6\n5 4 5 5 4 5 3 4 5 5';
function AttrakDiff() {
  const [text, setText] = useState(ATTRAK_SAMPLE); const [coding, setCoding] = useState('17');
  const lo = coding === '17' ? 1 : -3, hi = coding === '17' ? 7 : 3;
  const rows = S.parseRows(text).filter((r) => r.length === 10 && r.every((v) => v >= lo && v <= hi)).map((r) => r.map((v) => (coding === '17' ? v - 4 : v)));
  const sc = (idx) => { const per = rows.map((r) => S.mean(idx.map((i) => r[i]))); const m = S.mean(per); const ci = per.length > 1 && S.sd(per) > 0 ? S.meanCI(m, S.sd(per), per.length, 0.95) : null; return { m, ci }; };
  const ok = rows.length > 0;
  const PQ = ok && sc([0, 1, 2, 3]), HQ = ok && sc([4, 5, 6, 7]), HQI = ok && sc([4, 5]), HQS = ok && sc([6, 7]), ATT = ok && sc([8, 9]);
  const third = (v) => (v >= 1 ? 2 : v <= -1 ? 0 : 1);
  const REGION = [['superfluous', '', ''], ['', 'neutral', 'task-oriented'], ['too self-oriented', 'self-oriented', 'desired']];
  const region = ok ? REGION[third(HQ.m)][third(PQ.m)] : '';
  const W = 420, P = 36, s = (v) => P + ((v + 3) / 6) * (W - 2 * P), cell = (W - 2 * P) / 3;
  const fill = (row, col) => (row === 2 && col === 2 ? 'promote' : row === 0 && col === 0 ? 'fix' : 'ok');
  return (
    <>
      <div className="calc-inputs">
        <Area label="One participant per line: 10 answers in order PQ1–PQ4, HQ1–HQ4, ATT1–ATT2" value={text} onChange={setText} rows={6}
          hint="Enter each item so that higher means the positive word (reverse items printed with the positive word on the left first). HQ1–HQ2 are identity items, HQ3–HQ4 stimulation items; ATT is beauty and goodness." />
        <Choice label="Answers coded" value={coding} onChange={setCoding} options={[['17', '1 to 7'], ['33', '−3 to +3']]} />
      </div>
      {!ok ? <Problem>Add at least one line of ten answers within the chosen coding.</Problem> : (
        <>
          <div className="exp-wrap">
            <svg viewBox={`0 0 ${W} ${W}`} className="exp-plot" role="img" aria-label="AttrakDiff portfolio: pragmatic against hedonic quality">
              {[0, 1, 2].map((row) => [0, 1, 2].map((col) => <rect key={`${row}${col}`} x={P + col * cell} y={P + (2 - row) * cell} width={cell} height={cell} className={`q ${fill(row, col)}`} />))}
              {[0, 1, 2].map((row) => [0, 1, 2].map((col) => REGION[row][col] && <text key={`t${row}${col}`} x={P + col * cell + cell / 2} y={P + (2 - row) * cell + 16} className="ql" textAnchor="middle">{REGION[row][col]}</text>))}
              <circle cx={s(PQ.m)} cy={W - s(HQ.m)} r="7" className="dot" />
              <text x={W / 2} y={W - 6} className="ax" textAnchor="middle">Pragmatic quality →</text>
              <text x={12} y={W / 2} className="ax" textAnchor="middle" transform={`rotate(-90 12 ${W / 2})`}>Hedonic quality →</text>
            </svg>
            <Result big={region ? region[0].toUpperCase() + region.slice(1) : 'Between regions'} label={`Portfolio position from ${rows.length} participant${rows.length > 1 ? 's' : ''}`} tone={region === 'desired' ? 'good' : region === 'superfluous' ? 'bad' : ''}>
              <p>Pragmatic quality is {num(PQ.m, 2)} and hedonic quality {num(HQ.m, 2)}, on a scale from −3 to +3. {PQ.m - HQ.m > 0.5 ? 'People see it as useful and usable more than as stimulating or expressive.' : HQ.m - PQ.m > 0.5 ? 'People find it stimulating or expressive more than usable.' : 'Pragmatic and hedonic qualities are about balanced.'} Attractiveness is {num(ATT.m, 2)}.</p>
            </Result>
          </div>
          <Stats rows={[
            ['Pragmatic quality (PQ)', `${num(PQ.m, 2)}${PQ.ci ? ` (${num(PQ.ci.lo, 2)} to ${num(PQ.ci.hi, 2)})` : ''}`],
            ['Hedonic quality (HQ)', `${num(HQ.m, 2)}${HQ.ci ? ` (${num(HQ.ci.lo, 2)} to ${num(HQ.ci.hi, 2)})` : ''}`],
            ['HQ identity', num(HQI.m, 2)], ['HQ stimulation', num(HQS.m, 2)],
            ['Attractiveness (ATT)', `${num(ATT.m, 2)}${ATT.ci ? ` (${num(ATT.ci.lo, 2)} to ${num(ATT.ci.hi, 2)})` : ''}`],
          ]} />
        </>
      )}
      <About method="attrakdiff">
        <p>The ten-item AttrakDiff (Hassenzahl and Monk 2010) has four pragmatic items, four hedonic items (two identity, two stimulation) and two attractiveness items. Answers are recoded to −3 to +3, averaged per person within each scale, and given t-based 95% intervals. The portfolio splits each axis into thirds at ±1 and places the mean pragmatic and hedonic scores in it.</p>
        <p>There is no published benchmark for the short form, so read the scores relative to a competitor or an earlier version measured the same way. The portfolio regions are a reading aid, not a test: check the intervals before saying two products sit in different regions.</p>
      </About>
    </>
  );
}

// ── 24. Effect size ──
function EffectSize() {
  const [mode, setMode] = useState('summary'); const [conf, setConf] = useState(0.95);
  const [m1, setM1] = useState('70'); const [s1, setS1] = useState('18'); const [n1, setN1] = useState('22');
  const [m2, setM2] = useState('80'); const [s2, setS2] = useState('15'); const [n2, setN2] = useState('20');
  const [ra, setRa] = useState('70 65 80 72 68 75 60 77 71 66'); const [rb, setRb] = useState('78 82 74 85 80 79 88 76 81');
  let v = [m1, s1, n1, m2, s2, n2].map(n_);
  if (mode === 'raw') { const a = S.parseNumbers(ra), b = S.parseNumbers(rb); v = [S.mean(a), a.length > 1 ? S.sd(a) : NaN, a.length, S.mean(b), b.length > 1 ? S.sd(b) : NaN, b.length]; }
  const bad = !(v[2] >= 2 && v[5] >= 2 && v[1] > 0 && v[4] > 0 && Number.isFinite(v[0]) && Number.isFinite(v[3]));
  const r = bad ? null : S.effectSize(...v, conf);
  const cl = r ? S.normCdf(r.d / Math.SQRT2) : NaN;
  return (
    <>
      <div className="calc-inputs">
        <Choice label="Data" value={mode} onChange={setMode} options={[['summary', 'Means and SDs'], ['raw', 'Raw scores']]} />
        {mode === 'raw' ? (<>
          <Area label="Design A scores" value={ra} onChange={setRa} rows={2} /><Area label="Design B scores" value={rb} onChange={setRb} rows={2} />
        </>) : (<>
          <Num label="Design A mean" value={m1} onChange={setM1} step="any" /><Num label="Design A SD" value={s1} onChange={setS1} step="any" min={0} /><Num label="Design A n" value={n1} onChange={setN1} min={2} />
          <Num label="Design B mean" value={m2} onChange={setM2} step="any" /><Num label="Design B SD" value={s2} onChange={setS2} step="any" min={0} /><Num label="Design B n" value={n2} onChange={setN2} min={2} />
        </>)}
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Each group needs at least two people and a standard deviation above zero.</Problem> : (
        <>
          <Result big={`g = ${num(r.g, 2)}`} label={`Hedges' g, ${conf * 100}% interval ${num(r.gLo, 2)} to ${num(r.gHi, 2)}`} tone={r.gLo > 0 || r.gHi < 0 ? 'good' : ''}>
            <IntervalBar lo={r.gLo} hi={r.gHi} point={r.g} min={Math.min(-1, r.gLo * 1.2)} max={Math.max(1, r.gHi * 1.2)} bench={0} fmt={(x) => num(x, 1)} benchLabel="No difference" />
            <p>Design B is {num(Math.abs(r.g), 2)} standard deviations {r.g >= 0 ? 'higher' : 'lower'} than design A, a {S.effectLabel(r.g)} effect by Cohen's rules of thumb. Put another way, a randomly chosen person from B scores higher than one from A about {pct(cl, 0)} of the time. {r.gLo > 0 || r.gHi < 0 ? 'The interval excludes zero.' : 'The interval includes zero, so the direction is not settled.'}</p>
          </Result>
          <Stats rows={[["Cohen's d", `${num(r.d, 3)} (${num(r.dLo, 2)} to ${num(r.dHi, 2)})`], ["Hedges' g (small-sample corrected)", `${num(r.g, 3)} (${num(r.gLo, 2)} to ${num(r.gHi, 2)})`], ['Pooled SD', num(r.sp, 2)], ['Difference (B − A)', num(v[3] - v[0], 2)], ['Probability of superiority', pct(cl)]]} />
        </>
      )}
      <About method="effect-size-calculation">
        <p>Cohen's d is the difference in means divided by the pooled standard deviation, √(((n<sub>A</sub> − 1)s<sub>A</sub>² + (n<sub>B</sub> − 1)s<sub>B</sub>²)/(n<sub>A</sub> + n<sub>B</sub> − 2)). Hedges' g multiplies d by 1 − 3/(4(n<sub>A</sub> + n<sub>B</sub>) − 9) to remove its upward bias in small samples. Intervals use the Hedges and Olkin standard error √((n<sub>A</sub> + n<sub>B</sub>)/(n<sub>A</sub>n<sub>B</sub>) + g²/(2(n<sub>A</sub> + n<sub>B</sub>))). The probability of superiority is Φ(d/√2), assuming normal data with equal spread.</p>
        <p>Small, medium and large (0.2, 0.5, 0.8) are Cohen's generic labels, not judgements of importance: a 0.2 effect on checkout completion can matter more than a 0.8 effect on a rarely used setting. For the same people in both designs, use the paired comparison instead; for very skewed data such as task times, compute the effect on log times.</p>
      </About>
    </>
  );
}

// ── 25. Nonparametric comparison ──
function Nonparametric() {
  const [design, setDesign] = useState('between'); const [conf, setConf] = useState(0.95);
  const [a, setA] = useState('3 4 2 5 3 4 3 2 4 3 5 2'); const [b, setB] = useState('5 4 6 5 7 4 5 6 5 6 4');
  const [pairs, setPairs] = useState('4 5\n3 5\n5 6\n4 4\n2 4\n5 7\n3 4\n4 6\n6 6\n3 5\n4 5\n5 4');
  const sig = (p) => p < 1 - conf;
  let body;
  if (design === 'between') {
    const A = S.parseNumbers(a), B = S.parseNumbers(b);
    const bad = A.length < 2 || B.length < 2;
    const r = bad ? null : S.mannWhitney(A, B);
    body = (
      <>
        <div className="calc-inputs"><Area label="Design A values" value={a} onChange={setA} rows={2} /><Area label="Design B values" value={b} onChange={setB} rows={2} /><Conf value={conf} onChange={setConf} /></div>
        {bad ? <Problem>Enter at least two values in each group.</Problem> : (
          <>
            {(r.n1 < 8 || r.n2 < 8) && <Problem>With fewer than about eight per group the normal approximation is rough; treat the p-value as a guide only.</Problem>}
            <Result big={`p = ${pv(r.p)}`} label="Mann-Whitney U test (normal approximation)" tone={sig(r.p) ? 'good' : ''}>
              <p>The typical value is {num(r.med1, 1)} for A and {num(r.med2, 1)} for B. {sig(r.p) ? `B's values tend to be ${r.z < 0 ? 'higher' : 'lower'} than A's, and the difference is statistically significant at the ${conf * 100}% level.` : `The difference in ranks is not statistically significant at the ${conf * 100}% level.`} The effect size r = {num(Math.abs(r.r), 2)} is {Math.abs(r.r) >= 0.5 ? 'large' : Math.abs(r.r) >= 0.3 ? 'medium' : Math.abs(r.r) >= 0.1 ? 'small' : 'negligible'}.</p>
            </Result>
            <Stats rows={[['U (A)', num(r.U1, 1)], ['U (B)', num(r.U2, 1)], ['z (tie and continuity corrected)', num(r.z, 3)], ['p (two-sided)', pv(r.p)], ['Effect size r = |z|/√N', num(Math.abs(r.r), 3)], ['Rank-biserial correlation (B over A)', num(-r.rankBiserial, 3)], ['Medians', `A ${num(r.med1, 2)} · B ${num(r.med2, 2)}`]]} />
          </>
        )}
      </>
    );
  } else {
    const rows = S.parseRows(pairs).filter((p) => p.length === 2);
    const diffs = rows.map(([x, y]) => +(y - x).toFixed(10));
    const r = rows.length >= 2 ? S.wilcoxonSigned(diffs) : null;
    const bad = !r || r.n < 2;
    body = (
      <>
        <div className="calc-inputs"><Area label="One participant per line: value on A, then value on B" value={pairs} onChange={setPairs} rows={6} /><Conf value={conf} onChange={setConf} /></div>
        {bad ? <Problem>Enter at least two pairs whose values differ.</Problem> : (
          <>
            {r.n < 10 && <Problem>With fewer than about ten non-zero differences the normal approximation is rough; treat the p-value as a guide only.</Problem>}
            <Result big={`p = ${pv(r.p)}`} label="Wilcoxon signed-rank test (normal approximation)" tone={sig(r.p) ? 'good' : ''}>
              <p>The median change from A to B is {num(r.medDiff, 2)}. {sig(r.p) ? `Values on B are reliably ${r.z > 0 ? 'higher' : 'lower'} than on A at the ${conf * 100}% level.` : `The change is not statistically significant at the ${conf * 100}% level.`} {r.zeros > 0 && `${r.zeros} participant${r.zeros > 1 ? 's' : ''} with no difference ${r.zeros > 1 ? 'were' : 'was'} left out, as Wilcoxon's method requires.`} The effect size r = {num(Math.abs(r.r), 2)}.</p>
            </Result>
            <Stats rows={[['W+ (B higher)', num(r.Wp, 1)], ['W− (A higher)', num(r.Wm, 1)], ['Pairs used', `${r.n} of ${rows.length}`], ['z (tie and continuity corrected)', num(r.z, 3)], ['p (two-sided)', pv(r.p)], ['Effect size r = |z|/√n', num(Math.abs(r.r), 3)]]} />
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="calc-inputs"><Choice label="Who tried each design?" value={design} onChange={setDesign} options={[['between', 'Different people'], ['within', 'The same people']]} /></div>
      {body}
      <About method={design === 'between' ? 'mann-whitney-u-test' : 'sign-test-wilcoxon-signed-rank-and-friedman-tests'}>
        {design === 'between'
          ? <p>Mann-Whitney ranks all values together. U for A is its rank sum minus n<sub>A</sub>(n<sub>A</sub> + 1)/2. Under no difference U has mean n<sub>A</sub>n<sub>B</sub>/2 and variance n<sub>A</sub>n<sub>B</sub>/12 × ((N + 1) − Σ(t³ − t)/(N(N − 1))), where t counts tied values; z includes a 0.5 continuity correction. Results match scipy's mannwhitneyu with the asymptotic method.</p>
          : <p>Wilcoxon drops zero differences, ranks the absolute differences and sums the ranks of the positive ones (W+). Under no difference W+ has mean n(n + 1)/4 and variance n(n + 1)(2n + 1)/24 − Σ(t³ − t)/48; z includes a 0.5 continuity correction. Results match scipy's wilcoxon with the approximate method and correction.</p>}
        <p>Use these tests for ordinal ratings or skewed data when the t-test's assumptions look shaky, or as a check on it. They test whether values tend to be higher in one condition, not whether means differ, and they lose some power with normal data. For very small samples an exact test is better than this approximation.</p>
      </About>
    </>
  );
}

// ── 26. Bayesian A/B ──
function BayesAB() {
  const [xa, setXa] = useState('40'); const [na, setNa] = useState('1000'); const [xb, setXb] = useState('55'); const [nb, setNb] = useState('1000');
  const [thr, setThr] = useState('0.1'); const [conf, setConf] = useState(0.95);
  const XA = int(xa), NA = int(na), XB = int(xb), NB = int(nb), T = n_(thr) / 100;
  const bad = !(NA > 0 && NB > 0 && XA >= 0 && XB >= 0 && XA <= NA && XB <= NB && T >= 0);
  const r = useMemo(() => (bad ? null : S.bayesAB(XA, NA, XB, NB, conf)), [XA, NA, XB, NB, conf, bad]);
  const pick = r && (r.lossB <= T && r.lossB <= r.lossA ? 'B' : r.lossA <= T ? 'A' : null);
  const pts = (v) => `${num(v * 100, 3)} pts`;
  return (
    <>
      <div className="calc-inputs">
        <Num label="A conversions" value={xa} onChange={setXa} min={0} /><Num label="A visitors" value={na} onChange={setNa} min={1} />
        <Num label="B conversions" value={xb} onChange={setXb} min={0} /><Num label="B visitors" value={nb} onChange={setNb} min={1} />
        <Num label="Loss you can accept" value={thr} onChange={setThr} min={0} step="any" suffix="pts" hint="The conversion rate you are willing to give up if you pick the wrong version, in percentage points" />
        <Conf value={conf} onChange={setConf} />
      </div>
      {bad ? <Problem>Conversions must be between 0 and the number of visitors, and the acceptable loss zero or more.</Problem> : (
        <>
          <Result big={pct(r.pBbeatsA, 1)} label="Probability that B has the higher conversion rate" tone={pick ? 'good' : ''}>
            <IntervalBar lo={r.ciB[0]} hi={r.ciB[1]} point={r.mB} min={0} max={Math.min(1, Math.max(r.ciA[1], r.ciB[1]) * 1.5)} bench={r.mA} benchLabel="A" fmt={(v) => pct(v, 1)} />
            <p>{pick ? `Choose ${pick}. If ${pick} is in fact the worse version, you expect to give up only ${pts(pick === 'B' ? r.lossB : r.lossA)} of conversion, within the ${pts(T)} you said you can accept.` : `Keep the test running. Picking B now risks ${pts(r.lossB)} on average and picking A risks ${pts(r.lossA)}, both above the ${pts(T)} you can accept.`} The bar shows B's {conf * 100}% credible interval against A's posterior mean.</p>
          </Result>
          <Stats rows={[
            ['A posterior mean', `${pct(r.mA, 2)} (${pct(r.ciA[0], 2)} – ${pct(r.ciA[1], 2)})`],
            ['B posterior mean', `${pct(r.mB, 2)} (${pct(r.ciB[0], 2)} – ${pct(r.ciB[1], 2)})`],
            ['P(B > A)', pct(r.pBbeatsA, 2)],
            ['Expected loss if you choose B', pts(r.lossB)],
            ['Expected loss if you choose A', pts(r.lossA)],
            ['Posteriors', `A Beta(${r.aA}, ${r.bA}) · B Beta(${r.aB}, ${r.bB})`],
          ]} />
        </>
      )}
      <About method="bayesian-a-b-testing-with-expected-loss">
        <p>With a uniform Beta(1, 1) prior, each version's conversion rate has a Beta(1 + conversions, 1 + non-conversions) posterior. P(B &gt; A) uses Evan Miller's exact sum; expected losses are integrated numerically (Simpson's rule over A's posterior): choosing B loses E[max(p<sub>A</sub> − p<sub>B</sub>, 0)], choosing A loses E[max(p<sub>B</sub> − p<sub>A</sub>, 0)]. The rule is to stop when the version with the smaller expected loss is below the loss you can accept (Stucchio 2015). Intervals are equal-tailed credible intervals.</p>
        <p>Expected loss keeps you from agonising over differences too small to matter, but it does not control false positives the way a fixed-sample test does. Set the acceptable loss before you start, check for sample ratio mismatch and novelty effects, and do not use it for metrics that are not yes/no conversions.</p>
      </About>
    </>
  );
}

// ── 27. Sequential test planner ──
function SPRT() {
  const [p0, setP0] = useState('10'); const [p1, setP1] = useState('15'); const [alpha, setAlpha] = useState(0.05); const [beta, setBeta] = useState(0.2);
  const [s, setS] = useState('20'); const [n, setN] = useState('100');
  const P0 = n_(p0) / 100, P1 = n_(p1) / 100, X = int(s), N = int(n);
  const bad = !(P0 > 0 && P1 < 1 && P1 > P0 && X >= 0 && N >= 0 && X <= N);
  const r = bad ? null : S.sprt(P0, P1, alpha, beta, X, N);
  const marks = r ? [...new Set([25, 50, 100, 200, 400, 800, N].filter((t) => t > 0))].sort((a, b) => a - b) : [];
  const verdict = r && (r.decision === 'h1' ? `Stop: the rate is at least ${pct(P1, 0)}` : r.decision === 'h0' ? `Stop: no lift over ${pct(P0, 0)}` : 'Keep going');
  return (
    <>
      <div className="calc-inputs">
        <Num label="Baseline rate (H0)" value={p0} onChange={setP0} min={0.1} max={99} step="any" suffix="%" />
        <Num label="Rate worth detecting (H1)" value={p1} onChange={setP1} min={0.1} max={99} step="any" suffix="%" />
        <Choice label="False positive risk (α)" value={alpha} onChange={setAlpha} options={[[0.01, '1%'], [0.05, '5%'], [0.1, '10%']]} />
        <Choice label="False negative risk (β)" value={beta} onChange={setBeta} options={[[0.05, '5%'], [0.1, '10%'], [0.2, '20%']]} />
        <Num label="Conversions so far" value={s} onChange={setS} min={0} /><Num label="Trials so far" value={n} onChange={setN} min={0} />
      </div>
      {bad ? <Problem>The rate worth detecting must be above the baseline, both between 0% and 100%, and conversions between 0 and the trials.</Problem> : (
        <>
          <Result big={verdict} label={`Wald SPRT after ${N} trials, log-likelihood ratio ${num(r.llr, 2)}`} tone={r.decision === 'h1' ? 'good' : r.decision === 'h0' ? 'bad' : ''}>
            <p>{r.decision === 'continue' ? `After ${N} trials, stop and accept the lift once conversions reach ${Math.ceil(r.upper(N) - 1e-9)}, or stop for no lift if they are ${Math.floor(r.lower(N) + 1e-9)} or fewer. You have ${X}.` : r.decision === 'h1' ? `${X} conversions in ${N} trials crosses the upper boundary of ${num(r.upper(N), 1)}, so the evidence favours ${pct(P1, 0)} over ${pct(P0, 0)} with the error rates you set.` : `${X} conversions in ${N} trials is at or below the lower boundary of ${num(r.lower(N), 1)}, so the evidence favours the baseline of ${pct(P0, 0)}.`} On average the test stops after about {Math.ceil(r.asn0)} trials if there is no lift and {Math.ceil(r.asn1)} if there is.</p>
          </Result>
          <Stats rows={[
            ...marks.map((t) => [`After ${t} trials${t === N ? ' (now)' : ''}`, `stop for no lift at ≤ ${r.lower(t) < 0 ? '—' : Math.floor(r.lower(t) + 1e-9)} · stop for lift at ≥ ${Math.ceil(r.upper(t) - 1e-9) > t ? '—' : Math.ceil(r.upper(t) - 1e-9)}`]),
            ['Boundaries on log scale', `${num(r.B, 3)} and ${num(r.A, 3)}`],
            ['Boundary lines (conversions)', `${num(r.hLo, 2)} + ${num(r.slope, 4)}n and ${num(r.hUp, 2)} + ${num(r.slope, 4)}n`],
          ]} />
        </>
      )}
      <About method="sequential-testing-sprt-and-group-sequential-designs">
        <p>Wald's sequential probability ratio test compares H0: p = p<sub>0</sub> with H1: p = p<sub>1</sub> after every trial. The log-likelihood ratio is s·ln(p<sub>1</sub>/p<sub>0</sub>) + (n − s)·ln((1 − p<sub>1</sub>)/(1 − p<sub>0</sub>)). Stop for H1 when it reaches ln((1 − β)/α) and for H0 when it falls to ln(β/(1 − α)). In conversions these are two parallel lines in the number of trials. Average sample numbers use Wald's approximations.</p>
        <p>Unlike a fixed-sample test, you may look after every visitor without inflating the false positive rate, as long as you stop only at a boundary. This planner tests one conversion rate against a known baseline; for a randomised two-arm A/B test, use a two-sample sequential design or the Bayesian calculator, and do not change p<sub>0</sub>, p<sub>1</sub>, α or β once the test has started.</p>
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
  { group: 'Measure', id: 'umux-lite', name: 'UMUX and UMUX-Lite scorer', blurb: 'Score the four-item UMUX or two-item UMUX-Lite on the SUS scale.', C: UMUXLite },
  { group: 'Measure', id: 'sum', name: 'Single Usability Metric (SUM)', blurb: 'Combine completion, time, satisfaction and errors into one task score.', C: SUM },
  { group: 'Measure', id: 'top-box', name: 'Top-box and agreement target', blurb: 'Did enough people agree? Top-box share against a target, with the mean for comparison.', C: TopBox },
  { group: 'Measure', id: 'nps', name: 'Net Promoter Score', blurb: 'NPS with a proper confidence interval.', C: NPS },
  { group: 'Questionnaires', id: 'seq', name: 'SEQ scorer', blurb: 'Single Ease Question mean with an interval, against the average of about 5.5.', C: SEQ },
  { group: 'Questionnaires', id: 'nasa-tlx', name: 'NASA-TLX scorer', blurb: 'Raw and weighted workload scores, with the 15 pairwise comparisons.', C: NasaTLX },
  { group: 'Questionnaires', id: 'ueq', name: 'UEQ scorer', blurb: 'Six User Experience Questionnaire scales, against the published benchmark.', C: UEQ },
  { group: 'Questionnaires', id: 'attrakdiff', name: 'AttrakDiff (short) scorer', blurb: 'Pragmatic, hedonic and attractiveness scores on the AttrakDiff portfolio.', C: AttrakDiff },
  { group: 'Compare', id: 'compare-rates', name: 'Compare two completion rates', blurb: 'N−1 two-proportion test or McNemar for the same people.', C: CompareRates },
  { group: 'Compare', id: 'compare-means', name: 'Compare two means', blurb: 'Welch or paired t-test for ratings and task times.', C: CompareMeans },
  { group: 'Compare', id: 'rate-benchmark', name: 'Completion rate vs benchmark', blurb: 'Did more than the target share of users succeed?', C: RateBenchmark },
  { group: 'Compare', id: 'correlation', name: 'Correlation', blurb: 'How strongly two measures move together, with an interval.', C: Correlation },
  { group: 'Experiments', id: 'effect-size', name: 'Effect size', blurb: "Cohen's d and Hedges' g with an interval: how big the difference is.", C: EffectSize },
  { group: 'Experiments', id: 'nonparametric', name: 'Nonparametric comparison', blurb: 'Mann-Whitney U or Wilcoxon signed-rank for ratings and skewed data.', C: Nonparametric },
  { group: 'Experiments', id: 'bayes-ab', name: 'Bayesian A/B test', blurb: 'Chance that B beats A and the expected loss of each choice.', C: BayesAB },
  { group: 'Experiments', id: 'sprt', name: 'Sequential test planner', blurb: 'Wald SPRT boundaries: stop or continue as conversions come in.', C: SPRT },
  { group: 'Survey quality', id: 'reliability', name: 'Scale reliability', blurb: "Cronbach's alpha with an interval, item diagnostics and McDonald's omega.", C: Reliability },
  { group: 'Survey quality', id: 'margin-of-error', name: 'Survey margin of error', blurb: 'Margin for a proportion, or the sample needed, with population size and design effect.', C: MarginOfError },
  { group: 'Qualitative rigour', id: 'intercoder', name: 'Inter-coder agreement', blurb: "Percent agreement, Cohen's kappa and Krippendorff's alpha for coded data.", C: InterCoder },
  { group: 'Qualitative rigour', id: 'saturation', name: 'Saturation and coverage', blurb: 'Code accumulation, Good-Turing coverage and an estimate of codes still to find.', C: Saturation },
  { group: 'Discover', id: 'expectation', name: 'Expectation vs experience', blurb: 'Map tasks by expected and experienced ease to see what to fix first.', C: Expectation },
  { group: 'Discover', id: 'discovery', name: 'Problems left to find', blurb: 'Estimate how many usability problems your test missed.', C: Discovery },
];

export default function Calculators() {
  const { calc } = useParams();
  const current = CALCS.find((c) => c.id === calc);
  const groups = [...new Set(CALCS.map((c) => c.group))];
  const go = useNavigate();

  return (
    <>
      <section className="hero compact">
        <div className="wrap">
          <p className="eyebrow">UX calculators</p>
          <h1 className="h1">{current ? current.name : 'Do the maths properly.'}</h1>
          <p className="lede">
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
