import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as DT from './decisions-tree.js';
import { fmt, pctS } from './decisions-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Result, Stats, Problem, About } from './ui.jsx';
import './decisions.css';

const EX = `# Checkout plan. Payoffs in £ thousands over two years.
$p_big = 0.3 [0.15, 0.45]  chance a full redesign gives a big lift
$big = 600 [400, 900]  value of a big conversion lift
$small = 180 [100, 260]  value of a small lift
$build = 150 [110, 220]  cost of a full redesign
$p_fix = 0.6 [0.4, 0.8]  chance quick fixes give a small lift
$test = 25 [15, 40]  cost of usability testing first

Checkout plan [D]
  Full redesign: cost=$build [C]
    Big lift: p=$p_big, value=$big
    Small lift: p=0.45, value=$small
    No lift: p=rest, value=0
  Quick fixes: cost=30 [C]
    Small lift: p=$p_fix, value=$small*0.6
    No lift: p=rest, value=0
  Test first, then decide: cost=$test [C]
    Test shows strong need: p=0.4 [D]
      Full redesign: cost=$build [C]
        Big lift: p=0.55, value=$big
        Small lift: p=0.35, value=$small
        No lift: p=rest
      Quick fixes: cost=30, value=$small*0.6*0.7
    Test shows weak need: p=rest [D]
      Full redesign: cost=$build [C]
        Big lift: p=0.13, value=$big
        Small lift: p=0.52, value=$small
        No lift: p=rest
      Quick fixes: cost=30, value=$small*0.6*0.55
      Do nothing: value=0
  Do nothing: value=0`;

const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const short = (x) => fmt(x, Math.abs(x) < 10 && x % 1 ? 2 : Math.abs(x) < 100 && x % 1 ? 1 : 0);
const signed = (unit) => (x) => `${x < 0 ? "−" : ""}${unit}${short(Math.abs(x))}`;

