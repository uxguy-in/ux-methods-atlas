import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as IP from './surveyx-ipa.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, pval, signed } from './surveyx-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About, Choice, Num, n_ } from './ui.jsx';
import { Tabs, QuadrantChart, Dumbbells, ColumnPick, CsvButton } from './surveyx-ui.jsx';

const TAG = { concentrate: 'bad', keep: 'ok', low: 'mute', overkill: 'warn' };
const qTag = (q) => <span className={`sx-tag ${TAG[q]}`}>{IP.QUADS[q][0]}</span>;

function GridTab({ st, set }) {
  const { mode, stated, derived, outcome, method, cross, impAt, perfAt, n } = st;
  const src = useMemo(() => (mode === 'stated' ? IP.parseStated(stated) : IP.deriveImportance(derived, outcome, method)), [mode, stated, derived, outcome, method]);
  const r = useMemo(() => (src.error || src.attrs.length < 2 ? null : IP.ipa(src.attrs, { cross, impAt: n_(impAt), perfAt: n_(perfAt) })), [src, cross, impAt, perfAt]);
  const nResp = mode === 'derived' ? src.n || 0 : Number(n) || 0;
  const dI = mode === 'derived' ? 3 : 2;
  return (
    <>
      <Choice label="Importance" value={mode} onChange={(v) => set({ ...st, mode: v })} options={[['stated', 'Stated (mean ratings)'], ['derived', 'Derived (correlation with an outcome)']]} />
      {mode === 'stated'
        ? <>
          <Area label="One row per attribute: name, mean importance, mean performance" value={stated} onChange={(v) => set({ ...st, stated: v })} rows={7} />
          <div className="sx-inputs"><Num label="Respondents behind the means" value={n} min={0} onChange={(v) => set({ ...st, n: v })} hint="Used only for the confidence rating" /></div>
        </>
        : <>
          <Area label="One row per respondent: a rating column per attribute and an overall outcome column" value={derived} onChange={(v) => set({ ...st, derived: v, outcome: -1 })} rows={7} />
          {!src.error && <div className="sx-inputs">
            <ColumnPick label="Outcome" head={src.head} value={src.outcomeCol} onChange={(v) => set({ ...st, outcome: v })} allowed={(j) => src.nums[j]} />
            <Choice label="Correlation" value={method} onChange={(v) => set({ ...st, method: v })} options={[['pearson', 'Pearson'], ['spearman', 'Spearman']]} />
          </div>}
        </>}
      <div className="sx-inputs">
        <Choice label="Crosshairs at" value={cross} onChange={(v) => set({ ...st, cross: v })} options={[['mean', 'Means'], ['median', 'Medians'], ['custom', 'Custom']]} />
        {cross === 'custom' && <>
          <Num label="Importance line" value={impAt} step={0.1} onChange={(v) => set({ ...st, impAt: v })} />
          <Num label="Performance line" value={perfAt} step={0.1} onChange={(v) => set({ ...st, perfAt: v })} hint="For example the scale midpoint" />
        </>}
      </div>
      {src.error && <Problem>{src.error}</Problem>}
      {!src.error && !r && <Problem>Enter at least two attributes.</Problem>}
      {r && (
        <>
          <Result big={`${r.counts.concentrate} to fix`} label={`attributes in "Concentrate here" out of ${r.attrs.length} (crosshairs at importance ${fmt(r.ci, dI)}, performance ${fmt(r.cp)})`} tone={r.counts.concentrate ? 'bad' : 'good'}>
            <Stats rows={Object.entries(IP.QUADS).map(([k, [name]]) => [name, r.counts[k]])} />
          </Result>
          <QuadrantChart label="Importance-performance grid" points={r.attrs.map((a) => ({ name: a.name, x: a.perf, y: a.imp, q: a.q }))} cx={r.cp} cy={r.ci}
            xLabel={`Performance (${src.perfLabel})`} yLabel={`Importance (${src.impLabel})`} fmtY={(v) => String(+v.toFixed(dI))} fmtX={(v) => String(+v.toFixed(2))}
            quadNames={{ concentrate: 'Concentrate here', keep: 'Keep up the good work', low: 'Low priority', overkill: 'Possible overkill' }} />
          <Table label="Attributes in priority order" num={false} head={mode === 'stated' ? ['#', 'Attribute', 'Importance', 'Performance', 'Gap (I − P)', 'Quadrant'] : ['#', 'Attribute', 'r with outcome (95% CI)', 'p', 'Mean rating', 'Quadrant']}
            rows={r.ranked.map((a, i) => (mode === 'stated'
              ? [i + 1, a.name, fmt(a.imp), fmt(a.perf), signed(a.gap), qTag(a.q)]
              : [i + 1, a.name, `${fmt(a.imp, 3)} (${fmt(a.lo, 2)} to ${fmt(a.hi, 2)})`, pval(a.p), fmt(a.perf), qTag(a.q)]))} />
          <div className="sx-actions"><CsvButton name="importance-performance.csv" rows={[['attribute', 'importance', 'performance', 'quadrant'], ...r.attrs.map((a) => [a.name, a.imp, a.perf, IP.QUADS[a.q][0]])]} /></div>
          <StudySummary {...IP.ipaSummary(r, { n: nResp, derived: mode === 'derived', outcome: src.outcome })} />
        </>
      )}
    </>
  );
}

