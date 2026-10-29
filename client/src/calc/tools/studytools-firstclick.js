// First-click and 5-second tests: encode studies and results, normalise and hit-test clicks, kernel density heatmaps,
// click hotspots, and summaries. Clicks are stored as fractions of the image's width and height (0–1), so they do not
// depend on the screen the participant used.
// Success uses the adjusted-Wald interval and time the geometric mean with a t-interval on log times (../stats.js).
// The kernel density matches scipy.stats.gaussian_kde (Scott's rule) or a fixed isotropic bandwidth.
import { adjustedWald, timeCI, meanCI, mean, sd, median, twoProportions } from '../stats.js';
import { dbscan } from '../cluster.js';
import { encodeCode, decodeCode } from './codec.js';
import { seeded, newId, shuffle, toCsv, pc, mdCell } from './studytools-common.js';

export { newId };

// ── Studies ──
// Study: { v, t: 'fc', id, n, m: 'local' | 'url', o: { r: randomise tasks }, k: tasks }.
// Task: { y: 'click' | '5s', q: instruction, s: exposure seconds (5s), qs: recall questions, rt: rating question or '',
//         kw: keywords, im: [variants] }; variant: { u: image reference, w, h: natural size, r: targets [[x, y, w, h]] }.
// Image references: 'ex:<name>' (built-in example), 'idb:<key>' (uploaded, kept in this browser) or an http(s) URL.
export const TASK_TYPES = { click: 'First click', '5s': '5-second test' };
export function makeStudy({ id, name, mode = 'local', randomise = false, tasks = [] }) {
  return {
    v: 1, t: 'fc', id: id || newId(), n: name || 'First-click test', m: mode === 'url' ? 'url' : 'local', o: { r: randomise ? 1 : 0 },
    k: tasks.map((t) => ({
      y: t.y === '5s' ? '5s' : 'click', q: String(t.q || '').trim(),
      ...(t.y === '5s' ? { s: clampSec(t.s), qs: (t.qs || []).map((x) => String(x).trim()).filter(Boolean), rt: String(t.rt || '').trim(), kw: (t.kw || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean) } : {}),
      im: (t.im || []).filter((v) => v && v.u).map((v) => ({ u: v.u, w: Math.round(v.w) || 0, h: Math.round(v.h) || 0, r: (v.r || []).map((r) => r.map((x) => round4(x))) })),
    })),
  };
}
const clampSec = (s) => Math.max(1, Math.min(60, Math.round(Number(s) || 5)));
export const round4 = (x) => Math.round(x * 10000) / 10000;
export const encodeStudy = (s) => encodeCode(s);
export function decodeStudy(code) {
  const s = decodeCode(code);
  if (!s || s.v !== 1 || s.t !== 'fc' || !Array.isArray(s.k)) throw new Error('Not a first-click study');
  return s;
}
// Result: { v, t: 'fcr', s, p, d, k: [{ t: task, i: variant, x, y (null if skipped), ms, a: answers, g: rating }] }.
export const encodeResult = (r) => encodeCode(r);
export function decodeResult(code) {
  const r = decodeCode(code);
  if (!r || r.v !== 1 || r.t !== 'fcr' || !Array.isArray(r.k)) throw new Error('Not a first-click result');
  return r;
}
export const isUrl = (u) => /^https?:\/\//i.test(String(u || ''));
// Which image references would stop a shared link from working on another device.
export const localRefs = (study) => study.k.flatMap((t) => t.im.map((v) => v.u)).filter((u) => String(u).startsWith('idb:'));
export function taskOrder(n, randomise, rnd = Math.random) { const a = [...Array(n).keys()]; return randomise ? shuffle(a, rnd) : a; }
// Variant for a participant: rotate by session number so variants stay balanced in moderated runs; random otherwise.
export const pickVariant = (nVariants, session = null, rnd = Math.random) => (nVariants <= 1 ? 0 : session != null ? session % nVariants : Math.floor(rnd() * nVariants));

