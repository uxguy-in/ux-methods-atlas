// Lexicon-based sentiment for interview segments, written for this site (no licensed word list is copied).
// Each word in the list has a valence from −3 (very negative) to +3 (very positive); a segment's score sums the
// valences after these rules:
//   negation     a negator (not, no, never, -n't, without, hardly, barely…) up to 3 words before a sentiment word, in
//                the same clause, flips and dampens it: v × −0.75 ("not good" → −1.5, "not bad" → +1.5);
//   intensifiers a booster (very, really, extremely, so, super…) in the 2 words before multiplies it by 1.3 each;
//                a downtoner (slightly, a bit, kind of, fairly…) by 0.7;
//   but-clauses  in a sentence with "but" or "however", words before it count × 0.5 and words after × 1.5; a sentence
//                that starts with "But" or "However" counts × 1.5 and halves the sentence before it;
//   compound     c = S / √(S² + 15), between −1 and 1 (the normalisation used by VADER, Hutto and Gilbert 2014);
//   label        mixed if both the positive and negative sums are at least 0.9 and the smaller is at least half the
//                larger; otherwise positive if c ≥ 0.05, negative if c ≤ −0.05, else neutral.
// It is a rough guide: it cannot see sarcasm, product-specific meaning ("sick", "killer feature") or tone of voice,
// and a short segment gets its score from one or two words.

const BANDS = {
  3: `love loved loves loving adore adored amazing awesome brilliant excellent fantastic fabulous incredible outstanding perfect perfectly superb wonderful wonderfully delighted delightful thrilled ecstatic phenomenal marvellous marvelous magnificent exceptional stunning flawless joy joyful best`,
  2.5: `great greatly lovely beautiful beautifully impressive impressed excited exciting glad happy happier happiest seamless seamlessly effortless effortlessly intuitive intuitively terrific favourite favorite pleasure pleased enjoy enjoyed enjoying enjoyable relieved relief`,
  2: `good nice easy easier easiest simple simpler helpful useful handy smooth smoothly clear clearer clean neat quick quicker quickly fast faster efficient efficiently reliable reliably trust trusted trustworthy confident confidence comfortable convenient convenience straightforward friendly welcoming satisfied satisfying satisfaction recommend recommended valuable worthwhile fun pleasant reassuring reassured reassurance safe secure success successful successfully works worked working win wins benefit benefits improved improvement better well-designed polished responsive accessible thanks thank grateful appreciate appreciated sorted solved powerful elegant slick snappy tidy calm calming calmer peace`,
  1.5: `liked likes fine ok okay decent nicely fair capable flexible logical consistent organised organized familiar accurate precise relevant personalised personalized supportive understanding informative clever smart interesting interested curious hopeful hope fresh modern sleek stable instant instantly painless effective easily simply clearly`,
  1: `alright acceptable adequate sufficient reasonable okayish manageable usable workable sensible expected predictable quiet steady free affordable cheap cheaper bargain bonus upgrade upgraded available helpfully`,
  [-1]: `odd strange weird unsure uncertain hesitant wary sceptical skeptical doubt doubts doubtful basic dated outdated old-fashioned boring dull bland meh limited limiting missing lacking lack lacks unexpected surprised surprising awkward tricky fiddly fussy picky wordy noisy tiny hidden buried vague generic repetitive waiting wait waited queue queued expensive pricey costly`,
  [-1.5]: `slow slower slowly sluggish hard harder difficult difficulty complicated complex cluttered messy cramped overwhelming overwhelmed tedious tiresome tiring tired time-consuming lengthy long-winded inconsistent inaccurate wrong mistake mistakes error errors problem problems issue issues struggle struggled struggling stuck lost confused unintuitive unhelpful unclear unreliable unpredictable worried worry worrying concern concerned concerning nervous anxious uneasy uncomfortable inconvenient hassle bother bothered bothering ugly irritated irritating irritates disappointing disappointed disappointment frustrated complain complained complaint complaints regret unfortunately sadly`,
  [-2]: `confusing frustrating frustration annoying annoyed annoys annoyance clunky buggy bug bugs glitch glitches glitchy laggy lag lags crash crashed crashes crashing broken breaks broke fail failed fails failing failure useless pointless worthless awful bad worse poor poorly painful pain stressful stressed stress upset unhappy angry anger mad scary scared afraid fear fearful distrust mistrust suspicious misleading deceptive dodgy rubbish crap sucks sucked junk mess chaos chaotic rude unusable inaccessible impossible ridiculous silly stupid dumb waste wasted wasting lose losing loses embarrassed embarrassing insecure unsafe risky danger dangerous spam spammy intrusive creepy invasive pushy`,
  [-2.5]: `terrible horrible dreadful appalling atrocious abysmal furious livid infuriating infuriated outrageous disgusted disgusting hopeless helpless miserable panic panicked panicking nightmare disaster disastrous unacceptable betrayed scam ripped worst`,
  [-3]: `hate hated hates hating loathe loathed despise despised horrendous unbearable intolerable`,
};
// Multi-word entries, matched before single words.
const PHRASES = {
  'fed up': -2, 'gave up': -1.5, 'give up': -1.5, 'giving up': -1.5, 'pain in the neck': -2, 'waste of time': -2, 'went wrong': -1.5,
  'goes wrong': -1.5, 'no idea': -1, 'peace of mind': 2, 'easy to use': 2, 'hard to use': -1.5, 'hard to find': -1.5, 'easy to find': 2,
  'took ages': -1.5, 'takes ages': -1.5, 'taking ages': -1.5, 'for ages': -1, 'spot on': 2, 'over the moon': 3, 'not a fan': -1.5,
  'a breeze': 2.5, 'a lifesaver': 2.5, 'life saver': 2.5, 'let down': -2, 'well done': 2, 'makes sense': 1.5, 'made sense': 1.5,
  'no problem': 1, 'no problems': 1, 'no issues': 1, 'no issue': 1, 'not bad': 1.5, 'drives me mad': -2.5, 'drove me mad': -2.5,
  'at a loss': -1.5, 'out of date': -1.5, 'piece of cake': 2,
};
export const LEXICON = (() => {
  const m = new Map();
  for (const [v, list] of Object.entries(BANDS)) for (const w of list.split(/\s+/).filter(Boolean)) if (!w.endsWith('-ish')) m.set(w, Number(v));
  return m;
})();
export const PHRASE_LIST = Object.entries(PHRASES).map(([p, v]) => ({ words: p.split(' '), v })).sort((a, b) => b.words.length - a.words.length);

