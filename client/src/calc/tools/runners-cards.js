// Desirability test with the Microsoft Product Reaction Cards (group "runners"). The 118 words are from Benedek, J. and
// Miner, T. (2002) "Measuring desirability: New methods for evaluating desirability in a usability lab setting",
// Proceedings of the Usability Professionals' Association conference (Microsoft Corporation). The authors built the
// list to be about 60% positive and 40% negative or neutral; the valence of each word below is this tool's reading of
// that split (73 positive, 40 negative, 5 neutral), listed on the page so researchers can see it.
import { encodeCode, decodeCode, wilson, clusterOls, clusteredShare, seeded, newId, shuffle, range, sum, toCsv, pc, f2, pText, mdCell, plural, list } from './runners-common.js';
import { tCdf } from '../stats.js';

export { newId };
export const TOOL = 'reaction-cards';

const NEG = ['Annoying', 'Boring', 'Busy', 'Confusing', 'Dated', 'Difficult', 'Disconnected', 'Disruptive', 'Distracting', 'Dull', 'Fragile', 'Frustrating', 'Gets in the way', 'Hard to use', 'Impersonal', 'Incomprehensible', 'Inconsistent', 'Ineffective', 'Intimidating', 'Irrelevant', 'Not secure', 'Not valuable', 'Old', 'Overbearing', 'Overwhelming', 'Patronizing', 'Poor quality', 'Rigid', 'Simplistic', 'Slow', 'Sterile', 'Stressful', 'Time-consuming', 'Too technical', 'Unapproachable', 'Unattractive', 'Uncontrollable', 'Undesirable', 'Unpredictable', 'Unrefined'];
const NEUTRAL = ['Business-like', 'Complex', 'Expected', 'Ordinary', 'Unconventional'];
export const WORDS = ['Accessible', 'Advanced', 'Annoying', 'Appealing', 'Approachable', 'Attractive', 'Boring', 'Business-like', 'Busy', 'Calm', 'Clean', 'Clear', 'Collaborative', 'Comfortable', 'Compatible', 'Compelling', 'Complex', 'Comprehensive', 'Confident', 'Confusing', 'Connected', 'Consistent', 'Controllable', 'Convenient', 'Creative', 'Customizable', 'Cutting edge', 'Dated', 'Desirable', 'Difficult', 'Disconnected', 'Disruptive', 'Distracting', 'Dull', 'Easy to use', 'Effective', 'Efficient', 'Effortless', 'Empowering', 'Energetic', 'Engaging', 'Entertaining', 'Enthusiastic', 'Essential', 'Exceptional', 'Exciting', 'Expected', 'Familiar', 'Fast', 'Flexible', 'Fragile', 'Fresh', 'Friendly', 'Frustrating', 'Fun', 'Gets in the way', 'Hard to use', 'Helpful', 'High quality', 'Impersonal', 'Impressive', 'Incomprehensible', 'Inconsistent', 'Ineffective', 'Innovative', 'Inspiring', 'Integrated', 'Intimidating', 'Intuitive', 'Inviting', 'Irrelevant', 'Low maintenance', 'Meaningful', 'Motivating', 'Not secure', 'Not valuable', 'Novel', 'Old', 'Optimistic', 'Ordinary', 'Organized', 'Overbearing', 'Overwhelming', 'Patronizing', 'Personal', 'Poor quality', 'Powerful', 'Predictable', 'Professional', 'Relevant', 'Reliable', 'Responsive', 'Rigid', 'Satisfying', 'Secure', 'Simplistic', 'Slow', 'Sophisticated', 'Stable', 'Sterile', 'Stimulating', 'Straight forward', 'Stressful', 'Time-consuming', 'Time-saving', 'Too technical', 'Trustworthy', 'Unapproachable', 'Unattractive', 'Uncontrollable', 'Unconventional', 'Understandable', 'Undesirable', 'Unpredictable', 'Unrefined', 'Usable', 'Useful', 'Valuable'];
// Valence per word: 'p' positive, 'n' negative, 'o' neutral. "Positive share" counts only 'p'.
export const VALENCE = WORDS.map((w) => (NEG.includes(w) ? 'n' : NEUTRAL.includes(w) ? 'o' : 'p'));
export const VALENCE_NAMES = { p: 'positive', n: 'negative', o: 'neutral' };
export const BASE_RATE = VALENCE.filter((v) => v === 'p').length / WORDS.length; // 73/118, the share if words were picked at random