function KapTab({ text, setText }) {
  const p = useMemo(() => IP.parseKap(text), [text]);
  const rows = useMemo(() => (p.error ? null : IP.kap(p.rows)), [p]);
  return (
    <>
      <Area label="One row per behaviour: name, respondents, know, favour, practise (counts)" value={text} onChange={setText} rows={6} />
      {p.error && <Problem>{p.error}</Problem>}
      {rows && (
        <>
          <Table label="Knowledge, attitude and practice" num={false} head={['Behaviour', 'Know', 'Favour', 'Practise', 'KAP gap (K − P)', 'Biggest loss']}
            rows={rows.map((r) => [r.name, `${pct(r.K.p, 0)} (${pct(r.K.lo, 0)}–${pct(r.K.hi, 0)})`, `${pct(r.A.p, 0)} (${pct(r.A.lo, 0)}–${pct(r.A.hi, 0)})`, `${pct(r.P.p, 0)} (${pct(r.P.lo, 0)}–${pct(r.P.hi, 0)})`, `${fmt(r.kapGap * 100, 0)} pts`, <span key="w" className={`sx-tag ${r.worst.stage === 'practice' ? 'bad' : r.worst.stage === 'attitude' ? 'warn' : 'mute'}`}>{r.worst.stage}: {pct(r.worst.p, 0)}</span>])} />
          <Dumbbells label="Knowledge and practice for each behaviour" aName="Practise" bName="Know" rows={rows.map((r) => ({ name: r.name, a: r.P.p, b: r.K.p, tone: 'promote', right: `${fmt(r.kapGap * 100, 0)} pts` }))} />
          <p className="sx-note">Percentages with Wilson 95% intervals. The biggest loss is the largest of: never heard of it, know but do not favour, favour but do not do.</p>
          <StudySummary {...IP.kapSummary(rows)} />
        </>
      )}
    </>
  );
}

function AwareTab({ text, setText }) {
  const p = useMemo(() => IP.parseAware(text), [text]);
  const rows = useMemo(() => (p.error ? null : IP.awareness(p.rows)), [p]);
  return (
    <>
      <Area label="One row per feature: name, asked about awareness, aware, rated usefulness, useful (top-2-box)" value={text} onChange={setText} rows={6} />
      {p.error && <Problem>{p.error}</Problem>}
      {rows && (
        <>
          <Dumbbells label="Awareness and usefulness for each feature, largest gap first" aName="Aware" bName="Useful (top-2-box)" rows={rows.map((r) => ({ name: r.name, a: r.A.p, b: r.U.p, tone: r.tag, right: `${r.gap >= 0 ? '+' : '−'}${fmt(Math.abs(r.gap) * 100, 0)} pts` }))} />
          <Table label="Awareness-usefulness gap" num={false} head={['Feature', 'Aware', 'Useful', 'Gap (95% CI)', 'Reading']}
            rows={rows.map((r) => [r.name, `${pct(r.A.p, 0)} (${pct(r.A.lo, 0)}–${pct(r.A.hi, 0)})`, `${pct(r.U.p, 0)} (${pct(r.U.lo, 0)}–${pct(r.U.hi, 0)})`, `${signed(r.gap * 100, 0)} pts (${fmt(r.lo * 100, 0)} to ${fmt(r.hi * 100, 0)})`, <span key="t" className={`sx-tag ${r.tag === 'promote' ? 'bad' : r.tag === 'known' ? 'ok' : 'mute'}`}>{r.tag === 'promote' ? 'Promote: useful but unknown' : r.tag === 'known' ? 'Known, less useful' : 'No clear gap'}</span>])} />
          <StudySummary {...IP.awarenessSummary(rows)} />
        </>
      )}
    </>
  );
}

