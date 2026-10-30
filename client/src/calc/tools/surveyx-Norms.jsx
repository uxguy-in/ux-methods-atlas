import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as NO from './surveyx-norms.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, parseNumbers, normCdf } from './surveyx-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About, Choice, Num, n_ } from './ui.jsx';
import { Histogram, CsvButton } from './surveyx-ui.jsx';

const ord = (p) => NO.ordinal(p * 100);
const Z_CUTS = [-1.75, -1.25, -0.75, -0.25, 0.25, 0.75, 1.25, 1.75];

// ── Norms and standard scores ──
function SxNorms() {
  const [mode, setMode] = useState('sample');
  const [sample, setSample] = useState(() => EX.exNormSample().join(' '));
  const [M, setM] = useState(String(EX.EX_NORM_PARAMS.M));
  const [SD, setSD] = useState(String(EX.EX_NORM_PARAMS.SD));
  const [n, setN] = useState(String(EX.EX_NORM_PARAMS.n));
  const [scores, setScores] = useState(EX.EX_NORM_SCORES);
  const [label, setLabel] = useState('usability score');
  const xs = useMemo(() => parseNumbers(sample), [sample]);
  const ref = useMemo(() => NO.reference({ mode, sample: xs, M: n_(M), SD: n_(SD), n: n_(n) }), [mode, xs, M, SD, n]);
  const vals = useMemo(() => parseNumbers(scores).slice(0, 12), [scores]);
  const rows = useMemo(() => (ref.error ? [] : vals.map((x) => NO.convert(ref, x))), [ref, vals]);
  const table = useMemo(() => (ref.error ? [] : NO.normTable(ref)), [ref]);
  const emp = mode === 'sample';
  const hist = useMemo(() => {
    if (ref.error) return null;
    const lo = emp ? ref.min : ref.M - 3.5 * ref.SD, hi = emp ? ref.max : ref.M + 3.5 * ref.SD;
    const k = emp ? Math.min(30, Math.max(8, Math.ceil(Math.sqrt(ref.n)))) : 30, w = (hi - lo) / k || 1;
    const bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
    if (emp) for (const x of ref.xs) bins[Math.min(k - 1, Math.floor((x - lo) / w))].count++;
    const scale = emp ? ref.n * w : 100;
    const curve = Array.from({ length: 121 }, (_, i) => { const x = lo + ((hi - lo) * i) / 120, z = (x - ref.M) / ref.SD; return [x, (scale * Math.exp(-0.5 * z * z)) / (ref.SD * Math.sqrt(2 * Math.PI))]; });
    const bands = [ref.M - 9 * ref.SD, ...Z_CUTS.map((z) => ref.M + z * ref.SD), ref.M + 9 * ref.SD].slice(0, 10).map((x0, i, arr) => (i < 9 ? { x0, x1: arr[i + 1], label: String(i + 1) } : null)).filter(Boolean);
    return { bins, curve, bands };
  }, [ref, emp]);
  const load = () => { setMode('sample'); setSample(EX.exNormSample().join(' ')); setM(String(EX.EX_NORM_PARAMS.M)); setSD(String(EX.EX_NORM_PARAMS.SD)); setN(String(EX.EX_NORM_PARAMS.n)); setScores(EX.EX_NORM_SCORES); setLabel('usability score'); };
  return (
    <div className="sx-root">
      <LoadExample onClick={load}>Load example (in-house usability scale, 600 users)</LoadExample>
      <Choice label="Norm group" value={mode} onChange={setMode} options={[['sample', 'Paste the reference scores'], ['params', 'Enter mean and SD']]} />
      {mode === 'sample'
        ? <Area label="Reference (norm group) scores, separated by spaces, commas or new lines" value={sample} onChange={setSample} rows={5} />
        : <div className="sx-inputs">
          <Num label="Norm group mean" value={M} step={0.1} onChange={setM} />
          <Num label="Norm group SD" value={SD} step={0.1} min={0} onChange={setSD} />
          <Num label="Norm group size" value={n} min={3} onChange={setN} hint="Needed for percentile intervals" />
        </div>}
      <div className="sx-inputs">
        <label className="calc-field wide"><span>Scores to convert (up to 12)</span><input className="sx-text" value={scores} onChange={(e) => setScores(e.target.value)} /></label>
        <label className="calc-field"><span>What the score is</span><input className="sx-text" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      </div>
      {ref.error && <Problem>{ref.error}</Problem>}
      {!ref.error && !rows.length && <Problem>Enter at least one score to convert.</Problem>}
      {!ref.error && rows.length > 0 && (
        <>
          <Result big={emp ? ord(rows[0].prEmp) : ord(rows[0].prNormal)} label={`percentile of a ${label} of ${fmt(rows[0].x, 2)} (${emp ? `empirical, 95% CI ${ord(rows[0].prEmpLo)} to ${ord(rows[0].prEmpHi)}` : Number.isFinite(rows[0].prNormalLo) ? `normal, 95% CI ${ord(rows[0].prNormalLo)} to ${ord(rows[0].prNormalHi)}` : 'normal'})`}>
            <Stats rows={[['Norm group', Number.isFinite(ref.n) ? `n = ${ref.n}` : 'size unknown'], ['Mean', fmt(ref.M, 2)], ['SD', fmt(ref.SD, 2)], emp ? ['Skewness', fmt(ref.skew, 2)] : null, emp ? ['Range', `${fmt(ref.min, 1)} to ${fmt(ref.max, 1)}`] : null]} />
          </Result>
          <Table label="Standard scores" head={['Score', 'z', 'T', 'Stanine', 'Sten', 'Percentile (normal, 95% CI)', ...(emp ? ['Percentile (empirical, 95% CI)', 'Normalised T', 'Normalised stanine'] : [])]}
            rows={rows.map((r) => [fmt(r.x, 2), fmt(r.z, 2), fmt(r.T, 1), r.stanine, r.sten, `${fmt(r.prNormal * 100, 1)} (${Number.isFinite(r.prNormalLo) ? `${fmt(r.prNormalLo * 100, 1)}–${fmt(r.prNormalHi * 100, 1)}` : 'n unknown'})`, ...(emp ? [`${fmt(r.prEmp * 100, 1)} (${fmt(r.prEmpLo * 100, 1)}–${fmt(r.prEmpHi * 100, 1)})${r.outside ? ' *' : ''}`, fmt(r.TNorm, 1), r.stanineNorm] : [])])} />
          {rows.some((r) => r.outside) && <p className="sx-note">* Outside the range of the norm group.</p>}
          {hist && <div>
            <h3 className="clu-h3">{emp ? 'Norm group with the normal curve and stanine bands' : 'Normal curve of the norm group with stanine bands'}</h3>
            <Histogram bins={hist.bins} curve={hist.curve} bands={hist.bands} marks={rows.map((r) => ({ x: r.x, label: `${fmt(r.x, 1)}: ${emp ? ord(r.prEmp) : ord(r.prNormal)}` }))} label="Distribution of the norm group with converted scores marked" xLabel={label} />
            <p className="sx-note">Numbers along the top are stanines (1 to 9). Expected shares in each stanine for normal scores: {NO.STANINE_PCT.join('%, ')}%.</p>
          </div>}
          {emp && table.length > 0 && (
            <details className="sx-card">
              <summary>Norm table ({table.length} distinct scores)</summary>
              <Table label="Norm table: every distinct score in the norm group" head={['Score', 'f', 'Cum. f', 'Percentile', 'z', 'T', 'Stanine', 'Sten', 'Normalised T']}
                rows={table.map((r) => [fmt(r.x, 1), r.f, r.cum, fmt(r.prEmp * 100, 1), fmt(r.z, 2), fmt(r.T, 1), r.stanine, r.sten, fmt(r.TNorm, 1)])} />
              <div className="sx-actions"><CsvButton name="norm-table.csv" rows={NO.tableCsv(table)}>Download norm table (CSV)</CsvButton></div>
            </details>
          )}
          <StudySummary {...NO.normsSummary(ref, rows, { label })} />
        </>
      )}
      <About method="norm-development-and-standard-score-transformation" links={[['distribution-free-confidence-intervals-for-percentiles', 'Distribution-free intervals for percentiles'], ['competitive-ux-benchmarking', 'Competitive UX benchmarking']]}>
        <p><b>Standard scores.</b> z = (x − M) ÷ SD, with M and SD from the norm group (SD with n − 1). T = 50 + 10z (McCall 1922). Stanines are nine bands half an SD wide centred on the mean: stanine = ⌊2z + 5.5⌋ kept within 1–9, so stanine 5 runs from z = −0.25 to +0.25 and holds about 20% of normal scores (4, 7, 12, 17, 20, 17, 12, 7, 4%). Stens are ten bands half an SD wide with the mean between 5 and 6: sten = ⌊2z + 6⌋ kept within 1–10.</p>
        <p><b>Percentile ranks.</b> Normal: 100 × Φ(z). Empirical (mid-rank): 100 × (number below + half the number equal) ÷ n, the usual convention for norm tables. Normalised (area-transformed) scores convert the empirical percentile back to a normal deviate, z<sub>n</sub> = Φ⁻¹(PR) (PR kept within 0.5/n and 1 − 0.5/n), then to T and stanines; use them when the norm group is skewed.</p>
        <p><b>Intervals.</b> Empirical percentiles: Wilson 95% interval on the mid-rank proportion of the norm sample. Normal percentiles: Crawford and Garthwaite's (2002) interval, which allows for the norm mean and SD being estimates: z√n follows a non-central t distribution with n − 1 df and non-centrality θ√n, so the limits for θ are found by inverting that distribution and reported as Φ(θ). It needs the norm group size.</p>
        <p><b>When not to use it.</b> Small or unrepresentative norm groups (a few dozen people, one product, a different user population or a different version of the questionnaire) give misleading percentiles. Norms are descriptive, not targets. Normal percentiles assume the norm group is roughly normal; with skew or ceiling effects use the empirical or normalised columns.</p>
      </About>
    </div>
  );
}

export default SxNorms;
