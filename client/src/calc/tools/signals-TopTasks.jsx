import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as T from './signals-toptasks.js';
import { BarChart, LinePlot, Table, LoadExample } from './signals-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pct, n_ } from './ui.jsx';

// ── Top task analysis ──
function SignalsTopTasks() {
  const [mode, setMode] = useState('totals');
  const [totals, setTotals] = useState(() => T.exampleTotalsText());
  const [ballotText, setBallotText] = useState(() => T.exampleBallotsText());
  const [N, setN] = useState('412');
  const [groupText, setGroupText] = useState('');
  const example = () => { setTotals(T.exampleTotalsText()); setBallotText(T.exampleBallotsText()); setN('412'); };
  const a = useMemo(() => {
    if (mode === 'totals') {
      const p = T.parseTotals(totals);
      return { bad: p.bad, r: T.analyse(p.tasks, Math.round(n_(N))) };
    }
    const p = T.parseBallots(ballotText);
    const gmap = Object.fromEntries(T.parseTotals(groupText).tasks.map((t) => [t.name, t.group]));
    const fallback = T.exampleGroups();
    const tasks = p.tasks.map((t) => ({ ...t, group: gmap[t.name] ?? (groupText.trim() ? '' : fallback[t.name] || '') }));
    return { bad: [], r: T.analyse(tasks, p.ballots.length, { ballots: p.ballots }) };
  }, [mode, totals, ballotText, N, groupText]);
  const r = a.r;
  return (
    <>
      <LoadExample onClick={example}>Load example (university website, 412 respondents)</LoadExample>
      <div className="calc-inputs sg-inputs">
        <Choice label="Data" value={mode} onChange={setMode} options={[['totals', 'Vote totals per task'], ['ballots', 'One ballot per respondent']]} />
        {mode === 'totals' && <Num label="Respondents" value={N} onChange={setN} min={1} hint="People who voted, not the number of votes." />}
      </div>
      <div className="calc-inputs sg-inputs">
        {mode === 'totals'
          ? <Area label="One task per line: task, votes, group (optional)" value={totals} onChange={setTotals} rows={8} hint="Group is any label you use to cluster tasks (a section of the site, a team)." />
          : <>
            <Area label="One respondent per line: their chosen tasks, separated by ; or |" value={ballotText} onChange={setBallotText} rows={8} hint="With ballots the tier tests use the exact overlap between tasks, and groups get a 'picked any' rate." />
            <Area label="Groups (optional): task, ignored, group" value={groupText} onChange={setGroupText} rows={3} placeholder="How to apply, 0, Study" hint="Leave empty to use the example's groups." />
          </>}
      </div>
      {a.bad.length > 0 && <Problem>Skipped line{a.bad.length > 1 ? 's' : ''} {a.bad.join(', ')}: each line needs a task name and a vote count.</Problem>}
      {!r ? <Problem>Enter at least two tasks with votes and the number of respondents.</Problem> : (
        <>
          <Result big={`Top ${r.neck} = ${pct(r.rows[r.neck - 1].cum, 0)} of votes`} label={`${r.n} tasks, ${r.V.toLocaleString()} votes from ${r.N.toLocaleString()} respondents (${num(r.perResp, 1)} each)`}>
            <p>The bottom half of the list ({r.half} tasks) shares {pct(r.bottomHalf, 0)} of the votes. The top {r.top5} task{r.top5 > 1 ? 's' : ''} (5% of the list) take {pct(r.top5Share, 0)}; the top 10% take {pct(r.top10Share, 0)}.</p>
          </Result>
          <h3 className="clu-h3">The long neck: vote share by task</h3>
          <BarChart label="Vote share per task, highest first" height={240}
            bars={r.rows.map((x) => ({ label: String(x.rank), value: x.share * 100, tone: x.rank <= r.neck ? 'ok' : x.tier === 1 ? '' : 'mute', title: `${x.name}, ${pct(x.share, 1)}` }))}
            yFmt={(v) => `${v}%`} />
          <p className="tl-note">Bars are numbered by rank (hover for the task). Green bars are the long neck: the fewest tasks that take a quarter of the vote. Grey bars are outside the first tier.</p>
          <h3 className="clu-h3">Cumulative share of votes</h3>
          <LinePlot label="Cumulative vote share by number of tasks" series={[{ name: 'Cumulative share', pts: [[0, 0], ...r.rows.map((x) => [x.rank, x.cum * 100])], dots: false }, { name: 'Equal votes for every task', pts: [[0, 0], [r.n, 100]], dash: '5 4', width: 1.4, color: 'var(--ink-3)' }]}
            xLabel="Number of tasks (highest first)" yLabel="Share of all votes (%)" yMin={0} yMax={100} xMin={0} yFmt={(v) => `${v}%`}
            hlines={[{ y: 25, label: '25%' }, { y: 50, label: '50%' }]} />
          <h3 className="clu-h3">Tasks</h3>
          <Table label="Votes per task" head={['Rank', 'Task', 'Group', 'Votes', 'Vote share (95% CI)', 'Picked by (95% CI)', 'Cumulative', 'Tier']}
            rows={r.rows.map((x) => ({ cls: x.rank <= r.neck ? 'tl-cell-ok' : '', cells: [x.rank, x.name, x.group || '', x.votes.toLocaleString(), `${pct(x.share, 1)} (${pct(x.shareLo, 1)} to ${pct(x.shareHi, 1)})`, `${pct(x.pick, 0)} (${pct(x.pickLo, 0)} to ${pct(x.pickHi, 0)})`, pct(x.cum, 0), x.tier] }))} />
          {r.groups.length > 0 && (
            <>
              <h3 className="clu-h3">Task groups</h3>
              <Table label="Votes per group" head={['Group', 'Tasks', 'Votes', 'Vote share', 'Share per task', ...(r.exactPairs ? ['Picked any task (95% CI)'] : [])]}
                rows={r.groups.map((g) => [g.name, g.tasks, g.votes.toLocaleString(), pct(g.share, 1), pct(g.perTask, 1), ...(g.any ? [`${pct(g.any.p, 0)} (${pct(g.any.lo, 0)} to ${pct(g.any.hi, 0)})`] : [])])} />
            </>
          )}
          <Stats rows={[['Tasks', r.n], ['Respondents', r.N.toLocaleString()], ['Votes', r.V.toLocaleString()], ['Tiers found', r.tiers], ['Tasks in the first tier', r.topTier.length], ['Tier tests', r.exactPairs ? 'exact overlap from ballots' : 'independence assumed']]} />
          <StudySummary {...T.summary(r)} />
        </>
      )}
      <About method="top-task-analysis" links={[['pareto-analysis', 'Pareto analysis']]}>
        <p><b>The method.</b> Gerry McGovern's top task analysis (McGovern 2018, <i>Top Tasks: A How-to Guide</i>) gives a large sample of users a long, randomised list of tasks (often 50 to 100) and asks each to vote for up to five that matter most. Sorted by votes, the tasks almost always form a "long neck": a few tasks take a large share of the vote and a long tail shares the rest.</p>
        <p><b>Shares.</b> With V votes from N respondents, vote share = votesᵢ / V and pick rate pᵢ = votesᵢ / N (each person can vote for a task once). The pick rate gets a Wilson score interval; the vote-share interval rescales it by N / V, treating the average number of votes per person as fixed. Cumulative share adds the shares from the top. The long neck is the fewest tasks whose cumulative share reaches 25%.</p>
        <p><b>Tiers.</b> Two tasks are compared on the same respondents with z = (pᵢ − pⱼ) / √([pᵢ(1 − pᵢ) + pⱼ(1 − pⱼ) − 2(pᵢⱼ − pᵢpⱼ)] / N), where pᵢⱼ is the share who picked both. With ballots pᵢⱼ is counted exactly; with totals only it is assumed to be pᵢpⱼ (independent picks). Walking down the list, a new tier starts at the first task significantly (two-sided p &lt; 0.05) below the current tier's first task. Tiers are a guide to which differences are real, not a formal multiple-comparison procedure.</p>
        <p><b>Groups.</b> Vote share per group adds its tasks' votes. With ballots, "picked any" is the share of respondents who chose at least one task in the group, with a Wilson interval.</p>
        <p><b>When not to use it.</b> Do not use it with short lists (under about 20 tasks) or with tasks written at different levels of detail, since vote share depends on how the list is cut. It ranks importance, not how well tasks work today: follow it with task performance measures. Do not compare vote shares between surveys with different task lists.</p>
      </About>
    </>
  );
}

export default SignalsTopTasks;
