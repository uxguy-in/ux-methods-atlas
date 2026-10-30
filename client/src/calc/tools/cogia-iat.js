// IAT D-score with the improved scoring algorithm of Greenwald, Nosek and Banaji (2003, Table 4), from trial-level
// data: per-participant D, group summary, and split-half reliability. Pure functions; validated against an
// independent pandas implementation in server/scripts/cogia-reference.py.
import { mean, sd, pearson, meanCI, tCdf, rng, gauss, fmt, pct, pText, detectSep, splitRow, nonEmptyLines } from './cogia-core.js';

export const BLOCKS = [3, 4, 6, 7];
// Error handling, with the names Greenwald et al. gave the variants.
export const VARIANTS = {
  builtin: { label: 'Built-in correction (D1, D2)', note: 'Participants had to correct errors, so an error trial\'s latency already runs to the correct key press.' },
  p600: { label: 'Error latency = block mean + 600 ms (D4, D6)', note: 'Use when the task did not require correcting errors.' },
  p2sd: { label: 'Error latency = block mean + 2 SD (D3, D5)', note: 'Use when the task did not require correcting errors.' },
};

// Example: 32 participants, an IAT on "Our app" vs "Competitor" with "Trustworthy" vs "Untrustworthy". Blocks 3 and
// 4 pair Our app + Trustworthy (20 and 40 trials), blocks 6 and 7 pair Competitor + Trustworthy. Built-in error
// correction; a few very slow trials and one participant who rushed (many responses under 300 ms).
export function exampleCsv(seed = 2003) {
  const r = rng(seed), rows = ['participant,block,trial,latency_ms,error'];
  for (let p = 1; p <= 32; p++) {
    const base = 640 + 160 * r(), spread = 0.28 + 0.1 * r();
    const effect = 0.18 + 0.12 * gauss(r); // log-latency slowdown in blocks 6 and 7
    const errRate = 0.03 + 0.07 * r();
    const rusher = p === 17;
    for (const block of BLOCKS) {
      const nTr = block === 3 || block === 6 ? 20 : 40;
      for (let t = 1; t <= nTr; t++) {
        let lat;
        if (rusher && r() < 0.35) lat = 150 + 120 * r();
        else lat = base * Math.exp((block >= 6 ? effect : 0) + spread * gauss(r) + (block === 3 || block === 6 ? 0.08 : 0));
        const err = r() < errRate + (block >= 6 ? 0.03 : 0) ? 1 : 0;
        if (err) lat += 300 + 400 * r();
        if (r() < 0.004) lat = 10500 + 4000 * r();
        rows.push(`P${String(p).padStart(2, '0')},${block},${t},${Math.round(lat)},${err}`);
      }
    }
  }
  return rows.join('\n');
}

