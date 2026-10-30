// Questionnaire scorer pack: scoring keys, benchmarks and plain-language summaries for published UX, engagement,
// game and well-being questionnaires. Pure functions; checked in server/scripts/check-scorers.js against an
// independent Python scoring of the same answers (scorers-reference.py) and against scipy and pingouin.
import { cronbach } from '../stats.js';
import { mean, meanCI, oneSampleT, wilson, binomTest, parseMatrix, sd } from './scorers-math.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

// Instruments. items: number of columns expected; min/max: answer range; better: which end is good;
// subscales: item numbers (1-based) and reversed items; bench: published means with their source.
export const INSTRUMENTS = {
  pssuq: {
    name: 'PSSUQ (version 3)', short: 'PSSUQ', method: 'pssuq-csuq-post-study-and-computer-system-usability-questionnaires', items: 16, min: 1, max: 7, better: 'low', polarity: true,
    anchors: '1 = strongly agree … 7 = strongly disagree (N/A allowed)',
    subscales: [
      { key: 'Overall', items: range(1, 16) }, { key: 'SysUse', name: 'System usefulness', items: range(1, 6) },
      { key: 'InfoQual', name: 'Information quality', items: range(7, 12) }, { key: 'IntQual', name: 'Interface quality', items: range(13, 15) },
    ],
    bench: { Overall: 2.82, SysUse: 2.80, InfoQual: 3.02, IntQual: 2.49 },
    benchSource: 'Lewis (2002) PSSUQ version 3 norms, 21 studies, as tabulated in Sauro and Lewis (2016), Quantifying the User Experience, 2nd ed., ch. 8',
    rescale: true,
    cite: 'Lewis, J. R. (2002). Psychometric evaluation of the PSSUQ using data from five years of usability studies. IJHCI 14(3–4), 463–488.',
    license: 'Free to use; the items and scoring are published in Lewis (1995, 2002).',
    scoring: 'Scale scores are the mean of the answered items (N/A left out). Item 16 counts only in Overall.',
  },
  csuq: {
    name: 'CSUQ (version 3)', short: 'CSUQ', method: 'pssuq-csuq-post-study-and-computer-system-usability-questionnaires', items: 16, min: 1, max: 7, better: 'low', polarity: true,
    anchors: '1 = strongly agree … 7 = strongly disagree (choose the reversed form if 7 = agree)',
    subscales: [
      { key: 'Overall', items: range(1, 16) }, { key: 'SysUse', name: 'System usefulness', items: range(1, 6) },
      { key: 'InfoQual', name: 'Information quality', items: range(7, 12) }, { key: 'IntQual', name: 'Interface quality', items: range(13, 15) },
    ],
    bench: {},
    benchSource: 'No CSUQ norms are published. Lewis (2018) found the 0–100 rescaled CSUQ close to SUS for the same people, so SUS norms (average 68) are a rough guide only',
    rescale: true,
    cite: 'Lewis, J. R. (1995). IBM computer usability satisfaction questionnaires. IJHCI 7(1), 57–78; Lewis, J. R. (2018). Measuring perceived usability: The CSUQ, SUS, and UMUX. IJHCI 34(12), 1148–1156.',
    license: 'Free to use; the items are published in Lewis (1995, 2018).',
    scoring: 'Same structure as the PSSUQ: mean of answered items; SysUse 1–6, InfoQual 7–12, IntQual 13–15.',
  },
  asq: {
    name: 'After-Scenario Questionnaire (ASQ)', short: 'ASQ', method: 'after-scenario-questionnaire-asq', items: 3, min: 1, max: 7, better: 'low', polarity: true,
    anchors: '1 = strongly agree … 7 = strongly disagree; items: ease, time, support information',
    subscales: [{ key: 'ASQ', name: 'ASQ (mean of 3 items)', items: [1, 2, 3] }],
    bench: {}, benchSource: 'No published norms; compare tasks or designs with each other',
    rescale: true,
    cite: 'Lewis, J. R. (1991). Psychometric evaluation of an after-scenario questionnaire for computer usability studies: The ASQ. SIGCHI Bulletin 23(1), 78–81.',
    license: 'Free to use; items published in Lewis (1991).',
    scoring: 'Mean of the answered items.',
  },
  smeq: {
    name: 'Subjective Mental Effort Question (SMEQ)', short: 'SMEQ', method: 'smeq-subjective-mental-effort-question', items: 1, min: 0, max: 150, better: 'low',
    anchors: '0–150 on the vertical scale; labels at about 2 (not at all hard) … 113 (tremendously hard)',
    subscales: [{ key: 'SMEQ', name: 'Mental effort (0–150)', items: [1] }],
    bench: {}, benchSource: 'No universal norm; the verbal anchors below give the meaning of a score',
    cite: 'Zijlstra, F. R. H. (1993). Efficiency in work behaviour. Doctoral thesis, Delft University; Sauro, J., & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. CHI 2009.',
    license: 'Free to use; the scale and anchors are published.',
    scoring: 'The marked position, 0–150.',
  },
  ues: {
    name: 'User Engagement Scale, short form (UES-SF)', short: 'UES-SF', method: 'user-engagement-scale-ues', items: 12, min: 1, max: 5, better: 'high',
    anchors: '1 = strongly disagree … 5 = strongly agree; items in the order FA-S.1–3, PU-S.1–3, AE-S.1–3, RW-S.1–3',
    subscales: [
      { key: 'Overall', name: 'Engagement (overall)', items: range(1, 12), reverse: [4, 5, 6] },
      { key: 'FA', name: 'Focused attention', items: [1, 2, 3] }, { key: 'PU', name: 'Perceived usability', items: [4, 5, 6], reverse: [4, 5, 6] },
      { key: 'AE', name: 'Aesthetic appeal', items: [7, 8, 9] }, { key: 'RW', name: 'Reward', items: [10, 11, 12] },
    ],
    bench: {}, benchSource: 'No norms are published; compare versions or products',
    cite: 'O\'Brien, H. L., Cairns, P., & Hall, M. (2018). A practical approach to measuring user engagement with the refined UES and its short form. IJHCS 112, 28–39.',
    license: 'Open: the items and scoring are published with the article.',
    scoring: 'PU items are negatively worded and reversed (6 − x). Subscale = mean of its items; overall = mean of all 12 items after reversal.',
  },
  tam: {
    name: 'Technology Acceptance Model (TAM) scales', short: 'TAM', method: 'technology-acceptance-model-tam-questionnaires', items: 12, min: 1, max: 7, better: 'high', polarity: true, polarityDefault: 'high',
    anchors: '7 = extremely likely / strongly agree (choose the reversed form for Davis\'s original 1 = likely layout); PU items 1–6, PEOU items 7–12',
    subscales: [{ key: 'PU', name: 'Perceived usefulness', items: range(1, 6) }, { key: 'PEOU', name: 'Perceived ease of use', items: range(7, 12) }],
    bench: {}, benchSource: 'TAM has no norms; it is used to compare systems or to model intention',
    cite: 'Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly 13(3), 319–340.',
    license: 'Items published in Davis (1989).',
    scoring: 'Mean of the items in each scale.',
  },
  sam: {
    name: 'Self-Assessment Manikin (SAM)', short: 'SAM', method: 'self-assessment-manikin-sam', items: 3, min: 1, max: 9, better: 'none',
    anchors: 'Columns: valence (1 unhappy … 9 happy), arousal (1 calm … 9 excited), dominance (1 controlled … 9 in control)',
    subscales: [{ key: 'Valence', name: 'Valence (pleasure)', items: [1] }, { key: 'Arousal', name: 'Arousal', items: [2] }, { key: 'Dominance', name: 'Dominance', items: [3] }],
    bench: { Valence: 5, Arousal: 5, Dominance: 5 }, benchKind: 'midpoint',
    benchSource: 'The scale midpoint (5) is the neutral point, not a published norm',
    cite: 'Bradley, M. M., & Lang, P. J. (1994). Measuring emotion: The Self-Assessment Manikin and the semantic differential. J Behav Ther & Exp Psychiatry 25(1), 49–59.',
    license: 'The figures are distributed for research by the Center for the Study of Emotion and Attention; scoring is the selected position.',
    scoring: 'Each dimension is scored on its own; there is no total.',
  },
  geq: {
    name: 'Game Experience Questionnaire, core module (GEQ)', short: 'GEQ', method: 'game-experience-questionnaire-geq', items: 33, min: 0, max: 4, better: 'none',
    anchors: '0 = not at all … 4 = extremely; 33 items in the manual\'s order',
    subscales: [
      { key: 'Competence', items: [2, 10, 15, 17, 21] }, { key: 'Immersion', name: 'Sensory and imaginative immersion', items: [3, 12, 18, 19, 27, 30] },
      { key: 'Flow', items: [5, 13, 25, 28, 31] }, { key: 'Tension', name: 'Tension / annoyance', items: [22, 24, 29] },
      { key: 'Challenge', items: [11, 23, 26, 32, 33] }, { key: 'Negative', name: 'Negative affect', items: [7, 8, 9, 16] },
      { key: 'Positive', name: 'Positive affect', items: [1, 4, 6, 14, 20] },
    ],
    bench: {}, benchSource: 'No norms are published; compare conditions',
    cite: 'IJsselsteijn, W. A., de Kort, Y. A. W., & Poels, K. (2013). The Game Experience Questionnaire. Eindhoven: Technische Universiteit Eindhoven.',
    license: 'The manual with items and scoring key is freely available from TU Eindhoven.',
    scoring: 'Component score = mean of its items. Law, Brühlmann and Mekler (2018, CHI PLAY) could not confirm the seven-factor structure: check the reliabilities below.',
  },
  swls: {
    name: 'Satisfaction With Life Scale (SWLS)', short: 'SWLS', method: 'subjective-well-being-questionnaires-swls-shs-ons4', items: 5, min: 1, max: 7, better: 'high',
    anchors: '1 = strongly disagree … 7 = strongly agree', score: 'sum', requireAll: true,
    subscales: [{ key: 'SWLS', name: 'Life satisfaction (sum 5–35)', items: range(1, 5) }],
    bench: { SWLS: 20 }, benchKind: 'midpoint',
    benchSource: 'Pavot and Diener (1993, 2008): 20 is the neutral point; 5–9 extremely dissatisfied, 10–14 dissatisfied, 15–19 slightly dissatisfied, 21–25 slightly satisfied, 26–30 satisfied, 31–35 extremely satisfied',
    cite: 'Diener, E., Emmons, R. A., Larsen, R. J., & Griffin, S. (1985). The Satisfaction With Life Scale. J Personality Assessment 49(1), 71–75.',
    license: 'Copyrighted by Diener, free to use without permission.',
    scoring: 'Sum of the five items; all five are needed.',
  },
  pens: {
    name: 'PENS and other licensed instruments (raw scores only)', short: 'Raw', method: 'player-experience-of-need-satisfaction-pens', items: 0, min: 1, max: 7, better: 'none', raw: true,
    anchors: 'Any rating items; define your own groups of columns below',
    subscales: [], bench: {},
    benchSource: 'None: the PENS key and norms are licensed',
    cite: 'Ryan, R. M., Rigby, C. S., & Przybylski, A. (2006). The motivational pull of video games: A self-determination theory approach. Motivation and Emotion 30, 344–360.',
    license: 'PENS is a commercial instrument of Immersyve Inc.: its full item wording, scoring key and norms are licensed, not freely published, so this tool does not ship them. It gives raw item means and the means of column groups you define from your licensed key.',
    scoring: 'Group score = mean of the columns you list for it.',
  },
};
export const ORDER = ['pssuq', 'csuq', 'asq', 'smeq', 'ues', 'tam', 'sam', 'sd', 'pmf', 'geq', 'pens', 'swls'];

