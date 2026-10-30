// Preference test (group "runners"): 2–4 designs shown side by side, one question, an optional "why" and an optional
// participant attribute for segments. Shares with Wilson intervals; an exact binomial test for two designs and a
// chi-square goodness-of-fit test for three or four; a head-to-head exact test of the leader against the runner-up;
// a chi-square test of independence across segments; and a check for position bias.
import { encodeCode, decodeCode, wilson, fisherExact, binomTest, chiSquareGof, chiSquareTable, seeded, newId, shuffle, range, sum, isUrl, toCsv, pc, pText, mdCell, plural, list } from './runners-common.js';

export { newId, isUrl };
export const TOOL = 'preference-test';
export const LETTERS = 'ABCD';

// ── Studies and results ──
// Study: { v: 1, t: 'pref', id, n: name, q: question, d: [{ l: label, u: image URL or 'ex:<name>', x: text }],
//          w: ask why (0/1), r: randomise positions (0/1), a: { q: attribute question, o: [options] } or null }.
export function makeStudy({ id, name, question, designs = [], why = true, randomise = true, attrQ = '', attrOptions = [] }) {
  const opts = attrOptions.map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
  return {
    v: 1, t: 'pref', id: id || newId(), n: String(name || 'Preference test').trim(), q: String(question || 'Which design do you prefer?').trim(),
    d: designs.slice(0, 4).map((d, i) => ({ l: String(d.l || `Design ${LETTERS[i]}`).trim(), u: String(d.u || '').trim(), x: String(d.x || '').trim() })),
    w: why ? 1 : 0, r: randomise ? 1 : 0,
    a: String(attrQ || '').trim() && opts.length >= 2 ? { q: String(attrQ).trim(), o: opts } : null,
  };
}
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'pref' || !Array.isArray(s.d) || s.d.length < 2) throw new Error('Not a preference-test study');
  return s;
}
// Result: { v: 1, t: 'prefr', s: study id, p: participant, d: time, c: chosen design, o: order shown, y: why, g: attribute option (−1 none), ms }.
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'prefr' || !Number.isInteger(r.c)) throw new Error('Not a preference-test result');
  return r;
}
export const displayOrder = (k, randomise, rnd = Math.random) => (randomise ? shuffle(range(k), rnd) : range(k));
// Problems that stop a study from being shared.
export function studyProblems(s) {
  const out = [];
  if (s.d.length < 2) out.push('Add at least two designs.');
  s.d.forEach((d, i) => { if (!d.u && !d.x) out.push(`Design ${LETTERS[i]} needs an image address or some text.`); else if (d.u && !d.u.startsWith('ex:') && !isUrl(d.u)) out.push(`Design ${LETTERS[i]}: the image address must start with https://`); });
  if (!s.q) out.push('Write the question.');
  return out;
}

