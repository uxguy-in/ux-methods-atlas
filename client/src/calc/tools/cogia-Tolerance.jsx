import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as T from './cogia-tolerance.js';
import { fmt, sig, pct, rng } from './cogia-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import './cogia.css';

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
const fin = (x) => Number.isFinite(x);
const show = (x) => (fin(x) ? sig(x, 4) : x > 0 ? '+∞' : '−∞');

// Data as dots (jittered), with the normal and distribution-free limits and the mean.
function LimitsPlot({ r, unit }) {
  const W = 640, H = 170, L = 16, R = 16, T = 30, B = 34;
  const lims = [r.lo, r.hi, r.np.ok ? r.np.lo : NaN, r.np.ok ? r.np.hi : NaN].filter(fin);
  let a = Math.min(r.min, ...lims), b = Math.max(r.max, ...lims); const pad = (b - a) * 0.06 || 1; a -= pad; b += pad;
  const sx = (v) => L + ((v - a) / (b - a)) * (W - L - R);
  const jr = rng(5);
  const ticks = (() => { const raw = (b - a) / 6, mag = 10 ** Math.floor(Math.log10(raw)), st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw); const out = []; for (let v = Math.ceil(a / st) * st; v <= b; v += st) out.push(+v.toPrecision(10)); return out; })();
  const vline = (v, cls, label, y) => fin(v) && <g key={`${cls}${label}`}><line x1={sx(v)} x2={sx(v)} y1={T - 6} y2={H - B} className={`lim ${cls}`} />{label && <text x={sx(v)} y={y} textAnchor="middle" className="sub halo">{label}</text>}</g>;
  return (
    <figure className="ea-fig">
      <div className="cg-wrap cg-fit"><svg viewBox={`0 0 ${W} ${H}`} className="cg-plot" role="img" aria-label="Data with tolerance limits">
        {ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 16} className="ax" textAnchor="middle">{sig(v, 4)}</text></g>)}
        {r.pc.ok && <rect x={sx(r.pc.lo)} y={T} width={Math.max(1, sx(r.pc.hi) - sx(r.pc.lo))} height={H - B - T} className="band" style={{ fill: 'var(--c2)' }} />}
        {r.sorted.map((v, i) => <circle key={i} cx={sx(v)} cy={T + 14 + jr() * (H - B - T - 28)} r={3.6} className="dot" />)}
        {vline(r.gm, 'm', r.log ? 'geo. mean' : 'mean', T - 10)}
        {vline(r.lo, 'n', 'normal', 14)}{vline(r.hi, 'n', 'normal', 14)}
        {r.np.ok && vline(r.np.lo, 'np', 'distribution-free', H - 4)}{r.np.ok && vline(r.np.hi, 'np', 'distribution-free', H - 4)}
        {unit && <text x={W - R} y={H - B + 30} className="ax" textAnchor="end">{unit}</text>}
      </svg></div>
      <ul className="cg-legend">
        <li><i className="ln" style={{ background: 'var(--c1)' }} />Normal tolerance limits</li>
        <li><i className="ln" style={{ background: 'var(--c3)' }} />Distribution-free limits</li>
        {r.pc.ok && <li><i style={{ background: 'var(--c2)', opacity: 0.4, borderRadius: 0 }} />{pct(r.qconf)} interval for the {pct(r.q)} percentile</li>}
      </ul>
    </figure>
  );
}