// ── Studies and results ──
// Study: { v: 1, t: 'prc', id, n, d: [{ l: label, u: image, x: prompt text }] (1–2), m: 'w' within (each person rates
//          every design, order shuffled) | 'b' between (one design each), mx: most words (0 = no limit), mn: fewest, t5: ask top 5 }.
export function makeStudy({ id, name, designs = [], mode = 'b', max = 8, min = 3, top5 = true }) {
  const mx = Math.max(0, Math.min(40, Math.round(Number(max) || 0)));
  return {
    v: 1, t: 'prc', id: id || newId(), n: String(name || 'Desirability test').trim(),
    d: designs.slice(0, 2).map((d, i) => ({ l: String(d.l || `Design ${i + 1}`).trim(), u: String(d.u || '').trim(), x: String(d.x || '').trim() })),
    m: mode === 'w' ? 'w' : 'b', mx, mn: Math.max(1, Math.min(mx || 40, Math.round(Number(min) || 1))), t5: top5 ? 1 : 0,
  };
}
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'prc' || !Array.isArray(s.d) || !s.d.length) throw new Error('Not a reaction-card study');
  return s;
}
// Result: { v: 1, t: 'prcr', s, p, d: time, r: [{ d: design, w: [word indices], t: [top-5 word indices] }], ms }.
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'prcr' || !Array.isArray(r.r)) throw new Error('Not a reaction-card result');
  return r;
}
// Which designs a participant sees, in order: all of them shuffled (within) or one (between; rotated by session in
// moderated runs, random otherwise).
export function assignDesigns(study, session = null, rnd = Math.random) {
  const K = study.d.length;
  if (K === 1) return [0];
  if (study.m === 'w') return shuffle(range(K), rnd);
  return [session != null ? session % K : Math.floor(rnd() * K)];
}

// ── Analysis ──
const clean = (arr) => [...new Set((arr || []).filter((i) => Number.isInteger(i) && i >= 0 && i < WORDS.length))];
export function responsesOf(study, results) {
  const out = [];
  results.forEach((r) => (r.r || []).forEach((x) => { if (x.d >= 0 && x.d < study.d.length) { const w = clean(x.w); if (w.length) out.push({ p: r.p, d: x.d, w, t: clean(x.t).filter((i) => w.includes(i)) }); } }));
  return out;
}
// Words chosen by a share of participants with Wilson intervals; positive share of all picks with a cluster-robust
// interval (one person picks many words) and a t-test against the 73/118 base rate.
function designStats(rs, conf) {
  const n = rs.length;
  const counts = new Array(WORDS.length).fill(0), tops = new Array(WORDS.length).fill(0);
  rs.forEach((r) => { r.w.forEach((i) => { counts[i]++; }); r.t.forEach((i) => { tops[i]++; }); });
  const words = range(WORDS.length).filter((i) => counts[i] > 0).map((i) => ({ i, word: WORDS[i], valence: VALENCE[i], count: counts[i], share: counts[i] / n, ci: wilson(counts[i], n, conf), top: tops[i] }))
    .sort((a, b) => b.count - a.count || b.top - a.top || a.word.localeCompare(b.word));
  const picks = sum(rs.map((r) => r.w.length));
  const pos = clusteredShare(rs.map((r, g) => ({ g, yes: r.w.filter((i) => VALENCE[i] === 'p').length, total: r.w.length })), conf);
  const neg = picks ? sum(rs.map((r) => r.w.filter((i) => VALENCE[i] === 'n').length)) / picks : NaN;
  const vsBase = Number.isFinite(pos.se) && pos.se > 0 ? (() => { const t = (pos.share - BASE_RATE) / pos.se; return { t, df: pos.df, p: 2 * (1 - tCdf(Math.abs(t), pos.df)) }; })() : null;
  const withTop = rs.filter((r) => r.t.length);
  const topPos = withTop.length ? clusteredShare(withTop.map((r, g) => ({ g, yes: r.t.filter((i) => VALENCE[i] === 'p').length, total: r.t.length })), conf) : null;
  return { n, picks, meanPicks: n ? picks / n : NaN, words, counts, tops, pos, neg, vsBase, topPos, topN: withTop.length };
}
export function analyse(study, results, conf = 0.95) {
  const rs = responsesOf(study, results);
  const designs = study.d.map((d, k) => ({ k, label: d.l, ...designStats(rs.filter((r) => r.d === k), conf) }));
  const people = new Set(rs.map((r) => r.p)).size;
  let compare = null;
  if (study.d.length === 2 && designs.every((d) => d.n >= 2)) {
    // Word-level 0/1 (positive) on a design indicator, clustered by participant: the slope is the difference in
    // positive share (design 2 − design 1), valid for between- and within-participant designs alike.
    const rows = [];
    rs.forEach((r) => r.w.forEach((i) => rows.push({ y: VALENCE[i] === 'p' ? 1 : 0, x: [1, r.d], g: r.p })));
    const m = clusterOls(rows, conf);
    const paired = rs.filter((r) => r.d === 0).some((a) => rs.some((b) => b.d === 1 && b.p === a.p));
    if (m) compare = { diff: m.beta[1], se: m.se[1], lo: m.lo[1], hi: m.hi[1], t: m.t[1], p: m.p[1], df: m.df, G: m.G, paired };
    const wordDiffs = range(WORDS.length).filter((i) => designs[0].counts[i] + designs[1].counts[i] > 0)
      .map((i) => ({ i, word: WORDS[i], valence: VALENCE[i], a: designs[0].counts[i] / designs[0].n, b: designs[1].counts[i] / designs[1].n }))
      .map((x) => ({ ...x, diff: x.b - x.a })).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff) || x.word.localeCompare(y.word));
    if (compare) compare.words = wordDiffs;
  }
  return { designs, people, responses: rs.length, compare, conf, K: study.d.length };
}

