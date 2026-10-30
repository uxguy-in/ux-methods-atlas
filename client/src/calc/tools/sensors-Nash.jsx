import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as G from './sensors-nash.js';
import { fmt, pctS } from './sensors-core.js';
import { Choice, Pick, Problem, About } from './ui.jsx';
import { LoadExample } from './expanalytics-charts.jsx';
import './sensors.css';

const clone = (g) => ({ name: g.name, note: g.note, rows: [...g.rows], cols: [...g.cols], A: g.A.map((r) => r.map(String)), B: g.B.map((r) => r.map(String)) });
const blank = (m, n) => ({ name: 'Custom game', note: '', rows: Array.from({ length: m }, (_, i) => `Row ${i + 1}`), cols: Array.from({ length: n }, (_, j) => `Column ${j + 1}`), A: Array.from({ length: m }, () => Array(n).fill('0')), B: Array.from({ length: m }, () => Array(n).fill('0')) });

// Best-response curves of a 2×2 game: p = P(row plays its first strategy), q = P(column plays its first strategy).
function BestResponsePlot({ A, B, eqs, rows, cols }) {
  const S = 340, P = 50, s = (v) => P + v * (S - P - 16), sy = (v) => S - P - v * (S - P - 16);
  const br = G.bestResponse2x2(A, B);
  // Row's best response p*(q): 1 where its first strategy pays more, 0 where less, any p at q*.
  const rowPts = [], colPts = [];
  const grid = Array.from({ length: 401 }, (_, i) => i / 400);
  for (const q of grid) { const d = br.rowAdv(q); rowPts.push([d > 1e-12 ? 1 : d < -1e-12 ? 0 : NaN, q]); }
  for (const p of grid) { const d = br.colAdv(p); colPts.push([p, d > 1e-12 ? 1 : d < -1e-12 ? 0 : NaN]); }
  const path = (pts) => { let out = '', pen = false; for (const [p, q] of pts) { if (!Number.isFinite(p) || !Number.isFinite(q)) { pen = false; continue; } out += `${pen ? 'L' : 'M'}${s(p)},${sy(q)} `; pen = true; } return out; };
  // Vertical (row) and horizontal (column) jumps at the indifference points.
  const rowJump = Number.isFinite(br.qStar) && br.qStar >= 0 && br.qStar <= 1 ? `M${s(0)},${sy(br.qStar)} L${s(1)},${sy(br.qStar)}` : '';
  const colJump = Number.isFinite(br.pStar) && br.pStar >= 0 && br.pStar <= 1 ? `M${s(br.pStar)},${sy(0)} L${s(br.pStar)},${sy(1)}` : '';
  return (
    <figure className="sn-fig">
      <svg viewBox={`0 0 ${S} ${S}`} className="exp-plot tl-plot sn-plot" role="img" aria-label="Best-response curves and Nash equilibria of the 2×2 game">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={s(v)} x2={s(v)} y1={sy(0)} y2={sy(1)} className="grid" /><line x1={s(0)} x2={s(1)} y1={sy(v)} y2={sy(v)} className="grid" /><text x={s(v)} y={S - P + 16} className="ax" textAnchor="middle">{pctS(v)}</text><text x={P - 6} y={sy(v) + 4} className="ax" textAnchor="end">{pctS(v)}</text></g>)}
        <path d={`${path(rowPts)} ${rowJump}`} className="br-row" />
        <path d={`${path(colPts)} ${colJump}`} className="br-col" />
        {eqs.map((e, i) => <circle key={i} cx={s(e.x[0])} cy={sy(e.y[0])} r={7} className="eq" />)}
        <text x={(P + S) / 2} y={S - 12} className="ax" textAnchor="middle">P(row plays {rows[0].length > 18 ? `${rows[0].slice(0, 17)}…` : rows[0]})</text>
        <text x={13} y={(S - P) / 2} className="ax" textAnchor="middle" transform={`rotate(-90 13 ${(S - P) / 2})`}>P(column plays {cols[0].length > 18 ? `${cols[0].slice(0, 17)}…` : cols[0]})</text>
      </svg>
      <ul className="sn-legend"><li><i style={{ background: 'var(--c1)' }} />Row's best response</li><li><i style={{ background: 'var(--c2)' }} />Column's best response</li><li><i style={{ background: 'var(--bg)', border: '2px solid var(--ink)' }} />Equilibrium (curves cross)</li></ul>
    </figure>
  );
}