// ── Geometry ──
// Fit an image of natural size w × h inside a box (contain), centred.
export function fitRect(w, h, boxW, boxH) {
  const s = Math.min(boxW / w, boxH / h);
  const width = w * s, height = h * s;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height, scale: s };
}
// A click at (clientX, clientY) on an image drawn at rect → fractions of the image (0–1), or null when outside it.
export function normaliseClick(clientX, clientY, rect) {
  const x = (clientX - rect.left) / rect.width, y = (clientY - rect.top) / rect.height;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
  return { x: round4(x), y: round4(y) };
}
// Target rectangles are [x, y, w, h] in fractions; edges count as inside.
export const inRect = (r, x, y) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
export const hitIndex = (rects, x, y) => (x == null ? -1 : rects.findIndex((r) => inRect(r, x, y)));
// A rectangle from two corners of a drag, clamped to the image.
export function rectFrom(a, b) {
  const c = (v) => Math.max(0, Math.min(1, v));
  const x0 = c(Math.min(a.x, b.x)), y0 = c(Math.min(a.y, b.y)), x1 = c(Math.max(a.x, b.x)), y1 = c(Math.max(a.y, b.y));
  return [round4(x0), round4(y0), round4(x1 - x0), round4(y1 - y0)];
}

// ── Kernel density ──
// Points in pixels. Scott's rule as in scipy.stats.gaussian_kde: covariance Σ = cov(points, ddof 1) × n^(−2/(d+4)),
// density f(x) = 1/(n·2π·√|Σ|) Σ_i exp(−½ (x − x_i)ᵀ Σ⁻¹ (x − x_i)). With a fixed bandwidth h: Σ = h²·I.
export function kde(points, bw = 'scott') {
  const n = points.length;
  if (!n) return null;
  let a, b, c; // Σ = [[a, b], [b, c]]
  if (bw === 'scott') {
    if (n < 2) return null;
    const mx = points.reduce((s, p) => s + p[0], 0) / n, my = points.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, sxy = 0, syy = 0; points.forEach(([x, y]) => { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; });
    const f2 = n ** (-2 / 6);
    a = (sxx / (n - 1)) * f2; b = (sxy / (n - 1)) * f2; c = (syy / (n - 1)) * f2;
  } else { a = bw * bw; b = 0; c = bw * bw; }
  const det = a * c - b * b;
  if (!(det > 0)) return null;
  const ia = c / det, ib = -b / det, ic = a / det, norm = 1 / (n * 2 * Math.PI * Math.sqrt(det));
  const f = (x, y) => { let s = 0; for (const p of points) { const dx = x - p[0], dy = y - p[1]; s += Math.exp(-0.5 * (ia * dx * dx + 2 * ib * dx * dy + ic * dy * dy)); } return s * norm; };
  return { f, cov: [[a, b], [b, c]] };
}
// Density on a cols × rows grid over a w × h image (cell centres), with its maximum.
export function kdeGrid(points, w, h, cols, rows, bw = 'scott') {
  const k = kde(points, bw); if (!k) return null;
  const g = new Float64Array(cols * rows); let max = 0;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { const v = k.f(((q + 0.5) * w) / cols, ((r + 0.5) * h) / rows); g[r * cols + q] = v; if (v > max) max = v; }
  return { g, cols, rows, max, cov: k.cov };
}

// ── Hotspots ──
// DBSCAN on click positions measured in image widths (y scaled by h/w so distance is the same in both directions):
// eps = 0.05 of the image width; minPts = 3 (2 when fewer than 10 clicks). Clusters biggest first; the rest are scattered.
export const HOTSPOT_EPS = 0.05;
export function hotspots(clicks, w, h, rects = []) {
  const pts = clicks.filter((c) => c.x != null).map((c) => [c.x, (c.y * h) / (w || 1)]);
  const n = pts.length; if (!n) return { spots: [], scattered: 0 };
  const D = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) D[i * n + j] = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  const { labels, clusters } = dbscan(D, n, HOTSPOT_EPS, n < 10 ? 2 : 3);
  const all = clicks.filter((c) => c.x != null);
  const spots = Array.from({ length: clusters }, (_, k) => {
    const m = all.filter((_, i) => labels[i] === k);
    const xs = m.map((c) => c.x), ys = m.map((c) => c.y);
    const per = rects.map((r, t) => m.filter((c) => hitIndex(rects, c.x, c.y) === t).length);
    const bestT = per.length ? per.indexOf(Math.max(...per)) : -1;
    const hits = per.reduce((a, b) => a + b, 0);
    // A hotspot is "on" a target when at least half of its clicks hit that target.
    return { id: k, n: m.length, share: m.length / n, x: mean(xs), y: mean(ys), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)], target: bestT >= 0 && per[bestT] * 2 >= m.length ? bestT : -1, hits };
  }).sort((a, b) => b.n - a.n || a.id - b.id);
  const rank = new Map(spots.map((s, i) => [s.id, i]));
  return { spots, scattered: labels.filter((l) => l < 0).length, labels: labels.map((l) => (l < 0 ? -1 : rank.get(l))) };
}

