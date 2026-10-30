import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as N from './sensors-codenet.js';
import { fmt, toCsv } from './sensors-core.js';
import { EX_CODENET } from './sensors-examples.js';
import { Table, LoadExample, color } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import { pv } from './ui.jsx';
import { CsvButton, HeatMatrix } from './sensors-ui.jsx';
import './sensors.css';

// Force-directed network: node area ∝ code frequency, colour = cluster, edge width ∝ the chosen measure.
function Network({ co, net, codes }) {
  const W = 640, H = 440, P = 70;
  const sx = (v) => P + v * (W - 2 * P), sy = (v) => 44 + v * (H - 70);
  const maxF = Math.max(...co.freq), maxW = Math.max(1e-9, ...net.edges.map((e) => e.w));
  // Codes without a link go in a row along the bottom, so they do not squeeze the connected network.
  const lone = codes.map((_, i) => i).filter((i) => !net.degree[i]), linked = codes.map((_, i) => i).filter((i) => net.degree[i]);
  const xs = linked.map((i) => net.pos[i][0]), ys = linked.map((i) => net.pos[i][1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), yMax = lone.length ? 0.82 : 1;
  const pos = codes.map((_, i) => (net.degree[i] ? [(net.pos[i][0] - x0) / (x1 - x0 || 1), ((net.pos[i][1] - y0) / (y1 - y0 || 1)) * yMax] : [lone.length > 1 ? lone.indexOf(i) / (lone.length - 1) : 0.5, 1]));
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Code co-occurrence network">
        {net.edges.map((e, i) => <line key={i} x1={sx(pos[e.a][0])} y1={sy(pos[e.a][1])} x2={sx(pos[e.b][0])} y2={sy(pos[e.b][1])} className="edge" style={{ strokeWidth: 1 + 7 * (e.w / maxW), opacity: 0.25 + 0.6 * (e.w / maxW) }} />)}
        {codes.map((c, i) => <circle key={c} cx={sx(pos[i][0])} cy={sy(pos[i][1])} r={6 + 16 * Math.sqrt(co.freq[i] / maxF)} style={{ fill: color(net.comm[i]), stroke: 'var(--bg)', strokeWidth: 2 }} />)}
        {codes.map((c, i) => <text key={c} x={sx(pos[i][0])} y={sy(pos[i][1]) - 9 - 16 * Math.sqrt(co.freq[i] / maxF)} className="node-lbl" textAnchor="middle">{c}</text>)}
      </svg>
      <p className="sn-note">Circle size = number of segments with the code; colour = cluster; line width = {N.MEASURES[net.measure].toLowerCase()}. Only pairs above the minimum count are drawn.</p>
    </figure>
  );
}