// SMEQ verbal anchors (Sauro and Dumas 2009, after Zijlstra 1993).
export const SMEQ_ANCHORS = [[2, 'not at all hard to do'], [13, 'not very hard to do'], [26, 'a bit hard to do'], [37, 'fairly hard to do'], [57, 'rather hard to do'], [70, 'pretty hard to do'], [85, 'very hard to do'], [102, 'very, very hard to do'], [113, 'tremendously hard to do']];
export const smeqLabel = (v) => SMEQ_ANCHORS.reduce((best, a) => (Math.abs(a[0] - v) < Math.abs(best[0] - v) ? a : best))[1];
export const swlsBand = (s) => (s >= 31 ? 'extremely satisfied' : s >= 26 ? 'satisfied' : s >= 21 ? 'slightly satisfied' : s === 20 ? 'neutral' : s >= 15 ? 'slightly dissatisfied' : s >= 10 ? 'dissatisfied' : 'extremely dissatisfied');

// Parse "Name: 1-3, 5; Other: 4 6" into groups of 1-based columns.
export function parseGroupsSpec(text, k) {
  const out = [];
  for (const part of String(text || '').split(/[;\n]/)) {
    const m = part.match(/^\s*([^:]+):\s*(.+)$/); if (!m) continue;
    const items = [];
    for (const tok of m[2].split(/[,\s]+/).filter(Boolean)) {
      const r = tok.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (r) for (let i = +r[1]; i <= +r[2]; i++) items.push(i); else if (/^\d+$/.test(tok)) items.push(+tok);
    }
    const ok = [...new Set(items)].filter((i) => i >= 1 && i <= k);
    if (ok.length) out.push({ key: m[1].trim(), items: ok });
  }
  return out;
}