// The tree as an SVG: decision nodes are squares, chance nodes circles, end points triangles; the optimal policy is
// drawn thick and the branches it rejects are crossed.
function TreeDiagram({ tree }) {
  const colW = 196, rowH = 48, padL = 14, padT = 22;
  const items = []; let leaf = 0, maxD = 0;
  const lay = (n, d, onPath) => {
    maxD = Math.max(maxD, d);
    const kids = n.children.map((c, i) => lay(c, d + 1, onPath && (n.type !== 'D' || i === n.best)));
    const y = kids.length ? (kids[0].y + kids[kids.length - 1].y) / 2 : padT + (leaf++) * rowH + 12;
    const me = { n, d, y, x: padL + d * colW, kids, onPath };
    items.push(me);
    return me;
  };
  const root = lay(tree, 0, true);
  const W = padL + (maxD + 1) * colW + 70, H = padT + leaf * rowH + 6;
  const edges = [];
  for (const it of items) it.kids.forEach((k, i) => edges.push({ from: it, to: k, best: it.onPath && (it.n.type !== 'D' || i === it.n.best), rejected: it.n.type === 'D' && i !== it.n.best }));
  return (
    <div className="tl-scroll dc-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="tl-plot dc-tree" role="img" aria-label="Decision tree with expected values; the best policy is highlighted">
        {edges.map(({ from, to, best, rejected }, i) => {
          const x0 = from.x + 10, x1 = to.x - 2, xm = from.x + 24;
          const c = to.n;
          const sub = [Number.isFinite(c.p) && from.n.type === 'C' ? `p ${fmt(c.p, c.p < 0.1 ? 3 : 2)}` : null, c.payoff ? `${c.payoff > 0 ? '+' : '−'}${short(Math.abs(c.payoff))}` : null].filter(Boolean).join(' · ');
          return (
            <g key={i}>
              <path className={`br${best ? ' best' : ''}`} d={`M${x0},${from.y} L${xm},${to.y} L${x1},${to.y}`} />
              <text x={xm + 4} y={to.y - 6}>{cut(c.label, 26)}</text>
              {sub && <text className="sub" x={xm + 4} y={to.y + 15}>{sub}</text>}
              {rejected && <line className="cut" x1={xm + 70} x2={xm + 78} y1={to.y - 5} y2={to.y + 5} />}
            </g>
          );
        })}
        {items.map((it, i) => {
          const { n, x, y } = it;
          return (
            <g key={`n${i}`}>
              {n.type === 'D' && <rect className="nd-d" x={x - 2} y={y - 8} width={16} height={16} />}
              {n.type === 'C' && <circle className="nd-c" cx={x + 6} cy={y} r={8.5} />}
              {n.type === 'T' && <polygon className="nd-t" points={`${x},${y} ${x + 13},${y - 8} ${x + 13},${y + 8}`} />}
              <text className="ev" x={n.type === 'T' ? x + 18 : x - 2} y={n.type === 'T' ? y + 4 : y - 13}>{short(n.ev)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Tornado({ rows, base, unit }) {
  const cur = signed(unit);
  const W = 640, rowH = 34, L = 150, R = 20, T = 18, B = 36, H = T + rows.length * rowH + B;
  const all = rows.flatMap((r) => [r.evLo, r.evHi]).concat(base).filter(Number.isFinite);
  let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const sx = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const ticks = []; const step = 10 ** Math.floor(Math.log10((hi - lo) / 4)); const st = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => (hi - lo) / s <= 6);
  for (let t = Math.ceil(lo / st) * st; t <= hi; t += st) ticks.push(+t.toPrecision(10));
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot dc-tornado" role="img" aria-label="Tornado chart: expected value at the low and high end of each input">
        {ticks.map((t) => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={T - 4} y2={H - B} className="grid" /><text x={sx(t)} y={H - B + 15} className="ax" textAnchor="middle">{cur(t)}</text></g>)}
        {rows.map((r, i) => {
          const y = T + i * rowH + 4;
          const a = sx(Math.min(r.evLo, base)), b = sx(Math.max(r.evLo, base)), c = sx(Math.min(r.evHi, base)), d = sx(Math.max(r.evHi, base));
          return (
            <g key={r.name}>
              <text x={8} y={y + 15} className="lb">${cut(r.name, 18)}</text>
              {Number.isFinite(r.evLo) && <rect className="lo" x={a} y={y} width={Math.max(1, b - a)} height={22} />}
              {Number.isFinite(r.evHi) && <rect className="hi" x={c} y={y} width={Math.max(1, d - c)} height={22} opacity="0.85" />}
              {r.flips.length > 0 && <rect className="flip" x={sx(Math.min(r.evLo, r.evHi)) - 2} y={y - 2} width={Math.abs(sx(r.evHi) - sx(r.evLo)) + 4} height={26} />}
            </g>
          );
        })}
        <line x1={sx(base)} x2={sx(base)} y1={T - 8} y2={H - B} style={{ stroke: 'var(--ink)', strokeWidth: 2 }} />
        <text x={(L + W - R) / 2} y={H - 4} className="ax" textAnchor="middle">Expected value of the best choice</text>
      </svg>
      <ul className="dc-legend"><li><i style={{ background: 'var(--c2)' }} />Input at its low value</li><li><i style={{ background: 'var(--c1)' }} />Input at its high value</li><li><i style={{ border: '2px dashed var(--bad)' }} />Best choice changes within the range</li></ul>
    </figure>
  );
}

// ── Decision tree with rollback and tornado ──
function DecDecisionTree() {
  const [text, setText] = useState(EX);
  const [goal, setGoal] = useState('max');
  const [unit, setUnit] = useState('£');
  const minimise = goal === 'min';
  const cur = signed(unit);
  const res = useMemo(() => DT.analyse(text, { minimise }), [text, minimise]);
  const ok = res.tree && !res.errors.length;
  const best = ok && res.tree.type === 'D' ? res.tree.children[res.tree.best] : null;

  return (
    <div className="dc-root">
      <LoadExample onClick={() => { setText(EX); setGoal('max'); setUnit('£'); }} />
      <Area label="Tree outline (two spaces per level)" value={text} onChange={setText} rows={16} wrap="off"
        hint="Parameters: $name = value [low, high]. Nodes: Label [D] for a decision, Label: p=0.3, value=200, cost=40 [C] for a chance node; p=rest takes what is left. Lines starting with # are notes." />
      <div className="calc-inputs ea-inputs">
        <Choice label="Goal" value={goal} onChange={setGoal} options={[['max', 'Maximise value'], ['min', 'Minimise cost']]} />
        <label className="calc-field"><span>Unit prefix</span><input className="ea-mini" value={unit} onChange={(e) => setUnit(e.target.value.slice(0, 4))} /></label>
      </div>
      {!ok && <Problem>{(res.errors || []).slice(0, 4).join(' · ')}</Problem>}
      {ok && (
        <>
          <Result big={best ? best.label : `${cur(res.tree.ev)}`} tone="good" label={best ? `Best choice at "${res.tree.label}": expected value ${cur(res.tree.ev)}` : 'Expected value of the tree'}>
            <Stats rows={[
              ...res.rootOptions.map((o) => [o.label, `${cur(o.ev)}`]),
              ['Outcomes under the best policy', `${res.profile.length}, from ${cur(Math.min(...res.profile.map((o) => o.total)))} to ${cur(Math.max(...res.profile.map((o) => o.total)))}`],
            ]} />
          </Result>
          <h3 className="clu-h3">Rolled-back tree</h3>
          <TreeDiagram tree={res.tree} />
          <ul className="dc-legend"><li><i style={{ background: 'var(--c1)' }} />Decision (best branch kept)</li><li><i style={{ background: 'var(--c3)', borderRadius: '50%' }} />Chance (probability-weighted)</li><li><i style={{ background: 'var(--c2)' }} />End point (total payoff)</li><li><i style={{ background: 'var(--ok)' }} />Best policy</li></ul>
          {res.policy.length > 0 && <Table num={false} label="Best policy" head={['At decision', 'Choose', 'Expected value from here']} rows={res.policy.map((p) => [p.at, p.choose, `${cur(p.ev)}`])} />}
          <div className="ea-grid2">
            <div>
              <h3 className="clu-h3">Risk profile of the best policy</h3>
              <Table label="Outcomes of the best policy" head={['Outcome path', 'Chance', 'Total payoff']} rows={[...res.profile].sort((a, b) => b.total - a.total).map((o) => [o.path.slice(1).join(' → '), pctS(o.prob, 1), `${cur(o.total)}`])} />
            </div>
          </div>
          <h3 className="clu-h3">One-way sensitivity (tornado)</h3>
          {res.tornado.length ? (
            <>
              <Tornado rows={res.tornado} base={res.tree.ev} unit={unit} />
              <Table label="Sensitivity and break-even values" head={['Input', 'Low → high', 'Expected value at low', 'at high', 'Best choice changes at']}
                rows={res.tornado.map((t) => [`$${t.name}${t.note ? ` (${t.note})` : ''}`, `${short(t.lo)} → ${short(t.hi)}`, `${cur(t.evLo)}`, `${cur(t.evHi)}`, t.invalid ? 'Range gives invalid probabilities' : t.flips.length ? t.flips.map((f) => `${fmt(f.at, Math.abs(f.at) < 10 ? 3 : 1)} (${f.from} → ${f.to})`).join('; ') : 'Not within range'])} />
            </>
          ) : <p className="dc-note">Give parameters a range, like <span className="dc-mono">$big = 600 [400, 900]</span>, and use them in the tree to see which inputs matter.</p>}
          <StudySummary {...DT.treeSummary({ tree: res.tree, tornado: res.tornado, profile: res.profile, rootOptions: res.rootOptions, unit, minimise })} />
        </>
      )}
      <About method="clinical-decision-analysis-decision-trees" links={[['one-way-sensitivity-analysis', 'One-way sensitivity analysis'], ['expected-value-of-information-analysis', 'Expected value of information']]}>
        <p><b>Rollback.</b> Working from the end points back to the root: an end point is worth its payoff; a chance node is worth Σ p_i × (value of branch i); a decision node is worth the best of its branches (the highest value, or the lowest cost when minimising). Each branch adds its value and subtracts its cost on the way, so an end point's total is the sum of payoffs along its path. The best policy keeps the best branch at every decision; its risk profile lists every end point it can reach with the product of the probabilities on the way (Raiffa 1968; Hunink et al., Decision Making in Health and Medicine). Checked against an independent Python rollback and Hillier and Lieberman's Goferbroke example (drill or sell, with a seismic survey): expected value 123 with the survey against 100 without.</p>
        <p><b>Parameters and p=rest.</b> Values can be numbers or expressions using + − × ÷ and $parameters. p=rest gives a branch 1 minus its siblings' probabilities, so a probability parameter can move without breaking the total. Probabilities under each chance node must add up to 1.</p>
        <p><b>Tornado.</b> Each parameter with a range is set to its low and then its high value, the others staying at their base values, and the tree is rolled back again. Bars are sorted by the swing in expected value. Break-even values are found by scanning the range for a change of the best choice at the root and bisecting.</p>
        <p><b>When not to use it.</b> When outcomes are not comparable on one scale, when the probabilities are pure guesses nobody would defend, or when the decision repeats over time with feedback (use a Markov or simulation model). Expected value ignores risk attitude: a 10% chance of losing the business is not offset by a 90% chance of a modest gain.</p>
      </About>
    </div>
  );
}

export default DecDecisionTree;
