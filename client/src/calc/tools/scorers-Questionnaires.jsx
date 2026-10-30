import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StudySummary from '../../components/StudySummary.jsx';
import * as Q from './scorers-qkeys.js';
import { QUESTIONNAIRE_EXAMPLES as EX } from './scorers-examples.js';
import { parseMatrix, toCSV } from './scorers-math.js';
import { IntervalRows, Table, color } from './scorers-charts.jsx';
import { Area, Choice, Num, Pick, Result, Stats, Problem, About, num, pv, download } from './ui.jsx';

const NAMES = { sd: 'Semantic differential profile', pmf: 'Sean Ellis product/market fit (40% rule)' };
const nameOf = (id) => Q.INSTRUMENTS[id]?.name || NAMES[id];
// Questionnaires that already have their own calculator on the site.
const ELSEWHERE = [['sus', 'SUS'], ['umux-lite', 'UMUX and UMUX-Lite'], ['sum', 'SUM'], ['seq', 'SEQ'], ['nasa-tlx', 'NASA-TLX'], ['ueq', 'UEQ'], ['attrakdiff', 'AttrakDiff'], ['nps', 'NPS']];

function Profile({ r }) {
  const W = 640, rowH = 30, T = 24, B = 30, L = 150, R = 150;
  const H = T + r.pairs.length * rowH + B;
  const sx = (v) => L + ((v - r.min) / (r.max - r.min)) * (W - L - R);
  const ticks = Array.from({ length: r.max - r.min + 1 }, (_, i) => r.min + i);
  return (
    <div className="tl-scroll sc-contain">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} className="tl-plot sc-wide sc-profile" role="img" aria-label="Semantic differential profile: mean position on each word pair by group">
        {ticks.map((t) => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={T - 6} y2={H - B} className={t === r.mid ? 'mid' : 'grid'} /><text x={sx(t)} y={T - 10} className="ax" textAnchor="middle">{t}</text></g>)}
        {r.pairs.map((p, j) => {
          const y = T + j * rowH + rowH / 2;
          const [left, right] = p.rev ? [p.right, p.left] : [p.left, p.right];
          return (
            <g key={j}>
              <text x={L - 10} y={y + 4} className="lb" textAnchor="end">{left.length > 20 ? `${left.slice(0, 19)}…` : left}</text>
              <text x={W - R + 10} y={y + 4} className="lb">{right.length > 20 ? `${right.slice(0, 19)}…` : right}{p.rev ? ' *' : ''}</text>
            </g>
          );
        })}
        {r.prof.map((g, gi) => {
          const pts = g.items.map((it, j) => [sx(it.mean), T + j * rowH + rowH / 2]).filter(([x]) => Number.isFinite(x));
          return (
            <g key={g.group}>
              {g.items.map((it, j) => Number.isFinite(it.lo) && <line key={`ci${j}`} x1={sx(Math.max(r.min, it.lo))} x2={sx(Math.min(r.max, it.hi))} y1={T + j * rowH + rowH / 2 + (gi - 0.5) * 4} y2={T + j * rowH + rowH / 2 + (gi - 0.5) * 4} style={{ stroke: color(gi), strokeWidth: 1.4, opacity: 0.7 }} />)}
              <polyline points={pts.map((p) => p.join(',')).join(' ')} className="ln" style={{ stroke: color(gi) }} />
              {pts.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={4.5} style={{ fill: color(gi) }} />)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ScalePanel({ id, conf }) {
  const ins = Q.INSTRUMENTS[id];
  const [text, setText] = useState(EX[id]);
  const [pol, setPol] = useState('std');
  const [groups, setGroups] = useState(id === 'pens' ? EX.pensGroups : '');
  const m = useMemo(() => parseMatrix(text), [text]);
  const spec = useMemo(() => (ins.raw ? Q.parseGroupsSpec(groups, m.k) : null), [ins, groups, m.k]);
  const short = !ins.raw && m.k < ins.items;
  const res = useMemo(() => (m.rows.length && !short ? Q.scoreInstrument(id, m.rows, { polarity: pol, groups: spec, conf }) : null), [id, m, pol, spec, conf, short]);
  const main = res?.scales[0];
  const fmtScore = (v) => num(v, ins.score === 'sum' || ins.max > 20 ? 1 : 2);
  const sMin = ins.score === 'sum' ? ins.min * ins.items : ins.min, sMax = ins.score === 'sum' ? ins.max * ins.items : ins.max;
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(EX[id]); setPol('std'); if (id === 'pens') setGroups(EX.pensGroups); }}>Load example</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label={`One respondent per row${ins.raw ? '' : `, ${ins.items} item${ins.items === 1 ? '' : 's'} in order`} (optional ID column and header row)`} value={text} onChange={setText} rows={8} hint={`${ins.anchors}. Blank, NA or . = missing.`} />
        {ins.polarity && <Choice label="Answer scale" value={pol} onChange={setPol} options={ins.polarityDefault === 'high' ? [['std', `${ins.max} = agree / likely (higher better)`], ['rev', `${ins.min} = agree / likely (reversed)`]] : [['std', `${ins.min} = strongly agree (standard)`], ['rev', `${ins.max} = strongly agree (reversed form)`]]} />}
        {ins.raw && <Area label="Your groups of columns (from your licensed key): name: columns" value={groups} onChange={setGroups} rows={2} hint="For example: Competence: 1-3; Autonomy: 4-6. Leave blank for the mean of all columns." />}
      </div>
      <p className="tl-note"><b>Scoring.</b> {ins.scoring} <b>Licence.</b> {ins.license}</p>
      {short && <Problem>{ins.short} has {ins.items} items but the data has {m.k} column{m.k === 1 ? '' : 's'}.</Problem>}
      {!short && !ins.raw && m.k > ins.items && <Problem>Using the first {ins.items} of {m.k} columns.</Problem>}
      {res?.outOfRange > 0 && <Problem>{res.outOfRange} answer{res.outOfRange === 1 ? ' is' : 's are'} outside {ins.min}–{ins.max} and {res.outOfRange === 1 ? 'was' : 'were'} treated as missing.</Problem>}
      {res && main && Number.isFinite(main.mean) ? (
        <>
          <Result big={`${main.name} ${fmtScore(main.mean)}`} label={`${Math.round(conf * 100)}% CI ${fmtScore(main.lo)} to ${fmtScore(main.hi)}; n = ${main.n}${Number.isFinite(main.bench) ? `; ${ins.benchKind === 'midpoint' ? 'neutral midpoint' : 'published mean'} ${main.bench}` : ''}${ins.better === 'low' ? '; lower is better' : ins.better === 'high' ? '; higher is better' : ''}`}>
            {id === 'smeq' && <p>Nearest verbal anchor: "{Q.smeqLabel(main.mean)}".</p>}
            {id === 'swls' && <p>Band: {Q.swlsBand(Math.round(main.mean))} (Pavot and Diener 2008).</p>}
            {ins.rescale && <p>0–100 rescaled (higher better): {num(Q.rescale100(main.mean), 1)}.</p>}
          </Result>
          <IntervalRows label={`${ins.short} scale means with confidence intervals`} min={sMin} max={sMax}
            rows={res.scales.map((s, i) => ({ name: s.name, est: s.mean, lo: s.lo, hi: s.hi, mark: s.bench, bold: i === 0, color: color(i) }))}
            right={(row) => num(row.est, 2)} xLabel={`${ins.short} score (${ins.min}–${ins.max}${ins.score === 'sum' ? ' per item, summed' : ''}); black tick = ${ins.benchKind === 'midpoint' ? 'neutral midpoint' : 'published mean'}`} />
          <Table label="Scale scores" head={['Scale', 'Items', 'n', 'Mean', 'SD', `${Math.round(conf * 100)}% CI`, 'Benchmark', 't test vs benchmark', 'Alpha']}
            rows={res.scales.map((s) => [s.name, s.items.length > 6 ? `${s.items[0]}–${s.items[s.items.length - 1]}` : s.items.join(', '), s.n, fmtScore(s.mean), num(s.sd, 2), `${fmtScore(s.lo)} to ${fmtScore(s.hi)}`, Number.isFinite(s.bench) ? s.bench : '—', s.test ? `t(${s.test.df}) = ${num(s.test.t, 2)}, p ${pv(s.test.p)}` : '—', Number.isFinite(s.alpha) ? `${num(s.alpha, 2)} (n = ${s.nFull})` : '—'])} />
          <p className="tl-note">Benchmark: {ins.benchSource}. Source: {ins.cite}</p>
          {id === 'smeq' && <ul className="sc-items">{Q.SMEQ_ANCHORS.map(([v, l]) => <li key={v}>{v}: {l}</li>)}</ul>}
          {res.k <= 40 && (
            <details className="calc-about"><summary>Item means</summary>
              <Table label="Item means" head={['Item', 'n', 'Mean', 'SD']} rows={res.itemStats.map((it) => [m.names[it.item - 1] || it.item, it.n, num(it.mean, 2), num(it.sd, 2)])} />
            </details>
          )}
          <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => download(`${ins.short.toLowerCase()}-scores.csv`, toCSV(['respondent', ...res.scales.map((s) => s.key)], res.perResp.map((p, i) => [m.labels[i], ...res.scales.map((s) => (Number.isFinite(p[s.key]) ? +p[s.key].toFixed(4) : ''))])), 'text/csv')}>Download respondent scores (CSV)</button></div>
          <StudySummary {...Q.questionnaireSummary(res)} />
        </>
      ) : !short && <Problem>Enter at least one respondent with enough answers to score.</Problem>}
    </>
  );
}

function SemanticPanel({ conf }) {
  const [text, setText] = useState(EX.sd);
  const [mn, setMn] = useState('1'); const [mx, setMx] = useState('7');
  const s = useMemo(() => Q.parseSemantic(text), [text]);
  const lo = Math.round(Number(mn)), hi = Math.round(Number(mx));
  const r = useMemo(() => (s.rows.length && s.pairs.length && hi > lo ? Q.semanticProfile(s.rows, s.groups, s.pairs, { min: lo, max: hi, conf }) : null), [s, lo, hi, conf]);
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(EX.sd); setMn('1'); setMx('7'); }}>Load example (current app vs redesign)</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label="Header: one word pair per column as Left|Right (* = positive word on the left). Rows: optional group, then answers" value={text} onChange={setText} rows={8} hint="Pairs marked * are reversed so that the right-hand pole is always the positive one in the profile." />
        <Num label="Lowest answer" value={mn} onChange={setMn} /><Num label="Highest answer" value={mx} onChange={setMx} />
      </div>
      {!r ? <Problem>Enter a header of word pairs and at least one row of answers.</Problem> : (
        <>
          <Result big={r.prof.length >= 2 ? `D = ${num(r.D, 2)}` : `Mean ${num(r.prof[0].overall, 2)}`} label={r.prof.length >= 2 ? `Profile distance between ${r.prof[0].group} and ${r.prof[1].group} (√Σd², Osgood 1957)` : `Average position across ${r.pairs.length} pairs, ${r.min}–${r.max}`} />
          <Profile r={r} />
          <ul className="sc-legend">{r.prof.map((g, i) => <li key={g.group}><i style={{ background: color(i) }} />{g.group} (n = {g.n}, mean {num(g.overall, 2)})</li>)}</ul>
          <Table label="Pair means by group" head={['Pair', ...r.prof.map((g) => `${g.group} mean [${Math.round(conf * 100)}% CI]`)]} rows={r.pairs.map((p, j) => [`${p.rev ? `${p.right}–${p.left}` : `${p.left}–${p.right}`}`, ...r.prof.map((g) => `${num(g.items[j].mean, 2)} [${num(g.items[j].lo, 2)}, ${num(g.items[j].hi, 2)}]`)])} />
          <StudySummary {...Q.semanticSummary(r)} />
        </>
      )}
    </>
  );
}