// ── Reading the results ──
// Confidence rule (shown in confidenceNote):
//   high   — at least 20 participants per design and the main test has p < 0.01 (two designs: the difference in
//            positive share; one design: the positive share against the 62% base rate);
//   medium — the main test has p < 0.05, or at least 20 participants per design;
//   low    — anything else.
export function confidenceLevel(an) {
  const minN = Math.min(...an.designs.map((d) => d.n));
  const p = an.K === 2 ? an.compare?.p : an.designs[0].vsBase?.p;
  if (minN >= 20 && p < 0.01) return 'high';
  if (p < 0.05 || minN >= 20) return 'medium';
  return 'low';
}
const topWords = (d, k = 5) => d.words.slice(0, k).map((w) => `${w.word} (${pc(w.share)})`);
const posText = (d) => `${pc(d.pos.share)} positive (95% CI ${pc(d.pos.lo)}–${pc(d.pos.hi)})`;
export function summary(an) {
  if (!an || !an.designs.some((d) => d.n)) return null;
  const confidence = confidenceLevel(an);
  const meaning = [], caveats = [], next = [];
  let headline, report;
  const base = pc(BASE_RATE);
  if (an.K === 2 && an.compare) {
    const [A, B] = an.designs, c = an.compare, better = c.diff > 0 ? B : A, worse = c.diff > 0 ? A : B, sig = c.p < 0.05;
    headline = sig
      ? `${better.label} drew more positive words than ${worse.label}: ${pc(better.pos.share)} vs ${pc(worse.pos.share)} of picks, a difference of ${f2(Math.abs(c.diff) * 100, 0)} points.`
      : `${A.label} (${pc(A.pos.share)} positive) and ${B.label} (${pc(B.pos.share)} positive) drew a similar mix of words; the difference could be chance.`;
    meaning.push(`Difference in positive share (${B.label} − ${A.label}): ${f2(c.diff * 100, 1)} points, 95% CI ${f2(c.lo * 100, 1)} to ${f2(c.hi * 100, 1)} (${pText(c.p)}). Standard errors are clustered by participant${c.paired ? ', which also accounts for people who saw both designs' : ''}.`);
    meaning.push(`${A.label}: ${posText(A)}; most chosen ${list(topWords(A, 4))}.`);
    meaning.push(`${B.label}: ${posText(B)}; most chosen ${list(topWords(B, 4))}.`);
    const moved = (c.words || []).slice(0, 3).map((w) => `${w.word} (${w.diff > 0 ? '+' : '−'}${f2(Math.abs(w.diff) * 100, 0)} points for ${B.label})`);
    if (moved.length) meaning.push(`Biggest shifts in word choice: ${list(moved)}. Treat single-word differences as leads to explore, not findings.`);
    report = `In a product reaction card study (Benedek and Miner 2002), ${A.n} participants described ${A.label} and ${B.n} described ${B.label}. ${A.label}: ${posText(A)}; ${B.label}: ${posText(B)}; difference ${f2(c.diff * 100, 1)} points (95% CI ${f2(c.lo * 100, 1)} to ${f2(c.hi * 100, 1)}, ${pText(c.p)}).`;
    if (sig) next.push(`Read the words behind the shift (${list((c.words || []).slice(0, 2).map((w) => w.word))}) and ask participants what made them choose them.`);
    else next.push('If the change matters, plan a larger round: differences of 10 points in positive share need several dozen participants per design.');
  } else {
    const d = an.designs.find((x) => x.n) || an.designs[0], t = d.vsBase;
    const above = t && t.p < 0.05 && d.pos.share > BASE_RATE, below = t && t.p < 0.05 && d.pos.share < BASE_RATE;
    headline = above
      ? `People mostly chose positive words for ${d.label}: ${pc(d.pos.share)} of ${d.picks} picks, above the ${base} expected from the list itself.`
      : below
        ? `${d.label} drew more negative words than the list would give by chance: only ${pc(d.pos.share)} of picks were positive (the list is ${base} positive).`
        : `${d.label} drew a mix of words close to the list's own balance (${pc(d.pos.share)} positive vs ${base} in the list).`;
    meaning.push(`Positive share: ${posText(d)} from ${plural(d.n, 'participant')} picking ${f2(d.meanPicks, 1)} words each on average${t ? `; against the ${base} base rate, t(${t.df}) = ${f2(t.t)}, ${pText(t.p)}` : ''}.`);
    meaning.push(`Most chosen: ${list(topWords(d, 5))}.`);
    const negs = d.words.filter((w) => w.valence === 'n').slice(0, 3);
    if (negs.length) meaning.push(`Most chosen negative words: ${list(negs.map((w) => `${w.word} (${w.count})`))}. These point to the problems worth following up.`);
    report = `In a product reaction card study (Benedek and Miner 2002), ${d.n} participants described ${d.label}: ${posText(d)} of ${d.picks} words chosen (the list is ${base} positive); the most chosen were ${list(topWords(d, 3))}.`;
    next.push('Ask each participant why they chose their top words: the explanations, not the counts, are the main output of this method.');
  }
  if (an.designs.some((d) => d.topN)) {
    const d = an.designs.filter((x) => x.topPos);
    meaning.push(`In the top-5 choices: ${d.map((x) => `${x.label} ${pc(x.topPos.share)} positive`).join('; ')}.`);
  }
  caveats.push('People choose friendlier words in a lab or with the designer watching; the Microsoft authors used the cards to start a conversation, not as a score.');
  caveats.push(`The ${base} base rate assumes every word is equally likely to be picked at random; real people favour common words, so read it as a rough anchor, not a target.`);
  next.push('Compare the most chosen words with the words you want the product to evoke (brand attributes) and look for gaps.');
  const confidenceNote = `Rule: strong with at least 20 participants per design and p < 0.01 for the main test (the difference between designs, or one design against the ${base} base rate); some with p < 0.05 or at least 20 participants per design; weak otherwise. Here: ${an.designs.map((d) => `${d.label} n = ${d.n}`).join(', ')}, ${pText(an.K === 2 ? an.compare?.p : an.designs[0].vsBase?.p)}.`;
  return { headline, meaning: meaning.slice(0, 6), confidence, confidenceNote, caveats, next: next.slice(0, 3), report };
}

