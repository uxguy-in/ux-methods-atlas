import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as PA from './surveyx-paired.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, pval } from './surveyx-core.js';
import { Table, IntervalPlot, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About } from './ui.jsx';
import { Tabs, GroupedColumns, color } from './surveyx-ui.jsx';

// One-dimensional scale: items as points on a line (Thurstone scale values).
function ScaleLine({ names, values, label }) {
  const W = 640, H = 70 + 16 * names.length, L = 20, R = 20, y = 34;
  const lo = Math.min(...values), hi = Math.max(...values), sx = (v) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R);
  const order = names.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot" role="img" aria-label={label}>
      <line x1={L} x2={W - R} y1={y} y2={y} className="grid" />
      {[0, 0.5, 1, 1.5, 2, 2.5, 3].filter((v) => v <= hi + 1e-9).map((v) => <g key={v}><line x1={sx(v)} x2={sx(v)} y1={y - 5} y2={y + 5} className="grid" /><text x={sx(v)} y={y - 10} className="ax" textAnchor="middle">{v}</text></g>)}
      {order.map((i, r) => (
        <g key={i}>
          <circle cx={sx(values[i])} cy={y} r={6} style={{ fill: color(i) }} />
          <line x1={sx(values[i])} x2={sx(values[i])} y1={y + 6} y2={y + 22 + 16 * r} className="grid" />
          <text x={sx(values[i]) + (sx(values[i]) > W / 2 ? -6 : 6)} y={y + 26 + 16 * r} className="lb" textAnchor={sx(values[i]) > W / 2 ? 'end' : 'start'}>{names[i]} ({fmt(values[i])})</text>
        </g>
      ))}
    </svg>
  );
}

function PairsTab({ text, setText }) {
  const parsed = useMemo(() => PA.parseComparisons(text), [text]);
  const res = useMemo(() => {
    if (parsed.error) return parsed;
    const bt = PA.bradleyTerry(parsed.W), th = PA.thurstone(parsed.W);
    if (th.error) return th;
    return { bt, th };
  }, [parsed]);
  const names = parsed.names || [];
  const ok = !res.error && !res.bt.error;
  const rank = ok ? [...res.bt.items].sort((a, b) => b.beta - a.beta) : [];
  return (
    <>
      <Area label="Win matrix (row chosen over column; names in the first row and column) or one 'winner, loser[, count]' per line" value={text} onChange={setText} rows={8} />
      {res.error && <Problem>{res.error}</Problem>}
      {!res.error && res.bt.error && <Problem>{res.bt.error}</Problem>}
      {!res.error && !res.bt.error && (
        <>
          <Result big={names[rank[0].i]} label={`most preferred: Bradley-Terry worth ${pct(rank[0].worth, 1)} from ${res.bt.nTotal} comparisons of ${names.length} items`}>
            <Stats rows={[['Bradley-Terry deviance', `${fmt(res.bt.dev)} on ${res.bt.df} df (p ${pval(res.bt.p)})`], ['Thurstone χ² (Mosteller)', `${fmt(res.th.chi2)} on ${res.th.df} df (p ${pval(res.th.p)})`], ['Mean |observed − fitted| proportion (Thurstone)', fmt(res.th.mad, 3)]]} />
          </Result>
          <Table label="Scale values" head={['Rank', 'Item', 'BT worth', 'BT log-worth ± SE', '95% CI', 'Thurstone scale', 'Wins']}
            rows={rank.map((it, r) => [r + 1, names[it.i], pct(it.worth, 1), `${fmt(it.beta, 3)} ± ${fmt(it.se, 3)}`, `${fmt(it.lo, 3)} to ${fmt(it.hi, 3)}`, fmt(res.th.scale[it.i], 3), `${parsed.W[it.i].reduce((a, b) => a + b, 0)} of ${parsed.W[it.i].reduce((a, b, j) => a + b + parsed.W[j][it.i], 0)}`])} />
          <div className="sx-grid2">
            <div>
              <h3 className="clu-h3">Bradley-Terry log-worth with 95% CI</h3>
              <IntervalPlot label="Bradley-Terry log-worths (centred) with 95% intervals" refX={0} refLabel="average" fmtX={(v) => String(+v.toFixed(2))}
                rows={rank.map((it) => ({ name: names[it.i], est: it.beta, lo: it.lo, hi: it.hi, color: color(it.i) }))} />
            </div>
            <div>
              <h3 className="clu-h3">Thurstone Case V scale</h3>
              <ScaleLine names={names} values={res.th.scale} label="Thurstone Case V scale values, lowest item at 0" />
              <p className="sx-note">Units are the standard deviation of a difference in judgements; only distances matter, so the lowest item is set to 0.</p>
            </div>
          </div>
          <h3 className="clu-h3">Chance that the row item is chosen over the column item (Bradley-Terry)</h3>
          <div className="sx-scroll"><table className="clu-table clu-num sx-heat" aria-label="Fitted probability that each row item is preferred to each column item">
            <thead><tr><th />{rank.map((c) => <th key={c.i}>{names[c.i]}</th>)}</tr></thead>
            <tbody>{rank.map((r) => <tr key={r.i}><th scope="row">{names[r.i]}</th>{rank.map((c) => (r.i === c.i ? <td key={c.i} className="h diag">·</td> : <td key={c.i} className="h" style={{ background: `color-mix(in srgb, var(--c1) ${Math.round(res.bt.prob[r.i][c.i] * 60)}%, transparent)` }}>{pct(res.bt.prob[r.i][c.i], 0)}<small className="sx-obs"> ({Number.isFinite(res.th.P[r.i][c.i]) ? pct(res.th.P[r.i][c.i], 0) : '–'})</small></td>))}</tr>)}</tbody>
          </table></div>
          <p className="sx-note">In brackets: the observed share of comparisons won.</p>
          <StudySummary {...PA.pairedSummary(res.bt, res.th, names)} />
        </>
      )}
    </>
  );
}

