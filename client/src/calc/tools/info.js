// Shannon information for research data: entropy, evenness, Hill numbers, Simpson diversity, mutual information,
// the G-test and information gain. Pure functions with no React, checked by `npm run check:tools` against
// scipy.stats.entropy and sklearn's mutual_info_score and normalized_mutual_info_score.
import { lgamma } from '../stats.js';
import { parseTable, isMissing } from '../cluster.js';

const LN2 = Math.LN2;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Entropy of a list of counts in bits (base 2), or in nats with base = Math.E.
export function entropy(counts, base = 2) {
  const n = sum(counts); if (!(n > 0)) return 0;
  let h = 0; for (const c of counts) if (c > 0) { const p = c / n; h -= p * Math.log(p); }
  return h / Math.log(base);
}

// Diversity statistics for one set of category counts (codes, themes, answers).
// H: Shannon entropy in bits. J: Pielou evenness H / log2 S. N1 = 2^H: effective number of categories (Hill number
// of order 1). N2 = 1 / Σp²: inverse Simpson (Hill order 2). Simpson = 1 − Σp² (Gini-Simpson), and the unbiased
// Simpson 1 − Σ n(n−1) / (N(N−1)). Miller-Madow corrects H's small-sample bias: H + (S − 1) / (2N) nats.
export function diversity(counts, labels = counts.map((_, i) => String(i + 1))) {
  const items = counts.map((c, i) => ({ label: labels[i], n: c })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const N = sum(items.map((x) => x.n)), S = items.length;
  if (!N) return { N: 0, S: 0, H: 0, J: NaN, N1: 0, N2: 0, simpson: NaN, simpsonUnbiased: NaN, items: [], top: [] };
  const p = items.map((x) => x.n / N);
  const H = entropy(items.map((x) => x.n));
  const sp = sum(p.map((x) => x * x));
  const top3 = sum(p.slice(0, 3));
  items.forEach((x, i) => { x.p = p[i]; });
  return {
    N, S, H, Hmax: S > 1 ? Math.log2(S) : 0, J: S > 1 ? H / Math.log2(S) : NaN, N1: 2 ** H, N2: 1 / sp,
    simpson: 1 - sp, simpsonUnbiased: N > 1 ? 1 - sum(items.map((x) => x.n * (x.n - 1))) / (N * (N - 1)) : NaN,
    millerMadow: H + (S - 1) / (2 * N) / LN2, bergerParker: p[0], top3, items,
  };
}

// ── Parsing coded interview data ──
// Coded segments: one segment per line, "P1: code A, code B" (participant before a colon or tab, then codes).
// A table: header row "Code, P1, P2, …", then one row per code with counts per participant.
export function parseCoded(text, format = 'segments') {
  const by = new Map(), codes = new Set(), bad = [];
  const add = (p, c, k = 1) => { if (!by.has(p)) by.set(p, new Map()); const m = by.get(p); m.set(c, (m.get(c) || 0) + k); codes.add(c); };
  if (format === 'table') {
    const t = parseTable(text);
    const parts = t.headers.slice(1);
    t.rows.forEach((r, i) => {
      const code = r[0]; if (!code) return;
      parts.forEach((p, j) => { const v = Number(r[j + 1]); if (isMissing(r[j + 1])) return; if (Number.isFinite(v) && v >= 0) { if (v > 0) add(p, code, v); else codes.add(code); } else bad.push(i + 2); });
    });
    parts.forEach((p) => { if (!by.has(p)) by.set(p, new Map()); });
  } else {
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      const s = line.trim(); if (!s || s.startsWith('#')) return;
      const m = s.match(/^([^:\t]+?)\s*[:\t]\s*(.*)$/);
      if (!m) { bad.push(i + 1); return; }
      const cs = m[2].split(/[,;|]/).map((c) => c.trim()).filter(Boolean);
      if (!cs.length) { bad.push(i + 1); return; }
      cs.forEach((c) => add(m[1].trim(), c));
    });
  }
  const codeList = [...codes];
  const participants = [...by.keys()].map((p) => ({ id: p, counts: codeList.map((c) => by.get(p).get(c) || 0) }));
  return { codes: codeList, participants, bad };
}

