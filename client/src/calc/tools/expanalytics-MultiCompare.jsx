import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as M from './expanalytics-multi.js';
import { adjustP } from './expanalytics-core.js';
import { IntervalPlot, Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About, num, pv, pct, n_ } from './ui.jsx';

const IND_WIDE = 'Current\tConcept A\tConcept B\tConcept C\n72\t82\t60\t74\n65\t85\t75\t73\n80\t78\t58\t77\n77\t90\t82\t72\n70\t88\t66\t76\n68\t84\t90\t75\n74\t79\t55\t71\n79\t86\t70\t78\n66\t91\t64\t\n71\t\t79\t\n\t\t61\t';
const IND_LONG = 'design,SUS\nCurrent,72\nCurrent,65\nCurrent,80\nCurrent,77\nCurrent,70\nConcept A,82\nConcept A,85\nConcept A,78\nConcept A,90\nConcept A,88\nConcept B,60\nConcept B,75\nConcept B,58\nConcept B,82\nConcept B,66';
const RM_WIDE = 'Prototype 1\tPrototype 2\tPrototype 3\tPrototype 4\n5\t6\t7\t6\n4\t5\t5\t7\n6\t6\t7\t7\n3\t4\t6\t5\n5\t5\t6\t7\n4\t6\t6\t6\n6\t7\t7\t7\n2\t4\t5\t6\n5\t4\t6\t7\n4\t5\t7\t6\n3\t5\t4\t6\n5\t6\t6\t5';
const RM_LONG = 'participant,prototype,SEQ\nP1,Prototype 1,5\nP1,Prototype 2,6\nP1,Prototype 3,7\nP2,Prototype 1,4\nP2,Prototype 2,5\nP2,Prototype 3,5\nP3,Prototype 1,6\nP3,Prototype 2,6\nP3,Prototype 3,7\nP4,Prototype 1,3\nP4,Prototype 2,4\nP4,Prototype 3,6\nP5,Prototype 1,5\nP5,Prototype 2,5\nP5,Prototype 3,6\nP6,Prototype 1,4\nP6,Prototype 2,6\nP6,Prototype 3,6';
const BIN_WIDE = 'Nav A\tNav B\tNav C\n1\t1\t0\n1\t0\t0\n1\t1\t1\n0\t1\t0\n1\t1\t0\n1\t0\t0\n1\t1\t1\n0\t0\t0\n1\t1\t0\n1\t0\t1\n1\t1\t0\n1\t0\t0\n1\t1\t0\n1\t1\t1\n0\t0\t0\n1\t1\t0\n1\t0\t0\n1\t1\t0\n1\t1\t0\n1\t0\t1';
const P_SAMPLE = 'Task 1 time, 0.003\nTask 2 time, 0.041\nTask 3 time, 0.018\nTask 1 success, 0.29\nTask 2 success, 0.012\nTask 3 success, 0.6\nSUS, 0.049\nSEQ task 1, 0.008\nSEQ task 2, 0.11\nSEQ task 3, 0.0004';

function MeansChart({ d, letters, label }) {
  return <IntervalPlot label={label} xLabel="Mean with 95% confidence interval; letters: groups sharing a letter do not differ significantly" rows={d.map((g, i) => ({ name: `${g.name} (n=${g.n})`, est: g.mean, lo: g.lo, hi: g.hi, tag: letters[i], color: `var(--c${(i % 8) + 1})` }))} fmtX={(v) => num(v, 1)} />;
}
const sigTag = (p, a = 0.05) => <span className={`qtag ${p < a ? 'promote' : ''}`}>{p < a ? 'Differs' : 'n.s.'}</span>;