// Score one instrument. rows: respondents × items (NaN = missing / N/A). polarity: 'std' or 'rev' (answers given
// on the reversed form, converted with min + max − x before scoring).
export function scoreInstrument(id, rows, { polarity, groups, conf = 0.95 } = {}) {
  const ins = INSTRUMENTS[id];
  const k = ins.raw ? Math.max(0, ...rows.map((r) => r.length)) : ins.items;
  const subs = ins.raw ? (groups && groups.length ? groups : [{ key: 'All items', items: range(1, k) }]) : ins.subscales;
  const pol = polarity || (ins.polarityDefault === 'high' ? 'std' : 'std');
  const flip = (x) => ins.min + ins.max - x;
  const outOfRange = rows.flat().filter((x) => Number.isFinite(x) && (x < ins.min || x > ins.max)).length;
  const clean = rows.map((r) => Array.from({ length: k }, (_, j) => {
    let v = r[j]; if (!Number.isFinite(v) || v < ins.min || v > ins.max) return NaN;
    if (ins.polarity && pol === 'rev') v = flip(v);
    return v;
  }));
  const perResp = clean.map((r) => Object.fromEntries(subs.map((s) => {
    const vals = s.items.map((i) => { const v = r[i - 1]; return Number.isFinite(v) && (s.reverse || []).includes(i) ? flip(v) : v; }).filter(Number.isFinite);
    const need = ins.requireAll ? s.items.length : Math.ceil(s.items.length / 2);
    if (vals.length < need) return [s.key, NaN];
    return [s.key, ins.score === 'sum' ? vals.reduce((a, b) => a + b, 0) : mean(vals)];
  })));
  const scales = subs.map((s) => {
    const xs = perResp.map((p) => p[s.key]).filter(Number.isFinite);
    const ci = xs.length >= 2 ? meanCI(xs, conf) : { n: xs.length, mean: mean(xs), sd: NaN, lo: NaN, hi: NaN, se: NaN };
    const b = ins.bench?.[s.key];
    const test = Number.isFinite(b) && xs.length >= 2 ? oneSampleT(xs, b) : null;
    // Cronbach's alpha on respondents who answered every item of the scale (items reversed where needed).
    const full = clean.map((r) => s.items.map((i) => { const v = r[i - 1]; return Number.isFinite(v) && (s.reverse || []).includes(i) ? flip(v) : v; })).filter((r) => r.every(Number.isFinite));
    let alpha = NaN;
    if (s.items.length >= 2 && full.length >= 3) { try { const c = cronbach(full); alpha = c.alpha; } catch { alpha = NaN; } }
    return { key: s.key, name: s.name || s.key, items: s.items, ...ci, bench: b, test, alpha, nFull: full.length };
  });
  const itemStats = range(1, k).map((i) => { const xs = clean.map((r) => r[i - 1]).filter(Number.isFinite); return { item: i, n: xs.length, mean: mean(xs), sd: xs.length > 1 ? sd(xs) : NaN }; });
  return { id, ins, k, scales, perResp, itemStats, outOfRange, n: rows.length, conf, polarity: pol };
}
// PSSUQ/CSUQ/ASQ: 0–100, higher better, from a 1–7 score where 1 is best: (7 − x)/6 × 100.
export const rescale100 = (x) => ((7 - x) / 6) * 100;

