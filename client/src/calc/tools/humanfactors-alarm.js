// Alarm flood analysis of an alarm and event log, against the ANSI/ISA-18.2-2016 (IEC 62682) alarm system
// performance metrics and EEMUA 191 (3rd ed. 2013). Pure functions, no React.
import { rng, nonEmptyLines, splitCells, sig, fmt } from './humanfactors-core.js';

// Benchmarks: the ANSI/ISA-18.2-2016 table of recommended alarm system performance metrics (section 16), which
// follows EEMUA 191. Values entered from the standards' widely reproduced table, not re-checked against the text.
export const TARGETS = {
  perDay: { ok: 150, max: 300, text: '~150 per operator per day very likely acceptable; ~300 maximum manageable' },
  perHour: { ok: 6, max: 12, text: '~6 per hour acceptable; ~12 maximum manageable' },
  per10: { ok: 1, max: 2, text: '~1 per 10 minutes acceptable; ~2 maximum manageable' },
  floodShare: { ok: 0.01, text: '< ~1% of 10-minute periods with more than 10 alarms' },
  max10: { ok: 10, text: 'maximum in any 10 minutes ≤ 10' },
  top10: { ok: 0.05, text: 'top 10 alarms ~1% to 5% of all alarms at most' },
  chatter: { ok: 0, text: 'chattering and fleeting alarms: zero' },
  stale: { ok: 5, text: 'stale alarms: fewer than 5 on any day' },
  priority: { text: 'priority mix about 80% low, 15% medium, 5% high' },
};

