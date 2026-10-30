import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as I from './scorers-items.js';
import { ITEM_EXAMPLE } from './scorers-examples.js';
import { toCSV } from './scorers-math.js';
import { Table } from './scorers-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About, num, download } from './ui.jsx';

// Wright map: persons as a histogram on the left of a shared logit axis, items on the right.
function WrightMap({ r, names }) {
  const th = r.theta, b = r.b;
  const lo = Math.floor(Math.min(...th, ...b) * 2) / 2 - 0.5, hi = Math.ceil(Math.max(...th, ...b) * 2) / 2 + 0.5;
  const bins = []; for (let v = lo; v < hi - 1e-9; v += 0.5) bins.push({ from: v, n: th.filter((t) => t >= v && t < v + 0.5).length });
  const W = 640, T = 16, B = 30, rowPx = 30, H = T + bins.length * rowPx + B, mid = 300, maxN = Math.max(...bins.map((x) => x.n), 1);
  const sy = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const placed = b.map((bi, i) => ({ bi, i, y: sy(bi) })).sort((a, c) => a.y - c.y);
  for (let k = 1; k < placed.length; k++) if (placed[k].y - placed[k - 1].y < 13) placed[k].y = placed[k - 1].y + 13;
  const mis = new Set(r.itemFit.map((f, i) => (f.infit > 1.5 || f.outfit > 1.5 ? i : -1)).filter((i) => i >= 0));
  const lift = Math.max(0, placed.length ? placed[placed.length - 1].y - (H - B) : 0);
  const Hh = H + lift;
  return (
    <div className="tl-scroll sc-contain">
      <svg viewBox={`0 0 ${W} ${Hh}`} width={W} className="tl-plot sc-wide sc-wright" role="img" aria-label="Wright map: person measures and item difficulties on one logit scale">
        <text x={mid - 12} y={12} className="ax" textAnchor="end">Persons (each bar = people in a 0.5-logit band)</text>
        <text x={mid + 12} y={12} className="ax">Items (red = misfit)</text>
        {bins.map((x) => <g key={x.from}><rect x={mid - 10 - (x.n / maxN) * (mid - 70)} y={sy(x.from + 0.5) + 2} width={(x.n / maxN) * (mid - 70)} height={rowPx - 4} className="pbar" />{x.n > 0 && <text x={mid - 14 - (x.n / maxN) * (mid - 70)} y={sy(x.from + 0.25) + 4} className="lbs" textAnchor="end">{x.n}</text>}</g>)}
        {bins.map((x) => <text key={`t${x.from}`} x={18} y={sy(x.from) + 4} className="ax">{num(x.from, 1)}</text>)}
        <line x1={mid} x2={mid} y1={T} y2={H - B} className="axis" />
        {placed.map((p) => (
          <g key={p.i}>
            <line x1={mid} x2={mid + 10} y1={sy(p.bi)} y2={p.y} className="grid" />
            <circle cx={mid} cy={sy(p.bi)} r={3} className="item" />
            <text x={mid + 14} y={p.y + 4} className={`item-t${mis.has(p.i) ? ' misfit' : ''}`}>{names[r.keepItems[p.i]] || `Q${r.keepItems[p.i] + 1}`} ({num(p.bi, 2)})</text>
          </g>
        ))}
        <text x={mid} y={H - B + 18} className="ax" textAnchor="middle">Logits: higher = more able / harder</text>
      </svg>
    </div>
  );
}

const pill = (flags) => (flags.length ? flags.map((f) => <span key={f} className={`sc-pill ${/negative|key/.test(f) ? 'bad' : 'warn'}`}>{f}</span>) : <span className="sc-pill ok">ok</span>);