const findCol = (head, names) => head.findIndex((h) => names.includes(h.toLowerCase().replace(/[^a-z]/g, '')));
// Parses trial-level CSV: participant, block (3, 4, 6, 7; other blocks are ignored), latency in ms, and error (1 =
// error) or correct (1 = correct). An optional trial column sets the order for the split-half.
export function parseTrials(text) {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) return { error: 'Paste a header row and at least one trial.' };
  const sep = detectSep(lines[0]), head = splitRow(lines[0], sep);
  const cP = findCol(head, ['participant', 'subject', 'id', 'pid', 'person', 'respondent']);
  const cB = findCol(head, ['block', 'blocknum', 'blocknumber']);
  const cL = findCol(head, ['latency', 'latencyms', 'rt', 'rtms', 'ms', 'reactiontime', 'time']);
  const cE = findCol(head, ['error', 'err', 'incorrect', 'errors']);
  const cC = findCol(head, ['correct', 'accuracy', 'acc']);
  const cT = findCol(head, ['trial', 'trialnum', 'trialnumber']);
  const missing = [cP < 0 && 'participant', cB < 0 && 'block', cL < 0 && 'latency', cE < 0 && cC < 0 && 'error (or correct)'].filter(Boolean);
  if (missing.length) return { error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected a header such as participant,block,trial,latency_ms,error.` };
  const trials = []; let skipped = 0, other = 0;
  lines.slice(1).forEach((line, i) => {
    const c = splitRow(line, sep);
    const block = Number(String(c[cB]).replace(/[^0-9.]/g, '')), lat = Number(c[cL]);
    const e = cE >= 0 ? Number(c[cE]) : 1 - Number(c[cC]);
    if (!c[cP] || !Number.isFinite(block) || !Number.isFinite(lat) || !(e === 0 || e === 1)) { skipped++; return; }
    if (!BLOCKS.includes(block)) { other++; return; }
    trials.push({ p: c[cP], block, lat, err: e, order: cT >= 0 && Number.isFinite(Number(c[cT])) ? Number(c[cT]) : i });
  });
  if (!trials.length) return { error: 'No usable trials in blocks 3, 4, 6 and 7.' };
  return { trials, skipped, other };
}

// One participant's D from trials of the four blocks, following Table 4 of Greenwald et al. (2003):
//  2. drop trials over 10,000 ms;  3. (participant exclusion is decided by the caller);  4. D2/D5/D6: drop trials under
//  400 ms;  5. block means of correct trials;  6. inclusive SD of all trials in B3 + B6 and in B4 + B7;  7. replace
//  error latencies (block mean + 600 ms, or + 2 × the block SD of correct trials) unless errors were self-corrected;
//  8. block means of all trials;  9. B6 − B3 and B7 − B4;  10. divide each by its inclusive SD;  11. average them.
export function dScore(trials, { variant = 'builtin', drop400 = false } = {}) {
  const t = trials.filter((x) => x.lat <= 10000 && (!drop400 || x.lat >= 400));
  const by = Object.fromEntries(BLOCKS.map((b) => [b, t.filter((x) => x.block === b)]));
  if (BLOCKS.some((b) => by[b].length < 2)) return { D: NaN, reason: 'fewer than 2 trials in a block' };
  const correct = Object.fromEntries(BLOCKS.map((b) => [b, by[b].filter((x) => !x.err).map((x) => x.lat)]));
  if (variant !== 'builtin' && BLOCKS.some((b) => correct[b].length < 2)) return { D: NaN, reason: 'fewer than 2 correct trials in a block' };
  const sd36 = sd([...by[3], ...by[6]].map((x) => x.lat)), sd47 = sd([...by[4], ...by[7]].map((x) => x.lat));
  const val = (b, x) => {
    if (!x.err || variant === 'builtin') return x.lat;
    return mean(correct[b]) + (variant === 'p600' ? 600 : 2 * sd(correct[b]));
  };
  const M = Object.fromEntries(BLOCKS.map((b) => [b, mean(by[b].map((x) => val(b, x)))]));
  const d36 = (M[6] - M[3]) / sd36, d47 = (M[7] - M[4]) / sd47;
  return { D: (d36 + d47) / 2, d36, d47, M, sd36, sd47, nUsed: t.length };
}

// Runs every participant. Participants with more than 10% of their trials (in the four blocks, before any other
// trimming) under 300 ms are excluded (step 3). Split-half: D from odd and from even trials (by trial order within
// each block), correlated across participants and stepped up with Spearman-Brown, 2r/(1 + r).
export function analyseIat(trials, opts = {}) {
  const ids = [...new Set(trials.map((x) => x.p))];
  const people = ids.map((id) => {
    const tr = trials.filter((x) => x.p === id);
    const fast = tr.filter((x) => x.lat < 300).length / tr.length;
    const slow = tr.filter((x) => x.lat > 10000).length;
    const errRate = tr.filter((x) => x.err).length / tr.length;
    const excluded = fast > 0.1;
    const full = excluded ? { D: NaN } : dScore(tr, opts);
    const halves = [0, 1].map((h) => {
      const part = BLOCKS.flatMap((b) => tr.filter((x) => x.block === b).sort((a, c) => a.order - c.order).filter((_, i) => i % 2 === h));
      return excluded ? NaN : dScore(part, opts).D;
    });
    return { id, n: tr.length, fast, slow, errRate, excluded, ...full, odd: halves[0], even: halves[1] };
  });
  const ok = people.filter((p) => !p.excluded && Number.isFinite(p.D));
  const Ds = ok.map((p) => p.D);
  const g = Ds.length >= 2 ? meanCI(Ds) : null;
  const tStat = g ? g.mean / g.se : NaN, df = Ds.length - 1;
  const pVal = g ? 2 * (1 - tCdf(Math.abs(tStat), df)) : NaN;
  const sh = ok.filter((p) => Number.isFinite(p.odd) && Number.isFinite(p.even));
  const rHalf = sh.length >= 3 ? pearson(sh.map((p) => p.odd), sh.map((p) => p.even)) : NaN;
  const rParts = ok.length >= 3 ? pearson(ok.map((p) => p.d36), ok.map((p) => p.d47)) : NaN;
  const bands = BANDS.map(([lo, hi, label]) => ({ label, pos: Ds.filter((d) => d >= lo && d < hi).length, neg: Ds.filter((d) => -d >= lo && -d < hi).length }));
  return {
    people, nAll: people.length, nOk: ok.length, excluded: people.filter((p) => p.excluded).map((p) => p.id),
    mean: g?.mean ?? NaN, sd: g?.sd ?? NaN, lo: g?.lo ?? NaN, hi: g?.hi ?? NaN, t: tStat, df, p: pVal, d: g ? g.mean / g.sd : NaN,
    rHalf, sbHalf: (2 * rHalf) / (1 + rHalf), rParts, sbParts: (2 * rParts) / (1 + rParts), bands, opts,
  };
}
// Conventional labels used by Project Implicit for |D| (Greenwald and colleagues): below 0.15 little or none,
// 0.15 slight, 0.35 moderate, 0.65 strong.
export const BANDS = [[0, 0.15, 'little or none'], [0.15, 0.35, 'slight'], [0.35, 0.65, 'moderate'], [0.65, Infinity, 'strong']];
export const bandOf = (d) => BANDS.find(([lo, hi]) => Math.abs(d) >= lo && Math.abs(d) < hi)?.[2] ?? 'n/a';

export function peopleCsv(r) {
  return ['participant,D,D_practice_B3_B6,D_test_B4_B7,D_odd,D_even,trials,error_rate,share_under_300ms,trials_over_10s,excluded',
    ...r.people.map((p) => [p.id, fmt(p.D, 4), fmt(p.d36, 4), fmt(p.d47, 4), fmt(p.odd, 4), fmt(p.even, 4), p.n, fmt(p.errRate, 4), fmt(p.fast, 4), p.slow, p.excluded ? 1 : 0].join(',').replace(/n\/a/g, ''))].join('\n');
}

// Plain-language summary.
// Confidence rule: high when at least 30 participants are scored, the split-half reliability (Spearman-Brown) is at
// least 0.7 and p < 0.01; medium when at least 15 are scored, reliability is at least 0.5 and p < 0.05; low otherwise.
// IAT scores are noisy for individuals, so the rule is about the group mean.
export function iatSummary(r, { first = 'blocks 3 and 4', second = 'blocks 6 and 7' } = {}) {
  const dir = r.mean > 0 ? first : second;
  const conf = r.nOk >= 30 && r.sbHalf >= 0.7 && r.p < 0.01 ? 'high' : r.nOk >= 15 && r.sbHalf >= 0.5 && r.p < 0.05 ? 'medium' : 'low';
  const pos = r.bands.slice(1).reduce((a, b) => a + b.pos, 0), neg = r.bands.slice(1).reduce((a, b) => a + b.neg, 0);
  return {
    headline: `Mean D = ${fmt(r.mean, 2)} (${bandOf(r.mean)}) across ${r.nOk} participants: on average people sorted faster when the pairing was ${dir}.`,
    meaning: [
      `D is the difference in average latency between the two pairings divided by the participant's own spread of latencies, so it is comparable across people. Positive D means faster in ${first} than in ${second}.`,
      `95% confidence interval for the mean D: ${fmt(r.lo, 2)} to ${fmt(r.hi, 2)}; t(${r.df}) = ${fmt(r.t, 2)}, ${pText(r.p)}, Cohen's d = ${fmt(r.d, 2)}.`,
      `${pos} participant${pos === 1 ? '' : 's'} showed at least a slight effect favouring ${first} (D ≥ 0.15) and ${neg} favouring ${second} (D ≤ −0.15); labels follow Project Implicit's cut-offs of 0.15, 0.35 and 0.65.`,
      `Split-half reliability (odd vs even trials, Spearman-Brown) is ${fmt(r.sbHalf, 2)}; the practice and test parts correlate ${fmt(r.rParts, 2)}. Values around 0.7 to 0.8 are typical for the IAT (Greenwald et al. 2003; Nosek et al. 2007).`,
      r.excluded.length ? `${r.excluded.length} participant${r.excluded.length === 1 ? ' was' : 's were'} excluded for answering faster than 300 ms on more than 10% of trials (${r.excluded.join(', ')}).` : 'No participant was excluded for too many fast responses (over 10% under 300 ms).',
    ],
    confidence: conf,
    confidenceNote: `Rated ${conf}: strong needs at least 30 scored participants, split-half reliability of at least 0.7 and p < 0.01; some evidence needs at least 15, reliability of at least 0.5 and p < 0.05. Here n = ${r.nOk}, reliability ${fmt(r.sbHalf, 2)}, ${pText(r.p)}.`,
    caveats: [
      'An IAT measures relative association between two pairings, not an attitude towards one brand alone, and individual scores are too unreliable to diagnose a single person.',
      'Order of the blocks matters: counterbalance which pairing comes first across participants, and check the effect in both orders.',
    ],
    next: [
      'Compare the implicit result with what people said explicitly; a gap is a finding to explain, not noise.',
      'Report the scoring variant (error handling and the 400 ms rule) with the result.',
      'For latency distributions within blocks, see [Reaction time analysis](/calculators/reaction-time).',
    ],
    report: `IAT D-scores (Greenwald, Nosek and Banaji 2003 algorithm, ${VARIANTS[r.opts.variant || 'builtin'].label.replace(/ \(.*\)$/, '').toLowerCase()}${r.opts.drop400 ? ', trials under 400 ms removed' : ''}): mean D = ${fmt(r.mean, 2)}, 95% CI ${fmt(r.lo, 2)} to ${fmt(r.hi, 2)}, t(${r.df}) = ${fmt(r.t, 2)}, ${pText(r.p)}, n = ${r.nOk}; split-half reliability ${fmt(r.sbHalf, 2)}.`,
  };
}

