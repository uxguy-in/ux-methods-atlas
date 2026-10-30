// Classifier evaluation: confusion-matrix metrics with intervals, ROC curve and AUC with the DeLong interval, precision-
// recall curve and average precision. Pure functions; checked by server/scripts/check-signals.js against sklearn and
// statsmodels.
import { wilsonCI, zConf, normSf, toNum, parseLines, rng, gauss, fmt, pctText, intText } from './signals-core.js';

// Metrics as functions of the four cell counts [TP, FP, FN, TN].
const F = {
  accuracy: ([a, b, c, d]) => (a + d) / (a + b + c + d),
  precision: ([a, b]) => a / (a + b),
  recall: ([a, , c]) => a / (a + c),
  specificity: ([, b, , d]) => d / (b + d),
  npv: ([, , c, d]) => d / (c + d),
  f1: ([a, b, c]) => (2 * a) / (2 * a + b + c),
  mcc: ([a, b, c, d]) => (a * d - b * c) / Math.sqrt((a + b) * (a + c) * (d + b) * (d + c)),
  kappa: ([a, b, c, d]) => { const n = a + b + c + d, po = (a + d) / n, pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n); return (po - pe) / (1 - pe); },
  balanced: ([a, b, c, d]) => (a / (a + c) + d / (b + d)) / 2,
};
// Delta-method standard error of a metric under multinomial sampling of the four cells:
// Var = (1/N)[Σ pᵢ gᵢ² − (Σ pᵢ gᵢ)²], g = ∂metric/∂pᵢ by central differences on the cell proportions.
export function deltaSE(f, cells) {
  const N = cells.reduce((s, v) => s + v, 0), p = cells.map((v) => v / N), h = 1e-6;
  const g = p.map((_, i) => { const up = [...p], dn = [...p]; up[i] += h; dn[i] -= h; return (f(up) - f(dn)) / (2 * h); });
  const m1 = p.reduce((s, pi, i) => s + pi * g[i], 0), m2 = p.reduce((s, pi, i) => s + pi * g[i] * g[i], 0);
  return Math.sqrt(Math.max(0, m2 - m1 * m1) / N);
}

export function confusion(TP, FP, FN, TN, conf = 0.95) {
  const cells = [TP, FP, FN, TN], N = TP + FP + FN + TN, z = zConf(conf);
  if (!(N > 0) || cells.some((v) => !(v >= 0))) return null;
  const prop = (x, n) => (n > 0 ? { est: x / n, ...wilsonCI(x, n, conf), x, n } : { est: NaN, lo: NaN, hi: NaN, x, n });
  const wald = (k) => { const est = F[k](cells), se = deltaSE(F[k], cells); return { est, se, lo: est - z * se, hi: est + z * se }; };
  const prev = (TP + FN) / N, ppv = prop(TP, TP + FP);
  const sens = TP / (TP + FN), spec = TN / (TN + FP);
  // Likelihood ratios with the log interval (Simel, Samsa and Matchar 1991).
  const lr = (num, den, se) => ({ est: num / den, lo: Math.exp(Math.log(num / den) - z * se), hi: Math.exp(Math.log(num / den) + z * se) });
  const lrPos = lr(sens, 1 - spec, Math.sqrt((1 - sens) / TP + spec / FP));
  const lrNeg = lr(1 - sens, spec, Math.sqrt(sens / FN + (1 - spec) / TN));
  const m = {
    accuracy: prop(TP + TN, N), precision: ppv, recall: prop(TP, TP + FN), specificity: prop(TN, TN + FP), npv: prop(TN, TN + FN),
    f1: wald('f1'), mcc: wald('mcc'), kappa: wald('kappa'), balanced: wald('balanced'),
    lift: { est: ppv.est / prev, lo: ppv.lo / prev, hi: ppv.hi / prev }, prevalence: prop(TP + FN, N), predictedPos: prop(TP + FP, N),
    lrPos, lrNeg, youden: { est: sens + spec - 1 },
  };
  return { TP, FP, FN, TN, N, m, conf };
}

