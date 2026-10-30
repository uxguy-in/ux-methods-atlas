import { useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as FM from './decisions-fmea.js';
import { fmt } from './decisions-core.js';
import { Table, BarChart, LoadExample } from './expanalytics-charts.jsx';
import { Area, Result, Stats, Problem, About } from './ui.jsx';
import { CsvButton } from './decisions-ui.jsx';

// Example: use FMEA of the dose-entry flow in an insulin bolus calculator app (the kind of use-related risk analysis
// IEC 62366-1 asks for). Ratings are illustrative team judgements.
const row = (step, mode, effect, cause, controls, s, o, d, action = '', s2 = '', o2 = '', d2 = '') => ({ step, mode, effect, cause, controls, s: String(s), o: String(o), d: String(d), action, s2: String(s2), o2: String(o2), d2: String(d2) });
const EX = [
  row('Enter carbohydrates', 'Types 150 instead of 15 g', 'Overdose suggested, hypoglycaemia', 'No range check, small keypad', 'None', 9, 4, 6, 'Plausibility check above 100 g with confirm', 9, 2, 3),
  row('Enter carbohydrates', 'Enters grams for a different meal', 'Wrong dose', 'Meal list not visible', 'Meal name shown on review', 7, 3, 5),
  row('Check blood glucose', 'Uses an old reading', 'Dose too high or too low', 'Last reading pre-filled silently', 'Timestamp in small grey text', 8, 5, 7, 'Block readings older than 15 minutes', 8, 2, 2),
  row('Review suggestion', 'Accepts without reading', 'Unnoticed wrong dose', 'Habituation to Confirm', 'Summary screen', 9, 6, 8, 'Show dose large with units; require hold-to-confirm', 9, 4, 4),
  row('Review suggestion', 'Confuses units and mmol/L', 'Misreads glucose value', 'Units not labelled', 'None', 7, 2, 6),
  row('Deliver dose', 'Double-taps Deliver', 'Duplicate bolus', 'Slow feedback after first tap', 'Delivery log', 10, 2, 3, 'Disable button and show progress immediately', 10, 1, 2),
  row('Log dose', 'Forgets to log a manual injection', 'Next suggestion ignores insulin on board', 'Logging is optional', 'Reminder after 30 min', 6, 7, 6, 'Ask about manual doses before each calculation', 6, 3, 4),
  row('Settings', 'Changes carb ratio by mistake', 'All later doses wrong', 'Settings one tap from home', 'PIN for settings', 8, 2, 4),
  row('Notifications', 'Dismisses high-glucose alert', 'Delayed correction', 'Alert looks like marketing', 'Repeat after 1 hour', 5, 6, 5),
];
const OPTS = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const apTag = (ap) => (ap ? <span className={`qtag dc-ap ${ap === 'H' ? 'fix' : ap === 'M' ? 'opp' : 'promote'}`}>{FM.AP_NAME[ap]}</span> : '');

function RatingSelect({ value, onChange, label }) {
  return <select className="dc-edit num" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>{OPTS.map((o) => <option key={o} value={o}>{o || '–'}</option>)}</select>;
}
function SoMatrix({ so }) {
  return (
    <div className="clu-scroll ea-contain"><table className="clu-table clu-num dc-matrix" aria-label="Number of failure modes by severity and occurrence, shaded by action priority at detection 5–6">
      <thead><tr><th>S \ O</th>{Array.from({ length: 10 }, (_, j) => <th key={j}>{j + 1}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 10 }, (_, k) => 9 - k).map((s) => (
        <tr key={s}><th scope="row">{s + 1}</th>{so[s].map((c, o) => <td key={o} className={`mx ${FM.actionPriority(s + 1, o + 1, 5)}`}>{c || ''}</td>)}</tr>
      ))}</tbody>
    </table></div>
  );
}

