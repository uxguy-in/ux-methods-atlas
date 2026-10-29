import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as F from './surveystatsFactor.js';
import { corrMatrix, mean, sdev } from './surveystatsMath.js';
import { numericData, isNumericCol, exampleFactorSurvey, harmanText, readTable } from './surveystatsData.js';
import { Choice, Num, Area, Result, Stats, Problem, About, num, pct, pv } from './ui.jsx';
import { DataBox, ColumnTable, useColumns, useJob, runJob, ScreePlot, Matrix, short } from './surveystatsUi.jsx';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const FLAG_TXT = { weak: ['Weak (< .40)', 'fix'], cross: ['Cross-loads (≥ .30)', 'opp'], close: ['Gap < .20', 'opp'] };
const METHOD = { paf: 'principal axis factoring', minres: 'minimum residual', ml: 'maximum likelihood' };
const ledermann = (p) => { let k = 1; while (k + 1 < p && (p - k - 1) ** 2 - (p + k + 1) >= 0) k++; return k; };

function Loadings({ r, names, factorNames, flags, blank, view }) {
  const order = F.sortedOrder(r.pattern, flags), M = view === 'structure' ? r.structure : r.pattern;
  const fn = (f) => (factorNames[f] && factorNames[f].trim()) || `Factor ${f + 1}`;
  return (
    <div className="clu-scroll">
      <table className="clu-table clu-num svs-table" aria-label={`${view} loadings`}>
        <thead><tr><th>Item</th>{r.pattern[0].map((_, f) => <th key={f} className="rot">{fn(f)}</th>)}<th>h²</th><th>u²</th><th>Flags</th></tr></thead>
        <tbody>
          {order.map((i) => (
            <tr key={names[i]}>
              <td title={names[i]}>{short(names[i], 34)}</td>
              {M[i].map((v, f) => <td key={f} className={f === flags[i].factor ? 'main' : Math.abs(v) < blank ? 'dim' : ''}>{Math.abs(v) < blank ? '' : num(v)}</td>)}
              <td className={r.h2[i] < 0.4 ? 'warn' : r.h2[i] >= 0.995 ? 'bad' : ''}>{num(r.h2[i])}</td>
              <td>{num(r.u2[i])}</td>
              <td>{flags[i].clean ? <span className="qtag promote">Clean</span> : flags[i].flags.map((x) => <span key={x} className={`qtag ${FLAG_TXT[x][1]}`}>{FLAG_TXT[x][0]}</span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Factor analysis ──
function SurveystatsFactor() {
  const [source, setSource] = useState('data');
  const [text, setText] = useState(exampleFactorSurvey);
  const [mtext, setMtext] = useState(harmanText);
  const [nM, setNM] = useState('305');
  const { table, cols, setType } = useColumns(text);
  const [unpicked, setUnpicked] = useState([]);
  const [corr, setCorr] = useState('pearson');
  const [method, setMethod] = useState('minres');
  const [rotation, setRotation] = useState('oblimin');
  const [kText, setKText] = useState('');
  const [blank, setBlank] = useState('0.3');
  const [view, setView] = useState('pattern');
  const [fnames, setFnames] = useState([]);
  const selected = cols.filter(isNumericCol).map((c) => c.name).filter((nm) => !unpicked.includes(nm));
  const toggle = (nm) => setUnpicked((u) => (u.includes(nm) ? u.filter((x) => x !== nm) : [...u, nm]));

  const base = useMemo(() => {
    if (source === 'matrix') {
      const m = F.parseCorrMatrix(readTable(mtext).table), n = Math.round(Number(nM));
      if (m.error) return { error: m.error };
      if (!(n > m.names.length)) return { error: 'Enter the number of respondents behind the matrix (more than the number of items).' };
      if (m.names.length < 3) return { error: 'Factor analysis needs at least three items.' };
      return { R: m.R, n, names: m.names, X: null, dropped: 0, key: `m${hash(mtext)}|${n}` };
    }
    const nd = numericData(table, cols, selected);
    if (nd.names.length < 3) return { error: 'Tick at least three numeric items (rating scales or numbers) to analyse.' };
    if (nd.n < nd.names.length + 3) return { error: `Only ${nd.n} respondents answered every ticked item; factor analysis needs many more respondents than items.` };
    const flat = nd.cols.map((c, j) => (sdev(c) > 0 ? null : nd.names[j])).filter(Boolean);
    if (flat.length) return { error: `${flat.join(', ')} ${flat.length > 1 ? 'have' : 'has'} the same answer from everyone; untick ${flat.length > 1 ? 'them' : 'it'}.` };
    const polyOk = nd.types.every((t) => t === 'ordinal');
    return { R: corrMatrix(nd.cols), n: nd.n, names: nd.names, X: nd.X, cats: nd.cats, dropped: nd.dropped, polyOk, key: `d${hash(text)}|${nd.names.join('|')}` };
  }, [source, mtext, nM, table, cols, selected.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const usePoly = source === 'data' && corr === 'polychoric' && base.polyOk;
  const poly = useJob(usePoly && !base.error ? `poly|${base.key}` : null, () => runJob('polychoric', { cats: base.cats }, () => F.polychoricMatrix(base.cats)));
  const R = usePoly ? poly.result?.R : base.R;
  const n = base.n, p = base.names?.length || 0;
  const chk = useMemo(() => (R ? F.checks(R, n) : null), [R, n]);
  const eig = useMemo(() => (R ? F.eigenvalues(R) : null), [R]);
  const feig = useMemo(() => (R && chk && !chk.singular ? F.reducedEigenvalues(R) : null), [R, chk]);
  const map = useMemo(() => (R && p >= 4 ? F.mapTest(R) : null), [R, p]);
  const pa = useJob(R && !base.error ? `pa|${n}|${p}` : null, (prog) => runJob('parallel', { n, p, iters: 500, seed: 2024 }, () => F.parallelSim(n, p, { iters: 500, seed: 2024 }), prog));
  const sim = pa.result;
  const kPA = sim && eig ? Math.max(1, F.parallelK(eig, sim.pca95)) : null;
  const kFA = sim && feig ? F.parallelK(feig, sim.fa95) : null;
  const kaiser = eig ? eig.filter((v) => v > 1).length : 0;
  const maxK = Math.max(1, ledermann(p));
  const kUser = Math.round(Number(kText));
  const k = Math.min(maxK, Math.max(1, kText !== '' && kUser >= 1 ? kUser : kPA || (map ? Math.max(1, map.k) : 1)));
  const r = useMemo(() => (R && chk && !chk.singular && sim ? F.efa(R, n, k, { method, rotation }) : null), [R, chk, n, k, method, rotation, sim]);
  const flags = useMemo(() => (r ? F.itemFlags(r.pattern) : null), [r]);
  const alphas = useMemo(() => (r ? F.alphaPerFactor({ X: base.X, R: base.R }, flags, k) : null), [r, flags, base, k]);
  const thr = Number(blank) >= 0 ? Number(blank) : 0.3;
  const sum = r && chk ? F.faSummary({ chk, k, kPA, kMAP: map ? map.k : NaN, r, flags, alphas, names: base.names, factorNames: fnames, source }) : null;
  const fn = (f) => (fnames[f] && fnames[f].trim()) || `Factor ${f + 1}`;

  return (
    <div className="svs-root">
      <Choice label="Your data" value={source} onChange={setSource} options={[['data', 'Survey responses'], ['matrix', 'Correlation matrix']]} />
      {source === 'data' ? (
        <>
          <DataBox text={text} setText={setText} examples={[['Load example survey', exampleFactorSurvey]]} />
          {cols.length > 0 && <ColumnTable table={table} cols={cols} setType={setType} pick={{ label: 'Analyse', selected, toggle, eligible: isNumericCol }} />}
          <div className="calc-inputs">
            <Choice label="Correlations" value={corr} onChange={setCorr} options={[['pearson', 'Pearson'], ['polychoric', 'Polychoric (ordinal items)']]} />
          </div>
          {corr === 'polychoric' && !base.error && !base.polyOk && <Problem>Polychoric correlations need every ticked item to be an ordered scale; using Pearson instead.</Problem>}
          {usePoly && poly.result?.smoothed && <p className="svs-note">The polychoric matrix was not positive definite, so it was smoothed (eigenvalues floored at 10⁻⁶ and rescaled to a correlation matrix).</p>}
        </>
      ) : (
        <div className="calc-inputs">
          <Area label="Correlation matrix with a header row of item names (a first column of names is optional)" value={mtext} onChange={setMtext} rows={8} wrap="off" hint="The full matrix, or just the lower or upper triangle. Example: Harman's (1976) eight physical measurements of 305 girls." />
          <Num label="Respondents (n)" value={nM} onChange={setNM} min={10} />
          <div className="svs-actions"><button type="button" className="btn ghost small" onClick={() => { setMtext(harmanText()); setNM('305'); }}>Load Harman's 8 physical measures</button></div>
        </div>
      )}
      {base.error ? <Problem>{base.error}</Problem> : !R || !chk ? <p className="svs-note">Computing polychoric correlations…</p> : chk.singular ? <Problem>The correlation matrix is singular: at least one item is an exact combination of others (for example a total score next to its items). Remove it and try again.</Problem> : (
        <>
          <h2 className="svs-h">1. Is the data suitable?</h2>
          <Stats rows={[
            ['Respondents used', `${n}${base.dropped ? ` (${base.dropped} with missing answers left out)` : ''}`],
            ['Items', p],
            ['Respondents per item', num(n / p, 1)],
            ['KMO sampling adequacy', `${num(chk.kmo)} (${F.kmoLabel(chk.kmo)})`],
            ["Bartlett's test of sphericity", `χ²(${chk.bartlett.df}) = ${num(chk.bartlett.chi2, 1)}, p ${pv(chk.bartlett.p)}`],
            ['Determinant of R', chk.det < 1e-4 ? chk.det.toExponential(2) : num(chk.det, 5)],
          ]} />
          {chk.kmo < 0.6 && <Problem>KMO is below .60, so these items share too little common variance for a trustworthy factor analysis (Kaiser 1974). Check for unrelated items or add respondents.</Problem>}
          {chk.det < 1e-5 && <Problem>The determinant is below 0.00001, a sign of multicollinearity: some items are near-duplicates (Field 2013). Consider dropping one of each highly correlated pair (r above .90).</Problem>}
          <div className="clu-scroll">
            <table className="clu-table clu-num svs-table">
              <thead><tr><th>Item</th><th>MSA</th><th>Initial communality (SMC)</th>{base.X && <><th>Mean</th><th>SD</th></>}<th>Check</th></tr></thead>
              <tbody>{base.names.map((nm, i) => {
                const c = base.X ? base.X.map((row) => row[i]) : null;
                return (
                  <tr key={nm}><td title={nm}>{short(nm, 34)}</td><td className={chk.msa[i] < 0.5 ? 'bad' : chk.msa[i] < 0.6 ? 'warn' : ''}>{num(chk.msa[i])}</td><td className={chk.smc[i] < 0.2 ? 'warn' : ''}>{num(chk.smc[i])}</td>
                    {c && <><td>{num(mean(c))}</td><td>{num(sdev(c))}</td></>}
                    <td>{chk.msa[i] < 0.5 ? <span className="qtag fix">MSA under .50: consider dropping</span> : chk.smc[i] < 0.2 ? <span className="qtag opp">Shares little with the others</span> : <span className="qtag promote">OK</span>}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
          <details className="calc-about"><summary>Show the correlation matrix</summary><Matrix names={base.names} M={R} lower label="Correlation matrix" /></details>

          <h2 className="svs-h">2. How many factors?</h2>
          {!sim ? <p className="svs-note">Running parallel analysis (500 simulated data sets)… {pct(pa.progress || 0)}</p> : (
            <>
              <Result big={`${kPA} factor${kPA === 1 ? '' : 's'}`} label="suggested by parallel analysis (95th percentile of 500 random data sets)">
                <p>Keep factors whose eigenvalue is larger than you would get from random data of the same size. Velicer's MAP test suggests {map ? map.k : '—'}{map && map.k4 !== map.k ? ` (${map.k4} with the 2000 revision)` : ''}; the factor-based version of parallel analysis suggests {kFA ?? '—'}. The Kaiser rule (eigenvalue above 1) would keep {kaiser} <span className="qtag opp">Do not rely on the Kaiser rule</span></p>
              </Result>
              <ScreePlot observed={eig} sim95={sim.pca95} simMean={sim.pcaMean} k={k} />
              <details className="calc-about"><summary>Eigenvalues table</summary>
                <div className="clu-scroll"><table className="clu-table clu-num svs-table">
                  <thead><tr><th>#</th><th>Eigenvalue</th><th>% of variance</th><th>Random 95th</th><th>Random mean</th><th>Reduced eigenvalue</th><th>Random 95th (reduced)</th><th>MAP avg. r² partial</th></tr></thead>
                  <tbody>{eig.map((v, i) => (
                    <tr key={i}><td>{i + 1}</td><td className={v > sim.pca95[i] ? 'hi' : ''}>{num(v, 3)}</td><td>{pct(v / p, 1)}</td><td>{num(sim.pca95[i], 3)}</td><td>{num(sim.pcaMean[i], 3)}</td><td>{feig ? num(feig[i], 3) : '—'}</td><td>{num(sim.fa95[i], 3)}</td><td className={map && map.k === i + 1 ? 'hi' : ''}>{map && map.avgSq[i + 1] !== undefined ? map.avgSq[i + 1].toFixed(4) : ''}</td></tr>
                  ))}</tbody>
                </table></div>
                <p className="svs-note">MAP with no components removed: {map ? map.avgSq[0].toFixed(4) : '—'}. Bold rows beat the random data (eigenvalues) or are the MAP minimum.</p>
              </details>
              <div className="calc-inputs">
                <Num label="Number of factors" value={kText === '' ? String(k) : kText} onChange={setKText} min={1} max={maxK} hint={`Suggested: ${kPA}. Change it to compare solutions (at most ${maxK} for ${p} items).`} />
                {kText !== '' && <div className="svs-actions"><button type="button" className="btn ghost small" onClick={() => setKText('')}>Back to the suggestion</button></div>}
              </div>
            </>
          )}

          {r && (
            <>
              <h2 className="svs-h">3. Extraction and rotation</h2>
              <div className="calc-inputs">
                <Choice label="Extraction" value={method} onChange={setMethod} options={[['minres', 'Minimum residual'], ['paf', 'Principal axis'], ['ml', 'Maximum likelihood']]} />
                <Choice label="Rotation" value={rotation} onChange={setRotation} options={[['oblimin', 'Oblimin'], ['promax', 'Promax'], ['varimax', 'Varimax'], ['none', 'None']]} />
              </div>
              {method === 'paf' && !r.converged && <Problem>Principal axis factoring did not converge in 25 iterations (the SPSS default); the loadings are from the last iteration. Minimum residual reaches the converged solution.</Problem>}
              {r.heywood.length > 0 && <Problem>Heywood case: {r.heywood.map((i) => base.names[i]).join(', ')} {r.heywood.length > 1 ? 'have' : 'has'} a communality of 1 or more, which is impossible. Too many factors, too few respondents or a near-duplicate item are the usual causes.</Problem>}

              <h2 className="svs-h">4. Loadings</h2>
              <div className="svs-names">
                {Array.from({ length: k }, (_, f) => (
                  <label key={f}>Name for factor {f + 1}
                    <input type="text" value={fnames[f] || ''} placeholder={`e.g. from ${short(base.names[flags.findIndex((x) => x.factor === f)] || '', 18)}`} onChange={(e) => setFnames((a) => { const b = [...a]; b[f] = e.target.value; return b; })} />
                  </label>
                ))}
              </div>
              <div className="calc-inputs">
                {r.oblique && <Choice label="Show" value={view} onChange={setView} options={[['pattern', 'Pattern matrix'], ['structure', 'Structure matrix']]} />}
                <Num label="Hide loadings below" value={blank} onChange={setBlank} min={0} max={0.9} step={0.05} />
              </div>
              <Loadings r={r} names={base.names} factorNames={fnames} flags={flags} blank={thr} view={r.oblique ? view : 'pattern'} />
              <p className="svs-note">{r.oblique ? (view === 'pattern' ? 'Pattern loadings are each factor\'s unique contribution to an item (like regression weights); read these to name factors.' : 'Structure loadings are the correlations of items with factors; they include overlap between correlated factors.') : 'With an orthogonal rotation the loadings are the correlations of items with factors.'} Rows are sorted by main factor; bold is the main loading. Flags use the .40/.30/.20 rule: main loading at least .40, no other loading .30 or more, and at least .20 between the two largest.</p>

              <div className="svs-two">
                <div>
                  <h3 className="clu-h3">Variance explained</h3>
                  <div className="clu-scroll"><table className="clu-table clu-num svs-table">
                    <thead><tr><th>Factor</th><th>SS loadings</th><th>% of variance</th>{!r.oblique && <th>Cumulative</th>}</tr></thead>
                    <tbody>{r.ss.map((s, f) => <tr key={f}><td>{fn(f)}</td><td>{num(s)}</td><td>{pct(r.propVar[f], 1)}</td>{!r.oblique && <td>{pct(r.propVar.slice(0, f + 1).reduce((a, b) => a + b, 0), 1)}</td>}</tr>)}</tbody>
                  </table></div>
                  <p className="svs-note">All factors together: {pct(r.totalCommon, 1)} of the items' variance (mean communality). {r.oblique ? 'With correlated factors the per-factor shares overlap, so they do not add up to the total.' : ''} Root mean square residual {num(r.rmsr, 3)}; {pct(r.bigResid)} of residual correlations exceed .05.</p>
                  {r.mlTest && <p className="svs-note">ML test that {k} factor{k > 1 ? 's are' : ' is'} enough: χ²({r.mlTest.df}) = {num(r.mlTest.chi2, 2)}, p {pv(r.mlTest.p)}. With large samples this rejects almost any model, so read it alongside the residuals.</p>}
                </div>
                <div>
                  <h3 className="clu-h3">Reliability per factor (Cronbach's alpha)</h3>
                  <div className="clu-scroll"><table className="clu-table clu-num svs-table">
                    <thead><tr><th>Factor</th><th>Items (≥ .40)</th><th>Alpha</th></tr></thead>
                    <tbody>{alphas.map((a, f) => <tr key={f}><td>{fn(f)}</td><td>{a.items.length}{a.reversed?.length ? ` (${a.reversed.length} reversed)` : ''}</td><td className={a.alpha < 0.7 ? 'warn' : ''}>{Number.isFinite(a.alpha) ? `${num(a.alpha)}${a.standardised ? ' (standardised)' : ''}` : 'needs 2+ items'}</td></tr>)}</tbody>
                  </table></div>
                  {r.oblique && k > 1 && <><h3 className="clu-h3" style={{ marginTop: 16 }}>Factor correlations</h3><Matrix names={Array.from({ length: k }, (_, f) => fn(f))} M={r.Phi} lower label="Factor correlations" /></>}
                </div>
              </div>
              {sum && <StudySummary {...sum} />}
            </>
          )}
        </>
      )}
      <About method="exploratory-factor-analysis-efa" links={[['exploratory-factor-analysis-with-parallel-analysis', 'EFA with parallel analysis'], ['parallel-analysis', 'Parallel analysis'], ['scree-plot-vs-parallel-analysis', 'Scree plot vs parallel analysis'], ['factor-rotation-varimax-vs-oblimin', 'Factor rotation'], ['loading-and-cross-loading-criteria-for-item-retention-40-30-20-rule', 'Loading criteria (.40/.30/.20)'], ['communalities-interpretation', 'Communalities'], ['spss-factor-procedure-for-exploratory-factor-analysis', 'SPSS FACTOR'], ['polychoric-correlation-for-rating-scale-items', 'Polychoric correlation'], ['validated-scale-construction', 'Validated scale construction']]}>
        <p><b>Checks.</b> The <b>KMO</b> measure compares correlations with partial correlations: KMO = Σr²ᵢⱼ / (Σr²ᵢⱼ + Σq²ᵢⱼ) over pairs i ≠ j, where qᵢⱼ = −R⁻¹ᵢⱼ / √(R⁻¹ᵢᵢ R⁻¹ⱼⱼ); each item's MSA uses its own row. Kaiser (1974): .90s marvellous, .80s meritorious, .70s middling, .60s mediocre, .50s miserable, below .50 unacceptable. <b>Bartlett's test</b> asks whether R could be an identity matrix: χ² = −(n − 1 − (2p + 5)/6) ln|R| on p(p − 1)/2 df. A determinant below 0.00001 signals near-duplicate items. The <b>initial communality</b> of an item is its squared multiple correlation with the others, 1 − 1/R⁻¹ᵢᵢ.</p>
        <p><b>How many factors.</b> <b>Parallel analysis</b> (Horn 1965) simulates 500 data sets of independent normal variables with your n and p and keeps factors while your eigenvalue exceeds the 95th percentile of the simulated ones (Glorfeld 1995); the mean is shown too. It is run on the eigenvalues of R (components, the classic version, used for the suggestion) and of R with SMCs on the diagonal (the factor version, as in psych's fa.parallel). <b>Velicer's MAP test</b> removes the first m principal components and averages the squared (or, in the 2000 revision, fourth-power) partial correlations; the m with the smallest average is suggested. The <b>Kaiser rule</b> (eigenvalues above 1) is shown only because SPSS uses it by default: it over-extracts with many items and under-extracts with few.</p>
        <p><b>Extraction.</b> <b>Minimum residual</b> (minres, unweighted least squares) chooses uniquenesses ψ to minimise the sum of squared residual correlations, which equals the sum of the squared eigenvalues of R − diag ψ beyond the first k, with ψ kept between .005 and 1 (as psych and factor_analyzer do); loadings are the first k eigenvectors of R − diag ψ times √eigenvalue. <b>Principal axis factoring</b> follows SPSS: start from the SMCs, put communalities on the diagonal, extract, recompute communalities, and stop after 25 iterations or when no communality changes by more than .001. Run to convergence it reaches the minres solution. <b>Maximum likelihood</b> minimises Jöreskog's F(ψ) = −Σⱼ₎ₖ(ln θⱼ − θⱼ) − p + k over the eigenvalues θ of Ψ^−½RΨ^−½, as R's factanal does, and adds a χ² test of fit with Bartlett's correction, (n − 1 − (2p + 5)/6 − 2k/3)F on ((p − k)² − p − k)/2 df.</p>
        <p><b>Rotation.</b> <b>Varimax</b> (Kaiser 1958, with Kaiser normalisation) keeps factors uncorrelated. <b>Oblimin</b> (direct quartimin, γ = 0) is fitted by the gradient projection algorithm (Bernaards & Jennrich 2005) and lets factors correlate; <b>promax</b> raises normalised varimax loadings to the 4th power as a target and fits an oblique rotation to it. For oblique rotations the pattern matrix holds the loadings, the factor correlation matrix Φ is shown, and the structure matrix is pattern × Φ. Factors are ordered by their sum of squared loadings and signed so their loadings sum to a positive number. Communality h² is the row sum of squared unrotated loadings; uniqueness u² = 1 − h².</p>
        <p><b>Items and reliability.</b> The .40/.30/.20 rule (Howard 2016) keeps an item whose main loading is at least .40, with no other loading of .30 or more and at least .20 between the two. Cronbach's alpha per factor uses the items whose main loading on it is at least .40 (negative loaders reverse-scored), computed by the same function as the Scale reliability calculator. <b>Polychoric correlations</b> treat each rating item as a cut-up normal variable: thresholds come from the cumulative answer shares, and ρ maximises the likelihood of the cross-table under a bivariate normal (Olsson 1979, two-step); a matrix that is not positive definite is smoothed.</p>
        <p>Validated against factor_analyzer (KMO, Bartlett, minres, ML, varimax, promax and oblimin), numpy re-implementations (principal axis, MAP, parallel analysis), pingouin (alpha), scipy (polychoric, bivariate normal), Harman's (1976) published minres loadings for the eight physical variables and R's factanal χ² for them (<code>npm run check:surveystats</code>).</p>
        <p><b>When not to use it.</b> With fewer than about 100 respondents, or fewer than 5 per item, solutions are unstable unless communalities are high (MacCallum et al. 1999). Do not factor items that use different response formats without thinking about it, items that are sums of others, or formative indices (checklists that define a construct rather than reflect it). EFA explores; to test a structure you already have, use confirmatory factor analysis in the Scale validity tool or SEM software.</p>
      </About>
    </div>
  );
}

export default SurveystatsFactor;