// ── Semantic differential ──
// Header: one bipolar pair per column, written "Left|Right"; a leading * marks a pair whose positive pole is on the
// left (reversed before profiling). An optional first column holds the group (product, version).
export function parseSemantic(text) {
  const m = parseMatrix(text);
  const groupsCol = m.labels.some((l) => !/^\d+$/.test(l));
  const pairs = m.names.map((h) => {
    const rev = h.trim().startsWith('*'); const t = h.replace(/^\s*\*/, '');
    const [l, r] = t.includes('|') ? t.split('|').map((s) => s.trim()) : [t.trim(), ''];
    return { left: l, right: r, rev };
  });
  return { rows: m.rows, groups: groupsCol ? m.labels : m.labels.map(() => 'All'), pairs };
}
export function semanticProfile(rows, groups, pairs, { min = 1, max = 7, conf = 0.95 } = {}) {
  const names = [...new Set(groups)];
  const flip = (x) => min + max - x;
  const prof = names.map((g) => {
    const rs = rows.filter((_, i) => groups[i] === g);
    const items = pairs.map((p, j) => {
      const xs = rs.map((r) => r[j]).filter((v) => Number.isFinite(v) && v >= min && v <= max).map((v) => (p.rev ? flip(v) : v));
      return xs.length >= 2 ? meanCI(xs, conf) : { n: xs.length, mean: mean(xs), lo: NaN, hi: NaN, sd: NaN };
    });
    const overall = mean(items.map((x) => x.mean).filter(Number.isFinite));
    return { group: g, n: rs.length, items, overall };
  });
  // Osgood's distance D between two profiles: √Σ(d²) over pairs.
  const D = prof.length >= 2 ? Math.sqrt(pairs.reduce((a, _, j) => a + (prof[0].items[j].mean - prof[1].items[j].mean) ** 2, 0)) : NaN;
  return { prof, pairs, D, min, max, mid: (min + max) / 2, conf };
}

