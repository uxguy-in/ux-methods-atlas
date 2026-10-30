import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as F from './causal-factorial.js';
import { fmt } from './causal-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Choice, Num, Area, Pick, Result, Stats, Problem, About, download } from './ui.jsx';
import { HalfNormalPlot } from './causal-ui.jsx';
import './causal.css';

const EX_FACTORS = F.UX_FACTORS.map((name, i) => ({ name, levels: F.UX_LEVELS[i].join(', ') }));
const EX_OA = [{ name: 'Layout', levels: 'List, Grid' }, { name: 'Price display', levels: 'Monthly, Annual, Both' }, { name: 'Plan count', levels: '2, 3, 4' }, { name: 'Highlight', levels: 'None, Popular, Best value' }];
const splitLevels = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function CausalFactorial() {
  const [tab, setTab] = useState('design');
  const [kind, setKind] = useState('frac');
  const [factors, setFactors] = useState(EX_FACTORS);
  const [p, setP] = useState(1);
  const [gens, setGens] = useState('E=ABCD');
  const [pbN, setPbN] = useState(8);
  const [seed, setSeed] = useState('20261030');
  const [text, setText] = useState(F.uxExampleText());
  const [resp, setResp] = useState('Sign-up rate (%)');
  const [goal, setGoal] = useState('max');
  const k = factors.length;

  const setKindAll = (v) => { setKind(v); if (v === 'oa') setFactors(EX_OA); else if (kind === 'oa') { setFactors(EX_FACTORS); setP(1); setGens('E=ABCD'); } };
  const changeK = (list) => {
    setFactors(list);
    const opts = F.designsFor(list.length);
    const np = opts.length ? opts[0][1] : 0;
    setP(np); setGens(F.defaultGens(list.length, np).join('\n'));
  };
  const choose = (np) => { setP(np); setGens(F.defaultGens(k, np).join('\n')); };
  const load = () => { setTab('design'); setKind('frac'); setFactors(EX_FACTORS); setP(1); setGens('E=ABCD'); setSeed('20261030'); setText(F.uxExampleText()); setResp('Sign-up rate (%)'); setGoal('max'); };

  // ── Design ──
  const design = useMemo(() => {
    const fl = factors.map((f) => ({ name: f.name.trim() || 'Factor', levels: splitLevels(f.levels) }));
    if (fl.some((f) => f.levels.length < 2)) return { error: 'Every factor needs at least two levels, separated by commas.' };
    if (new Set(fl.map((f) => f.name)).size < fl.length) return { error: 'Give every factor a different name.' };
    const sd = Math.round(Number(seed)) || 1;
    if (kind === 'frac') {
      if (k < 2 || k > 11) return { error: 'Two-level fractional factorials here take 2 to 11 factors.' };
      const two = fl.map((f) => ({ ...f, levels: f.levels.slice(0, 2) }));
      const pg = p ? F.parseGenerators(gens, k, p) : { gens: [] };
      if (pg.error) return { error: pg.error };
      const d = F.fracDesign(k, pg.gens);
      const order = F.randomOrder(d.n, sd);
      return { kind, d, fl: two, sheet: F.runSheet(d.runs, two, order), order, gensText: pg.gens.map((g) => `${F.LETTERS[g.target]}=${g.sign < 0 ? '−' : ''}${F.wordStr(g.mask, k)}`) };
    }
    if (kind === 'pb') {
      if (k < 2 || k > 23) return { error: 'Plackett-Burman designs here take 2 to 23 factors.' };
      const N = Math.max(pbN, F.PB_SIZES.find((n) => n > k));
      const rows = F.plackettBurman(N).map((r) => r.slice(0, k));
      const two = fl.map((f) => ({ ...f, levels: f.levels.slice(0, 2) }));
      const order = F.randomOrder(N, sd);
      return { kind, N, rows, fl: two, sheet: F.runSheet(rows, two, order), order };
    }
    if (fl.some((f) => f.levels.length > 6)) return { error: 'Orthogonal arrays here have at most 6 levels per factor.' };
    const a = F.pickArray(fl.map((f) => f.levels.length));
    if (!a) return { error: 'No array in the catalogue fits this mix of levels; try fewer factors, or make the level counts more alike.' };
    const order = F.randomOrder(a.rows.length, sd);
    return { kind, a, fl, sheet: F.runSheet(a.rows, fl, order, false), order };
  }, [kind, factors, p, gens, pbN, seed, k]);

  const sumInput = design.error ? null : design.kind === 'frac'
    ? { kind: 'frac', runs: design.d.n, k, p, res: design.d.resolution, gens: design.gensText, mainClear: design.d.mainClear, twoClear: design.d.twoClear }
    : design.kind === 'pb' ? { kind: 'pb', runs: design.N, k } : { kind: 'oa', runs: design.a.rows.length, k, name: design.a.name, full: design.a.full };

  // ── Analysis ──
  const table = useMemo(() => F.parseTable(text), [text]);
  const respCol = table.names.includes(resp) ? resp : table.names[table.names.length - 1];
  const factorCols = table.names.filter((n) => n !== respCol);
  const an = useMemo(() => (tab === 'analyse' && table.n ? F.analyseTwoLevel(table, factorCols, respCol) : null), [tab, table, respCol]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = an && !an.error ? [...an.effects].sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)) : [];

  const fEdit = (i, key, v) => { const list = factors.map((f, j) => (j === i ? { ...f, [key]: v } : f)); setFactors(list); };
  return (
    <div className="ca-root">
      <LoadExample onClick={load} />
      <div className="calc-inputs ea-inputs">
        <Choice label="Task" value={tab} onChange={setTab} options={[['design', 'Generate a design'], ['analyse', 'Analyse results']]} />
      </div>
      {tab === 'design' ? (
        <>
          <section className="ea-card">
            <h4>Factors</h4>
            <div className="calc-inputs ea-inputs">
              <Choice label="Design" value={kind} onChange={setKindAll} options={[['frac', '2-level fractional factorial'], ['pb', 'Plackett-Burman screen'], ['oa', 'Orthogonal array (mixed levels)']]} />
            </div>
            <div className="clu-scroll ea-contain"><table className="clu-table ca-table" aria-label="Factors">
              <thead><tr><th>Letter</th><th>Factor</th><th>{kind === 'oa' ? 'Levels (comma separated)' : 'Low, high'}</th></tr></thead>
              <tbody>{factors.map((f, i) => (
                <tr key={i}><td className="m">{kind === 'oa' ? i + 1 : F.LETTERS[i]}</td>
                  <td><input className="ca-edit wide" value={f.name} aria-label={`Factor ${i + 1} name`} onChange={(e) => fEdit(i, 'name', e.target.value)} /></td>
                  <td><input className="ca-edit wide" value={f.levels} aria-label={`Factor ${i + 1} levels`} onChange={(e) => fEdit(i, 'levels', e.target.value)} /></td></tr>
              ))}</tbody>
            </table></div>
            <div className="ca-actions">
              <button type="button" className="btn ghost small" onClick={() => changeK([...factors, { name: `Factor ${factors.length + 1}`, levels: kind === 'oa' ? 'Low, Mid, High' : 'Low, High' }])}>+ Add factor</button>
              {factors.length > 2 && <button type="button" className="btn ghost small" onClick={() => changeK(factors.slice(0, -1))}>Remove last factor</button>}
            </div>
            {kind === 'frac' && k >= 2 && k <= 11 && (
              <div className="calc-inputs ea-inputs">
                <Choice label="Fraction" value={p} onChange={choose} options={[[0, `Full (${2 ** k} runs)`], ...F.designsFor(k).map(([, pp, res]) => [pp, `${2 ** (k - pp)} runs, res. ${F.romanRes(res)}`])]} />
                {p > 0 && <Area label="Generators (one per added factor)" value={gens} onChange={setGens} rows={Math.min(p, 7)} hint={`Defaults are minimum-aberration designs (Montgomery, table 8.14). Basic factors: ${F.LETTERS.slice(0, k - p)}.`} />}
              </div>
            )}
            {kind === 'pb' && <div className="calc-inputs ea-inputs"><Choice label="Runs" value={design.N || pbN} onChange={setPbN} options={F.PB_SIZES.filter((n) => n > k).map((n) => [n, `${n} runs`])} /></div>}
            <div className="calc-inputs ea-inputs">
              <Num label="Random seed for the run order" value={seed} onChange={setSeed} />
              <div className="calc-field"><span>&nbsp;</span><button type="button" className="btn ghost small" onClick={() => setSeed(String(Math.floor(Math.random() * 1e9)))}>Shuffle again</button></div>
            </div>
          </section>
          {design.error && <Problem>{design.error}</Problem>}
          {!design.error && (
            <>
              {design.kind === 'frac' && (
                <>
                  <Result big={`${design.d.n} runs`} label={design.d.p ? `2^(${k}−${p}) design, resolution ${F.romanRes(design.d.resolution)}: a 1/${2 ** p} fraction of the ${2 ** k}-run full factorial` : `Full 2^${k} factorial`}>
                    <Stats rows={[
                      ['Defining relation', design.d.p ? `I = ${design.d.words.map((w) => `${w.sign < 0 ? '−' : ''}${F.wordStr(w.mask, k)}`).join(' = ')}` : 'None (full factorial)'],
                      ['Resolution', F.romanRes(design.d.resolution)],
                      design.d.p ? ['Word-length pattern (A3, A4, …)', design.d.wlp.join(', ')] : null,
                      ['Clear main effects', `${design.d.mainClear} of ${k}`],
                      ['Clear two-factor interactions', `${design.d.twoClear} of ${(k * (k - 1)) / 2}`],
                    ]} />
                  </Result>
                  {design.d.p > 0 && (
                    <>
                      <h3 className="clu-h3">Alias structure</h3>
                      <p className="ca-note">Effects in the same row cannot be told apart; only main effects and two-factor interactions are listed first, with interactions of up to three factors shown.</p>
                      <Table label="Alias chains" num={false} head={['Estimates', 'Alias chain']} rows={design.d.classes.filter((c) => c[0].len <= 2).map((c) => [F.wordStr(c[0].mask, k), <span key="c" className="ca-mono">{F.chainText(c, k)}</span>])} />
                    </>
                  )}
                </>
              )}
              {design.kind === 'pb' && <Result big={`${design.N} runs`} label={`Plackett-Burman design for ${k} factors (up to ${design.N - 1})`}><Stats rows={[['Columns used', `${k} of ${design.N - 1}`], ['Spare columns', `${design.N - 1 - k} (useful to estimate noise)`]]} /></Result>}
              {design.kind === 'oa' && <Result big={`${design.a.rows.length} runs`} label={`${design.a.name} orthogonal array (full factorial: ${fmt(design.a.full)} runs)`}><Stats rows={[['Columns used', design.a.cols.map((c) => c + 1).join(', ')], ['Levels', design.fl.map((f) => f.levels.length).join(' × ')]]} /></Result>}
              <h3 className="clu-h3">Run sheet (randomised order)</h3>
              <div className="ca-actions"><button type="button" className="btn ghost small" onClick={() => download('design-run-sheet.csv', design.sheet.csv, 'text/csv')}>Download CSV</button></div>
              <Table label="Run sheet" num={false} head={design.sheet.head} rows={design.sheet.body} />
              <StudySummary {...F.designSummary(sumInput)} />
            </>
          )}
        </>
      ) : (
        <>
          <section className="ea-card">
            <h4>Results of a two-level experiment</h4>
            <div className="ca-actions">
              <button type="button" className="btn ghost small" onClick={() => { setText(F.uxExampleText()); setResp('Sign-up rate (%)'); setGoal('max'); }}>Sign-up page example</button>
              <button type="button" className="btn ghost small" onClick={() => { setText(F.montgomeryText()); setResp('Filtration rate'); setGoal('max'); }}>Montgomery's filtration example</button>
            </div>
            <Area label="One row per run: factor columns (two levels each) and the response" value={text} onChange={setText} rows={8} hint="Levels can be −1/+1, 0/1 or labels; the first label to appear counts as low." />
            <div className="calc-inputs ea-inputs">
              <Pick label="Response column" value={respCol || ''} onChange={setResp} options={table.names.map((n) => [n, n])} />
              <Choice label="Goal" value={goal} onChange={setGoal} options={[['max', 'Higher is better'], ['min', 'Lower is better']]} />
            </div>
          </section>
          {an?.error && <Problem>{an.error}</Problem>}
          {an && !an.error && (
            <>
              <Result big={`${an.effects.filter((e) => e.active).length} active`} label={`of ${an.effects.length} effects exceed Lenth's margin of error (${fmt(an.lenth.ME, 3)})`}>
                <Stats rows={[
                  ['Runs and factors', `${an.n} runs, ${an.k} factors`],
                  ['Grand mean', fmt(an.grand, 3)],
                  ['Lenth PSE', fmt(an.lenth.PSE, 4)],
                  ['Margin of error (ME, t on m/3 df)', fmt(an.lenth.ME, 4)],
                  ['Simultaneous margin (SME)', fmt(an.lenth.SME, 4)],
                  an.words.length ? ['Defining relation found', `I = ${an.words.map((w) => `${w.sign < 0 ? '−' : ''}${F.wordStr(w.mask, an.k)}`).join(' = ')}`] : null,
                ]} />
              </Result>
              <HalfNormalPlot label="Half-normal plot of effects" me={an.lenth.ME} sme={an.lenth.SME} pts={an.halfNormal.map((h) => ({ abs: h.abs, q: h.q, active: an.effects[h.i].active, name: an.effects[h.i].name }))} />
              <Table label="Effects" head={['Term', 'Factors', 'Effect', 'Coefficient', 'Aliases', 'Verdict']}
                rows={sorted.map((e) => [<span key="t" className="ca-mono">{e.name}</span>, e.label, fmt(e.effect, 3), fmt(e.coef, 3), e.aliases.length ? <span key="a" className="ca-mono">{e.aliases.slice(0, 3).map((x) => `${x.sign < 0 ? '−' : ''}${F.wordStr(x.mask, an.k)}`).join(', ')}{e.aliases.length > 3 ? ' …' : ''}</span> : 'None',
                  <span key="v" className={`ca-chip ${e.strong ? 'ok' : e.active ? 'warn' : ''}`}>{e.strong ? 'Beyond SME' : e.active ? 'Beyond ME' : 'Noise'}</span>])} />
              <StudySummary {...F.analysisSummary(an, { response: respCol.toLowerCase(), goal })} />
            </>
          )}
        </>
      )}
      <About method="fractional-factorial-experiments" links={[['half-normal-plot-and-lenths-method-for-unreplicated-factorials', "Half-normal plot and Lenth's method"], ['taguchi-robust-design', 'Taguchi robust design'], ['response-surface-methodology', 'Response surface methodology'], ['experiment-test-cell-design-strategy', 'Experiment test cell design'], ['vignette-method-and-factorial-survey', 'Factorial surveys']]}>
        <p><b>Fractional factorials.</b> A 2^(k−p) design runs 1/2^p of the full factorial. The first k − p factors form a full factorial (standard order, A changing fastest); each added factor is a product of them (its generator, such as E = ABCD). Multiplying generators gives the defining relation I = …; any effect is aliased with its product with each word. The resolution is the length of the shortest word: III means main effects are aliased with two-factor interactions, IV that two-factor interactions are aliased with each other, V that both are clear. Default generators are the minimum-aberration designs in Montgomery (2017), table 8.14. Designs and alias chains are checked against pyDOE3 (fracfact and the product columns of its design matrix).</p>
        <p><b>Plackett-Burman and orthogonal arrays.</b> Plackett-Burman designs (1946) screen up to N − 1 factors in N runs (N a multiple of 4) by cyclic shifts of a generating row; two-factor interactions are spread over many main-effect columns. Orthogonal arrays balance every pair of columns (strength 2), so main effects are independent of each other; L9, L16(4^5), L25 and L27 are built from finite-field (Galois field) constructions, mixed-level 4 × 2 arrays by merging columns, and L18, L32 and L36 are taken from pyDOE3. Every array is checked for strength 2.</p>
        <p><b>Analysis.</b> Each effect is mean(y at +) − mean(y at −) for the main-effect or interaction column; columns that duplicate an earlier one are reported as aliases. Lenth (1989): s0 = 1.5 × median|effect|, PSE = 1.5 × median of the |effects| below 2.5·s0, margin of error ME = t(0.975, m/3)·PSE and simultaneous margin SME = t(γ, m/3)·PSE with γ = (1 + 0.95^(1/m))/2 for m effects. The half-normal plot puts the i-th smallest |effect| against Φ⁻¹(0.5 + 0.5(i − 0.5)/m); active effects fall off the line. Checked against statsmodels OLS and Montgomery's Example 6.2.</p>
        <p><b>When not to use it.</b> When you expect many large interactions (use a full factorial or a resolution V design), when factors cannot be varied independently, or when cells get too little traffic to estimate each effect. Lenth's method needs most effects to be negligible; with replicated runs, use ANOVA with the pure error instead.</p>
      </About>
    </div>
  );
}

export default CausalFactorial;