const GRID0 = () => ({ mode: 'stated', stated: EX.EX_STATED, derived: EX.exDerived(), outcome: -1, method: 'pearson', cross: 'mean', impAt: '4', perfAt: '4', n: String(EX.EX_STATED_N) });

// ── Importance-performance and gap analysis ──
function SxImportancePerformance() {
  const [tab, setTab] = useState('grid');
  const [grid, setGrid] = useState(GRID0);
  const [kap, setKap] = useState(EX.EX_KAP);
  const [aware, setAware] = useState(EX.EX_AWARE);
  return (
    <div className="sx-root">
      <LoadExample onClick={() => { setGrid(GRID0()); setKap(EX.EX_KAP); setAware(EX.EX_AWARE); }}>Load example (banking app, security behaviours, email features)</LoadExample>
      <Tabs label="Analysis" value={tab} onChange={setTab} options={[['grid', 'Importance-performance grid'], ['kap', 'KAP gap'], ['aware', 'Awareness-usefulness gap']]} />
      {tab === 'grid' && <GridTab st={grid} set={setGrid} />}
      {tab === 'kap' && <KapTab text={kap} setText={setKap} />}
      {tab === 'aware' && <AwareTab text={aware} setText={setAware} />}
      <About method="importance-performance-analysis" links={[['kap-survey-and-kap-gap-analysis', 'KAP survey and KAP-gap analysis'], ['awareness-usefulness-gap-analysis', 'Awareness-usefulness gap analysis'], ['key-driver-analysis-regression-based', 'Key driver analysis']]}>
        <p><b>Importance-performance grid</b> (Martilla and James 1977). Each attribute is plotted at (performance, importance). Crosshairs sit at the mean or median of the attributes' values (or values you choose, such as the scale midpoint); attributes on a line count as high. Quadrants: Concentrate here (high importance, low performance), Keep up the good work (high, high), Low priority (low, low), Possible overkill (low importance, high performance). The priority list puts "Concentrate here" first, ordered by (importance − importance line) − (performance − performance line).</p>
        <p><b>Derived importance</b> is the Pearson (or Spearman, on mid-ranks) correlation of each attribute's rating with the overall outcome, with a Fisher-z 95% interval: tanh(atanh r ± 1.96 ÷ √(n − 3)). Performance is the attribute's mean rating. Stated importance uses the means you paste; the gap column is importance − performance and only makes sense when both use the same scale.</p>
        <p><b>KAP gap</b> (Rogers 2003). For each behaviour, the shares who know it, favour it and practise it, with Wilson 95% intervals. The KAP gap is know − practise. Losses at each stage (never heard of it, know but do not favour, favour but do not practise) are counts over all respondents, treating the stages as a nested funnel, each with a Wilson interval.</p>
        <p><b>Awareness-usefulness gap</b> (Albert and Tullis, Measuring the User Experience). Awareness is the share who knew of the feature before it was shown; usefulness is the top-2-box share after trying it. The gap is useful − aware with Newcombe's hybrid score interval, treating the two as independent samples (conservative when the same people answered both). "Promote" means the whole interval is above zero.</p>
        <p><b>When not to use it.</b> The grid ranks attributes against each other, so it cannot say whether performance is good enough in absolute terms; pair it with a benchmark. Derived importance from correlations is distorted by halo and by attributes everyone rates highly; use regression-based key driver analysis when attributes overlap. Do not run KAP or awareness questions after showing the feature or explaining the behaviour.</p>
      </About>
    </div>
  );
}

export default SxImportancePerformance;
