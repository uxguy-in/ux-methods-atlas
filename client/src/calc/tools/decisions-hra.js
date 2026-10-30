// Human error probability: HEART (Williams 1986, 1988) and SPAR-H (Gertman et al. 2005, NUREG/CR-6883).
// Pure functions; checked in server/scripts/check-decisions.js against the published HEART worked example and the
// SPAR-H formulas.
import { fmt, sig } from './decisions-core.js';

// ── HEART ──
// Generic task types with nominal human unreliability and 5th–95th percentile bounds (Williams 1986).
export const GTT = [
  { id: 'A', text: 'Totally unfamiliar, performed at speed with no real idea of likely consequences', hep: 0.55, lo: 0.35, hi: 0.97 },
  { id: 'B', text: 'Shift or restore a system to a new or original state on a single attempt without supervision or procedures', hep: 0.26, lo: 0.14, hi: 0.42 },
  { id: 'C', text: 'Complex task requiring a high level of comprehension and skill', hep: 0.16, lo: 0.12, hi: 0.28 },
  { id: 'D', text: 'Fairly simple task performed rapidly or given scant attention', hep: 0.09, lo: 0.06, hi: 0.13 },
  { id: 'E', text: 'Routine, highly practised, rapid task involving a relatively low level of skill', hep: 0.02, lo: 0.007, hi: 0.045 },
  { id: 'F', text: 'Restore or shift a system to an original or new state following procedures, with some checking', hep: 0.003, lo: 0.0008, hi: 0.007 },
  { id: 'G', text: 'Completely familiar, well-designed, highly practised routine task done several times an hour by highly motivated, trained and experienced people with time to correct errors, but without significant job aids', hep: 0.0004, lo: 0.00008, hi: 0.009 },
  { id: 'H', text: 'Respond correctly to a system command even when there is an augmented or automated supervisory system giving an accurate interpretation of system state', hep: 0.00002, lo: 0.000006, hi: 0.00009 },
  { id: 'M', text: 'Miscellaneous task for which no description can be found', hep: 0.03, lo: 0.008, hi: 0.11 },
];
// Error-producing conditions with their maximum multipliers (Williams 1988).
export const EPC = [
  [1, 'Unfamiliarity with a situation that is potentially important but only occurs infrequently or is novel', 17],
  [2, 'Shortage of time available for error detection and correction', 11],
  [3, 'Low signal-to-noise ratio', 10],
  [4, 'A means of suppressing or overriding information or features that is too easily accessible', 9],
  [5, 'No means of conveying spatial and functional information to operators in a form they can readily assimilate', 8],
  [6, 'Mismatch between an operator\'s model of the world and that imagined by the designer', 8],
  [7, 'No obvious means of reversing an unintended action', 8],
  [8, 'Channel capacity overload, particularly from simultaneous presentation of non-redundant information', 6],
  [9, 'A need to unlearn a technique and apply one that requires an opposing philosophy', 6],
  [10, 'The need to transfer specific knowledge from task to task without loss', 5.5],
  [11, 'Ambiguity in the required performance standards', 5],
  [12, 'Mismatch between perceived and real risk', 4],
  [13, 'Poor, ambiguous or ill-matched system feedback', 4],
  [14, 'No clear, direct and timely confirmation of an intended action from the part of the system being controlled', 3],
  [15, 'Operator inexperience (e.g. newly qualified but not expert)', 3],
  [16, 'Impoverished quality of information conveyed by procedures and person-to-person interaction', 3],
  [17, 'Little or no independent checking or testing of output', 3],
  [18, 'Conflict between immediate and long-term objectives', 2.5],
  [19, 'No diversity of information input for veracity checks', 2.5],
  [20, 'Mismatch between the educational level of an individual and the requirements of the task', 2],
  [21, 'An incentive to use other, more dangerous procedures', 2],
  [22, 'Little opportunity to exercise mind and body outside the immediate confines of the job', 1.8],
  [23, 'Unreliable instrumentation (enough that it is noticed)', 1.6],
  [24, 'A need for absolute judgements beyond the capabilities or experience of the operator', 1.6],
  [25, 'Unclear allocation of function and responsibility', 1.6],
  [26, 'No obvious way to keep track of progress during an activity', 1.4],
  [27, 'A danger that finite physical capabilities will be exceeded', 1.4],
  [28, 'Little or no intrinsic meaning in a task', 1.4],
  [29, 'High-level emotional stress', 1.3],
  [30, 'Evidence of ill-health among operatives, especially fever', 1.2],
  [31, 'Low workforce morale', 1.2],
  [32, 'Inconsistency of meaning of displays and procedures', 1.2],
  [33, 'A poor or hostile environment (below 75% of health or life-threatening severity)', 1.15],
  [34, 'Prolonged inactivity or highly repetitious cycling of low mental workload tasks (first half-hour)', 1.1],
  [35, 'Disruption of normal work-sleep cycles', 1.1],
  [36, 'Task pacing caused by the intervention of others', 1.06],
  [37, 'Additional team members over and above those needed to do the task (per additional person)', 1.03],
  [38, 'Age of personnel performing perceptual tasks', 1.02],
].map(([id, text, max]) => ({ id, text, max }));