// ── Scores and labels ──
export function parseScores(text) {
  const rows = [], bad = [];
  parseLines(text, /[\s,;]+/).forEach((c, i) => {
    const s = toNum(c[0]), raw = String(c[1] ?? '').toLowerCase();
    const y = ['1', 'yes', 'true', 'pos', 'positive', 'y'].includes(raw) ? 1 : ['0', 'no', 'false', 'neg', 'negative', 'n'].includes(raw) ? 0 : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(y)) { if (i > 0 || Number.isFinite(s)) bad.push(i + 1); } else rows.push({ s, y });
  });
  return { rows, bad };
}
// ROC points at every distinct score (as sklearn roc_curve with drop_intermediate=False), AUC by the trapezoid rule
// (equal to the Mann-Whitney probability with ties counted ½), and precision-recall points with average precision
// AP = Σ (Rₖ − Rₖ₋₁) Pₖ (sklearn average_precision_score).
export function rocPr(rows) {
  const s = [...rows].sort((a, b) => b.s - a.s), P = s.filter((r) => r.y === 1).length, Nn = s.length - P;
  if (!P || !Nn) return null;
  const roc = [{ thr: Infinity, fpr: 0, tpr: 0, tp: 0, fp: 0 }], pr = [];
  let tp = 0, fp = 0, ap = 0, lastR = 0;
  for (let i = 0; i < s.length;) {
    let j = i; while (j + 1 < s.length && s[j + 1].s === s[i].s) j++;
    for (let k = i; k <= j; k++) { if (s[k].y) tp++; else fp++; }
    roc.push({ thr: s[i].s, fpr: fp / Nn, tpr: tp / P, tp, fp });
    const prec = tp / (tp + fp), rec = tp / P;
    pr.push({ thr: s[i].s, precision: prec, recall: rec });
    ap += (rec - lastR) * prec; lastR = rec;
    i = j + 1;
  }
  let auc = 0; for (let i = 1; i < roc.length; i++) auc += (roc[i].fpr - roc[i - 1].fpr) * (roc[i].tpr + roc[i - 1].tpr) / 2;
  return { roc, pr, auc, ap, P, N: Nn, prevalence: P / s.length };
}
// DeLong, DeLong and Clarke-Pearson (1988) variance of the AUC from structural components:
// V10ᵢ = mean over negatives of ψ(Xᵢ, Yⱼ), V01ⱼ = mean over positives; Var = S10/m + S01/n, ψ = 1, ½ or 0.
export function delong(rows, conf = 0.95) {
  const pos = rows.filter((r) => r.y === 1).map((r) => r.s), neg = rows.filter((r) => r.y === 0).map((r) => r.s);
  const m = pos.length, n = neg.length;
  if (m < 2 || n < 2) return null;
  const sn = [...neg].sort((a, b) => a - b), sp = [...pos].sort((a, b) => a - b);
  const countBelow = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
  const countAtMost = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; } return lo; };
  const v10 = pos.map((x) => { const lt = countBelow(sn, x), le = countAtMost(sn, x); return (lt + 0.5 * (le - lt)) / n; });
  const v01 = neg.map((y) => { const gt = m - countAtMost(sp, y), ge = m - countBelow(sp, y); return (gt + 0.5 * (ge - gt)) / m; });
  const auc = v10.reduce((s, v) => s + v, 0) / m;
  const var_ = (a) => { const mu = a.reduce((s, v) => s + v, 0) / a.length; return a.reduce((s, v) => s + (v - mu) ** 2, 0) / (a.length - 1); };
  const se = Math.sqrt(var_(v10) / m + var_(v01) / n), z = zConf(conf);
  return { auc, se, lo: Math.max(0, auc - z * se), hi: Math.min(1, auc + z * se), z: (auc - 0.5) / se, p: 2 * normSf(Math.abs((auc - 0.5) / se)), m, n };
}
export function atThreshold(rows, thr) {
  let TP = 0, FP = 0, FN = 0, TN = 0;
  rows.forEach((r) => { const pred = r.s >= thr; if (pred && r.y) TP++; else if (pred) FP++; else if (r.y) FN++; else TN++; });
  return [TP, FP, FN, TN];
}
// The threshold that maximises Youden's J = sensitivity + specificity − 1.
export function youdenBest(roc) {
  let best = null; for (const p of roc) if (Number.isFinite(p.thr) && (!best || p.tpr - p.fpr > best.j)) best = { thr: p.thr, j: p.tpr - p.fpr, tpr: p.tpr, fpr: p.fpr };
  return best;
}

// Example: an AI triage model's urgency scores for 240 support tickets, 60 of them truly urgent.
export function exampleScores(seed = 21) {
  const r = rng(seed), out = ['# score, truly urgent (1) or not (0)'];
  for (let i = 0; i < 240; i++) {
    const y = i % 4 === 0 ? 1 : 0, lin = y ? 0.75 + gauss(r) * 1.0 : -0.75 + gauss(r) * 1.0;
    out.push(`${(1 / (1 + Math.exp(-lin))).toFixed(3)}, ${y}`);
  }
  return out.join('\n');
}

