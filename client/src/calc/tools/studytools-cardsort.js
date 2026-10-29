// Card sorting: encode studies and results, and analyse open, closed and hybrid sorts.
// Similarity: share of participants who put two cards in the same group, among those who sorted both.
// Clustering: average linkage (UPGMA) on 1 − similarity, the hclust in ../cluster.js (checked against scipy).
// Actual agreement (AAM, Righi et al. 2013): the share of participants who put every card of a group together.
// Sample size: Tullis & Wood (2004) found about 15 participants give a similarity matrix that correlates about 0.90
// with the matrix from their full sample of 168; the stability curve here repeats that subsampling on your data.
import { hclust, cutTree, classicalMDS } from '../cluster.js';
import { encodeCode, decodeCode } from './codec.js';
import { seeded, newId, shuffle, toCsv, pc, mdCell, pearson } from './studytools-common.js';

export { newId };

// ── Cards and study codes ──
// One card per line; an optional description follows a " | " (or a tab).
export function parseCards(text) {
  const cards = [], seen = new Set(), dup = [];
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
    const raw = line.replace(/^\s*(?:[-*•]\s+)?/, '');
    if (!raw.trim()) return;
    const [label, ...rest] = raw.split(/\s*\|\s*|\t/);
    const l = label.trim(); if (!l) return;
    const key = l.toLowerCase();
    if (seen.has(key)) { dup.push(l); return; }
    seen.add(key);
    const d = rest.join(' ').trim();
    cards.push(d ? [l, d] : [l]);
  });
  return { cards, dup };
}
export const cardsToText = (cards) => cards.map((c) => (c[1] ? `${c[0]} | ${c[1]}` : c[0])).join('\n');
export const parseCategories = (text) => [...new Set(String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];

export const SORT_TYPES = { open: 'Open', closed: 'Closed', hybrid: 'Hybrid' };
export function makeStudy({ id, name, cardsText, type = 'open', categoriesText = '', randomise = true, unsure = true, requireAll = true }) {
  const { cards } = parseCards(cardsText);
  const k = SORT_TYPES[type] ? type : 'open';
  return { v: 1, t: 'cs', id: id || newId(), n: name || 'Card sort', c: cards, k, g: k === 'open' ? [] : parseCategories(categoriesText), o: { r: randomise ? 1 : 0, u: unsure ? 1 : 0, a: requireAll ? 1 : 0 } };
}
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'cs' || !Array.isArray(s.c)) throw new Error('Not a card-sort study');
  return s;
}
// Result: { v, t: 'csr', s: study id, p: participant, d: date, ms, g: [[name, [card indices], category index or −1]], u: [unsure cards] }
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'csr' || !Array.isArray(r.g)) throw new Error('Not a card-sort result');
  return r;
}
export function cardOrder(n, randomise, rnd = Math.random) { const a = [...Array(n).keys()]; return randomise ? shuffle(a, rnd) : a; }

// What a participant still has to do before finishing. board: { groups: [{ name, cards, ci }], pile, unsure }.
export function boardProblems(study, board) {
  const out = [];
  if (study.o?.a && board.pile.length) out.push(`${board.pile.length} card${board.pile.length > 1 ? 's are' : ' is'} still to sort.`);
  const unnamed = board.groups.filter((g) => g.cards.length && g.ci < 0 && !g.name.trim()).length;
  if (unnamed) out.push(`Name ${unnamed === 1 ? 'the group' : `all ${unnamed} groups`} you made.`);
  if (!board.groups.some((g) => g.cards.length)) out.push('Put at least one card in a group.');
  return out;
}
export function boardToResult(study, board, pid, ms) {
  return { v: 1, t: 'csr', s: study.id, p: pid, d: Date.now(), ms: Math.round(ms || 0), g: board.groups.filter((g) => g.cards.length).map((g) => [g.ci >= 0 ? study.g[g.ci] : g.name.trim(), [...g.cards].sort((a, b) => a - b), g.ci]), u: [...board.unsure].sort((a, b) => a - b) };
}

// ── Category names ──
// Labels are compared after lower-casing, trimming, folding "and" into "&" and dropping punctuation, so
// "Bills and payments" and "bills & payments!" count as the same label.
export const normLabel = (s) => String(s || '').toLowerCase().replace(/\band\b/g, '&').replace(/[^\p{L}\p{N}&]+/gu, ' ').trim().replace(/\s+/g, ' ');

