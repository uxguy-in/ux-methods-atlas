import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as CB from './decisions-counterbalance.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Area, Choice, Num, Result, Stats, Problem, About } from './ui.jsx';
import { CountMatrix, CsvButton } from './decisions-ui.jsx';

const EX = { names: 'Current checkout\nOne-page checkout\nExpress pay first\nGuest-first', n: 16, design: 'williams', seed: 4 };
const parseNames = (t) => String(t).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 12);

// ── Counterbalancing generator ──
function DecCounterbalance() {
  const [namesText, setNamesText] = useState(EX.names);
  const [design, setDesign] = useState(EX.design);
  const [nIn, setN] = useState(String(EX.n));
  const [randomise, setRandomise] = useState(true);
  const [seed, setSeed] = useState(EX.seed);
  const names = parseNames(namesText);
  const k = names.length;
  const n = Math.max(0, Math.min(2000, Math.round(Number(nIn) || 0)));
  const fullTooBig = design === 'full' && k > 6;
  const ok = k >= 2 && n >= 1 && !fullTooBig;
  const loadExample = () => { setNamesText(EX.names); setDesign(EX.design); setN(String(EX.n)); setRandomise(true); setSeed(EX.seed); };

  const res = useMemo(() => {
    if (!ok) return null;
    const a = CB.assign({ k, design, n, randomise, seed });
    const bal = CB.balance(a.list.map((r) => r.order), k);
    const designBal = CB.balance(a.rows, k);
    return { ...a, bal, designBal };
  }, [ok, k, design, n, randomise, seed]);
  const short = names.map((nm, i) => `${CB.LETTERS[i]}`);
  const legend = names.map((nm, i) => `${CB.LETTERS[i]} = ${nm}`).join(' · ');

  return (
    <div className="dc-root">
      <LoadExample onClick={loadExample} />
      <div className="calc-inputs ea-inputs">
        <Area label="Conditions, one per line (2 to 12)" value={namesText} onChange={setNamesText} rows={5} />
        <Choice label="Design" value={design} onChange={setDesign} options={[['williams', 'Williams (carryover-balanced)'], ['latin', 'Cyclic Latin square'], ['full', 'All orders (k!)']]} />
        <Num label="Participants" value={nIn} onChange={setN} min={1} max={2000} />
        <Choice label="Shuffle letters and order rows" value={randomise ? 'yes' : 'no'} onChange={(v) => setRandomise(v === 'yes')} options={[['yes', 'Yes, with a seed'], ['no', 'No, textbook layout']]} />
        {randomise && <div className="calc-field"><span>Seed</span><div className="dc-actions"><b className="dc-mono">{seed}</b><button type="button" className="btn ghost small" onClick={() => setSeed(1 + Math.floor(Math.random() * 99999))}>New shuffle</button></div></div>}
      </div>
      {k < 2 && <Problem>Enter at least two conditions.</Problem>}
      {fullTooBig && <Problem>All orders of {k} conditions would be {CB.designSize(k, 'full').toLocaleString('en-GB')} orders. Use a Williams design for more than 6 conditions.</Problem>}
      {res && (
        <>
          <Result big={`${res.R} orders`} tone={n % res.R === 0 ? 'good' : undefined} label={`${design === 'williams' ? 'Williams design' : design === 'full' ? 'All possible orders' : 'Cyclic Latin square'} for ${k} conditions${design === 'williams' && k % 2 ? ' (odd k: the square plus its mirror image)' : ''}. Recruit in multiples of ${res.R}.`}>
            <Stats rows={[
              ['Participants', `${n} (${Math.floor(n / res.R)} full block${Math.floor(n / res.R) === 1 ? '' : 's'}${n % res.R ? ` + ${n % res.R}` : ''})`],
              ['Position balance', res.bal.posBalanced ? 'Exact' : `Off by up to ${res.bal.posSpread}`],
              ['Carryover balance', design === 'latin' && k > 2 ? 'Not balanced by design' : res.bal.carryBalanced ? 'Exact' : `Off by up to ${res.bal.carrySpread}`],
              ['Next full block at', `${Math.ceil(Math.max(n, 1) / res.R) * res.R} participants`],
            ]} />
          </Result>
          <p className="dc-note">{legend}</p>
          <h3 className="clu-h3">The orders</h3>
          <Table label="Orders in the design" head={['Order', ...Array.from({ length: k }, (_, j) => `Position ${j + 1}`), 'Participants']}
            rows={res.rows.slice(0, 120).map((r, i) => [i + 1, ...r.map((c) => short[c]), res.list.filter((x) => x.row === i).length])} />
          {res.rows.length > 120 && <p className="dc-note">Showing the first 120 of {res.rows.length} orders; the CSV has every participant.</p>}
          <h3 className="clu-h3">Participant assignment</h3>
          <div className="dc-actions">
            <CsvButton name="counterbalancing-assignment.csv" csv={CB.assignmentCsv(res.list, names)}>Download assignment CSV</CsvButton>
            <span className="dc-note">Participant, order number and the condition at each position.</span>
          </div>
          <Table num={false} label="Participant to order assignment" head={['Participant', 'Order', 'Sequence']}
            rows={res.list.slice(0, 60).map((r) => [`P${r.p}`, r.row + 1, <span key="o" className="dc-order">{CB.orderText(r.order, short)}</span>])} />
          {res.list.length > 60 && <p className="dc-note">Showing the first 60 of {res.list.length} participants.</p>}
          <div className="ea-grid2">
            <div>
              <h3 className="clu-h3">Balance check: position</h3>
              <p className="dc-note">How many participants meet each condition at each position. Equal numbers in every cell mean exact balance.</p>
              <CountMatrix label="Participants per condition and position" rows={res.bal.pos} rowNames={short} colNames={Array.from({ length: k }, (_, j) => `${j + 1}`)} corner="Condition / position" target={res.bal.pos[0][0]} />
            </div>
            <div>
              <h3 className="clu-h3">Balance check: carryover</h3>
              <p className="dc-note">How often the row condition comes straight before the column condition.</p>
              <CountMatrix label="Times each condition immediately precedes another" rows={res.bal.carry} rowNames={short} colNames={short} corner="Before / after" diag target={Math.max(...res.bal.carry.flatMap((r, i) => r.filter((_, j) => j !== i)))} />
            </div>
          </div>
          <StudySummary {...CB.counterbalanceSummary({ k, design, n, R: res.R, bal: res.bal, names })} />
        </>
      )}
      <About method="latin-square-and-williams-counterbalancing" links={[['between-subjects-vs-within-subjects-design-selection', 'Between vs within-subjects design'], ['design-bakeoff', 'Design bake-off']]}>
        <p><b>Cyclic Latin square.</b> Row i is the sequence i, i+1, …, k−1, 0, …, i−1 (mod k): each condition appears once in each position, so position (practice, fatigue) effects cancel in the condition means. Each condition is always followed by the same one, so a lasting effect of one condition on the next (first-order carryover) is not balanced.</p>
        <p><b>Williams design</b> (Williams 1949, "Experimental designs balanced for the estimation of residual effects of treatments"). The first row is 0, 1, k−1, 2, k−2, …; row i adds i (mod k) to every entry. For even k this square is balanced for first-order carryover: every condition immediately follows every other condition exactly once. For odd k no single square can be, so the mirror image of each row is added, giving 2k orders in which every ordered pair occurs exactly twice. For k = 4 the rows are ABDC, BCAD, CDBA, DACB, the square printed in most HCI methods texts.</p>
        <p><b>All orders.</b> Every one of the k! sequences, for k ≤ 6. This balances every higher-order sequence effect too, but needs k! participants per block (24 for four conditions).</p>
        <p><b>Assignment.</b> Participant p gets order p mod R (R = number of orders), so each complete block of R participants is balanced. With shuffling on, the letters are assigned to conditions at random and the rows are put in a random order using the seed shown, which keeps the balance while removing any systematic link between the textbook layout and your conditions. The balance check counts the orders actually used by your participants.</p>
        <p><b>When not to use it.</b> When doing one condition changes how people do the next for good (they learn the task, discover a trick, or see the answer), counterbalancing cannot fix it: use a between-subjects design, or analyse first-position data only. Counterbalancing also assumes carryover is symmetric; if A helps B more than B helps A the condition means are still biased.</p>
      </About>
    </div>
  );
}

export default DecCounterbalance;
