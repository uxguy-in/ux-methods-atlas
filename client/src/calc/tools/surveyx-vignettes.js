// Anchoring vignettes, nonparametric method (King, Murray, Salomon and Tandon 2004; King and Wand 2007).
// Each respondent rates themself (y) and J vignettes (z1 … zJ, intended order low to high) on the same scale.
// The self-rating is recoded relative to that respondent's own vignette ratings into C in 1 … 2J + 1.
// Pure functions shared by surveyx-Vignettes.jsx and server/scripts/check-surveyx.js.
import { parseTable, isNum, numericColumn, mean, welch, fmt, pct, pval, signed } from './surveyx-core.js';

// C for one respondent. Category 2m + 1 (m = 0 … J) means "between vignette m and m + 1" (y < z1 for m = 0, y > zJ for
// m = J); category 2m (m = 1 … J) means "equal to vignette m". Every condition is checked literally, so tied or
// misordered vignette ratings make several categories true; C is then the interval [lo, hi] (King and Wand 2007).
export function cValue(y, z) {
  const J = z.length, ok = [];
  for (let c = 1; c <= 2 * J + 1; c++) {
    let t;
    if (c % 2 === 0) t = y === z[c / 2 - 1];
    else { const m = (c - 1) / 2; t = (m === 0 || y > z[m - 1]) && (m === J || y < z[m]); }
    if (t) ok.push(c);
  }
  return { lo: ok[0], hi: ok[ok.length - 1], scalar: ok.length === 1 && ok[0] === ok[ok.length - 1] };
}
export function vignetteOrder(z) {
  let strict = true, ties = false, mis = false;
  for (let m = 0; m + 1 < z.length; m++) { if (z[m] === z[m + 1]) { ties = true; strict = false; } else if (z[m] > z[m + 1]) { mis = true; strict = false; } }
  return strict ? 'ordered' : mis ? 'misordered' : 'tied';
}

export function guessColumns(head, rows) {
  const nums = head.map((_, j) => numericColumn(rows, j));
  const numCols = head.map((_, j) => j).filter((j) => nums[j]);
  const g = head.findIndex((_, j) => !nums[j]);
  return { nums, group: g, self: numCols[0] ?? -1, vigs: numCols.slice(1) };
}
export function analyseVignettes(text, { groupCol, selfCol, vigCols } = {}) {
  const t = parseTable(text);
  if (t.error) return { error: t.error };
  const guess = guessColumns(t.head, t.rows);
  const sc = selfCol ?? guess.self, vc = vigCols ?? guess.vigs, gc = groupCol === undefined ? guess.group : groupCol;
  if (sc < 0 || vc.length < 1) return { error: 'Choose the self-assessment column and at least one vignette column.' };
  const J = vc.length, K = 2 * J + 1;
  const people = t.rows.filter((r) => isNum(r[sc]) && vc.every((j) => isNum(r[j]))).map((r) => {
    const y = Number(r[sc]), z = vc.map((j) => Number(r[j]));
    return { group: gc >= 0 ? r[gc] || '(blank)' : 'All', y, z, ...cValue(y, z), order: vignetteOrder(z) };
  });
  if (people.length < 2) return { error: 'Need at least two complete rows.' };
  const groups = [...new Set(people.map((p) => p.group))];
  const per = groups.map((g) => {
    const ps = people.filter((p) => p.group === g), sc1 = ps.filter((p) => p.scalar);
    const dist = new Array(K).fill(0), distScalar = new Array(K).fill(0);
    for (const p of ps) { const w = 1 / (p.hi - p.lo + 1); for (let c = p.lo; c <= p.hi; c++) dist[c - 1] += w; if (p.scalar) distScalar[p.lo - 1]++; }
    return {
      group: g, n: ps.length, nScalar: sc1.length, ys: ps.map((p) => p.y), cs: sc1.map((p) => p.lo), cMid: ps.map((p) => (p.lo + p.hi) / 2),
      meanY: mean(ps.map((p) => p.y)), meanC: mean(sc1.map((p) => p.lo)), meanCmid: mean(ps.map((p) => (p.lo + p.hi) / 2)),
      dist: dist.map((d) => d / ps.length), distScalar: distScalar.map((d) => d / Math.max(1, sc1.length)),
      vigMeans: vc.map((_, m) => mean(ps.map((p) => p.z[m]))),
      ordered: ps.filter((p) => p.order === 'ordered').length / ps.length, tied: ps.filter((p) => p.order === 'tied').length / ps.length, misordered: ps.filter((p) => p.order === 'misordered').length / ps.length,
    };
  });
  // Group contrasts against the first group, on raw self-ratings and on C (scalar cases only).
  const contrasts = per.length >= 2 ? per.slice(1).map((g) => ({
    group: g.group, base: per[0].group,
    raw: g.ys.length > 1 && per[0].ys.length > 1 ? welch(g.ys, per[0].ys) : null,
    c: g.cs.length > 1 && per[0].cs.length > 1 ? welch(g.cs, per[0].cs) : null,
  })) : [];
  const all = {
    n: people.length, scalar: people.filter((p) => p.scalar).length,
    ordered: people.filter((p) => p.order === 'ordered').length / people.length,
    misordered: people.filter((p) => p.order === 'misordered').length / people.length,
  };
  return { J, K, people, groups: per, contrasts, all, head: t.head, selfName: t.head[sc], vigNames: vc.map((j) => t.head[j]), groupName: gc >= 0 ? t.head[gc] : '' };
}
export const cLabel = (c, J) => (c % 2 === 0 ? `= V${c / 2}` : c === 1 ? '< V1' : c === 2 * J + 1 ? `> V${J}` : `V${(c - 1) / 2}–V${(c + 1) / 2}`);