// ── Placements ──
// people[i]: { id, groupOf: card → group index (−1 not sorted or unsure), groups: [{ raw, norm, cards, ci, cat }], unsure: Set }.
// cat is the category a group counts towards: a predefined category's name, or the standard name the researcher
// mapped a created label to (mapping: normalised label → standard name), or the most common spelling of the label.
export function placements(study, results, mapping = {}) {
  const C = study.c.length;
  const mine = results.filter((r) => !r.s || r.s === study.id);
  const preNorm = new Map(study.g.map((g) => [normLabel(g), g]));
  const spell = new Map();
  mine.forEach((r) => r.g.forEach(([name, , ci]) => { if (ci >= 0) return; const n = normLabel(name); const m = spell.get(n) || new Map(); m.set(name.trim(), (m.get(name.trim()) || 0) + 1); spell.set(n, m); }));
  const display = (n) => { const m = spell.get(n); return m ? [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : n; };
  const catOf = (name, ci) => {
    if (ci >= 0 && study.g[ci] != null) return study.g[ci];
    const n = normLabel(name);
    if (mapping[n]) return mapping[n];
    if (preNorm.has(n)) return preNorm.get(n);
    return display(n);
  };
  return mine.map((r, pi) => {
    const groupOf = new Int32Array(C).fill(-1);
    const groups = r.g.map(([name, cards, ci = -1], gi) => {
      const cs = cards.filter((c) => c >= 0 && c < C);
      cs.forEach((c) => { groupOf[c] = gi; });
      return { raw: String(name), norm: normLabel(name), cards: cs, ci: ci ?? -1, cat: catOf(name, ci ?? -1) };
    });
    const unsure = new Set((r.u || []).filter((c) => c >= 0 && c < C));
    unsure.forEach((c) => { groupOf[c] = -1; });
    return { id: r.p || `P${pi + 1}`, groupOf, groups, unsure, ms: r.ms || 0 };
  });
}

// ── Similarity ──
// S[i][j] = together[i][j] ÷ both[i][j]: of the participants who put both cards in a group, the share who put them in
// the same one. Cards left unsorted or marked unsure do not count for that participant. The diagonal is 1.
export function similarity(people, C) {
  const T = new Float64Array(C * C), N = new Float64Array(C * C);
  for (const p of people) addPerson(T, N, p.groupOf, C, 1);
  return finishSimilarity(T, N, C);
}
function addPerson(T, N, g, C, w) {
  for (let i = 0; i < C; i++) {
    const gi = g[i]; if (gi < 0) continue;
    for (let j = i + 1; j < C; j++) {
      const gj = g[j]; if (gj < 0) continue;
      N[i * C + j] += w; if (gi === gj) T[i * C + j] += w;
    }
  }
}
function finishSimilarity(T, N, C) {
  const S = new Float64Array(C * C);
  for (let i = 0; i < C; i++) {
    S[i * C + i] = 1;
    for (let j = i + 1; j < C; j++) { const v = N[i * C + j] ? T[i * C + j] / N[i * C + j] : 0; S[i * C + j] = v; S[j * C + i] = v; T[j * C + i] = T[i * C + j]; N[j * C + i] = N[i * C + j]; }
  }
  return { S, together: T, both: N };
}
export const distance = (S) => S.map((v) => 1 - v);

// ── Dendrogram ──
export function linkage(S, C) { return C >= 2 ? hclust(distance(S), C, 'average') : []; }
// Leaf order as scipy's dendrogram draws it: left child (Z[i][0]) before right child (Z[i][1]).
export function leafOrder(Z, n) {
  if (n < 2) return n === 1 ? [0] : [];
  const out = []; const stack = [2 * n - 2];
  while (stack.length) { const x = stack.pop(); if (x < n) out.push(x); else { const [a, b] = Z[x - n]; stack.push(b, a); } }
  return out;
}
// Cut the tree at a height: cards whose clusters merge at or below h end up together (scipy fcluster, 'distance').
export function cutAtHeight(Z, n, h) {
  if (n < 2) return n === 1 ? [0] : [];
  const merged = Z.filter((z) => z[2] <= h + 1e-12).length;
  return cutTree(Z, n, n - merged);
}
// Groups from labels: [[cards]], biggest first, ties by first card.
export function groupsOf(labels) {
  const m = new Map(); labels.forEach((l, i) => { if (!m.has(l)) m.set(l, []); m.get(l).push(i); });
  return [...m.values()].sort((a, b) => b.length - a.length || a[0] - b[0]);
}
// Mean similarity between the cards of a group (NaN for a single card).
export function cohesion(S, C, cards) {
  if (cards.length < 2) return NaN;
  let s = 0, k = 0; for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) { s += S[cards[a] * C + cards[b]]; k++; }
  return s / k;
}