// ── Reading your results ──
// Confidence rule: "high" when there are at least 50 positives and 50 negatives, "medium" with at least 20 of each,
// "low" otherwise; a model whose AUC interval includes 0.5 (or whose MCC interval includes 0) is rated low.
export function summary(cm, auc = null) {
  const pos = cm.TP + cm.FN, neg = cm.FP + cm.TN, m = cm.m;
  const noSkill = auc ? auc.lo <= 0.5 : m.mcc.lo <= 0;
  const confidence = noSkill ? 'low' : pos >= 50 && neg >= 50 ? 'high' : pos >= 20 && neg >= 20 ? 'medium' : 'low';
  const ci = (x, d = 0) => `${pctText(x.est, d)} (95% CI ${pctText(x.lo, d)} to ${pctText(x.hi, d)})`;
  const meaning = [
    `Precision ${ci(m.precision)}: of the cases the classifier flags, this share are truly positive. Recall ${ci(m.recall)}: of the truly positive cases, this share are caught.`,
    `Prevalence is ${pctText(m.prevalence.est, 1)}, so accuracy (${pctText(m.accuracy.est, 1)}) is misleading on its own: always predicting the more common class would score ${pctText(Math.max(m.prevalence.est, 1 - m.prevalence.est), 1)}. MCC = ${fmt(m.mcc.est, 2)} and Cohen's kappa = ${fmt(m.kappa.est, 2)} correct for that (0 = no better than chance, 1 = perfect).`,
    `Lift ${fmt(m.lift.est, 2)}: a flagged case is ${fmt(m.lift.est, 1)} times as likely to be positive as a random case.`,
  ];
  if (auc) meaning.push(`AUC ${fmt(auc.auc, 3)} (DeLong 95% CI ${fmt(auc.lo, 3)} to ${fmt(auc.hi, 3)}): the chance that a random positive scores above a random negative. 0.5 is a coin toss; Hosmer and Lemeshow (2000) call 0.7 to 0.8 acceptable, 0.8 to 0.9 excellent and above 0.9 outstanding discrimination.`);
  return {
    headline: auc
      ? `AUC ${fmt(auc.auc, 3)}; at this threshold precision is ${pctText(m.precision.est, 0)} and recall ${pctText(m.recall.est, 0)} (F1 ${fmt(m.f1.est, 2)}, MCC ${fmt(m.mcc.est, 2)}).`
      : `Precision ${pctText(m.precision.est, 0)} and recall ${pctText(m.recall.est, 0)} on ${intText(cm.N)} cases (F1 ${fmt(m.f1.est, 2)}, MCC ${fmt(m.mcc.est, 2)}).`,
    meaning,
    confidence,
    confidenceNote: `Rule: strong with at least 50 positive and 50 negative cases, some evidence with at least 20 of each, weak below that or when the AUC interval includes 0.5 (or the MCC interval includes 0). Here: ${intText(pos)} positive and ${intText(neg)} negative cases.`,
    caveats: [
      'Precision depends on prevalence: the same model has lower precision where positives are rarer. Recall and specificity do not, so quote them when the setting changes.',
      'These numbers describe this sample. If the threshold or the model was tuned on the same cases, expect worse results on new data; evaluate on a held-out set.',
    ],
    next: [
      m.recall.est < m.precision.est ? 'Recall is the weaker side: if missed positives are costly, lower the threshold and check how precision changes on the PR curve.' : 'Precision is the weaker side: if false alarms are costly (alarm fatigue), raise the threshold and check recall on the PR curve.',
      'Look at the false negatives and false positives themselves: patterns in them are the quickest route to a better model or a clearer rule.',
    ],
    report: `On ${intText(cm.N)} labelled cases (${intText(pos)} positive), the classifier had precision ${pctText(m.precision.est, 1)} (95% CI ${pctText(m.precision.lo, 1)} to ${pctText(m.precision.hi, 1)}), recall ${pctText(m.recall.est, 1)} (${pctText(m.recall.lo, 1)} to ${pctText(m.recall.hi, 1)}), F1 ${fmt(m.f1.est, 2)} and MCC ${fmt(m.mcc.est, 2)}${auc ? `; AUC was ${fmt(auc.auc, 3)} (DeLong 95% CI ${fmt(auc.lo, 3)} to ${fmt(auc.hi, 3)})` : ''}.`,
  };
}
export { F as METRICS };