// Whole-study and per-participant diversity of codes.
export function codeInformation(parsed) {
  const { codes, participants } = parsed;
  const totals = codes.map((_, j) => sum(participants.map((p) => p.counts[j])));
  const all = diversity(totals, codes);
  const people = participants.map((p) => {
    const d = diversity(p.counts, codes);
    return { id: p.id, segments: d.N, codes: d.S, H: d.H, N1: d.N1, J: d.J, share: all.S ? d.S / all.S : 0 };
  });
  // How many participants mention each code: a theme mentioned a lot by one person is different from one mentioned by many.
  const reach = codes.map((c, j) => ({ code: c, n: totals[j], people: participants.filter((p) => p.counts[j] > 0).length }));
  return { all, people, reach, nCodes: codes.length, nPeople: participants.length };
}

// ── Survey answers ──
// Every column of a pasted table is an item; blanks are skipped. The number of options k is the number of different
// answers seen, or the whole numeric range when the answers are whole numbers on a short scale (1–5, 0–10).
export function itemEntropy(values) {
  const v = values.filter((x) => !isMissing(x)).map((x) => String(x).trim());
  const counts = new Map(); v.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
  const levels = [...counts.keys()];
  let k = levels.length;
  const nums = levels.map(Number);
  if (levels.length && nums.every((x) => Number.isInteger(x))) { const span = Math.max(...nums) - Math.min(...nums) + 1; if (span <= 11) k = Math.max(k, span); }
  const H = entropy([...counts.values()]);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { n: v.length, k, observed: levels.length, H, Hnorm: k > 1 ? H / Math.log2(k) : 0, N1: 2 ** H, mode: top ? top[0] : '', modeShare: top ? top[1] / v.length : NaN, counts };
}
export function surveyInformation(table) {
  return table.headers.map((h, j) => {
    const e = itemEntropy(table.rows.map((r) => r[j]));
    const flag = e.observed <= 1 || e.H < 0.3 ? 'none' : e.Hnorm < 0.35 ? 'low' : e.Hnorm > 0.85 ? 'spread' : 'mixed';
    return { name: h, index: j, ...e, flag };
  });
}

// ── Mutual information between two categorical variables ──
// I(X;Y) = Σ p(x,y) log2 p(x,y)/(p(x)p(y)) bits. NMI = I / mean(H(X), H(Y)) (sklearn's default, arithmetic mean).
// G = 2 Σ O ln(O/E) = 2N · I in nats = 2N · I(bits) · ln 2, compared with chi-square on (r−1)(c−1) df.
export function contingency(xs, ys) {
  const keep = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => !isMissing(x) && !isMissing(y)).map(([x, y]) => [String(x).trim(), String(y).trim()]);
  const rl = [...new Set(keep.map((p) => p[0]))], cl = [...new Set(keep.map((p) => p[1]))];
  const sortL = (L) => (L.every((v) => Number.isFinite(Number(v))) ? L.sort((a, b) => a - b) : L.sort());
  sortL(rl); sortL(cl);
  const t = rl.map(() => cl.map(() => 0));
  keep.forEach(([x, y]) => { t[rl.indexOf(x)][cl.indexOf(y)]++; });
  return { rows: rl, cols: cl, table: t, n: keep.length };
}
export function mutualInformation(table) {
  const N = sum(table.map(sum)); if (!N) return { mi: 0, nmi: NaN, hx: 0, hy: 0, G: 0, df: 0, p: 1, n: 0, cramerV: NaN };
  const rs = table.map(sum), cs = table[0].map((_, j) => sum(table.map((r) => r[j])));
  let mi = 0;
  table.forEach((r, i) => r.forEach((o, j) => { if (o > 0) mi += (o / N) * Math.log((o * N) / (rs[i] * cs[j])); }));
  mi = Math.max(0, mi);
  const hx = entropy(rs, Math.E), hy = entropy(cs, Math.E);
  const rr = rs.filter((x) => x > 0).length, cc = cs.filter((x) => x > 0).length;
  const df = (rr - 1) * (cc - 1), G = 2 * N * mi;
  const den = (hx + hy) / 2;
  return {
    mi: mi / LN2, miNats: mi, hx: hx / LN2, hy: hy / LN2, hxy: (hx + hy - mi) / LN2,
    nmi: hx === 0 && hy === 0 ? 1 : den > 0 ? mi / den : 0, uxy: hy > 0 ? mi / hy : 0, uyx: hx > 0 ? mi / hx : 0,
    G, df, p: df > 0 ? chiSqSf(G, df) : 1, n: N, cramerV: df > 0 ? Math.sqrt(G / N / Math.min(rr - 1, cc - 1)) : NaN,
    sparse: table.flat().length > 0 && rs.some((r, i) => cs.some((c, j) => (r * c) / N < 5 && table[i][j] >= 0)),
  };
}