// ── Item analysis and Rasch ──
function ScorersItemAnalysis() {
  const [text, setText] = useState(ITEM_EXAMPLE);
  const [view, setView] = useState('classical');
  const [method, setMethod] = useState('CML');
  const p = useMemo(() => I.parseItems(text), [text]);
  const complete = useMemo(() => p.rows.filter((r) => r.every(Number.isFinite)), [p]);
  const c = useMemo(() => (complete.length >= 3 && p.rows[0]?.length >= 2 ? I.classical(complete, { raw: p.raw, key: p.key }) : null), [complete, p]);
  const dich = complete.length > 0 && complete.every((r) => r.every((v) => v === 0 || v === 1));
  const ra = useMemo(() => (view === 'rasch' && dich ? I.rasch(complete, { method }) : null), [view, dich, complete, method]);
  const dropped = p.rows.length - complete.length;
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(ITEM_EXAMPLE); setView('classical'); setMethod('CML'); }}>Load example (20-question design-system quiz, 160 staff)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="One person per row: scored items (0/1 or points), or letter answers with a key line" value={text} onChange={setText} rows={8} hint='Letter answers need a line such as "key: B C A D …"; a blank answer counts as wrong. An ID column and a header row are optional.' />
        <Choice label="View" value={view} onChange={setView} options={[['classical', 'Classical item analysis'], ['rasch', 'Rasch model (0/1 items)']]} />
        {view === 'rasch' && <Choice label="Estimation" value={method} onChange={setMethod} options={[['CML', 'Conditional ML'], ['JML', 'Joint ML, (L − 1)/L corrected']]} />}
      </div>
      {dropped > 0 && <Problem>Left out {dropped} row{dropped === 1 ? '' : 's'} with missing scores.</Problem>}
      {!c ? <Problem>Enter at least three people and two items.</Problem> : view === 'classical' ? (
        <>
          <Result big={`${c.dich ? 'KR-20' : 'Alpha'} = ${num(c.alpha, 3)}`} tone={c.alpha >= 0.8 ? 'good' : c.alpha < 0.6 ? 'bad' : ''} label={`${c.k} items, ${c.n} people; mean total ${num(c.meanTotal, 2)} (SD ${num(c.sdTotal, 2)}); SEM ${num(c.sem, 2)}`} />
          <Table label="Item statistics" head={['Item', 'Difficulty p', 'D (upper − lower 27%)', 'Point-biserial', 'Corrected item-total r', 'Alpha if deleted', 'Review']}
            rows={c.items.map((it) => ({ cls: it.rit < 0 ? 'tl-cell-bad' : '', cells: [p.names[it.item - 1], num(it.p, 2), `${num(it.D, 2)} (${I.ebel(it.D)})`, num(it.rpb, 3), num(it.rit, 3), num(it.aid, 3), <span className="clu-tags" key="f">{pill(it.flags)}</span>] }))} />
          <p className="tl-note">Upper and lower groups: the top and bottom {c.g} people ({Math.round(0.27 * 100)}%) by total score. D bands from Ebel and Frisbie (1991).</p>
          {c.items.some((it) => it.distractors) && (
            <details className="calc-about"><summary>Distractor analysis (share choosing each option)</summary>
              <Table label="Distractor analysis" head={['Item', 'Option', 'All', `Upper ${c.g}`, `Lower ${c.g}`]}
                rows={c.items.flatMap((it) => it.distractors.map((d, k) => ({ cls: d.key ? 'on' : (d.upper > d.lower && d.upper >= 0.1 && d.option !== '(blank)') ? 'tl-cell-bad' : '', cells: [k === 0 ? p.names[it.item - 1] : '', `${d.option}${d.key ? ' (key)' : ''}`, num(d.all, 2), num(d.upper, 2), num(d.lower, 2)] })))} />
            </details>
          )}
          <StudySummary {...I.classicalSummary(c, p.names)} />
        </>
      ) : !dich ? <Problem>The Rasch model here is for right/wrong (0/1) items. Score the answers first or use a key.</Problem> : ra?.error ? <Problem>{ra.error}</Problem> : ra && (
        <>
          <Result big={`Person reliability ${num(ra.relPerson, 2)}`} label={`${ra.method}${ra.method === 'JML' ? ` × ${num(ra.correction, 3)}` : ''}; ${ra.L} items, ${ra.N} people (${ra.extremePersons} with extreme scores); item reliability ${num(ra.relItem, 2)}; targeting ${num(ra.targeting, 2)} logits`}>
            {ra.extremeItems.length > 0 && <p>Left out of the model (no information): {ra.extremeItems.map((x) => `${p.names[x.item - 1]} (all ${x.all})`).join(', ')}.</p>}
          </Result>
          <WrightMap r={ra} names={p.names} />
          <Table label="Rasch item measures" head={['Item', 'Difficulty (logits)', 'SE', 'Infit MNSQ', 'Infit ZSTD', 'Outfit MNSQ', 'Outfit ZSTD', 'Fit']}
            rows={ra.b.map((b, i) => { const f = ra.itemFit[i]; const band = I.fitBand(Math.max(f.infit, f.outfit)); return { cls: band === 'noisy' || band === 'distorting' ? 'tl-cell-bad' : '', cells: [p.names[ra.keepItems[i]], num(b, 3), num(ra.se[i], 3), num(f.infit, 2), num(f.inZ, 2), num(f.outfit, 2), num(f.outZ, 2), Math.min(f.infit, f.outfit) < 0.5 && band === 'productive' ? 'overfitting' : band] }; })} />
          <Stats rows={[['Person separation', `${num(ra.sepPerson, 2)} (reliability ${num(ra.relPerson, 3)})`], ['Item separation', `${num(ra.sepItem, 2)} (reliability ${num(ra.relItem, 3)})`], ['Mean person measure', `${num(ra.meanTheta, 2)} logits (SD ${num(ra.sdTheta, 2)})`], ['Iterations', `${ra.iterations}${ra.converged ? '' : ' (did not converge)'}`], ['Score-to-measure', ra.byScore.map((x, s) => `${s}: ${num(x.theta, 2)}`).join(' · ')]]} />
          <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => download('rasch-persons.csv', toCSV(['person', 'score', 'measure', 'se', 'infit', 'outfit'], complete.map((_, v) => [p.labels[p.rows.indexOf(complete[v])] ?? v + 1, ra.scores[v], +ra.theta[v].toFixed(4), +ra.pse[v].toFixed(4), ra.personFit[v] ? +ra.personFit[v].infit.toFixed(3) : '', ra.personFit[v] ? +ra.personFit[v].outfit.toFixed(3) : ''])), 'text/csv')}>Download person measures (CSV)</button></div>
          <StudySummary {...I.raschSummary(ra, p.names)} />
        </>
      )}
      <About method="classical-item-analysis-difficulty-and-discrimination-indices" links={[['item-response-theory-irt-rasch-model', 'Item response theory and the Rasch model'], ['reliability-analysis-cronbachs-alpha-split-half-omega', 'Reliability analysis']]}>
        <p><b>Classical item analysis.</b> Difficulty p = item mean ÷ item maximum (share correct for 0/1 items). Discrimination D = (mean in the upper 27% − mean in the lower 27%) ÷ maximum, groups formed by total score (Kelley 1939); bands ≥ .40 very good, .30–.39 reasonably good, .20–.29 marginal, below .20 poor (Ebel and Frisbie 1991). Point-biserial r = Pearson r of the item with the total; corrected item-total r uses the total without the item. Alpha = k/(k − 1)·(1 − Σs²ᵢ/s²_total), which is KR-20 for 0/1 items; alpha if deleted recomputes it without the item; SEM = SD_total·√(1 − alpha).</p>
        <p><b>Rasch model.</b> P(xᵥᵢ = 1) = exp(θᵥ − bᵢ)/(1 + exp(θᵥ − bᵢ)). Conditional ML maximises Σᵥ log P(xᵥ | rᵥ) = −Σᵢ sᵢbᵢ − Σᵣ nᵣ log γᵣ(ε), with εᵢ = exp(−bᵢ) and γᵣ the elementary symmetric functions, by Newton-Raphson using the exact information matrix; difficulties are centred at 0 and their SEs come from the Moore-Penrose inverse of the information (Andersen 1972; Fischer and Molenaar 1995). Persons with a score of 0 or L and items everyone got right or wrong carry no information and are left out of estimation. Joint ML alternates person and item Newton steps and multiplies the difficulties by (L − 1)/L to remove most of JML's known bias (Wright and Douglas 1977; Wright and Masters 1982). Person measures are maximum-likelihood estimates given the items, with extreme scores set to 0.3 and L − 0.3. Outfit = mean of z² = (x − P)²/(P(1 − P)); infit = Σ(x − P)²/ΣP(1 − P); ZSTD by the Wilson-Hilferty cube-root transformation (Wright and Masters 1982). Mean-squares 0.5–1.5 are productive for measurement (Linacre 2002). Separation reliability = (observed variance − mean error variance)/observed variance.</p>
        <p><b>When not to use it.</b> Classical statistics depend on who took the test; a different group gives different values. The Rasch model assumes one dimension, equal discrimination and local independence; if items clearly differ in discrimination (very different point-biserials) or the test mixes skills, the fit statistics will say so and a 2PL model or separate scales may suit better. Use at least 30 people (Linacre 1994), and preferably 100 or more, before trusting item difficulties. For rating scales use the <Link to="/calculators/reliability">scale reliability</Link> tools instead.</p>
      </About>
    </>
  );
}

export default ScorersItemAnalysis;