// ── Actual agreement (AAM) ──
// Of the participants who sorted every card in the set, the share who put them all in one group.
export function aamScore(people, cards) {
  let both = 0, agree = 0;
  for (const p of people) {
    const g0 = p.groupOf[cards[0]]; if (cards.some((c) => p.groupOf[c] < 0)) continue;
    both++; if (cards.every((c) => p.groupOf[c] === g0)) agree++;
  }
  return { score: both ? agree / both : 0, agree, n: both };
}
// "Best merge" with actual agreement: start with one card per group and repeatedly merge the two groups whose union
// the largest share of participants actually made (ties: more participants agreeing, then lowest card numbers);
// stop when no merge reaches the threshold. Each group comes back with the share who put all its cards together.
export function aamMerge(people, C, threshold = 0.5) {
  let groups = Array.from({ length: C }, (_, i) => ({ id: i, cards: [i], score: 1 }));
  let nextId = C;
  const cache = new Map();
  const pair = (x, y) => {
    const key = x.id < y.id ? `${x.id}|${y.id}` : `${y.id}|${x.id}`;
    if (!cache.has(key)) { const cards = [...x.cards, ...y.cards].sort((a, b) => a - b); cache.set(key, { cards, s: aamScore(people, cards) }); }
    return cache.get(key);
  };
  const steps = [];
  for (;;) {
    let best = null;
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      const { cards, s } = pair(groups[a], groups[b]);
      if (!best || s.score > best.s.score + 1e-12 || (Math.abs(s.score - best.s.score) <= 1e-12 && s.agree > best.s.agree)) best = { a, b, cards, s };
    }
    if (!best || best.s.score < threshold - 1e-12) break;
    steps.push({ cards: best.cards, score: best.s.score });
    groups = groups.filter((_, i) => i !== best.a && i !== best.b).concat({ id: nextId++, cards: best.cards, score: best.s.score });
    groups.sort((x, y) => x.cards[0] - y.cards[0]);
  }
  return { groups: groups.map(({ cards, score }) => ({ cards, score })).sort((x, y) => y.cards.length - x.cards.length || x.cards[0] - y.cards[0]), steps };
}