// Assessed effect of one EPC: (max multiplier − 1) × assessed proportion of affect + 1.
export const assessedEffect = (max, apoa) => (max - 1) * apoa + 1;
// HEP = GTT nominal × Π assessed effects, capped at 1. The GTT bounds are scaled by the same product.
export function heart(gttId, epcs) {
  const g = GTT.find((x) => x.id === gttId);
  const rows = epcs.map((e) => {
    const def = EPC.find((x) => x.id === e.id);
    const max = e.max ?? def?.max;
    return { ...e, text: def?.text ?? e.text, max, effect: assessedEffect(max, e.apoa) };
  });
  const product = rows.reduce((a, r) => a * r.effect, 1);
  const raw = g.hep * product;
  return { gtt: g, rows, product, raw, hep: Math.min(1, raw), lo: Math.min(1, g.lo * product), hi: Math.min(1, g.hi * product), capped: raw > 1 };
}

// ── SPAR-H ──
// PSF levels and multipliers from the SPAR-H worksheets in NUREG/CR-6883 (Gertman et al. 2005). A multiplier of
// 'fail' sets P(failure) = 1. Diagnosis nominal HEP 0.01, action 0.001.
export const NHEP = { diagnosis: 0.01, action: 0.001 };
export const PSF = [
  { id: 'time', name: 'Available time', diagnosis: [['Inadequate time', 'fail'], ['Barely adequate time (≈ 2/3 × nominal)', 10], ['Nominal time', 1], ['Extra time (1–2 × nominal and > 30 min)', 0.1], ['Expansive time (> 2 × nominal and > 30 min)', 0.01], ['Insufficient information', 1]],
    action: [['Inadequate time', 'fail'], ['Time available ≈ time required', 10], ['Nominal time', 1], ['Time available ≥ 5 × time required', 0.1], ['Time available ≥ 50 × time required', 0.01], ['Insufficient information', 1]] },
  { id: 'stress', name: 'Stress / stressors', diagnosis: [['Extreme', 5], ['High', 2], ['Nominal', 1], ['Insufficient information', 1]], action: [['Extreme', 5], ['High', 2], ['Nominal', 1], ['Insufficient information', 1]] },
  { id: 'complexity', name: 'Complexity', diagnosis: [['Highly complex', 5], ['Moderately complex', 2], ['Nominal', 1], ['Obvious diagnosis', 0.1], ['Insufficient information', 1]], action: [['Highly complex', 5], ['Moderately complex', 2], ['Nominal', 1], ['Insufficient information', 1]] },
  { id: 'experience', name: 'Experience / training', diagnosis: [['Low', 10], ['Nominal', 1], ['High', 0.5], ['Insufficient information', 1]], action: [['Low', 3], ['Nominal', 1], ['High', 0.5], ['Insufficient information', 1]] },
  { id: 'procedures', name: 'Procedures', diagnosis: [['Not available', 50], ['Incomplete', 20], ['Available, but poor', 5], ['Nominal', 1], ['Diagnostic / symptom oriented', 0.5], ['Insufficient information', 1]], action: [['Not available', 50], ['Incomplete', 20], ['Available, but poor', 5], ['Nominal', 1], ['Insufficient information', 1]] },
  { id: 'ergonomics', name: 'Ergonomics / HMI', diagnosis: [['Missing / misleading', 50], ['Poor', 10], ['Nominal', 1], ['Good', 0.5], ['Insufficient information', 1]], action: [['Missing / misleading', 50], ['Poor', 10], ['Nominal', 1], ['Good', 0.5], ['Insufficient information', 1]] },
  { id: 'fitness', name: 'Fitness for duty', diagnosis: [['Unfit', 'fail'], ['Degraded fitness', 5], ['Nominal', 1], ['Insufficient information', 1]], action: [['Unfit', 'fail'], ['Degraded fitness', 5], ['Nominal', 1], ['Insufficient information', 1]] },
  { id: 'work', name: 'Work processes', diagnosis: [['Poor', 2], ['Nominal', 1], ['Good', 0.8], ['Insufficient information', 1]], action: [['Poor', 5], ['Nominal', 1], ['Good', 0.5], ['Insufficient information', 1]] },
];
export const nominalIndex = (psf, part) => psf[part].findIndex(([l]) => /^Nominal/.test(l));

