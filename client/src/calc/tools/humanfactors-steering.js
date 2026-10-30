// Steering law (Accot and Zhai 1997) and Model Human Processor estimates (Card, Moran and Newell 1983).
// Pure functions, no React.
import { ols, sig, fmt, nonEmptyLines, splitCells } from './humanfactors-core.js';

// ── Index of difficulty for a tunnel ──
// Steering law: T = a + b × ID, ID = ∫ ds / W(s) along the path (Accot and Zhai 1997, CHI '97, 295–302).
//   straight tunnel of length A and constant width W:     ID = A / W
//   linearly narrowing tunnel, width W1 → W2 over A:     ID = A × ln(W1/W2) / (W1 − W2)   (→ A/W when W1 = W2)
//   circular tunnel of radius R and width W:              ID = 2πR / W
export function steeringId({ shape = 'straight', A, W, W2, R }) {
  if (shape === 'circle') return (2 * Math.PI * R) / W;
  if (shape === 'narrowing') return Math.abs(W - W2) < 1e-12 ? A / W : (A * Math.log(W / W2)) / (W - W2);
  return A / W;
}
// Rows: "label, A, W, T" (straight), "label, ID, T" or "A, W, T" / "ID, T". T in milliseconds.
export function parseSteeringData(text) {
  const errors = [], rows = [];
  for (const line of nonEmptyLines(text)) {
    const cells = splitCells(line);
    const nums = cells.map(Number);
    if (cells.every((c) => !Number.isFinite(Number(c)) || c === '')) continue; // header
    const label = Number.isFinite(nums[0]) ? '' : cells[0];
    const v = Number.isFinite(nums[0]) ? nums : nums.slice(1);
    if (v.length === 3 && v.every(Number.isFinite) && v[1] > 0) rows.push({ label, A: v[0], W: v[1], ID: v[0] / v[1], T: v[2] });
    else if (v.length === 2 && v.every(Number.isFinite)) rows.push({ label, ID: v[0], T: v[1] });
    else errors.push(`Could not read "${line}": give A, W and T (or ID and T), separated by commas.`);
  }
  return { rows, errors };
}
export function fitSteering(rows, conf = 0.95) {
  const f = ols(rows.map((r) => r.ID), rows.map((r) => r.T), conf);
  return { ...f, ip: 1000 / f.b };
}
export function steeringSummary(f, rows, unitLen) {
  // Confidence rule: high when there are at least 8 distinct ID conditions spanning a factor of 3 and R² ≥ 0.9;
  // medium when there are at least 4 conditions and R² ≥ 0.8; low otherwise or when the slope interval includes 0.
  const ids = [...new Set(rows.map((r) => r.ID))];
  const span = Math.max(...ids) / Math.min(...ids);
  const confidence = f.bLo <= 0 ? 'low' : ids.length >= 8 && span >= 3 && f.r2 >= 0.9 ? 'high' : ids.length >= 4 && f.r2 >= 0.8 ? 'medium' : 'low';
  const headline = `Steering time = ${fmt(f.a, 0)} + ${sig(f.b, 3)} × A/W ms (R² = ${sig(f.r2, 3)}, ${f.n} points).`;
  const meaning = [
    `Each extra unit of A/W (for example a tunnel one width longer) adds ${sig(f.b, 3)} ms; 95% CI ${sig(f.bLo, 3)} to ${sig(f.bHi, 3)} ms.`,
    `The intercept ${fmt(f.a, 0)} ms (95% CI ${fmt(f.aLo, 0)} to ${fmt(f.aHi, 0)}) is the fixed cost of starting and stopping the movement.`,
    `Steering throughput 1/b is ${sig(f.ip, 3)} units of A/W per second. Doubling the width of a tunnel halves its index, so widening a submenu path or slider track is the strongest lever.`,
  ];
  if (f.r2 < 0.8) meaning.push('The fit is loose (R² below 0.8). Check for practice effects, errors left in the times, or paths that are not steering tasks (for example a short hop that is really a Fitts pointing task).');
  const caveats = ['A and W must be in the same unit; only their ratio matters. The fitted a and b apply to this device, grip and population only.', 'Use error-free trials, or trials where the cursor stayed in the tunnel; leaving the tunnel is an error, not a fast trial.'];
  const next = ['For cascading menus, add the steering time through the parent item to a [Fitts\' law](/calculators/fitts) pointing time for the final target.', 'Estimate the decision before the movement with [Hick-Hyman](/calculators/hick) and whole-task times with the [KLM](/calculators/klm).'];
  const report = `A steering-law fit (Accot and Zhai 1997) over ${f.n} observations gave T = ${fmt(f.a, 0)} + ${sig(f.b, 3)} × ID ms (b 95% CI ${sig(f.bLo, 3)} to ${sig(f.bHi, 3)}; R² = ${sig(f.r2, 3)}), with ID = A/W${unitLen ? ` in ${unitLen}` : ''}.`;
  return { headline, meaning, confidence, confidenceNote: 'High with at least 8 distinct tunnel conditions spanning a threefold range of A/W and R² ≥ 0.9; medium with at least 4 conditions and R² ≥ 0.8; low otherwise or when the slope interval includes zero.', caveats, next, report };
}

