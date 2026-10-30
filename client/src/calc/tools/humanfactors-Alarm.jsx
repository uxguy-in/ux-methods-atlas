import { useDeferredValue, useMemo, useState } from 'react';
import StudySummary from '../../components/StudySummary.jsx';
import * as AL from './humanfactors-alarm.js';
import { sig, fmt, toCsv } from './humanfactors-core.js';
import { Table, LoadExample } from './expanalytics-charts.jsx';
import { Num, Area, Result, Stats, About, Bars, Problem, n_, download } from './ui.jsx';
import './humanfactors.css';

const TAG = { ok: ['promote', 'meets target'], warn: ['opp', 'above target, within maximum'], bad: ['fix', 'misses target'] };
const pc = (x) => (Number.isFinite(x) ? `${sig(x * 100, x < 0.1 ? 2 : 3)}%` : '');
const dur = (s) => (s >= 86400 ? `${sig(s / 86400, 3)} days` : s >= 3600 ? `${sig(s / 3600, 3)} h` : `${Math.round(s / 60)} min`);

// ── Alarm flood analysis ──
function HfAlarmFlood() {
  const [text, setText] = useState(() => AL.exampleLog());
  const [o, setO] = useState({ floodN: 10, floodEnd: 5, chatterN: 3, chatterSec: 60, staleHours: 24, operators: 1 });
  const deferred = useDeferredValue(text);
  const log = useMemo(() => AL.parseAlarmLog(deferred), [deferred]);
  const opts = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, n_(v)]));
  const optsOk = Object.values(opts).every((v) => Number.isFinite(v) && v > 0);
  const r = useMemo(() => (optsOk && log.events.length ? AL.analyseAlarms(log.events, opts) : null), [log, JSON.stringify(opts)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setO({ ...o, [k]: v });
  const upload = (file) => { if (!file) return; const rd = new FileReader(); rd.onload = () => setText(String(rd.result || '')); rd.readAsText(file); };
  const T = AL.TARGETS;
  const kpi = r ? [
    ['Alarms per day per operator', fmt(r.perDay, 0), T.perDay.text, AL.band(r.perDay, T.perDay.ok, T.perDay.max)],
    ['Alarms per hour per operator', sig(r.perHour, 3), T.perHour.text, AL.band(r.perHour, T.perHour.ok, T.perHour.max)],
    ['Alarms per 10 minutes per operator', sig(r.per10, 3), T.per10.text, AL.band(r.per10, T.per10.ok, T.per10.max)],
    [`10-minute periods with more than ${r.opts.floodN} alarms`, pc(r.overShare), T.floodShare.text, AL.band(r.overShare, T.floodShare.ok)],
    ['Time in flood (EEMUA 191 start and end)', pc(r.floodShare), '< ~1%', AL.band(r.floodShare, 0.01)],
    ['Hours with more than 30 alarms', pc(r.over30h), '< ~1%', AL.band(r.over30h, 0.01)],
    ['Most alarms in one 10-minute period', `${r.max10} (sliding window ${r.peakRolling})`, T.max10.text, AL.band(r.max10, T.max10.ok)],
    ['Top 10 tags, share of all alarms', pc(r.top10Share), T.top10.text, AL.band(r.top10Share, T.top10.ok)],
    ['Chattering tags', String(r.chatter.length), T.chatter.text, r.chatter.length ? 'bad' : 'ok'],
    ['Stale alarms', r.hasRtn ? String(r.stale.length) : 'no return-to-normal events', T.stale.text, !r.hasRtn ? null : AL.band(r.stale.length / Math.max(1, r.days), 4.999)],
    r.prioKnown ? ['Priority mix high / medium / low', `${pc(r.prio.high / r.prioKnown)} / ${pc(r.prio.medium / r.prioKnown)} / ${pc(r.prio.low / r.prioKnown)}`, '~5% / ~15% / ~80%', r.prio.high / r.prioKnown > 0.1 || r.prio.low / r.prioKnown < 0.6 ? 'warn' : 'ok', 'differs from the guide'] : null,
  ].filter(Boolean) : [];
  const csv = () => download('alarm-tags.csv', toCsv([['tag', 'priority', 'activations', 'share', 'max_in_chatter_window', 'chattering', 'longest_active_s', 'active_at_end', 'stale'],
    ...r.tags.map((g) => [g.tag, g.priority || '', g.count, (g.count / r.total).toFixed(5), g.maxInWindow, g.chattering, Math.round(Math.max(g.longest, g.stillActive)), g.openAtEnd, g.stale])]), 'text/csv');
  return (
    <div className="hf-root">
      <LoadExample onClick={() => { setText(AL.exampleLog()); setO({ floodN: 10, floodEnd: 5, chatterN: 3, chatterSec: 60, staleHours: 24, operators: 1 }); }} />
      <div className="hf-code">
        <Area label="Alarm log: time, tag, priority (optional), state ALM / RTN (optional)" rows={8} value={text} onChange={setText} wrap="off"
          hint="One event per row. Times as 2026-03-02 06:00:05 (read as clock time, no time zone) or seconds. A header row lets the columns come in any order. Rows with other states (ACK, SHLV) are ignored. Without states every row counts as an activation." />
      </div>
      <label className="calc-field"><span>Or open a CSV or text file (read in your browser, not uploaded)</span><input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={(e) => upload(e.target.files?.[0])} /></label>
      <section className="ea-card">
        <h4>Definitions</h4>
        <div className="calc-inputs ea-inputs">
          <Num label="Flood starts above (alarms per 10 min)" value={o.floodN} onChange={set('floodN')} min={1} />
          <Num label="Flood ends below (alarms per 10 min)" value={o.floodEnd} onChange={set('floodEnd')} min={1} />
          <Num label="Chattering: activations" value={o.chatterN} onChange={set('chatterN')} min={2} />
          <Num label="…within (seconds)" value={o.chatterSec} onChange={set('chatterSec')} min={1} />
          <Num label="Stale after (hours)" value={o.staleHours} onChange={set('staleHours')} min={1} />
          <Num label="Operators sharing this log" value={o.operators} onChange={set('operators')} min={1} />
        </div>
      </section>
      {!optsOk && <Problem>Every definition needs a positive number.</Problem>}
      {log.errors.length > 0 && <Problem>{log.errors[0]}{log.errors.length > 1 ? ` (${log.errors.length - 1} more rows could not be read)` : ''}</Problem>}
      {optsOk && !r && !log.errors.length && <Problem>No alarm activations found.</Problem>}
      {r && (
        <>
          <Result big={sig(r.per10, 3)} tone={{ ok: 'good', warn: undefined, bad: 'bad' }[AL.band(r.per10, 1, 2)]} label={`alarms per 10 minutes per operator, ${fmt(r.total)} activations over ${dur(r.hours * 3600)}`}>
            <Stats rows={[['Floods', `${r.floods.length} (${fmt(r.floodAlarms)} alarms, ${pc(r.floodShare)} of the time)`], ['Busiest 10 minutes', `${r.peakRolling} alarms from ${AL.fmtTime(r.peakAt)}`], ['Tags', fmt(r.nTags)], ['Rows ignored (ACK etc.)', fmt(log.ignored)]]} />
          </Result>
          <Timeline r={r} />
          <h3 className="clu-h3">Against the ISA-18.2 and EEMUA 191 targets</h3>
          <Table label="Alarm system performance" num={false} head={['Metric', 'This log', 'Target', '']} rows={kpi.map(([a, b, c, s, alt]) => [a, b, c, s ? <span key="s" className={`qtag ${TAG[s][0]}`}>{s === 'warn' && alt ? alt : TAG[s][1]}</span> : ''])} />
          {r.floods.length > 0 && (
            <>
              <h3 className="clu-h3">Flood periods</h3>
              <Table label="Flood periods" head={['Start', 'Duration', 'Alarms', 'Peak per 10 min']} rows={r.floods.slice(0, 20).map((f) => [AL.fmtTime(r.t0 + f.from * r.binS), dur((f.to - f.from + 1) * r.binS), f.count, f.peak])} />
            </>
          )}
          <h3 className="clu-h3">Top 10 contributors</h3>
          <Bars label="Top 10 tags by activations" rows={r.top10.map((g) => [`${g.tag}${g.chattering ? ' (chattering)' : ''}`, g.count / r.top10[0].count, `${g.count} (${pc(g.count / r.total)})`, g.chattering ? 'bad' : undefined])} />
          {r.chatter.length > 0 && <Table label="Chattering tags" head={['Tag', 'Activations', `Most within ${r.opts.chatterSec} s`, 'Worst burst from']} rows={r.chatter.map((g) => [g.tag, g.count, g.maxInWindow, AL.fmtTime(g.burstAt)])} />}
          {r.stale.length > 0 && <Table label="Stale alarms" head={['Tag', 'Longest active', 'Still active at end of log']} rows={r.stale.map((g) => [g.tag, dur(Math.max(g.longest, g.stillActive)), g.openAtEnd ? 'yes' : 'no'])} />}
          <div className="tl-row"><button type="button" className="btn ghost small" onClick={csv}>Download per-tag CSV</button></div>
          <StudySummary {...AL.alarmSummary(r)} />
        </>
      )}
      <About method="alarm-flood-analysis-eemua-191-isa-18-2">
        <p><b>Rates.</b> Activations (ALM rows) are counted in fixed 10-minute periods from the first event. Average rates are total ÷ time ÷ operators. The sliding-window peak is the most activations in any 10 minutes.</p>
        <p><b>Floods</b> (EEMUA 191, 3rd edition 2013; ANSI/ISA-18.2-2016): a flood starts in a 10-minute period with more than 10 alarms and continues until a period with fewer than 5; time in flood is the share of periods inside a flood. You can change both thresholds; setting the end to 11 gives the simple "more than 10 in 10 minutes" count.</p>
        <p><b>Chattering</b>: a tag with 3 or more activations within 60 seconds (ISA-TR18.2.5 rule of thumb). <b>Stale</b>: active longer than 24 hours (from ALM to RTN, or to the end of the log if it never returned). <b>Top 10 contributors</b>: the 10 tags with most activations and their share of all alarms.</p>
        <p><b>Targets</b> (ANSI/ISA-18.2-2016 section 16, table of recommended alarm performance metrics, which follows EEMUA 191): about 150 alarms per operator per day very likely acceptable and 300 the most manageable (6 and 12 per hour, 1 and 2 per 10 minutes); under about 1% of 10-minute periods with more than 10 alarms; at most 10 in any 10 minutes; under about 1% of time in flood; the top 10 alarms at most about 1% to 5% of the total; no chattering or fleeting alarms; fewer than 5 stale alarms on any day; a priority mix of about 80% low, 15% medium and 5% high. Checked against an independent Python analysis of the same log.</p>
        <p><b>When not to use it.</b> The targets are for continuous process operators. Clinical alarms, IT on-call pages and consumer notifications have different workloads, so use the same counts but set targets from your own operators' capacity. A short log (hours, or one day) can be dominated by one upset; use a week or more. Times are read as clock time with no time zone, so a daylight-saving change shows as a one-hour gap or overlap.</p>
      </About>
    </div>
  );
}

// ── Timeline: alarms per 10-minute period, flood periods shaded ──
function Timeline({ r }) {
  const W = 620, H = 200, L = 40, R = 10, T = 10, B = 34;
  const max = Math.max(...r.bins, r.opts.floodN + 2);
  const bw = (W - L - R) / r.nb;
  const sy = (v) => T + (1 - v / max) * (H - T - B);
  const inFlood = new Array(r.nb).fill(false); r.floods.forEach((f) => { for (let i = f.from; i <= f.to; i++) inFlood[i] = true; });
  const step = max > 40 ? 20 : max > 20 ? 10 : 5;
  const ticks = []; for (let v = 0; v <= max; v += step) ticks.push(v);
  const days = []; const d0 = Math.ceil(r.t0 / 86400) * 86400; for (let t = d0; t <= r.t0 + r.nb * r.binS; t += 86400) days.push(t);
  return (
    <figure className="ea-fig">
      <svg viewBox={`0 0 ${W} ${H}`} className="exp-plot tl-plot hf-timeline" role="img" aria-label="Alarms per 10-minute period over time, flood periods shaded">
        {r.floods.map((f, i) => <rect key={`f${i}`} x={L + f.from * bw} y={T} width={Math.max(2, (f.to - f.from + 1) * bw)} height={H - T - B} className="flood" />)}
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} className="ax" textAnchor="end">{v}</text></g>)}
        {r.bins.map((b, i) => b > 0 && <rect key={i} x={L + i * bw} y={sy(b)} width={Math.max(0.6, bw * 0.9)} height={H - B - sy(b)} className={`b${b > r.opts.floodN || inFlood[i] ? ' over' : ''}`} />)}
        <line x1={L} x2={W - R} y1={sy(r.opts.floodN)} y2={sy(r.opts.floodN)} className="thr" />
        <text x={W - R - 2} y={sy(r.opts.floodN) - 4} className="lbs" textAnchor="end">flood: more than {r.opts.floodN}</text>
        {max < 60 && <line x1={L} x2={W - R} y1={sy(1)} y2={sy(1)} className="ok" />}
        {days.map((t) => <g key={t}><line x1={L + ((t - r.t0) / r.binS) * bw} x2={L + ((t - r.t0) / r.binS) * bw} y1={H - B} y2={H - B + 5} className="grid" /><text x={L + ((t - r.t0) / r.binS) * bw} y={H - B + 18} className="ax" textAnchor="middle">{AL.fmtTime(t).slice(5, 10)}</text></g>)}
        <text x={(L + W - R) / 2} y={H - 3} className="ax" textAnchor="middle">Alarms per 10 minutes; shaded = flood; green line = target of 1</text>
      </svg>
    </figure>
  );
}

export default HfAlarmFlood;