function CogiaTolerance() {
  const [text, setText] = useState(T.EXAMPLE);
  const [unit, setUnit] = useState('seconds');
  const [p, setP] = useState('0.90');
  const [g, setG] = useState('0.95');
  const [side, setSide] = useState('upper');
  const [method, setMethod] = useState('howe');
  const [log, setLog] = useState(true);
  const [q, setQ] = useState('0.90');
  const [qc, setQc] = useState('0.95');
  const [zx, setZx] = useState('0');
  const [zn, setZn] = useState('40');
  const [zc, setZc] = useState('0.95');
  const [cnt, setCnt] = useState('25');
  const load = () => { setText(T.EXAMPLE); setUnit('seconds'); setP('0.90'); setG('0.95'); setSide('upper'); setMethod('howe'); setLog(true); setQ('0.90'); setQc('0.95'); setZx('0'); setZn('40'); setZc('0.95'); setCnt('25'); };

  const parsed = useMemo(() => T.parseValues(text), [text]);
  const P = num(p), G = num(g), Q = num(q), QC = num(qc);
  const bad = !(P > 0 && P < 1) ? 'Coverage must be between 0 and 1 (for example 0.90).' : !(G > 0 && G < 1) ? 'Confidence must be between 0 and 1 (for example 0.95).' : !(Q > 0 && Q < 1) ? 'The percentile must be between 0 and 1.' : !(QC > 0 && QC < 1) ? 'The percentile confidence must be between 0 and 1.' : null;
  const r = useMemo(() => (bad ? null : T.analyse(parsed.values, { p: P, g: G, side, method, log, q: Q, qconf: QC })), [parsed, P, G, side, method, log, Q, QC, bad]);
  const ok = r && !r.error;
  const kAll = useMemo(() => (!ok ? [] : side === 'two' ? [['Howe (1969)', T.kHowe(r.n, P, G)], ['Guenther (1977)', T.kGuenther(r.n, P, G)], ['Exact (Odeh and Owen 1980)', T.kExact(r.n, P, G)]] : [['Exact (noncentral t)', r.k]]), [ok, r, side, P, G]);

  const Zx = Math.round(num(zx)), Zn = Math.round(num(zn)), ZC = num(zc), C = Math.round(num(cnt));
  const zBad = !(Zn >= 1) ? 'Enter the number of trials (1 or more).' : !(Zx >= 0 && Zx <= Zn) ? 'Events must be between 0 and the number of trials.' : !(ZC > 0 && ZC < 1) ? 'Confidence must be between 0 and 1.' : null;
  const z = zBad ? null : T.zeroEvents(Zx, Zn, ZC);
  const cr = C >= 0 ? T.countRule(C, 0.95) : null;
  const u = unit ? ` ${unit}` : '';

  return (
    <div className="cg-root">
      <LoadExample onClick={load} />
      <Area label="Values (one per line, or separated by commas or spaces)" value={text} onChange={setText} rows={5} hint="For example task times, error counts per session or ratings from one group." />
      <div className="calc-inputs">
        <label className="calc-field"><span>Unit</span><input className="ea-mini" value={unit} onChange={(e) => setUnit(e.target.value.slice(0, 16))} /></label>
        <Num label="Coverage p" value={p} onChange={setP} step={0.01} min={0.5} max={0.999} hint="Share of individuals the interval should hold" />
        <Num label="Confidence" value={g} onChange={setG} step={0.01} min={0.5} max={0.999} />
        <Choice label="Interval" value={side} onChange={setSide} options={[['two', 'Two-sided'], ['upper', 'Upper limit'], ['lower', 'Lower limit']]} />
        {side === 'two' && <Choice label="Normal k factor" value={method} onChange={setMethod} options={[['howe', 'Howe'], ['guenther', 'Guenther'], ['exact', 'Exact']]} />}
        <label className="tl-check"><input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log scale (lognormal; good for task times)</label>
      </div>
      {parsed.bad.length > 0 && <Problem>Ignored {parsed.bad.length} entr{parsed.bad.length === 1 ? 'y' : 'ies'} that are not numbers: {parsed.bad.slice(0, 5).join(', ')}.</Problem>}
      {bad && <Problem>{bad}</Problem>}
      {r?.error && <Problem>{r.error}</Problem>}
      {ok && (
        <>
          <Result big={side === 'two' ? `${show(r.lo)} – ${show(r.hi)}${u}` : side === 'upper' ? `≤ ${show(r.hi)}${u}` : `≥ ${show(r.lo)}${u}`} label={`Normal ${side === 'two' ? 'two-sided' : 'one-sided'} tolerance interval: ${side === 'two' ? `the middle ${pct(P)}` : `at least ${pct(P)}`} of individuals, with ${pct(G)} confidence${log ? ' (computed on log values)' : ''}.`}>
            <Stats rows={[
              ['Sample', `n = ${r.n}, ${r.log ? 'geometric mean' : 'mean'} ${sig(r.gm, 4)}${u}`],
              [r.log ? 'Mean and SD of log values' : 'Mean and SD', `${fmt(r.mean, 4)} and ${fmt(r.sd, 4)}`],
              ['Tolerance factor k', `${fmt(r.k, 4)} (vs z = ${fmt(r.zp, 3)} if μ and σ were known)`],
              ['Distribution-free limits', r.np.ok ? `${show(r.np.lo)} to ${show(r.np.hi)}${u} (${r.side === 'two' ? `ranks ${r.np.r} and ${r.n - r.np.r + 1}` : `rank ${r.np.j}`}, confidence ${pct(r.np.conf, 1)})` : `Not available: needs n ≥ ${r.np.nNeeded}`],
              ['Skewness (scale used)', fmt(r.skew, 2)],
            ]} />
          </Result>
          <LimitsPlot r={r} unit={unit} />
          <h3 className="clu-h3">Tolerance factor by method</h3>
          <Table label="Tolerance factors" head={['Method', 'k', 'Interval']} rows={kAll.map(([m, k]) => [m, fmt(k, 4), side === 'two' ? `${show(log ? Math.exp(r.mean - k * r.sd) : r.mean - k * r.sd)} to ${show(log ? Math.exp(r.mean + k * r.sd) : r.mean + k * r.sd)}${u}` : side === 'upper' ? `≤ ${show(log ? Math.exp(r.mean + k * r.sd) : r.mean + k * r.sd)}${u}` : `≥ ${show(log ? Math.exp(r.mean - k * r.sd) : r.mean - k * r.sd)}${u}`])} />
          <section className="ea-card">
            <h4>Percentile with a distribution-free confidence interval</h4>
            <div className="calc-inputs">
              <Num label="Percentile q" value={q} onChange={setQ} step={0.05} min={0.01} max={0.99} hint="0.5 = median, 0.9 = 90th percentile" />
              <Num label="Confidence" value={qc} onChange={setQc} step={0.01} min={0.5} max={0.999} />
            </div>
            {r.pc.ok
              ? <p className="cg-note">The {pct(Q)} percentile is <b>{sig(r.pc.est, 4)}{u}</b>. Interval: <b>{sig(r.pc.lo, 4)} to {sig(r.pc.hi, 4)}{u}</b>, the {r.pc.l}th and {r.pc.u}th smallest values; the binomial rule gives it exactly {pct(r.pc.cover, 1)} coverage. No distribution is assumed.</p>
              : <p className="cg-note">With {r.n} values there is no pair of order statistics that brackets the {pct(Q)} percentile with {pct(QC)} confidence. You need at least {r.pc.nNeeded} values.</p>}
          </section>
          <StudySummary {...T.toleranceSummary(r, unit)} />
        </>
      )}
      <section className="ea-card cg-zero">
        <h4>Zero events and quick uncertainty rules</h4>
        <p className="cg-note">For problems that never (or rarely) happened in testing: how high could the true rate still be?</p>
        <div className="calc-inputs">
          <Num label="Events seen" value={zx} onChange={setZx} min={0} />
          <Num label="Trials or participants" value={zn} onChange={setZn} min={1} />
          <Num label="Confidence" value={zc} onChange={setZc} step={0.01} min={0.5} max={0.999} />
        </div>
        {zBad && <Problem>{zBad}</Problem>}
        {z && (
          <>
            <Stats rows={[
              ['Observed rate', `${Zx} of ${Zn} (${pct(z.rate, 1)})`],
              [`Exact one-sided ${pct(ZC)} upper limit`, pct(z.upper1, 2)],
              ['Rule of three (3/n, for 95%)', pct(z.rule3, 2)],
              [`Exact two-sided ${pct(ZC)} interval (Clopper-Pearson)`, `${pct(z.lo2, 2)} to ${pct(z.hi2, 2)}`],
              [`Trials to rule out 1% / 5% with no events`, `${T.nForZero(0.01, ZC)} / ${T.nForZero(0.05, ZC)}`],
            ]} />
            {Zx === 0 && <StudySummary {...T.zeroSummary(z)} />}
          </>
        )}
        <div className="calc-inputs">
          <Num label="A count (for example, mentions of a problem)" value={cnt} onChange={setCnt} min={0} />
        </div>
        {cr && <p className="cg-note">Square-root rule: {C} ± 2√{C} gives about <b>{fmt(cr.lo, 1)} to {fmt(cr.hi, 1)}</b>; the exact Poisson 95% interval is <b>{fmt(cr.exLo, 1)} to {fmt(cr.exHi, 1)}</b>. Repeat the count with a fresh sample and expect it to move by about this much.</p>}
      </section>
      <About method="statistical-tolerance-intervals" links={[['distribution-free-confidence-intervals-for-percentiles', 'Distribution-free confidence intervals for percentiles'], ['quick-uncertainty-rules-of-thumb-square-root-rule-rule-of-three', 'Quick uncertainty rules of thumb'], ['anthropometric-percentile-accommodation-analysis', 'Anthropometric percentile accommodation']]}>
        <p><b>Tolerance interval.</b> An interval x̄ ± k·s that, with confidence γ, holds at least a proportion p of the individuals in the population. Unlike a confidence interval for the mean, it does not shrink to nothing as n grows; it shrinks to μ ± z·σ. With the log scale on, the interval is built on ln(x) and transformed back (a lognormal model, usual for task times).</p>
        <p><b>Two-sided k.</b> Howe (1969): k = z₍₁₊ₚ₎/₂ · √(1 + 1/n) · √(ν / χ²₁₋γ,ν), ν = n − 1. Guenther (1977) multiplies Howe's k by √(1 + (n − 3 − χ²₁₋γ,ν)/(2(n + 1)²)). Exact (Odeh and Owen 1980): the k that solves √(2n/π) ∫₀^∞ P(χ²_ν &gt; ν r(z)²/k²) e^(−nz²/2) dz = γ, where r(z) is the half-width that gives Φ(z + r) − Φ(z − r) = p. <b>One-sided k</b> (exact): k = t′γ(ν, z_p√n)/√n, the γ quantile of the noncentral t distribution.</p>
        <p><b>Distribution-free limits</b> (Wilks 1941). The interval between the r-th smallest and r-th largest values holds at least p of the population with confidence 1 − I_p(n − 2r + 1, 2r) (I the regularised incomplete beta); the tool uses the largest r that reaches γ. A one-sided upper limit is the j-th smallest value with P(Bin(n, p) ≤ j − 1) ≥ γ. With the extremes alone, 95% coverage at 95% confidence needs n = 93 (two-sided) or 59 (one-sided).</p>
        <p><b>Percentile interval</b> (Hahn and Meeker 1991). For the q-th percentile, the ranks l and u are the largest with F(l − 1) ≤ α/2 and the smallest with F(u − 1) ≥ 1 − α/2, F the Bin(n, q) cdf; the exact coverage is F(u − 1) − F(l − 1). The percentile itself is estimated by linear interpolation.</p>
        <p><b>Zero events.</b> With 0 events in n trials, the exact one-sided upper limit is 1 − α^(1/n), close to 3/n for 95% (the rule of three; Hanley and Lippman-Hand 1983). Two-sided limits are Clopper-Pearson. For a count c, c ± 2√c is the square-root rule; the exact Poisson interval uses χ² quantiles: [χ²(α/2, 2c)/2, χ²(1 − α/2, 2c + 2)/2].</p>
        <p><b>Checks.</b> Factors are checked against the toleranceinterval Python package (Howe, Guenther, exact and nonparametric), scipy's noncentral t, Wilks' sample sizes and statsmodels' Clopper-Pearson limits.</p>
        <p><b>When not to use it.</b> Normal limits need data that are roughly normal on the scale used; skewed data with the log scale off, or mixtures of very different users, give misleading limits (use the distribution-free ones, which need larger samples). Tolerance intervals describe individuals: to compare designs on average, use a test of means.</p>
      </About>
    </div>
  );
}

export default CogiaTolerance;