// ── Model Human Processor ── Card, Moran and Newell (1983), The Psychology of Human-Computer Interaction, ch. 2.
// Typical value [Fastman, Slowman] in ms.
export const MHP = {
  P: { name: 'Perceptual processor cycle (τP)', t: 100, lo: 50, hi: 200 },
  C: { name: 'Cognitive processor cycle (τC)', t: 70, lo: 25, hi: 170 },
  M: { name: 'Motor processor cycle (τM)', t: 70, lo: 30, hi: 100 },
  E: { name: 'Eye movement (saccade + fixation)', t: 230, lo: 70, hi: 700 },
};
// Fitts' law slope in MHP terms: I_M = 100 [70–120] ms/bit; CMN apply it to log2(D/S + 0.5) bits. Enter the bits.
export const IM = { t: 100, lo: 70, hi: 120 };
export const MHP_PRESETS = [
  ['P C M', 'Simple reaction: press a key when a light appears (240 [105–470] ms)'],
  ['P C C M', 'Physical match: are two letters the same shape? (310 [130–640] ms)'],
  ['P C C C M', 'Name match: same letter name, e.g. A and a (380 [155–810] ms)'],
  ['P C C C C M', 'Class match: both vowels? (450 [180–980] ms)'],
];
// Sequence syntax: operator letters with optional counts ("P 3C M", "2E"), and "F<bits>" for a Fitts move
// (e.g. F3.5 = 3.5 bits × I_M).
export function parseMhp(text) {
  const steps = [], errors = [];
  for (const tok of String(text || '').split(/[\s,;+]+/).filter(Boolean)) {
    const f = /^F(\d+(?:\.\d+)?)$/i.exec(tok);
    if (f) { steps.push({ op: 'F', n: Number(f[1]) }); continue; }
    const m = /^(\d*)\s*([PCME])$/i.exec(tok);
    if (!m) { errors.push(`"${tok}" is not an operator (P, C, M, E, or F followed by bits).`); continue; }
    steps.push({ op: m[2].toUpperCase(), n: m[1] ? Number(m[1]) : 1 });
  }
  return { steps, errors };
}
export function mhpTotal(steps) {
  const tot = { t: 0, lo: 0, hi: 0 }, counts = { P: 0, C: 0, M: 0, E: 0, F: 0 };
  for (const s of steps) {
    const p = s.op === 'F' ? IM : MHP[s.op];
    tot.t += s.n * p.t; tot.lo += s.n * p.lo; tot.hi += s.n * p.hi; counts[s.op] += s.n;
  }
  return { ...tot, counts };
}
// Confidence rule (MHP): never high — these are textbook parameter values for an idealised user; medium when the
// sequence has at most 6 cycles (close to the reaction-time tasks the parameters came from); low for longer chains,
// where the ranges compound and real users overlap, chunk or skip steps.
export function mhpSummary(steps, r) {
  const cycles = r.counts.P + r.counts.C + r.counts.M + r.counts.E + (r.counts.F ? 1 : 0);
  const confidence = cycles <= 6 ? 'medium' : 'low';
  const headline = `The Model Human Processor predicts about ${fmt(r.t, 0)} ms for this sequence (Fastman ${fmt(r.lo, 0)} ms to Slowman ${fmt(r.hi, 0)} ms).`;
  const parts = Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => (k === 'F' ? `${sig(n, 3)} bits of aimed movement` : `${n} ${MHP[k].name.split(' (')[0].toLowerCase()}${n > 1 ? 's' : ''}`));
  const meaning = [
    `The sequence has ${parts.join(', ')}.`,
    `The range is wide (×${sig(r.hi / r.lo, 2)} from fastest to slowest) because each cycle time varies across people; it is a band, not a confidence interval.`,
  ];
  const caveats = ['MHP sums serial cycles. Practised users overlap perception and action, so long sequences usually run faster than the sum.', 'Use it to compare designs that differ in the number of cognitive steps, not to promise an absolute time.'];
  const next = ['Model whole tasks with the [KLM](/calculators/klm), pointing with [Fitts\' law](/calculators/fitts) and choices with [Hick-Hyman](/calculators/hick).', 'Check the prediction with a quick timed test of 5 to 10 users.'];
  const report = `Using Model Human Processor parameters (Card, Moran and Newell 1983), the sequence ${steps.map((s) => (s.op === 'F' ? `F${s.n}` : `${s.n > 1 ? s.n : ''}${s.op}`)).join(' ')} was estimated at ${fmt(r.t, 0)} ms (range ${fmt(r.lo, 0)}–${fmt(r.hi, 0)} ms).`;
  return { headline, meaning, confidence, confidenceNote: 'Never high: the processor times are textbook values for an idealised user. Medium for short sequences of up to 6 cycles, close to the reaction-time tasks the parameters came from; low for longer chains, where real users overlap or skip steps.', caveats, next, report };
}