// ── Sean Ellis product/market fit ──
// Answers: very / somewhat / not (disappointed) / n/a (no longer use), or codes 1–4 in that order.
export function parsePmf(text) {
  const counts = { very: 0, somewhat: 0, not: 0, na: 0 }; let bad = 0;
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const raw of lines) {
    // "very, 12" style count lines.
    const cm = raw.match(/^([a-z/ ]+?)\s*[,:\t]\s*(\d+)$/i);
    const word = (cm ? cm[1] : raw).toLowerCase().trim(), times = cm ? Number(cm[2]) : 1;
    let key = null;
    if (/^(1|v)/.test(word)) key = 'very';
    else if (/^(2|s)/.test(word)) key = 'somewhat';
    else if (/^(4|x\b|n\/a|na\b|n\.a)/.test(word) || /no longer/.test(word)) key = 'na';
    else if (/^(3|not|n\b|no\b)/.test(word)) key = 'not';
    if (key) counts[key] += times; else bad++;
  }
  return { counts, bad };
}
export function pmf(counts, { includeNA = false, conf = 0.95, target = 0.4 } = {}) {
  const n = counts.very + counts.somewhat + counts.not + (includeNA ? counts.na : 0);
  if (!n) return null;
  const w = wilson(counts.very, n, conf);
  const bt = binomTest(counts.very, n, target);
  return { n, very: counts.very, share: counts.very / n, lo: w.lo, hi: w.hi, pTwo: bt.p, pAbove: bt.pGreater, target, counts, includeNA, conf };
}