function Independent() {
  const [layout, setLayout] = useState('wide');
  const [text, setText] = useState(IND_WIDE);
  const [post, setPost] = useState('auto');
  const parsed = useMemo(() => M.parseData(text, layout, 'independent'), [text, layout]);
  const groups = parsed.groups;
  const ok = groups.length >= 3 && groups.every((g) => g.xs.length >= 2) && groups.some((g) => new Set(g.xs).size > 1);
  const res = useMemo(() => {
    if (!ok) return null;
    const d = M.describe(groups), a = M.anova(groups), w = M.welchAnova(groups), lev = M.levene(groups, 'median'), levM = M.levene(groups, 'mean'), kw = M.kruskal(groups);
    const unequal = lev.p < 0.05;
    const which = post === 'auto' ? (unequal ? 'gh' : 'tukey') : post;
    const pairs = which === 'tukey' ? M.tukey(groups) : which === 'gh' ? M.gamesHowell(groups) : M.dunn(groups);
    const postName = { tukey: 'Tukey HSD', gh: 'Games-Howell', dunn: "Dunn's test (Holm)" }[which];
    const order = d.map((g, i) => [which === 'dunn' ? kw.meanRanks[i] : g.mean, i]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    const letters = M.cld(d.length, pairs.filter((p) => p.p < 0.05).map((p) => [p.i, p.j]), order);
    return { d, a, w, lev, levM, kw, unequal, pairs, which, postName, letters };
  }, [ok, groups, post]);
  const switchLayout = (l) => { setLayout(l); setText(l === 'wide' ? IND_WIDE : IND_LONG); };
  return (
    <>
      <LoadExample onClick={() => { setLayout('wide'); setText(IND_WIDE); setPost('auto'); }} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Layout" value={layout} onChange={switchLayout} options={[['wide', 'Wide: one column per design'], ['long', 'Long: design, value']]} />
        <Area label={layout === 'wide' ? 'A header row of design names, then values (blank cells allowed)' : 'A header row, then one row per person: design, value'} value={text} onChange={setText} rows={9} hint="Different people for each design. Paste from a spreadsheet; tabs, commas or semicolons work." />
        <Choice label="Post hoc" value={post} onChange={setPost} options={[['auto', 'Automatic'], ['tukey', 'Tukey HSD'], ['gh', 'Games-Howell'], ['dunn', 'Dunn (ranks)']]} />
      </div>
      {parsed.bad.length > 0 && <Problem>Skipped non-numeric values on rows {parsed.bad.slice(0, 8).join(', ')}.</Problem>}
      {!res ? <Problem>Enter at least three designs with two or more values each.</Problem> : (
        <>
          <Result big={`${res.unequal ? 'Welch ' : ''}F = ${num(res.unequal ? res.w.F : res.a.F, 2)}, p ${pv(res.unequal ? res.w.p : res.a.p)}`} tone={(res.unequal ? res.w.p : res.a.p) < 0.05 ? 'good' : ''} label={`${res.unequal ? "Welch's ANOVA (variances look unequal)" : 'One-way ANOVA'}; post hoc: ${res.postName}`}>
            <MeansChart d={res.d} letters={res.letters} label="Mean of each design with 95% confidence intervals and compact letters" />
          </Result>
          <Stats rows={[
            ['One-way ANOVA', `F(${res.a.dfb}, ${res.a.dfw}) = ${num(res.a.F, 3)}, p ${pv(res.a.p)}`],
            ["Welch's ANOVA", `F(${res.w.df1}, ${num(res.w.df2, 2)}) = ${num(res.w.F, 3)}, p ${pv(res.w.p)}`],
            ['η² / ω²', `${num(res.a.eta2, 3)} / ${num(res.a.omega2, 3)}`],
            ['Brown-Forsythe (median)', `W = ${num(res.lev.W, 3)}, p ${pv(res.lev.p)}`],
            ['Levene (mean)', `W = ${num(res.levM.W, 3)}, p ${pv(res.levM.p)}`],
            ['Kruskal-Wallis', `H(${res.kw.df}) = ${num(res.kw.H, 3)}, p ${pv(res.kw.p)}, ε² = ${num(res.kw.eps2, 3)}`],
          ]} />
          <Table label="Descriptive statistics" head={['Design', 'n', 'Mean', 'SD', '95% CI', 'Median', 'Mean rank', 'Letters']} rows={res.d.map((g, i) => [g.name, g.n, num(g.mean, 2), num(g.sd, 2), `${num(g.lo, 2)} to ${num(g.hi, 2)}`, num(g.median, 2), num(res.kw.meanRanks[i], 2), res.letters[i]])} />
          <h3 className="clu-h3">Pairwise comparisons: {res.postName}</h3>
          <Table label="Pairwise comparisons" head={res.which === 'dunn' ? ['Pair', 'Mean rank diff.', 'z', 'p (raw)', 'p (Holm)', ''] : ['Pair', 'Difference', '95% CI', res.which === 'tukey' ? 'q' : 't (df)', 'p (adjusted)', '']}
            rows={res.pairs.map((p) => (res.which === 'dunn'
              ? [`${p.a} vs ${p.b}`, num(p.diff, 2), num(p.z, 3), pv(p.pRaw), pv(p.p), sigTag(p.p)]
              : [res.which === 'tukey' ? `${p.b} − ${p.a}` : `${p.a} − ${p.b}`, num(p.diff, 2), `${num(p.lo, 2)} to ${num(p.hi, 2)}`, res.which === 'tukey' ? num(p.q, 3) : `${num(p.t, 3)} (${num(p.df, 1)})`, pv(p.p), sigTag(p.p)]))} />
          <StudySummary {...M.independentSummary({ d: res.d, a: res.a, w: res.w, lev: res.lev, kw: res.kw, post: res.pairs, postName: res.postName, letters: res.letters, unequal: res.unequal })} />
        </>
      )}
    </>
  );
}

function Repeated() {
  const [layout, setLayout] = useState('wide');
  const [text, setText] = useState(RM_WIDE);
  const [post, setPost] = useState('paired');
  const parsed = useMemo(() => M.parseData(text, layout, 'repeated'), [text, layout]);
  const ok = parsed.names.length >= 3 && parsed.rows.length >= 3;
  const res = useMemo(() => {
    if (!ok) return null;
    const rm = M.rmAnova(parsed.rows), fr = M.friedman(parsed.rows);
    if (!Number.isFinite(rm.F)) return null;
    const pairs = post === 'paired' ? M.pairedPosthoc(parsed.rows, parsed.names) : post === 'nemenyi' ? M.nemenyi(parsed.rows, parsed.names) : M.conoverFriedman(parsed.rows, parsed.names);
    const postName = { paired: 'Paired t-tests (Holm)', nemenyi: 'Nemenyi', conover: 'Conover (Holm)' }[post];
    const d = M.describe(parsed.names.map((name, j) => ({ name, xs: parsed.rows.map((r) => r[j]) })));
    const score = post === 'paired' ? rm.means : fr.meanRanks;
    const order = score.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map((x) => x[1]);
    const letters = M.cld(parsed.names.length, pairs.filter((p) => p.p < 0.05).map((p) => [p.i, p.j]), order);
    return { rm, fr, pairs, postName, d, letters };
  }, [ok, parsed, post]);
  const switchLayout = (l) => { setLayout(l); setText(l === 'wide' ? RM_WIDE : RM_LONG); };
  return (
    <>
      <LoadExample onClick={() => { setLayout('wide'); setText(RM_WIDE); setPost('paired'); }} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Layout" value={layout} onChange={switchLayout} options={[['wide', 'Wide: one row per person'], ['long', 'Long: person, design, value']]} />
        <Area label={layout === 'wide' ? 'A header row of design names, then one row per participant' : 'A header row, then participant, design, value'} value={text} onChange={setText} rows={9} hint="The same people rated or used every design. People with a missing design are left out." />
        <Choice label="Post hoc" value={post} onChange={setPost} options={[['paired', 'Paired t (Holm)'], ['nemenyi', 'Nemenyi (ranks)'], ['conover', 'Conover (ranks)']]} />
      </div>
      {parsed.dropped.length > 0 && <Problem>Left out {parsed.dropped.length} participant{parsed.dropped.length > 1 ? 's' : ''} with missing or non-numeric values.</Problem>}
      {!res ? <Problem>Enter at least three designs and three complete participants, with some variation.</Problem> : (
        <>
          <Result big={`F = ${num(res.rm.F, 2)}, p ${pv(res.rm.pGG)}`} tone={res.rm.pGG < 0.05 ? 'good' : ''} label={`Repeated-measures ANOVA, Greenhouse-Geisser ε = ${num(res.rm.eps, 3)}; ${res.rm.n} participants`}>
            <MeansChart d={res.d} letters={res.letters} label="Mean per design with 95% confidence intervals and compact letters" />
          </Result>
          <Stats rows={[
            ['RM ANOVA (uncorrected)', `F(${res.rm.dfc}, ${res.rm.dfe}) = ${num(res.rm.F, 3)}, p ${pv(res.rm.p)}`],
            ['Greenhouse-Geisser', `ε = ${num(res.rm.eps, 3)}, df ${num(res.rm.dfc * res.rm.eps, 2)}, ${num(res.rm.dfe * res.rm.eps, 2)}, p ${pv(res.rm.pGG)}`],
            ["Mauchly's sphericity", `W = ${num(res.rm.mauchlyW, 3)}, χ²(${res.rm.mauchlyDf}) = ${num(res.rm.mauchlyChi2, 3)}, p ${pv(res.rm.mauchlyP)}`],
            ['Partial / generalised η²', `${num(res.rm.np2, 3)} / ${num(res.rm.ng2, 3)}`],
            ['Friedman', `χ²(${res.fr.df}) = ${num(res.fr.chi2, 3)}, p ${pv(res.fr.p)}`],
            ["Kendall's W", num(res.fr.W, 3)],
          ]} />
          <Table label="Descriptives per design" head={['Design', 'Mean', 'SD', '95% CI', 'Mean rank', 'Letters']} rows={res.d.map((g, i) => [g.name, num(g.mean, 2), num(g.sd, 2), `${num(g.lo, 2)} to ${num(g.hi, 2)}`, num(res.fr.meanRanks[i], 2), res.letters[i]])} />
          <h3 className="clu-h3">Pairwise comparisons: {res.postName}</h3>
          <Table label="Pairwise comparisons" head={['Pair', post === 'paired' ? 'Mean difference' : 'Mean rank diff.', post === 'paired' ? '95% CI' : 'Statistic', 'p (adjusted)', '']}
            rows={res.pairs.map((p) => [`${p.a} − ${p.b}`, num(p.diff, 2), post === 'paired' ? `${num(p.lo, 2)} to ${num(p.hi, 2)}` : post === 'nemenyi' ? `q = ${num(p.q, 3)}` : `t = ${num(p.t, 3)}`, pv(p.p), sigTag(p.p)])} />
          <StudySummary {...M.repeatedSummary({ rm: res.rm, fr: res.fr, names: parsed.names, post: res.pairs, postName: res.postName, letters: res.letters })} />
        </>
      )}
    </>
  );
}

function Binary() {
  const [text, setText] = useState(BIN_WIDE);
  const parsed = useMemo(() => M.parseData(text, 'wide', 'repeated'), [text]);
  const valid = parsed.rows.filter((r) => r.every((v) => v === 0 || v === 1));
  const ok = parsed.names.length >= 3 && valid.length >= 3;
  const r = ok ? M.cochranQ(valid, parsed.names) : null;
  const okQ = r && Number.isFinite(r.Q);
  return (
    <>
      <LoadExample onClick={() => setText(BIN_WIDE)} />
      <div className="calc-inputs ea-inputs">
        <Area label="A header row of design names, then one row per participant with 1 (success) or 0 (failure)" value={text} onChange={setText} rows={9} hint="The same people attempted the task on every design." />
      </div>
      {!ok || !okQ ? <Problem>Enter at least three designs and three participants with 0/1 outcomes, and at least one participant whose outcome differs between designs.</Problem> : (
        <>
          <Result big={`Q = ${num(r.Q, 2)}, p ${pv(r.p)}`} tone={r.p < 0.05 ? 'good' : ''} label={`Cochran's Q on ${r.df} df, ${r.n} participants`} />
          <Table label="Success rate per design" head={['Design', 'Successes', 'Rate']} rows={parsed.names.map((nm, j) => [nm, Math.round(r.rates[j] * r.n), pct(r.rates[j], 1)])} />
          <Table label="Pairwise McNemar tests" head={['Pair', 'Only first succeeded', 'Only second succeeded', 'Difference', 'p (exact)', 'p (Holm)', '']} rows={r.pairs.map((p) => [`${p.a} vs ${p.b}`, p.onlyA, p.onlyB, pct(p.diff, 1), pv(p.pRaw), pv(p.p), sigTag(p.p)])} />
          <StudySummary {...M.cochranSummary(r, parsed.names)} />
        </>
      )}
    </>
  );
}

function Corrector() {
  const [text, setText] = useState(P_SAMPLE);
  const [alpha, setAlpha] = useState('0.05');
  const items = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const m = l.match(/^(.*?)[\s,;:\t]+([0-9.]+(?:[eE]-?\d+)?)\s*$/) || l.match(/^()([0-9.]+(?:[eE]-?\d+)?)$/);
    return m ? { label: m[1] || `Test ${i + 1}`, p: Number(m[2]) } : null;
  }).filter((x) => x && x.p >= 0 && x.p <= 1);
  const a = n_(alpha);
  const ok = items.length >= 2 && a > 0 && a < 1;
  const ps = items.map((x) => x.p);
  const adj = ok ? Object.fromEntries(['bonferroni', 'holm', 'hochberg', 'bh'].map((m) => [m, adjustP(ps, m)])) : null;
  const cell = (p) => <span className={p < a ? 'ea-b' : 'muted'}>{pv(p)}</span>;
  return (
    <>
      <LoadExample onClick={() => setText(P_SAMPLE)} />
      <div className="calc-inputs ea-inputs">
        <Area label="One test per line: a label (optional) and its p-value" value={text} onChange={setText} rows={9} />
        <Num label="α (or FDR level)" value={alpha} onChange={setAlpha} step="0.01" />
      </div>
      {!ok ? <Problem>Enter at least two p-values between 0 and 1.</Problem> : (
        <>
          <Table label="Adjusted p-values" head={['Test', 'Raw p', 'Bonferroni', 'Holm', 'Hochberg', 'Benjamini-Hochberg']}
            rows={items.map((x, i) => [x.label, cell(x.p), cell(adj.bonferroni[i]), cell(adj.holm[i]), cell(adj.hochberg[i]), cell(adj.bh[i])])} />
          <p className="tl-note">Bold values are below {a}. Adjusted p-values are compared directly with α, as in statsmodels' multipletests.</p>
          <StudySummary {...M.correctionSummary(ps, adj, a)} />
        </>
      )}
    </>
  );
}