// ── Word cloud layout ──
// Sizes ∝ √count; words placed largest first along an Archimedean spiral from the centre, skipping positions where
// the estimated text box overlaps a placed word (a word that does not fit is tried smaller, down to 60%). Widths are
// estimated (0.6 em per character), so it needs no canvas.
export function cloudLayout(words, { W = 640, H = 340, maxWords = 45, minF = 12, maxF = 40 } = {}) {
  const ws = words.slice(0, maxWords); if (!ws.length) return [];
  const cmax = ws[0].count, cmin = ws[ws.length - 1].count;
  const placed = [];
  ws.forEach((w, n) => {
    const f0 = cmax === cmin ? (minF + maxF) / 2 : minF + (maxF - minF) * Math.sqrt((w.count - cmin) / (cmax - cmin));
    // If a word does not fit at its size, try it a little smaller (down to 60%) before leaving it out.
    for (const scale of [1, 0.85, 0.7, 0.6]) {
      const f = f0 * scale, bw = 0.6 * f * w.word.length + 6, bh = f * 1.15;
      let done = false;
      for (let s = 0; s < 6000; s++) {
        const a = 0.25 * s, r = 1.6 * a;
        const x = W / 2 + r * Math.cos(a) * 1.6 - bw / 2, y = H / 2 + r * Math.sin(a) - bh / 2;
        if (x < 2 || y < 2 || x + bw > W - 2 || y + bh > H - 2) { if (r > W) break; continue; }
        if (placed.some((p) => x < p.x + p.w && x + bw > p.x && y < p.y + p.h && y + bh > p.y)) continue;
        placed.push({ ...w, x, y, w: bw, h: bh, f, n }); done = true;
        break;
      }
      if (done) break;
    }
  });
  return placed;
}