const NEGATORS = new Set(['not', 'no', 'never', 'cannot', 'without', 'nothing', 'nobody', 'none', 'neither', 'nor', 'hardly', 'barely', 'scarcely', 'nowhere',
  'dont', 'cant', 'wont', 'isnt', 'wasnt', 'arent', 'werent', 'doesnt', 'didnt', 'couldnt', 'shouldnt', 'wouldnt', 'aint', 'havent', 'hasnt', 'hadnt']);
const isNegator = (w) => NEGATORS.has(w) || w.endsWith("n't");
const BOOSTERS = new Set(['very', 'really', 'extremely', 'so', 'super', 'incredibly', 'absolutely', 'totally', 'completely', 'utterly', 'highly', 'too',
  'particularly', 'especially', 'seriously', 'massively', 'hugely', 'deeply', 'truly', 'remarkably', 'exceptionally', 'insanely', 'ridiculously', 'majorly', 'most', 'mega']);
const DOWNTONERS = new Set(['slightly', 'somewhat', 'fairly', 'mildly', 'marginally', 'partly', 'partially', 'occasionally', 'little']);
const DOWN_BIGRAMS = new Set(['a bit', 'kind of', 'sort of', 'a little', 'a touch', 'bit of']);
const BUTS = new Set(['but', 'however']);
export const NEG_FACTOR = -0.75, BOOST = 1.3, DAMP = 0.7, BEFORE_BUT = 0.5, AFTER_BUT = 1.5, ALPHA = 15;

// Tokens: words (apostrophes kept, curly quotes normalised) and the punctuation that ends a clause or sentence.
export function tokens(text) {
  return (String(text || '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:['-][a-z]+)*|[.!?;:,]/g) || []);
}
const isPunct = (t) => /^[.!?;:,]$/.test(t);
const isStop = (t) => /^[.!?]$/.test(t);

