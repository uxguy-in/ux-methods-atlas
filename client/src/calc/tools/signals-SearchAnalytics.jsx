import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as Q from './signals-search.js';
import { BarChart, LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Area, Num, Result, Stats, Problem, About, num, pct, n_ } from './ui.jsx';

const ci = (x) => `${pct(x.rate, 1)} (${pct(x.lo, 1)} to ${pct(x.hi, 1)})`;

// ── Site search analytics ──
function SignalsSearchAnalytics() {
  const [text, setText] = useState(() => Q.exampleLog());
  const [head, setHead] = useState('50');
  const [torso, setTorso] = useState('80');
  const p = useMemo(() => Q.parseLog(text), [text]);
  const okCuts = n_(head) > 0 && n_(torso) > n_(head) && n_(torso) < 100;
  const a = useMemo(() => (okCuts ? Q.analyse(p.rows, { head: n_(head) / 100, torso: n_(torso) / 100 }) : null), [p, head, torso, okCuts]);
  return (
    <>
      <LoadExample onClick={() => { setText(Q.exampleLog()); setHead('50'); setTorso('80'); }}>Load example (online shop, 400 sessions)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Area label="Query log: session, query, results, clicks (one search per line, in time order)" value={text} onChange={setText} rows={9}
          hint="Results = number of results shown (0 for none); clicks = result clicks after that search. Leave either blank if you do not have it. Queries are lower-cased and trimmed before counting." />
      </div>
      <div className="calc-inputs sg-inputs">
        <Num label="Head ends at" value={head} onChange={setHead} suffix="% of searches" />
        <Num label="Torso ends at" value={torso} onChange={setTorso} suffix="% of searches" />
      </div>
      {p.bad.length > 0 && <Problem>Skipped line{p.bad.length > 1 ? 's' : ''} {p.bad.slice(0, 10).join(', ')}{p.bad.length > 10 ? '…' : ''}: each line needs a session id and a query.</Problem>}
      {!okCuts ? <Problem>The head cut must be above 0 and below the torso cut, which must be below 100%.</Problem> : !a ? <Problem>Paste at least 5 searches.</Problem> : (
        <>
          <Result big={a.hasResults ? `${pct(a.rate.zero.rate, 1)} zero results` : `${pct(a.rate.refine.rate, 1)} refined`} label={`${a.searches.toLocaleString()} searches, ${a.sessions.toLocaleString()} sessions, ${a.distinct.toLocaleString()} distinct queries (${num(a.perSession, 2)} searches per session)`}>
            <p>Intervals are 95% confidence intervals clustered by session.</p>
          </Result>
          <Table label="Search rates" num={false} head={['Measure', 'Rate (95% CI)', 'Count', 'What it counts']}
            rows={[
              a.hasResults && ['Zero-result rate', ci(a.rate.zero), `${a.rate.zero.x} of ${a.rate.zero.n}`, 'Searches that returned no results'],
              ['Refinement rate', ci(a.rate.refine), `${a.rate.refine.x} of ${a.rate.refine.n}`, 'Searches followed by another search in the same session'],
              ['Reformulation rate', ci(a.rate.reform), `${a.rate.reform.x} of ${a.rate.reform.n}`, 'Followed by a related rewording (shares a word or contains the query)'],
              ['Repeat rate', ci(a.rate.repeat), `${a.rate.repeat.x} of ${a.rate.repeat.n}`, 'Followed by the same query again (paging or retrying)'],
              a.hasClicks && ['Click-through rate', ci(a.rate.click), `${a.rate.click.x} of ${a.rate.click.n}`, 'Searches with at least one result click'],
              a.hasClicks && ['Search exit rate', ci(a.rate.exit), `${a.rate.exit.x} of ${a.rate.exit.n}`, "The session's last search, with no click"],
              a.hasResults && ['Sessions with a zero result', `${pct(a.sessZero.p, 1)} (${pct(a.sessZero.lo, 1)} to ${pct(a.sessZero.hi, 1)})`, `${a.sessZero.x} of ${a.sessZero.n}`, 'Share of sessions (Wilson interval)'],
            ].filter(Boolean)} />
          <h3 className="clu-h3">Query concentration</h3>
          <LinePlot label="Cumulative share of searches by query rank" series={[{ name: 'Cumulative share of searches', pts: [[0, 0], ...a.queries.map((q) => [q.rank, q.cum * 100])] }]}
            xLabel="Distinct queries, most frequent first" yLabel="Share of searches (%)" yMin={0} yMax={100} xMin={0} yFmt={(v) => `${v}%`}
            hlines={[{ y: a.cuts.head * 100, label: 'head' }, { y: a.cuts.torso * 100, label: 'torso' }]} />
          <Stats rows={[['Head', `${a.head.queries} queries, ${pct(a.head.share, 0)} of searches`], ['Torso', `${a.torso.queries} queries, ${pct(a.torso.share, 0)}`], ['Tail', `${a.tail.queries} queries, ${pct(a.tail.share, 0)}`], ['Gini of query frequencies', num(a.gini, 3)], ['Queries searched once', `${pct(a.onceShare, 0)} of distinct queries`]]} />
          <h3 className="clu-h3">Top queries</h3>
          <BarChart label="Searches for the top queries" height={220} bars={a.top.map((q) => ({ label: q.query, value: q.n, tone: q.zero > 0 ? 'bad' : '' }))} />
          <Table label="Top queries" head={['Rank', 'Query', 'Searches', 'Share', 'Zero results', 'Click-through', 'Refined', 'Band']}
            rows={a.top.map((q) => [q.rank, q.query, q.n, pct(q.share, 1), q.withResults ? pct(q.zero / q.withResults, 0) : '', q.withClicks ? pct(q.clicks / q.withClicks, 0) : '', pct(q.refine / q.n, 0), q.band])} />
          {a.zeroQueries.length > 0 && (
            <>
              <h3 className="clu-h3">Most frequent zero-result queries</h3>
              <Table label="Zero-result queries" head={['Query', 'Zero-result searches', 'All searches']} rows={a.zeroQueries.map((q) => [q.query, q.zero, q.n])} />
            </>
          )}
          {a.pairs.length > 0 && (
            <>
              <h3 className="clu-h3">Most common query changes</h3>
              <Table label="Query pairs" num={false} head={['First query → next query', 'Times']} rows={a.pairs.map((x) => [x.pair, x.n])} />
            </>
          )}
          <StudySummary {...Q.summary(a)} />
        </>
      )}
      <About method="site-search-analytics" links={[['search-behaviour-pattern-analysis', 'Search behaviour pattern analysis'], ['log-file-analysis', 'Log file analysis'], ['dead-end-identification', 'Dead-end identification']]}>
        <p><b>Rates.</b> Each line is one search. Zero-result rate = searches with 0 results / searches with a result count. Refinement rate = searches followed by another search in the same session. Reformulation = a following search that is related (one query contains the other, or they share a word of two or more letters) but not identical; repeat = the same query again. Click-through = searches with at least one result click. Search exit = the last search of a session with no click (a proxy for Google Analytics' "% search exits").</p>
        <p><b>Intervals.</b> Searches in one session are related, so rates are ratio estimates R = Σyₛ / Σnₛ over sessions with the cluster-robust (linearisation) variance Var(R) = S/(S − 1) · Σ(yₛ − R nₛ)² / (Σnₛ)², S = number of sessions, and a normal 95% interval. This equals OLS on a constant with standard errors clustered by session (statsmodels cov_type='cluster'). Session-level shares use Wilson intervals.</p>
        <p><b>Concentration.</b> Distinct queries are ranked by frequency. The head is the most frequent queries up to the first cut of cumulative share (default 50%), the torso up to the second (80%), and the tail the rest (Rosenfeld 2011, <i>Search Analytics for Your Site</i>, calls this the Zipf curve of queries). Gini = Σ(2i − n − 1)xᵢ / (n Σx) over query frequencies sorted ascending: 0 when every query is searched equally often, near 1 when a few queries take almost all searches.</p>
        <p><b>When not to use it.</b> Do not use a log that has been sampled by session-unaware filters, or one where bots and internal staff have not been removed. Exits and refinements are inferred from the order of searches, so the log must be in time order within each session. Query normalisation here is simple (case, spaces, punctuation); merge spelling variants yourself if they matter.</p>
      </About>
    </>
  );
}

export default SignalsSearchAnalytics;