function PmfPanel({ conf }) {
  const [text, setText] = useState(EX.pmf);
  const [na, setNa] = useState(false);
  const p = useMemo(() => Q.parsePmf(text), [text]);
  const r = useMemo(() => Q.pmf(p.counts, { includeNA: na, conf }), [p, na, conf]);
  return (
    <>
      <div className="tl-row sc-row"><button type="button" className="btn ghost small" onClick={() => { setText(EX.pmf); setNa(false); }}>Load example</button></div>
      <div className="calc-inputs sc-inputs">
        <Area label='"How would you feel if you could no longer use the product?" One answer per line, or "answer, count"' value={text} onChange={setText} rows={6} hint="Very / Somewhat / Not disappointed / N/A (no longer use), or codes 1–4 in that order." />
        <Choice label='"I no longer use it" answers' value={na} onChange={setNa} options={[[false, 'Leave out (usual)'], [true, 'Count in the base']]} />
      </div>
      {p.bad > 0 && <Problem>Could not read {p.bad} line{p.bad === 1 ? '' : 's'}.</Problem>}
      {!r ? <Problem>Enter some answers.</Problem> : (
        <>
          <Result big={`${num(r.share * 100, 1)}% very disappointed`} tone={r.lo > 0.4 ? 'good' : r.hi < 0.4 ? 'bad' : ''} label={`${Math.round(conf * 100)}% Wilson CI ${num(r.lo * 100, 1)}% to ${num(r.hi * 100, 1)}%; ${r.very} of ${r.n}; benchmark 40% (Ellis)`} />
          <IntervalRows label="Share very disappointed with its interval against the 40% line" min={0} max={100} refs={[{ x: 40, label: '40%' }]} rows={[{ name: 'Very disappointed', est: r.share * 100, lo: r.lo * 100, hi: r.hi * 100, bold: true, color: 'var(--c1)' }]} xLabel="Percent of answers" fmtX={(v) => `${v}%`} />
          <Stats rows={[['Very disappointed', r.counts.very], ['Somewhat disappointed', r.counts.somewhat], ['Not disappointed', r.counts.not], ['No longer use', `${r.counts.na}${na ? '' : ' (left out)'}`], ['Exact test: share > 40%', `one-sided p ${pv(r.pAbove)}; two-sided p ${pv(r.pTwo)}`]]} />
          <StudySummary {...Q.pmfSummary(r)} />
        </>
      )}
    </>
  );
}