// ── Analysis ──
export function analyse(study, results, conf = 0.95) {
  const K = study.d.length;
  const ok = results.filter((r) => r.c >= 0 && r.c < K);
  const n = ok.length;
  const counts = range(K).map((i) => ok.filter((r) => r.c === i).length);
  const designs = range(K).map((i) => ({ i, label: study.d[i].l, count: counts[i], share: n ? counts[i] / n : NaN, ci: n ? wilson(counts[i], n, conf) : null, reasons: ok.filter((r) => r.c === i && String(r.y || '').trim()).map((r) => ({ p: r.p, y: String(r.y).trim(), g: r.g })) }));
  const ranked = [...designs].sort((a, b) => b.count - a.count || a.i - b.i);
  const overall = !n ? null : K === 2 ? { kind: 'binomial', ...binomTest(counts[0], n, 0.5) } : { kind: 'chi2', ...chiSquareGof(counts) };
  const lead = ranked[0], second = ranked[1];
  const head = n && lead.count + second.count > 0 ? binomTest(lead.count, lead.count + second.count, 0.5) : null;
  const tied = n > 0 && lead.count === second.count;
  // Position bias: share who chose whatever was shown first, against 1/K.
  const withOrder = ok.filter((r) => Array.isArray(r.o) && r.o.length === K);
  const firstPos = withOrder.filter((r) => r.o[0] === r.c).length;
  const position = withOrder.length ? { n: withOrder.length, first: firstPos, share: firstPos / withOrder.length, expected: 1 / K, test: binomTest(firstPos, withOrder.length, 1 / K), randomised: withOrder.some((r) => r.o.some((v, j) => v !== j)) } : null;
  // Segments from the attribute question.
  let segments = null;
  if (study.a) {
    const O = study.a.o.length;
    const table = range(O).map((g) => range(K).map((i) => ok.filter((r) => r.g === g && r.c === i).length));
    const rows = range(O).map((g) => { const m = sum(table[g]); return { g, label: study.a.o[g], n: m, counts: table[g], shares: table[g].map((c) => (m ? c / m : NaN)), ci: table[g].map((c) => (m ? wilson(c, m, conf) : null)), top: m ? table[g].indexOf(Math.max(...table[g])) : -1 }; });
    const test = chiSquareTable(table);
    const used = rows.filter((r) => r.n > 0);
    const fisher = used.length === 2 && K === 2 ? { p: fisherExact(used[0].counts[0], used[0].counts[1], used[1].counts[0], used[1].counts[1]) } : null;
    segments = { question: study.a.q, rows, test, fisher, unanswered: ok.filter((r) => !(r.g >= 0 && r.g < O)).length };
  }
  const times = ok.map((r) => r.ms).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  const medianSec = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2) / 1000 : NaN;
  return { K, n, counts, designs, ranked, overall, head, tied, position, segments, medianSec, conf, withWhy: designs.reduce((s, d) => s + d.reasons.length, 0) };
}

// ── Reading the results ──
// Confidence rule (shown in confidenceNote):
//   high   — at least 30 participants, the overall test p < 0.01 and the leader beats the runner-up head to head (exact p < 0.05);
//   medium — the overall test p < 0.05, or at least 100 participants (enough to rule out a large preference even when none shows);
//   low    — anything else.
export function confidenceLevel(an) {
  const pO = an.overall?.p, pH = an.head?.p;
  if (an.n >= 30 && pO < 0.01 && pH < 0.05) return 'high';
  if (pO < 0.05 || an.n >= 100) return 'medium';
  return 'low';
}
const testText = (an) => (an.overall.kind === 'binomial'
  ? `exact binomial test against a 50/50 split, ${pText(an.overall.p)}`
  : `chi-square test against equal shares, χ²(${an.overall.df}) = ${an.overall.stat.toFixed(2)}, ${pText(an.overall.p)}`);
const ciText = (d) => (d.ci ? `${pc(d.ci.lo)}–${pc(d.ci.hi)}` : 'n/a');