// Regularised lower incomplete gamma P(a, x) (Numerical Recipes series and continued fraction); chi-square survival.
export function gammaP(a, x) {
  if (x <= 0) return 0;
  const gln = lgamma(a);
  if (x < a + 1) {
    let ap = a, s = 1 / a, d = s;
    for (let n = 0; n < 1000; n++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-15) break; }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a); b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}
export const chiSqSf = (x, df) => Math.max(0, 1 - gammaP(df / 2, x / 2));

// Information gain: how much knowing each question's answer reduces uncertainty about the target. IG = I(X;Y) bits;
// gain ratio = IG / H(X) penalises questions with many answer options (Quinlan 1986).
export function informationGain(table, target) {
  const y = table.rows.map((r) => r[target]);
  return table.headers.map((h, j) => {
    if (j === target) return null;
    const ct = contingency(table.rows.map((r) => r[j]), y);
    if (ct.rows.length < 1 || ct.cols.length < 1) return null;
    const m = mutualInformation(ct.table);
    return { name: h, index: j, ig: m.mi, hy: m.hy, hx: m.hx, ratio: m.hx > 0 ? m.mi / m.hx : 0, share: m.hy > 0 ? m.mi / m.hy : 0, p: m.p, df: m.df, n: m.n, levels: ct.rows.length };
  }).filter(Boolean).sort((a, b) => b.ig - a.ig);
}

// ── Plain-language summaries ──
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '—');

export function codeSummary(r) {
  const a = r.all;
  if (!a.N) return null;
  const even = a.J >= 0.85 ? 'spread fairly evenly' : a.J >= 0.6 ? 'moderately concentrated' : 'concentrated on a few themes';
  const ppl = [...r.people].sort((x, y) => y.H - x.H);
  const most = ppl[0], least = ppl[ppl.length - 1];
  const single = r.reach.filter((c) => c.people === 1).length;
  const top = a.items.slice(0, 3).map((x) => `${x.label} (${pc(x.p)})`).join(', ');
  const meaning = [
    `${a.N} coded segments use ${a.S} different codes. Talk is ${even}: it is as varied as if participants had spread their talk evenly over ${f1(a.N1)} themes (the effective number of themes, 2^H).`,
    `The top three codes take ${pc(a.top3)} of all coded talk: ${top}.`,
    `Evenness is ${f2(a.J)} on a 0 to 1 scale, where 1 means every code was used equally often.`,
  ];
  if (r.people.length > 1) meaning.push(`${most.id} covered the most ground (${most.codes} codes, about ${f1(most.N1)} effective themes); ${least.id} the least (${least.codes} codes, about ${f1(least.N1)}).`);
  if (single) meaning.push(`${single} of ${a.S} codes come from a single participant, so they may be individual rather than shared themes.`);
  const conf = a.N >= 100 && r.nPeople >= 8 ? 'high' : a.N >= 30 && r.nPeople >= 4 ? 'medium' : 'low';
  return {
    headline: `Your interviews cover the equivalent of ${f1(a.N1)} equally used themes out of ${a.S} codes, ${a.J >= 0.6 ? 'with a broad spread' : 'with a few themes dominating'}.`,
    meaning,
    confidence: conf,
    confidenceNote: conf === 'high' ? `${a.N} segments from ${r.nPeople} participants is enough for stable entropy figures.` : `With ${a.N} segments from ${r.nPeople} participants, entropy is biased low and the effective number of themes is likely to grow with more data (Miller-Madow corrected: ${f2(a.millerMadow)} bits instead of ${f2(a.H)}).`,
    caveats: [
      'Counts reflect how often a theme was coded, not how important it is. A theme mentioned once can still be critical.',
      'Entropy depends on your coding granularity: splitting one code into three raises it. Compare studies only with the same codebook.',
      'Long interviews contribute more segments; check that one talkative participant is not driving the totals.',
    ],
    next: [
      a.J < 0.6 ? `Check whether the dominant themes (${a.items.slice(0, 2).map((x) => x.label).join(', ')}) were led by your discussion guide before treating them as the main finding.` : 'Look for structure within the spread: cluster or group codes into higher-level themes.',
      single ? 'Probe single-participant codes in later interviews, or mark them as individual.' : 'Use the saturation calculator to check whether new interviews still add codes.',
      'Read the low-coverage participants\' transcripts: short coverage can mean a narrow role, a short session or under-coding.',
    ],
    report: `Across ${r.nPeople} participants, ${a.N} coded segments used ${a.S} codes (Shannon entropy H = ${f2(a.H)} bits, evenness J = ${f2(a.J)}, effective number of themes 2^H = ${f1(a.N1)}); the three most frequent codes accounted for ${pc(a.top3)} of coded talk.`,
  };
}

