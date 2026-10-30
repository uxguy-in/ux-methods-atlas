// Ergonomics scoring: NIOSH revised lifting equation, RULA, REBA, anthropometric accommodation, Borg CR10 and RPE,
// the Cooper-Harper decision tree and a simple conjoint-scaled SWAT. Pure functions, no React.
import { normCdf, normInv, tInv, mean, sd, median, sig, fmt } from './humanfactors-core.js';

// ════════ NIOSH revised lifting equation ════════
// Waters, Putz-Anderson, Garg and Fine (1993), "Revised NIOSH equation for the design and evaluation of manual
// lifting tasks", Ergonomics 36(7), 749–776; Waters, Putz-Anderson and Garg (1994), Applications Manual for the
// Revised NIOSH Lifting Equation, DHHS (NIOSH) Publication 94-110.
// RWL = LC × HM × VM × DM × AM × FM × CM; LI = load / RWL.
export const NIOSH_UNITS = {
  metric: { LC: 23, unitW: 'kg', unitL: 'cm', Hmin: 25, Hmax: 63, HM: (h) => 25 / h, Vmax: 175, V0: 75, vk: 0.003, Dmin: 25, Dmax: 175, dk: 4.5 },
  us: { LC: 51, unitW: 'lb', unitL: 'in', Hmin: 10, Hmax: 25, HM: (h) => 10 / h, Vmax: 70, V0: 30, vk: 0.0075, Dmin: 10, Dmax: 70, dk: 1.8 },
};
// Frequency multiplier, Table 5 of the Applications Manual. Columns: work duration ≤1 h, >1–2 h, >2–8 h, each for
// V < 75 cm (30 in) and V ≥ 75 cm. Lifting less than once per 5 minutes uses F = 0.2.
export const FM_FREQ = [0.2, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const FM_TABLE = [
  [1.00, 1.00, 0.95, 0.95, 0.85, 0.85],
  [0.97, 0.97, 0.92, 0.92, 0.81, 0.81],
  [0.94, 0.94, 0.88, 0.88, 0.75, 0.75],
  [0.91, 0.91, 0.84, 0.84, 0.65, 0.65],
  [0.88, 0.88, 0.79, 0.79, 0.55, 0.55],
  [0.84, 0.84, 0.72, 0.72, 0.45, 0.45],
  [0.80, 0.80, 0.60, 0.60, 0.35, 0.35],
  [0.75, 0.75, 0.50, 0.50, 0.27, 0.27],
  [0.70, 0.70, 0.42, 0.42, 0.22, 0.22],
  [0.60, 0.60, 0.35, 0.35, 0.18, 0.18],
  [0.52, 0.52, 0.30, 0.30, 0.00, 0.15],
  [0.45, 0.45, 0.26, 0.26, 0.00, 0.13],
  [0.41, 0.41, 0.00, 0.23, 0.00, 0.00],
  [0.37, 0.37, 0.00, 0.21, 0.00, 0.00],
  [0.00, 0.34, 0.00, 0.00, 0.00, 0.00],
  [0.00, 0.31, 0.00, 0.00, 0.00, 0.00],
  [0.00, 0.28, 0.00, 0.00, 0.00, 0.00],
];
export const DURATIONS = [['1', '≤ 1 hour'], ['2', '1 to 2 hours'], ['8', '2 to 8 hours']];
// Frequencies between table rows are interpolated linearly; above 15 lifts/min FM = 0.
export function frequencyMultiplier(F, duration, high) {
  const col = { 1: 0, 2: 2, 8: 4 }[duration] + (high ? 1 : 0);
  const f = Math.max(0.2, F);
  if (f > 15) return { fm: 0, interpolated: false };
  const j = FM_FREQ.findIndex((x) => x >= f);
  if (FM_FREQ[j] === f) return { fm: FM_TABLE[j][col], interpolated: false };
  const f0 = FM_FREQ[j - 1], f1 = FM_FREQ[j], m0 = FM_TABLE[j - 1][col], m1 = FM_TABLE[j][col];
  return { fm: m0 + ((f - f0) / (f1 - f0)) * (m1 - m0), interpolated: true };
}
// Coupling multiplier, Table 7: good 1.00; fair 0.95 when V < 75 cm (30 in), else 1.00; poor 0.90.
export const couplingMultiplier = (c, high) => (c === 'good' ? 1 : c === 'fair' ? (high ? 1 : 0.95) : 0.9);

// One end of the lift (origin or destination). round2 reproduces the manual's practice of rounding each multiplier
// to two decimals before multiplying.
export function nioshPoint({ units = 'metric', H, V, D, A, F, duration = '1', coupling = 'good' }, round2 = false) {
  const u = NIOSH_UNITS[units];
  const r = (x) => (round2 ? Math.round(x * 100 + 1e-9) / 100 : x);
  const HM = r(H <= u.Hmin ? 1 : H > u.Hmax ? 0 : u.HM(H));
  const VM = r(V < 0 || V > u.Vmax ? 0 : 1 - u.vk * Math.abs(V - u.V0));
  const DM = r(D < u.Dmin ? 1 : D > u.Dmax ? 0 : 0.82 + u.dk / D);
  const AM = r(A > 135 ? 0 : 1 - 0.0032 * A);
  const high = V >= u.V0;
  const { fm, interpolated } = frequencyMultiplier(F, duration, high);
  const FM = r(fm);
  const CM = couplingMultiplier(coupling, high);
  const FIRWL = u.LC * HM * VM * DM * AM * CM;
  const RWL = FIRWL * FM;
  const outOfRange = [];
  if (H > u.Hmax) outOfRange.push(`H above ${u.Hmax} ${u.unitL} (HM = 0)`);
  if (V > u.Vmax) outOfRange.push(`V above ${u.Vmax} ${u.unitL} (VM = 0)`);
  if (D > u.Dmax) outOfRange.push(`D above ${u.Dmax} ${u.unitL} (DM = 0)`);
  if (A > 135) outOfRange.push('A above 135° (AM = 0)');
  if (F > 15 || fm === 0) outOfRange.push('frequency beyond the table for this duration (FM = 0)');
  return { LC: u.LC, HM, VM, DM, AM, FM, CM, FIRWL, RWL, interpolated, outOfRange };
}
export function niosh(input, round2 = false) {
  const { load, Hd, Vd, control } = input;
  const o = nioshPoint(input, round2);
  const res = { origin: { ...o, LI: load / o.RWL, FILI: load / o.FIRWL } };
  if (control) {
    const d = nioshPoint({ ...input, H: Hd, V: Vd }, round2);
    res.destination = { ...d, LI: load / d.RWL, FILI: load / d.FIRWL };
  }
  const gov = res.destination && res.destination.RWL < res.origin.RWL ? 'destination' : 'origin';
  return { ...res, governing: gov, RWL: res[gov].RWL, LI: res[gov].LI, FILI: res[gov].FILI, load, units: input.units || 'metric' };
}
export const liBand = (li) => (!Number.isFinite(li) ? 'bad' : li <= 1 ? 'ok' : li <= 3 ? 'warn' : 'bad');
// Confidence rule (NIOSH): medium when every input is inside the equation's ranges and FM came straight from the
// table; low when a multiplier hit 0 (outside the equation's range) or FM was interpolated. Never high: the equation
// is a screening tool for populations, not a prediction for one worker.
export function nioshSummary(r) {
  const u = NIOSH_UNITS[r.units];
  const g = r[r.governing];
  const issues = [...r.origin.outOfRange, ...(r.destination?.outOfRange || [])];
  const interp = r.origin.interpolated || r.destination?.interpolated;
  const confidence = issues.length || interp || !Number.isFinite(r.LI) ? 'low' : 'medium';
  const mults = ['HM', 'VM', 'DM', 'AM', 'FM', 'CM'].map((k) => [k, g[k]]).sort((a, b) => a[1] - b[1]);
  const names = { HM: 'horizontal distance', VM: 'vertical height', DM: 'travel distance', AM: 'twisting (asymmetry)', FM: 'lifting frequency', CM: 'grip (coupling)' };
  const liText = Number.isFinite(r.LI) ? r.LI.toFixed(2) : 'infinite (RWL is 0)';
  const headline = `The recommended weight limit is ${fmt(r.RWL, 1)} ${u.unitW}, so lifting ${fmt(r.load, 1)} ${u.unitW} gives a lifting index of ${liText}${r.LI <= 1 ? ': within the NIOSH limit' : r.LI <= 3 ? ': above the limit, with increased risk for some workers' : ': far above the limit'}.`;
  const meaning = [
    r.destination ? `The ${r.governing} of the lift governs (RWL ${fmt(r.origin.RWL, 1)} ${u.unitW} at the origin, ${fmt(r.destination.RWL, 1)} ${u.unitW} at the destination).` : 'Only the origin was assessed; if the load has to be placed carefully, tick significant control at the destination.',
    `The biggest reduction comes from ${names[mults[0][0]]} (${mults[0][0]} = ${sig(mults[0][1], 3)}), then ${names[mults[1][0]]} (${mults[1][0]} = ${sig(mults[1][1], 3)}). Improving the smallest multiplier raises the limit most.`,
    Number.isFinite(r.FILI) && g.FM < 1 ? `Ignoring frequency, the lift alone has a lifting index of ${sig(r.FILI, 3)}; ${r.FILI > 1 ? 'even a single lift is above the limit' : 'it is the repetition that pushes the index up'}.` : 'Frequency does not reduce the limit for this task.',
    'Waters et al. (1994): LI ≤ 1 protects nearly all healthy workers; above 1 the risk of low-back pain rises for some workers; above 3 many workers are at elevated risk.',
  ];
  if (issues.length) meaning.push(`Outside the equation's range: ${issues.join('; ')}.`);
  const caveats = [
    'The equation does not cover one-handed, seated or kneeling lifts, lifts in confined spaces, unstable loads, carrying or pushing, or shifts over 8 hours.',
    interp ? 'The frequency multiplier was interpolated between rows of the NIOSH table; round the frequency up to the next whole lift per minute for a more protective figure.' : 'Measure H and V at the hands, at both ends of the lift, rather than estimating from the drawing.',
  ];
  const next = [
    `Redesign to raise the smallest multiplier: ${({ HM: 'bring the load closer to the body', VM: 'raise or lower the shelf towards knuckle height', DM: 'shorten the vertical travel', AM: 'remove the need to twist', FM: 'reduce lifts per minute or add recovery time', CM: 'add handles or cut-outs' })[mults[0][0]]}.`,
    'Re-score posture with RULA or REBA (in this tool) and ask workers for a Borg rating after the task.',
  ];
  const report = `Using the revised NIOSH lifting equation (Waters et al. 1993), the recommended weight limit was ${fmt(r.RWL, 1)} ${u.unitW} (governed by the ${r.governing}; HM ${sig(g.HM, 3)}, VM ${sig(g.VM, 3)}, DM ${sig(g.DM, 3)}, AM ${sig(g.AM, 3)}, FM ${sig(g.FM, 3)}, CM ${sig(g.CM, 3)}), giving a lifting index of ${liText} for a ${fmt(r.load, 1)} ${u.unitW} load.`;
  return { headline, meaning, confidence, confidenceNote: 'Never high: the equation screens a task for a population and cannot predict injury for an individual. Medium when every measure is inside the equation\'s ranges and the frequency multiplier comes straight from the NIOSH table; low when a multiplier falls to 0 or is interpolated.', caveats, next, report };
}

// ════════ RULA ════════ McAtamney and Corlett (1993), Applied Ergonomics 24(2), 91–99.
// Table A: [upper arm 1–6][lower arm 1–3] → 8 columns (wrist 1–4 × wrist twist 1–2).
export const RULA_A = [
  [[1, 2, 2, 2, 2, 3, 3, 3], [2, 2, 2, 2, 3, 3, 3, 3], [2, 3, 3, 3, 3, 3, 4, 4]],
  [[2, 3, 3, 3, 3, 4, 4, 4], [3, 3, 3, 3, 3, 4, 4, 4], [3, 4, 4, 4, 4, 4, 5, 5]],
  [[3, 3, 4, 4, 4, 4, 5, 5], [3, 4, 4, 4, 4, 4, 5, 5], [4, 4, 4, 4, 4, 5, 5, 5]],
  [[4, 4, 4, 4, 4, 5, 5, 5], [4, 4, 4, 4, 4, 5, 5, 5], [4, 4, 4, 5, 5, 5, 6, 6]],
  [[5, 5, 5, 5, 5, 6, 6, 7], [5, 6, 6, 6, 6, 7, 7, 7], [6, 6, 6, 7, 7, 7, 7, 8]],
  [[7, 7, 7, 7, 7, 8, 8, 9], [8, 8, 8, 8, 8, 9, 9, 9], [9, 9, 9, 9, 9, 9, 9, 9]],
];
// Table B: [neck 1–6] → 12 columns (trunk 1–6 × legs 1–2).
export const RULA_B = [
  [1, 3, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7],
  [2, 3, 2, 3, 4, 5, 5, 5, 6, 7, 7, 7],
  [3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7],
  [5, 5, 5, 6, 6, 7, 7, 7, 7, 7, 8, 8],
  [7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8],
  [8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9],
];
// Table C: [score C 1–8+][score D 1–7+].
export const RULA_C = [
  [1, 2, 3, 3, 4, 5, 5], [2, 2, 3, 4, 4, 5, 5], [3, 3, 3, 4, 4, 5, 6], [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7], [4, 4, 5, 6, 6, 7, 7], [5, 5, 6, 6, 7, 7, 7], [5, 5, 6, 7, 7, 7, 7],
];
const cl = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function rula(x) {
  const ua = cl(x.upperArm + (x.shoulderRaised ? 1 : 0) + (x.abducted ? 1 : 0) - (x.armSupported ? 1 : 0), 1, 6);
  const la = cl(x.lowerArm + (x.across ? 1 : 0), 1, 3);
  const wr = cl(x.wrist + (x.wristDeviated ? 1 : 0), 1, 4);
  const tw = cl(x.wristTwist, 1, 2);
  const postureA = RULA_A[ua - 1][la - 1][(wr - 1) * 2 + (tw - 1)];
  const scoreC = postureA + (x.muscleA ? 1 : 0) + x.forceA;
  const neck = cl(x.neck + (x.neckTwist ? 1 : 0) + (x.neckSide ? 1 : 0), 1, 6);
  const trunk = cl(x.trunk + (x.trunkTwist ? 1 : 0) + (x.trunkSide ? 1 : 0), 1, 6);
  const legs = cl(x.legs, 1, 2);
  const postureB = RULA_B[neck - 1][(trunk - 1) * 2 + (legs - 1)];
  const scoreD = postureB + (x.muscleB ? 1 : 0) + x.forceB;
  const grand = RULA_C[Math.min(scoreC, 8) - 1][Math.min(scoreD, 7) - 1];
  const level = grand <= 2 ? 1 : grand <= 4 ? 2 : grand <= 6 ? 3 : 4;
  return { ua, la, wr, tw, postureA, scoreC, neck, trunk, legs, postureB, scoreD, grand, level, text: RULA_LEVELS[level - 1] };
}
export const RULA_LEVELS = ['Acceptable if not kept or repeated for long periods', 'Investigate further; changes may be needed', 'Investigate further and change soon', 'Investigate and change immediately'];

// ════════ REBA ════════ Hignett and McAtamney (2000), Applied Ergonomics 31(2), 201–205.
// Table A: [neck 1–3][trunk 1–5] → legs 1–4.
export const REBA_A = [
  [[1, 2, 3, 4], [2, 3, 4, 5], [2, 4, 5, 6], [3, 5, 6, 7], [4, 6, 7, 8]],
  [[1, 2, 3, 4], [3, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
  [[3, 3, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
];
// Table B: [lower arm 1–2][upper arm 1–6] → wrist 1–3.
export const REBA_B = [
  [[1, 2, 2], [1, 2, 3], [3, 4, 5], [4, 5, 5], [6, 7, 8], [7, 8, 8]],
  [[1, 2, 3], [2, 3, 4], [4, 5, 5], [5, 6, 7], [7, 8, 8], [8, 9, 9]],
];
// Table C: [score A 1–12][score B 1–12].
export const REBA_C = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];
export function reba(x) {
  const trunk = cl(x.trunk + (x.trunkTwist ? 1 : 0), 1, 5);
  const neck = cl(x.neck + (x.neckTwist ? 1 : 0), 1, 3);
  const legs = cl(x.legs + x.knees, 1, 4);
  const postureA = REBA_A[neck - 1][trunk - 1][legs - 1];
  const scoreA = postureA + x.load + (x.shock ? 1 : 0);
  const ua = cl(x.upperArm + (x.abducted ? 1 : 0) + (x.shoulderRaised ? 1 : 0) - (x.armSupported ? 1 : 0), 1, 6);
  const la = cl(x.lowerArm, 1, 2);
  const wr = cl(x.wrist + (x.wristTwist ? 1 : 0), 1, 3);
  const postureB = REBA_B[la - 1][ua - 1][wr - 1];
  const scoreB = postureB + x.coupling;
  const tableC = REBA_C[Math.min(scoreA, 12) - 1][Math.min(scoreB, 12) - 1];
  const activity = (x.static ? 1 : 0) + (x.repeated ? 1 : 0) + (x.rapid ? 1 : 0);
  const score = tableC + activity;
  const band = REBA_LEVELS.find(([max]) => score <= max);
  return { trunk, neck, legs, postureA, scoreA, ua, la, wr, postureB, scoreB, tableC, activity, score, risk: band[1], action: band[2] };
}
export const REBA_LEVELS = [[1, 'negligible', 'None necessary'], [3, 'low', 'May be necessary'], [7, 'medium', 'Necessary'], [10, 'high', 'Necessary soon'], [99, 'very high', 'Necessary now']];

// Confidence rule (RULA, REBA): never high, because the scores are ordinal screening tools from one observed
// posture with fair inter-rater reliability. Medium when the score is inside its action band (RULA grand score
// 1 or not on the 2/3, 4/5, 6/7 edges; REBA not on the 3/4, 7/8, 10/11 edges); low on an edge.
export function postureSummary(kind, r) {
  const isR = kind === 'rula';
  const edge = isR ? [2, 3, 4, 5, 6, 7].includes(r.grand) : [3, 4, 7, 8, 10, 11].includes(r.score);
  const confidence = edge ? 'low' : 'medium';
  const headline = isR
    ? `RULA grand score ${r.grand} (action level ${r.level}): ${r.text.toLowerCase()}.`
    : `REBA score ${r.score}: ${r.risk} risk; action ${r.action.toLowerCase()}.`;
  const meaning = isR ? [
    `Arm and wrist (group A) score ${r.scoreC}, from a posture score of ${r.postureA} (upper arm ${r.ua}, lower arm ${r.la}, wrist ${r.wr}, twist ${r.tw}) plus muscle use and force.`,
    `Neck, trunk and legs (group B) score ${r.scoreD}, from a posture score of ${r.postureB} (neck ${r.neck}, trunk ${r.trunk}, legs ${r.legs}).`,
    `${r.scoreC >= r.scoreD ? 'The arms and wrists' : 'The neck and trunk'} contribute more; start there. Action levels (McAtamney and Corlett 1993): 1–2 acceptable, 3–4 investigate, 5–6 change soon, 7 change now.`,
  ] : [
    `Trunk, neck and legs (score A) ${r.scoreA}: posture ${r.postureA} (trunk ${r.trunk}, neck ${r.neck}, legs ${r.legs}) plus load.`,
    `Arms and wrists (score B) ${r.scoreB}: posture ${r.postureB} (upper arm ${r.ua}, lower arm ${r.la}, wrist ${r.wr}) plus coupling.`,
    `Table C gives ${r.tableC}${r.activity ? `, and ${r.activity} activity point${r.activity > 1 ? 's' : ''} make ${r.score}` : ''}. Risk levels (Hignett and McAtamney 2000): 1 negligible, 2–3 low, 4–7 medium, 8–10 high, 11+ very high.`,
  ];
  const caveats = [
    'Score the worst or most frequent posture, and both sides of the body if they differ; one snapshot can miss the problem.',
    edge ? 'The score sits on the edge of an action band, so one body segment judged differently would change the advice. Have a second observer score it.' : 'Observers often disagree by one category on joint angles; use photos or video and measure angles where you can.',
  ];
  const next = [
    isR ? (r.scoreC >= r.scoreD ? 'Bring the work closer and lower to reduce upper-arm and wrist scores, then re-score.' : 'Raise the work or the screen to reduce neck and trunk flexion, then re-score.') : (r.scoreA >= r.scoreB ? 'Reduce trunk bending and awkward leg postures (work height, foot room), then re-score.' : 'Reduce reach and wrist deviation, and improve handles, then re-score.'),
    'For lifting, check the load with the NIOSH equation in this tool.',
  ];
  const report = isR
    ? `A RULA assessment (McAtamney and Corlett 1993) gave a grand score of ${r.grand} (action level ${r.level}; score C ${r.scoreC}, score D ${r.scoreD}).`
    : `A REBA assessment (Hignett and McAtamney 2000) gave a score of ${r.score} (${r.risk} risk; score A ${r.scoreA}, score B ${r.scoreB}, activity ${r.activity}).`;
  return { headline, meaning, confidence, confidenceNote: 'Never high: RULA and REBA are ordinal screening scores from one observed posture, and observers often differ by one category per body part. Medium when the score is well inside its action band; low when it sits on a band edge, where one changed judgement changes the advice.', caveats, next, report };
}

// ════════ Anthropometric accommodation ════════
// For a normally distributed body dimension with mean μ and SD σ, the percentile of a value x is Φ((x − μ)/σ).
// Design types: 'max' (clearance; users up to x fit: P(X ≤ x)), 'min' (reach; users of at least x: P(X ≥ x)),
// 'range' (adjustable from lo to hi: P(lo ≤ X ≤ hi)). A population of several groups is a weighted mixture.
export function accommodation({ groups, type, x, lo, hi }) {
  const wsum = groups.reduce((a, g) => a + g.w, 0);
  const per = groups.map((g) => {
    const z = (v) => (v - g.mean) / g.sd;
    const acc = type === 'max' ? normCdf(z(x)) : type === 'min' ? 1 - normCdf(z(x)) : normCdf(z(hi)) - normCdf(z(lo));
    const pctile = type === 'range' ? [normCdf(z(lo)), normCdf(z(hi))] : [normCdf(z(x))];
    return { ...g, acc, pctile, share: g.w / wsum };
  });
  const total = per.reduce((a, g) => a + g.share * g.acc, 0);
  return { per, total };
}
// Value of the dimension at percentile q in the mixture (bisection on the mixture cdf).
export function mixtureQuantile(groups, q) {
  const wsum = groups.reduce((a, g) => a + g.w, 0);
  const F = (v) => groups.reduce((a, g) => a + (g.w / wsum) * normCdf((v - g.mean) / g.sd), 0);
  let lo = Math.min(...groups.map((g) => g.mean - 10 * g.sd)), hi = Math.max(...groups.map((g) => g.mean + 10 * g.sd));
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (F(m) < q) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export const groupQuantile = (g, q) => g.mean + normInv(q) * g.sd;
// Design value(s) needed to accommodate a target share of the mixture.
export function designFor({ groups, type, target }) {
  if (type === 'max') return { x: mixtureQuantile(groups, target) };
  if (type === 'min') return { x: mixtureQuantile(groups, 1 - target) };
  const t = (1 - target) / 2;
  return { lo: mixtureQuantile(groups, t), hi: mixtureQuantile(groups, 1 - t) };
}
// Confidence rule (anthropometry): medium when the user gave a sample size of at least 100 per group (summary data
// from a real survey); low otherwise. Never high: real body dimensions are only approximately normal, and the tails
// (where 5th and 95th percentiles sit) are where the normal model is least reliable.
export function anthroSummary({ r, design, type, x, lo, hi, unit, dimension, target, groups }) {
  const confidence = groups.every((g) => g.n >= 100) ? 'medium' : 'low';
  const what = type === 'range' ? `an adjustment range of ${fmt(lo, 1)} to ${fmt(hi, 1)} ${unit}` : `a design value of ${fmt(x, 1)} ${unit}`;
  const headline = `${what[0].toUpperCase()}${what.slice(1)} for ${dimension} accommodates ${pc(r.total)} of the population.`;
  const meaning = r.per.map((g) => `${g.name}: ${pc(g.acc)} accommodated${type !== 'range' ? `; the design value is their ${ord(g.pctile[0])} percentile` : `; the range runs from their ${ord(g.pctile[0])} to ${ord(g.pctile[1])} percentile`}.`);
  meaning.push(type === 'range'
    ? `To accommodate ${pc(target)} you would need a range of ${fmt(design.lo, 1)} to ${fmt(design.hi, 1)} ${unit}.`
    : `To accommodate ${pc(target)} you would need ${fmt(design.x, 1)} ${unit} (${type === 'max' ? 'clearances must be at least the large users\' size' : 'reaches must be no more than the small users\' size'}).`);
  if (r.per.length > 1) meaning.push('Averaging across groups matters: designing to one group\'s 5th to 95th percentile excludes far more of the other group.');
  const caveats = [
    'Percentiles do not add: a person at the 95th percentile for stature is not at the 95th for every dimension. When several dimensions must fit at once, the share accommodated is lower than for any one of them.',
    'Add allowances for clothing, shoes, posture and movement (for example heavy gloves or a slumped seated posture) before comparing with the design value.',
  ];
  const next = ['Use measured data for your actual users (age, region, occupation) where you can; summary statistics for a different population can be badly off.', 'Check the design with a fitting trial using people from the extremes of the range.'];
  const report = `Assuming normally distributed ${dimension} (${groups.map((g) => `${g.name}: mean ${fmt(g.mean, 1)}, SD ${fmt(g.sd, 1)} ${unit}${g.n ? `, n = ${g.n}` : ''}`).join('; ')}${groups.length > 1 ? `, weighted ${groups.map((g) => `${Math.round((g.w / groups.reduce((a, b) => a + b.w, 0)) * 100)}%`).join('/')}` : ''}), ${what} accommodates ${pc(r.total)} of users.`;
  return { headline, meaning, confidence, confidenceNote: 'Never high: the normal model is least accurate in the tails, where design percentiles sit. Medium when the mean and SD come from a survey of at least 100 people per group (enter n); low otherwise.', caveats, next, report };
}
const pc = (x) => `${(x * 100).toFixed(x > 0.995 || x < 0.005 ? 2 : 1)}%`;
const ord = (q) => { const v = q * 100; const s = v < 1 || v > 99 ? v.toFixed(1) : Math.round(v).toString(); const n = Math.round(v) % 100; const suf = s.includes('.') ? 'th' : (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'); return `${s}${suf}`; };

// ════════ Borg scales ════════ Borg (1982), Med Sci Sports Exerc 14(5), 377–381; Borg (1998), Borg's Perceived
// Exertion and Pain Scales (Human Kinetics). Verbal anchors are the 1998 English wording.
export const BORG = {
  rpe: { min: 6, max: 20, name: 'Borg RPE (6–20)', anchors: [[6, 'No exertion at all'], [7, 'Extremely light'], [9, 'Very light'], [11, 'Light'], [13, 'Somewhat hard'], [15, 'Hard (heavy)'], [17, 'Very hard'], [19, 'Extremely hard'], [20, 'Maximal exertion']], high: 15 },
  cr10: { min: 0, max: 11, name: 'Borg CR10 (0–10)', anchors: [[0, 'Nothing at all'], [0.5, 'Extremely weak (just noticeable)'], [1, 'Very weak'], [2, 'Weak (light)'], [3, 'Moderate'], [5, 'Strong (heavy)'], [7, 'Very strong'], [10, 'Extremely strong (maximal)'], [11, 'Absolute maximum (above 10)']], high: 5 },
};
export const borgAnchor = (scale, v) => { const a = BORG[scale].anchors; let best = a[0]; for (const x of a) if (x[0] <= v + 1e-9) best = x; return best[1]; };
export function borg(scale, values, conf = 0.95) {
  const n = values.length, m = mean(values), s = sd(values);
  const t = n > 1 ? tInv(1 - (1 - conf) / 2, n - 1) : NaN;
  const half = (t * s) / Math.sqrt(n);
  const high = values.filter((v) => v >= BORG[scale].high).length;
  return { n, mean: m, sd: s, median: median(values), lo: m - half, hi: m + half, high, highShare: n ? high / n : NaN, min: Math.min(...values), max: Math.max(...values), hr: scale === 'rpe' ? m * 10 : NaN };
}
// Confidence rule (Borg): high when n ≥ 20 and the interval half-width is under 1 scale point; medium when n ≥ 8;
// low otherwise.
export function borgSummary(scale, r) {
  const B = BORG[scale];
  const half = (r.hi - r.lo) / 2;
  const confidence = r.n >= 20 && half < 1 ? 'high' : r.n >= 8 ? 'medium' : 'low';
  const headline = `Average ${B.name} rating ${sig(r.mean, 3)} ("${borgAnchor(scale, r.mean).toLowerCase()}"), 95% CI ${sig(r.lo, 3)} to ${sig(r.hi, 3)}, from ${r.n} ratings.`;
  const meaning = [
    `Median ${sig(r.median, 3)}; ratings ranged from ${r.min} to ${r.max}.`,
    `${r.high} of ${r.n} (${Math.round(r.highShare * 100)}%) rated ${B.high} or more ("${borgAnchor(scale, B.high).toLowerCase()}" or harder).`,
  ];
  if (scale === 'rpe') meaning.push(`Borg designed the 6–20 scale so that rating × 10 roughly tracks heart rate in healthy young adults doing steady work: here about ${Math.round(r.hr)} beats per minute. Treat this as a rough guide only.`);
  else meaning.push('CR10 is a ratio scale: a rating of 6 means about twice as strong as 3, which lets you compare designs by ratio rather than difference.');
  const caveats = ['Perceived exertion depends on fitness, age, medication and mood; compare tasks within the same people rather than against other studies.', 'If you collected ratings repeatedly from the same people, the interval treats them as independent and is too narrow.'];
  const next = [r.highShare > 0.25 ? 'A quarter or more found the task hard: look for the physical demand (force, posture, pace) with NIOSH, RULA or REBA in this tool.' : 'Exertion is moderate; compare with a redesigned version using the same people and scale.', 'Report the scale version (RPE 6–20 or CR10) and the instructions given, since wording changes ratings.'];
  const report = `Participants rated exertion on the ${B.name} scale (Borg 1998): mean ${sig(r.mean, 3)} (SD ${sig(r.sd, 2)}, 95% CI ${sig(r.lo, 3)} to ${sig(r.hi, 3)}, n = ${r.n}); ${Math.round(r.highShare * 100)}% rated ${B.high} or above.`;
  return { headline, meaning, confidence, confidenceNote: 'High with at least 20 ratings and a confidence interval narrower than ±1 scale point; medium with at least 8; low with fewer.', caveats, next, report };
}

// ════════ Cooper-Harper handling qualities rating ════════ Cooper and Harper (1969), NASA TN D-5153.
export const CH = [
  [1, 'Excellent, highly desirable', 'Pilot compensation not a factor for desired performance'],
  [2, 'Good, negligible deficiencies', 'Pilot compensation not a factor for desired performance'],
  [3, 'Fair, some mildly unpleasant deficiencies', 'Minimal pilot compensation required for desired performance'],
  [4, 'Minor but annoying deficiencies', 'Desired performance requires moderate pilot compensation'],
  [5, 'Moderately objectionable deficiencies', 'Adequate performance requires considerable pilot compensation'],
  [6, 'Very objectionable but tolerable deficiencies', 'Adequate performance requires extensive pilot compensation'],
  [7, 'Major deficiencies', 'Adequate performance not attainable with maximum tolerable compensation; controllability not in question'],
  [8, 'Major deficiencies', 'Considerable pilot compensation is required for control'],
  [9, 'Major deficiencies', 'Intense pilot compensation is required to retain control'],
  [10, 'Major deficiencies', 'Control will be lost during some portion of required operation'],
];
// Decision tree: controllable? → adequate performance attainable with tolerable workload? → satisfactory without
// improvement? Returns the allowed ratings for the answers so far.
export function chOptions({ controllable, adequate, satisfactory }) {
  if (controllable === false) return [10];
  if (controllable !== true) return [];
  if (adequate === false) return [7, 8, 9];
  if (adequate !== true) return [];
  if (satisfactory === false) return [4, 5, 6];
  if (satisfactory === true) return [1, 2, 3];
  return [];
}
export const chLevel = (r) => (r <= 3 ? 1 : r <= 6 ? 2 : r <= 9 ? 3 : 4);
export function cooperHarper(ratings) {
  const n = ratings.length;
  const levels = [1, 2, 3, 4].map((l) => ratings.filter((r) => chLevel(r) === l).length);
  const counts = CH.map(([v]) => ratings.filter((r) => r === v).length);
  return { n, median: median(ratings), levels, counts, worst: Math.max(...ratings), best: Math.min(...ratings) };
}
// Confidence rule (Cooper-Harper): high when at least 6 raters and at least 80% fall in one level; medium when
// at least 3 raters and a majority share a level; low otherwise.
export function chSummary(r) {
  const top = Math.max(...r.levels), share = top / r.n;
  const confidence = r.n >= 6 && share >= 0.8 ? 'high' : r.n >= 3 && share > 0.5 ? 'medium' : 'low';
  const lvl = chLevel(Math.round(r.median));
  const L = ['satisfactory without improvement (ratings 1–3)', 'deficiencies warrant improvement (4–6)', 'deficiencies require improvement (7–9)', 'uncontrollable: improvement mandatory (10)'];
  const headline = `Median Cooper-Harper rating ${sig(r.median, 2)} from ${r.n} rater${r.n === 1 ? '' : 's'}: ${L[lvl - 1]}.`;
  const meaning = [
    `${r.levels[0]} rated it satisfactory (1–3), ${r.levels[1]} said deficiencies warrant improvement (4–6), ${r.levels[2]} said deficiencies require improvement (7–9) and ${r.levels[3]} found it uncontrollable (10).`,
    `Ratings ran from ${r.best} to ${r.worst}. The scale is ordinal: report the median and the spread, not the mean.`,
  ];
  const caveats = ['Each rating must come from the decision tree, answered in order; ratings chosen directly from the numbers drift.', 'Raters need a defined task and defined "desired" and "adequate" performance standards before they rate.'];
  const next = [r.levels[2] + r.levels[3] > 0 ? 'Some raters found performance not adequate: fix the control or display problem before further evaluation.' : 'Ask raters which deficiency drove ratings of 4 or worse, and test a revised version.', 'For mental workload rather than handling, consider the Modified Cooper-Harper scale or NASA-TLX.'];
  const report = `On the Cooper-Harper scale (Cooper and Harper 1969), ${r.n} raters gave a median rating of ${sig(r.median, 2)} (range ${r.best}–${r.worst}); ${r.levels[0]} rated the task satisfactory without improvement.`;
  return { headline, meaning, confidence, confidenceNote: 'High with at least 6 raters and 80% in one level of the scale; medium with at least 3 raters and a majority in one level; low otherwise.', caveats, next, report };
}

// ════════ SWAT, simplified conjoint scaling ════════ Reid and Nygren (1988), "The subjective workload assessment
// technique", in Hancock and Meshkati (eds), Human Mental Workload, 185–218.
// Each of the 27 combinations of time load (T), mental effort (E) and stress (S), each at levels 1–3, is ranked from
// lowest (1) to highest (27) workload. Simplified scaling: an additive model fitted by least squares to the ranks
// (the full method uses monotone conjoint analysis). The full factorial is orthogonal, so each part-worth is the
// mean rank at that level minus the grand mean. Scores are rescaled so 1-1-1 = 0 and 3-3-3 = 100.
export const SWAT_COMBOS = (() => { const out = []; for (let t = 1; t <= 3; t++) for (let e = 1; e <= 3; e++) for (let s = 1; s <= 3; s++) out.push([t, e, s]); return out; })();
export const SWAT_PROTOTYPES = [['TES', 'Time, then effort, then stress'], ['TSE', 'Time, then stress, then effort'], ['ETS', 'Effort, then time, then stress'], ['EST', 'Effort, then stress, then time'], ['STE', 'Stress, then time, then effort'], ['SET', 'Stress, then effort, then time']];
// Lexicographic card order for a prototype: the most important dimension changes slowest.
export function prototypeOrder(code) {
  const pos = { T: 0, E: 1, S: 2 };
  const ix = code.split('').map((c) => pos[c]);
  return [...SWAT_COMBOS].sort((a, b) => a[ix[0]] - b[ix[0]] || a[ix[1]] - b[ix[1]] || a[ix[2]] - b[ix[2]]);
}
export function parseSwatOrder(text) {
  const codes = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const errors = [];
  const order = codes.map((c) => { const m = /^([123])[-/]?([123])[-/]?([123])$/.exec(c); if (!m) { errors.push(`"${c}" is not a T-E-S code like 213.`); return null; } return [Number(m[1]), Number(m[2]), Number(m[3])]; }).filter(Boolean);
  const keys = new Set(order.map((o) => o.join('')));
  if (order.length !== 27 || keys.size !== 27) errors.push(`Give all 27 combinations once each (got ${order.length}, ${keys.size} distinct).`);
  return { order, errors };
}
export function swatScale(order) {
  const rank = new Map(order.map((o, i) => [o.join(''), i + 1]));
  const grand = 14;
  const pw = [0, 1, 2].map((d) => [1, 2, 3].map((lv) => mean(SWAT_COMBOS.filter((c) => c[d] === lv).map((c) => rank.get(c.join('')))) - grand));
  const fitted = (c) => grand + pw[0][c[0] - 1] + pw[1][c[1] - 1] + pw[2][c[2] - 1];
  const f0 = fitted([1, 1, 1]), f1 = fitted([3, 3, 3]);
  const score = (c) => (100 * (fitted(c) - f0)) / (f1 - f0);
  const ranges = pw.map((p) => Math.max(...p) - Math.min(...p));
  const tot = ranges.reduce((a, b) => a + b, 0);
  const importance = ranges.map((x) => x / tot);
  const ys = SWAT_COMBOS.map((c) => rank.get(c.join(''))), yh = SWAT_COMBOS.map(fitted);
  const my = mean(ys);
  const r2 = 1 - ys.reduce((a, y, i) => a + (y - yh[i]) ** 2, 0) / ys.reduce((a, y) => a + (y - my) ** 2, 0);
  return { pw, score, importance, r2, table: SWAT_COMBOS.map((c) => ({ c, rank: rank.get(c.join('')), score: score(c) })) };
}
// Confidence rule (SWAT): medium when the additive model explains at least 90% of the variance in the card ranks
// (a rule of thumb used here: below that, interactions between dimensions matter); low below 0.9.
// Never high: this is the simplified least-squares scaling and SWAT ratings are coarse (three levels per dimension).
export function swatSummary(sc, events) {
  const confidence = sc.r2 >= 0.9 ? 'medium' : 'low';
  const dims = ['time load', 'mental effort', 'psychological stress'];
  const order = [0, 1, 2].sort((a, b) => sc.importance[b] - sc.importance[a]);
  const scored = events.map((e) => ({ ...e, s: sc.score([e.t, e.e, e.s]) }));
  const worst = [...scored].sort((a, b) => b.s - a.s)[0];
  const headline = worst ? `Highest workload: "${worst.label}" at ${sig(worst.s, 3)} on the 0–100 SWAT scale.` : 'The scale is ready: add ratings to score them.';
  const meaning = [
    `For this card sort, ${dims[order[0]]} matters most (${Math.round(sc.importance[order[0]] * 100)}% of the scale), then ${dims[order[1]]} (${Math.round(sc.importance[order[1]] * 100)}%) and ${dims[order[2]]} (${Math.round(sc.importance[order[2]] * 100)}%).`,
    `The additive model explains ${Math.round(sc.r2 * 100)}% of the variance in the card ranks${sc.r2 >= 0.9 ? '' : '; below 90% the rater\'s ordering is not well described by adding the three dimensions'}.`,
  ];
  if (scored.length > 1) meaning.push(`Scores: ${scored.map((e) => `${e.label} ${sig(e.s, 3)}`).join(', ')}.`);
  const caveats = ['This is the simplified scaling (least squares on ranks). Published SWAT uses monotone conjoint analysis, so scores can differ by a few points.', 'Differences of a few points mean little: each dimension has only three levels.'];
  const next = ['Collect card sorts from each participant (or check they agree before pooling), and rate each task immediately after doing it.', 'Compare with NASA-TLX for the same tasks if you need finer resolution.'];
  const report = `Workload was measured with SWAT (Reid and Nygren 1988) using a simplified least-squares conjoint scale (R² = ${sig(sc.r2, 3)}; importance: time ${Math.round(sc.importance[0] * 100)}%, effort ${Math.round(sc.importance[1] * 100)}%, stress ${Math.round(sc.importance[2] * 100)}%).${worst ? ` The highest-workload task was ${worst.label} (${sig(worst.s, 3)} of 100).` : ''}`;
  return { headline, meaning, confidence, confidenceNote: 'Never high: SWAT dimensions have only three levels and this is a simplified scaling. Medium when the additive model fits the card sort well (R² at least 0.9, a rule of thumb used here); low otherwise.', caveats, next, report };
}

// ════════ Built-in examples (shared with server/scripts/check-humanfactors.js) ════════
// NIOSH: a warehouse picker moving 12 kg cartons from a low pallet to a conveyor, 3 lifts a minute for 2 hours.
export const NIOSH_EXAMPLE = { units: 'metric', load: 12, H: 45, V: 20, D: 80, A: 45, F: 3, duration: '2', coupling: 'fair', control: true, Hd: 35, Vd: 100 };
// RULA: a lab technician pipetting at a bench, arms raised and neck bent forward.
export const RULA_EXAMPLE = { upperArm: 3, shoulderRaised: false, abducted: true, armSupported: false, lowerArm: 2, across: false, wrist: 2, wristDeviated: true, wristTwist: 1, muscleA: true, forceA: 0, neck: 3, neckTwist: false, neckSide: false, trunk: 2, trunkTwist: false, trunkSide: false, legs: 1, muscleB: true, forceB: 0 };
// REBA: a nurse bending over a low bed to reposition a patient's legs.
export const REBA_EXAMPLE = { trunk: 3, trunkTwist: true, neck: 2, neckTwist: false, legs: 1, knees: 1, load: 1, shock: false, upperArm: 2, abducted: false, shoulderRaised: false, armSupported: false, lowerArm: 2, wrist: 1, wristTwist: false, coupling: 2, static: false, repeated: false, rapid: true };
// Anthropometry: the top button of a wall-mounted kiosk must be within standing vertical grip reach.
// Illustrative means and SDs only, not taken from a survey: replace them with data for your users.
export const ANTHRO_EXAMPLE = { dimension: 'standing vertical grip reach', unit: 'cm', type: 'min', x: 185, lo: 70, hi: 120, target: 0.95, groups: [{ name: 'Women', mean: 191, sd: 8.5, w: 50, n: 0 }, { name: 'Men', mean: 206, sd: 9, w: 50, n: 0 }] };
// Borg RPE after carrying a 10 kg equipment case up two flights of stairs (12 field engineers).
export const BORG_EXAMPLE = { scale: 'rpe', text: '13 15 12 14 16 13 11 15 17 14 13 12' };
// Cooper-Harper ratings from 7 test pilots flying an approach with a new display.
export const CH_EXAMPLE = '3 4 4 5 3 4 6';
// SWAT: a participant whose card sort follows the time-effort-stress prototype, rating three tasks.
export const SWAT_EXAMPLE = { proto: 'TES', events: 'Routine monitoring, 1, 1, 1\nAlarm response, 3, 2, 3\nShift handover, 2, 2, 1' };
export function parseSwatEvents(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const c = l.split(/\s*[,;\t]\s*/);
    const n = c.slice(-3).map(Number);
    return c.length >= 4 && n.every((v) => [1, 2, 3].includes(v)) ? { label: c.slice(0, -3).join(', '), t: n[0], e: n[1], s: n[2] } : null;
  }).filter(Boolean);
}
export const parseRatings = (text) => String(text || '').split(/[\s,;]+/).filter(Boolean).map(Number).filter(Number.isFinite);