// ── Comparing three or more designs ──
function ExpMultiCompare() {
  const [mode, setMode] = useState('ind');
  const C = { ind: Independent, rm: Repeated, bin: Binary, adj: Corrector }[mode];
  return (
    <>
      <div className="calc-inputs ea-inputs">
        <Choice label="Your study" value={mode} onChange={setMode} options={[['ind', 'Different people per design'], ['rm', 'Same people, every design'], ['bin', 'Same people, success / fail'], ['adj', 'Correct a list of p-values']]} />
      </div>
      <C key={mode} />
      <About method="anova-for-multi-design-comparisons-one-way-and-two-way" links={[['repeated-measures-and-mixed-split-plot-anova', 'Repeated-measures ANOVA'], ['cochrans-q-test-for-related-dichotomous-outcomes', "Cochran's Q"], ['multiple-comparisons-correction', 'Multiple comparisons correction'], ['planned-contrasts', 'Planned contrasts'], ['sign-test-wilcoxon-signed-rank-and-friedman-tests', 'Friedman test'], ['mann-whitney-u-test', 'Rank-based tests']]}>
        <p><b>One-way ANOVA.</b> F = MS_between / MS_within on (k − 1, N − k) df. η² = SS_between / SS_total; ω² = (SS_between − (k − 1)MS_within) / (SS_total + MS_within), which corrects η²'s upward bias. <b>Welch's ANOVA</b> weights each group by n/s² and does not assume equal variances (Welch 1951). <b>Levene's test</b> is an ANOVA on |x − group mean|; the <b>Brown-Forsythe</b> version uses |x − group median| and is more robust. The automatic post hoc uses Tukey HSD when Brown-Forsythe p ≥ 0.05 and Games-Howell otherwise.</p>
        <p><b>Tukey HSD</b> (Tukey-Kramer for unequal n): q = |m_i − m_j| / √(MS_within/2 · (1/n_i + 1/n_j)), with p from the studentized range distribution on (k, N − k) df. <b>Games-Howell</b> uses each pair's own variances, t = (m_i − m_j)/√(s²_i/n_i + s²_j/n_j), Welch-Satterthwaite df and q = |t|√2. <b>Kruskal-Wallis</b> H = 12/(N(N+1)) Σ R²_i/n_i − 3(N + 1), divided by the tie correction 1 − Σ(t³ − t)/(N³ − N); ε² = H/(N − 1). <b>Dunn's test</b>: z = (R̄_i − R̄_j)/√((N(N+1)/12 − Σ(t³ − t)/(12(N − 1)))(1/n_i + 1/n_j)), Holm-adjusted.</p>
        <p><b>Repeated measures.</b> SS_total splits into conditions, participants and error; F = MS_conditions / MS_error on (k − 1, (k − 1)(n − 1)) df. The Greenhouse-Geisser ε = (Σλ)² / ((k − 1)Σλ²), where λ are the eigenvalues of the double-centred covariance matrix of the conditions, multiplies both df. Mauchly's W = Πλ / (Σλ/(k − 1))^(k − 1). <b>Friedman</b> χ² = 12/(nk(k+1)) ΣR²_j − 3n(k + 1), tie-corrected; Kendall's W = χ²/(n(k − 1)). <b>Nemenyi</b>: q = |R̄_i − R̄_j|/√(k(k+1)/(6n)); <b>Conover</b>: t on (n − 1)(k − 1) df (Conover 1999). <b>Cochran's Q</b> = (k − 1)(kΣC²_j − N²)/(kN − ΣR²_i) on k − 1 df, with exact McNemar tests per pair.</p>
        <p><b>Corrections.</b> Bonferroni p·m; Holm (1979) step-down (m − i + 1)p₍ᵢ₎; Hochberg (1988) step-up; Benjamini-Hochberg (1995) p₍ᵢ₎·m/i, each made monotone and capped at 1. <b>Compact letters</b> use the insert-absorb algorithm (Piepho 2004). All values match scipy, statsmodels (pairwise_tukeyhsd, cochrans_q, multipletests), pingouin (welch_anova, pairwise_gameshowell, rm_anova, sphericity) and scikit-posthocs (Dunn, Nemenyi, Conover): <code>npm run check:expanalytics</code>.</p>
        <p><b>When not to use it.</b> With only two designs use the two-group calculators. If the designs differ in several crossed factors (layout × copy), you need a factorial ANOVA. If only one comparison was planned in advance, test it directly as a planned contrast instead of running all pairs.</p>
      </About>
    </>
  );
}

export default ExpMultiCompare;