// ── Exports ──
export function wordsCsv(an) {
  const rows = [['design', 'word', 'valence', 'participants', 'share', 'ci_low', 'ci_high', 'top5']];
  an.designs.forEach((d) => d.words.forEach((w) => rows.push([d.label, w.word, VALENCE_NAMES[w.valence], w.count, w.share.toFixed(4), w.ci.lo.toFixed(4), w.ci.hi.toFixed(4), w.top])));
  return toCsv(rows);
}
export function answersCsv(study, results) {
  const rows = [['participant', 'design', 'words', 'top5']];
  responsesOf(study, results).forEach((r) => rows.push([r.p, study.d[r.d].l, r.w.map((i) => WORDS[i]).join('; '), r.t.map((i) => WORDS[i]).join('; ')]));
  return toCsv(rows);
}
export function markdown(study, an, sm) {
  const out = [`# ${study.n}: product reaction cards`, ''];
  an.designs.forEach((d) => {
    out.push(`## ${mdCell(d.label)}`, '', `${d.n} participants, ${d.picks} words; ${posText(d)}.`, '', '| Word | Valence | Participants | Share (95% CI) | Top 5 |', '|---|---|---|---|---|');
    d.words.slice(0, 20).forEach((w) => out.push(`| ${w.word} | ${VALENCE_NAMES[w.valence]} | ${w.count} | ${pc(w.share)} (${pc(w.ci.lo)}–${pc(w.ci.hi)}) | ${w.top} |`));
    out.push('');
  });
  if (sm) out.push(`**${sm.headline}**`, '', ...sm.meaning.map((m) => `- ${m}`), '', `Confidence: ${sm.confidence}. ${sm.confidenceNote}`, '', 'Word list: Benedek and Miner (2002), Microsoft Product Reaction Cards.');
  return out.join('\n');
}