// ── 5-second answers ──
export const STOP = new Set('a an the and or of to in on for with is are was were it its this that be i you we they he she my your our their me at as by from but not no so if do does did can could would should will just like about what which who how there here very really some any all more most it\'s i\'m don\'t think seems seemed looks looked page site website'.split(' '));
export const words = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).map((w) => w.replace(/['’]s$/, ''));
// How many answers use each word (each answer counts a word once), stop words left out; most common first.
export function wordFrequency(answers) {
  const m = new Map();
  answers.forEach((a) => new Set(words(a).filter((w) => w.length > 1 && !STOP.has(w))).forEach((w) => m.set(w, (m.get(w) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([word, n]) => ({ word, n, share: answers.length ? n / answers.length : NaN }));
}
// An answer mentions a keyword when a word in it starts with the keyword ("invoice" matches "invoices", "invoicing" does
// not); a keyword with spaces must appear as a phrase.
export function mentions(answer, kw) {
  const k = String(kw).toLowerCase().trim(); if (!k) return false;
  if (/\s/.test(k)) return String(answer).toLowerCase().replace(/\s+/g, ' ').includes(k);
  return words(answer).some((w) => w.startsWith(k));
}
export function keywordShares(answers, keywords, conf = 0.95) {
  const n = answers.length;
  const each = keywords.map((k) => { const x = answers.filter((a) => mentions(a, k)).length; return { kw: k, x, n, share: n ? x / n : NaN }; });
  const anyX = answers.filter((a) => keywords.some((k) => mentions(a, k))).length;
  return { each, any: { x: anyX, n, share: n ? anyX / n : NaN, ci: n ? adjustedWald(anyX, n, conf) : null } };
}
export function ratingSummary(vals, conf = 0.95) {
  const v = vals.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const m = mean(v), s = v.length > 1 ? sd(v) : NaN;
  return { n: v.length, mean: m, sd: s, median: median(v), ci: v.length > 1 ? meanCI(m, s, v.length, conf) : null, dist: [1, 2, 3, 4, 5].map((k) => v.filter((x) => x === k).length), top2: v.filter((x) => x >= 4).length / v.length };
}

// ── Analysis ──
export function analyse(study, results, conf = 0.95) {
  const mine = results.filter((r) => !r.s || r.s === study.id);
  const tasks = study.k.map((task, ti) => {
    const atts = [];
    mine.forEach((r, pi) => { const a = r.k.find((x) => x.t === ti); if (a) atts.push({ pid: r.p || `P${pi + 1}`, ...a, i: Math.min(a.i || 0, Math.max(0, task.im.length - 1)) }); });
    const variants = task.im.map((v, vi) => {
      const A = atts.filter((a) => a.i === vi);
      if (task.y === '5s') {
        const qs = (task.qs || []).map((q, qi) => { const ans = A.map((a) => (a.a || [])[qi]).filter((x) => x && String(x).trim()); return { q, answers: ans, words: wordFrequency(ans), kw: keywordShares(ans, task.kw || [], conf) }; });
        const allAns = A.map((a) => (a.a || []).join(' ')).filter((x) => x.trim());
        return { vi, v, n: A.length, atts: A, qs, kwAll: keywordShares(allAns, task.kw || [], conf), rating: ratingSummary(A.map((a) => a.g), conf) };
      }
      const clicks = A.map((a) => ({ pid: a.pid, x: a.x ?? null, y: a.y ?? null, ms: a.ms, hit: hitIndex(v.r, a.x ?? null, a.y ?? null) }));
      const n = clicks.length, succ = clicks.filter((c) => c.hit >= 0).length, skipped = clicks.filter((c) => c.x == null).length;
      const times = clicks.filter((c) => c.x != null && c.ms > 0).map((c) => c.ms / 1000);
      const okTimes = clicks.filter((c) => c.hit >= 0 && c.ms > 0).map((c) => c.ms / 1000);
      const tci = (t) => (t.length >= 2 ? timeCI(t, conf) : t.length === 1 ? { geo: t[0], geoLo: NaN, geoHi: NaN, n: 1 } : null);
      return {
        vi, v, n, succ, skipped, rate: n ? succ / n : NaN, ci: n ? adjustedWald(succ, n, conf) : null, clicks,
        time: tci(times), timeOk: tci(okTimes),
        targets: v.r.map((r, k) => { const x = clicks.filter((c) => c.hit === k).length; return { k, rect: r, x, share: n ? x / n : NaN }; }),
        hot: hotspots(clicks, v.w || 1, v.h || 1, v.r),
      };
    });
    const cmp = task.y === 'click' && variants.length === 2 && variants[0].n && variants[1].n ? twoProportions(variants[0].succ, variants[0].n, variants[1].succ, variants[1].n, conf) : null;
    const n = variants.reduce((s, v) => s + v.n, 0);
    return { ti, task, n, variants, cmp };
  });
  return { tasks, n: mine.length };
}

// ── Reading your results ──
// Benchmarks and sources:
//   Bailey & Wolfson (2009, "FirstClick usability testing", 12 studies): people whose first click was right completed the
//   task about 87% of the time, against about 46% when it was wrong. Context only: it is an association, not a guarantee.
//   70% and 80% first-click success are rules of thumb, not published norms.
// Confidence rule, by the smallest number of attempts behind any click task's success rate:
//   high: 40 or more (adjusted-Wald 95% margin about ±15 points or less); medium: 20–39; low: fewer than 20.
export function confidenceFor(minN) { return minN >= 40 ? 'high' : minN >= 20 ? 'medium' : 'low'; }
const vName = (t, v) => (t.task.im.length > 1 ? ` (version ${String.fromCharCode(65 + v.vi)})` : '');
export function firstClickSummary(an) {
  const T = an.tasks.filter((t) => t.n);
  if (!T.length) return null;
  const clickV = T.filter((t) => t.task.y === 'click').flatMap((t) => t.variants.filter((v) => v.n).map((v) => ({ t, v })));
  const fiveT = T.filter((t) => t.task.y === '5s');
  const meaning = [], next = [];
  clickV.forEach(({ t, v }) => {
    const top = v.hot.spots[0];
    const wrongTop = v.hot.spots.find((s) => s.target < 0 && s.share >= 0.15);
    meaning.push(`Task ${t.ti + 1}${vName(t, v)}: ${pc(v.rate)} clicked a correct area first (${v.succ} of ${v.n}; 95% CI ${pc(v.ci.lo)} to ${pc(v.ci.hi)})${v.time ? `, after ${v.time.geo.toFixed(1)} s (geometric mean)` : ''}.${top ? ` The biggest hotspot holds ${pc(top.share)} of clicks and is ${top.target >= 0 ? 'on a target' : 'outside every target'}.` : ''}${wrongTop && wrongTop !== top ? ` A wrong hotspot drew ${pc(wrongTop.share)}.` : ''}`);
    if (v.rate < 0.7) next.push(`Task ${t.ti + 1}${vName(t, v)}: ${wrongTop ? 'look at what sits where the wrong hotspot is: people expect the answer there. Move the link, or make it look clickable, or rename the target.' : 'clicks are scattered: the target does not stand out. Strengthen its label or visual weight.'}`);
  });
  T.filter((t) => t.cmp).forEach((t) => {
    const [a, b] = t.variants;
    meaning.push(`Task ${t.ti + 1}: version A ${pc(a.rate)} vs version B ${pc(b.rate)}; the difference is ${t.cmp.p < 0.05 ? `statistically significant (p = ${t.cmp.p.toFixed(3)})` : `not statistically significant (p = ${t.cmp.p.toFixed(2)}), so treat it as a hint`}.`);
  });
  fiveT.forEach((t) => t.variants.filter((v) => v.n).forEach((v) => {
    const kw = v.kwAll;
    const w = v.qs[0]?.words.slice(0, 5).map((x) => `"${x.word}" (${x.n})`).join(', ');
    meaning.push(`Task ${t.ti + 1}${vName(t, v)}, 5-second test: ${t.task.kw?.length ? `${pc(kw.any.share)} of ${kw.any.n} participants mentioned at least one of your keywords (${t.task.kw.join(', ')})` : `${v.n} participants answered`}.${w ? ` Most used words for "${v.qs[0].q}": ${w}.` : ''}${v.rating ? ` "${t.task.rt}" averaged ${v.rating.mean.toFixed(1)} of 5.` : ''}`);
    if (t.task.kw?.length && kw.any.share < 0.6) next.push(`Task ${t.ti + 1}: fewer than 60% recalled the key message; make it the largest, first-read element and retest.`);
  }));
  // At most six points: per-version lines beyond four are folded into one, and the Bailey & Wolfson context comes last.
  if (meaning.length > 5) { const rest = meaning.splice(4); meaning.push(`Also: ${rest.map((m) => m.replace(/\.$/, '')).join('; ')}.`); }
  const minN = Math.min(...[...clickV.map(({ v }) => v.n), ...fiveT.flatMap((t) => t.variants.filter((v) => v.n).map((v) => v.n))]);
  const failed = clickV.filter(({ v }) => v.rate < 0.7);
  if (clickV.length) meaning.push('Context: in Bailey & Wolfson\'s (2009) studies, people whose first click was right went on to complete the task about 87% of the time, against about 46% when the first click was wrong. That is an association across their studies, not a promise for yours.');
  if (!failed.length && clickV.length) next.push('First clicks look good: check the next steps of the journey with a task-based usability test or a [tree test](/calculators/tree-test) of the navigation.');
  next.push('Change one thing per task and rerun with new participants; compare versions side by side in one study to keep conditions equal.');
  const conf = confidenceFor(minN);
  const multi = clickV.some(({ t }) => t.task.im.length > 1);
  const unit = (k) => `${multi ? 'task version' : 'task'}${k > 1 ? 's' : ''}`;
  return {
    headline: clickV.length ? (failed.length ? `${failed.length} of ${clickV.length} first-click ${unit(clickV.length)} fell below 70% correct first clicks: ${failed.map(({ t, v }) => `task ${t.ti + 1}${vName(t, v)}`).join(', ')}.` : `All ${clickV.length} first-click ${unit(clickV.length)} reached 70% correct first clicks or more.`) : `${fiveT.length} 5-second test${fiveT.length > 1 ? 's' : ''} with ${an.n} participants.`,
    meaning,
    confidence: conf,
    confidenceNote: `The smallest group behind a result has ${minN} participants. Rule: high with 40 or more (a 95% interval of about ±15 points or narrower), medium with 20–39, low below 20. The 70% line is a rule of thumb, not a published norm.`,
    caveats: [
      'A first click on a static screenshot is not the whole task: hover states, scrolling and real content are missing.',
      'Targets you draw decide what counts as correct; a click just outside a target is counted as wrong, so draw them generously around the clickable area.',
      fiveT.length ? 'In a 5-second test, recall depends on the exposure and on the questions: ask open questions before leading ones.' : 'The intervals show how much the rate could vary between samples like this one; with small groups they are wide.',
    ],
    next: next.length > 3 ? [...next.slice(0, 2), next[next.length - 1]] : next,
    report: `In a first-click study with ${an.n} participants, ${clickV.length ? `first-click success ranged from ${pc(Math.min(...clickV.map(({ v }) => v.rate)))} to ${pc(Math.max(...clickV.map(({ v }) => v.rate)))} across ${clickV.length} task version${clickV.length > 1 ? 's' : ''}` : 'no click tasks were run'}${fiveT.length ? `; in the 5-second test${fiveT.length > 1 ? 's' : ''}, ${fiveT.map((t) => t.variants.filter((v) => v.n && t.task.kw?.length).map((v) => `${pc(v.kwAll.any.share)} recalled the key message`).join(', ')).filter(Boolean).join('; ') || 'answers are summarised by word frequency'}` : ''}.`,
  };
}

// ── Exports ──
export function clicksCsv(study, an) {
  const rows = [['participant', 'task', 'task_type', 'version', 'x', 'y', 'x_px', 'y_px', 'ms', 'hit_target', 'hotspot', 'answers', 'rating']];
  an.tasks.forEach((t) => t.variants.forEach((v) => {
    if (t.task.y === '5s') { v.atts.forEach((a) => rows.push([a.pid, t.ti + 1, '5s', String.fromCharCode(65 + v.vi), '', '', '', '', a.ms ?? '', '', '', (a.a || []).join(' || '), a.g ?? ''])); return; }
    let j = 0;
    v.clicks.forEach((c) => {
      const lab = c.x != null ? v.hot.labels[j++] : null;
      rows.push([c.pid, t.ti + 1, 'click', String.fromCharCode(65 + v.vi), c.x ?? '', c.y ?? '', c.x != null ? Math.round(c.x * v.v.w) : '', c.y != null ? Math.round(c.y * v.v.h) : '', c.ms ?? '', c.hit >= 0 ? c.hit + 1 : c.x == null ? 'skipped' : 'no', lab == null ? '' : lab < 0 ? 'scattered' : lab + 1, '', '']);
    });
  }));
  return toCsv(rows);
}
export function markdownReport(study, an, summary) {
  const out = [`# ${study.n}: first-click and 5-second results`, '', `${an.n} participants, ${study.k.length} tasks.`, ''];
  an.tasks.forEach((t) => {
    out.push(`## Task ${t.ti + 1}: ${TASK_TYPES[t.task.y]}`, '', `> ${mdCell(t.task.q)}`, '');
    t.variants.forEach((v) => {
      if (t.task.im.length > 1) out.push(`### Version ${String.fromCharCode(65 + v.vi)}`, '');
      if (t.task.y === 'click') {
        out.push(`- First-click success: ${pc(v.rate)} (${v.succ}/${v.n}), 95% adjusted-Wald CI ${v.ci ? `${pc(v.ci.lo)}–${pc(v.ci.hi)}` : '—'}`);
        out.push(`- Time to first click (geometric mean): ${v.time ? `${v.time.geo.toFixed(1)} s${Number.isFinite(v.time.geoLo) ? ` (95% CI ${v.time.geoLo.toFixed(1)}–${v.time.geoHi.toFixed(1)} s)` : ''}` : '—'}`);
        v.targets.forEach((g) => out.push(`- Target ${g.k + 1}: ${pc(g.share)} of clicks`));
        v.hot.spots.forEach((s, i) => out.push(`- Hotspot ${i + 1} at (${pc(s.x)}, ${pc(s.y)}): ${pc(s.share)} of clicks, ${s.target >= 0 ? `on target ${s.target + 1}` : 'off target'}`));
        if (v.hot.scattered) out.push(`- Scattered clicks: ${v.hot.scattered}`);
      } else {
        v.qs.forEach((q) => out.push(`- ${mdCell(q.q)}: ${q.answers.length} answers; top words ${q.words.slice(0, 8).map((w) => `${w.word} (${w.n})`).join(', ') || '—'}`));
        if (t.task.kw?.length) out.push(`- Mentioned a keyword (${t.task.kw.join(', ')}): ${pc(v.kwAll.any.share)} (${v.kwAll.any.x}/${v.kwAll.any.n}); ${v.kwAll.each.map((k) => `${k.kw} ${pc(k.share)}`).join(', ')}`);
        if (v.rating) out.push(`- ${mdCell(t.task.rt)}: mean ${v.rating.mean.toFixed(2)} of 5 (n = ${v.rating.n})`);
      }
      out.push('');
    });
  });
  if (summary) out.push('## Reading the results', '', `**${summary.headline}**`, '', ...summary.meaning.map((m) => `- ${m}`), '', '### What to do next', '', ...summary.next.map((m) => `- ${m.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')}`), '', '### For the report', '', `> ${summary.report}`);
  return out.join('\n');
}

// ── Example: a fictional invoicing product's home page, drawn as SVG ──
export const EX_W = 1200, EX_H = 800;
// Layout boxes in pixels, shared by the drawing and the targets.
export const EX_BOX = {
  logo: [40, 22, 170, 40], features: [520, 28, 100, 30], pricing: [640, 28, 90, 30], customers: [750, 28, 120, 30], help: [890, 28, 70, 30],
  signin: [980, 24, 80, 36], trial: [1075, 20, 100, 44], cta: [80, 380, 230, 60], plans: [330, 380, 170, 60],
  footHelp: [860, 740, 130, 28], footContact: [1010, 740, 110, 28], footAbout: [700, 740, 130, 28],
};
const box = (k) => [EX_BOX[k][0] / EX_W, EX_BOX[k][1] / EX_H, EX_BOX[k][2] / EX_W, EX_BOX[k][3] / EX_H].map(round4);
export function exampleSvg(name) {
  const B = EX_BOX;
  const txt = (k, s, o = {}) => { const [x, y, w, h] = B[k]; return `<text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="${o.size || 17}" font-weight="${o.weight || 500}" fill="${o.fill || '#2b3236'}">${s}</text>`; };
  const helpInHeader = name !== 'homeB';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EX_W}" height="${EX_H}" viewBox="0 0 ${EX_W} ${EX_H}" font-family="Helvetica, Arial, sans-serif">
<rect width="${EX_W}" height="${EX_H}" fill="#ffffff"/>
<rect width="${EX_W}" height="84" fill="#f4f6f8"/><line x1="0" y1="84" x2="${EX_W}" y2="84" stroke="#dfe3e6"/>
<rect x="40" y="26" width="32" height="32" rx="6" fill="#1f6feb"/><text x="84" y="50" font-size="24" font-weight="700" fill="#14181b">Ledgerly</text>
${txt('features', 'Features')}${txt('pricing', 'Pricing')}${txt('customers', 'Customers')}${helpInHeader ? txt('help', 'Help') : ''}
${txt('signin', 'Sign in')}<rect x="${B.trial[0]}" y="${B.trial[1]}" width="${B.trial[2]}" height="${B.trial[3]}" rx="6" fill="#1f6feb"/>${txt('trial', 'Try free', { fill: '#ffffff', weight: 700 })}
<text x="80" y="210" font-size="52" font-weight="800" fill="#14181b">Invoices that chase</text><text x="80" y="272" font-size="52" font-weight="800" fill="#14181b">themselves.</text>
<text x="80" y="330" font-size="21" fill="#4a555c">Send invoices, take card payments and reconcile your books in one place.</text>
<rect x="${B.cta[0]}" y="${B.cta[1]}" width="${B.cta[2]}" height="${B.cta[3]}" rx="8" fill="#1f6feb"/>${txt('cta', 'Start your free trial', { fill: '#ffffff', weight: 700, size: 19 })}
<rect x="${B.plans[0]}" y="${B.plans[1]}" width="${B.plans[2]}" height="${B.plans[3]}" rx="8" fill="#ffffff" stroke="#1f6feb" stroke-width="2"/>${txt('plans', 'See plans', { fill: '#1f6feb', weight: 700, size: 19 })}
<rect x="700" y="130" width="440" height="330" rx="14" fill="#eef3fb"/><rect x="740" y="170" width="360" height="40" rx="6" fill="#ffffff"/><rect x="740" y="230" width="250" height="20" rx="4" fill="#cdd8ea"/><rect x="740" y="265" width="300" height="20" rx="4" fill="#cdd8ea"/><rect x="740" y="300" width="200" height="20" rx="4" fill="#cdd8ea"/><rect x="740" y="380" width="140" height="44" rx="6" fill="#2b9a5e"/><text x="810" y="408" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">Paid</text>
${[['Get paid faster', 'Card and bank payments on every invoice.'], ['Automatic reminders', 'Polite nudges until the bill is paid.'], ['Books that balance', 'Payments matched to invoices for you.']].map(([h, s], i) => `<rect x="${80 + i * 360}" y="520" width="320" height="150" rx="10" fill="#f8f9fa" stroke="#e1e5e8"/><text x="${104 + i * 360}" y="566" font-size="21" font-weight="700" fill="#14181b">${h}</text><text x="${104 + i * 360}" y="602" font-size="16" fill="#4a555c">${s}</text>`).join('')}
<rect y="720" width="${EX_W}" height="80" fill="#14181b"/>${txt('footAbout', 'About us', { fill: '#cdd3d7', size: 16 })}${txt('footHelp', 'Help centre', { fill: '#cdd3d7', size: 16 })}${txt('footContact', 'Contact', { fill: '#cdd3d7', size: 16 })}
<text x="80" y="760" font-size="15" fill="#98a2a8">© Ledgerly (fictional example)</text>
</svg>`;
}
export const exampleSrc = (name) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exampleSvg(name))}`;

export function exampleStudy() {
  return makeStudy({
    id: 'fcexample', name: 'Invoicing home page (example)', mode: 'local', randomise: false,
    tasks: [
      { y: 'click', q: 'You run a small design studio and want to know how much Ledgerly costs for a team of five. Where would you click first?', im: [{ u: 'ex:homeA', w: EX_W, h: EX_H, r: [box('pricing'), box('plans')] }] },
      { y: 'click', q: "You can't sign in and want to reset your password. Where would you click first?", im: [{ u: 'ex:homeA', w: EX_W, h: EX_H, r: [box('help'), box('signin')] }, { u: 'ex:homeB', w: EX_W, h: EX_H, r: [box('footHelp'), box('signin')] }] },
      { y: '5s', q: "You'll see a web page for 5 seconds. Look at it as you would normally; then answer a few questions.", s: 5, qs: ['What does this company offer?', 'What would you do first on this page?'], rt: 'How clear was the purpose of the page? (1 = not at all, 5 = very clear)', kw: ['invoice', 'invoicing', 'payment', 'accounting', 'billing', 'paid'], im: [{ u: 'ex:homeA', w: EX_W, h: EX_H, r: [] }] },
    ],
  });
}
// Simulated participants: clicks drawn around hotspots (Gaussian, in pixels), times log-normal.
export function exampleResults(study = exampleStudy()) {
  const rnd = seeded(5);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const centre = (k) => [EX_BOX[k][0] + EX_BOX[k][2] / 2, EX_BOX[k][1] + EX_BOX[k][3] / 2];
  const pickFrom = (spec) => { let r = rnd(), acc = 0; for (const [k, w] of spec) { acc += w; if (r < acc) return k; } return spec[spec.length - 1][0]; };
  const click = (spec, sd = 14) => { const k = pickFrom(spec); if (k === 'skip') return { x: null, y: null }; const [cx, cy] = k === 'hero' ? [300 + rnd() * 300, 200 + rnd() * 120] : k === 'cards' ? [120 + rnd() * 960, 560 + rnd() * 80] : centre(k); return { x: round4(Math.min(1, Math.max(0, (cx + gauss() * sd) / EX_W))), y: round4(Math.min(1, Math.max(0, (cy + gauss() * sd * 0.6) / EX_H))) }; };
  const ms = (geo) => Math.round(geo * Math.exp(gauss() * 0.45) * 1000);
  const A1 = ['Billing is easy', 'Invoicing software for small businesses', 'Sending invoices and getting paid', 'Some kind of accounting tool', 'Invoices that chase themselves', 'Payments and invoices', 'Not sure, a finance app?', 'Software to send invoices and take card payments', 'Bookkeeping', 'An invoicing app', 'Online invoicing and payment reminders', 'Something about getting paid faster', 'Accounting software', 'A tool that chases unpaid bills', 'Banking?', 'Invoice reminders', 'I think invoicing', 'Card payments for small shops', 'Money management for freelancers', 'Invoicing and accounting', 'A payments company', 'Getting paid on time', 'Invoices', 'No idea, it was too quick'];
  const A2 = ['Start the free trial', 'Look at pricing', 'Try it free', 'See plans', 'Read more about features', 'Click the blue button', 'Free trial', 'Check the price', 'Sign up', 'Scroll down to see more', 'Start trial', 'Look at the plans'];
  const out = [];
  for (let p = 0; p < 24; p++) {
    const k = [];
    const c1 = click([['pricing', 0.55], ['plans', 0.2], ['features', 0.1], ['cta', 0.09], ['customers', 0.03], ['skip', 0.03]]);
    k.push({ t: 0, i: 0, ...c1, ms: ms(3.4) });
    const vi = p % 2;
    const c2 = vi === 0 ? click([['help', 0.5], ['signin', 0.32], ['footHelp', 0.06], ['customers', 0.04], ['footContact', 0.04], ['skip', 0.04]]) : click([['signin', 0.42], ['footHelp', 0.16], ['footContact', 0.18], ['features', 0.1], ['hero', 0.08], ['skip', 0.06]]);
    k.push({ t: 1, i: vi, ...c2, ms: ms(vi === 0 ? 4.1 : 6.3) });
    const g = Math.max(1, Math.min(5, Math.round(3.9 + gauss() * 0.9)));
    k.push({ t: 2, i: 0, x: null, y: null, ms: 5000, a: [A1[p % A1.length], A2[(p * 5) % A2.length]], g });
    out.push({ v: 1, t: 'fcr', s: study.id, p: `P${p + 1}`, d: Date.UTC(2026, 9, 1 + (p % 20)), k });
  }
  return out;
}

// ── Images kept in this browser (moderated mode) ──
// IndexedDB when available, with an in-memory fallback for this tab. Every access is wrapped: storage can be blocked
// (private windows, strict settings), and then images live only until the page is closed.
const MEM = new Map();
const DB = 'uxatlas-studytools', STORE = 'images';
function openDb() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch { /* exists */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
export async function putImage(key, dataUrl) {
  MEM.set(key, dataUrl);
  try {
    const db = await openDb(); if (!db) return 'memory';
    return await new Promise((resolve) => {
      try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(dataUrl, key); tx.oncomplete = () => resolve('indexeddb'); tx.onerror = () => resolve('memory'); } catch { resolve('memory'); }
    });
  } catch { return 'memory'; }
}
export async function getImage(key) {
  if (MEM.has(key)) return MEM.get(key);
  try {
    const db = await openDb(); if (!db) return null;
    return await new Promise((resolve) => {
      try { const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key); req.onsuccess = () => { if (req.result) MEM.set(key, req.result); resolve(req.result || null); }; req.onerror = () => resolve(null); } catch { resolve(null); }
    });
  } catch { return null; }
}
// Resolve an image reference to something an <img> can show (or null if it is not available here).
export async function resolveImage(ref) {
  const u = String(ref || '');
  if (u.startsWith('ex:')) return exampleSrc(u.slice(3));
  if (u.startsWith('idb:')) return getImage(u.slice(4));
  if (isUrl(u)) return u;
  return null;
}
