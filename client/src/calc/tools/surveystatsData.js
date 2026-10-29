// Pasted survey data for the survey statistics tools: reading a table with a header row (tab, comma or semicolon
// separated, straight from Excel or Google Sheets) and typing each column with the same rules as Cluster to personas
// (imported from cluster.js, not copied), plus the seeded example datasets behind each tool's "Load example" button.
import { parseTable, guessColumns, prepare, isMissing } from '../cluster.js';
import { rng, normalRng } from './surveystatsMath.js';

export { parseTable, guessColumns, isMissing };

// Read pasted text: the table and each column's guessed type (continuous, ordinal, nominal or ignore).
export function readTable(text) {
  const table = parseTable(text);
  const cols = table.headers.length ? guessColumns(table) : [];
  return { table, cols };
}
export const isNumericCol = (c) => c && (c.type === 'continuous' || c.type === 'ordinal');

// Numeric values for the chosen columns, complete cases only (listwise deletion). Ordinal columns with word labels
// ("Agree", "Very satisfied") are scored 1, 2, 3 … in their order; number-labelled ones keep their numbers.
export function numericData(table, cols, names) {
  const spec = names.map((nm) => cols.find((c) => c.name === nm)).filter(isNumericCol).map((c) => ({ name: c.name, index: c.index, type: c.type, levels: c.levels }));
  if (!spec.length) return { names: [], X: [], cols: [], n: 0, dropped: table.rows.length, used: [] };
  const prep = prepare(table, spec, 'drop');
  const colsData = prep.feats.map((f) => (f.type === 'ordinal' && !f.numericLevels ? f.x.map((v) => v + 1) : f.x));
  const X = prep.used.map((_, i) => colsData.map((c) => c[i]));
  const cats = prep.feats.map((f) => (f.type === 'ordinal' ? f.pos : null));
  return { names: spec.map((s) => s.name), X, cols: colsData, cats, n: prep.n, dropped: prep.dropped, used: prep.used, types: spec.map((s) => s.type) };
}
// Raw category labels for two or three columns, rows with any missing value dropped.
export function categoricalData(table, idx) {
  const rows = [], dropped = [];
  table.rows.forEach((r, i) => { const v = idx.map((j) => r[j]); if (v.some(isMissing)) dropped.push(i); else rows.push(v.map((x) => String(x).trim())); });
  return { rows, dropped: dropped.length };
}