// ── Built-in example: two dashboard designs, between participants ──
function dash(kind) {
  const W = 640, H = 400, ink = '#1d2329', soft = '#e9edf0', mid = '#9aa5ad', acc = '#2a78d6';
  const t = (x, y, s, w, c, txt, a = 'start') => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${s}" font-weight="${w}" fill="${c}" text-anchor="${a}">${txt}</text>`;
  let b = `<rect width="${W}" height="${H}" fill="#fff"/>`;
  if (kind === 'A') {
    b += `<rect width="${W}" height="36" fill="#3b4650"/>${t(14, 24, 14, 700, '#fff', 'OpsCentre')}`;
    b += `<rect x="0" y="36" width="120" height="${H - 36}" fill="${soft}"/>`;
    for (let i = 0; i < 12; i++) b += `<rect x="12" y="${50 + i * 28}" width="${70 + (i % 3) * 12}" height="9" rx="2" fill="${mid}"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = 130 + c * 126, y = 46 + r * 118;
      b += `<rect x="${x}" y="${y}" width="118" height="110" fill="#fff" stroke="${mid}"/><rect x="${x}" y="${y}" width="118" height="16" fill="${soft}"/>`;
      if ((r + c) % 3 === 0) for (let k = 0; k < 8; k++) b += `<rect x="${x + 8 + k * 13}" y="${y + 100 - ((k * 37 + r * 11) % 60) - 10}" width="9" height="${((k * 37 + r * 11) % 60) + 10}" fill="${['#c0392b', '#2a78d6', '#e67e22', '#27ae60'][k % 4]}"/>`;
      else for (let k = 0; k < 6; k++) b += `<rect x="${x + 8}" y="${y + 26 + k * 13}" width="${60 + ((k * 23) % 40)}" height="6" fill="${mid}"/>`;
    }
  } else {
    b += `<rect width="${W}" height="52" fill="#fff"/><line x1="0" y1="52" x2="${W}" y2="52" stroke="${soft}"/>${t(24, 33, 17, 700, ink, 'OpsCentre')}${t(W - 24, 33, 13, 400, mid, 'Today ▾', 'end')}`;
    b += `${t(24, 92, 22, 700, ink, 'Good morning, Sam')}${t(24, 116, 13, 400, mid, '3 incidents need attention')}`;
    [['Open incidents', '3'], ['Avg. response', '4m'], ['Uptime', '99.9%']].forEach(([l, v], i) => { const x = 24 + i * 200; b += `<rect x="${x}" y="138" width="184" height="86" rx="10" fill="${soft}"/>${t(x + 16, 166, 12, 400, mid, l)}${t(x + 16, 204, 28, 700, ink, v)}`; });
    b += `<rect x="24" y="242" width="592" height="134" rx="10" fill="#fff" stroke="${soft}"/>`;
    b += `<polyline fill="none" stroke="${acc}" stroke-width="3" points="44,350 120,330 200,338 280,300 360,312 440,282 520,290 596,266"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${b}</svg>`;
}
export const exampleSrc = (name) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(dash(name))}`;
export const imageSrc = (u) => (String(u || '').startsWith('ex:') ? exampleSrc(u.slice(3)) : u);
export function exampleStudy() {
  return makeStudy({ id: 'prcex1', name: 'Operations dashboard: current vs redesign', mode: 'b', max: 8, min: 3, top5: true,
    designs: [{ l: 'Current dashboard', u: 'ex:A', x: 'This is the dashboard you would use to keep an eye on your services.' }, { l: 'Redesigned dashboard', u: 'ex:B', x: 'This is the dashboard you would use to keep an eye on your services.' }] });
}
const LEAN = {
  0: { Busy: 9, Complex: 8, Overwhelming: 7, Comprehensive: 7, Powerful: 6, Dated: 6, Familiar: 5, 'Business-like': 5, Professional: 4, 'Too technical': 4, Confusing: 4, Distracting: 3, Useful: 4, Reliable: 3, Slow: 2, Stressful: 2, Advanced: 3, Organized: 2 },
  1: { Clean: 9, Clear: 8, 'Easy to use': 8, Calm: 6, Fresh: 6, Attractive: 6, Organized: 5, Intuitive: 5, Professional: 4, Simplistic: 4, Useful: 4, 'Straight forward': 4, Fast: 3, Friendly: 3, Appealing: 3, Comprehensive: 2, Reliable: 3, Predictable: 2, Boring: 2 },
};
export function exampleResults(study = exampleStudy()) {
  const rnd = seeded(118);
  const out = [];
  for (let p = 0; p < 44; p++) {
    const d = p % 2;
    const weights = WORDS.map((w) => (LEAN[d][w] || 0) + 0.12);
    const k = 3 + Math.floor(rnd() * 6);
    const chosen = [];
    for (let j = 0; j < k; j++) {
      const tot = sum(weights.map((w, i) => (chosen.includes(i) ? 0 : w)));
      let u = rnd() * tot, i = 0;
      for (; i < WORDS.length; i++) { if (chosen.includes(i)) continue; u -= weights[i]; if (u <= 0) break; }
      chosen.push(Math.min(i, WORDS.length - 1));
    }
    const top = chosen.slice(0, 5);
    out.push({ v: 1, t: 'prcr', s: study.id, p: `P-${String(p + 1).padStart(2, '0')}`, d: 1793318400000 + p * 700000, r: [{ d, w: shuffle(chosen, rnd), t: top }], ms: Math.round(60000 + rnd() * 90000) });
  }
  return out;
}
export const exampleCodes = () => exampleResults().map(encodeResult).join('\n');
