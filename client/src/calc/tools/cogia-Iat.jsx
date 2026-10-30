import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as I from './cogia-iat.js';
import { fmt, pct, pText, mean } from './cogia-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Pick, Result, Stats, Problem, About, download } from './ui.jsx';
import './cogia.css';

// Each participant's D as a dot, sorted, over the bands Project Implicit uses for |D|.
function DPlot({ people, mean: m, lo, hi }) {
  const ok = people.filter((p) => Number.isFinite(p.D)).sort((a, b) => a.D - b.D);
  const W = 660, rowH = 9, T = 26, B = 36, H = T + Math.max(ok.length, 6) * rowH + B, L = 14, R = 14;
  const ext = Math.max(1, ...ok.map((p) => Math.abs(p.D))) * 1.08;
  const sx = (v) => L + ((v + ext) / (2 * ext)) * (W - L - R);
  const ticks = []; for (let v = -Math.floor(ext * 2) / 2; v <= ext + 1e-9; v += 0.5) ticks.push(+v.toFixed(2));
  const band = (a, b, o) => <g key={`${a}${b}`}><rect x={sx(a)} y={T} width={sx(b) - sx(a)} height={H - T - B} style={{ fill: 'var(--c2)', opacity: o }} /><rect x={sx(-b)} y={T} width={sx(-a) - sx(-b)} height={H - T - B} style={{ fill: 'var(--c3)', opacity: o }} /></g>;
  return (
    <figure className="ea-fig">
      <div className="cg-wrap cg-fit"><svg viewBox={`0 0 ${W} ${H}`} className="cg-plot" role="img" aria-label="D-score of each participant">
        {band(0.15, 0.35, 0.08)}{band(0.35, 0.65, 0.16)}{band(0.65, ext, 0.26)}
        {ticks.map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} className="grid" /><text x={sx(v)} y={H - B + 15} className="ax" textAnchor="middle">{v}</text></g>)}
        <line x1={sx(0)} x2={sx(0)} y1={T - 4} y2={H - B} className="axis0" />
        {Number.isFinite(lo) && <rect x={sx(lo)} y={8} width={Math.max(2, sx(hi) - sx(lo))} height={8} style={{ fill: 'var(--ink)' }} />}
        {Number.isFinite(m) && <text x={sx(m)} y={6} textAnchor="middle" className="sub">mean {fmt(m, 2)} (95% CI)</text>}
        {ok.map((p, i) => <circle key={p.id} cx={sx(p.D)} cy={T + rowH / 2 + i * rowH} r={3.6} className="dot"><title>{`${p.id}: D = ${fmt(p.D, 3)}`}</title></circle>)}
        <text x={L} y={H - 4} className="ax">← faster in blocks 6 and 7</text>
        <text x={W - R} y={H - 4} className="ax" textAnchor="end">faster in blocks 3 and 4 →</text>
      </svg></div>
      <p className="cg-note">Shaded bands: slight (0.15), moderate (0.35) and strong (0.65) by Project Implicit's labels.</p>
    </figure>
  );
}