const toText = (headers, rows) => [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
const cut = (z, th) => { let k = 1; for (const t of th) if (z > t) k++; return k; };
const cholesky = (S) => { const n = S.length, L = S.map(() => new Array(n).fill(0)); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = S[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; } return L; };
const latent = (Phi, z) => { const L = cholesky(Phi), e = Phi.map(() => z()); return L.map((r) => r.reduce((s, v, k) => s + v * e[k], 0)); };

// ── Example 1: a 12-item product experience survey with three factors (ease, trust, appeal) and one weak item ──
export const FA_ITEMS = [
  ['Ease 1: It is easy to find what I need', 0, 0.78], ['Ease 2: I can complete tasks quickly', 0, 0.74], ['Ease 3: The steps are clear', 0, 0.71], ['Ease 4: I rarely need help', 0, 0.62],
  ['Trust 1: I trust it with my data', 1, 0.8], ['Trust 2: The numbers it shows are accurate', 1, 0.72], ['Trust 3: It works when I need it', 1, 0.66], ['Trust 4: The company is honest with me', 1, 0.6],
  ['Appeal 1: It looks attractive', 2, 0.79], ['Appeal 2: It feels modern', 2, 0.73], ['Appeal 3: It is pleasant to use', 2, 0.5, 0, 0.42],
  ['Habit: I use it every day', 0, 0.28],
];
export function exampleFactorSurvey(n = 320, seed = 7) {
  const z = normalRng(seed), u = rng(seed + 1);
  const Phi = [[1, 0.42, 0.38], [0.42, 1, 0.3], [0.38, 0.3, 1]];
  const th = [-1.6, -0.75, 0.15, 1.05];
  const plans = ['Free', 'Pro', 'Team'];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = latent(Phi, z);
    const items = FA_ITEMS.map(([, a, l, b = null, l2 = 0]) => {
      const common = l * f[a] + (b !== null ? l2 * f[b] : 0);
      const h2 = l * l + l2 * l2 + (b !== null ? 2 * l * l2 * Phi[a][b] : 0);
      return cut(common + Math.sqrt(Math.max(0.05, 1 - h2)) * z(), th);
    });
    if (u() < 0.02) items[Math.floor(u() * items.length)] = '';
    rows.push([`R${String(i + 1).padStart(3, '0')}`, plans[Math.floor(u() * 3)], ...items]);
  }
  return toText(['Respondent', 'Plan', ...FA_ITEMS.map((x) => x[0])], rows);
}
// Harman's (1976) eight physical measurements of 305 girls: a classic correlation matrix with published loadings.
export const HARMAN8 = {
  n: 305,
  names: ['Height', 'Arm span', 'Forearm', 'Lower leg', 'Weight', 'Bitrochanteric diameter', 'Chest girth', 'Chest width'],
  R: [
    [1.000, 0.846, 0.805, 0.859, 0.473, 0.398, 0.301, 0.382],
    [0.846, 1.000, 0.881, 0.826, 0.376, 0.326, 0.277, 0.415],
    [0.805, 0.881, 1.000, 0.801, 0.380, 0.319, 0.237, 0.345],
    [0.859, 0.826, 0.801, 1.000, 0.436, 0.329, 0.327, 0.365],
    [0.473, 0.376, 0.380, 0.436, 1.000, 0.762, 0.730, 0.629],
    [0.398, 0.326, 0.319, 0.329, 0.762, 1.000, 0.583, 0.577],
    [0.301, 0.277, 0.237, 0.327, 0.730, 0.583, 1.000, 0.539],
    [0.382, 0.415, 0.345, 0.365, 0.629, 0.577, 0.539, 1.000],
  ],
};
export const harmanText = () => toText(['Variable', ...HARMAN8.names], HARMAN8.R.map((r, i) => [HARMAN8.names[i], ...r.map((v) => v.toFixed(3))]));

// ── Example 2: a technology acceptance survey, four constructs on a 1–7 agreement scale ──
export const SV_CONSTRUCTS = [
  ['Usefulness', ['PU1', 'PU2', 'PU3', 'PU4'], [0.84, 0.81, 0.77, 0.7]],
  ['Ease of use', ['EOU1', 'EOU2', 'EOU3', 'EOU4'], [0.82, 0.79, 0.74, 0.66]],
  ['Trust', ['TR1', 'TR2', 'TR3'], [0.8, 0.76, 0.69]],
  ['Intention', ['INT1', 'INT2', 'INT3'], [0.88, 0.85, 0.8]],
];
export function exampleValiditySurvey(n = 280, seed = 11) {
  const z = normalRng(seed);
  const Phi = [[1, 0.52, 0.41, 0.68], [0.52, 1, 0.33, 0.47], [0.41, 0.33, 1, 0.44], [0.68, 0.47, 0.44, 1]];
  const th = [-2.1, -1.4, -0.7, -0.05, 0.65, 1.4];
  const rows = [];
  for (let i = 0; i < n; i++) {
    const f = latent(Phi, z);
    rows.push(SV_CONSTRUCTS.flatMap(([, items, ls], c) => items.map((_, j) => cut(ls[j] * f[c] + Math.sqrt(1 - ls[j] ** 2) * z(), th))));
  }
  return toText(SV_CONSTRUCTS.flatMap(([, items]) => items), rows);
}
export const exampleMapping = () => SV_CONSTRUCTS.map(([name, items]) => `${name}: ${items.join(', ')}`).join('\n');
// Mode (a): standardised loadings and construct correlations as reported in a paper or by CFA software.
export const SV_LOADINGS_TEXT = 'Usefulness: 0.84, 0.81, 0.77, 0.70\nEase of use: 0.82, 0.79, 0.74, 0.66\nTrust: 0.80, 0.76, 0.69\nIntention: 0.88, 0.85, 0.80';
export const SV_PHI_TEXT = 'Construct\tUsefulness\tEase of use\tTrust\tIntention\nUsefulness\t1\t0.52\t0.41\t0.68\nEase of use\t0.52\t1\t0.33\t0.47\nTrust\t0.41\t0.33\t1\t0.44\nIntention\t0.68\t0.47\t0.44\t1';