// ── Use FMEA ──
function DecUseFmea() {
  const [rows, setRows] = useState(EX);
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState('');
  const a = useMemo(() => FM.analyseFmea(rows), [rows]);
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const importCsv = () => { const p = FM.parseFmeaCsv(csv); if (p.rows.length) { setRows(p.rows); setMsg(`Imported ${p.rows.length} rows.`); } else setMsg(p.errors[0]); };

  return (
    <div className="dc-root">
      <LoadExample onClick={() => { setRows(EX); setMsg(''); }} />
      <p className="dc-note">One row per use error. Rate severity (S), occurrence (O) and detection (D) from 1 to 10, where 10 is the worst (most severe, most frequent, least likely to be caught before harm). Add the ratings expected after the action to see residual risk.</p>
      <div className="clu-scroll ea-contain">
        <table className="clu-table dc-fmea" aria-label="Failure modes">
          <thead><tr>{FM.FIELDS.slice(0, 5).map(([, l]) => <th key={l}>{l}</th>)}<th>S</th><th>O</th><th>D</th><th>RPN</th><th>AP</th><th>Recommended action</th><th>S′</th><th>O′</th><th>D′</th><th>RPN′</th><th>AP′</th><th /></tr></thead>
          <tbody>{rows.map((r, i) => {
            const sc = a.rows[i];
            return (
              <tr key={i}>
                {['step', 'mode', 'effect', 'cause', 'controls'].map((k) => <td key={k}><input className="dc-edit" value={r[k]} aria-label={`${k} row ${i + 1}`} onChange={(e) => set(i, k, e.target.value)} /></td>)}
                {['s', 'o', 'd'].map((k) => <td key={k} className="c"><RatingSelect value={r[k]} label={`${k.toUpperCase()} row ${i + 1}`} onChange={(v) => set(i, k, v)} /></td>)}
                <td className="c"><b>{Number.isFinite(sc.rpn) ? sc.rpn : ''}</b></td>
                <td className="c">{apTag(sc.ap)}</td>
                <td><input className="dc-edit" value={r.action} aria-label={`Action row ${i + 1}`} onChange={(e) => set(i, 'action', e.target.value)} /></td>
                {['s2', 'o2', 'd2'].map((k) => <td key={k} className="c"><RatingSelect value={r[k]} label={`${k.toUpperCase()} after, row ${i + 1}`} onChange={(v) => set(i, k, v)} /></td>)}
                <td className="c">{Number.isFinite(sc.rpn2) ? sc.rpn2 : ''}</td>
                <td className="c">{apTag(sc.ap2)}</td>
                <td><button type="button" className="btn ghost small" aria-label={`Delete row ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="dc-actions">
        <button type="button" className="btn ghost small" onClick={() => setRows([...rows, Object.fromEntries(FM.FIELDS.map(([k]) => [k, '']))])}>+ Add failure mode</button>
        <CsvButton name="use-fmea.csv" csv={FM.fmeaCsv(rows)}>Export CSV</CsvButton>
      </div>
      <details className="ea-card">
        <summary>Import from a spreadsheet (CSV or pasted cells)</summary>
        <Area label="Header row with columns such as Task step, Use error, Effect, Cause, Current controls, S, O, D, Recommended action, S after, O after, D after" value={csv} onChange={setCsv} rows={5} />
        <div className="dc-actions"><button type="button" className="btn ghost small" onClick={importCsv}>Replace rows with this</button>{msg && <span className="dc-note">{msg}</span>}</div>
      </details>
      {a.invalid.length > 0 && <Problem>{a.invalid.length} row{a.invalid.length === 1 ? ' is' : 's are'} missing S, O or D and left out of the ranking.</Problem>}
      {a.valid.length > 0 && (
        <>
          <Result big={`${a.counts.H} High`} tone={a.counts.H ? 'bad' : 'good'} label={`action priority out of ${a.valid.length} rated use errors (${a.counts.M} Medium, ${a.counts.L} Low)`}>
            <Stats rows={[
              ['Highest priority', `${a.byAp[0].mode || a.byAp[0].step}`],
              ['Highest RPN', `${a.byRpn[0].rpn} (${a.byRpn[0].mode || a.byRpn[0].step})`],
              ['Top items that differ between AP and RPN ranking', `${a.disagree} of ${a.k}`],
              a.after.n ? ['Total RPN of actioned items', `${fmt(a.after.before)} → ${fmt(a.after.afterSum)}`] : null,
            ]} />
          </Result>
          <h3 className="clu-h3">Priority list</h3>
          <Table label="Failure modes in priority order" head={['#', 'Use error', 'S', 'O', 'D', 'RPN', 'AP', 'RPN rank', 'After action']}
            rows={a.byAp.map((r, i) => [i + 1, r.mode || r.step, r.S, r.O, r.D, r.rpn, apTag(r.ap), a.byRpn.indexOf(r) + 1, r.after ? <span key="x">{r.rpn2} {apTag(r.ap2)}</span> : '—'])} />
          <div className="ea-grid2">
            <div>
              <h3 className="clu-h3">RPN before and after actions</h3>
              <BarChart label="RPN of each failure mode, highest first" yFmt={(v) => fmt(v)} bars={a.byRpn.slice(0, 12).map((r, i) => ({ label: `${i + 1}`, value: r.rpn, tone: r.ap === 'H' ? 'bad' : r.ap === 'M' ? 'warn' : 'ok', top: r.after ? `→${r.rpn2}` : '' }))} />
              <p className="dc-note">Bars numbered by RPN rank and coloured by action priority; labels above show the RPN after the planned action.</p>
            </div>
            <div>
              <h3 className="clu-h3">Severity × occurrence</h3>
              <SoMatrix so={a.so} />
              <p className="dc-note">Count of use errors in each cell; shading is the AP band at a mid detection rating (5–6).</p>
            </div>
          </div>
          <StudySummary {...FM.fmeaSummary(a)} />
        </>
      )}
      <About method="use-failure-modes-and-effects-analysis-ufmea" links={[['fault-tree-analysis', 'Fault tree analysis'], ['hazop-hazard-and-operability-study', 'HAZOP'], ['sherpa-systematic-human-error-reduction-and-prediction-approach', 'SHERPA'], ['error-taxonomy-slips-lapses-mistakes', 'Error taxonomy (slips, lapses, mistakes)']]}>
        <p><b>Ratings.</b> Severity S (how bad the effect is), occurrence O (how likely the use error is) and detection D (how unlikely it is to be caught before harm), each 1 to 10 with 10 worst. Write anchored definitions for each level with your team before rating.</p>
        <p><b>RPN</b> = S × O × D (1 to 1,000). It is the traditional ranking, but it multiplies ordinal ratings, gives the same weight to all three and hides severe failure modes behind low occurrence.</p>
        <p><b>Action priority</b> uses the AIAG & VDA FMEA Handbook (1st edition, 2019) Action Priority table, which looks up S, then O, then D in bands (S 9–10, 7–8, 4–6, 2–3, 1; O 8–10, 6–7, 4–5, 2–3, 1; D 7–10, 5–6, 2–4, 1) and returns High, Medium or Low. For example S 10, O 2, D 3 is Low, while S 9, O 4, D 7 is High. The list is sorted by AP, then severity, then occurrence, with RPN only breaking ties.</p>
        <p><b>Residual risk.</b> Enter the ratings expected after the recommended action (S′, O′, D′); usually only O and D change, since design changes rarely make the harm less severe. Export writes every column plus RPN and AP to CSV.</p>
        <p><b>When not to use it.</b> FMEA looks at single failures one at a time; it misses combinations of events (use a fault tree) and problems that come from how parts of a system interact (use STPA). For medical devices it supports, but does not replace, the use-related risk analysis and summative validation in IEC 62366-1.</p>
      </About>
    </div>
  );
}

export default DecUseFmea;