// ── "Reading your results" ──
// Confidence rule: high when at least 100 respondents per group, at least 80% of C values are scalar (not intervals)
// and at least 80% of respondents order the vignettes as intended; medium when at least 30 per group and at least 60%
// scalar; low otherwise.
export function vignetteSummary(a) {
  const minN = Math.min(...a.groups.map((g) => g.n)), sh = a.all.scalar / a.all.n;
  const confidence = minN >= 100 && sh >= 0.8 && a.all.ordered >= 0.8 ? 'high' : minN >= 30 && sh >= 0.6 ? 'medium' : 'low';
  const byRaw = [...a.groups].sort((x, y) => y.meanY - x.meanY), byC = [...a.groups].sort((x, y) => y.meanCmid - x.meanCmid);
  const flipped = a.groups.length >= 2 && byRaw.map((g) => g.group).join('|') !== byC.map((g) => g.group).join('|');
  const meaning = [
    `Each self-rating was placed relative to that person's own ratings of ${a.J} vignette${a.J === 1 ? '' : 's'}, giving C from 1 (below every vignette) to ${a.K} (above every vignette). ${pct(sh, 0)} of the ${a.all.n} respondents got a single C value; the rest tied or misordered vignettes and got an interval.`,
    `${pct(a.all.ordered, 0)} rated the vignettes in the intended order${a.all.misordered > 0.1 ? `, and ${pct(a.all.misordered, 0)} reversed at least one pair, so some vignettes may not be as distinct as intended` : ''}.`,
  ];
  if (a.groups.length >= 2) {
    meaning.push(`Raw self-ratings put ${byRaw.map((g) => `${g.group} (${fmt(g.meanY)})`).join(' > ')}. After anchoring, mean C puts ${byC.map((g) => `${g.group} (${fmt(g.meanCmid)})`).join(' > ')}. ${flipped ? 'The order changes: part of the raw gap is groups using the scale differently, not different experiences.' : 'The order stays the same.'}`);
    const v = a.groups.map((g) => `${g.group} ${fmt(g.vigMeans[0])}`).join(', ');
    meaning.push(`Groups rated the same first vignette differently (${v}); differences in vignette ratings are the scale-use differences that C removes.`);
    for (const c of a.contrasts.slice(0, 2)) if (c.raw && c.c) meaning.push(`${c.group} vs ${c.base}: raw difference ${signed(c.raw.d)} (p ${pval(c.raw.p)}), C difference ${signed(c.c.d)} (p ${pval(c.c.p)}, single-value cases only).`);
  }
  return {
    headline: a.groups.length >= 2
      ? (flipped ? `Anchoring changes the comparison: by raw self-ratings ${byRaw[0].group} looks best, but after correcting for scale use ${byC[0].group} does.` : `After correcting for scale use, ${byC[0].group} still rates highest (mean C ${fmt(byC[0].meanCmid)} vs ${fmt(byC[byC.length - 1].meanCmid)} for ${byC[byC.length - 1].group}).`)
      : `Self-ratings recoded against ${a.J} vignettes give a mean C of ${fmt(a.groups[0].meanCmid)} on a 1–${a.K} scale.`,
    meaning,
    confidence,
    confidenceNote: `Rule: high with at least 100 respondents per group, at least 80% single-value C and at least 80% ordering the vignettes as intended; medium with at least 30 per group and at least 60% single-value C; low otherwise (smallest group ${minN}, ${pct(sh, 0)} single-value).`,
    caveats: [
      'The method assumes response consistency (people use the scale the same way for themselves and the vignettes) and vignette equivalence (everyone reads each vignette as the same level); check both in cognitive interviews.',
      'Means of C treat its categories as equally spaced; compare distributions as well as means.',
    ],
    next: [
      'If many respondents tie or misorder vignettes, rewrite the vignettes to be further apart on the construct.',
      'For a model-based correction with covariates, fit a CHOPIT model (R package anchors).',
    ],
    report: `Using ${a.J} anchoring vignette${a.J === 1 ? '' : 's'} and King et al.'s (2004) nonparametric method (n = ${a.all.n}; ${pct(sh, 0)} single-value C), ${a.groups.length >= 2 ? `mean C was ${a.groups.map((g) => `${fmt(g.meanCmid)} for ${g.group}`).join(', ')} (raw self-ratings ${a.groups.map((g) => `${fmt(g.meanY)}`).join(', ')})` : `mean C was ${fmt(a.groups[0].meanCmid)}`}; intervals were scored at their midpoints.`,
  };
}