export function surveySummary(items) {
  if (!items.length) return null;
  const none = items.filter((i) => i.flag === 'none' || i.flag === 'low');
  const spread = items.filter((i) => i.flag === 'spread');
  const byH = [...items].sort((a, b) => b.Hnorm - a.Hnorm);
  const n = Math.max(...items.map((i) => i.n));
  const conf = n >= 100 ? 'high' : n >= 30 ? 'medium' : 'low';
  return {
    headline: none.length ? `${none.length} of ${items.length} questions carry little information: nearly everyone gave the same answer.` : `All ${items.length} questions separate respondents to some degree.`,
    meaning: [
      `The most spread-out question is "${byH[0].name}": answers are spread as if people chose evenly among ${f1(byH[0].N1)} options (normalised entropy ${f2(byH[0].Hnorm)}).`,
      byH.length > 1 && `The most agreed-on question is "${byH[byH.length - 1].name}": ${pc(byH[byH.length - 1].modeShare)} chose "${byH[byH.length - 1].mode}" (normalised entropy ${f2(byH[byH.length - 1].Hnorm)}).`,
      spread.length ? `${spread.length} question${spread.length > 1 ? 's are' : ' is'} close to maximally spread (above 0.85): ${spread.map((i) => `"${i.name}"`).slice(0, 4).join(', ')}. Either opinion is genuinely divided or the question was hard to answer consistently.` : null,
      none.length ? `Low-information questions: ${none.map((i) => `"${i.name}"`).slice(0, 5).join(', ')}.` : null,
    ].filter(Boolean),
    confidence: conf,
    confidenceNote: `Based on up to ${n} answers per question. ${conf === 'low' ? 'With fewer than 30 answers, entropy is noisy and biased low.' : ''}`,
    caveats: ['High entropy is not good or bad on its own: consensus on a satisfaction item may be the finding.', 'Normalised entropy ignores order, so a 1–5 item split between 1 and 5 scores the same as one split between 2 and 3. Look at the distribution too.'],
    next: [none.length ? 'Consider dropping or rewording the low-information questions; they cost respondents time without telling you who differs from whom.' : 'Keep the questions; each one separates respondents.', 'Use the mutual information mode to see which questions go together, or information gain to see which best predict an outcome.'],
    report: `Normalised Shannon entropy ranged from ${f2(byH[byH.length - 1].Hnorm)} ("${byH[byH.length - 1].name}") to ${f2(byH[0].Hnorm)} ("${byH[0].name}") across ${items.length} items; ${none.length} item${none.length === 1 ? '' : 's'} carried almost no information.`,
  };
}