function GuttmanTab({ text, setText }) {
  const parsed = useMemo(() => PA.parseBinary(text), [text]);
  const g = useMemo(() => (parsed.error || parsed.X.length < 2 || parsed.items.length < 2 ? null : PA.guttman(parsed.X, parsed.items)), [parsed]);
  const show = g ? g.rows.slice(0, 60) : [];
  return (
    <>
      <Area label="One row per respondent, one 0/1 column per item (an optional first column of IDs)" value={text} onChange={setText} rows={8} />
      {parsed.error && <Problem>{parsed.error}</Problem>}
      {!parsed.error && parsed.dropped > 0 && <Problem>{parsed.dropped} row{parsed.dropped === 1 ? '' : 's'} with values other than 0 or 1 were left out.</Problem>}
      {!parsed.error && !g && <Problem>Enter at least two respondents and two items.</Problem>}
      {g && (
        <>
          <Result big={g.CR.toFixed(3)} label={`coefficient of reproducibility (${g.errors} errors in ${g.n * g.k} answers)`} tone={g.CR >= 0.9 && g.CS >= 0.6 ? 'good' : 'bad'}>
            <Stats rows={[['Minimum marginal reproducibility', g.MMR.toFixed(3)], ['Percent improvement', fmt(g.PPI * 100, 1)], ['Coefficient of scalability', fmt(g.CS, 3)], ["Loevinger's H", fmt(g.H, 3)], ['All-yes or all-no respondents', g.extremes]]} />
          </Result>
          <div className="sx-grid2">
            <Table label="Items from most to least endorsed" head={['Order', 'Item', 'Endorsed', 'Errors', 'Item H']}
              rows={g.items.map((it, i) => [i + 1, it.name, pct(it.p, 0), it.errors, <span key="h" className={it.Hj < 0.3 ? 'sx-neg' : ''}>{fmt(it.Hj, 3)}</span>])} />
            <div>
              <h3 className="clu-h3">Total scores</h3>
              <GroupedColumns label="Number of respondents at each total score" cats={g.scoreDist.map((_, s) => String(s))} series={[{ name: 'Respondents', values: g.scoreDist }]} />
            </div>
          </div>
          <h3 className="clu-h3">Scalogram{g.n > 60 ? ` (first 60 of ${g.n} respondents)` : ''}</h3>
          <div className="sx-scroll"><table className="sx-scalo" aria-label="Scalogram: respondents sorted by score, items by popularity, errors outlined">
            <thead><tr><th className="rid">Respondent</th>{g.items.map((it) => <th key={it.j} title={it.name}>{it.name.length > 10 ? `${it.name.slice(0, 9)}…` : it.name}</th>)}<th>Score</th></tr></thead>
            <tbody>{show.map((r) => <tr key={r.i}><th className="rid" scope="row">{parsed.ids[r.i]}</th>{r.pattern.map((v, k) => <td key={k} className={`${v ? 'one' : ''}${r.errs[k] ? ' err' : ''}`}>{v}</td>)}<td className="s">{r.score}</td></tr>)}</tbody>
          </table></div>
          <p className="sx-note">Shaded cells are "yes" answers; outlined cells differ from the ideal pattern for that total score (Goodenough-Edwards errors).</p>
          <StudySummary {...PA.guttmanSummary(g)} />
        </>
      )}
    </>
  );
}