// One part (diagnosis or action). levels: index into each PSF's list.
// Composite = Π multipliers. With three or more negative PSFs (multiplier > 1) the adjustment
// HEP = NHEP·PSF / (NHEP·(PSF − 1) + 1) keeps the result below 1; otherwise HEP = NHEP·PSF (capped at 1).
export function sparhPart(part, levels) {
  const chosen = PSF.map((p, i) => { const [label, m] = p[part][levels[i] ?? nominalIndex(p, part)]; return { id: p.id, name: p.name, label, m }; });
  const nhep = NHEP[part];
  if (chosen.some((c) => c.m === 'fail')) return { part, nhep, chosen, composite: Infinity, negative: chosen.filter((c) => c.m === 'fail' || c.m > 1).length, adjusted: false, hep: 1, fail: true };
  const composite = chosen.reduce((a, c) => a * c.m, 1);
  const negative = chosen.filter((c) => c.m > 1).length;
  const adjusted = negative >= 3;
  const hep = adjusted ? (nhep * composite) / (nhep * (composite - 1) + 1) : Math.min(1, nhep * composite);
  return { part, nhep, chosen, composite, negative, adjusted, hep, unadjusted: nhep * composite, fail: false };
}
// Diagnosis and action combined: P = Pd + Pa − Pd·Pa (both must succeed).
export const combine = (pd, pa) => pd + pa - pd * pa;
// SPAR-H dependence of this task on a preceding failure (the THERP dependence equations used in NUREG/CR-6883).
export const DEPENDENCE = [['zero', 'Zero', (p) => p], ['low', 'Low', (p) => (1 + 19 * p) / 20], ['moderate', 'Moderate', (p) => (1 + 6 * p) / 7], ['high', 'High', (p) => (1 + p) / 2], ['complete', 'Complete', () => 1]];
export const withDependence = (p, level) => (DEPENDENCE.find(([k]) => k === level) || DEPENDENCE[0])[2](p);

export const oneIn = (p) => (p >= 1 ? 'certain failure' : p > 0 ? `about 1 in ${fmt(1 / p, 1 / p < 10 ? 1 : 0)}` : 'never');