function CogiaIat() {
  const [text, setText] = useState(() => I.exampleCsv());
  const [first, setFirst] = useState('Our app + Trustworthy');
  const [second, setSecond] = useState('Competitor + Trustworthy');
  const [variant, setVariant] = useState('builtin');
  const [drop400, setDrop400] = useState(false);
  const load = () => { setText(I.exampleCsv()); setFirst('Our app + Trustworthy'); setSecond('Competitor + Trustworthy'); setVariant('builtin'); setDrop400(false); };
  const parsed = useMemo(() => I.parseTrials(text), [text]);
  const r = useMemo(() => (parsed.error ? null : I.analyseIat(parsed.trials, { variant, drop400 })), [parsed, variant, drop400]);
  const ok = r && r.nOk >= 2;
  const dName = variant === 'builtin' ? (drop400 ? 'D2' : 'D1') : variant === 'p2sd' ? (drop400 ? 'D5' : 'D3') : (drop400 ? 'D6' : 'D4');
  const blockMeans = ok ? I.BLOCKS.map((b) => mean(r.people.filter((p) => !p.excluded && p.M).map((p) => p.M[b]))) : [];

  return (
    <div className="cg-root">
      <LoadExample onClick={load} />
      <Area label="Trial-level data (CSV with a header: participant, block, trial, latency_ms, error)" value={text} onChange={setText} rows={7} wrap="off" hint="Blocks 3, 4, 6 and 7 are the combined blocks of a standard 7-block IAT; other blocks are ignored. error = 1 for a wrong first response (or give a correct column instead)." />
      <div className="calc-inputs">
        <label className="calc-field"><span>Pairing in blocks 3 and 4</span><input className="ea-mini wide" value={first} onChange={(e) => setFirst(e.target.value.slice(0, 60))} /></label>
        <label className="calc-field"><span>Pairing in blocks 6 and 7</span><input className="ea-mini wide" value={second} onChange={(e) => setSecond(e.target.value.slice(0, 60))} /></label>
        <Pick label="Error trials" value={variant} onChange={setVariant} options={Object.entries(I.VARIANTS).map(([k, v]) => [k, v.label])} />
        <label className="tl-check"><input type="checkbox" checked={drop400} onChange={(e) => setDrop400(e.target.checked)} /> Delete trials under 400 ms</label>
      </div>
      <p className="cg-note">{I.VARIANTS[variant].note} This is scoring variant {dName} of Greenwald, Nosek and Banaji (2003).</p>
      {parsed.error && <Problem>{parsed.error}</Problem>}
      {r && !ok && <Problem>At least two participants need a valid D-score (each needs trials in all four blocks).</Problem>}
      {ok && (
        <>
          <Result big={`D = ${fmt(r.mean, 2)}`} tone={r.p < 0.05 ? 'good' : undefined} label={`Mean D-score of ${r.nOk} participants (${I.bandOf(r.mean)}); positive means faster with ${first || 'the blocks 3 and 4 pairing'}.`}>
            <Stats rows={[
              ['95% confidence interval', `${fmt(r.lo, 2)} to ${fmt(r.hi, 2)}`],
              ['Test against 0', `t(${r.df}) = ${fmt(r.t, 2)}, ${pText(r.p)}`],
              ["Cohen's d (mean / SD)", fmt(r.d, 2)],
              ['SD of D', fmt(r.sd, 3)],
              ['Split-half reliability (odd/even, Spearman-Brown)', fmt(r.sbHalf, 2)],
              ['Practice vs test parts: r (Spearman-Brown)', `${fmt(r.rParts, 2)} (${fmt(r.sbParts, 2)})`],
              ['Excluded (over 10% of trials under 300 ms)', r.excluded.length ? r.excluded.join(', ') : 'none'],
              ['Rows ignored', `${parsed.other} in other blocks, ${parsed.skipped} unreadable`],
            ]} />
          </Result>
          <DPlot people={r.people} mean={r.mean} lo={r.lo} hi={r.hi} />
          <h3 className="clu-h3">Share of participants by strength</h3>
          <Table label="Participants by D band" head={['|D|', `Favouring ${first || 'blocks 3 and 4'}`, `Favouring ${second || 'blocks 6 and 7'}`]} rows={r.bands.map((b, i) => [`${b.label} (${['< 0.15', '0.15 to 0.35', '0.35 to 0.65', '≥ 0.65'][i]})`, i === 0 ? `${b.pos + b.neg} (${pct((b.pos + b.neg) / r.nOk)})` : `${b.pos} (${pct(b.pos / r.nOk)})`, i === 0 ? '' : `${b.neg} (${pct(b.neg / r.nOk)})`])} />
          <h3 className="clu-h3">Mean latency by block (scored values, ms)</h3>
          <Table label="Block means" head={['Block', 'Pairing', 'Mean of participant means']} rows={I.BLOCKS.map((b, i) => [b, b <= 4 ? first : second, fmt(blockMeans[i], 0)])} />
          <div className="cg-actions"><button type="button" className="btn ghost small" onClick={() => download('iat-d-scores.csv', I.peopleCsv(r), 'text/csv')}>Download participant scores (CSV)</button></div>
          <Table label="Participant scores" head={['Participant', 'D', 'Practice (B3, B6)', 'Test (B4, B7)', 'Errors', 'Under 300 ms', 'Over 10 s', 'Status']} rows={r.people.map((p) => [p.id, fmt(p.D, 3), fmt(p.d36, 3), fmt(p.d47, 3), pct(p.errRate, 1), pct(p.fast, 1), p.slow, p.excluded ? <span key="x" className="cg-flag bad">excluded</span> : p.errRate > 0.3 ? <span key="w" className="cg-flag warn">many errors</span> : I.bandOf(p.D)])} />
          <StudySummary {...I.iatSummary(r, { first: first || 'blocks 3 and 4', second: second || 'blocks 6 and 7' })} />
        </>
      )}
      <About method="implicit-association-test-iat" links={[['implicit-processing-assessment-in-ux-evaluation', 'Implicit processing assessment in UX evaluation'], ['implicit-vs-explicit-measure-mismatch-analysis', 'Implicit vs explicit measure mismatch analysis']]}>
        <p><b>The D algorithm</b> (Greenwald, Nosek and Banaji 2003, Table 4): (1) use blocks 3, 4, 6 and 7; (2) drop trials over 10,000 ms; (3) exclude participants with more than 10% of trials under 300 ms; (4) for D2, D5 and D6 drop trials under 400 ms; (5) take each block's mean of correct latencies; (6) compute one inclusive SD of all trials in blocks 3 and 6, and another for blocks 4 and 7; (7) if errors were not corrected on screen, replace each error latency with its block's correct mean + 600 ms (D4, D6) or + 2 SD (D3, D5); (8) average each block; (9) take B6 − B3 and B7 − B4; (10) divide each by its inclusive SD; (11) D is the average of the two quotients.</p>
        <p><b>Group summary.</b> Mean D with a t interval, a one-sample t test against 0 and Cohen's d = mean/SD. The labels slight, moderate and strong use Project Implicit's cut-offs of |D| = 0.15, 0.35 and 0.65.</p>
        <p><b>Reliability.</b> Split-half: D is computed separately from odd and from even trials (by trial order within each block), correlated across participants and stepped up with Spearman-Brown, 2r/(1 + r). The practice-test figure correlates the B3/B6 quotient with the B4/B7 quotient, the internal-consistency estimate in Greenwald et al. (2003).</p>
        <p><b>Checks.</b> Every participant's D, both quotients, the split halves and the group statistics are checked against an independent pandas implementation of the same table, for all three error treatments with and without the 400 ms rule.</p>
        <p><b>When not to use it.</b> To diagnose one person (single IAT scores are noisy), with a non-standard block structure, or when the two pairings were always given in the same order: order effects then confound the D-score.</p>
      </About>
    </div>
  );
}

export default CogiaIat;