export function miSummary(m, xName, yName) {
  if (!m.n) return null;
  const sig = m.p < 0.05;
  const strength = m.nmi >= 0.3 ? 'strong' : m.nmi >= 0.1 ? 'moderate' : m.nmi >= 0.03 ? 'weak' : 'negligible';
  const conf = sig && m.n >= 100 && !m.sparse ? 'high' : sig ? 'medium' : 'low';
  return {
    headline: `"${xName}" and "${yName}" share ${f2(m.mi)} bits of information: a ${strength} association${sig ? '' : ' that could be chance'}.`,
    meaning: [
      `Knowing someone's answer to "${xName}" removes ${pc(m.uxy)} of the uncertainty about their answer to "${yName}" (${f2(m.mi)} of ${f2(m.hy)} bits).`,
      `Normalised mutual information is ${f2(m.nmi)} on a 0 to 1 scale, where 0 means the answers are unrelated and 1 means one predicts the other exactly.`,
      `G-test: G = ${f2(m.G)} on ${m.df} degrees of freedom, p ${m.p < 0.001 ? '< 0.001' : `= ${m.p.toFixed(3)}`}.`,
    ],
    confidence: conf,
    confidenceNote: `${m.n} paired answers.${m.sparse ? ' Some cells expect fewer than 5 people, so the p-value is approximate; merge rare answers if you can.' : ''}`,
    caveats: ['Mutual information shows that answers go together, not why or in which direction.', 'With many answer options and few people, mutual information is biased upwards; the G-test p-value accounts for that, the bits do not.'],
    next: [sig ? 'Look at the table to see which answer combinations drive the association, and check it in follow-up interviews.' : 'Treat the two questions as unrelated for now, or collect more answers.'],
    report: `Answers to "${xName}" and "${yName}" were ${sig ? '' : 'not significantly '}associated (mutual information ${f2(m.mi)} bits, NMI = ${f2(m.nmi)}, G(${m.df}) = ${f2(m.G)}, p ${m.p < 0.001 ? '< 0.001' : `= ${m.p.toFixed(3)}`}, n = ${m.n}).`,
  };
}

export function igSummary(rows, targetName) {
  if (!rows.length) return null;
  const best = rows[0];
  const sig = rows.filter((r) => r.p < 0.05);
  const n = best.n;
  return {
    headline: `"${best.name}" best splits "${targetName}": it removes ${pc(best.share)} of the uncertainty about it.`,
    meaning: [
      `Information gain for "${best.name}" is ${f2(best.ig)} bits out of ${f2(best.hy)} bits of uncertainty in "${targetName}".`,
      rows[1] && `Next best: "${rows[1].name}" (${f2(rows[1].ig)} bits, ${pc(rows[1].share)}).`,
      `${sig.length} of ${rows.length} questions are significantly associated with "${targetName}" (G-test, p < 0.05).`,
      best.levels > 5 && `"${best.name}" has ${best.levels} different answers; its gain ratio (${f2(best.ratio)}) adjusts for that.`,
    ].filter(Boolean),
    confidence: n >= 100 && best.p < 0.01 ? 'high' : best.p < 0.05 ? 'medium' : 'low',
    confidenceNote: `${n} respondents. ${best.p < 0.05 ? '' : 'The best split is not significant, so the ranking could be chance.'}`,
    caveats: ['Questions with many options gain information by chance; prefer the gain ratio when they differ in number of options.', 'Gains are not additive: two questions can carry the same information.'],
    next: [`Use "${best.name}" as the first branch when segmenting by "${targetName}", and check the split in interviews.`],
    report: `Of ${rows.length} questions, "${best.name}" carried the most information about "${targetName}" (information gain ${f2(best.ig)} bits, ${pc(best.share)} of its entropy; G-test p ${best.p < 0.001 ? '< 0.001' : `= ${best.p.toFixed(3)}`}).`,
  };
}