// Scores one text. Returns { score (compound −1…1), sum, pos, neg, label, hits: [{ word, base, value, rules }] }.
export function scoreText(text) {
  const t = tokens(text);
  const hits = [];
  // Sentence boundaries, and each token's sentence.
  const sent = new Array(t.length); let si = 0;
  for (let i = 0; i < t.length; i++) { sent[i] = si; if (isStop(t[i])) si++; }
  const weight = new Array(t.length).fill(1);
  for (let s = 0; s <= si; s++) {
    const idx = []; for (let i = 0; i < t.length; i++) if (sent[i] === s) idx.push(i);
    const words = idx.filter((i) => !isPunct(t[i]));
    if (!words.length) continue;
    if (BUTS.has(t[words[0]])) {
      for (const i of idx) weight[i] *= AFTER_BUT;
      for (let i = 0; i < t.length; i++) if (sent[i] === s - 1) weight[i] *= BEFORE_BUT;
      continue;
    }
    const b = words.find((i) => BUTS.has(t[i]));
    if (b !== undefined) for (const i of idx) weight[i] *= i < b ? BEFORE_BUT : i > b ? AFTER_BUT : 1;
  }
  const used = new Array(t.length).fill(false);
  for (let i = 0; i < t.length; i++) {
    if (used[i] || isPunct(t[i])) continue;
    let base = null, len = 1;
    for (const ph of PHRASE_LIST) {
      if (ph.words.every((w, k) => t[i + k] === w)) { base = ph.v; len = ph.words.length; break; }
    }
    if (base === null) { const v = LEXICON.get(t[i]); if (v === undefined) continue; base = v; }
    for (let k = 0; k < len; k++) used[i + k] = true;
    // A phrase that already contains its negation ("not bad", "no problem") is not negated again.
    const selfNeg = len > 1 && isNegator(t[i]);
    let v = base; const rules = [];
    // Look back up to 3 words in the same clause.
    let negated = false, boosts = 0, damp = false;
    for (let k = 1; k <= 3; k++) {
      const j = i - k; if (j < 0 || isPunct(t[j]) || BUTS.has(t[j])) break;
      if (!selfNeg && isNegator(t[j])) negated = true;
      if (k <= 2 && BOOSTERS.has(t[j])) boosts++;
      if (k <= 2 && DOWNTONERS.has(t[j])) damp = true;
      if (k <= 3 && j > 0 && DOWN_BIGRAMS.has(`${t[j - 1]} ${t[j]}`)) damp = true;
    }
    if (boosts) { v *= BOOST ** Math.min(2, boosts); rules.push('intensified'); }
    if (damp) { v *= DAMP; rules.push('softened'); }
    if (negated) { v *= NEG_FACTOR; rules.push('negated'); }
    if (weight[i] !== 1) { v *= weight[i]; rules.push(weight[i] < 1 ? 'before but' : 'after but'); }
    hits.push({ word: t.slice(i, i + len).join(' '), base, value: v, rules });
  }
  const sum = hits.reduce((s, h) => s + h.value, 0);
  const pos = hits.filter((h) => h.value > 0).reduce((s, h) => s + h.value, 0);
  const neg = -hits.filter((h) => h.value < 0).reduce((s, h) => s + h.value, 0);
  const score = sum / Math.sqrt(sum * sum + ALPHA);
  return { score, sum, pos, neg, label: labelOf(score, pos, neg), hits };
}
export function labelOf(score, pos, neg) {
  if (pos >= 0.9 && neg >= 0.9 && Math.min(pos, neg) >= 0.5 * Math.max(pos, neg)) return 'mixed';
  return score >= 0.05 ? 'positive' : score <= -0.05 ? 'negative' : 'neutral';
}
export const LABELS = ['positive', 'mixed', 'neutral', 'negative'];
// A manual label replaces the computed one; for averages it stands for +0.5 (positive), −0.5 (negative) or 0.
export const OVERRIDE_SCORE = { positive: 0.5, negative: -0.5, mixed: 0, neutral: 0 };

// Every analysable segment's sentiment, with the user's overrides applied.
export function scoreSegments(segs, overrides = {}) {
  const out = new Map();
  for (const s of segs) {
    const r = scoreText(s.text), o = overrides[s.id];
    out.set(s.id, o ? { ...r, auto: r.label, autoScore: r.score, label: o, score: OVERRIDE_SCORE[o], overridden: true } : { ...r, auto: r.label, autoScore: r.score, overridden: false });
  }
  return out;
}
// Roll-up of a group of segments: count, mean score and the share of each label.
export function rollup(list) {
  const n = list.length, c = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  let s = 0; for (const r of list) { c[r.label]++; s += r.score; }
  return { n, mean: n ? s / n : NaN, ...Object.fromEntries(LABELS.map((l) => [l, n ? c[l] / n : NaN])), counts: c };
}