// Example steering data: a simulated straight-tunnel experiment (8 A/W conditions from 5 to 40, 3 blocks each, each
// time the mean of 12 participants), times in ms. Illustrative values, not from Accot and Zhai's paper.
export const EXAMPLE_DATA = `A (px), W (px), T (ms)
200, 40, 467
200, 40, 530
200, 40, 554
200, 20, 728
200, 20, 692
200, 20, 747
450, 30, 1008
450, 30, 1038
450, 30, 926
400, 20, 1152
400, 20, 1257
400, 20, 1245
500, 20, 1542
500, 20, 1511
500, 20, 1449
600, 20, 1673
600, 20, 1847
600, 20, 1672
350, 10, 1873
350, 10, 1850
350, 10, 1931
800, 20, 2170
800, 20, 2136
800, 20, 2156`;
export const EXAMPLE_DESIGNS = `Cascading menu, 160 px item 24 px tall, 160, 24
Same menu with 40 px items, 160, 40
Volume slider track 300 × 12 px, 300, 12
Swipe-to-unlock channel 260 × 60 px, 260, 60`;
export function parseDesigns(text) {
  const out = [];
  for (const line of nonEmptyLines(text)) {
    const c = splitCells(line);
    if (c.length < 3) continue;
    const W = Number(c[c.length - 1]), A = Number(c[c.length - 2]);
    if (Number.isFinite(A) && Number.isFinite(W) && W > 0) out.push({ label: c.slice(0, -2).join(', ') || `${A} × ${W}`, A, W, ID: A / W });
  }
  return out;
}