// ── Categories (standardised) ──
// For every category: how many participants used it, how often each card was put in it, the labels merged into it
// (different labels after normalising, each shown with its most common spelling).
// Agreement = Σ_c n_c ÷ (k × n), with n the participants who used the category, n_c how many of them put card c in it
// and k the number of different cards anyone put in it: the mean, over those cards, of the share of the category's
// users who put the card there. 1 means everyone who used the category put exactly the same cards in it.
export function categoryTable(study, people) {
  const C = study.c.length, cats = new Map();
  const get = (name) => { if (!cats.has(name)) cats.set(name, { name, predefined: study.g.includes(name), users: new Set(), counts: new Array(C).fill(0), raw: new Map() }); return cats.get(name); };
  study.g.forEach(get);
  people.forEach((p) => p.groups.forEach((g) => {
    const c = get(g.cat); c.users.add(p.id);
    if (g.ci < 0) { const r = c.raw.get(g.norm) || { label: g.raw.trim(), n: 0, spell: new Map() }; r.n++; r.spell.set(g.raw.trim(), (r.spell.get(g.raw.trim()) || 0) + 1); c.raw.set(g.norm, r); }
    g.cards.forEach((k) => { if (p.groupOf[k] >= 0) c.counts[k]++; });
  }));
  return [...cats.values()].map((c) => {
    const n = c.users.size, used = c.counts.filter((x) => x > 0).length, tot = c.counts.reduce((a, b) => a + b, 0);
    return { name: c.name, predefined: c.predefined, n, counts: c.counts, raw: [...c.raw.values()].map((r) => [[...r.spell.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0], r.n]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), cardsUsed: used, agreement: n && used ? tot / (used * n) : NaN, strong: c.counts.map((x, k) => (n && x / n >= 0.5 ? k : -1)).filter((k) => k >= 0) };
  }).sort((a, b) => (b.predefined - a.predefined) || b.n - a.n || a.name.localeCompare(b.name));
}
// Per card: where people put it. share = top category's count ÷ participants who sorted the card. A card is
// ambiguous when no category gets 60% of its placements and at least two categories each get 20% or more.
export const AMBIGUOUS_TOP = 0.6, AMBIGUOUS_SECOND = 0.2;
export function cardPlacements(study, people, cats) {
  return study.c.map(([label], k) => {
    const sorted = people.filter((p) => p.groupOf[k] >= 0).length;
    const unsure = people.filter((p) => p.unsure.has(k)).length;
    const unsorted = people.length - sorted - unsure;
    const by = cats.map((c) => ({ name: c.name, n: c.counts[k] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    const top = by[0], share = top && sorted ? top.n / sorted : NaN;
    const big = by.filter((x) => sorted && x.n / sorted >= AMBIGUOUS_SECOND).length;
    return { k, label, sorted, unsure, unsorted, by, top: top?.name ?? null, share, ambiguous: sorted >= 2 && share < AMBIGUOUS_TOP && big >= 2 };
  });
}

// ── Stability: how many participants are enough ──
// For sizes m = 2 … n, draw B random subsets of m participants, build their similarity matrix and correlate its upper
// triangle with the full sample's (Pearson). Subsets are nested prefixes of one random order per replicate, so each is a
// uniform random subset. Returns the mean and the 10th and 90th percentiles of r at each size.
export function stabilityCurve(people, C, { B = 40, seed = 11, maxSizes = 40 } = {}) {
  const P = people.length;
  if (P < 3 || C < 3) return { points: [], enough: null };
  const full = similarity(people, C).S;
  const iu = []; for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) iu.push(i * C + j);
  const fullV = iu.map((x) => full[x]);
  const step = Math.max(1, Math.ceil((P - 1) / maxSizes));
  const sizes = []; for (let m = 2; m <= P; m += step) sizes.push(m); if (sizes[sizes.length - 1] !== P) sizes.push(P);
  const rs = sizes.map(() => []);
  const rnd = seeded(seed);
  for (let b = 0; b < B; b++) {
    const order = shuffle([...Array(P).keys()], rnd);
    const T = new Float64Array(C * C), N = new Float64Array(C * C);
    let si = 0;
    for (let m = 1; m <= P && si < sizes.length; m++) {
      addPerson(T, N, people[order[m - 1]].groupOf, C, 1);
      if (m === sizes[si]) {
        const v = iu.map((x) => (N[x] ? T[x] / N[x] : 0));
        const r = pearson(v, fullV); if (Number.isFinite(r)) rs[si].push(r);
        si++;
      }
    }
  }
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (h - lo); };
  const points = sizes.map((m, i) => (rs[i].length ? { m, r: rs[i].reduce((a, b) => a + b, 0) / rs[i].length, lo: q(rs[i], 0.1), hi: q(rs[i], 0.9) } : null)).filter(Boolean);
  const hit = points.find((p) => p.r >= 0.9 && p.m < P);
  return { points, enough: hit ? hit.m : null };
}

// ── 2D map (classical MDS on 1 − similarity, from ../cluster.js) ──
export function cardMap(S, C) { return C >= 3 ? classicalMDS(distance(S), C, 2) : null; }

// ── Full analysis ──
export const DEFAULT_CUT = 0.5;
export function analyse(study, results, { mapping = {}, cut = DEFAULT_CUT, aamThreshold = 0.5 } = {}) {
  const C = study.c.length;
  const people = placements(study, results, mapping);
  const P = people.length;
  const { S, together, both } = similarity(people, C);
  const Z = linkage(S, C);
  const order = leafOrder(Z, C);
  const labels = cutAtHeight(Z, C, cut);
  const cats = categoryTable(study, people);
  const cards = cardPlacements(study, people, cats);
  const clusters = groupsOf(labels).map((cs) => ({ cards: cs, cohesion: cohesion(S, C, cs), aam: cs.length > 1 ? aamScore(people, cs).score : NaN, name: nameFor(cs, people) }));
  const nearest = study.c.map((_, i) => { let best = -1, v = -1; for (let j = 0; j < C; j++) if (j !== i && S[i * C + j] > v) { v = S[i * C + j]; best = j; } return { card: best, s: v }; });
  const aam = aamMerge(people, C, aamThreshold);
  return { study, C, P, people, S, together, both, Z, order, labels, cut, clusters, cats, cards, nearest, aam };
}
// The name most participants gave the cards of a cluster: the category (after standardising) that holds most of them.
export function nameFor(cards, people) {
  const votes = new Map();
  people.forEach((p) => p.groups.forEach((g) => { const k = g.cards.filter((c) => cards.includes(c)).length; if (k) votes.set(g.cat, (votes.get(g.cat) || 0) + k); }));
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best ? best[0] : '';
}

// ── Reading your results ──
// Strength of a group: mean pairwise similarity of its cards. Strong ≥ 0.6, moderate 0.4–0.6, weak < 0.4.
export const strength = (c) => (!Number.isFinite(c) ? 'single card' : c >= 0.6 ? 'strong' : c >= 0.4 ? 'moderate' : 'weak');
// A card does not fit anywhere when its closest partner shares a group with it for fewer than 35% of participants,
// or when 25% or more marked it unsure.
export const ORPHAN_SIM = 0.35, UNSURE_SHARE = 0.25;
export function orphans(an) {
  return an.cards.filter((c) => an.P && ((an.nearest[c.k].s < ORPHAN_SIM) || c.unsure / an.P >= UNSURE_SHARE)).map((c) => ({ ...c, nearest: an.nearest[c.k] }));
}
// Confidence rule (Tullis & Wood 2004: about 15 participants reach r ≈ 0.90 with the full sample, 20–30 reach 0.93–0.95):
//   high: 30 or more participants and the stability curve reached 0.90 before the full sample;
//   medium: 15 to 29 participants (or 30+ whose curve did not reach 0.90);
//   low: fewer than 15.
export function confidenceFor(P, stab) {
  if (P >= 30 && stab?.enough) return 'high';
  if (P >= 15) return 'medium';
  return 'low';
}
export function cardSortSummary(an, stab = null) {
  if (!an.P || an.C < 2) return null;
  const L = (k) => an.study.c[k][0];
  const multi = an.clusters.filter((c) => c.cards.length > 1);
  const orph = orphans(an);
  const amb = an.cards.filter((c) => c.ambiguous);
  const isOpen = an.study.k !== 'closed';
  const created = an.cats.filter((c) => !c.predefined && c.n > 0);
  const meaning = [];
  meaning.push(multi.length
    ? `${multi.length} group${multi.length > 1 ? 's' : ''} emerged at a cut of ${an.cut.toFixed(2)} (cards that ${Math.round((1 - an.cut) * 100)}% or more of participants put together on average): ${multi.slice(0, 6).map((c) => `${c.name ? `"${c.name}"` : 'a group'} with ${c.cards.length} cards (${strength(c.cohesion)}, ${pc(c.cohesion)} average agreement)`).join('; ')}.`
    : `No two cards were grouped together by most participants at a cut of ${an.cut.toFixed(2)}: people sorted these cards in very different ways.`);
  const strongest = [...multi].sort((a, b) => b.cohesion - a.cohesion)[0];
  if (strongest) meaning.push(`The clearest group is ${strongest.name ? `"${strongest.name}"` : 'one'}: ${strongest.cards.slice(0, 5).map(L).join(', ')}${strongest.cards.length > 5 ? '…' : ''}; ${pc(strongest.aam)} of participants put all ${strongest.cards.length} cards in one group (actual agreement).`);
  if (orph.length) meaning.push(`${orph.length} card${orph.length > 1 ? 's do' : ' does'} not fit anywhere: ${orph.slice(0, 5).map((c) => `"${c.label}" (${c.unsure / an.P >= UNSURE_SHARE ? `${pc(c.unsure / an.P)} unsure` : `closest partner only ${pc(c.nearest.s)}`})`).join(', ')}.`);
  else meaning.push('Every card has at least one partner that most people grouped it with.');
  if (amb.length) meaning.push(`${amb.length} card${amb.length > 1 ? 's were' : ' was'} split between categories: ${amb.slice(0, 5).map((c) => `"${c.label}" (${c.by.slice(0, 2).map((b) => `${b.name} ${pc(b.n / c.sorted)}`).join(', ')})`).join('; ')}.`);
  const weakCats = an.cats.filter((c) => c.n >= Math.max(2, an.P * 0.2) && c.agreement < 0.4);
  const synonyms = created.filter((c) => c.raw.length >= 3);
  const labels = [];
  if (isOpen && synonyms.length) labels.push(...synonyms.slice(0, 3).map((c) => `people used ${c.raw.length} different names for "${c.name}" (${c.raw.slice(0, 3).map(([r]) => `"${r}"`).join(', ')})`));
  if (weakCats.length) labels.push(...weakCats.slice(0, 3).map((c) => `"${c.name}" has low agreement (${pc(c.agreement)}): people put different cards in it`));
  const unusedPre = an.cats.filter((c) => c.predefined && c.n === 0);
  if (unusedPre.length) labels.push(`nobody used ${unusedPre.map((c) => `"${c.name}"`).join(', ')}`);
  if (labels.length) meaning.push(`Labels to reconsider: ${labels.join('; ')}.`);
  const ia = multi.slice(0, 8).map((c) => `${c.name || 'Unnamed'}: ${c.cards.map(L).join(', ')}`);
  const conf = confidenceFor(an.P, stab);
  const next = [
    `Suggested structure to test: ${ia.length ? ia.join(' · ') : 'no stable groups yet; run more sessions'}${orph.length ? ` · place ${orph.slice(0, 3).map((c) => `"${c.label}"`).join(', ')} by hand or cross-link ${orph.length > 1 ? 'them' : 'it'}` : ''}.`,
    'Validate the structure with a [tree test](/calculators/tree-test): write tasks for the cards that split or did not fit, and check people can find them.',
  ];
  // At most three next steps: the structure, the tree test, then the most pressing of the rest.
  if (conf === 'low') next.push(`Add participants: Tullis & Wood (2004) found about 15 give a stable picture and 20–30 a very stable one${stab?.enough ? '' : '; your stability curve has not yet reached 0.90'}.`);
  if (amb.length) next.push(`Rename or cross-list the split cards (${amb.slice(0, 3).map((c) => `"${c.label}"`).join(', ')}), or run a closed sort to see which home wins.`);
  if (isOpen && synonyms.length) next.push('Pick category names from the words participants used most often (the standardised table lists them).');
  if (conf === 'medium') next.push(`Add participants for a firmer result: Tullis & Wood (2004) found 20–30 give a very stable similarity matrix${stab?.enough ? '' : '; your stability curve has not yet reached 0.90'}.`);
  return {
    headline: multi.length ? `${an.P} participants sorted ${an.C} cards into ${multi.length} clear group${multi.length > 1 ? 's' : ''}${orph.length ? `, with ${orph.length} card${orph.length > 1 ? 's' : ''} that fit nowhere` : ''}.` : `${an.P} participants sorted ${an.C} cards with little agreement on groups.`,
    meaning,
    confidence: conf,
    confidenceNote: `${an.P} participants. Rule: high with 30 or more participants and a stability curve that reaches 0.90; medium with 15 to 29; low below 15 (Tullis & Wood 2004, 15 participants gave r ≈ 0.90 with their full sample of 168).${stab?.enough ? ` Your curve reached 0.90 at ${stab.enough} participants.` : stab?.points?.length ? ' Your curve has not reached 0.90 before the full sample.' : ''}`,
    caveats: [
      'A card sort shows how people group content, not how they would find it; groups that look clean can still fail a tree test.',
      'Card wording steers the sort: cards that share a word (such as "Pay my bill" and "Past bills") get grouped by the word, not the meaning.',
      isOpen ? 'Standardising names is a judgement call; merge only labels that clearly mean the same thing, and say so in the report.' : 'The dendrogram always joins everything in the end; only groups below the cut height are evidence.',
    ],
    next: next.slice(0, 3),
    report: `In an ${SORT_TYPES[an.study.k].toLowerCase()} card sort with ${an.P} participants and ${an.C} cards, average-linkage clustering at a cut of ${an.cut.toFixed(2)} gave ${multi.length} groups${strongest ? `; the clearest, "${strongest.name}", had ${pc(strongest.cohesion)} average pairwise agreement` : ''}.${orph.length ? ` ${orph.length} card${orph.length > 1 ? 's' : ''} did not fit any group.` : ''}${amb.length ? ` ${amb.length} card${amb.length > 1 ? 's were' : ' was'} split between categories.` : ''}`,
  };
}

// ── Exports ──
export function similarityCsv(an) {
  const L = an.study.c.map((c) => c[0]);
  return toCsv([['card', ...L], ...L.map((l, i) => [l, ...L.map((_, j) => an.S[i * an.C + j].toFixed(4))])]);
}
export function placementsCsv(an) {
  const rows = [['participant', 'group', 'standard_category', 'predefined', 'card']];
  an.people.forEach((p) => {
    p.groups.forEach((g) => g.cards.forEach((k) => rows.push([p.id, g.raw, g.cat, g.ci >= 0 ? 'yes' : 'no', an.study.c[k][0]])));
    [...p.unsure].forEach((k) => rows.push([p.id, '(unsure)', '', '', an.study.c[k][0]]));
  });
  return toCsv(rows);
}
export function markdownReport(an, summary, stab, mapping = {}) {
  const L = (k) => mdCell(an.study.c[k][0]);
  const out = [`# ${an.study.n}: card sort results`, '', `${SORT_TYPES[an.study.k]} sort · ${an.P} participants · ${an.C} cards · cut height ${an.cut.toFixed(2)}.`, '', '## Groups at the cut', '', '| Group | Cards | Average agreement | All together (AAM) |', '|---|---|---|---|'];
  an.clusters.forEach((c) => out.push(`| ${mdCell(c.name || '—')} | ${c.cards.map(L).join(', ')} | ${pc(c.cohesion)} | ${pc(c.aam)} |`));
  out.push('', '## Suggested categories (actual agreement, best merge)', '', ...an.aam.groups.filter((g) => g.cards.length > 1).map((g) => `- ${g.cards.map(L).join(', ')} (${pc(g.score)} put all of these together)`));
  out.push('', '## Categories', '', '| Category | Participants | Agreement | Cards most put in it | Names merged |', '|---|---|---|---|---|');
  an.cats.forEach((c) => out.push(`| ${mdCell(c.name)}${c.predefined ? ' (given)' : ''} | ${c.n} | ${pc(c.agreement)} | ${c.strong.map(L).join(', ') || '—'} | ${c.raw.map(([r, n]) => `${mdCell(r)} (${n})`).join(', ') || '—'} |`));
  out.push('', '## Cards', '', '| Card | Sorted | Most common category | Share | Unsure | Ambiguous |', '|---|---|---|---|---|---|');
  an.cards.forEach((c) => out.push(`| ${mdCell(c.label)} | ${c.sorted} | ${mdCell(c.top || '—')} | ${pc(c.share)} | ${c.unsure} | ${c.ambiguous ? 'yes' : ''} |`));
  if (stab?.points?.length) out.push('', '## Stability', '', `Mean correlation with the full-sample similarity matrix by number of participants (Tullis & Wood 2004 method): ${stab.points.filter((_, i, a) => i % Math.ceil(a.length / 8) === 0 || i === a.length - 1).map((p) => `${p.m}: ${p.r.toFixed(2)}`).join(', ')}.`);
  const merged = Object.entries(mapping).filter(([k, v]) => v && k !== normLabel(v));
  if (merged.length) out.push('', '## Name standardisation', '', ...merged.map(([k, v]) => `- "${mdCell(k)}" → ${mdCell(v)}`));
  if (summary) out.push('', '## Reading the results', '', `**${summary.headline}**`, '', ...summary.meaning.map((m) => `- ${m}`), '', '### What to do next', '', ...summary.next.map((m) => `- ${m.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}`), '', '### For the report', '', `> ${summary.report}`);
  return out.join('\n');
}

// ── Example: a mobile network's account area, open sort, 18 participants ──
export const EXAMPLE_CARDS = `Pay my bill
View past bills
Set up direct debit
Update payment card
Request a refund
Check my data usage
Buy a roaming add-on
Change my plan
Upgrade my phone
Order a new SIM
Trade in my old phone
Check network coverage
Report a fault | My phone or line is not working
Network service status
Repair my phone
Set up voicemail
Update my address
Change my password
Marketing preferences | Choose which offers you hear about
Find a store`;
// Mental models: each participant follows one of these with some noise. Names vary like real open sorts.
const EX_MODELS = [
  { w: 6, groups: { Billing: [0, 1, 2, 3, 4], 'My plan': [5, 6, 7], Shop: [8, 9, 10], Help: [11, 12, 13, 14, 15], 'My account': [16, 17, 18] } },
  { w: 4, groups: { 'Bills & payments': [0, 1, 2, 3, 4], Usage: [5, 6], Phones: [7, 8, 9, 10, 14], Network: [11, 12, 13], Settings: [15, 16, 17, 18] } },
  { w: 4, groups: { Payments: [0, 2, 3, 4], 'My account': [1, 5, 7, 16, 17, 18], Travel: [6], Shop: [8, 9, 10], Support: [11, 12, 13, 14, 15] } },
  { w: 4, groups: { Money: [0, 1, 2, 3, 4, 7], Usage: [5, 6], Devices: [8, 9, 10, 14], 'Help & support': [11, 12, 13, 15], Profile: [16, 17, 18] } },
];
const EX_NAMES = { Billing: ['Billing', 'Billing', 'billing', 'Bills'], Help: ['Help', 'Help', 'Support', 'Help and support'], 'My account': ['My account', 'Account', 'My Account'] };
export function exampleStudy() {
  return makeStudy({ id: 'csexample', name: 'Mobile network account area (example)', cardsText: EXAMPLE_CARDS, type: 'open', randomise: true, unsure: true, requireAll: false });
}
export function exampleResults(study = exampleStudy()) {
  const rnd = seeded(23);
  const pool = EX_MODELS.flatMap((m, i) => Array(m.w).fill(i));
  const out = [];
  for (let p = 0; p < 18; p++) {
    const model = EX_MODELS[pool[(p * 7) % pool.length]];
    const groups = Object.entries(model.groups).map(([name, cards]) => [EX_NAMES[name] ? EX_NAMES[name][Math.floor(rnd() * EX_NAMES[name].length)] : name, [...cards]]);
    // Noise: one card in three participants moves to a random other group.
    if (rnd() < 0.35) { const from = groups[Math.floor(rnd() * groups.length)]; if (from[1].length > 1) { const c = from[1].splice(Math.floor(rnd() * from[1].length), 1)[0]; const to = groups.filter((g) => g !== from)[Math.floor(rnd() * (groups.length - 1))]; to[1].push(c); } }
    // "Find a store" (card 19) has no clear home: unsure, left out, or dropped into a random group.
    const r = rnd(); const unsure = [];
    if (r < 0.25) unsure.push(19); else if (r < 0.35) { /* left unsorted */ } else groups[Math.floor(rnd() * groups.length)][1].push(19);
    out.push({ v: 1, t: 'csr', s: study.id, p: `P${p + 1}`, d: Date.UTC(2026, 9, 1 + p), ms: Math.round(240000 + rnd() * 360000), g: groups.map(([n, cs]) => [n, cs.sort((a, b) => a - b), -1]), u: unsure });
  }
  return out;
}
export const EXAMPLE_MAPPING = { billing: 'Billing & payments', bills: 'Billing & payments', 'bills & payments': 'Billing & payments', payments: 'Billing & payments', money: 'Billing & payments', help: 'Help & support', support: 'Help & support', 'help & support': 'Help & support', network: 'Help & support', 'my account': 'My account', account: 'My account', settings: 'My account', profile: 'My account', shop: 'Shop & devices', phones: 'Shop & devices', devices: 'Shop & devices', usage: 'Plan & usage', 'my plan': 'Plan & usage' };