function SensorsCodeNetwork() {
  const [text, setText] = useState(EX_CODENET);
  const [measure, setMeasure] = useState('jaccard');
  const [minC, setMinC] = useState('2');
  const loadExample = () => { setText(EX_CODENET); setMeasure('jaccard'); setMinC('2'); };
  const parsed = useMemo(() => N.parseSegments(text), [text]);
  const co = useMemo(() => (parsed.segs.length ? N.cooccurrence(parsed) : null), [parsed]);
  const mc = Math.max(1, Math.round(Number(minC) || 1));
  const net = useMemo(() => (co && co.K > 1 ? N.network(co, measure, mc) : null), [co, measure, mc]);
  const val = (p) => (measure === 'count' ? p.c : p[measure]);
  const top = co ? [...co.pairs].sort((a, b) => val(b) - val(a) || b.c - a.c).slice(0, 15) : [];
  const csv = co ? toCsv([['code_1', 'code_2', 'count', 'jaccard', 'ochiai', 'lift', 'expected', 'p_hypergeometric'], ...[...co.pairs].sort((a, b) => b.c - a.c).map((p) => [parsed.codes[p.i], parsed.codes[p.j], p.c, p.jaccard.toFixed(4), p.ochiai.toFixed(4), p.lift.toFixed(3), p.expected.toFixed(3), p.p.toExponential(3)])]) : '';
  const short = parsed.codes.map((c) => (c.length > 14 ? `${c.slice(0, 13)}…` : c));

  return (
    <div className="sn-root">
      <LoadExample onClick={loadExample} />
      <Area label="Coded segments: one per line, segment id, colon, then its codes" value={text} onChange={setText} rows={8} hint='e.g. "S01: pricing worry, budget approval". Codes are matched ignoring case. Export from your QDA tool or paste from a spreadsheet.' wrap="off" />
      <div className="calc-inputs ea-inputs">
        <Choice label="Link strength" value={measure} onChange={setMeasure} options={Object.entries(N.MEASURES)} />
        <Num label="Minimum shared segments for a link" value={minC} onChange={setMinC} min={1} step={1} />
      </div>
      {!co ? <Problem>Paste coded segments.</Problem> : co.K < 2 ? <Problem>At least two different codes are needed.</Problem> : (
        <>
          <Result big={top[0] ? `${parsed.codes[top[0].i]} + ${parsed.codes[top[0].j]}` : 'No links'} label={top[0] ? `strongest link by ${N.MEASURES[measure].toLowerCase()} (${top[0].c} shared segments)` : 'no two codes were applied to the same segment'}>
            <Stats rows={[
              ['Segments, codes', `${co.N} segments, ${co.K} codes`],
              ['Segments with 2+ codes', co.multi],
              ['Co-occurring pairs', co.pairs.length],
              ['Clusters (Louvain), modularity Q', `${net.clusters.filter((c) => c.members.length > 1).length}, Q = ${fmt(net.Q, 3)}`],
            ]} />
          </Result>
          <Network co={co} net={net} codes={parsed.codes} />
          <h3 className="clu-h3">Top pairs</h3>
          <Table label="Top co-occurring code pairs" head={['Code pair', 'Shared', 'Expected', 'Jaccard (c)', 'Ochiai', 'Lift', 'p (more than chance)']}
            rows={top.map((p) => [`${parsed.codes[p.i]} + ${parsed.codes[p.j]}`, p.c, fmt(p.expected, 1), fmt(p.jaccard, 3), fmt(p.ochiai, 3), fmt(p.lift, 2), pv(p.p)])} />
          <h3 className="clu-h3">Clusters</h3>
          <Table label="Code clusters" num={false} head={['Cluster', 'Codes', 'Segments with any of them']} rows={net.clusters.map((c) => [<span key="c"><i className="ea-legend-sw" style={{ background: color(c.c) }} />{c.c + 1}</span>, c.members.map((i) => parsed.codes[i]).join(', '), parsed.segs.filter((s) => s.codes.some((k) => c.members.includes(parsed.keys.indexOf(k)))).length])} />
          <details className="calc-about"><summary>Co-occurrence counts (diagonal = segments with the code)</summary>
            <HeatMatrix label="Co-occurrence matrix" rowNames={parsed.codes} colNames={short} rows={co.C.map((r, i) => r.map((v, j) => (i === j ? co.freq[i] : v)))} fmtCell={(v) => String(v)} max={Math.max(1, ...co.pairs.map((p) => p.c))} />
          </details>
          <div className="sn-actions"><CsvButton name="code-cooccurrence-pairs.csv" csv={csv} /></div>
          <StudySummary {...N.codenetSummary(co, net, parsed.codes)} />
          <p className="sn-note">To see how evenly the codes are used overall, try <Link to="/calculators/shannon-information">Shannon information for research data</Link>.</p>
        </>
      )}
      <About method="entity-co-occurrence-networks-and-trend-graphs" links={[['network-analysis', 'Network analysis'], ['thematic-analysis', 'Thematic analysis'], ['data-display-matrices-networks-flowcharts', 'Data display: matrices and networks']]}>
        <p><b>Counts.</b> With N segments, n<sub>a</sub> segments coded a, n<sub>b</sub> coded b and n<sub>ab</sub> coded both: <b>Jaccard</b> = n<sub>ab</sub>/(n<sub>a</sub> + n<sub>b</sub> − n<sub>ab</sub>), the c-coefficient of ATLAS.ti (Friese 2019); <b>Ochiai</b> (cosine) = n<sub>ab</sub>/√(n<sub>a</sub>n<sub>b</sub>); <b>lift</b> = n<sub>ab</sub>/E, E = n<sub>a</sub>n<sub>b</sub>/N (how many times more often than if codes were applied independently). The one-sided p-value is the hypergeometric P(X ≥ n<sub>ab</sub>) for X ~ Hypergeometric(N, n<sub>a</sub>, n<sub>b</sub>), the same as a one-sided Fisher exact test; it is not corrected for testing many pairs.</p>
        <p><b>Clusters</b> by the Louvain method (Blondel et al. 2008) on links weighted by the chosen measure, maximising modularity Q = Σ<sub>c</sub>[W<sub>c</sub>/m − (S<sub>c</sub>/2m)²]. <b>Layout</b>: Fruchterman-Reingold force-directed placement with a fixed seed, so the picture is repeatable.</p>
        <p><b>Checked</b> against scipy.stats.hypergeom and an independent count (identical pair statistics), and networkx (louvain_communities, best of 20 seeds, and greedy modularity: the same clusters and Q).</p>
        <p><b>When not to use it.</b> When segments vary a lot in length, when codes are hierarchical (a parent and its child always co-occur), or with fewer than about 20 segments, where one coding decision adds or removes a link. Co-occurrence shows what was coded together, not why.</p>
      </About>
    </div>
  );
}

export default SensorsCodeNetwork;