// Timestamps: "YYYY-MM-DD HH:MM[:SS[.sss]]" (or with T), read as clock time with no time zone; or plain seconds.
export function parseTime(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/.exec(String(s).trim());
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 + (m[7] ? Number(`0.${m[7]}`) : 0);
  const n = Number(s);
  return Number.isFinite(n) && String(s).trim() !== '' ? n : NaN;
}
export const fmtTime = (t) => { const d = new Date(Math.round(t) * 1000); return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 19)}`; };
const ACTIVE = /^(alm|alarm|active|act|in|on|raise|raised|1|new|unack)$/i;
const CLEAR = /^(rtn|return|normal|clear|cleared|cle|out|off|0|ok|reset)$/i;

// Columns: time, tag, then optional priority and state (ALM / RTN). A header row naming the columns is optional
// and lets the columns come in any order. Rows whose state is ACK or anything else are ignored.
export function parseAlarmLog(text) {
  const lines = nonEmptyLines(text);
  const errors = [];
  if (!lines.length) return { events: [], errors: ['Paste an alarm log: one row per event with a time and a tag.'] };
  let cells = splitCells(lines[0]);
  let col = { time: 0, tag: 1, priority: 2, state: 3 };
  let start = 0;
  if (!Number.isFinite(parseTime(cells[0]))) {
    const h = cells.map((c) => c.toLowerCase());
    const find = (re) => h.findIndex((c) => re.test(c));
    col = { time: find(/time|date|stamp|when/), tag: find(/tag|alarm|point|source|name/), priority: find(/prio|severity|class/), state: find(/state|event|type|status/) };
    if (col.time < 0) col.time = 0;
    if (col.tag < 0) col.tag = 1;
    start = 1;
  }
  const events = [];
  let ignored = 0;
  for (let i = start; i < lines.length; i++) {
    cells = splitCells(lines[i]);
    const t = parseTime(cells[col.time]);
    const tag = (cells[col.tag] || '').trim();
    if (!Number.isFinite(t) || !tag) { if (errors.length < 5) errors.push(`Row ${i + 1}: could not read a time and a tag from "${lines[i]}".`); continue; }
    const st = col.state >= 0 ? (cells[col.state] || '').trim() : '';
    const kind = !st || ACTIVE.test(st) ? 'alm' : CLEAR.test(st) ? 'rtn' : null;
    if (!kind) { ignored++; continue; }
    const pr = col.priority >= 0 ? normPriority(cells[col.priority]) : null;
    events.push({ t, tag, kind, priority: pr });
  }
  events.sort((a, b) => a.t - b.t);
  return { events, errors, ignored, hasState: col.state >= 0, hasPriority: col.priority >= 0 };
}
const normPriority = (p) => { const s = String(p || '').trim().toLowerCase(); if (!s) return null; if (/^(1|h|hi|high|urgent|critical|emergency)/.test(s)) return 'high'; if (/^(2|m|med|medium)/.test(s)) return 'medium'; if (/^(3|4|l|lo|low|diag|journal)/.test(s)) return 'low'; return s; };

// Analysis. opts: binMin (10), floodN (alarms per bin that count as a flood, 10), floodEnd (EEMUA 191: the flood
// continues until a 10-minute period has fewer than this many alarms, 5; set to floodN + 1 for the simple
// definition), chatterN / chatterSec (3 activations of one tag within 60 s), staleHours (24), operators (1).
export function analyseAlarms(events, opts = {}) {
  const { binMin = 10, floodN = 10, floodEnd = 5, chatterN = 3, chatterSec = 60, staleHours = 24, operators = 1, start, end } = opts;
  const alms = events.filter((e) => e.kind === 'alm');
  if (!alms.length) return null;
  const binS = binMin * 60;
  const t0 = Math.floor((start ?? events[0].t) / binS) * binS;
  const tEnd = end ?? events[events.length - 1].t;
  const nb = Math.max(1, Math.floor((tEnd - t0) / binS) + 1);
  const bins = new Array(nb).fill(0);
  for (const a of alms) { const i = Math.floor((a.t - t0) / binS); if (i >= 0 && i < nb) bins[i]++; }
  const hours = Math.max(nb * binMin / 60, 1e-9);
  const hS = 3600, h0 = Math.floor(t0 / hS) * hS, nh = Math.floor((tEnd - h0) / hS) + 1;
  const hourBins = new Array(nh).fill(0);
  for (const a of alms) hourBins[Math.floor((a.t - h0) / hS)]++;
  // Floods (EEMUA 191): starts in a period with more than floodN alarms, continues until a period with fewer than
  // floodEnd alarms (that period is not part of the flood).
  const inFlood = new Array(nb).fill(false);
  const floods = [];
  let cur = null;
  for (let i = 0; i < nb; i++) {
    if (!cur && bins[i] > floodN) cur = { from: i, to: i, count: 0, peak: 0 };
    else if (cur && bins[i] < floodEnd) { floods.push(cur); cur = null; }
    if (cur) { cur.to = i; cur.count += bins[i]; cur.peak = Math.max(cur.peak, bins[i]); inFlood[i] = true; }
  }
  if (cur) floods.push(cur);
  const floodBins = inFlood.filter(Boolean).length;
  const over = bins.filter((b) => b > floodN).length;
  // Peak count in any sliding 10-minute window (two pointers over activation times).
  let peakRolling = 0, peakAt = alms[0].t;
  for (let i = 0, j = 0; i < alms.length; i++) {
    while (alms[i].t - alms[j].t >= binS) j++;
    if (i - j + 1 > peakRolling) { peakRolling = i - j + 1; peakAt = alms[j].t; }
  }
  // Per tag: count, chattering, durations and stale.
  const byTag = new Map();
  for (const e of events) {
    let g = byTag.get(e.tag);
    if (!g) { g = { tag: e.tag, count: 0, times: [], priority: e.priority, active: null, longest: 0, rtn: 0 }; byTag.set(e.tag, g); }
    if (e.priority && !g.priority) g.priority = e.priority;
    if (e.kind === 'alm') { g.count++; g.times.push(e.t); if (g.active === null) g.active = e.t; }
    else if (g.active !== null) { g.longest = Math.max(g.longest, e.t - g.active); g.active = null; g.rtn++; }
  }
  const tags = [...byTag.values()].filter((g) => g.count > 0);
  for (const g of tags) {
    let maxIn = 0, burstAt = null;
    for (let i = 0, j = 0; i < g.times.length; i++) { while (g.times[i] - g.times[j] > chatterSec) j++; if (i - j + 1 > maxIn) { maxIn = i - j + 1; burstAt = g.times[j]; } }
    g.maxInWindow = maxIn; g.chattering = maxIn >= chatterN; g.burstAt = burstAt;
    g.openAtEnd = g.active !== null;
    g.stillActive = g.active !== null ? tEnd - g.active : 0;
    g.stale = Math.max(g.longest, g.stillActive) > staleHours * 3600;
  }
  tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const total = alms.length;
  const top10 = tags.slice(0, 10);
  const top10Count = top10.reduce((a, g) => a + g.count, 0);
  const prio = { high: 0, medium: 0, low: 0, other: 0 };
  for (const a of alms) { const p = a.priority || byTag.get(a.tag).priority; if (p in prio) prio[p]++; else if (p) prio.other++; }
  const prioKnown = prio.high + prio.medium + prio.low + prio.other;
  const chatter = tags.filter((g) => g.chattering);
  const chatterAlarms = chatter.reduce((a, g) => a + g.count, 0);
  const stale = tags.filter((g) => g.stale);
  return {
    total, tags, top10, top10Count, top10Share: top10Count / total, nTags: tags.length,
    hours, days: hours / 24, perHour: total / hours / operators, per10: total / (hours * 6) / operators, perDay: (total / hours) * 24 / operators,
    bins, binS, t0, tEnd, nb, over, overShare: over / nb, floods, floodBins, floodShare: floodBins / nb, floodAlarms: floods.reduce((a, f) => a + f.count, 0),
    max10: Math.max(...bins), peakRolling, peakAt, hourBins, over30h: hourBins.filter((h) => h > 30).length / nh, nh,
    chatter, chatterAlarms, stale, prio, prioKnown, staleCheckable: tEnd - events[0].t > staleHours * 3600 || events.some((e) => e.kind === 'rtn'),
    hasRtn: events.some((e) => e.kind === 'rtn'), opts: { binMin, floodN, floodEnd, chatterN, chatterSec, staleHours, operators },
  };
}
export const band = (v, ok, max) => (v <= ok ? 'ok' : max !== undefined && v <= max ? 'warn' : 'bad');

// Confidence rule (alarm floods): the counts are exact for the log given, so confidence is about whether the log is
// representative. High when it covers at least 7 days (a full weekly cycle) and includes return-to-normal events
// (needed for stale and fleeting checks); medium when it covers at least 24 hours; low for shorter logs, where one
// upset can dominate every rate.
export function alarmSummary(r) {
  const confidence = r.days >= 7 && r.hasRtn ? 'high' : r.hours >= 24 ? 'medium' : 'low';
  const rateBand = band(r.per10, 1, 2);
  const headline = `${fmt(r.total)} alarms in ${r.days >= 2 ? `${sig(r.days, 3)} days` : `${sig(r.hours, 3)} hours`}: an average of ${sig(r.per10, 2)} per 10 minutes per operator (${fmt(r.perDay, 0)} per day), ${rateBand === 'ok' ? 'within' : rateBand === 'warn' ? 'above the acceptable level but within the maximum manageable rate of' : 'above'} the ISA-18.2 / EEMUA 191 ${rateBand === 'warn' ? '~2 per 10 minutes' : 'benchmarks'}, and ${pct(r.floodShare)} of the time in flood.`;
  const meaning = [
    `${r.floods.length} flood${r.floods.length === 1 ? '' : 's'} (a 10-minute period with more than ${r.opts.floodN} alarms, lasting until a period with fewer than ${r.opts.floodEnd}): ${fmt(r.floodAlarms)} alarms, ${pct(r.floodAlarms / r.total)} of the total. The busiest 10 minutes held ${r.peakRolling} alarms (from ${fmtTime(r.peakAt)}).`,
    `${pct(r.overShare)} of 10-minute periods had more than ${r.opts.floodN} alarms (target below 1%).`,
    `The 10 most frequent tags produced ${pct(r.top10Share)} of all alarms (target 1% to 5%)${r.top10[0] ? `; "${r.top10[0].tag}" alone gave ${fmt(r.top10[0].count)} (${pct(r.top10[0].count / r.total)})` : ''}.`,
    r.chatter.length ? `${r.chatter.length} tag${r.chatter.length === 1 ? ' is' : 's are'} chattering (${r.opts.chatterN} or more activations within ${r.opts.chatterSec} s): ${r.chatter.slice(0, 4).map((g) => `"${g.tag}"`).join(', ')}${r.chatter.length > 4 ? ' and others' : ''}, ${fmt(r.chatterAlarms)} alarms in all. The target is none.` : 'No chattering tags were found (target: none).',
    !r.hasRtn ? 'The log has no return-to-normal events, so stale alarms cannot be identified.' : r.stale.length ? `${r.stale.length} alarm${r.stale.length === 1 ? ' was' : 's were'} stale (active more than ${r.opts.staleHours} hours): ${r.stale.slice(0, 4).map((g) => `"${g.tag}"`).join(', ')}.` : `No alarm stayed active longer than ${r.opts.staleHours} hours.`,
  ];
  if (r.prioKnown) meaning.push(`Priority mix: ${pct(r.prio.high / r.prioKnown)} high, ${pct(r.prio.medium / r.prioKnown)} medium, ${pct(r.prio.low / r.prioKnown)} low (guide: about 5%, 15%, 80%).`);
  const caveats = ['Rates are per operator only if you set the number of operators who share this log; one console\'s log usually means one operator.', 'Benchmarks come from process control. For notifications in consumer or clinical software, treat them as a starting point and set your own targets from operator workload studies.'];
  const next = [r.top10Share > 0.05 ? 'Rationalise the top contributors first: fixing the few noisiest tags removes most of the load.' : 'Review flood periods: find the initiating alarm and suppress or group the consequential ones (state-based or flood suppression).', r.chatter.length ? 'Add deadbands, on- or off-delays to the chattering tags.' : 'Re-run monthly to track the rates against the targets.'];
  const report = `Over ${r.days >= 2 ? `${sig(r.days, 3)} days` : `${sig(r.hours, 3)} hours`} the alarm log held ${fmt(r.total)} alarms from ${r.nTags} tags (${sig(r.per10, 2)} per 10 minutes, ${fmt(r.perDay, 0)} per day per operator). ${pct(r.overShare)} of 10-minute periods exceeded ${r.opts.floodN} alarms and ${pct(r.floodShare)} of the time was in flood (${plural(r.floods.length, 'flood')}, EEMUA 191 definition); the top 10 tags gave ${pct(r.top10Share)} of alarms; ${plural(r.chatter.length, 'tag')} ${r.chatter.length === 1 ? 'was' : 'were'} chattering and ${r.hasRtn ? `${r.stale.length} ${r.stale.length === 1 ? 'was' : 'were'} stale` : 'stale alarms could not be checked'} (benchmarks: ISA-18.2-2016 / EEMUA 191).`;
  return { headline, meaning, confidence, confidenceNote: 'The counts are exact for this log, so confidence is about whether the log is typical. High when it covers at least 7 days and records return-to-normal events; medium when it covers at least 24 hours; low for shorter logs, where one upset can dominate every rate.', caveats, next, report };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%` : 'n/a');