// ── Example 3: drivers of likelihood to recommend, seven attributes rated 1–5 ──
export const KD_DRIVERS = [['Ease of use', 0.34, 0.1], ['Speed', 0.12, 0.3], ['Reliability', 0.3, -0.25], ['Customer support', 0.05, -0.55], ['Value for money', 0.24, -0.6], ['Design', 0.06, 0.55], ['Features', 0.14, 0.2]];
export function exampleDrivers(n = 400, seed = 23) {
  const z = normalRng(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const halo = z();
    const d = KD_DRIVERS.map(([, , shift]) => 0.55 * halo + 0.835 * z() + shift);
    const y = KD_DRIVERS.reduce((s, [, b], j) => s + b * d[j], 0) + 0.75 * z();
    const ratings = d.map((v) => cut(v, [-1.7, -0.8, 0.2, 1.2]));
    const ltr = Math.max(0, Math.min(10, Math.round(7.2 + 1.55 * y)));
    const sat = Math.max(1, Math.min(10, Math.round(6.8 + 1.3 * y + 0.4 * z())));
    rows.push([`R${i + 1}`, ltr, sat, ...ratings]);
  }
  return toText(['Respondent', 'Likelihood to recommend (0-10)', 'Overall satisfaction (1-10)', ...KD_DRIVERS.map((x) => x[0])], rows);
}

// ── Example 4: an onboarding experiment readout with a lurking variable (device) and ordinal satisfaction ──
// Desktop: new onboarding 52 of 62 complete set-up, old 300 of 400; mobile: new 150 of 300, old 25 of 65.
export function exampleCrosstab(seed = 5) {
  const u = rng(seed);
  const cells = [['Desktop', 'New', 'Yes', 52], ['Desktop', 'New', 'No', 10], ['Desktop', 'Old', 'Yes', 300], ['Desktop', 'Old', 'No', 100], ['Mobile', 'New', 'Yes', 150], ['Mobile', 'New', 'No', 150], ['Mobile', 'Old', 'Yes', 25], ['Mobile', 'Old', 'No', 40]];
  const rows = [];
  for (const [dev, onb, done, k] of cells) for (let i = 0; i < k; i++) rows.push([dev, onb, done]);
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(u() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const tenure = ['Under 1 month', '1-6 months', '6-12 months', '12+ months'];
  const sat = ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'];
  const plans = ['Free', 'Pro', 'Team'];
  const out = rows.map((r, i) => {
    const t = Math.min(3, Math.floor(u() * 4.2));
    const done = r[2] === 'Yes';
    const s = Math.max(0, Math.min(4, Math.round(1.6 + 0.35 * t + (done ? 0.6 : -0.3) + (u() + u() + u() - 1.5) * 1.6)));
    const p = u() < 0.5 - 0.08 * t ? 0 : u() < 0.6 ? 1 : 2;
    return [`U${1000 + i}`, ...r, plans[p], tenure[t], sat[s]];
  });
  return toText(['User', 'Device', 'Onboarding', 'Completed set-up', 'Plan', 'Tenure', 'Satisfaction'], out);
}
