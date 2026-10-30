import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as VG from './surveyx-vignettes.js';
import * as EX from './surveyx-examples.js';
import { fmt, pct, pval, signed, parseTable } from './surveyx-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About, Choice } from './ui.jsx';
import { ColumnPick, ColumnChips, GroupedColumns, CsvButton } from './surveyx-ui.jsx';

// ── Anchoring vignettes ──
function SxAnchoringVignettes() {
  const [text, setText] = useState(() => EX.exVignettes());
  const [cols, setCols] = useState(null);
  const [view, setView] = useState('uniform');
  const parsed = useMemo(() => parseTable(text), [text]);
  const guess = useMemo(() => VG.guessColumns(parsed.head, parsed.rows), [parsed]);
  const c = cols || { group: guess.group, self: guess.self, vigs: guess.vigs };
  const a = useMemo(() => (parsed.error ? parsed : VG.analyseVignettes(text, { groupCol: c.group, selfCol: c.self, vigCols: c.vigs })), [text, c.group, c.self, c.vigs.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const setC = (k, v) => setCols({ ...c, [k]: v });
  return (
    <div className="sx-root">
      <LoadExample onClick={() => { setText(EX.exVignettes()); setCols(null); }}>Load example (ease of getting support in three markets)</LoadExample>
      <Area label="One row per respondent: an optional group column, the self-rating and the vignette ratings (same scale)" value={text} onChange={(v) => { setText(v); setCols(null); }} rows={7} />
      {parsed.head.length > 0 && (
        <div className="sx-inputs">
          <ColumnPick label="Group to compare" head={parsed.head} value={c.group} onChange={(v) => setC('group', v)} none="(no groups)" />
          <ColumnPick label="Self-assessment" head={parsed.head} value={c.self} onChange={(v) => setCols({ ...c, self: v, vigs: c.vigs.filter((j) => j !== v) })} allowed={(j) => guess.nums[j]} />
        </div>
      )}
      {parsed.head.length > 0 && <ColumnChips label="Vignettes, in their intended order from lowest to highest (column order)" head={parsed.head} value={c.vigs} onChange={(v) => setC('vigs', v)} allowed={(j) => guess.nums[j] && j !== c.self} />}
      {a.error && <Problem>{a.error}</Problem>}
      {!a.error && (
        <>
          <Result big={pct(a.all.scalar / a.all.n, 0)} label={`of ${a.all.n} respondents have a single C value (1 to ${a.K}); ${pct(a.all.ordered, 0)} rated the vignettes in the intended order`}>
            <Stats rows={[['Vignettes', a.J], ['Interval (tied or misordered) C values', a.all.n - a.all.scalar], ['Misordered vignettes', pct(a.all.misordered, 1)]]} />
          </Result>
          <Table label="Raw self-ratings and anchored C by group" head={[a.groupName || 'Group', 'n', `Mean ${a.selfName}`, 'Mean C (intervals at midpoints)', 'Mean C (single values only)', 'Single-value C', 'Vignettes in order']}
            rows={a.groups.map((g) => [g.group, g.n, fmt(g.meanY), fmt(g.meanCmid), fmt(g.meanC), pct(g.nScalar / g.n, 0), pct(g.ordered, 0)])} />
          <div>
            <div className="sx-actions">
              <h3 className="clu-h3" style={{ margin: 0 }}>Distribution of C</h3>
              <Choice label="Interval cases" value={view} onChange={setView} options={[['uniform', 'Spread evenly'], ['scalar', 'Left out']]} />
            </div>
            <GroupedColumns label="Share of respondents in each C category by group" yFmt={(v) => pct(v, 0)} cats={Array.from({ length: a.K }, (_, k) => VG.cLabel(k + 1, a.J))}
              series={a.groups.map((g) => ({ name: g.group, values: view === 'uniform' ? g.dist : g.distScalar }))} />
            <p className="sx-note">C = 1 means the self-rating was below the lowest vignette, even numbers mean tied with a vignette, and {a.K} means above the highest. With "spread evenly", a respondent whose C is an interval counts as an equal fraction in each category it covers.</p>
          </div>
          <div className="sx-grid2">
            <Table label="Mean vignette ratings by group" head={['Vignette', ...a.groups.map((g) => g.group)]} rows={a.vigNames.map((v, m) => [`V${m + 1}: ${v}`, ...a.groups.map((g) => fmt(g.vigMeans[m]))])} />
            {a.contrasts.length > 0 && <Table label="Differences from the first group" num={false} head={['Group', 'Raw difference (p)', 'C difference (p)']}
              rows={a.contrasts.map((x) => [`${x.group} − ${x.base}`, x.raw ? `${signed(x.raw.d)} (${pval(x.raw.p)})` : '–', x.c ? `${signed(x.c.d)} (${pval(x.c.p)})` : '–'])} />}
          </div>
          <div className="sx-actions"><CsvButton name="anchoring-vignettes-c.csv" rows={[['row', 'group', 'self', ...a.vigNames, 'C_low', 'C_high', 'vignette_order'], ...a.people.map((p, i) => [i + 1, p.group, p.y, ...p.z, p.lo, p.hi, p.order])]}>Download C for every respondent</CsvButton></div>
          <StudySummary {...VG.vignetteSummary(a)} />
        </>
      )}
      <About method="anchoring-vignettes" links={[['differential-item-functioning-dif-analysis', 'Differential item functioning'], ['cross-cultural-survey-equivalence-testing', 'Cross-cultural survey equivalence'], ['response-style-detection-and-control', 'Response style detection and control']]}>
        <p><b>Nonparametric C</b> (King, Murray, Salomon and Tandon 2004). Each respondent rates themself (y) and J vignettes (z<sub>1</sub> … z<sub>J</sub>, ordered by design from lowest to highest) on the same scale. The self-rating is recoded relative to that respondent's own vignette ratings: C = 1 if y &lt; z<sub>1</sub>, 2 if y = z<sub>1</sub>, 3 if z<sub>1</sub> &lt; y &lt; z<sub>2</sub>, …, 2J + 1 if y &gt; z<sub>J</sub>. Because everyone rates the same vignettes, differences in how groups use the scale cancel out.</p>
        <p><b>Ties and inconsistencies</b> (King and Wand 2007). When a respondent ties vignettes or rates them out of order, each condition above is checked literally and several can be true; C is then the interval from the lowest to the highest true category. For example, with two vignettes rated z<sub>1</sub> = z<sub>2</sub> = y, C = 2 to 4; with z<sub>1</sub> &gt; y &gt; z<sub>2</sub>, C = 1 to 5. The distribution either spreads each interval evenly over its categories or leaves interval cases out; group means use interval midpoints or single values only. Differences between groups use Welch's t test on C (single values only) and on the raw self-ratings.</p>
        <p><b>When not to use it.</b> The method rests on response consistency (people rate vignettes as they rate themselves) and vignette equivalence (everyone reads a vignette as the same level of the construct); test both in pilot interviews. It does not help within one stable group tracked over time, and C has few categories, so it is coarse with only one or two vignettes. For covariates and a smoother scale, fit the parametric CHOPIT model.</p>
      </About>
    </div>
  );
}

export default SxAnchoringVignettes;