// Example: a simulated three-day log for one control-room console. Background alarms arrive at random over ~40
// tags, two process upsets cause floods, one level switch chatters, and one alarm is left standing (stale).
export function exampleLog(seed = 7) {
  const u = rng(seed);
  const tags = Array.from({ length: 40 }, (_, i) => ({ tag: `${['TI', 'PI', 'FI', 'LI', 'AI'][i % 5]}-${100 + i * 7}${['HI', 'LO', 'HH', 'LL'][i % 4]}`, w: 1 / (i + 1) ** 1.1, prio: i % 10 === 0 ? 'High' : i % 4 === 1 ? 'Medium' : 'Low' }));
  const wsum = tags.reduce((a, t) => a + t.w, 0);
  const pick = () => { let r = u() * wsum; for (const t of tags) { r -= t.w; if (r <= 0) return t; } return tags[tags.length - 1]; };
  const T0 = Date.UTC(2026, 2, 2, 6, 0, 0) / 1000, dur = 3 * 86400;
  const ev = [];
  const add = (t, tag, prio, rtnAfter) => { ev.push([t, tag, prio, 'ALM']); if (rtnAfter !== null && t + rtnAfter < T0 + dur) ev.push([t + rtnAfter, tag, prio, 'RTN']); };
  // Background: ~9 alarms per hour.
  for (let t = T0; t < T0 + dur;) { t += -Math.log(1 - u()) * 400; if (t >= T0 + dur) break; const g = pick(); add(t, g.tag, g.prio, 30 + u() * 1800); }
  // Two upsets: a compressor trip and a feed loss, each a burst of consequential alarms.
  // Each upset trips many different tags once (a tag already in alarm cannot alarm again; see below).
  const unit = [...tags, ...Array.from({ length: 30 }, (_, i) => ({ tag: `${['XA', 'TAH', 'PAL', 'FAL', 'ZSC'][i % 5]}-${500 + i * 3}`, prio: i % 6 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low' }))];
  for (const [start, n, span] of [[T0 + 14.2 * 3600, 58, 1500], [T0 + 50.6 * 3600, 40, 1100]]) {
    const pool = [...unit];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (let k = 0; k < n; k++) { const g = pool[k]; add(start + (span * k) / n + u() * 20, g.tag, g.prio, 300 + u() * 3000); }
  }
  // A chattering level switch: bursts of 4–6 activations a few seconds apart, several times a day.
  for (let b = 0; b < 9; b++) { const s = T0 + (b + 0.3) * 8 * 3600 + u() * 3600; const k = 4 + Math.floor(u() * 3); for (let j = 0; j < k; j++) add(s + j * (6 + u() * 6), 'LSH-207', 'Low', 3); }
  // A stale alarm: raised on day 1 and never cleared.
  add(T0 + 2.5 * 3600, 'PDI-330HI', 'Medium', null);
  ev.sort((a, b) => a[0] - b[0] || (a[3] === 'RTN' ? -1 : 1));
  // Keep each tag's states consistent, as a real alarm system logs them: a tag already in alarm cannot alarm again
  // until it returns to normal, and a return only counts while the tag is in alarm.
  const active = new Set(), kept = [];
  for (const e of ev) {
    const [, tag, , s] = e;
    if (s === 'ALM' && !active.has(tag)) { active.add(tag); kept.push(e); }
    else if (s === 'RTN' && active.has(tag)) { active.delete(tag); kept.push(e); }
  }
  return `Time, Tag, Priority, State\n${kept.map(([t, tag, p, s]) => `${fmtTime(t)}, ${tag}, ${p}, ${s}`).join('\n')}`;
}