// ── Questionnaire scorer pack ──
function ScorersQuestionnaires() {
  const [id, setId] = useState('pssuq');
  const [conf, setConf] = useState(0.95);
  return (
    <>
      <div className="calc-inputs sc-inputs">
        <Pick label="Questionnaire" value={id} onChange={setId} options={Q.ORDER.map((k) => [k, nameOf(k)])} />
        <Choice label="Confidence level" value={conf} onChange={setConf} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
      </div>
      <p className="tl-note">Already on the site with their own scorers: {ELSEWHERE.map(([cid, n], i) => <span key={cid}>{i > 0 && ', '}<Link to={`/calculators/${cid}`}>{n}</Link></span>)}.</p>
      {id === 'sd' ? <SemanticPanel key={id} conf={conf} /> : id === 'pmf' ? <PmfPanel key={id} conf={conf} /> : <ScalePanel key={id} id={id} conf={conf} />}
      <About method="pssuq-csuq-post-study-and-computer-system-usability-questionnaires" links={[['after-scenario-questionnaire-asq', 'ASQ'], ['smeq-subjective-mental-effort-question', 'SMEQ'], ['user-engagement-scale-ues', 'User Engagement Scale'], ['technology-acceptance-model-tam-questionnaires', 'TAM'], ['self-assessment-manikin-sam', 'SAM'], ['semantic-differential', 'Semantic differential'], ['sean-ellis-product-market-fit-survey', 'Sean Ellis PMF survey'], ['game-experience-questionnaire-geq', 'GEQ'], ['player-experience-of-need-satisfaction-pens', 'PENS'], ['subjective-well-being-questionnaires-swls-shs-ons4', 'SWLS']]}>
        <p><b>Scores.</b> Each scale score is the mean of the respondent's answered items (the sum for the SWLS), with reversed items scored as min + max − x. A respondent needs at least half of a scale's items (all five for the SWLS). The interval is the t interval x̄ ± t(n − 1)·s/√n over respondents; the benchmark test is a one-sample t test. Cronbach's alpha uses respondents who answered every item of the scale.</p>
        <p><b>Keys.</b> PSSUQ/CSUQ v3 (Lewis 2002): Overall 1–16, SysUse 1–6, InfoQual 7–12, IntQual 13–15; 1 = strongly agree, so lower is better; norms 2.82, 2.80, 3.02, 2.49 (Sauro and Lewis 2016). ASQ: mean of 3 items, same polarity (Lewis 1991). SMEQ: 0–150 (Zijlstra 1993). UES-SF: FA 1–3, PU 4–6 (reversed), AE 7–9, RW 10–12 on 1–5 (O'Brien, Cairns and Hall 2018). TAM: PU 1–6, PEOU 7–12 (Davis 1989). SAM: valence, arousal and dominance on 1–9 (Bradley and Lang 1994). GEQ core: competence 2, 10, 15, 17, 21; immersion 3, 12, 18, 19, 27, 30; flow 5, 13, 25, 28, 31; tension 22, 24, 29; challenge 11, 23, 26, 32, 33; negative affect 7, 8, 9, 16; positive affect 1, 4, 6, 14, 20 on 0–4 (IJsselsteijn, de Kort and Poels 2013). SWLS: sum of 5 items, bands 5–9 … 31–35 (Pavot and Diener 2008). The 0–100 rescaling for PSSUQ, CSUQ and ASQ is (7 − x)/6 × 100.</p>
        <p><b>Semantic differential.</b> Mean position per word pair with t intervals, after reversing pairs whose positive word is on the left; profile distance D = √Σ(x̄₁ⱼ − x̄₂ⱼ)² between the first two groups (Osgood, Suci and Tannenbaum 1957). <b>Product/market fit.</b> Share answering "very disappointed" with a Wilson interval and an exact binomial test against 40% (Ellis 2009; Vohra 2018).</p>
        <p><b>PENS and licensed instruments.</b> PENS (Ryan, Rigby and Przybylski 2006) is licensed by Immersyve Inc., so the item wording, key and norms are not published here; the tool gives raw item means and the means of the column groups you enter from your licensed copy.</p>
        <p><b>When not to use it.</b> Do not mix item orders or answer formats across respondents; check the polarity of your form. Do not compare a score with a norm from a different version (PSSUQ v2 had 19 items). These scores are for groups of respondents; single-person scores are noisy. SUS, UMUX-Lite, SUM, SEQ, NASA-TLX, UEQ, AttrakDiff and NPS have their own calculators.</p>
      </About>
    </>
  );
}

export default ScorersQuestionnaires;