// ── Scaling from comparisons ──
function SxPairedScaling() {
  const [tab, setTab] = useState('pairs');
  const [pairs, setPairs] = useState(() => EX.exPairs());
  const [gt, setGt] = useState(() => EX.exGuttman());
  return (
    <div className="sx-root">
      <LoadExample onClick={() => { setPairs(EX.exPairs()); setGt(EX.exGuttman()); }}>Load example (homepage concepts and banking-app features)</LoadExample>
      <Tabs label="Method" value={tab} onChange={setTab} options={[['pairs', 'Paired comparisons (Thurstone, Bradley-Terry)'], ['guttman', 'Guttman scalogram']]} />
      {tab === 'pairs' ? <PairsTab text={pairs} setText={setPairs} /> : <GuttmanTab text={gt} setText={setGt} />}
      <About method="bradley-terry-paired-comparison-scaling" links={[['thurstone-scaling-law-of-comparative-judgement', 'Thurstone scaling'], ['guttman-scaling', 'Guttman scaling'], ['longitudinal-scalogram-analysis', 'Longitudinal scalogram analysis']]}>
        <p><b>Bradley-Terry.</b> Each item has a worth π<sub>i</sub> and P(i chosen over j) = π<sub>i</sub> ÷ (π<sub>i</sub> + π<sub>j</sub>), or with log-worths β<sub>i</sub>, logit P = β<sub>i</sub> − β<sub>j</sub>. β is estimated by maximum likelihood (Newton-Raphson with the first item fixed at 0), then centred to sum to zero; standard errors come from the inverse Fisher information, transformed to the centred scale. Worths are exp(β) rescaled to sum to 100%. Fit: deviance G² = 2 Σ w<sub>ij</sub> ln(w<sub>ij</sub> ÷ n<sub>ij</sub>p̂<sub>ij</sub>) on (pairs compared − (k − 1)) df. Estimates exist only if the win graph is strongly connected (Ford 1957): no item may win, or lose, every comparison.</p>
        <p><b>Thurstone Case V.</b> P<sub>ij</sub> is the share of comparisons where i was chosen over j, Z<sub>ij</sub> = Φ⁻¹(P<sub>ij</sub>) with P kept within 0.02–0.98 (so |Z| ≤ 2.05). Scale values solve the least-squares problem min Σ (Z<sub>ij</sub> − (s<sub>i</sub> − s<sub>j</sub>))², which for complete data is the row mean of Z (Mosteller 1951); the lowest item is set to 0. Fit uses Mosteller's (1951) test: χ² = Σ n<sub>ij</sub>(θ<sub>ij</sub> − θ′<sub>ij</sub>)² ÷ 821, with θ = arcsin √P in degrees, on (k − 1)(k − 2)/2 df for complete data.</p>
        <p><b>Guttman scalogram.</b> Items are ordered by popularity and respondents by total score s. Each person's ideal pattern endorses the s most popular items; every cell that differs is an error (Goodenough-Edwards). Coefficient of reproducibility CR = 1 − errors ÷ (n × k); minimum marginal reproducibility MMR = mean of max(p<sub>j</sub>, 1 − p<sub>j</sub>); coefficient of scalability CS = (CR − MMR) ÷ (1 − MMR) (Menzel 1953). Loevinger's H = 1 − Σ F ÷ Σ E over item pairs, where F counts people who pass the harder item and fail the easier one and E = n p<sub>hard</sub>(1 − p<sub>easy</sub>) is the count expected if items were independent; item H<sub>j</sub> uses the pairs involving item j (Mokken 1971). Benchmarks: CR ≥ 0.90 (Guttman 1950), CS ≥ 0.60 (Menzel 1953), H ≥ 0.3 weak, 0.4 medium, 0.5 strong (Mokken 1971).</p>
        <p><b>When not to use it.</b> Paired comparisons grow as k(k − 1)/2, so beyond about 10 items use MaxDiff or a ranking task. Bradley-Terry and Thurstone assume one shared preference scale; if segments disagree, fit them separately. Guttman scaling suits cumulative behaviours or abilities, not attitudes where people can agree with items in any combination.</p>
      </About>
    </div>
  );
}

export default SxPairedScaling;