function SensorsNash() {
  const [exId, setExId] = useState('pd');
  const [g, setG] = useState(() => clone(G.EXAMPLES.pd));
  const [size, setSize] = useState('2x2');
  const pick = (id) => { setExId(id); if (id !== 'custom') { const e = G.EXAMPLES[id]; setG(clone(e)); setSize(`${e.rows.length}x${e.cols.length}`); } };
  const resize = (v) => { setSize(v); setExId('custom'); const [m, n] = v.split('x').map(Number); const b = blank(m, n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { if (g.A[i]?.[j] !== undefined) { b.A[i][j] = g.A[i][j]; b.B[i][j] = g.B[i][j]; } } g.rows.forEach((r, i) => { if (i < m) b.rows[i] = r; }); g.cols.forEach((c, j) => { if (j < n) b.cols[j] = c; }); setG(b); };
  const edit = (which, i, j, v) => { setExId('custom'); setG({ ...g, name: 'Custom game', note: '', [which]: g[which].map((r, a) => (a === i ? r.map((x, b) => (b === j ? v : x)) : r)) }); };
  const rename = (which, i, v) => { setG({ ...g, [which]: g[which].map((x, a) => (a === i ? v : x)) }); };
  const A = g.A.map((r) => r.map(Number)), B = g.B.map((r) => r.map(Number));
  const valid = A.flat().every(Number.isFinite) && B.flat().every(Number.isFinite);
  const game = { rows: g.rows.map((r, i) => r.trim() || `Row ${i + 1}`), cols: g.cols.map((c, j) => c.trim() || `Column ${j + 1}`), A, B };
  const r = useMemo(() => (valid ? G.analyse(game) : null), [JSON.stringify(g)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pureSet = new Set(r ? r.pure.map(([i, j]) => `${i},${j}`) : []);
  const elimR = new Set(r ? r.elim.log.filter((l) => l.player === 'row').map((l) => l.s) : []), elimC = new Set(r ? r.elim.log.filter((l) => l.player === 'col').map((l) => l.s) : []);
  const is2 = A.length === 2 && A[0].length === 2;

  return (
    <div className="sn-root">
      <LoadExample onClick={() => pick('pd')} />
      <div className="calc-inputs ea-inputs">
        <Pick label="Teaching example" value={exId} onChange={pick} options={[...Object.entries(G.EXAMPLES).map(([id, e]) => [id, e.name]), ['custom', 'Custom game']]} />
        <Choice label="Strategies (rows × columns)" value={size} onChange={resize} options={[['2x2', '2×2'], ['2x3', '2×3'], ['3x3', '3×3'], ['3x4', '3×4'], ['4x4', '4×4'], ['5x5', '5×5']]} />
      </div>
      {g.note && <p className="sn-note">{g.note}</p>}
      <div className="clu-scroll ea-contain">
        <table className="sn-game" aria-label="Payoff matrix: row player's payoff, then column player's payoff">
          <thead><tr><th>Row ↓ / Column →</th>{g.cols.map((c, j) => <th key={j} className={elimC.has(j) ? 'dom' : ''}><input className="nm" aria-label={`Column strategy ${j + 1} name`} value={c} onChange={(e) => rename('cols', j, e.target.value)} /></th>)}</tr></thead>
          <tbody>{g.rows.map((rw, i) => (
            <tr key={i}>
              <th className={elimR.has(i) ? 'dom' : ''}><input className="nm" aria-label={`Row strategy ${i + 1} name`} value={rw} onChange={(e) => rename('rows', i, e.target.value)} /></th>
              {g.cols.map((_, j) => (
                <td key={j} className={pureSet.has(`${i},${j}`) ? 'eq' : ''}>
                  <span className="pair">
                    <input className="r" inputMode="decimal" aria-label={`Row player's payoff at ${game.rows[i]} / ${game.cols[j]}`} value={g.A[i][j]} onChange={(e) => edit('A', i, j, e.target.value)} />
                    <input className="c" inputMode="decimal" aria-label={`Column player's payoff at ${game.rows[i]} / ${game.cols[j]}`} value={g.B[i][j]} onChange={(e) => edit('B', i, j, e.target.value)} />
                  </span>
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="sn-note">Each cell: row player's payoff (left), column player's payoff (right). Green cells are pure equilibria; struck-through strategies are removed by iterated elimination of strictly dominated strategies.</p>
      {!valid ? <Problem>Every payoff must be a number.</Problem> : (
        <>
          <div className="ea-grid2">
            <div>
              <h3 className="clu-h3">{r.eqs.length === 1 ? 'Nash equilibrium' : `${r.eqs.length} Nash equilibria`}{r.degenerate ? ' (degenerate game)' : ''}</h3>
              <ul className="sn-eqs">
                {r.eqs.map((e, k) => (
                  <li key={k}>
                    <span className={`qtag ${e.pure ? 'promote' : 'opp'}`}>{e.pure ? 'pure' : 'mixed'}</span>
                    <span>Row: <b>{G.mixText(e.x, game.rows)}</b></span>
                    <span>Column: <b>{G.mixText(e.y, game.cols)}</b></span>
                    <span>Payoffs {fmt(e.rowPayoff, 2)} / {fmt(e.colPayoff, 2)}</span>
                    {r.pareto[k].length > 0 && <span className="qtag fix">Pareto-inefficient</span>}
                  </li>
                ))}
              </ul>
              {r.elim.log.length > 0 && <p className="sn-note">Dominated: {r.elim.log.map((l) => `${l.player === 'row' ? game.rows[l.s] : game.cols[l.s]} (by ${l.player === 'row' ? game.rows[l.by] : game.cols[l.by]})`).join(', ')}.</p>}
              {r.zeroSum && <p className="sn-note">Zero-sum game: one player's gain is the other's loss.</p>}
            </div>
            {is2 && <BestResponsePlot A={A} B={B} eqs={r.eqs} rows={game.rows} cols={game.cols} />}
          </div>
          <StudySummary {...G.nashSummary(r, game)} />
        </>
      )}
      <About method="nash-equilibrium-analysis" links={[['nash-equilibrium-design-research-protocol', 'Nash equilibrium design research protocol'], ['game-theoretic-analysis-of-multi-user-systems', 'Game-theoretic analysis of multi-user systems'], ['economic-games-prisoners-dilemma-public-goods-trust-and-ultimatum', 'Economic games']]}>
        <p><b>Nash equilibrium</b> (Nash 1950): a pair of (possibly mixed) strategies x, y where neither player can gain by changing strategy alone: xᵀAy ≥ x′ᵀAy for every x′ and xᵀBy ≥ xᵀBy′ for every y′. A <b>pure</b> equilibrium is a cell where the row payoff is the largest in its column and the column payoff the largest in its row.</p>
        <p><b>Support enumeration</b> (von Stengel 2007): for every pair of strategy sets I and J of the same size k, solve the column mix y on J that makes the row player indifferent across I (A<sub>IJ</sub>y = v·1, Σy = 1) and the row mix x on I that makes the column player indifferent across J (B<sub>IJ</sub>ᵀx = u·1, Σx = 1); keep it when x, y ≥ 0 and no strategy outside the supports pays more. In nondegenerate games this lists every equilibrium. <b>Dominance</b>: a strategy is removed when another pure strategy pays strictly more against every remaining strategy of the other player, repeated until nothing changes. <b>2×2 best responses</b>: the row player is indifferent at q* = (A<sub>22</sub> − A<sub>12</sub>)/(A<sub>11</sub> − A<sub>21</sub> − A<sub>12</sub> + A<sub>22</sub>), the column player at p* = (B<sub>22</sub> − B<sub>21</sub>)/(B<sub>11</sub> − B<sub>12</sub> − B<sub>21</sub> + B<sub>22</sub>).</p>
        <p><b>Checked</b> against nashpy's support enumeration on the six teaching games and four random games up to 4×4 (identical equilibria); in a degenerate random game this tool also finds one equilibrium that nashpy's support enumeration misses on a floating-point tie, confirmed by nashpy's vertex enumeration.</p>
        <p><b>When not to use it.</b> When payoffs are guesses you cannot defend, for games with sequential moves or hidden information (use a game tree), or as a prediction of what people will do: lab and field studies show people cooperate, punish and trust more than one-shot equilibria predict. Degenerate games (ties) can have infinitely many equilibria; only the ones at the corners of those sets are listed.</p>
      </About>
    </div>
  );
}

export default SensorsNash;