export function summary(an) {
  if (!an || !an.n) return null;
  const { ranked, n, K } = an;
  const L = ranked[0], R2 = ranked[1];
  const sigO = an.overall.p < 0.05, sigH = an.head && an.head.p < 0.05;
  const confidence = confidenceLevel(an);
  const headline = an.tied
    ? `${L.label} and ${R2.label} tied with ${L.count} of ${n} participants each, so no design came out ahead.`
    : sigO && sigH
      ? `${L.label} was preferred by ${pc(L.share)} of ${n} participants (95% CI ${ciText(L)}), ahead of ${R2.label} at ${pc(R2.share)}.`
      : sigO
        ? `Preferences were not evenly spread, but ${L.label} (${pc(L.share)}) is not clearly ahead of ${R2.label} (${pc(R2.share)}) among ${n} participants.`
        : `${L.label} was chosen most often (${pc(L.share)} of ${n}), but the split is within what chance would give if people had no preference.`;
  const meaning = [
    `Shares: ${ranked.map((d) => `${d.label} ${pc(d.share)} (${ciText(d)})`).join(', ')}. The intervals are 95% Wilson intervals: ranges of shares that are compatible with these answers.`,
    `Against an even split (${pc(1 / K)} each): ${testText(an)}. ${sigO ? 'The choices were not random.' : 'This sample cannot tell the designs apart.'}`,
  ];
  if (K > 2 && an.head) meaning.push(`Head to head, ${L.label} against ${R2.label}: ${L.count} vs ${R2.count} among the ${L.count + R2.count} who chose either (exact binomial ${pText(an.head.p)}). ${sigH ? `${L.label} is ahead of the runner-up, not only of the weakest design.` : `${L.label} is not clearly ahead of the runner-up.`}`);
  const seg = an.segments;
  if (seg && seg.test && Number.isFinite(seg.test.p)) {
    const used = seg.rows.filter((r) => r.n > 0);
    const tops = used.map((r) => `${r.label}: ${an.designs[r.top].label} ${pc(r.shares[r.top])} (n = ${r.n})`);
    meaning.push(`By "${seg.question}": ${tops.join('; ')}. ${seg.test.p < 0.05 ? `The segments chose differently (χ²(${seg.test.df}) = ${seg.test.stat.toFixed(2)}, ${pText(seg.test.p)}, Cramér's V ${seg.test.v.toFixed(2)}).` : `The difference between segments could be chance (χ²(${seg.test.df}) = ${seg.test.stat.toFixed(2)}, ${pText(seg.test.p)}).`}`);
  }
  if (an.position && an.position.randomised && an.position.test.p < 0.05) meaning.push(`${pc(an.position.share)} chose whichever design was shown first (an even split would give ${pc(an.position.expected)}; ${pText(an.position.test.p)}): position influenced some answers, which randomising the order spreads across designs.`);
  if (an.withWhy) meaning.push(`${plural(an.withWhy, 'participant')} explained their choice; the reasons are listed under each design.`);
  const caveats = [
    'A preference is what people say they like at first sight. Nielsen and Levy (1994) found that people usually, but not always, prefer the design they perform better with, so test tasks too before choosing on looks alone.',
  ];
  if (an.overall.kind === 'chi2' && an.overall.minExpected < 5) caveats.push(`Some expected counts are below 5 (smallest ${an.overall.minExpected.toFixed(1)}), where the chi-square p-value is only approximate; the head-to-head exact test does not have this limit.`);
  else if (seg && seg.test && seg.test.minExpected < 5) caveats.push(`Some segment cells expect fewer than 5 people (smallest ${seg.test.minExpected.toFixed(1)}), so the segment test is approximate${seg.fisher ? `; Fisher's exact test gives p = ${seg.fisher.p.toFixed(3)}` : ''}.`);
  else caveats.push('Participants who did not care either way still had to choose; a share near the even split can mean "no preference" rather than "split opinions". Read the reasons to tell which.');
  if (an.position && !an.position.randomised) caveats.push('The designs were shown in the same order to everyone, so a preference for the first or left position is mixed into the shares. Turn on randomised order for the next round.');
  const next = sigO && sigH
    ? [`Read the reasons for ${L.label} and ${R2.label} to learn what drives the choice, and carry those qualities into the final design.`, 'Check the winner with a task-based test (first-click or usability) before committing.']
    : [`To detect a 60/40 split between two designs at 80% power you need about 200 participants; plan with the [sample size calculator](/calculators/sample-size).`, 'Read the reasons: if they cite different qualities, a combined design may beat both.'];
  if (seg && seg.test && seg.test.p < 0.05) next.push('Decide whose preference matters most (for example new versus existing customers) before choosing one design.');
  const confidenceNote = `Rule: strong when there are at least 30 participants, the overall test gives p < 0.01 and the leader beats the runner-up head to head (p < 0.05); some when the overall test gives p < 0.05, or there are at least 100 participants; weak otherwise. Here: ${n} participants, overall ${pText(an.overall.p)}${an.head ? `, head to head ${pText(an.head.p)}` : ''}.`;
  const report = `In a preference test with ${n} participants, ${ranked.map((d) => `${d.label} was chosen by ${pc(d.share)} (95% CI ${ciText(d)})`).join(', ')}; ${testText(an)}.`;
  return { headline, meaning: meaning.slice(0, 6), confidence, confidenceNote, caveats: caveats.slice(0, 3), next: next.slice(0, 3), report };
}

// ── Exports ──
export function resultsCsv(study, results) {
  const K = study.d.length;
  return toCsv([['participant', 'chosen', 'chosen_label', 'order_shown', ...(study.a ? ['attribute'] : []), 'why', 'seconds'],
    ...results.filter((r) => r.c >= 0 && r.c < K).map((r) => [r.p, LETTERS[r.c], study.d[r.c].l, (r.o || []).map((i) => LETTERS[i]).join(''), ...(study.a ? [study.a.o[r.g] ?? ''] : []), r.y || '', Number.isFinite(r.ms) ? (r.ms / 1000).toFixed(1) : ''])]);
}
export function markdown(study, an, sm) {
  const out = [`# ${study.n}: preference test`, '', `Question: ${study.q}`, '', `${an.n} participants.`, '', '| Design | Chosen | Share | 95% CI (Wilson) |', '|---|---|---|---|',
    ...an.ranked.map((d) => `| ${mdCell(d.label)} | ${d.count} | ${pc(d.share)} | ${ciText(d)} |`), ''];
  if (sm) out.push(`**${sm.headline}**`, '', ...sm.meaning.map((m) => `- ${m}`), '', `Confidence: ${sm.confidence}. ${sm.confidenceNote}`, '');
  if (an.segments) {
    out.push(`## By ${mdCell(an.segments.question)}`, '', `| Segment | n | ${an.designs.map((d) => mdCell(d.label)).join(' | ')} |`, `|---|---|${an.designs.map(() => '---').join('|')}|`);
    an.segments.rows.forEach((r) => out.push(`| ${mdCell(r.label)} | ${r.n} | ${r.counts.map((c, i) => `${c} (${pc(r.shares[i])})`).join(' | ')} |`));
    out.push('');
  }
  an.designs.forEach((d) => { if (d.reasons.length) out.push(`## Why ${mdCell(d.label)}`, '', ...d.reasons.map((x) => `- ${mdCell(x.y)} (${x.p})`), ''); });
  return out.join('\n');
}

// ── Built-in example ──
// Three pricing-page layouts drawn as SVG wireframes (referenced as 'ex:<name>' so they travel in links).
const W = 640, H = 420;
function wire(kind) {
  const ink = '#1d2329', soft = '#e9edf0', mid = '#9aa5ad', acc = '#2a78d6', bg = '#ffffff';
  const t = (x, y, s, w = 400, c = ink, a = 'start') => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${s}" font-weight="${w}" fill="${c}" text-anchor="${a}">`;
  const bar = (x, y, w, h = 8, c = soft) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}"/>`;
  let body = `<rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="44" fill="${soft}"/>${t(20, 28, 16, 700)}Fieldnote</text>${t(W - 20, 28, 13, 400, mid, 'end')}Product  Pricing  Sign in</text>`;
  const plans = [['Solo', '£0'], ['Team', '£8'], ['Business', '£15']];
  if (kind === 'A') {
    body += `${t(W / 2, 86, 24, 700, ink, 'middle')}Simple pricing for every team</text>`;
    plans.forEach(([n, p], i) => {
      const x = 30 + i * 200;
      body += `<rect x="${x}" y="110" width="180" height="270" rx="8" fill="${bg}" stroke="${mid}"/>${t(x + 90, 145, 16, 700, ink, 'middle')}${n}</text>${t(x + 90, 190, 30, 700, ink, 'middle')}${p}</text>${t(x + 90, 210, 11, 400, mid, 'middle')}per person / month</text>`;
      for (let k = 0; k < 4; k++) body += bar(x + 24, 236 + k * 20, 132 - (k % 2) * 30);
      body += `<rect x="${x + 24}" y="330" width="132" height="32" rx="5" fill="${soft}" stroke="${mid}"/>${t(x + 90, 351, 13, 700, ink, 'middle')}Choose</text>`;
    });
  } else if (kind === 'B') {
    body += `${t(W / 2, 86, 24, 700, ink, 'middle')}Pick the plan that fits</text>`;
    plans.forEach(([n, p], i) => {
      const x = 30 + i * 200, rec = i === 1, y = rec ? 98 : 116, h = rec ? 294 : 264;
      body += `<rect x="${x}" y="${y}" width="180" height="${h}" rx="8" fill="${bg}" stroke="${rec ? acc : mid}" stroke-width="${rec ? 3 : 1}"/>`;
      if (rec) body += `<rect x="${x + 40}" y="${y - 12}" width="100" height="22" rx="11" fill="${acc}"/>${t(x + 90, y + 3, 11, 700, '#fff', 'middle')}MOST POPULAR</text>`;
      body += `${t(x + 90, y + 40, 16, 700, ink, 'middle')}${n}</text>${t(x + 90, y + 84, 30, 700, ink, 'middle')}${p}</text>${t(x + 90, y + 104, 11, 400, mid, 'middle')}per person / month</text>`;
      for (let k = 0; k < 4; k++) body += `<circle cx="${x + 28}" cy="${y + 134 + k * 22}" r="5" fill="${rec ? acc : mid}"/>${bar(x + 40, y + 130 + k * 22, 112 - (k % 2) * 26)}`;
      body += `<rect x="${x + 24}" y="${y + h - 50}" width="132" height="32" rx="5" fill="${rec ? acc : soft}" stroke="${rec ? acc : mid}"/>${t(x + 90, y + h - 29, 13, 700, rec ? '#fff' : ink, 'middle')}${rec ? 'Start free trial' : 'Choose'}</text>`;
    });
  } else {
    body += `${t(40, 92, 24, 700)}How many people are on your team?</text>`;
    body += `${bar(40, 140, 560, 8)}${bar(40, 140, 210, 8, acc)}<circle cx="250" cy="144" r="12" fill="${acc}"/>${t(250, 180, 14, 700, ink, 'middle')}12 people</text>`;
    body += `<rect x="40" y="210" width="560" height="170" rx="8" fill="${bg}" stroke="${mid}"/>${t(70, 256, 16, 700)}Recommended: Team</text>${t(70, 310, 40, 700)}£96</text>${t(190, 310, 13, 400, mid)}per month for 12 people</text>`;
    for (let k = 0; k < 3; k++) body += bar(380, 240 + k * 22, 180 - k * 30);
    body += `<rect x="380" y="320" width="190" height="36" rx="5" fill="${acc}"/>${t(475, 343, 13, 700, '#fff', 'middle')}Start free trial</text>${t(70, 360, 12, 400, acc)}Compare all plans</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
}
export const exampleSrc = (name) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(wire(name))}`;
export const imageSrc = (u) => (String(u || '').startsWith('ex:') ? exampleSrc(u.slice(3)) : u);

export function exampleStudy() {
  return makeStudy({
    id: 'prefex1', name: 'Pricing page layouts', question: 'Which pricing page would you rather use to choose a plan for your team?',
    designs: [{ l: 'Three equal cards', u: 'ex:A' }, { l: 'Recommended plan', u: 'ex:B' }, { l: 'Team-size slider', u: 'ex:C' }],
    why: true, randomise: true, attrQ: 'Do you use Fieldnote today?', attrOptions: ['Yes, my team uses it', 'No'],
  });
}
const REASONS = [
  ['Clean and even, I can compare quickly', 'No pressure, it just lists the plans', 'Looks honest, nothing pushed at me', 'Easy to see the prices side by side'],
  ['The highlighted plan tells me where to start', 'I like the free trial button', 'Clear which plan most teams pick', 'The ticks make the differences obvious', 'Saves me reading all three'],
  ['I see the actual price for my team', 'The slider is quick and fun', 'I hate doing the per-person maths', 'It tells me the total straight away'],
];
// 72 simulated participants: customers lean to the recommended plan, prospects split more evenly and like the slider more.
export function exampleResults(study = exampleStudy()) {
  const rnd = seeded(20261030);
  const out = [];
  for (let i = 0; i < 72; i++) {
    const g = i % 5 < 2 ? 0 : 1;
    const probs = g === 0 ? [0.14, 0.7, 0.16] : [0.3, 0.42, 0.28];
    const u = rnd(); const c = u < probs[0] ? 0 : u < probs[0] + probs[1] ? 1 : 2;
    const o = shuffle([0, 1, 2], rnd);
    // A little position bias: a few people who would have chosen the third design take the first one shown.
    const chosen = rnd() < 0.08 ? o[0] : c;
    const why = rnd() < 0.55 ? REASONS[chosen][Math.floor(rnd() * REASONS[chosen].length)] : '';
    out.push({ v: 1, t: 'prefr', s: study.id, p: `P-${String(i + 1).padStart(2, '0')}`, d: 1793318400000 + i * 600000, c: chosen, o, y: why, g, ms: Math.round(9000 + rnd() * 30000) });
  }
  return out;
}
export const exampleCodes = () => exampleResults().map(encodeResult).join('\n');
export { list };