// ── Summaries ──
// Questionnaire confidence rule: high when n ≥ 30 and the CI half-width of the main score is at most 5% of the scale
// range; medium when n ≥ 10 or the half-width is at most 10%; low otherwise. One level lower when the main scale's
// Cronbach's alpha is below 0.70 (Nunnally 1978).
export function questionnaireConfidence(n, halfWidthShare, alpha) {
  let c = n >= 30 && halfWidthShare <= 0.05 ? 'high' : n >= 10 || halfWidthShare <= 0.1 ? 'medium' : 'low';
  if (Number.isFinite(alpha) && alpha < 0.7) c = c === 'high' ? 'medium' : 'low';
  return c;
}
export function questionnaireSummary(res) {
  const { ins, scales } = res;
  const main = scales[0];
  const isSum = ins.score === 'sum';
  const span = isSum ? (ins.max - ins.min) * main.items.length : ins.max - ins.min;
  const hw = (main.hi - main.lo) / 2;
  const conf = questionnaireConfidence(main.n, hw / span, main.alpha);
  const pc = Math.round(res.conf * 100);
  const dir = ins.better === 'low' ? 'lower is better' : ins.better === 'high' ? 'higher is better' : 'neither end is "better"';
  const benchLine = (s) => {
    if (!Number.isFinite(s.bench)) return null;
    const above = s.lo > s.bench, below = s.hi < s.bench;
    if (ins.benchKind === 'midpoint') return `${s.name}: ${f2(s.mean)} is ${above ? 'above' : below ? 'below' : 'not clearly different from'} the neutral midpoint ${s.bench}.`;
    const good = ins.better === 'low' ? below : above, bad = ins.better === 'low' ? above : below;
    return `${s.name}: ${f2(s.mean)} vs the published mean ${s.bench}: ${good ? 'better than the norm (the CI excludes it)' : bad ? 'worse than the norm (the CI excludes it)' : 'not clearly different from the norm'}.`;
  };
  const headExtra = ins.short === 'SMEQ' ? ` ("${smeqLabel(main.mean)}")` : ins.short === 'SWLS' ? ` (${swlsBand(Math.round(main.mean))})` : '';
  const meaning = [];
  for (const s of scales) { const b = benchLine(s); if (b) meaning.push(b); }
  if (!meaning.length) meaning.push(`${ins.benchSource}.`);
  if (scales.length > 1 && ins.short !== 'SAM') {
    const subs = scales.slice(scales[0].key === 'Overall' ? 1 : 0).filter((s) => Number.isFinite(s.mean));
    if (subs.length > 1 && ins.better !== 'none') {
      const sorted = [...subs].sort((a, b) => (ins.better === 'low' ? a.mean - b.mean : b.mean - a.mean));
      meaning.push(`Strongest: ${sorted[0].name} (${f2(sorted[0].mean)}); weakest: ${sorted[sorted.length - 1].name} (${f2(sorted[sorted.length - 1].mean)}). Start with the weakest.`);
    } else if (subs.length > 1) {
      const sorted = [...subs].sort((a, b) => b.mean - a.mean);
      meaning.push(`Highest: ${sorted[0].name} (${f2(sorted[0].mean)}); lowest: ${sorted[sorted.length - 1].name} (${f2(sorted[sorted.length - 1].mean)}).`);
    }
  }
  if (ins.rescale) meaning.push(`On a 0–100 scale where higher is better, the ${main.name} score is ${f2(rescale100(main.mean), 0)}.`);
  const lowAlpha = scales.filter((s) => Number.isFinite(s.alpha) && s.alpha < 0.7).map((s) => s.name);
  if (lowAlpha.length) meaning.push(`Reliability is low (Cronbach's alpha below 0.70) for ${lowAlpha.join(', ')}: read those scores with caution.`);
  return {
    headline: `${ins.short} ${main.name === main.key ? '' : `${main.name} `}score ${f2(main.mean)}${headExtra} (${pc}% CI ${f2(main.lo)} to ${f2(main.hi)}) from ${main.n} respondent${main.n === 1 ? '' : 's'}; ${dir}.`,
    meaning: meaning.slice(0, 6),
    confidence: conf,
    confidenceNote: `Rule: high with 30 or more respondents and a CI half-width within 5% of the scale; medium with 10 or more or a half-width within 10%; low otherwise; one level lower if alpha is under 0.70. Here: n = ${main.n}, half-width ${f2(hw)} on a ${f2(span, 0)}-point range${Number.isFinite(main.alpha) ? `, alpha ${f2(main.alpha)}` : ''}.`,
    caveats: [
      `The ${pc}% CI is a range of plausible values from this sample; it is not a ${pc}% probability that the true mean is inside it.`,
      Object.keys(ins.bench || {}).length && ins.benchKind !== 'midpoint' ? `Norms come from other products and tasks (${ins.benchSource}); differences in tasks and users matter as much as your design.` : 'Without norms, the most useful comparison is with an earlier version or a competitor measured the same way.',
    ],
    next: [
      'Compare against a previous release with the [two-means comparison](/calculators/compare-means).',
      main.n < 30 ? 'Add respondents: about 30 or more keep the interval within a few points.' : 'Check the item means below for the specific items that pull the score down.',
    ],
    report: `${ins.short}${main.key !== ins.short ? ` ${main.name}` : ''} = ${f2(main.mean)} (${pc}% CI ${f2(main.lo)}–${f2(main.hi)}, n = ${main.n}${Number.isFinite(main.alpha) ? `, α = ${f2(main.alpha)}` : ''})${Number.isFinite(main.bench) ? `; ${ins.benchKind === 'midpoint' ? 'midpoint' : 'published mean'} ${main.bench}` : ''}.`,
  };
}
// Semantic differential confidence rule: high when every group has 30 or more respondents; medium with 10 or more
// per group; low otherwise.
// The positive word of a pair: the right-hand one, or the left-hand one for a pair marked * (reversed).
const pos = (p) => (p.rev ? p.left : p.right) || p.left;
export function semanticSummary(r) {
  const minN = Math.min(...r.prof.map((p) => p.n));
  const conf = minN >= 30 ? 'high' : minN >= 10 ? 'medium' : 'low';
  const pc = Math.round(r.conf * 100);
  const first = r.prof[0];
  const ranked = r.pairs.map((p, j) => ({ p, m: first.items[j].mean })).filter((x) => Number.isFinite(x.m)).sort((a, b) => a.m - b.m);
  const meaning = [
    `Strongest pole for ${first.group}: "${pos(ranked[ranked.length - 1].p)}" (${f2(ranked[ranked.length - 1].m)}); weakest: "${pos(ranked[0].p)}" (${f2(ranked[0].m)}), on a ${r.min}–${r.max} scale with ${r.mid} neutral and the positive word on the right.`,
  ];
  let head = `${first.group} averages ${f2(first.overall)} across ${r.pairs.length} word pairs (${r.min}–${r.max}, ${r.mid} neutral) from ${first.n} respondents.`;
  if (r.prof.length >= 2) {
    const b = r.prof[1];
    const clear = r.pairs.map((p, j) => ({ p, a: first.items[j], b: b.items[j] })).filter((x) => x.a.lo > x.b.hi || x.b.lo > x.a.hi);
    head = `${first.group} and ${b.group} differ by a profile distance D = ${f2(r.D)} over ${r.pairs.length} word pairs; ${clear.length} pair${clear.length === 1 ? '' : 's'} have non-overlapping ${pc}% CIs.`;
    meaning.push(clear.length ? `Clear differences: ${clear.slice(0, 4).map((x) => `${x.p.left}–${x.p.right} (${f2(x.a.mean)} vs ${f2(x.b.mean)})`).join('; ')}.` : 'No pair shows non-overlapping intervals; the profiles may differ only by chance.');
    meaning.push(`Overall means: ${r.prof.map((p) => `${p.group} ${f2(p.overall)}`).join(', ')}.`);
  }
  return {
    headline: head,
    meaning,
    confidence: conf,
    confidenceNote: `Rule: high with 30 or more respondents in every group, medium with 10 or more, low otherwise. Smallest group here: ${minN}.`,
    caveats: [
      'Non-overlapping intervals are a conservative check; overlapping ones can still differ. Test a key pair with a two-means comparison.',
      'Averaging pairs into one score assumes they measure one thing; Osgood\'s evaluation, potency and activity factors often differ.',
    ],
    next: ['Group pairs into factors (for example with [factor analysis](/calculators/factor-analysis)) before reporting a single score.'],
    report: `Semantic differential (${r.pairs.length} pairs, ${r.min}–${r.max}): ${r.prof.map((p) => `${p.group} M = ${f2(p.overall)} (n = ${p.n})`).join('; ')}${r.prof.length >= 2 ? `; profile distance D = ${f2(r.D)}` : ''}.`,
  };
}
// PMF confidence rule: high with 100 or more answers and a CI that excludes 40%; medium with 40 or more answers
// (Ellis's suggested minimum) or a CI that excludes 40%; low otherwise.
export function pmfSummary(r) {
  const pc = Math.round(r.conf * 100), excl = r.lo > r.target || r.hi < r.target;
  const conf = r.n >= 100 && excl ? 'high' : r.n >= 40 || excl ? 'medium' : 'low';
  const s = f2(r.share * 100, 0);
  const verdict = r.lo > r.target ? 'above the 40% bar' : r.hi < r.target ? 'below the 40% bar' : 'not clearly above or below the 40% bar';
  return {
    headline: `${s}% would be very disappointed without the product (${pc}% CI ${f2(r.lo * 100, 0)}% to ${f2(r.hi * 100, 0)}%, n = ${r.n}): ${verdict}.`,
    meaning: [
      'Sean Ellis\'s rule of thumb: products where 40% or more of users say "very disappointed" tend to have product/market fit; it comes from comparing about 100 startups, not from a formal validation.',
      `Exact one-sided test of "40% or less": p = ${f2(r.pAbove, 3)}.`,
      `Answers: very ${r.counts.very}, somewhat ${r.counts.somewhat}, not ${r.counts.not}, no longer use ${r.counts.na}${r.includeNA ? ' (counted in the base)' : ' (left out of the base)'}.`,
    ],
    confidence: conf,
    confidenceNote: `Rule: high with 100 or more answers and a CI excluding 40%; medium with 40 or more answers or a CI excluding 40%; low otherwise. Here: n = ${r.n}.`,
    caveats: [
      'Survey only people who used the product recently and meaningfully (Ellis suggests at least twice in the last two weeks); otherwise the share is diluted.',
      `The ${pc}% CI is a range of plausible values, not a ${pc}% probability that the true share is inside it.`,
    ],
    next: [
      r.share < r.target ? 'Follow Vohra\'s (2018) method: study the "very disappointed" segment, and ask the "somewhat" group what would make them very disappointed.' : 'Track the share by segment and over time; it can fall as the user base broadens.',
      'Compare segments with the [two-proportion comparison](/calculators/compare-rates).',
    ],
    report: `Product/market fit survey: ${s}% very disappointed (${r.very}/${r.n}; ${pc}% Wilson CI ${f2(r.lo * 100, 1)}–${f2(r.hi * 100, 1)}%) against Ellis's 40% benchmark.`,
  };
}