// "Reading your results" summary.
// Confidence rule: HRA estimates rest on expert-chosen task types, conditions and multipliers and are generally
// treated as accurate only to within about a factor of 10, so confidence is never high.
//   medium — the estimate is driven by at most three conditions/PSFs that each multiply the error rate by 5 or less;
//   low    — any single condition multiplies it by more than 5, four or more conditions stack, the SPAR-H
//            three-negative-PSF adjustment applies, or the result is capped at 1.
export function hraConfidence(effects, extra = false) {
  const big = effects.filter((e) => e > 5).length, many = effects.filter((e) => e > 1).length >= 4;
  return big || many || extra ? 'low' : 'medium';
}
export function heartSummary(r) {
  const effects = r.rows.map((x) => x.effect);
  const confidence = hraConfidence(effects, r.capped);
  const top = [...r.rows].sort((a, b) => b.effect - a.effect)[0];
  const headline = `HEART estimates a human error probability of ${sig(r.hep, 2)} for this task (${oneIn(r.hep)}), from a nominal ${sig(r.gtt.hep, 2)} for task type ${r.gtt.id}.`;
  const meaning = [
    `The error-producing conditions multiply the nominal rate by ${sig(r.product, 3)} in total. Scaling the task type's 5th–95th percentile bounds by the same factor gives a range of ${sig(r.lo, 2)} to ${sig(r.hi, 2)}.`,
    top ? `The largest contributor is EPC ${top.id} (${top.text.toLowerCase()}), multiplying the rate by ${sig(top.effect, 3)}; removing it alone would give ${sig(Math.min(1, r.raw / top.effect), 2)}.` : 'No error-producing conditions are applied, so the estimate is the task type\'s nominal value.',
  ];
  if (r.capped) meaning.push('The product exceeded 1 and is capped at 1: the conditions stack so heavily that failure is all but certain, a sign that the task needs redesign, not fine-tuning.');
  const caveats = [
    'HEART multiplies conditions as if they were independent; strongly related conditions (for example time pressure and stress) double-count and inflate the estimate.',
    'The assessed proportion of affect is a judgement; two analysts can differ by a factor of several. Record why each value was chosen.',
  ];
  const next = [
    top ? `Design out the biggest condition first (EPC ${top.id}): it has the most leverage on the error rate.` : 'Check whether any error-producing conditions apply; few real tasks have none.',
    'Compare with a SPAR-H estimate of the same task, and feed high-probability steps into a [use FMEA](/calculators/use-fmea).',
  ];
  const report = `Using HEART (Williams 1986), the task was classed as generic task type ${r.gtt.id} (nominal ${sig(r.gtt.hep, 2)}) with ${r.rows.length} error-producing condition${r.rows.length === 1 ? '' : 's'} (${r.rows.map((x) => `EPC ${x.id} ×${x.max}, APOA ${x.apoa}`).join('; ') || 'none'}), giving a human error probability of ${sig(r.hep, 2)} (${sig(r.lo, 2)} to ${sig(r.hi, 2)}).`;
  return { headline, meaning, confidence, confidenceNote: CONF_NOTE, caveats, next, report };
}
const CONF_NOTE = 'Never high: human reliability estimates rest on expert judgement and are usually treated as good to within about a factor of 10. Medium when no single condition multiplies the rate by more than 5 and at most three conditions apply; low otherwise, or when the estimate is capped at 1 or needs the SPAR-H adjustment.';
export function sparhSummary({ parts, total, dep, depLevel }) {
  const effects = parts.flatMap((p) => p.chosen.map((c) => (c.m === 'fail' ? Infinity : c.m)));
  const confidence = hraConfidence(effects, parts.some((p) => p.adjusted || p.fail));
  const neg = parts.flatMap((p) => p.chosen.filter((c) => c.m === 'fail' || c.m > 1).map((c) => ({ ...c, part: p.part }))).sort((a, b) => (b.m === 'fail' ? Infinity : b.m) - (a.m === 'fail' ? Infinity : a.m));
  const final = depLevel && depLevel !== 'zero' ? dep : total;
  const headline = `SPAR-H estimates a human error probability of ${sig(final, 2)} (${oneIn(final)}) for this ${parts.map((p) => p.part).join(' and ')} task.`;
  const meaning = parts.map((p) => (p.fail ? `${p.part[0].toUpperCase()}${p.part.slice(1)}: a performance shaping factor is set to certain failure, so P = 1.` : `${p.part[0].toUpperCase()}${p.part.slice(1)}: nominal ${sig(p.nhep, 1)} × composite PSF ${sig(p.composite, 3)} = ${sig(p.hep, 2)}${p.adjusted ? ` (with ${p.negative} negative PSFs the adjustment formula is applied; unadjusted it would be ${sig(p.unadjusted, 2)})` : ''}.`));
  if (neg.length) meaning.push(`Biggest negative factor: ${neg[0].name} ("${neg[0].label}", ${neg[0].m === 'fail' ? 'certain failure' : `×${neg[0].m}`}).`);
  if (depLevel && depLevel !== 'zero') meaning.push(`With ${depLevel} dependence on a preceding failure, the conditional probability rises from ${sig(total, 2)} to ${sig(dep, 2)}.`);
  const caveats = [
    'SPAR-H was built for nuclear plant operations; its multipliers are expert judgements, so use it to compare designs and find the dominant factors, not as an exact rate for consumer software.',
    'The worksheets ask you to justify each PSF level; "insufficient information" counts as nominal, which can hide real problems.',
  ];
  const next = [
    neg.length ? `Improve ${neg[0].name.toLowerCase()} first: it has the largest multiplier.` : 'All factors are nominal or better; check the task type is right before relying on the estimate.',
    'Compare with a HEART estimate, and test the step with real users to see whether the predicted errors occur.',
  ];
  const report = `A SPAR-H assessment (Gertman et al. 2005, NUREG/CR-6883) gave ${parts.map((p) => `${p.part === 'action' ? 'an' : 'a'} ${p.part} HEP of ${sig(p.hep, 2)}`).join(' and ')}${parts.length > 1 ? `, combined ${sig(total, 2)}` : ''}${depLevel && depLevel !== 'zero' ? `, or ${sig(dep, 2)} with ${depLevel} dependence` : ''}.`;
  return { headline, meaning, confidence, confidenceNote: CONF_NOTE, caveats, next, report };
}
